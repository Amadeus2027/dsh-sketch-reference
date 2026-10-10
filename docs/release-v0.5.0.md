# v0.5.0 · Agent 参与设计

真实 DeepSeek 在固定源码快照与隔离 DSH 中自主研究、使用插件并提出建议，Codex 验证后实施。原始记录与环境边界见 [协作记录](agent-led-development-v0.5.0.md)。

- 修改提议用固定宿主支持的 `oneOf` 区分创建图形、创建文字、移动、缩放和删除，拒绝多余字段；数量、UUID、跨字段条件明确写入参数描述。
- 元素详情增加 `allowedOperations`，与操作准入复用规则。自由笔迹的 `editRestriction: none` 不再容易被误读为可以缩放。
- 重点读取的场景/批注计数仅统计当前可见范围，避免透露选区外规模。保留历史字段名 `sceneTotalElements`，其 focus 值现在为重点内计数；`annotations.count` 为未忽略且在范围内的数量，新增 `annotations.scope`，分页/体积截断仍由原有字段表达。
- Zod 参数失败提供简洁中文恢复指引；域错误、版本冲突和取消仍保留原始语义。不会放松验证、自动重试或重复提交成功操作。
- 声明 DSH `presentResult` 回调，但固定版本 Web 走独立的 keyed toolview，并未直接消费此回调。真实 Web 卡片仍保留原始工具详情；**不宣称 Web UI 已简化**。没有为此隐藏卡片、修改模型结果或扩展独立渲染体系。
- 补充稳定输出字段的运行时/PTC 契约；普通 native 模式不会把 output schema 发给模型，因此模型可见的结果键仍通过工具描述说明。

不升级依赖、不增加工具或模型请求，不改变用户确认、CAS、选区重点、场景保存和撤销机制。审批替换、读取并发、工具可见性重构暂缓，缺少足够实测收益。旧批注 UUID 及状态更新经测试正常，未按错误建议改动。

typecheck、18文件159项测试（保留原148项）、bundle、pack 均通过。两轮安装后的真实 DeepSeek 复审、批注追问/纠正/修改、预览确认撤销、focus过期拒绝与关闭画板读图、原生布局 A/B 和390px窄屏已验证。完整范围见 [Windows 验证](windows-validation-v0.5.0-20261010.md)。

仍有限制：`MALFORMED_RESPONSE` 未归因；隔离宿主实时主题按钮切换未成功，启动深浅渲染正常；Web `presentResult` 未生效；本轮未覆盖 arrow create 实机确认或全部历史浏览器套件。没有宣称全部问题解决、生产延迟改善或 Token 节省。提供 PR，由维护者合并，不自动发布 Release。
