import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/analytics.js',import.meta.url),'utf8');
function boot({id='G-TEST123',choice}={}){
 const scripts=[],events={},storage=new Map(),window={},banner={hidden:true,querySelector:()=>({focus(){}})};
 const action=v=>({dataset:{analyticsChoice:v},addEventListener:(e,fn)=>events[v]=fn});
 const accept=action('granted'),reject=action('denied'),settings={hidden:true,addEventListener:(e,fn)=>events.settings=fn};
 const form={addEventListener:(e,fn)=>events.start=fn};
 if(choice)storage.set('tagai.analytics-consent.v1',JSON.stringify({choice,expires:Date.now()+100000}));
 const document={cookie:'',referrer:'https://search.example/find?email=private@example.com',title:'TAGAI',head:{append:s=>scripts.push(s)},createElement:()=>({}),querySelector:s=>s==='#page-data'?{textContent:JSON.stringify({ga4MeasurementId:id,lang:'en'})}:s==='#analytics-consent'?banner:form,querySelectorAll:s=>s==='[data-analytics-choice]'?[accept,reject]:s==='.analytics-settings'?[settings]:[]};
 const location={origin:'https://tagai.art',pathname:'/en/',search:'?email=private@example.com&utm_source=instagram&utm_medium=social&utm_campaign=launch',hostname:'tagai.art',reload(){events.reload=true;}};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 vm.runInNewContext(source,{window,document,location,localStorage,URL,URLSearchParams,Date,Set});return {scripts,events,window,banner,storage};
}
test('analytics does not contact Google without consent or configured stream',()=>{const x=boot();assert.equal(x.scripts.length,0);assert.equal(x.banner.hidden,false);x.events.denied();assert.equal(x.scripts.length,0);assert.equal(boot({choice:'denied'}).scripts.length,0);assert.equal(boot({id:''}).scripts.length,0);});
test('consent starts one tag, strips URL personal data and only sends allowed events',()=>{const x=boot();x.events.granted();x.events.granted();assert.equal(x.scripts.length,1);x.window.tagaiTrack('waitlist_submit_success');x.window.tagaiTrack('private@example.com');const data=JSON.stringify(x.window.dataLayer);assert.ok(data.includes('waitlist_submit_success'));assert.ok(data.includes('instagram'));assert.ok(!data.includes('private@example.com'));assert.ok(!data.includes('?email'));x.events.denied();assert.equal(x.window['ga-disable-G-TEST123'],true);assert.equal(x.events.reload,true);});
