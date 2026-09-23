import {traceImage} from './trace.js';
self.onmessage=({data})=>{
  try {self.postMessage({ok:true,result:traceImage(data.image,data.options)});}
  catch(error){self.postMessage({ok:false,error:error.message||'描摹失败'});}
};
