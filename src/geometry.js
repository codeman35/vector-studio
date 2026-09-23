/** Pure geometry functions, intentionally independent from the UI and browser.
 * Coordinates are document pixels. In/out handles are RELATIVE to the anchor.
 * Boolean operations approximate curves with polylines (default 0.35 px).
 * This is a preview kernel, NOT a certified CAD / print production kernel.
 */
export const EPS = 1e-7;
export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => vec(a.x + b.x, a.y + b.y);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y);
export const mul = (a, s) => vec(a.x * s, a.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
export const clone = (x) => structuredClone(x);
export const node = (x, y) => ({ x, y, in: vec(), out: vec() });
export const ring = (points, closed = true) => ({ closed, nodes: points.map(p => node(p.x, p.y)) });
export const fmt = (n) => Number(n.toFixed(4));

export function pathData(shape) {
  return shape.rings.filter(r => r.nodes.length).map(r => {
    const n = r.nodes;
    let d = `M${fmt(n[0].x)} ${fmt(n[0].y)}`;
    for (let i = 0; i < n.length - (r.closed ? 0 : 1); i++) {
      const a = n[i], b = n[(i + 1) % n.length];
      if (Math.hypot(a.out.x, a.out.y, b.in.x, b.in.y) < EPS) {
        d += `L${fmt(b.x)} ${fmt(b.y)}`;
      } else {
        const c1 = add(a, a.out), c2 = add(b, b.in);
        d += `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(b.x)} ${fmt(b.y)}`;
      }
    }
    return d + (r.closed ? 'Z' : '');
  }).join('');
}

export function signedArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) s += cross(points[i], points[(i + 1) % points.length]);
  return s / 2;
}
export function pointInRing(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function contains(p, rings) {
  let inside = false;
  for (const r of rings) if (pointInRing(p, r)) inside = !inside;
  return inside;
}
export function lineDistance(p, a, b) {
  const ab = sub(b, a), l = dot(ab, ab);
  if (l < EPS) return dist(p, a);
  return dist(p, lerp(a, b, Math.max(0, Math.min(1, dot(sub(p, a), ab) / l))));
}
export function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return vec(u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
    u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y);
}
export function curvePoints(a, b) { return [a, add(a, a.out), add(b, b.in), b]; }

function flattenCubic(a, b, c, d, tolerance, out, depth = 0) {
  if (depth >= 12 || (lineDistance(b, a, d) <= tolerance && lineDistance(c, a, d) <= tolerance)) {
    out.push(vec(d.x, d.y)); return;
  }
  const ab = lerp(a,b,.5), bc = lerp(b,c,.5), cd = lerp(c,d,.5);
  const abc = lerp(ab,bc,.5), bcd = lerp(bc,cd,.5), mid = lerp(abc,bcd,.5);
  flattenCubic(a,ab,abc,mid,tolerance,out,depth+1);
  flattenCubic(mid,bcd,cd,d,tolerance,out,depth+1);
}
export function flattenRing(r, tolerance = .35) {
  if (!r.nodes.length) return [];
  const out = [vec(r.nodes[0].x, r.nodes[0].y)];
  for (let i = 0; i < r.nodes.length - (r.closed ? 0 : 1); i++) {
    const a = r.nodes[i], b = r.nodes[(i+1)%r.nodes.length];
    flattenCubic(...curvePoints(a,b), tolerance, out);
  }
  if (r.closed && out.length > 1 && dist(out[0],out.at(-1)) < EPS) out.pop();
  return out;
}
export const flattenShape = (s, tolerance = .35) => s.rings.filter(r => r.closed).map(r => flattenRing(r,tolerance)).filter(p => p.length >= 3);

/** Ramer-Douglas-Peucker with an iterative stack to avoid recursion overflow. */
export function simplifyLine(points, tolerance = 1) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length); keep[0]=keep[points.length-1]=1;
  const stack = [[0,points.length-1]];
  while(stack.length) {
    const [a,b]=stack.pop(); let best=tolerance, k=-1;
    for(let i=a+1;i<b;i++) { const d=lineDistance(points[i],points[a],points[b]); if(d>best){best=d;k=i;} }
    if(k>=0){keep[k]=1;stack.push([a,k],[k,b]);}
  }
  return points.filter((_,i)=>keep[i]);
}
export function simplifyRing(points, tolerance = 1) {
  if(points.length<=4) return points.slice();
  let k=1, best=0;
  for(let i=1;i<points.length;i++){const d=dist(points[0],points[i]);if(d>best){best=d;k=i;}}
  const a=simplifyLine(points.slice(0,k+1),tolerance);
  const b=simplifyLine([...points.slice(k),points[0]],tolerance);
  const out=[...a.slice(0,-1),...b.slice(0,-1)];
  return out.length>=3 ? out : points.slice();
}

/** Assemble nested rings into independently movable objects; keep holes with parents. */
export function groupRings(rings) {
  const records = rings.filter(r=>r.length>=3 && Math.abs(signedArea(r))>EPS)
    .map(points=>({points,area:Math.abs(signedArea(points)),parent:-1,depth:0})).sort((a,b)=>b.area-a.area);
  for(let i=0;i<records.length;i++) {
    let min=Infinity;
    for(let j=0;j<i;j++) if(records[j].area<min && pointInRing(records[i].points[0],records[j].points)){
      records[i].parent=j;min=records[j].area;
    }
    records[i].depth=records[i].parent<0?0:records[records[i].parent].depth+1;
  }
  const groups=[], indices=new Map();
  for(let i=0;i<records.length;i++) {
    const r=records[i];
    if(r.depth%2===0){indices.set(i,groups.length);groups.push([r.points]);}
    else {const g=indices.get(r.parent);if(g!==undefined)groups[g].push(r.points);}
  }
  return groups;
}

/** Split at t without changing the shape of a cubic (de Casteljau). */
export function insertNode(r, index, t=.5) {
  if(t<=EPS || t>=1-EPS) return null;
  const a=r.nodes[index], b=r.nodes[(index+1)%r.nodes.length];
  const [p0,p1,p2,p3]=curvePoints(a,b);
  const q0=lerp(p0,p1,t),q1=lerp(p1,p2,t),q2=lerp(p2,p3,t);
  const u=lerp(q0,q1,t),v=lerp(q1,q2,t),p=lerp(u,v,t);
  a.out=sub(q0,p0);b.in=sub(q2,p3);
  const n={...p,in:sub(u,p),out:sub(v,p)};
  r.nodes.splice(index+1,0,n);return index+1;
}
export function nearestCurve(shape,p) {
  let best=null;
  shape.rings.forEach((r,ri)=>{
    for(let i=0;i<r.nodes.length-(r.closed?0:1);i++){
      const args=curvePoints(r.nodes[i],r.nodes[(i+1)%r.nodes.length]);
      let bt=0,bd=Infinity;
      for(let k=0;k<=24;k++){const t=k/24,d=dist(p,cubic(...args,t));if(d<bd){bd=d;bt=t;}}
      let lo=Math.max(0,bt-1/24),hi=Math.min(1,bt+1/24);
      for(let k=0;k<20;k++){const a=(2*lo+hi)/3,b=(lo+2*hi)/3;if(dist(p,cubic(...args,a))<dist(p,cubic(...args,b)))hi=b;else lo=a;}
      const t=(lo+hi)/2,point=cubic(...args,t),d=dist(p,point);
      if(!best||d<best.distance)best={ringIndex:ri,index:i,t,point,distance:d};
    }
  });return best;
}
export function reverseRing(r) {
  r.nodes.reverse();for(const n of r.nodes)[n.in,n.out]=[n.out,n.in];return r;
}
export function bounds(shape) {
  const points=shape.rings.flatMap(r=>r.nodes.flatMap(n=>[n,add(n,n.in),add(n,n.out)]));
  if(!points.length)return {x:0,y:0,width:0,height:0};
  let x=Infinity,y=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
  return {x,y,width:x2-x,height:y2-y};
}
export function translate(shape,delta){for(const r of shape.rings)for(const n of r.nodes){n.x+=delta.x;n.y+=delta.y;}}

/* Planar arrangement boundary extraction. All curves must be flattened first.
 * Split segments at crossings and overlaps. Determine whether the two sides
 * belong to the requested set, keep boundary edges, then stitch oriented rings.
 * Guards reject excessive edge counts / ambiguous topology instead of hanging.
 */
function segmentIntersections(a,b,c,d) {
  const r=sub(b,a),s=sub(d,c),q=sub(c,a),den=cross(r,s),rr=dot(r,r),ss=dot(s,s);
  if(rr<EPS || ss<EPS)return [];
  if(Math.abs(den)>EPS){const t=cross(q,s)/den,u=cross(q,r)/den;return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[[Math.max(0,Math.min(1,t)),Math.max(0,Math.min(1,u))]]:[];}
  if(Math.abs(cross(q,r))>EPS)return [];
  const out=[];
  for(const p of [a,b,c,d]){const t=dot(sub(p,a),r)/rr,u=dot(sub(p,c),s)/ss;if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS)out.push([Math.max(0,Math.min(1,t)),Math.max(0,Math.min(1,u))]);}
  return out;
}
const pointKey=p=>`${Math.round(p.x*1e5)},${Math.round(p.y*1e5)}`;
export function stitchEdges(edges) {
  const starts=new Map();
  edges.forEach((e,i)=>{const key=pointKey(e[0]);if(!starts.has(key))starts.set(key,[]);starts.get(key).push(i);});
  const used=new Set(),rings=[];
  for(let seed=0;seed<edges.length;seed++){
    if(used.has(seed))continue;
    const points=[],start=pointKey(edges[seed][0]);let idx=seed,closed=false;
    for(let guard=0;guard<=edges.length;guard++){
      if(used.has(idx))break;used.add(idx);
      const [a,b]=edges[idx];points.push(a);const end=pointKey(b);
      if(end===start){closed=true;break;}
      const choices=(starts.get(end)||[]).filter(i=>!used.has(i));
      if(!choices.length)break;
      // Choose sharpest clockwise continuation in screen coordinates at a junction.
      const v=sub(b,a);
      choices.sort((i,j)=>{
        const angle=e=>{const w=sub(e[1],e[0]);return Math.atan2(cross(v,w),dot(v,w));};
        return angle(edges[j])-angle(edges[i]);
      });idx=choices[0];
    }
    if(!closed)throw new Error('路径边界无法闭合，请撤销并简化图形后重试。');
    if(points.length>=3)rings.push(simplifyRing(points,1e-5));
  }
  return rings;
}
export function booleanRings(A,B,op='union') {
  if(!['union','subtract','intersect','xor'].includes(op))throw new Error('未知几何操作');
  const segments=[];
  for(const rings of [A,B])for(const r of rings)for(let i=0;i<r.length;i++)if(dist(r[i],r[(i+1)%r.length])>EPS)segments.push({a:r[i],b:r[(i+1)%r.length],cuts:[0,1]});
  if(segments.length>3500)throw new Error('图形过于复杂（展开后超过 3500 条边），请先简化或分批处理。');
  for(let i=0;i<segments.length;i++){
    const a=segments[i];
    for(let j=i+1;j<segments.length;j++){
      const b=segments[j];
      if(Math.max(a.a.x,a.b.x)+EPS<Math.min(b.a.x,b.b.x)||Math.max(b.a.x,b.b.x)+EPS<Math.min(a.a.x,a.b.x)||Math.max(a.a.y,a.b.y)+EPS<Math.min(b.a.y,b.b.y)||Math.max(b.a.y,b.b.y)+EPS<Math.min(a.a.y,a.b.y))continue;
      for(const [t,u] of segmentIntersections(a.a,a.b,b.a,b.b)){a.cuts.push(t);b.cuts.push(u);}
    }
  }
  const evalPoint=p=>{const a=contains(p,A),b=contains(p,B);return op==='union'?a||b:op==='subtract'?a&&!b:op==='intersect'?a&&b:a!==b;};
  const boundaries=new Map();
  for(const s of segments){
    const cuts=[...new Set(s.cuts.map(t=>Math.round(t*1e10)/1e10))].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
      const a=lerp(s.a,s.b,cuts[i-1]),b=lerp(s.a,s.b,cuts[i]),v=sub(b,a),length=dist(a,b);
      if(length<1e-5)continue;
      const mid=lerp(a,b,.5),delta=Math.min(.0005,length*.001),normal=vec(-v.y/length*delta,v.x/length*delta);
      const left=evalPoint(add(mid,normal)),right=evalPoint(sub(mid,normal));
      if(left===right)continue;
      const edge=left?[a,b]:[b,a],key=`${pointKey(edge[0])}>${pointKey(edge[1])}`;boundaries.set(key,edge);
    }
  }
  return stitchEdges([...boundaries.values()]);
}
export function cutRings(rings,a,b) {
  const v=sub(b,a),length=dist(a,b);if(length<1)throw new Error('切割线太短。');
  let max=1;for(const r of rings)for(const p of r)max=Math.max(max,dist(p,a),dist(p,b));
  const unit=mul(v,1/length),normal=vec(-unit.y,unit.x),extent=max*8+100;
  const p=add(a,mul(unit,-extent)),q=add(a,mul(unit,extent));
  const half=[[p,q,add(q,mul(normal,extent)),add(p,mul(normal,extent))]];
  return [booleanRings(rings,half,'intersect'),booleanRings(rings,half,'subtract')];
}
