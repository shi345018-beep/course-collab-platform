# 系统架构说明（v2 重构基线）

- 项目：高校课程协作与评审平台
- 小组：第六组
- 版本：v2.0 架构基线
- 基线提交：`v1.0`（tag，对应 v1 可运行系统）
- 适用范围：`rebuild/v2` 分支

## 0. 架构决策（已冻结）

以下八项由架构负责人确定，团队按此实施；未经 ADR 不得更改。

| 编号 | 决策 | 依据 |
|---|---|---|
| D-1 | 模块化单体，单进程部署 | 课程规模小，微服务只会增加运维成本 |
| D-2 | 四层结构：http → controller → service → domain/repository | 需要可检查的依赖边界 |
| D-3 | 领域规则（评分、贡献系数、状态机）为纯函数，不做 I/O | 可单测，可复用，可解释 |
| D-4 | 仓储接口隔离存储，本次保留 JSON 实现 | 12 小时内切换数据库风险过高 |
| D-5 | 零第三方依赖，只使用 Node 内置模块 | 评分环境可能无 npm / 无外网 |
| D-6 | HTTP 契约与 v1 完全一致，前端不改接口 | 让 20 项既有测试成为回归护栏 |
| D-7 | 按业务模块垂直切片迁移，禁止大爆炸重写 | 任何时刻都必须有可运行版本 |
| D-8 | 前端只通过 `api-client` 访问后端（迁移中） | 收敛调用点，便于统一处理 token 与错误 |

**允许变更的条件**（只有这三种情况需要组内重新确认）：

1. 必须删减已承诺的功能；
2. 必须修改既有接口契约；
3. 剩余时间不足以完成当前切片。

## 1. 目标与范围

v1 已经具备完整业务闭环，但 `lib/api.js` 单文件同时承担路由、权限、业务规则、状态判断与数据访问，无法支撑后续扩展，也无法作为架构设计的证据。

v2 的目标不是重写业务，而是把 v1 的规则搬迁到可验证的结构中，并保持三件事不变：

1. HTTP 接口路径与响应格式不变（`{ code, data, message }`）；
2. 前端界面与交互不变；
3. 20 项现有接口测试必须继续通过。

因此 v2 采用渐进式重构（strangler pattern），按模块垂直切片迁移，系统在整个过程中保持可启动、可演示。

## 2. 架构驱动因素

| 来源 | 驱动因素 | 对架构的影响 |
|---|---|---|
| 课程要求 | 需要清晰的分层与模块边界 | 采用模块化单体，显式依赖规则 |
| 现有系统 | 已有 10 个业务模块与完整规则编号 | 以业务模块为切分单位，而非技术层 |
| 运行环境 | 课程机器可能缺少 npm、网络受限 | 零第三方依赖，只使用 Node 内置模块 |
| 交付节奏 | 12 小时内完成重构并提交 | 垂直切片、每步可运行、测试护栏 |
| 数据规模 | 单课程、百人以内 | 保留 JSON 存储，以仓储接口隔离 |

## 3. 架构决策摘要

- **模块化单体**：一个进程、一个部署单元，内部按业务模块划分，避免微服务的运维成本。
- **四层结构**：HTTP 接入层、控制器层、业务服务层、领域与数据层。
- **领域纯函数**：评分、贡献系数、状态转换规则不依赖 I/O，可独立单测。
- **仓储隔离**：业务层只依赖仓储接口，JSON 实现可替换为 SQLite 而不改服务层。
- **契约优先**：接口与响应格式保持 v1 兼容，前端零改动即可联调。

详见 `docs/adr/`。

## 4. 架构约束（C1–C10）

约束必须可检查，不能只写在文档里。`tools/arch-check.js` 会在每次提交前运行。

| 编号 | 约束 | 检查方式 | 当前状态 |
|---|---|---|---|
| C1 | 依赖单向：http → controller → service → domain/repository | 脚本扫描 import 方向 | 强制 |
| C2 | domain 层不得引入 fs、http、db 等 I/O | 脚本扫描 domain 的 import | 强制 |
| C3 | 权限判断集中在 `policy.js` 纯函数 | 代码评审 + 单测 | 人工 |
| C4 | 状态流转使用显式状态机（ST-xx），禁止散落 if | 单测逐条覆盖 | 人工 + 测试 |
| C5 | 统一错误模型 `{ code, message }`，单一错误中间件 | 集成测试断言 | 强制 |
| C6 | 每个写操作有事务边界，并写入过程日志 | 代码模板 + 测试 | 人工 + 测试 |
| C7 | 接口契约稳定，v1 的 20 项测试原样通过 | 回归测试 | 强制 |
| C8 | domain 单测 + API 集成测试，提交前必须全绿 | 测试脚本 | 强制 |
| C9 | 零第三方依赖 | package.json 与 import 扫描 | 强制 |
| C10 | 前端只通过 `api-client` 访问后端 | 扫描 `public/` 的 fetch 调用 | 迁移中 |

## 5. 目标目录结构

```
src/
  app.js                  组合根：装配配置、仓储、路由
  config.js               端口、数据目录等运行配置
  http/
    server.js             监听与静态资源
    router.js             路由注册与匹配
    middleware/           auth、error、validate、logging
  modules/
    auth/                 登录、登出、当前用户
    courses/              课程与成员
    projects/             项目任务与迭代
    teams/                组队、进度、组长移交
    submissions/          成果提交与版本
    reviews/              组间互评、组内互评
    checks/               助教过程检查
    grades/               教师终评、发布、导出、申诉
    activity/             通知与过程记录
  domain/
    grading.js            维度折算、权重、贡献系数
    state-machine.js      状态与转换（ST-xx）
    rules.js              可复用的业务判定
  infra/
    db/                   JSON 仓储实现
    clock.js              可注入时钟（便于测试截止逻辑）
    ids.js                ID 生成
    logger.js             结构化日志
```

每个模块内部结构一致：

```
modules/<name>/
  router.js        路由与 HTTP 映射
  controller.js    参数解析、调用 service、返回结果
  service.js       业务编排与事务边界
  policy.js        权限判定（纯函数）
  schema.js        入参校验
  repository.js    数据访问（依赖仓储接口）
```

## 6. 依赖规则

允许的依赖方向（箭头表示可以 import）：

```
http ──> modules/*/controller ──> modules/*/service ──> domain
                                      │
                                      └──> modules/*/repository ──> infra/db
```

禁止：

- `domain` 引用 `http`、`modules`、`infra`；
- `http` 直接引用 `repository`；
- `repository` 引用 `service`、`controller`、`http`；
- `modules` 反向引用 `http`；
- 任何文件引入第三方 npm 包。

## 7. 模块边界

| 模块 | 职责 | 拥有的数据 |
|---|---|---|
| auth | 登录、token、当前用户 | users、tokens |
| courses | 课程、邀请码、课程成员 | courses、members |
| projects | 项目任务、评分维度、迭代阶段 | projects、iterations |
| teams | 小组、成员、进度、组长移交 | teams、teamMembers、teamIterations、transfers |
| submissions | 提交、版本、截止锁定 | submissions |
| reviews | 互评分配、组间互评、组内互评 | assignments、reviews |
| checks | 过程检查记录 | checks |
| grades | 终评、汇总、发布、导出、申诉 | teacherGrades、grades、appeals |
| activity | 通知与过程记录 | notifications、logs |

跨模块只通过 service 调用，不直接读写对方的仓储。

## 8. 领域规则与状态机

- 业务规则编号 BR-01~BR-28 与需求规格说明书一致；
- 状态转换编号 ST-01~ST-23 集中在 `domain/state-machine.js`；
- 每条转换包含：当前状态、事件、执行角色、守卫条件、目标状态、失败处理；
- 服务层只调用状态机判定，不在业务流程中硬编码状态字符串。

## 9. 权限与错误模型

- 权限判定统一为 `policy.js` 纯函数，输入当前用户、资源、动作，输出允许或拒绝原因；
- 禁止在 controller 中直接写角色 if；
- 所有错误使用统一结构：`{ code, message }`，HTTP 状态与业务码分离；
- 认证失败 401，越权 403，资源不存在 404，业务规则拒绝 400。

## 10. 数据与事务

- 保留 `data/db.json`，但只允许仓储层访问；
- 写操作通过仓储的 `transaction(fn)` 包裹：读取快照、执行变更、一次性落盘；
- 所有写操作同时写入过程记录（logs）；
- SQLite 作为后续演进方案，记录在 ADR-003，不在本次交付范围内。

## 11. 测试策略

| 层级 | 内容 | 位置 |
|---|---|---|
| 领域单测 | 评分折算、贡献系数、状态守卫 | `test/domain/*.test.js` |
| 服务测试 | 权限、截止、版本、冻结 | `test/services/*.test.js` |
| 接口回归 | 原 20 项接口测试 | `test/api-test.js` |
| 架构检查 | 依赖方向、零依赖、前端调用点 | `tools/arch-check.js` |

## 12. 迁移策略

1. 冻结 v1：tag `v1.0`，保留可运行版本；
2. 建骨架：http、config、router、error middleware；
3. 垂直切片迁移：auth → courses/projects → teams → submissions → reviews → checks → grades → activity；
4. 每迁移一个模块，跑一次 20 项回归；
5. 前端只替换数据访问层（`api-client`），页面不动；
6. 全部通过后打 tag `v2.0`。

## 13. 验收标准

- `node server.js` 可启动，`node test/api-test.js` 20 项通过；
- `node tools/arch-check.js` 无违规；
- 每个模块具备 router/controller/service/policy/repository 文件；
- `docs/adr/` 至少 4 份决策记录；
- v1 的接口路径与响应格式保持不变；
- Git 历史能看出分阶段迁移，而不是一次性提交。

## 14. 决策边界

| 事项 | 由谁决定 | 当前结论 |
|---|---|---|
| 分层、模块划分、目录结构 | 架构负责人 | 已冻结（D-1、D-2） |
| 存储选型 | 架构负责人 | 本次 JSON，接口预留 SQLite（D-4、ADR-003） |
| 接口契约 | 架构负责人 | 与 v1 保持一致（D-6、ADR-004） |
| 前端框架 | 架构负责人 | 不引入，仅抽 api-client（D-8） |
| 单模块内部实现细节 | 模块负责人 | 在约束内自主决定 |
| 删功能、改契约、延期 | 全组确认 | 触发条件见第 0 节 |

## 15. 迁移结果

| 模块 | 迁移状态 | 关键文件 |
|---|---|---|
| auth | 已完成 | `src/modules/auth/` |
| courses | 已完成 | `src/modules/courses/` |
| projects | 已完成 | `src/modules/projects/` |
| teams | 已完成（含组长移交） | `src/modules/teams/` |
| submissions | 已完成（含截止与版本） | `src/modules/submissions/` |
| reviews | 已完成（组间 + 组内） | `src/modules/reviews/` |
| checks | 已完成 | `src/modules/checks/` |
| grades | 已完成（含发布、导出、申诉） | `src/modules/grades/` |
| activity | 已完成 | `src/modules/activity/` |

补充：`dashboard` 为跨模块读模型，`domain/grading.js` 为纯函数评分引擎。

**验收结果**：`tools/arch-check.js` 0 错误 0 警告；`test/api-test.js` 20 项全部通过；`server.js` 已切换为 v2 入口。

## 16. 迁移中修复的问题

课堂实践发现 v1 的互评分配会为**历史版本**也创建评审任务，而成绩只统计最新版本，导致无效工作量。v2 在 `src/modules/reviews/service.js` 中改为按「小组 + 迭代」取最新版本后再分配，详见 `docs/adr/ADR-005-latest-version-only.md`。
