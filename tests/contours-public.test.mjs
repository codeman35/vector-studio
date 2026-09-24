import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDocument,ellipse,rectangle} from '../src/document.js';
import {contourInfo,removeContours,holeAt,pickEditorPoint} from '../src/contours.js';
import {publicSnapshot,validatePublicProject,validPublicId,publicProjectURL} from '../src/public-projects.js';
import {buildPublicLibrary} from '../scripts/build-public.mjs';
const donut=()=>{const s=ellipse(100,100,80,80,{id:'a'});s.rings.push(ellipse(100,100,40,40).rings[0]);return s;};
const project=()=>({...createDocument(),name:'Public test',shapes:[donut()]});
test('nested ring classification and empty-hole hit are deterministic',()=>{
 const s=donut(),info=contourInfo(s);assert.equal(info[0].hole,false);assert.equal(info[1].hole,true);
 assert.deepEqual(holeAt([s],{x:100,y:100}),{id:'a',ringIndex:1});assert.equal(holeAt([s],{x:500,y:500}),null);
});
test('removing only hole preserves exact outer cubic and fills hole',()=>{
 const s=donut(),outer=structuredClone(s.rings[0]);removeContours(s,[1]);assert.equal(s.rings.length,1);assert.deepEqual(s.rings[0],outer);
});
test('deleting outer removes its descendants, not another component',()=>{
 const s=donut(),other=rectangle(500,500,10,10).rings[0];s.rings.push(other);removeContours(s,[0]);assert.deepEqual(s.rings,[other]);
});
test('island depth is not hole; removing hole removes nested descendants',()=>{
 const s=donut();s.rings.push(ellipse(100,100,10,10).rings[0]);assert.equal(contourInfo(s)[2].depth,2);
 assert.equal(holeAt([s],{x:100,y:100}),null);assert.deepEqual(holeAt([s],{x:125,y:100}),{id:'a',ringIndex:1});removeContours(s,[1]);assert.equal(s.rings.length,1);
});
test('hidden and locked compound objects are not hole targets',()=>{
 const s=donut();s.locked=true;assert.equal(holeAt([s],{x:100,y:100}),null);s.locked=false;s.visible=false;assert.equal(holeAt([s],{x:100,y:100}),null);
});
test('bad contour index is rejected atomically',()=>{
 const s=donut(),before=structuredClone(s);assert.throws(()=>removeContours(s,[1,999]));assert.deepEqual(s,before);
});
test('node hit area uses screen pixels at several zoom levels',()=>{
 const s=rectangle(10,10,100,100,{id:'a'});
 for(const scale of [.25,1,4])assert.deepEqual(pickEditorPoint([s],new Set(['a']),new Set(),{x:10-10/scale,y:10},scale),{node:'a|0|0'});
});
test('overlapping hit squares choose nearest node and handles remain usable',()=>{
 const s=rectangle(10,10,8,100,{id:'a'});assert.deepEqual(pickEditorPoint([s],new Set(['a']),new Set(),{x:17,y:10},1),{node:'a|0|1'});
 s.rings[0].nodes[0].out={x:0,y:30};assert.deepEqual(pickEditorPoint([s],new Set(['a']),new Set(['a|0|0']),{x:10,y:38},1),{handle:'a|0|0|out'});
});
test('public snapshot excludes reference image by default without mutation',()=>{
 const doc=project();doc.image={src:'data:image/png;base64,AA==',width:1,height:1};const before=structuredClone(doc);
 assert.equal(publicSnapshot(doc,'hello').document.image,null);assert.deepEqual(doc,before);
 assert.deepEqual(publicSnapshot(doc,'hello',{includeImage:true}).document.image,doc.image);
});
test('public IDs exclude paths, URLs and overlong strings',()=>{
 for(const id of ['../x','a/x','a?x','https://e','',null,'a'.repeat(81)]){assert.equal(validPublicId(id),false);assert.throws(()=>publicProjectURL(id));}
 assert.match(publicProjectURL('hello'),/\?project=hello$/);
});
test('invalid public wrapper and empty project cannot publish',()=>{
 assert.throws(()=>publicSnapshot(createDocument(),'empty'));assert.throws(()=>validatePublicProject({}));
 const value=publicSnapshot(project(),'hello');value.publishedAt='not-a-date';assert.throws(()=>validatePublicProject(value));
});
test('public project only includes whitelisted document fields',()=>{
 const doc=project();doc.privateNote='do-not-publish';const record=publicSnapshot(doc,'hello');assert.equal(record.document.privateNote,undefined);
 assert.deepEqual(validatePublicProject(record),record);
});
test('public build creates static index and validated snapshots',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vs-public-'));try{
 await mkdir(join(root,'public-projects'));const record=publicSnapshot(project(),'hello');await writeFile(join(root,'public-projects/hello.json'),JSON.stringify(record));
 await buildPublicLibrary(root);const manifest=JSON.parse(await readFile(join(root,'dist/public-projects/index.json'),'utf8'));assert.equal(manifest.projects[0].id,'hello');assert.match(manifest.projects[0].thumbnail,/^data:image\/svg\+xml/);
 assert.deepEqual(JSON.parse(await readFile(join(root,'dist/public-projects/hello.json'),'utf8')),record);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('public build rejects mismatched filename and ID',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vs-public-'));try{await mkdir(join(root,'public-projects'));await writeFile(join(root,'public-projects/wrong.json'),JSON.stringify(publicSnapshot(project(),'hello')));await assert.rejects(()=>buildPublicLibrary(root),/ID/);}finally{await rm(root,{recursive:true,force:true});}
});
