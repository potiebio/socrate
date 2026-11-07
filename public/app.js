(() => {
  const $ = (id) => document.getElementById(id);

  const MODES = {
    devoirs: { icone: "📝", titre: "Mes devoirs", sous: "On le fait ensemble, pas à ta place", c: "#2453E8",
      accueil: "Envoie ton exercice, en texte ou en photo 📸. Je te guide, mais c'est toi qui trouves." },
    lecon: { icone: "💡", titre: "Comprendre", sous: "Une notion expliquée simplement", c: "#E9A400",
      accueil: "Quelle notion tu veux comprendre ? Je t'explique, puis je vérifie que c'est clair." },
    revision: { icone: "⚡", titre: "Quiz", sous: "Je te pose des questions", c: "#2FB37B",
      accueil: "Dis-moi quel chapitre réviser. Une question à la fois, et je reviens sur tes erreurs." },
    organisation: { icone: "📅", titre: "M'organiser", sous: "Planning, contrôles, examens", c: "#FF5C6C",
      accueil: "Qu'est-ce que tu as à faire, et pour quand ? On découpe tout ça en petites étapes." },
    orientation: { icone: "🧭", titre: "Orientation", sous: "Brevet, bac, Parcoursup, études", c: "#0E9AA7",
      accueil: "Parlons orientation : options, spécialités, Parcoursup, études, métiers… Qu'est-ce que tu veux savoir ?" },
    examen: { icone: "🏆", titre: "Examen blanc", sous: "Sujet type brevet ou bac, ou je note ta copie sur 20", c: "#7B5CF0",
      accueil: "Tu veux un sujet type examen, ou tu m'envoies ta copie en photo et je la note comme un correcteur ?" },
  };
  const RACCOURCIS = {
    devoirs: ["💡 Un indice", "🤔 Je ne comprends pas", "✅ Vérifie ma réponse"],
    lecon: ["🧩 Un exemple", "🔁 Explique autrement", "⚡ Teste-moi"],
    revision: ["⚡ Question suivante", "💡 Un indice", "📊 Mon bilan"],
    organisation: ["📅 Fais-moi un planning", "🎯 Par quoi je commence ?"],
    orientation: ["📅 Le calendrier Parcoursup", "🎓 Quelles études après ?", "🔄 Qu'est-ce qui a changé ?"],
    examen: ["📝 Donne-moi un sujet", "📸 Note ma copie", "📊 Montre-moi le barème"],
  };
  const ICONES_MATIERE = {
    "Maths": "📐", "Français": "📖", "Histoire-géo / EMC": "🌍", "SES": "📈", "Philosophie": "🏛️",
    "Physique-chimie": "⚗️", "SVT": "🧬", "Anglais": "🇬🇧", "Espagnol": "🇪🇸", "Allemand": "🇩🇪",
    "Technologie": "⚙️", "Enseignement scientifique": "🔭", "Culture générale": "🌐", "Orientation": "🧭", "Autre": "✨",
  };
  const SALUTS = [
    "Salut {p} ! Prêt·e à faire travailler tes neurones ?",
    "Bonjour {p}. « Connais-toi toi-même »… et connais ton cours, aussi.",
    "Te revoilà, {p} ! On attaque quoi aujourd'hui ?",
    "{p} ! L'agora t'attendait. Par quoi on commence ?",
  ];

  let me = null, mode = "devoirs", matiere = "Maths", niveau = null, convId = null, photo = null, who = null, busy = false;

  // ---------- connexion ----------
  async function init() {
    try {
      me = await T.api("/api/me");
      if (me.parent) { location.href = "/parent.html"; return; }
      showApp();
    } catch {
      $("loginMascotte").innerHTML = T.socrate("content");
      const pre = new URLSearchParams(location.search).get("who");
      const b = pre && document.querySelector(`.who button[data-who="${CSS.escape(pre)}"]`);
      if (b) b.click();
      $("login").classList.remove("hidden");
    }
  }
  document.querySelectorAll(".who button").forEach((b) =>
    b.addEventListener("click", () => {
      who = b.dataset.who;
      document.querySelectorAll(".who button").forEach((x) => x.classList.toggle("on", x === b));
      $("pwd").focus();
    })
  );
  async function login() {
    $("loginErr").textContent = "";
    if (!who) { $("loginErr").textContent = "Choisis d'abord ton prénom."; return; }
    try {
      await T.api("/api/login", { method: "POST", body: { who, password: $("pwd").value } });
      me = await T.api("/api/me");
      $("login").classList.add("hidden");
      showApp();
    } catch (e) { $("loginErr").textContent = e.message; }
  }
  $("loginBtn").onclick = login;
  $("pwd").addEventListener("keydown", (e) => e.key === "Enter" && login());

  // ---------- accueil ----------
  function showApp() {
    $("app").classList.remove("hidden");
    $("headMascotte").innerHTML = T.socrate();
    $("accMascotte").innerHTML = T.socrate("content");
    const s = SALUTS[Math.floor(Math.random() * SALUTS.length)];
    $("salutTexte").textContent = s.replace("{p}", me.display);

    $("modes").innerHTML = Object.entries(MODES).map(([k, m]) => `
      <button class="tuile ${k === mode ? "on" : ""}" data-mode="${k}" style="--c:${m.c}">
        <span class="tuile-icone" aria-hidden="true">${m.icone}</span>
        <span class="tuile-titre">${m.titre}</span>
        <span class="tuile-sous">${m.sous}</span>
      </button>`).join("");
    $("modes").querySelectorAll(".tuile").forEach((b) => (b.onclick = () => {
      mode = b.dataset.mode;
      $("modes").querySelectorAll(".tuile").forEach((x) => x.classList.toggle("on", x === b));
    }));

    $("matieres").innerHTML = me.matieres.map((m) =>
      `<button class="puce ${m === matiere ? "on" : ""}" data-m="${T.esc(m)}">${ICONES_MATIERE[m] || "✨"} ${T.esc(m)}</button>`).join("");
    $("matieres").querySelectorAll(".puce").forEach((b) => (b.onclick = () => {
      matiere = b.dataset.m;
      $("matieres").querySelectorAll(".puce").forEach((x) => x.classList.toggle("on", x === b));
    }));
    if (me.niveaux) {
      niveau = me.niveaux[0];
      $("niveaux").innerHTML = me.niveaux.map((n) => `<button class="puce ${n === niveau ? "on" : ""}" data-n="${T.esc(n)}">🎓 ${T.esc(n)}</button>`).join("");
      $("niveaux").classList.remove("hidden");
      $("niveaux").querySelectorAll(".puce").forEach((b) => (b.onclick = () => {
        niveau = b.dataset.n;
        $("niveaux").querySelectorAll(".puce").forEach((x) => x.classList.toggle("on", x === b));
      }));
    }
    majStats(me.stats);
    majCompteur(me.aujourdhui);
    initVoix();
    accueil();
  }

  function niveauHTML(st) {
    const pct = st.haut ? Math.round(((st.xp - st.bas) / (st.haut - st.bas)) * 100) : 100;
    const reste = st.haut ? `encore ${st.haut - st.xp} points pour le niveau suivant` : "niveau maximum, respect";
    return `<div class="niv-haut"><span class="niv-rang">${st.rang}</span>
      <span class="niv-nom">${T.esc(st.niveau)}</span><span class="niv-xp">${st.xp} points</span></div>
      <div class="niv-barre"><div style="width:${pct}%"></div></div>
      <div class="niv-reste">${reste} · ${st.reussites} réussite${st.reussites > 1 ? "s" : ""} 🎉</div>`;
  }
  function majStats(st) {
    if (!st) return;
    const avant = me.stats;
    me.stats = st;
    $("niveauCarte").innerHTML = niveauHTML(st);
    $("niveauCarte2").innerHTML = niveauHTML(st);
    $("serie").innerHTML = st.serie
      ? `<span class="flamme ${st.aujourdhui_fait ? "" : "eteinte"}">🔥</span>${st.serie}`
      : "";
    $("serie").title = st.serie ? `${st.serie} jour${st.serie > 1 ? "s" : ""} d'affilée` : "";
    if (avant && st.rang > avant.rang) toast(`Niveau ${st.rang} : ${st.niveau} !`, true);
  }
  function majCompteur(n) {
    $("compteur").textContent = `${n} question${n > 1 ? "s" : ""} sur ${me.limite} aujourd'hui`;
  }

  function accueil() {
    convId = null;
    $("accueil").classList.remove("hidden");
    $("chat").classList.add("hidden");
    $("composer").classList.add("hidden");
  }
  $("homeBtn").onclick = accueil;

  $("revisionJour").onclick = async () => {
    try {
      mode = "revision";
      const r = await T.api("/api/conversations", { method: "POST", body: { mode: "revision", subject: "Autre", niveau } });
      ouvrirChat(r.id);
      $("input").value = "Fais-moi ma révision du jour : 5 questions sur ce que je dois revoir.";
      envoyer();
    } catch (e) { toast(e.message); }
  };

  $("startBtn").onclick = async () => {
    try {
      const r = await T.api("/api/conversations", { method: "POST", body: { mode, subject: matiere, niveau } });
      ouvrirChat(r.id);
      ajouter("assistant", MODES[mode].accueil);
      $("input").focus();
    } catch (e) { toast(e.message); }
  };

  // ---------- discussion ----------
  function ouvrirChat(id) {
    convId = id;
    $("accueil").classList.add("hidden");
    $("chat").classList.remove("hidden");
    $("composer").classList.remove("hidden");
    $("chat").innerHTML = "";
    $("raccourcis").innerHTML = (RACCOURCIS[mode] || []).map((r) => `<button class="raccourci">${r}</button>`).join("");
    $("raccourcis").querySelectorAll(".raccourci").forEach((b) => (b.onclick = () => {
      $("input").value = b.textContent.replace(/^\S+\s/, "");
      envoyer();
    }));
  }

  function ajouter(role, text, imageSrc) {
    const ligne = document.createElement("div");
    ligne.className = "ligne " + role;
    if (role === "assistant") {
      const av = document.createElement("div");
      av.className = "avatar";
      av.innerHTML = T.socrate(/🎉/.test(text) ? "content" : "");
      ligne.appendChild(av);
    }
    const d = document.createElement("div");
    d.className = "bubble " + role;
    if (imageSrc) {
      const im = document.createElement("img");
      im.src = imageSrc;
      im.alt = "Photo envoyée";
      d.appendChild(im);
    }
    if (role === "assistant" && "speechSynthesis" in window) {
      const hp = document.createElement("button");
      hp.className = "lire";
      hp.title = "Écouter";
      hp.setAttribute("aria-label", "Écouter la réponse");
      hp.textContent = "🔊";
      hp.onclick = () => lire(text);
      d.appendChild(hp);
    }
    const c = document.createElement("div");
    if (role === "assistant") T.render(c, text); else c.textContent = text;
    d.appendChild(c);
    ligne.appendChild(d);
    $("chat").appendChild(ligne);
    if (role === "assistant") boutonsQCM(text);
    $("chat").scrollTop = $("chat").scrollHeight;
    return d;
  }

  async function envoyer() {
    if (busy) return;
    const text = $("input").value.trim();
    if (!text && !photo) return;
    busy = true;
    $("sendBtn").disabled = true;
    const p = photo;
    ajouter("user", text, p && p.preview);
    $("input").value = "";
    autoSize();
    retirerPhoto();
    const t = document.createElement("div");
    t.className = "ligne assistant reflechit";
    t.innerHTML = `<div class="avatar">${T.socrate("pense")}</div><div class="bubble assistant"><span class="points"><i></i><i></i><i></i></span></div>`;
    $("chat").appendChild(t);
    $("chat").scrollTop = $("chat").scrollHeight;
    try {
      const r = await T.api(`/api/conversations/${convId}/messages`, {
        method: "POST",
        body: { text, image: p ? { media_type: p.media_type, data: p.data } : null },
      });
      t.remove();
      ajouter("assistant", r.message.content);
      if (voixAuto) lire(r.message.content);
      majCompteur(r.aujourdhui);
      if (/🎉/.test(r.message.content)) {
        T.confettis();
        toast("+25 points, bien joué !", true);
      }
      majStats(r.stats);
    } catch (e) {
      t.remove();
      const d = ajouter("assistant", e.message);
      d.classList.add("erreur");
    } finally {
      busy = false;
      $("sendBtn").disabled = false;
    }
  }
  $("sendBtn").onclick = envoyer;
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      envoyer();
    }
  });
  function autoSize() {
    const i = $("input");
    i.style.height = "auto";
    i.style.height = Math.min(i.scrollHeight, 160) + "px";
  }
  $("input").addEventListener("input", autoSize);

  // Si Socrate pose un QCM (lignes « A) … »), on affiche des boutons A, B, C, D.
  function boutonsQCM(text) {
    const old = document.getElementById("qcm");
    if (old) old.remove();
    const lettres = [...String(text).matchAll(/^\s*[*_]*([A-E])\s*[).:]/gm)].map((m) => m[1]);
    const uniques = [...new Set(lettres)];
    if (uniques.length < 3 || uniques[0] !== "A") return;
    const box = document.createElement("div");
    box.id = "qcm";
    box.className = "qcm";
    box.innerHTML = uniques.map((l) => `<button class="qcm-btn">${l}</button>`).join("");
    box.querySelectorAll(".qcm-btn").forEach((b) => (b.onclick = () => {
      box.remove();
      $("input").value = "Réponse " + b.textContent;
      envoyer();
    }));
    $("composer").prepend(box);
  }

  // ---------- voix : dicter et écouter ----------
  let voixAuto = false, reco = null;
  function cleVoix() { return "socrate-voix-" + me.id; }
  function initVoix() {
    try {
      const v = localStorage.getItem(cleVoix());
      voixAuto = v === null ? true : v === "1";
    } catch { voixAuto = true; }
    majBoutonVoix();
    if (!("speechSynthesis" in window)) $("voixAuto").classList.add("hidden");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) $("micro").classList.remove("hidden");
  }
  function majBoutonVoix() {
    $("voixAuto").setAttribute("aria-pressed", voixAuto ? "true" : "false");
    $("voixAuto").classList.toggle("on", voixAuto);
    $("voixAuto").title = voixAuto ? "Lecture à voix haute activée" : "Lire les réponses à voix haute";
  }
  $("voixAuto").onclick = () => {
    voixAuto = !voixAuto;
    try { localStorage.setItem(cleVoix(), voixAuto ? "1" : "0"); } catch {}
    majBoutonVoix();
    if (!voixAuto) speechSynthesis.cancel();
    toast(voixAuto ? "Socrate lit ses réponses à voix haute" : "Lecture à voix haute coupée");
  };

  // Texte lisible à l'oral : sans Markdown ni LaTeX brut ni emojis.
  function pourOral(t) {
    return String(t)
      .replace(/\$\$?([^$]+)\$\$?/g, (_, m) => m
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1 sur $2").replace(/\^\{?2\}?/g, " au carré").replace(/\^\{?3\}?/g, " au cube")
        .replace(/\^\{?([^}\s]+)\}?/g, " puissance $1").replace(/\\sqrt\{([^}]*)\}/g, "racine de $1").replace(/\\times|\\cdot/g, " fois ").replace(/\+/g, " plus ").replace(/=/g, " égale ").replace(/-/g, " moins ")
        .replace(/\\[a-zA-Z]+/g, " ").replace(/[{}_]/g, " "))
      .replace(/[*#>`|]/g, " ")
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/\s+/g, " ").trim();
  }
  function lire(t) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(pourOral(t));
    u.lang = "fr-FR";
    u.rate = 1;
    const voix = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.startsWith("fr"));
    if (voix.length) u.voice = voix.find((v) => /google|natural|neural|premium|enhanced/i.test(v.name)) || voix[0];
    speechSynthesis.speak(u);
  }

  $("micro").onclick = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (reco) { reco.stop(); return; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    reco = new SR();
    reco.lang = "fr-FR";
    reco.interimResults = true;
    reco.continuous = false;
    const avant = $("input").value ? $("input").value + " " : "";
    let final = "";
    $("micro").classList.add("ecoute");
    reco.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      $("input").value = avant + final + interim;
      autoSize();
    };
    reco.onerror = (e) => {
      if (e.error === "not-allowed") toast("Autorise le micro pour parler à Socrate.");
    };
    reco.onend = () => {
      $("micro").classList.remove("ecoute");
      reco = null;
      if (final.trim()) envoyer();
    };
    reco.start();
  };

  // ---------- photo ----------
  $("photo").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      photo = await T.resizeImage(f);
      $("previewImg").src = photo.preview;
      $("preview").classList.remove("hidden");
    } catch { toast("Impossible de lire cette photo."); }
  });
  function retirerPhoto() {
    photo = null;
    $("preview").classList.add("hidden");
  }
  $("removePhoto").onclick = retirerPhoto;

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, fete) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.toggle("fete", !!fete);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  // ---------- menu ----------
  $("histBtn").onclick = async () => {
    $("drawer").classList.remove("hidden");
    T.api("/api/carnet").then((c) => {
      if (c.content) T.render($("carnet"), c.content);
      else $("carnet").innerHTML = '<p class="small">Ton carnet se remplit tout seul au fil de tes discussions : ce que tu maîtrises, ce qu\'il reste à revoir et tes progrès.</p>';
    }).catch(() => {});
    $("convList").innerHTML = '<p class="small">Chargement…</p>';
    try {
      const list = await T.api("/api/conversations");
      $("convList").innerHTML = list.length
        ? list.map((c) => `<button class="conv-item" data-id="${c.id}" data-mode="${c.mode}">
            <span class="conv-icone">${(MODES[c.mode] || {}).icone || "💬"}</span>
            <span><span class="t">${T.esc(c.title || "Sans titre")}</span>
            <span class="s">${T.esc(c.subject)}, le ${T.dateFr(c.updated_at)}</span></span>
          </button>`).join("")
        : '<p class="small">Pas encore de discussion. Lance-toi !</p>';
      $("convList").querySelectorAll(".conv-item").forEach((b) => (b.onclick = () => ouvrir(Number(b.dataset.id))));
    } catch (e) { $("convList").textContent = e.message; }
  };
  $("closeDrawer").onclick = () => $("drawer").classList.add("hidden");
  $("drawer").addEventListener("click", (e) => e.target.id === "drawer" && $("drawer").classList.add("hidden"));
  $("newConv").onclick = () => { $("drawer").classList.add("hidden"); accueil(); };
  $("logout").onclick = async () => {
    await T.api("/api/logout", { method: "POST" }).catch(() => {});
    location.href = "/";
  };
  $("lienParent").onclick = async (e) => {
    e.preventDefault();
    await T.api("/api/logout", { method: "POST" }).catch(() => {});
    location.href = "/parent.html";
  };

  async function ouvrir(id) {
    $("drawer").classList.add("hidden");
    const r = await T.api(`/api/conversations/${id}`);
    mode = r.conversation.mode;
    ouvrirChat(id);
    for (const m of r.messages) ajouter(m.role, m.content, m.has_image ? `/api/images/${m.id}` : null);
  }

  init();
})();
