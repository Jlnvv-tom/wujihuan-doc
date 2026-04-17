# 第6章 链（Chains）：构建可组合的工作流

在前两章中，我们分别掌握了Prompt Templates（提示模板）和OutputParser（输出解析）——通过提示模板标准化模型输入，通过输出解析器将模型输出转换为结构化数据。但在实际开发中，大模型应用往往不是“单一提示→单一输出”的简单流程，而是需要**多步骤联动**（如“输入文本→翻译→总结→情感分析”）、**多组件协同**（提示模板+模型+解析器+工具）。

LangChain的核心优势之一，就是提供了“链（Chains）”这一核心组件，将多个独立的模块（提示模板、模型、解析器、工具等）串联或组合起来，构建可复用、可扩展的自动化工作流。形象地说，Chain就像“流水线”，将复杂的大模型任务拆解为多个简单步骤，每个步骤由一个组件负责，最终协同完成完整任务。

本章将从“链式思维→基础链→复杂链→表达式语言→实战落地”逐步展开，所有代码示例简洁可复制、标注官方来源，帮你彻底掌握Chain的核心用法，学会用链式思维构建复杂大模型应用，摆脱“单一调用”的局限。

## 6.1 什么是 Chain？链式思维的核心

在LangChain中，Chain（链）是一个**可组合的执行流程**，它将多个“执行步骤”（如提示生成、模型调用、输出解析、数据处理）按一定逻辑串联起来，接收输入、依次执行每个步骤，最终输出结果。其核心价值在于“解耦与组合”——将复杂任务拆解为独立模块，再根据需求灵活组合，提升代码的可复用性和可维护性。

### 6.1.1 为什么需要 Chain？单一调用的弊端

在学习Chain之前，我们先思考一个问题：为什么不能直接多次调用模型，而是要使用Chain？举个例子：要实现“将英文文本翻译为中文→总结中文文本→分析总结的情感倾向”，单一调用的做法是：

1. 手动编写翻译提示，调用模型得到中文翻译结果；

2. 手动将翻译结果作为输入，编写总结提示，调用模型得到总结；

3. 手动将总结作为输入，编写情感分析提示，调用模型得到情感结果；

4. 手动处理每个步骤的输入输出，若其中一个步骤修改，需同步修改后续所有步骤。

这种方式存在3个核心弊端：

- **代码冗余**：重复编写模型调用、提示拼接逻辑，代码量庞大且难以维护；

- **耦合度高**：每个步骤的输入依赖上一个步骤的输出，修改一个步骤会影响整个流程；

- **不可复用**：整个流程无法封装复用，若其他场景需要类似流程，需重新编写所有代码。

而Chain恰好能解决这些问题——将多个步骤封装为一个可复用的链，调用链时只需传入初始输入，链会自动完成所有步骤的执行和数据传递，无需手动干预。

### 6.1.2 链式思维的核心：拆解与组合

Chain的本质是“链式思维”，核心逻辑分为两步：

1. **拆解**：将复杂任务拆解为多个独立的、简单的子任务（每个子任务可由一个组件完成，如提示生成、模型调用、解析）；

2. **组合**：将子任务按逻辑顺序组合起来，形成一条完整的执行链，子任务之间自动传递数据（上一个步骤的输出作为下一个步骤的输入）。

举个通俗的例子：做一道“番茄炒蛋”，可拆解为“洗番茄→切番茄→打鸡蛋→炒鸡蛋→炒番茄→混合翻炒→出锅”7个步骤，每个步骤对应一个“组件”，将这些步骤按顺序组合起来，就形成了一条“番茄炒蛋链”，执行这条链就能自动完成番茄炒蛋。

在LangChain中，这条“链”可以封装、复用、修改——比如修改“炒鸡蛋”的步骤（加葱花），只需修改对应组件，不影响其他步骤；若需要做“番茄炒蛋盖饭”，只需在原有链的基础上，增加“煮米饭→盖饭”两个步骤即可。

### 6.1.3 Chain 的核心组成与分类

LangChain中的所有Chain，都由以下两个核心部分组成：

- **步骤（Steps）**：每个步骤是一个独立的执行单元，可是PromptTemplate、LLM/ChatModel、OutputParser、其他Chain，甚至是外部工具（如数据库、API）；

- **数据传递**：自动将上一个步骤的输出，作为下一个步骤的输入，无需手动传递数据（可通过“输出键”控制传递的内容）。

根据执行逻辑和场景，LangChain中的Chain主要分为以下5类（本章重点讲解前5类，实战部分综合运用）：

- `LLMChain`：最简单的链，仅包含“提示模板+模型”（可选输出解析），适合单一步骤的任务；

- `SequentialChain`：多步骤串行执行，上一个步骤的输出作为下一个步骤的输入，适合线性流程；

- `TransformChain`：专门用于数据预处理或后处理（如文本清洗、格式转换），不调用模型，仅处理数据；

- `RouterChain`：条件分支链，根据输入内容动态选择执行不同的子链，适合多场景、多规则的任务；

- `LCEL`：LangChain表达式语言，一种简洁的语法，用于快速构建和组合链，替代传统的Chain类（LangChain v0.1+推荐用法）。

## 6.2 LLMChain：最简单的调用链

`LLMChain`是LangChain中最基础、最简单的链，核心作用是将“PromptTemplate（提示模板）”和“LLM/ChatModel（模型）”整合为一个可复用的单元，可选搭配OutputParser（输出解析器），实现“提示生成→模型调用→输出解析”的一站式执行。

核心场景：单一步骤的任务（如文本生成、简单问答、格式转换），无需多步骤联动，适合作为复杂链的“子链”。

### 6.2.1 基础用法：整合提示模板与模型

步骤：初始化PromptTemplate、LLM/ChatModel，再用LLMChain整合，调用链即可自动完成提示生成和模型调用。

```python
from langchain.chains import LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化提示模板
prompt = PromptTemplate(
    template="请为{product}撰写一句宣传语，突出{feature}优势，简洁有力（不超过15字）。",
    input_variables=["product", "feature"]
)

# 2. 初始化模型
chat_model = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

# 3. 构建LLMChain（整合提示模板和模型）
llm_chain = LLMChain(
    llm=chat_model,
    prompt=prompt,
    verbose=True  # 开启日志，查看链的执行过程（可选，便于调试）
)

# 4. 调用链（传入输入变量）
result = llm_chain.invoke({"product": "LangChain教程", "feature": "实战导向"})

print("宣传语：", result["text"])
```

代码来源：LangChain LLMChain官方示例（[https://python.langchain.com/docs/langchain-core/chains/llm_chain](https://python.langchain.com/docs/langchain-core/chains/llm_chain)）；

运行结果：`宣传语：LangChain实战教程，上手即会！`

说明：调用llm_chain.invoke()时，只需传入提示模板所需的变量，链会自动生成提示、调用模型，返回结果（默认存在"text"键中，对应模型的原始输出）。

### 6.2.2 进阶用法：搭配 OutputParser 解析输出

在LLMChain中加入OutputParser，可实现“提示→模型→解析”的一站式执行，无需手动调用解析器，示例如下（结合PydanticOutputParser实现强类型解析）：

```python
from langchain.chains import LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field

load_dotenv()

# 1. 定义Pydantic模型（用于输出解析）
class AdCopy(BaseModel):
    copy: str = Field(description="宣传语，不超过15字")
    feature: str = Field(description="突出的产品优势")

# 2. 初始化解析器、提示模板、模型
parser = PydanticOutputParser(pydantic_object=AdCopy)
prompt = PromptTemplate(
    template="为{product}撰写宣传语，突出{feature}优势（不超过15字），按要求输出：\n{format_instructions}",
    input_variables=["product", "feature"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.7)

# 3. 构建LLMChain（整合提示、模型、解析器）
llm_chain = LLMChain(
    llm=chat_model,
    prompt=prompt,
    output_parser=parser,
    verbose=True
)

# 4. 调用链，自动解析
result = llm_chain.invoke({"product": "LangChain教程", "feature": "通俗易懂"})

print("解析后的宣传语：", result.copy)
print("突出优势：", result.feature)
```

运行结果：
解析后的宣传语： 通俗易懂，LangChain轻松学！
突出优势： 通俗易懂

说明：加入output_parser后，链的返回结果不再是字典，而是Pydantic模型实例，可直接通过“对象.字段”访问解析后的数据，更简洁、更安全。

### 6.2.3 核心参数与实用技巧

- **verbose**：布尔值，默认False，开启后会打印链的执行日志（提示内容、模型调用信息），便于调试；

- **output_key**：字符串，默认"text"，用于指定模型输出在结果字典中的键名（若未使用解析器）；

- **复用技巧**：可将常用的LLMChain封装为函数，后续直接调用，比如封装一个“宣传语生成链”，适配不同产品；

- **注意事项**：LLMChain仅适用于单一步骤，若需要多步骤联动，需使用后续讲解的SequentialChain或LCEL。

## 6.3 SequentialChain：多步骤串行处理

`SequentialChain`（顺序链）是最常用的复杂链之一，核心逻辑是“**多步骤串行执行**”——将多个LLMChain（或其他Chain）按顺序串联，上一个链的输出作为下一个链的输入，形成线性的执行流程，适合需要多步骤联动的任务（如“翻译→总结→情感分析”“关键词提取→文本生成→格式解析”）。

根据输入输出的传递方式，SequentialChain分为两种：

- **SimpleSequentialChain**：最简单的顺序链，上一个链的输出直接作为下一个链的输入（仅支持单一输入、单一输出）；

- **SequentialChain**：通用顺序链，支持多个输入、多个输出，可通过“输出键”控制数据传递（更灵活，推荐使用）。

### 6.3.1 SimpleSequentialChain（简单顺序链）

适用场景：多步骤联动，且每个步骤只有一个输入、一个输出，上一个步骤的输出直接作为下一个步骤的输入。

```python
from langchain.chains import LLMChain, SimpleSequentialChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 步骤1：翻译链（英文→中文）
translate_prompt = PromptTemplate(
    template="将以下英文文本翻译为中文，保持原意，简洁流畅：{text}",
    input_variables=["text"]
)
translate_chain = LLMChain(llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")), prompt=translate_prompt)

# 步骤2：总结链（总结中文文本）
summary_prompt = PromptTemplate(
    template="总结以下中文文本，不超过30字：{text}",
    input_variables=["text"]
)
summary_chain = LLMChain(llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")), prompt=summary_prompt)

# 构建简单顺序链（串联两个步骤）
simple_sequential_chain = SimpleSequentialChain(
    chains=[translate_chain, summary_chain],
    verbose=True
)

# 调用链（仅传入初始输入text）
result = simple_sequential_chain.invoke("LangChain is a framework for building LLM applications.")

print("最终结果（总结）：", result)
```

代码来源：LangChain SimpleSequentialChain官方示例（[https://python.langchain.com/docs/langchain-core/chains/sequential_chain#simplesequentialchain](https://python.langchain.com/docs/langchain-core/chains/sequential_chain#simplesequentialchain)）；

运行流程：

1. 初始输入（英文）→ 翻译链 → 输出中文翻译；
2. 翻译链的输出 → 总结链 → 输出总结结果；
   运行结果：`最终结果（总结）： LangChain是一个用于构建大语言模型应用的框架。`

### 6.3.2 SequentialChain（通用顺序链）

适用场景：多步骤联动，且存在多个输入、多个输出，需要灵活控制数据传递（比如某个步骤的输入需要初始输入+上一个步骤的输出）。

```python
from langchain.chains import LLMChain, SequentialChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 步骤1：翻译链（英文→中文）
translate_prompt = PromptTemplate(
    template="将英文文本「{english_text}」翻译为中文，目标语言：{target_language}",
    input_variables=["english_text", "target_language"]
)
translate_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=translate_prompt,
    output_key="chinese_text"  # 定义输出键，用于传递给下一个链
)

# 步骤2：总结链（总结中文文本，结合用户要求）
summary_prompt = PromptTemplate(
    template="根据用户要求「{summary_requirement}」，总结中文文本「{chinese_text}」",
    input_variables=["summary_requirement", "chinese_text"]  # 输入：用户要求+上一个链的输出
)
summary_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=summary_prompt,
    output_key="summary"
)

# 构建通用顺序链
sequential_chain = SequentialChain(
    chains=[translate_chain, summary_chain],
    input_variables=["english_text", "target_language", "summary_requirement"],  # 初始输入
    output_variables=["chinese_text", "summary"],  # 最终输出（可返回中间结果）
    verbose=True
)

# 调用链（传入所有初始输入）
result = sequential_chain.invoke({
    "english_text": "LangChain provides tools for building complex LLM applications.",
    "target_language": "中文",
    "summary_requirement": "简洁明了，不超过20字"
})

print("中文翻译：", result["chinese_text"])
print("总结结果：", result["summary"])
```

运行结果：
中文翻译： LangChain提供了构建复杂大语言模型应用的工具。
总结结果： LangChain提供构建复杂LLM应用的工具。

说明：通过output_key定义每个链的输出名称，input_variables指定每个链的输入来源（初始输入或上一个链的输出），实现灵活的数据传递，且可返回中间结果（如本例中的中文翻译），便于调试和后续处理。

### 6.3.3 实战技巧与注意事项

- **步骤拆解原则**：每个步骤尽量单一、独立，比如“翻译”“总结”“解析”分开，便于修改和复用；

- **输出键命名规范**：输出键（output_key）尽量清晰（如"chinese_text"、"summary"），避免重名，便于后续调用；

- **中间结果复用**：若后续步骤需要使用某个中间结果（如翻译后的文本），可将其加入output_variables，便于获取；

- **异常处理**：可在每个链中加入异常捕获逻辑，避免一个步骤失败导致整个链崩溃。

## 6.4 TransformChain：数据预处理与后处理

前面讲解的LLMChain、SequentialChain，核心是“调用模型”，而实际开发中，我们常常需要对数据进行**预处理**（如文本清洗、格式转换、关键词提取）或**后处理**（如结果格式化、数据过滤），这些操作无需调用模型，仅需处理数据。

LangChain的`TransformChain`（转换链）专门用于这类场景——它不调用任何模型，仅接收输入数据，通过自定义函数对数据进行转换，输出处理后的数据，常作为SequentialChain的“前置步骤”（预处理）或“后置步骤”（后处理）。

### 6.4.1 核心用法：自定义数据转换函数

TransformChain的核心是“自定义转换函数”——只需定义一个接收输入字典、返回输出字典的函数，即可构建转换链，示例如下（文本预处理：去除多余空格、换行，统一大小写）：

```python
from langchain.chains import TransformChain, SequentialChain, LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义数据预处理函数（TransformChain的核心）
def text_preprocess(inputs: dict) -> dict:
    """文本预处理：去除多余空格、换行，统一为小写"""
    text = inputs["raw_text"]
    # 处理逻辑
    processed_text = text.strip().replace("\n", " ").replace("  ", " ").lower()
    return {"processed_text": processed_text}

# 2. 构建TransformChain（预处理链）
preprocess_chain = TransformChain(
    input_variables=["raw_text"],  # 输入键
    output_variables=["processed_text"],  # 输出键
    transform=text_preprocess  # 自定义转换函数
)

# 3. 构建LLMChain（文本总结）
summary_prompt = PromptTemplate(
    template="总结以下文本：{processed_text}",
    input_variables=["processed_text"]
)
summary_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=summary_prompt,
    output_key="summary"
)

# 4. 串联预处理链和总结链
sequential_chain = SequentialChain(
    chains=[preprocess_chain, summary_chain],
    input_variables=["raw_text"],
    output_variables=["processed_text", "summary"],
    verbose=True
)

# 测试：原始文本（含多余空格、换行、大写）
raw_text = """
  LangChain IS a framework for building LLM applications.
  It provides tools for prompt engineering, output parsing, and chains.
"""
result = sequential_chain.invoke({"raw_text": raw_text})

print("原始文本：", raw_text)
print("预处理后：", result["processed_text"])
print("总结结果：", result["summary"])
```

代码来源：LangChain TransformChain官方示例（[https://python.langchain.com/docs/langchain-core/chains/transform_chain](https://python.langchain.com/docs/langchain-core/chains/transform_chain)）；

运行结果：
预处理后： langchain is a framework for building llm applications. it provides tools for prompt engineering, output parsing, and chains.
总结结果： LangChain是一个用于构建大语言模型应用的框架，提供提示工程、输出解析和链等工具。

### 6.4.2 进阶用法：后处理与数据过滤

TransformChain也可作为后处理步骤，对模型输出的结果进行过滤、格式化，示例如下（过滤总结结果中的冗余词汇，调整格式）：

```python
from langchain.chains import TransformChain, SequentialChain, LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 步骤1：总结链（生成总结）
summary_prompt = PromptTemplate(
    template="总结以下文本：{text}",
    input_variables=["text"]
)
summary_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=summary_prompt,
    output_key="raw_summary"
)

# 步骤2：后处理链（过滤冗余词汇、调整格式）
def summary_postprocess(inputs: dict) -> dict:
    """后处理：去除冗余词汇（如“总的来说”“综上所述”），首字母大写"""
    raw_summary = inputs["raw_summary"]
    redundant_words = ["总的来说", "综上所述", "总而言之"]
    for word in redundant_words:
        raw_summary = raw_summary.replace(word, "")
    # 首字母大写，句末加句号
    processed_summary = raw_summary.strip().capitalize() + "."
    return {"processed_summary": processed_summary}

postprocess_chain = TransformChain(
    input_variables=["raw_summary"],
    output_variables=["processed_summary"],
    transform=summary_postprocess
)

# 串联链
sequential_chain = SequentialChain(
    chains=[summary_chain, postprocess_chain],
    input_variables=["text"],
    output_variables=["raw_summary", "processed_summary"],
    verbose=True
)

# 测试
text = "LangChain是一个用于构建大语言模型应用的框架，支持提示模板、输出解析、链式调用等功能，能帮助开发者快速构建复杂的LLM应用。"
result = sequential_chain.invoke({"text": text})

print("原始总结：", result["raw_summary"])
print("后处理后：", result["processed_summary"])
```

运行结果：
原始总结： 总的来说，LangChain是一个支持提示模板、输出解析等功能，能帮助开发者快速构建复杂LLM应用的框架。
后处理后： LangChain是一个支持提示模板、输出解析等功能，能帮助开发者快速构建复杂llm应用的框架.

### 6.4.3 实战场景与选型建议

- **常见预处理场景**：文本清洗（去空格、去换行、去特殊字符）、格式转换（JSON→字符串、字符串→列表）、关键词提取、文本分割；

- **常见后处理场景**：结果过滤（去除冗余内容）、格式美化（调整大小写、加标点）、数据校验（检查结果是否符合要求）；

- **选型建议**：只要涉及“无需调用模型的数据处理”，都建议使用TransformChain，将数据处理与模型调用解耦，提升代码可维护性；

- **技巧**：可将常用的数据处理函数封装为通用函数，搭配TransformChain复用，比如“文本清洗链”“格式转换链”。

## 6.5 RouterChain：条件分支与动态路由

前面讲解的SequentialChain是“线性执行”——无论输入是什么，都按固定顺序执行所有步骤。但在实际场景中，我们常常需要根据**输入内容的不同**，动态选择执行不同的子链，比如：

- 用户输入是“翻译需求”，执行翻译链；

- 用户输入是“总结需求”，执行总结链；

- 用户输入是“情感分析需求”，执行情感分析链。

LangChain的`RouterChain`（路由链）就是为解决这类场景而生——它能根据输入内容，动态判断“应该执行哪个子链”，实现条件分支的自动化执行，就像“路由器”一样，根据输入的“地址”（内容），将请求转发到对应的“子链”。

### 6.5.1 核心组成

RouterChain的核心由两部分组成，缺一不可：

1. **RouterChain（路由链）**：负责分析输入内容，判断应该执行哪个子链，返回子链的“路由键”；

2. **DestinationChains（目标子链）**：多个子链的集合，每个子链对应一个“路由键”，路由链根据路由键选择对应的子链执行。

LangChain提供了两种常用的RouterChain：

- `LLMRouterChain`：通过模型分析输入内容，判断路由方向（最常用，灵活度高）；

- `MultiPromptChain`：简化版的路由链，直接根据输入匹配对应的提示模板和子链（适合简单场景）。

### 6.5.2 实战示例：LLMRouterChain 动态路由

场景：根据用户输入的需求类型，动态选择执行“翻译链”“总结链”“情感分析链”，示例如下：

```python
from langchain.chains import LLMChain, LLMRouterChain, MultiPromptChain
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_core.runnables import RunnableMap
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义目标子链（翻译、总结、情感分析）
# 子链1：翻译链
translate_prompt = PromptTemplate(
    template="将以下文本翻译为{target_language}：{text}",
    input_variables=["text", "target_language"]
)
translate_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=translate_prompt,
    output_key="result"
)

# 子链2：总结链
summary_prompt = PromptTemplate(
    template="总结以下文本，不超过30字：{text}",
    input_variables=["text"]
)
summary_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=summary_prompt,
    output_key="result"
)

# 子链3：情感分析链
sentiment_prompt = PromptTemplate(
    template="分析以下文本的情感倾向（正面/负面/中性），并简要说明原因：{text}",
    input_variables=["text"]
)
sentiment_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=sentiment_prompt,
    output_key="result"
)

# 2. 定义目标子链映射（路由键→子链）
destination_chains = {
    "translate": translate_chain,
    "summary": summary_chain,
    "sentiment": sentiment_chain
}

# 3. 定义路由提示（让模型判断输入属于哪种需求，返回对应的路由键）
router_prompt = ChatPromptTemplate.from_template("""
请分析用户输入的需求类型，只能返回以下路由键中的一个，无需其他任何内容：
- translate：翻译需求（需要将文本翻译成其他语言）
- summary：总结需求（需要总结文本内容）
- sentiment：情感分析需求（需要分析文本情感倾向）

用户输入：{text}
""")

# 4. 构建路由链（LLMRouterChain）
router_chain = LLMRouterChain.from_llm(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt=router_prompt,
    destination_chains=destination_chains,
    verbose=True
)

# 5. 测试不同需求
# 测试1：翻译需求
print("=== 翻译需求 ===")
result1 = router_chain.invoke({"text": "将“LangChain is great”翻译为中文", "target_language": "中文"})
print("结果：", result1["result"])

# 测试2：总结需求
print("\n=== 总结需求 ===")
result2 = router_chain.invoke({"text": "LangChain是一个用于构建大语言模型应用的框架，支持提示模板、输出解析、链式调用等功能。"})
print("结果：", result2["result"])

# 测试3：情感分析需求
print("\n=== 情感分析需求 ===")
result3 = router_chain.invoke({"text": "LangChain使用起来非常方便，极大提升了我的开发效率。"})
print("结果：", result3["result"])
```

代码来源：LangChain LLMRouterChain官方示例（[https://python.langchain.com/docs/langchain-core/chains/router](https://python.langchain.com/docs/langchain-core/chains/router)）；

运行说明：路由链会先分析用户输入的需求类型，返回对应的路由键（如翻译需求返回"translate"），再调用对应的子链执行，实现动态路由。

### 6.5.3 简化用法：MultiPromptChain

对于简单的路由场景（仅根据输入匹配提示模板），可使用`MultiPromptChain`，它将“路由判断+子链调用”简化，无需单独定义路由链，示例如下：

```python
from langchain.chains import MultiPromptChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义不同需求的提示模板
prompt_templates = [
    {
        "name": "translate",
        "description": "用于翻译需求，将文本翻译成其他语言",
        "prompt": PromptTemplate(
            template="将以下文本翻译为{target_language}：{text}",
            input_variables=["text", "target_language"]
        )
    },
    {
        "name": "summary",
        "description": "用于总结需求，总结文本内容",
        "prompt": PromptTemplate(
            template="总结以下文本，不超过30字：{text}",
            input_variables=["text"]
        )
    }
]

# 2. 构建MultiPromptChain
multi_prompt_chain = MultiPromptChain.from_prompts(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    prompt_templates=prompt_templates,
    verbose=True
)

# 测试
result = multi_prompt_chain.invoke({"text": "总结LangChain的核心功能", "target_language": "中文"})
print("结果：", result)
```

说明：MultiPromptChain会根据输入内容，匹配最贴合的提示模板（通过description判断），自动调用对应的子链执行，简化了路由链的配置。

### 6.5.4 实战建议

- **路由提示要清晰**：定义路由提示时，必须明确告知模型“只能返回指定的路由键”，避免模型返回多余内容，导致路由失败；

- **子链职责单一**：每个目标子链只负责一个具体任务，便于维护和扩展（如后续新增“关键词提取”需求，只需新增子链和路由键）；

- **场景适配**：简单场景用MultiPromptChain，复杂场景（多输入、多子链、复杂判断）用LLMRouterChain；

- **异常处理**：可添加“默认子链”，当路由链无法判断需求类型时，执行默认子链（如提示用户“请明确需求类型”）。

## 6.6 使用 LCEL（LangChain Expression Language）重写链

在LangChain v0.1版本之后，官方推荐使用**LCEL（LangChain Expression Language，LangChain表达式语言）**来构建和组合链，替代传统的Chain类（如LLMChain、SequentialChain）。LCEL是一种简洁、灵活的语法，核心优势是“**声明式编程**”——只需描述“输入→处理步骤→输出”的逻辑，无需手动构建Chain类，代码更简洁、更易读、更易扩展。

简单来说，LCEL用“|”（管道符）将多个组件（提示模板、模型、解析器、转换函数等）串联起来，形成一条完整的链，本质上是对传统Chain的简化和优化。

### 6.6.1 LCEL 核心语法与优势

#### 1. 核心语法

LCEL的核心语法是“管道符（|）”，用于串联组件，格式如下：

```python
# 基础格式：输入 → 组件1 → 组件2 → ... → 输出
chain = component1 | component2 | component3
```

支持的组件类型：PromptTemplate、LLM/ChatModel、OutputParser、TransformChain、自定义函数、其他链，甚至是Runnable（LangChain的核心可运行单元）。

#### 2. 核心优势

- **简洁高效**：无需手动构建LLMChain、SequentialChain，用管道符串联即可，代码量大幅减少；

- **灵活组合**：可自由组合任意组件，支持动态调整步骤，比传统Chain更灵活；

- **原生支持异步**：无需额外配置，即可实现异步调用（async invoke），提升性能；

- **官方推荐**：LangChain v0.1+之后，官方文档优先使用LCEL，传统Chain类逐渐被替代。

### 6.6.2 实战示例1：用LCEL重写LLMChain

传统LLMChain的功能（提示模板+模型+解析器），用LCEL可简化为一行代码，示例如下：

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field

load_dotenv()

# 1. 定义Pydantic模型、解析器、提示模板、模型
class AdCopy(BaseModel):
    copy: str = Field(description="宣传语，不超过15字")
    feature: str = Field(description="突出的产品优势")

parser = PydanticOutputParser(pydantic_object=AdCopy)
prompt = PromptTemplate(
    template="为{product}撰写宣传语，突出{feature}优势（不超过15字），按要求输出：\n{format_instructions}",
    input_variables=["product", "feature"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.7)

# 2. 用LCEL构建链（管道符串联）
chain = prompt | chat_model | parser

# 3. 调用链
result = chain.invoke({"product": "LangChain教程", "feature": "实战导向"})

print("宣传语：", result.copy)
print("突出优势：", result.feature)
```

对比传统LLMChain：无需手动构建LLMChain类，用“prompt | chat_model | parser”即可实现相同功能，代码更简洁，逻辑更清晰。

### 6.6.3 实战示例2：用LCEL重写SequentialChain（多步骤串联）

传统SequentialChain的多步骤串联，用LCEL可直接用管道符串联多个组件，示例如下（翻译→总结→情感分析）：

```python
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义各个步骤的组件
# 步骤1：翻译提示+模型
translate_prompt = PromptTemplate(
    template="将以下英文翻译为中文：{text}",
    input_variables=["text"]
)
translate_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5)
translate_chain = translate_prompt | translate_model

# 步骤2：总结提示+模型
summary_prompt = PromptTemplate(
    template="总结以下中文文本，不超过30字：{text}",
    input_variables=["text"]
)
summary_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5)
summary_chain = summary_prompt | summary_model

# 步骤3：情感分析提示+模型
sentiment_prompt = PromptTemplate(
    template="分析以下文本的情感倾向（正面/负面/中性）：{text}",
    input_variables=["text"]
)
sentiment_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5)
sentiment_chain = sentiment_prompt | sentiment_model

# 2. 用LCEL串联多步骤（翻译→总结→情感分析）
# 注意：需要用lambda函数传递上一步的输出作为下一步的输入
full_chain = (
    translate_chain
    | lambda x: {"text": x.content}  # 提取翻译结果，作为总结的输入
    | summary_chain
    | lambda x: {"text": x.content}  # 提取总结结果，作为情感分析的输入
    | sentiment_chain
)

# 3. 调用链
result = full_chain.invoke({"text": "LangChain is a powerful framework that makes LLM development easier."})

print("最终情感分析结果：", result.content)
```

说明：用lambda函数提取上一步的输出（x.content，模型输出的内容），并转换为下一步所需的输入格式，实现多步骤的数据传递，比传统SequentialChain更灵活。

### 6.6.4 实战示例3：LCEL 结合 TransformChain（数据预处理）

LCEL可直接串联TransformChain（或自定义转换函数），实现“预处理→模型调用→解析”的一站式流程，示例如下：

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field

load_dotenv()

# 1. 定义数据预处理函数（替代TransformChain）
def text_preprocess(inputs: dict) -> dict:
    text = inputs["raw_text"]
    processed_text = text.strip().replace("\n", " ").lower()
    return {"text": processed_text}

# 2. 定义解析器、提示模板、模型
class SummaryResult(BaseModel):
    summary: str = Field(description="文本总结，不超过30字")

parser = PydanticOutputParser(pydantic_object=SummaryResult)
prompt = PromptTemplate(
    template="总结以下文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5)

# 3. 用LCEL串联（预处理→提示→模型→解析）
chain = text_preprocess | prompt | chat_model | parser

# 4. 调用链
raw_text = """
  LangChain IS a framework for building LLM applications.
  It provides tools for prompt engineering and output parsing.
"""
result = chain.invoke({"raw_text": raw_text})

print("预处理后文本：", text_preprocess({"raw_text": raw_text})["text"])
print("总结结果：", result.summary)
```

说明：LCEL可直接串联自定义转换函数（如text_preprocess），无需手动构建TransformChain，进一步简化代码。

### 6.6.5 LCEL 核心技巧与注意事项

- **数据传递技巧**：当多个步骤的输入输出键不一致时，用lambda函数转换（如lambda x: {"text": x.content}），确保数据传递正确；

- **组件复用**：可将常用的组件组合（如“提示+模型”）封装为一个变量，后续直接复用，提升代码可维护性；

- **异步调用**：LCEL原生支持异步，用await chain.ainvoke()替代chain.invoke()，提升并发性能；

- **兼容性**：LCEL与传统Chain类完全兼容，可将传统Chain作为组件，用管道符串联；

- **推荐场景**：新开发的LangChain应用，优先使用LCEL；旧应用可逐步迁移到LCEL，提升代码简洁度。

## 6.7 链的嵌套与复用技巧

在实际开发中，复杂的大模型应用往往需要多个链的协同工作——将一个链作为另一个链的“子链”（嵌套），或复用已有的链（避免重复开发），这是提升开发效率、降低代码冗余的关键技巧。

本节将讲解链的嵌套用法和复用技巧，结合前面所学的Chain类和LCEL，实现更灵活、更可维护的链式工作流。

### 6.7.1 链的嵌套：将链作为子链

链的嵌套核心：将一个完整的链（如LLMChain、LCEL链）作为另一个链（如SequentialChain、RouterChain）的步骤，实现“链中链”的结构，适配复杂任务。

示例：构建“预处理→翻译→总结”三步链，其中“翻译→总结”是一个独立的子链，嵌套到完整链中：

```python
from langchain.chains import SequentialChain, LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义子链：翻译→总结（用LCEL简化）
translate_prompt = PromptTemplate(
    template="将英文「{text}」翻译为中文：",
    input_variables=["text"]
)
summary_prompt = PromptTemplate(
    template="总结中文文本「{text}」，不超过30字：",
    input_variables=["text"]
)
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5)

# 子链（LCEL构建）
translate_summary_chain = (
    translate_prompt
    | chat_model
    | lambda x: {"text": x.content}
    | summary_prompt
    | chat_model
)

# 2. 定义预处理链（TransformChain）
def text_preprocess(inputs: dict) -> dict:
    text = inputs["raw_text"]
    processed_text = text.strip().replace("\n", " ")
    return {"text": processed_text}

from langchain.chains import TransformChain
preprocess_chain = TransformChain(
    input_variables=["raw_text"],
    output_variables=["text"],
    transform=text_preprocess
)

# 3. 嵌套子链：预处理链 + 翻译总结子链
full_chain = SequentialChain(
    chains=[preprocess_chain, translate_summary_chain],
    input_variables=["raw_text"],
    output_variables=["text"],  # 子链的输出
    verbose=True
)

# 测试
raw_text = """
  LangChain provides a set of tools for building complex LLM applications,
  including prompt templates, output parsers, and chains.
"""
result = full_chain.invoke({"raw_text": raw_text})

print("最终总结结果：", result["text"])
```
