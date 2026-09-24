import test from 'node:test';
import assert from 'node:assert/strict';
import {pathBounds,layoutUnits,layoutPlan,applyLayout,selectionColor,sameColorIds,anchorTargets,snapIndex,colorKey} from '../src/precision.js';
import {createDocument,rectangle,makeShape,ellipse,History,validateDocument,exportSVG} from '../src/document.js';
import {node} from '../src/geometry.js';
const rect=(id,x,y,w=20,h=20,more={})=>rectangle(x,y,w,h,{id,...more});
const document=(shapes,groups=[])=>({...createDocument(),width:600,height:400,shapes,groups});
const ids=d=>d.shapes.map(s=>s.id);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
const bounds=d=>d.shapes.map(pathBounds);
const use=(d,command,opt)=>applyLayout(d,layoutPlan(d,ids(d),command,opt));
test('exact cubic bounds use derivative extrema, not control polygon',()=>{
  const a=node(0,0),b=node(100,0);a.out={x:0,y:100};b.in={x:0,y:100};
  assert.deepEqual(pathBounds(makeShape([{closed:false,nodes:[a,b]}])),{x:0,y:0,width:100,height:75});
});
test('all six alignments match selected geometry edges or centers',()=>{
  for(const c of ['left','center-x','right','top','center-y','bottom']){
    const d=document([rect('a',20,30,40,50),rect('b',110,80,20,70),rect('c',180,180,70,20)]);use(d,c);
    const b=bounds(d),x=c==='left'?p=>p.x:c==='center-x'?p=>p.x+p.width/2:c==='right'?p=>p.x+p.width:c==='top'?p=>p.y:c==='center-y'?p=>p.y+p.height/2:p=>p.y+p.height;
    b.forEach(p=>near(x(p),x(b[0])));
  }
});
test('artboard alignment works for one object and empty state rejects',()=>{
  const d=document([rect('a',13,40,20,50)]);use(d,'center-x',{target:'artboard'});use(d,'bottom',{target:'artboard'});
  assert.deepEqual(pathBounds(d.shapes[0]),{x:290,y:350,width:20,height:50});
  assert.throws(()=>layoutPlan(d,[],'left'),/至少/);assert.throws(()=>layoutPlan(d,['a'],'left'),/至少/);
});
test('horizontal equal gaps keep first and last byte-for-byte',()=>{
  const d=document([rect('a',0,20,20),rect('b',50,80,40),rect('c',200,5,60),rect('d',360,50,40)]);
  const before=structuredClone(d);use(d,'distribute-x');const b=bounds(d);
  near(b[1].x-b[0].x-b[0].width,80);near(b[2].x-b[1].x-b[1].width,80);near(b[3].x-b[2].x-b[2].width,80);
  assert.deepEqual(d.shapes[0],before.shapes[0]);assert.deepEqual(d.shapes[3],before.shapes[3]);
  b.forEach((p,i)=>near(p.y,pathBounds(before.shapes[i]).y));
});
test('vertical centers differ from equal gaps for unequal heights',()=>{
  const d=document([rect('a',0,10,10,20),rect('b',50,60,30,60),rect('c',110,280,20,40)]);use(d,'distribute-y',{spacing:'center'});
  const b=bounds(d),c=b.map(p=>p.y+p.height/2);near(c[1]-c[0],c[2]-c[1]);
});
test('not enough room or objects never produces partial changes',()=>{
  const d=document([rect('a',0,0,100),rect('b',10,0,100),rect('c',20,0,100)]),before=structuredClone(d);
  assert.throws(()=>use(d,'distribute-x'),/空间不足/);assert.deepEqual(d,before);
  assert.throws(()=>layoutPlan(d,['a','b'],'distribute-x'),/至少需要 3/);
});
test('complete nested group is a single unit and keeps geometry and nesting',()=>{
  const a=ellipse(30,40,10,12,{id:'a',groupId:'inner'}),b=rect('b',100,80,20,30,{groupId:'outer'}),c=rect('c',300,20);
  const d=document([a,b,c],[{id:'inner',name:'Inner',parentId:'outer'},{id:'outer',name:'Outer',parentId:null}]);
  assert.equal(layoutUnits(d,ids(d)).length,2);const before=structuredClone(d);use(d,'top');
  near(d.shapes[0].rings[0].nodes[0].y-before.shapes[0].rings[0].nodes[0].y,d.shapes[1].rings[0].nodes[0].y-before.shapes[1].rings[0].nodes[0].y);
  assert.deepEqual(d.groups,before.groups);d.shapes[0].rings[0].nodes.forEach((n,i)=>{assert.deepEqual(n.in,before.shapes[0].rings[0].nodes[i].in);assert.deepEqual(n.out,before.shapes[0].rings[0].nodes[i].out);});
  validateDocument(d);assert.ok(exportSVG(d).includes('<g'));
});
test('partial group selection moves only selected children',()=>{
  const d=document([rect('a',0,0,20,20,{groupId:'g'}),rect('b',30,40,20,20,{groupId:'g'}),rect('c',90,100)],[{id:'g',name:'g',parentId:null}]);const before=structuredClone(d.shapes[1]);
  applyLayout(d,layoutPlan(d,['a','c'],'bottom'));assert.deepEqual(d.shapes[1],before);assert.equal(d.shapes[0].groupId,'g');
});
test('hidden or locked selected content rejects, unselected stays unchanged',()=>{
  const d=document([rect('a',0,20),rect('b',50,80),rect('c',90,40,20,20,{locked:true}),rect('d',140,90,20,20,{visible:false})]),before=structuredClone(d);
  assert.throws(()=>use(d,'left'),/隐藏或锁定/);assert.deepEqual(d,before);
  applyLayout(d,layoutPlan(d,['a','b'],'top'));assert.deepEqual(d.shapes.slice(2),before.shapes.slice(2));
});
test('one layout creates a reversible history transaction with no-op detection',()=>{
  const d=document([rect('a',0,30),rect('b',60,80)]),before=structuredClone(d),h=new History(d);use(d,'top');h.push(d);
  assert.deepEqual(h.undo(),before);assert.deepEqual(h.redo(),d);assert.deepEqual(layoutPlan(d,ids(d),'top'),[]);
});
test('pure planning never changes inputs and malicious late states reject atomically',()=>{
  const d=document([rect('a',0,30),rect('b',60,80)]),before=structuredClone(d),plan=layoutPlan(d,ids(d),'bottom');assert.deepEqual(d,before);
  d.shapes[0].locked=true;assert.throws(()=>applyLayout(d,plan),/状态/);near(d.shapes[1].rings[0].nodes[0].y,80);
});
test('color selection is normalized exact fill, excludes locked/hidden and other group colors',()=>{
  const d=document([rect('a',0,0,20,20,{fill:'#AaBbCc',groupId:'g'}),rect('b',40,0,20,20,{fill:'#aabbcc'}),rect('c',80,0,20,20,{fill:'#aabbcd',groupId:'g'}),rect('d',120,0,20,20,{fill:'#aabbcc',locked:true}),rect('e',160,0,20,20,{fill:'#aabbcc',visible:false})]);
  const before=structuredClone(d);assert.equal(colorKey('#AbC'),'#aabbcc');assert.deepEqual([...sameColorIds(d,['a'])],['a','b']);assert.deepEqual(d,before);
  assert.equal(selectionColor(d,['a','c']),null);assert.throws(()=>sameColorIds(d,['a','c']),/先选择/);
});
test('stroke selection needs an actual stroke and matches color not stroke width',()=>{
  const d=document([rect('a',0,0,20,20,{stroke:'#fff',strokeWidth:2}),rect('b',40,0,20,20,{stroke:'#FFFFFF',strokeWidth:5}),rect('c',80,0,20,20,{stroke:'#ffffff',strokeWidth:0})]);
  assert.deepEqual([...sameColorIds(d,['a'],'stroke')],['a','b']);assert.equal(selectionColor(d,['c'],'stroke'),null);
});
test('no-fill is a valid exact color category, not every filled object',()=>{
  const d=document([rect('a',0,0,20,20,{fill:'none'}),rect('b',40,0),rect('c',80,0,20,20,{fill:'none'})]);assert.deepEqual([...sameColorIds(d,['a'])],['a','c']);
});
test('snap targets exclude dragged anchors and invisible or locked geometry',()=>{
  const a=rect('a',0,0),b=rect('b',60,30,20,20,{locked:true}),c=rect('c',80,40,20,20,{visible:false});
  const t=anchorTargets(document([a,b,c]),new Set(['a|0|0']));assert.equal(t.length,3);assert.ok(t.every(p=>p.id==='a'&&p.key!=='a|0|0'));
});
test('screen-pixel radius is stable at 10%, 100% and 500% zoom',()=>{
  for(const z of [.1,1,5]){const i=snapIndex([{x:100,y:100,key:'a',endpoint:false}],z,8);
    assert.equal(i.nearest({x:100+7/z,y:100}).key,'a');assert.equal(i.nearest({x:100+9/z,y:100}),null);assert.equal(i.nearest({x:100+8/z,y:100}).key,'a');}
});
test('snap picks nearest point (not separate x/y axes) and respects endpoint mode',()=>{
  const i=snapIndex([{x:10,y:10,key:'closed',endpoint:false},{x:13,y:10,key:'open',endpoint:true}],1,8);
  assert.equal(i.nearest({x:10,y:10}).key,'closed');assert.equal(i.nearest({x:10,y:10},{endpointsOnly:true}).key,'open');assert.equal(i.nearest({x:19,y:19}),null);
});
test('coincident targets deterministically prefer endpoints without mutating them',()=>{
  const p=[{x:0,y:0,key:'a',endpoint:false},{x:0,y:0,key:'b',endpoint:true}],copy=structuredClone(p);assert.equal(snapIndex(p).nearest({x:1,y:0}).key,'b');assert.deepEqual(p,copy);
});
test('moving an open endpoint retains opposite handles and never automatically joins',()=>{
  const d=document([makeShape([{closed:false,nodes:[node(0,0),node(10,10)]}],{id:'a'}),makeShape([{closed:false,nodes:[node(15,15),node(30,30)]}],{id:'b'})]);
  const t=anchorTargets(d,new Set(['a|0|1'])),snap=snapIndex(t).nearest({x:14,y:15},{endpointsOnly:true});assert.equal(snap.key,'b|0|0');assert.equal(d.shapes.length,2);
});
