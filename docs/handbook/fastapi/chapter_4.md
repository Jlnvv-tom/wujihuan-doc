# FastAPI数据验证与类型提示

> 数据验证不只是检查输入，更是API健壮性的第一道防线。FastAPI + Pydantic的组合让Python类型系统发挥出超乎想象的力量。

## 引言：为什么需要数据验证？

想象一下，你正在构建一个用户注册接口。如果没有数据验证，你会收到各种"惊喜"：

- 邮箱地址缺少"@"符号
- 密码长度只有1个字符
- 年龄是负数或1000岁
- 手机号包含字母

传统的解决方案是在业务逻辑中写一堆`if-else`判断，代码冗长且难以维护。而FastAPI通过类型提示和Pydantic，提供了一种更优雅、更强大的解决方案。

## 1. Python类型提示深度解析

### 基础类型提示

```python
# 传统Python写法
def process_user(name, age, email):
    # 需要手动检查每个参数类型
    if not isinstance(name, str):
        raise TypeError("name必须是字符串")
    # ... 更多检查
    return f"用户: {name}, 年龄: {age}"

# 使用类型提示
def process_user(name: str, age: int, email: str) -> str:
    """类型提示让函数签名更加清晰"""
    return f"用户: {name}, 年龄: {age}"
```

### 高级类型提示（Python 3.8+）

```python
from typing import List, Dict, Optional, Union
from datetime import datetime
from pydantic import BaseModel

# 各种类型提示示例
class UserData(BaseModel):
    name: str
    age: Optional[int] = None  # 可选参数
    emails: List[str]  # 字符串列表
    metadata: Dict[str, Union[str, int]]  # 字典，值为字符串或整数
    created_at: datetime = datetime.now()  # 默认值
    tags: List[str] = []  # 默认空列表
```

### 使用mypy进行静态类型检查

```bash
# 安装mypy
pip install mypy

# 检查类型错误
mypy your_app.py
```

## 2. Pydantic字段类型大全

Pydantic提供了丰富的字段类型，覆盖了大多数业务场景：

```python
from pydantic import BaseModel, Field, EmailStr, HttpUrl, IPvAnyAddress
from decimal import Decimal
from uuid import UUID
from datetime import date, datetime, time, timedelta

class ComprehensiveModel(BaseModel):
    # 基础类型
    id: int = Field(gt=0)  # 大于0的整数
    price: Decimal = Field(max_digits=10, decimal_places=2)
    is_active: bool = True

    # 字符串约束
    username: str = Field(min_length=3, max_length=50, regex=r'^[a-zA-Z0-9_]+$')
    password: str = Field(min_length=8, max_length=100)
    email: EmailStr  # 邮箱验证
    website: HttpUrl  # URL验证
    ip_address: IPvAnyAddress  # IP地址验证

    # 标识符
    uuid: UUID
    token: str = Field(pattern=r'^[A-Za-z0-9]{32}$')

    # 日期时间
    birthday: date
    appointment: datetime
    duration: timedelta
    reminder_time: time

    # 复杂类型
    tags: List[str] = Field(min_items=1, max_items=10)
    scores: Dict[str, float]

    # 配置示例
    config_field: str = Field(
        alias="configField",  # 序列化别名
        description="配置字段说明",
        example="示例值",
        title="字段标题"
    )
```

### 常用验证器速查表

| 验证器        | 说明       | 示例                                         |
| ------------- | ---------- | -------------------------------------------- |
| `gt`          | 大于       | `age: int = Field(gt=0)`                     |
| `ge`          | 大于等于   | `count: int = Field(ge=0)`                   |
| `lt`          | 小于       | `rating: float = Field(lt=5.0)`              |
| `le`          | 小于等于   | `percentage: float = Field(le=100.0)`        |
| `multiple_of` | 倍数       | `page_size: int = Field(multiple_of=10)`     |
| `min_length`  | 最小长度   | `name: str = Field(min_length=1)`            |
| `max_length`  | 最大长度   | `title: str = Field(max_length=100)`         |
| `regex`       | 正则表达式 | `phone: str = Field(regex=r'^1[3-9]\d{9}$')` |

## 3. 自定义验证器：业务规则实现

### 类验证器

```python
from pydantic import BaseModel, validator, root_validator
from typing import List

class UserRegistration(BaseModel):
    username: str
    password: str
    confirm_password: str
    age: int

    # 单个字段验证器
    @validator('username')
    def username_must_be_valid(cls, v):
        if 'admin' in v.lower():
            raise ValueError('用户名不能包含admin')
        if len(v.strip()) < 3:
            raise ValueError('用户名至少3个字符')
        return v.strip()

    @validator('age')
    def age_must_be_reasonable(cls, v):
        if v < 0:
            raise ValueError('年龄不能为负数')
        if v > 150:
            raise ValueError('年龄不能超过150')
        return v

    # 跨字段验证
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'password' in values and v != values['password']:
            raise ValueError('两次密码不一致')
        return v

    # 根验证器（访问所有字段）
    @root_validator
    def validate_business_rules(cls, values):
        username = values.get('username')
        age = values.get('age')

        # 业务规则：未成年人不能注册某些用户名
        if age and age < 18 and username:
            restricted_names = ['adult', 'mature', 'vip']
            if any(name in username.lower() for name in restricted_names):
                raise ValueError('未成年人不能使用此用户名')

        return values
```

### 函数验证器

```python
from pydantic import BaseModel, field_validator

class Product(BaseModel):
    sku: str
    price: float
    stock: int

    # 使用field_validator（Pydantic v2风格）
    @field_validator('price')
    @classmethod
    def price_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('价格必须大于0')
        return round(v, 2)  # 四舍五入到2位小数

    @field_validator('sku')
    @classmethod
    def validate_sku_format(cls, v):
        # SKU格式：3个字母 + 6个数字
        import re
        pattern = r'^[A-Z]{3}\d{6}$'
        if not re.match(pattern, v):
            raise ValueError('SKU格式不正确，应为3个大写字母+6个数字')
        return v
```

## 4. 数据序列化与反序列化

### 序列化配置

```python
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class User(BaseModel):
    # Pydantic v2配置方式
    model_config = ConfigDict(
        from_attributes=True,  # 支持ORM对象
        populate_by_name=True,  # 支持别名
        json_encoders={
            datetime: lambda v: v.strftime('%Y-%m-%d %H:%M:%S')
        }
    )

    id: int
    username: str
    created_at: datetime
    # 敏感字段不序列化
    password_hash: str = Field(exclude=True)

    # 计算字段
    @property
    def profile_url(self) -> str:
        return f"/users/{self.id}"

    # 序列化时包含计算字段
    model_config['computed_fields'] = ['profile_url']

# 使用示例
user_data = {
    "id": 1,
    "username": "john_doe",
    "created_at": "2023-10-01T10:00:00",
    "password_hash": "hashed_password"
}

# 反序列化
user = User(**user_data)
print(user)  # 输出模型实例

# 序列化为字典
user_dict = user.model_dump()
print(user_dict)  # 不包含password_hash

# 序列化为JSON
user_json = user.model_dump_json()
print(user_json)

# 包含计算字段的序列化
user_with_computed = user.model_dump(include={'id', 'username', 'profile_url'})
print(user_with_computed)
```

### 响应模型序列化

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class UserIn(BaseModel):
    username: str
    password: str
    email: str

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        orm_mode = True  # 支持SQLAlchemy模型

@app.post("/users/", response_model=UserOut)
async def create_user(user: UserIn):
    # 业务逻辑...
    db_user = save_to_database(user)
    # FastAPI自动序列化SQLAlchemy模型为UserOut
    return db_user
```

## 5. 复杂嵌套模型处理

```python
from typing import List, Optional
from pydantic import BaseModel, Field

# 嵌套模型定义
class Address(BaseModel):
    street: str
    city: str
    country: str = "中国"
    postal_code: str = Field(pattern=r'^\d{6}$')

class OrderItem(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    price: float

    @property
    def total_price(self):
        return self.quantity * self.price

class UserProfile(BaseModel):
    user_id: int
    addresses: List[Address] = Field(min_items=1)
    default_address: Optional[Address] = None

    # 动态计算默认地址
    @validator('default_address', always=True)
    def set_default_address(cls, v, values):
        if v is None and 'addresses' in values:
            # 默认选择第一个地址
            return values['addresses'][0] if values['addresses'] else None
        return v

class Order(BaseModel):
    order_id: str
    customer: UserProfile
    items: List[OrderItem]
    shipping_address: Address

    @property
    def total_amount(self):
        return sum(item.total_price for item in self.items)

    @property
    def item_count(self):
        return len(self.items)

# 使用示例
order_data = {
    "order_id": "ORD123456",
    "customer": {
        "user_id": 1,
        "addresses": [
            {
                "street": "人民路123号",
                "city": "上海",
                "postal_code": "200000"
            }
        ]
    },
    "items": [
        {
            "product_id": 101,
            "quantity": 2,
            "price": 29.99
        }
    ],
    "shipping_address": {
        "street": "人民路123号",
        "city": "上海",
        "postal_code": "200000"
    }
}

order = Order(**order_data)
print(f"订单总额: {order.total_amount}")
print(f"配送地址: {order.shipping_address.city}")
```

## 6. JSON Schema生成原理

### 自动生成API文档

FastAPI基于Pydantic模型自动生成OpenAPI Schema：

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Product(BaseModel):
    id: int
    name: str = Field(description="产品名称")
    price: float = Field(gt=0, description="产品价格")
    category: str = Field(description="产品类别")

@app.post("/products/")
async def create_product(product: Product):
    return {"id": product.id, "message": "创建成功"}

# 访问 /docs 查看自动生成的API文档
# 访问 /openapi.json 查看原始JSON Schema
```

### 自定义JSON Schema

```python
from pydantic import BaseModel, Field
from pydantic.json_schema import JsonSchemaValue

class CustomModel(BaseModel):
    custom_field: str

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        core_schema,
        handler
    ) -> JsonSchemaValue:
        json_schema = handler(core_schema)
        # 自定义修改schema
        json_schema.update({
            "title": "自定义模型",
            "description": "这是一个自定义的Pydantic模型",
            "examples": [{
                "custom_field": "示例值"
            }]
        })
        return json_schema

# 生成的Schema将包含自定义信息
```

## 7. 性能优化：验证器最佳实践

### 避免性能陷阱

```python
import time
from pydantic import BaseModel, validator
from typing import List

# 不推荐的写法：在验证器中执行耗时操作
class SlowModel(BaseModel):
    items: List[str]

    @validator('items')
    def validate_items(cls, v):
        # 避免在验证器中执行IO操作或复杂计算
        time.sleep(0.1)  # 模拟耗时操作
        return v

# 推荐的写法：预处理或缓存
class OptimizedModel(BaseModel):
    items: List[str]

    # 使用__init__进行预处理
    def __init__(self, **data):
        # 预处理逻辑
        if 'items' in data:
            data['items'] = [item.strip() for item in data['items']]
        super().__init__(**data)

    # 简单的验证器
    @validator('items', each_item=True)
    def validate_each_item(cls, v):
        if not v:
            raise ValueError('项目不能为空')
        return v
```

### 批量验证优化

```python
from pydantic import BaseModel, ValidationError
from typing import List

class BatchRequest(BaseModel):
    data: List[dict]

    @validator('data')
    def validate_batch_size(cls, v):
        if len(v) > 1000:
            raise ValueError('批量处理最多1000条数据')
        return v

# 批量验证模式
def batch_validate(data_list: List[dict], model_class):
    """批量验证优化模式"""
    validated_data = []
    errors = []

    for i, data in enumerate(data_list):
        try:
            # 使用context manager减少内存占用
            with model_class.__config__.json_encoder.make():
                instance = model_class(**data)
                validated_data.append(instance)
        except ValidationError as e:
            errors.append({
                'index': i,
                'data': data,
                'errors': e.errors()
            })

    return validated_data, errors
```

### 缓存验证结果

```python
from functools import lru_cache
from pydantic import BaseModel, Field

class Product(BaseModel):
    sku: str
    price: float

    @classmethod
    @lru_cache(maxsize=128)
    def validate_sku(cls, sku: str) -> bool:
        """缓存SKU验证结果"""
        # 假设这是昂贵的验证逻辑
        return len(sku) == 10 and sku.isalnum()

    @validator('sku')
    def validate_sku_format(cls, v):
        if not cls.validate_sku(v):
            raise ValueError('SKU格式无效')
        return v
```

## 实战技巧：常见问题解决方案

### 1. 处理动态字段

```python
from pydantic import BaseModel, root_validator
from typing import Dict, Any

class DynamicModel(BaseModel):
    base_field: str
    extra_data: Dict[str, Any] = {}

    @root_validator(pre=True)
    def extract_extra_fields(cls, values):
        # 分离已知字段和额外字段
        model_fields = {field for field in cls.__fields__}
        extra_data = {}

        for key, value in list(values.items()):
            if key not in model_fields:
                extra_data[key] = values.pop(key)

        if extra_data:
            values['extra_data'] = extra_data

        return values
```

### 2. 循环引用处理

```python
from typing import Optional
from pydantic import BaseModel

# 使用Forward Reference处理循环引用
class User(BaseModel):
    name: str
    friends: Optional[list['User']] = None  # 延迟引用

# 另一种方式：使用update_forward_refs
class TreeNode(BaseModel):
    value: str
    children: Optional[list['TreeNode']] = None

TreeNode.update_forward_refs()
```

### 3. 兼容传统代码

```python
from pydantic import BaseModel, validator
import json

class LegacyCompatibleModel(BaseModel):
    data: dict

    @validator('data', pre=True)
    def parse_json_string(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                pass
        return v
```

## 总结

FastAPI的数据验证系统基于Python类型提示和Pydantic，提供了强大而灵活的数据验证能力。关键要点：

1. **类型提示是基础**：充分利用Python的类型系统
2. **Pydantic是核心**：丰富的字段类型和验证器
3. **性能很重要**：避免验证器中的耗时操作
4. **文档即代码**：自动生成API文档和Schema
5. **灵活扩展**：支持自定义验证器和复杂业务规则

掌握这些技能，你将能够构建出健壮、高效且易于维护的API系统。

> 数据验证不是限制，而是保障。好的验证系统让API更可靠，让开发者更安心。

## 扩展阅读

- [Pydantic官方文档](https://docs.pydantic.dev/)
- [FastAPI请求验证](https://fastapi.tiangolo.com/tutorial/body/)
- [Python类型提示指南](https://mypy.readthedocs.io/en/stable/cheat_sheet_py3.html)
- [JSON Schema规范](https://json-schema.org/)

---

**作者注**：数据验证是API开发中最容易被忽视但又最重要的环节。投资时间在验证逻辑上，可以节省大量的调试和维护时间。记住：垃圾进，垃圾出。好的验证确保只有优质数据进入你的系统。
