/** Direct Bézier manipulation. All anchors and the two opposite handles stay fixed.
 * Solve a*dC1 + b*dC2 = delta with the minimum-norm solution, where a,b are
 * the cubic Bernstein weights at the hit parameter. Never accumulate from frames.
 * SVG cubic definitions: https://www.w3.org/TR/SVG/paths.html#PathDataCubicBezierCommands
 */
import {nearestCurve,curvePoints,cubic,dist} from './geometry.js';
const copy=p=>({x:p.x,y:p.y});
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

/** Screen-pixel hit test, scoped to the already edited objects. Caller gives
 * anchors/handles priority. Convex-hull rejection avoids sampling distant edges.
 */
export function pickCurveSegment(shapes,selection,p,scale=1,radius=7){
  if(!valid(p)||!Number.isFinite(scale)||scale<=0)return null;
  const padding=radius/scale;let best=null;
  for(let si=shapes.length-1;si>=0;si--){
    const s=shapes[si];if(!selection.has(s.id)||s.locked||!s.visible)continue;
    s.rings.forEach((r,ri)=>{
      if(r.nodes.length<2)return;
      for(let i=0;i<r.nodes.length-(r.closed?0:1);i++){
        const a=r.nodes[i],b=r.nodes[(i+1)%r.nodes.length],points=curvePoints(a,b);
        if(p.x<Math.min(...points.map(q=>q.x))-padding||p.x>Math.max(...points.map(q=>q.x))+padding||
          p.y<Math.min(...points.map(q=>q.y))-padding||p.y>Math.max(...points.map(q=>q.y))+padding)continue;
        // Do not steal a press on either anchor, including its enlarged hit box.
        if(dist(a,p)*scale<=12||dist(b,p)*scale<=12)continue;
        const hit=nearestCurve({rings:[{closed:false,nodes:[a,b]}]},p);
        if(!hit||hit.distance>padding||hit.t<=1e-6||hit.t>=1-1e-6)continue;
        if(!best||hit.distance<best.distance-1e-8)best={...hit,id:s.id,ringIndex:ri,index:i};
      }
    });
  }
  return best;
}

/** Immutable starting geometry. A straight L is parameterized as a linear cubic
 * only when bent; its hit position is preserved when converting the parameter.
 */
export function beginCurveDrag(a,b,t){
  if(![a,b,a?.in,a?.out,b?.in,b?.out].every(valid)||!Number.isFinite(t)||t<=0||t>=1)
    throw new Error('无效线段，请在两个节点之间拖动。');
  const start=copy(a),end=copy(b),oldOut=copy(a.out),oldIn=copy(b.in);
  const straight=a.out.x===0&&a.out.y===0&&b.in.x===0&&b.in.y===0;
  let out=copy(oldOut),incoming=copy(oldIn);
  if(straight){
    if(dist(a,b)<1e-9)throw new Error('重合端点的零长度线段不能拖动。');
    out={x:(b.x-a.x)/3,y:(b.y-a.y)/3};incoming={x:-out.x,y:-out.y};
    t=t*t*(3-2*t); // zero-handle cubic -> same physical point on a linear cubic
  }
  const u=1-t,w1=3*u*u*t,w2=3*u*t*t,denom=w1*w1+w2*w2;
  if(denom<1e-12)throw new Error('位置太靠近端点，请拖动线段的中间部分。');
  return {start,end,oldOut,oldIn,out,incoming,straight,t,k1:w1/denom,k2:w2/denom};
}

/** Compute only the active two handles. Independent opposite handles deliberately
 * do not move: adjacent segments keep their exact geometry (joins may become corners).
 */
export function curveDragHandles(state,delta){
  if(!valid(delta))throw new Error('拖动坐标无效。');
  const out=delta.x===0&&delta.y===0?copy(state.oldOut):{x:state.out.x+state.k1*delta.x,y:state.out.y+state.k1*delta.y};
  const incoming=delta.x===0&&delta.y===0?copy(state.oldIn):{x:state.incoming.x+state.k2*delta.x,y:state.incoming.y+state.k2*delta.y};
  if(![out,incoming].every(p=>valid(p)&&Math.abs(p.x)<=1e7&&Math.abs(p.y)<=1e7))
    throw new Error('拖动幅度超出坐标预算，请缩小幅度或靠近线段中部操作。');
  return {out,in:incoming};
}

export function draggedCurvePoint(a,b,state){
  if(state.straight&&a.out.x===0&&a.out.y===0&&b.in.x===0&&b.in.y===0)
    return {x:a.x+(b.x-a.x)*state.t,y:a.y+(b.y-a.y)*state.t};
  return cubic(...curvePoints(a,b),state.t);
}

/** Arc cursor: fixed endpoint squares plus a two-way arrow. Embedded SVG needs
 * no network resource. The 14,12 hotspot is on the arc, not its control point.
 */
function makeCurveCursor(active){
  const color=active?'#194da8':'#2868c7';
  const arc='M4 24 Q14 0 24 24',arrows='M28 4 V18 M25 7 L28 4 L31 7 M25 15 L28 18 L31 15';
  const image=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${arc}" stroke="white" stroke-width="4.5"/><path d="${arc}" stroke="${color}" stroke-width="2"/><path d="${arrows}" stroke="white" stroke-width="3.5"/><path d="${arrows}" stroke="${color}" stroke-width="1.5"/></g><g fill="white" stroke="${color}" stroke-width="1.4"><rect x="2" y="22" width="4" height="4"/><rect x="22" y="22" width="4" height="4"/><circle cx="14" cy="12" r="2.4" fill="${active?color:'white'}"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(image)}") 14 12, crosshair`;
}
const CURVE_READY_CURSOR=makeCurveCursor(false),CURVE_ACTIVE_CURSOR=makeCurveCursor(true);
export function curveDragCursor(active=false){return active?CURVE_ACTIVE_CURSOR:CURVE_READY_CURSOR;}
