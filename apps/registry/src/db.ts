import Database from 'better-sqlite3'

export type Db = Database.Database

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      org TEXT NOT NULL REFERENCES orgs(name),
      role TEXT NOT NULL CHECK (role IN ('owner','member')),
      created_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org TEXT NOT NULL REFERENCES orgs(name),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL,
      resources TEXT,
      published_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (org, name, version)
    );
    CREATE TABLE IF NOT EXISTS required_skills (
      org TEXT NOT NULL REFERENCES orgs(name),
      skill_name TEXT NOT NULL,
      PRIMARY KEY (org, skill_name)
    );
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org TEXT NOT NULL REFERENCES orgs(name),
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (org, name)
    );
    CREATE TABLE IF NOT EXISTS mcp_server_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES mcp_servers(id),
      version TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      definition TEXT NOT NULL,
      required_secrets TEXT NOT NULL DEFAULT '[]',
      published_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (server_id, version)
    );
    CREATE TABLE IF NOT EXISTS required_mcp_servers (
      org TEXT NOT NULL REFERENCES orgs(name),
      mcp_server_name TEXT NOT NULL,
      PRIMARY KEY (org, mcp_server_name)
    );
    CREATE TABLE IF NOT EXISTS bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org TEXT NOT NULL REFERENCES orgs(name),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      mcp_servers TEXT NOT NULL DEFAULT '[]',
      published_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (org, name, version)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      actor TEXT NOT NULL,
      org TEXT,
      action TEXT NOT NULL,
      subject TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_skills_org_name ON skills(org, name);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_org_name ON mcp_servers(org, name);
    CREATE INDEX IF NOT EXISTS idx_mcp_versions_server ON mcp_server_versions(server_id);
    CREATE INDEX IF NOT EXISTS idx_bundles_org_name ON bundles(org, name);
    CREATE INDEX IF NOT EXISTS idx_audit_org ON audit(org, at);
  `)
  return db
}

export function audit(
  db: Db,
  entry: { actor: string; org?: string; action: string; subject: string; detail?: string },
): void {
  db.prepare(
    'INSERT INTO audit (at, actor, org, action, subject, detail) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(Date.now(), entry.actor, entry.org ?? null, entry.action, entry.subject, entry.detail ?? null)
}
