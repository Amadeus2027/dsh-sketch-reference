# v0.5.0：DeepSeek 主导研发记录

真实 DeepSeek 主导研究与建议，Codex 独占正式源码修改；两轮修复复审与独立工程验证均保留证据。

## A. 环境与权限

### 固定基线与真实目录

- 正式开发仓库：`C:\Users\Lenovo\Desktop\dsh_sketch-reference`，实际路径已通过文件系统与 Git 验证。
- 研发分支：`codex/v0.5.0-agent-led-review`。
- main 基线：`7737cfe2b239bf01b025ca08db2d9762bdac577f`（合并 v0.4.1 PR #12）。
- 独立审查根目录：`C:\Users\Lenovo\Desktop\dsh-sketch-review`。
- 固定源码快照：`snapshot-7737cfe2b239`。由上述 commit 的 `git archive` 生成，443 个原始跟踪文件逐一校验；不链接正式开发目录。
- 审查进程内使用 `R:\snapshot-7737cfe2b239`。`R:` 是上述独立审查根目录的 `subst` 别名，避免 Windows 原生路径解析访问未授权的个人目录父级。
- 只读公开运行时：`isolated-runtime`；独立可写测试状态：`isolated-state`。没有复制原有私人会话或附件。
- DSH：`0.2.1-alpha.1`；Excalidraw：`0.18.1`；初始插件：`0.4.1`；两轮复审插件：`0.5.0`。没有升级固定依赖。
- 原生模型选择器显示 `DeepSeek-V41-Flash / High`；真实会话记录 provider 为 `deepseek-official`、model 为 `deepseek-flash`。这些是当前宿主报告的标识，不推测未公开的后端版本。
- 独立 DSH 地址：`http://127.0.0.1:57320/`；profile：`sketch-agent-review`。原本 `57317` 的用户实例未被替换。

### 系统级隔离

没有仅依赖 Prompt 或 DSH 的「仅可查看」开关。固定宿主的 Windows `WRITE_RESTRICTED` 沙箱主要约束写入，不能独自满足本任务的读取隐私边界，因此整个独立 DSH 运行于非管理员 Windows AppContainer。

AppContainer 名称：`DSH.SketchReview.v050`。包 SID：

```
S-1-15-2-3422304158-1920592222-2490476507-214614345-1390949282-1523579003-577970688
```

NTFS 仅向此 SID 授予源码及公开运行时读取/执行权限；测试状态目录授予修改权限并设置 Low integrity。正式仓库和无关用户目录没有授予该包访问权限。启动前执行负向探针，结果不符合预期则拒绝启动；实际运行进程的 `TokenIsAppContainer` 已核实为 true。

| 实际探针 | 结果 |
|---|---|
| 读取固定源码 | 成功 |
| 创建、改写、删除、重命名源码 canary | 全部 `EPERM` |
| 写入正式仓库测试路径 | `EPERM` |
| 读取无关目录的无敏感 canary | `EPERM` |
| 写入独立测试状态 | 成功 |
| 真正启动的 Node 子进程写入正式仓库 | `EPERM` |
| 隔离子进程运行 `icacls.exe` 尝试把源码 canary 改为可写 | 退出码 5；后续写入仍 `EPERM` |

探针使用无敏感 canary，没有以读取实际私人文件或密钥作为测试手段。它们验证了当前进程及继承子进程的实际边界，不能解释为对 Windows 内核漏洞的全面安全认证。

证据：[权限探针](agent-led-v0.5.0/permission-probes.json)、[实际进程令牌](agent-led-v0.5.0/process-token.json)、[ACL 绕过探针](agent-led-v0.5.0/acl-escape-result.json)、[快照来源](agent-led-v0.5.0/snapshot-provenance.json)。

### 网络与凭据边界

AppContainer 无本机回环豁免，不能直接访问原来的 DSH 服务。浏览器通过仅绑定 `127.0.0.1` 的本地网关与 AppContainer 命名管道通信；宿主自身的浏览器认证仍保留。没有关闭证书校验或增设管理员回环豁免。

官方模型请求经专用管道交给隔离外的可信网关，真实密钥只在网关中使用，目的地限制为 `https://api.deepseek.com/anthropic/`。隔离 profile 中仅有非秘密占位值，启动环境清除真实凭据；网关不提供 shell 或任意本地文件读取接口。没有使用 mock，也没有硬编码模型回答。

**测量限制：** 当前隔离传输缓冲整个模型响应后再交给 DSH，所以 UI 的 tok/s 不代表原生流式速度。记录的是实际 HTTP 耗时、状态、字节数和宿主保存的模型 usage；不能据此宣称生产插件延迟改善或 Token 节省。

### 技术资料与环境限制

快照包含全部 `src/`、`tests/`、`docs/`、包和锁文件、构建配置，以及固定版本 DSH 的公开 npm 实现 JS、类型声明和随包文档、Excalidraw 0.18.1 API 声明。`references/versions.json` 记录来源；`references/source-index.txt` 列出真实源码路径。

未发布的宿主原始 TypeScript 与未随包发布的测试没有获得，不能称为已经核查。在线 Excalidraw 文档可能更新，应以固定包声明校对 API。

Windows AppContainer 中捕获式子进程 stdio 存在兼容问题：原生 shell 和依赖 ripgrep 的 glob/grep 暂不可用。没有在隔离外静默代执行这些命令；明确返回失败。原生 `read` 可读取完整源码，已补充索引并告知 DeepSeek；它实际自主读取了大量源码与宿主声明。需要搜索或实验可由 Codex 提供可追溯结果。这是研究设施限制，不是插件缺陷。

### 修复快照与再次验证

| 用途 | 固定 commit / Workspace | 原始跟踪文件 |
|---|---|---|
| v0.4.1 自主研究 | 7737cfe2b239bf01b025ca08db2d9762bdac577f / snapshot-7737cfe2b239 | 443 |
| 第一轮修复后复审 | e2d386400841588f9eb0b4496530ab3a8925c6b9 / snapshot-e2d386400841 | 458 |
| 第二轮最终复审 | 3539f3fc670c1fb1b4e8a16d4044e8f4607c3db8 / snapshot-3539f3fc670c | 458 |

每轮从 commit 独立归档，未让 DeepSeek 读取变化中的正式仓库。最终 458 个原始文件逐一 SHA256 复核未变；另加入的 references/deepseek-round1-original.md 单独记录来源及哈希，不冒充 Git 原始文件。公开宿主参考沿用基线固定 npm 资料。

最终运行进程的 AppContainer 令牌、读写探针及继承子进程再次验证成功。安装后的 lib/index.js 与本次通过构建的 bundle 哈希一致，版本为 0.5.0。[最终权限](agent-led-v0.5.0/final-review/permission-probes.json)、[进程令牌](agent-led-v0.5.0/final-review/process-token.json)、[源码及安装来源](agent-led-v0.5.0/final-review/snapshot-provenance.json)。第一轮旧 tgz 路径被后续打包复用，旧包哈希未可靠保留，已撤回该导出值；不伪称历史二进制完全可重建。首轮导出脚本另曾复制基线的 token-verification 文件，已移除这个重复记录，不将基线 PID 冒充首轮新令牌验证。最终令牌直接核查当前进程。正式代码在 3539f3f 后保持不变，后续提交仅整理交付记录。

本机准备脚本保存在正式仓库忽略目录 `test-results/v050/`，包括 `prepare-review.ps1`、`AppContainer.cs`、`prepare-runtime.mjs`、`review-bootstrap.mjs`、`review-gateway.mjs` 和权限探针。`start-review.ps1` 是基线启动脚本；最终快照使用 `start-review-implementation.ps1`，复用现有运行时及 profile 可使用 `restart-ab.ps1`（不带参数会恢复启用插件）。均通过 PowerShell 7 调用，先确认没有进行中的模型轮次。不要对固定快照覆盖执行归档脚本。

官方参考：[AppContainer 实现](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)、[命名对象共享](https://learn.microsoft.com/en-us/windows/apps/develop/communication/sharing-named-objects)、[DSH](https://github.com/deepseek-ai/deepseek-harness)、[Excalidraw API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api)。

## B. DeepSeek 原始审查与真实体验

2026-10-10 13:11（Asia/Shanghai），Codex 在真实 DSH 原生 Composer 中发送维护者指定的[完整初始任务](agent-led-v0.5.0/initial-task.txt)。主会话 session-afa4ba0f-29b0-403c-bda8-dde504e693d2。DeepSeek 自行选择模块并创建四个原生研究子会话，实际阅读插件源码、测试及固定宿主资料；这些不是 Codex 创建的替身 Agent。

以下原文均直接从本次专用会话日志的 text block 导出，不是 Codex 改写。长源码工具返回仅保留明确标注的摘录、调用参数及原文 SHA256；插件工具结果和错误完整保存。导出省略 reasoning、系统提示、签名、密钥、图片 Base64 和无关私人会话。

| 阶段 | 原始反馈与 Codex 原始提问 | 真实工具事件 | 宿主报告用量 |
|---|---|---|---|
| 初始自主研究，含四个 DeepSeek 原生子会话 | [原文](agent-led-v0.5.0/deepseek-original-feedback.md) | [事件](agent-led-v0.5.0/tool-events.jsonl) | [usage](agent-led-v0.5.0/session-metrics.json) |
| 第一轮修复后复审，session-cafd9cd0-1aa1-46dc-bdeb-5483789f9b56 | [原文](agent-led-v0.5.0/review/deepseek-original-feedback.md) | [事件](agent-led-v0.5.0/review/tool-events.jsonl) | [usage](agent-led-v0.5.0/review/session-metrics.json) |
| 第二轮最终复审及交互回归，session-81de30b0-e09f-4773-b976-6d93d007e7d8 | [原文](agent-led-v0.5.0/final-review/deepseek-original-feedback.md) | [事件](agent-led-v0.5.0/final-review/tool-events.jsonl) | [usage](agent-led-v0.5.0/final-review/session-metrics.json) |

### 实际使用与动作归属

DeepSeek 自主要求一张包含绑定、锁定、成组和自由笔迹的板。Codex 经 Excalidraw 原生剪贴板粘贴 9 元素订单流程测试素材，填写用途并通过原生菜单准备图片；素材不是伪造的 AI 结果。最初尝试 Delete 未成功产生墓碑，后续没有把它算作删除验收。

DeepSeek 真实调用结构摘要/详情、缓存 PNG、批注及修改提议。初始 4 条批注触发原始 Zod too_big，改为 3 条成功（2 条有效锚点、1 条全局）。它自主提议移动自由笔迹，回读确认图形仍未变化，未应用。初始研究还真实发生一次 MALFORMED_RESPONSE（工具输入不是有效 JSON），最小重试成功；原因未查明。

第一轮修复后，它再次自主读取结构和一次缓存 PNG，保存 3 条锚定批注，提出新增“输入”“结果”两段文字的提议；51 个 ID 探测得到可恢复中文参数错误。Codex 按它的实验要求在测试会话完成预览→明确确认→一次 Excalidraw 原生撤销，记录实际 revision、活跃元素和缓存图片。DeepSeek 回读核对撤销后的结果，并区分了自己看到的最终状态与 Codex 提供的中间态证据。

Codex 再把左上矩形设为唯一重点。DeepSeek 显式请求 scope:all，实际仍只读到 focus 的一个矩形，但自主发现 sceneTotalElements:9 和 annotations.count:3/items:[] 透露范围外计数。这是最终计数修复的直接实机依据。该矩形即使关联箭头在重点外，仍正确返回 bound / allowedOperations:[]，没有因裁剪场景误放行编辑。

第二轮最终复审，它按需阅读修复文件和测试，通过根级/嵌套多余字段、错误类型、51 IDs、缺 revision 的真实负向调用确认入口契约；scope:all 仍返回 focus，场景计数为 1，批注 count/items/scope 一致。它没有为覆盖率重复读 PNG，也没有擅自改图；仅按 Codex 交互回归要求给重点元素留一条批注。

该批注含两项模型自身错误（把独立文字说成可缩放、把旧用途细节当成当前用途）。Codex 指出错误；一次追问再次遇到 MALFORMED_RESPONSE，最小恢复后 DeepSeek 正确解析短引用并承认文字只能 move/delete。随后通过卡片“纠正”发起真实对话，它用 sketch_annotate 替换批次，保留原锚点，明确“订单输入”只是本次用户说明而非图上已存在文字。旧引用失效后，它得到 COMMENT_UNAVAILABLE 并拒绝按标题猜目标；重新点击新卡片生成新引用。原始错误和更正都保留，不以最后一条回答掩盖前述失败。

## C. Codex 工程实施与验证

### 建议处理表

表中简引是定位原文的索引，不替代原始记录。Codex 没有把自己的结论写成 DeepSeek 原话。

| DeepSeek 意见 / 优先级 | 实际证据与工程判断 | 收益与风险 | v0.5.0 处理 |
|---|---|---|---|
| “声明的 JSON Schema 比 Zod 实际强制的松” / P1 | 真实 4 条批注失败；固定宿主不支持 maxItems/maximum/format 等关键字，不能直接照搬标准 Schema | 提高调用可靠性；必须与固定宿主子集兼容 | 在描述公开数量/Unicode/UUID/组合约束，用 oneOf 表达精确操作形状，继续保留 Zod 强验证 |
| “四个工具没有声明输出 schema” / P1 | 核查宿主：native 模型并不接收 output schema；它用于 runtime/PTC，不能宣称改善普通模型提示 | 稳定 SDK 契约；宽松扩展字段保留兼容 | 定义稳定必需字段；模型可见结果键放在工具描述；启动期检查子集 |
| editRestriction:none 不代表所有操作可用 / P1 | 自由笔迹不能 resize，原有返回未逐项表达；独立文字也仅 move/delete | 减少试错；不能变成放宽权限 | allowedOperations 与准入复用同一 helper，读取无副作用 |
| 参数错误需要可恢复指引 / P1 | too_big 原始错误冗长；真实 51 IDs 与多余字段复测 | 清楚说明如何重试；不可回显恶意值、吞域错误 | 专门包装参数 ZodError；入口先验相同 raw schema；CAS/取消/域错误原样保留 |
| “声明根闭合、defineTool 执行根仍开放” / P1 | 首轮复审检查 defineTool 闭包；独立单测验证 service 未被调用 | 避免契约双源 | 执行前 validateJsonSchemaValue 检查同一 parameters；第二轮真实非法调用证明生效 |
| 手写 output schema 要启动期断言 / P1 | 首轮复审指出绕过 defineTool 自动检查的可能 | 尽早暴露不支持关键字 | assertSupportedJsonSchema(parameters/output.schema)，159 测试覆盖 |
| focus 外计数不应泄露 / P0 | 真实返回 sceneTotalElements:9，重点只有1；批注总数3而items空 | 加强边界；历史字段语义需文档说明 | sceneTotalElements 统计 scoped 活跃元素；annotations.count 统计可见未忽略项，新增 scope；第二轮实机确认 |
| presentResult 可简化原生工具卡片 / P2 | 固定 Web 使用独立 keyed toolview，不直接消费该回调；双方实机/源码确认 | 潜在视觉收益，但当前没有 | 保留小型纯投影及兼容回调；明确未产生 Web 视觉收益，不增建渲染体系，不隐藏原生卡片 |
| “withComments 非法 id” / 早期猜测 | 生成值为合法36字符UUID；实际 CommentRepository.update 测试成功 | 错改会影响旧批次 | 与 DeepSeek 讨论后撤回；新增真实旧批次更新回归，未改存储 |
| 全局工具可见/串行、原生审批替换 / P2 | 研究子会话能看到工具不等于性能退化；原生审批声明不等于完整可替代已测确认链 | 潜在简化；会话/并发/CAS风险大 | 与 DeepSeek 讨论后暂缓，不进行无收益重构 |
| focus 过期无全图 PNG / 早期猜测 | 自动回退会突破用户边界 | 可改善提示，但不能扩范围 | 保留拒绝与用户重新选区路径；没有按早期意见回退全图 |
| 附件删除/跨表事务缺口 | 固定宿主公开 API 缺失，DeepSeek 后续自行更正归因 | 不应重写宿主 | 记录宿主限制，不当作插件新增修复 |
| 标记“有批注但被focus过滤” / P2 | 第二轮提出可读性建议；暴露“过滤掉了内容”也需考虑边界 | 当前scope足以表达所见范围 | 暂不新增范围外存在性字段，记录后续设计方向 |

### 实际修改范围

- src/host/tools.ts：工具描述、精确操作 oneOf、兼容的结果投影注册。
- src/host/tool-feedback.ts：固定宿主支持的参数/输出契约、启动断言、入口校验、可恢复错误及纯投影。
- src/core/edits.ts：复用准入规则生成能力列表；不改几何实现。
- src/host/agent.ts：返回能力列表、scope 内计数与批注；OUTPUT_LIMIT 指引不再要求 Agent 自行改用户文字。
- tests/tool-contract.test.ts、tests/agent.test.ts、tests/comments.test.ts：契约、闭合入口、错误恢复、不回显输入、能力一致性、重点计数和旧批次更新。
- package.json / README.md / docs：0.5.0 版本与真实证据，无依赖升级。

复用现有 DSH defineTool、raw schema 校验和 Composer 桥，插件批注/修改仓库及 Excalidraw 原生导入、预览、场景更新、保存和撤销。本轮未修改客户端布局、附件存储、几何引擎、审批链或视觉导出调度。无新增 Agent 工具、模型服务或后台模型请求。

### 独立检查

在最终生产代码 3539f3f 上执行：typecheck 通过；pnpm test **18 个文件 / 159 项全部通过**（基线148项全部保留）；bundle 通过；pack 通过。此前 Windows TEMP 清理 AccessDenied 通过本任务独立 TEMP/TMP 解决，未改变依赖。构建生成的第三方声明排序/换行差异已恢复，避免混入发布。

CodeRabbit CLI 在本机不可用，没有伪称已取得其审查结果。Codex 进行了代码差异审阅、针对性测试和真实浏览器验证。完整命令、布局/缓存/确认撤销证据见 [Windows 验证](windows-validation-v0.5.0-20261010.md)。

### 用量与测量边界

官方 HTTP 记录是专用研究网关的累计真实请求：199次、均HTTP200，包括 DeepSeek 原生子会话、错误尝试和复审；不同阶段导出是累计快照，**不能把三个文件相加**。持久化模型步骤194（初始137、首轮17、最终40），源码读取分别210/31/22。每个会话的 modelSteps/read/usage 单独列于上述 JSON。usage 只含已持久化 assistant/message，失败 attempt 可能缺失，不是计费总数；HTTP200不保证工具输入JSON有效。工具步骤也不等同于界面发起的完整用户对话。

原生工具声明 UTF-8 JSON 共 **8503→11384 字节（+2881，约33.9%）**，测的是固定工具契约而非 tokenizer token。更精确契约确实有静态提示成本，不能称为 Token 节省。没有新增强制模型调用；错误调用减少是否能抵消成本尚无对照用量实测。隔离网关缓冲响应，UI tok/s 不可作为生产流式性能基准。[测量原始值](agent-led-v0.5.0/tool-schema-measurements.json)。

## D. DeepSeek 最终复审与交付边界

完成两轮主要“审查→修复→复审”，不继续无限迭代。第二轮真实原话为“**可以交付。四条改动都准确回应了我的意见**”；它确认入口和启动断言关闭了双真相源，focus 下显式 all 请求仍只返回重点，计数不泄露全图规模。它明确没有在只读研究设施中执行本地测试/构建，不能把其主观认可当成独立自动验收。

DeepSeek 保留的局限：固定 Web 未消费 presentResult；被过滤批注的存在性不另披露；reason 的120字符摘要仍需按需精确读取；MALFORMED_RESPONSE 未归因；本轮未实机覆盖 arrow create 的预览/应用。Codex 保留这些结论，同时记录 DeepSeek 自己的批注错误及真实纠正，未将 Agent 当作不会出错的权威。

从批注进入聊天已实际完成追问、纠正、新引用及修改提议路径；修改确认/撤销由 Codex 在隔离测试会话代用户操作并单独记录，不伪称 DeepSeek 自己应用了图形。最终回归范围和未覆盖项以 [Windows 验证](windows-validation-v0.5.0-20261010.md) 为准。

本次提交只提供可审查版本和 PR，合并由维护者执行。不自动发布 Release、提交比赛作品或公开其他私人会话。
