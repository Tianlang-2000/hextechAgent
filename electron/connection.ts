import { CodexClient } from './codex'
import type { ConnectionState, ModelCatalog } from '../src/shared'

export function loginURL(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname) || url.username || url.password) throw new Error('登录地址不受信任，请重试连接')
  return url.href
}

export class ConnectionManager {
  state: ConnectionState = { status: 'unchecked', message: '登录后即可开始真实分析', email: '' }
  catalog: ModelCatalog = {status:'idle',models:[],error:''}
  onCatalog: (catalog: ModelCatalog) => void = () => {}
  private client: CodexClient
  private busy = false
  private loginId: string | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  constructor(private emit: (state: ConnectionState) => void, private openBrowser: (url: string) => Promise<void>, client = new CodexClient()) {
    this.client = client
    client.onLogin = result => {
      if (this.state.status !== 'login' || (this.loginId && result.loginId !== this.loginId)) return
      if (result.success) void this.finishLogin()
      else { this.close(); this.set('error', result.error || '登录未完成，可以重新登录') }
    }
  }
  private set(status: ConnectionState['status'], message: string, email = '') { this.state = { status, message, email }; this.emit({ ...this.state }) }
  async check(executable: string) { await this.begin(executable, false) }
  async login(executable: string) { await this.begin(executable, true) }
  async refreshModels(executable: string) { await this.begin(executable,false) }
  invalidate() {
    this.close(); this.catalog={status:'idle',models:[],error:''}; this.onCatalog(structuredClone(this.catalog))
    this.set('unchecked','连接组件已更改，请重新检查连接')
  }
  private async loadModels(epoch: number) {
    this.catalog={...this.catalog,status:'loading',error:''}; this.onCatalog(structuredClone(this.catalog))
    try {
      const models=await this.client.listModels()
      if(epoch!==this.generation)return
      this.catalog={status:'ready',models,error:''}
    } catch(error) {
      if(epoch!==this.generation)return
      this.catalog={...this.catalog,status:'error',error:(error as Error).message}
    }
    this.onCatalog(structuredClone(this.catalog))
  }
  private isLoggingIn() { return this.state.status === 'login' }
  private async begin(executable: string, login: boolean) {
    if (this.busy || this.isLoggingIn()) return
    this.busy = true; const epoch = ++this.generation
    this.set('checking', '正在检查连接组件与登录状态…')
    try {
      const account = await this.client.connect(executable, { allowSignedOut: true })
      if (epoch !== this.generation) return
      await this.loadModels(epoch)
      if (epoch !== this.generation) return
      if (account && ['chatgpt', 'chatgptAuthTokens'].includes(account.type)) {
        this.set('ready', '已连接，可以开始真实分析', account.email || '')
        this.client.close(); return
      }
      if (!login) { this.set('signed-out', '连接组件已就绪，请登录 ChatGPT'); this.client.close(); return }
      this.set('login', '请在浏览器完成登录，完成后会自动返回就绪状态')
      const result = await this.client.request('account/login/start', { type: 'chatgpt' })
      if (epoch !== this.generation || this.state.status !== 'login') return
      this.loginId = result.loginId
      await this.openBrowser(loginURL(result.authUrl))
      if (epoch !== this.generation || this.state.status !== 'login') return
      this.timer = setTimeout(() => { void this.cancel('登录等待已结束，请重新登录') }, 10 * 60 * 1000)
    } catch(error) { if (epoch === this.generation) {
      this.catalog={...this.catalog,status:'error',error:(error as Error).message}; this.onCatalog(structuredClone(this.catalog))
      this.close(); this.set('error', (error as Error).message)
    } }
    finally { if (epoch === this.generation) this.busy = false }
  }
  private async finishLogin() {
    const epoch = this.generation
    if (this.timer) clearTimeout(this.timer)
    try {
      const result = await this.client.request('account/read', {})
      if (epoch !== this.generation) return
      if (!result.account || !['chatgpt', 'chatgptAuthTokens'].includes(result.account.type)) throw new Error('登录尚未保存，请重试')
      await this.loadModels(epoch)
      if (epoch !== this.generation) return
      this.set('ready', '登录成功，可以开始真实分析', result.account.email || '')
      this.close()
    } catch(error) { if (epoch === this.generation) { this.close(); this.set('error', (error as Error).message) } }
  }
  async cancel(message = '已取消登录，可以稍后再连接') {
    const loginId = this.loginId
    this.generation++; this.busy = false
    if (loginId) await this.client.request('account/login/cancel', { loginId }).catch(() => {})
    this.close(); this.set('signed-out', message)
  }
  close() {
    this.generation++; this.busy = false; this.loginId = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined; this.client.close()
    if(this.catalog.status==='loading') { this.catalog={...this.catalog,status:'idle'}; this.onCatalog(structuredClone(this.catalog)) }
  }
}
