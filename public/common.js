// Fonctions partagées entre la page élève et la page parent.
window.T = {
  async api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "content-type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || "Erreur " + res.status);
      e.status = res.status;
      throw e;
    }
    return data;
  },

  // Markdown + formules : on protège le LaTeX avant marked, puis on le remet.
  render(el, text) {
    const maths = [];
    const protege = String(text).replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (m) => {
      maths.push(m);
      return `@@MATH${maths.length - 1}@@`;
    });
    let html = marked.parse(protege, { breaks: true });
    html = html.replace(/@@MATH(\d+)@@/g, (_, i) => maths[i].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    el.innerHTML = DOMPurify.sanitize(html);
    if (window.renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  },

  // Réduit la photo (1600 px max, JPEG) pour limiter le coût et le poids.
  async resizeImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ko) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = ko;
        i.src = url;
      });
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.82);
      return { media_type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  dateFr(iso) {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  },

  usd(v, dec = 2) {
    return Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " $";
  },

  // La mascotte : un Socrate en buste, visage allongé, front dégarni ridé, nez camus, longue barbe en pointe. Humeurs : "", "pense", "content".
  socrate(humeur = "") {
    return `<svg class="socrate ${humeur ? "m-" + humeur : ""}" viewBox="0 0 120 120" aria-hidden="true">
      <path class="toga" d="M24 120c3-17 15-25 36-26 21 1 33 9 36 26z"/>
      <path class="toga-pli" d="M36 99c15 6 31 13 46 21M49 96c10 7 21 15 29 24"/>
      <g class="tete">
        <path class="cheveux" d="M37 40c-6 1-9 5-9 10-3 3-3 8 0 11-2 4-1 9 3 11 2 2 6 2 8 0l-2-32zM83 40c6 1 9 5 9 10 3 3 3 8 0 11 2 4 1 9-3 11-2 2-6 2-8 0l2-32z"/>
        <ellipse class="peau" cx="34" cy="55" rx="4" ry="6.5"/>
        <ellipse class="peau" cx="86" cy="55" rx="4" ry="6.5"/>
        <path class="peau" d="M60 19c17 0 26 11 26 27v12c0 13-11 22-26 22s-26-9-26-22V46c0-16 9-27 26-27z"/>
        <path class="ride" d="M49 31q11-4 22 0M52 36q8-3 16 0"/>
        <path class="reflet" d="M46 25q7-4 14-4"/>
        <circle class="joue" cx="43" cy="59" r="4.5"/><circle class="joue" cx="77" cy="59" r="4.5"/>
        <path class="barbe" d="M35 58c0 12 3 24 9 34 5 8 10 14 16 18 6-4 11-10 16-18 6-10 9-22 9-34-6 8-14 11-25 11s-19-3-25-11z"/>
        <path class="barbe-trait" d="M48 80c3 9 6 16 9 21M60 84v19M72 80c-3 9-6 16-9 21"/>
        <path class="moustache" d="M45 66c6-6 10-6 15-2 5-4 9-4 15 2-1 6-7 9-15 5-8 4-14 1-15-5z"/>
        <path class="bouche" d="M55 74q5 4 10 0"/>
        <path class="sourcil" d="M42 45q7-6 14-2M64 43q7-4 14 2"/>
        <g class="yeux"><circle cx="49" cy="51" r="3"/><circle cx="71" cy="51" r="3"/></g>
        <g class="yeux-content"><path d="M44.5 52q4.5-5 9 0M66.5 52q4.5-5 9 0"/></g>
        <path class="nez" d="M56 51c-2.5 5-4 10 0 11 2.5 1 5.5 1 8 0 4-1 2.5-6 0-11"/>
      </g>
      <g class="bulles"><circle cx="98" cy="22" r="3"/><circle cx="106" cy="12" r="4.5"/></g>
    </svg>`;
  },

  confettis() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const couleurs = ["#2453E8", "#FFC23D", "#2FB37B", "#FF5C6C", "#8E6BFF"];
    const box = document.createElement("div");
    box.className = "confettis";
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("i");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = couleurs[i % couleurs.length];
      c.style.animationDelay = Math.random() * 0.4 + "s";
      c.style.animationDuration = 1.4 + Math.random() * 1.2 + "s";
      c.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      c.style.setProperty("--rot", Math.random() * 720 + "deg");
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3200);
  },
};
