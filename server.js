/**
 * COACH AMAVIE — Metanoïa Coaching
 * Serveur de la plateforme (site public + espace membre + espace coach)
 * -----------------------------------------------------------
 * Aucune dépendance externe : uniquement les modules intégrés à Node.js
 * (même architecture que la plateforme restaurant).
 *
 * DEUX INTERFACES, UNE SEULE BASE DE DONNÉES :
 *  - /             -> SITE PUBLIC + ESPACE MEMBRE (bannière défilante, le coach,
 *                     accompagnements, rendez-vous, devis de formation, ateliers,
 *                     discussion en direct, témoignages, ressources, contact)
 *  - /gestion.html -> ESPACE COACH (coach + assistant(e)s) : tableau de bord,
 *                     rendez-vous, discussions, devis, contenus, réseaux sociaux...
 *
 * Temps réel : Server-Sent Events + notifications Web Push (VAPID, module crypto).
 *
 * Variables d'environnement (toutes optionnelles) :
 *   PORT       Port d'écoute
 *   DATA_FILE  Emplacement du fichier de données (par défaut ./data.json).
 *              Les images envoyées sont rangées dans "uploads" à côté de ce fichier.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data.json');
const DATA_DIR = path.dirname(DATA_FILE);
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'sauvegardes');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

// ============================================================
// OUTILS
// ============================================================
const makeSalt = () => crypto.randomBytes(16).toString('hex');
const hashSecret = (v, salt) => crypto.scryptSync(String(v), salt, 64).toString('hex');
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
const uid = () => crypto.randomBytes(5).toString('hex');
const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : (d || 0); };
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 500);
const nowIso = () => new Date().toISOString();
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isTime = s => /^\d{2}:\d{2}$/.test(String(s || ''));
const dmy = d => String(d || '').split('-').reverse().join('/');

// Date/heure locale (fuseau réglable, Abidjan par défaut)
function localParts(tz, date) {
  const d = date || new Date();
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Africa/Abidjan', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, weekday: wd };
}
const TZ = () => (DB && DB.settings.coach.fuseau) || 'Africa/Abidjan';
const today = () => localParts(TZ()).date;
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = dateStr => new Date(dateStr + 'T12:00:00Z').getUTCDay();
// Nombre de minutes entre maintenant (heure locale) et une date/heure locale
function minutesUntil(date, heure) {
  const lp = localParts(TZ());
  const a = Date.UTC(...lp.date.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 60000 + toMin(lp.time);
  const b = Date.UTC(...date.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 60000 + toMin(heure);
  return b - a;
}
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

// ============================================================
// BASE DE DONNÉES (en mémoire + fichier JSON)
// ============================================================
let DB = null;

function seedData() {
  const ids = { c: 1 };
  const nid = () => ids.c++;
  const theme = (nom, accroche, description, couleur, publicCible) => ({ id: nid(), nom, accroche, description, publicCible: publicCible || '', couleur, image: '', actif: true, ordre: ids.c });
  const themes = [
    theme('Sortir de l’angoisse', 'Retrouver la paix intérieure quand l’anxiété prend toute la place.',
      'Nuits agitées, cœur qui s’emballe, pensées qui tournent en boucle… Ensemble, nous identifions ce qui nourrit votre angoisse et nous mettons en place des repères concrets pour respirer à nouveau et reprendre la main sur votre quotidien.', 'bleu'),
    theme('Oser parler, libérer sa parole', 'Mettre des mots sur ce qui pèse, sans être jugé(e).',
      'Certaines choses n’ont jamais été dites, ni à la famille, ni aux amis. Ici, la parole est libre et protégée. Parler est souvent le premier pas vers la guérison : on avance à votre rythme, dans le respect total de votre histoire.', 'or'),
    theme('Guérir les blessures de l’enfance', 'Ce que l’enfant a vécu n’a pas à diriger la vie de l’adulte.',
      'Rejet, humiliation, manque d’amour, parent absent : les blessures de l’enfance laissent des traces dans nos relations et nos choix. L’accompagnement vous aide à les reconnaître, à les apaiser et à vous reconstruire sur des bases solides.', 'nuit'),
    theme('Renaître après un divorce', 'La fin d’un mariage n’est pas la fin de votre histoire.',
      'Colère, culpabilité, solitude, regard des autres, enfants à protéger… Le divorce bouleverse tout. Nous travaillons à faire le deuil de la relation, à retrouver votre valeur et à reconstruire un projet de vie qui vous ressemble.', 'bleu'),
    theme('Se relever après le deuil d’un conjoint', 'Traverser l’épreuve d’une perte brutale, sans rester seul(e).',
      'La disparition tragique d’un époux ou d’une épouse laisse un vide immense. L’accompagnement offre un espace pour pleurer, comprendre, poser les questions qui font mal, puis, pas à pas, retrouver le goût de vivre.', 'nuit'),
    theme('Surmonter l’abandon', 'Ne plus vivre avec la peur d’être quitté(e).',
      'Être abandonné(e) par un parent, un conjoint ou un proche peut installer une peur profonde et durable. Ensemble, nous libérons cette peur pour que vous puissiez de nouveau faire confiance et vous attacher sans vous perdre.', 'or'),
    theme('Se remettre d’un « goumin »', 'Le chagrin d’amour qui empêche d’avancer.',
      'Rupture, trahison, promesses non tenues : le goumin peut couper l’appétit, le sommeil et l’envie de tout. Nous transformons cette douleur en force pour que vous repartiez plus lucide et plus libre dans vos relations.', 'bleu'),
    theme('Vaincre la peur et le manque de confiance', 'Oser prendre sa place, enfin.',
      'Peur de décevoir, de prendre la parole, de se lancer, de dire non… Le manque de confiance freine les plus beaux projets. Le coaching vous aide à identifier vos forces et à poser des actes concrets pour vous affirmer.', 'nuit'),
    theme('Ne plus craindre de finir sa vie seul(e)', 'Pour les personnes d’âge mûr qui redoutent la solitude.',
      'Les années passent, les enfants sont partis ou ne sont pas venus, et la peur de vieillir seul(e) s’installe. Il n’est jamais trop tard pour ouvrir son cœur, élargir son cercle et construire une vie relationnelle riche et apaisée.', 'or', '50 ans et plus'),
    theme('Femmes accomplies… mais seules', 'Vous avez tout réussi, sauf ce qui compte le plus pour vous.',
      'Carrière, maison, indépendance : vous avez tout bâti, mais vous rentrez seule le soir. Nous explorons ensemble ce qui bloque la rencontre, vos exigences, vos peurs et vos schémas, pour ouvrir enfin la porte à une relation saine et durable.', 'bleu', 'Femmes célibataires'),
    theme('Mères célibataires : rendre à chacun sa place', 'Votre enfant n’est pas votre conjoint.',
      'Quand on élève seule ses enfants, il arrive qu’un enfant devienne, sans le vouloir, le confident, le protecteur ou « l’homme de la maison ». L’accompagnement aide à retrouver un équilibre sain : l’enfant redevient enfant, et vous retrouvez votre vie de femme.', 'nuit', 'Mères célibataires')
  ];
  const T = n => themes.find(t => t.nom.startsWith(n)).id;
  const ban = (surtitre, titre, texte, couleur, lien, themeId) => ({ id: nid(), image: '', surtitre, titre, texte, couleur, lien, themeId: themeId || 0, actif: true, ordre: ids.c });
  const banners = [
    ban('Coaching de vie éthique', 'Il n’est jamais trop tard pour *renaître*.', 'Angoisse, blessures, séparation, deuil, solitude : vous n’êtes pas obligé(e) de traverser cela seul(e).', 'nuit', 'rdv'),
    ban('Angoisse & peur', 'Retrouvez la *paix* intérieure.', 'Apprenez à apaiser l’anxiété et à reprendre la main sur votre vie.', 'bleu', 'theme', T('Sortir')),
    ban('Blessures de l’enfance', 'Guérir l’enfant pour *libérer* l’adulte.', 'Reconnaître, apaiser, reconstruire : un chemin à votre rythme.', 'or', 'theme', T('Guérir')),
    ban('Divorce · Deuil · Abandon', 'Après la tempête, la *renaissance*.', 'Un accompagnement pour traverser la perte et reconstruire un projet de vie.', 'nuit', 'theme', T('Renaître')),
    ban('Célibat & âge mûr', 'Ne plus avoir peur de finir sa vie *seul(e)*.', 'Pour les femmes accomplies qui vivent seules et les personnes de 50 ans et plus.', 'bleu', 'theme', T('Ne plus')),
    ban('Mères célibataires', 'Votre enfant n’est pas *votre mari*.', 'Retrouver l’équilibre, rendre à chacun sa place, et revivre en tant que femme.', 'or', 'theme', T('Mères')),
    ban('Entreprises · Églises · Associations', 'Une formation pour *vos équipes* ?', 'Ateliers et séminaires sur mesure : demandez votre devis en 2 minutes.', 'nuit', 'devis')
  ];
  const ressources = [
    { id: nid(), titre: 'Respirer quand l’angoisse monte', categorie: 'Exercice', duree: '3 min', image: '', actif: true, at: nowIso(),
      resume: 'Un exercice simple à faire n’importe où pour calmer le corps et l’esprit.',
      contenu: 'Asseyez-vous, les deux pieds bien posés au sol.\n\nInspirez par le nez en comptant jusqu’à 4. Retenez votre souffle en comptant jusqu’à 4. Expirez lentement par la bouche en comptant jusqu’à 6.\n\nRecommencez 5 fois. L’expiration plus longue que l’inspiration envoie au corps le signal que le danger est passé.\n\nSi l’angoisse revient souvent, ne restez pas seul(e) avec elle : parlons-en.' },
    { id: nid(), titre: 'Avant de chercher la bonne personne, devenir la bonne personne', categorie: 'Réflexion', duree: '5 min', image: '', actif: true, at: nowIso(),
      resume: 'Prendre le temps de guérir avant de s’engager dans une nouvelle relation.',
      contenu: 'Beaucoup de relations échouent parce que l’on demande à l’autre de réparer ce qui est blessé en nous.\n\nPrenez un moment cette semaine pour écrire trois choses : ce que vous attendez d’une relation, ce que vous avez à offrir, et ce qui vous fait encore peur.\n\nCe petit exercice révèle souvent la blessure qu’il reste à soigner. C’est là que l’accompagnement commence.' },
    { id: nid(), titre: 'Mère seule : mon enfant n’est pas mon confident', categorie: 'Famille', duree: '4 min', image: '', actif: true, at: nowIso(),
      resume: 'Trois signes qu’un enfant porte une place qui n’est pas la sienne.',
      contenu: '1. Il s’inquiète de vos soucis d’argent ou de vos peines de cœur.\n2. Il dort régulièrement dans votre lit « pour vous tenir compagnie ».\n3. Il prend les décisions ou vous protège comme le ferait un conjoint.\n\nCe n’est la faute de personne : c’est souvent la conséquence de la solitude. Mais un enfant a besoin d’être un enfant. Rendre à chacun sa place libère l’enfant… et la mère.' }
  ];
  return { ids, themes, banners, ressources };
}

function defaultData() {
  const seed = seedData();
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return {
    nextId: seed.ids.c + 10,
    settings: {
      setupDone: false, users: [],
      vapid: { publicKey: pub.toString('base64url'), privateJwk: jwk },
      coach: {
        nom: 'Coach AMAVIE', marque: 'Metanoïa Coaching', slogan: 'Coach éthique en développement personnel',
        tel: '+225 07 79 15 62 89', whatsapp: '+225 07 79 15 62 89', email: '',
        adresse: 'Abidjan, Côte d’Ivoire', horaires: 'Du lundi au samedi, 8 h – 19 h', fuseau: 'Africa/Abidjan',
        disponible: true, photo: '',
        titreBio: 'Votre coach de vie',
        bio: 'Coach de vie éthique en développement personnel, Coach AMAVIE accompagne les femmes et les hommes qui traversent une période douloureuse ou qui se sentent bloqués dans leur vie.\n\nAngoisse, blessures de l’enfance, divorce, deuil brutal d’un conjoint, abandon, chagrin d’amour, peur, manque de confiance, solitude… Chaque histoire est unique, et chaque accompagnement l’est aussi.\n\nSa conviction : personne n’est condamné à rester prisonnier de son passé. Avec de l’écoute, de la méthode et du temps, il est possible de se relever, de se reconstruire et de renaître.',
        citation: 'Metanoïa : le changement profond qui transforme la manière de penser… et toute une vie.',
        chiffres: [{ valeur: '100 %', libelle: 'Confidentiel' }, { valeur: '2', libelle: 'Formats : présentiel & en ligne' }, { valeur: '0', libelle: 'Jugement' }],
        valeurs: ['Écoute sans jugement', 'Confidentialité absolue', 'Éthique et respect', 'Bienveillance et exigence'],
        reseaux: { facebook: '', instagram: '', tiktok: '', youtube: '', linkedin: '', x: '', telegram: '', whatsappChaine: '', site: '' },
        rdv: {
          duree: 60, jours: [1, 2, 3, 4, 5, 6], creneaux: ['09:00', '10:30', '14:00', '15:30', '17:00'],
          delaiHeures: 12, horizonJours: 45,
          formats: ['Au cabinet (présentiel)', 'En ligne (visio)', 'Par téléphone / WhatsApp'],
          tarif: 'Le tarif vous est communiqué à la confirmation du rendez-vous.'
        },
        indisponibles: [],
        faq: [
          { q: 'Est-ce que ce que je dis reste confidentiel ?', r: 'Oui. Tout ce qui est partagé pendant les séances et dans la discussion en ligne reste strictement confidentiel. C’est la base de l’éthique du coaching.' },
          { q: 'Les séances se font-elles en présentiel ou en ligne ?', r: 'Les deux sont possibles : au cabinet, en visio ou par téléphone / WhatsApp. Vous choisissez le format au moment de prendre rendez-vous.' },
          { q: 'Combien de séances faut-il ?', r: 'Cela dépend de votre situation et de vos objectifs. Le premier rendez-vous permet de faire le point et de vous proposer un parcours adapté.' },
          { q: 'Le coaching remplace-t-il un médecin ou un psychologue ?', r: 'Non. Le coaching est un accompagnement complémentaire. Si votre situation le nécessite, vous serez orienté(e) vers un professionnel de santé.' },
          { q: 'Proposez-vous des formations pour les entreprises, églises ou associations ?', r: 'Oui : ateliers, conférences et séminaires sur mesure. Utilisez le bouton « Demander un devis de formation ».' }
        ]
      }
    },
    themes: seed.themes, banners: seed.banners, ressources: seed.ressources,
    evenements: [], inscriptions: [], temoignages: [],
    clients: [], annonces: [], notifs: [],
    programmes: [
      { id: seed.ids.c + 1, titre: 'Une pensée pour votre journée', corps: 'Bonjour ! Prenez un instant pour respirer. Vous avez le droit d’avancer à votre rythme. — {coach}', heure: '07:00', jours: [1, 2, 3, 4, 5, 6, 0], actif: false, dernierEnvoi: '' }
    ],
    rdvs: [], devis: [], chats: []
  };
}

function loadDB() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { }
  try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { DB = defaultData(); saveDB(); return; }
  const def = defaultData();
  for (const k of Object.keys(def)) if (DB[k] === undefined) DB[k] = def[k];
  DB.settings.coach = Object.assign({}, def.settings.coach, DB.settings.coach || {});
  DB.settings.coach.reseaux = Object.assign({}, def.settings.coach.reseaux, DB.settings.coach.reseaux || {});
  DB.settings.coach.rdv = Object.assign({}, def.settings.coach.rdv, DB.settings.coach.rdv || {});
  if (!DB.settings.vapid) DB.settings.vapid = def.settings.vapid;
  if (!Array.isArray(DB.settings.users)) DB.settings.users = [];
  saveDB();
}
function saveDB() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB));
  fs.renameSync(tmp, DATA_FILE);
}
const nextId = () => DB.nextId++;
function backupIfNeeded() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, `data-${new Date().toISOString().slice(0, 10)}.json`);
    if (!fs.existsSync(dest)) fs.copyFileSync(DATA_FILE, dest);
    // On garde 30 jours de sauvegardes
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    files.slice(0, Math.max(0, files.length - 30)).forEach(f => fs.unlink(path.join(BACKUP_DIR, f), () => { }));
  } catch (e) { console.error('Sauvegarde impossible :', e.message); }
}

// ============================================================
// SESSIONS (coach + assistant(e)s) + ANTI BRUTE-FORCE
// ============================================================
const sessions = new Map();
const SESSION_TTL = 12 * 3600 * 1000;
function parseCookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }); return out;
}
function getUser(req) {
  const sid = parseCookies(req).sid;
  const s = sid && sessions.get(sid);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(sid); return null; }
  const u = DB.settings.users.find(x => x.id === s.userId);
  return u && u.actif !== false ? u : null;
}
function openSession(req, res, user) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { userId: user.id, expires: Date.now() + SESSION_TTL });
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`);
}
const attempts = new Map();
function rateOk(key, max, windowMs) {
  const now = Date.now(); const r = attempts.get(key);
  if (!r || now > r.resetAt) { attempts.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  return ++r.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (now > s.expires) sessions.delete(k);
  for (const [k, r] of attempts) if (now > r.resetAt) attempts.delete(k);
}, 3600 * 1000);
const userView = u => ({ id: u.id, username: u.username, nom: u.nom, role: u.role, actif: u.actif !== false, createdAt: u.createdAt });

// ============================================================
// TEMPS RÉEL (Server-Sent Events) + PRÉSENCE EN LIGNE
// ============================================================
const adminStreams = new Map(); // res -> userId
const clientStreams = new Map(); // clientId -> Set(res)
function sseOpen(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
}
function sseSend(res, ev, data) { try { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { /* fermé */ } }
const toAdmin = (ev, d) => { for (const r of adminStreams.keys()) sseSend(r, ev, d); };
const toClient = (cid, ev, d) => { const s = clientStreams.get(cid); if (s) for (const r of s) sseSend(r, ev, d); };
const toAllClients = (ev, d) => { for (const s of clientStreams.values()) for (const r of s) sseSend(r, ev, d); };
const publicStreams = new Set(); // visiteurs non connectés (présence + mises à jour du site)
function presence() {
  const online = new Set(adminStreams.values());
  const us = DB.settings.users.filter(u => online.has(u.id) && u.actif !== false);
  return {
    coach: DB.settings.coach.disponible !== false && us.some(u => u.role === 'coach'),
    equipe: us.some(u => u.role === 'assistant') || (DB.settings.coach.disponible !== false && us.some(u => u.role === 'coach')),
    enLigne: us.map(u => ({ nom: u.nom, role: u.role }))
  };
}
let lastPresence = '';
function pushPresence() {
  const p = presence(); const k = JSON.stringify(p);
  if (k === lastPresence) return; lastPresence = k;
  toAllClients('presence', p); for (const r of publicStreams) sseSend(r, 'presence', p); toAdmin('presence', p);
}
const toPublic = (ev, d) => { toAllClients(ev, d); for (const r of publicStreams) sseSend(r, ev, d); };
setInterval(() => {
  for (const r of adminStreams.keys()) { try { r.write(': ping\n\n'); } catch (e) { } }
  for (const s of clientStreams.values()) for (const r of s) { try { r.write(': ping\n\n'); } catch (e) { } }
  for (const r of publicStreams) { try { r.write(': ping\n\n'); } catch (e) { } }
}, 25000);

// ============================================================
// WEB PUSH (VAPID + chiffrement aes128gcm, RFC 8291/8292)
// ============================================================
function vapidAuthHeader(endpoint) {
  const v = DB.settings.vapid;
  const aud = new URL(endpoint).origin;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sub = 'mailto:' + (DB.settings.coach.email || 'infos@acdees.com');
  const unsigned = b64({ typ: 'JWT', alg: 'ES256' }) + '.' + b64({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub });
  const key = crypto.createPrivateKey({ key: v.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${unsigned}.${sig}, k=${v.publicKey}`;
}
function encryptPush(sub, payload) {
  const uaPublic = Buffer.from(sub.keys.p256dh, 'base64url');
  const authSecret = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = 65;
  return Buffer.concat([header, asPublic, ct]);
}
function sendPush(client, payloadObj) {
  if (!client.push || !client.push.length) return;
  const payload = JSON.stringify(payloadObj);
  client.push.slice().forEach(sub => {
    let body, auth;
    try { body = encryptPush(sub, payload); auth = vapidAuthHeader(sub.endpoint); } catch (e) { return; }
    const u = new URL(sub.endpoint);
    const req = https.request({ method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Content-Length': body.length, TTL: '86400', Urgency: 'high', Authorization: auth } }, (r) => {
      r.resume();
      if (r.statusCode === 404 || r.statusCode === 410) { client.push = client.push.filter(s => s.endpoint !== sub.endpoint); saveDB(); }
    });
    req.on('error', () => { });
    req.setTimeout(10000, () => req.destroy());
    req.end(body);
  });
}

// Notification personnelle (rendez-vous, devis, discussion...)
const VUE_NOTIF = { rdv: 'rdv', devis: 'devis', chat: 'chat', atelier: 'ateliers' };
function notifyClient(clientId, titre, corps, extra) {
  const client = DB.clients.find(c => c.id === clientId);
  if (!client) return;
  const n = { id: nextId(), clientId, titre, corps, at: nowIso(), lu: false, type: (extra && extra.type) || 'info', ref: (extra && extra.ref) || null };
  DB.notifs.push(n);
  if (DB.notifs.length > 5000) DB.notifs = DB.notifs.slice(-4000);
  toClient(clientId, 'notif', n);
  sendPush(client, { title: titre, body: corps, tag: n.type + '-' + (n.ref || n.id), url: '/?espace=' + (VUE_NOTIF[n.type] || 'notifs') });
}
// Message à toutes les personnes inscrites (pensée du jour, annonce d'atelier...)
function broadcast(titre, corps, image) {
  const a = { id: nextId(), titre, corps, image: image || '', at: nowIso() };
  DB.annonces.push(a);
  if (DB.annonces.length > 500) DB.annonces = DB.annonces.slice(-400);
  saveDB();
  toAllClients('annonce', a);
  let n = 0;
  DB.clients.forEach(c => { if (c.push && c.push.length) { n++; sendPush(c, { title: titre, body: corps, tag: 'annonce-' + a.id, url: '/?espace=notifs' }); } });
  return { annonce: a, pushes: n };
}
function fillTemplate(t) {
  const prochain = DB.evenements.filter(e => e.actif && e.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  return String(t || '')
    .replace(/\{coach\}/g, DB.settings.coach.nom)
    .replace(/\{prochain_atelier\}/g, prochain ? `${prochain.titre} le ${dmy(prochain.date)}` : 'nos prochains ateliers');
}

// Messages programmés : vérification toutes les 30 secondes
setInterval(() => {
  if (!DB) return;
  const lp = localParts(TZ());
  let changed = false;
  DB.programmes.forEach(p => {
    if (!p.actif || p.dernierEnvoi === lp.date) return;
    if (!(p.jours || []).includes(lp.weekday)) return;
    if (lp.time < p.heure) return;
    p.dernierEnvoi = lp.date; changed = true;
    // Pas de message du matin envoyé le soir si le serveur était éteint
    if (toMin(lp.time) - toMin(p.heure) > 120) return;
    broadcast(fillTemplate(p.titre), fillTemplate(p.corps));
  });
  if (changed) saveDB();
}, 30000);

// Rappel automatique la veille d'un rendez-vous confirmé (à partir de 18 h)
setInterval(() => {
  if (!DB) return;
  const lp = localParts(TZ());
  if (lp.time < '18:00') return;
  const demain = addDays(lp.date, 1);
  let changed = false;
  DB.rdvs.forEach(r => {
    if (r.statut !== 'confirme' || r.date !== demain || r.rappelEnvoye) return;
    r.rappelEnvoye = true; changed = true;
    notifyClient(r.clientId, 'Rappel : rendez-vous demain', `Demain à ${r.heure} · ${r.format}. À demain !`, { type: 'rdv', ref: r.id });
  });
  if (changed) saveDB();
}, 5 * 60000);

// ============================================================
// MÉTIER : créneaux de rendez-vous
// ============================================================
const RDV_ACTIFS = ['demande', 'confirme', 'propose'];
function slotTaken(date, heure, exceptId) {
  return DB.rdvs.some(r => r.id !== exceptId && RDV_ACTIFS.includes(r.statut) &&
    ((r.date === date && r.heure === heure) || (r.statut === 'propose' && r.proposition && r.proposition.date === date && r.proposition.heure === heure)));
}
function daySlots(date) {
  const c = DB.settings.coach, cfg = c.rdv;
  if ((c.indisponibles || []).includes(date)) return { ferme: true, slots: [] };
  if (!(cfg.jours || []).includes(weekdayOf(date))) return { ferme: true, slots: [] };
  const slots = (cfg.creneaux || []).slice().sort().map(h => ({
    heure: h, libre: !slotTaken(date, h) && minutesUntil(date, h) >= num(cfg.delaiHeures, 12) * 60
  }));
  return { ferme: false, slots };
}
function checkSlot(date, heure, exceptId) {
  if (!isDate(date) || !isTime(heure)) fail(400, 'Choisissez une date et un horaire.');
  const cfg = DB.settings.coach.rdv;
  if (date > addDays(today(), num(cfg.horizonJours, 45))) fail(400, 'Cette date est trop lointaine pour le moment.');
  const d = daySlots(date);
  if (d.ferme) fail(409, 'Le coach ne reçoit pas ce jour-là. Choisissez une autre date.');
  if (!(cfg.creneaux || []).includes(heure)) fail(400, 'Horaire non proposé.');
  if (minutesUntil(date, heure) < num(cfg.delaiHeures, 12) * 60) fail(409, `Les rendez-vous se prennent au moins ${cfg.delaiHeures} h à l’avance.`);
  if (slotTaken(date, heure, exceptId)) fail(409, 'Ce créneau vient d’être réservé. Choisissez-en un autre.');
}

const clientPublic = c => ({ id: c.id, nom: c.nom, tel: c.tel, invite: !!c.invite, notifs: !!(c.push && c.push.length) });
const adminClientView = c => ({ id: c.id, nom: c.nom, tel: c.tel, invite: !!c.invite, createdAt: c.createdAt, push: !!(c.push && c.push.length), notePrivee: c.notePrivee || '' });
const evenementPublic = e => {
  const pris = DB.inscriptions.filter(i => i.evenementId === e.id && i.statut !== 'annulee').reduce((s, i) => s + i.places, 0);
  return Object.assign({}, e, { restantes: e.places ? Math.max(0, e.places - pris) : null, inscrits: pris });
};
const temoignagePublic = t => ({ id: t.id, nom: t.nom, texte: t.texte, theme: t.theme, at: t.at });

// ============================================================
// HTTP
// ============================================================
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function readBody(req, maxBytes) {
  maxBytes = maxBytes || 12 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > maxBytes) { reject(new HttpError(413, 'Fichier trop volumineux')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch (e) { reject(new HttpError(400, 'Données invalides')); } });
    req.on('error', reject);
  });
}

function saveImage(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) fail(400, 'Image invalide (PNG, JPG ou WEBP).');
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = Date.now().toString(36) + '-' + uid() + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[2], 'base64'));
  return '/uploads/' + name;
}
function removeImage(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => { });
}
function setImage(obj, key, val) {
  if (val === undefined) return;
  const v = str(val, 200);
  if (obj[key] && obj[key] !== v) removeImage(obj[key]);
  obj[key] = v;
}

function serveFile(res, filePath, cache) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    const ext = path.extname(filePath).toLowerCase();
    const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
    h['Cache-Control'] = cache ? 'public, max-age=604800' : 'no-cache';
    if (path.basename(filePath) === 'sw.js') h['Service-Worker-Allowed'] = '/';
    res.writeHead(200, h); res.end(data);
  });
}

// ---------- Mini routeur ----------
const routes = [];
function route(method, pattern, auth, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, handler });
}
function getClient(req, query) {
  const token = req.headers['x-client-token'] || (query && query.get('token'));
  if (!token) return null;
  return DB.clients.find(c => c.tokens && c.tokens.some(t => safeEqual(t, token))) || null;
}
const findOr404 = (arr, id, what) => arr.find(x => x.id === Number(id)) || fail(404, (what || 'Élément') + ' introuvable');
const normTel = t => String(t || '').replace(/[^\d+]/g, '');
const ownOr403 = (obj, client) => { if (obj.clientId !== client.id) fail(403, 'Accès refusé'); };

// ============================================================
// ROUTES — PUBLIC
// ============================================================
function publicCoach() {
  const c = Object.assign({}, DB.settings.coach);
  delete c.indisponibles;
  return c;
}
route('GET', '/api/public/site', null, () => {
  const td = today();
  return {
    ok: true, coach: publicCoach(), vapidKey: DB.settings.vapid.publicKey, presence: presence(), aujourdhui: td,
    themes: DB.themes.filter(t => t.actif).sort((a, b) => a.ordre - b.ordre),
    banners: DB.banners.filter(b => b.actif).sort((a, b) => a.ordre - b.ordre),
    evenements: DB.evenements.filter(e => e.actif && e.date >= td).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)).map(evenementPublic),
    temoignages: DB.temoignages.filter(t => t.publie).sort((a, b) => b.at.localeCompare(a.at)).map(temoignagePublic),
    ressources: DB.ressources.filter(r => r.actif).sort((a, b) => b.at.localeCompare(a.at))
  };
});
// Créneaux libres sur les prochains jours
route('GET', '/api/public/disponibilites', null, (ctx) => {
  const cfg = DB.settings.coach.rdv;
  const from = isDate(ctx.query.get('from')) && ctx.query.get('from') > today() ? ctx.query.get('from') : today();
  const n = Math.max(1, Math.min(60, Math.round(num(ctx.query.get('jours'), 21))));
  const max = addDays(today(), num(cfg.horizonJours, 45));
  const jours = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i); if (d > max) break;
    const s = daySlots(d);
    jours.push({ date: d, weekday: weekdayOf(d), ferme: s.ferme, libres: s.slots.filter(x => x.libre).map(x => x.heure), complets: s.slots.filter(x => !x.libre).map(x => x.heure) });
  }
  return { ok: true, jours, duree: cfg.duree };
});
// Flux temps réel pour les visiteurs (présence du coach, site mis à jour)
route('GET', '/api/stream/public', null, (ctx) => {
  sseOpen(ctx.req, ctx.res); publicStreams.add(ctx.res);
  sseSend(ctx.res, 'presence', presence());
  ctx.req.on('close', () => publicStreams.delete(ctx.res));
  return 'STREAM';
});

// ============================================================
// ROUTES — PERSONNES ACCOMPAGNÉES (espace membre)
// ============================================================
function issueToken(client) {
  const t = crypto.randomBytes(24).toString('hex');
  client.tokens = (client.tokens || []).slice(-4); client.tokens.push(t);
  return t;
}
function mergeGuest(prev, c) {
  if (!prev || !prev.invite || prev.id === c.id) return;
  ['chats', 'rdvs', 'devis', 'inscriptions', 'notifs', 'temoignages'].forEach(k => DB[k].forEach(o => { if (o.clientId === prev.id) o.clientId = c.id; }));
  c.push = (c.push || []).concat(prev.push || []).slice(-5);
  DB.clients = DB.clients.filter(x => x !== prev);
}
route('POST', '/api/client/inscription', null, (ctx) => {
  if (!rateOk('insc:' + ctx.ip, 10, 15 * 60000)) fail(429, 'Trop de tentatives, réessayez plus tard.');
  const nom = str(ctx.body.nom, 60), tel = normTel(ctx.body.tel), pin = String(ctx.body.pin || '');
  if (!nom || tel.replace(/\D/g, '').length < 8) fail(400, 'Prénom (ou pseudo) et numéro de téléphone valides requis.');
  if (!/^\d{4}$/.test(pin)) fail(400, 'Le code secret doit faire 4 chiffres.');
  if (DB.clients.some(c => c.tel === tel && !c.invite)) fail(409, 'Ce numéro a déjà un compte. Connectez-vous.');
  const salt = makeSalt();
  const c = { id: nextId(), nom, tel, pinSalt: salt, pinHash: hashSecret(pin, salt), push: [], tokens: [], createdAt: nowIso() };
  DB.clients.push(c);
  mergeGuest(getClient(ctx.req), c);
  const token = issueToken(c); saveDB();
  toAdmin('client', adminClientView(c));
  return { ok: true, token, client: clientPublic(c) };
});
route('POST', '/api/client/connexion', null, (ctx) => {
  if (!rateOk('cnx:' + ctx.ip, 10, 15 * 60000)) fail(429, 'Trop de tentatives, réessayez dans 15 minutes.');
  const tel = normTel(ctx.body.tel);
  const c = DB.clients.find(x => x.tel === tel && !x.invite);
  if (!c || !safeEqual(hashSecret(String(ctx.body.pin || ''), c.pinSalt), c.pinHash)) fail(401, 'Numéro ou code secret incorrect.');
  mergeGuest(getClient(ctx.req), c);
  const token = issueToken(c); saveDB();
  return { ok: true, token, client: clientPublic(c) };
});
// Discussion rapide : juste un prénom (et un numéro facultatif)
route('POST', '/api/client/invite', null, (ctx) => {
  if (!rateOk('inv:' + ctx.ip, 20, 15 * 60000)) fail(429, 'Trop de tentatives.');
  const nom = str(ctx.body.nom, 40);
  if (!nom) fail(400, 'Indiquez votre prénom (ou un pseudo).');
  const c = { id: nextId(), nom, tel: normTel(ctx.body.tel), invite: true, push: [], tokens: [], createdAt: nowIso() };
  const token = issueToken(c); DB.clients.push(c); saveDB();
  toAdmin('client', adminClientView(c));
  return { ok: true, token, client: clientPublic(c) };
});
route('GET', '/api/client/moi', 'client', (ctx) => ({ ok: true, client: clientPublic(ctx.client) }));
route('PUT', '/api/client/moi', 'client', (ctx) => {
  if (ctx.body.nom) ctx.client.nom = str(ctx.body.nom, 60);
  saveDB(); return { ok: true, client: clientPublic(ctx.client) };
});
route('POST', '/api/client/deconnexion', 'client', (ctx) => {
  const t = ctx.req.headers['x-client-token'];
  ctx.client.tokens = (ctx.client.tokens || []).filter(x => x !== t);
  if (ctx.body.endpoint) ctx.client.push = (ctx.client.push || []).filter(s => s.endpoint !== ctx.body.endpoint);
  saveDB(); return { ok: true };
});
route('POST', '/api/client/push', 'client', (ctx) => {
  const s = ctx.body.subscription;
  if (!s || !s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) fail(400, 'Abonnement invalide');
  DB.clients.forEach(c => { if (c.push) c.push = c.push.filter(x => x.endpoint !== s.endpoint); });
  ctx.client.push = (ctx.client.push || []).concat([{ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }]).slice(-5);
  saveDB(); return { ok: true };
});
route('GET', '/api/client/donnees', 'client', (ctx) => {
  const id = ctx.client.id;
  const lus = new Set(ctx.client.annoncesLues || []);
  const since = ctx.client.createdAt ? new Date(new Date(ctx.client.createdAt).getTime() - 7 * 86400000).toISOString() : '';
  return {
    ok: true, client: clientPublic(ctx.client),
    notifs: DB.notifs.filter(n => n.clientId === id).slice(-60)
      .concat(ctx.client.invite ? [] : DB.annonces.filter(a => a.at >= since).slice(-30).map(a => ({ id: a.id, titre: a.titre, corps: a.corps, image: a.image, at: a.at, type: 'annonce', lu: lus.has(a.id) })))
      .sort((a, b) => b.at.localeCompare(a.at)),
    rdvs: DB.rdvs.filter(r => r.clientId === id).slice(-30).reverse().map(rdvClientView),
    devis: DB.devis.filter(d => d.clientId === id).slice(-20).reverse(),
    inscriptions: DB.inscriptions.filter(i => i.clientId === id).slice(-30).reverse(),
    chat: DB.chats.filter(m => m.clientId === id).slice(-300),
    temoignages: DB.temoignages.filter(t => t.clientId === id).map(t => ({ id: t.id, texte: t.texte, publie: !!t.publie, at: t.at }))
  };
});
route('POST', '/api/client/notifs/lu', 'client', (ctx) => {
  DB.notifs.forEach(n => { if (n.clientId === ctx.client.id) n.lu = true; });
  ctx.client.annoncesLues = DB.annonces.slice(-60).map(a => a.id);
  saveDB(); return { ok: true };
});
route('POST', '/api/client/supprimer', 'client', (ctx) => {
  const c = ctx.client;
  if (!c.invite && !safeEqual(hashSecret(String(ctx.body.pin || ''), c.pinSalt), c.pinHash)) fail(401, 'Code secret incorrect.');
  deleteClientData(c.id);
  saveDB(); toAdmin('clientSupprime', { id: c.id });
  return { ok: true };
});
function deleteClientData(id) {
  DB.clients = DB.clients.filter(x => x.id !== id);
  DB.chats = DB.chats.filter(x => x.clientId !== id);
  DB.notifs = DB.notifs.filter(x => x.clientId !== id);
  DB.temoignages = DB.temoignages.filter(x => x.clientId !== id || x.publie);
  // Les rendez-vous et devis sont anonymisés (on garde l'historique d'activité)
  DB.rdvs.forEach(r => { if (r.clientId === id) { r.clientId = 0; r.nom = 'Compte supprimé'; r.tel = ''; r.message = ''; } });
  DB.devis.forEach(d => { if (d.clientId === id) { d.clientId = 0; d.nom = 'Compte supprimé'; d.tel = ''; } });
  DB.inscriptions.forEach(i => { if (i.clientId === id) { i.clientId = 0; i.nom = 'Compte supprimé'; i.tel = ''; } });
}

// ---------- Rendez-vous ----------
const rdvClientView = r => { const o = Object.assign({}, r); delete o.notePrivee; delete o.paiement; return o; };
route('POST', '/api/rdv', 'client', (ctx) => {
  if (ctx.client.invite) fail(403, 'Créez votre compte pour prendre rendez-vous.');
  if (!rateOk('rdv:' + ctx.ip, 10, 15 * 60000)) fail(429, 'Trop de demandes. Patientez un instant.');
  const b = ctx.body, cfg = DB.settings.coach.rdv;
  checkSlot(b.date, b.heure);
  const theme = DB.themes.find(t => t.id === Number(b.themeId));
  const format = cfg.formats.includes(b.format) ? b.format : cfg.formats[0];
  const r = {
    id: nextId(), at: nowIso(), clientId: ctx.client.id, nom: ctx.client.nom, tel: normTel(b.tel) || ctx.client.tel,
    themeId: theme ? theme.id : 0, theme: theme ? theme.nom : (str(b.theme, 80) || 'Premier échange'),
    format, date: b.date, heure: b.heure, duree: cfg.duree, message: str(b.message, 1500),
    premiere: !DB.rdvs.some(x => x.clientId === ctx.client.id && x.statut === 'honore'),
    statut: 'demande', reponse: '', infos: '', proposition: null, historique: [{ statut: 'demande', at: nowIso() }]
  };
  DB.rdvs.push(r); saveDB();
  toAdmin('rdv', r);
  return { ok: true, rdv: rdvClientView(r) };
});
route('POST', '/api/rdv/:id/annuler', 'client', (ctx) => {
  const r = findOr404(DB.rdvs, ctx.params.id, 'Rendez-vous'); ownOr403(r, ctx.client);
  if (!RDV_ACTIFS.includes(r.statut)) fail(409, 'Ce rendez-vous est déjà clôturé.');
  r.statut = 'annule'; r.annulePar = 'client'; r.historique.push({ statut: 'annule', at: nowIso(), par: 'client' });
  saveDB(); toAdmin('rdv', r);
  return { ok: true, rdv: rdvClientView(r) };
});
route('POST', '/api/rdv/:id/proposition', 'client', (ctx) => {
  const r = findOr404(DB.rdvs, ctx.params.id, 'Rendez-vous'); ownOr403(r, ctx.client);
  if (r.statut !== 'propose' || !r.proposition) fail(409, 'Aucune proposition en attente.');
  if (ctx.body.accepte) {
    r.date = r.proposition.date; r.heure = r.proposition.heure; r.proposition = null;
    r.statut = 'confirme'; r.historique.push({ statut: 'confirme', at: nowIso(), par: 'client' });
  } else {
    r.statut = 'annule'; r.annulePar = 'client'; r.proposition = null; r.historique.push({ statut: 'annule', at: nowIso(), par: 'client' });
  }
  saveDB(); toAdmin('rdv', r);
  return { ok: true, rdv: rdvClientView(r) };
});

// ---------- Devis de formation ----------
route('POST', '/api/devis', 'client', (ctx) => {
  if (ctx.client.invite) fail(403, 'Créez votre compte pour demander un devis.');
  const b = ctx.body;
  const d = {
    id: nextId(), at: nowIso(), clientId: ctx.client.id, nom: ctx.client.nom, tel: normTel(b.tel) || ctx.client.tel, email: str(b.email, 120),
    structure: str(b.structure, 100), typeStructure: str(b.typeStructure, 60), theme: str(b.theme, 120), participants: Math.max(1, Math.round(num(b.participants, 10))),
    date: isDate(b.date) ? b.date : '', duree: str(b.duree, 60), format: str(b.format, 60), lieu: str(b.lieu, 120), budget: num(b.budget),
    description: str(b.description, 2000), statut: 'nouveau', montant: 0, reponse: ''
  };
  if (!d.typeStructure || !d.theme) fail(400, 'Type de structure et thème de la formation requis.');
  if (!d.tel) fail(400, 'Un numéro de téléphone est nécessaire.');
  DB.devis.push(d); saveDB(); toAdmin('devis', d);
  return { ok: true, devis: d };
});
route('POST', '/api/devis/:id/decision', 'client', (ctx) => {
  const d = findOr404(DB.devis, ctx.params.id, 'Devis'); ownOr403(d, ctx.client);
  if (d.statut !== 'propose') fail(409, 'Aucune proposition en attente.');
  d.statut = ctx.body.accepte ? 'accepte' : 'refuse'; d.decisionAt = nowIso(); saveDB(); toAdmin('devis', d);
  return { ok: true, devis: d };
});

// ---------- Ateliers / événements ----------
route('POST', '/api/evenements/:id/inscription', 'client', (ctx) => {
  if (ctx.client.invite) fail(403, 'Créez votre compte pour vous inscrire.');
  const e = findOr404(DB.evenements, ctx.params.id, 'Atelier');
  if (!e.actif || e.date < today()) fail(409, 'Les inscriptions sont fermées.');
  if (DB.inscriptions.some(i => i.evenementId === e.id && i.clientId === ctx.client.id && i.statut !== 'annulee')) fail(409, 'Vous êtes déjà inscrit(e) à cet atelier.');
  const places = Math.max(1, Math.min(10, Math.round(num(ctx.body.places, 1))));
  const ev = evenementPublic(e);
  if (ev.restantes !== null && ev.restantes < places) fail(409, ev.restantes ? `Il ne reste que ${ev.restantes} place(s).` : 'Cet atelier est complet.');
  const i = { id: nextId(), at: nowIso(), evenementId: e.id, titre: e.titre, date: e.date, clientId: ctx.client.id, nom: ctx.client.nom, tel: normTel(ctx.body.tel) || ctx.client.tel, places, note: str(ctx.body.note, 400), statut: 'inscrit' };
  DB.inscriptions.push(i); saveDB();
  toAdmin('inscription', i); toPublic('site', {});
  return { ok: true, inscription: i };
});
route('POST', '/api/inscriptions/:id/annuler', 'client', (ctx) => {
  const i = findOr404(DB.inscriptions, ctx.params.id, 'Inscription'); ownOr403(i, ctx.client);
  if (i.statut === 'annulee') fail(409, 'Déjà annulée.');
  i.statut = 'annulee'; saveDB(); toAdmin('inscription', i); toPublic('site', {});
  return { ok: true, inscription: i };
});

// ---------- Témoignage (modéré avant publication) ----------
route('POST', '/api/temoignages', 'client', (ctx) => {
  if (ctx.client.invite) fail(403, 'Créez votre compte pour laisser un témoignage.');
  if (!rateOk('tem:' + ctx.ip, 5, 60 * 60000)) fail(429, 'Merci ! Patientez avant d’en envoyer un autre.');
  const texte = str(ctx.body.texte, 1200);
  if (texte.length < 20) fail(400, 'Votre témoignage est un peu court.');
  const t = { id: nextId(), at: nowIso(), clientId: ctx.client.id, nom: ctx.body.anonyme ? 'Anonyme' : str(ctx.body.nom, 60) || ctx.client.nom.split(' ')[0], texte, theme: str(ctx.body.theme, 80), publie: false, source: 'site' };
  DB.temoignages.push(t); saveDB(); toAdmin('temoignage', t);
  return { ok: true };
});

// ---------- Discussion en direct ----------
const lastAuto = new Map();
route('POST', '/api/client/chat', 'client', (ctx) => {
  if (!rateOk('chat:' + ctx.ip, 40, 60000)) fail(429, 'Doucement, patientez quelques secondes.');
  const texte = str(ctx.body.texte, 1500);
  if (!texte) fail(400, 'Message vide');
  const cible = ctx.body.cible === 'coach' ? 'coach' : 'equipe';
  const m = { id: nextId(), clientId: ctx.client.id, de: 'client', texte, cible, at: nowIso(), lu: false };
  DB.chats.push(m); saveDB();
  toAdmin('chat', Object.assign({ clientNom: ctx.client.nom, clientTel: ctx.client.tel, invite: !!ctx.client.invite }, m));
  toClient(ctx.client.id, 'chat', m);
  // Réponse automatique si personne n'est connecté (au plus une fois toutes les 6 h)
  if (!adminStreams.size && Date.now() - (lastAuto.get(ctx.client.id) || 0) > 6 * 3600000) {
    lastAuto.set(ctx.client.id, Date.now());
    const c = DB.settings.coach;
    const auto = { id: nextId(), clientId: ctx.client.id, de: 'equipe', auteur: c.nom, role: 'auto', auto: true, at: nowIso(), lu: true,
      texte: `Merci pour votre message 🙏 Nous ne sommes pas connectés pour le moment, mais nous vous répondrons ici dès que possible.${c.tel ? ' En cas d’urgence, appelez le ' + c.tel + '.' : ''}` };
    setTimeout(() => { DB.chats.push(auto); saveDB(); toClient(ctx.client.id, 'chat', auto); }, 1200);
  }
  return { ok: true, message: m };
});

// ---------- Flux temps réel membre ----------
route('GET', '/api/stream/client', 'stream-client', (ctx) => {
  const { req, res, client } = ctx;
  sseOpen(req, res);
  if (!clientStreams.has(client.id)) clientStreams.set(client.id, new Set());
  clientStreams.get(client.id).add(res);
  sseSend(res, 'presence', presence());
  req.on('close', () => { const s = clientStreams.get(client.id); if (s) { s.delete(res); if (!s.size) clientStreams.delete(client.id); } });
  return 'STREAM';
});

// ============================================================
// ROUTES — ESPACE COACH (coach + assistant(e)s)
// ============================================================
route('GET', '/api/session', null, (ctx) => {
  const u = getUser(ctx.req);
  return { loggedIn: !!u, user: u ? userView(u) : null, setupDone: DB.settings.setupDone, nom: DB.settings.coach.nom };
});
route('POST', '/api/setup', null, (ctx) => {
  if (DB.settings.setupDone) fail(403, 'La configuration a déjà été effectuée.');
  const u = str(ctx.body.username, 40), p = String(ctx.body.password || '');
  if (!u || p.length < 6) fail(400, 'Identifiant et mot de passe (6 caractères minimum) requis.');
  const salt = makeSalt();
  const user = { id: nextId(), username: u, nom: str(ctx.body.nom, 60) || DB.settings.coach.nom, role: 'coach', pwSalt: salt, pwHash: hashSecret(p, salt), actif: true, createdAt: nowIso() };
  DB.settings.users.push(user); DB.settings.setupDone = true;
  if (ctx.body.coachNom) DB.settings.coach.nom = str(ctx.body.coachNom, 60);
  saveDB(); openSession(ctx.req, ctx.res, user);
  return { ok: true, user: userView(user) };
});
route('POST', '/api/login', null, (ctx) => {
  if (!rateOk('login:' + ctx.ip, 8, 15 * 60000)) fail(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
  const name = str(ctx.body.username, 40).toLowerCase();
  const u = DB.settings.users.find(x => x.username.toLowerCase() === name && x.actif !== false);
  const ok = safeEqual(hashSecret(ctx.body.password || '', u ? u.pwSalt : 'x'), u ? u.pwHash : '');
  if (!u || !ok) fail(401, 'Identifiant ou mot de passe incorrect');
  openSession(ctx.req, ctx.res, u);
  return { ok: true, user: userView(u) };
});
route('POST', '/api/logout', null, (ctx) => {
  const sid = parseCookies(ctx.req).sid; if (sid) sessions.delete(sid);
  ctx.res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Max-Age=0');
  return { ok: true };
});

route('GET', '/api/admin/bootstrap', 'admin', (ctx) => {
  const s = DB.settings;
  const coachOnly = ctx.user.role === 'coach';
  return {
    ok: true, me: userView(ctx.user), presence: presence(),
    coach: s.coach, users: coachOnly ? s.users.map(userView) : [],
    themes: DB.themes, banners: DB.banners, evenements: DB.evenements.map(evenementPublic), inscriptions: DB.inscriptions.slice(-1000),
    temoignages: DB.temoignages, ressources: DB.ressources,
    rdvs: DB.rdvs.slice(-2000), devis: DB.devis.slice(-500), chats: DB.chats.slice(-5000),
    clients: DB.clients.map(adminClientView).map(c => coachOnly ? c : Object.assign(c, { notePrivee: '' })),
    annonces: DB.annonces.slice(-50).reverse(), programmes: DB.programmes, now: localParts(TZ())
  };
});
route('GET', '/api/stream/admin', 'admin', (ctx) => {
  sseOpen(ctx.req, ctx.res); adminStreams.set(ctx.res, ctx.user.id);
  pushPresence();
  ctx.req.on('close', () => { adminStreams.delete(ctx.res); pushPresence(); });
  return 'STREAM';
});
route('POST', '/api/admin/upload', 'admin', (ctx) => ({ ok: true, url: saveImage(ctx.body.dataUrl) }));

// ---------- Profil du coach, contacts, réseaux sociaux, agenda ----------
route('PUT', '/api/admin/coach', 'admin', (ctx) => {
  const c = DB.settings.coach, b = ctx.body;
  const coachOnly = ['nom', 'marque', 'slogan', 'titreBio', 'bio', 'citation', 'photo', 'chiffres', 'valeurs', 'fuseau', 'rdv', 'faq', 'reseaux', 'tel', 'whatsapp', 'email', 'adresse', 'horaires'];
  if (ctx.user.role !== 'coach' && coachOnly.some(k => b[k] !== undefined)) fail(403, 'Réservé au coach.');
  ['nom', 'marque', 'slogan', 'tel', 'whatsapp', 'email', 'adresse', 'horaires', 'fuseau', 'titreBio', 'citation'].forEach(k => { if (b[k] !== undefined) c[k] = str(b[k], 300); });
  if (b.bio !== undefined) c.bio = str(b.bio, 5000);
  setImage(c, 'photo', b.photo);
  if (b.disponible !== undefined) c.disponible = !!b.disponible;
  if (b.chiffres !== undefined) c.chiffres = (Array.isArray(b.chiffres) ? b.chiffres : []).slice(0, 6).map(x => ({ valeur: str(x.valeur, 20), libelle: str(x.libelle, 60) })).filter(x => x.valeur || x.libelle);
  if (b.valeurs !== undefined) c.valeurs = (Array.isArray(b.valeurs) ? b.valeurs : []).slice(0, 8).map(x => str(x, 80)).filter(Boolean);
  if (b.faq !== undefined) c.faq = (Array.isArray(b.faq) ? b.faq : []).slice(0, 30).map(x => ({ q: str(x.q, 200), r: str(x.r, 1500) })).filter(x => x.q && x.r);
  if (b.reseaux !== undefined) {
    Object.keys(c.reseaux).forEach(k => {
      if (b.reseaux[k] === undefined) return;
      let v = str(b.reseaux[k], 300);
      if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
      c.reseaux[k] = v;
    });
  }
  if (b.rdv !== undefined) {
    const r = c.rdv, x = b.rdv;
    if (x.duree !== undefined) r.duree = Math.max(15, Math.min(240, Math.round(num(x.duree, 60))));
    if (x.jours !== undefined) r.jours = (Array.isArray(x.jours) ? x.jours : []).map(Number).filter(d => d >= 0 && d <= 6);
    if (x.creneaux !== undefined) r.creneaux = [...new Set((Array.isArray(x.creneaux) ? x.creneaux : []).filter(isTime))].sort();
    if (x.delaiHeures !== undefined) r.delaiHeures = Math.max(0, Math.min(240, num(x.delaiHeures, 12)));
    if (x.horizonJours !== undefined) r.horizonJours = Math.max(7, Math.min(365, Math.round(num(x.horizonJours, 45))));
    if (x.formats !== undefined) { const f = (Array.isArray(x.formats) ? x.formats : []).map(v => str(v, 60)).filter(Boolean); if (f.length) r.formats = f.slice(0, 6); }
    if (x.tarif !== undefined) r.tarif = str(x.tarif, 300);
  }
  if (b.indisponibles !== undefined) c.indisponibles = [...new Set((Array.isArray(b.indisponibles) ? b.indisponibles : []).filter(isDate))].filter(d => d >= addDays(today(), -1)).sort();
  try { new Intl.DateTimeFormat('fr', { timeZone: c.fuseau }); } catch (e) { c.fuseau = 'Africa/Abidjan'; }
  saveDB(); toPublic('site', {}); pushPresence();
  return { ok: true, coach: c };
});

// ---------- Équipe (coach uniquement) ----------
route('POST', '/api/admin/users', 'coach', (ctx) => {
  const b = ctx.body, username = str(b.username, 40), p = String(b.password || '');
  if (!username || p.length < 6) fail(400, 'Identifiant et mot de passe (6 caractères minimum) requis.');
  if (DB.settings.users.some(u => u.username.toLowerCase() === username.toLowerCase())) fail(409, 'Cet identifiant existe déjà.');
  const salt = makeSalt();
  const u = { id: nextId(), username, nom: str(b.nom, 60) || username, role: b.role === 'coach' ? 'coach' : 'assistant', pwSalt: salt, pwHash: hashSecret(p, salt), actif: true, createdAt: nowIso() };
  DB.settings.users.push(u); saveDB();
  return { ok: true, user: userView(u) };
});
route('PUT', '/api/admin/users/:id', 'coach', (ctx) => {
  const u = findOr404(DB.settings.users, ctx.params.id, 'Membre'), b = ctx.body;
  if (b.nom !== undefined) u.nom = str(b.nom, 60) || u.nom;
  if (b.password) { if (String(b.password).length < 6) fail(400, 'Mot de passe trop court (6 caractères minimum).'); u.pwSalt = makeSalt(); u.pwHash = hashSecret(b.password, u.pwSalt); }
  if (b.role !== undefined || b.actif !== undefined) {
    const role = b.role !== undefined ? (b.role === 'coach' ? 'coach' : 'assistant') : u.role;
    const actif = b.actif !== undefined ? !!b.actif : u.actif !== false;
    const coachsRestants = DB.settings.users.filter(x => x.id !== u.id && x.role === 'coach' && x.actif !== false).length;
    if ((role !== 'coach' || !actif) && !coachsRestants) fail(409, 'Il faut garder au moins un compte coach actif.');
    u.role = role; u.actif = actif;
  }
  saveDB(); return { ok: true, user: userView(u) };
});
route('POST', '/api/admin/securite', 'admin', (ctx) => {
  const u = ctx.user, b = ctx.body;
  if (!safeEqual(hashSecret(b.currentPassword || '', u.pwSalt), u.pwHash)) fail(401, 'Mot de passe actuel incorrect');
  if (b.newUsername) {
    const n = str(b.newUsername, 40);
    if (DB.settings.users.some(x => x !== u && x.username.toLowerCase() === n.toLowerCase())) fail(409, 'Cet identifiant existe déjà.');
    u.username = n;
  }
  if (b.newPassword) { if (String(b.newPassword).length < 6) fail(400, 'Mot de passe trop court (6 caractères minimum).'); u.pwSalt = makeSalt(); u.pwHash = hashSecret(b.newPassword, u.pwSalt); }
  saveDB(); return { ok: true, user: userView(u) };
});

// ---------- Contenus génériques (accompagnements, bannières, ressources, ateliers, témoignages) ----------
function crud(base, coll, what, apply, opts) {
  opts = opts || {};
  route('POST', '/api/admin/' + base, 'admin', (ctx) => {
    const o = Object.assign({ id: nextId(), actif: true, ordre: DB[coll].length + 1, at: nowIso() }, opts.defaults ? opts.defaults() : {});
    apply(o, ctx.body, true);
    if (ctx.body.actif !== undefined) o.actif = !!ctx.body.actif;
    if (opts.validate) opts.validate(o);
    DB[coll].push(o); saveDB(); toPublic('site', {});
    return { ok: true, item: opts.view ? opts.view(o) : o };
  });
  route('PUT', '/api/admin/' + base + '/:id', 'admin', (ctx) => {
    const o = findOr404(DB[coll], ctx.params.id, what);
    apply(o, ctx.body, false);
    if (ctx.body.actif !== undefined) o.actif = !!ctx.body.actif;
    if (ctx.body.ordre !== undefined) o.ordre = num(ctx.body.ordre);
    if (opts.validate) opts.validate(o);
    saveDB(); toPublic('site', {});
    return { ok: true, item: opts.view ? opts.view(o) : o };
  });
  route('POST', '/api/admin/' + base + '/:id/delete', 'admin', (ctx) => {
    const o = findOr404(DB[coll], ctx.params.id, what);
    if (opts.beforeDelete) opts.beforeDelete(o);
    DB[coll] = DB[coll].filter(x => x !== o);
    ['image', 'photo'].forEach(k => removeImage(o[k]));
    saveDB(); toPublic('site', {});
    return { ok: true };
  });
}
const COULEURS = ['nuit', 'bleu', 'or'];
crud('themes', 'themes', 'Accompagnement', (o, b) => {
  ['nom', 'accroche', 'publicCible'].forEach(k => { if (b[k] !== undefined) o[k] = str(b[k], 160); });
  if (b.description !== undefined) o.description = str(b.description, 2000);
  if (b.couleur !== undefined) o.couleur = COULEURS.includes(b.couleur) ? b.couleur : 'bleu';
  setImage(o, 'image', b.image);
}, { defaults: () => ({ nom: '', accroche: '', description: '', publicCible: '', couleur: 'bleu', image: '' }), validate: o => { if (!o.nom) fail(400, 'Nom requis'); } });
crud('banners', 'banners', 'Bannière', (o, b) => {
  ['surtitre', 'titre', 'texte', 'lien'].forEach(k => { if (b[k] !== undefined) o[k] = str(b[k], 200); });
  if (b.couleur !== undefined) o.couleur = COULEURS.includes(b.couleur) ? b.couleur : 'nuit';
  if (b.themeId !== undefined) o.themeId = Number(b.themeId) || 0;
  setImage(o, 'image', b.image);
}, { defaults: () => ({ surtitre: '', titre: '', texte: '', couleur: 'nuit', lien: 'rdv', themeId: 0, image: '' }), validate: o => { if (!o.image && !o.titre) fail(400, 'Ajoutez une image ou un titre'); } });
crud('ressources', 'ressources', 'Ressource', (o, b) => {
  ['titre', 'categorie', 'duree', 'resume', 'video'].forEach(k => { if (b[k] !== undefined) o[k] = str(b[k], 300); });
  if (b.contenu !== undefined) o.contenu = str(b.contenu, 20000);
  setImage(o, 'image', b.image);
}, { defaults: () => ({ titre: '', categorie: 'Réflexion', duree: '', resume: '', contenu: '', video: '', image: '' }), validate: o => { if (!o.titre) fail(400, 'Titre requis'); } });
crud('evenements', 'evenements', 'Atelier', (o, b) => {
  ['titre', 'lieu', 'prix', 'format', 'public'].forEach(k => { if (b[k] !== undefined) o[k] = str(b[k], 160); });
  if (b.description !== undefined) o.description = str(b.description, 3000);
  if (b.date !== undefined) o.date = isDate(b.date) ? b.date : '';
  if (b.heure !== undefined) o.heure = isTime(b.heure) ? b.heure : '';
  if (b.places !== undefined) o.places = Math.max(0, Math.round(num(b.places)));
  setImage(o, 'image', b.image);
}, { defaults: () => ({ titre: '', date: '', heure: '', lieu: '', format: 'Présentiel', public: '', prix: '', places: 0, description: '', image: '' }), view: evenementPublic,
  validate: o => { if (!o.titre || !o.date) fail(400, 'Titre et date requis'); },
  beforeDelete: o => { if (DB.inscriptions.some(i => i.evenementId === o.id && i.statut !== 'annulee')) fail(409, 'Des personnes sont inscrites : masquez l’atelier plutôt que de le supprimer.'); } });
crud('temoignages', 'temoignages', 'Témoignage', (o, b, isNew) => {
  ['nom', 'theme'].forEach(k => { if (b[k] !== undefined) o[k] = str(b[k], 80); });
  if (b.texte !== undefined) o.texte = str(b.texte, 1500);
  if (b.publie !== undefined) o.publie = !!b.publie;
  if (isNew) { o.source = 'coach'; o.clientId = 0; }
}, { defaults: () => ({ nom: '', texte: '', theme: '', publie: true }), validate: o => { if (!o.texte) fail(400, 'Texte requis'); if (!o.nom) o.nom = 'Anonyme'; } });

// ---------- Rendez-vous ----------
const RDV_MSG = {
  confirme: 'Rendez-vous confirmé', refuse: 'Rendez-vous non disponible', annule: 'Rendez-vous annulé', propose: 'Nouvel horaire proposé'
};
route('POST', '/api/admin/rdv/:id', 'admin', (ctx) => {
  const r = findOr404(DB.rdvs, ctx.params.id, 'Rendez-vous'), b = ctx.body;
  const st = b.statut;
  if (!['confirme', 'refuse', 'annule', 'honore', 'absent', 'propose'].includes(st)) fail(400, 'Statut invalide');
  if (st === 'propose') {
    checkSlot(b.date, b.heure, r.id);
    r.proposition = { date: b.date, heure: b.heure };
  }
  if (st === 'confirme' && r.statut === 'propose') r.proposition = null;
  r.statut = st; r.historique.push({ statut: st, at: nowIso(), par: ctx.user.nom });
  if (b.reponse !== undefined) r.reponse = str(b.reponse, 800);
  if (b.infos !== undefined) r.infos = str(b.infos, 500);
  if (st === 'annule') r.annulePar = 'coach';
  if (st === 'honore' && b.paiement) r.paiement = { montant: Math.max(0, num(b.paiement.montant)), mode: str(b.paiement.mode, 30), at: nowIso() };
  saveDB();
  const quand = `${dmy(r.date)} à ${r.heure}`;
  if (st === 'confirme') notifyClient(r.clientId, RDV_MSG.confirme, `${quand} · ${r.format}${r.infos ? ' — ' + r.infos : ''}${r.reponse ? ' — ' + r.reponse : ''}`, { type: 'rdv', ref: r.id });
  if (st === 'refuse' || st === 'annule') notifyClient(r.clientId, RDV_MSG[st], `${quand}${r.reponse ? ' — ' + r.reponse : ''}`, { type: 'rdv', ref: r.id });
  if (st === 'propose') notifyClient(r.clientId, RDV_MSG.propose, `Le coach vous propose le ${dmy(r.proposition.date)} à ${r.proposition.heure}. Ouvrez votre espace pour accepter.${r.reponse ? ' — ' + r.reponse : ''}`, { type: 'rdv', ref: r.id });
  toClient(r.clientId, 'rdv', rdvClientView(r)); toAdmin('rdv', r);
  return { ok: true, rdv: r };
});
route('PUT', '/api/admin/rdv/:id/note', 'coach', (ctx) => {
  const r = findOr404(DB.rdvs, ctx.params.id, 'Rendez-vous');
  r.notePrivee = str(ctx.body.notePrivee, 5000); saveDB();
  return { ok: true, rdv: r };
});
route('PUT', '/api/admin/rdv/:id/paiement', 'admin', (ctx) => {
  const r = findOr404(DB.rdvs, ctx.params.id, 'Rendez-vous');
  const m = Math.max(0, num(ctx.body.montant));
  r.paiement = m ? { montant: m, mode: str(ctx.body.mode, 30), at: (r.paiement && r.paiement.at) || nowIso() } : null;
  saveDB(); toAdmin('rdv', r);
  return { ok: true, rdv: r };
});
// Rendez-vous pris par téléphone / WhatsApp, saisi par le coach ou l'assistant(e)
route('POST', '/api/admin/rdv', 'admin', (ctx) => {
  const b = ctx.body;
  if (!isDate(b.date) || !isTime(b.heure)) fail(400, 'Date et heure requises.');
  if (slotTaken(b.date, b.heure) && !b.forcer) fail(409, 'Ce créneau est déjà pris.');
  const nom = str(b.nom, 60); if (!nom) fail(400, 'Nom requis');
  const theme = DB.themes.find(t => t.id === Number(b.themeId));
  let clientId = Number(b.clientId) || 0;
  const tel = normTel(b.tel);
  if (!clientId && tel) { const c = DB.clients.find(x => x.tel === tel && !x.invite); if (c) clientId = c.id; }
  const r = { id: nextId(), at: nowIso(), clientId, nom, tel, themeId: theme ? theme.id : 0, theme: theme ? theme.nom : (str(b.theme, 80) || 'Séance'),
    format: str(b.format, 60) || DB.settings.coach.rdv.formats[0], date: b.date, heure: b.heure, duree: DB.settings.coach.rdv.duree, message: str(b.message, 1500),
    statut: 'confirme', reponse: '', infos: str(b.infos, 500), proposition: null, source: 'coach', historique: [{ statut: 'confirme', at: nowIso(), par: ctx.user.nom }] };
  DB.rdvs.push(r); saveDB(); toAdmin('rdv', r);
  if (clientId) { notifyClient(clientId, RDV_MSG.confirme, `${dmy(r.date)} à ${r.heure} · ${r.format}`, { type: 'rdv', ref: r.id }); toClient(clientId, 'rdv', rdvClientView(r)); }
  return { ok: true, rdv: r };
});

// ---------- Devis ----------
route('POST', '/api/admin/devis/:id', 'admin', (ctx) => {
  const d = findOr404(DB.devis, ctx.params.id, 'Devis');
  const st = ctx.body.statut;
  if (!['propose', 'refuse', 'termine'].includes(st)) fail(400, 'Statut invalide');
  d.statut = st;
  if (ctx.body.montant !== undefined) d.montant = num(ctx.body.montant);
  if (ctx.body.reponse !== undefined) d.reponse = str(ctx.body.reponse, 3000);
  if (st === 'termine') d.termineAt = nowIso();
  saveDB();
  if (st === 'propose') notifyClient(d.clientId, 'Votre devis de formation est prêt', `${d.theme} : ${d.montant.toLocaleString('fr-FR')} F CFA. Ouvrez votre espace pour l’accepter.`, { type: 'devis', ref: d.id });
  if (st === 'refuse') notifyClient(d.clientId, 'Réponse à votre demande de devis', d.reponse || 'Nous ne pouvons pas donner suite à cette demande pour le moment.', { type: 'devis', ref: d.id });
  toClient(d.clientId, 'devis', d); toAdmin('devis', d);
  return { ok: true, devis: d };
});

// ---------- Inscriptions aux ateliers ----------
route('POST', '/api/admin/inscriptions/:id', 'admin', (ctx) => {
  const i = findOr404(DB.inscriptions, ctx.params.id, 'Inscription');
  const st = ctx.body.statut;
  if (!['inscrit', 'confirme', 'annulee', 'present'].includes(st)) fail(400, 'Statut invalide');
  i.statut = st; if (ctx.body.montant !== undefined) i.montant = Math.max(0, num(ctx.body.montant));
  saveDB();
  if (st === 'confirme') notifyClient(i.clientId, 'Inscription confirmée', `${i.titre} — ${dmy(i.date)}. À bientôt !`, { type: 'atelier', ref: i.id });
  if (st === 'annulee') notifyClient(i.clientId, 'Inscription annulée', `${i.titre} — ${dmy(i.date)}.${ctx.body.message ? ' ' + str(ctx.body.message, 300) : ''}`, { type: 'atelier', ref: i.id });
  toClient(i.clientId, 'inscription', i); toAdmin('inscription', i); toPublic('site', {});
  return { ok: true, inscription: i };
});

// ---------- Discussion ----------
route('POST', '/api/admin/chat/:clientId', 'admin', (ctx) => {
  const cl = findOr404(DB.clients, ctx.params.clientId, 'Personne');
  const texte = str(ctx.body.texte, 1500); if (!texte) fail(400, 'Message vide');
  const m = { id: nextId(), clientId: cl.id, de: 'equipe', auteur: ctx.user.nom, role: ctx.user.role, texte, at: nowIso(), lu: false };
  DB.chats.push(m);
  DB.chats.forEach(x => { if (x.clientId === cl.id && x.de === 'client') x.lu = true; });
  saveDB();
  toClient(cl.id, 'chat', m); toAdmin('chat', Object.assign({ clientNom: cl.nom, clientTel: cl.tel, invite: !!cl.invite }, m));
  sendPush(cl, { title: ctx.user.nom, body: texte, tag: 'chat', url: '/?espace=chat' });
  return { ok: true, message: m };
});
route('POST', '/api/admin/chat/:clientId/lu', 'admin', (ctx) => {
  DB.chats.forEach(x => { if (x.clientId === Number(ctx.params.clientId) && x.de === 'client') x.lu = true; }); saveDB();
  toAdmin('chatLu', { clientId: Number(ctx.params.clientId) });
  return { ok: true };
});

// ---------- Personnes accompagnées ----------
route('PUT', '/api/admin/clients/:id', 'coach', (ctx) => {
  const c = findOr404(DB.clients, ctx.params.id, 'Personne');
  if (ctx.body.notePrivee !== undefined) c.notePrivee = str(ctx.body.notePrivee, 10000);
  if (ctx.body.nom !== undefined) c.nom = str(ctx.body.nom, 60) || c.nom;
  saveDB(); return { ok: true, client: adminClientView(c) };
});
route('POST', '/api/admin/clients/:id/delete', 'coach', (ctx) => {
  const c = findOr404(DB.clients, ctx.params.id, 'Personne');
  deleteClientData(c.id); saveDB();
  return { ok: true };
});

// ---------- Messages à toutes les personnes inscrites ----------
route('POST', '/api/admin/annonces', 'admin', (ctx) => {
  const titre = str(ctx.body.titre, 80), corps = str(ctx.body.corps, 500);
  if (!titre || !corps) fail(400, 'Titre et message requis');
  const r = broadcast(fillTemplate(titre), fillTemplate(corps));
  return { ok: true, annonce: r.annonce, pushes: r.pushes, enLigne: clientStreams.size };
});
function applyProg(p, b) {
  if (b.titre !== undefined) p.titre = str(b.titre, 80);
  if (b.corps !== undefined) p.corps = str(b.corps, 500);
  if (b.heure !== undefined) { if (!isTime(b.heure)) fail(400, 'Heure invalide'); p.heure = b.heure; }
  if (b.jours !== undefined) p.jours = (Array.isArray(b.jours) ? b.jours : []).map(Number).filter(d => d >= 0 && d <= 6);
  if (b.actif !== undefined) p.actif = !!b.actif;
}
route('POST', '/api/admin/programmes', 'admin', (ctx) => {
  const p = { id: nextId(), titre: '', corps: '', heure: '07:00', jours: [0, 1, 2, 3, 4, 5, 6], actif: true, dernierEnvoi: '' };
  applyProg(p, ctx.body);
  if (!p.titre || !p.corps) fail(400, 'Titre et message requis');
  const lp = localParts(TZ()); if (lp.time > p.heure) p.dernierEnvoi = lp.date;
  DB.programmes.push(p); saveDB(); return { ok: true, programme: p };
});
route('PUT', '/api/admin/programmes/:id', 'admin', (ctx) => {
  const p = findOr404(DB.programmes, ctx.params.id, 'Message');
  const wasOff = !p.actif; applyProg(p, ctx.body);
  const lp = localParts(TZ());
  if ((ctx.body.heure !== undefined || (wasOff && p.actif)) && lp.time > p.heure) p.dernierEnvoi = lp.date;
  saveDB(); return { ok: true, programme: p };
});
route('POST', '/api/admin/programmes/:id/delete', 'admin', (ctx) => {
  DB.programmes = DB.programmes.filter(p => p.id !== Number(ctx.params.id)); saveDB(); return { ok: true };
});
route('POST', '/api/admin/programmes/:id/envoyer', 'admin', (ctx) => {
  const p = findOr404(DB.programmes, ctx.params.id, 'Message');
  const r = broadcast(fillTemplate(p.titre), fillTemplate(p.corps));
  return { ok: true, pushes: r.pushes };
});

// ============================================================
// SERVEUR
// ============================================================
const server = http.createServer(async (req, res) => {
  let parsed;
  try { parsed = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  let urlPath;
  try { urlPath = decodeURIComponent(parsed.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  try {
    if (urlPath.startsWith('/api/')) {
      const r = routes.find(x => x.method === req.method && x.re.test(urlPath));
      if (!r) return sendJSON(res, 404, { ok: false, error: 'Route inconnue' });
      const m = r.re.exec(urlPath); const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      const ctx = { req, res, params, query: parsed.searchParams, ip, body: {} };
      if (r.auth === 'admin' || r.auth === 'coach') {
        ctx.user = getUser(req);
        if (!ctx.user) return sendJSON(res, 401, { ok: false, error: 'Non authentifié' });
        if (r.auth === 'coach' && ctx.user.role !== 'coach') return sendJSON(res, 403, { ok: false, error: 'Réservé au coach.' });
      }
      if (r.auth === 'client' || r.auth === 'stream-client') {
        ctx.client = getClient(req, r.auth === 'stream-client' ? parsed.searchParams : null);
        if (!ctx.client) return sendJSON(res, 401, { ok: false, error: 'Session expirée, reconnectez-vous.' });
      }
      if (req.method === 'POST' || req.method === 'PUT') ctx.body = await readBody(req);
      const out = await r.handler(ctx);
      if (out === 'STREAM') return;
      return sendJSON(res, 200, out);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (urlPath.startsWith('/uploads/')) return serveFile(res, path.join(UPLOAD_DIR, path.basename(urlPath)), true);
    const safe = urlPath === '/' ? '/index.html' : urlPath === '/coach' || urlPath === '/gestion' ? '/gestion.html' : urlPath;
    const fp = path.normalize(path.join(PUBLIC_DIR, safe));
    if (!fp.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    return serveFile(res, fp, /^\/(vendor|fonts|img)\//.test(safe));
  } catch (e) {
    if (e instanceof HttpError) return sendJSON(res, e.status, { ok: false, error: e.message });
    console.error(e);
    if (!res.headersSent) sendJSON(res, 500, { ok: false, error: 'Erreur serveur' });
  }
});

loadDB();
backupIfNeeded();
setInterval(backupIfNeeded, 6 * 3600 * 1000);

server.listen(PORT, () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(l => (l || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); }));
  console.log('');
  console.log('==========================================================');
  console.log('   ' + DB.settings.coach.nom + ' — serveur démarré (port ' + PORT + ')');
  console.log('   Site public  : http://localhost:' + PORT);
  console.log('   Espace coach : http://localhost:' + PORT + '/gestion.html');
  ips.forEach(ip => console.log('   Sur le Wi-Fi : http://' + ip + ':' + PORT));
  console.log('==========================================================');
  if (!DB.settings.setupDone) console.log('   Première utilisation : ouvrez /gestion.html pour créer l’accès du coach.');
  console.log('');
});
