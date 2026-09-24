import test from 'node:test';
import assert from 'node:assert/strict';
import {node,curvePoints,cubic,dist,ring} from '../src/geometry.js';
import {makeShape,validateDocument,createDocument,exportSVG,History} from '../src/document.js';
import {pickCurveSegment,beginCurveDrag,curveDragHandles,draggedCurvePoint,curveDragCursor} from '../src/curve-drag.js';
const p=(x,y)=>({x,y});
function apply(a,b,t,delta){const state=beginCurveDrag(a,b,t),h=curveDragHandles(state,delta);return {a:{...a,out:h.out},b:{...b,in:h.in},state};}
function pair(){const a=node(30,50),b=node(390,80);a.in=p(-20,-8);a.out=p(100,-100);b.in=p(-60,-140);b.out=p(30,40);return [a,b];}
function close(a,b,eps=1e-7){assert.ok(dist(a,b)<eps,JSON.stringify({a,b}));}
test('cubic point follows the drag exactly; anchors and opposite handles unchanged',()=>{
 for(const t of [.03,.15,.25,.5,.8,.97]){const [a,b]=pair(),original=structuredClone([a,b]),delta=p(20,-45),c=apply(a,b,t,delta),q=cubic(...curvePoints(a,b),t);
  close(cubic(...curvePoints(c.a,c.b),t),p(q.x+delta.x,q.y+delta.y));assert.deepEqual([a,b],original);
  assert.deepEqual([c.a.x,c.a.y,c.a.in,c.b.x,c.b.y,c.b.out],[a.x,a.y,a.in,b.x,b.y,b.out]);
 }
});
test('straight line becomes cubic without moving its endpoints or the hit location',()=>{
 const a=node(10,20),b=node(310,20);
 for(const t of [.2,.5,.8]){const q=cubic(...curvePoints(a,b),t),c=apply(a,b,t,p(12,45));close(cubic(...curvePoints(c.a,c.b),c.state.t),p(q.x+12,q.y+45));assert.deepEqual([c.a.x,c.a.y,c.b.x,c.b.y],[10,20,310,20]);}
});
test('zero displacement, including return-to-start, preserves original straight handles',()=>{
 const [a,b]=[node(10,20),node(200,20)],state=beginCurveDrag(a,b,.3);
 curveDragHandles(state,p(80,90));const h=curveDragHandles(state,p(0,0));assert.deepEqual(h,{out:a.out,in:b.in});close(draggedCurvePoint(a,b,state),cubic(...curvePoints(a,b),.3));
});
test('multiple frames are calculated from original geometry, not accumulated',()=>{
 const [a,b]=pair(),state=beginCurveDrag(a,b,.4),copy=structuredClone(state);for(let i=0;i<50;i++)curveDragHandles(state,p(i,-i));assert.deepEqual(state,copy);assert.deepEqual(curveDragHandles(state,p(12,25)),curveDragHandles(beginCurveDrag(a,b,.4),p(12,25)));
});
test('minimum-norm distribution affects nearer control more off-center',()=>{
 const [a,b]=pair(),h=curveDragHandles(beginCurveDrag(a,b,.2),p(0,20));assert.ok(h.out.y-a.out.y>h.in.y-b.in.y);const mid=curveDragHandles(beginCurveDrag(a,b,.5),p(0,20));assert.ok(Math.abs((mid.out.y-a.out.y)-(mid.in.y-b.in.y))<1e-9);
});
test('degree elevated quadratic is directly editable as a cubic',()=>{
 const a=node(10,10),b=node(200,30),q=p(80,-70);a.out=p((q.x-a.x)*2/3,(q.y-a.y)*2/3);b.in=p((q.x-b.x)*2/3,(q.y-b.y)*2/3);const before=cubic(...curvePoints(a,b),.4),c=apply(a,b,.4,p(-10,32));close(cubic(...curvePoints(c.a,c.b),.4),p(before.x-10,before.y+32));
});
test('screen hit radius and node exclusion at multiple zoom levels',()=>{
 const s=makeShape([ring([p(0,0),p(1000,0)],false)]),selection=new Set([s.id]);
 for(const z of [.05,.2,1,5]){assert.ok(pickCurveSegment([s],selection,p(500,6/z),z));assert.equal(pickCurveSegment([s],selection,p(500,8/z),z),null);assert.equal(pickCurveSegment([s],selection,p(5/z,0),z),null);}
});
test('hit testing does not bend filled interiors, unselected, hidden or locked shapes',()=>{
 const s=makeShape([ring([p(0,0),p(200,0),p(200,200),p(0,200)])]);assert.equal(pickCurveSegment([s],new Set([s.id]),p(100,100)),null);assert.equal(pickCurveSegment([s],new Set(),p(100,0)),null);s.locked=true;assert.equal(pickCurveSegment([s],new Set([s.id]),p(100,0)),null);s.locked=false;s.visible=false;assert.equal(pickCurveSegment([s],new Set([s.id]),p(100,0)),null);
});
test('closing and hole segments keep correct ring and segment indices',()=>{
 const s=makeShape([ring([p(0,0),p(200,0),p(200,200),p(0,200)]),ring([p(60,60),p(140,60),p(140,140),p(60,140)])]),sel=new Set([s.id]);
 const seam=pickCurveSegment([s],sel,p(0,100)),hole=pickCurveSegment([s],sel,p(100,60));assert.equal(seam.index,3);assert.equal(seam.ringIndex,0);assert.equal(hole.ringIndex,1);assert.equal(hole.index,0);
});
test('open paths do not acquire a phantom closing edge',()=>{const s=makeShape([ring([p(0,0),p(200,0),p(200,200)],false)]);assert.equal(pickCurveSegment([s],new Set([s.id]),p(100,100)),null);});
test('invalid or excessive drags reject without mutation',()=>{
 const [a,b]=pair();for(const t of [0,1,NaN,Infinity])assert.throws(()=>beginCurveDrag(a,b,t));assert.throws(()=>beginCurveDrag(node(0,0),node(0,0),.5));const d=beginCurveDrag(a,b,.4),copy=structuredClone(d);assert.throws(()=>curveDragHandles(d,p(Infinity,0)));assert.throws(()=>curveDragHandles(d,p(1e9,0)));assert.deepEqual(d,copy);
});
test('history, project validation and SVG preserve actual handles',()=>{
 const d=createDocument(),[a,b]=pair();d.shapes=[makeShape([{closed:false,nodes:[a,b]}],{fill:'none',stroke:'#e60012',strokeWidth:2})];const h=new History(d),base=structuredClone(d),c=apply(a,b,.5,p(0,35));d.shapes[0].rings[0].nodes=[c.a,c.b];h.push(d);assert.deepEqual(h.undo(),base);assert.deepEqual(h.redo(),d);assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),d);assert.match(exportSVG(d),/C/);
});
test('150 deterministic curved drags retain exact endpoints and grabbed positions',()=>{
 for(let i=0;i<150;i++){const [a,b]=pair(),t=.04+(i%91)/100,delta=p(Math.sin(i)*100,Math.cos(i)*75),q=cubic(...curvePoints(a,b),t),c=apply(a,b,t,delta);close(cubic(...curvePoints(c.a,c.b),t),p(q.x+delta.x,q.y+delta.y),1e-6);}
});

test('arc cursors embed a safe 32px image with a hotspot on the arc and two-way arrows',()=>{
 const cursors=[curveDragCursor(),curveDragCursor(true)];assert.notEqual(...cursors);
 for(const css of cursors){
  assert.match(css,/^url\("data:image\/svg\+xml,/);assert.match(css,/14 12, crosshair$/);
  const svg=decodeURIComponent(css.match(/data:image\/svg\+xml,([^"]+)/)[1]);
  assert.match(svg,/width="32" height="32"/);assert.match(svg,/Q14 0 24 24/);
  assert.match(svg,/M28 4 V18/);assert.equal((svg.match(/<rect /g)||[]).length,2);
  assert.ok(!/<script|onload=|href=/i.test(svg));
 }
});
