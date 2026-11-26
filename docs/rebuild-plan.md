# v2 重构执行计划（12 小时）

## 时间线

| 时段 | 内容 | 负责人 |
|---|---|---|
| H0–H1 | 冻结 v1、建 `rebuild/v2`、写架构约束与检查脚本 | 石尚 |
| H1–H2 | 骨架：config、http、router、error middleware、health | 石尚 |
| H2–H7 | 四个切片并行迁移，每个切片完成即提交 | 全组 |
| H7–H9 | 前端 api-client 接入、主链路联调 | 吕柯锋 |
| H9–H10 | 回归测试、架构检查、修复 | 裘文涛 |
| H10–H11 | ADR、api.md、架构图、README 更新 | 呼垚彬 |
| H11–H12 | 打 tag `v2.0`、打包、推送、提交 | 石尚 |

## 并行分工

| 成员 | 模块 | 交付物 |
|---|---|---|
| 石尚 | auth、courses、projects | 登录、课程、项目任务拆层；骨架与组合根 |
| 吕柯锋 | teams、submissions | 组队、进度、组长移交、提交与版本 |
| 裘文涛 | reviews、checks | 互评分配与提交、组内互评、过程检查 |
| 呼垚彬 | grades、activity | 评分引擎抽到 domain、发布导出、通知与日志 |

## 每个切片的完成标准

1. 具备 `router / controller / service / policy / repository`；
2. 权限判断在 `policy.js`，不在 controller；
3. 写操作有事务边界并写过程日志；
4. 相关接口回归通过；
5. `node tools/arch-check.js` 无新增违规；
6. 单独一次 Git 提交，信息为 `refactor(<module>): ...`。

## 止损线

- H8 时未完成的模块，允许保留原逻辑，但必须有模块目录与明确的 TODO；
- 任何时刻 `node server.js` 必须可启动，`node test/api-test.js` 不允许变红；
- 若回归失败超过 30 分钟，回退到上一个绿色提交，不带着红测试继续。
