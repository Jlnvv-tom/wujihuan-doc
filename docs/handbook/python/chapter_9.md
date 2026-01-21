# Python异常处理与调试：从崩溃到优雅恢复的完整指南

> 掌握错误处理艺术，让你的Python代码既健壮又易于调试

## 引言：为什么异常处理如此重要？

在开发过程中，错误是不可避免的。无论是因为用户输入了无效数据、网络连接中断，还是文件不存在，错误都会发生。没有适当的错误处理，程序可能会在用户面前崩溃，或者更糟糕的是，悄无声息地产生错误结果。

想象一下，你开发了一个在线支付系统。如果没有异常处理：

- 网络波动导致支付失败，用户却不知道原因
- 数据库连接断开，所有交易数据丢失
- 恶意输入导致系统崩溃，服务不可用

良好的异常处理能让你的程序**优雅地失败**，提供有用的错误信息，并在可能的情况下**自动恢复**。本章将带你从异常处理的基础到高级调试技巧，构建健壮的Python应用。

## 9.1 错误与异常的概念

### 错误 vs 异常

在Python中，错误和异常是有区别的：

```python
# 语法错误（SyntaxError） - 代码无法解析
# 这类错误在代码执行前就会被捕获
# 示例：
# print("Hello world"  # 缺少右括号，语法错误

# 运行时错误（Runtime Error） - 代码语法正确，但执行时出错
# 示例：
result = 10 / 0  # ZeroDivisionError
```

### Python异常层次结构

Python的所有异常都继承自`BaseException`类：

```
BaseException
 ├── SystemExit
 ├── KeyboardInterrupt
 ├── GeneratorExit
 └── Exception
      ├── StopIteration
      ├── StopAsyncIteration
      ├── ArithmeticError
      │    ├── FloatingPointError
      │    ├── OverflowError
      │    └── ZeroDivisionError
      ├── AssertionError
      ├── AttributeError
      ├── BufferError
      ├── EOFError
      ├── ImportError
      │    └── ModuleNotFoundError
      ├── LookupError
      │    ├── IndexError
      │    └── KeyError
      ├── MemoryError
      ├── NameError
      │    └── UnboundLocalError
      ├── OSError
      │    ├── BlockingIOError
      │    ├── ChildProcessError
      │    ├── ConnectionError
      │    │    ├── BrokenPipeError
      │    │    ├── ConnectionAbortedError
      │    │    ├── ConnectionRefusedError
      │    │    └── ConnectionResetError
      │    ├── FileExistsError
      │    ├── FileNotFoundError
      │    ├── InterruptedError
      │    ├── IsADirectoryError
      │    ├── NotADirectoryError
      │    ├── PermissionError
      │    ├── ProcessLookupError
      │    └── TimeoutError
      ├── ReferenceError
      ├── RuntimeError
      │    ├── NotImplementedError
      │    └── RecursionError
      ├── SyntaxError
      │    └── IndentationError
      ├── SystemError
      ├── TypeError
      ├── ValueError
      │    └── UnicodeError
      └── Warning
           ├── DeprecationWarning
           ├── PendingDeprecationWarning
           ├── RuntimeWarning
           ├── SyntaxWarning
           ├── UserWarning
           └── FutureWarning
```

### 常见内置异常类型

```python
# 1. 类型错误（TypeError）
try:
    result = "hello" + 5  # 字符串和整数不能相加
except TypeError as e:
    print(f"类型错误: {e}")

# 2. 值错误（ValueError）
try:
    num = int("abc")  # 无法将'abc'转换为整数
except ValueError as e:
    print(f"值错误: {e}")

# 3. 索引错误（IndexError）
try:
    items = [1, 2, 3]
    print(items[5])  # 索引超出范围
except IndexError as e:
    print(f"索引错误: {e}")

# 4. 键错误（KeyError）
try:
    d = {"name": "Alice"}
    print(d["age"])  # 键不存在
except KeyError as e:
    print(f"键错误: 键 {e} 不存在")

# 5. 属性错误（AttributeError）
try:
    s = "hello"
    s.append(" world")  # 字符串没有append方法
except AttributeError as e:
    print(f"属性错误: {e}")

# 6. 导入错误（ImportError）
try:
    import non_existent_module
except ImportError as e:
    print(f"导入错误: {e}")

# 7. 文件未找到错误（FileNotFoundError）
try:
    with open("non_existent_file.txt", "r") as f:
        content = f.read()
except FileNotFoundError as e:
    print(f"文件未找到错误: {e}")

# 8. 零除错误（ZeroDivisionError）
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"零除错误: {e}")

# 9. 键盘中断（KeyboardInterrupt）
try:
    while True:
        pass  # 按Ctrl+C会触发KeyboardInterrupt
except KeyboardInterrupt:
    print("\n程序被用户中断")
```

## 9.2 异常处理：try-except基础

### 基本语法

```python
try:
    # 可能引发异常的代码
    result = 10 / 0
except ZeroDivisionError:
    # 处理特定异常
    print("不能除以零！")
```

### 捕获多个异常

```python
def divide_numbers(a, b):
    """
    除法运算，处理多种异常
    """
    try:
        result = a / b
        print(f"{a} / {b} = {result}")
    except ZeroDivisionError:
        print("错误：除数不能为零")
    except TypeError:
        print("错误：操作数类型不正确")

# 测试
divide_numbers(10, 2)    # 正常
divide_numbers(10, 0)    # ZeroDivisionError
divide_numbers(10, "2")  # TypeError
```

### 获取异常信息

```python
def read_file(filename):
    """
    读取文件，捕获异常并显示详细信息
    """
    try:
        with open(filename, "r", encoding="utf-8") as file:
            content = file.read()
            print(f"文件内容：\n{content}")
    except FileNotFoundError as e:
        print(f"文件未找到：{e.filename}")
        print(f"错误详情：{e.strerror}")
        print(f"错误码：{e.errno}")
    except PermissionError as e:
        print(f"权限错误：{e.filename}")
        print(f"错误详情：{e.strerror}")
    except OSError as e:
        # 捕获所有操作系统相关的错误
        print(f"操作系统错误：{e}")
    except Exception as e:
        # 捕获所有其他异常（不推荐作为首选）
        print(f"未知错误：{type(e).__name__}: {e}")
        # 打印堆栈跟踪
        import traceback
        traceback.print_exc()

# 测试
read_file("example.txt")      # 文件不存在
read_file("/etc/shadow")      # 权限错误（Linux/Mac）
read_file(None)               # 类型错误
```

### 避免过度捕获异常

```python
# 不好的做法：捕获所有异常，隐藏问题
def bad_practice_1():
    try:
        # 很多代码...
        result = 10 / 0
    except:
        pass  # 静默处理，不知道发生了什么

# 不好的做法：捕获过于宽泛的异常
def bad_practice_2():
    try:
        # 可能抛出多种异常
        value = int(input("输入数字: "))
    except Exception:  # 过于宽泛
        print("出错了")

# 好的做法：只捕获预期的异常
def good_practice():
    try:
        value = int(input("输入数字: "))
    except ValueError:  # 只捕获转换失败的情况
        print("请输入有效的数字")
    except EOFError:    # 捕获文件结束（Ctrl+D/Ctrl+Z）
        print("\n输入结束")
    except KeyboardInterrupt:  # 捕获用户中断
        print("\n用户中断")

# 更好的做法：提供有用的错误信息
def better_practice():
    try:
        filename = input("请输入文件名: ")
        with open(filename, "r") as f:
            data = f.read()
    except FileNotFoundError:
        print(f"错误：文件 '{filename}' 不存在")
    except PermissionError:
        print(f"错误：没有权限读取文件 '{filename}'")
    except IsADirectoryError:
        print(f"错误：'{filename}' 是一个目录，不是文件")
    except UnicodeDecodeError as e:
        print(f"错误：无法解码文件 '{filename}'")
        print(f"编码问题：{e.reason}")
```

## 9.3 多个异常处理与else、finally

### else子句：没有异常时执行

```python
def process_file(filename):
    """
    使用else子句处理文件
    """
    try:
        print(f"尝试打开文件: {filename}")
        file = open(filename, "r")
    except FileNotFoundError:
        print(f"文件 {filename} 不存在")
    except PermissionError:
        print(f"没有权限读取文件 {filename}")
    else:
        # 只有在没有异常时执行
        print("文件打开成功，开始处理...")
        try:
            content = file.read()
            print(f"文件大小: {len(content)} 字节")
            # 这里可以添加更多处理逻辑
        finally:
            file.close()
            print("文件已关闭")
    print("处理完成")

# 测试
process_file("example.txt")
process_file("/etc/passwd")  # 在Linux/Mac上测试
```

### finally子句：无论是否异常都会执行

```python
def database_operation():
    """
    模拟数据库操作，展示finally的用法
    """
    connection = None
    try:
        print("建立数据库连接...")
        connection = "模拟数据库连接"
        print("执行SQL查询...")
        # 模拟可能发生的错误
        import random
        if random.random() < 0.3:
            raise ValueError("查询语法错误")
        elif random.random() < 0.6:
            raise ConnectionError("网络连接中断")

        print("查询成功!")
        return "查询结果"

    except ValueError as e:
        print(f"查询错误: {e}")
        return None
    except ConnectionError as e:
        print(f"连接错误: {e}")
        return None
    finally:
        # 无论是否发生异常，都会执行
        if connection:
            print("关闭数据库连接...")
            connection = None
        print("清理完成")

# 测试多次以观察不同情况
for i in range(5):
    print(f"\n--- 测试 {i+1} ---")
    result = database_operation()
    print(f"结果: {result}")
```

### 完整的try-except-else-finally结构

```python
import json
import os

def load_config(config_file="config.json"):
    """
    加载配置文件，展示完整的异常处理结构
    """
    config = None
    file = None

    try:
        print(f"尝试加载配置文件: {config_file}")

        # 检查文件是否存在
        if not os.path.exists(config_file):
            raise FileNotFoundError(f"配置文件不存在: {config_file}")

        # 检查文件权限
        if not os.access(config_file, os.R_OK):
            raise PermissionError(f"没有读取权限: {config_file}")

        # 打开文件
        file = open(config_file, "r")

        # 读取并解析JSON
        content = file.read()
        config = json.loads(content)

    except FileNotFoundError as e:
        print(f"错误: {e}")
        # 创建默认配置
        config = {"debug": False, "port": 8080}
        print("使用默认配置")

    except PermissionError as e:
        print(f"错误: {e}")
        print("请检查文件权限")
        return None

    except json.JSONDecodeError as e:
        print(f"JSON解析错误: {e}")
        print(f"错误位置: 第{e.lineno}行, 第{e.colno}列")
        return None

    except Exception as e:
        print(f"未知错误: {type(e).__name__}: {e}")
        return None

    else:
        # 只有在没有异常时执行
        print("配置文件加载成功!")
        print(f"配置内容: {json.dumps(config, indent=2)}")

    finally:
        # 无论是否发生异常，都会执行
        if file:
            file.close()
            print("文件已关闭")
        print("配置加载过程结束")

    return config

# 创建测试文件
test_config = {
    "app_name": "MyApp",
    "debug": True,
    "database": {
        "host": "localhost",
        "port": 5432
    }
}

with open("test_config.json", "w") as f:
    json.dump(test_config, f, indent=2)

# 测试各种情况
print("=== 测试1: 正常情况 ===")
config1 = load_config("test_config.json")

print("\n=== 测试2: 文件不存在 ===")
config2 = load_config("nonexistent.json")

print("\n=== 测试3: JSON格式错误 ===")
with open("bad_config.json", "w") as f:
    f.write('{"key": "value", malformed}')
config3 = load_config("bad_config.json")

# 清理测试文件
import os
os.remove("test_config.json")
if os.path.exists("bad_config.json"):
    os.remove("bad_config.json")
```

## 9.4 自定义异常

### 为什么需要自定义异常？

自定义异常可以：

1. 提供更有意义的错误信息
2. 创建特定领域的异常层次结构
3. 让错误处理更精确
4. 提高代码的可读性和可维护性

### 创建自定义异常

```python
class ValidationError(Exception):
    """基础验证错误"""
    pass

class EmailValidationError(ValidationError):
    """邮箱验证错误"""
    def __init__(self, email, message=None):
        self.email = email
        self.message = message or f"邮箱格式无效: {email}"
        super().__init__(self.message)

class PasswordValidationError(ValidationError):
    """密码验证错误"""
    def __init__(self, requirement, message=None):
        self.requirement = requirement
        self.message = message or f"密码不符合要求: {requirement}"
        super().__init__(self.message)

class AgeValidationError(ValidationError):
    """年龄验证错误"""
    def __init__(self, age, min_age, max_age):
        self.age = age
        self.min_age = min_age
        self.max_age = max_age
        self.message = f"年龄 {age} 不在有效范围 [{min_age}, {max_age}] 内"
        super().__init__(self.message)

class UserRegistrationError(Exception):
    """用户注册错误"""
    def __init__(self, errors):
        self.errors = errors
        self.message = f"注册失败，发现 {len(errors)} 个错误"
        super().__init__(self.message)

    def __str__(self):
        error_list = "\n".join(f"  - {error}" for error in self.errors)
        return f"{self.message}:\n{error_list}"

# 使用自定义异常
def validate_email(email):
    """验证邮箱格式"""
    import re

    if not email:
        raise EmailValidationError(email, "邮箱不能为空")

    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        raise EmailValidationError(email)

    return True

def validate_password(password):
    """验证密码强度"""
    errors = []

    if len(password) < 8:
        errors.append("密码长度至少8个字符")

    if not any(c.isupper() for c in password):
        errors.append("密码必须包含至少一个大写字母")

    if not any(c.isdigit() for c in password):
        errors.append("密码必须包含至少一个数字")

    if errors:
        raise PasswordValidationError("; ".join(errors))

    return True

def validate_age(age, min_age=18, max_age=100):
    """验证年龄"""
    if not isinstance(age, int):
        raise TypeError("年龄必须是整数")

    if age < min_age or age > max_age:
        raise AgeValidationError(age, min_age, max_age)

    return True

def register_user(email, password, age):
    """注册用户"""
    errors = []

    try:
        validate_email(email)
    except EmailValidationError as e:
        errors.append(str(e))

    try:
        validate_password(password)
    except PasswordValidationError as e:
        errors.append(str(e))

    try:
        validate_age(age)
    except AgeValidationError as e:
        errors.append(str(e))
    except TypeError as e:
        errors.append(str(e))

    if errors:
        raise UserRegistrationError(errors)

    print(f"用户 {email} 注册成功!")
    return True

# 测试自定义异常
test_cases = [
    ("test@example.com", "StrongPass123", 25),   # 成功
    ("invalid-email", "weak", 15),               # 多个错误
    ("user@domain.com", "NoNumbersOrUppercase", 30),  # 密码错误
    ("admin@company.com", "GoodPass123", 120),   # 年龄错误
]

for email, password, age in test_cases:
    print(f"\n尝试注册: email={email}, age={age}")
    try:
        register_user(email, password, age)
    except UserRegistrationError as e:
        print(f"注册失败: {e}")
    except Exception as e:
        print(f"意外错误: {type(e).__name__}: {e}")
```

### 更复杂的异常层次结构

```python
class BankingError(Exception):
    """银行系统基础异常"""
    pass

class AccountError(BankingError):
    """账户相关异常"""
    def __init__(self, account_number, message):
        self.account_number = account_number
        super().__init__(f"账户 {account_number}: {message}")

class InsufficientFundsError(AccountError):
    """余额不足"""
    def __init__(self, account_number, balance, amount):
        self.balance = balance
        self.amount = amount
        message = f"余额不足 (余额: ${balance:.2f}, 尝试取款: ${amount:.2f})"
        super().__init__(account_number, message)

class AccountNotFoundError(AccountError):
    """账户不存在"""
    def __init__(self, account_number):
        message = "账户不存在"
        super().__init__(account_number, message)

class AccountClosedError(AccountError):
    """账户已关闭"""
    def __init__(self, account_number):
        message = "账户已关闭"
        super().__init__(account_number, message)

class TransactionError(BankingError):
    """交易相关异常"""
    pass

class InvalidAmountError(TransactionError):
    """无效金额"""
    def __init__(self, amount):
        self.amount = amount
        super().__init__(f"无效金额: ${amount:.2f} (必须大于0)")

class DailyLimitExceededError(TransactionError):
    """超过每日限额"""
    def __init__(self, limit, attempted):
        self.limit = limit
        self.attempted = attempted
        super().__init__(f"超过每日限额 (限额: ${limit:.2f}, 尝试: ${attempted:.2f})")

# 银行系统实现
class BankAccount:
    def __init__(self, account_number, owner, initial_balance=0):
        self.account_number = account_number
        self.owner = owner
        self.balance = initial_balance
        self.is_active = True
        self.daily_withdrawal = 0
        self.DAILY_LIMIT = 1000

    def deposit(self, amount):
        if amount <= 0:
            raise InvalidAmountError(amount)

        self.balance += amount
        print(f"存款 ${amount:.2f} 成功。新余额: ${self.balance:.2f}")
        return self.balance

    def withdraw(self, amount):
        if not self.is_active:
            raise AccountClosedError(self.account_number)

        if amount <= 0:
            raise InvalidAmountError(amount)

        if amount > self.balance:
            raise InsufficientFundsError(self.account_number, self.balance, amount)

        if self.daily_withdrawal + amount > self.DAILY_LIMIT:
            raise DailyLimitExceededError(self.DAILY_LIMIT, self.daily_withdrawal + amount)

        self.balance -= amount
        self.daily_withdrawal += amount
        print(f"取款 ${amount:.2f} 成功。新余额: ${self.balance:.2f}")
        return self.balance

    def close_account(self):
        self.is_active = False
        print(f"账户 {self.account_number} 已关闭")

    def reset_daily_limit(self):
        self.daily_withdrawal = 0
        print("每日限额已重置")

# 测试银行系统
def test_bank_system():
    account = BankAccount("123456789", "张三", 500)

    operations = [
        ("存款", 200),
        ("取款", 100),
        ("取款", 600),  # 余额不足
        ("取款", 0),    # 无效金额
        ("取款", 950),  # 超过每日限额
        ("关闭账户", None),
        ("取款", 50),   # 账户已关闭
    ]

    for operation, amount in operations:
        print(f"\n操作: {operation} {f'${amount:.2f}' if amount else ''}")
        try:
            if operation == "存款":
                account.deposit(amount)
            elif operation == "取款":
                account.withdraw(amount)
            elif operation == "关闭账户":
                account.close_account()
        except BankingError as e:
            print(f"银行错误: {e}")
        except Exception as e:
            print(f"意外错误: {type(e).__name__}: {e}")

test_bank_system()
```

## 9.5 异常链与上下文

### 异常链：raise from

Python 3引入了异常链，可以保留原始异常信息：

```python
def process_data(data_file):
    """处理数据文件，展示异常链"""
    try:
        print(f"打开文件: {data_file}")
        with open(data_file, "r") as f:
            data = f.read()

        # 处理数据
        result = complex_data_processing(data)
        return result

    except FileNotFoundError as e:
        # 包装异常，提供更多上下文
        raise RuntimeError(f"无法处理数据文件: {data_file}") from e

def complex_data_processing(data):
    """复杂的数据处理，可能抛出多种异常"""
    try:
        import json
        parsed = json.loads(data)

        # 模拟复杂处理
        if "value" not in parsed:
            raise ValueError("数据中缺少'value'字段")

        result = parsed["value"] * 2
        return result

    except json.JSONDecodeError as e:
        # 重新抛出异常，添加上下文
        raise ValueError(f"无效的JSON数据: {data[:50]}...") from e

# 测试异常链
try:
    # 创建测试数据
    test_data = '{"value": 42}'
    with open("test_data.json", "w") as f:
        f.write(test_data)

    # 测试正常情况
    result = process_data("test_data.json")
    print(f"处理结果: {result}")

    # 测试文件不存在
    result = process_data("nonexistent.json")

except RuntimeError as e:
    print(f"运行时错误: {e}")
    print(f"原始异常: {e.__cause__}")

except ValueError as e:
    print(f"值错误: {e}")
    if e.__cause__:
        print(f"原始异常: {e.__cause__}")

# 清理
import os
if os.path.exists("test_data.json"):
    os.remove("test_data.json")
```

### 异常上下文：**context**

```python
def function_a():
    """第一层函数"""
    try:
        x = 1 / 0
    except ZeroDivisionError as e:
        raise ValueError("function_a 处理失败") from e

def function_b():
    """第二层函数"""
    try:
        function_a()
    except ValueError as e:
        # 不指定 from，使用隐式异常链
        raise RuntimeError("function_b 调用失败")

def function_c():
    """第三层函数"""
    try:
        function_b()
    except RuntimeError as e:
        # 添加更多上下文
        raise RuntimeError("整个操作失败") from e

# 测试异常上下文
try:
    function_c()
except RuntimeError as e:
    print(f"捕获的异常: {e}")
    print(f"\n异常链:")

    # 遍历异常链
    current_exc = e
    level = 0
    while current_exc:
        indent = "  " * level
        print(f"{indent}层级 {level}: {type(current_exc).__name__}: {current_exc}")

        # 检查是否有显式原因（__cause__）
        if current_exc.__cause__:
            print(f"{indent}  原因: {type(current_exc.__cause__).__name__}: {current_exc.__cause__}")
            current_exc = current_exc.__cause__
        # 检查是否有隐式上下文（__context__）
        elif current_exc.__context__:
            print(f"{indent}  上下文: {type(current_exc.__context__).__name__}: {current_exc.__context__}")
            current_exc = current_exc.__context__
        else:
            break

        level += 1
```

### traceback模块：获取详细的异常信息

```python
import traceback
import sys

def risky_operation(x, y):
    """有风险的运算"""
    try:
        result = x / y
        return result
    except Exception as e:
        # 捕获异常并添加更多信息
        exc_type, exc_value, exc_traceback = sys.exc_info()

        print("=== 基本异常信息 ===")
        print(f"异常类型: {exc_type.__name__}")
        print(f"异常消息: {exc_value}")

        print("\n=== 详细堆栈跟踪 ===")
        # 获取完整的堆栈跟踪
        tb_lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
        for line in tb_lines:
            print(line, end="")

        print("\n=== 提取堆栈帧信息 ===")
        # 提取堆栈帧
        stack = traceback.extract_tb(exc_traceback)
        for frame in stack:
            print(f"  文件: {frame.filename}, 行号: {frame.lineno}, 函数: {frame.name}")
            print(f"  代码: {frame.line}")

        print("\n=== 格式化异常 ===")
        # 使用format_exc获取格式化字符串
        formatted = traceback.format_exc()
        print(formatted)

        # 重新抛出异常
        raise

def nested_function():
    """嵌套函数调用"""
    return risky_operation(10, 0)

def main():
    """主函数"""
    try:
        nested_function()
    except ZeroDivisionError:
        print("\n=== 在主函数中捕获异常 ===")
        # 使用print_exc打印当前异常
        traceback.print_exc()

# 运行测试
main()
```

## 9.6 调试技巧：print与断言

### print调试：简单但有效

```python
def debug_with_print(data):
    """
    使用print进行调试
    虽然简单，但在很多情况下非常有效
    """
    print(f"[DEBUG] 函数开始，输入数据: {data}")

    # 处理数据
    result = []
    for i, item in enumerate(data):
        print(f"[DEBUG] 处理第 {i} 个元素: {item}")

        # 模拟复杂处理
        try:
            processed = int(item) * 2
            result.append(processed)
            print(f"[DEBUG] 处理成功: {item} -> {processed}")
        except ValueError as e:
            print(f"[DEBUG] 处理失败: {item} -> 错误: {e}")
            result.append(0)

    print(f"[DEBUG] 函数结束，结果: {result}")
    return result

# 测试
data = ["1", "2", "three", "4"]
result = debug_with_print(data)
print(f"最终结果: {result}")
```

### 更好的print调试：使用logging模块

```python
import logging

# 配置日志
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)

def debug_with_logging(data):
    """
    使用logging模块进行调试
    更灵活，可以控制输出级别
    """
    logging.debug("函数开始，输入数据: %s", data)

    result = []
    for i, item in enumerate(data):
        logging.debug("处理第 %d 个元素: %s", i, item)

        try:
            processed = int(item) * 2
            result.append(processed)
            logging.debug("处理成功: %s -> %s", item, processed)
        except ValueError as e:
            logging.error("处理失败: %s -> 错误: %s", item, e)
            result.append(0)

    logging.debug("函数结束，结果: %s", result)
    return result

# 测试
print("=== 使用logging调试 ===")
data = ["5", "6", "seven", "8"]
result = debug_with_logging(data)
print(f"最终结果: {result}")
```

### 断言（assert）：验证假设

```python
def calculate_statistics(numbers):
    """
    计算统计信息，使用断言验证假设
    """
    # 断言：输入必须是列表
    assert isinstance(numbers, list), "输入必须是列表"

    # 断言：列表不能为空
    assert len(numbers) > 0, "列表不能为空"

    # 断言：所有元素必须是数字
    for num in numbers:
        assert isinstance(num, (int, float)), f"元素 {num} 必须是数字"

    print("[断言通过] 输入验证完成")

    # 计算统计信息
    total = sum(numbers)
    count = len(numbers)
    average = total / count

    # 断言：平均值应该在合理范围内
    assert 0 <= average <= 100, f"平均值 {average} 不在合理范围内"

    # 计算标准差
    import math
    variance = sum((x - average) ** 2 for x in numbers) / count
    std_dev = math.sqrt(variance)

    # 断言：标准差非负
    assert std_dev >= 0, "标准差不能为负"

    return {
        "total": total,
        "count": count,
        "average": average,
        "std_dev": std_dev
    }

# 测试断言
test_cases = [
    ([1, 2, 3, 4, 5], True),   # 正常情况
    ([], False),               # 空列表
    ([1, 2, "three", 4], False),  # 非数字元素
    ([-10, 0, 150], False),    # 平均值超出范围
    ("not a list", False),     # 不是列表
]

for numbers, should_pass in test_cases:
    print(f"\n测试数据: {numbers}")
    try:
        result = calculate_statistics(numbers)
        print(f"结果: {result}")
        if not should_pass:
            print("警告: 本应失败但通过了!")
    except AssertionError as e:
        print(f"断言失败: {e}")
        if should_pass:
            print("错误: 本应通过但失败了!")
```

### 使用**debug**和assert的优化

```python
def optimized_function(data, debug=False):
    """
    使用__debug__优化调试代码
    当使用-O参数运行时，assert语句会被忽略
    """
    # 这个assert在优化模式下会被移除
    assert all(isinstance(x, (int, float)) for x in data), "数据必须全是数字"

    # 使用__debug__控制调试输出
    if __debug__ or debug:
        print(f"[调试] 开始处理 {len(data)} 个数据点")
        print(f"[调试] 数据范围: {min(data)} 到 {max(data)}")

    # 计算过程
    result = sum(x ** 2 for x in data)

    if __debug__ or debug:
        print(f"[调试] 计算结果: {result}")

    return result

# 测试
print("=== 正常模式运行 ===")
data = [1, 2, 3, 4, 5]
result1 = optimized_function(data, debug=True)

print("\n=== 测试断言失败 ===")
bad_data = [1, 2, "three", 4]
try:
    result2 = optimized_function(bad_data)
except AssertionError as e:
    print(f"断言失败: {e}")

# 提示：可以使用 python -O 文件名.py 来运行优化模式
print("\n提示: 使用 'python -O script.py' 运行以禁用断言")
```

## 9.7 使用pdb调试器

### pdb基础用法

```python
import pdb

def buggy_function(data):
    """
    一个有bug的函数，用于演示pdb调试
    """
    result = 0

    # 设置断点
    pdb.set_trace()  # 程序会在这里暂停

    for item in data:
        # 这里有bug：没有处理非数字
        result += item ** 2

    return result / len(data)

# 测试 - 运行后会进入pdb调试器
print("准备调试 buggy_function...")
data = [1, 2, 3, 4, 5]
try:
    result = buggy_function(data)
    print(f"结果: {result}")
except Exception as e:
    print(f"错误: {type(e).__name__}: {e}")
```

### pdb常用命令

下面是一个演示pdb命令的示例程序：

```python
def complex_calculation(a, b, c):
    """复杂的计算函数"""
    # 步骤1: 计算中间值
    intermediate = a * b
    print(f"中间值: {intermediate}")

    # 步骤2: 应用系数
    adjusted = intermediate * c

    # 步骤3: 调整结果
    if adjusted > 100:
        result = adjusted / 10
    else:
        result = adjusted * 10

    return result

def process_data(numbers, factor):
    """处理数据的主函数"""
    total = 0

    for i, num in enumerate(numbers):
        # 计算每个元素的值
        value = complex_calculation(num, i + 1, factor)

        # 累加
        total += value

        print(f"处理第 {i} 个元素: {num} -> {value}")

    return total / len(numbers) if numbers else 0

# 要调试这个程序，可以在命令行运行：
# python -m pdb your_script.py
# 或者在代码中插入：
# import pdb; pdb.set_trace()

# 常用pdb命令：
# 1. h(elp) - 显示帮助
# 2. n(ext) - 执行下一行
# 3. s(tep) - 进入函数调用
# 4. c(ontinue) - 继续执行直到下一个断点
# 5. l(ist) - 显示当前代码
# 6. p(rint) - 打印变量值
# 7. pp - 漂亮打印变量值
# 8. w(here) - 显示堆栈跟踪
# 9. b(reak) - 设置断点
# 10. q(uit) - 退出调试器
```

### 实战调试示例

```python
import pdb

def find_bug_in_code():
    """一个包含多个bug的函数"""
    data = [1, 2, 3, 4, 5, "6", 7, 8, 9, 10]

    # Bug 1: 没有过滤非数字
    squares = []
    for item in data:
        # 设置条件断点：只在遇到字符串时暂停
        if isinstance(item, str):
            pdb.set_trace()  # 手动设置的断点

        squares.append(item ** 2)

    # Bug 2: 除以零的风险
    total = sum(squares)
    average = total / len(data)

    # Bug 3: 逻辑错误
    if average > 50:
        result = "高"
    elif average > 20:  # 这里应该是 average > 30
        result = "中"
    else:
        result = "低"

    return result, average, squares

# 运行调试
print("开始调试...")
try:
    result, average, squares = find_bug_in_code()
    print(f"结果: {result}, 平均值: {average}")
except Exception as e:
    print(f"捕获到异常: {type(e).__name__}: {e}")

    # 进入事后调试
    print("\n进入事后调试...")
    pdb.post_mortem()

# 在pdb调试器中可以：
# 1. 检查变量: p data, p item, p squares
# 2. 查看类型: type(item)
# 3. 修复代码: 在调试器中尝试修复
# 4. 继续执行: c
```

### 更高级的pdb技巧

```python
import pdb
import sys

class AdvancedDebugger:
    """高级调试器示例"""

    def __init__(self):
        self.breakpoints = {}

    def trace_calls(self, frame, event, arg):
        """跟踪函数调用"""
        if event == 'call':
            func_name = frame.f_code.co_name
            filename = frame.f_code.co_filename
            line_no = frame.f_lineno

            print(f"调用: {func_name}() 在 {filename}:{line_no}")

            # 检查是否有断点
            if (filename, func_name, line_no) in self.breakpoints:
                print(f"命中断点: {func_name}:{line_no}")
                pdb.set_trace()

        return self.trace_calls

    def add_breakpoint(self, filename, func_name, line_no):
        """添加断点"""
        self.breakpoints[(filename, func_name, line_no)] = True
        print(f"添加断点: {func_name}:{line_no}")

    def debug_function(self, func, *args, **kwargs):
        """调试函数"""
        # 设置跟踪
        old_trace = sys.gettrace()
        sys.settrace(self.trace_calls)

        try:
            result = func(*args, **kwargs)
            return result
        finally:
            # 恢复原来的跟踪
            sys.settrace(old_trace)

# 示例函数
def recursive_factorial(n):
    """递归计算阶乘（有bug的版本）"""
    if n == 0:
        return 0  # Bug: 应该是 return 1
    else:
        return n * recursive_factorial(n - 1)

def complex_operation(x, y):
    """复杂操作"""
    result = x + y
    result *= 2

    # 调用有bug的函数
    fact = recursive_factorial(3)
    result /= fact

    return result

# 使用高级调试器
debugger = AdvancedDebugger()

# 添加断点
debugger.add_breakpoint(__file__, "recursive_factorial", 10)  # return 0 那一行

print("开始调试...")
try:
    result = debugger.debug_function(complex_operation, 10, 20)
    print(f"结果: {result}")
except Exception as e:
    print(f"错误: {e}")
    pdb.post_mortem()
```

## 9.8 日志记录：logging模块

### logging基础配置

```python
import logging
import sys

# 基础配置
logging.basicConfig(
    level=logging.DEBUG,  # 设置日志级别
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler('app.log', encoding='utf-8'),  # 文件处理器
        logging.StreamHandler(sys.stdout)  # 控制台处理器
    ]
)

def demonstrate_logging():
    """演示不同级别的日志记录"""
    logger = logging.getLogger(__name__)

    # 不同级别的日志
    logger.debug("这是一条调试信息")     # 最详细，用于调试
    logger.info("程序正常启动")          # 确认事情按预期工作
    logger.warning("磁盘空间不足")       # 发生了意外，但程序还能继续
    logger.error("无法打开配置文件")     # 更严重的问题
    logger.critical("数据库连接失败")    # 严重错误，程序可能无法继续运行

    # 带有额外信息的日志
    logger.info("用户登录成功", extra={"user": "alice", "ip": "192.168.1.1"})

    # 记录异常
    try:
        result = 10 / 0
    except ZeroDivisionError as e:
        logger.exception("发生除零错误")  # 自动记录异常信息

    return logger

# 测试
logger = demonstrate_logging()
```

### 高级日志配置

```python
import logging
import logging.config
import json
import os

# 创建日志目录
os.makedirs("logs", exist_ok=True)

# 详细的日志配置
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,

    "formatters": {
        "detailed": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(funcName)s - %(message)s"
        },
        "simple": {
            "format": "%(levelname)s - %(message)s"
        },
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s"
        }
    },

    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "simple",
            "stream": "ext://sys.stdout"
        },

        "file_debug": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": "DEBUG",
            "formatter": "detailed",
            "filename": "logs/debug.log",
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5,
            "encoding": "utf-8"
        },

        "file_error": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": "ERROR",
            "formatter": "detailed",
            "filename": "logs/error.log",
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5,
            "encoding": "utf-8"
        },

        "file_json": {
            "class": "logging.FileHandler",
            "level": "INFO",
            "formatter": "json",
            "filename": "logs/application.json.log",
            "encoding": "utf-8"
        }
    },

    "loggers": {
        "": {  # 根日志器
            "level": "DEBUG",
            "handlers": ["console", "file_debug", "file_error"]
        },

        "database": {  # 数据库相关日志
            "level": "INFO",
            "handlers": ["file_json"],
            "propagate": False  # 不传播到根日志器
        },

        "api": {  # API相关日志
            "level": "DEBUG",
            "handlers": ["console", "file_debug"],
            "propagate": False
        },

        "security": {  # 安全相关日志
            "level": "WARNING",
            "handlers": ["file_error", "file_json"],
            "propagate": False
        }
    }
}

# 应用配置
logging.config.dictConfig(LOGGING_CONFIG)

# 创建不同模块的日志器
app_logger = logging.getLogger("app")
db_logger = logging.getLogger("database")
api_logger = logging.getLogger("api")
security_logger = logging.getLogger("security")

def simulate_application():
    """模拟应用程序运行"""
    app_logger.info("应用程序启动")

    # 模拟数据库操作
    db_logger.debug("连接数据库")
    db_logger.info("执行查询: SELECT * FROM users")

    # 模拟API调用
    api_logger.debug("处理API请求: GET /api/users")
    api_logger.info("API响应: 200 OK")

    # 模拟安全事件
    try:
        # 模拟失败的登录尝试
        raise ValueError("无效的登录凭证")
    except ValueError as e:
        security_logger.warning(f"登录失败: {e}")

    # 模拟错误
    try:
        result = 10 / 0
    except ZeroDivisionError:
        app_logger.error("发生除零错误", exc_info=True)

    app_logger.info("应用程序关闭")

# 运行模拟
simulate_application()

print("\n日志文件已创建:")
print("  - logs/debug.log: 包含所有调试信息")
print("  - logs/error.log: 只包含错误信息")
print("  - logs/application.json.log: JSON格式的日志")
```

### 自定义日志处理器和过滤器

```python
import logging
import logging.handlers
from datetime import datetime

class ContextFilter(logging.Filter):
    """上下文过滤器，添加额外信息到日志记录"""

    def filter(self, record):
        # 添加时间戳（精确到毫秒）
        record.timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

        # 添加进程ID
        import os
        record.pid = os.getpid()

        # 添加线程名
        import threading
        record.thread_name = threading.current_thread().name

        return True

class EmailHandler(logging.Handler):
    """自定义处理器：发送错误邮件"""

    def __init__(self, recipient):
        super().__init__(level=logging.ERROR)
        self.recipient = recipient

    def emit(self, record):
        """发送邮件"""
        import smtplib
        from email.mime.text import MIMEText

        try:
            # 创建邮件内容
            subject = f"应用错误: {record.levelname}"
            body = self.format(record)

            msg = MIMEText(body)
            msg['Subject'] = subject
            msg['From'] = 'monitor@example.com'
            msg['To'] = self.recipient

            # 发送邮件（模拟）
            print(f"[模拟发送邮件] 给 {self.recipient}")
            print(f"主题: {subject}")
            print(f"内容:\n{body}")
            print("-" * 50)

            # 实际发送需要配置SMTP服务器
            # with smtplib.SMTP('smtp.example.com') as server:
            #     server.send_message(msg)

        except Exception:
            self.handleError(record)

class DatabaseHandler(logging.Handler):
    """自定义处理器：记录到数据库"""

    def emit(self, record):
        """写入数据库（模拟）"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'filename': record.filename,
            'lineno': record.lineno,
            'funcName': record.funcName,
            'exception': record.exc_text
        }

        print(f"[数据库记录] {log_entry}")

# 配置日志系统
def setup_advanced_logging():
    """设置高级日志系统"""

    # 创建根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # 添加过滤器
    context_filter = ContextFilter()
    root_logger.addFilter(context_filter)

    # 控制台处理器
    console_format = logging.Formatter(
        '%(timestamp)s [%(pid)s/%(thread_name)s] %(levelname)s - %(name)s - %(message)s'
    )
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_format)
    root_logger.addHandler(console_handler)

    # 文件处理器（按时间轮转）
    file_format = logging.Formatter(
        '%(asctime)s [%(pid)s] %(name)s %(levelname)s %(filename)s:%(lineno)d - %(message)s'
    )
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename='logs/app.log',
        when='midnight',  # 每天轮转
        interval=1,
        backupCount=7,    # 保留7天
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(file_format)
    root_logger.addHandler(file_handler)

    # 邮件处理器（自定义）
    email_handler = EmailHandler('admin@example.com')
    email_format = logging.Formatter('''
时间: %(asctime)s
级别: %(levelname)s
日志器: %(name)s
位置: %(filename)s:%(lineno)d (%(funcName)s)
消息: %(message)s
异常: %(exc_text)s
''')
    email_handler.setFormatter(email_format)
    root_logger.addHandler(email_handler)

    # 数据库处理器（自定义）
    db_handler = DatabaseHandler()
    db_handler.setLevel(logging.WARNING)
    root_logger.addHandler(db_handler)

    return root_logger

# 模拟应用程序
def simulate_complex_application():
    """模拟复杂应用程序"""
    logger = logging.getLogger("app.main")

    logger.info("应用程序启动")

    # 模拟不同模块
    db_logger = logging.getLogger("app.database")
    api_logger = logging.getLogger("app.api")

    db_logger.debug("初始化数据库连接池")
    db_logger.info("执行事务: 用户创建")

    api_logger.info("处理请求: POST /api/users")
    api_logger.debug("请求参数: %s", {"name": "Alice", "age": 25})

    # 模拟警告
    import warnings
    warnings.warn("过期的API调用", DeprecationWarning)
    logger.warning("检测到过期的API调用")

    # 模拟错误
    try:
        # 触发错误
        raise ConnectionError("数据库连接失败")
    except ConnectionError as e:
        logger.error("数据库操作失败", exc_info=True)

    # 模拟严重错误
    try:
        raise MemoryError("内存不足")
    except MemoryError as e:
        logger.critical("系统资源不足", exc_info=True)

    logger.info("应用程序关闭")

# 设置并运行
print("=== 高级日志系统演示 ===")
setup_advanced_logging()
simulate_complex_application()

print("\n检查日志文件:")
print("  - logs/app.log: 包含所有日志（每天轮转）")
print("  - 邮件已发送给管理员（模拟）")
print("  - 警告和错误已记录到数据库（模拟）")
```

### 日志最佳实践总结

```python
"""
日志记录最佳实践总结
"""

import logging
import sys

class BestPracticeLogger:
    """
    日志最佳实践示例类
    """

    def __init__(self, name):
        self.logger = logging.getLogger(name)

        # 设置日志级别（从环境变量获取）
        import os
        log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
        self.logger.setLevel(getattr(logging, log_level))

        # 避免重复添加处理器
        if not self.logger.handlers:
            self._setup_handlers()

    def _setup_handlers(self):
        """设置日志处理器"""

        # 格式化器
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - '
            '[%(filename)s:%(lineno)d] - %(message)s'
        )

        # 控制台处理器（仅错误级别以上使用stderr）
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.DEBUG)
        console_handler.addFilter(lambda record: record.levelno < logging.ERROR)
        console_handler.setFormatter(formatter)

        # 错误处理器（使用stderr）
        error_handler = logging.StreamHandler(sys.stderr)
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(formatter)

        self.logger.addHandler(console_handler)
        self.logger.addHandler(error_handler)

    def log_example(self):
        """日志使用示例"""

        # 1. 使用适当的日志级别
        self.logger.debug("详细调试信息")  # 开发时使用
        self.logger.info("用户登录成功")   # 生产环境正常信息
        self.logger.warning("API响应较慢")  # 需要注意但非错误
        self.logger.error("数据库连接失败")  # 错误但程序可能继续运行
        self.logger.critical("系统崩溃")    # 严重错误

        # 2. 包含上下文信息
        user_id = 123
        action = "login"
        self.logger.info(
            "用户操作完成",
            extra={'user_id': user_id, 'action': action}
        )

        # 3. 使用参数化日志（避免字符串拼接开销）
        items = 5
        total = 100
        # 好：使用参数
        self.logger.info("处理了 %d 个项目，总计 %d", items, total)
        # 不好：字符串拼接
        # self.logger.info("处理了 " + str(items) + " 个项目，总计 " + str(total))

        # 4. 记录异常时使用 exc_info
        try:
            result = 10 / 0
        except ZeroDivisionError:
            self.logger.error("除零错误", exc_info=True)  # 自动记录堆栈跟踪

        # 5. 避免敏感信息
        password = "secret123"
        # 不好：记录密码
        # self.logger.info("用户密码: %s", password)
        # 好：只记录必要信息
        self.logger.info("用户认证请求")

        # 6. 结构化日志（用于日志分析）
        import json
        structured_data = {
            'event': 'purchase',
            'amount': 99.99,
            'user_id': 123,
            'timestamp': '2023-01-01T12:00:00Z'
        }
        self.logger.info(
            "用户购买完成",
            extra={'data': json.dumps(structured_data)}
        )

# 使用最佳实践
print("=== 日志最佳实践演示 ===")
practice_logger = BestPracticeLogger("best.practice")
practice_logger.log_example()

print("\n关键要点总结:")
print("1. 使用合适的日志级别")
print("2. 包含足够的上下文信息")
print("3. 使用参数化日志避免性能开销")
print("4. 记录异常时包含堆栈跟踪")
print("5. 避免记录敏感信息")
print("6. 考虑结构化日志以便分析")
print("7. 根据环境配置不同的日志级别")
print("8. 重要错误发送到stderr")
print("9. 避免日志处理器重复添加")
print("10. 定期审查和清理日志")
```

## 总结：构建健壮的Python应用

通过本章的学习，你已经掌握了Python异常处理和调试的核心技能：

### 异常处理的核心要点

1. **理解异常层次结构**：知道不同异常类型的用途
2. **精确捕获异常**：只捕获你能够处理的异常
3. **提供有用的错误信息**：帮助用户和开发者理解问题
4. **使用else和finally**：清理资源，确保代码稳定性
5. **创建自定义异常**：为特定领域问题提供清晰的错误类型

### 调试技巧的关键收获

1. **print调试依然有效**：简单问题的快速解决方案
2. **断言验证假设**：在开发阶段捕获逻辑错误
3. **掌握pdb调试器**：复杂问题的强大工具
4. **善用日志系统**：生产环境的最佳实践

### 日志记录的最佳实践

1. **分级记录**：根据重要性使用不同日志级别
2. **结构化日志**：便于机器解析和分析
3. **避免敏感信息**：保护用户隐私和系统安全
4. **合理配置**：根据不同环境调整日志行为

### 实战建议

1. **开发阶段**：广泛使用断言和调试器
2. **测试阶段**：模拟各种异常情况
3. **生产环境**：配置适当的日志级别和处理器
4. **监控阶段**：分析日志，持续改进错误处理

记住，**优秀的错误处理不是要避免所有错误，而是要优雅地处理不可避免的错误**。通过合理的异常处理和日志记录，你可以构建出既健壮又易于维护的Python应用。

### 继续学习资源

1. [Python官方文档 - 错误和异常](https://docs.python.org/3/tutorial/errors.html)
2. [Python官方文档 - logging模块](https://docs.python.org/3/library/logging.html)
3. [Real Python - Python异常处理指南](https://realpython.com/python-exceptions/)
4. [Python调试技巧合集](https://github.com/Python-Tips/awesome-python-debugging)

现在，你已经具备了构建生产级Python应用所需的错误处理和调试技能。去实践吧，让你的代码在错误面前依然优雅从容！
