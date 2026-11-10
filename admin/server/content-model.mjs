import {createHash} from 'node:crypto';
export const LANGUAGES=['en','fr','el','es','it','de','ru'];
export const LANGUAGE_NAMES={en:'English',fr:'Français',el:'Ελληνικά',es:'Español',it:'Italiano',de:'Deutsch',ru:'Русский'};
export const hash=x=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).digest('hex');
export function unflatten(fields){const result={};for(const[key,value]of Object.entries(fields)){const path=key.split('.');let at=result;for(let i=0;i<path.length;i++){const k=path[i];if(['__proto__','prototype','constructor'].includes(k))throw Error('invalid');if(i===path.length-1)at[k]=value;else at=at[k]??=(/^\d+$/.test(path[i+1])?[]:{});}}return result;}
export function validateFields(fields,reference){if(!fields||Array.isArray(fields)||typeof fields!=='object'||Object.keys(fields).length>500)throw Error('fields');for(const[k,v]of Object.entries(fields)){if(!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*$/.test(k)||k.split('.').some(s=>['__proto__','constructor','prototype'].includes(s))||typeof v!=='string'||v.length>12000)throw Error('fields');}if(reference&&Object.keys(reference).sort().join('|')!==Object.keys(fields).sort().join('|'))throw Error('fields');if(JSON.stringify(fields).length>160000)throw Error('fields');return fields;}
const literals=s=>(s.match(/https?:\/\/[^\s<>]+|\{\{?\w+\}?\}|\b\d+(?:[.,]\d+)*\b/g)||[]).sort().join('|');
export function validateTranslation(source,fields){validateFields(fields,source);for(const k of Object.keys(source)){if(source[k].trim()&&!fields[k].trim())throw Error('translation_empty');if(literals(source[k])!==literals(fields[k]))throw Error('translation_literals');}return fields;}
export function translationState(doc,lang){if(lang==='en')return 'ready';const t=doc.translations?.[lang];if(!t)return 'missing';return hash(t.sourceFields||{})===hash(doc.source)?'ready':'stale';}
export function checks(doc){
 const out=[];
 const add=(id,ok,pass,fail)=>out.push({id,ok,message:ok?pass:fail});
 add('english',Object.values(doc.source).some(s=>s.trim()),'Английский оригинал заполнен','Английский оригинал пуст');
 for(const lang of LANGUAGES.slice(1)){
  const state=translationState(doc,lang);
  add('locale_'+lang,state==='ready',LANGUAGE_NAMES[lang]+': перевод актуален',LANGUAGE_NAMES[lang]+(state==='missing'?': нет перевода':': перевод требует обновления'));
 }
 if(doc.kind!=='shared'){
  add('slug',doc.id==='home'||/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug),'Корректный адрес страницы','Некорректный адрес страницы');
  const title=doc.source.title||doc.source.manageTitle||doc.source['studioTitle.0'];
  const desc=doc.source.description||doc.source.manageIntro||doc.source.visitIntro;
  add('title',!!title?.trim(),'Заголовок страницы задан','Нет заголовка страницы');
  add('description',!!desc?.trim(),'Описание страницы задано','Нет описания страницы');
  if(doc.kind==='manage')add('index',!doc.indexable,'Управление подпиской закрыто от индексации','Управление подпиской необходимо закрыть от индексации');
 }
 return out;
}
export function validateDocument(doc){if(!/^[a-z][a-z0-9-]{0,60}$/.test(doc.id)||!['app','visits','manage','article','shared'].includes(doc.kind)||typeof doc.indexable!=='boolean'||!((doc.id==='home'||doc.id==='site')?doc.slug==='':/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug)))throw Error('invalid');validateFields(doc.source);if(doc.kind==='article')for(const k of ['title','description','heading','body'])if(!doc.source[k]?.trim())throw Error('fields');return doc;}
export function releaseSnapshot(docs){for(const doc of docs){validateDocument(doc);if(checks(doc).some(x=>!x.ok))throw Error('not_ready');for(const l of LANGUAGES.slice(1))validateTranslation(doc.source,doc.translations[l].fields);}for(const id of ['site','home','visits','manage'])if(!docs.some(d=>d.id===id))throw Error('not_ready');const slugs=docs.filter(d=>d.kind!=='shared').map(d=>d.slug);if(new Set(slugs).size!==slugs.length)throw Error('slug');return {schemaVersion:1,languages:LANGUAGES,documents:docs};}
