import { createHash, randomBytes } from 'node:crypto'
import type { Db } from './db.js'

export interface Actor {
  /** 'admin' for the server admin token, otherwise the token name */
  name: string
  role: 'admin' | 'owner' | 'member'
  /** undefined for admin */
  org?: string
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function issueToken(
  db: Db,
  org: string,
  name: string,
  role: 'owner' | 'member',
): string {
  const token = `skm_${randomBytes(24).toString('hex')}`
  db.prepare(
    'INSERT INTO tokens (token_hash, name, org, role, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(hashToken(token), name, org, role, Date.now())
  return token
}

export function authenticate(db: Db, adminToken: string, header?: string): Actor | null {
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (adminToken && token === adminToken) return { name: 'admin', role: 'admin' }
  const row = db
    .prepare('SELECT name, org, role FROM tokens WHERE token_hash = ? AND revoked = 0')
    .get(hashToken(token)) as { name: string; org: string; role: 'owner' | 'member' } | undefined
  if (!row) return null
  return { name: `${row.org}/${row.name}`, role: row.role, org: row.org }
}

/** admin sees everything; org tokens only their own org */
export function canReadOrg(actor: Actor, org: string): boolean {
  return actor.role === 'admin' || actor.org === org
}

export function canPublish(actor: Actor, org: string): boolean {
  return actor.role === 'admin' || (actor.org === org && actor.role === 'owner')
}
