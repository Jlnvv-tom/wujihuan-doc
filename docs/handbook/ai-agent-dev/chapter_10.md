# 第10章 LangChain 入门实战：从零搭建你的第一个 Agent

LangChain 学了3天，代码写了200行，一问三不知。问题出在哪？你在学框架，不是在学 Agent。

我是怕浪猫，前面用了9章做平台和工具实战，从这章开始进入纯代码框架的硬核部分。先从 LangChain 开始——目前最流行的 LLM 应用开发框架，没有之一。

---

## 10.1 LangChain 核心概念速览

**LangChain 是什么？**

LangChain 是一个 LLM 应用开发框架，核心理念是"把大模型和外部工具连接起来"。它不只是一个库，而是一套完整的工具链——从模型调用到工具管理，从记忆系统到 Agent 执行，一条龙。

**核心模块**

```
LangChain 核心模块
├── Models（模型）       → 对接各类 LLM
├── Prompts（提示词）    → 管理和优化提示词
├── Chains（链）         → 多步调用串联
├── Tools（工具）        → 外部工具接入
├── Agents（智能体）     → 自主决策和执行
├── Memory（记忆）       → 对话上下文管理
├── Document（文档）     → 文档加载和处理
└── Retrieval（检索）    → RAG 能力
```

**安装**

```bash
pip install langchain langchain-openai langchain-community
```

官方文档：https://python.langchain.com/

> LangChain 最大的优势是"生态最全"——你想要的基本都有。最大的问题是"学习曲线陡"——东西太多了。

---

## 10.2 Model、Prompt、Chain 基础三件套

**Model：模型调用**

```python
from langchain_openai import ChatOpenAI

# 初始化模型
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0.7,
    api_key="sk-xxx"
)

# 直接调用
response = llm.invoke("杭州有什么好玩的景点？")
print(response.content)
```

**Prompt：提示词管理**

```python
from langchain_core.prompts import ChatPromptTemplate

# 创建提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个专业的旅行顾问，擅长推荐{region}的景点。"),
    ("human", "请推荐3个必去的景点，每个景点用一句话描述。")
])

# 填充模板
formatted_prompt = prompt.format(region="杭州")
```

**Chain：串联执行**

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

# 创建链
chain = prompt | llm

# 执行链
result = chain.invoke({"region": "杭州"})
```

**完整示例：旅游推荐助手**

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. 模型
llm = ChatOpenAI(model="gpt-4o")

# 2. 提示词
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个{role}。"),
    ("human", "{user_input}")
])

# 3. 输出解析器
output_parser = StrOutputParser()

# 4. 组装链
chain = prompt | llm | output_parser

# 5. 执行
result = chain.invoke({
    "role": "专业的杭州旅游顾问",
    "user_input": "推荐3个必去景点"
})
print(result)
```

---

## 10.3 工具函数与自定义工具

**内置工具**

```python
from langchain_community.tools import WikipediaQueryRun
from langchain_community.utilities import WikipediaAPIWrapper
from langchain.tools import Tool

# 内置工具
wikipedia = WikipediaQueryRun(
    api_wrapper=WikipediaAPIWrapper()
)
```

**自定义工具**

```python
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取指定城市的当前天气。"""
    # 实际实现调用天气API
    return f"{city}今日气温15-22度，多云"

@tool
def search_flights(departure: str, destination: str, date: str) -> str:
    """查询航班信息。"""
    return f"{departure}到{destination}有3个航班：\n" \
           f"1. CA1234 08:00-09:30\n" \
           f"2. MU5678 12:00-13:30\n" \
           f"3. CZ9012 18:00-19:30"

tools = [get_weather, search_flights]
```

> 工具函数有三个要点：功能单一、参数明确、文档清晰。工具写得好，Agent 才知道什么场景下该用什么工具。

---

## 10.4 Memory 记忆系统集成

**对话记忆**

```python
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain
from langchain_openai import ChatOpenAI

# 创建记忆
memory = ConversationBufferMemory(
    return_messages=True,
    memory_key="history"
)

# 创建对话链
conversation = ConversationChain(
    llm=ChatOpenAI(model="gpt-4o"),
    memory=memory,
    verbose=True
)

# 对话
response1 = conversation.predict(input="我叫小明")
response2 = conversation.predict(input="你还记得我叫什么吗？")
# 可以正确回答"小明"
```

**记忆类型对比**

| 类型 | 特点 | 适用场景 |
|------|------|---------|
| BufferMemory | 存储所有对话 | 短对话 |
| SlidingWindowMemory | 只保留最近N轮 | 长对话 |
| SummaryMemory | 自动总结历史 | 超长对话 |
| VectorStoreMemory | 向量存储检索 | 跨会话记忆 |
| Neo4jMemory | 知识图谱存储 | 结构化关系记忆 |

---

## 10.5 Agent 执行循环详解

**Agent 的执行流程**

```
用户输入
    ↓
1. Agent 思考（Thought）：分析当前情况
2. Agent 行动（Action）：选择工具和参数
3. 工具执行（Observation）：获取结果
4. Agent 再次思考（Thought）：评估结果
    ↑ 循环直到有最终答案 ↓
5. 输出最终答案（Final Answer）
```

**创建 ReAct Agent**

```python
from langchain.agents import create_react_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """搜索网络获取信息。"""
    return f"关于'{query}'的搜索结果..."

@tool
def calculate(expression: str) -> str:
    """执行数学计算。"""
    return str(eval(expression))

tools = [search_web, calculate]

llm = ChatOpenAI(model="gpt-4o")

# ReAct 提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手。使用工具来回答问题。"),
    ("human", "{input}"),
    ("assistant", "{agent_scratchpad}")
])

agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent, 
    tools=tools, 
    verbose=True,
    max_iterations=5
)

result = agent_executor.invoke({
    "input": "2024年中国GDP是多少？如果用这个数字除以14亿人口，每人平均多少？"
})
```

**AgentExecutor 参数说明**

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| max_iterations | 最大循环次数 | 5-10 |
| max_execution_time | 最大执行时间（秒） | 30-60 |
| early_stopping_method | 提前停止策略 | "generate" |
| handle_parsing_errors | 解析错误处理 | True |
| return_intermediate_steps | 返回中间步骤 | 调试时True |

---

## 10.6 实战：数据库查询 Agent

**场景**

构建一个可以查询 MySQL 数据库的 Agent，用户用自然语言问问题，Agent 自动生成 SQL 并执行。

**实现**

```python
from langchain.tools import tool
from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
import sqlite3

@tool
def query_database(sql: str) -> str:
    """执行SQL查询并返回结果。"""
    conn = sqlite3.connect("orders.db")
    cursor = conn.cursor()
    try:
        cursor.execute(sql)
        results = cursor.fetchall()
        conn.close()
        return str(results)
    except Exception as e:
        conn.close()
        return f"查询错误：{str(e)}"

@tool
def get_table_schema() -> str:
    """获取数据库表结构。"""
    conn = sqlite3.connect("orders.db")
    cursor = conn.cursor()
    cursor.execute("""
        SELECT name, sql FROM sqlite_master 
        WHERE type='table'
    """)
    schemas = cursor.fetchall()
    conn.close()
    return "\n".join([f"表名：{s[0]}\n结构：{s[1]}" for s in schemas])

tools = [query_database, get_table_schema]

agent = create_react_agent(
    ChatOpenAI(model="gpt-4o"),
    tools,
    ChatPromptTemplate.from_messages([
        ("system", "你是一个数据库助手。根据用户问题生成SQL并执行。"),
        ("human", "{input}"),
        ("assistant", "{agent_scratchpad}")
    ])
)

executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 用户自然语言查询
result = executor.invoke({
    "input": "上个月销量最高的3个商品是什么？"
})
```

---

## 10.7 实战：RAG 知识库问答 Agent

**场景**

构建一个基于文档的问答系统，用户上传文档后可以提问。

**实现**

```python
from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.tools import tool

# 1. 加载文档
loader = TextLoader("./document.txt")
documents = loader.load()

# 2. 切片
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=100
)
chunks = text_splitter.split_documents(documents)

# 3. 向量化并存储
vectorstore = FAISS.from_documents(
    chunks, 
    OpenAIEmbeddings()
)

# 4. 创建检索工具
@tool
def search_knowledge(query: str) -> str:
    """在知识库中搜索相关信息。"""
    results = vectorstore.similarity_search(query, k=3)
    return "\n".join([r.page_content for r in results])

tools = [search_knowledge]

# 5. 创建 Agent
agent = create_react_agent(
    ChatOpenAI(model="gpt-4o"),
    tools,
    agent_prompt
)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({
    "input": "文档中提到了哪些数据安全措施？"
})
```

---

## 10.8 LangChain 最佳实践

**5个必知技巧**

1. **Prompt 模板化**：所有提示词用模板管理，不要硬编码
2. **工具单一职责**：一个工具做一件事，参数越少越好
3. **设置执行限制**：永远设置 max_iterations，防止死循环
4. **错误处理**：每个工具都要考虑异常情况
5. **进度监控**：verbose=True 用于调试，生产环境用回调

**常见陷阱**

| 问题 | 原因 | 解决 |
|------|------|------|
| 工具返回格式不对 | 工具输出不规范 | 统一JSON格式 |
| 上下文溢出 | 记忆积累过多 | 使用滑动窗口 |
| Agent循环不停 | 没有明确终止条件 | 设置max_iterations |
| 幻觉回答 | 工具结果没传回 | 检查RetrievalQA配置 |

> LangChain 的核心优势是"不用重复造轮子"，核心劣势是"轮子太多了选哪个"。先搞懂最小可用集（Model+Prompt+AgentExecutor），再慢慢加功能。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 三件套 | Model+Prompt+Chain，最基础的调用模式 |
| 工具定义 | 功能单一、参数明确、文档清晰 |
| 记忆系统 | 对话记忆的4种类型，按场景选择 |
| Agent循环 | Thought→Action→Observation，直到最终答案 |
| 数据库Agent | 自然语言→SQL→执行→返回结果 |
| RAG Agent | 切片→向量化→检索→回答 |
| 最佳实践 | 模板化、单一职责、设限、错误处理 |

---

觉得有用？收藏起来，下次直接照抄。

你在用 LangChain 做什么项目？评论区分享你的踩坑经验。

关注怕浪猫，下期我们讲 LlamaIndex——RAG 场景的专业框架，从企业级知识库到混合检索，帮你把 RAG 做深做透。

系列进度 10/24

**下章预告：** 第11章我们将深入 LlamaIndex，从文档加载到高级检索，用企业级知识库实战项目带你掌握 RAG 的精髓。
