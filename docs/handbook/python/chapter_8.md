# 面向对象编程进阶：掌握Python的高级OOP技巧

> 从会用到精通，解锁Python面向对象编程的高级特性与设计艺术

## 引言：超越基础，拥抱优雅

在上一章中，我们学习了面向对象编程的基础概念：类、对象、继承、封装和多态。这些基础让我们能够构建结构化的程序，但真正优雅的代码需要更高级的技术。

你是否曾遇到过这样的问题？

- 类的继承关系变得越来越复杂，像"蜘蛛网"一样难以理解
- 想要让对象像内置类型一样自然地使用
- 需要在属性访问时添加验证逻辑
- 想要设计可扩展、易维护的系统架构

本章将带你进入Python面向对象编程的进阶世界，掌握那些让代码更加优雅、强大的高级特性。

## 8.1 多重继承与MRO：钻石问题的Python解法

多重继承是一把双刃剑：用得好可以极大提升代码复用性，用不好则会导致"菱形继承"问题（Diamond Problem）。

### 多重继承的基础

```python
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return "动物发出声音"

class Flyer:
    def fly(self):
        return f"{self.name}在飞翔"

    def speak(self):
        return "飞行者发出声音"

class Swimmer:
    def swim(self):
        return f"{self.name}在游泳"

    def speak(self):
        return "游泳者发出声音"

# 多重继承：继承多个父类
class Duck(Animal, Flyer, Swimmer):
    def __init__(self, name):
        super().__init__(name)

    # 如果Duck没有speak方法，会调用哪个父类的？
    def speak(self):
        return "嘎嘎嘎！"

duck = Duck("唐老鸭")
print(duck.fly())    # 唐老鸭在飞翔
print(duck.swim())   # 唐老鸭在游泳
print(duck.speak())  # 嘎嘎嘎！
```

### 方法解析顺序（MRO）详解

MRO决定了在多继承中，Python如何查找方法。Python使用C3线性化算法来解决这个问题。

```python
# 经典的菱形继承问题
class A:
    def method(self):
        return "A.method"

class B(A):
    def method(self):
        return "B.method"

class C(A):
    def method(self):
        return "C.method"

class D(B, C):
    pass

# 查看MRO顺序
print(D.__mro__)
# 输出: (<class '__main__.D'>, <class '__main__.B'>,
#        <class '__main__.C'>, <class '__main__.A'>, <class 'object'>)

d = D()
print(d.method())  # B.method（按照MRO顺序查找）

# 更复杂的例子
class X: pass
class Y: pass
class Z: pass
class A(X, Y): pass
class B(Y, Z): pass
class M(A, B, Z): pass

print("M的MRO:", [c.__name__ for c in M.__mro__])
# 输出: ['M', 'A', 'X', 'B', 'Y', 'Z', 'object']
```

### 理解C3线性化算法

C3算法的核心原则：

1. 子类在父类之前
2. 继承顺序中先出现的类保持在前
3. 单调性：如果C在C1的MRO中出现在C2之前，那么在C的所有子类中，C1都出现在C2之前

```python
# 手动计算MRO的示例
class O: pass
class A(O): pass
class B(O): pass
class C(O): pass
class D(O): pass
class E(O): pass
class K1(A, B, C): pass
class K2(D, B, E): pass
class K3(D, A): pass
class Z(K1, K2, K3): pass

print("Z的MRO:", [c.__name__ for c in Z.__mro__])
# 输出: ['Z', 'K1', 'K2', 'D', 'K3', 'A', 'B', 'C', 'E', 'O', 'object']

# 可视化MRO
import inspect
def print_mro(cls):
    print(f"{cls.__name__}的继承链:")
    for i, base in enumerate(inspect.getmro(cls)):
        print(f"  {i}: {base.__name__}")

print_mro(Z)
```

### super()函数的真正工作原理

`super()`并不总是调用父类，而是按照MRO顺序调用下一个类：

```python
class A:
    def __init__(self):
        print("A.__init__")
        self.value = "A"

class B(A):
    def __init__(self):
        print("B.__init__")
        super().__init__()  # 调用MRO中的下一个类（A）
        self.value = "B"

class C(A):
    def __init__(self):
        print("C.__init__")
        super().__init__()  # 调用MRO中的下一个类（A）
        self.value = "C"

class D(B, C):
    def __init__(self):
        print("D.__init__")
        super().__init__()  # 调用MRO中的下一个类（B）
        self.value = "D"

d = D()
print(f"value: {d.value}")
print(f"MRO: {[c.__name__ for c in D.__mro__]}")

# 输出:
# D.__init__
# B.__init__
# C.__init__
# A.__init__
# value: D
# MRO: ['D', 'B', 'C', 'A', 'object']
```

### 多重继承的最佳实践

1. **使用Mixin类**：Mixin是小型、单一目的的类
2. **避免复杂的继承层次**：优先使用组合
3. **明确接口**：使用抽象基类定义清晰的接口

```python
# Mixin示例：为类添加序列化功能
class JSONMixin:
    def to_json(self):
        import json
        return json.dumps(self.to_dict())

    def to_dict(self):
        # 子类必须实现
        raise NotImplementedError

class XMLMixin:
    def to_xml(self):
        import xml.etree.ElementTree as ET
        root = ET.Element(self.__class__.__name__)
        for key, value in self.to_dict().items():
            child = ET.SubElement(root, key)
            child.text = str(value)
        return ET.tostring(root, encoding='unicode')

class LoggableMixin:
    def log(self, message):
        print(f"[{self.__class__.__name__}] {message}")

# 使用Mixin
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

    def to_dict(self):
        return {"name": self.name, "email": self.email}

class EnhancedUser(JSONMixin, XMLMixin, LoggableMixin, User):
    def __init__(self, name, email, role):
        super().__init__(name, email)
        self.role = role

    def to_dict(self):
        data = super().to_dict()
        data["role"] = self.role
        return data

user = EnhancedUser("Alice", "alice@example.com", "admin")
user.log("用户创建成功")
print(user.to_json())
print(user.to_xml())
```

## 8.2 魔术方法：让对象更Pythonic

魔术方法（Magic Methods）是Python面向对象编程的灵魂，它们让自定义对象能够像内置类型一样自然。

### 常见魔术方法分类

#### 1. 对象表示方法

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    # __str__: 用户友好的字符串表示
    def __str__(self):
        return f"Point({self.x}, {self.y})"

    # __repr__: 开发者友好的字符串表示，用于调试
    def __repr__(self):
        return f"Point(x={self.x}, y={self.y})"

    # __format__: 支持格式化输出
    def __format__(self, format_spec):
        if format_spec == 'polar':
            import math
            r = math.sqrt(self.x**2 + self.y**2)
            theta = math.atan2(self.y, self.x)
            return f"Point(r={r:.2f}, θ={theta:.2f})"
        return str(self)

p = Point(3, 4)
print(str(p))    # Point(3, 4)
print(repr(p))   # Point(x=3, y=4)
print(f"{p}")    # Point(3, 4)
print(f"{p:polar}")  # Point(r=5.00, θ=0.93)
```

#### 2. 比较运算符方法

```python
class Money:
    def __init__(self, amount, currency="USD"):
        self.amount = amount
        self.currency = currency

    # 相等比较
    def __eq__(self, other):
        if isinstance(other, Money):
            return (self.amount == other.amount and
                    self.currency == other.currency)
        return False

    # 不等比较
    def __ne__(self, other):
        return not self.__eq__(other)

    # 小于
    def __lt__(self, other):
        if isinstance(other, Money) and self.currency == other.currency:
            return self.amount < other.amount
        raise TypeError("不能比较不同货币")

    # 小于等于
    def __le__(self, other):
        if isinstance(other, Money) and self.currency == other.currency:
            return self.amount <= other.amount
        raise TypeError("不能比较不同货币")

    # 哈希支持（用于在字典和集合中使用）
    def __hash__(self):
        return hash((self.amount, self.currency))

# 使用比较运算符
m1 = Money(100, "USD")
m2 = Money(200, "USD")
m3 = Money(100, "USD")

print(m1 == m3)  # True
print(m1 != m2)  # True
print(m1 < m2)   # True
print(m2 > m1)   # True（Python自动使用<的反向）

# 支持排序
wallets = [Money(500), Money(100), Money(300)]
print(sorted(wallets))  # [Money(100, USD), Money(300, USD), Money(500, USD)]
```

#### 3. 算术运算符方法

```python
class Vector:
    def __init__(self, *components):
        self.components = list(components)

    def __add__(self, other):
        """向量加法"""
        if len(self.components) != len(other.components):
            raise ValueError("向量维度不匹配")
        return Vector(*[a + b for a, b in zip(self.components, other.components)])

    def __sub__(self, other):
        """向量减法"""
        if len(self.components) != len(other.components):
            raise ValueError("向量维度不匹配")
        return Vector(*[a - b for a, b in zip(self.components, other.components)])

    def __mul__(self, scalar):
        """向量数乘"""
        if not isinstance(scalar, (int, float)):
            raise TypeError("只能与标量相乘")
        return Vector(*[c * scalar for c in self.components])

    def __rmul__(self, scalar):
        """右乘（标量 * 向量）"""
        return self.__mul__(scalar)

    def __matmul__(self, other):
        """向量点积（Python 3.5+）"""
        if len(self.components) != len(other.components):
            raise ValueError("向量维度不匹配")
        return sum(a * b for a, b in zip(self.components, other.components))

    def __abs__(self):
        """向量模长"""
        import math
        return math.sqrt(sum(c**2 for c in self.components))

    def __neg__(self):
        """取负"""
        return Vector(*[-c for c in self.components])

    def __str__(self):
        return f"Vector{tuple(self.components)}"

v1 = Vector(1, 2, 3)
v2 = Vector(4, 5, 6)

print(v1 + v2)    # Vector(5, 7, 9)
print(v2 - v1)    # Vector(3, 3, 3)
print(v1 * 3)     # Vector(3, 6, 9)
print(3 * v1)     # Vector(3, 6, 9)（使用__rmul__）
print(v1 @ v2)    # 32（点积）
print(abs(v1))    # 3.7416573867739413（模长）
print(-v1)        # Vector(-1, -2, -3)
```

#### 4. 容器类型方法

```python
class ShoppingCart:
    def __init__(self):
        self.items = []
        self.prices = []

    def add_item(self, item, price):
        self.items.append(item)
        self.prices.append(price)

    # 使对象可迭代
    def __iter__(self):
        return zip(self.items, self.prices)

    # 支持len()
    def __len__(self):
        return len(self.items)

    # 支持索引访问
    def __getitem__(self, index):
        if isinstance(index, slice):
            items = self.items[index]
            prices = self.prices[index]
            return list(zip(items, prices))
        return (self.items[index], self.prices[index])

    # 支持索引赋值
    def __setitem__(self, index, value):
        item, price = value
        self.items[index] = item
        self.prices[index] = price

    # 支持包含测试
    def __contains__(self, item):
        return item in self.items

    # 支持删除
    def __delitem__(self, index):
        del self.items[index]
        del self.prices[index]

    def total(self):
        return sum(self.prices)

cart = ShoppingCart()
cart.add_item("苹果", 5)
cart.add_item("香蕉", 3)
cart.add_item("橙子", 4)

print(len(cart))          # 3
print(cart[1])            # ('香蕉', 3)
print("苹果" in cart)     # True

# 切片支持
print(cart[0:2])          # [('苹果', 5), ('香蕉', 3)]

# 迭代支持
for item, price in cart:
    print(f"{item}: ${price}")

# 修改元素
cart[1] = ("葡萄", 6)
print(cart[1])            # ('葡萄', 6)

# 删除元素
del cart[0]
print(len(cart))          # 2
```

#### 5. 上下文管理器方法

```python
import time

class Timer:
    def __enter__(self):
        self.start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end = time.time()
        self.elapsed = self.end - self.start
        print(f"耗时: {self.elapsed:.4f}秒")

    def reset(self):
        self.start = time.time()

class DatabaseConnection:
    def __init__(self, db_name):
        self.db_name = db_name
        self.connection = None

    def __enter__(self):
        print(f"连接数据库: {self.db_name}")
        self.connection = f"Connection to {self.db_name}"
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        print(f"关闭数据库连接: {self.db_name}")
        self.connection = None
        if exc_type:
            print(f"发生异常: {exc_type.__name__}: {exc_val}")
        return False  # 不抑制异常

    def query(self, sql):
        if self.connection:
            return f"执行: {sql}"
        raise RuntimeError("数据库未连接")

# 使用上下文管理器
with Timer() as timer:
    time.sleep(1)
    timer.reset()
    time.sleep(0.5)

with DatabaseConnection("test_db") as db:
    result = db.query("SELECT * FROM users")
    print(result)
```

#### 6. 调用运算符方法

```python
class Polynomial:
    def __init__(self, *coefficients):
        """多项式：coefficients[0] + coefficients[1]*x + ..."""
        self.coefficients = coefficients

    def __call__(self, x):
        """使对象可以像函数一样调用"""
        result = 0
        for i, coeff in enumerate(self.coefficients):
            result += coeff * (x ** i)
        return result

    def __str__(self):
        terms = []
        for i, coeff in enumerate(self.coefficients):
            if coeff == 0:
                continue
            if i == 0:
                terms.append(str(coeff))
            elif i == 1:
                terms.append(f"{coeff}x")
            else:
                terms.append(f"{coeff}x^{i}")
        return " + ".join(terms) if terms else "0"

# 创建多项式：f(x) = 2 + 3x + 4x²
f = Polynomial(2, 3, 4)

print(f"多项式: {f}")          # 多项式: 2 + 3x + 4x^2
print(f"f(1) = {f(1)}")       # f(1) = 9
print(f"f(2) = {f(2)}")       # f(2) = 24
print(f"f(0) = {f(0)}")       # f(0) = 2
```

### 完整示例：实现一个数学向量类

```python
import math
from functools import total_ordering

@total_ordering  # 自动生成所有比较运算符
class Vector2D:
    """二维向量类"""

    __slots__ = ('x', 'y')  # 限制属性，节省内存

    def __init__(self, x=0.0, y=0.0):
        self.x = float(x)
        self.y = float(y)

    # 表示方法
    def __repr__(self):
        return f"Vector2D({self.x}, {self.y})"

    def __str__(self):
        return f"({self.x}, {self.y})"

    # 算术运算
    def __add__(self, other):
        return Vector2D(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Vector2D(self.x - other.x, self.y - other.y)

    def __mul__(self, scalar):
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return Vector2D(self.x * scalar, self.y * scalar)

    def __rmul__(self, scalar):
        return self.__mul__(scalar)

    def __truediv__(self, scalar):
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return Vector2D(self.x / scalar, self.y / scalar)

    # 比较运算
    def __eq__(self, other):
        if not isinstance(other, Vector2D):
            return NotImplemented
        return math.isclose(self.x, other.x) and math.isclose(self.y, other.y)

    def __lt__(self, other):
        """按模长比较"""
        return abs(self) < abs(other)

    # 一元运算
    def __neg__(self):
        return Vector2D(-self.x, -self.y)

    def __abs__(self):
        return math.sqrt(self.x**2 + self.y**2)

    # 类型转换
    def __bool__(self):
        """零向量为False"""
        return not (math.isclose(self.x, 0) and math.isclose(self.y, 0))

    def __complex__(self):
        """转换为复数"""
        return complex(self.x, self.y)

    # 属性访问
    def __getitem__(self, index):
        if index == 0:
            return self.x
        elif index == 1:
            return self.y
        else:
            raise IndexError("Vector2D索引只能是0或1")

    def __setitem__(self, index, value):
        if index == 0:
            self.x = float(value)
        elif index == 1:
            self.y = float(value)
        else:
            raise IndexError("Vector2D索引只能是0或1")

    # 其他实用方法
    def dot(self, other):
        """点积"""
        return self.x * other.x + self.y * other.y

    def cross(self, other):
        """叉积（标量）"""
        return self.x * other.y - self.y * other.x

    def normalize(self):
        """单位化"""
        magnitude = abs(self)
        if magnitude == 0:
            return Vector2D(0, 0)
        return Vector2D(self.x / magnitude, self.y / magnitude)

    def rotate(self, angle):
        """旋转角度（弧度）"""
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        return Vector2D(
            self.x * cos_a - self.y * sin_a,
            self.x * sin_a + self.y * cos_a
        )

# 使用示例
v1 = Vector2D(3, 4)
v2 = Vector2D(1, 2)

print(f"v1 = {v1}")                # v1 = (3.0, 4.0)
print(f"v2 = {v2}")                # v2 = (1.0, 2.0)
print(f"v1 + v2 = {v1 + v2}")      # v1 + v2 = (4.0, 6.0)
print(f"v1 - v2 = {v1 - v2}")      # v1 - v2 = (2.0, 2.0)
print(f"v1 * 2 = {v1 * 2}")        # v1 * 2 = (6.0, 8.0)
print(f"2 * v1 = {2 * v1}")        # 2 * v1 = (6.0, 8.0)
print(f"v1 / 2 = {v1 / 2}")        # v1 / 2 = (1.5, 2.0)
print(f"|v1| = {abs(v1)}")         # |v1| = 5.0
print(f"-v1 = {-v1}")              # -v1 = (-3.0, -4.0)
print(f"v1·v2 = {v1.dot(v2)}")     # v1·v2 = 11.0
print(f"v1×v2 = {v1.cross(v2)}")   # v1×v2 = 2.0
print(f"v1的单位向量: {v1.normalize()}")  # (0.6, 0.8)
print(f"v1旋转90度: {v1.rotate(math.pi/2)}")  # (-4.0, 3.0)

# 比较运算
print(f"v1 == v2? {v1 == v2}")     # False
print(f"v1 < v2? {v1 < v2}")       # False (|v1|=5 > |v2|=2.236)

# 布尔测试
zero = Vector2D(0, 0)
print(f"v1是零向量? {bool(v1)}")    # True
print(f"零向量是零向量? {bool(zero)}")  # False

# 索引访问
print(f"v1[0] = {v1[0]}")          # 3.0
print(f"v1[1] = {v1[1]}")          # 4.0
v1[0] = 5
print(f"修改后v1 = {v1}")           # (5.0, 4.0)
```

## 8.3 属性装饰器：@property的进阶用法

`@property`装饰器不仅能够创建只读属性，还能实现复杂的属性访问逻辑。

### 基础用法回顾

```python
class Temperature:
    def __init__(self, celsius=0):
        self._celsius = celsius

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("温度不能低于绝对零度(-273.15°C)")
        self._celsius = value

    @property
    def fahrenheit(self):
        return self._celsius * 9/5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value):
        self._celsius = (value - 32) * 5/9

    @property
    def kelvin(self):
        return self._celsius + 273.15

    @kelvin.setter
    def kelvin(self, value):
        if value < 0:
            raise ValueError("开尔文温度不能为负")
        self._celsius = value - 273.15

temp = Temperature(25)
print(f"{temp.celsius}°C = {temp.fahrenheit}°F = {temp.kelvin}K")

temp.fahrenheit = 77
print(f"设置为77°F: {temp.celsius}°C")

temp.kelvin = 300
print(f"设置为300K: {temp.celsius}°C")
```

### 延迟计算属性

```python
import time

class ExpensiveComputation:
    def __init__(self, n):
        self.n = n
        self._result = None
        self._computed = False

    @property
    def result(self):
        if not self._computed:
            print("进行复杂计算...")
            time.sleep(1)  # 模拟耗时计算
            self._result = sum(i**2 for i in range(self.n))
            self._computed = True
        return self._result

comp = ExpensiveComputation(1000000)
print("第一次访问:")
print(f"结果: {comp.result}")  # 会进行计算
print("第二次访问:")
print(f"结果: {comp.result}")  # 直接返回缓存结果
```

### 带验证的属性

```python
import re

class Email:
    def __init__(self, address):
        self._address = None
        self.address = address  # 使用setter验证

    @property
    def address(self):
        return self._address

    @address.setter
    def address(self, value):
        if not self._is_valid_email(value):
            raise ValueError(f"无效的邮箱地址: {value}")
        self._address = value

    @staticmethod
    def _is_valid_email(email):
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None

    @property
    def username(self):
        return self._address.split('@')[0] if self._address else None

    @property
    def domain(self):
        return self._address.split('@')[1] if self._address else None

    def __str__(self):
        return self._address

# 使用示例
try:
    email = Email("user@example.com")
    print(f"邮箱: {email}")
    print(f"用户名: {email.username}")
    print(f"域名: {email.domain}")

    email.address = "newuser@domain.org"
    print(f"新邮箱: {email}")

    email.address = "invalid-email"  # 触发异常
except ValueError as e:
    print(f"错误: {e}")
```

### 只读属性的高级用法

```python
from datetime import datetime, timedelta

class UserSession:
    def __init__(self, user_id):
        self.user_id = user_id
        self._login_time = datetime.now()
        self._last_activity = self._login_time

    @property
    def login_time(self):
        """登录时间（只读）"""
        return self._login_time

    @property
    def session_age(self):
        """会话时长（只读，动态计算）"""
        return datetime.now() - self._login_time

    @property
    def is_active(self):
        """是否活跃（只读，最近5分钟内有活动）"""
        return (datetime.now() - self._last_activity) < timedelta(minutes=5)

    def update_activity(self):
        """更新最后活动时间"""
        self._last_activity = datetime.now()

    @property
    def session_data(self):
        """会话数据（只读，计算属性）"""
        return {
            'user_id': self.user_id,
            'login_time': self._login_time,
            'session_age': self.session_age,
            'is_active': self.is_active
        }

session = UserSession("user123")
print(f"登录时间: {session.login_time}")
print(f"会话年龄: {session.session_age}")
print(f"是否活跃: {session.is_active}")

time.sleep(2)  # 等待2秒
session.update_activity()
print(f"更新后会话年龄: {session.session_age}")
print(f"会话数据: {session.session_data}")
```

### 属性描述符（高级特性）

属性描述符提供了更细粒度的属性控制：

```python
class ValidatedAttribute:
    """属性描述符：验证整数范围"""
    def __init__(self, min_value=None, max_value=None):
        self.min_value = min_value
        self.max_value = max_value
        self.name = None

    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner):
        if instance is None:
            return self
        return instance.__dict__.get(self.name)

    def __set__(self, instance, value):
        if not isinstance(value, int):
            raise TypeError(f"{self.name}必须是整数")
        if self.min_value is not None and value < self.min_value:
            raise ValueError(f"{self.name}不能小于{self.min_value}")
        if self.max_value is not None and value > self.max_value:
            raise ValueError(f"{self.name}不能大于{self.max_value}")
        instance.__dict__[self.name] = value

class TypedAttribute:
    """属性描述符：类型检查"""
    def __init__(self, expected_type):
        self.expected_type = expected_type
        self.name = None

    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner):
        if instance is None:
            return self
        return instance.__dict__.get(self.name)

    def __set__(self, instance, value):
        if not isinstance(value, self.expected_type):
            raise TypeError(
                f"{self.name}必须是{self.expected_type.__name__}类型，"
                f"但收到{type(value).__name__}"
            )
        instance.__dict__[self.name] = value

class Player:
    # 使用属性描述符
    name = TypedAttribute(str)
    age = ValidatedAttribute(min_value=0, max_value=150)
    score = ValidatedAttribute(min_value=0)

    def __init__(self, name, age, score=0):
        self.name = name
        self.age = age
        self.score = score

# 使用示例
try:
    player = Player("Alice", 25, 100)
    print(f"玩家: {player.name}, 年龄: {player.age}, 分数: {player.score}")

    player.age = 26  # 正常
    print(f"新年龄: {player.age}")

    player.age = -5  # 触发异常
except ValueError as e:
    print(f"错误: {e}")

try:
    player.name = 123  # 触发类型错误
except TypeError as e:
    print(f"错误: {e}")
```

## 8.4 静态方法与类方法：正确使用场景

### 静态方法（@staticmethod）

静态方法不需要访问实例或类，就像普通函数一样，但逻辑上属于类。

```python
class MathUtils:
    """数学工具类"""

    @staticmethod
    def add(a, b):
        return a + b

    @staticmethod
    def multiply(a, b):
        return a * b

    @staticmethod
    def factorial(n):
        if n < 0:
            raise ValueError("阶乘只支持非负整数")
        result = 1
        for i in range(2, n + 1):
            result *= i
        return result

    @staticmethod
    def is_prime(n):
        if n <= 1:
            return False
        if n <= 3:
            return True
        if n % 2 == 0 or n % 3 == 0:
            return False
        i = 5
        while i * i <= n:
            if n % i == 0 or n % (i + 2) == 0:
                return False
            i += 6
        return True

# 使用静态方法
print(f"5 + 3 = {MathUtils.add(5, 3)}")
print(f"5! = {MathUtils.factorial(5)}")
print(f"17是质数吗? {MathUtils.is_prime(17)}")

# 也可以实例化后调用，但不推荐
utils = MathUtils()
print(f"通过实例调用: {utils.multiply(4, 5)}")
```

### 类方法（@classmethod）

类方法可以访问类属性，常用于工厂方法、替代构造函数等场景。

```python
from datetime import date

class Person:
    # 类属性
    MIN_AGE = 0
    MAX_AGE = 150

    def __init__(self, name, birth_date):
        self.name = name
        self.birth_date = birth_date

    @classmethod
    def from_birth_year(cls, name, birth_year):
        """工厂方法：根据出生年份创建"""
        birth_date = date(birth_year, 1, 1)
        return cls(name, birth_date)

    @classmethod
    def from_dict(cls, data):
        """工厂方法：从字典创建"""
        return cls(data['name'], data['birth_date'])

    @classmethod
    def create_adult(cls, name):
        """工厂方法：创建成年人的默认实例"""
        current_year = date.today().year
        birth_year = current_year - 18
        return cls(name, date(birth_year, 1, 1))

    @classmethod
    def validate_age(cls, age):
        """验证年龄是否在有效范围内"""
        if not cls.MIN_AGE <= age <= cls.MAX_AGE:
            raise ValueError(f"年龄必须在{cls.MIN_AGE}到{cls.MAX_AGE}之间")
        return True

    @property
    def age(self):
        """计算年龄"""
        today = date.today()
        age = today.year - self.birth_date.year
        # 调整生日是否已过
        if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
            age -= 1
        return age

class Employee(Person):
    """继承Person，测试类方法的继承"""

    def __init__(self, name, birth_date, employee_id):
        super().__init__(name, birth_date)
        self.employee_id = employee_id

    @classmethod
    def from_birth_year(cls, name, birth_year, employee_id):
        """重写工厂方法"""
        person = super().from_birth_year(name, birth_year)
        return cls(person.name, person.birth_date, employee_id)

# 使用不同的工厂方法
p1 = Person("张三", date(1990, 5, 15))
p2 = Person.from_birth_year("李四", 1985)
p3 = Person.from_dict({"name": "王五", "birth_date": date(1995, 8, 20)})
p4 = Person.create_adult("赵六")

print(f"{p1.name}: {p1.age}岁")
print(f"{p2.name}: {p2.age}岁")
print(f"{p3.name}: {p3.age}岁")
print(f"{p4.name}: {p4.age}岁")

# 测试继承
emp = Employee.from_birth_year("钱七", 1992, "E001")
print(f"{emp.name} (ID: {emp.employee_id}): {emp.age}岁")
```

### 静态方法 vs 类方法的选择

```python
class DatabaseConfig:
    """数据库配置管理"""

    # 类属性
    DEFAULT_HOST = "localhost"
    DEFAULT_PORT = 5432

    def __init__(self, host, port, database, username, password):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password

    @classmethod
    def from_environment(cls):
        """从环境变量创建配置（类方法）"""
        import os
        host = os.getenv("DB_HOST", cls.DEFAULT_HOST)
        port = int(os.getenv("DB_PORT", cls.DEFAULT_PORT))
        database = os.getenv("DB_NAME", "test_db")
        username = os.getenv("DB_USER", "postgres")
        password = os.getenv("DB_PASS", "")
        return cls(host, port, database, username, password)

    @classmethod
    def for_testing(cls):
        """测试环境配置（类方法）"""
        return cls("localhost", 5432, "test_db", "test_user", "test_pass")

    @staticmethod
    def parse_connection_string(conn_str):
        """解析连接字符串（静态方法）"""
        # 格式: postgresql://user:pass@host:port/database
        import re
        pattern = r"(\w+)://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)"
        match = re.match(pattern, conn_str)
        if not match:
            raise ValueError("无效的连接字符串格式")

        protocol, username, password, host, port, database = match.groups()
        if protocol != "postgresql":
            raise ValueError(f"不支持的协议: {protocol}")

        return {
            "host": host,
            "port": int(port),
            "database": database,
            "username": username,
            "password": password
        }

    @classmethod
    def from_connection_string(cls, conn_str):
        """从连接字符串创建（类方法，使用静态方法）"""
        config_dict = cls.parse_connection_string(conn_str)
        return cls(**config_dict)

    def get_connection_string(self):
        """生成连接字符串"""
        return f"postgresql://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"

# 使用示例
# 1. 从环境变量创建（类方法）
# 需要先设置环境变量
import os
os.environ["DB_HOST"] = "db.example.com"
os.environ["DB_USER"] = "admin"

config1 = DatabaseConfig.from_environment()
print(f"环境配置: {config1.get_connection_string()}")

# 2. 测试配置（类方法）
config2 = DatabaseConfig.for_testing()
print(f"测试配置: {config2.get_connection_string()}")

# 3. 从连接字符串创建（类方法 + 静态方法）
conn_str = "postgresql://user:pass@localhost:5432/mydb"
config3 = DatabaseConfig.from_connection_string(conn_str)
print(f"连接字符串配置: {config3.get_connection_string()}")

# 4. 直接使用静态方法
parsed = DatabaseConfig.parse_connection_string(conn_str)
print(f"解析结果: {parsed}")
```

## 8.5 抽象基类与接口：Python中的契约编程

抽象基类（Abstract Base Classes, ABC）定义了接口规范，确保子类实现特定的方法。

### 基础抽象基类

```python
from abc import ABC, abstractmethod
from typing import List

class Shape(ABC):
    """形状抽象基类"""

    @abstractmethod
    def area(self) -> float:
        """计算面积"""
        pass

    @abstractmethod
    def perimeter(self) -> float:
        """计算周长"""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """形状名称"""
        pass

    def describe(self) -> str:
        """描述形状（具体方法）"""
        return f"{self.name}: 面积={self.area():.2f}, 周长={self.perimeter():.2f}"

class Circle(Shape):
    def __init__(self, radius: float):
        self._radius = radius

    @property
    def name(self) -> str:
        return "圆形"

    def area(self) -> float:
        import math
        return math.pi * self._radius ** 2

    def perimeter(self) -> float:
        import math
        return 2 * math.pi * self._radius

class Rectangle(Shape):
    def __init__(self, width: float, height: float):
        self._width = width
        self._height = height

    @property
    def name(self) -> str:
        return "矩形"

    def area(self) -> float:
        return self._width * self._height

    def perimeter(self) -> float:
        return 2 * (self._width + self._height)

# 测试抽象基类
try:
    shape = Shape()  # 不能实例化抽象类
except TypeError as e:
    print(f"错误: {e}")

circle = Circle(5)
rectangle = Rectangle(3, 4)

shapes: List[Shape] = [circle, rectangle]
for shape in shapes:
    print(shape.describe())
```

### 使用collections.abc中的抽象基类

Python标准库提供了许多有用的抽象基类：

```python
from collections.abc import Sequence, MutableSequence, Mapping, Set
from abc import abstractmethod

class Playlist(MutableSequence):
    """自定义播放列表"""

    def __init__(self, *songs):
        self._songs = list(songs)

    def __getitem__(self, index):
        return self._songs[index]

    def __setitem__(self, index, value):
        self._songs[index] = value

    def __delitem__(self, index):
        del self._songs[index]

    def __len__(self):
        return len(self._songs)

    def insert(self, index, value):
        self._songs.insert(index, value)

    def __str__(self):
        return "\n".join(f"{i+1}. {song}" for i, song in enumerate(self._songs))

# 测试自定义序列
playlist = Playlist("Song A", "Song B", "Song C")
print("原始播放列表:")
print(playlist)
print(f"长度: {len(playlist)}")
print(f"第一首歌: {playlist[0]}")

# 添加新歌
playlist.append("Song D")
playlist.insert(1, "Song B+")
print("\n添加歌曲后:")
print(playlist)

# 删除歌曲
del playlist[2]
print("\n删除歌曲后:")
print(playlist)

# 类型检查
print(f"是Sequence吗? {isinstance(playlist, Sequence)}")  # True
print(f"是MutableSequence吗? {isinstance(playlist, MutableSequence)}")  # True
```

### 注册机制与虚拟子类

```python
from abc import ABC, abstractmethod

class Animal(ABC):
    @abstractmethod
    def speak(self):
        pass

    @classmethod
    def __subclasshook__(cls, subclass):
        """允许鸭子类型的类被视为子类"""
        if cls is Animal:
            if any("speak" in B.__dict__ for B in subclass.__mro__):
                return True
        return NotImplemented

# 普通实现
class Dog(Animal):
    def speak(self):
        return "汪汪！"

# 没有继承Animal，但有speak方法
class Duck:
    def speak(self):
        return "嘎嘎！"

# 注册为虚拟子类
Animal.register(Duck)

# 测试
dog = Dog()
duck = Duck()

print(f"Dog是Animal吗? {isinstance(dog, Animal)}")  # True
print(f"Duck是Animal吗? {isinstance(duck, Animal)}")  # True
print(f"Dog实例: {dog.speak()}")
print(f"Duck实例: {duck.speak()}")
```

### 完整示例：插件系统设计

```python
from abc import ABC, abstractmethod
import json
import yaml
import xml.etree.ElementTree as ET

class DataProcessor(ABC):
    """数据处理插件基类"""

    @abstractmethod
    def can_process(self, data: str) -> bool:
        """检查是否能处理该数据"""
        pass

    @abstractmethod
    def process(self, data: str) -> dict:
        """处理数据"""
        pass

    @abstractmethod
    def get_format_name(self) -> str:
        """获取格式名称"""
        pass

class JSONProcessor(DataProcessor):
    def can_process(self, data: str) -> bool:
        try:
            json.loads(data)
            return True
        except json.JSONDecodeError:
            return False

    def process(self, data: str) -> dict:
        return json.loads(data)

    def get_format_name(self) -> str:
        return "JSON"

class YAMLProcessor(DataProcessor):
    def can_process(self, data: str) -> bool:
        try:
            yaml.safe_load(data)
            return True
        except yaml.YAMLError:
            return False

    def process(self, data: str) -> dict:
        return yaml.safe_load(data)

    def get_format_name(self) -> str:
        return "YAML"

class XMLProcessor(DataProcessor):
    def can_process(self, data: str) -> bool:
        try:
            ET.fromstring(data)
            return True
        except ET.ParseError:
            return False

    def process(self, data: str) -> dict:
        root = ET.fromstring(data)
        return self._element_to_dict(root)

    def _element_to_dict(self, element):
        result = {}
        if element.attrib:
            result.update(element.attrib)
        if element.text and element.text.strip():
            result['_text'] = element.text.strip()

        for child in element:
            child_dict = self._element_to_dict(child)
            if child.tag in result:
                if not isinstance(result[child.tag], list):
                    result[child.tag] = [result[child.tag]]
                result[child.tag].append(child_dict)
            else:
                result[child.tag] = child_dict

        return result

    def get_format_name(self) -> str:
        return "XML"

class DataProcessorFactory:
    """处理器工厂"""

    _processors = []

    @classmethod
    def register_processor(cls, processor: DataProcessor):
        """注册处理器"""
        cls._processors.append(processor)

    @classmethod
    def get_processor(cls, data: str) -> DataProcessor:
        """获取适合的处理器"""
        for processor in cls._processors:
            if processor.can_process(data):
                return processor
        raise ValueError("没有找到适合的处理器")

    @classmethod
    def process(cls, data: str) -> dict:
        """处理数据"""
        processor = cls.get_processor(data)
        print(f"使用 {processor.get_format_name()} 处理器")
        return processor.process(data)

# 注册处理器
DataProcessorFactory.register_processor(JSONProcessor())
DataProcessorFactory.register_processor(YAMLProcessor())
DataProcessorFactory.register_processor(XMLProcessor())

# 测试数据
json_data = '{"name": "Alice", "age": 25, "city": "New York"}'
yaml_data = """
name: Bob
age: 30
city: London
"""
xml_data = """
<person>
    <name>Charlie</name>
    <age>35</age>
    <city>Paris</city>
</person>
"""

# 处理不同类型的数据
for data in [json_data, yaml_data, xml_data]:
    try:
        result = DataProcessorFactory.process(data)
        print(f"处理结果: {result}")
        print("-" * 40)
    except ValueError as e:
        print(f"错误: {e}")
```

## 8.6 组合与聚合：优先于继承的设计

组合和聚合是比继承更灵活的代码复用方式，遵循"优先使用组合而非继承"的设计原则。

### 组合（Composition）

组合表示"has-a"关系，一个对象包含另一个对象作为其一部分。

```python
class Engine:
    def __init__(self, horsepower):
        self.horsepower = horsepower
        self.is_running = False

    def start(self):
        if not self.is_running:
            self.is_running = True
            return "引擎启动"
        return "引擎已在运行"

    def stop(self):
        if self.is_running:
            self.is_running = False
            return "引擎停止"
        return "引擎已停止"

    def get_status(self):
        return f"引擎: {self.horsepower}马力, 状态: {'运行中' if self.is_running else '停止'}"

class Wheel:
    def __init__(self, size, pressure=32):
        self.size = size
        self.pressure = pressure

    def inflate(self, psi):
        self.pressure += psi
        return f"轮胎充气至{self.pressure}PSI"

    def get_status(self):
        return f"轮胎: {self.size}寸, 胎压: {self.pressure}PSI"

class Car:
    def __init__(self, model, engine_hp):
        self.model = model
        self.engine = Engine(engine_hp)  # 组合：Car有Engine
        self.wheels = [Wheel(18) for _ in range(4)]  # 组合：Car有4个Wheel

    def start(self):
        return f"{self.model}: {self.engine.start()}"

    def stop(self):
        return f"{self.model}: {self.engine.stop()}"

    def check_tires(self):
        return [wheel.get_status() for wheel in self.wheels]

    def get_status(self):
        status = [f"车型: {self.model}"]
        status.append(self.engine.get_status())
        status.extend(self.check_tires())
        return "\n".join(status)

# 使用组合
car = Car("特斯拉 Model S", 670)
print(car.start())
print(car.get_status())
print(car.wheels[0].inflate(5))
print(car.stop())
```

### 聚合（Aggregation）

聚合表示"has-a"关系，但被包含的对象可以独立存在。

```python
class Department:
    def __init__(self, name):
        self.name = name
        self.employees = []  # 聚合：Department有Employees

    def add_employee(self, employee):
        self.employees.append(employee)
        employee.department = self

    def remove_employee(self, employee):
        if employee in self.employees:
            self.employees.remove(employee)
            employee.department = None

    def get_employees(self):
        return [emp.name for emp in self.employees]

    def __str__(self):
        return f"部门: {self.name}, 员工数: {len(self.employees)}"

class Employee:
    def __init__(self, name, position):
        self.name = name
        self.position = position
        self.department = None  # 聚合：Employee属于Department

    def transfer_to(self, department):
        if self.department:
            self.department.remove_employee(self)
        department.add_employee(self)

    def __str__(self):
        dept_name = self.department.name if self.department else "无部门"
        return f"员工: {self.name}, 职位: {self.position}, 部门: {dept_name}"

# 创建部门和员工
it_dept = Department("IT部门")
hr_dept = Department("HR部门")

alice = Employee("Alice", "软件工程师")
bob = Employee("Bob", "前端开发")
charlie = Employee("Charlie", "人事经理")

# 添加员工到部门
it_dept.add_employee(alice)
it_dept.add_employee(bob)
hr_dept.add_employee(charlie)

print(it_dept)
print(hr_dept)
print(f"IT部门员工: {it_dept.get_employees()}")

# 员工转部门
alice.transfer_to(hr_dept)
print(f"\n转部门后:")
print(it_dept)
print(hr_dept)
print(alice)
```

### 组合 vs 继承的实战比较

```python
# 使用继承的层次结构（可能变得复杂）
class Animal:
    def eat(self):
        return "吃东西"

class Flyer:
    def fly(self):
        return "飞翔"

class Swimmer:
    def swim(self):
        return "游泳"

class Bird(Animal, Flyer):
    pass

class Fish(Animal, Swimmer):
    pass

class Duck(Animal, Flyer, Swimmer):
    pass

# 使用组合的灵活设计
class AnimalBehavior:
    def eat(self):
        return "吃东西"

class FlyingBehavior:
    def fly(self):
        return "飞翔"

class SwimmingBehavior:
    def swim(self):
        return "游泳"

class Animal:
    def __init__(self, behaviors=None):
        self.behaviors = behaviors or []

    def perform(self, action):
        for behavior in self.behaviors:
            if hasattr(behavior, action):
                return getattr(behavior, action)()
        return f"不会{action}"

    def add_behavior(self, behavior):
        self.behaviors.append(behavior)

# 动态组合行为
bird = Animal([AnimalBehavior(), FlyingBehavior()])
fish = Animal([AnimalBehavior(), SwimmingBehavior()])
duck = Animal([AnimalBehavior(), FlyingBehavior(), SwimmingBehavior()])
platypus = Animal([AnimalBehavior()])  # 鸭嘴兽开始时不会飞
platypus.add_behavior(SwimmingBehavior())  # 但会游泳

print("鸟:")
print(bird.perform("eat"))   # 吃东西
print(bird.perform("fly"))   # 飞翔
print(bird.perform("swim"))  # 不会swim

print("\n鸭嘴兽:")
print(platypus.perform("swim"))  # 游泳
```

### 策略模式示例

```python
from abc import ABC, abstractmethod

# 策略接口
class PaymentStrategy(ABC):
    @abstractmethod
    def pay(self, amount):
        pass

# 具体策略
class CreditCardPayment(PaymentStrategy):
    def __init__(self, card_number, expiry):
        self.card_number = card_number
        self.expiry = expiry

    def pay(self, amount):
        return f"信用卡支付 ${amount} (卡号: {self.card_number[-4:]})"

class PayPalPayment(PaymentStrategy):
    def __init__(self, email):
        self.email = email

    def pay(self, amount):
        return f"PayPal支付 ${amount} (邮箱: {self.email})"

class BitcoinPayment(PaymentStrategy):
    def __init__(self, wallet_address):
        self.wallet_address = wallet_address

    def pay(self, amount):
        return f"比特币支付 ${amount} (钱包: {self.wallet_address[:8]}...)"

# 上下文类
class ShoppingCart:
    def __init__(self):
        self.items = []
        self.payment_strategy = None

    def add_item(self, item, price):
        self.items.append((item, price))

    def set_payment_strategy(self, strategy: PaymentStrategy):
        self.payment_strategy = strategy

    def checkout(self):
        if not self.payment_strategy:
            raise ValueError("未设置支付方式")

        total = sum(price for _, price in self.items)

        print("购物车商品:")
        for item, price in self.items:
            print(f"  {item}: ${price}")

        print(f"总计: ${total}")
        print(self.payment_strategy.pay(total))
        print("支付成功！")

# 使用策略模式
cart = ShoppingCart()
cart.add_item("笔记本电脑", 999)
cart.add_item("鼠标", 25)

# 动态选择支付策略
cart.set_payment_strategy(CreditCardPayment("1234567812345678", "12/25"))
cart.checkout()

print("\n更换支付方式...")
cart.set_payment_strategy(PayPalPayment("user@example.com"))
cart.checkout()
```

## 8.7 设计模式简介：Pythonic的实现

设计模式是解决常见问题的经验总结。在Python中，许多设计模式有更简洁的实现方式。

### 1. 单例模式（Singleton）

```python
class SingletonMeta(type):
    """单例元类"""
    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            instance = super().__call__(*args, **kwargs)
            cls._instances[cls] = instance
        return cls._instances[cls]

class DatabaseConnection(metaclass=SingletonMeta):
    """数据库连接单例"""

    def __init__(self):
        print("初始化数据库连接...")
        self.connection = "Database Connection"

    def query(self, sql):
        return f"执行查询: {sql}"

# Pythonic的单例：使用模块
# database.py 中直接创建实例
# from database import db_connection

# 测试单例
db1 = DatabaseConnection()
db2 = DatabaseConnection()

print(f"db1 is db2? {db1 is db2}")  # True
print(db1.query("SELECT * FROM users"))
```

### 2. 工厂模式（Factory）

```python
from abc import ABC, abstractmethod

class Button(ABC):
    @abstractmethod
    def render(self):
        pass

    @abstractmethod
    def onClick(self):
        pass

class WindowsButton(Button):
    def render(self):
        return "渲染Windows风格按钮"

    def onClick(self):
        return "Windows按钮被点击"

class MacOSButton(Button):
    def render(self):
        return "渲染macOS风格按钮"

    def onClick(self):
        return "macOS按钮被点击"

class Dialog(ABC):
    @abstractmethod
    def createButton(self) -> Button:
        pass

    def render(self):
        button = self.createButton()
        return f"对话框渲染: {button.render()}"

class WindowsDialog(Dialog):
    def createButton(self) -> Button:
        return WindowsButton()

class MacOSDialog(Dialog):
    def createButton(self) -> Button:
        return MacOSButton()

# 使用工厂
def create_dialog(os_type):
    if os_type == "Windows":
        return WindowsDialog()
    elif os_type == "macOS":
        return MacOSDialog()
    else:
        raise ValueError(f"不支持的系统: {os_type}")

# 根据系统类型创建对话框
dialog = create_dialog("Windows")
print(dialog.render())

dialog = create_dialog("macOS")
print(dialog.render())
```

### 3. 观察者模式（Observer）

```python
class Event:
    """事件类"""
    def __init__(self, name, data=None):
        self.name = name
        self.data = data or {}

    def __str__(self):
        return f"Event({self.name}, {self.data})"

class Observable:
    """可观察对象（主题）"""

    def __init__(self):
        self._observers = []

    def attach(self, observer):
        if observer not in self._observers:
            self._observers.append(observer)

    def detach(self, observer):
        try:
            self._observers.remove(observer)
        except ValueError:
            pass

    def notify(self, event):
        for observer in self._observers:
            observer.update(event)

class Observer(ABC):
    """观察者基类"""

    @abstractmethod
    def update(self, event: Event):
        pass

# 具体实现
class WeatherStation(Observable):
    """气象站（主题）"""

    def __init__(self):
        super().__init__()
        self.temperature = 20.0
        self.humidity = 50.0
        self.pressure = 1013.0

    def set_measurements(self, temperature, humidity, pressure):
        self.temperature = temperature
        self.humidity = humidity
        self.pressure = pressure

        event = Event("measurements_changed", {
            "temperature": temperature,
            "humidity": humidity,
            "pressure": pressure
        })
        self.notify(event)

class Display(Observer):
    """显示设备（观察者）"""

    def __init__(self, name):
        self.name = name

    def update(self, event: Event):
        if event.name == "measurements_changed":
            data = event.data
            print(f"[{self.name}] 温度: {data['temperature']}°C, "
                  f"湿度: {data['humidity']}%, 气压: {data['pressure']}hPa")

class Logger(Observer):
    """日志记录器（观察者）"""

    def update(self, event: Event):
        print(f"[日志] {event}")

# 使用观察者模式
station = WeatherStation()

display1 = Display("室内显示屏")
display2 = Display("室外显示屏")
logger = Logger()

station.attach(display1)
station.attach(display2)
station.attach(logger)

print("第一次更新:")
station.set_measurements(25.0, 60.0, 1015.0)

print("\n移除室外显示屏后更新:")
station.detach(display2)
station.set_measurements(22.0, 55.0, 1012.0)
```

### 4. 装饰器模式（Decorator）

```python
from abc import ABC, abstractmethod

class Coffee(ABC):
    """咖啡接口"""

    @abstractmethod
    def cost(self) -> float:
        pass

    @abstractmethod
    def description(self) -> str:
        pass

class SimpleCoffee(Coffee):
    """基础咖啡"""

    def cost(self) -> float:
        return 5.0

    def description(self) -> str:
        return "简单咖啡"

class CoffeeDecorator(Coffee):
    """咖啡装饰器基类"""

    def __init__(self, coffee: Coffee):
        self._coffee = coffee

    def cost(self) -> float:
        return self._coffee.cost()

    def description(self) -> str:
        return self._coffee.description()

class MilkDecorator(CoffeeDecorator):
    """牛奶装饰器"""

    def cost(self) -> float:
        return super().cost() + 1.5

    def description(self) -> str:
        return super().description() + " + 牛奶"

class SugarDecorator(CoffeeDecorator):
    """糖装饰器"""

    def cost(self) -> float:
        return super().cost() + 0.5

    def description(self) -> str:
        return super().description() + " + 糖"

class WhippedCreamDecorator(CoffeeDecorator):
    """奶油装饰器"""

    def cost(self) -> float:
        return super().cost() + 2.0

    def description(self) -> str:
        return super().description() + " + 奶油"

class ChocolateDecorator(CoffeeDecorator):
    """巧克力装饰器"""

    def cost(self) -> float:
        return super().cost() + 3.0

    def description(self) -> str:
        return super().description() + " + 巧克力"

# 使用装饰器模式
coffee = SimpleCoffee()
print(f"{coffee.description()}: ${coffee.cost()}")

# 添加牛奶和糖
coffee = MilkDecorator(coffee)
coffee = SugarDecorator(coffee)
print(f"{coffee.description()}: ${coffee.cost()}")

# 添加更多配料
coffee = WhippedCreamDecorator(coffee)
coffee = ChocolateDecorator(coffee)
print(f"{coffee.description()}: ${coffee.cost()}")

# 另一种组合
fancy_coffee = ChocolateDecorator(
    WhippedCreamDecorator(
        MilkDecorator(
            SimpleCoffee()
        )
    )
)
print(f"\n{fancy_coffee.description()}: ${fancy_coffee.cost()}")
```

### 5. Pythonic的简化实现

许多设计模式在Python中有更简洁的实现：

```python
# 使用字典实现简单工厂
class Dog:
    def speak(self):
        return "汪汪！"

class Cat:
    def speak(self):
        return "喵喵！"

class Bird:
    def speak(self):
        return "叽叽！"

# 动物工厂
animal_factory = {
    'dog': Dog,
    'cat': Cat,
    'bird': Bird
}

def create_animal(animal_type):
    if animal_type in animal_factory:
        return animal_factory[animal_type]()
    raise ValueError(f"未知的动物类型: {animal_type}")

# 使用
animals = ['dog', 'cat', 'bird']
for animal_type in animals:
    animal = create_animal(animal_type)
    print(f"{animal_type}: {animal.speak()}")

# 使用函数作为策略
def credit_card_payment(amount, card_number):
    return f"信用卡支付 ${amount}"

def paypal_payment(amount, email):
    return f"PayPal支付 ${amount}"

def bitcoin_payment(amount, wallet):
    return f"比特币支付 ${amount}"

# 策略字典
payment_strategies = {
    'credit_card': credit_card_payment,
    'paypal': paypal_payment,
    'bitcoin': bitcoin_payment
}

def make_payment(method, amount, **kwargs):
    if method in payment_strategies:
        return payment_strategies[method](amount, **kwargs)
    raise ValueError(f"不支持的支付方式: {method}")

print(make_payment('credit_card', 100, card_number="1234"))
print(make_payment('paypal', 50, email="test@example.com"))
```

## 8.8 面向对象设计原则：SOLID原则

SOLID原则是面向对象设计的五个基本原则，帮助我们创建可维护、可扩展的系统。

### 1. 单一职责原则（SRP）

一个类应该只有一个引起变化的原因。

```python
# 违反SRP的示例
class UserManager:
    """违反SRP：处理用户、数据库、邮件发送"""

    def __init__(self):
        self.connection = self.connect_to_database()

    def connect_to_database(self):
        return "数据库连接"

    def authenticate(self, username, password):
        # 验证逻辑
        return True

    def save_to_database(self, user_data):
        # 保存到数据库
        print(f"保存用户数据: {user_data}")

    def send_welcome_email(self, email):
        # 发送邮件
        print(f"发送欢迎邮件到: {email}")

# 遵循SRP的示例
class DatabaseConnection:
    """处理数据库连接"""
    def connect(self):
        return "数据库连接"

    def save_user(self, user_data):
        print(f"保存用户数据: {user_data}")

class UserAuthenticator:
    """处理用户认证"""
    def authenticate(self, username, password):
        # 验证逻辑
        return True

class EmailService:
    """处理邮件发送"""
    def send_welcome_email(self, email):
        print(f"发送欢迎邮件到: {email}")

class UserService:
    """协调用户相关操作"""
    def __init__(self):
        self.db = DatabaseConnection()
        self.auth = UserAuthenticator()
        self.email = EmailService()

    def register_user(self, username, password, email):
        if self.auth.authenticate(username, password):
            user_data = {"username": username, "email": email}
            self.db.save_user(user_data)
            self.email.send_welcome_email(email)
            return True
        return False
```

### 2. 开闭原则（OCP）

软件实体应该对扩展开放，对修改关闭。

```python
from abc import ABC, abstractmethod

# 违反OCP的示例
class DiscountCalculator:
    """违反OCP：每次新增折扣类型都需要修改类"""

    def calculate(self, price, discount_type):
        if discount_type == "student":
            return price * 0.8
        elif discount_type == "member":
            return price * 0.9
        elif discount_type == "black_friday":
            return price * 0.7
        else:
            return price

# 遵循OCP的示例
class DiscountStrategy(ABC):
    """折扣策略接口"""
    @abstractmethod
    def apply(self, price: float) -> float:
        pass

class StudentDiscount(DiscountStrategy):
    def apply(self, price: float) -> float:
        return price * 0.8

class MemberDiscount(DiscountStrategy):
    def apply(self, price: float) -> float:
        return price * 0.9

class BlackFridayDiscount(DiscountStrategy):
    def apply(self, price: float) -> float:
        return price * 0.7

class NoDiscount(DiscountStrategy):
    def apply(self, price: float) -> float:
        return price

class DiscountCalculator:
    """遵循OCP：通过组合策略实现"""

    def __init__(self, strategy: DiscountStrategy = None):
        self.strategy = strategy or NoDiscount()

    def set_strategy(self, strategy: DiscountStrategy):
        self.strategy = strategy

    def calculate(self, price: float) -> float:
        return self.strategy.apply(price)

# 使用示例
calculator = DiscountCalculator()

calculator.set_strategy(StudentDiscount())
print(f"学生折扣: {calculator.calculate(100)}")

calculator.set_strategy(MemberDiscount())
print(f"会员折扣: {calculator.calculate(100)}")

calculator.set_strategy(BlackFridayDiscount())
print(f"黑五折扣: {calculator.calculate(100)}")

# 新增折扣类型不需要修改DiscountCalculator
class ChristmasDiscount(DiscountStrategy):
    def apply(self, price: float) -> float:
        return price * 0.75

calculator.set_strategy(ChristmasDiscount())
print(f"圣诞折扣: {calculator.calculate(100)}")
```

### 3. 里氏替换原则（LSP）

子类对象应该能够替换父类对象，而不影响程序的正确性。

```python
# 违反LSP的示例
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def set_width(self, width):
        self.width = width

    def set_height(self, height):
        self.height = height

    def area(self):
        return self.width * self.height

class Square(Rectangle):
    """正方形继承自矩形，但改变了行为"""
    def __init__(self, side):
        super().__init__(side, side)

    def set_width(self, width):
        self.width = width
        self.height = width  # 违反LSP：改变了父类的行为

    def set_height(self, height):
        self.height = height
        self.width = height  # 违反LSP：改变了父类的行为

def test_rectangle(rect: Rectangle):
    """这个函数期望矩形遵循特定行为"""
    rect.set_width(5)
    rect.set_height(4)
    expected_area = 20
    actual_area = rect.area()
    assert actual_area == expected_area, f"期望面积{expected_area}, 实际{actual_area}"

# 使用Rectangle正常工作
rect = Rectangle(0, 0)
test_rectangle(rect)  # 通过

# 使用Square会失败
square = Square(0)
try:
    test_rectangle(square)  # 失败：实际面积是16
    print("测试通过")
except AssertionError as e:
    print(f"测试失败: {e}")

# 遵循LSP的示例
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self):
        pass

class Rectangle(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side ** 2

def print_area(shape: Shape):
    """接受任何Shape，遵循LSP"""
    print(f"面积: {shape.area()}")

# 都可以正常工作
print_area(Rectangle(5, 4))  # 20
print_area(Square(5))        # 25
```

### 4. 接口隔离原则（ISP）

客户端不应该被迫依赖它们不使用的接口。

```python
# 违反ISP的示例
class Worker(ABC):
    """违反ISP：不是所有工人都需要所有方法"""
    @abstractmethod
    def work(self):
        pass

    @abstractmethod
    def eat(self):
        pass

    @abstractmethod
    def sleep(self):
        pass

class HumanWorker(Worker):
    def work(self):
        return "人类工作"

    def eat(self):
        return "人类吃饭"

    def sleep(self):
        return "人类睡觉"

class RobotWorker(Worker):
    def work(self):
        return "机器人工作"

    def eat(self):
        raise NotImplementedError("机器人不需要吃饭")

    def sleep(self):
        raise NotImplementedError("机器人不需要睡觉")

# 遵循ISP的示例
class Workable(ABC):
    @abstractmethod
    def work(self):
        pass

class Eatable(ABC):
    @abstractmethod
    def eat(self):
        pass

class Sleepable(ABC):
    @abstractmethod
    def sleep(self):
        pass

class HumanWorker(Workable, Eatable, Sleepable):
    def work(self):
        return "人类工作"

    def eat(self):
        return "人类吃饭"

    def sleep(self):
        return "人类睡觉"

class RobotWorker(Workable):
    def work(self):
        return "机器人工作"

# 使用接口
def manage_worker(worker: Workable):
    print(worker.work())

def feed_worker(worker: Eatable):
    print(worker.eat())

def rest_worker(worker: Sleepable):
    print(worker.sleep())

human = HumanWorker()
robot = RobotWorker()

manage_worker(human)   # 人类工作
manage_worker(robot)   # 机器人工作

feed_worker(human)     # 人类吃饭
# feed_worker(robot)   # 错误：RobotWorker没有Eatable接口

rest_worker(human)     # 人类睡觉
# rest_worker(robot)   # 错误：RobotWorker没有Sleepable接口
```

### 5. 依赖倒置原则（DIP）

高层模块不应该依赖低层模块，两者都应该依赖抽象。

```python
# 违反DIP的示例
class LightBulb:
    def turn_on(self):
        print("灯泡打开")

    def turn_off(self):
        print("灯泡关闭")

class Switch:
    """违反DIP：直接依赖具体类LightBulb"""
    def __init__(self, bulb: LightBulb):
        self.bulb = bulb
        self.is_on = False

    def press(self):
        if self.is_on:
            self.bulb.turn_off()
            self.is_on = False
        else:
            self.bulb.turn_on()
            self.is_on = True

# 遵循DIP的示例
from abc import ABC, abstractmethod

class Switchable(ABC):
    """抽象接口"""
    @abstractmethod
    def turn_on(self):
        pass

    @abstractmethod
    def turn_off(self):
        pass

class LightBulb(Switchable):
    def turn_on(self):
        print("灯泡打开")

    def turn_off(self):
        print("灯泡关闭")

class Fan(Switchable):
    def turn_on(self):
        print("风扇打开")

    def turn_off(self):
        print("风扇关闭")

class Switch:
    """遵循DIP：依赖抽象接口Switchable"""
    def __init__(self, device: Switchable):
        self.device = device
        self.is_on = False

    def press(self):
        if self.is_on:
            self.device.turn_off()
            self.is_on = False
        else:
            self.device.turn_on()
            self.is_on = True

# 使用示例
bulb = LightBulb()
fan = Fan()

bulb_switch = Switch(bulb)
fan_switch = Switch(fan)

print("测试灯泡开关:")
bulb_switch.press()  # 打开灯泡
bulb_switch.press()  # 关闭灯泡

print("\n测试风扇开关:")
fan_switch.press()   # 打开风扇
fan_switch.press()   # 关闭风扇
```

### 综合示例：遵循SOLID原则的通知系统

```python
from abc import ABC, abstractmethod
from typing import List

# 1. 单一职责：每个类只有一个职责
class Message:
    """消息类：只负责存储消息内容"""
    def __init__(self, content: str):
        self.content = content

    def __str__(self):
        return self.content

# 2. 开闭原则：通过抽象支持扩展
class NotificationChannel(ABC):
    """通知渠道接口"""
    @abstractmethod
    def send(self, message: Message) -> bool:
        pass

class EmailChannel(NotificationChannel):
    def send(self, message: Message) -> bool:
        print(f"[邮件] 发送: {message}")
        return True

class SMSChannel(NotificationChannel):
    def send(self, message: Message) -> bool:
        print(f"[短信] 发送: {message}")
        return True

class PushChannel(NotificationChannel):
    def send(self, message: Message) -> bool:
        print(f"[推送] 发送: {message}")
        return True

# 3. 里氏替换：所有渠道都可以替换NotificationChannel
class LoggingChannel(NotificationChannel):
    """日志渠道：用于测试，不影响其他渠道"""
    def send(self, message: Message) -> bool:
        print(f"[日志] 模拟发送: {message}")
        return True

# 4. 接口隔离：不同的用户有不同的通知偏好
class UserPreferences:
    """用户偏好：接口隔离的体现"""
    def __init__(self, channels: List[NotificationChannel]):
        self.channels = channels

    def add_channel(self, channel: NotificationChannel):
        self.channels.append(channel)

    def remove_channel(self, channel: NotificationChannel):
        if channel in self.channels:
            self.channels.remove(channel)

    def get_channels(self):
        return self.channels

# 5. 依赖倒置：高层模块依赖抽象
class NotificationService:
    """通知服务：依赖抽象接口"""

    def __init__(self):
        self.users = {}

    def register_user(self, user_id: str, preferences: UserPreferences):
        self.users[user_id] = preferences

    def send_notification(self, user_id: str, message_content: str) -> bool:
        if user_id not in self.users:
            return False

        message = Message(message_content)
        preferences = self.users[user_id]

        success = True
        for channel in preferences.get_channels():
            if not channel.send(message):
                success = False

        return success

    def broadcast(self, message_content: str) -> bool:
        """向所有用户发送通知"""
        message = Message(message_content)
        success = True

        for preferences in self.users.values():
            for channel in preferences.get_channels():
                if not channel.send(message):
                    success = False

        return success

# 使用示例
# 创建渠道
email = EmailChannel()
sms = SMSChannel()
push = PushChannel()
logger = LoggingChannel()

# 创建用户偏好
alice_prefs = UserPreferences([email, push])
bob_prefs = UserPreferences([sms])
charlie_prefs = UserPreferences([email, sms, push, logger])  # 包含日志渠道用于测试

# 创建通知服务
service = NotificationService()
service.register_user("alice", alice_prefs)
service.register_user("bob", bob_prefs)
service.register_user("charlie", charlie_prefs)

print("向Alice发送通知:")
service.send_notification("alice", "您的订单已发货")

print("\n向Bob发送通知:")
service.send_notification("bob", "您的账户有新的登录")

print("\n广播通知:")
service.broadcast("系统维护通知：今晚10点-12点")

print("\n动态添加新渠道（遵循开闭原则）:")
class WeChatChannel(NotificationChannel):
    def send(self, message: Message) -> bool:
        print(f"[微信] 发送: {message}")
        return True

wechat = WeChatChannel()
alice_prefs.add_channel(wechat)
service.send_notification("alice", "通过微信和邮件发送的测试消息")
```

## 总结：从基础到大师的进阶之路

通过本章的学习，你已经掌握了Python面向对象编程的高级特性：

1. **多重继承与MRO**：理解了Python如何解决菱形继承问题
2. **魔术方法**：让自定义对象像内置类型一样自然
3. **属性装饰器**：实现了更优雅的属性访问控制
4. **静态方法与类方法**：理解了它们的正确使用场景
5. **抽象基类与接口**：学会了契约编程和接口设计
6. **组合与聚合**：掌握了比继承更灵活的代码复用方式
7. **设计模式**：学习了Pythonic的设计模式实现
8. **SOLID原则**：理解了面向对象设计的核心思想

### 最佳实践总结

1. **优先使用组合而非继承**：组合更灵活，更容易理解和维护
2. **合理使用魔术方法**：让你的类更加Pythonic
3. **善用@property装饰器**：实现优雅的属性访问
4. **遵循SOLID原则**：创建可维护、可扩展的系统
5. **适度使用设计模式**：不要过度设计，保持简单

### 下一步学习建议

1. **阅读优秀源码**：学习Django、Flask等框架的源代码
2. **实践项目**：尝试用面向对象思想重构现有项目
3. **学习元编程**：深入了解Python的元类和描述符
4. **掌握类型提示**：使用Python的类型系统提高代码质量

面向对象编程不仅是技术，更是一种思维方式。掌握这些高级特性后，你将能够设计出更加优雅、灵活和可维护的系统。记住，**好的设计是在简单性和灵活性之间找到平衡**。

---

**思考题**：

1. 在你的项目中，哪些地方可以使用组合替代继承？
2. 如何设计一个既灵活又易于使用的API？
3. 什么时候应该使用抽象基类，什么时候应该使用鸭子类型？

编程之路永无止境，继续探索，不断实践，你将从一个合格的开发者成长为真正的软件架构师！
