# 第15章 日志与可观测性：让线上问题无处藏身

线上报错了，用户反馈"页面白屏"，你打开日志一看——全是INFO，没有任何错误信息。这就是没有可观测性的后果。

我是怕浪猫，这章做日志和可观测性。结构化日志、请求追踪、错误告警、性能指标，让你的平台运行状态透明可见，问题秒定位。

---

## 15.1 结构化日志

**为什么需要结构化日志**

```python
# 不好的日志（纯文本）
logging.info("用户登录成功 user_id=1 username=张三")
logging.info("API调用 endpoint=/v1/chat/completions token_usage=1234")
# 问题：不好搜索、不好聚合、不好可视化

# 好的日志（结构化JSON）
logging.info(json.dumps({
    "event": "user_login",
    "user_id": 1,
    "username": "张三",
    "ip": "192.168.1.1",
    "timestamp": "2026-06-20T10:30:00Z"
}))
# 优势：可被ELK/Splunk直接消费，支持搜索和聚合
```

**Python结构化日志实现**

```python
# utils/json_logger.py
import json
import logging
from datetime import datetime

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # 附加自定义字段
        if hasattr(record, 'extra_fields'):
            log_data.update(record.extra_fields)
        
        # 异常信息
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data, ensure_ascii=False)

def get_logger(name, extra=None):
    """获取JSON格式logger"""
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    
    if extra:
        logger = logging.LoggerAdapter(logger, extra)
    
    return logger
```

**日志分级**

| 级别 | 用途 | 示例 |
|------|------|------|
| DEBUG | 调试信息 | 变量值、SQL语句 |
| INFO | 正常业务 | 用户登录、API调用 |
| WARNING | 潜在问题 | 频率接近限制、缓存未命中 |
| ERROR | 业务异常 | API Key无效、模型调用失败 |
| CRITICAL | 系统异常 | 数据库连接断开、OOM |

---

## 15.2 请求追踪

**请求ID生成与传递**

```python
# middleware/request_id.py
import uuid
from flask import g

class RequestIDMiddleware:
    def __init__(self, app):
        self.app = app
        
        @app.before_request
        def before_request():
            g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
        
        @app.after_request
        def after_request(response):
            response.headers['X-Request-ID'] = g.request_id
            return response
```

**日志中携带RequestID**

```python
# 修改JsonFormatter，自动携带request_id
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_data = {...}
        
        # 自动获取当前请求的request_id
        try:
            from flask import g
            if hasattr(g, 'request_id'):
                log_data["request_id"] = g.request_id
        except RuntimeError:
            pass
        
        return json.dumps(log_data, ensure_ascii=False)
```

---

## 15.3 错误监控与告警

**全局异常处理**

```python
@app.errorhandler(Exception)
def handle_exception(e):
    request_id = getattr(g, 'request_id', 'unknown')
    
    logger.error("未处理异常", extra={
        "extra_fields": {
            "event": "unhandled_exception",
            "request_id": request_id,
            "error_type": type(e).__name__,
            "error_message": str(e),
            "stack_trace": traceback.format_exc()
        }
    })
    
    return error("服务器内部错误", 500)
```

**错误分类告警**

```python
class AlertService:
    def __init__(self):
        self.error_counts = defaultdict(int)
        self.alert_threshold = 10
    
    def record_error(self, error_type):
        self.error_counts[error_type] += 1
        if self.error_counts[error_type] >= self.alert_threshold:
            self.send_alert(error_type)
            self.error_counts[error_type] = 0
    
    def send_alert(self, error_type):
        alert_msg = f"错误告警：{error_type} 超过{self.alert_threshold}次/分钟"
        # 接入飞书/钉钉webhook
        requests.post(Config.ALERT_WEBHOOK_URL, json={"text": alert_msg})
```

---

## 15.4 性能指标采集

**关键指标定义**

| 指标 | 类型 | 说明 |
|------|------|------|
| request_count | 计数 | 总请求数 |
| request_latency | 直方图 | 请求延迟分布 |
| error_count | 计数 | 错误数 |
| llm_tokens | 计数 | Token消耗 |

**Prometheus指标采集**

```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest

REQUEST_COUNT = Counter('llmops_requests_total', 'Total requests', ['endpoint', 'method', 'status'])
REQUEST_LATENCY = Histogram('llmops_request_duration_seconds', 'Request latency', ['endpoint'])
LLM_TOKENS = Counter('llmops_llm_tokens_total', 'LLM token usage', ['model', 'type'])

@app.route('/metrics')
def metrics():
    return generate_latest(), 200, {'Content-Type': 'text/plain'}

@app.before_request
def before_metrics():
    g.start_time = time.time()

@app.after_request
def after_metrics(response):
    latency = time.time() - g.start_time
    REQUEST_COUNT.labels(endpoint=request.path, method=request.method, status=response.status_code).inc()
    REQUEST_LATENCY.labels(endpoint=request.path).observe(latency)
    return response
```

---

## 15.5 日志收集与分析

**ELK Stack方案**

```yaml
# docker-compose-logging.yml
services:
  elasticsearch:
    image: elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"

  logstash:
    image: logstash:8.8.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch

  kibana:
    image: kibana:8.8.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch
```

**Kibana查询**

```
# 查找所有错误
level: "ERROR"

# 查找特定用户的操作
user_id: 123 AND event: "api_call"

# 查找慢请求
latency_ms: >5000
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 结构化日志 | JSON格式+关键字段+分级 |
| 请求追踪 | RequestID+全链路传递 |
| 错误监控 | 全局异常+分类告警 |
| 性能指标 | Prometheus+Counter+Histogram |
| 日志分析 | ELK Stack+Kibana查询 |

---

觉得有用？收藏起来，下次直接照抄。

你的可观测性是怎么做的？评论区聊聊。

关注怕浪猫，下期我们讲业务能力提升——大文件上传、语音转文字、图片理解、PDF处理，让平台支持更多输入类型。

系列进度 15/23

**下章预告：** 第16章业务能力提升——语音转文字、图片理解、PDF文档处理、大文件上传，让LLMOps平台从纯文本扩展到多模态。
