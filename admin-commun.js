// Fonctions communes de l'espace coach
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const F = n => Math.round(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F';
const fdate = iso => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fheure = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fdt = iso => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + fheure(iso);
const dmy = d => d ? d.split('-').reverse().join('/') : '';
const dLong = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function api(path, opts) {
  opts = opts || {};
  let res, body;
  try {
    res = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
    body = await res.json();
  } catch (e) { throw new Error('Serveur injoignable. Vérifiez la connexion.'); }
  if (res.status === 401 && !opts.auth) { showAuth(); throw new Error('Session expirée'); }
  if (!res.ok || body.ok === false) throw new Error(body.error || 'Erreur');
  return body;
}

let _tt;
function toast(t, b, err) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<b>${esc(t)}</b>${b ? `<span>${esc(b)}</span>` : ''}`;
  el.classList.toggle('err', !!err); el.classList.add('on');
  clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('on'), err ? 5000 : 3800);
}

function openModal(html, wide) {
  let m = $('modal');
  if (!m) { m = document.createElement('div'); m.id = 'modal'; m.className = 'modal'; m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); }); document.body.appendChild(m); }
  m.innerHTML = `<div class="mbox ${wide ? 'wide' : ''}"><button class="x" onclick="closeModal()" aria-label="Fermer">×</button>${html}</div>`;
  m.classList.add('on');
}
function closeModal() { const m = $('modal'); if (m) m.classList.remove('on'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Réduit une photo avant envoi (téléphone -> 1 400 px max, JPEG)
function resizeImage(file, max) {
  max = max || 1400;
  return new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onerror = () => ko(new Error('Lecture impossible'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => ko(new Error('Image illisible'));
      img.onload = () => {
        let { width: w, height: h } = img;
        const r = Math.min(1, max / Math.max(w, h)); w = Math.round(w * r); h = Math.round(h * r);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        ok(c.toDataURL('image/jpeg', 0.86));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function uploadImage(file, max) {
  const dataUrl = await resizeImage(file, max);
  const r = await api('/api/admin/upload', { body: { dataUrl } });
  return r.url;
}

// ---------- Connexion / première configuration ----------
let _onReady = null;
async function adminBoot(onReady) {
  _onReady = onReady;
  let s;
  try { s = await fetch('/api/session', { credentials: 'same-origin' }).then(r => r.json()); }
  catch (e) { document.body.innerHTML = '<div class="empty">Serveur injoignable.</div>'; return; }
  if (s.loggedIn) { hideAuth(); onReady(s); } else showAuth(s);
}
async function showAuth(s) {
  if (!s) s = await fetch('/api/session').then(r => r.json()).catch(() => ({ setupDone: true }));
  let el = $('auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; el.className = 'auth'; document.body.appendChild(el); }
  el.style.display = 'flex';
  el.innerHTML = s.setupDone ? `<div class="ab"><img class="lau" src="/img/laurier.webp" alt=""><img src="/img/logo-mc.png" alt="" class="lg"><div class="h">Espace coach</div><p>${esc(s.nom || '')} — coach et assistant(e)s</p>
      <div class="fld"><label>Identifiant</label><input id="au-u" autocomplete="username"></div>
      <div class="fld"><label>Mot de passe</label><input id="au-p" type="password" autocomplete="current-password"></div>
      <div class="err" id="au-e"></div><button class="btn big full" id="au-go">Se connecter</button>
      <p class="hint" style="margin-top:14px;text-align:center"><a href="/">← Retour au site</a></p></div>`
    : `<div class="ab"><img class="lau" src="/img/laurier.webp" alt=""><img src="/img/logo-mc.png" alt="" class="lg"><div class="h">Bienvenue</div><p>Première utilisation : créez l’accès du coach.</p>
      <div class="fld"><label>Nom affiché sur le site</label><input id="au-r" value="${esc(s.nom || '')}"></div>
      <div class="fld"><label>Identifiant de connexion</label><input id="au-u" autocomplete="username" placeholder="ex. : amavie"></div>
      <div class="fld"><label>Mot de passe (6 caractères min.)</label><input id="au-p" type="password" autocomplete="new-password"></div>
      <p class="hint" style="margin:0 0 10px;max-width:none">Vous pourrez ensuite créer des accès pour vos assistant(e)s dans « Équipe ».</p>
      <div class="err" id="au-e"></div><button class="btn big full" id="au-go">Créer l’accès du coach</button></div>`;
  const go = async () => {
    try {
      if (s.setupDone) await api('/api/login', { body: { username: $('au-u').value, password: $('au-p').value }, auth: true });
      else await api('/api/setup', { body: { coachNom: $('au-r').value, nom: $('au-r').value, username: $('au-u').value, password: $('au-p').value }, auth: true });
      const s2 = await fetch('/api/session').then(r => r.json());
      hideAuth(); if (_onReady) _onReady(s2);
    } catch (e) { $('au-e').textContent = e.message; }
  };
  $('au-go').onclick = go;
  el.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  setTimeout(() => { const f = el.querySelector('input'); if (f) f.focus(); }, 50);
}
function hideAuth() { const el = $('auth'); if (el) el.style.display = 'none'; }
async function logout() { await fetch('/api/logout', { method: 'POST' }); location.reload(); }

// ---------- Temps réel ----------
function adminStream(handlers, onState) {
  let es;
  const open = () => {
    es = new EventSource('/api/stream/admin');
    es.onopen = () => onState && onState(true);
    es.onerror = () => { onState && onState(false); };
    Object.keys(handlers).forEach(ev => es.addEventListener(ev, e => handlers[ev](JSON.parse(e.data))));
  };
  open();
  return () => es && es.close();
}
