# FastAPI测试策略与质量保证：从单元测试到CI/CD的完整指南

> 在2023年StackOverflow开发者调查中，**测试覆盖率不足**位列技术债务榜首。我曾见证一个线上事故：由于缺少集成测试，一个API更改导致整个支付系统瘫痪，损失数百万。本文将带你构建坚如磐石的FastAPI测试体系。

## 引言：为什么测试如此重要？

测试不只是QA的工作，而是开发者的责任。一个完整的测试策略能够：

- 减少70%以上的生产环境bug
- 提升代码可维护性和可重构性
- 加快新功能开发速度
- 增强团队对代码变更的信心

FastAPI基于Python类型提示和Pydantic，天生适合测试。但如何有效测试异步代码、数据库操作和外部依赖？本文将带你构建完整的测试体系。

## 1. 测试金字塔：单元、集成、E2E

### 测试金字塔理论

```python
# 测试金字塔结构
"""
          /\
         /  \       少量E2E测试（用户场景）
        /    \
       /______\     更多集成测试（组件交互）
      /        \
     /__________\   大量单元测试（独立函数/类）
    /            \
   /______________\

比例建议：70%单元测试，20%集成测试，10%E2E测试
"""

class TestPyramid:
    """测试金字塔实现"""

    def __init__(self):
        self.unit_tests = []
        self.integration_tests = []
        self.e2e_tests = []

    def add_unit_test(self, test_func):
        """添加单元测试"""
        self.unit_tests.append(test_func)

    def add_integration_test(self, test_func):
        """添加集成测试"""
        self.integration_tests.append(test_func)

    def add_e2e_test(self, test_func):
        """添加端到端测试"""
        self.e2e_tests.append(test_func)

    def run_all(self):
        """运行所有测试"""
        results = {
            "unit": self._run_tests(self.unit_tests, "单元测试"),
            "integration": self._run_tests(self.integration_tests, "集成测试"),
            "e2e": self._run_tests(self.e2e_tests, "E2E测试")
        }

        total = sum(len(tests) for tests in [self.unit_tests, self.integration_tests, self.e2e_tests])
        print(f"\n测试金字塔统计:")
        print(f"单元测试: {len(self.unit_tests)} ({len(self.unit_tests)/total:.1%})")
        print(f"集成测试: {len(self.integration_tests)} ({len(self.integration_tests)/total:.1%})")
        print(f"E2E测试: {len(self.e2e_tests)} ({len(self.e2e_tests)/total:.1%})")

        return results

    def _run_tests(self, tests, category):
        """运行指定类别的测试"""
        print(f"\n运行{category}:")
        results = []
        for test in tests:
            try:
                test()
                results.append({"test": test.__name__, "status": "PASS"})
                print(f"  ✓ {test.__name__}")
            except Exception as e:
                results.append({"test": test.__name__, "status": "FAIL", "error": str(e)})
                print(f"  ✗ {test.__name__}: {e}")
        return results

# 示例测试
def test_addition():
    """单元测试示例"""
    assert 1 + 1 == 2

def test_user_registration_flow():
    """集成测试示例"""
    # 测试用户注册的完整流程
    pass

def test_full_payment_process():
    """E2E测试示例"""
    # 测试完整的支付流程
    pass

# 构建测试金字塔
pyramid = TestPyramid()
pyramid.add_unit_test(test_addition)
pyramid.add_integration_test(test_user_registration_flow)
pyramid.add_e2e_test(test_full_payment_process)
pyramid.run_all()
```

### FastAPI测试策略

```python
# tests/__init__.py
"""
测试目录结构:
tests/
├── unit/                    # 单元测试
│   ├── test_models.py
│   ├── test_services.py
│   └── test_utils.py
├── integration/            # 集成测试
│   ├── test_api.py
│   ├── test_database.py
│   └── test_auth.py
├── e2e/                    # 端到端测试
│   ├── test_user_flow.py
│   └── test_payment_flow.py
├── conftest.py            # 共享fixture
└── fixtures/              # 测试数据
    ├── users.json
    └── products.json
"""

# conftest.py - 共享测试配置
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.core.config import settings

# 创建测试数据库引擎
test_engine = create_engine(
    settings.TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# 创建测试会话工厂
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine
)

# 在测试运行前创建表
@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """设置测试数据库"""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def db_session():
    """创建数据库会话"""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # 使用嵌套事务，允许回滚
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def end_savepoint(session, transaction):
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db_session):
    """创建测试客户端"""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

@pytest.fixture
def authenticated_client(client, db_session):
    """创建已认证的测试客户端"""
    from app.models.user import User
    from app.core.security import create_access_token

    # 创建测试用户
    user = User(
        email="test@example.com",
        hashed_password="hashed_password",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()

    # 创建访问令牌
    token = create_access_token(data={"sub": user.email})

    # 设置认证头
    client.headers.update({"Authorization": f"Bearer {token}"})

    yield client, user
```

## 2. Pytest框架深度使用

### 高级Fixtures

```python
# tests/conftest.py - 扩展fixtures
import pytest
import tempfile
import json
from pathlib import Path
from typing import Dict, Any, Generator
from unittest.mock import Mock, AsyncMock

# 1. 参数化fixture
@pytest.fixture(params=["user1", "user2", "admin"])
def user_type(request):
    """参数化用户类型fixture"""
    return request.param

@pytest.fixture
def user_data(user_type):
    """根据用户类型生成测试数据"""
    data = {
        "email": f"{user_type}@example.com",
        "password": "secure_password123",
        "is_active": True
    }

    if user_type == "admin":
        data["is_superuser"] = True
        data["role"] = "admin"

    return data

# 2. 工厂fixture
@pytest.fixture
def user_factory():
    """用户工厂fixture"""
    from app.models.user import User
    from app.core.security import get_password_hash

    def create_user(**kwargs):
        """创建用户实例"""
        defaults = {
            "email": "user@example.com",
            "hashed_password": get_password_hash("password"),
            "is_active": True,
            "full_name": "Test User"
        }
        defaults.update(kwargs)
        return User(**defaults)

    return create_user

# 3. 临时文件fixture
@pytest.fixture
def temp_config_file():
    """临时配置文件fixture"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        config = {
            "database": {"url": "sqlite:///:memory:"},
            "security": {"secret_key": "test_secret"},
            "logging": {"level": "DEBUG"}
        }
        json.dump(config, f)
        f.flush()
        yield Path(f.name)

    # 清理临时文件
    Path(f.name).unlink(missing_ok=True)

# 4. 异步fixture
@pytest.fixture
async def async_client():
    """异步测试客户端"""
    from httpx import AsyncClient

    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

# 5. 自动使用fixture
@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """自动设置测试环境"""
    # 模拟环境变量
    monkeypatch.setenv("ENVIRONMENT", "testing")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")

    # 模拟时间
    import datetime
    fixed_time = datetime.datetime(2023, 1, 1, 12, 0, 0)

    class MockDateTime(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_time

    monkeypatch.setattr(datetime, "datetime", MockDateTime)

    # 清理回调
    yield

    # 测试后的清理工作
    print("\n测试完成，清理环境...")

# 6. 作用域控制
@pytest.fixture(scope="module")
def module_scoped_resource():
    """模块级fixture"""
    resource = {"initialized": False}
    print("初始化模块级资源")
    resource["initialized"] = True
    yield resource
    print("清理模块级资源")

@pytest.fixture(scope="class")
def class_scoped_resource():
    """类级fixture"""
    return {"class": "scoped"}

@pytest.fixture(scope="session")
def session_scoped_database():
    """会话级数据库连接"""
    from sqlalchemy import create_engine
    engine = create_engine("sqlite:///:memory:")
    yield engine
    engine.dispose()

# 7. 动态fixture
@pytest.fixture
def dynamic_fixture(request):
    """动态fixture，根据测试参数调整"""
    marker = request.node.get_closest_marker("fixture_data")
    if marker and "value" in marker.kwargs:
        return marker.kwargs["value"]
    return "default_value"

# 8. Fixture依赖
@pytest.fixture
def raw_user_data():
    """原始用户数据"""
    return {"email": "test@example.com", "password": "password"}

@pytest.fixture
def hashed_user_data(raw_user_data):
    """哈希密码后的用户数据"""
    from app.core.security import get_password_hash
    data = raw_user_data.copy()
    data["hashed_password"] = get_password_hash(data.pop("password"))
    return data

@pytest.fixture
def user_in_db(db_session, hashed_user_data):
    """数据库中的用户"""
    from app.models.user import User
    user = User(**hashed_user_data)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

# 使用示例
@pytest.mark.fixture_data(value="custom_value")
def test_dynamic_fixture(dynamic_fixture):
    assert dynamic_fixture == "custom_value"

class TestUserAPI:
    """使用类级fixture的测试类"""

    def test_user_creation(self, class_scoped_resource):
        assert class_scoped_resource["class"] == "scoped"

    def test_user_deletion(self, class_scoped_resource):
        # 同一个测试类中的测试共享fixture实例
        pass
```

### 高级断言和插件

```python
# tests/test_advanced_assertions.py
import pytest
from pytest import approx, raises, warns, MonkeyPatch
from datetime import datetime, timedelta
import re

def test_advanced_assertions():
    """高级断言技巧"""

    # 1. 浮点数近似相等
    result = 0.1 + 0.2
    assert result == approx(0.3)
    assert result == approx(0.3, rel=1e-3)  # 相对误差
    assert result == approx(0.3, abs=1e-10)  # 绝对误差

    # 2. 异常断言
    with raises(ValueError) as exc_info:
        int("not a number")

    assert "invalid literal" in str(exc_info.value)
    assert exc_info.type == ValueError

    # 3. 警告断言
    import warnings

    with warns(UserWarning) as warning_list:
        warnings.warn("Deprecated!", UserWarning)

    assert len(warning_list) == 1
    assert "Deprecated" in str(warning_list[0].message)

    # 4. 正则表达式匹配
    text = "Hello, world!"
    assert re.match(r"^Hello", text)
    assert re.search(r"world", text)

    # 5. 集合断言
    set1 = {1, 2, 3}
    set2 = {3, 2, 1}
    assert set1 == set2
    assert 1 in set1
    assert {1, 2}.issubset(set1)

    # 6. 字典断言
    dict1 = {"a": 1, "b": 2}
    dict2 = {"b": 2, "a": 1}
    assert dict1 == dict2
    assert dict1.keys() == {"a", "b"}
    assert dict1["a"] == 1

    # 7. 时间断言
    now = datetime.now()
    future = now + timedelta(days=1)
    assert future > now
    assert (future - now).days == 1

    # 8. 自定义断言消息
    value = 5
    expected = 10
    assert value == expected, f"Expected {expected}, got {value}"

# 使用pytest插件
def test_with_plugins():
    """使用pytest插件增强测试"""

    # pytest-mock
    import pytest_mock
    # 在测试中使用 mocker fixture

    # pytest-asyncio
    import pytest_asyncio
    # 支持异步测试

    # pytest-cov
    # 测试覆盖率

    # pytest-xdist
    # 并行测试

    # pytest-django / pytest-flask / pytest-fastapi
    # 特定框架支持

# 自定义断言
class CustomAssertions:
    """自定义断言类"""

    @staticmethod
    def assert_user_valid(user):
        """断言用户有效"""
        assert user is not None
        assert hasattr(user, "email")
        assert "@" in user.email
        assert hasattr(user, "id")
        assert user.id > 0
        return True

    @staticmethod
    def assert_response_success(response, status_code=200):
        """断言响应成功"""
        assert response.status_code == status_code
        data = response.json()
        assert "error" not in data
        return data

    @staticmethod
    def assert_pagination(response, expected_count=None):
        """断言分页响应"""
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "pages" in data

        if expected_count is not None:
            assert data["total"] == expected_count

        return data

# 使用自定义断言
def test_custom_assertions():
    user = Mock(email="test@example.com", id=1)
    assert CustomAssertions.assert_user_valid(user)

    response = Mock(status_code=200, json=lambda: {"data": "success"})
    data = CustomAssertions.assert_response_success(response)
    assert data["data"] == "success"

# 参数化测试
@pytest.mark.parametrize(
    "input_value,expected",
    [
        (1, 2),
        (2, 4),
        (3, 6),
        (0, 0),
        (-1, -2),
    ]
)
def test_double_function(input_value, expected):
    """测试双倍函数"""
    def double(x):
        return x * 2

    result = double(input_value)
    assert result == expected

# 参数化组合
@pytest.mark.parametrize("x", [0, 1])
@pytest.mark.parametrize("y", [2, 3])
def test_combinations(x, y):
    """测试参数组合"""
    assert x + y == sum([x, y])

# 使用fixture参数化
@pytest.fixture(params=[1, 2, 3])
def number_fixture(request):
    return request.param

def test_with_fixture_param(number_fixture):
    assert number_fixture in [1, 2, 3]

# 标记测试
@pytest.mark.slow
def test_slow_operation():
    """慢速测试"""
    import time
    time.sleep(2)
    assert True

@pytest.mark.skip(reason="功能暂未实现")
def test_unimplemented():
    """跳过测试"""
    assert False

@pytest.mark.skipif(
    sys.version_info < (3, 8),
    reason="需要Python 3.8或更高版本"
)
def test_python38_feature():
    """条件跳过测试"""
    assert True

@pytest.mark.xfail(reason="已知问题，期待失败")
def test_known_bug():
    """预期失败的测试"""
    assert 1 == 2  # 这应该失败

# 使用自定义标记
@pytest.mark.integration
def test_integration():
    """集成测试标记"""
    pass

@pytest.mark.e2e
def test_e2e():
    """端到端测试标记"""
    pass

@pytest.mark.security
def test_security():
    """安全测试标记"""
    pass
```

## 3. 异步代码测试技巧

### AsyncIO测试基础

```python
# tests/test_async_basic.py
import pytest
import asyncio
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch
import time

# 基础异步测试
@pytest.mark.asyncio
async def test_async_function():
    """基础异步测试"""

    async def async_add(a, b):
        await asyncio.sleep(0.1)  # 模拟异步操作
        return a + b

    result = await async_add(1, 2)
    assert result == 3

# 异步超时测试
@pytest.mark.asyncio
async def test_async_timeout():
    """测试异步超时"""

    async def slow_operation():
        await asyncio.sleep(2)
        return "done"

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(slow_operation(), timeout=0.1)

# 异步上下文管理器测试
@pytest.mark.asyncio
async def test_async_context():
    """测试异步上下文管理器"""

    class AsyncResource:
        async def __aenter__(self):
            self.value = "initialized"
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            self.value = "cleaned up"

    async with AsyncResource() as resource:
        assert resource.value == "initialized"

    assert resource.value == "cleaned up"

# FastAPI异步端点测试
@pytest.mark.asyncio
async def test_async_endpoint(async_client):
    """测试异步API端点"""

    response = await async_client.get("/api/async-data")
    assert response.status_code == 200

    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)

# 异步fixture
@pytest.fixture
async def async_user_data():
    """异步fixture"""
    await asyncio.sleep(0.1)  # 模拟异步初始化
    return {"id": 1, "name": "Async User"}

@pytest.mark.asyncio
async def test_with_async_fixture(async_user_data):
    """使用异步fixture的测试"""
    assert async_user_data["id"] == 1
    assert async_user_data["name"] == "Async User"

# 异步Mock测试
@pytest.mark.asyncio
async def test_async_mock():
    """测试异步Mock"""

    # 创建异步Mock
    mock_service = AsyncMock()
    mock_service.get_data.return_value = {"data": "test"}

    # 调用异步方法
    result = await mock_service.get_data()

    # 验证调用
    assert result == {"data": "test"}
    mock_service.get_data.assert_awaited_once()

# 异步数据库测试
@pytest.mark.asyncio
async def test_async_database():
    """测试异步数据库操作"""

    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text

    # 创建异步引擎
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    async with engine.begin() as conn:
        await conn.execute(text("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)"))

    # 创建异步会话
    AsyncSessionLocal = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with AsyncSessionLocal() as session:
        # 执行异步查询
        result = await session.execute(
            text("INSERT INTO test (name) VALUES (:name)"),
            {"name": "test"}
        )
        await session.commit()

        # 验证插入
        result = await session.execute(text("SELECT * FROM test"))
        rows = result.fetchall()
        assert len(rows) == 1
        assert rows[0].name == "test"

# 并发异步测试
@pytest.mark.asyncio
async def test_concurrent_async():
    """测试并发异步操作"""

    async def process_item(item):
        await asyncio.sleep(0.1)
        return item * 2

    items = [1, 2, 3, 4, 5]

    # 顺序处理
    start = time.time()
    results_sequential = []
    for item in items:
        result = await process_item(item)
        results_sequential.append(result)
    sequential_time = time.time() - start

    # 并发处理
    start = time.time()
    tasks = [process_item(item) for item in items]
    results_concurrent = await asyncio.gather(*tasks)
    concurrent_time = time.time() - start

    # 验证结果
    assert results_sequential == results_concurrent
    assert concurrent_time < sequential_time  # 并发应该更快

# 异步异常测试
@pytest.mark.asyncio
async def test_async_exception():
    """测试异步异常"""

    async def failing_operation():
        await asyncio.sleep(0.1)
        raise ValueError("Async error")

    with pytest.raises(ValueError) as exc_info:
        await failing_operation()

    assert "Async error" in str(exc_info.value)

# 使用pytest-asyncio的高级功能
@pytest.mark.asyncio
async def test_asyncio_event_loop():
    """测试事件循环"""
    loop = asyncio.get_event_loop()
    assert loop.is_running()

    # 在事件循环中调度任务
    future = loop.create_future()
    loop.call_soon(future.set_result, "done")

    result = await future
    assert result == "done"

# 异步WebSocket测试
@pytest.mark.asyncio
async def test_websocket():
    """测试WebSocket连接"""
    import websockets

    async with websockets.connect("ws://localhost:8000/ws") as websocket:
        # 发送消息
        await websocket.send("Hello")

        # 接收响应
        response = await websocket.recv()
        assert response == "Hello back"

        # 测试Ping/Pong
        pong_waiter = await websocket.ping()
        await pong_waiter

        # 测试关闭
        await websocket.close()
```

### FastAPI异步测试实战

```python
# tests/test_async_api.py
import pytest
import asyncio
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock
from datetime import datetime, timedelta
import json

@pytest.mark.asyncio
class TestAsyncAPI:
    """异步API测试类"""

    async def test_async_endpoint(self, async_client: AsyncClient):
        """测试异步端点"""
        response = await async_client.get("/api/async/data")
        assert response.status_code == 200

        data = response.json()
        assert "timestamp" in data
        assert "data" in data

    async def test_websocket_endpoint(self, async_client: AsyncClient):
        """测试WebSocket端点"""
        async with async_client.websocket_connect("/ws/chat") as websocket:
            # 发送消息
            await websocket.send_json({
                "type": "message",
                "content": "Hello",
                "user": "test"
            })

            # 接收响应
            data = await websocket.receive_json()
            assert data["type"] == "message"
            assert data["content"] == "Hello"
            assert data["user"] == "test"

    async def test_concurrent_requests(self, async_client: AsyncClient):
        """测试并发请求"""

        async def make_request():
            response = await async_client.get("/api/async/data")
            return response.status_code

        # 创建10个并发请求
        tasks = [make_request() for _ in range(10)]
        results = await asyncio.gather(*tasks)

        # 所有请求都应该成功
        assert all(status == 200 for status in results)

    async def test_async_dependency_injection(self, async_client: AsyncClient):
        """测试异步依赖注入"""
        response = await async_client.get("/api/async/with-deps")
        assert response.status_code == 200

        data = response.json()
        assert "dependency_result" in data
        assert data["dependency_result"] == "async_dependency_worked"

    async def test_rate_limiting(self, async_client: AsyncClient):
        """测试速率限制"""
        responses = []

        # 快速发送多个请求
        for i in range(10):
            response = await async_client.get("/api/rate-limited")
            responses.append(response.status_code)

        # 前5个应该成功，后面的可能被限制
        success_count = sum(1 for status in responses if status == 200)
        rate_limited_count = sum(1 for status in responses if status == 429)

        assert success_count >= 1
        assert rate_limited_count >= 0

    async def test_async_file_upload(self, async_client: AsyncClient):
        """测试异步文件上传"""

        # 创建测试文件
        files = {"file": ("test.txt", b"Hello, World!", "text/plain")}

        response = await async_client.post(
            "/api/upload",
            files=files
        )

        assert response.status_code == 200
        data = response.json()
        assert "filename" in data
        assert "size" in data
        assert data["size"] == 13

    async def test_async_background_tasks(self, async_client: AsyncClient):
        """测试后台任务"""

        with patch("app.tasks.background_task.delay") as mock_task:
            response = await async_client.post(
                "/api/trigger-task",
                json={"data": "test"}
            )

            assert response.status_code == 202
            mock_task.assert_called_once_with(data="test")

    async def test_async_cache(self, async_client: AsyncClient):
        """测试异步缓存"""

        # 第一次请求
        response1 = await async_client.get("/api/cached-data")
        assert response1.status_code == 200
        data1 = response1.json()
        assert "timestamp" in data1

        # 短暂等待
        await asyncio.sleep(0.5)

        # 第二次请求（应该从缓存获取）
        response2 = await async_client.get("/api/cached-data")
        assert response2.status_code == 200
        data2 = response2.json()

        # 时间戳应该相同（缓存生效）
        assert data1["timestamp"] == data2["timestamp"]

    async def test_async_error_handling(self, async_client: AsyncClient):
        """测试异步错误处理"""

        # 测试400错误
        response = await async_client.post(
            "/api/async/error",
            json={"trigger_error": True}
        )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

        # 测试500错误
        response = await async_client.get("/api/async/server-error")
        assert response.status_code == 500

    async def test_async_validation(self, async_client: AsyncClient):
        """测试异步验证"""

        # 无效数据
        response = await async_client.post(
            "/api/async/validate",
            json={"email": "invalid-email", "age": -5}
        )

        assert response.status_code == 422
        data = response.json()
        assert "detail" in data

        # 验证错误详情
        errors = data["detail"]
        assert len(errors) >= 2

        error_fields = [error["loc"][-1] for error in errors]
        assert "email" in error_fields
        assert "age" in error_fields

    async def test_async_middleware(self, async_client: AsyncClient):
        """测试异步中间件"""

        response = await async_client.get("/api/async/data")

        # 检查中间件添加的头部
        assert "X-Process-Time" in response.headers
        assert "X-Request-ID" in response.headers

        process_time = float(response.headers["X-Process-Time"])
        assert process_time > 0

    async def test_async_database_transaction(self, async_client: AsyncClient, db_session):
        """测试异步数据库事务"""

        from app.models.user import User

        # 获取初始用户数
        initial_count = db_session.query(User).count()

        # 创建用户
        response = await async_client.post(
            "/api/async/users",
            json={
                "email": "transaction_test@example.com",
                "password": "secure123"
            }
        )

        assert response.status_code == 201

        # 验证用户已创建
        final_count = db_session.query(User).count()
        assert final_count == initial_count + 1

        # 验证用户数据
        user = db_session.query(User).filter(
            User.email == "transaction_test@example.com"
        ).first()

        assert user is not None
        assert user.is_active is True

    @pytest.mark.timeout(5)  # 设置测试超时
    async def test_async_timeout_handling(self, async_client: AsyncClient):
        """测试异步超时处理"""

        # 这个端点应该快速响应
        response = await async_client.get("/api/async/fast")
        assert response.status_code == 200

        # 这个端点可能较慢
        try:
            response = await async_client.get("/api/async/slow", timeout=1.0)
        except Exception as e:
            # 应该超时
            assert "timeout" in str(e).lower()

    async def test_async_circuit_breaker(self, async_client: AsyncClient):
        """测试熔断器模式"""

        failures = []

        # 模拟多次失败
        with patch("app.services.external_api.call", side_effect=Exception("Service down")):
            for i in range(5):
                try:
                    response = await async_client.get("/api/with-external")
                    if response.status_code != 200:
                        failures.append(response.status_code)
                except Exception:
                    failures.append("exception")

        # 验证熔断器触发
        assert len(failures) > 0

    async def test_async_bulk_operations(self, async_client: AsyncClient):
        """测试批量操作"""

        # 批量创建用户
        users = [
            {"email": f"user{i}@example.com", "password": "password123"}
            for i in range(10)
        ]

        response = await async_client.post(
            "/api/async/users/bulk",
            json={"users": users}
        )

        assert response.status_code == 201
        data = response.json()

        assert "created_count" in data
        assert data["created_count"] == 10

        assert "failed_count" in data
        assert data["failed_count"] == 0

    async def test_async_streaming_response(self, async_client: AsyncClient):
        """测试流式响应"""

        response = await async_client.get("/api/async/stream")

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream"

        # 验证流式数据
        async for chunk in response.aiter_bytes():
            assert chunk  # 应该有数据

    async def test_async_health_check(self, async_client: AsyncClient):
        """测试健康检查"""

        response = await async_client.get("/health")

        assert response.status_code == 200
        data = response.json()

        assert "status" in data
        assert data["status"] == "healthy"

        assert "timestamp" in data
        assert "version" in data
```

## 4. 数据库测试：事务管理

### 数据库测试策略

```python
# tests/test_database.py
import pytest
from sqlalchemy import text, select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
import time

class TestDatabase:
    """数据库测试类"""

    def test_database_connection(self, db_session: Session):
        """测试数据库连接"""
        result = db_session.execute(text("SELECT 1"))
        assert result.scalar() == 1

    def test_create_and_read(self, db_session: Session):
        """测试创建和读取"""
        from app.models.user import User

        # 创建用户
        user = User(
            email="test@example.com",
            hashed_password="hashed",
            full_name="Test User"
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        # 读取用户
        saved_user = db_session.query(User).filter_by(email="test@example.com").first()

        assert saved_user is not None
        assert saved_user.id == user.id
        assert saved_user.email == user.email
        assert saved_user.full_name == user.full_name

    def test_update(self, db_session: Session):
        """测试更新操作"""
        from app.models.user import User

        # 创建用户
        user = User(
            email="update@example.com",
            hashed_password="hashed",
            full_name="Original Name"
        )
        db_session.add(user)
        db_session.commit()

        # 更新用户
        user.full_name = "Updated Name"
        db_session.commit()
        db_session.refresh(user)

        # 验证更新
        assert user.full_name == "Updated Name"

    def test_delete(self, db_session: Session):
        """测试删除操作"""
        from app.models.user import User

        # 创建用户
        user = User(
            email="delete@example.com",
            hashed_password="hashed"
        )
        db_session.add(user)
        db_session.commit()

        user_id = user.id

        # 删除用户
        db_session.delete(user)
        db_session.commit()

        # 验证删除
        deleted_user = db_session.query(User).get(user_id)
        assert deleted_user is None

    def test_unique_constraint(self, db_session: Session):
        """测试唯一约束"""
        from app.models.user import User

        # 创建第一个用户
        user1 = User(
            email="unique@example.com",
            hashed_password="hashed"
        )
        db_session.add(user1)
        db_session.commit()

        # 尝试创建相同邮箱的用户（应该失败）
        user2 = User(
            email="unique@example.com",  # 相同邮箱
            hashed_password="hashed2"
        )
        db_session.add(user2)

        with pytest.raises(IntegrityError):
            db_session.commit()

        # 回滚失败的提交
        db_session.rollback()

    def test_foreign_key_constraint(self, db_session: Session):
        """测试外键约束"""
        from app.models.user import User
        from app.models.article import Article

        # 创建用户
        user = User(
            email="author@example.com",
            hashed_password="hashed"
        )
        db_session.add(user)
        db_session.commit()

        # 创建文章（关联用户）
        article = Article(
            title="Test Article",
            content="Content",
            author_id=user.id  # 有效的外键
        )
        db_session.add(article)
        db_session.commit()

        # 尝试创建无效外键的文章（应该失败）
        invalid_article = Article(
            title="Invalid Article",
            content="Content",
            author_id=99999  # 不存在的用户ID
        )
        db_session.add(invalid_article)

        with pytest.raises(IntegrityError):
            db_session.commit()

        db_session.rollback()

    def test_transaction_rollback(self, db_session: Session):
        """测试事务回滚"""
        from app.models.user import User

        # 记录初始用户数
        initial_count = db_session.query(User).count()

        try:
            # 开始事务
            user1 = User(
                email="rollback1@example.com",
                hashed_password="hashed"
            )
            db_session.add(user1)
            db_session.flush()  # 获取ID但不提交

            user2 = User(
                email="rollback2@example.com",
                hashed_password="hashed"
            )
            db_session.add(user2)
            db_session.flush()

            # 故意引发异常
            raise ValueError("Something went wrong")

        except ValueError:
            # 回滚事务
            db_session.rollback()

        # 验证回滚
        final_count = db_session.query(User).count()
        assert final_count == initial_count  # 用户数应该不变

        # 验证用户不存在
        user1_exists = db_session.query(User).filter_by(
            email="rollback1@example.com"
        ).first()
        assert user1_exists is None

    def test_nested_transactions(self, db_session: Session):
        """测试嵌套事务"""
        from app.models.user import User

        initial_count = db_session.query(User).count()

        # 外层事务
        try:
            user1 = User(
                email="outer@example.com",
                hashed_password="hashed"
            )
            db_session.add(user1)

            # 内层事务（保存点）
            nested = db_session.begin_nested()
            try:
                user2 = User(
                    email="inner@example.com",
                    hashed_password="hashed"
                )
                db_session.add(user2)

                # 内层回滚
                raise ValueError("Inner transaction failed")

            except ValueError:
                nested.rollback()

            # 外层提交
            db_session.commit()

        except Exception:
            db_session.rollback()
            raise

        # 验证：只有外层用户被保存
        final_count = db_session.query(User).count()
        assert final_count == initial_count + 1

        outer_user = db_session.query(User).filter_by(
            email="outer@example.com"
        ).first()
        assert outer_user is not None

        inner_user = db_session.query(User).filter_by(
            email="inner@example.com"
        ).first()
        assert inner_user is None

    def test_concurrent_transactions(self, db_session: Session):
        """测试并发事务"""
        from app.models.counter import Counter
        import threading

        # 创建计数器
        counter = Counter(name="test", value=0)
        db_session.add(counter)
        db_session.commit()
        db_session.refresh(counter)

        results = []
        lock = threading.Lock()

        def increment_counter():
            """在独立会话中增加计数器"""
            from app.database import SessionLocal
            session = SessionLocal()
            try:
                # 获取当前值
                counter_obj = session.query(Counter).filter_by(name="test").with_for_update().first()

                # 增加
                time.sleep(0.01)  # 模拟处理时间
                counter_obj.value += 1

                session.commit()

                with lock:
                    results.append(counter_obj.value)

            finally:
                session.close()

        # 启动多个线程
        threads = []
        for _ in range(10):
            thread = threading.Thread(target=increment_counter)
            threads.append(thread)
            thread.start()

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        # 验证最终值
        final_counter = db_session.query(Counter).filter_by(name="test").first()
        assert final_counter.value == 10  # 每个线程增加1

    def test_database_isolation_levels(self, db_session: Session):
        """测试数据库隔离级别"""

        # 测试读已提交（Read Committed）
        db_session.connection(execution_options={"isolation_level": "READ COMMITTED"})

        # 测试可重复读（Repeatable Read）
        db_session.connection(execution_options={"isolation_level": "REPEATABLE READ"})

        # 测试序列化（Serializable）
        db_session.connection(execution_options={"isolation_level": "SERIALIZABLE"})

    def test_bulk_operations(self, db_session: Session):
        """测试批量操作"""
        from app.models.user import User
        import uuid

        # 批量插入
        users = []
        for i in range(100):
            users.append({
                "email": f"bulk{i}@example.com",
                "hashed_password": "hashed",
                "full_name": f"User {i}"
            })

        # 使用bulk_insert_mappings提高性能
        db_session.bulk_insert_mappings(User, users)
        db_session.commit()

        # 验证插入
        count = db_session.query(User).filter(
            User.email.like("bulk%@example.com")
        ).count()
        assert count == 100

        # 批量更新
        db_session.query(User).filter(
            User.email.like("bulk%@example.com")
        ).update({"is_active": False})
        db_session.commit()

        # 验证更新
        inactive_count = db_session.query(User).filter(
            User.email.like("bulk%@example.com"),
            User.is_active == False
        ).count()
        assert inactive_count == 100

    def test_query_optimization(self, db_session: Session):
        """测试查询优化"""
        from app.models.user import User
        from app.models.article import Article

        # 创建测试数据
        user = User(
            email="query_test@example.com",
            hashed_password="hashed"
        )
        db_session.add(user)
        db_session.commit()

        for i in range(10):
            article = Article(
                title=f"Article {i}",
                content=f"Content {i}",
                author_id=user.id
            )
            db_session.add(article)

        db_session.commit()

        # 测试N+1问题
        # 不好的写法（N+1查询）
        articles = db_session.query(Article).filter_by(author_id=user.id).all()
        for article in articles:
            # 每次循环都会查询作者（N+1问题）
            author = db_session.query(User).get(article.author_id)

        # 好的写法（使用join）
        articles_with_author = db_session.query(Article, User).join(
            User, Article.author_id == User.id
        ).filter(Article.author_id == user.id).all()

        assert len(articles_with_author) == 10

        # 测试索引使用
        # 解释查询计划
        explain = db_session.execute(
            text("EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = :email"),
            {"email": "query_test@example.com"}
        ).fetchall()

        # 检查是否使用了索引
        explain_str = str(explain).lower()
        assert "scan" in explain_str or "search" in explain_str

    def test_database_migrations(self, db_session: Session):
        """测试数据库迁移"""

        # 验证表结构
        tables = db_session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()

        table_names = [t[0] for t in tables]
        assert "users" in table_names
        assert "articles" in table_names

        # 验证列存在
        columns = db_session.execute(
            text("PRAGMA table_info(users)")
        ).fetchall()

        column_names = [c[1] for c in columns]
        assert "email" in column_names
        assert "hashed_password" in column_names
        assert "created_at" in column_names

    def test_connection_pool(self, db_session: Session):
        """测试连接池"""

        # 获取连接池信息
        pool = db_session.bind.pool

        # 检查连接池配置
        assert pool.size() <= 20  # 最大连接数
        assert pool.checkedin() >= 0
        assert pool.checkedout() >= 0

    def test_database_cleanup(self, db_session: Session):
        """测试数据库清理"""

        # 确保每个测试后数据库是干净的
        tables = db_session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()

        # 删除所有数据（保留表结构）
        for table in tables:
            if table[0] != "sqlite_sequence":  # 跳过自增序列表
                db_session.execute(text(f"DELETE FROM {table[0]}"))

        db_session.commit()

        # 验证表为空
        for table in tables:
            if table[0] != "sqlite_sequence":
                count = db_session.execute(
                    text(f"SELECT COUNT(*) FROM {table[0]}")
                ).scalar()
                assert count == 0

# 数据库工厂fixture
@pytest.fixture
def user_factory(db_session):
    """用户工厂fixture"""
    from app.models.user import User
    import uuid

    def create_user(**kwargs):
        """创建用户"""
        defaults = {
            "email": f"user_{uuid.uuid4().hex[:8]}@example.com",
            "hashed_password": "hashed_password",
            "is_active": True
        }
        defaults.update(kwargs)

        user = User(**defaults)
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        return user

    return create_user

@pytest.fixture
def article_factory(db_session, user_factory):
    """文章工厂fixture"""
    from app.models.article import Article

    def create_article(**kwargs):
        """创建文章"""
        if "author_id" not in kwargs:
            user = user_factory()
            kwargs["author_id"] = user.id

        defaults = {
            "title": f"Test Article {uuid.uuid4().hex[:8]}",
            "content": "Test content",
            "is_published": True
        }
        defaults.update(kwargs)

        article = Article(**defaults)
        db_session.add(article)
        db_session.commit()
        db_session.refresh(article)

        return article

    return create_article

# 使用工厂的测试
def test_with_factories(user_factory, article_factory):
    """使用工厂fixture的测试"""

    # 创建用户
    user = user_factory(
        email="factory@example.com",
        full_name="Factory User"
    )

    assert user.id is not None
    assert user.email == "factory@example.com"

    # 创建文章
    article = article_factory(
        title="Factory Article",
        author_id=user.id
    )

    assert article.id is not None
    assert article.author_id == user.id
    assert article.title == "Factory Article"
```

## 5. 模拟外部依赖

### Mock和Patch高级用法

```python
# tests/test_mocking.py
import pytest
from unittest.mock import Mock, patch, MagicMock, AsyncMock, call, PropertyMock
import requests
from datetime import datetime
import asyncio

class TestMocking:
    """模拟外部依赖测试"""

    def test_basic_mock(self):
        """基础Mock测试"""
        # 创建Mock对象
        mock_service = Mock()

        # 设置返回值
        mock_service.get_data.return_value = {"data": "test"}

        # 调用Mock方法
        result = mock_service.get_data()

        # 验证调用
        assert result == {"data": "test"}
        mock_service.get_data.assert_called_once()

    def test_mock_with_side_effect(self):
        """使用side_effect的Mock"""
        mock_func = Mock()

        # 设置side_effect为函数
        def side_effect_func(x):
            return x * 2

        mock_func.side_effect = side_effect_func

        assert mock_func(5) == 10
        assert mock_func(10) == 20

        # 设置side_effect为异常
        mock_func.side_effect = ValueError("Error occurred")

        with pytest.raises(ValueError):
            mock_func(1)

        # 设置side_effect为序列
        mock_func.side_effect = [1, 2, 3]

        assert mock_func() == 1
        assert mock_func() == 2
        assert mock_func() == 3

        # 后续调用会抛出StopIteration
        with pytest.raises(StopIteration):
            mock_func()

    def test_mock_attributes(self):
        """测试Mock属性"""
        mock_obj = Mock()

        # 设置属性
        mock_obj.name = "Test Object"
        mock_obj.value = 42

        assert mock_obj.name == "Test Object"
        assert mock_obj.value == 42

        # 动态属性
        mock_obj.dynamic_attribute = "dynamic"
        assert mock_obj.dynamic_attribute == "dynamic"

    def test_magic_mock(self):
        """测试MagicMock"""
        magic_mock = MagicMock()

        # MagicMock支持魔术方法
        magic_mock.__len__.return_value = 5
        assert len(magic_mock) == 5

        magic_mock.__getitem__.return_value = "item"
        assert magic_mock[0] == "item"
        assert magic_mock["key"] == "item"

        # 调用验证
        magic_mock.__getitem__.assert_any_call(0)
        magic_mock.__getitem__.assert_any_call("key")

    def test_property_mock(self):
        """测试属性Mock"""
        class MyClass:
            @property
            def value(self):
                return "real value"

        obj = MyClass()

        with patch.object(MyClass, 'value', new_callable=PropertyMock) as mock_prop:
            mock_prop.return_value = "mocked value"

            assert obj.value == "mocked value"
            mock_prop.assert_called_once()

    def test_patch_decorator(self):
        """测试patch装饰器"""

        # 要测试的函数
        def get_external_data():
            import requests
            response = requests.get("https://api.example.com/data")
            return response.json()

        # 使用patch模拟requests.get
        @patch('requests.get')
        def test_get_external_data(mock_get):
            # 设置Mock响应
            mock_response = Mock()
            mock_response.json.return_value = {"data": "mocked"}
            mock_get.return_value = mock_response

            # 调用被测试函数
            result = get_external_data()

            # 验证
            assert result == {"data": "mocked"}
            mock_get.assert_called_once_with("https://api.example.com/data")

        test_get_external_data()

    def test_patch_context_manager(self):
        """测试patch上下文管理器"""

        # 使用上下文管理器
        with patch('datetime.datetime') as mock_datetime:
            # 设置now()返回固定时间
            fixed_time = datetime(2023, 1, 1, 12, 0, 0)
            mock_datetime.now.return_value = fixed_time

            # 在上下文中，datetime.now()返回模拟值
            now = datetime.now()
            assert now == fixed_time

        # 上下文外，datetime.now()恢复正常
        assert datetime.now() != fixed_time

    def test_patch_multiple(self):
        """测试同时patch多个对象"""

        def complex_function():
            import requests
            import time

            data = requests.get("https://api.example.com/data").json()
            time.sleep(1)  # 模拟处理时间
            return data

        with patch('requests.get') as mock_get, \
             patch('time.sleep') as mock_sleep:

            mock_response = Mock()
            mock_response.json.return_value = {"result": "success"}
            mock_get.return_value = mock_response

            result = complex_function()

            assert result == {"result": "success"}
            mock_get.assert_called_once()
            mock_sleep.assert_called_once_with(1)

    def test_async_mock(self):
        """测试异步Mock"""

        async_mock = AsyncMock()

        # 设置异步方法的返回值
        async_mock.fetch_data.return_value = {"data": "async"}

        async def test_async():
            result = await async_mock.fetch_data()
            return result

        # 运行异步测试
        import asyncio
        result = asyncio.run(test_async())

        assert result == {"data": "async"}
        async_mock.fetch_data.assert_awaited_once()

    def test_mock_call_args(self):
        """测试调用参数验证"""
        mock_func = Mock()

        # 调用多次
        mock_func(1, 2, 3)
        mock_func(a=1, b=2)
        mock_func(1, b=2)

        # 验证调用
        assert mock_func.call_count == 3

        # 获取所有调用
        calls = mock_func.call_args_list
        assert len(calls) == 3

        # 验证特定调用
        mock_func.assert_any_call(1, 2, 3)
        mock_func.assert_any_call(a=1, b=2)

        # 验证最后一次调用
        mock_func.assert_called_with(1, b=2)

    def test_mock_reset(self):
        """测试重置Mock"""
        mock_obj = Mock()

        mock_obj.method()
        mock_obj.another_method()

        assert mock_obj.method.call_count == 1
        assert mock_obj.another_method.call_count == 1

        # 重置Mock
        mock_obj.reset_mock()

        assert mock_obj.method.call_count == 0
        assert mock_obj.another_method.call_count == 0

    def test_patch_object(self):
        """测试patch.object"""

        class RealClass:
            def method(self):
                return "real"

        obj = RealClass()

        # 替换对象的方法
        with patch.object(obj, 'method', return_value="mocked"):
            assert obj.method() == "mocked"

        # 方法恢复
        assert obj.method() == "real"

    def test_patch_dict(self):
        """测试patch.dict"""

        config = {"host": "localhost", "port": 8080}

        # 临时修改字典
        with patch.dict(config, {"port": 9000, "debug": True}, clear=False):
            assert config["host"] == "localhost"  # 保留原值
            assert config["port"] == 9000  # 修改的值
            assert config["debug"] == True  # 新增的值

        # 恢复原状
        assert config == {"host": "localhost", "port": 8080}

        # 使用clear=True清空字典
        with patch.dict(config, {"new": "value"}, clear=True):
            assert config == {"new": "value"}

        assert config == {"host": "localhost", "port": 8080}

# 实际场景：测试外部API调用
class TestExternalAPI:
    """测试外部API调用"""

    @pytest.fixture
    def mock_requests(self):
        """模拟requests模块"""
        with patch('requests.get') as mock_get:
            yield mock_get

    def test_fetch_user_data(self, mock_requests):
        """测试获取用户数据"""
        from app.services.external import fetch_user_data

        # 设置Mock响应
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": 1,
            "name": "John Doe",
            "email": "john@example.com"
        }
        mock_requests.return_value = mock_response

        # 调用被测试函数
        user_data = fetch_user_data(1)

        # 验证
        assert user_data["id"] == 1
        assert user_data["name"] == "John Doe"
        mock_requests.assert_called_once_with(
            "https://api.external.com/users/1",
            timeout=10
        )

    def test_fetch_user_data_error(self, mock_requests):
        """测试获取用户数据错误"""
        from app.services.external import fetch_user_data

        # 模拟请求异常
        mock_requests.side_effect = requests.exceptions.Timeout("Request timeout")

        # 验证异常处理
        with pytest.raises(requests.exceptions.Timeout):
            fetch_user_data(1)

    def test_fetch_user_data_not_found(self, mock_requests):
        """测试用户不存在"""
        from app.services.external import fetch_user_data

        # 模拟404响应
        mock_response = Mock()
        mock_response.status_code = 404
        mock_requests.return_value = mock_response

        user_data = fetch_user_data(999)

        assert user_data is None

# 测试数据库依赖
class TestDatabaseDependencies:
    """测试数据库依赖"""

    @pytest.fixture
    def mock_db_session(self):
        """模拟数据库会话"""
        with patch('app.database.get_db') as mock_get_db:
            mock_session = Mock()
            mock_get_db.return_value = mock_session
            yield mock_session

    def test_user_service(self, mock_db_session):
        """测试用户服务"""
        from app.services.user import UserService

        # 设置Mock查询
        mock_user = Mock()
        mock_user.id = 1
        mock_user.email = "test@example.com"

        mock_query = Mock()
        mock_query.filter_by.return_value.first.return_value = mock_user
        mock_db_session.query.return_value = mock_query

        # 测试服务方法
        service = UserService(mock_db_session)
        user = service.get_user_by_email("test@example.com")

        # 验证
        assert user.id == 1
        assert user.email == "test@example.com"

        # 验证数据库调用
        mock_db_session.query.assert_called_once()
        mock_query.filter_by.assert_called_once_with(email="test@example.com")

# 测试第三方服务
class TestThirdPartyServices:
    """测试第三方服务"""

    def test_email_service(self):
        """测试邮件服务"""
        with patch('smtplib.SMTP') as mock_smtp:
            # 设置Mock
            mock_server = Mock()
            mock_smtp.return_value.__enter__.return_value = mock_server

            from app.services.email import send_email

            # 发送邮件
            send_email(
                to="recipient@example.com",
                subject="Test",
                body="Test email"
            )

            # 验证SMTP调用
            mock_smtp.assert_called_once_with('smtp.gmail.com', 587)
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once()
            mock_server.sendmail.assert_called_once()

    def test_payment_gateway(self):
        """测试支付网关"""
        with patch('app.services.payment.stripe.Charge.create') as mock_charge:
            # 设置Mock响应
            mock_charge.return_value = {
                'id': 'ch_123',
                'amount': 1000,
                'status': 'succeeded'
            }

            from app.services.payment import process_payment

            result = process_payment(
                token="tok_123",
                amount=1000,
                currency="usd"
            )

            assert result['status'] == 'succeeded'
            mock_charge.assert_called_once_with(
                amount=1000,
                currency='usd',
                source='tok_123',
                description='Payment'
            )

    def test_cache_service(self):
        """测试缓存服务"""
        with patch('redis.Redis') as mock_redis_class:
            mock_redis = Mock()
            mock_redis_class.return_value = mock_redis

            from app.services.cache import CacheService

            cache = CacheService()

            # 测试设置缓存
            mock_redis.set.return_value = True
            result = cache.set("key", "value", 3600)
            assert result is True
            mock_redis.set.assert_called_once_with("key", "value", ex=3600)

            # 测试获取缓存
            mock_redis.get.return_value = b"cached value"
            value = cache.get("key")
            assert value == "cached value"
            mock_redis.get.assert_called_once_with("key")

            # 测试缓存未命中
            mock_redis.get.return_value = None
            value = cache.get("nonexistent")
            assert value is None

# 测试文件系统操作
class TestFileSystem:
    """测试文件系统操作"""

    def test_file_operations(self, tmp_path):
        """测试文件操作"""
        import os
        import shutil

        # 创建临时目录
        test_dir = tmp_path / "test_dir"
        test_dir.mkdir()

        test_file = test_dir / "test.txt"
        test_file.write_text("Hello, World!")

        # 测试文件存在
        assert test_file.exists()
        assert test_file.read_text() == "Hello, World!"

        # 测试文件操作
        from app.services.file import FileService

        service = FileService()

        # 使用patch模拟os.path.getsize
        with patch('os.path.getsize', return_value=13):
            size = service.get_file_size(str(test_file))
            assert size == 13

        # 使用patch模拟shutil.copy
        with patch('shutil.copy') as mock_copy:
            dest_file = test_dir / "copy.txt"
            service.copy_file(str(test_file), str(dest_file))
            mock_copy.assert_called_once_with(str(test_file), str(dest_file))

    def test_temp_files(self):
        """测试临时文件"""
        from tempfile import NamedTemporaryFile

        # 使用NamedTemporaryFile创建临时文件
        with NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("Temporary content")
            temp_path = f.name

        # 验证文件内容
        with open(temp_path, 'r') as f:
            content = f.read()
            assert content == "Temporary content"

        # 清理
        import os
        os.unlink(temp_path)
        assert not os.path.exists(temp_path)

# 集成测试：模拟多个外部依赖
class TestIntegrationWithMocks:
    """使用Mock的集成测试"""

    def test_complete_order_flow(self):
        """测试完整订单流程"""
        with patch('app.services.payment.process_payment') as mock_payment, \
             patch('app.services.inventory.check_stock') as mock_stock, \
             patch('app.services.email.send_order_confirmation') as mock_email, \
             patch('app.services.shipping.create_shipment') as mock_shipping:

            # 设置Mock返回值
            mock_stock.return_value = True  # 有库存
            mock_payment.return_value = {'status': 'succeeded', 'id': 'pay_123'}
            mock_shipping.return_value = {'tracking_number': 'TRK123'}

            from app.services.order import OrderService

            service = OrderService()
            result = service.process_order({
                'user_id': 1,
                'items': [{'product_id': 101, 'quantity': 2}],
                'shipping_address': '123 Main St'
            })

            # 验证结果
            assert result['success'] is True
            assert 'order_id' in result
            assert 'payment_id' in result
            assert 'tracking_number' in result

            # 验证服务调用顺序
            assert mock_stock.called
            assert mock_payment.called
            assert mock_shipping.called
            assert mock_email.called

            # 验证调用参数
            mock_payment.assert_called_once()
            mock_shipping.assert_called_once_with(
                address='123 Main St',
                items=[{'product_id': 101, 'quantity': 2}]
            )
```

## 6. 性能测试：Locust实战

### Locust性能测试框架

```python
# locustfile.py - FastAPI性能测试
from locust import HttpUser, task, between, TaskSet, events
from locust.runners import MasterRunner, WorkerRunner
import random
import json
from datetime import datetime

# 自定义事件监听器
@events.init.add_listener
def on_locust_init(environment, **kwargs):
    """Locust初始化事件"""
    print(f"Locust初始化: {environment.host}")

    if isinstance(environment.runner, MasterRunner):
        print("运行在Master模式")
    elif isinstance(environment.runner, WorkerRunner):
        print("运行在Worker模式")
    else:
        print("运行在独立模式")

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """测试开始事件"""
    print(f"测试开始: {datetime.now()}")

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """测试结束事件"""
    print(f"测试结束: {datetime.now()}")

# 自定义度量
from locust import stats
stats.CSV_STATS_INTERVAL_SEC = 5  # CSV统计间隔
stats.CURRENT_RESPONSE_TIME_PERCENTILE_WINDOW = 10  # 响应时间百分位窗口

# 基础测试类
class FastAPIUser(HttpUser):
    """FastAPI用户基类"""
    wait_time = between(1, 3)  # 请求间隔1-3秒
    host = "http://localhost:8000"

    def on_start(self):
        """用户启动时执行"""
        self.auth_token = None
        self.user_id = None
        self.login()

    def on_stop(self):
        """用户停止时执行"""
        self.logout()

    def login(self):
        """登录"""
        response = self.client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })

        if response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("access_token")
            self.user_id = data.get("user_id")
            self.headers = {"Authorization": f"Bearer {self.auth_token}"}

    def logout(self):
        """登出"""
        if self.auth_token:
            self.client.post("/api/auth/logout", headers=self.headers)

# API端点测试
class APITests(TaskSet):
    """API端点测试集"""

    @task(3)  # 权重3，更频繁执行
    def get_public_data(self):
        """获取公开数据"""
        with self.client.get("/api/public/data", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"获取公开数据失败: {response.status_code}")

    @task(2)
    def get_user_profile(self):
        """获取用户资料"""
        if hasattr(self.user, 'headers'):
            self.client.get("/api/users/me", headers=self.user.headers)

    @task(1)
    def create_item(self):
        """创建项目"""
        if hasattr(self.user, 'headers'):
            item_data = {
                "name": f"Item_{random.randint(1, 1000)}",
                "description": "Test item",
                "price": random.uniform(10, 1000)
            }

            with self.client.post(
                "/api/items",
                json=item_data,
                headers=self.user.headers,
                catch_response=True
            ) as response:
                if response.status_code == 201:
                    response.success()
                else:
                    response.failure(f"创建项目失败: {response.status_code}")

    @task(1)
    def update_item(self):
        """更新项目"""
        if hasattr(self.user, 'headers'):
            item_id = random.randint(1, 100)
            update_data = {
                "name": f"Updated_{random.randint(1, 1000)}",
                "price": random.uniform(10, 1000)
            }

            self.client.put(
                f"/api/items/{item_id}",
                json=update_data,
                headers=self.user.headers
            )

# 数据库操作测试
class DatabaseTests(TaskSet):
    """数据库操作测试集"""

    @task(5)
    def simple_query(self):
        """简单查询"""
        self.client.get("/api/db/simple-query")

    @task(3)
    def complex_query(self):
        """复杂查询"""
        self.client.get("/api/db/complex-query")

    @task(2)
    def write_operation(self):
        """写操作"""
        data = {
            "data": f"test_{random.randint(1, 10000)}",
            "value": random.randint(1, 100)
        }
        self.client.post("/api/db/write", json=data)

    @task(1)
    def transaction_test(self):
        """事务测试"""
        self.client.post("/api/db/transaction")

# WebSocket测试
class WebSocketTests(TaskSet):
    """WebSocket测试集"""

    @task
    def websocket_chat(self):
        """WebSocket聊天测试"""
        import websocket
        import threading
        import time

        ws_url = self.user.host.replace("http", "ws") + "/ws/chat"

        def on_message(ws, message):
            print(f"收到消息: {message}")

        def on_error(ws, error):
            print(f"WebSocket错误: {error}")

        def on_close(ws, close_status_code, close_msg):
            print(f"WebSocket关闭: {close_status_code} - {close_msg}")

        def on_open(ws):
            print("WebSocket连接已打开")
            # 发送测试消息
            ws.send(json.dumps({
                "type": "message",
                "content": f"Hello from Locust {random.randint(1, 100)}",
                "timestamp": datetime.now().isoformat()
            }))

        # 创建WebSocket连接
        ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )

        # 在新线程中运行WebSocket
        wst = threading.Thread(target=ws.run_forever)
        wst.daemon = True
        wst.start()

        # 保持连接一段时间
        time.sleep(5)

        # 关闭连接
        ws.close()

# 完整用户模拟
class RegularUser(FastAPIUser):
    """普通用户"""
    tasks = [APITests, DatabaseTests]
    weight = 3  # 权重，出现频率

class PowerUser(FastAPIUser):
    """高级用户"""
    tasks = [APITests, DatabaseTests, WebSocketTests]
    weight = 1

# 自定义负载形状
from locust import LoadTestShape

class CustomLoadShape(LoadTestShape):
    """自定义负载形状"""

    stages = [
        {"duration": 60, "users": 10, "spawn_rate": 10},   # 第1分钟：10用户
        {"duration": 120, "users": 50, "spawn_rate": 5},   # 第2-3分钟：50用户
        {"duration": 180, "users": 100, "spawn_rate": 10}, # 第3-6分钟：100用户
        {"duration": 240, "users": 50, "spawn_rate": 5},   # 第6-8分钟：50用户
        {"duration": 300, "users": 10, "spawn_rate": 10},  # 第8-10分钟：10用户
    ]

    def tick(self):
        """返回当前阶段的用户数和生成率"""
        run_time = self.get_run_time()

        for stage in self.stages:
            if run_time < stage["duration"]:
                return (stage["users"], stage["spawn_rate"])

        return None  # 测试结束

# 自定义用户等待时间
class RandomWaitUser(HttpUser):
    """随机等待用户"""

    @property
    def wait_time(self):
        """动态等待时间"""
        import random
        # 90%的请求等待1-2秒，10%的请求等待5-10秒
        if random.random() < 0.9:
            return random.uniform(1, 2)
        else:
            return random.uniform(5, 10)

# 分布式测试配置
"""
# 主节点启动命令
locust -f locustfile.py --master --host=http://localhost:8000

# 工作节点启动命令
locust -f locustfile.py --worker --master-host=192.168.1.100

# Web界面
locust -f locustfile.py --web-host=0.0.0.0 --web-port=8089
"""

# 命令行运行
"""
# 无Web界面运行测试
locust -f locustfile.py --headless -u 100 -r 10 -t 5m

# 参数说明：
# --headless: 无头模式
# -u: 用户数
# -r: 生成率（每秒生成用户数）
# -t: 测试时间
# --csv: 保存CSV结果
# --html: 生成HTML报告
"""

# 测试结果分析
class TestResultAnalyzer:
    """测试结果分析器"""

    @staticmethod
    def analyze_csv(csv_file):
        """分析CSV结果文件"""
        import pandas as pd

        df = pd.read_csv(csv_file)

        print("测试结果分析:")
        print(f"总请求数: {df['Request Count'].sum()}")
        print(f"失败请求数: {df['Failure Count'].sum()}")
        print(f"平均响应时间: {df['Average Response Time'].mean():.2f}ms")
        print(f"95%响应时间: {df['95%'].max():.2f}ms")
        print(f"最大响应时间: {df['Max Response Time'].max():.2f}ms")

        # 请求率
        total_time = df['Total Average Response Time'].max() / 1000  # 秒
        total_requests = df['Request Count'].sum()
        rps = total_requests / total_time if total_time > 0 else 0
        print(f"平均RPS: {rps:.2f}")

        return df

    @staticmethod
    def generate_report(df, output_file="performance_report.md"):
        """生成性能报告"""
        with open(output_file, "w") as f:
            f.write("# 性能测试报告\n\n")
            f.write(f"生成时间: {datetime.now()}\n\n")

            f.write("## 总体统计\n")
            f.write(f"- 总请求数: {df['Request Count'].sum()}\n")
            f.write(f"- 失败请求数: {df['Failure Count'].sum()}\n")
            f.write(f"- 失败率: {df['Failure Count'].sum()/df['Request Count'].sum()*100:.2f}%\n")
            f.write(f"- 平均响应时间: {df['Average Response Time'].mean():.2f}ms\n")
            f.write(f"- 95%响应时间: {df['95%'].max():.2f}ms\n\n")

            f.write("## 端点性能\n")
            for endpoint in df['Name'].unique():
                endpoint_data = df[df['Name'] == endpoint]
                f.write(f"### {endpoint}\n")
                f.write(f"- 请求数: {endpoint_data['Request Count'].sum()}\n")
                f.write(f"- 平均响应时间: {endpoint_data['Average Response Time'].mean():.2f}ms\n")
                f.write(f"- 失败率: {endpoint_data['Failure Count'].sum()/endpoint_data['Request Count'].sum()*100:.2f}%\n\n")

            f.write("## 建议\n")
            if df['Failure Count'].sum() > 0:
                f.write("1. 存在失败请求，需要检查API稳定性\n")
            if df['95%'].max() > 1000:  # 超过1秒
                f.write("2. 部分端点响应时间较长，需要优化\n")
            if df['Average Response Time'].mean() > 500:  # 平均超过500ms
                f.write("3. 整体响应时间偏高，建议进行性能优化\n")
```

### 性能测试实战

```python
# tests/performance/test_api_performance.py
import pytest
import time
import statistics
from locust import HttpUser, task, between, events
from locust.env import Environment
from locust.stats import stats_history, StatsEntry
import pandas as pd
from datetime import datetime

class PerformanceTestSuite:
    """性能测试套件"""

    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.results = {}

    def run_single_endpoint_test(self, endpoint, method="GET", payload=None):
        """运行单端点性能测试"""

        class SingleEndpointUser(HttpUser):
            host = self.base_url
            wait_time = between(0.1, 0.5)

            @task
            def test_endpoint(self):
                if method == "GET":
                    self.client.get(endpoint)
                elif method == "POST":
                    self.client.post(endpoint, json=payload)
                elif method == "PUT":
                    self.client.put(endpoint, json=payload)
                elif method == "DELETE":
                    self.client.delete(endpoint)

        # 创建测试环境
        env = Environment(user_classes=[SingleEndpointUser], host=self.base_url)
        env.create_local_runner()

        # 启动测试
        env.runner.start(10, spawn_rate=10)  # 10个用户，每秒生成10个
        time.sleep(30)  # 运行30秒
        env.runner.stop()

        # 收集结果
        stats = env.stats
        endpoint_stats = stats.get(endpoint, "GET")

        if endpoint_stats:
            self.results[endpoint] = {
                "requests": endpoint_stats.num_requests,
                "failures": endpoint_stats.num_failures,
                "avg_response_time": endpoint_stats.avg_response_time,
                "median_response_time": endpoint_stats.median_response_time,
                "min_response_time": endpoint_stats.min_response_time,
                "max_response_time": endpoint_stats.max_response_time,
                "requests_per_second": endpoint_stats.total_rps,
                "failure_rate": endpoint_stats.fail_ratio,
            }

        return self.results.get(endpoint)

    def run_load_test(self, user_count=100, duration=300):
        """运行负载测试"""

        class LoadTestUser(HttpUser):
            host = self.base_url
            wait_time = between(1, 3)

            @task(5)
            def get_public_data(self):
                self.client.get("/api/public/data")

            @task(3)
            def get_users(self):
                self.client.get("/api/users")

            @task(2)
            def create_item(self):
                self.client.post("/api/items", json={
                    "name": "Test Item",
                    "description": "Performance test item"
                })

            @task(1)
            def heavy_computation(self):
                self.client.get("/api/compute-heavy")

        # 创建测试环境
        env = Environment(user_classes=[LoadTestUser], host=self.base_url)
        env.create_local_runner()

        # 设置测试数据收集
        test_data = []

        @events.request.add_listener
        def on_request(request_type, name, response_time, response_length, exception, **kwargs):
            test_data.append({
                "timestamp": datetime.now(),
                "request_type": request_type,
                "endpoint": name,
                "response_time": response_time,
                "response_length": response_length,
                "exception": exception
            })

        # 启动测试
        print(f"开始负载测试: {user_count}用户, {duration}秒")
        env.runner.start(user_count, spawn_rate=10)
        time.sleep(duration)
        env.runner.stop()

        # 分析结果
        df = pd.DataFrame(test_data)

        overall_stats = {
            "total_requests": len(df),
            "failed_requests": df['exception'].notna().sum(),
            "failure_rate": df['exception'].notna().sum() / len(df) * 100,
            "avg_response_time": df['response_time'].mean(),
            "median_response_time": df['response_time'].median(),
            "p95_response_time": df['response_time'].quantile(0.95),
            "p99_response_time": df['response_time'].quantile(0.99),
            "requests_per_second": len(df) / duration,
        }

        # 按端点统计
        endpoint_stats = {}
        for endpoint in df['endpoint'].unique():
            endpoint_df = df[df['endpoint'] == endpoint]
            endpoint_stats[endpoint] = {
                "requests": len(endpoint_df),
                "failures": endpoint_df['exception'].notna().sum(),
                "avg_response_time": endpoint_df['response_time'].mean(),
                "p95_response_time": endpoint_df['response_time'].quantile(0.95),
            }

        return {
            "overall": overall_stats,
            "endpoints": endpoint_stats,
            "raw_data": df
        }

    def run_stress_test(self, ramp_up_users=50, max_users=500, duration=600):
        """运行压力测试"""

        class StressTestUser(HttpUser):
            host = self.base_url
            wait_time = between(0.5, 1.5)

            @task(10)
            def light_endpoint(self):
                self.client.get("/api/light")

            @task(5)
            def medium_endpoint(self):
                self.client.get("/api/medium")

            @task(1)
            def heavy_endpoint(self):
                self.client.get("/api/heavy")

        env = Environment(user_classes=[StressTestUser], host=self.base_url)
        env.create_local_runner()

        # 逐步增加负载
        results = []

        current_users = ramp_up_users
        while current_users <= max_users:
            print(f"当前用户数: {current_users}")

            env.runner.start(current_users, spawn_rate=100)
            time.sleep(60)  # 每个级别运行60秒
            env.runner.stop()

            # 收集该级别的结果
            stats = env.stats
            total_requests = sum(s.num_requests for s in stats.values())
            total_failures = sum(s.num_failures for s in stats.values())
            avg_response_time = statistics.mean(
                [s.avg_response_time for s in stats.values() if s.num_requests > 0]
            ) if any(s.num_requests > 0 for s in stats.values()) else 0

            results.append({
                "users": current_users,
                "requests": total_requests,
                "failures": total_failures,
                "failure_rate": total_failures / total_requests * 100 if total_requests > 0 else 0,
                "avg_response_time": avg_response_time,
                "rps": total_requests / 60,  # 每秒请求数
            })

            # 增加用户数
            current_users += ramp_up_users

        return results

    def run_endurance_test(self, user_count=100, duration=3600):
        """运行耐力测试（1小时）"""

        class EnduranceTestUser(HttpUser):
            host = self.base_url
            wait_time = between(2, 5)  # 较长的等待时间，模拟真实用户

            @task(3)
            def browse_data(self):
                self.client.get("/api/data")

            @task(1)
            def submit_form(self):
                self.client.post("/api/submit", json={
                    "field1": "value1",
                    "field2": "value2"
                })

        env = Environment(user_classes=[EnduranceTestUser], host=self.base_url)
        env.create_local_runner()

        # 每小时记录一次统计
        hourly_stats = []

        def collect_hourly_stats():
            for i in range(int(duration / 3600)):
                time.sleep(3600)  # 等待1小时

                stats = env.stats
                current_stats = {
                    "hour": i + 1,
                    "total_requests": sum(s.num_requests for s in stats.values()),
                    "total_failures": sum(s.num_failures for s in stats.values()),
                    "memory_usage": self._get_memory_usage(),
                }
                hourly_stats.append(current_stats)
                print(f"第{i+1}小时统计: {current_stats}")

        # 在后台线程中收集统计
        import threading
        stats_thread = threading.Thread(target=collect_hourly_stats)
        stats_thread.daemon = True
        stats_thread.start()

        # 启动测试
        env.runner.start(user_count, spawn_rate=10)
        time.sleep(duration)
        env.runner.stop()

        return hourly_stats

    def _get_memory_usage(self):
        """获取内存使用情况"""
        import psutil
        import os

        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024  # MB

    def generate_performance_report(self, test_results, output_file="performance_report.html"):
        """生成性能测试报告"""
        from jinja2 import Template

        template_str = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>性能测试报告</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .metric { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
                .good { background-color: #d4edda; }
                .warning { background-color: #fff3cd; }
                .critical { background-color: #f8d7da; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>
            <h1>性能测试报告</h1>
            <p>生成时间: {{ timestamp }}</p>

            <h2>总体性能指标</h2>
            <div class="metric {{ 'good' if overall.failure_rate < 1 else 'warning' if overall.failure_rate < 5 else 'critical' }}">
                <h3>失败率: {{ overall.failure_rate|round(2) }}%</h3>
                <p>总请求数: {{ overall.total_requests }}</p>
                <p>失败请求数: {{ overall.failed_requests }}</p>
            </div>

            <div class="metric {{ 'good' if overall.avg_response_time < 100 else 'warning' if overall.avg_response_time < 500 else 'critical' }}">
                <h3>响应时间</h3>
                <p>平均响应时间: {{ overall.avg_response_time|round(2) }}ms</p>
                <p>中位数响应时间: {{ overall.median_response_time|round(2) }}ms</p>
                <p>P95响应时间: {{ overall.p95_response_time|round(2) }}ms</p>
                <p>P99响应时间: {{ overall.p99_response_time|round(2) }}ms</p>
            </div>

            <div class="metric">
                <h3>吞吐量</h3>
                <p>平均RPS: {{ overall.requests_per_second|round(2) }}</p>
            </div>

            <h2>端点性能详情</h2>
            <table>
                <tr>
                    <th>端点</th>
                    <th>请求数</th>
                    <th>失败数</th>
                    <th>失败率</th>
                    <th>平均响应时间</th>
                    <th>P95响应时间</th>
                </tr>
                {% for endpoint, stats in endpoints.items() %}
                <tr>
                    <td>{{ endpoint }}</td>
                    <td>{{ stats.requests }}</td>
                    <td>{{ stats.failures }}</td>
                    <td>{{ (stats.failures / stats.requests * 100)|round(2) if stats.requests > 0 else 0 }}%</td>
                    <td>{{ stats.avg_response_time|round(2) }}ms</td>
                    <td>{{ stats.p95_response_time|round(2) }}ms</td>
                </tr>
                {% endfor %}
            </table>

            <h2>建议</h2>
            <ul>
                {% if overall.failure_rate > 5 %}
                <li style="color: red;">失败率超过5%，需要立即调查并修复</li>
                {% elif overall.failure_rate > 1 %}
                <li style="color: orange;">失败率超过1%，建议调查原因</li>
                {% else %}
                <li style="color: green;">失败率在可接受范围内</li>
                {% endif %}

                {% if overall.p95_response_time > 1000 %}
                <li style="color: red;">P95响应时间超过1秒，需要优化性能</li>
                {% elif overall.p95_response_time > 500 %}
                <li style="color: orange;">P95响应时间超过500ms，建议优化</li>
                {% else %}
                <li style="color: green;">响应时间性能良好</li>
                {% endif %}
            </ul>
        </body>
        </html>
        """

        template = Template(template_str)
        html = template.render(
            timestamp=datetime.now().isoformat(),
            overall=test_results.get("overall", {}),
            endpoints=test_results.get("endpoints", {})
        )

        with open(output_file, "w") as f:
            f.write(html)

        print(f"性能报告已生成: {output_file}")

# Pytest集成性能测试
@pytest.mark.performance
class TestAPIPerformance:
    """API性能测试"""

    @pytest.fixture(scope="class")
    def perf_tester(self):
        """性能测试器fixture"""
        return PerformanceTestSuite("http://localhost:8000")

    def test_single_endpoint_performance(self, perf_tester):
        """测试单端点性能"""

        endpoints = [
            ("/api/public/data", "GET"),
            ("/api/users", "GET"),
            ("/api/items", "GET"),
        ]

        results = {}
        for endpoint, method in endpoints:
            result = perf_tester.run_single_endpoint_test(endpoint, method)
            results[endpoint] = result

            # 断言性能要求
            assert result["avg_response_time"] < 200, f"{endpoint}响应时间过长"
            assert result["failure_rate"] < 1, f"{endpoint}失败率过高"

        return results

    @pytest.mark.slow
    def test_load_performance(self, perf_tester):
        """测试负载性能"""

        result = perf_tester.run_load_test(user_count=100, duration=60)

        # 性能断言
        overall = result["overall"]

        assert overall["failure_rate"] < 5, f"失败率过高: {overall['failure_rate']}%"
        assert overall["avg_response_time"] < 500, f"平均响应时间过长: {overall['avg_response_time']}ms"
        assert overall["p95_response_time"] < 1000, f"P95响应时间过长: {overall['p95_response_time']}ms"

        # 生成报告
        perf_tester.generate_performance_report(result)

        return result

    @pytest.mark.stress
    def test_stress_performance(self, perf_tester):
        """测试压力性能"""

        results = perf_tester.run_stress_test(
            ramp_up_users=50,
            max_users=500,
            duration=300
        )

        # 分析压力测试结果
        failure_rates = [r["failure_rate"] for r in results]
        response_times = [r["avg_response_time"] for r in results]

        # 断言在最大负载下性能可接受
        max_load_result = results[-1]
        assert max_load_result["failure_rate"] < 10, "高负载下失败率过高"
        assert max_load_result["avg_response_time"] < 1000, "高负载下响应时间过长"

        return results

    @pytest.mark.endurance
    def test_endurance_performance(self, perf_tester):
        """测试耐力性能"""

        results = perf_tester.run_endurance_test(
            user_count=50,
            duration=7200  # 2小时
        )

        # 验证性能稳定性
        failure_rates = [r.get("failure_rate", 0) for r in results]
        avg_failure_rate = statistics.mean(failure_rates)

        assert avg_failure_rate < 2, "耐力测试期间平均失败率过高"

        # 检查内存泄漏
        memory_usage = [r.get("memory_usage", 0) for r in results]
        if len(memory_usage) > 1:
            memory_growth = (memory_usage[-1] - memory_usage[0]) / memory_usage[0]
            assert memory_growth < 0.5, "可能存在内存泄漏"

        return results

# 基准测试
@pytest.mark.benchmark
class TestBenchmark:
    """基准测试"""

    @pytest.mark.parametrize("concurrent_users", [1, 10, 50, 100])
    def test_concurrent_users_benchmark(self, concurrent_users):
        """并发用户基准测试"""

        tester = PerformanceTestSuite()
        result = tester.run_load_test(
            user_count=concurrent_users,
            duration=30
        )

        overall = result["overall"]

        print(f"\n并发用户数: {concurrent_users}")
        print(f"平均RPS: {overall['requests_per_second']:.2f}")
        print(f"平均响应时间: {overall['avg_response_time']:.2f}ms")
        print(f"P95响应时间: {overall['p95_response_time']:.2f}ms")

        # 基准要求
        if concurrent_users <= 10:
            assert overall["avg_response_time"] < 100
        elif concurrent_users <= 50:
            assert overall["avg_response_time"] < 300
        else:
            assert overall["avg_response_time"] < 500

        return overall

    def test_comparison_benchmark(self):
        """对比基准测试"""

        # 测试不同配置的性能
        configurations = [
            {"name": "默认配置", "url": "http://localhost:8000"},
            {"name": "优化配置", "url": "http://localhost:8001"},
            {"name": "生产配置", "url": "http://localhost:8002"},
        ]

        results = {}
        for config in configurations:
            tester = PerformanceTestSuite(config["url"])
            result = tester.run_load_test(user_count=50, duration=60)
            results[config["name"]] = result["overall"]

        # 生成对比报告
        self._generate_comparison_report(results)

        return results

    def _generate_comparison_report(self, results):
        """生成对比报告"""
        import matplotlib.pyplot as plt

        # 创建对比图表
        fig, axes = plt.subplots(2, 2, figsize=(12, 10))

        # 响应时间对比
        config_names = list(results.keys())
        avg_response_times = [r["avg_response_time"] for r in results.values()]
        p95_response_times = [r["p95_response_time"] for r in results.values()]

        axes[0, 0].bar(config_names, avg_response_times)
        axes[0, 0].set_title("平均响应时间对比")
        axes[0, 0].set_ylabel("毫秒")

        axes[0, 1].bar(config_names, p95_response_times)
        axes[0, 1].set_title("P95响应时间对比")
        axes[0, 1].set_ylabel("毫秒")

        # 吞吐量对比
        rps_values = [r["requests_per_second"] for r in results.values()]
        axes[1, 0].bar(config_names, rps_values)
        axes[1, 0].set_title("吞吐量对比")
        axes[1, 0].set_ylabel("RPS")

        # 失败率对比
        failure_rates = [r["failure_rate"] for r in results.values()]
        axes[1, 1].bar(config_names, failure_rates)
        axes[1, 1].set_title("失败率对比")
        axes[1, 1].set_ylabel("百分比")

        plt.tight_layout()
        plt.savefig("performance_comparison.png")
        plt.close()

        print("对比报告已生成: performance_comparison.png")
```

## 7. 测试覆盖率与CI集成

### 测试覆盖率分析

```python
# .coveragerc - 覆盖率配置文件
[run]
# 要测量的源文件路径
source = app

# 要忽略的文件
omit =
    app/migrations/*
    app/tests/*
    */__pycache__/*
    */site-packages/*

# 分支覆盖率
branch = True

# 并行运行
parallel = True

# 数据文件位置
data_file = .coverage

[report]
# 显示哪些行未覆盖
show_missing = True

# 忽略哪些文件
exclude_lines =
    # 忽略pragma: no cover
    pragma: no cover

    # 忽略类型定义
    def __repr__
    def __str__

    # 忽略测试代码
    if __name__ == .__main__.:

    # 忽略抽象方法
    @abstractmethod

    # 忽略调试代码
    import pdb
    pdb.set_trace

    # 忽略日志语句
    logger\.(debug|info|warning|error|critical)

# 覆盖率阈值
fail_under = 80

# 输出格式
format = markdown

[html]
# HTML报告目录
directory = coverage_html

# 标题
title = FastAPI Test Coverage Report

# 显示哪些文件
show_contexts = True

[json]
# JSON报告文件
output = coverage.json

[xml]
# XML报告文件（用于CI集成）
output = coverage.xml

# pytest-cov命令行使用
"""
# 基本用法
pytest --cov=app tests/

# 包含分支覆盖率
pytest --cov=app --cov-branch tests/

# 生成HTML报告
pytest --cov=app --cov-report=html tests/

# 生成多种格式报告
pytest --cov=app --cov-report=term --cov-report=html --cov-report=xml tests/

# 设置覆盖率阈值
pytest --cov=app --cov-fail-under=80 tests/

# 并行运行
pytest --cov=app -n auto tests/
"""

# 覆盖率分析工具
import coverage
import json
from pathlib import Path

class CoverageAnalyzer:
    """覆盖率分析器"""

    def __init__(self, source_dir="app", coverage_file=".coverage"):
        self.source_dir = Path(source_dir)
        self.coverage_file = coverage_file
        self.cov = coverage.Coverage(
            source=[str(self.source_dir)],
            data_file=coverage_file
        )

    def run_tests_with_coverage(self):
        """运行测试并收集覆盖率数据"""
        import subprocess
        import sys

        # 开始收集覆盖率数据
        self.cov.start()

        # 运行pytest
        result = subprocess.run([
            sys.executable, "-m", "pytest",
            "tests/",
            "-v",
            "--tb=short"
        ])

        # 停止收集并保存
        self.cov.stop()
        self.cov.save()

        return result.returncode

    def generate_reports(self):
        """生成覆盖率报告"""

        # 生成文本报告
        print("\n" + "="*60)
        print("测试覆盖率报告")
        print("="*60)
        self.cov.report()

        # 生成HTML报告
        self.cov.html_report(directory="coverage_html")
        print(f"\nHTML报告: file://{Path('coverage_html').absolute()}/index.html")

        # 生成JSON报告
        self.cov.json_report(outfile="coverage.json")

        # 生成XML报告（用于CI）
        self.cov.xml_report(outfile="coverage.xml")

        # 生成LCOV报告（用于Codecov等）
        self.cov.lcov_report(outfile="coverage.lcov")

    def analyze_coverage_data(self):
        """分析覆盖率数据"""

        # 加载覆盖率数据
        self.cov.load()

        # 获取总体统计
        total_stats = self.cov.get_data().summary()

        print(f"\n总体覆盖率:")
        print(f"  文件数: {total_stats.num_files}")
        print(f"  总行数: {total_stats.num_statements}")
        print(f"  覆盖行数: {total_stats.covered_lines}")
        print(f"  覆盖率: {total_stats.percent_covered:.1f}%")

        # 分析每个文件的覆盖率
        file_stats = {}
        for filename in self.cov.get_data().measured_files():
            file_cov = self.cov.get_data().lines(filename)
            file_stats[filename] = {
                "total_lines": len(file_cov),
                "covered_lines": len([line for line in file_cov if self.cov.get_data().has_line(filename, line)]),
                "missing_lines": [line for line in file_cov if not self.cov.get_data().has_line(filename, line)]
            }

        # 找出覆盖率低的文件
        low_coverage_files = []
        for filename, stats in file_stats.items():
            coverage_pct = (stats["covered_lines"] / stats["total_lines"] * 100) if stats["total_lines"] > 0 else 0
            if coverage_pct < 80:
                low_coverage_files.append({
                    "file": filename,
                    "coverage": coverage_pct,
                    "missing_lines": stats["missing_lines"][:10]  # 只显示前10行
                })

        if low_coverage_files:
            print(f"\n需要改进的文件（覆盖率<80%）:")
            for file_info in sorted(low_coverage_files, key=lambda x: x["coverage"]):
                print(f"  {file_info['file']}: {file_info['coverage']:.1f}%")
                if file_info["missing_lines"]:
                    print(f"    未覆盖行号: {file_info['missing_lines'][:5]}...")

        return {
            "total": total_stats,
            "files": file_stats,
            "low_coverage": low_coverage_files
        }

    def generate_coverage_badge(self, output_file="coverage_badge.svg"):
        """生成覆盖率徽章"""

        self.cov.load()
        total_stats = self.cov.get_data().summary()
        coverage_percent = total_stats.percent_covered

        # 选择颜色
        if coverage_percent >= 90:
            color = "brightgreen"
        elif coverage_percent >= 80:
            color = "green"
        elif coverage_percent >= 70:
            color = "yellowgreen"
        elif coverage_percent >= 60:
            color = "yellow"
        elif coverage_percent >= 50:
            color = "orange"
        else:
            color = "red"

        # 生成SVG徽章
        badge_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
            <linearGradient id="b" x2="0" y2="100%">
                <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
                <stop offset="1" stop-opacity=".1"/>
            </linearGradient>
            <mask id="a">
                <rect width="120" height="20" rx="3" fill="#fff"/>
            </mask>
            <g mask="url(#a)">
                <path fill="#555" d="M0 0h60v20H0z"/>
                <path fill="#{color}" d="M60 0h60v20H60z"/>
                <path fill="url(#b)" d="M0 0h120v20H0z"/>
            </g>
            <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
                <text x="30" y="15" fill="#010101" fill-opacity=".3">coverage</text>
                <text x="30" y="14">coverage</text>
                <text x="90" y="15" fill="#010101" fill-opacity=".3">{coverage_percent:.1f}%</text>
                <text x="90" y="14">{coverage_percent:.1f}%</text>
            </g>
        </svg>'''

        with open(output_file, "w") as f:
            f.write(badge_svg)

        print(f"覆盖率徽章已生成: {output_file}")

    def check_coverage_threshold(self, min_coverage=80):
        """检查覆盖率是否达到阈值"""

        self.cov.load()
        total_stats = self.cov.get_data().summary()
        coverage_percent = total_stats.percent_covered

        if coverage_percent < min_coverage:
            print(f"错误: 覆盖率 {coverage_percent:.1f}% 低于阈值 {min_coverage}%")
            return False
        else:
            print(f"通过: 覆盖率 {coverage_percent:.1f}% 达到阈值 {min_coverage}%")
            return True

# 使用示例
if __name__ == "__main__":
    analyzer = CoverageAnalyzer()

    # 运行测试并收集覆盖率
    exit_code = analyzer.run_tests_with_coverage()

    # 生成报告
    analyzer.generate_reports()

    # 分析数据
    analysis = analyzer.analyze_coverage_data()

    # 生成徽章
    analyzer.generate_coverage_badge()

    # 检查阈值
    success = analyzer.check_coverage_threshold(80)

    sys.exit(0 if success else 1)
```

### CI/CD集成

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    name: Test and Coverage
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    env:
      DATABASE_URL: postgresql://test_user:test_password@localhost:5432/test_db
      REDIS_URL: redis://localhost:6379/0
      SECRET_KEY: test_secret_key
      ENVIRONMENT: testing

    strategy:
      matrix:
        python-version: ["3.9", "3.10", "3.11"]

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
        cache: 'pip'

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
        pip install -r requirements-test.txt

    - name: Run linting
      run: |
        # 代码风格检查
        black --check app tests
        flake8 app tests
        mypy app

    - name: Run unit tests
      run: |
        pytest tests/unit/ -v --cov=app --cov-report=term-missing

    - name: Run integration tests
      run: |
        pytest tests/integration/ -v --cov=app --cov-append

    - name: Run e2e tests
      run: |
        pytest tests/e2e/ -v --cov=app --cov-append

    - name: Generate coverage report
      run: |
        pytest --cov=app --cov-report=xml --cov-report=html

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
        flags: unittests
        name: codecov-umbrella

    - name: Upload test artifacts
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-reports-${{ matrix.python-version }}
        path: |
          coverage_html/
          test-results.xml
        retention-days: 30

  performance:
    name: Performance Test
    runs-on: ubuntu-latest
    needs: test

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: "3.11"

    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install locust

    - name: Start application
      run: |
        uvicorn app.main:app --host 0.0.0.0 --port 8000 &
        sleep 10  # 等待应用启动

    - name: Run performance tests
      run: |
        locust -f tests/performance/locustfile.py \
          --headless \
          -u 100 \
          -r 10 \
          -t 1m \
          --host=http://localhost:8000 \
          --csv=performance_results

    - name: Upload performance results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: performance-results
        path: performance_results*.csv
        retention-days: 30

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: test

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Run bandit security scan
      run: |
        pip install bandit
        bandit -r app -f json -o bandit-report.json

    - name: Run safety dependency check
      run: |
        pip install safety
        safety check --json > safety-report.json

    - name: Upload security reports
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: security-reports
        path: |
          bandit-report.json
          safety-report.json

  build:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: [test, performance, security]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2

    - name: Login to DockerHub
      uses: docker/login-action@v2
      with:
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}

    - name: Build and push
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: |
          ${{ secrets.DOCKER_USERNAME }}/fastapi-app:latest
          ${{ secrets.DOCKER_USERNAME }}/fastapi-app:${{ github.sha }}
        cache-from: type=registry,ref=${{ secrets.DOCKER_USERNAME }}/fastapi-app:buildcache
        cache-to: type=registry,ref=${{ secrets.DOCKER_USERNAME }}/fastapi-app:buildcache,mode=max

  deploy:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    environment: staging

    steps:
    - name: Deploy to Kubernetes
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.STAGING_HOST }}
        username: ${{ secrets.STAGING_USERNAME }}
        key: ${{ secrets.STAGING_SSH_KEY }}
        script: |
          kubectl set image deployment/fastapi-app \
            fastapi-app=${{ secrets.DOCKER_USERNAME }}/fastapi-app:${{ github.sha }}

    - name: Run smoke tests
      run: |
        curl --retry 5 --retry-delay 10 \
          https://staging.example.com/health
        pytest tests/smoke/ -v

# Jenkinsfile (声明式流水线)
pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'registry.example.com'
        APP_NAME = 'fastapi-app'
        PYTHON_VERSION = '3.11'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup') {
            steps {
                sh '''
                python -m venv venv
                source venv/bin/activate
                pip install --upgrade pip
                pip install -r requirements.txt
                pip install -r requirements-test.txt
                '''
            }
        }

        stage('Lint') {
            steps {
                sh '''
                source venv/bin/activate
                black --check app tests
                flake8 app tests
                mypy app
                '''
            }
        }

        stage('Unit Tests') {
            steps {
                sh '''
                source venv/bin/activate
                pytest tests/unit/ -v \
                  --junitxml=test-results-unit.xml \
                  --cov=app \
                  --cov-report=xml:coverage-unit.xml
                '''
            }
            post {
                always {
                    junit 'test-results-unit.xml'
                    cobertura coberturaReportFile: 'coverage-unit.xml'
                }
            }
        }

        stage('Integration Tests') {
            steps {
                sh '''
                source venv/bin/activate
                docker-compose -f docker-compose.test.yml up -d
                sleep 30
                pytest tests/integration/ -v \
                  --junitxml=test-results-integration.xml \
                  --cov=app --cov-append \
                  --cov-report=xml:coverage-integration.xml
                docker-compose -f docker-compose.test.yml down
                '''
            }
            post {
                always {
                    junit 'test-results-integration.xml'
                    cobertura coberturaReportFile: 'coverage-integration.xml'
                }
            }
        }

        stage('Build Docker Image') {
            when {
                branch 'main'
            }
            steps {
                script {
                    docker.build("${DOCKER_REGISTRY}/${APP_NAME}:${env.BUILD_ID}")
                }
            }
        }

        stage('Push Docker Image') {
            when {
                branch 'main'
            }
            steps {
                script {
                    docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-credentials') {
                        docker.image("${DOCKER_REGISTRY}/${APP_NAME}:${env.BUILD_ID}").push()
                        docker.image("${DOCKER_REGISTRY}/${APP_NAME}:${env.BUILD_ID}").push('latest')
                    }
                }
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'main'
            }
            steps {
                sh '''
                kubectl config use-context staging
                kubectl set image deployment/${APP_NAME} \
                  ${APP_NAME}=${DOCKER_REGISTRY}/${APP_NAME}:${env.BUILD_ID}
                kubectl rollout status deployment/${APP_NAME}
                '''
            }
        }

        stage('Smoke Tests') {
            when {
                branch 'main'
            }
            steps {
                sh '''
                source venv/bin/activate
                pytest tests/smoke/ -v \
                  --junitxml=test-results-smoke.xml
                '''
            }
            post {
                always {
                    junit 'test-results-smoke.xml'
                }
            }
        }
    }

    post {
        always {
            sh '''
            source venv/bin/activate
            coverage combine coverage-*.xml
            coverage report
            coverage html
            '''

            // 清理
            sh 'docker system prune -f'
        }

        success {
            // 发送成功通知
            emailext (
                subject: "构建成功: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: "构建 ${env.BUILD_URL} 成功完成。",
                to: 'team@example.com'
            )
        }

        failure {
            // 发送失败通知
            emailext (
                subject: "构建失败: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: "构建 ${env.BUILD_URL} 失败。",
                to: 'team@example.com',
                attachLog: true
            )
        }
    }
}

# GitLab CI配置
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_IMAGE: registry.gitlab.com/$CI_PROJECT_PATH
  DATABASE_URL: postgresql://postgres:password@postgres:5432/test_db

services:
  - postgres:13-alpine
  - redis:7-alpine

cache:
  paths:
    - venv/
  key: $CI_COMMIT_REF_SLUG

before_script:
  - python --version
  - pip install virtualenv
  - virtualenv venv
  - source venv/bin/activate
  - pip install -r requirements.txt
  - pip install -r requirements-test.txt

unit_tests:
  stage: test
  script:
    - pytest tests/unit/ -v --cov=app --cov-report=xml --cov-report=html
  artifacts:
    paths:
      - coverage.xml
      - htmlcov/
    reports:
      junit: test-results.xml
      cobertura: coverage.xml

integration_tests:
  stage: test
  script:
    - pytest tests/integration/ -v
  artifacts:
    paths:
      - test-results-integration.xml
    reports:
      junit: test-results-integration.xml

performance_tests:
  stage: test
  script:
    - pip install locust
    - locust -f tests/performance/locustfile.py --headless -u 10 -r 1 -t 30s --host=http://localhost:8000
  artifacts:
    paths:
      - locust_stats.csv

build_image:
  stage: build
  image: docker:20.10.16
  services:
    - docker:20.10.16-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker build -t $DOCKER_IMAGE:$CI_COMMIT_SHA -t $DOCKER_IMAGE:latest .
    - docker push $DOCKER_IMAGE:$CI_COMMIT_SHA
    - docker push $DOCKER_IMAGE:latest
  only:
    - main

deploy_staging:
  stage: deploy
  image: alpine:latest
  script:
    - apk add --no-cache curl
    - |
      curl -X POST \
        -H "Content-Type: application/json" \
        -d '{"image":"'"$DOCKER_IMAGE:$CI_COMMIT_SHA"'"}' \
        $STAGING_DEPLOY_WEBHOOK
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - main

# 质量门禁配置
# sonar-project.properties
sonar.projectKey=fastapi_app
sonar.projectName=FastAPI Application
sonar.projectVersion=1.0

sonar.sources=app
sonar.tests=tests
sonar.test.inclusions=tests/**/*.py
sonar.exclusions=**/migrations/**,**/__pycache__/**,**/*.pyc

sonar.python.coverage.reportPaths=coverage.xml
sonar.python.xunit.reportPath=test-results.xml
sonar.python.pylint.reportPath=pylint-report.txt

sonar.sourceEncoding=UTF-8
sonar.host.url=https://sonar.example.com
sonar.login=${SONAR_TOKEN}

# 代码质量检查脚本
# scripts/quality_check.py
#!/usr/bin/env python3
"""
代码质量检查脚本
"""

import subprocess
import sys
import json
from pathlib import Path

class QualityChecker:
    """质量检查器"""

    def __init__(self):
        self.results = {
            "linting": {"passed": False, "output": ""},
            "type_checking": {"passed": False, "output": ""},
            "security": {"passed": False, "output": ""},
            "tests": {"passed": False, "output": ""},
            "coverage": {"passed": False, "coverage": 0}
        }

    def run_black(self):
        """运行Black代码格式化检查"""
        try:
            result = subprocess.run(
                ["black", "--check", "app", "tests"],
                capture_output=True,
                text=True
            )
            self.results["linting"]["passed"] = result.returncode == 0
            self.results["linting"]["output"] = result.stdout
            return result.returncode == 0
        except Exception as e:
            print(f"Black检查失败: {e}")
            return False

    def run_flake8(self):
        """运行Flake8代码风格检查"""
        try:
            result = subprocess.run(
                ["flake8", "app", "tests"],
                capture_output=True,
                text=True
            )
            self.results["linting"]["passed"] = self.results["linting"]["passed"] and result.returncode == 0
            self.results["linting"]["output"] += "\n" + result.stdout
            return result.returncode == 0
        except Exception as e:
            print(f"Flake8检查失败: {e}")
            return False

    def run_mypy(self):
        """运行Mypy类型检查"""
        try:
            result = subprocess.run(
                ["mypy", "app"],
                capture_output=True,
                text=True
            )
            self.results["type_checking"]["passed"] = result.returncode == 0
            self.results["type_checking"]["output"] = result.stdout
            return result.returncode == 0
        except Exception as e:
            print(f"Mypy检查失败: {e}")
            return False

    def run_bandit(self):
        """运行Bandit安全扫描"""
        try:
            result = subprocess.run(
                ["bandit", "-r", "app", "-f", "json"],
                capture_output=True,
                text=True
            )
            self.results["security"]["passed"] = True

            # 解析Bandit结果
            if result.returncode == 0:
                try:
                    bandit_data = json.loads(result.stdout)
                    issues = bandit_data.get("metrics", {}).get("_totals", {}).get("SEVERITY.HIGH", 0)
                    self.results["security"]["passed"] = issues == 0
                except:
                    pass

            self.results["security"]["output"] = result.stdout
            return self.results["security"]["passed"]
        except Exception as e:
            print(f"Bandit检查失败: {e}")
            return False

    def run_tests(self):
        """运行测试"""
        try:
            result = subprocess.run(
                ["pytest", "tests/", "-v", "--junitxml=test-results.xml"],
                capture_output=True,
                text=True
            )
            self.results["tests"]["passed"] = result.returncode == 0
            self.results["tests"]["output"] = result.stdout
            return result.returncode == 0
        except Exception as e:
            print(f"测试运行失败: {e}")
            return False

    def check_coverage(self):
        """检查测试覆盖率"""
        try:
            result = subprocess.run(
                ["pytest", "--cov=app", "--cov-report=term-missing", "tests/"],
                capture_output=True,
                text=True
            )

            # 从输出中提取覆盖率
            import re
            coverage_match = re.search(r'TOTAL\s+\d+\s+\d+\s+(\d+)%', result.stdout)
            if coverage_match:
                coverage = int(coverage_match.group(1))
                self.results["coverage"]["coverage"] = coverage
                self.results["coverage"]["passed"] = coverage >= 80

            self.results["tests"]["passed"] = self.results["tests"]["passed"] and result.returncode == 0
            return self.results["coverage"]["passed"]
        except Exception as e:
            print(f"覆盖率检查失败: {e}")
            return False

    def generate_report(self):
        """生成质量报告"""
        report = {
            "timestamp": datetime.now().isoformat(),
            "results": self.results,
            "summary": {
                "passed_all": all([
                    self.results["linting"]["passed"],
                    self.results["type_checking"]["passed"],
                    self.results["security"]["passed"],
                    self.results["tests"]["passed"],
                    self.results["coverage"]["passed"]
                ]),
                "coverage": self.results["coverage"]["coverage"]
            }
        }

        # 保存报告
        with open("quality-report.json", "w") as f:
            json.dump(report, f, indent=2)

        # 打印总结
        print("\n" + "="*60)
        print("代码质量检查报告")
        print("="*60)

        for check, result in self.results.items():
            status = "✓" if result["passed"] else "✗"
            print(f"{status} {check.upper()}")

            if check == "coverage":
                print(f"   覆盖率: {result['coverage']}%")

        print("\n详细报告: quality-report.json")

        return report["summary"]["passed_all"]

    def run_all_checks(self):
        """运行所有检查"""
        print("开始代码质量检查...")

        checks = [
            ("代码格式化", self.run_black),
            ("代码风格", self.run_flake8),
            ("类型检查", self.run_mypy),
            ("安全扫描", self.run_bandit),
            ("单元测试", self.run_tests),
            ("覆盖率检查", self.check_coverage),
        ]

        for name, check_func in checks:
            print(f"\n正在执行: {name}")
            if not check_func():
                print(f"  {name} 失败")

        return self.generate_report()

if __name__ == "__main__":
    from datetime import datetime

    checker = QualityChecker()
    success = checker.run_all_checks()

    sys.exit(0 if success else 1)
```

## 总结

构建完整的FastAPI测试体系需要系统化的方法和工具链。通过本章的学习，你应该能够：

### 关键要点

1. **测试策略**
   - 遵循测试金字塔原则
   - 合理分配单元、集成、E2E测试比例
   - 根据业务需求调整测试策略

2. **测试工具**
   - 熟练掌握pytest框架
   - 有效测试异步代码
   - 使用Mock和Patch模拟外部依赖

3. **数据库测试**
   - 管理测试数据库事务
   - 使用工厂模式创建测试数据
   - 测试数据完整性和一致性

4. **性能测试**
   - 使用Locust进行负载测试
   - 分析性能瓶颈
   - 建立性能基准

5. **质量保证**
   - 监控测试覆盖率
   - 集成CI/CD流水线
   - 实施代码质量门禁

### 最佳实践

1. **测试命名规范**

   ```python
   # 好的命名
   test_user_can_login_with_valid_credentials()
   test_should_raise_error_when_email_is_invalid()

   # 不好的命名
   test1()
   test_login()
   ```

2. **测试隔离**
   - 每个测试独立运行
   - 测试之间不依赖顺序
   - 清理测试数据

3. **测试数据管理**
   - 使用fixture创建测试数据
   - 避免硬编码测试数据
   - 清理测试环境

4. **测试报告**
   - 生成清晰的测试报告
   - 监控测试趋势
   - 及时修复失败的测试

### 工具推荐

- **测试框架**: pytest + pytest-asyncio
- **Mock库**: unittest.mock
- **覆盖率**: pytest-cov + coverage.py
- **性能测试**: Locust
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins
- **代码质量**: Black, Flake8, Mypy, Bandit
- **监控**: SonarQube, Codecov

### 故障排除

1. **测试运行缓慢**
   - 优化数据库查询
   - 使用测试数据库
   - 并行运行测试

2. **测试不稳定**
   - 检查时间相关的测试
   - 避免竞争条件
   - 增加适当的等待时间

3. **Mock过于复杂**
   - 重构被测试代码
   - 使用依赖注入
   - 考虑集成测试替代

### 扩展学习

- [pytest官方文档](https://docs.pytest.org/)
- [FastAPI测试指南](https://fastapi.tiangolo.com/tutorial/testing/)
- [测试驱动开发](https://en.wikipedia.org/wiki/Test-driven_development)
- [CI/CD最佳实践](https://www.redhat.com/en/topics/devops/what-is-ci-cd)

---

**最后提醒**：测试不是一次性的工作，而是持续的过程。建立良好的测试文化，让每个团队成员都重视测试。记住：好的测试不仅能发现bug，更能提升代码质量，加快开发速度，增强团队信心。

> 测试就像保险，平时可能感觉不到它的价值，但关键时刻它能拯救你的项目。投资在测试上的每一分钟，都会在未来带来十倍的回报。
