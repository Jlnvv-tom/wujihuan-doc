# 第5章 工具使用：连接外部世界的桥梁

Agent如果只会思考和推理，那它不过是一个被困在文本世界里的"哲学家"。真正让Agent变得有用的是工具——搜索引擎让它能获取实时信息，代码解释器让它能执行计算，API调用让它能操作真实系统。本章将系统讲解Agent的工具使用机制。

## 5.1 工具定义的标准化：OpenAPI与Function Calling

### Function Calling的工作原理

Function Calling是OpenAI在2023年6月推出的核心能力，它让LLM能够"声明"自己想要调用的函数。注意：**模型并不直接执行函数，它只是输出一个结构化的调用请求**，由你的代码负责实际执行。

```
用户 -> LLM -> 输出: {"name": "get_weather", "arguments": {"city": "北京"}}
                                              |
                            你的代码 -> 调用真实API -> 获取结果
                                              |
                            结果 -> 反馈给LLM -> LLM生成最终回答
```

### 工具定义的标准格式

```python
# OpenAI原生格式
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的当前天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称，如'北京'、'上海'"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "温度单位，默认摄氏度"
                    }
                },
                "required": ["city"]
            }
        }
    }
]
```

### LangChain的工具定义

LangChain提供了更Pythonic的工具定义方式：

```python
from langchain_core.tools import tool

@tool
def get_weather(city: str, unit: str = "celsius") -> str:
    """获取指定城市的当前天气信息。

    Args:
        city: 城市名称，如'北京'、'上海'
        unit: 温度单位，'celsius'或'fahrenheit'
    """
    # 实际调用天气API
    import requests
    resp = requests.get(f"https://api.weather.com/v1?city={city}&unit={unit}")
    return resp.json()["description"]

# 工具会自动提取函数签名和docstring作为描述
print(get_weather.name)          # "get_weather"
print(get_weather.description)   # "获取指定城市的当前天气信息..."
print(get_weather.args_schema.schema())  # JSON Schema
```

### 从OpenAPI规范自动生成工具

如果你已经有REST API的OpenAPI文档，可以直接生成工具定义：

```python
from langchain_community.utilities import OpenWeatherMapAPIWrapper

# 或者手动解析OpenAPI JSON
import json

def openapi_to_tools(openapi_spec: dict) -> list[dict]:
    """将OpenAPI规范转换为Function Calling格式"""
    tools = []
    for path, methods in openapi_spec["paths"].items():
        for method, details in methods.items():
            tool = {
                "type": "function",
                "function": {
                    "name": details.get("operationId", f"{method}_{path.replace('/', '_')}"),
                    "description": details.get("summary", ""),
                    "parameters": details.get("requestBody", {}).get(
                        "content", {}
                    ).get("application/json", {}).get("schema", {})
                }
            }
            tools.append(tool)
    return tools
```

> 参考文档：[OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)

## 5.2 搜索引擎集成：实时信息获取与RAG基础

### 为什么Agent需要搜索？

LLM的知识有截止日期（如GPT-4o的知识截止到2024年4月），对于实时信息完全无能为力。搜索引擎让Agent能够获取最新的信息。

### Tavily搜索（推荐）

Tavily是专为AI Agent设计的搜索引擎API，返回结构化结果：

```python
from langchain_community.tools.tavily_search import TavilySearchResults

search = TavilySearchResults(max_results=3)
tools = [search]

# 构建搜索Agent
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个可以搜索互联网的助手。对于需要最新信息的问题，请使用搜索工具。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
```

### DuckDuckGo搜索（免费替代）

```python
from langchain_community.tools import DuckDuckGoSearchRun

search = DuckDuckGoSearchRun()
result = search.run("最新的AI Agent开发框架有哪些？")
print(result)
```

### 搜索作为RAG的基础

搜索工具本质上是一种"实时RAG"——从互联网这个超大知识库中检索相关信息。它与本地RAG的对比：

| 维度 | 搜索工具 | 本地RAG |
|------|---------|---------|
| 数据来源 | 整个互联网 | 私有文档库 |
| 时效性 | 实时 | 取决于更新频率 |
| 可控性 | 低 | 高 |
| 成本 | 按API调用计费 | 基础设施成本 |
| 准确性 | 依赖搜索引擎质量 | 取决于索引和检索质量 |

## 5.3 代码解释器：沙箱环境下的Python代码动态执行

### 代码解释器的价值

LLM可以生成代码，但生成之后呢？代码解释器让Agent能**执行自己生成的代码**，获取运行结果，甚至根据结果修正代码。这是Agent解决数学计算、数据分析、图表生成等任务的关键能力。

### 安全沙箱实现

直接执行LLM生成的代码是极其危险的。必须使用沙箱隔离：

```python
import subprocess
import tempfile
import os

class SafeCodeExecutor:
    """安全的代码执行器，使用子进程+资源限制"""

    FORBIDDEN_IMPORTS = {"os", "subprocess", "shutil", "sys", "socket", "requests"}
    TIMEOUT_SECONDS = 30
    MAX_OUTPUT_CHARS = 10000

    def execute(self, code: str) -> dict:
        # 1. 静态检查：禁止危险导入
        for module in self.FORBIDDEN_IMPORTS:
            if f"import {module}" in code or f"from {module}" in code:
                return {"success": False, "error": f"禁止导入模块：{module}"}

        # 2. 写入临时文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_path = f.name

        try:
            # 3. 在受限子进程中执行
            result = subprocess.run(
                ["python3", temp_path],
                capture_output=True,
                text=True,
                timeout=self.TIMEOUT_SECONDS,
                # 可选：使用资源限制（Linux）
                # preexec_fn=lambda: resource.setrlimit(resource.RLIMIT_AS, (256*1024*1024, 256*1024*1024))
            )

            output = result.stdout[:self.MAX_OUTPUT_CHARS]
            if result.returncode != 0:
                return {"success": False, "error": result.stderr[:1000], "output": output}

            return {"success": True, "output": output}
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "执行超时（30秒）"}
        finally:
            os.unlink(temp_path)

# 使用
executor = SafeCodeExecutor()
result = executor.execute("""
import math
result = math.factorial(100)
print(f"100的阶乘有{len(str(result))}位")
""")
# {"success": True, "output": "100的阶乘有158位\n"}
```

### Docker沙箱（更安全的方案）

```python
import docker

class DockerCodeExecutor:
    def __init__(self):
        self.client = docker.from_env()
        self.image = "python:3.11-slim"

    def execute(self, code: str, timeout: int = 30) -> dict:
        try:
            container = self.client.containers.run(
                self.image,
                command=f"python3 -c {repr(code)}",
                mem_limit="256m",
                cpu_period=100000,
                cpu_quota=50000,  # 50% CPU
                network_disabled=True,
                detach=True,
                timeout=timeout,
            )
            container.wait(timeout=timeout)
            output = container.logs().decode("utf-8")
            container.remove()
            return {"success": True, "output": output[:10000]}
        except Exception as e:
            return {"success": False, "error": str(e)}
```

> 参考文档：[Docker SDK for Python](https://docker-py.readthedocs.io/)

## 5.4 自定义API封装：让Agent调用企业内部服务

### 封装企业API为Agent工具

企业内部的API通常需要认证、有特定的请求格式。将其封装为LangChain工具后，Agent就能像使用搜索工具一样调用它们：

```python
from langchain_core.tools import tool
import requests

@tool
def query_order(order_id: str) -> str:
    """查询订单详情。

    Args:
        order_id: 订单编号，如'ORD202401001'
    """
    resp = requests.get(
        f"https://internal-api.company.com/orders/{order_id}",
        headers={"Authorization": f"Bearer {os.getenv('INTERNAL_API_KEY')}"},
        timeout=10
    )
    if resp.status_code != 200:
        return f"查询失败：{resp.status_code}"
    data = resp.json()
    return f"订单号：{data['id']}\n状态：{data['status']}\n金额：{data['amount']}元"

@tool
def create_ticket(title: str, description: str, priority: str = "medium") -> str:
    """创建工单。

    Args:
        title: 工单标题
        description: 问题描述
        priority: 优先级，可选'low'/'medium'/'high'/'critical'
    """
    resp = requests.post(
        "https://internal-api.company.com/tickets",
        json={"title": title, "description": description, "priority": priority},
        headers={"Authorization": f"Bearer {os.getenv('INTERNAL_API_KEY')}"},
        timeout=10
    )
    if resp.status_code != 201:
        return f"创建失败：{resp.status_code}"
    return f"工单已创建，编号：{resp.json()['ticket_id']}"
```

### 工具设计原则

| 原则 | 说明 | 示例 |
|------|------|------|
| 描述精确 | 让模型准确判断何时使用 | "查询订单详情" > "查询信息" |
| 参数明确 | 类型、枚举值、必填项清晰 | priority: "low"/"medium"/"high" |
| 安全默认 | 默认行为应是最安全的 | 查询只返回脱敏数据 |
| 错误友好 | 返回人类可读的错误信息 | "订单不存在" > 500错误 |
| 幂等设计 | 相同输入多次调用结果一致 | 查询操作天然幂等，写操作需注意 |

### 批量操作工具

对于需要批量处理的场景，设计批量工具比逐条调用效率高得多：

```python
@tool
def batch_query_orders(order_ids: str) -> str:
    """批量查询多个订单详情。

    Args:
        order_ids: 订单编号列表，以逗号分隔，如'ORD001,ORD002,ORD003'
    """
    ids = [id.strip() for id in order_ids.split(",")]
    resp = requests.post(
        "https://internal-api.company.com/orders/batch",
        json={"order_ids": ids},
        headers={"Authorization": f"Bearer {os.getenv('INTERNAL_API_KEY')}"},
        timeout=30
    )
    return json.dumps(resp.json(), ensure_ascii=False, indent=2)
```

## 5.5 工具选择策略：多工具场景下的路由与优先级排序

### 工具路由的挑战

当Agent拥有10+工具时，LLM在每一步都需要决定是否调用工具、调用哪个工具。工具越多，选择的准确率越低。

### 策略一：按领域分组工具

```python
# 将工具按功能域分组
TOOL_GROUPS = {
    "search": [tavily_search, wiki_search],
    "database": [query_order, query_user, query_product],
    "system": [create_ticket, send_notification],
    "code": [code_interpreter],
}

def select_tools_by_intent(intent: str, all_tools: list) -> list:
    """根据用户意图筛选相关工具"""
    intent_tool_map = {
        "查询信息": TOOL_GROUPS["search"] + TOOL_GROUPS["database"],
        "执行操作": TOOL_GROUPS["system"],
        "计算分析": TOOL_GROUPS["code"],
        "通用": all_tools,
    }
    return intent_tool_map.get(intent, all_tools)
```

### 策略二：工具优先级

为工具设置优先级，当多个工具都匹配时，优先使用高优先级的：

```python
PRIORITY_TOOLS = [
    (get_weather, 10),       # 高优先级：精确的天气API
    (tavily_search, 5),      # 中优先级：通用搜索
    (wiki_search, 3),        # 低优先级：百科搜索
]

def prioritize_tools(candidate_tools: list) -> list:
    """按优先级排序工具"""
    priority_dict = dict(PRIORITY_TOOLS)
    return sorted(candidate_tools, key=lambda t: priority_dict.get(t, 0), reverse=True)
```

### 策略三：少即是多

研究表明，当工具数量超过10个时，LLM的工具选择准确率显著下降。解决方法是**动态裁剪**——每轮只向LLM暴露最相关的工具：

```python
class DynamicToolSelector:
    def __init__(self, all_tools: list, max_tools: int = 5):
        self.all_tools = all_tools
        self.max_tools = max_tools

    def select(self, user_input: str) -> list:
        """根据用户输入选择最相关的工具"""
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

        tool_descriptions = "\n".join([
            f"{i}. {t.name}: {t.description}"
            for i, t in enumerate(self.all_tools)
        ])

        selection_prompt = f"""
用户输入：{user_input}

可用工具列表：
{tool_descriptions}

请选择最相关的{self.max_tools}个工具（只返回编号，逗号分隔）：
"""
        response = llm.invoke(selection_prompt).content
        try:
            indices = [int(x.strip()) for x in response.split(",")]
            return [self.all_tools[i] for i in indices if 0 <= i < len(self.all_tools)]
        except:
            # 解析失败时返回前N个工具作为兜底
            return self.all_tools[:self.max_tools]
```

### 策略四：工具使用约束

对于高风险工具，添加使用约束：

```python
@tool
def delete_database_record(table: str, record_id: str) -> str:
    """[谨慎使用] 删除数据库记录。此操作不可逆！

    Args:
        table: 表名
        record_id: 记录ID
    """
    # 系统提示词中添加约束
    return "此工具需要管理员二次确认才能执行"
```

在Agent的系统提示词中明确工具使用规则：

```python
TOOL_RULES = """
## 工具使用规则
1. 优先使用专用工具（如get_weather）而非通用搜索
2. 写操作（创建/删除/修改）需要先向用户确认
3. 如果不确定用哪个工具，先使用搜索工具收集信息
4. 同一工具在3次失败后换用替代方案
5. 涉及敏感数据的操作必须脱敏后再返回给用户
"""
```

## 本章小结

| 主题 | 关键技术 | 实践要点 |
|------|---------|---------|
| 工具定义 | Function Calling + LangChain @tool | 描述精确、参数明确、安全默认 |
| 搜索集成 | Tavily / DuckDuckGo | 实时信息获取 + RAG基础 |
| 代码执行 | 子进程沙箱 / Docker隔离 | 禁止危险导入、超时限制、输出截断 |
| API封装 | @tool装饰器 + 请求封装 | 认证管理、错误友好、批量操作 |
| 工具路由 | 领域分组 + 优先级 + 动态裁剪 | 控制暴露工具数量（<=10）、高风险工具约束 |

> 下一章，我们将深入RAG技术——如何构建知识库驱动型Agent，让Agent拥有专业领域的深度知识。
