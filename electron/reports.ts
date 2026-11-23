import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ReportEntry } from '../src/shared'

// Each report has its own metadata so a damaged entry cannot lose the whole history.
export class ReportStore {
  constructor(private directory: string) {}
  async save(report: string, details: Omit<ReportEntry, 'id' | 'file' | 'createdAt'>): Promise<ReportEntry> {
    await mkdir(this.directory, { recursive: true })
    const id = randomUUID()
    const entry: ReportEntry = { ...details, id, file: `hextech-${id}.md`, createdAt: new Date().toISOString() }
    await writeFile(path.join(this.directory, entry.file), report, 'utf8')
    const target = path.join(this.directory, `report-${id}.json`)
    const temp = `${target}.tmp`
    await writeFile(temp, JSON.stringify(entry), 'utf8')
    await rename(temp, target)
    return entry
  }
  async list(root: string, mode: ReportEntry['mode']): Promise<ReportEntry[]> {
    let names: string[]
    try { names = await readdir(this.directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const entries: ReportEntry[] = []
    for (const name of names.filter(name => /^report-[a-f0-9-]+\.json$/.test(name))) {
      try {
        const entry = JSON.parse(await readFile(path.join(this.directory, name), 'utf8'))
        if (entry.root !== root || entry.mode !== mode || typeof entry.id !== 'string' || name !== `report-${entry.id}.json` || entry.file !== `hextech-${entry.id}.md` ||
          !['title', 'source', 'createdAt'].every(key => typeof entry[key] === 'string') || !Number.isFinite(Date.parse(entry.createdAt)) || typeof entry.write !== 'boolean') continue
        entries.push(entry)
      } catch { /* Ignore incomplete or malformed individual metadata. */ }
    }
    return entries.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,100)
  }
  async read(entry: ReportEntry): Promise<string> {
    if (!/^[a-f0-9-]+$/.test(entry.id) || entry.file !== `hextech-${entry.id}.md`) throw new Error('无效报告记录')
    return readFile(path.join(this.directory, entry.file), 'utf8')
  }
  path(entry: ReportEntry) { return path.join(this.directory, entry.file) }
}
