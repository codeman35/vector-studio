/** Flat geometry + an explicit group tree. Geometry is never fused by grouping. */
const nextId=()=>globalThis.crypto?.randomUUID?.()||`g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function groupMap(doc){return new Map((doc.groups||[]).map(g=>[g.id,g]));}
export function ancestors(doc,shape){
  const map=groupMap(doc),out=[],seen=new Set();let id=shape.groupId;
  while(id&&map.has(id)&&!seen.has(id)){seen.add(id);out.push(id);id=map.get(id).parentId;}
  return out;
}
export function rootId(doc,shape){return ancestors(doc,shape).at(-1)||shape.id;}
export function members(doc,id){return doc.shapes.filter(s=>s.id===id||ancestors(doc,s).includes(id));}
export function expandSelection(doc,ids){
  const selected=new Set(ids),roots=new Set(doc.shapes.filter(s=>selected.has(s.id)).map(s=>rootId(doc,s)));
  return new Set(doc.shapes.filter(s=>roots.has(rootId(doc,s))).map(s=>s.id));
}
/** Entries preserve back-to-front paint order. Group children are contiguous. */
export function entries(doc,parentId=null){
  const map=groupMap(doc),seen=new Set(),result=[];
  for(const s of doc.shapes){
    const chain=ancestors(doc,s),index=parentId?chain.indexOf(parentId):chain.length;
    if(parentId&&index<0)continue;
    const id=index>0?chain[index-1]:s.id;
    if(!seen.has(id)){seen.add(id);result.push(map.get(id)||s);}
  }
  return result;
}
export function pruneGroups(doc){
  const used=new Set(doc.shapes.flatMap(s=>ancestors(doc,s)));
  doc.groups=(doc.groups||[]).filter(g=>used.has(g.id));
  const map=groupMap(doc);for(const s of doc.shapes)if(s.groupId&&!map.has(s.groupId))delete s.groupId;
}
export function createGroup(doc,ids,name='群组'){
  const all=expandSelection(doc,ids),list=doc.shapes.filter(s=>all.has(s.id));
  const roots=new Set(list.map(s=>rootId(doc,s)));
  if(roots.size<2)throw new Error('请先选择至少两个独立对象或群组。');
  if(list.some(s=>s.locked||!s.visible))throw new Error('群组包含隐藏或锁定对象，请先显示并解锁。');
  if(list.some(s=>ancestors(doc,s).length>=16))throw new Error('群组最多嵌套 16 层。');
  const map=groupMap(doc),id=nextId();doc.groups??=[];
  for(const root of roots){if(map.has(root))map.get(root).parentId=id;else doc.shapes.find(s=>s.id===root).groupId=id;}
  doc.groups.push({id,name:String(name).slice(0,100),parentId:null});
  // Bring the selected siblings together at their former frontmost position.
  const top=Math.max(...list.map(s=>doc.shapes.indexOf(s)));
  const before=doc.shapes.slice(0,top+1).filter(s=>!all.has(s.id));
  doc.shapes=[...before,...list,...doc.shapes.slice(top+1)];
  return all;
}
export function selectedGroups(doc,ids){
  const set=new Set(ids);
  const full=(doc.groups||[]).filter(g=>{const list=members(doc,g.id);return list.length&&list.every(s=>set.has(s.id));});
  const fullIds=new Set(full.map(g=>g.id));
  return full.filter(g=>{let id=g.parentId,map=groupMap(doc);while(id){if(fullIds.has(id))return false;id=map.get(id)?.parentId;}return true;});
}
export function ungroup(doc,ids){
  const list=selectedGroups(doc,ids);if(!list.length)throw new Error('请先选中一个完整群组。');
  for(const g of list){
    for(const s of doc.shapes)if(s.groupId===g.id){if(g.parentId)s.groupId=g.parentId;else delete s.groupId;}
    for(const child of doc.groups)if(child.parentId===g.id)child.parentId=g.parentId||null;
    doc.groups=doc.groups.filter(x=>x.id!==g.id);
  }
  return new Set(ids);
}
export function duplicateSelection(doc,ids,offset={x:16,y:16}){
  const set=expandSelection(doc,ids),originals=doc.shapes.filter(s=>set.has(s.id));
  if(!originals.length)return new Set();
  if(originals.some(s=>s.locked||!s.visible))throw new Error('请先显示并解锁整个群组。');
  const nodes=s=>s.rings.reduce((n,r)=>n+r.nodes.length,0);
  if(doc.shapes.length+originals.length>1500||[...doc.shapes,...originals].reduce((n,s)=>n+nodes(s),0)>50000)throw new Error('复制后超出对象或节点数量限制。');
  const groupIds=new Set(originals.flatMap(s=>ancestors(doc,s))),mapping=new Map([...groupIds].map(id=>[id,nextId()]));
  const groups=(doc.groups||[]).filter(g=>groupIds.has(g.id)).map(g=>({...g,id:mapping.get(g.id),name:g.name+' 副本',parentId:mapping.get(g.parentId)||null}));
  const copies=originals.map(s=>{const c=structuredClone(s);c.id=nextId();c.name=(s.name+' 副本').slice(0,100);if(c.groupId)c.groupId=mapping.get(c.groupId);for(const r of c.rings)for(const n of r.nodes){n.x+=offset.x;n.y+=offset.y;}return c;});
  doc.groups=[...(doc.groups||[]),...groups];doc.shapes.push(...copies);return new Set(copies.map(s=>s.id));
}
/** Reorder root entities as blocks; never tear a group apart. */
export function reorderSelection(doc,ids,direction,toEdge=false){
  const set=expandSelection(doc,ids),roots=new Set(doc.shapes.filter(s=>set.has(s.id)).map(s=>rootId(doc,s)));
  const blocks=entries(doc).map(e=>({id:e.id,shapes:members(doc,e.id)}));
  if(toEdge){const a=blocks.filter(b=>!roots.has(b.id)),b=blocks.filter(b=>roots.has(b.id));doc.shapes=(direction>0?[...a,...b]:[...b,...a]).flatMap(b=>b.shapes);}
  else{
    const indices=direction>0?Array.from(blocks.keys()).reverse():Array.from(blocks.keys());
    for(const i of indices){const j=i+direction;if(j>=0&&j<blocks.length&&roots.has(blocks[i].id)&&!roots.has(blocks[j].id))[blocks[i],blocks[j]]=[blocks[j],blocks[i]];}
    doc.shapes=blocks.flatMap(b=>b.shapes);
  }
  return set;
}
/** Validate imported group topology and contiguity, rejecting ambiguous stacks. */
export function validateGroups(input,shapes){
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>1500)throw new Error('群组数量无效。');
  const shapeIds=new Set(shapes.map(s=>s.id)),map=new Map();
  const groups=input.map(g=>{
    if(!g||typeof g.id!=='string'||!/^[-\w]{1,80}$/.test(g.id)||map.has(g.id)||shapeIds.has(g.id))throw new Error('群组标识无效或重复。');
    const item={id:g.id,name:String(g.name||'群组').slice(0,100),parentId:g.parentId||null};map.set(g.id,item);return item;
  });
  for(const g of groups){const seen=new Set([g.id]);let id=g.parentId;while(id){if(!map.has(id)||seen.has(id)||seen.size>=16)throw new Error('群组层级无效、循环或超过 16 层。');seen.add(id);id=map.get(id).parentId;}}
  const d={shapes,groups};for(const s of shapes)if(s.groupId&&!map.has(s.groupId))throw new Error('对象引用了不存在的群组。');
  for(const g of groups){const positions=shapes.flatMap((s,i)=>ancestors(d,s).includes(g.id)?[i]:[]);if(positions.length&&positions.at(-1)-positions[0]+1!==positions.length)throw new Error('群组对象叠放不连续，无法安全导入。');}
  pruneGroups(d);return d.groups;
}
/** Replace operands at their common group's end, without interleaving other groups. */
export function replaceShapes(doc,ids,replacements){
  const set=new Set(ids),old=doc.shapes.filter(s=>set.has(s.id));if(!old.length)return;
  const chains=old.map(s=>ancestors(doc,s).reverse());let common=0;
  while(common<chains[0].length&&chains.every(c=>c[common]===chains[0][common]))common++;
  const parent=chains[0][common-1]||null,roots=new Set(old.map(s=>rootId(doc,s)));
  let end=-1;doc.shapes.forEach((s,i)=>{if(parent?ancestors(doc,s).includes(parent):roots.has(rootId(doc,s)))end=i;});
  for(const s of replacements){if(parent)s.groupId=parent;else delete s.groupId;}
  const before=doc.shapes.slice(0,end+1).filter(s=>!set.has(s.id)),after=doc.shapes.slice(end+1).filter(s=>!set.has(s.id));
  doc.shapes=[...before,...replacements,...after];pruneGroups(doc);
}
