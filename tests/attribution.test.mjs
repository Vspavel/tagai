import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {cleanAttribution} from '../server/attribution.mjs';
const code=await readFile(new URL('../src/attribution.js',import.meta.url),'utf8');
function visit(url,{storage=new Map(),hrefs=['/en/encounters/sarah-awad/','/en/#waitlist','/fr/','https://thethirdline.com/','/en/?utm_source=partner&utm_medium=referral','#waitlist']}={}){
 const location=new URL(url),links=hrefs.map(href=>({href:new URL(href,url).href})),listeners={},window={};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const document={querySelectorAll:()=>links,addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(code,{location,window,document,localStorage,URL,URLSearchParams,Date});
 return {links,storage,context:()=>JSON.parse(JSON.stringify(window.tagaiAttribution.snapshot())),consent:window.tagaiAttribution.consent};
}
test('campaign survives story → language change → waitlist without analytics storage',()=>{
 const entry=visit('https://tagai.art/en/?utm_source=instagram&utm_medium=social&utm_campaign=encounters&email=private@example.com');
 assert.equal(entry.storage.size,0);assert.ok(!entry.links[0].href.includes('email='));assert.equal(entry.links[3].href,'https://thethirdline.com/');assert.equal(new URL(entry.links[4].href).searchParams.get('utm_source'),'partner');
 const story=visit(entry.links[0].href),fr=visit(story.links[2].href),form=visit(fr.links[1].href);
 assert.deepEqual(form.context().first,{source:'instagram',medium:'social',campaign:'encounters',landing:'/en/'});
 assert.equal(new URL(form.links[1].href).hash,'#waitlist');
});
test('consented first and last campaigns stay distinct; direct visits do not overwrite; withdrawal clears memory',()=>{
 const storage=new Map([['tagai.analytics-consent.v1',JSON.stringify({choice:'granted',expires:Date.now()+100000})]]);
 visit('https://tagai.art/en/?utm_source=instagram&utm_medium=social',{storage});
 const second=visit('https://tagai.art/en/?utm_source=gallery&utm_medium=referral',{storage});
 assert.equal(second.context().first.source,'instagram');assert.equal(second.context().last.source,'gallery');
 const direct=visit('https://tagai.art/en/',{storage});assert.equal(direct.context().last.source,'gallery');direct.consent('denied');
 assert.equal(storage.has('tagai.attribution.v1'),false);assert.equal(new URL(direct.links[0].href).search,'');
});
test('stale, unavailable storage and unsafe campaign values do not leak private query data',()=>{
 const storage=new Map([['tagai.attribution.v1','broken']]);const x=visit('https://tagai.art/en/?utm_source=a%40example.com&utm_campaign=%3Cscript%3E&token=secret',{storage});assert.deepEqual(x.context(),{first:{},last:{}});assert.equal(new URL(x.links[0].href).search,'');
 assert.deepEqual(cleanAttribution({first:{source:'social',medium:'email@example.com',landing:'/en/?email=private@example.com',email:'private@example.com'},last:{source:'new',campaign:'spring'}}),{first:{source:'social'},last:{source:'new',campaign:'spring'}});
});

test('blocked storage cannot prevent URL attribution or form payload',()=>{const location=new URL('https://tagai.art/en/?utm_source=instagram&utm_medium=social'),window={},link={href:'https://tagai.art/en/encounters/sarah-awad/'};vm.runInNewContext(code,{window,location,document:{querySelectorAll:()=>[link],addEventListener(){}},localStorage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}},URL,URLSearchParams,Date});assert.equal(window.tagaiAttribution.snapshot().first.source,'instagram');assert.ok(link.href.includes('utm_source=instagram'));window.tagaiAttribution.consent('granted');});
