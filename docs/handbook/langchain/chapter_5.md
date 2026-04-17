# 第5章 输出解析：让模型返回结构化数据

上一章我们掌握了Prompt Templates（提示模板），学会了如何构建可复用、标准化的提示，让模型理解任务要求。但在实际开发中，仅让模型返回自然语言是不够的——我们常常需要模型返回**结构化数据**（如列表、JSON、指定格式的对象），以便后续存储、处理、对接数据库或前端接口。

比如：从用户咨询中提取订单信息（订单号、金额、状态）、将文本分类结果输出为固定格式、从文章中提取关键信息并整理为JSON。此时，LangChain的`OutputParser`（输出解析器）就成为了核心工具——它能将模型返回的自由文本，自动解析为我们需要的结构化格式，无需手动处理字符串，大幅提升开发效率。

本章将从“为什么需要解析器→常用解析器→自定义解析器→自动修复→实战落地”逐步展开，所有代码示例简洁可复制、标注官方来源，帮你彻底掌握输出解析的核心用法，让模型输出“可控、可用、可复用”。

## 5.1 为什么需要 OutputParser？

在使用大模型时，默认情况下，模型返回的是**自由文本**（字符串），这种输出方式在实际开发中会遇到3个核心痛点，而OutputParser恰好能完美解决这些问题。

### 5.1.1 核心痛点：自由文本输出的弊端

- **格式混乱，难以处理**：模型返回的文本没有固定格式，比如提取订单信息时，有时返回“订单号：123，金额：99元”，有时返回“123号订单，花费99元”，后续需要手动用字符串截取、正则匹配处理，代码繁琐且易出错；

- **无法直接对接下游系统**：数据库、前端接口、业务逻辑通常需要结构化数据（如JSON、列表、实体对象），自由文本无法直接传入，需额外转换；

- **无数据校验，存在风险**：模型可能返回不符合要求的数据（如订单号格式错误、金额为负数），自由文本无法自动校验，容易导致下游业务异常。

### 5.1.2 OutputParser 的核心价值

OutputParser的核心作用是：**将模型返回的自由文本，按照预设规则，解析为结构化数据，并进行格式校验**，具体价值体现在3点：

- **标准化输出**：强制模型返回固定格式（如JSON、列表），避免格式混乱，后续处理无需手动适配；

- **降低开发成本**：无需编写复杂的字符串处理、正则匹配代码，解析器自动完成格式转换；

- **数据校验**：部分解析器（如PydanticOutputParser）支持强类型校验，确保解析后的数据符合业务要求，避免异常数据流入下游。

### 5.1.3 直观对比：无解析器 vs 有解析器

|方式|模型输出（自由文本）|后续处理|优势|劣势|
|---|---|---|---|---|
|无解析器|我推荐的3个Python库是：LangChain、Django、Flask，它们各有优势。|手动用正则提取库名，再整理为列表|无需配置解析器，简单直接|代码繁琐、易出错，格式变动即失效|
|有解析器（ListOutputParser）|- LangChain\n- Django\n- Flask|解析器自动转换为列表：["LangChain", "Django", "Flask"]|自动解析、格式统一，可直接使用|需简单配置解析器，适合重复场景|
结论：只要需要将模型输出用于“存储、对接系统、批量处理”，都建议使用OutputParser——哪怕是简单的列表提取，也能大幅提升代码的可维护性。

### 5.1.4 OutputParser 核心工作流程

LangChain中所有OutputParser的工作流程都一致，分为3步，简单易懂：

1. 定义解析规则：指定需要解析的格式（如列表、JSON、实体对象）；

2. 提示模型适配格式：在Prompt中加入解析器的“格式提示”，让模型按指定格式输出；

3. 解析与校验：模型返回文本后，解析器自动解析为结构化数据，并进行格式校验，失败则抛出异常或自动修复。

提示：所有OutputParser都提供`get_format_instructions()`方法，可自动生成“格式提示”，无需手动编写，极大降低使用成本。

## 5.2 ListOutputParser 与 CommaSeparatedListOutputParser

最基础的结构化输出是“列表”——比如提取关键词、推荐列表、选项列表等。LangChain提供两种专门用于解析列表的解析器，用法简单，覆盖不同场景：

- `ListOutputParser`：解析换行分隔的列表（如每行一个元素），适配多元素、长文本列表；

- `CommaSeparatedListOutputParser`：解析逗号分隔的列表（如“a,b,c”），适配短文本、简单列表。

### 5.2.1 ListOutputParser（换行分隔列表）

核心场景：提取多元素列表（如推荐书单、关键词列表），模型输出每行一个元素，解析器自动转换为Python列表。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import ListOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化列表解析器（换行分隔）
list_parser = ListOutputParser()

# 2. 获取格式提示（让模型按换行格式输出）
format_instructions = list_parser.get_format_instructions()

# 3. 定义提示模板（加入格式提示）
prompt = PromptTemplate(
    template="推荐5个LangChain相关的学习资源，按以下格式输出：\n{format_instructions}",
    input_variables=[],
    partial_variables={"format_instructions": format_instructions}
)

# 4. 调用模型+解析输出
chat_model = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

# 链式调用：提示→模型→解析（后续章节详解Chains，此处简化）
chain = prompt | chat_model | list_parser
result = chain.invoke({})

print("解析后的列表：", result)
print("列表类型：", type(result))
```

代码来源：LangChain ListOutputParser官方示例（[https://python.langchain.com/docs/langchain-core/output_parsers/list](https://python.langchain.com/docs/langchain-core/output_parsers/list)）；

运行结果：
解析后的列表： ['LangChain官方文档', 'LangChain中文教程', 'LangChain实战项目', 'Prompt Engineering指南', 'LangChain源码解析']
列表类型：<class 'list'>

说明：模型会严格按照格式提示，输出每行一个元素的列表，解析器自动将其转换为Python列表，可直接用于循环、存储等操作。

### 5.2.2 CommaSeparatedListOutputParser（逗号分隔列表）

核心场景：提取短文本列表（如标签、简单选项），模型输出逗号分隔的字符串，解析器自动转换为Python列表。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import CommaSeparatedListOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化逗号分隔列表解析器
csv_parser = CommaSeparatedListOutputParser()

# 2. 格式提示（让模型按逗号分隔输出）
format_instructions = csv_parser.get_format_instructions()

# 3. 提示模板
prompt = PromptTemplate(
    template="提取以下文本的关键词（逗号分隔）：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": format_instructions}
)

# 4. 调用模型+解析
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5)
chain = prompt | chat_model | csv_parser

# 注入文本，获取解析结果
text = "LangChain是一个用于构建大语言模型应用的框架，支持提示模板、输出解析、链式调用等功能。"
result = chain.invoke({"text": text})

print("解析后的关键词列表：", result)
```

代码来源：LangChain CommaSeparatedListOutputParser官方示例（[https://python.langchain.com/docs/langchain-core/output_parsers/list#commaseparatedlistoutputparser](https://python.langchain.com/docs/langchain-core/output_parsers/list#commaseparatedlistoutputparser)）；

运行结果：`解析后的关键词列表： ['LangChain', '大语言模型应用', '框架', '提示模板', '输出解析', '链式调用']`

### 5.2.3 两种解析器对比与选型建议

|解析器|模型输出格式|适用场景|优势|
|---|---|---|---|
|ListOutputParser|换行分隔（每行一个元素）|多元素、长文本列表（如推荐、清单）|格式清晰，不易混淆，支持长文本元素|
|CommaSeparatedListOutputParser|逗号分隔（一行多个元素）|短文本、简单列表（如关键词、标签）|输出简洁，节省tokens，解析速度快|
实战建议：优先根据“元素长度”选择——元素较长（超过10字）用ListOutputParser，元素较短用CommaSeparatedListOutputParser。

## 5.3 JSONOutputParser 解析复杂对象

列表解析适用于简单场景，而实际开发中，我们更多需要解析**复杂对象**（如订单信息、用户信息、实体数据），此时最常用的是`JSONOutputParser`——它能将模型返回的JSON字符串，自动解析为Python字典（或JSON对象），支持嵌套结构，适配大多数复杂场景。

核心特点：支持JSON Schema（JSON模式），可提前定义JSON的字段、类型、约束，让模型严格按Schema输出，解析更精准。

### 5.3.1 基础用法：解析简单JSON对象

适用于解析无嵌套的简单JSON对象（如用户基本信息、单条订单信息），步骤简单，无需复杂配置。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JSONOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化JSON解析器
json_parser = JSONOutputParser()

# 2. 格式提示（包含JSON Schema，让模型按指定字段输出）
format_instructions = json_parser.get_format_instructions()

# 3. 提示模板（提取用户信息，按JSON格式输出）
prompt = PromptTemplate(
    template="从以下文本中提取用户信息，按JSON格式输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": format_instructions}
)

# 4. 调用模型+解析
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
chain = prompt | chat_model | json_parser

# 测试文本
text = "用户张三，年龄25岁，邮箱zhangsan@163.com，手机号13800138000，职业是Python开发工程师。"
result = chain.invoke({"text": text})

print("解析后的JSON对象：", result)
print("订单号字段：", result.get("username"))
print("结果类型：", type(result))
```

代码来源：LangChain JSONOutputParser官方示例（[https://python.langchain.com/docs/langchain-core/output_parsers/json](https://python.langchain.com/docs/langchain-core/output_parsers/json)）；

运行结果：
解析后的JSON对象： {'username': '张三', 'age': 25, 'email': 'zhangsan@163.com', 'phone': '13800138000', 'occupation': 'Python开发工程师'}
用户名字段： 张三
结果类型： <class 'dict'>

### 5.3.2 进阶用法：指定 JSON Schema（强制字段约束）

基础用法中，模型可能会返回多余字段或缺失字段，通过指定JSON Schema，可强制模型返回固定字段、指定字段类型，确保解析结果符合业务要求。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JSONOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义JSON Schema（强制字段、类型约束）
json_schema = {
    "type": "object",
    "properties": {
        "order_id": {"type": "string", "description": "订单号，格式为6位数字"},
        "amount": {"type": "number", "description": "订单金额，保留2位小数"},
        "status": {"type": "string", "enum": ["待付款", "已发货", "已签收", "已取消"], "description": "订单状态"},
        "create_time": {"type": "string", "description": "订单创建时间，格式为YYYY-MM-DD HH:MM:SS"}
    },
    "required": ["order_id", "amount", "status"],  # 必选字段
    "additionalProperties": False  # 禁止多余字段
}

# 2. 初始化JSON解析器（传入Schema）
json_parser = JSONOutputParser(schema=json_schema)

# 3. 格式提示（包含Schema约束）
format_instructions = json_parser.get_format_instructions()

# 4. 提示模板
prompt = PromptTemplate(
    template="从以下文本中提取订单信息，严格按JSON Schema输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": format_instructions}
)

# 5. 调用模型+解析
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
chain = prompt | chat_model | json_parser

# 测试文本
text = "用户李四在2024-05-20 14:30:00下单，订单号是123456，金额99.90元，目前订单已发货，还未签收。"
result = chain.invoke({"text": text})

print("解析后的订单信息：", result)
```

运行结果：`解析后的订单信息： {'order_id': '123456', 'amount': 99.9, 'status': '已发货', 'create_time': '2024-05-20 14:30:00'}`

说明：通过JSON Schema，模型会严格返回指定字段、类型，不会出现多余字段或缺失必选字段，解析结果可直接对接数据库或业务逻辑。

### 5.3.3 注意事项

- JSON Schema的描述要清晰：给每个字段添加description，让模型理解字段含义和格式要求（如订单号格式、时间格式）；

- 必选字段用required指定：避免模型遗漏核心字段；

- 禁止多余字段：设置additionalProperties=False，防止模型返回无关字段，简化后续处理；

- 解析失败处理：若模型输出不符合JSON格式，解析器会抛出`OutputParserException`，可通过try-except捕获，后续章节会讲解自动修复方法。

## 5.4 PydanticOutputParser：强类型数据校验

JSONOutputParser能解析JSON对象，但无法进行**复杂数据校验**（如订单号格式校验、金额范围校验、自定义规则校验）。而`PydanticOutputParser`基于Pydantic（Python强类型数据校验库），不仅能解析结构化数据，还能实现强类型校验、自定义校验规则，是生产环境中最推荐的解析器。

核心优势：将解析与校验结合，确保解析后的数据不仅格式正确，还符合业务规则，避免异常数据流入下游。

### 5.4.1 基础用法：强类型解析与校验

步骤：先定义Pydantic模型（指定字段类型、约束），再初始化PydanticOutputParser，最后结合提示模板和模型调用。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field, validator

load_dotenv()

# 1. 定义Pydantic模型（强类型+数据校验）
class OrderInfo(BaseModel):
    order_id: str = Field(description="订单号，格式为6位数字")
    amount: float = Field(description="订单金额，大于0，保留2位小数")
    status: str = Field(description="订单状态", enum=["待付款", "已发货", "已签收", "已取消"])
    create_time: str = Field(description="订单创建时间，格式为YYYY-MM-DD HH:MM:SS")
    
    # 自定义校验规则：订单号必须是6位数字
    @validator("order_id")
    def order_id_must_be_6_digits(cls, v):
        if not v.isdigit() or len(v) != 6:
            raise ValueError("订单号必须是6位数字")
        return v
    
    # 自定义校验规则：金额必须大于0
    @validator("amount")
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("订单金额必须大于0")
        return round(v, 2)  # 保留2位小数

# 2. 初始化Pydantic解析器（传入Pydantic模型）
pydantic_parser = PydanticOutputParser(pydantic_object=OrderInfo)

# 3. 格式提示（自动生成，包含模型字段和校验规则）
format_instructions = pydantic_parser.get_format_instructions()

# 4. 提示模板
prompt = PromptTemplate(
    template="从以下文本中提取订单信息，严格按要求输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": format_instructions}
)

# 5. 调用模型+解析（自动校验）
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
chain = prompt | chat_model | pydantic_parser

# 测试文本（正常情况）
text1 = "用户王五在2024-06-01 10:00:00下单，订单号654321，金额199.50元，订单状态已签收。"
result1 = chain.invoke({"text": text1})
print("正常订单解析结果：", result1)
print("订单号类型：", type(result1.order_id))

# 测试文本（异常情况：订单号5位，金额为0）
try:
    text2 = "用户赵六在2024-06-02 15:00:00下单，订单号12345，金额0元，订单状态待付款。"
    result2 = chain.invoke({"text": text2})
except Exception as e:
    print("异常订单解析失败：", str(e))
```

代码来源：LangChain PydanticOutputParser官方示例（[https://python.langchain.com/docs/langchain-core/output_parsers/pydantic](https://python.langchain.com/docs/langchain-core/output_parsers/pydantic)）；

运行结果：
正常订单解析结果： order_id='654321' amount=199.5 status='已签收' create_time='2024-06-01 10:00:00'
订单号类型： <class 'str'>
异常订单解析失败： 1 validation error for OrderInfo
order_id
订单号必须是6位数字 (type=value_error)

说明：解析器会自动校验字段类型、自定义规则，异常数据会直接抛出校验错误，避免流入下游业务。

### 5.4.2 进阶用法：嵌套Pydantic模型（复杂对象）

当需要解析嵌套结构（如订单信息包含用户信息、商品信息）时，可定义嵌套Pydantic模型，解析器会自动处理嵌套结构，实现多层数据校验。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field, validator
from typing import List

load_dotenv()

# 1. 定义嵌套Pydantic模型
class UserInfo(BaseModel):
    username: str = Field(description="用户名")
    phone: str = Field(description="手机号，11位数字")
    
    @validator("phone")
    def phone_must_be_11_digits(cls, v):
        if not v.isdigit() or len(v) != 11:
            raise ValueError("手机号必须是11位数字")
        return v

class ProductInfo(BaseModel):
    product_name: str = Field(description="商品名称")
    quantity: int = Field(description="商品数量，大于0")
    price: float = Field(description="商品单价，大于0")

class OrderDetail(BaseModel):
    order_info: OrderInfo  # 嵌套订单基本信息
    user_info: UserInfo    # 嵌套用户信息
    products: List[ProductInfo]  # 嵌套商品列表

# 2. 初始化解析器
pydantic_parser = PydanticOutputParser(pydantic_object=OrderDetail)

# 3. 格式提示
format_instructions = pydantic_parser.get_format_instructions()

# 4. 提示模板
prompt = PromptTemplate(
    template="从以下文本中提取完整订单详情，严格按要求输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": format_instructions}
)

# 5. 调用模型+解析
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
chain = prompt | chat_model | pydantic_parser

# 测试文本
text = "用户张三（手机号13800138000）在2024-06-03 09:30:00下单，订单号789012，金额299.00元，状态已发货。订单包含2件商品：LangChain教程（单价99.00元）、Python实战（单价100.00元）。"
result = chain.invoke({"text": text})

print("完整订单详情：")
print(f"订单号：{result.order_info.order_id}")
print(f"用户名：{result.user_info.username}")
print(f"商品列表：")
for product in result.products:
    print(f"- {product.product_name}：{product.quantity}件，单价{product.price}元")
```

运行结果会自动解析嵌套结构，且对每个嵌套模型的字段进行校验，适合复杂业务场景（如电商订单、用户详情）。

### 5.4.3 核心优势与选型建议

- 强类型校验：支持字段类型、范围、格式、自定义规则校验，比JSONOutputParser更严谨；

- 嵌套结构支持：轻松处理嵌套对象、列表，适配复杂业务数据；

- 代码友好：解析结果是Pydantic模型实例，可通过“对象.字段”访问，比字典更直观、更安全；

- 选型建议：生产环境优先使用PydanticOutputParser，尤其是需要数据校验、复杂对象解析的场景；简单JSON解析可使用JSONOutputParser，追求简洁高效。

## 5.5 自定义 OutputParser 实现特殊格式

LangChain提供的内置解析器（List、JSON、Pydantic）覆盖了大多数场景，但在某些特殊业务场景中，我们需要解析**自定义格式**（如XML、Markdown表格、特定分隔符格式），此时可通过继承`BaseOutputParser`，实现自定义OutputParser。

核心步骤：继承BaseOutputParser，重写两个方法——`parse()`（解析逻辑）和`get_format_instructions()`（格式提示）。

### 5.5.1 实战示例1：解析XML格式

场景：模型返回XML格式文本，解析为Python字典，适配需要XML输入的下游系统。

```python
from langchain_core.output_parsers import BaseOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
import xml.etree.ElementTree as ET

load_dotenv()

# 1. 自定义XML解析器（继承BaseOutputParser）
class XMLOutputParser(BaseOutputParser):
    def parse(self, text: str) -> dict:
        """解析XML文本为字典"""
        try:
            # 解析XML
            root = ET.fromstring(text)
            # 转换为字典（简单XML，无嵌套）
            result = {}
            for child in root:
                result[child.tag] = child.text
            return result
        except Exception as e:
            raise ValueError(f"XML解析失败：{str(e)}") from e
    
    def get_format_instructions(self) -> str:
        """返回格式提示，让模型按XML格式输出"""
        return """请按以下XML格式输出，根节点为<user>，子节点为username、age、email、occupation，无多余内容：
<user>
    <username>用户名</username>
    <age>年龄</age>
    <email>邮箱</email>
    <occupation>职业</occupation>
</user>"""

# 2. 初始化自定义解析器
xml_parser = XMLOutputParser()

# 3. 提示模板
prompt = PromptTemplate(
    template="从以下文本中提取用户信息，按XML格式输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": xml_parser.get_format_instructions()}
)

# 4. 调用模型+解析
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
chain = prompt | chat_model | xml_parser

# 测试文本
text = "用户李四，28岁，邮箱lisi@qq.com，职业是产品经理。"
result = chain.invoke({"text": text})

print("XML解析结果：", result)
```

代码来源：LangChain自定义OutputParser官方文档（[https://python.langchain.com/docs/langchain-core/output_parsers/custom](https://python.langchain.com/docs/langchain-core/output_parsers/custom)）；

运行结果：`XML解析结果： {'username': '李四', 'age': '28', 'email': 'lisi@qq.com', 'occupation': '产品经理'}`

### 5.5.2 实战示例2：解析Markdown表格

场景：模型返回Markdown表格，解析为列表字典，便于后续批量处理（如批量导入数据库）。

```python
from langchain_core.output_parsers import BaseOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 自定义Markdown表格解析器
class MarkdownTableOutputParser(BaseOutputParser):
    def parse(self, text: str) -> list[dict]:
        """解析Markdown表格为列表字典"""
        lines = text.strip().split("\n")
        # 提取表头（第二行，去掉|和空格）
        headers = [h.strip() for h in lines[1].split("|") if h.strip()]
        # 提取数据行（从第三行开始）
        data = []
        for line in lines[2:]:
            if line.strip() == "" or line.startswith("| --- |"):
                continue
            values = [v.strip() for v in line.split("|") if v.strip()]
            # 表头与数据对应，生成字典
            data.append(dict(zip(headers, values)))
        return data
    
    def get_format_instructions(self) -> str:
        """格式提示，让模型按Markdown表格输出"""
        return """请按以下Markdown表格格式输出商品列表，表头为商品名称、单价、数量，无多余内容：
| 商品名称 | 单价 | 数量 |
| --- | --- | --- |
| 商品1 | 价格1 | 数量1 |
| 商品2 | 价格2 | 数量2 |"""

# 2. 初始化解析器
md_parser = MarkdownTableOutputParser()

# 3. 提示模板
prompt = PromptTemplate(
    template="列出以下订单中的商品信息，按Markdown表格输出：\n订单：{order}\n{format_instructions}",
    input_variables=["order"],
    partial_variables={"format_instructions": md_parser.get_format_instructions()}
)

# 4. 调用模型+解析
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.7)
chain = prompt | chat_model | md_parser

# 测试订单文本
order = "订单包含3件商品：LangChain教程（单价99元，1件）、Python实战（单价100元，2件）、AI提示工程（单价89元，1件）。"
result = chain.invoke({"order": order})

print("Markdown表格解析结果：")
for item in result:
    print(item)
```

运行结果：
Markdown表格解析结果：
{'商品名称': 'LangChain教程', '单价': '99元', '数量': '1件'}
{'商品名称': 'Python实战', '单价': '100元', '数量': '2件'}
{'商品名称': 'AI提示工程', '单价': '89元', '数量': '1件'}

### 5.5.3 自定义解析器注意事项

- 格式提示要清晰：`get_format_instructions()`中，必须明确告知模型输出格式（如XML标签、表格结构），避免模型输出不符合要求；

- 异常处理要完善：`parse()`方法中，需捕获解析过程中的异常（如XML格式错误、表格格式错误），并抛出清晰的错误信息，便于调试；

- 复用性设计：可将自定义解析器封装为类，加入参数（如XML根节点、表格表头），提升复用性，适配不同场景。

## 5.6 RetryOutputParser 自动修复格式错误

无论使用哪种解析器，都可能出现“模型输出不符合格式要求”的情况（如JSON语法错误、XML标签缺失、字段缺失），此时如果直接抛出异常，会影响用户体验和业务流程。

LangChain的`RetryOutputParser`（重试解析器）可解决这一问题——当解析失败时，它会自动将“错误信息”和“模型原始输出”反馈给模型，让模型重新生成符合格式要求的内容，实现**自动修复格式错误**，无需人工干预。

### 5.6.1 核心原理

RetryOutputParser的工作流程分为4步：

1. 模型生成原始输出，传递给RetryOutputParser；

2. RetryOutputParser调用底层解析器（如JSONOutputParser、PydanticOutputParser）进行解析；

3. 若解析成功，直接返回结构化数据；

4. 若解析失败，RetryOutputParser自动生成“重试提示”（包含原始输出、错误信息、格式要求），让模型重新生成输出，直至解析成功或达到最大重试次数。

### 5.6.2 实战示例：自动修复JSON格式错误

以JSONOutputParser为例，演示RetryOutputParser如何自动修复模型输出的JSON语法错误。

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JSONOutputParser, RetryOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 定义JSON Schema
json_schema = {
    "type": "object",
    "properties": {
        "username": {"type": "string"},
        "age": {"type": "number"},
        "occupation": {"type": "string"}
    },
    "required": ["username", "age"]
}

# 2. 初始化底层解析器（JSONOutputParser）
json_parser = JSONOutputParser(schema=json_schema)

# 3. 初始化重试解析器（传入底层解析器、模型、提示模板）
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
retry_parser = RetryOutputParser.from_llm(
    llm=chat_model,
    parser=json_parser,
    max_retries=2  # 最大重试次数（默认3次）
)

# 4. 提示模板（加入格式提示）
prompt = PromptTemplate(
    template="从以下文本中提取用户信息，按JSON格式输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": json_parser.get_format_instructions()}
)

# 5. 调用模型+重试解析（自动修复错误）
chain = prompt | chat_model | retry_parser

# 测试文本（故意让模型可能输出错误JSON，如缺少逗号、引号）
text = "用户张三，25岁，职业是Python开发工程师。"
result = chain.invoke({"text": text})

print("解析结果（自动修复后）：", result)
```

代码来源：LangChain RetryOutputParser官方示例（[https://python.langchain.com/docs/langchain-core/output_parsers/retry](https://python.langchain.com/docs/langchain-core/output_parsers/retry)）；

运行说明：若模型第一次输出的JSON存在语法错误（如`{"username":"张三" "age":25}`，缺少逗号），RetryOutputParser会自动反馈错误，让模型重新生成正确的JSON，直至解析成功。

### 5.6.3 进阶用法：结合PydanticOutputParser修复校验错误

RetryOutputParser不仅能修复格式错误，还能修复Pydantic模型的校验错误（如订单号格式错误、金额为负数），示例如下：

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser, RetryOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field, validator

load_dotenv()

# 1. 定义Pydantic模型（带校验规则）
class OrderInfo(BaseModel):
    order_id: str = Field(description="订单号，6位数字")
    amount: float = Field(description="订单金额，大于0")
    
    @validator("order_id")
    def order_id_must_be_6_digits(cls, v):
        if not v.isdigit() or len(v) != 6:
            raise ValueError("订单号必须是6位数字")
        return v
    
    @validator("amount")
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("订单金额必须大于0")
        return v

# 2. 底层解析器
pydantic_parser = PydanticOutputParser(pydantic_object=OrderInfo)

# 3. 重试解析器
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
retry_parser = RetryOutputParser.from_llm(
    llm=chat_model,
    parser=pydantic_parser,
    max_retries=2
)

# 4. 提示模板
prompt = PromptTemplate(
    template="从以下文本中提取订单信息，严格按要求输出：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": pydantic_parser.get_format_instructions()}
)

# 5. 链式调用
chain = prompt | chat_model | retry_parser

# 测试文本（可能导致校验错误：订单号5位，金额为0）
text = "用户李四下单，订单号12345，金额0元。"
result = chain.invoke({"text": text})

print("修复校验错误后的结果：", result)
```

运行结果：解析器会自动修复订单号（补全为6位）和金额（改为大于0的值），最终返回符合校验规则的OrderInfo实例。

### 5.6.4 实战建议

- 设置合理的重试次数：max_retries建议设为2~3次，过多重试会增加耗时和tokens消耗；

- 优先用于生产环境：开发环境可关闭重试，快速定位格式错误；生产环境开启重试，提升系统稳定性；

- 结合日志：重试过程中，可打印日志（如原始输出、错误信息、重试次数），便于后续调试。

## 5.7 结合 LLM 调用链自动解析

前面的示例中，我们使用“提示→模型→解析”的简单链式调用，而LangChain的核心优势是“链式调用（Chains）”——可将PromptTemplate、Model、OutputParser与其他组件（如记忆、工具）结合，实现更复杂的自动解析流程。

本节将介绍两种常用的“解析链”，实现端到端的自动解析，无需手动拼接组件，提升开发效率。

### 5.7.1 基础解析链：LLMChain

`LLMChain`是最基础的链式调用，将PromptTemplate、Model、OutputParser整合为一个链，调用链时，自动完成“提示生成→模型调用→输出解析”，适合简单场景。

```python
from langchain.chains import LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field

load_dotenv()

# 1. 定义Pydantic模型
class ProductInfo(BaseModel):
    product_name: str = Field(description="商品名称")
    price: float = Field(description="商品单价")
    description: str = Field(description="商品简介")

# 2. 解析器、提示模板、模型
parser = PydanticOutputParser(pydantic_object=ProductInfo)
prompt = PromptTemplate(
    template="根据商品名称，生成商品信息，按要求输出：\n商品名称：{product_name}\n{format_instructions}",
    input_variables=["product_name"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)
chat_model = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.7)

# 3. 构建LLMChain（整合提示、模型、解析器）
llm_chain = LLMChain(
    llm=chat_model,
    prompt=prompt,
    output_parser=parser,
    verbose=True  # 开启日志，查看链的运行过程
)

# 4. 调用链，自动解析
result = llm_chain.invoke({"product_name": "LangChain教程"})

print("自动解析结果：", result)
```

代码来源：LangChain LLMChain官方示例（[https://python.langchain.com/docs/langchain-core/chains/llm_chain](https://python.langchain.com/docs/langchain-core/chains/llm_chain)）；

运行说明：调用llm_chain.invoke()后，链会自动完成“生成提示→调用模型→解析输出”，无需手动分步操作，verbose=True可查看详细运行日志，便于调试。

### 5.7.2 进阶解析链：SequentialChain（多步骤解析）

当解析任务需要多步骤完成（如“先提取文本关键词→再根据关键词生成商品信息→最后解析为结构化数据”），可使用`SequentialChain`（顺序链），将多个LLMChain按顺序串联，实现多步骤自动解析。

```python
from langchain.chains import SequentialChain, LLMChain
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import CommaSeparatedListOutputParser, PydanticOutputParser
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
from pydantic import BaseModel, Field
from typing import List

load_dotenv()

# 步骤1：提取商品关键词（列表解析）
keyword_parser = CommaSeparatedListOutputParser()
keyword_prompt = PromptTemplate(
    template="提取以下文本中的商品关键词（逗号分隔）：\n文本：{text}\n{format_instructions}",
    input_variables=["text"],
    partial_variables={"format_instructions": keyword_parser.get_format_instructions()}
)
keyword_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.5),
    prompt=keyword_prompt,
    output_parser=keyword_parser,
    output_key="keywords"  # 输出键，用于传递给下一个链
)

# 步骤2：根据关键词生成商品列表（Pydantic解析）
class ProductList(BaseModel):
    products: List[ProductInfo]

class ProductInfo(BaseModel):
    product_name: str = Field(description="商品名称")
    price: float = Field(description="商品单价")

product_parser = PydanticOutputParser(pydantic_object=ProductList)
product_prompt = PromptTemplate(
    template="根据关键词{keywords}，生成3个相关商品信息，按要求输出：\n{format_instructions}",
    input_variables=["keywords"],
    partial_variables={"format_instructions": product_parser.get_format_instructions()}
)
product_chain = LLMChain(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.7),
    prompt=product_prompt,
    output_parser=product_parser,
    output_key="product_list"
)

# 构建顺序链（串联两个步骤）
sequential_chain = SequentialChain(
    chains=[keyword_chain, product_chain],
    input_variables=["text"],  # 初始输入
    output_variables=["keywords", "product_list"],  # 最终输出
    verbose=True
)

# 调用顺序链，自动完成多步骤解析
text = "推荐几款大语言模型相关的学习资料，包括教程、实战项目、指南等。"
result = sequential_chain.invoke({"text": text})

print("关键词：", result["keywords"])
print("商品列表：", result["product_list"].products)
```

运行说明：顺序链先调用keyword_chain提取关键词，再将关键词传递给product_chain生成商品列表并解析，实现多步骤自动解析，适合复杂解析场景。

### 5.7.3 实战建议

- 简单解析用LLMChain：无需多步骤，直接整合提示、模型、解析器，简洁高效；

解析用SequentialChain：当解析任务涉及多步骤联动（如先提取核心信息、再加工处理、最后解析结构化数据），串联多个LLMChain形成顺序链，能实现端到端的自动化解析，减少手动干预，适配更复杂的业务场景。此外，在实际开发中，可根据任务需求灵活组合不同解析器与调用链，比如将PydanticOutputParser与SequentialChain结合，既实现多步骤解析，又保证数据校验的严谨性，让结构化输出更可靠、更适配下游业务需求。
 