<div align="center">

# DSH Sketch Reference

### 画出想法，在 DSH 里接着做。

[![Release](https://img.shields.io/github/v/release/Amadeus2027/dsh-sketch-reference?label=release&color=4176e6)](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) [![CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Tested DSH](https://img.shields.io/badge/DSH-alpha.1_%7C_alpha.2-536DFE)](https://github.com/deepseek-ai/deepseek-harness) [![Ask DeepWiki](https://img.shields.io/badge/DeepWiki-Ask-20B8A5.svg)](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

[**下载插件**](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) · [**快速开始**](#快速开始) · [**使用指南**](docs/usage.md) · [**English**](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/README.en.md)

</div>

**用三个框表达布局，在原生聊天里继续讨论和实现。** Sketch Reference 把 Excalidraw 接入 DeepSeek Harness，让 Agent 按需读取草图、定位批注、提出修改；画板修改先预览，再由你确认。

![v0.6.3 操作演示：手绘三个区域、加入原生附件、返回聊天并重开草图](https://raw.githubusercontent.com/Amadeus2027/dsh-sketch-reference/main/docs/assets/v0.6.3/workflow.gif)

*约 20 秒 · 正式 v0.6.3 实际操作录像 · 三个简单手绘框。演示未调用模型、未发送聊天消息。[静态截图](docs/assets/v0.6.3/sketch.png) · [素材来源](docs/assets/v0.6.3/README.md)*

## 使用前与使用后

对比同一个任务：**“按这个布局做页面，接着调整这里。”**

| 仅原生聊天＋普通 PNG | 加上 Sketch Reference |
| --- | --- |
| **表达布局**：写文字，或在其他工具画图后上传 | **会话内画图**：草图自动保存，和当前任务放在一起 |
| **讨论局部**：说明“右边那个框”，或另做标记图 | **点选定位**：元素批注绑定真实图形，菜单追问或纠正 |
| **更新参考**：修改原图，再导出、附上新版 | **按需读取**：Agent 获取当前保存版本的结构与 PNG |
| **修改画板**：在绘图工具中手动调整 | **预览确认**：Agent 提议 → 前后预览 → 你确认 → 原生撤销 |

DSH 原本就能理解图片、调用工作区工具。这张表对比的是**草图沟通与编辑工作流**，不是模型质量、速度或 Token 消耗的对照实验。

## 一张草图，三种协作方式

- **画好就问。** 直接在原生聊天说：“按当前草图实现一个网页。”无需先做独立 AI 分析。
- **指着位置继续聊。** 让 Agent 标注某个区域，从批注菜单「追问 / 纠正 / 修改这里」起草下一条消息；你编辑后自行发送。
- **看过再改。** Agent 通过受限工具提出画板修改，同视角预览后确认应用。旧版本提议不能覆盖新草图。

草图与批注按会话保存。绘图、悬停、翻页不会触发模型；没有额外 AI 服务或独立密钥配置。

<details>
<summary>看看当前批注菜单</summary>

![v0.6.3 的紧凑批注栏、图形锚点与追问菜单](https://raw.githubusercontent.com/Amadeus2027/dsh-sketch-reference/main/docs/assets/v0.6.3/comments.png)

当前安装包的真实界面截图；批注文字来自固定测试响应，仅展示交互，不是新的真实 DeepSeek 结果。

</details>

## 你可以拿它做什么

| 场景 | 在同一会话继续做 |
| --- | --- |
| 网页 / UI | 画布局 → 实现页面 → 围绕搜索、导航与返回行为纠正。[运营看板与三屏 UI](docs/release-readiness-v0.6.0.md#b-真实应用与纠正) |
| PPT | 画出分区关系 → 制作可编辑幻灯片 → 调整指定页布局。[5 页 PPTX 与局部纠正](docs/release-readiness-v0.6.0.md#b-真实应用与纠正) |
| 手绘 | 画物品或示意图 → 读图讨论 → 补充说明。[无文字杯子草图与协作闭环](docs/windows-validation-v0.4.0-20261010.md) |

网页、UI 和 PPT 由 **DSH Agent** 生成，插件提供可持续编辑的视觉上下文。证据中的旧版界面保留为历史记录；具体案例不保证任意草图的生成质量。

## 快速开始

需要 Node.js `22.19–22.x` 或 `24+`、本地浏览器和 DSH Web profile。v0.6.4 支持 DSH Web `0.2.1-alpha.1` 与 `0.2.1-alpha.2`，Excalidraw `0.18.1`。两版云端实装验证已记录，Windows／真实模型按 [清单](docs/windows-acceptance-v0.6.4.md) 继续验收。

### 1. 安装固定宿主与插件

从 [Releases](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) 下载 `dsh-sketch-reference-0.6.4.tgz` 和 `SHA256SUMS.txt`。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.2
# 已有 alpha.1 也可继续使用同一个插件包
# 首次运行初始化 Web profile，随后退出宿主
dsh web
# 使用下载包的绝对路径；不要安装到终端 profile
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.6.4.tgz
dsh web
```

请使用 alpha.1 或 alpha.2。升级插件前等待保存并退出宿主，保留原 profile、存储与浏览器数据；无需迁移草图或启用版本豁免。旧 v0.6.3 仍只接受 alpha.1，其他宿主版本见 [兼容说明](docs/dsh-compatibility.md)。

### 2. 从一张简单草图开始

1. 选择工作区并创建会话，点击输入框旁的 **「参考板」**，画图并添加用途。
2. 等待 **「已保存」**，返回原生聊天提问；也可点 **「作为参考发送」** 将 PNG 加入输入框。
3. 接着讨论、添加批注或请求修改。画板修改检查预览后确认，聊天消息由你发送。

模型与认证在 DSH 内配置；图片读取需要模型支持图片输入。模型未配置时，绘图、保存与导出仍可使用。操作细节见 [使用指南](docs/usage.md)。

<details>
<summary>兼容性、数据与功能边界</summary>

- v0.6.4 两版 Web 宿主功能回归来自 Linux 隔离环境；Windows／真实模型仍需验收。其他宿主版本、移动端、非默认工具模式和所有插件组合不作兼容承诺。
- 无法可靠定位时保留文字建议，不猜测位置。模型可能误读草图或返回无效参数；数学正确性无保证。重点按版本绑定，不限制其他宿主工具或清除聊天历史。
- 画板修改受图形白名单限制，不任意修改锁定、绑定、成组元素或样式；跨刷新撤销历史不保证恢复。
- 草稿与图片在本地 DSH 存储；模型读取时发送至已配置的服务。历史附件尚无自动回收机制；升级／卸载前请导出草图备份。
- 同步断线后用 **「⋯ → 同步批注」** 或重开画板。没有内置网页／PPT 生成器，也没有草图与代码自动双向绑定。

[宿主兼容报告](docs/dsh-compatibility.md) · [v0.6.4 验证范围](docs/validation-v0.6.4.md)

</details>

## 一起把草图协作做得更好

如果你希望 DSH 能持续理解同一张草图，欢迎 **Star** 关注更新。欢迎带着脱敏草图和复现步骤来 [反馈问题、提出场景](https://github.com/Amadeus2027/dsh-sketch-reference/issues)。请勿上传密钥、登录链接或私人会话。

<details>
<summary>从源码构建、验证记录与开源许可</summary>

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm pack
```

[贡献流程](CONTRIBUTING.md) · [0.6.4 验证记录](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/validation-v0.6.4.md) · [复用说明](REUSE.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

插件采用 [MIT](LICENSE)，绘图能力来自 Excalidraw，宿主能力来自 DeepSeek Harness。这是社区插件；第三方软件遵循各自许可证。实际模型验证与固定响应的协议测试分别记录，不将测试次数写成生成质量或 Token 节省证明。

</details>
