# 第1章 智能体时代：从大模型到AI Agent

> 本文是「AI Agent应用开发实战」小册的开篇。笔者在过往一年里用 LangChain / MetaGPT 跑过不下 20 个 Agent 项目，踩过从工具调用失败、记忆爆栈到多Agent死锁的各种坑。本章先帮大家把"什么是 Agent、为什么要学、怎么起步"这三件事讲清楚，后续章节再逐层深入。

## 1.1 为什么 2024 年大家都开始聊 Agent

### 一个真实的转折点

2023 年 3 月，笔者第一次跑通 AutoGPT 时非常兴奋——它 seemingly 能"自己上网查资料、自己写代码、自己调试"。但跑了半小时后，它就陷入了一个死循环：不断搜索同一个问题，不断调用同一个脚本，token 烧了一堆，任务却没推进。

这个反差让笔者意识到一件事：**从 Chatbot 到 Agent，不是把模型接几个工具那么简单，而是一次完整的工程范式迁移。**

传统 Chatbot 的工作模式可以用一句话概括：**你问我答**。用户输入一段文字，模型返回一段文字，交互到此结束。这种模式下，模型是被动的——它不会主动获取信息，不会调用工具，更不会连续执行多步操作来完成复杂任务。

AI Agent 的核心特征是**自主性**（Autonomy）：

| 维度 | Chatbot | AI Agent |
|------|---------|----------|
| 交互模式 | 单轮问答 | 多轮自主决策 |
| 工具使用 | 无 | 可调用搜索、代码执行、API 等 |
| 任务完成 | 返回文本 | 返回执行结果 |
| 规划能力 | 无 | 可分解任务、制定计划 |
| 错误处理 | 无法自我修正 | 可反思、重试、调整策略 |

### 三个值得关注的工程信号

笔者挑选了三个对开发者影响最大的事件，它们共同构成了 Agent 走向工程化的基础设施：

1. **OpenAI 推出 Function Calling（2023.6）**：模型第一次有了"声明式工具调用"的能力。在它之前，开发者只能靠正则解析模型输出来模拟工具调用，稳定性极差。Function Calling 让"模型决定调用哪个工具"变成了一等公民。

2. **AutoGPT 引爆社区（2023.3）**：虽然工程上很粗糙，但它第一次让大众看到"无人干预的自主任务执行"是可行的。GitHub 上 10 万+ Star 说明这件事戳中了很多人的痛点。

3. **多模态能力开放**：GPT-4V、Gemini 等模型开始支持图像、语音输入。Agent 的"感知"能力从纯文本扩展到多模态，这意味着更多现实场景可以被 Agent 覆盖。

> 笔者注：这里只列了三个最有代表性的信号。实际上 LangChain 0.1、LlamaIndex 工作流、微软 AutoGen 等也都是重要节点，后续章节会展开。

## 1.2 AI Agent 的核心定义与通用架构

### 什么是 AI Agent

AI Agent 是一个**能够感知环境、自主规划、执行动作以达成目标**的智能系统。这个定义源自经典的智能体理论，但在 LLM 时代有了全新的内涵。

与传统的规则驱动 Agent 不同，LLM-based Agent 的核心驱动力是大语言模型——它既是"大脑"负责理解与推理，也是"协调器"负责调度各类工具和资源。

笔者在实战中体会最深的一点是：**Agent 不是"更强的 LLM"，而是"LLM + 工程化闭环"**。同样一个 GPT-4o，包一层感知-规划-行动的循环，能完成的任务复杂度会上升一个数量级。

### 感知-规划-行动架构

几乎所有现代 AI Agent 框架都遵循"感知-规划-行动"（Perceive-Plan-Act）的三层架构：

```
+------------------------------------------+
|              感知层 (Perception)          |
|  接收用户输入、环境状态、工具返回结果      |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|              规划层 (Planning)            |
|  理解意图 -> 分解任务 -> 选择策略         |
|  ReAct / CoT / ToT 等推理框架            |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|              行动层 (Action)              |
|  调用工具、执行代码、返回结果             |
|  Function Calling / API / 代码解释器     |
+------------------------------------------+
```

**感知层**负责信息输入。包括用户的自然语言指令、上一步工具的返回结果、外部环境的状态变化等。在多模态 Agent 中，图像和语音也属于感知输入。

**规划层**是 Agent 的"大脑"。它决定下一步做什么——是继续推理、调用工具、还是直接返回答案。ReAct、思维链（CoT）、思维树（ToT）等推理模式都运行在规划层。

**行动层**负责执行。通过 Function Calling 调用外部工具、执行 Python 代码、发送 HTTP 请求等。行动层的输出会反馈给感知层，形成闭环。

> 实战提醒：这三层不是物理隔离的代码模块，而是逻辑上的职责划分。在 LangChain 中，它们可能混在一个 AgentExecutor 里；在 MetaGPT 中，它们被拆成多个 Role。理解架构比记 API 更重要。

### 记忆：隐式的第四层

严格来说，还有一个横跨三层的组件——**记忆系统**。短期记忆（上下文窗口）和长期记忆（向量数据库）为 Agent 提供知识的连续性。

笔者踩过一个非常典型的坑：让 Agent 连续处理 20 轮对话后，它开始"失忆"——忘记用户最初的目标。根因是上下文窗口溢出，老的消息被截断。解决方案是引入向量数据库做长期记忆，把关键信息显式存下来。这部分第 3 章会深入展开。

## 1.3 主流开发框架全景图

### 框架分类与选型

当前 AI Agent 开框架已经形成了丰富的生态，按照抽象层次和适用场景可以分为以下几类：

| 框架 | 类型 | 特点 | 适用场景 |
|------|------|------|----------|
| LangChain | 通用框架 | 模块化设计，生态丰富，文档完善 | 快速原型、通用 Agent |
| LlamaIndex | 数据框架 | RAG 能力突出，索引与检索优化 | 知识库驱动型 Agent |
| AutoGPT | 自主 Agent | 全自动执行，目标驱动 | 探索性实验 |
| MetaGPT | 多 Agent | 角色扮演，SOP 流程 | 软件开发、团队协作模拟 |
| CrewAI | 多 Agent | 角色定义简洁，上手快 | 团队协作型任务 |
| Semantic Kernel | 企业框架 | 微软出品，与 Azure 生态深度集成 | 企业级应用 |
| Dify | 低代码平台 | 可视化编排，开箱即用 | 快速搭建、非开发人员 |
| AutoGen | 多 Agent 对话 | 微软研究院，对话驱动协作 | 研究、多轮对话 Agent |

### LangChain：事实上的标准

LangChain 是目前使用最广泛的 Agent 开发框架，它的核心设计理念是**组合性**——将 LLM、工具、记忆、链式调用等模块像积木一样组合起来。

```python
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 定义 LLM
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# 定义提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有用的 AI 助手，可以调用工具来完成任务。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# 创建 Agent（tools 需提前定义）
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 运行
result = agent_executor.invoke({"input": "今天北京天气怎么样？"})
```

> 笔者注：LangChain 0.1 之后 API 变化较大，网上很多老教程已经跑不通。建议直接看官方文档示例，不要照搬 2023 年的博客。

### MetaGPT：多 Agent 的标杆

MetaGPT 的创新在于引入了 **SOP（标准操作流程）**——让多个 Agent 按照软件工程的最佳实践协作：

```python
from metagpt.software_company import generate_repo, ProjectRepo

# 一句话启动"软件公司"
repo: ProjectRepo = await generate_repo("创建一个贪吃蛇游戏")
print(repo)  # 输出完整的项目代码
```

MetaGPT 会自动分配产品经理、架构师、工程师等角色，各角色按照 SOP 依次完成需求分析、架构设计、编码实现。这种模式非常适合结构化的复杂任务。

> 实战提醒：MetaGPT 跑一次完整流程 token 消耗很大，建议先用最便宜的模型（如 gpt-4o-mini）跑通流程，再换强模型优化质量。

### 选型建议（基于笔者实战经验）

- **入门学习**：从 LangChain 开始，文档最完善，社区最活跃。但要做好 API 频繁变更的心理准备。
- **RAG 场景**：LlamaIndex 在检索和索引方面更专业，尤其是复杂文档（PDF、表格）的处理。
- **多 Agent 协作**：CrewAI 上手简单，适合入门；MetaGPT 功能更强，但学习曲线陡峭。
- **企业应用**：Semantic Kernel + Azure 生态，合规性和稳定性有保障。
- **快速验证**：Dify 的可视化编排可以快速跑通流程，适合非开发同学或 PoC 阶段。

## 1.4 开发环境搭建

### Python 环境准备

推荐使用 Python 3.10+，搭配虚拟环境管理：

```bash
# 使用 conda 创建环境
conda create -n agent-dev python=3.11
conda activate agent-dev

# 或使用 venv
python3.11 -m venv agent-env
source agent-env/bin/activate  # macOS/Linux
# agent-env\Scripts\activate   # Windows
```

> 踩坑提醒：千万别用系统自带的 Python 跑 Agent 项目。LangChain 依赖的 pydantic、chromadb 等库版本冲突很常见，虚拟环境是刚需。

### 核心依赖安装

```bash
# LangChain 核心包
pip install langchain langchain-openai langchain-community

# 向量数据库（第 3 章会用到）
pip install chromadb

# 工具相关
pip install wikipedia duckduckgo-search

# 环境变量管理
pip install python-dotenv
```

> 版本提醒：LangChain 迭代极快，建议用 `pip install langchain==0.1.x` 锁定版本，避免某天 `pip install -U` 之后代码全崩。

### API 密钥配置

最佳实践是将 API 密钥存储在 `.env` 文件中，而非硬编码：

```bash
# .env 文件
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_BASE=https://api.openai.com/v1  # 或国内代理地址
```

然后在代码中加载：

```python
from dotenv import load_dotenv
load_dotenv()  # 自动加载 .env 文件中的环境变量

import os
api_key = os.getenv("OPENAI_API_KEY")
```

| 环境变量 | 用途 |
|----------|------|
| OPENAI_API_KEY | OpenAI API 密钥 |
| OPENAI_API_BASE | API 基础地址（代理） |
| SERPAPI_KEY | 搜索工具 API 密钥 |
| TAVILY_API_KEY | Tavily 搜索 API |

> **安全提醒**：永远不要将 `.env` 文件提交到 Git 仓库。确保 `.gitignore` 中包含 `.env`。笔者见过太多把 API Key 推到公开仓库导致一夜扣费上千刀的案例。

## 1.5 实战预热：构建你的第一个 Agent

现在，让我们动手构建一个最简单的 Agent。这个 Agent 可以回答问题，也能调用搜索工具获取实时信息。

### 完整代码

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun

# 1. 初始化 LLM
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# 2. 定义工具
search = DuckDuckGoSearchRun()
tools = [search]

# 3. 创建提示词
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个智能助手。当无法回答时，请使用搜索工具查找信息。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# 4. 构建 Agent
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 5. 运行
response = agent_executor.invoke({
    "input": "2024 年诺贝尔物理学奖颁给了谁？"
})
print(response["output"])
```

### 运行效果

当你运行这段代码，Agent 的执行过程大致如下：

```
> Entering new AgentExecutor chain...

思考：我需要搜索最新的诺贝尔物理学奖信息
动作：duckduckgo_search
动作输入："2024 年诺贝尔物理学奖"
观察：[搜索结果...]

思考：我已获得信息，可以回答
最终答案：2024 年诺贝尔物理学奖颁给了 John Hopfield 和 Geoffrey Hinton，
以表彰他们在机器学习和人工神经网络方面的基础性发现和发明。

> Finished chain.
```

### 发生了什么？

1. Agent 接收到问题后，**判断**自己是否需要搜索
2. 决定调用搜索工具，**构建**搜索查询
3. 获取搜索结果，**理解**并提取关键信息
4. **生成**最终答案返回给用户

这就是一个完整的"感知-规划-行动"循环。虽然简单，但它包含了 Agent 的所有核心要素：LLM 推理、工具调用、自主决策。

> 笔者注：第一次跑通时建议开 `verbose=True`，观察 Agent 的思考过程。这对后续调试 Prompt、优化工具选择策略非常关键。很多"Agent 不按预期行动"的问题，都能从 verbose 日志里找到线索。

### 常见踩坑

笔者第一次跑这段代码时遇到了三个坑，这里提前提醒大家：

1. **DuckDuckGo 搜索偶尔失败**：国内网络环境不稳定时会超时。解决方案是加 retry，或换用 SerpAPI / Tavily。
2. **Agent 死循环**：模型偶尔会陷入"调用工具 → 拿到结果 → 再次调用工具"的死循环。解决方案是在 AgentExecutor 上设置 `max_iterations=5`。
3. **输出格式不稳定**：某些模型不会严格按 ReAct 格式输出。解决方案是用 `create_openai_tools_agent`（基于 Function Calling）而非老的 `initialize_agent`。

## 本章小结

| 概念 | 关键点 |
|------|--------|
| 范式转移 | 从 Chatbot 的被动应答到 Agent 的主动行动 |
| 核心架构 | 感知-规划-行动三层 + 记忆系统 |
| 框架选型 | LangChain 通用、LlamaIndex 偏 RAG、MetaGPT 多 Agent |
| 环境搭建 | Python 3.10+、虚拟环境、.env 管理密钥 |
| Hello World | 最简单的 Agent = LLM + 工具 + 提示词模板 |

> 下一章，我们将深入 Agent 的"大脑"——提示词工程与思维链，学习如何让模型更聪明地思考。
