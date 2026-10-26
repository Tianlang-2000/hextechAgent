import type { ModelOption } from './shared'

const effortNames: Record<string,string> = { none:'不额外推理',minimal:'极轻量',low:'较低',medium:'均衡',high:'深入',xhigh:'更深入',max:'最高',ultra:'极致' }
export function effortLabel(value: string) { return effortNames[value] || value }
export function speedLabel(value: string, name = '') {
  if (!value) return '跟随连接配置'
  if (value === 'default') return '标准速度'
  if (value === 'priority' || value === 'fast') return '加速模式'
  if (value === 'flex') return '弹性速度'
  return name || value
}
export function supportsTier(model: ModelOption | undefined, tier: string) { return !tier || tier === 'default' || !!model?.tiers.some(t => t.id === tier) }
export function supportsEffort(model: ModelOption | undefined, effort: string) { return !effort || !!model?.efforts.some(e => e.id === effort) }
