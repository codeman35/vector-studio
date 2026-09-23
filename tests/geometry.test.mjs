import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/geometry.js';
import {rectangle,ellipse,exportSVG,validateDocument,createDocument,History} from '../src/document.js';
const rect=(x,y,w,h)=>G.flattenShape(rectangle(x,y,w,h));
const area=rs=>Math.abs(rs.reduce((s,r)=>s+G.signedArea(r),0));
const near=(a,b,e=.05)=>assert.ok(Math.abs(a-b)<e,`${a} not near ${b}`);
test('rectangle union, intersection and difference',()=>{
 const a=rect(0,0,100,100),b=rect(50,0,100,100);
 near(area(G.booleanRings(a,b,'union')),15000);
 near(area(G.booleanRings(a,b,'intersect')),5000);
 near(area(G.booleanRings(a,b,'subtract')),5000);
});
test('identical and edge-touching shapes',()=>{
 const a=rect(0,0,10,10);near(area(G.booleanRings(a,a,'union')),100);
 assert.equal(G.booleanRings(a,a,'subtract').length,0);
 near(area(G.booleanRings(a,rect(10,0,10,10),'union')),200);
 assert.equal(G.booleanRings(a,rect(10,0,10,10),'intersect').length,0);
});
test('point-touching squares remain separate',()=>{
 const out=G.booleanRings(rect(0,0,10,10),rect(10,10,10,10),'union');near(area(out),200);assert.equal(G.groupRings(out).length,2);
});
test('subtracting inner shape preserves a transparent hole',()=>{
 const out=G.booleanRings(rect(0,0,100,100),rect(25,25,50,50),'subtract');
 near(area(out),7500);assert.equal(G.contains({x:50,y:50},out),false);assert.equal(G.groupRings(out)[0].length,2);
});
test('straight knife through a donut yields independent halves',()=>{
 const donut=G.booleanRings(rect(0,0,100,100),rect(25,25,50,50),'subtract');
 const [a,b]=G.cutRings(donut,{x:50,y:-10},{x:50,y:110});near(area(a),3750);near(area(b),3750);
 assert.equal(G.groupRings(a).length,1);assert.equal(G.groupRings(b).length,1);
});
test('cut outside a shape does not destroy it',()=>{const [a,b]=G.cutRings(rect(0,0,10,10),{x:20,y:0},{x:20,y:100});near(area(a)+area(b),100);});
test('nested island remains an independent shape',()=>{const rs=[...rect(0,0,100,100),...rect(10,10,80,80),...rect(20,20,60,60)];const g=G.groupRings(rs);assert.equal(g.length,2);assert.equal(g[0].length,2);});
test('cubic node insertion preserves curve geometry',()=>{
 const s=ellipse(50,50,40,30),r=s.rings[0],args=G.curvePoints(r.nodes[0],r.nodes[1]);
 const expected=G.cubic(...args,.25);G.insertNode(r,0,.5);
 const actual=G.cubic(...G.curvePoints(r.nodes[0],r.nodes[1]),.5);near(G.dist(expected,actual),0,1e-8);
});
test('history undo redo and branch',()=>{const d=createDocument(),h=new History(d);d.name='B';h.push(d);assert.equal(h.undo().name,'未命名图案');assert.equal(h.redo().name,'B');h.undo();d.name='C';h.push(d);assert.equal(h.redo(),null);});
test('project validation and SVG transparency',()=>{const d=createDocument();d.shapes=[rectangle(0,0,10,10)];assert.equal(validateDocument(d).shapes.length,1);assert.match(exportSVG(d),/fill-rule="evenodd"/);assert.doesNotMatch(exportSVG(d),/<image/);assert.throws(()=>validateDocument({...d,width:Infinity}));assert.throws(()=>validateDocument({...d,shapes:[{...d.shapes[0],fill:'url(javascript:x)'}]}));});
