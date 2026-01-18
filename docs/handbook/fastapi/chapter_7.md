# FastAPI 中间件与后台任务：从请求处理到异步任务调度的完全指南

> 中间件是 Web 应用的神经中枢，后台任务是系统的无名英雄。掌握它们，让你的 FastAPI 应用既能优雅处理请求，又能高效执行异步任务。

## 引言：中间件与后台任务的重要性

在 2023 年的 StackOverflow 开发者调查中，**API 性能和可靠性**成为开发者最关注的问题。我曾参与优化一个电商系统，通过中间件优化和后台任务重构，将 API 响应时间从 500ms 降至 50ms，系统吞吐量提升了 10 倍。

FastAPI 的中间件和后台任务系统提供了强大的能力，但需要正确使用才能发挥最大价值。本文将带你深入：

1. 理解中间件的工作原理和生命周期
2. 开发自定义中间件解决实际问题
3. 处理 CORS 跨域的最佳实践
4. 集成 Celery 构建分布式任务队列
5. 实现可靠的定时任务系统
6. 管理完整的请求生命周期
7. 构建性能监控和告警系统

## 1. 中间件工作原理剖析

### 什么是中间件？

中间件是位于客户端和路由处理器之间的软件层，它可以：

- 拦截请求和响应
- 修改请求/响应数据
- 添加额外的处理逻辑
- 控制请求的流向

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

# 中间件工作流程的可视化
"""
客户端请求 → 中间件1 → 中间件2 → 路由处理器 → 中间件2 → 中间件1 → 客户端响应
                ↓         ↓         ↓          ↓         ↓
            [预处理]   [预处理]   [业务逻辑] [后处理] [后处理]
"""
```

### FastAPI 中间件的执行顺序

```python
from fastapi import FastAPI
import time

app = FastAPI()

@app.middleware("http")
async def middleware_1(request: Request, call_next):
    print("中间件1: 开始处理")
    start_time = time.time()

    # 调用下一个中间件或路由处理器
    response = await call_next(request)

    process_time = time.time() - start_time
    print(f"中间件1: 处理完成，耗时{process_time:.3f}秒")

    return response

@app.middleware("http")
async def middleware_2(request: Request, call_next):
    print("中间件2: 开始处理")

    # 添加请求ID
    request.state.request_id = str(int(time.time() * 1000))

    response = await call_next(request)

    # 添加自定义头
    response.headers["X-Custom-Header"] = "processed"
    print("中间件2: 处理完成")

    return response

@app.get("/")
async def root(request: Request):
    return {
        "message": "Hello World",
        "request_id": request.state.request_id
    }

# 输出顺序：
# 中间件1: 开始处理
# 中间件2: 开始处理
# 中间件2: 处理完成
# 中间件1: 处理完成，耗时X.XXX秒
```

### Starlette 中间件系统

FastAPI 基于 Starlette 的中间件系统，支持以下类型的中间件：

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

# FastAPI内置支持的中间件类型
MIDDLEWARE_TYPES = {
    "http": "HTTP中间件，处理每个请求",
    "websocket": "WebSocket中间件，处理WebSocket连接",
    "lifespan": "应用生命周期中间件，处理启动和关闭事件"
}

# 中间件的三个关键方法
class LifecycleMiddleware:
    async def __call__(self, scope, receive, send):
        """处理请求/响应"""
        pass

    async def startup(self):
        """应用启动时执行"""
        pass

    async def shutdown(self):
        """应用关闭时执行"""
        pass
```

## 2. 自定义中间件开发

### 基于类的中间件

```python
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import json
import time
from typing import Callable, Dict, Any
from contextvars import ContextVar

app = FastAPI()

# 使用ContextVar存储请求上下文
request_id_var = ContextVar("request_id", default=None)

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""

    def __init__(self, app, log_level: str = "INFO"):
        super().__init__(app)
        self.log_level = log_level

    async def dispatch(self, request: Request, call_next) -> Response:
        # 生成请求ID
        request_id = str(int(time.time() * 1000))
        request_id_var.set(request_id)

        # 记录请求开始
        start_time = time.time()
        request.state.start_time = start_time
        request.state.request_id = request_id

        # 记录请求信息
        await self.log_request(request)

        try:
            # 调用下一个处理器
            response = await call_next(request)

            # 计算处理时间
            process_time = time.time() - start_time
            response.headers["X-Process-Time"] = str(process_time)

            # 记录响应信息
            await self.log_response(request, response, process_time)

            return response

        except Exception as e:
            # 记录异常
            await self.log_exception(request, e)
            raise

    async def log_request(self, request: Request):
        """记录请求日志"""
        log_data = {
            "timestamp": time.time(),
            "level": self.log_level,
            "type": "request",
            "request_id": request.state.request_id,
            "method": request.method,
            "url": str(request.url),
            "client": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent"),
            "content_length": request.headers.get("content-length"),
        }

        # 异步写入日志（实际项目中应该写入文件或日志系统）
        print(json.dumps(log_data, ensure_ascii=False))

    async def log_response(
        self,
        request: Request,
        response: Response,
        process_time: float
    ):
        """记录响应日志"""
        log_data = {
            "timestamp": time.time(),
            "level": self.log_level,
            "type": "response",
            "request_id": request.state.request_id,
            "status_code": response.status_code,
            "process_time": process_time,
            "content_length": response.headers.get("content-length"),
        }

        print(json.dumps(log_data, ensure_ascii=False))

    async def log_exception(self, request: Request, exception: Exception):
        """记录异常日志"""
        log_data = {
            "timestamp": time.time(),
            "level": "ERROR",
            "type": "exception",
            "request_id": request.state.request_id,
            "method": request.method,
            "url": str(request.url),
            "exception_type": type(exception).__name__,
            "exception_message": str(exception),
        }

        print(json.dumps(log_data, ensure_ascii=False))

# 注册中间件
app.add_middleware(RequestLoggingMiddleware, log_level="INFO")
```

### 函数式中间件

```python
from functools import wraps
from typing import Optional
import uuid

def rate_limit_middleware(
    max_requests: int = 100,
    window_seconds: int = 60,
    redis_client = None
):
    """限流中间件装饰器"""

    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            client_ip = request.client.host if request.client else "unknown"
            endpoint = request.url.path

            # 生成限流key
            rate_key = f"rate_limit:{client_ip}:{endpoint}"

            if redis_client:
                # 使用Redis实现分布式限流
                current = await redis_client.get(rate_key)
                if current and int(current) >= max_requests:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": "请求过于频繁，请稍后再试",
                            "retry_after": window_seconds
                        },
                        headers={"Retry-After": str(window_seconds)}
                    )

                # 增加计数
                if not current:
                    await redis_client.setex(rate_key, window_seconds, 1)
                else:
                    await redis_client.incr(rate_key)

            # 调用原始函数
            return await func(request, *args, **kwargs)

        return wrapper

    return decorator

def authentication_middleware(
    auto_error: bool = True,
    excluded_paths: Optional[list] = None
):
    """认证中间件装饰器"""

    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            # 检查是否在排除路径中
            if excluded_paths and request.url.path in excluded_paths:
                return await func(request, *args, **kwargs)

            # 获取认证令牌
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                if auto_error:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "需要认证"}
                    )
                request.state.user = None
                return await func(request, *args, **kwargs)

            # 验证令牌
            token = auth_header.split(" ")[1]
            user = await verify_jwt_token(token)

            if not user:
                if auto_error:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "无效的认证令牌"}
                    )
                request.state.user = None
            else:
                request.state.user = user

            return await func(request, *args, **kwargs)

        return wrapper

    return decorator

# 使用装饰器中间件
@app.get("/api/protected")
@authentication_middleware(excluded_paths=["/api/public"])
@rate_limit_middleware(max_requests=10)
async def protected_endpoint(request: Request):
    user = request.state.user
    return {"message": f"Hello, {user.username}"}
```

### 实用中间件集合

```python
import gzip
import brotli
from fastapi import FastAPI, Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio
from typing import Set

class CompressionMiddleware(BaseHTTPMiddleware):
    """压缩中间件（支持gzip和brotli）"""

    async def dispatch(self, request: Request, call_next):
        # 检查客户端支持的压缩类型
        accept_encoding = request.headers.get("Accept-Encoding", "")
        response = await call_next(request)

        # 检查是否需要压缩
        if response.status_code >= 300 or "Content-Encoding" in response.headers:
            return response

        content_type = response.headers.get("Content-Type", "")
        if not any(content_type.startswith(t) for t in ["application/", "text/"]):
            return response

        # 选择合适的压缩算法
        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        if "br" in accept_encoding and len(body) > 1024:
            compressed = brotli.compress(body)
            response.body = compressed
            response.headers["Content-Encoding"] = "br"
            response.headers["Content-Length"] = str(len(compressed))
        elif "gzip" in accept_encoding and len(body) > 1024:
            compressed = gzip.compress(body)
            response.body = compressed
            response.headers["Content-Encoding"] = "gzip"
            response.headers["Content-Length"] = str(len(compressed))
        else:
            response.body = body

        return response

class CacheControlMiddleware(BaseHTTPMiddleware):
    """缓存控制中间件"""

    def __init__(self, app, cache_config: dict = None):
        super().__init__(app)
        self.cache_config = cache_config or {
            "static": "public, max-age=31536000, immutable",
            "api": "no-cache, no-store, must-revalidate",
            "public": "public, max-age=3600",
        }

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # 根据路径设置缓存策略
        path = request.url.path

        if path.startswith("/static/"):
            response.headers["Cache-Control"] = self.cache_config["static"]
        elif path.startswith("/api/"):
            response.headers["Cache-Control"] = self.cache_config["api"]
        else:
            response.headers["Cache-Control"] = self.cache_config["public"]

        return response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """安全头中间件"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # 添加安全相关的HTTP头
        security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
            "Content-Security-Policy": (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self'; "
                "connect-src 'self'"
            ),
        }

        for header, value in security_headers.items():
            response.headers[header] = value

        # 如果是HTTPS，添加HSTS头
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response

class TimeoutMiddleware(BaseHTTPMiddleware):
    """请求超时中间件"""

    def __init__(self, app, timeout: float = 30.0):
        super().__init__(app)
        self.timeout = timeout

    async def dispatch(self, request: Request, call_next):
        try:
            # 设置请求超时
            response = await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout
            )
            return response
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": "请求超时"}
            )

# 注册所有中间件
app = FastAPI()

# 注意：中间件的注册顺序很重要！
app.add_middleware(SecurityHeadersMiddleware)      # 最先：安全头
app.add_middleware(CompressionMiddleware)          # 压缩
app.add_middleware(CacheControlMiddleware)         # 缓存控制
app.add_middleware(RequestLoggingMiddleware)       # 日志
app.add_middleware(TimeoutMiddleware, timeout=30)  # 超时控制

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

## 3. CORS 跨域处理

### CORS 基础配置

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 配置CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",        # 开发环境
        "http://localhost:8080",
        "https://yourdomain.com",       # 生产环境
        "https://*.yourdomain.com",     # 子域名
    ],
    allow_origin_regex=r"https://.*\.yourdomain\.com",  # 正则匹配
    allow_credentials=True,            # 允许携带凭证（cookies, authorization headers）
    allow_methods=["*"],               # 允许所有HTTP方法
    allow_headers=["*"],               # 允许所有HTTP头
    expose_headers=[                   # 暴露给浏览器的头
        "X-Request-ID",
        "X-Process-Time",
        "X-Total-Count"
    ],
    max_age=600,                       # 预检请求缓存时间（秒）
)

# 动态CORS配置（根据环境）
def configure_cors(app: FastAPI, environment: str = "development"):
    """根据环境配置CORS"""

    if environment == "development":
        origins = [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:8080",
            "http://127.0.0.1:3000",
        ]
        allow_credentials = True
    elif environment == "staging":
        origins = [
            "https://staging.yourdomain.com",
            "https://api-staging.yourdomain.com",
        ]
        allow_credentials = True
    else:  # production
        origins = [
            "https://yourdomain.com",
            "https://www.yourdomain.com",
        ]
        allow_credentials = True

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "X-CSRF-Token",
            "X-API-Key",
        ],
        expose_headers=["X-Request-ID", "X-Total-Count"],
        max_age=3600,
    )
```

### 高级 CORS 配置

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import re

class DynamicCORSMiddleware:
    """动态CORS中间件，支持数据库配置"""

    def __init__(self, app, db_session=None):
        self.app = app
        self.db_session = db_session
        self.cors_config_cache = {}
        self.cache_timeout = 300  # 5分钟缓存

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # 从数据库获取CORS配置
        cors_config = await self.get_cors_config()

        # 创建请求对象
        request = Request(scope, receive)

        # 处理预检请求
        if request.method == "OPTIONS":
            await self.handle_preflight(request, cors_config, send)
            return

        # 处理普通请求
        await self.app(scope, receive, send)

    async def get_cors_config(self):
        """从数据库获取CORS配置"""
        import time
        current_time = time.time()

        # 检查缓存
        if "cors_config" in self.cors_config_cache:
            config, timestamp = self.cors_config_cache["cors_config"]
            if current_time - timestamp < self.cache_timeout:
                return config

        # 从数据库获取
        if self.db_session:
            # 查询数据库
            from sqlalchemy import select
            from app.models import CORSConfig

            result = await self.db_session.execute(
                select(CORSConfig).where(CORSConfig.is_active == True)
            )
            configs = result.scalars().all()

            config = {
                "allow_origins": [c.origin for c in configs],
                "allow_methods": ["*"],
                "allow_headers": ["*"],
                "max_age": 3600,
            }
        else:
            # 默认配置
            config = {
                "allow_origins": ["*"],
                "allow_methods": ["*"],
                "allow_headers": ["*"],
                "max_age": 3600,
            }

        # 更新缓存
        self.cors_config_cache["cors_config"] = (config, current_time)
        return config

    async def handle_preflight(
        self,
        request: Request,
        config: dict,
        send
    ):
        """处理预检请求"""

        origin = request.headers.get("origin")
        request_method = request.headers.get("access-control-request-method")
        request_headers = request.headers.get("access-control-request-headers", "")

        # 检查源是否允许
        if not self.is_origin_allowed(origin, config["allow_origins"]):
            await send({
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                ]
            })
            await send({
                "type": "http.response.body",
                "body": b'{"detail": "CORS not allowed"}',
            })
            return

        # 构建响应头
        headers = [
            (b"access-control-allow-origin", origin.encode()),
            (b"access-control-allow-methods", b", ".join([
                m.encode() for m in config["allow_methods"]
            ])),
            (b"access-control-allow-headers", request_headers.encode()),
            (b"access-control-max-age", str(config["max_age"]).encode()),
        ]

        # 如果允许凭证
        if config.get("allow_credentials", False):
            headers.append((b"access-control-allow-credentials", b"true"))

        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": headers + [
                (b"content-type", b"application/json"),
                (b"content-length", b"0"),
            ]
        })
        await send({
            "type": "http.response.body",
            "body": b"",
        })

    def is_origin_allowed(self, origin: Optional[str], allow_origins: List[str]) -> bool:
        """检查源是否允许"""
        if "*" in allow_origins:
            return True

        if not origin:
            return False

        for allowed in allow_origins:
            if allowed == origin:
                return True
            # 支持通配符
            if "*" in allowed:
                pattern = allowed.replace(".", r"\.").replace("*", ".*")
                if re.match(pattern, origin):
                    return True

        return False

# 使用动态CORS中间件
app = FastAPI()

# 替换默认的CORS中间件
app.add_middleware(
    DynamicCORSMiddleware,
    db_session=get_db_session  # 传入数据库会话
)

# 或者使用条件CORS
@app.middleware("http")
async def conditional_cors(request: Request, call_next):
    """条件CORS中间件"""

    # 特定路径的CORS配置
    if request.url.path.startswith("/public/"):
        # 允许所有源访问公共API
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response

    elif request.url.path.startswith("/api/"):
        # 受限的CORS配置
        allowed_origins = [
            "https://app.yourdomain.com",
            "https://admin.yourdomain.com",
        ]

        origin = request.headers.get("origin")
        if origin in allowed_origins:
            response = await call_next(request)
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response

    # 默认处理
    return await call_next(request)
```

### CORS 安全最佳实践

```python
class SecureCORSMiddleware(BaseHTTPMiddleware):
    """安全的CORS中间件实现"""

    def __init__(self, app):
        super().__init__(app)
        self.allowed_origins = self.load_allowed_origins()
        self.origin_patterns = self.compile_patterns()

    def load_allowed_origins(self):
        """从安全配置文件加载允许的源"""
        import yaml

        try:
            with open("config/security.yaml", "r") as f:
                config = yaml.safe_load(f)
                return config.get("cors", {}).get("allowed_origins", [])
        except:
            # 默认配置
            return ["http://localhost:3000", "https://yourdomain.com"]

    def compile_patterns(self):
        """编译正则表达式模式"""
        patterns = []
        for origin in self.allowed_origins:
            if "*" in origin:
                # 转换通配符为正则表达式
                pattern = origin.replace(".", r"\.").replace("*", ".*")
                patterns.append(re.compile(f"^{pattern}$"))
        return patterns

    async def dispatch(self, request: Request, call_next):
        # 获取Origin头
        origin = request.headers.get("origin")

        # 如果是预检请求，提前处理
        if request.method == "OPTIONS":
            return await self.handle_options_request(request, origin)

        # 处理普通请求
        response = await call_next(request)

        # 添加CORS头
        if origin and self.is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"

        return response

    async def handle_options_request(self, request: Request, origin: str):
        """处理OPTIONS预检请求"""

        if not origin or not self.is_origin_allowed(origin):
            return JSONResponse(
                status_code=403,
                content={"detail": "CORS not allowed"}
            )

        # 获取请求的方法和头
        request_method = request.headers.get("access-control-request-method", "GET")
        request_headers = request.headers.get("access-control-request-headers", "")

        # 构建响应
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": request_method,
            "Access-Control-Allow-Headers": request_headers,
            "Access-Control-Max-Age": "3600",
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",  # 防止缓存问题
        }

        return JSONResponse(
            content={"status": "ok"},
            headers=headers
        )

    def is_origin_allowed(self, origin: str) -> bool:
        """检查源是否允许"""
        # 精确匹配
        if origin in self.allowed_origins:
            return True

        # 正则匹配
        for pattern in self.origin_patterns:
            if pattern.match(origin):
                return True

        return False

# 安全配置示例（config/security.yaml）
"""
cors:
  allowed_origins:
    - "https://app.yourdomain.com"
    - "https://admin.yourdomain.com"
    - "https://*.yourdomain.com"  # 所有子域名
    - "http://localhost:3000"
    - "http://localhost:8080"

  allowed_methods:
    - GET
    - POST
    - PUT
    - DELETE
    - OPTIONS

  allowed_headers:
    - Authorization
    - Content-Type
    - X-API-Key
    - X-CSRF-Token

  expose_headers:
    - X-Request-ID
    - X-Total-Count

  max_age: 3600
  allow_credentials: true
  supports_credentials: true
"""
```

## 4. 后台任务：Celery 集成

### Celery 基础配置

```python
# celery_app.py
from celery import Celery
from celery.schedules import crontab
import os
from kombu import Queue, Exchange

# 创建Celery应用
celery_app = Celery(
    "worker",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
    include=[
        "app.tasks.email",
        "app.tasks.notification",
        "app.tasks.report",
        "app.tasks.cleanup",
    ]
)

# 配置Celery
celery_app.conf.update(
    # 任务序列化
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # 时区
    timezone="Asia/Shanghai",
    enable_utc=True,

    # 任务路由
    task_routes={
        "app.tasks.email.*": {"queue": "email"},
        "app.tasks.notification.*": {"queue": "notification"},
        "app.tasks.report.*": {"queue": "report"},
        "app.tasks.cleanup.*": {"queue": "cleanup"},
    },

    # 队列配置
    task_queues=(
        Queue("default", Exchange("default"), routing_key="default"),
        Queue("email", Exchange("email"), routing_key="email"),
        Queue("notification", Exchange("notification"), routing_key="notification"),
        Queue("report", Exchange("report"), routing_key="report"),
        Queue("cleanup", Exchange("cleanup"), routing_key="cleanup"),
    ),

    # 任务确认
    task_acks_late=True,
    worker_prefetch_multiplier=1,

    # 任务超时
    task_time_limit=30 * 60,  # 30分钟
    task_soft_time_limit=25 * 60,

    # 结果过期时间
    result_expires=3600,  # 1小时

    # 工作进程设置
    worker_max_tasks_per_child=1000,
    worker_max_memory_per_child=300000,  # 300MB

    # 定时任务
    beat_schedule={
        "cleanup-old-sessions": {
            "task": "app.tasks.cleanup.cleanup_old_sessions",
            "schedule": crontab(hour=0, minute=0),  # 每天凌晨执行
            "args": (30,),  # 删除30天前的会话
        },
        "send-daily-report": {
            "task": "app.tasks.report.send_daily_report",
            "schedule": crontab(hour=9, minute=0),  # 每天9点执行
        },
        "update-cache": {
            "task": "app.tasks.cache.update_all_caches",
            "schedule": 300.0,  # 每5分钟执行
        },
    },

    # 监控配置
    worker_send_task_events=True,
    task_send_sent_event=True,
)
```

### 任务定义和错误处理

```python
# app/tasks/email.py
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from celery import Task
from celery.utils.log import get_task_logger
from typing import Dict, List, Optional
import jinja2
import time

logger = get_task_logger(__name__)

class BaseTaskWithRetry(Task):
    """带重试机制的基类任务"""
    autoretry_for = (Exception,)
    retry_kwargs = {"max_retries": 3}
    retry_backoff = True
    retry_backoff_max = 600  # 最大重试间隔10分钟
    retry_jitter = True

class EmailTask(BaseTaskWithRetry):
    """邮件任务基类"""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """任务失败时的处理"""
        logger.error(f"任务失败: {task_id}, 错误: {exc}")
        # 发送告警邮件
        self.send_alert_email(task_id, str(exc))

    def on_success(self, retval, task_id, args, kwargs):
        """任务成功时的处理"""
        logger.info(f"任务成功: {task_id}")

    def send_alert_email(self, task_id: str, error: str):
        """发送告警邮件"""
        # 实际项目中应该实现
        pass

@celery_app.task(base=EmailTask, bind=True, queue="email")
def send_welcome_email(
    self,
    to_email: str,
    username: str,
    template_vars: Optional[Dict] = None
) -> Dict:
    """发送欢迎邮件"""

    start_time = time.time()

    try:
        # 渲染邮件模板
        template = self.load_template("welcome.html")
        html_content = template.render(
            username=username,
            **(template_vars or {})
        )

        # 创建邮件
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "欢迎加入我们的平台"
        msg["From"] = "noreply@yourdomain.com"
        msg["To"] = to_email

        # 添加HTML内容
        msg.attach(MIMEText(html_content, "html"))

        # 发送邮件
        with smtplib.SMTP(
            os.getenv("SMTP_HOST", "localhost"),
            int(os.getenv("SMTP_PORT", 25))
        ) as server:
            server.login(
                os.getenv("SMTP_USERNAME"),
                os.getenv("SMTP_PASSWORD")
            )
            server.send_message(msg)

        process_time = time.time() - start_time

        return {
            "status": "success",
            "to_email": to_email,
            "process_time": process_time,
            "message_id": f"email_{int(time.time() * 1000)}"
        }

    except Exception as e:
        logger.error(f"发送邮件失败: {e}")
        # 触发重试
        raise self.retry(exc=e, countdown=60)

    def load_template(self, template_name: str) -> jinja2.Template:
        """加载邮件模板"""
        template_loader = jinja2.FileSystemLoader(searchpath="templates/emails")
        template_env = jinja2.Environment(loader=template_loader)
        return template_env.get_template(template_name)

@celery_app.task(base=EmailTask, bind=True, queue="email", rate_limit="10/m")
def send_bulk_email(
    self,
    email_list: List[Dict],
    template_name: str,
    batch_size: int = 100
) -> Dict:
    """批量发送邮件"""

    total_emails = len(email_list)
    successful = 0
    failed = 0
    failed_emails = []

    # 分批处理
    for i in range(0, total_emails, batch_size):
        batch = email_list[i:i + batch_size]

        for email_data in batch:
            try:
                # 发送单个邮件
                send_welcome_email.delay(
                    to_email=email_data["email"],
                    username=email_data.get("name", "用户"),
                    template_vars=email_data.get("vars")
                )
                successful += 1

            except Exception as e:
                failed += 1
                failed_emails.append({
                    "email": email_data["email"],
                    "error": str(e)
                })

        # 报告进度
        self.update_state(
            state="PROGRESS",
            meta={
                "current": i + len(batch),
                "total": total_emails,
                "successful": successful,
                "failed": failed,
            }
        )

    return {
        "status": "completed",
        "total": total_emails,
        "successful": successful,
        "failed": failed,
        "failed_emails": failed_emails,
    }

@celery_app.task(base=BaseTaskWithRetry, bind=True, queue="notification")
def send_push_notification(
    self,
    user_id: int,
    title: str,
    message: str,
    data: Optional[Dict] = None
) -> Dict:
    """发送推送通知"""

    from app.services.notification import PushNotificationService

    try:
        service = PushNotificationService()
        result = service.send(
            user_id=user_id,
            title=title,
            message=message,
            data=data or {}
        )

        return {
            "status": "success",
            "notification_id": result.get("id"),
            "user_id": user_id,
        }

    except Exception as e:
        logger.error(f"发送推送通知失败: {e}")
        raise self.retry(exc=e, countdown=30)
```

### Celery 监控和管理

```python
# app/services/celery_monitor.py
from celery import states
from celery.result import AsyncResult
from typing import Dict, List, Optional
import time
from datetime import datetime, timedelta

class CeleryMonitor:
    """Celery监控和管理服务"""

    def __init__(self, celery_app):
        self.celery_app = celery_app
        self.inspect = celery_app.control.inspect()

    async def get_worker_status(self) -> Dict:
        """获取工作节点状态"""
        try:
            stats = self.inspect.stats()
            active = self.inspect.active()
            scheduled = self.inspect.scheduled()
            reserved = self.inspect.reserved()

            workers = {}
            if stats:
                for worker, info in stats.items():
                    workers[worker] = {
                        "status": "online",
                        "tasks": info.get("total", {}),
                        "active": len(active.get(worker, [])),
                        "scheduled": len(scheduled.get(worker, [])),
                        "reserved": len(reserved.get(worker, [])),
                        "pool": info.get("pool", {}),
                        "broker": info.get("broker", {}),
                        "uptime": info.get("uptime", 0),
                    }

            return {
                "timestamp": datetime.utcnow().isoformat(),
                "workers": workers,
                "total_workers": len(workers),
            }

        except Exception as e:
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e),
                "workers": {},
                "total_workers": 0,
            }

    async def get_queue_status(self) -> Dict:
        """获取队列状态"""
        try:
            # 使用Redis获取队列长度
            import redis
            redis_client = redis.Redis.from_url(
                self.celery_app.conf.broker_url
            )

            queues = {}
            for queue in ["default", "email", "notification", "report", "cleanup"]:
                queue_key = f"celery@{queue}"
                length = redis_client.llen(queue_key)
                queues[queue] = {
                    "length": length,
                    "name": queue,
                }

            return {
                "timestamp": datetime.utcnow().isoformat(),
                "queues": queues,
                "total_pending": sum(q["length"] for q in queues.values()),
            }

        except Exception as e:
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e),
                "queues": {},
                "total_pending": 0,
            }

    async def get_task_status(self, task_id: str) -> Dict:
        """获取任务状态"""
        try:
            result = AsyncResult(task_id, app=self.celery_app)

            response = {
                "task_id": task_id,
                "status": result.state,
                "result": result.result if result.ready() else None,
                "date_done": result.date_done.isoformat() if result.date_done else None,
            }

            # 如果是失败状态，添加错误信息
            if result.failed():
                response["error"] = str(result.result)
                response["traceback"] = result.traceback

            # 如果是进行中，添加进度信息
            elif result.state == "PROGRESS":
                response["progress"] = result.info

            return response

        except Exception as e:
            return {
                "task_id": task_id,
                "status": "UNKNOWN",
                "error": str(e),
            }

    async def get_recent_tasks(
        self,
        limit: int = 100,
        status: Optional[str] = None
    ) -> List[Dict]:
        """获取最近的任务"""
        try:
            # 使用Redis获取任务历史
            import redis
            redis_client = redis.Redis.from_url(
                self.celery_app.conf.broker_url
            )

            # 获取任务ID列表
            task_ids = redis_client.lrange("celery:task_history", 0, limit - 1)

            tasks = []
            for task_id_bytes in task_ids:
                task_id = task_id_bytes.decode()
                task_info = await self.get_task_status(task_id)

                if status and task_info.get("status") != status:
                    continue

                tasks.append(task_info)

            return tasks

        except Exception as e:
            return []

    async def purge_queue(self, queue_name: str) -> Dict:
        """清空队列"""
        try:
            # 使用Celery控制命令清空队列
            purged = self.celery_app.control.purge(queue=queue_name)

            return {
                "success": True,
                "queue": queue_name,
                "purged_count": purged,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            return {
                "success": False,
                "queue": queue_name,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    async def retry_task(self, task_id: str) -> Dict:
        """重试任务"""
        try:
            result = AsyncResult(task_id, app=self.celery_app)

            if result.state not in [states.FAILURE, states.RETRY]:
                return {
                    "success": False,
                    "task_id": task_id,
                    "error": f"任务状态{result.state}不支持重试",
                }

            # 重试任务
            result.retry()

            return {
                "success": True,
                "task_id": task_id,
                "new_task_id": result.id,
                "status": "retried",
            }

        except Exception as e:
            return {
                "success": False,
                "task_id": task_id,
                "error": str(e),
            }

    async def get_task_metrics(
        self,
        hours: int = 24
    ) -> Dict:
        """获取任务指标"""
        try:
            import redis
            from datetime import datetime, timedelta

            redis_client = redis.Redis.from_url(
                self.celery_app.conf.broker_url
            )

            now = datetime.utcnow()
            start_time = now - timedelta(hours=hours)

            # 获取任务统计
            metrics = {
                "period": f"last_{hours}_hours",
                "start_time": start_time.isoformat(),
                "end_time": now.isoformat(),
                "total_tasks": 0,
                "by_status": {},
                "by_queue": {},
                "by_hour": {},
                "success_rate": 0,
                "average_duration": 0,
            }

            # 这里需要根据实际存储的任务历史来实现
            # 可以使用Redis的有序集合存储任务完成时间

            return metrics

        except Exception as e:
            return {
                "period": f"last_{hours}_hours",
                "error": str(e),
            }
```

### FastAPI 集成 Celery

```python
# app/api/celery.py
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.services.celery_monitor import CeleryMonitor
from app.core.celery import celery_app

router = APIRouter(prefix="/celery", tags=["Celery管理"])

# 依赖项
def get_celery_monitor():
    """获取Celery监控器"""
    return CeleryMonitor(celery_app)

# 数据模型
class TaskRequest(BaseModel):
    """任务请求"""
    task_name: str
    args: Optional[List] = None
    kwargs: Optional[Dict] = None
    queue: Optional[str] = "default"
    eta: Optional[datetime] = None
    countdown: Optional[float] = None

class QueuePurgeRequest(BaseModel):
    """队列清空请求"""
    queue_name: str
    confirm: bool = False

# 路由
@router.get("/status")
async def get_celery_status(
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """获取Celery状态"""
    worker_status = await monitor.get_worker_status()
    queue_status = await monitor.get_queue_status()

    return {
        "workers": worker_status,
        "queues": queue_status,
        "timestamp": datetime.utcnow().isoformat(),
    }

@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """获取任务状态"""
    task_info = await monitor.get_task_status(task_id)

    if task_info.get("status") == "UNKNOWN":
        raise HTTPException(status_code=404, detail="任务不存在")

    return task_info

@router.get("/tasks")
async def list_recent_tasks(
    limit: int = 100,
    status: Optional[str] = None,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """获取最近的任务"""
    tasks = await monitor.get_recent_tasks(limit, status)
    return {
        "tasks": tasks,
        "count": len(tasks),
        "limit": limit,
        "status": status,
    }

@router.post("/tasks")
async def create_task(
    task_request: TaskRequest,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """创建新任务"""
    try:
        # 获取任务函数
        task_func = celery_app.tasks.get(task_request.task_name)
        if not task_func:
            raise HTTPException(
                status_code=404,
                detail=f"任务{task_request.task_name}不存在"
            )

        # 调用任务
        if task_request.eta:
            result = task_func.apply_async(
                args=task_request.args or [],
                kwargs=task_request.kwargs or {},
                queue=task_request.queue,
                eta=task_request.eta,
            )
        elif task_request.countdown:
            result = task_func.apply_async(
                args=task_request.args or [],
                kwargs=task_request.kwargs or {},
                queue=task_request.queue,
                countdown=task_request.countdown,
            )
        else:
            result = task_func.apply_async(
                args=task_request.args or [],
                kwargs=task_request.kwargs or {},
                queue=task_request.queue,
            )

        return {
            "success": True,
            "task_id": result.id,
            "task_name": task_request.task_name,
            "status": result.state,
            "queue": task_request.queue,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"创建任务失败: {str(e)}"
        )

@router.post("/queues/{queue_name}/purge")
async def purge_queue(
    queue_name: str,
    request: QueuePurgeRequest,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """清空队列"""
    if not request.confirm:
        raise HTTPException(
            status_code=400,
            detail="需要confirm=true确认清空队列"
        )

    result = await monitor.purge_queue(queue_name)

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=f"清空队列失败: {result['error']}"
        )

    return result

@router.post("/tasks/{task_id}/retry")
async def retry_task(
    task_id: str,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """重试任务"""
    result = await monitor.retry_task(task_id)

    if not result["success"]:
        raise HTTPException(
            status_code=400,
            detail=result["error"]
        )

    return result

@router.get("/metrics")
async def get_metrics(
    hours: int = 24,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """获取任务指标"""
    metrics = await monitor.get_task_metrics(hours)
    return metrics

# 定时任务管理
@router.get("/scheduled")
async def get_scheduled_tasks(
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """获取计划中的任务"""
    try:
        scheduled = monitor.inspect.scheduled()

        if not scheduled:
            return {"scheduled_tasks": []}

        tasks = []
        for worker, worker_tasks in scheduled.items():
            for task in worker_tasks:
                tasks.append({
                    "worker": worker,
                    "task_id": task.get("id"),
                    "task_name": task.get("name"),
                    "args": task.get("args"),
                    "kwargs": task.get("kwargs"),
                    "eta": task.get("eta"),
                    "priority": task.get("priority"),
                })

        return {
            "scheduled_tasks": tasks,
            "count": len(tasks),
        }

    except Exception as e:
        return {
            "scheduled_tasks": [],
            "error": str(e),
            "count": 0,
        }

# Webhook端点，用于接收Celery事件
@router.post("/webhook/events")
async def receive_celery_events(
    event: Dict,
    monitor: CeleryMonitor = Depends(get_celery_monitor)
):
    """接收Celery事件（用于监控）"""
    # 这里可以处理任务完成、失败等事件
    # 例如：发送通知、更新数据库、记录日志等

    event_type = event.get("type")
    task_id = event.get("uuid")
    state = event.get("state")

    if event_type == "task-succeeded":
        logger.info(f"任务成功: {task_id}")
        # 更新数据库状态
        await update_task_status(task_id, "SUCCESS", event)

    elif event_type == "task-failed":
        logger.error(f"任务失败: {task_id}")
        # 发送告警
        await send_alert(f"任务失败: {task_id}", event)
        # 更新数据库状态
        await update_task_status(task_id, "FAILED", event)

    elif event_type == "task-received":
        logger.info(f"任务接收: {task_id}")
        # 记录开始时间
        await record_task_start(task_id, event)

    return {"status": "received"}
```

## 5. 定时任务实现方案

### 方案一：APScheduler 集成

```python
# app/services/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor, ProcessPoolExecutor
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Callable
import logging

logger = logging.getLogger(__name__)

class SchedulerService:
    """定时任务调度服务"""

    def __init__(self, database_url: str = None):
        self.database_url = database_url or "sqlite:///jobs.sqlite"
        self.scheduler = None

    async def start(self):
        """启动调度器"""

        # 配置任务存储
        jobstores = {
            'default': SQLAlchemyJobStore(
                url=self.database_url,
                tablename='scheduled_jobs'
            )
        }

        # 配置执行器
        executors = {
            'default': ThreadPoolExecutor(20),
            'processpool': ProcessPoolExecutor(5)
        }

        # 配置任务默认值
        job_defaults = {
            'coalesce': True,  # 合并错过的任务
            'max_instances': 3,  # 最大并发实例数
            'misfire_grace_time': 60  # 错过执行的宽限时间
        }

        # 创建调度器
        self.scheduler = AsyncIOScheduler(
            jobstores=jobstores,
            executors=executors,
            job_defaults=job_defaults,
            timezone=pytz.timezone('Asia/Shanghai')
        )

        # 添加默认任务
        self.add_default_jobs()

        # 启动调度器
        self.scheduler.start()
        logger.info("定时任务调度器已启动")

    async def shutdown(self):
        """关闭调度器"""
        if self.scheduler:
            self.scheduler.shutdown()
            logger.info("定时任务调度器已关闭")

    def add_default_jobs(self):
        """添加默认任务"""

        # 每日凌晨清理临时文件
        self.scheduler.add_job(
            self.cleanup_temp_files,
            CronTrigger(hour=0, minute=0),
            id='cleanup_temp_files',
            name='清理临时文件',
            replace_existing=True
        )

        # 每5分钟更新缓存
        self.scheduler.add_job(
            self.update_cache,
            IntervalTrigger(minutes=5),
            id='update_cache',
            name='更新缓存',
            replace_existing=True
        )

        # 每周一上午9点发送周报
        self.scheduler.add_job(
            self.send_weekly_report,
            CronTrigger(day_of_week='mon', hour=9, minute=0),
            id='send_weekly_report',
            name='发送周报',
            replace_existing=True
        )

    async def add_job(
        self,
        func: Callable,
        trigger_type: str = "cron",
        **trigger_args
    ) -> str:
        """添加定时任务"""

        if not self.scheduler:
            raise RuntimeError("调度器未启动")

        # 创建触发器
        if trigger_type == "cron":
            trigger = CronTrigger(**trigger_args)
        elif trigger_type == "interval":
            trigger = IntervalTrigger(**trigger_args)
        elif trigger_type == "date":
            trigger = DateTrigger(**trigger_args)
        else:
            raise ValueError(f"不支持的触发器类型: {trigger_type}")

        # 生成任务ID
        job_id = f"job_{int(datetime.now().timestamp() * 1000)}"

        # 添加任务
        job = self.scheduler.add_job(
            func,
            trigger,
            id=job_id,
            name=func.__name__,
            replace_existing=True
        )

        logger.info(f"已添加定时任务: {job_id}")
        return job_id

    async def remove_job(self, job_id: str) -> bool:
        """移除定时任务"""
        if not self.scheduler:
            return False

        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"已移除定时任务: {job_id}")
            return True
        except Exception as e:
            logger.error(f"移除任务失败: {e}")
            return False

    async def pause_job(self, job_id: str) -> bool:
        """暂停定时任务"""
        if not self.scheduler:
            return False

        try:
            self.scheduler.pause_job(job_id)
            logger.info(f"已暂停定时任务: {job_id}")
            return True
        except Exception as e:
            logger.error(f"暂停任务失败: {e}")
            return False

    async def resume_job(self, job_id: str) -> bool:
        """恢复定时任务"""
        if not self.scheduler:
            return False

        try:
            self.scheduler.resume_job(job_id)
            logger.info(f"已恢复定时任务: {job_id}")
            return True
        except Exception as e:
            logger.error(f"恢复任务失败: {e}")
            return False

    async def get_jobs(self) -> List[Dict]:
        """获取所有定时任务"""
        if not self.scheduler:
            return []

        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                'id': job.id,
                'name': job.name,
                'trigger': str(job.trigger),
                'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None,
                'last_run_time': job.last_run_time.isoformat() if hasattr(job, 'last_run_time') else None,
                'pending': job.pending,
            })

        return jobs

    async def run_job_now(self, job_id: str) -> bool:
        """立即运行定时任务"""
        if not self.scheduler:
            return False

        try:
            job = self.scheduler.get_job(job_id)
            if job:
                job.modify(next_run_time=datetime.now())
                return True
        except Exception as e:
            logger.error(f"立即运行任务失败: {e}")

        return False

    # 默认任务实现
    async def cleanup_temp_files(self):
        """清理临时文件"""
        import os
        import glob
        from datetime import datetime

        temp_dir = "/tmp/myapp"
        if not os.path.exists(temp_dir):
            return

        # 删除7天前的临时文件
        cutoff_time = datetime.now().timestamp() - 7 * 24 * 3600

        for filepath in glob.glob(os.path.join(temp_dir, "*")):
            if os.path.isfile(filepath):
                file_time = os.path.getmtime(filepath)
                if file_time < cutoff_time:
                    try:
                        os.remove(filepath)
                        logger.info(f"已删除临时文件: {filepath}")
                    except Exception as e:
                        logger.error(f"删除文件失败: {e}")

    async def update_cache(self):
        """更新缓存"""
        from app.services.cache import CacheService

        try:
            cache_service = CacheService()
            await cache_service.update_all()
            logger.info("缓存更新完成")
        except Exception as e:
            logger.error(f"缓存更新失败: {e}")

    async def send_weekly_report(self):
        """发送周报"""
        from app.tasks.report import send_weekly_report_task

        try:
            # 调用Celery任务
            result = send_weekly_report_task.delay()
            logger.info(f"已触发周报发送任务: {result.id}")
        except Exception as e:
            logger.error(f"触发周报发送失败: {e}")
```

### 方案二：FastAPI 内置后台任务

```python
from fastapi import FastAPI, BackgroundTasks
from datetime import datetime
import asyncio
from typing import List, Dict
import time

app = FastAPI()

class BackgroundTaskManager:
    """后台任务管理器"""

    def __init__(self):
        self.tasks = {}
        self.task_results = {}

    async def add_task(
        self,
        task_id: str,
        func: callable,
        *args,
        **kwargs
    ):
        """添加后台任务"""

        if task_id in self.tasks:
            raise ValueError(f"任务ID已存在: {task_id}")

        # 创建任务
        task = asyncio.create_task(
            self._run_task(task_id, func, *args, **kwargs)
        )

        self.tasks[task_id] = {
            "task": task,
            "started_at": datetime.now(),
            "status": "running",
            "func": func.__name__,
        }

        return task_id

    async def _run_task(
        self,
        task_id: str,
        func: callable,
        *args,
        **kwargs
    ):
        """运行任务"""

        try:
            # 运行任务函数
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            # 存储结果
            self.tasks[task_id]["status"] = "completed"
            self.tasks[task_id]["completed_at"] = datetime.now()
            self.task_results[task_id] = result

        except Exception as e:
            # 存储错误
            self.tasks[task_id]["status"] = "failed"
            self.tasks[task_id]["error"] = str(e)
            self.tasks[task_id]["completed_at"] = datetime.now()
            self.task_results[task_id] = {"error": str(e)}

    async def get_task_status(self, task_id: str) -> Dict:
        """获取任务状态"""

        if task_id not in self.tasks:
            return {"status": "not_found"}

        task_info = self.tasks[task_id].copy()

        # 计算运行时间
        if task_info["status"] == "running":
            duration = (datetime.now() - task_info["started_at"]).total_seconds()
            task_info["duration"] = duration

        elif task_info["status"] in ["completed", "failed"]:
            duration = (task_info["completed_at"] - task_info["started_at"]).total_seconds()
            task_info["duration"] = duration

        return task_info

    async def get_task_result(self, task_id: str):
        """获取任务结果"""

        if task_id not in self.task_results:
            return None

        return self.task_results[task_id]

    async def cancel_task(self, task_id: str) -> bool:
        """取消任务"""

        if task_id not in self.tasks:
            return False

        task_info = self.tasks[task_id]
        if task_info["status"] == "running":
            task_info["task"].cancel()
            task_info["status"] = "cancelled"
            task_info["cancelled_at"] = datetime.now()
            return True

        return False

    async def cleanup_old_tasks(self, max_age_hours: int = 24):
        """清理旧任务"""

        cutoff_time = datetime.now().timestamp() - max_age_hours * 3600

        tasks_to_remove = []
        for task_id, task_info in self.tasks.items():
            started_time = task_info["started_at"].timestamp()

            if started_time < cutoff_time:
                tasks_to_remove.append(task_id)

        for task_id in tasks_to_remove:
            if task_id in self.tasks:
                del self.tasks[task_id]
            if task_id in self.task_results:
                del self.task_results[task_id]

        return len(tasks_to_remove)

# 使用FastAPI的BackgroundTasks
@app.post("/process-image")
async def process_image(
    image_url: str,
    background_tasks: BackgroundTasks
):
    """处理图片（使用FastAPI内置后台任务）"""

    # 添加后台任务
    background_tasks.add_task(
        download_and_process_image,
        image_url,
        resize_to=(800, 600),
        quality=85
    )

    return {
        "message": "图片处理任务已提交",
        "image_url": image_url,
        "status": "processing"
    }

async def download_and_process_image(
    image_url: str,
    resize_to: tuple,
    quality: int
):
    """下载并处理图片"""

    import httpx
    from PIL import Image
    import io
    import hashlib

    try:
        # 下载图片
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url)
            response.raise_for_status()

        # 处理图片
        image = Image.open(io.BytesIO(response.content))

        # 调整大小
        image = image.resize(resize_to, Image.Resampling.LANCZOS)

        # 保存到文件系统
        filename = hashlib.md5(image_url.encode()).hexdigest() + ".jpg"
        filepath = f"/tmp/processed/{filename}"

        image.save(filepath, "JPEG", quality=quality, optimize=True)

        return {
            "status": "success",
            "filepath": filepath,
            "original_size": len(response.content),
            "processed_size": os.path.getsize(filepath),
        }

    except Exception as e:
        return {
            "status": "failed",
            "error": str(e)
        }

# 集成BackgroundTaskManager
task_manager = BackgroundTaskManager()

@app.on_event("startup")
async def startup_tasks():
    """启动时初始化任务管理器"""
    # 启动清理任务
    asyncio.create_task(periodic_task_cleanup())

@app.on_event("shutdown")
async def shutdown_tasks():
    """关闭时清理任务"""
    # 取消所有运行中的任务
    for task_id, task_info in task_manager.tasks.items():
        if task_info["status"] == "running":
            await task_manager.cancel_task(task_id)

async def periodic_task_cleanup():
    """定期清理任务"""
    import asyncio

    while True:
        try:
            cleaned = await task_manager.cleanup_old_tasks(24)  # 清理24小时前的任务
            if cleaned > 0:
                logger.info(f"已清理{cleaned}个旧任务")
        except Exception as e:
            logger.error(f"清理任务失败: {e}")

        await asyncio.sleep(3600)  # 每小时清理一次

@app.post("/long-task")
async def start_long_task(
    task_name: str,
    duration: int = 10
):
    """启动长时间运行的任务"""

    task_id = f"long_task_{int(time.time() * 1000)}"

    # 添加任务
    await task_manager.add_task(
        task_id,
        long_running_task,
        task_name,
        duration
    )

    return {
        "task_id": task_id,
        "status": "started",
        "duration": duration,
        "monitor_url": f"/tasks/{task_id}"
    }

@app.get("/tasks/{task_id}")
async def get_task_info(task_id: str):
    """获取任务信息"""

    status = await task_manager.get_task_status(task_id)
    result = await task_manager.get_task_result(task_id)

    response = {"task_id": task_id, "status": status}

    if result:
        response["result"] = result

    return response

async def long_running_task(task_name: str, duration: int):
    """长时间运行的任务"""

    for i in range(duration):
        # 模拟工作
        await asyncio.sleep(1)

        # 这里可以更新进度
        # 例如：update_progress(task_id, i + 1, duration)

    return {
        "task_name": task_name,
        "duration": duration,
        "completed_at": datetime.now().isoformat(),
        "result": f"任务{task_name}完成，运行了{duration}秒"
    }
```

### 方案三：基于 Redis 的分布式定时任务

```python
# app/services/redis_scheduler.py
import asyncio
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable, Any
import aioredis
import pickle
import hashlib
import logging

logger = logging.getLogger(__name__)

class RedisScheduler:
    """基于Redis的分布式定时任务调度器"""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        namespace: str = "scheduler"
    ):
        self.redis_url = redis_url
        self.namespace = namespace
        self.redis = None
        self.running = False
        self.callbacks = {}

    async def connect(self):
        """连接Redis"""
        self.redis = await aioredis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=False
        )

    async def disconnect(self):
        """断开Redis连接"""
        if self.redis:
            await self.redis.close()

    async def start(self):
        """启动调度器"""
        if self.running:
            return

        await self.connect()
        self.running = True

        # 启动任务处理循环
        asyncio.create_task(self._process_tasks())

        logger.info("Redis调度器已启动")

    async def stop(self):
        """停止调度器"""
        self.running = False
        await self.disconnect()
        logger.info("Redis调度器已停止")

    async def schedule_task(
        self,
        task_id: str,
        task_func: Callable,
        args: tuple = (),
        kwargs: dict = None,
        execute_at: Optional[datetime] = None,
        execute_in: Optional[float] = None,
        cron_expression: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: float = 60.0
    ) -> str:
        """调度任务"""

        if not self.redis:
            await self.connect()

        # 确定执行时间
        if execute_at:
            execute_timestamp = execute_at.timestamp()
        elif execute_in:
            execute_timestamp = time.time() + execute_in
        else:
            execute_timestamp = time.time()

        # 存储任务数据
        task_data = {
            "id": task_id,
            "func": self._serialize_func(task_func),
            "args": args,
            "kwargs": kwargs or {},
            "execute_at": execute_timestamp,
            "cron_expression": cron_expression,
            "max_retries": max_retries,
            "retry_delay": retry_delay,
            "created_at": time.time(),
            "retry_count": 0,
            "status": "scheduled",
        }

        # 存储到Redis
        task_key = f"{self.namespace}:task:{task_id}"
        await self.redis.hset(
            task_key,
            mapping={
                k: pickle.dumps(v) if k == "func" else json.dumps(v)
                for k, v in task_data.items()
            }
        )

        # 设置过期时间（任务执行后1小时）
        await self.redis.expire(task_key, 3600)

        # 添加到有序集合（按执行时间排序）
        zset_key = f"{self.namespace}:schedule"
        await self.redis.zadd(zset_key, {task_id: execute_timestamp})

        logger.info(f"已调度任务: {task_id}, 执行时间: {execute_timestamp}")
        return task_id

    async def _process_tasks(self):
        """处理待执行任务"""

        while self.running:
            try:
                current_time = time.time()
                zset_key = f"{self.namespace}:schedule"

                # 获取需要执行的任务
                tasks = await self.redis.zrangebyscore(
                    zset_key,
                    "-inf",
                    current_time,
                    start=0,
                    num=10
                )

                for task_id_bytes in tasks:
                    task_id = task_id_bytes.decode()

                    # 从有序集合中移除
                    await self.redis.zrem(zset_key, task_id)

                    # 执行任务
                    asyncio.create_task(self._execute_task(task_id))

                # 没有任务时等待
                if not tasks:
                    await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"处理任务时出错: {e}")
                await asyncio.sleep(5)

    async def _execute_task(self, task_id: str):
        """执行任务"""

        task_key = f"{self.namespace}:task:{task_id}"

        try:
            # 获取任务数据
            task_data = await self.redis.hgetall(task_key)
            if not task_data:
                logger.warning(f"任务不存在: {task_id}")
                return

            # 反序列化任务数据
            decoded_data = {}
            for k, v in task_data.items():
                key = k.decode()
                if key == "func":
                    decoded_data[key] = pickle.loads(v)
                else:
                    decoded_data[key] = json.loads(v)

            # 更新任务状态
            decoded_data["status"] = "executing"
            decoded_data["started_at"] = time.time()

            await self.redis.hset(
                task_key,
                "status",
                json.dumps("executing")
            )

            # 执行任务函数
            func = decoded_data["func"]
            args = decoded_data["args"]
            kwargs = decoded_data["kwargs"]

            try:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)

                # 更新任务状态为完成
                decoded_data["status"] = "completed"
                decoded_data["completed_at"] = time.time()
                decoded_data["result"] = result

                await self.redis.hset(
                    task_key,
                    mapping={
                        "status": json.dumps("completed"),
                        "completed_at": json.dumps(time.time()),
                        "result": json.dumps(result),
                    }
                )

                logger.info(f"任务执行成功: {task_id}")

                # 如果是cron任务，重新调度
                cron_expression = decoded_data.get("cron_expression")
                if cron_expression:
                    await self._reschedule_cron_task(task_id, decoded_data)

            except Exception as e:
                # 处理任务执行失败
                await self._handle_task_failure(task_id, decoded_data, e)

        except Exception as e:
            logger.error(f"执行任务时出错: {task_id}, 错误: {e}")

    async def _handle_task_failure(
        self,
        task_id: str,
        task_data: Dict,
        exception: Exception
    ):
        """处理任务失败"""

        task_key = f"{self.namespace}:task:{task_id}"

        # 更新重试计数
        retry_count = task_data.get("retry_count", 0) + 1
        max_retries = task_data.get("max_retries", 3)

        if retry_count <= max_retries:
            # 重试任务
            retry_delay = task_data.get("retry_delay", 60.0)
            next_execute = time.time() + retry_delay

            task_data["retry_count"] = retry_count
            task_data["status"] = "retrying"
            task_data["last_error"] = str(exception)
            task_data["next_retry_at"] = next_execute

            await self.redis.hset(
                task_key,
                mapping={
                    "retry_count": json.dumps(retry_count),
                    "status": json.dumps("retrying"),
                    "last_error": json.dumps(str(exception)),
                    "next_retry_at": json.dumps(next_execute),
                }
            )

            # 重新调度
            zset_key = f"{self.namespace}:schedule"
            await self.redis.zadd(zset_key, {task_id: next_execute})

            logger.warning(f"任务重试: {task_id}, 重试次数: {retry_count}/{max_retries}")

        else:
            # 重试次数用尽，标记为失败
            task_data["status"] = "failed"
            task_data["failed_at"] = time.time()
            task_data["last_error"] = str(exception)

            await self.redis.hset(
                task_key,
                mapping={
                    "status": json.dumps("failed"),
                    "failed_at": json.dumps(time.time()),
                    "last_error": json.dumps(str(exception)),
                }
            )

            logger.error(f"任务失败: {task_id}, 错误: {exception}")

    async def _reschedule_cron_task(self, task_id: str, task_data: Dict):
        """重新调度cron任务"""

        from croniter import croniter

        cron_expression = task_data["cron_expression"]
        last_execute = task_data.get("started_at", time.time())

        # 计算下一次执行时间
        cron = croniter(cron_expression, last_execute)
        next_execute = cron.get_next()

        # 更新任务数据
        task_data["execute_at"] = next_execute
        task_data["status"] = "scheduled"
        task_data["retry_count"] = 0

        task_key = f"{self.namespace}:task:{task_id}"
        await self.redis.hset(
            task_key,
            mapping={
                "execute_at": json.dumps(next_execute),
                "status": json.dumps("scheduled"),
                "retry_count": json.dumps(0),
            }
        )

        # 添加到调度集合
        zset_key = f"{self.namespace}:schedule"
        await self.redis.zadd(zset_key, {task_id: next_execute})

        logger.info(f"Cron任务重新调度: {task_id}, 下次执行: {next_execute}")

    def _serialize_func(self, func: Callable) -> bytes:
        """序列化函数"""
        # 注意：这只能序列化纯函数和模块级函数
        # 不能序列化类方法、实例方法等
        return pickle.dumps(func)

    async def cancel_task(self, task_id: str) -> bool:
        """取消任务"""

        if not self.redis:
            await self.connect()

        # 从有序集合中移除
        zset_key = f"{self.namespace}:schedule"
        removed = await self.redis.zrem(zset_key, task_id)

        if removed:
            # 更新任务状态
            task_key = f"{self.namespace}:task:{task_id}"
            await self.redis.hset(
                task_key,
                "status",
                json.dumps("cancelled")
            )

            logger.info(f"已取消任务: {task_id}")
            return True

        return False

    async def get_task_status(self, task_id: str) -> Dict:
        """获取任务状态"""

        if not self.redis:
            await self.connect()

        task_key = f"{self.namespace}:task:{task_id}"
        task_data = await self.redis.hgetall(task_key)

        if not task_data:
            return {"status": "not_found"}

        # 反序列化
        result = {}
        for k, v in task_data.items():
            key = k.decode()
            if key == "func":
                continue  # 跳过函数数据
            result[key] = json.loads(v)

        return result

    async def get_pending_tasks(self, limit: int = 100) -> List[Dict]:
        """获取待处理任务"""

        if not self.redis:
            await self.connect()

        zset_key = f"{self.namespace}:schedule"
        tasks = await self.redis.zrange(
            zset_key,
            0,
            limit - 1,
            withscores=True
        )

        result = []
        for task_id_bytes, score in tasks:
            task_id = task_id_bytes.decode()
            task_info = await self.get_task_status(task_id)
            task_info["scheduled_at"] = score
            result.append(task_info)

        return result

# 使用示例
redis_scheduler = RedisScheduler()

@app.on_event("startup")
async def startup_scheduler():
    """启动调度器"""
    await redis_scheduler.start()

    # 注册示例任务
    await redis_scheduler.schedule_task(
        task_id="daily_cleanup",
        task_func=daily_cleanup,
        cron_expression="0 0 * * *",  # 每天凌晨
        max_retries=3
    )

    await redis_scheduler.schedule_task(
        task_id="send_welcome_emails",
        task_func=send_welcome_emails,
        execute_in=300,  # 5分钟后执行
        max_retries=2
    )

@app.on_event("shutdown")
async def shutdown_scheduler():
    """关闭调度器"""
    await redis_scheduler.stop()

# API端点
@app.post("/schedule")
async def schedule_custom_task(
    task_request: Dict,
    background_tasks: BackgroundTasks
):
    """调度自定义任务"""

    task_id = f"custom_{int(time.time() * 1000)}"

    # 创建任务函数
    async def custom_task():
        # 这里是任务逻辑
        logger.info(f"执行自定义任务: {task_id}")
        await asyncio.sleep(5)
        return {"status": "completed"}

    # 调度任务
    await redis_scheduler.schedule_task(
        task_id=task_id,
        task_func=custom_task,
        execute_in=task_request.get("delay", 0),
        max_retries=task_request.get("max_retries", 1)
    )

    return {
        "task_id": task_id,
        "status": "scheduled",
        "monitor_url": f"/schedule/{task_id}"
    }

@app.get("/schedule/{task_id}")
async def get_scheduled_task(task_id: str):
    """获取调度任务状态"""
    status = await redis_scheduler.get_task_status(task_id)
    return {"task_id": task_id, "status": status}
```

## 6. 请求生命周期管理

### FastAPI 生命周期事件

```python
from fastapi import FastAPI
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import asyncio
from datetime import datetime

# 传统方式（不推荐，将在FastAPI 2.0中移除）
app = FastAPI()

@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    print("应用启动中...")
    # 初始化数据库连接
    await init_database()
    # 加载配置
    await load_config()
    # 启动后台任务
    asyncio.create_task(background_worker())
    print("应用启动完成")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    print("应用关闭中...")
    # 关闭数据库连接
    await close_database()
    # 清理资源
    await cleanup_resources()
    print("应用关闭完成")

# 新的推荐方式（FastAPI 2.0+）
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """应用生命周期管理"""

    # 启动阶段
    print("应用启动中...")
    start_time = datetime.now()

    # 初始化组件
    await init_database()
    await init_cache()
    await init_services()

    # 启动监控
    monitor_task = asyncio.create_task(start_monitoring())

    # 启动后台任务
    background_tasks = [
        asyncio.create_task(task1()),
        asyncio.create_task(task2()),
    ]

    startup_duration = (datetime.now() - start_time).total_seconds()
    print(f"应用启动完成，耗时{startup_duration:.2f}秒")

    # 运行阶段
    yield

    # 关闭阶段
    print("应用关闭中...")
    shutdown_start = datetime.now()

    # 取消后台任务
    for task in background_tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # 停止监控
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass

    # 清理资源
    await cleanup_services()
    await cleanup_cache()
    await cleanup_database()

    shutdown_duration = (datetime.now() - shutdown_start).total_seconds()
    print(f"应用关闭完成，耗时{shutdown_duration:.2f}秒")

# 使用lifespan创建应用
app = FastAPI(lifespan=lifespan)
```

### 请求生命周期钩子

```python
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from typing import Callable, Dict, Any
import time
from contextvars import ContextVar

app = FastAPI()

# 请求上下文变量
request_start_time = ContextVar("request_start_time")
request_id_var = ContextVar("request_id")

class RequestLifecycle:
    """请求生命周期管理器"""

    @staticmethod
    async def before_request(request: Request) -> Dict[str, Any]:
        """请求处理前的钩子"""

        # 记录开始时间
        start_time = time.time()
        request_start_time.set(start_time)

        # 生成请求ID
        request_id = f"req_{int(start_time * 1000)}_{hash(request.client.host) if request.client else 0}"
        request_id_var.set(request_id)

        # 设置请求状态
        request.state.start_time = start_time
        request.state.request_id = request_id
        request.state.user_agent = request.headers.get("user-agent")
        request.state.client_ip = request.client.host if request.client else "unknown"

        # 记录请求日志
        await RequestLifecycle.log_request(request)

        return {
            "start_time": start_time,
            "request_id": request_id,
        }

    @staticmethod
    async def after_request(
        request: Request,
        response: JSONResponse
    ) -> JSONResponse:
        """请求处理后的钩子"""

        # 计算处理时间
        start_time = request_start_time.get()
        process_time = time.time() - start_time

        # 添加响应头
        response.headers["X-Request-ID"] = request_id_var.get()
        response.headers["X-Process-Time"] = f"{process_time:.3f}"

        # 记录响应日志
        await RequestLifecycle.log_response(request, response, process_time)

        # 慢请求警告
        if process_time > 1.0:  # 超过1秒
            await RequestLifecycle.log_slow_request(request, process_time)

        return response

    @staticmethod
    async def on_exception(
        request: Request,
        exception: Exception
    ) -> Dict[str, Any]:
        """异常处理钩子"""

        # 记录异常
        await RequestLifecycle.log_exception(request, exception)

        # 发送告警（如果异常严重）
        if RequestLifecycle.is_critical_exception(exception):
            await RequestLifecycle.send_alert(request, exception)

        return {
            "request_id": request_id_var.get(),
            "exception": str(exception),
            "type": type(exception).__name__,
        }

    @staticmethod
    async def log_request(request: Request):
        """记录请求日志"""
        log_data = {
            "timestamp": time.time(),
            "type": "request",
            "request_id": request.state.request_id,
            "method": request.method,
            "url": str(request.url),
            "client_ip": request.state.client_ip,
            "user_agent": request.state.user_agent,
        }

        # 这里应该写入日志系统
        print(f"请求: {log_data}")

    @staticmethod
    async def log_response(
        request: Request,
        response: JSONResponse,
        process_time: float
    ):
        """记录响应日志"""
        log_data = {
            "timestamp": time.time(),
            "type": "response",
            "request_id": request.state.request_id,
            "status_code": response.status_code,
            "process_time": process_time,
        }

        print(f"响应: {log_data}")

    @staticmethod
    async def log_exception(request: Request, exception: Exception):
        """记录异常日志"""
        log_data = {
            "timestamp": time.time(),
            "type": "exception",
            "request_id": request.state.request_id,
            "exception": str(exception),
            "exception_type": type(exception).__name__,
        }

        print(f"异常: {log_data}")

    @staticmethod
    def is_critical_exception(exception: Exception) -> bool:
        """检查是否是严重异常"""
        critical_exceptions = [
            "TimeoutError",
            "ConnectionError",
            "DatabaseError",
        ]

        return type(exception).__name__ in critical_exceptions

    @staticmethod
    async def send_alert(request: Request, exception: Exception):
        """发送告警"""
        # 这里应该实现告警逻辑
        pass

# 创建中间件来管理请求生命周期
@app.middleware("http")
async def lifecycle_middleware(request: Request, call_next):
    """请求生命周期中间件"""

    try:
        # 请求前处理
        context = await RequestLifecycle.before_request(request)

        # 处理请求
        response = await call_next(request)

        # 请求后处理
        response = await RequestLifecycle.after_request(request, response)

        return response

    except Exception as e:
        # 异常处理
        error_info = await RequestLifecycle.on_exception(request, e)

        # 返回错误响应
        return JSONResponse(
            status_code=500,
            content={
                "detail": "服务器内部错误",
                "request_id": error_info["request_id"],
            }
        )

# 依赖项：获取请求上下文
def get_request_context() -> Dict[str, Any]:
    """获取请求上下文"""
    return {
        "request_id": request_id_var.get(),
        "start_time": request_start_time.get(),
    }

# 在路由中使用
@app.get("/api/data")
async def get_data(
    request: Request,
    context: Dict = Depends(get_request_context)
):
    """获取数据"""

    # 使用请求上下文
    request_id = context["request_id"]

    # 模拟数据处理
    await asyncio.sleep(0.1)

    return {
        "data": "example data",
        "request_id": request_id,
        "processed_at": time.time(),
    }
```

### 数据库连接生命周期管理

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine
)
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncGenerator, Generator

class DatabaseManager:
    """数据库连接生命周期管理器"""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.engine = None
        self.async_session_factory = None
        self.sync_session_factory = None

    async def startup(self):
        """启动数据库连接"""
        print("启动数据库连接...")

        # 创建异步引擎
        self.engine = create_async_engine(
            self.database_url,
            echo=False,
            pool_size=20,
            max_overflow=30,
            pool_pre_ping=True,
            pool_recycle=3600,
            pool_timeout=30,
        )

        # 创建异步会话工厂
        self.async_session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

        # 创建同步会话工厂（如果需要）
        # self.sync_session_factory = sessionmaker(...)

        # 测试连接
        async with self.engine.connect() as conn:
            await conn.execute("SELECT 1")

        print("数据库连接就绪")

    async def shutdown(self):
        """关闭数据库连接"""
        print("关闭数据库连接...")

        if self.engine:
            await self.engine.dispose()
            self.engine = None

        print("数据库连接已关闭")

    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """获取数据库会话（异步）"""

        if not self.async_session_factory:
            raise RuntimeError("数据库连接未初始化")

        session = self.async_session_factory()

        try:
            yield session
            await session.commit()

        except Exception:
            await session.rollback()
            raise

        finally:
            await session.close()

    @contextmanager
    def get_sync_session(self) -> Generator:
        """获取数据库会话（同步）"""

        if not self.sync_session_factory:
            raise RuntimeError("数据库连接未初始化")

        session = self.sync_session_factory()

        try:
            yield session
            session.commit()

        except Exception:
            session.rollback()
            raise

        finally:
            session.close()

    async def health_check(self) -> Dict[str, Any]:
        """数据库健康检查"""

        try:
            async with self.engine.connect() as conn:
                start_time = time.time()
                result = await conn.execute("SELECT 1")
                process_time = time.time() - start_time

                # 检查连接池状态
                pool_status = {
                    "size": self.engine.pool.size(),
                    "checkedin": self.engine.pool.checkedin(),
                    "checkedout": self.engine.pool.checkedout(),
                    "overflow": self.engine.pool.overflow(),
                }

                return {
                    "status": "healthy",
                    "ping_time": process_time,
                    "pool": pool_status,
                }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }

# 在FastAPI中集成
database_manager = DatabaseManager("postgresql+asyncpg://user:pass@localhost/db")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""

    # 启动
    await database_manager.startup()

    yield

    # 关闭
    await database_manager.shutdown()

app = FastAPI(lifespan=lifespan)

# 依赖项：获取数据库会话
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话依赖项"""
    async with database_manager.get_session() as session:
        yield session

# 健康检查端点
@app.get("/health/database")
async def database_health():
    """数据库健康检查"""
    return await database_manager.health_check()

# 使用数据库会话的示例
@app.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取用户"""

    from sqlalchemy import select
    from app.models import User

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        return {"error": "用户不存在"}

    return {"user": user}
```

## 7. 性能监控中间件

### 综合性能监控中间件

```python
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import psutil
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import statistics
from collections import deque
import json

class PerformanceMonitorMiddleware(BaseHTTPMiddleware):
    """性能监控中间件"""

    def __init__(self, app, config: Optional[Dict] = None):
        super().__init__(app)

        self.config = config or {
            "sample_size": 1000,  # 样本大小
            "alert_threshold_ms": 1000,  # 告警阈值（毫秒）
            "collect_system_metrics": True,
            "collect_gc_metrics": False,
        }

        # 性能数据存储
        self.request_times = deque(maxlen=self.config["sample_size"])
        self.error_counts = deque(maxlen=self.config["sample_size"])
        self.system_metrics = deque(maxlen=100)

        # 统计信息
        self.stats = {
            "total_requests": 0,
            "total_errors": 0,
            "start_time": datetime.now(),
            "last_alert_time": None,
        }

        # 启动系统指标收集
        if self.config["collect_system_metrics"]:
            asyncio.create_task(self.collect_system_metrics())

    async def dispatch(self, request: Request, call_next) -> Response:
        """处理请求并监控性能"""

        # 记录开始时间
        start_time = time.time()
        start_perf_counter = time.perf_counter()

        # 收集请求信息
        request_info = {
            "method": request.method,
            "url": str(request.url),
            "client": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", ""),
            "content_length": int(request.headers.get("content-length", 0)),
        }

        # 处理请求
        try:
            response = await call_next(request)

            # 计算处理时间
            end_time = time.time()
            end_perf_counter = time.perf_counter()

            wall_time = end_time - start_time
            cpu_time = end_perf_counter - start_perf_counter

            # 记录性能数据
            self.record_request(
                request_info,
                response.status_code,
                wall_time,
                cpu_time,
                success=True
            )

            # 添加性能头
            response.headers["X-Process-Time"] = f"{wall_time:.3f}"
            response.headers["X-CPU-Time"] = f"{cpu_time:.3f}"

            return response

        except Exception as e:
            # 计算处理时间（即使出错）
            end_time = time.time()
            wall_time = end_time - start_time

            # 记录错误
            self.record_request(
                request_info,
                500,
                wall_time,
                0,
                success=False,
                error=str(e)
            )

            # 重新抛出异常
            raise

    def record_request(
        self,
        request_info: Dict[str, Any],
        status_code: int,
        wall_time: float,
        cpu_time: float,
        success: bool,
        error: Optional[str] = None
    ):
        """记录请求性能数据"""

        # 更新统计
        self.stats["total_requests"] += 1

        if not success:
            self.stats["total_errors"] += 1

        # 记录请求时间
        request_data = {
            "timestamp": datetime.now(),
            "request_info": request_info,
            "status_code": status_code,
            "wall_time": wall_time,
            "cpu_time": cpu_time,
            "success": success,
            "error": error,
        }

        self.request_times.append(request_data)

        # 检查是否需要告警
        if wall_time * 1000 > self.config["alert_threshold_ms"]:
            self.alert_slow_request(request_data)

    async def collect_system_metrics(self):
        """收集系统指标"""
        import gc

        while True:
            try:
                # CPU使用率
                cpu_percent = psutil.cpu_percent(interval=1)

                # 内存使用
                memory = psutil.virtual_memory()

                # 磁盘IO
                disk_io = psutil.disk_io_counters()

                # 网络IO
                net_io = psutil.net_io_counters()

                # GC统计
                gc_stats = {}
                if self.config["collect_gc_metrics"]:
                    gc.collect()
                    gc_stats = {
                        "collected": gc.get_count(),
                        "threshold": gc.get_threshold(),
                    }

                # 记录系统指标
                system_data = {
                    "timestamp": datetime.now(),
                    "cpu_percent": cpu_percent,
                    "memory": {
                        "total": memory.total,
                        "available": memory.available,
                        "percent": memory.percent,
                        "used": memory.used,
                    },
                    "disk_io": {
                        "read_bytes": disk_io.read_bytes if disk_io else 0,
                        "write_bytes": disk_io.write_bytes if disk_io else 0,
                    },
                    "net_io": {
                        "bytes_sent": net_io.bytes_sent if net_io else 0,
                        "bytes_recv": net_io.bytes_recv if net_io else 0,
                    },
                    "gc_stats": gc_stats,
                }

                self.system_metrics.append(system_data)

                # 检查系统健康状态
                self.check_system_health(system_data)

                # 每5秒收集一次
                await asyncio.sleep(5)

            except Exception as e:
                print(f"收集系统指标失败: {e}")
                await asyncio.sleep(10)

    def check_system_health(self, system_data: Dict):
        """检查系统健康状态"""

        # CPU使用率告警
        if system_data["cpu_percent"] > 80:
            self.alert_high_cpu(system_data["cpu_percent"])

        # 内存使用率告警
        if system_data["memory"]["percent"] > 85:
            self.alert_high_memory(system_data["memory"]["percent"])

    def alert_slow_request(self, request_data: Dict):
        """慢请求告警"""

        # 避免频繁告警
        current_time = datetime.now()
        last_alert = self.stats.get("last_alert_time")

        if last_alert and (current_time - last_alert).total_seconds() < 60:
            return

        # 发送告警
        alert_message = (
            f"慢请求告警:\n"
            f"URL: {request_data['request_info']['url']}\n"
            f"方法: {request_data['request_info']['method']}\n"
            f"处理时间: {request_data['wall_time']:.3f}秒\n"
            f"客户端: {request_data['request_info']['client']}"
        )

        # 这里应该发送到告警系统（如邮件、Slack、钉钉等）
        print(f"ALERT: {alert_message}")

        # 更新最后告警时间
        self.stats["last_alert_time"] = current_time

    def alert_high_cpu(self, cpu_percent: float):
        """高CPU使用率告警"""
        print(f"ALERT: 高CPU使用率: {cpu_percent}%")

    def alert_high_memory(self, memory_percent: float):
        """高内存使用率告警"""
        print(f"ALERT: 高内存使用率: {memory_percent}%")

    def get_performance_stats(self) -> Dict[str, Any]:
        """获取性能统计"""

        if not self.request_times:
            return {"error": "没有性能数据"}

        # 提取所有请求的处理时间
        wall_times = [r["wall_time"] for r in self.request_times]
        cpu_times = [r["cpu_time"] for r in self.request_times]

        # 计算统计信息
        stats = {
            "requests": {
                "total": self.stats["total_requests"],
                "errors": self.stats["total_errors"],
                "error_rate": self.stats["total_errors"] / max(self.stats["total_requests"], 1),
                "sample_size": len(self.request_times),
            },
            "response_time": {
                "wall_time": {
                    "mean": statistics.mean(wall_times) if wall_times else 0,
                    "median": statistics.median(wall_times) if wall_times else 0,
                    "p95": self.percentile(wall_times, 95) if wall_times else 0,
                    "p99": self.percentile(wall_times, 99) if wall_times else 0,
                    "min": min(wall_times) if wall_times else 0,
                    "max": max(wall_times) if wall_times else 0,
                },
                "cpu_time": {
                    "mean": statistics.mean(cpu_times) if cpu_times else 0,
                    "median": statistics.median(cpu_times) if cpu_times else 0,
                    "min": min(cpu_times) if cpu_times else 0,
                    "max": max(cpu_times) if cpu_times else 0,
                },
            },
            "system": {
                "metrics_count": len(self.system_metrics),
                "latest": self.system_metrics[-1] if self.system_metrics else None,
            },
            "uptime": {
                "start_time": self.stats["start_time"].isoformat(),
                "uptime_seconds": (datetime.now() - self.stats["start_time"]).total_seconds(),
            },
        }

        return stats

    @staticmethod
    def percentile(data: list, percent: float) -> float:
        """计算百分位数"""
        if not data:
            return 0

        sorted_data = sorted(data)
        index = (len(sorted_data) - 1) * percent / 100
        lower = int(index)
        upper = lower + 1

        if upper >= len(sorted_data):
            return sorted_data[lower]

        weight = index - lower
        return sorted_data[lower] * (1 - weight) + sorted_data[upper] * weight

# 注册中间件
app = FastAPI()
monitor = PerformanceMonitorMiddleware(app)

# 性能监控端点
@app.get("/metrics/performance")
async def get_performance_metrics():
    """获取性能指标"""
    return monitor.get_performance_stats()

@app.get("/metrics/system")
async def get_system_metrics(limit: int = 100):
    """获取系统指标"""

    metrics = list(monitor.system_metrics)
    if limit > 0:
        metrics = metrics[-limit:]

    return {
        "count": len(metrics),
        "metrics": metrics,
    }

@app.get("/metrics/requests")
async def get_request_metrics(limit: int = 100):
    """获取请求指标"""

    requests = list(monitor.request_times)
    if limit > 0:
        requests = requests[-limit:]

    # 简化返回数据
    simplified = []
    for req in requests:
        simplified.append({
            "timestamp": req["timestamp"].isoformat(),
            "method": req["request_info"]["method"],
            "url": req["request_info"]["url"],
            "status_code": req["status_code"],
            "wall_time": req["wall_time"],
            "success": req["success"],
        })

    return {
        "count": len(simplified),
        "requests": simplified,
    }

# 健康检查端点
@app.get("/health")
async def health_check():
    """健康检查"""

    # 获取性能统计
    stats = monitor.get_performance_stats()

    # 检查系统状态
    system_ok = True
    error_messages = []

    # 检查错误率
    if stats["requests"]["error_rate"] > 0.1:  # 错误率超过10%
        system_ok = False
        error_messages.append(f"错误率过高: {stats['requests']['error_rate']:.2%}")

    # 检查响应时间
    p99_response = stats["response_time"]["wall_time"]["p99"]
    if p99_response > 2.0:  # P99响应时间超过2秒
        system_ok = False
        error_messages.append(f"P99响应时间过长: {p99_response:.3f}秒")

    # 检查系统指标
    if monitor.system_metrics:
        latest = monitor.system_metrics[-1]

        if latest["cpu_percent"] > 90:
            system_ok = False
            error_messages.append(f"CPU使用率过高: {latest['cpu_percent']}%")

        if latest["memory"]["percent"] > 90:
            system_ok = False
            error_messages.append(f"内存使用率过高: {latest['memory']['percent']}%")

    if system_ok:
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "stats": {
                "uptime_seconds": stats["uptime"]["uptime_seconds"],
                "total_requests": stats["requests"]["total"],
                "error_rate": stats["requests"]["error_rate"],
            },
        }
    else:
        return {
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "errors": error_messages,
            "stats": stats,
        }
```

### Prometheus 集成

```python
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from typing import Dict, Any
import time

class PrometheusMetrics:
    """Prometheus指标收集"""

    def __init__(self):
        # 请求计数器
        self.request_count = Counter(
            'http_requests_total',
            'Total HTTP requests',
            ['method', 'endpoint', 'status']
        )

        # 请求延迟直方图
        self.request_duration = Histogram(
            'http_request_duration_seconds',
            'HTTP request duration in seconds',
            ['method', 'endpoint'],
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
        )

        # 活跃请求数
        self.active_requests = Gauge(
            'http_active_requests',
            'Number of active HTTP requests'
        )

        # 错误计数器
        self.error_count = Counter(
            'http_errors_total',
            'Total HTTP errors',
            ['method', 'endpoint', 'error_type']
        )

        # 自定义业务指标
        self.user_registrations = Counter(
            'user_registrations_total',
            'Total user registrations'
        )

        self.api_calls = Counter(
            'api_calls_total',
            'Total API calls',
            ['api_name', 'version']
        )

    def record_request(
        self,
        method: str,
        endpoint: str,
        status_code: int,
        duration: float
    ):
        """记录请求指标"""

        # 标准化端点（去除参数）
        normalized_endpoint = self.normalize_endpoint(endpoint)

        # 记录请求计数
        self.request_count.labels(
            method=method,
            endpoint=normalized_endpoint,
            status=str(status_code)
        ).inc()

        # 记录请求时长
        self.request_duration.labels(
            method=method,
            endpoint=normalized_endpoint
        ).observe(duration)

    def record_error(
        self,
        method: str,
        endpoint: str,
        error_type: str
    ):
        """记录错误指标"""
        normalized_endpoint = self.normalize_endpoint(endpoint)
        self.error_count.labels(
            method=method,
            endpoint=normalized_endpoint,
            error_type=error_type
        ).inc()

    def increment_user_registrations(self):
        """增加用户注册计数"""
        self.user_registrations.inc()

    def increment_api_calls(self, api_name: str, version: str = "v1"):
        """增加API调用计数"""
        self.api_calls.labels(api_name=api_name, version=version).inc()

    @staticmethod
    def normalize_endpoint(endpoint: str) -> str:
        """标准化端点路径"""
        # 移除查询参数
        if '?' in endpoint:
            endpoint = endpoint.split('?')[0]

        # 移除路径参数值，保留参数名
        parts = endpoint.split('/')
        normalized_parts = []

        for part in parts:
            if part.isdigit() or (part.startswith('{') and part.endswith('}')):
                # 数字或路径参数，替换为占位符
                normalized_parts.append('{id}')
            else:
                normalized_parts.append(part)

        return '/'.join(normalized_parts)

# 创建Prometheus中间件
class PrometheusMiddleware(BaseHTTPMiddleware):
    """Prometheus指标中间件"""

    def __init__(self, app, metrics: PrometheusMetrics):
        super().__init__(app)
        self.metrics = metrics

    async def dispatch(self, request: Request, call_next) -> Response:
        """处理请求并收集指标"""

        # 增加活跃请求数
        self.metrics.active_requests.inc()

        start_time = time.time()

        try:
            # 处理请求
            response = await call_next(request)

            # 计算处理时间
            duration = time.time() - start_time

            # 记录请求指标
            self.metrics.record_request(
                method=request.method,
                endpoint=str(request.url.path),
                status_code=response.status_code,
                duration=duration
            )

            # 记录API调用
            if request.url.path.startswith('/api/'):
                api_name = request.url.path.split('/')[2] if len(request.url.path.split('/')) > 2 else 'unknown'
                self.metrics.increment_api_calls(api_name)

            return response

        except Exception as e:
            # 记录错误
            error_type = type(e).__name__
            self.metrics.record_error(
                method=request.method,
                endpoint=str(request.url.path),
                error_type=error_type
            )

            # 重新抛出异常
            raise

        finally:
            # 减少活跃请求数
            self.metrics.active_requests.dec()

# 集成到FastAPI
app = FastAPI()

# 创建指标收集器
metrics = PrometheusMetrics()

# 添加Prometheus中间件
app.add_middleware(PrometheusMiddleware, metrics=metrics)

# 使用instrumentator自动收集基本指标
instrumentator = Instrumentator(
    excluded_handlers=["/metrics", "/health"],
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    should_respect_env_var=True,
    should_instrument_requests_inprogress=True,
    inprogress_name="http_requests_inprogress",
    inprogress_labels=True,
)

# 添加自定义指标
@instrumentator.info(
    "app_info",
    "Application information",
    version="1.0.0",
    environment="production",
)
def app_info() -> Dict[str, Any]:
    return {
        "version": "1.0.0",
        "environment": "production",
    }

# 挂载instrumentator
instrumentator.instrument(app).expose(app)

# 自定义指标端点
@app.get("/custom_metrics")
async def custom_metrics():
    """自定义指标端点"""

    # 这里可以添加自定义业务逻辑指标
    metrics_data = {
        "user_registrations": metrics.user_registrations._value.get(),
        "api_calls": {
            label: value.get()
            for label, value in metrics.api_calls._metrics.items()
        },
    }

    return metrics_data

# 示例路由，演示指标收集
@app.post("/api/users")
async def create_user():
    """创建用户"""

    # 模拟用户创建
    await asyncio.sleep(0.5)

    # 增加用户注册计数
    metrics.increment_user_registrations()

    return {"id": 1, "username": "new_user"}

@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    """获取用户"""

    # 模拟数据库查询
    await asyncio.sleep(0.1)

    return {"id": user_id, "username": f"user_{user_id}"}
```

## 实战项目：完整的监控和任务系统

```python
# app/core/monitoring.py
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import asyncio
from dataclasses import dataclass, field
from enum import Enum
import json

class AlertLevel(Enum):
    """告警级别"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

@dataclass
class Alert:
    """告警"""
    id: str
    level: AlertLevel
    title: str
    message: str
    source: str
    timestamp: datetime = field(default_factory=datetime.now)
    acknowledged: bool = False
    data: Dict[str, Any] = field(default_factory=dict)

class MonitoringSystem:
    """综合监控系统"""

    def __init__(self):
        self.alerts: List[Alert] = []
        self.metrics: Dict[str, Any] = {}
        self.alert_handlers = []
        self.max_alerts = 1000

    def add_alert_handler(self, handler):
        """添加告警处理器"""
        self.alert_handlers.append(handler)

    async def alert(
        self,
        level: AlertLevel,
        title: str,
        message: str,
        source: str = "system",
        data: Optional[Dict] = None
    ):
        """发送告警"""

        alert_id = f"alert_{int(datetime.now().timestamp() * 1000)}"
        alert = Alert(
            id=alert_id,
            level=level,
            title=title,
            message=message,
            source=source,
            data=data or {}
        )

        # 添加告警
        self.alerts.append(alert)

        # 限制告警数量
        if len(self.alerts) > self.max_alerts:
            self.alerts = self.alerts[-self.max_alerts:]

        # 调用告警处理器
        for handler in self.alert_handlers:
            try:
                await handler(alert)
            except Exception as e:
                print(f"告警处理器出错: {e}")

        return alert_id

    async def acknowledge_alert(self, alert_id: str) -> bool:
        """确认告警"""
        for alert in self.alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                return True
        return False

    def get_alerts(
        self,
        level: Optional[AlertLevel] = None,
        source: Optional[str] = None,
        acknowledged: Optional[bool] = None,
        limit: int = 100
    ) -> List[Alert]:
        """获取告警"""

        filtered = self.alerts

        if level:
            filtered = [a for a in filtered if a.level == level]

        if source:
            filtered = [a for a in filtered if a.source == source]

        if acknowledged is not None:
            filtered = [a for a in filtered if a.acknowledged == acknowledged]

        return filtered[-limit:] if limit > 0 else filtered

    async def record_metric(
        self,
        name: str,
        value: Any,
        tags: Optional[Dict[str, str]] = None
    ):
        """记录指标"""

        metric_key = name

        if tags:
            # 为标签创建唯一键
            tag_str = json.dumps(tags, sort_keys=True)
            metric_key = f"{name}:{tag_str}"

        self.metrics[metric_key] = {
            "name": name,
            "value": value,
            "tags": tags or {},
            "timestamp": datetime.now().isoformat(),
        }

    def get_metrics(self, name: Optional[str] = None) -> Dict[str, Any]:
        """获取指标"""

        if name:
            return {
                k: v for k, v in self.metrics.items()
                if v["name"] == name
            }

        return self.metrics

    async def cleanup_old_data(self, max_age_hours: int = 24):
        """清理旧数据"""

        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)

        # 清理旧告警
        self.alerts = [
            a for a in self.alerts
            if a.timestamp > cutoff_time
        ]

        # 清理旧指标
        metric_keys_to_remove = []
        for key, metric in self.metrics.items():
            metric_time = datetime.fromisoformat(metric["timestamp"])
            if metric_time < cutoff_time:
                metric_keys_to_remove.append(key)

        for key in metric_keys_to_remove:
            del self.metrics[key]

        return len(metric_keys_to_remove)

# 告警处理器示例
async def log_alert_handler(alert: Alert):
    """日志告警处理器"""
    log_message = f"[{alert.level.value.upper()}] {alert.source}: {alert.title} - {alert.message}"
    print(log_message)

    # 也可以写入文件或日志系统
    with open("alerts.log", "a") as f:
        f.write(f"{alert.timestamp.isoformat()} {log_message}\n")

async def email_alert_handler(alert: Alert):
    """邮件告警处理器"""
    if alert.level in [AlertLevel.ERROR, AlertLevel.CRITICAL]:
        # 发送邮件
        subject = f"[{alert.level.value}] {alert.title}"
        body = f"""
        告警详情:
        级别: {alert.level.value}
        来源: {alert.source}
        时间: {alert.timestamp.isoformat()}
        消息: {alert.message}

        数据: {json.dumps(alert.data, indent=2)}
        """

        # 实际项目中应该调用邮件发送服务
        print(f"发送告警邮件: {subject}")

async def slack_alert_handler(alert: Alert):
    """Slack告警处理器"""
    if alert.level in [AlertLevel.WARNING, AlertLevel.ERROR, AlertLevel.CRITICAL]:
        # 发送到Slack
        color_map = {
            AlertLevel.WARNING: "warning",
            AlertLevel.ERROR: "danger",
            AlertLevel.CRITICAL: "danger",
        }

        color = color_map.get(alert.level, "good")

        slack_message = {
            "attachments": [{
                "color": color,
                "title": alert.title,
                "text": alert.message,
                "fields": [
                    {
                        "title": "级别",
                        "value": alert.level.value,
                        "short": True
                    },
                    {
                        "title": "来源",
                        "value": alert.source,
                        "short": True
                    }
                ],
                "ts": alert.timestamp.timestamp(),
            }]
        }

        # 实际项目中应该发送到Slack
        print(f"发送Slack告警: {json.dumps(slack_message)}")

# 集成到FastAPI
from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter(prefix="/monitoring", tags=["监控"])

# 创建监控系统实例
monitoring_system = MonitoringSystem()

# 添加告警处理器
monitoring_system.add_alert_handler(log_alert_handler)
monitoring_system.add_alert_handler(email_alert_handler)
monitoring_system.add_alert_handler(slack_alert_handler)

@router.get("/alerts")
async def get_alerts(
    level: Optional[str] = None,
    source: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = 100
):
    """获取告警"""

    alert_level = None
    if level:
        alert_level = AlertLevel(level)

    alerts = monitoring_system.get_alerts(
        level=alert_level,
        source=source,
        acknowledged=acknowledged,
        limit=limit
    )

    return {
        "alerts": [
            {
                "id": a.id,
                "level": a.level.value,
                "title": a.title,
                "message": a.message,
                "source": a.source,
                "timestamp": a.timestamp.isoformat(),
                "acknowledged": a.acknowledged,
                "data": a.data,
            }
            for a in alerts
        ],
        "count": len(alerts),
        "unacknowledged_count": len([a for a in alerts if not a.acknowledged]),
    }

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """确认告警"""

    success = await monitoring_system.acknowledge_alert(alert_id)

    if not success:
        return {"error": "告警不存在"}

    return {"success": True, "alert_id": alert_id}

@router.get("/metrics")
async def get_metrics(name: Optional[str] = None):
    """获取指标"""
    metrics = monitoring_system.get_metrics(name)
    return {"metrics": metrics, "count": len(metrics)}

@router.post("/test-alert")
async def test_alert(level: str = "warning"):
    """测试告警"""

    try:
        alert_level = AlertLevel(level)
    except ValueError:
        return {"error": "无效的告警级别"}

    alert_id = await monitoring_system.alert(
        level=alert_level,
        title="测试告警",
        message="这是一个测试告警",
        source="test",
        data={"test": True, "timestamp": datetime.now().isoformat()}
    )

    return {
        "message": "测试告警已发送",
        "alert_id": alert_id,
        "level": level,
    }

# 启动时开始清理任务
@app.on_event("startup")
async def start_monitoring_cleanup():
    """启动监控清理任务"""

    async def cleanup_task():
        while True:
            try:
                cleaned = await monitoring_system.cleanup_old_data(24)
                if cleaned > 0:
                    print(f"已清理{cleaned}个旧指标")
            except Exception as e:
                print(f"清理监控数据失败: {e}")

            await asyncio.sleep(3600)  # 每小时清理一次

    asyncio.create_task(cleanup_task())

# 注册路由
app.include_router(router)
```

## 总结

中间件和后台任务是 FastAPI 应用的重要组成部分，它们决定了应用的性能、可靠性和可维护性。通过本文的学习，你应该能够：

### 关键要点

1. **中间件设计原则**

   - 保持中间件简单、专注
   - 注意中间件的执行顺序
   - 合理使用上下文变量

2. **后台任务最佳实践**

   - 根据任务特点选择合适的方案（Celery、APScheduler、Redis 等）
   - 实现任务重试和错误处理
   - 监控任务执行状态

3. **性能监控策略**

   - 分层监控：系统、应用、业务
   - 实时告警和趋势分析
   - 集成到现有的监控生态

4. **生产环境建议**
   - 使用环境变量配置
   - 实现优雅的启动和关闭
   - 定期清理旧数据

### 推荐工具链

- **监控**：Prometheus + Grafana
- **日志**：ELK Stack（Elasticsearch, Logstash, Kibana）
- **告警**：AlertManager + 钉钉/企业微信/Slack
- **任务队列**：Celery + Redis/RabbitMQ
- **定时任务**：APScheduler 或 Celery Beat

### 常见问题解决

1. **中间件性能问题**

   ```python
   # 避免在中间件中进行复杂的计算或I/O操作
   # 使用缓存和异步操作
   ```

2. **任务堆积问题**

   ```python
   # 设置合理的队列长度限制
   # 实现任务优先级
   # 增加工作节点
   ```

3. **内存泄漏问题**
   ```python
   # 定期清理任务结果
   # 使用连接池
   # 监控内存使用情况
   ```

### 扩展学习

- [Starlette 中间件文档](https://www.starlette.io/middleware/)
- [Celery 最佳实践](https://docs.celeryq.dev/en/stable/userguide/tasks.html)
- [Prometheus 监控模式](https://prometheus.io/docs/practices/naming/)
- [分布式系统监控](https://sre.google/sre-book/monitoring-distributed-systems/)

---

**最后提醒**：中间件和后台任务系统是应用的基础设施，良好的设计可以避免未来的技术债务。在生产环境中部署前，务必进行充分的测试和压力测试。

> 好的中间件和任务系统就像城市的基础设施，平时看不见，但一旦出问题，整个系统都会瘫痪。投资时间在基础设施上，是保证应用长期稳定运行的关键。
