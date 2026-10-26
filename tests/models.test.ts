import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CodexClient } from '../electron/codex'
import { parseModels, validateGeneration, turnGeneration, type GenerationOptions } from '../electron/models'
import { demoAnalysis } from '../electron/demo'
import { AgentEngine } from '../electron/engine'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { inside } from '../electron/policy'

const rows=[
  {model:'model-a',displayName:'模型 A',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}],serviceTiers:[{id:'priority',name:'Fast',description:'increased usage'}]},
  {model:'model-b',displayName:'模型 B',supportedReasoningEfforts:[{reasoningEffort:'medium'}],serviceTiers:[]},
]

test('catalog keeps exact advertised capabilities and hides hidden models',()=>{
  const models=parseModels([...rows,{...rows[0],model:'secret-model',hidden:true}])
  assert.equal(models.length,2);assert.deepEqual(models[1].efforts.map(e=>e.id),['medium'])
  assert.equal(models[0].tiers[0].id,'priority')
  assert.throws(()=>parseModels({}))
  assert.throws(()=>validateGeneration({model:'model-b',reasoningEffort:'high'},models))
  assert.throws(()=>validateGeneration({model:'model-b',serviceTier:'priority'},models))
  assert.throws(()=>validateGeneration({model:'unknown'},models))
  assert.doesNotThrow(()=>validateGeneration({model:'model-b',serviceTier:'default'},models))
  assert.deepEqual(turnGeneration({}),{})
  assert.deepEqual(turnGeneration({serviceTier:'default'}),{serviceTier:'default'})
})

test('model catalog pagination is completed, cached and reset on disconnect',async()=>{
  const client=new CodexClient();let calls=0
  client.request=async (_method,params:any)=>{calls++;return params.cursor?{data:[rows[1]],nextCursor:null}:{data:[rows[0]],nextCursor:'next'}}
  assert.equal((await client.listModels()).length,2);await client.listModels();assert.equal(calls,2)
  client.close();await client.listModels();assert.equal(calls,4);client.close()
})

test('repeated cursors are rejected rather than presenting a partial model list',async()=>{
  const client=new CodexClient();client.request=async()=>({data:rows,nextCursor:'repeat'})
  await assert.rejects(client.listModels(),/分页/);client.close()
})

test('cancelling model discovery cannot start a thread or model turn afterward',async()=>{
  const client=new CodexClient();const methods:string[]=[];let finish:(value:any)=>void=()=>{}
  client.request=async(method)=>{methods.push(method);return await new Promise(resolve=>{finish=resolve})}
  const controller=new AbortController()
  const pending=client.run(process.cwd(),'fixture',{model:'model-a',signal:controller.signal})
  controller.abort();finish({data:rows,nextCursor:null})
  await assert.rejects(pending,/取消/);assert.deepEqual(methods,['model/list']);client.close()
})

function transport() {
  const client=new CodexClient();const calls:{method:string;params:any}[]=[]
  client.request=async(method,params:any={})=>{
    calls.push({method,params})
    if(method==='model/list')return {data:rows,nextCursor:null}
    if(method==='thread/start')return {thread:{id:'test-thread'},model:params.model||'model-b'}
    if(method==='turn/start') {
      queueMicrotask(()=>{
        ;(client as any).receive({method:'item/completed',params:{threadId:'test-thread',item:{type:'agentMessage',text:'verified'}}})
        ;(client as any).receive({method:'turn/completed',params:{threadId:'test-thread',turn:{status:'completed'}}})
      })
      return {turn:{id:'test-turn'}}
    }
    throw new Error(`Unexpected request ${method}`)
  }
  return {client,calls}
}
test('model, reasoning and speed reach actual thread and turn RPC payloads',async()=>{
  const {client,calls}=transport()
  assert.equal(await client.run(process.cwd(),'fixture',{model:'model-a',reasoningEffort:'high',serviceTier:'priority',signal:new AbortController().signal}),'verified')
  assert.equal(calls.find(c=>c.method==='thread/start')!.params.model,'model-a')
  const turn=calls.find(c=>c.method==='turn/start')!.params
  assert.equal(turn.model,'model-a');assert.equal(turn.effort,'high');assert.equal(turn.serviceTier,'priority')
  client.close()
})
test('standard explicitly overrides inherited acceleration; auto does not set a tier',async()=>{
  for(const speed of ['', 'default']) {
    const {client,calls}=transport()
    await client.run(process.cwd(),'fixture',{serviceTier:speed,signal:new AbortController().signal})
    const turn=calls.find(c=>c.method==='turn/start')!.params
    assert.equal(Object.hasOwn(turn,'serviceTier'),speed==='default')
    if(speed)assert.equal(turn.serviceTier,'default')
    client.close()
  }
})
test('unsupported options and incompatible inherited model cannot start a billable turn',async()=>{
  for(const options of [{model:'model-b',reasoningEffort:'high'},{model:'model-b',serviceTier:'priority'},{reasoningEffort:'high'}]) {
    const {client,calls}=transport()
    await assert.rejects(client.run(process.cwd(),'fixture',{...options,signal:new AbortController().signal}))
    assert.equal(calls.some(c=>c.method==='turn/start'),false);client.close()
  }
})

test('both discovery and selected-plan processing use the saved generation preferences',async()=>{
  const base=await mkdtemp(path.join(process.cwd(),'test-workspace-'));await writeFile(path.join(base,'file.ts'),'fetch()')
  const engine=new AgentEngine({mode:'codex',root:base,executable:'',model:'model-a',reasoningEffort:'high',serviceTier:'default',allowWrite:false,floating:false},path.join(base,'reports'),()=>{})
  const options:GenerationOptions[]=[]
  ;(engine as any).client={
    connect:async()=>({type:'chatgpt'}),limits:async()=>({}),close:()=>{},
    run:async(_cwd:string,_prompt:string,config:any)=>{options.push(config);return config.schema?JSON.stringify(demoAnalysis('file.ts','fetch()')):'# Fixture report'},
  }
  try {
    await engine.start();const deadline=Date.now()+5000
    while(engine.state.status!=='choosing'){if(Date.now()>deadline)throw new Error('Discovery timeout');await new Promise(resolve=>setTimeout(resolve,30))}
    await engine.choose(engine.state.finding!.plans[0].id)
    assert.equal(engine.state.status,'followup');assert.equal(options.length,2)
    for(const option of options){assert.equal(option.model,'model-a');assert.equal(option.reasoningEffort,'high');assert.equal(option.serviceTier,'default')}
  } finally {await engine.stop();assert.ok(inside(process.cwd(),base)&&base!==process.cwd());await rm(base,{recursive:true,force:true})}
})
