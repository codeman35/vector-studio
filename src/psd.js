/** Narrow, dependency-free PSD v1 writer (experimental).
 * Adobe PSD specification: RGB/8, raw channel previews, SoCo + vmsk + lsct.
 * Only closed solid fills without strokes are accepted. NEVER raster-fallback.
 * Path knots retain cubic control points; image channels are compatibility previews.
 * Photoshop application round-trip still needs manual acceptance testing.
 */
import {bounds,pathData} from './geometry.js';
import {entries} from './groups.js';
class Bytes {
  constructor(){this.parts=[];this.length=0;}
  raw(a){a=a instanceof Uint8Array?a:new Uint8Array(a);this.parts.push(a);this.length+=a.length;return this;}
  num(n,size,signed=false){const a=new Uint8Array(size),v=new DataView(a.buffer);if(size===1)v.setUint8(0,n);else if(size===2)(signed?v.setInt16(0,n):v.setUint16(0,n));else if(size===4)(signed?v.setInt32(0,n):v.setUint32(0,n));else v.setFloat64(0,n);return this.raw(a);}
  u8(n){return this.num(n,1);}u16(n){return this.num(n,2);}i16(n){return this.num(n,2,true);}u32(n){return this.num(n,4);}i32(n){return this.num(n,4,true);}double(n){return this.num(n,8);}
  text(t){return this.raw(Uint8Array.from(t,c=>c.charCodeAt(0)&255));}
  zero(n){return this.raw(new Uint8Array(n));}
  unicode(t){this.u32(t.length);for(let i=0;i<t.length;i++)this.u16(t.charCodeAt(i));return this;}
  done(){const out=new Uint8Array(this.length);let p=0;for(const a of this.parts){out.set(a,p);p+=a.length;}return out;}
}
function block(key,content,alignment=2){const b=new Bytes(),n=content.length,pad=(alignment-n%alignment)%alignment;return b.text('8BIM').text(key).u32(n+pad).raw(content).zero(pad).done();}
function descriptorId(b,id){b.u32(0).text(id);}
function solidFill(hex){
  const b=new Bytes();b.u32(16).unicode('');descriptorId(b,'null');b.u32(1);descriptorId(b,'Clr ');b.text('Objc').unicode('');descriptorId(b,'RGBC');b.u32(3);
  ['Rd  ','Grn ','Bl  '].forEach((k,i)=>{descriptorId(b,k);b.text('doub').double(parseInt(hex.slice(1+i*2,3+i*2),16));});return b.done();
}
export function vectorMaskData(shape,width,height){
  const b=new Bytes();b.u32(3).u32(0).u16(6).zero(24).u16(8).u16(0).zero(22);
  for(const r of shape.rings){
    b.u16(0).u16(r.nodes.length).i16(-1).u16(1).zero(18); // closed, inherited operation, even-odd
    for(const n of r.nodes){b.u16(2);for(const p of [{x:n.x+n.in.x,y:n.y+n.in.y},n,{x:n.x+n.out.x,y:n.y+n.out.y}]){
      for(const value of [p.y/height,p.x/width]){if(value<=-128||value>=128)throw new Error('路径超出 PSD 固定小数坐标范围。');b.i32(Math.round(value*16777216));}
    }}
  }return b.done();
}
function box(s,width,height){const a=bounds(s),left=Math.max(0,Math.min(width,Math.floor(a.x)-1)),top=Math.max(0,Math.min(height,Math.floor(a.y)-1)),right=Math.max(left,Math.min(width,Math.ceil(a.x+a.width)+1)),bottom=Math.max(top,Math.min(height,Math.ceil(a.y+a.height)+1));return {left,top,right,bottom,width:right-left,height:bottom-top};}
export function psdCapability(doc){
  if(!doc.shapes.some(s=>s.visible))return '没有可导出的可见矢量对象。';
  if(!Number.isInteger(doc.width)||!Number.isInteger(doc.height)||doc.width<1||doc.height<1||doc.width>4096||doc.height>4096||doc.width*doc.height>16e6)return '实验 PSD 支持整数像素画板，最大边 4096 px，总像素不超过 1600 万。';
  const visible=doc.shapes.filter(s=>s.visible);
  if(visible.length>250)return '实验 PSD 最多导出 250 个可见形状图层，请精简或分批。';
  if(visible.some(s=>s.fill==='none'||!s.rings.length||s.rings.some(r=>!r.closed||r.nodes.length<3)))return '实验 PSD 仅支持带纯色填充的闭合图形；开放路径请用 SVG。';
  if(visible.some(s=>s.stroke!=='none'&&s.strokeWidth>0))return '实验 PSD 暂不支持描边，请去掉描边或改用 SVG；不会自动栅格化。';
  let area=doc.width*doc.height;
  for(const s of visible){const r=box(s,doc.width,doc.height);area+=r.width*r.height;}
  if(area>20e6)return '实验 PSD 的图层预览总量超过 2000 万像素预算，请缩小画板或精简图层。';
  return '';
}
function rawChannels(rgba,width,height){return [-1,0,1,2].map(id=>{const b=new Uint8Array(width*height+2);for(let p=0;p<width*height;p++)b[p+2]=rgba[p*4+(id<0?3:id)];return {id,data:b};});}
/** Adapter separated for independent binary tests. records are back-to-front. */
export function encodePSD(width,height,records,composite){
  if(!records.length||records.length>32767||composite.length!==width*height*4)throw new Error('PSD 图层或预览数据无效。');
  const meta=new Bytes(),pixels=new Bytes();meta.i16(-records.length);
  records.forEach((layer,index)=>{
    const r=layer.rect||{left:0,top:0,right:0,bottom:0,width:0,height:0},channels=rawChannels(layer.rgba||new Uint8Array(),r.width,r.height);
    if(layer.rgba&&layer.rgba.length!==r.width*r.height*4)throw new Error('PSD 图层像素长度不匹配。');
    meta.i32(r.top).i32(r.left).i32(r.bottom).i32(r.right).u16(channels.length);
    for(const c of channels){meta.i16(c.id).u32(c.data.length);pixels.raw(c.data);}
    meta.text('8BIM').text('norm').u8(255).u8(0).u8(0x18).u8(0);
    const extra=new Bytes();extra.u32(0).u32(0);
    const name=(layer.name||'Shape').slice(0,100),ascii=name.replace(/[^\x20-\x7e]/g,'_');extra.u8(ascii.length).text(ascii).zero((4-(ascii.length+1)%4)%4);
    extra.raw(block('luni',new Bytes().unicode(name).done(),4)).raw(block('lyid',new Bytes().u32(index+1).done()));
    if(layer.shape){extra.raw(block('SoCo',solidFill(layer.shape.fill)));extra.raw(block('vmsk',vectorMaskData(layer.shape,width,height),4));}
    if(layer.divider){const section=new Bytes().u32(layer.divider);if(layer.divider!==3)section.text('8BIM').text('pass').u32(0);extra.raw(block('lsct',section.done()));}
    meta.u32(extra.length).raw(extra.done());
  });
  const info=new Bytes().raw(meta.done()).raw(pixels.done());if(info.length%2)info.zero(1);
  const mask=new Bytes().u32(info.length).raw(info.done()).u32(0);
  const out=new Bytes().text('8BPS').u16(1).zero(6).u16(4).u32(height).u32(width).u16(8).u16(3).u32(0).u32(0).u32(mask.length).raw(mask.done()).u16(0);
  for(const c of [0,1,2,3]){const data=new Uint8Array(width*height);for(let p=0;p<data.length;p++)data[p]=composite[p*4+c];out.raw(data);}
  return out.done();
}
export async function exportPSD(doc){
  const reason=psdCapability(doc);if(reason)throw new Error(reason);
  const width=doc.width,height=doc.height,visible={...doc,shapes:doc.shapes.filter(s=>s.visible)},records=[];
  const composite=document.createElement('canvas');composite.width=width;composite.height=height;const ctx=composite.getContext('2d',{willReadFrequently:true});
  const walk=async parent=>{
    for(const e of entries(visible,parent)){
      if(!e.rings){records.push({name:'</Layer group>',divider:3});await walk(e.id);records.push({name:e.name,divider:1});continue;}
      const r=box(e,width,height),c=document.createElement('canvas');c.width=Math.max(1,r.width);c.height=Math.max(1,r.height);const g=c.getContext('2d',{willReadFrequently:true}),path=new Path2D(pathData(e));
      g.translate(-r.left,-r.top);g.fillStyle=e.fill;g.fill(path,'evenodd');ctx.fillStyle=e.fill;ctx.fill(path,'evenodd');
      const rgba=r.width&&r.height?g.getImageData(0,0,r.width,r.height).data:new Uint8Array();records.push({name:e.name,shape:e,rect:r,rgba});
      // Yield for large layered exports, without changing the snapshot being exported.
      if(records.length%10===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
  };
  await walk(null);return encodePSD(width,height,records,ctx.getImageData(0,0,width,height).data);
}
