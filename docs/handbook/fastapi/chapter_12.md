# 实战项目：基于FastAPI的电商API系统从0到1

> 学了这么多FastAPI知识，终于到了实战环节！今天我们将从0到1构建一个完整的电商API系统，涵盖商品、订单、支付、库存等核心功能。这不仅是一个项目，更是你FastAPI技能的集大成者。

## 1. 需求分析与架构设计

### 项目概述

我们要构建的是一个现代化的电商API系统，它需要具备以下核心功能：

**用户功能：**

- 用户注册、登录、个人信息管理
- 浏览商品、搜索、分类查看
- 购物车管理
- 下单、支付、订单追踪
- 商品评价

**商家功能：**

- 商品管理（增删改查）
- 库存管理
- 订单管理
- 数据统计

**系统功能：**

- 权限控制（用户、商家、管理员）
- 支付网关集成
- 推荐系统
- 日志和监控

### 技术栈选择

```
后端框架: FastAPI
数据库: PostgreSQL (主数据) + Redis (缓存/队列)
ORM: SQLAlchemy 2.0 + Alembic (迁移)
认证: JWT + OAuth2
支付: 支付宝/微信支付SDK
缓存: Redis
消息队列: Celery + Redis (异步任务)
部署: Docker + Nginx + Gunicorn
监控: Prometheus + Grafana
```

### 系统架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端 (Web/App)                        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS/WebSocket
┌──────────────────────────────▼──────────────────────────────┐
│                        Nginx反向代理                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                     FastAPI应用集群                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  认证服务  │  │ 商品服务  │  │ 订单服务  │  │ 支付服务  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└────────────┬─────────────────┬─────────────────┬───────────┘
             │                 │                 │
    ┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼──────┐
    │   PostgreSQL    │ │    Redis    │ │   消息队列    │
    │    ┌────────┐   │ │ ┌────────┐  │ │ ┌──────────┐ │
    │    │ 主库   │   │ │ │ 缓存   │  │ │ │  任务队列 │ │
    │    └────────┘   │ │ └────────┘  │ │ └──────────┘ │
    │    ┌────────┐   │ │ ┌────────┐  │ │ ┌──────────┐ │
    │    │ 从库   │   │ │ │ 会话   │  │ │ │  邮件    │ │
    │    └────────┘   │ │ └────────┘  │ │ └──────────┘ │
    └─────────────────┘ └─────────────┘ └──────────────┘
```

### 数据库设计

```sql
-- 核心表结构设计
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_vendor BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id INTEGER REFERENCES categories(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    weight DECIMAL(10, 2),
    weight_unit VARCHAR(10),
    category_id INTEGER REFERENCES categories(id),
    brand VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    is_digital BOOLEAN DEFAULT FALSE,
    requires_shipping BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE,
    name VARCHAR(200),
    price DECIMAL(10, 2) CHECK (price >= 0),
    compare_at_price DECIMAL(10, 2),
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text VARCHAR(200),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    warehouse_id INTEGER,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    low_stock_threshold INTEGER DEFAULT 10,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INTEGER REFERENCES cart(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled, refunded
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    discount_amount DECIMAL(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount DECIMAL(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount DECIMAL(10, 2) DEFAULT 0 CHECK (shipping_amount >= 0),
    final_amount DECIMAL(10, 2) NOT NULL CHECK (final_amount >= 0),
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, refunded
    payment_method VARCHAR(50),
    shipping_address JSONB,
    billing_address JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    product_name VARCHAR(200) NOT NULL,
    variant_name VARCHAR(200),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10, 2) NOT NULL CHECK (total_price >= 0)
);

-- 创建索引以提高查询性能
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
```

## 2. 项目初始化与基础配置

### 项目结构

```
ecommerce_api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # 应用入口
│   ├── core/                   # 核心配置
│   │   ├── __init__.py
│   │   ├── config.py          # 配置管理
│   │   ├── security.py        # 安全相关
│   │   ├── database.py        # 数据库配置
│   │   └── cache.py           # 缓存配置
│   ├── api/                   # API端点
│   │   ├── __init__.py
│   │   ├── deps.py            # 依赖项
│   │   ├── v1/                # API v1
│   │   │   ├── __init__.py
│   │   │   ├── auth.py        # 认证相关
│   │   │   ├── products.py    # 商品相关
│   │   │   ├── cart.py        # 购物车
│   │   │   ├── orders.py      # 订单
│   │   │   ├── payment.py     # 支付
│   │   │   └── admin.py       # 管理后台
│   ├── models/               # 数据库模型
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── product.py
│   │   ├── order.py
│   │   └── base.py           # 基础模型
│   ├── schemas/              # Pydantic模型
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── product.py
│   │   └── order.py
│   ├── services/             # 业务逻辑层
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── product.py
│   │   ├── cart.py
│   │   ├── order.py
│   │   └── payment.py
│   ├── utils/               # 工具函数
│   │   ├── __init__.py
│   │   ├── pagination.py
│   │   ├── search.py
│   │   └── payment_gateways.py
│   └── tasks/               # 异步任务
│       ├── __init__.py
│       ├── inventory.py
│       └── notification.py
├── alembic/                 # 数据库迁移
├── tests/                  # 测试
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

### 核心配置

```python
# app/core/config.py
from pydantic import BaseSettings, Field, validator
from typing import List, Optional
from datetime import timedelta

class Settings(BaseSettings):
    """应用配置"""

    # 应用配置
    APP_NAME: str = "Ecommerce API"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, testing, production

    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    RELOAD: bool = True

    # API配置
    API_V1_STR: str = "/api/v1"
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # 安全配置
    SECRET_KEY: str = Field(..., min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 数据库配置
    DATABASE_URL: str
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE: int = 3600

    # Redis配置
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_POOL_SIZE: int = 10

    # 支付配置
    ALIPAY_APP_ID: Optional[str] = None
    ALIPAY_PRIVATE_KEY: Optional[str] = None
    ALIPAY_PUBLIC_KEY: Optional[str] = None
    WECHAT_APP_ID: Optional[str] = None
    WECHAT_MCH_ID: Optional[str] = None
    WECHAT_API_KEY: Optional[str] = None

    # 文件存储
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # 邮件配置
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[int] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM_EMAIL: Optional[str] = None

    # 监控配置
    SENTRY_DSN: Optional[str] = None
    LOG_LEVEL: str = "INFO"

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    @validator("DATABASE_URL")
    def validate_database_url(cls, v):
        if not v:
            raise ValueError("DATABASE_URL must be set")
        # Heroku等平台的URL格式修复
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

settings = Settings()
```

### 数据库配置

```python
# app/core/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
from app.core.config import settings

# 创建异步引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    poolclass=QueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=True,
)

# 创建会话工厂
AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# 声明基类
Base = declarative_base()

async def get_db() -> AsyncSession:
    """数据库会话依赖注入"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### 应用工厂

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.v1.api import api_router
from app.core.config import settings
from app.core.database import engine
import logging

# 配置日志
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("Starting Ecommerce API...")

    # 初始化数据库
    from app.models.base import Base
    async with engine.begin() as conn:
        # 在生产环境中应该使用Alembic迁移，这里仅用于开发
        if settings.ENVIRONMENT == "development":
            await conn.run_sync(Base.metadata.create_all)

    logger.info("Database initialized")

    yield

    # 关闭时
    logger.info("Shutting down Ecommerce API...")
    await engine.dispose()

def create_application() -> FastAPI:
    """应用工厂函数"""
    application = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # 配置CORS
    if settings.BACKEND_CORS_ORIGINS:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=settings.BACKEND_CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # 注册路由
    application.include_router(api_router, prefix=settings.API_V1_STR)

    # 健康检查端点
    @application.get("/health")
    async def health_check():
        return {"status": "healthy", "timestamp": "now"}

    return application

app = create_application()
```

## 3. 商品模块：分类、搜索、分页

### 商品模型与模式

```python
# app/models/product.py
from sqlalchemy import Column, Integer, String, Text, Numeric, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class Category(Base):
    """商品分类模型"""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # 关系
    parent = relationship("Category", remote_side=[id], backref="children")
    products = relationship("Product", back_populates="category")

class Product(Base):
    """商品模型"""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, nullable=False)
    description = Column(Text)
    short_description = Column(String(500))
    price = Column(Numeric(10, 2), nullable=False)
    compare_at_price = Column(Numeric(10, 2))
    cost_price = Column(Numeric(10, 2))
    sku = Column(String(100), unique=True)
    barcode = Column(String(100))
    weight = Column(Numeric(10, 2))
    weight_unit = Column(String(10))
    category_id = Column(Integer, ForeignKey("categories.id"))
    brand = Column(String(100))
    is_active = Column(Boolean, default=True)
    is_featured = Column(Boolean, default=False)
    is_digital = Column(Boolean, default=False)
    requires_shipping = Column(Boolean, default=True)
    attributes = Column(JSON)  # 商品属性
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # 关系
    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    inventory = relationship("Inventory", back_populates="product", uselist=False)

class ProductVariant(Base):
    """商品变体模型"""
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    sku = Column(String(100), unique=True)
    name = Column(String(200))
    price = Column(Numeric(10, 2))
    compare_at_price = Column(Numeric(10, 2))
    quantity = Column(Integer, default=0)
    attributes = Column(JSON)  # 变体属性，如颜色、尺寸
    created_at = Column(DateTime, server_default=func.now())

    # 关系
    product = relationship("Product", back_populates="variants")
    inventory = relationship("Inventory", back_populates="variant", uselist=False)

class ProductImage(Base):
    """商品图片模型"""
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    url = Column(Text, nullable=False)
    alt_text = Column(String(200))
    sort_order = Column(Integer, default=0)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    # 关系
    product = relationship("Product", back_populates="images")

class Inventory(Base):
    """库存模型"""
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)
    warehouse_id = Column(Integer, default=1)  # 默认仓库
    quantity = Column(Integer, nullable=False, default=0)
    reserved_quantity = Column(Integer, default=0)
    low_stock_threshold = Column(Integer, default=10)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # 关系
    product = relationship("Product", back_populates="inventory")
    variant = relationship("ProductVariant", back_populates="inventory")
```

### Pydantic模式

```python
# app/schemas/product.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal

class CategoryBase(BaseModel):
    """分类基础模式"""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0
    is_active: bool = True

    @validator('slug')
    def validate_slug(cls, v):
        # 确保slug是URL友好的
        import re
        if not re.match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', v):
            raise ValueError('Slug must be URL-friendly')
        return v

class CategoryCreate(CategoryBase):
    """创建分类模式"""
    pass

class CategoryUpdate(BaseModel):
    """更新分类模式"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

class Category(CategoryBase):
    """分类响应模式"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ProductImageBase(BaseModel):
    """商品图片基础模式"""
    url: str
    alt_text: Optional[str] = None
    sort_order: int = 0
    is_primary: bool = False

class ProductImageCreate(ProductImageBase):
    """创建商品图片模式"""
    pass

class ProductImage(ProductImageBase):
    """商品图片响应模式"""
    id: int
    product_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProductVariantBase(BaseModel):
    """商品变体基础模式"""
    sku: Optional[str] = None
    name: Optional[str] = None
    price: Optional[Decimal] = None
    compare_at_price: Optional[Decimal] = None
    quantity: int = 0
    attributes: Optional[Dict[str, Any]] = None

class ProductVariantCreate(ProductVariantBase):
    """创建商品变体模式"""
    pass

class ProductVariant(ProductVariantBase):
    """商品变体响应模式"""
    id: int
    product_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    """商品基础模式"""
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=500)
    price: Decimal = Field(..., gt=0)
    compare_at_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    weight: Optional[Decimal] = None
    weight_unit: Optional[str] = None
    category_id: Optional[int] = None
    brand: Optional[str] = None
    is_active: bool = True
    is_featured: bool = False
    is_digital: bool = False
    requires_shipping: bool = True
    attributes: Optional[Dict[str, Any]] = None

class ProductCreate(ProductBase):
    """创建商品模式"""
    variants: Optional[List[ProductVariantCreate]] = None
    images: Optional[List[ProductImageCreate]] = None

class ProductUpdate(BaseModel):
    """更新商品模式"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=500)
    price: Optional[Decimal] = Field(None, gt=0)
    compare_at_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    category_id: Optional[int] = None
    brand: Optional[str] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None

class Product(ProductBase):
    """商品响应模式"""
    id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[Category] = None
    variants: List[ProductVariant] = []
    images: List[ProductImage] = []
    inventory: Optional["Inventory"] = None

    class Config:
        from_attributes = True

class InventoryBase(BaseModel):
    """库存基础模式"""
    product_id: int
    variant_id: Optional[int] = None
    warehouse_id: int = 1
    quantity: int = 0
    reserved_quantity: int = 0
    low_stock_threshold: int = 10

class Inventory(InventoryBase):
    """库存响应模式"""
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True

# 解决循环引用
Product.update_forward_refs()
```

### 商品服务层

```python
# app/services/product.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, text
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal
import math
from app.models.product import Product, Category, ProductVariant, ProductImage, Inventory
from app.schemas.product import ProductCreate, ProductUpdate, CategoryCreate
from app.core.exceptions import NotFoundException, BadRequestException

class ProductService:
    """商品服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_product(self, product_id: int) -> Optional[Product]:
        """获取单个商品"""
        query = select(Product).where(
            Product.id == product_id,
            Product.is_active == True
        ).options(
            selectinload(Product.category),
            selectinload(Product.variants),
            selectinload(Product.images),
            selectinload(Product.inventory)
        )

        result = await self.db.execute(query)
        product = result.scalar_one_or_none()

        if not product:
            raise NotFoundException(f"Product {product_id} not found")

        return product

    async def list_products(
        self,
        skip: int = 0,
        limit: int = 20,
        category_id: Optional[int] = None,
        featured: Optional[bool] = None,
        min_price: Optional[Decimal] = None,
        max_price: Optional[Decimal] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Product], int]:
        """获取商品列表"""
        # 构建基础查询
        query = select(Product).where(Product.is_active == True)
        count_query = select(func.count()).select_from(Product).where(Product.is_active == True)

        # 应用过滤条件
        if category_id:
            query = query.where(Product.category_id == category_id)
            count_query = count_query.where(Product.category_id == category_id)

        if featured is not None:
            query = query.where(Product.is_featured == featured)
            count_query = count_query.where(Product.is_featured == featured)

        if min_price:
            query = query.where(Product.price >= min_price)
            count_query = count_query.where(Product.price >= min_price)

        if max_price:
            query = query.where(Product.price <= max_price)
            count_query = count_query.where(Product.price <= max_price)

        # 搜索功能
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Product.name.ilike(search_term),
                    Product.description.ilike(search_term),
                    Product.sku.ilike(search_term)
                )
            )
            count_query = count_query.where(
                or_(
                    Product.name.ilike(search_term),
                    Product.description.ilike(search_term),
                    Product.sku.ilike(search_term)
                )
            )

        # 排序
        sort_column = getattr(Product, sort_by, Product.created_at)
        if sort_order.lower() == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())

        # 分页
        query = query.offset(skip).limit(limit)

        # 执行查询
        result = await self.db.execute(query)
        products = result.scalars().all()

        # 获取总数
        count_result = await self.db.execute(count_query)
        total = count_result.scalar_one()

        return products, total

    async def create_product(self, product_data: ProductCreate) -> Product:
        """创建商品"""
        # 检查分类是否存在
        if product_data.category_id:
            category = await self.db.get(Category, product_data.category_id)
            if not category:
                raise BadRequestException(f"Category {product_data.category_id} not found")

        # 检查SKU是否重复
        if product_data.sku:
            existing = await self.db.execute(
                select(Product).where(Product.sku == product_data.sku)
            )
            if existing.scalar_one_or_none():
                raise BadRequestException(f"SKU {product_data.sku} already exists")

        # 创建商品
        db_product = Product(**product_data.dict(exclude={"variants", "images"}))
        self.db.add(db_product)
        await self.db.flush()

        # 添加变体
        if product_data.variants:
            for variant_data in product_data.variants:
                db_variant = ProductVariant(
                    **variant_data.dict(),
                    product_id=db_product.id
                )
                self.db.add(db_variant)

        # 添加图片
        if product_data.images:
            for image_data in product_data.images:
                db_image = ProductImage(
                    **image_data.dict(),
                    product_id=db_product.id
                )
                self.db.add(db_image)

        # 创建库存记录
        db_inventory = Inventory(
            product_id=db_product.id,
            quantity=0,
            reserved_quantity=0
        )
        self.db.add(db_inventory)

        await self.db.commit()
        await self.db.refresh(db_product)

        return db_product

    async def update_product(self, product_id: int, product_data: ProductUpdate) -> Product:
        """更新商品"""
        product = await self.get_product(product_id)

        update_data = product_data.dict(exclude_unset=True)

        for field, value in update_data.items():
            setattr(product, field, value)

        product.updated_at = func.now()
        await self.db.commit()
        await self.db.refresh(product)

        return product

    async def delete_product(self, product_id: int) -> bool:
        """删除商品（软删除）"""
        product = await self.get_product(product_id)
        product.is_active = False
        product.updated_at = func.now()

        await self.db.commit()
        return True

    async def update_inventory(
        self,
        product_id: int,
        quantity_change: int,
        variant_id: Optional[int] = None,
        reserved: bool = False
    ) -> Inventory:
        """更新库存"""
        query = select(Inventory).where(
            Inventory.product_id == product_id,
            Inventory.variant_id == variant_id
        )

        result = await self.db.execute(query)
        inventory = result.scalar_one_or_none()

        if not inventory:
            # 创建库存记录
            inventory = Inventory(
                product_id=product_id,
                variant_id=variant_id,
                quantity=0,
                reserved_quantity=0
            )
            self.db.add(inventory)
            await self.db.flush()

        # 更新库存
        if reserved:
            new_reserved = inventory.reserved_quantity + quantity_change
            if new_reserved < 0:
                raise BadRequestException("Reserved quantity cannot be negative")
            if new_reserved > inventory.quantity:
                raise BadRequestException("Cannot reserve more than available quantity")

            inventory.reserved_quantity = new_reserved
        else:
            new_quantity = inventory.quantity + quantity_change
            if new_quantity < 0:
                raise BadRequestException("Quantity cannot be negative")

            inventory.quantity = new_quantity

        inventory.updated_at = func.now()
        await self.db.commit()
        await self.db.refresh(inventory)

        return inventory

class CategoryService:
    """分类服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_category(self, category_id: int) -> Optional[Category]:
        """获取单个分类"""
        category = await self.db.get(Category, category_id)
        if not category or not category.is_active:
            raise NotFoundException(f"Category {category_id} not found")
        return category

    async def list_categories(
        self,
        parent_id: Optional[int] = None,
        only_active: bool = True
    ) -> List[Category]:
        """获取分类列表"""
        query = select(Category)

        if only_active:
            query = query.where(Category.is_active == True)

        if parent_id is None:
            query = query.where(Category.parent_id.is_(None))
        elif parent_id == 0:
            # 获取所有顶级分类
            query = query.where(Category.parent_id.is_(None))
        else:
            query = query.where(Category.parent_id == parent_id)

        query = query.order_by(Category.sort_order, Category.name)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def create_category(self, category_data: CategoryCreate) -> Category:
        """创建分类"""
        # 检查父分类是否存在
        if category_data.parent_id:
            parent = await self.db.get(Category, category_data.parent_id)
            if not parent:
                raise BadRequestException(f"Parent category {category_data.parent_id} not found")

        # 检查slug是否重复
        existing = await self.db.execute(
            select(Category).where(Category.slug == category_data.slug)
        )
        if existing.scalar_one_or_none():
            raise BadRequestException(f"Slug {category_data.slug} already exists")

        db_category = Category(**category_data.dict())
        self.db.add(db_category)
        await self.db.commit()
        await self.db.refresh(db_category)

        return db_category

    async def get_category_tree(self) -> List[Dict[str, Any]]:
        """获取分类树"""
        query = select(Category).where(
            Category.is_active == True
        ).order_by(Category.parent_id, Category.sort_order, Category.name)

        result = await self.db.execute(query)
        categories = result.scalars().all()

        # 构建树形结构
        category_dict = {}
        for category in categories:
            category_dict[category.id] = {
                "id": category.id,
                "name": category.name,
                "slug": category.slug,
                "parent_id": category.parent_id,
                "children": []
            }

        tree = []
        for category_id, category_data in category_dict.items():
            parent_id = category_data["parent_id"]
            if parent_id is None:
                tree.append(category_data)
            else:
                parent = category_dict.get(parent_id)
                if parent:
                    parent["children"].append(category_data)

        return tree
```

### 商品API端点

```python
# app/api/v1/products.py
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from decimal import Decimal
from app.api.deps import get_db, get_current_user
from app.schemas.product import Product, ProductCreate, ProductUpdate, Category, CategoryCreate
from app.schemas.common import PaginatedResponse
from app.services.product import ProductService, CategoryService
from app.models.user import User

router = APIRouter(prefix="/products", tags=["products"])

@router.get("/", response_model=PaginatedResponse[Product])
async def list_products(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(20, ge=1, le=100, description="每页记录数"),
    category_id: Optional[int] = Query(None, description="分类ID"),
    featured: Optional[bool] = Query(None, description="是否推荐"),
    min_price: Optional[Decimal] = Query(None, ge=0, description="最低价格"),
    max_price: Optional[Decimal] = Query(None, ge=0, description="最高价格"),
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序顺序")
):
    """获取商品列表"""
    product_service = ProductService(db)
    products, total = await product_service.list_products(
        skip=skip,
        limit=limit,
        category_id=category_id,
        featured=featured,
        min_price=min_price,
        max_price=max_price,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return PaginatedResponse(
        data=products,
        total=total,
        skip=skip,
        limit=limit
    )

@router.get("/{product_id}", response_model=Product)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取单个商品"""
    product_service = ProductService(db)
    product = await product_service.get_product(product_id)
    return product

@router.post("/", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(
    product_data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建商品（需要商家权限）"""
    if not current_user.is_vendor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors can create products"
        )

    product_service = ProductService(db)
    product = await product_service.create_product(product_data)
    return product

@router.put("/{product_id}", response_model=Product)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新商品（需要商家权限）"""
    if not current_user.is_vendor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors can update products"
        )

    product_service = ProductService(db)
    product = await product_service.update_product(product_id, product_data)
    return product

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除商品（需要商家权限）"""
    if not current_user.is_vendor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors can delete products"
        )

    product_service = ProductService(db)
    await product_service.delete_product(product_id)
    return None

# 分类相关端点
@router.get("/categories/", response_model=List[Category])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    parent_id: Optional[int] = Query(None, description="父分类ID")
):
    """获取分类列表"""
    category_service = CategoryService(db)
    categories = await category_service.list_categories(parent_id=parent_id)
    return categories

@router.get("/categories/tree/")
async def get_category_tree(db: AsyncSession = Depends(get_db)):
    """获取分类树"""
    category_service = CategoryService(db)
    tree = await category_service.get_category_tree()
    return tree

@router.get("/categories/{category_id}", response_model=Category)
async def get_category(
    category_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取单个分类"""
    category_service = CategoryService(db)
    category = await category_service.get_category(category_id)
    return category

@router.post("/categories/", response_model=Category, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建分类（需要管理员权限）"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create categories"
        )

    category_service = CategoryService(db)
    category = await category_service.create_category(category_data)
    return category
```

## 4. 购物车与订单系统

### 购物车与订单模型

```python
# app/models/order.py
from sqlalchemy import Column, Integer, String, Text, Numeric, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class Cart(Base):
    """购物车模型"""
    __tablename__ = "cart"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="cart")
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")

class CartItem(Base):
    """购物车项模型"""
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("cart.id", ondelete="CASCADE"))
    product_id = Column(Integer, ForeignKey("products.id"))
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    added_at = Column(DateTime, server_default=func.now())

    # 关系
    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")

class Order(Base):
    """订单模型"""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String(20), default="pending")  # pending, processing, shipped, delivered, cancelled, refunded
    total_amount = Column(Numeric(10, 2), nullable=False)
    discount_amount = Column(Numeric(10, 2), default=0)
    tax_amount = Column(Numeric(10, 2), default=0)
    shipping_amount = Column(Numeric(10, 2), default=0)
    final_amount = Column(Numeric(10, 2), nullable=False)
    payment_status = Column(String(20), default="pending")  # pending, paid, failed, refunded
    payment_method = Column(String(50))
    payment_id = Column(String(100))  # 第三方支付ID
    shipping_address = Column(JSON)
    billing_address = Column(JSON)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    """订单项模型"""
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    product_id = Column(Integer, ForeignKey("products.id"))
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)
    product_name = Column(String(200), nullable=False)
    variant_name = Column(String(200))
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    total_price = Column(Numeric(10, 2), nullable=False)

    # 关系
    order = relationship("Order", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")

class OrderLog(Base):
    """订单日志模型"""
    __tablename__ = "order_logs"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    status_from = Column(String(20))
    status_to = Column(String(20))
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    # 关系
    order = relationship("Order")
```

### 购物车与订单模式

```python
# app/schemas/order.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from enum import Enum

class OrderStatus(str, Enum):
    """订单状态枚举"""
    PENDING = "pending"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"

class PaymentStatus(str, Enum):
    """支付状态枚举"""
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"

class AddressSchema(BaseModel):
    """地址模式"""
    full_name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=1, max_length=20)
    country: str = Field(..., min_length=1, max_length=50)
    province: str = Field(..., min_length=1, max_length=50)
    city: str = Field(..., min_length=1, max_length=50)
    district: Optional[str] = None
    street: str = Field(..., min_length=1, max_length=200)
    postal_code: str = Field(..., min_length=1, max_length=20)

class CartItemBase(BaseModel):
    """购物车项基础模式"""
    product_id: int
    variant_id: Optional[int] = None
    quantity: int = Field(..., gt=0)

class CartItemCreate(CartItemBase):
    """创建购物车项模式"""
    pass

class CartItem(CartItemBase):
    """购物车项响应模式"""
    id: int
    cart_id: int
    price: Decimal
    added_at: datetime
    product_name: Optional[str] = None
    variant_name: Optional[str] = None
    product_image: Optional[str] = None

    class Config:
        from_attributes = True

class CartBase(BaseModel):
    """购物车基础模式"""
    pass

class Cart(CartBase):
    """购物车响应模式"""
    id: int
    user_id: Optional[int]
    session_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    items: List[CartItem] = []
    total_items: int = 0
    total_amount: Decimal = Decimal("0")

    class Config:
        from_attributes = True

class OrderItemBase(BaseModel):
    """订单项基础模式"""
    product_id: int
    variant_id: Optional[int] = None
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., gt=0)

class OrderItemCreate(OrderItemBase):
    """创建订单项模式"""
    pass

class OrderItem(OrderItemBase):
    """订单项响应模式"""
    id: int
    order_id: int
    product_name: str
    variant_name: Optional[str]
    total_price: Decimal

    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    """订单基础模式"""
    shipping_address: AddressSchema
    billing_address: Optional[AddressSchema] = None
    notes: Optional[str] = None
    payment_method: str = Field(..., min_length=1, max_length=50)

    @validator("billing_address")
    def set_billing_address(cls, v, values):
        if v is None and "shipping_address" in values:
            # 如果未提供账单地址，默认使用配送地址
            return values["shipping_address"]
        return v

class OrderCreate(OrderBase):
    """创建订单模式"""
    cart_id: Optional[int] = None  # 从购物车创建
    items: Optional[List[OrderItemCreate]] = None  # 直接创建

class OrderUpdate(BaseModel):
    """更新订单模式"""
    status: Optional[OrderStatus] = None
    payment_status: Optional[PaymentStatus] = None
    notes: Optional[str] = None

class Order(OrderBase):
    """订单响应模式"""
    id: int
    order_number: str
    user_id: int
    status: OrderStatus
    total_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    final_amount: Decimal
    payment_status: PaymentStatus
    payment_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    items: List[OrderItem] = []

    class Config:
        from_attributes = True

class OrderLogBase(BaseModel):
    """订单日志基础模式"""
    status_from: Optional[str] = None
    status_to: str
    notes: Optional[str] = None

class OrderLog(OrderLogBase):
    """订单日志响应模式"""
    id: int
    order_id: int
    created_at: datetime

    class Config:
        from_attributes = True
```

### 购物车服务

```python
# app/services/cart.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from typing import Optional, List, Dict, Any
from decimal import Decimal
import uuid
from app.models.order import Cart, CartItem
from app.models.product import Product, ProductVariant, ProductImage
from app.schemas.order import CartItemCreate
from app.core.exceptions import NotFoundException, BadRequestException

class CartService:
    """购物车服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_cart(
        self,
        user_id: Optional[int] = None,
        session_id: Optional[str] = None
    ) -> Cart:
        """获取或创建购物车"""
        if user_id:
            # 已登录用户：按用户ID查找
            query = select(Cart).where(
                Cart.user_id == user_id,
                Cart.session_id.is_(None)  # 用户购物车不使用session_id
            ).options(
                selectinload(Cart.items).selectinload(CartItem.product),
                selectinload(Cart.items).selectinload(CartItem.variant)
            )
        elif session_id:
            # 未登录用户：按session_id查找
            query = select(Cart).where(
                Cart.session_id == session_id,
                Cart.user_id.is_(None)  # session购物车未绑定用户
            ).options(
                selectinload(Cart.items).selectinload(CartItem.product),
                selectinload(Cart.items).selectinload(CartItem.variant)
            )
        else:
            # 创建新的session购物车
            session_id = str(uuid.uuid4())
            return await self.create_cart(session_id=session_id)

        result = await self.db.execute(query)
        cart = result.scalar_one_or_none()

        if not cart:
            if user_id:
                cart = await self.create_cart(user_id=user_id)
            else:
                cart = await self.create_cart(session_id=session_id)

        return cart

    async def create_cart(
        self,
        user_id: Optional[int] = None,
        session_id: Optional[str] = None
    ) -> Cart:
        """创建购物车"""
        cart = Cart(user_id=user_id, session_id=session_id)
        self.db.add(cart)
        await self.db.commit()
        await self.db.refresh(cart)
        return cart

    async def add_to_cart(
        self,
        cart_id: int,
        item_data: CartItemCreate
    ) -> CartItem:
        """添加商品到购物车"""
        # 验证商品是否存在且有库存
        product = await self.db.get(Product, item_data.product_id)
        if not product or not product.is_active:
            raise NotFoundException(f"Product {item_data.product_id} not found")

        # 检查变体
        variant = None
        if item_data.variant_id:
            variant = await self.db.get(ProductVariant, item_data.variant_id)
            if not variant or variant.product_id != product.id:
                raise BadRequestException("Invalid variant for product")

        # 检查库存
        quantity_available = await self.check_stock(
            product.id,
            variant.id if variant else None,
            item_data.quantity
        )
        if not quantity_available:
            raise BadRequestException("Insufficient stock")

        # 检查购物车中是否已存在相同商品
        existing_item = await self.db.execute(
            select(CartItem).where(
                CartItem.cart_id == cart_id,
                CartItem.product_id == item_data.product_id,
                CartItem.variant_id == item_data.variant_id
            )
        )
        existing_item = existing_item.scalar_one_or_none()

        if existing_item:
            # 更新数量
            existing_item.quantity += item_data.quantity
            # 使用变体价格或商品价格
            price = variant.price if variant and variant.price else product.price
            existing_item.price = price
            cart_item = existing_item
        else:
            # 创建新项
            price = variant.price if variant and variant.price else product.price
            cart_item = CartItem(
                cart_id=cart_id,
                product_id=item_data.product_id,
                variant_id=item_data.variant_id,
                quantity=item_data.quantity,
                price=price
            )
            self.db.add(cart_item)

        await self.db.commit()
        await self.db.refresh(cart_item)

        return cart_item

    async def update_cart_item(
        self,
        cart_item_id: int,
        quantity: int
    ) -> CartItem:
        """更新购物车项数量"""
        cart_item = await self.db.get(CartItem, cart_item_id)
        if not cart_item:
            raise NotFoundException("Cart item not found")

        # 检查库存
        quantity_available = await self.check_stock(
            cart_item.product_id,
            cart_item.variant_id,
            quantity
        )
        if not quantity_available:
            raise BadRequestException("Insufficient stock")

        if quantity <= 0:
            # 数量为0或负数，删除该项
            await self.db.delete(cart_item)
            await self.db.commit()
            return None

        cart_item.quantity = quantity
        await self.db.commit()
        await self.db.refresh(cart_item)

        return cart_item

    async def remove_from_cart(self, cart_item_id: int) -> bool:
        """从购物车移除商品"""
        cart_item = await self.db.get(CartItem, cart_item_id)
        if not cart_item:
            raise NotFoundException("Cart item not found")

        await self.db.delete(cart_item)
        await self.db.commit()
        return True

    async def clear_cart(self, cart_id: int) -> bool:
        """清空购物车"""
        query = select(CartItem).where(CartItem.cart_id == cart_id)
        result = await self.db.execute(query)
        items = result.scalars().all()

        for item in items:
            await self.db.delete(item)

        await self.db.commit()
        return True

    async def merge_carts(
        self,
        session_cart_id: int,
        user_cart_id: int
    ) -> Cart:
        """合并session购物车到用户购物车"""
        # 获取session购物车的所有项
        query = select(CartItem).where(CartItem.cart_id == session_cart_id)
        result = await self.db.execute(query)
        session_items = result.scalars().all()

        # 将session购物车的项合并到用户购物车
        for session_item in session_items:
            # 检查用户购物车中是否已存在相同商品
            existing_item = await self.db.execute(
                select(CartItem).where(
                    CartItem.cart_id == user_cart_id,
                    CartItem.product_id == session_item.product_id,
                    CartItem.variant_id == session_item.variant_id
                )
            )
            existing_item = existing_item.scalar_one_or_none()

            if existing_item:
                # 合并数量
                existing_item.quantity += session_item.quantity
                # 删除session购物车项
                await self.db.delete(session_item)
            else:
                # 移动到用户购物车
                session_item.cart_id = user_cart_id

        # 删除session购物车
        session_cart = await self.db.get(Cart, session_cart_id)
        if session_cart:
            await self.db.delete(session_cart)

        await self.db.commit()

        # 返回用户购物车
        user_cart = await self.db.get(Cart, user_cart_id)
        await self.db.refresh(user_cart)

        return user_cart

    async def get_cart_summary(self, cart_id: int) -> Dict[str, Any]:
        """获取购物车摘要"""
        query = select(Cart).where(Cart.id == cart_id).options(
            selectinload(Cart.items).selectinload(CartItem.product),
            selectinload(Cart.items).selectinload(CartItem.variant)
        )
        result = await self.db.execute(query)
        cart = result.scalar_one_or_none()

        if not cart:
            raise NotFoundException("Cart not found")

        total_items = 0
        total_amount = Decimal("0")

        for item in cart.items:
            total_items += item.quantity
            item_total = item.price * item.quantity
            total_amount += item_total

        return {
            "cart_id": cart.id,
            "total_items": total_items,
            "total_amount": total_amount,
            "items_count": len(cart.items)
        }

    async def check_stock(
        self,
        product_id: int,
        variant_id: Optional[int],
        quantity: int
    ) -> bool:
        """检查库存"""
        from app.models.product import Inventory

        query = select(Inventory).where(
            Inventory.product_id == product_id,
            Inventory.variant_id == variant_id
        )
        result = await self.db.execute(query)
        inventory = result.scalar_one_or_none()

        if not inventory:
            return False

        available = inventory.quantity - inventory.reserved_quantity
        return available >= quantity
```

### 订单服务

```python
# app/services/order.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload, joinedload
from typing import Optional, List, Dict, Any
from decimal import Decimal
import uuid
from datetime import datetime
from app.models.order import Order, OrderItem, OrderLog, Cart, CartItem
from app.models.product import Product, ProductVariant, Inventory
from app.schemas.order import OrderCreate, OrderUpdate, OrderStatus, PaymentStatus
from app.core.exceptions import NotFoundException, BadRequestException
from app.services.cart import CartService
from app.services.product import ProductService

class OrderService:
    """订单服务"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.cart_service = CartService(db)
        self.product_service = ProductService(db)

    async def create_order(
        self,
        user_id: int,
        order_data: OrderCreate
    ) -> Order:
        """创建订单"""
        order_items = []
        total_amount = Decimal("0")

        # 如果提供了购物车ID，从购物车获取商品
        if order_data.cart_id:
            cart = await self.db.get(Cart, order_data.cart_id)
            if not cart or cart.user_id != user_id:
                raise BadRequestException("Invalid cart")

            # 将购物车项转换为订单项
            for cart_item in cart.items:
                # 检查库存
                quantity_available = await self.cart_service.check_stock(
                    cart_item.product_id,
                    cart_item.variant_id,
                    cart_item.quantity
                )
                if not quantity_available:
                    raise BadRequestException(
                        f"Insufficient stock for product {cart_item.product_id}"
                    )

                # 获取商品信息
                product = await self.db.get(Product, cart_item.product_id)
                if not product:
                    raise BadRequestException(f"Product {cart_item.product_id} not found")

                variant = None
                if cart_item.variant_id:
                    variant = await self.db.get(ProductVariant, cart_item.variant_id)

                # 计算金额
                unit_price = cart_item.price
                item_total = unit_price * cart_item.quantity
                total_amount += item_total

                # 创建订单项
                order_item = OrderItem(
                    product_id=cart_item.product_id,
                    variant_id=cart_item.variant_id,
                    product_name=product.name,
                    variant_name=variant.name if variant else None,
                    quantity=cart_item.quantity,
                    unit_price=unit_price,
                    total_price=item_total
                )
                order_items.append(order_item)

        # 如果直接提供了订单项
        elif order_data.items:
            for item_data in order_data.items:
                # 检查库存
                quantity_available = await self.cart_service.check_stock(
                    item_data.product_id,
                    item_data.variant_id,
                    item_data.quantity
                )
                if not quantity_available:
                    raise BadRequestException(
                        f"Insufficient stock for product {item_data.product_id}"
                    )

                # 获取商品信息
                product = await self.db.get(Product, item_data.product_id)
                if not product:
                    raise BadRequestException(f"Product {item_data.product_id} not found")

                variant = None
                if item_data.variant_id:
                    variant = await self.db.get(ProductVariant, item_data.variant_id)

                # 计算金额
                unit_price = item_data.unit_price
                item_total = unit_price * item_data.quantity
                total_amount += item_total

                # 创建订单项
                order_item = OrderItem(
                    product_id=item_data.product_id,
                    variant_id=item_data.variant_id,
                    product_name=product.name,
                    variant_name=variant.name if variant else None,
                    quantity=item_data.quantity,
                    unit_price=unit_price,
                    total_price=item_total
                )
                order_items.append(order_item)

        else:
            raise BadRequestException("No items provided for order")

        # 计算最终金额（这里可以添加折扣、税费、运费等计算）
        discount_amount = Decimal("0")
        tax_amount = total_amount * Decimal("0.10")  # 10%税费（示例）
        shipping_amount = Decimal("10.00")  # 固定运费（示例）
        final_amount = total_amount + tax_amount + shipping_amount - discount_amount

        # 生成订单号
        order_number = self.generate_order_number()

        # 创建订单
        db_order = Order(
            order_number=order_number,
            user_id=user_id,
            status=OrderStatus.PENDING,
            total_amount=total_amount,
            discount_amount=discount_amount,
            tax_amount=tax_amount,
            shipping_amount=shipping_amount,
            final_amount=final_amount,
            payment_status=PaymentStatus.PENDING,
            payment_method=order_data.payment_method,
            shipping_address=order_data.shipping_address.dict(),
            billing_address=order_data.billing_address.dict() if order_data.billing_address else None,
            notes=order_data.notes
        )

        # 添加订单项
        for item in order_items:
            db_order.items.append(item)

        self.db.add(db_order)

        # 如果是从购物车创建的订单，清空购物车
        if order_data.cart_id:
            await self.cart_service.clear_cart(order_data.cart_id)

        await self.db.commit()
        await self.db.refresh(db_order)

        # 创建订单日志
        await self.create_order_log(
            db_order.id,
            None,
            OrderStatus.PENDING,
            "Order created"
        )

        # 预留库存
        await self.reserve_inventory_for_order(db_order)

        return db_order

    async def get_order(self, order_id: int, user_id: Optional[int] = None) -> Order:
        """获取订单"""
        query = select(Order).where(Order.id == order_id)

        if user_id:
            query = query.where(Order.user_id == user_id)

        query = query.options(
            selectinload(Order.items),
            selectinload(Order.user)
        )

        result = await self.db.execute(query)
        order = result.scalar_one_or_none()

        if not order:
            raise NotFoundException(f"Order {order_id} not found")

        return order

    async def list_orders(
        self,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> tuple[List[Order], int]:
        """获取订单列表"""
        query = select(Order)
        count_query = select(func.count()).select_from(Order)

        if user_id:
            query = query.where(Order.user_id == user_id)
            count_query = count_query.where(Order.user_id == user_id)

        if status:
            query = query.where(Order.status == status)
            count_query = count_query.where(Order.status == status)

        if start_date:
            query = query.where(Order.created_at >= start_date)
            count_query = count_query.where(Order.created_at >= start_date)

        if end_date:
            query = query.where(Order.created_at <= end_date)
            count_query = count_query.where(Order.created_at <= end_date)

        # 按创建时间倒序排序
        query = query.order_by(Order.created_at.desc())

        # 分页
        query = query.offset(skip).limit(limit)

        # 执行查询
        result = await self.db.execute(query)
        orders = result.scalars().all()

        count_result = await self.db.execute(count_query)
        total = count_result.scalar_one()

        return orders, total

    async def update_order(
        self,
        order_id: int,
        order_data: OrderUpdate,
        user_id: Optional[int] = None
    ) -> Order:
        """更新订单"""
        order = await self.get_order(order_id, user_id)

        update_data = order_data.dict(exclude_unset=True)

        # 记录状态变化
        if "status" in update_data and update_data["status"] != order.status:
            await self.create_order_log(
                order.id,
                order.status,
                update_data["status"],
                order_data.notes or "Status updated"
            )

        # 更新字段
        for field, value in update_data.items():
            setattr(order, field, value)

        order.updated_at = func.now()
        await self.db.commit()
        await self.db.refresh(order)

        return order

    async def cancel_order(self, order_id: int, user_id: Optional[int] = None) -> Order:
        """取消订单"""
        order = await self.get_order(order_id, user_id)

        # 检查是否可以取消
        if order.status not in [OrderStatus.PENDING, OrderStatus.PROCESSING]:
            raise BadRequestException(f"Cannot cancel order in {order.status} status")

        # 更新状态
        old_status = order.status
        order.status = OrderStatus.CANCELLED

        # 创建日志
        await self.create_order_log(
            order.id,
            old_status,
            OrderStatus.CANCELLED,
            "Order cancelled by user"
        )

        # 释放预留库存
        await self.release_inventory_for_order(order)

        order.updated_at = func.now()
        await self.db.commit()
        await self.db.refresh(order)

        return order

    async def update_payment_status(
        self,
        order_id: int,
        payment_status: PaymentStatus,
        payment_id: Optional[str] = None
    ) -> Order:
        """更新支付状态"""
        order = await self.get_order(order_id)

        old_status = order.payment_status
        order.payment_status = payment_status

        if payment_id:
            order.payment_id = payment_id

        # 如果支付成功，更新订单状态为processing
        if payment_status == PaymentStatus.PAID and order.status == OrderStatus.PENDING:
            order.status = OrderStatus.PROCESSING
            await self.create_order_log(
                order.id,
                OrderStatus.PENDING,
                OrderStatus.PROCESSING,
                "Payment received, order processing"
            )

        # 创建支付状态日志
        await self.create_order_log(
            order.id,
            old_status,
            payment_status,
            "Payment status updated"
        )

        order.updated_at = func.now()
        await self.db.commit()
        await self.db.refresh(order)

        return order

    async def create_order_log(
        self,
        order_id: int,
        status_from: Optional[str],
        status_to: str,
        notes: Optional[str] = None
    ) -> OrderLog:
        """创建订单日志"""
        order_log = OrderLog(
            order_id=order_id,
            status_from=status_from,
            status_to=status_to,
            notes=notes
        )
        self.db.add(order_log)
        await self.db.commit()
        await self.db.refresh(order_log)
        return order_log

    async def get_order_logs(self, order_id: int) -> List[OrderLog]:
        """获取订单日志"""
        query = select(OrderLog).where(
            OrderLog.order_id == order_id
        ).order_by(OrderLog.created_at.desc())

        result = await self.db.execute(query)
        return result.scalars().all()

    def generate_order_number(self) -> str:
        """生成订单号"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_part = str(uuid.uuid4().int)[:8]
        return f"ORD{timestamp}{random_part}"

    async def reserve_inventory_for_order(self, order: Order):
        """为订单预留库存"""
        for item in order.items:
            await self.product_service.update_inventory(
                product_id=item.product_id,
                variant_id=item.variant_id,
                quantity_change=-item.quantity,
                reserved=True
            )

    async def release_inventory_for_order(self, order: Order):
        """释放订单预留的库存"""
        for item in order.items:
            await self.product_service.update_inventory(
                product_id=item.product_id,
                variant_id=item.variant_id,
                quantity_change=item.quantity,
                reserved=True
            )

    async def get_order_statistics(
        self,
        user_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """获取订单统计"""
        # 基础查询
        query = select(Order)

        if user_id:
            query = query.where(Order.user_id == user_id)

        if start_date:
            query = query.where(Order.created_at >= start_date)

        if end_date:
            query = query.where(Order.created_at <= end_date)

        result = await self.db.execute(query)
        orders = result.scalars().all()

        # 计算统计信息
        total_orders = len(orders)
        total_revenue = Decimal("0")
        pending_orders = 0
        completed_orders = 0

        for order in orders:
            if order.payment_status == PaymentStatus.PAID:
                total_revenue += order.final_amount

            if order.status == OrderStatus.PENDING:
                pending_orders += 1
            elif order.status == OrderStatus.DELIVERED:
                completed_orders += 1

        avg_order_value = total_revenue / total_orders if total_orders > 0 else Decimal("0")

        return {
            "total_orders": total_orders,
            "total_revenue": total_revenue,
            "average_order_value": avg_order_value,
            "pending_orders": pending_orders,
            "completed_orders": completed_orders,
            "conversion_rate": completed_orders / total_orders if total_orders > 0 else 0
        }
```

### 购物车与订单API端点

```python
# app/api/v1/cart.py
from fastapi import APIRouter, Depends, Query, HTTPException, status, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.api.deps import get_db, get_current_user, get_current_user_optional
from app.schemas.order import Cart, CartItem, CartItemCreate
from app.services.cart import CartService
from app.models.user import User

router = APIRouter(prefix="/cart", tags=["cart"])

@router.get("/", response_model=Cart)
async def get_cart(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    cart_session_id: Optional[str] = Cookie(None, alias="cart_session_id")
):
    """获取购物车"""
    cart_service = CartService(db)

    user_id = current_user.id if current_user else None
    session_id = cart_session_id

    cart = await cart_service.get_or_create_cart(
        user_id=user_id,
        session_id=session_id
    )

    # 计算摘要
    summary = await cart_service.get_cart_summary(cart.id)

    # 将摘要添加到响应
    cart.total_items = summary["total_items"]
    cart.total_amount = summary["total_amount"]

    return cart

@router.post("/items/", response_model=CartItem, status_code=status.HTTP_201_CREATED)
async def add_to_cart(
    item_data: CartItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    cart_session_id: Optional[str] = Cookie(None, alias="cart_session_id")
):
    """添加商品到购物车"""
    cart_service = CartService(db)

    user_id = current_user.id if current_user else None
    session_id = cart_session_id

    cart = await cart_service.get_or_create_cart(
        user_id=user_id,
        session_id=session_id
    )

    cart_item = await cart_service.add_to_cart(cart.id, item_data)
    return cart_item

@router.put("/items/{cart_item_id}", response_model=CartItem)
async def update_cart_item(
    cart_item_id: int,
    quantity: int = Query(..., gt=0, description="商品数量"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """更新购物车项数量"""
    cart_service = CartService(db)

    cart_item = await cart_service.update_cart_item(cart_item_id, quantity)

    if not cart_item:
        raise HTTPException(
            status_code=status.HTTP_204_NO_CONTENT,
            detail="Cart item removed"
        )

    return cart_item

@router.delete("/items/{cart_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_cart(
    cart_item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """从购物车移除商品"""
    cart_service = CartService(db)
    await cart_service.remove_from_cart(cart_item_id)
    return None

@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cart(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    cart_session_id: Optional[str] = Cookie(None, alias="cart_session_id")
):
    """清空购物车"""
    cart_service = CartService(db)

    user_id = current_user.id if current_user else None
    session_id = cart_session_id

    cart = await cart_service.get_or_create_cart(
        user_id=user_id,
        session_id=session_id
    )

    await cart_service.clear_cart(cart.id)
    return None

@router.post("/merge/", response_model=Cart)
async def merge_carts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    cart_session_id: Optional[str] = Cookie(None, alias="cart_session_id")
):
    """合并session购物车到用户购物车"""
    if not cart_session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No session cart to merge"
        )

    cart_service = CartService(db)

    # 获取session购物车
    session_cart = await cart_service.get_or_create_cart(session_id=cart_session_id)

    # 获取用户购物车
    user_cart = await cart_service.get_or_create_cart(user_id=current_user.id)

    # 合并购物车
    merged_cart = await cart_service.merge_carts(session_cart.id, user_cart.id)

    return merged_cart
```

```python
# app/api/v1/orders.py
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime
from app.api.deps import get_db, get_current_user
from app.schemas.order import Order, OrderCreate, OrderUpdate, OrderLog, PaginatedResponse
from app.services.order import OrderService
from app.models.user import User

router = APIRouter(prefix="/orders", tags=["orders"])

@router.post("/", response_model=Order, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建订单"""
    order_service = OrderService(db)
    order = await order_service.create_order(current_user.id, order_data)
    return order

@router.get("/", response_model=PaginatedResponse[Order])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(20, ge=1, le=100, description="每页记录数"),
    status: Optional[str] = Query(None, description="订单状态"),
    start_date: Optional[datetime] = Query(None, description="开始日期"),
    end_date: Optional[datetime] = Query(None, description="结束日期")
):
    """获取订单列表"""
    order_service = OrderService(db)
    orders, total = await order_service.list_orders(
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        status=status,
        start_date=start_date,
        end_date=end_date
    )

    return PaginatedResponse(
        data=orders,
        total=total,
        skip=skip,
        limit=limit
    )

@router.get("/{order_id}", response_model=Order)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取单个订单"""
    order_service = OrderService(db)
    order = await order_service.get_order(order_id, current_user.id)
    return order

@router.put("/{order_id}", response_model=Order)
async def update_order(
    order_id: int,
    order_data: OrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新订单（用户只能取消订单）"""
    # 用户只能更新自己的订单，且只能取消
    if order_data.status and order_data.status != "cancelled":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users can only cancel orders"
        )

    order_service = OrderService(db)
    order = await order_service.update_order(order_id, order_data, current_user.id)
    return order

@router.post("/{order_id}/cancel", response_model=Order)
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """取消订单"""
    order_service = OrderService(db)
    order = await order_service.cancel_order(order_id, current_user.id)
    return order

@router.get("/{order_id}/logs", response_model=List[OrderLog])
async def get_order_logs(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取订单日志"""
    order_service = OrderService(db)

    # 验证订单属于当前用户
    await order_service.get_order(order_id, current_user.id)

    logs = await order_service.get_order_logs(order_id)
    return logs

@router.get("/statistics/")
async def get_order_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start_date: Optional[datetime] = Query(None, description="开始日期"),
    end_date: Optional[datetime] = Query(None, description="结束日期")
):
    """获取订单统计"""
    order_service = OrderService(db)
    statistics = await order_service.get_order_statistics(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date
    )
    return statistics
```

## 5. 支付网关集成

### 支付服务抽象

```python
# app/services/payment.py
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from decimal import Decimal
from enum import Enum

class PaymentGateway(str, Enum):
    """支付网关枚举"""
    ALIPAY = "alipay"
    WECHAT = "wechat"
    STRIPE = "stripe"
    PAYPAL = "paypal"

class PaymentResult(BaseModel):
    """支付结果"""
    success: bool
    payment_id: Optional[str] = None
    gateway: PaymentGateway
    amount: Decimal
    currency: str = "CNY"
    status: str
    message: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class PaymentRequest(BaseModel):
    """支付请求"""
    order_id: int
    order_number: str
    amount: Decimal
    currency: str = "CNY"
    subject: str
    body: Optional[str] = None
    return_url: str
    notify_url: str
    client_ip: Optional[str] = None

class BasePaymentGateway(ABC):
    """支付网关基类"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    async def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """创建支付"""
        pass

    @abstractmethod
    async def verify_payment(self, payment_id: str) -> PaymentResult:
        """验证支付"""
        pass

    @abstractmethod
    async def refund(self, payment_id: str, amount: Decimal, reason: str = "") -> PaymentResult:
        """退款"""
        pass

class AlipayGateway(BasePaymentGateway):
    """支付宝支付网关"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.app_id = config.get("app_id")
        self.private_key = config.get("private_key")
        self.alipay_public_key = config.get("alipay_public_key")

        # 初始化支付宝SDK
        from alipay import AliPay
        self.alipay = AliPay(
            appid=self.app_id,
            app_notify_url=config.get("notify_url", ""),
            app_private_key_string=self.private_key,
            alipay_public_key_string=self.alipay_public_key,
            sign_type="RSA2",
            debug=config.get("debug", False)
        )

    async def create_payment(self, request: PaymentRequest) -> PaymentResult:
        """创建支付宝支付"""
        try:
            # 构建支付参数
            order_string = self.alipay.api_alipay_trade_page_pay(
                out_trade_no=request.order_number,
                total_amount=float(request.amount),
                subject=request.subject,
                body=request.body,
                return_url=request.return_url,
                notify_url=request.notify_url
            )

            # 生成支付URL
            if self.config.get("debug", False):
                gateway_url = "https://openapi.alipaydev.com/gateway.do"
            else:
                gateway_url = "https://openapi.alipay.com/gateway.do"

            payment_url = f"{gateway_url}?{order_string}"

            return PaymentResult(
                success=True,
                gateway=PaymentGateway.ALIPAY,
                amount=request.amount,
                status="pending",
                message="Payment created successfully",
                raw_response={"payment_url": payment_url}
            )

        except Exception as e:
            return PaymentResult(
                success=False,
                gateway=PaymentGateway.ALIPAY,
                amount=request.amount,
                status="failed",
                message=str(e)
            )

    async def verify_payment(self, payment_data: Dict[str, Any]) -> PaymentResult:
        """验证支付宝支付结果"""
        try:
            # 验证签名
            signature = payment_data.get("sign")
            data = {k: v for k, v in payment_data.items() if k != "sign" and k != "sign_type"}

            success = self.alipay.verify(data, signature)

            if success:
                trade_status = payment_data.get("trade_status")

                if trade_status in ["TRADE_SUCCESS", "TRADE_FINISHED"]:
                    status = "paid"
                elif trade_status == "TRADE_CLOSED":
                    status = "cancelled"
                else:
                    status = "pending"

                return PaymentResult(
                    success=True,
                    payment_id=payment_data.get("trade_no"),
                    gateway=PaymentGateway.ALIPAY,
                    amount=Decimal(payment_data.get("total_amount", "0")),
                    status=status,
                    raw_response=payment_data
                )
            else:
                return PaymentResult(
                    success=False,
                    gateway=PaymentGateway.ALIPAY,
                    amount=Decimal("0"),
                    status="failed",
                    message="Signature verification failed"
                )

        except Exception as e:
            return PaymentResult(
                success=False,
                gateway=PaymentGateway.ALIPAY,
                amount=Decimal("0"),
                status="failed",
                message=str(e)
            )

    async def refund(self, payment_id: str, amount: Decimal, reason: str = "") -> PaymentResult:
        """支付宝退款"""
        try:
            result = self.alipay.api_alipay_trade_refund(
                trade_no=payment_id,
                refund_amount=float(amount),
                refund_reason=reason
            )

            if result.get("code") == "10000":
                return PaymentResult(
                    success=True,
                    payment_id=payment_id,
                    gateway=PaymentGateway.ALIPAY,
                    amount=amount,
                    status="refunded",
                    raw_response=result
                )
            else:
                return PaymentResult(
                    success=False,
                    gateway=PaymentGateway.ALIPAY,
                    amount=amount,
                    status="failed",
                    message=result.get("sub_msg", "Refund failed"),
                    raw_response=result
                )

        except Exception as e:
            return PaymentResult(
                success=False,
                gateway=PaymentGateway.ALIPAY,
                amount=amount,
                status="failed",
                message=str(e)
            )

class PaymentService:
    """支付服务"""

    def __init__(self, config: Dict[str, Any]):
        self.gateways = {}
        self.config = config

        # 初始化支付网关
        self.init_gateways()

    def init_gateways(self):
        """初始化支付网关"""
        # 支付宝
        if self.config.get("alipay"):
            self.gateways[PaymentGateway.ALIPAY] = AlipayGateway(
                self.config["alipay"]
            )

        # 可以在这里添加其他支付网关
        # if self.config.get("wechat"):
        #     self.gateways[PaymentGateway.WECHAT] = WechatGateway(
        #         self.config["wechat"]
        #     )

    def get_gateway(self, gateway: PaymentGateway) -> BasePaymentGateway:
        """获取支付网关"""
        if gateway not in self.gateways:
            raise ValueError(f"Payment gateway {gateway} not configured")
        return self.gateways[gateway]

    async def create_payment(
        self,
        gateway: PaymentGateway,
        request: PaymentRequest
    ) -> PaymentResult:
        """创建支付"""
        payment_gateway = self.get_gateway(gateway)
        return await payment_gateway.create_payment(request)

    async def verify_payment(
        self,
        gateway: PaymentGateway,
        payment_data: Dict[str, Any]
    ) -> PaymentResult:
        """验证支付"""
        payment_gateway = self.get_gateway(gateway)
        return await payment_gateway.verify_payment(payment_data)

    async def refund(
        self,
        gateway: PaymentGateway,
        payment_id: str,
        amount: Decimal,
        reason: str = ""
    ) -> PaymentResult:
        """退款"""
        payment_gateway = self.get_gateway(gateway)
        return await payment_gateway.refund(payment_id, amount, reason)
```

### 支付API端点

```python
# app/api/v1/payment.py
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from decimal import Decimal
from app.api.deps import get_db, get_current_user
from app.schemas.payment import PaymentRequest, PaymentResult, PaymentGateway
from app.services.payment import PaymentService
from app.services.order import OrderService
from app.models.user import User
from app.core.config import settings

router = APIRouter(prefix="/payment", tags=["payment"])

# 初始化支付服务
payment_config = {
    "alipay": {
        "app_id": settings.ALIPAY_APP_ID,
        "private_key": settings.ALIPAY_PRIVATE_KEY,
        "alipay_public_key": settings.ALIPAY_PUBLIC_KEY,
        "notify_url": f"{settings.API_V1_STR}/payment/alipay/notify",
        "debug": settings.DEBUG
    }
}

payment_service = PaymentService(payment_config)

@router.post("/create/{order_id}")
async def create_payment(
    order_id: int,
    gateway: PaymentGateway,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建支付"""
    # 获取订单信息
    order_service = OrderService(db)
    order = await order_service.get_order(order_id, current_user.id)

    # 检查订单状态
    if order.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order payment status is {order.payment_status}, cannot create payment"
        )

    # 构建支付请求
    payment_request = PaymentRequest(
        order_id=order.id,
        order_number=order.order_number,
        amount=order.final_amount,
        subject=f"订单支付 - {order.order_number}",
        body=f"支付订单 {order.order_number}",
        return_url=f"https://example.com/orders/{order.id}/success",
        notify_url=f"{settings.API_V1_STR}/payment/{gateway.value}/notify",
        client_ip=None  # 可以从请求头中获取
    )

    # 创建支付
    result = await payment_service.create_payment(gateway, payment_request)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.message
        )

    return result

@router.post("/alipay/notify")
async def alipay_notify(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """支付宝支付通知（异步处理）"""
    # 获取通知参数
    form_data = await request.form()
    notify_data = dict(form_data)

    # 验证支付结果
    result = await payment_service.verify_payment(
        PaymentGateway.ALIPAY,
        notify_data
    )

    if result.success:
        # 在后台更新订单状态
        background_tasks.add_task(
            process_payment_notification,
            db,
            result
        )

    # 返回给支付宝的成功响应
    return {"code": "success", "msg": "成功"}

@router.post("/verify/{order_id}")
async def verify_payment(
    order_id: int,
    gateway: PaymentGateway,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """验证支付状态"""
    order_service = OrderService(db)
    order = await order_service.get_order(order_id, current_user.id)

    if not order.payment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No payment ID for this order"
        )

    # 验证支付
    result = await payment_service.verify_payment(
        gateway,
        {"trade_no": order.payment_id}
    )

    # 如果支付状态有变化，更新订单
    if result.success and result.status != order.payment_status:
        await order_service.update_payment_status(
            order.id,
            result.status,
            result.payment_id
        )

    return result

@router.post("/refund/{order_id}")
async def create_refund(
    order_id: int,
    amount: Decimal,
    reason: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建退款"""
    # 检查用户权限（这里假设只有管理员可以退款）
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create refunds"
        )

    order_service = OrderService(db)
    order = await order_service.get_order(order_id)

    # 检查订单状态
    if order.payment_status != "paid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot refund order with payment status {order.payment_status}"
        )

    # 检查退款金额
    if amount > order.final_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount cannot exceed order amount"
        )

    if not order.payment_id or not order.payment_method:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No payment information for this order"
        )

    # 确定支付网关
    gateway_map = {
        "alipay": PaymentGateway.ALIPAY,
        "wechat": PaymentGateway.WECHAT
    }

    gateway = gateway_map.get(order.payment_method)
    if not gateway:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported payment method: {order.payment_method}"
        )

    # 执行退款
    result = await payment_service.refund(
        gateway,
        order.payment_id,
        amount,
        reason
    )

    # 如果退款成功，更新订单状态
    if result.success:
        await order_service.update_payment_status(
            order.id,
            "refunded"
        )

    return result

async def process_payment_notification(db: AsyncSession, result: PaymentResult):
    """处理支付通知"""
    try:
        order_service = OrderService(db)

        # 根据支付ID找到订单
        # 这里需要根据具体业务逻辑实现
        # 例如：通过order_number查找订单

        # 更新订单支付状态
        # await order_service.update_payment_status(
        #     order_id,
        #     result.status,
        #     result.payment_id
        # )

        pass

    except Exception as e:
        # 记录错误日志
        print(f"Error processing payment notification: {e}")
```

## 6. 库存管理系统

### 库存服务

```python
# app/services/inventory.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from app.models.product import Product, ProductVariant, Inventory
from app.core.exceptions import NotFoundException, BadRequestException

class InventoryService:
    """库存服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_inventory(
        self,
        product_id: int,
        variant_id: Optional[int] = None,
        warehouse_id: int = 1
    ) -> Optional[Inventory]:
        """获取库存信息"""
        query = select(Inventory).where(
            Inventory.product_id == product_id,
            Inventory.variant_id == variant_id,
            Inventory.warehouse_id == warehouse_id
        )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_inventory(
        self,
        product_id: int,
        quantity_change: int,
        variant_id: Optional[int] = None,
        warehouse_id: int = 1,
        operation_type: str = "adjustment",  # adjustment, purchase, sale, return
        notes: Optional[str] = None
    ) -> Inventory:
        """更新库存"""
        inventory = await self.get_inventory(product_id, variant_id, warehouse_id)

        if not inventory:
            # 创建库存记录
            inventory = Inventory(
                product_id=product_id,
                variant_id=variant_id,
                warehouse_id=warehouse_id,
                quantity=0,
                reserved_quantity=0
            )
            self.db.add(inventory)
            await self.db.flush()

        # 更新库存数量
        new_quantity = inventory.quantity + quantity_change

        if new_quantity < 0:
            raise BadRequestException(
                f"Insufficient inventory. Available: {inventory.quantity}, "
                f"Requested: {-quantity_change}"
            )

        inventory.quantity = new_quantity
        inventory.updated_at = func.now()

        # 创建库存变更记录
        await self.create_inventory_log(
            inventory,
            quantity_change,
            operation_type,
            notes
        )

        await self.db.commit()
        await self.db.refresh(inventory)

        # 检查低库存预警
        await self.check_low_stock_alert(inventory)

        return inventory

    async def reserve_inventory(
        self,
        product_id: int,
        quantity: int,
        variant_id: Optional[int] = None,
        warehouse_id: int = 1
    ) -> bool:
        """预留库存"""
        inventory = await self.get_inventory(product_id, variant_id, warehouse_id)

        if not inventory:
            raise NotFoundException("Inventory not found")

        available = inventory.quantity - inventory.reserved_quantity

        if available < quantity:
            return False

        inventory.reserved_quantity += quantity
        inventory.updated_at = func.now()

        await self.db.commit()
        return True

    async def release_inventory(
        self,
        product_id: int,
        quantity: int,
        variant_id: Optional[int] = None,
        warehouse_id: int = 1
    ) -> bool:
        """释放预留库存"""
        inventory = await self.get_inventory(product_id, variant_id, warehouse_id)

        if not inventory:
            raise NotFoundException("Inventory not found")

        if inventory.reserved_quantity < quantity:
            raise BadRequestException(
                f"Cannot release more than reserved. "
                f"Reserved: {inventory.reserved_quantity}, Requested: {quantity}"
            )

        inventory.reserved_quantity -= quantity
        inventory.updated_at = func.now()

        await self.db.commit()
        return True

    async def get_low_stock_items(
        self,
        warehouse_id: Optional[int] = None,
        threshold: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """获取低库存商品"""
        query = select(Inventory).join(Product).join(ProductVariant, isouter=True)

        conditions = []

        if warehouse_id:
            conditions.append(Inventory.warehouse_id == warehouse_id)

        if threshold:
            conditions.append(
                Inventory.quantity - Inventory.reserved_quantity <= threshold
            )
        else:
            conditions.append(
                Inventory.quantity - Inventory.reserved_quantity <= Inventory.low_stock_threshold
            )

        query = query.where(and_(*conditions))

        result = await self.db.execute(query)
        items = result.scalars().all()

        low_stock_items = []
        for item in items:
            available = item.quantity - item.reserved_quantity
            low_stock_items.append({
                "product_id": item.product_id,
                "variant_id": item.variant_id,
                "product_name": item.product.name,
                "variant_name": item.variant.name if item.variant else None,
                "warehouse_id": item.warehouse_id,
                "quantity": item.quantity,
                "reserved_quantity": item.reserved_quantity,
                "available": available,
                "low_stock_threshold": item.low_stock_threshold,
                "status": "critical" if available <= 0 else "warning"
            })

        return low_stock_items

    async def get_inventory_movements(
        self,
        product_id: Optional[int] = None,
        variant_id: Optional[int] = None,
        warehouse_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50
    ) -> tuple[List[Dict[str, Any]], int]:
        """获取库存变动记录"""
        from app.models.inventory_log import InventoryLog

        query = select(InventoryLog)
        count_query = select(func.count()).select_from(InventoryLog)

        conditions = []

        if product_id:
            conditions.append(InventoryLog.product_id == product_id)

        if variant_id:
            conditions.append(InventoryLog.variant_id == variant_id)

        if warehouse_id:
            conditions.append(InventoryLog.warehouse_id == warehouse_id)

        if start_date:
            conditions.append(InventoryLog.created_at >= start_date)

        if end_date:
            conditions.append(InventoryLog.created_at <= end_date)

        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))

        # 排序和分页
        query = query.order_by(InventoryLog.created_at.desc())
        query = query.offset(skip).limit(limit)

        # 执行查询
        result = await self.db.execute(query)
        logs = result.scalars().all()

        count_result = await self.db.execute(count_query)
        total = count_result.scalar_one()

        # 格式化结果
        movements = []
        for log in logs:
            movements.append({
                "id": log.id,
                "product_id": log.product_id,
                "variant_id": log.variant_id,
                "warehouse_id": log.warehouse_id,
                "quantity_change": log.quantity_change,
                "quantity_before": log.quantity_before,
                "quantity_after": log.quantity_after,
                "operation_type": log.operation_type,
                "reference_id": log.reference_id,
                "reference_type": log.reference_type,
                "notes": log.notes,
                "created_at": log.created_at,
                "created_by": log.created_by
            })

        return movements, total

    async def create_inventory_log(
        self,
        inventory: Inventory,
        quantity_change: int,
        operation_type: str,
        notes: Optional[str] = None,
        reference_id: Optional[int] = None,
        reference_type: Optional[str] = None,
        created_by: Optional[int] = None
    ):
        """创建库存变更记录"""
        from app.models.inventory_log import InventoryLog

        log = InventoryLog(
            product_id=inventory.product_id,
            variant_id=inventory.variant_id,
            warehouse_id=inventory.warehouse_id,
            quantity_change=quantity_change,
            quantity_before=inventory.quantity - quantity_change,
            quantity_after=inventory.quantity,
            operation_type=operation_type,
            reference_id=reference_id,
            reference_type=reference_type,
            notes=notes,
            created_by=created_by
        )

        self.db.add(log)

    async def check_low_stock_alert(self, inventory: Inventory):
        """检查低库存预警"""
        available = inventory.quantity - inventory.reserved_quantity

        if available <= inventory.low_stock_threshold:
            # 发送低库存预警
            await self.send_low_stock_alert(inventory, available)

    async def send_low_stock_alert(
        self,
        inventory: Inventory,
        available_quantity: int
    ):
        """发送低库存预警"""
        # 这里可以集成邮件、短信、钉钉、微信等通知方式
        # 示例：发送邮件通知

        product_name = inventory.product.name
        if inventory.variant:
            product_name = f"{product_name} - {inventory.variant.name}"

        alert_message = (
            f"低库存预警：商品 {product_name} (ID: {inventory.product_id}) "
            f"当前可用库存: {available_quantity}, "
            f"低于阈值: {inventory.low_stock_threshold}"
        )

        print(f"ALERT: {alert_message}")

        # 实际项目中应该发送通知
        # await send_email(
        #     to="inventory@example.com",
        #     subject="低库存预警",
        #     content=alert_message
        # )

    async def get_inventory_summary(self, warehouse_id: Optional[int] = None) -> Dict[str, Any]:
        """获取库存摘要"""
        query = select(
            func.count(Inventory.id).label("total_products"),
            func.sum(Inventory.quantity).label("total_quantity"),
            func.sum(Inventory.reserved_quantity).label("total_reserved"),
            func.sum(
                case(
                    [
                        (
                            Inventory.quantity - Inventory.reserved_quantity <= Inventory.low_stock_threshold,
                            1
                        )
                    ],
                    else_=0
                )
            ).label("low_stock_count")
        )

        if warehouse_id:
            query = query.where(Inventory.warehouse_id == warehouse_id)

        result = await self.db.execute(query)
        summary = result.first()

        return {
            "total_products": summary.total_products or 0,
            "total_quantity": summary.total_quantity or 0,
            "total_reserved": summary.total_reserved or 0,
            "total_available": (summary.total_quantity or 0) - (summary.total_reserved or 0),
            "low_stock_count": summary.low_stock_count or 0
        }
```

### 库存API端点

```python
# app/api/v1/inventory.py
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime
from app.api.deps import get_db, get_current_user
from app.schemas.inventory import InventoryUpdate, InventoryMovement, PaginatedResponse
from app.services.inventory import InventoryService
from app.models.user import User

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get("/low-stock/")
async def get_low_stock_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    warehouse_id: Optional[int] = Query(None, description="仓库ID"),
    threshold: Optional[int] = Query(None, ge=0, description="库存阈值")
):
    """获取低库存商品"""
    # 检查权限（只有商家和管理员可以查看库存）
    if not (current_user.is_vendor or current_user.is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors and admins can view inventory"
        )

    inventory_service = InventoryService(db)
    items = await inventory_service.get_low_stock_items(warehouse_id, threshold)
    return items

@router.get("/movements/")
async def get_inventory_movements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    product_id: Optional[int] = Query(None, description="商品ID"),
    variant_id: Optional[int] = Query(None, description="变体ID"),
    warehouse_id: Optional[int] = Query(None, description="仓库ID"),
    start_date: Optional[datetime] = Query(None, description="开始日期"),
    end_date: Optional[datetime] = Query(None, description="结束日期"),
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(50, ge=1, le=200, description="每页记录数")
):
    """获取库存变动记录"""
    # 检查权限
    if not (current_user.is_vendor or current_user.is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors and admins can view inventory movements"
        )

    inventory_service = InventoryService(db)
    movements, total = await inventory_service.get_inventory_movements(
        product_id=product_id,
        variant_id=variant_id,
        warehouse_id=warehouse_id,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit
    )

    return PaginatedResponse(
        data=movements,
        total=total,
        skip=skip,
        limit=limit
    )

@router.post("/update/{product_id}")
async def update_inventory(
    product_id: int,
    inventory_data: InventoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新库存"""
    # 检查权限
    if not (current_user.is_vendor or current_user.is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors and admins can update inventory"
        )

    inventory_service = InventoryService(db)

    inventory = await inventory_service.update_inventory(
        product_id=product_id,
        quantity_change=inventory_data.quantity_change,
        variant_id=inventory_data.variant_id,
        warehouse_id=inventory_data.warehouse_id,
        operation_type=inventory_data.operation_type,
        notes=inventory_data.notes
    )

    return inventory

@router.get("/summary/")
async def get_inventory_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    warehouse_id: Optional[int] = Query(None, description="仓库ID")
):
    """获取库存摘要"""
    # 检查权限
    if not (current_user.is_vendor or current_user.is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only vendors and admins can view inventory summary"
        )

    inventory_service = InventoryService(db)
    summary = await inventory_service.get_inventory_summary(warehouse_id)
    return summary
```

## 7. 推荐算法实现

### 基于协同过滤的推荐

```python
# app/services/recommendation.py
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from datetime import datetime, timedelta
import redis
import json
from app.core.config import settings

class RecommendationService:
    """推荐服务"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.cache_prefix = "recommendations"

    async def get_user_recommendations(
        self,
        user_id: int,
        limit: int = 10,
        use_cache: bool = True
    ) -> List[int]:
        """获取用户推荐商品"""
        cache_key = f"{self.cache_prefix}:user:{user_id}"

        # 尝试从缓存获取
        if use_cache:
            cached = self.redis.get(cache_key)
            if cached:
                return json.loads(cached)

        # 从数据库获取用户行为数据并计算推荐
        # 这里简化实现，实际项目中需要从数据库查询
        recommendations = await self.calculate_user_recommendations(user_id, limit)

        # 缓存结果（1小时）
        self.redis.setex(cache_key, 3600, json.dumps(recommendations))

        return recommendations

    async def get_item_recommendations(
        self,
        product_id: int,
        limit: int = 10
    ) -> List[int]:
        """获取商品相似推荐"""
        cache_key = f"{self.cache_prefix}:item:{product_id}"

        # 尝试从缓存获取
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # 计算商品相似度
        recommendations = await self.calculate_item_recommendations(product_id, limit)

        # 缓存结果（2小时）
        self.redis.setex(cache_key, 7200, json.dumps(recommendations))

        return recommendations

    async def calculate_user_recommendations(
        self,
        user_id: int,
        limit: int = 10
    ) -> List[int]:
        """计算用户推荐（基于协同过滤）"""
        # 这里简化实现，实际项目中需要：
        # 1. 获取用户历史行为（浏览、购买、收藏等）
        # 2. 计算用户相似度或物品相似度
        # 3. 生成推荐列表

        # 示例：基于用户购买历史的简单推荐
        from app.models.order import Order, OrderItem

        # 获取用户最近购买的商品
        # recent_products = await self.get_user_recent_products(user_id, 20)

        # 获取相似用户的购买记录
        # similar_users = await self.find_similar_users(user_id)

        # 合并推荐结果
        recommendations = [1, 2, 3, 4, 5]  # 示例ID

        return recommendations[:limit]

    async def calculate_item_recommendations(
        self,
        product_id: int,
        limit: int = 10
    ) -> List[int]:
        """计算商品相似推荐"""
        # 基于商品属性的相似度计算
        # 1. 获取商品特征（分类、价格、品牌等）
        # 2. 计算余弦相似度
        # 3. 返回最相似的商品

        # 示例实现
        similar_items = []

        # 这里应该是实际的相似度计算
        # 例如：基于同一分类的商品
        # same_category = await self.get_same_category_products(product_id)

        return similar_items[:limit]

    async def get_trending_products(
        self,
        days: int = 7,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """获取热门商品"""
        cache_key = f"{self.cache_prefix}:trending:{days}"

        # 尝试从缓存获取
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # 计算热门商品（基于销量、浏览等）
        trending = await self.calculate_trending_products(days, limit)

        # 缓存结果（30分钟）
        self.redis.setex(cache_key, 1800, json.dumps(trending))

        return trending

    async def calculate_trending_products(
        self,
        days: int = 7,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """计算热门商品"""
        # 基于时间窗口内的销量计算热门商品
        # 实际项目中需要从数据库查询

        trending_products = [
            {
                "product_id": 1,
                "sales_count": 150,
                "growth_rate": 0.25,
                "score": 0.85
            },
            {
                "product_id": 2,
                "sales_count": 120,
                "growth_rate": 0.18,
                "score": 0.78
            }
        ]

        return trending_products[:limit]

    async def update_user_preferences(
        self,
        user_id: int,
        product_id: int,
        action_type: str,  # view, purchase, like, share
        weight: float = 1.0
    ):
        """更新用户偏好"""
        # 记录用户行为
        behavior_key = f"user_behavior:{user_id}"

        behavior = {
            "product_id": product_id,
            "action_type": action_type,
            "weight": weight,
            "timestamp": datetime.now().isoformat()
        }

        # 存储到Redis（使用sorted set按时间排序）
        self.redis.zadd(
            behavior_key,
            {json.dumps(behavior): datetime.now().timestamp()}
        )

        # 限制存储数量（最近1000条）
        self.redis.zremrangebyrank(behavior_key, 0, -1001)

        # 清除推荐缓存
        self.redis.delete(f"{self.cache_prefix}:user:{user_id}")

    async def get_personalized_recommendations(
        self,
        user_id: int,
        strategy: str = "hybrid",
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """获取个性化推荐（混合策略）"""
        recommendations = []

        if strategy == "hybrid":
            # 混合推荐：协同过滤 + 基于内容 + 热门商品
            cf_recs = await self.get_user_recommendations(user_id, limit // 3)
            content_recs = await self.get_item_recommendations(0, limit // 3)  # 需要最近浏览的商品
            trending_recs = await self.get_trending_products(limit=limit // 3)

            # 合并和去重
            all_recs = set(cf_recs)
            all_recs.update([r["product_id"] for r in content_recs])
            all_recs.update([r["product_id"] for r in trending_recs])

            # 添加推荐理由
            for rec_id in list(all_recs)[:limit]:
                reason = "根据您的浏览历史推荐"
                if rec_id in cf_recs:
                    reason = "与您相似的用户也喜欢"
                elif rec_id in [r["product_id"] for r in trending_recs]:
                    reason = "近期热门商品"

                recommendations.append({
                    "product_id": rec_id,
                    "reason": reason,
                    "score": 0.8  # 置信度分数
                })

        return recommendations

    async def batch_update_recommendations(self):
        """批量更新推荐数据（定时任务）"""
        # 更新所有用户的推荐
        # 更新商品相似度矩阵
        # 更新热门商品列表

        print("Updating recommendation data...")

        # 这里实现批量更新逻辑
        # 可以使用Celery异步任务处理

        print("Recommendation data updated")

# 推荐策略工厂
class RecommendationStrategy:
    """推荐策略工厂"""

    @staticmethod
    def create_strategy(strategy_type: str, **kwargs):
        """创建推荐策略"""
        strategies = {
            "collaborative": CollaborativeFilteringStrategy,
            "content": ContentBasedStrategy,
            "hybrid": HybridStrategy,
            "trending": TrendingStrategy
        }

        strategy_class = strategies.get(strategy_type)
        if not strategy_class:
            raise ValueError(f"Unknown strategy type: {strategy_type}")

        return strategy_class(**kwargs)

class CollaborativeFilteringStrategy:
    """协同过滤策略"""

    def __init__(self, **kwargs):
        self.min_similarity = kwargs.get("min_similarity", 0.3)
        self.neighbors = kwargs.get("neighbors", 20)

    async def recommend(self, user_id: int, limit: int = 10) -> List[int]:
        """生成推荐"""
        # 实现协同过滤算法
        pass

class ContentBasedStrategy:
    """基于内容的策略"""

    def __init__(self, **kwargs):
        self.feature_weights = kwargs.get("feature_weights", {})

    async def recommend(self, product_id: int, limit: int = 10) -> List[int]:
        """生成推荐"""
        # 实现基于内容的推荐
        pass
```

### 推荐API端点

```python
# app/api/v1/recommendations.py
from fastapi import APIRouter, Depends, Query, HTTPException, status
from typing import List, Optional
import redis
from app.api.deps import get_current_user, get_redis_client
from app.services.recommendation import RecommendationService
from app.models.user import User

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

@router.get("/for-me")
async def get_personalized_recommendations(
    strategy: str = Query("hybrid", description="推荐策略"),
    limit: int = Query(10, ge=1, le=50, description="推荐数量"),
    current_user: User = Depends(get_current_user),
    redis_client: redis.Redis = Depends(get_redis_client)
):
    """获取个性化推荐"""
    recommendation_service = RecommendationService(redis_client)

    recommendations = await recommendation_service.get_personalized_recommendations(
        user_id=current_user.id,
        strategy=strategy,
        limit=limit
    )

    return {
        "user_id": current_user.id,
        "strategy": strategy,
        "recommendations": recommendations,
        "count": len(recommendations)
    }

@router.get("/trending")
async def get_trending_products(
    days: int = Query(7, ge=1, le=30, description="时间窗口（天）"),
    limit: int = Query(20, ge=1, le=50, description="商品数量"),
    redis_client: redis.Redis = Depends(get_redis_client)
):
    """获取热门商品"""
    recommendation_service = RecommendationService(redis_client)

    trending = await recommendation_service.get_trending_products(days, limit)

    return {
        "days": days,
        "trending_products": trending,
        "count": len(trending)
    }

@router.get("/similar/{product_id}")
async def get_similar_products(
    product_id: int,
    limit: int = Query(10, ge=1, le=20, description="商品数量"),
    redis_client: redis.Redis = Depends(get_redis_client)
):
    """获取相似商品"""
    recommendation_service = RecommendationService(redis_client)

    similar = await recommendation_service.get_item_recommendations(product_id, limit)

    return {
        "product_id": product_id,
        "similar_products": similar,
        "count": len(similar)
    }

@router.post("/track/{product_id}")
async def track_user_action(
    product_id: int,
    action_type: str = Query(..., description="行为类型：view, purchase, like, share"),
    weight: float = Query(1.0, ge=0.1, le=5.0, description="权重"),
    current_user: User = Depends(get_current_user),
    redis_client: redis.Redis = Depends(get_redis_client)
):
    """跟踪用户行为（用于改进推荐）"""
    recommendation_service = RecommendationService(redis_client)

    await recommendation_service.update_user_preferences(
        user_id=current_user.id,
        product_id=product_id,
        action_type=action_type,
        weight=weight
    )

    return {
        "message": "User action tracked",
        "user_id": current_user.id,
        "product_id": product_id,
        "action_type": action_type
    }
```

## 8. 项目总结与优化建议

### 项目总结

通过这个电商API项目，我们实现了：

1. **完整的用户系统**：注册、登录、权限管理
2. **商品管理系统**：分类、商品、变体、图片管理
3. **购物车系统**：支持游客和登录用户
4. **订单系统**：创建、支付、状态管理
5. **支付集成**：支付宝等多支付网关支持
6. **库存管理**：实时库存跟踪、预警
7. **推荐系统**：个性化商品推荐
8. **API文档**：完整的OpenAPI文档

### 性能优化建议

#### 1. 数据库优化

```python
# 使用数据库索引优化查询
# 在经常查询的字段上创建索引
CREATE INDEX idx_products_category_price ON products(category_id, price);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_order_items_order ON order_items(order_id);

# 使用数据库分区（对于大表）
-- 按时间分区订单表
CREATE TABLE orders_2024 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

#### 2. 缓存策略优化

```python
# 使用多级缓存策略
class MultiLevelCache:
    """多级缓存"""

    def __init__(self):
        self.memory_cache = {}  # 内存缓存（短期）
        self.redis_cache = redis.Redis()  # Redis缓存（中期）
        self.db_cache = None  # 数据库缓存（长期）

    async def get(self, key: str):
        # 1. 检查内存缓存
        if key in self.memory_cache:
            return self.memory_cache[key]

        # 2. 检查Redis缓存
        cached = self.redis_cache.get(key)
        if cached:
            # 回写到内存缓存
            self.memory_cache[key] = cached
            return cached

        # 3. 从数据库获取
        data = await self.get_from_db(key)

        # 更新缓存
        self.memory_cache[key] = data
        self.redis_cache.setex(key, 3600, data)  # 缓存1小时

        return data
```

#### 3. 异步处理优化

```python
# 使用异步任务处理耗时操作
from celery import Celery

celery_app = Celery(
    'ecommerce',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

@celery_app.task
def send_order_confirmation_email(order_id: int):
    """发送订单确认邮件（异步任务）"""
    # 获取订单信息
    # 生成邮件内容
    # 发送邮件
    pass

@celery_app.task
def update_product_recommendations(product_id: int):
    """更新商品推荐数据（异步任务）"""
    # 计算相似商品
    # 更新缓存
    pass

# 在订单创建后异步发送邮件
@app.post("/orders/")
async def create_order(order_data: OrderCreate):
    # 创建订单
    order = await order_service.create_order(order_data)

    # 异步发送邮件
    send_order_confirmation_email.delay(order.id)

    return order
```

#### 4. 监控和日志优化

```python
# 结构化日志记录
import structlog

logger = structlog.get_logger()

async def process_order(order_id: int):
    """处理订单（带结构化日志）"""
    with structlog.contextvars.bound_contextvars(order_id=order_id):
        logger.info("start_processing_order")

        try:
            # 处理订单逻辑
            logger.info("order_processing_complete")
        except Exception as e:
            logger.error("order_processing_failed", error=str(e))
            raise

# APM监控集成
from elasticapm.contrib.starlette import ElasticAPM

app.add_middleware(
    ElasticAPM,
    service_name='ecommerce-api',
    server_url='http://localhost:8200',
    environment=settings.ENVIRONMENT
)
```

### 安全优化建议

```python
# 1. 输入验证和清理
from pydantic import BaseModel, validator
import html

class UserInput(BaseModel):
    username: str
    bio: str

    @validator('bio')
    def sanitize_html(cls, v):
        # 清理HTML标签，防止XSS攻击
        return html.escape(v)

# 2. 速率限制
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/login")
@limiter.limit("5/minute")
async def login(username: str, password: str):
    # 登录逻辑
    pass

# 3. SQL注入防护（使用SQLAlchemy的参数化查询）
# 正确的方式：
query = select(User).where(User.username == username)

# 错误的方式（不要这样做）：
# query = text(f"SELECT * FROM users WHERE username = '{username}'")
```

### 部署优化建议

```dockerfile
# 使用多阶段构建优化Docker镜像
# Dockerfile.optimized
FROM python:3.9-slim as builder

WORKDIR /app

# 安装构建依赖
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装Python依赖
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 第二阶段：运行环境
FROM python:3.9-slim

WORKDIR /app

# 从构建阶段复制Python包
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# 创建非root用户
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 appuser

# 复制应用代码
COPY --chown=appuser:appuser . .

# 切换到非root用户
USER appuser

# 运行应用
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### 扩展性建议

1. **微服务架构迁移**：
   - 将单体应用拆分为微服务（用户服务、商品服务、订单服务等）
   - 使用gRPC或HTTP进行服务间通信
   - 使用服务发现（Consul、etcd）

2. **消息队列集成**：
   - 使用RabbitMQ或Kafka处理异步任务
   - 实现事件驱动架构

3. **搜索优化**：
   - 集成Elasticsearch实现商品搜索
   - 实现智能搜索建议

4. **CDN集成**：
   - 使用CDN加速静态资源
   - 图片缩略图服务

### 学习资源

1. **FastAPI官方文档**：https://fastapi.tiangolo.com
2. **SQLAlchemy文档**：https://docs.sqlalchemy.org
3. **PostgreSQL文档**：https://www.postgresql.org/docs
4. **Redis文档**：https://redis.io/documentation
5. **Celery文档**：https://docs.celeryproject.org

## 结语

恭喜你完成了这个完整的电商API项目！通过这个项目，你不仅掌握了FastAPI的各种高级特性，还学会了如何设计一个完整的商业系统。

记住，构建优秀的API不仅仅是写代码，更重要的是：

1. **理解业务需求**：始终从用户角度思考
2. **设计良好的API**：遵循RESTful原则，提供清晰的文档
3. **关注性能和安全**：优化响应时间，保护用户数据
4. **持续改进**：根据用户反馈和数据分析不断优化

这个项目可以作为你的作品集项目，也可以作为你深入学习Web开发的起点。在实际工作中，你可能会遇到更复杂的业务场景和性能挑战，但通过这个项目打下的基础，你将能够应对这些挑战。

**下一步建议**：

1. 为这个项目添加前端界面（可以使用Vue.js或React）
2. 实现更多电商功能（优惠券、积分、会员系统等）
3. 部署到云平台（AWS、阿里云、腾讯云）
4. 添加自动化测试和CI/CD流程
5. 监控系统性能和用户行为
