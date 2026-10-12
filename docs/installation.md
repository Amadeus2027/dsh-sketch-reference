# 安装与发行

## 预构建包安装

插件编辑器、React 绘图运行代码、Excalidraw 和九个字体族都在预构建 tgz 里。**不要单独安装 Excalidraw，也不用克隆仓库或运行构建。** 仅宿主 Zod 依赖由 DSH 官方插件管理器按声明解析安装；不增加模型服务或独立密钥。

使用 DSH Web `0.2.1-alpha.1` / `0.2.1-alpha.2` 和可用的官方插件管理器。已保存并退出宿主后：

```sh
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.6.5.tgz
dsh web
```

第一条命令一次安装插件与声明的运行依赖，第二条只是启动宿主。保留原有 profile、存储与浏览器数据；不要使用版本豁免或删除草稿。Windows 可将路径写为带引号的完整文件名，包含空格的路径始终加引号。

DSH npm CLI 两个固定版本本身会调用 pnpm。仅有 Node 和 CLI、PATH 没有 pnpm 时，官方命令会以 127 失败；这是实测的宿主前置。插件尚未安装时无法替宿主启动它自己的安装器，不能据此承诺所有 DSH 分发形式完全没有包管理器前置。若宿主提示 pnpm 不存在，按官方宿主说明补齐，不另装 Excalidraw。不要把已安装开发依赖的验证环境当成“完全没有包管理器”的证明。

## 来源与校验

- **ZIP 方式保留**：在对应版本提交或 PR 的成功 CI 页面，下载 Artifacts 下的 `dsh-sketch-reference-installable` ZIP。解压后得到 `.tgz` 和同次构建的 `SHA256SUMS.txt`，再按上方命令安装 `.tgz`。这是预构建包，无需构建源码或另装 Excalidraw；下载 CI artifact 通常需要登录 GitHub，过期产物需选择仍有效的构建。
- **正式发布直接下载**：从 GitHub Releases 下载版本化 `.tgz` 与同次构建的 `SHA256SUMS.txt`，使用相同安装命令。
- **源码 ZIP 目录安装**：通过仓库 Code → Download ZIP 或 Release 的 Source code ZIP 下载源码。解压后安装依赖并构建，再直接将项目目录加入 DSH，步骤见下方。不需要先打成 `.tgz`。
- 尚未正式发布时，不使用不存在的 npm 包名或 Release URL。
- CI 和本地 pack 可能具有不同归档元数据，校验必须与实际下载来源的清单配对，不能拿另一包的 SHA256 套用。

DSH 官方插件管理器也接收 tgz URL；正式 v0.6.5 Release 的资产存在后可用：

```sh
dsh plugin --profile web add https://github.com/Amadeus2027/dsh-sketch-reference/releases/download/v0.6.5/dsh-sketch-reference-0.6.5.tgz
```

HTTP URL 依赖安装已在本地隔离服务器验证；这不是未发布 GitHub URL 的下载通过证明。安装过程中保留 pnpm 的输出；网络或兼容检查失败时不宣称已安装。

## 从源码 ZIP 目录直接安装

下载 [main 源码 ZIP](https://github.com/Amadeus2027/dsh-sketch-reference/archive/refs/heads/main.zip)，或在对应 Release 下载固定版本源码 ZIP。解压并进入包含 `package.json` 的项目目录，再运行：

```sh
pnpm install --frozen-lockfile
pnpm run bundle
# 保存草图并退出正在运行的宿主，再加入项目目录
dsh plugin --profile web add "/绝对路径/dsh-sketch-reference-main"
dsh web
```

Windows 的目录安装示例（在同一源码目录完成前两步后执行）：

```powershell
dsh plugin --profile web add "C:\DSH Plugins\dsh-sketch-reference-main"
dsh web
```

传给 `add` 的是解压后含 `package.json`、`cordis.patch.yml` 和已构建 `lib` 的项目根目录，不是 ZIP 文件，也不是 `src` 子目录。官方 CLI 将它登记为本地 `link:` 依赖；这种源码目录方式不需要 `pnpm pack`。不要改写 profile 配置或豁免版本校验。

此方式需要 Node 与 pnpm 源码构建环境；Excalidraw 作为项目依赖由 `pnpm install` 获取，不要求提前单独安装。`main` ZIP 随开发更新，需要复现固定版本时选用对应 tag 或提交的源码。

**目录保留与升级：** DSH 运行时使用该目录中的构建结果和依赖。请保留整个项目目录，不能安装后删除或随意移动。更新同一目录源码后，先退出宿主，重新执行 frozen install 和 bundle，再启动；改用新解压目录时重新执行官方 `add`。始终保留原 profile、存储与浏览器数据，不删除草稿。

如需验证或分发归档，可另外运行 `pnpm run typecheck`、`pnpm test`、`pnpm run verify:distribution` 和 `pnpm pack`，再按预构建包方式安装生成的 `.tgz`。这是可选分发步骤，不是源码目录加入 DSH 的前置。

## 发布者检查

`pnpm run bundle` 构建预编译编辑器并复制字体、保留许可证。`pnpm pack` 的 prepack 必须通过 `build/check-distribution.mjs`：检查宿主和客户端入口、编辑器 JS/CSS、字体与许可，拒绝残缺包，不在用户安装时执行构建。此检查可直接针对解开的 tgz 目录复验：

```sh
node build/check-distribution.mjs /路径/解包后的package
```

CI 执行 frozen install、typecheck、单测、bundle、pack，自动生成与 tgz 配对的 SHA256 清单并上传产物。正式发布时，把这两个文件作为同一次构建的资产上传；发布后再核对默认 URL 安装。当前没有 npm 发布凭据或新版本 Release 上传完成记录，不能把文档命令当成正式发布。

卸载前保存并退出宿主：`dsh plugin --profile web remove dsh-sketch-reference`。卸载不会主动清空草稿或宿主附件，也不作热卸载保证。
