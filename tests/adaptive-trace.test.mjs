import test from 'node:test';
import assert from 'node:assert/strict';
import {fitTraceRing,fitTraceGroup} from '../src/trace-curves.js';
import {flattenRing,pathData,ring,contains,insertNode,cubic,curvePoints} from '../src/geometry.js';
import {traceImage} from '../src/trace.js';
import {createDocument,makeShape,validateDocument,exportSVG} from '../src/document.js';
const circle=(r=100,n=128)=>Array.from({length:n},(_,i)=>({x:130+r*Math.cos(i*2*Math.PI/n),y:130+r*Math.sin(i*2*Math.PI/n)}));
const rect=[{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}];
const count=s=>s.reduce((a,s)=>a+s.rings.reduce((b,r)=>b+r.nodes.length,0),0);
function raster(w=320,h=260){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const r=Math.hypot(x-130,y-130),v=r<100&&r>40?0:255;data.set([v,v,v,255],(y*w+x)*4);}return {width:w,height:h,data};}
test('cubic fits a whole smooth loop with few nodes, not one fillet per corner',()=>{
 const p=circle(),fit=fitTraceRing(p);assert.ok(fit.nodes.length<=8);assert.ok(pathData({rings:[fit]}).includes('C'));
 for(const q of flattenRing(fit,.05))assert.ok(Math.abs(Math.hypot(q.x-130,q.y-130)-100)<1.4);
});
test('shared cubic tangents remain smooth at closed seam and subdivisions',()=>{
 const fit=fitTraceRing(circle());for(const n of fit.nodes){const a=n.in,b=n.out;assert.ok(Math.abs(a.x*b.y-a.y*b.x)<1e-7);assert.ok(a.x*b.x+a.y*b.y<0);}
});
test('protected straight rectangle preserves exact corners and straight lines',()=>{assert.deepEqual(fitTraceRing(rect),ring(rect));});
test('one contour can contain real curves and a straight segment',()=>{
 const p=[{x:0,y:0},{x:100,y:0}];for(let i=1;i<=64;i++)p.push({x:50+50*Math.cos(i*Math.PI/64),y:50*Math.sin(i*Math.PI/64)});
 const fit=fitTraceRing(p),d=pathData({rings:[fit]});assert.ok(d.includes('L')&&d.includes('C'),d);assert.ok(fit.nodes.length<p.length/2);
});
test('quadratic spans are mathematically degree-elevated, not clamped fake cubics',()=>{
 const fit=fitTraceRing(circle(),{curveType:'quadratic'});assert.ok(fit.nodes.length<=16);
 for(let i=0;i<fit.nodes.length;i++){const a=fit.nodes[i],b=fit.nodes[(i+1)%fit.nodes.length];if(!Math.hypot(a.out.x,a.out.y,b.in.x,b.in.y))continue;
 assert.ok(Math.hypot(a.x+1.5*a.out.x-b.x-1.5*b.in.x,a.y+1.5*a.out.y-b.y-1.5*b.in.y)<1e-7);}
});
test('hard polygon and zero smoothing remain identical to input',()=>{
 const p=circle(50,32);assert.deepEqual(fitTraceRing(p,{curveType:'polygon'}),ring(p));assert.deepEqual(fitTraceRing(p,{curveSmoothness:0}),ring(p));
});
test('unprotected hard turns can round, protected ones do not',()=>{assert.notDeepEqual(fitTraceRing(rect,{preserveCorners:false}),ring(rect));});
test('default raster tracing reduces ring nodes, keeps a hole and uses red',()=>{
 const image=raster(),before=traceImage(image,{curveType:'polygon'}),after=traceImage(image);
 assert.equal(after.shapes.length,1);assert.equal(after.shapes[0].rings.length,2);assert.equal(after.shapes[0].fill,'#e60012');assert.equal(after.fallbacks,0);
 assert.ok(count(after.shapes)<count(before.shapes)/2,`${count(before.shapes)} -> ${count(after.shapes)}`);
 assert.equal(contains({x:130,y:130},after.shapes[0].rings.map(r=>flattenRing(r))),false);
});
test('narrow holes retain topology or fall back without data loss',()=>{
 const fit=fitTraceGroup([circle(100,80),circle(99,80)],{curveFitTolerance:3});assert.equal(fit.rings.length,2);
 assert.equal(contains({x:130,y:130},fit.rings.map(r=>flattenRing(r))),false);
});
test('reversed loops and duplicate endpoint preserve usable geometry',()=>{const p=circle(50,32).reverse();p.push(p[0]);const fit=fitTraceRing(p);assert.ok(fit.nodes.length>=3);assert.ok(fit.nodes.every(n=>Number.isFinite(n.x+n.y+n.in.x+n.out.x)));});
test('input is never modified, invalid options rejected',()=>{const p=circle(),clone=structuredClone(p);fitTraceRing(p);assert.deepEqual(p,clone);assert.throws(()=>fitTraceRing([{x:NaN,y:3}]),/无效/);assert.throws(()=>fitTraceRing(p,{curveType:'invented'}),/不支持/);});
test('new geometry survives project roundtrip and SVG, existing colors unchanged',()=>{
 const doc=createDocument();doc.shapes=[makeShape([fitTraceRing(circle())],{fill:'#112233'})];const saved=validateDocument(doc);assert.deepEqual(saved,doc);assert.ok(exportSVG(saved).includes('C'));assert.equal(saved.shapes[0].fill,'#112233');assert.equal(makeShape([]).fill,'#e60012');
});
test('inserting a node still preserves the fitted cubic exactly',()=>{
 const r=fitTraceRing(circle()),curve=curvePoints(r.nodes[0],r.nodes[1]);insertNode(r,0,.5);
 for(let i=0;i<=10;i++){const t=i/10,expected=cubic(...curve,t),idx=t<=.5?0:1,got=cubic(...curvePoints(r.nodes[idx],r.nodes[idx+1]),t<=.5?t*2:t*2-1);assert.ok(Math.hypot(expected.x-got.x,expected.y-got.y)<1e-8);}
});
test('color tracing does not repaint existing palette as red',()=>{
 const data=new Uint8ClampedArray(40*40*4);for(let i=0;i<1600;i++)data.set([0,0,240,255],i*4);
 const o=traceImage({width:40,height:40,data},{mode:'color',removeBackground:true,minArea:0});assert.equal(o.shapes[0].fill,'#0000f0');
});
