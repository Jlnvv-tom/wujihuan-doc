# 第14章 CrewAI 实战：角色驱动的 AI 团队

AutoGen 像会议室——大家七嘴八舌讨论。CrewAI 像项目组——各有分工，流程驱动。

我是怕浪猫，上一章聊了 AutoGen 的对话驱动协作，今天来搞 CrewAI——角色驱动的多智能体框架。核心卖点是"定义角色→定义任务→组建团队→自动执行"，更像是一个真正的项目团队。

---

## 14.1 CrewAI 核心概念与定位

**CrewAI 是什么？**

CrewAI 是一个角色驱动的多智能体协作框架，核心理念是"像管理团队一样管理AI Agent"。

三大核心概念：

1. **Agent（角色）**：定义谁来做——角色、目标、工具
2. **Task（任务）**：定义做什么——目标、描述、预期输出
3. **Crew（团队）**：定义怎么做——流程、角色、执行方式

**和 AutoGen 对比**

| 维度 | CrewAI | AutoGen |
|------|--------|---------|
| 驱动方式 | 角色任务驱动 | 对话驱动 |
| 协作模式 | 流程化 | 自由讨论 |
| 灵活度 | 低（结构化） | 高（自由） |
| 可控性 | 高 | 中 |
| 适合场景 | 结构化任务 | 探索性任务 |

> 如果你知道要做什么，用 CrewAI。如果你还在探索怎么做，用 AutoGen。

---

## 14.2 Agent、Task、Crew 三件套

**安装**

```bash
pip install crewai
```

**定义 Agent**

```python
from crewai import Agent

researcher = Agent(
    role="市场研究员",
    goal="收集和分析市场数据，发现行业趋势",
    backstory="你是一个经验丰富的市场研究员，擅长从海量数据中发现关键趋势。",
    verbose=True,
    allow_delegation=False,
    tools=[search_tool, web_scraper_tool]
)

writer = Agent(
    role="内容撰写专家",
    goal="根据研究数据撰写高质量的分析报告",
    backstory="你是一个资深分析师和写手，擅长把复杂的数据变成清晰的故事。",
    verbose=True,
    allow_delegation=True
)
```

**定义 Task**

```python
from crewai import Task

research_task = Task(
    description="""
    研究中国新能源汽车市场2024年的发展趋势。
    重点关注：
    1. 市场规模和增速
    2. 头部品牌市场份额变化
    3. 新技术趋势（固态电池、智能驾驶）
    4. 政策影响
    """,
    expected_output="一份包含关键数据和分析结论的市场研究摘要",
    agent=researcher
)

writing_task = Task(
    description="""
    基于市场研究数据，撰写一份专业的行业分析报告。
    要求：
    1. 结构清晰（摘要→市场现状→趋势分析→投资建议）
    2. 数据支撑每个结论
    3. 语言专业但易懂
    4. 3000-5000字
    """,
    expected_output="一份完整的行业分析报告（Markdown格式）",
    agent=writer
)
```

**组建 Crew**

```python
from crewai import Crew, Process

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,  # 顺序执行
    verbose=True
)

# 执行
result = crew.kickoff()
print(result)
```

---

## 14.3 流程编排与工具集成

**顺序流程（Sequential）**

```
Task1 → Task2 → Task3 → ...
```

适合：有明确前后依赖的任务

**层级流程（Hierarchical）**

```
Manager Agent
    ↓ 分配任务
    ├── Agent1 → Task1
    ├── Agent2 → Task2
    └── Agent3 → Task3
    ↓ 汇总结果
    最终输出
```

适合：需要协调多个并行子任务

```python
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.hierarchical,  # 层级流程
    manager_llm="gpt-4o",
    verbose=True
)
```

**工具集成**

```python
from crewai_tools import SerperDevTool, ScrapeWebsiteTool, FileReadTool

# 搜索工具
search_tool = SerperDevTool()

# 网页抓取工具
scrape_tool = ScrapeWebsiteTool()

# 文件读取工具
file_read_tool = FileReadTool()

# 分配工具给Agent
researcher = Agent(
    role="研究员",
    goal="收集信息",
    backstory="...",
    tools=[search_tool, scrape_tool]
)
```

---

## 14.4 实战：内容创作团队

**场景**

组建一个"AI内容创作团队"：研究员收集素材，写手撰写初稿，编辑审核润色。

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool

search_tool = SerperDevTool()

# 1. 定义角色
researcher = Agent(
    role="内容研究员",
    goal="为主题收集最全面、最新的素材",
    backstory="你是一个信息猎手，擅长从互联网上找到最有价值的信息。",
    tools=[search_tool],
    verbose=True
)

writer = Agent(
    role="内容撰写人",
    goal="把研究素材变成引人入胜的文章",
    backstory="你是一个资深内容创作者，擅长把复杂信息变成好读的故事。",
    verbose=True
)

editor = Agent(
    role="内容编辑",
    goal="确保文章质量、准确性和可读性",
    backstory="你是一个严格的编辑，对文字质量有极高的要求。",
    verbose=True
)

# 2. 定义任务
research_task = Task(
    description="研究'2024年AI Agent行业趋势'，收集关键数据和观点。",
    expected_output="包含关键数据和观点的研究摘要",
    agent=researcher
)

write_task = Task(
    description="根据研究素材，撰写一篇关于AI Agent趋势的深度文章，2000-3000字。",
    expected_output="完整的文章初稿（Markdown格式）",
    agent=writer
)

edit_task = Task(
    description="审核文章，检查准确性、逻辑性、可读性，并润色。",
    expected_output="最终定稿（Markdown格式）",
    agent=editor
)

# 3. 组建团队
content_crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, write_task, edit_task],
    process=Process.sequential,
    verbose=True
)

# 4. 执行
result = content_crew.kickoff()
```

---

## 14.5 实战：市场调研团队

**场景**

组建一个"AI市场调研团队"：做竞品分析、用户调研、市场报告。

```python
competitor_analyst = Agent(
    role="竞品分析师",
    goal="深度分析竞品的功能、定价和市场策略",
    backstory="你是一个经验丰富的竞品分析师，擅长发现竞品的优势和弱点。",
    tools=[search_tool, scrape_tool],
    verbose=True
)

user_researcher = Agent(
    role="用户研究员",
    goal="了解目标用户的需求、痛点和决策因素",
    backstory="你擅长从用户视角分析问题，理解用户真实需求。",
    verbose=True
)

strategy_advisor = Agent(
    role="战略顾问",
    goal="基于分析结果，给出市场进入策略建议",
    backstory="你是一个资深战略顾问，擅长从全局视角给出可执行的建议。",
    verbose=True
)

# 任务链
competitor_task = Task(
    description="分析Notion、Obsidian、Roam Research三个竞品的核心功能、定价策略和用户评价。",
    expected_output="竞品对比分析表（含功能对比、定价对比、SWOT分析）",
    agent=competitor_analyst
)

user_task = Task(
    description="基于竞品分析结果，总结目标用户的核心需求和未满足的痛点。",
    expected_output="用户需求分析报告（含用户画像、核心需求、痛点清单）",
    agent=user_researcher
)

strategy_task = Task(
    description="基于竞品分析和用户调研，制定市场进入策略。",
    expected_output="市场进入策略报告（含定位、差异化、定价、渠道策略）",
    agent=strategy_advisor
)

market_crew = Crew(
    agents=[competitor_analyst, user_researcher, strategy_advisor],
    tasks=[competitor_task, user_task, strategy_task],
    process=Process.sequential,
    verbose=True
)
```

---

## 14.6 实战：代码审查团队

**场景**

组建一个"AI代码审查团队"：安全审查、性能审查、风格审查。

```python
security_reviewer = Agent(
    role="安全审查专家",
    goal="发现代码中的安全漏洞和风险",
    backstory="你是一个资深安全工程师，擅长发现代码中的安全隐患。",
    verbose=True
)

performance_reviewer = Agent(
    role="性能优化专家",
    goal="发现代码中的性能瓶颈和优化机会",
    backstory="你是一个性能调优专家，擅长识别慢查询、内存泄漏等问题。",
    verbose=True
)

style_reviewer = Agent(
    role="代码风格专家",
    goal="确保代码符合最佳实践和编码规范",
    backstory="你是一个代码质量专家，对代码风格和设计模式有深入研究。",
    verbose=True
)

# 使用层级流程
code_review_crew = Crew(
    agents=[security_reviewer, performance_reviewer, style_reviewer],
    tasks=[
        Task(description="审查代码安全性", agent=security_reviewer, expected_output="安全审查报告"),
        Task(description="审查代码性能", agent=performance_reviewer, expected_output="性能审查报告"),
        Task(description="审查代码风格", agent=style_reviewer, expected_output="风格审查报告")
    ],
    process=Process.hierarchical,
    manager_llm="gpt-4o"
)
```

---

## 14.7 多团队协作与高级模式

**跨团队协作**

```python
# 团队1：内容创作
content_crew = Crew(agents=[...], tasks=[...])

# 团队2：市场推广
marketing_crew = Crew(agents=[...], tasks=[...])

# 串行执行两个团队
content_result = content_crew.kickoff()
marketing_result = marketing_crew.kickoff(
    inputs={"content": content_result}
)
```

**动态任务生成**

```python
from crewai import Task

# 基于前一个任务的结果动态创建新任务
def create_followup_task(previous_result):
    return Task(
        description=f"基于以下内容创建社交媒体推广计划：{previous_result}",
        expected_output="社交媒体推广计划",
        agent=social_media_agent
    )
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| Agent+Task+Crew | 角色任务驱动，像管理团队一样管理AI |
| 顺序流程 | Task按序执行，适合有依赖的任务 |
| 层级流程 | Manager分配协调，适合并行子任务 |
| 内容创作团队 | 研究员→写手→编辑 |
| 市场调研团队 | 竞品分析→用户调研→战略建议 |
| 代码审查团队 | 安全+性能+风格并行审查 |
| 高级模式 | 跨团队协作、动态任务生成 |

---

觉得有用？收藏起来，下次直接照抄。

你用 CrewAI 组建过什么AI团队？评论区分享你的经验。

关注怕浪猫，下期我们讲 MetaGPT——SOP驱动的多智能体软件公司，从需求到代码的全自动化。

系列进度 14/24

**下章预告：** 第15章我们将深入 MetaGPT，从SOP驱动的软件开发到多角色协作，用"AI软件公司"模式实现从需求到代码的全自动化。
