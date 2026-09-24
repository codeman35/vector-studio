import {node,ring,pathData} from './geometry.js';
import {validateGroups,ancestors,groupMap} from './groups.js';

export const VERSION='0.4.1';
export const uid=()=>globalThis.crypto?.randomUUID?.()||`s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const createDocument=()=>({format:'vector-studio',version:2,groups:[],name:'未命名图案',width:1000,height:700,shapes:[],image:null});
export function makeShape(rings,options={}){return {id:uid(),name:'路径',fill:'#247a70',stroke:'none',strokeWidth:0,visible:true,locked:false,source:'draw',rings,...options};}
export function rectangle(x,y,w,h,options={}){return makeShape([ring([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}])],options);}
export function ellipse(cx,cy,rx,ry,options={}){
  const k=.5522847498307936;
  const nodes=[node(cx+rx,cy),node(cx,cy+ry),node(cx-rx,cy),node(cx,cy-ry)];
  nodes[0].in={x:0,y:-ry*k};nodes[0].out={x:0,y:ry*k};
  nodes[1].in={x:rx*k,y:0};nodes[1].out={x:-rx*k,y:0};
  nodes[2].in={x:0,y:ry*k};nodes[2].out={x:0,y:-ry*k};
  nodes[3].in={x:-rx*k,y:0};nodes[3].out={x:rx*k,y:0};
  return makeShape([{closed:true,nodes}],options);
}
export const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function exportSVG(doc){
  const map=groupMap(doc),lines=[];let previous=[];
  for(const s of doc.shapes.filter(s=>s.visible)){
    const chain=ancestors(doc,s).reverse();let common=0;
    while(common<chain.length&&common<previous.length&&chain[common]===previous[common])common++;
    for(let i=previous.length;i>common;i--)lines.push('  '.repeat(i)+'</g>');
    for(let i=common;i<chain.length;i++){const g=map.get(chain[i]);lines.push('  '.repeat(i+1)+`<g id="${escapeXML(g.id)}" data-name="${escapeXML(g.name)}">`);}
    lines.push('  '.repeat(chain.length+1)+`<path id="${escapeXML(s.id)}" data-name="${escapeXML(s.name)}" d="${pathData(s)}" fill="${s.fill}" fill-rule="evenodd" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
    previous=chain;
  }
  for(let i=previous.length;i>0;i--)lines.push('  '.repeat(i)+'</g>');
  const objects=lines.join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">\n  <title>${escapeXML(doc.name)}</title>\n${objects}\n</svg>\n`;
}
/** Reconstruct only whitelisted schema fields. Never execute imported content. */
export function validateDocument(input){
  if(input?.format!=='vector-studio'||![1,2].includes(input.version))throw new Error('不是受支持的 .vstudio 项目文件。');
  const finite=(n,min=-1e7,max=1e7)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error('项目包含无效坐标或尺寸。');return n;};
  const color=c=>{if(c==='none'||/^#[0-9a-f]{6}$/i.test(c))return c;throw new Error('无效颜色。');};
  if(!Array.isArray(input.shapes)||input.shapes.length>1500)throw new Error('对象数量超出限制。');
  let count=0;const ids=new Set();
  const shapes=input.shapes.map(s=>{
    if(!Array.isArray(s.rings)||s.rings.length>1000)throw new Error('路径结构无效。');
    const rings=s.rings.map(r=>{
      if(!Array.isArray(r.nodes)||(count+=r.nodes.length)>50000)throw new Error('节点数量超出限制。');
      return {closed:!!r.closed,nodes:r.nodes.map(n=>({x:finite(n.x),y:finite(n.y),in:{x:finite(n.in?.x),y:finite(n.in?.y)},out:{x:finite(n.out?.x),y:finite(n.out?.y)}}))};
    });
    let id=typeof s.id==='string'&&/^[\w-]{1,80}$/.test(s.id)?s.id:uid();if(ids.has(id))id=uid();ids.add(id);
    return makeShape(rings,{id,name:String(s.name||'路径').slice(0,100),fill:color(s.fill),stroke:color(s.stroke),strokeWidth:finite(s.strokeWidth,0,1000),visible:s.visible!==false,locked:!!s.locked,source:s.source==='trace'?'trace':'draw',...(s.groupId?{groupId:String(s.groupId)}:{})});
  });
  let image=null;
  if(input.image){const i=input.image;if(typeof i.src!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(i.src)||i.src.length>18e6)throw new Error('参考图像无效或过大。');image={src:i.src,width:finite(i.width,1,10000),height:finite(i.height,1,10000)};}
  const groups=validateGroups(input.groups,shapes);
  return {format:'vector-studio',version:2,groups,name:String(input.name||'未命名图案').slice(0,100),width:finite(input.width,1,10000),height:finite(input.height,1,10000),shapes,image};
}
export class History{
  constructor(doc,{max=40,maxBytes=40e6}={}){this.max=max;this.maxBytes=maxBytes;this.reset(doc);}
  reset(doc){this.states=[JSON.stringify(doc)];this.index=0;}
  push(doc){const text=JSON.stringify(doc);if(text===this.states[this.index])return false;this.states.splice(this.index+1);this.states.push(text);let bytes=this.states.reduce((sum,s)=>sum+s.length*2,0);while(this.states.length>1&&(this.states.length>this.max||bytes>this.maxBytes)){bytes-=this.states.shift().length*2;}this.index=this.states.length-1;return true;}
  undo(){return this.index>0?JSON.parse(this.states[--this.index]):null;}
  redo(){return this.index<this.states.length-1?JSON.parse(this.states[++this.index]):null;}
}
