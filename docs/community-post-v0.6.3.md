> **非官方项目，由社区成员独立开发和维护；不是 DeepSeek 官方产品或背书项目。**
> **Unofficial community project, independently developed and maintained.**

**项目地址：[Amadeus2027/dsh-sketch-reference](https://github.com/Amadeus2027/dsh-sketch-reference)**  
**下载：[v0.6.3 Release](https://github.com/Amadeus2027/dsh-sketch-reference/releases/tag/v0.6.3)** · **许可：MIT**

我做了一个 DSH 可视化需求协作插件：把 Excalidraw 画板放进原生会话，让用户画出想法，在原生聊天里继续讨论、让 Agent 读取草图，并把解释锚定到具体图形。需要改画板时，先看修改预览，再由用户确认。

主要用于网页、UI、PPT 布局等视觉需求，也可以讨论自由手绘的物品或示意图。普通问答继续使用 DSH 原生聊天，没有另做一套聊天系统。

**当前发布版 v0.6.3 固定适配 DSH `0.2.1-alpha.1` Web profile。`alpha.2` 暂不能默认直接安装本版本，适配未完成；请先阅读 [兼容说明](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/dsh-compatibility.md)，保留原 DSH 数据。**

## 20 秒操作演示

![v0.6.3：简单手绘、PNG 加入原生输入框、返回聊天并重开同一草图](https://raw.githubusercontent.com/Amadeus2027/dsh-sketch-reference/06100490238b28182670ba8de3583ad27cc95ade/docs/assets/v0.6.3/workflow.gif)

三个自由笔迹框，少量中文标注。录像来自正式发布包的隔离安装，展示绘图、原生 PNG 附件、保留未发送文字，以及重开已保存草图；这段演示没有调用模型或自动发送消息。[静态图与素材来源](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/assets/v0.6.3/README.md)。

## 与普通附图相比，多了什么

- **同一会话里的可编辑草图**：自动保存、版本冲突保护、本地恢复，PNG 与可编辑备份导出。
- **围绕具体位置讨论**：元素锚点批注、点击定位、追问和纠正进入原生输入框；无法可靠定位时保留文字说明。
- **可控的画板修改**：Agent 提出受限图形操作，画板展示前后对照，用户确认后应用；支持原生撤销，过期提议拒绝覆盖新版本。

DSH 本来就能理解图片和使用工作区工具，插件补充的是持续编辑、定位讨论和版本关联，不声称模型质量、速度或 Token 消耗优于普通文字／图片沟通。网页、UI 和 PPT 由 DSH Agent 生成，插件提供视觉上下文，不内置网页／PPT 生成器。

## 如何集成 DSH

- 使用 Host/Client 插件与原生工具栏入口，复用 DSH 会话身份、原生输入框及附件机制。
- 通过 DSH Agent Tool 提供 `sketch_read`、`sketch_read_image`、`sketch_annotate`、`sketch_propose_edit`：先读紧凑摘要，需要时再取元素细节或图片，不在每轮聊天自动附完整场景。
- 可选的「AI 分析草图」复用 `ctx.llm.stream()` 与 DSH 已配置模型；普通聊天复用原生 Agent，不增加独立 AI API、密钥或模型代理。
- 使用 Excalidraw `0.18.1` 公开 API 绘图、定位、导出和更新场景；校验会话、元素 ID、revision 与操作范围。绘图、悬停、翻页及批注状态变化不自动调用模型，也不自动发送聊天消息。

## 安装与起步

需要 Node.js `22.19–22.x` 或 `24+`。从 [v0.6.3 Release](https://github.com/Amadeus2027/dsh-sketch-reference/releases/tag/v0.6.3) 下载 `dsh-sketch-reference-0.6.3.tgz` 与 `SHA256SUMS.txt`。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.1
# 初始化 Web profile，随后退出宿主
dsh web
# 替换为下载包的绝对路径，宿主退出后安装
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.6.3.tgz
dsh web
```

在 DSH 内配置模型，选择工作区并创建会话，点输入框旁「参考板」。画好后等「已保存」，返回聊天提问即可，不强制先点击「AI 分析草图」。模型不支持图片时不能做图片视觉读取；模型未配置时仍能画图、保存和导出。

## 验证与边界

仓库分别记录 [当前版本验证](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/validation-v0.6.3.md) 和 [Windows／真实 DeepSeek 协作记录](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/windows-validation-v0.4.0-20261010.md)，另有 [真实网页、UI、PPT 案例](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/docs/release-readiness-v0.6.0.md#b-真实应用与纠正)。历史截图按原版本保留，不作为当前界面；固定响应测试不等于真实模型效果验收。

当前界面为中文。模型仍可能误读草图，数学正确性无保证；高级绑定／分组编辑、任意方向箭头及跨刷新撤销历史未作完整支持。其他宿主版本、移动端和所有插件组合不作兼容承诺。模型读取的数据会发送至 DSH 配置的模型服务，升级／卸载前建议导出草图备份。

欢迎反馈实际使用场景，尤其是网页、UI、PPT 的「草图 → 实现 → 局部纠正」流程。有问题可以在 [项目 Issues](https://github.com/Amadeus2027/dsh-sketch-reference/issues) 提交脱敏草图与复现步骤；如果这个方向对你有用，也欢迎 Star 关注更新。

### English summary

Sketch Reference brings an editable Excalidraw canvas into native DSH conversations. The Agent can read saved structure/images on demand, anchor comments to shapes and propose restricted canvas edits. Users preview and approve edits; the plugin does not auto-send messages or introduce a separate AI API/key. The GIF shows real UI interaction without model calls. **v0.6.3 targets DSH `0.2.1-alpha.1` Web only; `alpha.2` adaptation is not complete.** The UI is Chinese; [English README](https://github.com/Amadeus2027/dsh-sketch-reference/blob/main/README.en.md) is available. This is an unofficial community project, not a DeepSeek-endorsed product.
