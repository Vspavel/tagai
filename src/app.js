const data = JSON.parse(document.querySelector('#page-data').textContent);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !reduceMotion) {
  document.body.classList.add('js-ready');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) {entry.target.classList.remove('pending');observer.unobserve(entry.target);} });
  }, {rootMargin:'0px 0px 30px 0px',threshold:0.06});
  document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('pending');observer.observe(el);});
}

const tabs = [...document.querySelectorAll('[data-question]')];
function selectQuestion(i,focus=false){
  tabs.forEach((tab,n)=>{tab.setAttribute('aria-selected',String(n===i));tab.tabIndex=n===i?0:-1;});
  document.querySelector('#answer').setAttribute('aria-labelledby','q-'+i);
  document.querySelector('#answer p').textContent=data.answers[i];
  if(focus)tabs[i].focus();
}
tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>selectQuestion(i));
  tab.addEventListener('keydown',e=>{
    let target;
    if(e.key==='ArrowRight')target=(i+1)%tabs.length;
    if(e.key==='ArrowLeft')target=(i+tabs.length-1)%tabs.length;
    if(e.key==='Home')target=0;
    if(e.key==='End')target=tabs.length-1;
    if(target!==undefined){e.preventDefault();selectQuestion(target,true);}
  });
});

const photoDialog=document.querySelector('#photo-dialog');
document.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>{
  const img=photoDialog.querySelector('img');img.src=button.dataset.image;img.alt=button.querySelector('img').alt;
  photoDialog.querySelector('figcaption').textContent=button.dataset.caption;photoDialog.showModal();
}));
document.querySelectorAll('.privacy-button').forEach(button=>button.addEventListener('click',()=>document.querySelector('#privacy-dialog').showModal()));
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
});

const form=document.querySelector('#waitlist-form'),privacyForm=document.querySelector('#privacy-form');
let busy=false;
const draftKey='tagai.form-draft.v2.'+(data.pageKind==='manage'?'manage':data.audience);
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
let requestId=uuid();
function errorField(field,text){const el=document.getElementById(field.getAttribute('aria-describedby'));field.setAttribute('aria-invalid',String(Boolean(text)));if(el){el.textContent=text;el.hidden=!text;}}
function validEmail(field){const email=field.value.trim().toLowerCase(),parts=email.split('@');if(email.length>254||!field.validity.valid||parts.length!==2||parts[0].length>64||!/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+$/.test(parts[0])||/^\.|\.$|\.\./.test(parts[0]))return false;try{return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(new URL('https://'+parts[1]).hostname);}catch{return false;}}
function validate(target){
  const email=target.elements.email;email.value=email.value.trim();errorField(email,validEmail(email)?'':data.emailError);
  if(target.elements.consent)errorField(target.elements.consent,target.elements.consent.checked?'':data.consentError);
  const invalid=target.querySelector('[aria-invalid="true"]');if(invalid){invalid.focus();return false;}return true;
}
function showError(status,error){status.dataset.state='error';status.textContent=error.message==='invalid'?data.checkFields:error.message==='rate'?data.rate:error.message==='unavailable'?data.serverError:data.uncertain;}
async function getToken(){
  const response=await fetch('/api/waitlist',{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('unavailable');const config=await response.json();if(!config.ready||!config.token)throw new Error('unavailable');return config.token;
}
async function post(body){
  body.token=await getToken();
  let response;
  try{response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw new Error('uncertain');}
  if(response.status===400)throw new Error('invalid');if(response.status===429)throw new Error('rate');if(!response.ok)throw new Error(response.status===503?'unavailable':'uncertain');
  const result=await response.json();if(!result.accepted)throw new Error('uncertain');
}
function clearDraft(){try{sessionStorage.removeItem(draftKey);}catch{}}
for(const target of [form,privacyForm].filter(Boolean)){
  target.addEventListener('input',e=>{if(e.target.hasAttribute('aria-invalid'))errorField(e.target,'');const status=target.querySelector('[role=status]');if(status.dataset.state==='error'){status.textContent='';delete status.dataset.state;}requestId=uuid();});
  target.addEventListener('change',()=>{requestId=uuid();});
}
if(privacyForm){const audience=new URLSearchParams(location.search).get('list');if(['app','visits','both'].includes(audience))privacyForm.elements.audience.value=audience;}
// Drafts are stored only for an explicit language switch, consumed once, and expire in 30 minutes.
try{
  const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');sessionStorage.removeItem(draftKey);
  const target=privacyForm||form;
  if(target&&draft&&draft.expires>Date.now()){
    for(const key of ['email','city','message','requestType','audience'])if(target.elements[key]&&typeof draft[key]==='string')target.elements[key].value=draft[key];
    if(target.elements.consent)target.elements.consent.checked=draft.consent===true;
    if(target.elements.city?.value)target.querySelector('details')?.setAttribute('open','');
    if(typeof draft.requestId==='string')requestId=draft.requestId;
  }
}catch{}
function campaignURL(link){
  const url=new URL(link.href),query=new URLSearchParams(location.search);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){const value=query.get(key);if(/^[a-zA-Z0-9_.-]{1,80}$/.test(value||''))url.searchParams.set(key,value);}
  return url;
}
document.querySelectorAll('a[data-locale]').forEach(link=>{
  const url=campaignURL(link);url.hash=location.hash;link.href=url.href;
  link.addEventListener('click',e=>{
    if(busy){e.preventDefault();(form||privacyForm)?.querySelector('[role=status]')?.focus();return;}
    const target=privacyForm||form;
    if(target&&!target.hidden){const draft={expires:Date.now()+1800000,requestId};for(const key of ['email','city','message','requestType','audience'])if(target.elements[key])draft[key]=target.elements[key].value;if(target.elements.consent)draft.consent=target.elements.consent.checked;try{sessionStorage.setItem(draftKey,JSON.stringify(draft));}catch{}}
    const current=new URL(link.href);current.hash=location.hash;link.href=current.href;
  });
});
document.querySelectorAll('a[href]').forEach(link=>{if(!link.hasAttribute('data-locale')&&new URL(link.href).origin===location.origin&&!link.getAttribute('href').startsWith('#'))link.href=campaignURL(link).href;});
if(form){
  const message=document.querySelector('#form-message'),submit=document.querySelector('#submit'),retry=document.querySelector('#retry-form'),fields=form.querySelector('fieldset'),success=document.querySelector('#signup-success');let ready=false;
  async function initialize(){retry.hidden=true;message.textContent=data.checking;delete message.dataset.state;try{await getToken();ready=true;submit.disabled=false;message.textContent='';}catch{ready=false;submit.disabled=true;message.textContent=data.unavailable;retry.hidden=false;}}
  retry.addEventListener('click',initialize);initialize();
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!ready)return;if(!validate(form)){message.textContent=data.checkFields;message.dataset.state='error';return;}
    const query=new URLSearchParams(location.search),email=form.elements.email.value;
    const safeCampaign=k=>/^[a-zA-Z0-9_.-]{1,80}$/.test(query.get(k)||'')?query.get(k):'';
    const body={kind:'waitlist',audience:data.audience,email,city:form.elements.city.value,language:data.lang,consent:form.elements.consent.checked,website:form.elements.website.value,source:safeCampaign('utm_source'),campaign:safeCampaign('utm_campaign')};
    busy=true;fields.disabled=true;form.setAttribute('aria-busy','true');submit.querySelector('span').textContent=data.pending;message.textContent=data.pending;delete message.dataset.state;
    try{await post(body);window.tagaiTrack?.('waitlist_submit_success');success.querySelector('.success-email').textContent=email;form.hidden=true;success.hidden=false;clearDraft();success.focus();}
    catch(error){window.tagaiTrack?.('waitlist_submit_error');showError(message,error);}
    finally{busy=false;fields.disabled=false;form.removeAttribute('aria-busy');submit.querySelector('span').textContent=data.join;}
  });
  document.querySelector('#change-email').addEventListener('click',()=>{form.reset();form.querySelectorAll('[aria-invalid]').forEach(el=>errorField(el,''));message.textContent='';delete message.dataset.state;success.hidden=true;form.hidden=false;form.elements.email.focus();});
}
if(privacyForm){
  const status=privacyForm.querySelector('[role=status]'),button=privacyForm.querySelector('[type=submit]'),fields=privacyForm.querySelector('fieldset'),success=document.querySelector('#privacy-success');
  privacyForm.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;if(!validate(privacyForm)){status.textContent=data.checkFields;return;}
    const email=privacyForm.elements.email.value;
    const body={kind:'privacy',requestId,audience:privacyForm.elements.audience.value,email,requestType:privacyForm.elements.requestType.value,message:privacyForm.elements.message.value,website:privacyForm.elements.website.value,language:data.lang};
    busy=true;fields.disabled=true;privacyForm.setAttribute('aria-busy','true');button.textContent=data.pending;status.textContent=data.pending;
    try{await post(body);success.querySelector('.success-email').textContent=email;privacyForm.hidden=true;success.hidden=false;clearDraft();success.focus();}catch(error){showError(status,error);}
    finally{busy=false;fields.disabled=false;privacyForm.removeAttribute('aria-busy');button.textContent=data.send;}
  });
  document.querySelector('#new-request').addEventListener('click',()=>{privacyForm.reset();requestId=uuid();status.textContent='';success.hidden=true;privacyForm.hidden=false;privacyForm.elements.email.focus();});
}
const works=[...document.querySelectorAll('[data-work]')];
function selectWork(i,focus=false){works.forEach((el,n)=>{el.setAttribute('aria-selected',String(n===i));el.tabIndex=n===i?0:-1;});document.querySelector('#demo-note').textContent=data.demoNotes[i];document.querySelector('#demo-context').textContent=data.demoContexts[i];document.querySelector('#demo-detail').setAttribute('aria-labelledby','work-'+i);if(focus)works[i].focus();}
works.forEach((el,i)=>{el.addEventListener('click',()=>selectWork(i));el.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%works.length;if(e.key==='ArrowLeft')n=(i+works.length-1)%works.length;if(e.key==='Home')n=0;if(e.key==='End')n=works.length-1;if(n!==undefined){e.preventDefault();selectWork(n,true);}});});
