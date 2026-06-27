# Python 实战训练营 - 知识结构目录


## 课程概览

### 课程定位
针对 1-3 年初级 Python 开发工程师，系统提升工程化实战能力，达到一线大厂高级 Python 工程师水平

### 核心特色
- **大厂能力模型导向**：直击开源框架及中间件底层核心原理
- **实战驱动**：手写 Web 框架、ORM 框架、异步任务引擎、微服务框架
- **源码级教学**：深入 Flask、Django、FastAPI、Celery、SQLAlchemy 等主流框架实现
- **面试导向**：每个模块配备面试要点和常见问题

### 课程结构
| 维度 | 内容 |
|------|------|
| 周期 | 16周 |
| 模块 | 8大内容模块 |
| 实战 | 4大实战案例 |
| 加餐 | 4个热门面试主题 |
| 代码 | 完整代码仓库 |

---

## 模块一：Web 框架（3周）

### 教学目标
1. 掌握 Web 框架的基本原理与 WSGI/ASGI 规范
2. 掌握路由系统设计：基于规则匹配与树形路由
3. 掌握 Request/Response 对象模型与中间件链设计
4. 掌握 Session 与 Cookie 机制的设计实现
5. 掌握 Web 框架中 AOP（装饰器/中间件）方案
6. 设计并实现模板引擎与静态资源服务

### 学习痛点
- 用过 Flask/Django，但不了解 WSGI/ASGI 底层原理，不知道请求从接收到响应的完整链路
- 面试时无法清晰阐述路由匹配原理，不知道如何设计 URL 分发系统
- 不清楚 Session 的存储抽象设计，无法支持 Redis/数据库等多后端切换
- 无法灵活运用中间件/装饰器解决鉴权、日志、限流、CORS 等横切关注点

### 第一周：Web 框架核心设计与 WSGI 规范

#### 1.1 Web 框架概览与架构演进
- 从 CGI → WSGI → ASGI 的演进历程
- WSGI 规范详解：`application(environ, start_response)`
- ASGI 异步规范：事件循环与异步协程
- 核心组件：Application、Router、Request、Response、Middleware
- **开源实例分析**：Flask 的微框架设计 vs Django 的全栈框架设计

#### 1.2 HTTP 协议与 Python HTTP 标准库
- HTTP 请求/响应模型详解
- `http.server` 标准库源码分析
- `http.client` 客户端实现原理
- **进阶语法**：`socket` 编程与 HTTP Server 的关系
- **代码演示**：基于 `socket` 手写 HTTP Server，理解最底层通信

#### 1.3 路由系统设计与实现
- **开源实例**：Flask `@app.route` 装饰器原理、Django URLconf 设计、FastAPI APIRouter 对比
- **核心原理**：
  - 基于字典的静态路由匹配
  - 基于正则的动态路由匹配（路径参数提取）
  - 树形路由数据结构（类似 Radix Tree）
- **设计实现**：
  - Route 类设计：path、methods、handler、defaults
  - Rule 匹配引擎：`<converter:variable>` 语法
  - 转换器系统：int、float、string、uuid、path
- **代码演示**：实现支持动态参数的路由系统
- **作业**：实现自定义转换器（如手机号、日期格式）
- **面试要点**：路由匹配优先级、Flask `url_map` 底层数据结构

### 第二周：中间件与 AOP 方案设计

#### 2.1 AOP 设计模式详解
- **装饰器模式**（Decorator）：Python 装饰器原理与 `functools.wraps`
- **中间件模式**（Middleware）：洋葱模型与请求/响应拦截
- **上下文管理器**（Context Manager）：`with` 语句与 `contextlib`
- **进阶语法**：装饰器嵌套、带参数装饰器、类装饰器、`functools.wraps` 与 `__wrapped__`

#### 2.2 开源框架中间件实现对比
- **Django**：MiddlewareMixin 链式调用机制（process_request → process_view → process_response → process_exception）
- **Flask**：before_request / after_request / teardown_request 钩子设计
- **FastAPI**：ASGI 中间件栈与 Dependency Injection 系统
- **Starlette**：纯 ASGI 中间件设计（BaseHTTPMiddleware）

#### 2.3 代码演示：为 Web 框架提供 AOP 支持
- Access Log（访问日志）中间件
- CORS（跨域资源共享）中间件
- Auth（鉴权）中间件：JWT Token 校验
- Rate Limiting（限流）中间件：基于令牌桶算法
- Error Handling：统一异常处理与错误页面
- Gzip 压缩中间件
- **面试要点**：中间件执行顺序、before/after 钩子与中间件区别、协程中间件与同步中间件混用问题

### 第三周：高级功能实现

#### 3.1 文件上传与下载
- **开源实例**：Flask `werkzeug.FileStorage`、Django `UploadFile`、FastAPI `UploadFile` 对比
- 文件上传：`multipart/form-data` 解析、流式上传、分片上传
- 文件下载：`Content-Disposition`、分块下载、断点续传
- **进阶语法**：`io.BytesIO`、`io.FileIO`、生成器与流式处理
- **代码演示**：实现大文件分片上传与断点续传

#### 3.2 模板引擎设计
- 模板引擎原理：词法分析 → 语法分析 → AST → 代码生成 → 渲染
- **开源实例**：Jinja2 架构分析（Lexer、Parser、Environment、Template）
- **进阶语法**：`string.Template`、`str.format_map`、f-string 的底层实现
- **代码演示**：在 Web 框架中集成 Jinja2 模板引擎
- **设计模式**：变量查找链、过滤器系统、模板继承与宏

#### 3.3 静态资源服务
- **开源实例**：Django `staticfiles`、Flask `send_from_directory`、WhiteNoise 对比
- **代码演示**：设计可配置的静态资源处理器
  - FileResponse 流式传输
  - ETag / Last-Modified 缓存控制
  - Range 请求支持（大文件分块传输）

#### 3.4 Session 设计与实现
- **开源实例**：Flask-Session、Django Session Framework、itsdangerous 签名机制
- **代码演示**：Session API 设计与实现
  - 基于内存的实现（dict + threading.Lock）
  - 基于 Redis 的实现（支持 TTL 与序列化）
  - 基于 JWT 的无状态方案
- **安全设计**：Session 签名（HMAC）、防篡改、Secure / HttpOnly / SameSite Cookie 属性
- **面试要点**：Session vs JWT、CSRF 防护、分布式 Session 共享方案

### 模块一实战项目
**项目名称**：手写 Web 框架实现用户注册登录系统

**项目内容**：
1. 设计并实现一个完整的 WSGI Web 框架
2. 设计并实现动态路由系统（支持路径参数、转换器、路由分组）
3. 设计并实现中间件链（logging、CORS、auth、rate limit、error handling）
4. 设计并实现静态资源服务器（ETag 缓存、Range 请求）
5. 提供文件上传下载、模板渲染功能
6. 压测、分析、优化性能（使用 `locust` + `pyinstrument`）
7. 设计并实现 Session 机制（支持内存/Redis 双后端）
8. 基于框架实现用户注册、登录、密码重置服务
9. 利用中间件实现用户级限流与操作日志

---

## 模块二：ORM 框架（2周）

### 教学目标
1. 掌握 ORM 框架的核心设计原理与元编程技术
2. 掌握数据库连接池的设计与实现
3. 掌握 SQL 构造器（Query Builder）与表达式系统设计
4. 掌握模型映射（Model 与表映射）机制：元类、描述符、字段类型
5. 掌握事务管理与嵌套事务实现（Savepoint）
6. 掌握分库分表与读写分离框架设计思路

### 学习痛点
- 只会使用 SQLAlchemy/Django ORM，不了解 SQL 生成原理与元编程机制
- 遇到 N+1 查询问题不知道如何排查和优化
- 不了解连接池的工作原理和参数调优
- 复杂查询时 ORM 表达能力不足，只能退回裸 SQL

### 第四周：ORM 核心设计与元编程

#### 4.1 ORM 框架概览与元编程基础
- ORM 设计哲学：对象关系映射的本质与阻抗失配
- **开源实例**：SQLAlchemy、Django ORM、Tortoise ORM、Peewee 设计对比
- **元编程核心技术**：
  - `type()` 动态创建类与 `__init_subclass__`
  - 元类（Metaclass）：`__new__`、`__init__`、`__prepare__`
  - 描述符协议（Descriptor）：`__get__`、`__set__`、`__delete__`
  - `dataclasses` 与 `pydantic` 模型定义方式对比
- 核心组件：Engine、Session、Model、Field、Query、Dialect

#### 4.2 数据库连接与连接池
- DB-API 2.0 规范详解（PEP 249）
- `psycopg2` / `pymysql` 驱动原理
- 连接池设计原理与实现
  - **开源实例**：SQLAlchemy Pool（QueuePool、NullPool、SingletonThreadPool）
  - **Python 实现**：`queue.Queue` + `threading` 连接池
  - 参数调优：pool_size、max_overflow、pool_recycle、pool_pre_ping
- **代码演示**：实现线程安全的数据库连接池

#### 4.3 模型定义与字段系统
- **元类实现模型注册**：
  - `ModelBase.__new__` 收集字段元数据
  - `_meta` 选项类设计（表名、字段列表、索引、唯一约束）
  - 字段继承与抽象基类
- **字段类型系统**：
  - Field 基类设计：`db_type()`、`to_python()`、`get_db_prep_value()`
  - 字段类型实现：IntegerField、CharField、DateTimeField、TextField、JSONField
  - 字段选项：null、default、unique、index、primary_key
- **描述符实现字段访问**：
  - `Field.__get__`：从实例 `__dict__` 读取值
  - `Field.__set__`：设置值并标记为 dirty
- **代码演示**：使用元类实现完整的模型定义系统

### 第五周：Query Builder 与事务管理

#### 5.1 Query Builder 设计
- **链式调用 API 设计**：
  - `QuerySet` 惰性求值机制（Iterator Protocol + Generator）
  - 链式方法：`filter()`、`exclude()`、`order_by()`、`limit()`、`offset()`
  - 查询表达式：`Q` 对象（AND/OR/NOT）、`F` 对象（字段间运算）
- **条件构造**：
  - 查找表达式：`__eq`、`__gt`、`__in`、`__range`、`__contains`、`__icontains`
  - SQL 编译器：表达式 → SQL 片段 + 参数列表
  - 参数化查询与 SQL 注入防护
- **关联查询**：
  - `select_related()`：JOIN 单表查询（一对一、外键）
  - `prefetch_related()`：批量查询（多对多、反向关系）
  - N+1 查询问题原理与解决方案
- **聚合与分组**：`annotate()` / `aggregate()` + `GROUP BY` 生成
- **代码演示**：实现支持惰性求值的类型安全 Query Builder

#### 5.2 CRUD 操作实现
- **Insert**：单条/批量插入、`ON CONFLICT` (Upsert)、`RETURNING` 语法
- **Select**：单条查询、列表查询、分页（offset/limit vs keyset pagination）、`only()` / `defer()` 延迟加载
- **Update**：更新指定字段、乐观锁（`version` 字段）、`F()` 表达式原子更新
- **Delete**：软删除（`is_deleted` 标记）、物理删除、级联删除策略
- **代码演示**：实现完整 CRUD 操作（含 SQL 日志输出）

#### 5.3 事务管理
- 事务 ACID 特性与隔离级别（Read Uncommitted → Serializable）
- **Python 事务管理方案**：
  - 手动管理：`cursor.execute("BEGIN")` / `COMMIT` / `ROLLBACK`
  - 上下文管理器：`with transaction.atomic():`
  - 装饰器：`@transaction.atomic`
- 嵌套事务实现（Savepoint）
  - `SAVEPOINT sp_n` / `RELEASE SAVEPOINT sp_n` / `ROLLBACK TO SAVEPOINT sp_n`
- 事务传播行为与异常处理
- **代码演示**：实现基于上下文管理器的事务管理器（支持嵌套事务）

### 模块二实战项目
**项目名称**：手写 ORM 框架实现博客系统数据层

**项目内容**：
1. 设计并实现 ORM 核心（Engine、Session、Model 元类、Field 描述符）
2. 实现模型定义系统（支持字段类型、选项、继承、Meta 配置）
3. 实现完整 Query Builder（含 Q/F 表达式、关联查询、聚合、惰性求值）
4. 实现事务管理（支持嵌套事务与 Savepoint）
5. 实现连接池管理（支持参数调优与连接回收）
6. 基于 ORM 实现博客系统数据访问层（User、Post、Comment、Tag 多对多关系）
7. 性能优化：SQL 日志、慢查询分析、N+1 检测、`EXPLAIN` 分析

---

## 模块三：异步编程与并发（2周）

### 教学目标
1. 掌握 Python 异步编程核心原理：事件循环、协程、Future
2. 掌握 `asyncio` 标准库与异步 IO 模型
3. 掌握异步 Web 框架设计（ASGI 规范）
4. 掌握多进程/多线程/协程的选型与混合使用
5. 掌握异步数据库驱动与连接池设计
6. 掌握并发任务调度与流程控制

### 学习痛点
- 对 `async/await` 停留在表面，不理解事件循环原理
- 多线程 vs 多进程 vs 协程选型困难，不知道何时用哪个
- 异步代码与同步代码混用时阻塞事件循环，性能反而下降
- 异步异常处理、超时控制、任务取消等复杂场景不知道怎么写

### 第六周：异步编程核心原理

#### 6.1 IO 模型与事件循环
- **IO 多路复用模型**：select / poll / epoll 详解
- **Python 事件循环实现**：
  - `asyncio` 事件循环架构（Selector + Transport + Protocol）
  - `selectors` 标准库：DefaultSelector、EpollSelector、KqueueSelector
  - libuv / uvloop 性能对比
- **协程原理**：
  - 生成器协程（`yield` / `yield from`）→ 原生协程（`async` / `await`）的演进
  - `@types.coroutine` vs `@asyncio.coroutine` vs `async def`
  - 协程状态机：CORO_CREATED → CORO_SUSPENDED → CORO_RUNNING → CORO_CLOSED
- **核心概念**：
  - Task vs Future vs Coroutine
  - `asyncio.gather()` vs `asyncio.wait()` vs `asyncio.as_completed()`
  - `asyncio.Queue` 与生产者-消费者模式
- **代码演示**：手写简化版事件循环（基于 `selectors` 模块）

#### 6.2 多进程与多线程
- **多进程**（`multiprocessing`）：
  - Process / Pool / Queue / Pipe / Manager
  - 进程间通信（IPC）与共享内存（`Value`、`Array`、`Manager`）
  - fork vs spawn vs forkserver 启动方式
- **多线程**（`threading`）：
  - Thread / Lock / RLock / Condition / Semaphore / Event
  - GIL（全局解释器锁）原理与影响：为什么 Python 多线程不能利用多核
  - GIL 对 IO 密集型 vs CPU 密集型任务的不同影响
- **concurrent.futures**：
  - ThreadPoolExecutor vs ProcessPoolExecutor
  - `submit()` vs `map()`、`as_completed()` 结果收集
  - Future 对象与回调机制
- **代码演示**：CPU 密集型用多进程、IO 密集型用多线程/协程的基准测试对比

### 第七周：异步框架与并发模式

#### 7.1 ASGI 规范与异步 Web 框架
- **ASGI 规范详解**：
  - ASGI vs WSGI：异步事件模型 vs 同步调用模型
  - ASGI Application 签名：`async def app(scope, receive, send)`
  - 事件类型：`http.request`、`http.response.start`、`http.response.body`
- **开源实例**：
  - Starlette：ASGI 框架基础层（Request/Response、路由、中间件）
  - FastAPI：Starlette + Pydantic + 依赖注入
  - Uvicorn / Hypercorn / Daphne：ASGI Server 对比
- **代码演示**：将模块一的 WSGI 框架升级为 ASGI 异步框架

#### 7.2 异步数据库与缓存
- **异步数据库驱动**：
  - `asyncpg`（PostgreSQL）：基于 Protocol 的异步实现
  - `aiomysql` / `asyncmy`（MySQL）：对比与选型
  - SQLAlchemy 2.0 `AsyncSession` 设计
- **异步连接池设计**：
  - `asyncio.Queue` 实现异步连接池
  - 连接超时、空闲回收、健康检查
- **异步 Redis**：
  - `redis-py` async 模式、`aioredis` 演进
  - Pipeline、发布订阅的异步实现
- **代码演示**：实现异步 ORM（基于元类 + `async/await`）

#### 7.3 并发模式与流程控制
- **生产者-消费者模式**：`asyncio.Queue` 与背压控制
- **限并发模式**：`asyncio.Semaphore` 与有界队列
- **扇出/扇入**（Fan-out/Fan-in）：`gather` + `TaskGroup`（Python 3.11+）
- **超时与取消**：`asyncio.wait_for()`、`asyncio.timeout()`、`Task.cancel()` 与 `CancelledError`
- **异常处理**：`gather(return_exceptions=True)`、`asyncio.gather` 异常传播
- **异步上下文管理器**：`async with` 与 `asynccontextmanager`
- **异步迭代器**：`async for` 与 `__aiter__` / `__anext__`
- **代码演示**：实现异步爬虫调度器（限并发、超时、重试、结果聚合）

### 模块三实战项目
**项目名称**：异步高并发 Web 框架实现实时协作系统

**项目内容**：
1. 基于 ASGI 规范实现异步 Web 框架（支持 `async def` 路由处理器）
2. 实现异步中间件链（异步 CORS、异步 Auth、异步 Rate Limit）
3. 实现异步 ORM（基于 `asyncpg` + 元类，支持异步 CRUD 与连接池）
4. 实现 WebSocket 支持（实时双向通信）
5. 实现异步任务调度器（限并发、超时控制、重试机制）
6. 基于框架实现实时协作系统（在线文档协作 / 实时聊天）
7. 压测对比同步 vs 异步框架的性能差异（QPS、延迟、资源占用）

---

## 模块四：微服务框架（3周）

### 教学目标
1. 掌握微服务架构核心概念与设计原则
2. 掌握 RPC 框架的设计与实现（gRPC + Protocol Buffers）
3. 掌握服务注册与发现机制（Consul / Etcd）
4. 掌握负载均衡与熔断降级设计
5. 掌握分布式链路追踪（OpenTelemetry）
6. 掌握微服务网关设计（API Gateway）

### 学习痛点
- 微服务拆分粒度难以把握，拆太细运维成本高，拆太粗失去意义
- 服务间通信性能瓶颈，同步调用导致雪崩
- 服务治理复杂度高（注册发现、限流熔断、配置中心）
- 分布式调试困难，一个请求跨多个服务，出问题难以定位

### 第八周：RPC 框架设计与 gRPC

#### 8.1 微服务架构概览
- 单体 vs SOA vs 微服务架构演进
- 微服务设计原则：单一职责、自治、去中心化、故障隔离
- **开源实例**：Nameko、FastAPI + gRPC、FastStream、Faust 对比
- Python 微服务生态 vs Go/Java 微服务生态的差异与选型

#### 8.2 RPC 核心原理
- RPC 通信模型：同步调用、异步调用、流式调用
- 序列化协议：JSON、MessagePack、Protobuf、Thrift 对比
- 网络传输：TCP 长连接、HTTP/2 多路复用
- **代码演示**：基于 `socket` + `pickle` 实现简单 RPC 框架

#### 8.3 gRPC 深度解析
- Protocol Buffers 语法与 `protoc` 代码生成
- gRPC 四种通信模式：
  - Unary RPC（一元调用）
  - Server Streaming RPC（服务端流）
  - Client Streaming RPC（客户端流）
  - Bidirectional Streaming RPC（双向流）
- 拦截器（Interceptor）机制：`grpc.ServerInterceptor` / `grpc.ClientInterceptor`
- 流控与背压（Flow Control / Backpressure）
- **代码演示**：gRPC 服务端与客户端实现（含拦截器、超时、重试）

### 第九周：服务治理

#### 9.1 服务注册与发现
- 注册中心选型：Consul、Etcd、Nacos、ZooKeeper 对比
- **Python 实现**：
  - 服务注册：启动时向注册中心写入服务信息（IP、端口、元数据）
  - 心跳保活：定时续约与 TTL 机制
  - 服务发现：客户端缓存 + 监听变更（Watch / Long Polling）
- **代码演示**：基于 `python-consul` / `aioetcd` 实现服务注册发现客户端

#### 9.2 负载均衡
- 客户端负载均衡 vs 服务端负载均衡
- 负载均衡算法：
  - 轮询（Round Robin）、加权轮询（Weighted Round Robin）
  - 随机（Random）、加权随机
  - 最少连接（Least Connections）
  - 一致性哈希（Consistent Hashing）：虚拟节点与环设计
- 健康检查机制：主动探测 vs 被动反馈
- **代码演示**：实现客户端负载均衡器（支持多算法切换）

#### 9.3 熔断、降级与限流
- **熔断器模式**（Circuit Breaker）：
  - 状态机：Closed → Open → Half-Open
  - 滑动窗口统计：计数器 vs 时间窗口
  - **开源实例**：`pybreaker`、`circuitbreaker` 库原理
- **降级策略**：
  - 返回默认值、返回缓存数据、返回降级响应
  - 降级链路设计（主 → 备 → 兜底）
- **限流算法**：
  - 计数器法、滑动窗口法
  - 令牌桶（Token Bucket）：`asyncio` 实现异步令牌桶
  - 漏桶（Leaky Bucket）：平滑流量
- **代码演示**：实现熔断 + 降级 + 限流一体化的服务防护组件

### 第十周：可观测性与 API 网关

#### 10.1 分布式链路追踪
- 链路追踪核心概念：Trace、Span、Baggage、Context Propagation
- OpenTelemetry Python SDK
  - Tracer API、Span 创建与属性、Context 注入与提取
  - 自动 instrumentation（Flask / FastAPI / SQLAlchemy / Redis）
- 采样策略：头部采样、尾部采样、概率采样
- **代码演示**：为微服务框架集成 OpenTelemetry 链路追踪

#### 10.2 指标监控
- Metrics 类型：Counter、Gauge、Histogram、Summary
- `prometheus_client` Python 库
  - 自定义指标定义与注册
  - Histogram 分桶策略
  - `/metrics` endpoint 暴露
- **代码演示**：实现应用指标采集器（QPS、延迟分布、错误率、资源占用）

#### 10.3 结构化日志
- **开源库**：`structlog`、`loguru`、`python-json-logger` 对比与原理
- 结构化日志设计（JSON 格式 + 上下文绑定）
- 日志与链路追踪关联（Trace ID / Span ID 注入日志）
- **代码演示**：实现结构化日志库（支持上下文绑定与 Trace 关联）

#### 10.4 API 网关设计
- 网关核心功能：路由转发、协议转换、认证鉴权、限流熔断、日志监控
- **开源实例**：Kong、APISIX、Traefik 网关原理
- **代码演示**：基于 ASGI 实现轻量级 API 网关（路由、鉴权、限流、日志）

### 模块四实战项目
**项目名称**：微服务框架实现电商订单系统

**项目内容**：
1. 设计并实现 gRPC 服务间通信框架（含拦截器、超时、重试）
2. 实现服务注册与发现（基于 Consul / Etcd）
3. 实现客户端负载均衡（支持多算法）
4. 实现熔断 + 降级 + 限流防护组件
5. 实现分布式链路追踪（OpenTelemetry）+ 指标监控（Prometheus）
6. 实现结构化日志（Trace ID 关联）
7. 基于微服务框架实现电商系统（用户服务、商品服务、订单服务、支付服务）

---

## 模块五：分布式系统与中间件（2周）

### 教学目标
1. 掌握分布式系统核心概念：CAP、BASE、一致性模型
2. 掌握分布式锁设计与实现（Redis / Etcd / ZooKeeper）
3. 掌握分布式任务调度框架设计（Celery 架构原理）
4. 掌握分布式 ID 生成方案（Snowflake / UUID / Leaf）
5. 掌握消息队列（Kafka / RabbitMQ / Redis Stream）在 Python 中的使用
6. 掌握缓存系统设计（本地缓存 + Redis + 多级缓存）

### 学习痛点
- 分布式锁实现总出问题：锁过期、锁释放、网络分区
- Celery 用了很久但不理解 Broker / Worker / Beat 的工作原理
- 消息队列选型困难，Kafka vs RabbitMQ vs Redis Stream 不知道怎么选
- 缓存穿透/击穿/雪崩问题频发，不知道如何系统化防护

### 第十一周：分布式基础与缓存系统

#### 11.1 分布式系统基础
- CAP 定理与权衡：一致性 vs 可用性 vs 分区容错
- BASE 理论：基本可用、软状态、最终一致性
- 一致性模型：强一致性、最终一致性、因果一致性、读己之写
- 分布式问题：脑裂、网络分区、时钟漂移

#### 11.2 分布式锁实现
- **基于 Redis**：
  - `SET key value NX PX` 原子操作
  - 锁续约（Watchdog 机制）：后台线程定时续期
  - Lua 脚本保证释放锁的原子性
  - RedLock 算法：多节点投票与争议分析
- **基于 Etcd**：
  - Lease + TTL 机制
  - 事务（Txn）保证原子性
  - Watch 监听锁释放
- **基于 ZooKeeper**：
  - 临时有序节点 + Watch 机制
  - 羊群效应与优化方案
- **代码演示**：实现通用分布式锁抽象层（支持 Redis / Etcd 双后端）

#### 11.3 缓存系统设计
- **本地缓存实现**：
  - `functools.lru_cache` 源码分析
  - `cachetools` 库：LRU、LFU、TTL Cache 实现
  - 线程安全缓存：`threading.Lock` vs `multiprocessing.Manager`
- **Redis 缓存**：
  - `redis-py` 连接池、Pipeline、事务
  - Lua 脚本执行与原子操作
  - 发布订阅（Pub/Sub）模式
- **多级缓存架构**：
  - L1 本地缓存（进程内）+ L2 Redis 缓存（分布式）
  - 缓存一致性：延时双删、消息队列通知
- **缓存防护**：
  - 缓存穿透：布隆过滤器（`pybloom-live`）、空值缓存
  - 缓存击穿：互斥锁（`threading.Lock` / Redis `SETNX`）、逻辑过期
  - 缓存雪崩：随机过期时间、多级兜底
- **代码演示**：实现多级缓存系统（含防护组件）

### 第十二周：分布式任务调度与消息队列

#### 12.1 Celery 架构深度解析
- **Celery 核心架构**：
  - Broker（消息代理）：RabbitMQ / Redis / Amazon SQS
  - Worker（工作进程）：prefork / eventlet / gevent 并发模型
  - Beat（定时调度）：crontab 表达式与持久化调度
  - Backend（结果存储）：RPC / Redis / Database
- **任务设计**：
  - `@app.task` 装饰器原理与任务注册
  - 任务参数序列化：JSON / Pickle / MessagePack
  - 任务重试机制：`autoretry_for`、`max_retries`、指数退避
  - 任务链：`chain` / `group` / `chord` / `chunks`
- **任务监控**：
  - Flower 监控面板
  - 任务状态追踪与超时处理
  - 死信队列与失败任务重放
- **代码演示**：实现基于 Celery 的异步任务处理系统

#### 12.2 消息队列
- **Kafka 在 Python 中的使用**：
  - `confluent-kafka-python` vs `kafka-python` 对比
  - Producer：分区策略、acks 语义、批次发送
  - Consumer：消费者组、分区分配、offset 管理
  - **代码演示**：Kafka 日志收集系统
- **RabbitMQ 在 Python 中的使用**：
  - `pika` 库：Connection / Channel / Exchange / Queue
  - Exchange 类型：direct、fanout、topic、headers
  - 消息确认机制：auto-ack / manual-ack / nack
  - 死信交换器（DLX）与延时队列
  - **代码演示**：RabbitMQ 订单异步处理系统
- **Redis Stream**：
  - Stream 数据结构与消费组
  - 与 Kafka/RabbitMQ 的差异与适用场景
  - **代码演示**：Redis Stream 实时消息系统

#### 12.3 分布式 ID 生成
- **UUID**：v1（时间+MAC）/ v4（随机）/ v7（时间+随机）对比
- **Snowflake**：
  - 64 位结构：时间戳 + 工作机器 ID + 序列号
  - 时钟回拨问题与解决方案
  - **代码演示**：实现 Snowflake ID 生成器
- **数据库自增 ID**：
  - 步长方案（分库分表场景）
  - 号段模式（Leaf-Segment）
- **代码演示**：实现通用 ID 生成抽象层

### 模块五实战项目
**项目名称**：分布式系统实现秒杀与异步订单

**项目内容**：
1. 实现分布式锁（Redis + Etcd 双后端，含锁续约）
2. 实现多级缓存系统（本地 + Redis，含穿透/击穿/雪崩防护）
3. 基于 Celery 实现异步订单处理（含任务重试、死信队列）
4. 基于 RabbitMQ 实现订单异步创建与库存扣减
5. 基于 Kafka 实现操作日志收集
6. 实现 Snowflake 分布式 ID 生成器
7. 完整实现秒杀系统（限流 → 缓存 → 分布式锁 → 异步下单 → 消息通知）

---

## 模块六：数据管道与 ETL（2周）

### 教学目标
1. 掌握数据管道架构设计原理
2. 掌握 Python 数据处理核心库：pandas、polars、numpy
3. 掌握 ETL 流程设计：抽取、转换、加载
4. 掌握 Airflow 工作流调度框架
5. 掌握数据质量监控与数据血缘追踪
6. 掌握大数据处理框架：Spark（PySpark）基础

### 学习痛点
- 数据处理脚本越写越乱，没有工程化思维
- pandas 处理大数据集时内存溢出，不知道如何优化
- ETL 流程没有调度系统，全靠 crontab 硬编码
- 数据质量问题发现太晚，上线后才发现数据错误

### 第十三周：数据处理与 ETL 工程

#### 13.1 数据处理核心库
- **pandas 进阶**：
  - DataFrame 内部数据结构：BlockManager 与内存布局
  - 索引与对齐机制：Index、MultiIndex、reindex
  - 性能优化：向量化操作、`eval()`、分类类型（Categorical）
  - 大数据处理：分块读取（`chunksize`）、`dask` 延迟计算
- **polars 对比**：
  - Rust 内核 + Python 接口，惰性执行引擎
  - 多线程并行处理 vs pandas 单线程
  - 流式处理（Streaming）解决内存问题
  - **代码演示**：pandas vs polars 性能基准测试
- **numpy 底层**：
  - ndarray 内存布局：C-order vs Fortran-order
  - 广播机制（Broadcasting）原理
  - 向量化运算与 ufunc

#### 13.2 ETL 流程设计
- **抽取（Extract）**：
  - 多数据源接入：MySQL、PostgreSQL、MongoDB、API、CSV/Parquet
  - 增量抽取：基于时间戳、基于 CDC（Change Data Capture）
  - 连接池与批量读取优化
- **转换（Transform）**：
  - 数据清洗：缺失值处理、异常值检测、去重
  - 数据转换：类型转换、标准化、编码（One-Hot / Label）
  - 数据聚合：groupby + agg、窗口函数、滚动统计
  - 数据关联：merge / join 策略与内存优化
- **加载（Load）**：
  - 批量写入：`executemany`、COPY 命令、`LOAD DATA INFILE`
  - 写入优化：事务批量提交、索引延迟创建
  - 幂等加载：UPSERT / MERGE 语义
- **代码演示**：实现通用 ETL 框架（支持多源接入、数据清洗、批量加载）

### 第十四周：工作流调度与数据质量

#### 14.1 Airflow 工作流调度
- **Airflow 核心架构**：
  - Scheduler（调度器）、Executor（执行器）、Worker
  - DAG（有向无环图）定义与 Task 依赖
  - Executor 选型：LocalExecutor / CeleryExecutor / KubernetesExecutor
- **DAG 开发**：
  - `@dag` / `@task` 装饰器 API（TaskFlow API）
  - Operator 类型：BashOperator、PythonOperator、SQLExecuteQueryOperator
  - XCom：Task 间数据传递
  - Sensor：外部条件等待（文件、数据库、API）
- **调度策略**：
  - 调度间隔：cron 表达式 vs timedelta
  - 回填（Backfill）：历史数据重新处理
  - 依赖管理：`trigger_rule`（all_success / one_success / all_done）
- **代码演示**：基于 Airflow 构建数据仓库 ETL 调度系统

#### 14.2 数据质量与监控
- **数据质量框架**：
  - 完整性检查：行数校验、主键唯一性、外键引用完整性
  - 准确性检查：值域校验、业务规则校验、统计分布检查
  - 及时性检查：数据延迟监控、SLA 告警
  - **开源工具**：Great Expectations / Soda / dbt tests
- **数据血缘追踪**：
  - 列级血缘：字段从源到目标的流转路径
  - 表级血缘：表依赖关系图
  - 影响分析：上游变更影响范围评估
- **代码演示**：实现数据质量检查框架（含告警通知）

### 模块六实战项目
**项目名称**：数据管道实现用户行为分析平台

**项目内容**：
1. 设计通用 ETL 框架（支持多源抽取、数据转换、批量加载）
2. 基于 pandas/polars 实现数据清洗与聚合
3. 基于 Airflow 构建 DAG 调度系统（定时执行、依赖管理、失败重试）
4. 实现数据质量检查框架（完整性、准确性、及时性）
5. 实现增量同步（基于 CDC / 时间戳）
6. 构建用户行为分析数据管道（埋点采集 → 清洗 → 聚合 → 入仓）
7. 数据可视化报表（基于 Metabase / Superset）

---

## 模块七：测试与性能优化（1周）

### 教学目标
1. 掌握 Python 测试体系：单元测试、集成测试、E2E 测试
2. 掌握 Mock / Fixture / 参数化测试技术
3. 掌握 Python 性能分析工具：cProfile、pyinstrument、memory_profiler
4. 掌握 CPU 优化、内存优化、IO 优化的实战技巧
5. 掌握 Cython / C 扩展加速方案

### 学习痛点
- 测试覆盖率低，上线频繁出问题，技术债越积越多
- 性能瓶颈难以定位，只知道加缓存，不知道从代码层面优化
- 不了解 Python 性能分析工具，凭感觉调优
- 遇到 CPU 密集型任务只知道换 Go，不知道 Cython / C 扩展

### 第十五周：测试体系与性能优化

#### 15.1 测试体系
- **单元测试**：
  - `pytest` 核心功能：fixture、参数化、mark、conftest.py
  - `unittest` 标准库与 pytest 对比
  - Mock 测试：`unittest.mock`（Mock / MagicMock / patch）、`pytest-mock`
  - 覆盖率：`pytest-cov` + `coverage.py`，分支覆盖 vs 行覆盖
- **集成测试**：
  - 测试数据库：pytest fixtures + 事务回滚隔离
  - 测试 HTTP 接口：`httpx` + ASGI 传输（不需启动真实服务）
  - TestClient（Starlette）/ Client（Django）测试客户端
- **E2E 测试**：
  - Playwright Python 版：浏览器自动化
  - API E2E：`httpx` + 真实服务启动
- **代码演示**：为模块一的 Web 框架编写完整测试套件（覆盖率 > 80%）

#### 15.2 性能分析工具
- **CPU 分析**：
  - `cProfile` / `profile`：标准库性能分析器
  - `pyinstrument`：调用栈采样分析器（低开销）
  - `snakeviz`：cProfile 结果可视化
  - `py-spy`：抽样分析（无需修改代码）
- **内存分析**：
  - `memory_profiler`：逐行内存使用
  - `tracemalloc`：标准库内存追踪
  - `objgraph`：对象引用图与泄漏检测
- **代码演示**：对 Web 框架进行性能分析并生成优化报告

#### 15.3 性能优化实战
- **CPU 优化**：
  - 算法优化：时间复杂度与空间复杂度分析
  - 向量化：用 numpy 替代循环
  - 字典/集合查找：O(1) vs 列表 O(n)
  - `__slots__` 减少属性查找开销
- **内存优化**：
  - 生成器替代列表：`yield` vs `[]`
  - `__slots__` 节省实例内存
  - 对象池与 `weakref`
  - 大文件处理：流式读取 vs 全量加载
  - `gc` 模块：垃圾回收调优
- **IO 优化**：
  - 异步 IO：`asyncio` 替代同步 IO
  - 批量操作：减少网络往返
  - 连接复用：连接池 vs 每次新建
  - 零拷贝：`mmap` 内存映射文件
- **Cython / C 扩展**：
  - Cython 基础：`.pyx` 文件编译与使用
  - 类型声明加速：`cdef` / `cpdef`
  - `ctypes` / `cffi` 调用 C 库
  - **代码演示**：用 Cython 加速纯 Python 计算密集型函数（10x+ 提升）

### 模块七实战项目
**项目名称**：性能优化实战提升 Web 框架吞吐量

**项目内容**：
1. 使用 pytest 编写完整测试套件（单元 + 集成 + E2E）
2. 使用 cProfile / pyinstrument 定位性能瓶颈
3. CPU 优化：向量化、`__slots__`、算法优化
4. 内存优化：生成器、对象池、GC 调优
5. IO 优化：异步化、连接池、批量操作
6. 使用 Cython 加速热点函数
7. 优化前后压测对比（QPS 提升 2-5 倍目标）

---

## 模块八：工程化与 DevOps（1周）

### 教学目标
1. 掌握 Python 项目工程化规范与最佳实践
2. 掌握代码质量工具链：ruff、mypy、pre-commit
3. 掌握 Docker 容器化与 Kubernetes 部署
4. 掌握 CI/CD 流水线设计（GitHub Actions / GitLab CI）
5. 掌握 Python 项目的安全审计与依赖管理

### 学习痛点
- 项目结构混乱，没有统一的工程化标准
- 代码风格不统一，code review 花大量时间在格式问题上
- 部署全靠手动操作，没有自动化流水线
- 依赖管理混乱：requirements.txt / setup.py / pyproject.toml 不知道用哪个

### 第十六周：工程化实践

#### 16.1 项目工程化规范
- **项目结构设计**：
  - src layout vs flat layout
  - 包管理与模块组织
  - `pyproject.toml`（PEP 518 / PEP 621）统一配置
- **依赖管理**：
  - `pip` + `requirements.txt`：基础方案
  - `poetry` / `pdm` / `uv`：现代依赖管理对比
  - 锁文件（lock file）与可复现构建
- **代码规范工具链**：
  - `ruff`：极速 Linter + Formatter（替代 flake8 + black + isort）
  - `mypy`：静态类型检查（Type Hint + 存根文件 stub）
  - `pre-commit`：Git Hook 自动化
  - **代码演示**：构建标准 Python 项目模板（pyproject.toml + ruff + mypy + pre-commit）

#### 16.2 容器化与部署
- **Docker**：
  - Dockerfile 最佳实践：多阶段构建、层缓存优化
  - Python 镜像选型：`python:slim` vs `python:alpine` vs distroless
  - `.dockerignore` 与构建上下文优化
  - **代码演示**：为 Web 框架编写生产级 Dockerfile
- **Kubernetes**：
  - Deployment / Service / Ingress / ConfigMap / Secret
  - 健康检查：liveness probe / readiness probe / startup probe
  - 资源限制：requests / limits / HPA（水平自动伸缩）
  - **代码演示**：编写 Kubernetes 部署清单（含 HPA 自动伸缩）
- **ASGI Server 部署**：
  - Gunicorn + Uvicorn worker：多进程 + 异步
  - worker 类型选型：uvicorn-worker / uvicorn-corn-worker
  - 进程管理：worker 数量、超时、优雅重启

#### 16.3 CI/CD 流水线
- **GitHub Actions**：
  - Workflow / Job / Step 设计
  - 矩阵测试：多 Python 版本 + 多操作系统
  - 缓存优化：pip cache / pre-commit cache
  - 发布流程：PyPI 发布 / Docker 镜像推送 / Kubernetes 部署
- **GitLab CI**：
  - `.gitlab-ci.yml` 配置
  - Runner 选型：Shared Runner vs Specific Runner
  - 环境管理：stages / environments / approvals
- **代码演示**：构建完整 CI/CD 流水线（lint → test → build → deploy）

#### 16.4 安全审计
- **依赖安全扫描**：
  - `safety` / `pip-audit`：已知漏洞扫描
  - `bandit`：Python 代码安全静态分析
  - SCA（软件成分分析）与 SBOM
- **代码安全**：
  - SQL 注入防护：参数化查询
  - XSS / CSRF 防护：模板自动转义、CSRF Token
  - 敏感信息管理：`.env` 文件、Vault、Kubernetes Secret
  - **代码演示**：为项目配置安全扫描流水线

### 模块八实战项目
**项目名称**：工程化实践构建生产级应用

**项目内容**：
1. 设计标准 Python 项目结构（src layout + pyproject.toml）
2. 配置代码质量工具链（ruff + mypy + pre-commit）
3. 编写生产级 Dockerfile（多阶段构建、镜像瘦身）
4. 编写 Kubernetes 部署清单（Deployment + Service + HPA）
5. 搭建 CI/CD 流水线（lint → test → security scan → build → deploy）
6. 配置安全扫描（pip-audit + bandit）
7. 将前七个模块的项目整合为完整的微服务系统并部署

---

## 加餐：热门面试主题（穿插进行）

### 主题一：Python 元编程深度
- 元类（Metaclass）实战：ORM / Django Model 实现原理
- 描述符协议：property / classmethod / staticmethod 本质
- `__init_subclass__` 与插件注册机制
- 装饰器高级用法：带参数装饰器、类装饰器、装饰器类
- **代码演示**：使用元编程实现插件化架构

### 主题二：并发爬虫与数据采集
- `aiohttp` + `asyncio` 异步爬虫
- `httpx` 异步 HTTP 客户端
- 反爬应对：代理池、请求频率控制、User-Agent 轮换
- 数据解析：`lxml` / `parsel` / `BeautifulSoup` 性能对比
- **代码演示**：实现分布式爬虫调度系统

### 主题三：Python 内存模型与垃圾回收
- 对象模型：一切皆对象，`PyObject` 结构
- 引用计数：`sys.getrefcount`、循环引用问题
- 标记-清除（Mark and Sweep）：分代回收
- `__del__` / `weakref` / `finalize` 资源管理
- **代码演示**：内存泄漏排查实战

### 主题四：设计模式在 Python 中的实现
- 创建型：工厂方法、抽象工厂、单例（`__new__` / 元类 / 模块级）
- 结构型：适配器、装饰器、代理、外观
- 行为型：观察者、策略、命令、责任链
- Python 特有模式：猴子补丁（Monkey Patching）、Mixin、协议类（Protocol）
- **代码演示**：用设计模式重构 Web 框架核心模块

---

## 四大实战案例汇总

### 案例一：手写 Web 框架实现用户注册登录
- **关联模块**：模块一
- **核心技能**：WSGI 规范、路由系统、中间件链、Session、模板引擎

### 案例二：异步高并发框架实现实时协作系统
- **关联模块**：模块三
- **核心技能**：ASGI 规范、asyncio、WebSocket、异步 ORM、并发控制

### 案例三：微服务框架实现电商订单系统
- **关联模块**：模块四
- **核心技能**：gRPC、服务治理、熔断降级、链路追踪、API 网关

### 案例四：分布式系统实现秒杀与异步订单
- **关联模块**：模块五
- **核心技能**：分布式锁、多级缓存、Celery 任务调度、消息队列、Snowflake ID

---

## 学习路径建议

### 阶段一：基础夯实（第 1-3 周）
- 完成模块一：Web 框架
- 理解 WSGI/ASGI 原理与 Web 框架设计
- 完成案例一

### 阶段二：数据层能力（第 4-5 周）
- 完成模块二：ORM 框架
- 掌握元编程技术与数据库交互核心原理

### 阶段三：并发能力（第 6-7 周）
- 完成模块三：异步编程与并发
- 掌握 asyncio 事件循环与异步框架设计
- 完成案例二

### 阶段四：分布式架构（第 8-12 周）
- 完成模块四：微服务框架
- 完成模块五：分布式系统与中间件
- 完成案例三、案例四

### 阶段五：数据工程（第 13-14 周）
- 完成模块六：数据管道与 ETL
- 掌握数据处理与工作流调度

### 阶段六：工程化落地（第 15-16 周）
- 完成模块七：测试与性能优化
- 完成模块八：工程化与 DevOps
- 整合所有知识，构建生产级应用

---

## 技术栈全景

### 核心语言与标准库
- Python 3.12+
- `asyncio`、`multiprocessing`、`threading`、`concurrent.futures`
- `collections`、`functools`、`itertools`、`contextlib`
- `typing`、`dataclasses`、`pathlib`

### 主流开源框架
- **Web**：Flask、Django、FastAPI、Starlette、Litestar
- **ORM**：SQLAlchemy、Django ORM、Tortoise ORM、SQLModel
- **异步任务**：Celery、Dramatiq、RQ（Redis Queue）、arq
- **RPC**：gRPC、Nameko、FastAPI
- **消息队列**：Kafka（confluent-kafka-python）、RabbitMQ（pika / aio-pika）
- **数据处理**：pandas、polars、numpy、PySpark
- **工作流调度**：Airflow、Prefect、Dagster

### 基础设施
- **数据库**：PostgreSQL、MySQL
- **缓存**：Redis、Memcached
- **容器**：Docker、Kubernetes
- **监控**：Prometheus、Grafana、OpenTelemetry、ELK / Loki
- **CI/CD**：GitHub Actions、GitLab CI
- **注册中心**：Consul、Etcd

### 开发工具链
- **包管理**：poetry / pdm / uv
- **Lint/Format**：ruff
- **类型检查**：mypy / pyright
- **测试**：pytest、coverage.py、pytest-asyncio
- **性能分析**：pyinstrument、py-spy、memory_profiler
- **安全扫描**：pip-audit、bandit

---

## 面试要点汇总

### 高频面试题
1. **Web 框架**：WSGI vs ASGI 区别、Flask 路由原理、Django 中间件执行顺序、gunicorn worker 选型
2. **ORM**：元类实现 ORM 原理、N+1 查询问题、SQLAlchemy Session 生命周期、连接池参数调优
3. **异步编程**：事件循环原理、GIL 影响、asyncio.gather vs wait、async/await 与多线程混用
4. **微服务**：gRPC 四种通信模式、服务注册发现流程、熔断器状态机、分布式链路追踪原理
5. **分布式系统**：分布式锁实现方案、CAP 权衡、缓存一致性、消息队列选型
6. **数据处理**：pandas 内存优化、ETL 增量同步方案、Airflow DAG 设计
7. **性能优化**：cProfile 使用、内存泄漏排查、Cython 加速、`__slots__` 作用
8. **工程化**：pyproject.toml 配置、Docker 多阶段构建、CI/CD 流水线设计

### 源码阅读清单
- `asyncio` 事件循环实现（`asyncio/base_events.py`）
- `flask` 路由系统（`flask/sansio/app.py` + `werkzeug/routing/`）
- `django` 中间件链（`django/core/handlers/wsgi.py`）
- `SQLAlchemy` Query 编译器（`sqlalchemy/sql/compiler.py`）
- `celery` 任务执行流程（`celery/app/trace.py`）
- `starlette` ASGI 中间件（`starlette/middleware/`）

---

## 附录

### 推荐学习资源
- 《Fluent Python》（流畅的 Python）— Luciano Ramalho
- 《Effective Python》— Brett Slatkin
- 《CPython Internals》— Anthony Shaw
- Python 官方文档与 PEP（Python Enhancement Proposals）
- Real Python 教程（realpython.com）

### 实践项目建议
- 个人博客系统（Web 框架 + ORM + 模板引擎）
- 短链接服务（缓存 + 分布式 ID + 异步任务）
- 即时通讯系统（WebSocket + 消息队列 + 异步框架）
- 微服务电商平台（全栈实践：Web + ORM + 微服务 + 分布式 + 消息队列）
- 数据分析平台（ETL + Airflow + 可视化）

### Go 课程 vs Python 课程对照

| 模块 | Go 实战训练营 | Python 实战训练营 |
|------|-------------|-----------------|
| 一 | Web 框架（Gin/Beego 原理） | Web 框架（Flask/Django 原理 + WSGI/ASGI）|
| 二 | ORM 框架（GORM 原理） | ORM 框架（SQLAlchemy 原理 + 元编程）|
| 三 | 缓存系统（本地 + Redis） | 异步编程与并发（asyncio + ASGI + 多进程/线程）|
| 四 | 微服务框架（gRPC + 服务治理） | 微服务框架（gRPC + 服务治理 + API 网关）|
| 五 | 分布式事务（TCC/Saga） | 分布式系统与中间件（分布式锁 + Celery + 消息队列）|
| 六 | 消息队列（Kafka/RocketMQ） | 数据管道与 ETL（pandas + Airflow + 数据质量）|
| 七 | 日志与监控 | 测试与性能优化（pytest + cProfile + Cython）|
| 八 | 工程化与最佳实践 | 工程化与 DevOps（Docker + K8s + CI/CD）|

 