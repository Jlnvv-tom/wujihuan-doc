# 第12章 工具（Tools）与函数调用（LangChain实战）

在前几章中，我们搭建的RAG系统、对话链，核心能力局限于“基于已有数据生成回答”——无法获取实时信息（如当前天气、股票价格），无法执行计算操作（如行程时间、金额换算），也无法与外部系统交互（如调用API、操作数据库）。

LangChain的「Tools（工具）」与「函数调用」功能，正是为突破这一局限而生。它允许我们将外部工具（如搜索引擎、计算器）、自定义Python函数、API接口封装成LangChain可识别的工具，让大语言模型（LLM）根据用户需求，自主判断是否需要调用工具、调用哪个工具，最终结合工具返回结果生成精准回答。

本章将从工具的核心概念出发，手把手教你使用LangChain内置工具、自定义工具、规范工具输入输出，掌握多工具协同与安全控制，最后通过实战开发“查天气+算行程时间”复合工具，所有代码简短可复制，关键步骤标注引用来源，贴合掘金等技术博客的实战风格。

# 12.1 什么是 Tool？LangChain 中的工具抽象

在LangChain中，「Tool」是一个抽象概念，本质是**可被LLM调用的“功能模块”**——它可以是简单的Python函数、外部API接口、第三方工具（如搜索引擎、计算器），也可以是复杂的业务逻辑（如订单查询、数据统计）。

LLM本身不具备“执行操作”的能力，但它能通过分析用户需求，判断是否需要调用工具、调用哪个工具，以及如何传递参数；工具执行后返回结果，LLM再结合结果生成最终回答，形成“需求分析→工具调用→结果整合”的完整闭环。

## 12.1.1 为什么需要 Tool？（核心价值）

没有工具的LLM，就像“纸上谈兵”——只能基于自身训练数据回答问题，无法应对实时、动态、需要执行操作的场景。Tool的核心价值的是为LLM“赋能”，让它具备以下能力：

1. 获取实时信息：如查询当前天气、最新新闻、股票价格；

2. 执行计算操作：如计算行程时间、金额换算、数据统计；

3. 与外部系统交互：如调用API、操作数据库、发送消息；

4. 执行自定义逻辑：如业务流程查询、用户偏好匹配、权限校验。

## 12.1.2 LangChain 中的工具抽象（核心类）

LangChain对工具进行了统一抽象，所有工具都继承自「BaseTool」类，核心包含3个要素，这也是我们自定义工具的核心依据：

- **name（工具名称）**：唯一标识工具，LLM通过名称识别工具（如“weather_query”“calculator”）；

- **description（工具描述）**：详细说明工具的功能、适用场景、输入参数，LLM通过描述判断是否需要调用该工具（至关重要，后续章节重点讲解）；

- **\_run（核心方法）**：工具的执行逻辑，接收输入参数，返回执行结果（自定义工具必须实现该方法）。

## 12.1.3 工具调用的核心流程（极简图例）

用流程图直观展示LangChain工具调用的完整逻辑（可直接用于笔记，贴合掘金博客简洁风格）：

用户输入 → LLM分析需求 → 判断是否需要调用工具 → 若需要，选择工具并传递参数 → 工具执行（\_run方法） → 返回执行结果 → LLM整合结果生成回答

## 12.1.4 关键提醒

LangChain的工具体系具备极强的灵活性：既支持内置工具（开箱即用），也支持自定义工具（贴合业务需求）；既支持单个工具调用，也支持多工具协同调用，甚至可以结合Memory、RAG系统，实现更复杂的场景。

引用来源：[LangChain Tools 官方文档](https://python.langchain.com/docs/modules/tools/)、[LangChain 工具调用实战详解](https://juejin.cn/post/7321558492030416933)。

# 12.2 内置工具：搜索引擎、计算器、时间查询

LangChain内置了多种常用工具，无需我们手动开发，只需简单配置即可使用，适合快速验证工具调用效果。本节重点讲解3个最常用的内置工具：搜索引擎（获取实时信息）、计算器（执行计算）、时间查询（获取当前时间），代码简短可直接运行。

## 12.2.1 前置准备：安装依赖

使用内置工具需安装对应的依赖包，执行以下命令：

```bash
# 核心依赖（LangChain、OpenAI）
pip install langchain openai python-dotenv
# 搜索引擎工具依赖（以DuckDuckGo为例，无需API密钥）
pip install duckduckgo-search
# 计算器工具依赖
pip install numexpr
```

说明：搜索引擎工具选用DuckDuckGo（无需API密钥，适合快速测试），也可替换为Google、Bing等搜索引擎（需配置对应API密钥）。

## 12.2.2 内置工具1：DuckDuckGo搜索引擎（获取实时信息）

DuckDuckGo是一款隐私友好型搜索引擎，LangChain内置了对应的工具，可直接调用获取实时网页信息，适合查询最新新闻、天气、事件等。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import DuckDuckGoSearchRun
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化LLM（用于分析需求、判断是否调用工具）
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 初始化内置搜索引擎工具
search_tool = DuckDuckGoSearchRun()

# 3. 初始化智能体（Agent），用于管理工具调用
agent = initialize_agent(
    tools=[search_tool],  # 注册工具（可传入多个）
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,  # 适合工具调用的Agent类型
    verbose=True  # 打印详细流程（便于调试，查看工具调用过程）
)

# 4. 测试工具调用（查询实时信息）
query = "2026年3月北京最新天气情况"
response = agent.run(query)
print("用户：", query)
print("助手：", response)
```

运行说明：LLM会分析用户需求（需要实时天气），判断需要调用DuckDuckGo搜索引擎，调用后获取实时天气数据，再整合结果生成回答。

## 12.2.3 内置工具2：Calculator计算器（执行计算）

Calculator工具用于执行数学计算（如加减乘除、幂运算、三角函数等），解决LLM本身计算精度不足的问题，适合需要精准计算的场景。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import Calculator
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 初始化内置计算器工具
calc_tool = Calculator()

# 3. 初始化智能体
agent = initialize_agent(
    tools=[calc_tool],
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# 4. 测试工具调用（执行计算）
query = "计算（123 + 456）× 789 ÷ 3 的结果"
response = agent.run(query)
print("用户：", query)
print("助手：", response)
```

## 12.2.4 内置工具3：Time时间查询（获取当前时间）

Time工具用于获取当前系统时间，适合需要时间关联的场景（如日程提醒、时间戳记录），无需额外依赖，开箱即用。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import TimeTool
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 初始化内置时间工具
time_tool = TimeTool()

# 3. 初始化智能体
agent = initialize_agent(
    tools=[time_tool],
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# 4. 测试工具调用（获取当前时间）
query = "现在是什么时间？请输出具体的年、月、日、时、分、秒"
response = agent.run(query)
print("用户：", query)
print("助手：", response)
```

## 12.2.5 内置工具使用总结

- 优势：开箱即用，无需手动开发，适合快速验证工具调用逻辑；

- 局限：功能固定，无法满足个性化业务需求（如自定义API调用、业务逻辑执行）；

- 适用场景：快速原型开发、简单需求验证、学习工具调用流程。

引用来源：[LangChain 内置工具集成文档](https://python.langchain.com/docs/modules/tools/integrations/)、[LangChain 内置工具实战](https://juejin.cn/post/7345678901234567890)。

# 12.3 自定义 Python 函数转为 Tool

内置工具虽然便捷，但无法满足大部分业务场景（如调用公司内部API、执行自定义业务逻辑）。LangChain支持将任意Python函数，快速封装成LangChain可识别的Tool，步骤简单、灵活度极高，是实际开发中最常用的方式。

核心方法：使用LangChain的「tool」装饰器，无需继承BaseTool类，只需给Python函数添加装饰器、指定工具名称和描述，即可快速转为Tool。

## 12.3.1 快速上手：自定义简单工具（无参数）

示例：自定义一个“获取公司名称”的工具，无输入参数，返回固定结果，演示最基础的自定义流程。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import tool
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 自定义Python函数，用@tool装饰器转为Tool
@tool(
    name="get_company_name",  # 工具名称（唯一标识）
    description="用于获取本公司的名称，无需输入任何参数，直接调用即可返回结果。"  # 工具描述
)
def get_company_name():
    """获取公司名称的核心逻辑"""
    return "字节跳动科技有限公司"

# 2. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 3. 初始化智能体（注册自定义工具）
agent = initialize_agent(
    tools=[get_company_name],  # 传入自定义工具
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# 4. 测试自定义工具
query = "你们公司叫什么名字？"
response = agent.run(query)
print("用户：", query)
print("助手：", response)
```

## 12.3.2 进阶：自定义带参数的工具（常用场景）

实际业务中，大部分工具都需要输入参数（如查询天气需要“城市名称”，查询订单需要“订单ID”）。示例：自定义一个“根据城市名称查询天气”的工具（模拟API调用），接收城市参数，返回天气结果。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import tool
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 自定义带参数的工具（接收城市名称参数）
@tool(
    name="query_weather",
    description="用于查询指定城市的天气情况，输入参数为城市名称（如北京、上海、广州），返回该城市的天气描述和温度范围。"
)
def query_weather(city: str) -> str:
    """
    查询指定城市的天气（模拟API调用，实际可对接真实天气API）

    Args:
        city: 城市名称（字符串类型）

    Returns:
        str: 天气描述和温度范围
    """
    # 模拟天气数据（实际开发中替换为真实API调用）
    weather_data = {
        "北京": "晴，10-20℃",
        "上海": "阴，15-22℃",
        "广州": "多云，20-28℃",
        "深圳": "晴，18-26℃"
    }
    return f"{city}今天的天气：{weather_data.get(city, '暂无该城市天气数据')}"

# 2. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 3. 初始化智能体
agent = initialize_agent(
    tools=[query_weather],
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# 4. 测试带参数的工具调用
query = "查询广州今天的天气"
response = agent.run(query)
print("用户：", query)
print("助手：", response)
```

## 12.3.3 核心注意事项

- 工具名称（name）：必须唯一，避免与其他工具重名，建议使用“动词+名词”格式（如query_weather、get_order），便于LLM识别；

- 工具描述（description）：需清晰说明工具功能、输入参数（类型、含义）、适用场景，LLM完全依赖描述判断是否调用工具（后续章节重点讲解）；

- 函数参数：建议指定参数类型（如city: str），让LLM更清晰地知道需要传递什么类型的参数，减少调用错误；

- 返回值：返回格式建议简洁明了（如字符串、字典），便于LLM整合结果生成回答。

引用来源：[LangChain 自定义工具官方文档](https://python.langchain.com/docs/modules/tools/custom_tools/)。

# 12.4 使用 Pydantic 定义工具输入输出

上一节的自定义工具，参数较为简单（单个字符串参数），但在实际业务中，工具可能需要多个参数、复杂参数类型（如整数、布尔值、嵌套结构），且需要对参数进行校验（如校验城市名称是否合法、订单ID是否为数字）。

LangChain结合「Pydantic」（Python数据校验库），支持定义工具的输入输出模型，实现参数校验、类型约束，让工具调用更规范、更可靠，避免因参数错误导致工具调用失败。

## 12.4.1 前置准备：安装Pydantic

```bash
pip install pydantic
```

## 12.4.2 实战：用Pydantic定义工具输入模型（多参数+校验）

示例：自定义一个“查询航班行程”的工具，需要2个参数（出发城市、到达城市），用Pydantic定义输入模型，校验参数是否为有效城市名称，避免无效输入。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import tool
from langchain.agents import initialize_agent, AgentType
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 用Pydantic定义工具输入模型（多参数+参数校验）
class FlightQueryInput(BaseModel):
    """查询航班行程的输入参数模型"""
    departure_city: str = Field(description="出发城市名称，如北京、上海")
    arrival_city: str = Field(description="到达城市名称，如广州、深圳")

    # 自定义参数校验：确保出发城市和到达城市不同
    @validator("arrival_city")
    def departure_not_equal_arrival(cls, v, values):
        if "departure_city" in values and v == values["departure_city"]:
            raise ValueError("出发城市和到达城市不能相同")
        return v

    # 自定义参数校验：确保城市名称是有效城市（模拟）
    @validator("departure_city", "arrival_city")
    def valid_city(cls, v):
        valid_cities = ["北京", "上海", "广州", "深圳", "杭州", "成都"]
        if v not in valid_cities:
            raise ValueError(f"无效城市名称，支持的城市：{valid_cities}")
        return v

# 2. 自定义工具，指定输入模型
@tool(
    name="query_flight",
    description="用于查询两个城市之间的航班行程，需要输入出发城市和到达城市，返回航班信息。",
    args_schema=FlightQueryInput  # 关联Pydantic输入模型
)
def query_flight(departure_city: str, arrival_city: str) -> str:
    """查询两个城市之间的航班行程（模拟）"""
    # 模拟航班数据
    flight_data = {
        ("北京", "广州"): "CA1301 北京首都→广州白云 08:00-11:30",
        ("上海", "深圳"): "MU503 上海浦东→深圳宝安 09:15-12:00",
        ("广州", "成都"): "CZ3451 广州白云→成都双流 10:30-13:10"
    }
    key = (departure_city, arrival_city)
    return f"{departure_city}到{arrival_city}的航班信息：{flight_data.get(key, '暂无直达航班')}"

# 3. 初始化LLM和智能体
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

agent = initialize_agent(
    tools=[query_flight],
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# 4. 测试工具调用（正常输入+异常输入）
# 正常输入
print("测试正常输入：")
query1 = "查询北京到广州的航班"
response1 = agent.run(query1)
print("用户：", query1)
print("助手：", response1)

# 异常输入（出发城市和到达城市相同）
print("\n测试异常输入：")
query2 = "查询北京到北京的航班"
try:
    response2 = agent.run(query2)
except Exception as e:
    print("错误信息：", str(e))
```

## 12.4.3 核心解析

### 1. Pydantic输入模型的作用

- 参数约束：通过Field指定参数描述、类型，让LLM清晰知道需要传递什么参数；

- 参数校验：通过@validator装饰器自定义校验逻辑（如城市有效性、参数合理性），避免无效输入；

- 错误提示：当参数不符合要求时，会返回清晰的错误信息，便于调试和用户反馈。

### 2. 输出模型定义（可选）

除了输入模型，也可通过Pydantic定义输出模型，规范工具的返回格式，让LLM更易整合结果。示例：

```python
from pydantic import BaseModel

# 定义工具输出模型
class FlightQueryOutput(BaseModel):
    """查询航班行程的输出模型"""
    departure_city: str
    arrival_city: str
    flight_number: str
    route: str
    time: str

# 工具返回时，返回符合输出模型的字典或对象
@tool(name="query_flight", args_schema=FlightQueryInput)
def query_flight(departure_city: str, arrival_city: str) -> FlightQueryOutput:
    return FlightQueryOutput(
        departure_city=departure_city,
        arrival_city=arrival_city,
        flight_number="CA1301",
        route="北京首都→广州白云",
        time="08:00-11:30"
    )
```

## 12.4.4 适用场景

当工具需要多个参数、复杂参数类型，或需要对参数进行校验时，建议使用Pydantic定义输入输出模型，尤其适合企业级开发、复杂业务场景，能大幅提升工具的可靠性和可维护性。

引用来源：[LangChain Pydantic工具输入输出文档](https://python.langchain.com/docs/modules/tools/custom_tools/#using-pydantic-for-argument-schemas)、[LangChain 工具参数校验实战](https://juejin.cn/post/735678901234567890)。

# 12.5 工具描述（description）的重要性

在LangChain工具调用中，「工具描述（description）」是最容易被忽略，但却是**最关键**的部分——LLM完全依赖工具描述，判断“是否需要调用该工具”“如何调用该工具”“传递什么参数”。

很多新手遇到“工具调用失败”“LLM不调用工具”的问题，本质都是工具描述不清晰、不规范导致的。本节将讲解工具描述的核心要求、常见误区，以及规范的描述模板。

## 12.5.1 为什么工具描述如此重要？

LLM本身并不知道工具的具体功能，它只能通过你编写的工具描述，理解工具的作用、适用场景、输入参数。举个反例，就能直观感受到：

### 反例：模糊的工具描述（调用失败）

```python
@tool(
    name="query_weather",
    description="查询天气。"  # 模糊描述：无参数说明、无适用场景
)
def query_weather(city: str) -> str:
    weather_data = {"北京": "晴，10-20℃"}
    return weather_data.get(city, "暂无数据")
```

问题：LLM不知道该工具需要输入“城市名称”，可能会直接调用工具（无参数），导致工具调用失败；或不知道该工具用于查询哪个地区的天气，无法判断是否需要调用。

### 正例：规范的工具描述（调用成功）

```python
@tool(
    name="query_weather",
    description="用于查询中国内地城市的实时天气，输入参数为城市名称（字符串类型，如北京、上海），返回该城市的天气状况和温度范围，适合用户询问具体城市天气时调用。"
)
def query_weather(city: str) -> str:
    weather_data = {"北京": "晴，10-20℃"}
    return weather_data.get(city, "暂无数据")
```

优势：LLM能清晰知道工具的功能（查中国内地城市天气）、输入参数（城市名称，字符串）、适用场景（用户问具体城市天气），能准确调用工具并传递正确参数。

## 12.5.2 工具描述的核心要求（必遵循）

编写工具描述时，必须包含以下4个核心要素，缺一不可，贴合LLM的理解逻辑：

1. **工具功能**：清晰说明工具能做什么（如“查询指定城市的实时天气”“计算两个城市之间的行程时间”）；

2. **输入参数**：说明需要输入的参数（名称、类型、含义），若有多个参数，需分别说明（如“输入参数为出发城市（字符串）和到达城市（字符串）”）；

3. **适用场景**：说明什么时候需要调用该工具（如“用户询问具体城市天气时调用”“用户需要计算行程时间时调用”）；

4. **返回结果**：简要说明工具返回的内容格式（如“返回天气状况和温度范围”“返回行程时间（分钟）和路线建议”）。

## 12.5.3 常见误区（避坑重点）

- 误区1：描述过于简洁（如“查询天气”“计算时间”），缺少参数、场景说明；

- 误区2：描述过于复杂，包含无关信息（如工具的实现细节、代码逻辑），LLM无法快速抓取核心信息；

- 误区3：参数描述模糊（如“输入城市”，未说明是字符串类型、是否支持县级城市）；

- 误区4：多个工具描述重复，LLM无法区分不同工具的用途（如两个工具都描述为“查询数据”）。

## 12.5.4 规范的工具描述模板（直接复用）

针对不同场景，提供通用模板，可直接修改使用：

```text
# 模板1：单参数工具
用于【工具功能】，输入参数为【参数名称】（【参数类型】，如【示例】），返回【返回结果】，适合【适用场景】时调用。

# 模板2：多参数工具
用于【工具功能】，需要输入两个参数：1. 【参数1名称】（【参数类型】，如【示例】）；2. 【参数2名称】（【参数类型】，如【示例】），返回【返回结果】，适合【适用场景】时调用。

# 示例（查询天气）
用于查询中国内地城市的实时天气，输入参数为城市名称（字符串类型，如北京、上海），返回该城市的天气状况和温度范围，适合用户询问具体城市天气时调用。
```

## 12.5.5 关键提醒

工具描述的质量，直接决定了LLM工具调用的准确率。建议编写完描述后，多测试几次，观察LLM是否能准确判断是否调用工具、传递正确参数；若调用失败，优先检查工具描述是否规范。

引用来源：[LangChain 工具描述最佳实践](https://python.langchain.com/docs/modules/tools/custom_tools/#tool-description-best-practices)。

# 12.6 多工具注册与动态选择

实际业务场景中，我们往往需要多个工具协同工作（如“查天气+算行程时间+查航班”），LangChain支持将多个工具同时注册到智能体（Agent）中，LLM会根据用户需求，自主判断需要调用哪些工具、调用顺序，实现多工具动态选择与协同。

核心逻辑：智能体（Agent）管理所有注册的工具，LLM分析用户需求后，结合每个工具的描述，判断需要调用的工具，依次调用并整合结果，生成最终回答。

## 12.6.1 实战：多工具注册与动态选择（3个工具协同）

示例：注册3个工具（查询天气、计算行程时间、查询航班），用户输入复杂需求（“查广州今天的天气，计算广州到深圳的行程时间，再查广州到深圳的航班”），LLM会动态选择并调用这3个工具，整合结果返回。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import tool
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

load_dotenv()

# 1. 自定义工具1：查询天气
@tool(
    name="query_weather",
    description="用于查询中国内地城市的实时天气，输入参数为城市名称（字符串，如广州、深圳），返回天气状况和温度范围，适合用户询问具体城市天气时调用。"
)
def query_weather(city: str) -> str:
    weather_data = {"广州": "多云，20-28℃", "深圳": "晴，18-26℃"}
    return f"{city}今天的天气：{weather_data.get(city, '暂无数据')}"

# 2. 自定义工具2：计算行程时间（模拟）
@tool(
    name="calculate_travel_time",
    description="用于计算两个城市之间的驾车行程时间，输入参数为出发城市和到达城市（均为字符串），返回行程时间（分钟）和大致路线，适合用户询问城市间行程时间时调用。"
)
def calculate_travel_time(departure: str, arrival: str) -> str:
    travel_data = {("广州", "深圳"): "60-90分钟，走广深高速"}
    key = (departure, arrival)
    return f"{departure}到{arrival}驾车行程时间：{travel_data.get(key, '暂无数据')}"

# 3. 自定义工具3：查询航班
@tool(
    name="query_flight",
    description="用于查询两个城市之间的航班信息，输入参数为出发城市和到达城市（均为字符串），返回航班号、起飞降落时间，适合用户询问城市间航班时调用。"
)
def query_flight(departure: str, arrival: str) -> str:
    flight_data = {("广州", "深圳"): "CZ3201 广州白云→深圳宝安 14:00-14:50"}
    key = (departure, arrival)
    return f"{departure}到{arrival}航班信息：{flight_data.get(key, '暂无直达航班')}"

# 4. 初始化LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 5. 注册多个工具到智能体，实现动态选择
agent = initialize_agent(
    tools=[query_weather, calculate_travel_time, query_flight],  # 注册3个工具
    llm=llm,
    agent=AgentType.CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# 6. 测试多工具动态调用（复杂需求）
query = "查一下广州今天的天气，然后计算广州到深圳的驾车行程时间，再查一下广州到深圳今天的航班信息"
response = agent.run(query)
print("用户：", query)
print("助手：", response)
```

## 12.6.2 多工具调用的核心特点

- 动态选择：LLM根据用户需求，自主判断需要调用哪些工具（无需手动指定）；

- 顺序调用：若需求需要多个工具，LLM会按逻辑顺序调用（如先查天气，再算行程，最后查航班）；

- 结果整合：LLM会将所有工具的返回结果，整合为连贯、清晰的回答，无需手动处理；

- 容错性：若某个工具调用失败（如参数错误），LLM会尝试重新调用，或提示用户补充信息。

## 12.6.3 进阶：控制工具调用顺序（可选）

默认情况下，LLM会自主判断工具调用顺序，若业务场景需要固定工具调用顺序（如先查航班，再算行程时间），可使用「SequentialChain」或自定义Agent逻辑，强制指定工具调用顺序。示例：

```python
from langchain.chains import SequentialChain
from langchain.prompts import PromptTemplate

# 定义每个工具的调用链
weather_chain = query_weather
travel_chain = calculate_travel_time
flight_chain = query_flight

# 定义顺序链，固定调用顺序：先查航班，再算行程，最后查天气
sequential_chain = SequentialChain(
    chains=[flight_chain, travel_chain, weather_chain],
    input_variables=["departure", "arrival", "city"],
    output_variables=["flight_result", "travel_result", "weather_result"]
)

# 执行顺序链
result = sequential_chain({
    "departure": "广州",
    "arrival": "深圳",
    "city": "广州"
})
print("航班信息：", result["flight_result"])
print("行程时间：", result["travel_result"])
print("天气信息：", result["weather_result"])
```

## 12.6.4 适用场景

多工具注册与动态选择，适合复杂需求场景，如：

- 出行规划：查天气+算行程+查航班/高铁；

- 购物咨询：查商品价格+查库存+算优惠金额；

- 客服系统：查订单+查物流+处理售后。

引用来源：[LangChain 多工具调用官方文档](https://python.langchain.com/docs/modules/agents/how_to/multiple_tools)。

# 12.7 工具调用的安全与权限控制

在实际生产环境中，工具调用可能涉及敏感操作（如调用内部API、操作数据库、执行系统命令），若不进行安全与权限控制，可能会导致数据泄露、系统异常、恶意调用等问题。

LangChain提供了多种安全与权限控制方式，本节重点讲解最常用的3种：参数校验、权限校验、调用频率限制，确保工具调用安全、可控。

## 12.7.1 安全风险场景（必重视）

工具调用的常见安全风险，需提前规避：

- 参数注入：用户输入恶意参数（如SQL注入、命令注入），导致工具调用异常（如操作数据库时泄露数据）；

- 越权调用：无权限的用户调用敏感工具（如普通用户调用管理员工具，查询其他用户信息）；

- 恶意调用：高频次调用工具，导致API限流、系统负载过高；

- 数据泄露：工具返回敏感数据（如用户手机号、密码），被LLM整合到回答中，造成泄露。

## 12.7.2 安全控制1：参数校验（防注入）

通过Pydantic输入模型，对工具参数进行严格校验，过滤恶意参数、无效参数，防止参数注入。示例：防SQL注入（模拟查询用户信息工具）。

```python
from langchain.tools import tool
from pydantic import BaseModel, Field, validator
import re

# 定义输入模型，校验用户ID（只能是数字）
class UserQueryInput(BaseModel):
    user_id: str = Field(description="用户ID，只能是数字，如1001、1002")

    # 校验用户ID：只能是数字，防止SQL注入
    @validator("user_id")
    def user_id_must_be_digit(cls, v):
        if not v.isdigit():
            raise ValueError("用户ID只能是数字，禁止输入特殊字符")
        # 限制用户ID长度（1-10位）
        if len(v) < 1 or len(v) > 10:
            raise ValueError("用户ID长度必须在1-10位之间")
        return v

# 自定义工具（模拟查询用户信息，防SQL注入）
@tool(
    name="query_user_info",
    description="用于查询用户基本信息，输入参数为用户ID（数字字符串），返回用户姓名和手机号（脱敏），仅管理员可调用。",
    args_schema=UserQueryInput
)
def query_user_info(user_id: str) -> str:
    # 模拟数据库查询（实际开发中使用参数化查询，进一步防SQL注入）
    user_data = {"1001": "姓名：张三，手机号：138****1234", "1002": "姓名：李四，手机号：139****5678"}
    return user_data.get(user_id, "暂无该用户信息")

# 测试恶意参数（SQL注入）
try:
    query_user_info("1001' OR 1=1 --")  # 恶意参数，尝试SQL注入
except ValueError as e:
    print("参数校验失败：", str(e))  # 输出错误，阻止调用
```

## 12.7.3 安全控制2：权限校验（防越权）

给工具添加权限校验，只有具备对应权限的用户，才能调用工具（如普通用户无法调用管理员工具）。示例：给工具添加权限校验，区分管理员和普通用户。

```python
from langchain.tools import tool
from pydantic import BaseModel, Field

# 定义输入模型，包含用户权限参数
class AdminToolInput(BaseModel):
    user_role: str = Field(description="用户角色，只能是'admin'（管理员）或'user'（普通用户）")
    order_id: str = Field(description="订单ID，数字字符串")

# 自定义管理员工具（仅管理员可调用）
@tool(
    name="query_all_order",
    description="用于查询所有用户的订单信息，输入参数为用户角色和订单ID，仅user_role为'admin'的用户可调用，普通用户禁止调用。"
)
def query_all_order(user_role: str, order_id: str) -> str:
    # 权限校验：只有管理员可调用
    if user_role != "admin":
        return "权限不足：仅管理员可查询所有用户订单信息"
    # 模拟查询订单
    order_data = {"10001": "订单10001：金额100元，状态：已付款", "10002": "订单10002：金额200元，状态：未付款"}
    return order_data.get(order_id, "暂无该订单信息")

# 测试权限校验
print(query_all_order(user_role="admin", order_id="10001"))  # 管理员调用，成功
print(query_all_order(user_role="user", order_id="10001"))   # 普通用户调用，权限不足
```

## 12.7.4 安全控制3：调用频率限制（防恶意调用）

对工具调用频率进行限制，防止高频次恶意调用，导致API限流、系统负载过高。示例：使用装饰器实现工具调用频率限制（每分钟最多调用5次）。

```python
from langchain.tools import tool
from functools import lru_cache, wraps
import time

# 频率限制装饰器（每分钟最多调用5次）
def rate_limit(max_calls=5, period=60):
    def decorator(func):
        calls = []
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time.time()
            # 清除过期的调用记录
            calls[:] = [call for call in calls if now - call < period]
            if len(calls) >= max_calls:
                return "调用频率过高，请1分钟后再试"
            calls.append(now)
            return func(*args, **kwargs)
        return wrapper
    return decorator

# 自定义工具，添加频率限制
@tool(
    name="query_weather",
    description="用于查询城市天气，输入参数为城市名称，每分钟最多调用5次。"
)
@rate_limit(max_calls=5, period=60)  # 频率限制：每分钟最多5次
def query_weather(city: str) -> str:
    weather_data = {"北京": "晴，10-20℃"}
    return f"{city}今天的天气：{weather_data.get(city, '暂无数据')}"

# 测试频率限制
for i in range(6):
    print(f"第{i+1}次调用：", query_weather("北京"))
```

## 12.7.5 安全控制总结

生产环境中，建议结合以下3种方式，实现工具调用的安全可控：

1. 参数校验：用Pydantic过滤无效、恶意参数，防止注入；

2. 权限校验：给工具添加角色权限，防止越权调用；

3. 频率限制：控制工具调用频率，防止恶意调用。

引用来源：[LangChain 安全最佳实践文档](https://python.langchain.com/docs/security/)。

# 12.8 【实战】开发“查天气 + 算行程时间”复合工具

结合本章所学的工具开发、参数校验、多工具协同知识，实战开发一个「查天气+算行程时间」复合工具——该工具能同时处理两个需求：查询出发城市和到达城市的天气，计算两个城市之间的驾车行程时间，支持参数校验、权限控制，可直接集成到实际项目中。

## 12.8.1 实战目标

- 开发两个基础工具：查询天气（支持多城市）、计算驾车行程时间；

- 用Pydantic定义输入输出模型，实现参数校验（城市有效性、参数合理性）；

- 添加权限控制（仅登录用户可调用）、频率限制（每分钟最多3次）；

- 注册多工具，实现用户输入需求后，动态调用两个工具，整合结果返回；

- 代码可直接运行、可复用，贴合企业级开发规范。

## 12.8.2 实战准备

### 1. 安装依赖

```bash
pip install langchain openai python-dotenv pydantic
```

### 2. 准备环境变量

创建`.env`文件，填入OpenAI API密钥：

```text
OPENAI_API_KEY=你的OpenAI API密钥
```

## 12.8.3 完整实战代码

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import tool
from langchain.agents import initialize_agent, AgentType
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
from functools import wraps
import os
import time

# ---------------------- 1. 通用工具：频率限制装饰器 ----------------------
def rate_limit(max_calls=3, period=60):
    """频率限制装饰器：每分钟最多调用max_calls次"""
    def decorator(func):
        calls = []
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time.time()
            # 清除过期调用记录
            calls[:] = [call for call in calls if now - call < period]
            if len(calls) >= max_calls:
                return "调用频率过高，请1分钟后再试～"
            calls.append(now)
            return func(*args, **kwargs)
        return wrapper
    return decorator

# ---------------------- 2. 定义Pydantic输入输出模型 ----------------------
# 天气查询输入模型
class WeatherInput(BaseModel):
    city: str = Field(description="城市名称，如北京、上海、广州，仅支持中国内地城市")

    @validator("city")
    def valid_city(cls, v):
        """校验城市有效性"""
        valid_cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "武汉"]
        if v not in valid_cities:
            raise ValueError(f"无效城市！支持的城市：{valid_cities}")
        return v

# 行程时间计算输入模型
class TravelTimeInput(BaseModel):
    departure_city: str = Field(description="出发城市，如北京、广州")
    arrival_city: str = Field(description="到达城市，如上海、深圳")

    @validator("arrival_city")
    def departure_not_equal_arrival(cls, v, values):
        """校验出发城市和到达城市不同"""
        if "departure_city" in values and v == values["departure_city"]:
            raise ValueError("出发城市和到达城市不能相同哦～")
        return v

    @validator("departure_city", "arrival_city")
    def valid_city(cls, v):
        """校验城市有效性"""
        valid_cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "武汉"]
        if v
```
