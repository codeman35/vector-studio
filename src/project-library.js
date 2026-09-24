import {openProjectDB,projectRecords,putProject,removeProject} from './project-store.js';
import {validateDocument,uid,exportSVG} from './document.js';
/** UI controller with an explicit Save / Discard / Cancel barrier for switching. */
export function createProjectLibrary({getDocument,isDirty,beforeSave,onSaved,onOpen,onError}){
  const $=id=>document.getElementById(id),dialog=$('projects-dialog');
  let activeId=null,revision=null,busy=false,records=[],decision=null;
  function error(e){$('projects-status').textContent=e.message||'项目库不可用，请使用下载项目备份。';onError(e);}
  function controls(){for(const id of ['library-save','library-save-as','library-refresh'])$(id).disabled=busy;}
  function reset(){activeId=null;revision=null;}
  async function save(asNew=false){
    if(busy)throw new Error('项目正在保存，请稍候。');beforeSave();
    const doc=validateDocument(getDocument()),fingerprint=JSON.stringify(getDocument());
    const name=doc.name.trim()||'未命名图案';busy=true;controls();
    try{
      const record={id:asNew?uid():(activeId||uid()),name,document:doc,thumbnail:thumbnail(doc),updatedAt:Date.now()};
      const saved=await putProject(record,asNew?null:revision);activeId=saved.id;revision=saved.revision;
      onSaved(fingerprint);$('projects-status').textContent='已保存到此浏览器项目库。建议另下载 .vstudio 备份。';
      if(dialog.open)await refresh();return saved;
    }finally{busy=false;controls();}
  }
  function guard(){
    if(!isDirty())return Promise.resolve(true);
    if(decision)return Promise.resolve(false);
    const d=$('unsaved-dialog');$('unsaved-error').textContent='';
    return new Promise(resolve=>{decision=resolve;d.showModal();});
  }
  function finishDecision(value){const resolve=decision;decision=null;$('unsaved-dialog').close();resolve?.(value);}
  $('switch-cancel').onclick=()=>finishDecision(false);
  $('switch-discard').onclick=()=>finishDecision(true);
  $('switch-save').onclick=async()=>{
    for(const b of $('unsaved-dialog').querySelectorAll('button'))b.disabled=true;
    try{await save();if(isDirty())throw new Error('保存期间项目又有修改，请再次保存。');finishDecision(true);}
    catch(e){$('unsaved-error').textContent=e.message||'保存失败；可取消切换并下载项目备份。';}
    finally{for(const b of $('unsaved-dialog').querySelectorAll('button'))b.disabled=false;}
  };
  $('unsaved-dialog').addEventListener('cancel',e=>{e.preventDefault();if(!$('switch-save').disabled)finishDecision(false);});
  async function switchTo(record){
    if(busy||!await guard())return;
    // A fresh record avoids opening stale gallery data from a second tab.
    const fresh=(await projectRecords()).find(r=>r.id===record.id);
    if(!fresh)throw new Error('项目已被删除，请刷新列表。');
    const doc=validateDocument(fresh.document);activeId=fresh.id;revision=fresh.revision;
    dialog.close();onOpen(doc);
  }
  function thumbnail(doc){
    let markup=exportSVG(doc);
    if(!doc.shapes.some(s=>s.visible)&&doc.image){markup=markup.replace('</svg>',`<image href="${doc.image.src}" width="${doc.image.width}" height="${doc.image.height}"/></svg>`);}
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);
  }
  function button(label,fn){const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(error);return b;}
  async function refresh(){records=await projectRecords();render();}
  function render(){
    const list=$('projects-list');list.replaceChildren();const query=$('projects-search').value.trim().toLowerCase();
    for(const r of records.filter(r=>r.name.toLowerCase().includes(query))){
      const card=document.createElement('article');card.className='project-card';card.dataset.projectId=r.id;
      const open=button('',()=>switchTo(r));open.className='project-card-open';open.title='打开 '+r.name;
      const img=document.createElement('img');img.src=thumbnail(validateDocument(r.document));img.alt='项目缩略图';open.append(img);
      const title=document.createElement('strong');title.textContent=r.name+(r.id===activeId?' · 当前':'');
      const meta=document.createElement('small');meta.textContent=new Date(r.updatedAt).toLocaleString()+' · '+r.document.shapes.length+' 个对象';
      const actions=document.createElement('div');actions.className='project-card-actions';
      actions.append(button('打开',()=>switchTo(r)),button('备份',()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(r.document,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=r.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.vstudio';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }),button('删除',async()=>{
        if(!confirm(`从此浏览器的项目库中删除「${r.name}」？建议先备份。当前画布不会被删除。`))return;
        await removeProject(r.id,r.revision);if(r.id===activeId){reset();onSaved(null);}await refresh();
      }));card.append(open,title,meta,actions);list.append(card);
    }
    if(!list.children.length){const p=document.createElement('p');p.className='library-empty';p.textContent=query?'没有匹配的项目。':'还没有保存的项目。点击「保存当前项目」开始。';list.append(p);}
    $('projects-count').textContent=`${records.length} 个本地项目`;
  }
  $('close-projects').onclick=()=>dialog.close();$('projects-search').oninput=render;
  $('library-save').onclick=()=>save().catch(error);$('library-save-as').onclick=()=>save(true).catch(error);$('library-refresh').onclick=()=>refresh().catch(error);
  async function show(){if(!dialog.open)dialog.showModal();$('projects-status').textContent='仅保存在此浏览器；不会上传 GitHub。清除站点数据或换浏览器后不会同步。';try{await refresh();}catch(e){error(e);}}
  return {save,guard,reset,show,activeId:()=>activeId,openDB:openProjectDB};
}
