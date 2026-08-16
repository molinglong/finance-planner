// ============================================
// 预设数据初始化（分类 + 账户），移植自原 Dexie 仓库逻辑
// 幂等：重复调用安全，多设备并发调用安全（单事务）
// ============================================
import crypto from 'node:crypto'
import { db } from './db'

const uid = () => crypto.randomUUID()

// ---------- 预设分类（与原 src/db/categories.ts 保持一致；v2 扩充了更多收支分类） ----------
const PRESET_CATEGORIES: { name: string; type: string; icon: string; color: string; sortOrder: number }[] = [
  // 支出分类（统一粉彩双档色板：浅粉彩为主，个别用蒙灰中调保证区分度）
  { name: '未分类', type: 'expense', icon: 'help-circle', color: '#8A8580', sortOrder: 0 },
  { name: '餐饮', type: 'expense', icon: 'utensils', color: '#EFC8C8', sortOrder: 1 },
  { name: '零食饮料', type: 'expense', icon: 'coffee', color: '#B5AC83', sortOrder: 2 },
  { name: '交通', type: 'expense', icon: 'car', color: '#C8D4EC', sortOrder: 3 },
  { name: '通讯', type: 'expense', icon: 'wifi', color: '#9CA5B8', sortOrder: 4 },
  { name: '购物', type: 'expense', icon: 'shopping-bag', color: '#F0D0B8', sortOrder: 5 },
  { name: '日用百货', type: 'expense', icon: 'shopping-basket', color: '#BBA28F', sortOrder: 6 },
  { name: '服饰美妆', type: 'expense', icon: 'shirt', color: '#A59FB8', sortOrder: 7 },
  { name: '娱乐', type: 'expense', icon: 'gamepad', color: '#D4CCEC', sortOrder: 8 },
  { name: '订阅会员', type: 'expense', icon: 'tv', color: '#E8DCA8', sortOrder: 9 },
  { name: '居住', type: 'expense', icon: 'home', color: '#C8DEC8', sortOrder: 10 },
  { name: '水电燃气', type: 'expense', icon: 'zap', color: '#9CAD9C', sortOrder: 11 },
  { name: '医疗', type: 'expense', icon: 'heart-pulse', color: '#BA9C9C', sortOrder: 12 },
  { name: '教育', type: 'expense', icon: 'book-open', color: '#E8DCA8', sortOrder: 13 },
  { name: '运动健身', type: 'expense', icon: 'dumbbell', color: '#C8DEC8', sortOrder: 14 },
  { name: '旅游', type: 'expense', icon: 'plane', color: '#C8D4EC', sortOrder: 15 },
  { name: '宠物', type: 'expense', icon: 'paw-print', color: '#F0D0B8', sortOrder: 16 },
  { name: '人情往来', type: 'expense', icon: 'gift', color: '#EFC8C8', sortOrder: 17 },
  { name: '其他支出', type: 'expense', icon: 'more-horizontal', color: '#8A8580', sortOrder: 18 },
  // 收入分类
  { name: '未分类', type: 'income', icon: 'help-circle', color: '#8A8580', sortOrder: 0 },
  { name: '工资', type: 'income', icon: 'briefcase', color: '#C8DEC8', sortOrder: 1 },
  { name: '奖金', type: 'income', icon: 'award', color: '#E8DCA8', sortOrder: 2 },
  { name: '投资', type: 'income', icon: 'trending-up', color: '#C8D4EC', sortOrder: 3 },
  { name: '兼职', type: 'income', icon: 'clock', color: '#9CAD9C', sortOrder: 4 },
  { name: '红包', type: 'income', icon: 'gift', color: '#EFC8C8', sortOrder: 5 },
  { name: '生活费', type: 'income', icon: 'heart-handshake', color: '#F0D0B8', sortOrder: 6 },
  { name: '报销', type: 'income', icon: 'receipt', color: '#BBA28F', sortOrder: 7 },
  { name: '退款', type: 'income', icon: 'rotate-ccw', color: '#9CA5B8', sortOrder: 8 },
  { name: '二手闲置', type: 'income', icon: 'recycle', color: '#B5AC83', sortOrder: 9 },
  { name: '其他收入', type: 'income', icon: 'plus-circle', color: '#C8DEC8', sortOrder: 10 },
]

// ---------- 预设分类版本：存量库只补插新增项，用户删过的旧预设不复活 ----------
const PRESET_CATEGORIES_VERSION = 2
const PRESET_VERSION_KEY = 'preset_categories_version'

/** v2 新增的预设分类名（升级时仅补插这些） */
const NEW_CATEGORY_NAMES_V2 = new Set([
  '零食饮料', '通讯', '日用百货', '服饰美妆', '订阅会员', '水电燃气',
  '运动健身', '旅游', '宠物', '人情往来',
  '红包', '生活费', '报销', '退款', '二手闲置',
])

function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT "value" FROM app_settings WHERE "key" = ?`).get(key) as { value: string | null } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  db.prepare(`INSERT INTO app_settings ("key","value") VALUES (?,?)
    ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`).run(key, value)
}

// ---------- 账户预设（与原 src/db/accounts.ts 保持一致） ----------
const FIXED_ACCOUNTS = [
  { name: '微信', icon: 'message-circle', color: '#C8DEC8' },
  { name: '支付宝', icon: 'wallet', color: '#C8D4EC' },
]
const CUSTOM_ACCOUNT_DEFAULT = { name: '其他', icon: 'briefcase', color: '#BBA28F' }
const LEGACY_PRESET_NAMES = ['银行卡', '现金']

// ---------- 存量图标升级：emoji → lucide 图标名（幂等，仅命中旧值才更新） ----------
const ICON_MIGRATIONS: Record<string, string> = {
  // 账户（旧预设/旧选择器 emoji）
  '💬': 'message-circle', '💰': 'wallet', '💼': 'briefcase', '💳': 'credit-card',
  '🏦': 'landmark', '💵': 'banknote', '🎯': 'target', '💎': 'gem', '🪙': 'coins',
  '📱': 'smartphone',
  // 目标（旧选择器 emoji）
  '🏠': 'home', '🚗': 'car', '✈️': 'plane', '✈': 'plane', '💻': 'laptop',
  '🎓': 'graduation-cap', '🎁': 'gift',
}

/** 把三张表里残留的旧 emoji 图标值统一升级为 lucide 图标名 */
function upgradeIcons(): void {
  for (const table of ['accounts', 'goals', 'categories']) {
    const stmt = db.prepare(`UPDATE "${table}" SET "icon" = ? WHERE "icon" = ?`)
    for (const [oldIcon, newIcon] of Object.entries(ICON_MIGRATIONS)) {
      stmt.run(newIcon, oldIcon)
    }
  }
}

// ---------- 存量配色升级：旧大地色系 → 统一粉彩双档色板（幂等，仅命中旧值才更新） ----------
const COLOR_MIGRATIONS: Record<string, string> = {
  '#3B82F6': '#C8D4EC', // 旧冷蓝 → 灰蓝
  '#C47A6C': '#EFC8C8', // 赭红（餐饮/医疗）→ 绯红
  '#D49488': '#BA9C9C', // 赭粉（娱乐）→ 绯红蒙灰
  '#8B7355': '#BBA28F', // 深棕（交通/教育/其他账户）→ 杏橙蒙灰
  '#A89370': '#B5AC83', // 黄褐（购物）→ 麦秆蒙灰
  '#6B8E5A': '#C8DEC8', // 橄榄绿（居住/工资/微信）→ 灰绿
  '#8FB87C': '#E8DCA8', // 浅橄榄（奖金）→ 麦秆黄（奖金=金色）
  '#547046': '#C8D4EC', // 深橄榄（投资）→ 灰蓝（金融蓝）
  '#B8D1AC': '#9CAD9C', // 浅灰绿（兼职）→ 灰绿蒙灰
}

/** 把三张表里残留的旧大地色系统一迁移到粉彩双档色板（幂等，仅命中旧值才更新） */
function upgradeColors(): void {
  for (const table of ['accounts', 'goals', 'categories']) {
    const stmt = db.prepare(`UPDATE "${table}" SET "color" = ? WHERE "color" = ?`)
    for (const [oldColor, newColor] of Object.entries(COLOR_MIGRATIONS)) {
      stmt.run(newColor, oldColor)
    }
  }
}

function allRows(table: string): Record<string, any>[] {
  return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid ASC`).all() as Record<string, any>[]
}

function insertCategory(c: { name: string; type: string; icon: string; color: string; sortOrder: number }): void {
  db.prepare(`INSERT INTO categories ("id","name","type","icon","color","isPreset","sortOrder") VALUES (?,?,?,?,?,1,?)`)
    .run(uid(), c.name, c.type, c.icon, c.color, c.sortOrder)
}

/** 交易引用重定向：dupId → keeperId */
function redirectTransactions(fromAccountId: string, toAccountId: string): void {
  db.prepare(`UPDATE transactions SET "accountId" = ? WHERE "accountId" = ?`).run(toAccountId, fromAccountId)
}

function redirectCategoryTransactions(fromCategoryId: string, toCategoryId: string): void {
  db.prepare(`UPDATE transactions SET "categoryId" = ? WHERE "categoryId" = ?`).run(toCategoryId, fromCategoryId)
}

function deleteRow(table: string, id: string): void {
  db.prepare(`DELETE FROM "${table}" WHERE "id" = ?`).run(id)
}

function bootstrapCategories(): void {
  let existing = allRows('categories')

  // 全新数据库：插入全部预设并记录版本
  if (existing.length === 0) {
    for (const c of PRESET_CATEGORIES) insertCategory(c)
    setSetting(PRESET_VERSION_KEY, String(PRESET_CATEGORIES_VERSION))
    return
  }

  // 1. 合并历史重复的预设分类（同名同类型，仅限 isPreset=1）
  const seen = new Map<string, string>() // `type:name` -> keeper id
  const dups: Record<string, any>[] = []
  for (const cat of existing) {
    if (cat.isPreset !== 1) continue
    const key = `${cat.type}:${cat.name}`
    if (seen.has(key)) dups.push(cat)
    else seen.set(key, cat.id)
  }
  for (const dup of dups) {
    const keeperId = seen.get(`${dup.type}:${dup.name}`)!
    redirectCategoryTransactions(dup.id, keeperId)
    deleteRow('categories', dup.id)
  }

  // 2. 补上缺失的"未分类"（用户删过的其他预设不复活）
  for (const type of ['expense', 'income']) {
    const preset = PRESET_CATEGORIES.find(p => p.type === type && p.name === '未分类')
    const exists = allRows('categories').some(c => c.type === type && c.name === '未分类')
    if (!exists && preset) insertCategory(preset)
  }

  // 3. 预设版本升级：仅补插该版本新增的分类（用户已自建同名同类型分类时跳过，不重复）
  existing = allRows('categories')
  const version = Number(getSetting(PRESET_VERSION_KEY) || 0)
  if (version < PRESET_CATEGORIES_VERSION) {
    const known = new Set(existing.map(c => `${c.type}:${c.name}`))
    for (const p of PRESET_CATEGORIES) {
      if (!NEW_CATEGORY_NAMES_V2.has(p.name)) continue
      if (known.has(`${p.type}:${p.name}`)) continue
      insertCategory(p)
    }
    setSetting(PRESET_VERSION_KEY, String(PRESET_CATEGORIES_VERSION))
  }

  // 4. 预设分类排序对齐最新清单（幂等，只影响 isPreset=1 的行，不碰用户自建分类）
  for (const p of PRESET_CATEGORIES) {
    db.prepare(`UPDATE categories SET "sortOrder" = ? WHERE "type" = ? AND "name" = ? AND "isPreset" = 1`)
      .run(p.sortOrder, p.type, p.name)
  }
}

function bootstrapAccounts(): void {
  let existing = allRows('accounts')

  // 1. 合并重名的固定账户（微信/支付宝）
  for (const fixed of FIXED_ACCOUNTS) {
    const dups = existing.filter(a => a.name === fixed.name)
    if (dups.length > 1) {
      const keeper = dups[0]
      let extraInitial = 0
      for (const dup of dups.slice(1)) {
        extraInitial += dup.initialBalance || 0
        redirectTransactions(dup.id, keeper.id)
        deleteRow('accounts', dup.id)
      }
      if (extraInitial !== 0) {
        db.prepare(`UPDATE accounts SET "initialBalance" = ? WHERE "id" = ?`)
          .run((keeper.initialBalance || 0) + extraInitial, keeper.id)
      }
    }
  }

  // 2. 清理旧版预设账户（仅 isPreset=1 的银行卡/现金，合并到自定义账户）
  existing = allRows('accounts')
  const legacyAccounts = existing.filter(a => a.isPreset === 1 && LEGACY_PRESET_NAMES.includes(a.name))
  if (legacyAccounts.length > 0) {
    let custom = existing.find(a => a.isPreset === 0 && !FIXED_ACCOUNTS.some(f => f.name === a.name))
    if (!custom) {
      const id = uid()
      db.prepare(`INSERT INTO accounts ("id","name","icon","color","initialBalance","isPreset","sortOrder","status","createdAt") VALUES (?,?,?,?,0,0,3,'active',?)`)
        .run(id, CUSTOM_ACCOUNT_DEFAULT.name, CUSTOM_ACCOUNT_DEFAULT.icon, CUSTOM_ACCOUNT_DEFAULT.color, Date.now())
      custom = { id }
    }
    let extraInitial = 0
    for (const legacy of legacyAccounts) {
      extraInitial += legacy.initialBalance || 0
      redirectTransactions(legacy.id, custom!.id)
      deleteRow('accounts', legacy.id)
    }
    if (extraInitial !== 0) {
      const cur = db.prepare(`SELECT "initialBalance" AS b FROM accounts WHERE "id" = ?`).get(custom!.id) as { b: number }
      db.prepare(`UPDATE accounts SET "initialBalance" = ? WHERE "id" = ?`).run(cur.b + extraInitial, custom!.id)
    }
  }

  // 3. 确保固定账户存在
  existing = allRows('accounts')
  const currentNames = new Set(existing.map(a => a.name))
  FIXED_ACCOUNTS.forEach((f, i) => {
    if (!currentNames.has(f.name)) {
      db.prepare(`INSERT INTO accounts ("id","name","icon","color","initialBalance","isPreset","sortOrder","status","createdAt") VALUES (?,?,?,?,0,1,?, 'active',?)`)
        .run(uid(), f.name, f.icon, f.color, i + 1, Date.now())
    }
  })

  // 4. 确保自定义账户存在且唯一（多余的自定义账户合并到第一个）
  const final = allRows('accounts')
  const customAccounts = final.filter(a => !FIXED_ACCOUNTS.some(f => f.name === a.name))
  if (customAccounts.length === 0) {
    db.prepare(`INSERT INTO accounts ("id","name","icon","color","initialBalance","isPreset","sortOrder","status","createdAt") VALUES (?,?,?,?,0,0,3,'active',?)`)
      .run(uid(), CUSTOM_ACCOUNT_DEFAULT.name, CUSTOM_ACCOUNT_DEFAULT.icon, CUSTOM_ACCOUNT_DEFAULT.color, Date.now())
  } else if (customAccounts.length > 1) {
    const keeper = customAccounts[0]
    let extraInitial = 0
    for (const dup of customAccounts.slice(1)) {
      extraInitial += dup.initialBalance || 0
      redirectTransactions(dup.id, keeper.id)
      deleteRow('accounts', dup.id)
    }
    if (extraInitial !== 0) {
      db.prepare(`UPDATE accounts SET "initialBalance" = ? WHERE "id" = ?`)
        .run((keeper.initialBalance || 0) + extraInitial, keeper.id)
    }
  }
}

/** 预设初始化（单事务，幂等） */
export function bootstrap(): void {
  db.exec('BEGIN')
  try {
    bootstrapCategories()
    bootstrapAccounts()
    upgradeIcons()
    upgradeColors()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
