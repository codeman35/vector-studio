import {pickCurveSegment,beginCurveDrag,curveDragHandles,draggedCurvePoint,curveDragCursor} from './curve-drag.js';
import {createPrecisionTools} from './precision-ui.js';
import {holeAt,removeContours,pickEditorPoint} from './contours.js';
import {createContourPanel} from './contour-ui.js';
import {createPublicLibrary} from './public-library.js';
import * as G from './geometry.js';
import * as Groups from './groups.js';
import {createProjectLibrary} from './project-library.js';
import {renderLayerTree,capabilities,createContextMenu} from './editor-ui.js';
import {exportPSD,psdCapability} from './psd.js';
import {createTracePreview} from './trace-preview.js';
import {createDocument,makeShape,rectangle,ellipse,exportSVG,validateDocument,History,uid,VERSION} from './document.js';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const canvas=$('editor'),workspace=$('workspace');
const editNotice=document.createElement('div');editNotice.id='node-edit-notice';editNotice.hidden=true;editNotice.className='preview-controls';const editLabel=document.createElement('strong');const exitEditButton=document.createElement('button');exitEditButton.type='button';exitEditButton.textContent='退出节点编辑';exitEditButton.onclick=()=>exitNodeEdit();editNotice.append(editLabel,document.createTextNode(' · 双击空白退出 · 内外均可框选 '),exitEditButton);$('panel-properties').prepend(editNotice);
let doc=createDocument(),history=new History(doc),selection=new Set(),nodeSelection=new Set();
let tool='select',outline=false,showReference=true,fillColor='#e60012',dirty=false,drawingId=null;
let view={x:-100,y:-100,width:1200,height:900},drag=null,space=false,worker=null,referenceRevision=0,saveTimer=null,toastTimer=null;
let precision=null,contourPanel=null;
let savedDraft=null,interacted=false,savedState=JSON.stringify(doc),exporting=false;
const hints={select:'双击图形进入节点编辑；Shift 多选；群组整体移动；右键打开操作菜单。',node:'出现弧线光标即可向内/向外拖动线条（两端不动）；内部拖动框选；Shift 强制框选；Ctrl 加点；Alt 删点；双击空白退出。',add:'点击曲线增加节点，保持曲线原有形状。',pen:'逐点点击绘制；点击起点闭合；Enter 结束开放路径。',knife:'只切割拖动起点到终点之间的线段；须贯穿区域，不向两端延伸。优先切割已选对象。',scissors:'点击曲线剪断单条路径；分割色块请用「切割」。',fill:'点击现有闭合对象，应用当前填充颜色。',rect:'拖动绘制矩形。Shift 限制为正方形。',ellipse:'拖动绘制椭圆。Shift 限制为圆。',pan:'拖动画布平移；滚轮以鼠标位置为中心缩放。'};
const selected=()=>doc.shapes.filter(s=>selection.has(s.id)&&s.visible&&!s.locked);
const byId=id=>doc.shapes.find(s=>s.id===id);
const scale=()=>canvas.getScreenCTM()?.a||1;
const keyFor=(id,ri,ni)=>`${id}|${ri}|${ni}`;
function svg(tag,attrs={}){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
function point(event){const p=canvas.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(canvas.getScreenCTM().inverse());}
function status(text){$('status-message').textContent=text;}
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;status(message);toastTimer=setTimeout(()=>$('toast').hidden=true,error?6500:3500);}
function attempt(fn){try{const result=fn();if(result?.then)result.catch(e=>{toast(e.message||String(e),true);console.error(e);});return result;}catch(e){toast(e.message||String(e),true);console.error(e);return null;}}
async function attemptAsync(fn){try{return await fn();}catch(e){toast(e.message||String(e),true);console.error(e);return null;}}
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',active);$('panel-'+b.dataset.tab).hidden=!active;});tracePreview.setVisible(name==='trace');}
function setTool(next){if(worker)return;if(drag?.type==='curve')cancelGesture();clearCurveHover();precision?.clearSnap();const allowed=capabilities(doc,selection,nodeSelection.size);if(next in allowed&&!allowed[next]){toast('还没有适合此工具的可编辑矢量对象，请先生成轮廓或绘图。');return;}if(drawingId&&next!==tool)finishPen();tool=next;canvas.dataset.tool=tool;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('tool-hint').textContent=hints[tool];if(['node','fill','add','scissors'].includes(tool))tab('properties');if(tool!=='node'&&tool!=='add')nodeSelection.clear();render();}
function updateView(){canvas.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);$('zoom-value').textContent=Math.round(scale()*100)+'%';renderOverlay();precision?.render();}
function fit(){const r=workspace.getBoundingClientRect(),s=Math.min((r.width-100)/doc.width,(r.height-115)/doc.height);const z=Math.max(.025,s);view={x:(doc.width-r.width/z)/2,y:(doc.height-r.height/z)/2,width:r.width/z,height:r.height/z};updateView();}
function zoom(factor,at){const r=workspace.getBoundingClientRect();at=at||{x:view.x+view.width/2,y:view.y+view.height/2};const newScale=scale()/factor;if(newScale<.025||newScale>30)return;view={x:at.x-(at.x-view.x)*factor,y:at.y-(at.y-view.y)*factor,width:view.width*factor,height:view.height*factor};updateView();}
function commit(message){Groups.pruneGroups(doc);history.push(doc);dirty=JSON.stringify(doc)!==savedState;selection=new Set([...selection].filter(id=>byId(id)));nodeSelection=new Set([...nodeSelection].filter(key=>{const[id,ri,ni]=key.split('|');return selection.has(id)&&!!byId(id)?.rings[+ri]?.nodes[+ni];}));render();scheduleDraft();if(message)status(message);}
function restore(state){if(!state)return;precision?.clearSnap();cancelTrace(false);doc=state;selection.clear();nodeSelection.clear();drawingId=null;dirty=JSON.stringify(doc)!==savedState;referenceRevision++;syncReference();render();scheduleDraft();}
function render(){
  const layer=$('objects'),existing=new Map([...layer.children].map(p=>[p.getAttribute('data-id'),p]));let position=0;
  for(const s of doc.shapes){if(!s.visible)continue;let p=existing.get(s.id);if(!p)p=svg('path');existing.delete(s.id);
    const attrs={d:G.pathData(s),'fill-rule':'evenodd',fill:outline?'transparent':s.fill,stroke:outline?'#637d73':s.stroke,'stroke-width':outline?1/scale():s.strokeWidth,'stroke-linecap':'round','stroke-linejoin':'round','data-id':s.id};
    for(const [key,value]of Object.entries(attrs))if(p.getAttribute(key)!==String(value))p.setAttribute(key,String(value));
    if(s.locked)p.setAttribute('pointer-events','none');else p.removeAttribute('pointer-events');
    if(layer.children[position]!==p)layer.insertBefore(p,layer.children[position]||null);position++;
  }
  for(const p of existing.values())p.remove();
  $('artboard').setAttribute('width',doc.width);$('artboard').setAttribute('height',doc.height);
  $('board-size').textContent=`${doc.width} × ${doc.height} px`;
  $('welcome').hidden=doc.shapes.length>0||!!doc.image;
  $('document-name').value=doc.name;$('save-state').textContent=dirty?'未保存修改 · Ctrl S 保存项目库':'已保存状态 · 项目库仅限本机';
  $('object-stats').textContent=`${doc.shapes.length} 个对象 · ${doc.shapes.reduce((n,s)=>n+s.rings.reduce((m,r)=>m+r.nodes.length,0),0)} 个节点`;
  $('undo-btn').disabled=history.index<=0||!!worker;$('redo-btn').disabled=history.index>=history.states.length-1||!!worker;
  $('trace-btn').disabled=!doc.image||!!worker;
  $('outline-btn').setAttribute('aria-pressed',outline);$('reference-btn').setAttribute('aria-pressed',showReference);
  $('reference').setAttribute('opacity',showReference?(doc.shapes.length?.28:1):0);
  $('rail-color').style.background=fillColor;
  editNotice.hidden=tool!=='node';editLabel.textContent='正在编辑：'+(selected().map(s=>s.name).join('、')||'请选择图形');
  renderOverlay();renderLayers();renderProperties();tracePreview.render();renderCommandState();precision?.render();contourPanel?.render();
  if(drag?.type==='curve')drawCurveFeedback(drag);else clearCurveHover();
}
function renderOverlay(){
  const group=$('overlays');group.replaceChildren();const z=scale();
  let drawn=0;
  for(const s of selected()){
    const path=svg('path',{d:G.pathData(s),class:'selection-outline','stroke-width':1/z});group.append(path);
    if(['node','add','scissors'].includes(tool)){
      s.rings.forEach((r,ri)=>r.nodes.forEach((n,ni)=>{
        if(++drawn>2500)return;const key=keyFor(s.id,ri,ni),active=nodeSelection.has(key);
        if(active||r.nodes.length<100)for(const side of ['in','out']){
          const h=G.add(n,n[side]);if(G.dist(n,h)<1e-5)continue;
          group.append(svg('line',{x1:n.x,y1:n.y,x2:h.x,y2:h.y,class:'handle-line','stroke-width':1/z}));
          group.append(svg('circle',{cx:h.x,cy:h.y,r:10/z,fill:'transparent','pointer-events':'all','data-handle-hit':`${key}|${side}`}));
          group.append(svg('circle',{cx:h.x,cy:h.y,r:4.5/z,class:'handle','stroke-width':1/z,'data-handle':`${key}|${side}`}));
        }
        group.append(svg('rect',{x:n.x-11/z,y:n.y-11/z,width:22/z,height:22/z,fill:'transparent','pointer-events':'all','data-anchor-hit':key}));
        group.append(svg('rect',{x:n.x-5/z,y:n.y-5/z,width:10/z,height:10/z,rx:1/z,'stroke-width':1/z,class:`anchor ${active?'selected':''}`,'data-node':key}));
      }));
    }else if(tool==='select'){
      const b=G.bounds(s);group.append(svg('rect',{x:b.x-4/z,y:b.y-4/z,width:b.width+8/z,height:b.height+8/z,fill:'none',stroke:'#58a295','stroke-width':1/z,'stroke-dasharray':`${4/z} ${3/z}`,'pointer-events':'none'}));
    }
  }
  if(drawingId){const s=byId(drawingId),p=s?.rings[0].nodes[0];if(p)group.append(svg('circle',{cx:p.x,cy:p.y,r:5/z,fill:'white',stroke:'#2e897e','stroke-width':1.5/z,'pointer-events':'none'}));}
}
function selectIds(ids,shift=false){
  const all=ids.every(id=>selection.has(id));if(!shift)selection.clear();
  for(const id of ids){if(shift&&all)selection.delete(id);else selection.add(id);}nodeSelection.clear();render();
}
function enterNodes(id){const shape=byId(id);if(!shape||shape.locked||!shape.visible)return;tracePreview.hide();selection=new Set([id]);nodeSelection.clear();setTool('node');tab('properties');}
function exitNodeEdit(){
  if(worker||exporting)return;if(drag)cancelGesture();nodeSelection.clear();selection.clear();setTool('select');
  status('已退出节点编辑；修改保留，双击图形可再次编辑。');
}
function renderLayers(){renderLayerTree(doc,selection,{onSelect:selectIds,onEdit:enterNodes,onChange:commit,onContext:showContext,onNotice:toast});}
function renderCommandState(){
  const c=capabilities(doc,selection,nodeSelection.size,!!worker||exporting);
  for(const b of document.querySelectorAll('button[data-tool]'))if(b.dataset.tool in c)b.disabled=!c[b.dataset.tool];
  for(const b of document.querySelectorAll('[data-boolean]'))b.disabled=!c.boolean;
  const state={'export-btn':c.export,'group-btn':c.group,'ungroup-btn':c.ungroup,'smooth-btn':c.nodes,'corner-btn':c.nodes,'join-btn':c.join,'close-btn':c.close,'simplify-btn':c.selection,'delete-btn':c.selection,'split-objects':c.split,'raise-btn':c.selection,'lower-btn':c.selection,'no-fill':c.selection,'fill-color':c.selection,'stroke-color':c.selection,'stroke-width':c.selection,'rail-color-btn':c.selection,'outline-btn':c.export,'reference-btn':!!doc.image};
  for(const [id,enabled]of Object.entries(state))$(id).disabled=!enabled;
  for(const b of $('swatches').querySelectorAll('button'))b.disabled=!c.selection;
  modeFields();
}
function renderProperties(){
  const list=selected(),s=list.length===1?list[0]:null;$('selection-count').textContent=`${list.length} 个对象`;
  $('shape-name').disabled=!s;$('shape-name').value=s?.name||'';
  const b=s?G.bounds(s):null;for(const [id,k]of [['prop-x','x'],['prop-y','y'],['prop-w','width'],['prop-h','height']]){$(id).disabled=!b;$(id).value=b?Math.round(b[k]*100)/100:'';}
  if(s&&s.fill!=='none')$('fill-color').value=s.fill;else $('fill-color').value=fillColor;
  if(s&&s.stroke!=='none')$('stroke-color').value=s.stroke;$('stroke-width').value=s?.strokeWidth||0;
}
function syncReference(){const image=$('reference'),preview=$('image-preview');preview.replaceChildren();if(doc.image){image.setAttribute('href',doc.image.src);image.setAttribute('width',doc.image.width);image.setAttribute('height',doc.image.height);const img=document.createElement('img');img.src=doc.image.src;img.alt='本地参考图';preview.append(img);}else{image.removeAttribute('href');const span=document.createElement('span');span.textContent='尚未导入参考图片';preview.append(span);}tracePreview.reset();}

// Direct segment dragging is limited to node mode and its existing edit selection.
const curveFeedback=svg('g',{'pointer-events':'none',id:'curve-drag-feedback'});canvas.append(curveFeedback);
let curveHoverFrame=null,curveHoverEvent=null;
function clearCurveHover(){
  if(curveHoverFrame!==null)cancelAnimationFrame(curveHoverFrame);
  curveHoverFrame=null;curveHoverEvent=null;curveFeedback.replaceChildren();canvas.style.cursor='';delete canvas.dataset.curveDrag;
}
function drawCurveFeedback(hit){
  curveFeedback.replaceChildren();const r=byId(hit.sid||hit.id)?.rings[hit.ri??hit.ringIndex],i=hit.index;
  if(!r?.nodes[i])return;const a=r.nodes[i],b=r.nodes[(i+1)%r.nodes.length],z=scale();
  curveFeedback.append(svg('path',{d:G.pathData({rings:[{closed:false,nodes:[a,b]}]}),fill:'none',stroke:'#2868c7','stroke-width':3/z,'stroke-linecap':'round'}));
  if(hit.type==='curve'){
    const q=draggedCurvePoint(a,b,hit.basis);
    curveFeedback.append(svg('circle',{cx:q.x,cy:q.y,r:4/z,fill:'white',stroke:'#2868c7','stroke-width':1.5/z}));
  }
  canvas.style.cursor=curveDragCursor(hit.type==='curve');
  canvas.dataset.curveDrag=hit.type==='curve'?'dragging':'ready';
}
function hoverCurve(event){
  curveHoverEvent={clientX:event.clientX,clientY:event.clientY,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey};
  if(curveHoverFrame!==null)return;
  curveHoverFrame=requestAnimationFrame(()=>{
    curveHoverFrame=null;const e=curveHoverEvent;curveHoverEvent=null;
    if(!e||tool!=='node'||drag||worker||exporting||space||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey){clearCurveHover();return;}
    const p=point(e),h=pickEditorPoint(doc.shapes,selection,nodeSelection,p,scale());
    if(h.node||h.handle){clearCurveHover();return;}
    const hit=pickCurveSegment(doc.shapes,selection,p,scale());if(hit)drawCurveFeedback(hit);else clearCurveHover();
  });
}
function updateCurveDrag(p){
  const d=drag;if(d?.type!=='curve')return;
  d.moved=d.moved||G.dist(d.start,p)*d.startScale>=3;
  if(!d.moved)return;
  const shape=byId(d.sid),r=shape?.rings[d.ri],a=r?.nodes[d.index],b=r?.nodes[d.nextIndex];
  if(!shape?.visible||shape.locked||!a||!b){cancelGesture();return;}
  try{const handles=curveDragHandles(d.basis,G.sub(p,d.start));a.out=handles.out;b.in=handles.in;}
  catch(error){cancelGesture();toast(error.message,true);return;}
  render();
}

// Pointer tools. All edits are committed once on pointer-up, not on every frame.
canvas.addEventListener('pointerdown',event=>attempt(()=>{
  interacted=true;if(worker||exporting||event.button===2||drag?.type==='curve')return;clearCurveHover();canvas.focus();canvas.setPointerCapture(event.pointerId);
  const p=point(event),id=event.target.closest('[data-id]')?.getAttribute('data-id');
  const hitPoint=tool==='node'?pickEditorPoint(doc.shapes,selection,nodeSelection,p,scale()):{};
  const hkey=hitPoint.node?null:hitPoint.handle||event.target.getAttribute('data-handle'),nkey=hitPoint.handle?null:hitPoint.node||event.target.getAttribute('data-node');
  if(space||event.button===1||tool==='pan'){drag={type:'pan',client:{x:event.clientX,y:event.clientY},view:{...view}};event.preventDefault();return;}
  tracePreview.hide();
  if(!id&&!hkey&&!nkey&&tool==='select'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){const hole=holeAt(doc.shapes,p);if(hole){selectRingNodes(hole.id,hole.ringIndex);return;}}
  if(['select','node','add'].includes(tool)&&!hkey){
    if(event.altKey){const key=nkey||nearestAnchor(p,id);if(key){const [sid]=key.split('|');enterNodes(sid);nodeSelection=new Set([key]);deleteSelection();}return;}
    if(event.ctrlKey||event.metaKey){const hit=findCurve(p,id);if(hit)addNodeAt(hit);return;}
  }
  if(['rect','ellipse','knife'].includes(tool)){drag={type:tool,start:p,current:p};return;}
  if(tool==='pen'){penPoint(precision.snapPen(p,event));precision.clearSnap();return;}
  if(tool==='fill'){if(id){const s=byId(id);if(!s.rings.every(r=>r.closed)){toast('开放路径请先闭合后填色。');return;}s.fill=fillColor;selection=new Set([id]);commit('已填色');}return;}
  if(hkey&&tool==='node'){const [sid,ri,ni,side]=hkey.split('|');const n=byId(sid).rings[+ri].nodes[+ni];nodeSelection=new Set([keyFor(sid,+ri,+ni)]);drag={type:'handle',sid,ri:+ri,ni:+ni,side,otherLength:Math.hypot(n[side==='in'?'out':'in'].x,n[side==='in'?'out':'in'].y),start:p};renderOverlay();return;}
  if(nkey&&tool==='node'){
    if(event.shiftKey){if(nodeSelection.has(nkey)){nodeSelection.delete(nkey);renderOverlay();return;}else nodeSelection.add(nkey);}else if(!nodeSelection.has(nkey))nodeSelection=new Set([nkey]);
    drag={type:'nodes',anchorKey:nkey,start:p,original:new Map([...nodeSelection].map(k=>{const[sid,ri,ni]=k.split('|');return [k,G.clone(byId(sid).rings[+ri].nodes[+ni])];}))};renderOverlay();return;
  }
  if(tool==='add'||tool==='scissors'){
    const hit=findCurve(p,id);if(!hit)return;
    if(tool==='add'){addNodeAt(hit);}else scissors(hit);return;
  }
  // A near-contour press bends just that segment; Shift forces marquee instead.
  // Node / handle / Ctrl / Alt / pan handling above always has priority.
  if(tool==='node'&&!event.shiftKey){
    const hit=pickCurveSegment(doc.shapes,selection,p,scale());
    if(hit){
      const r=byId(hit.id).rings[hit.ringIndex],nextIndex=(hit.index+1)%r.nodes.length;
      const basis=beginCurveDrag(r.nodes[hit.index],r.nodes[nextIndex],hit.t);
      drag={type:'curve',sid:hit.id,ri:hit.ringIndex,index:hit.index,nextIndex,basis,start:p,current:p,
        startScale:scale(),pointerId:event.pointerId,moved:false,beforeNodes:new Set(nodeSelection)};
      nodeSelection=new Set([keyFor(hit.id,hit.ringIndex,hit.index),keyFor(hit.id,hit.ringIndex,nextIndex)]);
      event.preventDefault();render();return;
    }
  }
  // In node mode a filled path is a marquee surface, not an object drag.
  // Keep the edited objects fixed for the gesture; resolve single clicks later.
  if(tool==='node'){
    drag={type:'node-box',start:p,current:p,moved:false,clickId:id,
      targets:new Set(selected().map(s=>s.id)),beforeNodes:new Set(nodeSelection),
      previous:event.shiftKey?new Set(nodeSelection):new Set(),additive:event.shiftKey};
    event.preventDefault();return;
  }
  if(id){
    const ids=tool==='select'?[...Groups.expandSelection(doc,[id])]:[id];
    if(ids.some(sid=>byId(sid)?.locked||!byId(sid)?.visible)){toast('群组包含隐藏或锁定对象，请先显示并解锁。');return;}
    if(event.shiftKey)selectIds(ids,true);else if(!selection.has(id))selectIds(ids);nodeSelection.clear();
    if(tool==='select')drag={type:'move',start:p,original:new Map(selected().map(s=>[s.id,G.clone(s)]))};
    render();return;
  }
  drag={type:'box',start:p,current:p,previous:event.shiftKey?new Set(selection):new Set()};
  if(!event.shiftKey&&tool!=='node'){selection.clear();nodeSelection.clear();render();}
}));
canvas.addEventListener('pointermove',event=>attempt(()=>{
  if(worker)return;const p=point(event);
  if(!drag){if(tool==='node')hoverCurve(event);if(drawingId){const snapped=precision.snapPen(p,event);const n=byId(drawingId)?.rings[0].nodes.at(-1);if(n){$('gesture').replaceChildren(svg('line',{x1:n.x,y1:n.y,x2:snapped.x,y2:snapped.y,stroke:'#4b9a87','stroke-width':1/scale(),'stroke-dasharray':`${4/scale()} ${3/scale()}`}));}}return;}
  if(drag.type==='curve'){if(event.pointerId!==drag.pointerId)return;drag.current=p;updateCurveDrag(p);return;}
  drag.current=p;
  if(drag.type==='pan'){const z=scale();view={...drag.view,x:drag.view.x-(event.clientX-drag.client.x)/z,y:drag.view.y-(event.clientY-drag.client.y)/z};updateView();return;}
  if(drag.type==='move'){let delta=G.sub(p,drag.start);if(event.shiftKey)delta=Math.abs(delta.x)>Math.abs(delta.y)?G.vec(delta.x,0):G.vec(0,delta.y);for(const [id,orig]of drag.original){const s=byId(id);s.rings=G.clone(orig.rings);G.translate(s,delta);}render();return;}
  if(drag.type==='nodes'){
    const delta=precision.snapNode(drag,p,event);for(const [key,orig]of drag.original){const[id,ri,ni]=key.split('|'),n=byId(id).rings[+ri].nodes[+ni];n.x=orig.x+delta.x;n.y=orig.y+delta.y;}render();return;
  }
  if(drag.type==='handle'){
    const n=byId(drag.sid).rings[drag.ri].nodes[drag.ni];let delta=G.sub(p,n);if(event.shiftKey){const a=Math.round(Math.atan2(delta.y,delta.x)/(Math.PI/4))*Math.PI/4,len=Math.hypot(delta.x,delta.y);delta=G.vec(Math.cos(a)*len,Math.sin(a)*len);}n[drag.side]=delta;
    if(!event.altKey){const len=Math.hypot(delta.x,delta.y);n[drag.side==='in'?'out':'in']=len?G.mul(delta,-(drag.otherLength||len)/len):G.vec();}render();return;
  }
  if(drag.type==='node-box'){
    drag.moved=drag.moved||G.dist(drag.start,p)*scale()>=3;
    if(!drag.moved)return;
    selectMarqueeNodes(drag,p);renderOverlay();
  }
  drawGesture(event.shiftKey);
}));
function selectMarqueeNodes(d,p){
  nodeSelection=new Set(d.previous);
  const x1=Math.min(d.start.x,p.x),x2=Math.max(d.start.x,p.x);
  const y1=Math.min(d.start.y,p.y),y2=Math.max(d.start.y,p.y);
  for(const s of doc.shapes){
    if(!d.targets.has(s.id)||!s.visible||s.locked)continue;
    s.rings.forEach((r,ri)=>r.nodes.forEach((n,ni)=>{
      if(n.x>=x1&&n.x<=x2&&n.y>=y1&&n.y<=y2)nodeSelection.add(keyFor(s.id,ri,ni));
    }));
  }
}
function drawGesture(square=false){const group=$('gesture');group.replaceChildren();if(!drag)return;let p=drag.current,a=drag.start;const z=scale();if(drag.type==='knife'){group.append(svg('line',{x1:a.x,y1:a.y,x2:p.x,y2:p.y,stroke:'#cb7563','stroke-width':1.7/z,'stroke-dasharray':`${6/z} ${3/z}`}));for(const endpoint of [a,p])group.append(svg('circle',{cx:endpoint.x,cy:endpoint.y,r:3/z,fill:'#cb7563',stroke:'white','stroke-width':1/z}));return;}
  let w=p.x-a.x,h=p.y-a.y;if(square&&['rect','ellipse'].includes(drag.type)){const m=Math.max(Math.abs(w),Math.abs(h));w=Math.sign(w||1)*m;h=Math.sign(h||1)*m;drag.current=G.add(a,G.vec(w,h));}const b={x:Math.min(a.x,a.x+w),y:Math.min(a.y,a.y+h),width:Math.abs(w),height:Math.abs(h)};
  group.append(svg(drag.type==='ellipse'?'ellipse':'rect',{...(drag.type==='ellipse'?{cx:b.x+b.width/2,cy:b.y+b.height/2,rx:b.width/2,ry:b.height/2}:b),fill:drag.type.includes('box')?'#2f927215':fillColor+'33',stroke:'#348e7c','stroke-width':1/z,'stroke-dasharray':`${4/z} ${3/z}`}));}
canvas.addEventListener('pointerup',event=>attempt(()=>{
  if(!drag)return;
  if(drag.type==='curve'){
    if(event.pointerId!==drag.pointerId)return;updateCurveDrag(point(event));
    if(!drag)return;const d=drag;drag=null;clearCurveHover();
    const r=byId(d.sid)?.rings[d.ri],a=r?.nodes[d.index],b=r?.nodes[d.nextIndex];
    const changed=d.moved&&a&&b&&(a.out.x!==d.basis.oldOut.x||a.out.y!==d.basis.oldOut.y||b.in.x!==d.basis.oldIn.x||b.in.y!==d.basis.oldIn.y);
    if(changed)commit('已弯曲线段：两个端点保持不动，Ctrl Z 可撤销');else render();return;
  }
  // Re-evaluate the final pointer position, even if no final pointermove arrived.
  if(drag.type==='nodes'&&G.dist(drag.start,point(event))>.01){const delta=precision.snapNode(drag,point(event),event);for(const[key,orig]of drag.original){const[id,ri,ni]=key.split('|'),n=byId(id).rings[+ri].nodes[+ni];n.x=orig.x+delta.x;n.y=orig.y+delta.y;}}
  const d=drag;drag=null;precision.clearSnap();$('gesture').replaceChildren();
  if(d.type==='pan')return;const p=d.type==='node-box'?point(event):d.current||point(event);
  if(d.type==='node-box'){
    const moved=d.moved||G.dist(d.start,p)*scale()>=3;
    if(moved){selectMarqueeNodes(d,p);render();return;}
    // A click in a hole still selects its whole contour. A drag from that same
    // point is a marquee, so it must not select/delete the entire hole.
    const hole=!d.clickId?holeAt(doc.shapes,d.start):null;
    if(hole){selectRingNodes(hole.id,hole.ringIndex);return;}
    if(d.clickId&&!selection.has(d.clickId)&&!selected().length){
      const shape=byId(d.clickId);
      if(shape?.visible&&!shape.locked){selectIds([d.clickId],d.additive);return;}
    }
    nodeSelection=new Set(d.previous);render();return;
  }
  if(['move','nodes','handle'].includes(d.type)){if(G.dist(d.start,point(event))>.01)commit('已调整形状');else render();return;}
  if(d.type==='box'){
    const b={x:Math.min(d.start.x,p.x),y:Math.min(d.start.y,p.y),width:Math.abs(p.x-d.start.x),height:Math.abs(p.y-d.start.y)};
    selection=d.previous;for(const s of doc.shapes){if(!s.visible||s.locked)continue;const a=G.bounds(s);if(a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y){const group=Groups.expandSelection(doc,[s.id]);if([...group].every(id=>byId(id).visible&&!byId(id).locked))for(const id of group)selection.add(id);}}render();return;
  }
  if(G.dist(d.start,p)<2/scale())return;
  if(d.type==='knife'){performCut(d.start,point(event));return;}
  const x=Math.min(d.start.x,p.x),y=Math.min(d.start.y,p.y),w=Math.abs(p.x-d.start.x),h=Math.abs(p.y-d.start.y);if(w<.1||h<.1)return;
  const s=d.type==='rect'?rectangle(x,y,w,h,{fill:fillColor,name:'矩形'}):ellipse(x+w/2,y+h/2,w/2,h/2,{fill:fillColor,name:'椭圆'});doc.shapes.push(s);selection=new Set([s.id]);commit('已创建图形');setTool('select');tab('properties');
}));
function cancelGesture(){
  if(drag?.type==='curve'){
    const r=byId(drag.sid)?.rings[drag.ri];
    if(r?.nodes[drag.index]&&r?.nodes[drag.nextIndex]){r.nodes[drag.index].out=G.clone(drag.basis.oldOut);r.nodes[drag.nextIndex].in=G.clone(drag.basis.oldIn);}
    nodeSelection=new Set(drag.beforeNodes);
  }
  clearCurveHover();if(drag&&['move','nodes','handle'].includes(drag.type)){doc=JSON.parse(history.states[history.index]);}if(drag?.type==='node-box')nodeSelection=new Set(drag.beforeNodes);drag=null;precision?.clearSnap();$('gesture').replaceChildren();render();}
canvas.addEventListener('pointerleave',()=>{if(!drag)clearCurveHover();});
canvas.addEventListener('pointercancel',cancelGesture);
canvas.addEventListener('lostpointercapture',()=>{if(drag)cancelGesture();});
canvas.addEventListener('dblclick',e=>attempt(()=>{
  if(worker||!['node','select'].includes(tool)||e.ctrlKey||e.metaKey||e.altKey)return;
  const p=point(e),editorHit=tool==='node'?pickEditorPoint(doc.shapes,selection,nodeSelection,p,scale()):{};
  const hole=holeAt(doc.shapes,p);
  const id=e.target.closest('[data-id]')?.getAttribute('data-id')||e.target.getAttribute('data-node')?.split('|')[0]||editorHit.node?.split('|')[0]||editorHit.handle?.split('|')[0]||shapeAt(p)?.id||hole?.id||findCurve(p)?.shape.id;
  if(id){if(hole)selectRingNodes(hole.id,hole.ringIndex);else enterNodes(id);}
  else if(tool==='node'){exitNodeEdit();}
}));
function shapeAt(p){
  const paths=[...$('objects').querySelectorAll('path[data-id]')].reverse();
  for(const path of paths){const shape=byId(path.getAttribute('data-id'));if(!shape||!shape.visible||shape.locked)continue;
    if((shape.fill!=='none'&&!outline&&path.isPointInFill(p))||path.isPointInStroke(p))return shape;
  }return null;
}
function addNodeAt(hit){
  if(hit.shape.locked||!hit.shape.visible)return;
  const ring=hit.shape.rings[hit.ringIndex];
  if(G.dist(hit.point,ring.nodes[hit.index])<2/scale()||G.dist(hit.point,ring.nodes[(hit.index+1)%ring.nodes.length])<2/scale()){toast('这里已经有节点，请点击两个节点之间的曲线。');return;}
  const count=doc.shapes.reduce((n,s)=>n+s.rings.reduce((m,r)=>m+r.nodes.length,0),0);if(count>=50000)throw new Error('节点数量已达到上限。');
  const ni=G.insertNode(ring,hit.index,hit.t);if(ni===null)return;selection=new Set([hit.shape.id]);nodeSelection=new Set([keyFor(hit.shape.id,hit.ringIndex,ni)]);commit('已增加节点，曲线形状保持不变');setTool('node');
}
function nearestAnchor(p,id){
  let best=null,distance=12/scale();const pool=id?[byId(id)]:selected();
  for(const s of pool){if(!s||s.locked||!s.visible)continue;s.rings.forEach((r,ri)=>r.nodes.forEach((n,ni)=>{const d=G.dist(n,p);if(d<distance){distance=d;best=keyFor(s.id,ri,ni);}}));}return best;
}
canvas.addEventListener('wheel',e=>{e.preventDefault();if(drag?.type==='curve')return;zoom(Math.exp(Math.max(-1,Math.min(1,e.deltaY*.0015))),point(e));},{passive:false});
canvas.addEventListener('contextmenu',e=>showContext(e));
function findCurve(p,id){let best=null;const pool=id?[byId(id)]:selected().length?selected():doc.shapes.filter(s=>s.visible&&!s.locked);for(const s of pool){if(!s||s.locked||!s.visible)continue;const h=G.nearestCurve(s,p);if(h&&(!best||h.distance<best.distance))best={...h,shape:s};}return best&&best.distance<=12/scale()?best:null;}
function penPoint(p){
  if(!drawingId){const s=makeShape([{closed:false,nodes:[G.node(p.x,p.y)]}],{name:'钢笔路径',fill:'none',stroke:fillColor,strokeWidth:2});doc.shapes.push(s);drawingId=s.id;selection=new Set([s.id]);render();return;}
  const s=byId(drawingId),r=s.rings[0];
  if(r.nodes.length>=3&&G.dist(p,r.nodes[0])<9/scale()){r.closed=true;s.fill=fillColor;s.stroke='none';s.strokeWidth=0;finishPen();return;}
  r.nodes.push(G.node(p.x,p.y));render();
}
function finishPen(){if(!drawingId)return;precision?.clearSnap();const s=byId(drawingId);if(s.rings[0].nodes.length<2)doc.shapes=doc.shapes.filter(o=>o.id!==drawingId);drawingId=null;$('gesture').replaceChildren();commit('已完成钢笔路径');}
function scissors(hit){
  const s=hit.shape;if(s.rings.length!==1)throw new Error('复合镂空图形请用「切割」；剪断只支持单条路径。');
  const r=s.rings[0];const ni=G.insertNode(r,hit.index,Math.max(.001,Math.min(.999,hit.t)));
  if(r.closed){r.nodes=[...r.nodes.slice(ni),...r.nodes.slice(0,ni),G.clone(r.nodes[ni])];r.closed=false;r.nodes[0].in=G.vec();r.nodes.at(-1).out=G.vec();}
  else{const tail=G.clone(r.nodes.slice(ni));r.nodes=r.nodes.slice(0,ni+1);r.nodes.at(-1).out=G.vec();tail[0].in=G.vec();Groups.replaceShapes(doc,[s.id],[s,makeShape([{closed:false,nodes:tail}],{name:s.name+' · 剪断',fill:'none',stroke:s.stroke==='none'?s.fill==='none'?fillColor:s.fill:s.stroke,strokeWidth:s.strokeWidth||2})]);}
  s.stroke=s.stroke==='none'?(s.fill==='none'?fillColor:s.fill):s.stroke;s.strokeWidth=s.strokeWidth||2;s.fill='none';selection=new Set([s.id]);commit('路径已剪断');setTool('node');
}
function shapeResults(rings,source,name){return G.groupRings(rings).map((g,i)=>makeShape(g.map(p=>G.ring(p)),{fill:source.fill,stroke:source.stroke,strokeWidth:source.strokeWidth,...(source.groupId?{groupId:source.groupId}:{}),name:`${name}${i?' '+(i+1):''}`}));}
function performCut(a,b){
  const targets=selected().length?selected():doc.shapes.filter(s=>s.visible&&!s.locked);const changes=new Map();
  for(const s of targets){if(!s.rings.every(r=>r.closed))continue;const parts=G.cutRings(G.flattenShape(s),a,b);if(!parts[0].length||!parts[1].length)continue;changes.set(s.id,parts.flatMap(r=>shapeResults(r,s,s.name+' · 切片')));}
  if(!changes.size){toast('这段切割线未贯穿闭合区域；起点和终点不会自动延长。剪开单条轮廓请用「剪断」。');return;}
  doc.shapes=doc.shapes.flatMap(s=>changes.get(s.id)||[s]);selection=new Set([...changes.values()].flat().map(s=>s.id));commit('已按起点到终点的有限线段切割；0.35 px 曲线近似');tab('properties');
}
function performBoolean(op){
  const list=selected();if(list.length<2)throw new Error('请先用 Shift 选择至少两个闭合对象。');
  if(list.some(s=>!s.rings.every(r=>r.closed)))throw new Error('几何运算需要闭合图形，请先闭合路径。');
  let result=G.flattenShape(list[0]);for(const s of list.slice(1))result=G.booleanRings(result,G.flattenShape(s),op);
  const out=shapeResults(result,list[0],{union:'合并结果',subtract:'相减结果',intersect:'交集结果'}[op]);Groups.replaceShapes(doc,list.map(s=>s.id),out);selection=new Set(out.map(s=>s.id));commit('几何运算完成（0.35 px 曲线近似）');
}
function selectRingNodes(id,ri){
  const shape=byId(id);if(worker||exporting||!shape||shape.locked||!shape.visible||!shape.rings[ri])return;
  enterNodes(id);nodeSelection=new Set(shape.rings[ri].nodes.map((_,ni)=>keyFor(id,ri,ni)));render();
  toast('已选中整条轮廓；Delete 删除该轮廓，镂空会填实。Ctrl Z 可撤销。');
}
function deleteSelection(){
  if(tool==='node'&&nodeSelection.size){
    const plans=[];
    for(const shape of selected()){
      const whole=shape.rings.map((ring,ri)=>({ring,ri})).filter(({ring,ri})=>ring.nodes.length&&ring.nodes.every((_,ni)=>nodeSelection.has(keyFor(shape.id,ri,ni)))).map(r=>r.ri);
      if(whole.length){const copy=G.clone(shape);removeContours(copy,whole);plans.push([shape,copy.rings]);}
    }
    if(plans.length){for(const [shape,rings]of plans)shape.rings=rings;doc.shapes=doc.shapes.filter(shape=>shape.rings.length);nodeSelection.clear();commit('已删除整条轮廓；删除内轮廓会填实镂空，其他对象保持不变');return;}
  }
  if(tool==='node'&&nodeSelection.size){let removed=0;const groups=new Map();for(const key of nodeSelection){const[id,ri,ni]=key.split('|'),gkey=`${id}|${ri}`;if(!groups.has(gkey))groups.set(gkey,[]);groups.get(gkey).push(+ni);}
    for(const [key,indices]of groups){const[id,ri]=key.split('|'),r=byId(id)?.rings[+ri];if(!r)continue;for(const ni of indices.sort((a,b)=>b-a))if(r.nodes.length>(r.closed?3:2)){r.nodes.splice(ni,1);removed++;}}
    if(!removed){toast('闭合轮廓至少保留 3 个节点；删除整个对象请切换选择工具。');return;}nodeSelection.clear();commit(`已删除 ${removed} 个节点`);return;}
  const ids=new Set(selected().map(s=>s.id));if(!ids.size)return;doc.shapes=doc.shapes.filter(s=>!ids.has(s.id));selection.clear();commit('已删除对象');
}
function editNodes(mode){
  if(!selected().length)throw new Error('请先选择对象。');for(const s of selected())s.rings.forEach((r,ri)=>r.nodes.forEach((n,ni)=>{
    if(nodeSelection.size&&!nodeSelection.has(keyFor(s.id,ri,ni)))return;
    if(mode==='corner'){n.in=G.vec();n.out=G.vec();return;}
    const prev=r.nodes[(ni-1+r.nodes.length)%r.nodes.length],next=r.nodes[(ni+1)%r.nodes.length];const tangent=G.sub(next,prev),len=Math.hypot(tangent.x,tangent.y)||1;
    n.in=(!r.closed&&ni===0)?G.vec():G.mul(tangent,-G.dist(prev,n)/(3*len));n.out=(!r.closed&&ni===r.nodes.length-1)?G.vec():G.mul(tangent,G.dist(next,n)/(3*len));
  }));commit(mode==='corner'?'已设为尖角':'已平滑节点；请检查细节');setTool('node');
}
function joinPaths(){const list=selected();if(list.length!==2||list.some(s=>s.rings.length!==1||s.rings[0].closed))throw new Error('请选择两条单独的开放路径。');
  const a=G.clone(list[0]),b=G.clone(list[1]),ra=a.rings[0],rb=b.rings[0];let best={d:Infinity};for(let i=0;i<2;i++)for(let j=0;j<2;j++){const d=G.dist(i?ra.nodes.at(-1):ra.nodes[0],j?rb.nodes.at(-1):rb.nodes[0]);if(d<best.d)best={d,i,j};}
  if(best.i===0)G.reverseRing(ra);if(best.j===1)G.reverseRing(rb);
  if(best.d<.5){ra.nodes.at(-1).out=G.clone(rb.nodes[0].out);ra.nodes.push(...rb.nodes.slice(1));}else{ra.nodes.at(-1).out=G.vec();rb.nodes[0].in=G.vec();ra.nodes.push(...rb.nodes);}
  a.name='连接路径';a.id=uid();Groups.replaceShapes(doc,list.map(s=>s.id),[a]);selection=new Set([a.id]);commit('已连接最近的两个端点');setTool('node');}
function closePaths(){let count=0;for(const s of selected())for(const r of s.rings)if(!r.closed&&r.nodes.length>=3){if(G.dist(r.nodes[0],r.nodes.at(-1))<.5){r.nodes[0].in=r.nodes.at(-1).in;r.nodes.pop();}r.closed=true;if(s.fill==='none')s.fill=fillColor;count++;}if(!count)throw new Error('请选择至少有 3 个节点的开放路径。');commit('路径已闭合');}
function simplifySelected(){if(!selected().length)throw new Error('请先选择对象。');for(const s of selected())s.rings=s.rings.map(r=>{const points=G.flattenRing(r,.35);return G.ring(r.closed?G.simplifyRing(points,+$('tolerance').value):G.simplifyLine(points,+$('tolerance').value),r.closed);});nodeSelection.clear();commit('已简化为折线轮廓；必要时再平滑节点');}
function splitObjects(){const ids=new Set(),changes=new Map();for(const s of selected()){if(!s.rings.every(r=>r.closed))continue;const groups=G.groupRings(G.flattenShape(s));if(groups.length<2)continue;const out=groups.map((g,i)=>makeShape(g.map(p=>G.ring(p)),{fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,...(s.groupId?{groupId:s.groupId}:{}),name:s.name+' '+(i+1)}));changes.set(s.id,out);out.forEach(o=>ids.add(o.id));}if(!changes.size){toast('没有需要拆分的独立区域；孔洞不会拆成实心色块。');return;}doc.shapes=doc.shapes.flatMap(s=>changes.get(s.id)||[s]);selection=ids;commit('已拆分独立区域并保留镂空');}
function reorder(direction,toEdge=false){if(!selected().length)return;selection=Groups.reorderSelection(doc,selection,direction,toEdge);commit('已调整叠放顺序，群组保持完整');}
function groupSelected(){selection=Groups.createGroup(doc,selection);nodeSelection.clear();commit('已群组；几何形状未合并');setTool('select');tab('layers');}
function ungroupSelected(){selection=Groups.ungroup(doc,selection);nodeSelection.clear();commit('已解开一层群组');tab('layers');}
function duplicateSelected(){selection=Groups.duplicateSelection(doc,selection);nodeSelection.clear();commit('已复制副本');setTool('select');}
function applyFill(color){fillColor=color;$('fill-color').value=color;for(const s of selected())s.fill=color;if(selected().length)commit('已修改填充');else render();}

// File input / output. All image URLs are local blob/data URLs.
async function checkDiscard(){finishPen();return library.guard();}
async function openFile(file){
  if(worker){toast('请先取消当前描摹。');return;}if(!file)return;interacted=true;
  if(file.size>24*1024*1024)throw new Error('文件超过 24 MB，请先缩小图片或项目。');
  if(/\.(vstudio|json)$/i.test(file.name)){
    const next=validateDocument(JSON.parse(await file.text()));if(!await checkDiscard())return;
    library.reset();doc=next;savedState=JSON.stringify(doc);referenceRevision++;history.reset(doc);dirty=false;selection.clear();nodeSelection.clear();drawingId=null;syncReference();render();fit();scheduleDraft();toast('项目已打开');return;
  }
  if(!/^image\/(png|jpeg|webp|bmp|x-ms-bmp)$/.test(file.type)&&!(/\.(png|jpe?g|webp|bmp)$/i.test(file.name)))throw new Error('当前支持 PNG / JPG / WebP / BMP 图片，以及 .vstudio 项目。通用 SVG 导入尚未实现。');
  const url=URL.createObjectURL(file);
  try{const img=await loadImage(url);if(img.width*img.height>40e6||img.width>20000||img.height>20000)throw new Error('图片尺寸过大，请先缩小到 4000 万像素以下。');if(!await checkDiscard())return;
    const factor=Math.min(1,1800/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*factor)),h=Math.max(1,Math.round(img.height*factor));
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    library.reset();doc=createDocument();savedState=null;doc.name=file.name.replace(/\.[^.]+$/,'')||'粘贴的图片';doc.width=w;doc.height=h;doc.image={src:c.toDataURL('image/png'),width:w,height:h};referenceRevision++;history.reset(doc);dirty=true;selection.clear();nodeSelection.clear();drawingId=null;showReference=true;syncReference();render();fit();tab('trace');scheduleDraft();toast('图片已导入，拖动右侧参数可预览；满意后点击「生成矢量轮廓」');
  }finally{URL.revokeObjectURL(url);}
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('无法读取图片，请检查格式。'));img.src=src;});}
function cancelTrace(notify=true){tracePreview.cancel();if(notify)toast('已取消描摹，原项目未改动');}
function applyTrace(shapes,replace){
  const existing=replace?doc.shapes.filter(s=>s.source!=='trace'):doc.shapes;
  const next=shapes.map((s,i)=>makeShape(s.rings,{...s,id:uid(),name:`描摹 ${i+1}`,source:'trace'}));
  if(existing.length+next.length>1500||[...existing,...next].reduce((n,s)=>n+s.rings.reduce((m,r)=>m+r.nodes.length,0),0)>50000)throw new Error('结果超出编辑预算，请增大简化容差或降低描摹尺寸。');
  doc.shapes=[...existing,...next];selection=new Set(next.length<=8?next.map(s=>s.id):[]);showReference=false;
  commit(`描摹完成：${next.length} 个可编辑对象`);setTool('select');tab('layers');toast(`已生成 ${next.length} 个对象，可以开始编辑。`);
}
function runTrace(){if(!doc.image||worker)return;finishPen();tracePreview.apply();}
function download(text,type,filename){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function filename(extension){return (doc.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()||'vector')+extension;}
async function saveProject(){await library.save();toast('已保存到此浏览器项目库；可下载 .vstudio 另行备份');}
function downloadProject(){finishPen();validateDocument(doc);download(JSON.stringify(doc,null,2),'application/json',filename('.vstudio'));toast('已下载 .vstudio 备份，包含原图、图层和群组');}
function openExport(){finishPen();if(!capabilities(doc,selection).export)return;$('psd-accept').checked=false;updateExportState();$('export-dialog').showModal();}
function updateExportState(){const reason=psdCapability(doc);$('psd-status').textContent=reason||'可试导出：保留形状层的贝塞尔矢量蒙版与纯色填充，不含参考图。';$('export-psd').disabled=!!reason||!$('psd-accept').checked||exporting;$('export-svg').disabled=exporting;}
async function savePSD(){if(!$('psd-accept').checked)return;const snapshot=validateDocument(G.clone(doc)),name=filename('.psd');exporting=true;updateExportState();render();try{const bytes=await exportPSD(snapshot);download(bytes,'image/vnd.adobe.photoshop',name);toast('已导出实验 PSD；请在 Photoshop 核对形状图层、孔洞和群组');}finally{exporting=false;updateExportState();render();}}
function saveSVG(){finishPen();if(!doc.shapes.some(s=>s.visible))throw new Error('还没有可以导出的矢量对象。');validateDocument(doc);download(exportSVG(doc),'image/svg+xml',filename('.svg'));toast('已导出真实 SVG 路径，不含参考图片');}
async function newProject(){if(!await checkDiscard())return;cancelTrace(false);library.reset();doc=createDocument();savedState=JSON.stringify(doc);referenceRevision++;history.reset(doc);dirty=false;selection.clear();nodeSelection.clear();drawingId=null;syncReference();render();fit();scheduleDraft();}
async function vectorDemo(){if(!await checkDiscard())return;cancelTrace(false);library.reset();doc=createDocument();savedState=null;doc.name='镂空与曲线 · 编辑示例';
  const outer=ellipse(290,340,155,155,{fill:'#e60012',name:'圆环 · 内部透明'}),inner=ellipse(290,340,84,84);outer.rings.push(inner.rings[0]);
  const leaf=makeShape([{closed:true,nodes:[{...G.node(525,492),in:G.vec(180,8),out:G.vec(-30,-225)},{...G.node(730,155),in:G.vec(-158,40),out:G.vec(65,206)}]}],{name:'叶形 · 拖动手柄',fill:'#cdb88f'});
  const disk=ellipse(760,455,89,89,{name:'圆形 · 可移动',fill:'#e60012'});
  doc.shapes=[outer,leaf,disk];history.reset(doc);dirty=true;selection=new Set([leaf.id]);nodeSelection.clear();drawingId=null;referenceRevision++;syncReference();tool='node';setTool('node');render();fit();tab('properties');scheduleDraft();toast('示例中圆环的孔洞是真正透明的；拖动节点试试看');}
async function rasterDemo(){
  const c=document.createElement('canvas');c.width=760;c.height=520;const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,760,520);
  ctx.fillStyle='#20282e';ctx.beginPath();ctx.arc(230,260,145,0,Math.PI*2);ctx.arc(230,260,80,0,Math.PI*2,true);ctx.fill('evenodd');
  ctx.beginPath();ctx.moveTo(430,415);ctx.bezierCurveTo(395,220,480,135,615,90);ctx.bezierCurveTo(680,270,610,440,430,415);ctx.fill();
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));await openFile(new File([blob],'轮廓描摹示例.png',{type:'image/png'}));
}
// Best-effort local draft storage. No cloud account or network persistence.
async function draftDB(){return library.openDB();}
function scheduleDraft(){clearTimeout(saveTimer);const snapshot=G.clone(doc);saveTimer=setTimeout(async()=>{try{const db=await draftDB(),tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(snapshot,'latest');tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();status('草稿保存失败，请手动保存项目文件。');};}catch{status('浏览器草稿不可用，请手动保存项目文件。');}},700);}
async function loadDraft(){try{const db=await draftDB(),tx=db.transaction('drafts','readonly'),request=tx.objectStore('drafts').get('latest');request.onsuccess=()=>{db.close();try{if(request.result){savedDraft=validateDocument(request.result);if(savedDraft.shapes.length||savedDraft.image)$('recover-btn').hidden=false;}}catch{}};request.onerror=()=>db.close();}catch{}}

function showContext(event,layerIds=null){
  if(drag?.type==='curve')cancelGesture();clearCurveHover();
  event.preventDefault();if(worker||exporting)return;
  const p=point(event),nodeKey=event.target.getAttribute('data-node');
  let id=event.target.closest('[data-id]')?.getAttribute('data-id')||nodeKey?.split('|')[0];
  const hole=!id&&!layerIds?holeAt(doc.shapes,p):null;if(hole){selectRingNodes(hole.id,hole.ringIndex);id=hole.id;}
  let ids=layerIds||(hole?[hole.id]:id?[...Groups.expandSelection(doc,[id])]:[]);
  if(ids.length&&!ids.every(id=>selection.has(id)))selectIds(ids);
  if(nodeKey){enterNodes(nodeKey.split('|')[0]);nodeSelection=new Set([nodeKey]);renderOverlay();}
  const c=capabilities(doc,selection,nodeSelection.size),hit=!layerIds?findCurve(p,id):null;
  const command=(id,label,enabled,action,shortcut='')=>({id,label,enabled,action:()=>attempt(action),shortcut});
  const raw=doc.shapes.filter(s=>selection.has(s.id));
  const items=[command('undo','撤销',history.index>0,()=>restore(history.undo()),'Ctrl Z'),command('redo','重做',history.index<history.states.length-1,()=>restore(history.redo()),'Ctrl Shift Z'),null];
  if(raw.length){items.push(
    command('nodes','编辑节点',c.selection,()=>enterNodes(id||selected()[0]?.id),'双击'),
    command('add-node','在这里增加节点',!!hit,()=>addNodeAt(hit),'Ctrl 点击'),
    command('delete-node','删除所选节点',tool==='node'&&nodeSelection.size>0,deleteSelection,'Alt 点击'),null,
    command('duplicate','复制副本',c.selection,duplicateSelected,'Ctrl D'),command('delete',tool==='node'&&nodeSelection.size?'删除所选节点':'删除所选对象',c.selection,deleteSelection,'Delete'),
    command('group','群组',c.group,groupSelected,'Ctrl G'),command('ungroup','解开群组',c.ungroup,ungroupSelected,'Ctrl Shift G'),null,
    command('union','合并形状',c.boolean,()=>performBoolean('union')),command('subtract','底层减去上层',c.boolean,()=>performBoolean('subtract')),command('intersect','保留交集',c.boolean,()=>performBoolean('intersect')),null,
    command('front','置于顶层',c.selection,()=>reorder(1,true)),command('back','置于底层',c.selection,()=>reorder(-1,true)),
    command('hide','隐藏所选',raw.some(s=>s.visible),()=>{raw.forEach(s=>s.visible=false);selection.clear();commit('已隐藏对象');}),
    command('lock',raw.some(s=>s.locked)?'解锁所选':'锁定所选',true,()=>{const locked=!raw.some(s=>s.locked);raw.forEach(s=>s.locked=locked);selection.clear();commit(locked?'已锁定对象':'已解锁对象');}));
  }else{items.push(command('select-all','选择全部矢量',c.node,()=>{selection=new Set(doc.shapes.filter(s=>s.visible&&!s.locked).map(s=>s.id));render();},'Ctrl A'),command('import','导入图片 / 项目',true,()=>{$('file-input').value='';$('file-input').click();}),command('paste-image','粘贴图片',true,()=>$('paste-btn').click(),'Ctrl V'),command('projects','打开项目库',true,()=>library.show()));}
  items.push(...precision.contextItems());items.push(null,command('fit','适合画布',true,fit));contextMenu.show(event,items);
}

// DOM bindings. Binding through a single gate keeps edits disabled while tracing.
function on(id,fn,event='click'){$(id).addEventListener(event,e=>{if(worker&&id!=='cancel-trace'){toast('正在描摹，请先完成或取消。');return;}interacted=true;attempt(()=>fn(e));});}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
document.querySelectorAll('[data-boolean]').forEach(b=>b.onclick=()=>{if(!worker)attempt(()=>performBoolean(b.dataset.boolean));});
for(const id of ['open-btn','welcome-open'])on(id,()=>{$('file-input').value='';$('file-input').click();});
$('file-input').onchange=e=>attemptAsync(()=>openFile(e.target.files[0]));
on('save-btn',saveProject);on('projects-btn',()=>library.show());on('backup-btn',downloadProject);on('export-btn',openExport);on('export-svg',saveSVG);on('export-psd',savePSD);on('close-export',()=>$('export-dialog').close());$('psd-accept').onchange=updateExportState;on('group-btn',groupSelected);on('ungroup-btn',ungroupSelected);on('new-btn',newProject);on('undo-btn',()=>restore(history.undo()));on('redo-btn',()=>restore(history.redo()));
on('fit-btn',fit);on('zoom-in',()=>zoom(1/1.2));on('zoom-out',()=>zoom(1.2));on('zoom-value',()=>zoom(scale()));
on('outline-btn',()=>{outline=!outline;render();});on('reference-btn',()=>{showReference=!showReference;render();});
on('bezier-shortcut',()=>{tab('trace');$('trace-curve-controls').scrollIntoView({block:'start'});$('trace-curve-type').focus();if(!doc.image)toast('先导入或粘贴图片，再选择二次 / 三次贝塞尔轮廓。');});
on('public-btn',()=>publicLibrary.show());
on('demo-btn',vectorDemo);on('raster-demo-btn',()=>attemptAsync(rasterDemo));on('trace-btn',()=>attemptAsync(runTrace));on('cancel-trace',()=>cancelTrace());
on('delete-btn',deleteSelection);on('smooth-btn',()=>editNodes('smooth'));on('corner-btn',()=>editNodes('corner'));on('join-btn',joinPaths);on('close-btn',closePaths);on('simplify-btn',simplifySelected);on('split-objects',splitObjects);on('raise-btn',()=>reorder(1));on('lower-btn',()=>reorder(-1));
on('rail-color-btn',()=>{tab('properties');$('fill-color').click();});
on('help-btn',()=>$('help-dialog').showModal());on('close-help',()=>$('help-dialog').close());on('help-done',()=>$('help-dialog').close());
on('recover-btn',async()=>{if(!savedDraft||!await checkDiscard())return;library.reset();savedState=null;doc=G.clone(savedDraft);referenceRevision++;history.reset(doc);dirty=true;selection.clear();nodeSelection.clear();syncReference();render();fit();$('recover-btn').hidden=true;toast('已恢复浏览器草稿，请保存项目文件');});
on('document-name',()=>{doc.name=$('document-name').value.trim()||'未命名图案';commit('已修改项目名称');},'change');
on('shape-name',()=>{const s=selected()[0];if(s){s.name=$('shape-name').value.trim()||'路径';commit('已修改对象名称');}},'change');
on('fill-color',()=>applyFill($('fill-color').value),'change');on('no-fill',()=>{for(const s of selected())s.fill='none';commit('已取消填充');});
for(const id of ['stroke-color','stroke-width'])on(id,()=>{for(const s of selected()){s.stroke=$('stroke-color').value;s.strokeWidth=Math.max(0,Math.min(100,+$('stroke-width').value||0));}commit('已修改描边');},'change');
for(const [id,dim]of [['prop-x','x'],['prop-y','y'],['prop-w','width'],['prop-h','height']])on(id,()=>{
  const s=selected()[0];if(!s)return;const b=G.bounds(s),value=+$(id).value;if(!Number.isFinite(value))return;
  if(dim==='x'||dim==='y'){G.translate(s,dim==='x'?G.vec(value-b.x,0):G.vec(0,value-b.y));}
  else{if(value<=0||value>10000||b[dim]<1e-6)throw new Error('请输入有效尺寸（0—10000 px）。');const factor=value/b[dim],axis=dim==='width'?'x':'y';for(const r of s.rings)for(const n of r.nodes){n[axis]=b[axis]+(n[axis]-b[axis])*factor;n.in[axis]*=factor;n.out[axis]*=factor;}}
  commit('已调整对象位置或尺寸');
},'change');
for(const [id,output,suffix]of [['threshold','threshold-value',''],['tolerance','tolerance-value',' px'],['speckle','speckle-value',' px²']])$(id).oninput=()=>$(output).textContent=$(id).value+suffix;
function modeFields(){const binary=$('trace-mode').value==='binary',blocked=!doc.image||!!worker;for(const id of ['trace-mode','trace-size','tolerance','speckle','live-preview','preview-display','replace-trace'])$(id).disabled=blocked;$('threshold').disabled=blocked||!binary;$('color-count').disabled=blocked||binary;$('remove-background').disabled=blocked||binary;}
$('trace-mode').onchange=modeFields;
for(const color of ['#e60012','#1c222e','#247a70','#548b8e','#cdb88f','#c76659','#867196','#ffffff']){const b=document.createElement('button');b.style.background=color;b.title=`填充 ${color}`;b.setAttribute('aria-label',`填充 ${color}`);b.onclick=()=>{if(!worker)applyFill(color);};$('swatches').append(b);}
window.addEventListener('paste',e=>{if(/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName))return;const items=[...(e.clipboardData?.items||[])];const img=items.find(i=>i.kind==='file'&&i.type.startsWith('image/'));if(img){e.preventDefault();const file=img.getAsFile();attemptAsync(()=>openFile(file));}});
on('paste-btn',()=>attemptAsync(async()=>{if(!navigator.clipboard?.read){toast('请直接按 Ctrl + V 粘贴图片。');return;}try{const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>/^image\/(png|jpeg|webp|bmp)$/.test(t));if(type){const blob=await item.getType(type);await openFile(new File([blob],'粘贴图片.'+(type.split('/')[1]),{type}));return;}}toast('剪贴板中没有支持的图片。');}catch{toast('浏览器未允许读取剪贴板，请直接按 Ctrl + V。');}}));
workspace.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});workspace.addEventListener('drop',e=>{e.preventDefault();attemptAsync(()=>openFile(e.dataTransfer.files[0]));});
window.addEventListener('keydown',e=>{
  if(['Shift','Alt','Control','Meta',' '].includes(e.key)&&!drag)clearCurveHover();
  if(document.querySelector('dialog[open]')||!$('context-menu').hidden)return;const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);if(editing)return;
  if(worker){if(e.key==='Escape')cancelTrace();return;}
  if(drag){if(e.key==='Escape'){e.preventDefault();cancelGesture();}return;}
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='s'){e.preventDefault();attempt(saveProject);return;}if(mod&&k==='g'){e.preventDefault();const c=capabilities(doc,selection);if(e.shiftKey?c.ungroup:c.group)attempt(e.shiftKey?ungroupSelected:groupSelected);return;}if(mod&&k==='d'){e.preventDefault();if(selected().length)attempt(duplicateSelected);return;}if(mod&&k==='z'){e.preventDefault();restore(e.shiftKey?history.redo():history.undo());return;}if(mod&&k==='y'){e.preventDefault();restore(history.redo());return;}
  if(mod&&k==='a'){e.preventDefault();if(tool==='node'&&selected().length){nodeSelection.clear();for(const s of selected())s.rings.forEach((r,ri)=>r.nodes.forEach((_,ni)=>nodeSelection.add(keyFor(s.id,ri,ni))));}else selection=new Set(doc.shapes.filter(s=>s.visible&&!s.locked).map(s=>s.id));render();return;}
  if(mod)return;if(e.code==='Space'){e.preventDefault();space=true;return;}if(k==='delete'||k==='backspace'){e.preventDefault();attempt(deleteSelection);return;}
  if(k==='escape'){if(tool==='node'&&!drawingId){setTool('select');return;}if(drawingId){doc.shapes=doc.shapes.filter(s=>s.id!==drawingId);drawingId=null;selection.clear();commit('已取消当前钢笔路径');}else{selection.clear();nodeSelection.clear();}drag=null;$('gesture').replaceChildren();render();return;}
  if(k==='enter'){finishPen();return;}if(k==='j'){attempt(joinPaths);return;}if(k==='u'){attempt(()=>performBoolean('union'));return;}
  const tools={v:'select',n:'node',a:'add',p:'pen',k:'knife',c:'scissors',f:'fill',r:'rect',e:'ellipse',h:'pan'};if(tools[k])setTool(tools[k]);
});
window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;clearCurveHover();if(drag)cancelGesture();else precision?.clearSnap();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
let sizeInitialized=false;new ResizeObserver(()=>{if(!sizeInitialized){fit();sizeInitialized=true;}else{const r=workspace.getBoundingClientRect(),center={x:view.x+view.width/2,y:view.y+view.height/2},z=scale();view={x:center.x-r.width/z/2,y:center.y-r.height/z/2,width:r.width/z,height:r.height/z};updateView();}}).observe(workspace);
const tracePreview=createTracePreview({
  getDocument:()=>doc,
  createWorker:()=>new Worker(new URL('./trace-worker.js',import.meta.url),{type:'module'}),
  onApplying:active=>{worker=active?true:null;$('busy').hidden=!active;render();},
  onApply:applyTrace,onError:error=>toast(error.message,true),refresh:render,
  referenceOpacity:()=>showReference?(doc.shapes.length?.28:1):0
});
const contextMenu=createContextMenu();
const library=createProjectLibrary({getDocument:()=>doc,isDirty:()=>dirty,beforeSave:finishPen,
  onSaved:fingerprint=>{if(fingerprint===null){savedState=null;dirty=true;}else if(JSON.stringify(doc)===fingerprint){savedState=fingerprint;dirty=false;}render();},
  onOpen:next=>{cancelTrace(false);doc=next;savedState=JSON.stringify(doc);history.reset(doc);dirty=false;selection.clear();nodeSelection.clear();drawingId=null;referenceRevision++;syncReference();setTool('select');render();fit();scheduleDraft();toast('项目已切换');},
  onError:error=>toast(error.message||'本地存储不可用，请下载项目备份',true)
});
precision=createPrecisionTools({getState:()=>({doc,selection,busy:!!worker||exporting,dragging:!!drag,drawing:drawingId}),getScale:scale,
  select:ids=>{tracePreview.hide();selection=ids;nodeSelection.clear();setTool('select');tab('properties');},commit,refresh:render,notice:toast,showProperties:()=>tab('properties')});
contourPanel=createContourPanel({getState:()=>({doc,selection,nodeSelection,busy:!!worker||exporting}),selectRing:selectRingNodes,deleteSelection:()=>attempt(deleteSelection)});
const publicLibrary=createPublicLibrary({getDocument:()=>doc,guard:checkDiscard,busy:()=>!!worker||exporting,notice:toast,
  onOpen:next=>{cancelTrace(false);library.reset();doc=next;savedState=null;history.reset(doc);dirty=true;selection.clear();nodeSelection.clear();drawingId=null;referenceRevision++;syncReference();setTool('select');render();fit();scheduleDraft();}});
modeFields();syncReference();setTool('select');render();fit();loadDraft();
queueMicrotask(()=>publicLibrary.openLink());
// Read-only diagnostics for browser tests / bug reports, not a remote API.
Object.defineProperty(window,'vectorStudio',{value:Object.freeze({version:VERSION,snapshot:()=>G.clone(doc),selection:()=>[...selection],getTool:()=>tool,preview:()=>tracePreview.diagnostics(),dirty:()=>dirty,activeProject:()=>library.activeId(),precision:()=>precision.diagnostics()}),writable:false});