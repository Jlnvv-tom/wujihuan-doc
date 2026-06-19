# 第9章 工程化落地：评估、优化与部署

让Agent跑通一个Demo只需要几小时，但让它稳定地跑在生产环境中，需要的工程化工作量可能是Demo的10倍。本章将系统讲解Agent的评估指标、自动化评测、性能优化和部署方案。

## 9.1 评估指标体系：准确性、鲁棒性与响应效率

### 为什么评估Agent比评估LLM更难？

评估单个LLM只需要看"回答是否正确"，但评估Agent需要关注整个执行流程：它选对了工具吗？推理步骤合理吗？最终结果正确吗？中间有没有走弯路？

### Agent评估指标体系

| 维度 | 指标 | 计算方式 | 目标值 |
|------|------|---------|--------|
| 准确性 | 任务完成率 | 成功完成任务数/总任务数 | >90% |
| 准确性 | 事实准确率 | 事实正确陈述数/总事实陈述数 | >95% |
| 鲁棒性 | 工具调用成功率 | 成功调用次数/总调用次数 | >95% |
| 鲁棒性 | 异常恢复率 | 成功恢复次数/异常发生次数 | >80% |
| 效率 | 平均Token消耗 | 总Token数/总请求数 | 按预算控制 |
| 效率 | 平均响应时间 | 总响应时间/总请求数 | <10s |
| 效率 | 平均推理步数 | 总推理步数/总请求数 | <5步 |
| 用户体验 | 首Token时间(TTFT) | 从请求到第一个Token的时间 | <2s |

### 构建评估数据集

```python
class AgentEvalDataset:
    """Agent评估数据集"""

    def __init__(self):
        self.cases: list[dict] = []

    def add_case(self, task: str, expected_output: str, 
                 expected_tools: list[str] = None,
                 difficulty: str = "medium"):
        self.cases.append({
            "task": task,
            "expected_output": expected_output,
            "expected_tools": expected_tools or [],
            "difficulty": difficulty,
        })

# 构建评估集
eval_dataset = AgentEvalDataset()
eval_dataset.add_case(
    task="查询北京今天的天气",
    expected_output="包含温度、天气状况的回答",
    expected_tools=["get_weather"],
    difficulty="easy"
)
eval_dataset.add_case(
    task="分析过去一周的销售数据，找出趋势和异常",
    expected_output="包含趋势分析和异常检测的结构化报告",
    expected_tools=["query_database", "code_interpreter"],
    difficulty="hard"
)
```

## 9.2 自动化评测框架：Ragas与TruLens实战

### Ragas：RAG系统评测

Ragas（Retrieval Augmented Generation Assessment）是评测RAG系统的标准框架，提供四个核心指标：

| 指标 | 含义 | 评估方式 |
|------|------|---------|
| Faithfulness | 生成内容是否忠于检索文档 | LLM辅助评估 |
| Answer Relevance | 回答与问题的相关程度 | LLM辅助评估 |
| Context Precision | 检索文档的精确度 | LLM辅助评估 |
| Context Recall | 检索文档的召回率 | 基于标注评估 |

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

# 准备评测数据
eval_data = {
    "question": ["什么是RAG?", "Agent如何使用工具?"],
    "answer": ["RAG是检索增强生成技术...", "Agent通过Function Calling调用工具..."],
    "contexts": [["RAG（Retrieval-Augmented Generation）是一种..."], ["Function Calling让LLM..."]],
    "ground_truth": ["RAG是一种结合检索和生成的技术", "Agent使用Function Calling机制调用工具"]
}

dataset = Dataset.from_dict(eval_data)

# 运行评测
results = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
    llm=ChatOpenAI(model="gpt-4o"),
    embeddings=OpenAIEmbeddings(),
)

print(results)
# {'faithfulness': 0.85, 'answer_relevancy': 0.92, 'context_precision': 0.78, 'context_recall': 0.88}
```

> 参考文档：[Ragas官方文档](https://docs.ragas.io/)

### TruLens：全链路可观测

TruLens提供了更全面的AI应用可观测性，包括RAG评测和Agent追踪：

```python
from trulens_eval import TruChain, Feedback
from trulens_eval.app import App
from trulens_eval.feedback import OpenAI as TruOpenAI

# 定义反馈函数
tru_openai = TruOpenAI()
groundedness = Feedback(tru_openai.groundedness_measure_with_cot_reasons)
answer_relevance = Feedback(tru_openai.qs_relevance)
context_relevance = Feedback(tru_openai.qs_relevance)

# 包装你的Chain
tru_recorder = TruChain(
    agent_executor,
    feedbacks=[groundedness, answer_relevance, context_relevance],
    app_id="my-agent-v1"
)

# 使用
with tru_recorder as recording:
    result = agent_executor.invoke({"input": "解释RAG技术"})

# 查看评测结果
from trulens_eval import Tru
tru = Tru()
tru.run_dashboard()  # 启动可视化仪表盘
```

> 参考文档：[TruLens官方文档](https://www.trulens.org/)

### 自定义评测流程

```python
class AgentEvaluator:
    """自定义Agent评测框架"""

    def __init__(self, agent_executor, eval_dataset):
        self.agent = agent_executor
        self.dataset = eval_dataset

    def run_evaluation(self) -> dict:
        results = {
            "total": len(self.dataset.cases),
            "success": 0,
            "tool_accuracy": 0,
            "total_tokens": 0,
            "total_time": 0,
            "details": [],
        }

        for case in self.dataset.cases:
            start_time = time.time()
            try:
                result = self.agent.invoke({"input": case["task"]})
                success = self._check_result(result["output"], case["expected_output"])
                tool_match = self._check_tools(result, case["expected_tools"])
            except Exception as e:
                success = False
                tool_match = False
                result = {"output": f"ERROR: {e}"}

            elapsed = time.time() - start_time
            results["success"] += int(success)
            results["tool_accuracy"] += int(tool_match)
            results["total_time"] += elapsed
            results["details"].append({
                "task": case["task"],
                "success": success,
                "tool_match": tool_match,
                "time": elapsed,
            })

        results["success_rate"] = results["success"] / results["total"]
        results["avg_time"] = results["total_time"] / results["total"]
        return results

    def _check_result(self, output: str, expected: str) -> bool:
        """用LLM判断输出是否符合期望"""
        judge_prompt = f"""
期望输出：{expected}
实际输出：{output}
实际输出是否满足期望？（只回答是/否）
"""
        response = ChatOpenAI(model="gpt-4o", temperature=0).invoke(judge_prompt)
        return "是" in response.content

    def _check_tools(self, result: dict, expected_tools: list) -> bool:
        """检查是否调用了期望的工具"""
        # 需要从执行日志中提取实际调用的工具列表
        actual_tools = result.get("intermediate_steps", [])
        actual_tool_names = [step[0].tool for step in actual_tools]
        return set(expected_tools).issubset(set(actual_tool_names))
```

## 9.3 性能优化：Token成本控制与语义缓存策略

### Token成本分析

Token是LLM应用最大的运营成本。一个Agent每次请求可能消耗数千Token（系统提示词 + 工具定义 + 历史消息 + 推理过程），每千次调用可能花费数美元。

### 成本优化策略

**策略一：精简系统提示词**

```python
# 冗长版（~800 tokens）
VERBOSE_PROMPT = """
你是一个专业的AI助手。你的名字叫小明。你的任务是根据用户的问题，
选择合适的工具来获取信息或执行操作。在回答问题时，请遵循以下规则：
1. 首先分析用户意图
2. 判断是否需要调用工具
3. 如果需要工具，选择最合适的工具
4. 执行工具调用后，基于结果回答用户
5. 如果不需要工具，直接回答
"""

# 精简版（~200 tokens）
CONCISE_PROMPT = """
分析用户意图，需要时调用工具，否则直接回答。
"""
```

**策略二：模型路由**

不是所有问题都需要GPT-4o。简单问题用GPT-4o-mini，复杂问题才用GPT-4o：

```python
class ModelRouter:
    """根据问题复杂度路由到不同模型"""

    def __init__(self):
        self.fast_model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        self.smart_model = ChatOpenAI(model="gpt-4o", temperature=0)

    def route(self, query: str):
        # 简单规则路由（也可以用LLM判断）
        simple_patterns = ["天气", "时间", "翻译", "定义", "是什么"]
        if any(p in query for p in simple_patterns):
            return self.fast_model
        return self.smart_model
```

**策略三：语义缓存**

对语义相似的查询返回缓存结果，避免重复调用LLM：

```python
from langchain.cache import SemanticCache
from langchain_community.vectorstores import Chroma

# 设置语义缓存
langchain.llm_cache = SemanticCache(
    embedding=OpenAIEmbeddings(),
    vectorstore=Chroma(embedding_function=OpenAIEmbeddings()),
    similarity_threshold=0.95  # 相似度>0.95才命中缓存
)

# 之后所有LLM调用都会自动检查缓存
# "今天北京天气" 和 "北京今天天气怎么样" 会被认为是相似查询
```

**策略四：工具描述按需加载**

```python
def get_relevant_tools(query: str, all_tools: list, max_tools: int = 5) -> list:
    """根据查询选择最相关的工具，减少Token消耗"""
    # 每个工具描述约100-200 tokens，10个工具就是1000-2000 tokens
    # 只传入相关工具可以显著减少Token
    tool_selector = DynamicToolSelector(all_tools, max_tools)
    return tool_selector.select(query)
```

### 成本优化效果对比

| 优化策略 | Token节省 | 实现复杂度 | 适用场景 |
|----------|----------|-----------|---------|
| 精简提示词 | 30-50% | 低 | 所有场景 |
| 模型路由 | 40-60% | 中 | 简单问题占比高的场景 |
| 语义缓存 | 20-80% | 中 | 重复查询多的场景 |
| 按需加载工具 | 20-40% | 中 | 工具数量>10的场景 |

## 9.4 部署方案：Docker容器化与Serverless架构

### Docker容器化部署

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```python
# main.py - FastAPI服务
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"

@app.post("/chat")
async def chat(request: ChatRequest):
    result = agent_executor.invoke({"input": request.message})
    return {"response": result["output"]}

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        async for chunk in agent_executor.astream({"input": request.message}):
            yield f"data: {json.dumps({'content': str(chunk)})}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  agent-api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### Serverless部署

对于间歇性流量的场景，Serverless比常驻服务更经济：

```python
# AWS Lambda部署
import json
from mangum import Mangum

# 将FastAPI应用包装为Lambda Handler
handler = Mangum(app)

# serverless.yml
# service: ai-agent
# functions:
#   api:
#     handler: main.handler
#     events:
#       - http:
#           path: /{proxy+}
#           method: ANY
```

### 部署方案对比

| 方案 | 适用场景 | 成本 | 扩展性 | 冷启动 |
|------|---------|------|--------|--------|
| Docker + VPS | 小规模、持续流量 | 低-中 | 手动 | 无 |
| Docker + K8s | 大规模、企业级 | 中-高 | 自动 | 无 |
| Serverless | 间歇流量、低成本 | 低 | 自动 | 有（1-5s） |
| Streamlit Cloud | Demo/内部工具 | 免费起步 | 有限 | 有 |

## 9.5 监控与日志：生产环境下的Agent行为追踪

### 日志规范

```python
import logging
import structlog

# 结构化日志
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()

# 记录Agent执行
def log_agent_execution(task: str, result: dict, metadata: dict = None):
    logger.info(
        "agent_execution",
        task=task,
        success=result.get("success", False),
        tools_used=result.get("tools_used", []),
        tokens=result.get("tokens", 0),
        duration_ms=result.get("duration_ms", 0),
        **(metadata or {})
    )
```

### Prometheus指标

```python
from prometheus_client import Counter, Histogram, Gauge

# 定义指标
AGENT_REQUESTS = Counter('agent_requests_total', 'Total agent requests', ['status'])
AGENT_LATENCY = Histogram('agent_latency_seconds', 'Agent response latency', ['model'])
AGENT_TOKENS = Counter('agent_tokens_total', 'Total tokens consumed', ['type'])
ACTIVE_SESSIONS = Gauge('agent_active_sessions', 'Active sessions')

# 在Agent执行中埋点
def execute_with_metrics(agent_executor, user_input: str):
    ACTIVE_SESSIONS.inc()
    start_time = time.time()

    try:
        result = agent_executor.invoke({"input": user_input})
        AGENT_REQUESTS.labels(status="success").inc()
        return result
    except Exception as e:
        AGENT_REQUESTS.labels(status="error").inc()
        raise
    finally:
        latency = time.time() - start_time
        AGENT_LATENCY.labels(model="gpt-4o").observe(latency)
        ACTIVE_SESSIONS.dec()
```

### 异常告警

```python
class AgentMonitor:
    """Agent行为监控与告警"""

    def __init__(self, alert_thresholds: dict = None):
        self.thresholds = alert_thresholds or {
            "error_rate": 0.1,        # 错误率超过10%告警
            "avg_latency": 15.0,      # 平均延迟超过15秒告警
            "token_spike": 2.0,       # Token消耗超过基线2倍告警
            "tool_failure_rate": 0.2,  # 工具调用失败率超过20%告警
        }
        self.metrics_window: list[dict] = []

    def record(self, execution_result: dict):
        self.metrics_window.append(execution_result)
        self._check_alerts()

    def _check_alerts(self):
        recent = self.metrics_window[-100:]  # 最近100次
        if len(recent) < 10:
            return

        error_rate = sum(1 for r in recent if not r.get("success")) / len(recent)
        if error_rate > self.thresholds["error_rate"]:
            self._send_alert(f"错误率过高：{error_rate:.1%}")

        avg_latency = sum(r.get("duration_ms", 0) for r in recent) / len(recent) / 1000
        if avg_latency > self.thresholds["avg_latency"]:
            self._send_alert(f"平均延迟过高：{avg_latency:.1f}s")

    def _send_alert(self, message: str):
        # 发送告警（邮件、钉钉、Slack等）
        logger.warning("agent_alert", message=message)
```

## 本章小结

| 工程化领域 | 核心方案 | 关键要点 |
|-----------|---------|---------|
| 评估指标 | 准确性+鲁棒性+效率 | 评估Agent比评估LLM更复杂 |
| 自动化评测 | Ragas + TruLens | 自动化评测+可视化仪表盘 |
| 成本优化 | 精简提示词+模型路由+语义缓存 | Token是最大运营成本 |
| 部署方案 | Docker + Serverless | 持续流量用Docker，间歇流量用Serverless |
| 监控告警 | 结构化日志+Prometheus+异常告警 | 生产环境必须有监控 |

> 下一章开始，我们将进入实战项目环节——用三个完整项目检验前面学到的所有知识。
