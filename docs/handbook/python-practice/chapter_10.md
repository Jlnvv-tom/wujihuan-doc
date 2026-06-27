# 第10章 可观测性与API网关

凌晨三点，生产环境某个接口偶发性超时，日志散落在8台机器上，你grep了半小时也没找到那条报错。更绝望的是，你根本不知道这个请求经过了哪些服务，在哪一跳出了问题。SRE同学问你"P99延迟多少"，你只能报一个均值搪塞过去。老板在群里问什么时候能恢复，你说还在排查。半小时过去了，你还在一堆文本日志里翻找线索。如果你经历过这种至暗时刻，说明你的系统缺的不是更多日志，而是一套完整的可观测性体系。

我是怕浪猫，这是Python实战训练营第10周的内容。本周我们从分布式链路追踪、指标监控、结构化日志三个维度搭建可观测性体系，再聊API网关的设计与实现。这四个主题合在一起，就是从"出了问题靠猜"到"出了问题靠看"的完整进化路径。怕浪猫会把自己在生产环境踩过的坑都写出来，让你少走弯路。

## 一、分布式链路追踪：让每个请求都有迹可循

### 1.1 链路追踪核心概念

分布式系统最大的痛点是"请求去哪了"。一个用户下单请求，可能经过网关、用户服务、订单服务、库存服务、支付服务，任何一个节点出问题都会导致请求失败。链路追踪就是给每个请求打上标签，让你能像查快递一样追踪它的完整路径。你打开了快递APP输入单号，就能看到包裹从仓库到分拣中心到派送点的每一步，链路追踪做的事情本质上是一样的。

链路追踪有四个核心概念，怕浪猫刚学的时候也容易搞混，这里一个个说清楚。

**Trace（链路）**：一次完整的请求生命周期，用一个全局唯一的Trace ID标识。比如用户点了一下"下单"按钮，从网关收到请求到最终返回响应，这整个过程就是一个Trace。Trace ID是贯穿整个调用链的唯一标识，无论请求经过多少个服务，Trace ID都是同一个。

**Span（跨度）**：Trace中的一个工作单元。比如订单服务处理请求是一个Span，调用库存服务是它的子Span。Span之间有父子关系，形成一个树形结构。每个Span包含操作名、开始时间、结束时间、属性和状态。你可以把Span理解为函数调用栈的一个帧，但它跨越了进程边界。

Baggage（行李）**：跨服务传播的业务键值对。跟Span属性不同，Baggage会跟着请求一起传递到下游所有服务。比如你想把用户的tenant_id传给所有下游服务，就放在Baggage里。但要注意，Baggage过大会影响性能，因为每次HTTP请求都要传递这些数据。怕浪猫的建议是Baggage里只放少量关键标识，不超过5个键值对。

一个常见的使用场景是灰度发布。你在网关层根据用户标签决定走灰度还是正式版本，把灰度标记放在Baggage里。下游所有服务都能读到这个标记，从而做相应的逻辑处理，比如灰度用户走新版本代码路径、使用独立的数据库分片。这比在每个服务里重复判断用户标签要优雅得多。

**Context Propagation（上下文传播）**：Trace ID和Span ID跨进程传递的机制。HTTP请求通过请求头注入，消息队列通过消息属性注入。这是链路追踪能串起来的关键。没有Context Propagation，每个服务各自生成Span，永远拼不出完整的调用链。

> 链路追踪的本质不是记录更多日志，而是给散落的日志建立因果关系。日志告诉你发生了什么，链路追踪告诉你它们之间的先后和因果。

来看一个具体的Span树形结构：

```
Trace (Trace ID: abc123)
├── Span: GET /api/order (gateway, 200ms)
│   ├── Span: GET /api/user/{id} (user-service, 50ms)
│   │   └── Span: SELECT * FROM users (postgresql, 20ms)
│   ├── Span: POST /api/order (order-service, 120ms)
│   │   ├── Span: SELECT * FROM inventory (postgresql, 30ms)
│   │   └── Span: SET stock:sku123 (redis, 5ms)
│   └── Span: POST /api/payment (payment-service, 30ms)
```

这棵树让你一眼就能看出：整个请求耗时200ms，最慢的一跳是订单服务（120ms），而订单服务里最慢的是数据库查询（30ms）。如果P99突然飙高，你直接看Span树就能定位瓶颈在哪一层。这比你在8台机器上grep日志然后人肉拼凑调用关系高效得多。

理解了核心概念，接下来看怎么在Python里实现。怕浪猫选择OpenTelemetry作为链路追踪的框架，原因后面会讲。

### 1.2 OpenTelemetry Python SDK实战

OpenTelemetry（简称OTel）是CNCF的顶级项目，目标是统一可观测性标准。在OpenTelemetry出现之前，链路追踪领域百花齐放：Jaeger有自己的客户端库，Zipkin有自己的客户端库，SkyWalking也有自己的客户端库。每个客户端库的API都不一样，切换后端意味着要改所有埋点代码。OpenTelemetry就是为了解决这个问题而生的，它提供了一套统一的API和SDK，后端可以是Jaeger、Zipkin、Tempo、Datadog等任何支持OTLP协议的系统。

怕浪猫在实际项目中踩过一个坑：一个老项目用了Jaeger的Python客户端，后来要迁移到Tempo，所有埋点代码都要改。迁移花了整整两周，还出了几个遗漏导致的断链bug。如果一开始就用OpenTelemetry，切换后端只需要改一行导出器配置。所以如果你刚开始做链路追踪，直接上OpenTelemetry，别走老路。

先安装核心依赖：

```python
# requirements.txt
opentelemetry-api==1.24.0
opentelemetry-sdk==1.24.0
opentelemetry-exporter-otlp==1.24.0
opentelemetry-instrumentation-flask==0.45b0
opentelemetry-instrumentation-sqlalchemy==0.45b0
opentelemetry-instrumentation-redis==0.45b0
```

然后是Tracer的基础配置。这段代码是所有链路追踪的起点，每个服务启动时都要执行：

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor, OTLPSpanExporter
)
from opentelemetry.sdk.resources import Resource

def setup_tracing(service_name: str, otlp_endpoint: str = "http://localhost:4317"):
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "1.0.0",
        "deployment.environment": "production",
    })
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
    provider.add_span_processor(
        BatchSpanProcessor(exporter, max_queue_size=4096)
    )
    trace.set_tracer_provider(provider)
    return trace.get_tracer(__name__)
```

这段代码做了三件事。第一，定义服务身份：Resource里包含service.name、service.version和deployment.environment，这些信息会附加到每个Span上，你在Jaeger里可以按服务名过滤。第二，创建TracerProvider并配置OTLP导出器：导出器负责把Span数据发到Jaeger或Tempo，endpoint参数是后端地址。第三，BatchSpanProcessor批量发送Span，max_queue_size控制队列大小，避免高流量时Span积压导致内存溢出。

> Resource是Span的"身份证"，没有service.name的Span就像没有寄件地址的快递单，收集到了也不知道是谁发的。

接下来是手动创建Span和设置属性。手动埋点虽然繁琐，但能精确控制Span的粒度和属性：

```python
tracer = trace.get_tracer(__name__)

def process_order(order_id: str, user_id: str):
    with tracer.start_as_current_span("process_order") as span:
        span.set_attribute("order.id", order_id)
        span.set_attribute("order.user_id", user_id)
        span.set_attribute("order.status", "processing")
        
        try:
            result = validate_order(order_id)
            span.add_event("order_validated", {"items": len(result.items)})
            span.set_attribute("order.items_count", len(result.items))
            return result
        except ValueError as e:
            span.record_exception(e)
            span.set_status(trace.Status(
                trace.StatusCode.ERROR, str(e)
            ))
            raise
```

几个关键点需要解释。`start_as_current_span`会自动把当前Span设为Context中的活跃Span，后续在这个with块里创建的子Span会自动挂载到它下面，不需要手动指定父子关系。`set_attribute`设置Span属性，这些属性可以在Jaeger UI里搜索和过滤，比如搜`order.id=12345`就能找到对应订单的处理Span。`add_event`在Span时间线上标记一个事件，比如"订单校验通过"这个时间点。`record_exception`记录异常堆栈，`set_status`设置Span状态为ERROR，这样在Jaeger里这个Span会标红显示。

### 1.3 Context注入与提取

跨服务传播靠的是Context Propagation。HTTP场景下，OpenTelemetry通过W3C Trace Context标准把Trace信息塞到请求头里。具体来说，请求头里会多一个traceparent字段：

```
traceparent: 00-abc123def456789abc123def456789ab-789ghi012jkl-01
```

这个header的格式是`00-{trace-id}-{span-id}-{trace-flags}`。00是版本号，trace-id是32位十六进制的Trace ID，span-id是16位十六进制的Span ID，trace-flags的01表示采样标志位为已采样。

Inject和Extract的代码如下。服务A发请求时注入Context，服务B收到请求时提取Context：

```python
from opentelemetry.propagate import inject, extract
from opentelemetry.context import attach, detach
import requests

# 服务A：发请求时注入Context到headers
def call_downstream(url: str, data: dict):
    headers = {"Content-Type": "application/json"}
    inject(headers)  # 把当前Trace Context写入headers
    response = requests.post(url, json=data, headers=headers)
    return response.json()
```

服务B收到请求时，需要从请求头提取Context，然后设为当前Context。这样后续创建的Span就会自动挂载到上游的Trace树上：

```python
from flask import Flask, request

app = Flask(__name__)

@app.route("/api/process", methods=["POST"])
def handle():
    ctx = extract(request.headers)
    token = attach(ctx)
    try:
        with tracer.start_as_current_span("handle_process"):
            data = request.get_json()
            result = process_data(data)
            return {"status": "ok", "result": result}
    finally:
        detach(token)
```

> Context Propagation是链路追踪的"血液"。没有它，每个服务的Span就是孤岛，永远拼不出完整的调用链。

怕浪猫踩过一个坑：用了requests库发HTTP请求，但忘了在headers里inject Context，结果调用链在跨服务的地方断了。Jaeger里看到的Span树只到当前服务就停了，下游服务的Span成了孤立的碎片。排查了半天才发现是inject那行代码漏了。所以inject和extract一定要成对出现，少一个就断链。

### 1.4 自动Instrumentation

手动埋点灵活但容易遗漏。你不可能在每个HTTP请求、每条SQL查询、每个Redis命令上都手动加Span。OpenTelemetry提供了自动instrumentation，对常见框架和库自动埋点，零代码侵入。

Flask自动埋点只需要两行代码：

```python
from opentelemetry.instrumentation.flask import FlaskInstrumentor

app = Flask(__name__)
FlaskInstrumentor().instrument_app(app)
```

现在每个路由请求都会自动创建一个Span。Span名称是`GET /api/users`这样的格式，自动属性包括http.method、http.status_code、http.url、http.route等。你不需要在路由函数里写任何埋点代码。

FastAPI自动埋点同样简单：

```python
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from fastapi import FastAPI

app = FastAPI()
FastAPIInstrumentor.instrument_app(app)
```

SQLAlchemy自动埋点会给每条SQL查询创建Span：

```python
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from sqlalchemy import create_engine

engine = create_engine("postgresql://user:pass@localhost/db")
SQLAlchemyInstrumentor().instrument(engine=engine)
```

每条SQL查询自动创建Span，自动属性包括db.system（postgresql）、db.statement（SQL文本）、db.name（数据库名）。你在Jaeger里能看到每条查询的耗时，直接定位慢SQL。

Redis自动埋点覆盖了redis-py库：

```python
from opentelemetry.instrumentation.redis import RedisInstrumentor
import redis

RedisInstrumentor().instrument()
r = redis.Redis(host="localhost", port=6379)
```

每条Redis命令自动创建Span，属性包括db.system=redis和具体的命令信息。

怕浪猫踩过的坑：SQLAlchemy的自动instrumentation在用了连接池（QueuePool）的时候，如果连接池配置不当，Span里看到的数据库操作耗时跟实际不符。原因是连接获取的时间没算进去，Span只记录了SQL执行的时间，没记录等待连接的时间。在连接池耗尽的情况下，实际耗时可能是Span显示耗时的几十倍。解决方案是同时监控连接池指标（checkedout、overflow等），或者手动在获取连接的地方加一个Span。

> 自动instrumentation是"免费的可观测性"。几行代码就能给整个应用加上链路追踪，ROI极高。但它也有盲区，自定义业务逻辑还是得手动埋点。

### 1.5 采样策略

全量采集Span在生产环境是不现实的。一个日均亿级请求的系统，全量采集产生的数据量足以压垮任何后端。假设每个请求产生10个Span，每个Span 1KB，一天就是1TB的Span数据。采样策略是控制成本的关键。

**头部采样（Head Sampling）**：在Trace的入口处决定是否采样，决定后整个链路要么全采要么全不采。优点是简单、无偏倚、不需要后端支持；缺点是无法根据链路特征做决策。比如一个请求在第三跳才出错，但头部采样在入口已经决定不采了，这条出错的链路就丢失了。实现方式是在Trace开头设置采样标志位：

```python
from opentelemetry.sdk.trace.sampling import (
    TraceIdRatioBased, ParentBased
)

# 概率采样：只采10%的请求
sampler = ParentBased(TraceIdRatioBased(0.1))
provider = TracerProvider(resource=resource, sampler=sampler)
```

ParentBased确保子Span跟随父Span的采样决策，避免出现"父Span采了但子Span没采"的断链情况。

**尾部采样（Tail Sampling）**：在Trace完成后根据整体特征决定是否采集。比如只采集耗时超过500ms、或状态为ERROR的链路。这需要收集所有Span后再做决策，通常在OTel Collector层实现，应用层不需要改动：

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: error-policy
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-policy
        type: latency
        latency:
          threshold_ms: 500
      - name: sample-10pct
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

这个配置表示：所有ERROR链路全采，所有超过500ms的链路全采，其余的采10%。这样你不会错过任何异常，同时把正常链路的存储成本控制在10%。

**概率采样（Probabilistic Sampling）**：按比例随机采样，适合流量大的场景。上面TraceIdRatioBased(0.1)就是10%概率采样。概率采样的好处是性能开销极低，坏处是可能恰好漏掉关键的异常链路。

| 采样策略 | 决策时机 | 优点 | 缺点 | 适用场景 |
|---------|---------|------|------|---------|
| 头部采样 | 链路入口 | 简单、无后端依赖 | 无法根据链路特征决策 | 中小规模系统 |
| 尾部采样 | 链路完成 | 精准采集异常链路 | 需要缓存完整链路、有延迟 | 大规模生产系统 |
| 概率采样 | 链路入口 | 性能开销极小 | 可能漏掉关键异常 | 超高流量系统 |

> 采样不是"少采一点"那么简单，而是在成本和可观测性之间找平衡点。尾部采样是最优雅的方案，但也是最重的，需要Collector支持。

再来对比一下这四种采样策略的适用场景。头部采样适合中小规模系统，实现简单，不需要额外的基础设施。尾部采样适合大规模生产系统，能精准采集异常链路，但需要OTel Collector支持，部署成本较高。概率采样适合超高流量系统，性能开销极低，但可能漏掉关键异常。实际生产中，怕浪猫建议组合使用：头部采样10%保证基础可观测性，尾部采样补充采集所有ERROR和慢请求。这样既控制了成本，又不会错过关键信息。

怕浪猫的建议：中小规模系统先用头部采样10%起步，成本可控。随着流量增长，加上尾部采样策略，确保ERROR和慢请求不被遗漏。超大流量系统用概率采样1%甚至更低，配合指标监控来弥补采样带来的盲区。记住一个原则：采样率可以低，但异常链路必须采到。一个没采到的ERROR比100个没采到的正常请求更危险。

## 二、指标监控：用数字说话

### 2.1 Metrics类型详解

链路追踪告诉你"某个请求发生了什么"，指标监控告诉你"系统整体怎么样"。前者是微观视角，后者是宏观视角。两者缺一不可。Prometheus定义了四种Metrics类型，理解它们的区别是设计监控体系的基础。

**Counter（计数器）**：只增不减的累计值。比如HTTP请求总数、错误总数、订单创建数。Counter适合回答"总共发生了多少次"的问题。即使服务重启，Counter的值也会从0重新开始累计。Prometheus通过rate函数计算Counter的变化率，从而得到每秒请求数（QPS）。

Counter为什么设计成只增不减？因为Prometheus是拉模式，每次拉取的是Counter的当前值。如果Counter可增可减，两次拉取之间Counter先增后减回原值，Prometheus就感知不到中间发生了什么。只增不减的设计保证了rate函数能正确计算变化率。如果你的场景需要反映当前值（比如队列长度），用Gauge而不是Counter。

Gauge适合回答"现在是多少"的问题。Gauge的值可以上升也可以下降，反映系统当前的状态。比如当前活跃连接数是50、CPU使用率是65%、队列长度是10。Gauge在Prometheus里不支持rate函数，因为它的值不是单调递增的。

**Histogram（直方图）**：将数据按桶分布统计。比如HTTP请求延迟分布，你想知道90%的请求在多少ms内完成。Histogram把数据分到预定义的桶里，每个桶记录有多少个数据点落在这个范围内。Histogram适合回答"分布如何"的问题。比如你想知道P99延迟，Histogram通过桶的组合计算近似分位数。

**Summary（摘要）**：类似Histogram，但直接在客户端计算分位数。比如P50、P90、P99延迟。Summary适合回答"百分之多少的请求在多少时间内"的问题。Summary的计算发生在客户端，服务端拿到的是已经算好的分位数值。

| Metrics类型 | 特性 | 客户端计算量 | 服务端聚合 | 分位数精度 | 适用场景 |
|------------|------|-------------|-----------|-----------|---------|
| Counter | 单调递增 | 极低 | 支持 | N/A | 请求计数、错误计数 |
| Gauge | 自由变化 | 极低 | 不支持 | N/A | 温度、内存、连接数 |
| Histogram | 桶分布 | 中等 | 支持 | 取决于桶配置 | 延迟分布、响应大小 |
| Summary | 分位数 | 高 | 不支持 | 高精度 | 少量关键指标的P99 |

怕浪猫的选择建议：延迟类指标用Histogram而不是Summary。原因有两个：第一，Histogram可以在服务端聚合计算分位数，多个实例的P99可以合并计算；第二，Summary一旦从客户端出来就不可聚合了，多实例场景下你只能拿到每个实例的P99，无法计算全局P99。对于微服务架构来说，聚合能力至关重要。

> 指标不是越多越好。每个指标都有存储成本和认知成本，100个指标里真正每天被看的可能不到10个。先定义核心指标，再按需扩展。

### 2.2 prometheus_client实战

prometheus_client是Python官方的Prometheus客户端库，使用非常广泛。Prometheus是拉模式（pull model）的监控系统，它主动去应用暴露的/metrics端点拉取指标数据，而不是应用主动推送。这种模式的好处是应用不需要知道监控系统的地址，只需要把指标暴露出来就行。

安装：

```bash
pip install prometheus_client==0.20.0
```

自定义指标定义与注册。每个指标需要指定名称、帮助文本、标签和注册表：

```python
from prometheus_client import Counter, Gauge, Histogram, Registry

registry = Registry()

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
    registry=registry,
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    registry=registry,
)

ACTIVE_CONNECTIONS = Gauge(
    "active_connections",
    "Number of active connections",
    registry=registry,
)
```

标签（labels）是指标维度的重要概念。同一个指标通过不同标签值可以拆分查看。比如REQUEST_COUNT有method、endpoint、status三个标签，你可以分别查看GET /api/users 200的请求数、POST /api/orders 500的请求数。但要注意标签基数不能太大，如果用user_id做标签，几万个用户就是几万条时间序列，Prometheus会扛不住。

Histogram的分桶策略很关键。桶太宽，你分辨不出P99和P999的区别；桶太窄，指标基数爆炸。怕浪猫的经验是：先看业务SLA，SLA是200ms，就在200ms附近多设几个桶。上面的配置从5ms到10s覆盖了大部分Web场景，在100ms和250ms之间设了多个桶，适合SLA在100-500ms范围的业务。

在Flask中集成指标采集：

```python
from flask import Flask, Response, g, request
import time

app = Flask(__name__)

@app.before_request
def before_request():
    g.start_time = time.time()

@app.after_request
def after_request(response):
    latency = time.time() - g.start_time
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.endpoint,
        status=response.status_code,
    ).inc()
    REQUEST_LATENCY.labels(
        method=request.method,
        endpoint=request.endpoint,
    ).observe(latency)
    return response

@app.route("/metrics")
def metrics():
    return Response(
        registry.generate_latest(),
        mimetype="text/plain; version=0.0.4; charset=utf-8",
    )
```

before_request记录请求开始时间，after_request计算延迟并更新Counter和Histogram。/metrics端点返回Prometheus格式的指标数据，Prometheus定时来拉取。注意mimetype要包含version=0.0.4，这是Prometheus的协议版本号。

> 指标埋点的最佳位置是中间件，不是业务代码。中间件层做横切关注点的采集，业务代码只关注业务逻辑。

### 2.3 实现应用指标采集器

光有通用HTTP指标不够，业务指标才是最有价值的。比如"今天下了多少订单"、"支付成功率是多少"、"库存扣减失败次数"。下面是一个完整的业务指标采集器实现，涵盖QPS、延迟分布、错误率和资源占用：

```python
from prometheus_client import Counter, Gauge, Histogram
from prometheus_client import CollectorRegistry
import psutil, threading, time

class AppMetricsCollector:
    def __init__(self):
        self.registry = CollectorRegistry()
        
        self.qps = Counter(
            "app_qps_total", "Total requests",
            ["service"], registry=self.registry,
        )
        self.latency = Histogram(
            "app_latency_seconds", "Request latency",
            ["service", "endpoint"],
            buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
            registry=self.registry,
        )
        self.errors = Counter(
            "app_errors_total", "Total errors",
            ["service", "error_type"], registry=self.registry,
        )
        self.cpu_usage = Gauge(
            "app_cpu_percent", "CPU usage",
            registry=self.registry,
        )
        self.memory_usage = Gauge(
            "app_memory_bytes", "Memory usage",
            registry=self.registry,
        )
        self._start_resource_monitor()
```

资源监控放在后台线程，避免阻塞请求处理：

```python
    def _start_resource_monitor(self):
        def monitor():
            while True:
                self.cpu_usage.set(psutil.cpu_percent(interval=1))
                self.memory_usage.set(
                    psutil.Process().memory_info().rss
                )
                time.sleep(15)
        threading.Thread(target=monitor, daemon=True).start()
    
    def record_request(self, service, endpoint, duration, is_error=False):
        self.qps.labels(service=service).inc()
        self.latency.labels(
            service=service, endpoint=endpoint
        ).observe(duration)
        if is_error:
            self.errors.labels(
                service=service, error_type="server_error"
            ).inc()
```

这个采集器封装了四类指标。QPS用Counter统计总请求数，配合rate函数可以算出每秒请求数。延迟用Histogram记录分布，可以算P50/P90/P99。错误率通过errors和qps两个Counter的比值计算。资源占用用Gauge实时反映CPU和内存状态。

怕浪猫踩过的坑：psutil.cpu_percent(interval=1)是阻塞调用，会卡住当前线程1秒。如果放在请求处理路径里，每个请求都会多1秒延迟。解决方案是放后台线程定期采集，如上面的代码所示。另外psutil.Process().memory_info().rss返回的是RSS（Resident Set Size），即实际使用的物理内存，不包括虚拟内存。如果你的应用有大量内存映射文件，RSS可能不能反映真实内存使用，需要额外采集VMS指标。

### 2.4 Grafana面板设计

有了指标数据，还需要一个好的展示面板。Grafana是Prometheus最常用的可视化工具，面板设计的几个原则怕浪猫总结如下。

**QPS面板**：用Time series图，按service分组，查看各服务流量趋势。PromQL查询：`rate(app_qps_total[5m])`，按service标签分组。

**延迟面板**：用Histogram的quantile函数计算P50/P90/P99。这是最常用的延迟面板查询：
```promql
histogram_quantile(0.99, rate(app_latency_seconds_bucket[5m]))
```
这个查询先rate计算每秒增量，再histogram_quantile计算P99分位数。把0.99换成0.5和0.9就能得到P50和P90。

**错误率面板**：用错误数除以总请求数，得到错误率百分比：
```promql
rate(app_errors_total[5m]) / rate(app_qps_total[5m]) * 100
```

**资源面板**：CPU用Gauge直接展示当前使用率，内存也用Gauge展示RSS值。可以加阈值线，超过80%变黄，超过90%变红。

> 好的监控面板不是把所有指标堆上去，而是让人在3秒内判断系统是否健康。绿色就没事，红色就有问题，黄色需要关注。

## 三、结构化日志：告别grep时代

### 3.1 为什么需要结构化日志

传统日志是给人看的文本格式：
```
2024-01-15 10:30:00 INFO User 12345 placed order #67890, total: 99.50
```

这段日志人能读懂，但机器很难解析。你想统计"今天有多少订单超过100元"，只能写正则grep。当日志量大到GB级别时，grep就力不从心了。更别提跨机器搜索了，你得到每台机器上分别grep，然后人工汇总结果。

结构化日志是给机器看的JSON格式：
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "event": "order_placed",
  "user_id": "12345",
  "order_id": "67890",
  "total": 99.50,
  "trace_id": "abc123",
  "span_id": "def456"
}
```

这种格式可以被ELK（Elasticsearch+Logstash+Kibana）、Loki、Datadog等日志系统直接索引和查询。搜`event:order_placed AND total>100`秒出结果。每个字段都是可索引的，你可以按user_id、order_id、trace_id等任意维度过滤和聚合。

> 结构化日志不是把日志变好看，而是把日志变成可计算的数据。文本日志是散文，结构化日志是表格。

### 3.2 开源日志库对比

Python生态有三个主流结构化日志库，各有优劣。怕浪猫都用过，下面是对比分析。

**structlog**：结构化日志的标杆库。它最大的特点是"在日志生成时就结构化"，而不是在输出时再转JSON。structlog内部全程使用字典传递日志信息，到最后一步才用JSONRenderer渲染成JSON字符串。这种设计让中间件（processor）可以灵活地增删改日志字段。structlog支持ContextVar绑定，天然适合和链路追踪集成。

**loguru**：主打简单好用。API设计优雅，开箱即用，一行代码配置就能输出彩色日志到终端。loguru支持结构化输出（serialize=True参数），但结构化不是它的核心卖点。loguru的优势在开发体验，劣势是对链路追踪的集成不如structlog原生。如果你写过`logger.info("User {} bought {}", user_id, item)`这种代码，loguru能让你用f-string写出更自然的日志。

**python-json-logger**：标准库logging的JSON格式化器。如果你已有大量基于logging的代码，不想迁移，用它最小成本实现结构化。它的工作原理是替换logging的Formatter，把LogRecord转成JSON。但它本质还是logging那套体系，ContextVar绑定需要自己实现，结构化程度不如structlog彻底。

| 日志库 | 结构化原生度 | 链路追踪集成 | 性能 | 迁移成本 | 适用场景 |
|-------|------------|------------|------|---------|---------|
| structlog | 原生设计 | 原生支持 | 高 | 中等 | 新项目、微服务 |
| loguru | 后期支持 | 需手动集成 | 中 | 低 | 快速开发、脚本 |
| python-json-logger | 格式化层 | 需手动集成 | 中 | 极低 | 老项目改造 |

> 选日志库就像选日记本，重要的不是封面多好看，而是你是否愿意每天打开它。

### 3.3 structlog实战

structlog是怕浪猫在生产环境的首选。下面是完整的配置方案，包含链路追踪集成：

```python
import structlog
import logging
import sys

def setup_logging(service_name: str = "app", log_level: str = "INFO"):
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )
    
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            add_trace_context,
            redact_sensitive,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper())
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

processors是structlog的核心概念，它是一条处理链。日志信息以字典形式流经每个processor，每个processor可以读取、修改或添加字段。最后JSONRenderer把字典渲染成JSON字符串。处理链的顺序很重要，JSONRenderer必须是最后一个。

这里有两个自定义processor。第一个是`add_trace_context`，把当前Trace ID和Span ID注入到每条日志里：

```python
from opentelemetry import trace

def add_trace_context(logger, method_name, event_dict):
    span = trace.get_current_span()
    if span and span.is_recording():
        ctx = span.get_span_context()
        event_dict["trace_id"] = f"{ctx.trace_id:032x}"
        event_dict["span_id"] = f"{ctx.span_id:016x}"
    return event_dict
```

这个processor做了件很关键的事：它把链路追踪和日志关联起来了。有了trace_id，你在Jaeger里看到一个慢Span，可以直接拿trace_id去日志系统搜对应的所有日志。反过来，日志里的异常也能通过trace_id追溯到完整的调用链。这种关联是可观测性体系的核心价值之一。

第二个是`redact_sensitive`，脱敏敏感字段：

```python
SENSITIVE_KEYS = {"password", "token", "secret", "api_key", "id_card"}

def redact_sensitive(logger, method_name, event_dict):
    for key in list(event_dict.keys()):
        if key.lower() in SENSITIVE_KEYS:
            event_dict[key] = "***REDACTED***"
    return event_dict
```

使用structlog记录日志。注意bind方法的使用，它能把上下文信息绑定到logger，后续所有日志都带这些字段：

```python
import structlog

logger = structlog.get_logger()

def place_order(user_id: str, items: list):
    log = logger.bind(user_id=user_id, items_count=len(items))
    
    log.info("order_started")
    
    try:
        total = calculate_total(items)
        log.info("order_total_calculated", total=total)
        
        order_id = save_order(user_id, items, total)
        log.info("order_placed", order_id=order_id, total=total)
        return order_id
    except InsufficientStockError as e:
        log.error("order_failed", error=str(e),
                  error_type="insufficient_stock")
        raise
    except Exception as e:
        log.exception("order_failed", error=str(e))
        raise
```

输出效果，每条日志都是独立的JSON：
```json
{"event":"order_started","user_id":"12345","items_count":3,"level":"info","timestamp":"2024-01-15T10:30:00Z","trace_id":"abc123def456789abc123def456789ab","span_id":"def456789abcdef0"}
{"event":"order_total_calculated","user_id":"12345","items_count":3,"total":99.50,"level":"info","timestamp":"2024-01-15T10:30:00Z","trace_id":"abc123def456789abc123def456789ab","span_id":"def456789abcdef0"}
```

每条日志都有trace_id和span_id，都有user_id和items_count。在ELK或Loki里，你可以用`trace_id:"abc123def456789abc123def456789ab"`一键拉出这个请求的所有日志，不管这些日志来自哪个服务。

> 好的日志结构化设计，让日志从"事后回忆录"变成"实时数据流"。

### 3.4 日志与链路追踪关联的最佳实践

光有trace_id注入还不够，怕浪猫在实际项目中总结了以下最佳实践。

第一，统一日志事件命名规范。用`<domain>_<action>`格式，比如`order_placed`、`payment_refunded`、`user_registered`。不要用自然语言如"用户下单成功"，机器不好处理。命名规范一旦定下来，全团队遵守，这样在日志系统里搜索`event:order_*`就能找到所有订单相关日志。

第二，日志级别要克制使用。INFO用于关键业务事件（下单成功、支付完成），WARNING用于可恢复异常（重试成功、降级触发），ERROR用于需要人工介入的问题（数据库连接失败、第三方服务不可用）。怕浪猫见过一个项目把所有异常都记成ERROR，结果错误告警每天触发几百次，大家全忽略了告警邮件。真正的严重错误被淹没了，直到用户投诉才发现。这就是"狼来了"效应。

第三，敏感信息不要进日志。用户密码、token、身份证号这些必须脱敏。上面代码里的redact_sensitive processor就是干这个的。但要注意，脱敏要在日志生成时就做，不要先记录明文再在日志系统里过滤，因为明文日志可能已经被持久化了。

第四，异步写日志避免阻塞请求。structlog本身是同步的，在高并发场景下日志I/O可能成为瓶颈。可以用QueueHandler和QueueListener把日志写入操作放到后台线程：

```python
import logging
from logging.handlers import QueueHandler, QueueListener
import queue

log_queue = queue.Queue(-1)
queue_handler = QueueHandler(log_queue)

file_handler = logging.FileHandler("app.log")
file_handler.setFormatter(logging.Formatter("%(message)s"))

listener = QueueListener(log_queue, file_handler)
listener.start()

logging.basicConfig(level=logging.INFO, handlers=[queue_handler])
```

QueueHandler把日志记录放入队列后立即返回，不等待实际写入完成。QueueListener在后台线程从队列取出记录写入文件。这样即使文件I/O慢，也不会阻塞请求线程。怕浪猫在压测中发现，同步写日志在QPS 5000以上时会有明显的性能影响，改成异步后吞吐量提升了30%。

第五，日志要包含足够的上下文。一条"order_failed"日志如果只有error信息，你不知道是哪个用户的订单失败了、失败原因是什么、在下单流程的哪个环节失败的。应该包含user_id、order_id、error_type、error_message、trace_id等字段。但也不要过度记录，每条日志不超过20个字段，否则不仅日志体积大，查询也会变慢。

第六，日志要区分请求级别和事件级别。请求级别的日志在请求开始和结束时各记一条，包含请求概要信息。事件级别的日志在业务关键节点记录，比如"订单校验通过"、"库存扣减成功"。这样你在查看一个请求的日志时，既能看到整体概况，又能看到关键步骤的细节。

第七，结构化日志要配合日志系统使用。structlog输出的JSON日志需要被ELK、Loki或Datadog等系统采集和索引。如果你的日志系统不支持JSON格式搜索，那结构化日志的价值就大打折扣。在选择日志系统时，要考虑是否支持JSON字段索引、是否支持Lucene语法查询、是否支持日志告警。

> 日志是给未来的自己写的情书。写得越清晰，未来排查问题时越省事。

## 四、API网关设计：微服务的大门

### 4.1 网关核心功能

当你的微服务数量从3个增长到10个再到30个，直接让前端调用各个服务就变得不可行了。前端需要知道每个服务的地址、处理跨域、处理认证、处理限流。这些公共逻辑如果分散在每个服务里，重复代码会让你崩溃。更糟糕的是，每次增加一个服务，前端都要改配置、加路由、处理新的认证逻辑。

API网关就是解决这个问题的。它是所有外部请求的统一入口，承担以下核心功能。

**路由转发**：根据请求路径、Header、Query参数将请求转发到后端服务。支持路径重写、灰度路由（按权重或按用户标签分流到不同版本）、A/B测试路由。

**协议转换**：外部HTTP请求转内部gRPC调用，或者WebSocket转内部消息队列。客户端只需要跟网关说HTTP，网关负责翻译成内部协议。这样前端不需要了解gRPC、Protobuf这些技术栈。

**认证鉴权**：统一处理JWT验证、API Key校验、OAuth2令牌校验。后端服务不需要重复实现认证逻辑，只需要信任网关传过来的用户身份。网关验证通过后，把用户信息放在请求头里传给后端，比如X-User-Id、X-User-Roles。后端服务从请求头读取这些信息即可，不需要自己解析token。这样后端服务可以专注于业务逻辑，认证这碗狗粮由网关统一吃。

但要注意一个安全问题：后端服务必须验证请求确实来自网关，而不是直接从外部访问的。通常的做法是把后端服务部署在内网，只允许网关访问。如果后端服务有外部入口，需要校验网关签名或内部token，防止伪造X-User-Id头绕过认证。验、OAuth2令牌校验。后端服务不需要重复实现认证逻辑，只需要信任网关传过来的用户身份。网关验证通过后，把用户信息放在请求头里传给后端，比如X-User-Id、X-User-Roles。后端服务从请求头读取这些信息即可，不需要自己解析token。

**限流熔断**：保护后端服务不被流量打垮。限流控制请求速率，超过阈值的请求返回429。熔断在下游故障时快速失败，避免级联雪崩。这跟第8章讲过的resilience模式是配合使用的，网关层的限流是第一道防线，服务层的熔断是第二道。

**日志监控**：统一记录请求日志、指标采集、链路追踪注入。后端服务不需要各自实现这些横切逻辑。网关作为流量入口，天然是可观测性数据的重要采集点。

> API网关不是可选的架构组件，而是微服务架构从"能用"到"好用"的必经之路。

### 4.2 开源网关方案对比

市面上有很多成熟的API网关，选择时需要考虑性能、生态、学习成本和扩展性。怕浪猫选了三个最主流的开源方案做对比。

**Kong**：基于OpenResty（Nginx+Lua）的网关，后来也支持了Go插件。Kong的插件生态非常丰富，认证、限流、日志、链路追踪都有现成插件，开箱即用。数据库模式支持PostgreSQL存储配置，无数据库模式用声明式配置（YAML文件）。Kong的优点是成熟稳定，经过大量生产验证；缺点是Lua插件开发门槛较高，团队需要有OpenResty经验。

**APISIX**：同样基于OpenResty，但用etcd做配置中心，动态路由不需要重启。这意味着你可以在不重启网关的情况下添加新路由、修改限流规则、切换灰度比例。APISIX原生支持分布式链路追踪（SkyWalking/Zipkin/Jaeger），插件用Lua写，也支持Java和Go插件。相比Kong，APISIX在动态配置和性能上更有优势，社区也更活跃。

**Traefik**：Go语言写的网关，主打自动服务发现。跟Docker、Kubernetes深度集成，容器启动自动注册路由，不需要手动配置。Traefik的配置非常简洁，适合云原生场景。它还有一个很好用的Dashboard，可以直观地看到路由关系。但在复杂路由规则和插件生态上不如Kong和APISIX。

| 网关方案 | 语言/运行时 | 配置方式 | 插件生态 | 性能 | K8s集成 | 适用场景 |
|---------|-----------|---------|---------|------|---------|---------|
| Kong | OpenResty/Lua | DB/声明式 | 极丰富 | 极高 | 良好 | 大规模生产系统 |
| APISIX | OpenResty/Lua | etcd动态 | 丰富 | 极高 | 良好 | 动态配置需求强 |
| Traefik | Go | 声明式/自动 | 中等 | 高 | 极好 | 云原生/K8s环境 |
| 自研ASGI | Python | 代码配置 | 完全自定义 | 中等 | N/A | 中小规模/特殊需求 |

怕浪猫在生产环境用过Kong和APISIX，两者都很成熟。选型建议：如果团队有Lua经验或者需要大量现成插件，选Kong；如果需要频繁动态调整路由且对配置实时性要求高，选APISIX；如果在K8s环境且路由规则不复杂，Traefik是最省心的。

> 选网关就像选房子，位置（性能）重要，但配套（生态）和物业（社区）同样重要。别只看benchmark数字。

### 4.3 基于ASGI实现轻量级API网关

有时候你不需要一个重量级网关，或者有特殊的路由逻辑需要用Python实现。比如你的路由规则依赖于数据库里的配置、依赖于请求体的内容、依赖于用户标签。这些复杂逻辑用Kong的插件写Lua很痛苦，用Python写就很自然。基于ASGI规范，我们可以实现一个轻量级API网关。

先看网关的核心架构。路由配置是网关的"地图"，定义了每个路径前缀对应的后端服务及配置：

```python
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
import httpx, time, asyncio

ROUTES = {
    "/api/v1/users/{path:path}": {
        "target": "http://user-service:8001",
        "timeout": 5.0,
        "rate_limit": {"rps": 100, "burst": 200},
        "auth_required": True,
    },
    "/api/v1/orders/{path:path}": {
        "target": "http://order-service:8002",
        "timeout": 10.0,
        "rate_limit": {"rps": 50, "burst": 100},
        "auth_required": True,
    },
    "/api/v1/public/{path:path}": {
        "target": "http://content-service:8003",
        "timeout": 3.0,
        "rate_limit": {"rps": 200, "burst": 500},
        "auth_required": False,
    },
}
```

路由转发是网关最基本的职能。每个请求进来后，先匹配路由、再认证、再限流、最后转发：

```python
async def gateway_handler(request):
    path = request.url.path
    route_config = match_route(path)
    if not route_config:
        return JSONResponse(
            {"error": "Not Found", "path": path}, status_code=404
        )
    
    if route_config["auth_required"]:
        user = await verify_auth(request)
        if not user:
            return JSONResponse(
                {"error": "Unauthorized"}, status_code=401
            )
        request.state.user = user
    
    if not rate_limit_check(path, route_config["rate_limit"]):
        return JSONResponse(
            {"error": "Too Many Requests"}, status_code=429
        )
    
    return await forward_request(request, route_config)
```

认证逻辑，JWT验证后提取用户信息：

```python
import jwt

JWT_SECRET = "your-secret-key"

async def verify_auth(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        payload = jwt.decode(
            token, JWT_SECRET, algorithms=["HS256"]
        )
        return {
            "user_id": payload["sub"],
            "roles": payload.get("roles", []),
            "tenant_id": payload.get("tenant_id"),
        }
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
```

限流器用令牌桶算法实现。令牌桶的核心思想是"匀速生产、允许突发"，比固定窗口限流更优雅：

```python
import time
from collections import defaultdict

class TokenBucket:
    def __init__(self, rps: float, burst: int):
        self.rps = rps
        self.burst = burst
        self.tokens = float(burst)
        self.last_refill = time.monotonic()
    
    def consume(self, tokens: float = 1.0) -> bool:
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(
            self.burst, self.tokens + elapsed * self.rps
        )
        self.last_refill = now
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

buckets = defaultdict(lambda: None)

def rate_limit_check(path: str, config: dict) -> bool:
    if buckets[path] is None:
        buckets[path] = TokenBucket(
            rps=config["rps"], burst=config["burst"]
        )
    return buckets[path].consume()
```

> 令牌桶的核心思想是"匀速生产、允许突发"。它比固定窗口限流更优雅，比滑动窗口更简单。

请求转发用httpx做异步HTTP请求。注意要注入Trace Context，让链路追踪不断链：

```python
from opentelemetry.propagate import inject

_gateway_client = httpx.AsyncClient(
    limits=httpx.Limits(
        max_connections=100, max_keepalive_connections=20
    ),
)

async def forward_request(request, route_config):
    target_url = route_config["target"] + request.url.path
    if request.url.query:
        target_url += f"?{request.url.query}"
    
    headers = dict(request.headers)
    inject(headers)  # OpenTelemetry Context注入
    headers.pop("host", None)
    headers.pop("content-length", None)
    
    body = await request.body()
    try:
        response = await _gateway_client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
            timeout=route_config["timeout"],
        )
        return JSONResponse(
            content=response.json(),
            status_code=response.status_code,
        )
    except httpx.TimeoutException:
        return JSONResponse(
            {"error": "Gateway Timeout"}, status_code=504
        )
    except httpx.ConnectError:
        return JSONResponse(
            {"error": "Service Unavailable"}, status_code=503
        )
```

熔断器保护下游服务。当某个服务连续失败超过阈值时，熔断器打开，后续请求快速失败，不再调用下游：

```python
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_timeout=30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.state = CircuitState.CLOSED
        self.last_failure_time = 0
    
    def can_pass(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            elapsed = time.monotonic() - self.last_failure_time
            if elapsed > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                return True
            return False
        return True
    
    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED
        self.failures = 0
    
    def record_failure(self):
        self.failures += 1
        self.last_failure_time = time.monotonic()
        if self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN
```

最后组装成完整的ASGI应用。请求日志中间件记录每个请求的方法、路径、状态码和耗时：

```python
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start
        logger.info(
            "gateway_request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(duration * 1000, 2),
            client_ip=request.client.host if request.client else None,
        )
        return response

app = Starlette(
    routes=[Route("/{path:path}", gateway_handler,
              methods=["GET","POST","PUT","DELETE","PATCH"])],
    middleware=[Middleware(RequestLoggingMiddleware)],
)
```

> 自研网关的好处不是性能（Python网关性能够不上Kong），而是灵活。当你的路由规则复杂到配置文件写不下的时候，代码就是最好的配置。

### 4.4 网关踩坑实录

怕浪猫在自研网关的过程中踩过不少坑，分享几个印象深刻的。

第一个坑：httpx的连接池没复用。每次forward_request都创建新的AsyncClient，导致每个请求都新建TCP连接，性能很差。在QPS 1000的压测中，连接池没复用的版本CPU使用率是复用版本的3倍。解决方案是全局复用一个AsyncClient，如上面的代码所示。httpx的AsyncClient内部维护了连接池，复用连接可以避免TCP握手和TLS协商的开销。

第二个坑：超时设置一刀切。所有路由用同一个超时时间，结果慢接口（比如报表导出需要30秒）频繁超时，快接口（比如健康检查只需要1ms）被慢接口的连接占用拖累。解决方案是按路由配置超时，如上面的ROUTES配置所示，每个路由有自己的timeout。报表导出类接口单独设30秒，普通查询接口设3秒。

第三个坑：WebSocket代理被当成普通HTTP处理。WebSocket需要协议升级（101 Switching Protocols），普通HTTP转发逻辑处理不了。解决方案是检测Upgrade头，走WebSocket专用转发通道：

```python
async def websocket_proxy(ws, target_url):
    await ws.accept()
    async with websockets.connect(target_url) as target_ws:
        async def forward_to_target():
            async for msg in ws.iter_text():
                await target_ws.send(msg)
        async def forward_to_client():
            async for msg in target_ws:
                await ws.send_text(msg)
        await asyncio.gather(
            forward_to_target(), forward_to_client()
        )
```

第四个坑：令牌桶限流器在多进程部署下失效。因为令牌桶是进程内的状态，uvicorn多worker模式下每个worker各自限流，总流量是单桶的N倍。4个worker每个限流100QPS，实际总流量是400QPS。解决方案是用Redis做分布式令牌桶，用Lua脚本保证原子性：

```python
import redis

RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local rps = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local tokens = tonumber(redis.call('get', key) or burst)
local last = tonumber(redis.call('get', key..':t') or now)
tokens = math.min(burst, tokens + (now - last) * rps)
if tokens >= 1 then
    tokens = tokens - 1
    redis.call('set', key, tokens)
    redis.call('set', key..':t', now)
    return 1
else
    return 0
end
"""

def distributed_rate_limit(key, rps, burst):
    r = redis.Redis()
    result = r.eval(RATE_LIMIT_SCRIPT, 1, key, rps, burst, time.time())
    return bool(result)
```

第五个坑：网关本身的健康检查没做好。网关挂了，所有服务都不可用。解决方案是网关部署多个实例，前面用负载均衡器（如Nginx或云厂商SLB）做健康检查。同时网关自身要暴露/health端点，返回依赖服务的健康状态，让负载均衡器能准确判断网关是否可用。

第六个坑：网关升级时没做优雅停机。新版本上线，旧进程直接被kill，正在处理的请求直接失败。解决方案是在网关收到SIGTERM信号后，停止接受新请求，等已有请求处理完成后再退出。uvicorn可以通过--timeout-keepalive和graceful shutdown配置实现：

```python
import signal, asyncio

shutdown_event = asyncio.Event()

def handle_shutdown(signum, frame):
    shutdown_event.set()

signal.signal(signal.SIGTERM, handle_shutdown)

# 等待已有请求完成
async def graceful_shutdown():
    await shutdown_event.wait()
    # 停止接受新请求
    # 等待活跃请求完成（最多等30秒）
    # 清理资源
```

> 分布式系统里，任何只在单进程内维护的状态都是定时炸弹。限流、计数、缓存，都要考虑多进程一致性问题。

### 4.5 网关与可观测性的整合

网关作为流量入口，天然是可观测性数据的重要采集点。把前面三节的内容整合起来，一个完整的可观测性网关应该具备以下能力。

第一，链路追踪自动注入。网关创建根Span，生成Trace ID后通过Context Propagation传给下游服务。前端请求不需要携带任何Trace信息，网关自动处理。这样即使前端没有接入OpenTelemetry，后端的调用链也是完整的。但有一个细节要注意：如果前端也接入了OpenTelemetry，网关应该提取前端传入的Trace Context，而不是创建新的根Span。这样从用户点击按钮到最终返回的完整链路都能追踪到。

第二，结构化请求日志。每个请求的method、path、status、latency、client_ip、user_id都记录到结构化日志中，且带上trace_id。这样你在日志系统里搜一个trace_id，就能看到这个请求从网关到后端的所有日志。日志里还应该包含请求大小、响应大小和重试次数，这些信息在排查性能问题时非常有用。

第三，指标自动采集。QPS、延迟分布、错误率、限流拒绝数等指标自动采集并暴露到/metrics端点。Grafana面板直接查询这些指标做可视化。除了通用HTTP指标，网关还应该采集网关特有的指标：路由匹配耗时、转发连接池使用率、熔断器状态、缓存命中率（如果网关有缓存层）。这些指标能帮助你判断网关本身是否健康，是否需要扩容。

第四，统一错误处理。网关应该给客户端返回统一格式的错误响应，不管错误来自网关本身还是后端服务。后端服务返回的500错误不应该直接透传给客户端，而是由网关包装成统一的错误格式。这样前端的错误处理逻辑可以统一，不需要针对不同服务写不同的错误处理代码。统一错误格式至少包含error_code、message和trace_id三个字段，前端可以拿trace_id找后端排查问题。

这三者的关系是：指标告诉你"有异常"，链路追踪告诉你"在哪"，日志告诉你"是什么"。缺了任何一环，排查问题都会缺一块。比如指标显示错误率升高，你打开Jaeger看异常链路，发现是订单服务调库存服务超时。然后你拿trace_id去日志系统搜，看到库存服务当时的日志记录了数据库连接池耗尽的ERROR。完整的排查路径：指标 -> 链路 -> 日志，三步定位问题。

来一个整合视角的可观测性清单：

| 可观测性维度 | 回答的问题 | 核心数据 | 工具链 |
|------------|---------|--------|-------|
| 指标监控 | 系统整体健康吗？ | QPS/延迟/错误率 | Prometheus + Grafana |
| 链路追踪 | 单个请求经历了什么？ | Trace树/Span属性 | OpenTelemetry + Jaeger |
| 结构化日志 | 具体发生了什么？ | 事件/上下文/Trace ID | structlog + ELK/Loki |

> 可观测性的三根支柱不是三个孤岛，而是通过Trace ID这个"纽带"连在一起的。Trace ID串起链路和日志，指标告诉你该看哪条链路。

## 五、总结与实践清单

这章内容很多，怕浪猫最后给你整理一份落地清单，按优先级排序，你照着做就行。

第一步：接入结构化日志。这是成本最低、收益最快的一步。把print和logging.info换成structlog，日志输出JSON格式，立刻就能在日志系统里搜索和过滤。预计工作量：1-2天。

第二步：接入指标监控。用prometheus_client在应用里埋点，至少暴露HTTP请求的QPS、延迟分布和错误率。配合Grafana做可视化面板。预计工作量：2-3天。

第三步：接入链路追踪。OpenTelemetry SDK加自动instrumentation，给每个请求打上Trace ID，注入到日志里。这一步完成后，你就有了完整的可观测性三角。预计工作量：3-5天。注意自动instrumentation虽然方便，但也要检查是否有遗漏的场景需要手动埋点。比如你用了Celery做异步任务，OpenTelemetry的自动instrumentation可能不覆盖，需要手动在任务执行时创建Span。

第四步：搭建API网关。如果服务数量超过3个，就该上网关了。先用Kong或APISIX满足需求，特殊需求再考虑自研。预计工作量：1-2周。选型时要考虑团队技术栈和运维能力，不要盲目追求新潮。

第五步：配置采样策略。流量增长后全量采集成本太高，配置尾部采样，只保留异常链路和少量正常链路。预计工作量：1天。尾部采样需要在OTel Collector上配置，确保Collector有足够的内存缓存等待中的链路。

第六步：网关可观测性整合。网关作为流量入口，是采集可观测性数据的最佳位置。在这里统一注入Trace、记录日志、采集指标。预计工作量：2-3天。整合完成后，你可以在一个面板上看到全局流量分布、错误率趋势、P99延迟变化，配合链路追踪和日志下钻，形成完整的排查闭环。

> 可观测性不是一次性的项目，而是持续演进的工程。先解决"有没有"，再解决"好不好"。

这篇文章如果对你有帮助，点个收藏，后面写代码的时候翻出来照着抄就行。有什么问题或者踩坑经验，评论区聊聊。可观测性这个话题，每个团队都有故事，怕浪猫也想听听你们是怎么做的。

系列进度 10/16。下一章我们进入分布式基础与缓存系统，聊聊分布式锁、分布式事务、缓存策略这些进阶话题。从单机到分布式的跨越，坑只会更多，怕浪猫带你一个个踩过去。

怕浪猫说：可观测性就像给系统装了摄像头和传感器，出了问题你不用猜，数据会告诉你答案。但记住，工具只是手段，真正值钱的是你对系统的理解力。装了摄像头不会自动破案，得有人看。
