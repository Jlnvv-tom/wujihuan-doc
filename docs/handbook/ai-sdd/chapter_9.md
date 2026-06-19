# 第9章 驾驭工程实操：核心能力深度演练

上一章我们建立了 Harness Engineering 的理论框架，本章将这些理论转化为可操作的实战能力。我们将逐一演练上下文管理、四相循环、工具编排、验证闭环等核心能力，通过真实的代码场景演示如何用好这些机制。

---

## 9.1 配置环境构建与四相循环实操

**配置环境构建**

先搭建 Harness 实践的基础环境：

```bash
# 项目根目录创建 .claude/ 目录
mkdir -p .claude

# CLAUDE.md - 全局上下文配置
cat > .claude/CLAUDE.md << 'EOF'
# 全局上下文 - 每次交互都加载

## 项目信息
- 项目名：Harness Demo
- 技术栈：TypeScript + React + FastAPI + PostgreSQL
- 包管理：pnpm
- 代码规范：TypeScript strict mode

## 目录结构
- frontend/src/     # 前端源码
- backend/app/      # 后端源码
- shared/types/     # 共享类型定义
- tests/            # 测试文件

## 编码规范
- 组件放在 components/ 目录
- API 调用放在 services/ 目录
- 共享类型放在 shared/types/
- 测试文件与源文件同目录，后缀 .test.ts

## 禁止事项
- 禁止直接操作 DOM，使用 React
- 禁止使用 any 类型
- 禁止在组件中直接写业务逻辑，必须提取到 hooks 或 services
EOF
```

**四相循环实操**

以实现"景点详情页面"为例，演示四相循环的执行过程：

```bash
# Phase1: Plan
claude "我需要实现景点详情页面，请制定执行计划：
1. 需要创建/修改哪些文件？
2. 需要调用的工具顺序？
3. 验收标准是什么？"
```

AI 返回的 Plan：

```
计划：
1. shared/types/attraction.ts - 定义景点类型
2. backend/app/routers/attraction.py - 后端详情接口
3. frontend/src/services/attraction.ts - 前端 API 调用
4. frontend/src/pages/AttractionDetail.tsx - 详情页面组件
工具顺序：先类型 → 后端 → 前端 API → 前端页面
验收：页面能显示景点名称、描述、图片，接口响应时间 < 200ms
```

```bash
# Phase2: Execute - 按计划执行
claude "按计划执行，先创建类型定义文件 shared/types/attraction.ts"

# AI 执行后，继续
claude "继续：创建后端路由 backend/app/routers/attraction.py"
```

```bash
# Phase3: Observe - 验证执行结果
claude "验证执行结果：
1. 运行后端测试：pytest tests/backend/
2. 运行前端类型检查：cd frontend && pnpm tsc --noEmit
3. 记录验证结果"
```

```bash
# Phase4: Reflect - 反思并调整
claude "根据验证结果反思：
1. 是否有失败的测试用例？
2. 是否有类型错误？
3. 下一步如何调整？"
```

---

## 9.2 工具编排与进度追踪实操

**工具编排实操**

定义项目专用的工具集，让 AI 只能使用安全的工具子集：

在 `.claude/tools.md` 中定义工具规范：

```markdown
# 工具使用规范

## 可用工具
- read: 读取文件（始终可用）
- edit: 编辑文件（始终可用）
- write: 新建文件（始终可用）
- exec: 执行命令（需明确指定命令内容）

## 执行命令白名单
允许的命令：
- pnpm install / pnpm add / pnpm dev / pnpm build / pnpm test
- pytest tests/ -v
- tsc --noEmit
- git diff / git status / git log
- docker compose up / docker compose down

禁止的命令：
- rm -rf / format / dd（破坏性操作）
- 未在白名单中的任何命令

## 文件操作安全
- 所有文件操作必须在项目目录内
- 禁止修改 .env.example 以外的环境配置文件
- 禁止修改 package-lock.json / pnpm-lock.yaml
```

**进度追踪实操**

创建 `docs/progress.md` 追踪开发进度：

```markdown
# 开发进度追踪

## Sprint2: 景点模块

### 景点列表页
- [DONE] 后端接口 GET /api/attractions
- [DONE] 前端 API 服务层
- [WIP] 列表页面组件
- [TODO] 列表页分页功能
- [TODO] 列表页筛选功能

### 景点详情页
- [DONE] 类型定义
- [DONE] 后端详情接口 GET /api/attractions/:id
- [DONE] 前端 API 调用
- [WIP] 详情页面组件
- [TODO] 图片画廊组件
- [TODO] 相关景点推荐

## 当前阻塞
- 无

## 本次会话目标
完成景点详情页面组件
```

每次任务完成后，AI 自动更新进度文件。

---

## 9.3 Memory 三层架构与上下文管理实操

**Memory 三层架构实操**

创建 Memory 管理文件 `.claude/memory.md`：

```markdown
# 项目记忆 - 重要决策和已知问题

## 架构决策
- 使用 Redis 缓存热门景点列表，TTL 5分钟
- 使用 JWT Token，用户信息不存 Redis

## 已知的坑
- FastAPI 的 Depends 注入在异步路由中有时序问题，暂用全局依赖
- React Query 的 staleTime 设为 30s，避免频繁刷新

## 迭代记录
- v1.0: MVP 版本，只支持景点列表和详情
- v1.1: 增加搜索功能（TODO）
- v2.0: 增加用户收藏（TODO）

## 用户反馈
- 用户反映详情页加载慢，原因：景点图片未做 CDN 加速
- 已计划：v2.0 中引入图片 CDN
```

三层记忆的使用策略：

| 层级 | 内容 | 更新频率 | Token 预算 |
|------|------|---------|-----------|
| 项目记忆 | 架构决策、已知问题、迭代记录 | 每周更新 | 1K |
| 模块记忆 | 当前模块的技术细节和约束 | 每天更新 | 2K |
| 会话记忆 | 本次会话的中间结果和发现 | 每次交互 | 0.5K |

**上下文裁剪实操**

当项目增大，单个文件过大时，需要裁剪上下文：

```bash
# 使用 Claude Code 读取文件指定范围（避免加载整个大文件）
claude "读取 backend/app/models/ 目录下最近修改的 3 个文件，重点关注 user.py 和 order.py"

# AI 自动识别最近的 git 修改
git log --oneline -5 backend/app/models/
# 结果：user.py, order.py, product.py 最近有修改

# AI 只加载 user.py 和 order.py，跳过其他文件
```

---

## 9.4 任务拆解与验证闭环实操

**任务拆解实操**

将"实现景点搜索功能"拆解为可执行的任务：

```bash
claude "将景点搜索功能拆解为具体的开发任务，要求：
1. 每个任务原子化，可独立完成
2. 每个任务有明确的验收标准
3. 标注任务之间的依赖关系

功能需求：
- 支持按景点名称关键词搜索
- 支持按城市筛选
- 支持按评分排序
- 支持分页，每页 20 条
- 搜索结果缓存 5 分钟"
```

AI 返回的拆解结果：

```markdown
## 任务拆解：景点搜索

### T1: 后端搜索接口（依赖：无）
POST /api/attractions/search
输入：{ keyword?: string, city?: string, sortBy?: 'rating'|'name', page?: number, pageSize?: number }
输出：{ data: Attraction[], total: number, page: number, pageSize: number }
验收：响应时间 < 200ms，支持空关键词（全量查询）

### T2: 搜索缓存层（依赖：T1）
使用 Redis 缓存搜索结果，Key 格式：search:{keyword}:{city}:{sortBy}:{page}
TTL: 5 分钟
验收：相同参数第二次查询命中缓存

### T3: 前端搜索表单组件（依赖：无）
输入框 + 城市下拉 + 排序下拉 + 搜索按钮
验收：表单可交互，支持 Enter 提交

### T4: 前端搜索 API 调用（依赖：T1）
封装 searchAttractions(params) 函数
验收：TS 类型正确，错误处理完善

### T5: 前端搜索结果列表（依赖：T3 + T4）
展示搜索结果，支持分页
验收：结果与后端一致，分页交互正常

### T6: 前后端联调（依赖：T5）
端到端测试搜索功能
验收：用户从输入到看到结果全流程通顺
```

**验证闭环实操**

使用 Claude Code 的 --verify 标志自动执行验证：

```bash
claude "实现 T1 搜索接口，生成完成后自动执行验证：
1. pytest tests/backend/test_attraction.py::test_search -v
2. 运行类型检查：mypy backend/app/routers/attraction.py
3. 检查是否有 SQL 注入风险"
```

AI 在生成接口后自动运行验证，发现问题则进入下一轮修改循环。

---

## 9.5 子代理分治与评估分离实操

**子代理分治实操**

当项目增大时，使用子代理并行处理不同模块：

```bash
# 主 Agent 协调
claude "我需要同时开发用户模块和景点模块。
请分别启动两个子代理并行开发：
- 子代理A：负责用户模块（注册、登录、Profile）
- 子代理B：负责景点模块（列表、详情、搜索）

每个子代理独立工作，完成后汇报结果。
共享的类型定义（shared/types/）先由子代理A定义，子代理B引用。"
```

在 Claude Code 中，子代理通过特殊指令触发：

```bash
# 启动子代理 A
claude --agent user-module "开发用户模块，具体任务见 docs/tasks.md#user-module"

# 启动子代理 B（可并行）
claude --agent attraction-module "开发景点模块，具体任务见 docs/tasks.md#attraction-module"
```

**评估分离实操**

Generator 和 Evaluator 角色分离：

```bash
# Generator 生成代码
claude "实现景点评论功能：POST /api/attractions/:id/comments"

# 生成完成后，Evaluator 审查
claude "审查刚生成的评论功能代码，检查：
1. 是否有 SQL 注入漏洞？
2. 是否有 XSS 风险？
3. 是否有未处理的边界情况？
4. 评分是否在 1-5 范围内？
5. 评论内容长度限制是否合理？"
```

如果 Evaluator 发现问题，Generator 根据反馈重新修改。

---

## 9.6 项目全流程演示与 Hook 说明

**全流程演示：景点评论功能**

完整演示 Harness Engineering 的全流程：

```bash
# Step1: Plan
claude "实现景点评论功能，包含：
1. 发布评论（POST /api/attractions/:id/comments）
2. 获取评论列表（GET /api/attractions/:id/comments）
3. 点赞评论（POST /api/comments/:id/like）

制定详细计划，包括任务拆分、依赖关系和验收标准。"

# Step2: Execute
claude "执行计划。先创建数据模型和 DTO，再实现后端接口，最后实现前端功能。"

# Step3: Observe
claude "执行验证：
1. 后端单元测试：pytest tests/backend/test_comment.py -v
2. 类型检查：cd frontend && pnpm tsc --noEmit
3. E2E 测试：pnpm test:e2e --grep 'comment'
4. 汇总验证结果"

# Step4: Reflect
claude "反思：
- 测试失败的用例需要修复
- 类型错误需要修正
- 记录本次开发的经验教训到 .claude/memory.md"
```

**Hook 说明**

Hook 是在特定事件触发时自动执行的脚本，用于自动化重复性的 Harness 动作。

常用 Hook：

```yaml
# .claude/hooks.yaml
hooks:
  on_code_generate:
    - name: lint_check
      command: pnpm lint --fix {file}
      timeout: 30s

  on_test_fail:
    - name: auto_debug
      command: claude "分析这个测试失败的原因：{error}"
      timeout: 60s

  on_commit:
    - name: format_check
      command: pnpm prettier --check {files}
      timeout: 20s

  on_branch_create:
    - name: update_progress
      command: claude "在 docs/progress.md 中创建 {branch} 的任务追踪区"
      timeout: 10s
```

---

**本章小结**

| 能力 | 实操要点 |
|------|---------|
| 四相循环 | Plan 制定计划 → Execute 执行 → Observe 验证 → Reflect 反思 |
| 工具编排 | 白名单机制控制 AI 可用的操作，防止误用危险命令 |
| 进度追踪 | docs/progress.md 实时更新任务状态 |
| 上下文管理 | 三层 Memory 架构，全局上下文 < 4K Token |
| 任务拆解 | 原子化、验收标准明确、依赖关系显式 |
| 验证闭环 | 自动验证 → Evaluator 审查 → 人工确认 |
| 子代理分治 | 独立子 Agent 并行开发，共享类型统一定义 |
| Hook | 事件触发自动化动作，减少重复工作 |

下一章，我们将进入项目实战阶段——用 SDD + Harness 规范从零启动一个完整的旅游项目，真正体验规范驱动的工程化开发。
