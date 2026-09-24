/** Persistent local project shelf. No upload, no origin-independent guarantees. */
export function openProjectDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('vector-studio',2);let blocked=false;
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts');if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});};
    req.onsuccess=()=>{if(blocked){req.result.close();return;}req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>reject(req.error||new Error('浏览器存储不可用。'));
    req.onblocked=()=>{blocked=true;reject(new Error('另一个旧版本标签页占用了项目库，请关闭其他编辑器标签页后重试。'));};
  });
}
export async function projectRecords(){const db=await openProjectDB();return new Promise((resolve,reject)=>{const tx=db.transaction('projects'),req=tx.objectStore('projects').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.updatedAt-a.updatedAt));tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error);};});}
export async function putProject(record,expectedRevision=null){
  const db=await openProjectDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');let problem=null;
    const req=store.get(record.id);req.onsuccess=()=>{const old=req.result;
      if((old?.revision??null)!==expectedRevision){problem=new Error('此项目已在另一标签页修改或删除。请另存为新项目，避免覆盖。');tx.abort();return;}
      record={...record,revision:(old?.revision||0)+1,updatedAt:Date.now()};store.put(record);
    };
    tx.oncomplete=()=>{db.close();resolve(record);};tx.onabort=tx.onerror=()=>{db.close();reject(problem||tx.error||new Error('保存失败，请导出项目文件备份。'));};
  });
}
export async function removeProject(id,revision){const db=await openProjectDB();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');let error=null;store.get(id).onsuccess=e=>{const old=e.target.result;if(old&&old.revision!==revision){error=new Error('项目已被另一标签页更新，请刷新项目库后重试。');tx.abort();}else store.delete(id);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(error||tx.error);};});}
