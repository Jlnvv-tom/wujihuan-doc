# 第6章 检索增强生成：打造知识库驱动型Agent

Agent如果只依赖LLM的内置知识，就像一个只靠记忆力的学生——知识有限且会过时。RAG（Retrieval-Augmented Generation）让Agent能从外部知识库中检索专业、实时的信息，大幅提升回答的准确性和深度。本章将从全流程解析到高级策略，系统讲解RAG技术。

## 6.1 RAG全流程解析：数据清洗、分块与索引构建

### RAG的核心流程

```
离线阶段：文档 -> 清洗 -> 分块 -> Embedding -> 向量数据库
在线阶段：问题 -> Embedding -> 检索 -> 拼入提示词 -> LLM生成
```

### 数据清洗

原始文档通常格式混乱、包含噪音，清洗质量直接影响检索效果：

```python
import re

class DocumentCleaner:
    """文档清洗工具"""

    def clean(self, text: str) -> str:
        text = self._remove_boilerplate(text)
        text = self._normalize_whitespace(text)
        text = self._remove_special_chars(text)
        return text.strip()

    def _remove_boilerplate(self, text: str) -> str:
        """移除页眉页脚、版权声明等模板文本"""
        patterns = [
            r"版权所有.*?保留一切权利",
            r"本文档仅供参考.*?不构成任何建议",
            r"第\s*\d+\s*页\s*/\s*\d+",
        ]
        for pattern in patterns:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        return text

    def _normalize_whitespace(self, text: str) -> str:
        """规范化空白字符"""
        text = re.sub(r"\n{3,}", "\n\n", text)  # 多个换行压缩为两个
        text = re.sub(r"[ \t]+", " ", text)       # 多个空格压缩为一个
        return text

    def _remove_special_chars(self, text: str) -> str:
        """移除不可见字符和乱码"""
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        return text
```

### 文本分块策略

分块是RAG中最关键的环节。块太大则检索精度低，块太小则上下文不完整。

**策略一：固定长度分块**

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,       # 每块500字符
    chunk_overlap=50,     # 块间重叠50字符
    separators=["\n\n", "\n", "。", "！", "？", "；", " "],
)
```

**策略二：语义分块**

按语义边界（段落、章节）分块，而非机械切割：

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter

# 按Markdown标题层级分块
md_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#", "h1"),
        ("##", "h2"),
        ("###", "h3"),
    ]
)
chunks = md_splitter.split_text(markdown_doc)
# 每个chunk会自动携带其所属的标题层级信息
```

**策略三：父-子分块（Small-to-Big Retrieval）**

检索时用小块（精度高），返回时用大块（上下文完整）：

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore

# 子块分块器（检索用）
child_splitter = RecursiveCharacterTextSplitter(chunk_size=200)
# 父块分块器（返回用）
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=1000)

vectorstore = Chroma(embedding_function=embeddings)
docstore = InMemoryStore()  # 存储父块原文

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=docstore,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
)
```

| 分块策略 | 优势 | 劣势 | 适用场景 |
|----------|------|------|---------|
| 固定长度 | 简单可控 | 可能切断语义 | 通用场景 |
| 语义分块 | 保留语义完整 | 依赖文档结构 | Markdown/HTML文档 |
| 父-子分块 | 兼顾精度与上下文 | 实现复杂 | 高质量RAG |

### 索引构建

```python
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# 从文档构建索引
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./knowledge_base",
    collection_metadata={"hnsw:space": "cosine"}  # 使用余弦相似度
)
```

> 参考文档：[LangChain Text Splitters](https://python.langchain.com/docs/modules/data_connection/document_transformers/)

## 6.2 高级检索策略：混合搜索与重排序技术

### 基础向量检索的局限

纯向量检索存在一个根本性问题：**语义相似不等于答案相关**。比如用户问"Python如何安装"，向量检索可能返回一篇标题为"安装Python的各种方法"但内容过时的文章，而错过一篇标题不太相关但内容精确的教程。

### 混合搜索：向量 + 关键词

混合搜索将向量检索（语义匹配）和BM25关键词检索（精确匹配）结合，取长补短：

```python
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever

# 向量检索器
vector_retriever = vectorstore.as_retriever(search_kwargs={"k": 10})

# BM25关键词检索器
bm25_retriever = BM25Retriever.from_documents(chunks, k=10)

# 混合检索器
ensemble_retriever = EnsembleRetriever(
    retrievers=[vector_retriever, bm25_retriever],
    weights=[0.5, 0.5]  # 向量和关键词各占50%权重
)

results = ensemble_retriever.invoke("Python安装教程")
```

### 重排序（Re-ranking）

检索回来的文档按相似度排序，但相似度最高的不一定是最相关的。重排序模型能更精确地评估文档与查询的相关性：

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain_cohere import CohereRerank

# 使用Cohere重排序模型
compressor = CohereRerank(model="rerank-v3.5", top_n=5)

compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=ensemble_retriever
)

# 先检索大量候选，再重排序筛选最相关的5条
results = compression_retriever.invoke("如何优化RAG的检索效果？")
```

### 查询改写与扩展

用户的原始查询可能不够精确。通过LLM改写或扩展查询，可以提升检索召回率：

```python
class QueryRewriter:
    def __init__(self, llm):
        self.llm = llm

    def expand_query(self, original_query: str) -> list[str]:
        """将原始查询扩展为多个子查询"""
        prompt = f"""
原始查询：{original_query}

请生成3个不同角度的子查询，帮助检索到更全面的信息：
1. 同义词替换版本
2. 更具体的细化版本
3. 更宽泛的上位版本
"""
        response = self.llm.invoke(prompt)
        return [original_query] + self._parse_queries(response.content)

    def hyde_query(self, original_query: str) -> str:
        """HyDE：让LLM先假设性回答，用回答来检索"""
        prompt = f"请回答以下问题（即使不确定也给出你的最佳猜测）：{original_query}"
        hypothetical_answer = self.llm.invoke(prompt).content
        return hypothetical_answer  # 用假设性答案作为检索查询
```

> 参考论文：[HyDE: Precise Zero-Shot Dense Retrieval](https://arxiv.org/abs/2212.10496)

## 6.3 知识图谱与Agent的结合：结构化数据的利用

### 向量检索的盲区

向量检索擅长语义匹配，但不擅长处理实体关系和结构化查询。比如"和马斯克共同创立PayPal的人还创立了哪些公司？"——这类多跳关系查询，向量检索几乎无法处理。

### 知识图谱增强RAG

```python
from langchain_community.graphs import Neo4jGraph
from langchain.chains import GraphCypherQAChain

# 连接知识图谱
graph = Neo4jGraph(
    url="bolt://localhost:7687",
    username="neo4j",
    password="your_password"
)

# 用LLM生成Cypher查询
chain = GraphCypherQAChain.from_llm(
    llm=ChatOpenAI(model="gpt-4o", temperature=0),
    graph=graph,
    verbose=True,
)

result = chain.run("和马斯克共同创立PayPal的人还创立了哪些公司？")
# LLM自动生成：MATCH (p:Person)-[:COFOUNDED]->(c:Company {name: 'PayPal'})<-[:COFOUNDED]-(other:Person)
#                MATCH (other)-[:COFOUNDED]->(other_c:Company)
#                RETURN other.name, collect(other_c.name)
```

### GraphRAG：微软的图谱增强方案

微软的GraphRAG方案流程：

1. **抽取**：从文档中抽取实体和关系
2. **构建**：构建社区图谱，发现实体集群
3. **索引**：为每个社区生成摘要
4. **检索**：先定位相关社区，再在社区内检索

```python
# 简化版实体抽取
def extract_entities_and_relations(text: str, llm) -> dict:
    prompt = f"""从以下文本中抽取实体和关系，以JSON格式返回：
文本：{text}

格式：{{
    "entities": [{{"name": "实体名", "type": "类型"}}],
    "relations": [{{"source": "实体1", "target": "实体2", "relation": "关系"}}]
}}"""
    response = llm.invoke(prompt)
    return json.loads(response.content)
```

> 参考文档：[Microsoft GraphRAG](https://microsoft.github.io/graphrag/)

## 6.4 解决RAG痛点：丢失中间内容与多跳推理问题

### 痛点一：Lost in the Middle

研究表明，LLM对上下文中间位置的信息注意力最弱。当检索返回多个文档片段时，排在中间的片段容易被忽略。

**解决方案：文档重排**

```python
def relevance_ordered_placement(documents: list[str], strategy: str = "descending") -> list[str]:
    """按相关性重新排列文档，避免重要信息被放在中间"""
    # 方案1：递减排列 - 最相关的在前
    if strategy == "descending":
        return documents  # 保持检索排序

    # 方案2：交替排列 - 最相关和次相关的交替放置
    if strategy == "alternating":
        result = []
        left, right = 0, len(documents) - 1
        while left <= right:
            result.append(documents[left])
            if left != right:
                result.append(documents[right])
            left += 1
            right -= 1
        return result

    return documents
```

### 痛点二：多跳推理

"谁是美国第46任总统的妻子的出生地？"——这需要两跳推理：第46任总统是谁 -> 他的妻子是谁 -> 她的出生地。

**解决方案：迭代检索**

```python
class MultiHopRetriever:
    def __init__(self, retriever, llm):
        self.retriever = retriever
        self.llm = llm

    def retrieve(self, query: str, max_hops: int = 3) -> list[str]:
        all_docs = []
        current_query = query

        for hop in range(max_hops):
            docs = self.retriever.invoke(current_query)
            all_docs.extend(docs)

            # 判断是否需要继续检索
            judge_prompt = f"""
原始问题：{query}
已检索到的信息：{[d.page_content[:200] for d in all_docs]}

问题是否已经可以被完整回答？
如果否，请生成下一步需要检索的子问题。
"""
            response = self.llm.invoke(judge_prompt).content

            if "是" in response and "完整" in response:
                break

            # 提取下一步检索的子问题
            current_query = response.split("子问题：")[-1].strip() if "子问题：" in response else query

        return all_docs
```

### 痛点三：信息冲突

不同来源的信息可能互相矛盾：

```python
def resolve_conflicts(documents: list[str], query: str, llm) -> str:
    """处理信息冲突"""
    conflict_prompt = f"""
问题：{query}
检索到的信息（可能有冲突）：
{chr(10).join(f'来源{i+1}：{d}' for i, d in enumerate(documents))}

请分析：
1. 哪些信息之间存在冲突？
2. 每个冲突的可能原因是什么（时效性、来源可靠性等）？
3. 你倾向采纳哪个版本？为什么？
"""
    return llm.invoke(conflict_prompt).content
```

## 6.5 知识库动态更新：增量索引与版本管理策略

### 为什么需要动态更新？

知识库不是一成不变的。产品文档会更新、政策法规会调整、技术方案会演进。一个过时的知识库比没有知识库更危险——它会给出错误信息。

### 增量索引

```python
class IncrementalIndexer:
    def __init__(self, vectorstore, embeddings):
        self.vectorstore = vectorstore
        self.embeddings = embeddings
        self.doc_hashes: dict[str, str] = {}  # doc_id -> content_hash

    def _content_hash(self, content: str) -> str:
        import hashlib
        return hashlib.md5(content.encode()).hexdigest()

    def update(self, documents: list) -> dict:
        """增量更新索引"""
        added, updated, unchanged = 0, 0, 0

        for doc in documents:
            doc_id = doc.metadata.get("doc_id", str(id(doc)))
            new_hash = self._content_hash(doc.page_content)

            if doc_id not in self.doc_hashes:
                # 新文档
                self.vectorstore.add_documents([doc])
                self.doc_hashes[doc_id] = new_hash
                added += 1
            elif self.doc_hashes[doc_id] != new_hash:
                # 文档有变更，删除旧版本再添加新版本
                self.vectorstore.delete(ids=[doc_id])
                self.vectorstore.add_documents([doc])
                self.doc_hashes[doc_id] = new_hash
                updated += 1
            else:
                unchanged += 1

        return {"added": added, "updated": updated, "unchanged": unchanged}
```

### 版本管理策略

```python
class VersionedKnowledgeBase:
    def __init__(self, vectorstore):
        self.vectorstore = vectorstore
        self.versions: dict[str, list[dict]] = {}  # doc_id -> 版本列表

    def add_version(self, doc_id: str, content: str, metadata: dict = None):
        """添加文档的新版本"""
        version = {
            "content": content,
            "metadata": metadata or {},
            "timestamp": datetime.now().isoformat(),
            "version": len(self.versions.get(doc_id, [])) + 1
        }
        self.versions.setdefault(doc_id, []).append(version)

        # 只将最新版本写入向量库（标记为current）
        self.vectorstore.add_documents([{
            "page_content": content,
            "metadata": {**(metadata or {}), "doc_id": doc_id, "version": version["version"], "status": "current"}
        }])

    def rollback(self, doc_id: str, target_version: int):
        """回滚到指定版本"""
        if doc_id not in self.versions:
            return False

        versions = self.versions[doc_id]
        target = next((v for v in versions if v["version"] == target_version), None)
        if not target:
            return False

        # 删除当前版本，恢复目标版本
        self.add_version(doc_id, target["content"], target["metadata"])
        return True
```

### 自动更新触发机制

```python
import hashlib
from datetime import datetime

class AutoUpdater:
    """监控源文件变化，自动触发索引更新"""

    def __init__(self, indexer: IncrementalIndexer, source_dir: str):
        self.indexer = indexer
        self.source_dir = source_dir
        self.file_hashes: dict[str, str] = {}

    def scan_and_update(self) -> dict:
        """扫描源目录，检测变化并更新"""
        changes = {"added": [], "modified": [], "deleted": []}

        # 扫描当前文件
        current_files = {}
        for root, dirs, files in os.walk(self.source_dir):
            for f in files:
                if f.endswith(('.md', '.txt', '.pdf', '.docx')):
                    filepath = os.path.join(root, f)
                    with open(filepath, 'rb') as file:
                        file_hash = hashlib.md5(file.read()).hexdigest()
                    current_files[filepath] = file_hash

        # 检测新增和修改
        for filepath, file_hash in current_files.items():
            if filepath not in self.file_hashes:
                changes["added"].append(filepath)
            elif self.file_hashes[filepath] != file_hash:
                changes["modified"].append(filepath)

        # 检测删除
        for filepath in self.file_hashes:
            if filepath not in current_files:
                changes["deleted"].append(filepath)

        # 执行更新
        # ... (将变更文件加载、分块、写入索引)

        self.file_hashes = current_files
        return changes
```

## 本章小结

| RAG环节 | 关键技术 | 核心要点 |
|---------|---------|---------|
| 数据清洗 | 正则去噪、格式规范化 | 垃圾进=垃圾出，清洗是基础 |
| 分块策略 | 固定长度/语义/父-子 | 父-子分块兼顾精度与上下文 |
| 混合检索 | 向量+BM25+重排序 | 语义匹配+精确匹配互补 |
| 查询优化 | 改写/扩展/HyDE | 用LLM优化检索查询 |
| 知识图谱 | Cypher+GraphRAG | 结构化关系+多跳推理 |
| 痛点解决 | 文档重排/迭代检索/冲突消解 | 中间丢失/多跳/信息冲突 |
| 动态更新 | 增量索引/版本管理/自动扫描 | 知识库不是一次性工程 |

> 下一章，我们将从单Agent走向多Agent——让多个智能体协同工作，解决更复杂的系统性问题。
