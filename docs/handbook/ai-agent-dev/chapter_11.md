# 第11章 LlamaIndex 实战：企业级 RAG 知识库

RAG 做得烂，90%是因为检索不准。LlamaIndex 就是来治这个病的。

我是怕浪猫，上一章聊了 LangChain 的通用 Agent 开发，今天来搞 LlamaIndex——RAG 场景的专业框架。如果你的项目核心是"知识库问答"，LlamaIndex 比 LangChain 更专业、更轻量、更好调。

---

## 11.1 LlamaIndex 核心架构与定位

**LlamaIndex 是什么？**

LlamaIndex 是一个专注"数据检索增强生成"的框架，核心定位是"让 LLM 能高效地访问你的私有数据"。

和 LangChain 的定位差异：

| 维度 | LlamaIndex | LangChain |
|------|-----------|-----------|
| 核心定位 | 数据检索+RAG | 通用LLM应用 |
| 专注度 | 高（只做检索） | 低（什么都做） |
| 学习曲线 | 低 | 高 |
| RAG深度 | 深 | 浅 |
| Agent能力 | 基础 | 强 |
| 适用场景 | 知识库问答 | 复杂Agent |

> 如果你的项目是"知识库问答"，用 LlamaIndex。如果是"多步推理Agent"，用 LangChain。不要用锤子拧螺丝。

**安装**

```bash
pip install llama-index llama-index-llms-openai llama-index-embeddings-openai
```

官方文档：https://docs.llamaindex.ai/

**核心概念**

```
LlamaIndex 核心概念
├── Document       → 数据源（文件、网页、数据库）
├── Node           → 文档的切片（chunk）
├── Index          → 索引结构（向量索引、树索引、关键词索引）
├── Retriever      → 检索器（从索引中检索）
├── QueryEngine    → 查询引擎（检索+生成）
└── ChatEngine     → 对话引擎（多轮对话）
```

---

## 11.2 文档加载与索引构建

**文档加载**

```python
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex

# 方式1：从目录加载
documents = SimpleDirectoryReader("./data").load_data()

# 方式2：单独文件
documents = SimpleDirectoryReader(input_files=["./report.pdf"]).load_data()

# 方式3：Web页面
from llama_index.readers.web import SimpleWebPageReader
documents = SimpleWebPageReader().load_data(["https://example.com/page"])
```

**索引构建**

```python
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding

# 设置模型
llm = OpenAI(model="gpt-4o")
embed_model = OpenAIEmbedding(model="text-embedding-3-small")

# 构建向量索引
index = VectorStoreIndex.from_documents(
    documents,
    llm=llm,
    embed_model=embed_model
)
```

**索引类型对比**

| 索引类型 | 特点 | 适用场景 |
|---------|------|---------|
| VectorStoreIndex | 语义相似度检索 | 通用场景 |
| SummaryIndex | 全文摘要 | 需要全局概览 |
| TreeIndex | 树形层级索引 | 长文档 |
| KeywordTableIndex | 关键词索引 | 精确匹配 |

---

## 11.3 查询引擎与对话引擎

**查询引擎（单轮问答）**

```python
query_engine = index.as_query_engine(
    similarity_top_k=3,  # 检索top3相关文档
    response_mode="tree_summarize"  # 回答模式
)

response = query_engine.query("这份文档讲了什么？")
print(response)
```

**对话引擎（多轮对话）**

```python
chat_engine = index.as_chat_engine(
    chat_mode="condense_question",
    similarity_top_k=3
)

response1 = chat_engine.chat("文档中提到了哪些安全措施？")
response2 = chat_engine.chat("具体是怎么实现的？")  # 自动关联上一轮
```

**响应模式对比**

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| refine | 逐段精炼 | 需要完整答案 |
| tree_summarize | 树形汇总 | 需要简明答案 |
| simple_summarize | 简单汇总 | 快速概览 |
| no_text | 只返回检索结果 | 不需要AI生成 |
| accumulate | 拼接所有结果 | 需要看原文 |

---

## 11.4 切片策略与优化

**切片策略**

```python
from llama_index.core.node_parser import (
    SentenceSplitter,
    SemanticSplitterNodeParser,
    HierarchicalNodeParser
)

# 方式1：句子级切片
splitter = SentenceSplitter(
    chunk_size=512,
    chunk_overlap=50
)

# 方式2：语义切片（按语义边界切分）
semantic_splitter = SemanticSplitterNodeParser(
    buffer_size=1,
    breakpoint_percentile_threshold=95,
    embed_model=embed_model
)

# 方式3：层级切片（多粒度）
hierarchical_splitter = HierarchicalNodeParser(
    chunk_sizes=[2048, 512, 128]
)
```

**切片优化清单**

| 优化项 | 方法 | 效果 |
|--------|------|------|
| chunk_size | 512-1024字符 | 平衡精度和上下文 |
| overlap | chunk_size的10% | 防止信息断裂 |
| 元数据 | 添加来源、页码 | 提升可追溯性 |
| 语义切片 | 按语义边界切 | 减少语义断裂 |
| 层级切片 | 多粒度索引 | 兼顾精确和全局 |

> 切片是 RAG 质量的第一道关卡。切片做得好，检索就准了一半。切片做得烂，后面再怎么优化都是白费。

---

## 11.5 向量数据库选择与集成

**常用向量数据库**

| 数据库 | 特点 | 适用场景 |
|--------|------|---------|
| FAISS | 本地，快 | 开发测试 |
| Chroma | 开源，易用 | 中小规模 |
| Pinecone | 云服务，高性能 | 大规模生产 |
| Milvus | 开源，可扩展 | 企业生产 |
| Qdrant | 开源，Rust实现 | 高性能场景 |
| Weaviate | 开源，多模态 | 多模态检索 |

**FAISS 集成示例**

```python
from llama_index.vector_stores.faiss import FaissVectorStore
import faiss

# 创建FAISS索引
faiss_index = faiss.IndexFlatL2(1536)  # 1536 = OpenAI embedding维度
vector_store = FaissVectorStore(faiss_index=faiss_index)

# 构建索引
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_documents(
    documents,
    storage_context=storage_context,
    embed_model=embed_model
)
```

---

## 11.6 高级检索技术

**混合检索**

```python
from llama_index.core.retriever import QueryFusionRetriever
from llama_index.core import VectorStoreIndex, SummaryIndex

# 向量检索器
vector_retriever = index.as_retriever(similarity_top_k=5)

# 关键词检索器
keyword_retriever = keyword_index.as_retriever(similarity_top_k=5)

# 混合检索
hybrid_retriever = QueryFusionRetriever(
    retrievers=[vector_retriever, keyword_retriever],
    num_queries=1,
    similarity_top_k=5
)
```

**重排序（Reranker）**

```python
from llama_index.core.postprocessor import SentenceTransformerRerank

# 添加重排序器
reranker = SentenceTransformerRerank(
    model="cross-encoder/ms-marco-MiniLM-L-2-v2",
    top_n=3
)

query_engine = index.as_query_engine(
    similarity_top_k=10,  # 先粗检索10个
    node_postprocessors=[reranker]  # 再精排到3个
)
```

**检索策略对比**

| 策略 | 召回率 | 精确率 | 速度 | 推荐场景 |
|------|--------|--------|------|---------|
| 纯向量检索 | 高 | 中 | 快 | 通用 |
| 纯关键词检索 | 中 | 高 | 快 | 精确匹配 |
| 混合检索 | 最高 | 中 | 中 | 推荐 |
| 混合+重排序 | 高 | 最高 | 慢 | 高精度 |

---

## 11.7 实战：企业知识库问答系统

**场景**

为一个企业搭建内部知识库问答系统，包含产品文档、技术文档、HR政策、财务流程等。

**架构设计**

```
用户提问
    ↓
[意图识别] → 判断问题属于哪个类别
    ↓
[知识库路由] → 路由到对应的知识库
    ↓
[混合检索] → 向量检索 + 关键词检索
    ↓
[重排序] → 精排Top-K
    ↓
[LLM生成] → 基于检索结果生成答案
    ↓
输出答案 + 来源引用
```

**实现**

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.core.tools import QueryEngineTool
from llama_index.core.query_engine import RouterQueryEngine
from llama_index.core.selectors import LLMSingleSelector
from llama_index.llms.openai import OpenAI

# 1. 构建多个知识库
product_docs = SimpleDirectoryReader("./data/product").load_data()
tech_docs = SimpleDirectoryReader("./data/tech").load_data()
hr_docs = SimpleDirectoryReader("./data/hr").load_data()

product_index = VectorStoreIndex.from_documents(product_docs)
tech_index = VectorStoreIndex.from_documents(tech_docs)
hr_index = VectorStoreIndex.from_documents(hr_docs)

# 2. 创建查询引擎工具
product_tool = QueryEngineTool.from_defaults(
    query_engine=product_index.as_query_engine(),
    description="产品相关文档，包含产品功能、使用说明、常见问题"
)
tech_tool = QueryEngineTool.from_defaults(
    query_engine=tech_index.as_query_engine(),
    description="技术文档，包含API文档、架构设计、运维手册"
)
hr_tool = QueryEngineTool.from_defaults(
    query_engine=hr_index.as_query_engine(),
    description="人力资源相关文档，包含请假流程、薪酬政策、培训计划"
)

# 3. 创建路由查询引擎
router_engine = RouterQueryEngine(
    selector=LLMSingleSelector.from_defaults(),
    query_engine_tools=[product_tool, tech_tool, hr_tool]
)

# 4. 查询
response = router_engine.query("年假怎么请？")
# 自动路由到HR知识库
```

> 企业知识库的核心难题不是"检索不准"，而是"知识分散在不同系统"。路由引擎让每个问题都能找到正确的知识库，这是第一步。

---

## 11.8 性能评估与优化

**RAG 评估指标**

| 指标 | 说明 | 评估方法 |
|------|------|---------|
| 忠实度 | 回答是否基于检索内容 | 人工/AI评估 |
| 相关性 | 检索内容是否与问题相关 | 命中率 |
| 完整性 | 回答是否完整 | 覆盖率 |
| 准确性 | 回答是否正确 | 人工校验 |

**优化路线图**

```
基础版：向量检索 + Top-K
    ↓
进阶版：混合检索 + Reranker
    ↓
高级版：路由引擎 + 多知识库
    ↓
终极版：自适应检索 + 主动学习
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| LlamaIndex定位 | RAG专业框架，比LangChain更轻更专 |
| 文档加载 | 支持多种数据源，SimpleDirectoryReader开箱即用 |
| 索引类型 | 向量/摘要/树/关键词，按场景选择 |
| 切片优化 | chunk_size 512-1024，语义切片最佳 |
| 向量数据库 | 开发用FAISS，生产用Milvus/Pinecone |
| 高级检索 | 混合检索+Reranker，精确率最高 |
| 企业知识库 | 路由引擎+多知识库，解决知识分散问题 |

---

觉得有用？收藏起来，下次直接照抄。

你在做 RAG 项目时遇到过什么坑？评论区聊聊。

关注怕浪猫，下期我们讲 LangGraph——复杂 Agent 的状态机编排，帮你构建真正的多步骤复杂Agent。

系列进度 11/24

**下章预告：** 第12章我们将深入 LangGraph，从状态机基础到多步骤Agent编排，用代码构建能处理复杂业务流程的智能体。
