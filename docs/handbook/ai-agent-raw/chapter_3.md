# 第3章 记忆系统：构建Agent的长短期记忆

人类之所以能进行复杂的对话和决策，是因为我们有记忆。同样，一个实用的Agent也需要记忆能力——它需要记住之前的对话、积累的知识、以及用户偏好。本章将深入探讨如何为Agent构建完整的长短期记忆系统。

## 3.1 上下文窗口管理：短期记忆的滑动窗口策略

### 上下文窗口的本质

LLM的上下文窗口（Context Window）是Agent的"工作记忆"。GPT-4o支持128K Token，Claude 3.5支持200K，但这些都不是无限的。当对话历史超出窗口限制时，早期的内容就会被截断。

**关键认知**：上下文窗口不是越满越好。研究表明，当上下文接近窗口上限时，模型的注意力分配会下降，导致关键信息被忽略。这就是所谓的"Lost in the Middle"现象。

### 滑动窗口策略

最基础的短期记忆管理是滑动窗口（Sliding Window）：

```python
class SlidingWindowMemory:
    def __init__(self, max_tokens: int = 8000):
        self.max_tokens = max_tokens
        self.messages: list[dict] = []
        self.approx_tokens_per_msg = 4  # 粗略估算：1 token约0.25个英文单词

    def add_message(self, role: str, content: str):
        msg_tokens = len(content) // self.approx_tokens_per_msg
        self.messages.append({"role": role, "content": content})
        self._trim_to_fit()

    def _trim_to_fit(self):
        total_tokens = sum(
            len(m["content"]) // self.approx_tokens_per_msg
            for m in self.messages
        )
        while total_tokens > self.max_tokens and len(self.messages) > 2:
            # 保留系统消息和最新消息，删除中间旧消息
            removed = self.messages.pop(1)
            total_tokens -= len(removed["content"]) // self.approx_tokens_per_msg

    def get_messages(self) -> list[dict]:
        return self.messages
```

### LangChain的内存管理

LangChain内置了多种内存管理策略：

```python
from langchain.memory import ConversationBufferWindowMemory

# 保留最近K轮对话
memory = ConversationBufferWindowMemory(k=5, return_messages=True)

memory.save_context({"input": "我叫张三"}, {"output": "你好张三！"})
memory.save_context({"input": "我喜欢Python"}, {"output": "Python是很好的选择！"})
memory.save_context({"input": "我在北京上班"}, {"output": "北京是个好地方！"})

# 只保留最近5轮（10条消息），更早的自动丢弃
print(memory.load_memory_variables({}))
```

| 内存策略 | 原理 | 优势 | 劣势 |
|----------|------|------|------|
| Buffer Window | 保留最近K轮 | 简单高效 | 丢失早期重要信息 |
| Summary | 压缩旧消息为摘要 | 保留大意 | 损失细节 |
| Entity Memory | 提取并记住实体信息 | 结构化存储 | 需要额外的实体提取 |
| Token Buffer | 基于Token数量裁剪 | 精确控制成本 | 实现稍复杂 |

## 3.2 向量数据库基础：Embedding原理与选型（Chroma, Milvus）

### Embedding：文本的数值化表示

Embedding是将文本转换为高维向量（通常256-3072维）的技术。语义相近的文本，其向量在空间中的距离也更近。

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# 将文本转换为向量
vector1 = embeddings.embed_query("机器学习是一门AI技术")
vector2 = embeddings.embed_query("深度学习属于机器学习")
vector3 = embeddings.embed_query("今天天气不错")

print(f"相似文本距离: {cosine_similarity(vector1, vector2)}")  # 距离近
print(f"不相关文本距离: {cosine_similarity(vector1, vector3)}")  # 距离远
```

### 向量数据库选型

| 数据库 | 类型 | 特点 | 适用场景 |
|--------|------|------|----------|
| Chroma | 嵌入式 | 安装简单，Python原生 | 本地开发、原型验证 |
| FAISS | 嵌入式 | Meta出品，性能极高 | 大规模相似性搜索 |
| Milvus | 分布式 | 支持十亿级向量 | 生产环境、大规模数据 |
| Weaviate | 分布式 | 内置多模态支持 | 多模态应用 |
| Pinecone | 云服务 | 全托管，零运维 | 快速上线、不运维 |
| Qdrant | 分布式 | Rust实现，性能好 | 高性能需求 |

### Chroma快速上手

Chroma是最易上手的选择，适合开发和测试：

```python
import chromadb
from chromadb.config import Settings

# 创建持久化客户端
client = chromadb.PersistentClient(path="./chroma_db")

# 创建集合（collection）
collection = client.get_or_create_collection(
    name="agent_knowledge",
    metadata={"description": "Agent知识库"}
)

# 添加文档
collection.add(
    documents=[
        "LangChain是一个用于构建LLM应用的框架",
        "ReAct是一种结合推理和行动的Agent框架",
        "RAG通过检索增强生成来减少幻觉"
    ],
    ids=["doc1", "doc2", "doc3"],
    metadatas=[
        {"source": "docs", "category": "framework"},
        {"source": "docs", "category": "methodology"},
        {"source": "docs", "category": "methodology"}
    ]
)

# 查询相似文档
results = collection.query(
    query_texts=["什么是RAG技术"],
    n_results=2
)
print(results["documents"])
```

> 参考文档：[Chroma官方文档](https://docs.trychroma.com/)

## 3.3 长期记忆实现：基于向量检索的知识存储与召回

### Agent长期记忆的架构

长期记忆系统由三个组件构成：

```
对话内容 -> 分块 -> Embedding -> 向量数据库
                                    |
用户提问 -> Embedding -> 相似度搜索 -> 召回相关记忆
                                    |
                              拼入提示词 -> LLM生成
```

### 基于LangChain的完整实现

```python
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# 1. 准备文本分块器
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", "。", " "]
)

# 2. 分块并写入向量库
documents = ["第一段对话记录...", "第二段对话记录..."]
chunks = text_splitter.create_documents(documents)
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    persist_directory="./agent_memory"
)

# 3. 创建检索器
retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 5}  # 检索Top-5相关片段
)

# 4. 构建历史感知检索链
llm = ChatOpenAI(model="gpt-4o")
retrieval_chain = create_history_aware_retriever(llm, retriever, prompt)

# 5. 组合成完整QA链
qa_chain = create_retrieval_chain(retrieval_chain, llm)

# 6. 使用
result = qa_chain.invoke({
    "input": "我上次提到的那个项目进展如何？",
    "chat_history": []  # 可传入之前的对话历史
})
```

### 记忆召回的精度优化

**元数据过滤**：为每条记忆添加元数据标签，查询时按标签过滤：

```python
# 存储时添加元数据
collection.add(
    documents=["用户偏好深色主题"],
    ids=["mem_001"],
    metadatas={"type": "preference", "user": "zhangsan", "timestamp": "2024-01-15"}
)

# 检索时按元数据过滤
results = collection.query(
    query_texts=["用户喜欢什么主题"],
    where={"type": "preference", "user": "zhangsan"},
    n_results=3
)
```

**时间衰减权重**：近期记忆应比远期记忆有更高权重：

```python
import math
from datetime import datetime

def time_decay_score(base_score: float, timestamp: str, half_life_days: int = 30) -> float:
    """计算考虑时间衰减的记忆分数"""
    days_ago = (datetime.now() - datetime.fromisoformat(timestamp)).days
    decay_factor = math.exp(-0.693 * days_ago / half_life_days)  # ln(2) ≈ 0.693
    return base_score * decay_factor
```

## 3.4 记忆压缩与总结：处理超长对话历史的算法

### 为什么需要记忆压缩？

当对话持续进行，原始消息会不断累积。即使用滑动窗口，也会丢失重要上下文。记忆压缩通过总结旧对话来保留核心信息。

### 滚动总结策略

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

class RollingSummaryMemory:
    def __init__(self, summary_interval: int = 10):
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        self.summary_interval = summary_interval
        self.messages: list = []
        self.summary: str = ""
        self.message_count: int = 0

    def add_exchange(self, user_msg: str, assistant_msg: str):
        self.messages.append(HumanMessage(content=user_msg))
        self.messages.append(AIMessage(content=assistant_msg))
        self.message_count += 1

        if self.message_count >= self.summary_interval:
            self._compress()

    def _compress(self):
        """将当前消息窗口压缩为摘要，追加到总摘要"""
        messages_text = "\n".join([
            f"{'用户' if isinstance(m, HumanMessage) else '助手'}：{m.content}"
            for m in self.messages
        ])

        compress_prompt = f"""
请将以下对话压缩为简洁的摘要，保留关键信息（事实、决策、偏好）：

已有摘要：{self.summary}
新对话：{messages_text}

请输出更新后的完整摘要（不是增量部分）。
"""
        response = self.llm.invoke([SystemMessage(content=compress_prompt)])
        self.summary = response.content
        self.messages = []  # 清空已压缩的消息
        self.message_count = 0

    def get_context(self, current_input: str) -> list:
        """获取当前上下文（摘要 + 最近消息）"""
        context = []
        if self.summary:
            context.append(SystemMessage(content=f"历史对话摘要：{self.summary}"))
        context.extend(self.messages)
        context.append(HumanMessage(content=current_input))
        return context
```

### 关键信息提取

除了总结全文，还可以提取结构化的关键信息：

```python
EXTRACTION_PROMPT = """
从以下对话中提取关键信息，以JSON格式输出：
1. facts: 对话中提到的事实信息
2. decisions: 做出的决策或选择
3. preferences: 用户表达的偏好
4. tasks: 提到的待办事项

对话：{conversation}
"""
```

这种方式生成的是结构化记忆，更适合Agent后续的精确检索。

## 3.5 记忆遗忘机制：模拟人类记忆的衰减与更新策略

### 为什么要让Agent"遗忘"？

人类的记忆系统天然具有遗忘机制——不重要的信息随时间淡去，重要的信息通过反复激活得以强化。Agent同样需要遗忘：

1. **信息过时**：用户三个月前的地址可能已经变更
2. **存储成本**：无限累积的向量数据会拖慢检索速度
3. **噪音干扰**：太多无关记忆会干扰检索精度

### 实现记忆遗忘

**方案一：访问计数 + 时间衰减**

```python
class AgentMemory:
    def __init__(self, decay_half_life_days: int = 60):
        self.memories: dict = {}
        self.decay_half_life = decay_half_life_days

    def store(self, key: str, content: str, metadata: dict = None):
        self.memories[key] = {
            "content": content,
            "metadata": metadata or {},
            "access_count": 1,
            "last_accessed": datetime.now().isoformat(),
            "created": datetime.now().isoformat(),
        }

    def recall(self, key: str):
        if key not in self.memories:
            return None
        mem = self.memories[key]
        mem["access_count"] += 1
        mem["last_accessed"] = datetime.now().isoformat()
        return mem["content"]

    def get_relevance_score(self, key: str) -> float:
        """计算记忆的相关性分数（综合访问频率和时间衰减）"""
        mem = self.memories[key]
        frequency_boost = min(mem["access_count"] / 10, 1.0)  # 频率归一化
        days_ago = (datetime.now() - datetime.fromisoformat(mem["last_accessed"])).days
        time_decay = math.exp(-0.693 * days_ago / self.decay_half_life)
        return frequency_boost * time_decay

    def cleanup(self, threshold: float = 0.1):
        """清理低相关性记忆"""
        to_delete = [
            k for k, v in self.memories.items()
            if self.get_relevance_score(k) < threshold
        ]
        for k in to_delete:
            del self.memories[k]
```

**方案二：重要度标注**

在存储时就标注记忆的重要程度：

```python
def store_memory_with_importance(
    content: str,
    importance: str,  # "high", "medium", "low"
    half_life: dict = {"high": 180, "medium": 60, "low": 14}
):
    decay_days = half_life.get(importance, 60)
    memory_entry = {
        "content": content,
        "importance": importance,
        "decay_half_life": decay_days,
        "created": datetime.now().isoformat()
    }
    # 写入向量库，检索时用importance作为权重
```

### 记忆更新策略

当信息发生变化时，旧记忆需要被更新而非简单覆盖：

```python
def update_memory(old_key: str, new_content: str, collection):
    """更新记忆：保留旧版本作为历史，写入新版本"""
    old_memory = collection.get(ids=[old_key])
    if old_memory and old_memory["documents"]:
        # 将旧版本存入历史集合
        history_key = f"{old_key}_v{datetime.now().strftime('%Y%m%d%H%M%S')}"
        collection.add(
            documents=old_memory["documents"],
            ids=[history_key],
            metadatas=[{**old_memory["metadatas"][0], "status": "superseded"}]
        )
    # 更新当前版本
    collection.update(
        documents=[new_content],
        ids=[old_key],
        metadatas=[{"status": "current", "updated": datetime.now().isoformat()}]
    )
```

## 本章小结

| 记忆类型 | 实现方案 | 核心技术 | 适用场景 |
|----------|---------|---------|---------|
| 短期记忆 | 滑动窗口、Token Buffer | 上下文裁剪 | 单次对话会话 |
| 长期记忆 | 向量数据库 + 检索 | Embedding + 相似度搜索 | 跨会话知识持久化 |
| 记忆压缩 | 滚动总结、关键信息提取 | LLM摘要 + JSON结构化 | 超长对话管理 |
| 记忆遗忘 | 访问计数 + 时间衰减 | 重要性标注 + 定期清理 | 避免信息过时和噪音 |

| 向量数据库 | 推荐场景 |
|-----------|---------|
| Chroma | 本地开发、原型验证 |
| FAISS | 纯相似性搜索、高性能 |
| Milvus | 生产环境、十亿级数据 |

> 下一章，我们将学习Agent的"思考能力"——规划与推理，让Agent不仅能"记住"，还能"想清楚"。
