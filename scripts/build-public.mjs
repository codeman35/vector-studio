import {readdir,readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {validatePublicProject,validPublicId} from '../src/public-projects.js';
import {exportSVG} from '../src/document.js';
export async function buildPublicLibrary(root){
 const source=resolve(root,'public-projects'),target=resolve(root,'dist/public-projects');await mkdir(target,{recursive:true});
 const files=(await readdir(source).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).filter(n=>n.endsWith('.json')).sort();
 if(files.length>250)throw new Error('公开项目最多 250 个，请归档后再构建。');
 const projects=[];let thumbnailBudget=1800000;
 for(const file of files){
  const path=resolve(source,file),id=basename(file,'.json'),stat=await lstat(path);
  if(!validPublicId(id)||id==='index'||!stat.isFile()||stat.isSymbolicLink()||stat.size>24*1024*1024)throw new Error('无效或过大的公开项目文件：'+file);
  const record=validatePublicProject(JSON.parse(await readFile(path,'utf8')));
  if(id!==record.id)throw new Error('公开文件名必须与 ID 一致：'+file);
  const rawThumbnail='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(exportSVG(record.document));
  const thumbnail=rawThumbnail.length<300000&&rawThumbnail.length<thumbnailBudget?rawThumbnail:'';thumbnailBudget-=thumbnail.length;
  projects.push({id,title:record.title,publishedAt:record.publishedAt,shapeCount:record.document.shapes.length,thumbnail});
  await writeFile(resolve(target,file),JSON.stringify(record));
 }
 projects.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 await writeFile(resolve(target,'index.json'),JSON.stringify({version:1,projects}));
}
