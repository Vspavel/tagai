// Carry campaign labels through navigation, even when analytics storage is declined.
// Only consented visitors get a 30-day first/last campaign memory. No identifiers or form values.
(() => {
  const key='tagai.attribution.v1',consentKey='tagai.analytics-consent.v1',ttl=30*86400000;
  const fields=['source','medium','campaign','content','term'];
  const clean=v=>typeof v==='string'&&/^[a-zA-Z0-9_.~-]{1,80}$/.test(v)?v:'';
  const landing=/^\/(?:en|fr|el|es|it|de|ru)\/(?:partners\/|visits\/|encounters\/(?:sarah-awad|sanya-kantarovsky)\/)?$/.test(location.pathname)?location.pathname:'/';
  const query=new URLSearchParams(location.search),current={};
  for(const f of fields){const v=clean(query.get('utm_'+f));if(v)current[f]=v;}
  if(current.source)current.landing=landing;
  const valid=v=>v&&typeof v==='object'&&clean(v.source)?Object.fromEntries([...fields,'landing'].filter(k=>k==='landing'?typeof v[k]==='string'&&/^\/[a-z/-]{0,120}$/.test(v[k]):clean(v[k])).map(k=>[k,v[k]])):{};
  let context={first:{},last:{}},allowed=false;
  try{const c=JSON.parse(localStorage.getItem(consentKey)||'null');allowed=c?.choice==='granted'&&c.expires>Date.now();if(allowed){const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.expires>Date.now())context={first:valid(saved.first),last:valid(saved.last)};}else localStorage.removeItem(key);}catch{}
  if(current.source){if(!context.first.source)context.first={...current};context.last={...current};}
  function persist(){try{if(allowed&&context.first.source)localStorage.setItem(key,JSON.stringify({...context,expires:Date.now()+ttl}));else localStorage.removeItem(key);}catch{}}
  const originalLinks=new Map();
  function decorate(a){
    if(!originalLinks.has(a))originalLinks.set(a,a.href);
    try{const url=new URL(a.href,location.href);if(url.origin!==location.origin||!/^\/(?:en|fr|el|es|it|de|ru)\//.test(url.pathname)||url.hash.startsWith('#token='))return;
      // An explicitly tagged destination starts its own campaign; never combine two campaigns.
      if(fields.some(f=>url.searchParams.has('utm_'+f)))return;
      for(const f of fields){const v=context.last[f];if(v)url.searchParams.set('utm_'+f,v);}a.href=url.href;
    }catch{}
  }
  persist();document.querySelectorAll('a[href]').forEach(decorate);
  document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(a)decorate(a);});
  window.tagaiAttribution={snapshot:()=>JSON.parse(JSON.stringify(context)),consent(value){allowed=value==='granted';if(!allowed)context={first:current.source?{...current}:{},last:current.source?{...current}:{}};persist();for(const [a,href] of originalLinks){a.href=href;decorate(a);}}};
})();
