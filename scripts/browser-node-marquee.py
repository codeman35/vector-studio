"""Node marquee may start on fill, outside or in a hole. No private fixtures.
Run after npm run build. VS_TEST_URL optionally targets the development entry.
This test uses an isolated page by default; it is not a persistence test.
"""
import json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)

def rect(x, y, w, h):
    return {'closed': True, 'nodes': [
        {'x': a, 'y': b, 'in': {'x': 0, 'y': 0}, 'out': {'x': 0, 'y': 0}}
        for a, b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]}

def shape(sid, rings, fill='#cf2929'):
    return dict(id=sid, name=sid, fill=fill, stroke='none', strokeWidth=0,
                visible=True, locked=False, source='draw', rings=rings)

fixture = dict(format='vector-studio', version=2, groups=[], name='Node marquee regression',
               width=900, height=650, image=None, shapes=[
                   shape('edited', [rect(120,120,300,240),rect(220,200,100,100)]),
                   shape('other', [rect(520,140,120,180)], '#345f85')])

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
                                headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1500, 'height':1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    if os.getenv('VS_TEST_URL'):
        page.goto(os.environ['VS_TEST_URL'])
    else:
        page.set_content(Path(os.getenv('VS_TEST_HTML', ROOT/'dist/index.html')).read_text())
    page.wait_for_function('window.vectorStudio !== undefined')
    def snapshot(): return page.evaluate('vectorStudio.snapshot()')
    def keys(): return set(page.locator('#overlays .anchor.selected').evaluate_all('(ns)=>ns.map(n=>n.dataset.node)'))
    def xy(x,y):
        return page.evaluate('''([x,y])=>{const s=document.getElementById('editor'),p=s.createSVGPoint();
            p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y]}''',[x,y])
    def click(p, **kw): page.mouse.click(*xy(*p), **kw)
    def drag(a,b,steps=6):
        page.mouse.move(*xy(*a));page.mouse.down();page.mouse.move(*xy(*b),steps=steps);page.mouse.up()
    def load():
        page.locator('#file-input').set_input_files({'name':'node-marquee.vstudio','mimeType':'application/json',
            'buffer':json.dumps(fixture).encode()})
        if page.locator('#switch-discard').is_visible():page.click('#switch-discard')
        page.wait_for_function('vectorStudio.snapshot().name === "Node marquee regression"')
        page.mouse.dblclick(*xy(150,150))
        page.wait_for_function('vectorStudio.getTool() === "node" && vectorStudio.selection()[0] === "edited"')
        page.uncheck('#snap-enabled')
    load(); baseline = snapshot()
    expected = {'edited|0|2'} | {f'edited|1|{i}' for i in range(4)}
    # Filling must not steal the gesture or move the object. Highlight while dragging.
    page.mouse.move(*xy(160,160));page.mouse.down();page.mouse.move(*xy(450,390),steps=8)
    assert page.locator('#gesture rect').count()==1, 'No marquee started inside fill'
    assert keys()==expected, (keys(),expected)
    page.screenshot(path=str(OUT/'node-marquee-inside-v041.png'))
    page.mouse.up();assert keys()==expected;assert snapshot()==baseline
    assert page.locator('#undo-btn').is_disabled()
    # The same box in reverse direction gives the same set.
    drag((450,390),(160,160));assert keys()==expected;assert snapshot()==baseline
    # A hole click still selects its inner contour, but a hole-origin drag does not.
    click((250,230));assert keys()=={f'edited|1|{i}' for i in range(4)}
    drag((250,230),(450,390));assert keys()=={'edited|1|2','edited|0|2'}
    assert snapshot()==baseline
    page.keyboard.press('Delete');assert len(snapshot()['shapes'][0]['rings'][1]['nodes'])==3
    page.click('#undo-btn');assert snapshot()==baseline
    page.mouse.dblclick(*xy(150,150));click((250,230));page.keyboard.press('Delete')
    assert len(snapshot()['shapes'][0]['rings'])==1
    page.click('#undo-btn');assert snapshot()==baseline
    page.mouse.dblclick(*xy(150,150))
    # Shift appends to node selection instead of turning fill into object selection.
    click((120,120));assert keys()=={'edited|0|0'}
    page.keyboard.down('Shift');drag((160,160),(450,390));page.keyboard.up('Shift')
    assert keys()==expected|{'edited|0|0'}
    # Click or sub-threshold jitter clears only nodes; stays in node mode.
    drag((160,160),(161,160));assert not keys()
    assert page.evaluate('vectorStudio.getTool()')=='node'
    assert page.evaluate('vectorStudio.selection()')==['edited']
    # Starting on an unselected object's body must not switch the editing target mid-drag.
    drag((580,240),(90,390));assert keys()=={'edited|0|2','edited|0|3','edited|1|2','edited|1|3'}
    assert page.evaluate('vectorStudio.selection()')==['edited'];assert snapshot()==baseline
    # Escape/pointer cancellation restores previous node selection, with no edit history.
    before=keys();page.mouse.move(*xy(160,160));page.mouse.down();page.mouse.move(*xy(450,390),steps=4)
    assert keys()==expected;page.keyboard.press('Escape');page.mouse.up()
    assert keys()==before;assert snapshot()==baseline;assert page.locator('#gesture rect').count()==0
    page.mouse.move(*xy(160,160));page.mouse.down();page.mouse.move(*xy(450,390),steps=4)
    page.dispatch_event('#editor','pointercancel',{'pointerId':1});page.mouse.up()
    assert keys()==before;assert snapshot()==baseline
    # Actual node drags still move nodes (not marquee). Single undo restores geometry.
    click((160,160));drag((120,120),(100,100));changed=snapshot()
    assert abs(changed['shapes'][0]['rings'][0]['nodes'][0]['x']-100)<1e-6
    assert changed['shapes'][1]==baseline['shapes'][1]
    page.click('#undo-btn');assert snapshot()==baseline;page.mouse.dblclick(*xy(150,150))
    # Ctrl add and Alt delete retain their priority.
    page.keyboard.down('Control');click((270,120));page.keyboard.up('Control')
    assert len(snapshot()['shapes'][0]['rings'][0]['nodes'])==5
    page.keyboard.down('Alt');click((270,120));page.keyboard.up('Alt')
    assert len(snapshot()['shapes'][0]['rings'][0]['nodes'])==4
    # Panning from fill changes view only; select mode still drags whole objects.
    geo=snapshot();view=page.locator('#editor').get_attribute('viewBox')
    page.keyboard.down('Space');drag((160,160),(180,170));page.keyboard.up('Space')
    assert snapshot()==geo and page.locator('#editor').get_attribute('viewBox')!=view
    page.keyboard.press('Escape');assert page.evaluate('vectorStudio.getTool()')=='select'
    drag((150,150),(170,170));assert snapshot()!=geo
    page.click('#undo-btn');assert snapshot()==geo
    assert not errors, errors
    print('PASS: inside/outside/hole marquee, live feedback, scoped nodes, Shift, click threshold, hole deletion, Escape/cancel, node drag, Ctrl/Alt and pan; no document edits from selection.')
    browser.close()
