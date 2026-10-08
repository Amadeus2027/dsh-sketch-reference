| 指标（耗时为中位数及范围） | 0.2.1 | 0.3.0 |
| --- | --- | --- |
| 首次打开 · 3 样本 | 435.7 (420.4–440.6) ms | 452.3 (425.6–493.8) ms |
| 关闭重开 · 15 样本 | 259.2 (234.9–329.5) ms | 276.0 (229.7–375.7) ms |
| 首次 PNG 导出 · 3 样本 | 85.6 (78.3–94.0) ms | 81.1 (66.9–83.8) ms |
| 相同场景再次导出 · 6 样本 | 56.8 (45.3–59.7) ms | 57.1 (48.1–59.2) ms |
| 保存 HTTP 往返（不含 debounce） | 29.2 (20.7–54.2) ms | 34.4 (29.8–46.7) ms |
| 连续三次 PNG 实际光栅化 | 1 | 1 |
| 编辑 50 帧的恢复写入 | 9 | 9 |
| 编辑帧间隔 P95 · 三轮的中位数 | 22.9 ms | 23.1 ms |
| 绘图区（无批次/提示） | 786×863 px | 786×863 px |
| 插件客户端（未压缩） | 138,080 B | 138,080 B |
| 打开前编辑器请求 | 0 | 0 |
| 深色主题同步 | 通过 | 通过 |

条件与局限见 [Agent 协作说明](../agent-collaboration.md#性能基线与限制)。原始记录：

- [baseline 1](performance-agent-baseline-1.json)
- [baseline 2](performance-agent-baseline-2.json)
- [baseline 3](performance-agent-baseline-3.json)
- [final 1](performance-agent-final-1.json)
- [final 2](performance-agent-final-2.json)
- [final 3](performance-agent-final-3.json)
