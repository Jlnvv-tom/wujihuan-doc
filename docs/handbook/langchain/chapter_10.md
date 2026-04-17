# 第10章 RAG（检索增强生成）系统构建（LangChain实战）

本章将从 RAG 核心原理出发，手把手教你用 LangChain 快速搭建问答系统、自定义检索逻辑、优化检索效果，最后通过实战构建基于公司年报的智能问答机器人，所有代码简短可复制，关键步骤标注引用来源，新手也能快速落地生产级 RAG 应用。

# 10.1 RAG 原理与典型架构

在学习实操前，我们先搞懂 RAG 的核心逻辑——它本质是“检索”与“生成”的结合体，核心目标是让 LLM 的回答“有依据、不胡编、可追溯”。相比纯 LLM 生成，RAG 能灵活接入最新文档、私有数据（如公司内部文档），无需重新训练模型，性价比极高。

## 10.1.1 RAG 核心原理（一句话讲透）

当用户发起查询时，RAG 系统先从**私有文档库**中检索出与查询最相关的内容（基于向量嵌入和向量数据库），再将“用户查询 + 检索到的相关文档”一起输入 LLM，让 LLM 基于检索到的内容生成回答——全程不依赖 LLM 自身的训练数据，所有回答都有明确的文档依据。

## 10.1.2 RAG 典型架构（LangChain 实战版）

LangChain 封装了 RAG 的核心流程，无需从零搭建，其典型架构分为 **离线准备阶段** 和 **在线推理阶段**，两个阶段无缝衔接，新手可直接复用框架。

### 1. 离线准备阶段（一次性操作）

核心是“将私有文档转化为可检索的向量数据”，对应前两章的知识，流程如下：

1. 文档加载：加载私有文档（如公司年报、PDF、Markdown），支持多格式；

2. 文本预处理与分块：清洗无效内容、分割长文本（适配嵌入模型和 LLM 输入限制）；

3. 向量嵌入生成：将每个文本块转为嵌入向量；

4. 向量存储：将嵌入向量和原始文本存入向量数据库（如 Chroma、Pinecone），构建私有文档库。

### 2. 在线推理阶段（用户交互时实时执行）

核心是“检索 + 生成”的联动，流程如下：

1. 用户查询：用户输入问题（如“2023年公司营收是多少？”）；

2. 查询嵌入：将用户查询转为向量嵌入；

3. 语义检索：从向量数据库中检索出与查询最相关的文本块；

4. prompt 构造：将“用户查询 + 检索到的相关文本”拼接成 prompt；

5. LLM 生成：将 prompt 输入 LLM，生成基于检索内容的回答，同时返回回答来源。

### RAG 架构图例（极简易懂）

为了更直观理解，用极简流程图展示核心逻辑（可直接用于笔记）：

「离线准备」：私有文档 → 文本分块 → 生成嵌入 → 存入向量数据库
「在线推理」：用户查询 → 生成查询嵌入 → 向量数据库检索 → 拼接 prompt → LLM 生成回答

## 10.1.3 RAG 与纯 LLM 对比（核心优势）

| 对比维度     | 纯 LLM（如 ChatGPT）                    | RAG 系统                                 |
| ------------ | --------------------------------------- | ---------------------------------------- |
| 知识时效性   | 受训练数据限制，无法获取最新信息        | 可实时更新文档库，获取最新知识           |
| 私有数据支持 | 无法接入企业/个人私有数据（如内部文档） | 可接入任意私有文档，保护数据隐私         |
| 回答准确性   | 易产生幻觉（胡编乱造），无依据          | 基于检索文档生成，有明确依据，幻觉率极低 |
| 维护成本     | 需重新训练模型才能更新知识，成本高      | 只需更新文档库，无需训练模型，成本低     |

## 10.1.4 关键提醒

LangChain 是 RAG 开发的“瑞士军刀”，它封装了文档加载、分块、嵌入、检索、LLM 调用的所有组件，无需我们手动拼接流程，只需组合组件即可快速搭建 RAG 系统。

引用来源：[LangChain RAG 官方文档](https://python.langchain.com/docs/modules/data_connection/retrieval_qa)、[LangChain RAG 实战指南](https://juejin.cn/post/7251948949508440099)。

# 10.2 使用 RetrievalQAChain 快速搭建问答系统

LangChain 提供了 **RetrievalQAChain** 组件，它是 RAG 系统的“一键搭建工具”——封装了“检索 + 生成”的完整流程，只需传入向量数据库（检索源）和 LLM，一行代码即可搭建可直接使用的问答系统，适合新手快速验证效果。

## 10.2.1 准备工作：安装依赖 + 初始化组件

### 1. 安装核心依赖

```bash
pip install langchain chromadb sentence-transformers openai python-dotenv
```

说明：本次使用 OpenAI 的 LLM（gpt-3.5-turbo），也可替换为本地化 LLM（如 Llama 3），后续章节会补充。

### 2. 初始化核心组件

需提前准备 3 个核心组件：嵌入模型、向量数据库（含文档）、LLM，代码中会复用前两章的知识，简洁易懂。

## 10.2.2 一键搭建 RAG 问答系统（代码示例）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from dotenv import load_dotenv
import os

# 1. 加载环境变量（OpenAI API 密钥）
# .env 文件内容：OPENAI_API_KEY=你的密钥
load_dotenv()

# 2. 初始化嵌入模型（复用前一章的轻量模型）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 3. 初始化向量数据库（含示例文档，模拟私有文档库）
# 准备示例文档（替换为你的私有文档）
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "公司核心业务分为三大板块：人工智能、云计算、大数据",
    "2023年人工智能板块营收50亿元，占总营收的50%",
    "云计算板块营收30亿元，同比增长30%，是增长最快的板块",
    "大数据板块营收20亿元，同比增长10%"
]
# 存入 Chroma 向量数据库
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./rag_db")
db.persist()

# 4. 初始化 LLM（OpenAI gpt-3.5-turbo，性价比高）
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,  # 温度越低，回答越精准，避免幻觉
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 5. 一键搭建 RAG 问答链（RetrievalQAChain）
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",  # 核心参数：将检索到的文本全部传入 LLM
    retriever=db.as_retriever(k=3),  # 检索前3个最相似的文本块
    return_source_documents=True  # 关键：返回回答的来源文档，便于追溯
)

# 6. 测试问答系统
query = "2023年公司云计算板块营收是多少？同比增长多少？"
result = rag_chain({"query": query})

# 输出结果（含回答和来源）
print("回答：", result["result"])
print("\n来源文档：")
for doc in result["source_documents"]:
    print("-", doc.page_content)
```

## 10.2.3 核心参数解析（避坑重点）

RetrievalQA.from_chain_type 是核心方法，几个关键参数直接影响 RAG 效果，必须掌握：

- `chain_type`：检索到的文本与查询的拼接方式，新手优先选`stuff`（简单高效），其他可选：
  - stuff：将所有检索到的文本全部拼接进 prompt，适合短文本、检索结果少的场景；

  - map_reduce：先单独处理每个检索文本，再汇总生成回答，适合长文本、多检索结果；

  - refine：逐步优化回答，先基于第一个文本生成初步回答，再结合后续文本优化，精度高但速度慢。

- `retriever`：检索器，由向量数据库调用 `as_retriever()`生成，`k=3` 表示检索前3个最相似的文本块；

- `return_source_documents`：是否返回来源文档，建议设为 True，便于验证回答的准确性、追溯依据。

## 10.2.4 运行结果示例（直观参考）

```text
回答： 2023年公司云计算板块营收30亿元，同比增长30%。

来源文档：
- 云计算板块营收30亿元，同比增长30%，是增长最快的板块
```

## 10.2.5 关键提醒

- LLM 替换：若不想用 OpenAI，可替换为本地化 LLM（如 Llama 3），只需修改 llm 的初始化代码；

- 文档替换：将示例 texts 替换为你的私有文档（如公司年报、技术文档），即可实现针对私有数据的问答；

- 引用来源：[LangChain RetrievalQA 链类型文档](https://python.langchain.com/docs/modules/data_connection/retrieval_qa/chain_types)。

# 10.3 自定义检索器（Retriever）逻辑

上一节用的是向量数据库默认的检索器（db.as_retriever()），但在实际场景中，默认检索器可能无法满足需求（如需要自定义检索策略、结合元数据过滤、调整相似度阈值）。LangChain 支持自定义检索器，灵活度极高，可根据业务需求定制检索逻辑。

## 10.3.1 自定义检索器的核心场景

- 场景1：自定义检索数量（k值）和相似度阈值（过滤低相似度结果）；

- 场景2：结合元数据过滤（如只检索2023年的文档、只检索某个板块的内容）；

- 场景3：自定义检索策略（如先过滤元数据，再进行语义检索）；

- 场景4：组合多个检索源（如同时从 Chroma 和 Pinecone 中检索）。

## 10.3.2 自定义检索器（基础版：调整参数）

最常用的自定义方式：调整检索数量、设置相似度阈值，过滤低质量检索结果，避免无效信息干扰 LLM 生成。

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化嵌入模型、向量数据库、LLM（复用前一节代码）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "公司核心业务分为三大板块：人工智能、云计算、大数据",
    "2023年人工智能板块营收50亿元，占总营收的50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%"
]
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./custom_retriever_db")
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 自定义检索器：调整k值 + 设置相似度阈值
custom_retriever = db.as_retriever(
    search_kwargs={
        "k": 2,  # 只检索前2个最相似的文本块（减少无效信息）
        "score_threshold": 0.7  # 相似度阈值≥0.7才保留，过滤低相似度结果
    }
)

# 搭建 RAG 问答链，使用自定义检索器
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=custom_retriever,
    return_source_documents=True
)

# 测试：查询与文档相关性低的问题，验证阈值过滤效果
query = "2023年公司员工人数是多少？"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n来源文档：", result["source_documents"])  # 无相关文档，返回空列表
```

## 10.3.3 自定义检索器（进阶版：结合元数据过滤）

实际场景中，我们可能需要“只检索某个特定条件的文档”（如只检索云计算板块的内容），此时可在检索器中结合元数据过滤，精准定位所需内容。

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from dotenv import load_dotenv
import os

load_dotenv()

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 准备带元数据的文档（模拟不同业务板块的文档）
texts = [
    "2023年人工智能板块营收50亿元，占总营收的50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%",
    "2022年人工智能板块营收40亿元，同比增长15%"
]
metadatas = [
    {"business": "人工智能", "year": 2023},
    {"business": "云计算", "year": 2023},
    {"business": "大数据", "year": 2023},
    {"business": "人工智能", "year": 2022}
]

# 存入向量数据库
db = Chroma.from_texts(
    texts=texts,
    embedding=embeddings,
    metadatas=metadatas,
    persist_directory="./metadata_retriever_db"
)

llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 自定义检索器：结合元数据过滤（只检索2023年人工智能板块的文档）
custom_retriever = db.as_retriever(
    search_kwargs={
        "k": 2,
        "score_threshold": 0.7,
        "filter": {"$and": [{"year": 2023}, {"business": "人工智能"}]}  # 元数据过滤条件
    }
)

# 搭建 RAG 问答链
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=custom_retriever,
    return_source_documents=True
)

# 测试：查询2023年人工智能板块营收
query = "2023年人工智能板块营收是多少？"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n来源文档：")
for doc in result["source_documents"]:
    print(f"- 内容：{doc.page_content}，元数据：{doc.metadata}")
```

## 10.3.4 自定义检索器（高级版：自定义检索逻辑）

若以上方式仍无法满足需求，可通过 LangChain 的 `BaseRetriever` 类，完全自定义检索逻辑（如先检索、再过滤、再排序），灵活性拉满。

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.retrievers import BaseRetriever
from langchain.schema import Document
from typing import List
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 自定义检索器类，继承 BaseRetriever
class MyCustomRetriever(BaseRetriever):
    def __init__(self, vector_db):
        self.vector_db = vector_db  # 向量数据库

    def _get_relevant_documents(self, query: str) -> List[Document]:
        # 自定义检索逻辑：先检索，再过滤，再排序
        # 步骤1：语义检索（前3个最相似）
        docs = self.vector_db.similarity_search(query, k=3)
        # 步骤2：过滤掉长度小于10的文档（自定义过滤规则）
        filtered_docs = [doc for doc in docs if len(doc.page_content) >= 10]
        # 步骤3：按文档长度排序（越长越优先，可自定义排序规则）
        filtered_docs.sort(key=lambda x: len(x.page_content), reverse=True)
        return filtered_docs

# 2. 初始化组件
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "人工智能板块营收50亿",  # 长度小于10，会被过滤
    "云计算板块营收30亿元，同比增长30%，是增长最快的板块",
    "大数据板块营收20亿元，同比增长10%"
]
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./advanced_retriever_db")
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 3. 实例化自定义检索器
custom_retriever = MyCustomRetriever(vector_db=db)

# 4. 搭建 RAG 问答链
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=custom_retriever,
    return_source_documents=True
)

# 测试
query = "2023年各板块营收情况？"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n来源文档（已过滤短文本）：")
for doc in result["source_documents"]:
    print("-", doc.page_content)
```

## 10.3.5 关键提醒

- 自定义检索器的核心是“按需调整检索逻辑”，无需过度复杂，能解决实际问题即可；

- 元数据过滤、相似度阈值是最常用的自定义方式，优先掌握；

- 引用来源：[LangChain 自定义检索器官方文档](https://python.langchain.com/docs/modules/data_connection/retrievers/custom)。

# 10.4 多路召回与重排序（Re-ranking）

在大规模文档场景中，单一的语义检索（基于向量嵌入）可能存在“漏检”“检索精度低”的问题。此时可采用 **多路召回 + 重排序** 策略，提升检索效果——多路召回从多个来源获取候选文档，重排序对候选文档进行二次打分，筛选出最相关的内容。

## 10.4.1 核心概念解析

- 多路召回：同时使用多种检索方式（如向量语义检索 + 关键词检索），从不同维度获取候选文档，避免单一检索的局限性；

- 重排序（Re-ranking）：对多路召回得到的候选文档，使用专门的重排序模型（如 Cross-BERT）进行二次打分，结合语义相似度和关键词匹配度，最终筛选出最相关的文档。

简单来说：多路召回“广撒网”，重排序“精筛选”，两者结合能大幅提升检索精度，适合大规模、复杂文档场景。

## 10.4.2 多路召回实战（向量检索 + 关键词检索）

LangChain 支持组合多个检索器，实现多路召回，以下示例结合“向量语义检索”和“关键词检索”，获取更全面的候选文档。

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.retrievers import EnsembleRetriever  # 用于组合多个检索器
from langchain.retrievers import BM25Retriever  # 关键词检索器
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化嵌入模型和向量数据库（向量检索源）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "公司核心业务：人工智能、云计算、大数据",
    "人工智能板块营收50亿元，占总营收50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%"
]
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./multi_retriever_db")
vector_retriever = db.as_retriever(k=3)  # 向量检索器

# 2. 初始化关键词检索器（BM25Retriever，传统关键词检索）
bm25_retriever = BM25Retriever.from_texts(texts=texts)
bm25_retriever.k = 3  # 关键词检索前3个结果

# 3. 多路召回：组合向量检索器和关键词检索器
ensemble_retriever = EnsembleRetriever(
    retrievers=[vector_retriever, bm25_retriever],  # 多个检索器
    weights=[0.7, 0.3]  # 权重：向量检索占70%，关键词检索占30%
)

# 4. 初始化 LLM 和 RAG 问答链
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=ensemble_retriever,
    return_source_documents=True
)

# 测试：查询同时包含关键词和语义相关的内容
query = "2023年营收增长情况？"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n多路召回的来源文档：")
for doc in result["source_documents"]:
    print("-", doc.page_content)
```

## 10.4.3 重排序（Re-ranking）实战

多路召回得到候选文档后，使用重排序模型（如 CrossEncoder）对候选文档进行二次打分，筛选出最相关的内容，提升检索精度。LangChain 集成了 Sentence-Transformers 的重排序模型，使用简单。

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import CrossEncoderReranker
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化基础组件
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "公司核心业务：人工智能、云计算、大数据",
    "人工智能板块营收50亿元，占总营收50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%",
    "2023年公司研发投入15亿元，同比增长25%"  # 与查询相关性低
]
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./rerank_db")
vector_retriever = db.as_retriever(k=4)  # 先获取4个候选文档

# 2. 初始化重排序模型（CrossEncoder，专门用于文档重排序）
reranker = CrossEncoderReranker(
    model_name="cross-encoder/ms-marco-MiniLM-L-6-v2",  # 轻量重排序模型
    top_n=3  # 重排序后保留前3个最相关的文档
)

# 3. 结合检索器和重排序模型
compression_retriever = ContextualCompressionRetriever(
    base_retriever=vector_retriever,
    base_compressor=reranker
)

# 4. 搭建 RAG 问答链
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=compression_retriever,
    return_source_documents=True
)

# 测试：重排序会过滤掉相关性低的文档（如研发投入相关）
query = "2023年各板块营收情况？"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n重排序后的来源文档：")
for doc in result["source_documents"]:
    print("-", doc.page_content)
```

## 10.4.4 关键提醒

- 多路召回适合大规模文档场景，小规模文档（如个人知识库）无需使用，避免增加复杂度；

- 重排序模型会增加一定的计算成本，可根据精度需求选择是否使用（轻量模型如 ms-marco-MiniLM-L-6-v2 速度较快）；

- 引用来源：[LangChain 多路召回文档](https://python.langchain.com/docs/modules/data_connection/retrievers/ensemble)、[LangChain 重排序文档](https://python.langchain.com/docs/modules/data_connection/retrievers/contextual_compression)。

# 10.5 查询扩展与 HyDE 技术

在 RAG 系统中，用户的查询往往比较简短、模糊（如“公司营收”），直接检索可能无法精准匹配到相关文档。此时可通过 **查询扩展** 或 **HyDE（Hypothetical Document Embeddings，假设文档嵌入）**技术，优化查询向量，提升检索精度。

## 10.5.1 查询扩展（Query Expansion）

### 核心原理

查询扩展是通过“扩展用户查询的关键词”，生成多个相似的查询语句，再将这些查询语句的嵌入向量进行融合，最终用于检索——让检索更全面，避免因查询太简短导致的漏检。

示例：用户查询“公司营收”，可扩展为“2023年公司总营收”“公司各板块营收情况”“公司营收同比增长数据”。

### 代码示例（LangChain 实现查询扩展）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.retrievers import QueryExpansionRetriever
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化基础组件
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "人工智能板块营收50亿元，占总营收50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%"
]
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./query_expansion_db")
vector_retriever = db.as_retriever(k=3)

# 2. 初始化 LLM（用于生成扩展查询）
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 3. 初始化查询扩展检索器
expansion_retriever = QueryExpansionRetriever(
    base_retriever=vector_retriever,
    llm=llm,
    expansion_query="请将用户的查询扩展为3个更具体、更详细的相关查询，用于检索文档，无需多余解释，用逗号分隔。"
)

# 4. 搭建 RAG 问答链
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=expansion_retriever,
    return_source_documents=True
)

# 测试：简短查询，验证扩展效果
query = "公司营收"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n来源文档：")
for doc in result["source_documents"]:
    print("-", doc.page_content)
```

## 10.5.2 HyDE 技术（假设文档嵌入）

### 核心原理

HyDE 是比查询扩展更高级的优化技术，核心逻辑：

1. 根据用户查询，让 LLM 生成一个“假设性的文档”（即假设存在一篇能完美回答该查询的文档）；

2. 将这个“假设性文档”生成嵌入向量，用该向量进行检索；

3. 由于假设性文档包含更丰富的语义信息，检索精度会比直接用用户查询向量更高。

示例：用户查询“公司营收”，LLM 生成假设文档“2023年公司总营收100亿元，同比增长20%，其中人工智能板块50亿元，云计算板块30亿元，大数据板块20亿元”，用该文档的向量检索，能更精准匹配到相关文档。

### 代码示例（LangChain 实现 HyDE）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.retrievers import HypotheticalDocumentEmbedder  # HyDE 检索器
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化基础组件
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "人工智能板块营收50亿元，占总营收50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%"
]
db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./hyde_db")
vector_retriever = db.as_retriever(k=3)

# 2. 初始化 LLM（用于生成假设性文档）
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.1, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 3. 初始化 HyDE 检索器
hyde_retriever = HypotheticalDocumentEmbedder(
    base_retriever=vector_retriever,
    llm=llm,
    prompt="请根据用户的查询，生成一篇能完美回答该查询的假设性文档，内容详细、具体，无需多余解释。"
)

# 4. 搭建 RAG 问答链
rag_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=hyde_retriever,
    return_source_documents=True
)

# 测试：简短查询，验证 HyDE 效果
query = "公司营收"
result = rag_chain({"query": query})
print("回答：", result["result"])
print("\n来源文档：")
for doc in result["source_documents"]:
    print("-", doc.page_content)
```

## 10.5.3 对比与选型建议

| 技术     | 核心优势                   | 核心不足                        | 适用场景                           |
| -------- | -------------------------- | ------------------------------- | ---------------------------------- |
| 查询扩展 | 简单易实现、计算成本低     | 扩展效果依赖 LLM 生成的查询质量 | 查询较简短、文档规模中等           |
| HyDE     | 检索精度高、能处理模糊查询 | 计算成本稍高（需生成假设文档）  | 查询模糊、文档规模大、对精度要求高 |

引用来源：[LangChain 查询扩展文档](https://python.langchain.com/docs/modules/data_connection/retrievers/query_expansion)、[LangChain HyDE 官方文档](https://python.langchain.com/docs/modules/data_connection/retrievers/hyde)。

# 10.6 处理长文档：分块策略优化

在实际 RAG 场景中，我们经常会遇到长文档（如公司年报、技术手册，单篇文档几万字），直接将长文档生成嵌入会导致“语义信息丢失”，检索精度大幅下降。此时，**分块策略优化** 就成为关键——将长文档分割为合理大小的文本块，既保留上下文信息，又能让嵌入向量精准捕捉语义。

## 10.6.1 长文档分块的核心痛点

- 分块过大：嵌入向量无法精准捕捉文本语义，检索时容易匹配到无关内容；

- 分块过小：上下文信息丢失（如一句话被分割成两段），LLM 生成回答时无法理解完整逻辑；

- 无规则分块：分割时破坏文本结构（如标题与内容分离），导致检索和生成效果变差。

## 10.6.2 LangChain 常用分块策略（实战首选）

LangChain 提供了多种分块器，其中 **RecursiveCharacterTextSplitter** 是最常用、最推荐的分块器，支持按字符分割、保留上下文重叠，适合大多数长文档场景。以下讲解其核心参数和优化技巧。

### 1. 基础分块（RecursiveCharacterTextSplitter）

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 模拟长文档（公司年报片段）
long_document = """2023年公司年度报告
一、公司概况
本公司成立于2010年，专注于人工智能、云计算、大数据三大核心业务，经过13年的发展，已成为行业领先的科技企业，员工人数超过1000人，业务覆盖全国30个省市。

二、财务数据
2023年公司总营收100亿元，同比增长20%，其中人工智能板块营收50亿元，占总营收的50%，同比增长25%；云计算板块营收30亿元，占总营收的30%，同比增长30%；大数据板块营收20亿元，占总营收的20%，同比增长10%。公司净利润15亿元，同比增长18%，研发投入15亿元，同比增长25%，主要用于人工智能算法研发和云计算基础设施建设。

三、业务发展
人工智能板块：全年推出5款新产品，与10家大型企业达成合作，市场份额提升至15%；云计算板块：新增服务器1000台，算力提升50%，服务客户数量突破500家；大数据板块：完成3个省级大数据项目，数据处理能力提升30%。"""

# 初始化分块器（核心参数优化）
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,  # 每个文本块的最大长度（根据嵌入模型调整，一般100-300字符）
    chunk_overlap=20,  # 相邻文本块的重叠长度（保留上下文，一般为chunk_size的10%-20%）
    separators=["\n\n", "\n", "。", "，", " "]  # 分割符优先级：先按段落分割，再按句子，最后按空格
)

# 分块
chunks = text_splitter.split_text(long_document)

# 输出分块结果
print(f"长文档总长度：{len(long_document)}字符")
print(f"分块后数量：{len(chunks)}个")
for i, chunk in enumerate(chunks):
    print(f"\n块{i+1}（{len(chunk)}字符）：{chunk}")
```

### 2. 进阶分块：按文档结构分块（保留标题层级）

对于有明确结构的长文档（如年报、手册，含标题、小标题），可使用 `MarkdownTextSplitter` 或 `HTMLTextSplitter`，按文档结构分块，保留标题与内容的关联，提升检索精度。

```python
from langchain.text_splitter import MarkdownTextSplitter

# 模拟带Markdown结构的长文档（公司年报）
markdown_document = """# 2023年公司年度报告

## 一、公司概况
本公司成立于2010年，专注于人工智能、云计算、大数据三大核心业务，经过13年的发展，已成为行业领先的科技企业，员工人数超过1000人，业务覆盖全国30个省市。

## 二、财务数据
### 2.1 总营收
2023年公司总营收100亿元，同比增长20%。

### 2.2 各板块营收
- 人工智能板块：50亿元，占总营收50%，同比增长25%
- 云计算板块：30亿元，占总营收30%，同比增长30%
- 大数据板块：20亿元，占总营收20%，同比增长10%

## 三、业务发展
人工智能板块全年推出5款新产品，与10家大型企业达成合作，市场份额提升至15%。"""

# 按Markdown结构分块（保留标题层级）
text_splitter = MarkdownTextSplitter(
    chunk_size=300,
    chunk_overlap=20
)

chunks = text_splitter.split_text(markdown_document)

# 输出分块结果（保留标题与内容关联）
for i, chunk in enumerate(chunks):
    print(f"\n块{i+1}：{chunk}")
```

## 10.6.3 分块策略优化技巧（实战避坑）

- chunk_size 选择：根据嵌入模型的输入限制调整，一般为 100-300 字符（all-MiniLM-L6-v2 支持更长文本，可设为 300-500）；

- chunk_overlap 选择：建议为 chunk_size 的 10%-20%（如 chunk_size=200，overlap=20-40），保留上下文关联；

- 分割符优先级：优先按段落（\n\n）、句子（。、，）分割，避免破坏文本结构；

- 长文档预处理：先去除无效内容（如空白、重复段落），再分块，减少无效分块；

- 分块后验证：分块后检查是否有上下文断裂、标题与内容分离的情况，及时调整参数。

## 10.6.4 关键提醒

分块策略没有“最优解”，需根据文档类型（如年报、技术文档）、嵌入模型、检索需求调整，建议多测试几种参数，选择检索精度最高的分块方式。

引用来源：[LangChain 文本分块器官方文档](https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/)。

# 10.7 RAG 效果评估指标（召回率、准确率）

搭建 RAG 系统后，如何判断其效果好坏？不能只靠“主观感受”，需要用明确的评估指标量化效果。RAG 系统的核心评估指标的是 **召回率（Recall）** 和 **准确率（Precision）**，此外还有 F1 分数、BLEU 分数等辅助指标，本节重点讲解最常用的前两个指标。

## 10.7.1 核心评估指标解析

评估 RAG 效果，核心是判断“检索到的文档是否准确、是否完整”，因此召回率和准确率是核心指标，用简单的语言解释：

### 1. 召回率（Recall）

核心：**所有与查询相关的文档中，被成功检索到的比例**，衡量“是否漏检”。

公式：召回率 = 检索到的相关文档数 / 所有相关文档总数

示例：查询“2023年各板块营收”，所有相关文档有3篇（人工智能、云计算、大数据），检索到2篇，则召回率 = 2/3 ≈ 66.7%。

要求：召回率越高越好，避免漏检相关文档（漏检会导致 LLM 生成的回答不完整）。

### 2. 准确率（Precision）

核心：**检索到的文档中，真正与查询相关的比例**，衡量“是否误检”。

公式：准确率 = 检索到的相关文档数 / 检索到的所有文档数

示例：检索到3篇文档，其中2篇与查询相关，1篇无关，则准确率 = 2/3 ≈ 66.7%。

要求：准确率越高越好，避免误检无关文档（误检会干扰 LLM 生成，导致回答不准确）。

### 3. 平衡指标：F1 分数

F1 分数是召回率和准确率的调和平均数，综合两者的表现，避免单一指标的局限性，公式：

F1 = 2 ×（准确率 × 召回率）/（准确率 + 召回率）

F1 分数越高，说明 RAG 系统的
