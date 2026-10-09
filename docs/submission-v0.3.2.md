# 0.3.2 作品范围与实现说明

2026-10-09，北京时间。基于已合并 #8 的 main `bdb5d5c`。0.3.2 是待 Windows/真实模型统一验收的作品候选；没有把包版本变更当成正式发布或比赛提交。

## 保留与收敛

核心链路是 DSH 原生聊天 ↔ 可编辑草图 ↔ 原生图片/结构读取 ↔ 可选批注 ↔ 用户确认的受限修改。Agent 通用问答无需先生成绘图建议，PNG 原生附件不依赖批注、提议或视觉缓存。模型不可用仍可绘图、保存、恢复和导出。

本轮补齐：主动准备全图/重点视觉参考、画板关闭后的原生图片工具、明确的重点/图片过期反馈、旧提议确认禁用、SSE 断开与迟到回调保护、固定导出缓存。没有自动每次绘图推理、每轮传图、轮询、外部模型 API、独立服务器或新依赖。

搁置：复杂绑定/分组编辑、任意方向或绑定箭头生成、缩放文字/自由手绘、跨刷新撤销历史、复杂编辑历史、多人实时协作、任意区域裁图/区域锚点、AI 自动改图/生成完整网页、动画。已有原生手工绘图能力保留，搁置项不包装成已完成。箭头仍限现有向右下创建；文字支持普通换行和空格，回车/制表符提议明确拒绝，避免复制 Excalidraw 私有文本规范化。

## 官方与社区复用审计

| 来源 | 固定版本/参考 | 使用与边界 |
| --- | --- | --- |
| Excalidraw | 0.18.1，官方 tag commit `a2ec2889babf7d2295469c6d90ebe77fae57df84`，MIT | 复用公开 exportToBlob、serializeAsJSON、convertToExcalidrawElements、newElementWith、restoreElements、updateScene、CaptureUpdateAction、原生选择/坐标转换。选区过滤后由原导出器处理边界、字体、图形绑定解析及光栅化；不写新的绘图/截图/缩放算法 |
| Excalidraw 官方 Collab | 同 tag 的 excalidraw-app/collab/Collab.tsx | 参考连接销毁/状态恢复、捕获历史与持久化边界；未复制 socket、多人同步或私有图形绑定实现 |
| DSH 官方 tool-fs/read-image | dsh-v0.2.1-alpha.1 / `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，MIT | 改编公开路线能力门禁与“JSON 说明 + 原生 image block”模式；复用 attachments.saveImage/readImage，不把 Base64 或私有文件路径放入模型文本 |
| dsh-diagram | v0.6.1 / `ea4279ef9a9b6a1751d1a06930ff4c140cd02f38`，MIT | 保留既有场景/构建/许可复用，参考会话限定工具、只存必要快照与手动可编辑性；不重写为其图表编译器 |
| tldraw | 文档参考 commit `035b741dc331bf76a4cb9af27c346be10bba2a88` 的 image-export.mdx | 仅参考选择形状→成熟编辑器导出→自包含图片的设计；其 SDK 为不同的许可证，不引入依赖、不复制实现，不宣称 MIT |

来源链接：[Excalidraw](https://github.com/excalidraw/excalidraw/tree/v0.18.1)、[DSH](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1)、[dsh-diagram](https://github.com/hanzhangzzz/dsh-diagram/tree/v0.6.1)、[tldraw 文档](https://github.com/tldraw/tldraw/blob/035b741dc331bf76a4cb9af27c346be10bba2a88/apps/docs/content/sdk-features/image-export.mdx)。第三方归属沿用 REUSE 和许可清单。新增插件逻辑仅承担版本、权限、受限协议与状态协调。

## 按需视觉参考

“更多 → 更新视觉参考”主动完成当前保存、导出 PNG，并通过 `visual/prepare` 绑定完整 owner/revision/sceneDigest。选区重点仍由原生选择获取，包含必要绑定文字；“更新重点视觉参考”只导出该集合，未自动追踪整个连接图。程序不把 PNG 像素当场景坐标。

新 `sketch_visual` version 0 域只存每 owner/scope 最新附件引用与版本、元素 ID、创建时间；全图/重点各一份，最多 1,000 条、2MiB 元数据。PNG 在 DSH 不可变、内容寻址附件库中；旧草稿/批注/提议域格式不变。更换引用不会删除可能被会话使用的附件，二进制历史对象的保留/回收由 DSH 管理，不宣称图片总库只占 2MiB。

同场景重复准备复用原导出和已校验附件，内存最多缓存该不可变快照的全图与一个选区 PNG。失败可重试；原生附件发送保持独立。宿主重新启动后全图仍可读取；重点身份本身是进程内状态，需重设并重新准备重点图。

`sketch_read` 返回紧凑 prepared/focusPrepared 标志，不附 PNG。需要视觉细节时，官方 `sketch_read_image({revision,scope:all|focus})` 校验真实 Agent 会话、精确模型 image 能力、保存版本及选区，再验证附件像素可读，返回原生 image block。旧图/无图明确拒绝，无图不会产生伪造观察。工具不调用 LLM、不依赖画板打开、不触发重新导出；重复读图由原生 Agent 的任务需求决定。JSON 元数据最多 16KiB，长 ID 列表可以截断并按 sketch_read 渐进读取；实际图片另走 DSH 的图片预算。

插件无法仅从上传像素证明“这张 PNG 对应这个场景”；信任已认证编辑器的公开导出流程，宿主绑定版本并由原生附件服务完整解码，不宣称有图像语义一致性验证。

## 稳定性与反馈

SSE 新增明确 disconnected 事件、即时 header flush 与关闭标记；编辑器主动关闭退休连接，丢弃迟到 message/error，每次断开只通知一次。首次能力确认后，连接生命期不随一次批注读取 available:false 来回重建；断开后仅由用户手动刷新恢复，不增加心跳轮询/连续后台任务。

历史 0.3.1 单次断开提示等待超时没有稳定复现，不能把新保护断言说成已定位该失败的唯一根因。迟到回调风险有确定性单测，浏览器覆盖暂不可用读取、迟到读取/写入交错和连续三次实际断开/手动恢复；以最终验证记录为准。

旧提议本地过期时直接显示“需重新提议”，预览/确认禁用；宿主 CAS/幂等仍是最终保护。结果不确定的相同候选重试仍可执行，不会把网络失败当作未写入。简短协作状态在宽屏底栏显示，窄屏隐藏以保留画布；“刷新协作状态”提供手动恢复入口。

操作菜单限制最大高度并允许滚动，900×480 / 900×360 窗口实际验证不超出画板；不会靠压缩绘图组件重写 Excalidraw 布局。

## 新增/调整模块

- src/core/visual.ts、src/host/visual-repository.ts、image-reference.ts：严格版本/引用/资源契约、原生附件存储、只读像素验证与有界元数据。
- src/host/agent.ts、tools.ts、service.ts、src/core/limits.ts：渐进图像标志、官方图像工具、准确路线门禁及认证 RPC/可释放独立域。
- src/editor/visual-reference.ts、scene-export.ts、App.tsx、edit-proposals.tsx、index.css：主动视觉准备、选区/全图缓存、过期提议禁用与轻量原生状态。
- src/editor/agent-stream.ts、agent-comments.ts、src/host/agent-events.ts：稳定连接生命期与旧回调保护。
- src/core/edits.ts：提前拒绝需要私有文本规范化的提议，旧存储 schema 保持兼容。
- tests/visual.test.ts、agent-stream.test.ts、browser-visual.mjs、原 Agent/修改/重启夹具：权限、预算、缓存、故障、原生 image block 和真实持久化验证。

最终自动检查、安装包与浏览器证据追加到 validation.md。模型响应使用脚本的测试只证明协议与真实宿主链路；真实 DeepSeek 自主调用/语义质量、usage、Windows 和模式/插件组合仍等待 [Windows 验收](windows-acceptance-v0.3.2.md)。未获得真实 Token 数据，不能以 JSON 字节估算节省比例。

同机固定场景两版各三轮的数值与方法见 [性能采样](benchmarks/submission-032.md)。新功能保持开板前零编辑器请求、平移零保存请求及同快照导出复用；样本仍有负载/缓存差异，不宣称整体提速、没有内存泄漏或真实 Token 节省。
