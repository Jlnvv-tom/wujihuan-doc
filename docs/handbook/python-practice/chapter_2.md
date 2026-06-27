# 第2章 中间件与AOP方案设计

你有没有经历过这种绝望时刻：线上接口突然504，排查发现是某个慢SQL拖垮了整个请求链路，但你完全不知道是哪个请求触发的，因为日志里根本没有请求ID；又或者，你写了20个接口，每个接口开头都在重复写同样的鉴权代码、同样的参数校验、同样的异常捕获，复制粘贴到手酸；再或者，产品突然说要给所有接口加限流，你看着100多个视图函数，陷入了沉思。

如果你中了以上任何一枪，恭喜你，你需要的就是AOP（面向切面编程）和中间件。这两样东西能让你从重复劳动中解放出来，把横切关注点统一切出去，让业务代码回归纯粹。

我是怕浪猫，这是Python实战训练营的第2周内容。上一章我们搭好了项目骨架，这一章我来带你彻底搞懂中间件和AOP方案设计，从原理到实战，从踩坑到填坑，全程代码驱动。

## 一、AOP设计模式详解

在讲具体框架之前，我们先把AOP的三大基石搞清楚：装饰器模式、中间件模式、上下文管理器。这三个东西看似不同，本质上都是在解决同一个问题——如何在不修改业务代码的前提下，横向注入额外逻辑。

### 1.1 装饰器模式（Decorator）

装饰器是Python中最纯粹的AOP实现。它的核心思想很简单：接收一个函数，返回一个增强版函数，原函数逻辑不变。

先看一个最基础的装饰器：

```python
import time
from functools import wraps

def timer(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} 耗时 {elapsed:.4f}s")
        return result
    return wrapper
```

这段代码大家都能看懂，但怕浪猫要问一个问题：为什么要加`@wraps(func)`？去掉会怎样？

去掉之后，`func.__name__`就变成了`wrapper`，`func.__doc__`也丢了。这在调试时是灾难——日志里全是`wrapper`在调用`wrapper`，你根本不知道实际执行的是哪个函数。更严重的是，如果你用了基于函数名做路由分发的框架，路由直接就挂了。

> 装饰器不是语法糖，是契约。你包装了别人的函数，就要替别人保管好身份信息。

`functools.wraps`本质上做了这件事：把被装饰函数的`__name__`、`__doc__`、`__module__`、`__qualname__`、`__dict__`和`__wrapped__`属性全部复制到wrapper上。其中`__wrapped__`属性特别重要，它指向原始函数，后面我们会看到它的妙用。

#### 带参数的装饰器

实际项目中，装饰器往往需要接收参数。比如一个重试装饰器：

```python
def retry(max_retries=3, delay=1.0, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if attempt < max_retries:
                        time.sleep(delay * (2 ** attempt))
            raise last_exc
        return wrapper
    return decorator
```

这里有个容易踩的坑：带参数装饰器实际上有三层嵌套。最外层接收参数，中间层接收函数，最内层执行逻辑。第一次写的时候很容易少一层，直接把参数和函数混在一起，然后报错`TypeError: argument of type 'int' is not callable`，一脸懵逼。

还有一点，`exceptions`参数我用了元组而不是列表。元组是不可变对象，作为默认参数更安全，避免了可变默认参数的经典陷阱。

#### 类装饰器

装饰器不一定非得是函数，类也可以。类装饰器的优势在于可以用面向对象的方式管理状态：

```python
class CallCounter:
    def __init__(self, func):
        wraps(func)(self)
        self.func = func
        self.call_count = 0

    def __call__(self, *args, **kwargs):
        self.call_count += 1
        return self.func(*args, **kwargs)
```

类装饰器的关键在于`__call__`方法。`wraps(func)(self)`这一行可能看着奇怪，它的作用是把func的属性复制到实例self上，和函数装饰器中的`@wraps(func)`效果一样。

踩坑提醒：类装饰器装饰的函数，`inspect.signature`可能无法正确解析。如果你的框架依赖`inspect.signature`来提取参数信息（比如FastAPI的依赖注入），类装饰器会导致参数提取失败。这种场景下，优先用函数装饰器。

#### __wrapped__的实际用途

假设你需要在一个装饰器层层嵌套的函数上，提取原始函数的签名信息：

```python
@log_call
@auth_required
def create_order(user_id: int, product_id: int, quantity: int = 1):
    """创建订单"""
    return {"user_id": user_id, "product_id": product_id}
```

当你调用`inspect.signature(create_order)`时，因为有`__wrapped__`链，`inspect`会自动穿透所有装饰器，返回最原始的签名`(user_id: int, product_id: int, quantity: int = 1)`。如果你忘了加`@wraps`，`inspect.signature`返回的就是`(*args, **kwargs)`，框架就瞎了。

> 偷懒少写一个@wraps，调试多花两小时。装饰器的标配不是参数，是wraps。

### 1.2 中间件模式（Middleware）

如果说装饰器是函数级别的AOP，那中间件就是请求级别的AOP。中间件模式的核心是洋葱模型——请求从外向内穿透，响应从内向外返回，每一层都可以在请求前和响应后做处理。

来看一个最简化的洋葱模型实现：

```python
async def middleware_a(request, handler):
    print("A - 请求前")
    response = await handler(request)
    print("A - 响应后")
    return response

def compose(middlewares: list, final_handler):
    async def composed(request):
        async def run(index):
            if index >= len(middlewares):
                return await final_handler(request)
            return await middlewares[index](request, lambda req: run(index + 1))
        return await run(0)
    return composed
```

执行顺序是：A请求前 -> B请求前 -> final_handler -> B响应后 -> A响应后。这就是洋葱模型的精髓——先进后出。

但这里有一个极其隐蔽的坑：如果中间件B在请求前阶段抛出异常，那么B的响应后逻辑和A的响应后逻辑都不会执行。这在生产环境中是个大问题——你的日志中间件在外层，鉴权中间件在内层抛了异常，结果日志中间件的响应后逻辑没执行，请求记录就丢了。

> 中间件的洋葱模型不是万金油，异常传播路径必须提前规划好，否则线上排查时你会怀疑人生。

解决方案是使用try-finally确保响应后逻辑一定执行，或者引入错误处理中间件放在最内层捕获异常。

### 1.3 上下文管理器（Context Manager）

上下文管理器是Python中资源管理的AOP方案。它通过`with`语句确保资源用完即释放，即使中间出了异常也不影响。

标准写法是用`__enter__`和`__exit__`，但实际项目中更多使用`contextlib`：

```python
from contextlib import contextmanager, asynccontextmanager

@contextmanager
def timing(name: str = "block"):
    start = time.perf_counter()
    try:
        yield
    finally:
        print(f"[{name}] 耗时 {time.perf_counter()-start:.4f}s")

@asynccontextmanager
async def db_transaction(conn):
    await conn.execute("BEGIN")
    try:
        yield conn
        await conn.execute("COMMIT")
    except Exception:
        await conn.execute("ROLLBACK")
        raise
```

`@contextmanager`把生成器函数变成上下文管理器，`yield`之前相当于`__enter__`，`yield`之后相当于`__exit__`。

踩坑点：如果with块内代码抛出异常，生成器的`yield`表达式会重新抛出该异常。如果你在`yield`后面没有try-finally，清理代码就不会执行。记住一个原则：`yield`后面永远跟`finally`。

## 二、开源框架中间件实现对比

理论讲完了，我们来看主流框架是怎么实现中间件的。怕浪猫选了四个框架来对比：Django、Flask、FastAPI、Starlette。这四个框架代表了中间件设计的三种流派。

### 2.1 Django MiddlewareMixin链式调用

Django的中间件是最经典的链式调用模型。它定义了四个钩子方法：`process_request` -> `process_view` -> 视图函数 -> `process_response`，异常时触发`process_exception`。Django中间件的特点是钩子分明，职责清晰，但一个中间件类只能在一个阶段做一件事，想同时做请求前和响应后的处理，可读性不如洋葱模型。

### 2.2 Flask before_request/after_request/teardown_request

Flask走的是钩子函数注册制。你不需要写中间件类，只需要用装饰器注册钩子：

```python
@app.before_request
def before():
    g.start_time = time.time()

@app.after_request
def after(response):
    elapsed = time.time() - g.start_time
    response.headers["X-Response-Time"] = f"{elapsed:.4f}s"
    return response

@app.teardown_request
def teardown(exc):
    if exc:
        app.logger.error(f"请求异常: {exc}", exc_info=True)
```

Flask的三个钩子职责分明：`before_request`做请求前处理，`after_request`做响应后处理，`teardown_request`在请求结束时清理资源（无论是否异常都会执行）。但钩子之间没有洋葱模型的嵌套关系，执行顺序取决于注册顺序，不够灵活。

### 2.3 FastAPI ASGI中间件与依赖注入

FastAPI建立在Starlette之上，它的中间件系统分为两层：ASGI中间件（标准洋葱模型）和依赖注入（通过`Depends`注入横切逻辑）。依赖注入的优势在于可以直接访问请求参数，支持嵌套依赖。但它的执行时机不如中间件灵活——只在路由匹配后、视图执行前生效，无法做响应后处理。

### 2.4 Starlette纯ASGI中间件

Starlette是FastAPI的底层框架，中间件是纯ASGI实现，最接近洋葱模型的本质。核心是包装`send`函数——通过包装`send`，你可以在响应发送时注入自定义逻辑，不需要框架提供特定的钩子，直接拦截底层协议。

### 框架中间件机制对比

| 维度 | Django | Flask | FastAPI | Starlette |
|------|--------|-------|---------|-----------|
| 中间件模型 | 链式调用 | 钩子注册 | ASGI洋葱+DI | 纯ASGI洋葱 |
| 请求前处理 | process_request | before_request | ASGI/Depends | __call__前半段 |
| 响应后处理 | process_response | after_request | ASGI中间件 | __call__后半段 |
| 异常处理 | process_exception | teardown_request | ExceptionMiddleware | try/except |
| 执行顺序 | MIDDLEWARE列表逆序 | 注册顺序 | 添加顺序逆序 | 添加顺序逆序 |
| 异步支持 | 部分(4.0+) | 不支持 | 原生ASGI | 原生ASGI |
| 依赖注入 | 无 | 无 | Depends嵌套 | 无 |
| 学习成本 | 中等 | 低 | 中高 | 高 |

> 选框架不是选最好的，是选最合适的。你的团队如果全是Django老兵，别为了异步硬切FastAPI，迁移成本会教你做人。

## 三、为Web框架提供AOP支持

理论对比完了，接下来进入实战环节。怕浪猫要带你手写六个生产级中间件，覆盖Web开发中最常见的横切关注点。

### 3.1 Access Log中间件

Access Log是最基础的中间件，每个请求都要记录日志。看似简单，但踩坑点不少。

```python
class AccessLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex
        method, path = scope["method"], scope["path"]
        client = scope.get("client", ("unknown", 0))[0]
        start = time.perf_counter()
        status_code = 0

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            logger.info(json.dumps({
                "request_id": request_id, "method": method,
                "path": path, "status": status_code,
                "elapsed_ms": round(elapsed, 2), "client": client,
            }, ensure_ascii=False))
```

几个关键设计决策：

`request_id`在中间件层生成，确保每个请求都有唯一标识。这个ID应该透传到日志、链路追踪、响应头中，方便全链路排查。

用`nonlocal status_code`在`send_wrapper`中捕获状态码。ASGI协议中，`http.response.start`消息包含状态码，你只能在这个时机拿到。

日志用`json.dumps`格式化。结构化日志是生产环境的标配，ELK等日志系统可以直接解析JSON字段，比正则匹配文本日志高效一百倍。

踩坑记录：有团队成员把日志写在`send_wrapper`里面，每次`send`被调用就记一条。结果一个分块传输的响应产生了20条日志，日志量直接爆炸。记住，Access Log在`finally`块里只记一次。

### 3.2 CORS中间件

CORS（跨域资源共享）是前后端分离项目的必装中间件。原理不复杂，但细节容易出错。

```python
class CORSMiddleware:
    def __init__(self, app, allow_origins=None, allow_credentials=False):
        self.app = app
        self.allow_origins = set(allow_origins or ["*"])
        self.allow_credentials = allow_credentials

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode()

        if scope["method"] == "OPTIONS" and origin:
            await self._handle_preflight(origin, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                if self._is_allowed(origin):
                    msg_headers = message.setdefault("headers", [])
                    msg_headers.append((b"access-control-allow-origin", origin.encode()))
            await send(message)

        await self.app(scope, receive, send_wrapper)
```

CORS中间件的核心逻辑有两个分支：OPTIONS预检请求直接返回204，其他请求在响应头中注入CORS头。

踩坑提醒：`allow_credentials=True`时，`allow_origins`不能为`["*"]`。浏览器会直接拒绝带凭证的跨域请求如果Origin是通配符。如果你需要支持凭证，必须明确指定允许的Origin列表。

> CORS不是后端的安全机制，是浏览器的安全机制。后端加CORS头只是告诉浏览器"我允许这个来源"，真正拦截的是浏览器。

### 3.3 Auth中间件（JWT Token校验）

Auth中间件是最容易出安全问题的中间件。我们用JWT来做Token校验：

```python
class JWTAuthMiddleware:
    def __init__(self, app, secret_key: str, exempt_paths=None):
        self.app = app
        self.secret_key = secret_key
        self.exempt_paths = exempt_paths or {"/login", "/health"}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["path"] in self.exempt_paths:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        auth = headers.get(b"authorization", b"").decode()
        if not auth.startswith("Bearer "):
            await self._reject(send, 401, "缺少认证Token")
            return

        try:
            payload = jwt.decode(auth[7:], self.secret_key, algorithms=["HS256"])
            scope["user"] = payload
        except jwt.InvalidTokenError:
            await self._reject(send, 401, "无效Token")
            return

        await self.app(scope, receive, send)
```

关键设计点：

`exempt_paths`用set而不是list，因为set的`in`操作是O(1)。Token解析后把payload存入`scope["user"]`，后续视图函数和依赖注入都可以从scope读取用户信息。

踩坑记录：有一次生产环境大量请求返回401，排查发现是服务器时钟漂移了30秒，导致签发的Token立刻过期。解决方案是加`leeway`参数容忍时钟偏差：`jwt.decode(token, key, algorithms=["HS256"], leeway=30)`。

### 3.4 Rate Limiting中间件（令牌桶算法）

限流是保护服务不被打垮的关键手段。令牌桶算法的核心思想是：以固定速率往桶里放令牌，桶满了就溢出；每个请求消耗一个令牌，桶空了就拒绝。

```python
class TokenBucketRateLimitMiddleware:
    def __init__(self, app, rate=10, capacity=20):
        self.app = app
        self.rate = rate
        self.capacity = capacity
        self.buckets = defaultdict(
            lambda: {"tokens": capacity, "last": time.time()})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        client_ip = scope.get("client", ("unknown", 0))[0]
        if not self._allow(client_ip):
            body = json.dumps({"detail": "请求过于频繁"}).encode()
            await send({"type": "http.response.start", "status": 429,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)

    def _allow(self, key):
        bucket = self.buckets[key]
        now = time.time()
        bucket["tokens"] = min(self.capacity,
            bucket["tokens"] + (now - bucket["last"]) * self.rate)
        bucket["last"] = now
        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return True
        return False
```

令牌桶算法的关键在`_allow`方法：先按速率补充令牌（不超容量），再尝试消耗一个。

两个踩坑点：

第一，`defaultdict`在多进程环境下不共享。如果你用gunicorn启动了4个worker，每个worker有自己独立的限流数据，实际限流效果是配置值的4倍。解决方案是用Redis做分布式令牌桶。

第二，`self.buckets`会无限增长。每个新IP都会创建一个新桶，恶意攻击者可以用大量不同IP把内存撑爆。解决方案是定期清理过期桶。

> 限流不是为了拒绝用户，是为了保护系统。宁可让少数请求等一等，也别让整个服务挂掉。

### 3.5 Error Handling统一异常处理

生产环境中最怕的不是接口报错，而是报了错你不知道，或者错误信息直接暴露给用户。

```python
class ErrorHandlingMiddleware:
    def __init__(self, app, debug=False):
        self.app = app
        self.debug = debug

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            logger.error(f"未处理异常: {exc}\n{traceback.format_exc()}")
            if not response_started:
                body = json.dumps({
                    "code": 500,
                    "message": str(exc) if self.debug else "服务器内部错误"
                }, ensure_ascii=False).encode()
                await send({"type": "http.response.start", "status": 500,
                            "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": body})
```

设计要点：`debug`模式控制错误信息粒度，生产环境千万别开debug，否则SQL语句、文件路径都会泄露。`response_started`检查是关键——如果响应已开始发送（流式响应场景），就不能再发送新的错误响应了。

> 异常处理中间件是最后一道防线，它不优雅，但必须有。没有它的系统就像没有安全网的走钢丝。

### 3.6 Gzip压缩中间件

Gzip压缩能显著减少响应体积，API返回大量JSON时压缩率通常达60%-80%。实现思路是：收集所有响应体片段，判断是否需要压缩（大于minimum_size才压缩），压缩后替换content-length。

`minimum_size=500`：太小的响应压缩反而更大（gzip头本身有开销）。`level=6`是性能和压缩率的平衡点，也是Nginx默认值。

踩坑点：缓冲整个响应体到内存的实现不适合流式响应。流式压缩在ASGI中实现复杂，一般建议在Nginx层做Gzip，应用层只做业务逻辑。Nginx的`gzip_proxied`指令可以精确控制哪些响应需要压缩，性能也比Python好得多。

> 压缩在网关层做，应用层只关心业务逻辑。让专业的人做专业的事，中间件也一样。

## 四、中间件组合与执行顺序

六个中间件写完了，但怎么组合使用是个大问题。中间件的注册顺序直接决定了执行顺序，顺序错了可能出安全漏洞。

### 中间件注册顺序的标准模板

| 顺序 | 中间件 | 职责 | 位置原因 |
|------|--------|------|----------|
| 1 | ErrorHandling | 全局异常兜底 | 最外层，捕获所有异常 |
| 2 | AccessLog | 访问日志 | 记录所有请求和响应 |
| 3 | Gzip | 响应压缩 | 在日志之后，避免影响日志 |
| 4 | CORS | 跨域处理 | 在鉴权之前，允许预检请求 |
| 5 | RateLimit | 限流 | 在鉴权之前，防止暴力破解 |
| 6 | JWTAuth | 鉴权 | 最内层，保护业务接口 |

为什么ErrorHandling在最外层？因为任何中间件都可能抛异常，它必须包裹所有其他中间件才能兜底。

为什么RateLimit在JWTAuth之前？因为鉴权本身有成本（JWT解析验证），不先限流的话攻击者可以用大量请求把鉴权中间件打满CPU。

```python
# FastAPI中的注册示例
app.add_middleware(ErrorHandlingMiddleware, debug=False)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(GzipMiddleware, minimum_size=500)
app.add_middleware(CORSMiddleware, allow_origins=["https://example.com"])
app.add_middleware(TokenBucketRateLimitMiddleware, rate=10, capacity=20)
app.add_middleware(JWTAuthMiddleware, secret_key="your-secret-key")
```

注意FastAPI/Starlette中间件的注册顺序和执行顺序是反的：后注册的中间件在洋葱模型的外层。所以上面代码中ErrorHandling最后注册但实际在最外层执行。这一点非常反直觉，是新手最容易踩的坑之一。

> 中间件顺序不是排着排着就对了，它是安全的第一道防线。搞反了鉴权和限流的位置，等于把门锁装在了花园里。

## 五、装饰器与中间件的协同使用

装饰器和中间件不是互斥的，它们可以协同工作。一个常见的模式是：中间件负责全局策略，装饰器负责细粒度控制。

比如，JWTAuth中间件负责全局鉴权，但某些接口需要额外的权限检查。这时可以用装饰器：

```python
def require_role(role: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = args[0]
            user = request.scope.get("user", {})
            if role not in user.get("roles", []):
                raise HTTPException(status_code=403, detail=f"需要{role}权限")
            return await func(*args, **kwargs)
        return wrapper
    return decorator

@app.get("/admin/users")
@require_role("admin")
async def list_users(request):
    return {"users": []}
```

鉴权的通用逻辑（Token解析、过期校验）在中间件中统一处理，细粒度的权限控制在装饰器中按需配置。两者各司其职，互不干扰。

另一个常见协同场景是缓存。中间件缓存整个响应，装饰器缓存函数级别结果，各有各的适用场景。

> 中间件是面，装饰器是点。面面俱到不如点面结合，架构设计如此，代码组织也如此。

## 六、性能考量与最佳实践

### 6.1 性能检查清单

1. 异步中间件不要有同步阻塞操作。`time.sleep()`、`requests.get()`都会阻塞事件循环，用`asyncio.sleep()`、`httpx.AsyncClient`替代。

2. 避免重复计算。多个中间件都需要的数据，解析一次存入scope。

3. 日志序列化是性能瓶颈。高QPS场景用`orjson`替代标准库`json`，提升3-5倍。

4. 中间件数量控制在10个以内，100个就有明显性能差异。

### 6.2 测试策略

中间件影响所有请求，是最需要测试的代码。每个中间件至少测试三种场景：正常通过、被拒绝、边界条件。用`TestClient`做集成测试，覆盖中间件+路由的完整链路。

> 没测试的中间件就像没系安全带的高速驾驶，不出事是运气，出事是必然。

## 七、本章小结

这章我们从AOP三大模式讲起，对比了Django、Flask、FastAPI、Starlette四大框架的中间件设计，然后手写了六个生产级中间件，最后讨论了组合顺序和性能优化。

核心要点回顾：

AOP的本质是分离横切关注点。装饰器管函数级，中间件管请求级，上下文管理器管资源级。三者组合使用效果最佳。

中间件顺序是安全关键。ErrorHandling最外层兜底，RateLimit在Auth之前防暴力破解，AccessLog在Gzip之前记录原始大小。

ASGI中间件的核心是包装send函数。通过包装send，你可以在响应阶段注入自定义逻辑，这是Starlette中间件最强大的特性。

functools.wraps不是可选的。每一个装饰器都必须加@wraps，否则函数签名丢失、调试困难、框架依赖失效。

结构化日志是生产标配。JSON格式日志，每个请求带request_id，全链路追踪无死角。

## 互动与追更

这篇内容如果对你有帮助，怕浪猫有个不情之请：点个赞，收个藏，你的认可是我持续输出的动力。

有什么问题或者想法，评论区直接说，怕浪猫会在评论区蹲守答疑。特别是中间件顺序这块，如果你有更好的方案，一定要来聊聊。

下一章我们进入高级功能实现：动态路由与权限树设计、WebSocket实时通信方案、后台任务与定时调度、文件上传与对象存储对接。从中间件走向业务核心，难度升级，但也更精彩。

系列进度 2/16，怕浪猫与你同行。

> 怕浪猫说：中间件写多了，你会发现框架不过是洋葱穿串。理解了AOP的本质，什么框架都是一层皮。下一章见。
