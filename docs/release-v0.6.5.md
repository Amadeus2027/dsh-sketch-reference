# DSH Sketch Reference 0.6.5

保持 DSH Web 0.2.1-alpha.1 / alpha.2 双版本范围，不升级 Excalidraw、React 或 DSH 依赖。

- 通知条和无建议摘要统一使用 DeepSeek 蓝；普通／告警、悬停及批注选中状态共用基础规则，移除旧橙色与 info 专属覆盖。告警角色、文字和重试不变。
- Excalidraw 编辑器、CSS、九个字体族随 tgz 内置；发布前检查完整性，用户无需安装 Excalidraw、React 或从源码构建。宿主依赖由 DSH 官方插件管理器处理。
- 用 Excalidraw 公开 newElement / multiElement 草稿状态跳过临时单点线条，完成后照常严格校验与保存，避免正常绘制触发错误条。
- 更新中英文主页与操作录屏来源。云端没有配置真实 DeepSeek；新画板录屏不包含生成的模型回答，完整真人／真实 Agent 录像按 Windows 录制清单补齐，不以测试夹具代替。

保存、会话 owner、CAS、模型调用、草稿与批注存储格式未改。2026-10-15 完成 [Windows alpha.2 实机验收](windows-validation-v0.6.5.md)，含原生交互、受控编辑、选区、缓存与 alpha.1＋0.6.3 旧数据升级。工程回归使用固定模型响应，不替代真实 DeepSeek 理解质量验证；其他宿主配置仍需复验。此前云端安装包验证和素材记录见 [验证记录](validation-v0.6.5.md)。

## 安装

已安装受支持 DSH 时，只需在宿主退出后执行：

```sh
dsh plugin --profile web add /绝对路径/dsh-sketch-reference-0.6.5.tgz
```

重新运行 `dsh web`。无需另装 Excalidraw。源码 ZIP 需先解压、安装依赖并构建，再按 [目录安装步骤](installation.md#从源码-zip-目录直接安装) 加入；不能直接把源码 ZIP 当成预构建包安装。尚未发布 npm 包时不要使用无版本的 npm 包名安装命令。
