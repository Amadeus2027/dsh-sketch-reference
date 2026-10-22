# 首版技术方案（历史摘要）

2026-10-08，DSH `0.2.1-alpha.1` / Excalidraw `0.18.1`。这是首版至 0.3.0 的设计背景，不是当前待办或验收结论。[压缩前原文](https://github.com/Amadeus2027/dsh-sketch-reference/blob/114f3bf4ede6230c9bcabbd4a1eec13a72129b22/docs/technical-plan.md)

保留的架构决策：

- Cordis 宿主服务提供同源 RPC 与静态资源，独立 iframe 运行编辑器；来源、窗口、会话及 nonce 校验后建立 MessageChannel。
- 以完整会话身份、revision、mutationId 管理保存与恢复；图片、建议与分析版本对应，修改后旧建议过期。
- 原生附件／输入只准备草稿，不自动发送；复用 `llm.stream` 与已配置的官方 DS 路线，不自动切换认证。
- 场景、请求与资源受限；取消和错误不能破坏草图或伪造模型结果。

后续已实现的阶段不再列作“尚未开发”：混合分析与锚点批注见 [批注设计](anchored-comments.md)，原生化见 [集成说明](native-integration.md)，读取／批注／提议／视觉参考见 [0.3.2 摘要](implementation-v0.3.2.md)。历史尚无凭据的说明只描述当时环境，不能替代后来的真实验收。

当前功能与限制以 [使用指南](usage.md)、[0.7.0 发行说明](release-v0.7.0.md) 为准；测试证据从 [文档索引](README.md) 查阅。
