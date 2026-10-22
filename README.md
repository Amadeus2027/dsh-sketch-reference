<div align="center">

# DSH Sketch Reference

### 画出想法，交给 DSH

[![Release](https://img.shields.io/github/v/release/Amadeus2027/dsh-sketch-reference?label=release&color=4176e6)](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) [![CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) [![DSH](https://img.shields.io/badge/DSH-alpha.1_%7C_alpha.2-536DFE)](docs/dsh-compatibility.md) [![MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[**安装**](#快速开始) · [**使用指南**](docs/usage.md) · [**更新记录**](docs/release-v0.7.0.md) · [**English**](README.en.md)

</div>

**在 DSH 会话里画草图，让 Agent 读图、讨论并继续实现。** 用 Excalidraw 表达页面布局、PPT 分区或手绘想法；用 Sketch Graph 串联页面与细节。原生聊天、工作区和模型配置继续沿用 DSH。

![Sketch Graph：从总览进入草图，切换全屏并使用原生悬浮对话](docs/assets/v0.7.0/sketch-graph.gif)

*总览看关系，双击画细节。分屏与全屏随时切换。[演示素材说明](docs/assets/v0.7.0/README.md)*

## 从草图到下一步

| 你想做什么 | 在同一个 DSH 会话里继续 |
| --- | --- |
| **做一个网页** | 画出布局与跳转关系 → “按这些草图实现页面” → 在工作区运行和调整 |
| **制作 PPT** | 画出每页的内容分区 → “按这个结构制作可编辑幻灯片” → 继续改指定页 |
| **讨论某个细节** | 选中元素或查看锚点批注 → 追问、纠正 → 预览并确认画板修改 |

**画板与对话保持接续：** 草图按会话保存，Agent 按需读取结构和 PNG；批注可以定位到图形。根草图的 AI 修改先预览、再确认，旧提议不能覆盖新版本。绘图、移动和查看批注不触发模型请求。

<details>
<summary><strong>看实际案例：4 张草图 → 电商网页</strong></summary>

![真实 Agent 生成网页的浏览器交互：登录、商品详情与购物车](docs/assets/v0.7.0/agent-site.gif)

Windows DSH alpha.2 的真实 DeepSeek 对话读取 4 张草图及关联，生成 HTML/CSS/JS，再经反馈纠正。GIF 展示完成后的网页交互，已剪去等待。[过程、修正与验收记录](docs/validation-v0.7.0.md)

更多案例：[网页／UI 与 5 页 PPTX](docs/release-readiness-v0.6.0.md#b-真实应用与纠正) · [无文字手绘识别](docs/windows-validation-v0.4.0-20261010.md)

</details>

## 快速开始

预先安装 **DSH Web `0.2.1-alpha.1` 或 `0.2.1-alpha.2`**，并确保 pnpm 可用。无需另装 Excalidraw 或额外配置 AI 密钥。升级前等待草图保存、导出备份并退出正在运行的 DSH。

通过官方插件管理器安装 **[v0.7.0](https://github.com/Amadeus2027/dsh-sketch-reference/releases/tag/v0.7.0)**：

```sh
dsh plugin --profile web add https://github.com/Amadeus2027/dsh-sketch-reference/releases/download/v0.7.0/dsh-sketch-reference-0.7.0.tgz
dsh web
```

1. 选择工作区与会话，点击输入框旁的 **「参考板」**，画图并填写用途。
2. 等待 **「已保存」**，回到原生聊天：“按当前草图制作页面”。也可点 **「作为参考发送」** 添加 PNG 附件。
3. 继续讨论，或请求批注与修改；检查修改预览后确认，聊天消息由你发送。

**其他安装方式仍然保留：**

<details>
<summary>下载 TGZ／安装 ZIP，本地加入 DSH</summary>

从 [Release](https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest) 下载 `.tgz` 和 `SHA256SUMS.txt`；[安装 ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/releases/download/v0.7.0/dsh-sketch-reference-0.7.0-installable.zip) 解压后包含相同安装包及校验清单。核验后执行：

```sh
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.7.0.tgz
dsh web
```

[成功 CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/workflows/ci.yml) 的 `dsh-sketch-reference-installable` 产物也保留，供测试尚未发行的改动。

</details>

<details>
<summary>源码 ZIP 解压、构建后直接加入 DSH</summary>

下载 [固定 v0.7.0 源码 ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/archive/refs/tags/v0.7.0.zip)，或使用 [Code → Download ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/archive/refs/heads/main.zip) 获取最新主分支。解压并进入包含 `package.json` 的目录：

```sh
pnpm install --frozen-lockfile
pnpm run bundle
# 等待保存并退出 DSH；路径替换为实际解压目录
dsh plugin --profile web add "/绝对路径/dsh-sketch-reference-0.7.0"
dsh web
```

无需先打包 TGZ。DSH 链接该目录，请保留目录及 `lib`、`node_modules`；更新源码后重新构建并重启宿主。[Windows 路径与升级说明](docs/installation.md#从源码-zip-目录直接安装)

</details>

## Sketch Graph：一张草图，一个节点

- **组织设计。** 用节点命名页面，区分页面跳转和细节展开；从元素、多元素或框选区域连接细节。
- **保持可编辑。** 双击进入 Excalidraw，沿面包屑返回；旧草图保留为根节点，不覆盖迁移。
- **按需提供上下文。** Agent 先读图关系和摘要，需要细节时再读指定节点与 PNG。
- **继续原生工作流。** 自动保存、冲突保护、可编辑备份与添加式恢复；全屏仍可使用原生聊天。

[完整使用指南](docs/usage.md) · [安装与升级](docs/installation.md) · [文档索引](docs/README.md) · [DeepWiki](https://deepwiki.com/Amadeus2027/dsh-sketch-reference)

<details>
<summary>兼容性、数据与当前边界</summary>

- 社区插件，适配上述两版 DSH Web；其他宿主版本、移动端和全部插件组合未作兼容承诺。模型读取图像需要视觉能力；基础绘图、保存与导出独立可用。
- 最多 100 节点／300 连线，满载仍可能掉帧。整图撤销、搜索、复杂绑定编辑和跨刷新撤销历史尚未提供；批注、改图提议和原生附件发送目前限根草图。
- 草稿与图片存储在本地 DSH；被模型读取时发送至已配置服务。历史附件尚无自动回收，升级／卸载前请导出备份。模型可能误读或返回无效参数，无法可靠定位时退回文字建议。
- 本插件提供可编辑参考和协作工具；网页与 PPT 由 DSH Agent 及其工作区工具实现。选区重点不约束其他宿主工具，也不清除聊天历史。

[本版验证](docs/validation-v0.7.0.md) · [性能与已知限制](docs/review-graph-performance-20261017.md) · [宿主兼容报告](docs/dsh-compatibility.md)。正式包的 Linux 回归与历史 Windows／真实模型案例有各自记录，不等于全平台完整验收。

</details>

## 参与改进

觉得有用，欢迎 **[Star](https://github.com/Amadeus2027/dsh-sketch-reference/stargazers)** 关注更新。带着脱敏草图与复现步骤 [反馈问题](https://github.com/Amadeus2027/dsh-sketch-reference/issues)，或按 [贡献指南](CONTRIBUTING.md) 提交 PR。

[MIT](LICENSE) · 绘图来自 Excalidraw · 图总览来自 React Flow · [复用说明](REUSE.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
