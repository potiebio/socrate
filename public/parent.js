(() => {
  const $ = (id) => document.getElementById(id);
  let ov = null, tab = "olivia", convId = null;
  const MODES = { devoirs: "Devoirs", lecon: "Comprendre", revision: "Quiz", organisation: "M'organiser", examen: "Examen blanc" };

  async function init() {
    try {
      const me = await T.api("/api/me");
      if (!me.parent) throw new Error();
      await charger();
    } catch {
      $("login").classList.remove("hidden");
    }
  }

  async function login() {
    $("loginErr").textContent = "";
    try {
      await T.api("/api/login", { method: "POST", body: { who: "parent", password: $("pwd").value } });
      $("login").classList.add("hidden");
      await charger();
    } catch (e) { $("loginErr").textContent = e.message; }
  }
  $("loginBtn").onclick = login;
  $("pwd").addEventListener("keydown", (e) => e.key === "Enter" && login());
  $("logout").onclick = async () => { await T.api("/api/logout", { method: "POST" }).catch(() => {}); location.reload(); };
  // Bascule vers le compte élève de Corentin : on ferme la session parent et on présélectionne son prénom.
  $("monCompte").onclick = async () => { await T.api("/api/logout", { method: "POST" }).catch(() => {}); location.href = "/?who=corentin"; };

  async function charger() {
    ov = await T.api("/api/parent/overview");
    $("main").classList.remove("hidden");
    const pct = Math.min(100, Math.round((ov.cout_semaine / ov.budget_semaine) * 100));
    const over = ov.cout_semaine >= ov.budget_semaine;
    $("cards").innerHTML = `
      <div class="card">
        <h2>Semaine du ${new Date(ov.semaine).toLocaleDateString("fr-FR")}</h2>
        <div class="kpi">${T.usd(ov.cout_semaine)} <span class="small">/ ${T.usd(ov.budget_semaine, 0)}</span></div>
        <div class="bar ${over ? "over" : ""}"><div style="width:${pct}%"></div></div>
        <div class="small">${pct} % du budget · modèle actif : <strong>${T.esc(ov.modele_actif)}</strong></div>
      </div>
      ${ov.enfants.map((e) => `
      <div class="card">
        <h2>${T.esc(e.display)}</h2>
        <div class="kpi">${e.q_jour} <span class="small">/ ${ov.limite_jour} questions aujourd'hui</span></div>
        <div class="small">Semaine : ${e.q_semaine} questions · ${T.usd(e.cout_semaine)}<br>
        Depuis le début : ${T.usd(e.cout_total)}${e.a_mdp ? "" : '<br><strong style="color:var(--warn)">Mot de passe à créer dans Réglages</strong>'}</div>
      </div>`).join("")}`;
    $("tabs").innerHTML = ov.enfants.map((e) => `<button data-t="${e.id}">${T.esc(e.display)}</button>`).join("") +
      `<button data-t="reglages">Réglages</button>`;
    $("tabs").querySelectorAll("button").forEach((b) => (b.onclick = () => ouvrirOnglet(b.dataset.t)));
    ouvrirOnglet(tab);
  }

  async function ouvrirOnglet(t) {
    tab = t;
    $("tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    const reglages = t === "reglages";
    $("viewConvs").classList.toggle("hidden", reglages);
    $("viewSettings").classList.toggle("hidden", !reglages);
    if (reglages) return afficherReglages();
    afficherCarnet(t);
    const list = await T.api("/api/conversations?enfant=" + encodeURIComponent(t));
    $("convList").innerHTML = list.length
      ? list.map((c) => `<button class="conv-item" data-id="${c.id}">
          <span class="t">${T.esc(c.title || "Sans titre")}</span>
          <span class="s">${MODES[c.mode] || c.mode} · ${T.esc(c.subject)} · ${c.questions} q. · ${T.usd(c.cout, 3)} · ${T.dateFr(c.updated_at)}</span>
        </button>`).join("")
      : '<p class="small">Aucune discussion pour l\'instant.</p>';
    $("convList").querySelectorAll(".conv-item").forEach((b) => (b.onclick = () => ouvrirConv(Number(b.dataset.id))));
  }

  function afficherCarnet(id) {
    const e = ov.enfants.find((x) => x.id === id);
    const th = $("thread");
    th.innerHTML = `<div class="thread-head"><strong>Carnet de suivi de ${T.esc(e.display)}</strong>
      <span class="small">${e.carnet_maj ? "mis à jour le " + T.dateFr(e.carnet_maj) : ""}</span></div>`;
    const body = document.createElement("div");
    body.className = "carnet";
    if (e.carnet) T.render(body, e.carnet);
    else body.innerHTML = '<p class="small">Le carnet se remplit tout seul au fil des discussions. Choisis une discussion à gauche pour la relire.</p>';
    th.appendChild(body);
  }

  async function ouvrirConv(id) {
    convId = id;
    const r = await T.api("/api/conversations/" + id);
    const c = r.conversation;
    const total = r.messages.reduce((s, m) => s + (m.cost_usd || 0), 0);
    const th = $("thread");
    th.innerHTML = `<div class="thread-head">
        <strong>${MODES[c.mode] || c.mode} · ${T.esc(c.subject)}</strong>
        <span class="small">${T.usd(total, 3)} au total</span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn ${c.solution_unlocked ? "ghost" : ""}" id="solBtn">
          ${c.solution_unlocked ? "Retirer l'autorisation de solution" : "Autoriser la solution"}</button>
      </div>`;
    for (const m of r.messages) {
      const d = document.createElement("div");
      d.className = "bubble " + m.role;
      if (m.has_image) {
        const im = document.createElement("img");
        im.src = "/api/images/" + m.id;
        im.alt = "Photo envoyée";
        im.onerror = () => { im.replaceWith(Object.assign(document.createElement("div"), { className: "small", textContent: "[photo supprimée après 30 jours]" })); };
        d.appendChild(im);
      }
      const body = document.createElement("div");
      if (m.role === "assistant") T.render(body, m.content); else body.textContent = m.content;
      d.appendChild(body);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = m.role === "assistant"
        ? `${T.dateFr(m.created_at)} · ${(m.model || "").replace("claude-", "")} · ${T.usd(m.cost_usd, 4)} · entrée ${m.input_tokens}, cache ${m.cache_read_tokens} lus / ${m.cache_write_tokens} écrits, sortie ${m.output_tokens}`
        : T.dateFr(m.created_at);
      d.appendChild(meta);
      th.appendChild(d);
    }
    $("solBtn").onclick = async () => {
      await T.api(`/api/parent/conversations/${id}/solution`, { method: "POST", body: { autoriser: !c.solution_unlocked } });
      ouvrirConv(id);
    };
  }

  function afficherReglages() {
    $("modelMode").value = ov.mode_modele;
    $("childSettings").innerHTML = ov.enfants.map((e) => `
      <h2 style="margin-top:20px">${T.esc(e.display)}</h2>
      <label class="interrupteur"><input type="checkbox" data-corr="${e.id}" ${e.correction ? "checked" : ""}>
        Correction prête à recopier dès qu'il la demande (sinon : après 3 essais, ou si tu l'autorises dans la discussion)</label>
      <span class="ok" id="corrok-${e.id}"></span>
      <label for="pw-${e.id}">Nouveau mot de passe</label>
      <div class="row">
        <input id="pw-${e.id}" class="field" type="text" placeholder="6 caractères minimum" style="max-width:260px" autocomplete="off">
        <button class="btn" data-pw="${e.id}">Enregistrer</button>
        <span class="ok" id="pwok-${e.id}"></span>
      </div>
      <label for="pf-${e.id}">Fiche élève (niveau, programme, examens, points à travailler)</label>
      <textarea id="pf-${e.id}" class="field">${T.esc(e.profile)}</textarea>
      <div class="row" style="margin-top:6px">
        <button class="btn" data-pf="${e.id}">Enregistrer la fiche</button>
        <span class="ok" id="pfok-${e.id}"></span>
      </div>
      <label for="cn-${e.id}">Carnet de suivi (rempli automatiquement, corrigeable)</label>
      <textarea id="cn-${e.id}" class="field" style="min-height:200px">${T.esc(e.carnet || "")}</textarea>
      <div class="row" style="margin-top:6px">
        <button class="btn" data-cn="${e.id}">Enregistrer le carnet</button>
        <span class="ok" id="cnok-${e.id}"></span>
      </div>`).join("");
    document.querySelectorAll("[data-corr]").forEach((c) => (c.onchange = async () => {
      const id = c.dataset.corr;
      try {
        await T.api("/api/parent/enfants/" + id, { method: "POST", body: { correction: c.checked } });
        $("corrok-" + id).textContent = "Enregistré.";
        ov = await T.api("/api/parent/overview");
      } catch (e) { $("corrok-" + id).textContent = e.message; }
    }));
    document.querySelectorAll("[data-cn]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.cn;
      try {
        await T.api("/api/parent/enfants/" + id, { method: "POST", body: { carnet: $("cn-" + id).value } });
        $("cnok-" + id).textContent = "Enregistré.";
        ov = await T.api("/api/parent/overview");
      } catch (e) { $("cnok-" + id).textContent = e.message; }
    }));
    document.querySelectorAll("[data-pw]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.pw;
      try {
        await T.api("/api/parent/enfants/" + id, { method: "POST", body: { password: $("pw-" + id).value } });
        $("pwok-" + id).textContent = "Enregistré.";
        $("pw-" + id).value = "";
        ov = await T.api("/api/parent/overview");
      } catch (e) { $("pwok-" + id).textContent = e.message; }
    }));
    document.querySelectorAll("[data-pf]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.pf;
      try {
        await T.api("/api/parent/enfants/" + id, { method: "POST", body: { profile: $("pf-" + id).value } });
        $("pfok-" + id).textContent = "Enregistré.";
      } catch (e) { $("pfok-" + id).textContent = e.message; }
    }));
  }

  $("saveModel").onclick = async () => {
    try {
      await T.api("/api/parent/settings", { method: "POST", body: { model_mode: $("modelMode").value } });
      $("modelOk").textContent = "Enregistré.";
      await charger();
      ouvrirOnglet("reglages");
    } catch (e) { $("modelOk").textContent = e.message; }
  };

  init();
})();
