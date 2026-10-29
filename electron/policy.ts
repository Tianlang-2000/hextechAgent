import path from 'node:path'

const excluded = new Set(['node_modules', '.git', '.codex', '.agents', '.aws', '.ssh', 'dist', 'build', 'release', '.next', '.idea', '.vscode', '$RECYCLE.BIN'])
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.json', '.md', '.txt', '.csv', '.yaml', '.yml', '.html', '.css', '.scss', '.py', '.go', '.rs', '.java', '.sql', '.xml', '.toml'])
export function inside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
export function ignored(root: string, file: string): boolean {
  if (!inside(root, file)) return true
  return path.relative(root, file).split(/[\\/]/).some(part => excluded.has(part) || /^\.env(?:\.|$)/i.test(part) || /(?:secret|credential|token|password|private[-_]?key)/i.test(part) || /\.(pem|key|p12|pfx)$/i.test(part))
}
export function readable(root: string, file: string): boolean { return !ignored(root, file) && extensions.has(path.extname(file).toLowerCase()) }

export class TaskQueue {
  private tasks = new Map<string, { file: string; priority: boolean; at: number }>()
  add(file: string, priority = false) { const old = this.tasks.get(file); this.tasks.set(file, { file, priority: priority || !!old?.priority, at: Date.now() }) }
  remove(file: string) { this.tasks.delete(file) }
  clear() { this.tasks.clear() }
  snapshot() { return [...this.tasks.values()].map(item=>({...item})) }
  restore(items: {file:string;priority:boolean;at:number}[]) { for (const item of items) this.tasks.set(item.file,{...item}) }
  has(file: string) { return this.tasks.has(file) }
  get size() { return this.tasks.size }
  get urgent() { return [...this.tasks.values()].some(item => item.priority) }
  take() {
    const next = [...this.tasks.values()].sort((a, b) => Number(b.priority) - Number(a.priority) || a.at - b.at)[0]
    if (next) this.tasks.delete(next.file)
    return next
  }
}
