import { CodexClient, findCodex } from '../electron/codex'
import path from 'node:path'
import { analysisSchema, parseAnalysis } from '../electron/schema'
const client = new CodexClient()
try {
  const executable=await findCodex()
  const account=await client.connect(executable)
  const limits=await client.limits()
  console.log(JSON.stringify({ connected:true, executable, authType:account.type, hasQuotaData:!!(limits.rateLimits||limits.rateLimitsByLimitId) },null,2))
  if(process.argv.includes('--models')) console.log(JSON.stringify({models:await client.listModels()},null,2))
  if (process.argv.includes('--analyze')) {
    const argument=(flag:string)=>{const at=process.argv.indexOf(flag);return at>=0?process.argv[at+1]:undefined}
    const generation={model:argument('--model'),reasoningEffort:argument('--effort'),serviceTier:argument('--speed')}
    const output=await client.run(path.resolve('demo-workspace'),'仅分析下面的示例，不调用工具、不读取额外文件、不修改文件。函数缺少错误处理：async function loadTasks() { const r = await fetch("/api/tasks"); return r.json() }。返回中文诊断和三个不同解决方案，符合给定 JSON schema，hasIssue=true。', {...generation,schema:analysisSchema,signal:AbortSignal.timeout(180000)})
    const finding=parseAnalysis(output)
    console.log(JSON.stringify({inferenceVerified:true,generation,title:finding.title,plans:finding.plans.map(plan=>plan.title)},null,2))
  }
} catch(error) { console.error((error as Error).message); process.exitCode=1 }
finally { client.close() }
