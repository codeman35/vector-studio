/** Local contour rounding, not a globally error-bounded image fitter.
 * Quadratics are degree-elevated exactly into the editor's cubic handle model.
 * Cubics use circular-fillet tangent handles; straight runs remain straight.
 * Only newly traced contours are processed; existing user artwork is untouched.
 */
import {node,ring,dist,sub,mul,lerp,signedArea} from './geometry.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const numeric=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

export function roundTraceRing(points,options={}) {
  const mode=options.curveType??'polygon';
  if(!['polygon','quadratic','cubic'].includes(mode))throw new Error('不支持的轮廓线条类型。');
  if(!Array.isArray(points)||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('轮廓坐标无效。');
  const clean=[];
  for(const p of points)if(!clean.length||dist(p,clean.at(-1))>1e-8)clean.push({x:p.x,y:p.y});
  if(clean.length>1&&dist(clean[0],clean.at(-1))<=1e-8)clean.pop();
  if(clean.length<3)return ring(clean);
  if(clean.length>50000)throw new Error('轮廓节点过多，请降低描摹尺寸。');
  const strength=clamp(numeric(options.curveSmoothness,60),0,100)/100;
  if(mode==='polygon'||strength===0)return ring(clean);
  const protect=options.preserveCorners!==false;
  const corners=clamp(numeric(options.cornerAngle,50),5,170)*Math.PI/180;
  const result=[];
  const append=p=>{
    if(result.length&&dist(result.at(-1),p)<1e-8)return result.at(-1);
    const n=node(p.x,p.y);result.push(n);return n;
  };
  for(let i=0;i<clean.length;i++) {
    const p=clean[i],prev=clean[(i+clean.length-1)%clean.length],next=clean[(i+1)%clean.length];
    const incoming=sub(p,prev),outgoing=sub(next,p),a=dist(prev,p),b=dist(p,next);
    const turn=Math.acos(clamp((incoming.x*outgoing.x+incoming.y*outgoing.y)/(a*b),-1,1));
    // Exact lines and near-reversals are not rounded. Protected sharp corners
    // keep both the original anchor and its zero handles.
    if(turn<1e-5||turn>Math.PI*.97||(protect&&turn>=corners)) {append(p);continue;}
    const radius=Math.min(a,b)*strength/2;
    if(radius<1e-8){append(p);continue;}
    const entry=lerp(p,prev,radius/a),exit=lerp(p,next,radius/b);
    const left=append(entry),right=node(exit.x,exit.y);
    // For Q(entry,p,exit), C1=entry+2/3(p-entry),
    // C2=exit+2/3(p-exit). Do not clamp each handle independently:
    // that would destroy the exact quadratic equivalence.
    const fraction=mode==='quadratic'?2/3:(4/3)*Math.tan(turn/4)/Math.tan(turn/2);
    left.out=mul(sub(p,entry),fraction);right.in=mul(sub(p,exit),fraction);
    result.push(right);
  }
  if(result.length>1&&dist(result[0],result.at(-1))<1e-8){result[0].in=result.at(-1).in;result.pop();}
  // A degenerate tiny polygon must not disappear or reverse its ring winding.
  // This is a guard, not a proof against all self-intersections of tight artwork.
  if(result.length<3||signedArea(result)*signedArea(clean)<=0)return ring(clean);
  return {closed:true,nodes:result};
}
