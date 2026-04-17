# 第11章 内存机制：让模型记住对话历史（LangChain实战）

在之前的章节中，我们搭建的RAG系统、问答链，都有一个明显的局限——**模型无法记住对话历史**。比如用户先问“公司2023年总营收是多少”，再问“它同比增长了多少”，模型会因为没有记忆，无法关联上一轮对话，只能回复“不知道”。

LangChain的「Memory（内存）」机制，正是为解决这个问题而生——它能存储对话历史、提取关键信息，让模型在对话过程中“记住”上下文，实现连贯的多轮交互。本章将从Memory的核心价值出发，手把手教你使用LangChain内置的各类Memory，自定义内存逻辑，最终实战搭建能记住用户偏好的客服助手，所有代码简短可复制，关键步骤标注引用来源。

# 11.1 为什么需要 Memory？

在理解LangChain的Memory之前，我们先明确一个核心问题：大语言模型（LLM）本身是“无状态”的——每次调用模型，它都只基于当前输入的Prompt进行生成，完全不会记住上一轮的对话内容。

举个直观的反例（无Memory的情况），就能明白Memory的必要性：

## 11.1.1 无Memory的对话痛点（代码示例）

```python
from langchain.chat_models import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化LLM（无任何Memory）
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 第一轮对话
query1 = "我叫小明，我喜欢喝拿铁咖啡"
response1 = llm.predict(query1)
print("用户：", query1)
print("助手：", response1)

# 第二轮对话（询问上一轮提到的信息）
query2 = "我喜欢喝什么咖啡？"
response2 = llm.predict(query2)
print("\n用户：", query2)
print("助手：", response2)  # 输出：抱歉，我不清楚你喜欢喝什么咖啡。
```

## 11.1.2 Memory的核心作用

LangChain的Memory本质是一个「对话存储与管理工具」，核心作用有3点：

1. 存储对话历史：记录用户与模型的每一轮问答（用户输入+模型输出）；

2. 提取关键信息：从对话历史中提取用户偏好、实体、上下文关联等核心内容；

3. 注入Prompt：在每次调用LLM时，自动将对话历史（或提取的关键信息）注入Prompt，让模型“记住”上下文。

## 11.1.3 Memory的核心流程（极简图例）

用流程图直观展示Memory的工作逻辑（可直接用于笔记）：

用户输入 → Memory存储对话历史 → 提取关键信息 → 拼接「历史对话+当前输入」作为Prompt → 传入LLM → LLM生成连贯回答 → 新的对话历史更新到Memory

## 11.1.4 关键提醒

LangChain提供了多种内置Memory，适配不同场景（如简单对话、长对话、需要提取实体的场景），无需从零开发，只需根据业务需求选择合适的Memory即可。

引用来源：[LangChain Memory 官方文档](https://python.langchain.com/docs/modules/memory/)、[LangChain Memory 实战指南](https://juejin.cn/post/7308444898246733858)。

# 11.2 ConversationBufferMemory：简单缓存

「ConversationBufferMemory」是LangChain中最基础、最简单的Memory——它的核心逻辑是**直接缓存所有对话历史**，不做任何压缩、提取，每次调用时，将完整的对话历史拼接成Prompt传入LLM。

优点：简单易实现、无信息丢失；缺点：对话越长，Prompt体积越大，消耗token越多，且可能超出LLM的输入限制。适合短对话场景（如3-5轮）。

## 11.2.1 快速上手（代码示例）

```python
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 初始化ConversationBufferMemory（简单缓存）
memory = ConversationBufferMemory(
    return_messages=True  # 关键：返回完整的对话消息（用户+助手），便于拼接Prompt
)

# 3. 搭建对话链（集成Memory）
conversation_chain = ConversationChain(
    llm=llm,
    memory=memory,
    verbose=True  # 可选：打印详细流程（便于调试）
)

# 4. 多轮对话测试（验证Memory效果）
query1 = "我叫小明，我喜欢喝拿铁咖啡"
response1 = conversation_chain.predict(input=query1)
print("用户：", query1)
print("助手：", response1)

query2 = "我喜欢喝什么咖啡？"
response2 = conversation_chain.predict(input=query2)
print("\n用户：", query2)
print("助手：", response2)  # 输出：你喜欢喝拿铁咖啡。

query3 = "帮我推荐一款适合搭配拿铁的甜点"
response3 = conversation_chain.predict(input=query3)
print("\n用户：", query3)
print("助手：", response3)
```

## 11.2.2 核心参数解析

- `return_messages`：是否返回完整的对话消息（格式为列表，包含用户和助手的消息对象），建议设为True，便于后续查看和调试；

- `memory_key`：对话历史在Prompt中的变量名，默认是“history”，无需修改，除非自定义Prompt模板；

- `output_key`：模型输出的变量名，默认是“response”，与ConversationChain兼容。

## 11.2.3 查看缓存的对话历史

可通过Memory的`load_memory_variables`方法，查看当前缓存的所有对话历史，便于调试：

```python
# 查看缓存的对话历史
history = memory.load_memory_variables({})
print("缓存的对话历史：")
for msg in history["history"]:
    print(f"{msg.type}：{msg.content}")
```

## 11.2.4 适用场景与局限

- 适用场景：短对话、简单交互（如个人助手、简单咨询），无需压缩对话历史；

- 局限：长对话（如10轮以上）会导致Prompt过长，消耗大量token，甚至超出LLM输入限制（如gpt-3.5-turbo默认输入限制为4096token）。

引用来源：[LangChain ConversationBufferMemory 官方文档](https://python.langchain.com/docs/modules/memory/types/buffer)。

# 11.3 ConversationSummaryMemory：摘要压缩

针对ConversationBufferMemory“长对话Prompt过长”的问题，LangChain提供了「ConversationSummaryMemory」——它的核心逻辑是**对对话历史进行摘要压缩**，只保留对话的核心内容，不存储完整对话，从而减少Prompt体积，支持更长的对话。

核心原理：每次新增对话时，LLM会自动将新的对话内容与历史摘要合并，生成新的摘要，始终保持摘要的简洁性。

## 11.3.1 快速上手（代码示例）

```python
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.memory import ConversationSummaryMemory
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化LLM（同时用于生成回答和摘要）
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 初始化ConversationSummaryMemory（摘要压缩）
memory = ConversationSummaryMemory(
    llm=llm,  # 需传入LLM，用于生成对话摘要
    return_messages=True
)

# 3. 搭建对话链
conversation_chain = ConversationChain(
    llm=llm,
    memory=memory,
    verbose=True
)

# 4. 多轮长对话测试（验证摘要压缩效果）
queries = [
    "我叫小明，我喜欢喝拿铁咖啡，每天早上都会喝一杯",
    "我还喜欢吃提拉米苏，觉得提拉米苏和拿铁很配",
    "周末的时候，我会去家附近的咖啡店，点一杯拿铁和一块提拉米苏",
    "那家咖啡店的拿铁用的是进口咖啡豆，口感很醇厚",
    "我喜欢喝什么咖啡？搭配什么甜点？"
]

for i, query in enumerate(queries, 1):
    response = conversation_chain.predict(input=query)
    print(f"\n用户{i}：{query}")
    print(f"助手{i}：{response}")

# 查看压缩后的对话摘要
print("\n压缩后的对话摘要：")
summary = memory.load_memory_variables({})
for msg in summary["history"]:
    print(f"{msg.type}：{msg.content}")
```

## 11.3.2 核心参数解析

- `llm`：必须传入LLM，用于生成对话摘要（摘要的质量依赖LLM的能力）；

- `summary_prompt`：自定义摘要生成的Prompt模板，可根据需求调整（默认模板已足够使用）；

- `return_messages`：与ConversationBufferMemory一致，返回完整的对话消息（摘要形式）。

## 11.3.3 与ConversationBufferMemory对比

| Memory类型                | 核心逻辑     | 优点                   | 缺点                          | 适用场景                 |
| ------------------------- | ------------ | ---------------------- | ----------------------------- | ------------------------ |
| ConversationBufferMemory  | 缓存完整对话 | 无信息丢失、简单易实现 | 长对话Prompt过长、消耗token多 | 短对话、简单交互         |
| ConversationSummaryMemory | 摘要压缩对话 | 支持长对话、节省token  | 可能丢失细节信息              | 长对话、无需保留对话细节 |

## 11.3.4 关键提醒

摘要压缩会丢失部分对话细节（如用户的语气、不重要的描述），如果业务场景需要保留所有对话细节（如客服对话记录），不建议使用这种Memory；如果只是需要记住核心信息（如用户偏好），则非常合适。

引用来源：[LangChain ConversationSummaryMemory 官方文档](https://python.langchain.com/docs/modules/memory/types/summary)。

# 11.4 EntityMemory：提取并记忆关键实体

在很多对话场景中，我们不需要记住完整的对话历史，只需要记住对话中提到的**关键实体**（如用户姓名、产品名称、需求偏好等）。LangChain的「EntityMemory」就能实现这个功能——它会自动提取对话中的实体，存储实体及其关联信息，后续对话中可直接复用这些实体信息。

示例：用户提到“我叫小明，想买一款价格在5000元左右的手机”，EntityMemory会提取实体“小明”（用户姓名）、“手机”（产品）、“5000元”（预算），后续用户问“有没有适合我的手机”，模型会自动关联这些实体。

## 11.4.1 快速上手（代码示例）

```python
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.memory import EntityMemory
from langchain.memory.prompt import ENTITY_MEMORY_CONVERSATION_TEMPLATE
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 初始化EntityMemory（提取关键实体）
memory = EntityMemory(
    llm=llm,  # 用于提取实体和关联信息
    return_messages=True
)

# 3. 搭建对话链（使用EntityMemory专属模板）
conversation_chain = ConversationChain(
    llm=llm,
    memory=memory,
    prompt=ENTITY_MEMORY_CONVERSATION_TEMPLATE,  # 关键：使用实体记忆模板
    verbose=True
)

# 4. 对话测试（验证实体提取与记忆）
query1 = "我叫小明，想买一款价格在5000元左右的手机，喜欢拍照"
response1 = conversation_chain.predict(input=query1)
print("用户：", query1)
print("助手：", response1)

query2 = "我预算多少？喜欢什么功能？"
response2 = conversation_chain.predict(input=query2)
print("\n用户：", query2)
print("助手：", response2)  # 输出：你的预算是5000元左右，喜欢拍照功能。

query3 = "帮我推荐一款符合我需求的手机"
response3 = conversation_chain.predict(input=query3)
print("\n用户：", query3)
print("助手：", response3)
```

## 11.4.2 查看提取的实体信息

可通过`memory.entity_store`查看提取的所有实体及其关联信息，直观了解EntityMemory的工作效果：

```python
# 查看提取的实体及关联信息
print("提取的实体信息：")
for entity, info in memory.entity_store.items():
    print(f"实体：{entity}，关联信息：{info}")
```

运行结果示例：

```text
提取的实体信息：
实体：小明，关联信息：用户姓名，想买价格在5000元左右、适合拍照的手机。
实体：手机，关联信息：用户小明想买的产品，预算5000元左右，要求适合拍照。
实体：5000元，关联信息：用户小明买手机的预算。
实体：拍照，关联信息：用户小明买手机时喜欢的功能。
```

## 11.4.3 核心参数解析

- `llm`：必须传入LLM，用于提取实体、生成实体关联信息；

- `entity_cache_limit`：实体缓存的最大数量，默认是100，超过后会自动删除最早的实体；

- `prompt`：需使用EntityMemory专属的Prompt模板（ENTITY_MEMORY_CONVERSATION_TEMPLATE），否则无法正常提取实体。

## 11.4.4 适用场景

EntityMemory适合需要“提取关键信息、忽略无关对话”的场景，比如：

- 客服对话：提取用户姓名、需求、产品偏好等；

- 个人助手：提取用户日程、偏好、常用需求等；

- 产品咨询：提取用户预算、产品需求、使用场景等。

引用来源：[LangChain EntityMemory 官方文档](https://python.langchain.com/docs/modules/memory/types/entity)。

# 11.5 VectorStoreRetrieverMemory：基于向量的记忆

前面介绍的Memory（Buffer、Summary、Entity），都有一个局限——无法高效检索长对话中的关键信息（比如对话超过10轮，想快速找到用户之前提到的某个细节）。LangChain的「VectorStoreRetrieverMemory」解决了这个问题——它将对话历史转化为向量，存入向量数据库，通过语义检索的方式，快速找到与当前查询相关的历史信息。

核心逻辑：将每一轮对话（用户输入+模型输出）生成向量，存入向量数据库；当用户发起新查询时，先检索向量数据库中与当前查询最相关的历史对话，再将这些相关对话注入Prompt，实现精准的上下文关联。

## 11.5.1 快速上手（代码示例）

```python
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.memory import VectorStoreRetrieverMemory
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化嵌入模型和向量数据库（用于存储对话向量）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_db = Chroma(embedding_function=embeddings, persist_directory="./vector_memory_db")
retriever = vector_db.as_retriever(k=2)  # 检索前2个最相关的历史对话

# 2. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 3. 初始化VectorStoreRetrieverMemory（基于向量的记忆）
memory = VectorStoreRetrieverMemory(
    retriever=retriever,  # 向量检索器
    memory_key="history",  # 对话历史在Prompt中的变量名
    return_messages=True
)

# 4. 搭建对话链
conversation_chain = ConversationChain(
    llm=llm,
    memory=memory,
    verbose=True
)

# 5. 多轮对话测试（验证向量检索效果）
queries = [
    "我叫小明，我喜欢喝拿铁咖啡",
    "我还喜欢吃提拉米苏，搭配拿铁很合适",
    "周末我会去家附近的咖啡店，叫“转角咖啡”",
    "那家咖啡店的拿铁用的是哥伦比亚咖啡豆",
    "我常去的咖啡店叫什么名字？用的什么咖啡豆？"
]

for i, query in enumerate(queries, 1):
    response = conversation_chain.predict(input=query)
    print(f"\n用户{i}：{query}")
    print(f"助手{i}：{response}")
```

## 11.5.2 核心原理与优势

### 核心原理

1. 每一轮对话结束后，将“用户输入+模型输出”拼接成一段文本，生成向量；

2. 将向量和文本存入向量数据库（如Chroma、Pinecone）；

3. 新查询发起时，将查询生成向量，在向量数据库中检索最相关的2-3轮历史对话；

4. 将检索到的相关对话注入Prompt，让模型基于相关历史生成回答。

### 核心优势

- 支持长对话：无需存储完整对话，通过检索快速定位相关历史，节省token；

- 检索精准：基于语义检索，能快速找到与当前查询相关的历史细节，避免遗漏；

- 可持久化：向量数据库支持持久化，对话历史可长期保存，重启程序后仍可复用。

## 11.5.3 关键参数解析

- `retriever`：向量检索器，由向量数据库生成，`k`值表示检索前k个最相关的历史对话；

- `memory_key`：对话历史在Prompt中的变量名，需与ConversationChain的Prompt模板对应；

- `input_key`：用户输入的变量名，默认是“input”，无需修改；

- `output_key`：模型输出的变量名，默认是“response”，与ConversationChain兼容。

## 11.5.4 适用场景

VectorStoreRetrieverMemory适合长对话、需要精准检索历史细节的场景，比如：

- 长期客服对话：需要记住用户之前的咨询记录、需求细节；

- 复杂咨询场景：用户多次询问不同角度的问题，需要关联历史细节；

- 需要持久化对话历史的场景：重启程序后，仍能记住之前的对话。

引用来源：[LangChain VectorStoreRetrieverMemory 官方文档](https://python.langchain.com/docs/modules/memory/types/vectorstore_retriever)。

# 11.6 自定义 Memory 类实现业务逻辑

LangChain内置的Memory虽然能满足大部分场景，但在某些特殊业务场景中（如需要自定义对话存储方式、提取特定格式的信息、对接外部存储），内置Memory可能无法满足需求。此时，我们可以通过继承LangChain的「BaseMemory」类，自定义Memory逻辑，实现贴合业务的内存功能。

## 11.6.1 自定义Memory的核心步骤

自定义Memory需继承「BaseMemory」类，并实现两个核心方法（必须实现）：

1. `load_memory_variables(self, inputs: Dict[str, Any])`：加载内存中的变量（如对话历史），返回一个字典（key为变量名，value为内存内容）；

2. `save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str])`：保存当前对话上下文（用户输入+模型输出）到内存中。

可选实现方法：`clear(self)`：清空内存中的所有内容。

## 11.6.2 实战：自定义Memory（存储用户偏好并持久化到本地）

需求：自定义一个Memory，专门存储用户的偏好信息（如咖啡偏好、甜点偏好），并将偏好信息持久化到本地文件（txt），重启程序后仍可加载。

```python
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.memory.base import BaseMemory
from typing import Dict, Any, List
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 自定义Memory类，继承BaseMemory
class CustomPreferenceMemory(BaseMemory):
    def __init__(self, file_path: str = "./user_preference.txt"):
        self.file_path = file_path  # 本地文件路径，用于持久化偏好
        self.user_preferences: Dict[str, str] = self._load_preferences()  # 存储用户偏好

    def _load_preferences(self) -> Dict[str, str]:
        """从本地文件加载用户偏好（持久化）"""
        if os.path.exists(self.file_path):
            with open(self.file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                return {line.split(":")[0].strip(): line.split(":")[1].strip() for line in lines if line.strip()}
        return {}

    def _save_preferences(self):
        """将用户偏好保存到本地文件（持久化）"""
        with open(self.file_path, "w", encoding="utf-8") as f:
            for key, value in self.user_preferences.items():
                f.write(f"{key}: {value}\n")

    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """加载内存变量：返回用户偏好"""
        return {"user_preferences": self.user_preferences}

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]):
        """保存上下文：提取用户输入中的偏好信息，更新到内存并持久化"""
        user_input = inputs.get("input", "")
        # 简单提取偏好（可根据业务需求优化提取逻辑）
        if "喜欢喝" in user_input:
            preference_key = "咖啡偏好"
            preference_value = user_input.split("喜欢喝")[-1].strip()
            self.user_preferences[preference_key] = preference_value
        if "喜欢吃" in user_input:
            preference_key = "甜点偏好"
            preference_value = user_input.split("喜欢吃")[-1].strip()
            self.user_preferences[preference_key] = preference_value
        # 持久化到本地文件
        self._save_preferences()

    def clear(self):
        """清空内存和本地文件中的偏好信息"""
        self.user_preferences.clear()
        if os.path.exists(self.file_path):
            os.remove(self.file_path)

    @property
    def memory_variables(self) -> List[str]:
        """返回内存变量名（必须实现）"""
        return ["user_preferences"]

# 2. 初始化自定义Memory
custom_memory = CustomPreferenceMemory()

# 3. 初始化LLM和对话链
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 自定义Prompt模板（引入用户偏好变量）
custom_prompt = """你是一个贴心的助手，会记住用户的偏好，并根据偏好提供建议。
用户偏好：{user_preferences}
当前对话：
用户：{input}
助手："""

conversation_chain = ConversationChain(
    llm=llm,
    memory=custom_memory,
    prompt=custom_prompt,
    verbose=True
)

# 4. 测试自定义Memory
query1 = "我喜欢喝拿铁咖啡"
response1 = conversation_chain.predict(input=query1)
print("用户：", query1)
print("助手：", response1)

query2 = "我喜欢吃提拉米苏"
response2 = conversation_chain.predict(input=query2)
print("\n用户：", query2)
print("助手：", response2)

query3 = "根据我的偏好，推荐一款搭配"
response3 = conversation_chain.predict(input=query3)
print("\n用户：", query3)
print("助手：", response3)

# 测试清空内存（可选）
# custom_memory.clear()
# print("\n清空内存后，用户偏好：", custom_memory.user_preferences)
```

## 11.6.3 自定义Memory的关键说明

- 提取逻辑：示例中用简单的字符串分割提取偏好，实际业务中可结合LLM、正则表达式，实现更精准的信息提取；

- 持久化：示例中持久化到本地txt文件，也可对接数据库（如MySQL、MongoDB），实现更可靠的存储；

- 灵活性：可根据业务需求，添加任意自定义逻辑（如偏好分类、偏好权重、过期时间等）；

- 兼容性：自定义Memory继承自BaseMemory，可直接集成到ConversationChain、Agent中，与LangChain其他组件无缝兼容。

引用来源：[LangChain 自定义Memory 官方文档](https://python.langchain.com/docs/modules/memory/custom)。

# 11.7 在 Chain 和 Agent 中集成 Memory

前面我们主要在「ConversationChain」中使用Memory，但在实际开发中，我们可能会使用更复杂的Chain（如RetrievalQAChain、SequentialChain）或Agent，此时需要将Memory集成到这些组件中，让整个系统具备记忆能力。

本节重点讲解两种最常用的集成场景：Chain中集成Memory、Agent中集成Memory，代码简洁可复用。

## 11.7.1 在 Chain 中集成 Memory（以RetrievalQAChain为例）

RetrievalQAChain（RAG问答链）默认没有记忆能力，无法关联对话历史。我们可以通过「ConversationalRetrievalChain」，将RetrievalQAChain与Memory结合，实现具备记忆能力的RAG问答系统。

```python
from langchain.chat_models import ChatOpenAI
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化基础组件（向量数据库+嵌入模型，模拟私有文档库）
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
texts = [
    "2023年公司总营收100亿元，同比增长20%",
    "公司核心业务：人工智能、云计算、大数据",
    "人工智能板块营收50亿元，占总营收50%",
    "云计算板块营收30亿元，同比增长30%",
    "大数据板块营收20亿元，同比增长10%"
]
vector_db = Chroma.from_texts(texts=texts, embedding=embeddings, persist_directory="./rag_memory_db")
retriever = vector_db.as_retriever(k=2)

# 2. 初始化LLM和Memory
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)
memory = ConversationBufferMemory(
    memory_key="chat_history",  # 必须是"chat_history"，与ConversationalRetrievalChain兼容
    return_messages=True,
    output_key="answer"
)

# 3. 集成Memory和RetrievalQAChain（使用ConversationalRetrievalChain）
conversational_rag_chain = ConversationalRetrievalChain.from_llm(
    llm=llm,
    retriever=retriever,
    memory=memory,
    verbose=True
)

# 4. 测试（关联对话历史的RAG问答）
query1 = "2023年公司总营收是多少？"
response1 = conversational_rag_chain({"question": query1})
print("用户：", query1)
print("助手：", response1["answer"])

query2 = "它同比增长了多少？"  # 关联上一轮的“总营收”
response2 = conversational_rag_chain({"question": query2})
print("\n用户：", query2)
print("助手：", response2["answer"])
```

## 11.7.2 在 Agent 中集成 Memory

Agent（智能体）需要根据用户需求，自主调用工具完成任务，而Memory能让Agent记住用户的需求、之前的操作，实现连贯的任务执行。LangChain的Agent可直接集成各类Memory，只需在初始化时传入memory参数。

```python
from langchain.chat_models import ChatOpenAI
from langchain.agents import AgentType, initialize_agent
from langchain.tools import Tool
from langchain.memory import ConversationBufferMemory
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义一个简单的工具（模拟查询天气）
def get_weather(city: str) -> str:
    """查询指定城市的天气"""
    # 模拟天气数据，实际可对接天气API
    weather_data = {
        "北京": "晴，10-20℃",
        "上海": "阴，15-22℃",
        "广州": "多云，20-28℃"
    }
    return f"{city}今天的天气：{weather_data.get(city, '暂无该城市天气数据')}"

# 2. 封装工具
tools = [
    Tool(
        name="WeatherQuery",
        func=get_weather,
        description="用于查询指定城市的天气，输入参数为城市名称（如北京、上海）"
    )
]

# 3. 初始化LLM和Memory
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)
memory = ConversationBufferMemory(
    memory_key="chat_history",
    return_messages=True,
    agent_scope="chat_history"  # 关键：指定Memory作用域为Agent的对话历史
)

# 4. 初始化Agent（集成Memory）
agent = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.CHAT_CONVERSATIONAL_REACT_DESCRIPTION,  # 支持对话的Agent类型
    memory=memory,
    verbose=True
)

# 5. 测试Agent（记住用户之前的需求）
query1 = "查询北京的天气"
response1 = agent.run(query1)
print("用户：", query1)
print("助手：", response1)

query2 = "那上海呢？"  # 关联上一轮的“查询天气”需求
response2 = agent.run(query2)
print("\n用户：", query2)
print("助手：", response2)
```

## 11.7.3 集成关键提醒

- Chain集成Memory：不同Chain对Memory的要求不同，如ConversationalRetrievalChain要求Memory的memory_key必须是“chat_history”，需注意参数匹配；

- Agent集成Memory：需选择支持对话的Agent类型（如CHAT_CONVERSATIONAL_REACT_DESCRIPTION），并指定agent_scope为“chat_history”；

- Memory选择：根据场景选择合适的Memory，短对话用ConversationBufferMemory，长对话用ConversationSummaryMemory或VectorStoreRetrieverMemory。

引用来源：[LangChain Agent 集成Memory 官方文档](https://python.langchain.com/docs/modules/agents/how_to/memory)、[ConversationalRetrievalChain 官方文档](https://python.langchain.com/docs/modules/chains/popular/conversational_retrieval)。

# 11.8 【实战】构建能记住用户偏好的客服助手

结合本章所学的Memory知识，我们实战搭建一个「能记住用户偏好的客服助手」——该助手能记住用户的姓名、产品偏好、需求细节，支持多轮连贯对话，同时将用户偏好持久化到本地，重启程序后仍可复用。

## 11.8.1 实战目标

- 记住用户姓名、产品偏好（如咖啡类型、甜度、温度）；

- 支持多轮连贯对话，能关联上一轮的需求细节；

- 用户偏好持久化到本地（txt文件），重启程序不丢失；

- 结合LLM生成个性化的客服回复，贴合用户偏好。

## 11.8.2 实战准备

### 1. 安装依赖

```bash
pip install langchain openai python-dotenv
```

### 2. 准备环境变量

创建`.env`文件，填入OpenAI API密钥：

```text
OPENAI_API_KEY=你的OpenAI API密钥
```

## 11.8.3 完整实战代码（可直接运行）

```python
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.memory.base import BaseMemory
from typing import Dict, Any, List
from dotenv import load_dotenv
import os

# ---------------------- 1. 自定义偏好Memory（持久化） ----------------------
class UserPreferenceMemory(BaseMemory):
    def __init__(self, file_path: str = "./user_preference.txt"):
        self.file_path = file_path
        # 从本地加载用户偏好（持久化）
        self.preferences = self._load_preferences()

    def _load_preferences(self) -> Dict[str, str]:
        """从本地文件加载用户偏好"""
        if os.path.exists(self.file_path):
            with open(self.file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                return {
                    line.split(":")[0].strip(): line.split(":")[1].strip()
                    for line in lines
                    if line.strip() and ":" in line
                }
        return {}

    def _save_preferences(self):
        """将用户偏好保存到本地文件"""
        with open(self.file_path, "w", encoding="utf-8") as f:
            for key, value in self.preferences.items():
                f.write(f"{key}: {value}\n")

    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """加载用户偏好，供Chain使用"""
        return {"user_preferences": self.preferences}

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]):
        """提取用户输入中的偏好信息，更新并持久化"""
        user_input = inputs.get("input", "").strip()
        # 提取用户姓名
        if "我叫" in user_input:
            name = user_input.split("我叫")[-1].split("，")[0].strip()
            self.preferences["姓名"] = name
        # 提取咖啡类型偏好
        if "喜欢喝" in user_input and "咖啡" in user_input:
            coffee = user_input.split("喜欢喝")[-1].split("，")[0].strip()
            self.preferences["咖啡偏好"] = coffee
        # 提取咖啡甜度偏好
        if "甜度" in user_input:
            if "不甜" in user_input or "无糖" in user_input:
                self.preferences["甜度"] = "无糖"
            elif "微甜" in user_input:
                self.preferences["甜度"] = "微甜"
            elif "半糖" in user_input:
                self.preferences["甜度"] = "半糖"
            elif "全糖" in user_input:
                self.preferences["甜度"] = "全糖"
        # 提取咖啡温度偏好
        if "温度" in user_input:
            if "冰" in user_input:
                self.preferences["温度"] = "冰"
            elif "热" in user_input:
                self.preferences["温度"] = "热"
        # 持久化到本地
        self._save_preferences()

    def clear(self):
        """清空用户偏好"""
        self.preferences.clear()
        if os.path.exists(self.file_path):
            os.remove(self.file_path)

    @property
    def memory_variables(self) -> List[str]:
        """返回内存变量名"""
        return ["user_preferences"]

# ---------------------- 2. 初始化核心组件 ----------------------
load_dotenv()

# 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.3,  # 适当提高温度，让回复更自然
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 初始化自定义Memory
user_memory = UserPreferenceMemory()

# 自定义客服Prompt模板（结合用户偏好）
custom_prompt = """你是一个贴心的咖啡客服助手，负责解答用户的咖啡咨询，核心要求如下：
1. 首先记住用户的偏好（姓名、咖啡类型、甜度、温度），后续对话中主动贴合偏好；
2. 回复语气亲切、礼貌，称呼用户的姓名（如果有）；
3. 若用户没有明确偏好，主动询问；
4. 基于用户偏好，提供个性化建议。

用户当前偏好：{user_preferences}

当前对话：
用户：{input}
助手："""

# 搭建对话链（集成自定义Memory）
customer_service_chain = ConversationChain(
    llm=llm,
    memory=user_memory,
    prompt=custom_prompt,
    verbose=True
)

# ---------------------- 3. 运行客服助手 ----------------------
print("欢迎使用咖啡客服助手！请告诉我你的需求（输入'退出'结束对话）：")
while True:
    user_input = input("用户：")
    if user_input.lower() == "退出":
        print("助手：感谢你的咨询，欢迎下次光临！")
        break
    response = customer_service_chain.predict(input=user_input)
    print(f"助手：{response}")
```

## 11.8.4 实战测试示例（直观参考）

```text
欢迎使用咖啡客服助手！请告诉我你的需求（输入'退出'结束对话）：
用户：我叫小明
助手：你好呀小明！很高兴为你服务～ 请问你喜欢喝什么类型的咖啡呢？比如拿铁、美式、卡布奇诺等。
用户：我喜欢喝拿铁
助手：好的小明，记下你喜欢喝拿铁啦！那你对咖啡的甜度有偏好吗？比如无糖、微甜、半糖或全糖？
用户：我要无糖，冰的
助手：收到啦小明！你喜欢喝无糖冰拿铁～ 我们家的无糖冰拿铁采用进口咖啡豆，口感醇厚，夏天喝特别清爽，需要帮你推荐搭配的甜点吗？
用户：不用，帮我点一杯
助手：好的小明！已为你点一杯无糖冰拿铁，预计10分钟后可取，请注意查收哦～
用户：退出
助手：感谢你的咨询，欢迎下次光临！
```

## 11.8.5 实战拓展

- 优化偏好提取：结合LLM或正则表达式，实现更精准的偏好提取（如提取“我喜欢喝少冰的无糖拿铁”中的多个偏好）；

- 对接数据库：将用户偏好从本地txt文件，迁移到MySQL、MongoDB，支持多用户、大规模存储；

- 添加工具集成：集成支付、订单查询工具，让客服助手不仅能记住偏好，还能完成下单、查单等操作；

- 优化回复模板：根据不同场景（如新用户、老用户），设计不同的Prompt模板，提升用户体验。

# 本章总结

本章围绕LangChain的Memory机制展开，从基础的对话缓存到高级的向量记忆，再到自定义Memory和实战应用，核心要点如下：

- Memory的核心价值：解决LLM“无状态”问题，让模型记住对话历史和关键信息，实现连贯多轮交互；

- 内置Memory选型：短对话用ConversationBufferMemory，长对话用ConversationSummaryMemory，提取实体用EntityMemory，长对话精准检索用VectorStoreRetrieverMemory；

- 自定义Memory：继承BaseMemory类，实现load_memory_variables、save_context两个核心方法，可贴合业务需求实现个性化记忆逻辑；

- 集成场景：Memory可无缝集成到Chain（如ConversationalRetrievalChain）和Agent中，让整个系统具备记忆能力；

- 实战重点：结合持久化存储，让Memory能长期保存关键信息（如用户偏好），提升系统实用性。

下一章将讲解LangChain的Agent（智能体）核心用法，结合Memory和工具调用，实现能自主完成复杂任务的智能系统。
