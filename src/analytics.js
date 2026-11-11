// No Google request is made before explicit analytics consent. No form values are sent.
(() => {
  const config=JSON.parse(document.querySelector('#page-data').textContent);
  const id=config.ga4MeasurementId;
  if(!/^G-[A-Z0-9]+$/.test(id||''))return;
  const key='tagai.analytics-consent.v1',banner=document.querySelector('#analytics-consent');
  let choice;try{const v=JSON.parse(localStorage.getItem(key)||'null');if(v&&v.expires>Date.now())choice=v.choice;}catch{}
  let started=false,active=false;
  function gtag(){window.dataLayer.push(arguments);}
  function cleanCampaign(value){return typeof value==='string'&&/^[a-zA-Z0-9_.~-]{1,80}$/.test(value)?value:undefined;}
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
  function save(value){choice=value;try{localStorage.setItem(key,JSON.stringify({choice:value,expires:Date.now()+180*86400000}));}catch{}window.tagaiAttribution?.consent(value);banner.hidden=true;if(value==='granted')start();else{active=false;if(started){gtag('consent','update',{analytics_storage:'denied'});window['ga-disable-'+id]=true;}clearCookies();if(started)location.reload();}}
  document.querySelectorAll('[data-analytics-choice]').forEach(el=>el.addEventListener('click',()=>save(el.dataset.analyticsChoice)));
  document.querySelectorAll('.analytics-settings').forEach(el=>{el.hidden=false;el.addEventListener('click',()=>{banner.hidden=false;banner.querySelector('button').focus();});});
  if(choice==='granted')start();else if(choice!=='denied')banner.hidden=false;
  const allowed=new Set(['waitlist_cta_click','waitlist_form_start','waitlist_submit_success','waitlist_submit_error','app_waitlist_confirmed','app_waitlist_reactivated','visit_subscription_created','updates_subscription_created','enquiry_submit_success','form_submit_error']);
  // Creation/activation events are dispatched only from authoritative database transition results.
  // GA4 is a consented funnel, never the source of truth for the 1,000 active-email goal.
  window.tagaiTrack=(event,extra={})=>{
    if(!active||!allowed.has(event))return;
    const audience=event==='form_submit_error'?({visits:'visits',updates:'updates',pilot:'enquiry',visit:'enquiry',access:'preferences',privacy:'privacy'}[extra.form_kind]||'app'):event.startsWith('visit_')?'visits':event.startsWith('updates_')?'updates':event==='enquiry_submit_success'?'enquiry':'app';
    const params={language:config.lang,signup_audience:audience,measurement_version:'2'};
    if(['pilot','visit','app','visits','updates','access','privacy'].includes(extra.form_kind))params.form_kind=extra.form_kind;
    const a=extra.attribution||window.tagaiAttribution?.snapshot();
    for(const f of ['source','medium','campaign']){const v=cleanCampaign(a?.first?.[f]);if(v)params['acquisition_'+f]=v;}
    gtag('event',event,params);
  };
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('a[href]');if(!a)return;
    try{const url=new URL(a.href,location.href);if(url.origin===location.origin&&url.hash==='#waitlist'&&/^\/(?:en|fr|el|es|it|de|ru)\/$/.test(url.pathname))window.tagaiTrack('waitlist_cta_click');}catch{}
  });
  document.querySelector('#waitlist-form')?.addEventListener('input',()=>window.tagaiTrack('waitlist_form_start'),{once:true});
})();
