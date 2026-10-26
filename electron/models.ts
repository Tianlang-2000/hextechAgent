import type { ModelOption } from '../src/shared'
import { supportsEffort, supportsTier } from '../src/generation-options'

export interface GenerationOptions { model?: string; reasoningEffort?: string; serviceTier?: string }
export function parseModels(data: unknown): ModelOption[] {
  if (!Array.isArray(data)) throw new Error('连接组件未返回有效模型目录，请刷新重试')
  const models = new Map<string,ModelOption>()
  for (const row of data) {
    if (!row || typeof row.model !== 'string' || !row.model || row.hidden === true) continue
    const efforts: ModelOption['efforts'] = []
    for (const effort of Array.isArray(row.supportedReasoningEfforts) ? row.supportedReasoningEfforts : []) {
      if (typeof effort?.reasoningEffort === 'string' && effort.reasoningEffort && !efforts.some(e=>e.id===effort.reasoningEffort)) efforts.push({id:effort.reasoningEffort,description:typeof effort.description==='string'?effort.description:''})
    }
    const tiers: ModelOption['tiers'] = []
    for (const tier of Array.isArray(row.serviceTiers) ? row.serviceTiers : []) {
      if (typeof tier?.id === 'string' && tier.id && tier.id !== 'default' && !tiers.some(t=>t.id===tier.id)) tiers.push({id:tier.id,name:typeof tier.name==='string'?tier.name:tier.id,description:typeof tier.description==='string'?tier.description:''})
    }
    if (!tiers.length) for (const tier of Array.isArray(row.additionalSpeedTiers) ? row.additionalSpeedTiers : []) {
      if (typeof tier==='string' && tier && tier!=='default' && !tiers.some(t=>t.id===tier)) tiers.push({id:tier,name:tier,description:''})
    }
    models.set(row.model,{model:row.model,name:typeof row.displayName==='string'?row.displayName:row.model,description:typeof row.description==='string'?row.description:'',isDefault:row.isDefault===true,defaultEffort:typeof row.defaultReasoningEffort==='string'?row.defaultReasoningEffort:'',efforts,tiers})
  }
  return [...models.values()]
}
export function validateGeneration(options: GenerationOptions, models: ModelOption[], effectiveModel?: string) {
  const model = models.find(m=>m.model===(options.model || effectiveModel))
  if (options.model && !model) throw new Error('所选模型不在当前连接的目录中，请刷新模型列表或改为跟随配置')
  if (options.reasoningEffort && !supportsEffort(model,options.reasoningEffort)) throw new Error('当前模型不支持所选推理强度，请重新选择模型或推理档位')
  if (!supportsTier(model,options.serviceTier || '')) throw new Error('当前模型不支持所选速度，请选择标准速度或刷新模型列表')
}
export function turnGeneration(options: GenerationOptions) {
  return {
    ...(options.model ? {model:options.model} : {}),
    ...(options.reasoningEffort ? {effort:options.reasoningEffort} : {}),
    ...(options.serviceTier ? {serviceTier:options.serviceTier} : {}),
  }
}
