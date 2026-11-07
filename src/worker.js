import { BASE, MODES, contexte, CARNET_CONSIGNES } from "./prompt.js";

// Prix en dollars par million de jetons (vérifiés le 03/11/2026 ; à mettre à jour si Anthropic change ses tarifs).
const MODELES = {
  sonnet: { id: "claude-sonnet-5-5", nom: "Sonnet 5.5", input: 2.0, output: 10.0, cache_write: 2.5, cache_read: 0.1 },
  haiku: { id: "claude-haiku-5-5", nom: "Haiku 5.5", input: 0.1, output: 0.5, cache_write: 0.125, cache_read: 0.01 },
};
const MATIERES = [
  "Maths", "Français", "Histoire-géo / EMC", "SES", "Philosophie", "Physique-chimie", "SVT",
  "Anglais", "Espagnol", "Allemand", "Technologie", "Enseignement scientifique", "Culture générale", "Orientation", "Autre",
];
const ENFANTS = ["olivia", "emilio", "raminta", "corentin"]; // comptes élèves
const NIVEAUX = { raminta: ["3e", "Terminale", "Adulte"], corentin: ["3e", "Terminale", "Adulte"] }; // comptes qui choisissent le niveau à chaque discussion
const HISTORIQUE_MAX = 20; // messages renvoyés à Claude
const PHOTOS_RECENTES = 4; // photos renvoyées en image (les plus anciennes sont résumées par un texte)
const IMAGE_MAX_CHARS = 2_500_000; // ~1,8 Mo en base64

// ---------- utilitaires ----------
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const err = (status, message) => json({ error: message }, status);

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
function randomHex(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return hex(a);
}
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return hex(bits);
}
async function egal(a, b) {
  // comparaison à temps constant via empreintes
  const [ha, hb] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let d = 0;
  for (let i = 0; i < ha.length; i++) d |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return d === 0;
}

function jourParis(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function lundiParis(d = new Date()) {
  const [y, m, j] = jourParis(d).split("-").map(Number);
  const t = Date.UTC(y, m - 1, j);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // lundi = 0
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

function cookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

async function session(req, env) {
  const tok = cookie(req, "sid");
  if (!tok) return null;
  const row = await env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").bind(await sha256(tok)).first();
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.user_id, parent: row.user_id === "parent" };
}

async function ouvrirSession(env, userId) {
  const tok = randomHex();
  const duree = userId === "parent" ? 14 : 90; // jours
  const exp = Date.now() + duree * 86400000;
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(tok), userId, exp).run();
  return `sid=${tok}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${duree * 86400}`;
}

function cout(m, u) {
  const p = MODELES[m];
  const v =
    ((u.input_tokens || 0) * p.input +
      (u.output_tokens || 0) * p.output +
      (u.cache_creation_input_tokens || 0) * p.cache_write +
      (u.cache_read_input_tokens || 0) * p.cache_read) / 1e6;
  const recherches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return Math.round((v + recherches * 0.01) * 1e6) / 1e6;
}

async function coutSemaine(env) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd),0) AS c FROM messages WHERE week_paris = ?").bind(lundiParis()).first();
  return r.c;
}

async function modeleActif(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'model_mode'").first();
  const mode = r ? r.value : "auto";
  if (mode === "sonnet" || mode === "haiku") return { modele: mode, mode };
  const budget = Number(env.BUDGET_SEMAINE_USD || 5);
  return { modele: (await coutSemaine(env)) >= budget ? "haiku" : "sonnet", mode };
}

async function questionsAujourdhui(env, userId) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND role = 'user' AND day_paris = ?")
    .bind(userId, jourParis()).first();
  return r.n;
}

async function peutVoirConv(env, s, convId) {
  const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?").bind(convId).first();
  if (!conv) return null;
  if (!s.parent && conv.user_id !== s.id) return null;
  return conv;
}

// ---------- progression (XP, niveau, série) ----------
const NIVEAUX_XP = [
  [0, "Apprenti"], [100, "Disciple"], [300, "Penseur"], [600, "Philosophe"],
  [1000, "Maître"], [1600, "Sage"], [2500, "Oracle de Delphes"],
];
async function stats(env, userId) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) FILTER (WHERE role='user') AS q,
            COUNT(*) FILTER (WHERE role='assistant' AND content LIKE '%🎉%') AS reussites
       FROM messages WHERE user_id = ?`
  ).bind(userId).first();
  const xp = r.q * 10 + r.reussites * 25;
  let i = 0;
  while (i + 1 < NIVEAUX_XP.length && xp >= NIVEAUX_XP[i + 1][0]) i++;
  const [bas, nom] = NIVEAUX_XP[i];
  const haut = NIVEAUX_XP[i + 1] ? NIVEAUX_XP[i + 1][0] : null;
  const jours = (await env.DB.prepare(
    "SELECT DISTINCT day_paris AS d FROM messages WHERE user_id = ? AND role = 'user' ORDER BY d DESC LIMIT 400"
  ).bind(userId).all()).results.map((x) => x.d);
  // série : jours consécutifs jusqu'à aujourd'hui (ou hier, si pas encore travaillé aujourd'hui)
  let serie = 0;
  const auj = jourParis();
  const hier = jourParis(new Date(Date.now() - 86400000));
  if (jours[0] === auj || jours[0] === hier) {
    let attendu = new Date(jours[0] + "T12:00:00Z");
    for (const d of jours) {
      if (d !== attendu.toISOString().slice(0, 10)) break;
      serie++;
      attendu = new Date(attendu.getTime() - 86400000);
    }
  }
  return { xp, niveau: nom, rang: i + 1, bas, haut, reussites: r.reussites, serie, aujourdhui_fait: jours[0] === auj };
}

async function correctionLibre(env, userId) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind("correction_" + userId).first();
  return r ? r.value === "1" : false;
}

// ---------- carnet de suivi ----------
async function lireCarnet(env, userId) {
  const r = await env.DB.prepare("SELECT content FROM notebooks WHERE user_id = ?").bind(userId).first();
  return r ? r.content : "";
}

async function appelAPI(env, body) {
  const base = env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const res = await fetch(base + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

// Après chaque réponse : Haiku réécrit le carnet à partir du carnet actuel et des derniers échanges.
async function majCarnet(env, user, conv) {
  try {
    const ancien = await lireCarnet(env, user.id);
    const rows = (await env.DB.prepare(
      "SELECT role, content, has_image FROM messages WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 8"
    ).bind(conv.id).all()).results.reverse();
    const echanges = rows.map((r) => (r.role === "user" ? "ÉLÈVE" : "SOCRATE") + " : " + (r.has_image ? "[photo] " : "") + r.content).join("\n\n");
    const jour = jourParis();
    const data = await appelAPI(env, {
      model: MODELES.haiku.id,
      max_tokens: 900,
      system: CARNET_CONSIGNES,
      messages: [{
        role: "user",
        content: `Élève : ${user.display}. Date : ${jour}. Discussion : ${MODES[conv.mode] || conv.mode}, ${conv.subject}.\n\n<carnet_actuel>\n${ancien || "(vide)"}\n</carnet_actuel>\n\n<derniers_echanges>\n${echanges}\n</derniers_echanges>`,
      }],
    });
    const texte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const now = new Date().toISOString();
    if (texte.length >= 20 && !texte.startsWith("INCHANG")) await env.DB.prepare("INSERT INTO notebooks (user_id, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at")
      .bind(user.id, texte.slice(0, 6000), now).run();
    const u = data.usage || {};
    await env.DB.prepare(
      `INSERT INTO messages (conversation_id, user_id, role, content, model, input_tokens, output_tokens, cost_usd, day_paris, week_paris, created_at)
       VALUES (?, ?, 'carnet', '', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(conv.id, user.id, MODELES.haiku.id, u.input_tokens || 0, u.output_tokens || 0, cout("haiku", u), jour, lundiParis(), now).run();
  } catch (e) {
    console.error("carnet", e);
  }
}

// ---------- appel Claude ----------
async function appelerClaude(env, user, conv, modele) {
  const rows = (await env.DB.prepare(
    "SELECT id, role, content, has_image FROM messages WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT ?"
  ).bind(conv.id, HISTORIQUE_MAX).all()).results.reverse();

  // l'historique doit commencer par l'élève
  while (rows.length && rows[0].role !== "user") rows.shift();

  const avecPhoto = rows.filter((r) => r.has_image).slice(-PHOTOS_RECENTES).map((r) => r.id);
  const messages = [];
  for (const r of rows) {
    if (r.role === "user") {
      const content = [];
      if (r.has_image) {
        if (avecPhoto.includes(r.id)) {
          const img = await env.DB.prepare("SELECT media_type, data FROM images WHERE message_id = ?").bind(r.id).first();
          if (img) content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
          else content.push({ type: "text", text: "[photo envoyée plus tôt, plus disponible]" });
        } else {
          content.push({ type: "text", text: "[photo envoyée plus tôt dans la conversation]" });
        }
      }
      content.push({ type: "text", text: r.content || "(voir la photo)" });
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "assistant", content: r.content });
    }
  }

  const m = MODELES[modele];
  const body = {
    model: m.id,
    max_tokens: Number(env.MAX_TOKENS || 1500),
    output_config: { effort: "low" },
    system: [
      { type: "text", text: BASE + user.profile, cache_control: { type: "ephemeral" } },
      { type: "text", text: contexte(conv, await correctionLibre(env, user.id)) + "\n\n# Carnet de suivi de l'élève\n" + (await lireCarnet(env, user.id) || "(vide : première discussion)") },
    ],
    messages,
  };

  // Mode orientation : recherche web (calendriers Parcoursup, réformes… changent chaque année)
  let data;
  if (conv.mode === "orientation") {
    try {
      data = await appelAPI(env, { ...body, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] });
    } catch (e) {
      console.error("recherche web indisponible", e.message);
      data = await appelAPI(env, body);
    }
  } else {
    data = await appelAPI(env, body);
  }
  const texte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return { texte, usage: data.usage || {}, stop: data.stop_reason };
}

// ---------- routes ----------
async function api(req, env, url, ctx) {
  const p = url.pathname;
  const method = req.method;

  if (p === "/api/login" && method === "POST") {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    const depuis = Date.now() - 15 * 60000;
    const f = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE ip = ? AND at > ?").bind(ip, depuis).first();
    if (f.n >= 10) return err(429, "Trop d'essais. Réessaie dans 15 minutes.");
    const { who, password } = await req.json().catch(() => ({}));
    let ok = false;
    if (who === "parent") {
      ok = !!env.PARENT_PASSWORD && (await egal(password || "", env.PARENT_PASSWORD));
    } else if (ENFANTS.includes(who)) {
      const u = await env.DB.prepare("SELECT pass_hash, pass_salt FROM users WHERE id = ?").bind(who).first();
      if (u && u.pass_hash) ok = await egal(await pbkdf2(password || "", u.pass_salt), u.pass_hash);
    }
    if (!ok) {
      await env.DB.prepare("INSERT INTO login_fails (ip, at) VALUES (?, ?)").bind(ip, Date.now()).run();
      return err(401, "Mot de passe incorrect.");
    }
    return json({ ok: true }, 200, { "set-cookie": await ouvrirSession(env, who) });
  }

  const s = await session(req, env);
  if (!s) return err(401, "Non connecté.");

  if (p === "/api/logout" && method === "POST") {
    const tok = cookie(req, "sid");
    if (tok) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(tok)).run();
    return json({ ok: true }, 200, { "set-cookie": "sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (p === "/api/me") {
    if (s.parent) return json({ id: "parent", parent: true });
    const u = await env.DB.prepare("SELECT id, display FROM users WHERE id = ?").bind(s.id).first();
    return json({
      ...u, parent: false,
      aujourdhui: await questionsAujourdhui(env, s.id),
      stats: await stats(env, s.id),
      limite: Number(env.LIMITE_JOUR || 40),
      modes: MODES, matieres: MATIERES, niveaux: NIVEAUX[s.id] || null,
    });
  }

  if (p === "/api/carnet" && method === "GET") {
    if (s.parent) return err(403, "Réservé aux élèves.");
    const r = await env.DB.prepare("SELECT content, updated_at FROM notebooks WHERE user_id = ?").bind(s.id).first();
    return json(r || { content: "", updated_at: null });
  }

  // --- conversations (enfant) ---
  if (p === "/api/conversations" && method === "GET") {
    const uid = s.parent ? url.searchParams.get("enfant") : s.id;
    const r = await env.DB.prepare(
      `SELECT c.id, c.mode, c.subject, c.title, c.solution_unlocked, c.updated_at,
              COUNT(m.id) FILTER (WHERE m.role='user') AS questions,
              COALESCE(SUM(m.cost_usd),0) AS cout
         FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.user_id = ? GROUP BY c.id HAVING COUNT(m.id) > 0 ORDER BY c.updated_at DESC LIMIT 50`
    ).bind(uid).all();
    return json(r.results);
  }

  if (p === "/api/conversations" && method === "POST") {
    if (s.parent) return err(403, "Réservé aux enfants.");
    const { mode, subject, niveau } = await req.json().catch(() => ({}));
    if (!MODES[mode]) return err(400, "Mode inconnu.");
    let sub = MATIERES.includes(subject) ? subject : "Autre";
    const niv = NIVEAUX[s.id];
    if (niv) sub += " – " + (niv.includes(niveau) ? niveau : niv[0]);
    const now = new Date().toISOString();
    const r = await env.DB.prepare(
      "INSERT INTO conversations (user_id, mode, subject, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id"
    ).bind(s.id, mode, sub, now, now).first();
    return json({ id: r.id });
  }

  let m = p.match(/^\/api\/conversations\/(\d+)$/);
  if (m && method === "GET") {
    const conv = await peutVoirConv(env, s, Number(m[1]));
    if (!conv) return err(404, "Conversation introuvable.");
    const msgs = (await env.DB.prepare(
      `SELECT id, role, content, has_image, model, cost_usd, input_tokens, output_tokens,
              cache_read_tokens, cache_write_tokens, created_at
         FROM messages WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY id`
    ).bind(conv.id).all()).results;
    if (!s.parent) msgs.forEach((x) => { delete x.cost_usd; delete x.input_tokens; delete x.output_tokens; delete x.cache_read_tokens; delete x.cache_write_tokens; });
    return json({ conversation: conv, messages: msgs });
  }

  m = p.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (m && method === "POST") {
    if (s.parent) return err(403, "Réservé aux enfants.");
    const conv = await peutVoirConv(env, s, Number(m[1]));
    if (!conv) return err(404, "Conversation introuvable.");
    const limite = Number(env.LIMITE_JOUR || 40);
    if ((await questionsAujourdhui(env, s.id)) >= limite) {
      return err(429, `Tu as atteint ta limite de ${limite} questions pour aujourd'hui. On reprend demain !`);
    }
    const { text, image } = await req.json().catch(() => ({}));
    const texte = String(text || "").slice(0, 6000).trim();
    let img = null;
    if (image && image.data) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(image.media_type)) return err(400, "Format de photo non accepté.");
      if (image.data.length > IMAGE_MAX_CHARS) return err(413, "Photo trop lourde.");
      img = image;
    }
    if (!texte && !img) return err(400, "Message vide.");

    const now = new Date();
    const iso = now.toISOString(), jour = jourParis(now), sem = lundiParis(now);
    const um = await env.DB.prepare(
      `INSERT INTO messages (conversation_id, user_id, role, content, has_image, day_paris, week_paris, created_at)
       VALUES (?, ?, 'user', ?, ?, ?, ?, ?) RETURNING id`
    ).bind(conv.id, s.id, texte, img ? 1 : 0, jour, sem, iso).first();
    if (img) {
      await env.DB.prepare("INSERT INTO images (message_id, media_type, data, created_at) VALUES (?, ?, ?, ?)")
        .bind(um.id, img.media_type, img.data, iso).run();
    }
    if (!conv.title) {
      await env.DB.prepare("UPDATE conversations SET title = ? WHERE id = ?")
        .bind((texte || "Photo d'exercice").slice(0, 80), conv.id).run();
    }

    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(s.id).first();
    const { modele } = await modeleActif(env);
    let rep;
    try {
      rep = await appelerClaude(env, user, conv, modele);
    } catch (e) {
      // on retire la question pour qu'elle ne compte pas et que l'élève puisse la renvoyer
      await env.DB.prepare("DELETE FROM images WHERE message_id = ?").bind(um.id).run();
      await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(um.id).run();
      return err(502, "Socrate n'a pas pu répondre. Réessaie dans un moment. (" + e.message + ")");
    }
    const u = rep.usage;
    const c = cout(modele, u);
    const contenu = rep.texte || (rep.stop === "max_tokens"
      ? "Je n'ai pas réussi à répondre en entier. Peux-tu reformuler ou découper ta question ?"
      : "Je n'ai pas de réponse. Peux-tu reformuler ?");
    const am = await env.DB.prepare(
      `INSERT INTO messages (conversation_id, user_id, role, content, model, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost_usd, day_paris, week_paris, created_at)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(conv.id, s.id, contenu, MODELES[modele].id, u.input_tokens || 0, u.output_tokens || 0,
      u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0, c, jour, sem, new Date().toISOString()).first();
    if (ctx) ctx.waitUntil(majCarnet(env, user, conv)); else await majCarnet(env, user, conv);
    await env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(new Date().toISOString(), conv.id).run();
    return json({
      user_message_id: um.id,
      message: { id: am.id, role: "assistant", content: contenu },
      aujourdhui: await questionsAujourdhui(env, s.id),
      stats: await stats(env, s.id),
    });
  }

  m = p.match(/^\/api\/images\/(\d+)$/);
  if (m && method === "GET") {
    const msg = await env.DB.prepare("SELECT conversation_id FROM messages WHERE id = ?").bind(Number(m[1])).first();
    if (!msg || !(await peutVoirConv(env, s, msg.conversation_id))) return err(404, "Introuvable.");
    const img = await env.DB.prepare("SELECT media_type, data FROM images WHERE message_id = ?").bind(Number(m[1])).first();
    if (!img) return err(404, "Photo supprimée (plus de 30 jours).");
    const bin = Uint8Array.from(atob(img.data), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: { "content-type": img.media_type, "cache-control": "private, max-age=86400" } });
  }

  // --- parent ---
  if (!p.startsWith("/api/parent/")) return err(404, "Route inconnue.");
  if (!s.parent) return err(403, "Réservé au parent.");

  if (p === "/api/parent/overview") {
    const sem = lundiParis(), jour = jourParis();
    const enfants = [];
    for (const id of ENFANTS) {
      const u = await env.DB.prepare(
        `SELECT u.id, u.display, u.profile, u.pass_hash IS NOT NULL AS a_mdp, n.content AS carnet, n.updated_at AS carnet_maj
           FROM users u LEFT JOIN notebooks n ON n.user_id = u.id WHERE u.id = ?`
      ).bind(id).first();
      const st = await env.DB.prepare(
        `SELECT
           COUNT(*) FILTER (WHERE role='user' AND day_paris = ?) AS q_jour,
           COUNT(*) FILTER (WHERE role='user' AND week_paris = ?) AS q_semaine,
           COALESCE(SUM(cost_usd) FILTER (WHERE week_paris = ?),0) AS cout_semaine,
           COALESCE(SUM(cost_usd),0) AS cout_total
         FROM messages WHERE user_id = ?`
      ).bind(jour, sem, sem, id).first();
      enfants.push({ ...u, ...st, correction: await correctionLibre(env, id) });
    }
    const act = await modeleActif(env);
    return json({
      enfants,
      semaine: sem,
      cout_semaine: await coutSemaine(env),
      budget_semaine: Number(env.BUDGET_SEMAINE_USD || 5),
      limite_jour: Number(env.LIMITE_JOUR || 40),
      mode_modele: act.mode,
      modele_actif: MODELES[act.modele].nom,
    });
  }

  m = p.match(/^\/api\/parent\/conversations\/(\d+)\/solution$/);
  if (m && method === "POST") {
    const { autoriser } = await req.json().catch(() => ({}));
    await env.DB.prepare("UPDATE conversations SET solution_unlocked = ? WHERE id = ?").bind(autoriser ? 1 : 0, Number(m[1])).run();
    return json({ ok: true });
  }

  m = p.match(/^\/api\/parent\/enfants\/(\w+)$/);
  if (m && method === "POST") {
    if (!ENFANTS.includes(m[1])) return err(404, "Compte inconnu.");
    const { password, profile, carnet, correction } = await req.json().catch(() => ({}));
    if (correction !== undefined) {
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind("correction_" + m[1], correction ? "1" : "0").run();
    }
    if (carnet !== undefined) {
      await env.DB.prepare("INSERT INTO notebooks (user_id, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at")
        .bind(m[1], String(carnet).slice(0, 6000), new Date().toISOString()).run();
    }
    if (password !== undefined) {
      if (String(password).length < 6) return err(400, "Mot de passe : 6 caractères minimum.");
      const salt = randomHex(16);
      await env.DB.prepare("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?").bind(await pbkdf2(password, salt), salt, m[1]).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(m[1]).run();
    }
    if (profile !== undefined) {
      const t = String(profile).trim();
      if (t.length < 20) return err(400, "Fiche trop courte.");
      await env.DB.prepare("UPDATE users SET profile = ? WHERE id = ?").bind(t.slice(0, 3000), m[1]).run();
    }
    return json({ ok: true });
  }

  if (p === "/api/parent/settings" && method === "POST") {
    const { model_mode } = await req.json().catch(() => ({}));
    if (!["auto", "sonnet", "haiku"].includes(model_mode)) return err(400, "Choix inconnu.");
    await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'model_mode'").bind(model_mode).run();
    return json({ ok: true });
  }

  return err(404, "Route inconnue.");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url, ctx);
      } catch (e) {
        console.error(e);
        return err(500, "Erreur interne.");
      }
    }
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
  },

  // Tous les jours : photos de plus de 30 jours, sessions expirées, anciens échecs de connexion.
  async scheduled(_ev, env) {
    const limite = new Date(Date.now() - 30 * 86400000).toISOString();
    await env.DB.prepare("DELETE FROM images WHERE created_at < ?").bind(limite).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
    await env.DB.prepare("DELETE FROM login_fails WHERE at < ?").bind(Date.now() - 86400000).run();
  },
};
