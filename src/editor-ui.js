import {bounds,pathData} from './geometry.js';
import {entries,members,expandSelection,rootId,selectedGroups} from './groups.js';
const NS='http://www.w3.org/2000/svg',collapsed=new Set();
let lastLayerClick={id:null,time:0,x:0,y:0};
function svg(tag,attrs={}){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
export function thumbnail(shapes){
  const boxes=shapes.map(bounds),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
  const w=Math.max(1,right-x),h=Math.max(1,bottom-y),pad=Math.max(w,h)*.09+1;
  const preview=svg('svg',{viewBox:`${x-pad} ${y-pad} ${w+2*pad} ${h+2*pad}`,class:'layer-thumbnail','aria-hidden':'true'});
  for(const s of shapes.slice(0,200))preview.append(svg('path',{d:pathData(s),fill:s.fill,'fill-rule':'evenodd',stroke:s.stroke,'stroke-width':s.strokeWidth,'stroke-linecap':'round','stroke-linejoin':'round'}));
  return preview;
}
export function renderLayerTree(doc,selection,{onSelect,onEdit,onChange,onContext,onNotice}){
  const list=document.getElementById('layer-list');list.replaceChildren();
  document.getElementById('layer-count').textContent=`${doc.shapes.length} / ${(doc.groups||[]).length} 组`;
  if(!doc.shapes.length){const p=document.createElement('p');p.className='layer-empty';p.textContent='描摹或绘图后，这里显示对象缩略图。';list.append(p);return;}
  function walk(parent=null,depth=0){
    for(const e of entries(doc,parent).reverse()){
      const group=!e.rings,children=group?members(doc,e.id):[e],ids=children.map(s=>s.id);
      const row=document.createElement('div');row.className='layer-row '+(ids.every(id=>selection.has(id))?'selected':'');row.dataset.layerId=e.id;row.style.paddingLeft=`${5+Math.min(depth,5)*12}px`;row.setAttribute('role','treeitem');row.setAttribute('aria-selected',String(ids.every(id=>selection.has(id))));
      if(group){const toggle=document.createElement('button');toggle.className='group-toggle';toggle.textContent=collapsed.has(e.id)?'▸':'▾';toggle.title=collapsed.has(e.id)?'展开群组':'折叠群组';toggle.setAttribute('aria-expanded',String(!collapsed.has(e.id)));toggle.onclick=event=>{event.stopPropagation();if(collapsed.has(e.id))collapsed.delete(e.id);else collapsed.add(e.id);renderLayerTree(doc,selection,{onSelect,onEdit,onChange,onContext,onNotice});};row.append(toggle);}
      row.append(thumbnail(children));
      const name=document.createElement('span');name.className='layer-name';name.textContent=(group?'▧ ':'')+e.name;name.title=e.name+(group?` · ${children.length} 个对象`:'');
      const rename=()=>{const text=prompt(group?'群组名称':'对象名称',e.name);if(text!==null){e.name=text.slice(0,100)||'未命名';onChange('已重命名');}};
      const button=(label,title,fn)=>{const b=document.createElement('button');b.textContent=label;b.title=title;b.onclick=event=>{event.stopPropagation();fn();};return b;};
      const allVisible=children.every(s=>s.visible),allLocked=children.every(s=>s.locked);
      const eye=button(allVisible?'◉':'○',allVisible?'隐藏':'显示',()=>{children.forEach(s=>{s.visible=!allVisible;selection.delete(s.id);});onChange('已切换可见性');});
      const lock=button(allLocked?'锁':'解',allLocked?'解锁':'锁定',()=>{children.forEach(s=>{s.locked=!allLocked;selection.delete(s.id);});onChange('已切换锁定状态');});
      if(!allVisible)name.classList.add('off');row.append(name,eye,lock);
      row.onclick=event=>{const now=performance.now(),twice=lastLayerClick.id===e.id&&now-lastLayerClick.time<400&&Math.hypot(event.clientX-lastLayerClick.x,event.clientY-lastLayerClick.y)<6;lastLayerClick={id:e.id,time:twice?0:now,x:event.clientX,y:event.clientY};if(twice&&event.target===name){rename();return;}if(children.some(s=>s.locked||!s.visible)){onNotice('请先显示并解锁此对象或群组。');return;}if(twice&&!group)onEdit(e.id);else onSelect(ids,event.shiftKey);};
      row.oncontextmenu=event=>{event.preventDefault();onContext(event,ids);};list.append(row);
      if(group&&!collapsed.has(e.id))walk(e.id,depth+1);
    }
  }walk();
}
export function capabilities(doc,selection,nodeCount=0,busy=false){
  const visible=doc.shapes.filter(s=>s.visible&&!s.locked),list=visible.filter(s=>selection.has(s.id)),closed=s=>s.rings.length&&s.rings.every(r=>r.closed);
  const all=expandSelection(doc,list.map(s=>s.id)),rootCount=new Set(doc.shapes.filter(s=>all.has(s.id)).map(s=>rootId(doc,s))).size;
  const canGroup=rootCount>=2&&!doc.shapes.some(s=>all.has(s.id)&&(s.locked||!s.visible));
  const state={node:!!visible.length,add:!!visible.length,knife:visible.some(closed),scissors:visible.some(s=>s.rings.length===1),fill:visible.some(closed),
    export:doc.shapes.some(s=>s.visible),selection:!!list.length,boolean:list.length>=2&&list.every(closed),group:canGroup,ungroup:!!selectedGroups(doc,list.map(s=>s.id)).length,
    join:list.length===2&&list.every(s=>s.rings.length===1&&!s.rings[0].closed),close:list.some(s=>s.rings.some(r=>!r.closed&&r.nodes.length>=3)),
    nodes:!!list.length,nodeSelected:nodeCount>0,split:list.some(s=>closed(s)&&s.rings.length>1)};
  if(busy)for(const key of Object.keys(state))state[key]=false;return state;
}
export function createContextMenu(){
  const el=document.getElementById('context-menu');let previous=null;
  function close(restoreFocus=false){el.hidden=true;el.replaceChildren();if(restoreFocus)previous?.focus?.();}
  function show(event,items){
    event.preventDefault();previous=document.activeElement;el.replaceChildren();
    for(const item of items){if(!item){const hr=document.createElement('div');hr.className='context-separator';el.append(hr);continue;}
      const b=document.createElement('button');b.type='button';b.role='menuitem';b.dataset.command=item.id;b.disabled=item.enabled===false;
      const label=document.createElement('span');label.textContent=item.label;const shortcut=document.createElement('kbd');shortcut.textContent=item.shortcut||'';b.append(label,shortcut);
      b.onclick=()=>{close();item.action();};el.append(b);
    }
    el.hidden=false;el.style.left='0px';el.style.top='0px';const r=el.getBoundingClientRect();
    el.style.left=`${Math.max(6,Math.min(event.clientX,innerWidth-r.width-8))}px`;el.style.top=`${Math.max(6,Math.min(event.clientY,innerHeight-r.height-8))}px`;
    el.querySelector('button:not(:disabled)')?.focus();
  }
  document.addEventListener('pointerdown',e=>{if(!el.contains(e.target))close();},true);
  document.addEventListener('keydown',e=>{
    if(el.hidden)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(true);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const buttons=[...el.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  },true);
  window.addEventListener('blur',()=>close());window.addEventListener('resize',()=>close());return {show,close};
}
