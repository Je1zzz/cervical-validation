const API='https://cznnzigxstshvzosypch.supabase.co/functions/v1/patient-tct-review';
const $=id=>document.getElementById(id);
const reviewerId=localStorage.getItem('cv-reviewer-id')||crypto.randomUUID();
localStorage.setItem('cv-reviewer-id',reviewerId);
$('reviewer').value=localStorage.getItem('cv-reviewer-name')||'';
let access='',cases=[];
const drafts=new Map(),rowElements=new Map();
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
async function api(action,extra={}){
 const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({action,...extra})});
 const body=await response.text();let result;try{result=JSON.parse(body);}catch{throw Error('反馈服务暂不可用，请稍后重试');}
 if(!response.ok)throw Error(result.error||'连接失败，请重试');return result;
}
function correction(side){if(!side)return '';if(side.text!==undefined)return side.text;return side.status==='reported'?side.labels.join(' / '):({pending:'',not_found:'未找到报告',not_done:'确认未检查',uncertain:'无法判断'}[side.status]||'');}
function sideValue(text,original){
 if(original&&text===correction(original))return original;
 return text.trim()?{status:'reported',labels:[],text}:{status:'pending',labels:[]};
}
function pending(d){return d.version!==d.savedVersion;}
function refreshStatus(){
 const dirty=[...drafts.values()].filter(pending).length,saving=[...drafts.values()].some(d=>d.promise),errors=[...drafts.values()].filter(d=>d.error).length;
 $('saveStatus').textContent=errors?`${errors} 行保存失败，修改仍在，请点击“保存修改”重试`:saving?'正在保存…':dirty?`${dirty} 行有未保存修改`:'所有修改已保存';
 $('saveStatus').className=errors?'error':'';
 for(const [id,tr] of rowElements){const d=drafts.get(id);for(const td of tr.querySelectorAll('.input-cell')){td.classList.toggle('dirty',pending(d));td.classList.toggle('failed',!!d.error);td.title=d.error||'';}}
}
function saveRow(id){
 const d=drafts.get(id);if(d.promise)return d.promise;if(!pending(d))return Promise.resolve();
 const work=async()=>{try{while(pending(d)){
   const version=d.version;
   const review={caseId:id,reviewerId,reviewerName:$('reviewer').value.trim(),pre:sideValue(d.pre,d.original?.pre),post:sideValue(d.post,d.original?.post),note:d.original?.note||''};
   await api('save',{review});d.savedVersion=version;d.original=structuredClone(review);d.error='';
 }}catch(error){d.error=error.message;}finally{d.promise=null;refreshStatus();}};
 d.promise=work();refreshStatus();return d.promise;
}
function render(){
 $('rows').replaceChildren();rowElements.clear();const query=$('search').value.trim().toLowerCase();
 const filtered=cases.filter(c=>!query||(c.name+' '+c.hospital+' '+c.id).toLowerCase().includes(query));
 const fragment=document.createDocumentFragment();
 filtered.forEach((c,index)=>{
  const tr=el('tr');tr.dataset.id=c.id;tr.append(el('th',String(index+1)));tr.firstChild.scope='row';
  for(const value of [c.name,c.id,c.age,c.hospital,c.date,c.pre,c.post])tr.append(el('td',value));
  const d=drafts.get(c.id);
  for(const side of ['pre','post']){
   const td=el('td',undefined,'input-cell'),input=el('textarea');input.value=d[side];input.maxLength=2000;input.rows=1;input.dataset.side=side;input.setAttribute('aria-label',`${c.id} 修正${side==='pre'?'术前':'术后'}TCT`);input.spellcheck=false;
   input.oninput=()=>{d[side]=input.value;d.version++;d.error='';refreshStatus();};
   input.onblur=()=>void saveRow(c.id);
   input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();const next=tr.nextElementSibling?.querySelector(`textarea[data-side="${side}"]`);if(next)next.focus();else input.blur();}};
   td.append(input);tr.append(td);
  }
  fragment.append(tr);rowElements.set(c.id,tr);
 });
 $('rows').append(fragment);$('total').textContent=`${cases.length} 位患者`;$('visibleCount').textContent=`显示 ${filtered.length} / ${cases.length} 行 · 黄色两列可填写`;$('empty').hidden=filtered.length!==0;refreshStatus();
}
$('search').oninput=render;
$('save').onclick=async()=>{const ids=[...drafts].filter(([,d])=>pending(d)).map(([id])=>id);$('save').disabled=true;for(const id of ids)await saveRow(id);$('save').disabled=false;refreshStatus();};
$('loginForm').onsubmit=async event=>{event.preventDefault();access=$('code').value.trim();$('loginError').textContent='正在打开表格…';const button=event.currentTarget.querySelector('button');button.disabled=true;try{
 const login=await api('login'),result=await api('list',{reviewerId});cases=result.cases;const existing=new Map(result.reviews.map(r=>[r.caseId,r]));
 for(const c of cases){const original=existing.get(c.id);drafts.set(c.id,{pre:correction(original?.pre),post:correction(original?.post),original,version:0,savedVersion:0,promise:null,error:''});}
 localStorage.setItem('cv-reviewer-name',$('reviewer').value.trim());$('login').hidden=true;$('workspace').hidden=false;$('export').hidden=login.role!=='admin';render();
 }catch(error){$('loginError').textContent=error.message;}finally{button.disabled=false;}};
$('logout').onclick=()=>{if([...drafts.values()].some(d=>pending(d)||d.promise)&&!confirm('有修改尚未保存，确定退出？'))return;location.reload();};
window.addEventListener('beforeunload',event=>{if([...drafts.values()].some(d=>pending(d)||d.promise)){event.preventDefault();event.returnValue='';}});
function csvCell(value){let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
$('export').onclick=async()=>{try{
 const result=await api('export');const rows=[['患者姓名','患者编号','年龄（原表）','医院','检查日期（原表扫描日期）','术前TCT','术后TCT','修正术前TCT','修正术后TCT','复核医生','更新时间','备注']];
 for(const row of result.rows){const c=JSON.parse(row.case_payload),r=row.review_payload?JSON.parse(row.review_payload):null;rows.push([c.name,c.id,c.age,c.hospital,c.date,c.pre,c.post,correction(r?.pre),correction(r?.post),row.reviewer_name,row.updated_at,r?.note]);}
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='TCT复核反馈_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){alert(error.message);}};
