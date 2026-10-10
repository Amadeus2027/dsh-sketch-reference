# v0.5.0 Windows 实装与真实 Agent 验证

2026-10-10，正式源码基线 `7737cfe2b239`，最终运行代码 `3539f3fc670c`。后续提交只整理交付记录。DSH `0.2.1-alpha.1`、Excalidraw `0.18.1`、Node `24.14.1`、pnpm `11.25.0`；没有升级依赖。本文记录实际通过范围，不表示历史所有验收项已重新执行。

## 环境与动作归属

专用 AppContainer DSH `http://127.0.0.1:57320/`，官方 DeepSeek `deepseek-official / deepseek-flash`，界面显示 `DeepSeek-V41-Flash / High`。固定源码快照只读，独立测试存储可写。原有用户实例未替换；只在专用 profile 中切换 bundle 和主题。权限、快照及原始反馈见 [协作记录](agent-led-development-v0.5.0.md)。

DeepSeek 原生 `read` 自主研究并真实执行草图工具。画板素材、选区、Composer 手动发送、预览、明确确认与撤销由 Codex 在用户侧操作。没有把 Codex 的浏览器操作称为 DeepSeek 自主动作。模型没有直接源码写入或改图权限。

## 自动检查

| 命令 | 最终生产代码结果 |
|---|---|
| `pnpm run typecheck` | 通过，3.91 秒 |
| `pnpm test` | 18 文件 / 159 项通过，2.73 秒；保留基线全部148项 |
| `pnpm run bundle` | 通过，24.11 秒 |
| `pnpm pack` | 通过，0.5.0 tgz |

时长是单次本机观测，不是性能对比。原始 [命令结果](agent-led-v0.5.0/final-review/implementation-checks.json)。新增测试覆盖精确操作形状、固定宿主支持子集、执行入口闭合、可恢复参数错误、不回显恶意值、域错误/取消语义、能力与准入一致、focus 内计数和旧批次真实状态更新。

安装后的 `lib/index.js` 与通过构建的 bundle SHA256 一致；最终只读快照的458个原始文件逐一校验未变。[来源与哈希](agent-led-v0.5.0/final-review/snapshot-provenance.json)。CodeRabbit CLI 不可用，没有其审查结果；本轮不重新声称执行了完整历史 Playwright 脚本套件。

## 原生布局 A/B

在同一专用宿主、相同长会话和窗口下，停止进程、从 profile 的 bundles 排除插件后重启，完成原生对照；再恢复插件并重启。不是隐藏插件按钮来冒充卸载。

| 条件 | 实际观察 |
|---|---|
| 启用插件，画板关闭，1280×720 | 消息区域高644，scrollTop 8713→7273；Composer top600 / bottom636 不变，页面 scrollTop0 |
| 排除插件，1280×720 | 无参考板入口、无 SketchShell；消息区域高644，scrollTop 8743→7303；Composer top600 / bottom636、x420.5 / width708 与启用相同 |
| 排除插件，390×844 | 页面宽390、高844；Composer x72 / top724 / width291 / bottom760；无额外页面滚动 |
| 启用插件，390×844 | 聊天同上述 Composer 几何；开板为窄屏覆盖层、返回聊天后恢复；document 390×844 / scrollTop0 |
| 启用插件，打开分栏 | 原生分隔条键盘调整40%→44%；消息 scrollTop12790→12070，Composer top600 / bottom636 不漂移，页面 scrollTop0 |
| 重启与会话切换 | 最终与前一复审会话来回切换；各自开板状态恢复，返回最终会话显示其9元素草图、已更正批注和历史提议，没有串成另一会话内容 |

原始几何：[启用](agent-led-v0.5.0/final-review/layout-enabled.json)、[原生](agent-led-v0.5.0/final-review/layout-native.json)、[原生窄屏](agent-led-v0.5.0/final-review/layout-native-narrow.json)、[启用窄屏](agent-led-v0.5.0/final-review/layout-enabled-narrow.json)、[分栏](agent-led-v0.5.0/final-review/layout-split.json)。原生黄色工具卡片及工具详情保留，错误没有被隐藏。本次没有修改客户端布局或覆盖宿主全局 CSS。

浅色与通过固定宿主公开 `ui-theme.preference: dark` 启动的深色渲染均正常，宿主与 iframe 同步；见 [深色截图](agent-led-v0.5.0/final-review/dark-startup.png)。**隔离宿主设置中的浅色/深色实时按钮未成功切换，原因未归因；启动渲染通过不等于实时切换通过。** 检查后已恢复原始 system 配置。重启后临时 focus 清除是既有设计，不伪称持久恢复。

## 批注 → 追问 → 纠正 → 修改

最终会话 `session-81de30b0-e09f-4773-b976-6d93d007e7d8`。

1. DeepSeek 读取当前重点及相关源码后，为真实矩形保存批注。初版把独立文字误说为可缩放，并引用了旧用途细节；错误原文保留。
2. 原生框内先有“请先解释依据，不要修改图形。”及待发送 PNG。点击卡片追问后，原文字和 PNG 均保留，插入简洁中文及短引用 `聊天批注·5e662d5b0db6`，没有 UUID/场景 JSON，也没有自动发送。[输入证据](agent-led-v0.5.0/final-review/followup-draft.png)。移除本次测试 PNG 后才手动发送，避免重复上传。
3. 一次追问遇到宿主 `MALFORMED_RESPONSE`；最小手动重试后 DeepSeek 正确关联锚点，承认独立文字只能 move/delete。HTTP200 不代表模型工具输入一定有效，未宣称修复该解析问题。
4. 从“纠正”进入原生框并手动发送。DeepSeek 真实调用 `sketch_annotate` 更换批次，保留同一真实元素 ID，明确“订单输入”是用户本次说明而非图上已有文字。图形 revision 未变。
5. 旧短引用得到 `COMMENT_UNAVAILABLE`，DeepSeek 拒绝按标题猜测目标；重新点击新批注生成新引用 `聊天批注·6b29f60282a1`。卡片非按钮区域可激活，Enter展开、Space收起，内部“修改这里”没有额外切换冲突。
6. 从“修改这里”手动发送“在框内新增独立文字订单输入，不移动/缩放/删除原结构，先预览确认”。DeepSeek 提出真实 text create，未直接改图。

原文及完整插件调用：[最终复审原文](agent-led-v0.5.0/final-review/deepseek-original-feedback.md)、[事件](agent-led-v0.5.0/final-review/tool-events.jsonl)。短引用是既有 v0.4.1 机制，本轮复用并实测，没有新建聊天或关联存储系统。

## 预览、确认与原生撤销

提议 `0d6d9154-ceba-4ec3-a909-a46fe4eaa939`：在原矩形内部创建独立文字。

| 状态 | revision | 活跃元素 / 结果 |
|---|---|---|
| 待预览 | fb4251d0-de52-484f-9a06-1c807f4385ec | 9，原图不变 |
| 已预览未确认 | 同上 | 9，正式场景哈希不变；同视角预览可见 |
| Codex 明确点击确认 | ba29a861-93d7-43a4-b21d-e7fb7dc4fd80 | 10，新增“订单输入” |
| 一次 Excalidraw 原生撤销 | a0832ecc-1482-420c-a6ae-3c12b0b784b7 | 9，活跃元素几何与文字恢复 |

上述 UI 阶段官方请求计数一直192，没有额外模型调用。撤销产生新 revision；历史 proposal.status 仍为 applied，UI 正确显示“曾应用·画板已变化”。不能把历史 applied 当作当前文字仍存在。原生撤销可能保留删除墓碑，验收比较活跃元素，不要求序列化场景字节相同。

[存储与计数断言](agent-led-v0.5.0/final-review/state-evidence.json)、[预览](agent-led-v0.5.0/final-review/edit-preview.png)、[撤销后](agent-led-v0.5.0/final-review/edit-undone.png)。第一轮另一真实 text create 提议也完成9→11→9，原始证据另存于 review/，不混称最终代码独立执行。

## focus、缓存与无副作用

- 修复前 DeepSeek 自主发现重点只有1个元素却返回全图9个、批注3个的规模；修复后显式请求 all 仍返回 focus，sceneTotalElements 为1，annotations.count/items/scope 一致。重点矩形绑定箭头，即使箭头在选区外也返回 `allowedOperations:[]`；准入按完整场景计算。
- 展开卡片、插入追问、保留草稿/附件期间 revision、场景哈希及缓存 metadata 未变，官方请求计数180不增。未插桩底层 PNG 导出次数，因此不声称“绝对零次导出”。
- 撤销后旧 focus 的结构与图片读取均真实得到 `FOCUS_STALE`；没有回退全图或返回旧图片。Codex 主动重选同一矩形后，新 focus 图片更新到当前 revision，214×134 / 4515B，像素附件 SHA256 与修改前该矩形一致。
- 关闭参考板后，DeepSeek 真实读摘要和当前缓存 PNG 成功；请求 all 仍返回 focus 的1元素图片。全图缓存仍是旧 revision，没有被当成当前图片。它明确没有独立确认选区外9元素全图，只核对当前重点。

这些是小样例一致性证据，未重做快速连续绘图压力测试、光栅化计数或跨版本延迟对照，没有据此声称 Token 节省或全面性能提升。

## 原始用量与未覆盖范围

专用网关累计199次真实官方 HTTP请求，全部HTTP200；包含初始研究、DeepSeek原生子会话、错误尝试及复审，**不是199轮用户对话**。持久化日志共有194个模型步骤（137+17+40），部分失败 attempt 不一定有 usage。各阶段 transport 文件是累计快照，不可相加。[导出核查与分阶段 usage](agent-led-v0.5.0/final-review/export-audit.json)。隔离网关缓冲响应，UI tok/s 不可用于生产流式延迟评价。原始记录去除 reasoning、系统块、密钥和图片Base64，保留专用研发会话的原始提问、回答、插件结果及失败。

仍有限制：

- `MALFORMED_RESPONSE` 在基线及最终回归均出现，尚未定位到模型/宿主/传输具体责任；重试成功不代表根因修复。
- 固定 Web 不消费 `presentResult` 回调，工具卡片仍显示原始详情；只交付兼容的纯投影，不宣称 Web 已简化。
- 实时主题按钮未验收通过，启动深浅渲染已验证；捕获式 shell/glob/grep 在隔离研究环境不可用，未绕过权限。
- 本轮未重测 arrow create 实机确认、完整恢复故障注入、跨会话待发送附件 A/B、PTC/both、其他插件共存、热卸载、其他平台及复杂识别质量。既有自动安全测试保留，不把历史结果改称本次实测。
- Excalidraw 字体子集逻辑触发既有 CSP unsafe-eval 提示时仍有渲染回退；本次 PNG 可读，不为此放宽 CSP。

两轮主要复审已收敛，DeepSeek 的“可以交付”只代表它对本次改动的评价。独立测试、真实 UI 和未覆盖项按本文分别记录。提交 PR 供维护者审查与合并，不发布 Release。
