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

源码 ZIP 包包含全部项目文件，可用于浏览和构建；bundle 另含提交历史。安装插件只需要 tgz。GitHub Actions 会在构建成功后保留安装包 artifact，详见仓库 Actions 页面。
