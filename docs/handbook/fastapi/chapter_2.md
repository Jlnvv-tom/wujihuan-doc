# FastAPI请求与响应：掌握API对话的艺术

> 在RESTful API的世界里，请求与响应就像是客户端与服务端之间的对话。掌握这门艺术，你就能构建出优雅、健壮的API接口。

## 1. 路径参数：定义API的访问地址

路径参数是RESTful API中最基础的部分，它们定义了资源的访问路径。FastAPI让路径参数的处理变得异常简单。

### 基础路径参数

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
async def read_item(item_id: int):
    """基本的路径参数，FastAPI会自动进行类型转换"""
    return {"item_id": item_id}

# 访问示例：
# GET /items/42 → {"item_id": 42}
# GET /items/not-a-number → 自动返回422错误
```

### 路径参数的高级用法

```python
from enum import Enum
from datetime import date
from uuid import UUID
from typing import Optional

# 枚举类型的路径参数
class ModelName(str, Enum):
    alexnet = "alexnet"
    resnet = "resnet"
    lenet = "lenet"

@app.get("/models/{model_name}")
async def get_model(model_name: ModelName):
    """使用枚举限制参数值"""
    if model_name == ModelName.alexnet:
        return {"model_name": model_name, "message": "Deep Learning FTW!"}
    if model_name.value == "lenet":
        return {"model_name": model_name, "message": "LeCNN all the images"}
    return {"model_name": model_name, "message": "Have some residuals"}

# 文件路径参数
@app.get("/files/{file_path:path}")
async def read_file(file_path: str):
    """接收文件路径参数"""
    return {"file_path": file_path}

# 日期参数
@app.get("/events/{event_date}")
async def get_events(event_date: date):
    """日期类型的路径参数"""
    return {"date": event_date, "events": ["会议", "发布会"]}

# UUID参数
@app.get("/users/{user_id}")
async def get_user(user_id: UUID):
    """UUID类型的路径参数"""
    return {"user_id": user_id, "name": "张三"}
```

### 路径参数验证

```python
from fastapi import Path

@app.get("/items/{item_id}/detail")
async def read_item_detail(
    item_id: int = Path(
        ...,
        title="商品ID",
        description="要查询的商品唯一标识符",
        gt=0,  # 大于0
        le=1000,  # 小于等于1000
        example=123
    )
):
    """带验证的路径参数"""
    return {"item_id": item_id, "detail": "商品详细信息"}

# 正则表达式验证
@app.get("/users/{username}")
async def get_user_by_name(
    username: str = Path(
        ...,
        regex="^[a-zA-Z0-9_]{3,20}$",  # 用户名正则验证
        description="用户名，3-20位字母数字下划线"
    )
):
    return {"username": username}
```

## 2. 查询参数：灵活的请求过滤器

查询参数是API中最灵活的过滤工具，用于可选的、非必需的参数传递。

### 基础查询参数

```python
from typing import Optional, List

@app.get("/items/")
async def read_items(
    skip: int = 0,  # 默认值为0
    limit: int = 10,  # 默认值为10
    q: Optional[str] = None  # 可选参数
):
    """基础查询参数示例"""
    items = [
        {"id": 1, "name": "商品1"},
        {"id": 2, "name": "商品2"},
        {"id": 3, "name": "商品3"}
    ]

    result = items[skip:skip+limit]

    if q:
        result = [item for item in result if q.lower() in item["name"].lower()]

    return {
        "skip": skip,
        "limit": limit,
        "q": q,
        "items": result
    }

# 访问示例：
# GET /items/ → 返回前10个商品
# GET /items/?skip=5&limit=3 → 跳过5个，返回3个
# GET /items/?q=商品 → 搜索包含"商品"的商品
```

### 查询参数验证

```python
from fastapi import Query

@app.get("/search/")
async def search_items(
    q: Optional[str] = Query(
        None,
        min_length=3,  # 最小长度
        max_length=50,  # 最大长度
        title="搜索关键词",
        description="搜索商品的名称或描述",
        example="笔记本电脑"
    ),
    category: Optional[str] = Query(
        None,
        regex="^(电子产品|书籍|服装)$",  # 枚举值验证
        description="商品分类"
    ),
    price_min: Optional[float] = Query(
        None,
        ge=0,  # 大于等于0
        description="最低价格"
    ),
    price_max: Optional[float] = Query(
        None,
        gt=0,  # 大于0
        description="最高价格"
    ),
    tags: List[str] = Query([], description="标签筛选")
):
    """带验证的查询参数"""
    # 实际应用中会查询数据库
    return {
        "query": {
            "q": q,
            "category": category,
            "price_min": price_min,
            "price_max": price_max,
            "tags": tags
        },
        "results": []  # 搜索结果
    }

# 必需查询参数
@app.get("/required-search/")
async def required_search(
    keyword: str = Query(..., min_length=1, description="搜索关键词")
):
    """必需的查询参数"""
    return {"keyword": keyword, "results": []}
```

### 查询参数的更多特性

```python
from typing import Union

# 多种类型参数
@app.get("/mixed-params/")
async def mixed_params(
    param: Union[int, str, None] = None,  # 可以是int或str
    sort_by: str = Query("id", description="排序字段"),
    sort_order: str = Query("asc", regex="^(asc|desc)$")
):
    """混合类型的查询参数"""
    return {
        "param": param,
        "sort_by": sort_by,
        "sort_order": sort_order
    }

# 别名参数
@app.get("/alias/")
async def alias_params(
    item_query: str = Query(None, alias="item-query"),  # API中使用item-query
    user_name: str = Query(None, alias="user-name")
):
    """使用别名的查询参数"""
    return {
        "item_query": item_query,
        "user_name": user_name
    }

# 弃用参数
@app.get("/deprecated/")
async def deprecated_params(
    old_param: str = Query(
        None,
        deprecated=True,  # 标记为已弃用
        description="已弃用，请使用new_param"
    ),
    new_param: str = Query(None, description="新参数")
):
    """包含已弃用参数的接口"""
    return {"new_param": new_param}
```

## 3. 请求体：处理复杂数据输入

请求体用于接收客户端发送的复杂数据，通常是JSON格式。

### 基础请求体

```python
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    tax: Optional[float] = None

@app.post("/items/")
async def create_item(item: Item):
    """创建商品 - 基础请求体"""
    # 计算含税价格
    price_with_tax = item.price
    if item.tax:
        price_with_tax = item.price * (1 + item.tax)

    return {
        **item.dict(),
        "price_with_tax": price_with_tax,
        "created_at": datetime.now()
    }

# 使用示例：
# POST /items/
# {
#   "name": "笔记本电脑",
#   "description": "高性能游戏本",
#   "price": 8999.99,
#   "tax": 0.13
# }
```

### 路径参数 + 查询参数 + 请求体

```python
@app.put("/items/{item_id}")
async def update_item(
    item_id: int,  # 路径参数
    item: Item,    # 请求体
    q: Optional[str] = None  # 查询参数
):
    """综合使用所有参数类型"""
    result = {"item_id": item_id, **item.dict()}

    if q:
        result.update({"q": q})

    return result
```

### 多个请求体参数

```python
class User(BaseModel):
    username: str
    email: EmailStr

@app.put("/multi-body/")
async def update_multiple_items(
    item: Item,
    user: User,
    importance: int = Body(..., gt=0)  # 单独的Body参数
):
    """多个请求体参数"""
    return {
        "item": item,
        "user": user,
        "importance": importance
    }
```

## 4. Pydantic模型：数据验证的神器

Pydantic是FastAPI的数据验证核心，它基于Python类型提示提供了强大的数据验证功能。

### 基础模型定义

```python
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime

class Product(BaseModel):
    id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    price: float = Field(..., gt=0, description="价格必须大于0")
    in_stock: bool = True
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)

    # 自定义验证器
    @validator('name')
    def name_must_contain_space(cls, v):
        if ' ' not in v:
            raise ValueError('名称必须包含空格')
        return v.title()  # 自动转换为标题格式

    @validator('price')
    def price_must_be_reasonable(cls, v):
        if v > 1000000:
            raise ValueError('价格过高，请检查')
        return round(v, 2)  # 保留两位小数
```

### 复杂嵌套模型

```python
class Address(BaseModel):
    street: str
    city: str
    postal_code: str
    country: str = "中国"

class OrderItem(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0, le=100)

class Order(BaseModel):
    order_id: str
    customer_name: str
    shipping_address: Address  # 嵌套模型
    items: List[OrderItem]     # 列表嵌套
    total_amount: float
    notes: Optional[str] = None

    # 跨字段验证
    @validator('total_amount')
    def validate_total_amount(cls, v, values):
        if 'items' in values:
            # 这里可以计算总价并与v比较
            pass
        return v

# 使用示例
order_data = {
    "order_id": "ORD123456",
    "customer_name": "张三",
    "shipping_address": {
        "street": "人民路123号",
        "city": "北京",
        "postal_code": "100000"
    },
    "items": [
        {"product_id": 1, "quantity": 2},
        {"product_id": 2, "quantity": 1}
    ],
    "total_amount": 299.98
}
```

### 模型继承与复用

```python
# 基础模型
class BaseUser(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

# 创建模型
class UserCreate(BaseUser):
    password: str = Field(..., min_length=8)

# 更新模型（所有字段可选）
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)

# 响应模型（排除敏感信息）
class UserResponse(BaseUser):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True  # 支持ORM对象转换
```

## 5. 响应模型：控制API输出格式

响应模型让你能够精确控制API返回的数据结构和格式。

### 基础响应模型

```python
@app.post("/users/", response_model=UserResponse)
async def create_user(user: UserCreate):
    """创建用户，返回响应模型"""
    # 实际应用中这里会保存到数据库
    db_user = {
        "id": 1,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": True,
        "created_at": datetime.now()
    }
    return db_user  # 自动转换为UserResponse格式
```

### 排除敏感字段

```python
class PrivateUser(BaseUser):
    id: int
    hashed_password: str

class PublicUser(BaseUser):
    id: int

    class Config:
        orm_mode = True

@app.get("/users/{user_id}", response_model=PublicUser)
async def get_user(user_id: int):
    """获取用户信息，排除敏感字段"""
    # 模拟数据库查询
    private_user = {
        "id": user_id,
        "email": "user@example.com",
        "full_name": "测试用户",
        "hashed_password": "secret_hash"  # 这个字段不会在响应中出现
    }
    return private_user  # 只有PublicUser中定义的字段会被返回
```

### 响应状态码与自定义响应

```python
from fastapi import status
from fastapi.responses import JSONResponse

@app.post(
    "/create-item/",
    response_model=Item,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {
            "description": "成功创建",
            "content": {
                "application/json": {
                    "example": {
                        "name": "示例商品",
                        "price": 99.99,
                        "tax": 0.13
                    }
                }
            }
        },
        422: {
            "description": "验证错误",
            "content": {
                "application/json": {
                    "example": {
                        "detail": [
                            {
                                "loc": ["body", "price"],
                                "msg": "价格必须大于0",
                                "type": "value_error"
                            }
                        ]
                    }
                }
            }
        }
    }
)
async def create_item_with_custom_response(item: Item):
    """自定义响应"""
    # 检查商品是否存在
    if item.name == "已存在商品":
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "商品已存在"}
        )

    return item
```

## 6. 状态码与错误处理：优雅的异常对话

优雅的错误处理是专业API的重要标志。

### 自定义异常处理器

```python
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

# 自定义异常
class ItemNotFoundError(Exception):
    def __init__(self, item_id: int):
        self.item_id = item_id

# 异常处理器
@app.exception_handler(ItemNotFoundError)
async def item_not_found_handler(request: Request, exc: ItemNotFoundError):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Item Not Found",
            "message": f"找不到ID为 {exc.item_id} 的商品",
            "request_id": request.headers.get("X-Request-ID", "unknown")
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """自定义验证错误响应格式"""
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation Error",
            "details": exc.errors(),
            "timestamp": datetime.now().isoformat()
        }
    )
```

### 使用HTTPException

```python
from fastapi import HTTPException

items_db = {1: {"name": "商品1", "price": 100}}

@app.get("/items/{item_id}")
async def read_item(item_id: int):
    if item_id not in items_db:
        raise HTTPException(
            status_code=404,
            detail="商品不存在",
            headers={"X-Error": "Item not found"}
        )

    if item_id == 0:
        # 自定义状态码
        raise HTTPException(
            status_code=418,
            detail="我不能处理这个请求",
            headers={"X-Error": "拒绝处理"}
        )

    return items_db[item_id]
```

### 全局错误处理中间件

```python
from fastapi.middleware.cors import CORSMiddleware
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        # 记录异常日志
        logger.error(f"未处理的异常: {exc}", exc_info=True)

        # 返回友好的错误信息
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Internal Server Error",
                "message": "服务器内部错误，请稍后重试",
                "request_id": request.headers.get("X-Request-ID")
            }
        )
```

## 7. 文件上传与下载：处理二进制数据

FastAPI提供了强大的文件上传和下载功能。

### 单文件上传

```python
from fastapi import File, UploadFile
import shutil
from pathlib import Path

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/upload/")
async def upload_file(
    file: UploadFile = File(..., description="上传的文件")
):
    """单文件上传"""
    # 验证文件类型
    allowed_types = ["image/jpeg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file.content_type}"
        )

    # 验证文件大小（最大10MB）
    MAX_SIZE = 10 * 1024 * 1024
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail="文件大小超过10MB限制"
        )

    # 保存文件
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as buffer:
        buffer.write(contents)

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents),
        "path": str(file_path)
    }
```

### 多文件上传

```python
@app.post("/multi-upload/")
async def upload_multiple_files(
    files: List[UploadFile] = File(..., description="多个文件")
):
    """多文件上传"""
    results = []

    for file in files:
        # 为每个文件生成唯一文件名
        import uuid
        file_extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"

        file_path = UPLOAD_DIR / unique_filename

        # 异步保存文件
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)

        results.append({
            "original_filename": file.filename,
            "saved_filename": unique_filename,
            "size": len(content)
        })

    return {
        "total_files": len(files),
        "files": results
    }
```

### 文件下载

```python
from fastapi.responses import FileResponse, StreamingResponse
import aiofiles

@app.get("/download/{filename}")
async def download_file(filename: str):
    """文件下载"""
    file_path = UPLOAD_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    # 使用FileResponse自动处理文件下载
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='application/octet-stream'
    )

@app.get("/stream-download/{filename}")
async def stream_download(filename: str):
    """流式下载大文件"""
    file_path = UPLOAD_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    async def file_streamer():
        """异步文件流生成器"""
        async with aiofiles.open(file_path, 'rb') as file:
            chunk_size = 1024 * 1024  # 1MB chunks

            while chunk := await file.read(chunk_size):
                yield chunk

    # 获取文件大小
    file_size = file_path.stat().st_size

    # 设置响应头
    headers = {
        "Content-Disposition": f"attachment; filename={filename}",
        "Content-Length": str(file_size)
    }

    return StreamingResponse(
        file_streamer(),
        media_type="application/octet-stream",
        headers=headers
    )
```

### 表单与文件混合上传

```python
from fastapi import Form

@app.post("/upload-with-data/")
async def upload_with_metadata(
    title: str = Form(...),
    description: str = Form(None),
    tags: List[str] = Form([]),
    file: UploadFile = File(...)
):
    """表单数据和文件混合上传"""
    # 保存文件
    file_path = UPLOAD_DIR / file.filename
    contents = await file.read()
    with open(file_path, "wb") as buffer:
        buffer.write(contents)

    # 保存元数据到数据库（这里简化为返回）
    metadata = {
        "title": title,
        "description": description,
        "tags": tags,
        "filename": file.filename,
        "size": len(contents)
    }

    return metadata
```

## 最佳实践总结

1. **路径参数**：用于标识资源，应该简洁明了
2. **查询参数**：用于过滤、排序、分页等操作
3. **请求体**：使用Pydantic模型确保数据验证
4. **响应模型**：明确API输出，保护敏感数据
5. **错误处理**：提供清晰、友好的错误信息
6. **文件处理**：注意安全性和性能考虑

通过掌握这些请求与响应的处理技巧，你就能构建出既强大又易用的API接口。记住，好的API设计就像好的对话——清晰、一致、友好。

**思考题**：在你的项目中，哪些API设计可以应用今天学到的技巧进行优化？欢迎在评论区分享你的实践！
