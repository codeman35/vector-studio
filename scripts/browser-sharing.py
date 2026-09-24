"""Bezier discovery, compound-hole deletion, bigger hits, and public gallery.
Default: real same-origin HTTP and isolated browser profiles. VS_INJECT=1 is
only a partial UI test and explicitly skips cross-browser public reads.
All fixtures are synthetic. No customer artwork is published by this test.
"""
import functools,http.server,json,os,shutil,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
fixture=json.loads((ROOT/'public-projects/example-contours.json').read_text())['document']
inject=os.getenv('VS_INJECT')=='1'
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1600,'height':1050})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    if inject:page.set_content((ROOT/'dist/index.html').read_text())
    else:page.goto(url)
    page.wait_for_function('() => window.vectorStudio?.version === "0.4.0"')
    page.click('#bezier-shortcut');assert page.locator('#trace-curve-type').is_visible();assert page.locator('#trace-curve-type').is_disabled()
    assert page.locator('[data-curve-choice]').count()==3
    page.click('#raster-demo-btn');page.wait_for_function('() => vectorStudio.preview().ready && !vectorStudio.preview().pending')
    page.click('[data-curve-choice=cubic]');page.wait_for_function('() => vectorStudio.preview().ready && !vectorStudio.preview().pending');assert page.locator('#trace-curve-type').input_value()=='cubic'
    page.click('[data-curve-choice=quadratic]');page.wait_for_function('() => vectorStudio.preview().ready && !vectorStudio.preview().pending');assert page.locator('#trace-curve-type').input_value()=='quadratic'
    page.screenshot(path=str(OUT/'bezier-visible-v040.png'))
    def snapshot():return page.evaluate('vectorStudio.snapshot()')
    def xy(x,y):return page.evaluate('([x,y])=>{const e=document.getElementById("editor"),p=e.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(e.getScreenCTM());return [q.x,q.y];}',[x,y])
    page.locator('#file-input').set_input_files({'name':'holes.vstudio','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
    page.wait_for_function('() => document.getElementById("unsaved-dialog").open || vectorStudio.snapshot().name === "公开示例 · 镂空与贝塞尔"')
    if page.locator('#unsaved-dialog').is_visible():page.click('#switch-discard')
    page.wait_for_function('() => vectorStudio.snapshot().name === "公开示例 · 镂空与贝塞尔"')
    before=snapshot();page.mouse.click(*xy(200,210));assert page.evaluate('vectorStudio.getTool()')=='node'
    assert '镂空' in page.locator('#contour-select option:checked').inner_text()
    page.keyboard.press('Delete');assert len(snapshot()['shapes'][0]['rings'])==1
    assert snapshot()['shapes'][0]['rings'][0]==before['shapes'][0]['rings'][0];assert snapshot()['shapes'][1]==before['shapes'][1]
    page.click('#undo-btn');assert snapshot()==before
    page.mouse.click(*xy(200,210));box=page.locator('#overlays .anchor').first.bounding_box()
    assert 9.8<=box['width']<=11.2,box
    start=xy(330,210);page.mouse.move(start[0]+9,start[1]);page.mouse.down();page.mouse.move(start[0]+29,start[1]+20,steps=6);page.mouse.up()
    assert snapshot()['shapes'][0]['rings'][0]['nodes'][0]!=before['shapes'][0]['rings'][0]['nodes'][0]
    page.click('#undo-btn');assert snapshot()==before
    page.mouse.click(*xy(200,210));page.screenshot(path=str(OUT/'holes-and-nodes-v040.png'))
    page.select_option('#contour-select','1');page.click('#delete-contour');assert len(snapshot()['shapes'][0]['rings'])==1
    page.click('#undo-btn');assert snapshot()==before
    if not inject:
        other=browser.new_context(viewport={'width':1600,'height':1050});viewer=other.new_page();viewer.on('pageerror',lambda e:errors.append(str(e)))
        viewer.goto(url+'?project=example-contours');viewer.wait_for_function('() => window.vectorStudio?.snapshot().shapes.length === 2')
        assert viewer.evaluate('vectorStudio.activeProject()') is None
        assert viewer.evaluate('vectorStudio.snapshot().name')==fixture['name']
        viewer.click('#public-btn');viewer.locator('[data-public-id="example-contours"]').wait_for();assert viewer.locator('[data-public-id]').count()==1
        viewer.click('#public-publish');assert viewer.locator('#publish-download').is_disabled();assert not viewer.locator('#publish-image').is_checked()
        viewer.check('#publish-consent')
        with viewer.expect_download() as pending:viewer.click('#publish-download')
        pending.value.save_as(OUT/'public-release.json');record=json.loads((OUT/'public-release.json').read_text())
        assert record['format']=='vector-studio-public';assert record['document']['image'] is None
        assert '尚未上传' in viewer.locator('#publish-status').inner_text()
        assert viewer.locator('#publish-upload').get_attribute('href')=='https://github.com/codeman35/vector-studio/upload/main/public-projects'
        assert len(json.loads((ROOT/'dist/public-projects/index.json').read_text())['projects'])==1
        viewer.screenshot(path=str(OUT/'public-publish-v040.png'));other.close()
        print('PASS: isolated second browser reads public project; local state not required; consent/download does not pretend to publish.')
    else:print('PARTIAL: HTTP gallery and isolated-profile reads intentionally skipped in injection mode.')
    assert not errors,errors
    print('PASS: visible Bezier controls, real Worker, hole select/delete/undo, exact unaffected geometry, larger anchor hit, contour dropdown; no page errors.')
    browser.close()
finally:server.shutdown();server.server_close()
