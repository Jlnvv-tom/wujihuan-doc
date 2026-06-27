# 第7章 异步框架与并发模式

你的FastAPI服务上线了，QPS压测只有200，你百思不得其解。代码里明明用了`async def`，数据库查询也换了异步驱动，怎么性能还是上不去？

你打开监控一看：每个请求平均耗时300毫秒，其中280毫秒在等数据库。看似用了异步，实际上所有请求都在排队等同一个数据库连接。连接池配了5个，第6个请求就乖乖阻塞了。这不叫异步，这叫穿着异步外衣的同步。

更狠的是，你发现有个批量查询接口，逻辑是用`asyncio.gather`同时发10个查询。但数据库连接池只有5个连接，结果5个先跑，5个排队，跟串行没区别。你以为自己在扇出，其实在堵车。

我是怕浪猫，这个Python实战训练营系列已经到了第七周。前六章我们打好了WSGI、路由、中间件、ORM、认证、测试的地基，从这一章开始，我们进入异步世界。这一章的内容量很大：ASGI规范、异步Web框架、异步数据库与缓存、并发模式与流程控制。每一块都是实战中会踩的坑，每一行代码都经过生产环境验证。

## 一、ASGI规范与异步Web框架

### 1.1 ASGI vs WSGI：两种事件模型的根本差异

WSGI的核心是同步调用模型。服务器拿到请求，调用application函数，应用函数处理完返回响应，服务器再把响应发给客户端。整个过程是一根线串下来的，一个请求占用一个线程，线程在等输入输出时就干等着，什么也做不了。

ASGI的核心是异步事件模型。服务器拿到请求后，创建一个协程任务，协程在等待输入输出时不会阻塞线程，而是把控制权交还给事件循环，事件循环去处理其他协程。一个线程可以同时处理成百上千个协程，资源利用率大幅提升。

两者的差异不是快了一点，而是模型层面的根本不同。打个比方，WSGI就像一家餐厅只有一个服务员，客人点完菜后服务员就站在厨房等菜做好，期间没法接待其他客人。ASGI就像服务员点完菜后回到前台，菜好了厨房通知他，他再去端菜。一个服务员可以同时服务很多桌。

| 对比维度 | WSGI | ASGI |
|---------|------|------|
| 调用模型 | 同步阻塞，一请求一线程 | 异步事件循环，一线程多协程 |
| 函数签名 | def app(environ, start_response) | async def app(scope, receive, send) |
| 通信方式 | 单次调用返回响应 | 双向消息流，事件驱动 |
| 协议支持 | 仅HTTP | HTTP、WebSocket、HTTP/2 |
| 生命周期 | 请求级，每次请求新建环境 | 连接级，一个连接可处理多个请求 |
| 背压控制 | 线程池满即拒绝连接 | 协程调度更灵活 |
| 典型服务器 | Gunicorn、uWSGI | Uvicorn、Hypercorn、Daphne |

> 异步不是把同步代码前面加一个async就行，它是思维模型的转变。你不再是在写步骤，而是在编排事件流。

这里有个特别容易踩的坑：很多人以为把Flask代码改成async def视图函数就能异步了。不能。Flask底层是WSGI框架，即使你在视图函数里写了async def，框架仍然在同步线程中调用它，异步操作根本不会被正确调度。要真正用异步，你必须用原生ASGI框架。

从同步到异步，不是改几个关键字的事。你需要把整个技术栈都换成异步版本：Web框架要换、数据库驱动要换、HTTP客户端要换、Redis客户端要换。只要有一个环节是同步的，整个事件循环就会被阻塞。这就像修了一条高速公路，中间有一段是泥土路，整条路的通行速度就被那段泥土路限制了。

很多人在初次尝试异步时都会犯一个错误：在async def函数里调用了同步阻塞的函数。比如用requests库发HTTP请求，或者用open函数读大文件。这些操作会阻塞整个事件循环，所有协程都会被卡住，直到这个操作完成。正确的做法是用异步版本的库，比如用aiohttp代替requests，用aiofiles代替内置的open。如果必须用同步库，就用asyncio.to_thread（Python 3.9+）或run_in_executor把它放到线程池中执行，这样至少不会阻塞事件循环。

但这又引出了另一个问题：线程池的大小是有限的。默认的线程池只有min(32, os.cpu_count() + 4)个线程。如果你在协程中大量使用run_in_executor来执行同步代码，线程池很快就会被耗尽。所以run_in_executor只是过渡方案，不是长久之计。最终还是要用原生异步库。

### 1.2 ASGI Application签名：async def app(scope, receive, send)

ASGI规范的应用签名比WSGI复杂一些。不是一次调用返回结果，而是三个参数组成一个异步通信协议。

```python
async def app(scope, receive, send):
    if scope['type'] == 'http':
        await handle_http(scope, receive, send)
    elif scope['type'] == 'lifespan':
        await handle_lifespan(scope, receive, send)
```

scope是一个字典，包含连接的元信息。对于HTTP请求，它包含type（协议类型）、method（HTTP方法）、path（请求路径）、query_string（查询字符串，bytes类型）、headers（请求头列表，每个元素是bytes元组）等字段。scope在连接创建时生成，整个连接生命周期内不变。

receive是一个异步可调用对象，调用它返回一个事件字典。应用通过receive来接收服务器发来的事件，比如请求体数据。send也是一个异步可调用对象，调用它发送事件给服务器，比如响应头和响应体。

注意一个细节：headers里的key和value都是bytes类型，不是str。第一次写ASGI应用的人十有八九会在这里栽跟头，直接用字符串去匹配会报类型错误。你需要在比较时统一转换为bytes或者统一解码为str。

> WSGI是一次性调用，ASGI是持续对话。从打电话变成了发微信，你可以收一条回一条，也可以收一条回三条。

scope和receive/send的关系可以这样理解：scope告诉你这个连接是什么，receive告诉你对方说了什么，send让你告诉对方什么。三者配合，构成了完整的异步通信模型。

scope字典中还有一个重要的字段：app。这个字段存储了ASGI应用实例本身的引用，通常由框架填充。中间件可以通过这个字段在不同应用层之间共享状态。另外，服务器还会在scope中填充client字段（客户端IP和端口）和server字段（服务端IP和端口），这些信息在日志记录和安全审计中非常有用。如果你需要获取客户端的真实IP（在反向代理后面），需要检查headers中的x-forwarded-for字段，而不是直接用client字段中的IP。

### 1.3 事件类型详解

ASGI规范定义了一组事件类型，每种事件对应通信流程中的一个步骤。理解这些事件类型是写好ASGI应用的基础。

**http.request事件**：服务器发给应用，表示收到HTTP请求。包含body（请求体，bytes类型）和more_body（是否还有后续请求体数据）。当请求体较大时，服务器可能会分多个http.request事件发送。这正是ASGI流式读取请求体的基础。

```python
{
    'type': 'http.request',
    'body': b'{"name": "alice"}',
    'more_body': False,
}
```

**http.response.start事件**：应用发给服务器，表示开始响应。包含status（HTTP状态码，整数）和headers（响应头列表，每个元素是bytes元组）。

```python
{
    'type': 'http.response.start',
    'status': 200,
    'headers': [
        (b'content-type', b'application/json'),
    ],
}
```

**http.response.body事件**：应用发给服务器，包含响应体。more_body为True时表示还有后续响应体数据，服务器会保持连接不关闭。这就是ASGI流式响应的实现原理。

```python
{
    'type': 'http.response.body',
    'body': b'{"code": 0, "data": []}',
    'more_body': False,
}
```

除了HTTP事件，ASGI还定义了WebSocket事件。WebSocket的通信流程比HTTP复杂，因为它是双向持续通信。

websocket.connect事件：客户端发起WebSocket连接时触发。应用可以通过receive等待这个事件，然后决定是否接受连接。如果想拒绝连接，可以发送websocket.close事件。

websocket.accept事件：应用发送给服务器，表示接受WebSocket连接。可以携带subprotocol和headers。

websocket.receive事件：服务器发给应用，表示收到客户端消息。包含text（文本消息）或bytes（二进制消息）字段。

websocket.send事件：应用发给服务器，表示向客户端发送消息。同样包含text或bytes字段。

websocket.close事件：可以由服务器或应用发送，表示关闭连接。包含code（关闭码）和reason（关闭原因）。

WebSocket事件的引入让ASGI比WSGI强大得多。WSGI只能处理HTTP请求，WebSocket需要额外的服务器（如daphne）或中间件来支持。而ASGI原生支持WebSocket，不需要任何额外组件。这也是Django Channels选择ASGI的原因：它需要一个能同时处理HTTP和WebSocket的规范。

我们来写一个完整的ASGI应用，把HTTP事件串起来：

```python
async def app(scope, receive, send):
    body = b''
    more_body = True
    while more_body:
        message = await receive()
        body += message.get('body', b'')
        more_body = message.get('more_body', False)

    await send({
        'type': 'http.response.start',
        'status': 200,
        'headers': [
            (b'content-type', b'text/plain; charset=utf-8'),
        ],
    })

    response_body = f'收到: {body.decode("utf-8")}'.encode('utf-8')
    await send({
        'type': 'http.response.body',
        'body': response_body,
    })
```

这段代码可以直接用Uvicorn跑起来：uvicorn app:app --port 8000。用curl发个请求试试，你会看到服务器正确返回了请求体的回显内容。

踩坑提醒：http.response.start必须在http.response.body之前发送，且只能发送一次。如果你在代码里多次调用send发送http.response.start，ASGI服务器会直接报错。这个错误在中间件链中很常见，多个中间件都试图设置响应头时就会出问题。正确的做法是让最后一个中间件负责发送响应头，其他中间件只修改scope中的数据。

### 1.4 开源实例：Starlette、FastAPI与ASGI Server对比

ASGI生态经过几年发展，形成了清晰的分层架构。底层是ASGI Server负责HTTP协议解析和请求分发，中间是ASGI框架负责路由、中间件、请求响应封装，上层是业务代码。

**Starlette**是ASGI框架的基石。它提供了路由、中间件、请求响应对象、WebSocket支持等基础能力。代码精简，性能极高，适合作为其他框架的基础层。Starlette的核心组件包括Starlette应用类、Request和Response请求响应对象、路由系统（支持Mount挂载子应用）、中间件系统。它的设计哲学是做最少的事，把控制权交给开发者。

**FastAPI**在Starlette之上加了三样东西：Pydantic数据校验、依赖注入系统、自动生成OpenAPI文档。这三样东西让开发效率翻倍，但也带来了性能开销和心智负担。Pydantic的序列化和反序列化在每次请求都会执行，如果你的接口返回大量数据，这部分开销在火焰图中清晰可见。

来看一个对比：

```python
# Starlette版本
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse

async def get_user(request):
    user_id = request.path_params['user_id']
    return JSONResponse({'id': user_id, 'name': 'alice'})

app = Starlette(routes=[Route('/users/{user_id}', get_user)])
```

```python
# FastAPI版本
from fastapi import FastAPI
from pydantic import BaseModel

class UserResponse(BaseModel):
    id: int
    name: str

app = FastAPI()

@app.get('/users/{user_id}', response_model=UserResponse)
async def get_user(user_id: int):
    return {'id': user_id, 'name': 'alice'}
```

FastAPI版本多了类型校验、自动文档、序列化，代码也更简洁。但Starlette版本的原始性能更高，因为没有Pydantic序列化的开销。在压测中，同一个接口Starlette比FastAPI快大约30%到40%，差距主要来自Pydantic的JSON序列化。

> 选框架不是选最强的，是选最合适的。Starlette适合造轮子，FastAPI适合快速交付。如果你的接口大量返回JSON，Pydantic序列化的开销会在火焰图里清晰可见。

ASGI Server层面，三个主流选择各有特点：

| 对比维度 | Uvicorn | Hypercorn | Daphne |
|---------|---------|-----------|--------|
| 开发者 | Encode团队 | pgjones | Django团队 |
| HTTP/2支持 | 需配合h2模块 | 原生支持 | 不支持 |
| WebSocket | 支持 | 支持 | 支持 |
| 多进程 | 内置workers参数 | 内置workers参数 | 需外部管理 |
| TLS/SSL | 内置支持 | 内置支持 | 内置支持 |
| 性能表现 | 极高，httptools加uvloop | 高 | 中等 |
| 适用场景 | FastAPI和Starlette首选 | HTTP/2场景 | Django Channels |
| 生产部署 | Gunicorn加Uvicorn worker | 独立部署 | 独立部署 |

实际踩坑经验：Uvicorn在默认配置下已经很快，但在生产环境中建议用Gunicorn加Uvicorn worker的方式部署。Gunicorn负责进程管理，Uvicorn worker负责异步事件循环。组合方式：gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker。这样既有Gunicorn成熟的进程管理能力（包括优雅重启、worker回收），又有Uvicorn的高性能异步处理。

Hypercorn的优势在于原生HTTP/2支持，如果你的场景需要HTTP/2 Server Push或者多路复用，Hypercorn是更好的选择。但要注意，Hypercorn的内存占用比Uvicorn高15%左右，在资源受限的环境中需要权衡。

说到这里，不得不提一个很多人忽略的配置：Uvicorn的loop参数。默认情况下Uvicorn使用asyncio自带的事件循环，但在Linux上可以切换到uvloop，性能提升非常明显。uvloop是用Cython实现的asyncio事件循环替代品，底层用了libuv，性能是原生asyncio的2到4倍。启用方式很简单：uvicorn app:app --loop uvloop。如果你用Gunicorn加Uvicorn worker，在worker class配置中已经默认启用了uvloop。

但uvloop也有兼容性问题。某些依赖asyncio内部私有API的库在uvloop上可能无法正常工作。比如早期的aiomysql就有一些兼容性问题，虽然新版已经修复了。如果你的项目依赖链比较长，建议在测试环境中充分验证后再在生产环境中启用uvloop。

另一个值得关注的配置是HTTP解析器。Uvicorn默认使用h11解析器（纯Python实现），可以切换到httptools（C实现），性能更高。配置方式：uvicorn app:app --http httptools。httptools加上uvloop，这两个配置加起来能让Uvicorn的吞吐量提升50%以上。

### 1.5 将WSGI框架升级为ASGI异步框架

很多团队的历史项目是Flask或Django写的，全部重写成FastAPI成本太高。有没有办法渐进式迁移？有。ASGI生态提供了两个桥梁：a2wsgi和asgiref。

a2wsgi的工作原理是在ASGI事件循环中运行WSGI应用。它把ASGI的scope转换成WSGI的environ，把WSGI的start_response转换成ASGI的http.response.start事件，把WSGI应用的返回值转换成http.response.body事件。

```python
from a2wsgi import WSGIMiddleware
from flask import Flask
from starlette.routing import Route, Mount
from starlette.applications import Starlette

flask_app = Flask(__name__)

@flask_app.route('/legacy')
def legacy():
    return 'I am old WSGI'

async def new_api(request):
    from starlette.responses import JSONResponse
    return JSONResponse({'msg': 'I am new ASGI'})

app = Starlette(routes=[
    Mount('/api', routes=[Route('/new', new_api)]),
    Mount('/', app=WSGIMiddleware(flask_app)),
])
```

这样，/api/new走ASGI异步处理，其他所有路径走Flask同步处理。新功能用异步写，老功能保持不变，渐进迁移。这个方案的最大优势是风险可控，你不需要一次性重写所有代码，可以一个模块一个模块地迁移。

但有个重要的坑：WSGI应用被包装后，仍然在同步线程中执行。a2wsgi会用一个线程池来运行WSGI应用，默认线程池大小有限。如果WSGI应用处理很慢，会耗尽线程池，影响ASGI协程的调度。解决方案是合理设置线程池大小，并监控线程池的使用率。

> 渐进迁移的关键不是技术方案，是边界划分。哪些路由走新系统，哪些走老系统，边界一旦模糊，技术债就会像滚雪球一样越滚越大。

Django的迁移路径稍有不同。Django 3.0开始内置ASGI支持，通过asgiref的WsgiToAsgi适配器实现。但Django的ORM在3.x版本中仍然是同步的，直到Django 4.1才支持异步ORM。所以即使你用ASGI跑Django，如果ORM查询没改成异步，实际上还是同步阻塞。Django的异步迁移是一个长期过程，不是改个配置就能完成的。

迁移过程中有一个非常重要的原则：不要混用同步和异步数据库操作。在同一个请求处理流程中，如果你先用了同步的数据库查询，再切换到异步的数据库查询，会出现意想不到的问题。原因是Django的ORM在同步和异步模式下使用不同的连接管理机制，混用会导致连接泄漏或事务状态混乱。如果你决定迁移，就一个模块一个模块地完整迁移，不要在同一个模块中混用两种模式。

对于Flask项目，迁移的优先级可以这样排：先把I/O密集型的接口（如调用外部API、发送邮件、处理大文件）迁移到异步框架，这些接口能从异步中获得最大的性能提升。CPU密集型的接口可以最后迁移，因为异步对CPU密集型场景帮助不大。纯数据库CRUD接口根据连接池情况决定，如果连接池是瓶颈，迁移到异步能缓解；如果不是瓶颈，迁移的收益不大。

## 二、异步数据库与缓存

### 2.1 异步数据库驱动：asyncpg、asyncmy与SQLAlchemy 2.0 AsyncSession

异步Web框架只是第一步。如果你的数据库操作仍然是同步的，协程会在数据库查询时阻塞整个事件循环，异步就白做了。异步数据库驱动是异步架构的关键一环。

| 对比维度 | asyncpg | asyncmy和aiomysql | SQLAlchemy 2.0 Async |
|---------|---------|------------------|---------------------|
| 数据库 | PostgreSQL | MySQL | 多数据库通过驱动适配 |
| 协议 | 二进制协议 | MySQL协议 | 依赖底层驱动 |
| 连接池 | 内置 | 需要额外配置 | 内置适配池 |
| 性能 | 极高，二进制协议 | 中等 | 有一层抽象开销 |
| 参数风格 | 美元符号占位符 | 百分号占位符 | 依赖底层驱动 |
| 预编译语句 | 原生支持 | 客户端模拟 | 通过核心层支持 |
| 学习成本 | 中等 | 低 | 高，需理解Core |
| 适用场景 | 纯PostgreSQL项目 | MySQL项目 | 需多数据库或已有SQLAlchemy代码 |

asyncpg是我用过的性能最高的Python数据库驱动，没有之一。它直接使用PostgreSQL的二进制协议，跳过了libpq C库，性能比psycopg2快3到5倍。它不需要安装任何系统级依赖，纯Python安装就能用，这在容器化部署中是一个不小的优势。

```python
import asyncpg
import asyncio

async def main():
    conn = await asyncpg.connect(
        host='localhost', port=5432,
        user='postgres', password='secret',
        database='myapp',
    )
    row = await conn.fetchrow(
        'SELECT id, name FROM users WHERE id = $1', 42
    )
    print(row['name'])
    await conn.executemany(
        'INSERT INTO logs(level, msg) VALUES ($1, $2)',
        [('INFO', 'msg1'), ('ERROR', 'msg2')],
    )
    await conn.close()

asyncio.run(main())
```

踩坑提醒：asyncpg的参数占位符是美元符号加序号的风格，比如美元1、美元2，不是百分号s，也不是问号。从psycopg2迁移过来的代码必须改参数风格，否则会报语法错误。另外，asyncpg不支持ORM，所有SQL都需要手写。如果你的项目SQL复杂度不高，asyncpg是最佳选择；如果SQL很多很复杂，建议用SQLAlchemy 2.0的AsyncSession。

asyncpg还有一个不太直观的坑：它默认不会自动归还连接到连接池。如果你用了asyncpg.create_pool创建连接池，必须用async with pool.acquire()来获取连接，确保连接在用完后自动归还。如果直接用await pool.acquire()获取连接，就必须手动调用await pool.release(conn)归还。忘记归还连接会导致连接泄漏，连接池被耗尽后所有请求都会阻塞。这种bug在开发阶段不容易发现，因为开发环境流量小，连接池不会满。但上了生产环境，流量一大，连接池耗尽，服务直接挂掉。

还有一个关于类型转换的坑。asyncpg默认会根据SQL中的列类型自动做Python类型转换，但有些类型的转换可能不符合预期。比如PostgreSQL的JSONB类型会被asyncpg自动解析为Python的dict或list，这通常是你想要的。但PostgreSQL的UUID类型默认会被解析为uuid.UUID对象，如果你直接用str()转换后传给前端，格式是对的。但如果你试图用UUID对象作为dict的key，然后序列化为JSON，就会报错。解决方式是在查询时用SQL层面的类型转换，或者在Python层面显式处理。

asyncmy是aiomysql的fork，修复了aiomysql长期不维护的问题，性能也有提升。MySQL用户推荐用asyncmy。它的接口和aiomysql基本兼容，迁移成本很低。

```python
import asyncio
import asyncmy

async def main():
    conn = await asyncmy.connect(
        host='127.0.0.1', port=3306,
        user='root', password='secret', db='myapp',
    )
    cur = await conn.cursor()
    await cur.execute(
        'SELECT id, name FROM users WHERE id = %s', (42,)
    )
    row = await cur.fetchone()
    print(row)
    await cur.close()
    conn.close()

asyncio.run(main())
```

SQLAlchemy 2.0引入了原生的异步支持，AsyncSession是其核心。它不是自己实现数据库驱动，而是包装asyncpg、asyncmy等异步驱动，提供统一的ORM接口。这意味着你可以用同一套ORM代码操作不同的数据库，只需要改连接字符串中的驱动部分。

```python
from sqlalchemy.ext.asyncio import (
    create_async_engine, AsyncSession, async_sessionmaker
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()

engine = create_async_engine(
    'postgresql+asyncpg://postgres:secret@localhost/myapp',
    pool_size=10, max_overflow=20,
)
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_user(user_id: int):
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        return user
```

> 异步ORM的坑不在于写法，而在于心智模型。你必须时刻记住：每个await都是一个潜在的让出点，两个await之间对象的状态可能已经变了。

SQLAlchemy AsyncSession最大的坑是expire_on_commit。默认情况下，commit后所有已加载的对象属性都会被expire，下次访问时触发懒加载。但在异步模式下，懒加载会抛出MissingGreenlet异常，因为懒加载是同步操作，不能在异步上下文中执行。解决方案是设置expire_on_commit等于False，在commit前显式刷新需要的属性。这个配置看起来简单，但多少人在这上面栽了跟头，生产环境突然报MissingGreenlet，排查半天才发现是commit后访问了对象属性。

### 2.2 异步连接池设计

异步数据库驱动解决了查询不阻塞线程的问题，但光有驱动不够。如果每个请求都新建一个数据库连接，TCP握手加认证加SSL协商的开销会吃掉大量时间。在高并发场景下，连接建立本身就会成为瓶颈。你需要连接池。

我们来手写一个基于asyncio.Queue的连接池，理解连接池的核心逻辑：

```python
import asyncio
import time
import asyncpg

class AsyncConnectionPool:
    def __init__(self, dsn, min_size=5, max_size=20,
                 max_idle=300, check_interval=60):
        self.dsn = dsn
        self.min_size = min_size
        self.max_size = max_size
        self.max_idle = max_idle
        self.check_interval = check_interval
        self._pool = asyncio.Queue(maxsize=max_size)
        self._size = 0
        self._lock = asyncio.Lock()

    async def _create_conn(self):
        conn = await asyncpg.connect(self.dsn)
        conn._created_at = time.monotonic()
        self._size += 1
        return conn

    async def acquire(self, timeout=10):
        if not self._pool.empty():
            conn = self._pool.get_nowait()
            if self._is_expired(conn):
                await conn.close()
                self._size -= 1
                return await self.acquire(timeout)
            return conn
        if self._size < self.max_size:
            return await self._create_conn()
        return await asyncio.wait_for(
            self._pool.get(), timeout=timeout
        )

    def _is_expired(self, conn):
        elapsed = time.monotonic() - conn._created_at
        return elapsed > self.max_idle

    async def release(self, conn):
        conn._created_at = time.monotonic()
        await self._pool.put(conn)

    async def close_all(self):
        while not self._pool.empty():
            conn = self._pool.get_nowait()
            await conn.close()
            self._size -= 1
```

这个连接池实现了三个关键策略：连接复用，空闲连接放回Queue供下次使用；连接超时，通过asyncio.wait_for设置获取超时，防止无限等待；空闲回收，_is_expired检查连接存活时间，超时则销毁重建。

还有一个容易被忽略的策略：健康检查。数据库连接长时间空闲后可能被服务端断开。MySQL的wait_timeout默认8小时，PostgreSQL的tcp_keepalives_idle默认两小时。如果不做健康检查，应用拿到一个已经断开的连接，执行查询就会报连接被重置的错误。这个问题在周末流量低峰后特别容易复现：周一早上第一批请求全部失败，因为连接池里的连接都被服务端断开了。

健康检查的两种实现方式：

方式一，心跳查询。每次从池中取出连接时执行一个简单查询，比如SELECT 1，验证连接是否有效。简单粗暴，但每次获取连接多一次查询开销。对于连接频繁获取释放的场景，这个开销会累积。

方式二，定时巡检。后台协程定期检查池中所有空闲连接。更优雅，但实现更复杂：

```python
async def _health_check_loop(self):
    while True:
        await asyncio.sleep(self.check_interval)
        async with self._lock:
            checked = 0
            total = self._pool.qsize()
            while checked < total:
                conn = await self._pool.get()
                try:
                    await conn.execute('SELECT 1')
                    await self._pool.put(conn)
                except Exception:
                    await conn.close()
                    self._size -= 1
                checked += 1
```

定时巡检的好处是不影响正常的连接获取路径，缺点是增加了后台协程的复杂度。在实际生产中，我推荐两种方式结合使用：定时巡检做兜底，心跳查询做保险。这样即使巡检漏掉了某个坏连接，心跳查询也能在取出来时拦住它。

关于连接池大小的配置，很多人有一个误区：认为越大越好。实际上连接池过大会导致数据库服务器压力增大。每个数据库连接在服务端都会占用内存（PostgreSQL每个连接约10MB，MySQL约256KB到几MB不等），100个连接就是1GB以上的内存开销。而且数据库服务器同时处理太多连接会导致上下文切换开销增大，反而降低性能。

合理的连接池大小取决于多个因素：数据库服务器的配置（CPU核心数、内存大小、磁盘性能）、应用的查询模式（简单查询还是复杂查询、读写比例）、并发量的大小。一个实用的经验法则是：连接池大小约等于数据库CPU核心数的2到3倍。比如你的PostgreSQL服务器有8个CPU核心，连接池设为16到24就比较合理。这个数字看起来不大，但在异步场景下，因为协程切换几乎没有开销，16个连接就能处理很高的并发了。

> 连接池不是配个数字就完事的。它是一个有生命周期的资源管理系统，需要创建、复用、检查、回收、销毁，每一步都有坑。

### 2.3 异步Redis：Pipeline与Pub/Sub

Redis在Web应用中几乎是标配缓存。redis-py从4.2版本开始内置异步支持，不需要再装aioredis了。很多老教程还在教aioredis的用法，但那个库已经被合并到redis-py中了，直接用redis.asyncio就行。

基本使用：

```python
import redis.asyncio as redis

r = redis.Redis(
    host='localhost', port=6379,
    decode_responses=True, max_connections=20,
)

async def cache_example():
    await r.set('user:1:name', 'alice', ex=3600)
    name = await r.get('user:1:name')
    
    await r.hset('user:1', mapping={
        'name': 'alice', 'age': 30, 'city': 'shanghai'
    })
    user = await r.hgetall('user:1')
```

Pipeline是Redis性能优化的利器。它把多个命令打包成一个批量发送，减少网络往返。在异步模式下，Pipeline的使用方式稍有不同：你先创建pipeline对象，往里面塞命令，这些命令不会立即执行，最后调用execute一次性发送所有命令。

```python
async def pipeline_example():
    pipe = r.pipeline()
    pipe.set('counter', 0)
    pipe.incr('counter')
    pipe.incr('counter')
    pipe.get('counter')
    results = await pipe.execute()
    print(results)  # [True, 1, 2, '2']
```

踩坑提醒：Pipeline里的命令是按顺序执行的，但不要在Pipeline中放有依赖关系的命令。比如你先SET key value，再GET key，期望GET能拿到SET的值。在Pipeline中这确实能工作，因为Redis是单线程顺序执行。但如果你用了Redis集群模式，key可能被分到不同的slot，Pipeline就不再保证顺序了。

Pipeline的另一个常见误用是把大量命令塞进一个Pipeline。如果Pipeline里有上万个命令，Redis在执行期间会阻塞其他客户端的请求。建议每个Pipeline控制在100到500个命令，太多就分批。

Pub/Sub是Redis的消息广播机制。异步模式下的Pub/Sub非常适合做实时通知、WebSocket消息推送等场景：

```python
import asyncio
import redis.asyncio as redis

async def publisher():
    r = redis.Redis(host='localhost', port=6379)
    for i in range(10):
        await r.publish('chat:room1', f'message {i}')
        await asyncio.sleep(1)
    await r.close()

async def subscriber():
    r = redis.Redis(host='localhost', port=6379)
    pubsub = r.pubsub()
    await pubsub.subscribe('chat:room1')
    async for message in pubsub.listen():
        if message['type'] == 'message':
            print(f"收到: {message['data']}")
            if message['data'] == b'message 9':
                break
    await pubsub.unsubscribe('chat:room1')
    await r.close()
```

踩坑提醒：Pub/Sub的消息是即发即弃的。如果订阅者在发布者发消息时还没连上，消息就丢了。如果你的场景需要消息可靠性，用Redis Streams代替Pub/Sub。Streams支持消费者组、消息确认、消息回溯，更适合做可靠的消息队列。另外，Pub/Sub的订阅者会独占一个连接，不能用同一个连接做其他Redis操作，否则会收到混乱的消息。

异步Redis还有一个容易忽略的配置：decode_responses。默认情况下redis-py返回的数据都是bytes类型，你需要在代码中手动decode。如果设置decode_responses等于True，返回的数据会自动解码为str。这个配置看起来无关紧要，但在大型项目中影响很大。如果你的缓存值是数字，bytes和str的处理方式完全不同。bytes需要先decode再转int，str可以直接转。建议在项目初期就统一设置decode_responses等于True，避免后期大规模改代码。

还有一个关于连接池的坑。redis-py的异步版本默认使用BlockingConnectionPool，这个连接池在连接耗尽时会阻塞等待。但在异步上下文中，阻塞等待会卡住事件循环。解决方案是显式使用ConnectionPool而不是BlockingConnectionPool，或者设置max_connections为一个合理的值，让超出的请求直接报错而不是阻塞。宁可快速失败，也不要悄悄阻塞。

> Pipeline解决的是批量减少网络往返的问题，Pub/Sub解决的是一对多消息广播的问题。搞清楚你要解决什么问题，再选工具。

## 三、并发模式与流程控制

### 3.1 生产者-消费者模式与背压控制

生产者-消费者模式是最经典的并发模式。一个或多个生产者把数据放入队列，一个或多个消费者从队列取出数据处理。在异步编程中，这个模式用asyncio.Queue实现。

```python
import asyncio

async def producer(queue, producer_id):
    for i in range(10):
        item = f'P{producer_id}-item{i}'
        await queue.put(item)
        print(f'生产: {item}')
        await asyncio.sleep(0.1)
    await queue.put(None)

async def consumer(queue, consumer_id):
    while True:
        item = await queue.get()
        if item is None:
            await queue.put(None)
            break
        print(f'消费C{consumer_id}: {item}')
        await asyncio.sleep(0.3)
        queue.task_done()

async def main():
    queue = asyncio.Queue(maxsize=5)
    producers = [producer(queue, i) for i in range(2)]
    consumers = [consumer(queue, i) for i in range(3)]
    await asyncio.gather(*producers, *consumers)

asyncio.run(main())
```

这里有一个关键设计：asyncio.Queue设置了maxsize等于5，这是队列最大容量。当队列满时，put会挂起协程，直到有消费者取走数据。这就是背压控制。

背压控制的重要性怎么强调都不为过。想象一个场景：你的爬虫从网上抓数据，数据处理模块做清洗和分析。如果生产者速度远快于消费者，而队列没有大小限制，内存会不断增长，最终内存溢出。这种情况在生产环境中并不罕见，尤其是在数据量大的爬虫和ETL任务中。

> 没有背压的生产者消费者就像没有泄洪阀的水坝，水来得快走得慢，迟早溃坝。

asyncio.Queue提供了几个关键方法来支持背压控制。put方法在队列满时挂起，直到有空位。put_nowait方法在队列满时抛出QueueFull异常，不等待。get方法在队列空时挂起，直到有数据。get_nowait方法在队列空时抛出QueueEmpty异常。join方法阻塞直到所有item都被task_done。task_done方法在消费者处理完一个item后调用。

实际踩坑：多个消费者需要退出时，哨兵值的数量必须等于消费者数量。上面的代码只放了一个None，但有3个消费者。解决方式是消费者收到哨兵后放回队列，让其他消费者也能收到。但这种方式有个隐患：如果某个消费者在收到哨兵前就崩了，哨兵会一直留在队列里。更稳妥的方式是用一个Event来通知所有消费者退出：

```python
async def consumer(queue, consumer_id, stop_event):
    while not stop_event.is_set():
        try:
            item = await asyncio.wait_for(
                queue.get(), timeout=1.0
            )
        except asyncio.TimeoutError:
            continue
        try:
            await process_item(item)
        finally:
            queue.task_done()
```

这种方式的好处是：即使某个消费者崩溃，其他消费者也能通过Event正常退出。坏处是引入了1秒的轮询间隔，在极端低延迟场景下可能不合适。

生产者消费者模式在生产环境中的一个典型应用是日志处理。你的Web服务每秒产生上千条日志，日志需要写入Elasticsearch。如果每条日志同步写入，会严重影响请求响应时间。用生产者消费者模式：Web服务把日志丢到一个Queue，后台消费者协程批量从Queue取日志，每100条或每1秒批量写入一次Elasticsearch。这样日志写入对请求的影响降到了最低：只是往Queue里put一个元素，纳秒级别。

但这个方案有一个要注意的点：当服务关闭时，Queue里可能还有未处理的日志。如果不做处理，这些日志就丢了。解决方案是在关闭流程中等待Queue清空：

```python
async def graceful_shutdown(queue, consumers):
    # 等待队列清空
    await queue.join()
    # 发送停止信号
    for _ in consumers:
        await queue.put(None)
    await asyncio.gather(*consumers)
```

queue.join()会阻塞直到所有item都被task_done。确保所有日志都被消费者处理完了，再发送停止信号。这样即使服务突然重启，也不会丢日志。

### 3.2 限并发：Semaphore与有界队列

有时候你需要控制同时执行的任务数量。比如你的数据库连接池只有10个连接，但你有1000个协程要同时查询数据库。如果不限并发，1000个协程同时去抢10个连接，大量协程在等锁，这是在浪费资源。这时候asyncio.Semaphore就派上用场了。

asyncio.Semaphore是一个计数器信号量。它的内部维护一个计数器，每次acquire减一，每次release加一。当计数器为0时，后续的acquire会阻塞。它就像商场的试衣间，只有5间，进去一个减一间，出来一个加一间，满了就在外面排队等。

```python
import asyncio

async def bounded_query(sem, query_id):
    async with sem:
        print(f'查询{query_id}开始')
        await asyncio.sleep(0.5)
        print(f'查询{query_id}完成')
        return f'result_{query_id}'

async def main():
    sem = asyncio.Semaphore(5)
    tasks = [bounded_query(sem, i) for i in range(20)]
    results = await asyncio.gather(*tasks)
    print(f'完成 {len(results)} 个查询')

asyncio.run(main())
```

输出会显示：先并发5个，等其中一个完成，下一个立即补上，始终保持最多5个并发。这就是限流的核心机制。在实际项目中，这个模式非常实用：控制数据库查询并发、控制外部API调用并发、控制文件IO并发，都能用Semaphore。

> Semaphore控制的是同时有多少个协程在运行，Queue控制的是队列里堆积多少个未处理的任务。两者配合使用，才是完整的流量控制方案。

有界队列在异步场景中的设计需要特别注意。普通的asyncio.Queue设置maxsize后在队列满时会阻塞put操作。但如果我们同时用了Semaphore和Queue，两者都需要控制，容易产生混乱。什么时候用Semaphore，什么时候用Queue，什么时候两者都用，这是新手最容易搞混的地方。

推荐的设计是：用Semaphore控制并发数，用无界Queue或较大的Queue作为缓冲区，让Semaphore来承担限流职责。这样职责分离，不会互相干扰：

```python
async def worker(task_queue, sem, worker_id):
    while True:
        task = await task_queue.get()
        if task is None:
            task_queue.task_done()
            break
        async with sem:
            result = await process(task)
            print(f'Worker{worker_id}: {result}')
        task_queue.task_done()

async def main():
    sem = asyncio.Semaphore(10)
    queue = asyncio.Queue()
    workers = [asyncio.create_task(
        worker(queue, sem, i)
    ) for i in range(5)]
    
    for item in range(100):
        await queue.put(item)
    
    for _ in workers:
        await queue.put(None)
    
    await asyncio.gather(*workers)
```

### 3.3 扇出扇入：gather与TaskGroup

扇出是指一个任务启动多个并行子任务。扇入是指多个并行子任务的结果汇聚到一起。这是异步编程中最常用的模式之一。比如你要查10个用户的信息，可以扇出10个协程同时查询，然后扇入收集所有结果。比起串行查询，速度能快10倍。

Python 3.7引入的asyncio.gather是最基础的扇出扇入工具：

```python
async def fetch(url):
    await asyncio.sleep(0.1)
    return f'fetched: {url}'

async def main():
    urls = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com']
    results = await asyncio.gather(
        *[fetch(url) for url in urls]
    )
    for r in results:
        print(r)
```

gather按参数顺序返回结果。如果某个协程抛出异常，gather默认会取消其他协程，并传播异常。这意味着如果5个协程中有1个失败了，另外4个的结果也拿不到。这在某些场景下是合理的（比如所有任务必须全部成功才有意义），但在另一些场景下就不合适（比如你只是想尽量多地获取结果，失败的就跳过）。

Python 3.11引入了TaskGroup，它是一个更安全的上下文管理器：

```python
async def fetch(url):
    await asyncio.sleep(0.1)
    return f'fetched: {url}'

async def main():
    async with asyncio.TaskGroup() as tg:
        tasks = []
        for url in ['a.com', 'b.com', 'c.com']:
            task = tg.create_task(fetch(url))
            tasks.append(task)
    for task in tasks:
        print(task.result())
```

TaskGroup的优势在于：任何子任务抛出的异常都会自动取消其他子任务，不需要手动处理。上例中，如果某个fetch抛出异常，TaskGroup会自动取消其余任务，保证资源不泄漏。这比gather的异常处理更安全，因为你不需要自己写try/except来确保取消逻辑。

> gather是全做全不做，TaskGroup是有做有不做，但有一个失败全部失败。选哪个取决于你的业务逻辑是否允许部分成功。

两者的使用场景区分：用gather的场景是所有任务都是独立的，一个失败不影响其他，或者你需要捕获所有异常分别处理。用TaskGroup的场景是任务之间有依赖，或者你需要上下文管理器带来的自动清理保证。在实际项目中，如果你用的是Python 3.11+，建议优先用TaskGroup，它更安全也更符合直觉。

这里分享一个实际项目中的踩坑案例。我们有一个数据同步服务，需要从5个外部API拉取数据，然后合并写入数据库。最初用gather并行拉取，return_exceptions等于True，失败的记录错误日志。上线后发现一个问题：某个API偶尔会超时，但因为我们设了return_exceptions等于True，超时被当作普通异常吞掉了，数据同步静默失败，业务方找不到数据。

解决方案是分两步走。第一步用gather加return_exceptions拉取所有数据，第二步检查结果列表，如果有失败的就触发告警并决定是否重试。这样既保证了部分成功的数据能被处理，又确保了失败不会被悄悄忽略。关键是要有后续的检查和告警逻辑，而不是设了return_exceptions就万事大吉。

另一个值得注意的点是：gather和TaskGroup都不会限制并发数。如果你gather了1000个协程，它们会同时启动。对于网络请求来说，1000个并发可能会打爆下游服务。解决方案是用Semaphore配合gather使用：

```python
async def safe_fetch(sem, url):
    async with sem:
        return await fetch(url)

async def main():
    sem = asyncio.Semaphore(20)
    results = await asyncio.gather(
        *[safe_fetch(sem, url) for url in urls]
    )
```

这样最多同时20个请求在飞，既利用了并发的优势，又不会打爆下游服务。这种Semaphore加gather的组合是实际项目中最常用的并发模式之一。

### 3.4 超时与取消：wait_for、timeout与Task.cancel

超时控制是最常用的异步流程控制手段。网络请求、数据库查询、外部API调用，都需要设置超时，防止无限等待。没有超时的异步代码就像没有刹车的汽车，跑起来很爽，但出事就是大事。

方式一，asyncio.wait_for，适用于Python 3.11之前：

```python
async def slow_task():
    await asyncio.sleep(10)
    return 'done'

async def main():
    try:
        result = await asyncio.wait_for(slow_task(), timeout=3.0)
        print(result)
    except asyncio.TimeoutError:
        print('超时了')
```

当超时触发时，wait_for会取消底层协程，并抛出TimeoutError。这个行为是确定的：超时就是超时，没有歧义。

方式二，asyncio.timeout，Python 3.11引入的新接口：

```python
async def main():
    try:
        async with asyncio.timeout(3.0):
            result = await slow_task()
            print(result)
    except asyncio.TimeoutError:
        print('超时了')
```

asyncio.timeout的语义更清晰：它是一个上下文管理器，在上下文内的任何await都可能被超时打断。如果你在超时上下文中有多层嵌套的await，超时触发后会取消最内层的await。相比之下，wait_for的取消行为是向外传播的。

任务取消机制是异步编程中另一个需要深入理解的概念。取消一个协程通过Task.cancel方法实现：

```python
async def long_running_task():
    for i in range(100):
        print(f'Step {i}')
        await asyncio.sleep(1)
    return 'finished'

async def main():
    task = asyncio.create_task(long_running_task())
    await asyncio.sleep(3)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print('任务被取消了')
```

关键点：Task.cancel只是发出取消请求，并不保证任务立即停止。任务是否响应取消，取决于它在await点是否检查协程是否被取消。这叫做协作式取消，和操作系统的强制杀进程不同。

> cancel是请求取消，不是强制杀死。协程在下一个await点检查到取消信号后，才会真正退出。这是asyncio协程协作式多任务的核心设计：没有人能被强制打断，只能主动让出。

一个特别容易踩的坑：在except Exception中意外捕获了CancelledError。在Python 3.8之前，CancelledError继承自Exception，所以except Exception会捕获它。从Python 3.8开始，CancelledError改为继承自BaseException，except Exception不会捕获它。但如果你写了except BaseException或者裸except，仍然会捕获CancelledError，导致任务无法被正确取消。解决方案：永远不要捕获BaseException，如果必须捕获，记得重新抛出CancelledError。

超时控制还有一个高级用法：组合超时。比如你想对一批请求设置总超时30秒，同时每个请求单独超时5秒。这种组合超时在批量爬取场景中很常见：总时间不能太长，但单个请求也不能无限等。实现方式是嵌套使用timeout上下文管理器：

```python
async def fetch_with_timeout(session, url):
    async with asyncio.timeout(5.0):
        resp = await session.get(url)
        return await resp.text()

async def batch_fetch(urls):
    async with asyncio.timeout(30.0):
        return await asyncio.gather(
            *[fetch_with_timeout(session, url) for url in urls],
            return_exceptions=True
        )
```

这样每个请求最多5秒，整批最多30秒。如果某个请求超时了，它会被取消，但不影响其他请求。如果总超时触发了，所有未完成的请求都会被取消。这种组合超时模式在生产环境中非常实用，能有效防止雪崩效应。

说到雪崩效应，这是分布式系统中最怕的问题之一。一个下游服务变慢，导致你的请求排队等待，连接池被耗尽，你的服务也变慢，依赖你的服务也跟着变慢，最终整个链路崩溃。超时控制是防雪崩的第一道防线，断路器是第二道。如果你的服务依赖了多个下游服务，每个下游调用都必须有超时，而且超时值要根据下游服务的SLA来设置，不能一刀切。

### 3.5 异常处理：gather的return_exceptions与异常传播

asyncio.gather默认行为是：任何一个协程抛出异常，其他协程都会被取消，异常会传播给调用者。如果你想让所有协程都跑完，无论成功还是失败，用return_exceptions等于True：

```python
async def may_fail(n):
    if n % 3 == 0:
        raise ValueError(f'{n} 不吉利')
    return f'{n} OK'

async def main():
    results = await asyncio.gather(
        *[may_fail(i) for i in range(1, 7)],
        return_exceptions=True,
    )
    for i, r in enumerate(results, 1):
        if isinstance(r, Exception):
            print(f'{i}: 失败 - {r}')
        else:
            print(f'{i}: 成功 - {r}')
```

输出会显示1到6的结果，其中3和6失败，其他成功。return_exceptions等于True把异常变成了返回值，让你可以统一处理。但在用它之前，一定要问自己：某个任务失败了，剩下任务的结果还有意义吗？如果没意义，就不应该用return_exceptions，而应该让异常传播，尽早失败。

> return_exceptions=True是gather的容错模式。它把异常变成返回值，让你可以统一处理。但容错不等于正确，有些场景下部分成功比全部失败更危险。

异常传播的坑：gather默认行为下，异常会在所有协程都结束后才传播。在这段时间里，其他协程仍在运行。如果你的协程有副作用（如写数据库、发消息），这可能会导致状态不一致。比如一个转账操作，A扣款和B加款是两个并行任务，如果A成功B失败，A的扣款就成了无法回滚的副作用。这种场景下应该用TaskGroup，让一个失败自动取消其他。

### 3.6 异步上下文管理器：async with

async with是异步版本的上下文管理器。它定义了__aenter__和__aexit__两个异步方法。它的作用和同步的with一样：确保资源在使用后被正确释放，即使在发生异常的情况下。

```python
class AsyncDatabase:
    def __init__(self, dsn):
        self.dsn = dsn

    async def __aenter__(self):
        self.conn = await asyncpg.connect(self.dsn)
        return self.conn

    async def __aexit__(self, exc_type, exc, tb):
        await self.conn.close()

async def main():
    async with AsyncDatabase('postgresql://...') as conn:
        await conn.execute('SELECT 1')
```

__aexit__的返回值有特殊含义：返回True会抑制异常，返回False或None会让异常继续传播。这个机制在实现重试逻辑时很有用，但日常开发中不建议在__aexit__中抑制异常，因为这会让bug被隐藏。

实际开发中，async with最常见的使用场景是管理数据库事务和HTTP客户端会话：

```python
async def transfer_money(session, from_id, to_id, amount):
    async with session.begin():  # 自动提交或回滚
        await session.execute(
            "UPDATE accounts SET balance = balance - %s WHERE id = %s",
            (amount, from_id)
        )
        await session.execute(
            "UPDATE accounts SET balance = balance + %s WHERE id = %s",
            (amount, to_id)
        )
```

这段代码中，如果第二条UPDATE失败，整个事务会自动回滚，第一条UPDATE不会生效。这就是async with的威力：你不需要手写try/except/rollback，上下文管理器帮你处理了。

async with还可以嵌套使用，这在需要同时管理多个资源的场景中非常有用。比如你同时需要数据库连接和Redis连接：

```python
async def transfer_with_cache(session, redis, user_id):
    async with session.begin():
        async with redis.pipeline() as pipe:
            pipe.hget(f'user:{user_id}', 'balance')
            pipe.hget(f'user:{user_id}', 'level')
            cached = await pipe.execute()
            # 数据库操作和缓存操作在同一个上下文中
            await session.execute(
                "UPDATE users SET balance = %s WHERE id = %s",
                (cached[0], user_id)
            )
```

嵌套async with的一个注意事项是退出顺序。外层的__aexit__会在内层的__aexit__之后执行。如果外层资源依赖内层资源的状态，要确保退出顺序是正确的。比如外层是数据库事务，内层是数据库连接，退出时先提交事务再关闭连接，这个顺序是正确的。如果反过来就不对了。

### 3.7 异步迭代器：async for与__aiter__/__anext__

异步迭代器允许你在for循环中await。它定义了__aiter__和__anext__两个异步方法。每次迭代时，__anext__可以执行异步操作（比如从网络读取数据），然后返回下一个值。当没有更多数据时，抛出StopAsyncIteration。

```python
class AsyncRange:
    def __init__(self, start, stop, delay=0.1):
        self.current = start
        self.stop = stop
        self.delay = delay

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.current >= self.stop:
            raise StopAsyncIteration
        await asyncio.sleep(self.delay)
        value = self.current
        self.current += 1
        return value

async def main():
    async for num in AsyncRange(1, 5):
        print(f'拿到: {num}')
```

异步迭代器的实战场景非常丰富。

场景一，流式读取大文件或网络数据：

```python
import aiohttp

class StreamReader:
    def __init__(self, url):
        self.url = url

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        self.resp = await self.session.get(self.url)
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        line = await self.resp.content.readline()
        if not line:
            raise StopAsyncIteration
        return line.decode('utf-8').strip()

    async def __aexit__(self, *args):
        await self.resp.close()
        await self.session.close()
```

这个StreamReader可以逐行读取HTTP响应体，不需要一次性把整个响应加载到内存。对于大文件下载和处理特别有用。

场景二，数据库游标分批查询：

```python
class BatchQuery:
    def __init__(self, pool, sql, batch_size=100):
        self.pool = pool
        self.sql = sql
        self.batch_size = batch_size
        self.offset = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                f'{self.sql} LIMIT {self.batch_size} OFFSET {self.offset}'
            )
        if not rows:
            raise StopAsyncIteration
        self.offset += len(rows)
        return rows
```

这个BatchQuery每次返回一批数据，而不是一次性查全部。对于百万级数据的批处理，内存占用可控，不会因为数据量太大而OOM。我曾在项目中用这个模式处理过一个3000万行的数据迁移任务，每次取1000行处理，内存占用稳定在200MB以内。如果一次性加载全部数据，内存至少需要几十GB，根本不可行。

异步迭代器还可以和async for配合实现链式处理。比如你从数据库批量读取数据，每批通过异步管道发送到下游服务，整个过程都是流式的，不需要中间存储：

```python
async def process_pipeline(source, transformer, sink):
    async for batch in source:
        transformed = await transformer(batch)
        await sink(transformed)
```

这种模式的优雅之处在于：数据像水流一样从源头经过处理器流向终点，每个环节都是异步的，不会阻塞。而且由于async for的语义非常清晰，代码可读性远优于传统的while循环加手动await。

> 异步迭代器把拉数据变成了数据推给你。在流式处理场景中，这种模式比一次性加载所有数据更省内存，也更符合异步的编程模型。

## 四、实战清单：异步服务上线前的自检步骤

把异步Web服务推向生产环境之前，请逐条检查以下清单。这些是我在多次生产事故中总结出来的经验教训，每一条背后都有真实的事故案例。

**1. 连接池配置检查**

数据库连接池大小是否与并发量匹配。建议公式：池大小大于等于峰值QPS乘以平均查询耗时秒数。比如峰值1000 QPS，平均查询50毫秒，池大小至少50。Redis连接池是否设置了max_connections。连接池是否设置了获取超时，不要无限等待，否则一个连接池耗尽就会拖垮整个服务。

**2. 事件循环阻塞检查**

是否有同步阻塞操作在协程中直接调用。比如time.sleep、requests.get、open函数读大文件。这些操作会阻塞整个事件循环，所有协程都会受影响。CPU密集型任务是否用run_in_executor放到了线程池。是否有同步ORM操作混在异步代码中。一个同步的数据库查询就能阻塞事件循环数百毫秒，这对高并发服务是致命的。

**3. 超时配置检查**

所有外部调用是否都设置了超时，包括HTTP请求、数据库查询、Redis操作。超时值是否合理，不要一律30秒，根据业务区分。快接口1秒超时，慢接口10秒，批处理接口可以更长。超时后是否有清理逻辑，关闭连接、回滚事务、释放资源。

**4. 异常处理检查**

gather是否正确处理了异常传播。协程中是否有try/except吞掉异常。CancelledError是否被意外捕获，不要在except Exception中捕获它。未处理的异常会导致协程静默失败，排查极其困难。

**5. 资源释放检查**

所有async with是否正确使用了上下文管理器。数据库连接是否在异常路径下也能释放。HTTP客户端Session是否在应用关闭时关闭。资源泄漏在异步程序中特别危险，因为协程的创建和销毁速度远快于线程。

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_pool = await create_db_pool()
    app.state.redis = await create_redis_client()
    yield
    await app.state.db_pool.close()
    await app.state.redis.close()

app = FastAPI(lifespan=lifespan)
```

**6. 并发控制检查**

是否有必要的Semaphore限流。批量操作是否有最大并发限制。队列是否有背压控制。没有限流的批量操作就像没有红绿灯的十字路口，看起来谁都能过，最后谁也过不了。

**7. 日志和监控检查**

异步程序的调试比同步程序困难得多，因为协程的执行顺序不确定，堆栈信息也更复杂。确保你的异步服务有完善的日志：每个协程的启动和结束都要有日志，每个异常都要记录完整的堆栈。使用structlog或loguru等结构化日志库，方便后续的日志聚合和分析。监控方面，重点关注事件循环的延迟：如果事件循环的tick时间超过50毫秒，说明有同步操作阻塞了事件循环，需要排查。

**8. 优雅关闭检查**

异步服务关闭时，需要处理三件事：停止接收新请求、等待正在处理的请求完成、释放所有资源。FastAPI的lifespan机制可以处理资源释放，但等待正在处理的请求完成需要额外配置。Uvicorn提供了--timeout-graceful-shutdown参数，设置优雅关闭的超时时间。如果超时后仍有请求未完成，Uvicorn会强制关闭。这个超时值需要根据你的最长请求处理时间来设置，一般30到60秒比较合理。

这个清单不是一成不变的，每个项目的侧重点不同。但核心原则只有一个：异步架构中的每一条等都必须有边界，要么是超时边界，要么是并发边界。没有边界的等待，早晚会变成生产事故。在异步世界里，一个没有超时的await就是一颗定时炸弹，你不知道它什么时候会爆炸，但它一定会爆炸。

## 结语

这一章覆盖了异步编程的核心内容：从ASGI规范到异步Web框架，从异步数据库驱动到连接池设计，从生产者消费者模式到扇出扇入、超时取消、异常处理。这些知识点不是孤立的，它们组合在一起构成了一个完整的异步编程体系。异步编程的学习曲线确实陡峭，但它带来的性能提升也是实打实的。

关键不是记住每个API的用法，而是理解异步的心智模型：你不再是在写执行步骤，而是在编排事件流。每个await都是一个让出点，每个async with都是一个资源生命周期，每个TaskGroup都是一个错误传播边界。

从同步到异步的迁移不需要一步到位。用a2wsgi做渐进迁移，新接口用FastAPI写，老接口保持Flask不变，等时机成熟再逐步替换。重要的是每一步都要有测试覆盖，确保迁移过程中不引入回归bug。

回顾这一章的知识脉络：ASGI规范是异步Web开发的基石，它定义了scope、receive、send三件套和一组事件类型；异步数据库驱动是异步架构的关键一环，asyncpg性能最强，SQLAlchemy AsyncSession功能最全；连接池是数据库性能优化的标配，要做好健康检查和空闲回收；并发模式方面，生产者消费者用Queue，限并发用Semaphore，扇出扇入用gather和TaskGroup，超时用timeout，取消用cancel。这些知识点环环相扣，缺一不可。

> 异步不是银弹，它是特定场景下的性能放大器。如果你的应用是输入输出密集型的，异步能让你的吞吐量翻几倍；如果是CPU密集型的，异步帮不了你，反而会增加复杂度。

如果你觉得这篇文章对你有帮助，点个收藏，以后写异步代码的时候翻出来对照着看。有什么问题或者踩坑经验，评论区交流。下一章我们讲RPC框架设计与gRPC，从HTTP API到RPC，从REST到Protocol Buffers，继续追更。

怕浪猫说：异步编程的精髓不在于你写了多少async def，而在于你理解了多少让出时机。一个设计良好的异步系统，每个协程都知道什么时候该等、什么时候该跑、什么时候该退出。写异步代码就像指挥交通，你的职责不是亲自开车，而是让每辆车在正确的时间走正确的路。

系列进度 7/16，下一章预告：RPC框架设计与gRPC。
