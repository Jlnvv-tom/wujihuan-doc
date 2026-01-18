# FastAPI依赖注入：优雅解耦的艺术

> 在FastAPI的世界里，依赖注入不是复杂的框架魔术，而是让代码变得清晰、可测试、易维护的利器。今天，让我们一起探索这个「解耦的艺术」。

## 1. 依赖注入设计模式解析

### 什么是依赖注入？

想象一下，你在餐厅点菜。传统的做法是：你告诉服务员要什么菜，然后服务员去后厨把所有原料拿来让你自己烹饪。而依赖注入则是：你点菜，服务员直接把做好的菜端上来。

**依赖注入的核心思想**：将对象的创建和对象的使用分离。对象不需要自己创建依赖，而是由外部提供。

### 为什么FastAPI的依赖注入如此特别？

```python
from fastapi import Depends, FastAPI

app = FastAPI()

# 传统方式：在函数内部创建依赖
def traditional_method():
    # 每个函数都要自己创建数据库连接
    db = get_database_connection()
    # ... 使用db
    return result

# FastAPI依赖注入方式
def get_db():
    db = get_database_connection()
    try:
        yield db
    finally:
        db.close()

@app.get("/items/")
async def read_items(db = Depends(get_db)):
    # db已经由外部提供
    # ... 使用db
    return result
```

### 依赖注入的三大好处

1. **代码复用**：相同的依赖可以在多个地方使用
2. **易于测试**：可以轻松替换依赖进行单元测试
3. **配置灵活**：可以根据环境切换不同的依赖实现

## 2. 简单依赖：共享业务逻辑

简单依赖是最基础的依赖形式，用于共享可重用的逻辑。

### 分页依赖示例

```python
from fastapi import Depends, Query
from typing import Optional

async def pagination_params(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="每页记录数"),
    sort_by: str = Query("id", description="排序字段"),
    sort_order: str = Query("asc", regex="^(asc|desc)$")
) -> dict:
    """通用的分页参数依赖"""
    return {
        "skip": skip,
        "limit": limit,
        "sort_by": sort_by,
        "sort_order": sort_order
    }

@app.get("/products/")
async def get_products(pagination: dict = Depends(pagination_params)):
    """使用分页依赖获取商品列表"""
    # 在实际应用中，这里会查询数据库
    products = [
        {"id": i, "name": f"Product {i}", "price": i * 10}
        for i in range(pagination["skip"],
                      pagination["skip"] + pagination["limit"])
    ]

    # 模拟排序
    reverse = pagination["sort_order"] == "desc"
    products.sort(key=lambda x: x[pagination["sort_by"]], reverse=reverse)

    return {
        "pagination": pagination,
        "total": 1000,  # 假设总记录数
        "products": products
    }

@app.get("/users/")
async def get_users(pagination: dict = Depends(pagination_params)):
    """另一个使用相同分页依赖的端点"""
    return {
        "pagination": pagination,
        "users": []  # 实际查询用户数据
    }
```

### 请求验证依赖

```python
from fastapi import Header, HTTPException

async def verify_api_key(
    api_key: str = Header(..., alias="X-API-Key"),
    api_version: str = Header("v1", alias="X-API-Version")
) -> dict:
    """验证API密钥和版本的依赖"""
    # 这里应该是从数据库或配置中验证
    valid_keys = {"secret-key-123", "test-key-456"}

    if api_key not in valid_keys:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )

    if api_version not in {"v1", "v2"}:
        raise HTTPException(
            status_code=400,
            detail="Unsupported API version"
        )

    return {
        "api_key": api_key,
        "api_version": api_version,
        "authenticated": True
    }

@app.get("/secure-data/")
async def get_secure_data(
    auth_info: dict = Depends(verify_api_key)
):
    """需要API密钥验证的端点"""
    return {
        "message": "Access granted to secure data",
        "user_info": auth_info,
        "data": ["secret1", "secret2", "secret3"]
    }
```

## 3. 带参数的依赖：灵活配置

带参数的依赖让我们可以根据不同的情况创建不同的依赖实例。

### 使用类实现参数化依赖

```python
class RateLimiter:
    """带参数的限流器依赖"""

    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.request_timestamps = []

    async def __call__(self, request_ip: str = Header(..., alias="X-Real-IP")):
        """实现限流逻辑"""
        import time
        from fastapi import HTTPException

        current_time = time.time()

        # 清理过期的请求记录
        cutoff_time = current_time - 60  # 60秒窗口
        self.request_timestamps = [
            ts for ts in self.request_timestamps
            if ts > cutoff_time
        ]

        # 检查是否超过限制
        if len(self.request_timestamps) >= self.requests_per_minute:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {self.requests_per_minute} requests per minute."
            )

        # 记录当前请求
        self.request_timestamps.append(current_time)

        return {
            "ip": request_ip,
            "requests_in_last_minute": len(self.request_timestamps),
            "limit": self.requests_per_minute
        }

# 创建不同限制的依赖实例
strict_limiter = RateLimiter(requests_per_minute=10)  # 严格的限制
normal_limiter = RateLimiter(requests_per_minute=60)  # 正常的限制
relaxed_limiter = RateLimiter(requests_per_minute=300)  # 宽松的限制

@app.get("/api/public/")
async def public_api(limiter: dict = Depends(relaxed_limiter)):
    """公共API，宽松限制"""
    return {"message": "Public API", **limiter}

@app.get("/api/protected/")
async def protected_api(limiter: dict = Depends(normal_limiter)):
    """受保护API，正常限制"""
    return {"message": "Protected API", **limiter}

@app.get("/api/sensitive/")
async def sensitive_api(limiter: dict = Depends(strict_limiter)):
    """敏感API，严格限制"""
    return {"message": "Sensitive API", **limiter}
```

### 使用工厂函数创建参数化依赖

```python
from typing import Callable

def create_cache_dependency(
    cache_prefix: str,
    expire_seconds: int = 300
) -> Callable:
    """创建缓存依赖的工厂函数"""

    # 实际项目中可能使用Redis或Memcached
    cache_store = {}

    async def cache_dependency(
        key: str,
        refresh: bool = False
    ):
        """缓存依赖的具体实现"""
        cache_key = f"{cache_prefix}:{key}"

        if not refresh and cache_key in cache_store:
            # 检查缓存是否过期
            cached_data, timestamp = cache_store[cache_key]
            import time
            if time.time() - timestamp < expire_seconds:
                return {
                    "data": cached_data,
                    "from_cache": True,
                    "key": cache_key
                }

        # 这里应该是实际的数据库查询或API调用
        fresh_data = f"Fresh data for {key}"

        # 更新缓存
        cache_store[cache_key] = (fresh_data, time.time())

        return {
            "data": fresh_data,
            "from_cache": False,
            "key": cache_key
        }

    return cache_dependency

# 创建不同类型的缓存依赖
user_cache = create_cache_dependency("user", expire_seconds=60)
product_cache = create_cache_dependency("product", expire_seconds=300)
order_cache = create_cache_dependency("order", expire_seconds=1800)

@app.get("/users/{user_id}")
async def get_user(
    user_id: int,
    cache: dict = Depends(user_cache)
):
    """获取用户信息，使用缓存"""
    return {
        "user_id": user_id,
        "cache_info": cache
    }
```

## 4. 子依赖：构建依赖关系树

子依赖允许我们构建复杂的依赖关系树，让依赖之间可以互相调用。

### 构建多层依赖关系

```python
from fastapi import Depends

# 第一层：基础验证
async def verify_token(token: str = Header(...)) -> str:
    if token != "secret-token":
        raise HTTPException(status_code=401, detail="Invalid token")
    return token

# 第二层：获取用户信息（依赖于第一层）
async def get_current_user(
    token: str = Depends(verify_token)
) -> dict:
    # 根据token获取用户信息
    users_db = {
        "secret-token": {
            "id": 1,
            "username": "john_doe",
            "email": "john@example.com",
            "role": "user"
        }
    }
    return users_db.get(token, {})

# 第三层：权限检查（依赖于第二层）
async def require_role(
    required_role: str,
    current_user: dict = Depends(get_current_user)
) -> dict:
    if current_user.get("role") != required_role:
        raise HTTPException(
            status_code=403,
            detail=f"Requires {required_role} role"
        )
    return {"user": current_user, "required_role": required_role}

# 使用多层依赖
@app.get("/user/profile")
async def get_profile(
    user_info: dict = Depends(get_current_user)
):
    """获取用户个人资料"""
    return {
        "message": "User profile",
        "user": user_info
    }

@app.get("/admin/dashboard")
async def admin_dashboard(
    auth_info: dict = Depends(lambda: require_role("admin"))
):
    """管理员仪表板，需要admin角色"""
    return {
        "message": "Admin dashboard",
        "data": ["stat1", "stat2", "stat3"],
        **auth_info
    }

@app.get("/editor/content")
async def editor_content(
    auth_info: dict = Depends(lambda: require_role("editor"))
):
    """编辑内容，需要editor角色"""
    return {
        "message": "Editor content management",
        **auth_info
    }
```

### 依赖关系树的可视化

```python
async def db_session():
    """数据库会话依赖"""
    print("Creating database session")
    yield {"db": "session"}
    print("Closing database session")

async def cache_manager():
    """缓存管理器依赖"""
    print("Initializing cache manager")
    return {"cache": "manager"}

async def logger_service():
    """日志服务依赖"""
    print("Setting up logger")
    return {"logger": "service"}

async def complex_business_logic(
    db: dict = Depends(db_session),
    cache: dict = Depends(cache_manager),
    logger: dict = Depends(logger_service)
):
    """复杂的业务逻辑，依赖多个服务"""
    print("Executing complex business logic")
    return {
        "db": db,
        "cache": cache,
        "logger": logger,
        "status": "ready"
    }

@app.get("/complex-operation")
async def perform_operation(
    result: dict = Depends(complex_business_logic)
):
    """执行复杂操作"""
    return {
        "message": "Complex operation completed",
        "dependencies_used": result
    }
```

## 5. 类作为依赖：面向对象实践

使用类作为依赖可以让我们的代码更加面向对象，更好地组织和管理依赖。

### 类依赖的基本使用

```python
from typing import Optional
import json

class JSONConfig:
    """JSON配置管理依赖类"""

    def __init__(self, config_path: str = "config.json"):
        self.config_path = config_path
        self._config = None

    def load_config(self):
        """加载配置文件"""
        try:
            with open(self.config_path, 'r') as f:
                self._config = json.load(f)
        except FileNotFoundError:
            self._config = {}

    async def __call__(self) -> dict:
        """使类实例可调用，作为依赖"""
        if self._config is None:
            self.load_config()
        return self._config

# 创建配置依赖实例
app_config = JSONConfig("app_config.json")
db_config = JSONConfig("database_config.json")

@app.get("/settings/app")
async def get_app_settings(
    config: dict = Depends(app_config)
):
    """获取应用设置"""
    return {"app_config": config}

@app.get("/settings/database")
async def get_db_settings(
    config: dict = Depends(db_config)
):
    """获取数据库设置"""
    return {"db_config": config}
```

### 带有状态管理的类依赖

```python
import asyncio
from contextlib import asynccontextmanager

class DatabasePool:
    """数据库连接池依赖类"""

    def __init__(self, min_connections: int = 2, max_connections: int = 10):
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.pool = []
        self._initialized = False

    async def initialize(self):
        """初始化连接池"""
        if not self._initialized:
            print(f"Initializing connection pool with {self.min_connections} connections")
            for i in range(self.min_connections):
                # 模拟创建数据库连接
                connection = f"connection-{i}"
                self.pool.append(connection)
            self._initialized = True

    @asynccontextmanager
    async def get_connection(self):
        """获取数据库连接（上下文管理器）"""
        await self.initialize()

        if not self.pool:
            # 如果池为空，创建新连接（不超过最大值）
            if len(self.pool) < self.max_connections:
                new_conn = f"connection-new-{len(self.pool)}"
                self.pool.append(new_conn)
            else:
                # 等待连接释放
                await asyncio.sleep(0.1)
                return await self.get_connection()

        # 从池中取出连接
        connection = self.pool.pop()

        try:
            yield connection
        finally:
            # 使用完毕后放回池中
            self.pool.append(connection)

    async def __call__(self):
        """作为依赖使用时返回连接池管理器"""
        return self

# 创建数据库连接池实例
db_pool = DatabasePool(min_connections=3, max_connections=20)

@app.get("/data/")
async def get_data(
    pool: DatabasePool = Depends(db_pool)
):
    """使用数据库连接池获取数据"""
    async with pool.get_connection() as conn:
        # 使用连接执行查询
        data = f"Data fetched using {conn}"

        # 模拟数据库操作
        await asyncio.sleep(0.1)

        return {
            "connection_used": conn,
            "available_connections": len(pool.pool),
            "data": data
        }
```

## 6. 依赖缓存策略优化

FastAPI默认会缓存依赖的结果，了解缓存机制可以帮助我们优化性能。

### 理解依赖缓存

```python
from fastapi import Depends
import time

call_count = 0

async def expensive_operation() -> dict:
    """模拟一个昂贵的操作"""
    global call_count
    call_count += 1

    # 模拟耗时操作
    await asyncio.sleep(1)

    return {
        "result": "expensive_data",
        "call_count": call_count,
        "timestamp": time.time()
    }

@app.get("/test-cache1")
async def test_cache1(
    data1: dict = Depends(expensive_operation),
    data2: dict = Depends(expensive_operation)
):
    """测试缓存：同一个依赖被多次使用"""
    return {
        "data1": data1,
        "data2": data2,
        "are_same": data1["call_count"] == data2["call_count"]
    }

@app.get("/test-cache2")
async def test_cache2(
    data: dict = Depends(expensive_operation)
):
    """另一个使用相同依赖的端点"""
    return {"data": data}

# 禁用缓存
@app.get("/test-no-cache")
async def test_no_cache(
    data1: dict = Depends(expensive_operation, use_cache=False),
    data2: dict = Depends(expensive_operation, use_cache=False)
):
    """禁用缓存，每次都会重新计算"""
    return {
        "data1": data1,
        "data2": data2,
        "are_same": data1["call_count"] == data2["call_count"]
    }
```

### 智能缓存策略

```python
from functools import lru_cache
import hashlib

class SmartCache:
    """智能缓存依赖，根据参数决定是否缓存"""

    def __init__(self, cache_size: int = 128):
        self.cache_size = cache_size
        self._cache = {}

    def _make_cache_key(self, *args, **kwargs) -> str:
        """生成缓存键"""
        key_parts = []

        # 处理位置参数
        for arg in args:
            key_parts.append(str(arg))

        # 处理关键字参数
        for k, v in sorted(kwargs.items()):
            key_parts.append(f"{k}:{v}")

        # 生成哈希
        key_string = "|".join(key_parts)
        return hashlib.md5(key_string.encode()).hexdigest()

    async def cached_operation(
        self,
        operation_name: str,
        user_id: int,
        refresh: bool = False
    ) -> dict:
        """带缓存的操作用依赖"""

        cache_key = self._make_cache_key(operation_name, user_id)

        if not refresh and cache_key in self._cache:
            cached_data, expiry = self._cache[cache_key]
            if time.time() < expiry:
                return {
                    **cached_data,
                    "from_cache": True,
                    "cache_key": cache_key
                }

        # 执行实际的操作（模拟）
        await asyncio.sleep(0.5)  # 模拟耗时操作
        result = {
            "operation": operation_name,
            "user_id": user_id,
            "data": f"Result for {operation_name} user {user_id}",
            "timestamp": time.time()
        }

        # 缓存结果（30秒过期）
        expiry_time = time.time() + 30
        self._cache[cache_key] = (result, expiry_time)

        # 清理过期的缓存项
        if len(self._cache) > self.cache_size:
            self._cleanup_cache()

        return {
            **result,
            "from_cache": False,
            "cache_key": cache_key
        }

    def _cleanup_cache(self):
        """清理过期的缓存"""
        current_time = time.time()
        expired_keys = [
            key for key, (_, expiry) in self._cache.items()
            if expiry < current_time
        ]

        for key in expired_keys:
            del self._cache[key]

# 创建智能缓存实例
smart_cache = SmartCache(cache_size=100)

@app.get("/smart-cached/{user_id}")
async def get_smart_cached_data(
    user_id: int,
    refresh: bool = False,
    cached_result: dict = Depends(
        lambda user_id=user_id, refresh=refresh:
        smart_cache.cached_operation("get_user_data", user_id, refresh)
    )
):
    """使用智能缓存获取数据"""
    return {
        "user_id": user_id,
        "result": cached_result
    }
```

## 7. 实际案例：认证依赖实现

让我们通过一个完整的认证系统来展示依赖注入的实际应用。

### JWT认证系统

```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# 配置
SECRET_KEY = "your-secret-key-here"  # 生产环境应该使用环境变量
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 数据模型
class User(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    disabled: Optional[bool] = None
    scopes: list = []  # 权限范围

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    scopes: list = []

# 模拟用户数据库
fake_users_db = {
    "john": {
        "username": "john",
        "full_name": "John Doe",
        "email": "john@example.com",
        "hashed_password": pwd_context.hash("secret"),
        "disabled": False,
        "scopes": ["read:user", "write:user"]
    },
    "alice": {
        "username": "alice",
        "full_name": "Alice Smith",
        "email": "alice@example.com",
        "hashed_password": pwd_context.hash("secret2"),
        "disabled": False,
        "scopes": ["read:user", "write:user", "admin"]
    }
}

# 工具函数
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db, username: str):
    if username in db:
        user_dict = db[username]
        return User(**user_dict)
    return None

def authenticate_user(fake_db, username: str, password: str):
    user = get_user(fake_db, username)
    if not user:
        return False
    if not verify_password(password, fake_db[username]["hashed_password"]):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 核心认证依赖
async def get_current_user(token: str = Header(..., alias="Authorization")):
    """获取当前用户的依赖"""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 去除"Bearer "前缀
        if token.startswith("Bearer "):
            token = token[7:]

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception

        token_scopes = payload.get("scopes", [])
        token_data = TokenData(username=username, scopes=token_scopes)
    except JWTError:
        raise credentials_exception

    user = get_user(fake_users_db, username=token_data.username)
    if user is None:
        raise credentials_exception

    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
):
    """获取当前活跃用户的依赖"""
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def require_scope(required_scope: str):
    """检查权限范围的依赖工厂"""
    async def scope_dependency(
        current_user: User = Depends(get_current_active_user)
    ):
        if required_scope not in current_user.scopes:
            raise HTTPException(
                status_code=403,
                detail=f"Not enough permissions. Required: {required_scope}"
            )
        return current_user
    return scope_dependency

# 使用认证依赖的端点
@app.post("/token", response_model=Token)
async def login_for_access_token(
    username: str = Form(...),
    password: str = Form(...)
):
    """获取访问令牌"""
    user = authenticate_user(fake_users_db, username, password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "scopes": user.scopes},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me/", response_model=User)
async def read_users_me(
    current_user: User = Depends(get_current_active_user)
):
    """获取当前用户信息"""
    return current_user

@app.get("/users/{username}")
async def read_user(
    username: str,
    current_user: User = Depends(require_scope("read:user"))
):
    """读取用户信息（需要read:user权限）"""
    user = get_user(fake_users_db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/users/")
async def create_user(
    user_data: dict,
    current_user: User = Depends(require_scope("write:user"))
):
    """创建用户（需要write:user权限）"""
    return {"message": "User created", "data": user_data}

@app.get("/admin/dashboard")
async def admin_dashboard(
    current_user: User = Depends(require_scope("admin"))
):
    """管理员仪表板（需要admin权限）"""
    return {
        "message": "Welcome to admin dashboard",
        "user": current_user,
        "admin_data": ["stat1", "stat2", "stat3"]
    }
```

### 认证依赖的组合使用

```python
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

# OAuth2密码流程
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class RoleChecker:
    """基于角色的权限检查器"""

    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Operation not permitted for {user.role} role"
            )
        return user

# 定义不同的角色检查器
allow_admin = RoleChecker(["admin"])
allow_editor = RoleChecker(["editor", "admin"])
allow_viewer = RoleChecker(["viewer", "editor", "admin"])

@app.get("/articles/")
async def list_articles(
    current_user: User = Depends(allow_viewer)
):
    """查看文章列表（需要viewer以上权限）"""
    return {"articles": ["article1", "article2"]}

@app.post("/articles/")
async def create_article(
    article_data: dict,
    current_user: User = Depends(allow_editor)
):
    """创建文章（需要editor以上权限）"""
    return {"message": "Article created", "article": article_data}

@app.delete("/articles/{article_id}")
async def delete_article(
    article_id: int,
    current_user: User = Depends(allow_admin)
):
    """删除文章（需要admin权限）"""
    return {"message": f"Article {article_id} deleted"}
```

## 依赖注入的最佳实践

1. **单一职责**：每个依赖应该只做一件事
2. **可测试性**：依赖应该易于模拟和替换
3. **明确接口**：依赖的输入输出应该清晰定义
4. **适当缓存**：根据需求合理使用缓存
5. **错误处理**：依赖中的错误应该有清晰的反馈

## 总结

FastAPI的依赖注入系统提供了一种优雅的方式来管理应用的复杂性。通过本章的学习，你应该已经掌握了：

1. **依赖注入的基本原理**：理解为什么使用依赖注入
2. **各种依赖类型**：从简单依赖到复杂的类依赖
3. **依赖的组合**：如何构建依赖关系树
4. **缓存策略**：如何优化依赖的性能
5. **实际应用**：如何实现一个完整的认证系统

依赖注入不仅是FastAPI的一个特性，更是一种编程哲学。它鼓励我们编写松耦合、可测试、易维护的代码。

**思考题**：在你的项目中，哪些重复的逻辑可以抽象成依赖？如何设计一个依赖来管理跨多个端点的业务逻辑？欢迎在评论区分享你的想法和实践经验！
