# 第1章 智能体时代：从大模型到AI Agent

2023年，ChatGPT横空出世，让全世界见识了大语言模型的对话能力。但对话只是起点——当模型不再只是"回答问题"，而是开始"主动做事"，一个全新的技术范式就诞生了。这就是AI Agent。

## 1.1 AI 2.0时代的范式转移：从Chatbot到Agent

### 从被动应答到主动行动

传统Chatbot的工作模式可以用一句话概括：**你问我答**。用户输入一段文字，模型返回一段文字，交互到此结束。这种模式下，模型是被动的——它不会主动获取信息，不会调用工具，更不会连续执行多步操作来完成一个复杂任务。

AI Agent则完全不同。它的核心特征是**自主性**（Autonomy）：

| 维度 | Chatbot | AI Agent |
|------|---------|----------|
| 交互模式 | 单轮问答 | 多轮自主决策 |
| 工具使用 | 无 | 可调用搜索、代码执行、API等 |
| 任务完成 | 返回文本 | 返回执行结果 |
| 规划能力 | 无 | 可分解任务、制定计划 |
| 错误处理 | 无法自我修正 | 可反思、重试、调整策略 |

### 范式转移的三个信号

1. **OpenAI推出Function Calling**：2023年6月，OpenAI在API中引入了Function Calling机制，让模型能够"声明"自己需要调用哪个函数。这是从Chatbot到Agent的关键基础设施。

2. **AutoGPT引爆社区**：同年3月，AutoGPT项目在GitHub上迅速获得超过10万Star。它展示了一个无需人类干预、能自主完成任务的AI系统雏形——虽然还很粗糙，但方向已经清晰。

3. **多模态能力开放**：GPT-4V、Gemini等模型开始支持图像、语音输入，Agent的"感知"能力从纯文本扩展到多模态，为更复杂的现实交互打开了大门。

> 参考文档：[OpenAI Function Calling指南](https://platform.openai.com/docs/guides/function-calling)

## 1.2 AI Agent的核心定义与通用架构（感知-规划-行动）

### 什么是AI Agent？

AI Agent是一个**能够感知环境、自主规划、执行动作以达成目标**的智能系统。这个定义源自经典的智能体理论，但在LLM时代有了全新的内涵。

与传统的规则驱动Agent不同，LLM-based Agent的核心驱动力是大语言模型——它既是"大脑"负责理解与推理，也是"协调器"负责调度各类工具和资源。

### 感知-规划-行动架构

几乎所有现代AI Agent框架都遵循"感知-规划-行动"（Perceive-Plan-Act）的三层架构：

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

**感知层**负责信息输入。包括用户的自然语言指令、上一步工具的返回结果、外部环境的状态变化等。在多模态Agent中，图像和语音也属于感知输入。

**规划层**是Agent的"大脑"。它决定下一步做什么——是继续推理、调用工具、还是直接返回答案。ReAct、思维链（CoT）、思维树（ToT）等推理模式都运行在规划层。

**行动层**负责执行。通过Function Calling调用外部工具、执行Python代码、发送HTTP请求等。行动层的输出会反馈给感知层，形成闭环。

### 记忆：隐式的第四层

严格来说，还有一个横跨三层的组件——**记忆系统**。短期记忆（上下文窗口）和长期记忆（向量数据库）为Agent提供知识的连续性。后续第3章会深入探讨。

## 1.3 主流开发框架全景图（LangChain, AutoGPT, MetaGPT等）

### 框架分类与选型

当前AI Agent开发框架已经形成了丰富的生态，按照抽象层次和适用场景可以分为以下几类：

| 框架 | 类型 | 特点 | 适用场景 |
|------|------|------|----------|
| LangChain | 通用框架 | 模块化设计，生态丰富，文档完善 | 快速原型、通用Agent |
| LlamaIndex | 数据框架 | RAG能力突出，索引与检索优化 | 知识库驱动型Agent |
| AutoGPT | 自主Agent | 全自动执行，目标驱动 | 探索性实验 |
| MetaGPT | 多Agent | 角色扮演，SOP流程 | 软件开发、团队协作模拟 |
| CrewAI | 多Agent | 角色定义简洁，上手快 | 团队协作型任务 |
| Semantic Kernel | 企业框架 | 微软出品，与Azure生态深度集成 | 企业级应用 |
| Dify | 低代码平台 | 可视化编排，开箱即用 | 快速搭建、非开发人员 |
| AutoGen | 多Agent对话 | 微软研究院，对话驱动协作 | 研究、多轮对话Agent |

### LangChain：事实上的标准

LangChain是目前使用最广泛的Agent开发框架，它的核心设计理念是**组合性**——将LLM、工具、记忆、链式调用等模块像积木一样组合起来。

```python
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 定义LLM
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# 定义提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有用的AI助手，可以调用工具来完成任务。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# 创建Agent
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 运行
result = agent_executor.invoke({"input": "今天北京天气怎么样？"})
```

> 参考文档：[LangChain官方文档](https://python.langchain.com/docs/)

### MetaGPT：多Agent的标杆

MetaGPT的创新在于引入了**SOP（标准操作流程）**——让多个Agent按照软件工程的最佳实践协作：

```python
from metagpt.software_company import generate_repo, ProjectRepo

# 一句话启动"软件公司"
repo: ProjectRepo = await generate_repo("创建一个贪吃蛇游戏")
print(repo)  # 输出完整的项目代码
```

MetaGPT会自动分配产品经理、架构师、工程师等角色，各角色按照SOP依次完成需求分析、架构设计、编码实现。这种模式非常适合结构化的复杂任务。

> 参考文档：[MetaGPT GitHub仓库](https://github.com/geekan/MetaGPT)

### 选型建议

- **入门学习**：从LangChain开始，文档最完善，社区最活跃
- **RAG场景**：LlamaIndex在检索和索引方面更专业
- **多Agent协作**：CrewAI上手简单，MetaGPT功能更强
- **企业应用**：Semantic Kernel + Azure生态
- **快速验证**：Dify的可视化编排可以快速跑通流程

## 1.4 开发环境搭建：Python环境与API密钥配置

### Python环境准备

推荐使用Python 3.10+，搭配虚拟环境管理：

```bash
# 使用conda创建环境
conda create -n agent-dev python=3.11
conda activate agent-dev

# 或使用venv
python3.11 -m venv agent-env
source agent-env/bin/activate  # macOS/Linux
# agent-env\Scripts\activate   # Windows
```

### 核心依赖安装

```bash
# LangChain核心包
pip install langchain langchain-openai langchain-community

# 向量数据库（第3章会用到）
pip install chromadb

# 工具相关
pip install wikipedia duckduckgo-search

# 环境变量管理
pip install python-dotenv
```

### API密钥配置

最佳实践是将API密钥存储在`.env`文件中，而非硬编码：

```bash
# .env文件
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_BASE=https://api.openai.com/v1  # 或国内代理地址
```

然后在代码中加载：

```python
from dotenv import load_dotenv
load_dotenv()  # 自动加载.env文件中的环境变量

import os
api_key = os.getenv("OPENAI_API_KEY")
```

| 环境变量 | 用途 | 获取方式 |
|----------|------|----------|
| OPENAI_API_KEY | OpenAI API密钥 | [platform.openai.com](https://platform.openai.com/api-keys) |
| OPENAI_API_BASE | API基础地址（代理） | 自建代理或第三方中转 |
| SERPAPI_KEY | 搜索工具API密钥 | [serpapi.com](https://serpapi.com/) |
| TAVILY_API_KEY | Tavily搜索API | [tavily.com](https://tavily.com/) |

> **安全提醒**：永远不要将`.env`文件提交到Git仓库。确保`.gitignore`中包含`.env`。

## 1.5 实战预热：构建你的第一个"Hello World" Agent

现在，让我们动手构建一个最简单的Agent。这个Agent可以回答问题，也能调用搜索工具获取实时信息。

### 完整代码

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun

# 1. 初始化LLM
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

# 4. 构建Agent
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 5. 运行
response = agent_executor.invoke({
    "input": "2024年诺贝尔物理学奖颁给了谁？"
})
print(response["output"])
```

### 运行效果

当你运行这段代码，Agent的执行过程大致如下：

```
> Entering new AgentExecutor chain...

思考：我需要搜索最新的诺贝尔物理学奖信息
动作：duckduckgo_search
动作输入："2024年诺贝尔物理学奖"
观察：[搜索结果...]

思考：我已获得信息，可以回答
最终答案：2024年诺贝尔物理学奖颁给了John Hopfield和Geoffrey Hinton，
以表彰他们在机器学习和人工神经网络方面的基础性发现和发明。

> Finished chain.
```

### 发生了什么？

1. Agent接收到问题后，**判断**自己是否需要搜索
2. 决定调用搜索工具，**构建**搜索查询
3. 获取搜索结果，**理解**并提取关键信息
4. **生成**最终答案返回给用户

这就是一个完整的"感知-规划-行动"循环。虽然简单，但它包含了Agent的所有核心要素：LLM推理、工具调用、自主决策。

### 本章小结

| 概念 | 关键点 |
|------|--------|
| 范式转移 | 从Chatbot的被动应答到Agent的主动行动 |
| 核心架构 | 感知-规划-行动三层 + 记忆系统 |
| 框架选型 | LangChain通用、LlamaIndex偏RAG、MetaGPT多Agent |
| 环境搭建 | Python 3.10+、虚拟环境、.env管理密钥 |
| Hello World | 最简单的Agent = LLM + 工具 + 提示词模板 |

> 下一章，我们将深入Agent的"大脑"——提示词工程与思维链，学习如何让模型更聪明地思考。
