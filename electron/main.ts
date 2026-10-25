import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { AgentEngine } from './engine'
import { ConnectionManager } from './connection'
import type { Settings, AgentState } from '../src/shared'
const dirname = path.dirname(fileURLToPath(import.meta.url))
let main: BrowserWindow | null = null
let overlay: BrowserWindow | null = null
let engine: AgentEngine
let connection: ConnectionManager
let quitting = false
let shownFinding = ''
const devURL = process.env.VITE_DEV_SERVER_URL
const smokeTest = process.argv.includes('--smoke-test')
if (process.platform === 'win32') app.setAppUserModelId('com.hextech.agent')
if (!smokeTest && !app.requestSingleInstanceLock()) app.quit()
app.on('second-instance',()=>{ if(main?.isMinimized()) main.restore(); main?.show(); main?.focus() })
if (smokeTest) {
  const results = path.join(process.cwd(),'test-results')
  mkdirSync(results,{ recursive:true })
  app.setPath('userData', mkdtempSync(path.join(results,'electron-profile-')))
}

function load(window: BrowserWindow, floating = false) {
  if (devURL) return window.loadURL(`${devURL}${floating ? '/#overlay' : ''}`)
  return window.loadFile(path.join(dirname,'../dist/index.html'), { hash: floating ? 'overlay' : '' })
}
function createWindow(floating = false) {
  const area = screen.getPrimaryDisplay().workArea
  const window = new BrowserWindow({
    width: Math.min(floating ? 1040 : 1280,area.width), height: Math.min(floating ? 660 : 860,area.height),
    minWidth: floating ? 780 : 980, minHeight: 620,
    ...(floating ? { x: Math.max(area.x,area.x + Math.round((area.width-1040)/2)), y: Math.max(area.y,area.y + area.height-680) } : {}),
    frame: false, transparent: floating, backgroundColor: floating ? '#00000000' : '#0c1014',
    alwaysOnTop: floating, skipTaskbar: floating, show: false,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'brand/icon.png') : path.join(dirname, '../build/icon.png'),
    webPreferences: { preload: path.join(dirname,'preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event,url) => { if (url !== window.webContents.getURL()) event.preventDefault() })
  window.on('close', () => { if (!quitting) { quitting = true; void engine.stop().finally(() => app.quit()) } })
  return window
}
function broadcast(state: AgentState) {
  for (const window of [main,overlay]) if (window && !window.isDestroyed()) window.webContents.send('hextech:state',state)
  const identifier = `${state.finding?.id || ''}:${state.status}`
  if (state.settings.floating && (state.status === 'choosing' || state.status === 'followup') && identifier !== shownFinding) {
    shownFinding = identifier
    if (!overlay) {
      overlay = createWindow(true)
      overlay.once('ready-to-show', () => overlay?.showInactive())
      void load(overlay,true)
    } else overlay.showInactive()
  } else if (!['choosing','executing','followup'].includes(state.status) || !state.settings.floating) overlay?.hide()
}

app.whenReady().then(async () => {
  const userDir = app.getPath('userData')
  await mkdir(userDir, { recursive: true })
  const demoRoot = path.join(userDir,'demo-workspace')
  await mkdir(demoRoot, { recursive: true })
  for (const [name,text] of Object.entries({
    'launch-plan.md': '# 产品发布计划\n\n本周完成桌面 demo 与 Codex 联调。\nTODO: 补上验收标准、负责人和回退策略。\n',
    'example.ts': "export async function loadTasks() {\n  const response = await fetch('/api/tasks')\n  return response.json()\n}\n",
  })) { try { await readFile(path.join(demoRoot,name)) } catch { await writeFile(path.join(demoRoot,name),text) } }
  const defaults: Settings = { mode: 'demo', root: demoRoot, executable: '', model: '', allowWrite: false, floating: true, onboardingDone: false }
  let saved: Partial<Settings> = {}
  try { saved = JSON.parse(await readFile(path.join(userDir,'settings.json'),'utf8')) } catch { /* First launch. */ }
  engine = new AgentEngine({ ...defaults, ...saved, ...(smokeTest ? { mode: 'demo' as const, root: demoRoot, floating: true, onboardingDone: false } : {}), allowWrite: false },path.join(userDir,'reports'),broadcast)
  connection = new ConnectionManager(state => {
    for (const window of [main, overlay]) if (window && !window.isDestroyed()) window.webContents.send('hextech:connection', state)
  }, url => shell.openExternal(url))
  ipcMain.handle('hextech:connection', () => connection.state)
  ipcMain.handle('hextech:state', () => engine.state)
  ipcMain.handle('hextech:root', async () => {
    const result = await dialog.showOpenDialog(main!, { title: '选择要持续巡检的目录', properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('hextech:action', async (_event,action: string,payload: any) => {
    switch(action) {
      case 'start': await engine.start(); break
      case 'stop': await engine.stop(); break
      case 'connection-check': await connection.check(engine.state.settings.executable); break
      case 'login': await connection.login(engine.state.settings.executable); break
      case 'cancel-login': await connection.cancel(); break
      case 'choose': if (typeof payload !== 'string') throw new Error('无效方案'); await engine.choose(payload); break
      case 'next': await engine.next(false); break
      case 'deeper': await engine.next(true); break
      case 'settings': {
        const clean: Partial<Settings> = {}
        for (const key of ['root','executable','model'] as const) if (typeof payload?.[key] === 'string') clean[key] = payload[key]
        for (const key of ['allowWrite','floating'] as const) if (typeof payload?.[key] === 'boolean') clean[key] = payload[key]
        if (typeof payload?.onboardingDone === 'boolean') clean.onboardingDone = payload.onboardingDone
        if (payload?.mode === 'demo' || payload?.mode === 'codex') {
          clean.mode = payload.mode
          if (payload.mode !== engine.state.settings.mode) clean.root = payload.mode === 'demo' ? demoRoot : app.getPath('desktop')
        }
        await engine.configure(clean)
        await writeFile(path.join(userDir,'settings.json'),JSON.stringify(engine.state.settings,null,2),'utf8')
        break
      }
      case 'report': if (engine.state.reportPath) await shell.openPath(engine.state.reportPath); break
      case 'folder': await shell.openPath(engine.state.settings.root); break
      case 'minimize': main?.minimize(); break
      case 'hide-overlay': overlay?.hide(); break
      case 'show-overlay': if (overlay) overlay.show(); break
      case 'close': quitting = true; connection.close(); await engine.stop(); app.quit(); break
      default: throw new Error('未知操作')
    }
  })
  main = createWindow()
  main.once('ready-to-show', () => main?.show())
  await load(main)
  if (smokeTest) {
    try {
      const outputDir = path.join(process.cwd(),'test-results')
      await mkdir(outputDir,{ recursive:true })
      await new Promise(resolve => setTimeout(resolve, 700))
      const welcome = await main.webContents.executeJavaScript('Boolean(document.querySelector("[data-testid=welcome-demo]"))')
      if (!welcome) throw new Error('First-launch welcome screen missing')
      await writeFile(path.join(outputDir,'welcome.png'),(await main.webContents.capturePage()).toPNG())
      await main.webContents.executeJavaScript('document.querySelector("[data-testid=welcome-demo]").click()')
      const wait = async (predicate: () => boolean) => {
        const until = Date.now()+20000
        while (!predicate()) { if (Date.now()>until) throw new Error(`Smoke test timed out: ${engine.state.status}`); await new Promise(resolve=>setTimeout(resolve,100)) }
      }
      await wait(()=>engine.state.status==='choosing')
      await new Promise(resolve=>setTimeout(resolve,700))
      if (!await main.webContents.executeJavaScript('Boolean(window.hextech) && document.querySelectorAll(".plan-card").length === 3')) throw new Error('Renderer bridge or three-card layout failed')
      await writeFile(path.join(outputDir,'dashboard.png'),(await main.webContents.capturePage()).toPNG())
      await wait(()=>!!overlay && !overlay.webContents.isLoading())
      await new Promise(resolve=>setTimeout(resolve,500))
      await writeFile(path.join(outputDir,'overlay.png'),(await overlay!.webContents.capturePage()).toPNG())
      await main.webContents.executeJavaScript('document.querySelectorAll(".plan-card")[1].click()')
      await wait(()=>engine.state.status==='followup')
      const reportWritten = !!engine.state.reportPath
      if (!reportWritten) throw new Error('Chosen plan did not generate a report')
      await new Promise(resolve=>setTimeout(resolve,400))
      if (!await main.webContents.executeJavaScript('document.querySelectorAll(".followup-card").length === 2')) throw new Error('Two-card followup layout failed')
      await writeFile(path.join(outputDir,'followup.png'),(await main.webContents.capturePage()).toPNG())
      await writeFile(path.join(demoRoot,'new-task.md'),'# 新任务\nTODO: 确定下周交付负责人。')
      await wait(()=>engine.state.logs.some(log=>log.text.includes('new-task.md')) && engine.state.backlog.some(item=>item.source==='new-task.md'))
      await engine.stop()
      if (app.isPackaged) {
        await connection.check('')
        if (!['ready','signed-out'].includes(connection.state.status)) throw new Error(`Bundled connection component failed: ${connection.state.message}`)
      }
      const rounds = engine.state.rounds
      await new Promise(resolve=>setTimeout(resolve,1600))
      if (engine.state.rounds!==rounds || engine.state.status!=='stopped') throw new Error('Stop failed')
      await writeFile(path.join(outputDir,'smoke.json'),JSON.stringify({ passed:true,version:app.getVersion(),welcomeVerified:welcome,bundledConnectionVerified:app.isPackaged,rounds,files:engine.state.files,reportWritten,newTaskPrioritized:true,stopped:true },null,2))
      quitting = true; app.quit()
    } catch(error) { console.error(error); quitting = true; await engine.stop(); app.exit(1) }
  }
}).catch(error => { console.error(error); app.exit(1) })
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { quitting = true; connection?.close(); if (engine) void engine.stop() })
