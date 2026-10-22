import type { Analysis } from '../src/shared'
const text = { type: 'string' }
export const analysisSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    hasIssue: { type: 'boolean' }, title: text, summary: text, category: text,
    evidence: { type: 'array', items: text },
    plans: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { id: text, title: text, subtitle: text, description: text, steps: { type: 'array', items: text }, effort: text, risk: text },
      required: ['id', 'title', 'subtitle', 'description', 'steps', 'effort', 'risk'],
    } },
  },
  required: ['hasIssue', 'title', 'summary', 'category', 'evidence', 'plans'],
}
export function parseAnalysis(raw: string): Analysis {
  const value = JSON.parse(raw) as Analysis
  if (typeof value.hasIssue !== 'boolean' || !['title','summary','category'].every(key => typeof (value as any)[key] === 'string') || !Array.isArray(value.evidence) || !value.evidence.every(x => typeof x === 'string') || !Array.isArray(value.plans)) throw new Error('Codex 返回了无效的问题结构')
  if (value.hasIssue && (value.plans.length !== 3 || new Set(value.plans.map(p => p.id)).size !== 3 || !value.plans.every(p => ['id','title','subtitle','description','effort','risk'].every(key => typeof (p as any)[key] === 'string' && (p as any)[key].length > 0) && Array.isArray(p.steps) && p.steps.every(s => typeof s === 'string')))) throw new Error('Codex 必须返回三个完整且不同的方案')
  return value
}
