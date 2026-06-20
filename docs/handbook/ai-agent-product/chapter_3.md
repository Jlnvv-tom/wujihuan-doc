# 第3章 RAG 与知识库：让大模型更懂业务

大模型什么都知道，就是不知道你公司的事。这是AI产品落地最大的痛点，也是RAG要解决的核心问题。

我是怕浪猫，这章我们深入RAG——从原理到实战，把知识库构建和检索优化全链路讲透。

## 3.1 RAG 基础原理

### 什么是RAG

RAG（Retrieval-Augmented Generation，检索增强生成）的核心思路很简单：在模型生成回答之前，先从知识库中检索相关信息，把检索到的信息作为上下文传给模型，让模型基于这些信息来回答问题。

没有RAG：
```
用户提问 → 大模型 → 回答（基于模型训练数据，可能过时或编造）
```

有RAG：
```
用户提问 → 检索知识库 → 获取相关文档 → 大模型基于文档回答 → 准确且有来源的回答
```

RAG解决的核心问题：
1. 知识时效性——模型不知道最新信息，RAG可以实时检索
2. 私有知识——模型不知道你公司的内部信息，RAG可以检索企业知识库
3. 幻觉问题——模型容易编造信息，RAG让模型基于真实文档回答
4. 可追溯性——RAG的回答可以标注信息来源

> RAG的本质是给大模型"开卷考试"——不是让它凭记忆回答，而是让它查阅资料后回答。

### RAG vs 微调 vs 预训练

三种让大模型掌握新知识的方式对比：

| 维度 | 预训练 | 微调 | RAG |
|------|--------|------|-----|
| 成本 | 极高（百万级） | 中等（万级） | 低（千级） |
| 数据需求 | 万亿级token | 万条标注数据 | 原始文档即可 |
| 知识更新 | 需重新训练 | 需重新微调 | 即时更新 |
| 适用场景 | 通用基座模型 | 特定任务/风格 | 特定知识/FAQ |
| 幻觉控制 | 弱 | 中 | 强（有检索依据） |
| 技术门槛 | 极高 | 中 | 低 |

对大多数企业来说，RAG是最优起步方案。只有当RAG无法满足需求时（比如需要模型学习特定风格或推理模式），才考虑微调。

### RAG的工作流程

完整的RAG流程分为5步：

**1. 文档处理**
原始文档 → 清洗 → 分段 → 生成向量 → 存入向量数据库

**2. 用户输入处理**
用户问题 → Query优化（可选） → 生成查询向量

**3. 检索**
查询向量 → 向量数据库检索 → 返回Top-K相似文档

**4. 重排序（可选）**
检索结果 → Rerank模型重排序 → 更精准的结果

**5. 生成**
用户问题 + 检索结果 → 大模型 → 生成回答

这5步中，第1步（文档处理）和第3步（检索）对最终效果影响最大。文档质量差，检索再好也没用；检索差，再好的文档也找不到。

### 向量数据库基础

向量数据库是RAG的核心基础设施。它存储的是文本的向量表示（一串数字），通过计算向量之间的距离来衡量文本的语义相似度。

度量方式：
- 欧氏距离（Euclidean Distance）：几何距离，越小越相似
- 余弦相似度（Cosine Similarity）：角度距离，越大越相似
- 内积（Dot Product）：计算简单，需先归一化

常用的向量数据库：

| 数据库 | 类型 | 特点 | 适用场景 |
|--------|------|------|---------|
| Chroma | 嵌入式 | 轻量、Python原生、上手简单 | 原型验证、小规模 |
| FAISS | 库 | Meta开源，性能强，内存索引 | 大规模检索 |
| Milvus | 分布式 | 可扩展、功能丰富、支持混合检索 | 生产环境 |
| Pinecone | 云服务 | 免运维、API简单 | 快速上线 |
| Qdrant | 分布式 | Rust实现，性能好，支持过滤 | 高性能场景 |
| Weaviate | 分布式 | 支持混合搜索、多模态 | 通用场景 |

选择建议：MVP阶段用Chroma（5分钟跑起来），生产环境用Milvus或Qdrant，不想运维用Pinecone。

### Embedding模型

Embedding模型负责把文本转成向量。好的Embedding模型是RAG效果的基础。

Embedding的本质：把语义相近的文本映射到向量空间中相近的位置。比如"怎么退货"和"退货流程"的向量距离应该很近，而"怎么退货"和"公司财报"的向量距离应该很远。

常用Embedding模型对比：

| 模型 | 维度 | 上下文长度 | 特点 | 推荐场景 |
|------|------|-----------|------|---------|
| text-embedding-3-small | 1536 | 8192 | OpenAI出品，性价比高 | 通用场景 |
| text-embedding-3-large | 3072 | 8192 | OpenAI出品，精度高 | 高精度需求 |
| bge-large-zh-v1.5 | 1024 | 512 | 中文优化，开源 | 中文场景 |
| gte-large-zh | 1024 | 512 | 中文优化，开源 | 中文场景 |
| m3e-base | 768 | 512 | 中文开源，轻量 | 资源受限场景 |
| voyage-2 | 1024 | 4000 | 长上下文，效果好 | 长文档场景 |

选择建议：中文场景优先用bge-large-zh-v1.5，英文场景用text-embedding-3-small，长文档场景用voyage-2。

> Embedding模型决定了"语义理解"的天花板。选错了Embedding模型，后面的检索优化都是空中楼阁。

## 3.2 知识库构建

### 文档预处理

原始文档往往格式混乱，直接用来做RAG效果很差。预处理是知识库构建中最容易被忽视但最重要的环节。

预处理的4个步骤：

**1. 格式统一**
把各种格式的文档转成统一的纯文本。不同格式的提取方式不同：

```python
# PDF文本提取（保留布局）
from pypdf import PdfReader

def extract_pdf_with_layout(file_path):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n---\n"
    return text

# Word文档提取
from docx import Document

def extract_docx(file_path):
    doc = Document(file_path)
    # 保留标题层级
    text = ""
    for para in doc.paragraphs:
        if para.style.name.startswith('Heading'):
            level = int(para.style.name[-1])
            text += "#" * level + " " + para.text + "\n"
        else:
            text += para.text + "\n"
    return text

# HTML提取（去掉标签）
from bs4 import BeautifulSoup

def extract_html(file_path):
    with open(file_path, 'r') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    return soup.get_text(separator='\n', strip=True)
```

**2. 噪声清洗**
去掉页眉页脚、水印、乱码、重复内容等噪声。

具体的清洗规则：
- 去掉连续3个以上相同字符的行（通常是分隔线）
- 去掉少于10个字符的行（通常是导航或广告）
- 去掉包含"版权所有""保留所有权利"等版权声明的行
- 去掉URL列表（除非是知识库的一部分）
- 去掉空行（保留段落分隔）

**3. 结构化提取**
保留文档的层次结构（标题、段落、列表），对后续的分段和检索有帮助。

建议用Markdown格式保存清洗后的文档，因为Markdown天然支持标题层级，方便后续按标题分段。

**4. 元数据标注**
为每个文档添加元数据：

```json
{
  "content": "退货政策：自收到商品7天内可申请退货，需保持商品完好",
  "metadata": {
    "source": "用户服务条款v3.2",
    "category": "售后",
    "updated_at": "2024-03-15",
    "version": "3.2",
    "tags": ["退货", "售后政策", "7天"],
    "doc_id": "tos_v3.2_section_5"
  }
}
```

元数据的作用：
1. 检索时做过滤——用户问"退货"，只在"售后"分类下检索
2. 回答时标注来源——让用户知道信息出处
3. 更新时精准定位——文档更新时只更新变化的片段

### 分段策略

分段（Chunking）是把长文档切成小段的过程。分段策略直接影响检索效果——段太长会包含无关信息，段太短会丢失上下文。

4种核心分段策略：

**策略一：固定长度分段**

最简单，按固定字符数切段，相邻段之间有重叠。

```python
def fixed_chunk(text, chunk_size=500, overlap=50):
    chunks = []
    start = 0
    while start < len(text):
        chunk = text[start:start+chunk_size]
        chunks.append({
            "content": chunk,
            "metadata": {"start": start, "end": start+chunk_size}
        })
        start += chunk_size - overlap
    return chunks
```

优点：实现简单，长度可控。缺点：可能在句子中间截断，破坏语义完整性。适合格式不规范的文档。

**策略二：语义分段**

按文档的自然边界（段落、标题、列表项）来分段。

```python
import re

def semantic_chunk_markdown(text):
    # 按Markdown标题分段
    sections = re.split(r'\n#+\s+', text)
    chunks = []
    for section in sections:
        lines = section.strip().split('\n')
        if not lines:
            continue
        title = lines[0]
        content = '\n'.join(lines[1:])
        
        # 如果内容过长，再按段落细分
        if len(content) > 800:
            sub_chunks = fixed_chunk(content, 500, 50)
            for i, sub in enumerate(sub_chunks):
                sub["metadata"]["title"] = title
                sub["metadata"]["sub_index"] = i
            chunks.extend(sub_chunks)
        else:
            chunks.append({
                "content": f"# {title}\n{content}",
                "metadata": {"title": title}
            })
    return chunks
```

优点：保留语义完整性。缺点：段落长度不均匀，检索时可能有些段信息量太少。

**策略三：递归分段**

先按大边界（章节）切，再按中边界（段落）切，最后按小边界（句子）切。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    separators=[
        "\n## ", "\n### ",   # Markdown二级、三级标题
        "\n\n", "\n",        # 段落、换行
        "。", "！", "？",    # 中文句子结束
        ". ", "! ", "? ",    # 英文句子结束
        " ", ""              # 最后按词切
    ],
    chunk_size=500,
    chunk_overlap=50,
    length_function=len
)
chunks = splitter.split_text(text)
```

优点：兼顾语义完整性和长度均匀性。推荐作为默认策略。

**策略四：语义感知分段（进阶）**

用Embedding模型来判断两段文本是否语义连续，而不是简单按长度切。

```python
import numpy as np

def semantic_aware_chunk(paragraphs, embedding_model, max_chunk_size=800):
    chunks = []
    current_chunk = []
    current_length = 0
    
    for i, para in enumerate(paragraphs):
        para_embedding = embedding_model.embed(para)
        
        # 如果当前段和上一个段语义相似，合并
        if current_chunk:
            prev_embedding = embedding_model.embed(current_chunk[-1])
            similarity = cosine_similarity(para_embedding, prev_embedding)
            if similarity > 0.7 and current_length + len(para) <= max_chunk_size:
                current_chunk.append(para)
                current_length += len(para)
                continue
        
        # 否则，保存当前chunk，开始新的chunk
        if current_chunk:
            chunks.append("\n".join(current_chunk))
        current_chunk = [para]
        current_length = len(para)
    
    if current_chunk:
        chunks.append("\n".join(current_chunk))
    
    return chunks
```

分段参数调优指南：

| 参数 | 建议值 | 调优方向 |
|------|--------|---------|
| chunk_size | 300-800字 | 信息密度高的文档（技术文档）用小值，信息密度低的（小说）用大值 |
| chunk_overlap | 50-100字 | 避免关键信息被截断在边界处 |
| 分段边界 | 优先按段落/标题 | 保持语义完整性 |
| 最大段数 | 每个文档不超过50段 | 段太多会增加检索噪声 |

> 分段是RAG效果的第一道关。分段做得好，后面检索再差也差不到哪去；分段做得差，后面检索再好也好不到哪去。

### 知识库更新策略

知识库不是建好就完事的，需要持续更新：

| 更新类型 | 频率 | 触发条件 | 方法 |
|---------|------|---------|------|
| 增量更新 | 实时/每天 | 新文档产生 | 新文档自动分段入库 |
| 差异更新 | 按需 | 文档内容变更 | 只更新变化的片段 |
| 全量重建 | 每月/每季度 | 分段策略变更 | 重新处理全部文档 |
| 过期清理 | 每季度 | 文档过期 | 删除过期片段 |

增量更新的实现：

```python
def incremental_update(new_docs, vector_db, embedding_model):
    """只处理新增或变更的文档"""
    for doc in new_docs:
        doc_id = doc["metadata"]["doc_id"]
        
        # 检查是否已存在
        existing = vector_db.get(where={"doc_id": doc_id})
        
        if existing:
            # 比较更新时间，如果没变就跳过
            if existing[0]["metadata"]["updated_at"] == doc["metadata"]["updated_at"]:
                continue
            # 如果变了，先删除旧的
            vector_db.delete(where={"doc_id": doc_id})
        
        # 分段并入库
        chunks = semantic_chunk_markdown(doc["content"])
        for chunk in chunks:
            chunk["metadata"]["doc_id"] = doc_id
            vector = embedding_model.embed(chunk["content"])
            vector_db.add(vector, chunk["content"], chunk["metadata"])
```

## 3.3 检索优化全链路

### Query优化

用户的原始提问往往不是最优的检索query。比如用户问"怎么退"，直接用"怎么退"去检索效果很差，因为知识库里的表述是"退货流程"。

Query优化的3种方法：

**1. Query改写**

让大模型把用户的口语化问题改写成更规范的检索query。

```python
def rewrite_query(original_query):
    prompt = f"""用户的问题是：{original_query}

请把这个问题改写成3个不同的检索query，要求：
1. 使用知识库中可能出现的专业术语
2. 保留核心意图，扩展可能的表述方式
3. 每个query不超过20个字

输出格式：
query1: ...
query2: ...
query3: ..."""
    
    response = llm.invoke(prompt)
    return parse_queries(response)
```

实际效果：
```
原始问题：怎么退
改写后：
query1: 退货流程
query2: 退货条件和时限
query3: 如何申请退货
```

**2. Query扩展**

从一个问题扩展出多个相关问题，增加检索覆盖面。

```
原始问题：运费怎么算
扩展后：
- 运费计算标准是什么
- 免邮条件是什么
- 偏远地区运费怎么算
- 不同地区的运费标准
```

**3. HyDE（Hypothetical Document Embedding）**

让大模型先生成一个假设的答案，用这个答案去检索。因为答案的表述更接近知识库中的文档表述。

```python
def hyde_retrieval(query, vector_db, embedding_model, llm):
    # 让模型生成一个假设的答案
    hypo_prompt = f"请回答以下问题（即使不确定也要给出一个合理的回答）：{query}"
    hypo_answer = llm.invoke(hypo_prompt)
    
    # 用假设答案的向量去检索
    hypo_vector = embedding_model.embed(hypo_answer)
    results = vector_db.similarity_search_by_vector(hypo_vector, k=5)
    
    return results
```

为什么HyDE有效？因为用户的问题和知识库中的文档在向量空间中的距离可能很远（表述方式不同），但假设答案和知识库文档的距离更近（都使用规范表述）。

### 混合检索

纯向量检索有一个问题：它擅长语义匹配，但不擅长精确匹配。比如用户搜一个具体的产品型号"XR-500"，向量检索可能返回语义相似但不精确的结果（比如"XR-400的介绍"）。

解决方案：混合检索 = 向量检索 + 关键词检索（BM25）

```python
from rank_bm25 import BM25Okapi

def hybrid_retrieval(query, vector_db, bm25_index, chunks, top_k=5):
    # 向量检索
    query_vector = embedding_model.embed(query)
    vector_results = vector_db.similarity_search_by_vector(
        query_vector, k=top_k*2
    )
    
    # 关键词检索（BM25）
    tokenized_query = tokenize(query)  # 中文需要分词
    bm25_scores = bm25_index.get_scores(tokenized_query)
    bm25_top_indices = np.argsort(bm25_scores)[-top_k*2:][::-1]
    bm25_results = [chunks[i] for i in bm25_top_indices]
    
    # 融合排序（RRF）
    merged = reciprocal_rank_fusion(vector_results, bm25_results)
    return merged[:top_k]

def reciprocal_rank_fusion(list1, list2, k=60):
    """RRF融合两个排序结果"""
    scores = {}
    for rank, doc in enumerate(list1, 1):
        doc_id = doc["metadata"]["chunk_id"]
        scores[doc_id] = scores.get(doc_id, 0) + 1/(k + rank)
    
    for rank, doc in enumerate(list2, 1):
        doc_id = doc["metadata"]["chunk_id"]
        scores[doc_id] = scores.get(doc_id, 0) + 1/(k + rank)
    
    # 按RRF分数排序
    sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [get_chunk_by_id(doc_id) for doc_id, _ in sorted_docs]
```

### Rerank重排序

检索返回的结果可能不够精准，Rerank模型可以对结果进行二次排序。

Rerank的原理：用一个专门训练的模型，对"问题-文档"对进行相关性打分，比向量相似度更精准。因为Rerank模型可以同时看到问题和文档，而向量检索只能分别看问题和文档。

常用Rerank模型：

| 模型 | 维度 | 特点 | 推荐场景 |
|------|------|------|---------|
| bge-reranker-large | 1024 | 中文优化，开源 | 中文场景首选 |
| bge-reranker-base | 768 | 中文优化，轻量 | 资源受限场景 |
| cohere-rerank-v3 | - | API服务，效果好 | 英文场景，不想自己部署 |
| bce-reranker-base_v1 | 768 | 中文开源，效果好 | 中文场景备选 |

Rerank的典型流程：

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder('BAAI/bge-reranker-large')

def rerank_results(query, retrieved_docs, top_k=5):
    # 构建"问题-文档"对
    pairs = [[query, doc["content"]] for doc in retrieved_docs]
    
    # 计算相关性分数
    scores = reranker.predict(pairs)
    
    # 按分数排序
    scored_docs = list(zip(retrieved_docs, scores))
    scored_docs.sort(key=lambda x: x[1], reverse=True)
    
    return [doc for doc, score in scored_docs[:top_k]]
```

Rerank的成本：Rerank模型比Embedding模型大，推理速度慢。建议只Rerank检索返回的Top-20结果，而不是全部候选。

> 检索是广撒网，Rerank是精准捕鱼。没有Rerank的RAG，就像只有搜索引擎没有排序算法。

### 上下文窗口管理

检索到的文档可能很长，而大模型的上下文窗口有限。需要策略性地选择和裁剪传入模型的上下文。

3种上下文管理策略：

**1. 硬截断** 只取相关性最高的Top-K文档，超出上下文窗口就截断。最简单但有信息损失。适合对成本敏感的场景。

**2. 压缩摘要** 对每个检索到的文档先做摘要，再传入模型。保留信息但增加延迟。适合对质量敏感的场景。

**3. 分层注入** 按相关性从高到低排列，优先填入高相关性文档，剩余空间填入低相关性文档。平衡了质量和成本。

上下文窗口管理的代码示例：

```python
def build_context(retrieved_docs, max_context_length=3000):
    """
    构建传入模型的上下文
    retrieved_docs: 按相关性排序的文档列表
    max_context_length: 最大上下文长度（字符数）
    """
    context = ""
    sources = []
    
    for doc in retrieved_docs:
        doc_text = f"[来源：{doc['metadata']['source']}]\n{doc['content']}\n\n"
        
        if len(context) + len(doc_text) > max_context_length:
            # 如果加入这个文档会超，尝试截断
            remaining = max_context_length - len(context)
            if remaining > 100:  # 至少保留100字才有意义
                doc_text = doc_text[:remaining] + "...（内容过长，已截断）"
                context += doc_text
                sources.append(doc['metadata']['source'])
            break
        else:
            context += doc_text
            sources.append(doc['metadata']['source'])
    
    return context, sources
```

## 3.4 RAG 综合实战

### 实战：完整RAG系统搭建

用LangChain + Chroma + OpenAI搭建一个完整的RAG系统：

```python
from langchain.document_loaders import DirectoryLoader, PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# ============ 1. 文档加载 ============
def load_documents(doc_dir):
    """加载多种格式的文档"""
    loaders = {
        ".pdf": PyPDFLoader,
        ".docx": Docx2txtLoader,
        ".md": DirectoryLoader,  # Markdown用DirectoryLoader
    }
    
    documents = []
    for ext, loader_cls in loaders.items():
        if ext == ".md":
            loader = DirectoryLoader(doc_dir, glob="**/*.md")
        else:
            # 单个文件加载，实际中需要遍历目录
            pass
        documents.extend(loader.load())
    
    return documents

# ============ 2. 文档分段 ============
def split_documents(documents):
    splitter = RecursiveCharacterTextSplitter(
        separators=["\n## ", "\n### ", "\n\n", "\n", "。", " ", ""],
        chunk_size=500,
        chunk_overlap=50,
        length_function=len
    )
    return splitter.split_documents(documents)

# ============ 3. 向量化并存储 ============
def build_vectorstore(chunks, persist_dir="./chroma_db"):
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=persist_dir
    )
    return vectorstore

# ============ 4. 构建提示词 ============
QA_PROMPT = PromptTemplate(
    template="""基于以下参考资料回答用户的问题。如果参考资料中没有相关信息，请明确说"根据现有资料无法回答"。

参考资料：
{context}

用户问题：{question}

回答要求：
1. 只基于参考资料回答，不编造
2. 如果参考资料中有多个相关段落，综合起来回答
3. 在回答中标注信息来源（引用参考资料的来源标注）
4. 如果参考资料不足以完整回答问题，说明哪些部分可以回答，哪些部分无法回答

回答：""",
    input_variables=["context", "question"]
)

# ============ 5. 创建RAG链 ============
def create_rag_chain(vectorstore):
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1)
    
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=vectorstore.as_retriever(
            search_type="mmr",  # 最大边际相关性
            search_kwargs={"k": 5, "fetch_k": 20}
        ),
        chain_type_kwargs={"prompt": QA_PROMPT},
        return_source_documents=True
    )
    
    return qa_chain

# ============ 主流程 ============
if __name__ == "__main__":
    # 加载文档
    docs = load_documents("./knowledge_base")
    
    # 分段
    chunks = split_documents(docs)
    print(f"共生成 {len(chunks)} 个知识片段")
    
    # 构建向量库
    vectorstore = build_vectorstore(chunks)
    
    # 创建RAG链
    qa_chain = create_rag_chain(vectorstore)
    
    # 测试
    while True:
        query = input("请输入问题（输入q退出）：")
        if query == 'q':
            break
        
        result = qa_chain({"query": query})
        print("\n回答：", result["result"])
        print("\n来源：")
        for doc in result["source_documents"]:
            print(f"- {doc.metadata.get('source', '未知来源')}")
        print("\n" + "="*50 + "\n")
```

### 实战：RAG效果优化checklist

当你发现RAG效果不好时，按以下顺序排查：

**Level 1：数据问题（占80%的效果差异）**
- 知识库是否覆盖了用户的问题？——检查覆盖率
- 文档质量是否足够好（格式统一、噪声少）？——抽样检查原始文档
- 分段是否合理（段太长还是太短）？——检查分段后的片段

快速检查覆盖率的方法：
```python
def check_coverage(test_queries, vector_db, top_k=3):
    """检查测试问题在知识库中的覆盖率"""
    covered = 0
    for query in test_queries:
        results = vector_db.similarity_search(query, k=top_k)
        # 简单判断：如果检索结果和问题完全不相关，认为未覆盖
        if is_relevant(query, results):
            covered += 1
    
    print(f"覆盖率：{covered}/{len(test_queries)} = {covered/len(test_queries):.1%}")
```

**Level 2：检索问题（占15%的效果差异）**
- Embedding模型是否适合你的场景（中文场景用中文模型）？
- 检索的Top-K是否合适（太少会遗漏，太多会噪声）？
- 是否需要混合检索（向量+关键词）？
- 是否需要Rerank？

**Level 3：生成问题（占5%的效果差异）**
- 提示词是否引导模型基于检索结果回答？
- 是否明确告诉模型"不编造，不确定就说不确定"？
- 上下文是否过多导致信息过载？

> RAG优化的80/20法则：80%的效果提升来自数据和分段，20%来自检索和生成优化。先把数据做好，再折腾算法。

### RAG的局限性和应对策略

RAG不是万能的，它有几个固有局限：

**局限1：检索精度瓶颈**
即使用了最好的Embedding和Rerank，检索仍然可能不完美。有些问题需要精确匹配，但向量检索是基于语义相似度的。

应对：设计产品层面的容错机制。比如，当检索结果的相似度分数都低于某个阈值时，主动告诉用户"我找到的资料可能不太相关"，或者引导用户换一种问法。

**局限2：复杂推理支持不足**
RAG擅长事实性问答（"退货政策是什么"），不擅长需要多步推理的问题（"比较A产品和B产品的性价比，哪个更适合我"）。

应对：结合Agent，让AI自主决定是否需要多次检索和推理。第一次检索获取A产品信息，第二次检索获取B产品信息，然后综合对比。

**局限3：表格和图片处理**
当前RAG对表格和图片的支持较弱。表格被转成文本后可能丢失结构信息，图片中的文字无法直接检索。

应对：
- 表格：用Markdown表格格式保留结构，或者在分段时给表格加文字描述
- 图片：用多模态模型（如GPT-4V）提取图片中的文字和语义信息，作为文本存入向量库

**局限4：知识冲突**
当不同文档中的信息矛盾时（比如v2.0版本文档说"支持XX功能"，v3.0版本文档说"不再支持XX功能"），模型可能给出混乱的答案。

应对：在元数据中加入版本信息，检索时优先返回最新版本；在提示词中加入冲突处理规则（"如遇矛盾信息，列出所有来源并说明版本差异"）。

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| RAG原理 | 检索+生成，给大模型"开卷考试" |
| 向量数据库 | MVP用Chroma，生产用Milvus/Qdrant |
| Embedding | 中文用bge-large-zh-v1.5 |
| 分段策略 | 递归分段最推荐，chunk_size 300-800 |
| Query优化 | 改写/扩展/HyDE三种方法 |
| 混合检索 | 向量+BM25，RRF融合 |
| Rerank | 检索后再排序，bge-reranker-large |
| 优化顺序 | 数据→检索→生成，先抓80% |

觉得有用？收藏起来，下次直接照抄。

你做RAG时踩过什么坑？评论区聊聊。

关注怕浪猫，下期我们讲Agent设计方法论——让AI从被动回答变成主动执行。

系列进度 3/13

**下章预告：** 第4章Agent设计方法论，从认知到实战，教你设计能自主决策、调用工具的智能体。
