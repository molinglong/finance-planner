// ============================================
// HTTP 客户端封装：自动带 token、JSON 序列化、401 处理
// ============================================
import { Capacitor } from '@capacitor/core'

const TOKEN_KEY = 'fp_token'
const API_BASE_KEY = 'fp_api_base'

/**
 * 解析 API 根地址：
 * 1. 构建时 VITE_API_BASE 显式指定（部署场景）
 * 2. Capacitor 原生环境：优先读用户设置的服务器地址；
 *    默认 10.0.2.2 = 模拟器宿主机（真机需改为局域网 IP）
 * 3. 浏览器：同源相对路径（dev 走 vite 代理，生产由 Express 托管）
 */
function resolveApiBase(): string {
  const envBase = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE
  if (envBase) return envBase
  if (Capacitor.isNativePlatform()) {
    return localStorage.getItem(API_BASE_KEY) || 'http://10.0.2.2:3001'
  }
  return ''
}

export const API_BASE = resolveApiBase()

/** 设置/清除移动端服务器地址（清除后回到默认 10.0.2.2） */
export function setApiBase(base: string | null): void {
  if (base) localStorage.setItem(API_BASE_KEY, base)
  else localStorage.removeItem(API_BASE_KEY)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, '无法连接服务器，请确认后端已启动')
  }

  if (!res.ok) {
    // 令牌失效：广播事件，由 App 层统一登出
    if (res.status === 401 && !path.startsWith('/auth')) {
      window.dispatchEvent(new Event('fp:unauthorized'))
    }
    let message = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') message = data.error
    } catch {
      // 忽略非 JSON 响应
    }
    throw new ApiError(res.status, message)
  }

  return res.json() as Promise<T>
}
