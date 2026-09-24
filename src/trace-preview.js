/** Transient, latest-request-wins tracing. Preview never edits the document.
 * Uses the selected resolution for BOTH preview and Apply (no quality swap).
 */
import {pathData} from './geometry.js';
import {VERSION} from './document.js';
export function createTracePreview({getDocument,createWorker,onApplying,onApply,onError,refresh,referenceOpacity}) {
  const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
  mountCurveControls();
  const badge=document.querySelector('.version');if(badge)badge.textContent=VERSION+' 预览版';
  let generation=0,timer=null,timeout=null,worker=null,applying=false;
  let result=null,resultDoc=null,resultKey='',imagePromise=null,imageSource='';
  let visible=true,suspended=false,state='idle';
  const parameters=()=>({size:+$('trace-size').value,options:{mode:$('trace-mode').value,threshold:+$('threshold').value,tolerance:+$('tolerance').value,minArea:+$('speckle').value,colors:+$('color-count').value,removeBackground:$('remove-background').checked,curveType:$('trace-curve-type').value,curveSmoothness:+$('trace-curve-smoothness').value,preserveCorners:$('trace-preserve-corners').checked,curveFitTolerance:+$('trace-fit-tolerance').value}});
  const key=()=>JSON.stringify(parameters());
  const enabled=()=>$('live-preview').checked;
  function setState(next,text){state=next;$('trace-preview-status').dataset.state=next;$('trace-preview-status').textContent=text;$('trace-preview-status').setAttribute('aria-busy',next==='working'||next==='waiting');}
  function setApplying(value){if(applying===value)return;applying=value;onApplying(value);}
  function stop(){generation++;clearTimeout(timer);timer=null;clearTimeout(timeout);worker?.terminate();worker=null;setApplying(false);}
  function matches(){return result!==null&&resultDoc===getDocument()&&resultKey===key()&&imageSource===getDocument().image?.src;}
  function render(){
    const blocked=!getDocument().image||applying,polygon=$('trace-curve-type').value==='polygon';
    $('trace-curve-type').disabled=blocked;
    for(const button of document.querySelectorAll('[data-curve-choice]')){button.disabled=blocked;button.setAttribute('aria-pressed',button.dataset.curveChoice===$('trace-curve-type').value);}
    for(const id of ['trace-curve-smoothness','trace-preserve-corners','trace-fit-tolerance'])$(id).disabled=blocked||polygon;
    $('trace-curve-value').textContent=$('trace-curve-smoothness').value+'%';$('trace-fit-value').textContent=$('trace-fit-tolerance').value+' px';
    const doc=getDocument(),active=!!doc.image&&enabled()&&visible&&!suspended;
    const mode=$('preview-display').value,ready=active&&matches();
    $('trace-preview').style.display=ready&&mode!=='original'?'':'none';
    $('trace-preview-banner').hidden=!active;
    $('objects').style.display=active&&(mode==='original'||!ready)?'none':'';
    const replaced=new Set(ready&&$('replace-trace').checked?doc.shapes.filter(s=>s.source==='trace').map(s=>s.id):[]);
    for(const p of $('objects').children)p.style.display=replaced.has(p.getAttribute('data-id'))?'none':'';
    $('overlays').style.display=active?'none':'';
    $('reference').setAttribute('opacity',active?(mode==='original'||!ready?1:mode==='vector'?0:.35):referenceOpacity());
    for(const p of $('trace-preview').children){p.setAttribute('fill',mode==='overlay'?'#e6001233':p.dataset.fill);p.setAttribute('stroke',mode==='overlay'?'#cc0010':'none');}
  }
  function clearResult(){result=null;resultDoc=null;resultKey='';$('trace-preview').replaceChildren();}
  function schedule(delay=180){
    stop();clearResult();suspended=false;
    if(!getDocument().image){setState('idle','导入图片后自动预览');render();return;}
    if(!enabled()){setState('disabled','实时预览已关闭；仍可点击生成');render();return;}
    if(!visible){setState('idle','返回图片描摹面板以预览');render();return;}
    setState('waiting','参数已更新，等待预览…');render();
    timer=setTimeout(()=>calculate(false),delay);
  }
  function loadImage(src){
    if(imageSource!==src||!imagePromise){imageSource=src;imagePromise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{imagePromise=null;reject(new Error('无法读取参考图片。'));};img.src=src;});}
    return imagePromise;
  }
  function fail(error,job){
    if(job!==generation)return;
    const wasApplying=applying;stop();clearResult();setState('error',error.message||String(error));render();
    if(wasApplying)onError(error);
  }
  async function calculate(applyWhenReady){
    stop();const doc=getDocument();if(!doc.image)return;
    const job=generation,src=doc.image.src,settings=parameters(),settingsKey=JSON.stringify(settings);
    const current=()=>job===generation&&getDocument()===doc&&doc.image?.src===src&&key()===settingsKey;
    setApplying(applyWhenReady);setState('working',applyWhenReady?'正在生成矢量轮廓…':'正在更新预览，可继续调整参数…');render();
    try{
      const img=await loadImage(src);if(!current())return;
      const ratio=Math.min(1,settings.size/Math.max(img.width,img.height));
      const w=Math.max(1,Math.round(img.width*ratio)),h=Math.max(1,Math.round(img.height*ratio));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
      const data=ctx.getImageData(0,0,w,h);worker=createWorker();
      timeout=setTimeout(()=>fail(new Error('描摹超时，请降低尺寸或减少颜色。'),job),45000);
      worker.onerror=()=>fail(new Error('描摹进程无法运行，请使用发布网页或打包后的单文件 HTML。'),job);
      worker.onmessage=({data:message})=>{
        if(!current())return;
        clearTimeout(timeout);worker?.terminate();worker=null;
        if(!message.ok){fail(new Error(message.error||'描摹失败'),job);return;}
        try{
          const shapes=message.result.shapes,sx=doc.image.width/w,sy=doc.image.height/h;
          let nodes=0;
          for(const s of shapes)for(const r of s.rings)for(const n of r.nodes){nodes++;n.x*=sx;n.y*=sy;n.in.x*=sx;n.in.y*=sy;n.out.x*=sx;n.out.y*=sy;}
          if(shapes.length>1500||nodes>50000)throw new Error('预览超过编辑预算，请提高简化容差或降低尺寸。');
          result=shapes;resultDoc=doc;resultKey=settingsKey;
          const fragment=document.createDocumentFragment();
          for(const s of shapes){const p=document.createElementNS(ns,'path');p.setAttribute('d',pathData(s));p.setAttribute('fill-rule','evenodd');p.setAttribute('vector-effect','non-scaling-stroke');p.setAttribute('stroke-width','1');p.dataset.fill=s.fill;fragment.append(p);}
          $('trace-preview').replaceChildren(fragment);
          setState(shapes.length?'ready':'empty',shapes.length?`预览：${shapes.length} 个对象 · ${message.result.sourceNodes??nodes} → ${nodes} 个节点${message.result.fallbacks?` · ${message.result.fallbacks} 个复杂对象保留折线`:""} · ${$('trace-curve-type').selectedOptions[0].textContent} · ${w} × ${h} px`:'预览为空，请调整阈值或去杂点参数');
          setApplying(false);render();if(applyWhenReady)applyResult();
        }catch(error){fail(error,job);}
      };
      worker.postMessage({image:{width:w,height:h,data:data.data},options:settings.options},[data.data.buffer]);
    }catch(error){fail(error,job);}
  }
  function applyResult(){
    if(!matches()){calculate(true);return;}
    if(!result.length){onError(new Error('没有可用轮廓，请调整参数后再生成。'));return;}
    suspended=true;render();
    try{onApply(structuredClone(result),$('replace-trace').checked);setState('applied','已应用到图层；再次调整参数可重新预览');}
    catch(error){suspended=false;render();onError(error);}
  }
  function apply(){clearTimeout(timer);timer=null;if(matches())applyResult();else calculate(true);}
  function cancel(){stop();suspended=true;setState('paused','预览已取消，项目未改动');render();refresh();}
  function reset(){stop();clearResult();imagePromise=null;imageSource='';schedule();}
  function hide(){stop();suspended=true;render();}
  function setVisible(value){visible=value;if(!value){stop();render();return;}suspended=false;if(matches())render();else schedule();}
  for(const id of ['threshold','tolerance','speckle','trace-curve-smoothness','trace-fit-tolerance'])$(id).addEventListener('input',()=>schedule());
  for(const id of ['trace-mode','color-count','trace-size','remove-background','trace-curve-type','trace-preserve-corners'])$(id).addEventListener('change',()=>schedule());
  $('live-preview').addEventListener('change',()=>schedule());$('preview-display').addEventListener('change',render);
  $('replace-trace').addEventListener('change',render);$('cancel-preview').addEventListener('click',cancel);
  return {render,reset,hide,setVisible,apply,cancel,diagnostics:()=>({state,curveType:$('trace-curve-type').value,pending:!!worker||timer!==null,applying,visible:visible&&!suspended,ready:matches()})};
}
function mountCurveControls(){
  if(document.getElementById('trace-curve-type'))return;
  const section=document.createElement('div');section.className='preview-controls';section.id='trace-curve-controls';
  const title=document.createElement('strong');title.textContent='轮廓线条 · 贝塞尔';section.append(title);
  const label=document.createElement('label');label.className='field';label.textContent='线条类型';
  const select=document.createElement('select');select.id='trace-curve-type';
  for(const [value,text] of [['polygon','硬边折线'],['quadratic','二次贝塞尔（圆滑）'],['cubic','三次贝塞尔 · 保角平滑（默认）']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  select.value='cubic';label.append(select);section.append(label);
  const choices=document.createElement('div');choices.className='curve-choices';
  for(const [value,text]of [['polygon','硬边折线'],['quadratic','二次贝塞尔'],['cubic','三次贝塞尔']]){const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.curveChoice=value;button.onclick=()=>{if(button.disabled)return;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));};choices.append(button);}section.append(choices);
  const smooth=document.createElement('label');smooth.className='field';smooth.textContent='圆滑程度 ';
  const output=document.createElement('output');output.id='trace-curve-value';output.textContent='60%';
  const range=document.createElement('input');Object.assign(range,{id:'trace-curve-smoothness',type:'range',min:'0',max:'100',step:'1',value:'60'});smooth.append(output,range);section.append(smooth);
  const fit=document.createElement('label');fit.className='field';fit.textContent='曲线拟合容差 ';const fitValue=document.createElement('output');fitValue.id='trace-fit-value';fitValue.textContent='1.2 px';const fitRange=document.createElement('input');Object.assign(fitRange,{id:'trace-fit-tolerance',type:'range',min:'.15',max:'3',step:'.05',value:'1.2'});fit.append(fitValue,fitRange);section.append(fit);
  const corner=document.createElement('label');corner.className='check-row';const check=document.createElement('input');check.id='trace-preserve-corners';check.type='checkbox';check.checked=true;corner.append(check,document.createTextNode('保留尖角（字形、印章建议开启）'));section.append(corner);
  const hint=document.createElement('p');hint.className='hint';hint.textContent='默认保角平滑：直线保留，连续弯曲边缘拟合为较少的贝塞尔段。容差越小越贴轮廓、节点可能越多；单位是描摹采样像素。0% 使用折线；二次曲线等价升阶保存。预览不修改已生成图形。';section.append(hint);
  document.getElementById('image-preview').before(section);
}
