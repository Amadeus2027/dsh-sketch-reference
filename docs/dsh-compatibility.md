# DSH 双版本兼容

## 当前 v0.6.5

v0.6.5 沿用下述精确双版本范围，不升级宿主依赖、Excalidraw 或 React。颜色、正常线条绘制与独立安装包的本轮结果见 [v0.6.5 验证记录](validation-v0.6.5.md)；官方管理器自身的 pnpm 前置见 [安装说明](installation.md)。

2026-10-15 补齐 [Windows alpha.2 实机回归](windows-validation-v0.6.5.md)，包括官方新装、移除重启、原生聊天与画板、选区、批注、受控编辑、原生工作目录变更和 alpha.1＋0.6.3 旧数据升级。未调用真实模型，不据此更新模型理解能力结论。

## v0.6.4 建立的双版本兼容记录

同一个 v0.6.4 包支持 DSH Web **`0.2.1-alpha.1` / `0.2.1-alpha.2`**。只允许这两个精确版本，无需安装豁免；默认原生工具模式的两版实装回归与旧数据升级核对见 [验证记录](validation-v0.6.4.md)。Windows、真实模型和非默认模式仍按 [验收清单](windows-acceptance-v0.6.4.md) 验证，不扩大为全平台／全预设保证。

不是只修改声明：实装发现 alpha.2 默认计算字体串超过旧校验上限，导致主题同步整批丢弃；v0.6.4 分开限制字体与颜色，恢复实时主题同步。会话仍使用不可变 header 的 owner，新增有效工作目录不作为存储键。

草稿、批注、提议、图片引用与 CAS 协议没有迁移、重建或重置。保留原 profile，在宿主退出后安装 v0.6.4 并重开原会话。插件兼容范围不等于 DSH 自身跨版本配置／日志迁移的通用承诺。

<details>
<summary>历史：v0.6.3 原包拒绝 alpha.2 的核查记录</summary>

以下失败结论属于**原 v0.6.3 发布包**，保持原样，不替换为 v0.6.4 的通过结论。

### DSH 兼容性核查

核查时间：北京时间 2026-10-12。对象：正式发布的 Sketch Reference **v0.6.3**，未修改插件源码、package.json、依赖、构建配置或发布包。

## 结论

**v0.6.3 目前不能通过官方默认流程安装到最新 DSH `0.2.1-alpha.2`。** 在干净隔离 profile 中，原始发布包被官方插件管理器以 peerDependencies 不匹配拒绝，并回滚安装。运行兼容性没有因此得到验证，不能写成“最新版已适配”。

当前推荐固定 DSH Web CLI **`0.2.1-alpha.1`**，已有 Windows 及隔离浏览器验证。不要将 GitHub 最新预发布、npm 默认 latest 和本项目固定验收版本混为一谈。

| 渠道 / 环境 | 本次查询结果 | 证据与范围 |
| --- | --- | --- |
| GitHub 最新 DSH 发布 | `dsh-v0.2.1-alpha.2`，2026-10-09 发布，预发布 | [官方发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.2) |
| npm `alpha` | `0.2.1-alpha.2` | `npm view @deepseek-ai/dsh dist-tags --json` |
| npm `latest` / `next` | `0.2.0-rc.2` | 同一实时查询；该版本不是本插件推荐基线，本轮未在 rc.2 验证 |
| 本插件 v0.6.3 验收基线 | `0.2.1-alpha.1` | [0.6.3 Windows / 浏览器记录](validation-v0.6.3.md)；本轮不冒称重新完成这些历史验收 |
| 本轮 alpha.2 安装 | **失败：官方兼容门禁拒绝** | Linux、Node 24.19.0，独立 CLI、DSH_HOME、XDG 和新建 Web profile；无模型凭据 |

## 发布包与安装证据

- 插件源码基线：`15b6588e8b2581fa3b2947c6993f1e3baf40d530`，与 v0.6.3 tag 一致。
- 使用 [v0.6.3 Release](https://github.com/Amadeus2027/dsh-sketch-reference/releases/tag/v0.6.3) 的原始 `dsh-sketch-reference-0.6.3.tgz`，没有重打包或放宽依赖。
- SHA-256：`ad674ad93e5732eae673a02c1fd9fee1599758458d47146e82e83f1be0812fcc`，与 Release 的 SHA256SUMS.txt 一致。
- 独立安装 `@deepseek-ai/dsh@0.2.1-alpha.2` 后，用其官方 CLI 新建 Web profile 并执行 plugin add。退出码为 1。
- 管理器明确报告 `Plugin dsh-sketch-reference@0.6.3 is incompatible with dsh 0.2.1-alpha.2: peerDependencies ...`，因为 15 个 DSH peer 包精确要求 `0.2.1-alpha.1`。
- 日志确认 package.json、锁文件及 node_modules 回滚；没有开启 `allow-version` 豁免。没有启动插件运行测试、调用模型或接触日常 profile。

这证明的是**默认安装不兼容**，不是证明所有绘图或工具 API 都已经损坏。修改版本声明可能解除安装门禁，但不能单独证明完整适配；还需核对其他兼容声明及运行行为。本轮保持门禁原样。

## 上游公开接口审查

比较官方 alpha.1 commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc` 与 alpha.2 tag 指向的 commit `d743267388641bc76f17c45ce8b4c231aed1d32c`。GitHub compare 的文件列表只返回前 300 项，另用完整 Git 对象比较，避免遗漏后面的接口变化。

| 模块 | 本次看到的变化 | 对插件的判断 |
| --- | --- | --- |
| 工具 DSL | 工具模式去掉 `both`，保留 `native` / `ptc`；PTC 增加 workingDirectory 依赖，presentationMeta 可用于嵌套调用 | 插件继续通过 defineTool/register 注册原生工具，没有主动设置 both；PTC 与其他工具模式仍需独立回归 |
| 会话与工作目录 | 新增插件记录接口；新增有效 workingDirectory 投影及 change 事件，初始 SessionHeader.cwd 保留 | 插件按 header.cwd 建 owner；不能直接假设它等于会话后续有效目录。新 working_directory / worktrees 场景需核对隔离、恢复及重点失效语义 |
| LLM | 新增 configureCall 控制，保留公开模型调用结构；上游修复流空闲超时 | 静态审查未发现 stream/resolveModelInfo 被删除；真实分析、取消和准确路线能力仍待运行验收 |
| 原生客户端 | 输入焦点/子代理附件、renderer 与 chat 渲染有变化；查阅的槽位、主要会话服务和附件桥相关源文件未发现对应接口移除 | 头部适配、内容工厂 CSS、原生输入/附件桥仍有固定版本边界，必须实装验证，不能只凭类型或“文件未改”保证兼容 |

来源：[官方完整变更](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-alpha.1...dsh-v0.2.1-alpha.2)、[working-directory](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/session/working-directory/src/index.ts)、[tools](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/core/tools/src/index.ts)。

## 安装建议与后续适配门槛

现阶段社区安装示例继续明确指定 `@deepseek-ai/dsh@0.2.1-alpha.1`。已有 alpha.2 的用户不应为了安装插件覆盖自己的 DSH 数据；可以等待后续适配，或另建独立的 alpha.1 环境。本文不把风险豁免作为正常安装教程。

未来在用户授权修改运行代码后，再单独完成：

1. 核查 DSH 依赖与兼容声明，保留宿主服务实例及旧草稿兼容；只放宽版本号不算适配完成。
2. alpha.2 原包安装、基础绘图/保存/导出、真实主题和布局、会话切换/重启/卸载。
3. 原生图片、已有文字/待发附件、批注插入、取消和失败恢复；原生 Agent 工具、提议确认/撤销及 CAS。
4. working_directory / worktrees 切换、原工作目录与有效目录的关系、重点/批注/提议的隔离及过期处理。
5. Windows 实机与真实官方 DeepSeek 验收，分别记录 native/PTC、模型路线和未覆盖项；不得以固定响应替代模型质量验证。

本轮只提交主页与文档，未升级插件、发布新包或改变任何用户权限。

</details>
