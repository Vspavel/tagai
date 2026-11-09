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

const form=document.querySelector('#waitlist-form'), message=document.querySelector('#form-message'), submit=document.querySelector('#submit');
const retry=document.querySelector('#retry-form');
let ready=false;
async function getToken(){
  const response=await fetch('/api/waitlist',{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('unavailable');
  const config=await response.json();
  if(!config.ready||!config.token)throw new Error('unavailable');
  return config.token;
}
async function initialize(){
  retry.hidden=true;message.textContent=data.checking;
  try{await getToken();ready=true;submit.disabled=false;message.textContent='';}
  catch{ready=false;submit.disabled=true;message.textContent=data.unavailable;retry.hidden=false;}
}
retry.addEventListener('click',initialize);
initialize();

async function post(body){
  body.token=await getToken();
  const response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(response.status===429)throw new Error('rate');
  if(!response.ok)throw new Error('unavailable');
  const result=await response.json();
  if(!result.accepted)throw new Error('unavailable');
}
form.addEventListener('submit',async e=>{
  e.preventDefault();if(!ready)return;
  if(!form.reportValidity()){message.textContent=data.invalid;return;}
  submit.disabled=true;submit.querySelector('span').textContent=data.pending;message.textContent='';
  const query=new URLSearchParams(location.search);
  try{
    await post({kind:'waitlist',email:form.elements.email.value,city:form.elements.city.value,language:data.lang,consent:form.elements.consent.checked,website:form.elements.website.value,source:(query.get('utm_source')||'').slice(0,120),campaign:(query.get('utm_campaign')||'').slice(0,120)});
    window.tagaiTrack?.('waitlist_submit_success');
    form.reset();message.textContent=data.success;message.dataset.state='success';
  }catch(error){window.tagaiTrack?.('waitlist_submit_error');message.textContent=error.message==='rate'?data.rate:data.error;message.dataset.state='error';}
  finally{submit.disabled=false;submit.querySelector('span').textContent=data.join;}
});

const privacyForm=document.querySelector('#privacy-form');
privacyForm.addEventListener('submit',async e=>{
  e.preventDefault();const status=privacyForm.querySelector('[role=status]'),button=privacyForm.querySelector('[type=submit]');
  if(!privacyForm.reportValidity()){status.textContent=data.invalid;return;}
  button.disabled=true;button.textContent=data.pending;status.textContent='';
  try{
    await post({kind:'privacy',email:privacyForm.elements.email.value,requestType:privacyForm.elements.requestType.value,message:privacyForm.elements.message.value,website:privacyForm.elements.website.value,language:data.lang});
    privacyForm.reset();status.textContent=data.received;status.dataset.state='success';
  }catch(error){status.textContent=error.message==='rate'?data.rate:data.error;status.dataset.state='error';}
  finally{button.disabled=false;button.textContent=data.send;}
});

