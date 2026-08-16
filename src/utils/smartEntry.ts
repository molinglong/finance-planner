// ============================================
// 智能记账：一句话解析为交易草稿（AI 只做字段提取，校验与换算在本地完成）
// ============================================
import { Account, Category, TransactionType } from '../types'

/** 解析出的交易草稿：金额单位为元，categoryId/accountId 未匹配到时为空串 */
export interface SmartEntryDraft {
  type: TransactionType
  amount: number // 元
  categoryId: string
  accountId: string
  date: string // YYYY-MM-DD
  note: string
}

/** 构建智能记账的 system prompt：注入分类/账户列表与今天日期，要求纯 JSON 输出 */
export function buildSmartEntrySystemPrompt(
  categories: Category[],
  accounts: Account[],
  today: string
): string {
  const expenseNames = categories.filter(c => c.type === 'expense').map(c => c.name).join('、')
  const incomeNames = categories.filter(c => c.type === 'income').map(c => c.name).join('、')
  const accountNames = accounts.map(a => a.name).join('、')
  // 昨天日期（本地时区计算，避免 UTC 偏差）
  const [y, m, d] = today.split('-').map(Number)
  const yesterday = (() => {
    const dt = new Date(y, m - 1, d - 1)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  })()

  return [
    '你是记账信息提取器，把用户的一句话解析成一笔交易的字段。只输出一个 JSON 对象，禁止输出任何解释文字、前缀或 Markdown 代码块。',
    '输出格式：{"type":"expense 或 income","amount":数字,"categoryName":"分类名","accountName":"账户名","date":"YYYY-MM-DD","note":"备注"}',
    '字段规则：',
    '- type：收入（工资、奖金、红包、退款等）填 income，支出填 expense，拿不准填 expense',
    '- amount：原文中的金额数字，单位元，去掉 ¥、元 等符号',
    '- categoryName：必须从对应 type 的分类列表里选最贴切的一个；没有贴切的填空字符串',
    '- accountName：原文提到支付方式或账户时，从账户列表里选；没提到填空字符串',
    `- date：今天是 ${today}，把「昨天」「上周五」「本月3号」等相对日期换算为具体日期；原文没提日期就填 "${today}"`,
    '- note：不超过 15 字的简短说明，概括这笔钱的用途',
    `支出分类列表：${expenseNames || '（空）'}`,
    `收入分类列表：${incomeNames || '（空）'}`,
    `账户列表：${accountNames || '（空）'}`,
    `示例：输入「昨天午饭花了35，微信付的」-> {"type":"expense","amount":35,"categoryName":"<从支出分类列表选>","accountName":"<从账户列表选>","date":"${yesterday}","note":"午饭"}`,
  ].join('\n')
}

/** 从 AI 回复中提取 JSON：依次尝试直接解析、代码块围栏内、首尾大括号截取 */
function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const attempts: string[] = [trimmed]
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) attempts.push(fence[1].trim())
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1))
  for (const s of attempts) {
    try {
      const parsed = JSON.parse(s)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* 尝试下一种 */
    }
  }
  return null
}

/** 金额归一化：去除符号后取数，必须为正的有限数，保留两位小数；非法返回 NaN */
export function normalizeAmount(value: unknown): number {
  let n: number
  if (typeof value === 'number') {
    n = value
  } else if (typeof value === 'string') {
    n = parseFloat(value.replace(/[^\d.]/g, ''))
  } else {
    return NaN
  }
  if (!Number.isFinite(n) || n <= 0) return NaN
  return Math.round(n * 100) / 100
}

/** 日期归一化：YYYY-MM-DD 且为真实日期（本地时区校验，避免 UTC 偏差），非法回退 fallback */
export function normalizeDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return fallback
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return fallback
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 按名称匹配分类（限定同类型）：先精确，再互相包含；匹配不到返回空串 */
export function findCategoryId(name: string, categories: Category[], type: TransactionType): string {
  const n = name.trim()
  if (!n) return ''
  const pool = categories.filter(c => c.type === type)
  const exact = pool.find(c => c.name === n)
  if (exact) return exact.id
  const fuzzy = pool.find(c => c.name.includes(n) || n.includes(c.name))
  return fuzzy ? fuzzy.id : ''
}

/** 按名称匹配账户：先精确，再互相包含；匹配不到返回空串 */
export function findAccountId(name: string, accounts: Account[]): string {
  const n = name.trim()
  if (!n) return ''
  const exact = accounts.find(a => a.name === n)
  if (exact) return exact.id
  const fuzzy = accounts.find(a => a.name.includes(n) || n.includes(a.name))
  return fuzzy ? fuzzy.id : ''
}

/**
 * 解析 AI 回复为交易草稿；金额缺失或非法时返回 null（由调用方提示手动填写）。
 * 分类/账户匹配不到时对应字段为空串，交给表单默认值兜底。
 */
export function parseSmartEntryReply(
  reply: string,
  categories: Category[],
  accounts: Account[],
  today: string
): SmartEntryDraft | null {
  const obj = extractJson(reply)
  if (!obj) return null
  const amount = normalizeAmount(obj.amount)
  if (Number.isNaN(amount)) return null
  const type: TransactionType = obj.type === 'income' ? 'income' : 'expense'
  const categoryName = typeof obj.categoryName === 'string' ? obj.categoryName : ''
  const accountName = typeof obj.accountName === 'string' ? obj.accountName : ''
  const note = typeof obj.note === 'string' ? obj.note.trim().slice(0, 30) : ''
  return {
    type,
    amount,
    categoryId: findCategoryId(categoryName, categories, type),
    accountId: findAccountId(accountName, accounts),
    date: normalizeDate(obj.date, today),
    note,
  }
}
