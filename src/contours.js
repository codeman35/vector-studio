/** Compound-path selection is separate from node deletion. Does not flatten stored curves. */
import {flattenRing,signedArea,pointInRing,dist,add} from './geometry.js';
export function contourInfo(shape){
  const info=shape.rings.map((ring,index)=>{const points=ring.closed?flattenRing(ring,.25):[];
    let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;
    for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);r=Math.max(r,p.x);b=Math.max(b,p.y);}
    return {index,closed:ring.closed,points,area:Math.abs(signedArea(points)),parent:-1,depth:0,hole:false,box:{x,y,r,b}};
  });
  const sorted=info.filter(r=>r.closed&&r.points.length>=3).slice().sort((a,b)=>b.area-a.area);
  for(let i=0;i<sorted.length;i++){
    const item=sorted[i],p=item.points[0];let min=Infinity;
    for(let j=0;j<i;j++){const other=sorted[j],b=other.box;
      if(other.area>=min||other.area<=item.area+1e-8||p.x<b.x||p.x>b.r||p.y<b.y||p.y>b.b)continue;
      if(pointInRing(p,other.points)){min=other.area;item.parent=other.index;}
    }
    item.depth=item.parent<0?0:info[item.parent].depth+1;item.hole=!!(item.depth%2);
  }
  return info;
}
export function removeContours(shape,indices){
  const selected=new Set(indices);if(!selected.size)return false;
  if([...selected].some(i=>!Number.isInteger(i)||!shape.rings[i]))throw new Error('轮廓已变化，请重新选择。');
  const info=contourInfo(shape),remove=new Set(selected);
  // Removing an enclosing ring also removes its descendants, not other components.
  for(const entry of info){let parent=entry.parent;while(parent>=0){if(selected.has(parent)){remove.add(entry.index);break;}parent=info[parent].parent;}}
  shape.rings=shape.rings.filter((_,i)=>!remove.has(i));return true;
}
export function holeAt(shapes,p){
  for(let i=shapes.length-1;i>=0;i--){const shape=shapes[i];if(!shape.visible||shape.locked||shape.rings.length<2||shape.fill==='none')continue;
    const inside=contourInfo(shape).filter(r=>r.closed&&p.x>=r.box.x&&p.x<=r.box.r&&p.y>=r.box.y&&p.y<=r.box.b&&pointInRing(p,r.points)).sort((a,b)=>b.depth-a.depth);
    if(inside[0]?.hole)return {id:shape.id,ringIndex:inside[0].index};
  }return null;
}
/** Hit distances are screen pixels. Nearest anchor wins over an overlapping square. */
export function pickEditorPoint(shapes,selection,nodeSelection,p,scale=1){
  const z=Math.max(.0001,Math.abs(scale));let anchor=null,handle=null;
  for(const shape of shapes){if(!selection.has(shape.id)||shape.locked||!shape.visible)continue;
    shape.rings.forEach((ring,ri)=>ring.nodes.forEach((n,ni)=>{const key=`${shape.id}|${ri}|${ni}`,d=dist(n,p)*z;
      if(d<=12&&(!anchor||d<anchor.distance))anchor={key,distance:d};
      if(nodeSelection.has(key)||ring.nodes.length<100)for(const side of ['in','out']){
        const h=add(n,n[side]);if(dist(n,h)<1e-5)continue;const hd=dist(h,p)*z;
        if(hd<=10&&(!handle||hd<handle.distance))handle={key:`${key}|${side}`,distance:hd};
      }
    }));
  }
  if(anchor&&(!handle||anchor.distance<=handle.distance))return {node:anchor.key};
  return handle?{handle:handle.key}:{};
}
