# 终末地工厂配平

Vite + React + TypeScript 静态前端。使用 TensorFlow.js 在 Web Worker 内反向传播，对配方的连续运行速率求解。画布支持拖动、缩放和节点移动；侧栏可设置多个净输出目标与外部原料约束。

```bash
npm install
npm run dev
npm run build
```

配方快照来自 [IndustrialPlanner](https://github.com/hsyhhssyy/IndustrialPlanner) 提交 `0dc1269fd7188d1236ece61a46afdd064b7440be` 的注册表。`src/data/registry.json` 包含 135 个物品、189 条配方；按 `container-item:` 标签排除装液体或气体的瓶、罐。消耗这类中间容器的配方会被展开为消耗对应的空瓶/罐与液体/气体，保留最终成品链路；展开后纯搬运或装拆容器的零净变化配方会被移除。无输入的采集配方折叠成原料外部输入，便于设置供给约束。普通空瓶、空罐和食品罐头保留。重导入时，将上游仓库放在项目根目录的 `.source-IndustrialPlanner`，运行 `node scripts/import-registry.mjs`。

单位统一为每分钟。配方速率表示以原配方周期连续运行的设备当量，可取小数。求解为软约束优化，结果页会报告未达到容差的目标、原料与物料守恒约束；布局和实际物流节拍需另行在仿真器校验。

