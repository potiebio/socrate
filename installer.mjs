// Installation de Socrate sur Cloudflare. Lancer depuis ce dossier :  npm run installer
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const W = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args, { capture = false } = {}) {
  console.log("\n> wrangler " + args.join(" "));
  const r = spawnSync(W, ["wrangler", ...args], {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (capture) process.stdout.write((r.stdout || "") + (r.stderr || ""));
  return r;
}
function stop(msg) {
  console.error("\n*** " + msg + " ***");
  process.exit(1);
}

console.log("=== Installation de Socrate ===");

// 1. Connexion à Cloudflare (ouvre le navigateur)
if (run(["whoami"], { capture: true }).stdout?.includes("not authenticated")) {
  if (run(["login"]).status !== 0) stop("Connexion à Cloudflare impossible.");
}

// 2. Base de données
let toml = readFileSync("wrangler.toml", "utf8");
if (toml.includes("A_REMPLIR_PAR_INSTALLER")) {
  const c = run(["d1", "create", "socrate"], { capture: true });
  let out = (c.stdout || "") + (c.stderr || "");
  let id = (out.match(/database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/) || [])[1];
  if (!id) {
    const l = run(["d1", "list", "--json"], { capture: true });
    try {
      const db = JSON.parse(l.stdout).find((d) => d.name === "socrate");
      id = db && db.uuid;
    } catch {}
  }
  if (!id) stop("Impossible de récupérer l'identifiant de la base. Envoie-moi ce qui est affiché au-dessus.");
  toml = toml.replace("A_REMPLIR_PAR_INSTALLER", id);
  writeFileSync("wrangler.toml", toml);
  console.log("Base créée : " + id);
}
if (run(["d1", "execute", "socrate", "--remote", "--file", "schema.sql", "-y"]).status !== 0) stop("Création des tables impossible.");

// 3. Mise en ligne
if (run(["deploy"]).status !== 0) stop("Mise en ligne impossible.");

// 4. Secrets (saisis par toi, jamais écrits dans un fichier)
console.log("\nColle la clé API de Socrate (espace de travail Socrate dans la Console Claude), puis Entrée :");
if (run(["secret", "put", "ANTHROPIC_API_KEY"]).status !== 0) stop("Enregistrement de la clé impossible.");
console.log("\nChoisis le mot de passe de l'espace parent, puis Entrée :");
if (run(["secret", "put", "PARENT_PASSWORD"]).status !== 0) stop("Enregistrement du mot de passe impossible.");

console.log("\n=== Terminé ===");
console.log("Ouvre l'adresse « https://socrate....workers.dev » affichée plus haut, ajoute /parent,");
console.log("connecte-toi et crée les mots de passe d'Olivia et d'Emilio dans Réglages.");
