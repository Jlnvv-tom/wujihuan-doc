# FastAPI数据库集成：SQLAlchemy实战完全指南

> 数据库是Web应用的灵魂，而SQLAlchemy是Python世界最强大的ORM。学会如何在FastAPI中优雅地使用SQLAlchemy，是你从API开发者成长为全栈工程师的关键一步。

## 引言：为什么选择SQLAlchemy？

在FastAPI生态中，数据库集成的选择很多：

- **SQLAlchemy**：功能最全，生态最成熟，工业级标准
- **Tortoise-ORM**：异步优先，Django风格API
- **Peewee**：轻量级，简单易用
- **直接SQL**：最高性能，但开发效率低

SQLAlchemy的独特优势在于：

1. **双重API**：既可以使用ORM高级抽象，也可以直接执行原始SQL
2. **完整的类型系统**：与Pydantic完美集成
3. **成熟的迁移工具**：Alembic提供数据库版本管理
4. **多数据库支持**：一套代码适配PostgreSQL、MySQL、SQLite等

## 1. SQLAlchemy核心概念解析

### 引擎（Engine）：数据库连接池

```python
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

# 创建数据库引擎（连接池）
engine = create_engine(
    # 连接字符串格式：dialect+driver://username:password@host:port/database
    "postgresql+psycopg2://user:password@localhost:5432/fastapi_db",

    # 连接池配置
    pool_size=20,           # 连接池大小
    max_overflow=30,        # 最大溢出连接数
    pool_timeout=30,        # 获取连接超时时间（秒）
    pool_recycle=3600,      # 连接回收时间（秒）
    pool_pre_ping=True,     # 连接前ping检测

    # 执行配置
    echo=True,              # 打印SQL日志（开发环境）
    future=True,            # 使用2.0风格的API
)

# 测试连接
with engine.connect() as conn:
    result = conn.execute("SELECT 1")
    print("数据库连接成功!")
```

### 会话（Session）：数据库操作上下文

```python
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager

# 创建会话工厂
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,      # 自动提交关闭
    autoflush=False,       # 自动刷新关闭（建议手动控制）
    expire_on_commit=True, # 提交后过期对象
    class_=Session,        # 使用异步兼容的Session类
)

# 安全的会话管理上下文管理器
@contextmanager
def get_db() -> Session:
    """获取数据库会话，自动处理事务和异常"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

# 使用示例
with get_db() as db:
    # 在这里执行数据库操作
    user = db.query(User).filter(User.id == 1).first()
    print(user)
```

### 声明式基类（Declarative Base）

```python
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

# 定义基类（SQLAlchemy 2.0+ 风格）
class Base(DeclarativeBase):
    """所有模型的基类"""
    __abstract__ = True

    # 通用字段
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

    def to_dict(self):
        """将模型转换为字典（排除私有属性）"""
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
            if not column.name.startswith('_')
        }

# 使用基类定义模型
from sqlalchemy import String, Text

class User(Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str | None] = mapped_column(String(100))
    bio: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True)

    # 关系将在后面章节讲解
    # articles: Mapped[List["Article"]] = relationship(back_populates="author")
```

## 2. 模型定义：表结构的Python化

### 字段类型大全

```python
from sqlalchemy import (
    String, Integer, BigInteger, Float,
    Decimal, Boolean, Date, DateTime,
    Time, Text, JSON, ARRAY, Enum
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column
import enum

# 枚举类型
class UserRole(enum.Enum):
    USER = "user"
    ADMIN = "admin"
    MODERATOR = "moderator"

class ProductStatus(enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class ComprehensiveModel(Base):
    __tablename__ = "comprehensive_examples"

    # 数值类型
    small_num: Mapped[int] = mapped_column(Integer)
    big_num: Mapped[int] = mapped_column(BigInteger)
    price: Mapped[float] = mapped_column(Float(precision=2))
    precise_price: Mapped[Decimal] = mapped_column(Decimal(10, 2))

    # 字符串类型
    short_text: Mapped[str] = mapped_column(String(50))
    long_text: Mapped[str] = mapped_column(Text)
    fixed_text: Mapped[str] = mapped_column(String(10))

    # 特殊类型
    uuid_field: Mapped[UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4)
    json_data: Mapped[dict] = mapped_column(JSON)  # 标准JSON
    jsonb_data: Mapped[dict] = mapped_column(JSONB)  # PostgreSQL JSONB
    tags: Mapped[list[str]] = mapped_column(PG_ARRAY(String(50)))  # PostgreSQL数组

    # 枚举类型
    user_role: Mapped[UserRole] = mapped_column(Enum(UserRole))
    status: Mapped[ProductStatus] = mapped_column(Enum(ProductStatus))

    # 时间类型
    birthday: Mapped[date] = mapped_column(Date)
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reminder_time: Mapped[time] = mapped_column(Time)

    # 布尔类型
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # 索引和约束
    email: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=False
    )
    phone: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        index=True,
        comment="用户手机号"
    )
```

### 表约束和索引

```python
from sqlalchemy import UniqueConstraint, CheckConstraint, Index
from sqlalchemy.schema import FetchedValue

class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    price: Mapped[float] = mapped_column(Float, CheckConstraint("price >= 0"))
    stock: Mapped[int] = mapped_column(Integer, default=0)
    category_id: Mapped[int] = mapped_column(Integer, index=True)

    # 表级约束
    __table_args__ = (
        # 唯一约束（多列）
        UniqueConstraint('category_id', 'sku', name='uix_category_sku'),

        # 检查约束
        CheckConstraint('stock >= 0', name='check_stock_non_negative'),

        # 复合索引
        Index('ix_product_name_price', 'name', 'price'),

        # 部分索引（PostgreSQL）
        # Index('ix_active_products', 'id', postgresql_where='stock > 0'),

        # 注释
        {'comment': '商品信息表'}
    )

    # 计算字段（数据库端）
    value_score = mapped_column(
        Float,
        FetchedValue(),  # 由数据库计算
        comment="价格价值评分"
    )
```

## 3. 数据库迁移：Alembic入门

### 安装和初始化

```bash
# 安装Alembic
pip install alembic

# 初始化Alembic配置
alembic init alembic

# 项目结构
# ├── alembic/
# │   ├── versions/      # 迁移脚本目录
# │   ├── env.py         # 环境配置
# │   └── script.py.mako # 迁移脚本模板
# └── alembic.ini        # 配置文件
```

### 配置Alembic

```python
# alembic/env.py
import sys
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.append(str(Path(__file__).parent.parent))

from app.models import Base
from app.core.config import settings

# 使用配置中的数据库URL
config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# 设置目标元数据
target_metadata = Base.metadata

# 其他配置
def run_migrations_online():
    """在线运行迁移"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,  # 检测类型变化
            compare_server_default=True,  # 检测默认值变化

            # 重要：设置版本路径
            version_path=os.path.join(
                os.path.dirname(__file__), "versions"
            ),

            # 生成迁移时的模板
            render_as_batch=True,  # 支持批处理操作（如SQLite）

            # 上下文变量
            process_revision_directives=process_revision_directives,
        )

        with context.begin_transaction():
            context.run_migrations()

# alembic.ini 配置示例
"""
# 使用.env文件中的配置
sqlalchemy.url = postgresql://user:pass@localhost/dbname

# 迁移脚本模板
file_template = %%(year)d%%(month).2d%%(day).2d_%%(hour).2d%%(minute).2d_%%(rev)s_%%(slug)s

# 版本路径
version_locations = alembic/versions

# 日志配置
[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
"""
```

### 迁移工作流

```bash
# 1. 创建迁移脚本（自动检测模型变化）
alembic revision --autogenerate -m "创建用户表"

# 2. 检查生成的迁移脚本
# alembic/versions/20231001_1200_xxxx_create_user_table.py

# 3. 应用迁移
alembic upgrade head

# 4. 查看迁移历史
alembic history

# 5. 回滚迁移
alembic downgrade -1  # 回滚一个版本
alembic downgrade base  # 回滚到初始状态

# 6. 在代码中运行迁移（适合部署脚本）
from alembic import command
from alembic.config import Config

def run_migrations():
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")

# 7. 生产环境最佳实践
# 在Dockerfile中添加
# RUN alembic upgrade head
```

### 高级迁移技巧

```python
# 自定义迁移操作
"""创建用户表"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # 创建表
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # 创建索引
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_created_at'), 'users', ['created_at'], unique=False)

    # 添加约束
    op.create_check_constraint(
        'email_format_check',
        'users',
        "email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'"
    )

    # 插入初始数据
    op.execute("""
        INSERT INTO users (email, hashed_password, is_active)
        VALUES ('admin@example.com', 'hashed_password', true)
    """)

def downgrade():
    # 删除表（包含所有依赖）
    op.drop_table('users')
```

## 4. CRUD操作完整实现

### 通用CRUD基类

```python
from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy.orm import Session

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """CRUD对象的基类，提供Create, Read, Update, Delete操作"""

    def __init__(self, model: Type[ModelType]):
        self.model = model

    def get(self, db: Session, id: Any) -> Optional[ModelType]:
        return db.query(self.model).filter(self.model.id == id).first()

    def get_multi(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        **filters
    ) -> List[ModelType]:
        query = db.query(self.model)

        # 应用过滤器
        for field, value in filters.items():
            if hasattr(self.model, field):
                query = query.filter(getattr(self.model, field) == value)

        return query.offset(skip).limit(limit).all()

    def create(self, db: Session, *, obj_in: CreateSchemaType) -> ModelType:
        obj_in_data = jsonable_encoder(obj_in)
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        db.flush()  # 获取ID但不提交
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: ModelType,
        obj_in: Union[UpdateSchemaType, Dict[str, Any]]
    ) -> ModelType:
        obj_data = jsonable_encoder(db_obj)

        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)

        for field in obj_data:
            if field in update_data:
                setattr(db_obj, field, update_data[field])

        db.add(db_obj)
        db.flush()
        return db_obj

    def remove(self, db: Session, *, id: int) -> ModelType:
        obj = db.query(self.model).get(id)
        if obj:
            db.delete(obj)
            db.flush()
        return obj

    def count(self, db: Session, **filters) -> int:
        query = db.query(self.model)
        for field, value in filters.items():
            if hasattr(self.model, field):
                query = query.filter(getattr(self.model, field) == value)
        return query.count()
```

### 用户CRUD实现

```python
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash, verify_password

class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    """用户特定的CRUD操作"""

    def get_by_email(self, db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_username(self, db: Session, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        # 创建时哈希密码
        db_obj = User(
            email=obj_in.email,
            username=obj_in.username,
            hashed_password=get_password_hash(obj_in.password),
            full_name=obj_in.full_name,
            is_active=True,
        )
        db.add(db_obj)
        db.flush()
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: User,
        obj_in: Union[UserUpdate, Dict[str, Any]]
    ) -> User:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)

        # 如果更新密码，需要重新哈希
        if "password" in update_data:
            hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]
            update_data["hashed_password"] = hashed_password

        return super().update(db, db_obj=db_obj, obj_in=update_data)

    def authenticate(
        self,
        db: Session,
        *,
        email: str,
        password: str
    ) -> Optional[User]:
        user = self.get_by_email(db, email=email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def is_active(self, user: User) -> bool:
        return user.is_active

    def is_superuser(self, user: User) -> bool:
        return user.is_superuser

# 创建实例
user = CRUDUser(User)
```

### FastAPI端点集成

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.user import User as UserSchema, UserCreate, UserUpdate
from app.crud.user import user as user_crud

router = APIRouter()

@router.get("/", response_model=List[UserSchema])
def read_users(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
):
    """获取用户列表（带分页和过滤）"""
    filters = {}
    if is_active is not None:
        filters["is_active"] = is_active

    users = user_crud.get_multi(
        db, skip=skip, limit=limit, **filters
    )
    return users

@router.get("/{user_id}", response_model=UserSchema)
def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取单个用户"""
    user = user_crud.get(db, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限检查：只能查看自己或管理员
    if user.id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="权限不足")

    return user

@router.post("/", response_model=UserSchema)
def create_user(
    *,
    db: Session = Depends(get_db),
    user_in: UserCreate,
):
    """创建用户"""
    # 检查邮箱是否已存在
    user = user_crud.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="该邮箱已被注册"
        )

    # 检查用户名是否已存在
    user = user_crud.get_by_username(db, username=user_in.username)
    if user:
        raise HTTPException(
            status_code=400,
            detail="该用户名已被使用"
        )

    # 创建用户
    user = user_crud.create(db, obj_in=user_in)
    return user

@router.put("/{user_id}", response_model=UserSchema)
def update_user(
    *,
    db: Session = Depends(get_db),
    user_id: int,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
):
    """更新用户"""
    user = user_crud.get(db, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限检查：只能更新自己或管理员
    if user.id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="权限不足")

    # 检查邮箱唯一性（如果更新邮箱）
    if user_in.email and user_in.email != user.email:
        existing_user = user_crud.get_by_email(db, email=user_in.email)
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="该邮箱已被注册"
            )

    user = user_crud.update(db, db_obj=user, obj_in=user_in)
    return user

@router.delete("/{user_id}", response_model=UserSchema)
def delete_user(
    *,
    db: Session = Depends(get_db),
    user_id: int,
    current_user: User = Depends(get_current_user),
):
    """删除用户"""
    user = user_crud.get(db, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限检查：只能删除自己或管理员
    if user.id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="权限不足")

    # 不能删除自己（管理员可以删除其他用户）
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="不能删除自己的账户"
        )

    user = user_crud.remove(db, id=user_id)
    return user
```

## 5. 关系建模：一对多、多对多

### 一对多关系（作者-文章）

```python
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import List

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)

    # 一对多关系：一个用户有多篇文章
    articles: Mapped[List["Article"]] = relationship(
        back_populates="author",  # 反向引用
        cascade="all, delete-orphan",  # 级联删除
        lazy="selectin",  # 查询时立即加载
        order_by="Article.created_at.desc()"  # 默认排序
    )

    # 评论关系
    comments: Mapped[List["Comment"]] = relationship(
        back_populates="user",
        lazy="dynamic"  # 返回查询对象，支持进一步过滤
    )

class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)

    # 外键关系
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True
    )

    # 多对一关系：多篇文章属于一个作者
    author: Mapped["User"] = relationship(
        back_populates="articles",
        lazy="joined"  # 使用JOIN立即加载作者信息
    )

    # 一对多：文章有多个标签（通过关联表）
    tags: Mapped[List["Tag"]] = relationship(
        secondary="article_tags",
        back_populates="articles"
    )

    # 一对多：文章有多个评论
    comments: Mapped[List["Comment"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan"
    )
```

### 多对多关系（文章-标签）

```python
# 关联表（纯SQLAlchemy Core风格）
from sqlalchemy import Table, Column, ForeignKey

article_tags = Table(
    "article_tags",
    Base.metadata,
    Column("article_id", ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow),

    # 添加索引
    Index("ix_article_tags_article_id", "article_id"),
    Index("ix_article_tags_tag_id", "tag_id"),
)

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    # 多对多关系：一个标签对应多篇文章
    articles: Mapped[List["Article"]] = relationship(
        secondary=article_tags,
        back_populates="tags"
    )

    # 自引用关系：父标签-子标签
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("tags.id"),
        index=True
    )

    parent: Mapped[Optional["Tag"]] = relationship(
        "Tag",
        remote_side=[id],
        back_populates="children"
    )

    children: Mapped[List["Tag"]] = relationship(
        "Tag",
        back_populates="parent",
        cascade="all, delete-orphan"
    )
```

### 复杂关系查询示例

```python
from sqlalchemy.orm import joinedload, selectinload, contains_eager
from sqlalchemy import func, desc

def get_user_with_articles(db: Session, user_id: int):
    """获取用户及其文章（带标签）"""
    return db.query(User).options(
        # 立即加载文章
        selectinload(User.articles).options(
            # 加载文章的标签
            joinedload(Article.tags),
            # 加载文章的评论数量
            selectinload(Article.comments)
        ),
        # 加载用户的评论
        joinedload(User.comments)
    ).filter(User.id == user_id).first()

def get_popular_tags(db: Session, limit: int = 10):
    """获取最流行的标签（按使用次数排序）"""
    return db.query(
        Tag,
        func.count(article_tags.c.article_id).label("usage_count")
    ).join(
        article_tags
    ).group_by(
        Tag.id
    ).order_by(
        desc("usage_count")
    ).limit(limit).all()

def get_articles_by_tag(db: Session, tag_slug: str, page: int = 1, per_page: int = 20):
    """按标签获取文章（带分页）"""
    query = db.query(Article).join(
        Article.tags
    ).filter(
        Tag.slug == tag_slug
    ).options(
        joinedload(Article.author),
        selectinload(Article.tags),
        selectinload(Article.comments).joinedload(Comment.user)
    ).order_by(
        Article.created_at.desc()
    )

    # 分页
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }
```

## 6. 查询优化：避免N+1问题

### N+1问题是什么？

```python
# 错误的写法：N+1查询问题
def get_users_with_articles_naive(db: Session):
    """每个用户的文章都会产生一次查询"""
    users = db.query(User).all()

    result = []
    for user in users:
        # 这里会产生额外的查询！
        articles = db.query(Article).filter(Article.author_id == user.id).all()
        result.append({
            "user": user,
            "articles": articles,
            "article_count": len(articles)  # 可能还有计数查询
        })

    return result

# 100个用户 = 1（查询用户） + 100（查询文章） = 101次查询！
```

### 解决方案1：Eager Loading（立即加载）

```python
from sqlalchemy.orm import selectinload, joinedload, subqueryload

def get_users_with_articles_optimized(db: Session):
    """使用立即加载避免N+1问题"""

    # 方法1：selectinload（适合一对多）
    users = db.query(User).options(
        selectinload(User.articles)  # 使用IN查询加载所有文章
    ).all()

    # 方法2：joinedload（适合多对一）
    articles = db.query(Article).options(
        joinedload(Article.author)  # 使用JOIN加载作者
    ).all()

    # 方法3：多个关系同时加载
    users_with_data = db.query(User).options(
        selectinload(User.articles).selectinload(Article.tags),
        selectinload(User.comments)
    ).all()

    return users
```

### 解决方案2：批量查询

```python
from typing import Dict, List
from sqlalchemy import tuple_

def batch_get_articles_by_authors(db: Session, author_ids: List[int]) -> Dict[int, List[Article]]:
    """批量获取多个作者的文章"""
    if not author_ids:
        return {}

    # 一次查询获取所有文章
    all_articles = db.query(Article).filter(
        Article.author_id.in_(author_ids)
    ).order_by(
        Article.author_id,
        Article.created_at.desc()
    ).all()

    # 在内存中分组
    result = {}
    for article in all_articles:
        if article.author_id not in result:
            result[article.author_id] = []
        result[article.author_id].append(article)

    return result

def batch_get_counts(db: Session, model_class, group_by_field: str) -> Dict[Any, int]:
    """批量获取分组计数"""
    from sqlalchemy import func

    counts = db.query(
        getattr(model_class, group_by_field),
        func.count(model_class.id).label("count")
    ).group_by(
        getattr(model_class, group_by_field)
    ).all()

    return dict(counts)
```

### 解决方案3：使用窗口函数

```python
from sqlalchemy import func, over
from sqlalchemy.orm import aliased

def get_users_with_article_counts(db: Session):
    """使用窗口函数获取用户及其文章数"""

    # 创建文章计数的子查询
    article_count = func.count(Article.id).over(
        partition_by=Article.author_id
    ).label("article_count")

    # 使用DISTINCT ON获取每个用户的最新文章
    subq = db.query(
        Article.author_id,
        Article.id.label("latest_article_id"),
        Article.title.label("latest_article_title"),
        func.row_number().over(
            partition_by=Article.author_id,
            order_by=Article.created_at.desc()
        ).label("row_num")
    ).subquery()

    users = db.query(
        User,
        article_count,
        subq.c.latest_article_title
    ).outerjoin(
        Article, User.id == Article.author_id
    ).outerjoin(
        subq, (User.id == subq.c.author_id) & (subq.c.row_num == 1)
    ).group_by(
        User.id,
        subq.c.latest_article_title
    ).all()

    return users
```

### 查询性能监控

```python
from sqlalchemy import event
from sqlalchemy.engine import Engine
import time
import logging

# 配置查询日志
logging.basicConfig()
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

# 监控慢查询
SLOW_QUERY_THRESHOLD = 1.0  # 1秒

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault('query_start_time', []).append(time.time())

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.time() - conn.info['query_start_time'].pop()
    if total > SLOW_QUERY_THRESHOLD:
        logging.warning(
            f"慢查询警告: {total:.3f}秒\n"
            f"SQL: {statement[:200]}...\n"
            f"参数: {parameters}"
        )
```

## 7. 异步数据库操作实践

### SQLAlchemy 2.0异步支持

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker
)
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

# 创建异步引擎（注意驱动变化）
async_engine = create_async_engine(
    "postgresql+asyncpg://user:password@localhost/fastapi_db",
    echo=True,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,
)

# 创建异步会话工厂
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# 异步依赖注入
async def get_async_db() -> AsyncSession:
    """获取异步数据库会话"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# 异步CRUD基类
from typing import TypeVar, Type, Sequence
from pydantic import BaseModel

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)

class AsyncCRUDBase(Generic[ModelType, CreateSchemaType]):
    """异步CRUD基类"""

    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, db: AsyncSession, id: Any) -> Optional[ModelType]:
        result = await db.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> Sequence[ModelType]:
        result = await db.execute(
            select(self.model)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create(self, db: AsyncSession, obj_in: CreateSchemaType) -> ModelType:
        obj_in_data = obj_in.dict()
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        await db.flush()
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        db_obj: ModelType,
        obj_in: dict
    ) -> ModelType:
        for field, value in obj_in.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.flush()
        return db_obj

    async def delete(self, db: AsyncSession, id: int) -> Optional[ModelType]:
        db_obj = await self.get(db, id)
        if db_obj:
            await db.delete(db_obj)
            await db.flush()
        return db_obj
```

### 异步查询示例

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

@router.get("/users/{user_id}")
async def get_user_with_articles(
    user_id: int,
    db: AsyncSession = Depends(get_async_db)
):
    """异步获取用户及其文章"""
    # 异步查询
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.articles)
            .selectinload(Article.tags)
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        return {"error": "用户不存在"}

    # 异步计算文章统计
    article_count = await db.scalar(
        select(func.count(Article.id))
        .where(Article.author_id == user_id)
    )

    return {
        "user": user,
        "article_count": article_count,
        "articles": user.articles
    }

@router.post("/users/")
async def create_user_batch(
    users_data: List[UserCreate],
    db: AsyncSession = Depends(get_async_db)
):
    """批量创建用户（异步）"""
    created_users = []

    async with db.begin():  # 使用事务
        for user_data in users_data:
            # 检查用户名是否已存在
            exists = await db.scalar(
                select(func.count(User.id))
                .where(User.username == user_data.username)
            )

            if exists:
                continue  # 或抛出异常

            # 创建用户
            user = User(
                username=user_data.username,
                email=user_data.email,
                hashed_password=get_password_hash(user_data.password)
            )
            db.add(user)
            created_users.append(user)

        await db.flush()

    return {"created_count": len(created_users), "users": created_users}
```

### 性能对比：同步 vs 异步

```python
import asyncio
import time
from typing import List

async def benchmark_async_queries(db: AsyncSession, user_ids: List[int]):
    """异步并发查询基准测试"""
    start = time.time()

    # 并发执行多个查询
    tasks = []
    for user_id in user_ids:
        task = db.execute(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.articles))
        )
        tasks.append(task)

    # 等待所有查询完成
    results = await asyncio.gather(*tasks)

    duration = time.time() - start
    return duration, len(results)

def benchmark_sync_queries(db: Session, user_ids: List[int]):
    """同步顺序查询基准测试"""
    start = time.time()

    results = []
    for user_id in user_ids:
        user = db.query(User).options(
            selectinload(User.articles)
        ).filter(User.id == user_id).first()
        results.append(user)

    duration = time.time() - start
    return duration, len(results)

# 测试结果通常显示：
# - 少量查询：同步略快（无上下文切换开销）
# - 大量I/O密集型查询：异步明显更快（并发执行）
```

## 实战项目：博客系统完整实现

```python
# app/models/blog.py
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Text, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

class BlogPost(Base):
    __tablename__ = "blog_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    content: Mapped[str] = mapped_column(Text)
    excerpt: Mapped[Optional[str]] = mapped_column(String(500))
    cover_image: Mapped[Optional[str]] = mapped_column(String(500))

    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, published, archived
    is_featured: Mapped[bool] = mapped_column(default=False)
    view_count: Mapped[int] = mapped_column(default=0)

    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id"))

    published_at: Mapped[Optional[datetime]] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

    # 关系
    author: Mapped["User"] = relationship(back_populates="blog_posts")
    category: Mapped[Optional["Category"]] = relationship(back_populates="posts")
    tags: Mapped[List["Tag"]] = relationship(
        secondary="post_tags",
        back_populates="posts"
    )
    comments: Mapped[List["Comment"]] = relationship(
        back_populates="post",
        order_by="Comment.created_at.desc()"
    )

    @property
    def reading_time(self) -> int:
        """估算阅读时间（按每分钟200字）"""
        word_count = len(self.content.split())
        return max(1, word_count // 200)

class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # 自引用关系：父子分类
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("categories.id"),
        index=True
    )

    parent: Mapped[Optional["Category"]] = relationship(
        "Category",
        remote_side=[id],
        back_populates="children"
    )

    children: Mapped[List["Category"]] = relationship(
        "Category",
        back_populates="parent"
    )

    # 一对多：分类下的文章
    posts: Mapped[List["BlogPost"]] = relationship(
        back_populates="category",
        order_by="BlogPost.published_at.desc()"
    )

# 关联表
post_tags = Table(
    "post_tags",
    Base.metadata,
    Column("post_id", ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow)
)
```

## 最佳实践总结

1. **模型设计原则**
   - 优先使用声明式映射（SQLAlchemy 2.0+）
   - 合理使用索引和约束
   - 避免过度规范化

2. **查询优化要点**
   - 使用`selectinload`避免N+1问题
   - 合理使用分页，避免一次查询过多数据
   - 监控慢查询，建立索引策略

3. **事务管理**
   - 使用上下文管理器确保事务正确提交/回滚
   - 长事务要小心锁和连接占用
   - 考虑使用读写分离

4. **异步实践**
   - 评估项目是否需要异步
   - 注意异步驱动的选择（asyncpg, aiomysql等）
   - 合理控制并发数量

5. **迁移策略**
   - 开发环境使用`alembic upgrade head`
   - 生产环境要有回滚计划
   - 大数据表迁移要分批进行

## 扩展学习资源

- [SQLAlchemy官方文档](https://docs.sqlalchemy.org/)
- [FastAPI SQL数据库指南](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [Alembic迁移教程](https://alembic.sqlalchemy.org/en/latest/tutorial.html)
- [PostgreSQL性能优化](https://www.postgresql.org/docs/current/performance-tips.html)

---

**关键要点**：数据库集成是FastAPI项目的核心。掌握SQLAlchemy不仅能让你的API更强大，还能让你深入理解数据层的工作原理。记住：好的数据库设计是成功的一半！
