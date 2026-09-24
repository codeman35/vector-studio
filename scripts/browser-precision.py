"""UI regression for layout/color selection/snap. Default: injected bundle, not storage.
VS_TEST_URL targets a served development entry or deployed site when available.
"""
import json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
def n(x,y):return {'x':x,'y':y,'in':{'x':0,'y':0},'out':{'x':0,'y':0}}
def shape(sid,points,closed=True,**kw):
    return {'id':sid,'name':sid,'rings':[{'closed':closed,'nodes':[n(*p) for p in points]}],'fill':'#247a70','stroke':'none','strokeWidth':0,'visible':True,'locked':False,**kw}
def rect(sid,x,y,w,h,**kw):return shape(sid,[(x,y),(x+w,y),(x+w,y+h),(x,y+h)],**kw)
def document(shapes,groups=None):return {'format':'vector-studio','version':2,'groups':groups or [],'name':'','width':800,'height':550,'image':None,'shapes':shapes}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1700,'height':1240},accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    if os.getenv('VS_TEST_URL'):page.goto(os.environ['VS_TEST_URL'])
    else:page.set_content((ROOT/'dist/index.html').read_text())
    page.wait_for_function('!!window.vectorStudio');counter=0
    def snap():return page.evaluate('vectorStudio.snapshot()')
    def load(d):
        global counter
        counter+=1;d={**d,'name':'Precision '+str(counter)}
        page.locator('#file-input').set_input_files({'name':'test.vstudio','mimeType':'application/json','buffer':json.dumps(d).encode()})
        page.wait_for_function('(name)=>vectorStudio.snapshot().name===name||document.getElementById("unsaved-dialog").open',arg=d['name'])
        if page.locator('#unsaved-dialog').is_visible():page.click('#switch-discard')
        page.wait_for_function('(name)=>vectorStudio.snapshot().name===name',arg=d['name'])
        page.click('[data-tool=select]');page.click('#fit-btn');return snap()
    def xy(x,y):return page.evaluate('([x,y])=>{const e=document.getElementById("editor"),p=e.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(e.getScreenCTM());return [q.x,q.y]}',[x,y])
    def scale():return page.evaluate('document.getElementById("editor").getScreenCTM().a')
    def click(x,y,shift=False,dbl=False):
        if shift:page.keyboard.down('Shift')
        if dbl:page.mouse.dblclick(*xy(x,y))
        else:page.mouse.click(*xy(x,y))
        if shift:page.keyboard.up('Shift')
    def props():page.click('[data-tab=properties]')
    def undo():page.click('#undo-btn')
    props();assert page.locator('[data-align=left]').is_disabled();assert page.locator('#select-same-fill').is_disabled()
    base=document([rect('a',100,60,80,70),rect('b',240,160,60,110),rect('c',530,300,90,50)])
    original=load(base);click(140,90);click(270,210,shift=True);click(570,320,shift=True);props()
    assert set(page.evaluate('vectorStudio.selection()'))=={'a','b','c'}
    page.click('[data-align=top]');assert [s['rings'][0]['nodes'][0]['y'] for s in snap()['shapes']]==[60]*3
    undo();assert snap()==original
    click(140,90);click(270,210,shift=True);click(570,320,shift=True);props();page.click('[data-align=distribute-x]')
    d=snap();assert d['shapes'][0]==original['shapes'][0] and d['shapes'][2]==original['shapes'][2]
    assert abs(d['shapes'][1]['rings'][0]['nodes'][0]['x']-325)<1e-7;undo();assert snap()==original
    click(140,90);click(270,210,shift=True);click(570,320,shift=True);props();page.select_option('#distribution-mode','center');page.click('[data-align=distribute-x]')
    assert abs(snap()['shapes'][1]['rings'][0]['nodes'][0]['x']-327.5)<1e-7;undo()
    click(140,90);props();assert page.locator('[data-align=left]').is_disabled();page.select_option('#align-target','artboard');page.click('[data-align=center-x]');assert snap()['shapes'][0]['rings'][0]['nodes'][0]['x']==360;undo()
    # Whole group count, relative placement and one-step undo.
    original=load(base);click(140,90);click(270,210,shift=True);page.keyboard.press('Control+g');page.click('[data-tool=select]');click(570,320,shift=True);props()
    assert page.locator('#layout-count').inner_text()=='2 个单位';assert page.locator('[data-align=distribute-x]').is_disabled()
    page.select_option('#align-target','selection');before=snap();page.click('[data-align=bottom]');after=snap()
    assert after['groups']==before['groups'];a,b=after['shapes'][:2];assert b['rings'][0]['nodes'][0]['y']-a['rings'][0]['nodes'][0]['y']==100
    undo();assert snap()==before
    # Color selection does not dirty or include locked, hidden, or differently colored siblings.
    colored=document([rect('red',100,100,80,70,fill='#dd4444',groupId='g',stroke='#112233',strokeWidth=2),rect('blue',220,100,80,70,fill='#4488dd',groupId='g',stroke='#112233',strokeWidth=4),rect('red2',380,100,80,70,fill='#DD4444'),rect('locked',100,300,80,70,fill='#dd4444',locked=True),rect('hidden',380,300,80,70,fill='#dd4444',visible=False)],[{'id':'g','name':'Colors','parentId':None}])
    before=load(colored);click(140,135,dbl=True);props();dirty=page.evaluate('vectorStudio.dirty()');page.click('#select-same-fill')
    assert set(page.evaluate('vectorStudio.selection()'))=={'red','red2'};assert snap()==before;assert page.evaluate('vectorStudio.dirty()')==dirty
    click(140,135,dbl=True);page.mouse.click(*xy(140,135),button='right');page.click('[data-command=same-stroke]');assert set(page.evaluate('vectorStudio.selection()'))=={'red','blue'}
    # Snap a single endpoint without changing its target or merging the paths.
    paths=document([shape('left',[(120,240),(270,240)],False,fill='none',stroke='#247a70',strokeWidth=4),shape('right',[(400,240),(570,340)],False,fill='none',stroke='#c76659',strokeWidth=4),rect('closed',500,100,80,50)])
    original=load(paths);click(190,240,dbl=True);props();page.select_option('#snap-target','endpoints')
    def drag_endpoint(target,shift=False,check=None):
        page.mouse.move(*xy(270,240));page.mouse.down()
        if shift:page.keyboard.down('Shift')
        page.mouse.move(*xy(*target),steps=7)
        if check:check()
        page.mouse.up()
        if shift:page.keyboard.up('Shift')
    def snapped():
        assert page.evaluate('vectorStudio.precision().snap.key')=='right|0|0';assert page.locator('#snap-guide text').text_content()=='端点吸附'
    z=scale();drag_endpoint((400-3/z,240+2/z),check=snapped)
    end=snap()['shapes'][0]['rings'][0]['nodes'][-1];assert end['x']==400 and end['y']==240
    assert snap()['shapes'][1:]==original['shapes'][1:];assert len(snap()['shapes'])==3;assert page.locator('#snap-guide').inner_html()==''
    undo();assert snap()==original
    click(190,240,dbl=True);z=scale()
    def assert_no_snap():assert page.evaluate('vectorStudio.precision().snap') is None
    drag_endpoint((400-3/z,240+2/z),shift=True,check=assert_no_snap)
    assert abs(snap()['shapes'][0]['rings'][0]['nodes'][-1]['x']-400)>1;undo()
    # Endpoint-only ignores a closed anchor; switching to all nodes enables it.
    click(190,240,dbl=True);drag_endpoint((500-2/scale(),100),check=assert_no_snap);assert snap()['shapes'][0]['rings'][0]['nodes'][-1]['x']!=500;undo()
    click(190,240,dbl=True);page.select_option('#snap-target','all');drag_endpoint((500-2/scale(),100));assert snap()['shapes'][0]['rings'][0]['nodes'][-1]['x']==500;undo()
    # Toggle off and cancel a drag without leaving stale geometry or guides.
    click(190,240,dbl=True);page.uncheck('#snap-enabled');drag_endpoint((400-2/scale(),240),check=assert_no_snap);assert snap()['shapes'][0]['rings'][0]['nodes'][-1]['x']!=400;undo()
    click(190,240,dbl=True);page.check('#snap-enabled');page.mouse.move(*xy(270,240));page.mouse.down();page.mouse.move(*xy(399,240),steps=4);page.keyboard.press('Escape');page.mouse.up();assert snap()==original;assert page.locator('#snap-guide').inner_html()==''
    # At a different zoom snap uses screen pixels and is still undoable.
    click(190,240,dbl=True);page.click('#zoom-out');page.click('#zoom-out');z=scale();drag_endpoint((400-5/z,240),check=snapped);assert snap()['shapes'][0]['rings'][0]['nodes'][-1]['x']==400;undo()
    # Multi-node motion retains offset; selected source anchors never capture each other.
    page.click('#fit-btn');click(190,240,dbl=True);page.locator('#editor').focus();page.keyboard.press('Control+a');drag_endpoint((399,240));nodes=snap()['shapes'][0]['rings'][0]['nodes'];assert nodes[1]['x']-nodes[0]['x']==150;assert nodes[1]['x']==400;undo()
    # Pen clicks snap but don't auto-merge with the target path.
    page.click('[data-tool=pen]');click(400-2/scale(),240);click(470,430);page.keyboard.press('Enter');assert len(snap()['shapes'])==4;assert snap()['shapes'][-1]['rings'][0]['nodes'][0]['x']==400;undo()
    # Existing Ctrl add / Alt remove and finite-cut actions remain reachable.
    page.click('[data-tool=select]');click(190,240,dbl=True);page.keyboard.down('Control');click(200,240);page.keyboard.up('Control');assert len(snap()['shapes'][0]['rings'][0]['nodes'])==3
    page.keyboard.down('Alt');click(200,240);page.keyboard.up('Alt');assert len(snap()['shapes'][0]['rings'][0]['nodes'])==2
    # Actual SVG download after layout, plus project serialization.
    load(base);click(140,90);click(270,210,shift=True);click(570,320,shift=True);props();page.click('[data-align=top]');page.select_option('#distribution-mode','gap');page.click('[data-align=distribute-x]')
    page.screenshot(path=str(OUT/'precision-v021.png'))
    with page.expect_download() as dl:page.click('#backup-btn')
    dl.value.save_as(str(OUT/'precision.vstudio'));assert json.loads((OUT/'precision.vstudio').read_text())==snap()
    page.click('#export-btn')
    with page.expect_download() as dl:page.click('#export-svg')
    dl.value.save_as(str(OUT/'precision.svg'));assert '<path ' in (OUT/'precision.svg').read_text();assert '<image' not in (OUT/'precision.svg').read_text()
    assert not errors,errors
    print('PASS: UI align/gap/center/artboard, nested group rigidity, color and context selection, endpoint/node/Shift/off snapping, zoom, multi-node offset, cancel/undo, pen, Ctrl/Alt nodes, SVG/project downloads; no page errors.')
    browser.close()
