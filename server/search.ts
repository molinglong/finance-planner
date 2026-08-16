// ============================================
// 联网搜索：配置存取（app_settings）+ 博查/Tavily 适配 + 价格抽取
// 防幻觉原则：价格由确定性代码从搜索结果中抽取，模型只负责转述，禁止用记忆报价
// ============================================
import { db } from './db'

export type SearchProvider = 'bocha' | 'tavily'

export interface SearchConfig {
  provider: SearchProvider
  apiKey: string
}

const CONFIG_KEY = 'search_config'

export function getSearchConfig(): SearchConfig | null {
  const row = db.prepare('SELECT "value" FROM app_settings WHERE "key" = ?').get(CONFIG_KEY) as { value: string | null } | undefined
  if (!row || !row.value) return null
  try {
    const cfg = JSON.parse(row.value)
    if (!cfg.apiKey || (cfg.provider !== 'bocha' && cfg.provider !== 'tavily')) return null
    return cfg as SearchConfig
  } catch {
    return null
  }
}

/** 保存配置；apiKey 留空表示保留原密钥，clearApiKey 清除密钥 */
export function saveSearchConfig(input: {
  provider: SearchProvider
  apiKey?: string
  clearApiKey?: boolean
}): SearchConfig | null {
  const prev = getSearchConfig()
  const apiKey = input.clearApiKey
    ? ''
    : input.apiKey && input.apiKey.trim()
      ? input.apiKey.trim()
      : prev?.apiKey || ''
  const cfg = { provider: input.provider, apiKey }
  db.prepare('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)').run(CONFIG_KEY, JSON.stringify(cfg))
  return getSearchConfig()
}

export function deleteSearchConfig(): void {
  db.prepare('DELETE FROM app_settings WHERE "key" = ?').run(CONFIG_KEY)
}

export class SearchError extends Error {}

// ---------- 搜索执行 ----------

/** 统一结果条目 */
export interface SearchItem {
  title: string
  url: string
  /** 摘要（优先供应商 summary，退回 snippet/content） */
  snippet: string
  /** 站点名（如 京东自营），供应商未提供时从 URL 提取域名 */
  siteName: string
}

/** 从 URL 提取展示用域名（去 www 前缀） */
function siteFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '网页'
  }
}

/** 调用博查或 Tavily，返回统一结构（最多 5 条）；密钥/网络问题抛 SearchError */
export async function webSearch(query: string): Promise<SearchItem[]> {
  const cfg = getSearchConfig()
  if (!cfg) throw new SearchError('联网搜索未配置，请先在设置页填写服务商与密钥')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(
      cfg.provider === 'bocha' ? 'https://api.bochaai.com/v1/web-search' : 'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(
          cfg.provider === 'bocha'
            ? { query, freshness: 'noLimit', summary: true, count: 5 }
            : { query, max_results: 5, include_answer: false }
        ),
        signal: controller.signal,
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // 401/403 基本是密钥问题，提示更友好
      if (res.status === 401 || res.status === 403) throw new SearchError('搜索密钥无效，请检查设置页的搜索密钥')
      throw new SearchError(`搜索接口返回 ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
    }
    const data = (await res.json()) as Record<string, any>

    // 博查：data.webPages.value[]；Tavily：data.results[]
    const raw: Record<string, any>[] =
      cfg.provider === 'bocha' ? (data?.data?.webPages?.value ?? []) : (data?.results ?? [])
    return raw.slice(0, 5).map(it => ({
      title: String(it.name ?? it.title ?? ''),
      url: String(it.url ?? ''),
      snippet: String(it.summary ?? it.snippet ?? it.content ?? '').slice(0, 600),
      siteName: String(it.siteName || '') || siteFromUrl(String(it.url ?? '')),
    }))
  } catch (err) {
    if (err instanceof SearchError) throw err
    if (err instanceof Error && err.name === 'AbortError') throw new SearchError('搜索请求超时')
    throw new SearchError('无法连接搜索接口，请检查网络')
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 价格抽取（确定性代码，模型不得自行报价） ----------

const PRICE_PATTERNS = [
  /(?:¥|￥|RMB\s*)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g,
  /([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:元|块)/g,
]

/**
 * 从一段文本中抽取价格（元），带货币标识才算价格，避免把年份/编号误当报价；
 * 范围过滤 [1, 99999999]，每段文本最多取 3 个
 */
export function extractPrices(text: string): number[] {
  const out: number[] = []
  for (const re of PRICE_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) && out.length < 3) {
      const n = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(n) && n >= 1 && n <= 99_999_999) out.push(Math.round(n * 100) / 100)
    }
    if (out.length >= 3) break
  }
  return [...new Set(out)]
}

// ---------- 时间戳（用户要求格式：2026.8.16 9:05） ----------

export function formatSearchTime(d = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${two(d.getMinutes())}`
}

// ---------- 防幻觉报价规范（服务端统一注入 system 消息，覆盖所有 AI 调用方） ----------

export const SEARCH_PROMPT = [
  '',
  '联网搜索：你可以调用 web_search 工具查询实时信息（已由系统接通）。规则：',
  '- 用户问商品价格、金价汇率、行情、时事等实时信息时，先调 web_search（query 写「商品名 价格」），禁止凭记忆报价',
  '- 报价铁律：1）只能引用工具结果里「抽取到的价格」出现过的数字；2）报区间（最低~最高），不报单点值；3）必须注明搜索时间（用工具结果里的「搜索时间」字段，如「2026.8.16 9:05 搜索」）和来源（如京东自营）；4）结果里的价格若是历史时段的，注明时段（如 2026.8月上旬）',
  '- 搜索结果里没有可用价格时：直接说没查到靠谱现价，让用户打开购物软件看实时价，不要给任何参考数字、不要猜',
  '- 回答包含任何报价时，必须在回复最后一行单独输出「FP_PRICE」（不要解释这一行是什么，系统会处理）',
  '- 本地账本数据（余额/预算/攒钱目标）仍以系统注入的数据为准，与搜索无关；两者结合分析时各用各的数',
].join('\n')

// ---------- web_search 工具定义与执行（供 ai.ts function calling 使用） ----------

export const WEB_SEARCH_TOOL_DEF = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '联网搜索实时信息（商品价格、行情、汇率、新闻等）。回答任何"现在多少钱/价格"类问题前必须先调用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，如「小米15 价格」「今日黄金价格 元/克」' },
      },
      required: ['query'],
    },
  },
} as const

/**
 * 执行 web_search 工具：只把结构化结果（标题/来源/摘要/代码抽取的价格/搜索时间）交给模型，
 * 模型只能引用其中的数字组织语言；搜索失败也以错误文本返回，让模型如实告知用户
 */
export async function runWebSearchTool(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args.query ?? '').trim().slice(0, 100)
  if (!query) return { error: '缺少搜索关键词' }
  try {
    const items = await webSearch(query)
    return {
      搜索时间: formatSearchTime(),
      结果说明: '以下是搜索结果。报价只能引用其中「抽取到的价格」字段出现过的数字，禁止使用你记忆中的价格。',
      results: items.map(it => ({
        标题: it.title.slice(0, 80),
        来源: it.siteName,
        链接: it.url,
        摘要: it.snippet.slice(0, 300),
        抽取到的价格: extractPrices(`${it.title} ${it.snippet}`),
      })),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '搜索失败' }
  }
}
