# 复用与改动说明

本项目原创部分包括会话草稿仓库与 CAS、恢复队列、受限 DS 视觉建议服务、图片/建议跨 iframe 接续、面板状态和用途输入。

## Excalidraw

`vite.config.ts` 在构建时仅将 Excalidraw 无条件附加的 esm.sh 字体后备地址替换为同源地址，避免离线 CSP 错误；没有改动绘图算法。

`@excalidraw/excalidraw` 0.18.1 提供画笔、形状、文本、撤销与图像导出。不是本项目开发的绘图引擎。MIT；字体还包含 OFL 等许可，完整文本见 `third_party_licenses` 与 `THIRD_PARTY_NOTICES.md`。

## dsh-diagram

来源：https://github.com/hanzhangzzz/dsh-diagram/tree/v0.6.1 ，提交 `ea4279ef9a9b6a1751d1a06930ff4c140cd02f38`，MIT，原始许可位于 `third_party_licenses/external/dsh-diagram-LICENSE`。

改编文件：`src/core/scene.ts`（从场景契约提取，删除语义布局相关内容）、`src/host/static.ts`（改变资产前缀）、`build/client-bundle.ts`、`build/copy-excalidraw-fonts.mjs`、`build/generate-third-party-notices.mjs`；字体许可文件和包的许可例外文本也据其清单复用。新增依赖缺失的 fastdom/strictdom 许可从各自 GitHub README 的 License 节提取；来源记录在生成脚本中。上游 README 来源未固定至发布标签，许可来源核查仍应随升级复查。

## DeepSeek Harness

来源：https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1 ，提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，MIT，原始许可位于 `third_party_licenses/external/deepseek-harness-LICENSE`。

`tests/browse-picker.overlay.yml` 改编自官方 Web 自动化测试覆盖层。

`src/client/ConversationWidthControls.tsx`、`ConversationRoot.module.css` 来自官方会话组件，前者修改为分栏宽度约束。`SketchShell.tsx` 的会话阶段计算依据官方 `ConversationMainPanel`。附件桥针对这个版本控制器已导出的 `createDrafts/releaseDraftAttachment` 适配，不代表所有 DSH 版本均有相同接口。

修改这些复用文件时保留上游归属；未来升级需要重新检查接口、许可证和回归。生成的第三方清单保守涵盖运行时依赖树，部分包属于未执行的动态可选能力。
