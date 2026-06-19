# 第2章 AI 全栈开发工具链全景

工欲善其事，必先利其器。AI 全栈开发的第一步，是选对工具链。当前 AI 编程工具生态极为丰富，涵盖了从代码补全到项目级代码生成、从本地 IDE 到云端协作的多个层次。本章将横向对比六类主流工具，解析主流 AI 编码模型的能力差异，并深入介绍 Codex 和 Claude Code 两大核心工具的安装部署和核心功能，最终给出场景驱动的工具选型决策框架。

---

## 2.1 六类主流 AI 开发工具横向对比

根据功能定位和交互方式，当前主流 AI 开发工具可以分为六大类。理解这六类工具的定位差异，是合理选型的基础。

**第一类：AI 代码补全工具**

以 GitHub Copilot、Tabnine 为代表。这类工具的核心能力是基于当前上下文预测下一行或下一段代码。交互方式是开发者正常编码，AI 在后台实时提供补全建议。

适合场景：已有明确实现思路，需要加速编码速度的日常开发工作。

**第二类：对话式 AI 编程助手**

以 ChatGPT（Code Interpreter）、Claude、Gemini 为代表。开发者通过对话窗口描述需求，AI 返回代码或解释。交互方式是多轮对话，适合解决具体问题或学习新技术。

适合场景：学习新框架、调试报错、代码解释、算法设计。

**第三类：AI 原生 IDE**

以 Cursor、Windsurf 为代表。这类工具将 AI 能力深度集成到 IDE 中，支持代码生成、重构、解释、调试等全流程操作。交互方式是在 IDE 内直接用自然语言指令驱动开发。

适合场景：Vibe Coding 日常开发、代码重构、新项目从零搭建。

**第四类：命令行 AI 编程工具**

以 Claude Code、Aider 为代表。开发者在终端中与 AI 交互，AI 直接读写本地文件、执行命令、运行测试。交互方式是命令行指令，适合偏好终端的开发者。

适合场景：快速原型开发、脚本编写、命令行工具开发。

**第五类：规范驱动开发工具**

以 openSpec、superPower 为代表。这类工具专注于 SDD 规范驱动开发流程，支持 Spec 文档管理、自动化评审、代码生成一体化。交互方式是通过规范文档驱动 AI 开发。

适合场景：团队级规范开发、企业级项目、需要严格质量控制的场景。

**第六类：AI Agent 开发框架**

以 LangChain、AutoGPT、OpenDevin 为代表。这类工具用于构建自主 AI Agent，支持任务拆解、工具调用、长期记忆等能力。交互方式是配置 Agent 的行为和能力。

适合场景：复杂任务自动化、多步骤工作流、需要自主决策的场景。

| 类别 | 代表工具 | 核心能力 | 交互方式 | 学习曲线 |
|------|---------|---------|---------|---------|
| AI 代码补全 | Copilot、Tabnine | 行级/块级代码补全 | 编辑器内实时 | 低 |
| 对话式助手 | ChatGPT、Claude | 问答式代码生成 | 对话窗口 | 低 |
| AI 原生 IDE | Cursor、Windsurf | 全流程 AI 辅助 | IDE 内指令 | 中 |
| 命令行工具 | Claude Code、Aider | 文件级代码生成 | 终端命令 | 中 |
| 规范驱动工具 | openSpec、superPower | Spec 驱动开发 | 规范文档 | 高 |
| Agent 框架 | LangChain、AutoGPT | 自主任务执行 | 配置+代码 | 高 |

---

## 2.2 主流 AI 编码模型能力解析与选型

AI 编程工具的能力上限，本质上取决于底层模型的代码生成质量。当前主流 AI 编码模型各有侧重，理解它们的能力差异是工具选型的基础。

**GPT-4o / Codex 系列**

OpenAI 的 Codex 系列是 AI 编程的先驱。GPT-4o 在代码生成准确性、多语言支持、上下文理解方面表现均衡。其最大优势是推理能力强，能够处理复杂的逻辑问题。

核心能力：

- 支持 50+ 编程语言，Python、JavaScript、TypeScript 表现最佳
- 上下文窗口最大支持 128K Token
- 代码推理能力强，适合算法设计和复杂逻辑实现
- 对自然语言指令的理解精度高

官方文档：https://platform.openai.com/docs/models

限制：

- 无法感知本地文件系统（需要通过工具封装）
- 代码生成速度相对较慢
- 对最新库版本的支持有延迟

**Claude 3.5/3.7 Sonnet**

Anthropic 的 Claude 系列在代码生成领域表现突出，尤其擅长生成长段代码和保持代码风格一致性。其 200K Token 的超长上下文窗口是其最大优势。

核心能力：

- 200K Token 超长上下文，可容纳整个中型项目
- 代码风格一致性好，适合大型项目维护
- 对中文自然语言指令的理解精度高
- 支持代码解释、调试、重构等高级操作

官方文档：https://docs.anthropic.com/claude/docs

限制：

- 推理速度相对较慢
- 对某些小众语言支持不如 GPT-4o

**Gemini 1.5 Pro**

Google 的 Gemini 系列最大亮点是 1M Token 的上下文窗口，理论上可以容纳整个大型项目的代码库。

核心能力：

- 1M Token 上下文窗口，行业领先
- 与 Google 生态深度集成（Vertex AI、Firebase 等）
- 多模态能力强，支持图片转代码

官方文档：https://ai.google.dev/gemini-api/docs/models

限制：

- 代码生成质量略逊于 GPT-4o 和 Claude 3.5
- 在国内访问受限

**DeepSeek Coder V2**

国产模型中的佼佼者，在代码生成基准测试中表现优异，且支持中文指令理解。

核心能力：

- 160多种编程语言支持
- 16K Token 上下文窗口
- 对中文注释和中文变量名的支持好
- 开源，可本地部署

官方文档：https://platform.deepseek.com/docs

**模型选型建议**

| 场景 | 首选模型 | 备选模型 |
|------|---------|---------|
| 新项目从零搭建 | Claude 3.5 Sonnet | GPT-4o |
| 大型项目维护 | Claude 3.5 Sonnet | DeepSeek Coder V2 |
| 算法设计 | GPT-4o | Claude 3.5 Sonnet |
| 快速原型 | GPT-4o | Claude 3.5 Sonnet |
| 中文环境 | DeepSeek Coder V2 | Claude 3.5 Sonnet |
| 本地部署 | DeepSeek Coder V2 | CodeLlama |

---

## 2.3 Codex：安装部署与核心功能

Codex 是 OpenAI 基于 GPT 系列模型构建的 AI 编程产品线，涵盖 API 接口和多种开发者工具。在 Vibe Coding 实践中，Codex 通常通过 Cursor、Claude Code 等工具间接使用，也可以直接通过 API 集成到自定义工作流中。

**安装部署**

Codex 本身不提供独立的 IDE 插件，而是通过 API 供第三方工具调用。以下是通过官方 API 使用 Codex 的方式：

1. 注册 OpenAI 账号并获取 API Key：https://platform.openai.com/api-keys

2. 安装官方 SDK：

```bash
# Python
pip install openai

# Node.js
npm install openai
```

3. 基础调用示例：

```python
from openai import OpenAI

client = OpenAI(api_key="your-api-key")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个全栈开发专家，擅长 Python 和 React。"},
        {"role": "user", "content": "用 FastAPI 实现一个用户注册接口，包含参数校验和 JWT Token 生成"}
    ]
)

print(response.choices[0].message.content)
```

**在 Cursor 中使用 Codex**

Cursor 默认使用 Anthropic Claude 作为代码生成模型，但也支持配置 OpenAI API 作为模型后端：

1. 打开 Cursor 设置（Settings）
2. 进入 Model 配置页面
3. 添加 OpenAI API Key
4. 选择 gpt-4o 或 gpt-4-turbo 作为默认模型

**核心功能**

Codex 的核心能力通过 Chat Completions API 和 Assistants API 提供：

1. **代码生成**：根据自然语言描述生成完整函数或模块实现
2. **代码解释**：对已有代码进行逐行解释，适合代码审查和知识学习
3. **代码重构**：根据指定的优化目标（性能、可读性、安全性）重构代码
4. **单元测试生成**：为已有代码自动生成单元测试用例
5. **Bug 修复**：分析报错信息，定位问题并给出修复方案

```python
# Codex 生成的单元测试示例
def test_calculate_total():
    items = [
        {"price": 100, "quantity": 2},
        {"price": 50, "quantity": 1}
    ]
    assert calculate_total(items) == 250
```

**最佳实践**

- 使用 system prompt 设定 AI 的角色和能力边界，提高生成质量
- 对于复杂任务，采用多轮对话逐步细化，而不是一次性提交所有需求
- 始终对生成的代码进行人工审查，特别是涉及安全、性能、并发的部分

---

## 2.4 Claude Code：安装部署与核心功能

Claude Code 是 Anthropic 官方推出的命令行 AI 编程工具，支持直接在终端中与 Claude 模型交互，读取和写入本地文件，执行命令，运行测试。它是 Vibe Coding 实践中最高效的工具之一。

**安装部署**

1. 环境要求：

- Node.js 18 及以上版本
- macOS、Linux 或 Windows（WSL2）

2. 安装方式：

```bash
# 通过 npm 全局安装
npm install -g @anthropic-ai/claude-code

# 验证安装
claude --version
```

3. 账号配置：

Claude Code 支持两种认证方式：

方式一：官方 API Key

```bash
# 设置环境变量
export ANTHROPIC_API_KEY="your-api-key"

# 或者将 API Key 写入配置文件
claude config set apiKey "your-api-key"
```

方式二：通过 CC-Switch 接入（支持更多模型后端）

CC-Switch 是一个开源工具，可以将 Claude Code 连接到多个模型后端，包括 Anthropic 官方、AWS Bedrock、Google Vertex AI 等。

安装 CC-Switch：

```bash
npm install -g cc-switch
cc-switch config
```

官方文档：https://docs.anthropic.com/claude/docs/claude-code

**核心功能**

Claude Code 的核心交互方式是终端命令，以下是主要功能：

1. **文件级代码生成**：直接读取项目文件，理解上下文，生成并写入新代码

```bash
# 在项目根目录执行
claude "为 User 模型实现一个 CRUD 接口，使用 FastAPI"
```

Claude Code 会自动读取项目中的已有模型定义、路由结构、依赖配置，生成风格一致的代码并写入对应文件。

2. **代码审查与重构**：对指定文件或目录进行代码审查，给出改进建议

```bash
claude "审查 src/services/ 目录下的所有文件，找出潜在的性能问题和安全漏洞"
```

3. **Bug 定位与修复**：根据报错信息定位问题并自动修复

```bash
claude "修复最近一次 git commit 引入的 TypeError"
```

4. **测试生成与执行**：为已有代码生成测试用例并执行

```bash
claude "为 src/utils/validator.py 中的所有函数生成单元测试，并运行测试"
```

5. **项目级理解**：通过读取整个项目结构，回答架构相关问题

```bash
claude "这个项目的数据流是怎样的？主要的性能瓶颈可能在哪里？"
```

**与 Cursor 的协同**

Claude Code 可以作为 Cursor 的外部模型后端使用，结合两者的优势：

- Cursor 提供优秀的编辑器体验和可视化交互
- Claude Code 提供强大的终端级文件操作和命令执行能力

配置方式：在 Cursor 的 Model 设置中添加 Anthropic API Key，选择 Claude 3.5 Sonnet 作为默认模型。

---

## 2.5 工具精准选型策略：场景驱动的决策框架

工具选型没有"最好"，只有"最合适"。本节给出一个场景驱动的决策框架，帮助你在不同开发场景下选择最合适的工具组合。

**决策框架：三维度评估**

维度一：项目规模

- 小型项目（< 5000 行代码）：任意 AI 工具均可，首选 Cursor 或 Claude Code
- 中型项目（5000-50000 行）：需要关注上下文窗口，首选 Claude 3.5 Sonnet + Cursor
- 大型项目（> 50000 行）：需要 SDD 规范驱动，首选 openSpec + superPower + Harness Engineering

维度二：开发阶段

- 需求分析阶段：对话式助手（ChatGPT/Claude）+ SDD Spec 撰写
- 架构设计阶段：AI 原生 IDE（Cursor）+ 规范驱动工具
- 编码实现阶段：AI 原生 IDE（Cursor）+ 命令行工具（Claude Code）
- 测试验证阶段：AI 自动化测试工具 + 验证闭环
- 部署运维阶段：AI 辅助 DevOps 工具

维度三：团队规模

- 个人开发者：首选 Cursor + Claude Code，工具链简单，学习成本低
- 小团队（2-5人）：加入 openSpec 规范驱动，保证代码一致性
- 中大型团队（5人以上）：引入完整 Harness + SDD 体系，配合 CI/CD 实现自动化

**推荐工具组合**

| 场景 | 推荐工具组合 | 理由 |
|------|-------------|------|
| 个人学习/练习 | Cursor + Claude 3.5 Sonnet | 上手快，体验好，足够覆盖日常需求 |
| 个人项目/开源 | Cursor + Claude Code + openSpec | 兼顾开发效率和规范质量 |
| 创业公司 MVP | Cursor + Claude Code + superPower | 快速迭代，规范适度 |
| 企业级项目 | Harness + SDD + openSpec + superPower | 质量可控，流程规范，可追溯 |
| 遗留系统改造 | Claude 3.5 Sonnet + Cursor + SDD | 超长上下文理解旧代码，规范驱动改造 |
| AI 产品本身 | LangChain/AutoGPT + Claude 3.5 | 需要 Agent 能力，模型推理能力强 |

**选型决策树**

```
开始选型
  |
  ├─ 项目规模？
  |    ├─ 小型 → Cursor 或 Claude Code
  |    ├─ 中型 → Cursor + Claude 3.5 Sonnet
  |    └─ 大型 → Harness + SDD + 规范驱动工具
  |
  ├─ 是否需要本地部署？
  |    ├─ 是 → DeepSeek Coder V2 + 自托管工具链
  |    └─ 否 → 继续评估
  |
  ├─ 主要开发语言？
  |    ├─ Python → Claude 3.5 / GPT-4o
  |    ├─ JavaScript/TypeScript → Cursor + Claude 3.5
  |    └─ 其他 → 参考各模型多语言支持情况
  |
  └─ 团队是否有规范驱动开发经验？
       ├─ 是 → 直接引入 Harness + SDD
       └─ 否 → 从 Cursor 开始，逐步引入规范
```

**工具学习优先级**

对于刚开始接触 Vibe Coding 的开发者，建议按以下顺序学习工具：

1. 先掌握 Cursor 的基础操作（1-2天）：代码补全、Chat 对话、代码生成
2. 再学习 Claude Code 的终端操作（1天）：文件操作、命令执行、代码审查
3. 然后引入 openSpec 学习规范驱动开发（3-5天）
4. 最后系统性学习 Harness Engineering 工程框架（1-2周）

不要试图一次性掌握所有工具。先在一个真实项目中用起来，遇到问题再针对性学习，效率最高。

---

**本章小结**

| 概念 | 核心要点 |
|------|---------|
| 六类工具 | 代码补全、对话助手、AI IDE、命令行工具、规范驱动工具、Agent 框架，各有定位 |
| 模型选型 | GPT-4o 推理强，Claude 3.5 上下文长，Gemini 1.5 窗口超大，DeepSeek 可本地部署 |
| Codex | 通过 API 使用，适合集成到自定义工作流，Cursor 可配置为 Codex 后端 |
| Claude Code | 终端级 AI 编程工具，支持文件操作、命令执行、代码审查，效率极高 |
| 选型框架 | 按项目规模、开发阶段、团队规模三维度评估，场景驱动选择工具组合 |

下一章，我们将从零开始搭建全栈开发环境，包括 AI 编程 IDE 的安装配置、Repo Wiki 的构建、前后端运行环境的准备，为后续实战打下坚实基础。
