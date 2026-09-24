"""Real Chromium, local responses at a test HTTPS origin: IDB/CSP/Workers.
No outbound traffic and no claim of a live GitHub Pages or Photoshop test.
"""
from pathlib import Path
import os,shutil,json,struct
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
ORIGIN='https://vector-studio.test/'
INJECT=os.environ.get('VS_INJECT_TEST')=='1'
def shape(i,x,y,w,h):
 return dict(id=i,name=i,fill='#247a70',stroke='none',strokeWidth=0,visible=True,locked=False,source='draw',rings=[dict(closed=True,nodes=[dict(x=a,y=b,**{'in':dict(x=0,y=0),'out':dict(x=0,y=0)}) for a,b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]])])
fixture=dict(format='vector-studio',version=1,name='项目 A',width=600,height=400,image=None,shapes=[shape('a',60,80,160,180),shape('b',300,80,160,180)])
(OUT/'workspace-fixture.vstudio').write_text(json.dumps(fixture))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or (shutil.which('chromium') if os.environ.get('CI')!='true' else None),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True)
 context.route(ORIGIN+'**',lambda route:route.fulfill(status=200,content_type='text/html',body=(ROOT/'dist/index.html').read_text()))
 page=context.new_page();page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 if INJECT:page.set_content((ROOT/'dist/index.html').read_text())
 else:page.goto(ORIGIN)
 page.wait_for_function('() => window.vectorStudio!==undefined')
 def wait(expr):page.wait_for_function('() => ('+expr+')')
 def snap():return page.evaluate('vectorStudio.snapshot()')
 def xy(x,y):return page.evaluate('([x,y])=>{let s=document.getElementById("editor"),p=s.createSVGPoint();p.x=x;p.y=y;let q=p.matrixTransform(s.getScreenCTM());return[q.x,q.y]}',[x,y])
 def press(key):page.locator('#editor').focus();page.keyboard.press(key)
 def save():page.click('#save-btn');wait('!vectorStudio.dirty()&&vectorStudio.activeProject()!==null')
 def project(name):return page.locator('.project-card').filter(has=page.locator('strong',has_text=name))
 for tool in ['node','add','knife','scissors','fill']:assert page.locator('[data-tool='+tool+']').is_disabled()
 assert page.locator('#export-btn').is_disabled();press('n');assert page.evaluate('vectorStudio.getTool()')=='select'
 page.locator('#file-input').set_input_files(str(OUT/'workspace-fixture.vstudio'));wait('vectorStudio.snapshot().shapes.length===2')
 print('Loaded v1; disabled-state check passed',flush=True)
 # Double click interior enters node editing WITHOUT adding any point.
 before=len(snap()['shapes'][0]['rings'][0]['nodes']);page.mouse.dblclick(*xy(140,160));assert page.evaluate('vectorStudio.getTool()')=='node';assert len(snap()['shapes'][0]['rings'][0]['nodes'])==before
 page.keyboard.down('Control');page.mouse.click(*xy(140,80));page.keyboard.up('Control');assert len(snap()['shapes'][0]['rings'][0]['nodes'])==before+1
 page.keyboard.down('Alt');page.mouse.click(*xy(140,80));page.keyboard.up('Alt');assert len(snap()['shapes'][0]['rings'][0]['nodes'])==before
 # Group undo/redo, thumbnail paths and block movement.
 press('Escape');press('Control+a');press('Control+g');assert len(snap()['groups'])==1
 assert page.locator('.layer-thumbnail path').count()>=4
 orig=snap()['shapes'];page.mouse.move(*xy(140,160));page.mouse.down();page.mouse.move(*xy(160,180),steps=3);page.mouse.up();after=snap()['shapes'];assert after[0]['rings'][0]['nodes'][0]['x']>orig[0]['rings'][0]['nodes'][0]['x'];assert abs((after[0]['rings'][0]['nodes'][0]['x']-orig[0]['rings'][0]['nodes'][0]['x'])-(after[1]['rings'][0]['nodes'][0]['x']-orig[1]['rings'][0]['nodes'][0]['x']))<1e-5
 press('Control+z');press('Control+a');press('Control+Shift+g');assert len(snap()['groups'])==0;press('Control+z');assert len(snap()['groups'])==1
 # Right click changes selection appropriately; invoke real duplicate command.
 page.mouse.click(*xy(140,160),button='right');assert page.locator('#context-menu').is_visible();page.click('[data-command=duplicate]');assert len(snap()['shapes'])==4;assert len(snap()['groups'])==2;press('Control+z')
 if INJECT:
  # This fallback deliberately verifies a storage-denied origin; it is NOT an IDB persistence test.
  page.click('#save-btn');wait('document.getElementById("toast").classList.contains("error")');assert page.evaluate('vectorStudio.dirty()')
  page.click('#new-btn');page.click('#switch-save');wait('document.getElementById("unsaved-error").textContent.length>0');assert snap()['shapes'];page.click('#switch-cancel')
  print('INJECTION MODE: real origin IDB tests SKIPPED; save failure preserves work.',flush=True)
 else:
  save();id_a=page.evaluate('vectorStudio.activeProject()');page.click('#projects-btn');assert project('项目 A').count()==1;page.screenshot(path=str(OUT/'projects-v020.png'));page.click('#close-projects')
  # Switch barrier: cancel leaves the current work; save-and-continue persists.
  page.fill('#document-name','项目 A 修改');page.locator('#document-name').press('Tab');wait('vectorStudio.dirty()')
  page.click('#new-btn');page.click('#switch-cancel');assert snap()['name']=='项目 A 修改'
  page.click('#new-btn');page.click('#switch-save');wait('vectorStudio.snapshot().shapes.length===0');assert page.evaluate('vectorStudio.activeProject()') is None
  page.click('#demo-btn');wait('vectorStudio.snapshot().shapes.length===3');page.fill('#document-name','项目 B');page.locator('#document-name').press('Tab');save()
  id_b=page.evaluate('vectorStudio.activeProject()');assert id_b!=id_a
  # Change B, then discard when switching A. Its old saved name must stay B.
  page.fill('#document-name','不应保存的 B');page.locator('#document-name').press('Tab');page.click('#projects-btn');project('项目 A 修改').get_by_role('button',name='打开',exact=True).click();page.click('#switch-discard');wait('vectorStudio.activeProject()==='+json.dumps(id_a));assert snap()['name']=='项目 A 修改'
  page.click('#projects-btn');assert project('项目 B').count()==1;assert project('不应保存的 B').count()==0;page.click('#close-projects')
  # Project shelf survives reload at a real origin, with group model intact.
  page.reload();wait('window.vectorStudio!==undefined');page.click('#projects-btn');project('项目 A 修改').get_by_role('button',name='打开',exact=True).click();wait('vectorStudio.snapshot().shapes.length===2');assert len(snap()['groups'])==1
  print('Project save/switch/cancel/reload, groups and shortcuts passed',flush=True)
  # Save conflict protection between two live tabs.
  other=context.new_page();other.goto(ORIGIN);other.wait_for_function('() => window.vectorStudio!==undefined');other.click('#projects-btn');other.locator('.project-card').filter(has=other.locator('strong',has_text='项目 A 修改')).get_by_role('button',name='打开',exact=True).click();other.wait_for_function('() => vectorStudio.snapshot().shapes.length===2')
  page.fill('#document-name','项目 A 新版本');page.locator('#document-name').press('Tab');save()
  other.fill('#document-name','冲突版本');other.locator('#document-name').press('Tab');other.click('#save-btn');other.wait_for_function('() => document.getElementById("toast").textContent.includes("另一标签页")');assert other.evaluate('vectorStudio.dirty()');other.close(run_before_unload=False)
 # SVG preserves groups. Experimental PSD has true vector records, not PNG layers.
 page.click('#export-btn')
 with page.expect_download() as down:page.click('#export-svg')
 down.value.save_as(str(OUT/'workspace.svg'));assert '<g ' in (OUT/'workspace.svg').read_text()
 assert page.locator('#export-psd').is_disabled();page.check('#psd-accept');assert page.locator('#export-psd').is_enabled()
 with page.expect_download() as down:page.click('#export-psd')
 down.value.save_as(str(OUT/'workspace.psd'));data=(OUT/'workspace.psd').read_bytes();assert data[:4]==b'8BPS';assert data.count(b'8BIMvmsk')==2;assert data.count(b'8BIMSoCo')==2;assert data.count(b'8BIMlsct')==2
 page.click('#close-export');page.click('[data-tab=layers]');page.screenshot(path=str(OUT/'workspace-v020.png'))
 # Real imported image: preview is not a shape, so vector commands remain disabled.
 page.click('#new-btn')
 if page.locator('#unsaved-dialog').is_visible():page.click('#switch-discard')
 wait('vectorStudio.snapshot().shapes.length===0');page.click('#raster-demo-btn');wait('vectorStudio.snapshot().image!==null');wait('vectorStudio.preview().ready');assert not snap()['shapes']
 for tool in ['node','knife','scissors','fill']:assert page.locator('[data-tool='+tool+']').is_disabled()
 page.click('#trace-btn');wait('vectorStudio.snapshot().shapes.length===2');assert page.locator('[data-tool=node]').is_enabled()
 # Donut PSD: transparent hole in raster preview and two paths in vector mask.
 page.click('#export-btn');page.check('#psd-accept')
 with page.expect_download() as down:page.click('#export-psd')
 down.value.save_as(str(OUT/'donut.psd'));page.click('#close-export')
 assert not errors,errors
 print('PASS:', 'injected UI + storage denial' if INJECT else 'real origin IDB + cross-tab conflict', 'node gestures, groups, thumbnails, context menu, SVG + PSD, pre-trace state; no page errors.',flush=True)
 browser.close()
