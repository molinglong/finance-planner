// ============================================
// 统一 SVG 图标注册表（lucide-react）
// 数据库中存储图标名（kebab-case 字符串），渲染时映射为 SVG 组件；
// 未注册的值（如迁移前的旧 emoji）按原样文本显示，保证不空白
// ============================================
import type { LucideIcon } from 'lucide-react'
import {
  HelpCircle, Utensils, Car, ShoppingBag, Gamepad2, Home, HeartPulse, BookOpen,
  MoreHorizontal, Briefcase, Award, TrendingUp, Clock, PlusCircle, Tag,
  MessageCircle, Wallet, CreditCard, Landmark, Banknote, PiggyBank, Coins,
  Smartphone, Gem, Target, Plane, Laptop, GraduationCap, Gift, Flame,
  Coffee, ShoppingBasket, Shirt, Wifi, Zap, Tv, PawPrint, Dumbbell,
  HeartHandshake, Receipt, RotateCcw, Recycle,
} from 'lucide-react'

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  // 分类预设（与 server/bootstrap.ts 保持一致）
  'help-circle': HelpCircle,
  'utensils': Utensils,
  'car': Car,
  'shopping-bag': ShoppingBag,
  'gamepad': Gamepad2,
  'home': Home,
  'heart-pulse': HeartPulse,
  'book-open': BookOpen,
  'more-horizontal': MoreHorizontal,
  'briefcase': Briefcase,
  'award': Award,
  'trending-up': TrendingUp,
  'clock': Clock,
  'plus-circle': PlusCircle,
  'tag': Tag,
  // 分类预设 v2 扩充
  'coffee': Coffee,
  'shopping-basket': ShoppingBasket,
  'shirt': Shirt,
  'wifi': Wifi,
  'zap': Zap,
  'tv': Tv,
  'paw-print': PawPrint,
  'dumbbell': Dumbbell,
  'heart-handshake': HeartHandshake,
  'receipt': Receipt,
  'rotate-ccw': RotateCcw,
  'recycle': Recycle,
  // 账户
  'message-circle': MessageCircle,
  'wallet': Wallet,
  'credit-card': CreditCard,
  'landmark': Landmark,
  'banknote': Banknote,
  'piggy-bank': PiggyBank,
  'coins': Coins,
  'smartphone': Smartphone,
  // 目标
  'gem': Gem,
  'target': Target,
  'plane': Plane,
  'laptop': Laptop,
  'graduation-cap': GraduationCap,
  'gift': Gift,
  // 页面装饰
  'flame': Flame,
}

/** 账户图标可选项 */
export const ACCOUNT_ICON_OPTIONS = [
  'wallet', 'message-circle', 'credit-card', 'landmark',
  'banknote', 'piggy-bank', 'coins', 'briefcase',
]

/** 目标图标可选项 */
export const GOAL_ICON_OPTIONS = [
  'target', 'home', 'car', 'plane', 'laptop',
  'smartphone', 'graduation-cap', 'banknote', 'gift', 'gem',
]

/** 分类图标可选项 */
export const CATEGORY_ICON_OPTIONS = [
  'tag', 'utensils', 'coffee', 'shopping-bag', 'shopping-basket', 'shirt',
  'car', 'wifi', 'home', 'zap', 'tv', 'gamepad', 'heart-pulse', 'book-open',
  'dumbbell', 'plane', 'paw-print', 'gift', 'heart-handshake',
  'briefcase', 'award', 'trending-up', 'clock', 'receipt', 'rotate-ccw',
  'recycle', 'banknote', 'coins',
]

interface IconProps {
  name?: string
  className?: string
  strokeWidth?: number
}

export default function Icon({ name, className = 'w-5 h-5', strokeWidth = 2 }: IconProps) {
  const Cmp = name ? ICON_REGISTRY[name] : undefined
  if (Cmp) return <Cmp className={className} strokeWidth={strokeWidth} />
  // 未注册的图标名（旧数据）→ 原样文本显示
  return <span className="leading-none">{name}</span>
}
