import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { access, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
export async function findCodex(): Promise<string> {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex'
  const candidates = (process.env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, name))
  if (process.platform === 'win32') {
    const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'
    const platformPackage = `codex-win32-${process.arch}`
    const prefixes = [...(process.env.PATH ?? '').split(path.delimiter), path.join(process.env.APPDATA || '', 'npm')]
    for (const prefix of prefixes) {
      const base = path.join(prefix,'node_modules','@openai','codex')
      candidates.push(path.join(base,'vendor',triple,'codex',name))
      candidates.push(path.join(base,'node_modules','@openai',platformPackage,'vendor',triple,'codex',name))
      candidates.push(path.join(prefix,'node_modules','@openai',platformPackage,'vendor',triple,'codex',name))
    }
  }
  if (process.platform === 'win32') {
    const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin')
    try {
      const dirs = await readdir(base)
      const sorted = await Promise.all(dirs.map(async dir => ({ file: path.join(base, dir, name), mtime: (await stat(path.join(base, dir))).mtimeMs })))
      candidates.push(...sorted.sort((a,b) => b.mtime-a.mtime).map(item => item.file))
    } catch { /* CLI can also be installed on PATH. */ }
  }
  for (const file of candidates) { try { await access(file); return file } catch { /* Try next installation. */ } }
  throw new Error('未找到 Codex。请安装 Codex CLI 并执行 codex login，或在设置中填写 codex.exe 的完整路径。')
}

export class CodexClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private active: { thread: string; resolve: (value: string) => void; reject: (error: Error) => void; text: string; timer: ReturnType<typeof setTimeout> } | null = null
  onQuota: (value: any) => void = () => {}
  onProgress: (value: string) => void = () => {}

  async connect(executable = '') {
    this.close()
    const child = spawn(executable || await findCodex(), ['app-server', '--listen', 'stdio://'], { stdio: 'pipe', windowsHide: true })
    this.child = child
    createInterface({ input: child.stdout }).on('line', line => {
      try { this.receive(JSON.parse(line)) } catch { /* Non-JSON diagnostics never become model results. */ }
    })
    let diagnostic = ''
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000) })
    child.on('error', error => this.fail(error))
    child.on('exit', () => {
      if (this.child !== child) return
      this.child = null
      this.fail(new Error(`Codex 连接已退出。${diagnostic.slice(-600)}`))
    })
    await this.request('initialize', { clientInfo: { name: 'hextech_agent', title: 'Hextech Agent', version: '0.1.0' } })
    this.send({ method: 'initialized', params: {} })
    const account = await this.request('account/read', {})
    if (!account.account || !['chatgpt', 'chatgptAuthTokens'].includes(account.account.type)) {
      this.close()
      throw new Error('需要通过 ChatGPT 登录的 Codex 账号。请在终端运行 codex login 后重新连接。')
    }
    return account.account
  }

  private send(message: unknown) {
    if (!this.child || !this.child.stdin.writable) throw new Error('Codex 尚未连接')
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }
  request(method: string, params: unknown = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex 请求超时：${method}`)) }, 30000)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, params }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  private receive(message: any) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer); this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
      else pending.resolve(message.result)
      return
    }
    if (message.id !== undefined && message.method) {
      // This demo never silently approves tools or relays requests to other services.
      const result = message.method.includes('requestApproval') ? { decision: 'decline' } : null
      this.send(result ? { id: message.id, result } : { id: message.id, error: { code: -32601, message: 'Interactive tool unsupported by Hextech demo' } })
      return
    }
    const p = message.params || {}
    if (message.method === 'account/rateLimits/updated') this.onQuota(p)
    if (!this.active || p.threadId !== this.active.thread) return
    if (message.method === 'item/agentMessage/delta') this.onProgress('Codex 正在整理结果…')
    if (message.method === 'item/started' && p.item?.type === 'commandExecution') this.onProgress('Codex 正在检查文件与证据…')
    if (message.method === 'item/completed' && p.item?.type === 'agentMessage') this.active.text = p.item.text
    if (message.method === 'turn/completed') {
      const active = this.active; this.active = null; clearTimeout(active.timer)
      if (p.turn?.status === 'completed') active.resolve(active.text || p.turn.items?.filter((x: any) => x.type === 'agentMessage').at(-1)?.text || '')
      else active.reject(new Error(p.turn?.error?.message || `Codex 回合状态：${p.turn?.status}`))
    }
  }
  async limits() { const result = await this.request('account/rateLimits/read'); this.onQuota(result); return result }
  async run(cwd: string, prompt: string, options: { model?: string; write?: boolean; schema?: unknown; signal: AbortSignal }) {
    if (options.signal.aborted) throw new Error('任务已取消')
    const result = await this.request('thread/start', {
      cwd, approvalPolicy: 'never', sandbox: options.write ? 'workspace-write' : 'read-only',
      ...(options.model ? { model: options.model } : {}),
    })
    if (options.signal.aborted) throw new Error('任务已取消')
    const thread = result.thread.id
    return new Promise<string>((resolve, reject) => {
      const cleanup = () => options.signal.removeEventListener('abort', abort)
      const abort = () => { this.close(); cleanup(); reject(new Error('任务已取消')) }
      options.signal.addEventListener('abort', abort, { once: true })
      this.active = {
        thread, text: '',
        resolve: value => { cleanup(); resolve(value) },
        reject: error => { cleanup(); reject(error) },
        timer: setTimeout(() => { this.close(); cleanup(); reject(new Error('Codex 分析超过 5 分钟，已停止，请重试')) }, 300000),
      }
      this.request('turn/start', {
        threadId: thread, input: [{ type: 'text', text: prompt }],
        sandboxPolicy: options.write
          ? { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false }
          : { type: 'readOnly', networkAccess: false },
        ...(options.schema ? { outputSchema: options.schema } : {}),
      }).catch(error => {
        const active = this.active
        if (active && active.thread === thread) { clearTimeout(active.timer); this.active = null }
        cleanup(); reject(error)
      })
    })
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error) }
    this.pending.clear()
    if (this.active) { const active = this.active; this.active = null; clearTimeout(active.timer); active.reject(error) }
  }
  close() {
    const child = this.child; this.child = null
    this.fail(new Error('Codex 连接已停止'))
    child?.stdin.end()
    if (child?.pid && process.platform === 'win32') {
      // Include command descendants when the user stops an execution.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('error', () => { child.kill() })
    } else child?.kill()
  }
}
