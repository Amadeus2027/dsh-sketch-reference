# Sketch Graph 稳定性专项检查（2026-10-16）

基线 main `22c7969893c81217e522dce3a3bdf8540ecefc8e`，版本保留 `0.7.0-alpha.1`。按 Karpathy Guidelines 先复现、再做最小修复；未升级依赖、改变存储格式或发布版本。

## 已复现并修复

1. **合法大图保存被 413 拒绝。** `graph/save` 原先落入普通 RPC 的 16,384 字节上限。100 节点、300 条普通连线的实际请求为 79,078 字节，拖动后保存失败并进入保护性的“保存待确认”，后续节点操作受限。HTTP 回归与真实构建 UI 都在修复前复现 413。仅为图保存设置 `2 MiB + 16 KiB` 的请求上限；其他读取／批注更新仍保持小请求限制，超额图请求仍返回结构化 413。
2. **拖动／平移引发重复渲染和连接点测量。** 按节点／边本身的变化缓存 React Flow 数据，保留未移动节点引用，对缩略图使用 React memo，视口变化不重建全部缩略图与连线。坐标计算和拖动继续由 React Flow／Excalidraw 完成。
3. **普通节点连线生成未使用的额外 Handle。** 连线已经使用公共 `node` 连接点，缩略图却又逐边增加额外连接点。实装旧代码的回归确实得到 4 个 source Handle，预期为 1。仅元素／区域锚点保留独立 Handle，普通连线继续复用原生节点 Handle；没有改变关系数据或绑定语义。

## 性能实测

Linux 云端，Node 24.19.0、pnpm 11.19.0、Chromium 151.0.7922.173，1440×960。固定 Excalidraw 0.18.1 与 React Flow 12.12.0。使用生产构建、真实浏览器和 HTTP/RPC；此组服务端 KV 为隔离内存夹具，不代表 DSH 实装或真实模型。

`tests/browser-graph.mjs` 在 100 节点／300 边下执行连续拖动和缩放，保存增加 800ms 延迟，核对最终节点位置／视口、刷新、断请求后的重试及再次拖动。

| 同场景观测 | 渲染优化前（先修复请求上限） | 最终修复 |
| --- | ---: | ---: |
| P95 requestAnimationFrame 间隔 | 216.6 ms | 150.0 ms |
| 最大帧间隔 | 399.9 ms | 216.7 ms |
| 采样期间 Long Task 数 | 125 | 82 |
| 服务端最大并发图保存 | 1 | 1 |

这是一组云端样本，不能推导 Windows 帧率或稳定改善百分比。性能采样期间未并行构建或运行其他浏览器回归；首次与构建并行的采样不用于上表。另一次 CPU 采样用于定位更新连接点、缩略图请求和 SVG 测量的开销，不与无采样的结果混作对照。

**仍有明显的大图掉帧。** 最终满载样本不符合流畅 60fps；没有把“操作和保存成功”写成“不卡顿”。本次范围内未复现永久卡死或保存队列死锁，不承诺任意复杂草图、全部上限组合或长期运行都无问题。

## 自动检查与实装验收

- `pnpm run typecheck`、24 文件／222 项单测、生产构建、`pnpm pack`／发行检查及 `git diff --check` 通过，原 220 项测试保留。
- 两版官方 DSH Web alpha.1／alpha.2 均通过最终包实装的 100 节点／300 边拖动、800ms 延迟保存、中断重试、再次拖动、关闭重开与原生输入保留；真正停止并重启宿主后，原图记录及根草稿逐项深比较一致，再次操作通过。
- 两版均通过现有 `fullscreen`、`native`、`smoke`：同一原生 composer／iframe、悬浮对话拖动／收起、390px 限位、主题同步、反复开关、会话切换、恢复存储被阻断时普通草图保存、PNG／可编辑草稿导出、原生附件及去重、匿名拒绝。
- 最终实测 tgz SHA256：`90fd86e4144d3b013589551ee5222ae6f204d12ac670fbedd1f9797c7e1297b6`，16071033 字节；两版实际安装的 **430** 个 lib 文件与本轮构建逐字节一致。CI 重新打包时使用其自己的校验清单。

实装测试使用两个全新隔离 Web profile，官方管理器安装同一个 tgz，不加载模型夹具，真实模型调用 **0**。新测试 `tests/browser-graph-stability.mjs` 使用真实 DSH、Excalidraw、React Flow、存储和原生聊天输入；800ms 延迟和中断来自浏览器路由注入，不冒充真实网络故障或模型超时。

alpha.2 普通 Excalidraw 画板另测 250 个矩形、每种手势 50 帧：平移 P95 帧间隔 **18.5ms**、0 次保存／备份；连续修改 P95 **39.2ms**、最终位置正确、合并为 **1** 次保存。两段未观察到 Long Task。首次打开 **688.2ms**，5 次重开 **375.3–730.3ms**；保存 HTTP **18.0／68.4ms**（不含防抖），3 次 PNG 导出只栅格化 **1** 次。属于本轮单机记录，不与历史 Windows 数值比较。

页面堆从约 47.5MB 到 5 次重开后约 80.8MB；没有强制 GC 或长时堆快照，不能据此判断无泄漏或认定泄漏。实测专用宿主已停止。脱敏数值、满载 Long Task 和实装测试摘要见 [原始数值汇总](assets/v0.7.0/stability-cloud-20261016.json)。

## 复现方法

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bundle
pnpm pack
CHROMIUM_PATH=/usr/bin/chromium pnpm run test:browser:graph
```

上条浏览器命令启动自己的隔离 RPC/KV，不要求模型账号。可用 `DSH_GRAPH_PROFILE=1` 另外生成本地 CPU profile。

实装检查先在专用 profile 安装同次构建 tgz，设置 `DSH_SMOKE_URL`、`DSH_TEST_WORKSPACE`、`DSH_TEST_OUTPUT` 和 `CHROMIUM_PATH`：

```sh
pnpm run test:browser:graph-stability
# 真正停止并重启同一宿主后，更新 URL，保留相同输出目录
DSH_GRAPH_VERIFY=restart pnpm run test:browser:graph-stability
pnpm run test:browser:fullscreen
pnpm run test:browser:native
pnpm run test:browser
pnpm run test:performance
```

Windows 使用对应的 PowerShell 环境变量语法和 Edge 路径。本轮为 Linux 实测，不将脚本可在 Windows 配置运行视为 Windows 已验收。

## 测试中的失败与限制

原始 413 与未使用 Handle 的失败日志均保留。新实装测试还曾将 CSSOM 的 `translate(150.312px, 80px)` 与存储的 `x=150.3125` 按 0.00001 像素比较，错误报告视口丢失；实际是浏览器序列化舍入。测试现在允许 0.001 CSS 像素误差，缩放仍按 0.00001 比较，服务器记录及重开／重启后的数据仍深比较；没有为通过测试修改插件坐标逻辑。

测试 URL、原始日志、CPU profile、包和测试场景只留在忽略目录及独立临时目录，不上传认证链接或私人数据。真实模型、Windows／Desktop、长期堆内存和全部复杂大图仍未在此轮复验。
