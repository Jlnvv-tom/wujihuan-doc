# 第7章 Harness Engineering 驾驭工程

前六章我们用 Vibe Coding 搭建了三个项目，你应该已经感受到了：AI 生成代码很快，但"让 AI 稳定可靠地生成正确的代码"却很难。直觉式地使用 AI 编程，就像没有缰绳地骑一匹快马——速度快但失控风险极大。Harness Engineering（驾驭工程）就是那套缰绳。它不是某个工具或框架，而是一套让 AI 编程从"感觉驱动"进化为"工程驱动"的系统性方法论。

---

## 7.1 什么是 Harness Engineering？——从 Naive Agent 到驾驭工程

**Naive Agent 的问题**

大多数开发者使用 AI 编程的方式，本质上就是一个 Naive Agent：你给 AI 一个指令，它返回代码，你复制粘贴，测试一下，不行就再改指令。这个循环看起来简单高效，但在复杂项目中会遭遇严重的可靠性问题。

Naive Agent 的典型工作流：

```
用户指令 → LLM 生成代码 → 用户审查 → 发现问题 → 重新描述 → LLM 重新生成 → ...
```

这个循环的致命缺陷是：没有结构化的反馈机制。用户发现问题后只能凭直觉调整指令，LLM 也不保证下次生成能避免同样的错误。

**Harness Engineering 的定义**

Harness Engineering 是一套约束和引导 AI Agent 行为的工程化方法论。它的核心思想是：通过结构化的机制（而非直觉），确保 AI 在可预测的范围内执行任务，并在偏离时自动纠正。

如果把 AI 比作一匹快马：

- Naive Agent 是无缰骑马——速度取决于马的心情
- Harness Engineering 是套上缰绳、装上马鞍——速度可控，方向可调

**从 Naive 到 Harness 的演进**

```
Naive Agent（直觉驱动）
  ↓ 引入结构化反馈
Guided Agent（引导驱动）
  ↓ 引入验证闭环
Verified Agent（验证驱动）
  ↓ 引入多代理分治
Harness Engineering（驾驭工程）
```

每一层的进化都是在解决上一层暴露的可靠性问题。最终形态的 Harness Engineering，让 AI 的行为从"看起来对"变为"经过验证是对的"。

---

## 7.2 三代工程的迭代演进与 Naive Agent 的八种失效方式

**三代工程演进**

| 代际 | 名称 | 核心理念 | 代表工具/方法 |
|------|------|---------|-------------|
| 第一代 | Prompt Engineering | 优化输入以获得更好输出 | Chain of Thought, Few-shot |
| 第二代 | Agent Engineering | 让 AI 自主执行多步骤任务 | AutoGPT, LangChain Agent |
| 第三代 | Harness Engineering | 约束和引导 AI 行为，确保可靠性 | Claude Code, Codex |

第一代解决的是"单次交互质量"问题，第二代解决的是"多步骤任务执行"问题，第三代解决的是"复杂任务的可靠性"问题。

**Naive Agent 的八种失效方式**

理解了失效模式，才能对症下药。

1. **上下文遗忘**：AI 在长任务中丢失早期上下文，生成的代码与初始需求不一致

2. **幻觉代码**：AI 自信地生成调用不存在 API 的代码

3. **任务漂移**：AI 在执行过程中偏离原始目标，越做越远

4. **重复错误**：AI 在修复 bug 时引入新 bug，或在同一类问题上反复犯错

5. **验证缺失**：AI 生成代码后不验证，直接返回，用户需要自己测试

6. **上下文溢出**：项目代码量超过模型上下文窗口，AI 无法感知全局

7. **工具误用**：AI 错误使用工具（如用 rm 替代 trash，写文件到错误路径）

8. **协作冲突**：多个 AI Agent 并行开发时，修改同一文件产生冲突

每种失效方式都对应 Harness Engineering 中的一个核心机制来应对：

| 失效方式 | Harness 对策 |
|---------|-------------|
| 上下文遗忘 | Context Management + Memory 三层架构 |
| 幻觉代码 | Verification Loop |
| 任务漂移 | Progress Tracking + Feature List |
| 重复错误 | Generator-Evaluator 分离 |
| 验证缺失 | Verification Loop |
| 上下文溢出 | Subagents 子代理分治 |
| 工具误用 | Tool Use 工具编排 |
| 协作冲突 | Subagents + 任务隔离 |

---

## 7.3 Agent Loop 四相循环机制

Agent Loop 是 Harness Engineering 的核心执行模型。它将 AI 的行为组织为四个循环相位，确保每一步都在可控范围内。

**四相循环**

```
┌──────────────────────────────────────────────┐
│                                              │
│  Phase 1: Plan（规划）                        │
│  - 理解当前任务                               │
│  - 制定执行计划                               │
│  - 确定需要的工具和资源                         │
│                                              │
│  Phase 2: Execute（执行）                      │
│  - 按计划调用工具                              │
│  - 生成代码或执行操作                           │
│  - 记录执行结果                               │
│                                              │
│  Phase 3: Observe（观察）                      │
│  - 收集执行反馈                               │
│  - 检查代码是否编译通过                         │
│  - 运行测试验证结果                            │
│                                              │
│  Phase 4: Reflect（反思）                      │
│  - 评估执行结果是否达标                         │
│  - 决定是否需要调整计划                         │
│  - 更新进度和记忆                              │
│                                              │
└──────────────────────────────────────────────┘
         │                                    │
         └──────── 循环继续 ──────────────────┘
```

**与 Naive Agent 的区别**

Naive Agent 只有 Execute 和 Observe 两个阶段：生成代码，看结果。缺少 Plan 和 Reflect，导致行为不可预测。

Harness Agent 的四相循环确保：

- Plan：AI 在行动前先想清楚，避免盲目生成
- Execute：按计划执行，减少随意性
- Observe：系统化收集反馈，不依赖直觉
- Reflect：从反馈中学习，调整策略

**实操中的四相循环**

以"实现用户登录接口"为例：

```
Phase 1 (Plan):
- 需要创建 AuthController、AuthService
- 需要配置 JWT 工具类
- 需要定义 LoginRequest/LoginResponse DTO
- 依赖：spring-security、jjwt

Phase 2 (Execute):
- 创建 AuthController.java，定义 /api/auth/login 端点
- 创建 AuthService.java，实现认证逻辑
- 创建 JwtUtil.java，处理 Token 生成和验证
- 编写 LoginRequest/LoginResponse DTO

Phase 3 (Observe):
- 运行 mvn compile → 编译成功
- 运行 AuthServiceTest → 3 个测试通过，1 个失败
- 失败原因：Token 过期时间未正确设置

Phase 4 (Reflect):
- Token 过期时间的默认值需要从配置文件读取
- 更新 JwtUtil 使用 @Value 注入
- 进入下一轮循环修复此问题
```

---

## 7.4 Tool Use 工具编排与 Progress Tracking 进度追踪

**Tool Use 工具编排**

AI Agent 的能力边界取决于它能调用的工具集。工具编排（Tool Orchestration）要解决的问题是：如何让 AI 在正确的时间使用正确的工具，并正确处理工具返回的结果。

工具编排的核心原则：

1. **最小权限原则**：每个工具只暴露必要的操作，避免 AI 误操作
2. **输入校验**：工具调用前校验参数，防止注入攻击
3. **结果结构化**：工具返回结构化结果，方便 AI 解析
4. **错误可恢复**：工具执行失败时提供清晰的错误信息，AI 可以据此调整

```typescript
// 工具定义示例
const tools = {
  readFile: {
    description: "读取指定文件的内容",
    parameters: {
      path: { type: "string", description: "文件路径" },
      offset: { type: "number", description: "起始行号（可选）" },
      limit: { type: "number", description: "最大行数（可选）" }
    },
    execute: async (params) => {
      // 校验路径在项目范围内
      if (!params.path.startsWith(process.cwd())) {
        return { error: "路径超出项目范围" };
      }
      const content = await fs.readFile(params.path, 'utf-8');
      return { content, lines: content.split('\n').length };
    }
  }
};
```

**Progress Tracking 进度追踪**

复杂任务需要进度追踪机制，让 AI 和人类都能清楚地知道"做到哪了"。

进度追踪的实现方式：

1. **Feature List**：将项目拆分为功能列表，每个功能有明确的状态

```markdown
## Feature Progress

### User Module
- [DONE] User model and migration
- [DONE] User registration API
- [WIP] User login with JWT
- [TODO] Password reset
- [TODO] Profile update

### Chat Module
- [DONE] Chat model and migration
- [WIP] Message sending API
- [TODO] Message history API
- [TODO] Real-time WebSocket
```

2. **进度百分比**：在任务级别计算完成度

3. **阻塞标记**：标记被阻塞的任务及阻塞原因，AI 可据此调整执行顺序

---

## 7.5 Context Management 上下文管理与 Feature List 任务拆解

**Context Management 上下文管理**

上下文管理是 Harness Engineering 中最核心也最复杂的问题。AI 的能力受限于它"能看到"的信息，上下文管理决定了 AI 在每次交互中能看到什么。

三层上下文管理策略：

**第一层：全局上下文（Always Loaded）**

每次交互都加载的信息，包括：
- 系统提示（System Prompt）
- 项目 Rules（.cursorrules / CLAUDE.md）
- Repo Wiki 中的核心文档

控制总大小在 2000-4000 Token 以内。

**第二层：任务上下文（On-Demand Loaded）**

与当前任务直接相关的信息，包括：
- 当前修改的文件内容
- 相关的接口定义和数据模型
- 当前任务的 Spec 文档

按需加载，总量控制在 10000-20000 Token。

**第三层：历史上下文（Summarized Loaded）**

历史交互信息的摘要，包括：
- 之前的对话要点（而非完整对话）
- 已完成的任务列表
- 重要的决策记录

通过摘要压缩，将大量历史信息压缩到 2000-5000 Token。

**上下文窗口分配策略**

以 128K Token 上下文窗口为例：

| 层级 | 内容 | 预算 | 占比 |
|------|------|------|------|
| 全局上下文 | Rules + Wiki + System Prompt | 4K | 3% |
| 任务上下文 | 当前文件 + 相关代码 | 20K | 16% |
| 历史上下文 | 对话摘要 + 决策记录 | 5K | 4% |
| LLM 输出预算 | AI 的生成空间 | 30K | 23% |
| 预留缓冲 | 紧急信息扩展 | 69K | 54% |

实际分配中，预留缓冲通常被任务上下文挤占。当项目增大时，需要更精细的上下文裁剪策略。

**Feature List 任务拆解**

任务拆解是将大目标分解为 AI 可执行的小任务的过程。拆解的质量直接决定 AI 的执行效果。

拆解原则：

1. **原子性**：每个任务应该是一个独立的、可验证的功能点
2. **可测试性**：每个任务有明确的验收标准
3. **无歧义性**：任务描述不能有模糊空间
4. **依赖明确**：任务之间的依赖关系必须显式声明

```
不好：实现用户模块
好的：实现 POST /api/users/register 接口，接收 {email, password, name}，
      校验 email 格式和密码强度（8位+大小写+数字），
      返回 {code: 0, message: "success", data: {userId}}
      验收标准：curl 测试返回 200，数据库有新记录
```

---

## 7.6 Verification Loop 验证闭环与 Subagents 子代理分治

**Verification Loop 验证闭环**

验证闭环是 Harness Engineering 区别于 Naive Agent 的关键机制。它的核心思想是：AI 生成的每一份输出都必须经过验证才能视为完成。

验证闭环的三层结构：

**第一层：自动验证**

AI 在生成代码后自动执行的验证：
- 编译检查：代码是否能编译/运行
- 类型检查：TypeScript 类型是否正确
- 单元测试：运行相关单元测试
- Lint 检查：代码是否符合规范

```bash
# Claude Code 自动验证流程
claude "实现用户注册接口" --verify
# 自动执行：
# 1. mvn compile
# 2. mvn test -Dtest=UserServiceTest
# 3. mvn checkstyle:check
```

**第二层：结构化审查**

AI 按照预定义的审查清单进行代码审查：
- 安全性检查：SQL 注入、XSS、认证绕过
- 性能检查：N+1 查询、大对象复制、内存泄漏
- 规范检查：命名规范、异常处理、日志记录

**第三层：人工确认**

对于关键模块（支付、权限、数据迁移等），必须经过人工确认。

```
自动验证 → 结构化审查 → 人工确认
    │            │            │
    ├─ 通过 ─────┘            │
    │                         │
    └─ 失败 → 反馈给 AI 重试  │
                              │
                              └─ 确认通过 → 任务完成
```

**Subagents 子代理分治**

当项目规模增大，单个 Agent 的上下文窗口无法覆盖整个项目时，需要使用子代理分治策略。

核心思想：将大项目拆分为多个独立模块，每个模块由一个子 Agent 负责，主 Agent 负责协调。

```
Main Agent（协调者）
├── Sub Agent 1（用户模块）
│   ├── User Controller
│   ├── User Service
│   └── User Repository
├── Sub Agent 2（订单模块）
│   ├── Order Controller
│   ├── Order Service
│   └── Order Repository
└── Sub Agent 3（支付模块）
    ├── Payment Controller
    ├── Payment Service
    └── Payment Repository
```

子代理分治的关键约束：

1. 模块间通过明确的接口通信，禁止直接访问其他模块的内部实现
2. 共享的数据模型由主 Agent 统一定义
3. 每个子 Agent 有独立的上下文窗口，互不干扰
4. 子 Agent 之间的依赖关系由主 Agent 管理

---

## 7.7 Generator-Evaluator 评估分离与故障解决方案

**Generator-Evaluator 模式**

Generator-Evaluator 是 Harness Engineering 中的核心设计模式。它将代码的"生成"和"评估"交给不同的 Agent，通过角色分离提高代码质量。

```
Generator Agent ──生成代码──→ Evaluator Agent ──评估──→ 通过/不通过
      ↑                                                    │
      └──────────── 不通过时，反馈修改方向 ────────────────┘
```

Generator 的职责：根据需求生成代码，追求功能实现

Evaluator 的职责：审查 Generator 的输出，检查以下维度：

- 功能正确性：代码是否实现了需求
- 安全性：是否存在安全漏洞
- 性能：是否存在性能瓶颈
- 可维护性：代码是否清晰可读
- 规范性：是否符合项目编码规范

```typescript
// Evaluator 的评估 Prompt
const evaluatorPrompt = `
你是一位严格的代码审查专家。请评估以下代码：

评估维度：
1. 功能正确性（0-10）：是否完整实现了需求？
2. 安全性（0-10）：是否存在 SQL 注入、XSS 等风险？
3. 性能（0-10）：是否存在 N+1 查询、不必要的全表扫描？
4. 可维护性（0-10）：命名是否清晰？逻辑是否简洁？
5. 规范性（0-10）：是否符合项目编码规范？

任何维度低于 7 分，给出具体的修改建议。
`;
```

**故障解决方案汇总**

| 故障类型 | 症状 | 解决方案 |
|---------|------|---------|
| 上下文丢失 | AI 忽略早期指令 | 压缩历史，关键信息放全局上下文 |
| 幻觉代码 | 调用不存在的 API | Evaluator 审查 + 自动编译验证 |
| 任务漂移 | AI 偏离原始目标 | Progress Tracking + Feature List 校准 |
| 无限循环 | AI 反复尝试同一方案 | 设置最大重试次数，3 次失败后换策略 |
| 工具调用失败 | 命令执行报错 | 捕获错误信息，反馈给 AI 调整参数 |
| 代码冲突 | 多 Agent 修改同一文件 | 文件级锁 + 子代理任务隔离 |
| 上下文溢出 | AI 输出被截断 | 减少 Prompt 长度，分步骤执行 |
| 安全漏洞 | AI 生成不安全代码 | 安全审查清单 + Evaluator 强制检查 |

---

## 7.8 驾驭工程的三大工程维度与落地建议

**三大工程维度**

Harness Engineering 的实践可以归纳为三个维度：

**维度一：可观测性（Observability）**

你无法驾驭你看不见的东西。可观测性要求 AI 的每一步行为都是可见的：

- AI 读了哪些文件
- AI 调用了什么工具
- AI 生成了什么代码
- AI 的推理过程是什么

实现方式：结构化日志 + 进度追踪 + 审计记录

**维度二：可验证性（Verifiability）**

AI 的每一个输出都必须是可验证的。不能依赖"看起来对"的判断，必须有自动化的验证手段：

- 代码能编译
- 测试能通过
- 接口符合规范
- 性能在预期范围内

实现方式：Verification Loop + 自动化测试 + Evaluator 审查

**维度三：可纠正性（Correctability）**

当 AI 的行为偏离预期时，必须有纠正机制：

- 自动纠正：验证失败后 AI 自动调整
- 半自动纠正：AI 提出修改建议，人工确认
- 手动纠正：人工介入修改，AI 学习纠正原因

实现方式：Generator-Evaluator 模式 + 人工确认环节

**落地建议**

1. **从小处开始**：不要试图一次性引入所有 Harness 机制。先从 Verification Loop 开始，逐步增加上下文管理和进度追踪

2. **工具先行**：选择支持 Harness 机制的工具（如 Claude Code、Codex），而不是用 Naive Agent 硬做

3. **Rules 是基础**：没有清晰的 Rules，Harness 就没有约束依据。先写好 .cursorrules / CLAUDE.md

4. **验证文化**：团队必须养成"不验证不通过"的习惯，任何 AI 生成的代码都必须经过验证

5. **渐进式复杂度**：
   - 第一周：只用 Verification Loop
   - 第二周：加入 Context Management
   - 第三周：引入 Progress Tracking
   - 第四周：尝试 Subagents 和 Evaluator

6. **主流落地产品**：当前基于 Harness Engineering 理念落地的产品包括 Claude Code、Codex、Cursor Agent Mode 等，选择适合自己团队的工具

---

**本章小结**

| 概念 | 核心要点 |
|------|---------|
| Harness Engineering | 约束和引导 AI 行为的工程化方法论，从"直觉驱动"到"工程驱动" |
| 八种失效 | 上下文遗忘、幻觉代码、任务漂移、重复错误、验证缺失、上下文溢出、工具误用、协作冲突 |
| 四相循环 | Plan → Execute → Observe → Reflect，确保每步可控 |
| 工具编排 | 最小权限、输入校验、结果结构化、错误可恢复 |
| 上下文管理 | 三层策略：全局上下文 + 任务上下文 + 历史上下文 |
| 验证闭环 | 自动验证 → 结构化审查 → 人工确认，三层保障 |
| 评估分离 | Generator 生成 + Evaluator 评估，角色分离提高质量 |
| 三大维度 | 可观测性、可验证性、可纠正性 |

下一章，我们将学习 SDD（规范驱动开发）——与 Harness Engineering 相辅相成的另一半拼图。Harness 解决的是"AI 如何可靠地执行"，SDD 解决的是"执行什么才是正确的"。
