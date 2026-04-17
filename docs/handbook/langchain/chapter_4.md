# 第4章 提示工程基础：Prompt Templates

上一章我们掌握了LangChain的核心抽象——Models与Messages，学会了如何调用不同类型的模型、管理对话消息。而提示工程（Prompt Engineering）是连接“用户需求”与“模型输出”的关键桥梁，直接决定了模型回答的质量和准确性。

在实际开发中，我们不会每次都手动编写完整提示（比如客服话术、问答模板、文案生成指令），而是将重复的提示结构模板化——这就是LangChain中的`Prompt Templates`（提示模板）。本章将从“模板基础→静态/动态模板→多轮对话模板→少样本提示→实战落地”逐步展开，所有代码示例简洁可复制、标注官方来源，帮你构建可复用、可维护的提示模板体系，提升开发效率。

## 4.1 什么是提示模板？为何要模板化？

在LangChain中，**提示模板（Prompt Template）**是一个包含“固定文本”和“动态变量”的结构化模板，用于生成可复用、标准化的提示文本，传递给大模型进行生成。简单来说，就是将“重复的提示结构”抽离出来，把需要动态替换的内容（如用户问题、产品名称、场景参数）设为变量，后续只需传入变量，即可快速生成完整提示。

### 4.1.1 核心痛点：为什么需要模板化？

没有模板化时，开发中会遇到3个核心问题，而提示模板恰好能完美解决：

- **重复劳动**：每次调用模型都要编写完整提示（如客服话术的固定开场白、问答的格式要求），效率低下；

- **格式不统一**：不同开发者编写的提示格式不一致，导致模型输出杂乱，难以维护；

- **变量管理混乱**：当提示中包含多个动态内容（如用户ID、订单号、问题类型）时，手动拼接容易出错，且不易调试。

### 4.1.2 提示模板的核心价值

- **可复用**：一次定义模板，多次调用，只需传入不同变量，无需重复编写固定内容；

- **标准化**：统一提示格式，确保模型输出符合预期，降低调试成本；

- **可维护**：模板集中管理，修改固定内容时，所有调用处同步生效，无需逐个修改；

- **易扩展**：支持动态变量、条件判断、少样本示例等，适配复杂场景。

### 4.1.3 直观对比：模板化 vs 非模板化

| 方式     | 代码示例                                                                                                    | 优势                     | 劣势                             |
| -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------- |
| 非模板化 | `prompt = f"你是客服，用户问题是：{user_question}，请简洁回答，不超过2句话。"`                              | 简单直接，适合一次性场景 | 重复编写、格式易乱、变量管理繁琐 |
| 模板化   | `prompt = PromptTemplate.from_template("你是客服，用户问题是：{user_question}，请简洁回答，不超过2句话。")` | 可复用、标准化、易维护   | 需提前定义模板，适合重复场景     |

结论：开发中只要涉及“重复提示结构”，都建议使用Prompt Templates，尤其是客服、问答、文案生成等场景。

## 4.2 使用 PromptTemplate 构建静态提示

`PromptTemplate`是LangChain中最基础的提示模板类，用于构建**静态提示**——模板中的固定文本不变，只有动态变量需要替换，适合单轮、简单场景（如纯文本生成、简单问答）。

核心特点：输入是纯文本模板，输出是格式化后的纯文本，适配LLM（纯文本交互）和ChatModel（消息内容）。

### 4.2.1 核心用法（3种创建方式）

LangChain提供3种创建PromptTemplate的方式，按需选择，最常用的是`from_template()`（简洁高效）。

#### 1. 基础方式：from_template()（推荐）

```python
from langchain_core.prompts import PromptTemplate

# 1. 定义模板（{变量名} 表示动态变量）
template = "你是一名文案助手，请为{product}撰写一句宣传语，突出{feature}优势，简洁有力。"

# 2. 创建PromptTemplate实例
prompt_template = PromptTemplate.from_template(template)

# 3. 注入变量，生成完整提示
prompt = prompt_template.format(product="LangChain教程", feature="实战导向、通俗易懂")

print("生成的提示：", prompt)
```

运行结果：`你是一名文案助手，请为LangChain教程撰写一句宣传语，突出实战导向、通俗易懂优势，简洁有力。`

代码来源：LangChain PromptTemplate官方示例（[https://python.langchain.com/docs/langchain-core/prompts/prompt_templates](https://python.langchain.com/docs/langchain-core/prompts/prompt_templates)）。

#### 2. 显式指定变量：构造函数

当模板变量较多时，可显式指定变量列表，避免遗漏或错误：

```python
from langchain_core.prompts import PromptTemplate

# 显式指定variables参数，明确模板中的变量
prompt_template = PromptTemplate(
    template="用户问题：{question}\n要求：{requirement}\n回答：",
    variables=["question", "requirement"]  # 显式指定变量列表
)

# 注入变量
prompt = prompt_template.format(
    question="什么是PromptTemplate？",
    requirement="简洁明了，不超过3句话"
)

print(prompt)
```

#### 3. 从文件加载模板：from_file()

当模板内容较长（如复杂的客服话术、少样本示例），可将模板写入文件（如txt），再通过`from_file()`加载，便于维护：

```python
from langchain_core.prompts import PromptTemplate

# 1. 新建prompt_template.txt文件，写入模板内容：
# 你是一名技术面试官，针对{position}岗位，提出1个{difficulty}难度的面试题，要求包含考察点。

# 2. 从文件加载模板
prompt_template = PromptTemplate.from_file("prompt_template.txt")

# 3. 注入变量
prompt = prompt_template.format(position="Python开发", difficulty="中等")

print(prompt)
```

### 4.2.2 核心注意事项

- 模板中的变量必须用`{变量名}`包裹，且格式要统一（不能混合使用{{变量名}}）；

- format()方法必须传入所有模板变量，否则会报错（可通过`partial_format()`方法部分注入变量，后续补充）；

- PromptTemplate生成的是纯文本，可直接传递给LLM的invoke()方法，或作为ChatModel消息的content。

### 4.2.3 实战小技巧：partial_format() 部分变量注入

当模板中有多个变量，且部分变量固定（如“角色设定”）、部分变量动态（如“用户问题”）时，可使用`partial_format()`先注入固定变量，生成新的模板，后续只需注入动态变量：

```python
from langchain_core.prompts import PromptTemplate

# 模板：包含固定变量（role）和动态变量（question）
template = "你是{role}，请回答用户问题：{question}，要求简洁易懂。"
prompt_template = PromptTemplate.from_template(template)

# 先注入固定变量（role），生成新模板
partial_template = prompt_template.partial_format(role="LangChain开发助手")

# 后续只需注入动态变量（question）
prompt1 = partial_template.format(question="什么是PromptTemplate？")
prompt2 = partial_template.format(question="如何创建PromptTemplate？")

print("prompt1：", prompt1)
print("prompt2：", prompt2)
```

## 4.3 ChatPromptTemplate 与多轮对话结构

上一节的PromptTemplate适用于“纯文本提示”，而ChatModel的交互是“消息列表”（SystemMessage、HumanMessage、AIMessage），因此LangChain提供了`ChatPromptTemplate`——专门用于构建**多轮对话提示模板**，适配ChatModel的交互格式。

核心区别：PromptTemplate生成纯文本，ChatPromptTemplate生成消息列表（可直接传递给ChatModel的invoke()方法）。

### 4.3.1 核心用法：创建多轮对话模板

ChatPromptTemplate由多个`ChatMessageTemplate`组成，每个ChatMessageTemplate对应一种消息类型（System、Human、AI），示例如下：

```python
from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义各消息类型的模板
# 系统消息模板（固定角色设定）
system_template = "你是{role}，回答用户问题时，需包含1个简单代码示例，简洁明了。"
system_message_prompt = SystemMessagePromptTemplate.from_template(system_template)

# 用户消息模板（动态用户问题）
human_template = "用户问题：{question}"
human_message_prompt = HumanMessagePromptTemplate.from_template(human_template)

# 2. 组合成ChatPromptTemplate（多轮对话结构）
chat_prompt_template = ChatPromptTemplate.from_messages([
    system_message_prompt,  # 系统消息（第1条）
    human_message_prompt    # 用户消息（第2条）
])

# 3. 注入变量，生成消息列表
messages = chat_prompt_template.format_messages(
    role="LangChain开发助手",
    question="如何使用ChatPromptTemplate？"
)

# 4. 调用ChatModel（直接传入生成的消息列表）
chat_model = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

response = chat_model.invoke(messages)
print("模型响应：", response.content)
```

代码来源：LangChain ChatPromptTemplate官方示例（[https://python.langchain.com/docs/langchain-core/prompts/chat_prompt_template](https://python.langchain.com/docs/langchain-core/prompts/chat_prompt_template)）；运行后可看到，生成的messages是包含SystemMessage和HumanMessage的列表，可直接传递给ChatModel。

### 4.3.2 简化写法：from_template() 快速创建

对于简单的多轮对话模板，可使用`ChatPromptTemplate.from_template()`快速创建，无需单独定义每个ChatMessageTemplate：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 简化写法：用列表定义消息类型和模板，格式：["消息类型: 模板内容"]
chat_prompt_template = ChatPromptTemplate.from_template([
    "system: 你是{role}，回答简洁，不超过2句话。",
    "human: 用户问题：{question}"
])

# 生成消息列表
messages = chat_prompt_template.format_messages(
    role="LangChain助手",
    question="ChatPromptTemplate和PromptTemplate的区别是什么？"
)

# 调用模型
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
print(chat_model.invoke(messages).content)
```

说明：消息类型支持3种简写：`system`、`human`、`ai`，分别对应SystemMessage、HumanMessage、AIMessage。

### 4.3.3 多轮对话扩展（包含AI消息）

ChatPromptTemplate支持包含AI消息模板，用于构建复杂的多轮对话场景（如历史对话复用）：

```python
from langchain_core.prompts import ChatPromptTemplate

# 多轮对话模板：系统消息→用户消息→AI消息→新用户消息
chat_prompt_template = ChatPromptTemplate.from_template([
    "system: 你是数学老师，回答问题时步骤清晰。",
    "human: {question1}",
    "ai: {answer1}",
    "human: {question2}"
])

# 注入变量，生成完整消息列表
messages = chat_prompt_template.format_messages(
    question1="1+1等于多少？",
    answer1="1+1=2，因为两个1相加的结果是2。",
    question2="那2+3等于多少？"
)

for msg in messages:
    print(f"【{msg.type}】: {msg.content}")
```

运行结果可看到完整的多轮对话消息结构，适合需要复用历史对话的场景（如聊天机器人）。

## 4.4 动态变量注入与格式化（f-string 替代方案）

提示模板的核心功能是“动态变量注入”——将用户输入、业务数据等动态内容，替换到模板的变量中，生成完整提示。很多新手会用f-string拼接提示，但LangChain的模板格式化功能更强大、更安全，是f-string的完美替代方案。

### 4.4.1 核心优势：模板格式化 vs f-string

| 对比维度     | LangChain模板格式化                        | f-string 拼接                        |
| ------------ | ------------------------------------------ | ------------------------------------ |
| 变量校验     | 自动校验变量是否齐全，缺失时报错，避免遗漏 | 无校验，变量缺失时抛出异常，不易排查 |
| 复杂场景支持 | 支持部分注入、条件格式化、列表格式化       | 需手动处理复杂逻辑，代码繁琐         |
| 可维护性     | 模板与代码分离，便于修改和复用             | 提示与代码混合，修改繁琐             |
| 安全性       | 自动转义特殊字符，避免注入风险             | 需手动处理特殊字符，存在注入风险     |

### 4.4.2 常用格式化技巧（实战必备）

#### 1. 列表变量格式化（批量注入多个值）

当变量是列表（如多个产品、多个问题）时，模板可自动将列表格式化为自然语言，无需手动循环拼接：

```python
from langchain_core.prompts import PromptTemplate

# 模板：包含列表变量{products}
template = "请为以下产品各写一句宣传语：{products}，要求每句不超过10字。"
prompt_template = PromptTemplate.from_template(template)

# 注入列表变量
prompt = prompt_template.format(
    products=["LangChain教程", "Python实战", "AI提示工程"]
)

print(prompt)
```

运行结果：`请为以下产品各写一句宣传语：LangChain教程、Python实战、AI提示工程，要求每句不超过10字。`

#### 2. 条件格式化（根据变量值动态调整提示）

通过`if-else`语法，根据变量值动态调整提示内容，适配不同场景：

```python
from langchain_core.prompts import PromptTemplate

# 模板：条件格式化（根据{difficulty}调整提示）
template = """
你是一名出题老师，为{subject}学科出题：
{% if difficulty == '简单' %}
出3道基础题，侧重概念理解。
{% elif difficulty == '中等' %}
出2道中档题，侧重应用能力。
{% else %}
出1道难题，侧重综合能力。
{% endif %}
"""
prompt_template = PromptTemplate.from_template(template)

# 测试不同条件
prompt1 = prompt_template.format(subject="数学", difficulty="简单")
prompt2 = prompt_template.format(subject="语文", difficulty="困难")

print("简单难度：", prompt1)
print("困难难度：", prompt2)
```

#### 3. 特殊字符转义（自动处理）

当变量中包含特殊字符（如{、}、引号）时，模板会自动转义，避免格式化报错，而f-string需要手动处理：

```python
from langchain_core.prompts import PromptTemplate

# 变量中包含特殊字符{ }
template = "用户输入的内容是：{user_input}，请解析其中的关键信息。"
prompt_template = PromptTemplate.from_template(template)

# 注入包含特殊字符的变量
prompt = prompt_template.format(user_input="我喜欢LangChain，它的{PromptTemplate}很实用")

print(prompt)
```

运行结果：`用户输入的内容是：我喜欢LangChain，它的{PromptTemplate}很实用，请解析其中的关键信息。`（模板自动转义，无报错）。

### 4.4.3 实战建议

开发中，无论提示多么简单，都建议使用LangChain的模板格式化，替代f-string拼接——尤其是变量较多、提示较长的场景，能大幅降低出错概率，提升代码可维护性。

## 4.5 少样本提示（Few-shot Prompting）模板设计

少样本提示（Few-shot Prompting）是提示工程的核心技巧之一——通过在提示中加入“少量示例”，让模型快速理解任务要求、输出格式，提升回答的准确性，尤其适合复杂任务（如分类、总结、翻译）。

LangChain的提示模板支持直接嵌入少样本示例，无需额外编写复杂逻辑，下面介绍两种常用的少样本模板设计方式。

### 4.5.1 基础方式：直接嵌入示例（适合少量示例）

将少样本示例直接写入模板，作为固定内容，动态变量仅注入用户输入，适合示例数量少（1~3个）的场景：

```python
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 少样本模板：包含2个示例，动态变量{user_input}
template = """
请将用户输入的文本分类为「正面」「负面」「中性」，示例如下：
示例1：输入：我很喜欢这款产品，体验很好 → 分类：正面
示例2：输入：这款产品质量很差，不推荐 → 分类：负面
用户输入：{user_input} → 分类：
"""
prompt_template = PromptTemplate.from_template(template)

# 注入用户输入
prompt = prompt_template.format(user_input="这款产品中规中矩，没有惊喜也没有失望")

# 调用模型
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.1)
print("分类结果：", chat_model.invoke([{"role": "user", "content": prompt}]).content)
```

代码来源：LangChain少样本提示官方示例（[https://python.langchain.com/docs/langchain-core/prompts/few_shot](https://python.langchain.com/docs/langchain-core/prompts/few_shot)）；运行结果：`中性`，模型通过示例快速理解了分类规则。

### 4.5.2 进阶方式：使用 FewShotPromptTemplate（适合多示例）

当示例数量较多（3个以上）时，可使用`FewShotPromptTemplate`，将“示例列表”和“模板”分离，便于示例的管理和复用：

```python
from langchain_core.prompts import PromptTemplate, FewShotPromptTemplate

# 1. 定义示例列表（可单独维护，便于修改）
examples = [
    {"input": "我很喜欢这款手机，续航超给力", "output": "正面"},
    {"input": "这款手机发热严重，体验很差", "output": "负面"},
    {"input": "这款手机外观一般，价格适中", "output": "中性"},
    {"input": "手机拍照效果不错，但系统有点卡顿", "output": "中性"}
]

# 2. 定义单个示例的模板
example_template = "输入：{input} → 分类：{output}"
example_prompt = PromptTemplate.from_template(example_template)

# 3. 定义少样本模板（组合示例和用户输入模板）
few_shot_prompt = FewShotPromptTemplate(
    examples=examples,  # 示例列表
    example_prompt=example_prompt,  # 单个示例模板
    prefix="请将用户输入的文本分类为「正面」「负面」「中性」，示例如下：",  # 前缀（任务说明）
    suffix="用户输入：{user_input} → 分类：",  # 后缀（用户输入和输出格式）
    input_variables=["user_input"]  # 动态变量
)

# 4. 注入变量，生成提示
prompt = few_shot_prompt.format(user_input="这款手机续航一般，拍照还行")
print("少样本提示：", prompt)
```

运行结果会自动将示例列表格式化后，拼接前缀和后缀，生成完整的少样本提示；后续修改示例时，只需修改examples列表，无需修改模板结构。

### 4.5.3 少样本模板设计技巧（必看）

- 示例要典型：选择覆盖不同场景、不同结果的示例，让模型全面理解任务；

- 示例数量适中：1~5个即可，过多会增加提示长度（消耗tokens），过少则模型无法理解规则；

- 格式统一：所有示例的输入、输出格式保持一致，避免模型混淆；

- 结合系统提示：在模板前缀中加入系统提示，明确任务要求，提升模型表现。

## 4.6 示例选择器（ExampleSelector）自动匹配上下文

上一节的少样本提示，示例是固定的——无论用户输入是什么，都会使用相同的示例。但在实际场景中，不同的用户输入需要匹配不同的示例（如用户输入是“手机续航”，应匹配与续航相关的示例；输入是“拍照”，应匹配与拍照相关的示例）。

LangChain的`ExampleSelector`（示例选择器）可解决这一问题——根据用户输入的上下文，自动从示例列表中选择最相关的示例，注入到提示模板中，让少样本提示更精准、更高效。

### 4.6.1 核心示例选择器：SemanticSimilarityExampleSelector

最常用的示例选择器是`SemanticSimilarityExampleSelector`（语义相似度示例选择器），核心逻辑：将用户输入和示例进行语义嵌入（Embedding），计算相似度，选择相似度最高的N个示例，适合大多数场景。

```python
from langchain_core.prompts import PromptTemplate, FewShotPromptTemplate
from langchain_core.example_selectors import SemanticSimilarityExampleSelector
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义示例列表（包含不同场景的示例）
examples = [
    {"input": "手机续航超给力", "output": "正面"},
    {"input": "手机发热严重", "output": "负面"},
    {"input": "拍照效果不错", "output": "正面"},
    {"input": "系统有点卡顿", "output": "负面"},
    {"input": "价格适中", "output": "中性"}
]

# 2. 定义单个示例模板
example_template = "输入：{input} → 分类：{output}"
example_prompt = PromptTemplate.from_template(example_template)

# 3. 初始化示例选择器（语义相似度）
example_selector = SemanticSimilarityExampleSelector.from_examples(
    examples=examples,  # 示例列表
    embeddings=OpenAIEmbeddings(api_key=os.getenv("OPENAI_API_KEY")),  # 嵌入模型
    vectorstore_cls=Chroma,  # 向量数据库（用于存储示例嵌入）
    k=2  # 选择相似度最高的2个示例
)

# 4. 定义少样本模板（结合示例选择器）
few_shot_prompt = FewShotPromptTemplate(
    example_selector=example_selector,  # 替换固定examples为示例选择器
    example_prompt=example_prompt,
    prefix="请将用户输入的文本分类为「正面」「负面」「中性」，参考相关示例：",
    suffix="用户输入：{user_input} → 分类：",
    input_variables=["user_input"]
)

# 5. 测试：不同用户输入，自动选择不同示例
prompt1 = few_shot_prompt.format(user_input="手机续航很差")
prompt2 = few_shot_prompt.format(user_input="拍照很模糊")

print("=== 用户输入：手机续航很差 ===")
print(prompt1)
print("\n=== 用户输入：拍照很模糊 ===")
print(prompt2)
```

代码来源：LangChain ExampleSelector官方示例（[https://python.langchain.com/docs/langchain-core/example_selectors](https://python.langchain.com/docs/langchain-core/example_selectors)）；运行结果可看到：

- 用户输入“手机续航很差”，自动选择“手机续航超给力”“手机发热严重”两个相关示例；

- 用户输入“拍照很模糊”，自动选择“拍照效果不错”“系统有点卡顿”两个相关示例。

### 4.6.2 其他常用示例选择器

除了语义相似度选择器，LangChain还提供其他示例选择器，适配不同场景：

- **LengthBasedExampleSelector**：根据提示长度选择示例，避免提示过长（适合tokens有限的场景）；

- **RandomExampleSelector**：随机选择示例（适合示例数量多、场景均匀的场景）；

- **NGramOverlapExampleSelector**：根据文本重叠度选择示例（适合短文本场景）。

### 4.6.3 实战建议

示例选择器适合“示例数量多、场景复杂”的少样本提示场景，能大幅提升提示的精准度；如果示例数量少（1~2个），直接嵌入示例即可，无需使用示例选择器（避免过度复杂）。

## 4.7 提示模板的序列化与版本管理

在实际项目开发中，提示模板会不断迭代优化（如修改示例、调整提示格式），需要进行**版本管理**；同时，为了便于团队协作、部署上线，需要将模板**序列化**（保存为文件），后续可直接加载使用，无需重新定义。

LangChain支持多种序列化格式（JSON、YAML），操作简单，可直接集成到项目的版本管理（如Git）中。

### 4.7.1 模板序列化（保存为文件）

LangChain的提示模板（PromptTemplate、ChatPromptTemplate、FewShotPromptTemplate）均支持`save()`方法，可将模板保存为JSON或YAML文件，示例如下：

```python
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate

# 1. 序列化PromptTemplate（保存为JSON）
prompt_template = PromptTemplate.from_template(
    "你是{role}，请回答用户问题：{question}，要求简洁明了。"
)
# 保存为JSON文件
prompt_template.save("prompt_template.json")

# 2. 序列化ChatPromptTemplate（保存为YAML）
chat_prompt_template = ChatPromptTemplate.from_template([
    "system: 你是{role}，回答包含代码示例。",
    "human: {question}"
])
# 保存为YAML文件（推荐，格式更简洁）
chat_prompt_template.save("chat_prompt_template.yaml")
```

保存后，会生成对应的JSON/YAML文件，文件中包含模板的所有信息（模板内容、变量、类型等），可直接用于团队共享或部署。

### 4.7.2 模板反序列化（从文件加载）

通过`load_prompt()`方法，可从JSON/YAML文件中加载模板，无需重新定义，示例如下：

```python
from langchain_core.prompts import load_prompt

# 1. 加载JSON格式的PromptTemplate
loaded_prompt = load_prompt("prompt_template.json")
# 注入变量使用
prompt = loaded_prompt.format(role="LangChain助手", question="什么是模板序列化？")
print("加载的PromptTemplate：", prompt)

# 2. 加载YAML格式的ChatPromptTemplate
loaded_chat_prompt = load_prompt("chat_prompt_template.yaml")
messages = loaded_chat_prompt.format_messages(role="开发助手", question="如何加载模板？")
print("\n加载的ChatPromptTemplate：")
for msg in messages:
    print(f"【{msg.type}】: {msg.content}")
```

代码来源：LangChain模板序列化官方文档（[https://python.langchain.com/docs/langchain-core/prompts/serialization](https://python.langchain.com/docs/langchain-core/prompts/serialization)）；注意：加载时无需指定文件格式，LangChain会自动识别JSON/YAML。

### 4.7.3 版本管理建议

结合Git进行模板版本管理，核心步骤：

1. 将序列化后的模板文件（JSON/YAML）纳入Git管理；

2. 每次修改模板后，提交代码时添加清晰的备注（如“优化客服话术模板，增加示例”）；

3. 如需回滚到历史版本，直接从Git中拉取对应版本的模板文件，重新加载即可；

4. 团队协作时，统一模板文件路径，避免重复创建，确保所有人使用相同版本的模板。

## 4.8 【实战】构建可复用的客服话术模板库

本节通过一个完整实战案例，整合本章所学知识点——构建一个“可复用的客服话术模板库”，支持多场景（订单查询、售后投诉、产品咨询）话术模板，实现模板序列化、动态变量注入、少样本提示，适配实际客服场景，可直接复用或扩展。

### 4.8.1 实战需求

- 构建3个核心客服场景的话术模板：订单查询、售后投诉、产品咨询；

- 每个模板支持动态变量注入（如订单号、用户名、产品名称、问题描述）；

- 订单查询、售后投诉模板加入少样本提示，确保话术格式统一；

- 将所有模板序列化保存，支持加载复用；

- 提供统一的模板调用接口，根据场景切换模板。

### 4.8.2 实战准备

- 激活虚拟环境，安装所需依赖：
  `pip install langchain-core==0.1.33 langchain-community==0.1.13 langchain-openai==0.1.6 python-dotenv==1.0.1 pyyaml==6.0.1`

- 配置.env文件（添加OpenAI API密钥，用于少样本提示和嵌入）：
  `OPENAI_API_KEY=你的OpenAI API密钥`

### 4.8.3 完整实战代码

```python
"""
实战：构建可复用的客服话术模板库
代码来源：LangChain官方示例改编（https://python.langchain.com/docs/langchain-core/prompts）
功能：支持订单查询、售后投诉、产品咨询3个场景，模板序列化、少样本提示、动态变量注入
"""
from langchain_core.prompts import (
    PromptTemplate,
    FewShotPromptTemplate,
    ChatPromptTemplate,
    load_prompt
)
from langchain_core.example_selectors import SemanticSimilarityExampleSelector
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from dotenv import load_dotenv
import os

# 1. 加载环境变量
load_dotenv()

# 2. 定义模板库（3个客服场景）
class CustomerServicePromptLibrary:
    def __init__(self):
        # 初始化嵌入模型（用于示例选择器）
        self.embeddings = OpenAIEmbeddings(api_key=os.getenv("OPENAI_API_KEY"))
        # 加载/创建模板
        self.templates = self._load_or_create_templates()

    def _load_or_create_templates(self):
        """加载已序列化的模板，若不存在则创建并保存"""
        templates = {}
        template_paths = {
            "order_query": "templates/order_query.yaml",
            "after_sales": "templates/after_sales.yaml",
            "product_consult": "templates/product_consult.yaml"
        }

        # 创建templates目录（若不存在）
        os.makedirs("templates", exist_ok=True)

        # 1. 订单查询模板（少样本提示）
        if not os.path.exists(template_paths["order_query"]):
            # 示例列表
            order_examples = [
                {"username": "张三", "order_id": "123456", "response": "张三您好，您的订单123456当前状态为：已发货，预计明天送达，如有疑问请随时联系我们。"},
                {"username": "李四", "order_id": "654321", "response": "李四您好，您的订单654321当前状态为：待付款，请及时付款，避免订单取消。"}
            ]
            # 示例模板
            example_template = "用户名：{username}，订单号：{order_id} → 回复：{response}"
            example_prompt = PromptTemplate.from_template(example_template)
            # 少样本模板
            order_prompt = FewShotPromptTemplate(
                examples=order_examples,
                example_prompt=example_prompt,
                prefix="你是客服，回复订单查询时，语气亲切，包含用户名、订单号和订单状态，示例如下：",
                suffix="用户名：{username}，订单号：{order_id}，订单状态：{status} → 回复：",
                input_variables=["username", "order_id", "status"]
            )
            # 序列化保存
            order_prompt.save(template_paths["order_query"])
            templates["order_query"] = order_prompt
        else:
            # 加载已保存的模板
            templates["order_query"] = load_prompt(template_paths["order_query"])

        # 2. 售后投诉模板（少样本+示例选择器）
        if not os.path.exists(template_paths["after_sales"]):
            after_sales_examples = [
                {"username": "王五", "complaint": "产品质量问题", "response": "王五您好，非常抱歉给您带来不好的体验，关于产品质量问题，我们将为您安排退货退款，预计1-3个工作日到账。"},
                {"username": "赵六", "complaint": "物流延迟", "response": "赵六您好，非常抱歉物流延迟给您带来不便，我们已联系物流方催促，预计今天内送达，后续将为您补偿5元优惠券。"}
            ]
            # 示例选择器（根据投诉内容选择相关示例）
            example_selector = SemanticSimilarityExampleSelector.from_examples(
                examples=after_sales_examples,
                embeddings=self.embeddings,
                vectorstore_cls=Chroma,
                k=1
            )
            # 少样本模板
            after_sales_prompt = FewShotPromptTemplate(
                example_selector=example_selector,
                example_prompt=PromptTemplate.from_template("用户名：{username}，投诉：{complaint} → 回复：{response}"),
                prefix="你是客服，回复售后投诉时，先道歉，再给出具体解决方案，语气诚恳，示例如下：",
                suffix="用户名：{username}，投诉：{complaint} → 回复：",
                input_variables=["username", "complaint"]
            )
            after_sales_prompt.save(template_paths["after_sales"])
            templates["after_sales"] = after_sales_prompt
        else:
            templates["after_sales"] = load_prompt(template_paths["after_sales"])

        # 3. 产品咨询模板（简单动态模板）
        if not os.path.exists(template_paths["product_consult"]):
            product_prompt = PromptTemplate.from_template(
                "你是客服，用户{username}咨询{product}的{question}，请简洁明了回答，语气亲切，不超过3句话。"
            )
            product_prompt.save(template_paths["product_consult"])
            templates["product_consult"] = product_prompt
        else:
            templates["product_consult"] = load_prompt(template_paths["product_consult"])

        return templates

    def get_prompt(self, scene, **kwargs):
        """
        获取指定场景的话术提示
        scene: 场景名称（order_query/after_sales/product_consult）
        kwargs: 动态变量（如username、order_id等）
        """
        if scene not in self.templates:
            raise ValueError(f"不支持的场景：{scene}，可选场景：order_query、after_sales、product_consult")

        prompt_template = self.templates[scene]
        # 根据模板类型，生成提示（FewShotPromptTemplate和PromptTemplate均支持format）
        return prompt_template.format(**kwargs)

# 3. 实战测试
if __name__ == "__main__":
    # 初始化模板库
    prompt_library = CustomerServicePromptLibrary()

    # 测试1：订单查询场景
    order_prompt = prompt_library.get_prompt(
        scene="order_query",
        username="张三",
        order_id="789012",
        status="已签收"
    )
    print("=== 订单查询话术 ===")
    print(order_prompt)

    # 测试2：售后投诉场景（自动选择相关示例）
    after_sales_prompt = prompt_library.get_prompt(
        scene="after_sales",
        username="孙七",
        complaint="产品收到后有破损"
    )
    print("\n=== 售后投诉话术 ===")
    print(after_sales_prompt)

    # 测试3：产品咨询场景
    product_prompt = prompt_library.get_prompt(
        scene="product_consult",
        username="周八",
        product="LangChain教程",
        question="教程是否包含实战代码？"
    )
    print("\n=== 产品咨询话术 ===")
    print(product_prompt)
```

### 4.8.4 实战解读与扩展

#### 1. 核心功能解读

- **模板库封装**：通过`CustomerServicePromptLibrary`类，统一管理所有客服模板，提供`get_prompt()`方法，根据场景快速获取话术；

- **序列化与加载**：首次运行时创建模板并保存到templates目录，后续运行直接加载，避免重复定义；

- **少样本与示例选择器**：订单查询模板使用固定少样本，售后投诉模板使用语义相似度示例选择器，根据投诉内容自动匹配相关示例；

- **动态变量注入**：支持传入不同场景所需的变量（如订单号、投诉内容、产品名称），灵活生成话术。

#### 2. 扩展方向

- 新增场景：如“会员咨询”“物流查询”，只需在`_load_or_create_templates()`中添加对应模板；

- 优化示例：根据实际客服话术，补充更多示例，提升话术质量；

- 对接ChatModel：将生成的话术提示传递给ChatModel，自动生成最终的客服回复；

- 模板版本管理：结合Git，对templates目录下的模板文件进行版本控制，便于迭代优化。

## 本章小结

本章我们全面学习了LangChain提示工程的基础——Prompt Templates，从模板的核心概念、基础用法，到多轮对话模板、少样本提示、示例选择器，再到模板的序列化与实战落地，掌握了可复用、标准化提示的构建方法。

核心要点回顾：

- PromptTemplate适用于静态纯文本提示，ChatPromptTemplate适用于多轮对话消息列表，按需选择；

- 模板格式化是f-string的完美替代方案，支持变量校验、条件格式化、特殊字符转义，更安全、更易维护；

- 少样本提示通过加入示例，让模型快速理解任务要求，FewShotPromptTemplate适合多示例场景；

- ExampleSelector可根据用户输入自动匹配相关示例，提升少样本提示的精准度；

- 模板序列化（JSON/YAML）便于团队协作和版本管理，是项目开发的必备技巧；

- 实战中，可通过封装模板库，实现多场景模板的统一管理和复用，提升开发效率。

提示模板是提示工程的基础，下一章我们将学习LangChain的核心功能——Chains（链式调用），将Prompt Templates、Models、Messages结合起来，实现更复杂的大模型应用。
