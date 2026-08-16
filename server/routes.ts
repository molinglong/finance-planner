// ============================================
// API 路由：认证 + 7 张表通用 CRUD + 业务动作
// ============================================
import { Router, type Request, type Response } from 'express'
import { db, TABLES, rowToClient, toDbValue, type TableConfig } from './db'
import { needSetup, setupPassword, loginWithPassword, requireAuth, hasData, AuthError } from './auth'
import { bootstrap } from './bootstrap'
import { processDueRecurring } from './recurring'
import { getAiConfig, saveAiConfig, aiChat, AiError, type AiToolSet } from './ai'
import {
  getSearchConfig,
  saveSearchConfig,
  deleteSearchConfig,
  webSearch,
  formatSearchTime,
  SEARCH_PROMPT,
  WEB_SEARCH_TOOL_DEF,
  runWebSearchTool,
  SearchError,
} from './search'

export const apiRouter = Router()

// ---------- 认证 ----------
apiRouter.post('/auth/setup', (req: Request, res: Response) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: '请输入密码' })
    return
  }
  try {
    const token = setupPassword(password)
    res.json({ token })
  } catch (err) {
    if (err instanceof AuthError) res.status(400).json({ error: err.message })
    else res.status(500).json({ error: '设置密码失败' })
  }
})

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: '请输入密码' })
    return
  }
  try {
    const token = loginWithPassword(password)
    res.json({ token })
  } catch (err) {
    if (err instanceof AuthError) res.status(401).json({ error: err.message })
    else res.status(500).json({ error: '登录失败' })
  }
})

// 无需登录：判断首次设置/是否已有数据（不含敏感信息）
apiRouter.get('/auth/status', (_req: Request, res: Response) => {
  res.json({ needSetup: needSetup(), hasData: hasData() })
})

// 校验当前 token 是否有效
apiRouter.get('/verify', requireAuth, (_req: Request, res: Response) => {
  res.json({ ok: true })
})

// ---------- 业务动作 ----------
apiRouter.post('/bootstrap', requireAuth, (_req: Request, res: Response) => {
  try {
    bootstrap()
    res.json({ ok: true })
  } catch (err) {
    console.error('[bootstrap] failed:', err)
    res.status(500).json({ error: '预设数据初始化失败' })
  }
})

apiRouter.post('/process-recurring', requireAuth, (_req: Request, res: Response) => {
  try {
    const result = processDueRecurring()
    res.json(result)
  } catch (err) {
    console.error('[process-recurring] failed:', err)
    res.status(500).json({ error: '周期收支处理失败' })
  }
})

// 清除所有业务数据（恢复出厂）：清空业务表后重建预设；保留密码与 AI 配置
apiRouter.post('/clear-data', requireAuth, (_req: Request, res: Response) => {
  try {
    db.exec('BEGIN')
    for (const table of ['transactions', 'goals', 'budgets', 'recurringIncomes', 'recurringExpenses', 'accounts', 'categories']) {
      db.prepare(`DELETE FROM "${table}"`).run()
    }
    db.exec('COMMIT')
    // bootstrap 内部有自己的事务，不能嵌套，放在清除事务之外
    bootstrap()
    res.json({ ok: true })
  } catch (err) {
    db.exec('ROLLBACK')
    console.error('[clear-data] failed:', err)
    res.status(500).json({ error: '清除数据失败' })
  }
})

// ---------- AI 助手（必须在通用 CRUD 之前注册，避免 /:table/:id 抢先匹配） ----------

// 读取配置（不回传密钥明文）
apiRouter.get('/ai/config', requireAuth, (_req: Request, res: Response) => {
  const cfg = getAiConfig()
  if (!cfg) {
    res.json({ configured: false })
    return
  }
  res.json({ configured: true, baseUrl: cfg.baseUrl, model: cfg.model })
})

// 保存配置（apiKey 留空 = 保留原密钥）
apiRouter.put('/ai/config', requireAuth, (req: Request, res: Response) => {
  const { baseUrl, model, apiKey, clearApiKey } = req.body || {}
  if (typeof baseUrl !== 'string' || !baseUrl.trim() || typeof model !== 'string' || !model.trim()) {
    res.status(400).json({ error: '请填写接口地址与模型名' })
    return
  }
  const cfg = saveAiConfig({ baseUrl, model, apiKey, clearApiKey })
  res.json({ ok: true, configured: !!cfg })
})

// 彻底删除配置（含密钥）
apiRouter.delete('/ai/config', requireAuth, (_req: Request, res: Response) => {
  db.prepare('DELETE FROM app_settings WHERE "key" = ?').run('ai_config')
  res.json({ ok: true })
})

// ---------- 联网搜索配置 ----------

// 读取搜索配置（不回传密钥明文）
apiRouter.get('/ai/search-config', requireAuth, (_req: Request, res: Response) => {
  const cfg = getSearchConfig()
  if (!cfg) {
    res.json({ configured: false })
    return
  }
  res.json({ configured: true, provider: cfg.provider })
})

// 保存搜索配置（apiKey 留空 = 保留原密钥）
apiRouter.put('/ai/search-config', requireAuth, (req: Request, res: Response) => {
  const { provider, apiKey, clearApiKey } = req.body || {}
  if (provider !== 'bocha' && provider !== 'tavily') {
    res.status(400).json({ error: '请选择搜索服务商（博查 / Tavily）' })
    return
  }
  const cfg = saveSearchConfig({ provider, apiKey, clearApiKey })
  res.json({ ok: true, configured: !!cfg })
})

// 彻底删除搜索配置（含密钥）
apiRouter.delete('/ai/search-config', requireAuth, (_req: Request, res: Response) => {
  deleteSearchConfig()
  res.json({ ok: true })
})

// 测试搜索：默认搜「今日黄金价格」，返回首条结果标题与搜索时间戳
apiRouter.post('/ai/search-test', requireAuth, async (req: Request, res: Response) => {
  const query = typeof req.body?.query === 'string' && req.body.query.trim() ? req.body.query.trim().slice(0, 100) : '今日黄金价格'
  try {
    const items = await webSearch(query)
    res.json({
      ok: true,
      count: items.length,
      searchTime: formatSearchTime(),
      first: items[0]?.title?.slice(0, 60) || '',
      firstSite: items[0]?.siteName || '',
    })
  } catch (err) {
    if (err instanceof SearchError) res.status(400).json({ error: err.message })
    else {
      console.error('[ai/search-test] failed:', err)
      res.status(500).json({ error: '搜索请求失败' })
    }
  }
})

// 测试连接
apiRouter.post('/ai/test', requireAuth, async (_req: Request, res: Response) => {
  try {
    const { reply } = await aiChat([{ role: 'user', content: '请只回复四个字：连接成功' }])
    res.json({ ok: true, reply: reply.slice(0, 100) })
  } catch (err) {
    if (err instanceof AiError) res.status(400).json({ error: err.message })
    else {
      console.error('[ai/test] failed:', err)
      res.status(500).json({ error: 'AI 请求失败' })
    }
  }
})

// 对话代理（只透传合法角色与纯文本，限长限条数）
apiRouter.post('/ai/chat', requireAuth, async (req: Request, res: Response) => {
  const { messages } = req.body || {}
  const thinking = req.body?.thinking === true
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: '消息不能为空' })
    return
  }
  const valid = (messages as unknown[])
    .filter((m): m is { role: 'system' | 'user' | 'assistant'; content: string } =>
      !!m && typeof m === 'object' &&
      ['user', 'assistant', 'system'].includes((m as any).role) &&
      typeof (m as any).content === 'string' && (m as any).content.length > 0)
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
  // system（上下文）始终保留，普通对话只保留最近 20 条
  const clean = [...valid.filter(m => m.role === 'system').slice(-3), ...valid.filter(m => m.role !== 'system').slice(-20)]
  if (clean.length === 0) {
    res.status(400).json({ error: '消息不能为空' })
    return
  }
  try {
    // 已配置搜索时：注入 web_search 工具（function calling 循环在 aiChat 内完成），
    // 并把防幻觉报价规范拼到最后一条 system 消息（没有 system 时新建一条），覆盖所有 AI 调用方
    const searchCfg = getSearchConfig()
    let clean2 = clean
    if (searchCfg) {
      const lastSys = [...clean].reverse().find(m => m.role === 'system')
      if (lastSys) {
        lastSys.content = `${lastSys.content}\n${SEARCH_PROMPT}`
      } else {
        clean2 = [{ role: 'system', content: SEARCH_PROMPT.trim() }, ...clean]
      }
    }
    const tools: AiToolSet | undefined = searchCfg
      ? {
          defs: [WEB_SEARCH_TOOL_DEF] as AiToolSet['defs'],
          execute: async (name, args) => {
            if (name === 'web_search') return runWebSearchTool(args)
            return { error: `不支持的工具「${name}」` }
          },
        }
      : undefined
    const result = await aiChat(clean2, { thinking, tools })
    let reply = result.reply
    // 报价提示双保险：本轮用过搜索且回复含价格数字，但模型忘了输出 FP_PRICE 标记时，由服务端补上
    const searched = result.usedTools.includes('web_search')
    if (searched && !/FP_PRICE\b/.test(reply) && /(?:[¥￥]\s*\d)|(\d[\d,]*(?:\.\d{1,2})?\s*[元块])/.test(reply)) {
      reply = `${reply}\nFP_PRICE`
    }
    res.json({ reply, reasoning: result.reasoning })
  } catch (err) {
    if (err instanceof AiError) res.status(400).json({ error: err.message })
    else {
      console.error('[ai/chat] failed:', err)
      res.status(500).json({ error: 'AI 请求失败' })
    }
  }
})

// ---------- 通用键值设置（app_settings 表，注册在通用 CRUD 之前避免 /:table/:id 抢先匹配） ----------

// 读取单个设置项（不存在时 value 为 null）
apiRouter.get('/app-settings/:key', requireAuth, (req: Request, res: Response) => {
  const row = db.prepare(`SELECT "value" FROM app_settings WHERE "key" = ?`).get(req.params.key) as { value: string | null } | undefined
  res.json({ key: req.params.key, value: row?.value ?? null })
})

// 写入设置项（UPSERT，value 必须是字符串，客户端自行序列化）
apiRouter.put('/app-settings/:key', requireAuth, (req: Request, res: Response) => {
  const { value } = req.body || {}
  if (typeof value !== 'string' || !req.params.key) {
    res.status(400).json({ error: '参数错误：value 应为字符串' })
    return
  }
  db.prepare(`INSERT INTO app_settings ("key", "value") VALUES (?, ?)
    ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`).run(req.params.key, value)
  res.json({ ok: true })
})

// ---------- 通用 CRUD ----------
function getTableConfig(table: string | undefined): { table: string; cfg: TableConfig } | null {
  if (!table || !(table in TABLES)) return null
  return { table, cfg: TABLES[table] }
}

/** 只保留白名单列 */
function pickValidColumns(body: Record<string, unknown>, cfg: TableConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (cfg.columns.includes(k)) out[k] = v
  }
  return out
}

// 列表
apiRouter.get('/:table', requireAuth, (req: Request, res: Response) => {
  const t = getTableConfig(req.params.table)
  if (!t) {
    res.status(404).json({ error: '未知数据表' })
    return
  }
  const rows = db.prepare(`SELECT * FROM "${t.table}" ${t.cfg.orderBy || ''}`).all() as Record<string, unknown>[]
  res.json(rows.map(r => rowToClient(r, t.cfg)))
})

// 单条
apiRouter.get('/:table/:id', requireAuth, (req: Request, res: Response) => {
  const t = getTableConfig(req.params.table)
  if (!t) {
    res.status(404).json({ error: '未知数据表' })
    return
  }
  const row = db.prepare(`SELECT * FROM "${t.table}" WHERE "id" = ?`).get(req.params.id) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: '记录不存在' })
    return
  }
  res.json(rowToClient(row, t.cfg))
})

// 新增（完整行，ID 由前端生成）
apiRouter.post('/:table', requireAuth, (req: Request, res: Response) => {
  const t = getTableConfig(req.params.table)
  if (!t) {
    res.status(404).json({ error: '未知数据表' })
    return
  }
  const row = pickValidColumns(req.body || {}, t.cfg)
  if (!row.id) {
    res.status(400).json({ error: '缺少 id' })
    return
  }
  const keys = Object.keys(row)
  if (keys.length === 0) {
    res.status(400).json({ error: '没有有效字段' })
    return
  }
  const sql = `INSERT INTO "${t.table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  try {
    db.prepare(sql).run(...keys.map(k => toDbValue(row[k], t.cfg, k)))
    res.json({ ok: true, id: row.id })
  } catch (err) {
    console.error(`[POST ${t.table}] failed:`, err)
    res.status(400).json({ error: '写入失败，可能 ID 重复' })
  }
})

// 批量写入（数据迁移用，事务内逐条 INSERT OR REPLACE）
apiRouter.post('/:table/bulk', requireAuth, (req: Request, res: Response) => {
  const t = getTableConfig(req.params.table)
  if (!t) {
    res.status(404).json({ error: '未知数据表' })
    return
  }
  const items = req.body
  if (!Array.isArray(items)) {
    res.status(400).json({ error: '请求体应为数组' })
    return
  }
  try {
    db.exec('BEGIN')
    for (const raw of items) {
      const row = pickValidColumns(raw || {}, t.cfg)
      if (!row.id) continue
      const keys = Object.keys(row)
      if (keys.length === 0) continue
      const sql = `INSERT OR REPLACE INTO "${t.table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
      db.prepare(sql).run(...keys.map(k => toDbValue(row[k], t.cfg, k)))
    }
    db.exec('COMMIT')
    res.json({ ok: true, count: items.length })
  } catch (err) {
    db.exec('ROLLBACK')
    console.error(`[POST ${t.table}/bulk] failed:`, err)
    res.status(500).json({ error: '批量写入失败' })
  }
})

// 更新（部分字段）
apiRouter.put('/:table/:id', requireAuth, (req: Request, res: Response) => {
  const t = getTableConfig(req.params.table)
  if (!t) {
    res.status(404).json({ error: '未知数据表' })
    return
  }
  const row = pickValidColumns(req.body || {}, t.cfg)
  delete row.id
  const keys = Object.keys(row)
  if (keys.length === 0) {
    res.json({ ok: true })
    return
  }
  const sql = `UPDATE "${t.table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE "id" = ?`
  try {
    db.prepare(sql).run(...keys.map(k => toDbValue(row[k], t.cfg, k)), req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[PUT ${t.table}] failed:`, err)
    res.status(400).json({ error: '更新失败' })
  }
})

// 删除
apiRouter.delete('/:table/:id', requireAuth, (req: Request, res: Response) => {
  const t = getTableConfig(req.params.table)
  if (!t) {
    res.status(404).json({ error: '未知数据表' })
    return
  }
  db.prepare(`DELETE FROM "${t.table}" WHERE "id" = ?`).run(req.params.id)
  res.json({ ok: true })
})
