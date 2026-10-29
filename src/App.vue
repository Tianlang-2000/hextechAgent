<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Activity, ArrowDownToLine, ArrowRight, Check, ChevronRight, CircleHelp, Code2, Cpu, FileText, Folder, Hexagon, Layers3, LoaderCircle, Minus, Monitor, Pause, Play, Radar, Settings2, ShieldCheck, Sparkles, WandSparkles, X, Zap } from '@lucide/vue'
import type { AgentState, ConnectionState, ModelCatalog } from './shared'
import ModelPreferences from './components/ModelPreferences.vue'
import { effortLabel, speedLabel, supportsEffort, supportsTier } from './generation-options'
const overlay = location.hash === '#overlay'
document.documentElement.classList.toggle('is-overlay',overlay)
const state = ref<AgentState>({ status:'idle', settings:{ mode:'demo',root:'',executable:'',model:'',allowWrite:false,floating:true },account:'',quotaRemaining:null,files:0,rounds:0,solved:0,queued:0,currentFile:'',finding:null,backlog:[],report:'',reportPath:'',logs:[],error:'' })
const settingsOpen = ref(false)
const reportOpen = ref(false)
const toast = ref('')
const tab = ref('overview')
const pending = ref(false)
const executable = ref('')
const model = ref('')
const effort = ref('')
const tier = ref('')
const rescanMinutes = ref(5)
const dailyLimit = ref(0)
const catalog = ref<ModelCatalog>({status:'idle',models:[],error:''})
const activeModel = computed(()=>catalog.value.models.find(m=>m.model===model.value))
const invalidPreferences = computed(()=>catalog.value.status==='ready' && (!!model.value&&!activeModel.value || !supportsEffort(activeModel.value,effort.value) || !supportsTier(activeModel.value,tier.value)))
const generationSummary = computed(()=>[
  catalog.value.models.find(m=>m.model===state.value.settings.model)?.name || state.value.settings.model || '默认模型',
  state.value.settings.reasoningEffort?`${effortLabel(state.value.settings.reasoningEffort)}推理`:'默认推理',
  speedLabel(state.value.settings.serviceTier||''),
].join(' · '))
const welcomeOpen = ref(false)
const connection = ref<ConnectionState>({ status: 'unchecked', message: '登录后即可开始真实分析', email: '' })
const connecting = computed(() => ['checking','login'].includes(connection.value.status))
const running = computed(()=>!['idle','stopped','quota','error'].includes(state.value.status))
const statusText = computed(()=>({idle:'等待启动',watching:'正在巡检',thinking:'正在思考',choosing:'等待你的选择',executing:'正在处理方案',followup:'本轮处理完成',stopped:'巡检已停止',quota:'额度已用完',error:'需要处理连接'}[state.value.status]))
const statusDetail = computed(()=> state.value.currentFile || (running.value ? '持续留意桌面的每一次变化' : '准备好后，让灵感开始流动'))
const planIcons = [Zap,Layers3,WandSparkles]
const cardLabels = ['轻量方案','推荐方案','进阶方案']
const canChoose = computed(()=>state.value.status==='choosing')
const isFollowup = computed(()=>state.value.status==='followup')
const quotaText = computed(()=>state.value.settings.mode==='demo' ? '不消耗额度' : state.value.quotaRemaining===null ? '额度暂不可用' : `${Math.round(state.value.quotaRemaining)}% 剩余`)
let unsubscribe: (()=>void)|undefined
let unsubscribeConnection: (()=>void)|undefined
let unsubscribeModels: (()=>void)|undefined
let toastTimer: ReturnType<typeof setTimeout>
function notify(text: string) { toast.value=text; clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.value='',4500) }
async function action(name:string,payload?:unknown) {
  if (!window.hextech) { notify('请打开海克斯 Agent 应用后操作'); return false }
  try { await window.hextech.action(name,payload); return true } catch(error) { notify(String((error as Error).message)); return false }
}
async function toggleRun() { pending.value=true; try { await action(running.value ? 'stop':'start') } finally { pending.value=false } }
async function selectRoot() { if (!window.hextech) return; const root=await window.hextech.chooseRoot(); if(root) await action('settings',{root}) }
function preferences() { return {executable:executable.value,model:model.value,reasoningEffort:effort.value,serviceTier:tier.value,rescanMinutes:rescanMinutes.value,dailyLimit:dailyLimit.value} }
async function saveSettings() {
  if (invalidPreferences.value) { notify('请重新选择当前模型支持的推理强度和速度'); return }
  if (await action('settings',preferences())) settingsOpen.value=false
}
watch(settingsOpen,async open=>{
  if(!open)return
  executable.value=state.value.settings.executable; model.value=state.value.settings.model
  effort.value=state.value.settings.reasoningEffort||''; tier.value=state.value.settings.serviceTier||''
  rescanMinutes.value=state.value.settings.rescanMinutes??5
  dailyLimit.value=state.value.settings.dailyLimit??0
  if(catalog.value.status==='idle'&&!running.value)await action('models-refresh')
})
async function selectMode(mode: 'demo' | 'codex') {
  if (await action('settings',{mode})) {
    if (mode==='codex') await action('connection-check')
    else if (connection.value.status==='login') await action('cancel-login')
  }
}
async function startDemo() {
  pending.value=true
  try { if (await action('settings',{mode:'demo',onboardingDone:true})) { welcomeOpen.value=false; await action('start') } }
  finally { pending.value=false }
}
async function connectFromWelcome() { welcomeOpen.value=false; settingsOpen.value=true; await selectMode('codex') }
async function startConnected() {
  if (connection.value.status!=='ready') return
  if (invalidPreferences.value) { notify('请重新选择当前模型支持的推理强度和速度'); return }
  if (await action('settings',{onboardingDone:true,...preferences()})) { settingsOpen.value=false; await action('start') }
}
onMounted(async()=>{
  if (window.hextech) {
    unsubscribe=window.hextech.onState(value=>{state.value=value})
    state.value=await window.hextech.getState()
    executable.value=state.value.settings.executable; model.value=state.value.settings.model
    welcomeOpen.value=!overlay && !state.value.settings.onboardingDone
    unsubscribeConnection=window.hextech.onConnection(value=>{connection.value=value})
    connection.value=await window.hextech.getConnection()
    unsubscribeModels=window.hextech.onModels(value=>{catalog.value=value})
    catalog.value=await window.hextech.getModels()
    effort.value=state.value.settings.reasoningEffort||''; tier.value=state.value.settings.serviceTier||''
  }
})
onUnmounted(()=>{unsubscribe?.();unsubscribeConnection?.();unsubscribeModels?.();clearTimeout(toastTimer)})
</script>

<template>
  <div :class="['app-shell',{floating:overlay}]">
    <header class="titlebar">
      <div class="brand"><span class="brand-mark"><Hexagon :size="23"/><span>H</span></span><strong>HEXTECH <em>AGENT</em></strong><span class="version">0.3</span></div>
      <div class="title-center"><span class="tiny-dot"/> {{ state.settings.mode==='demo' ? '演示空间' : 'CODEX · 本机连接' }}</div>
      <div class="window-actions"><button v-if="overlay" title="收起卡牌，巡检继续" @click="action('hide-overlay')"><Minus :size="17"/></button><button v-else title="最小化" @click="action('minimize')"><Minus :size="17"/></button><button class="close-window" title="关闭并停止所有任务" @click="action('close')"><X :size="18"/></button></div>
    </header>

    <div class="app-body">
      <aside v-if="!overlay" class="sidebar">
        <div class="workspace-label">WORKSPACE</div>
        <button :class="['nav-item',{active:tab==='overview'}]" @click="tab='overview'"><Hexagon :size="18"/> 海克斯空间 <span class="nav-dot"/></button>
        <button :class="['nav-item',{active:tab==='activity'}]" @click="tab='activity'"><Activity :size="18"/> 活动记录 <small>{{ state.logs.length }}</small></button>
        <button class="nav-item" @click="settingsOpen=true"><Settings2 :size="18"/> 连接与设置</button>
        <div class="side-line"/>
        <div class="workspace-label">WATCHING</div>
        <button class="folder-entry" @click="action('folder')"><Folder :size="17"/><span>{{ state.settings.mode==='demo'?'演示文件夹':'桌面工作区' }}</span><span class="tiny-dot"/></button>
        <p class="folder-caption">新文件、新想法<br/>都值得被优先看见。</p>
        <div class="sidebar-bottom"><div class="mini-orb"><Cpu :size="21"/></div><div><strong>让工作，自己向前。</strong><p>Powered by Codex</p></div></div>
      </aside>

      <main>
        <template v-if="!overlay">
          <div class="page-heading"><div><div class="eyebrow">YOUR AMBIENT COPILOT</div><h1>{{ tab==='activity'?'每一步，都有迹可循':'把下一步，交给海克斯。' }}</h1><p>安静地发现问题，在需要你的时候，给出选择。</p></div><button data-testid="settings-open" class="icon-button" title="连接与设置" @click="settingsOpen=true"><Settings2 :size="19"/></button></div>
          <section class="monitor-panel">
            <div class="monitor-left"><div :class="['radar-orb',{spinning:running}]"><Radar :size="28"/><i/><i/></div><div><div class="monitor-title"><span :class="['live-dot',{off:!running}]"/>{{ statusText }}<span class="mode-chip">{{ state.settings.mode==='demo'?'演示模式':'CODEX' }}</span></div><p :title="statusDetail">{{ statusDetail }}</p></div></div>
            <div class="monitor-right"><span class="quota"><Zap :size="14"/>{{ quotaText }}</span><button :class="['run-button',{running}]" :disabled="pending" @click="toggleRun"><LoaderCircle v-if="pending" class="spin" :size="15"/><Pause v-else-if="running" :size="15"/><Play v-else :size="15"/>{{ running?'停止巡检':'开始巡检' }}</button></div>
            <div class="monitor-bottom"><span><Monitor :size="13"/><span class="root-path" :title="state.settings.root">{{ state.settings.root || '启动 Electron 后自动定位目录' }}</span></span><button :disabled="running" @click="selectRoot">更换目录 <ChevronRight :size="13"/></button><span class="privacy"><ShieldCheck :size="13"/>{{ state.settings.allowWrite?'选定方案后可修改文件':'只读巡检 · 由你决定下一步' }}</span></div>
            <div v-if="state.settings.mode==='codex'" class="generation-summary"><Cpu :size="12"/><span>{{generationSummary}}</span><button @click="settingsOpen=true">调整</button></div>
          </section>
          <div v-if="state.error" class="error-banner"><CircleHelp :size="17"/><span>{{ state.error }}</span></div>
        </template>

        <section v-if="tab==='overview'||overlay" class="discovery">
          <div class="section-heading"><div><Sparkles :size="16"/><span>{{ isFollowup?'下一步，由你决定':'海克斯发现' }}</span><span v-if="state.finding" class="count-badge">{{ isFollowup?'2 个选择':'3 个方案' }}</span></div><span class="section-hint">{{ state.settings.mode==='demo'?'DEMO · 示例内容':'先思考，再出牌' }}</span></div>

          <template v-if="state.finding && ['choosing','executing','followup'].includes(state.status)">
            <div class="finding-header"><div><span class="category"><Code2 :size="12"/>{{ state.finding.category }}</span><h2>{{ isFollowup?'这一轮，已经向前一步。':state.finding.title }}</h2><p>{{ isFollowup ? (state.settings.allowWrite && state.settings.mode==='codex'?'Codex 已返回处理结果。查看报告后，你可以继续追问，或让海克斯寻找下一个问题。':'方案已整理成执行报告。你可以继续深入，或让海克斯寻找下一个问题。') : state.finding.summary }}</p></div><span class="source"><FileText :size="13"/>{{ state.finding.source }}</span></div>

            <div v-if="!isFollowup" class="cards">
              <button v-for="(plan,index) in state.finding.plans" :key="plan.id" :class="['plan-card',`tier-${index}`,{recommended:index===1}]" :disabled="!canChoose" @click="action('choose',plan.id)">
                <div class="card-top"><span>{{ cardLabels[index] }}</span><span class="rune-number">0{{ index+1 }}</span></div>
                <div class="card-sigil"><Hexagon :size="76" :stroke-width="0.65"/><component :is="planIcons[index]" class="sigil-icon" :size="28" :stroke-width="1.5"/><div class="sigil-glow"/></div>
                <h3>{{ plan.title }}</h3><div class="card-subtitle">{{ plan.subtitle }}</div><p>{{ plan.description }}</p>
                <div class="card-meta"><span>{{ plan.effort }}</span><span>{{ plan.risk }}</span></div><div class="card-action"><span>{{ state.status==='executing'?'正在处理…':'选择这个方案' }}</span><ArrowRight :size="16"/></div>
              </button>
            </div>
            <div v-else class="followup-cards"><button class="followup-card" @click="action('deeper')"><span class="followup-icon"><Layers3 :size="26"/></span><h3>再深入一步</h3><p>沿着这条线索，检查根因与相邻问题。</p><span>继续深入 <ArrowRight :size="16"/></span></button><button class="followup-card cyan" @click="action('next')"><span class="followup-icon"><Radar :size="26"/></span><h3>寻找下一个机会</h3><p>回到桌面巡检，优先留意新的工作。</p><span>继续巡检 <ArrowRight :size="16"/></span></button></div>
            <div class="below-cards"><span v-if="state.status==='executing'"><LoaderCircle class="spin" :size="14"/> Codex 正在处理你选择的方案</span><button v-else-if="isFollowup" @click="reportOpen=true"><FileText :size="14"/>查看执行报告 <ChevronRight :size="13"/></button><span v-else><ShieldCheck :size="13"/>{{ state.settings.allowWrite?'选择后允许 Codex 修改目录内文件':'选牌后生成详细报告，源文件保持只读' }}</span><button v-if="canChoose" @click="action('next')">暂时跳过 <ArrowRight :size="13"/></button></div>
          </template>

          <div v-else class="empty-discovery"><div class="empty-hex"><Hexagon :size="80" :stroke-width="0.7"/><Sparkles :size="29"/></div><h2>{{ state.status==='thinking'?'好方案，值得等一小会儿。':state.status==='quota'?'休息一下，等灵感恢复。':'下一张好牌，正在路上。' }}</h2><p>{{ running?'海克斯正在阅读文件，发现有依据的问题后，会带着三个方案来找你。':'点击「开始巡检」，体验发现问题、选择方案、继续探索的完整循环。' }}</p><span class="empty-tag"><span class="tiny-dot"/>{{ running?'先完成分析，再展示卡牌':'支持代码 · 文档 · 工作计划' }}</span></div>

          <div v-if="state.finding?.evidence.length && !isFollowup" class="evidence"><span>发现依据 · {{ state.finding.source }}</span><div><p v-for="(item,index) in state.finding.evidence" :key="index">{{ state.finding.evidenceLocations?.[index] ? `第 ${state.finding.evidenceLocations[index]} 行 · 已匹配节选` : '未匹配原文 · 需要核实' }}：{{ item }}</p><small>匹配仅确认文字存在，问题判断仍需结合原文件核实；文件可能已发生变化。</small></div><span v-if="state.backlog.length" class="backlog-badge">还有 {{ state.backlog.length }} 个发现待看</span></div>
        </section>

        <section v-if="!overlay" class="activity-section"><div class="section-heading"><div><Activity :size="16"/><span>最近动态</span></div><span class="section-hint">{{ state.files }} 个文件 · {{ state.rounds }} 次分析 · {{ state.solved }} 份报告</span></div><div class="activity-list"><div v-for="log in state.logs.slice(0,tab==='activity'?40:3)" :key="log.id" class="activity-row"><span :class="['log-dot',log.kind]"/><time>{{ log.time }}</time><span>{{ log.text }}</span><span v-if="log.kind==='new'" class="priority-tag">优先</span></div><div v-if="!state.logs.length" class="activity-row muted"><span class="log-dot"/><span>一切就绪。开始后，桌面的新动作会出现在这里。</span></div></div></section>
        <footer v-if="!overlay"><span><span class="tiny-dot"/>{{ state.settings.mode==='demo'?'演示不调用模型':'复用本机 Codex 登录' }}</span><span>发现 → 三选一 → 处理 → 二选一 → 继续</span><button @click="settingsOpen=true">连接说明 <CircleHelp :size="12"/></button></footer>
      </main>
    </div>

    <div v-if="welcomeOpen" class="modal-backdrop"><section class="modal welcome-modal"><div class="welcome-brand"><Hexagon :size="58" :stroke-width="1"/><Sparkles :size="23"/></div><div class="eyebrow">WELCOME TO HEXTECH</div><h2>准备好了，轻松开始。</h2><p class="modal-intro">不用设置复杂参数。先看看海克斯怎样发现问题，<br/>再用三张牌帮你决定下一步。</p><div class="welcome-steps"><span><Check :size="14"/> 安装已经完成</span><span><ShieldCheck :size="14"/> 默认只读，不改你的文件</span><span><Monitor :size="14"/> 下次双击桌面图标即可打开</span></div><button class="run-button welcome-primary" data-testid="welcome-demo" :disabled="pending" @click="startDemo"><Play :size="16"/>先体验一下 <span>无需登录 · 不消耗额度</span></button><button class="welcome-connect" :disabled="pending" @click="connectFromWelcome">连接我的 ChatGPT，开始真实分析 <ArrowRight :size="15"/></button><p class="welcome-note">真实分析需要登录有 Codex 使用权限的账号。</p></section></div>
    <div v-if="settingsOpen" class="modal-backdrop" @click.self="settingsOpen=false"><section class="modal"><div class="modal-heading"><h2>连接与设置</h2><button class="icon-button" @click="settingsOpen=false"><X :size="19"/></button></div><p class="modal-intro">先体验，或连接账号后分析自己的文件。</p><label>运行模式</label><div class="mode-selector"><button :class="{selected:state.settings.mode==='demo'}" :disabled="running||connecting" @click="selectMode('demo')"><Sparkles :size="17"/><strong>演示模式</strong><small>样例方案 · 无需登录</small></button><button :class="{selected:state.settings.mode==='codex'}" :disabled="running||connecting" @click="selectMode('codex')"><Cpu :size="17"/><strong>真实分析</strong><small>连接 ChatGPT 账号</small></button></div>
    <div v-if="state.settings.mode==='codex'" :class="['connection-panel',connection.status]" aria-live="polite"><div class="connection-heading"><LoaderCircle v-if="connecting" class="spin" :size="18"/><Check v-else-if="connection.status==='ready'" :size="18"/><Cpu v-else :size="18"/><strong>{{ connection.status==='ready'?(connection.email||'账号已连接'):'ChatGPT 账号连接' }}</strong></div><p>{{ connection.message }}</p><div class="connection-actions"><button v-if="connection.status!=='ready'&&connection.status!=='login'" class="run-button" :disabled="connecting||running" @click="action('login')">登录 ChatGPT <ArrowRight :size="14"/></button><button v-if="connection.status==='login'" class="secondary-button" @click="action('cancel-login')">取消登录</button><button class="connection-retry" :disabled="connecting||running" @click="action('connection-check')">重新检查</button></div><small>连接组件已随安装包提供。登录在浏览器中完成，无需命令行。</small></div>
    <p class="setting-note">{{ state.settings.mode==='codex'?'真实分析会将所选目录的文件节选交给模型处理，并使用账号额度。':'演示不会调用模型；下面的选择将在真实分析时生效。' }}</p>
    <ModelPreferences v-model:model="model" v-model:effort="effort" v-model:tier="tier" :catalog="catalog" :disabled="running||connecting" @refresh="action('models-refresh')"/>
    <div class="model-preferences"><label for="rescan-frequency">未变化文件的复查频率</label><select id="rescan-frequency" v-model.number="rescanMinutes" :disabled="running||connecting"><option :value="0">仅检查新增或修改</option><option :value="5">每个文件至少间隔 5 分钟</option><option :value="15">每个文件至少间隔 15 分钟</option><option :value="60">每个文件至少间隔 1 小时</option></select><p class="preference-note">新文件和修改仍会优先检查。减少复查频率可降低调用次数。</p></div>
    <div class="model-preferences"><label for="daily-limit">每日调用次数上限</label><select id="daily-limit" v-model.number="dailyLimit" :disabled="running||connecting"><option :value="0">不限制</option><option :value="10">10 次</option><option :value="30">30 次</option><option :value="100">100 次</option></select><p class="preference-note">按本机自然日计数，问题分析和选牌处理各算一次；失败或中断也可能消耗一次。此上限不是账号额度。</p></div>
    <details class="advanced-settings"><summary>高级选项 <span>通常无需修改</span></summary><label>连接组件路径 <span>留空使用内置组件</span></label><input v-model="executable" :disabled="running||connecting" placeholder="自动使用内置组件"/></details>
    <div class="setting-toggle"><div><strong>桌面悬浮卡牌</strong><small>方案就绪后，在桌面弹出独立窗口</small></div><button :disabled="running" :class="['toggle',{on:state.settings.floating}]" @click="action('settings',{floating:!state.settings.floating})"><i/></button></div><div class="setting-toggle"><div><strong>选牌后允许修改文件</strong><small>默认关闭；开启后，选牌才会触发文件修改</small></div><button :disabled="running" :class="['toggle',{on:state.settings.allowWrite}]" @click="action('settings',{allowWrite:!state.settings.allowWrite})"><i/></button></div>
    <p v-if="running" class="setting-note">先停止巡检，即可修改设置。</p><div class="modal-actions"><button class="secondary-button" @click="settingsOpen=false">关闭</button><button v-if="state.settings.mode==='codex'&&connection.status==='ready'" class="run-button" :disabled="running||connecting||invalidPreferences" @click="startConnected"><Play :size="15"/>开始真实巡检</button><button data-testid="settings-save" class="run-button" :disabled="running||connecting||invalidPreferences" @click="saveSettings"><Check :size="15"/>保存设置</button></div></section></div>
    <div v-if="reportOpen" class="modal-backdrop" @click.self="reportOpen=false"><section class="modal report-modal"><div class="modal-heading"><h2>执行报告</h2><button class="icon-button" @click="reportOpen=false"><X :size="19"/></button></div><pre>{{ state.report }}</pre><div class="modal-actions"><button class="run-button" @click="action('report')"><ArrowDownToLine :size="16"/>打开报告文件</button></div></section></div>
    <div v-if="toast" class="toast"><CircleHelp :size="16"/>{{ toast }}</div>
  </div>
</template>
