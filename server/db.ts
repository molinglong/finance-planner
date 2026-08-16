// ============================================
// 数据库连接 + 建表（node:sqlite，零原生依赖）
// ============================================
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 可用 DATA_DIR 环境变量覆盖数据目录（默认不变，便于隔离测试）
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'finance.db'))
db.exec('PRAGMA journal_mode = WAL')

// ============================================
// 表配置（列名与前端 TS 字段完全一致，省掉映射层）
// ============================================
export interface TableConfig {
  columns: string[]
  boolColumns?: string[] // 读时 0/1 → boolean，写时 boolean → 0/1
  jsonColumns?: string[] // 存为 JSON 文本
  orderBy?: string
}

export const TABLES: Record<string, TableConfig> = {
  accounts: {
    columns: ['id', 'name', 'icon', 'color', 'initialBalance', 'isPreset', 'sortOrder', 'status', 'createdAt', 'isFrozen', 'frozenNote'],
    boolColumns: ['isPreset', 'isFrozen'],
    orderBy: 'ORDER BY "sortOrder" ASC, rowid ASC',
  },
  categories: {
    columns: ['id', 'name', 'type', 'icon', 'color', 'isPreset', 'sortOrder'],
    boolColumns: ['isPreset'],
    orderBy: 'ORDER BY "sortOrder" ASC, rowid ASC',
  },
  transactions: {
    columns: ['id', 'type', 'amount', 'categoryId', 'accountId', 'date', 'note', 'createdAt', 'updatedAt'],
    orderBy: 'ORDER BY "date" DESC, "createdAt" DESC',
  },
  goals: {
    // coolingEndsAt/source/reason/aiVerdict/decidedAt 为省钱冷静期字段；aiVerdict/aiChat 存 JSON 字符串，序列化在客户端 repo 完成
    columns: ['id', 'name', 'targetAmount', 'currentAmount', 'deadline', 'icon', 'color', 'status', 'createdAt', 'completedAt', 'coolingEndsAt', 'source', 'reason', 'aiVerdict', 'aiChat', 'decidedAt'],
    orderBy: 'ORDER BY "createdAt" DESC',
  },
  budgets: {
    columns: ['id', 'month', 'totalBudget', 'categoryBudgets'],
    jsonColumns: ['categoryBudgets'],
    orderBy: 'ORDER BY "month" DESC',
  },
  recurringIncomes: {
    columns: ['id', 'name', 'amount', 'frequency', 'dayOfMonth', 'dayOfWeek', 'accountId', 'categoryId', 'startDate', 'endDate', 'isEnabled', 'lastProcessed', 'note', 'createdAt'],
    boolColumns: ['isEnabled'],
  },
  recurringExpenses: {
    columns: ['id', 'name', 'amount', 'frequency', 'dayOfMonth', 'dayOfWeek', 'accountId', 'categoryId', 'startDate', 'endDate', 'isEnabled', 'lastProcessed', 'note', 'createdAt'],
    boolColumns: ['isEnabled'],
  },
}

/** DB 行 → 客户端对象（bool/JSON 还原） */
export function rowToClient(row: Record<string, unknown>, cfg: TableConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (cfg.boolColumns?.includes(k)) out[k] = v === 1
    else if (cfg.jsonColumns?.includes(k)) out[k] = v == null ? [] : JSON.parse(String(v))
    else out[k] = v
  }
  return out
}

/** 客户端值 → DB 值（bool → 0/1，对象 → JSON 字符串，undefined → null） */
export function toDbValue(value: unknown, cfg: TableConfig, column: string): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (cfg.jsonColumns?.includes(column)) return JSON.stringify(value)
  return value as string | number
}

/** 建表（幂等） */
export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "accounts" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "icon" TEXT,
      "color" TEXT,
      "initialBalance" INTEGER NOT NULL DEFAULT 0,
      "isPreset" INTEGER NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" INTEGER
    );

    CREATE TABLE IF NOT EXISTS "categories" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "icon" TEXT,
      "color" TEXT,
      "isPreset" INTEGER NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS "transactions" (
      "id" TEXT PRIMARY KEY,
      "type" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "categoryId" TEXT,
      "accountId" TEXT,
      "date" TEXT NOT NULL,
      "note" TEXT,
      "createdAt" INTEGER,
      "updatedAt" INTEGER
    );
    CREATE INDEX IF NOT EXISTS "idx_tx_date" ON "transactions"("date");
    CREATE INDEX IF NOT EXISTS "idx_tx_category" ON "transactions"("categoryId");
    CREATE INDEX IF NOT EXISTS "idx_tx_account" ON "transactions"("accountId");

    CREATE TABLE IF NOT EXISTS "goals" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "targetAmount" INTEGER NOT NULL,
      "currentAmount" INTEGER NOT NULL DEFAULT 0,
      "deadline" TEXT,
      "icon" TEXT,
      "color" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" INTEGER,
      "completedAt" INTEGER
    );

    CREATE TABLE IF NOT EXISTS "budgets" (
      "id" TEXT PRIMARY KEY,
      "month" TEXT NOT NULL UNIQUE,
      "totalBudget" INTEGER NOT NULL DEFAULT 0,
      "categoryBudgets" TEXT
    );

    CREATE TABLE IF NOT EXISTS "recurringIncomes" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "frequency" TEXT NOT NULL,
      "dayOfMonth" INTEGER,
      "dayOfWeek" INTEGER,
      "accountId" TEXT,
      "categoryId" TEXT,
      "startDate" TEXT NOT NULL,
      "endDate" TEXT,
      "isEnabled" INTEGER NOT NULL DEFAULT 1,
      "lastProcessed" TEXT,
      "note" TEXT,
      "createdAt" INTEGER
    );

    CREATE TABLE IF NOT EXISTS "recurringExpenses" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "frequency" TEXT NOT NULL,
      "dayOfMonth" INTEGER,
      "dayOfWeek" INTEGER,
      "accountId" TEXT,
      "categoryId" TEXT,
      "startDate" TEXT NOT NULL,
      "endDate" TEXT,
      "isEnabled" INTEGER NOT NULL DEFAULT 1,
      "lastProcessed" TEXT,
      "note" TEXT,
      "createdAt" INTEGER
    );

    CREATE TABLE IF NOT EXISTS "app_settings" (
      "key" TEXT PRIMARY KEY,
      "value" TEXT
    );
  `)

  // 幂等列迁移（冻结功能）：列不存在时才 ALTER
  const accountCols = new Set(
    (db.prepare(`PRAGMA table_info("accounts")`).all() as { name: string }[]).map(c => c.name)
  )
  if (!accountCols.has('isFrozen')) {
    db.exec(`ALTER TABLE "accounts" ADD COLUMN "isFrozen" INTEGER NOT NULL DEFAULT 0`)
  }
  if (!accountCols.has('frozenNote')) {
    db.exec(`ALTER TABLE "accounts" ADD COLUMN "frozenNote" TEXT`)
  }

  // 幂等列迁移（省钱冷静期）：goals 表新增五个可选列
  const goalCols = new Set(
    (db.prepare(`PRAGMA table_info("goals")`).all() as { name: string }[]).map(c => c.name)
  )
  if (!goalCols.has('coolingEndsAt')) {
    db.exec(`ALTER TABLE "goals" ADD COLUMN "coolingEndsAt" INTEGER`)
  }
  if (!goalCols.has('source')) {
    db.exec(`ALTER TABLE "goals" ADD COLUMN "source" TEXT`)
  }
  if (!goalCols.has('reason')) {
    db.exec(`ALTER TABLE "goals" ADD COLUMN "reason" TEXT`)
  }
  if (!goalCols.has('aiVerdict')) {
    db.exec(`ALTER TABLE "goals" ADD COLUMN "aiVerdict" TEXT`)
  }
  if (!goalCols.has('aiChat')) {
    db.exec(`ALTER TABLE "goals" ADD COLUMN "aiChat" TEXT`)
  }
  if (!goalCols.has('decidedAt')) {
    db.exec(`ALTER TABLE "goals" ADD COLUMN "decidedAt" INTEGER`)
  }
}
