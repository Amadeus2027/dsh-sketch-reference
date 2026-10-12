# 获取源码与离线传输

首版代码已提交到 GitHub 的 `main` 分支。正常开发直接克隆仓库：

```sh
git clone https://github.com/Amadeus2027/dsh-sketch-reference.git
cd dsh-sketch-reference
```

离线传输时，可下载提供的 `dsh-sketch-reference-main.bundle`。它包含完整提交历史，使用方式：

```sh
git clone -b main /下载路径/dsh-sketch-reference-main.bundle dsh-sketch-reference
cd dsh-sketch-reference
git remote set-url origin https://github.com/Amadeus2027/dsh-sketch-reference.git
git fetch origin
```

继续开发并提交后，在自己的已登录 GitHub 环境执行 `git push -u origin main`。若远端新增提交，先 `git pull --rebase origin main`、处理冲突，再推送；保留双方改动。

源码 ZIP 包包含全部项目文件，可用于浏览、构建以及加入 DSH；bundle 另含提交历史。源码 ZIP 解压后，执行 `pnpm install --frozen-lockfile` 和 `pnpm run bundle`，再用 `dsh plugin --profile web add "/解压后的项目绝对路径"` 直接加入源码目录，无需先生成 tgz。保留该目录及构建结果，详细步骤见 [源码目录安装](installation.md#从源码-zip-目录直接安装)。GitHub Actions 也会在构建成功后保留预构建安装包 artifact。
