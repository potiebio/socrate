# Installation de Socrate (15 minutes, une seule fois)

## 1. Clé API dans la Console Claude
1. platform.claude.com → Settings → Workspaces → créer l'espace de travail **Socrate**.
2. Dans cet espace : limite de dépense mensuelle **20 $**.
3. API keys → créer une clé dans l'espace **Socrate** → la copier (elle ne s'affiche qu'une fois).

## 2. Node.js
Si `node -v` ne répond rien dans PowerShell : installer la version LTS depuis nodejs.org.

## 3. Mise en ligne
Dézipper dans `C:\Users\cpoti\Socrate`, ouvrir PowerShell dans ce dossier, puis :

```
npm install
npm run installer
```

Le script ouvre Cloudflare pour te connecter (même compte que le site Colibri), crée la base, met l'appli en ligne, puis te demande la clé API et le mot de passe parent.

## 4. Premiers réglages
- Ouvrir `https://socrate.<ton-sous-domaine>.workers.dev/parent` → Réglages → créer les mots de passe d'Olivia et d'Emilio.
- Sur leur téléphone : ouvrir l'adresse, puis « Ajouter à l'écran d'accueil ».

## Plus tard
- Modifier le code puis `npm run deploy`.
- Limites dans `wrangler.toml` : `LIMITE_JOUR` (40), `BUDGET_SEMAINE_USD` (5), `MAX_TOKENS` (1500).
- Les prix des modèles sont en haut de `src/worker.js`.
