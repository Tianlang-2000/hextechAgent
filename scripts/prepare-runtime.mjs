import { cp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('安装包目前仅支持在 Windows x64 上构建')
const packageRoot = path.join(root, 'node_modules', '@openai', 'codex')
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
const triple = 'x86_64-pc-windows-msvc'
const candidates = [
  path.join(root, 'node_modules', '@openai', 'codex-win32-x64', 'vendor'),
  path.join(packageRoot, 'node_modules', '@openai', 'codex-win32-x64', 'vendor'),
  path.join(packageRoot, 'vendor'),
]
let vendor
let executableDirectory
for (const candidate of candidates) {
  for (const folder of ['bin', 'codex']) {
    try { await access(path.join(candidate, triple, folder, 'codex.exe')); vendor = candidate; executableDirectory = folder; break } catch {}
  }
  if (vendor) break
}
if (!vendor) throw new Error('缺少官方 Codex Windows 组件，请先运行 npm ci（包含 optionalDependencies）')
const output = path.resolve(root, 'build', 'codex-runtime')
if (output !== path.join(root, 'build', 'codex-runtime') || path.relative(root, output).startsWith('..')) throw new Error('运行组件输出目录不安全')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(path.join(vendor, triple), path.join(output, 'vendor', triple), { recursive: true })
await cp(path.join(root, 'build', 'licenses', 'Codex-LICENSE.txt'), path.join(output, 'LICENSE-Codex.txt'))
await cp(path.join(root, 'build', 'licenses', 'Codex-NOTICE.txt'), path.join(output, 'NOTICE-Codex.txt'))
for (const name of ['NOTICE', 'NOTICE.txt']) {
  try { await cp(path.join(packageRoot, name), path.join(output, name)) } catch(error) { if (error.code !== 'ENOENT') throw error }
}
const binary = await readFile(path.join(output, 'vendor', triple, executableDirectory, 'codex.exe'))
if (binary.length < 1000000) throw new Error('官方连接组件不完整，请重新安装依赖')
await writeFile(path.join(output, 'runtime.json'), JSON.stringify({ source: '@openai/codex', version: manifest.version, license: manifest.license, sha256: createHash('sha256').update(binary).digest('hex') }, null, 2))
console.log(`已准备官方 Codex ${manifest.version} Windows x64 组件（不包含任何用户配置或登录数据）`)
