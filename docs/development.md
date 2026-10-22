# 开发与打包

## 环境

当前桌面版本主要验证 Windows x64。建议使用 Node.js 24 LTS 和 npm，依赖版本以 `package-lock.json` 为准。

```sh
npm ci
npm run dev
```

开发启动由 Vite 提供渲染页面，同时构建 Electron 主进程和预加载脚本。窗口和文件访问代码位于 `electron/`，Vue 界面位于 `src/`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Electron 与 Vite 开发环境 |
| `npm run build` | 先进行 TypeScript/Vue 类型检查，再构建 |
| `npm start` | 运行已构建版本 |
| `npm test` | 验证队列、过滤、三方案校验、监听循环、继续深入和额度停止 |
| `npm run test:desktop` | 运行 Electron 演示流程并生成截图 |
| `npm run check:codex` | 读取本机 Codex 登录和额度状态 |
| `npm run check:codex -- --analyze` | 对固定示例做一次真实模型验证，会消耗额度 |
| `npm run package:dir` | 生成 `release/win-unpacked` Windows 应用目录 |
| `npm run package` | 生成 Windows portable 可执行文件 |

`npm run preview` 仅用于查看渲染页面，不具备 Electron 的文件访问与 IPC 能力。产品完整流程需要在 Electron 中验证。

## 测试边界

行为测试和桌面演示测试都使用演示实现，不会调用真实模型。测试生成的工作目录位于项目内，并在测试后清理。

桌面测试使用 `test-results/electron-profile` 作为独立应用数据目录，输出：

```text
test-results/dashboard.png
test-results/overlay.png
test-results/followup.png
test-results/smoke.json
```

完整流程包括三张方案牌、点击选择、报告生成、两张后续牌、新任务优先以及停止后不再分析。

真实接入检查是独立命令，不属于默认测试和 CI。请使用自己的 Codex 登录，并留意 `--analyze` 会消耗账号额度。

## 生成 Windows 运行包

```sh
npm ci
npm test
npm run package:dir
```

完成后，应用入口为：

```text
release/win-unpacked/Hextech Agent.exe
```

`win-unpacked` 中包含 Electron 运行时、应用资源和依赖，需要整体分发。可以使用 PowerShell 压缩：

```powershell
Compress-Archive -Path 'release/win-unpacked/*' -DestinationPath 'release/Hextech-Agent-0.1.0-windows-x64.zip' -Force
Get-FileHash -LiteralPath 'release/Hextech-Agent-0.1.0-windows-x64.zip' -Algorithm SHA256
```

当前配置关闭 Windows 可执行文件资源编辑与代码签名，发布的是未签名 Demo。没有内置自动更新服务。

## 发布约定

- 仓库保存源码、中文文档、文档截图和依赖锁文件。
- 编译产物、依赖目录、缓存、测试数据和本机报告不提交到源码分支。
- Windows 运行包通过 GitHub Release 附件提供，并同时提供 SHA256 校验值。
- `0.1.0` 是演示预发布版本，发布说明需要区分已实现能力和后续计划。
- 默认 CI 只运行不消耗模型额度的测试与构建。

## Electron 下载失败

可以在当前 PowerShell 窗口中设置下载镜像，再重试：

```powershell
$env:ELECTRON_MIRROR = 'https://registry.npmmirror.com/-/binary/electron/'
npm ci
```

若使用受限目录，还可以把当前安装使用的缓存放到项目内：

```powershell
$env:npm_config_cache = Join-Path (Get-Location) '.npm-cache'
$env:electron_config_cache = Join-Path (Get-Location) '.electron-cache'
npm ci
```

这些设置只影响当前终端环境。默认安装无需配置镜像。
