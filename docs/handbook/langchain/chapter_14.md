# 第14章 高级 Agent：LangGraph 与状态机

在前一章中，我们学习了 LangChain Agent 的基础用法——通过 `initialize_agent` 快速创建智能体，实现简单的多步骤推理与工具调用。但在复杂业务场景中，基础 Agent 逐渐暴露出局限性：无法灵活控制执行流程、难以实现多 Agent 协作、不能精准定义循环与分支逻辑，比如“调研→撰写→校对”的写作流程、“数据采集→分析→可视化”的数据分析流程，基础 Agent 很难实现结构化的流程管控。

LangGraph 作为 LangChain 生态中用于构建高级 Agent 的核心库，正是为解决这些问题而生。它基于**状态机（State Machine）**和**有向无环图（DAG）**思想，允许我们精确定义 Agent 的执行节点、状态流转规则、分支决策逻辑，甚至实现多 Agent 协同工作，让复杂任务的流程管控更灵活、更可控。

本章将从 LangGraph 的核心价值出发，拆解状态、节点、边等核心概念，手把手教你构建 DAG 工作流、实现条件分支与循环控制，最后通过实战开发“调研→撰写→校对”写作 Agent，所有代码简短可复制，关键步骤标注引用来源，贴合掘金技术博客的实战风格。

引用来源：[LangGraph 官方文档](https://python.langchain.com/docs/langgraph/)、[LangGraph 实战：构建复杂 Agent 工作流](https://juejin.cn/post/7408231859449272356)、[LangGraph 可视化官方指南](https://docs.smith.langchain.com/visualization/langgraph)

# 14.1 为什么需要 LangGraph？

基础 Agent（如 Zero-shot ReAct）虽然能实现简单的多步骤推理，但在面对**复杂流程、多 Agent 协作、精准循环控制**等场景时，会显得力不从心。我们先通过“基础 Agent 局限性”与“LangGraph 优势”的对比，理解 LangGraph 的核心价值。

## 14.1.1 基础 Agent 的核心局限性

在实际开发中，基础 Agent 主要存在以下4个难以解决的问题，这也是我们需要 LangGraph 的核心原因：

1. **流程不可控**：基础 Agent 的执行流程完全依赖 LLM 的推理，开发者无法精确定义“先执行A，再执行B，失败则执行C”的固定流程，容易出现流程混乱。

2. **缺乏状态管理**：无法保存任务执行过程中的中间状态（如调研结果、撰写草稿、校对意见），每次工具调用后，中间数据难以复用，只能依赖 LLM 上下文记忆，易丢失信息。

3. **多 Agent 协作困难**：基础 Agent 是“单智能体”模式，无法实现“调研 Agent 负责找资料、写作 Agent 负责写文章、校对 Agent 负责改错误”的多角色协同。

4. **循环与分支逻辑薄弱**：难以实现复杂的分支决策（如“校对通过则结束，不通过则返回修改”）和循环控制（如“反复校对直到通过”），容易陷入死循环或流程中断。

## 14.1.2 LangGraph 的核心优势

LangGraph 基于状态机和 DAG 思想，完美解决了基础 Agent 的局限性，核心优势如下：

- **流程精准可控**：开发者可手动定义执行节点、节点间的流转关系，实现“固定流程+条件分支”的结构化管控，彻底摆脱对 LLM 推理的依赖。

- **内置状态管理**：通过“状态（State）”统一管理中间数据（如调研结果、草稿、校对意见），所有节点可共享、修改状态，避免中间数据丢失。

- **原生支持多 Agent 协作**：可将不同功能的 Agent 作为独立节点，定义节点间的协作规则，实现多角色协同完成复杂任务。

- **灵活的循环与分支**：通过“条件边（Conditional Edges）”实现分支决策，通过循环节点实现“反复执行直到满足条件”，支持复杂业务逻辑。

- **可视化执行路径**：可通过 LangSmith 或内置工具可视化 DAG 图和执行过程，便于调试和流程优化。

## 14.1.3 适用场景

当你遇到以下场景时，优先使用 LangGraph 替代基础 Agent：

- 复杂流程管控（如“调研→撰写→校对→发布”的内容生产流程）；

- 多 Agent 协作（如“数据采集 Agent + 分析 Agent + 可视化 Agent”）；

- 需要精准状态管理（如保存中间结果、复用历史数据）；

- 需要复杂分支与循环（如“失败重试、条件判断”）。

# 14.2 状态（State）与节点（Node）概念

LangGraph 的核心是“状态机”，而状态机的两个基础组件是**状态（State）**和**节点（Node）**——状态负责存储数据，节点负责执行逻辑，二者结合构成 LangGraph 的基础架构。这两个概念是理解 LangGraph 的关键，必须先掌握。

## 14.2.1 状态（State）：整个工作流的数据中心

状态（State）是 LangGraph 中**存储所有中间数据和结果的容器**，相当于整个工作流的“数据中心”。所有节点的输入、输出，都会通过状态进行传递和共享，避免数据丢失。

### 核心特点

- 可自定义结构：根据任务需求，定义状态包含的字段（如调研结果、文章草稿、校对意见等）；

- 可修改、可共享：每个节点都可以读取状态中的数据，也可以修改状态中的字段；

- 持久化（可选）：可结合数据库，将状态持久化，避免任务中断后数据丢失。

### 定义状态的两种方式

LangGraph 支持两种定义状态的方式，新手推荐使用 `Pydantic`（结构化、带校验），进阶使用 `TypedDict`（更灵活）。

#### 方式1：Pydantic 定义状态（推荐）

```python
from pydantic import BaseModel, Field

# 用 Pydantic 定义状态，结构化且支持参数校验
class WritingState(BaseModel):
    """写作 Agent 的状态定义"""
    topic: str = Field(description="写作主题")
    research_data: str = Field(default="", description="调研得到的资料")
    draft: str = Field(default="", description="撰写的文章草稿")
    review_comment: str = Field(default="", description="校对意见")
    is_approved: bool = Field(default=False, description="校对是否通过")
```

#### 方式2：TypedDict 定义状态（灵活）

```python
from typing import TypedDict

# 用 TypedDict 定义状态，无校验，更灵活
class WritingState(TypedDict):
    topic: str
    research_data: str
    draft: str
    review_comment: str
    is_approved: bool
```

## 14.2.2 节点（Node）：工作流的执行单元

节点（Node）是 LangGraph 中**执行具体逻辑的最小单元**，相当于工作流的“执行步骤”。每个节点对应一个具体的功能（如调研、撰写、校对），接收状态作为输入，执行逻辑后，返回修改后的状态。

### 核心特点

- 独立逻辑：每个节点的逻辑独立，可单独开发、测试、复用；

- 输入输出：输入是当前状态，输出是修改后的状态（必须返回状态，否则状态无法更新）；

- 类型灵活：节点可以是普通函数、LangChain Chain、Agent，甚至是另一个 LangGraph。

### 定义节点的基础示例

以“写作 Agent”为例，定义3个基础节点：调研节点、撰写节点、校对节点，每个节点接收状态，执行逻辑后返回更新后的状态。

```python
from langchain.chat_models import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.3, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 1. 调研节点：根据主题获取调研资料，更新 state 中的 research_data
def research_node(state: WritingState) -> WritingState:
    prompt = f"围绕主题「{state['topic']}」，收集3条核心调研资料，每条不超过50字，简洁准确。"
    research_data = llm.invoke(prompt).content
    # 返回更新后的状态
    return {**state, "research_data": research_data}

# 2. 撰写节点：根据调研资料撰写草稿，更新 state 中的 draft
def write_node(state: WritingState) -> WritingState:
    prompt = f"根据调研资料：{state['research_data']}，撰写一篇300字左右的文章，贴合主题，逻辑清晰。"
    draft = llm.invoke(prompt).content
    return {**state, "draft": draft}

# 3. 校对节点：校对草稿，更新 state 中的 review_comment 和 is_approved
def review_node(state: WritingState) -> WritingState:
    prompt = f"校对文章草稿：{state['draft']}，检查语法错误、逻辑连贯性，给出修改意见；若无误，返回'通过'，并标记is_approved为True。"
    comment = llm.invoke(prompt).content
    is_approved = "通过" in comment
    return {**state, "review_comment": comment, "is_approved": is_approved}
```

## 14.2.3 状态与节点的关系（极简图例）

用简单的流程图，直观展示状态与节点的交互关系：

**初始状态 → 节点1（读取状态→执行逻辑→修改状态）→ 节点2（读取更新后状态→执行逻辑→再次修改）→ ... → 最终状态**

核心逻辑：节点是“执行者”，状态是“数据载体”，节点通过修改状态，实现数据在工作流中的传递和更新。

# 14.3 构建有向无环图（DAG）工作流

LangGraph 的工作流基于**有向无环图（DAG）**构建——节点（Node）作为图的“顶点”，节点间的流转关系作为图的“边（Edge）”，且边的方向固定、无循环（避免死循环）。这种结构能确保工作流按预设顺序执行，流程清晰、可控。

本节将手把手教你构建一个简单的 DAG 工作流（调研→撰写→校对），掌握 LangGraph 的核心构建步骤。

## 14.3.1 前置准备：安装 LangGraph

```bash
# 安装核心依赖
pip install langgraph langchain openai python-dotenv
```

## 14.3.2 核心构建步骤

构建 LangGraph DAG 工作流，核心分为3步：

1. 定义状态（State）：确定工作流需要存储的数据字段；

2. 定义节点（Node）：实现每个步骤的执行逻辑；

3. 创建图（Graph）：添加节点，定义节点间的流转关系（边），指定起始节点和结束节点。

## 14.3.3 实战：构建“调研→撰写→校对”基础 DAG 工作流

结合上一节定义的状态和节点，构建一个简单的 DAG 工作流，流程固定为：调研 → 撰写 → 校对，完成后结束。

```python
from langgraph.graph import Graph, END  # END 是内置的结束节点
from typing import TypedDict

# 1. 定义状态（用 TypedDict 更简洁，适合简单场景）
class WritingState(TypedDict):
    topic: str
    research_data: str
    draft: str
    review_comment: str
    is_approved: bool

# 2. 初始化 LLM（复用之前的代码）
from langchain.chat_models import ChatOpenAI
from dotenv import load_dotenv
import os
load_dotenv()
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.3, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 3. 定义节点（复用之前的代码，简化逻辑）
def research_node(state: WritingState) -> WritingState:
    prompt = f"围绕「{state['topic']}」，收集3条核心调研资料，简洁准确。"
    research_data = llm.invoke(prompt).content
    return {**state, "research_data": research_data}

def write_node(state: WritingState) -> WritingState:
    prompt = f"根据调研资料：{state['research_data']}，撰写300字左右文章，逻辑清晰。"
    draft = llm.invoke(prompt).content
    return {**state, "draft": draft}

def review_node(state: WritingState) -> WritingState:
    prompt = f"校对草稿：{state['draft']}，检查语法和逻辑，给出修改意见；无误则返回'通过'。"
    comment = llm.invoke(prompt).content
    return {**state, "review_comment": comment, "is_approved": "通过" in comment}

# 4. 构建 DAG 图
# 4.1 初始化图，指定状态类型
graph = Graph(state_schema=WritingState)

# 4.2 添加节点（参数：节点名称，节点逻辑）
graph.add_node("research", research_node)  # 调研节点
graph.add_node("write", write_node)        # 撰写节点
graph.add_node("review", review_node)      # 校对节点

# 4.3 定义节点流转关系（边）：research → write → review → END
graph.add_edge("research", "write")        # 调研完成后，进入撰写
graph.add_edge("write", "review")          # 撰写完成后，进入校对
graph.add_edge("review", END)              # 校对完成后，结束工作流

# 4.4 指定起始节点（从哪个节点开始执行）
graph.set_entry_point("research")

# 5. 编译图（生成可执行的工作流）
app = graph.compile()

# 6. 执行工作流（传入初始状态）
initial_state = {
    "topic": "LangChain LangGraph 核心用法",
    "research_data": "",
    "draft": "",
    "review_comment": "",
    "is_approved": False
}

# 执行并获取最终状态
final_state = app.invoke(initial_state)

# 打印结果
print("=== 工作流执行完成 ===")
print(f"调研资料：{final_state['research_data']}")
print(f"\n文章草稿：{final_state['draft']}")
print(f"\n校对意见：{final_state['review_comment']}")
print(f"\n校对是否通过：{final_state['is_approved']}")
```

## 14.3.4 核心代码解析

- `Graph(state_schema=WritingState)`：初始化图，指定状态类型，确保所有节点的输入输出都符合状态结构；

- `add_node(name, func)`：添加节点，name 是节点的唯一标识，func 是节点的执行逻辑；

- `add_edge(from_node, to_node)`：定义边（流转关系），from_node 是当前节点，to_node 是下一个节点；

- `set_entry_point(node_name)`：指定起始节点，工作流从该节点开始执行；

- `graph.compile()`：编译图，生成可执行的工作流实例（app）；

- `app.invoke(initial_state)`：执行工作流，传入初始状态，返回最终状态。

## 14.3.5 DAG 工作流的核心特点

本例中的 DAG 是“线性流程”（无分支、无循环），核心特点：

- 无环：节点间的流转不会回到之前的节点，避免死循环；

- 固定顺序：严格按照“调研→撰写→校对”执行，流程可控；

- 状态共享：每个节点都能读取上一个节点更新后的状态，数据传递流畅。

# 14.4 条件边（Conditional Edges）实现决策分支

上一节的 DAG 工作流是“线性流程”，但实际业务场景中，往往需要根据条件判断选择不同的执行路径——比如“校对通过则结束，不通过则返回修改”。这种“分支逻辑”，需要通过 LangGraph 的**条件边（Conditional Edges）**实现。

条件边的核心逻辑：根据当前状态中的某个字段（如 is_approved），判断下一个节点应该执行哪个，实现“分支决策”。

## 14.4.1 条件边的定义方式

LangGraph 中，条件边通过 `add_conditional_edges` 方法定义，核心参数：

- `start_node`：当前节点（条件判断的触发节点）；

- `condition`：条件判断函数，接收当前状态，返回下一个节点的名称（或 END）；

- `mapping`：可选参数，将条件判断结果映射到具体节点（简化条件函数）。

## 14.4.2 实战：给写作工作流添加条件分支

基于上一节的线性工作流，添加条件分支：校对节点执行后，判断 is_approved（是否通过）：

- 若通过（is_approved=True）：执行结束（END）；

- 若不通过（is_approved=False）：返回撰写节点，重新修改草稿。

```python
from langgraph.graph import Graph, END
from typing import TypedDict

# 1. 定义状态（与之前一致）
class WritingState(TypedDict):
    topic: str
    research_data: str
    draft: str
    review_comment: str
    is_approved: bool

# 2. 初始化 LLM 和节点（复用之前的代码，不变）
from langchain.chat_models import ChatOpenAI
from dotenv import load_dotenv
import os
load_dotenv()
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.3, openai_api_key=os.getenv("OPENAI_API_KEY"))

def research_node(state: WritingState) -> WritingState:
    prompt = f"围绕「{state['topic']}」，收集3条核心调研资料，简洁准确。"
    research_data = llm.invoke(prompt).content
    return {**state, "research_data": research_data}

def write_node(state: WritingState) -> WritingState:
    prompt = f"根据调研资料：{state['research_data']}，结合校对意见：{state['review_comment']}，撰写300字左右文章，逻辑清晰。"
    draft = llm.invoke(prompt).content
    return {**state, "draft": draft}

def review_node(state: WritingState) -> WritingState:
    prompt = f"校对草稿：{state['draft']}，检查语法和逻辑，给出修改意见；无误则返回'通过'。"
    comment = llm.invoke(prompt).content
    return {**state, "review_comment": comment, "is_approved": "通过" in comment}

# 3. 构建带条件分支的 DAG 图
graph = Graph(state_schema=WritingState)

# 3.1 添加节点（与之前一致）
graph.add_node("research", research_node)
graph.add_node("write", write_node)
graph.add_node("review", review_node)

# 3.2 定义线性边（research → write → review）
graph.add_edge("research", "write")
graph.add_edge("write", "review")

# 3.3 定义条件边（review 节点之后的分支）
def review_condition(state: WritingState) -> str:
    """条件判断函数：根据 is_approved 决定下一个节点"""
    if state["is_approved"]:
        return END  # 校对通过，结束
    else:
        return "write"  # 校对不通过，返回撰写节点修改

# 添加条件边：从 review 节点出发，根据条件判断下一个节点
graph.add_conditional_edges(
    start_node="review",
    condition=review_condition  # 条件判断函数
)

# 3.4 指定起始节点
graph.set_entry_point("research")

# 4. 编译并执行
app = graph.compile()

# 初始状态（与之前一致）
initial_state = {
    "topic": "LangChain LangGraph 核心用法",
    "research_data": "",
    "draft": "",
    "review_comment": "首次撰写，无修改意见",
    "is_approved": False
}

# 执行工作流（会自动循环，直到校对通过）
final_state = app.invoke(initial_state)

# 打印最终结果
print("=== 工作流执行完成 ===")
print(f"最终草稿：{final_state['draft']}")
print(f"\n最终校对意见：{final_state['review_comment']}")
print(f"\n校对是否通过：{final_state['is_approved']}")
```

## 14.4.3 关键代码解析

- `review_condition`：条件判断函数，接收当前状态，返回下一个节点的名称（或 END），这是条件边的核心；

- `add_conditional_edges`：将条件判断函数与节点关联，实现“校对节点→分支判断→下一个节点”的逻辑；

- 循环逻辑：当校对不通过时，返回撰写节点，重新修改草稿，再次进入校对节点，直到校对通过（形成“撰写→校对”的循环）。

## 14.4.4 简化条件边（使用 mapping 参数）

如果条件判断逻辑简单（如根据某个布尔值分支），可以使用 `mapping` 参数简化条件函数，无需手动编写判断逻辑：

```python
# 简化条件边：用 mapping 映射条件结果
graph.add_conditional_edges(
    start_node="review",
    # 条件：判断 state["is_approved"] 的值
    condition=lambda state: state["is_approved"],
    # 映射：True → END，False → "write"
    mapping={True: END, False: "write"}
)
```

这种方式更简洁，适合简单的布尔值分支场景，推荐新手使用。

# 14.5 多 Agent 协作架构

LangGraph 的核心优势之一是**原生支持多 Agent 协作**——我们可以将不同功能的 Agent（如调研 Agent、写作 Agent、校对 Agent）作为独立节点，定义节点间的协作规则，让多 Agent 分工明确、协同完成复杂任务。

多 Agent 协作的核心逻辑：每个 Agent 作为一个节点，负责自己擅长的任务，通过状态（State）共享数据，通过边（Edge）定义协作流程，实现“分工协作、高效完成”。

## 14.5.1 多 Agent 协作的常见架构

结合 LangGraph，多 Agent 协作主要有两种常见架构，根据任务复杂度选择：

### 架构1：流水线架构（适合简单协作）

每个 Agent 负责一个环节，按顺序执行，流程固定，类似“流水线”：调研 Agent → 写作 Agent → 校对 Agent。

极简图例：**调研 Agent → 写作 Agent → 校对 Agent → END**

适用场景：任务流程固定，每个 Agent 的任务独立，无需跨环节交互。

### 架构2：决策-执行架构（适合复杂协作）

设置一个“决策 Agent”作为核心节点，负责分配任务、判断流程；其他“执行 Agent”负责具体任务，执行完成后反馈给决策 Agent，由决策 Agent 决定下一步。

极简图例：**决策 Agent → 调研 Agent → 决策 Agent → 写作 Agent → 决策 Agent → 校对 Agent → END**

适用场景：任务复杂、流程多变，需要根据执行结果动态调整任务分配。

## 14.5.2 实战：多 Agent 协作的写作工作流

采用“流水线架构”，实现3个 Agent 协作：调研 Agent（负责找资料）、写作 Agent（负责写草稿）、校对 Agent（负责改错误），通过 LangGraph 定义协作流程，共享状态数据。

```python
from langgraph.graph import Graph, END
from typing import TypedDict
from langchain.chat_models import ChatOpenAI
from langchain.agents import initialize_agent, AgentType
from langchain.tools import Tool
from dotenv import load_dotenv
import os

load_dotenv()
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.3, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 1. 定义状态（共享多 Agent 数据）
class WritingState(TypedDict):
    topic: str
    research_data: str  # 调研 Agent 的输出
    draft: str          # 写作 Agent 的输出
    review_comment: str # 校对 Agent 的输出
    is_approved: bool

# 2. 定义3个独立的 Agent（每个 Agent 作为一个节点）
## 2.1 调研 Agent：负责收集资料（无工具，仅用 LLM 调研）
def research_agent(state: WritingState) -> WritingState:
    prompt = f"作为调研 Agent，围绕「{state['topic']}」，收集3条核心调研资料，每条不超过50字，简洁准确。"
    research_data = llm.invoke(prompt).content
    return {**state, "research_data": research_data}

## 2.2 写作 Agent：负责撰写草稿（无工具，仅用 LLM 写作）
def writing_agent(state: WritingState) -> WritingState:
    prompt = f"作为写作 Agent，根据调研资料：{state['research_data']}，撰写300字左右文章，贴合主题，逻辑清晰，语言流畅。"
    draft = llm.invoke(prompt).content
    return {**state, "draft": draft}

## 2.3 校对 Agent：负责校对修改（无工具，仅用 LLM 校对）
def review_agent(state: WritingState) -> WritingState:
    prompt = f"作为校对 Agent，校对文章草稿：{state['draft']}，检查语法错误、逻辑连贯性、用词准确性，给出具体修改意见；若无误，返回'通过'，并标记is_approved为True。"
    comment = llm.invoke(prompt).content
    return {**state, "review_comment": comment, "is_approved": "通过" in comment}

# 3. 构建多 Agent 协作 DAG（流水线架构）
graph = Graph(state_schema=WritingState)

# 3.1 添加 Agent 节点（每个 Agent 对应一个节点）
graph.add_node("research_agent", research_agent)
graph.add_node("writing_agent", writing_agent)
graph.add_node("review_agent", review_agent)

# 3.2 定义协作流程（流水线）+ 条件分支
graph.add_edge("research_agent", "writing_agent")  # 调研完成 → 写作
graph.add_edge("writing_agent", "review_agent")    # 写作完成 → 校对

# 校对后的条件分支：通过则结束，不通过则返回写作 Agent 修改
graph.add_conditional_edges(
    start_node="review_agent",
    condition=lambda state: state["is_approved"],
    mapping={True: END, False: "writing_agent"}
)

# 3.3 指定起始节点
graph.set_entry_point("research_agent")

# 4. 编译并执行
app = graph.compile()

# 初始状态
initial_state = {
    "topic": "LangChain LangGraph 多 Agent 协作",
    "research_data": "",
    "draft": "",
    "review_comment": "首次撰写，无修改意见",
    "is_approved": False
}

# 执行多 Agent 协作工作流
final_state = app.invoke(initial_state)

# 打印结果
print("=== 多 Agent 协作完成 ===")
print(f"调研 Agent 输出：{final_state['research_data']}")
print(f"\n写作 Agent 输出：{final_state['draft']}")
print(f"\n校对 Agent 输出：{final_state['review_comment']}")
print(f"\n最终是否通过：{final_state['is_approved']}")
```

## 14.5.3 进阶：给 Agent 添加工具

实际场景中，Agent 往往需要调用工具（如调研 Agent 调用搜索引擎、校对 Agent 调用语法检查工具）。我们给调研 Agent 添加 DuckDuckGo 搜索引擎工具，增强其调研能力：

```python
# 安装搜索引擎依赖
# pip install duckduckgo-search

from langchain.tools import DuckDuckGoSearchRun

# 初始化搜索引擎工具
search_tool = DuckDuckGoSearchRun()

# 定义带工具的调研 Agent
def research_agent_with_tool(state: WritingState) -> WritingState:
    # 初始化调研 Agent，添加搜索引擎工具
    research_agent = initialize_agent(
        tools=[search_tool],
        llm=llm,
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
        verbose=False
    )
    # 调用 Agent 执行调研任务
    prompt = f"围绕「{state['topic']}」，收集3条最新的核心调研资料，每条不超过50字，简洁准确，需通过搜索引擎获取实时信息。"
    research_data = research_agent.run(prompt)
    return {**state, "research_data": research_data}

# 替换节点为带工具的调研 Agent
graph.add_node("research_agent", research_agent_with_tool)
```

## 14.5.4 多 Agent 协作的核心优势

- 分工明确：每个 Agent 专注于自己擅长的任务（调研、写作、校对），提升效率和质量；

- 可扩展性强：可随时添加新的 Agent（如排版 Agent、发布 Agent），无需修改整体流程；

- 容错性高：某个 Agent 执行失败，可通过状态回滚或重新执行，不影响整个工作流；

- 数据共享：通过状态（State）实现多 Agent 间的数据共享，避免重复工作。

# 14.6 循环与迭代控制（如 Plan-and-Execute）

在复杂任务中，往往需要“反复执行某个步骤，直到满足条件”（循环），或“先规划任务步骤，再逐步执行”（Plan-and-Execute）。LangGraph 提供了灵活的循环与迭代控制方式，既能实现简单的循环重试，也能实现复杂的 Plan-and-Execute 架构。

## 14.6.1 简单循环：基于条件边的重试机制

最常见的循环控制，就是通过“条件边”实现“重试直到满足条件”——比如上一节的“校对不通过则返回修改”，本质就是一种简单的循环。

核心要点：循环的终止条件必须明确（如 is_approved=True），否则会陷入死循环；可通过 `max_steps` 参数限制最大循环次数，避免无限重试。

```python
# 编译图时，设置最大循环次数（避免死循环）
app = graph.compile(max_steps=5)  # 最多循环5次，超过则抛出异常

# 执行时捕获异常，处理循环超限
try:
    final_state = app.invoke(initial_state)
except Exception as e:
    print(f"工作流执行失败：{e}（可能是循环次数超限）")
```

## 14.6.2 复杂迭代：Plan-and-Execute 架构

Plan-and-Execute（规划-执行）是一种高级迭代架构，核心逻辑：

1. 规划（Plan）：Agent 先分析用户需求，生成详细的任务执行步骤（如“1. 调研主题；2. 撰写草稿；3. 校对修改”）；

2. 执行（Execute）：按规划的步骤，依次执行每个任务，记录执行结果；

3. 反思（Reflect）：检查执行结果是否符合预期，若不符合，重新规划步骤，再次执行（迭代）；

4. 终止：所有步骤执行完成，或达到最大迭代次数，结束工作流。

这种架构适合复杂、模糊的任务，能让 Agent 自主规划、自主调整，比简单循环更智能。

## 14.6.3 实战：Plan-and-Execute 写作工作流

构建 Plan-and-Execute 架构的写作工作流，包含3个核心节点：规划节点、执行节点、反思节点，实现“规划→执行→反思→迭代”的逻辑。

```python
from langgraph.graph import Graph, END
from typing import TypedDict
from langchain.chat_models import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv()
llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0.3, openai_api_key=os.getenv("OPENAI_API_KEY"))

# 1. 定义状态（包含规划步骤、执行结果、反思意见）
class PlanExecuteState(TypedDict):
    topic: str
    plan: list[str] = []  # 规划的任务步骤
    executed_steps: list[str] = []  # 已执行的步骤
    results: dict = {}    # 每个步骤的执行结果
    reflect: str = ""     # 反思意见
    is_completed: bool = False  # 任务是否完成

# 2. 定义核心节点
## 2.1 规划节点：生成任务执行步骤
def plan_node(state: PlanExecuteState) -> PlanExecuteState:
    prompt = f"围绕写作主题「{state['topic']}」，生成详细的任务执行步骤，步骤不超过3步，简洁具体，比如：1. 调研主题；2. 撰写草稿；3. 校对修改。"
    plan = llm.invoke(prompt).content.split("\n")
    plan = [step.strip() for step in plan if step.strip()]  # 清理空行
    return {**state, "plan": plan}

## 2.2 执行节点：执行当前未完成的步骤
def execute_node(state: PlanExecuteState) -> PlanExecuteState:
    # 获取未执行的步骤
    unexecuted = [step for step in state["plan"] if step not in state["executed_steps"]]
    if not unexecuted:
        return {**state, "is_completed": True}

    current_step = unexecuted[0]  # 执行第一个未完成的步骤
    # 根据步骤类型，执行对应逻辑
    results = state["results"].copy()
    if "调研" in current_step:
        results["调研"] = llm.invoke(f"围绕「{state['topic']}」，收集3条核心调研资料。").content
    elif "撰写" in current_step:
        research_data = results.get("调研", "无调研资料")
        results["撰写"] = llm.invoke(f"根据调研资料：{research_data}，撰写300字文章。").content
    elif "校对" in current_step:
        draft = results.get("撰写", "无草稿")
        results["校对"] = llm.invoke(f"校对草稿：{draft}，给出修改意见。").content

    # 更新已执行步骤和结果
    executed_steps = state["executed_steps"].copy()
    executed_steps.append(current_step)
    return {**state, "executed_steps": executed_steps, "results": results}

## 2.3 反思节点：检查执行结果，判断是否需要重新规划
def reflect_node(state: PlanExecuteState) -> PlanExecuteState:
    prompt = f"任务主题：{state['topic']}\n已执行步骤：{state['executed_steps']}\n执行结果：{state['results']}\n判断：是否完成所有步骤？结果是否符合预期？若未完成或不符合，给出重新规划的建议；若完成，返回'任务完成'。"
    reflect = llm.invoke(prompt).content
    is_completed = "任务完成" in reflect
    return {**state, "reflect": reflect, "is_completed": is_completed}

# 3. 构建 Plan-and-Execute DAG
graph = Graph(state_schema=PlanExecuteState)

# 3.1 添加节点
graph.add_node("plan", plan_node)
graph.add_node("execute", execute_node)
graph.add_node("reflect", reflect_node)

# 3.2 定义流转关系
graph.add_edge("plan", "execute")  # 先规划，再执行
graph.add_edge("execute", "reflect")  # 执行后，反思
# 反思后的条件分支：完成则结束，未完成则重新规划
graph.add_conditional_edges(
    start_node="reflect",
    condition=lambda state: state["is_completed"],
    mapping={True: END, False: "plan"}  # 未完成则重新规划
)

# 3.3 指定起始节点
graph.set_entry_point("plan")

# 3.4 编译（设置最大迭代次数）
app = graph.compile(max_steps=5)

# 4. 执行工作流
initial_state = {
    "topic": "LangChain Plan-and-Execute 架构实战",
    "plan": [],
    "executed_steps": [],
    "results": {},
    "reflect": "",
    "is_completed": False
}

final_state = app.invoke(initial_state)

# 打印结果
print("=== Plan-and-Execute 工作流完成 ===")
print(f"规划步骤：{final_state['plan']}")
print(f"\n已执行步骤：{final_state['executed_steps']}")
print(f"\n执行结果：{final_state['results']}")
print(f"\n反思意见：{final_state['reflect']}")
print(f"\n任务是否完成：{final_state['is_completed']}")
```

## 14.6.4 核心解析

- 规划节点（plan）：负责生成任务步骤，为后续执行提供明确指引；

- 执行节点（execute）：按步骤执行任务，记录执行结果，确保每个步骤都被落实；

- 反思节点（reflect）：作为“迭代核心”，检查执行结果，判断是否需要重新规划，实现自主调整；

- 循环控制：通过“reflect→plan”的条件边，实现“规划→执行→反思→重新规划”的迭代，直到任务完成。

引用来源：[LangChain Plan-and-Execute 官方文档](https://python.langchain.com/docs/modules/agents/plan_and_execute)

# 14.7 可视化 Graph 执行路径

LangGraph 工作流的核心是“图结构”，但图的节点和边较多时，很难直观地看到流程关系和执行路径，不利于调试和优化。LangGraph 提供了两种可视化方式，帮助我们清晰查看图结构和执行过程。

## 14.7.1 方式1：使用 LangSmith 可视化（推荐）

LangSmith 是 LangChain 官方的调试和可视化平台，支持 LangGraph 的图结构、执行路径、状态变化的完整可视化，适合开发和生产环境的调试。

### 操作步骤

1. 安装 LangSmith 依赖：
   `pip install langsmith`

2. 配置 LangSmith 环境变量（在 .env 文件中添加）：
   `LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=你的LangSmith密钥（从LangSmith官网获取）
LANGCHAIN_PROJECT=langgraph-demo  # 项目名称，自定义`

3. 执行 LangGraph 工作流：
   执行之前的工作流代码，LangSmith 会自动追踪图的结构和执行过程。

4. 查看可视化结果：
   登录 [LangSmith 官网](https://smith.langchain.com/)，进入对应的项目，即可看到：
   - 图结构可视化：节点、边的关系，清晰展示工作流流程；

   - 执行路径可视化：每个节点的执行顺序、执行时间；

   - 状态变化可视化：每个节点执行前后的状态数据，便于调试。

## 14.7.2 方式2：使用内置函数导出图结构（基础）

如果不需要实时追踪，仅需查看图结构，可使用 LangGraph 内置的 `draw_graph` 函数，将图结构导出为图片（需安装 graphviz 依赖）。

### 操作步骤

1. 安装依赖：
   `pip install graphviz # 核心依赖

# 若安装后报错，需安装系统依赖（如Ubuntu：sudo apt install graphviz）`

2. 导出图结构为图片：
   `# 假设已构建好 graph 实例（之前的工作流代码）
   from langgraph.graph import draw_graph

# 导出图结构为 PNG 图片，保存到当前目录

draw_graph(graph, format="png", filename="writing_workflow")`

3. 查看结果：
   当前目录会生成 `writing_workflow.png` 文件，打开后可看到图的节点、边和流转关系，适合快速查看图结构。

## 14.7.3 可视化的核心价值

- 调试便捷：快速定位节点执行失败、流程流转错误的问题；

- 流程清晰：直观看到节点间的关系，便于优化工作流；

- 团队协作：可将可视化图片分享给团队，统一对工作流的理解。

# 14.8 【实战】实现“调研 → 撰写 → 校对”写作 Agent

结合本章所学的 LangGraph、状态管理、条件分支、多 Agent 协作知识，实战开发一个完整的“调研→撰写→校对”写作 Agent。该 Agent 具备以下功能：

- 多 Agent 协作：调研 Agent（带搜索引擎工具）、写作 Agent、校对 Agent 分工协作；

- 条件分支：校对通过则输出最终文章，不通过则返回修改；

- 循环控制：设置最大修改次数（3次），避免无限循环；

- 状态管理：保存调研资料、文章草稿、校对意见等中间数据；

- 可视化：支持导出图结构，便于调试和查看。

## 14.8.1 实战准备

### 1. 安装依赖

```bash
pip install langgraph langchain openai python-dotenv duckduckgo-search graphviz
```

### 2. 环境变量配置

创建 `.env` 文件，填入以下内容：

```text
OPENAI_API_KEY=你的OpenAI API密钥
# 可选：LangSmith 配置（用于可视化）
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=你的LangSmith密钥
LANGCHAIN_PROJECT=writing-agent-demo
```

## 14.8.2 完整实战代码

```python
from langgraph.graph import Graph, END
from typing import TypedDict
from langchain.chat_models import ChatOpenAI
from langchain.agents import initialize_agent, AgentType
from langchain.tools import DuckDuckGoSearchRun
from dotenv import load_dotenv
import os

# ---------------------- 1. 加载环境变量 ----------------------
load_dotenv()
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    temperature=0.3,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# ---------------------- 2. 定义状态（存储所有中间数据） ----------------------
class WritingAgentState(TypedDict):
    topic: str                  # 写作主题
    research_data: str = ""     # 调研 Agent 输出的资料
    draft: str = ""             # 写作 Agent 输出的草稿
    review
```
