// ============================================
// AI 助手接口封装（配置 + 对话，走后端代理，密钥不出现在前端）
// ============================================
import { api } from './client'

export interface AiConfigInfo {
  configured: boolean
  baseUrl?: string
  model?: string
}

export function fetchAiConfig(): Promise<AiConfigInfo> {
  return api<AiConfigInfo>('/ai/config')
}

/** apiKey 留空 = 保留已存密钥；clearApiKey = 清除密钥 */
export function putAiConfig(data: {
  baseUrl: string
  model: string
  apiKey?: string
  clearApiKey?: boolean
}): Promise<{ ok: boolean; configured: boolean }> {
  return api('/ai/config', { method: 'PUT', body: data })
}

export function testAiConnection(): Promise<{ ok: boolean; reply: string }> {
  return api('/ai/test', { method: 'POST', body: {} })
}

// ---------- 联网搜索配置 ----------

export type SearchProvider = 'bocha' | 'tavily'

export interface SearchConfigInfo {
  configured: boolean
  provider?: SearchProvider
}

export function fetchSearchConfig(): Promise<SearchConfigInfo> {
  return api<SearchConfigInfo>('/ai/search-config')
}

/** apiKey 留空 = 保留已存密钥；clearApiKey = 清除密钥 */
export function putSearchConfig(data: {
  provider: SearchProvider
  apiKey?: string
  clearApiKey?: boolean
}): Promise<{ ok: boolean; configured: boolean }> {
  return api('/ai/search-config', { method: 'PUT', body: data })
}

export function testSearchConnection(query?: string): Promise<{
  ok: boolean
  count: number
  searchTime: string
  first: string
  firstSite: string
}> {
  return api('/ai/search-test', { method: 'POST', body: { query: query || '' } })
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * systemPrompt 会被拼在消息开头（分析数据等上下文）；thinking=true 开启深度思考（模型支持时返回思考过程）；
 * 服务端在回复包含报价时会追加 FP_PRICE 标记，这里统一剥离并转成 priceNote 字段（调用方据此渲染时效性提示）
 */
export function sendAiChat(
  messages: AiChatMessage[],
  systemPrompt?: string,
  opts?: { thinking?: boolean }
): Promise<{ reply: string; reasoning?: string; priceNote?: boolean }> {
  const body = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages
  return api<{ reply: string; reasoning?: string }>('/ai/chat', { method: 'POST', body: { messages: body, thinking: opts?.thinking === true } }).then(
    r => {
      const priceNote = /(^|\n)\s*FP_PRICE\s*(\n|$)/.test(r.reply)
      const reply = priceNote ? r.reply.replace(/(^|\n)\s*FP_PRICE\s*(?=(\n|$))/g, '').trim() : r.reply
      return { reply, reasoning: r.reasoning, priceNote: priceNote || undefined }
    }
  )
}
