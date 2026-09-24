/** Public release files are explicit snapshots, never the private browser library. */
import {validateDocument} from './document.js';
export const PUBLIC_REPO='codeman35/vector-studio';
export const PUBLIC_SITE='https://codeman35.github.io/vector-studio/';
export const validPublicId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
export function publicSnapshot(input,id,{includeImage=false,now=new Date().toISOString()}={}){
  if(!validPublicId(id))throw new Error('公开项目 ID 无效。');
  const doc=validateDocument(input);
  if(!doc.shapes.length)throw new Error('请先生成矢量轮廓或绘制图形，再发布。');
  if(!includeImage)doc.image=null;
  const record={format:'vector-studio-public',version:1,id,title:doc.name,publishedAt:now,document:doc};
  if(new TextEncoder().encode(JSON.stringify(record)).length>24*1024*1024)throw new Error('公开项目超过 24 MB，请去掉原图或简化。');
  return record;
}
export function validatePublicProject(value){
  if(value?.format!=='vector-studio-public'||value.version!==1||!validPublicId(value.id))throw new Error('公开项目格式无效。');
  if(typeof value.publishedAt!=='string'||!Number.isFinite(Date.parse(value.publishedAt)))throw new Error('公开项目日期无效。');
  return publicSnapshot(value.document,value.id,{includeImage:!!value.document?.image,now:value.publishedAt});
}
export function publicProjectURL(id){if(!validPublicId(id))throw new Error('公开项目 ID 无效。');return PUBLIC_SITE+'?project='+encodeURIComponent(id);}
