# 第4章 规划与推理：赋予Agent思考的能力

记忆让Agent拥有知识，但知识本身不能解决问题。Agent需要"思考"——面对一个复杂任务，它能分解步骤、选择策略、发现错误并自我纠正。这就是规划与推理的核心价值。

## 4.1 任务分解：ReAct框架与思维树（ToT）解析

### ReAct：推理与行动的交织

ReAct（Reasoning + Acting）是目前最主流的Agent推理框架。它的核心思想极其直观：**在每一步中，Agent先"想"再"做"**。

```
思考：用户问北京今天天气，我不知道实时天气，需要搜索
行动：调用天气API查询北京
观察：北京今天晴，25°C，微风
思考：已经获取到天气信息，可以回答了
回答：北京今天天气晴朗，气温25度，微风，适合外出活动。
```

在LangChain中实现ReAct Agent：

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_react_agent
from langchain_core.prompts import PromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun

llm = ChatOpenAI(model="gpt-4o", temperature=0)
search = DuckDuckGoSearchRun()
tools = [search]

# ReAct提示词模板
react_template = """尽可能回答以下问题。你可以使用以下工具：

{tools}

使用以下格式：
问题：你必须回答的输入问题
思考：你应该总是思考下一步做什么
行动：要采取的行动，应该是[{tool_names}]中的一个
行动输入：行动的参数
观察：行动的结果
...（思考/行动/行动输入/观察可以重复N次）
思考：我现在知道最终答案了
最终答案：对原始问题的最终答案

开始！
问题：{input}
思考：{agent_scratchpad}"""

prompt = PromptTemplate.from_template(react_template)
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=5)

result = agent_executor.invoke({"input": "2024年全球市值最高的公司是哪家？"})
```

### ReAct的关键参数

| 参数 | 说明 | 建议值 |
|------|------|--------|
| max_iterations | 最大推理步数 | 5-10（过多会增加成本和延迟） |
| max_execution_time | 最大执行时间（秒） | 30-60 |
| handle_parsing_errors | 推理失败时的处理策略 | "check"或自定义函数 |
| early_stopping_method | 提前停止策略 | "generate"（强制生成最终答案） |

### 思维树（Tree of Thought, ToT）

ReAct是线性的——每一步只有一个选择。但复杂问题可能需要探索多条路径，这就是思维树的价值。

ToT允许Agent在每一步生成多个候选方案，然后评估每个方案的价值，选择最优路径继续深入：

```
                    问题
                   /    \
              思路A      思路B
             /    \        |
         方案A1   方案A2  方案B1
          |       |       |
        评估:8   评估:6  评估:9
                         |
                     最终答案
```

```python
def tree_of_thought_solve(problem: str, branches: int = 3, depth: int = 3) -> str:
    """简化版思维树实现"""
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)  # 较高温度增加多样性

    def generate_thoughts(state: str, n: int) -> list[str]:
        """生成n个候选思路"""
        prompt = f"当前状态：{state}\n问题：{problem}\n请生成{n}个不同的下一步思路："
        response = llm.invoke(prompt)
        # 解析为n条思路
        return [line.strip() for line in response.content.split("\n") if line.strip()][:n]

    def evaluate_thought(thought: str) -> float:
        """评估一个思路的价值（1-10）"""
        prompt = f"评估以下思路对解决问题的价值（1-10分）：\n思路：{thought}\n问题：{problem}\n评分："
        response = llm.invoke(prompt)
        try:
            return float(response.content.strip())
        except:
            return 5.0

    best_path = ""
    current_state = problem

    for d in range(depth):
        thoughts = generate_thoughts(current_state, branches)
        scores = [(t, evaluate_thought(t)) for t in thoughts]
        best_thought, best_score = max(scores, key=lambda x: x[1])
        best_path += f"\n步骤{d+1}（评分:{best_score}）：{best_thought}"
        current_state = best_thought

    return best_path
```

> 参考论文：[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) | [Tree of Thoughts](https://arxiv.org/abs/2305.10601)

## 4.2 反思机制：Self-Reflection与自我纠错流程

### 为什么Agent需要反思？

LLM不是完美的——它会犯错、会产生幻觉、会遗漏关键信息。没有反思机制的Agent就像一个不会检查作业的学生，犯错了也不会知道。

### Self-Reflection的基本模式

反思机制的核心是在Agent执行后增加一个"自检"步骤：

```
执行 -> 检查 -> 发现问题 -> 修正 -> 重新执行 -> 通过 -> 返回结果
```

```python
from pydantic import BaseModel

class ReflectionResult(BaseModel):
    is_correct: bool
    issues: list[str]
    suggestions: list[str]

class ReflectiveAgent:
    def __init__(self):
        self.llm = ChatOpenAI(model="gpt-4o", temperature=0)
        self.max_retries = 3

    def execute_with_reflection(self, task: str, execute_fn, reflect_fn) -> str:
        result = execute_fn(task)

        for attempt in range(self.max_retries):
            reflection = reflect_fn(task, result)

            if reflection.is_correct:
                return result

            # 根据反思建议修正
            correction_prompt = f"""
原始任务：{task}
上次执行结果：{result}
发现的问题：{reflection.issues}
改进建议：{reflection.suggestions}

请根据以上反馈修正执行结果。
"""
            result = self.llm.invoke(correction_prompt).content

        return result  # 达到最大重试次数，返回当前结果

    def reflect_on_code(self, task: str, code: str) -> ReflectionResult:
        """对生成的代码进行反思"""
        structured_llm = self.llm.with_structured_output(ReflectionResult)
        return structured_llm.invoke(f"""
检查以下代码是否正确完成了任务：
任务：{task}
代码：{code}

请评估：
1. 代码是否正确完成了任务？
2. 是否有bug或逻辑错误？
3. 是否有改进建议？
""")
```

### Refine模式：迭代优化

LangChain提供了一个优雅的Refine链，适合对长文本进行迭代优化：

```python
from langchain.chains import RefineDocumentsChain

# 对Agent生成的分析报告进行多轮优化
refine_chain = RefineDocumentsChain.from_llm(
    llm=ChatOpenAI(model="gpt-4o"),
    question_prompt=initial_analysis_prompt,
    refine_prompt=refine_improvement_prompt,
)
```

## 4.3 多步推理：复杂逻辑下的决策路径优化

### 推理链的挑战

复杂任务往往需要多步推理，每一步都依赖上一步的结果。如果中间某一步出错，后续所有步骤都会偏离。

### 链式推理（Chain of Reasoning）

```python
class ChainedReasoner:
    def __init__(self, llm):
        self.llm = llm

    def reason(self, problem: str, steps: list[str]) -> dict:
        """按步骤链式推理，每步记录中间结果"""
        reasoning_chain = {"problem": problem, "steps": []}
        current_context = problem

        for i, step_description in enumerate(steps):
            step_prompt = f"""
当前问题：{problem}
已完成的推理步骤：{json.dumps(reasoning_chain["steps"], ensure_ascii=False)}
当前步骤（第{i+1}步）：{step_description}

请完成这一步推理，给出明确的中间结论。
"""
            step_result = self.llm.invoke(step_prompt).content
            reasoning_chain["steps"].append({
                "step": i + 1,
                "description": step_description,
                "conclusion": step_result
            })
            current_context = step_result

        # 最终综合所有步骤给出答案
        final_prompt = f"""
问题：{problem}
推理过程：{json.dumps(reasoning_chain["steps"], ensure_ascii=False)}

请综合以上所有步骤，给出最终答案。
"""
        reasoning_chain["final_answer"] = self.llm.invoke(final_prompt).content
        return reasoning_chain

# 使用
reasoner = ChainedReasoner(ChatOpenAI(model="gpt-4o"))
result = reasoner.reason(
    problem="某电商网站用户转化率下降了20%，如何分析原因？",
    steps=[
        "梳理可能影响转化率的所有因素",
        "确定最可能的Top 3因素",
        "为每个因素设计验证方案",
        "制定修复优先级和时间表"
    ]
)
```

### 分支推理与回溯

对于不确定性高的决策，可以采用分支推理——同时探索多条路径，遇到死胡同则回溯：

```python
class BranchingReasoner:
    def __init__(self, llm, max_branches: int = 3):
        self.llm = llm
        self.max_branches = max_branches

    def explore(self, problem: str, depth: int = 2) -> list[dict]:
        paths = [{"problem": problem, "steps": [], "status": "exploring"}]

        for d in range(depth):
            new_paths = []
            for path in paths:
                if path["status"] != "exploring":
                    new_paths.append(path)
                    continue
                # 生成多个分支
                branches = self._generate_branches(path)
                new_paths.extend(branches)
            paths = new_paths

        # 评估所有完成的路径
        for path in paths:
            path["score"] = self._evaluate_path(path)

        return sorted(paths, key=lambda p: p.get("score", 0), reverse=True)
```

## 4.4 幻觉抑制：基于事实核查的推理增强技术

### 幻觉的根源

LLM的幻觉（Hallucination）主要有三种类型：

| 类型 | 表现 | 示例 |
|------|------|------|
| 事实性幻觉 | 编造不存在的事实 | "Python 4.0于2023年发布" |
| 逻辑性幻觉 | 推理链中引入错误逻辑 | 跳过关键步骤或错误归因 |
| 忠实性幻觉 | 与提供的上下文矛盾 | 上下文说A，回答却说B |

### 事实核查增强

**策略一：检索增强验证**

```python
def fact_check_with_retrieval(claim: str, retriever) -> dict:
    """用检索结果验证声明"""
    docs = retriever.invoke(claim)

    verification_prompt = f"""
待验证声明：{claim}
参考资料：{docs}

请判断：
1. 该声明是否被参考资料支持？
2. 是否有证据反驳该声明？
3. 可信度评级：高/中/低
"""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    return llm.invoke(verification_prompt).content
```

**策略二：自我一致性检查**

对同一问题多次采样，如果多次结果一致，则更可信：

```python
def self_consistency_check(question: str, n_samples: int = 5) -> str:
    """通过多次采样检查答案一致性"""
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)  # 较高温度增加多样性

    answers = []
    for _ in range(n_samples):
        response = llm.invoke(question)
        answers.append(response.content)

    # 用另一次LLM调用统计最常见的答案
    consensus_prompt = f"""
问题：{question}
以下是{n_samples}个独立回答：
{chr(10).join(f'回答{i+1}：{a}' for i, a in enumerate(answers))}

请找出最一致的答案。如果答案分歧较大，请说明不确定性。
"""
    return ChatOpenAI(model="gpt-4o", temperature=0).invoke(consensus_prompt).content
```

**策略三：置信度校准**

让模型对自己的回答标注置信度：

```python
from pydantic import BaseModel

class AnswerWithConfidence(BaseModel):
    answer: str
    confidence: float  # 0.0 - 1.0
    reasoning: str
    assumptions: list[str]  # 列出做出的假设

def answer_with_confidence(question: str) -> AnswerWithConfidence:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    structured = llm.with_structured_output(AnswerWithConfidence)
    return structured.invoke(f"""
回答以下问题，并提供置信度和推理依据：
{question}

注意：
- 置信度反映你对答案的确信程度
- 明确列出你做出的假设
- 如果不确定，降低置信度而不是编造
""")
```

## 4.5 动态规划调整：应对环境反馈的实时策略修正

### 静态规划 vs 动态规划

传统Agent的规划是"一次制定，严格执行"，但现实世界的任务充满变数——工具可能失败、数据可能缺失、用户需求可能变化。动态规划让Agent能根据环境反馈实时调整策略。

### 基于反馈的规划修正

```python
class DynamicPlanner:
    def __init__(self, llm):
        self.llm = llm

    def plan(self, task: str, context: dict = None) -> list[dict]:
        """生成初始计划"""
        planning_prompt = f"""
任务：{task}
当前上下文：{context or '无'}

请制定执行计划，每步包含：
1. 步骤描述
2. 预期结果
3. 失败时的备选方案
4. 前置依赖（需要哪些步骤先完成）
"""
        response = self.llm.invoke(planning_prompt)
        return self._parse_plan(response.content)

    def adjust_plan(
        self,
        original_plan: list[dict],
        current_step: int,
        execution_result: dict,
        context: dict
    ) -> list[dict]:
        """根据执行结果调整计划"""
        adjustment_prompt = f"""
原始计划：{json.dumps(original_plan, ensure_ascii=False)}
当前执行到第{current_step}步
执行结果：{json.dumps(execution_result, ensure_ascii=False)}
当前上下文：{json.dumps(context, ensure_ascii=False)}

请根据执行结果调整剩余计划：
1. 如果当前步骤成功，是否需要调整后续步骤？
2. 如果当前步骤失败，应该采取什么替代方案？
3. 是否有新的步骤需要添加？

输出调整后的完整计划。
"""
        response = self.llm.invoke(adjustment_prompt)
        return self._parse_plan(response.content)

    def _parse_plan(self, plan_text: str) -> list[dict]:
        """解析LLM输出的计划文本为结构化数据"""
        # 简化实现：实际中需要更健壮的解析逻辑
        steps = []
        for line in plan_text.split("\n"):
            if line.strip() and line.strip()[0].isdigit():
                steps.append({"description": line.strip()})
        return steps
```

### 执行-评估-调整循环

```python
def execute_with_adaptation(
    task: str,
    planner: DynamicPlanner,
    executor,  # 执行单步的函数
    max_retries_per_step: int = 2
):
    plan = planner.plan(task)
    results = []

    for i, step in enumerate(plan):
        for retry in range(max_retries_per_step):
            result = executor(step)

            if result.get("success"):
                results.append({"step": i, "status": "success", "result": result})
                break
            else:
                # 执行失败，调整计划
                plan = planner.adjust_plan(
                    plan, i, result,
                    context={"completed_steps": results}
                )
                if retry == max_retries_per_step - 1:
                    results.append({"step": i, "status": "failed", "result": result})

    return results
```

### 关键设计原则

1. **每次执行后都评估**：不要等到计划全部执行完才检查
2. **保留调整历史**：记录每次调整的原因，方便事后审计
3. **设置退化策略**：当多次调整仍失败时，降级为更简单的方案
4. **避免无限循环**：设置最大调整次数和总超时时间

## 本章小结

| 推理技术 | 核心思想 | 适用场景 |
|----------|---------|---------|
| ReAct | 交替推理与行动 | 通用Agent任务 |
| 思维树(ToT) | 多路径探索 + 评估选择 | 开放性、创造性问题 |
| Self-Reflection | 执行后自检 + 纠正 | 代码生成、分析报告 |
| 链式推理 | 分步推理 + 中间结果传递 | 多步骤逻辑问题 |
| 分支推理 | 同时探索多条路径 | 高不确定性决策 |
| 幻觉抑制 | 检索验证 + 多次采样 + 置信度 | 事实性问答 |
| 动态规划 | 执行-评估-调整循环 | 动态环境、不可预测任务 |

> 下一章，我们将学习Agent如何使用工具——连接外部世界的桥梁，让Agent从"只会想"变成"能做事"。
