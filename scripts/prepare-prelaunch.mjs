// Rebuild the approved EN baseline and reviewed static translations. Runtime edits use the CMS.
import {readFile,writeFile} from 'node:fs/promises';
import {hash} from '../admin/server/content-model.mjs';
const blocks=JSON.parse(await readFile('docs/approved-prelaunch-blocks.json','utf8'));
const previous=JSON.parse(await readFile('content/previous-source.json','utf8'));
const translations=JSON.parse(await readFile('content/prelaunch-translations.json','utf8'));
const ui=JSON.parse(await readFile('content/interface.json','utf8'));
const flatten=(o,p='',r={})=>{for(const[k,v]of Object.entries(o)){const key=p?p+'.'+k:k;if(v&&typeof v==='object')flatten(v,key,r);else r[key]=String(v);}return r;};
function source(lang){
 const b=i=>{const value=lang==='en'?blocks[i]:translations[lang]?.[i];if(value===undefined)throw Error('Missing '+lang+' block '+i);return value;};
 const clean=i=>b(i).replace(/^\*\*[^*]+:\*\*\s*/,'').replace(/^\*\*|\*\*$/g,'');
 const take=ids=>ids.map(b).join('\n\n');
 const s=ui[lang];
 return {
 site:s,
 home:{title:s.homeTitle,description:clean(14),heading:clean(13),intro:clean(14),launch:clean(15),heroLink:clean(17),formIntro:clean(18),
 encounter:{heading:clean(20),body:take([21,22,23]),caption:clean(24),label:clean(25),link:clean(26)},
 features:[29,31,33,35].map(i=>({heading:clean(i),body:b(i+1)})),
 collection:{heading:clean(39),body:take([40,41]),label:clean(42),title:clean(43),table:b(44),note:clean(45)},
 second:{heading:clean(48),body:b(49),label:clean(50),link:clean(51)},
 trust:{heading:clean(54),body:take([55,56]),founder:clean(57),note:b(58)},
 visits:{heading:clean(60),body:b(61)},event:{heading:clean(63),body:b(64)},
 faqs:[68,70,72,74,76,78,80].map(i=>({question:clean(i),answer:b(i+1)})),
 signup:{heading:clean(83),body:b(84),updates:clean(86),micro:clean(88)}},
 partners:{title:s.partnersTitle,description:clean(132),heading:clean(131),intro:take([132,133]),cta:clean(134),reportLink:clean(135),
 experience:{heading:clean(137),body:take([138,139,140])},report:{heading:clean(143),table:b(144),subheading:clean(145),body:b(146),scopeHeading:clean(147),scope:b(148)},
 preparation:{heading:clean(151),steps:[152,153,154,155].map(i=>b(i).replace(/^\d+\. /,'')),note:clean(156)},event:{heading:clean(158),body:b(159),launch:clean(160),date:clean(161)},
 form:{heading:clean(164),micro:clean(168),success:clean(170),after:b(171)}},
 visits:{title:s.visitsTitle,description:clean(178),heading:clean(176),intro:take([177,178]),cta:clean(179),guestLink:clean(180),
 experience:{heading:clean(182),body:take([183,184]),cities:clean(185),status:clean(186)},
 form:{heading:clean(188),body:take([189,190]),cta:clean(194),micro:clean(195),success:clean(197),after:b(198)},
 guest:{heading:clean(201),body:b(202),cta:clean(205),micro:clean(206),appLink:clean(207)}},
 'sarah-awad':{title:clean(94)+' — TAGAI',description:clean(20),heading:clean(94),caption:b(95),label:clean(96),body:take([97,98,99,100,101,102,103,104,105,106,107,108]),information:b(109),sources:b(110)},
 'sanya-kantarovsky':{title:clean(113)+' — TAGAI',description:clean(48),heading:clean(113),caption:b(114),label:clean(115),body:take([116,117,118,119,120,121,122,123,124]),information:b(125),sources:b(126)},
 updates:{title:clean(212)+' — TAGAI',description:b(213),heading:clean(212),intro:b(213),signupTitle:clean(214),signupBody:clean(215),cta:clean(217),micro:clean(218)},
 'launch-update':{title:clean(221)+' — TAGAI',description:b(222),heading:clean(221),body:take([222,223,224,225])},
 manage:{title:s.manageTitle+' — TAGAI',description:s.manageIntro,heading:s.manageTitle,body:s.manageIntro}
 };
}
const all=Object.fromEntries(['en','fr','el'].map(l=>[l,source(l)]));
const structure={site:['shared',''],home:['app',''],partners:['partners','partners'],visits:['visits','visits'],'sarah-awad':['encounter','encounters/sarah-awad'],'sanya-kantarovsky':['encounter','encounters/sanya-kantarovsky'],updates:['updates','updates'],'launch-update':['article','updates/tagai-march-2027'],manage:['manage','manage']};
const documents=Object.entries(structure).map(([id,[kind,slug]])=>{
 const en=flatten(all.en[id]);return {id,kind,slug,indexable:!['site','manage'].includes(id),enabled:!['updates','launch-update'].includes(id),schemaVersion:2,baselineRevision:['home','partners'].includes(id)?'2026-11-10-depth':'2026-11-10-approved',previousSourceHash:previous[id]||null,source:en,translations:Object.fromEntries(['fr','el'].map(l=>[l,{fields:flatten(all[l][id]),sourceFields:en,provider:'editorial-ai',reviewed:false,locked:[]}]))};
});
await writeFile('admin/server/content-seed.json',JSON.stringify(documents,null,2)+'\n');
console.log('Prepared approved content: '+documents.length+' documents, EN / FR / EL.');
