# v0.7.0 发行核对

运行源码冻结在 PR #35 合并后的 `80fa495cf8f255adc81f572419bbba8aa2822a7c`；正式化只修改 package.json 版本和当前使用／发行文档，不改 src、tests、构建脚本、固定依赖或许可。既有验证保留原始包与开发快照身份，见 [功能验收](validation-v0.7.0.md)、[最终运行代码专项检查](review-graph-performance-20261017.md)。

## 发行前

- TypeScript、25 文件／233 项单测、完整构建、发行完整性检查和 pack 通过。
- 新包内 package.json 为 `0.7.0`；431 个 lib 文件中 430 个与最终已验 `0.7.0-alpha.1` 包逐字节一致，client.js 仅两个 CSS Module 映射的键顺序不同。使用 TypeScript AST 仅规范这些映射后，其余字节完全相同；不以任意对象排序掩盖代码差异。
- 解包后再次执行 `build/check-distribution.mjs`，确认本地编辑器／字体与许可齐全；不包含 .git、node_modules、test-results 或 .env 文件。
- 发行资产包含 `.tgz`、预构建安装 ZIP 和 `SHA256SUMS.txt`。ZIP 内含同一个 tgz 和校验该 tgz 的清单；外部清单同时校验 tgz 和 ZIP。
- 源码 ZIP 保留：GitHub tag 的 Source code ZIP 解压后，frozen install、bundle，再由官方管理器 add 项目目录；不要求用户先 pack 或另装 Excalidraw。

## 发布流程

1. 合并发行 PR，等其最终提交 CI 成功；tag `v0.7.0` 指向合并后的 main。
2. 先创建草稿 Release，上传同次构建资产并核对 SHA256。
3. 发布为非预发行、设为 Latest；核对默认 `/releases/latest` 和三个资产的公开下载。
4. 下载公开资产复验清单，并用官方管理器验证正式 GitHub URL 安装。升级前保存、备份并退出宿主，保留原 profile 和存储。
5. GitHub 自动 Source code ZIP 与 main／tag 包版本一致；GitHub Latest 不等于 npm 已发布。

此轮不新增模型请求，不把历史 Windows／真实模型案例改称正式包全面复验。图上限、满载掉帧、图级撤销与跨刷新撤销等边界继续适用。

## 正式包安装核对（2026-10-17）

同一个 0.7.0 tgz 经两版官方管理器安装到新的隔离 Web profile，无版本豁免、无额外 Excalidraw 安装。两版安装的 431 个 lib 文件都与此次构建逐字节一致，包内版本确认为 0.7.0。

两版 graph-stability／native／smoke 通过：100／300、缓存版本核对、800ms 延迟、失败重试、视口与关闭重开、禁止恢复存储时普通绘图保存、主题与会话隔离、PNG／可编辑备份、原生附件／输入保留、匿名拒绝。alpha.2 另通过 fullscreen 浮动聊天／390px／分屏恢复。无真实或模拟模型调用；本次不把该安装检查写成新版完整 Windows／真实模型验收。

发行 tgz SHA256：`a0ff55dd604cdaa9de0f896776522e0908419eabbb0f9d95b912b8316579706d`。ZIP 内 tgz 与直接下载的包逐字节相同；[包身份与实装摘要](assets/v0.7.0/release-package-20261017.json) 不包含登录 URL、凭据或原始会话。

主页中英文经过 GitHub GFM 渲染，当前相对链接与折叠块配对已检查；旧版演示保留版本说明，新版主演示保持现有真实素材。
