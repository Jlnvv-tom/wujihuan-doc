# 第14章 团队协作与规范落地

个人使用 Codex 是效率提升，团队使用 Codex 是工程变革。但团队落地 AI 编程工具的最大挑战不是技术，而是规范和协作。当每个开发者都用 AI 生成代码，代码风格不一致、架构设计分歧、重复造轮子等问题会成倍放大。本章学习如何在团队中统一规范，让 AI 编程能力在团队中放大而非稀释。

---

## 14.1 Team Spec 工程化规范制定

**为什么需要 Team Spec**

Team Spec 是团队级的开发规范文档，它统一了所有团队成员的开发行为。没有 Team Spec，每个开发者按自己的方式使用 AI，结果就是：

- 代码风格不统一，合并冲突频繁
- 架构设计分歧，模块间接口混乱
- 重复造轮子，A 写了用户认证，B 又写了一次
- 安全漏洞，A 不知道要给参数做校验

**Team Spec 内容框架**

```markdown
# TravelWise Team Spec

## 1. 编码规范
- Java：Google Java Style，使用 google-java-format 自动格式化
- TypeScript：ESLint + Prettier，配置见 .eslintrc.json
- 所有公开接口必须有文档注释
- 禁止使用 Lombok 的 @Data（改为显式 @Getter/@Setter）

## 2. 架构规范
- Controller 层不能有业务逻辑，只能做参数校验和响应封装
- Service 层是业务逻辑的承载体，必须有事务管理
- Repository 层封装数据访问，禁止在 Service 中直接写 SQL
- 配置类统一放在 config/ 目录

## 3. AI 使用规范
- AI 生成的代码必须经过人工审查
- AI 生成的代码必须包含单元测试
- AI 生成的代码必须通过 lint 检查
- 不允许直接提交 AI 生成的代码，必须理解后再提交

## 4. Git 规范
- 提交信息格式：type(scope): description
- 每次提交必须关联 Issue 编号
- 禁止提交 .env、node_modules、.class 文件
- PR 合并前必须通过 CI 和 Code Review

## 5. 安全规范
- 所有用户输入必须校验
- 密码必须 bcrypt 加密
- API 必须有鉴权
- 敏感信息不出现在日志、代码、Git 历史中
```

**Team Spec 的落地**

Team Spec 必须：可执行的规范才是有效的规范。

```bash
# 1. 将 Team Spec 转化为 CI 检查
# .github/workflows/check-spec.yml
name: Check Team Spec Compliance
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Linter
        run: pnpm lint
      - name: Run Tests
        run: pnpm test
      - name: Check AI Code Markers
        run: |
          # 检查是否有 AI 生成的代码未经过人工审查
          if grep -r "AI GENERATED" --include="*.java" --include="*.ts"; then
            echo "AI 生成的代码需要人工审查标记"
            exit 1
          fi
```

---

## 14.2 团队级 Rules 文件共享与维护

**共享 Rules 文件**

团队级 Rules 文件应该放在代码仓库中，所有成员共享：

```
.claude/
├── CLAUDE.md          # 项目级全局上下文（提交到 Git）
├── rules/
│   ├── java.md       # Java 开发规范
│   ├── typescript.md # TypeScript 开发规范
│   ├── security.md   # 安全规范
│   └── git.md        # Git 规范
└── memory.md          # 项目记忆（不提交到 Git）
```

**Rules 文件的维护**

Rules 文件不是一成不变的，需要定期更新：

```markdown
# .claude/rules/java.md

## 更新记录
- 2026-06-01: 初始版本
- 2026-06-10: 补充事务管理规范
- 2026-06-15: 增加 MyBatis Plus 使用规范
- 2026-06-20: 禁止使用反射，改用策略模式

## 当前版本：v1.3
```

更新机制：

1. 每次发现新的架构约束或踩坑，更新 Rules
2. 更新后通知团队成员重新加载 Rules
3. 定期（每周）审查 Rules 的有效性

---

## 14.3 代码审查（Code Review）流程优化

**AI 辅助 Code Review**

Code Review 是团队质量保障的重要环节，但人工 Review 效率低、易疲劳。AI 可以辅助 Code Review：

```bash
# 使用 Claude Code 进行 AI Code Review
claude "审查以下 PR 的代码变更：

变更文件：
- src/main/java/com/travelwise/service/OrderService.java
- src/main/java/com/travelwise/controller/OrderController.java

审查维度：
1. 功能正确性
2. 安全性（SQL 注入、XSS、认证绕过）
3. 性能（N+1 查询、内存泄漏）
4. 可维护性（命名、复杂度、注释）
5. 测试覆盖率

输出：审查报告，包含问题列表和修改建议"
```

**AI + 人工 Code Review 流程**

```
开发者提交 PR
    ↓
AI 自动审查（Claude Code）
    ↓
AI 审查通过？
    ├── 否 → 开发者根据 AI 建议修改 → 重新提交
    └── 是 → 人工 Code Review
                  ↓
            人工审查通过？
                ├── 否 → 人工反馈 → 开发者修改
                └── 是 → 合并到主分支
```

**Code Review 清单**

```markdown
# Code Review 清单（AI + 人工）

## 功能正确性
- [ ] 是否实现了需求？
- [ ] 边界条件是否处理？
- [ ] 错误处理是否完善？

## 安全性
- [ ] 是否有 SQL 注入风险？
- [ ] 是否有 XSS 风险？
- [ ] 是否有认证/授权漏洞？
- [ ] 敏感信息是否妥善处理？

## 性能
- [ ] 是否有 N+1 查询？
- [ ] 是否有不必要的全表扫描？
- [ ] 是否有内存泄漏风险？
- [ ] 是否有同步阻塞问题？

## 可维护性
- [ ] 命名是否清晰？
- [ ] 方法是否过长？
- [ ] 是否有重复代码？
- [ ] 是否有足够的注释？

## 测试
- [ ] 是否有单元测试？
- [ ] 测试覆盖率是否达标？
- [ ] 是否有集成测试？
```

---

## 14.4 知识沉淀与团队 Wiki 维护

**团队 Wiki 结构**

```
docs/wiki/
├── architecture/          # 架构文档
│   ├── overview.md       # 系统概览
│   ├── data-flow.md      # 数据流
│   └── deployment.md    # 部署架构
├── modules/              # 模块文档
│   ├── user.md          # 用户模块
│   ├── attraction.md    # 景点模块
│   └── itinerary.md    # 行程模块
├── decisions/            # 技术决策记录（ADR）
│   ├── 001-use-postgresql.md
│   ├── 002-use-redis-cache.md
│   └── 003-use-spring-ai.md
├── troubleshooting/      # 问题排查
│   ├── common-errors.md
│   └── performance-tuning.md
└── onboarding/           # 新人入职
    ├── setup.md         # 环境搭建
    └── first-task.md    # 第一个任务
```

**AI 自动更新 Wiki**

```bash
# 每次重要功能完成后，AI 自动更新 Wiki
claude "根据最近完成的景点搜索功能，更新以下文档：
1. docs/wiki/modules/attraction.md - 添加搜索功能说明
2. docs/wiki/architecture/data-flow.md - 更新搜索数据流
3. CHANGELOG.md - 记录本次变更"
```

---

## 14.5 新人入职培训与 AI 编程知识传递

**新人入职培训清单**

```markdown
# 新人入职培训清单

## Day 1: 环境搭建
- [ ] 按照 docs/onboarding/setup.md 搭建本地环境
- [ ] 运行项目，确保能正常启动
- [ ] 运行所有测试，确保全部通过
- [ ] 提交第一个 PR（修复一个 TODO 或优化一行代码）

## Day 2: 理解项目
- [ ] 阅读 docs/wiki/architecture/overview.md
- [ ] 阅读 Team Spec（.claude/CLAUDE.md）
- [ ] 理解项目的目录结构和编码规范
- [ ] 用 Claude Code 生成项目架构图

## Day 3: AI 工具使用
- [ ] 安装 Cursor / Claude Code
- [ ] 阅读 AI 编程规范（.claude/rules/）
- [ ] 完成一个 AI 辅助的小任务
- [ ] 学习如何写高质量的 Prompt

## Day 4: 协作流程
- [ ] 理解 Git 工作流
- [ ] 理解 Code Review 流程
- [ ] 理解 CI/CD 流程
- [ ] 提交第一个正式功能 PR

## Day 5: 独立完成功能
- [ ] 从 Issue 列表选择一个小功能
- [ ] 用 AI 辅助完成开发
- [ ] 编写测试
- [ ] 通过 Code Review 并合并
```

**AI 编程知识传递**

团队成员的 AI 编程经验需要沉淀和共享：

```markdown
# docs/ai-prompt-library.md - Prompt 模板库

## 代码生成类
### 生成 CRUD 接口
模板：
请为 [实体名] 生成 CRUD 接口，包括：
- Controller：RESTful 接口
- Service：业务逻辑
- Mapper：数据访问
- DTO：请求和响应对象
要求：遵循项目编码规范，包含 Javadoc 注释

### 生成单元测试
模板：
为 [类名] 生成单元测试，使用 JUnit 5 + Mockito，
覆盖正常场景、异常场景和边界条件。

## 调试类
### 分析报错
模板：
分析以下错误：
错误信息：[错误信息]
上下文：[相关代码]
请给出根因分析和修复方案。

## 重构类
### 提取公共逻辑
模板：
分析 [类名] 中的重复代码，提取公共逻辑到 [工具类名]，
确保不改变原有功能。
```

---

**本章小结**

| 维度 | 核心要点 |
|------|---------|
| Team Spec | 编码规范 + 架构规范 + AI 使用规范 + Git 规范 + 安全规范 |
| Rules 共享 | .claude/ 目录提交到 Git，rules/ 分模块，定期更新 |
| Code Review | AI 辅助审查 + 人工审查，AI 先过滤，人工后再确认 |
| 知识沉淀 | 团队 Wiki 结构化，AI 自动更新 |
| 新人培训 | 5 天培训清单，环境搭建 → 理解项目 → AI 工具 → 协作流程 → 独立开发 |
| 知识传递 | Prompt 模板库，团队共享高质量 Prompt |

下一章，我们将学习 AI 编程的安全与合规，这是企业级应用中不可忽视的重要话题。
