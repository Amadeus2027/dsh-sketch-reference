# DSH Sketch Reference

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH baseline](https://img.shields.io/badge/DSH-0.2.1--alpha.1-536DFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Ask DeepWiki](https://img.shields.io/badge/DeepWiki-Ask-20B8A5.svg)](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

在 DeepSeek Harness 中画图、讨论，再确认修改。

Sketch Reference 将可编辑的 Excalidraw 画板接入 DSH 原生会话。用草图表达网页布局、流程和视觉需求，让 Agent 按需查看图形与图片，围绕具体位置继续追问和纠正。

**当前开发版本：0.6.3。** 正式安装包以 [GitHub Releases](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) 为准。验证环境：Windows PC、DSH `0.2.1-alpha.1`、Excalidraw `0.18.1`。

## 能做什么

- **画图与恢复**：原生 Excalidraw 编辑、自动保存、下载备份，草稿按会话隔离。
- **让 Agent 看图**：按需读取结构和真实 PNG，可将选区设为重点。
- **围绕批注交流**：点击定位图形，从批注追问、纠正或要求修改，继续使用原生输入框。
- **确认后修改**：Agent 提出受限编辑方案，用户预览、确认后应用，支持原生撤销。

草图用于表达需求；网页等成果由 DSH Agent 在应用工作区生成。插件不内置网页生成器，也不自动绑定草图与应用代码。

## 安装

需要 Node.js `22.19–22.x` 或 `24+`。从 [Releases](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) 下载 `.tgz`。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.1
# 首次运行初始化 Web profile，随后退出宿主
dsh web
# 使用实际下载包的绝对路径安装
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-版本号.tgz
dsh web
```

在 DSH 内配置模型，读取图片需要当前模型支持图片输入。没有模型配置时仍可绘图、保存和导出。升级前建议下载草图备份，安装完成后重启宿主。

## 第一次使用

1. 选择工作区并创建会话，点击输入框旁的「参考板」。
2. 画出布局、添加文字并填写用途，等待「已保存」。
3. 直接在原生聊天提问，例如：**“按这张草图，在当前工作区实现一个网页。”** 无需先点「AI 分析草图」。
4. 需要讨论具体位置时，让 Agent 添加批注，从对应卡片点「追问」「纠正」或「修改这里」。插入后可编辑，由你发送。
5. 修改画板时，先检查提议预览，再明确确认应用。

网页布局协作、重点选择、备份与常见问题见 [使用指南](docs/usage.md)。

## 使用边界

- 图片与结构按需读取，普通绘图、悬停和批注切换不会自动请求模型。模型调用可能产生用量，视觉判断也可能需要纠正。
- 重点绑定草图版本，变化后需重新设置；当前读取边界不会清除已有聊天记录或附件。
- 修改仅支持现有基础图形白名单，不能任意修改锁定、绑定或成组元素。未确认提议不会改变画板。
- 草稿和图片保存在本地 DSH 存储；模型读取时，相关内容发送至所配置的模型服务。宿主附件历史尚无插件自动回收机制。
- 同步断线时可通过底部「⋯ → 同步批注」或重开画板恢复。跨刷新撤销历史、其他宿主版本、其他平台和移动端不作兼容承诺。

见 [0.6.3 更新说明](docs/release-v0.6.3.md)。反馈问题请提供版本、复现步骤与脱敏截图，勿上传密钥和私人会话。

## 开发与许可

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm pack
```

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。插件采用 [MIT](LICENSE)；复用组件遵循各自许可证，见 [REUSE.md](REUSE.md) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。
