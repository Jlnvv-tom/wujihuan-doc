# 第6章 插件功能开发：聊天机器人实时联网

不会联网的AI，就像没手机的人类——明明什么都知道，就是查不到最新信息。

我是怕浪猫，前两章给AI装了记忆和知识库，但它还是有个硬伤——不知道实时信息。这章我们给AI装上"手和脚"，让它能联网搜索、调用工具，真正成为一个Agent。

---

## 6.1 LLM 应用的短板与局限性

**纯LLM的能力边界**

| 能力 | 状态 | 说明 |
|------|------|------|
| 历史知识 | 强 | 训练数据覆盖的知识 |
| 实时信息 | 弱 | 知识有截止日期 |
| 数学计算 | 中 | 复杂计算容易出错 |
| 代码执行 | 无 | 不能真正运行代码 |
| 外部交互 | 无 | 不能调用API、查数据库 |
| 精确查询 | 弱 | 可能产生幻觉 |

**LLM需要什么**

1. **工具**：让LLM能调用外部API、搜索网络、查数据库
2. **规划**：让LLM能自主决定用哪个工具、按什么顺序
3. **执行**：让LLM能运行代码、操作文件
4. **反馈**：让LLM能看到工具执行结果，决定下一步

> LLM没有手和脚，它只是一个"大脑"。Agent = LLM + 工具 + 规划能力，给大脑装上四肢。

---

## 6.2 GPT / New Bing 联网底层原理

**New Bing的联网架构**

```
用户提问 → 判断是否需要联网
  ↓ 是
搜索相关网页 → 提取网页内容 → 喂给LLM → 生成回答
  ↓ 否
直接用LLM知识回答
```

**核心步骤**

1. **意图识别**：用户的问题是否需要最新信息？
2. **查询生成**：生成搜索关键词
3. **搜索执行**：调用搜索引擎API
4. **内容提取**：提取搜索结果的关键内容
5. **综合回答**：LLM基于搜索结果生成回答

**手动实现联网搜索**

```python
# services/search_service.py
import requests
from bs4 import BeautifulSoup

class SearchService:
    def __init__(self, api_key):
        self.api_key = api_key
    
    def search(self, query, num_results=5):
        """使用搜索引擎API搜索"""
        # 使用SerpAPI或类似服务
        url = "https://serpapi.com/search"
        params = {
            "q": query,
            "api_key": self.api_key,
            "num": num_results
        }
        response = requests.get(url, params=params)
        results = response.json().get("organic_results", [])
        
        return [{
            "title": r.get("title"),
            "link": r.get("link"),
            "snippet": r.get("snippet")
        } for r in results]
    
    def extract_content(self, url):
        """提取网页内容"""
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        # 移除脚本和样式
        for tag in soup(['script', 'style', 'nav', 'footer']):
            tag.decompose()
        return soup.get_text()[:3000]  # 截取前3000字符
```

---

## 6.3 Agent 基础概念与适用场景

**什么是Agent**

Agent = 能自主感知环境、做出决策、采取行动的LLM应用。

**Agent vs 普通LLM应用**

| 维度 | 普通LLM | Agent |
|------|---------|-------|
| 行为模式 | 被动回答 | 主动规划+执行 |
| 工具使用 | 无 | 自主选择工具 |
| 决策能力 | 无 | 观察结果→决定下一步 |
| 循环能力 | 一次调用 | 多轮思考+行动 |

**Agent的四种模式**

1. **ReAct**：思考→行动→观察→循环
2. **Plan-and-Execute**：先规划所有步骤，再逐步执行
3. **Reflection**：执行后自我评估，调整策略
4. **Multi-Agent**：多个Agent协作

**适用场景**

| 场景 | Agent类型 | 示例 |
|------|----------|------|
| 联网搜索 | ReAct | "今天北京天气怎么样" |
| 多步推理 | Plan-and-Execute | "帮我分析竞品并写报告" |
| 代码调试 | Reflection | "这段代码有什么问题" |
| 复杂任务 | Multi-Agent | "帮我从0开发一个网站" |

---

## 6.4 LLM 函数回调与格式化输出

**Function Calling原理**

LLM本身不能调用函数，但它能生成"调用函数的意图"——函数名和参数。代码层负责实际执行。

```python
# 定义函数
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "城市名称"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "温度单位"
                }
            },
            "required": ["city"]
        }
    }
}]

# 调用LLM
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "北京今天天气怎么样？"}],
    tools=tools,
    tool_choice="auto"
)

# 检查是否需要调用工具
if response.choices[0].message.tool_calls:
    tool_call = response.choices[0].message.tool_calls[0]
    print(f"函数名: {tool_call.function.name}")
    print(f"参数: {tool_call.function.arguments}")
    # 输出: 函数名: get_weather  参数: {"city": "北京"}
```

**格式化输出**

```python
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.pydantic_v1 import BaseModel, Field

class SearchResult(BaseModel):
    query: str = Field(description="搜索查询")
    results: list = Field(description="搜索结果列表")
    summary: str = Field(description="结果摘要")

parser = JsonOutputParser(pydantic_object=SearchResult)

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个搜索助手。{format_instructions}"),
    ("user", "{input}")
])

chain = prompt | llm | parser
result = chain.invoke({
    "input": "搜索Python最新版本",
    "format_instructions": parser.get_format_instructions()
})
```

---

## 6.5 LangChain 工具组件：3 种自定义工具创建技巧

**方式一：@tool装饰器**

```python
from langchain_core.tools import tool

@tool
def search_web(query: str) -> str:
    """搜索网络获取实时信息。当用户询问实时信息时使用此工具。"""
    search = SearchService(api_key="xxx")
    results = search.search(query)
    return "\n".join([f"{r['title']}: {r['snippet']}" for r in results])

@tool
def get_weather(city: str) -> str:
    """获取指定城市的天气信息。"""
    # 调用天气API
    return f"{city}今天晴，气温25度"
```

**方式二：Tool类**

```python
from langchain_core.tools import Tool

search_tool = Tool(
    name="web_search",
    description="搜索网络获取实时信息。输入应为搜索查询字符串。",
    func=lambda query: search_service.search(query)
)
```

**方式三：StructuredTool**

```python
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

class CalculatorInput(BaseModel):
    expression: str = Field(description="数学表达式，如 '2+3*4'")

def calculator(expression: str) -> str:
    """安全计算数学表达式"""
    try:
        result = eval(expression, {"__builtins__": {}}, {})
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

calculator_tool = StructuredTool.from_function(
    func=calculator,
    name="calculator",
    description="计算数学表达式。当需要数学计算时使用。",
    args_schema=CalculatorInput
)
```

**三种方式对比**

| 方式 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| @tool | 简洁、类型推断 | 灵活性一般 | 简单工具 |
| Tool | 灵活 | 参数类型弱 | 快速封装 |
| StructuredTool | 类型完整 | 代码较多 | 生产环境 |

> 生产环境推荐StructuredTool——参数校验、类型提示、文档完整，少出错。

---

## 6.6 LangChain 中构建 Agent：让 LLM 自主决策工具选择

**ReAct Agent**

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain_core.prompts import PromptTemplate

llm = ChatOpenAI(model="gpt-4", temperature=0)
tools = [search_web, get_weather, calculator_tool]

# ReAct提示词模板
react_prompt = PromptTemplate.from_template(
    """你是一个有帮助的AI助手，可以使用以下工具：

{tools}

使用工具时，请使用以下格式：
Question: 用户的问题
Thought: 你应该怎么思考
Action: 要使用的工具名（必须是[{tool_names}]之一）
Action Input: 工具的输入
Observation: 工具的返回结果
... (Thought/Action/Action Input/Observation可以重复)
Thought: 我现在知道最终答案了
Final Answer: 最终答案

开始！

Question: {input}
Thought: {agent_scratchpad}"""
)

agent = create_react_agent(llm, tools, react_prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=5,
    handle_parsing_errors=True
)

# 执行
result = agent_executor.invoke({"input": "北京今天天气怎么样？明天气温多少？"})
print(result["output"])
```

**Agent执行流程**

```
用户: "北京今天天气怎么样？"
  ↓
Thought: 需要获取天气信息
Action: get_weather
Action Input: {"city": "北京"}
Observation: 北京今天晴，气温25度
  ↓
Thought: 我已经获取了天气信息
Final Answer: 北京今天天气晴，气温25度。
```

**Agent配置参数**

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| max_iterations | 最大推理轮数 | 5-10 |
| handle_parsing_errors | 解析错误处理 | True |
| verbose | 打印推理过程 | 开发时True |
| max_execution_time | 最大执行时间 | 60s |
| early_stopping_method | 提前停止策略 | "generate" |

---

## 6.7 LCEL 与 LangGraph 流结构

**从LCEL到LangGraph**

LCEL是线性管道，适合单链场景。但Agent需要循环（思考→行动→观察→再思考），LCEL不够用了。LangGraph就是解决这个问题的。

**LangGraph核心概念**

| 概念 | 说明 | 对应代码 |
|------|------|---------|
| State | 全局状态 | TypedDict |
| Node | 处理节点 | 函数 |
| Edge | 节点连接 | add_edge |
| Conditional Edge | 条件路由 | add_conditional_edge |
| Graph | 完整图 | StateGraph |

**简单Agent图**

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, List
import operator

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    tool_calls: list
    current_tool: str
    tool_result: str

def agent_node(state):
    """Agent思考节点"""
    messages = state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}

def should_use_tool(state):
    """判断是否需要使用工具"""
    last_msg = state["messages"][-1]
    if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
        return "execute_tool"
    return "end"

def execute_tool_node(state):
    """工具执行节点"""
    last_msg = state["messages"][-1]
    tool_calls = last_msg.tool_calls
    
    results = []
    for tc in tool_calls:
        tool_name = tc["name"]
        tool_args = tc["args"]
        # 查找并执行工具
        tool = tool_map.get(tool_name)
        result = tool.invoke(tool_args)
        results.append(result)
    
    return {"messages": results, "tool_result": str(results)}

# 构建图
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tool", execute_tool_node)

graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_use_tool, {
    "execute_tool": "tool",
    "end": END
})
graph.add_edge("tool", "agent")

app = graph.compile()
```

---

## 6.8 LangGraph 构建图应用：可观测 Agent

**可观测Agent架构**

```
用户输入 → Agent思考 → 是否用工具？
                          ↓ 是
                       执行工具 → 获取结果 → Agent再思考
                          ↓ 否
                       生成回答 → 输出
```

**完整联网搜索Agent**

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

# 定义工具
@tool
def web_search(query: str) -> str:
    """搜索网络获取实时信息"""
    search = SearchService(api_key="xxx")
    results = search.search(query)
    return "\n".join([f"{r['title']}: {r['snippet']}" for r in results[:3]])

tools = [web_search]
llm_with_tools = llm.bind_tools(tools)

# 定义节点
def chatbot(state):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

def route_tools(state):
    last_msg = state["messages"][-1]
    if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
        return "tools"
    return END

# 构建图
graph = StateGraph(AgentState)
graph.add_node("chatbot", chatbot)
graph.add_node("tools", ToolNode(tools))

graph.set_entry_point("chatbot")
graph.add_conditional_edges("chatbot", route_tools)
graph.add_edge("tools", "chatbot")

app = graph.compile()
```

**添加可观测性**

```python
from langsmith import Client

# 配置LangSmith
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "your-langsmith-key"

# 所有链的执行都会自动记录到LangSmith
# 包括：输入、输出、每步耗时、Token消耗、工具调用记录
```

---

## 6.9 完成聊天机器人实时联网搜索功能

**后端API集成**

```python
# routes/chat.py 新增
@chat_bp.route('/completions', methods=['POST'])
def completions():
    data = request.json
    use_tools = data.get('use_tools', False)
    
    if use_tools:
        # 使用Agent模式
        result = agent_service.run(
            message=data['message'],
            conversation_id=data.get('conversation_id'),
            model=data.get('model', 'gpt-4')
        )
    else:
        # 普通模式
        result = chat_service.completions(
            message=data['message'],
            conversation_id=data.get('conversation_id'),
            model=data.get('model', 'gpt-4')
        )
    
    return success(data=result)
```

**AgentService实现**

```python
# services/agent_service.py
class AgentService:
    def __init__(self):
        self.llm = LLMService()
        self.memory = MemoryService(self.llm)
        self.graph = self._build_graph()
    
    def _build_graph(self):
        tools = [web_search, get_weather, calculator_tool]
        llm_with_tools = ChatOpenAI(model="gpt-4").bind_tools(tools)
        
        graph = StateGraph(AgentState)
        graph.add_node("chatbot", lambda s: {"messages": [llm_with_tools.invoke(s["messages"])]})
        graph.add_node("tools", ToolNode(tools))
        graph.set_entry_point("chatbot")
        graph.add_conditional_edges("chatbot", route_tools)
        graph.add_edge("tools", "chatbot")
        
        return graph.compile()
    
    def run(self, message, conversation_id=None, model='gpt-4'):
        # 获取历史
        if conversation_id:
            history = self.memory.get_history_with_summary(conversation_id)
        else:
            history = []
        
        history.append({"role": "user", "content": message})
        
        # 执行Agent
        result = self.graph.invoke({"messages": history})
        
        # 保存结果
        assistant_msg = result["messages"][-1]
        # ... 持久化逻辑
        
        return {
            "conversation_id": conversation_id,
            "message": assistant_msg.content,
            "tool_calls": [tc for m in result["messages"] if hasattr(m, 'tool_calls') for tc in m.tool_calls]
        }
```

**前端切换Agent模式**

```javascript
// stores/chat.js 新增
const useAgent = ref(false)

const sendMessage = async (content) => {
  loading.value = true
  try {
    messages.value.push({ role: 'user', content })
    
    const res = await chatAPI.sendMessage({
      message: content,
      conversation_id: currentConvId.value,
      use_tools: useAgent.value  // 传递是否使用Agent
    })
    
    messages.value.push({ role: 'assistant', content: res.data.message })
  } finally {
    loading.value = false
  }
}
```

> Agent模式不是万能的——简单问答用普通模式更快更省Token，需要实时信息或多步推理时才开Agent。在LLMOps平台里，让用户自己选择模式是最好的。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| LLM局限性 | 无实时信息、不能执行、不能交互 |
| Agent概念 | LLM + 工具 + 规划 = Agent |
| Function Calling | LLM生成调用意图，代码层执行 |
| LangChain工具 | @tool / Tool / StructuredTool三种方式 |
| ReAct Agent | 思考→行动→观察循环 |
| LangGraph | 图结构Agent，支持循环和条件路由 |
| 联网搜索 | 搜索API + 内容提取 + Agent编排 |
| 可观测性 | LangSmith追踪每步执行 |

---

觉得有用？收藏起来，下次直接照抄。

你用Agent做过什么有趣的应用？评论区聊聊。

关注怕浪猫，下期我们做可视化编排——让用户不用写代码就能配置AI应用。

系列进度 6/23

**下章预告：** 第7章进入可视化编排开发——YAML动态编排、OpenAPI Schema接入、Prompt管理、知识库集成，让非技术人员也能配置AI应用。
