import {exportSVG,uid} from './document.js';
import {PUBLIC_REPO,validPublicId,publicSnapshot,validatePublicProject,publicProjectURL} from './public-projects.js';
/** Reads same-origin static JSON; writes are authenticated by GitHub's own upload UI. */
export function createPublicLibrary({getDocument,guard,onOpen,notice,busy}){
  const $=id=>document.getElementById(id);
  const dialog=document.createElement('dialog');dialog.id='public-dialog';dialog.className='public-dialog';
  dialog.innerHTML='<div class="dialog-heading"><h2>公开项目库</h2><button id="public-close">关闭</button></div><p>这里的项目来自 GitHub，任何人、其他浏览器均可查看。打开后编辑的是本地副本。</p><div class="contour-actions"><button id="public-refresh">刷新公开列表</button><button id="public-publish" class="primary">发布当前项目</button></div><p id="public-status" role="status"></p><div id="public-list" class="public-list"></div>';
  document.body.append(dialog);
  const publish=document.createElement('dialog');publish.id='publish-dialog';publish.className='public-dialog';
  publish.innerHTML='<div class="dialog-heading"><h2>发布到公开项目库</h2><button id="publish-close">关闭</button></div><p><strong>所有人都可查看、下载和编辑公开副本。</strong>公开内容进入 GitHub 提交历史，删除当前版本并不保证历史副本消失。</p><p>本地 Ctrl S 不会上传。此静态网站不保存 Token；发布通过 GitHub 登录后的上传页面完成。</p><label class="check-row"><input type="checkbox" id="publish-image">同时公开参考原图（默认不包含）</label><label class="check-row"><input type="checkbox" id="publish-consent">我确认有权公开当前项目的全部图形、图层名称，以及勾选时的原图</label><button id="publish-download" class="primary full" disabled>1. 下载待发布 JSON</button><p id="publish-status" role="status"></p><a id="publish-upload" class="publish-link" target="_blank" rel="noopener noreferrer" hidden>2. 在 GitHub 上传这个 JSON 并提交</a><p class="hint">在 GitHub 上传页面选择刚下载的文件，点击 Commit changes 提交到 main；无写入权限的访问者需要提交 PR，由仓库维护者审核。Actions 发布成功后才会出现在公开库。</p><div id="publish-result" hidden><label class="field">发布成功后可用的分享地址<input id="publish-url" readonly></label><button id="publish-copy" type="button">复制分享地址</button><p class="hint">这是待发布地址，不代表文件已上传。确认公开列表出现该项目后再分享。</p></div>';
  document.body.append(publish);let request=0,opening=false,payload=null;
  function error(e){$('public-status').textContent=e.message||'读取公开项目失败。';}
  function rootURL(){if(!/^https?:$/.test(location.protocol))throw new Error('本地 HTML 不读取网上项目；请从正式网站打开公开项目库。');return new URL('./public-projects/',location.href);}
  async function getJSON(path,maxBytes){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch(new URL(path,rootURL()),{cache:'no-store',credentials:'omit',signal:controller.signal});
      if(!response.ok)throw new Error(response.status===404?'此公开项目尚未发布或已移除。':'公开项目读取失败，请稍后刷新。');
      if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('公开文件过大。');
      const text=await response.text();if(text.length>maxBytes)throw new Error('公开文件过大。');return JSON.parse(text);
    }finally{clearTimeout(timer);}
  }
  async function open(id){
    if(opening||busy())return;if(!validPublicId(id))throw new Error('无效的公开项目地址。');opening=true;
    try{const record=validatePublicProject(await getJSON(id+'.json',24*1024*1024));if(record.id!==id)throw new Error('公开项目 ID 不匹配。');
      // Fetch first; no current content is discarded on an unavailable link.
      if(!await guard())return;await onOpen(record.document);dialog.close();notice('已打开公开项目的本地副本；修改不会覆盖公共原稿。');
    }finally{opening=false;}
  }
  function button(text,fn){const b=document.createElement('button');b.textContent=text;b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(error);return b;}
  async function refresh(){
    const generation=++request;$('public-status').textContent='正在读取 GitHub 已发布的项目…';$('public-list').replaceChildren();
    const manifest=await getJSON('index.json',3*1024*1024);if(generation!==request)return;
    if(!Array.isArray(manifest.projects)||manifest.projects.length>250)throw new Error('公开列表格式无效。');
    for(const item of manifest.projects){if(!validPublicId(item.id)||typeof item.title!=='string')throw new Error('公开列表包含无效项目。');
      const card=document.createElement('article');card.className='project-card';card.dataset.publicId=item.id;
      const image=document.createElement('img');image.alt='公开项目缩略图';image.className='public-thumbnail';
      if(typeof item.thumbnail==='string'&&item.thumbnail.startsWith('data:image/svg+xml;charset=utf-8,')&&item.thumbnail.length<300000)image.src=item.thumbnail;
      const title=document.createElement('strong');title.textContent=item.title;
      const info=document.createElement('small');info.textContent='公开 · '+(item.shapeCount||0)+' 个对象';
      const actions=document.createElement('div');actions.className='project-card-actions';
      actions.append(button('打开副本',()=>open(item.id)),button('复制链接',async()=>{try{await navigator.clipboard.writeText(publicProjectURL(item.id));notice('公开链接已复制');}catch{prompt('复制此公开链接',publicProjectURL(item.id));}}));
      card.append(image,title,info,actions);$('public-list').append(card);
    }
    $('public-status').textContent=manifest.projects.length?`${manifest.projects.length} 个已公开项目；本地保存的其他稿件不会自动显示。`:'还没有公开项目。请通过「发布当前项目」上传并提交。';
  }
  async function show(){if(!dialog.open)dialog.showModal();$('public-publish').disabled=busy();try{await refresh();}catch(e){error(e);}}
  function resetPackage(){payload=null;$('publish-upload').hidden=true;$('publish-upload').removeAttribute('href');$('publish-result').hidden=true;$('publish-url').value='';$('publish-download').disabled=!$('publish-consent').checked;$('publish-status').textContent='';}
  function prepare(){if(busy())return;resetPackage();$('publish-consent').checked=false;$('publish-image').checked=false;$('publish-download').disabled=true;publish.showModal();}
  $('publish-download').onclick=()=>{try{
    if(!$('publish-consent').checked||busy())return;
    payload=publicSnapshot(getDocument(),'p-'+uid().toLowerCase().replace(/[^a-z0-9-]/g,''),{includeImage:$('publish-image').checked});
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=payload.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('publish-upload').href='https://github.com/'+PUBLIC_REPO+'/upload/main/public-projects';$('publish-upload').hidden=false;$('publish-result').hidden=false;$('publish-url').value=publicProjectURL(payload.id);
    $('publish-status').textContent='仅已下载待发布文件，尚未上传。下一步请在 GitHub 选择这个 JSON 文件并提交。';
  }catch(e){$('publish-status').textContent=e.message;}};
  $('publish-consent').onchange=resetPackage;$('publish-image').onchange=()=>{resetPackage();$('publish-consent').checked=false;$('publish-download').disabled=true;};
  $('publish-copy').onclick=async()=>{if(!payload)return;try{await navigator.clipboard.writeText(publicProjectURL(payload.id));notice('待发布链接已复制；上传并发布成功后才可访问。');}catch{$('publish-url').select();}};
  $('public-close').onclick=()=>{request++;dialog.close();};$('publish-close').onclick=()=>publish.close();
  $('public-refresh').onclick=()=>refresh().catch(error);$('public-publish').onclick=prepare;
  const localEntry=button('查看公开项目库',show);localEntry.id='library-public';$('projects-dialog').querySelector('.dialog-heading')?.append(localEntry);
  // The existing local gallery layout may not have a heading class; keep entry reachable.
  if(!localEntry.isConnected)$('projects-dialog').prepend(localEntry);
  return {show,prepare,openLink:async()=>{const id=new URLSearchParams(location.search).get('project');if(!id)return;try{await open(id);}catch(e){await show();error(e);}},thumbnail:doc=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(exportSVG(doc))};
}
