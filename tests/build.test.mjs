import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const root=new URL('..',import.meta.url);
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
const html=readFileSync(new URL('dist/index.html',root),'utf8');
test('single HTML contains a matching CSP hash',()=>{const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(js);const hash=createHash('sha256').update(js).digest('base64');assert.ok(html.includes(`script-src 'sha256-${hash}'`));});
test('bundle has no external JS/CSS imports and retains real Worker',()=>{assert.doesNotMatch(html,/<script[^>]+src=/);assert.doesNotMatch(html,/<link[^>]+stylesheet/);assert.doesNotMatch(html,/\bimport\.meta/);assert.match(html,/new Worker\(url\)/);assert.match(html,/worker-src blob:/);});
