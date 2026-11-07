CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display TEXT NOT NULL,
  profile TEXT NOT NULL,
  pass_hash TEXT,
  pass_salt TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_fails (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  subject TEXT NOT NULL,
  title TEXT,
  solution_unlocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  has_image INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  day_paris TEXT NOT NULL,
  week_paris TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_day ON messages(user_id, day_paris);
CREATE INDEX IF NOT EXISTS idx_msg_week ON messages(week_paris);

CREATE TABLE IF NOT EXISTS images (
  message_id INTEGER PRIMARY KEY,
  media_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notebooks (
  user_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('model_mode', 'auto'), ('correction_olivia', '0'), ('correction_emilio', '1'), ('correction_raminta', '1'), ('correction_corentin', '1');

INSERT OR IGNORE INTO users (id, display, profile) VALUES
 ('olivia', 'Olivia', 'Olivia, élève de 3e dans un collège en France, avec l''option internationale. Elle prépare le diplôme national du brevet (DNB). Programme de l''Éducation nationale du cycle 4 : français, mathématiques, histoire-géographie et EMC, sciences (physique-chimie, SVT, technologie), langues vivantes.'),
 ('emilio', 'Emilio', 'Emilio, 16 ans, élève de terminale générale en France. Spécialités : sciences économiques et sociales (SES) et mathématiques. Pas d''option maths. Il prépare le baccalauréat : épreuves de spécialité, philosophie, grand oral. Programme de l''Éducation nationale.'),
 ('raminta', 'Raminta', 'Raminta, adulte, mère d''Olivia (3e) et d''Emilio (terminale, spécialités SES et mathématiques). Elle a grandi en Lituanie et fait ses études en Suède : elle connaît mal le système scolaire français. Elle suit les programmes de ses enfants pour savoir ce qu''ils apprennent : leçons, quiz, exercices. Le niveau (3e ou terminale) est indiqué dans la matière de la discussion ; suis le programme officiel correspondant de l''Éducation nationale. Explique aussi, quand c''est utile, comment la notion est attendue en France (brevet, bac, méthode de rédaction). Si elle bute sur un mot français, explique-le simplement ; si elle le demande, tu peux expliquer en anglais. Elle peut aussi poser des questions d''orientation (Parcoursup, choix d''options et de spécialités, études supérieures) pour accompagner ses enfants.'),
 ('corentin', 'Corentin', 'Corentin, adulte, père d''Olivia (3e) et d''Emilio (terminale générale, spécialités SES et mathématiques). Il a fait toute sa scolarité en France et a eu son bac en 2001 : il connaît le système, mais pas ce qui a changé depuis (réforme du bac de 2021 avec spécialités et contrôle continu, grand oral, Parcoursup, évolutions du brevet et des programmes). Signale-lui ces changements quand c''est utile. Il veut surtout des quiz et des QCM fun : culture générale, et surtout les programmes de ses enfants mis en forme de quiz, pour savoir ce qu''ils apprennent. Il pose aussi des questions d''orientation pour accompagner ses enfants. Le niveau (3e, terminale ou adulte) est indiqué dans la matière de la discussion. Ton direct et efficace, il aime aller vite.');
