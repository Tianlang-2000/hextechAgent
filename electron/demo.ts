import type { Analysis } from '../src/shared'
export function demoAnalysis(file: string, content: string): Analysis {
  const code = /\.(ts|js|vue|py|go|rs)$/i.test(file)
  return {
    hasIssue: true,
    title: code ? '异步请求缺少失败保护' : '交付计划里，有一处被忽略的风险',
    summary: code ? '请求链路没有覆盖异常和空数据。网络抖动时，界面可能停留在加载状态，影响后续操作。' : '当前工作记录缺少明确的验收标准和责任人。可以在进入下一阶段前，先把这处不确定性收敛。',
    evidence: [`${file} · 演示样例，非 Codex 诊断`, content.split('\n').find(line => line.includes('fetch') || line.includes('TODO'))?.slice(0,180) || '这是用于体验卡牌流程的示例判断。'],
    category: code ? '代码质量' : '工作规划',
    plans: [
      { id: 'quick', title: '精准修补', subtitle: '先让问题停在这里', description: code ? '为当前请求加上异常捕获、空值检查和加载状态回收，快速补齐关键路径。' : '补上验收清单与责任人，优先解除当前交付阻塞。', steps: ['定位当前问题与影响范围', '补齐最小必要的保护或验收项', '验证关键失败场景'], effort: '约 10 分钟', risk: '改动小' },
      { id: 'balanced', title: '系统加固', subtitle: '顺手解决同一类问题', description: code ? '统一请求状态与错误处理方式，检查相邻调用，让同类风险一次收敛。' : '梳理依赖、排期和交付边界，建立可持续复用的推进方式。', steps: ['检查相邻模块与同类问题', '抽取一致的处理流程', '覆盖正常、失败与边界场景'], effort: '约 30 分钟', risk: '范围适中' },
      { id: 'deep', title: '深入重构', subtitle: '为下一次变化留好空间', description: code ? '重新整理数据层与页面的职责，建立完整的失败恢复与验证机制。' : '重整整个项目的里程碑与协作流程，并补齐风险跟踪机制。', steps: ['绘制完整依赖与影响关系', '设计可验证的改进方案', '分阶段落地并复核结果'], effort: '约 1 小时', risk: '需全面验证' },
    ],
  }
}
export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('任务已取消'))
    const abort = () => { clearTimeout(timer); reject(new Error('任务已取消')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
