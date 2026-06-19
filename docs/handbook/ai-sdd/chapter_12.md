# 第12章 Codex 进阶技巧：高级 Prompt 与 Hook

基础用法让你跑起来，进阶技巧让你跑得快、跑得稳。本章聚焦 Codex 的高级 Prompt 技巧、Hook 自动化机制、Session 管理和 MCP（Model Context Protocol）集成，帮助你将 AI 编程效率推向极限。

---

## 12.1 高级 Prompt 技巧

**结构化 Prompt 框架**

好的 Prompt 不是写得多，而是结构清晰、意图明确。推荐使用 CRISPE 框架：

- C (Capacity)：设定 AI 角色
- R (Request)：描述具体请求
- I (Input)：提供输入上下文
- S (Style)：指定输出风格
- P (Persona)：明确目标受众
- E (Experiment)：尝试多种方案

```markdown
# CRISPE Prompt 示例

## Capacity
你是一位资深的全栈开发工程师，精通 Java、Python 和 React。

## Request
实现一个景点搜索接口，支持关键词搜索、城市筛选和评分排序。

## Input
- 数据库：PostgreSQL，表结构见 schema.sql
- 框架：Spring Boot 3 + MyBatis Plus
- 已有代码：AttractionController.java、AttractionService.java

## Style
- 代码注释用中文
- 变量命名用英文
- 遵循 Google Java Style
- 输出完整文件，不要省略

## Persona
读者是有 3 年经验的 Java 开发者，不需要解释基础语法。

## Experiment
请提供两种实现方案：
1. 使用 MyBatis Plus 条件构造器
2. 使用原生 SQL + 分页插件
并说明两种方案的优劣。
```

**Chain of Thought（思维链）**

对于复杂逻辑，要求 AI 展示推理过程：

```markdown
请按以下步骤分析并实现用户权限系统：

步骤1：分析需求
- 列出需要实现的权限类型（RBAC）
- 识别边界条件和异常场景

步骤2：设计数据模型
- 用户-角色-权限三表模型
- 考虑角色继承和权限组合

步骤3：设计 API 接口
- 权限校验中间件
- 接口级别的权限控制

步骤4：编写代码
- 按照设计逐步实现
- 每个文件编写完成后自检

步骤5：验证
- 编译检查
- 单元测试
- 安全审查
```

**Few-shot 示例**

提供 2-3 个高质量示例，比长篇描述更有效：

```markdown
# 根据以下示例，为"景点评论"功能生成代码

## 示例1：用户注册
输入：POST /api/auth/register，接收 {email, password, name}
输出：UserController + UserService + User DTO

## 示例2：景点查询
输入：GET /api/attractions/:id，返回景点详情
输出：AttractionController + AttractionService + AttractionDTO

## 目标：景点评论
输入：POST /api/attractions/:id/comments，接收 {content, rating}
输出：[请生成]
```

---

## 12.2 Hook 自动化与 .codex/rules 配置

**Hook 自动化**

Hook 是在 Codex 事件触发时自动执行的脚本，用于减少重复操作：

```yaml
# .codex/hooks.yaml
hooks:
  # 文件生成后自动格式化
  on_file_created:
    - pattern: "*.java"
      command: "google-java-format --replace {file}"
    - pattern: "*.ts"
      command: "prettier --write {file}"
    
  # 测试失败后自动分析
  on_test_fail:
    - command: "claude '分析测试失败原因：{error_output}'"
      timeout: 60s
    
  # 提交前检查
  on_pre_commit:
    - command: "pnpm lint && pnpm test"
      block_on_fail: true
    
  # 新分支创建时初始化任务追踪
  on_branch_create:
    - command: "cp .claude/template/progress.md docs/progress.md"
```

**.codex/rules 配置**

Rules 文件是 Codex 的持久化指令，每次交互自动加载：

```markdown
# .codex/rules.md

## 代码生成规则
1. Java 代码遵循 Google Java Style
2. TypeScript 代码遵循 ESLint + Prettier 规范
3. 所有公开接口必须有 Javadoc / TSDoc 注释
4. 数据库操作必须通过 Service 层，禁止在 Controller 中直接操作
5. 所有外部 API 调用必须有超时设置和重试机制

## 安全规则
1. SQL 查询必须使用参数化查询，禁止字符串拼接
2. 用户输入必须经过校验和转义
3. 密码存储使用 bcrypt，禁止 MD5/SHA1
4. API 接口必须有权限校验
5. 敏感信息不得出现在日志中

## 测试规则
1. 新增功能必须有单元测试，覆盖率 > 80%
2. API 接口必须有集成测试
3. 测试文件与源文件同目录
4. 测试命名：should_预期行为_when_条件

## Git 规则
1. 提交信息格式：type(scope): description
2. type 包括：feat, fix, refactor, test, docs, chore
3. 每次提交只包含一个逻辑变更
4. 禁止提交 .env 文件和 node_modules
```

---

## 12.3 Session 管理与会话持久化

**Session 管理策略**

在长时间开发中，Session 管理决定了上下文的连续性：

```bash
# 创建命名 Session（用于不同模块的并行开发）
claude --session user-module "开始用户模块开发"
claude --session attraction-module "开始景点模块开发"

# 恢复 Session（继续之前的工作）
claude --resume user-module

# 列出所有 Session
claude --list-sessions

# 导出 Session 记录（用于团队共享）
claude --export user-module > docs/sessions/user-module.log
```

**会话持久化**

将重要决策和上下文持久化到文件，防止 Session 丢失：

```markdown
# .claude/sessions/2026-06-20-user-module.md

## 本次会话目标
完成用户注册和登录功能

## 已完成
- [DONE] User 实体类
- [DONE] UserMapper
- [DONE] AuthService.register()
- [DONE] AuthService.login() + JWT

## 关键决策
- JWT 过期时间设为 24 小时
- 密码强度：8位+大小写+数字
- 使用 BCryptPasswordEncoder，strength=10

## 待办
- [TODO] 密码重置功能
- [TODO] 第三方登录（Google/GitHub）
- [TODO] 用户头像上传

## 遇到的问题
- Spring Security 配置需要排除 /api/auth/register 和 /api/auth/login
- 解决方式：SecurityConfig 中配置 permitAll
```

---

## 12.4 MCP（Model Context Protocol）集成与工作流

**MCP 简介**

MCP（Model Context Protocol）是 Anthropic 提出的开放协议，允许 AI 模型与外部工具和数据源进行标准化通信。通过 MCP，Codex 可以连接数据库、API、文件系统等外部资源。

**MCP 配置**

```json
// .codex/mcp.json
{
  "servers": {
    "database": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/travelwise"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/Users/dev/travelwise"]
    },
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**MCP 使用场景**

1. 数据库直连：AI 直接查询数据库，理解表结构和数据分布

```bash
claude "通过 MCP 连接数据库，查看 attractions 表的数据分布，为搜索功能优化索引"
```

2. GitHub 集成：AI 读取 Issue、创建 PR、管理分支

```bash
claude "通过 MCP 读取 GitHub Issue #42，根据 Issue 描述实现功能并创建 PR"
```

3. 文件系统：AI 浏览项目文件，理解项目结构

```bash
claude "通过 MCP 浏览项目目录结构，生成 Repo Wiki"
```

**工作流自动化**

结合 Hook + MCP + Rules 构建自动化工作流：

```
GitHub Issue 创建 → Hook 触发 → MCP 读取 Issue → AI 分析需求 → 
生成 Spec → AI 编码 → 自动测试 → 创建 PR → 通知 Reviewer
```

---

## 12.5 性能优化与调试技巧

**Prompt 优化**

| 技巧 | 说明 | 示例 |
|------|------|------|
| 精确约束 | 限制输出格式和范围 | "只返回 JSON，不要解释" |
| 分步指令 | 复杂任务拆分为多步 | "先分析，再设计，最后编码" |
| 负面约束 | 明确禁止事项 | "不要使用 var，不要引入新依赖" |
| 上下文锚定 | 引用已有代码 | "参照 UserService 的风格实现" |
| 输出控制 | 控制输出长度 | "简洁回答，不超过 50 行" |

**调试技巧**

1. 让 AI 自我调试：

```bash
claude "这段代码报了 NullPointerException，请分析：
1. 哪个变量可能为 null？
2. 为什么会为 null？
3. 如何修复？
4. 如何防止同类问题？"
```

2. 对比分析：

```bash
claude "对比以下两段代码的性能差异，指出哪段更优以及原因：
[代码A]
[代码B]"
```

3. 逆向分析：

```bash
claude "分析这个 bug 的根因：
1. 复现步骤
2. 代码执行路径
3. 根本原因
4. 修复方案
5. 预防措施"
```

---

**本章小结**

| 技巧 | 核心要点 |
|------|---------|
| CRISPE 框架 | Capacity + Request + Input + Style + Persona + Experiment |
| 思维链 | 分步骤推理，适合复杂逻辑 |
| Few-shot | 2-3 个高质量示例比长篇描述更有效 |
| Hook 自动化 | 文件创建/测试失败/提交前 自动执行脚本 |
| Rules 配置 | 持久化指令，每次交互自动加载 |
| Session 管理 | 命名 Session 并行开发，持久化重要决策 |
| MCP 集成 | 标准化连接数据库/GitHub/文件系统 |
| 工作流 | Hook + MCP + Rules 构建端到端自动化 |

下一章，我们将学习 Codex 的另一个重要能力——调试与重构，掌握在遗留代码中安全操作的技巧。
