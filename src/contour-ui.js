import {contourInfo} from './contours.js';
export function createContourPanel({getState,selectRing,deleteSelection}){
  const panel=document.createElement('section');panel.id='contour-panel';panel.className='preview-controls';
  panel.innerHTML='<strong>轮廓 / 镂空编辑</strong><label class="field">选择一条轮廓<select id="contour-select" aria-label="对象内轮廓"></select></label><div class="contour-actions"><button id="select-contour" type="button">选中此轮廓</button><button id="delete-contour" type="button">删除此轮廓</button></div><p class="hint" id="contour-hint">先选中一个矢量图形；镂空不是白色色块。</p>';
  document.getElementById('panel-properties').prepend(panel);
  const select=panel.querySelector('select'),hint=panel.querySelector('#contour-hint');let lastShape=null,lastRings=null,lastCounts='';
  const state=()=>{const {doc,selection,nodeSelection,busy}=getState();const shapes=doc.shapes.filter(s=>selection.has(s.id)&&s.visible&&!s.locked);return {shape:shapes.length===1?shapes[0]:null,nodeSelection,busy};};
  function render(){
    const {shape,nodeSelection,busy}=state();panel.hidden=!shape;
    if(!shape)return;
    const counts=shape.rings.map(r=>r.nodes.length).join(',');
    if(shape!==lastShape||shape.rings!==lastRings||lastCounts!==counts||select.options.length!==shape.rings.length){
      const old=shape===lastShape?select.value:'0';select.replaceChildren();
      for(const entry of contourInfo(shape)){const option=document.createElement('option');option.value=entry.index;option.textContent=`${entry.index+1}. ${!entry.closed?'开放路径':entry.hole?'镂空内轮廓':'外轮廓'} · ${shape.rings[entry.index].nodes.length} 节点`;select.append(option);}
      select.value=shape.rings[+old]?old:'0';lastShape=shape;lastRings=shape.rings;lastCounts=counts;
    }
    const ringIndices=new Set([...nodeSelection].map(k=>k.split('|')).filter(k=>k[0]===shape.id).map(k=>+k[1]));
    if(ringIndices.size===1)select.value=String([...ringIndices][0]);
    for(const el of panel.querySelectorAll('button,select'))el.disabled=busy||!shape.rings.length;
    hint.textContent='点击镂空内部可选中该内轮廓；Delete 删除整圈并填实孔洞。删除外轮廓会连同其内部轮廓移除。Ctrl Z 可撤销。';
  }
  function choose(){const {shape,busy}=state();if(!busy&&shape?.rings[+select.value])selectRing(shape.id,+select.value);}
  panel.querySelector('#select-contour').onclick=choose;
  panel.querySelector('#delete-contour').onclick=()=>{const {shape,busy}=state();if(!busy&&shape?.rings[+select.value]){choose();deleteSelection();}};
  return {render};
}
