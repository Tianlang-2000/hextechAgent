import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConnectionManager, loginURL } from '../electron/connection'
import { CodexClient } from '../electron/codex'

class FakeClient {
  account: any = null
  onLogin: (value: any) => void = () => {}
  calls: string[] = []
  closed = 0
  authUrl = 'https://auth.openai.com/authorize?test=1'
  modelError: Error | null = null
  async listModels() { this.calls.push('model/list'); if(this.modelError)throw this.modelError; return [] }
  async connect(_executable: string, options: any) { assert.equal(options.allowSignedOut,true); this.calls.push('connect'); return this.account }
  async request(method: string) {
    this.calls.push(method)
    if (method==='account/login/start') return { loginId:'test-login',authUrl:this.authUrl }
    if (method==='account/read') return { account:this.account }
    return {}
  }
  close() { this.closed++ }
}
function setup() {
  const client=new FakeClient(); const urls: string[]=[]
  const manager=new ConnectionManager(()=>{},async url=>{urls.push(url)},client as unknown as CodexClient)
  return {client,urls,manager}
}
test('signed-out connection check needs no terminal and never starts a model turn',async()=>{
  const {client,manager}=setup()
  await manager.check('')
  assert.equal(manager.state.status,'signed-out')
  assert.deepEqual(client.calls,['connect','model/list'])
  assert.equal(manager.catalog.status,'ready')
  manager.close()
})
test('existing ChatGPT login is reused without opening another browser',async()=>{
  const {client,manager,urls}=setup();client.account={type:'chatgpt',email:'test@example.com'}
  await manager.login('');assert.equal(manager.state.status,'ready');assert.equal(urls.length,0)
  manager.close()
})
test('browser login waits for matching completion and rereads account before ready',async()=>{
  const {client,manager,urls}=setup()
  await manager.login('');assert.equal(manager.state.status,'login');assert.equal(urls.length,1)
  client.onLogin({loginId:'other-login',success:true});assert.equal(manager.state.status,'login')
  client.account={type:'chatgpt',email:'test@example.com'}
  client.onLogin({loginId:'test-login',success:true});await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(manager.state.status,'ready');assert.ok(client.calls.includes('account/read'))
  assert.ok(!client.calls.some(method=>method.startsWith('turn/')))
  manager.close()
})
test('login can be cancelled and a late callback does not reconnect the app',async()=>{
  const {client,manager}=setup();await manager.login('');await manager.cancel()
  assert.equal(manager.state.status,'signed-out');assert.ok(client.calls.includes('account/login/cancel'))
  client.onLogin({loginId:'test-login',success:true});assert.equal(manager.state.status,'signed-out')
})
test('only official HTTPS login pages may open in the browser',async()=>{
  for(const value of ['http://auth.openai.com/login','https://auth.openai.com.attacker.example','file:///C:/example','https://user:pass@auth.openai.com/login']) assert.throws(()=>loginURL(value))
  const {client,manager,urls}=setup();client.authUrl='https://attacker.example/login'
  await manager.login('');assert.equal(manager.state.status,'error');assert.equal(urls.length,0)
  manager.close()
})

test('model discovery failure does not falsely sign out a valid account and can be retried',async()=>{
  const {client,manager}=setup();client.account={type:'chatgpt'};client.modelError=new Error('temporary catalog failure')
  await manager.check('');assert.equal(manager.state.status,'ready');assert.equal(manager.catalog.status,'error')
  client.modelError=null;await manager.refreshModels('');assert.equal(manager.catalog.status,'ready');manager.close()
})

test('cancelled catalog loading cannot publish stale models',async()=>{
  const {client,manager}=setup();let finish:()=>void=()=>{}
  client.listModels=async()=>{await new Promise<void>(resolve=>{finish=resolve});return []}
  const pending=manager.check('');await new Promise(resolve=>setTimeout(resolve,0))
  await manager.cancel();finish();await pending
  assert.equal(manager.catalog.status,'idle');assert.equal(manager.state.status,'signed-out')
})
