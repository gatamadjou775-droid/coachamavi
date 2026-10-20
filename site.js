// =====================================================================
// COACH AMAVIE — site public + espace membre
// =====================================================================
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};
const S = {
  site: null, token: LS.get('amv_token', ''), client: null,
  notifs: [], rdvs: [], devis: [], inscriptions: [], chat: [], temoignages: [],
  presence: { coach: false, equipe: false }, tab: 'accueil', cible: LS.get('amv_cible', 'coach'),
  seen: LS.get('amv_seen', 0), drawerOpen: false
};

// ---------- Outils ----------
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emph = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
const plain = s => String(s || '').replace(/\*/g, '');
const F = n => Math.round(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F CFA';
const D = d => new Date(d + 'T12:00:00');
const dLong = d => D(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dShort = d => D(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fdt = iso => { const d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const fh = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const telHref = t => 'tel:' + String(t || '').replace(/[^\d+]/g, '');
const waHref = (t, msg) => 'https://wa.me/' + String(t || '').replace(/\D/g, '') + (msg ? '?text=' + encodeURIComponent(msg) : '');
const initial = s => (String(s || '?').trim()[0] || '?').toUpperCase();
const C = () => S.site.coach;
const logged = () => S.client && !S.client.invite;

const IC = {
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  wa: '<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.2c0 3.1 2.6 5.8 5.8 5.8l1.1-1.3-1.9-1-.8.8a4 4 0 0 1-2.5-2.5l.8-.8-1-1.9z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.6 3.5 5.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  ar: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  al: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  heart: '<path d="M12 20s-7-4.5-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  leaf: '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l8-8"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 0 1 4 0"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.5 2.5 4.5 5 4.5"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.5 10.5v6M7.5 7.5v.01M11 16.5v-6M11 13a2.5 2.5 0 0 1 5 0v3.5"/>',
  xsoc: '<path d="M4 4l16 16M20 4L4 20"/>',
  telegram: '<path d="M3 11l18-7-3 16-6-4-3 3v-5l9-7-11 6z"/>'
};
const ic = (k, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[k] || ''}</svg>`;
const RESEAUX = [['facebook', 'Facebook', 'facebook'], ['instagram', 'Instagram', 'instagram'], ['tiktok', 'TikTok', 'tiktok'], ['youtube', 'YouTube', 'youtube'],
  ['linkedin', 'LinkedIn', 'linkedin'], ['x', 'X', 'xsoc'], ['telegram', 'Telegram', 'telegram'], ['whatsappChaine', 'Chaîne WhatsApp', 'wa'], ['site', 'Site web', 'globe']];
const reseaux = () => RESEAUX.filter(([k]) => C().reseaux && C().reseaux[k]);
const socHtml = (labels) => reseaux().map(([k, l, i]) => `<a href="${esc(C().reseaux[k])}" target="_blank" rel="noopener" aria-label="${l}" title="${l}">${ic(i)}${labels ? `<span>${l}</span>` : ''}</a>`).join('');

async function api(path, opts) {
  opts = opts || {};
  const h = { 'Content-Type': 'application/json' };
  if (S.token) h['X-Client-Token'] = S.token;
  let res, body;
  try { res = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined }); body = await res.json(); }
  catch (e) { throw new Error('Connexion impossible. Vérifiez votre connexion internet.'); }
  if (res.status === 401 && S.token && !opts.noLogout) { S.token = ''; S.client = null; LS.set('amv_token', ''); }
  if (!res.ok || body.ok === false) throw new Error(body.error || 'Erreur');
  return body;
}
let toastTimer;
function toast(t, b, err, onClick) {
  $('t-t').textContent = t; $('t-b').textContent = b || '';
  const el = $('toast'); el.classList.toggle('err', !!err); el.classList.add('on');
  el.onclick = () => { el.classList.remove('on'); if (onClick) onClick(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), err ? 4500 : 6000);
}
function ding() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = i ? 988 : 659; g.gain.setValueAtTime(.12, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .5); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .55); });
  } catch (e) { }
}

// =====================================================================
// PAGE
// =====================================================================
function renderPage() {
  const c = C();
  document.title = `${c.nom} — ${c.marque}`;
  $('app').innerHTML = topHtml() + heroHtml() + marqueeHtml() + coachHtml() + themesHtml() + stepsHtml() + formatsHtml() +
    ateliersHtml() + temHtml() + ressHtml() + devisBandHtml() + faqHtml() + contactHtml() + footHtml() + floatHtml();
  startHero();
  observeReveal();
  badges();
}

function topHtml() {
  const c = C();
  return `<div class="strip"><div class="wrap">
      ${c.tel ? `<a href="${telHref(c.tel)}">${ic('phone')} ${esc(c.tel)}</a>` : ''}
      ${c.whatsapp ? `<a href="${waHref(c.whatsapp)}" target="_blank" rel="noopener">${ic('wa')} WhatsApp</a>` : ''}
      ${c.horaires ? `<span style="display:inline-flex;gap:7px;align-items:center">${ic('clock')} ${esc(c.horaires)}</span>` : ''}
      <span class="sp"></span><div class="soc">${socHtml()}</div></div></div>
    <header class="hdr"><div class="wrap">
      <a class="brand" href="#top" onclick="window.scrollTo({top:0,behavior:'smooth'});return false"><img src="/img/logo-mc.png" alt="${esc(c.marque)}"><span class="bt"><b>${esc(c.nom)}</b><small>${esc(c.marque)}</small></span></a>
      <nav class="menu" aria-label="Menu principal">
        <a href="#coach">Le coach</a><a href="#accompagnements">Accompagnements</a><a href="#ateliers">Ateliers</a><a href="#temoignages">Témoignages</a><a href="#ressources">Ressources</a><a href="#contact">Contact</a>
      </nav>
      <div class="hdr-a">
        <button class="me-btn" onclick="openEspace()">${ic('user')}<span class="t">${logged() ? esc(S.client.nom.split(' ')[0]) : 'Mon espace'}</span><span class="bdg" id="bdg-me"></span></button>
        <button class="btn or" onclick="openRdv()">${ic('cal')} Prendre rendez-vous</button>
        <button class="burger" onclick="toggleMenu()" aria-label="Menu">${ic('menu')}</button>
      </div></div></header>
    <div class="mnav" id="mnav" onclick="if(event.target.closest('a,button'))toggleMenu(false)">
      <a href="#coach">Le coach</a><a href="#accompagnements">Accompagnements</a><a href="#ateliers">Ateliers</a><a href="#temoignages">Témoignages</a><a href="#ressources">Ressources</a><a href="#faq">Questions fréquentes</a><a href="#contact">Contact</a>
      <button onclick="openDevis()">Devis de formation</button>
      <button class="btn or full" onclick="openRdv()">${ic('cal')} Prendre rendez-vous</button>
      <div class="soc" style="margin-top:20px;justify-content:center">${socHtml()}</div>
    </div>`;
}
function toggleMenu(force) { const m = $('mnav'); const on = force === undefined ? !m.classList.contains('on') : force; m.classList.toggle('on', on); document.body.style.overflow = on ? 'hidden' : ''; }

// ---------- Bannière défilante ----------
function wreathHtml() {
  const c = C();
  return `<div class="wreath"><img src="/img/laurier.webp" alt=""><div class="in">${c.photo ? `<img class="ph" src="${esc(c.photo)}" alt="${esc(c.nom)}">` : `<img src="/img/logo-mc.png" alt="">`}</div></div>`;
}
function banAction(b) {
  const t = b.themeId && S.site.themes.find(x => x.id === b.themeId);
  switch (b.lien) {
    case 'theme': return t ? [`openTheme(${t.id})`, 'Découvrir cet accompagnement'] : ['openRdv()', 'Prendre rendez-vous'];
    case 'devis': return ['openDevis()', 'Demander un devis'];
    case 'chat': return ['openEspace(\'chat\')', 'Discuter avec le coach'];
    case 'ateliers': return ['go(\'ateliers\')', 'Voir les ateliers'];
    case 'coach': return ['go(\'coach\')', 'Découvrir le coach'];
    case 'whatsapp': return [`window.open('${waHref(C().whatsapp)}','_blank')`, 'Écrire sur WhatsApp'];
    case 'aucun': return null;
    default: return ['openRdv()', 'Prendre rendez-vous'];
  }
}
function heroHtml() {
  let bs = S.site.banners;
  if (!bs.length) bs = [{ id: 0, surtitre: C().slogan, titre: 'Il n’est jamais trop tard pour *renaître*.', texte: '', couleur: 'nuit', lien: 'rdv' }];
  const slides = bs.map((b, i) => {
    const a = banAction(b);
    const second = b.lien === 'rdv' || !b.lien ? ['openEspace(\'chat\')', 'Parler au coach', 'chat'] : ['openRdv()', 'Prendre rendez-vous', 'cal'];
    const tag = i === 0 ? 'h1' : 'h2';
    return `<div class="slide ${b.image ? 'has-img' : esc(b.couleur || 'nuit')}" data-i="${i}" data-light="${!b.image && b.couleur === 'or' ? 1 : 0}">
      <div class="bg">${b.image ? `<img src="${esc(b.image)}" alt="" ${i ? 'loading="lazy"' : ''}>` : ''}</div>
      ${b.image ? '' : '<div class="rings"></div>' + wreathHtml()}
      <div class="ct"><div class="wrap"><div class="tx">
        ${b.surtitre ? `<div class="sur">${esc(b.surtitre)}</div>` : ''}
        ${b.titre ? `<${tag} class="d">${emph(b.titre)}</${tag}>` : ''}
        ${b.texte ? `<p>${esc(b.texte)}</p>` : ''}
        <div class="acts">${a ? `<button class="btn or" onclick="${a[0]}">${esc(a[1])} ${ic('ar')}</button>` : ''}
          <button class="btn ligne" style="color:inherit" onclick="${second[0]}">${ic(second[2])} ${second[1]}</button></div>
      </div></div></div></div>`;
  }).join('');
  return `<section class="hero" id="top" aria-roledescription="carrousel" aria-label="Thèmes d’accompagnement"><div class="slides">${slides}</div>
    ${bs.length > 1 ? `<div class="h-ctrl"><div class="wrap"><div class="h-num" id="h-num">01 / ${String(bs.length).padStart(2, '0')}</div>
      <div class="h-dots" id="h-dots">${bs.map((_, i) => `<button aria-label="Diapositive ${i + 1}" onclick="heroGo(${i},true)"></button>`).join('')}</div>
      <button class="h-arr" onclick="heroGo(HS.i-1,true)" aria-label="Précédent">${ic('al')}</button><button class="h-arr" onclick="heroGo(HS.i+1,true)" aria-label="Suivant">${ic('ar')}</button></div></div>` : ''}
  </section>`;
}
const HS = { i: 0, t: null, dur: 6500, paused: false };
function startHero() {
  clearTimeout(HS.t);
  const hero = document.querySelector('.hero'); if (!hero) return;
  const n = hero.querySelectorAll('.slide').length;
  HS.i = 0; heroGo(0);
  if (n < 2) return;
  hero.onmouseenter = () => { HS.paused = true; hero.classList.add('paused'); clearTimeout(HS.t); };
  hero.onmouseleave = () => { HS.paused = false; hero.classList.remove('paused'); heroGo(HS.i); };
  let x0 = null;
  hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) heroGo(HS.i + (dx < 0 ? 1 : -1), true); x0 = null; }, { passive: true });
}
function heroGo(i, user) {
  const hero = document.querySelector('.hero'); if (!hero) return;
  const sl = hero.querySelectorAll('.slide'); const n = sl.length;
  HS.i = (i + n) % n;
  sl.forEach((s, k) => s.classList.toggle('on', k === HS.i));
  hero.classList.toggle('light', sl[HS.i].dataset.light === '1');
  const dots = $('h-dots');
  if (dots) {
    [...dots.children].forEach((d, k) => { d.classList.remove('on'); if (k === HS.i) { void d.offsetWidth; d.classList.add('on'); } });
    hero.style.setProperty('--dur', HS.dur + 'ms');
    $('h-num').textContent = String(HS.i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
  }
  clearTimeout(HS.t);
  if (n > 1 && !HS.paused && !matchMedia('(prefers-reduced-motion:reduce)').matches) HS.t = setTimeout(() => { if (!document.hidden) heroGo(HS.i + 1); else heroGo(HS.i); }, HS.dur + (user ? 2000 : 0));
}
function marqueeHtml() {
  const ts = S.site.themes; if (!ts.length) return '';
  const one = ts.map(t => `<button onclick="openTheme(${t.id})">${esc(t.nom)}</button>`).join('');
  return `<div class="marquee" aria-label="Thèmes"><div class="tr">${one}${one}</div></div>`;
}
function go(id) { const el = $(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }

// ---------- Le coach ----------
function presenceTxt() {
  const p = S.presence, c = C();
  if (p.coach) return [true, `${esc(c.nom)} est en ligne`, 'Discutez maintenant en toute confidentialité'];
  if (p.equipe) return [true, 'L’équipe est en ligne', 'Une assistante vous répond maintenant'];
  return [false, 'Laissez un message', 'Réponse dès que possible, en toute discrétion'];
}
function coachHtml() {
  const c = C(); const [on, t1, t2] = presenceTxt();
  const paras = String(c.bio || '').split(/\n\s*\n/).filter(Boolean);
  return `<section class="sec" id="coach"><div class="wrap coach">
    <div class="portrait reveal"><div class="fr">${c.photo ? `<img src="${esc(c.photo)}" alt="${esc(c.nom)}">` : `<div class="ph"><img src="/img/laurier.webp" alt=""><small>${esc(c.nom)}</small></div>`}</div>
      <img class="lau" src="/img/laurier.webp" alt="">
      <button class="card" onclick="openEspace('chat')"><span class="dot ${on ? 'on' : ''}" data-pres></span><span><b data-pres-t>${t1}</b><small data-pres-s>${t2}</small></span></button></div>
    <div class="bio reveal">
      <span class="eyebrow">Qui est le coach ?</span>
      <h2 class="d" style="font-size:clamp(38px,4.6vw,58px);margin-top:14px">${emph(c.titreBio || c.nom)}</h2>
      ${paras.map(p => `<p>${esc(p)}</p>`).join('')}
      ${c.citation ? `<div class="quote">${esc(c.citation)}</div>` : ''}
      ${(c.valeurs || []).length ? `<div class="vals">${c.valeurs.map(v => `<span>${esc(v)}</span>`).join('')}</div>` : ''}
      ${(c.chiffres || []).length ? `<div class="figs">${c.chiffres.map(x => `<div><b>${esc(x.valeur)}</b><small>${esc(x.libelle)}</small></div>`).join('')}</div>` : ''}
      <div class="acts"><button class="btn or" onclick="openRdv()">${ic('cal')} Prendre rendez-vous</button>
        ${c.whatsapp ? `<a class="btn wa" href="${waHref(c.whatsapp, 'Bonjour Coach, je souhaite échanger avec vous.')}" target="_blank" rel="noopener">${ic('wa')} WhatsApp</a>` : ''}
        <button class="btn doux" onclick="openEspace('chat')">${ic('chat')} Discuter en ligne</button></div>
    </div></div></section>`;
}

// ---------- Accompagnements ----------
function themesHtml() {
  const ts = S.site.themes;
  return `<section class="sec papier" id="accompagnements"><div class="wrap">
    <div class="sec-h reveal"><span class="eyebrow">Accompagnements</span><h2 class="d">Ce que vous vivez <em>a un nom</em>. Et une issue.</h2>
      <p>Chaque accompagnement est personnalisé. Choisissez ce qui vous parle : vous pourrez en discuter librement lors du premier rendez-vous.</p></div>
    <div class="themes">${ts.map((t, i) => `<button class="th ${esc(t.couleur || 'bleu')} ${t.image ? 'has-img' : ''} reveal" onclick="openTheme(${t.id})">
        ${t.image ? `<div class="im"><img src="${esc(t.image)}" alt="" loading="lazy"></div>` : ''}
        <div class="bd"><span class="n">${String(i + 1).padStart(2, '0')}</span><h3>${esc(t.nom)}</h3><p>${esc(t.accroche)}</p>
          ${t.publicCible ? `<span class="tag">${esc(t.publicCible)}</span>` : ''}<span class="more">En savoir plus ${ic('ar')}</span></div></button>`).join('')}
      <button class="th or th-cta reveal" onclick="openEspace('chat')"><div class="bd"><span class="n" style="color:var(--nuit);-webkit-text-fill-color:var(--nuit)">?</span><h3>Vous ne savez pas par où commencer ?</h3><p>Écrivez simplement ce que vous ressentez. Nous vous orientons, sans engagement.</p><span class="more" style="color:var(--nuit)">Écrire au coach ${ic('ar')}</span></div></button>
    </div></div></section>`;
}
function openTheme(id) {
  const t = S.site.themes.find(x => x.id === id); if (!t) return;
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button>
    ${t.image ? `<div class="hero-im"><img src="${esc(t.image)}" alt=""></div><div class="hd">${t.publicCible ? `<span class="badge or">${esc(t.publicCible)}</span>` : ''}<div class="d">${esc(t.nom)}</div><p>${esc(t.accroche)}</p></div>`
      : `<div class="hero-c ${esc(t.couleur || 'bleu')}"><img class="lau" src="/img/laurier.webp" alt="">${t.publicCible ? `<span class="badge or" style="position:relative">${esc(t.publicCible)}</span>` : ''}<div class="d" style="margin-top:10px">${esc(t.nom)}</div><p>${esc(t.accroche)}</p></div>`}
    <div class="bd"><p class="long">${esc(t.description)}</p>
      <div class="lock">${ic('lock')}<span>Tout ce que vous partagez reste strictement confidentiel. Séances au cabinet, en visio ou par téléphone.</span></div>
      <div class="mfoot" style="flex-wrap:wrap"><button class="btn or" onclick="openRdv(${t.id})">${ic('cal')} Prendre rendez-vous</button><button class="btn doux" onclick="closeModal();openEspace('chat')">${ic('chat')} En parler d’abord</button></div></div>`);
}

// ---------- Comment ça marche / formats ----------
function stepsHtml() {
  const st = [['chat', 'Premier contact', 'Un message, un appel ou un WhatsApp. Vous dites simplement ce qui vous amène.'],
    ['ear', 'Séance de rencontre', 'On fait le point ensemble, sans jugement, sur votre situation et vos attentes.'],
    ['leaf', 'Parcours sur mesure', 'Séances, exercices et suivi adaptés à votre histoire et à votre rythme.'],
    ['spark', 'Renaissance', 'Vous retrouvez la paix, la confiance et l’élan pour construire la suite.']];
  return `<section class="sec" id="parcours"><div class="wrap">
    <div class="sec-h c reveal"><span class="eyebrow">Comment ça se passe ?</span><h2 class="d">Un chemin simple, <em>à votre rythme</em>.</h2></div>
    <div class="steps">${st.map((s, i) => `<div class="stp reveal"><span class="k">0${i + 1}</span><div class="ic">${ic(s[0])}</div><h3>${s[1]}</h3><p>${s[2]}</p></div>`).join('')}</div>
    <div style="text-align:center;margin-top:44px" class="reveal"><button class="btn nuit" onclick="openRdv()">${ic('cal')} Réserver ma première séance</button></div>
  </div></section>`;
}
function formatsHtml() {
  return `<section class="sec sombre" id="formats"><div class="wrap">
    <div class="sec-h reveal"><span class="eyebrow">Formules</span><h2 class="d">Seul(e), en groupe <em>ou en équipe</em>.</h2><p>En présentiel à Abidjan ou à distance, où que vous soyez.</p></div>
    <div class="fmts">
      <button class="fm hl reveal" onclick="openRdv()"><span class="ic">${ic('user')}</span><h3>Séance individuelle</h3><p>Un temps rien que pour vous, au cabinet, en visio ou par téléphone.</p><span class="go">Prendre rendez-vous ${ic('ar')}</span></button>
      <button class="fm reveal" onclick="go('ateliers')"><span class="ic">${ic('users')}</span><h3>Ateliers de groupe</h3><p>Des rencontres en présentiel pour avancer ensemble et ne plus se sentir seul(e).</p><span class="go">Voir les ateliers ${ic('ar')}</span></button>
      <button class="fm reveal" onclick="openDevis()"><span class="ic">${ic('brief')}</span><h3>Formations & séminaires</h3><p>Entreprises, églises, associations, écoles : des interventions sur mesure.</p><span class="go">Demander un devis ${ic('ar')}</span></button>
      <button class="fm reveal" onclick="openEspace('chat')"><span class="ic">${ic('chat')}</span><h3>Discussion en ligne</h3><p>Écrivez directement au coach ou à une assistante, depuis ce site.</p><span class="go">Commencer ${ic('ar')}</span></button>
    </div></div></section>`;
}

// ---------- Ateliers ----------
function ateliersHtml() {
  const evs = S.site.evenements;
  const card = e => {
    const d = D(e.date);
    const low = e.restantes !== null && e.restantes <= 5;
    return `<article class="ev reveal"><div class="im">${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : '<img class="lau" src="/img/laurier.webp" alt="">'}
        <div class="date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('fr-FR', { month: 'short' })}</small></div></div>
      <div class="bd"><h3>${esc(e.titre)}</h3>
        <div class="meta"><span>${ic('cal')} ${esc(dLong(e.date))}${e.heure ? ' · ' + esc(e.heure) : ''}</span>${e.lieu ? `<span>${ic('pin')} ${esc(e.lieu)}</span>` : ''}${e.format ? `<span>${ic(e.format.toLowerCase().includes('ligne') ? 'video' : 'users')} ${esc(e.format)}</span>` : ''}</div>
        ${e.public ? `<div style="margin-top:10px"><span class="badge or">${esc(e.public)}</span></div>` : ''}
        ${e.description ? `<p>${esc(e.description.length > 220 ? e.description.slice(0, 220) + '…' : e.description)}</p>` : '<p></p>'}
        <div class="ft"><div><div class="px">${esc(e.prix || 'Gratuit')}</div>${e.restantes !== null ? `<div class="pl ${low ? 'low' : ''}">${e.restantes ? e.restantes + ' place' + (e.restantes > 1 ? 's' : '') + ' restante' + (e.restantes > 1 ? 's' : '') : 'Complet'}</div>` : ''}</div>
          <button class="btn ${e.restantes === 0 ? 'doux' : 'nuit'} sm" onclick="openAtelier(${e.id})" ${e.restantes === 0 ? 'disabled' : ''}>${e.restantes === 0 ? 'Complet' : 'Je m’inscris'}</button></div></div></article>`;
  };
  return `<section class="sec papier" id="ateliers"><div class="wrap">
    <div class="sec-h reveal"><span class="eyebrow">Ateliers & événements</span><h2 class="d">Se retrouver, <em>pour ne plus être seul(e)</em>.</h2><p>Séances de groupe en présentiel, conférences et rencontres thématiques.</p></div>
    ${evs.length ? `<div class="evts">${evs.map(card).join('')}</div>`
      : `<div class="empty-card reveal"><h3>Les prochains ateliers arrivent bientôt</h3><p>Créez votre espace et activez les notifications pour être prévenu(e) en premier.</p><button class="btn nuit" onclick="openEspace('accueil')">${ic('bell')} Être prévenu(e)</button></div>`}
  </div></section>`;
}
function openAtelier(id) {
  const e = S.site.evenements.find(x => x.id === id); if (!e) return;
  AU.mode = 'inscription';
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button>
    ${e.image ? `<div class="hero-im"><img src="${esc(e.image)}" alt=""></div><div class="hd"><span class="eyebrow">Atelier</span><div class="d">${esc(e.titre)}</div></div>` : `<div class="hero-c nuit"><img class="lau" src="/img/laurier.webp" alt=""><span class="eyebrow" style="position:relative">Atelier</span><div class="d" style="margin-top:8px">${esc(e.titre)}</div></div>`}
    <div class="bd"><div class="sum">
      <div class="k"><span>Date</span><b>${esc(dLong(e.date))}${e.heure ? ' · ' + esc(e.heure) : ''}</b></div>
      ${e.lieu ? `<div class="k"><span>Lieu</span><b>${esc(e.lieu)}</b></div>` : ''}${e.format ? `<div class="k"><span>Format</span><b>${esc(e.format)}</b></div>` : ''}
      <div class="k"><span>Participation</span><b>${esc(e.prix || 'Gratuit')}</b></div>
      ${e.restantes !== null ? `<div class="k"><span>Places restantes</span><b>${e.restantes}</b></div>` : ''}</div>
      ${e.description ? `<p class="long" style="margin-top:18px">${esc(e.description)}</p>` : ''}
      <div class="two"><div class="fld"><label>Nombre de places</label><input id="ev-pl" type="number" min="1" max="${Math.min(10, e.restantes || 10)}" value="1" inputmode="numeric"></div>
        <div class="fld"><label>Un mot (facultatif)</label><input id="ev-note" placeholder="Une question, un besoin…"></div></div>
      ${logged() ? '' : authBlock('Pour vous inscrire, créez votre espace')}
      <div class="err" id="m-err"></div>
      <div class="mfoot"><button class="btn or" id="ev-go" onclick="sendInscription(${e.id})">Confirmer mon inscription</button></div></div>`);
}
async function sendInscription(id) {
  const btn = $('ev-go'); btn.disabled = true;
  try {
    await ensureAuth();
    const r = await api(`/api/evenements/${id}/inscription`, { body: { places: $('ev-pl').value, note: $('ev-note').value } });
    S.inscriptions.unshift(r.inscription);
    okScreen('Inscription enregistrée', 'Vous recevrez une confirmation dans votre espace. À très bientôt !', 'ateliers');
    reloadSite();
  } catch (e) { $('m-err').textContent = e.message; btn.disabled = false; }
}

// ---------- Témoignages ----------
function temHtml() {
  const ts = S.site.temoignages;
  return `<section class="sec" id="temoignages"><div class="wrap">
    <div class="sec-h c reveal"><span class="eyebrow">Témoignages</span><h2 class="d">Elles et ils ont <em>osé renaître</em>.</h2>${ts.length ? '' : '<p>Les premiers témoignages des personnes accompagnées apparaîtront ici, avec leur accord.</p>'}</div>
    ${ts.length ? `<div class="tems">${ts.slice(0, 9).map(t => `<figure class="tem reveal"><p>${esc(t.texte)}</p><figcaption class="who"><span class="av">${esc(initial(t.nom))}</span><span><b>${esc(t.nom)}</b>${t.theme ? `<small>${esc(t.theme)}</small>` : ''}</span></figcaption></figure>`).join('')}</div>` : ''}
    <div class="tem-cta reveal"><div><b>Vous avez été accompagné(e) ?</b><p>Votre histoire peut redonner espoir à quelqu’un. Vous pouvez rester anonyme.</p></div><button class="btn nuit" onclick="openTemoignage()">${ic('heart')} Partager mon témoignage</button></div>
  </div></section>`;
}
function openTemoignage() {
  AU.mode = 'connexion';
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button>
    <div class="hd"><span class="eyebrow">Témoignage</span><div class="d">Partagez votre chemin</div><p>Il sera relu par le coach avant publication. Vous pouvez rester anonyme.</p></div>
    <div class="bd"><div class="fld"><label>Votre témoignage</label><textarea id="tm-t" rows="6" placeholder="Ce que vous viviez avant, ce qui a changé…"></textarea></div>
      <div class="fld"><label>Accompagnement concerné (facultatif)</label><select id="tm-th"><option value="">—</option>${S.site.themes.map(t => `<option>${esc(t.nom)}</option>`).join('')}</select></div>
      <label class="opt" style="margin-top:14px" onclick="this.classList.toggle('on')" id="tm-an"><span class="mk"></span><span><b>Publier de façon anonyme</b><small>Seul le mot « Anonyme » apparaîtra.</small></span></label>
      ${logged() ? '' : authBlock('Pour envoyer votre témoignage')}
      <div class="err" id="m-err"></div><div class="mfoot"><button class="btn or" id="tm-go" onclick="sendTemoignage()">Envoyer</button></div></div>`);
}
async function sendTemoignage() {
  const b = $('tm-go'); b.disabled = true;
  try {
    await ensureAuth();
    await api('/api/temoignages', { body: { texte: $('tm-t').value, theme: $('tm-th').value, anonyme: $('tm-an').classList.contains('on') } });
    okScreen('Merci du fond du cœur', 'Votre témoignage sera publié après relecture.');
  } catch (e) { $('m-err').textContent = e.message; b.disabled = false; }
}

// ---------- Ressources ----------
function ressHtml() {
  const rs = S.site.ressources; if (!rs.length) return '';
  return `<section class="sec papier" id="ressources"><div class="wrap">
    <div class="sec-h reveal"><span class="eyebrow">Grandir</span><h2 class="d">Des ressources <em>pour avancer</em> entre deux séances.</h2><p>Exercices, réflexions et conseils pratiques, offerts.</p></div>
    <div class="ress">${rs.map(r => `<button class="rs reveal" onclick="openRessource(${r.id})"><div class="im">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : '<img class="lau" src="/img/laurier.webp" alt="">'}</div>
      <div class="bd"><span class="cat">${esc(r.categorie)}${r.duree ? ' · ' + esc(r.duree) : ''}</span><h3>${esc(r.titre)}</h3><p>${esc(r.resume)}</p><span class="rd">Lire ${ic('ar')}</span></div></button>`).join('')}</div>
  </div></section>`;
}
function openRessource(id) {
  const r = S.site.ressources.find(x => x.id === id); if (!r) return;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(r.video || '');
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button>
    ${r.image ? `<div class="hero-im"><img src="${esc(r.image)}" alt=""></div><div class="hd">` : `<div class="hero-c or"><img class="lau" src="/img/laurier.webp" alt="">`}
      <span class="eyebrow" style="position:relative">${esc(r.categorie)}${r.duree ? ' · ' + esc(r.duree) : ''}</span><div class="d" style="margin-top:8px">${esc(r.titre)}</div></div>
    <div class="bd">${yt ? `<div style="aspect-ratio:16/9;border-radius:18px;overflow:hidden;margin-bottom:18px"><iframe src="https://www.youtube-nocookie.com/embed/${esc(yt[1])}" style="width:100%;height:100%;border:0" allowfullscreen title="Vidéo"></iframe></div>` : /^https?:\/\//i.test(r.video || '') ? `<a class="btn doux sm" href="${esc(r.video)}" target="_blank" rel="noopener" style="margin-bottom:16px">${ic('video')} Voir la vidéo</a>` : ''}
      <p class="long">${esc(r.contenu || r.resume)}</p>
      <div class="mfoot" style="flex-wrap:wrap"><button class="btn or" onclick="openRdv()">${ic('cal')} Prendre rendez-vous</button><button class="btn doux" onclick="closeModal();openEspace('chat')">${ic('chat')} En parler</button></div></div>`, true);
}

// ---------- Devis, FAQ, contact, pied de page ----------
function devisBandHtml() {
  return `<section class="sec" style="padding-top:20px" id="formations"><div class="wrap"><div class="cta-band reveal"><img class="lau" src="/img/laurier.webp" alt="">
    <div style="position:relative"><span class="eyebrow" style="color:var(--or2)">Formations & séminaires</span><h2 class="d" style="margin-top:12px">Faites intervenir le coach <em style="color:var(--or2)">auprès de vos équipes</em>.</h2>
      <p>Gestion du stress, confiance en soi, relations, couple et famille, deuil, reconstruction après l’épreuve… Des interventions adaptées à votre public.</p>
      <ul><li>Entreprises</li><li>Églises & ministères</li><li>Associations & ONG</li><li>Écoles & universités</li><li>Groupes privés</li></ul></div>
    <div class="acts"><button class="btn or" onclick="openDevis()">${ic('brief')} Demander un devis de formation</button><span style="font-size:14px;color:rgba(255,255,255,.7)">Réponse personnalisée sous 48 h</span></div>
  </div></div></section>`;
}
function faqHtml() {
  const fq = C().faq || []; if (!fq.length) return '';
  return `<section class="sec papier" id="faq"><div class="wrap">
    <div class="sec-h c reveal"><span class="eyebrow">Questions fréquentes</span><h2 class="d">Vous vous posez <em>peut-être</em> la question…</h2></div>
    <div class="faq reveal">${fq.map((f, i) => `<div class="fq" id="fq${i}"><button onclick="this.parentNode.classList.toggle('on')" aria-expanded="false">${esc(f.q)}<span class="pm">+</span></button><div class="a"><div><p>${esc(f.r)}</p></div></div></div>`).join('')}</div>
  </div></section>`;
}
function contactHtml() {
  const c = C();
  return `<section class="sec" id="contact"><div class="wrap">
    <div class="sec-h reveal"><span class="eyebrow">Contact</span><h2 class="d">Le premier pas est <em>le plus important</em>.</h2><p>Choisissez le moyen qui vous met le plus à l’aise. Tout reste confidentiel.</p></div>
    <div class="ctc"><div class="cards reveal">
      <button class="cc" onclick="openRdv()"><span class="ic">${ic('cal')}</span><b>Prendre rendez-vous</b><small>Choisissez votre créneau en ligne</small></button>
      <button class="cc" onclick="openEspace('chat')"><span class="ic">${ic('chat')}</span><b>Discuter en direct</b><small data-pres-s2>${presenceTxt()[1]}</small></button>
      ${c.tel ? `<a class="cc" href="${telHref(c.tel)}"><span class="ic">${ic('phone')}</span><b>Appeler</b><small>${esc(c.tel)}</small></a>` : ''}
      ${c.whatsapp ? `<a class="cc wa" href="${waHref(c.whatsapp, 'Bonjour Coach, je souhaite prendre contact avec vous.')}" target="_blank" rel="noopener"><span class="ic">${ic('wa')}</span><b>WhatsApp</b><small>${esc(c.whatsapp)}</small></a>` : ''}
      ${c.email ? `<a class="cc" href="mailto:${esc(c.email)}"><span class="ic">${ic('mail')}</span><b>E-mail</b><small>${esc(c.email)}</small></a>` : ''}
      <button class="cc" onclick="openDevis()"><span class="ic">${ic('brief')}</span><b>Devis de formation</b><small>Entreprises, églises, associations</small></button>
    </div>
    <div class="info reveal"><img class="lau" src="/img/laurier.webp" alt=""><h3>${esc(c.nom)}</h3><div style="color:var(--or2);font-size:14px;font-weight:700;position:relative">${esc(c.slogan)}</div>
      ${c.adresse ? `<div class="ln">${ic('pin')}<div><b>Adresse</b><span>${esc(c.adresse)}</span></div></div>` : ''}
      ${c.horaires ? `<div class="ln">${ic('clock')}<div><b>Horaires</b><span>${esc(c.horaires)}</span></div></div>` : ''}
      ${c.tel ? `<div class="ln">${ic('phone')}<div><b>Téléphone & WhatsApp</b><a href="${telHref(c.tel)}">${esc(c.tel)}</a></div></div>` : ''}
      ${reseaux().length ? `<div class="soc">${socHtml(true)}</div>` : ''}
    </div></div></div></section>`;
}
function footHtml() {
  const c = C();
  return `<footer class="foot"><div class="wrap"><div class="g">
      <div><div class="lg"><span><img src="/img/logo-mc.png" alt=""></span><div><b>${esc(c.nom)}</b><small>${esc(c.marque)}</small></div></div>
        <p style="margin-top:18px;max-width:320px">${esc(c.slogan)}. Accompagnement confidentiel en présentiel et en ligne.</p>
        ${reseaux().length ? `<div class="soc" style="margin-top:18px">${socHtml()}</div>` : ''}</div>
      <div><h4>Accompagnements</h4><ul>${S.site.themes.slice(0, 6).map(t => `<li><button onclick="openTheme(${t.id})">${esc(t.nom)}</button></li>`).join('')}</ul></div>
      <div><h4>Le site</h4><ul><li><a href="#coach">Le coach</a></li><li><a href="#ateliers">Ateliers</a></li><li><a href="#temoignages">Témoignages</a></li><li><a href="#ressources">Ressources</a></li><li><a href="#faq">Questions fréquentes</a></li><li><button onclick="openEspace()">Mon espace</button></li></ul></div>
      <div><h4>Contact</h4><ul>${c.tel ? `<li><a href="${telHref(c.tel)}">${esc(c.tel)}</a></li>` : ''}${c.whatsapp ? `<li><a href="${waHref(c.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a></li>` : ''}${c.email ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ''}<li>${esc(c.adresse)}</li><li><button onclick="openDevis()">Devis de formation</button></li></ul></div>
    </div>
    <div class="bt"><span>© ${new Date().getFullYear()} ${esc(c.nom)} · ${esc(c.marque)}. Tous droits réservés.</span><a href="/gestion.html" style="opacity:.55">Espace coach</a></div></div></footer>`;
}
function floatHtml() {
  const c = C(); const [on] = presenceTxt();
  return `${c.whatsapp ? `<a class="fab-wa" href="${waHref(c.whatsapp, 'Bonjour Coach, ')}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic('wa')}</a>` : ''}
    <button class="fab" onclick="openEspace('chat')"><span class="av">${c.photo ? `<img class="ph" src="${esc(c.photo)}" alt="">` : '<img src="/img/logo-mc.png" alt="">'}</span>
      <span style="text-align:left">Discuter avec le coach<small data-pres-s3>${on ? 'En ligne maintenant' : 'Laissez un message'}</small></span><span class="pdot pr ${on ? 'on' : ''}" data-pres></span><span class="bdg" id="bdg-fab"></span></button>
    <nav class="mbar" aria-label="Actions rapides">
      ${c.tel ? `<a href="${telHref(c.tel)}">${ic('phone')}Appeler</a>` : ''}
      ${c.whatsapp ? `<a href="${waHref(c.whatsapp, 'Bonjour Coach, ')}" target="_blank" rel="noopener">${ic('wa')}WhatsApp</a>` : ''}
      <button class="rdv" onclick="openRdv()"><span class="c">${ic('cal')}</span>Rendez-vous</button>
      <button onclick="openEspace('chat')">${ic('chat')}Discuter<span class="pdot ${on ? 'on' : ''}" data-pres></span><span class="bdg" id="bdg-mb"></span></button>
      <button onclick="openEspace()">${ic('user')}Espace<span class="bdg" id="bdg-mb2"></span></button>
    </nav>`;
}
function refreshPresence() {
  const [on, t1, t2] = presenceTxt();
  document.querySelectorAll('[data-pres]').forEach(el => el.classList.toggle('on', on));
  document.querySelectorAll('[data-pres-t]').forEach(el => el.textContent = t1.replace(/&amp;/g, '&'));
  document.querySelectorAll('[data-pres-s]').forEach(el => el.textContent = t2);
  document.querySelectorAll('[data-pres-s2]').forEach(el => el.textContent = t1.replace(/&amp;/g, '&'));
  document.querySelectorAll('[data-pres-s3]').forEach(el => el.textContent = on ? 'En ligne maintenant' : 'Laissez un message');
  if (S.drawerOpen && S.tab === 'chat') { const h = $('ch-pres'); if (h) h.outerHTML = chatPresHtml(); }
}
function observeReveal() {
  const els = document.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
}

// =====================================================================
// FENÊTRES
// =====================================================================
let lastFocus = null;
function openModal(html, wide) {
  if (!$('modal').classList.contains('on')) lastFocus = document.activeElement;
  $('pn').className = 'pn' + (wide ? ' wide' : '');
  $('pn').innerHTML = html; $('modal').classList.add('on'); $('pn').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('pn').tabIndex = -1; setTimeout(() => $('pn').focus({ preventScroll: true }), 30);
}
function closeModal() {
  $('modal').classList.remove('on');
  if (!S.drawerOpen) document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('modal').classList.contains('on')) closeModal(); else if (S.drawerOpen) closeEspace(); } });
function okScreen(t, p, tab) {
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button><div class="ok-screen"><div class="ic">${ic('check')}</div><div class="d">${esc(t)}</div><p>${esc(p)}</p>
    ${pushSupported() && !(S.client && S.client.notifs && Notification.permission === 'granted') ? `<div class="authb" style="text-align:left"><b style="font-family:var(--fd);font-size:22px">Soyez prévenu(e) de la réponse</b><p class="note" style="margin-top:4px">Recevez une notification dès que le coach confirme, même téléphone verrouillé.</p><button class="btn nuit sm" style="margin-top:12px" onclick="enablePush(true)">${ic('bell')} Activer les notifications</button></div>` : ''}
    <div class="mfoot" style="justify-content:center">${tab ? `<button class="btn or" onclick="closeModal();openEspace('${tab}')">Voir dans mon espace</button>` : ''}<button class="btn doux" onclick="closeModal()">Fermer</button></div></div>`);
}

// ---------- Connexion intégrée aux formulaires ----------
const AU = { mode: 'inscription', nom: '', tel: LS.get('amv_tel', ''), pin: '' };
function authBlock(titre) {
  const ins = AU.mode === 'inscription'; AU.titre = titre;
  return `<div class="authb" id="authb"><div class="h"><b>${esc(titre)}</b><a href="#" onclick="AU.mode='${ins ? 'connexion' : 'inscription'}';$('authb').outerHTML=authBlock(AU.titre);return false">${ins ? 'J’ai déjà un espace' : 'Créer mon espace'}</a></div>
    ${ins ? `<div class="fld"><label>Prénom ou pseudo</label><input id="au-nom" autocomplete="given-name" value="${esc(AU.nom || (S.client ? S.client.nom : ''))}" oninput="AU.nom=this.value"></div>` : ''}
    <div class="two"><div class="fld"><label>Téléphone</label><input id="au-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="07 00 00 00 00" value="${esc(AU.tel)}" oninput="AU.tel=this.value"></div>
    <div class="fld"><label>${ins ? 'Choisissez un code secret (4 chiffres)' : 'Code secret (4 chiffres)'}</label><input id="au-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="${ins ? 'new-password' : 'current-password'}" value="${esc(AU.pin)}" oninput="AU.pin=this.value"></div></div>
    <p class="note">${ins ? 'Votre espace confidentiel : suivez vos rendez-vous, échangez avec le coach, recevez les réponses.' : 'Code oublié ? Contactez-nous par WhatsApp.'}</p></div>`;
}
async function ensureAuth() {
  if (logged()) return;
  const body = { nom: AU.nom, tel: AU.tel, pin: AU.pin };
  const r = await api('/api/client/' + AU.mode, { body, noLogout: true });
  S.token = r.token; S.client = r.client; LS.set('amv_token', r.token); LS.set('amv_tel', AU.tel);
  AU.pin = '';
  await loadMine(); connectStream(); refreshHeader();
}
function refreshHeader() { const b = document.querySelector('.me-btn .t'); if (b) b.textContent = logged() ? S.client.nom.split(' ')[0] : 'Mon espace'; badges(); }

// =====================================================================
// PRISE DE RENDEZ-VOUS
// =====================================================================
const R = { step: 1, themeId: null, format: null, date: '', heure: '', message: '', jours: null, err: '' };
function openRdv(themeId) {
  Object.assign(R, { step: themeId !== undefined ? 2 : 1, themeId: themeId !== undefined ? themeId : null, format: R.format, date: '', heure: '', err: '' });
  if (!R.format) R.format = C().rdv.formats[0];
  AU.mode = 'inscription';
  toggleMenu(false);
  drawRdv();
  loadDispo();
}
async function loadDispo() {
  R.jours = null;
  try { const r = await api('/api/public/disponibilites?jours=28'); R.jours = r.jours; } catch (e) { R.jours = []; R.err = e.message; }
  if (R.step === 3 && $('modal').classList.contains('on')) drawRdv();
}
function drawRdv() {
  const c = C(), cfg = c.rdv, ts = S.site.themes;
  const titres = ['', 'Quel sujet souhaitez-vous aborder ?', 'Comment préférez-vous échanger ?', 'Choisissez votre créneau', 'Dernière étape'];
  let body = '';
  if (R.step === 1) {
    body = `<div class="opts">${[{ id: 0, nom: 'Premier échange', accroche: 'Je ne sais pas encore, j’ai besoin d’en parler.' }].concat(ts).map(t => `<button class="opt ${R.themeId === t.id ? 'on' : ''}" onclick="R.themeId=${t.id};R.step=2;drawRdv()"><span class="mk"></span><span><b>${esc(t.nom)}</b><small>${esc(t.accroche)}</small></span></button>`).join('')}</div>`;
  } else if (R.step === 2) {
    const fi = f => /visio|ligne/i.test(f) ? 'video' : /t[ée]l[ée]phone|whatsapp/i.test(f) ? 'phone' : 'pin';
    body = `<div class="opts">${cfg.formats.map((f, i) => `<button class="opt ${R.format === f ? 'on' : ''}" onclick="R.format=C().rdv.formats[${i}];R.step=3;drawRdv()"><span class="mk"></span>${ic(fi(f))}<span><b>${esc(f)}</b></span></button>`).join('')}</div>
      <div class="lock">${ic('clock')}<span>Séance d’environ ${cfg.duree} minutes. ${esc(cfg.tarif)}</span></div>`;
  } else if (R.step === 3) {
    if (!R.jours) body = `<div class="empty">Recherche des créneaux disponibles…</div>`;
    else if (!R.jours.some(j => j.libres.length)) body = `<div class="empty"><b>Aucun créneau en ligne</b>Écrivez-nous ou appelez : nous trouverons un moment ensemble.<div class="acts-row" style="justify-content:center"><button class="btn nuit sm" onclick="closeModal();openEspace('chat')">Écrire au coach</button>${c.tel ? `<a class="btn doux sm" href="${telHref(c.tel)}">Appeler</a>` : ''}</div></div>`;
    else {
      if (!R.date || !R.jours.some(j => j.date === R.date && j.libres.length)) R.date = (R.jours.find(j => j.libres.length) || {}).date;
      const j = R.jours.find(x => x.date === R.date);
      body = `<span class="lbl">Jour</span><div class="days" id="days">${R.jours.map(x => { const d = D(x.date); const n = x.libres.length; return `<button class="day ${x.date === R.date ? 'on' : ''}" ${n ? '' : 'disabled'} onclick="R.date='${x.date}';R.heure='';drawRdv()"><small>${d.toLocaleDateString('fr-FR', { weekday: 'short' })}</small><b>${d.getDate()}</b><span>${x.ferme ? 'Fermé' : n ? n + ' libre' + (n > 1 ? 's' : '') : 'Complet'}</span></button>`; }).join('')}</div>
        <span class="lbl">Heure · ${esc(dLong(R.date))}</span><div class="chips">${(j.libres.concat(j.complets)).sort().map(h => `<button class="chip ${R.heure === h ? 'on' : ''}" ${j.libres.includes(h) ? '' : 'disabled'} onclick="R.heure='${h}';R.step=4;drawRdv()">${h}</button>`).join('')}</div>
        <p class="note">Aucun horaire ne vous convient ? <a href="#" onclick="closeModal();openEspace('chat');return false">Écrivez-nous</a>, nous trouverons une solution.</p>`;
    }
  } else {
    const t = ts.find(x => x.id === R.themeId);
    body = `<div class="sum"><div class="k"><span>Sujet</span><b>${esc(t ? t.nom : 'Premier échange')}</b></div><div class="k"><span>Format</span><b>${esc(R.format)}</b></div>
      <div class="k"><span>Date</span><b>${esc(dLong(R.date))}</b></div><div class="k"><span>Heure</span><b>${esc(R.heure)} · ${cfg.duree} min</b></div></div>
      <div class="fld"><label>Ce que vous souhaitez partager (facultatif)</label><textarea id="rv-msg" placeholder="Quelques mots sur votre situation, si vous le souhaitez…" oninput="R.message=this.value">${esc(R.message)}</textarea></div>
      ${logged() ? '' : authBlock('Pour confirmer, créez votre espace confidentiel')}
      <div class="lock">${ic('lock')}<span>Vos informations restent strictement confidentielles. Le coach confirme votre rendez-vous par notification.</span></div>`;
  }
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button>
    <div class="hd"><span class="eyebrow">Rendez-vous · étape ${R.step}/4</span><div class="d">${titres[R.step]}</div><div class="prog-s">${[1, 2, 3, 4].map(i => `<i class="${i <= R.step ? 'on' : ''}"></i>`).join('')}</div></div>
    <div class="bd">${body}<div class="err" id="m-err">${esc(R.err)}</div>
      <div class="mfoot">${R.step > 1 ? `<button class="btn doux" onclick="R.step--;R.err='';drawRdv()">${ic('al')} Retour</button>` : ''}
        ${R.step === 4 ? `<button class="btn or" id="rv-go" onclick="sendRdv()">${ic('check')} Demander ce rendez-vous</button>` : ''}</div></div>`);
  R.err = '';
  if (R.step === 3) { const sel = document.querySelector('.day.on'); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' }); }
}
async function sendRdv() {
  const b = $('rv-go'); b.disabled = true;
  try {
    await ensureAuth();
    const r = await api('/api/rdv', { body: { themeId: R.themeId, format: R.format, date: R.date, heure: R.heure, message: R.message } });
    S.rdvs.unshift(r.rdv); R.message = '';
    okScreen('Demande envoyée', `${dLong(r.rdv.date)} à ${r.rdv.heure}. Vous recevrez la confirmation du coach dans votre espace.`, 'rdv');
    badges();
  } catch (e) {
    $('m-err').textContent = e.message; b.disabled = false;
    if (/créneau|réservé|avance/.test(e.message)) { R.step = 3; R.err = e.message; loadDispo(); drawRdv(); }
  }
}

// =====================================================================
// DEVIS DE FORMATION
// =====================================================================
const DV = {};
function openDevis() {
  toggleMenu(false);
  AU.mode = 'inscription';
  const types = ['Entreprise', 'Église / ministère', 'Association / ONG', 'École / université', 'Groupe privé / famille', 'Autre'];
  const sujets = S.site.themes.map(t => t.nom).concat(['Gestion du stress et des émotions', 'Confiance en soi et prise de parole', 'Couple, mariage et famille', 'Leadership et relations au travail']);
  const v = k => esc(DV[k] || '');
  openModal(`<button class="x" onclick="closeModal()" aria-label="Fermer">${ic('x')}</button>
    <div class="hero-c nuit"><img class="lau" src="/img/laurier.webp" alt=""><span class="eyebrow" style="position:relative;color:var(--or2)">Formations & séminaires</span><div class="d" style="margin-top:8px">Demande de devis</div><p>Décrivez votre besoin : vous recevez une proposition chiffrée dans votre espace.</p></div>
    <div class="bd" oninput="if(event.target.id&&event.target.id.startsWith('dv-'))DV[event.target.id.slice(3)]=event.target.value">
      <div class="two"><div class="fld"><label>Type de structure</label><select id="dv-type">${types.map(t => `<option ${DV.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="fld"><label>Nom de la structure</label><input id="dv-structure" value="${v('structure')}" placeholder="Facultatif"></div></div>
      <div class="fld"><label>Thème de la formation</label><input id="dv-theme" list="dv-sujets" value="${v('theme')}" placeholder="Choisissez ou écrivez un thème"><datalist id="dv-sujets">${sujets.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="two"><div class="fld"><label>Nombre de participants</label><input id="dv-participants" type="number" min="1" inputmode="numeric" value="${v('participants') || 20}"></div>
        <div class="fld"><label>Date souhaitée</label><input id="dv-date" type="date" min="${S.site.aujourdhui}" value="${v('date')}"></div></div>
      <div class="two"><div class="fld"><label>Durée</label><select id="dv-duree">${['Conférence (1 à 2 h)', 'Demi-journée', '1 journée', '2 jours', 'Cycle de plusieurs séances', 'À définir'].map(t => `<option ${DV.duree === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="fld"><label>Format</label><select id="dv-format">${['Présentiel', 'En ligne', 'Mixte'].map(t => `<option ${DV.format === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="two"><div class="fld"><label>Lieu</label><input id="dv-lieu" value="${v('lieu')}" placeholder="Ville, commune, salle…"></div>
        <div class="fld"><label>Budget indicatif (F CFA)</label><input id="dv-budget" type="number" inputmode="numeric" value="${v('budget')}" placeholder="Facultatif"></div></div>
      <div class="fld"><label>Votre besoin</label><textarea id="dv-description" rows="4" placeholder="Public, objectifs, contexte…">${v('description')}</textarea></div>
      <div class="fld"><label>E-mail (pour recevoir le devis)</label><input id="dv-email" type="email" value="${v('email')}" placeholder="Facultatif"></div>
      ${logged() ? '' : authBlock('Pour suivre votre devis, créez votre espace')}
      <div class="err" id="m-err"></div><div class="mfoot"><button class="btn or" id="dv-go" onclick="sendDevis()">${ic('send')} Envoyer ma demande</button></div></div>`, true);
}
async function sendDevis() {
  const b = $('dv-go'); b.disabled = true;
  try {
    await ensureAuth();
    const val = id => ($('dv-' + id) || {}).value;
    const r = await api('/api/devis', { body: { typeStructure: val('type'), structure: val('structure'), theme: val('theme'), participants: val('participants'), date: val('date'), duree: val('duree'), format: val('format'), lieu: val('lieu'), budget: val('budget'), description: val('description'), email: val('email') } });
    S.devis.unshift(r.devis); Object.keys(DV).forEach(k => delete DV[k]);
    okScreen('Demande envoyée', 'Le coach prépare votre proposition. Vous la recevrez dans votre espace.', 'devis');
  } catch (e) { $('m-err').textContent = e.message; b.disabled = false; }
}

// =====================================================================
// ESPACE MEMBRE
// =====================================================================
const TABS = [['accueil', 'Accueil'], ['rdv', 'Rendez-vous'], ['chat', 'Discussion'], ['devis', 'Devis'], ['ateliers', 'Ateliers'], ['notifs', 'Notifications'], ['profil', 'Profil']];
function openEspace(tab) {
  toggleMenu(false); closeModal();
  S.tab = tab || (S.client ? (S.client.invite ? 'chat' : 'accueil') : 'accueil');
  S.drawerOpen = true; $('drawer').classList.add('on'); document.body.style.overflow = 'hidden';
  drawEspace();
}
function closeEspace() { S.drawerOpen = false; $('drawer').classList.remove('on'); document.body.style.overflow = ''; }
function setTab(t) { S.tab = t; drawEspace(); }
function unreadChat() { return S.chat.filter(m => m.de !== 'client' && m.id > S.seen).length; }
function drawEspace() {
  if (!S.drawerOpen) return;
  const c = S.client;
  const t = S.tab;
  const tabs = !c ? [] : c.invite ? [['chat', 'Discussion'], ['profil', 'Créer mon espace']] : TABS;
  const nb = { chat: unreadChat(), notifs: S.notifs.filter(n => !n.lu).length, rdv: S.rdvs.filter(r => r.statut === 'propose').length, devis: S.devis.filter(d => d.statut === 'propose').length };
  const input = $('ch-t'); const draft = input ? input.value : '';
  $('dw').innerHTML = `<div class="dw-h"><img class="lau" src="/img/laurier.webp" alt=""><div class="top"><div class="t"><small>${c ? 'Mon espace confidentiel' : C().marque}</small><b>${c ? 'Bonjour ' + esc(c.nom.split(' ')[0]) : t === 'chat' ? 'Discuter avec le coach' : 'Mon espace'}</b></div><button class="x" onclick="closeEspace()" aria-label="Fermer">${ic('x')}</button></div>
    ${tabs.length ? `<div class="dw-tabs">${tabs.map(([k, l]) => `<button class="${t === k ? 'on' : ''}" onclick="setTab('${k}')">${l}<span class="nb ${nb[k] && t !== k ? 'on' : ''}">${nb[k] || ''}</span></button>`).join('')}</div>` : '<div style="height:18px"></div>'}</div>
    <div class="dw-b ${t === 'chat' && c ? 'chat-mode' : ''}" id="dw-b">${espaceBody(t)}</div>`;
  if (t === 'chat' && c) {
    const ms = $('msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
    const i = $('ch-t'); if (i) { i.value = draft; if (matchMedia('(min-width:821px)').matches) i.focus(); }
    markChatSeen();
  }
  if (t === 'notifs' && S.notifs.some(n => !n.lu)) setTimeout(() => api('/api/client/notifs/lu', { body: {} }).then(() => { S.notifs.forEach(n => n.lu = true); badges(); }).catch(() => { }), 1500);
  const tb = document.querySelector('.dw-tabs button.on'); if (tb) tb.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function espaceBody(t) {
  const c = S.client;
  if (t === 'chat') return c ? chatHtml() : chatStartHtml();
  if (!c) return loginHtml();
  if (c.invite && t !== 'chat') return upgradeHtml();
  return ({ accueil: eAccueil, rdv: eRdv, devis: eDevis, ateliers: eAteliers, notifs: eNotifs, profil: eProfil }[t] || eAccueil)();
}
function loginHtml() {
  const ins = AU.mode === 'inscription';
  return `<div class="box"><div class="box-t">${ins ? 'Créer mon espace confidentiel' : 'Me connecter'}</div><p class="mini">Suivez vos rendez-vous, échangez avec le coach et recevez ses réponses en notification.</p>
    ${ins ? `<div class="fld"><label>Prénom ou pseudo</label><input id="au-nom" value="${esc(AU.nom)}" oninput="AU.nom=this.value" autocomplete="given-name"></div>` : ''}
    <div class="fld"><label>Téléphone</label><input id="au-tel" type="tel" inputmode="tel" value="${esc(AU.tel)}" oninput="AU.tel=this.value" autocomplete="tel"></div>
    <div class="fld"><label>${ins ? 'Choisissez un code secret (4 chiffres)' : 'Code secret'}</label><input id="au-pin" type="password" inputmode="numeric" maxlength="4" oninput="AU.pin=this.value" onkeydown="if(event.key==='Enter')espaceAuth()"></div>
    <div class="err" id="e-err"></div><button class="btn or full" style="margin-top:6px" onclick="espaceAuth()">${ins ? 'Créer mon espace' : 'Me connecter'}</button>
    <p class="note c">${ins ? 'Déjà un espace ?' : 'Pas encore d’espace ?'} <a href="#" onclick="AU.mode='${ins ? 'connexion' : 'inscription'}';drawEspace();return false">${ins ? 'Me connecter' : 'Créer mon espace'}</a></p></div>
    <div class="lock">${ic('lock')}<span>Un pseudo suffit si vous souhaitez rester discret(e). Votre code secret protège l’accès à vos échanges.</span></div>
    <div class="quick" style="margin-top:14px"><button onclick="setTab('chat')">${ic('chat')}Discuter sans compte</button><button onclick="closeEspace();openRdv()">${ic('cal')}Prendre rendez-vous</button></div>`;
}
async function espaceAuth() {
  try { await ensureAuth(); toast('Bienvenue ' + S.client.nom.split(' ')[0], 'Votre espace est prêt.'); S.tab = 'accueil'; drawEspace(); }
  catch (e) { const el = $('e-err'); if (el) el.textContent = e.message; }
}
function upgradeHtml() {
  AU.mode = 'inscription'; if (!AU.nom && S.client) AU.nom = S.client.nom;
  return `<div class="box"><div class="box-t">Gardez vos échanges</div><p class="mini">Créez votre espace pour prendre rendez-vous, retrouver la discussion sur tous vos appareils et recevoir les réponses.</p>
    <div class="fld"><label>Prénom ou pseudo</label><input value="${esc(AU.nom)}" oninput="AU.nom=this.value"></div>
    <div class="fld"><label>Téléphone</label><input type="tel" inputmode="tel" value="${esc(AU.tel || S.client.tel || '')}" oninput="AU.tel=this.value"></div>
    <div class="fld"><label>Choisissez un code secret (4 chiffres)</label><input type="password" inputmode="numeric" maxlength="4" oninput="AU.pin=this.value"></div>
    <div class="err" id="e-err"></div><button class="btn or full" onclick="espaceAuth()">Créer mon espace</button>
    <p class="note c">Déjà un espace ? <a href="#" onclick="AU.mode='connexion';$('dw-b').innerHTML=loginHtml();return false">Me connecter</a></p></div>
    <button class="btn doux full" onclick="logout()">Quitter la discussion</button>`;
}
const RDV_B = { demande: '<span class="badge or">En attente de confirmation</span>', confirme: '<span class="badge vert">Confirmé</span>', propose: '<span class="badge or">Nouvel horaire proposé</span>', refuse: '<span class="badge rouge">Indisponible</span>', annule: '<span class="badge">Annulé</span>', honore: '<span class="badge nuit">Effectué</span>', absent: '<span class="badge">Absence</span>' };
function eAccueil() {
  const td = S.site.aujourdhui;
  const next = S.rdvs.filter(r => ['confirme', 'demande', 'propose'].includes(r.statut) && r.date >= td).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))[0];
  const un = S.notifs.filter(n => !n.lu);
  return `${next ? `<div class="next"><small>${next.statut === 'confirme' ? 'Prochain rendez-vous' : next.statut === 'propose' ? 'Horaire proposé par le coach' : 'Rendez-vous demandé'}</small><b>${esc(dLong(next.statut === 'propose' && next.proposition ? next.proposition.date : next.date))}</b><p>${esc(next.statut === 'propose' && next.proposition ? next.proposition.heure : next.heure)} · ${esc(next.format)} · ${esc(next.theme)}</p>${next.statut !== 'confirme' ? `<button class="btn nuit sm" style="margin-top:12px" onclick="setTab('rdv')">Voir</button>` : next.infos ? `<p style="margin-top:6px"><b style="font-family:var(--fb);font-size:14px;display:inline">Infos :</b> ${esc(next.infos)}</p>` : ''}</div>` : ''}
    <div class="quick"><button onclick="closeEspace();openRdv()">${ic('cal')}Prendre rendez-vous</button><button onclick="setTab('chat')">${ic('chat')}Écrire au coach${unreadChat() ? ` <span class="badge rouge" style="align-self:flex-start">${unreadChat()} nouveau(x)</span>` : ''}</button>
      <button onclick="closeEspace();openDevis()">${ic('brief')}Devis de formation</button><button onclick="closeEspace();go('ateliers')">${ic('users')}Ateliers</button></div>
    ${pushBox()}
    <div class="box"><div class="row"><div class="box-t" style="margin:0">Dernières nouvelles</div>${S.notifs.length ? `<button class="btn doux sm" onclick="setTab('notifs')">Tout voir</button>` : ''}</div>
      ${S.notifs.length ? S.notifs.slice(0, 3).map(notifHtml).join('') : '<p class="mini">Les confirmations et messages du coach apparaîtront ici.</p>'}</div>
    <div class="box" style="cursor:pointer" onclick="closeEspace();openTemoignage()"><div class="row"><div><b>Partager mon témoignage</b><p class="mini" style="margin:2px 0 0">Votre histoire peut aider quelqu’un.</p></div>${ic('heart')}</div></div>`;
}
function eRdv() {
  const td = S.site.aujourdhui;
  return `<button class="btn or full" style="margin-bottom:14px" onclick="closeEspace();openRdv()">${ic('cal')} Nouveau rendez-vous</button>
    ${S.rdvs.length ? S.rdvs.map(r => `<div class="box"><div class="row"><div class="box-t" style="margin:0;font-size:22px">${esc(dLong(r.date))}</div>${RDV_B[r.statut] || ''}</div>
      <p class="mini" style="margin-top:4px"><b style="color:var(--encre)">${esc(r.heure)}</b> · ${esc(r.format)}<br>${esc(r.theme)}</p>
      ${r.infos ? `<p class="mini"><b style="color:var(--encre)">Infos pratiques :</b> ${esc(r.infos)}</p>` : ''}${r.reponse ? `<p class="mini"><b style="color:var(--encre)">Message du coach :</b> ${esc(r.reponse)}</p>` : ''}
      ${r.statut === 'propose' && r.proposition ? `<div class="authb" style="margin-top:12px"><b style="font-family:var(--fd);font-size:21px">Nouvel horaire : ${esc(dLong(r.proposition.date))} à ${esc(r.proposition.heure)}</b><div class="acts-row"><button class="btn nuit sm" onclick="rdvProposition(${r.id},true)">Accepter</button><button class="btn doux sm" onclick="rdvProposition(${r.id},false)">Refuser</button></div></div>` : ''}
      ${['demande', 'confirme'].includes(r.statut) && r.date >= td ? `<div class="acts-row"><button class="btn doux sm" onclick="annulerRdv(${r.id})">Annuler</button></div>` : ''}</div>`).join('')
    : `<div class="empty"><b>Aucun rendez-vous</b>Choisissez un créneau : c’est simple et confidentiel.</div>`}`;
}
async function annulerRdv(id) { if (!confirm('Annuler ce rendez-vous ?')) return; try { const r = await api(`/api/rdv/${id}/annuler`, { body: {} }); upsert(S.rdvs, r.rdv); drawEspace(); toast('Rendez-vous annulé', 'Le coach est prévenu.'); } catch (e) { toast('Impossible', e.message, true); } }
async function rdvProposition(id, ok) { try { const r = await api(`/api/rdv/${id}/proposition`, { body: { accepte: ok } }); upsert(S.rdvs, r.rdv); drawEspace(); badges(); toast(ok ? 'Rendez-vous confirmé' : 'Proposition refusée', ok ? `${dLong(r.rdv.date)} à ${r.rdv.heure}` : 'Vous pouvez choisir un autre créneau.'); } catch (e) { toast('Impossible', e.message, true); } }
const DV_B = { nouveau: '<span class="badge or">En étude</span>', propose: '<span class="badge or">Proposition reçue</span>', accepte: '<span class="badge vert">Accepté</span>', refuse: '<span class="badge rouge">Refusé</span>', termine: '<span class="badge nuit">Réalisé</span>' };
function eDevis() {
  return `<button class="btn or full" style="margin-bottom:14px" onclick="closeEspace();openDevis()">${ic('brief')} Nouvelle demande de devis</button>
    ${S.devis.length ? S.devis.map(d => `<div class="box"><div class="row"><div class="box-t" style="margin:0;font-size:22px">${esc(d.theme)}</div>${DV_B[d.statut] || ''}</div>
      <p class="mini">${esc(d.typeStructure)}${d.structure ? ' · ' + esc(d.structure) : ''} · ${d.participants} participants${d.date ? ' · ' + esc(dShort(d.date)) : ''}</p>
      ${['propose', 'accepte', 'termine'].includes(d.statut) && d.montant ? `<div class="row" style="margin-top:10px"><span class="mini" style="margin:0">Proposition</span><b style="font-family:var(--fd);font-size:28px">${F(d.montant)}</b></div>` : ''}
      ${d.reponse ? `<p class="mini" style="white-space:pre-line">${esc(d.reponse)}</p>` : ''}
      ${d.statut === 'propose' ? `<div class="acts-row"><button class="btn nuit sm" onclick="decisionDevis(${d.id},true)">Accepter</button><button class="btn doux sm" onclick="decisionDevis(${d.id},false)">Refuser</button></div>` : ''}</div>`).join('')
    : `<div class="empty"><b>Aucune demande</b>Entreprises, églises, associations : demandez une intervention sur mesure.</div>`}`;
}
async function decisionDevis(id, ok) { try { const r = await api(`/api/devis/${id}/decision`, { body: { accepte: ok } }); upsert(S.devis, r.devis); drawEspace(); badges(); toast(ok ? 'Devis accepté' : 'Devis refusé', ok ? 'Le coach vous recontacte pour finaliser.' : ''); } catch (e) { toast('Impossible', e.message, true); } }
const IN_B = { inscrit: '<span class="badge or">Inscrit(e)</span>', confirme: '<span class="badge vert">Confirmé</span>', present: '<span class="badge nuit">Présent(e)</span>', annulee: '<span class="badge">Annulée</span>' };
function eAteliers() {
  return `${S.inscriptions.length ? S.inscriptions.map(i => `<div class="box"><div class="row"><div class="box-t" style="margin:0;font-size:22px">${esc(i.titre)}</div>${IN_B[i.statut] || ''}</div><p class="mini">${esc(dLong(i.date))} · ${i.places} place(s)</p>
      ${i.statut === 'inscrit' || i.statut === 'confirme' ? `<div class="acts-row"><button class="btn doux sm" onclick="annulerInscription(${i.id})">Annuler mon inscription</button></div>` : ''}</div>`).join('')
    : `<div class="empty"><b>Aucune inscription</b>Découvrez les ateliers de groupe à venir.</div>`}
    <button class="btn nuit full" onclick="closeEspace();go('ateliers')">${ic('users')} Voir les ateliers</button>`;
}
async function annulerInscription(id) { if (!confirm('Annuler votre inscription ?')) return; try { const r = await api(`/api/inscriptions/${id}/annuler`, { body: {} }); upsert(S.inscriptions, r.inscription); drawEspace(); reloadSite(); } catch (e) { toast('Impossible', e.message, true); } }
const notifHtml = n => `<div class="notif ${n.lu ? '' : 'nv'}"><span class="nd"></span><div><b>${esc(n.titre)}</b><p>${esc(n.corps)}</p><time>${fdt(n.at)}</time></div></div>`;
function eNotifs() { return `<div class="box">${S.notifs.length ? S.notifs.map(notifHtml).join('') : '<div class="empty">Aucune notification pour le moment.</div>'}</div>${pushBox()}`; }
function eProfil() {
  const c = S.client;
  return `<div class="box"><div class="box-t">Mes informations</div>
      <div class="fld"><label>Prénom ou pseudo</label><input id="p-nom" value="${esc(c.nom)}"></div>
      <div class="fld"><label>Téléphone</label><input value="${esc(c.tel)}" readonly></div>
      <button class="btn nuit sm" style="margin-top:14px" onclick="saveProfil()">Enregistrer</button></div>
    <div class="box"><div class="row"><div><b>Notifications</b><p class="mini" style="margin:2px 0 0">${notifState()}</p></div><button class="sw ${c.notifs && pushSupported() && Notification.permission === 'granted' ? 'on' : ''}" onclick="enablePush(true)" aria-label="Activer les notifications"></button></div></div>
    ${S.temoignages.length ? `<div class="box"><div class="box-t">Mes témoignages</div>${S.temoignages.map(t => `<div class="notif"><div><p style="color:var(--encre)">${esc(t.texte.slice(0, 140))}${t.texte.length > 140 ? '…' : ''}</p><span class="badge ${t.publie ? 'vert' : 'or'}">${t.publie ? 'Publié' : 'En relecture'}</span></div></div>`).join('')}</div>` : ''}
    <button class="btn doux full" onclick="logout()">Se déconnecter</button>
    <p class="note c" style="margin-top:18px"><a href="#" onclick="supprimerCompte();return false" style="color:var(--rouge)">Supprimer mon espace et mes échanges</a></p>`;
}
async function saveProfil() { try { const r = await api('/api/client/moi', { method: 'PUT', body: { nom: $('p-nom').value } }); S.client = r.client; refreshHeader(); drawEspace(); toast('Enregistré', ''); } catch (e) { toast('Erreur', e.message, true); } }
async function supprimerCompte() {
  const pin = S.client.invite ? '' : prompt('Pour confirmer la suppression définitive, saisissez votre code secret :');
  if (pin === null) return;
  try { await api('/api/client/supprimer', { body: { pin } }); resetLocal(); closeEspace(); toast('Espace supprimé', 'Vos échanges ont été effacés.'); } catch (e) { toast('Impossible', e.message, true); }
}
function upsert(arr, obj) { const i = arr.findIndex(x => x.id === obj.id); if (i >= 0) arr[i] = obj; else arr.unshift(obj); }
function resetLocal() {
  S.token = ''; S.client = null; S.notifs = []; S.chat = []; S.rdvs = []; S.devis = []; S.inscriptions = []; S.temoignages = [];
  LS.set('amv_token', ''); connectStream(); refreshHeader();
}
async function logout() {
  let endpoint = '';
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) endpoint = sub.endpoint; } catch (e) { }
  try { await api('/api/client/deconnexion', { body: { endpoint } }); } catch (e) { }
  resetLocal(); closeEspace(); toast('À bientôt', 'Vous êtes déconnecté(e).');
}

// ---------- Discussion ----------
function chatPresHtml() {
  const p = S.presence, c = C();
  const on = S.cible === 'coach' ? p.coach : p.equipe;
  const txt = S.cible === 'coach' ? (p.coach ? `${esc(c.nom)} est en ligne` : `${esc(c.nom)} n’est pas connecté(e) · réponse dès que possible`) : (p.equipe ? 'Une assistante est en ligne' : 'L’équipe n’est pas connectée · réponse dès que possible');
  return `<div class="pres" id="ch-pres"><span class="pdot ${on ? 'on' : ''}"></span>${txt}</div>`;
}
function chatStartHtml() {
  return `<div class="box"><div class="box-t">Écrivez au coach en toute confidentialité</div><p class="mini">Un prénom ou un pseudo suffit. Vous pouvez rester anonyme.</p>
    <span class="lbl">Avec qui souhaitez-vous échanger ?</span>
    <div class="seg" style="margin-top:0"><button class="${S.cible === 'coach' ? 'on' : ''}" onclick="setCible('coach',true)">${ic('user')} Le coach</button><button class="${S.cible === 'equipe' ? 'on' : ''}" onclick="setCible('equipe',true)">${ic('users')} Une assistante</button></div>
    <div style="margin-top:12px">${chatPresHtml()}</div>
    <div class="fld"><label>Prénom ou pseudo</label><input id="cs-nom" value="${esc(AU.nom)}" oninput="AU.nom=this.value" autocomplete="given-name"></div>
    <div class="fld"><label>Téléphone (facultatif)</label><input id="cs-tel" type="tel" inputmode="tel" value="${esc(AU.tel)}" oninput="AU.tel=this.value" placeholder="Pour être rappelé(e)"></div>
    <div class="fld"><label>Votre message</label><textarea id="cs-msg" rows="3" placeholder="Bonjour, je souhaiterais parler de…"></textarea></div>
    <div class="err" id="e-err"></div><button class="btn or full" onclick="startChat()">${ic('send')} Commencer la discussion</button>
    <p class="note c">Déjà un espace ? <a href="#" onclick="AU.mode='connexion';$('dw-b').innerHTML=loginHtml();return false">Me connecter</a></p></div>
    ${C().whatsapp ? `<a class="btn wa full" href="${waHref(C().whatsapp, 'Bonjour Coach, ')}" target="_blank" rel="noopener">${ic('wa')} Préférer WhatsApp</a>` : ''}`;
}
function setCible(k, redraw) { S.cible = k; LS.set('amv_cible', k); if (redraw) drawEspace(); }
async function startChat() {
  const msg = $('cs-msg').value.trim();
  try {
    if (!AU.nom.trim()) throw new Error('Indiquez votre prénom ou un pseudo.');
    if (!msg) throw new Error('Écrivez votre message.');
    const r = await api('/api/client/invite', { body: { nom: AU.nom, tel: AU.tel }, noLogout: true });
    S.token = r.token; S.client = r.client; LS.set('amv_token', r.token);
    await loadMine(); connectStream(); refreshHeader();
    const m = await api('/api/client/chat', { body: { texte: msg, cible: S.cible } });
    if (!S.chat.some(x => x.id === m.message.id)) S.chat.push(m.message);
    S.tab = 'chat'; drawEspace();
  } catch (e) { $('e-err').textContent = e.message; }
}
function chatHtml() {
  let lastDay = '';
  const msgs = S.chat.map(m => {
    const day = new Date(m.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const sep = day !== lastDay ? `<div class="ch-day">${esc(day)}</div>` : ''; lastDay = day;
    const me = m.de === 'client';
    return sep + `<div class="msg ${me ? 'me' : 'them'} ${m.auto ? 'auto' : ''}">${me ? '' : `<span class="au">${esc(m.auteur || C().nom)}${m.role === 'assistant' ? ' · assistante' : ''}</span>`}${esc(m.texte)}<time>${fh(m.at)}</time></div>`;
  }).join('');
  return `<div class="ch-h">${chatPresHtml()}<div class="seg"><button class="${S.cible === 'coach' ? 'on' : ''}" onclick="setCible('coach');document.querySelectorAll('.ch-h .seg button').forEach((b,i)=>b.classList.toggle('on',i===0));$('ch-pres').outerHTML=chatPresHtml()">${ic('user')} Le coach</button><button class="${S.cible === 'equipe' ? 'on' : ''}" onclick="setCible('equipe');document.querySelectorAll('.ch-h .seg button').forEach((b,i)=>b.classList.toggle('on',i===1));$('ch-pres').outerHTML=chatPresHtml()">${ic('users')} Une assistante</button></div></div>
    <div class="msgs" id="msgs">${msgs || `<div class="empty"><b>Bonjour ${esc(S.client.nom.split(' ')[0])}</b>Écrivez librement : votre message est confidentiel.</div>`}</div>
    <div class="ch-in"><textarea id="ch-t" rows="1" placeholder="Votre message…" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,130)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&matchMedia('(min-width:821px)').matches){event.preventDefault();sendChat()}"></textarea><button class="send" onclick="sendChat()" aria-label="Envoyer">${ic('send')}</button></div>`;
}
async function sendChat() {
  const i = $('ch-t'); const t = i.value.trim(); if (!t) return; i.value = ''; i.style.height = 'auto';
  try { const r = await api('/api/client/chat', { body: { texte: t, cible: S.cible } }); if (!S.chat.some(m => m.id === r.message.id)) S.chat.push(r.message); renderChatMsgs(); i.focus(); }
  catch (e) { toast('Message non envoyé', e.message, true); i.value = t; }
}
function renderChatMsgs() {
  if (!(S.drawerOpen && S.tab === 'chat' && S.client)) return;
  const ms = $('msgs'); if (!ms) return drawEspace();
  const tmp = document.createElement('div'); tmp.innerHTML = chatHtml();
  ms.innerHTML = tmp.querySelector('#msgs').innerHTML; ms.scrollTop = ms.scrollHeight;
  markChatSeen();
}
function markChatSeen() {
  const max = S.chat.reduce((m, x) => Math.max(m, x.id), 0);
  if (max > S.seen) { S.seen = max; LS.set('amv_seen', max); badges(); }
}

// ---------- Badges ----------
function badges() {
  const ch = unreadChat(), nt = S.notifs.filter(n => !n.lu).length;
  const set = (id, n) => { const el = $(id); if (el) { el.textContent = n; el.classList.toggle('on', n > 0); } };
  set('bdg-me', ch + nt); set('bdg-fab', ch); set('bdg-mb', ch); set('bdg-mb2', nt);
  if (S.drawerOpen) {
    const nb = { chat: ch, notifs: nt, rdv: S.rdvs.filter(r => r.statut === 'propose').length, devis: S.devis.filter(d => d.statut === 'propose').length };
    document.querySelectorAll('.dw-tabs button').forEach(b => { const k = (b.getAttribute('onclick').match(/'(\w+)'/) || [])[1]; const s = b.querySelector('.nb'); if (s) { s.textContent = nb[k] || ''; s.classList.toggle('on', !!nb[k] && S.tab !== k); } });
  }
}

// =====================================================================
// NOTIFICATIONS PUSH
// =====================================================================
const pushSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
function notifState() {
  if (!pushSupported()) return window.isSecureContext ? 'Non prises en charge sur ce navigateur' : 'Disponibles une fois le site en ligne (https)';
  if (Notification.permission === 'denied') return 'Bloquées dans les réglages du navigateur';
  return S.client && S.client.notifs && Notification.permission === 'granted' ? 'Activées : confirmations, réponses, pensées du jour' : 'Être prévenu(e) des réponses du coach';
}
function pushBox() {
  if (!S.client || !pushSupported() || Notification.permission === 'denied') return '';
  if (Notification.permission === 'granted' && S.client.notifs) return '';
  return `<div class="authb" style="margin:0 0 14px"><b style="font-family:var(--fd);font-size:22px">Soyez prévenu(e)</b><p class="note" style="margin-top:4px">Confirmation de rendez-vous, réponses du coach, ateliers : recevez-les même téléphone verrouillé.</p><button class="btn nuit sm" style="margin-top:12px" onclick="enablePush(true)">${ic('bell')} Activer les notifications</button></div>`;
}
const b64ToU8 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };
async function enablePush(ask) {
  if (!S.client || !pushSupported()) { if (ask) toast('Notifications indisponibles', 'Gardez le site ouvert : vous verrez les réponses en direct.', true); return; }
  try {
    let perm = Notification.permission;
    if (perm === 'default' && ask) perm = await Notification.requestPermission();
    if (perm !== 'granted') { if (ask) toast('Notifications refusées', 'Vous pouvez les réactiver dans les réglages du navigateur.', true); return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(S.site.vapidKey) });
    await api('/api/client/push', { body: { subscription: sub.toJSON() } });
    S.client.notifs = true;
    if (ask) { toast('Notifications activées', 'Vous serez prévenu(e) même téléphone verrouillé.'); if (S.drawerOpen) drawEspace(); if ($('modal').classList.contains('on')) document.querySelectorAll('#pn .authb').forEach(e => e.remove()); }
  } catch (e) { if (ask) toast('Activation impossible', e.message, true); }
}

// =====================================================================
// TEMPS RÉEL
// =====================================================================
let es = null, siteTimer = null;
function connectStream() {
  if (es) es.close();
  if (!window.EventSource) return;
  es = new EventSource(S.token ? '/api/stream/client?token=' + encodeURIComponent(S.token) : '/api/stream/public');
  es.addEventListener('presence', e => { S.presence = JSON.parse(e.data); refreshPresence(); });
  es.addEventListener('site', () => { clearTimeout(siteTimer); siteTimer = setTimeout(reloadSite, 800); });
  es.addEventListener('notif', e => {
    const n = JSON.parse(e.data); S.notifs.unshift(n); ding();
    const tab = { rdv: 'rdv', devis: 'devis', chat: 'chat', atelier: 'ateliers' }[n.type] || 'notifs';
    toast(n.titre, n.corps, false, () => openEspace(tab));
    badges(); if (S.drawerOpen && S.tab !== 'chat') drawEspace();
  });
  es.addEventListener('annonce', e => { const a = JSON.parse(e.data); S.notifs.unshift({ id: a.id, titre: a.titre, corps: a.corps, at: a.at, type: 'annonce', lu: false }); ding(); toast(a.titre, a.corps, false, () => openEspace('notifs')); badges(); });
  es.addEventListener('chat', e => {
    const m = JSON.parse(e.data); if (S.chat.some(x => x.id === m.id)) return;
    S.chat.push(m);
    const visible = S.drawerOpen && S.tab === 'chat' && !document.hidden;
    if (m.de !== 'client' && !visible) { ding(); toast(m.auteur || C().nom, m.texte, false, () => openEspace('chat')); }
    if (S.drawerOpen && S.tab === 'chat') renderChatMsgs(); else badges();
  });
  es.addEventListener('rdv', e => { upsert(S.rdvs, JSON.parse(e.data)); if (S.drawerOpen && ['rdv', 'accueil'].includes(S.tab)) drawEspace(); badges(); });
  es.addEventListener('devis', e => { upsert(S.devis, JSON.parse(e.data)); if (S.drawerOpen && S.tab === 'devis') drawEspace(); badges(); });
  es.addEventListener('inscription', e => { upsert(S.inscriptions, JSON.parse(e.data)); if (S.drawerOpen && S.tab === 'ateliers') drawEspace(); });
  es.onerror = () => { };
}
async function reloadSite() {
  try {
    const s = await api('/api/public/site');
    S.site = s; S.presence = s.presence;
    const y = window.scrollY; renderPage(); window.scrollTo(0, y);
    document.querySelectorAll('.reveal').forEach(e => { const r = e.getBoundingClientRect(); if (r.top < innerHeight) e.classList.add('in'); });
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.client) loadMine().then(() => { if (S.drawerOpen) drawEspace(); badges(); }); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open') { const v = new URL(e.data.url, location.href).searchParams.get('espace'); if (v) openEspace(v); } });

// =====================================================================
// DÉMARRAGE
// =====================================================================
async function loadMine() {
  if (!S.token) return;
  try {
    const d = await api('/api/client/donnees');
    Object.assign(S, { client: d.client, notifs: d.notifs, rdvs: d.rdvs, devis: d.devis, inscriptions: d.inscriptions, chat: d.chat, temoignages: d.temoignages });
  } catch (e) { if (!S.token) S.client = null; }
}
(async function init() {
  const q = new URLSearchParams(location.search);
  try { S.site = await api('/api/public/site'); S.presence = S.site.presence; }
  catch (e) { $('app').innerHTML = `<div class="loading"><img src="/img/logo-mc.png" alt=""><b>Connexion impossible</b><span>${esc(e.message)}</span><button class="btn nuit" onclick="location.reload()">Réessayer</button></div>`; return; }
  await loadMine();
  renderPage();
  connectStream();
  if (location.hash && $(location.hash.slice(1))) setTimeout(() => $(location.hash.slice(1)).scrollIntoView(), 60);
  if (q.get('espace')) openEspace(q.get('espace'));
  else if (q.has('rdv')) openRdv();
  else if (q.has('devis')) openDevis();
  else if (q.get('theme')) openTheme(Number(q.get('theme')));
  if (S.client && S.client.notifs && pushSupported() && Notification.permission === 'granted') enablePush(false);
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => { });
  if ([...q.keys()].length) history.replaceState(null, '', location.pathname + location.hash);
})();
