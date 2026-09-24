import test from 'node:test';
import assert from 'node:assert/strict';
import {roundTraceRing} from '../src/trace-curves.js';
import {traceImage} from '../src/trace.js';
import {ring,pathData,dist,add,mul,cubic,curvePoints,flattenRing,contains,insertNode} from '../src/geometry.js';
import {makeShape,createDocument,validateDocument,exportSVG} from '../src/document.js';
const rect=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
const shape=r=>makeShape([r]);
const regular=(n=24)=>Array.from({length:n},(_,i)=>({x:70+60*Math.cos(i/n*2*Math.PI),y:70+60*Math.sin(i/n*2*Math.PI)}));
const options=(curveType,extra={})=>({curveType,curveSmoothness:60,preserveCorners:false,...extra});
const handles=r=>r.nodes.some(n=>Math.hypot(n.in.x,n.in.y,n.out.x,n.out.y)>1e-7);
test('default and zero strength retain exact polygon geometry',()=>{
  assert.deepEqual(roundTraceRing(rect),ring(rect));
  for(const type of ['cubic','quadratic'])assert.deepEqual(roundTraceRing(rect,options(type,{curveSmoothness:0})),ring(rect));
});
test('quadratic segments are exact degree elevations, not just a visual label',()=>{
  const r=roundTraceRing(rect,options('quadratic'));
  assert.ok(handles(r));let curves=0;
  for(let i=0;i<r.nodes.length;i++){
    const a=r.nodes[i],b=r.nodes[(i+1)%r.nodes.length];if(!Math.hypot(a.out.x,a.out.y,b.in.x,b.in.y))continue;
    const q1=add(a,mul(a.out,1.5)),q2=add(b,mul(b.in,1.5));assert.ok(dist(q1,q2)<1e-9);
    for(let j=0;j<=20;j++){
      const t=j/20,u=1-t,expected={x:u*u*a.x+2*u*t*q1.x+t*t*b.x,y:u*u*a.y+2*u*t*q1.y+t*t*b.y};
      assert.ok(dist(expected,cubic(...curvePoints(a,b),t))<1e-9);
    }curves++;
  }assert.equal(curves,4);
});
test('cubic fillets are genuine cubic and distinct from quadratic',()=>{
  const q=roundTraceRing(rect,options('quadratic')),c=roundTraceRing(rect,options('cubic'));
  assert.ok(handles(c));assert.notEqual(pathData(shape(q)),pathData(shape(c)));
  const a=c.nodes[0],b=c.nodes[1];assert.ok(dist(add(a,mul(a.out,1.5)),add(b,mul(b.in,1.5)))>1);
});
test('corner protection preserves sharp corners but still smooths gentle arcs',()=>{
  for(const curveType of ['quadratic','cubic']){
    assert.deepEqual(roundTraceRing(rect,{curveType,preserveCorners:true}),ring(rect));
    assert.ok(handles(roundTraceRing(regular(),{curveType,preserveCorners:true})));
  }
});
test('strength changes geometry without changing input',()=>{
  const before=structuredClone(rect);
  for(const t of ['quadratic','cubic'])assert.notDeepEqual(roundTraceRing(rect,options(t,{curveSmoothness:10})),roundTraceRing(rect,options(t,{curveSmoothness:90})));
  assert.deepEqual(rect,before);
});
test('full-strength midpoint joins have no duplicate knots and matching tangents',()=>{
  for(const t of ['quadratic','cubic']){
    const r=roundTraceRing(rect,options(t,{curveSmoothness:100}));assert.equal(r.nodes.length,4);
    for(let i=0;i<r.nodes.length;i++){
      const n=r.nodes[i];assert.ok(dist(n,r.nodes[(i+1)%r.nodes.length])>0);
      assert.ok(Math.abs(n.in.x*n.out.y-n.in.y*n.out.x)<1e-8);
      assert.ok(n.in.x*n.out.x+n.in.y*n.out.y<0);
    }
  }
});
test('rounded control points stay inside original rectangle bounds',()=>{
  for(const type of ['quadratic','cubic'])for(const strength of [1,20,60,100]){
    const r=roundTraceRing(rect,options(type,{curveSmoothness:strength}));
    for(const p of r.nodes.flatMap(n=>[n,add(n,n.in),add(n,n.out)]))assert.ok(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);
  }
});
test('tiny, reverse-winding, duplicate and invalid inputs handled deterministically',()=>{
  for(const type of ['quadratic','cubic']){
    assert.deepEqual(roundTraceRing([...rect,rect[0]],options(type)),roundTraceRing(rect,options(type)));
    assert.ok(handles(roundTraceRing(rect.slice().reverse(),options(type))));
    assert.ok(roundTraceRing(rect.map(p=>({x:p.x*1e-6,y:p.y*1e-6})),options(type)).nodes.length>=3);
  }
  assert.throws(()=>roundTraceRing([{x:NaN,y:0}]),/坐标/);assert.throws(()=>roundTraceRing(rect,{curveType:'fake'}),/类型/);
});
test('both tracer modes preserve a real hole and return editable curves',()=>{
  const width=128,height=128,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const k=(y*width+x)*4,d=Math.hypot(x-64,y-64),v=d<50&&d>22?20:255;data.set([v,v,v,255],k);
  }
  for(const mode of ['binary','color'])for(const curveType of ['quadratic','cubic']){
    const result=traceImage({width,height,data},{mode,curveType,removeBackground:true,tolerance:1,minArea:8,colors:2});
    const s=result.shapes.find(s=>s.rings.length===2);assert.ok(s);assert.ok(s.rings.some(handles));
    const flat=s.rings.map(r=>flattenRing(r,.05));assert.equal(contains({x:64,y:64},flat),false);assert.equal(contains({x:100,y:64},flat),true);
  }
});
test('curves survive project roundtrip, SVG and node insertion without changing the curve',()=>{
  const r=roundTraceRing(rect,options('quadratic')),doc=createDocument();doc.shapes=[shape(r)];
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))).shapes[0].rings,[r]);
  assert.match(exportSVG(doc),/C[\d.]/);const before=curvePoints(r.nodes[0],r.nodes[1]);
  insertNode(r,0,.5);
  for(let i=0;i<=20;i++){const t=i/20,p=t<=.5?cubic(...curvePoints(r.nodes[0],r.nodes[1]),t*2):cubic(...curvePoints(r.nodes[1],r.nodes[2]),(t-.5)*2);assert.ok(dist(p,cubic(...before,t))<1e-8);}
});
