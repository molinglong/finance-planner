// ============================================
// AI 助手面板的跨组件状态：收起态 + 外部投喂消息
// 场景：灵魂拷问结论卡「去 AI 助手细聊」等入口，把话题一键交给右侧常驻面板
// ============================================
import { create } from 'zustand'

const PANEL_STORAGE_KEY = 'ai-panel-collapsed'

function readCollapsedFromStorage(): boolean {
  try {
    return localStorage.getItem(PANEL_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistCollapsed(v: boolean): void {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, String(v))
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 交接卡片数据：仅用于面板展示（AI 收到的仍是完整文字，卡片不参与对话） */
export interface AiHandoffCard {
  /** 物品名 */
  goalName: string
  /** 价格（分） */
  price: number
  /** 种草来源 */
  source?: string
  /** 心动理由 */
  reason?: string
  /** 拷问结论徽章 */
  verdict?: {
    label: string
    dustRate: number
    tone: 'recommend' | 'neutral' | 'avoid'
  }
  /** 问答摘要（问 / 答） */
  qa: { q: string; a: string }[]
  /** 转交的问题（卡片底部展示） */
  question: string
}

/** 一条待投喂的面板消息：发给 AI 的文字 + 可选的展示卡片 */
export interface PanelHandoff {
  question: string
  card?: AiHandoffCard
}

interface AiPanelState {
  /** 是否收起（沿用原 localStorage 键，刷新保持） */
  collapsed: boolean
  /** 外部投喂的消息，AiPanel 消费后自动清空 */
  pending: PanelHandoff | null
  expand: () => void
  collapse: () => void
  /** 投喂消息：展开面板并排队发送（question 发给 AI，card 仅用于展示） */
  sendToPanel: (question: string, card?: AiHandoffCard) => void
  clearPending: () => void
}

export const useAiPanelStore = create<AiPanelState>(set => ({
  collapsed: readCollapsedFromStorage(),
  pending: null,
  expand: () => {
    persistCollapsed(false)
    set({ collapsed: false })
  },
  collapse: () => {
    persistCollapsed(true)
    set({ collapsed: true })
  },
  sendToPanel: (question, card) => {
    persistCollapsed(false)
    set({ collapsed: false, pending: { question, card } })
  },
  clearPending: () => set({ pending: null }),
}))
