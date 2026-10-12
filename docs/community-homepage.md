# 社区展示与仓库 About

主页采用中文默认入口与英文 README，首图展示正式 v0.6.3 安装包的当前画板与原生聊天，草图只包含三个自由笔迹区域和三处中文标注。首图未调用模型；折叠区的批注菜单使用明确标注的固定测试响应，不作为真实模型证据。图片为未经编辑的浏览器截图，详见 [拍摄来源](assets/v0.6.3/README.md)。

旧版插件界面不再作为主页主图。历史网页/PPT 案例与截图保留在原证据文档中，应用由 DSH Agent 生成，插件提供视觉上下文，不把案例结果包装成内置生成器。

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

- 展示正式 v0.6.3，不改变代码、版本号、依赖或发布包。
- 推荐固定 DSH alpha.1；最新 alpha.2 的默认安装门禁问题只记录为 [兼容说明](dsh-compatibility.md)，不在本轮做适配。
- 当前 UI 截图与历史真实模型应用案例分开展示，版本、来源和验证范围可追溯；不把固定测试批注写成真实模型效果。
- 增加 Star 关注入口及问题反馈入口，未代用户到 DSH 社区发帖，也没有发送推广消息。
