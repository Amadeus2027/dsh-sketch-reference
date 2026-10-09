# v0.3.0 原生 Agent 读取与批注

本次增量基于 main 的 `a8945ba` / 0.2.1，包版本为 `0.3.0`。范围是已经确认的 P0：原生聊天读取草图、可选通用批注和基础工作流回归。修改提议与选区协作仍属于后续阶段。真实 DeepSeek 效果单独待验收。

本页记录初次 P0 交付。后续 Windows 真实模型小样例及 PR #6 修复见 [累计审查](review-v0.3.0-cumulative.md)，2026-10-09 云端批注失败恢复修订见 [稳定性补齐](stability-v0.3.0.md)。保留历史证据，不将初版模拟结果改称真实模型结果。

## 当前实现

- `sketch_read` 通过固定版 DSH 官方 `defineTool()` / `ctx.tools.register()` 接入。会话身份取自 `exec.agent.session.header`，请求不接受模型传入的 sessionId。默认读取宿主已保存快照的紧凑摘要；支持 revision 校验、按真实元素 ID 获取细节和分页。关闭画板不影响结构读取，未保存编辑不属于读取结果。
- 摘要最多 8KiB，细节最多 16KiB，每页最多 50 个元素；只提供 ID、类型、必要坐标/尺寸、有限文字、容器/箭头关系。不会包含整个场景、样式、内部元数据、PNG 或其他会话信息。数量和文字截断显式标识。
- `sketch_annotate` 接收当前 revision、expectedBatchId、summary 和 1–3 条 title/reason/可选元素锚点。非现存或已删除 ID 退化为全局说明；错误结构、过期 revision、并发替换和不同内容的重复调用被拒绝。相同工具调用重试保留批注解决状态。
- Agent 批注单独存入 `sketch_agent` 域，与原有 `sketch_reference` 草稿、AI 建议存储格式隔离。复用通用化的现有批注 CAS/幂等状态仓库，每会话保存最近一个 Agent 批次，最多 500 个会话记录。旧草稿无需迁移；降级回 0.2.1 不读取新域。
- 编辑器接入既有批注列表和 Excalidraw 覆盖层；两种来源可切换，Agent 批注不伪造模型路由或 actionPrompt。保留解决/重开/忽略、元素定位和旧建议指令工作流。
- 已打开画板使用同源、受 DSH Connection 认证保护的 SSE 失效通知，再读取当前批注。仅推送更新通知，不推送会话文本；不增加定时轮询或心跳。最多 32 个连接，慢连接关闭，断开后手动刷新；画板关闭、工具服务停用和插件卸载释放连接。
- 工具初始化失败时回收部分注册和新存储域，基础画板继续运行；工具取消信号和插件生命周期合并。不存在画板修改工具，也没有新增模型服务、密钥或模型调用。

## 数据结构与变更文件

工具输入示例（revision、batchId 和元素 ID 来自 sketch_read；首次没有批次时 expectedBatchId 为 null）：

```json
{
  "revision": "<当前草图 UUID>",
  "expectedBatchId": null,
  "summary": "图中展示了三角形的几何关系",
  "comments": [{
    "title": "内角关系",
    "reason": "欧氏平面三角形内角和为 180°。",
    "anchor": {"type": "element", "elementId": "<真实元素 ID>"}
  }]
}
```

持久化批次包含 id、source=agent、owner、analysisRevision、contentDigest、goal、advice、createdAt、commentRevision、comments，以及工具重试用 toolCallKey/toolInputDigest。comments 以 id/suggestionIndex/status/createdAt 对应建议，status 为 open/resolved/ignored。commentMutation 复用原状态 CAS 协议。Agent 建议只有 title/reason/可选 anchor；不制造 actionPrompt、kind 或模型路线。用途校验直接复用原草稿 schema，保持 Unicode 码点限制兼容。

| 文件 | 作用 |
| --- | --- |
| src/core/agent.ts、comments.ts | 受限工具/存储契约、共享批注视图 |
| src/host/agent.ts、tools.ts | 已保存快照读取、官方工具注册、合法锚点降级与测量 |
| src/host/agent-events.ts、service.ts | 同源认证通知、可选工具服务、独立存储域和资源释放 |
| src/host/comment-repository.ts | 原仓库泛型化，复用状态 CAS/幂等与批次替换比较 |
| src/editor/agent-comments.ts、App.tsx、comments.tsx | 单连接同步、旧建议共存、共享列表/覆盖层、同锚点编号错开 |
| tests/agent*.test.ts、browser-agent.mjs、browser-persistence.mjs | 协议、资源、原生 Agent 循环、重启和升级回归 |
| tests/fixtures、browser-comments.mjs、browser-performance.mjs、summarize-performance.mjs | 隔离模型适配器、React 测试检查修正、性能采样与统计 |
| package.json、pnpm-lock.yaml、README.md、REUSE.md、docs | 0.3.0 元数据、同版本官方工具包、来源与交付证据 |

## 视觉输入和权限边界

普通问答继续使用 DSH 原生聊天。用户绘图、等待保存后，通过原有「作为参考发送」加入 PNG，再自行发送问题；不需要先调用「AI 分析草图」。工具读取结构摘要仅为辅助，自由手绘识别需要原生聊天中的图像。当前工具不提供关闭画板后的 PNG，也无法自动证明已有聊天附件对应最新 revision；不确定时请求用户更新参考图。

读取为只读能力，批注只能写插件批注数据；语义说明不能直接成为系统规则或可执行代码。工具描述限定用户请求解释/标注时使用，不替代宿主自身的 Agent 工具策略。绘图修改必须在后续版本加入受限提议、预览、用户确认、CAS 和撤销验收后开放。

## 测试与效果边界

单元测试覆盖紧凑读取与缓存、元素细节/关系、UTF-8 字节上限与分页、合法/删除锚点与全局降级、幂等状态保留、并发替换、旧 revision、生命身份与工作区隔离、记录重建、取消、无草稿、恶意额外字段、固定版工具 DSL，以及事件连接隔离/容量/释放/背压。

安装产物浏览器验证使用真实 DSH、Excalidraw 和原生 Agent 循环，只有模型响应为脚本模拟。工具实际被原生 Agent 发现和执行，参考 PNG 进入模型请求，批注实时进入画板，解决状态关闭重开后恢复，关闭画板仍可读取结构。模型失败/原生取消保留草图、已有批注、PNG 导出和原生参考附件。原有原生交互与批注浏览器回归验证主题、分栏、原生输入保留、移动/缩放/删除/撤销、错误 JSON/取消/超时等；具体最终包结果见 validation.md。

当前环境没有配置真实 DeepSeek 凭据；没有真实模型请求、识别效果证据或实际输入 Token 统计。工具最多保留 100 条内存测量，包含执行耗时、返回 JSON 字节数、成功状态、缓存命中；inputTokens 明确为 null。`agent/metrics` 是受认证的插件诊断 RPC，统计插件工具而非完整 Agent 或模型推理耗时。不据此声称节省比例。

### 性能基线与限制

[六份原始 JSON 和统计表](benchmarks/agent-summary.md) 对照实际安装的 0.2.1 与最终 0.3.0 代码，各三轮。Linux、Node 24.19、pnpm 11.19、Chromium 151、1600×1000、同样 250 个矩形、每种手势 50 帧，零模型请求；独立宿主数据目录。打开前核对浏览器插件客户端原文，安装后逐字节核对 lib/许可证。首次打开是点击到编辑器公开 API 就绪并完成两次 RAF 的时间；重开为一次 RAF。不是冷宿主启动时间，也不是用户鼠标绘制 FPS。

首开中位数 435.7 → 452.3ms，重开 259.2 → 276.0ms，保存 HTTP 往返 29.2 → 34.4ms；耗时略增，范围重叠，不能声称性能提升或统计显著性。编辑帧间隔 P95 中位数 22.9 → 23.1ms；平移两版均零恢复写入/保存请求，50 帧编辑均 9 次本地恢复写入及 1 次保存，连续三次 PNG 均只光栅化一次。客户端 138,080B、打开前编辑器请求 0、绘图区 786×863px 保持。该场景没有批注批次，不代表复杂批注/高负载场景。

raw JSON 同时保存浏览器 renderer 的 JS heap：三轮打开前/五次重开后的值均为约 45–86MiB。Chromium 精确计量开关已开启，但未强制 GC，测量共享宿主与 iframe，不能据此分离插件内存、判断泄漏或宣称内存改善。没有实测冷启动、CPU 常驻 RSS、跨平台帧率、真实模型时延或 Token 节省。

[原生工具测量](benchmarks/agent-tools.json) 来自 2 元素（矩形/自由手绘）、脚本模型的一次标注、一轮只读问答、失败与取消场景：实际 2 次 sketch_read / 1 次 sketch_annotate，插件执行耗时分别约 4.24ms、4.37ms、5.64ms；返回 JSON 713B、1437B、192B。只读第二次命中缓存；均不是整轮 Agent 延迟。原生流共 7 次（含多步工具返回、失败和取消），独立 advice 调用只有用户额外点击的 1 次。样本很小，未测复杂工具吞吐；inputTokens=null，未填虚构 usage。

复现：为两个安装包分别启动隔离 profile（仅 browse-picker 与 mock-model 覆盖层），运行 `DSH_PERF_LABEL=agent-baseline-1 DSH_PERF_CLIENT=<已安装客户端文件> pnpm run test:performance`，同理 baseline-2/3 和 agent-final-1/2/3。然后运行 `DSH_PERF_BASELINE=agent-baseline DSH_PERF_OPTIMIZED=agent-final DSH_PERF_VERSIONS=0.2.1,0.3.0 DSH_PERF_SUMMARY=agent-summary.md node tests/summarize-performance.mjs`。带 token 的 DSH_SMOKE_URL 只通过环境传入，不提交。

阶段性暂停没有修改 P0 范围、丢弃代码或绕过验收。恢复后完成了安装包回归与最终检查；交付包的代码和版本元数据统一为 v0.3.0。后续 v0.3.1 修改提议、v0.3.2 选区协作继续按原阶段规划，不能把当前读取/批注能力描述成已经支持画板修改。

### 交付范围核对

| 已确认的 0.3.0 P0 目标 | 实现与验收边界 |
| --- | --- |
| 原生聊天问答、公开 sketch_read/sketch_annotate | 真实 DSH 原生 Agent 执行循环通过；模型为模拟 |
| 通用草图、按需/渐进/有限结构读取 | 无 UI 专用类型限制；摘要、元素细节、分页、字节限制、首分页缓存独立测试 |
| 自由手绘视觉输入 | 现有 PNG 原生附件进入真实 Agent 请求；真实物品识别待验收 |
| 合法元素批注、全局降级、跟随与状态恢复 | 共用成熟覆盖层，目标 ID 校验；未知 ID 不定位，同锚点编号可分别点击 |
| 会话与 revision 隔离、旧草稿和建议兼容 | CAS/生命身份测试，关闭重开、宿主重启、0.2.1 升级实测 |
| 失败不破坏基础工作流 | 原生取消/模拟模型失败，原有 JSON/超时/恢复存储故障回归 |
| 低侵入性、原生 UI、固定依赖、无新增 AI 服务 | 保留分栏和绘图组件，独立小型工具/事件模块；无自动模型请求 |
| 性能和实际用量证据 | 固定条件三轮对照、工具耗时与输出字节数；真实 Token 未获得，明确为 null |

P0 代码目标完整保留；P0 的真实模型效果验收仍需账号配置，不把暂停、模拟测试或代码完工作为真实效果通过的依据。P1/P2 仍未开放。

待实机验收：真实 DeepSeek 识别/定位/回答质量、其他日常插件组合、跨平台、Agent 服务热停用与插件热卸载。单元测试证明释放代码与错误隔离边界，宿主退出后的插件移除不能替代热卸载。

## 公开 API 与来源

锁定 DSH `0.2.1-alpha.1`、Excalidraw `0.18.1`，没有升级稳定依赖。增加同版本 DSH 官方工具包的 peer/dev 声明，宿主工具代码保持 external。

参考 [DSH 固定版 tools](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/core/tools) 和 [dsh-diagram v0.6.1 tools](https://github.com/hanzhangzzz/dsh-diagram/blob/v0.6.1/src/host/tools.ts) 的注册、执行上下文和会话隔离方式（均 MIT）。工具与事件连接代码为本项目增量实现；现有复用代码与版权声明保留。Excalidraw 坐标转换、边界计算、选区及滚动定位继续使用公开 API，没有增加绘图或几何引擎。

## 手动验收

1. 在专用 DSH Web profile 安装 tgz，配置原有 DeepSeek 账户或官方路线；不添加插件专用密钥。
2. 新建会话，绘制物品、几何或流程草图，填写用途，等待「已保存」。
3. 使用「作为参考发送」把 PNG 加入原生输入框，自行发送「解释这张草图」；普通回答不应强制生成批注。
4. 请求「读取当前草图并标注关键部分」，在原生工具记录核对 sketch_read 和 sketch_annotate。若无法确定位置，应看到全局说明。
5. 点击编号/列表查看说明和选中对应元素；解决、重新打开、忽略后关闭重开，核对状态。已有 AI 分析建议应能切换回来并使用原指令按钮。
6. 移动或删除图形，检查批注跟随/失去锚点；修改草图后检查过期标识。更新 PNG 后再问，检查附件与版本是否匹配。
7. 关闭画板，继续询问已保存的结构；需要自由手绘识别时在原生聊天提供有效参考图片。切换会话核对批注不会串入另一会话。
8. 取消模型请求或断开网络，核对手工绘图、保存、PNG/草稿导出仍可用。

## 复现自动浏览器验证

在所有 DSH_HOME/XDG 路径隔离的测试 profile 安装构建 tgz，将测试 overlays 和 fixtures 一起复制到该 profile 内。使用 browse-picker.overlay.yml、mock-model.overlay.yml、mock-native-agent.overlay.yml 启动。后者通过官方 LlmAdapter 注册模拟 provider，禁用真实 credential adapters，只用于测试，绝不能用于日常 profile。原生默认 native 工具模式已验证；PTC/both 暂未进行浏览器验收。

把专用登录地址放入 DSH_SMOKE_URL（不提交地址），执行 pnpm run test:browser:agent，以及现有 browser/native/comments 脚本。测试脚本通过安装包客户端原文比对避免源码与安装产物混版。模拟流不报告 usage，因此 Token 始终不是模拟数值。
