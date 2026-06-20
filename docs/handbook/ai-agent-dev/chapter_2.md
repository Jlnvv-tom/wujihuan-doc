# 第2章 技术选型全景：三大路径与工具生态

90%的人选错 Agent 开发工具，不是因为工具本身不好，而是因为一开始就没搞清楚自己的需求。

我是怕浪猫，上一章我们聊了 Agent 的本质和认知框架。这一章我要带你做一个全局扫描，把 Agent 开发的所有路径和工具都过一遍，然后用一套决策树帮你快速锁定最适合自己的方案。

---

## 2.1 Agent 构建三大路径：SaaS / 低代码 / 纯代码

构建 Agent 有三条路，每条路的门槛、能力上限、适用人群完全不同。

**路径一：SaaS 平台（零代码）**

直接用厂商提供的 Agent 构建平台，通过可视化界面配置，不需要写一行代码。

- 典型产品：Manus、Coze（扣子）、腾讯元器、阿里百炼
- 门槛：零门槛，不需要编程基础
- 优势：快速上线，零运维
- 劣势：定制化能力受限，数据在第三方

**路径二：低代码/工作流（低代码）**

通过可视化的流程编排工具，把大模型和各类工具串联起来。

- 典型产品：Dify、n8n
- 门槛：低门槛，需要基本的流程概念
- 优势：灵活度高，可接入自有数据
- 劣势：复杂逻辑需要写代码

**路径三：纯代码框架（高代码）**

用编程语言直接调用大模型 API，自主实现 Agent 逻辑。

- 典型产品：LangChain、LlamaIndex、LangGraph、AutoGen、CrewAI、MetaGPT
- 门槛：高门槛，需要编程能力
- 优势：完全可控，定制化无上限
- 劣势：开发周期长，需要自己维护

> 选路径的原则很简单：能用 SaaS 解决的不用低代码，能用低代码解决的不用纯代码。复杂度是最后才加的，不是一开始就上的。

---

## 2.2 SaaS 平台：Manus、Coze、腾讯元器、阿里百炼

**Manus：通用 Agent 的天花板**

Manus 的定位是"通用型 Agent"，能帮你做几乎任何事情——从写报告到做PPT，从规划行程到分析股票。

核心特点：
- 真正的多步骤自主执行
- 内置代码执行沙箱
- 支持文件处理和多模态
- 云端执行，无需本地算力

适合场景：快速原型、个人效率工具、复杂任务自动化。

> Manus 是目前最接近"通用人工智能助理"的产品，但通用性强意味着在垂直场景的专业深度不足。

**Coze 扣子：国内最完善的 Agent 平台**

Coze（扣子）是字节跳动推出的 Agent 构建平台，在国内的生态最为完善。

核心特点：
- 丰富的插件市场（搜索、图片、代码等）
- 工作流编排支持复杂逻辑
- 多平台一键发布（微信、飞书、Discord等）
- 国内用户友好，无需科学上网

适合场景：内容创作自动化、多平台分发、企业客服。

**腾讯元器：微信生态 Agent 最佳选择**

腾讯元器是微信生态的 Agent 构建工具，和微信公众平台的深度集成是最大优势。

核心特点：
- 天然接入微信生态（公众号、小程序）
- 支持微信支付 MCP
- 企业微信场景支持
- 跨模态能力（文本+图片+音频）

适合场景：微信公众号/小程序 AI 助手、微信生态营销、客服场景。

**阿里百炼：阿里云生态 Agent 最佳选择**

阿里百炼是阿里云的 Agent 构建平台，和钉钉、阿里云服务深度集成。

核心特点：
- 钉钉原生集成
- 数字人视频生成
- AppFlow 自动化编排
- 阿里云 API 服务一键接入

适合场景：钉钉办公自动化、阿里云服务集成、电商客服。

**四大 SaaS 平台对比**

| 平台 | 核心优势 | 最大劣势 | 适合用户 |
|------|---------|---------|---------|
| Manus | 通用性最强 | 专业深度不足 | 个人用户、快速原型 |
| Coze | 插件生态最完善 | 国内合规限制 | 内容创作者、开发者 |
| 腾讯元器 | 微信生态集成 | 只能在微信生态内用 | 微信生态运营者 |
| 阿里百炼 | 阿里云钉钉集成 | 阿里云强绑定 | 阿里云用户、企业 |

---

## 2.3 低代码/工作流：Dify、n8n

**Dify：RAG + 工作流的企业首选**

Dify 是一个开源的 LLM 应用开发平台，核心特点是"RAG 做得深，工作流做得活"。

Dify 的核心能力：

1. **知识库管理**：上传文档 → 自动切片 → 向量化 → 检索，一条龙
2. **应用编排**：对话型、Agent型、Workflow型三种模式
3. **数据标注**：支持数据集管理和模型微调
4. **API 暴露**：一键把应用暴露为 REST API

```bash
# Dify 本地部署（Docker）
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
docker-compose up -d
```

部署完成后访问 `http://localhost:8080` 即可使用。

官方文档：https://docs.dify.ai/

> Dify 的定位是"AI 应用的操作系统"——它不只是一个工具，而是一个平台。你可以在上面构建 RAG 问答、工作流自动化、Agent 对话等各种应用。

**n8n：自动化工作流的瑞士军刀**

n8n 是一个开源的工作流自动化工具，核心理念是"连接一切"。

n8n 的核心特点：

1. **海量集成**：200+ 预置集成，包括数据库、API、文件存储
2. **可视化编排**：拖拽式节点设计，所见即所得
3. **代码执行**：内置 JavaScript 和 Python 代码节点
4. **自托管**：完全可控，数据不出内网

```bash
# n8n 本地部署（Docker）
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  n8nio/n8n
```

部署完成后访问 `http://localhost:5678`。

官方文档：https://docs.n8n.io/

**Dify vs n8n 对比**

| 维度 | Dify | n8n |
|------|------|-----|
| 核心定位 | LLM 应用平台 | 通用自动化工作流 |
| AI 能力 | 原生集成 RAG、Agent | 通过节点调用 API |
| 集成数量 | 专注 AI 相关 | 200+ 通用集成 |
| 适用场景 | 知识库问答、AI 应用 | 跨系统自动化 |
| 部署难度 | 中等 | 简单 |

> Dify 适合 AI 原生的应用，n8n 适合把 AI 嵌入现有业务流程。选择哪个取决于你的需求是"AI 应用"还是"AI 赋能"。

---

## 2.4 纯代码框架：LangChain、LlamaIndex、LangGraph、AutoGen、CrewAI、MetaGPT

**LangChain：LLM 应用开发的事实标准**

LangChain 是目前最流行的 LLM 应用开发框架，生态极其庞大。

LangChain 核心模块：

```python
from langchain_openai import ChatOpenAI
from langchain_community.tools import WikipediaQueryRun
from langchain_community.utilities import WikipediaAPIWrapper
from langchain.agents import create_react_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

# 1. 初始化模型
llm = ChatOpenAI(model="gpt-4o")

# 2. 定义工具
tools = [WikipediaQueryRun(api_wrapper=WikipediaAPIWrapper())]

# 3. 创建 Agent
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有用的助手。使用工具来回答问题。"),
    ("human", "{input}"),
    ("assistant", "{agent_scratchpad}"),
])
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 4. 执行
result = agent_executor.invoke({"input": "杭州的人口有多少？"})
```

LangChain 提供了完整的 Agent 开发能力：工具调用、记忆管理、链式调用、向量检索。但正因为太全，学习曲线较陡。

官方文档：https://python.langchain.com/

**LlamaIndex：RAG 场景的专业框架**

LlamaIndex 专注于"数据检索增强生成"这个垂直场景，是 RAG 开发的首选框架。

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.llms.openai import OpenAI

# 1. 加载文档
documents = SimpleDirectoryReader("./data").load_data()

# 2. 构建索引
index = VectorStoreIndex.from_documents(documents)

# 3. 创建查询引擎
query_engine = index.as_query_engine(llm=OpenAI(model="gpt-4o"))

# 4. 查询
response = query_engine.query("这份文档讲了什么？")
```

如果你做的是知识库问答、RAG 类应用，LlamaIndex 比 LangChain 更专业、更轻量。

官方文档：https://docs.llamaindex.ai/

**LangGraph：复杂 Agent 的状态机编排**

LangGraph 是 LangChain 团队推出的图式 Agent 编排框架，核心思想是把 Agent 的执行流程建模为一个状态机。

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class AgentState(TypedDict):
    messages: list
    next_action: str

def should_continue(state):
    return "end" if state["next_action"] == "finish" else "continue"

graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("action", action_node)
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_continue, {
    "continue": "action",
    "end": END
})
graph.add_edge("action", "agent")

app = graph.compile()
```

适合场景：多步骤复杂 Agent、有条件分支的流程、需要持久化的状态管理。

官方文档：https://langchain-ai.github.io/langgraph/

**AutoGen：微软的多智能体协作框架**

AutoGen 是微软推出的多智能体协作框架，核心特点是"多 Agent 对话"。

```python
from autogen import ConversableAgent, GroupChat, GroupChatManager

# 创建两个 Agent
assistant = ConversableAgent(
    name="assistant",
    system_message="你是一个有用的助手。",
    llm_config={"model": "gpt-4o"}
)
critic = ConversableAgent(
    name="critic",
    system_message="你是一个专业的评审，给出批评性反馈。",
    llm_config={"model": "gpt-4o"}
)

# 创建群聊
group_chat = GroupChat(agents=[assistant, critic], messages=[])
manager = GroupChatManager(groupchat=group_chat)

# 启动群聊
assistant.initiate_chat(manager, message="帮我分析一下这个产品策略...")
```

适合场景：需要多个 AI 角色协作的场景，如代码生成+评审、数据分析+报告。

官方文档：https://microsoft.github.io/autogen/

**CrewAI：角色驱动的多智能体团队**

CrewAI 的核心理念是"让 AI 像团队一样协作"，每个 Agent 有明确的角色和任务。

```python
from crewai import Agent, Crew, Task, Process

# 定义角色
researcher = Agent(
    role="研究员",
    goal="提供最新最准确的市场信息",
    backstory="你是一个专业的市场研究员。"
)
writer = Agent(
    role="内容撰写",
    goal="撰写高质量的市场分析报告",
    backstory="你是一个资深商业内容撰写人。"
)

# 定义任务
task1 = Task(description="调研新能源汽车市场", agent=researcher)
task2 = Task(description="撰写分析报告", agent=writer)

# 组建团队
crew = Crew(agents=[researcher, writer], tasks=[task1, task2], process=Process.sequential)
result = crew.kickoff()
```

适合场景：营销文案生成、新闻写作、多角色协作的内容生产。

官方文档：https://docs.crewai.com/

**MetaGPT：SOP 驱动的 AI 软件公司**

MetaGPT 的核心理念是"把软件开发公司变成 AI Agent 团队"，每个 Agent 有明确的角色（SOP）和协作流程。

```python
from metagpt.software_company import SoftwareCompany
from metagpt.roles.project_manager import ProjectManager
from metagpt.roles.engineer import Engineer

# 启动一个 AI 软件公司
company = SoftwareCompany()
company.hire([
    ProjectManager(),
    Engineer(),
])

# 给一个任务
result = company.run("帮我开发一个 Todo 应用")
```

适合场景：需要 SOP 驱动的复杂协作，如软件开发、文档生成、项目管理。

官方文档：https://docs.deepwisdom.ai/

**六大框架对比**

| 框架 | 核心优势 | 最大劣势 | 适合场景 |
|------|---------|---------|---------|
| LangChain | 生态最全 | 学习曲线陡 | 通用 LLM 应用 |
| LlamaIndex | RAG 专业 | 场景单一 | 知识库问答 |
| LangGraph | 复杂流程编排 | 配置复杂 | 高阶 Agent |
| AutoGen | 多 Agent 对话 | 微软强依赖 | 数据分析 |
| CrewAI | 角色驱动协作 | 功能较新 | 内容生产 |
| MetaGPT | SOP 驱动 | 资源消耗大 | 软件开发 |

---

## 2.5 标准化协议：MCP（Model Context Protocol）

MCP 是 Anthropic 推出的 AI 模型上下文协议，核心理念是"让 AI 和外部工具的连接标准化"。

**为什么需要 MCP？**

在没有 MCP 之前，每个 AI 应用想接入外部工具，都需要自己写适配代码：

```
AI 应用 A → 自己写适配代码 → 天气 API
AI 应用 B → 自己写适配代码 → 天气 API
AI 应用 C → 自己写适配代码 → 天气 API
```

有了 MCP 之后，所有应用共享同一套协议：

```
AI 应用 A ─┐
AI 应用 B ─┼─→ MCP Server（天气）──→ 天气 API
AI 应用 C ─┘
```

MCP 的三大核心能力：

1. **Tools（工具）**：让 AI 调用外部功能（搜索、数据库、API）
2. **Resources（资源）**：让 AI 读取外部数据（文件、数据库内容）
3. **Prompts（提示模板）**：复用和共享提示词模板

```python
# MCP Server 示例（FastMCP）
from fastmcp import FastMCP

mcp = FastMCP("我的工具服务")

@mcp.tool()
def search_products(query: str, category: str = None) -> list:
    """搜索商品"""
    # 实际实现调用商品数据库
    return [{"name": "商品A", "price": 100}]

@mcp.resource("product://{product_id}")
def get_product(product_id: str) -> dict:
    """获取商品详情"""
    return {"id": product_id, "name": "商品A", "price": 100}

mcp.run(transport="stdio")
```

官方文档：https://modelcontextprotocol.io/

> MCP 的价值在于标准化和复用。一旦 MCP Server 写好，任何支持 MCP 的 AI 应用都可以直接使用，不需要重复开发。

---

## 2.6 技术栈选型决策树：场景 × 能力 × 成本

怕浪猫总结了一个决策树，直接套用即可。

**第一步：你的编程能力如何？**

- 零编程能力 → 进入第二步 A（SaaS/低代码）
- 有编程能力 → 进入第二步 B（纯代码）

**第二步 A：SaaS vs 低代码**

- 只需要做对话式 Agent → Coze 或腾讯元器
- 需要知识库 RAG → Dify
- 需要跨系统自动化 → n8n
- 需要通用任务执行 → Manus

**第二步 B：选框架**

- RAG 场景（知识库问答）→ LlamaIndex
- 通用 LLM 应用 → LangChain
- 复杂状态机/多步骤 → LangGraph
- 多 Agent 协作对话 → AutoGen
- 角色驱动协作（内容生产）→ CrewAI
- SOP 驱动协作（软件开发）→ MetaGPT

**第三步：考虑成本**

| 方案 | 开发成本 | API 成本 | 运维成本 |
|------|---------|---------|---------|
| SaaS | 低 | 按量付费 | 零 |
| 低代码 | 中 | 按量付费 | 低 |
| 纯代码 | 高 | 按量付费 | 高 |

> 成本不只是钱，还有时间成本和维护成本。一个花3天用 Dify 搭出来的系统，和一个花3周用 LangChain 写的系统，功能可能差不多。但3周的时间够你迭代好几个 Dify 方案了。

**决策树速查表**

| 场景 | 推荐工具 | 理由 |
|------|---------|------|
| 个人效率工具 | Manus、Coze | 快速上线 |
| 微信生态 AI | 腾讯元器 | 天然集成 |
| 钉钉办公自动化 | 阿里百炼 | 深度集成 |
| 企业知识库 | Dify | RAG 开箱即用 |
| 跨系统自动化 | n8n | 集成最全 |
| 通用 AI 应用 | LangChain | 生态最全 |
| RAG 知识库 | LlamaIndex | 专注检索 |
| 复杂 Agent | LangGraph | 状态机编排 |
| 多 Agent 协作 | AutoGen/CrewAI | 对话协作 |
| 软件开发流程 | MetaGPT | SOP 驱动 |

---

## 2.7 工作流设计通用方法论

选好工具之后，真正考验功力的是工作流设计。怕浪猫总结了一套通用方法论，适用于任何 Agent 框架。

**方法论一：先人工，后自动**

设计 Agent 工作流之前，先把人工流程跑通。

```markdown
## 流程逆向工程

步骤1：列出人工处理这个任务的所有步骤
步骤2：标注每个步骤的输入、输出、决策点
步骤3：识别哪些步骤可以自动化
步骤4：画出现有流程图
步骤5：设计 Agent 流程图
```

不要在纸上设计流程，先自己用人工方式做一遍，记录每个环节是怎么处理的。

**方法论二：拆分到原子级别**

一个复杂任务，要拆到"不可再拆"的原子任务。

```
❌ 错误示范：帮我处理客户投诉
   ↓
   太模糊，Agent 不知道从哪下手

✅ 正确示范：
   1. 读取投诉内容（工具：read_file）
   2. 分类投诉类型（LLM：技术/退款/投诉）
   3. 如果技术类 → 查知识库（工具：search_kb）
   4. 如果退款类 → 查订单 + 执行退款（工具：query_order, refund）
   5. 如果投诉类 → 创建工单 + 通知人工（工具：create_ticket, notify）
   6. 生成回复邮件（LLM）
   7. 发送邮件（工具：send_email）
```

**方法论三：设计失败兜底**

每个 Agent 流程都要考虑失败情况。

```python
class RobustAgent:
    def execute(self, goal):
        try:
            result = self.agent_loop(goal)
            return result
        except ToolError as e:
            # 方案1：降级处理
            return self.fallback(goal, str(e))
        except MaxRetriesExceeded:
            # 方案2：人工介入
            return self.human_in_the_loop(goal)
        except ContextOverflow:
            # 方案3：压缩上下文重试
            return self.retry_with_compressed_context(goal)
```

三种失败兜底策略：

1. **降级处理**：工具调用失败，用 LLM 直接生成答案（质量下降但不停机）
2. **人工介入**：Agent 无法处理，暂停流程通知人类
3. **压缩重试**：上下文溢出，压缩后重试

**方法论四：设置检查点**

在长流程中设置检查点，让人类可以监督 Agent 的执行。

```python
def execute_with_checkpoints(self, goal, checkpoints):
    results = {}
    for i, step in enumerate(self.steps):
        result = self.execute_step(step)
        results[f"step_{i}"] = result
        
        if i in checkpoints:
            # 暂停等待人工确认
            human_approval = self.request_approval(
                f"步骤 {i} 完成，是否继续？",
                result
            )
            if not human_approval:
                return {"status": "paused", "checkpoint": i}
    
    return {"status": "completed", "results": results}
```

**方法论五：可观测性设计**

Agent 执行过程中要留下足够的日志，方便出问题后排查。

```python
class ObservableAgent:
    def __init__(self):
        self.logger = StructuredLogger()
    
    def execute(self, goal):
        self.logger.info("Agent 开始执行", goal=goal)
        
        for i, action in enumerate(self.plan(goal)):
            self.logger.info(f"执行步骤 {i}", action=action)
            result = self.execute_action(action)
            self.logger.info(f"步骤 {i} 完成", result=result)
            
            if result.is_error():
                self.logger.error(f"步骤 {i} 失败", error=result.error())
        
        self.logger.info("Agent 执行完成")
```

> 工作流设计的核心就三点：拆分够细、失败有兜底、全程可观测。做到了这三点，不管用什么框架，你的 Agent 都差不了。

---

**本章小结**

| 路径 | 工具 | 适用场景 |
|------|------|---------|
| SaaS | Manus、Coze、腾讯元器、阿里百炼 | 零代码、快速原型 |
| 低代码 | Dify、n8n | 企业知识库、跨系统自动化 |
| 纯代码 | LangChain、LlamaIndex、LangGraph、AutoGen、CrewAI、MetaGPT | 深度定制、复杂逻辑 |
| 协议 | MCP | 标准化工具接入 |

---

觉得有用？收藏起来，下次直接照抄。

你现在的 Agent 开发用的是什么工具？评论区说说你的选型理由。

关注怕浪猫，下期我们讲 Manus 实战——从注册配置到10个实战案例，帮你真正用起来。

系列进度 2/24

**下章预告：** 第3章我们将通过5个实战案例完整走一遍 Manus 的使用流程，包括露营规划、购物决策、调研可视化等实用场景，并深入解析 Manus 的核心驱动逻辑。
