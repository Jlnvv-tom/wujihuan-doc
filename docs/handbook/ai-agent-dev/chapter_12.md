# 第12章 LangGraph 实战：复杂 Agent 状态机编排

ReAct Agent 就像一个没有导航的司机——知道目的地，但遇到路口容易绕晕。LangGraph 就是给 Agent 装上导航。

我是怕浪猫，上一章聊了 LlamaIndex 的 RAG 能力，今天来搞 LangGraph——LangChain 团队推出的图式 Agent 编排框架。它把 Agent 的执行流程建模为状态机，让你精确控制每一步。

---

## 12.1 从 ReAct 到 LangGraph 的演进

**ReAct 模式的局限性**

ReAct（Reasoning + Acting）是 LangChain 默认的 Agent 模式，流程很简单：

```
思考 → 行动 → 观察 → 思考 → 行动 → ... → 最终答案
```

但它有三个致命问题：

1. **没有记忆结构**：每次都要从头推理
2. **没有分支控制**：只能线性执行
3. **没有人工介入点**：出错只能重试

**LangGraph 的解决方案**

LangGraph 把 Agent 的执行流程建模为有向图（Directed Graph）：

- **Node（节点）**：执行单元（Agent行动、工具调用、条件判断、人类审核）
- **Edge（边）**：执行路径（条件跳转、无条件跳转）
- **State（状态）**：全局共享的执行状态（消息列表、中间结果、完成标志）

```
         ┌─────────┐
         │  Agent  │
         └────┬────┘
              │
         ┌────▼────┐
         │ 工具调用│
         └────┬────┘
              │
         ┌────▼────┐
         │是否需要 │
         │人工介入?│
         └────┬────┘
       是/   │  \ 否
    ┌──────┐ │ ┌──────┐
    │人工  │ │ │ 继续 │
    └──────┘ │ └──────┘
              │
         ┌────▼────┐
         │ 最终输出│
         └─────────┘
```

---

## 12.2 StateGraph 基础：节点、边、状态

**安装**

```bash
pip install langgraph
```

**定义状态**

```python
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END

# 定义状态结构
class AgentState(TypedDict):
    messages: List[dict]          # 对话历史
    next_action: str              # 下一步行动
    intermediate_results: dict    # 中间结果缓存
    completed: bool               # 是否完成
```

**创建图和节点**

```python
# 创建状态图
graph = StateGraph(AgentState)

# 定义节点函数
def agent_node(state):
    """Agent推理节点：LLM决定下一步做什么"""
    llm_response = llm.invoke(state["messages"])
    return {
        "messages": state["messages"] + [llm_response],
        "next_action": parse_action(llm_response)
    }

def tool_node(state):
    """工具执行节点：执行工具调用"""
    action = state["next_action"]
    result = execute_tool(action["tool"], action["params"])
    return {
        "messages": state["messages"] + [{
            "role": "tool",
            "content": str(result)
        }],
        "next_action": "agent"
    }

# 添加节点到图中
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)

# 设置入口节点
graph.set_entry_point("agent")
```

**添加边**

```python
def should_continue(state):
    """条件边：判断是否继续执行"""
    last_message = state["messages"][-1]
    if "FINAL_ANSWER" in last_message.get("content", ""):
        return "end"
    elif state["next_action"] == "use_tool":
        return "tools"
    else:
        return "agent"

# 添加条件边
graph.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools": "tools",
        "end": END,
        "agent": "agent"
    }
)

# 添加无条件边
graph.add_edge("tools", "agent")

# 编译图
app = graph.compile()
```

> LangGraph 的精髓就是把"隐式的 Agent 循环"变成"显式的执行图"。每一步怎么走、走到哪、走多少次，都是你自己定的。

---

## 12.3 条件分支与循环控制

**条件分支**

```python
def route_based_on_intent(state):
    """根据用户意图路由到不同Agent"""
    intent = classify_intent(state["messages"][-1]["content"])
    
    if intent == "search":
        return "search_agent"
    elif intent == "calculate":
        return "calculate_agent"
    elif intent == "analyze":
        return "data_analyze_agent"
    else:
        return "general_agent"

# 路由节点
graph.add_node("intent_classifier", intent_classifier_node)
graph.add_node("search_agent", search_agent_node)
graph.add_node("calculate_agent", calculate_agent_node)
graph.add_node("general_agent", general_agent_node)

# 条件边
graph.add_conditional_edges(
    "intent_classifier",
    route_based_on_intent,
    {
        "search_agent": "search_agent",
        "calculate_agent": "calculate_agent",
        "data_analyze_agent": "data_analyze_agent",
        "general_agent": "general_agent"
    }
)
```

**循环控制**

```python
class MaxIterationsLoop:
    """带最大迭代次数的循环控制"""
    def __init__(self, max_iter=5):
        self.max_iter = max_iter
        self.counter = 0
    
    def should_continue(self, state):
        self.counter += 1
        if self.counter >= self.max_iter:
            self.counter = 0
            return "end"  # 超限强制结束
        return "agent"    # 继续循环
```

---

## 12.4 人工介入模式（Human-in-the-Loop）

**在流程中插入人工审核点**

```python
def human_review_node(state):
    """人工审核节点：暂停流程等待人类批准"""
    # 保存当前状态
    save_pending_review(state)
    
    # 通知人类
    notify_human({
        "action": state["next_action"],
        "params": state["pending_params"],
        "state_id": state["id"]
    })
    
    # 暂停（等待外部恢复）
    # 这个节点的输出会在人类审核后才继续
    return {"status": "waiting_for_approval"}
```

**执行时启用人工介入**

```python
from langgraph.checkpoint import MemorySaver

# 使用检查点系统
checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer)

# 执行到审核点时会暂停
config = {"configurable": {"thread_id": "session_001"}}
for event in app.stream({"messages": initial_messages}, config):
    if event.get("status") == "waiting_for_approval":
        # 等待人类审核...
        break
```

**三种人工介入模式**

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| 事前审批 | 工具调用前批准 | 高风险操作（付款、删除） |
| 事后审核 | 执行后让人类确认 | 内容生成（邮件、报告） |
| 异常升级 | Agent无法处理时升级 | 复杂问题、客户投诉 |

> Human-in-the-Loop 不是"退步"，而是"务实"。有些决策就应该让人来做，Agent 只管执行和提建议。

---

## 12.5 实战：智能客服多步流程

**场景**

构建一个智能客服系统，处理"售后退款"流程。

**流程设计**

```
用户发起退款请求
    ↓
[Agent：验证订单信息]
    ↓ 通过
[Agent：检查退款政策]
    ↓ 符合条件
[Agent：计算退款金额]
    ↓
[人工审核：确认退款] ← Human-in-the-Loop
    ↓ 通过
[工具：执行退款操作]
    ↓
[Agent：生成退款通知]
    ↓
[Agent：结束]
```

**实现**

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional

class RefundState(TypedDict):
    user_id: str
    order_id: str
    refund_reason: str
    order_valid: Optional[bool]
    policy_check: Optional[dict]
    refund_amount: Optional[float]
    human_approved: Optional[bool]
    executed: Optional[bool]
    error: Optional[str]

def verify_order(state):
    """验证订单"""
    order = search_order(state["order_id"])
    if not order or order["user_id"] != state["user_id"]:
        return {**state, "order_valid": False, "error": "订单不存在或不属于该用户"}
    return {**state, "order_valid": True}

def check_refund_policy(state):
    """检查退款政策"""
    policy = get_refund_policy(state["order_id"])
    if not policy["eligible"]:
        return {**state, "policy_check": {"eligible": False, "reason": policy["reason"]}}
    return {**state, "policy_check": {"eligible": True, "max_amount": policy["max_amount"]}}

def calculate_refund(state):
    """计算退款金额"""
    order = search_order(state["order_id"])
    amount = min(order["price"], state["policy_check"]["max_amount"])
    return {**state, "refund_amount": amount}

def human_approval(state):
    """人工审核（暂停点）"""
    return {**state, "human_approved": None}  # 等待外部恢复

def execute_refund(state):
    """执行退款"""
    result = refund_api(state["order_id"], state["refund_amount"])
    return {**state, "executed": result["success"]}

# 构建图
graph = StateGraph(RefundState)
graph.add_node("verify_order", verify_order)
graph.add_node("check_policy", check_refund_policy)
graph.add_node("calculate", calculate_refund)
graph.add_node("human_review", human_approval)
graph.add_node("execute", execute_refund)

graph.set_entry_point("verify_order")
graph.add_edge("verify_order", "check_policy")
graph.add_edge("check_policy", "calculate")
graph.add_edge("calculate", "human_review")
graph.add_edge("human_review", "execute")

# 条件：如果验证失败，直接结束
graph.add_conditional_edges("verify_order", lambda s: "end" if not s["order_valid"] else "check_policy")

graph.add_edge("execute", END)
app = graph.compile()

# 执行
result = app.invoke({
    "user_id": "user_001",
    "order_id": "order_123",
    "refund_reason": "商品质量问题"
})
```

---

## 12.6 实战：多 Agent 协作工作流

**场景**

一个"产品分析报告"任务，需要3个 Agent 协作完成。

**设计**

1. **研究员 Agent**：收集市场信息和竞品数据
2. **分析 Agent**：分析数据并生成结论
3. **写作 Agent**：撰写最终报告

**实现**

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class ReportState(TypedDict):
    topic: str
    research_data: str
    analysis: str
    report: str

def researcher(state):
    """研究员：搜索和收集信息"""
    data = search_and_collect(state["topic"])
    return {**state, "research_data": data}

def analyst(state):
    """分析员：分析数据"""
    analysis = analyze_data(state["research_data"])
    return {**state, "analysis": analysis}

def writer(state):
    """写手：生成报告"""
    report = generate_report(state["topic"], state["analysis"])
    return {**state, "report": report}

def reviewer(state):
    """审校：检查报告质量"""
    if needs_revision(state["report"]):
        return "writer"  # 返回给写手修改
    return "end"  # 完成

graph = StateGraph(ReportState)
graph.add_node("researcher", researcher)
graph.add_node("analyst", analyst)
graph.add_node("writer", writer)
graph.add_node("reviewer", reviewer)

graph.set_entry_point("researcher")
graph.add_edge("researcher", "analyst")
graph.add_edge("analyst", "writer")
graph.add_conditional_edges("reviewer", reviewer, {
    "writer": "writer",
    "end": END
})
graph.add_edge("writer", "reviewer")
```

> 多 Agent 协作的核心思想是"专业分工"。每个 Agent 只做自己最擅长的事，通过图结构串联和循环，达到 1+1>2 的效果。

---

## 12.7 状态持久化与调试

**检查点系统**

```python
from langgraph.checkpoint import SqliteSaver

# 使用 SQLite 持久化状态
checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
app = graph.compile(checkpointer=checkpointer)

# 恢复历史会话
config = {"configurable": {"thread_id": "session_001"}}
for event in app.stream({"messages": messages}, config):
    print(event)
```

**调试技巧**

1. **逐节点测试**：每个节点单独测试
2. **状态快照**：在每个节点输出状态
3. **中断恢复**：手动插入中断检查
4. **可视化**：绘制执行图

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| StateGraph | 节点+边+状态的三元组，精确控制执行流程 |
| 条件分支 | 根据状态路由到不同节点|
| 循环控制 | 可设置最大迭代次数防止死循环 |
| 人工介入 | 3种模式：事前审批/事后审核/异常升级 |
| 智能客服实战 | 验证→检查→计算→审核→执行 |
| 多Agent协作 | 研究员→分析员→写手→审校 |
| 状态持久化 | 检查点系统，支持断点续传 |

---

觉得有用？收藏起来，下次直接照抄。

你用 LangGraph 做过什么复杂流程？评论区分享你的经验。

关注怕浪猫，下期我们讲 AutoGen——微软的多智能体协作框架，从双Agent对话到群聊会议模式。

系列进度 12/24

**下章预告：** 第13章我们将深入 AutoGen，从单Agent到GroupChat，用微软的多智能体框架构建能协作讨论的AI团队。
