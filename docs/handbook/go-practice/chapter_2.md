# 第2章 AOP方案设计：让Web框架拥有切面能力

试过在每个Handler里重复写日志、鉴权、异常恢复吗？代码review时被指出"这些逻辑应该抽出来"却不知道怎么抽？面试官问你Gin中间件的执行顺序，脑子里一团浆糊？

我是怕浪猫，一个在大厂写了四年后端的人。这一章我们彻底搞懂Web框架的AOP方案——从设计模式到工程实现，一次性讲透。

> 中间件不是装饰品，而是Web框架的骨架。骨架搭错了，上面的肉全是白长。

---

## 2.1 为什么需要AOP

先看一段没有AOP的代码：

```go
func GetUserHandler(w http.ResponseWriter, r *http.Request) {
    // 日志记录
    start := time.Now()
    log.Printf("request: %s %s", r.Method, r.URL.Path)
    
    // 鉴权
    token := r.Header.Get("Authorization")
    if token == "" {
        w.WriteHeader(http.StatusUnauthorized)
        return
    }
    
    // panic恢复
    defer func() {
        if err := recover(); err != nil {
            log.Printf("panic: %v", err)
            w.WriteHeader(http.StatusInternalServerError)
        }
    }()
    
    // 业务逻辑
    user, err := getUser(r.URL.Query().Get("id"))
    if err != nil {
        w.WriteHeader(http.StatusInternalServerError)
        return
    }
    
    json.NewEncoder(w).Encode(user)
    
    // 耗时统计
    log.Printf("response time: %v", time.Since(start))
}
```

每个Handler都要重复写日志、鉴权、恢复、耗时统计。10个Handler就是10份重复代码。

> 重复代码不是懒惰的产物，而是缺少抽象的代价。

AOP（Aspect-Oriented Programming，面向切面编程）解决的就是这个问题——把横切关注点（日志、鉴权、监控等）从业务逻辑中剥离出来，统一管理。

### 横切关注点清单

以下是Web框架中典型的横切关注点：

| 关注点 | 说明 | 实现方式 |
|--------|------|----------|
| 日志记录 | 请求方法、路径、耗时、状态码 | 前置+后置中间件 |
| 鉴权 | Token验证、权限检查 | 前置中间件 |
| 链路追踪 | TraceID注入、Span记录 | 前置+后置中间件 |
| 指标监控 | QPS、延迟分布、错误率 | 后置中间件 |
| Panic恢复 | 捕获panic，返回500 | 前置中间件 |
| 限流 | 请求频率控制 | 前置中间件 |
| CORS | 跨域头设置 | 前置中间件 |
| 压缩 | Gzip/Brotli响应压缩 | 后置中间件 |

> 横切关注点的本质是：和业务无关，但每个请求都需要。

---

## 2.2 AOP设计模式详解

Web框架中实现AOP有三种经典设计模式：责任链模式、洋葱模式和拦截器机制。三者本质相同，实现细节各有侧重。

### 2.2.1 责任链模式（Chain of Responsibility）

责任链模式的核心思想：把多个处理者串成链，请求沿链传递，每个处理者决定是否处理或传递给下一个。

```go
// Handler 接口
type Handler interface {
    Handle(ctx *Context)
}

// HandlerFunc 函数适配器
type HandlerFunc func(ctx *Context)

func (f HandlerFunc) Handle(ctx *Context) {
    f(ctx)
}

// Chain 责任链
type Chain struct {
    handlers []HandlerFunc
    index    int
}

func (c *Chain) Next(ctx *Context) {
    c.index++
    for c.index < len(c.handlers) {
        c.handlers[c.index](ctx)
        c.index++
    }
}

func (c *Chain) Execute(ctx *Context) {
    c.handlers[0](ctx)
}
```

责任链的关键在于"链"的构建方式。每个处理者执行完自己的逻辑后，可以选择调用`Next()`将控制权传递给下一个处理者，也可以选择中断链的执行。

```go
// 构建责任链示例
func buildChain() *Chain {
    return &Chain{
        handlers: []HandlerFunc{
            logMiddleware,
            authMiddleware,
            recoverMiddleware,
            businessHandler,
        },
    }
}

func logMiddleware(ctx *Context) {
    start := time.Now()
    ctx.Chain.Next(ctx)
    log.Printf("%s %s %d %v", ctx.Method, ctx.Path, ctx.StatusCode, time.Since(start))
}

func authMiddleware(ctx *Context) {
    token := ctx.GetHeader("Authorization")
    if token == "" {
        ctx.StatusCode = 401
        ctx.JSON(map[string]string{"error": "unauthorized"})
        return // 中断链
    }
    ctx.Chain.Next(ctx)
}

func recoverMiddleware(ctx *Context) {
    defer func() {
        if err := recover(); err != nil {
            log.Printf("panic recovered: %v", err)
            ctx.StatusCode = 500
            ctx.JSON(map[string]string{"error": "internal server error"})
        }
    }()
    ctx.Chain.Next(ctx)
}
```

> 责任链的精髓不在于"链"，而在于"可以选择不传递"——这就是中间件能拦截请求的关键。

### 2.2.2 洋葱模式（Onion Model）

洋葱模式是责任链模式的变体，形象地把中间件比作洋葱的层——请求从外到内穿过每一层，响应从内到外再穿回来。

```
请求 →  [日志] → [鉴权] → [恢复] → [业务] → [恢复] → [鉴权] → [日志] → 响应
         外层                              内层                              外层
```

每一层中间件都可以在`Next()`之前做前置处理，在`Next()`之后做后置处理：

```go
func onionMiddleware(ctx *Context) {
    // 前置处理（请求进入时）
    fmt.Println("before")
    
    // 传递给下一层
    ctx.Chain.Next(ctx)
    
    // 后置处理（响应返回时）
    fmt.Println("after")
}
```

洋葱模式的优势在于：一个中间件可以同时处理请求和响应，不需要分成两个钩子。

```go
// 洋葱模式实例：耗时统计中间件
func timingMiddleware(ctx *Context) {
    start := time.Now()       // 前置：记录开始时间
    
    ctx.Chain.Next(ctx)       // 传递给下一层
    
    elapsed := time.Since(start)  // 后置：计算耗时
    ctx.SetHeader("X-Response-Time", elapsed.String())
    metrics.Record(ctx.Path, elapsed)
}
```

> 洋葱模式让一个中间件同时看到请求和响应，这就是它比纯责任链更优雅的原因。

### 2.2.3 拦截器机制（Interceptor）

拦截器是AOP的另一种表述，更强调"拦截"的语义。拦截器通常分为前置拦截、后置拦截和完成拦截三个阶段。

```go
// Interceptor 拦截器接口
type Interceptor interface {
    // 前置拦截：在Handler执行前调用
    PreHandle(ctx *Context) bool
    
    // 后置拦截：在Handler执行后调用
    PostHandle(ctx *Context)
    
    // 完成拦截：在视图渲染完成后调用
    AfterCompletion(ctx *Context, err error)
}

// InterceptorChain 拦截器链
type InterceptorChain struct {
    interceptors []Interceptor
}

func (ic *InterceptorChain) Execute(ctx *Context, handler HandlerFunc) {
    // 前置拦截
    for _, interceptor := range ic.interceptors {
        if !interceptor.PreHandle(ctx) {
            // 前置拦截返回false，中断请求
            return
        }
    }
    
    // 执行业务Handler
    handler(ctx)
    
    // 后置拦截
    for i := len(ic.interceptors) - 1; i >= 0; i-- {
        ic.interceptors[i].PostHandle(ctx)
    }
    
    // 完成拦截
    for i := len(ic.interceptors) - 1; i >= 0; i-- {
        ic.interceptors[i].AfterCompletion(ctx, nil)
    }
}
```

> 拦截器把"前"和"后"显式分离，看起来更清晰，但灵活性不如洋葱模式——因为你无法在一个方法里同时看到请求前和请求后的状态。

---

## 2.3 开源框架AOP实现对比

### 2.3.1 Gin：Handler链设计

Gin的中间件本质上是一个`HandlerFunc`切片，所有中间件和最终的业务Handler按顺序放入切片中，通过`index`游标依次执行。

```go
// Gin核心结构（简化版）
type Engine struct {
    // ...
    noRoute  []HandlerFunc
}

type Context struct {
    // ...
    handlers []HandlerFunc
    index    int8
}

func (c *Context) Next() {
    c.index++
    for c.index < int8(len(c.handlers)) {
        c.handlers[c.index](c)
        c.index++
    }
}

func (c *Context) Abort() {
    c.index = abortIndex // 63，一个很大的数
}
```

Gin中间件的核心用法：

```go
r := gin.New()

// 注册中间件
r.Use(gin.Logger())      // 日志
r.Use(gin.Recovery())    // panic恢复
r.Use(authMiddleware)    // 自定义鉴权

r.GET("/users/:id", func(c *gin.Context) {
    id := c.Param("id")
    c.JSON(200, gin.H{"id": id})
})
```

Gin中间件的执行流程：

```
请求进入
  → Logger() 前置：记录请求信息
    → Recovery() 前置：设置defer recover
      → authMiddleware() 前置：验证token
        → 业务Handler 执行
      → authMiddleware() 后置：（无）
    → Recovery() 后置：（defer触发，但通常无panic）
  → Logger() 后置：记录响应信息
响应返回
```

> Gin的中间件设计极简——一个切片+一个游标，就实现了完整的洋葱模型。这种简洁值得学习。

### 2.3.2 Beego：Filter过滤器设计

Beego采用了Filter机制，更接近Servlet规范中的Filter概念。Filter在请求处理的不同阶段执行。

```go
// Beego Filter位置定义
const (
    BeforeStatic = iota
    BeforeRouter
    BeforeExec
    AfterExec
    FinishRouter
)

// 注册Filter
beego.InsertFilter("/api/*", beego.BeforeRouter, func(ctx *context.Context) {
    token := ctx.Input.Header("Authorization")
    if token == "" {
        ctx.Output.SetStatus(401)
        ctx.StopRun()
    }
})
```

Beego的Filter执行流程：

```
BeforeStatic → BeforeRouter → BeforeExec → Handler → AfterExec → FinishRouter
```

与Gin的洋葱模式不同，Beego的Filter是分阶段的——前置Filter和后置Filter是分开注册的，不能在一个函数里同时处理前和后。

> Beego的Filter阶段化设计适合简单场景，但当你需要在同一个中间件里拿到请求前和请求后的状态时，就比较别扭了。

### 2.3.3 Kratos：Middleware中间件设计

Kratos（B站开源的微服务框架）的中间件设计更现代化，采用了显式的`Handler`类型和`Transport`抽象：

```go
// Kratos Middleware类型
type Middleware func(Handler) Handler

type Handler func(ctx context.Context, req interface{}) (interface{}, error)

// 注册中间件
httpSrv := http.NewServer(
    http.Address(":8080"),
    http.Middleware(
        recovery.Recovery(),
        tracing.Server(),
        logging.Server(logger),
        metadata.Server(),
    ),
)

// 自定义中间件
func authMiddleware(svc interface{}) middleware.Middleware {
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            // 前置处理
            if err := checkAuth(ctx); err != nil {
                return nil, err
            }
            // 调用下一个
            reply, err := handler(ctx, req)
            // 后置处理
            return reply, err
        }
    }
}
```

Kratos的设计更偏向微服务场景，中间件签名是`func(ctx, req) (reply, error)`，天然适合RPC调用。

### 三大框架AOP对比

| 维度 | Gin | Beego | Kratos |
|------|-----|-------|--------|
| 模式 | 洋葱模式 | 阶段式Filter | 函数式中间件 |
| 前后处理 | 同一函数 | 分开注册 | 同一函数 |
| 中断方式 | c.Abort() | ctx.StopRun() | return error |
| 传递方式 | c.Next() | 自动传递 | handler(ctx, req) |
| 适用场景 | Web框架 | Web框架 | 微服务框架 |
| 学习成本 | 低 | 中 | 中 |

> 选框架的本质是选设计哲学：Gin追求极简，Beego追求全面，Kratos追求现代。AOP方案只是哲学的一个切面。

---

## 2.4 实现Access Log中间件

理解了设计模式，我们开始动手实现。首先是Access Log中间件——记录每个请求的方法、路径、状态码和耗时。

### 2.4.1 基础实现

```go
package middleware

import (
    "log"
    "time"
)

// AccessLog 访问日志中间件
func AccessLog() Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            start := time.Now()
            
            // 前置：记录请求信息
            method := ctx.Request.Method
            path := ctx.Request.URL.Path
            clientIP := ctx.ClientIP()
            
            log.Printf("[ACCESS] %s %s %s", method, path, clientIP)
            
            // 执行下一个Handler
            next(ctx)
            
            // 后置：记录响应信息
            statusCode := ctx.StatusCode
            duration := time.Since(start)
            
            log.Printf("[ACCESS] %s %s %d %v %s", 
                method, path, statusCode, duration, clientIP)
        }
    }
}
```

### 2.4.2 结构化日志版本

生产环境需要结构化日志，方便日志收集和分析：

```go
package middleware

import (
    "time"
    "go.uber.org/zap"
)

// StructuredAccessLog 结构化访问日志中间件
func StructuredAccessLog(logger *zap.Logger) Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            start := time.Now()
            
            // 生成请求ID
            requestID := generateRequestID()
            ctx.Set("request_id", requestID)
            
            // 前置日志
            logger.Info("request started",
                zap.String("request_id", requestID),
                zap.String("method", ctx.Request.Method),
                zap.String("path", ctx.Request.URL.Path),
                zap.String("client_ip", ctx.ClientIP()),
                zap.String("user_agent", ctx.Request.UserAgent()),
            )
            
            // 执行下一个Handler
            next(ctx)
            
            // 后置日志
            duration := time.Since(start)
            logger.Info("request completed",
                zap.String("request_id", requestID),
                zap.Int("status_code", ctx.StatusCode),
                zap.Duration("duration", duration),
                zap.Int("response_size", ctx.ResponseSize),
            )
        }
    }
}

func generateRequestID() string {
    b := make([]byte, 16)
    rand.Read(b)
    return hex.EncodeToString(b)
}
```

> 日志最大的价值不在于"记录了什么"，而在于"能不能搜"。结构化日志就是把"能搜"做到极致。

---

## 2.5 实现Tracing链路追踪中间件

链路追踪是微服务可观测性的核心。一个请求可能经过多个服务，Tracing通过TraceID把它们串联起来。

### 2.5.1 OpenTelemetry标准

OpenTelemetry是CNCF的可观测性标准，定义了Trace、Span、Baggage三个核心概念：

| 概念 | 说明 | 示例 |
|------|------|------|
| Trace | 一次完整的请求链路 | 用户下单的全过程 |
| Span | 链路中的一个操作 | 查询数据库 |
| Baggage | 跨Span传递的键值对 | 用户ID、租户ID |

### 2.5.2 Tracing中间件实现

```go
package middleware

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
    "go.opentelemetry.io/otel/propagation"
)

// Tracing 链路追踪中间件
func Tracing(serviceName string) Middleware {
    tracer := otel.Tracer(serviceName)
    propagator := propagation.TraceContext{}
    
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            // 从请求头提取上游Trace上下文
            parentCtx := propagator.Extract(ctx.Request.Context(), 
                propagation.HeaderCarrier(ctx.Request.Header))
            
            // 创建Span
            spanName := ctx.Request.Method + " " + ctx.Request.URL.Path
            spanCtx, span := tracer.Start(parentCtx, spanName,
                trace.WithSpanKind(trace.SpanKindServer),
            )
            defer span.End()
            
            // 注入TraceID到Context
            traceID := span.SpanContext().TraceID().String()
            ctx.Set("trace_id", traceID)
            
            // 将span context注入到request context
            ctx.Request = ctx.Request.WithContext(spanCtx)
            
            // 注入traceID到响应头
            traceID = span.SpanContext().TraceID().String()
            ctx.SetHeader("X-Trace-ID", traceID)
            
            // 执行下一个Handler
            next(ctx)
            
            // 记录Span属性
            span.SetAttributes(
                attribute.Int("http.status_code", ctx.StatusCode),
                attribute.String("http.method", ctx.Request.Method),
                attribute.String("http.url", ctx.Request.URL.String()),
            )
            
            // 如果状态码 >= 400，标记为错误
            if ctx.StatusCode >= 400 {
                span.SetStatus(codes.Error, 
                    fmt.Sprintf("HTTP %d", ctx.StatusCode))
            }
        }
    }
}
```

### 2.5.3 在服务间传播TraceID

```go
// HTTP客户端传播TraceID
func httpClientMiddleware(tracer trace.Tracer) middleware.Middleware {
    return func(next middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            span := trace.SpanFromContext(ctx)
            
            // 将span context注入到HTTP请求头
            propagator := propagation.TraceContext{}
            carrier := propagation.HeaderCarrier(req.(*http.Request).Header)
            propagator.Inject(ctx, carrier)
            
            return next(ctx, req)
        }
    }
}
```

> TraceID是分布式系统的"DNA"——一个请求经过多少个服务，只要用同一个TraceID就能完整还原。

---

## 2.6 实现Metric指标监控中间件

指标监控帮助我们从宏观层面了解系统状态：QPS、延迟分布、错误率。

### 2.6.1 Metrics类型

Prometheus定义了四种指标类型：

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| Counter | 单调递增计数器 | 请求总数、错误总数 |
| Gauge | 可增可减的值 | 当前连接数、内存使用 |
| Histogram | 分布统计 | 请求延迟分布 |
| Summary | 分位数统计 | 99线、999线延迟 |

### 2.6.2 Metric中间件实现

```go
package middleware

import (
    "time"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
)

var (
    // 请求计数器
    httpRequestsTotal = promauto.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "path", "status"},
    )
    
    // 请求延迟直方图
    httpRequestDuration = promauto.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration in seconds",
            Buckets: []float64{0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
        },
        []string{"method", "path"},
    )
    
    // 当前活跃请求数
    httpRequestsInFlight = promauto.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "http_requests_in_flight",
            Help: "Number of HTTP requests in flight",
        },
        []string{"method"},
    )
)

// Metric 指标监控中间件
func Metric() Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            method := ctx.Request.Method
            path := ctx.Request.URL.Path
            
            // 前置：增加活跃请求计数
            httpRequestsInFlight.WithLabelValues(method).Inc()
            
            start := time.Now()
            
            // 执行下一个Handler
            next(ctx)
            
            // 后置：记录指标
            duration := time.Since(start).Seconds()
            status := fmt.Sprintf("%d", ctx.StatusCode)
            
            httpRequestsTotal.WithLabelValues(method, path, status).Inc()
            httpRequestDuration.WithLabelValues(method, path).Observe(duration)
            httpRequestsInFlight.WithLabelValues(method).Dec()
        }
    }
}
```

### 2.6.3 暴露Prometheus指标端点

```go
// 注册指标端点
func registerMetricsEndpoint(r *Router) {
    r.GET("/metrics", func(ctx *Context) {
        promhttp.Handler().ServeHTTP(ctx.ResponseWriter, ctx.Request)
    })
}
```

> 没有指标的系统是黑盒。你不需要每个指标都看，但你需要在出问题时有的看。

---

## 2.7 实现Recovery中间件

Panic是Go程序中最不可控的错误——一旦发生，整个请求崩溃，甚至可能导致服务不可用。Recovery中间件是Web框架的"安全网"。

### 2.7.1 基础Recovery实现

```go
package middleware

import (
    "fmt"
    "log"
    "net/http"
    "runtime/debug"
)

// Recovery panic恢复中间件
func Recovery() Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            defer func() {
                if err := recover(); err != nil {
                    // 获取堆栈信息
                    stack := debug.Stack()
                    
                    // 记录错误日志
                    log.Printf("[PANIC] %v\n%s", err, stack)
                    
                    // 返回500错误
                    ctx.StatusCode = http.StatusInternalServerError
                    ctx.JSON(map[string]interface{}{
                        "code":    500,
                        "message": "Internal Server Error",
                        "request_id": ctx.GetString("request_id"),
                    })
                    
                    // 不调用next，中断执行
                }
            }()
            
            // 正常执行下一个Handler
            next(ctx)
        }
    }
}
```

### 2.7.2 增强版Recovery：支持错误上报

生产环境中，panic不仅要恢复，还需要上报到错误追踪系统（如Sentry）：

```go
// EnhancedRecovery 增强版Recovery中间件
func EnhancedRecovery(reporter ErrorReporter) Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            defer func() {
                if err := recover(); err != nil {
                    stack := debug.Stack()
                    
                    // 构造错误上下文
                    errorCtx := ErrorContext{
                        Error:      fmt.Sprintf("%v", err),
                        Stack:      string(stack),
                        Method:     ctx.Request.Method,
                        Path:       ctx.Request.URL.Path,
                        Headers:    ctx.Request.Header,
                        Query:      ctx.Request.URL.Query(),
                        Body:       readBody(ctx.Request),
                        RequestID:  ctx.GetString("request_id"),
                        TraceID:    ctx.GetString("trace_id"),
                        Timestamp:  time.Now(),
                    }
                    
                    // 异步上报错误
                    go reporter.Report(errorCtx)
                    
                    // 记录本地日志
                    log.Printf("[PANIC] request_id=%s error=%v\n%s",
                        errorCtx.RequestID, err, stack)
                    
                    // 返回500
                    ctx.StatusCode = http.StatusInternalServerError
                    ctx.JSON(map[string]interface{}{
                        "code":      500,
                        "message":   "Internal Server Error",
                        "request_id": errorCtx.RequestID,
                        "trace_id":   errorCtx.TraceID,
                    })
                }
            }()
            
            next(ctx)
        }
    }
}

// ErrorContext 错误上下文
type ErrorContext struct {
    Error     string
    Stack     string
    Method    string
    Path      string
    Headers   http.Header
    Query     url.Values
    Body      string
    RequestID string
    TraceID   string
    Timestamp time.Time
}

// ErrorReporter 错误上报接口
type ErrorReporter interface {
    Report(ctx ErrorContext)
}
```

> Recovery中间件是Web框架的"安全气囊"——你希望永远用不到它，但绝不能没有它。

---

## 2.8 错误处理：返回特定错误页面或重定向

除了panic恢复，Web框架还需要统一处理业务错误——比如返回自定义错误页面、重定向到登录页、或者返回JSON格式的错误信息。

### 2.8.1 统一错误处理中间件

```go
// ErrorHandling 错误处理中间件
func ErrorHandling() Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            next(ctx)
            
            // 检查是否有错误
            if ctx.Error == nil {
                return
            }
            
            // 根据错误类型处理
            switch e := ctx.Error.(type) {
            case *BusinessError:
                // 业务错误：返回JSON
                ctx.StatusCode = e.HTTPStatus
                ctx.JSON(map[string]interface{}{
                    "code":    e.Code,
                    "message": e.Message,
                    "detail":  e.Detail,
                })
                
            case *AuthError:
                // 鉴权错误：重定向到登录页
                if isAPIRequest(ctx.Request) {
                    ctx.StatusCode = 401
                    ctx.JSON(map[string]string{
                        "error": "unauthorized",
                    })
                } else {
                    ctx.Redirect(http.StatusFound, "/login")
                }
                
            case *NotFoundError:
                // 未找到：返回404页面
                ctx.StatusCode = 404
                if wantsHTML(ctx.Request) {
                    ctx.HTML("404.html", map[string]interface{}{
                        "path": ctx.Request.URL.Path,
                    })
                } else {
                    ctx.JSON(map[string]string{
                        "error": "not found",
                        "path":  ctx.Request.URL.Path,
                    })
                }
                
            default:
                // 未知错误：返回500
                ctx.StatusCode = 500
                ctx.JSON(map[string]string{
                    "error": "internal server error",
                })
            }
        }
    }
}

// BusinessError 业务错误
type BusinessError struct {
    Code       int
    Message    string
    Detail     string
    HTTPStatus int
}

func (e *BusinessError) Error() string {
    return fmt.Sprintf("[%d] %s: %s", e.Code, e.Message, e.Detail)
}

// AuthError 鉴权错误
type AuthError struct {
    Reason string
}

func (e *AuthError) Error() string {
    return "auth error: " + e.Reason
}

// NotFoundError 未找到错误
type NotFoundError struct {
    Resource string
}

func (e *NotFoundError) Error() string {
    return "not found: " + e.Resource
}
```

### 2.8.2 在业务Handler中使用错误

```go
// 业务Handler中设置错误
func GetUserHandler(ctx *Context) {
    id := ctx.Param("id")
    
    user, err := getUser(id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            ctx.Error = &NotFoundError{Resource: "user:" + id}
            return
        }
        ctx.Error = &BusinessError{
            Code:       1001,
            Message:    "获取用户失败",
            Detail:     err.Error(),
            HTTPStatus: 500,
        }
        return
    }
    
    ctx.JSON(user)
}

func isAPIRequest(r *http.Request) bool {
    return strings.HasPrefix(r.URL.Path, "/api/") ||
        r.Header.Get("Accept") == "application/json"
}

func wantsHTML(r *http.Request) bool {
    return strings.Contains(r.Header.Get("Accept"), "text/html")
}
```

> 统一错误处理的目标是：业务代码只管抛错，框架负责用最合适的方式告诉用户出错了。

---

## 2.9 中间件注册与执行顺序

### 2.9.1 中间件注册

```go
// Router 路由器
type Router struct {
    middlewares []Middleware
    routes      *RouteTree
}

// Use 注册全局中间件
func (r *Router) Use(mw ...Middleware) {
    r.middlewares = append(r.middlewares, mw...)
}

// Group 路由分组（支持组级别中间件）
func (r *Router) Group(prefix string, mws ...Middleware) *RouterGroup {
    return &RouterGroup{
        prefix:      prefix,
        middlewares: append(r.middlewares, mws...),
        router:      r,
    }
}

// RouterGroup 路由分组
type RouterGroup struct {
    prefix      string
    middlewares []Middleware
    router      *Router
}

func (g *RouterGroup) GET(path string, handler HandlerFunc) {
    g.handle("GET", g.prefix+path, handler)
}

func (g *RouterGroup) handle(method, path string, handler HandlerFunc) {
    // 构建中间件链
    chain := handler
    for i := len(g.middlewares) - 1; i >= 0; i-- {
        chain = g.middlewares[i](chain)
    }
    
    g.router.routes.Add(method, path, chain)
}
```

### 2.9.2 中间件执行顺序

中间件的注册顺序决定了执行顺序。看一个完整的例子：

```go
r := NewRouter()

// 全局中间件（所有请求都经过）
r.Use(Recovery())              // 1. panic恢复（最外层）
r.Use(StructuredAccessLog())   // 2. 访问日志
r.Use(Tracing("my-service"))   // 3. 链路追踪
r.Use(Metric())                // 4. 指标监控

// API组中间件
api := r.Group("/api")
api.Use(authMiddleware)        // 5. 鉴权

// V1组中间件
v1 := api.Group("/v1")
v1.Use(rateLimitMiddleware)    // 6. 限流

// 注册路由
v1.GET("/users/:id", GetUserHandler)
```

执行顺序（洋葱模型）：

```
请求进入
  → Recovery 前置：defer recover设置
    → AccessLog 前置：记录请求信息
      → Tracing 前置：创建Span
        → Metric 前置：增加活跃请求计数
          → Auth 前置：验证Token
            → RateLimit 前置：检查限流
              → GetUserHandler 执行
            → RateLimit 后置：（无）
          → Auth 后置：（无）
        → Metric 后置：记录延迟指标
      → Tracing 后置：结束Span，记录属性
    → AccessLog 后置：记录响应信息
  → Recovery 后置：defer触发（如有panic则恢复）
响应返回
```

### 2.9.3 中间件顺序的最佳实践

| 顺序 | 中间件 | 原因 |
|------|--------|------|
| 1 | Recovery | 最外层，确保所有panic都能被恢复 |
| 2 | AccessLog | 尽早记录，捕获所有请求信息 |
| 3 | Tracing | 在日志之后，确保TraceID可以被日志使用 |
| 4 | Metric | 在业务逻辑之前统计，确保准确性 |
| 5 | CORS | 在鉴权之前，避免预检请求被拒绝 |
| 6 | Auth | 在限流之前，先验证身份再限流 |
| 7 | RateLimit | 在业务之前，保护后端服务 |
| 8 | 业务Handler | 最内层 |

> 中间件顺序不是"随便排"的——Recovery必须在最外层，否则它内部的panic就没人兜底了。这种细节就是面试官爱问的。

---

## 2.10 面试要点

### 2.10.1 高频面试题

**Q1：Gin中间件的执行顺序是怎样的？**

Gin中间件采用洋葱模型，注册顺序就是执行顺序。先按注册顺序执行所有中间件的前置逻辑，然后执行业务Handler，最后按逆序执行所有中间件的后置逻辑。通过`c.Next()`控制流程传递，通过`c.Abort()`中断链。

**Q2：Recovery中间件为什么必须放在最外层？**

Recovery通过`defer recover()`捕获panic。如果放在内层，外层中间件的panic就无法被捕获。放在最外层确保整个中间件链和业务Handler的panic都能被恢复。

**Q3：洋葱模式和责任链模式的区别？**

洋葱模式是责任链模式的变体。责任链模式中，每个处理者可以选择处理或传递，但不保证"回来"。洋葱模式通过`Next()`的前后逻辑，保证了请求和响应都能被同一中间件处理。

**Q4：如何实现中间件的条件执行？**

通过`Abort()`中断链。例如鉴权中间件验证Token失败后调用`Abort()`，后续中间件和业务Handler都不会执行。

**Q5：中间件和装饰器模式的区别？**

装饰器模式强调"增强"已有功能，中间件强调"拦截"请求。实现上非常相似，都是包装函数。但中间件通常用于请求/响应管道，装饰器更通用。

### 2.10.2 中间件机制对比表

| 特性 | 责任链 | 洋葱模型 | 拦截器 |
|------|--------|----------|--------|
| 前后处理 | 仅前置或后置 | 同一函数 | 分离的方法 |
| 中断能力 | 不传递 | Abort() | PreHandle返回false |
| 适用场景 | 简单管道 | Web框架 | Servlet风格 |
| 代表框架 | — | Gin, Echo | Beego, Spring |

> 面试时被问AOP，不要只说"中间件"。要说清楚是哪种模式，前后处理怎么做的，怎么中断的。这才是架构师的表达。

---

## 2.11 完整中间件链组装示例

把这一章的所有中间件组装起来：

```go
package main

import (
    "log"
    "net/http"
    
    "go.uber.org/zap"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
    logger, _ := zap.NewProduction()
    defer logger.Sync()
    
    r := NewRouter()
    
    // 最外层：Recovery
    r.Use(Recovery())
    
    // 访问日志
    r.Use(StructuredAccessLog(logger))
    
    // 链路追踪
    r.Use(Tracing("user-service"))
    
    // 指标监控
    r.Use(Metric())
    
    // CORS
    r.Use(corsMiddleware())
    
    // 指标端点（不需要鉴权）
    r.GET("/metrics", func(ctx *Context) {
        promhttp.Handler().ServeHTTP(ctx.ResponseWriter, ctx.Request)
    })
    
    // API组（需要鉴权）
    api := r.Group("/api")
    api.Use(authMiddleware())
    
    // V1组（需要限流）
    v1 := api.Group("/v1")
    v1.Use(rateLimitMiddleware(100)) // 100 QPS
    
    v1.GET("/users/:id", GetUserHandler)
    v1.POST("/users", CreateUserHandler)
    v1.PUT("/users/:id", UpdateUserHandler)
    v1.DELETE("/users/:id", DeleteUserHandler)
    
    // 错误处理中间件（最内层，在业务Handler之前注册）
    // 实际上应该根据具体框架设计调整位置
    
    log.Println("Server starting on :8080")
    http.ListenAndServe(":8080", r)
}

func corsMiddleware() Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            ctx.SetHeader("Access-Control-Allow-Origin", "*")
            ctx.SetHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            ctx.SetHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            
            if ctx.Request.Method == "OPTIONS" {
                ctx.StatusCode = 204
                return
            }
            
            next(ctx)
        }
    }
}

func authMiddleware() Middleware {
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            token := ctx.GetHeader("Authorization")
            if token == "" {
                ctx.StatusCode = 401
                ctx.JSON(map[string]string{"error": "unauthorized"})
                return
            }
            
            claims, err := parseToken(token)
            if err != nil {
                ctx.StatusCode = 401
                ctx.JSON(map[string]string{"error": "invalid token"})
                return
            }
            
            ctx.Set("user_id", claims.UserID)
            ctx.Set("user_role", claims.Role)
            
            next(ctx)
        }
    }
}

func rateLimitMiddleware(qps int) Middleware {
    limiter := rate.NewLimiter(rate.Limit(qps), qps*2)
    
    return func(next HandlerFunc) HandlerFunc {
        return func(ctx *Context) {
            if !limiter.Allow() {
                ctx.StatusCode = 429
                ctx.JSON(map[string]string{
                    "error": "rate limit exceeded",
                })
                return
            }
            next(ctx)
        }
    }
}
```

---

## 2.12 系列进度与下章预告

### 系列进度 2/16

| 章节 | 主题 | 状态 |
|------|------|------|
| 第1章 | Web框架核心设计 | 已完成 |
| 第2章 | AOP方案设计 | 本篇 |
| 第3章 | Web框架高级功能 | 下一篇 |
| ... | ... | ... |

### 下章预告

下一篇我们讲**Web框架高级功能**——文件上传下载、模板引擎渲染、Option模式与泛型、静态资源服务器设计、Session机制实现，以及实战项目：手写完整Web框架实现用户注册登录。从理论到实战，把前两章的知识全部落地。

> 关注怕浪猫，这个系列帮你从0到1手写Go Web框架。下期内容更硬核，别错过。

---

### 怕浪猫说

AOP不是什么高深的技术，它本质就是把"重复的横切逻辑"提取出来，统一处理。但它的价值不可小觑——你见过的所有"优雅"的框架，背后都有AOP的影子。

理解了洋葱模型、责任链、拦截器这三种模式，再去看Gin、Kratos、Spring的源码，你会发现它们都在做同一件事：用不同的方式实现同一个思想。

下一章我们开始写真正的业务功能——文件上传、页面渲染、Session管理。那时候你会发现，有了AOP的加持，业务代码可以写得多干净。

收藏起来，下次写中间件的时候直接照抄。你踩过哪个中间件的坑？评论区说说。

关注怕浪猫，下期我们讲Web框架高级功能。系列进度 2/16，我们下篇见。
