# 第10章：可观测性 + 微服务实战项目——从链路追踪到订单系统落地

凌晨三点，生产环境炸了。用户下单失败，但你的日志分散在七八个服务里，请求像进了黑洞一样有去无回。你打开Grafana，指标曲线一马平川——因为根本没人埋点。你盯着满屏的println发呆，心想：如果当初把可观测性做好，现在至少知道该骂哪个服务。

我是怕浪猫，一个在生产事故中摸爬滚打多年的Go开发者。这一章，我把可观测性体系建设和微服务实战掰开揉碎讲给你听。从链路追踪到指标监控，从日志聚合到手写RPC框架，最后落地一个完整的订单系统。内容很硬，建议带水。

## 一、分布式链路追踪：让请求的每一步都可见

### 1.1 为什么需要链路追踪

单体应用时代，一个请求的处理逻辑都在一个进程里，打个断点就能看清楚调用栈。但微服务架构下，一个用户下单请求可能经过网关、用户服务、商品服务、订单服务、支付服务，每个服务又可能调用数据库、缓存、MQ。任何一个环节出问题，都会导致整个请求失败。

> 链路追踪不是奢侈品，是微服务的急救箱。没有它，排查线上问题就像蒙眼拆弹。

链路追踪的核心价值在于：它能让你看到一个请求从进入到完成，经过了哪些服务、每个服务耗时多少、在哪里出了错。这是微服务可观测性的第一块拼图。

### 1.2 核心概念：Trace、Span、Baggage

链路追踪有三个核心概念，理解了这三个，后面的实现都是围绕它们转的。

**Trace（链路）**

一个Trace代表一次完整的请求链路，从用户发起请求到最终响应返回的全过程。每个Trace有一个全局唯一的TraceID。

**Span（跨度）**

Span是链路中的一个工作单元，代表一次操作。比如一次HTTP调用、一次数据库查询、一次RPC调用都是一个Span。每个Span包含：

- 操作名称（Operation Name）
- 开始时间和结束时间
- 一组标签（Tags），用于描述Span的属性
- 一组事件（Events），记录Span生命周期内的重要时刻
- SpanContext，包含TraceID和SpanID

Span之间有父子关系，通过ParentSpanID串联，最终形成一棵调用树。

**Baggage（行李）**

Baggage是跨服务传递的键值对数据，可以在链路中的任意Span设置，然后向下游传播。比如可以在网关层设置user-id，下游所有服务都能从Baggage中读取。

> Trace是树干，Span是树枝，Baggage是挂在树枝上的行李箱——带着上下文一路传递。

来段代码直观感受一下这些概念在OpenTelemetry中的体现：

```go
package main

import (
    "context"
    "fmt"
    "log"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/codes"
    "go.opentelemetry.io/otel/trace"
)

func processOrder(ctx context.Context, orderID string) error {
    tracer := otel.Tracer("order-service")

    ctx, span := tracer.Start(ctx, "processOrder",
        trace.WithAttributes(
            attribute.String("order.id", orderID),
        ),
    )
    defer span.End()

    if err := validateOrder(ctx, orderID); err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }

    if err := saveOrder(ctx, orderID); err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }

    span.AddEvent("order processed successfully")
    return nil
}

func validateOrder(ctx context.Context, orderID string) error {
    tracer := otel.Tracer("order-service")
    _, span := tracer.Start(ctx, "validateOrder")
    defer span.End()

    if orderID == "" {
        return fmt.Errorf("order ID is empty")
    }
    return nil
}

func saveOrder(ctx context.Context, orderID string) error {
    tracer := otel.Tracer("order-service")
    _, span := tracer.Start(ctx, "saveOrder",
        trace.WithAttributes(attribute.String("db.operation", "INSERT")),
    )
    defer span.End()

    log.Printf("saving order %s", orderID)
    return nil
}
```

这段代码展示了最基本的用法：在函数入口创建Span，通过context.Context传递，子函数创建的Span会自动成为父Span的子Span。错误通过RecordError记录，状态通过SetStatus设置。

### 1.3 OpenTelemetry标准

OpenTelemetry（简称OTel）是CNCF的顶级项目，由OpenTracing和OpenCensus合并而来。它提供了一套统一的可观测性标准，包括API、SDK和数据格式。

> 在OpenTelemetry之前，可观测性领域是"春秋战国"——Jaeger、Zipkin、SkyWalking各搞各的，换个追踪系统就得改代码。OTel的出现终结了这种割裂，让你写一次埋点，数据发到哪都行。

OpenTelemetry的核心组件：

**API层**：定义了Trace、Metric、Log的接口规范，业务代码只依赖API层。

**SDK层**：API的具体实现，负责Span的创建、采样、导出等。

**Exporter（导出器）**：将数据导出到后端，支持Jaeger、Zipkin、Prometheus、OTLP等多种格式。

**Collector（收集器）**：可选的中间组件，负责接收、处理和导出数据，可以做采样、过滤、聚合等操作。

架构图大致是这样的：

```
应用代码 -> OTel API -> OTel SDK -> Exporter -> Collector -> 后端(Jaeger/Prometheus/Loki)
```

在Go中初始化OpenTelemetry的代码模板：

```go
package tracing

import (
    "context"
    "fmt"
    "time"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
    "go.opentelemetry.io/otel/trace"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"
)

// InitTracer 初始化链路追踪
func InitTracer(serviceName, collectorAddr string) (func(context.Context) error, error) {
    conn, err := grpc.Dial(collectorAddr,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create gRPC connection: %w", err)
    }

    exporter, err := otlptracegrpc.New(context.Background(),
        otlptracegrpc.WithGRPCConn(conn),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create trace exporter: %w", err)
    }

    res, err := resource.New(context.Background(),
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion("1.0.0"),
            semconv.DeploymentEnvironment("production"),
        ),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create resource: %w", err)
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter,
            sdktrace.WithBatchTimeout(5*time.Second),
            sdktrace.WithMaxExportBatchSize(512),
        ),
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.TraceIDRatioBased(0.5)),
    )

    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))

    return tp.Shutdown, nil
}
```

> 初始化代码看着长，但核心就三步：建导出器、建资源、建TracerProvider。剩下的都是参数调优。

### 1.4 采样策略与性能优化

在生产环境中，如果每个请求都记录全量链路，数据量会非常惊人。假设你的系统QPS是1万，每个请求平均产生10个Span，一天就是86亿个Span。这个数据量，存储扛不住，查询也慢。

采样策略就是解决这个问题的。常见的采样策略有：

**头采样（Head Sampling）**

在链路入口处决定是否采样，一旦决定采样，整条链路都会被记录；决定不采样，整条链路都不记录。

优点：实现简单，下游服务无需做采样决策。

缺点：无法根据链路特征动态决策。比如一个请求在入口处被判定不采样，但下游某个服务出了错，这个错误链路就丢失了。

**尾采样（Tail Sampling）**

在链路结束后，根据整条链路的特征决定是否采样。比如只采样出错链路、慢请求链路。

优点：可以精确控制采样哪些链路，保留有价值的数据。

缺点：需要在内存中缓存完整的链路数据，内存开销大；决策有延迟。

> 头采样像盲盒——开之前不知道里面有啥；尾采样像事后诸葛亮——看完全程再决定要不要记录。各有各的场。

下面是一个自定义采样器的实现，结合了头采样和错误采样：

```go
package tracing

import (
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/trace"
)

type CustomSampler struct {
    ratioSampler sdktrace.Sampler
}

func NewCustomSampler(ratio float64) *CustomSampler {
    return &CustomSampler{
        ratioSampler: sdktrace.TraceIDRatioBased(ratio),
    }
}

func (s *CustomSampler) ShouldSample(p sdktrace.SamplingParameters) sdktrace.SamplingResult {
    if p.ParentContext == (trace.SpanContext{}) {
        return s.ratioSampler.ShouldSample(p)
    }
    return sdktrace.SamplingResult{
        Decision: sdktrace.RecordAndSample,
    }
}

func (s *CustomSampler) Description() string {
    return "CustomSampler{ratio-based head sampling}"
}
```

除了采样策略，还有几个性能优化技巧：

**批量导出**：不要每个Span都发一次网络请求，攒一批再发。OTel SDK默认就是批量导出。

**异步导出**：导出操作不阻塞业务线程，SDK内部用了异步队列。

**Span数量控制**：不是所有操作都需要创建Span。对于热点路径上的高频操作，可以只记录指标不创建Span。

**合理设置Span属性**：属性不是越多越好，只记录有诊断价值的属性。

## 二、实现分布式链路追踪中间件

光有理论不行，得落地。这一节我们实现一个完整的链路追踪中间件，支持HTTP和gRPC，能自动注入和提取TraceID。

### 2.1 HTTP链路追踪中间件

```go
package middleware

import (
    "net/http"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/trace"
)

func HTTPTraceMiddleware(serviceName string) func(http.Handler) http.Handler {
    tracer := otel.Tracer(serviceName)
    propagator := otel.GetTextMapPropagator()

    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            ctx := propagator.Extract(r.Context(), propagation.HeaderCarrier(r.Header))

            spanName := r.Method + " " + r.URL.Path
            ctx, span := tracer.Start(ctx, spanName,
                trace.WithSpanKind(trace.SpanKindServer),
                trace.WithAttributes(
                    attribute.String("http.method", r.Method),
                    attribute.String("http.url", r.URL.String()),
                    attribute.String("http.host", r.Host),
                ),
            )
            defer span.End()

            r = r.WithContext(ctx)

            wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}
            next.ServeHTTP(wrapped, r)

            span.SetAttributes(attribute.Int("http.status_code", wrapped.status))
            if wrapped.status >= 400 {
                span.SetAttributes(attribute.Bool("error", true))
            }
        })
    }
}

type responseWriter struct {
    http.ResponseWriter
    status int
}

func (rw *responseWriter) WriteHeader(code int) {
    rw.status = code
    rw.ResponseWriter.WriteHeader(code)
}
```

> 中间件的本质就是"洋葱模型"——请求进来一层层剥开，响应出去一层层包上。链路追踪中间件负责在最外层套上TraceID。

### 2.2 gRPC链路追踪拦截器

gRPC的链路追踪通过拦截器实现，分为客户端拦截器和服务端拦截器：

```go
package interceptor

import (
    "context"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/codes"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/trace"
    "google.golang.org/grpc"
    "google.golang.org/grpc/metadata"
    "google.golang.org/grpc/status"
)

func UnaryServerTraceInterceptor(serviceName string) grpc.UnaryServerInterceptor {
    tracer := otel.Tracer(serviceName)
    propagator := otel.GetTextMapPropagator()

    return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
        if md, ok := metadata.FromIncomingContext(ctx); ok {
            ctx = propagator.Extract(ctx, metadataCarrier(md))
        }

        ctx, span := tracer.Start(ctx, info.FullMethod,
            trace.WithSpanKind(trace.SpanKindServer),
            trace.WithAttributes(
                attribute.String("rpc.system", "grpc"),
                attribute.String("rpc.method", info.FullMethod),
            ),
        )
        defer span.End()

        resp, err := handler(ctx, req)
        if err != nil {
            span.RecordError(err)
            span.SetStatus(codes.Error, err.Error())
            s, _ := status.FromError(err)
            span.SetAttributes(attribute.String("rpc.grpc.status_code", s.Code().String()))
        }
        return resp, err
    }
}

func UnaryClientTraceInterceptor() grpc.UnaryClientInterceptor {
    tracer := otel.Tracer("grpc-client")
    propagator := otel.GetTextMapPropagator()

    return func(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
        ctx, span := tracer.Start(ctx, method,
            trace.WithSpanKind(trace.SpanKindClient),
            trace.WithAttributes(
                attribute.String("rpc.system", "grpc"),
                attribute.String("rpc.method", method),
            ),
        )
        defer span.End()

        md := metadata.New(nil)
        propagator.Inject(ctx, metadataCarrier(md))
        ctx = metadata.AppendToOutgoingContext(ctx, md...)

        err := invoker(ctx, method, req, reply, cc, opts...)
        if err != nil {
            span.RecordError(err)
            span.SetStatus(codes.Error, err.Error())
        }
        return err
    }
}

type metadataCarrier metadata.MD

func (mc metadataCarrier) Get(key string) string {
    values := metadata.MD(mc).Get(key)
    if len(values) == 0 {
        return ""
    }
    return values[0]
}

func (mc metadataCarrier) Set(key, value string) {
    metadata.MD(mc).Set(key, value)
}

func (mc metadataCarrier) Keys() []string {
    keys := make([]string, 0, len(mc))
    for k := range mc {
        keys = append(keys, k)
    }
    return keys
}
```

> 记住一个原则：客户端注入，服务端提取。链路信息就像接力棒，从客户端传到服务端，一棒接一棒。

## 三、指标监控：用数据说话

### 3.1 Metrics类型详解

链路追踪告诉你"一次请求经历了什么"，指标监控告诉你"系统整体的状态是什么"。Prometheus定义了四种Metrics类型，每种都有特定的用途。

**Counter（计数器）**

Counter是一个只增不减的计数器。适用于记录请求总数、错误总数、订单总数等单调递增的指标。

> Counter就像出租车的计价器——只能往上跳，不能往下掉（除非重启归零）。

```go
httpRequestsTotal := promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "http_requests_total",
        Help: "Total number of HTTP requests",
    },
    []string{"method", "path", "status"},
)
httpRequestsTotal.WithLabelValues("GET", "/api/orders", "200").Inc()
```

**Gauge（仪表盘）**

Gauge是一个可增可减的值。适用于记录当前连接数、内存使用量、队列长度等瞬时值。

```go
activeConnections := promauto.NewGaugeVec(
    prometheus.GaugeOpts{
        Name: "active_connections",
        Help: "Number of active connections",
    },
    []string{"service"},
)
activeConnections.WithLabelValues("order-service").Inc()
activeConnections.WithLabelValues("order-service").Dec()
activeConnections.WithLabelValues("order-service").Set(42)
```

**Histogram（直方图）**

Histogram将数据分到不同的桶中统计分布。适用于记录请求延迟、响应大小等分布型数据。

```go
requestDuration := promauto.NewHistogramVec(
    prometheus.HistogramOpts{
        Name:    "http_request_duration_seconds",
        Help:    "HTTP request duration in seconds",
        Buckets: []float64{0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
    },
    []string{"method", "path"},
)
requestDuration.WithLabelValues("GET", "/api/orders").Observe(0.035)
```

**Summary（摘要）**

Summary和Histogram类似，但它在客户端直接计算分位数。适用于需要精确分位数的场景。

> Histogram和Summary的选择原则：如果要在服务端聚合计算分位数，用Histogram；如果只需要客户端分位数，用Summary。大多数场景推荐Histogram。

### 3.2 四种Metrics类型对比

| 特性 | Counter | Gauge | Histogram | Summary |
|------|---------|-------|-----------|---------|
| 可增 | 是 | 是 | 是 | 是 |
| 可减 | 否 | 是 | 否 | 否 |
| 典型场景 | 请求总数 | 当前连接数 | 请求延迟 | 精确分位数 |
| 服务端聚合 | 支持 | 支持 | 支持 | 不支持 |
| 存储开销 | 低 | 低 | 中 | 高 |

### 3.3 Prometheus集成与指标收集

Prometheus采用拉模式采集指标，服务端主动从应用暴露的/metrics端点拉取数据。

```go
package monitoring

import (
    "net/http"
    "time"

    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
    HttpRequestTotal    *prometheus.CounterVec
    HttpRequestDuration *prometheus.HistogramVec
    HttpRequestInFlight *prometheus.GaugeVec
    GrpcRequestTotal    *prometheus.CounterVec
    GrpcRequestDuration *prometheus.HistogramVec
    DBQueryDuration     *prometheus.HistogramVec
}

func NewMetrics(serviceName string) *Metrics {
    return &Metrics{
        HttpRequestTotal: promauto.NewCounterVec(
            prometheus.CounterOpts{
                Name:        "http_requests_total",
                Help:        "Total number of HTTP requests",
                ConstLabels: prometheus.Labels{"service": serviceName},
            },
            []string{"method", "path", "status"},
        ),
        HttpRequestDuration: promauto.NewHistogramVec(
            prometheus.HistogramOpts{
                Name:        "http_request_duration_seconds",
                Help:        "HTTP request duration in seconds",
                Buckets:     []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
                ConstLabels: prometheus.Labels{"service": serviceName},
            },
            []string{"method", "path"},
        ),
        HttpRequestInFlight: promauto.NewGaugeVec(
            prometheus.GaugeOpts{
                Name:        "http_requests_in_flight",
                Help:        "Number of HTTP requests in flight",
                ConstLabels: prometheus.Labels{"service": serviceName},
            },
            []string{"method"},
        ),
        GrpcRequestTotal: promauto.NewCounterVec(
            prometheus.CounterOpts{
                Name:        "grpc_requests_total",
                Help:        "Total number of gRPC requests",
                ConstLabels: prometheus.Labels{"service": serviceName},
            },
            []string{"method", "code"},
        ),
        GrpcRequestDuration: promauto.NewHistogramVec(
            prometheus.HistogramOpts{
                Name:        "grpc_request_duration_seconds",
                Help:        "gRPC request duration in seconds",
                Buckets:     []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
                ConstLabels: prometheus.Labels{"service": serviceName},
            },
            []string{"method"},
        ),
        DBQueryDuration: promauto.NewHistogramVec(
            prometheus.HistogramOpts{
                Name:        "db_query_duration_seconds",
                Help:        "Database query duration in seconds",
                Buckets:     []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
                ConstLabels: prometheus.Labels{"service": serviceName},
            },
            []string{"operation", "table"},
        ),
    }
}

func (m *Metrics) Handler() http.Handler {
    return promhttp.Handler()
}

func (m *Metrics) HTTPMetricsMiddleware() func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            m.HttpRequestInFlight.WithLabelValues(r.Method).Inc()
            defer m.HttpRequestInFlight.WithLabelValues(r.Method).Dec()

            wrapped := &statusWriter{ResponseWriter: w, status: 200}
            next.ServeHTTP(wrapped, r)

            m.HttpRequestTotal.WithLabelValues(r.Method, r.URL.Path, http.StatusText(wrapped.status)).Inc()
            m.HttpRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(time.Since(start).Seconds())
        })
    }
}

type statusWriter struct {
    http.ResponseWriter
    status int
}

func (sw *statusWriter) WriteHeader(code int) {
    sw.status = code
    sw.ResponseWriter.WriteHeader(code)
}
```

> 指标定义不是越多越好。每个指标都要回答一个问题：这个指标能帮我发现什么问题？如果答不上来，就别加。

### 3.4 指标采集清单

一个完整的微服务系统，至少要采集以下几层指标：

1. HTTP层：请求总数、请求延迟、在途请求数、响应状态码分布
2. RPC层：请求总数、请求延迟、错误率、重试次数
3. 数据库层：查询延迟、连接池使用率、慢查询数
4. 缓存层：命中率、操作延迟、缓存大小
5. 消息队列：生产延迟、消费延迟、积压量、消费失败数
6. 系统层：CPU使用率、内存使用量、GC耗时、Goroutine数
7. 业务层：订单创建数、支付成功率、库存扣减失败数

## 四、日志聚合：让日志不再是一盘散沙

### 4.1 结构化日志设计

日志是最古老的可观测性手段，但也是最容易写烂的。一行`fmt.Println("something happened")`在生产环境毫无价值——你不知道是谁打的、什么时候打的、上下文是什么。

> 好日志应该像新闻要素一样：Who、What、When、Where、Why、How。缺了任何一个要素，排查问题就像拼图少了关键一块。

结构化日志就是把日志写成JSON格式，每条日志都是一个JSON对象，字段名固定，值有类型。这样机器可以解析，人也容易阅读。

```go
package logging

import (
    "context"
    "encoding/json"
    "io"
    "log/slog"
    "os"
    "time"

    "go.opentelemetry.io/otel/trace"
)

// SetupLogger 初始化结构化日志器
func SetupLogger(serviceName, env string) *slog.Logger {
    var handler slog.Handler

    if env == "production" {
        // 生产环境用JSON格式
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level:     slog.LevelInfo,
            AddSource: true,
        })
    } else {
        // 开发环境用文本格式，方便阅读
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
            Level:     slog.LevelDebug,
            AddSource: true,
        })
    }

    // 包装handler，自动注入trace_id和span_id
    wrapped := &traceHandler{handler: handler}

    return slog.New(wrapped).With(
        slog.String("service", serviceName),
        slog.String("env", env),
    )
}

// traceHandler 包装slog.Handler，自动注入链路信息
type traceHandler struct {
    handler slog.Handler
}

func (h *traceHandler) Enabled(ctx context.Context, level slog.Level) bool {
    return h.handler.Enabled(ctx, level)
}

func (h *traceHandler) Handle(ctx context.Context, record slog.Record) error {
    // 从context中提取trace信息
    spanCtx := trace.SpanContextFromContext(ctx)
    if spanCtx.IsValid() {
        record.AddAttrs(
            slog.String("trace_id", spanCtx.TraceID().String()),
            slog.String("span_id", spanCtx.SpanID().String()),
        )
    }
    return h.handler.Handle(ctx, record)
}

func (h *traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
    return &traceHandler{handler: h.handler.WithAttrs(attrs)}
}

func (h *traceHandler) WithGroup(name string) slog.Handler {
    return &traceHandler{handler: h.handler.WithGroup(name)}
}
```

这段代码用Go 1.21+的`slog`包实现了结构化日志，并自动将TraceID和SpanID注入到每条日志中。这样你在日志系统中搜索TraceID，就能看到一次请求的所有日志，在链路追踪系统中看到同一TraceID的调用链，两者联动，排查效率翻倍。

> 日志和链路追踪联动的前提是：每条日志都带上TraceID。没有TraceID的日志就像没有名字的人——你没法把它和具体的请求关联起来。

### 4.2 日志收集与聚合方案

单个服务的日志写到本地文件还不够，需要收集到中心化的日志系统中。主流方案有三种：

**方案一：ELK（Elasticsearch + Logstash + Kibana）**

ELK是老牌的日志方案。Logstash或Filebeat负责收集日志，Elasticsearch负责存储和搜索，Kibana负责可视化。

优点：生态成熟，搜索能力强，Kibana的Dashboard功能丰富。

缺点：Elasticsearch资源消耗大，特别是内存；日志量大了之后查询会变慢。

**方案二：Loki + Grafana**

Loki是Grafana Labs出的日志系统，定位是"像Prometheus一样的日志系统"。它只索引日志的标签（Label），不索引日志内容，所以存储成本远低于Elasticsearch。

优点：存储成本低，与Prometheus和Grafana无缝集成，查询用LogQL语法和PromQL类似。

缺点：全文搜索能力弱于Elasticsearch，不适合复杂的日志分析场景。

**方案三：OpenTelemetry Collector + 任意后端**

用OTel Collector作为日志收集中间件，后端可以是Loki、Elasticsearch、Scribe等。这是最灵活的方案，也是未来的趋势。

> 选型的核心问题是：你的日志量有多大？需不需要全文搜索？如果日志量大但搜索需求简单，Loki性价比最高；如果需要复杂搜索，ELK更合适。

### 4.3 ELK/Loki集成

下面展示如何在Go应用中集成Loki，通过Promtail收集日志：

```go
package logging

import (
    "context"
    "log/slog"
    "os"
    "sync"
)

// LokiWriter 向Loki推送日志的writer
// 实际生产中通常用Promtail或 Alloy收集本地日志文件
// 这里展示的是直接推送的方式，适用于不想部署额外agent的场景
type LokiWriter struct {
    mu     sync.Mutex
    labels map[string]string
    // 实际实现中这里会是HTTP client，指向Loki的push API
}

func NewLokiWriter(labels map[string]string) *LokiWriter {
    return &LokiWriter{labels: labels}
}

func (lw *LokiWriter) Write(p []byte) (n int, err error) {
    // 实际实现中，这里会将日志行批量发送到Loki的/push endpoint
    // 格式为: {stream: {labels}, values: [[timestamp, log_line]]}
    // 简化实现，仅输出到stdout作为示例
    os.Stdout.Write(p)
    return len(p), nil
}

// SetupLokiLogger 配置输出到Loki的日志器
func SetupLokiLogger(serviceName, env string) *slog.Logger {
    labels := map[string]string{
        "service": serviceName,
        "env":     env,
    }

    writer := NewLokiWriter(labels)
    handler := slog.NewJSONHandler(writer, &slog.HandlerOptions{
        Level:     slog.LevelInfo,
        AddSource: true,
    })

    wrapped := &traceHandler{handler: handler}
    return slog.New(wrapped)
}
```

实际生产中，更常见的做法是日志写到本地文件，然后用Promtail收集：

```yaml
# promtail.yml - Promtail配置示例
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: go-services
    static_configs:
      - targets: [localhost]
        labels:
          job: go-services
          env: production
          __path__: /var/log/go/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            service: service
            trace_id: trace_id
            msg: msg
            time: time
      - labels:
          level:
          service:
          trace_id:
```

这个Promtail配置会收集`/var/log/go/*.log`下的所有日志文件，解析JSON格式，并将level、service、trace_id提取为标签。这样在Loki中就可以通过`{service="order-service"}`或`{trace_id="abc123"}`来过滤日志。

## 五、实战项目：微服务框架实现订单系统

前面讲了链路追踪、指标监控、日志聚合三大支柱，现在是时候把它们整合起来，做一个完整的微服务实战项目了。

### 5.1 项目整体架构

我们要实现一个微服务订单系统，包含以下组件：

- RPC框架：基于gRPC，支持Protobuf序列化
- 服务注册与发现：基于Etcd
- 客户端负载均衡：轮询、随机、加权轮询
- 熔断降级：基于滑动窗口的熔断器
- 链路追踪：OpenTelemetry
- 指标监控：Prometheus
- 日志聚合：结构化日志 + Loki

系统包含三个服务：

- 用户服务（user-service）：用户注册、登录、查询
- 商品服务（product-service）：商品查询、库存管理
- 订单服务（order-service）：创建订单、查询订单

> 架构不是画出来的，是迭代出来的。先用最简版本跑通全链路，再逐步加功能。一上来就追求完美架构，往往连第一版都出不来。

### 5.2 设计RPC框架（支持Protobuf）

先定义Protobuf协议：

```protobuf
// proto/user.proto
syntax = "proto3";
package user.v1;
option go_package = "github.com/palangcat/order-system/proto/user/v1;userv1";

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
}

message GetUserRequest {
  string user_id = 1;
}

message GetUserResponse {
  string user_id = 1;
  string username = 2;
  string email = 3;
  int64 created_at = 4;
}

message CreateUserRequest {
  string username = 1;
  string email = 2;
  string password = 3;
}

message CreateUserResponse {
  string user_id = 1;
}
```

```protobuf
// proto/product.proto
syntax = "proto3";
package product.v1;
option go_package = "github.com/palangcat/order-system/proto/product/v1;productv1";

service ProductService {
  rpc GetProduct(GetProductRequest) returns (GetProductResponse);
  rpc DeductStock(DeductStockRequest) returns (DeductStockResponse);
}

message GetProductRequest {
  string product_id = 1;
}

message GetProductResponse {
  string product_id = 1;
  string name = 2;
  string description = 3;
  int64 price_cents = 4;
  int32 stock = 5;
}

message DeductStockRequest {
  string product_id = 1;
  int32 quantity = 2;
}

message DeductStockResponse {
  bool success = 1;
  string message = 2;
}
```

```protobuf
// proto/order.proto
syntax = "proto3";
package order.v1;
option go_package = "github.com/palangcat/order-system/proto/order/v1;orderv1";

service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
  rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
}

message CreateOrderRequest {
  string user_id = 1;
  string product_id = 2;
  int32 quantity = 3;
}

message CreateOrderResponse {
  string order_id = 1;
  string status = 2;
}

message GetOrderRequest {
  string order_id = 1;
}

message GetOrderResponse {
  string order_id = 1;
  string user_id = 2;
  string product_id = 3;
  int32 quantity = 4;
  int64 total_cents = 5;
  string status = 6;
  int64 created_at = 7;
}
```

RPC框架核心代码：

```go
package rpc

import (
    "context"
    "fmt"
    "log/slog"
    "net"
    "time"

    "github.com/palangcat/order-system/interceptor"
    "github.com/palangcat/order-system/registry"
    "google.golang.org/grpc"
    "google.golang.org/grpc/health"
    "google.golang.org/grpc/health/grpc_health_v1"
)

// Server RPC服务端
type Server struct {
    grpcServer *grpc.Server
    serviceID  string
    serviceName string
    addr       string
    registry   registry.Registry
    logger     *slog.Logger
}

type ServerOption func(*Server)

func WithServiceID(id string) ServerOption {
    return func(s *Server) { s.serviceID = id }
}

func WithLogger(logger *slog.Logger) ServerOption {
    return func(s *Server) { s.logger = logger }
}

// NewServer 创建RPC服务端
func NewServer(serviceName, addr string, reg registry.Registry, opts ...ServerOption) *Server {
    s := &Server{
        serviceName: serviceName,
        addr:        addr,
        registry:    reg,
        serviceID:   serviceName + "-" + addr,
        logger:      slog.Default(),
    }

    for _, opt := range opts {
        opt(s)
    }

    // 创建gRPC Server，注册拦截器
    s.grpcServer = grpc.NewServer(
        grpc.ChainUnaryInterceptor(
            interceptor.UnaryServerTraceInterceptor(serviceName),
            interceptor.UnaryRecoveryInterceptor(s.logger),
            interceptor.UnaryLoggingInterceptor(s.logger),
        ),
    )

    // 注册健康检查
    healthCheck := health.NewServer()
    grpc_health_v1.RegisterHealthServer(s.grpcServer, healthCheck)

    return s
}

// RegisterService 注册gRPC服务
func (s *Server) RegisterService(desc *grpc.ServiceDesc, impl interface{}) {
    s.grpcServer.RegisterService(desc, impl)
}

// Start 启动服务
func (s *Server) Start(ctx context.Context) error {
    lis, err := net.Listen("tcp", s.addr)
    if err != nil {
        return fmt.Errorf("failed to listen: %w", err)
    }

    // 服务注册
    instance := &registry.ServiceInstance{
        ID:        s.serviceID,
        Name:      s.serviceName,
        Address:   s.addr,
        Metadata:  map[string]string{"protocol": "grpc"},
    }
    if err := s.registry.Register(ctx, instance); err != nil {
        return fmt.Errorf("failed to register service: %w", err)
    }

    s.logger.Info("server started",
        slog.String("service", s.serviceName),
        slog.String("addr", s.addr),
    )

    go func() {
        <-ctx.Done()
        s.grpcServer.GracefulStop()
        s.registry.Deregister(context.Background(), instance)
    }()

    return s.grpcServer.Serve(lis)
}

// Client RPC客户端，支持服务发现和负载均衡
type Client struct {
    conn       *grpc.ClientConn
    logger     *slog.Logger
}

func NewClient(serviceName string, reg registry.Registry, opts ...ClientOption) (*Client, error) {
    clientOpts := &clientOptions{
        timeout:    5 * time.Second,
        maxRetries: 3,
        logger:     slog.Default(),
    }
    for _, opt := range opts {
        opt(clientOpts)
    }

    // 使用自定义resolver，从服务注册中心获取实例列表
    resolver := registry.NewResolver(reg, serviceName)
    balancer := grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"round_robin"}`)

    conn, err := grpc.Dial(
        resolver.Target(),
        grpc.WithResolvers(resolver),
        balancer,
        grpc.WithUnaryInterceptor(
            interceptor.UnaryClientTraceInterceptor(),
            interceptor.UnaryTimeoutInterceptor(clientOpts.timeout),
            interceptor.UnaryRetryInterceptor(clientOpts.maxRetries),
        ),
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to dial: %w", err)
    }

    return &Client{conn: conn, logger: clientOpts.logger}, nil
}

type clientOptions struct {
    timeout    time.Duration
    maxRetries int
    logger     *slog.Logger
}

type ClientOption func(*clientOptions)

func WithTimeout(d time.Duration) ClientOption {
    return func(o *clientOptions) { o.timeout = d }
}

func WithMaxRetries(n int) ClientOption {
    return func(o *clientOptions) { o.maxRetries = n }
}

func WithClientLogger(l *slog.Logger) ClientOption {
    return func(o *clientOptions) { o.logger = l }
}

func (c *Client) Conn() *grpc.ClientConn {
    return c.conn
}

func (c *Client) Close() error {
    return c.conn.Close()
}
```

> RPC框架的核心不是序列化和网络通信（这些gRPC都帮你做了），而是服务治理——注册发现、负载均衡、熔断降级、链路追踪。这些横切关注点做好了，框架才算成型。

### 5.3 实现服务注册与发现（基于Etcd）

```go
package registry

import (
    "context"
    "encoding/json"
    "fmt"
    "log/slog"
    "sync"
    "time"

    "go.etcd.io/etcd/client/v3"
)

// ServiceInstance 服务实例
type ServiceInstance struct {
    ID       string            `json:"id"`
    Name     string            `json:"name"`
    Address  string            `json:"address"`
    Metadata map[string]string `json:"metadata"`
}

// Registry 服务注册中心接口
type Registry interface {
    Register(ctx context.Context, instance *ServiceInstance) error
    Deregister(ctx context.Context, instance *ServiceInstance) error
    GetInstances(ctx context.Context, serviceName string) ([]*ServiceInstance, error)
    Watch(ctx context.Context, serviceName string) (<-chan []*ServiceInstance, error)
}

// etcdRegistry 基于Etcd的服务注册中心实现
type etcdRegistry struct {
    client *clientv3.Client
    logger *slog.Logger
    prefix string // key前缀，如 /services/
    ttl    int64  // 租约TTL，秒
}

func NewEtcdRegistry(endpoints []string, logger *slog.Logger) (Registry, error) {
    client, err := clientv3.New(clientv3.Config{
        Endpoints:   endpoints,
        DialTimeout: 5 * time.Second,
    })
    if err != nil {
        return nil, fmt.Errorf("failed to connect etcd: %w", err)
    }

    return &etcdRegistry{
        client: client,
        logger: logger,
        prefix: "/services/",
        ttl:    10,
    }, nil
}

func (r *etcdRegistry) Register(ctx context.Context, instance *ServiceInstance) error {
    key := r.prefix + instance.Name + "/" + instance.ID
    val, err := json.Marshal(instance)
    if err != nil {
        return fmt.Errorf("failed to marshal instance: %w", err)
    }

    // 创建租约
    lease, err := r.client.Grant(ctx, r.ttl)
    if err != nil {
        return fmt.Errorf("failed to create lease: %w", err)
    }

    // 注册服务，绑定租约
    _, err = r.client.Put(ctx, key, string(val), clientv3.WithLease(lease.ID))
    if err != nil {
        return fmt.Errorf("failed to put service: %w", err)
    }

    // 自动续租
    ch, err := r.client.KeepAlive(ctx, lease.ID)
    if err != nil {
        return fmt.Errorf("failed to keep alive: %w", err)
    }

    // 消费续租响应
    go func() {
        for {
            select {
            case <-ctx.Done():
                return
            case resp, ok := <-ch:
                if !ok {
                    r.logger.Warn("keepalive channel closed",
                        slog.String("service", instance.Name),
                        slog.String("id", instance.ID),
                    )
                    return
                }
                r.logger.Debug("keepalive renewed",
                    slog.String("service", instance.Name),
                    slog.Int64("ttl", resp.TTL),
                )
            }
        }
    }()

    r.logger.Info("service registered",
        slog.String("service", instance.Name),
        slog.String("id", instance.ID),
        slog.String("address", instance.Address),
    )

    return nil
}

func (r *etcdRegistry) Deregister(ctx context.Context, instance *ServiceInstance) error {
    key := r.prefix + instance.Name + "/" + instance.ID
    _, err := r.client.Delete(ctx, key)
    if err != nil {
        return fmt.Errorf("failed to deregister service: %w", err)
    }

    r.logger.Info("service deregistered",
        slog.String("service", instance.Name),
        slog.String("id", instance.ID),
    )
    return nil
}

func (r *etcdRegistry) GetInstances(ctx context.Context, serviceName string) ([]*ServiceInstance, error) {
    prefix := r.prefix + serviceName + "/"
    resp, err := r.client.Get(ctx, prefix, clientv3.WithPrefix())
    if err != nil {
        return nil, fmt.Errorf("failed to get instances: %w", err)
    }

    instances := make([]*ServiceInstance, 0, len(resp.Kvs))
    for _, kv := range resp.Kvs {
        var inst ServiceInstance
        if err := json.Unmarshal(kv.Value, &inst); err != nil {
            r.logger.Warn("failed to unmarshal instance",
                slog.String("key", string(kv.Key)),
                slog.String("error", err.Error()),
            )
            continue
        }
        instances = append(instances, &inst)
    }

    return instances, nil
}

func (r *etcdRegistry) Watch(ctx context.Context, serviceName string) (<-chan []*ServiceInstance, error) {
    prefix := r.prefix + serviceName + "/"
    watcher := clientv3.NewWatcher(r.client)
    watchCh := watcher.Watch(ctx, prefix, clientv3.WithPrefix())

    outCh := make(chan []*ServiceInstance, 10)

    // 先获取当前实例列表
    instances, err := r.GetInstances(ctx, serviceName)
    if err != nil {
        return nil, err
    }
    outCh <- instances

    go func() {
        defer close(outCh)
        defer watcher.Close()

        for {
            select {
            case <-ctx.Done():
                return
            case event, ok := <-watchCh:
                if !ok {
                    return
                }
                // 有变化时重新拉取完整列表
                instances, err := r.GetInstances(ctx, serviceName)
                if err != nil {
                    r.logger.Error("failed to get instances after watch event",
                        slog.String("error", err.Error()),
                    )
                    continue
                }
                outCh <- instances
            }
        }
    }()

    return outCh, nil
}
```

> 服务注册的核心是"心跳机制"。服务通过租约续期告诉注册中心"我还活着"，注册中心通过租约过期判断"它死了"。简单粗暴但有效。

### 5.4 实现客户端负载均衡

gRPC自带了round_robin负载均衡策略，但生产环境往往需要更多策略。我们实现一个自定义的负载均衡器：

```go
package loadbalancer

import (
    "context"
    "math/rand"
    "sync"
    "sync/atomic"
    "time"

    "google.golang.org/grpc/balancer"
    "google.golang.org/grpc/balancer/base"
    "google.golang.org/grpc/resolver"
)

// 注册自定义负载均衡器
func init() {
    balancer.Register(base.NewBalancerBuilder(
        "weighted_round_robin",
        &wrrPickerBuilder{},
        base.Config{HealthCheck: true},
    ))
}

// wrrPickerBuilder 加权轮询选择器构建器
type wrrPickerBuilder struct{}

func (b *wrrPickerBuilder) Build(info base.PickerBuildInfo) balancer.Picker {
    if len(info.ReadySCs) == 0 {
        return base.NewErrPicker(balancer.ErrNoSubConnAvailable)
    }

    var conns []*weightedConn
    for sc, sci := range info.ReadySCs {
        // 从metadata中获取权重，默认为1
        weight := 1
        if w, ok := sci.Address.Metadata.(map[string]any)["weight"]; ok {
            if wi, ok := w.(int); ok && wi > 0 {
                weight = wi
            }
        }
        conns = append(conns, &weightedConn{
            subConn: sc,
            weight:  weight,
        })
    }

    return &wrrPicker{
        conns: conns,
        rng:   rand.New(rand.NewSource(time.Now().UnixNano())),
    }
}

type weightedConn struct {
    subConn     balancer.SubConn
    weight      int
    currentWeight int // 当前权重，用于平滑加权轮询
}

// wrrPicker 平滑加权轮询选择器
// 算法：每次选择时，将每个节点的currentWeight加上其weight，
// 选出currentWeight最大的节点，然后将该节点的currentWeight减去总weight
type wrrPicker struct {
    mu    sync.Mutex
    conns []*weightedConn
    rng   *rand.Rand
}

func (p *wrrPicker) Pick(info balancer.PickInfo) (balancer.PickResult, error) {
    p.mu.Lock()
    defer p.mu.Unlock()

    if len(p.conns) == 0 {
        return balancer.PickResult{}, balancer.ErrNoSubConnAvailable
    }

    // 平滑加权轮询算法
    totalWeight := 0
    var best *weightedConn
    for _, conn := range p.conns {
        conn.currentWeight += conn.weight
        totalWeight += conn.weight
        if best == nil || conn.currentWeight > best.currentWeight {
            best = conn
        }
    }
    best.currentWeight -= totalWeight

    return balancer.PickResult{
        SubConn: best.subConn,
        Done: func(info balancer.PickDoneInfo) {
            // 可以根据请求结果动态调整权重
            // 比如出错时降低权重
        },
    }, nil
}

// randomPicker 随机选择器
type randomPickerBuilder struct{}

func (b *randomPickerBuilder) Build(info base.PickerBuildInfo) balancer.Picker {
    if len(info.ReadySCs) == 0 {
        return base.NewErrPicker(balancer.ErrNoSubConnAvailable)
    }

    var conns []balancer.SubConn
    for sc := range info.ReadySCs {
        conns = append(conns, sc)
    }

    return &randomPicker{
        conns: conns,
        rng:   rand.New(rand.NewSource(time.Now().UnixNano())),
    }
}

type randomPicker struct {
    conns []balancer.SubConn
    rng   *rand.Rand
}

func (p *randomPicker) Pick(info balancer.PickInfo) (balancer.PickResult, error) {
    idx := p.rng.Intn(len(p.conns))
    return balancer.PickResult{SubConn: p.conns[idx]}, nil
}
```

> 负载均衡不是"绝对平均"，而是"合理分配"。有的机器性能好，就多分点活；有的机器性能差，就少分点。加权轮询就是干这事的。

### 5.5 实现熔断降级组件

微服务架构下，一个服务故障可能引发雪崩。熔断器就是防雪崩的保险丝——当错误率超过阈值时，自动熔断，快速失败，防止故障扩散。

```go
package circuitbreaker

import (
    "context"
    "errors"
    "log/slog"
    "sync"
    "time"
)

// State 熔断器状态
type State int

const (
    StateClosed   State = iota // 关闭，正常放行
    StateOpen                  // 打开，快速失败
    StateHalfOpen              // 半开，试探性放行
)

func (s State) String() string {
    switch s {
    case StateClosed:
        return "CLOSED"
    case StateOpen:
        return "OPEN"
    case StateHalfOpen:
        return "HALF_OPEN"
    default:
        return "UNKNOWN"
    }
}

var (
    ErrCircuitOpen = errors.New("circuit breaker is open")
)

// Config 熔断器配置
type Config struct {
    MaxRequests      uint32        // 半开状态下允许的最大请求数
    Period           time.Duration // 统计周期
    Timeout          time.Duration // 熔断后的恢复等待时间
    FailureRatio     float64       // 错误率阈值
    FailureThreshold uint32        // 最少错误请求数，触发熔断
}

func DefaultConfig() Config {
    return Config{
        MaxRequests:      5,
        Period:           10 * time.Second,
        Timeout:          30 * time.Second,
        FailureRatio:     0.5,
        FailureThreshold: 5,
    }
}

// CircuitBreaker 熔断器
type CircuitBreaker struct {
    mu          sync.Mutex
    state       State
    config      Config
    counts      counts
    expiry      time.Time
    generation  uint64
    logger      *slog.Logger
}

type counts struct {
    requests            uint32
    totalFailures       uint32
    totalSuccesses      uint32
    consecutiveFailures uint32
}

func New(config Config, logger *slog.Logger) *CircuitBreaker {
    return &CircuitBreaker{
        state:  StateClosed,
        config: config,
        logger: logger,
    }
}

// Allow 检查是否允许请求通过
func (cb *CircuitBreaker) Allow() error {
    cb.mu.Lock()
    defer cb.mu.Unlock()

    now := time.Now()
    state, generation := cb.beforeRequest(now)

    if state == StateOpen {
        return ErrCircuitOpen
    }

    cb.counts.requests++
    _ = generation
    return nil
}

// RecordSuccess 记录成功
func (cb *CircuitBreaker) RecordSuccess() {
    cb.mu.Lock()
    defer cb.mu.Unlock()

    cb.counts.totalSuccesses++
    cb.counts.consecutiveFailures = 0
    cb.onSuccess()
}

// RecordFailure 记录失败
func (cb *CircuitBreaker) RecordFailure() {
    cb.mu.Lock()
    defer cb.mu.Unlock()

    cb.counts.totalFailures++
    cb.counts.consecutiveFailures++
    cb.onFailure()
}

func (cb *CircuitBreaker) beforeRequest(now time.Time) (State, uint64) {
    state, generation := cb.currentState(now)

    if state == StateOpen {
        cb.toNewGeneration(now)
        return state, generation
    }

    return state, generation
}

func (cb *CircuitBreaker) onSuccess() {
    switch cb.state {
    case StateHalfOpen:
        // 半开状态下成功，切换到关闭
        cb.toNewGeneration(time.Now())
    }
}

func (cb *CircuitBreaker) onFailure() {
    switch cb.state {
    case StateClosed:
        // 关闭状态下失败，检查是否需要打开
        if cb.shouldOpen() {
            cb.state = StateOpen
            cb.expiry = time.Now().Add(cb.config.Timeout)
            cb.logger.Warn("circuit breaker opened",
                slog.Uint64("failures", uint64(cb.counts.totalFailures)),
                slog.Uint64("requests", uint64(cb.counts.requests)),
            )
        }
    case StateHalfOpen:
        // 半开状态下失败，重新打开
        cb.state = StateOpen
        cb.expiry = time.Now().Add(cb.config.Timeout)
    }
}

func (cb *CircuitBreaker) shouldOpen() bool {
    ratio := float64(cb.counts.totalFailures) / float64(cb.counts.requests)
    return cb.counts.requests >= cb.config.FailureThreshold &&
        ratio >= cb.config.FailureRatio
}

func (cb *CircuitBreaker) currentState(now time.Time) (State, uint64) {
    switch cb.state {
    case StateClosed:
        if !cb.expiry.IsZero() && now.After(cb.expiry) {
            cb.toNewGeneration(now)
        }
    case StateOpen:
        if now.After(cb.expiry) {
            cb.state = StateHalfOpen
            cb.counts = counts{}
            cb.logger.Info("circuit breaker half-open")
        }
    }
    return cb.state, cb.generation
}

func (cb *CircuitBreaker) toNewGeneration(now time.Time) {
    cb.generation++
    cb.counts = counts{}

    switch cb.state {
    case StateClosed:
        cb.expiry = now.Add(cb.config.Period)
    case StateOpen:
        cb.expiry = now.Add(cb.config.Timeout)
    case StateHalfOpen:
        cb.expiry = time.Time{}
    }
}

// Execute 执行受熔断器保护的函数
func (cb *CircuitBreaker) Execute(ctx context.Context, fn func(ctx context.Context) error) error {
    if err := cb.Allow(); err != nil {
        return err
    }

    err := fn(ctx)
    if err != nil {
        cb.RecordFailure()
        return err
    }

    cb.RecordSuccess()
    return nil
}
```

配合gRPC拦截器使用：

```go
package interceptor

import (
    "context"
    "log/slog"

    "github.com/palangcat/order-system/circuitbreaker"
    "google.golang.org/grpc"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
)

// UnaryCircuitBreakerInterceptor 熔断器拦截器
func UnaryCircuitBreakerInterceptor(breakers map[string]*circuitbreaker.CircuitBreaker, logger *slog.Logger) grpc.UnaryClientInterceptor {
    return func(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
        cb, ok := breakers[method]
        if !ok {
            // 没有配置熔断器，直接放行
            return invoker(ctx, method, req, reply, cc, opts...)
        }

        err := cb.Execute(ctx, func(ctx context.Context) error {
            return invoker(ctx, method, req, reply, cc, opts...)
        })

        if err == circuitbreaker.ErrCircuitOpen {
            return status.Error(codes.Unavailable, "service circuit breaker is open")
        }

        return err
    }
}
```

> 熔断器的三种状态就像人的情绪：Closed是心情好，什么请求都接；Open是暴怒状态，什么请求都拒；HalfOpen是冷静下来试探，看能不能原谅你。

### 5.6 实现分布式链路追踪（整合到微服务框架）

把前面写的链路追踪组件整合到微服务框架中：

```go
package framework

import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"

    "github.com/palangcat/order-system/logging"
    "github.com/palangcat/order-system/monitoring"
    "github.com/palangcat/order-system/tracing"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

// Framework 微服务框架，整合可观测性组件
type Framework struct {
    serviceName string
    logger      *slog.Logger
    metrics     *monitoring.Metrics
    tracerCloser func(context.Context) error
}

type FrameworkOption func(*Framework)

func WithServiceName(name string) FrameworkOption {
    return func(f *Framework) { f.serviceName = name }
}

// Init 初始化微服务框架
func Init(opts ...FrameworkOption) (*Framework, error) {
    f := &Framework{
        serviceName: "unknown",
    }
    for _, opt := range opts {
        opt(f)
    }

    // 初始化日志
    f.logger = logging.SetupLogger(f.serviceName, os.Getenv("APP_ENV"))

    // 初始化链路追踪
    collectorAddr := os.Getenv("OTEL_COLLECTOR_ADDR")
    if collectorAddr == "" {
        collectorAddr = "localhost:4317"
    }
    closer, err := tracing.InitTracer(f.serviceName, collectorAddr)
    if err != nil {
        return nil, err
    }
    f.tracerCloser = closer

    // 初始化指标
    f.metrics = monitoring.NewMetrics(f.serviceName)

    f.logger.Info("framework initialized",
        slog.String("service", f.serviceName),
    )

    return f, nil
}

// Logger 获取日志器
func (f *Framework) Logger() *slog.Logger {
    return f.logger
}

// Metrics 获取指标
func (f *Framework) Metrics() *monitoring.Metrics {
    return f.metrics
}

// StartMetricsServer 启动指标暴露服务
func (f *Framework) StartMetricsServer(addr string) {
    mux := http.NewServeMux()
    mux.Handle("/metrics", f.metrics.Handler())
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("ok"))
    })

    go func() {
        f.logger.Info("metrics server started", slog.String("addr", addr))
        if err := http.ListenAndServe(addr, mux); err != nil {
            f.logger.Error("metrics server failed", slog.String("error", err.Error()))
        }
    }()
}

// WaitForSignal 等待退出信号
func (f *Framework) WaitForSignal() {
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    <-sigCh

    f.logger.Info("shutting down...")
    if f.tracerCloser != nil {
        f.tracerCloser(context.Background())
    }
}
```

### 5.7 实现指标监控与日志聚合（在服务中的应用）

```go
package service

import (
    "context"
    "log/slog"
    "time"

    orderv1 "github.com/palangcat/order-system/proto/order/v1"
    productv1 "github.com/palangcat/order-system/proto/product/v1"
    userv1 "github.com/palangcat/order-system/proto/user/v1"
    "github.com/palangcat/order-system/monitoring"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/trace"
)

// OrderServiceImpl 订单服务实现
type OrderServiceImpl struct {
    orderv1.UnimplementedOrderServiceServer
    logger   *slog.Logger
    metrics  *monitoring.Metrics
    userClient    userv1.UserServiceClient
    productClient productv1.ProductServiceClient
}

func NewOrderService(logger *slog.Logger, metrics *monitoring.Metrics, userClient userv1.UserServiceClient, productClient productv1.ProductServiceClient) *OrderServiceImpl {
    return &OrderServiceImpl{
        logger:        logger,
        metrics:       metrics,
        userClient:    userClient,
        productClient: productClient,
    }
}

func (s *OrderServiceImpl) CreateOrder(ctx context.Context, req *orderv1.CreateOrderRequest) (*orderv1.CreateOrderResponse, error) {
    tracer := otel.Tracer("order-service")
    ctx, span := tracer.Start(ctx, "CreateOrder",
        trace.WithAttributes(
            attribute.String("order.user_id", req.UserId),
            attribute.String("order.product_id", req.ProductId),
            attribute.Int("order.quantity", int(req.Quantity)),
        ),
    )
    defer span.End()

    start := time.Now()
    s.logger.InfoContext(ctx, "creating order",
        slog.String("user_id", req.UserId),
        slog.String("product_id", req.ProductId),
        slog.Int("quantity", int(req.Quantity)),
    )

    // 1. 查询用户
    userResp, err := s.userClient.GetUser(ctx, &userv1.GetUserRequest{UserId: req.UserId})
    if err != nil {
        s.logger.ErrorContext(ctx, "failed to get user",
            slog.String("error", err.Error()),
        )
        s.metrics.GrpcRequestTotal.WithLabelValues("GetUser", "ERROR").Inc()
        return nil, err
    }
    s.metrics.GrpcRequestTotal.WithLabelValues("GetUser", "OK").Inc()
    s.logger.InfoContext(ctx, "user found",
        slog.String("username", userResp.Username),
    )

    // 2. 查询商品并扣减库存
    productResp, err := s.productClient.GetProduct(ctx, &productv1.GetProductRequest{ProductId: req.ProductId})
    if err != nil {
        s.logger.ErrorContext(ctx, "failed to get product",
            slog.String("error", err.Error()),
        )
        return nil, err
    }

    if productResp.Stock < req.Quantity {
        s.logger.WarnContext(ctx, "insufficient stock",
            slog.Int("available", int(productResp.Stock)),
            slog.Int("requested", int(req.Quantity)),
        )
        return nil, fmt.Errorf("insufficient stock: have %d, need %d", productResp.Stock, req.Quantity)
    }

    deductResp, err := s.productClient.DeductStock(ctx, &productv1.DeductStockRequest{
        ProductId: req.ProductId,
        Quantity:  req.Quantity,
    })
    if err != nil || !deductResp.Success {
        s.logger.ErrorContext(ctx, "failed to deduct stock",
            slog.String("error", err.Error()),
        )
        return nil, fmt.Errorf("failed to deduct stock: %w", err)
    }

    // 3. 创建订单（模拟）
    orderID := generateOrderID()
    totalCents := productResp.PriceCents * int64(req.Quantity)

    s.logger.InfoContext(ctx, "order created",
        slog.String("order_id", orderID),
        slog.Int64("total_cents", totalCents),
    )

    s.metrics.HttpRequestTotal.WithLabelValues("POST", "/orders", "201").Inc()
    s.metrics.DBQueryDuration.WithLabelValues("INSERT", "orders").Observe(time.Since(start).Seconds())

    return &orderv1.CreateOrderResponse{
        OrderId: orderID,
        Status:  "created",
    }, nil
}

func (s *OrderServiceImpl) GetOrder(ctx context.Context, req *orderv1.GetOrderRequest) (*orderv1.GetOrderResponse, error) {
    tracer := otel.Tracer("order-service")
    ctx, span := tracer.Start(ctx, "GetOrder",
        trace.WithAttributes(attribute.String("order.id", req.OrderId)),
    )
    defer span.End()

    // 模拟从数据库查询
    return &orderv1.GetOrderResponse{
        OrderId:   req.OrderId,
        UserId:    "user-123",
        ProductId: "product-456",
        Quantity:  2,
        TotalCents: 19900,
        Status:    "created",
        CreatedAt:  time.Now().Unix(),
    }, nil
}

func generateOrderID() string {
    return "ORD-" + time.Now().Format("20060102150405") + "-" + randomString(6)
}

func randomString(n int) string {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    b := make([]byte, n)
    for i := range b {
        b[i] = letters[rand.Intn(len(letters))]
    }
    return string(b)
}
```

> 注意到没有？每个服务方法里都有span、metrics、logger三件套。这不是啰嗦，这是可观测性的"圣三位一体"——少了任何一个，排查问题时就像瘸了一条腿。

### 5.8 基于微服务框架实现订单系统

最后把所有服务串起来，main函数启动三个服务：

```go
package main

import (
    "context"
    "log/slog"
    "os"
    "time"

    "github.com/palangcat/order-system/framework"
    "github.com/palangcat/order-system/registry"
    "github.com/palangcat/order-system/rpc"
    "github.com/palangcat/order-system/service"
    userv1 "github.com/palangcat/order-system/proto/user/v1"
    productv1 "github.com/palangcat/order-system/proto/product/v1"
    orderv1 "github.com/palangcat/order-system/proto/order/v1"
)

func main() {
    // 初始化框架
    fw, err := framework.Init(framework.WithServiceName("order-service"))
    if err != nil {
        panic(err)
    }

    // 启动指标服务
    fw.StartMetricsServer(":9090")

    // 连接Etcd
    reg, err := registry.NewEtcdRegistry(
        []string{getEnv("ETCD_ENDPOINTS", "localhost:2379")},
        fw.Logger(),
    )
    if err != nil {
        panic(err)
    }

    // 创建用户服务客户端
    userClientConn, err := rpc.NewClient("user-service", reg,
        rpc.WithTimeout(3*time.Second),
        rpc.WithMaxRetries(2),
    )
    if err != nil {
        panic(err)
    }
    defer userClientConn.Close()
    userClient := userv1.NewUserServiceClient(userClientConn.Conn())

    // 创建商品服务客户端
    productClientConn, err := rpc.NewClient("product-service", reg,
        rpc.WithTimeout(3*time.Second),
        rpc.WithMaxRetries(2),
    )
    if err != nil {
        panic(err)
    }
    defer productClientConn.Close()
    productClient := productv1.NewProductServiceClient(productClientConn.Conn())

    // 创建订单服务
    orderSvc := service.NewOrderService(fw.Logger(), fw.Metrics(), userClient, productClient)

    // 启动RPC服务端
    server := rpc.NewServer("order-service", ":8083", reg,
        rpc.WithLogger(fw.Logger()),
    )
    server.RegisterService(&orderv1.OrderService_ServiceDesc, orderSvc)

    // 启动
    ctx := context.Background()
    go func() {
        if err := server.Start(ctx); err != nil {
            fw.Logger().Error("server failed", slog.String("error", err.Error()))
            os.Exit(1)
        }
    }()

    fw.Logger().Info("order service running on :8083")
    fw.WaitForSignal()
}

func getEnv(key, defaultVal string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return defaultVal
}
```

用户服务和商品服务的main函数类似，只是注册的服务不同。用户服务：

```go
package main

import (
    "context"
    "log/slog"
    "os"

    "github.com/palangcat/order-system/framework"
    "github.com/palangcat/order-system/registry"
    "github.com/palangcat/order-system/rpc"
    "github.com/palangcat/order-system/service"
    userv1 "github.com/palangcat/order-system/proto/user/v1"
)

func main() {
    fw, err := framework.Init(framework.WithServiceName("user-service"))
    if err != nil {
        panic(err)
    }
    fw.StartMetricsServer(":9091")

    reg, err := registry.NewEtcdRegistry(
        []string{getEnv("ETCD_ENDPOINTS", "localhost:2379")},
        fw.Logger(),
    )
    if err != nil {
        panic(err)
    }

    userSvc := service.NewUserService(fw.Logger(), fw.Metrics())

    server := rpc.NewServer("user-service", ":8081", reg,
        rpc.WithLogger(fw.Logger()),
    )
    server.RegisterService(&userv1.UserService_ServiceDesc, userSvc)

    go func() {
        if err := server.Start(context.Background()); err != nil {
            fw.Logger().Error("server failed", slog.String("error", err.Error()))
            os.Exit(1)
        }
    }()

    fw.Logger().Info("user service running on :8081")
    fw.WaitForSignal()
}
```

商品服务：

```go
package main

import (
    "context"
    "log/slog"
    "os"

    "github.com/palangcat/order-system/framework"
    "github.com/palangcat/order-system/registry"
    "github.com/palangcat/order-system/rpc"
    "github.com/palangcat/order-system/service"
    productv1 "github.com/palangcat/order-system/proto/product/v1"
)

func main() {
    fw, err := framework.Init(framework.WithServiceName("product-service"))
    if err != nil {
        panic(err)
    }
    fw.StartMetricsServer(":9092")

    reg, err := registry.NewEtcdRegistry(
        []string{getEnv("ETCD_ENDPOINTS", "localhost:2379")},
        fw.Logger(),
    )
    if err != nil {
        panic(err)
    }

    productSvc := service.NewProductService(fw.Logger(), fw.Metrics())

    server := rpc.NewServer("product-service", ":8082", reg,
        rpc.WithLogger(fw.Logger()),
    )
    server.RegisterService(&productv1.ProductService_ServiceDesc, productSvc)

    go func() {
        if err := server.Start(context.Background()); err != nil {
            fw.Logger().Error("server failed", slog.String("error", err.Error()))
            os.Exit(1)
        }
    }()

    fw.Logger().Info("product service running on :8082")
    fw.WaitForSignal()
}
```

### 5.9 完整调用链路

当用户调用`POST /orders`创建订单时，完整的调用链路是这样的：

1. HTTP请求到达网关，网关创建根Span
2. 网关调用订单服务的CreateOrder RPC，TraceID通过gRPC metadata传递
3. 订单服务收到请求，从metadata提取TraceID，创建子Span
4. 订单服务调用用户服务的GetUser RPC，TraceID继续传递
5. 订单服务调用商品服务的GetProduct RPC，TraceID继续传递
6. 订单服务调用商品服务的DeductStock RPC，TraceID继续传递
7. 订单服务创建订单记录，写入数据库
8. 响应返回，整条链路被记录到Jaeger

在Jaeger中你会看到一棵调用树，根节点是网关的HTTP请求，子节点依次是CreateOrder、GetUser、GetProduct、DeductStock，每个节点的耗时一目了然。

在Prometheus中你会看到：

- `http_requests_total{service="order-service"}` 请求总数
- `http_request_duration_seconds{service="order-service"}` 请求延迟分布
- `grpc_requests_total{service="order-service",method="GetUser"}` RPC调用次数

在Loki中你可以用`{service="order-service"} |= "creating order"`搜索特定服务的特定日志，也可以用TraceID跨服务搜索完整链路的日志。

> 可观测性的终极目标不是"看到"，而是"看懂"。链路告诉你故事线，指标告诉你健康度，日志告诉你细节。三者合一，才是完整的画面。

### 5.10 微服务部署清单

最后，我整理了一份微服务部署清单，帮助你把项目从本地跑通到上生产：

**基础设施清单：**

1. Etcd集群（3节点，服务注册发现）
2. OpenTelemetry Collector（接收链路数据）
3. Jaeger（链路存储和查询）
4. Prometheus（指标存储和查询）
5. Loki + Promtail（日志收集和存储）
6. Grafana（统一可视化）
7. 数据库（MySQL/PostgreSQL）
8. 缓存（Redis）

**每个服务的配置项：**

1. 服务名称和版本
2. 监听地址
3. Etcd连接地址
4. OTel Collector地址
5. 数据库连接串
6. Redis地址
7. 日志级别
8. 采样率

**Docker Compose一键启动基础设施：**

```yaml
version: "3.8"
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5
    command: etcd --advertise-client-urls http://0.0.0.0:2379 --listen-client-urls http://0.0.0.0:2379
    ports: ["2379:2379"]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports: ["4317:4317", "4318:4318"]
    depends_on: [jaeger, loki]

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports: ["16686:16686"]

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports: ["9090:9090"]

  loki:
    image: grafana/loki:latest
    ports: ["3100:3100"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    depends_on: [prometheus, loki, jaeger]
```

> 把基础设施容器化，不仅是为了部署方便，更是为了让团队成员能快速搭建完整的开发环境。新人clone代码、docker compose up，五分钟就能跑起来。

## 总结

这一章我们从零搭建了一套完整的微服务可观测性体系，并落地了一个订单系统。回顾一下核心知识点：

**可观测性三支柱：**

1. 链路追踪：OpenTelemetry标准，Trace/Span/Baggage概念，HTTP和gRPC中间件实现，采样策略
2. 指标监控：Counter/Gauge/Histogram/Summary四种类型，Prometheus集成，指标采集清单
3. 日志聚合：结构化日志设计，TraceID注入，ELK/Loki方案对比

**微服务实战：**

1. RPC框架：基于gRPC，支持拦截器链
2. 服务注册发现：基于Etcd，租约续期，Watch机制
3. 负载均衡：平滑加权轮询算法
4. 熔断降级：三状态熔断器，滑动窗口统计
5. 订单系统：用户服务、商品服务、订单服务，完整调用链路

如果你觉得这篇文章对你有帮助，点个收藏，方便以后查阅。有什么问题或者想法，评论区见，我会逐条回复。

这是Go语言实战手册系列的第10章，系列进度 10/16。下一章我们聊**分布式事务理论**——2PC、3PC、TCC、Saga、本地消息表，这些分布式事务方案怎么选、怎么实现，怕浪猫带你一个一个过。

---

**怕浪猫说：** 可观测性不是锦上添花，是雪中送炭。你花在埋点上的每一分钟，都可能在生产事故中帮你省回来一小时。别等炸了才想起来加监控，那时候你连"炸在哪"都不知道。写微服务也是一样，先跑通最小闭环，再逐步加治理能力。别追求一步到位，要追求每一步都到位。