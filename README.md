<div align="center">

# DSH Sketch Reference

### 画出需求，和 DeepSeek 一起把它做出来。

[![Release](https://img.shields.io/github/v/release/Amadeus2027/dsh-sketch-reference?label=release&color=4176e6)](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) [![CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Tested DSH](https://img.shields.io/badge/DSH-0.2.1--alpha.1-536DFE)](https://github.com/deepseek-ai/deepseek-harness) [![Ask DeepWiki](https://img.shields.io/badge/DeepWiki-Ask-20B8A5.svg)](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

[**下载插件**](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) · [**快速开始**](#快速开始) · [**使用指南**](docs/usage.md) · [**English**](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/README.en.md)

</div>

Sketch Reference 把 **Excalidraw 可编辑画板接入 DSH 原生会话**：画出想法，让 Agent 按需读取图片与图形，把讨论锚定到具体位置。修改先预览，再由你确认。

![真实 DeepSeek 原生对话与草图修改前后预览](https://raw.githubusercontent.com/Amadeus2027/dsh-sketch-reference/main/docs/screenshots/v0.4.0/edit-comparison.jpg)

*Windows / 官方 DeepSeek 的 v0.4.0 实机记录，展示真实修改提议；不是设计稿或脚本模型输出。当前界面已进一步压缩批注区、加入分页和菜单，见 [v0.6.3 更新](docs/release-v0.6.3.md)。*

## 看一次完整协作

**定位批注 → 继续对话 → 检查修改前后 → 确认应用。**

> “按这张草图，在当前工作区实现一个网页。”<br>“这个区域理解错了，我们围绕这里继续讨论。”<br>“先给我看修改预览，我确认后再改画板。”

| 你要做的事 | 插件提供的协作方式 |
| --- | --- |
| 画出网页、UI 或 PPT 的布局想法 | 原生 Excalidraw 编辑；草稿自动保存，按 DSH 会话隔离 |
| 让 Agent 理解整图或局部 | 按需读取保存版本的结构与 PNG；选区可以设为重点 |
| 讨论“这里是什么意思／哪里需要改” | 图形锚点批注、点击定位、追问和纠正进入原生输入框 |
| 让 Agent 修改画板 | 受限操作提议、同视角前后对照；用户确认后应用，可原生撤销 |
| 返回草图继续原有任务 | 保存、恢复、缩放／平移记忆，PNG 和可编辑备份导出 |

绘图、悬停、翻页、同步批注都不会自动调用模型；从批注插入文字也不会自动发送聊天消息。

## 草图可以用来做什么

### 网页与 UI：表达布局，再围绕结果纠正

下面的运营看板由真实 DeepSeek 在 DSH 工作区生成，浏览器验收覆盖导航、搜索和深色主题；后续纠正限定了搜索的作用范围。

![DeepSeek 根据草图需求生成并经浏览器验收的运营看板](https://raw.githubusercontent.com/Amadeus2027/dsh-sketch-reference/main/docs/evidence/v0.6.0/web-orders-dark.png)

| 已验证案例 | 结果与证据 |
| --- | --- |
| 网页运营看板 | HTML / CSS / JS；导航、订单搜索、深色主题与用户纠正，[真实应用记录](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/release-readiness-v0.6.0.md#b-真实应用与纠正) |
| 三屏 UI | 登录、任务、设置；保存留页与返回行为纠正，同一份应用记录可查 |
| PPT 布局 | 5 页可编辑 PPTX、24 个原生形状；第 3 页比例纠正后重新渲染，其余 4 页保持不变 |
| 自由手绘讨论 | 无文字标注的杯子草图，原生聊天读取真实图片并回答，[实机记录](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/windows-validation-v0.4.0-20261010.md) |

这些是具体案例，不保证任意草图的识别或生成质量。**网页、UI 和 PPT 由 DSH Agent 的工作区能力生成；插件提供持续可编辑的视觉上下文，没有内置网页／PPT 生成器，也没有草图与代码自动双向绑定。**

## 快速开始

需要 Node.js `22.19–22.x` 或 `24+`、本地浏览器和 DSH Web profile。当前固定验收环境为 Windows PC、DSH `0.2.1-alpha.1`、Excalidraw `0.18.1`。

### 1. 安装固定宿主与插件

从 [Releases](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) 下载 `dsh-sketch-reference-0.6.3.tgz` 和 `SHA256SUMS.txt`。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.1
# 首次运行初始化 Web profile，随后退出宿主
dsh web
# 使用下载包的绝对路径；不要安装到终端 profile
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.6.3.tgz
dsh web
```

请使用上述固定宿主版本。最新 `alpha.2` 暂不能直接安装 v0.6.3；已使用其他版本的用户请先查看 [兼容说明](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/dsh-compatibility.md)，保留原 DSH 数据。

### 2. 画图，然后直接在原生聊天提问

1. 选择工作区并创建会话，点击输入框旁的 **「参考板」**。
2. 画出区域关系、添加必要文字与用途，等待 **「已保存」**。
3. 返回原生聊天，例如：**“按当前草图实现一个网页，先保留布局关系。”**
4. 需要讨论具体位置时，请 Agent 添加批注，从卡片菜单点 **「追问」「纠正」「修改这里」**，编辑后自行发送。
5. 修改画板时检查提议预览，明确确认后应用；需要时使用原生撤销。

无需先点击「AI 分析草图」。这个按钮是可选的独立分析入口；正常问答、应用开发继续走 DSH 原生 Agent。

在 DSH 内配置模型与认证，插件不增加独立 AI API 或额外密钥。读取图片需要当前模型支持图片输入；模型未配置或不可用时，绘图、保存与导出仍可使用。

## 使用边界

- 视觉判断可能出错，模型也可能返回无效工具参数；可以纠正或显式重试，不以伪造结果掩盖失败。数学正确性没有保证。
- 重点绑定草图版本，变化后需重新设置；它不会清除已有聊天记录或约束其他宿主工具。
- 修改受图形白名单限制，不任意改变锁定、绑定、成组元素或样式。跨刷新撤销历史不保证恢复。
- 草稿与图片保存在本地 DSH 存储；模型读取时发送至所配置的模型服务。宿主附件历史尚无插件自动回收机制。
- 同步断线后使用 **「⋯ → 同步批注」** 或重开画板。当前不承诺其他宿主版本、其他平台、移动端或所有插件组合的兼容性。

操作细节、重点、恢复与卸载见 [使用指南](docs/usage.md)。升级／卸载前建议下载草图备份。

## 参与项目

如果你也想用草图和 Agent 持续沟通，欢迎 **Star** 关注后续更新。更欢迎带着脱敏草图、使用场景和复现步骤来 [反馈问题或提出想法](https://github.com/Amadeus2027/dsh-sketch-reference/issues)。请勿上传密钥、登录链接或私人会话。

<details>
<summary>从源码构建、验证记录与开源许可</summary>

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm pack
```

[贡献流程](CONTRIBUTING.md) · [0.6.3 验证记录](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/validation-v0.6.3.md) · [复用说明](REUSE.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

插件采用 [MIT](LICENSE)，绘图能力来自 Excalidraw，宿主能力来自 DeepSeek Harness。这是社区插件；第三方软件遵循各自许可证。实际模型验证与固定响应的协议测试分别记录，不将测试次数写成生成质量或 Token 节省证明。

</details>
