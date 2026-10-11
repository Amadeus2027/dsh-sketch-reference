# v0.6.0 正式发布准备

正式化基线：`main` 的 PR #15 合并提交 `16719e71b33e2b7c8dd70a9e2b6272e6f7fe9e89`。

冻结运行代码：`f856f8bfcc07f40394402a7e2019e19b1aaeff05`；[rc.2 CI](https://github.com/Amadeus2027/dsh-sketch-reference/actions/runs/38103462759) 已通过。

本次只修改 package.json 版本号、README 和发布说明；固定依赖、运行源码、测试、构建脚本不变。沿用已通过的测试和实机结果，重新打包后逐文件核对 `lib/` 与冻结包一致，并检查版本、许可及敏感文件排除。没有再次发起模型请求或重复应用验证。

维护者操作：

1. 审阅并合并 `codex/v0.6.0-final-release` 的 PR。
2. 检查该 PR 的 GitHub Actions 全部成功。
3. 在仓库 Releases → Draft a new release 中新建 `v0.6.0` tag，目标选择包含该 PR 的 `main`。
4. 标题 `DSH Sketch Reference v0.6.0`，正文使用 [正式版本说明](release-v0.6.0.md)。
5. 上传正式安装包 `dsh-sketch-reference-0.6.0.tgz`。不要将 rc.2 包改名冒充正式包；内部 package.json 应为 `0.6.0`。
6. 不勾选 pre-release，确认已知限制后发布。

Codex 不自动合并、创建正式 tag 或发布 Release；需维护者依照本机 AGENTS.md 的约定执行或明确变更授权。
