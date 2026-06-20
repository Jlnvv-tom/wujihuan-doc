# 第4章 Agent 设计方法论：打造终极进化智能体

如果RAG是给大模型"开卷考试"，那Agent就是让大模型"走出考场自己找答案"。

从被动回答到主动执行，这是AI产品能力的质变。但Agent也是最容易被滥用的技术——不是所有问题都需要Agent，简单的RAG就能解决大部分场景。

我是怕浪猫，这章讲Agent的设计方法论，帮你搞清楚什么时候用Agent，怎么设计Agent，以及怎么避免过度设计。

## 4.1 Agent 认知与能力全景

### 什么是AI Agent

AI Agent是一个能够自主感知环境、做出决策、执行动作的智能体。它和大模型对话的核心区别在于：大模型只能"说"，Agent能"做"。

| 维度 | 大模型对话 | AI Agent |
|------|-----------|---------|
| 交互方式 | 一问一答 | 自主规划+执行 |
| 工具使用 | 无 | 可以调用外部工具（API、数据库、搜索等） |
| 任务执行 | 只能输出文本 | 能完成多步骤的复杂任务 |
| 记忆 | 仅当前对话 | 有短期和长期记忆 |
| 决策 | 被动响应 | 主动规划和调整 |
| 自主性 | 低 | 高 |

一个最简单的类比：大模型是"顾问"，你问它问题它给你建议；Agent是"助理"，你给它一个目标，它自己想办法完成。

### Agent的能力层级

Agent的能力不是二元的（有或没有），而是分层的。从低到高4个层级：

**Level 1：对话Agent**
能力：多轮对话、上下文记忆
局限：不能执行动作，只能聊天
典型产品：ChatGPT、Claude

**Level 2：工具调用Agent**
能力：调用外部工具（搜索引擎、API、代码执行器等）
局限：工具调用是预定义的，不能自主选择工具
典型产品：ChatGPT with Plugins、Bing Chat

**Level 3：规划Agent**
能力：自主规划任务步骤、选择工具、调整策略
局限：长程规划能力有限，容易跑偏
典型产品：AutoGPT、MetaGPT

**Level 4：协作Agent**
能力：多Agent协作、分工、争论、达成共识
局限：协调成本高，调试困难
典型产品：CrewAI、AutoGen

> Agent的能力层级越高，越强大，但也越不可控。产品设计中，选择合适的层级比追求最高层级更重要。

### 什么时候需要Agent

这是最重要的决策。不是所有场景都需要Agent，很多时候RAG + 工作流就够了。

需要Agent的信号：
- 任务需要多步推理和决策
- 需要根据中间结果调整策略
- 需要调用多个不同的工具
- 任务流程不确定，无法预定义

不需要Agent的信号：
- 单步问答就能解决
- 流程是固定的，可以用工作流编排
- 不需要外部工具
- 用户对延迟敏感（Agent比直接问答慢很多）

| 场景 | 是否需要Agent | 推荐方案 |
|------|-------------|---------|
| 知识问答 | 否 | RAG |
| 流程化任务（审批、报销） | 否 | 工作流 |
| 多条件搜索+比较 | 是 | Agent + 搜索工具 |
| 自动化测试 | 是 | Agent + 代码执行 |
| 多源信息整合 | 是 | Agent + 多工具 |
| 复杂数据分析 | 是 | Agent + 代码 + 数据库 |

> 不要为了用Agent而用Agent。能用RAG解决的不要上Agent，能用工作流解决的不要上自主Agent。过度设计是AI产品最常见的错误。

## 4.2 Agent 基础能力构建

### 提示词设计

Agent的提示词和普通对话的提示词不同，需要包含：
1. 角色定义
2. 可用工具列表
3. 决策规则
4. 输出格式（思维过程+动作选择）

Agent提示词模板：

```
你是{角色名称}，一个能够自主完成任务的AI助手。

你的目标：{任务描述}

你可以使用以下工具：
1. {工具1名称}：{工具1描述}。输入格式：{格式}
2. {工具2名称}：{工具2描述}。输入格式：{格式}
3. {工具3名称}：{工具3描述}。输入格式：{格式}

决策规则：
1. 先分析任务，制定执行计划
2. 按计划逐步执行，每一步选择最合适的工具
3. 如果某一步失败，分析原因并调整策略
4. 完成所有步骤后，给出最终结果

输出格式：
思考：{你的推理过程}
动作：{选择的工具名称}
动作输入：{工具的输入参数}
```

### 工具调用（Function Calling）

工具调用是Agent的核心能力。大模型本身只能生成文本，但通过Function Calling机制，模型可以"告诉"系统它想调用什么工具、传什么参数，由系统执行工具并把结果返回给模型。

Function Calling的工作流程：

```
1. 用户提问："北京今天的天气怎么样？"
2. 模型判断需要调用天气API → 输出：{"function": "get_weather", "args": {"city": "北京"}}
3. 系统执行天气API → 返回结果：{"temp": 28, "condition": "晴"}
4. 模型基于API结果生成回答 → "北京今天天气晴朗，气温28度"
```

OpenAI Function Calling的代码示例：

```python
from openai import OpenAI

client = OpenAI()

# 定义工具
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": "在企业知识库中搜索信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "category": {"type": "string", "description": "知识分类"}
                },
                "required": ["query"]
            }
        }
    }
]

# 发送请求
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "北京今天的天气怎么样？"}],
    tools=tools
)

# 处理工具调用
message = response.choices[0].message
if message.tool_calls:
    for tool_call in message.tool_calls:
        function_name = tool_call.function.name
        function_args = json.loads(tool_call.function.arguments)
        
        # 执行工具
        if function_name == "get_weather":
            result = get_weather(**function_args)
        
        # 把工具结果返回给模型
        messages = [
            {"role": "user", "content": "北京今天的天气怎么样？"},
            message,
            {"role": "tool", "content": str(result), "tool_call_id": tool_call.id}
        ]
        
        final_response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools
        )
        print(final_response.choices[0].message.content)
```

工具设计的3个原则：

**原则一：工具描述要精确**
模型根据工具的描述来决定是否调用。描述不清晰，模型可能误调用或漏调用。

**原则二：参数设计要简单**
参数越少越好，参数类型尽量用string。复杂的参数结构容易导致模型传参错误。

**原则三：工具结果要结构化**
工具返回的结果应该是结构化的（JSON格式），方便模型理解和使用。

### 记忆系统

Agent的记忆分为3种：

**1. 短期记忆（对话历史）**
当前对话中的上下文。受上下文窗口限制，通常只能保留最近几轮对话。

**2. 工作记忆（当前任务状态）**
当前任务的执行计划、已完成步骤、待完成步骤。通常用结构化的方式存储。

```python
class AgentMemory:
    def __init__(self):
        self.task_plan = []      # 任务计划
        self.completed = []       # 已完成步骤
        self.current_step = None  # 当前步骤
        self.findings = {}        # 中间发现
    
    def update_plan(self, plan):
        self.task_plan = plan
    
    def complete_step(self, step, result):
        self.completed.append({"step": step, "result": result})
        self.findings[step] = result
    
    def get_context(self):
        return {
            "plan": self.task_plan,
            "completed": self.completed,
            "current": self.current_step,
            "findings": self.findings
        }
```

**3. 长期记忆（知识持久化）**
跨对话的知识积累。通常用向量数据库存储，每次对话时检索相关记忆。

长期记忆的实现：

```python
def save_memory(user_id, memory_content, vector_db):
    """保存一条记忆"""
    vector = embedding_model.embed(memory_content)
    vector_db.add(
        vectors=[vector],
        documents=[memory_content],
        metadatas=[{"user_id": user_id, "timestamp": datetime.now().isoformat()}]
    )

def recall_memory(user_id, query, vector_db, top_k=5):
    """回忆相关记忆"""
    query_vector = embedding_model.embed(query)
    results = vector_db.query(
        query_vectors=[query_vector],
        n_results=top_k,
        where={"user_id": user_id}
    )
    return results
```

> 记忆是Agent的"人格"基础。没有记忆的Agent就像失忆的助手，每次对话都从零开始。

## 4.3 Agent 高阶能力设计

### 规划与推理

规划是Agent最核心的高阶能力。好的规划能让Agent把复杂任务拆解成可执行的步骤，坏的规划会让Agent在死循环中浪费token。

**ReAct（Reasoning + Acting）**

ReAct是最经典的Agent规划框架，交替进行推理（Thought）和行动（Action）：

```
用户：帮我比较iPhone 15 Pro和Samsung S24 Ultra的相机参数

Thought：我需要分别获取iPhone 15 Pro和Samsung S24 Ultra的相机参数，然后进行比较。
Action：search("iPhone 15 Pro 相机参数")
Observation：iPhone 15 Pro：4800万像素主摄+1200万超广角+1200万长焦（3倍光学变焦）

Thought：已获取iPhone信息，现在获取Samsung信息。
Action：search("Samsung S24 Ultra 相机参数")
Observation：Samsung S24 Ultra：2亿像素主摄+1200万超广角+5000万长焦（5倍光学变焦）+1000万长焦（3倍）

Thought：信息足够，现在进行比较。
Action：generate_comparison(iPhone_15_Pro, Samsung_S24_Ultra)
```

**Plan-and-Execute**

先制定完整计划，再逐步执行。适合任务步骤较多、依赖关系清晰的场景。

```
用户：帮我写一篇关于AI Agent的技术报告

Step 1：制定大纲
→ 大纲：1.背景 2.定义 3.架构 4.关键技术 5.应用场景 6.挑战与展望

Step 2：撰写第1节 背景
→ 内容生成...

Step 3：撰写第2节 定义
→ 内容生成...

...（按计划逐步执行）
```

**反思机制（Self-Reflection）**

让Agent在执行过程中检查自己的输出质量，发现问题时回溯修正。

```python
REFLECTION_PROMPT = """你刚完成了以下任务：
任务：{task}
执行过程：{execution_log}
执行结果：{result}

请评估：
1. 结果是否完整回答了任务？
2. 有没有遗漏或错误？
3. 是否需要补充执行？

如果发现问题，请指出具体哪里需要修正。如果没问题，回复"质量合格"。"""
```

反思机制的价值：它能让Agent在输出前自检，减少幻觉和错误。但代价是额外的token消耗和延迟。

### 多Agent协作

复杂任务可以拆分给多个专业化的Agent协作完成。每个Agent有不同的角色和专业领域。

**协作模式一：顺序协作**

Agent A的输出是Agent B的输入，依次执行。

```
调研Agent → 写作Agent → 审校Agent → 发布Agent
```

适用场景：流水线式任务，每一步有明确的输入输出。

**协作模式二：辩论协作**

多个Agent对同一问题给出不同观点，通过辩论达成共识。

```
Agent A：支持方案X，理由是...
Agent B：支持方案Y，理由是...
Agent C（裁判）：综合A和B的观点，建议...
```

适用场景：需要多角度思考的决策问题。

**协作模式三：分工协作**

一个主Agent负责规划和分配，多个子Agent并行执行。

```
主Agent：将任务拆分为3个子任务
├── 子Agent A：负责数据分析
├── 子Agent B：负责市场调研
└── 子Agent C：负责竞品分析
主Agent：汇总3个子Agent的结果，生成最终报告
```

适用场景：子任务之间独立，可以并行执行。

CrewAI多Agent协作示例：

```python
from crewai import Agent, Task, Crew

# 定义Agent
researcher = Agent(
    role='研究员',
    goal='收集关于AI Agent的最新技术信息',
    backstory='你是一位技术研究员，擅长搜索和整理信息',
    tools=[search_tool]
)

writer = Agent(
    role='技术写作',
    goal='将研究信息整理成易懂的技术文章',
    backstory='你是一位技术博主，擅长将复杂技术解释清楚',
)

reviewer = Agent(
    role='审校员',
    goal='检查文章的准确性和可读性',
    backstory='你是一位资深编辑，对细节要求严格',
)

# 定义任务
research_task = Task(
    description='调研AI Agent的最新技术进展，包括ReAct、Plan-and-Execute、Multi-Agent等',
    agent=researcher
)

write_task = Task(
    description='基于调研结果，写一篇AI Agent技术综述文章',
    agent=writer
)

review_task = Task(
    description='审校文章，检查事实准确性、逻辑连贯性和可读性',
    agent=reviewer
)

# 组建团队并执行
crew = Crew(
    agents=[researcher, writer, reviewer],
    tasks=[research_task, write_task, review_task],
    verbose=True
)

result = crew.kickoff()
```

### 容错与安全

Agent的自主性越高，出错和被滥用的风险越大。容错和安全设计不可忽视。

**容错策略：**

| 策略 | 说明 | 实现 |
|------|------|------|
| 步数限制 | 限制Agent的最大执行步数 | max_steps=10 |
| 超时控制 | 单步执行超时则终止 | step_timeout=30s |
| 成本控制 | 限制token消耗总量 | max_tokens=50000 |
| 人工确认 | 关键操作需人工确认 | 关键工具调用前暂停 |
| 降级策略 | Agent失败时回退到简单方案 | fallback_to_rag=True |

**安全策略：**

| 策略 | 说明 | 实现 |
|------|------|------|
| 工具权限 | 限制Agent可调用的工具 | 工具白名单 |
| 输入过滤 | 过滤恶意用户输入 | 输入审计 |
| 输出审核 | 审核Agent的输出内容 | 输出安全检查 |
| 沙箱执行 | 代码执行在沙箱中 | Docker容器隔离 |
| 操作日志 | 记录Agent的所有操作 | 完整的action log |

> Agent的安全不是可选项，是必选项。一个不受控的Agent，比一个没有Agent的产品更危险。

## 4.4 Agent 实战矩阵

### 场景一：智能客服Agent

**需求：** 客服不仅回答问题，还要能执行操作（查询订单、发起退货、修改地址）

```python
# 工具定义
customer_service_tools = [
    {
        "name": "query_order",
        "description": "查询用户订单状态",
        "parameters": {"order_id": "string", "user_id": "string"}
    },
    {
        "name": "initiate_return",
        "description": "发起退货申请",
        "parameters": {"order_id": "string", "reason": "string"}
    },
    {
        "name": "update_address",
        "description": "修改收货地址",
        "parameters": {"order_id": "string", "new_address": "string"}
    },
    {
        "name": "search_knowledge_base",
        "description": "在企业知识库中搜索信息",
        "parameters": {"query": "string"}
    }
]

# Agent提示词
CUSTOMER_SERVICE_PROMPT = """你是一位专业的电商客服。你可以回答问题和执行操作。

规则：
1. 先理解用户意图，再决定是查询知识库还是执行操作
2. 执行操作前，向用户确认（如"我将为您发起退货申请，确认吗？"）
3. 修改地址和退货等敏感操作，必须先验证用户身份
4. 如果不确定，优先查询知识库而不是直接操作
5. 所有操作结果都要向用户确认"""
```

### 场景二：数据分析Agent

**需求：** 用户用自然语言描述分析需求，Agent自动完成数据查询、分析、可视化

```python
# 工具定义
data_analysis_tools = [
    {
        "name": "execute_sql",
        "description": "执行SQL查询",
        "parameters": {"sql": "string"}
    },
    {
        "name": "generate_chart",
        "description": "生成数据可视化图表",
        "parameters": {"data": "array", "chart_type": "string", "title": "string"}
    },
    {
        "name": "statistical_analysis",
        "description": "执行统计分析",
        "parameters": {"data": "array", "method": "string"}
    }
]
```

### 场景三：内容创作Agent

**需求：** 从选题到发布的内容创作全流程自动化

```python
# 多Agent分工
content_creation_agents = {
    "planner": "分析热点话题，确定选题和角度",
    "researcher": "搜索相关资料和数据",
    "writer": "撰写文章初稿",
    "editor": "审校和优化文章",
    "seo_optimizer": "优化标题和关键词"
}

# 工作流
workflow = [
    {"agent": "planner", "input": "本周科技热点", "output": "选题方案"},
    {"agent": "researcher", "input": "选题方案", "output": "研究资料"},
    {"agent": "writer", "input": "选题+资料", "output": "文章初稿"},
    {"agent": "editor", "input": "文章初稿", "output": "终稿"},
    {"agent": "seo_optimizer", "input": "终稿", "output": "发布版本"}
]
```

### Agent框架对比

| 框架 | 语言 | 特点 | 适用场景 |
|------|------|------|---------|
| LangChain | Python | 生态最全，文档丰富 | 通用Agent开发 |
| LangGraph | Python | 基于图的状态机，可控性强 | 复杂工作流 |
| CrewAI | Python | 多Agent协作，角色分配 | 团队协作场景 |
| AutoGen | Python | 微软出品，多Agent对话 | 研究和实验 |
| Dify | - | 可视化编排，低代码 | 快速原型 |
| Coze | - | 零代码，快速搭建 | 非技术人员 |

选择建议：初学者从Dify/Coze开始，开发者用LangChain/LangGraph，需要多Agent协作用CrewAI。

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| Agent定义 | 自主感知+决策+执行的智能体 |
| 能力层级 | 对话→工具→规划→协作，4级递进 |
| 使用决策 | RAG能解决的不上Agent，工作流能解决的不上自主Agent |
| 工具调用 | Function Calling是Agent的基础能力 |
| 记忆系统 | 短期+工作+长期，3层记忆 |
| 规划框架 | ReAct、Plan-and-Execute、Self-Reflection |
| 多Agent | 顺序/辩论/分工，3种协作模式 |
| 容错安全 | 步数限制+超时控制+工具权限+操作日志 |

觉得有用？收藏起来，下次直接照抄。

你在设计Agent时遇到过什么问题？评论区聊聊。

关注怕浪猫，下期我们讲需求分析——AI产品经理如何发现和验证用户需求。

系列进度 4/13

**下章预告：** 第5章机会捕捉，从用户体验基础到需求调研方法论，教你发现真正值得做的AI产品机会。
