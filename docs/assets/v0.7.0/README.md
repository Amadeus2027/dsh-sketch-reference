# v0.7.0 演示素材

2026-10-15，Windows Edge，实际 DSH Web alpha.2 安装的 v0.7.0-alpha.1 开发快照。界面保持原插件设计与宿主原生聊天。草图由 [可编辑 fixture](../../../tests/fixtures/graph-demo.mjs) 准备；网页由真实 DeepSeek 原生对话生成并纠正。

- `sketch-graph.gif`：分屏总览 → 全屏原生悬浮聊天 → 移动／收起 → Banner 细节编辑 → 返回总览。
- `agent-site.gif`：最终网页首页 → 登录 → 登录后状态 → 商品详情 → 两件商品购物车。它展示模型生成结果的浏览器验收，不包含完整模型生成过程。
- `overview.jpg`、`agent-site.jpg`：同次真实界面截图。
- `agent-site/`：实际 Agent 最终三份文件的原样副本，使用假体验账号与浏览器本地数据，不是真实商城后端。

采集方式是 CUA 在 Edge 页签内按约 4fps 保存真实浏览器画面，输入由自动化驱动。每个片段保留实际采样间隔，片段之间直接剪接，省去等待和工具调用间隔；不是操作系统连续录屏，不能推导生成耗时。GIF 仅缩放到最大 1280px、4fps 重采样和调色板量化，没有合成 UI、叠加假回复或补帧。聊天内容来自真实模型，未使用固定回答。

原始帧、时间索引和完整专用会话文本保留在本机忽略目录；每帧与成品 SHA256、片段顺序、时间和转换参数在同名 `.gif.json`。可用 `node build/graph-demo-gif.mjs timeline.json output.gif graph`（或 `site`）从本机原始帧复现。

[实测结果、失败和纠正](../../validation-v0.7.0.md)
