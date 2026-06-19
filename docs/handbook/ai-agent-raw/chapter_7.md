# 第7章 多智能体协作：从单兵作战到群体智能

单个Agent再强大，也受限于一个LLM的推理能力和知识边界。当多个Agent组成团队，各司其职、相互协作，就能解决远超单Agent能力范围的复杂问题。这就是多智能体系统（Multi-Agent System, MAS）的核心价值。

## 7.1 多智能体系统架构：中心化与去中心化模式

### 两种基本架构

多Agent系统的组织方式决定了协作效率。核心选择是：**中心化**还是**去中心化**？

| 维度 | 中心化架构 | 去中心化架构 |
|------|-----------|-------------|
| 控制方式 | 主Agent统筹调度 | Agent间平等通信 |
| 通信模式 | 星形（主-从） | 网状（点对点） |
| 决策效率 | 高（单一决策点） | 低（需共识机制） |
| 容错能力 | 低（主Agent故障=系统故障） | 高（单点故障不影响全局） |
| 实现复杂度 | 较低 | 较高 |
| 适用场景 | 流程明确的任务 | 创造性、探索性任务 |

### 中心化架构实现

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

class OrchestratorAgent:
    """中心化架构的主控Agent"""

    def __init__(self, llm, worker_agents: dict):
        self.llm = llm
        self.workers = worker_agents  # {name: agent_instance}

    def execute_task(self, task: str) -> str:
        # 1. 分析任务，分配子任务
        plan = self._plan(task)

        # 2. 按顺序分配给各Worker
        results = {}
        for step in plan:
            worker_name = step["worker"]
            subtask = step["subtask"]
            results[worker_name] = self.workers[worker_name].execute(subtask)

        # 3. 汇总结果
        final_result = self._synthesize(task, results)
        return final_result

    def _plan(self, task: str) -> list[dict]:
        available_workers = list(self.workers.keys())
        prompt = f"""
任务：{task}
可用Agent：{available_workers}

请将任务分解为子任务，并分配给合适的Agent。
格式：[{{"worker": "agent名", "subtask": "子任务描述"}}]
"""
        response = self.llm.invoke(prompt)
        return json.loads(response.content)

    def _synthesize(self, original_task: str, results: dict) -> str:
        prompt = f"""
原始任务：{original_task}
各Agent执行结果：{json.dumps(results, ensure_ascii=False)}

请综合以上结果，生成最终答案。
"""
        return self.llm.invoke(prompt).content
```

### 去中心化架构实现

```python
class DecentralizedAgent:
    """去中心化架构中的平等Agent"""

    def __init__(self, name: str, role: str, llm):
        self.name = name
        self.role = role
        self.llm = llm
        self.message_queue: list[dict] = []

    def send_message(self, recipient: 'DecentralizedAgent', content: str):
        recipient.message_queue.append({
            "from": self.name,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })

    def process_messages(self) -> str:
        if not self.message_queue:
            return "无新消息"

        context = "\n".join([
            f"[{m['from']}]: {m['content']}" for m in self.message_queue
        ])

        prompt = f"""你是{self.name}，角色是{self.role}。
收到了以下消息：
{context}

请基于你的专业角色做出回应。"""
        response = self.llm.invoke(prompt).content
        self.message_queue.clear()
        return response
```

## 7.2 角色扮演与协作：基于状态机的任务分发

### 角色定义的重要性

多Agent协作的第一步是明确每个Agent的角色。角色定义包含三个要素：**职责范围**、**输入输出规范**、**协作接口**。

### 基于状态机的任务流程

```python
from enum import Enum, auto

class TaskState(Enum):
    INIT = auto()
    RESEARCHING = auto()
    WRITING = auto()
    REVIEWING = auto()
    REVISING = auto()
    DONE = auto()

class StateMachineOrchestrator:
    """基于状态机的多Agent协作"""

    TRANSITIONS = {
        TaskState.INIT: TaskState.RESEARCHING,
        TaskState.RESEARCHING: TaskState.WRITING,
        TaskState.WRITING: TaskState.REVIEWING,
        TaskState.REVIEWING: {  # 条件转移
            "approved": TaskState.DONE,
            "revision_needed": TaskState.REVISING,
        },
        TaskState.REVISING: TaskState.REVIEWING,
    }

    def __init__(self):
        self.researcher = ResearcherAgent()
        self.writer = WriterAgent()
        self.reviewer = ReviewerAgent()

    def run(self, topic: str) -> str:
        state = TaskState.INIT
        research_result = ""
        draft = ""
        review_feedback = ""

        while state != TaskState.DONE:
            if state == TaskState.INIT:
                state = TaskState.RESEARCHING

            elif state == TaskState.RESEARCHING:
                research_result = self.researcher.research(topic)
                state = TaskState.WRITING

            elif state == TaskState.WRITING:
                draft = self.writer.write(topic, research_result, review_feedback)
                state = TaskState.REVIEWING

            elif state == TaskState.REVIEWING:
                review = self.reviewer.review(draft)
                if review["approved"]:
                    state = TaskState.DONE
                else:
                    review_feedback = review["feedback"]
                    state = TaskState.REVISING

            elif state == TaskState.REVISING:
                state = TaskState.WRITING

        return draft
```

### CrewAI：简化多Agent协作

CrewAI是目前最易用的多Agent框架之一：

```python
from crewai import Agent, Task, Crew

# 定义Agent
researcher = Agent(
    role="研究员",
    goal="收集关于AI Agent最新发展趋势的详细信息",
    backstory="你是一位资深技术研究员，擅长从海量信息中提炼关键洞察。",
    allow_delegation=False,
    verbose=True,
)

writer = Agent(
    role="技术写作者",
    goal="将研究结果整理成结构清晰的技术文章",
    backstory="你是一位技术写作者，能把复杂的技术概念转化为易懂的文章。",
    allow_delegation=False,
    verbose=True,
)

reviewer = Agent(
    role="审稿人",
    goal="审核文章的准确性、完整性和可读性",
    backstory="你是一位严谨的审稿人，确保每篇文章都达到出版标准。",
    allow_delegation=False,
    verbose=True,
)

# 定义任务
research_task = Task(
    description="研究2024年AI Agent领域的最新进展，重点关注框架和实际应用案例",
    expected_output="包含5个关键发现的研究报告",
    agent=researcher,
)

write_task = Task(
    description="基于研究报告撰写一篇技术文章",
    expected_output="3000字的技术文章，包含代码示例",
    agent=writer,
)

review_task = Task(
    description="审核文章，检查技术准确性和可读性",
    expected_output="审核意见和修改建议",
    agent=reviewer,
)

# 组建团队并执行
crew = Crew(
    agents=[researcher, writer, reviewer],
    tasks=[research_task, write_task, review_task],
    verbose=True,
)

result = crew.kickoff()
```

> 参考文档：[CrewAI官方文档](https://docs.crewai.com/)

## 7.3 辩论与共识：多Agent解决复杂问题的机制

### 辩论机制

当问题没有标准答案时，让多个Agent从不同立场出发进行辩论，有助于发现更全面的解决方案：

```python
class DebateSystem:
    """多Agent辩论系统"""

    def __init__(self, llm, max_rounds: int = 3):
        self.llm = llm
        self.max_rounds = max_rounds

    def debate(self, topic: str) -> str:
        # 正方Agent
        pro_agent = Agent(
            role="正方辩手",
            system_prompt=f"你支持以下观点：{topic}。请用论据和事实支持你的立场。"
        )
        # 反方Agent
        con_agent = Agent(
            role="反方辩手",
            system_prompt=f"你反对以下观点：{topic}。请用论据和事实反驳。"
        )
        # 裁判Agent
        judge = Agent(
            role="裁判",
            system_prompt="你客观地评估双方的论点，给出综合结论。"
        )

        debate_history = []
        pro_argument = pro_agent.invoke(topic)
        debate_history.append(("正方", pro_argument))

        for round_num in range(self.max_rounds):
            con_rebuttal = con_agent.invoke(pro_argument)
            debate_history.append(("反方", con_rebuttal))

            pro_rebuttal = pro_agent.invoke(con_rebuttal)
            debate_history.append(("正方", pro_rebuttal))

        # 裁判综合评判
        full_debate = "\n\n".join([f"【{side}】：{arg}" for side, arg in debate_history])
        verdict = judge.invoke(f"以下是辩论记录：\n{full_debate}\n\n请给出综合结论。")

        return verdict
```

### 共识机制

对于需要多方达成一致的场景，可以采用"提议-评审-修改"的共识流程：

```python
class ConsensusSystem:
    """多Agent共识机制"""

    def __init__(self, agents: list, llm, threshold: float = 0.7):
        self.agents = agents
        self.llm = llm
        self.threshold = threshold  # 共识阈值

    def reach_consensus(self, proposal: str) -> dict:
        """通过多轮投票达成共识"""
        current_proposal = proposal

        for round_num in range(5):  # 最多5轮
            votes = []
            for agent in self.agents:
                vote = agent.vote(current_proposal)
                votes.append(vote)

            approval_rate = sum(1 for v in votes if v["approved"]) / len(votes)

            if approval_rate >= self.threshold:
                return {
                    "consensus_reached": True,
                    "proposal": current_proposal,
                    "approval_rate": approval_rate,
                    "rounds": round_num + 1,
                }

            # 整合反对意见，修改提案
            objections = [v["suggestion"] for v in votes if not v["approved"]]
            current_proposal = self._revise_proposal(current_proposal, objections)

        return {
            "consensus_reached": False,
            "proposal": current_proposal,
            "approval_rate": approval_rate,
            "rounds": 5,
        }

    def _revise_proposal(self, current: str, objections: list) -> str:
        prompt = f"""当前提案：{current}
反对意见：{json.dumps(objections, ensure_ascii=False)}
请修改提案，尽量采纳反对意见中的合理建议。"""
        return self.llm.invoke(prompt).content
```

## 7.4 案例解析：软件公司模拟与自动化新闻编辑部

### 案例一：MetaGPT软件公司

MetaGPT模拟了一个完整的软件公司流程：

```
产品经理 -> 需求文档(PRD)
    |
架构师 -> 系统设计文档
    |
项目经理 -> 任务拆分
    |
工程师 -> 代码实现
    |
QA -> 测试报告
```

```python
from metagpt.roles import ProductManager, Architect, ProjectManager, Engineer

# 创建角色
pm = ProductManager()
arch = Architect()
proj_mgr = ProjectManager()
engineer = Engineer()

# 按SOP流程执行
async def develop_software(requirement: str):
    # 产品经理写PRD
    prd = await pm.run(requirement)

    # 架构师设计系统
    design = await arch.run(prd)

    # 项目经理拆分任务
    tasks = await proj_mgr.run(design)

    # 工程师实现代码
    code = await engineer.run(tasks)

    return code
```

**关键启示**：MetaGPT的成功在于将**人类软件工程的最佳实践（SOP）**编码进了Agent协作流程，而非让Agent完全自由发挥。

### 案例二：自动化新闻编辑部

模拟一个新闻编辑部的多Agent协作：

```python
class NewsroomCrew:
    def __init__(self, llm):
        self.llm = llm
        self.reporter = Agent(
            role="记者",
            goal="采集新闻素材，撰写初稿",
        )
        self.editor = Agent(
            role="编辑",
            goal="审核稿件质量，确保新闻标准",
        )
        self.fact_checker = Agent(
            role="事实核查员",
            goal="核查新闻中的事实准确性",
        )
        self.publisher = Agent(
            role="发布员",
            goal="排版并发布新闻",
        )

    async def produce_article(self, topic: str) -> str:
        # 记者采集和写作
        draft = self.reporter.run(f"报道主题：{topic}")

        # 事实核查
        fact_report = self.fact_checker.run(f"核查以下稿件的事实准确性：\n{draft}")

        # 编辑审核
        edited = self.editor.run(
            f"编辑以下稿件（事实核查报告：{fact_report}）：\n{draft}"
        )

        # 发布
        return self.publisher.run(f"排版并发布：\n{edited}")
```

## 7.5 协作冲突解决：资源竞争与任务分配的仲裁机制

### 冲突类型

多Agent协作中的冲突主要有三类：

| 冲突类型 | 示例 | 解决策略 |
|----------|------|---------|
| 资源竞争 | 两个Agent同时需要调用同一个API | 排队 + 优先级调度 |
| 结果冲突 | 两个Agent给出矛盾的分析结论 | 事实核查 + 置信度排序 |
| 任务边界 | 谁负责某个模糊地带的工作 | 角色定义明确化 + 仲裁Agent |

### 仲裁Agent

引入一个专门的仲裁Agent，在冲突发生时做最终裁决：

```python
class ArbitratorAgent:
    """仲裁Agent：解决多Agent间的冲突"""

    def __init__(self, llm):
        self.llm = llm

    def resolve_conflict(self, conflict: dict) -> dict:
        """裁决冲突"""
        prompt = f"""
以下Agent之间产生了冲突：
{json.dumps(conflict, ensure_ascii=False, indent=2)}

作为仲裁者，请：
1. 分析冲突的根本原因
2. 评估各方的合理性
3. 给出最终裁决
4. 说明裁决理由
"""
        ruling = self.llm.invoke(prompt).content
        return {"ruling": ruling, "conflict_id": conflict.get("id")}

    def allocate_resource(self, resource: str, requesters: list[dict]) -> dict:
        """资源分配"""
        prompt = f"""
资源：{resource}
请求者及理由：
{json.dumps(requesters, ensure_ascii=False, indent=2)}

请按优先级分配资源，说明分配理由。
"""
        return self.llm.invoke(prompt).content
```

### 防止死锁

多Agent协作中可能出现循环等待（死锁）：

```python
class DeadlockDetector:
    """检测和解决多Agent协作中的死锁"""

    def __init__(self, max_wait_cycles: int = 3):
        self.max_wait_cycles = max_wait_cycles
        self.wait_counts: dict[str, int] = {}

    def check_deadlock(self, agent_id: str, waiting_for: str) -> bool:
        key = f"{agent_id}->wait->{waiting_for}"
        self.wait_counts[key] = self.wait_counts.get(key, 0) + 1

        if self.wait_counts[key] >= self.max_wait_cycles:
            return True  # 检测到潜在死锁
        return False

    def resolve(self, agent_id: str, waiting_for: str) -> str:
        """解决死锁：强制释放资源或降级任务"""
        self.wait_counts[f"{agent_id}->wait->{waiting_for}"] = 0
        return f"检测到{agent_id}等待{waiting_for}超时，已强制释放并降级处理"
```

## 本章小结

| 主题 | 核心方案 | 关键要点 |
|------|---------|---------|
| 系统架构 | 中心化 vs 去中心化 | 流程明确用中心化，创造探索用去中心化 |
| 角色协作 | 状态机 + CrewAI | 角色定义三要素：职责、接口、规范 |
| 辩论共识 | 辩论 + 投票共识 | 辩论发现多角度，共识求同存异 |
| 案例实践 | 软件公司 / 新闻编辑部 | SOP流程编码比自由发挥更可靠 |
| 冲突解决 | 仲裁Agent + 死锁检测 | 事前明确角色 > 事后仲裁 |

> 下一章，我们将为Agent构建用户界面——让Agent的能力通过友好的交互呈现给用户。
