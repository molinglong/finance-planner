// ============================================
// 色彩工具：低饱和粉彩色板 + 前景色自适应
// 粉彩六色与纸黄（cream）背景融合度最高，明度较高，
// 用作底色时必须搭配 readableTextColor 选择深/浅前景。
// ============================================

/** 粉彩六色：红 / 橙 / 黄 / 绿 / 蓝 / 紫（低饱和，不抢眼） */
export const SOFT_PALETTE = [
  '#EFC8C8', // 绯红：温暖柔和，带一点陶土感
  '#F0D0B8', // 杏橙：暖调偏杏色，与纸黄融合度最高
  '#E8DCA8', // 麦秆黄：明快但克制
  '#C8DEC8', // 灰绿：清新护眼，偏灰调
  '#C8D4EC', // 灰蓝：冷静通透，带灰调
  '#D4CCEC', // 雾紫：优雅梦幻，低饱和度
] as const

/**
 * 蒙灰中调：与粉彩同色系、同饱和度档，加深约 22%。
 * 用于图表大面积填充（环形图/柱状图），避免浅粉彩在白卡上洗白。
 */
export const DUSTY_MEDIUM: Record<string, string> = {
  '#EFC8C8': '#BA9C9C', // 绯红蒙灰：陶土玫瑰
  '#F0D0B8': '#BBA28F', // 杏橙蒙灰：亚麻棕
  '#E8DCA8': '#B5AC83', // 麦秆蒙灰：燕麦色
  '#C8DEC8': '#9CAD9C', // 灰绿蒙灰：鼠尾草
  '#C8D4EC': '#9CA5B8', // 灰蓝蒙灰：雾霭蓝
  '#D4CCEC': '#A59FB8', // 雾紫蒙灰：藤紫色
}

export const DUSTY_PALETTE = Object.values(DUSTY_MEDIUM)

/** 图表填充色：浅粉彩 → 同色系蒙灰中调；其余（中调/自定义深色）原样返回 */
export function chartColor(hex: string): string {
  return DUSTY_MEDIUM[hex.toUpperCase()] ?? hex
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('')
  }
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG 相对亮度：浅色（适合深色前景）返回 true */
export function isLightColor(hex: string): boolean {
  const lin = hexToRgb(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  return L > 0.35
}

/** 底色上的可读前景色：浅底配炭色、深底配白色 */
export function readableTextColor(hex: string): string {
  return isLightColor(hex) ? '#3D3A38' : '#FFFFFF'
}

/** 同色相加深（amount 取 0~1），用于把过浅的颜色压深 */
export function deepenColor(hex: string, amount = 0.5): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * (1 - amount))))
      .toString(16)
      .padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

/** 图标描边等前景色：过浅的颜色按同色相加深，保证白底上可见 */
export function iconStrokeColor(hex: string): string {
  return isLightColor(hex) ? deepenColor(hex, 0.5) : hex
}
