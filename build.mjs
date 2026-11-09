import { mkdir, writeFile, copyFile, cp, rm } from 'node:fs/promises';
import { locales } from './src/locales.mjs';
import { forms } from './src/forms.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines = a => a.map(x=>`<span>${esc(x)}</span>`).join('');
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.5"/></svg>';
const cities = ['Cyprus','Paris','London','Dubai','Abu Dhabi','Doha','New York','Hong Kong'];
const release = process.env.VERCEL_ENV !== 'preview';

function page(lang,t){
t={...t,...forms[lang]};
const p={title:t.privacyTitle,paragraphs:t.paragraphs};
const config = JSON.stringify({lang,registrationEnabled:true,...Object.fromEntries(['checking','unavailable','pending','success','error','invalid','join','close','rate','received','send','retry'].map(k=>[k,t[k]])),answers:t.answers}).replace(/</g,'\\u003c');
return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#E4E5E3">
<title>${esc(t.title)}</title><meta name="description" content="${esc(t.description)}">${release?'':'<meta name="robots" content="noindex,nofollow">'}
<link rel="canonical" href="https://tagai.art/${lang}/">${Object.keys(locales).map(l=>`<link rel="alternate" hreflang="${l}" href="https://tagai.art/${l}/">`).join('')}<link rel="alternate" hreflang="x-default" href="https://tagai.art/en/">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(t.title)}"><meta property="og:description" content="${esc(t.description)}"><meta property="og:image" content="https://tagai.art/assets/encounter.webp"><meta property="og:url" content="https://tagai.art/${lang}/">
<link rel="icon" type="image/svg+xml" href="/assets/symbol.svg"><link rel="preload" href="/assets/roboto-condensed-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/styles.css">
<script id="page-data" type="application/json">${config}</script><script src="/app.js" defer></script>
</head><body id="top"><a href="#main" class="skip">${esc(t.skip)}</a>
<header class="header wrap"><a class="brand" href="/${lang}/" aria-label="TAGAI"><img src="/assets/logo.svg" width="140" height="40" alt="TAGAI"></a>
<nav class="nav" aria-label="${lang==='fr'?'Navigation principale':lang==='el'?'Κύρια πλοήγηση':'Main navigation'}"><a href="#idea">${esc(t.nav[0])}</a><a href="#collection">${esc(t.nav[1])}</a><a href="#encounters">${esc(t.nav[2])}</a></nav>
<div class="header-right"><nav class="languages" aria-label="${esc(t.language)}">${['en','fr','el'].map(l=>`<a href="/${l}/" lang="${l}" hreflang="${l}" ${l===lang?'aria-current="page"':''}>${l.toUpperCase()}</a>`).join('')}</nav><a class="header-cta" href="#waitlist">${esc(t.join)} ${arrow}</a></div></header>
<main id="main">
<section class="hero wrap"><div class="hero-copy"><p class="eyebrow">${esc(t.eyebrow)}</p><h1>${lines(t.hero)}</h1><p class="hero-intro">${esc(t.intro)}</p><a class="button red" href="#waitlist">${esc(t.join)} ${arrow}</a><p class="release"><span class="status-dot"></span>${esc(t.access)}</p><a class="discover" href="#idea">${esc(t.exploreLink)}<span aria-hidden="true">↓</span></a></div>
<figure class="hero-photo"><img src="/assets/encounter.webp" srcset="/assets/encounter-small.webp 720w, /assets/encounter.webp 1152w" sizes="(max-width:760px) 92vw, 43vw" width="1152" height="1536" alt="${esc(t.alts.encounter)}" fetchpriority="high"><figcaption><span>01 — TAGAI</span><span>${esc(t.imageNote)}</span></figcaption></figure></section>

<section id="idea" class="manifesto wrap section reveal"><p class="eyebrow">${esc(t.manifestoLabel)}</p><h2>${lines(t.manifesto)}</h2><p>${esc(t.manifestoBody)}</p></section>

<section class="explore wrap section"><figure class="explore-photo reveal"><img loading="lazy" src="/assets/looking.webp" width="1152" height="1536" alt="${esc(t.alts.looking)}"><figcaption>EXPLORE / TAGAI</figcaption></figure>
<div class="explore-copy reveal"><p class="eyebrow red-text">${esc(t.exploreLabel)}</p><h2>${lines(t.exploreTitle)}</h2><p class="body-large">${esc(t.exploreBody)}</p>
<div class="question-demo"><p class="micro">${esc(t.example)}</p><div class="questions" role="tablist" aria-label="${esc(t.example)}">${t.questions.map((q,i)=>`<button role="tab" id="q-${i}" aria-selected="${i===0}" aria-controls="answer" tabindex="${i===0?'0':'-1'}" data-question="${i}">${esc(q)}</button>`).join('')}</div><div id="answer" class="answer" role="tabpanel" aria-labelledby="q-0" tabindex="0"><img src="/assets/symbol.svg" width="22" height="22" alt=""><p>${esc(t.answers[0])}</p></div></div><p class="evidence">${esc(t.evidence)}</p></div></section>

<section id="collection" class="collection section"><div class="wrap"><div class="collection-head reveal"><div><p class="eyebrow red-text">${esc(t.collectionLabel)}</p><h2>${lines(t.collectionTitle)}</h2></div><p class="body-large">${esc(t.collectionBody)}</p></div>
<div class="collection-bar"><span>${esc(t.collectionNote)}</span><span aria-hidden="true">互 / 03</span></div><div class="memories">${[1,2,3].map((n,i)=>`<figure class="memory memory-${n} reveal"><button class="image-button" data-image="/assets/memory-0${n}.webp" data-caption="${esc(t.memoryNames[i])}" aria-label="${esc(t.enlarge+': '+t.memoryNames[i])}"><img loading="lazy" src="/assets/memory-0${n}.webp" width="${n===3?1024:1152}" height="1536" alt="${esc(t.alts['memory'+n])}"><span class="image-open" aria-hidden="true">${arrow}</span></button><figcaption><span class="memory-index">0${n}</span><div><h3>${esc(t.memoryNames[i])}</h3><p>${esc(t.memoryLabels[i])}</p></div></figcaption></figure>`).join('')}</div>
<div class="share reveal"><p class="eyebrow red-text">${esc(t.shareLabel)}</p><div><h2>${esc(t.shareTitle)}</h2><p>${esc(t.shareBody)}</p></div><p class="share-foot">${esc(t.shareFoot)}</p></div></div></section>

<section id="encounters" class="studio section wrap"><div class="studio-head reveal"><p class="eyebrow red-text">${esc(t.studioLabel)}</p><h2>${lines(t.studioTitle)}</h2></div><div class="studio-layout"><figure class="studio-photo reveal"><picture><source media="(max-width:600px)" srcset="/assets/studio-vertical.webp"><img loading="lazy" src="/assets/studio.webp" width="1536" height="1094" alt="${esc(t.alts.studio)}"></picture><figcaption>${esc(t.studioCaption)}</figcaption></figure><div class="studio-copy reveal"><p class="body-large">${esc(t.studioBody)}</p><a class="text-link" href="#waitlist">${esc(t.join)} ${arrow}</a><p class="small">${esc(t.studioNote)}</p></div></div></section>

<section class="founder section"><div class="wrap founder-layout"><figure class="founder-photo reveal"><img loading="lazy" src="/assets/founder.webp" width="1320" height="1960" alt="${esc(t.alts.founder)}"></figure><div class="founder-copy reveal"><p class="eyebrow red-text">${esc(t.founderLabel)}</p><h2>${esc(t.founderTitle)}</h2><p>${esc(t.founderBody)}</p><p>${esc(t.founderBody2)}</p><div class="founder-signature"><strong>${esc(t.founderName)}</strong><span>${esc(t.founderRole)}</span></div><p class="pilot">${esc(t.pilot)}</p></div></div></section>

<section class="faq section wrap"><div class="reveal"><p class="eyebrow red-text">${esc(t.faqLabel)}</p><h2>${esc(t.faqTitle)}</h2></div><div class="faq-list reveal">${t.faqs.map(([q,a])=>`<details><summary>${esc(q)}<span aria-hidden="true">+</span></summary><p>${esc(a)}</p></details>`).join('')}</div></section>

<section id="waitlist" class="waitlist section"><div class="wrap"><div class="waitlist-layout"><div class="waitlist-copy"><p class="eyebrow">${esc(t.waitLabel)}</p><h2>${lines(t.waitTitle)}</h2><p>${esc(t.waitBody)}</p></div>
<form id="waitlist-form" class="waitlist-form" novalidate><div class="field"><label for="email">${esc(t.email)}</label><input id="email" name="email" type="email" autocomplete="email" placeholder="${esc(t.emailPlaceholder)}" maxlength="254" required></div><div class="field"><label for="city">${esc(t.city)} <span>(${esc(t.optional)})</span></label><select id="city" name="city"><option value="">${esc(t.cityPlaceholder)}</option>${cities.map((c,i)=>`<option value="${c}">${esc(t.places[i])}</option>`).join('')}<option value="Elsewhere">${esc(t.elsewhere)}</option></select></div><div class="honey" aria-hidden="true"><label for="website">Website</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><label class="consent"><input id="consent" name="consent" type="checkbox" required><span>${esc(t.consent)} <button type="button" class="privacy-button">${esc(t.privacy)}</button></span></label><button type="submit" class="button light" id="submit" disabled><span>${esc(t.join)}</span>${arrow}</button><p class="form-message" id="form-message" role="status">${esc(t.checking)}</p><button type="button" id="retry-form" hidden>${esc(t.retry)}</button><noscript><p>Please enable JavaScript to submit the form.</p></noscript></form></div>
<div class="places"><p class="micro">${esc(t.placesLabel)}</p><p>${t.places.map(x=>`<span>${esc(x)}</span>`).join('')}</p></div></div></section></main>

<footer class="footer wrap"><div class="footer-top"><a href="/${lang}/" aria-label="TAGAI"><img src="/assets/logo.svg" width="140" height="40" alt="TAGAI"></a><p>${esc(t.footerLine)}</p><a href="#top" class="back-top">${esc(t.backTop)}<span aria-hidden="true">↑</span></a></div><div class="footer-bottom"><span>© 2026 TAGAI</span><button type="button" class="privacy-button">${esc(t.privacy)}</button><nav class="languages" aria-label="${esc(t.language)}">${['en','fr','el'].map(l=>`<a href="/${l}/" lang="${l}" ${l===lang?'aria-current="page"':''}>${l.toUpperCase()}</a>`).join('')}</nav></div></footer>
<dialog id="photo-dialog" class="photo-dialog" aria-label="${esc(t.enlarge)}"><button class="dialog-close" aria-label="${esc(t.close)}">×</button><figure><img alt=""><figcaption></figcaption></figure></dialog>
<dialog id="privacy-dialog" class="privacy-dialog" aria-labelledby="privacy-title"><button class="dialog-close" aria-label="${esc(t.close)}">×</button><p class="eyebrow">TAGAI</p><h2 id="privacy-title">${esc(p.title)}</h2>${p.paragraphs.map(x=>`<p>${esc(x)}</p>`).join('')}
<h3>${esc(t.contact)}</h3><form id="privacy-form" novalidate>
<label for="privacy-email">${esc(t.email)}</label><input id="privacy-email" name="email" type="email" autocomplete="email" maxlength="254" required>
<label for="request-type">${esc(t.requestType)}</label><select id="request-type" name="requestType">${['withdraw','access','correct','delete','other'].map((v,i)=>`<option value="${v}">${esc(t.types[i])}</option>`).join('')}</select>
<label for="privacy-message">${esc(t.note)}</label><textarea id="privacy-message" name="message" rows="3" maxlength="1500"></textarea>
<div class="honey" aria-hidden="true"><label for="privacy-website">Website</label><input id="privacy-website" name="website" tabindex="-1" autocomplete="off"></div>
<button type="submit" class="button red">${esc(t.send)}</button><p role="status" class="form-message"></p></form></dialog>
</body></html>`;
}
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public/assets','dist/assets',{recursive:true});
for(const [lang,t] of Object.entries(locales)) {await mkdir(`dist/${lang}`,{recursive:true});await writeFile(`dist/${lang}/index.html`,page(lang,t));}
await writeFile('dist/index.html',page('en',locales.en));
await copyFile('src/styles.css','dist/styles.css');await copyFile('src/app.js','dist/app.js');
await writeFile('dist/robots.txt',release?'User-agent: *\nAllow: /\nSitemap: https://tagai.art/sitemap.xml\n':'User-agent: *\nDisallow: /\n');
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(locales).map(l=>`<url><loc>https://tagai.art/${l}/</loc></url>`).join('')}</urlset>`);
console.log('Built EN / FR / EL. Mode: '+(release?'public':'private preview'));
