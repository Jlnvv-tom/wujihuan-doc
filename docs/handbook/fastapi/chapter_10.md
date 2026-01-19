# FastAPI部署与性能优化：从开发到生产的全链路指南

> 你的FastAPI应用在本地跑得飞快，但一到生产环境就问题频出？别担心，今天带你全面掌握FastAPI的生产环境部署与性能优化技巧，让你的应用稳如磐石！

## 生产环境配置管理

### 环境变量与配置文件

生产环境的第一要务：**安全分离配置**。告别硬编码，拥抱环境变量！

```python
# config.py - 生产环境配置管理
from pydantic import BaseSettings, Field, validator
from typing import Optional, List
import secrets

class Settings(BaseSettings):
    """应用配置类"""

    # 基础配置
    APP_NAME: str = "FastAPI Production App"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"  # development, staging, production

    # API配置
    API_V1_STR: str = "/api/v1"
    BACKEND_CORS_ORIGINS: List[str] = [
        "https://yourdomain.com",
        "https://api.yourdomain.com"
    ]

    # 安全配置
    SECRET_KEY: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32)
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # 数据库配置
    DATABASE_URL: str
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE: int = 3600

    # Redis配置
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_POOL_SIZE: int = 10

    # 第三方API配置
    SENTRY_DSN: Optional[str] = None
    LOG_LEVEL: str = "INFO"

    # 性能配置
    WORKERS: int = 4
    WORKER_CLASS: str = "uvicorn.workers.UvicornWorker"

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    @validator("DATABASE_URL")
    def validate_database_url(cls, v):
        if not v:
            raise ValueError("DATABASE_URL must be set")
        if v.startswith("postgres://"):
            # 修复Heroku等平台的数据库URL格式
            v = v.replace("postgres://", "postgresql://", 1)
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

# 全局配置实例
settings = Settings()

# 根据不同环境加载配置
def get_settings() -> Settings:
    """获取配置（支持测试环境覆盖）"""
    env = Settings().ENVIRONMENT
    if env == "testing":
        # 测试环境配置
        return Settings(
            _env_file=".env.test",
            DATABASE_URL="sqlite:///./test.db",
            DEBUG=True
        )
    return settings
```

### 使用python-dotenv管理环境变量

```bash
# .env.production 文件示例
APP_NAME=我的生产应用
ENVIRONMENT=production
DATABASE_URL=postgresql://user:password@localhost:5432/production_db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-secret-key-here-change-in-production
LOG_LEVEL=WARNING
SENTRY_DSN=https://your-sentry-dsn@sentry.io/your-project
```

```python
# 加载环境变量
from dotenv import load_dotenv
import os

def load_environment():
    """加载环境变量配置"""
    env = os.getenv("ENVIRONMENT", "development")

    env_files = {
        "development": ".env.dev",
        "testing": ".env.test",
        "production": ".env.prod"
    }

    env_file = env_files.get(env, ".env")
    load_dotenv(env_file)

    print(f"Loaded environment: {env} from {env_file}")

# 在主应用启动前调用
load_environment()
```

## Docker容器化部署

### Dockerfile最佳实践

```dockerfile
# Dockerfile.production
# 使用多阶段构建，减少镜像大小
FROM python:3.9-slim as builder

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 安装Python依赖
COPY requirements/production.txt .
RUN pip install --no-cache-dir --user -r production.txt

# 第二阶段：运行阶段
FROM python:3.9-slim

WORKDIR /app

# 从构建阶段复制Python包
COPY --from=builder /root/.local /root/.local
COPY --from=builder /usr/local/lib/python3.9/site-packages /usr/local/lib/python3.9/site-packages

# 设置环境变量
ENV PATH=/root/.local/bin:$PATH \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 创建非root用户
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# 复制应用代码
COPY --chown=appuser:appuser . .

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=2)"

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### Docker Compose编排

```yaml
# docker-compose.production.yml
version: "3.8"

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.production
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
      - DATABASE_URL=postgresql://user:password@db:5432/app_db
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis
    networks:
      - backend
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  db:
    image: postgres:13-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=app_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - backend
    restart: unless-stopped
    command: >
      postgres -c max_connections=200
               -c shared_buffers=256MB
               -c effective_cache_size=1GB

  redis:
    image: redis:6-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD:-secret}
    volumes:
      - redis_data:/data
    networks:
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - web
    networks:
      - backend
    restart: unless-stopped

  monitor:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks:
      - backend
    restart: unless-stopped

networks:
  backend:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  grafana_data:
```

## Uvicorn与Gunicorn调优

### Uvicorn配置优化

```python
# uvicorn_config.py
import multiprocessing
import os

# 基础配置
host = os.getenv("HOST", "0.0.0.0")
port = int(os.getenv("PORT", 8000))

# 工作进程数
workers = int(os.getenv("WORKERS", multiprocessing.cpu_count() * 2 + 1))

# Uvicorn配置
uvicorn_config = {
    "host": host,
    "port": port,
    "workers": workers,
    "worker_class": "uvicorn.workers.UvicornWorker",

    # 性能优化参数
    "timeout": 120,  # 请求超时时间
    "keepalive": 5,  # keep-alive连接数

    # 日志配置
    "accesslog": "-",  # 访问日志
    "errorlog": "-",   # 错误日志
    "loglevel": os.getenv("LOG_LEVEL", "info").lower(),

    # 优雅关闭
    "graceful_timeout": 30,
    "max_requests": 1000,  # 每个worker处理的最大请求数
    "max_requests_jitter": 100,  # 随机抖动，避免同时重启

    # 安全设置
    "limit_request_line": 4094,  # 最大请求行大小
    "limit_request_fields": 100,  # 最大请求头数量
    "limit_request_field_size": 8190,  # 最大请求头大小
}
```

### Gunicorn配置文件

```python
# gunicorn_config.py
import multiprocessing
import os

# 服务器配置
bind = f"{os.getenv('HOST', '0.0.0.0')}:{os.getenv('PORT', 8000)}"

# 工作进程配置
workers = int(os.getenv('WORKERS', multiprocessing.cpu_count() * 2 + 1))
worker_class = 'uvicorn.workers.UvicornWorker'

# 性能优化
threads = int(os.getenv('THREADS', 1))
worker_connections = int(os.getenv('WORKER_CONNECTIONS', 1000))
timeout = int(os.getenv('TIMEOUT', 120))
keepalive = int(os.getenv('KEEPALIVE', 2))

# 进程名称
proc_name = 'fastapi_app'

# 优雅重启
max_requests = int(os.getenv('MAX_REQUESTS', 1000))
max_requests_jitter = int(os.getenv('MAX_REQUESTS_JITTER', 100))

# 日志配置
accesslog = os.getenv('ACCESS_LOG', '-')
errorlog = os.getenv('ERROR_LOG', '-')
loglevel = os.getenv('LOG_LEVEL', 'info')

# 限制请求大小
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# 前置分叉（pre-fork）优化
preload_app = True  # 在fork worker之前加载应用，减少内存使用

def post_fork(server, worker):
    """Worker fork后的回调"""
    server.log.info(f"Worker spawned (pid: {worker.pid})")

def worker_exit(server, worker):
    """Worker退出时的回调"""
    server.log.info(f"Worker exiting (pid: {worker.pid})")
```

### 启动脚本优化

```bash
#!/bin/bash
# start.sh - 生产环境启动脚本

set -e

# 加载环境变量
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# 检查数据库连接
echo "Checking database connection..."
python -c "
import asyncio
from sqlalchemy import text
from app.db.session import engine
import sys

async def check_db():
    try:
        async with engine.connect() as conn:
            await conn.execute(text('SELECT 1'))
        print('Database connection OK')
        return True
    except Exception as e:
        print(f'Database connection failed: {e}')
        return False

if not asyncio.run(check_db()):
    sys.exit(1)
"

# 运行数据库迁移
echo "Running database migrations..."
alembic upgrade head

# 启动Gunicorn
echo "Starting Gunicorn with Uvicorn workers..."
exec gunicorn \
    --config gunicorn_config.py \
    --worker-tmp-dir /dev/shm \
    --capture-output \
    --enable-stdio-inheritance \
    app.main:app
```

## Nginx反向代理配置

### Nginx主配置文件

```nginx
# nginx/nginx.conf
user nginx;
worker_processes auto;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
    use epoll;
}

http {
    # 基础配置
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    '$request_time $upstream_response_time';

    access_log /var/log/nginx/access.log main buffer=32k flush=5s;
    error_log /var/log/nginx/error.log warn;

    # 性能优化
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        application/javascript
        application/json
        application/xml
        text/css
        text/javascript
        text/plain
        text/xml;

    # 连接限制
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    # 包含站点配置
    include /etc/nginx/conf.d/*.conf;
}
```

### FastAPI应用配置

```nginx
# nginx/conf.d/fastapi.conf
upstream fastapi_backend {
    # 负载均衡配置
    server web:8000;

    # 健康检查
    check interval=3000 rise=2 fall=3 timeout=1000;

    # 保持连接
    keepalive 32;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL配置
    ssl_certificate /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;

    # SSL优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 静态文件服务
    location /static/ {
        alias /app/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";

        # 安全设置
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;
    }

    # 媒体文件
    location /media/ {
        alias /app/media/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # API路由
    location / {
        # 限流
        limit_req zone=api burst=20 nodelay;
        limit_conn addr 10;

        # 代理设置
        proxy_pass http://fastapi_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 缓冲设置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;

        # 缓存设置
        proxy_cache api_cache;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_valid 200 302 10m;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    }

    # 健康检查端点
    location /health {
        access_log off;
        proxy_pass http://fastapi_backend/health;
        proxy_cache_bypass 1;
    }

    # 监控端点
    location /metrics {
        # 需要认证才能访问
        auth_basic "Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://fastapi_backend/metrics;
        proxy_set_header Host $host;
    }
}

# 缓存配置
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m
                 max_size=1g inactive=60m use_temp_path=off;
```

## 数据库连接池优化

### SQLAlchemy连接池配置

```python
# app/db/session.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool, NullPool
from contextlib import asynccontextmanager
from app.core.config import settings
import asyncpg  # PostgreSQL驱动优化

# 基础模型
Base = declarative_base()

def create_engine():
    """创建异步数据库引擎"""

    # 连接池配置
    pool_config = {
        "poolclass": QueuePool,  # 连接池类型
        "pool_size": settings.DB_POOL_SIZE,  # 连接池大小
        "max_overflow": settings.DB_MAX_OVERFLOW,  # 最大溢出连接数
        "pool_recycle": settings.DB_POOL_RECYCLE,  # 连接回收时间（秒）
        "pool_pre_ping": True,  # 连接前ping检查
        "pool_use_lifo": True,  # LIFO模式，减少连接池抖动
        "echo": settings.DEBUG,  # 调试模式下显示SQL
        "echo_pool": settings.DEBUG,  # 调试模式下显示连接池事件
    }

    # 异步PostgreSQL驱动优化
    if settings.DATABASE_URL.startswith("postgresql+asyncpg"):
        # asyncpg特定优化
        pool_config.update({
            "pool_size": 20,  # asyncpg推荐值
            "max_overflow": 10,
            "pool_pre_ping": False,  # asyncpg有自己的连接检查
        })

    # 创建异步引擎
    engine = create_async_engine(
        settings.DATABASE_URL,
        **pool_config,
        # 连接参数优化
        connect_args={
            "server_settings": {
                "jit": "off",  # 关闭JIT，减少查询延迟
                "statement_timeout": "30000",  # 语句超时30秒
            }
        } if "postgresql" in settings.DATABASE_URL else {}
    )

    return engine

# 创建全局引擎
engine = create_engine()

# 创建异步会话工厂
AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # 提交后不使对象过期
    autocommit=False,
    autoflush=False,
)

@asynccontextmanager
async def get_db():
    """数据库会话依赖注入"""
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()

# 批量操作优化
class BulkOperations:
    """批量数据库操作优化"""

    @staticmethod
    async def bulk_insert(session, model, data_list, batch_size=1000):
        """批量插入数据"""
        for i in range(0, len(data_list), batch_size):
            batch = data_list[i:i+batch_size]
            session.add_all([model(**data) for data in batch])

            if i + batch_size >= len(data_list):
                await session.commit()
            else:
                await session.flush()  # 分批刷新，减少内存使用

    @staticmethod
    async def bulk_update(session, query, update_data):
        """批量更新"""
        stmt = query.values(**update_data)
        await session.execute(stmt)
```

### 数据库连接监控

```python
# app/db/monitor.py
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import asyncio
from typing import Dict
import logging

logger = logging.getLogger(__name__)

class DatabaseMonitor:
    """数据库连接监控"""

    def __init__(self, engine):
        self.engine = engine
        self.metrics = {}

    async def collect_metrics(self) -> Dict:
        """收集数据库指标"""
        try:
            async with self.engine.connect() as conn:
                # 获取PostgreSQL连接池状态
                if self.engine.url.drivername == "postgresql+asyncpg":
                    result = await conn.execute(text("""
                        SELECT
                            count(*) as total_connections,
                            sum(case when state = 'active' then 1 else 0 end) as active_connections,
                            sum(case when state = 'idle' then 1 else 0 end) as idle_connections,
                            sum(case when state = 'idle in transaction' then 1 else 0 end) as idle_in_transaction,
                            max(age(now(), query_start)) as longest_query_seconds
                        FROM pg_stat_activity
                        WHERE datname = current_database()
                    """))
                    row = result.fetchone()

                    self.metrics = {
                        "database.connections.total": row.total_connections,
                        "database.connections.active": row.active_connections,
                        "database.connections.idle": row.idle_connections,
                        "database.connections.idle_in_transaction": row.idle_in_transaction,
                        "database.queries.longest_running_seconds": row.longest_query_seconds or 0,
                    }

                # 获取数据库大小
                result = await conn.execute(text("""
                    SELECT pg_database_size(current_database()) as db_size
                """))
                row = result.fetchone()
                self.metrics["database.size_bytes"] = row.db_size

                # 获取表统计信息
                result = await conn.execute(text("""
                    SELECT schemaname, tablename,
                           n_live_tup as live_rows,
                           n_dead_tup as dead_rows,
                           last_vacuum, last_autovacuum,
                           last_analyze, last_autoanalyze
                    FROM pg_stat_user_tables
                    ORDER BY n_live_tup DESC
                    LIMIT 10
                """))

                table_stats = []
                for row in result:
                    table_stats.append(dict(row))

                self.metrics["database.tables.top_10"] = table_stats

                return self.metrics

        except SQLAlchemyError as e:
            logger.error(f"Failed to collect database metrics: {e}")
            return {}

    async def health_check(self) -> bool:
        """数据库健康检查"""
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False
```

## 缓存策略：Redis集成

### Redis连接池与缓存装饰器

```python
# app/core/cache.py
import aioredis
from functools import wraps
from typing import Optional, Any, Callable, Union
import pickle
import hashlib
import json
from datetime import timedelta
import asyncio

class RedisCache:
    """Redis缓存管理器"""

    _instance = None
    _redis_pool = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def init_pool(self, redis_url: str, pool_size: int = 10):
        """初始化Redis连接池"""
        if self._redis_pool is None:
            self._redis_pool = await aioredis.create_redis_pool(
                redis_url,
                minsize=1,
                maxsize=pool_size,
                encoding='utf-8',
                timeout=5.0,  # 连接超时
                db=0,  # 数据库编号
            )

    async def close(self):
        """关闭Redis连接"""
        if self._redis_pool:
            self._redis_pool.close()
            await self._redis_pool.wait_closed()

    async def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        try:
            data = await self._redis_pool.get(key)
            if data:
                return pickle.loads(data)
        except Exception as e:
            print(f"Cache get error: {e}")
            return None

    async def set(self, key: str, value: Any, expire: int = 3600):
        """设置缓存"""
        try:
            data = pickle.dumps(value)
            await self._redis_pool.setex(key, expire, data)
        except Exception as e:
            print(f"Cache set error: {e}")

    async def delete(self, key: str):
        """删除缓存"""
        try:
            await self._redis_pool.delete(key)
        except Exception as e:
            print(f"Cache delete error: {e}")

    async def clear_pattern(self, pattern: str):
        """清除匹配模式的缓存"""
        try:
            keys = await self._redis_pool.keys(pattern)
            if keys:
                await self._redis_pool.delete(*keys)
        except Exception as e:
            print(f"Cache clear pattern error: {e}")

# 缓存装饰器
def cache_key_builder(func, *args, **kwargs) -> str:
    """构建缓存键"""
    # 使用函数名和参数生成哈希键
    key_parts = [func.__module__, func.__name__]

    # 添加位置参数
    for arg in args:
        key_parts.append(str(arg))

    # 添加关键字参数
    for k, v in sorted(kwargs.items()):
        key_parts.append(f"{k}:{v}")

    key_string = ":".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()

def cached(
    expire: int = 300,
    key_prefix: str = "cache",
    unless: Optional[Callable] = None
):
    """缓存装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 检查是否跳过缓存
            if unless and unless(*args, **kwargs):
                return await func(*args, **kwargs)

            # 构建缓存键
            cache_key = f"{key_prefix}:{cache_key_builder(func, *args, **kwargs)}"

            # 尝试从缓存获取
            cache = RedisCache()
            cached_result = await cache.get(cache_key)

            if cached_result is not None:
                return cached_result

            # 缓存未命中，执行函数
            result = await func(*args, **kwargs)

            # 设置缓存
            await cache.set(cache_key, result, expire)

            return result
        return wrapper
    return decorator

# Redis分布式锁
class RedisLock:
    """Redis分布式锁"""

    def __init__(self, redis, key: str, timeout: int = 10):
        self.redis = redis
        self.key = f"lock:{key}"
        self.timeout = timeout
        self.token = None

    async def acquire(self) -> bool:
        """获取锁"""
        import time
        self.token = str(time.time())

        # 使用SETNX实现锁
        acquired = await self.redis.set(
            self.key,
            self.token,
            expire=self.timeout,
            exist=self.redis.SET_IF_NOT_EXIST
        )

        return acquired

    async def release(self):
        """释放锁"""
        if self.token:
            # 使用Lua脚本确保原子性
            lua_script = """
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
            """
            await self.redis.eval(lua_script, [self.key], [self.token])

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.release()
```

### 缓存使用示例

```python
# app/api/cache_demo.py
from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.core.cache import cached, RedisCache, RedisLock
from app.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio

router = APIRouter()

# 商品缓存示例
@router.get("/products/{product_id}")
@cached(expire=600, key_prefix="product")  # 缓存10分钟
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取商品信息（带缓存）"""
    # 模拟数据库查询
    await asyncio.sleep(0.5)

    return {
        "id": product_id,
        "name": f"Product {product_id}",
        "price": 99.99,
        "stock": 100,
        "cached": False
    }

# 商品列表缓存
@router.get("/products/")
@cached(expire=300, key_prefix="product_list")  # 缓存5分钟
async def list_products(
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """获取商品列表（带缓存）"""
    # 模拟复杂查询
    await asyncio.sleep(1)

    products = [
        {
            "id": i,
            "name": f"Product {i}",
            "category": "electronics" if i % 2 == 0 else "books",
            "price": i * 10
        }
        for i in range((page-1)*page_size, page*page_size)
    ]

    if category:
        products = [p for p in products if p["category"] == category]

    return {
        "page": page,
        "page_size": page_size,
        "total": 1000,
        "products": products
    }

# 缓存清除示例
@router.post("/products/{product_id}/clear-cache")
async def clear_product_cache(product_id: int):
    """清除商品缓存"""
    cache = RedisCache()

    # 清除特定商品缓存
    await cache.delete(f"product:{product_id}")

    # 清除相关列表缓存
    await cache.clear_pattern("product_list:*")

    return {"message": "Cache cleared"}
```

## 监控与日志收集

### 结构化日志配置

```python
# app/core/logging.py
import logging
import sys
from logging.config import dictConfig
import json
from pythonjsonlogger import jsonlogger
import time
from typing import Dict, Any

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """自定义JSON日志格式"""

    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)

        if not log_record.get('timestamp'):
            log_record['timestamp'] = time.time()

        if log_record.get('level'):
            log_record['level'] = log_record['level'].upper()
        else:
            log_record['level'] = record.levelname

        # 添加请求ID
        if hasattr(record, 'request_id'):
            log_record['request_id'] = record.request_id

        # 添加用户ID
        if hasattr(record, 'user_id'):
            log_record['user_id'] = record.user_id

        # 添加执行时间
        if hasattr(record, 'duration'):
            log_record['duration'] = record.duration

# 日志配置
LOG_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": CustomJsonFormatter,
            "format": "%(timestamp)s %(level)s %(name)s %(message)s"
        },
        "simple": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "simple",
            "stream": sys.stdout
        },
        "json_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": "INFO",
            "formatter": "json",
            "filename": "logs/app.log",
            "maxBytes": 10485760,  # 10MB
            "backupCount": 10,
            "encoding": "utf8"
        },
        "error_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": "ERROR",
            "formatter": "json",
            "filename": "logs/error.log",
            "maxBytes": 10485760,
            "backupCount": 10,
            "encoding": "utf8"
        }
    },
    "loggers": {
        "": {  # 根日志记录器
            "handlers": ["console", "json_file", "error_file"],
            "level": "INFO",
            "propagate": False
        },
        "uvicorn.access": {
            "handlers": ["json_file"],
            "level": "INFO",
            "propagate": False
        },
        "uvicorn.error": {
            "handlers": ["json_file", "error_file"],
            "level": "INFO",
            "propagate": False
        },
        "sqlalchemy.engine": {
            "handlers": ["json_file"],
            "level": "WARNING",
            "propagate": False
        }
    }
}

def setup_logging():
    """设置日志配置"""
    dictConfig(LOG_CONFIG)

# 请求日志中间件
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import time

logger = logging.getLogger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    """日志中间件"""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # 生成请求ID
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())

        # 获取响应
        try:
            response = await call_next(request)
            duration = time.time() - start_time

            # 记录访问日志
            extra = {
                'request_id': request_id,
                'duration': duration,
                'method': request.method,
                'url': str(request.url),
                'status_code': response.status_code,
                'client_ip': request.client.host if request.client else None,
                'user_agent': request.headers.get('user-agent')
            }

            logger.info(
                f"{request.method} {request.url.path} {response.status_code}",
                extra=extra
            )

            # 添加请求ID到响应头
            response.headers['X-Request-ID'] = request_id

            return response

        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"Request failed: {str(e)}",
                extra={
                    'request_id': request_id,
                    'duration': duration,
                    'method': request.method,
                    'url': str(request.url),
                    'error': str(e)
                },
                exc_info=True
            )
            raise
```

### Prometheus监控集成

```python
# app/core/monitoring.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from prometheus_client.openmetrics.exposition import CONTENT_TYPE_LATEST
from fastapi import Response
import time

# 定义指标
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)

ACTIVE_REQUESTS = Gauge(
    'http_requests_active',
    'Active HTTP requests'
)

DATABASE_QUERIES = Counter(
    'database_queries_total',
    'Total database queries',
    ['operation', 'table']
)

CACHE_HITS = Counter(
    'cache_hits_total',
    'Total cache hits',
    ['type']
)

CACHE_MISSES = Counter(
    'cache_misses_total',
    'Total cache misses',
    ['type']
)

# 监控中间件
class PrometheusMiddleware:
    """Prometheus监控中间件"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        method = scope['method']
        path = self._get_path(scope['path'])

        # 增加活跃请求计数
        ACTIVE_REQUESTS.inc()

        start_time = time.time()

        async def send_wrapper(response):
            if response['type'] == 'http.response.start':
                status = response['status']

                # 记录请求
                REQUEST_COUNT.labels(
                    method=method,
                    endpoint=path,
                    status=status
                ).inc()

                # 记录持续时间
                duration = time.time() - start_time
                REQUEST_DURATION.labels(
                    method=method,
                    endpoint=path
                ).observe(duration)

            await send(response)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            # 减少活跃请求计数
            ACTIVE_REQUESTS.dec()

    def _get_path(self, path: str) -> str:
        """规范化路径用于指标"""
        # 将路径参数替换为占位符
        parts = path.split('/')
        for i, part in enumerate(parts):
            if part.isdigit():
                parts[i] = '{id}'
            elif len(part) == 36 and '-' in part:  # UUID
                parts[i] = '{uuid}'

        return '/'.join(parts)

# 指标端点
def metrics_endpoint(request):
    """提供Prometheus指标"""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
```

### 健康检查端点

```python
# app/api/health.py
from fastapi import APIRouter, Depends
from sqlalchemy import text
from app.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.cache import RedisCache
import asyncio
from typing import Dict

router = APIRouter()

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> Dict:
    """健康检查端点"""
    health_status = {
        "status": "healthy",
        "timestamp": time.time(),
        "services": {}
    }

    # 检查数据库连接
    try:
        await db.execute(text("SELECT 1"))
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        health_status["services"]["database"] = "unhealthy"
        health_status["status"] = "unhealthy"
        health_status["database_error"] = str(e)

    # 检查Redis连接
    try:
        cache = RedisCache()
        await cache._redis_pool.ping()
        health_status["services"]["redis"] = "healthy"
    except Exception as e:
        health_status["services"]["redis"] = "unhealthy"
        health_status["status"] = "unhealthy"
        health_status["redis_error"] = str(e)

    # 检查外部API（示例）
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("https://httpbin.org/status/200")
            if response.status_code == 200:
                health_status["services"]["external_api"] = "healthy"
    except Exception:
        health_status["services"]["external_api"] = "unhealthy"
        # 外部API失败不影响整体状态

    return health_status

@router.get("/metrics")
async def get_metrics():
    """获取应用指标"""
    import psutil
    import os

    process = psutil.Process(os.getpid())

    return {
        "memory": {
            "rss": process.memory_info().rss,
            "vms": process.memory_info().vms,
            "percent": process.memory_percent()
        },
        "cpu": {
            "percent": process.cpu_percent(interval=0.1),
            "count": psutil.cpu_count()
        },
        "threads": process.num_threads(),
        "connections": len(process.connections()),
        "uptime": time.time() - process.create_time()
    }
```

## 部署检查清单

### 生产环境部署检查表

```markdown
## FastAPI生产环境部署检查清单

### ✅ 安全配置

- [ ] 使用环境变量存储敏感信息
- [ ] 配置正确的CORS策略
- [ ] 启用HTTPS
- [ ] 设置安全HTTP头
- [ ] 限制请求大小和频率

### ✅ 性能优化

- [ ] 配置数据库连接池
- [ ] 启用Redis缓存
- [ ] 优化Gunicorn/Uvicorn参数
- [ ] 配置Nginx负载均衡
- [ ] 启用Gzip压缩

### ✅ 监控告警

- [ ] 配置结构化日志
- [ ] 集成Prometheus指标
- [ ] 设置健康检查端点
- [ ] 配置错误追踪（Sentry）
- [ ] 设置性能监控

### ✅ 高可用性

- [ ] 配置多进程/多worker
- [ ] 设置数据库主从复制
- [ ] 配置Redis哨兵或集群
- [ ] 实现优雅关闭
- [ ] 配置自动故障转移

### ✅ 维护性

- [ ] 编写完整的部署文档
- [ ] 配置自动化部署脚本
- [ ] 设置备份策略
- [ ] 配置日志轮转
- [ ] 准备回滚方案
```

## 总结

通过本章的学习，你已经掌握了FastAPI从开发到生产的全链路部署与优化技巧。记住：

1. **配置管理是基础**：环境分离，安全第一
2. **容器化是趋势**：Docker + Docker Compose
3. **性能是关键**：连接池 + 缓存 + 异步
4. **监控是眼睛**：日志 + 指标 + 告警
5. **自动化是未来**：CI/CD + 自动扩展

**记住：好的架构不是设计出来的，而是优化出来的。** 根据你的实际业务场景，选择合适的优化策略，持续监控，持续改进。

---

**实战作业**：将你的FastAPI项目按照本章指南部署到生产环境，并分享遇到的挑战和解决方案。欢迎在评论区交流！
