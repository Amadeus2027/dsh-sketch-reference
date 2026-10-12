# DSH Sketch Reference 0.6.4

本次让同一个插件包支持 DSH Web `0.2.1-alpha.1` 与 `0.2.1-alpha.2`，保留 Excalidraw `0.18.1`、React `18.3.1` 和既有模型调用方式。

## 改动

- 15 个 DSH peer 包从精确 alpha.1 改为 `0.2.1-alpha.1 || 0.2.1-alpha.2`，只接受这两个版本；无需 `allow-version`。开发依赖与 lockfile 仍固定 alpha.1，不升级无关依赖。
- 修复 alpha.2 默认字体串导致主题同步整批被拒绝的问题。实机浏览器中默认计算字体为 296 字符，旧上限是 256；字体上限改为 1024，颜色仍为 256，继续拒绝 CSS 注入与 URL。限制集中在公共 `APPEARANCE_LIMITS`。
- 保留不可变 `SessionHeader` 的 owner。alpha.2 有效 `workingDirectory` 是执行目录投影，不替换草图存储键；同一会话切换执行目录不会清空草图或串用其他会话。
- 不改变草稿、批注、提议、视觉引用存储域与版本、RPC 协议、CAS、恢复及撤销机制；不运行数据迁移或清空。
- 补充会话身份和长字体回归测试，新增旧版本数据升级核对／工作目录测试。更新已有浏览器脚本的状态、预览标签与异步等待，保留严格的草图、版本、附件和模型调用断言。

## 验证范围

详见 [v0.6.4 验证记录](validation-v0.6.4.md) 和 [Windows 验收清单](windows-acceptance-v0.6.4.md)。云端使用真实安装的两版 DSH、Chromium 和 Excalidraw；模型响应由隔离测试夹具提供，没有账号或真实模型调用，不作为识别效果证据。

已验证旧 v0.6.3 草图升级后的 owner、revision、两类批注及解决状态、待应用提议、PNG 缓存、视口和未发送文字保持一致。旧重点按原设计在宿主重启后重新设置；跨刷新撤销历史、跨会话待发附件恢复等原有边界没有新增保证。

Windows v0.6.4、真实官方模型、PTC／其他预设、其他插件组合及长时间运行仍需实测。安装支持不等于所有平台和模型效果已验收。

## 升级

1. 保留原有 DSH profile、工作区、存储与浏览器恢复数据；可导出 `.excalidraw` 备份。
2. 等待「已保存」并退出宿主。
3. 用当前固定宿主的 CLI 在原 Web profile 安装 `dsh-sketch-reference-0.6.4.tgz`，然后启动宿主并重开原会话。

```sh
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.6.4.tgz
dsh web
```

无需重新导入草图、配置独立密钥或修改模型服务。保留 v0.6.3 的历史兼容结论：原 v0.6.3 发布包仍只接受 alpha.1；本次支持是 v0.6.4 的能力。
