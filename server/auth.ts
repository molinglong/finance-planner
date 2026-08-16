// ============================================
// 认证：单密码 + JWT（首次启动设置密码）
// ============================================
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { db } from './db'

export class AuthError extends Error {}

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT "value" FROM app_settings WHERE "key" = ?').get(key) as { value: string | null } | undefined
  return row ? row.value : null
}

function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)').run(key, value)
}

function getJwtSecret(): string {
  let secret = getSetting('jwtSecret')
  if (!secret) {
    secret = crypto.randomUUID() + crypto.randomUUID()
    setSetting('jwtSecret', secret)
  }
  return secret
}

function issueToken(): string {
  return jwt.sign({ sub: 'owner' }, getJwtSecret(), { expiresIn: '365d' })
}

/** 是否需要首次设置密码 */
export function needSetup(): boolean {
  return !getSetting('passwordHash')
}

/** 首次设置密码（仅当未设置时可用） */
export function setupPassword(password: string): string {
  if (!needSetup()) throw new AuthError('密码已设置，请直接登录')
  if (password.length < 4) throw new AuthError('密码至少 4 位')
  setSetting('passwordHash', bcrypt.hashSync(password, 10))
  return issueToken()
}

/** 登录校验 */
export function loginWithPassword(password: string): string {
  const hash = getSetting('passwordHash')
  if (!hash || !bcrypt.compareSync(password, hash)) {
    throw new AuthError('密码错误')
  }
  return issueToken()
}

/** Bearer Token 校验中间件 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' })
    return
  }
  try {
    jwt.verify(header.slice(7), getJwtSecret())
    next()
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

/** 业务表是否有数据（用于迁移判断） */
export function hasData(): boolean {
  const tables = ['categories', 'accounts', 'transactions']
  return tables.some(t => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }
    return row.n > 0
  })
}
