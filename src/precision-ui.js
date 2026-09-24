import {layoutUnits,layoutPlan,applyLayout,selectionColor,sameColorIds,anchorTargets,snapIndex} from './precision.js';
/** UI adapter is separate from geometry, with a single history commit per edit. */
export function createPrecisionTools({getState,getScale,select,commit,refresh,notice,showProperties}){
  const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
  let ready=false,snap=null,index=null,indexScale=0,activeDrag=null;
  const svg=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const section=document.createElement('section');section.id='precision-tools';
  section.innerHTML=`<div class="section-title spaced"><h2>对齐与分布</h2><span class="mini-badge" id="layout-count">未选择</span></div>
<label class="field">对齐基准<select id="align-target"><option value="selection">所选整体边界</option><option value="artboard">画板</option></select></label>
<div class="precision-grid"><button data-align="left">左对齐</button><button data-align="center-x">水平居中</button><button data-align="right">右对齐</button><button data-align="top">顶对齐</button><button data-align="center-y">垂直居中</button><button data-align="bottom">底对齐</button></div>
<label class="field">分布方式<select id="distribution-mode"><option value="gap">边缘间距相等</option><option value="center">中心距离相等</option></select></label>
<div class="button-grid"><button data-align="distribute-x">水平分布</button><button data-align="distribute-y">垂直分布</button></div>
<p class="hint">分布需至少 3 个对象／完整群组，首尾不动。群组按整体移动；按路径边界计算，不含描边。</p>
<div class="section-title spaced"><h2>选择同类颜色</h2></div><div class="button-grid"><button id="select-same-fill">相同填充色</button><button id="select-same-stroke">相同描边色</button></div><p class="hint">精确匹配颜色；跳过隐藏／锁定对象，不带上同组的其他颜色。</p>
<div class="section-title spaced"><h2>节点吸附</h2></div><label class="check-row"><input id="snap-enabled" type="checkbox" checked>拖动节点／钢笔落点吸附</label><label class="field">吸附目标<select id="snap-target"><option value="all">全部节点（含端点）</option><option value="endpoints">仅开放路径端点</option></select></label><p class="hint">距离 8 屏幕像素内吸附，显示十字提示。拖动节点途中／钢笔落点时按住 Shift 可暂时关闭。不会自动连接两条路径。</p>`;
  $('panel-properties').querySelector('.coordinates').after(section);
  const style=document.createElement('style');style.textContent='.precision-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.precision-grid button{padding:7px 2px;font-size:11px}#precision-tools .field{margin-top:10px}#snap-guide{pointer-events:none}';document.head.append(style);
  const guide=svg('g',{id:'snap-guide','pointer-events':'none'});$('editor').append(guide);
  try{const value=JSON.parse(localStorage.getItem('vector-studio-precision')||'null');if(value){$('snap-enabled').checked=value.enabled!==false;$('snap-target').value=value.target==='endpoints'?'endpoints':'all';}}catch{}
  function state(){
    const s=getState();let count=0;
    try{count=layoutUnits(s.doc,s.selection).length;}catch{}
    return {...s,count,blocked:!!(s.busy||s.dragging||s.drawing)};
  }
  function run(fn){try{fn();}catch(e){notice(e.message,true);}}
  function layout(command){
    const s=state();if(s.blocked){notice('请先结束当前操作。');return;}
    run(()=>{const plan=layoutPlan(s.doc,s.selection,command,{target:$('align-target').value,spacing:$('distribution-mode').value});
      if(!plan.length){notice('位置已经满足要求，没有修改对象。');return;}
      applyLayout(s.doc,plan);commit(command.startsWith('distribute')?'已均匀分布；首尾不动，群组与曲线保持':'已对齐；群组与曲线保持');});
  }
  function selectColor(property){
    const s=state();if(s.blocked)return;
    run(()=>{const ids=sameColorIds(s.doc,s.selection,property);select(ids);notice(`已选中 ${ids.size} 个相同${property==='fill'?'填充':'描边'}色对象；隐藏和锁定对象未选中`);});
  }
  section.querySelectorAll('[data-align]').forEach(b=>b.onclick=()=>layout(b.dataset.align));
  $('select-same-fill').onclick=()=>selectColor('fill');$('select-same-stroke').onclick=()=>selectColor('stroke');
  $('align-target').onchange=render;
  for(const id of ['snap-enabled','snap-target'])$(id).onchange=()=>{clearSnap();try{localStorage.setItem('vector-studio-precision',JSON.stringify({enabled:$('snap-enabled').checked,target:$('snap-target').value}));}catch{}refresh();};
  function render(){
    if(!ready)return;const s=state();$('layout-count').textContent=s.count?`${s.count} 个单位`:'未选择';
    section.querySelectorAll('[data-align]').forEach(b=>{const distributing=b.dataset.align.startsWith('distribute');b.disabled=s.blocked||s.count<(distributing?3:$('align-target').value==='artboard'?1:2);});
    for(const p of ['fill','stroke'])$('select-same-'+p).disabled=s.blocked||selectionColor(s.doc,s.selection,p)===null;
    paintSnap();
  }
  function clearSnap(){snap=null;index=null;activeDrag=null;guide.replaceChildren();}
  function paintSnap(){
    guide.replaceChildren();if(!snap)return;const z=Math.abs(getScale())||1,p=snap.position;
    guide.append(svg('circle',{cx:p.x,cy:p.y,r:7/z,fill:'none',stroke:'#cc6048','stroke-width':1.5/z}),svg('path',{d:`M${p.x-11/z} ${p.y}h${22/z}M${p.x} ${p.y-11/z}v${22/z}`,fill:'none',stroke:'#cc6048','stroke-width':1/z}));
    const t=svg('text',{x:p.x+12/z,y:p.y-10/z,fill:'#9b412f','font-size':11/z,'paint-order':'stroke',stroke:'white','stroke-width':3/z});t.textContent=snap.endpoint?'端点吸附':'节点吸附';guide.append(t);
  }
  function snapNode(drag,p,event){
    const original=drag.original.get(drag.anchorKey);if(!original)return {x:p.x-drag.start.x,y:p.y-drag.start.y};
    const wanted={x:original.x+p.x-drag.start.x,y:original.y+p.y-drag.start.y},z=Math.abs(getScale())||1;
    if(activeDrag!==drag||z!==indexScale){index=snapIndex(anchorTargets(getState().doc,new Set(drag.original.keys())),z,8);activeDrag=drag;indexScale=z;}
    snap=$('snap-enabled').checked&&!event.shiftKey?index.nearest(wanted,{endpointsOnly:$('snap-target').value==='endpoints'}):null;
    const at=snap?.position||wanted;return {x:at.x-original.x,y:at.y-original.y};
  }
  function snapPen(p,event){
    const s=getState(),excluded=new Set();
    // The current last anchor must not capture every next click. Older start can close normally.
    const shape=s.doc.shapes.find(o=>o.id===s.drawing);
    if(shape)excluded.add(`${shape.id}|0|${shape.rings[0].nodes.length-1}`);
    snap=$('snap-enabled').checked&&!event.shiftKey?snapIndex(anchorTargets(s.doc,excluded),Math.abs(getScale())||1,8).nearest(p,{endpointsOnly:$('snap-target').value==='endpoints'}):null;
    paintSnap();return snap?.position||p;
  }
  function contextItems(){
    const s=state();return [null,{id:'precision-panel',label:'对齐与分布…',enabled:!s.blocked&&s.count>0,action:()=>{showProperties();section.scrollIntoView({block:'nearest'});}},
      ...['fill','stroke'].map(p=>({id:'same-'+p,label:p==='fill'?'选择相同填充色':'选择相同描边色',enabled:!s.blocked&&selectionColor(s.doc,s.selection,p)!==null,action:()=>selectColor(p)}))];
  }
  ready=true;return {render,layout,selectColor,clearSnap,snapNode,snapPen,contextItems,diagnostics:()=>({enabled:$('snap-enabled').checked,target:$('snap-target').value,snap:snap?{...snap}:null})};
}
