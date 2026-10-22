# Codex 接入说明

## 接入方式

海克斯通过标准输入和标准输出启动本机进程：

```sh
codex app-server --listen stdio://
```

Electron 主进程发送 JSON-RPC 请求，接收账号、额度、回合状态和模型结果。模型推理和工具运行由 Codex 提供。

这不是模拟点击 ChatGPT 或 Codex 桌面窗口，也不是读取已有聊天记录。海克斯会创建自己的 Codex 回合，并复用本机 Codex 能访问的登录与配置。

官方协议说明：[Codex App Server](https://learn.chatgpt.com/docs/app-server)。本文中的具体字段对应本项目实现，不表示所有未来版本都保持兼容。

## 登录与程序定位

先在终端执行：

```sh
codex login
```

使用 ChatGPT 账号完成登录。当前实现接受 `chatgpt` 和 `chatgptAuthTokens` 账号类型；仅配置 API Key 不满足这个 Demo 的登录检查。

Windows 下会依次检查 PATH、常见 npm 全局安装中的原生可执行文件，以及桌面客户端的本地安装目录。查找失败时，可以在设置里填写 `codex.exe` 的完整路径。

模型名留空时使用本机 Codex 配置。手动填写的模型必须对当前账号可用；程序没有把模型目录列表当作账号权限证明。

## 独立检查连接

```sh
npm run check:codex
```

检查会读取账号状态及额度数据，不发起模型任务，也不扫描桌面。

需要验证真实分析时执行：

```sh
npm run check:codex -- --analyze
```

它仅向模型提供一段固定示例，并校验三个方案的返回结构。这一步会使用 Codex 额度。

## 调用顺序

| 阶段 | 方法 | 用途 |
| --- | --- | --- |
| 建立连接 | `initialize` → `initialized` | 注册客户端信息并完成握手 |
| 检查账号 | `account/read` | 确认当前登录类型 |
| 读取额度 | `account/rateLimits/read` | 更新可用额度状态 |
| 开始分析 | `thread/start` | 创建独立线程并设置工作目录、沙箱与模型 |
| 发起任务 | `turn/start` | 提供文本输入和可选的结构化输出约束 |
| 接收结果 | `item/completed`、`turn/completed` | 收集最终消息并确认回合完成 |
| 接收额度变化 | `account/rateLimits/updated` | 判断是否需要停止 |

每个模型任务使用新的线程；继续深入时，由海克斯显式补入上一轮问题和报告，不依赖桌面窗口里的对话状态。

## 方案结构与展示条件

问题分析通过 `outputSchema` 请求结构化结果，包含：

```text
hasIssue: 是否发现问题
title / summary / category: 问题说明
evidence: 文件依据
plans: 三个方案
  id / title / subtitle / description
  steps / effort / risk
```

`hasIssue=false` 时不出牌。发现问题时，海克斯还会校验方案数量、不同的 ID 和必要字段，避免生成过程中提前显示半张牌。

## 权限与停止

- 分析回合使用 `read-only` 线程沙箱和 `readOnly` 回合策略。
- 开启可写模式并选牌后，使用 `workspace-write` 线程沙箱和 `workspaceWrite` 回合策略，指定监听目录为可写根。
- 两种回合都将工具网络访问设置为关闭；这不等于模型推理在离线运行。
- `approvalPolicy` 为 `never`，不会自动批准额外权限；交互式工具请求不会转发给其他服务。
- 取消或停止时关闭 App Server；Windows 同时尝试终止该进程的子进程树。

这些策略仍由所安装 Codex 的实现和本机管理配置执行。扫描过滤不等同于 Codex 工具读取范围的隔离。

## 额度与错误

优先读取多额度桶中的 Codex 数据，没有对应数据时回退到单桶结果。根据有效窗口的最高已用比例计算界面剩余百分比；缺少数据时显示不可用。

检测到额度耗尽会停止监听和模型任务。登录失效、程序不存在、无效结果、协议错误或超时会进入错误状态，等待用户处理并重新开始。单次协议请求超时为 30 秒，模型回合超时为 5 分钟。

当前没有自动登录、外部令牌注入、自动充值或额度重置流程。

## 版本验证范围

开发阶段曾使用 `codex-cli 0.163.0-alpha.10.2` 验证本机登录、额度读取，以及固定示例的三方案真实返回。该记录是一次历史验证，不保证其他账号、模型或客户端版本直接兼容。

升级 Codex 后，建议先运行连接检查，再用独立测试目录进行一次真实分析。
