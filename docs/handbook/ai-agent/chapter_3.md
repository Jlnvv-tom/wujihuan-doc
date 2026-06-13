# 第3章 记忆系统：构建Agent的长期与短期记忆

前面章节我们掌握了 LLM 底层原理、Prompt 工程、结构化输出能力。但目前的 Agent 仍然存在一个致命问题：**无记忆能力**。

默认模型每次对话都是「全新开局」，无法记住用户偏好、历史任务、对话上下文，根本无法实现连续、个性化、自动化的复杂任务执行。

记忆系统是 AI Agent 具备**拟人持续交互、自主迭代工作**的核心基石，也是区分「单次对话模型」和「智能体」的核心标志。

本章将全覆盖讲解 Agent 记忆体系，同时兼顾**客户端本地 Agent**（轻量化、离线可用）与**云端 Agent**（持久化、多用户、高可用）两套落地方案，包含短期窗口管理、向量检索、混合存储、记忆压缩、遗忘机制五大核心能力，所有代码极简可运行、附带官方文档溯源。

## 3\.1 上下文窗口管理：短期记忆的维持与优化

### 3\.1\.1 短期记忆核心原理与场景

Agent **短期记忆**对应模型的上下文窗口，用于存储**当前会话未结束的实时对话、临时任务状态、本轮执行参数**。核心特点：生命周期短、读写速度快、仅服务单次会话，断电/会话结束即清空。

无论是客户端本地 Agent 还是云端在线 Agent，短期记忆都是必备基础能力，解决核心问题：**多轮对话上下文连贯、多步骤任务状态不丢失**。

#### 短期记忆架构图例（客户端\&云端通用）

用户多轮输入 → 内存缓存会话消息 → 窗口裁剪/过滤 → 拼接 Prompt 送入 LLM → 追加新回复至内存

### 3\.1\.2 核心痛点：上下文窗口溢出

所有 LLM 都有固定上下文 Token 上限，对话轮次过多、任务链路过长时，会出现两个严重问题：

- **上下文溢出报错**：超出模型最大窗口，直接请求失败

- **推理成本飙升**：超长上下文导致 Token 消耗、推理耗时成倍增加

- **早期信息遗忘**：模型优先关注末尾内容，历史关键信息失效

### 3\.1\.3 实战方案：滑动窗口短期记忆（客户端轻量化首选）

客户端 Agent 追求轻量化、低资源、离线高效，优先使用**滑动窗口裁剪策略**，固定保留最近 N 轮对话，自动丢弃早期无效内容，完美控制上下文长度。

基于 LangChain 官方原生组件，零额外依赖，适配本地客户端 Agent。

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.memory import ConversationBufferWindowMemory
from langchain_core.runnables import RunnableWithMessageHistory

# 初始化模型
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

# 1. 初始化滑动窗口记忆：仅保留最近3轮对话（可自定义k值）
memory = ConversationBufferWindowMemory(k=3, return_messages=True)

# 2. 构建对话链路
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是具备短期记忆的智能Agent，连贯回答用户问题"),
    MessagesPlaceholder(variable_name="history"),
    ("user", "{input}")
])
chain = prompt | llm

# 3. 包装记忆链路
chain_with_memory = RunnableWithMessageHistory(
    chain,
    get_session_history=lambda _: memory.chat_memory,
    input_messages_key="input",
    history_messages_key="history"
)

# 多轮对话测试（自动保留近3轮，裁剪更早内容）
if __name__ == "__main__":
    res1 = chain_with_memory.invoke({"input": "我叫小明"})
    res2 = chain_with_memory.invoke({"input": "我喜欢AI开发"})
    res3 = chain_with_memory.invoke({"input": "帮我解释什么是Agent短期记忆"})
    res4 = chain_with_memory.invoke({"input": "我之前告诉你我叫什么？"})
    print(res4.content)

```

**官方文档溯源**：[LangChain ConversationBufferWindowMemory 官方文档](https://python.langchain.com/docs/modules/memory/types/buffer_window)

### 3\.1\.4 云端Agent短期记忆优化方案

云端 Agent 面向多用户、长会话场景，不能使用本地内存存储，需基于 **会话ID隔离\+动态窗口修剪**，实现多用户并发记忆管理。搭配 LangGraph 检查点机制，保障云端任务状态持久化、不丢失。

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-3.5-turbo")
# 云端会话检查点：持久化短期会话状态
checkpointer = MemorySaver()

# 创建云端多用户Agent
agent = create_react_agent(model=llm, tools=[], checkpointer=checkpointer)

# 按用户会话ID隔离记忆（云端核心逻辑）
config = {"configurable": {"thread_id": "cloud_user_001"}}

# 会话连贯测试
res = agent.invoke(
    {"messages": [{"role": "user", "content": "我是云端测试用户"}]},
    config=config
)
print(res["messages"][-1].content)

```

**官方文档溯源**：[LangGraph 云端记忆持久化官方文档](https://langchain.com/docs/langgraph/how-tos/persistence_memory)

## 3\.2 向量数据库基础：Embedding 与相似度检索

短期记忆只能解决「本轮会话连贯」问题，想要让 Agent 记住**数天、数月的历史信息、用户偏好、专属知识库**，必须依赖向量数据库实现长期记忆检索。向量数据库是 Agent 长期记忆的核心载体。

### 3\.2\.1 核心原理

大模型无法直接读取海量文本数据，需要通过 **Embedding 嵌入** 将文本转为高维向量，再通过**相似度检索**匹配相关历史记忆，实现「精准回忆」。

#### 向量记忆工作流程图

文本信息 → Embedding 向量化 → 存入向量库 → 用户提问向量化 → 相似度匹配 → 召回相关记忆 → 拼接 Prompt 输入模型

### 3\.2\.2 极简向量检索实战（客户端/云端通用）

采用轻量向量库 Chroma（本地客户端免部署、云端可无缝迁移至 Milvus/Pinecone），代码极简、开箱即用。

```python
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

# 1. 初始化嵌入模型（文本转向量）
embedding = OpenAIEmbeddings()

# 2. 初始化向量数据库（客户端本地持久化）
vector_db = Chroma(
    persist_directory="./agent_vector_memory",
    embedding_function=embedding
)

# 3. 写入Agent长期记忆
memory_texts = [
    "用户擅长Python AI开发",
    "用户偏好简洁的技术解答",
    "用户正在学习AI Agent实战开发"
]
vector_db.add_texts(memory_texts)

# 4. 相似度检索：召回相关历史记忆
query = "我适合学习什么AI技术？"
results = vector_db.similarity_search(query, k=2)

# 输出召回的长期记忆
for res in results:
    print("召回记忆：", res.page_content)

```

**官方文档溯源**：[LangChain Chroma 向量库官方集成文档](https://python.langchain.com/docs/integrations/vectorstores/chroma)

### 3\.2\.3 客户端与云端向量方案选型

- **客户端本地Agent**：选用 Chroma 轻量向量库，无需独立服务、本地文件存储、离线可用

- **云端线上Agent**：选用 Milvus/Pinecone，支持高并发、海量数据、分布式检索、动态扩容

## 3\.3 长期记忆实现：基于 Redis 与向量库的混合存储

纯向量库检索速度慢、结构化数据存储弱；纯 Redis 无法实现语义回忆。生产级 Agent 统一采用**Redis \+ 向量库混合存储架构**，兼顾速度与语义能力，是客户端高级Agent、云端企业级Agent的标准落地方案。

### 3\.3\.1 混合存储架构设计

#### 架构图例

Redis（高速冷热数据缓存）\+ 向量数据库（语义长期记忆）= Agent 完整记忆体系

- **Redis 承担**：会话状态、用户基础信息、近期高频记忆、临时缓存（毫秒级读取）

- **向量库承担**：历史对话、用户偏好、知识库内容、低频长期记忆（语义检索）

### 3\.3\.2 混合记忆实战代码（云端生产级）

```python
import redis
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

# 1. 初始化Redis客户端（云端缓存）
redis_client = redis.Redis(host="localhost", port=6379, db=0)

# 2. 初始化向量记忆库
embedding = OpenAIEmbeddings()
vector_db = Chroma(persist_directory="./cloud_agent_memory", embedding_function=embedding)

# 3. 写入混合记忆
def save_agent_memory(user_id: str, hot_data: dict, long_text: str):
    # Redis存储高频热数据
    redis_client.hset(user_id, mapping=hot_data)
    # 向量库存储长期语义记忆
    vector_db.add_texts([long_text])

# 4. 读取混合记忆
def get_agent_memory(user_id: str, query: str):
    # 读取热数据
    hot_memory = redis_client.hgetall(user_id)
    # 语义召回长期记忆
    long_memory = vector_db.similarity_search(query, k=2)
    return hot_memory, [item.page_content for item in long_memory]

# 测试
if __name__ == "__main__":
    save_agent_memory(
        user_id="user_001",
        hot_data={"name": "小明", "job": "AI开发者"},
        long_text="小明长期深耕AI Agent落地实战，擅长Python框架开发"
    )
    hot, long_mem = get_agent_memory("user_001", "用户的技术方向")
    print("高频记忆：", hot)
    print("长期语义记忆：", long_mem)

```

**官方文档溯源**：[LangChain Redis 记忆官方集成文档](https://python.langchain.com/docs/integrations/memory/redis_chat_message_history)

## 3\.4 记忆压缩与总结：如何处理无限对话历史

即便有窗口裁剪和向量检索，Agent 长期对话仍会积累海量历史数据，无限堆叠会导致：检索效率降低、Token 成本升高、模型推理冗余。因此需要**记忆压缩与自动总结机制**，将冗余对话浓缩为核心摘要。

### 3\.4\.1 记忆压缩核心策略

- **增量总结**：每N轮对话自动总结核心信息，丢弃原始冗余对话

- **关键信息提取**：过滤无效寒暄、重复内容，保留用户偏好、任务目标、关键结论

- **层级压缩**：短期对话保留原文，长期历史压缩为摘要

### 3\.4\.2 记忆总结实战代码（客户端\&云端通用）

基于 LangChain 官方摘要记忆组件，自动压缩对话历史，无需手动处理文本。

```python
from langchain_openai import ChatOpenAI
from langchain.memory import ConversationSummaryMemory
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableWithMessageHistory

llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

# 初始化摘要记忆：自动压缩历史对话
summary_memory = ConversationSummaryMemory(llm=llm, return_messages=True)

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是智能记忆压缩Agent，连贯回答用户问题"),
    MessagesPlaceholder(variable_name="history"),
    ("user", "{input}")
])

chain = prompt | llm
chain_with_summary = RunnableWithMessageHistory(
    chain,
    get_session_history=lambda _: summary_memory.chat_memory,
    input_messages_key="input",
    history_messages_key="history"
)

# 多轮对话自动压缩测试
if __name__ == "__main__":
    chain_with_summary.invoke({"input": "我每天学习2小时AI Agent开发"})
    chain_with_summary.invoke({"input": "我重点研究记忆系统和工具调用模块"})
    # 查看压缩后的摘要内容
    print("记忆压缩摘要：", summary_memory.buffer)

```

**官方文档溯源**：[LangChain 对话摘要记忆官方文档](https://python.langchain.com/docs/modules/memory/types/summary)

## 3\.5 记忆遗忘机制：模拟人类记忆的衰减与更新

人类记忆具备自然遗忘特性：无用信息逐渐淡化、重要信息长期留存、过期信息自动更新。AI Agent 若永久存储所有记忆，会出现**记忆冗余、信息过时、意图干扰**问题。本节实现拟人化**记忆衰减、过期遗忘、动态更新**机制。

### 3\.5\.1 遗忘机制核心规则

- **时间衰减**：超过指定时长未访问的低频记忆，自动标记待删除

- **热度更新**：被检索、被使用的记忆，自动刷新热度与过期时间

- **覆盖更新**：用户新信息覆盖旧的冲突信息，保证记忆时效性

- **重要性分级**：核心偏好、关键任务永久留存，次要信息自动遗忘

### 3\.5\.2 实战：时间遗忘\+热度更新实现

基于 Redis 过期时间 \+ 向量库手动清理，实现轻量化遗忘机制，适配客户端与云端Agent。

```python
import redis
import time

redis_client = redis.Redis(host="localhost", port=6379, db=0)

# 带过期时间的记忆存储（自动遗忘）
def save_temp_memory(user_id: str, key: str, value: str, expire_sec: int = 86400):
    # 写入数据并设置过期时间（默认1天过期自动遗忘）
    redis_client.set(f"{user_id}:{key}", value, ex=expire_sec)

# 刷新记忆热度（延长生命周期）
def refresh_memory(user_id: str, key: str):
    redis_client.expire(f"{user_id}:{key}", 86400)

# 测试遗忘机制
if __name__ == "__main__":
    save_temp_memory("user_001", "last_study", "Agent记忆开发", expire_sec=60)
    print("记忆已写入，60秒后自动遗忘")
    time.sleep(30)
    # 刷新热度，重置过期时间
    refresh_memory("user_001", "last_study")
    print("记忆热度已刷新，重新计时")
```

### 3\.5\.3 云端Agent高级遗忘策略

云端海量记忆场景，需搭配定时任务实现批量清理：

1. 每日定时扫描向量库，删除超期未访问的低频记忆

2. 根据用户交互热度打分，保留高价值记忆

3. 支持手动重置、清空记忆，适配用户隐私需求

## 本章小结

本章完整落地了 AI Agent **短期\+长期\+压缩\+遗忘**全套记忆体系，区分客户端与云端差异化方案，核心知识点汇总：

- 短期记忆通过滑动窗口、会话裁剪解决上下文溢出，保障多轮对话连贯；客户端轻量内存、云端会话持久化

- 向量数据库\+Embedding 实现语义化长期记忆召回，让Agent具备回忆历史的能力

- Redis\+向量库混合存储是生产级标准方案，兼顾读写速度与语义检索能力

- 记忆压缩总结解决无限对话冗余问题，大幅降低推理成本

- 拟人遗忘机制实现记忆动态更新，避免信息过期、冗余干扰

记忆系统是Agent智能化的核心底座，下一章我们将基于记忆能力，实战开发**Agent工具调用系统**，让具备记忆的智能体真正实现自主执行、自主工作。


