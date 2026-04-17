# 第3章 LangChain 核心抽象：Models 与 Messages

上一章我们完成了LangChain开发环境的搭建，相当于为大模型应用开发准备好了“工具房”。本章将聚焦LangChain最基础、最核心的两个抽象概念——**Models（模型）**和**Messages（消息）**：Models是LangChain与大模型交互的“入口”，决定了回答的质量和能力；Messages是交互的“载体”，定义了用户、AI和系统之间的对话逻辑。

本章将从“模型分类→模型集成→消息类型→生成控制→高级特性→实战落地”逐步展开，所有代码示例均简洁可复制、标注官方来源，兼顾新手入门和实际开发需求，帮你彻底吃透Models与Messages的核心用法，为后续链式调用、Agent开发打下基础。

## 3.1 LLM 与 ChatModel 的区别与适用场景

LangChain中，与大模型交互的核心接口分为两类：**LLM（大语言模型）**和**ChatModel（聊天模型）**。很多新手容易混淆两者，其实它们的核心区别在于“交互格式”和“适用场景”，选择对了模型类型，能大幅提升开发效率。

### 3.1.1 核心区别（一张表看懂）

| 对比维度 | LLM（大语言模型）                              | ChatModel（聊天模型）                                  |
| -------- | ---------------------------------------------- | ------------------------------------------------------ |
| 交互格式 | 纯文本输入（字符串），输出纯文本（字符串）     | 消息列表输入（Message对象），输出消息对象（AIMessage） |
| 核心特点 | 简单直接，无需关注消息结构，适合纯文本生成     | 支持多轮对话、系统提示，结构清晰，适合聊天场景         |
| 调用方式 | 使用 `invoke(text)` 调用，输入字符串           | 使用 `invoke(messages)` 调用，输入消息列表             |
| 典型模型 | GPT-3（text-davinci-003）、Llama 2（text模型） | GPT-3.5-turbo、GPT-4、Claude、Llama 3（chat模型）      |

### 3.1.2 代码示例（直观对比）

#### 1. LLM 调用示例（以OpenAI的text-davinci-003为例）

```python
from langchain_openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化LLM（纯文本交互）
llm = OpenAI(
    model_name="text-davinci-003",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

# 调用：输入纯文本字符串
response = llm.invoke("简单介绍LangChain")
print("LLM输出（纯文本）：", response)
```

依赖安装：`pip install langchain-openai==0.1.6`；代码来源：LangChain LLM官方示例（[https://python.langchain.com/docs/langchain-core/models/llms](https://python.langchain.com/docs/langchain-core/models/llms)）。

#### 2. ChatModel 调用示例（以GPT-3.5-turbo为例）

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化ChatModel（消息列表交互）
chat_model = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

# 调用：输入消息列表（此处为单条用户消息）
response = chat_model.invoke([HumanMessage(content="简单介绍LangChain")])
print("ChatModel输出（消息对象）：", response.content)
```

代码来源：LangChain ChatModel官方示例（[https://python.langchain.com/docs/langchain-core/models/chat_models](https://python.langchain.com/docs/langchain-core/models/chat_models)）。

### 3.1.3 适用场景选择（新手必看）

- 优先选 **ChatModel** 的场景：多轮对话（如聊天机器人）、需要系统提示（System Prompt）、需要明确区分用户/AI消息、使用主流聊天模型（GPT-3.5/4、Claude、Llama 3）；

- 选 **LLM** 的场景：纯文本生成（如文案、摘要）、使用旧版文本模型（如text-davinci-003）、简单场景无需复杂消息结构；

- 注意：LangChain 1.0+版本更推荐使用ChatModel，其功能更全面、更贴合当前大模型的交互逻辑，LLM更多用于兼容旧版模型。

## 3.2 使用 OpenAI、Anthropic、Hugging Face 模型

LangChain的核心优势之一是“统一模型接口”——无论使用OpenAI、Anthropic还是Hugging Face的模型，调用方式高度一致，无需修改核心代码，只需替换模型初始化逻辑。本节聚焦3类主流云端/开源模型的集成，示例简洁可直接运行。

### 3.2.1 OpenAI 模型（GPT-3.5/4，最常用）

OpenAI的ChatModel是LangChain开发中最常用的模型，支持GPT-3.5-turbo、GPT-4等，调用方式如下（延续上一节的ChatModel示例，补充多轮对话）：

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化OpenAI ChatModel
chat_openai = ChatOpenAI(
    model_name="gpt-3.5-turbo",  # 可替换为gpt-4
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.5
)

# 多轮对话：系统提示 + 用户消息 + AI消息 + 新用户消息
messages = [
    SystemMessage(content="你是一名LangChain开发助手，回答简洁易懂，不超过3句话。"),
    HumanMessage(content="LangChain的Models抽象有什么用？"),
    AIMessage(content="统一模型接口，让不同大模型调用方式一致，降低开发成本。"),
    HumanMessage(content="那ChatModel和LLM的区别是什么？")
]

# 调用模型
response = chat_openai.invoke(messages)
print("OpenAI响应：", response.content)
```

代码来源：LangChain OpenAI集成文档（[https://python.langchain.com/docs/integrations/chat/openai](https://python.langchain.com/docs/integrations/chat/openai)）；注意：需科学上网，API密钥需在OpenAI平台获取（详见第2章）。

### 3.2.2 Anthropic 模型（Claude，长文本优势）

Anthropic的Claude模型以“长上下文窗口”著称（如Claude 3 Opus支持200k上下文），适合长文本处理，LangChain集成方式如下：

```python
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化Claude模型（需配置ANTHROPIC_API_KEY）
chat_claude = ChatAnthropic(
    model_name="claude-3-sonnet-20240229",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    temperature=0.6
)

# 调用模型
response = chat_claude.invoke([HumanMessage(content="用一句话说明Claude模型的优势")])
print("Claude响应：", response.content)
```

依赖安装：`pip install langchain-anthropic==0.1.14`；API密钥获取：访问Anthropic官网（[https://console.anthropic.com/](https://console.anthropic.com/)）；代码来源：LangChain Anthropic集成文档（[https://python.langchain.com/docs/integrations/chat/anthropic](https://python.langchain.com/docs/integrations/chat/anthropic)）。

### 3.2.3 Hugging Face 模型（开源模型，可云端/本地调用）

Hugging Face提供大量开源模型（如Llama 2、Mistral），可通过LangChain直接调用云端模型（Hugging Face Inference Endpoints）或本地模型，这里以云端调用为例：

```python
from langchain_community.chat_models import ChatHuggingFace
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化Hugging Face ChatModel（云端调用）
chat_hf = ChatHuggingFace(
    model_name="mistralai/Mistral-7B-Instruct-v0.2",
    huggingfacehub_api_token=os.getenv("HUGGINGFACE_API_TOKEN"),
    temperature=0.7
)

# 调用模型
response = chat_hf.invoke([HumanMessage(content="介绍一下Mistral模型")])
print("Hugging Face响应：", response.content)
```

依赖安装：`pip install langchain-community==0.1.13 huggingface-hub==0.22.2`；API密钥获取：访问Hugging Face官网（[https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)）；代码来源：LangChain Hugging Face集成文档（[https://python.langchain.com/docs/integrations/chat/huggingface](https://python.langchain.com/docs/integrations/chat/huggingface)）。

### 3.2.4 核心总结

LangChain对主流模型的集成遵循“统一接口”原则——无论使用哪种模型，初始化后均通过`invoke()`调用，区别仅在于“模型名称”和“API密钥”，这也是LangChain“模块化”设计的体现，极大降低了模型替换的成本。

## 3.3 本地部署模型集成（Llama.cpp、vLLM、Ollama）

在隐私敏感、无网络或成本控制场景下，本地部署开源模型是最佳选择。本节介绍3种主流本地模型部署工具（Ollama、Llama.cpp、vLLM）的LangChain集成方法，其中Ollama最适合新手，vLLM适合高性能场景，Llama.cpp适合轻量部署。

### 3.3.1 Ollama（新手首选，轻量便捷）

Ollama是最易用的本地模型部署工具，支持一键拉取、运行开源模型（Llama 3、Qwen、Mistral等），LangChain集成无需复杂配置，步骤如下（延续第2章内容，补充多轮对话）：

```python
from langchain_community.chat_models import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage

# 初始化本地Ollama模型（已拉取llama3:8b）
chat_ollama = ChatOllama(
    model="llama3:8b",  # 模型名称，需提前用ollama pull拉取
    temperature=0.7,
    max_tokens=100  # 控制输出长度
)

# 多轮对话调用
messages = [
    SystemMessage(content="你是本地部署的AI助手，回答简洁。"),
    HumanMessage(content="本地模型和云端模型的区别是什么？")
]

response = chat_ollama.invoke(messages)
print("Ollama响应：", response.content)
```

注意：需提前安装Ollama并拉取对应模型（`ollama pull llama3:8b`）；代码来源：LangChain Ollama集成文档（[https://python.langchain.com/docs/integrations/chat/ollama](https://python.langchain.com/docs/integrations/chat/ollama)）。

### 3.3.2 Llama.cpp（轻量部署，低配置适配）

Llama.cpp是一款轻量级开源模型部署工具，支持将Llama系列模型转换为二进制文件，在低配置设备（如笔记本）上运行，LangChain集成步骤如下：

1. 安装依赖：`pip install langchain-community==0.1.13 llama-cpp-python==0.2.24`；

2. 下载模型：从Hugging Face下载转换好的Llama 2模型（如llama-2-7b-chat.Q4_K_M.gguf）；

3. LangChain调用示例：

```python
from langchain_community.llms import LlamaCpp
from langchain_core.prompts import PromptTemplate

# 初始化Llama.cpp模型（本地模型文件路径）
llm_llama_cpp = LlamaCpp(
    model_path="./llama-2-7b-chat.Q4_K_M.gguf",  # 本地模型文件路径
    temperature=0.7,
    max_tokens=100,
    n_ctx=2048  # 上下文窗口大小
)

# 调用模型（LLM接口，纯文本输入）
prompt = PromptTemplate.from_template("请回答：{question}")
response = llm_llama_cpp.invoke(prompt.format(question="Llama.cpp的优势是什么？"))
print("Llama.cpp响应：", response)
```

代码来源：LangChain Llama.cpp集成文档（[https://python.langchain.com/docs/integrations/llms/llama_cpp](https://python.langchain.com/docs/integrations/llms/llama_cpp)）；注意：模型文件较大（约4GB），需提前下载。

### 3.3.3 vLLM（高性能部署，适合高并发）

vLLM是一款高性能开源模型部署工具，支持高并发请求，适合生产环境本地部署，LangChain集成步骤如下：

1. 安装依赖：`pip install langchain-community==0.1.13 vllm==0.4.0`；

2. 启动vLLM服务：终端执行`vllm serve meta-llama/Llama-2-7b-chat-hf`（需提前下载模型）；

3. LangChain调用示例：

```python
from langchain_community.chat_models import ChatVLLM
from langchain_core.messages import HumanMessage

# 连接本地vLLM服务
chat_vllm = ChatVLLM(
    model="meta-llama/Llama-2-7b-chat-hf",
    temperature=0.7,
    max_tokens=100,
    vllm_kwargs={"tensor_parallel_size": 1}  # 并行度，根据GPU配置调整
)

# 调用模型
response = chat_vllm.invoke([HumanMessage(content="vLLM为什么适合高并发？")])
print("vLLM响应：", response.content)
```

代码来源：LangChain vLLM集成文档（[https://python.langchain.com/docs/integrations/chat/vllm](https://python.langchain.com/docs/integrations/chat/vllm)）；注意：vLLM需要GPU支持（推荐NVIDIA GPU），适合高性能场景。

### 3.3.4 本地模型选型建议

- 新手/快速验证：优先选 **Ollama**，一键部署，无需复杂配置；

- 低配置设备（如笔记本）：选 **Llama.cpp**，轻量占用，支持CPU运行；

- 生产环境/高并发：选 **vLLM**，高性能，支持批量请求；

- 模型选择：优先选7B参数模型（如llama3:8b、Qwen-7B），平衡性能和资源占用。

## 3.4 消息类型详解：HumanMessage、AIMessage、SystemMessage

在ChatModel交互中，所有输入都是“消息列表”，LangChain定义了3种核心消息类型，分别对应“用户输入、AI输出、系统提示”，它们共同构成了多轮对话的逻辑，掌握这些消息类型，才能灵活实现复杂的聊天场景。

### 3.4.1 核心消息类型（3种必掌握）

所有消息类型均继承自`BaseMessage`，核心区别在于“角色”和“用途”，具体如下：

#### 1. SystemMessage（系统消息）

- 作用：定义AI的“角色、行为准则、回答要求”，相当于给AI设定“人设”，贯穿整个对话过程；

- 特点：通常放在消息列表的最前面，只需要设置一次（多轮对话中可重复设置，覆盖之前的准则）；

- 示例：`SystemMessage(content="你是一名LangChain开发专家，回答需包含代码示例，简洁明了。")`。

#### 2. HumanMessage（用户消息）

- 作用：用户输入的查询、问题或指令，是AI生成回答的核心依据；

- 特点：多轮对话中，每次用户输入都是一条HumanMessage，与AI的AIMessage交替出现；

- 示例：`HumanMessage(content="如何使用LangChain的SystemMessage？")`。

#### 3. AIMessage（AI消息）

- 作用：AI生成的回答，通常是ChatModel的输出结果；

- 特点：多轮对话中，需将历史AIMessage加入消息列表，让AI“记住”之前的回答；

- 示例：`AIMessage(content="使用SystemMessage需导入对应的类，放在消息列表最前面，示例如下：...")`。

### 3.4.2 代码示例（多轮对话，完整消息流程）

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from dotenv import load_dotenv
import os

load_dotenv()

chat_model = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.6
)

# 构建多轮对话消息列表（系统消息→用户消息→AI消息→新用户消息）
messages = [
    # 系统消息：设定AI角色和回答要求
    SystemMessage(content="你是LangChain消息类型助手，回答仅围绕3种核心消息类型，不扩展其他内容。"),
    # 第一轮：用户提问，AI回答
    HumanMessage(content="LangChain有哪几种核心消息类型？"),
    AIMessage(content="核心消息类型有3种：SystemMessage（系统提示）、HumanMessage（用户输入）、AIMessage（AI输出）。"),
    # 第二轮：用户追问，AI继续回答
    HumanMessage(content="SystemMessage的作用是什么？")
]

# 调用模型，获取新的AI消息
new_ai_message = chat_model.invoke(messages)
print("新AI回答：", new_ai_message.content)

# 将新的AI消息加入列表，用于下一轮对话
messages.append(new_ai_message)
print("\n完整消息列表：")
for msg in messages:
    print(f"【{msg.type}】: {msg.content}")
```

代码来源：LangChain Messages官方示例（[https://python.langchain.com/docs/langchain-core/messages](https://python.langchain.com/docs/langchain-core/messages)）；运行结果可清晰看到消息类型的交互逻辑，以及多轮对话中消息列表的变化。

### 3.4.3 其他常用消息类型（可选）

除了3种核心消息类型，LangChain还提供两种辅助消息类型，适合特殊场景：

- **FunctionMessage**：用于工具调用场景，存储工具调用的结果（后续Agent章节详细讲解）；

- **ToolMessage**：与FunctionMessage配套，传递工具调用的参数和结果。

## 3.5 控制生成行为：temperature、max_tokens、stop sequences

调用大模型时，我们需要控制其生成行为（如回答的随机性、长度、结束条件），避免出现“回答过长、偏离主题、随机性过高”等问题。LangChain支持通过3个核心参数控制生成行为，所有模型（ChatModel/LLM）均适用。

### 3.5.1 核心参数详解（3个必掌握）

| 参数名称                     | 作用                                                                              | 取值范围                   | 使用建议                                                                |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| temperature（温度）          | 控制回答的随机性和创造性，值越高，回答越随机、有创造性；值越低，回答越严谨、固定  | 0 ~ 2                      | 严谨场景（如问答、代码）：0.1~0.5；创意场景（如文案、故事）：0.7~1.5    |
| max_tokens（最大 tokens 数） | 控制AI回答的最大长度（tokens 是模型处理文本的基本单位，1个中文约等于1~2个tokens） | 正整数（根据模型限制调整） | 根据需求设定，避免回答过长（如聊天场景设100~200，长文本场景设500~1000） |
| stop sequences（停止序列）   | 设定AI回答的“终止条件”，当AI生成的文本包含停止序列时，立即停止生成                | 字符串或字符串列表         | 适合固定格式场景（如生成列表时，以“### 结束”为停止序列）                |

### 3.5.2 代码示例（参数实战）

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 低temperature（0.2）：严谨、固定回答
chat_low_temp = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.2,
    max_tokens=100
)

# 2. 高temperature（1.5）：随机、有创造性回答
chat_high_temp = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=1.5,
    max_tokens=100
)

# 3. 带stop sequences：生成到“### 结束”时停止
chat_stop_seq = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7,
    max_tokens=200,
    stop=["### 结束"]  # 停止序列
)

# 测试不同参数的效果
question = "用3句话介绍LangChain的Models抽象"

print("=== 低temperature（0.2） ===")
print(chat_low_temp.invoke([HumanMessage(content=question)]).content)

print("\n=== 高temperature（1.5） ===")
print(chat_high_temp.invoke([HumanMessage(content=question)]).content)

print("\n=== 带stop sequences ===")
print(chat_stop_seq.invoke([HumanMessage(content=question + "，结尾加上### 结束")]).content)
```

代码来源：LangChain模型参数官方文档（[https://python.langchain.com/docs/langchain-core/models/chat_models#model-parameters](https://python.langchain.com/docs/langchain-core/models/chat_models#model-parameters)）；运行后可直观看到不同参数对生成结果的影响，建议实际开发中根据场景调整。

### 3.5.3 注意事项

- max_tokens 设定不宜过大，否则会增加成本（云端模型按tokens收费），且可能导致回答冗余；

- stop sequences 需根据生成格式设定，避免出现“未生成完整内容就停止”的情况；

- 不同模型对参数的支持略有差异（如部分本地模型不支持stop sequences），需参考对应模型的文档。

## 3.6 流式输出（Streaming）实现与前端对接

默认情况下，LangChain调用模型时，会等待模型生成完整回答后再返回（同步输出），这种方式在回答较长时，会出现“长时间无响应”的问题，影响用户体验。流式输出（Streaming）可实现“边生成、边返回”，类似ChatGPT的打字效果，是聊天类应用的必备功能。

### 3.6.1 流式输出核心原理

流式输出通过“迭代器”实现：模型生成文本时，会将内容分块返回，LangChain通过`stream()`方法返回迭代器，开发者可遍历迭代器，逐块获取生成内容，实现实时输出。

### 3.6.2 LangChain 流式输出代码示例（后端）

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os

load_dotenv()

# 初始化ChatModel，支持流式输出
chat_stream = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7,
    streaming=True  # 开启流式输出
)

# 流式调用：使用stream()方法，返回迭代器
print("流式输出（边生成边显示）：")
for chunk in chat_stream.stream([HumanMessage(content="详细介绍LangChain的流式输出原理，分3点说明。")]):
    # 逐块打印生成内容，不换行
    print(chunk.content, end="", flush=True)
```

代码来源：LangChain流式输出官方示例（[https://python.langchain.com/docs/langchain-core/models/chat_models#streaming](https://python.langchain.com/docs/langchain-core/models/chat_models#streaming)）；运行后可看到文本“逐字生成”的效果，与ChatGPT的交互体验一致。

### 3.6.3 与前端对接（简单实战，Flask示例）

实际开发中，流式输出需要与前端对接，通过WebSocket或SSE（服务器推送事件）将分块内容推送到前端，实现实时显示。下面给出Flask后端+简单前端的示例（后端部分）：

```python
from flask import Flask, request, Response
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os

load_dotenv()
app = Flask(__name__)

# 初始化流式模型
chat_stream = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    streaming=True,
    temperature=0.7
)

# 流式接口：接收用户提问，返回流式响应
@app.route("/stream_chat", methods=["POST"])
def stream_chat():
    data = request.json
    question = data.get("question")

    # 定义流式响应生成器
    def generate():
        for chunk in chat_stream.stream([HumanMessage(content=question)]):
            yield f"data: {chunk.content}\n\n"  # SSE格式

    # 返回SSE响应
    return Response(generate(), mimetype="text/event-stream")

if __name__ == "__main__":
    app.run(debug=True)
```

依赖安装：`pip install flask==2.3.3`；前端对接说明：前端通过`EventSource`监听`/stream_chat`接口，接收后端推送的分块内容，逐字渲染到页面（前端代码简单示例，可直接复制使用）：

```html
<!DOCTYPE html>
<html>
  <body>
    <input type="text" id="question" placeholder="请输入问题" />
    <button onclick="streamChat()">发送</button>
    <div id="response"></div>

    <script>
      function streamChat() {
        const question = document.getElementById("question").value;
        const responseDiv = document.getElementById("response");
        responseDiv.innerHTML = "";

        // 建立SSE连接
        const eventSource = new EventSource(`/stream_chat`, {
          method: "POST",
          body: JSON.stringify({ question: question }),
          headers: { "Content-Type": "application/json" },
        });

        // 接收分块内容，逐字渲染
        eventSource.onmessage = function (e) {
          responseDiv.innerHTML += e.data;
        };

        // 连接关闭
        eventSource.onclose = function () {
          console.log("流式输出结束");
        };
      }
    </script>
  </body>
</html>
```

代码说明：后端通过SSE推送流式内容，前端通过EventSource接收，实现“边输入、边显示”的交互效果，适合聊天机器人、问答系统等场景。

## 3.7 异步调用（async/await）提升性能

默认情况下，LangChain调用模型是“同步调用”——一次只能处理一个请求，后续请求需等待前一个请求完成，效率较低。异步调用（async/await）可实现“同时处理多个请求”，提升并发性能，适合高并发场景（如多用户同时提问）。

LangChain的所有模型接口均支持异步调用，只需将`invoke()`替换为`ainvoke()`，配合async/await语法即可实现。

### 3.7.1 异步调用基础示例

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os
import asyncio

load_dotenv()

# 初始化ChatModel（支持异步调用）
chat_async = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

# 定义异步函数
async def async_chat(question):
    # 异步调用：ainvoke()
    response = await chat_async.ainvoke([HumanMessage(content=question)])
    return response.content

# 运行异步函数
if __name__ == "__main__":
    question = "LangChain异步调用的优势是什么？"
    result = asyncio.run(async_chat(question))
    print("异步调用结果：", result)
```

代码来源：LangChain异步调用官方示例（[https://python.langchain.com/docs/langchain-core/models/chat_models#async-api](https://python.langchain.com/docs/langchain-core/models/chat_models#async-api)）；注意：异步函数需通过`asyncio.run()`运行，不能直接调用。

### 3.7.2 多请求并发异步调用（核心实战）

异步调用的核心优势是“并发处理多个请求”，下面示例实现“同时处理3个请求”，对比同步调用和异步调用的效率差异：

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os
import asyncio
import time

load_dotenv()

chat_async = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

# 1. 同步调用（依次处理3个请求）
def sync_chat(questions):
    start_time = time.time()
    results = []
    for q in questions:
        response = chat_async.invoke([HumanMessage(content=q)])
        results.append(response.content)
    end_time = time.time()
    print(f"同步调用耗时：{end_time - start_time:.2f}秒")
    return results

# 2. 异步调用（并发处理3个请求）
async def async_chat_single(question):
    return await chat_async.ainvoke([HumanMessage(content=question)])

async def async_chat_batch(questions):
    start_time = time.time()
    # 并发执行多个异步任务
    tasks = [async_chat_single(q) for q in questions]
    results = await asyncio.gather(*tasks)
    end_time = time.time()
    print(f"异步调用耗时：{end_time - start_time:.2f}秒")
    return [res.content for res in results]

# 测试对比
if __name__ == "__main__":
    questions = [
        "介绍LangChain的Models抽象",
        "介绍LangChain的Messages类型",
        "介绍LangChain的流式输出"
    ]

    # 同步调用
    sync_results = sync_chat(questions)
    # 异步调用
    async_results = asyncio.run(async_chat_batch(questions))

    print("\n同步调用结果：", sync_results)
    print("\n异步调用结果：", async_results)
```

运行结果说明：异步调用耗时约为同步调用的1/3（具体耗时取决于网络和模型响应速度），并发优势明显；代码中使用`asyncio.gather()`实现多个异步任务的并发执行，是高并发场景的常用方法。

### 3.7.3 注意事项

- 异步调用需配合支持异步的框架（如FastAPI、Starlette），Flask默认不支持异步，需使用Flask-AsyncExt扩展；

- 云端模型有API调用频率限制，并发请求数量不宜过多，避免触发限流；

- 本地模型的异步调用效果取决于模型部署工具（如vLLM支持异步，Ollama异步支持有限）。

## 3.8 【实战】构建多模型切换的问答接口

本节通过一个完整实战案例，整合本章所学知识点——构建一个“多模型切换的问答接口”，支持切换OpenAI、DeepSeek、Ollama三种模型，实现同步/流式输出、异步调用，验证Models与Messages的核心用法，同时为后续Web应用开发打下基础。

### 3.8.1 实战需求

- 支持3种模型切换：OpenAI（云端）、DeepSeek（云端）、Ollama（本地）；

- 支持两种输出模式：同步输出、流式输出；

- 支持异步调用，提升并发性能；

- 统一接口，模型切换时无需修改核心代码；

- 使用.env管理API密钥，确保敏感信息安全。

### 3.8.2 实战准备

- 激活虚拟环境，安装所需依赖：
  `pip install langchain-core==0.1.33 langchain-community==0.1.13 langchain-openai==0.1.6 python-dotenv==1.0.1 flask==2.3.3`

- 配置.env文件（添加所需API密钥）：
  `OPENAI_API_KEY=你的OpenAI API密钥
  DEEPSEEK_API_KEY=你的DeepSeek API密钥

# Ollama无需配置API密钥`

- 安装Ollama并拉取llama3:8b模型（`ollama pull llama3:8b`）。

### 3.8.3 完整实战代码

```python
"""
实战：构建多模型切换的问答接口
代码来源：LangChain官方示例改编（https://python.langchain.com/docs/get_started/quickstart）
功能：支持OpenAI、DeepSeek、Ollama模型切换，同步/流式输出，异步调用
"""
from dotenv import load_dotenv
import os
import asyncio
from flask import Flask, request, Response
from langchain_openai import ChatOpenAI
from langchain_community.chat_models import ChatDeepSeek, ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

# 1. 加载环境变量
load_dotenv()

# 2. 初始化Flask应用
app = Flask(__name__)

# 3. 定义模型工厂（统一模型初始化，支持切换）
def get_model(model_type, streaming=False):
    """
    获取指定类型的模型
    model_type: openai / deepseek / ollama
    streaming: 是否开启流式输出
    """
    if model_type == "openai":
        return ChatOpenAI(
            model_name="gpt-3.5-turbo",
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.7,
            streaming=streaming
        )
    elif model_type == "deepseek":
        return ChatDeepSeek(
            model_name="deepseek-chat",
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            temperature=0.7,
            streaming=streaming
        )
    elif model_type == "ollama":
        return ChatOllama(
            model="llama3:8b",
            temperature=0.7,
            streaming=streaming,
            max_tokens=200
        )
    else:
        raise ValueError("不支持的模型类型，可选：openai、deepseek、ollama")

# 4. 同步问答接口（支持模型切换）
@app.route("/sync_chat", methods=["POST"])
def sync_chat():
    data = request.json
    model_type = data.get("model_type", "deepseek")  # 默认使用DeepSeek
    question = data.get("question")

    if not question:
        return {"code": 400, "message": "请输入问题"}

    try:
        # 获取模型，调用模型
        model = get_model(model_type)
        messages = [
            SystemMessage(content="你是多模型问答助手，回答简洁易懂，不超过3句话。"),
            HumanMessage(content=question)
        ]
        response = model.invoke(messages)
        return {
            "code": 200,
            "model_type": model_type,
            "response": response.content
        }
    except Exception as e:
        return {"code": 500, "message": f"调用失败：{str(e)}"}

# 5. 流式问答接口（支持模型切换）
@app.route("/stream_chat", methods=["POST"])
def stream_chat():
    data = request.json
    model_type = data.get("model_type", "deepseek")
    question = data.get("question")

    if not question:
        return Response('{"code": 400, "message": "请输入问题"}', mimetype="application/json")

    try:
        model = get_model(model_type, streaming=True)
        messages = [
            SystemMessage(content="你是多模型问答助手，回答简洁易懂，不超过3句话。"),
            HumanMessage(content=question)
        ]

        # 流式生成响应
        def generate():
            for chunk in model.stream(messages):
                yield f"data: {chunk.content}\n\n"

        return Response(generate(), mimetype="text/event-stream")
    except Exception as e:
        return Response(f'{"code": 500, "message": "调用失败：{str(e)}"}', mimetype="application/json")

# 6. 异步问答接口（并发处理多请求）
async def async_chat_single(model_type, question):
    model = get_model(model_type)
    messages = [
        SystemMessage(content="你是多模型问答助手，回答简洁易懂，不超过3句话。"),
        HumanMessage(content=question)
    ]
    response = await model.ainvoke(messages)
    return {
        "model_type": model_type,
        "response": response.content
    }

@app.route("/async_chat_batch", methods=["POST"])
def async_chat_batch():
    data = request.json
    tasks = data.get("tasks", [])  # 格式：[{"model_type": "deepseek", "question": "xxx"}, ...]

    if not tasks:
        return {"code": 400, "message": "请传入任务列表"}

    try:
        # 并发执行多个异步任务
        async_tasks = [async_chat_single(task["model_type"], task["question"]) for task in tasks]
        results = asyncio.run(asyncio.gather(*async_tasks))
        return {"code": 200, "results": results}
    except Exception as e:
        return {"code": 500, "message": f"调用失败：{str(e)}"}

# 7. 启动服务
if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

### 3.8.4 接口测试（实战验证）

启动服务后，可通过Postman、curl或前端页面测试接口，以下是3个核心接口的测试示例：

#### 1. 同步问答接口（/sync_chat）

请求方式：POST，请求体（JSON）：

```json
{
  "model_type": "openai",
  "question": "多模型切换接口的核心优势是什么？"
}
```

响应结果：

```json
{
  "code": 200,
  "model_type": "openai",
  "response": "核心优势是统一接口，可灵活切换不同模型，无需修改核心代码，适配不同场景需求。"
}
```

#### 2. 流式问答接口（/stream_chat）

请求方式：POST，请求体与同步接口一致，通过前端页面（3.6.3节的HTML代码）测试，可看到“边生成边显示”的效果。

#### 3. 异步批量接口（/async_chat_batch）

请求方式：POST，请求体（JSON）：

```json
{
  "tasks": [
    {
      "model_type": "deepseek",
      "question": "LangChain的Messages有哪几种核心类型？"
    },
    { "model_type": "ollama", "question": "本地模型和云端模型的区别是什么？" },
    { "model_type": "openai", "question": "异步调用的优势是什么？" }
  ]
}
```

响应结果：返回3个任务的并发执行结果，耗时远低于同步调用。

###
