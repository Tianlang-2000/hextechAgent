export type Status = 'idle' | 'watching' | 'thinking' | 'choosing' | 'executing' | 'followup' | 'stopped' | 'quota' | 'error'
export interface Plan { id: string; title: string; subtitle: string; description: string; steps: string[]; effort: string; risk: string }
export interface Finding { id: string; title: string; summary: string; evidence: string[]; evidenceLocations?: (number | null)[]; category: string; plans: Plan[]; source: string }
export interface Analysis { hasIssue: boolean; title: string; summary: string; evidence: string[]; category: string; plans: Plan[] }
export interface Settings { mode: 'demo' | 'codex'; root: string; executable: string; model: string; reasoningEffort?: string; serviceTier?: string; rescanMinutes?: number; dailyLimit?: number; allowWrite: boolean; floating: boolean; onboardingDone?: boolean }
export interface ModelOption { model: string; name: string; description: string; isDefault: boolean; defaultEffort: string; efforts: { id: string; description: string }[]; tiers: { id: string; name: string; description: string }[] }
export interface ModelCatalog { status: 'idle' | 'loading' | 'ready' | 'error'; models: ModelOption[]; error: string }
export interface ConnectionState { status: 'unchecked' | 'checking' | 'ready' | 'signed-out' | 'login' | 'error'; message: string; email: string }
export interface Log { id: number; time: string; text: string; kind: 'info' | 'new' | 'success' | 'error' }
export interface AgentState {
  status: Status; settings: Settings; account: string; quotaRemaining: number | null;
  files: number; rounds: number; solved: number; queued: number; currentFile: string;
  finding: Finding | null; backlog: Finding[]; report: string; reportPath: string; logs: Log[]; error: string;
}
export interface HextechAPI {
  getModels(): Promise<ModelCatalog>;
  onModels(callback: (catalog: ModelCatalog) => void): () => void;
  getConnection(): Promise<ConnectionState>;
  onConnection(callback: (state: ConnectionState) => void): () => void;
  getState(): Promise<AgentState>;
  onState(callback: (state: AgentState) => void): () => void;
  action(action: string, payload?: unknown): Promise<void>;
  chooseRoot(): Promise<string | null>;
}
declare global { interface Window { hextech?: HextechAPI } }
