import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { AgentEngine } from '../electron/engine'
import { ignored, inside, readable, TaskQueue } from '../electron/policy'
import { parseAnalysis } from '../electron/schema'
import { demoAnalysis } from '../electron/demo'
import { evidenceLocations } from '../electron/evidence'

test('evidence only receives a line number for exact excerpts',()=>{
  assert.deepEqual(evidenceLocations('first line\nfetch()\nlast line',['fetch()','invented','fi']),[2,null,null])
})

test('new actions outrank old tasks and duplicate changes coalesce', () => {
  const queue = new TaskQueue()
  queue.add('old.ts'); queue.add('new.md',true); queue.add('new.md'); queue.add('other.ts')
  assert.equal(queue.size,3)
  assert.equal(queue.take()?.file,'new.md')
  assert.equal(queue.take()?.file,'old.ts')
})
test('queue snapshot preserves priority and order when restored',()=>{
  const first=new TaskQueue(); first.restore([{file:'old',priority:false,at:1},{file:'new',priority:true,at:2}])
  const second=new TaskQueue(); second.restore(first.snapshot())
  assert.equal(second.take()?.file,'new'); assert.equal(second.take()?.file,'old')
})

test('scanner excludes secrets, generated directories, sibling paths and unsupported binary formats', () => {
  const root = path.resolve('test-workspace')
  assert.equal(inside(root,path.join(root,'../test-workspace-other/file.ts')),false)
  assert.equal(ignored(root,path.join(root,'src/.env.local')),true)
  assert.equal(ignored(root,path.join(root,'node_modules/lib/index.js')),true)
  assert.equal(ignored(root,path.join(root,'credentials.json')),true)
  assert.equal(readable(root,path.join(root,'briefing.pdf')),false)
  assert.equal(readable(root,path.join(root,'src/component.vue')),true)
})

test('three distinct complete plans are required before cards may appear', () => {
  const data=demoAnalysis('example.ts','fetch()')
  assert.equal(parseAnalysis(JSON.stringify(data)).plans.length,3)
  assert.throws(()=>parseAnalysis(JSON.stringify({...data,plans:data.plans.slice(0,2)})))
  assert.throws(()=>parseAnalysis(JSON.stringify({...data,plans:[data.plans[0],data.plans[0],data.plans[0]]})))
  assert.throws(()=>parseAnalysis(JSON.stringify({...data,plans:[{}, {}, {}]})))
  assert.equal(parseAnalysis(JSON.stringify({...data,hasIssue:false,plans:[]})).hasIssue,false)
})

async function waitFor(predicate:()=>boolean,timeout=14000) {
  const deadline=Date.now()+timeout
  while(!predicate()) { if(Date.now()>deadline) throw new Error('Condition timed out'); await new Promise(resolve=>setTimeout(resolve,50)) }
}
test('daily call budget persists and blocks calls after the limit',async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'))
  const settings={mode:'codex' as const,root:base,executable:'',model:'',dailyLimit:1,allowWrite:false,floating:false}
  try {
    const first=new AgentEngine(settings,path.join(base,'reports'),()=>{})
    await (first as any).reserveCall()
    const restarted=new AgentEngine(settings,path.join(base,'reports'),()=>{})
    await assert.rejects((restarted as any).reserveCall(),/上限/)
  } finally { assert.ok(inside(process.cwd(),base)&&base!==process.cwd()); await rm(base,{recursive:true,force:true}) }
})
test('pending finding and completed report survive a new engine instance',async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'))
  await writeFile(path.join(base,'one.ts'),'fetch()')
  const settings={mode:'demo' as const,root:base,executable:'',model:'',rescanMinutes:0,allowWrite:false,floating:false}
  const reports=path.join(base,'reports'); const first=new AgentEngine(settings,reports,()=>{})
  let second:AgentEngine|undefined
  try {
    await first.start(); await waitFor(()=>first.state.status==='choosing')
    const id=first.state.finding!.id
    await first.choose(first.state.finding!.plans[0].id); const report=first.state.report
    await first.stop()
    second=new AgentEngine(settings,reports,()=>{}); await second.start()
    assert.equal(second.state.status,'followup'); assert.equal(second.state.finding?.id,id); assert.equal(second.state.report,report)
  } finally {await first.stop(); await second?.stop(); assert.ok(inside(process.cwd(),base)&&base!==process.cwd()); await rm(base,{recursive:true,force:true})}
})
test('real watcher runs the demo cycle, prioritizes new content and stops all work',async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'))
  const root=path.join(base,'files'); await mkdir(root); await writeFile(path.join(root,'initial.ts'),'fetch()')
  const engine=new AgentEngine({mode:'demo',root,executable:'',model:'',allowWrite:false,floating:false},path.join(base,'reports'),()=>{})
  try {
    await engine.start()
    await waitFor(()=>engine.state.status==='choosing')
    assert.equal(engine.state.finding?.plans.length,3)
    await engine.choose(engine.state.finding!.plans[0].id)
    assert.equal(engine.state.status,'followup')
    assert.match(engine.state.report,/未修改源文件/)
    await writeFile(path.join(root,'new-task.md'),'TODO: new task')
    await waitFor(()=>engine.state.backlog.some(item=>item.source==='new-task.md'))
    assert.ok(engine.state.logs.some(log=>log.kind==='new'&&log.text.includes('优先')))
    await engine.next(false)
    assert.equal(engine.state.finding?.source,'new-task.md')
    await engine.stop()
    const rounds=engine.state.rounds
    await writeFile(path.join(root,'after-stop.md'),'should not be read')
    await new Promise(resolve=>setTimeout(resolve,1600))
    assert.equal(engine.state.rounds,rounds)
    assert.equal(engine.state.status,'stopped')
    await engine.start()
    await waitFor(()=>engine.state.status==='choosing')
    assert.ok(engine.state.finding,'Restart must re-evaluate existing files')
  } finally { await engine.stop(); assert.ok(inside(process.cwd(),base)&&base!==process.cwd()); await rm(base,{recursive:true,force:true}) }
})

test('a deliberate deeper investigation carries the previous report into a new round',async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'))
  await writeFile(path.join(base,'one.ts'),'fetch()')
  const engine=new AgentEngine({mode:'demo',root:base,executable:'',model:'',allowWrite:false,floating:false},path.join(base,'reports'),()=>{})
  try {
    await engine.start(); await waitFor(()=>engine.state.status==='choosing')
    await engine.choose(engine.state.finding!.plans[0].id)
    await engine.next(true)
    await waitFor(()=>engine.state.status==='choosing')
    assert.match(engine.state.finding!.title,/深入复核/)
    assert.equal(engine.state.finding!.plans.length,3)
  } finally { await engine.stop(); assert.ok(inside(process.cwd(),base)&&base!==process.cwd()); await rm(base,{recursive:true,force:true}) }
})

test('quota exhaustion cancels an active round and freezes the loop',async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'))
  await writeFile(path.join(base,'initial.ts'),'fetch()')
  const engine=new AgentEngine({mode:'demo',root:base,executable:'',model:'',allowWrite:false,floating:false},path.join(base,'reports'),()=>{})
  try {
    await engine.start(); await waitFor(()=>engine.state.status==='thinking')
    ;(engine as any).updateQuota({rateLimitsByLimitId:{codex:{primary:{usedPercent:100,resetsAt:Math.floor(Date.now()/1000)+3600}}}})
    await waitFor(()=>engine.state.status==='quota')
    await new Promise(resolve=>setTimeout(resolve,2200))
    assert.equal(engine.state.rounds,0)
    assert.equal(engine.state.quotaRemaining,0)
    assert.equal(engine.state.status,'quota')
  } finally { await engine.stop(); assert.ok(inside(process.cwd(),base)&&base!==process.cwd()); await rm(base,{recursive:true,force:true}) }
})
