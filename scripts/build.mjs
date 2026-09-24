/** Fixed module graph. Rebuild the Worker and CSP; never edit generated HTML. */
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildPublicLibrary} from './build-public.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFile(resolve(root,p),'utf8');
const modules={geometry:'VSGeometry',groups:'VSGroups',document:'VSDocument','trace-curves':'VSCurves',trace:'VSTrace','trace-preview':'VSPreview','project-store':'VSStore','project-library':'VSLibrary','editor-ui':'VSUI',psd:'VSPsd',precision:'VSPrecision','precision-ui':'VSPrecisionUI',contours:'VSContours','contour-ui':'VSContourUI','public-projects':'VSPublicProjects','public-library':'VSPublicLibrary','curve-drag':'VSCurveDrag'};
function linkImports(source){
 return source.replace(/import \* as (\w+) from '\.\/(.*?)\.js';/g,(_,name,file)=>{if(!modules[file])throw new Error('Unknown module '+file);return `const ${name}=${modules[file]};`;})
 .replace(/import \{([^}]+)\} from '\.\/(.*?)\.js';/g,(_,names,file)=>{if(!modules[file])throw new Error('Unknown module '+file);return `const {${names}}=${modules[file]};`;});
}
const bundled={};
for(const [file,name]of Object.entries(modules)){
 const source=await read('src/'+file+'.js'),exports=[...source.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_]\w*)/g)].map(m=>m[1]);
 const body=linkImports(source).replace(/\bexport\s+(?=(?:async\s+)?(?:const|let|function|class)\b)/g,'');
 if(/^import |\bexport (?:async |function|const|class)/m.test(body))throw new Error('Unsupported syntax in '+file);
 bundled[file]=`const ${name} = (() => {\n${body}\nreturn {${exports.join(',')}};\n})();`;
}
const worker=['geometry','trace-curves','trace'].map(f=>bundled[f]).join('\n')+"\nself.onmessage=({data})=>{try{self.postMessage({ok:true,result:VSTrace.traceImage(data.image,data.options)});}catch(e){self.postMessage({ok:false,error:e.message||'描摹失败'});}};";
let app=linkImports(await read('src/app.js')).replace("new Worker(new URL('./trace-worker.js',import.meta.url),{type:'module'})",'createLocalWorker()');
if(/\bimport\.meta|^import /m.test(app))throw new Error('An unbundled import remains.');
const bootstrap=`const workerSource=${JSON.stringify(worker)};\nfunction createLocalWorker(){const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));const instance=new Worker(url);setTimeout(()=>URL.revokeObjectURL(url),1000);return instance;}`;
const main=Object.keys(modules).filter(f=>!['trace','trace-curves'].includes(f)).map(f=>bundled[f]).join('\n');
const js=`(()=>{'use strict';\n${main}\n${bootstrap}\n${app}\n})();`;
const hash=createHash('sha256').update(js).digest('base64');
const css=(await Promise.all(['style','workspace','sharing'].map(f=>read('src/'+f+'.css')))).join('\n');
const version=JSON.parse(await read('package.json')).version;
let html=await read('index.html');
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>`<style>${css}</style>`)
 .replace('<link rel="stylesheet" href="./src/workspace.css">','').replace('<link rel="stylesheet" href="./src/sharing.css">','')
 .replace(/(<small class="version">)[^<]+/,`$1${version} 预览版`)
 .replace('<script type="module" src="./src/app.js"></script>',()=>`<script>${js}</script>`)
 .replace("script-src 'self'",`script-src 'sha256-${hash}'`).replace("worker-src 'self'",'worker-src blob:');
await rm(resolve(root,'dist'),{recursive:true,force:true});await mkdir(resolve(root,'dist'),{recursive:true});
await writeFile(resolve(root,'dist/index.html'),html);await writeFile(resolve(root,'dist/.nojekyll'),'');
await buildPublicLibrary(root);
console.log(`Built dist/index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB). No external scripts. Public gallery reads same-origin JSON.`);
