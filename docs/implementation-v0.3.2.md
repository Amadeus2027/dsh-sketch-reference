# 0.3.2 实现记录（历史摘要）

2026-10-09，基于 #8 main `bdb5d5c`。当时为待 Windows／真实模型验收的候选版。[压缩前协议、复用审计与模块清单](https://github.com/Amadeus2027/dsh-sketch-reference/blob/114f3bf4ede6230c9bcabbd4a1eec13a72129b22/docs/implementation-v0.3.2.md)

该阶段完成：

- 主动准备全图／重点 PNG，保存 owner、revision、sceneDigest 与原生附件引用；关闭画板后 `sketch_read_image` 仍可按版本读取。
- 全图／重点各保留最新引用，最多 1,000 条／2 MiB 元数据；这不包含历史附件二进制，也不证明图像语义与场景相同。
- 重点与图片过期时拒绝读取，不静默回退全图；同快照复用 PNG，原生附件发送可独立使用。
- SSE 退休连接丢弃迟到回调、单次提示断开并手动恢复；没有后台轮询。旧提议显示需重新生成，最终仍由 CAS／幂等保护。
- 沿用 Excalidraw `0.18.1` 公开选区、导出、场景更新和撤销；仅参考 tldraw 选区导出设计，不复制其 SDK。来源见 [复用说明](../REUSE.md)。

当时搁置复杂绑定、自由角度箭头创建、跨刷新撤销等，不据此判断后续版本；当前范围见 [使用指南](usage.md)。历史断开提示超时未稳定归因，新增保护不等于已经证明唯一根因。

工程测试与脚本模型只证明协议。保留 [阶段验证](validation.md)、[性能采样](benchmarks/workflow-v0.3.2.md)、[Windows 清单](windows-acceptance-v0.3.2.md) 及后续 [真实 DS 记录](windows-validation-v0.3.2-ds30-20261009.md)；没有真实 Token 节省结论。
