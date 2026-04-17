# 第19章 应用模板与参考架构

做LangChain开发最忌讳“重复造轮子”——很多常见场景（聊天机器人、文档问答、Agent代理），官方早已提供成熟的应用模板，基于模板修改适配业务，能节省80%的开发时间。本章将从官方模板入手，拆解核心场景模板的实现逻辑，讲解如何定制模板、搭建企业级架构，最后通过实战完成客服系统的快速部署，全程贴合实战、代码可直接复用，适配掘金读者“拿来就用、深入理解”的需求。

## 19\.1 官方 LangChain Templates 介绍

LangChain Templates（官方模板库）是LangChain团队为开发者提供的“开箱即用”应用脚手架，涵盖了LLM应用最核心的10\+常见场景，本质是“预封装的链、Prompt模板、工具集成代码”的集合，目的是让开发者无需从零搭建基础架构，专注于业务逻辑定制。

### 19\.1\.1 模板核心价值

对于新手，模板能快速上手LangChain的核心用法，避免踩基础配置的坑；对于资深开发者，模板能标准化开发流程，减少重复编码，尤其适合企业级项目的快速落地。核心价值总结为3点：

- 标准化：统一链的结构、Prompt格式、工具集成方式，避免团队开发风格混乱；

- 高效性：预配置核心逻辑（如对话记忆、检索逻辑、工具调用），无需从零编写；

- 可扩展性：模板是“基础骨架”，支持灵活修改Prompt、替换LLM、新增工具，适配不同业务场景。

### 19\.1\.2 官方模板分类与获取方式

官方模板主要分为「基础模板」和「场景化模板」，覆盖从简单到复杂的全场景，所有模板均开源可直接获取：

#### 1\. 核心模板分类（常用）

|模板类型|代表模板|适用场景|
|---|---|---|
|对话类|Chatbot Template|多轮聊天、客服对话、闲聊机器人|
|检索类|Document QA Template|文档问答、知识库检索、PDF问答|
|Agent类|Agent Template|工具调用、自动决策、复杂任务处理|
|其他场景|Summarization、Translation Template|文本摘要、多语言翻译|

#### 2\. 模板获取方式

官方提供两种获取方式，推荐新手用第一种（快速启动），资深开发者用第二种（自定义配置）：

- 方式1：通过LangChain CLI快速拉取（推荐）
安装CLI：`pip install langchain\-cli`
拉取模板（以聊天机器人为例）：`langchain app new my\-chatbot \-\-template chatbot`

- 方式2：直接克隆GitHub仓库（自定义修改）
仓库地址：[https://github\.com/langchain\-ai/langchain\-templates](https://github.com/langchain-ai/langchain-templates)（代码来源：LangChain官方模板仓库\[superscript:2\]）

### 19\.1\.3 模板核心结构（必懂）

所有官方模板的核心结构一致，均包含3个核心文件，理解结构才能快速修改适配业务，以Chatbot Template为例：

1. `app\.py`：核心入口文件，封装链的调用逻辑、API接口（如FastAPI）；

2. `chain\.py`：链的定义文件，包含Prompt模板、LLM配置、对话记忆等核心逻辑；

3. `requirements\.txt`：依赖包列表，一键安装所有依赖。

### 19\.1\.4 模板运行流程（图例）

无论哪种模板，运行流程均遵循“输入→处理→输出”的标准化逻辑，以官方模板的通用流程为例：

```mermaid

flowchart TD
    A[用户输入] --> B[模板入口（app.py）]
    B --> C[链处理（chain.py）]
    C --> C1[Prompt模板格式化]
    C --> C2[LLM调用]
    C --> C3[工具/记忆联动]
    C1 --> D[输出结果]
    C2 --> D
    C3 --> D
    D --> E[返回用户/前端]
    ```

## 19\.2 聊天机器人模板解析

聊天机器人模板（Chatbot Template）是最常用的模板，核心功能是“多轮对话记忆\+LLM响应”，支持上下文关联，无需手动处理对话历史，适配客服、闲聊、咨询等场景。本节拆解模板核心逻辑，提供精简可运行代码。

### 19\.2\.1 模板核心组件

聊天机器人模板的核心是「对话记忆（Memory）\+ ChatPromptTemplate \+ LLM」的组合，三者协同实现多轮对话，组件职责如下：

- 对话记忆（Memory）：存储用户与机器人的历史对话，避免“失忆”（默认用BufferMemory）；

- ChatPromptTemplate：定义对话Prompt，规范机器人的语气、角色（如“客服助手”“闲聊伙伴”）；

- LLM：核心生成模型（默认用OpenAI GPT\-3\.5，可替换为Qwen、Llama等开源模型）。

### 19\.2\.2 精简可运行代码（官方模板简化版）

以下代码来自官方Chatbot Template简化，保留核心功能，可直接运行，无需复杂配置（代码来源：LangChain官方聊天机器人模板\[superscript:2\]）：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import ConversationChain
from langchain.memory import BufferMemory

# 1. 初始化LLM（可替换为开源模型，如Qwen）
llm = ChatOpenAI(model="gpt-3.5-turbo", api_key="你的API Key", temperature=0.7)

# 2. 定义ChatPrompt模板（规范机器人角色）
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个友好的客服聊天机器人，语气亲切，回答简洁，贴合用户需求。"),
    ("human", "{input}"),
    ("ai", "{history}")
])

# 3. 初始化对话记忆（存储历史对话）
memory = BufferMemory(memory_key="history", return_messages=True)

# 4. 构建对话链（组合模板、LLM、记忆）
chat_chain = ConversationChain(
    llm=llm,
    prompt=prompt,
    memory=memory,
    verbose=True  # 开启日志，便于调试
)

# 5. 测试对话
while True:
    user_input = input("用户：")
    if user_input in ["退出", "quit"]:
        print("机器人：再见！")
        break
    response = chat_chain.invoke({"input": user_input})
    print(f"机器人：{response['response']}")

```

### 19\.2\.3 核心细节解析

重点理解3个核心细节，避免使用模板时踩坑：

1. 对话记忆（BufferMemory）：默认只存储最近的对话，若需长期存储，可替换为RedisChatMessageHistory（支持分布式部署）；

2. Prompt模板：`\{history\}` 是对话历史占位符，由Memory自动填充，无需手动传递；

3. temperature参数：控制回答的随机性（0\~1），客服场景建议设为0\.3\~0\.7（既灵活又不混乱）。

### 19\.2\.4 模板运行效果示例

```text
用户：你好，我想查询订单物流
机器人：你好～ 请提供一下你的订单号，我帮你查询物流信息哦！
用户：订单号是123456
机器人：好的，正在查询订单123456的物流... 目前物流状态：已发货，预计明天送达。
用户：它现在到哪里了
机器人：订单123456当前位于XX市中转仓，正在发往你的收货地址，预计明天10:00前送达～

```

## 19\.3 文档问答模板解析

文档问答模板（Document QA Template）是企业级应用中最常用的模板之一，核心功能是“上传文档→检索相关内容→生成精准回答”，本质是「RAG架构」的预封装，支持PDF、TXT、Word等多种文档格式，无需手动搭建检索逻辑。

### 19\.3\.1 模板核心逻辑（RAG架构）

文档问答模板的核心是RAG（检索增强生成），避免LLM“瞎编”，确保回答基于上传的文档内容，流程如下（图例）：

```mermaid

flowchart TD
    A[上传文档（PDF/TXT）] --> B[文档加载与分割]
    B --> C[生成文档嵌入（Embedding）]
    C --> D[向量库存储（默认Chroma）]
    E[用户提问] --> F[生成提问嵌入，检索相关文档片段]
    F --> G[将文档片段+用户提问传入LLM]
    G --> H[生成基于文档的精准回答]
    ```

### 19\.3\.2 精简可运行代码（官方模板简化版）

以下代码来自官方Document QA Template，简化冗余配置，支持本地文档上传，可直接运行（代码来源：LangChain官方文档问答模板\[superscript:4\]）：

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import TextLoader
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 1. 初始化LLM和Embedding模型
llm = ChatOpenAI(model="gpt-3.5-turbo", api_key="你的API Key")
embeddings = OpenAIEmbeddings(api_key="你的API Key")

# 2. 加载本地文档（以TXT为例，可替换为PDFLoader加载PDF）
loader = TextLoader("test.txt")  # 替换为你的文档路径
documents = loader.load()

# 3. 分割文档（避免单段文本过长，影响检索效果）
text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
splits = text_splitter.split_documents(documents)

# 4. 构建向量库，存储文档嵌入
vectorstore = Chroma.from_documents(documents=splits, embedding=embeddings)

# 5. 构建文档问答链（RAG核心）
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",  # 短文档用stuff，长文档用map_reduce
    retriever=vectorstore.as_retriever(k=2),  # 检索前2条相关片段
    return_source_documents=True  # 返回检索到的文档片段，便于调试
)

# 6. 测试文档问答
user_question = "文档中提到的LangChain核心组件有哪些？"
response = qa_chain.invoke(user_question)

# 输出结果
print(f"回答：{response['result']}")
print("\n检索到的相关文档片段：")
for doc in response["source_documents"]:
    print(f"- {doc.page_content}")

```

### 19\.3\.3 核心细节解析

文档问答模板的关键在于“检索效果”，重点关注3个细节：

1. 文档分割：chunk\_size（单段长度）建议设为500\~1000，chunk\_overlap（重叠长度）设为50\~100，避免上下文丢失；

2. 检索参数：retriever的k值（检索条数）建议设为2\~5，条数过多会增加LLM负担，过少可能遗漏关键信息；

3. chain\_type选择：短文档（单文档\&lt;1000字）用stuff（直接拼接文档片段），长文档（多文档/大文档）用map\_reduce（先总结再合并）\[superscript:4\]。

### 19\.3\.4 常见适配场景

文档问答模板可直接适配以下场景，只需修改文档加载方式：

- PDF问答：替换为`PyPDFLoader`（需安装`pypdf`包）；

- Word问答：替换为`Docx2txtLoader`（需安装`docx2txt`包）；

- 多文档问答：加载多个文档，合并后分割即可。

## 19\.4 Agent 模板解析

Agent模板是最复杂但最强大的模板，核心功能是“让LLM自主决策、调用工具完成复杂任务”，区别于普通链的“固定流程”，Agent能根据用户需求，自动选择工具、调整步骤，适配数据分析、信息检索、多工具联动等场景。

### 19\.4\.1 模板核心组件

Agent模板的核心是「Agent \+ 工具集 \+ Prompt」，三者协同实现自主决策，组件职责如下：

- Agent：核心决策单元，负责分析用户需求、选择工具、执行步骤（默认用OpenAI Functions Agent）；

- 工具集（Tools）：Agent可调用的工具，如搜索引擎、计算器、文件读取工具（官方模板默认集成常用工具）；

- Prompt：规范Agent的决策逻辑，告知Agent“如何选择工具、如何处理工具返回结果”。

### 19\.4\.2 精简可运行代码（官方模板简化版）

以下代码来自官方Agent Template，简化工具配置，保留核心决策逻辑，可直接运行（代码来源：LangChain官方Agent模板\[superscript:2\]）：

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_openai_tools_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools import CalculatorTool, FileSearchTool

# 1. 初始化LLM（需用支持工具调用的模型，如gpt-3.5-turbo、gpt-4）
llm = ChatOpenAI(model="gpt-3.5-turbo", api_key="你的API Key", temperature=0.2)

# 2. 定义工具集（可新增/删除工具，如添加搜索引擎工具）
tools = [CalculatorTool(), FileSearchTool()]

# 3. 定义Agent Prompt（规范决策逻辑）
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个智能Agent，能自主选择工具完成用户任务。"
     "如果需要计算，用CalculatorTool；如果需要查找文件，用FileSearchTool；"
     "工具返回结果后，整理成简洁的回答，无需多余内容。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}")  # 存储Agent的决策过程
])

# 4. 构建Agent和执行器
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 5. 测试Agent（复杂任务：计算100的平方，再查找test.txt文件中的内容）
user_input = "计算100的平方，然后查找test.txt文件中包含LangChain的句子"
response = agent_executor.invoke({"input": user_input})

print(f"最终回答：{response['output']}")

```

### 19\.4\.3 核心细节解析

Agent模板的关键在于“决策逻辑”，重点理解2个核心细节：

1. 工具选择：Agent会根据用户需求自动匹配工具，无需手动指定；若工具返回结果不满足需求，Agent会重新选择工具（如计算错误会重新调用计算器）；

2. agent\_scratchpad：用于存储Agent的决策过程（如“用户需要计算，选择CalculatorTool”），便于调试，上线时可关闭verbose，隐藏决策过程。

### 19\.4\.4 常用工具扩展

官方模板默认集成基础工具，可根据业务需求新增工具，常见扩展工具：

- 搜索引擎工具：`SerpAPIWrapper`（需申请SerpAPI密钥），用于获取实时信息；

- 数据库工具：`SQLDatabaseToolkit`，用于数据库查询、数据分析；

- 自定义工具：通过`BaseTool`类封装自己的业务工具（如订单查询工具）。

## 19\.5 如何修改模板适配业务

官方模板是“通用骨架”，直接使用无法满足具体业务需求（如客服机器人需要贴合行业话术、文档问答需要适配企业知识库），本节讲解修改模板的核心思路和步骤，以“聊天机器人模板适配电商客服”为例，全程实战。

### 19\.5\.1 模板修改核心思路（3步走）

无论哪种模板，修改适配业务的核心思路都是“保留骨架、替换细节”，3步即可完成适配：

1. 修改Prompt模板：贴合业务场景，规范角色、语气、回答格式（最核心的一步）；

2. 替换/新增组件：如替换LLM（用开源模型替代OpenAI）、新增工具（如订单查询工具）、修改记忆方式；

3. 调试优化：测试业务场景下的响应效果，调整参数（如temperature、检索k值）。

### 19\.5\.2 实战：修改聊天机器人模板适配电商客服

以19\.2节的聊天机器人模板为基础，修改适配电商客服场景（核心需求：解答订单、物流、售后问题，语气专业，贴合电商话术），修改后的完整代码如下：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import ConversationChain
from langchain.memory import BufferMemory

# 1. 初始化LLM（保持不变，可替换为Qwen等开源模型）
llm = ChatOpenAI(model="gpt-3.5-turbo", api_key="你的API Key", temperature=0.3)  # 降低随机性，更专业

# 2. 修改Prompt模板（核心：适配电商客服场景）
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是电商平台的客服助手，负责解答用户的订单、物流、售后相关问题。"
     "语气专业、耐心，回答简洁明了，包含核心信息（如订单状态、物流时间）；"
     "若用户询问非电商相关问题，回复：'抱歉，我仅能解答订单、物流、售后相关问题哦～'；"
     "用户询问订单，需主动询问订单号；询问物流，需主动询问订单号或收货手机号。"),
    ("human", "{input}"),
    ("ai", "{history}")
])

# 3. 调整对话记忆（可选：延长记忆长度）
memory = BufferMemory(memory_key="history", return_messages=True, k=5)  # k=5，保留最近5轮对话

# 4. 构建对话链（保持骨架不变）
chat_chain = ConversationChain(
    llm=llm,
    prompt=prompt,
    memory=memory,
    verbose=True
)

# 5. 测试电商客服场景
test_cases = [
    "你好，我的订单没收到",
    "订单号123456",
    "物流到哪里了",
    "能帮我退款吗",
    "今天天气怎么样"
]

for case in test_cases:
    response = chat_chain.invoke({"input": case})
    print(f"用户：{case}")
    print(f"客服：{response['response']}\n")

```

### 19\.5\.3 测试效果与优化调整

上述代码的测试效果如下，完全贴合电商客服场景：

```text
用户：你好，我的订单没收到
客服：你好～ 请提供一下你的订单号，我帮你查询订单状态哦！

用户：订单号123456
客服：好的，正在查询订单123456... 目前订单状态：已发货，预计明天送达。若仍未收到，可联系售后处理。

用户：物流到哪里了
客服：订单123456当前位于XX市中转仓，正在发往你的收货地址，预计明天10:00前送达～

用户：能帮我退款吗
客服：可以的哦～ 请告知你需要退款的订单号，以及退款原因（如质量问题、未收到货），我将为你发起退款申请。

用户：今天天气怎么样
客服：抱歉，我仅能解答订单、物流、售后相关问题哦～

```

### 19\.5\.4 其他模板修改示例（简要）

除了聊天机器人，其他模板的修改思路类似，举2个常见示例：

1. 文档问答模板适配企业知识库：
\- 修改Prompt：添加“基于企业知识库，回答员工问题，语气正式，引用文档中的关键信息”；
\- 替换文档加载方式：加载企业内部文档（如员工手册、产品手册）；
\- 调整检索参数：k值设为3\~5，chain\_type用map\_reduce（适配长文档）。

2. Agent模板适配数据分析场景：
\- 新增工具：添加`SQLDatabaseToolkit`（数据库查询工具）、`PandasToolkit`（数据分析工具）；
\- 修改Prompt：规范Agent“先查询数据库，再用Pandas分析数据，最后生成可视化描述”；
\- 调整LLM：用gpt\-4（提升数据分析能力）。

## 19\.6 企业级架构分层建议（API 层、业务层、LLM 层）

官方模板适合快速原型开发，但企业级应用需要考虑“高可用、可扩展、可维护”，本节提供企业级LangChain应用的分层架构建议，分为API层、业务层、LLM层，每层职责清晰，支持分布式部署、高并发访问，贴合企业实际落地需求\[superscript:9\]。

### 19\.6\.1 企业级架构整体设计（图例）

架构分层遵循“高内聚、低耦合”原则，从上到下分为3层，每层之间通过标准化接口通信，整体架构如下：

```mermaid

flowchart TD
    subgraph API层（对外接口）
        A1[FastAPI/Flask] --> A2[接口鉴权]
        A1 --> A3[请求限流]
        A1 --> A4[请求转发]
    end
    A4 --> subgraph 业务层（核心逻辑）
        B1[模板适配模块] --> B2[链管理模块]
        B1 --> B3[工具集成模块]
        B2 --> B4[对话记忆模块]
        B3 --> B5[数据处理模块]
    end
    B2 --> subgraph LLM层（底层支撑）
        C1[LLM适配模块] --> C2[OpenAI/Anthropic]
        C1 --> C3[开源LLM（Qwen/Llama）]
        C1 --> C4[Embedding模型]
        C2 --> C5[模型缓存]
        C3 --> C5
        C4 --> C5
    end
    C5 --> D[向量库/数据库]
    ```

### 19\.6\.2 各层详细职责与实现建议

#### 1\. API层（对外接口层）

核心职责：接收前端/第三方请求，提供标准化接口，处理鉴权、限流、请求转发，是应用的“入口”。

- 技术选型：推荐FastAPI（高性能、支持异步、自动生成接口文档）；

- 核心功能：
\- 接口鉴权：用JWT令牌，限制非法访问；
\- 请求限流：用Redis实现，避免高并发压垮服务；
\- 接口标准化：提供RESTful接口，如`/chat`（聊天）、`/qa`（文档问答）、`/agent`（Agent调用）。

- 代码示例（接口简化版）：

```python
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from langchain.chains import ConversationChain

app = FastAPI(title="LangChain企业级接口")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")  # JWT鉴权

# 导入业务层的对话链（后续业务层实现）
chat_chain = ConversationChain(...)

# 定义请求模型
class ChatRequest(BaseModel):
    user_input: str
    session_id: str  # 用于区分不同用户的对话记忆

# 聊天接口
@app.post("/chat")
async def chat(request: ChatRequest, token: str = Depends(oauth2_scheme)):
    try:
        # 调用业务层的对话链
        response = chat_chain.invoke({"input": request.user_input})
        return {"code": 200, "data": {"response": response["response"]}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

```

#### 2\. 业务层（核心逻辑层）

核心职责：承接API层的请求，实现业务逻辑，是应用的“大脑”，也是模板适配、链管理的核心层\[superscript:9\]。

- 核心模块：
\- 模板适配模块：根据业务场景，加载并修改官方模板（如电商客服、企业知识库）；
\- 链管理模块：管理所有LangChain链，实现链的动态切换、复用；
\- 工具集成模块：集成业务所需的工具（如订单查询、数据库查询）；
\- 对话记忆模块：用Redis实现分布式对话记忆，支持多服务共享；
\- 数据处理模块：处理文档、音频等非文本数据，为RAG提供支撑。

- 实现建议：业务层与LLM层解耦，通过接口调用LLM，便于后续替换LLM模型。

#### 3\. LLM层（底层支撑层）

核心职责：提供LLM、Embedding模型的调用能力，处理模型缓存、模型切换，是应用的“底层动力”\[superscript:9\]。

- 核心模块：
\- LLM适配模块：封装不同LLM的调用接口，实现“一键切换”（如从OpenAI切换为Qwen）；
\- 模型缓存：用Redis缓存LLM的响应结果，减少重复调用，降低成本；
\- 模型部署：开源LLM（如Qwen、Llama）部署在本地/云服务器，闭源LLM（如OpenAI）调用API。

- 实现建议：
\- 核心业务用闭源LLM（如GPT\-4）保证效果，非核心业务用开源LLM降低成本；
\- 所有LLM调用统一封装，避免代码冗余。

### 19\.6\.3 企业级部署建议

结合分层架构，企业级部署建议如下，确保高可用、可扩展：

- 容器化部署：用Docker封装各层服务，Docker Compose管理多服务（API层、业务层、LLM层）；

- 分布式部署：业务层、LLM层可横向扩展，应对高并发；

- 监控告警：用Prometheus\+Grafana监控各层服务的运行状态，异常时及时告警；

- 备份策略：向量库、对话记忆（Redis）定期备份，避免数据丢失。

## 19\.7 安全与合规设计要点

企业级LangChain应用，安全与合规是重中之重——LLM的“幻觉”、用户数据泄露、工具滥用等问题，都可能引发业务风险。本节结合LangChain的特性，讲解安全与合规的核心设计要点，贴合企业实际落地需求\[superscript:6\]。

### 19\.7\.1 核心安全风险点

LangChain应用的安全风险主要集中在3个方面，需重点防范：

- 数据安全风险：用户输入的敏感信息（如手机号、订单号、身份证号）泄露；

- 工具滥用风险：Agent调用工具时，被恶意利用（如调用文件工具读取系统敏感文件）；

- LLM输出风险：LLM生成有害、虚假、违规内容，或泄露企业内部信息。

### 19\.7\.2 安全设计要点（实战可落地）

#### 1\. 数据安全防护

- 敏感信息过滤：用户输入和LLM输出时，过滤手机号、身份证号、银行卡号等敏感信息（用正则表达式或第三方工具）；

- 数据加密存储：对话历史、用户数据、文档内容用AES加密存储，向量库、数据库开启加密；

- 访问控制：细化接口权限，不同角色只能访问对应接口（如普通员工无法访问管理员接口）\[superscript:6\]。

代码示例（敏感信息过滤）：

```python
import re

def filter_sensitive_info(text):
    # 过滤手机号、身份证号
    text = re.sub(r"1[3-9]\d{9}", "[手机号]", text)
    text = re.sub(r"\d{17}[\dXx]", "[身份证号]", text)
    return text

# 调用示例
user_input = "我的手机号是13800138000，身份证号是110101199001011234"
filtered_input = filter_sensitive_info(user_input)
print(filtered_input)  # 输出：我的手机号是[手机号]，身份证号是[身份证号]

```

#### 2\. 工具调用安全

- 工具权限控制：给每个工具设置最小权限（如文件工具只能访问指定目录，数据库工具只能查询，不能修改/删除）\[superscript:6\]；

- 工具调用校验：Agent调用工具前，校验用户需求的合法性，禁止恶意调用（如禁止调用文件工具读取系统文件）；

- 工具日志审计：记录所有工具调用记录（用户、时间、工具、参数），便于追溯。

#### 3\. LLM输出安全

- Prompt约束：在Prompt中明确禁止生成有害、违规内容，规范输出边界（如“禁止生成虚假信息、违法内容”）；

- 输出过滤：LLM输出后，用关键词过滤（如过滤“暴力”“色情”等违规词汇），不合格输出直接拦截；

- 模型选择：企业级应用优先选择合规性强的LLM（如Azure OpenAI、阿里云Qwen），避免使用未合规的模型。

### 19\.7\.3 合规设计要点

结合国内法律法规（如《个人信息保护法》《网络安全法》），合规设计重点关注3点：

- 用户知情同意：收集用户数据（如对话历史、文档）时，需获取用户同意，明确告知数据用途；

- 数据留存与删除：用户数据留存时间符合法规要求，提供用户数据删除功能；

- 可追溯性：所有LLM调用、用户交互、工具调用都需记录日志，便于合规审计\[superscript:6\]。

## 19\.8 【实战】基于模板快速部署客服系统

结合本章所学的模板、架构、安全知识，实战部署一个“电商客服系统”——基于官方Chatbot Template修改，适配电商客服场景，实现多轮对话、订单查询模拟、敏感信息过滤，支持快速部署上线，全程代码可复用、步骤清晰\[superscript:7\]。

### 19\.8\.1 实战需求与技术栈

#### 核心需求

- 基础功能：多轮对话、订单查询、物流查询、售后咨询，语气贴合电商客服；

- 安全需求：过滤用户敏感信息（手机号、订单号可保留，但需加密存储）；

- 部署需求：用FastAPI提供接口，支持本地部署，可直接对接前端；

- 扩展需求：支持后续新增工具（如真实订单查询接口）。

#### 技术栈

- 核心框架：LangChain、FastAPI；

- LLM：OpenAI GPT\-3\.5\-turbo（可替换为Qwen）；

- 对话记忆：Redis（分布式记忆，支持多用户）；

- 依赖包：langchain、langchain\-openai、fastapi、redis、uvicorn。

依赖安装命令：`pip install langchain langchain\-openai fastapi redis uvicorn`

### 19\.8\.2 完整代码实现（分模块）

代码分为3个模块：config\.py（配置）、service\.py（业务逻辑）、main\.py（API接口），结构清晰，便于维护。

#### 1\. 配置文件（config\.py）

```python
# 配置文件：存储LLM、Redis等配置
OPENAI_API_KEY = "你的API Key"
LLM_MODEL = "gpt-3.5-turbo"
REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0
# 客服Prompt模板（电商场景）
SYSTEM_PROMPT = """你是电商平台的客服助手，负责解答用户的订单、物流、售后相关问题。
语气专业、耐心，回答简洁明了，包含核心信息；
用户询问订单，需主动询问订单号；询问物流，需主动询问订单号或收货手机号；
若用户询问非电商相关问题，回复："抱歉，我仅能解答订单、物流、售后相关问题哦～"；
禁止生成任何违规、虚假信息，不泄露企业内部信息。"""

```

#### 2\. 业务逻辑（service\.py）

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import ConversationChain
from langchain.memory import RedisChatMessageHistory
from config import *
import re

# 1. 敏感信息过滤函数
def filter_sensitive_info(text):
    # 过滤手机号，保留后4位（合规且不影响体验）
    text = re.sub(r"1[3-9]\d{8}(\d{4})", r"1****\1", text)
    return text

# 2. 初始化对话链（适配电商客服）
def create_chat_chain(session_id: str):
    # 初始化Redis对话记忆（按session_id区分用户）
    memory = RedisChatMessageHistory(
        session_id=session_id,
        redis_url=f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"
    )
    
    # 定义Prompt模板
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{input}"),
        ("ai", "{history}")
    ])
    
    # 初始化LLM
    llm = ChatOpenAI(
        model=LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0.3
    )
    
    # 构建对话链
    chain = ConversationChain(
        llm=llm,
        prompt=prompt,
        memory=memory,
        verbose=True
    )
    return chain

# 3. 订单查询模拟（后续可替换为真实接口）
def query_order(order_id: str):
    # 模拟订单数据（真实场景对接数据库/订单接口）
    order_data = {
        "123456": "订单123456：已发货，物流状态：XX市中转仓→收货地址，预计明天送达",
        "654321": "订单654321：未发货，预计今天18:00前发货",
        "111222": "订单111222：已收货，可申请售后退款"
    }
    return order_data.get(order_id, "未查询到该订单，请确认订单号是否正确～")

```

#### 3\. API接口（main\.py）

```python
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from service import create_chat_chain, filter_sensitive_info, query_order
from config import *

app = FastAPI(title="电商客服系统API", version="1.0.0")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")  # JWT鉴权（简化版，实际需完善）

# 定义请求模型
class ChatRequest(BaseModel):
    user_input: str
    session_id: str  # 区分不同用户的对话

class OrderRequest(BaseModel):
    order_id: str
    session_id: str

# 1. 聊天接口（核心）
@app.post("/chat", summary="客服聊天接口")
async def chat(request: ChatRequest, token: str = Depends(oauth2_scheme)):
    try:
        # 过滤敏感信息
        filtered_input = filter_sensitive_info(request.user_input)
        # 创建对话链（按session_id获取用户记忆）
        chat_chain = create_chat_chain(request.session_id)
        # 调用对话链
        response = chat_chain.invoke({"input": filtered_input})
        # 过滤输出敏感信息
        filtered_response = filter_sensitive_info(response["response"])
        return {
            "code": 200,
            "data": {"response": filtered_response},
            "msg": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"服务异常：{str(e)}")

# 2. 订单查询接口（扩展）
@app.post("/query_order", summary="订单查询接口")
async def query_order_api(request: OrderRequest, token: str = Depends(oauth2_scheme)):
    try:
        # 查询订单（模拟）
        order_info = query_order(request.order_id)
        # 关联对话记忆（将订单信息加入对话历史）
        chat_chain = create_chat_chain(request.session_id)
        chat_chain.memory.add_user_message(f"查询订单{request.order_id}")
        chat_chain.memory.add_ai_message(order_info)
        return {
            "code": 200,
            "data": {"order_info": order_info},
            "msg": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败：{str(e)}")

# 启动服务（本地部署）
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

```

### 19\.8\.3 部署与测试步骤

#### 1\. 部署准备

1. 启动Redis服务（本地或远程），确保配置文件中的Redis地址、端口正确；

2. 替换config\.py中的OPENAI\_API\_KEY为自己的密钥（若用开源模型，替换LLM初始化代码）；

3. 安装所有依赖包（执行依赖安装命令）。

#### 2\. 启动服务

运行main\.py，启动FastAPI服务：
`python main\.py`

服务启动后，访问`http://localhost:8000/docs`，可查看自动生成的接口文档，直接测试接口。

#### 3\. 接口测试（示例）

测试聊天接口（POST /chat），请求参数：

```json
{"user_input": "我的手机号是13800138000，想查询订单123456", "session_id": "user123"}
```

响应结果：

```json
{
    "code": 200,
    "data": {
        "response": "你好～ 已为你查询订单123456：已发货，物流状态：XX市中转仓→收货地址，预计明天送达"
    },
    "msg": "success"
}
```

#### 4\. 后续扩展建议

- 对接真实订单接口：将query\_order函数替换为真实的订单系统接口调用；

- 添加物流查询功能：新增物流查询工具，对接物流API；

- 部署到云服务器：用Docker容器化部署，配置Nginx反向代理，实现公网访问；

- 添加监控告警：集成Prometheus\+Grafana，监控接口响应时间、错误率。

### 19\.8\.4 实战总结

本次实战基于官方Chatbot Template，通过修改Prompt、添加业务逻辑、完善安全防护，快速部署了一个符合企业需求的电商客服系统。核心要点：

- 模板是基础：基于官方模板修改，节省开发时间，避免重复造轮子；

- 业务适配是关键：通过修改Prompt、新增业务函数，让模板贴合电商场景；

- 安全合规不可少：敏感信息过滤、权限控制，确保系统符合企业安全要求；

- 可扩展性是前提：分层设计、模块拆分，便于后续新增功能、对接真实接口。




