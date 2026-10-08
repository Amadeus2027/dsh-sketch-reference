# 将首版提交推送到你的 GitHub

当前连接读取仓库成功，但 git push 和 GitHub 写入 API 都返回 403，提示 `Resource not accessible by integration`。这是集成凭据的写权限限制，仓库对象返回的管理员标志不足以证明凭据能写代码。无需把密码或 Token 发给助手。

下载提供的 `dsh-sketch-reference-main.bundle`，在自己的电脑使用已登录 GitHub 的 Git 环境运行：

```sh
git clone -b main /下载路径/dsh-sketch-reference-main.bundle dsh-sketch-reference
cd dsh-sketch-reference
git remote set-url origin https://github.com/Amadeus2027/dsh-sketch-reference.git
git fetch origin
git push -u origin main
```

提交基于你仓库原有的 README 提交，正常情况下是向前追加。若你又提交了其他内容导致推送被拒绝，先 `git pull --rebase origin main`、处理冲突，再推送；保留双方改动。

源码 ZIP 包也包含全部项目文件，可用于浏览和构建；bundle 另含提交历史。安装只需要 tgz。仓库推送后 GitHub Actions 会构建并保留安装包 artifact。
