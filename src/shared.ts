export type Status = 'idle' | 'watching' | 'thinking' | 'choosing' | 'executing' | 'followup' | 'stopped' | 'quota' | 'error'
export interface Plan { id: string; title: string; subtitle: string; description: string; steps: string[]; effort: string; risk: string }
export interface Finding { id: string; title: string; summary: string; evidence: string[]; category: string; plans: Plan[]; source: string }
export interface Analysis { hasIssue: boolean; title: string; summary: string; evidence: string[]; category: string; plans: Plan[] }
export interface Settings { mode: 'demo' | 'codex'; root: string; executable: string; model: string; allowWrite: boolean; floating: boolean }
export interface Log { id: number; time: string; text: string; kind: 'info' | 'new' | 'success' | 'error' }
export interface AgentState {
  status: Status; settings: Settings; account: string; quotaRemaining: number | null;
  files: number; rounds: number; solved: number; queued: number; currentFile: string;
  finding: Finding | null; backlog: Finding[]; report: string; reportPath: string; logs: Log[]; error: string;
}
export interface HextechAPI {
  getState(): Promise<AgentState>;
  onState(callback: (state: AgentState) => void): () => void;
  action(action: string, payload?: unknown): Promise<void>;
  chooseRoot(): Promise<string | null>;
}
declare global { interface Window { hextech?: HextechAPI } }
