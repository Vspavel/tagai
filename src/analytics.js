// No Google request is made before explicit analytics consent. No form values are sent.
(() => {
  const config=JSON.parse(document.querySelector('#page-data').textContent);
  const id=config.ga4MeasurementId;
  if(!/^G-[A-Z0-9]+$/.test(id||''))return;
  const key='tagai.analytics-consent.v1',banner=document.querySelector('#analytics-consent');
  let choice;try{const v=JSON.parse(localStorage.getItem(key)||'null');if(v&&v.expires>Date.now())choice=v.choice;}catch{}
  let started=false,active=false;
  function gtag(){window.dataLayer.push(arguments);}
  function cleanCampaign(value){return /^[a-zA-Z0-9_.-]{1,80}$/.test(value||'')?value:undefined;}
  function start(){
    if(started){active=true;gtag('consent','update',{analytics_storage:'granted'});return;}
    started=true;active=true;window.dataLayer=window.dataLayer||[];
    gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('consent','update',{analytics_storage:'granted'});
    let ref='';try{ref=document.referrer?new URL(document.referrer).origin:'';}catch{}
    const query=new URLSearchParams(location.search);
    const settings={send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+location.pathname,page_referrer:ref,language:config.lang};
    for(const [ga,utm] of [['campaign_source','utm_source'],['campaign_medium','utm_medium'],['campaign_name','utm_campaign']]){const v=cleanCampaign(query.get(utm));if(v)settings[ga]=v;}
    // Apply privacy and page-view settings before container initialization as well as to the destination.
    gtag('set',settings);gtag('js',new Date());gtag('config',id,settings);gtag('event','page_view',{page_title:document.title,page_location:settings.page_location,page_referrer:ref});
    const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+id;document.head.append(script);
  }
  function clearCookies(){for(const cookie of document.cookie.split(';')){const name=cookie.split('=')[0].trim();if(!/^_ga(?:_|$)/.test(name))continue;for(const domain of ['',location.hostname,'.tagai.art'])document.cookie=name+'=; Max-Age=0; Path=/; SameSite=Lax; Secure'+(domain?'; Domain='+domain:'');}}
  function save(value){choice=value;try{localStorage.setItem(key,JSON.stringify({choice:value,expires:Date.now()+180*86400000}));}catch{}banner.hidden=true;if(value==='granted')start();else{active=false;if(started){gtag('consent','update',{analytics_storage:'denied'});window['ga-disable-'+id]=true;}clearCookies();if(started)location.reload();}}
  document.querySelectorAll('[data-analytics-choice]').forEach(el=>el.addEventListener('click',()=>save(el.dataset.analyticsChoice)));
  document.querySelectorAll('.analytics-settings').forEach(el=>{el.hidden=false;el.addEventListener('click',()=>{banner.hidden=false;banner.querySelector('button').focus();});});
  if(choice==='granted')start();else if(choice!=='denied')banner.hidden=false;
  const allowed=new Set(['waitlist_cta_click','waitlist_form_start','waitlist_submit_success','waitlist_submit_error','enquiry_submit_success']);
  // Accepted submissions include duplicates; unique active registrations come from the database.
  window.tagaiTrack=(event)=>{if(active&&allowed.has(event))gtag('event',event,{language:config.lang,signup_audience:config.audience==='visits'?'visits':'app'});};
  document.querySelectorAll('a[href="#waitlist"]').forEach(el=>el.addEventListener('click',()=>window.tagaiTrack('waitlist_cta_click')));
  document.querySelector('#waitlist-form')?.addEventListener('input',()=>window.tagaiTrack('waitlist_form_start'),{once:true});
})();
