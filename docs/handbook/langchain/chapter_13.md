# 第13章 智能体（Agents）基础（LangChain实战）

在前一章中，我们掌握了「工具（Tools）」的开发与调用，但这种调用更偏向于“单任务执行”——用户明确指令调用某个工具，程序被动执行。而在复杂的业务场景中，用户的需求往往是模糊的、多步骤的，例如：“帮我看看某只股票现在的价格，再算一下我持有1000股的收益，最后给出卖出建议”。

此时，我们需要一个“决策者”来统筹全局，这就是 **LangChain Agents（智能体）** 的核心价值。Agent 以 LLM 为“大脑”，能够自主理解复杂需求、规划执行步骤、选择合适工具、反思执行结果，最终完成多步骤的复杂任务。

本章将从 Agent 的核心概念出发，拆解其工作流程，对比主流 Agent 类型，掌握初始化方法与安全防护，并通过实战构建一个能查股票、算收益的金融助理，代码简洁可复用，贴合掘金技术博客的实战风格。

引用来源：[LangChain Agents 官方文档](https://python.langchain.com/docs/modules/agents/)、[LangChain Agent Types 官方文档](https://python.langchain.com/docs/modules/agents/agent_types/)

# 13.1 Agent 是什么？LLM 作为“大脑”

在 LangChain 中，**Agent（智能体）** 是一个集成了“认知能力”与“执行能力”的核心组件。它不仅仅是工具的调用者，更是任务的“规划者”和“决策者”。

## 13.1.1 核心定义

Agent 的本质是 **“LLM + 工具 + 决策逻辑”** 的组合体：

- **LLM（大脑）**：负责理解用户需求、生成推理步骤、选择工具、分析执行结果。
- **工具（手脚）**：负责执行具体的操作（如查股票、算数值、查天气）。
- **决策逻辑（中枢）**：负责控制执行流程、判断是否停止、处理异常。

## 13.1.2 为什么需要 Agent？（对比 Chain）

| 特性         | Chain（链）                     | Agent（智能体）                            |
| :----------- | :------------------------------ | :----------------------------------------- |
| **执行逻辑** | 固定流程，按预设顺序执行        | 动态流程，根据实时情况调整                 |
| **决策能力** | 无，完全依赖开发者编写的逻辑    | 有，LLM 自主规划步骤                       |
| **适用场景** | 简单、固定的单任务/多任务流水线 | 复杂、模糊、需要多步骤推理的任务           |
| **例子**     | 先查天气 → 再查航班（固定顺序） | “帮我规划明天的出行”（需自主判断先做什么） |

简单来说，**Chain 是“按剧本演戏”，而 Agent 是“即兴发挥”**。

## 13.1.3 Agent 的核心价值

1. **任务拆解**：将复杂需求拆解为多个可执行的子任务（如“查股票收益”拆解为“查当前价”→“算成本”→“算收益”）。
2. **工具选择**：根据子任务类型，自主选择最合适的工具。
3. **结果反思**：执行完工具后，判断结果是否满足需求，若不满足则重新规划。
4. **自主执行**：无需人工干预，端到端完成复杂任务。

# 13.2 Agent 的工作流程：思考 → 选择工具 → 执行 → 反思

Agent 的工作流程遵循 **ReAct（Reason + Act）** 框架，这是一种让 LLM 结合推理与行动来解决问题的范式。其核心流程可以概括为 **4 个循环步骤**，直到满足停止条件。

## 13.2.1 核心流程（ReAct 循环）

为了让你更直观地理解，我们将流程拆解为以下步骤，并配合极简图例。

### 极简图例：Agent 工作流程

```
用户输入 → [思考] → [选择工具] → [执行工具] → [反思] → 满足条件？→ 生成回答/继续循环
```

### 详细步骤解析

1. **思考（Reason）**：
   Agent 接收用户输入后，结合历史对话，**推理**出当前需要解决的子任务，判断是否需要调用工具，以及需要什么信息。

   > _例：用户问“我的茅台股票赚了多少？”，Agent 思考：“我需要知道当前价格和用户的成本价，需要调用查股票工具。”_

2. **选择工具（Action Selection）**：
   Agent 根据思考结果，从已注册的工具列表中，**选择**最适合的工具，并生成符合格式的调用指令（包含工具名称和参数）。

3. **执行工具（Action Execution）**：
   Agent 调用选定的工具，传入参数，**执行**并获取工具的返回结果。

4. **反思（Observation & Reflection）**：
   Agent 接收工具的返回结果，**分析**结果是否有效、是否足够回答用户问题。
   - 若结果足够：停止循环，生成最终回答。
   - 若结果不足（如缺少参数）：重新进入“思考”步骤，规划下一步行动。

## 13.2.2 关键术语

- **Thought**：思考内容，Agent 的推理过程。
- **Action**：行动，包含工具名称（`tool`）和参数（`tool_input`）。
- **Observation**：观察，工具执行后的返回结果。
- **Final Answer**：最终答案，Agent 整合所有 Observation 后生成的回答。

# 13.3 支持的 Agent 类型（Zero-shot ReAct、Self-ask 等）

LangChain 提供了多种 Agent 类型，分别适配不同的任务场景和 LLM 能力。选择合适的 Agent 类型，是保证任务成功执行的关键。

本节重点介绍 **4 种最常用的 Agent 类型**，并说明其适用场景。

## 13.3.1 主流 Agent 类型对比

| Agent 类型                    | 核心特点                                     | 适用场景                       | 依赖 LLM 能力          |
| :---------------------------- | :------------------------------------------- | :----------------------------- | :--------------------- |
| **Zero-shot ReAct**           | 最经典，无历史训练，完全依赖工具描述进行推理 | 通用场景、多工具协同、复杂推理 | 中高（需理解工具描述） |
| **Self-ask with Search**      | 擅长多轮自问自答，逐步拆解问题               | 知识问答、需要逐步探索的问题   | 中（需擅长拆解问题）   |
| **Chat Conversational ReAct** | 专为对话场景设计，支持记忆（Memory）         | 聊天机器人、带记忆的客服助理   | 中高（需结合对话历史） |
| **Structured Chat**           | 支持结构化工具调用，参数校验更严格           | 企业级应用、复杂参数工具       | 高（需严格遵循格式）   |

## 13.3.2 详细说明

### 1. Zero-shot ReAct（推荐首选）

- **全称**：Zero-shot Reasoning and Acting。
- **核心逻辑**：LLM 仅根据工具的 `description`（描述）来判断如何调用工具，无需任何示例。
- **标识**：`AgentType.ZERO_SHOT_REACT_DESCRIPTION`。
- **适用**：绝大多数通用场景，是新手的最佳选择。

### 2. Chat Conversational ReAct

- **核心逻辑**：在 Zero-shot ReAct 的基础上，增加了对 **Memory（记忆）** 的支持。
- **标识**：`AgentType.CHAT_CONVERSATIONAL_REACT_DESCRIPTION`。
- **适用**：需要记住用户历史对话的场景（如“你还记得我持有茅台吗？”）。

### 3. Self-ask with Search

- **核心逻辑**：通过“自问自答”的方式，将复杂问题拆解为一系列简单问题，逐步搜索答案。
- **标识**：`AgentType.SELF_ASK_WITH_SEARCH`。
- **适用**：需要深度知识挖掘的问答场景（如“谁是《三体》的作者？他还写过什么书？”）。

### 4. Structured Chat

- **核心逻辑**：强制使用结构化的格式调用工具，对参数的校验更严格，适合复杂的 Pydantic 模型参数。
- **标识**：`AgentType.STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION`。
- **适用**：企业级复杂业务工具，参数较多且需严格校验的场景。

# 13.4 使用 initialize_agent 快速创建 Agent

LangChain 提供了 **`initialize_agent`** 函数，这是创建 Agent 最快捷、最常用的方法。它封装了复杂的底层逻辑，只需传入 LLM、工具列表和 Agent 类型，即可一键生成可执行的 Agent。

## 13.4.1 核心步骤

1. **准备 LLM**：初始化大语言模型（如 GPT-3.5/4）。
2. **准备 Tools**：定义或加载需要使用的工具。
3. **调用 initialize_agent**：传入 LLM、Tools、Agent 类型，配置参数。
4. **执行任务**：调用 `agent.run()` 或 `agent.invoke()` 执行用户需求。

## 13.4.2 快速上手代码示例

本示例使用 **Zero-shot ReAct** 类型，结合「计算器工具」，实现一个简单的数学计算助理。

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import Calculator
from langchain.agents import initialize_agent, AgentType
from dotenv import load_dotenv
import os

# 1. 加载环境变量
load_dotenv()

# 2. 初始化 LLM（大脑）
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,  # 智能体推理时，温度建议设低，保证逻辑严谨
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 3. 初始化工具（手脚）
tools = [Calculator()]

# 4. 快速创建 Agent
agent = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,  # 选择 Zero-shot ReAct 类型
    verbose=True,  # 开启详细日志，便于查看思考和执行过程
    handle_parsing_errors="请检查你的输入格式，确保参数正确"  # 处理解析错误
)

# 5. 执行复杂任务
task = "计算 123 的平方，加上 456 的立方，最后除以 789，结果是多少？"
result = agent.run(task)

print(f"\n【最终结果】：{result}")
```

## 13.4.3 关键参数解析

在 `initialize_agent` 中，除了必填参数，还有几个关键的可选参数需要掌握：

- **`verbose`**：是否开启详细日志。开发阶段建议设为 `True`，可以清晰看到 Agent 的「思考-行动-观察」过程。
- **`handle_parsing_errors`**：当 Agent 生成的工具调用格式错误时，如何处理。可以设为字符串（错误提示）或函数（自定义处理逻辑）。
- **`max_iterations`**：最大循环次数。防止 Agent 陷入死循环（详见 13.5 节）。
- **`memory`**：传入 Memory 实例，让 Agent 具备记忆能力（如 `Chat Conversational ReAct` 类型）。

# 13.5 Agent 的停止条件与循环防护

Agent 的工作流程是一个**循环**，如果没有合理的停止条件，它可能会陷入无限循环（例如：工具调用失败 → 重新思考 → 再次失败 → ...）。

因此，设置 **停止条件** 和 **循环防护** 是生产环境中必不可少的步骤。

## 13.5.1 内置停止条件

LangChain Agent 有两个核心的内置停止条件，满足其一即停止循环：

1. **生成 Final Answer**：Agent 认为已获取足够信息，生成了以 `Final Answer:` 开头的回答。
2. **达到最大迭代次数**：循环次数达到 `max_iterations` 设定的值。

## 13.5.2 核心防护参数

在 `initialize_agent` 中，通过以下参数进行循环防护：

| 参数                        | 作用                     | 推荐值                    |
| :-------------------------- | :----------------------- | :------------------------ |
| **`max_iterations`**        | 设置最大循环次数         | 3-5（根据任务复杂度调整） |
| **`early_stopping_method`** | 达到最大次数时的停止策略 | `"force"`（强制停止）     |
| **`max_execution_time`**    | 设置最大执行时间（秒）   | 60（防止长时间运行）      |

## 13.5.3 代码示例：添加循环防护

```python
# 在 initialize_agent 中添加防护参数
agent = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True,
    max_iterations=3,  # 最多循环 3 次
    early_stopping_method="force",  # 达到次数后强制停止
    max_execution_time=60,  # 最多运行 60 秒
)

# 测试一个可能导致循环的任务（工具无法回答的问题）
try:
    task = "告诉我宇宙的尽头在哪里？"
    result = agent.run(task)
except Exception as e:
    print(f"任务执行失败：{e}")
```

## 13.5.4 自定义停止条件（进阶）

除了内置条件，你还可以通过自定义 **`AgentExecutor`** 来实现更复杂的停止条件（如：当工具返回特定关键词时停止）。

引用来源：[LangChain Agent 停止条件文档](https://python.langchain.com/docs/modules/agents/how_to/early_stopping)

# 13.6 日志与中间步骤可视化

在开发和调试 Agent 时，仅仅看到最终结果是不够的。我们需要了解 Agent **“为什么这么想”**、**“为什么选这个工具”**，这就需要借助日志和中间步骤可视化。

## 13.6.1 开启 Verbose 日志（基础）

最简单的方式是将 `verbose=True`，此时控制台会打印出完整的 ReAct 循环过程，包含 **Thought**、**Action**、**Observation**。

**日志示例**：

```
> Entering new AgentExecutor chain...
Thought: 我需要计算 123 的平方，应该使用计算器工具。
Action:
{
  "action": "Calculator",
  "action_input": "123 ** 2"
}
Observation: 15129
Thought: 现在我需要加上 456 的立方，继续使用计算器。
Action:
{
  "action": "Calculator",
  "action_input": "15129 + 456 ** 3"
}
Observation: 95459185
...
```

## 13.6.2 使用 LangSmith 可视化（进阶）

对于更复杂的 Agent，LangChain 官方提供了 **LangSmith** 平台，用于追踪、调试和可视化 LLM 应用的执行过程。

### 1. 安装与配置

```bash
pip install langsmith
```

在 `.env` 中添加：

```text
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=你的LangSmith密钥
LANGCHAIN_PROJECT=agent-demo
```

### 2. 自动追踪

配置完成后，所有 Agent 的执行过程会**自动上传**到 LangSmith 平台。你可以在网页上看到：

- 完整的思考链（Thought Chain）。
- 每个工具的调用时间、参数、返回值。
- Token 消耗统计。
- 失败原因分析。

这对于生产环境的问题排查和性能优化至关重要。

引用来源：[LangSmith 官方文档](https://docs.smith.langchain.com/)

# 13.7 Agent 的局限性与失败案例分析

尽管 Agent 很强大，但它并非万能的。了解其局限性，能帮助我们在实际开发中**避坑**，并设计更稳健的系统。

## 13.7.1 核心局限性

1. **幻觉导致的错误工具选择**：LLM 可能会“脑补”出不存在的工具，或错误理解工具描述，导致调用错误的工具。
2. **格式解析错误**：Agent 生成的工具调用指令（JSON 格式）可能存在语法错误，导致无法解析。
3. **无限循环**：在工具返回结果不符合预期时，Agent 可能会反复调用同一工具，陷入死循环。
4. **上下文窗口限制**：长对话或多步骤任务会导致思考链过长，超出 LLM 的上下文窗口，丢失关键信息。
5. **缺乏领域知识**：在专业领域（如医疗、法律），Agent 可能会做出错误的推理。

## 13.7.2 典型失败案例与解决方案

### 案例 1：工具描述模糊导致调用失败

**现象**：用户问“查一下天气”，Agent 不知道调用哪个工具（或传什么参数）。
**原因**：工具描述中未明确说明参数要求。
**解决方案**：严格遵循 12.5 节的工具描述模板，清晰说明**功能、参数、适用场景**。

### 案例 2：格式错误导致执行中断

**现象**：Agent 生成的 Action 不是合法的 JSON。
**原因**：LLM 生成内容时偶尔会出现格式错误。
**解决方案**：设置 `handle_parsing_errors` 参数，捕获错误并让 Agent 重试。

### 案例 3：陷入循环

**现象**：Agent 反复调用“查股票”工具，因为股票代码输入错误，一直返回“无效代码”。
**原因**：Agent 没有判断出是参数错误，而是认为工具执行失败。
**解决方案**：

1. 工具内部增加参数校验，返回清晰的错误提示（如“股票代码 123 无效，请检查”）。
2. 降低 `max_iterations`，设置强制停止。

# 13.8 【实战】构建能查股票、算收益的金融助理

结合本章所学，我们将实战构建一个 **金融助理 Agent**。该 Agent 能够：

1. **查股票实时价格**（调用自定义工具，模拟行情接口）。
2. **计算投资收益**（调用计算器工具）。
3. **多步骤推理**：用户只需说“我持有 1000 股茅台，成本 1000 元，现在赚了多少？”，Agent 会自主拆解任务并执行。

## 13.8.1 实战准备

### 1. 安装依赖

```bash
pip install langchain openai python-dotenv
```

### 2. 环境变量

创建 `.env` 文件：

```text
OPENAI_API_KEY=你的OpenAI API密钥
```

## 13.8.2 完整实战代码

```python
from langchain.chat_models import ChatOpenAI
from langchain.tools import tool, Calculator
from langchain.agents import initialize_agent, AgentType
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
import os

# ---------------------- 1. 加载环境变量 ----------------------
load_dotenv()

# ---------------------- 2. 自定义工具：股票查询工具 ----------------------
# 定义输入模型，校验股票代码
class StockQueryInput(BaseModel):
    stock_code: str = Field(description="股票代码，如 600519（贵州茅台）、000858（五粮液）")

    @validator("stock_code")
    def valid_code(cls, v):
        valid_codes = ["600519", "000858", "601318"]
        if v not in valid_codes:
            raise ValueError(f"暂不支持该股票，支持的代码：{valid_codes}")
        return v

# 模拟股票行情数据
STOCK_DATA = {
    "600519": {"name": "贵州茅台", "price": 1800.0},
    "000858": {"name": "五粮液", "price": 140.0},
    "601318": {"name": "中国平安", "price": 50.0}
}

@tool(
    name="get_stock_price",
    description="用于查询中国A股股票的实时价格，输入参数为股票代码（如600519），返回股票名称和当前价格。",
    args_schema=StockQueryInput
)
def get_stock_price(stock_code: str) -> str:
    """获取股票实时价格"""
    stock = STOCK_DATA.get(stock_code)
    return f"股票名称：{stock['name']}，实时价格：{stock['price']} 元/股"

# ---------------------- 3. 初始化核心组件 ----------------------
# 1. LLM
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.1,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# 2. 工具列表（股票查询 + 计算器）
tools = [get_stock_price, Calculator()]

# 3. 初始化 Agent（带循环防护）
financial_agent = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True,
    max_iterations=3,
    early_stopping_method="force",
    handle_parsing_errors="参数格式错误，请重新检查股票代码。"
)

# ---------------------- 4. 执行实战任务 ----------------------
print("=== 金融助理 Agent 实战 ===")
# 任务：复杂的多步骤金融计算
user_task = "我持有 1000 股贵州茅台（代码600519），买入成本是每股 1000 元，帮我算一下现在赚了多少钱？"

try:
    result = financial_agent.run(user_task)
    print(f"\n💡 助理回答：{result}")
except Exception as e:
    print(f"\n❌ 任务执行失败：{e}")
```

## 13.8.3 实战结果解析

运行代码后，你将在控制台看到清晰的 ReAct 循环过程：

1. **Thought 1**：Agent 分析出需要先查贵州茅台的实时价格，调用 `get_stock_price` 工具，参数 `600519`。
2. **Observation 1**：工具返回价格为 1800 元/股。
3. **Thought 2**：Agent 分析出需要计算收益，公式为 `(1800 - 1000) * 1000`，调用 `Calculator` 工具。
4. **Observation 2**：计算器返回结果 800000。
5. **Thought 3**：Agent 认为信息足够，生成最终回答。

**最终输出**：

```
💡 助理回答：你持有1000股贵州茅台，当前每股价格为1800元，买入成本为每股1000元，每股盈利800元，总盈利为800000元。
```

## 13.8.4 实战拓展

本实战是基础版本，你可以根据业务需求进行以下拓展：

1. **对接真实行情 API**：将 `STOCK_DATA` 替换为新浪财经、东方财富等真实的股票行情 API。
2. **添加记忆（Memory）**：使用 `Chat Conversational ReAct` 类型，让 Agent 记住用户的持仓信息，下次用户只需问“我的茅台又赚了多少？”。
3. **增加更多工具**：添加“查大盘指数”“查基金净值”“给出投资建议”等工具。
4. **安全控制**：添加权限校验，确保只有合法用户才能查询持仓。

# 本章总结

本章我们系统学习了 LangChain Agents 的基础核心知识，关键要点如下：

1. **Agent 本质**：以 LLM 为大脑，结合工具，能自主决策和执行复杂任务的组件。
2. **工作流程**：遵循 ReAct 框架，循环执行「思考 → 选择工具 → 执行 → 反思」。
3. **类型选择**：新手首选 `Zero-shot ReAct`，对话场景选 `Chat Conversational ReAct`。
4. **快速创建**：使用 `initialize_agent` 函数，一键生成 Agent。
5. **安全防护**：必须设置 `max_iterations` 等参数，防止无限循环。
6. **调试技巧**：开启 `verbose` 日志或使用 LangSmith 进行可视化调试。

下一章，我们将进入 **Agent 进阶** 内容，学习如何构建多智能体协作系统、自定义 Agent 以及处理更复杂的业务逻辑。
