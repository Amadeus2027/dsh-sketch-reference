# DSH 手绘参考板

在 DeepSeek Harness 会话中画草图、保存可编辑版本，用官方 DeepSeek 视觉模型获取建议，再把指令和参考图加入原生聊天输入框。主要场景是用草图描述网页布局。

**状态：0.1.0 可安装初版，绘图/保存/导出/原生参考附件已在真实 DSH Web 验证。** 锁定 2026-10-08 最新发布的 DSH `0.2.1-alpha.1`（预发布版）。真实模型效果需要有效 DS 配置后验收；完整比赛作品还需对照评测与提交材料。

## 安装与启动

需要 Node.js `22.19+` 或 `24+`、pnpm 和本地浏览器。首版只支持 DSH Web 绑定 `127.0.0.1`，不支持远程公开部署。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.1
# 先运行一次，初始化官方 web profile
dsh web
# 退出宿主后，从下载的 tgz 安装
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.1.0.tgz
dsh web
```

从源码构建：

```sh
git clone https://github.com/Amadeus2027/dsh-sketch-reference.git
cd dsh-sketch-reference
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm pack
```

源码开发时可用 `dsh plugin --profile web add /绝对路径/dsh-sketch-reference` 链接安装。不要将插件安装进只有 `dsh-base` 的终端 profile。

卸载：退出宿主后执行 `dsh plugin --profile web remove dsh-sketch-reference` 并重启。卸载不会主动删除草稿和宿主附件；操作前建议下载备份。

## 使用

1. 在 DSH 中选择工作区并创建会话。输入框右侧点击「参考板」。
2. 绘图并填写用途，草稿自动保存；可导出 PNG 或 `.excalidraw` 备份。
3. 配置 Harness 原有的 DS 账户或官方 API 路线，然后点击「完成并获取建议」。每次分析单独调用模型，可能产生用量；可取消。
4. 「使用建议」将指令插入原有输入框；「作为参考发送」加入 PNG 附件。最后由你点击 Harness 原有发送按钮。

加入参考图要求主聊天选择官方 `DeepSeek Flash` 图片模型。插件不会替你切换模型或自动发送。没有 DS 配置时仍可绘图、保存和导出；不会产生虚构建议。

建议固定对应生成时的草图和用途。修改后建议会标记过期，需重新获取。已加入输入框的指令仍由用户管理，换参考图前应检查是否还匹配。

## 数据与边界

- 可编辑场景保存在宿主 `sketch_reference` 存储域，按会话 ID、创建时间、工作目录隔离；每个会话保留一个草稿与最近一批建议。
- 保存采用版本比较；其他窗口抢先保存时停止覆盖，并提供本地备份与载入服务器版本。
- 失败编辑还会保存在当前浏览器的本地恢复副本。共享设备使用后请清理浏览器数据；模型请求将图片和用途发送给所选 DS 路线。
- 最多 2000 元素、场景 2MiB、PNG 2MiB、500 个草稿、草稿存储 128MiB；分析全局并发 2、每会话每分钟最多 6 次、默认超时 90 秒。
- 禁用嵌入图片与外部资源，不执行建议中的文本。字体随包提供，绘图与导出不要求连接 CDN。
- 分栏使用官方会话内容工厂；头部以固定版本的公开插槽登记信息映射到私有插槽，保留其业务接口。启动后其他插件动态增加的头部扩展目前需要重启才能映射。暂不承诺与其他替换 `main.conversation` 的插件共存。
- 模型分析产生的宿主附件由宿主管理；首版没有实现附件长期自动回收。不是训练新模型的项目。

## 比赛与复用

作品围绕 [AIC AI+开源赛道](https://www.aicomp.cn/tracks/tracks-5/4924.html) 的开源生态增强方向，新增会话内手绘输入、建议与参考图接续、版本一致性保护。绘图能力来自 Excalidraw，部分契约与构建代码来自 dsh-diagram，宿主 UI 适配来自 DeepSeek Harness。详见 [验证记录](docs/validation.md)、[REUSE.md](REUSE.md)、[技术与验收说明](docs/technical-plan.md) 和 [第三方许可证](THIRD_PARTY_NOTICES.md)。

开发过程使用 AI 辅助，比赛报告应按官方要求披露。不能把复用的画板能力或未经测量的效率提升写成原创成果。

MIT；第三方软件和字体遵循各自许可证。
