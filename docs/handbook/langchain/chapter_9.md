# 第9章 向量数据库集成（LangChain实战）

上一章我们学会了如何生成文本的向量嵌入，而向量嵌入的核心用途——语义检索，离不开向量数据库的支撑。向量数据库是专门用于存储、管理、检索高维向量的工具，能高效计算向量间的相似度，是LangChain RAG（检索增强生成）系统的“核心存储中枢”。

本章将聚焦LangChain与主流向量数据库的集成，从选型指南、单数据库快速上手，到高级功能（元数据过滤、检索策略、增量更新），最后通过实战构建可搜索的个人知识库，所有代码简短可复制，关键步骤标注引用来源，新手也能快速落地。

# 9.1 向量数据库选型指南（Chroma、FAISS、Pinecone、Milvus）

LangChain支持几乎所有主流向量数据库，但不同数据库的定位、优势、适用场景差异极大，选错数据库会导致性能瓶颈或开发成本飙升。本节对比4个最常用的向量数据库，帮你快速选对适合自己的工具。

## 9.1.1 核心选型维度

选型前先明确3个核心需求，避免盲目跟风：

- 部署方式：本地部署（适合数据敏感、离线场景）vs 云服务（适合快速开发、规模化场景）；

- 数据规模：小规模（千/万级向量，如个人知识库）vs 大规模（百万/亿级向量，如企业级检索）；

- 开发成本：是否需要复杂配置、是否支持LangChain无缝集成、学习成本高低。

## 9.1.2 四大主流向量数据库对比（实战重点记）

| 数据库           | 部署方式                 | 核心优势                                               | 适用场景                                              | LangChain集成难度            | 引用来源                                                                                           |
| ---------------- | ------------------------ | ------------------------------------------------------ | ----------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Chroma           | 本地/轻量部署、内存模式  | 零配置、轻量快速、支持持久化、API简洁                  | 本地开发、Demo验证、小规模个人/团队知识库（万级向量） | 极低（一行代码集成）         | [LangChain Chroma集成文档](https://python.langchain.com/docs/integrations/vectorstores/chroma)     |
| FAISS            | 本地部署（无服务端）     | Facebook开源、检索速度极快、支持大规模向量（百万级）   | 本地高性能检索、离线场景、对速度要求高的小规模应用    | 低（需简单配置索引）         | [LangChain FAISS集成文档](https://python.langchain.com/docs/integrations/vectorstores/faiss)       |
| Pinecone         | 云服务（托管式）         | 零部署、高可用、支持动态扩容、适合大规模向量           | 生产环境、规模化应用、不想维护服务器的场景            | 低（需获取API密钥）          | [LangChain Pinecone集成文档](https://python.langchain.com/docs/integrations/vectorstores/pinecone) |
| Milvus（米沃思） | 本地/云部署（开源+托管） | 开源、高吞吐、支持亿级向量、功能强大（分区、索引优化） | 企业级应用、大规模数据检索、需要定制化索引的场景      | 中（需部署服务，配置稍复杂） | [LangChain Milvus集成文档](https://python.langchain.com/docs/integrations/vectorstores/milvus)     |

## 9.1.3 选型建议（实战避坑）

- 新手入门/本地Demo：优先选 **Chroma**（零配置，开箱即用）；

- 本地高性能检索/离线场景：选 **FAISS**（速度最快，无服务端依赖）；

- 生产环境/规模化应用：选 **Pinecone**（托管式，无需维护）；

- 企业级大规模数据/定制化需求：选 **Milvus**（开源可控，功能强大）。

后续章节将重点讲解前4个数据库的LangChain集成，重点聚焦Chroma、FAISS、Pinecone（最常用）。

# 9.2 Chroma 快速上手：内存模式 vs 持久化

Chroma是LangChain生态中最受欢迎的向量数据库，主打“轻量、零配置、无缝集成”，支持两种核心运行模式：内存模式（临时存储，程序重启丢失）和持久化模式（本地存储，长期可用），适合新手快速上手。

## 9.2.1 准备工作：安装依赖

```bash
pip install langchain chromadb  # chromadb核心包
pip install sentence-transformers  # 用于生成嵌入（复用前一章知识）
```

## 9.2.2 模式1：内存模式（临时测试）

内存模式无需配置存储路径，向量数据存储在内存中，程序结束后数据丢失，适合临时测试、快速验证功能。

### 代码示例（简短可运行）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

# 1. 初始化嵌入模型（复用前一章的BGE轻量版）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. 初始化Chroma（内存模式，无需指定路径）
db = Chroma(
    embedding_function=embeddings,
    persist_directory=None,  # 内存模式，设为None
    collection_name="test_memory_collection"  # 集合名称（类似数据库表名）
)

# 3. 向数据库中添加文本（自动生成嵌入）
texts = [
    "LangChain是大模型开发框架",
    "Chroma是轻量级向量数据库",
    "向量数据库用于存储嵌入向量"
]
db.add_texts(texts=texts)

# 4. 相似性检索（核心功能）
query = "什么是Chroma？"
similar_docs = db.similarity_search(query, k=2)  # k=2，返回前2个最相似结果

# 输出检索结果
print("内存模式检索结果：")
for i, doc in enumerate(similar_docs):
    print(f"\n结果{i+1}：{doc.page_content}")
```

## 9.2.3 模式2：持久化模式（长期使用）

持久化模式会将向量数据存储到本地指定路径，程序重启后可重新加载，适合长期开发、实际项目使用。

### 代码示例

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

# 1. 初始化嵌入模型
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. 初始化Chroma（持久化模式，指定存储路径）
db = Chroma(
    embedding_function=embeddings,
    persist_directory="./chroma_db",  # 本地存储路径
    collection_name="persistent_collection"
)

# 3. 添加文本并持久化
texts = [
    "Chroma持久化模式可长期存储数据",
    "LangChain与Chroma无缝集成",
    "持久化后重启程序可重新加载数据"
]
db.add_texts(texts=texts)
db.persist()  # 关键：将数据持久化到本地路径

# 4. 重启程序后，重新加载数据库（模拟实际场景）
db_reloaded = Chroma(
    embedding_function=embeddings,
    persist_directory="./chroma_db",
    collection_name="persistent_collection"
)

# 5. 检索验证
query = "Chroma持久化模式有什么用？"
similar_docs = db_reloaded.similarity_search(query, k=1)
print("持久化模式检索结果：")
print(similar_docs[0].page_content)
```

## 9.2.4 两种模式对比与关键提醒

| 模式       | 数据存储位置 | 是否持久化         | 适用场景           |
| ---------- | ------------ | ------------------ | ------------------ |
| 内存模式   | 内存         | 否（程序结束丢失） | 临时测试、快速验证 |
| 持久化模式 | 本地磁盘     | 是（长期保存）     | 实际开发、长期使用 |

- 关键提醒1：持久化模式必须调用 `db.persist()` 才能将数据写入本地；

- 关键提醒2：重新加载时，集合名称（collection_name）必须与创建时一致；

- 引用来源：[Chroma官方快速上手文档](https://docs.trychroma.com/quickstart)。

# 9.3 FAISS 本地高效检索

FAISS（Facebook AI Similarity Search）是Facebook开源的向量检索库，主打“本地部署、检索速度极快”，无需服务端，直接嵌入Python代码中使用，适合本地高性能检索场景（如百万级向量检索）。

注意：FAISS本身不支持持久化（需手动保存/加载索引文件），LangChain对其进行了封装，简化了持久化操作。

## 9.3.1 准备工作：安装依赖

```bash
pip install langchain faiss-cpu  # faiss-cpu（CPU版），GPU版用faiss-gpu
pip install sentence-transformers
```

## 9.3.2 FAISS 快速上手（本地检索）

核心流程：初始化FAISS→添加文本（生成嵌入）→检索→（可选）保存/加载索引。

### 代码示例

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import FAISS

# 1. 初始化嵌入模型
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. 准备文本数据（模拟本地文档）
texts = [
    "FAISS是Facebook开源的向量检索库",
    "FAISS检索速度极快，适合本地部署",
    "FAISS支持大规模向量检索（百万级）",
    "LangChain封装了FAISS，简化使用流程"
]

# 3. 初始化FAISS并添加文本（自动生成嵌入）
db = FAISS.from_texts(texts=texts, embedding=embeddings)

# 4. 相似性检索（核心功能）
query = "FAISS适合什么场景？"
similar_docs = db.similarity_search(query, k=2)
print("FAISS检索结果：")
for i, doc in enumerate(similar_docs):
    print(f"\n结果{i+1}：{doc.page_content}")

# 5. 保存FAISS索引（持久化，可选）
db.save_local("faiss_index")

# 6. 加载FAISS索引（重启程序后使用）
db_reloaded = FAISS.load_local("faiss_index", embeddings)
# 验证检索
query2 = "FAISS是谁开源的？"
print("\n加载索引后检索结果：")
print(db_reloaded.similarity_search(query2, k=1)[0].page_content)
```

## 9.3.3 FAISS 核心优势与注意事项

### 核心优势

- 速度快：比Chroma快5~10倍，尤其适合大规模向量（百万级以上）；

- 无服务端：无需部署数据库服务，直接嵌入代码，轻量化；

- 支持自定义索引：可根据数据规模选择不同索引类型（如IVF_FLAT、HNSW），优化检索速度。

### 注意事项

- 持久化：需手动调用 `save_local()` 和 `load_local()`，否则数据丢失；

- GPU加速：安装 `faiss-gpu` 并配置GPU，可进一步提升检索速度；

- 适用场景：仅适合本地部署，不支持云服务，不适合分布式场景；

- 引用来源：[FAISS官方仓库](https://github.com/facebookresearch/faiss)、[LangChain FAISS集成文档](https://python.langchain.com/docs/integrations/vectorstores/faiss)。

# 9.4 Pinecone 云服务配置与使用

Pinecone是一款托管式向量数据库云服务，主打“零部署、高可用、规模化”，无需维护服务器，只需通过API调用即可使用，适合生产环境、大规模向量检索场景（如亿级向量）。

核心优势：无需关注底层部署、自动扩容、支持动态更新向量，与LangChain无缝集成。

## 9.4.1 准备工作：Pinecone 账号与API配置

1. 注册Pinecone账号：[Pinecone官网](https://www.pinecone.io/)（免费额度足够开发测试）；

2. 创建索引（Index）：登录后，在控制台创建索引，设置参数：
   - Index name：自定义（如langchain-pinecone）；

   - Dimension：嵌入向量维度（如all-MiniLM-L6-v2是384维，BGE-M3是1024维）；

   - 其他参数默认即可。

3. 获取API密钥和环境：控制台→API Keys，复制API Key和Environment（如us-west1-gcp）。

## 9.4.2 安装依赖

```bash
pip install langchain pinecone-client sentence-transformers python-dotenv
```

## 9.4.3 Pinecone 快速上手（云服务调用）

### 代码示例（含配置、添加、检索、删除）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Pinecone
import pinecone
from dotenv import load_dotenv
import os

# 1. 加载环境变量（存储Pinecone API密钥和环境）
# .env文件内容：PINECONE_API_KEY=你的密钥，PINECONE_ENV=你的环境（如us-west1-gcp）
load_dotenv()

# 2. 初始化Pinecone客户端
pinecone.init(
    api_key=os.getenv("PINECONE_API_KEY"),
    environment=os.getenv("PINECONE_ENV")
)

# 3. 初始化嵌入模型（维度需与Pinecone索引维度一致）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")  # 384维

# 4. 连接Pinecone索引（与控制台创建的索引名一致）
index_name = "langchain-pinecone"
db = Pinecone.from_existing_index(
    index_name=index_name,
    embedding=embeddings
)

# 5. 向云索引添加文本（自动生成嵌入，同步到云端）
texts = [
    "Pinecone是托管式向量数据库云服务",
    "Pinecone无需部署，直接通过API调用",
    "Pinecone支持大规模向量检索和动态更新"
]
db.add_texts(texts=texts)

# 6. 相似性检索（从云端索引检索）
query = "Pinecone有什么优势？"
similar_docs = db.similarity_search(query, k=2)
print("Pinecone云服务检索结果：")
for i, doc in enumerate(similar_docs):
    print(f"\n结果{i+1}：{doc.page_content}")

# 7. （可选）删除向量（根据文本内容删除）
db.delete(ids=[doc.metadata["id"] for doc in similar_docs])
```

## 9.4.3 关键提醒与注意事项

- 维度匹配：嵌入模型的维度必须与Pinecone索引的维度一致，否则会报错；

- 免费额度：Pinecone免费额度足够开发测试，生产环境需付费；

- 数据安全：云服务需注意数据隐私，敏感数据建议加密后存储；

- 索引管理：可在Pinecone控制台查看索引状态、向量数量、使用情况；

- 引用来源：[Pinecone官方快速上手](https://docs.pinecone.io/docs/quickstart)、[LangChain Pinecone集成文档](https://python.langchain.com/docs/integrations/vectorstores/pinecone)。

# 9.5 向量存储的元数据过滤（metadata filtering）

在实际检索场景中，仅靠语义相似性检索往往不够——比如你想检索“2024年的LangChain教程”，但向量数据库中既有2023年的，也有2024年的，此时就需要通过**元数据过滤**，精准筛选出符合条件的文档。

元数据（metadata）是附加在文本向量上的“标签信息”，如时间、类别、作者、来源等，LangChain支持在检索时，结合语义相似性和元数据过滤，提升检索精度。

## 9.5.1 元数据的格式与添加方式

元数据通常是字典格式（key-value），添加文本时可同步添加，LangChain会自动将元数据与向量关联存储。

### 代码示例（添加元数据）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(embedding_function=embeddings, persist_directory="./chroma_db", collection_name="metadata_test")

# 准备文本和对应的元数据（字典格式）
texts = [
    "LangChain 2024教程：向量数据库集成",
    "LangChain 2023教程：嵌入模型使用",
    "Pinecone 2024教程：云服务配置",
    "FAISS 2024教程：本地检索优化"
]
# 元数据：包含年份、类别两个标签
metadatas = [
    {"year": 2024, "category": "LangChain"},
    {"year": 2023, "category": "LangChain"},
    {"year": 2024, "category": "Pinecone"},
    {"year": 2024, "category": "FAISS"}
]

# 添加文本和元数据（同步关联）
db.add_texts(texts=texts, metadatas=metadatas)
db.persist()
```

## 9.5.2 元数据过滤检索（核心操作）

LangChain支持两种过滤方式：基础过滤（按单个/多个条件筛选）和复杂过滤（逻辑运算），以下以Chroma为例（FAISS、Pinecone用法类似）。

### 代码示例（基础过滤+复杂过滤）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(embedding_function=embeddings, persist_directory="./chroma_db", collection_name="metadata_test")

# 1. 基础过滤：检索2024年的文档（单个条件）
query = "LangChain教程"
# 过滤条件：year == 2024
filter_condition = {"year": 2024}
similar_docs1 = db.similarity_search(
    query=query,
    k=2,
    filter=filter_condition  # 关键：添加过滤条件
)
print("基础过滤（2024年文档）：")
for doc in similar_docs1:
    print(f"文本：{doc.page_content}，元数据：{doc.metadata}")

# 2. 复杂过滤：检索2024年且类别为LangChain的文档（逻辑与）
filter_condition2 = {"$and": [{"year": 2024}, {"category": "LangChain"}]}
similar_docs2 = db.similarity_search(
    query=query,
    k=1,
    filter=filter_condition2
)
print("\n复杂过滤（2024年+LangChain）：")
print(f"文本：{similar_docs2[0].page_content}，元数据：{similar_docs2[0].metadata}")

# 3. 其他过滤逻辑（逻辑或、不等于等）
# filter_condition3 = {"$or": [{"category": "LangChain"}, {"category": "Pinecone"}]}  # 或
# filter_condition4 = {"year": {"$ne": 2023}}  # 不等于2023
```

## 9.5.3 支持的过滤运算符（通用）

LangChain向量数据库的元数据过滤，支持常见的逻辑运算符，适用于Chroma、Pinecone（FAISS仅支持基础过滤）：

- `$eq`：等于（默认，可省略）；

- `$ne`：不等于；

- `$gt`：大于，`$gte`：大于等于；

- `$lt`：小于，`$lte`：小于等于；

- `$and`：逻辑与，`$or`：逻辑或；

- `$in`：在指定列表中（如{"category": {"$in": ["LangChain", "Pinecone"]}}）。

引用来源：[LangChain元数据过滤官方文档](https://python.langchain.com/docs/modules/data_connection/vectorstores/metadata_filtering)。

# 9.6 相似性搜索 vs MMR（最大边际相关性）

在向量检索中，有两种核心检索策略：**相似性搜索（Similarity Search）**和**MMR（Maximum Marginal Relevance，最大边际相关性）**。前者追求“最相似”，后者追求“相似且多样化”，适用于不同场景。

## 9.6.1 相似性搜索（默认策略）

### 核心逻辑

计算查询向量与所有文档向量的相似度，按相似度从高到低排序，返回前k个结果——核心是“越相似越好”，但可能出现结果重复、同质化的问题。

### 代码示例（回顾）

```python
# 相似性搜索（默认）
similar_docs = db.similarity_search(query=query, k=3)
# 输出结果（相似度从高到低）
```

## 9.6.2 MMR（最大边际相关性）

### 核心逻辑

在保证结果与查询“相似”的同时，最大化结果之间的“差异性”，避免返回重复、同质化的内容。核心参数：

- `k`：返回的结果数量；

- `fetch_k`：先检索出前fetch_k个最相似的结果（默认20）；

- `lambda_mult`：平衡“相似性”和“多样性”（0=只追求多样性，1=只追求相似性，默认0.5）。

### 代码示例（MMR检索）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(embedding_function=embeddings, persist_directory="./chroma_db", collection_name="mmr_test")

# 准备同质化文本（模拟重复内容）
texts = [
    "LangChain向量数据库集成：Chroma使用教程",
    "LangChain向量数据库集成：Chroma安装指南",
    "LangChain向量数据库集成：Chroma持久化方法",
    "LangChain向量数据库集成：FAISS本地部署",
    "LangChain向量数据库集成：Pinecone云服务"
]
db.add_texts(texts=texts)
db.persist()

query = "LangChain向量数据库集成教程"

# 1. 相似性搜索（可能返回多个Chroma相关结果，同质化）
print("相似性搜索结果：")
similar_docs = db.similarity_search(query, k=3)
for i, doc in enumerate(similar_docs):
    print(f"{i+1}. {doc.page_content}")

# 2. MMR检索（相似且多样化，避免同质化）
print("\nMMR检索结果：")
mmr_docs = db.max_marginal_relevance_search(
    query=query,
    k=3,
    lambda_mult=0.5  # 平衡相似性和多样性
)
for i, doc in enumerate(mmr_docs):
    print(f"{i+1}. {doc.page_content}")
```

## 9.6.3 两种策略对比与选型建议

| 检索策略   | 核心优势                             | 核心不足                         | 适用场景                                           |
| ---------- | ------------------------------------ | -------------------------------- | -------------------------------------------------- |
| 相似性搜索 | 简单高效、检索速度快、聚焦最相关内容 | 结果可能同质化、重复             | 精准检索（如找特定知识点）、对多样性无要求         |
| MMR        | 结果多样化、避免重复、覆盖更全面     | 检索速度稍慢（需额外计算差异性） | 探索性检索（如了解某个主题的全貌）、需要多样化结果 |

引用来源：[LangChain MMR官方文档](https://python.langchain.com/docs/modules/data_connection/retrievers/mmr)。

# 9.7 更新、删除与增量索引

实际项目中，向量数据库中的数据并非一成不变——需要添加新文档（增量索引）、更新已有文档的内容/元数据、删除无效文档。本节讲解LangChain中向量数据库的更新、删除、增量索引操作，以Chroma和Pinecone为例（FAISS操作类似）。

## 9.7.1 增量索引（添加新文档）

增量索引是最常用的操作，即向已有的向量数据库中添加新的文本/向量，无需重新创建数据库，LangChain会自动将新向量加入索引。

### 代码示例（Chroma增量添加）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
# 加载已有的Chroma数据库
db = Chroma(embedding_function=embeddings, persist_directory="./chroma_db", collection_name="update_test")

# 初始添加一批文本
initial_texts = ["LangChain基础教程", "向量嵌入核心原理"]
db.add_texts(texts=initial_texts)
db.persist()
print(f"初始文档数量：{db._collection.count()}")  # 输出2

# 增量添加新文档（无需重新创建数据库）
new_texts = ["Chroma向量数据库使用", "Pinecone云服务配置"]
db.add_texts(texts=new_texts)
db.persist()
print(f"增量后文档数量：{db._collection.count()}")  # 输出4
```

## 9.7.2 更新文档（内容/元数据）

LangChain向量数据库的“更新”操作，本质是“删除旧文档 + 添加新文档”（大部分向量数据库不支持直接修改向量/元数据），核心是通过文档ID定位旧文档。

### 代码示例（更新文档内容和元数据）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(embedding_function=embeddings, persist_directory="./chroma_db", collection_name="update_test")

# 1. 添加带自定义ID的文档（便于后续更新/删除）
texts = ["旧文档：LangChain向量数据库集成"]
ids = ["doc1"]  # 自定义文档ID
metadatas = [{"version": "1.0"}]
db.add_texts(texts=texts, ids=ids, metadatas=metadatas)
db.persist()

# 2. 更新文档：删除旧文档，添加新文档（更新内容和元数据）
old_id = "doc1"
db.delete(ids=[old_id])  # 删除旧文档

# 添加新文档（新内容、新元数据，可复用旧ID）
new_text = "新文档：LangChain向量数据库集成（2024版）"
new_metadata = {"version": "2.0"}
db.add_texts(texts=[new_text], ids=[old_id], metadatas=[new_metadata])
db.persist()

# 验证更新结果
updated_docs = db.similarity_search("LangChain向量数据库集成", k=1)
print("更新后文档：")
print(f"内容：{updated_docs[0].page_content}")
print(f"元数据：{updated_docs[0].metadata}")
```

## 9.7.3 删除文档（按ID/条件删除）

删除操作支持两种方式：按文档ID删除（精准删除）、按元数据条件删除（批量删除），以下以Chroma为例。

### 代码示例

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(embedding_function=embeddings, persist_directory="./chroma_db", collection_name="delete_test")

# 添加带ID和元数据的文档
texts = ["文档1：LangChain", "文档2：Chroma", "文档3：FAISS", "文档4：Pinecone"]
ids = ["doc1", "doc2", "doc3", "doc4"]
metadatas = [
    {"category": "框架"},
    {"category": "向量数据库"},
    {"category": "向量数据库"},
    {"category": "向量数据库"}
]
db.add_texts(texts=texts, ids=ids, metadatas=metadatas)
db.persist()
print(f"删除前文档数量：{db._collection.count()}")  # 输出4

# 1. 按ID删除（精准删除）
db.delete(ids=["doc1"])
print(f"按ID删除后数量：{db._collection.count()}")  # 输出3

# 2. 按元数据条件删除（批量删除）
db.delete(filter={"category": "向量数据库"})
print(f"按条件删除后数量：{db._collection.count()}")  # 输出0
```

## 9.7.4 关键提醒

- 自定义ID：添加文档时建议指定自定义ID（ids参数），便于后续更新、删除；

- 持久化：更新/删除后必须调用 `db.persist()`（Chroma），否则修改不生效；

- Pinecone差异：Pinecone支持更灵活的更新操作（如直接更新元数据），用法类似，只需替换向量数据库初始化代码；

- 引用来源：[LangChain Chroma更新删除文档](https://python.langchain.com/docs/integrations/vectorstores/chroma#updating-and-deleting)。

# 9.8 【实战】构建可搜索的个人知识库

本节结合本章所有知识点，做一个完整实战：构建一个可搜索的个人知识库——加载本地文档（PDF/Markdown）、预处理文本、生成嵌入、存入Chroma向量数据库、实现相似性检索+元数据过滤+MMR检索，最终完成一个可直接使用的个人知识检索工具。

## 9.8.1 实战目标

- 加载本地个人文档（PDF、Markdown格式）；

- 文本预处理、分割（适配嵌入模型）；

- 添加元数据（文档类型、创建时间）；

- 生成嵌入并存入Chroma（持久化）；

- 实现三种检索方式：相似性检索、元数据过滤检索、MMR检索；

- 支持增量添加文档、删除无效文档。

## 9.8.2 实战准备

### 1. 安装依赖

```bash
pip install langchain chromadb sentence-transformers pypdf python-dotenv markdown
```

### 2. 准备文档

在本地创建`docs`文件夹，放入个人文档（支持PDF、Markdown格式），示例文档：

- `LangChain教程.pdf`（LangChain相关知识）；

- `Python基础.md`（Python编程知识）；

- `向量数据库笔记.txt`（Chroma、FAISS相关笔记）。

## 9.8.3 完整实战代码（可直接运行）

```python
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.document_loaders import PyPDFLoader, TextLoader, UnstructuredMarkdownLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
import os
from datetime import datetime

# ---------------------- 1. 初始化配置 ----------------------
# 文档文件夹路径
DOCS_DIR = "./docs"
# 向量数据库存储路径
VECTOR_DB_DIR = "./personal_knowledge_db"
# 嵌入模型（BGE轻量版，中文友好）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
# 文本分割器（避免长文本超出模型限制）
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,
    chunk_overlap=30
)

# ---------------------- 2. 加载并预处理文档 ----------------------
def load_documents(docs_dir):
    """加载指定文件夹下的所有文档（PDF、TXT、MD）"""
    documents = []
    # 遍历文件夹，加载不同格式的文档
    for filename in os.listdir(docs_dir):
        file_path = os.path.join(docs_dir, filename)
        # 加载PDF
        if filename.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
            docs = loader.load()
        # 加载Markdown
        elif filename.endswith(".md"):
            loader = UnstructuredMarkdownLoader(file_path)
            docs = loader.load()
        # 加载TXT
        elif filename.endswith(".txt"):
            loader = TextLoader(file_path)
            docs = loader.load()
        else:
            continue  # 跳过不支持的格式

        # 预处理文本（去除空白）
        for doc in docs:
            doc.page_content = doc.page_content.strip().replace("\n", " ").replace("  ", " ")
            # 添加元数据（文档类型、文件名、创建时间）
            doc.metadata = {
                "doc_type": filename.split(".")[-1],
                "filename": filename,
                "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

        # 分割文本
        split_docs = text_splitter.split_documents(docs)
        documents.extend(split_docs)

    return documents

# 加载文档
documents = load_documents(DOCS_DIR)
print(f"加载并分割后，共得到{len(documents)}个文本块")

# ---------------------- 3. 初始化向量数据库并添加文档 ----------------------
# 初始化Chroma（持久化模式）
db = Chroma(
    embedding_function=embeddings,
    persist_directory=VECTOR_DB_DIR,
    collection_name="personal_knowledge"
)

# 增量添加文档（避免重复添加，可多次运行）
db.add_documents(documents=documents)
db.persist()
print(f"向量数据库初始化完成，文档总数：{db._collection.count()}")

# ---------------------- 4. 三种检索方式实战 ----------------------
def search_knowledge(query, filter_condition=None, use_mmr=False):
    """
    个人知识库检索函数
    :param query: 检索查询语句
    :param filter_condition: 元数据过滤条件（可选）
    :param use_mmr: 是否使用MMR检索（默认不使用）
    :return: 检索结果
    """
    if use_mmr:
        # MMR检索（相似且多样化）
        results = db.max_marginal_relevance_search(
            query=query,
            k=3,
            filter=filter_condition,
            lambda_mult=0.5
        )
    else:
        # 相似性检索
        results = db.similarity_search(
            query=query,
            k=3,
            filter=filter_condition
        )

    # 格式化输出结果
    print(f"\n=== 检索结果（查询：{query}）===")
    for i, doc in enumerate(results):
        print(f"\n【结果{i+1}】")
        print(f"文本内容：{doc.page_content[:100]}...")
        print(f"元数据：{doc.metadata}")
    return results

# 测试1：基础相似性检索
search_knowledge("LangChain是什么？")

# 测试2：元数据过滤检索（只检索PDF格式的文档）
filter_condition = {"doc_type": "pdf"}
search_knowledge("LangChain是什么？", filter_condition=filter_condition)

# 测试3：MMR检索（避免同质化结果）
search_knowledge("向量数据库怎么用？", use_mmr=True)

# ---------------------- 5. 增量添加与删除文档 ----------------------
# 增量添加新文档（示例：添加一个新的TXT文档）
new_text = "个人知识库实战：使用LangChain+Chroma构建可搜索知识库，支持多种检索方式。"
new_metadata = {
    "doc_type": "txt",
    "filename": "新增笔记.txt",
    "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
}
db.add_texts(texts=[new_text], metadatas=[new_metadata])
db.persist()
print(f"\n增量添加后，文档总数：{db._collection.count()}")

# 删除无效文档（按文件名过滤）
db.delete(filter={"filename": "新增笔记.txt"})
db.persist()
print(f"删除后，文档总数：{db._collection.count()}")
```

## 9.8.4 实战结果说明

1. 文档加载：支持PDF、TXT、Markdown三种格式，自动预处理、分割文本，添加元数据；

2. 向量存储：使用Chroma持久化存储，可多次运行代码，增量添加文档，无需重新生成所有嵌入；

3. 检索功能：支持三种检索方式，可根据需求选择（精准检索用相似性搜索，探索性检索用MMR）；

4. 维护功能：支持按元数据条件删除文档，增量添加新文档，适合长期维护个人知识库。

## 9.8.5 实战拓展

- 支持更多文档格式：添加`Docx2txtLoader`加载Word文档，`WebBaseLoader`加载网页内容；

- 优化检索精度：替换为BGE-M3嵌入模型，提升中文语义理解能力；

- 搭建Web界面：结合Streamlit，搭建简单的Web检索界面，方便日常使用；

- 替换向量数据库：将Chroma替换为Pinecone，实现云端个人知识库，可多设备访问。

# 本章总结

本章围绕LangChain向量数据库集成展开，从选型、单数据库上手，到高级功能（元数据过滤、MMR检索、更新删除），最终通过实战构建了可搜索的个人知识库，关键要点：

- 选型核心：根据部署方式、数据规模、开发成本选择数据库（新手优先Chroma，生产优先Pinecone）；

- 核心操作：添加文档、相似性检索是基础，元数据过滤、MMR检索可提升检索精度和多样性；

- 实战重点：文本预处理+增量索引+持久化，是构建可维护知识库的关键；

- 拓展方向：结合Web界面、多格式文档加载、云端部署，可将个人知识库升级为实用工具。

下一章将讲解LangChain检索增强生成（RAG）的完整流程，结合本章的向量数据库，实现“检索+生成”的智能问答功能。
