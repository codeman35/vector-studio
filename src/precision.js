/** Non-destructive layout, exact path bounds, exact-color selection and point snapping.
 * Layout moves anchors only; it never flattens curves, fuses groups or edits handles.
 * Coordinates are document pixels. Snap radius is supplied in SCREEN pixels.
 */
const EPS=1e-9;
const editable=s=>s.visible!==false&&!s.locked;
const point=(x,y)=>({x,y});
function extrema(a,b,c,d){
  // Derivative / 3 = A*t*t + B*t + C.
  const A=-a+3*b-3*c+d,B=2*(a-2*b+c),C=b-a;
  if(Math.abs(A)<EPS)return Math.abs(B)<EPS?[]:[-C/B];
  const disc=B*B-4*A*C;if(disc<0)return [];
  const q=-.5*(B+(B<0?-1:1)*Math.sqrt(disc));
  return Math.abs(q)<EPS?[-B/(2*A)]:[q/A,C/q];
}
const evaluate=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
export function pathBounds(shape){
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const include=(x,y)=>{left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);};
  for(const r of shape.rings){
    for(const n of r.nodes)include(n.x,n.y);
    for(let i=0;i<r.nodes.length-(r.closed?0:1);i++){
      const a=r.nodes[i],b=r.nodes[(i+1)%r.nodes.length];
      const xs=[a.x,a.x+a.out.x,b.x+b.in.x,b.x],ys=[a.y,a.y+a.out.y,b.y+b.in.y,b.y];
      for(const t of [...extrema(...xs),...extrema(...ys)])if(t>0&&t<1)include(evaluate(...xs,t),evaluate(...ys,t));
    }
  }
  if(!Number.isFinite(left+top+right+bottom))throw new Error('选中对象没有有效路径边界。');
  return {x:left,y:top,width:right-left,height:bottom-top};
}
function combinedBounds(shapes){
  const boxes=shapes.map(pathBounds),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
/** A fully selected group is one unit. A partial selection never pulls in siblings. */
export function layoutUnits(doc,ids){
  const selected=new Set(ids),parents=new Map((doc.groups||[]).map(g=>[g.id,g.parentId])),chains=new Map(),totals=new Map(),counts=new Map();
  for(const s of doc.shapes){
    const chain=[];let g=s.groupId;
    while(g&&parents.has(g)&&chain.length<16&&!chain.includes(g)){chain.push(g);g=parents.get(g);}
    chains.set(s.id,chain);
    for(const id of chain){totals.set(id,(totals.get(id)||0)+1);if(selected.has(s.id))counts.set(id,(counts.get(id)||0)+1);}
  }
  const units=new Map();
  for(const s of doc.shapes){
    if(!selected.has(s.id))continue;
    if(!editable(s))throw new Error('所选对象包含隐藏或锁定内容，请先取消选择或解锁。');
    const full=chains.get(s.id).filter(id=>counts.get(id)===totals.get(id)),id=full.at(-1)||s.id;
    if(!units.has(id))units.set(id,{id,shapes:[]});units.get(id).shapes.push(s);
  }
  return [...units.values()];
}
export function layoutPlan(doc,ids,command,{target='selection',spacing='gap'}={}){
  const align=['left','center-x','right','top','center-y','bottom'];
  if(![...align,'distribute-x','distribute-y'].includes(command))throw new Error('未知对齐操作。');
  if(!['selection','artboard'].includes(target)||!['gap','center'].includes(spacing))throw new Error('无效对齐选项。');
  const units=layoutUnits(doc,ids).map(u=>({...u,box:combinedBounds(u.shapes)}));
  const distributing=command.startsWith('distribute');
  const required=distributing?3:target==='artboard'?1:2;
  if(units.length<required)throw new Error(`此操作至少需要 ${required} 个独立对象或完整群组。`);
  const moves=[];
  const move=(unit,dx,dy)=>{if(!Number.isFinite(dx+dy))throw new Error('计算位置无效。');for(const s of unit.shapes)moves.push({id:s.id,dx,dy});};
  if(distributing){
    const axis=command==='distribute-x'?'x':'y',size=axis==='x'?'width':'height';
    const center=u=>u.box[axis]+u.box[size]/2;
    units.sort((a,b)=>(spacing==='center'?center(a)-center(b):a.box[axis]-b.box[axis]));
    const first=units[0],last=units.at(-1);
    if(spacing==='center'){
      const step=(center(last)-center(first))/(units.length-1);
      units.slice(1,-1).forEach((u,i)=>{const delta=center(first)+step*(i+1)-center(u);move(u,axis==='x'?delta:0,axis==='y'?delta:0);});
    }else{
      const total=units.reduce((n,u)=>n+u.box[size],0),gap=(last.box[axis]+last.box[size]-first.box[axis]-total)/(units.length-1);
      if(gap<-EPS)throw new Error('首尾之间空间不足，无法均匀留空。请拉开首尾对象，或改用「中心等距」。');
      let cursor=first.box[axis]+first.box[size]+Math.max(0,gap);
      for(const u of units.slice(1,-1)){const delta=cursor-u.box[axis];move(u,axis==='x'?delta:0,axis==='y'?delta:0);cursor+=u.box[size]+Math.max(0,gap);}
    }
  }else{
    const box=target==='artboard'?{x:0,y:0,width:doc.width,height:doc.height}:combinedBounds(units.flatMap(u=>u.shapes));
    for(const u of units){let dx=0,dy=0;const b=u.box;
      if(command==='left')dx=box.x-b.x;if(command==='center-x')dx=box.x+box.width/2-b.x-b.width/2;if(command==='right')dx=box.x+box.width-b.x-b.width;
      if(command==='top')dy=box.y-b.y;if(command==='center-y')dy=box.y+box.height/2-b.y-b.height/2;if(command==='bottom')dy=box.y+box.height-b.y-b.height;
      move(u,dx,dy);
    }
  }
  return moves.filter(m=>Math.abs(m.dx)>EPS||Math.abs(m.dy)>EPS);
}
export function applyLayout(doc,plan){
  const map=new Map(doc.shapes.map(s=>[s.id,s]));
  // Validate the entire transaction before mutation.
  for(const m of plan){const s=map.get(m.id);if(!s||!editable(s)||!Number.isFinite(m.dx+m.dy))throw new Error('对象状态已变化，请重新选择。');
    for(const r of s.rings)for(const n of r.nodes)if(Math.abs(n.x+m.dx)>1e6||Math.abs(n.y+m.dy)>1e6)throw new Error('对齐后超出坐标范围。');}
  for(const m of plan)for(const r of map.get(m.id).rings)for(const n of r.nodes){n.x+=m.dx;n.y+=m.dy;}
}
export function colorKey(value){
  const s=String(value||'none').trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(s)?'#'+[...s.slice(1)].map(c=>c+c).join(''):s;
}
export function selectionColor(doc,ids,property='fill'){
  if(!['fill','stroke'].includes(property))throw new Error('未知颜色属性。');
  const set=new Set(ids),shapes=doc.shapes.filter(s=>set.has(s.id)&&editable(s));
  if(!shapes.length)return null;
  if(property==='stroke'&&shapes.some(s=>colorKey(s.stroke)==='none'||s.strokeWidth<=0))return null;
  const colors=new Set(shapes.map(s=>colorKey(s[property])));
  return colors.size===1?[...colors][0]:null;
}
export function sameColorIds(doc,ids,property='fill'){
  const key=selectionColor(doc,ids,property);
  if(key===null)throw new Error(property==='fill'?'请先选择一个对象，或填充色相同的多个对象。':'请先选择有描边且描边色一致的对象。');
  return new Set(doc.shapes.filter(s=>editable(s)&&colorKey(s[property])===key&&(property!=='stroke'||s.strokeWidth>0)).map(s=>s.id));
}
export function anchorTargets(doc,excluded=new Set()){
  const points=[];
  for(const s of doc.shapes)if(editable(s))s.rings.forEach((r,ri)=>r.nodes.forEach((n,ni)=>{
    const key=`${s.id}|${ri}|${ni}`;if(!excluded.has(key))points.push({x:n.x,y:n.y,key,id:s.id,endpoint:!r.closed&&(ni===0||ni===r.nodes.length-1)});
  }));
  return points;
}
/** Spatial buckets bound each lookup; a grid indexes targets but does NOT snap to a grid. */
export function snapIndex(points,scale=1,radius=8){
  if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(radius)||radius<=0)throw new Error('无效吸附距离。');
  const cell=radius/scale,buckets=new Map(),key=(x,y)=>`${x},${y}`;
  for(const p of points){const k=key(Math.floor(p.x/cell),Math.floor(p.y/cell));if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(p);}
  return {nearest(p,{endpointsOnly=false}={}){
    const cx=Math.floor(p.x/cell),cy=Math.floor(p.y/cell);let best=null,distance=cell*cell+EPS;
    for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const q of buckets.get(key(x,y))||[]){
      if(endpointsOnly&&!q.endpoint)continue;const d=(p.x-q.x)**2+(p.y-q.y)**2;
      if(d<=cell*cell+EPS&&(!best||d<distance-EPS||Math.abs(d-distance)<=EPS&&q.endpoint&&!best.endpoint)){distance=d;best=q;}
    }
    return best?{...best,position:point(best.x,best.y),distance:Math.sqrt(distance)*scale}:null;
  }};
}
