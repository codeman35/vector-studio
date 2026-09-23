import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/geometry.js';
import {rectangle} from '../src/document.js';
const rect=(x,y,w,h)=>G.flattenShape(rectangle(x,y,w,h));
const point=(x,y)=>({x,y});
const area=group=>group.reduce((n,r,i)=>n+(i===0?1:-1)*Math.abs(G.signedArea(r)),0);
const total=pieces=>pieces.reduce((n,g)=>n+area(g),0);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} vs ${b}`);
const same=(rings,a,b)=>assert.deepEqual(G.cutRings(rings,a,b),[rings,[]]);
test('finite drag outside cannot cut a rectangle on its extension',()=>{
  const shape=rect(0,0,100,100);same(shape,point(50,-30),point(50,-10));same(shape,point(50,110),point(50,180));
});
test('inside-only and incomplete drags do not extrapolate to the boundary',()=>{
  const shape=rect(0,0,100,100);
  for(const [a,b]of [[point(50,20),point(50,80)],[point(50,-10),point(50,50)],[point(50,50),point(50,110)]])same(shape,a,b);
});
test('boundary-to-boundary drag works, including reverse direction',()=>{
  for(const [a,b]of [[point(50,0),point(50,100)],[point(50,100),point(50,0)]]){
    const pieces=G.cutRings(rect(0,0,100,100),a,b);assert.equal(pieces.length,2);near(total(pieces),10000);assert.ok(pieces.every(g=>area(g)===5000));
  }
});
test('tangent, collinear boundary and single-vertex touches are no-ops',()=>{
  const shape=rect(0,0,100,100);
  same(shape,point(-10,0),point(110,0));same(shape,point(-20,20),point(20,-20));
});
test('diagonal through opposite vertices really divides the filled region',()=>{
  const pieces=G.cutRings(rect(0,0,100,100),point(-10,-10),point(110,110));assert.equal(pieces.length,2);near(total(pieces),10000);
});
test('only the reached component of a compound object is cut',()=>{
  const top=rect(0,0,100,100),bottom=rect(0,200,100,100),rings=[...top,...bottom];
  const copy=structuredClone(rings),pieces=G.cutRings(rings,point(50,-10),point(50,110));
  assert.equal(pieces.length,3);near(total(pieces),20000);assert.deepEqual(rings,copy);
  assert.ok(pieces.some(g=>JSON.stringify(g)===JSON.stringify(bottom)));
});
test('short cut in concave U reaches one arm, not the far arm',()=>{
  const u=[[point(0,0),point(30,0),point(30,70),point(70,70),point(70,0),point(100,0),point(100,100),point(0,100)]];
  const pieces=G.cutRings(u,point(-10,40),point(50,40));assert.equal(pieces.length,2);near(total(pieces),7200);
  assert.ok(pieces.some(g=>G.contains(point(80,20),g)&&G.contains(point(80,80),g)));
  const full=G.cutRings(u,point(-10,40),point(110,40));assert.equal(full.length,3);near(total(full),7200);
});
test('outer-to-hole slit is not a split and never extends through the far side',()=>{
  const donut=[...rect(0,0,100,100),...rect(25,25,50,50)];
  same(donut,point(50,-10),point(50,50));same(donut,point(50,0),point(50,25));
});
test('full donut cut preserves area and empty center regardless of orientation',()=>{
  const donut=[...rect(0,0,100,100),...rect(25,25,50,50)];
  for(const rings of [donut,donut.map(r=>r.slice().reverse())]){
    const parts=G.cutRings(rings,point(50,-10),point(50,110));assert.equal(parts.length,2);near(total(parts),7500);
    assert.ok(parts.every(g=>!G.contains(point(51,50),g)));
  }
});
test('hole not touched by drag stays a real hole in its piece',()=>{
  const rings=[...rect(0,0,100,100),...rect(10,10,20,20)];
  const parts=G.cutRings(rings,point(60,-10),point(60,110));near(total(parts),9600);
  const left=parts.find(g=>G.contains(point(5,5),g));assert.equal(left.length,2);assert.equal(G.contains(point(15,15),left),false);
});
test('guard rejects degenerate drags and excessive input without mutation',()=>{
  const r=rect(0,0,100,100);assert.throws(()=>G.cutRings(r,point(0,0),point(0,0)),/太短/);
  const tooMany=[Array.from({length:3501},(_,i)=>point(i,Math.sin(i)))];assert.throws(()=>G.cutRings(tooMany,point(0,0),point(20,20)),/3500/);
});
test('oblique shared cut vertices never turn an outer piece into a hole',()=>{
  const u=[[point(0,0),point(30,0),point(30,70),point(70,70),point(70,0),point(100,0),point(100,100),point(0,100)]];
  const out=G.cutRings(u,point(8.450166173279285,-9.379546642303467),point(67.89609547704458,106.09480328857899));
  assert.equal(out.length,3);near(total(out),7200);assert.ok(out.every(g=>g.length===1));
});
test('900 deterministic sample drags conserve filled area',()=>{
  const shapes=[rect(0,0,100,100),[...rect(0,0,100,100),...rect(20,20,60,60)],[[point(0,0),point(30,0),point(30,70),point(70,70),point(70,0),point(100,0),point(100,100),point(0,100)]]];
  let seed=42;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(const rings of shapes)for(let i=0;i<300;i++){
    const a=point(random()*160-30,random()*160-30),b=point(random()*160-30,random()*160-30);if(G.dist(a,b)<1)continue;
    near(total(G.cutRings(rings,a,b)),total(G.groupRings(rings)));
  }
});
