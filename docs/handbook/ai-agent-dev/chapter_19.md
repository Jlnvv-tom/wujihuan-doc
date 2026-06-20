# 第19章 Agent 应用部署与运维

Agent 在开发环境跑得好好的，一上线就崩。这不是玄学，是你没做好部署和运维。

我是怕浪猫，上一章聊了评估和测试，这章聊部署和运维——怎么让 Agent 在生产环境稳定跑起来，怎么在出问题时快速定位和恢复。

---

## 19.1 生产环境架构设计

**单机架构（入门）**

```
用户请求 → API Gateway → Agent Service → LLM API
```

适合：日调用量 < 10万

**集群架构（推荐）**

```
用户请求
    ↓
Load Balancer（负载均衡）
    ↓
┌──────────┬──────────┬──────────┐
│ Agent    │ Agent    │ Agent    │  × N个实例
│ Instance │ Instance │ Instance │
└────┬─────┴────┬─────┴────┬─────┘
     │          │          │
     ↓          ↓          ↓
┌─────────────────────────────────┐
│  共享存储层                      │
│  ├── Redis（会话状态）           │
│  ├── PostgreSQL（持久化数据）    │
│  └── S3/OSS（文件存储）         │
├─────────────────────────────────┤
│  外部服务层                      │
│  ├── LLM API（OpenAI/Anthropic）│
│  ├── 向量数据库（Milvus/Pinecone）│
│  └── MCP Server（工具服务）      │
└─────────────────────────────────┘
```

适合：日调用量 > 10万

**微服务架构（大规模）**

```
用户请求 → API Gateway
    ↓
┌────────────┐
│ Auth       │ → 认证鉴权
├────────────┤
│ Router     │ → 请求路由
├────────────┤
│ Agent      │ → 核心Agent服务
│ Orchestrator│
├────────────┤
│ Tool       │ → 工具执行服务
│ Executor   │
├────────────┤
│ Memory     │ → 记忆管理服务
│ Service    │
├────────────┤
│ Monitor    │ → 监控告警服务
│ Service    │
└────────────┘
```

适合：日调用量 > 100万

---

## 19.2 容器化部署与弹性伸缩

**Docker 化 Agent 服务**

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:8000/health || exit 1

# 启动
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

**K8s 部署配置**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agent-service
  template:
    metadata:
      labels:
        app: agent-service
    spec:
      containers:
      - name: agent
        image: agent-service:latest
        ports:
        - containerPort: 8000
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: openai
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
---
# HPA 自动伸缩
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 19.3 监控告警体系

**监控指标**

| 类别 | 指标 | 告警阈值 |
|------|------|---------|
| 业务 | 请求成功率 | < 95% |
| 业务 | 平均响应时间 | > 30秒 |
| 业务 | 任务完成率 | < 80% |
| 业务 | 工具调用成功率 | < 90% |
| 系统 | CPU使用率 | > 80% |
| 系统 | 内存使用率 | > 85% |
| 系统 | 错误率 | > 5% |
| 成本 | Token消耗/天 | > 预算120% |
| 成本 | API调用成本/天 | > 预算120% |

**监控实现**

```python
from prometheus_client import Counter, Histogram, Gauge
import time

# 定义指标
REQUEST_COUNT = Counter('agent_requests_total', 'Total requests')
REQUEST_DURATION = Histogram('agent_request_duration_seconds', 'Request duration')
TASK_COMPLETION = Counter('agent_task_completed_total', 'Tasks completed')
TASK_FAILURE = Counter('agent_task_failed_total', 'Tasks failed')
TOKEN_USAGE = Counter('agent_token_usage_total', 'Total tokens used')
ACTIVE_SESSIONS = Gauge('agent_active_sessions', 'Active sessions')

# 在Agent执行中埋点
async def run_agent(request):
    REQUEST_COUNT.inc()
    start_time = time.time()
    
    try:
        result = await agent.execute(request)
        TASK_COMPLETION.inc()
        return result
    except Exception as e:
        TASK_FAILURE.inc()
        raise
    finally:
        duration = time.time() - start_time
        REQUEST_DURATION.observe(duration)
```

**告警规则**

```yaml
# alerting-rules.yml
groups:
- name: agent-alerts
  rules:
  - alert: HighErrorRate
    expr: rate(agent_task_failed_total[5m]) / rate(agent_requests_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Agent错误率过高"
      
  - alert: SlowResponse
    expr: histogram_quantile(0.95, agent_request_duration_seconds) > 30
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Agent响应时间过长"
      
  - alert: HighTokenUsage
    expr: increase(agent_token_usage_total[1h]) > 1000000
    for: 1h
    labels:
      severity: warning
    annotations:
      summary: "Token消耗异常"
```

---

## 19.4 日志管理与故障排查

**结构化日志**

```python
import structlog

logger = structlog.get_logger()

async def run_agent(request):
    log = logger.bind(
        request_id=request.id,
        user_id=request.user_id,
        session_id=request.session_id
    )
    
    log.info("agent_start", input=request.input[:100])
    
    try:
        result = await agent.execute(request)
        log.info("agent_success", 
                 duration=result.duration,
                 tokens=result.token_usage,
                 tools_used=result.tools_used)
        return result
    except Exception as e:
        log.error("agent_error", 
                  error=str(e),
                  error_type=type(e).__name__)
        raise
```

**故障排查流程**

```
发现故障
    ↓
1. 确认影响范围（影响多少用户？哪些功能？）
    ↓
2. 查看最近变更（有没有新部署？配置有没有改？）
    ↓
3. 检查外部依赖（LLM API是否正常？向量数据库是否正常？）
    ↓
4. 查看错误日志（具体的错误信息是什么？）
    ↓
5. 复现问题（用相同的输入能否复现？）
    ↓
6. 修复或回滚
    ↓
7. 事后复盘（为什么会发生？怎么防止再次发生？）
```

---

## 19.5 成本优化策略

**LLM 成本优化**

| 策略 | 说明 | 节省比例 |
|------|------|---------|
| 模型分层 | 简单问题用便宜模型 | 40-60% |
| 缓存 | 相同问题缓存回答 | 20-30% |
| 短上下文 | 精简上下文长度 | 10-20% |
| 批处理 | 合并请求批量调用 | 5-10% |

**模型分层策略**

```python
def select_model(query_complexity):
    """根据问题复杂度选择模型"""
    
    if query_complexity == "simple":
        return "gpt-4o-mini"  # 便宜，够用
    elif query_complexity == "medium":
        return "gpt-4o"       # 平衡
    else:
        return "gpt-4o"       # 最强
    
    # 成本对比（每百万Token）：
    # gpt-4o-mini: $0.15 / $0.60
    # gpt-4o:      $2.50 / $10.00
```

**缓存策略**

```python
import hashlib
import redis

redis_client = redis.Redis()

def cached_llm_call(prompt, model="gpt-4o"):
    """带缓存的LLM调用"""
    
    cache_key = hashlib.md5(f"{prompt}:{model}".encode()).hexdigest()
    
    # 检查缓存
    cached = redis_client.get(cache_key)
    if cached:
        return cached.decode()
    
    # 调用LLM
    response = llm.invoke(prompt)
    
    # 缓存结果（24小时过期）
    redis_client.setex(cache_key, 86400, response)
    
    return response
```

---

## 19.6 高可用与容灾

**高可用设计**

| 策略 | 说明 |
|------|------|
| 多实例 | 至少2个Agent实例 |
| 多区域 | 不同区域部署 |
| 故障转移 | 主实例挂了自动切换备实例 |
| 降级策略 | LLM不可用时降级到规则引擎 |

**降级策略**

```python
class AgentServiceWithFallback:
    """带降级的Agent服务"""
    
    def __init__(self):
        self.primary_agent = Agent(llm="gpt-4o")
        self.fallback_agent = Agent(llm="gpt-4o-mini")
        self.rule_engine = RuleEngine()
    
    async def execute(self, request):
        """执行Agent，逐级降级"""
        
        # 第一级：主Agent
        try:
            return await self.primary_agent.run(request)
        except Exception:
            pass
        
        # 第二级：便宜模型
        try:
            return await self.fallback_agent.run(request)
        except Exception:
            pass
        
        # 第三级：规则引擎
        return self.rule_engine.handle(request)
```

---

## 19.7 运维自动化

**自动扩缩容**

```python
# 根据队列长度自动扩容
async def auto_scale():
    queue_length = get_queue_length()
    current_instances = get_instance_count()
    
    if queue_length > 100 and current_instances < 10:
        scale_up(2)
    elif queue_length < 10 and current_instances > 2:
        scale_down(1)
```

**自动恢复**

```python
# 检测到错误自动重启
async def health_check():
    while True:
        try:
            response = await test_request()
            if response.status != 200:
                restart_service()
        except Exception:
            restart_service()
        
        await asyncio.sleep(30)
```

> Agent 的运维核心是"可观测性"——你得能看到它每一步在做什么，才能在出问题时快速定位。日志、指标、追踪，三件套缺一不可。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 架构设计 | 单机→集群→微服务，按规模选择 |
| 容器化 | Docker + K8s + HPA自动伸缩 |
| 监控告警 | 业务指标+系统指标+成本指标 |
| 日志管理 | 结构化日志+全链路追踪 |
| 成本优化 | 模型分层+缓存+短上下文 |
| 高可用 | 多实例+故障转移+降级策略 |
| 运维自动化 | 自动扩缩容+自动恢复 |

---

觉得有用？收藏起来，下次直接照抄。

你在部署 Agent 时遇到过什么坑？评论区聊聊。

关注怕浪猫，下期我们进入行业实战——教育+医疗+金融三大领域的 Agent 应用开发。

系列进度 19/24

**下章预告：** 第20章我们将进入行业实战，从教育到医疗到金融，用真实场景带你构建不同行业的 AI Agent 应用。
