/** Dependency-free preview tracer. Pixel-boundary tracing + RDP simplification.
 * This is deliberately a swappable engine, not VTracer / Potrace and not AI.
 * Binary mode traces foreground outlines, NOT stroke centerlines.
 */
import {stitchEdges, signedArea, simplifyRing, groupRings, ring} from './geometry.js';

export function traceImage({width,height,data}, options={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1048576||data.length!==width*height*4)throw new Error('描摹输入无效或超过 1024 × 1024 像素预算。');
  const threshold=Math.max(0,Math.min(255,Number(options.threshold??170)));
  const tolerance=Math.max(.1,Math.min(6,Number(options.tolerance??1.1)));
  const minArea=Math.max(0,Math.min(300,Number(options.minArea??8)));
  const colorMode=options.mode==='color', count=Math.max(2,Math.min(16,Math.floor(options.colors||6)));
  const n=width*height, transparent=new Uint8Array(n);
  for(let i=0;i<n;i++)if(data[i*4+3]<100)transparent[i]=1;
  if(colorMode && options.removeBackground) {
    // Remove ONLY near-white pixels connected to the image boundary.
    const queue=new Int32Array(n);let head=0,tail=0;
    const visit=i=>{if(i<0||i>=n||transparent[i])return;const k=i*4;if(Math.min(data[k],data[k+1],data[k+2])<240)return;transparent[i]=1;queue[tail++]=i;};
    for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
    for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
    while(head<tail){const i=queue[head++],x=i%width;if(x)visit(i-1);if(x+1<width)visit(i+1);visit(i-width);visit(i+width);}
  }
  let palette;
  if(colorMode) {
    const hist=new Map(),stride=Math.max(1,Math.floor(n/70000));
    for(let i=0;i<n;i+=stride)if(!transparent[i]){
      const k=i*4,key=((data[k]>>4)<<8)|((data[k+1]>>4)<<4)|(data[k+2]>>4);
      const entry=hist.get(key)||[0,0,0,0];entry[0]++;entry[1]+=data[k];entry[2]+=data[k+1];entry[3]+=data[k+2];hist.set(key,entry);
    }
    palette=[...hist.values()].sort((a,b)=>b[0]-a[0]).slice(0,count).map(v=>v.slice(1).map(x=>Math.round(x/v[0])));
    if(!palette.length)return {shapes:[],engine:'native-preview',width,height};
    // Two deterministic k-means refinement passes (no random output).
    for(let pass=0;pass<2;pass++){
      const sums=palette.map(()=>[0,0,0,0]);
      for(let i=0;i<n;i+=stride)if(!transparent[i]){const k=i*4,j=nearest(data[k],data[k+1],data[k+2],palette);sums[j][0]++;sums[j][1]+=data[k];sums[j][2]+=data[k+1];sums[j][3]+=data[k+2];}
      palette=palette.map((p,j)=>sums[j][0]?sums[j].slice(1).map(x=>Math.round(x/sums[j][0])):p);
    }
  } else palette=[[28,34,46]];
  const labels=new Int16Array(n);labels.fill(-1);
  for(let i=0;i<n;i++)if(!transparent[i]){
    const k=i*4;
    if(colorMode)labels[i]=nearest(data[k],data[k+1],data[k+2],palette);
    else if(.2126*data[k]+.7152*data[k+1]+.0722*data[k+2]<threshold)labels[i]=0;
  }
  const shapes=[];let totalEdges=0;
  for(let color=0;color<palette.length;color++){
    const edges=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(labels[i]!==color)continue;
      if(y===0||labels[i-width]!==color)edges.push([{x,y},{x:x+1,y}]);
      if(x===width-1||labels[i+1]!==color)edges.push([{x:x+1,y},{x:x+1,y:y+1}]);
      if(y===height-1||labels[i+width]!==color)edges.push([{x:x+1,y:y+1},{x,y:y+1}]);
      if(x===0||labels[i-1]!==color)edges.push([{x,y:y+1},{x,y}]);
    }
    totalEdges+=edges.length;
    if(totalEdges>150000)throw new Error('图片细节过多，请降低描摹尺寸或先减少噪点。');
    const rings=stitchEdges(edges).filter(p=>Math.abs(signedArea(p))>=minArea).map(p=>simplifyRing(p,tolerance));
    const fill='#'+palette[color].map(v=>v.toString(16).padStart(2,'0')).join('');
    for(const group of groupRings(rings))shapes.push({rings:group.map(p=>ring(p)),fill,stroke:'none',strokeWidth:0});
  }
  if(shapes.length>1500)throw new Error('生成对象超过 1500 个，请提高去杂点参数或减少颜色。');
  return {shapes,engine:'native-preview',width,height};
}
function nearest(r,g,b,palette){let index=0,min=Infinity;for(let j=0;j<palette.length;j++){const p=palette[j],d=(r-p[0])**2+(g-p[1])**2+(b-p[2])**2;if(d<min){min=d;index=j;}}return index;}
