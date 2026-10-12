# 社区展示与仓库 About

主页采用中文默认入口与英文 README。首屏用一句用途说明和约 20 秒的 v0.6.3 真实交互动图，展示三个简单手绘区域 → 原生 PNG 附件 → 返回聊天 → 重开草图。动图没有模型调用或自动发送消息；保留静态图片入口，并将固定测试批注菜单放入折叠区。来源、编码和边界详见 [素材记录](assets/v0.6.3/README.md)。

新增「使用前与使用后」表格，以仅原生聊天＋普通 PNG 为基线，比较草图保存、局部讨论、版本读取及受限编辑。没有把普通 DSH 描述成无法理解图片，也没有声称生成质量、速度或 Token 消耗优于基线。历史网页/PPT 案例与旧界面保留在原证据文档中。

## 参考的开源主页

2026-10-12 阅读以下项目当前 README，只借鉴展示组织方式，没有复制文案、图片、代码或引入依赖；它们的功能、许可证和适配范围不作为本插件能力。

| 项目 | 主页做法 | 本仓库采用 |
| --- | --- | --- |
| [Excalidraw](https://github.com/excalidraw/excalidraw/blob/master/README.md) | 产品展示靠前，编辑器与应用能力分开说明 | 当前版本真实界面，明确插件与 DSH Agent 的职责 |
| [tldraw](https://github.com/tldraw/tldraw/blob/main/README.md) | 简短定位，文档／示例／上手入口突出 | 标题与首屏更短，提供下载、指南、静态图入口 |
| [Cline](https://github.com/cline/cline/blob/main/README.md) | 一句话定位，不同入口给出具体下一步 | 从草图起步的三个步骤，原生聊天仍为主入口 |
| [Dyad](https://github.com/dyad-sh/dyad/blob/main/README.md) | 展示、少量特性和下载优先，社区入口集中 | 短交互动图、三种协作方式与单一反馈入口 |

这是展示结构参考，不是 Star 增长实验；没有可量化的增长结论。

## About 设置

本轮更新仓库设置时，GitHub API 返回 `HTTP 403: Resource not accessible by integration`。因此 About/Topics **尚未自动写入**；以下是可由仓库所有者在主页右侧 About 齿轮处填入的内容。

Description：

```text
DSH 原生可视化协作：画草图、锚点批注、确认修改。Draw, discuss and approve edits with DeepSeek Harness + Excalidraw.
```

Website：

```text
https://github.com/Amadeus2027/dsh-sketch-reference/releases/latest
```

Topics（每项单独添加）：

```text
deepseek
deepseek-harness
dsh
excalidraw
ai-agent
visual-collaboration
human-in-the-loop
ui-design
pptx
typescript
```

原 About 介绍是“DeepSeek Harness 手绘参考板插件，支持自由绘图、原生视觉建议和参考图输入。”，Website 为空，Topics 未设置。没有改动仓库权限、可见性或发布设置。

## 主页内容边界

- 当前素材保留 v0.6.3 拍摄来源；v0.6.4 仅作宿主兼容修复，没有重设计界面。
- v0.6.4 支持两版 Web 宿主；v0.6.3 的原包门禁失败仍作为历史记录保留在 [兼容说明](dsh-compatibility.md)。
- 当前 UI 截图与历史真实模型应用案例分开展示，版本、来源和验证范围可追溯；不把固定测试批注写成真实模型效果。
- 增加 Star 关注入口及问题反馈入口，未代用户到 DSH 社区发帖，也没有发送推广消息。
