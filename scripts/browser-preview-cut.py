"""Regression checks for live tracing and bounded knife (no private fixtures).
Run after npm run build. VS_TEST_URL can target a local dev server or Pages.
Without it, tests the single-file HTML in an isolated page.
"""
import json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
def rectangle(sid,x,y,w,h):
    return {'id':sid,'name':sid,'fill':'#247a70','stroke':'none','strokeWidth':0,'visible':True,'locked':False,'rings':[{'closed':True,'nodes':[{'x':a,'y':b,'in':{'x':0,'y':0},'out':{'x':0,'y':0}} for a,b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]}]}
fixture={'format':'vector-studio','version':1,'name':'Finite knife','width':600,'height':420,'image':None,'shapes':[rectangle('top',100,80,180,100),rectangle('bottom',100,260,180,100)]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1500,'height':1060});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    if os.getenv('VS_TEST_URL'):page.goto(os.environ['VS_TEST_URL'])
    else:page.set_content((ROOT/'dist/index.html').read_text())
    def wait(exp):
        for _ in range(150):
            if page.evaluate(exp):return
            page.wait_for_timeout(100)
        raise AssertionError(exp+'; '+page.locator('#trace-preview-status').inner_text())
    def snapshot():return page.evaluate('vectorStudio.snapshot()')
    def paths():return page.locator('#trace-preview path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))')
    def ready():wait('vectorStudio.preview().ready && !vectorStudio.preview().pending')
    def value(id,v):page.locator('#'+id).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',str(v))
    def import_gray():
        page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=220;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,220,160);const g=ctx.createLinearGradient(20,0,180,0);g.addColorStop(0,'#111');g.addColorStop(1,'#eee');ctx.fillStyle=g;ctx.fillRect(20,30,160,90);ctx.fillStyle='#111';ctx.fillRect(195,40,2,2);const b=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([b],'gradient.png',{type:'image/png'}));const e=document.getElementById('file-input');e.files=dt.files;e.dispatchEvent(new Event('change'));}''')
    wait('window.vectorStudio!==undefined');import_gray();ready()
    assert len(paths())==1
    original=snapshot();before=paths()
    assert len(original['shapes'])==0
    assert page.locator('#busy').is_hidden()
    # Drag the actual range input: preview changes, document/history does not.
    box=page.locator('#threshold').bounding_box()
    page.mouse.move(box['x']+box['width']*.66,box['y']+box['height']/2);page.mouse.down()
    page.mouse.move(box['x']+box['width']*.32,box['y']+box['height']/2,steps=8);page.mouse.up();ready()
    assert paths()!=before;assert snapshot()==original;assert page.locator('#undo-btn').is_disabled()
    assert not page.locator('#trace-preview-banner').is_hidden()
    # Latest request wins even when several jobs are cancelled while pending.
    for v in [215,40,110,65]:value('threshold',v)
    ready();latest=paths()
    assert page.locator('#threshold').input_value()=='65';assert snapshot()==original
    page.select_option('#preview-display','original');assert page.locator('#trace-preview').is_hidden()
    assert page.locator('#reference').get_attribute('opacity')=='1'
    page.select_option('#preview-display','vector');assert page.locator('#reference').get_attribute('opacity')=='0'
    # Cancellation prevents late messages from applying or reappearing.
    value('threshold',195);page.click('#cancel-preview');page.wait_for_timeout(400)
    assert snapshot()==original;assert page.locator('#trace-preview').is_hidden()
    value('threshold',65);ready();assert paths()==latest
    page.click('#trace-btn');wait('vectorStudio.snapshot().shapes.length===1')
    assert page.locator('#objects path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))')==latest
    assert page.locator('#trace-preview').is_hidden()
    page.click('#undo-btn');assert len(snapshot()['shapes'])==0
    page.click('#redo-btn');assert len(snapshot()['shapes'])==1
    # Changing speckle filter and resolution auto-refreshes; no implicit edits.
    page.click('[data-tab=trace]');value('speckle',0);ready();assert len(paths())==2
    applied=snapshot();page.select_option('#trace-size','512');ready();assert snapshot()==applied
    page.screenshot(path=str(OUT/'live-preview.png'))
    # Apply a pending revision and replace once, not one layer per slider tick.
    value('threshold',210);page.click('#trace-btn');wait('vectorStudio.snapshot().shapes.length===2 && !vectorStudio.preview().applying')
    assert page.locator('#busy').is_hidden()
    # Disabling live preview keeps manual generation working.
    page.click('[data-tab=trace]');page.uncheck('#live-preview');value('speckle',8)
    page.click('#trace-btn');wait('vectorStudio.snapshot().shapes.length===1 && !vectorStudio.preview().applying')
    assert page.locator('#trace-preview').is_hidden()
    # Start preview then replace its source; no result from the old image wins.
    page.click('[data-tab=trace]');page.check('#live-preview');value('threshold',90)
    page.click('#new-btn');page.wait_for_timeout(300);assert snapshot()['image'] is None;assert len(paths())==0
    def load_fixture():
        page.locator('#file-input').set_input_files({'name':'finite.vstudio','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
        wait('vectorStudio.snapshot().name==="Finite knife"')
    def xy(x,y):return page.evaluate('([x,y])=>{const e=document.getElementById("editor"),p=e.createSVGPoint();p.x=x;p.y=y;const s=p.matrixTransform(e.getScreenCTM());return [s.x,s.y]}',[x,y])
    def knife(a,b):
        page.click('[data-tool=knife]');page.mouse.move(*xy(*a));page.mouse.down();page.mouse.move(*xy(*b),steps=6)
        assert page.locator('#gesture circle').count()==2
        page.mouse.up()
    load_fixture();uncut=snapshot();knife((180,30),(180,60));assert snapshot()==uncut
    knife((180,60),(180,130));assert snapshot()==uncut
    knife((180,60),(180,200));wait('vectorStudio.snapshot().shapes.length===3')
    assert next(s for s in snapshot()['shapes'] if s['id']=='bottom')==uncut['shapes'][1]
    page.click('#undo-btn');assert snapshot()==uncut
    # Exact boundary endpoints split without needing any added extension.
    knife((180,80),(180,180));assert len(snapshot()['shapes'])==3
    assert next(s for s in snapshot()['shapes'] if s['id']=='bottom')==uncut['shapes'][1]
    page.screenshot(path=str(OUT/'finite-knife.png'))
    assert not errors,errors
    print('PASS: real slider preview, stale cancellation, display modes, identical Apply, undo, speckle, resolution, manual mode, source reset, finite knife, untouched objects, endpoints; no page errors.')
    browser.close()
