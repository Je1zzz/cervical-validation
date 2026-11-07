'use strict';
const API='https://cznnzigxstshvzosypch.supabase.co/functions/v1/discovery-review';
const $=id=>document.getElementById(id),rid=localStorage.getItem('discovery-reviewer-id')||crypto.randomUUID();
localStorage.setItem('discovery-reviewer-id',rid);$('reviewer').value=localStorage.getItem('discovery-reviewer-name')||'';
let access='',cases=[],reviews=new Map(),index=0,dirty=false,busy=false,admin=false;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function api(data){const response=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw Error(body.error||'请求失败，请重试');return body;}
function field(name,title,options,value){const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;group.append(legend);const box=document.createElement('div');box.className='options';for(const [key,text] of options){const label=document.createElement('label');label.className='option';const input=document.createElement('input');input.type='radio';input.name=name;input.value=key;input.checked=value===key;label.append(input,document.createTextNode(text));box.append(label);}group.append(box);$('answer').append(group);}
const levels=[['low','低'],['moderate','中'],['high','高'],['uncertain','无法判断'],['na','不适用']];
function render(){dirty=false;const item=cases[index];$('answer').replaceChildren();$('images').replaceChildren();if(!item){$('title').textContent='目前没有待复核题目';$('prompt').textContent='题库准备好后，请重新进入。';$('save').disabled=true;$('skip').disabled=true;$('previous').disabled=true;return;}
 const saved=reviews.get(item.id);$('title').textContent=item.title;$('prompt').textContent=item.prompt;$('note').value=saved?.note||'';$('note').disabled=admin;$('bar').max=cases.length;$('bar').value=reviews.size;$('progress').textContent=`第 ${index+1} / ${cases.length} 题 · 已保存 ${reviews.size} 题`;
 for(const image of item.images){const fig=document.createElement('figure'),im=document.createElement('img'),cap=document.createElement('figcaption');im.src=image.url;im.alt=image.caption;cap.textContent=image.caption;im.onclick=()=>{$('zoomImage').src=im.src;$('zoom').showModal();};fig.append(im,cap);$('images').append(fig);}
 const answer=saved?.answer;
 if(item.kind==='protocol')field('choice','您是否接受本批评分定义？',[['accept','接受，可以开始'],['revise','需要修改，请看我的说明']],answer?.choice);
 else if(item.kind==='similarity')field('choice','与参考图的核及组织形态更相似的是？',[['A','候选 A'],['B','候选 B'],['tie','相似程度接近'],['incomparable','无法比较'],['uncertain','无法判断']],answer?.choice);
 else if(item.kind==='ordering')field('choice','两图可见核异型程度',[['A_higher','A 更高'],['B_higher','B 更高'],['similar','接近'],['incomparable','不可比较'],['uncertain','无法判断']],answer?.choice);
 else{for(const [name,label] of [['nuclearAtypia','核异型程度'],['polarity','极性紊乱程度'],['architecturalDisorder','结构紊乱程度'],['inflammation','炎症细胞丰富程度'],['stroma','间质占比']])field(name,label,levels,answer?.ratings?.[name]);field('mixed','是否包含多种明显形态成分？',[['yes','是'],['no','否'],['uncertain','无法判断'],['na','不适用']],answer?.ratings?.mixed);}
 for(const input of $('answer').querySelectorAll('input'))input.disabled=admin;$('save').disabled=admin;$('previous').disabled=index===0;$('skip').disabled=!admin&&item.kind==='protocol'&&answer?.choice!=='accept';status(saved?'本题已保存，可修改后重新保存。':'');}
function value(name){return $('answer').querySelector(`input[name="${name}"]:checked`)?.value;}
function collect(){const item=cases[index];if(['protocol','similarity','ordering'].includes(item.kind)){const choice=value('choice');if(!choice)throw Error('请选择一个选项。');if(choice==='revise'&&!$('note').value.trim())throw Error('请简要说明需要修改的定义。');return {kind:item.kind,choice};}const ratings={};for(const name of ['nuclearAtypia','polarity','architecturalDisorder','inflammation','stroma','mixed']){ratings[name]=value(name);if(!ratings[name])throw Error('请填写每项；看不清时可选“无法判断”或“不适用”。');}return {kind:item.kind,ratings};}
function move(delta){if(busy)return;if(dirty&&!confirm('本题修改尚未保存，仍要离开吗？'))return;index=Math.max(0,Math.min(cases.length-1,index+delta));render();}
$('enter').onclick=async()=>{if(!$('reviewer').value.trim()||!$('code').value.trim()){status('请填写代号与访问码。',true);return;}$('enter').disabled=true;access=$('code').value.trim();try{const login=await api({action:'login'});admin=login.role==='admin';const data=await api({action:'list',reviewerId:rid});cases=data.cases.sort((a,b)=>(a.kind==='protocol'?-1:0)-(b.kind==='protocol'?-1:0)||a.id.localeCompare(b.id));reviews=new Map(data.reviews.map(r=>[r.caseId,r]));const protocol=cases.findIndex(c=>c.kind==='protocol');index=!admin&&protocol>=0&&reviews.get(cases[protocol].id)?.answer.choice!=='accept'?protocol:Math.max(0,cases.findIndex(c=>!reviews.has(c.id)));localStorage.setItem('discovery-reviewer-name',$('reviewer').value.trim());$('login').hidden=true;$('workspace').hidden=false;$('export').hidden=!admin;render();}catch(e){status(e.message,true);}finally{$('enter').disabled=false;}};
$('answer').onchange=()=>{dirty=true;status('修改尚未保存。');};$('note').oninput=()=>{dirty=true;status('修改尚未保存。');};
$('save').onclick=async()=>{if(busy)return;try{const answer=collect();busy=true;lockSaving();const review={caseId:cases[index].id,reviewerId:rid,reviewerName:$('reviewer').value.trim(),answer,note:$('note').value};status('正在保存…');await api({action:'save',review});reviews.set(review.caseId,review);dirty=false;if(answer.kind==='protocol'&&answer.choice==='revise'){render();status('意见已保存。请等待研究者确认评分定义后再继续。');return;}if(index<cases.length-1){index++;render();status('上一题已保存。');}else{render();status('本题已保存。感谢您的复核！可返回补做跳过的题目。');}}catch(e){status('未保存：'+e.message+' 填写内容仍保留，请重试。',true);}finally{busy=false;lockSaving();}};
$('previous').onclick=()=>move(-1);$('skip').onclick=()=>move(1);$('closeZoom').onclick=()=>$('zoom').close();$('logout').onclick=()=>{if(busy)return;if(dirty&&!confirm('有未保存修改，仍要退出吗？'))return;access='';$('code').value='';$('workspace').hidden=true;$('login').hidden=false;status('已退出。');};
$('export').onclick=async()=>{try{const data=await api({action:'export'});const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='discovery-feedback.json';a.click();URL.revokeObjectURL(url);status('反馈已导出。');}catch(e){status(e.message,true);}};
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});



function lockSaving(){
 const item=cases[index];
 for(const input of $('answer').querySelectorAll('input'))input.disabled=busy||admin;
 $('note').disabled=busy||admin;$('save').disabled=busy||admin||!item;
 $('previous').disabled=busy||index===0;
 $('skip').disabled=busy||!item||(!admin&&item.kind==='protocol'&&reviews.get(item.id)?.answer.choice!=='accept');
 $('logout').disabled=busy;
}
