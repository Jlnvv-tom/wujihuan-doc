# 第13章 AutoGen 实战：微软多智能体协作框架

一个AI写代码，另一个AI审代码，吵完了给你一个最优方案。AutoGen 的群聊模式就是这么硬核。

我是怕浪猫，上一章聊了 LangGraph 的状态机编排，今天来搞 AutoGen——微软推出的多智能体协作框架。核心卖点：让多个 AI Agent 像"真人团队"一样对话协作。

---

## 13.1 AutoGen 核心架构与定位

**AutoGen 是什么？**

AutoGen 是微软研究院推出的多智能体协作框架，核心理念是"通过对话实现协作"——多个 Agent 通过消息传递来协商、合作、完成任务。

核心特性：

1. **对话驱动**：Agent 之间通过对话来协作
2. **角色定制**：每个 Agent 有独立的角色和系统提示
3. **人类参与**：支持人类作为 Agent 参与对话
4. **代码执行**：内置代码执行能力
5. **群聊模式**：多 Agent 群聊讨论

**和其他框架对比**

| 维度 | AutoGen | LangGraph | CrewAI |
|------|---------|-----------|--------|
| 核心模式 | 对话协作 | 状态机编排 | 角色任务 |
| 多Agent | 群聊对话 | 图结构 | 团队流程 |
| 微软生态 | 深度集成 | 无 | 无 |
| 学习曲线 | 中 | 高 | 低 |
| 灵活度 | 中 | 高 | 低 |

> AutoGen 适合"需要多个AI协商决策"的场景，不适合"严格流程控制"的场景。选型前先想清楚你需要哪种协作模式。

---

## 13.2 双 Agent 对话模式

**最简单的协作：两个人对话**

```python
from autogen import ConversableAgent

# 创建两个 Agent
coder = ConversableAgent(
    name="Coder",
    system_message="你是一个资深Python开发者，负责编写高质量代码。",
    llm_config={"model": "gpt-4o"}
)

reviewer = ConversableAgent(
    name="Reviewer",
    system_message="你是一个严格的代码评审专家，检查代码质量、安全性和性能。",
    llm_config={"model": "gpt-4o"}
)

# 启动对话
result = coder.initiate_chat(
    reviewer,
    message="请帮我写一个Python函数，实现二分查找算法。"
)
```

**对话流程**

```
Coder: 写了一个二分查找实现
    ↓
Reviewer: 指出边界条件处理有问题
    ↓
Coder: 修改后重新提交
    ↓
Reviewer: 通过审核
```

**设置终止条件**

```python
from autogen import ConversableAgent

coder = ConversableAgent(
    name="Coder",
    system_message="你是Python开发者。",
    llm_config={"model": "gpt-4o"},
    max_consecutive_auto_reply=3  # 最多自动回复3次
)

reviewer = ConversableAgent(
    name="Reviewer",
    system_message="你是代码评审专家。审核通过后说'REVIEW PASSED'。",
    llm_config={"model": "gpt-4o"},
    is_termination_msg=lambda msg: "REVIEW PASSED" in msg.get("content", "")
)
```

---

## 13.3 GroupChat 群聊协作

**多 Agent 群聊**

```python
from autogen import ConversableAgent, GroupChat, GroupChatManager

# 创建多个 Agent
planner = ConversableAgent(
    name="Planner",
    system_message="你是一个项目规划专家，负责任务拆解和分配。",
    llm_config={"model": "gpt-4o"}
)

researcher = ConversableAgent(
    name="Researcher",
    system_message="你是一个市场研究员，负责收集和分析市场数据。",
    llm_config={"model": "gpt-4o"}
)

writer = ConversableAgent(
    name="Writer",
    system_message="你是一个资深内容撰写人，负责撰写分析报告。",
    llm_config={"model": "gpt-4o"}
)

# 创建群聊
group_chat = GroupChat(
    agents=[planner, researcher, writer],
    messages=[],
    max_round=10  # 最多10轮对话
)

# 创建群聊管理器
manager = GroupChatManager(
    groupchat=group_chat,
    llm_config={"model": "gpt-4o"}
)

# 启动群聊
planner.initiate_chat(
    manager,
    message="我们需要分析2024年中国新能源汽车市场，并生成一份完整报告。"
)
```

**群聊流程**

```
Planner: 将任务拆解为3个子任务：市场数据收集、竞品分析、报告撰写
    ↓
Researcher: 我来负责市场数据收集和竞品分析
    ↓
Writer: 我等数据出来后负责报告撰写
    ↓
Researcher: 数据收集完成，关键发现是...
    ↓
Planner: 好的，Writer可以开始撰写了
    ↓
Writer: 报告初稿完成，请Review
    ↓
Planner: 看起来不错，还需要补充...
```

**群聊管理策略**

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| auto | 管理器自动选择下一个发言者 | 通用 |
| round_robin | 按顺序轮流发言 | 固定流程 |
| random | 随机选择发言者 | 头脑风暴 |
| 自定义 | 自定义选择逻辑 | 特殊需求 |

---

## 13.4 代码生成与执行实战

**场景**

用 AutoGen 构建"AI 编程团队"——Coder 写代码，Executor 执行测试，Reviewer 审核。

```python
from autogen import ConversableAgent, AssistantAgent, UserProxyAgent

# Coder：写代码
coder = AssistantAgent(
    name="Coder",
    system_message="你是Python开发者。只写代码，不解释。",
    llm_config={"model": "gpt-4o"}
)

# Executor：执行代码
executor = UserProxyAgent(
    name="Executor",
    system_message="你负责执行代码并报告结果。",
    human_input_mode="NEVER",
    code_execution_config={
        "work_dir": "./workspace",
        "use_docker": False
    }
)

# 启动协作
coder.initiate_chat(
    executor,
    message="写一个Python函数，实现快速排序算法，并测试。"
)
```

**安全注意事项**

1. **代码沙箱**：始终在 Docker 容器中执行代码
2. **网络限制**：限制代码的网络访问
3. **资源限制**：限制 CPU 和内存使用
4. **超时控制**：设置代码执行超时

```python
executor = UserProxyAgent(
    name="Executor",
    code_execution_config={
        "work_dir": "./workspace",
        "use_docker": True,  # 使用Docker沙箱
        "timeout": 60  # 超时60秒
    }
)
```

---

## 13.5 人类代理参与协作

**让人类作为 Agent 参与对话**

```python
from autogen import UserProxyAgent

# 人类代理
human = UserProxyAgent(
    name="Human",
    human_input_mode="ALWAYS",  # 每次都需要人类输入
    system_message="你是项目Owner，做最终决策。"
)

# AI 代理
assistant = AssistantAgent(
    name="Assistant",
    system_message="你是AI助手，提供方案建议，由人类做最终决策。",
    llm_config={"model": "gpt-4o"}
)

# 启动对话
human.initiate_chat(
    assistant,
    message="帮我设计一个用户增长方案"
)
```

**human_input_mode 参数**

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| ALWAYS | 每次都需要人类输入 | 关键决策 |
| TERMINATE | 只在终止时需要人类确认 | 审核确认 |
| NEVER | 完全自动 | 自动化任务 |

---

## 13.6 实战：数据分析与报告生成

**场景**

用3个 Agent 协作完成数据分析任务：数据工程师清洗数据，分析师分析数据，写手撰写报告。

```python
from autogen import ConversableAgent, GroupChat, GroupChatManager

data_engineer = ConversableAgent(
    name="DataEngineer",
    system_message="""你是一个数据工程师，负责数据清洗和预处理。
工作内容：
1. 读取原始数据
2. 处理缺失值和异常值
3. 数据类型转换
4. 输出清洗后的数据摘要""",
    llm_config={"model": "gpt-4o"}
)

analyst = ConversableAgent(
    name="Analyst",
    system_message="""你是一个数据分析师，负责数据分析和可视化。
工作内容：
1. 描述性统计分析
2. 发现数据中的趋势和模式
3. 生成分析结论
4. 推荐可视化方案""",
    llm_config={"model": "gpt-4o"}
)

reporter = ConversableAgent(
    name="Reporter",
    system_message="""你是一个报告撰写专家，负责将分析结果写成清晰的报告。
要求：
1. 结构清晰（摘要→发现→建议）
2. 数据支撑结论
3. 语言简洁专业
4. 添加下一步行动建议""",
    llm_config={"model": "gpt-4o"}
)

group = GroupChat(agents=[data_engineer, analyst, reporter], messages=[], max_round=8)
manager = GroupChatManager(groupchat=group, llm_config={"model": "gpt-4o"})

data_engineer.initiate_chat(
    manager,
    message="分析最近30天的用户行为数据，找出流失风险最高的用户群体。"
)
```

> 多智能体协作的优势不是"做得更快"，而是"做得更好"。每个 Agent 专注自己的领域，互相检查和补充，最终产出质量远超单个 Agent。

---

## 13.7 AutoGen 高级应用与最佳实践

**自定义 Agent 选择策略**

```python
def custom_speaker_selection(last_speaker, messages):
    """自定义发言者选择逻辑"""
    last_msg = messages[-1]["content"]
    
    if "数据清洗完成" in last_msg:
        return analyst
    elif "分析完成" in last_msg:
        return reporter
    elif "需要更多数据" in last_msg:
        return data_engineer
    else:
        return None  # 让管理器自动选择

group = GroupChat(
    agents=[data_engineer, analyst, reporter],
    messages=[],
    speaker_selection_method=custom_speaker_selection
)
```

**最佳实践清单**

| 实践 | 说明 |
|------|------|
| 明确角色 | 每个Agent的角色不能重叠 |
| 限制轮次 | 设置max_round防止无限对话 |
| 终止条件 | 设置明确的终止信号 |
| 人类兜底 | 关键决策让人类确认 |
| 代码沙箱 | 始终在Docker中执行代码 |
| 日志记录 | 记录完整对话用于调试 |

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 双Agent对话 | 最简单的协作模式，适合写代码+审代码 |
| GroupChat | 多Agent群聊讨论，管理器协调发言 |
| 代码执行 | Docker沙箱+超时控制 |
| 人类参与 | 3种模式：ALWAYS/TERMINATE/NEVER |
| 数据分析实战 | 数据工程师→分析师→报告撰写 |
| 最佳实践 | 角色不重叠、限制轮次、人类兜底 |

---

觉得有用？收藏起来，下次直接照抄。

你用 AutoGen 做过多Agent协作项目吗？评论区聊聊。

关注怕浪猫，下期我们讲 CrewAI——角色驱动的多智能体团队框架。

系列进度 13/24

**下章预告：** 第14章我们将深入 CrewAI，从角色定义到团队协作，用"AI团队"的方式构建内容生产和数据分析应用。
