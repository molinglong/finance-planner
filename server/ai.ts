// ============================================
// AI 助手：配置存取（app_settings）+ OpenAI 兼容接口代理
// 密钥只存本机 SQLite，前端永不接触明文密钥
// ============================================
import { db } from './db'

export interface AiConfig {
  baseUrl: string // OpenAI 兼容地址，如 https://api.deepseek.com/v1
  apiKey: string
  model: string // 如 deepseek-chat
}

const CONFIG_KEY = 'ai_config'

export function getAiConfig(): AiConfig | null {
  const row = db.prepare('SELECT "value" FROM app_settings WHERE "key" = ?').get(CONFIG_KEY) as { value: string | null } | undefined
  if (!row || !row.value) return null
  try {
    const cfg = JSON.parse(row.value)
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) return null
    return cfg as AiConfig
  } catch {
    return null
  }
}

/** 保存配置；apiKey 留空表示保留原密钥，clearApiKey 清除密钥 */
export function saveAiConfig(input: {
  baseUrl: string
  model: string
  apiKey?: string
  clearApiKey?: boolean
}): AiConfig | null {
  const prev = getAiConfig()
  const apiKey = input.clearApiKey
    ? ''
    : input.apiKey && input.apiKey.trim()
      ? input.apiKey.trim()
      : prev?.apiKey || ''
  const cfg = {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    apiKey,
    model: input.model.trim(),
  }
  db.prepare('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)').run(CONFIG_KEY, JSON.stringify(cfg))
  return getAiConfig()
}

export class AiError extends Error {}

export interface AiChatResult {
  reply: string
  reasoning: string // 思考过程（深度思考模式下模型返回，普通模式为空字符串）
  /** 本轮实际执行过的工具名（如 ['web_search']），供上层做报价提示兜底 */
  usedTools: string[]
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatResponse {
  choices?: {
    message?: {
      content?: string
      /** DeepSeek/DashScope 等中文系 OpenAI 兼容接口的思考过程字段 */
      reasoning_content?: string
      /** 部分供应商使用 reasoning 字段 */
      reasoning?: string
      /** function calling：模型请求调用的工具 */
      tool_calls?: ToolCall[]
    }
  }[]
}

/** 对话消息（含工具调用中间态；仅服务端内部使用，不外泄） */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

/** 工具集：OpenAI 兼容定义 + 本地执行器 */
export interface AiToolSet {
  defs: { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[]
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

/**
 * 调用 OpenAI 兼容 /chat/completions，返回助手回复文本与思考过程；
 * 传入 tools 时启用 function calling 循环（模型请求 → 本地执行 → 结果回传，最多 3 轮）；
 * thinking=true 附带 enable_thinking 参数（千问/DashScope 等惯例），部分供应商与 tools 互斥，
 * 400 时按「去 thinking → 去 tools」顺序降级重试
 */
export async function aiChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { thinking?: boolean; tools?: AiToolSet }
): Promise<AiChatResult> {
  const cfg = getAiConfig()
  if (!cfg) throw new AiError('AI 未配置，请先在设置页填写接口地址、密钥与模型名')

  const requestOnce = async (
    convo: ChatMessage[],
    enableThinking: boolean,
    withTools: boolean,
    tools?: AiToolSet
  ): Promise<
    { ok: true; data: ChatResponse } | { ok: false; status: number; text: string }
  > => {
    const controller = new AbortController()
    // 深度思考/工具循环耗时更长，超时放宽到 120 秒
    const timer = setTimeout(() => controller.abort(), enableThinking || withTools ? 120_000 : 60_000)
    try {
      const body: Record<string, unknown> = { model: cfg.model, messages: convo, temperature: 0.7, stream: false }
      if (enableThinking) body.enable_thinking = true
      if (withTools && tools) body.tools = tools.defs
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { ok: false, status: res.status, text }
      }
      return { ok: true, data: (await res.json()) as ChatResponse }
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    const usedTools: string[] = []
    const convo: ChatMessage[] = messages.map(m => ({ ...m }))
    let useThinking = opts?.thinking === true
    let useTools = !!opts?.tools
    let result = await requestOnce(convo, useThinking, useTools, opts?.tools)

    // 400 降级链：thinking+tools → tools → 纯文本（部分供应商不支持其中某个参数）
    if (!result.ok && result.status === 400) {
      if (useThinking) {
        useThinking = false
        result = await requestOnce(convo, useThinking, useTools, opts?.tools)
      }
      if (!result.ok && result.status === 400 && useTools) {
        useTools = false
        result = await requestOnce(convo, useThinking, useTools)
      }
    }

    // 工具循环：模型请求调用工具 → 本地执行 → 以 tool 消息回传 → 再请求（最多 3 轮）
    for (let round = 0; round < 3 && result.ok; round++) {
      const msg = result.data.choices?.[0]?.message
      const calls = msg?.tool_calls
      if (!useTools || !calls?.length) break
      convo.push({
        role: 'assistant',
        content: msg?.content || '',
        tool_calls: calls,
      })
      for (const tc of calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
        } catch {
          /* 参数不合法时按空参执行，由执行器返回错误说明 */
        }
        let output: unknown
        try {
          output = await opts!.tools!.execute(tc.function.name, args)
        } catch (err) {
          output = { error: err instanceof Error ? err.message : '工具执行失败' }
        }
        if (!usedTools.includes(tc.function.name)) usedTools.push(tc.function.name)
        convo.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(output).slice(0, 6000),
        })
      }
      result = await requestOnce(convo, useThinking, useTools, opts?.tools)
      if (!result.ok && result.status === 400 && useThinking) {
        // 工具轮次中 thinking 与 tools 冲突的供应商：降级去掉 thinking 继续
        useThinking = false
        result = await requestOnce(convo, useThinking, useTools, opts?.tools)
      }
    }

    if (!result.ok) {
      throw new AiError(`AI 接口返回 ${result.status}${result.text ? `：${result.text.slice(0, 300)}` : ''}`)
    }
    const message = result.data.choices?.[0]?.message
    const reasoning = message?.reasoning_content || message?.reasoning || ''
    const reply = message?.content || ''
    if (!reply && !reasoning) throw new AiError('AI 返回内容为空')
    // 个别模型只回思考过程：把思考过程作为正文返回，避免空白回复
    return { reply: reply || reasoning, reasoning: reply ? reasoning : '', usedTools }
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof Error && err.name === 'AbortError') throw new AiError('AI 响应超时')
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'fetch failed' || err instanceof TypeError) {
      throw new AiError('无法连接 AI 接口，请检查设置中的接口地址是否正确')
    }
    throw new AiError(`AI 请求失败：${msg}`)
  }
}
