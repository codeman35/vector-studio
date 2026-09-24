/** Local contour rounding, not a globally error-bounded image fitter.
 * Quadratics are degree-elevated exactly into the editor's cubic handle model.
 * Cubics use circular-fillet tangent handles; straight runs remain straight.
 * Only newly traced contours are processed; existing user artwork is untouched.
 */
import {node,ring,dist,sub,mul,lerp,signedArea,flattenRing,pointInRing} from './geometry.js';
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

/** Adaptive least-squares fitting of CONTIGUOUS spans, not one fillet per corner.
 * New implementation: chord parameters, tangent-constrained cubic normal
 * equations, Newton parameter refinement, and split at the worst sample.
 * Pixel samples / flattening checks are numerical guards, NOT a global
 * Hausdorff or print-production accuracy guarantee. Q is elevated exactly.
 */
const addV=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
const dotV=(a,b)=>a.x*b.x+a.y*b.y;
const unit=v=>{const l=Math.hypot(v.x,v.y);return l>1e-12?mul(v,1/l):{x:1,y:0};};
function evalBezier(c,t){const u=1-t;return {x:u*u*u*c[0].x+3*u*u*t*c[1].x+3*u*t*t*c[2].x+t*t*t*c[3].x,y:u*u*u*c[0].y+3*u*u*t*c[1].y+3*u*t*t*c[2].y+t*t*t*c[3].y};}
function chordParameters(p){const u=[0];for(let i=1;i<p.length;i++)u.push(u.at(-1)+dist(p[i-1],p[i]));const total=u.at(-1)||1;return u.map(v=>v/total);}
function tangentAt(p,i){
  const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];
  return unit(addV(unit(sub(b,a)),unit(sub(c,b))));
}
function solveSpan(p,u,left,right,mode){
  const a=p[0],b=p.at(-1),length=dist(a,b);
  if(mode==='quadratic'){
    let denom=0,q={x:0,y:0};
    for(let i=1;i<p.length-1;i++){
      const t=u[i],v=1-t,k=2*t*v;denom+=k*k;
      q=addV(q,mul(sub(p[i],addV(mul(a,v*v),mul(b,t*t))),k));
    }
    q=denom>1e-12?mul(q,1/denom):lerp(a,b,.5);
    return [a,lerp(a,q,2/3),lerp(b,q,2/3),b];
  }
  let aa=0,ab=0,bb=0,ar=0,br=0;
  for(let i=0;i<p.length;i++){
    const t=u[i],v=1-t,k1=3*v*v*t,k2=3*v*t*t;
    const A=mul(left,k1),B=mul(right,k2);
    const r=sub(p[i],addV(mul(a,v*v*v+k1),mul(b,k2+t*t*t)));
    aa+=dotV(A,A);ab+=dotV(A,B);bb+=dotV(B,B);ar+=dotV(A,r);br+=dotV(B,r);
  }
  const det=aa*bb-ab*ab;let x=length/3,y=x;
  if(Math.abs(det)>1e-12){x=(ar*bb-br*ab)/det;y=(br*aa-ar*ab)/det;}
  if(!Number.isFinite(x+y)||x<length*1e-6||y<length*1e-6||x>length*3||y>length*3)x=y=length/3;
  return [a,addV(a,mul(left,x)),addV(b,mul(right,y)),b];
}
function improveParameters(p,c,u){
  const next=[0];
  for(let i=1;i<p.length-1;i++){
    const t=u[i],v=1-t,point=evalBezier(c,t),r=sub(point,p[i]);
    const d=addV(addV(mul(sub(c[1],c[0]),3*v*v),mul(sub(c[2],c[1]),6*v*t)),mul(sub(c[3],c[2]),3*t*t));
    const dd=addV(mul(addV(sub(c[2],mul(c[1],2)),c[0]),6*v),mul(addV(sub(c[3],mul(c[2],2)),c[1]),6*t));
    const denom=dotV(d,d)+dotV(r,dd);
    next.push(clamp(t-(Math.abs(denom)>1e-12?dotV(r,d)/denom:0),0,1));
  }
  next.push(1);return next.every((v,i)=>i===0||v>next[i-1])?next:u;
}
function spanError(p,c,u){
  let max=0,index=Math.floor(p.length/2);
  for(let i=1;i<p.length-1;i++){const error=dist(p[i],evalBezier(c,u[i]));if(error>max){max=error;index=i;}}
  // Reverse samples catch overshoot between input points. The reference is
  // the traced polyline, not an unavailable high-resolution original curve.
  const probes=Math.min(160,Math.max(12,p.length*2));
  for(let j=1;j<probes;j++){
    const q=evalBezier(c,j/probes);let closest=Infinity;
    for(let i=1;i<p.length;i++)closest=Math.min(closest,segmentDistance(q,p[i-1],p[i]));
    max=Math.max(max,closest);
  }
  return {max,index};
}
function segmentDistance(p,a,b){const d=sub(b,a),l=dotV(d,d);return dist(p,lerp(a,b,l?clamp(dotV(sub(p,a),d)/l,0,1):0));}
function fitSpan(points,left,right,error,mode){
  const result=[],stack=[{p:points,left,right,depth:0}];
  while(stack.length){
    const job=stack.pop(),p=job.p,a=p[0],b=p.at(-1),direction=unit(sub(b,a));
    const straight=p.every(v=>segmentDistance(v,a,b)<=Math.min(.12,error*.25));
    if(straight&&(p.length===2||dotV(direction,job.left)>.985&&dotV(direction,mul(job.right,-1))>.985)){
      result.push([a,a,b,b]);continue;
    }
    let u=chordParameters(p),c=solveSpan(p,u,job.left,job.right,mode),quality=spanError(p,c,u);
    for(let i=0;i<4&&quality.max>error&&quality.max<error*8;i++){
      const next=improveParameters(p,c,u);if(next===u)break;
      const trial=solveSpan(p,next,job.left,job.right,mode),q=spanError(p,trial,next);
      if(q.max>=quality.max*.999)break;c=trial;u=next;quality=q;
    }
    if(quality.max<=error){result.push(c);continue;}
    if(p.length<=2||job.depth>=24){for(let i=1;i<p.length;i++)result.push([p[i-1],p[i-1],p[i],p[i]]);continue;}
    const k=clamp(quality.index,1,p.length-2),t=unit(sub(p[k+1],p[k-1]));
    stack.push({p:p.slice(k),left:t,right:job.right,depth:job.depth+1});
    stack.push({p:p.slice(0,k+1),left:job.left,right:mul(t,-1),depth:job.depth+1});
  }
  return result;
}
export function fitTraceRing(points,options={}){
  const mode=options.curveType??'cubic';
  if(!['polygon','quadratic','cubic'].includes(mode))throw new Error('不支持的轮廓线条类型。');
  if(!Array.isArray(points)||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('轮廓坐标无效。');
  if(points.length>50000)throw new Error('轮廓节点过多，请降低描摹尺寸。');
  let p=[];for(const a of points)if(!p.length||dist(a,p.at(-1))>1e-8)p.push({x:a.x,y:a.y});
  if(p.length>1&&dist(p[0],p.at(-1))<1e-8)p.pop();
  const strength=clamp(numeric(options.curveSmoothness,60),0,100)/100;
  if(p.length<3||mode==='polygon'||strength===0)return ring(p);
  const error=clamp(numeric(options.curveFitTolerance,1.2),.15,4)*(.35+1.15*strength);
  // With corner protection disabled, round hard turns before span fitting.
  if(options.preserveCorners===false)p=flattenRing(roundTraceRing(p,{...options,curveType:mode,preserveCorners:false}),.15);
  const sharp=new Set();
  if(options.preserveCorners!==false)for(let i=0;i<p.length;i++){
    const a=unit(sub(p[i],p[(i+p.length-1)%p.length])),b=unit(sub(p[(i+1)%p.length],p[i]));
    if(Math.acos(clamp(dotV(a,b),-1,1))>=Math.PI/3)sharp.add(i);
  }
  const stops=new Set(sharp);
  // Smooth closed loops use shared tangents at evenly spaced seed anchors;
  // unlike fillets, these seeds divide whole arcs rather than every corner.
  if(stops.size<3)for(let j=0;j<4;j++)stops.add(Math.floor(p.length*j/4));
  const breaks=[...stops].sort((a,b)=>a-b),segments=[];
  for(let j=0;j<breaks.length;j++){
    const start=breaks[j],end=breaks[(j+1)%breaks.length],span=[p[start]];
    for(let k=(start+1)%p.length;k!==end;k=(k+1)%p.length)span.push(p[k]);span.push(p[end]);
    const l=sharp.has(start)?unit(sub(span[1],span[0])):tangentAt(p,start);
    const r=sharp.has(end)?unit(sub(span.at(-2),span.at(-1))):mul(tangentAt(p,end),-1);
    segments.push(...fitSpan(span,l,r,error,mode));
  }
  const nodes=segments.map(c=>({...node(c[0].x,c[0].y),out:sub(c[1],c[0])}));
  for(let i=0;i<segments.length;i++)nodes[(i+1)%nodes.length].in=sub(segments[i][2],segments[i][3]);
  // Do not grow the anchor count. Extremely small loops keep their original
  // editable polygon rather than inventing a degenerate two-node contour.
  if(nodes.length<3||nodes.length>p.length||signedArea(nodes)*signedArea(p)<=0)return ring(p);
  return {closed:true,nodes};
}

/** Conservative sampled topology guard. A failed candidate retains the
 * original group, never fills a hole with a white overlay or drops it. */
export function fitTraceGroup(group,options={}){
  const fitted=group.map(p=>fitTraceRing(p,options));
  if((options.curveType??'cubic')==='polygon'||Number(options.curveSmoothness)===0)return {rings:fitted,fallback:false};
  const flat=fitted.map(r=>flattenRing(r,.12));
  let safe=flat.every((p,i)=>p.length>=3&&signedArea(p)*signedArea(group[i])>0);
  for(let i=1;i<flat.length&&safe;i++){
    safe=flat[i].every(p=>pointInRing(p,flat[0]));
    for(let j=1;j<i&&safe;j++)safe=!pointInRing(flat[i][0],flat[j])&&!pointInRing(flat[j][0],flat[i]);
  }
  const edges=[];
  flat.forEach((r,ri)=>r.forEach((a,i)=>{const b=r[(i+1)%r.length];edges.push({a,b,ri,i,n:r.length,x:Math.min(a.x,b.x),max:Math.max(a.x,b.x),y:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)});}));
  if(edges.length>12000)safe=false;
  edges.sort((a,b)=>a.x-b.x);let checks=0;
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(let i=0;i<edges.length&&safe;i++)for(let j=i+1;j<edges.length&&edges[j].x<=edges[i].max;j++){
    const a=edges[i],b=edges[j];
    if(a.ri===b.ri&&(Math.abs(a.i-b.i)===1||Math.abs(a.i-b.i)===a.n-1))continue;
    if(a.bottom<b.y||b.bottom<a.y)continue;
    if(++checks>250000){safe=false;break;}
    const p=orient(a.a,a.b,b.a),q=orient(a.a,a.b,b.b),r=orient(b.a,b.b,a.a),s=orient(b.a,b.b,a.b);
    if(p*q< -1e-12&&r*s< -1e-12){safe=false;break;}
  }
  return {rings:safe?fitted:group.map(p=>ring(p)),fallback:!safe};
}
