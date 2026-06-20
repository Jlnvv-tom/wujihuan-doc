# 第5章 数据集模块开发：实现特定知识库问答

AI回答天马行空？不是模型不行，是你没给它喂资料。RAG就是解决这个问题——让AI先查资料再回答。

我是怕浪猫，这章是LLMOps平台最核心的能力之一。搞定RAG，你的AI就能基于私有知识库回答，不再"一本正经地胡说八道"。

---

## 5.1 LLM 幻觉成因与解决方案

**什么是幻觉**

幻觉（Hallucination）= 模型生成的内容看似合理，但实际上是错误的、编造的、或与事实不符。

**幻觉的成因**

| 成因 | 说明 | 示例 |
|------|------|------|
| 训练数据缺失 | 模型没学过这个知识 | 问最新事件 |
| 概率性生成 | 模型在"猜"下一个词 | 细节错误 |
| 指令理解偏差 | 误解了用户意图 | 答非所问 |
| 知识截止 | 模型知识有时间截止 | 问2024年后事件 |

**幻觉的解决方案对比**

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 提示工程 | 让模型"不确定就说不知道" | 零成本 | 效果有限 |
| 微调 | 用领域数据重新训练 | 知识内化 | 成本高、更新难 |
| RAG | 检索相关文档+喂给模型 | 成本低、可更新 | 需要检索系统 |
| 知识图谱 | 结构化知识存储 | 精准 | 构建成本高 |

> RAG是目前性价比最高的方案——不需要重新训练模型，只需要维护一个向量数据库，就能让AI掌握你给它的所有知识。

---

## 5.2 向量数据库配置与使用

**什么是向量数据库**

向量数据库存储的不是原始文本，而是文本的向量表示（Embedding）。通过向量相似度检索，找到最相关的文本片段。

**主流向量数据库对比**

| 数据库 | 部署方式 | 性能 | 适用场景 |
|--------|---------|------|---------|
| Faiss | 本地 | 极快 | 小规模、快速原型 |
| Pinecone | 云服务 | 快 | 生产环境、无需运维 |
| Weaviate | 自部署/云 | 快 | 企业级、可扩展 |
| Chroma | 本地/云 | 中 | 快速开发 |
| Milvus | 自部署 | 快 | 大规模向量检索 |
| PGVector | PostgreSQL扩展 | 中 | 已有PG，不想新部署 |

**Faiss快速上手**

```python
import faiss
import numpy as np

# 维度（OpenAI embedding是1536维）
dimension = 1536

# 创建索引
index = faiss.IndexFlatL2(dimension)

# 添加向量
vectors = np.random.rand(100, dimension).astype('float32')
index.add(vectors)

# 检索
query = np.random.rand(1, dimension).astype('float32')
distances, indices = index.search(query, k=5)
print(f"最相似的5个文档索引: {indices[0]}")
```

**Weaviate配置**

```python
# services/vector_store.py
import weaviate
from weaviate.auth import AuthApiKey

class VectorStore:
    def __init__(self):
        self.client = weaviate.connect_to_local()
    
    def create_schema(self):
        """创建Schema"""
        self.client.collections.create(
            name="Document",
            properties=[
                weaviate.classes.config.Property(
                    name="content",
                    data_type=weaviate.classes.config.DataType.TEXT
                ),
                weaviate.classes.config.Property(
                    name="source",
                    data_type=weaviate.classes.config.DataType.TEXT
                ),
                weaviate.classes.config.Property(
                    name="metadata",
                    data_type=weaviate.classes.config.DataType.TEXT
                )
            ]
        )
    
    def add_documents(self, documents):
        """批量添加文档"""
        collection = self.client.collections.get("Document")
        with collection.batch.dynamic() as batch:
            for doc in documents:
                batch.add_object({
                    "content": doc["content"],
                    "source": doc["source"],
                    "metadata": doc.get("metadata", "")
                })
    
    def search(self, query_vector, top_k=5):
        """向量检索"""
        collection = self.client.collections.get("Document")
        results = collection.query.near_vector(
            near_vector=query_vector,
            limit=top_k
        )
        return [obj.properties for obj in results.objects]
```

---

## 5.3 文本嵌入模型 Embeddings 原理与使用

**Embedding原理**

Embedding = 把文本映射到一个高维向量空间，语义相近的文本在向量空间中距离更近。

```
"猫咪" → [0.12, 0.34, ..., 0.56]  (1536维向量)
"小猫" → [0.11, 0.35, ..., 0.55]  (语义相近，向量相近)
"汽车" → [0.89, 0.12, ..., 0.23]  (语义不同，向量远离)
```

**主流Embedding模型对比**

| 模型 | 维度 | 性能 | 成本 | 推荐 |
|------|------|------|------|------|
| text-embedding-3-small | 1536 | 好 | 低 | 推荐 |
| text-embedding-3-large | 3072 | 很好 | 中 | 高要求 |
| text-embedding-ada-002 | 1536 | 一般 | 低 | 遗留 |
| BGE-M3 | 1024 | 好 | 免费 | 本地部署 |
| M3E | 768 | 中 | 免费 | 中文场景 |

**OpenAI Embeddings使用**

```python
# services/embedding_service.py
from openai import OpenAI
from config import Config

class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=Config.OPENAI_API_KEY)
        self.model = "text-embedding-3-small"
    
    def embed_text(self, text):
        """单条文本向量化"""
        response = self.client.embeddings.create(
            model=self.model,
            input=text
        )
        return response.data[0].embedding
    
    def embed_documents(self, documents):
        """批量向量化"""
        response = self.client.embeddings.create(
            model=self.model,
            input=documents
        )
        return [item.embedding for item in response.data]
```

**本地Embedding模型（免费）**

```python
from sentence_transformers import SentenceTransformer

class LocalEmbedding:
    def __init__(self, model_name='BAAI/bge-m3'):
        self.model = SentenceTransformer(model_name)
    
    def embed_text(self, text):
        return self.model.encode(text).tolist()
    
    def embed_documents(self, documents):
        return self.model.encode(documents).tolist()
```

---

## 5.4 LangChain 文档加载器与文本分割器

**LangChain文档加载器**

```python
from langchain_community.document_loaders import (
    TextLoader, PyPDFLoader, Docx2txtLoader,
    UnstructuredMarkdownLoader, CSVLoader
)

# 加载不同格式文档
loaders = {
    '.txt': TextLoader,
    '.pdf': PyPDFLoader,
    '.docx': Docx2txtLoader,
    '.md': UnstructuredMarkdownLoader,
    '.csv': CSVLoader
}

def load_document(file_path):
    ext = os.path.splitext(file_path)[1]
    loader_class = loaders.get(ext)
    if not loader_class:
        raise ValueError(f"不支持的文件格式: {ext}")
    loader = loader_class(file_path)
    return loader.load()
```

**文本分割器**

```python
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    CharacterTextSplitter,
    TokenTextSplitter
)

# 递归字符分割器（推荐）
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,        # 每块大小
    chunk_overlap=200,      # 重叠大小（保持上下文连贯）
    length_function=len,
    separators=["\n\n", "\n", "。", "，", " ", ""]
)

# 按Token分割
token_splitter = TokenTextSplitter(
    chunk_size=500,
    chunk_overlap=50
)

# 使用示例
documents = load_document("知识库.pdf")
chunks = text_splitter.split_documents(documents)
print(f"分割为 {len(chunks)} 个块")
```

**分割策略对比**

| 策略 | 原理 | 适用场景 |
|------|------|---------|
| 按字符数 | 固定字符数分割 | 通用 |
| 按Token数 | 按LLM Token数分割 | 精确控制 |
| 按语义 | 保持语义完整 | 长文档 |
| 递归分割 | 按分隔符递归 | 最通用 |

> 分割大小是个平衡——太小，语义不完整；太大，超过上下文窗口。1000字符/块、200字符重叠，是经过验证的通用配置。

---

## 5.5 递归字符文本分割器：分割任意文档

**为什么需要递归分割**

普通字符分割的问题是：可能在句子中间截断，导致语义不完整。递归分割器按分隔符优先级依次尝试，尽量在语义边界分割。

**分隔符优先级**

```python
# 默认分隔符优先级（从高到低）
separators = [
    "\n\n",       # 段落
    "\n",         # 换行
    "。",         # 中文句号
    "，",         # 中文逗号
    ". ",         # 英文句号
    ", ",         # 英文逗号
    " ",          # 空格
    ""            # 字符级（兜底）
]
```

**自定义分割器**

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 中文优化分割器
chinese_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=150,
    separators=[
        "\n\n",     # 段落
        "\n",       # 换行
        "。",       # 句号
        "！",       # 感叹号
        "？",       # 问号
        "，",       # 逗号
        "、",       # 顿号
        " ",        # 空格
        ""          # 字符
    ]
)

# Markdown文档优化分割器
markdown_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=[
        "# ",       # 一级标题
        "## ",      # 二级标题
        "### ",     # 三级标题
        "\n\n",
        "\n",
        " "
    ]
)
```

**向量化存储完整流程**

```python
# services/rag_service.py
class RAGService:
    def __init__(self):
        self.embedding = EmbeddingService()
        self.vector_store = VectorStore()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=200
        )
    
    def process_document(self, file_path, knowledge_base_id):
        """处理并存储文档"""
        # 1. 加载文档
        loader = self._get_loader(file_path)
        documents = loader.load()
        
        # 2. 分割
        chunks = self.text_splitter.split_documents(documents)
        
        # 3. 向量化
        texts = [chunk.page_content for chunk in chunks]
        embeddings = self.embedding.embed_documents(texts)
        
        # 4. 存储到向量数据库
        to_store = []
        for i, chunk in enumerate(chunks):
            to_store.append({
                "content": chunk.page_content,
                "embedding": embeddings[i],
                "metadata": {
                    "source": file_path,
                    "chunk_id": i,
                    "knowledge_base_id": knowledge_base_id
                }
            })
        
        self.vector_store.add_documents(to_store)
        return len(chunks)
```

---

## 5.6 LangChain 检索器：让 LLM 动态调用知识库

**检索器接口**

```python
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document

class VectorRetriever(BaseRetriever):
    def __init__(self, vector_store, embedding_service, top_k=5):
        self.vector_store = vector_store
        self.embedding_service = embedding_service
        self.top_k = top_k
        super().__init__()
    
    def _get_relevant_documents(self, query, run_manager=None):
        """检索相关文档"""
        # 向量化查询
        query_vector = self.embedding_service.embed_text(query)
        
        # 检索
        results = self.vector_store.search(query_vector, top_k=self.top_k)
        
        # 转为Document对象
        return [
            Document(page_content=r["content"], metadata=r.get("metadata", {}))
            for r in results
        ]
```

**RAG链完整实现**

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_core.output_parsers import StrOutputParser

def create_rag_chain(retriever, llm):
    """创建RAG链"""
    
    # Prompt模板
    prompt = ChatPromptTemplate.from_messages([
        ("system", """你是知识库助手。根据以下参考文档回答用户问题。
如果参考文档中没有相关信息，就说"我没有找到相关信息"，不要编造。

参考文档：
{context}"""),
        ("user", "{input}")
    ])
    
    # 格式化文档
    def format_docs(docs):
        return "\n\n".join([doc.page_content for doc in docs])
    
    # RAG链
    rag_chain = (
        {
            "context": retriever | RunnableLambda(format_docs),
            "input": RunnablePassthrough()
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    
    return rag_chain
```

**使用RAG链**

```python
# 初始化
embedding = EmbeddingService()
vector_store = VectorStore()
retriever = VectorRetriever(vector_store, embedding, top_k=5)
llm = ChatOpenAI(model="gpt-4")
rag_chain = create_rag_chain(retriever, llm)

# 使用
result = rag_chain.invoke("公司的请假流程是什么？")
print(result)
```

---

## 5.7 jieba 分词与关键词提取

**为什么需要中文分词**

英文天然按空格分词，中文没有空格。向量检索时，中文分词质量直接影响检索精度。

**jieba分词**

```python
import jieba
import jieba.analyse

# 基础分词
text = "大语言模型正在改变软件开发方式"
print(jieba.lcut(text))
# ['大', '语言', '模型', '正在', '改变', '软件开发', '方式']

# 精确模式
print(jieba.lcut(text, cut_all=False))
# ['大', '语言', '模型', '正在', '改变', '软件', '开发', '方式']

# 全模式
print(jieba.lcut(text, cut_all=True))
# ['大', '语言', '模型', '正在', '改变', '软件', '开发', '软件开发', '方式']
```

**关键词提取**

```python
# TF-IDF关键词提取
keywords = jieba.analyse.extract_tags(text, topK=5, withWeight=True)
for keyword, weight in keywords:
    print(f"{keyword}: {weight:.4f}")

# TextRank关键词提取
keywords = jieba.analyse.textrank(text, topK=5, withWeight=True)
```

**在RAG中的应用**

```python
# 基于关键词的检索增强
def keyword_enhanced_search(query, vector_store, top_k=5):
    """关键词增强检索"""
    # 提取查询关键词
    keywords = jieba.analyse.extract_tags(query, topK=3)
    
    # 向量检索
    query_vector = embedding_service.embed_text(query)
    results = vector_store.search(query_vector, top_k=top_k)
    
    # 关键词加分
    for result in results:
        content = result["content"]
        boost = sum(1 for kw in keywords if kw in content)
        result["score"] = result.get("score", 0) + boost * 0.1
    
    # 重新排序
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
```

---

## 5.8 Rerank 搜索重排序原理与实现

**为什么需要Rerank**

向量检索是"粗筛"，能快速找到大概相关的文档，但不够精确。Rerank是"精排"，用更精确的模型对结果重新打分。

**Rerank原理**

```
用户查询 → 向量检索（召回Top 20） → Rerank模型重排 → 返回Top 5
             (快速但不够准)          (慢但更精确)
```

**使用Cohere Rerank**

```python
import cohere

co = cohere.Client("your-api-key")

def rerank_results(query, documents, top_n=5):
    """Rerank重排序"""
    results = co.rerank(
        model="rerank-multilingual-v3.0",
        query=query,
        documents=documents,
        top_n=top_n
    )
    
    reranked = []
    for r in results.results:
        reranked.append({
            "content": documents[r.index],
            "score": r.relevance_score
        })
    return reranked
```

**本地Rerank模型**

```python
from sentence_transformers import CrossEncoder

class LocalRerank:
    def __init__(self, model_name='BAAI/bge-reranker-v2-m3'):
        self.model = CrossEncoder(model_name)
    
    def rerank(self, query, documents, top_n=5):
        """重排序"""
        # 构造query-document对
        pairs = [[query, doc] for doc in documents]
        
        # 预测相关性分数
        scores = self.model.predict(pairs)
        
        # 排序
        results = sorted(
            zip(documents, scores),
            key=lambda x: x[1],
            reverse=True
        )
        
        return [{"content": doc, "score": score} for doc, score in results[:top_n]]
```

**RAG + Rerank完整流程**

```python
def rag_with_rerank(query, retriever, reranker, llm, top_k=5):
    # 1. 向量检索（粗筛）
    coarse_results = retriever.get_relevant_documents(query, k=20)
    coarse_docs = [doc.page_content for doc in coarse_results]
    
    # 2. Rerank（精排）
    reranked = reranker.rerank(query, coarse_docs, top_n=top_k)
    final_docs = [r["content"] for r in reranked]
    
    # 3. 构建上下文
    context = "\n\n".join(final_docs)
    
    # 4. LLM生成
    prompt = f"参考文档：\n{context}\n\n问题：{query}"
    response = llm.invoke(prompt)
    
    return response
```

---

## 5.9 RAG 优化策略大全

**10种RAG优化策略**

| 策略 | 原理 | 效果 |
|------|------|------|
| 多查询融合 | 生成多个变体查询 | 提升召回率 |
| 问题分解 | 复杂问题拆成子问题 | 提升复杂问题准确率 |
| 回答回退 | 先回答再检索 | 提升上下文理解 |
| doc-doc检索 | 文档之间的关联检索 | 提升上下文完整性 |
| 混合检索 | 向量+关键词 | 提升召回率和精确率 |
| 逻辑路由 | 根据问题类型走不同检索 | 提升针对性 |
| 语义路由 | 语义相似度路由 | 更智能的路由 |
| 自查询检索 | LLM生成检索查询 | 提升查询质量 |
| 多向量检索 | 查询和文档用不同向量 | 提升匹配精度 |
| 父文档检索 | 检索小块、返回大块 | 保持上下文完整 |

**混合检索实现**

```python
def hybrid_search(query, vector_store, top_k=5, alpha=0.5):
    """混合检索：向量检索 + 关键词检索"""
    
    # 1. 向量检索
    query_vector = embedding_service.embed_text(query)
    vector_results = vector_store.search(query_vector, top_k=top_k*2)
    
    # 2. 关键词检索（BM25）
    from rank_bm25 import BM25Okapi
    
    # 分词
    query_tokens = jieba.lcut(query)
    
    # BM25打分
    bm25 = BM25Okapi(corpus_tokens)  # corpus_tokens是语料库的分词结果
    bm25_scores = bm25.get_scores(query_tokens)
    
    # 3. 融合打分
    for i, result in enumerate(vector_results):
        vector_score = result.get("score", 0)
        bm25_score = bm25_scores[i] / max(bm25_scores)  # 归一化
        result["final_score"] = alpha * vector_score + (1 - alpha) * bm25_score
    
    # 4. 重新排序
    vector_results.sort(key=lambda x: x["final_score"], reverse=True)
    return vector_results[:top_k]
```

> RAG优化是个持续的过程。先跑通基础RAG，再根据实际效果加优化策略。不要一开始就搞复杂的优化，80%的场景基础RAG就够了。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 幻觉问题 | RAG是最优解：检索+生成 |
| 向量数据库 | Faiss(本地)、Weaviate(生产) |
| Embedding | text-embedding-3-small性价比高 |
| 文档处理 | 加载器+递归分割器 |
| 检索器 | LangChain Retriever接口 |
| 中文处理 | jieba分词+关键词提取 |
| Rerank | 粗筛+精排两阶段 |
| RAG优化 | 10+种策略，按需采用 |

---

觉得有用？收藏起来，下次直接照抄。

你用过哪些RAG优化策略？评论区分享你的经验。

关注怕浪猫，下期我们让AI能联网——Agent工具调用，让聊天机器人真正"动起来"。

系列进度 5/23

**下章预告：** 第6章进入Agent开发——工具调用、LangGraph工作流、实时联网搜索，让AI不再只是"回答"，而是"行动"。
