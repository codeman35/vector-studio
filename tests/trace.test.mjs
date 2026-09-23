import test from 'node:test';import assert from 'node:assert/strict';
import {traceImage} from '../src/trace.js';import {contains,flattenShape} from '../src/geometry.js';
function image(w,h,fn){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),(y*w+x)*4);return {width:w,height:h,data};}
test('binary tracer keeps a hole transparent',()=>{
 const img=image(32,32,(x,y)=>x>3&&x<28&&y>3&&y<28&&!(x>10&&x<21&&y>10&&y<21)?[0,0,0,255]:[255,255,255,255]);
 const out=traceImage(img,{minArea:1,tolerance:.5});assert.equal(out.shapes.length,1);assert.equal(out.shapes[0].rings.length,2);
 assert.equal(contains({x:15,y:15},flattenShape(out.shapes[0])),false);
});
test('transparent image stays empty',()=>{assert.equal(traceImage(image(10,10,()=>[0,0,0,0])).shapes.length,0);});
test('color mode removes border white but preserves enclosed white',()=>{
 const img=image(20,20,(x,y)=>x>=3&&x<17&&y>=3&&y<17&&!(x>=7&&x<13&&y>=7&&y<13)?[220,20,20,255]:[255,255,255,255]);
 const out=traceImage(img,{mode:'color',colors:2,removeBackground:true,minArea:1});assert.equal(out.shapes.length,2);
 assert.ok(out.shapes.some(s=>s.fill==='#ffffff'));
});
test('diagonal pixels do not generate open rings',()=>{const img=image(4,4,(x,y)=>x===y?[0,0,0,255]:[255,255,255,255]);const out=traceImage(img,{minArea:0,tolerance:.1});assert.equal(out.shapes.length,4);});
