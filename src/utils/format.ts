// 金额格式化（分转元）
export function formatMoney(amount: number, showSign = false): string {
  const yuan = amount / 100
  const formatted = yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  
  if (showSign && amount > 0) {
    return `+${formatted}`
  }
  
  return formatted
}

// 元转分
export function yuanToCent(yuan: number): number {
  return Math.round(yuan * 100)
}

// 分转元
export function centToYuan(cent: number): number {
  return cent / 100
}

// 日期格式化
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// 获取当前月份 YYYY-MM
export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// 获取今天日期 YYYY-MM-DD（本地时区；toISOString 是 UTC，东八区早 8 点前会错成昨天）
export function getToday(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${day}`
}

// 获取月份范围
export function getMonthRange(month: string): { start: string; end: string } {
  return {
    start: `${month}-01`,
    end: `${month}-31`,
  }
}

// 获取最近 N 个月
export function getRecentMonths(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    months.push(month)
  }
  
  return months.reverse()
}

// 计算百分比
export function calculatePercentage(current: number, total: number): number {
  if (total === 0) return 0
  return Math.round((current / total) * 100)
}

// 获取月份显示名称
export function getMonthDisplayName(month: string): string {
  const [year, monthNum] = month.split('-')
  return `${year}年${parseInt(monthNum)}月`
}
