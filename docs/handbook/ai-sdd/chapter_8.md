# 第8章 SDD 规范驱动开发

Harness Engineering 解决了"AI 如何可靠地执行"的问题，但还有一个更根本的问题没回答：执行什么才是正确的？AI 可以高效地生成代码，但如果需求本身就是模糊的、矛盾的、不完整的，再高效的执行也只是加速犯错。SDD（Specification-Driven Development，规范驱动开发）就是来解决这个问题的——在 AI 写代码之前，先用规范把"做什么"定义清楚。

---

## 8.1 什么是 SDD？——规范驱动开发的核心思想

**SDD 的定义**

SDD 的核心思想是：先写规范（Spec），再写代码。规范是需求、架构、接口的精确定义，代码是规范的实现。AI 根据 Spec 生成代码，人类审查 Spec 而非逐行审查代码。

**与传统开发的区别**

| 维度 | 传统开发 | SDD 开发 |
|------|---------|---------|
| 需求载体 | PRD 文档（偏叙述性） | Spec 文档（偏结构化、可执行） |
| 开发驱动 | 任务驱动（按 Ticket 开发） | 规范驱动（按 Spec 开发） |
| 审查对象 | 代码审查 | Spec 审查 + 代码验证 |
| AI 角色 | 辅助编码 | 根据 Spec 自动生成代码 |
| 验收标准 | 人工判断 | Spec 定义的自动化验收 |

**Spec 的核心要素**

一份完整的 Spec 需要包含以下要素：

```markdown
## Feature Spec: User Registration

### Overview
实现用户注册功能，支持邮箱注册。

### Requirements
- 接收 email、password、name 三个字段
- email 必须唯一，格式校验
- password 强度：8位以上，包含大小写和数字
- 注册成功返回 userId 和 JWT Token

### API Definition
POST /api/users/register
Request: { email: string, password: string, name: string }
Response: { code: 0, message: "success", data: { userId: string, token: string } }
Error: { code: 400, message: "邮箱已注册" }

### Data Model
User { id: UUID, email: string(unique), passwordHash: string, name: string, createdAt: timestamp }

### Validation Rules
- email: RFC 5322 格式校验
- password: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit
- name: 2-50 chars, 不含特殊字符

### Acceptance Criteria
- 正常注册返回 200 和 token
- 重复邮箱返回 400
- 密码强度不足返回 400
- 数据库中 password 为 bcrypt hash，非明文
```

**为什么 Spec 对 AI 特别重要**

AI 生成代码的质量与输入的精确度成正比。模糊的指令产生模糊的代码，精确的 Spec 产生精确的代码。SDD 的价值在于：它强迫开发者在写代码之前把需求想清楚，而"想清楚"本身就是对需求的质量检验。

---

## 8.2 SDD 在二次开发场景中的落地

二次开发场景下，SDD 的落地重点是对已有功能的理解和改造的精确描述。

**步骤一：逆向生成 Spec**

对要改造的现有模块，先用 AI 逆向生成 Spec：

```bash
claude "分析 src/channel/discord/ 目录的代码，生成该模块的 Feature Spec，包括：
1. 支持的 API 接口
2. 数据模型
3. 业务规则
4. 错误处理逻辑"
```

AI 会阅读代码并生成结构化的 Spec。这个 Spec 经人工审查修正后，就成为后续改造的基准。

**步骤二：定义改造 Spec**

在逆向 Spec 的基础上，定义改造的目标：

```markdown
## Modification Spec: 新增飞书 Channel

### Base Spec
参见 Discord Channel Spec（逆向生成）

### Modifications
1. 新增 IChannel 实现：FeishuChannel
2. 消息格式映射：飞书消息 → 统一消息格式
3. 事件订阅：飞书事件 → Channel 事件
4. 认证方式：飞书 App ID + App Secret

### Constraints
- 不修改 IChannel 接口定义
- 不修改 Gateway 路由逻辑
- 新增文件放在 src/channel/feishu/ 目录下
```

**步骤三：按 Spec 开发和验证**

AI 根据 Modification Spec 生成代码，验证时对照 Spec 逐项检查。

---

## 8.3 SDD 在从零开发场景中的落地

从零开发场景下，SDD 的落地重点是需求的完整性和一致性。

**Spec 编写流程**

```
1. 用户故事 → 2. 功能 Spec → 3. 架构 Spec → 4. 接口 Spec → 5. 数据模型 Spec
```

每个阶段的 Spec 都是下一阶段的输入，也是 AI 生成代码的依据。

**用户故事模板**

```markdown
## User Story: 搜索景点

As a 游客
I want to 按关键词搜索景点
So that 我能快速找到感兴趣的目的地

### Acceptance Criteria
- 输入关键词后 1 秒内返回结果
- 支持按名称、城市、标签搜索
- 结果按相关度排序
- 支持分页，每页 20 条
```

**从用户故事到 Spec**

使用 AI 将用户故事转化为开发 Spec：

```bash
claude "将以下用户故事转化为开发 Feature Spec，包含 API 定义、数据模型、验证规则和验收标准：

[粘贴用户故事]"
```

AI 会自动补充边界条件、错误处理、数据校验等细节，人类审查补充后即可用于代码生成。

---

## 8.4 SDD 落地工具链介绍与选型建议

**openSpec**

openSpec 是一个开源的 Spec 管理工具，支持 Spec 的编写、评审、版本管理和自动化验收。

核心功能：

- Spec 模板：提供标准化的 Spec 编写模板
- 自动评审：AI 自动检查 Spec 的完整性、一致性和可实现性
- Spec → Code：根据 Spec 自动生成代码骨架
- 验收联动：Spec 中的验收标准自动转化为测试用例

```bash
# 安装 openSpec
npm install -g openspec

# 创建新 Spec
openspec init feature/user-registration

# 自动评审
openspec review feature/user-registration

# 根据 Spec 生成代码
openspec generate feature/user-registration --output src/
```

**superPower**

superPower 是一个 AI 驱动的代码生成和验证工具，与 openSpec 配合使用：

- 读取 Spec 文档，理解开发需求
- 根据 Spec 生成完整的代码实现
- 自动运行测试，对照 Spec 验收标准验证
- 生成验证报告

```bash
# 安装 superPower
npm install -g superpower

# 根据 Spec 驱动开发
superpower dev --spec feature/user-registration
```

**选型建议**

| 工具 | 适用场景 | 特点 |
|------|---------|------|
| openSpec | Spec 编写和管理 | 标准化模板 + 自动评审 |
| superPower | Spec 驱动代码生成 | AI 生成 + 自动验收 |
| Cursor + Spec | 轻量级 SDD 实践 | 手动编写 Spec，AI 生成代码 |
| Claude Code + Spec | 命令行 SDD 实践 | 终端操作，适合偏好 CLI 的开发者 |

---

## 8.5 SDD 与 Harness 的协同范式

SDD 和 Harness Engineering 不是替代关系，而是互补关系：

- **SDD 回答"做什么"**：通过 Spec 精确定义需求
- **Harness 回答"怎么做"**：通过工程机制确保 AI 可靠执行

**协同工作流**

```
SDD 阶段                          Harness 阶段
───────                          ──────────
需求分析                           │
  ↓                               │
Spec 编写                          │
  ↓                               │
Spec 评审（自动化）                  │
  ↓                               │
Spec 通过 ←──── 进入 ───────────────┤
                                  │
                                  ↓
                              任务拆解（Feature List）
                                  ↓
                              AI 代码生成（Agent Loop）
                                  ↓
                              自动验证（Verification Loop）
                                  ↓
                              代码评审（Evaluator）
                                  ↓
                              验收通过 → 更新 Spec 状态
```

**关键协同点**

1. **Spec 是 Feature List 的输入**：Harness 的任务拆解基于 Spec 定义
2. **Spec 中的验收标准是 Verification Loop 的依据**：自动化验收对照 Spec 执行
3. **Harness 的反馈更新 Spec**：验证中发现的问题反馈回 Spec 修订
4. **Evaluator 审查代码与 Spec 的一致性**：不仅审代码质量，更审是否与 Spec 一致

这种协同让开发流程形成完整闭环：Spec 驱动代码生成，代码验证对照 Spec，验证反馈更新 Spec。

---

**本章小结**

| 概念 | 核心要点 |
|------|---------|
| SDD 定义 | 先写规范再写代码，Spec 是需求的结构化精确定义 |
| Spec 要素 | Overview + Requirements + API + Data Model + Validation + Acceptance |
| 二次开发 | 逆向生成现有模块 Spec → 定义改造 Spec → 按规范开发验证 |
| 从零开发 | 用户故事 → 功能 Spec → 架构 Spec → 接口 Spec → 数据模型 Spec |
| 工具链 | openSpec（Spec 管理）+ superPower（代码生成与验收） |
| SDD + Harness | SDD 回答"做什么"，Harness 回答"怎么做"，协同形成完整闭环 |

下一章，我们将把 Harness Engineering 的核心能力逐一实操演练，从四相循环到上下文管理，从验证闭环到子代理分治，让你真正掌握驾驭 AI 的工程能力。
