const config=JSON.parse(document.querySelector('#page-data').textContent),u=config.ui;
const $=(s,at=document)=>at.querySelector(s);
let activeRequests=0;
const ids=new Map();
const uuid=()=>crypto.randomUUID();
const errors={invalid:u.invalidEmail,verification:u.retry,rate_limit:u.rate,unavailable:u.unavailable,email_unavailable:u.manageNoEmail,expired:u.expired,conflict:u.uncertain};
async function availability(){const r=await fetch('/api/registrations',{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(u.unavailable);const d=await r.json();if(!d.ready||!d.token)throw Error(u.unavailable);return d;}
async function post(body,legacy=false){const ready=await availability();const r=await fetch(legacy?'/api/waitlist':'/api/registrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,token:ready.token,language:config.lang}),signal:AbortSignal.timeout(28000)});const d=await r.json();if(!r.ok)throw Error(errors[d.error]||u.uncertain);return d;}
function message(form,text,state=''){const el=$('[role=status]',form);el.textContent=text;el.dataset.state=state;el.focus();}
function inputError(field,text){field.setAttribute('aria-invalid',text?'true':'false');const error=document.getElementById(field.getAttribute('aria-describedby'));if(error){error.textContent=text;error.hidden=!text;}}
function valid(form){let first;for(const el of form.elements){if(!el.willValidate)continue;const text=el.validity.valueMissing?u.required:!el.validity.valid?(el.type==='email'?u.invalidEmail:el.type==='url'?u.invalidWebsite:u.required):'';inputError(el,text);if(text&&!first)first=el;}if(first){first.focus();return false;}return true;}
function lock(form,value){$('fieldset',form).disabled=value;form.setAttribute('aria-busy',String(value));activeRequests+=value?1:-1;}
const campaign=new URLSearchParams(location.search);const attribution=()=>window.tagaiAttribution?.snapshot()||{first:{},last:{}};
function trackActivation(d){for(const x of d.activated||[])if(x.audience==='app')window.tagaiTrack?.(x.firstTime?'app_waitlist_confirmed':'app_waitlist_reactivated',{attribution:x.attribution});}
for(const form of document.querySelectorAll('form[data-form]')){
 ids.set(form.id,uuid());let saved=false,lastEmailStatus='';
 const button=$('button[type=submit]',form),retry=$('.form-retry',form);
 async function init(){retry.hidden=true;try{await availability();button.disabled=false;$('[role=status]',form).textContent='';}catch{button.disabled=true;message(form,u.unavailable,'error');retry.hidden=false;}}
 retry.onclick=()=>{if(saved){if(lastEmailStatus==='sent')ids.set(form.id,uuid());form.requestSubmit();}else init();};
 form.addEventListener('input',e=>{inputError(e.target,'');saved=false;ids.set(form.id,uuid());});
 form.addEventListener('change',()=>{const city=form.elements.city;if(city&&$('[data-other-city]',form)){const show=city.value==='Other';$('[data-other-city]',form).hidden=!show;form.elements.otherCity.required=show;if(!show)form.elements.otherCity.value='';}});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(form.getAttribute('aria-busy')==='true'||!valid(form))return;
  const values=Object.fromEntries(new FormData(form)),type=form.dataset.form;
  const common={email:values.email?.trim(),website:values.website||'',requestId:ids.get(form.id),attribution:attribution()};
  let body=type==='subscription'?{...common,action:'subscription',selections:[form.dataset.audience,...(values.updates?['updates']:[])],cities:new FormData(form).getAll('cities')}:type==='access'?{...common,action:'access'}:type==='enquiry'?{...common,action:'enquiry',kind:form.dataset.kind,details:Object.fromEntries(['organisation','role','city','otherCity','name','dates','url','message'].map(k=>[k,values[k]||'']))}:{...common,kind:'privacy',requestType:values.requestType,audience:values.audience,message:values.message||''};
  lock(form,true);retry.hidden=true;message(form,u.pending);
  try{const d=await post(body,type==='privacy');if(!d.accepted)throw Error(u.uncertain);saved=true;lastEmailStatus=d.emailStatus;if(type==='enquiry'&&d.created)window.tagaiTrack?.('enquiry_submit_success',{form_kind:form.dataset.kind});
   for(const audience of d.createdAudiences||[])window.tagaiTrack?.(audience==='app'?'waitlist_submit_success':audience==='visits'?'visit_subscription_created':'updates_subscription_created',{attribution:attribution()});
   if(type==='enquiry'){const status=$('[role=status]',form);status.replaceChildren();const title=document.createElement('strong');title.textContent=form.dataset.success;const p=document.createElement('p');p.textContent=form.dataset.after;status.append(title,p);$('fieldset',form).hidden=true;}
   else if(type==='privacy'){message(form,u.received);$('fieldset',form).hidden=true;}
   else {message(form,d.emailStatus==='sent'?u.sent:d.emailStatus==='failed'?u.mailFailed:u.savedNoEmail,d.emailStatus==='failed'?'error':'');$('fieldset',form).hidden=d.emailStatus!=='failed';retry.hidden=d.emailStatus==='not_configured';retry.textContent=u.resend;}
  }catch(error){message(form,Object.values(errors).includes(error.message)?error.message:u.uncertain,'error');retry.hidden=false;window.tagaiTrack?.(form.dataset.audience==='app'?'waitlist_submit_error':'form_submit_error',{form_kind:form.dataset.kind||form.dataset.audience||type});}
  finally{lock(form,false);}
 });
 init();
}
// Local drafts live only across an explicit language change and expire after 30 minutes.
for(const a of document.querySelectorAll('[data-locale]'))a.addEventListener('click',e=>{
 if(activeRequests){e.preventDefault();return;}
 const draft={expires:Date.now()+1800000,forms:{}};for(const f of document.querySelectorAll('form[data-form]')){if($('fieldset',f).hidden)continue;draft.forms[f.id]={values:[...new FormData(f)],requestId:ids.get(f.id)};}
 try{sessionStorage.setItem('tagai.prelaunch-draft',JSON.stringify(draft));}catch{}
 const url=new URL(a.href);for(const k of ['utm_source','utm_medium','utm_campaign']){const v=campaign.get(k);if(/^[a-zA-Z0-9_.-]{1,80}$/.test(v||''))url.searchParams.set(k,v);}if(!location.hash.startsWith('#token='))url.hash=location.hash;a.href=url.href;
});
try{const d=JSON.parse(sessionStorage.getItem('tagai.prelaunch-draft')||'null');sessionStorage.removeItem('tagai.prelaunch-draft');if(d?.expires>Date.now())for(const[id,entry]of Object.entries(d.forms)){const f=document.getElementById(id);if(!f)continue;for(const[name,value]of entry.values)for(const el of f.querySelectorAll('[name="'+name.replace(/[^a-zA-Z]/g,'')+'"]')){if(el.type==='checkbox')el.checked=entry.values.some(([n,v])=>n===name&&v===el.value);else el.value=value;}ids.set(id,entry.requestId);f.dispatchEvent(new Event('change'));}}catch{}
for(const b of document.querySelectorAll('.privacy-button'))b.onclick=()=>$('#privacy-dialog').showModal();
for(const d of document.querySelectorAll('dialog'))$('.dialog-close',d).onclick=()=>d.close();
// Confirmation tokens stay in the fragment, are removed immediately, and are never sent to analytics or saved in storage.
const match=location.hash.match(/^#token=([A-Za-z0-9_-]{43})$/);let accessToken=match?.[1];if(accessToken){history.replaceState(null,'',location.pathname+location.search);if($('#token-view')){
 $('#manage-access').hidden=true;$('#token-view').hidden=false;
 const call=body=>post({...body,accessToken});
 const status=$('#token-status');
 const render=d=>{$('#confirm-form').hidden=true;$('#preferences-form').hidden=false;$('#verified-email').textContent=d.email;for(const[k,v]of Object.entries(d.preferences))$('#preferences-form').elements[k].checked=v;};
 (async()=>{status.textContent=u.checking;try{const d=await call({action:'inspect'});if(d.needsConfirmation){status.textContent=u.confirmIntro;$('#confirm-selection').textContent=d.selections.map(k=>u[k+'Choice']).join(' · ');$('#confirm-form').hidden=false;}else{status.textContent=u.alreadyConfirmed;render(d);}}catch(e){status.textContent=e.message;$('#manage-access').hidden=false;}})();
 $('#confirm-form').onsubmit=async e=>{e.preventDefault();const b=$('button',e.target);b.disabled=true;try{const d=await call({action:'confirm'});trackActivation(d);status.textContent=u.confirmed;render(d);if(d.preferences.app)$('#frequency-form').hidden=false;}catch(err){status.textContent=err.message;}finally{b.disabled=false;}};
 async function preferences(all=false){const form=$('#preferences-form');if($('fieldset',form).disabled)return;const preferences=Object.fromEntries(['app','updates','visits'].map(k=>[k,!all&&form.elements[k].checked]));lock(form,true);try{const d=await call({action:'preferences',preferences});trackActivation(d);render(d);message(form,all?u.allUnsubscribed:u.preferencesSaved);}catch(e){message(form,e.message,'error');}finally{lock(form,false);}}
 $('#preferences-form').onsubmit=e=>{e.preventDefault();preferences();};$('#unsubscribe-all').onclick=()=>preferences(true);
 $('#frequency-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=$('button',f);b.disabled=true;try{await call({action:'frequency',frequency:f.elements.frequency.value});$('[role=status]',f).textContent=u.answerSaved;}catch(err){$('[role=status]',f).textContent=err.message;}finally{b.disabled=false;}};
 $('#skip-frequency').onclick=()=>$('#frequency-form').hidden=true;
}}

// A language list is navigation: native links, one open list, and predictable dismissal.
const languagePickers=[...document.querySelectorAll('.language-picker')];
for(const picker of languagePickers){
 const summary=picker.querySelector('summary');
 picker.addEventListener('toggle',()=>{if(picker.open)for(const other of languagePickers)if(other!==picker)other.open=false;});
 picker.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&picker.open){e.preventDefault();picker.open=false;summary.focus();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();picker.open=true;const links=[...picker.querySelectorAll('a')],i=links.indexOf(document.activeElement);
   const next=e.key==='Home'?0:e.key==='End'?links.length-1:e.key==='ArrowDown'?(i+1)%links.length:(i<0?links.length-1:(i-1+links.length)%links.length);
   links[next].focus();
  }
 });
 picker.addEventListener('focusout',e=>{if(e.relatedTarget&&!picker.contains(e.relatedTarget))picker.open=false;});
}
document.addEventListener('click',e=>{for(const picker of languagePickers)if(!picker.contains(e.target))picker.open=false;});
