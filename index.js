import Database from "better-sqlite3";

const db = new Database("database.sqlite");

db.prepare(`
CREATE TABLE IF NOT EXISTS jogos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    user_id TEXT,
    username TEXT,
    nota REAL
)
`).run();

export default db;