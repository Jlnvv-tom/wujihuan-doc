# 第17章 减少模型幻觉 — 为LLM插上RAG的"记忆"之翼

你问大模型"我们公司去年的营收是多少"，它信誓旦旦地告诉你一个数字，还附带了详细的分析。你去核实，发现这个数字根本不存在——模型纯靠一张嘴在那儿编。你问它某个API的用法，它给你写了一段看起来完美无缺的代码，复制粘贴一跑，报错了——因为那个方法压根就不存在。你问它某个药物的副作用，它列了一份清单，每一条都有板有眼，你拿去和药品说明书对比，发现一半是模型自己发明的。这种事情，想必每个做过LLM（Large Language Model，大语言模型）应用开发的人都经历过。

这不是Bug，这是Feature——当然，是让你头疼的那个Feature。这就是模型幻觉，大模型时代最让人又爱又恨的问题。怕浪猫曾经在一个企业知识库项目里，亲眼看着一个没有做任何检索增强的LLM，把公司年报里的数据和张三李四的个人信息混在一起，生成了几段看起来极其专业但完全错误的"财务分析报告"。客户看完差点信了，还好有人去翻了原始文件。从那以后，怕浪猫就成了RAG（Retrieval-Augmented Generation，检索增强生成）的坚定拥趸。

我是怕浪猫，一个在LLM工程化泥潭里摸爬滚打了好几年的老兵。从最早手搓TF-IDF检索，到后来用FAISS做向量搜索，再到现在搭建端到端的RAG Pipeline，我经历了RAG技术栈的完整进化过程。今天这章，我们就来彻底搞懂RAG——从幻觉问题的根因分析，到RAG架构原理，再到手把手代码实现和优化实践，一步步给你的LLM装上一个可靠的"外挂记忆"。这是整个系列的第17章，前面我们搞定了模型微调和文本分类，现在该让模型学会"查资料再回答"了。

> LLM是一座宝藏，但如果你不给它地图，它就会自己画一张——画得像真的，但路线全是假的。

## 17.1 模型幻觉问题与RAG解决方案

### 17.1.1 幻觉问题深度分析

模型幻觉（Hallucination）是指大语言模型生成了看似合理但实际上不正确、无依据或完全虚构的内容。这个问题不是某个模型的缺陷，而是当前所有基于自回归生成的LLM的通病。要理解幻觉为什么会产生，得从模型的训练机制说起。

LLM的本质是一个概率预测机器——给定前面的Token（Token，模型处理文本的最小单位），预测下一个Token的概率分布。它做的事情是"根据上下文生成最可能的下一个词"，而不是"根据事实生成正确的下一个词"。这两者之间有本质区别。当模型遇到训练数据中没见过的知识时，它不会说"我不知道"，而是会根据语言模式生成一段"看起来像那么回事"的内容。因为它的优化目标是语言的流畅性和连贯性，而不是事实的准确性。这就像一个学生考试时遇到了不会的题，他不交白卷，而是根据题目的语境编了一个看起来合理的答案——有时候编得连老师都觉得有道理。

幻觉问题可以分为几种类型，怕浪猫根据实战经验做了如下分类：

| 幻觉类型 | 表现形式 | 根因 | 危害程度 |
|---------|---------|------|---------|
| 事实性幻觉 | 编造不存在的事实、数据、引用 | 训练数据中缺乏相关知识 | 高 |
| 一致性幻觉 | 同一问题不同时间给出矛盾答案 | 模型概率采样的随机性 | 中 |
| 指令幻觉 | 回答偏离用户指令，自行脑补任务 | 指令跟随能力不足 | 中 |
| 逻辑幻觉 | 推理过程看似合理但逻辑链断裂 | 模型缺乏严格推理能力 | 高 |
| 上下文幻觉 | 忽略或歪曲用户提供的上下文信息 | 长文本理解能力有限 | 中 |

举一个我实际遇到过的例子。有一次在做一个法律咨询场景的LLM应用，用户问"《民法典》第一千零三十二条的内容是什么"。模型非常自信地回答了一段关于隐私权的条文，措辞极其正式，格式也完全符合法条的样式。但拿真实的《民法典》一对比，发现内容是模型自己编的——真实的第一千零三十二条确实和隐私权相关，但具体条文内容和模型给出的完全不同。模型知道"第一千零三十二条"大概率和"隐私权"有关（因为训练数据里有相关语境），但它不知道具体条文内容，于是就自己"生成"了一段。更可怕的是，如果你不拿原文去对比，你根本看不出来这是编的——因为它的表述方式太像真法条了。

再来一个技术场景的例子。你问模型"Python的collections模块里有没有RingBuffer这个类"，模型会告诉你"有的，RingBuffer是collections模块中的一个类，用于实现环形缓冲区"，然后给你写一段使用示例代码。你复制代码一跑，ImportError——collections模块里根本没有RingBuffer。模型之所以这样回答，是因为它知道collections模块里有很多容器类，RingBuffer是一个合理的数据结构名称，所以它"猜"应该有这个类。这种幻觉特别危险，因为对于不熟悉该模块的开发者来说，模型的回答看起来完全可信。

> 幻觉不是模型在"撒谎"，而是它在"做梦"——梦境的逻辑看起来自洽，但和现实没有对应关系。

导致幻觉产生的核心原因有这么几个：

第一，训练数据的局限性。模型的训练数据虽然海量，但不可能覆盖所有知识，尤其是时效性强的新知识、企业内部的私有知识。模型的参数中存的是训练数据的统计模式，不是精确的知识条目。训练数据还有截止日期，模型不知道训练完成之后发生的事情。你问它2024年的新闻，它的训练数据如果只到2023年，它要么说不知道，要么就编一个——而LLM通常选择后者。

第二，解码策略的随机性。Temperature参数控制生成的随机程度，Temperature越高，模型越"放飞自我"。即使Temperature设为0，由于Top-K、Top-P等采样策略的存在，输出仍然可能有不确定性。而且有些模型在Temperature为0时也不是真正的贪心解码，底层实现可能有差异。

第三，缺乏外部知识验证机制。模型生成内容时没有任何"查证"步骤，它不知道自己说的对不对，也没有能力去验证。就像一个人闭卷考试，不会的题也只能靠猜，而且猜得极其自信。人类至少还有"我不确定"的感觉，但LLM没有这种元认知能力——它对所有回答的"自信程度"是一样的。

第四，训练数据的噪声和错误。模型从互联网上学习了大量内容，其中本身就包含错误信息、过时信息、互相矛盾的信息。模型不可能区分哪些是对的、哪些是错的，它只是学习了这些内容的统计分布。比如同一条新闻，不同媒体的报道角度和细节可能不同，模型学到了这些不同版本的混合体，回答时可能把多个版本的信息拼接在一起，产生一个不存在的"缝合"事实。

第五，对齐训练的副作用。为了让模型更"有用"，RLHF（RLHF，Reinforcement Learning from Human Feedback，基于人类反馈的强化学习）训练会让模型倾向于给出详细、完整的回答。但这个"完整性"偏好有时会适得其反——当模型其实不知道答案时，它也会努力凑一个完整的回答，而不是简短地说"我不知道"。这种对齐偏差在安全性和有用性之间制造了张力，模型宁可编造也不愿让用户失望。

### 17.1.2 RAG解决方案概述

既然模型不知道自己不知道什么，那最直接的办法就是——给它一本"开卷参考书"，让它先查再答。这就是RAG的核心思想。

RAG（Retrieval-Augmented Generation，检索增强生成）是一种将信息检索与文本生成结合的架构方案。它最早由Facebook AI Research在2020年提出，随后迅速成为LLM应用领域的主流架构之一。它的工作流程可以概括为三步：先从一个外部知识库中检索出和用户问题相关的文档片段，然后把这些片段拼接到Prompt（Prompt，提示词）中作为上下文，最后让LLM基于这个增强后的Prompt生成回答。

用一句话总结RAG的价值：它把LLM从"闭卷考试"变成了"开卷考试"。

人类在面对不熟悉的问题时，也会先翻资料再回答。医生看病时要查阅病历和医学文献，律师回答法律问题时要翻法条和案例，学生考试时（如果是开卷）也是先翻书找答案再组织语言。RAG让LLM具备了同样的能力——先查资料，再回答。

> 没有RAG的LLM是一个"博学但不可靠"的顾问，有了RAG的LLM是一个"会查资料再回答"的顾问——后者显然更值得信任。

RAG相比其他方案的优劣，怕浪猫做了一张对比：

| 方案 | 知识更新成本 | 实现难度 | 可解释性 | 实时性 | 部署成本 |
|------|------------|---------|---------|--------|---------|
| 纯LLM | 无法更新（需重新训练） | 低 | 无 | 无 | 低 |
| Fine-tuning | 高（需重新训练） | 高 | 弱 | 差 | 高 |
| RAG | 低（更新知识库即可） | 中 | 强（可追溯来源） | 好 | 中 |

可以看到RAG在知识更新成本和可解释性上有显著优势。企业知识库每周都可能更新，如果用Fine-tuning（Fine-tuning，微调），每更新一次就得重新训练一次模型，成本和时间都受不了。而RAG只需要把新文档加入知识库，下次检索就能用上。更重要的是，RAG可以告诉你"这个回答是基于哪几篇文档生成的"，这种可追溯性在企业场景中至关重要——如果回答出了问题，你可以追溯到具体的文档来源，排查是文档本身的问题还是检索的问题。

不过RAG也不是没有缺点。它增加了系统的复杂度——你需要维护一个知识库、一个向量数据库、一个Embedding服务，还要处理文档更新、索引重建等运维问题。检索阶段也会增加响应延迟，通常会增加几百毫秒到几秒不等。此外，RAG的效果高度依赖检索质量，如果检索不到正确的文档，RAG不仅帮不上忙，甚至可能误导模型——因为模型会信任检索到的内容，如果检索到的是不相关的文档，模型可能基于错误的信息生成回答，效果比不用RAG还差。所以RAG不是"加了就比没加强"，而是"加好了比没加强，加不好比没加还差"。

## 17.2 RAG工作原理

### 17.2.1 RAG架构全景

RAG的完整架构可以用一条流水线来描述，怕浪猫把它拆成五个核心环节：

```
用户问题 → 文档切分 → 向量化(Embedding) → 向量数据库存储
                                                    ↓
LLM生成回答 ← Prompt拼接(Context+Question) ← 相似度检索(Top-K)
```

整条链路分为两个阶段：建库阶段（Indexing）和查询阶段（Querying）。建库阶段把原始文档处理成可检索的向量索引，查询阶段把用户问题转化成向量、检索相关文档、拼接Prompt、调用LLM生成回答。

先说建库阶段。假设你有一批企业文档——PDF报告、Word文档、Markdown笔记、HTML网页等等。第一步是文档加载，把各种格式的文件提取成纯文本。第二步是文档切分（Chunking），因为整篇文档太长了，没法直接塞进Prompt，需要切成小段。第三步是向量化（Embedding），把每一段文本转成一个高维向量。第四步是把这些向量存入向量数据库，建立索引。建库阶段只需要做一次（或者文档更新时增量做），不需要每次查询都重来。

再说查询阶段。用户提了一个问题，系统先把问题也转成向量，然后在向量数据库里做相似度检索，找到最相关的Top-K个文档片段。把这些片段拼到Prompt里，加上用户的原始问题，一起发给LLM，LLM基于这些上下文生成最终回答。这个阶段每次查询都会执行，对延迟敏感。

两个阶段的核心纽带是Embedding模型——建库时用它把文档转向量，查询时用它把问题转向量。两者的向量在同一个向量空间中，所以可以计算相似度。这也是前面强调过的：Query Embedding模型和Document Embedding模型必须一致。

> RAG的精髓不在于"生成"，而在于"检索"——检索质量决定了RAG效果的上限，生成模型只是负责把这个上限发挥出来。

### 17.2.2 文档切分策略

文档切分是RAG流程中最容易被忽视、但对效果影响最大的环节。切得太粗，一个Chunk里混入多个主题，检索精度下降；切得太细，上下文不完整，模型理解不了全貌。怕浪猫见过太多团队花大量时间调Embedding模型、调LLM参数，却忽略了切分这个最基础的环节，最后效果不好还找不到原因。

常见的切分策略有几种：

固定长度切分（Fixed-size Chunking）是最简单的方式，按Token数量固定切分，比如每500个Token切一段，相邻段之间保留50个Token的重叠（Overlap）。重叠的作用是避免切分边界正好把一个完整语义截断。这种方式实现简单，但对结构化文档（如代码、表格）效果不好。比如一个函数被从中间切开，前半段在Chunk A，后半段在Chunk B，检索到Chunk A时模型看不到完整函数逻辑。

递归字符切分（Recursive Character Splitting）是LangChain默认的切分策略，它按照分隔符优先级递归切分：先按段落分隔符切，如果段落太长再按句子分隔符切，如果句子还是太长就按字符切。这种方式能较好地保留语义结构，因为段落和句子天然是语义单元。

语义切分（Semantic Chunking）是更高级的策略，它用Embedding模型计算相邻句子的语义相似度，在语义"断点"处切分。这种方式效果最好但计算成本最高，适合对检索质量要求极高的场景。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    separators=["\n\n", "\n", "。", "！", "？", "，", " "]
)
chunks = splitter.split_text(long_document)
print(f"切分结果: {len(chunks)} 个片段")
print(f"第一段长度: {len(chunks[0])} 字符")
```

这里有个实战踩坑经验怕浪猫必须分享。有一次做法律文书RAG，切分策略没调好，把一个法条的"但书"部分（"但是，xxx情形除外"）切到了下一个Chunk里。结果检索时只检索到了前半段，LLM生成回答时完全忽略了例外情形，给出了一个错误的结论。从那以后，我对结构化文档的切分策略格外小心——对于法条、合同条款这类有严格结构的内容，要按条目编号切分，而不是按固定长度切分。如果你在做代码RAG，就要按函数/类边界切分；如果你在做对话记录RAG，就要按对话轮次切分。

chunk_size的选择也是个技术活。太小（如100字符）会导致语义不完整，检索到了但LLM看不懂；太大（如2000字符）会导致一个Chunk里包含多个主题，检索精度下降。怕浪猫的经验是，中文文档chunk_size设300到500字符、overlap设10%到15%通常是比较好的起点。但这只是起点，最终参数需要根据实际检索效果来调。

> 切分是RAG的"基本功"——就像做菜的刀工，食材切得好不好，直接决定最后这道菜能不能吃。

### 17.2.3 Embedding模型选择

Embedding（嵌入）是把文本映射到高维向量空间的过程。Embedding模型的质量直接决定了检索的效果——如果模型把语义相近的文本映射到了向量空间中很远的位置，那检索就无从谈起。

选择Embedding模型时需要考虑几个关键指标：向量维度（影响存储和检索速度）、支持语言（中文/多语言）、最大输入长度（决定单个Chunk的上限）、在MTEB（MTEB，Massive Text Embedding Benchmark，大规模文本嵌入基准）排行榜上的表现。

怕浪猫整理了几个常用的Embedding模型对比：

| 模型名称 | 维度 | 最大输入 | 语言 | 特点 |
|---------|------|---------|------|------|
| text-embedding-ada-002 | 1536 | 8192 | 多语言 | OpenAI出品，效果好但收费 |
| bge-large-zh-v1.5 | 1024 | 512 | 中文 | 智源研究院出品，中文效果好 |
| m3e-large | 1024 | 512 | 中文 | 开源免费，社区使用广泛 |
| gte-large-zh | 1024 | 512 | 中文 | 阿里达摩院出品，效果稳定 |
| bge-m3 | 1024 | 8192 | 多语言 | 支持长文本，效果优秀 |

选择建议：如果你的场景以中文为主，bge-large-zh-v1.5和m3e-large都是很好的选择；如果需要支持多语言或长文本，bge-m3是目前最全能的开源选项；如果预算充足且不想自己部署，OpenAI的text-embedding-ada-002仍然是标杆。

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('BAAI/bge-large-zh-v1.5')
query_vector = model.encode(["合同违约的法律后果是什么？"])
doc_vectors = model.encode([
    "违约方应承担继续履行、采取补救措施或赔偿损失等违约责任",
    "当事人一方不履行合同义务或履行不符合约定的，应当承担违约责任"
])
print(f"向量维度: {query_vector.shape}")
```

这里有个坑要提醒大家。Embedding模型有个"指令前缀"的问题——部分模型（如bge系列）在编码Query时需要加特定前缀（如"为这个句子生成表示以用于检索相关文章："），而编码文档时不需要加。如果你不知道这个细节，不加前缀直接用，检索效果可能差10%到20%。怕浪猫当初就是在这一点上卡了好几天，怎么调参效果都不好，最后翻了模型的说明文档才发现是前缀没加。后来还遇到过一个更隐蔽的坑——模型升级版本后前缀变了，但旧代码还用着旧前缀，效果莫名下降。所以现在怕浪猫的习惯是，每次升级Embedding模型都要重新检查一遍前缀要求。

### 17.2.4 向量数据库对比

向量数据库是RAG系统的基础设施，负责存储文档向量并提供高效的相似度检索能力。选择合适的向量数据库需要考虑数据规模、查询延迟、部署方式、成本等多个因素。

FAISS（FAISS，Facebook AI Similarity Search）是Meta开源的向量检索库，严格来说它不是一个数据库，而是一个库。它提供了多种向量索引算法（如IVF、HNSW、PQ等），支持单机十亿级别的向量检索。优点是性能极高、不依赖外部服务，缺点是没有数据持久化管理、不支持增删改查的完整CRUD（CRUD，Create Read Update Delete，增删改查）操作。

Chroma是一个轻量级的向量数据库，专为AI应用开发设计。它内嵌了Embedding功能，API简洁易用，适合原型开发和中小规模场景。底层存储基于SQLite，部署零依赖。

Pinecone是一个全托管的云向量数据库服务，无需自己维护基础设施，支持水平扩展和实时更新。适合生产环境和对可用性要求高的场景，但需要付费使用。

| 向量数据库 | 部署方式 | 数据规模 | 增删改 | 适用场景 |
|-----------|---------|---------|--------|---------|
| FAISS | 本地库 | 十亿级 | 不支持 | 快速原型、海量数据 |
| Chroma | 嵌入式 | 百万级 | 支持 | 中小规模应用 |
| Pinecone | 云托管 | 十亿级 | 支持 | 生产环境、高可用 |
| Milvus | 分布式 | 十亿级 | 支持 | 大规模生产部署 |
| Qdrant | 独立服务 | 亿级 | 支持 | 高性能生产部署 |

怕浪猫在选型时的建议是：原型阶段用Chroma，零配置快速上手；数据量到百万级时考虑Qdrant，性能好且部署简单；数据量到亿级以上或者需要分布式部署时上Milvus；如果不想自己运维，Pinecone是最省心的选择。FAISS适合对性能有极致要求且不需要频繁更新数据的场景，比如离线批量检索。

> 向量数据库的选型就像选房子——原型阶段租个单间（Chroma）就够了，真正住进去一家人了再考虑买房（Milvus/Pinecone）。

## 17.3 RAG实现一：文档加载与向量化存储

### 17.3.1 文档加载

理论说够了，开始写代码。怕浪猫用Python从零搭建一个完整的RAG系统，从文档加载开始。

实际项目中，知识库的文档格式五花八门——PDF、Word、Markdown、HTML、TXT都有。LangChain提供了丰富的文档加载器，可以统一处理各种格式。

```python
from langchain.document_loaders import (
    TextLoader, PyPDFLoader, Docx2txtLoader, UnstructuredMarkdownLoader
)

# 加载不同格式的文档
pdf_docs = PyPDFLoader("report.pdf").load()
md_docs = UnstructuredMarkdownLoader("notes.md").load()
txt_docs = TextLoader("article.txt").load()

all_docs = pdf_docs + md_docs + txt_docs
print(f"共加载 {len(all_docs)} 个文档")
print(f"总字符数: {sum(len(d.page_content) for d in all_docs)}")
```

加载完成后每个文档对象包含两个属性：page_content是文本内容，metadata是元数据（如文件路径、页码等）。Metadata很重要，后面做溯源的时候会用到——当LLM的回答出问题时，你需要通过metadata追溯到原始文档定位问题。

这里有几个踩坑点怕浪猫要提前告知。第一，PDF加载特别容易出问题——扫描版PDF用PyPDFLoader提取出来全是乱码或空文本，因为扫描版的内容是图片不是文字。遇到这种情况需要先做OCR（OCR，Optical Character Recognition，光学字符识别）。怕浪猫推荐用unstructured库配合Tesseract OCR处理扫描版PDF，虽然速度慢但效果可靠。第二，Word文档中的表格和图片在加载时通常会丢失，如果表格信息很重要，需要用专门的表格提取工具预处理。第三，HTML文档中有很多导航栏、广告等噪声内容，加载前最好先做正文提取，怕浪猫常用trafilatura库来清洗HTML。

### 17.3.2 文档切分实现

加载完文档后，需要把长文档切成适合检索的小片段。前面讲了切分策略的理论，现在看代码实现。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    separators=["\n\n", "\n", "。", "！", "？", "，", " ", ""],
    length_function=len
)

chunks = text_splitter.split_documents(all_docs)
print(f"切分前: {len(all_docs)} 个文档")
print(f"切分后: {len(chunks)} 个片段")
print(f"平均长度: {sum(len(c.page_content) for c in chunks) // len(chunks)} 字符")
```

切分后每个Chunk保留了原始文档的metadata，这样检索到片段后可以追溯到来源文档。切分的chunk_size和chunk_overlap需要根据实际文档特点调参——怕浪猫的经验是，中文文档chunk_size设300到500字符、overlap设10%到15%通常是比较好的起点。但这只是起点，具体参数还要看检索效果来调。如果检索结果经常不相关，可能需要减小chunk_size；如果检索到了但LLM回答缺乏上下文，可能需要增大chunk_size或overlap。

### 17.3.3 Embedding向量化

接下来把文本片段转成向量。这里用HuggingFace的sentence-transformers库加载本地的Embedding模型，也可以换成OpenAI的API。

```python
from langchain.embeddings import HuggingFaceBgeEmbeddings

embeddings = HuggingFaceBgeEmbeddings(
    model_name="BAAI/bge-large-zh-v1.5",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True}
)

# 测试向量化
test_text = "合同违约的法律后果"
test_vector = embeddings.embed_query(test_text)
print(f"向量维度: {len(test_vector)}")
print(f"前5个维度值: {test_vector[:5]}")
```

normalize_embeddings设为True很关键，它把向量归一化到单位长度。这样后续做相似度检索时，内积就等于余弦相似度，计算更快。如果不归一化，向量的长度会影响相似度计算的结果，长向量天然会有更大的内积值，这并不是我们想要的。

向量化过程在数据量大时会比较慢。一万个文档片段用CPU做向量化大概需要几分钟，如果文档量更大建议用GPU加速。另外，向量化结果可以缓存到磁盘，避免每次启动都重新计算。

### 17.3.4 向量数据库存储

把所有Chunk向量化后存入向量数据库。这里以Chroma为例，它使用简单，适合演示和中小规模应用。

```python
from langchain.vectorstores import Chroma

# 构建向量数据库
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db"
)

# 持久化到磁盘
vectorstore.persist()
print(f"向量数据库已存储 {len(chunks)} 个片段到 ./chroma_db")
```

如果用FAISS，代码也差不多：

```python
from langchain.vectorstores import FAISS

vectorstore = FAISS.from_documents(
    documents=chunks,
    embedding=embeddings
)
vectorstore.save_local("./faiss_index")
print("FAISS索引已保存到 ./faiss_index")
```

两者的区别在于：Chroma会自动持久化到SQLite数据库，支持后续增删改查；FAISS保存的是索引文件，后续修改不方便，但检索速度更快。怕浪猫的建议是——开发阶段用Chroma方便调试，上线后如果数据量大且不需要频繁更新，换FAISS获得更好的性能。另外FAISS支持GPU加速检索，对于亿级向量场景，GPU版本的FAISS比CPU版本快一个数量级。

实际项目中，文档会不断更新，需要支持增量索引。Chroma支持通过add_documents方法增量添加新文档，FAISS支持通过merge_from方法合并索引。但要注意，如果Embedding模型换了，整个索引必须重建——不同模型生成的向量不在同一个空间里，不能混用。增量更新还有一个需要注意的点：删除旧文档时，要确保向量数据库中对应的向量也被正确删除，否则旧数据会污染检索结果。Chroma和Milvus这类支持完整CRUD的数据库在这方面比较方便，FAISS就不太好处理，通常需要重建整个索引。

> 建库阶段的工作看起来枯燥，但它决定了RAG系统的天花板。垃圾进，垃圾出——这句话在向量数据库里同样适用。

## 17.4 RAG实现二：检索增强与端到端Pipeline

### 17.4.1 相似度检索原理

建好了向量数据库，接下来是查询阶段的核心——相似度检索。常用的相似度计算方法有两种：余弦相似度和内积。

余弦相似度（Cosine Similarity）衡量两个向量之间的夹角余弦值，范围是[-1, 1]。值越接近1表示两个向量方向越一致，即语义越相似。它的优势是不受向量长度影响，只看方向。计算公式是两个向量的点积除以它们各自范数（L2 Norm）的乘积。

内积则更简单，直接计算两个向量的点积，不做归一化。如果向量已经归一化（长度为1），内积就等于余弦相似度。FAISS的IndexFlatIP就是基于内积的索引。

还有一种叫L2距离，也就是欧氏距离，它衡量两个向量在空间中的绝对距离。值越小表示越相似。FAISS的IndexFlatL2用的就是这个。L2距离和余弦相似度在向量归一化后是单调一致的，但数值含义不同——L2是距离（越小越好），余弦是相似度（越大越好）。

```python
import numpy as np

def cosine_similarity(vec1, vec2):
    """计算余弦相似度"""
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    return dot_product / (norm1 * norm2 + 1e-8)

def inner_product(vec1, vec2):
    """计算内积（向量归一化后等价于余弦相似度）"""
    return np.dot(vec1, vec2)

# 对比两种计算方式
v1 = np.array([1.0, 2.0, 3.0])
v2 = np.array([2.0, 4.0, 6.0])
print(f"余弦相似度: {cosine_similarity(v1, v2):.4f}")
print(f"内积: {inner_product(v1, v2):.4f}")
```

实际项目中，如果Embedding模型已经做了归一化（比如前面bge模型设了normalize_embeddings=True），用内积就够了，计算更快。如果没归一化，就用余弦相似度更准确。怕浪猫的建议是统一做归一化，然后统一用内积，这样计算链路最简单，也不容易出错。

### 17.4.2 Top-K检索

检索时我们不只是找一个最相似的文档片段，而是找最相似的K个——这就是Top-K检索。K的选择是个需要权衡的问题：K太小，可能漏掉相关信息；K太大，会引入噪声，还可能超出LLM的上下文窗口。

```python
# 使用Chroma进行Top-K检索
query = "合同违约需要承担什么责任？"
results = vectorstore.similarity_search_with_score(
    query=query,
    k=5
)

for i, (doc, score) in enumerate(results):
    print(f"--- 第{i+1}条 (相似度: {score:.4f}) ---")
    print(f"内容: {doc.page_content[:80]}...")
    print(f"来源: {doc.metadata.get('source', '未知')}")
```

similarity_search_with_score方法返回文档和对应的相似度分数。注意Chroma默认返回的是L2距离（欧氏距离），值越小越相似；如果需要余弦相似度，需要在创建向量数据库时指定距离度量方式。

K值的选择怕浪猫有一套经验法则：简单问答场景K=3到5，复杂分析场景K=8到12，长文摘要场景K=15到20。但这只是起点，具体值要看实际效果。一个判断方法是：如果增加K值后回答质量不再提升，说明已经到了信息饱和点；如果增加K值后回答质量反而下降，说明引入了噪声。

怕浪猫踩过的一个坑：有一次检索效果莫名其妙很差，排查了半天发现是Query的Embedding和文档的Embedding用了不同的模型。因为换了一次Embedding模型但没有重建向量数据库，导致Query向量和文档向量在不同的向量空间里比较——这就像拿苹果和橘子比大小，完全没有意义。记住一条铁律：Query Embedding模型和Document Embedding模型必须一致。如果换了模型，整个向量数据库必须重建。

> 检索是RAG的心脏——如果检索不到正确的文档，再强的LLM也只是在正确的道路上走偏了。

### 17.4.3 Context拼接与Prompt设计

检索到相关文档后，需要把它们拼接到Prompt中。Prompt的设计直接关系到LLM能否正确利用检索到的知识。

```python
def build_rag_prompt(query, retrieved_docs):
    """构建RAG增强Prompt"""
    context = "\n\n".join([
        f"[参考资料{i+1}] {doc.page_content}"
        for i, doc in enumerate(retrieved_docs)
    ])
    
    prompt = f"""你是一个专业的知识助手。请根据以下参考资料回答用户问题。

要求：
1. 只基于参考资料回答，不要编造信息
2. 如果参考资料中没有相关内容，请明确说明"根据现有资料无法回答"
3. 回答时注明参考了哪条资料

{context}

用户问题：{query}

回答："""
    return prompt

# 使用检索结果构建Prompt
retrieved_docs = [doc for doc, _ in results]
final_prompt = build_rag_prompt(query, retrieved_docs)
print(f"Prompt总长度: {len(final_prompt)} 字符")
```

Prompt设计有几个关键原则怕浪猫要强调：

第一，明确告诉模型"只基于参考资料回答"。这一条能大幅减少幻觉——虽然不能完全消除，但能约束模型不要天马行空。不加这条指令时，模型可能会把检索到的资料当作"参考"而非"唯一依据"，还是会在回答中混入自己训练数据中的内容，而这些内容可能是不准确的。

第二，要求模型在无法回答时明确说明。这比让模型编一个答案好得多。"我不知道"是一个完全合法且负责任的回答。在实际业务场景中，一个诚实的"无法回答"远比一个自信的胡编乱造有价值。

第三，要求模型标注引用来源。这不仅增加回答的可信度，也方便用户验证。在法律、医疗等高风险场景中，引用来源是必须的。

第四，控制Context的总长度。LLM的上下文窗口是有限的，即使支持128K的上下文，也不意味着塞越多越好。过多的Context会稀释关键信息，导致模型"注意力分散"。怕浪猫通常把Context控制在2000到3000字符以内，这是一个兼顾信息量和注意力的平衡点。

### 17.4.4 LLM生成增强回答

最后一步，把拼接好的Prompt发给LLM生成回答。

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="none")

response = client.chat.completions.create(
    model="qwen2.5:7b",
    messages=[{"role": "user", "content": final_prompt}],
    temperature=0.1,
    max_tokens=512
)

answer = response.choices[0].message.content
print("=== RAG回答 ===")
print(answer)
```

Temperature设为0.1是为了尽量降低生成的随机性——RAG场景下我们希望回答尽可能忠实于检索到的资料，不需要模型"发挥创意"。但也不建议设为0，因为完全贪心解码有时会导致回答生硬或重复，0.1是一个比较好的平衡点。

max_tokens设为512通常够用了，RAG回答不需要长篇大论。如果你的场景需要生成长回答（如报告生成），可以适当调大。但要注意，max_tokens越大，生成时间越长，延迟也越高。

### 17.4.5 端到端RAG Pipeline

把前面的步骤串起来，就是一个完整的RAG Pipeline。怕浪猫把它封装成一个类，方便复用。

```python
class RAGPipeline:
    def __init__(self, embedding_model, llm_client, vectorstore):
        self.embedding = embedding_model
        self.llm = llm_client
        self.store = vectorstore
    
    def retrieve(self, query, k=5):
        results = self.store.similarity_search_with_score(query, k=k)
        return [doc for doc, _ in results]
    
    def generate(self, query, docs):
        context = "\n\n".join([d.page_content for d in docs])
        prompt = f"根据以下资料回答问题。\n\n资料：{context}\n\n问题：{query}"
        resp = self.llm.chat.completions.create(
            model="qwen2.5:7b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        return resp.choices[0].message.content
    
    def query(self, question, k=5):
        docs = self.retrieve(question, k)
        answer = self.generate(question, docs)
        return {"answer": answer, "sources": docs}

# 一行调用，端到端RAG
rag = RAGPipeline(embeddings, client, vectorstore)
result = rag.query("合同违约的法律后果是什么？")
print(result["answer"])
```

这就是一个最小可用的RAG系统。总共不到30行核心代码，但它已经具备了RAG的所有核心能力：检索、增强、生成。当然，这只是一个起点——真正在生产环境中用起来，还需要大量的优化工作。但作为学习和原型验证，这个Pipeline已经够用了。怕浪猫建议读者先把这段代码跑起来，用一个真实的数据集测试效果，然后再逐步优化各个环节。不要一上来就追求完美，先跑通再优化是工程化的基本原则。

跑通之后，你可以尝试以下几个方向的迭代：换一个更好的Embedding模型看检索效果变化、调整chunk_size和overlap参数、修改Prompt模板中的指令、增加HyDE或重排序等高级检索策略。每次改动后都跑一遍评估数据集，记录指标变化，这样你能清楚地知道每个优化策略的实际效果。

> 端到端Pipeline的意义不在于"能跑"，而在于"跑得稳"。从Demo到生产，中间隔着无数次调优和踩坑。

## 17.5 RAG优化与最佳实践

### 17.5.1 文档切分策略优化

前面17.2.2节讲了基本的切分策略，这里深入讲讲怎么针对不同场景优化切分。

结构化文档切分是最常见的需求。对于Markdown文档，可以按标题层级切分，保证每个Chunk是一个完整的语义单元。对于代码文件，可以按函数或类切分。对于法律文书，可以按条文编号切分。

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter

# 按Markdown标题切分
md_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ]
)
md_chunks = md_splitter.split_text(md_text)
# 切分后每个Chunk的metadata会包含所属标题层级
print(md_chunks[0].metadata)
```

另一个优化方向是父子文档策略（Parent-Child Document Strategy）。思路是：切分时生成两层结构——父文档是大段落（如1000字符），子文档是小片段（如200字符）。检索时用子文档（粒度细、精度高），但返回给LLM的是子文档对应的父文档（上下文完整）。这样既保证了检索精度，又保证了上下文完整性。这个策略在实际项目中效果非常好，怕浪猫强烈推荐大家试试。

还有一个实用的技巧是元数据过滤。在切分时给每个Chunk打上元数据标签（如文档类型、章节、时间等），检索时可以先按元数据过滤再做向量检索。比如用户问"2024年的财报数据"，可以先过滤出2024年的文档，再做向量检索，避免检索到过时的数据。这在企业知识库场景中特别有用，因为企业文档通常有明确的分类和时间维度。

> 切分策略没有银弹——最好的策略是根据你的文档特点量身定制，而不是照搬别人的参数。

### 17.5.2 检索质量优化

基础RAG的检索质量往往不够理想，怕浪猫在实际项目中用过的几种优化方法：

HyDE（HyDE，Hypothetical Document Embeddings，假设文档嵌入）是一个巧妙的技巧。它的思路是：用户的问题通常很短，和文档片段在语义空间中可能距离较远。那不如先让LLM根据问题生成一个"假设的答案文档"，然后用这个假设文档去做向量检索——因为假设文档和真实文档在表达形式上更接近，检索效果会更好。

```python
def hyde_search(query, llm_client, vectorstore, k=5):
    """HyDE: 先生成假设文档，再检索"""
    hyde_prompt = f"请写一段200字以内的事实性文字回答这个问题：{query}"
    resp = llm_client.chat.completions.create(
        model="qwen2.5:7b",
        messages=[{"role": "user", "content": hyde_prompt}],
        temperature=0.3
    )
    hypothetical_doc = resp.choices[0].message.content
    # 用假设文档检索，而不是原始query
    results = vectorstore.similarity_search(hypothetical_doc, k=k)
    return results
```

多路检索（Multi-Query Retrieval）是另一种策略。让LLM把用户的问题改写成多个不同角度的子问题，分别检索后合并去重。这样能覆盖更多的相关文档，减少单一Query表达不足导致的漏检。比如用户问"怎么优化数据库性能"，LLM可以改写出"数据库索引优化策略"、"SQL查询优化方法"、"数据库连接池配置"等子问题，分别检索后合并结果。

重排序也是提升检索质量的有效手段。先用向量检索快速召回Top-20的候选文档，再用一个更精确（但更慢）的模型对这20个候选重新排序，取Top-5。常用的重排序模型有Cohere Rerank、bge-reranker等。这种"先粗筛再精选"的两阶段策略在工业界非常普遍，搜索引擎、推荐系统都在用。怕浪猫在一个项目中对比过加不加重排序的效果：检索准确率从72%提升到了89%，代价是每次查询多了大约200毫秒的延迟。对于大部分应用场景来说，这个延迟增加是完全值得的。

> 检索优化就像淘金——先粗筛出可能含金的沙子，再精细淘洗出真正的金子。

### 17.5.3 Prompt设计优化

17.4.3节给了一个基础的RAG Prompt模板，这里讲讲进阶的Prompt设计技巧。

思维链引导。在Prompt中加入"请先分析参考资料中的相关信息，然后逐步推理出答案"这样的指令，让模型先分析再回答，而不是直接给结论。这种方式能显著提高回答的逻辑性和准确性，尤其是在需要多步推理的复杂问题上。

```python
advanced_prompt = f"""你是一个严谨的知识助手。请按以下步骤回答问题：

步骤1：逐一阅读参考资料，判断哪些与问题相关
步骤2：从相关资料中提取关键信息
步骤3：基于提取的信息组织回答
步骤4：如果资料不足以回答，明确说明缺少什么信息

参考资料：
{context}

问题：{query}

请按步骤分析后给出最终回答："""
```

冲突处理指令。当多个检索到的文档片段信息矛盾时（比如2022年的文档说"营收10亿"，2023年的文档说"营收15亿"），需要在Prompt中告诉模型如何处理冲突。通常的做法是优先采用更新的文档，并在回答中说明差异。这需要在切分阶段就把文档的时间信息存入metadata，在Prompt中告诉模型每条资料的时间。

拒答机制。明确告诉模型什么情况下应该拒答。比如"如果参考资料中没有直接回答该问题的内容，请回复：根据现有资料无法回答该问题。"这条指令看似简单，但能有效阻止模型"脑补"。怕浪猫测试过，加了拒答指令后，模型编造内容的比例能下降60%以上。

### 17.5.4 RAG vs Fine-tuning选择

这是被问得最多的问题之一：什么时候用RAG，什么时候用Fine-tuning？怕浪猫的决策框架如下：

| 维度 | RAG更合适 | Fine-tuning更合适 |
|------|----------|------------------|
| 知识类型 | 事实性知识（文档、数据） | 能力型知识（风格、格式） |
| 更新频率 | 频繁更新 | 很少变化 |
| 数据量 | 中小规模（几十到几万文档） | 大规模标注数据 |
| 可解释性 | 需要溯源 | 不需要溯源 |
| 延迟要求 | 可接受稍高延迟 | 要求低延迟 |
| 成本 | 基础设施成本低 | 训练成本高 |

简单来说：如果你要让模型"知道"一些新东西，用RAG；如果你要让模型"会做"一些新事情，用Fine-tuning。比如让模型知道公司最新的人事政策，用RAG；让模型学会用特定风格写公文，用Fine-tuning。让模型知道最新的产品规格，用RAG；让模型学会从非结构化文本中提取结构化字段，用Fine-tuning。

两者也不是互斥的。怕浪猫在不少项目里同时使用了RAG和Fine-tuning——先Fine-tune让模型掌握领域知识和回答风格，再用RAG提供实时事实性知识。这种组合方案的效果通常比单独使用任何一个都好。Fine-tuning让模型"知道怎么回答"，RAG让模型"知道回答什么"，两者互补。

> RAG给模型加"外挂硬盘"，Fine-tuning给模型升"内存条"——前者扩容知识，后者提升能力，各有所长。

### 17.5.5 RAG评估指标

最后说说怎么评估RAG系统的效果。光凭主观感觉说"感觉回答得不错"是不够的，需要有量化的评估指标。

RAG的评估可以从三个维度来看：

检索质量评估。用召回率（Recall）和精确率（Precision）来衡量——召回率是检索到的相关文档占所有相关文档的比例，精确率是检索到的文档中相关文档的比例。需要有标注数据，即对于每个Query，人工标注哪些文档片段是相关的。MRR（MRR，Mean Reciprocal Rank，平均倒数排名）也是一个常用指标，衡量相关文档在检索结果中的排名位置。

生成质量评估。可以用三个指标：忠实度（Faithfulness，回答是否忠实于检索到的资料）、相关性（Relevance，回答是否和问题相关）、完整性（Completeness，回答是否涵盖了所有应有要点）。RAGAS（RAGAS，RAG Assessment，RAG评估框架）是一个常用的自动化评估工具，它用LLM来评估LLM的回答质量。

端到端评估。最终还是要看业务指标——用户满意度、问题解决率、人工干预率等。这些指标需要通过A/B测试或用户反馈收集。

```python
# RAGAS评估示例（伪代码展示核心逻辑）
from ragas import evaluate
from ragas.metrics import (
    faithfulness, answer_relevancy, context_precision
)

# 准备评估数据
eval_data = {
    "question": ["合同违约的法律后果？"],
    "answer": [generated_answer],
    "contexts": [[doc.page_content for doc in retrieved_docs]],
    "ground_truth": ["违约方需承担继续履行、补救或赔偿等责任"]
}

# 运行评估
scores = evaluate(eval_data, metrics=[faithfulness, answer_relevancy, context_precision])
print(f"忠实度: {scores['faithfulness']:.2f}")
print(f"回答相关性: {scores['answer_relevancy']:.2f}")
print(f"上下文精确率: {scores['context_precision']:.2f}")
```

怕浪猫建议在项目初期就建立评估数据集和评估流程，而不是等系统开发完了才开始评估。有了量化指标，你才能知道每次优化到底有没有效果，效果有多大。否则就是"感觉好了一点"，但说不清楚是真好还是心理作用。评估数据集不需要一开始就很大，20到50个典型问题加标注就够用来做初步评估了。随着系统迭代，逐步扩充评估数据集的规模和覆盖面。另外建议把评估流程自动化——每次修改参数或策略后自动跑一遍评估，生成对比报告，这样能快速发现回归问题。

## 章节小结

这一章我们从幻觉问题的根因出发，完整走过了RAG的技术全链路。从文档加载、切分、向量化，到相似度检索、Prompt拼接、LLM生成，再到各种优化策略和评估方法——RAG的每一个环节都有值得深入打磨的空间。

怕浪猫最后再强调几点核心认知：

第一，RAG不是万能药。它能大幅减少事实性幻觉，但不能完全消除所有幻觉。模型仍然可能误解检索到的内容、忽略关键信息、或者在多个矛盾来源之间做出错误选择。你需要通过Prompt设计、拒答机制、后处理校验等多层手段来进一步控制幻觉。

第二，检索质量是RAG的天花板。生成模型再强，如果检索不到正确的文档，回答也一定是错的。在检索优化上投入的每一分精力，都会在最终效果上得到回报。这也是为什么这章花了大量篇幅讲切分策略、检索优化、重排序等内容。

第三，RAG是一个系统工程。不是调一个参数就能搞定的，需要从文档处理、Embedding模型选择、向量数据库选型、检索策略、Prompt设计等多个维度协同优化。任何一个环节的短板都会拖累整体效果。怕浪猫的建议是先用最简单的Pipeline跑通，然后根据评估指标找到瓶颈环节，逐个优化。

第四，评估先行。没有量化指标就没有优化方向。先建评估数据集、定义评估指标、搭评估流程，然后再做优化。这个顺序不能反——先优化再评估等于盲人摸象。

> RAG的本质是给LLM装上了一面"照妖镜"——让它能照见自己的知识盲区，学会说"我不知道"，而不是蒙着眼睛瞎编。

怕浪猫说：做RAG项目就像盖房子——地基（文档切分）不牢，房子盖得再漂亮也会塌；管道（检索链路）不通，装修（Prompt设计）再精致也是白搭。先把基本功练扎实，再追求花活儿，这才是工程化的正道。RAG这个东西，说难不难，几十行代码就能跑起来；说简单也不简单，要调到生产可用的效果，需要反复打磨每一个环节。怕浪猫见过太多团队在Demo阶段觉得RAG不过如此，到了生产环境才发现问题一大堆——切分不准、检索不精、Prompt不约束、评估没指标。希望这章内容能帮你少走一些弯路。

下章预告：第18章 Agent与MCP——我们将聊聊MCP（MCP，Model Context Protocol，模型上下文协议）和Agent，看看怎么让LLM从"会回答问题"进化到"会干活"——不只是查资料，还能调用工具、执行任务、自主决策。如果说RAG是给LLM装了"记忆"，那Agent就是给LLM装了"双手"。这才是LLM应用最让人兴奋的方向。

系列进度 17/19

怕浪猫说：下章见，各位驯猫人。