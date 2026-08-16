import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Goal } from '../types'

/**
 * 冷静期应用锁（原生 App 专属）
 *
 * 锁定策略（原生侧编排）：
 * - Shizuku 在线且授权 → pm suspend 精确挂起QQ（图标保留、系统拦截启动）
 * - Shizuku 离线/失败 → 无障碍兑底锁QQ（防"故意不激活 Shizuku"绕过）
 * - 冷静期结束 → unsuspend 自动恢复QQ
 *
 * Web 端全部 no-op，桌面浏览器行为不变。
 */

export interface LockState {
  active: boolean
  endsAt: number
  labels: string
  scope: 'none' | 'all'
  serviceEnabled: boolean
  shizukuAlive: boolean
  shizukuGranted: boolean
  cloneSuspended: boolean
}

interface AppLockPlugin {
  applyLockState(options: { endsAt: number | null; labels?: string }): Promise<{
    locked: boolean
    scope: string
    shizukuMode: string
    cloneSuspended: boolean
  }>
  getLockState(): Promise<LockState>
  requestShizukuPermission(): Promise<{ requested: boolean }>
  openAccessibilitySettings(): Promise<void>
}

const plugin = Capacitor.isNativePlatform() ? registerPlugin<AppLockPlugin>('AppLock') : null

/** 是否在原生 App 中（Web 端返回 false） */
export function appLockAvailable(): boolean {
  return plugin !== null
}

/** 查询锁状态、无障碍服务与 Shizuku 状态 */
export function getAppLockState(): Promise<LockState | null> {
  if (!plugin) return Promise.resolve(null)
  return plugin.getLockState().catch(() => null)
}

/** 请求 Shizuku 授权（弹系统对话框） */
export function requestShizukuPermission(): void {
  if (plugin) plugin.requestShizukuPermission().catch(() => {})
}

/** 跳转系统无障碍设置页（兜底锁授权引导用） */
export function openAccessibilitySettings(): void {
  if (plugin) plugin.openAccessibilitySettings().catch(() => {})
}

/**
 * 将当前 goals 的冷静期状态同步到原生锁（统一入口）。
 * 规则：任一目标处于冷静期内 → 锁定至最晚到期时刻；否则清除并尝试恢复分身。
 */
export async function syncAppLockFromGoals(goals: Goal[]): Promise<void> {
  if (!plugin) return
  const now = Date.now()
  const cooling = goals.filter(g => g.status === 'cooling' && (g.coolingEndsAt ?? 0) > now)

  try {
    if (cooling.length === 0) {
      await plugin.applyLockState({ endsAt: null })
      return
    }
    const maxEndsAt = Math.max(...cooling.map(g => g.coolingEndsAt ?? 0))
    const names = cooling.slice(0, 3).map(g => g.name)
    if (cooling.length > 3) names.push(`等 ${cooling.length} 件`)
    await plugin.applyLockState({
      endsAt: maxEndsAt,
      labels: `正在冷静：${names.join('、')}`,
    })
  } catch {
    // 原生桥异常不阻塞主流程，下次 goals 变化会重试同步
  }
}
