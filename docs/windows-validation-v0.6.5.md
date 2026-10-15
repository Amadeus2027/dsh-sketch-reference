# v0.6.5 Windows alpha.2 验收

日期：2026-10-15（Asia/Shanghai）。本次是 Windows PC 上实际安装的 DSH Web 与 Edge 回归，不是桌面 GUI 安装包验收，也不复用历史模型回答冒充新实验。

## 基线与包身份

- 上游 main：`bbedb5c539124de1fd89db7f42fba25f1dcd937d`；tree：`2dc147332557a00a37ad9faa83cb1d0c31fb97b8`。
- 本地源码快照 tree 与上游一致。本机 Git fetch 的 TLS 传输失败后，使用固定 commit 的源码归档导入并核对 tree；本地快照 commit 与上游 commit 身份不同。
- DSH Web CLI：`0.2.1-alpha.2`；Node `24.14.1`；pnpm `11.25.0`；Microsoft Edge `155.0.4283.45`；Playwright `1.58.2`。Excalidraw `0.18.1`、React `18.3.1` 未升级。
- 包：`dsh-sketch-reference-0.6.5.tgz`，15,996,458 bytes。
- SHA256：`3ef6434a75e68caae5771fd007fdb08dbb071a49e4e836080b0eaa5146f8b469`。这是本机实际验收包，不套用云端包的哈希。

## 环境与方法

使用三个独立、无凭据的测试 Web profile：功能回归、旧数据升级、裸官方安装/移除。没有修改日常会话数据。测试夹具单独加载，未写入正式插件安装包。

功能回归在真实 DSH 原生 Agent/tool 循环、附件服务、存储与 Excalidraw 中执行；LLM 响应为明确标识的固定输入。真实 DeepSeek 请求数为 **0**，不将这种验证称为模型理解质量测试。裸官方安装验证没有模型夹具或插件测试覆盖层。

以下命令均在专用测试环境设置 `DSH_SMOKE_URL` 和 Edge 的 `CHROMIUM_PATH` 后执行；认证 URL、会话文件和原始日志只留本机，不公开。

## 本次实际通过的浏览器回归

- `node tests/browser-native.mjs`：原生线条/箭头手绘及严格保存；快速关闭前保存；恢复存储被禁用时服务器保存；原生 Composer DOM/文字保留；主题实时同步不改 revision、不重载 iframe；会话切换和关闭重开。
- `node tests/browser-comment-polish.mjs`：1280×720、1920×1080；紧凑标题/画板详情、各数字标记、翻页、菜单、卡片键盘、状态生命周期；追问/纠正/修改起草均保留已有文字和 PNG，不自动发送。UI 操作不保存草图、不导出 PNG、不调用模型；关闭后 SSE 客户端为 0。
- `node tests/browser-smoke.mjs`：中文图形与文字、保存恢复、解码后的 PNG、可编辑草稿导出、原生附件及去重；匿名请求拒绝、无 CDN 请求。
- `node tests/browser-visual.mjs`：当前版本 PNG、选区 PNG、缓存与丢失响应重试；画板关闭后的原生图片工具消息；缺失/过期参考拒绝和会话隔离。
- `node tests/browser-edits.mjs`：真实原生提议工具，预览/确认前不改图；形状、中文文字、箭头创建和移动/缩放/删除；一次原生撤销恢复；过期提议拒绝、忽略、丢失确认响应后幂等重试、修改前备份和会话隔离。
- `node tests/browser-agent.mjs`：原生聊天/工具循环、锚定/全局/重叠批注、旧分析批次独立；读操作乱序、丢失 ACK、手动 SSE 恢复；模型失败/取消、关闭读取及事件资源释放。
- `node tests/browser-focus.mjs`：原生框选、显式重点、不改正式场景；局部工具读取、关板继续、过期拒绝、跨会话隔离与清除重点。
- `node tests/browser-dsh-compatibility.mjs`，`directory`：调用 alpha.2 原生 `working_directory`，有效执行目录改变后，草图 owner、iframe 和数据保持；后续保存正常，旧 revision 的 CAS 写入被拒绝。

## 旧数据升级与官方生命周期

同一个专用 profile，先在 **alpha.1＋0.6.3** 执行 compatibility `seed`，保存草图、两类批注、解决状态、待预览提议、有效 PNG、65% 缩放/平移与未发送文字。退出旧宿主，经官方管理器安装同一验收 tgz，再用 **alpha.2＋0.6.5** 重启，执行 `verify`。

升级后服务器返回的完整记录逐项深比较一致；owner/revision、批注状态、提议和 PNG 不变；浏览器视口/草稿恢复。实时主题切换、关闭画板后的结构及缓存图片读取通过。测试数据由夹具生成，不声称覆盖全部私人历史或所有升级组合；浏览器存储状态由测试正常保存/恢复，未伪造替代草图。

裸官方 Web profile 执行 `dsh plugin --profile web add <tgz>` 成功，无版本豁免。`tests/browser-installation.mjs` 检查：原生入口恰好一个，编辑器打开/关闭，静态资源 200。退出宿主，执行官方 `remove dsh-sketch-reference` 并重启：原生输入框存在，插件入口消失、编辑器资源 404。不是热卸载验证。整个过程未发送模型消息。

## 性能与资源记录

`node tests/browser-performance.mjs`，250 个确定性矩形，1600×1000。以下为本次单轮测量，不宣称相对旧版提高百分比：

- 首次打开：315.1 ms；五次重开：126.4–187.3 ms。
- 保存 HTTP 请求两次：33.0 / 40.6 ms；不包含自动保存的 debounce 等待。
- 50 帧平移：0 次保存、0 次本地备份；50 帧修改同一元素：1 次保存，最终位置持久化正确。
- 三次同版 PNG 请求：61.9 / 46.2 / 29.9 ms，总栅格化次数 **1**。
- 两段操作未记录到 Long Task。页面堆从打开前约 52.2 MB 到五次重开后约 96.8 MB；未强制 GC，也未做长时堆快照，不能据此判断无泄漏或认定泄漏。
- 未覆盖本轮 1950 元素或数小时压力；不将早期版本的测量算成本轮结果。

## 发现的问题与最小修改

本轮没有复现需要修改产品运行源码的 alpha.2 缺陷。没有为版本制造功能或放宽数据校验。

1. `tests/browser-native.mjs` 画完线条后可能读到上次保存的状态文字，立即查询服务器会早于本轮自动保存。改为轮询服务器已保存的真实线条/箭头，不缩减原断言或绕过保存。
2. 新增 `tests/browser-installation.mjs`，覆盖无测试 overlay 的官方安装及移除重启。首次脚本因原生中文欢迎/API Key 引导尚未完成而被遮罩拦截；修正中英文按钮和异步引导等待后通过，未修改宿主或产品引导。
3. 本机夹具原先位于插件源码 package 下，被 alpha.2 Loader 视为同一客户端包的多重来源。独立夹具 package 后通过；这是测试设施归属问题，不是正式包重复注册，不修改插件 Header 架构。

## 自动化检查与来源

2026-10-13，同一运行源码在本机通过 `pnpm run typecheck`、`pnpm test`（21 文件/193 项）、`pnpm run bundle`、`pnpm pack`。构建首次受系统 TEMP 文件删除权限阻断，切换项目专用临时目录后成功。此后没有生产源码、依赖、包版本或打包规则变化，因此本轮不重复四项完整构建，将它们明确列为复用结果。

本轮修改的两个浏览器脚本通过 `node --check` 并在上述安装宿主中实际执行。既有测试未删除或跳过。上游固定 main 的 [GitHub Actions #38267192996](https://github.com/Amadeus2027/dsh-sketch-reference/actions/runs/38267192996) 为 success。未安装或运行 CodeRabbit。

公开补充记录只包含脱敏汇总，不公开认证 URL、密钥、私人会话及完整本机日志。发行包运行代码保持已验收身份；测试与文档维护通过独立 PR 交付。

## 发布判断与边界

本次覆盖中没有未解决的 P0 或阻断 alpha.2 核心流程的问题，建议发布同一 **0.6.5** 验收包。固定 Web 宿主原生工具卡片保留，不修改消息语义。

真实模型理解、MALFORMED_RESPONSE 根因、真实网络 429/长时超时、本轮数学/网页/PPT 质量、桌面 GUI、PTC/其他预设、全部插件组合与长期内存行为均未新增验收。图片附件历史没有插件自动清理；同步连接中断可用「同步批注」或重开恢复；撤销历史不承诺跨刷新保留。
