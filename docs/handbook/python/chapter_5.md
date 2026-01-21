# 函数与模块：Python编程的模块化艺术

> 函数是编程的乐高积木，模块是组织这些积木的工具箱。掌握函数与模块，你将能够构建任意复杂度的程序，而不会迷失在代码的海洋中。

## 前言：从脚本到工程的飞跃

你是否曾经写过这样的代码：一个超长的脚本文件，重复的代码块到处都是，修改一个地方需要搜索整个文件？或者当你想重用某个功能时，不得不复制粘贴大量代码？

这就是我们需要函数和模块的原因。**函数**让我们能够将代码组织成可重用的块，**模块**让我们能够将这些块组织成逻辑单元。在本章中，你将学习如何从"写脚本"转变为"写程序"。

让我用一个建筑比喻：如果你要建一座大厦，你不会把所有的砖头、水泥、钢筋堆在一起。你会：

- 设计标准部件（函数）
- 将这些部件分类存放（模块）
- 按需取用，组装成建筑

这就是模块化编程的思想。让我们开始学习如何用Python实现这种思想。

## 5.1 函数的定义与调用：代码的乐高积木

### 为什么需要函数？

想象一下，你需要在程序的不同地方计算圆的面积。没有函数时，你可能这样写：

```python
# 没有函数的代码
# 计算圆1的面积
半径1 = 5
面积1 = 3.14159 * 半径1 ** 2
print(f"圆1的面积: {面积1:.2f}")

# 计算圆2的面积
半径2 = 8
面积2 = 3.14159 * 半径2 ** 2
print(f"圆2的面积: {面积2:.2f}")

# 计算圆3的面积
半径3 = 12
面积3 = 3.14159 * 半径3 ** 2
print(f"圆3的面积: {面积3:.2f}")
```

看到问题了吗？重复的代码，如果π的值需要调整，或者公式需要修改，你需要在每个地方都改一遍。

现在看看使用函数的方式：

```python
# 定义函数
def 计算圆面积(半径):
    """计算圆的面积"""
    面积 = 3.14159 * 半径 ** 2
    return 面积

# 使用函数
半径列表 = [5, 8, 12]
for i, 半径 in enumerate(半径列表, 1):
    面积 = 计算圆面积(半径)
    print(f"圆{i}的面积: {面积:.2f}")
```

### 函数的基本结构

```python
def 函数名(参数1, 参数2, ...):
    """文档字符串（可选）描述函数功能"""
    # 函数体
    # 执行操作
    return 返回值  # 可选
```

让我们分解这个结构：

```python
def 欢迎用户(用户名, 年龄=None):
    """
    欢迎用户并显示个性化消息

    参数:
        用户名 (str): 用户的名字
        年龄 (int, optional): 用户的年龄，默认为None

    返回:
        str: 欢迎消息
    """
    if 年龄:
        消息 = f"欢迎，{用户名}！你今年{年龄}岁了。"
    else:
        消息 = f"欢迎，{用户名}！"

    return 消息

# 调用函数
结果1 = 欢迎用户("张三")
结果2 = 欢迎用户("李四", 25)

print(结果1)  # 输出: 欢迎，张三！
print(结果2)  # 输出: 欢迎，李四！你今年25岁了。

# 查看函数的文档字符串
print(欢迎用户.__doc__)
```

### 函数调用的过程

理解函数调用的过程有助于你调试和理解代码：

```python
def 详细演示(a, b):
    """
    演示函数调用过程的详细信息
    """
    print(f"步骤1: 进入函数，参数a={a}, b={b}")
    print(f"步骤2: 计算 a + b = {a} + {b}")
    结果 = a + b
    print(f"步骤3: 准备返回结果 {结果}")
    return 结果

print("步骤0: 调用函数前")
x = 10
y = 20
print(f"  x={x}, y={y}")

print("步骤4: 调用函数")
总和 = 详细演示(x, y)

print(f"步骤5: 函数调用结束，结果={总和}")
```

### 实际应用：计算器函数

```python
def 简单计算器(操作, 数字1, 数字2):
    """
    简单的四则运算计算器

    参数:
        操作 (str): 操作类型，支持 '加', '减', '乘', '除'
        数字1 (float): 第一个数字
        数字2 (float): 第二个数字

    返回:
        float: 计算结果
    """
    操作映射 = {
        '加': lambda a, b: a + b,
        '减': lambda a, b: a - b,
        '乘': lambda a, b: a * b,
        '分': lambda a, b: a / b if b != 0 else "错误：除数不能为零",
        '除': lambda a, b: a / b if b != 0 else "错误：除数不能为零"
    }

    if 操作 not in 操作映射:
        return f"错误：不支持的操作 '{操作}'，支持的操作: {', '.join(操作映射.keys())}"

    # 获取对应的函数并执行
    计算函数 = 操作映射[操作]
    结果 = 计算函数(数字1, 数字2)

    return 结果

# 测试计算器
print("简单计算器测试:")
测试用例 = [
    ('加', 10, 5),      # 10 + 5 = 15
    ('减', 10, 5),      # 10 - 5 = 5
    ('乘', 10, 5),      # 10 × 5 = 50
    ('除', 10, 5),      # 10 ÷ 5 = 2
    ('除', 10, 0),      # 错误
    ('求幂', 2, 3),     # 不支持的操作
]

for 操作, a, b in 测试用例:
    结果 = 简单计算器(操作, a, b)
    print(f"  {a} {操作} {b} = {结果}")
```

### 函数设计的最佳实践

```python
def 设计良好的函数示例():
    """
    展示良好设计的函数应具备的特点

    特点:
    1. 单一职责：一个函数只做一件事
    2. 明确的命名：函数名应清晰描述其功能
    3. 适当的参数：参数数量适中，有默认值
    4. 返回值一致：返回类型一致，或明确说明
    5. 错误处理：处理可能的错误情况
    6. 文档完整：有完整的文档字符串
    """
    pass

# 好 vs 坏 的函数设计对比
def 坏的设计(a, b, c, d, e, f, g, h):
    """参数太多，功能不明确"""
    # 做很多不同的事情
    pass

def 好的设计_计算折扣(原价, 折扣率=0.1, 运费=0):
    """
    计算商品折扣后的价格

    参数:
        原价 (float): 商品原价
        折扣率 (float, optional): 折扣率，默认0.1（9折）
        运费 (float, optional): 运费，默认0

    返回:
        float: 折后总价

    异常:
        ValueError: 如果原价或折扣率无效
    """
    # 参数验证
    if 原价 < 0:
        raise ValueError("原价不能为负数")

    if not 0 <= 折扣率 <= 1:
        raise ValueError("折扣率必须在0-1之间")

    if 运费 < 0:
        raise ValueError("运费不能为负数")

    # 计算逻辑清晰
    折扣金额 = 原价 * 折扣率
    折后价格 = 原价 - 折扣金额
    总价 = 折后价格 + 运费

    return 总价

# 使用良好设计的函数
try:
    总价1 = 好的设计_计算折扣(100)  # 使用默认值
    总价2 = 好的设计_计算折扣(100, 折扣率=0.2, 运费=10)

    print(f"商品原价100，默认9折，免运费: ¥{总价1:.2f}")
    print(f"商品原价100，8折，运费10元: ¥{总价2:.2f}")

    # 测试错误处理
    总价3 = 好的设计_计算折扣(-50)  # 会抛出ValueError
except ValueError as e:
    print(f"错误: {e}")
```

## 5.2 函数参数：位置参数、关键字参数

### 位置参数：按顺序传递

位置参数是最基本的参数传递方式，调用时按定义时的顺序传递值。

```python
def 学生信息(姓名, 年龄, 专业):
    """显示学生信息"""
    return f"姓名: {姓名}, 年龄: {年龄}, 专业: {专业}"

# 必须按顺序传递参数
print(学生信息("张三", 20, "计算机科学"))  # 正确
# print(学生信息(20, "张三", "计算机科学"))  # 错误：参数顺序不对

# 实际应用：坐标计算
def 计算距离(x1, y1, x2, y2):
    """计算两点之间的欧氏距离"""
    距离 = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    return 距离

点A = (0, 0)
点B = (3, 4)
距离 = 计算距离(点A[0], 点A[1], 点B[0], 点B[1])
print(f"点A{点A}和点B{点B}之间的距离: {距离:.2f}")
```

### 关键字参数：按名称传递

关键字参数允许你通过参数名来传递值，这样可以不按顺序传递。

```python
# 使用关键字参数
print(学生信息(年龄=20, 专业="计算机科学", 姓名="张三"))  # 正确，顺序不重要

# 混合使用位置参数和关键字参数
# 位置参数必须在关键字参数之前
print(学生信息("张三", 专业="计算机科学", 年龄=20))  # 正确
# print(学生信息(姓名="张三", 20, "计算机科学"))  # 错误：位置参数不能在关键字参数后

# 实际应用：配置函数
def 创建用户配置(用户名, 邮箱=None, 电话=None, 地址=None, 角色="用户"):
    """创建用户配置，支持多种可选参数"""
    配置 = {
        "用户名": 用户名,
        "邮箱": 邮箱,
        "电话": 电话,
        "地址": 地址,
        "角色": 角色
    }

    # 过滤掉值为None的项
    配置 = {k: v for k, v in 配置.items() if v is not None}

    return 配置

# 使用关键字参数创建配置
配置1 = 创建用户配置("张三", 邮箱="zhangsan@example.com", 角色="管理员")
配置2 = 创建用户配置("李四", 电话="13800138000", 地址="北京市")
配置3 = 创建用户配置("王五")  # 只提供必需参数

print("用户配置示例:")
print(f"  配置1: {配置1}")
print(f"  配置2: {配置2}")
print(f"  配置3: {配置3}")
```

### 强制关键字参数（Python 3.0+）

你可以使用`*`来强制某些参数必须使用关键字参数传递。

```python
def 强制关键字参数示例(姓名, *, 年龄, 城市):
    """
    使用*强制年龄和城市必须作为关键字参数传递

    参数:
        姓名: 位置参数
        年龄: 关键字参数
        城市: 关键字参数
    """
    return f"{姓名}, {年龄}岁, 来自{城市}"

# 正确使用
print(强制关键字参数示例("张三", 年龄=25, 城市="北京"))

# 错误使用（会报错）
# print(强制关键字参数示例("李四", 25, "上海"))  # TypeError: 强制关键字参数示例() missing 2 required keyword-only arguments: '年龄' and '城市'
# print(强制关键字参数示例("王五", 30))  # TypeError: 强制关键字参数示例() missing 1 required keyword-only argument: '城市'

# 实际应用：API请求函数
def 发送API请求(端点, *, 方法="GET", 数据=None, 头部=None, 超时=30):
    """
    模拟发送API请求

    参数:
        端点 (str): API端点URL
        方法 (str): HTTP方法，必须是关键字参数
        数据 (dict): 请求数据
        头部 (dict): 请求头
        超时 (int): 超时时间（秒）

    返回:
        dict: 响应数据
    """
    # 模拟API请求
    请求信息 = {
        "端点": 端点,
        "方法": 方法,
        "数据": 数据,
        "头部": 头部 or {},
        "超时": 超时,
        "时间戳": "2023-01-01T12:00:00Z"  # 模拟时间戳
    }

    # 模拟响应
    响应 = {
        "状态码": 200,
        "数据": {"消息": "请求成功"},
        "请求信息": 请求信息
    }

    return 响应

# 使用强制关键字参数
print("API请求示例:")
响应1 = 发送API请求("/api/users", 方法="GET")
响应2 = 发送API请求("/api/users", 方法="POST", 数据={"姓名": "张三"})
响应3 = 发送API请求("/api/products", 方法="GET", 头部={"授权": "Bearer token"}, 超时=60)

print(f"  响应1: {响应1['状态码']} - {响应1['数据']['消息']}")
print(f"  响应2: {响应2['状态码']} - 数据: {响应2['数据']}")
print(f"  响应3: 超时设置为{响应3['请求信息']['超时']}秒")
```

## 5.3 函数参数：默认参数、可变参数

### 默认参数：提供默认值

默认参数在定义函数时指定默认值，调用时可以不传递这些参数。

```python
def 发送邮件(收件人, 主题, 正文="", 抄送=None, 密送=None, 优先级="普通"):
    """
    发送邮件函数

    参数:
        收件人 (str): 收件人邮箱
        主题 (str): 邮件主题
        正文 (str, optional): 邮件正文，默认为空
        抄送 (list, optional): 抄送列表，默认为None
        密送 (list, optional): 密送列表，默认为None
        优先级 (str, optional): 邮件优先级，默认为"普通"

    返回:
        dict: 发送结果
    """
    # 构建邮件
    邮件 = {
        "收件人": 收件人,
        "主题": 主题,
        "正文": 正文,
        "抄送": 抄送 or [],
        "密送": 密送 or [],
        "优先级": 优先级,
        "状态": "已发送",
        "时间": "2023-01-01 12:00:00"
    }

    return 邮件

# 使用默认参数
邮件1 = 发送邮件("user@example.com", "会议通知")
邮件2 = 发送邮件("user@example.com", "重要通知", 正文="请准时参加", 优先级="高")
邮件3 = 发送邮件("user@example.com", "项目更新",
               抄送=["manager@example.com"],
               密送=["boss@example.com"])

print("邮件发送示例:")
for i, 邮件 in enumerate([邮件1, 邮件2, 邮件3], 1):
    print(f"  邮件{i}: 主题={邮件['主题']}, 优先级={邮件['优先级']}, 抄送人数={len(邮件['抄送'])}")
```

### 默认参数的陷阱：可变对象作为默认值

```python
# 错误示例：使用可变对象作为默认值
def 错误示例(数据=[]):  # 危险！列表是可变对象
    """错误的函数：使用可变对象作为默认参数"""
    数据.append("新元素")
    return 数据

# 测试
print("错误示例测试:")
结果1 = 错误示例()
结果2 = 错误示例()
结果3 = 错误示例()

print(f"  第一次调用: {结果1}")
print(f"  第二次调用: {结果2}")  # 问题：包含了第一次的结果！
print(f"  第三次调用: {结果3}")  # 问题：包含了前两次的结果！

# 正确做法：使用None作为默认值
def 正确示例(数据=None):
    """正确的函数：使用None作为默认参数"""
    if 数据 is None:
        数据 = []  # 每次调用创建新列表
    数据.append("新元素")
    return 数据

print("\n正确示例测试:")
结果1 = 正确示例()
结果2 = 正确示例()
结果3 = 正确示例()

print(f"  第一次调用: {结果1}")
print(f"  第二次调用: {结果2}")  # 正确：只包含自己的元素
print(f"  第三次调用: {结果3}")  # 正确：只包含自己的元素
```

### 可变位置参数：\*args

`*args`允许函数接受任意数量的位置参数。

```python
def 计算平均值(*args):
    """
    计算任意数量数字的平均值

    参数:
        *args: 任意数量的数字

    返回:
        float: 平均值
    """
    if not args:  # 如果没有参数
        return 0

    总和 = sum(args)
    平均值 = 总和 / len(args)
    return 平均值

print("计算平均值测试:")
print(f"  平均值(1, 2, 3, 4, 5): {计算平均值(1, 2, 3, 4, 5):.2f}")
print(f"  平均值(10, 20, 30): {计算平均值(10, 20, 30):.2f}")
print(f"  平均值(): {计算平均值():.2f}")

# 实际应用：日志函数
def 记录日志(级别, *消息):
    """
    记录日志，支持多条消息

    参数:
        级别 (str): 日志级别（DEBUG, INFO, WARNING, ERROR）
        *消息: 多条日志消息
    """
    时间戳 = "2023-01-01 12:00:00"

    for 消息内容 in 消息:
        日志行 = f"[{时间戳}] [{级别}] {消息内容}"
        print(日志行)

print("\n日志记录示例:")
记录日志("INFO", "系统启动", "初始化完成", "准备就绪")
记录日志("ERROR", "数据库连接失败", "请检查网络配置")

# *args与其他参数结合
def 格式化输出(标题, *内容, 分隔符=" ", 结束符="\n"):
    """
    格式化输出内容

    参数:
        标题 (str): 输出标题
        *内容: 要输出的内容
        分隔符 (str): 内容之间的分隔符
        结束符 (str): 行结束符
    """
    print(f"{标题}: ", end="")
    print(*内容, sep=分隔符, end=结束符)

print("\n格式化输出示例:")
格式化输出("购物清单", "苹果", "香蕉", "橙子", "葡萄")
格式化输出("成绩", 85, 92, 78, 88, 分隔符=", ", 结束符="\n---\n")
```

### 可变关键字参数：\*\*kwargs

`**kwargs`允许函数接受任意数量的关键字参数。

```python
def 创建配置(**kwargs):
    """
    从关键字参数创建配置字典

    参数:
        **kwargs: 任意数量的关键字参数

    返回:
        dict: 配置字典
    """
    # 添加默认配置
    默认配置 = {
        "调试模式": False,
        "日志级别": "INFO",
        "超时时间": 30
    }

    # 更新用户提供的配置
    配置 = 默认配置.copy()
    配置.update(kwargs)

    return 配置

print("创建配置测试:")
配置1 = 创建配置()
配置2 = 创建配置(调试模式=True, 数据库="mysql")
配置3 = 创建配置(日志级别="DEBUG", 端口=8080, 主机="localhost")

print(f"  默认配置: {配置1}")
print(f"  调试配置: {配置2}")
print(f"  开发配置: {配置3}")

# 实际应用：HTML标签生成器
def 创建HTML标签(标签名, 内容="", **属性):
    """
    创建HTML标签

    参数:
        标签名 (str): HTML标签名
        内容 (str): 标签内容
        **属性: HTML属性

    返回:
        str: HTML字符串
    """
    # 构建属性字符串
    属性字符串 = ""
    for 属性名, 属性值 in 属性.items():
        属性字符串 += f' {属性名}="{属性值}"'

    # 构建HTML
    html = f'<{标签名}{属性_string}>{内容}</{标签名}>'
    return html

print("\nHTML标签生成示例:")
div标签 = 创建HTML标签("div", "这是一个div", class_="container", id="main")
a标签 = 创建HTML标签("a", "点击这里", href="https://example.com", target="_blank")
img标签 = 创建HTML标签("img", "", src="image.jpg", alt="图片", width=100, height=100)

print(f"  div标签: {div标签}")
print(f"  a标签: {a标签}")
print(f"  img标签: {img标签}")
```

### 参数组合：完整的参数语法

```python
def 完整的参数示例(必需1, 必需2, *args, 默认1="默认值1", 默认2="默认值2", **kwargs):
    """
    展示完整的参数语法

    参数顺序:
    1. 必需参数
    2. 可变位置参数 (*args)
    3. 默认参数
    4. 可变关键字参数 (**kwargs)
    """
    结果 = {
        "必需参数": [必需1, 必需2],
        "可变位置参数": args,
        "默认参数": {"默认1": 默认1, "默认2": 默认2},
        "可变关键字参数": kwargs
    }

    return 结果

print("完整参数语法示例:")
结果1 = 完整的参数示例("值1", "值2")
结果2 = 完整的参数示例("值1", "值2", "额外1", "额外2")
结果3 = 完整的参数示例("值1", "值2", "额外1", 默认1="新值1", 自定义="自定义值")
结果4 = 完整的参数示例("值1", "值2", 默认2="新值2", 选项1="选项值1", 选项2="选项值2")

for i, 结果 in enumerate([结果1, 结果2, 结果3, 结果4], 1):
    print(f"\n示例{i}:")
    for 键, 值 in 结果.items():
        print(f"  {键}: {值}")
```

## 5.4 返回值与多返回值

### 基本返回值

```python
def 检查数字(数字):
    """检查数字并返回描述"""
    if 数字 > 0:
        return "正数"
    elif 数字 < 0:
        return "负数"
    else:
        return "零"

# 使用返回值
结果 = 检查数字(10)
print(f"10是{结果}")  # 输出: 10是正数

# 直接使用返回值
print(f"-5是{检查数字(-5)}")  # 输出: -5是负数
print(f"0是{检查数字(0)}")    # 输出: 0是零
```

### 多个返回值（实际上返回元组）

```python
def 获取统计信息(数字列表):
    """
    计算数字列表的统计信息

    返回:
        tuple: (最小值, 最大值, 平均值, 总和)
    """
    if not 数字列表:
        return None, None, None, 0

    最小值 = min(数字列表)
    最大值 = max(数字列表)
    总和 = sum(数字列表)
    平均值 = 总和 / len(数字列表)

    return 最小值, 最大值, 平均值, 总和

# 接收多个返回值
数字列表 = [12, 45, 23, 67, 34, 89]
最小值, 最大值, 平均值, 总和 = 获取统计信息(数字列表)

print(f"数字列表: {数字列表}")
print(f"最小值: {最小值}")
print(f"最大值: {最大值}")
print(f"平均值: {平均值:.2f}")
print(f"总和: {总和}")

# 实际上返回的是元组
结果 = 获取统计信息([1, 2, 3, 4, 5])
print(f"\n返回值的类型: {type(结果)}")  # <class 'tuple'>
print(f"返回值: {结果}")  # (1, 5, 3.0, 15)
```

### 返回字典：更清晰的多个值

```python
def 获取详细统计信息(数字列表):
    """
    计算数字列表的详细统计信息

    返回:
        dict: 包含各种统计信息的字典
    """
    if not 数字列表:
        return {}

    统计 = {
        "数量": len(数字列表),
        "总和": sum(数字列表),
        "最小值": min(数字列表),
        "最大值": max(数字列表),
        "平均值": sum(数字列表) / len(数字列表),
        "中位数": sorted(数字列表)[len(数字列表) // 2],
        "范围": max(数字列表) - min(数字列表)
    }

    # 计算标准差
    平均值 = 统计["平均值"]
    方差 = sum((x - 平均值) ** 2 for x in 数字列表) / len(数字列表)
    统计["标准差"] = 方差 ** 0.5

    return 统计

# 使用字典返回值
数字列表 = [12, 45, 23, 67, 34, 89, 56, 21]
统计信息 = 获取详细统计信息(数字列表)

print("详细统计信息:")
for 键, 值 in 统计信息.items():
    if isinstance(值, float):
        print(f"  {键}: {值:.2f}")
    else:
        print(f"  {键}: {值}")
```

### 返回函数：高阶函数

```python
def 创建计算器(操作):
    """
    创建指定操作的计算函数

    参数:
        操作 (str): 操作类型 ('加', '减', '乘', '除')

    返回:
        function: 计算函数
    """
    if 操作 == '加':
        def 计算(a, b):
            return a + b
    elif 操作 == '减':
        def 计算(a, b):
            return a - b
    elif 操作 == '乘':
        def 计算(a, b):
            return a * b
    elif 操作 == '分':
        def 计算(a, b):
            return a / b if b != 0 else "错误：除数不能为零"
    else:
        def 计算(a, b):
            return f"错误：不支持的操作 '{操作}'"

    return 计算

# 创建和使用计算函数
加法器 = 创建计算器('加')
减法器 = 创建计算器('减')
乘法器 = 创建计算器('乘')
除法器 = 创建计算器('分')

print("高阶函数示例:")
print(f"  10 + 5 = {加法器(10, 5)}")
print(f"  10 - 5 = {减法器(10, 5)}")
print(f"  10 × 5 = {乘法器(10, 5)}")
print(f"  10 ÷ 5 = {除法器(10, 5)}")
print(f"  10 ÷ 0 = {除法器(10, 0)}")

# 实际应用：创建验证器
def 创建验证器(规则):
    """
    创建数据验证器

    参数:
        规则 (dict): 验证规则

    返回:
        function: 验证函数
    """
    def 验证(数据):
        错误 = []

        for 字段, 规则列表 in 规则.items():
            值 = 数据.get(字段)

            for 规则类型, 规则值 in 规则列表.items():
                if 规则类型 == "必填" and 规则值 and not 值:
                    错误.append(f"{字段}不能为空")
                elif 规则类型 == "最小长度" and 值 and len(str(值)) < 规则值:
                    错误.append(f"{字段}长度不能少于{规则值}个字符")
                elif 规则类型 == "最大长度" and 值 and len(str(值)) > 规则值:
                    错误.append(f"{字段}长度不能超过{规则值}个字符")
                elif 规则类型 == "类型" and 值 and not isinstance(值, 规则值):
                    错误.append(f"{字段}必须是{规则值.__name__}类型")

        return len(错误) == 0, 错误

    return 验证

# 定义验证规则
用户规则 = {
    "用户名": {"必填": True, "最小长度": 3, "最大长度": 20},
    "邮箱": {"必填": True, "类型": str},
    "年龄": {"类型": int}
}

# 创建验证器
验证用户 = 创建验证器(用户规则)

# 测试验证
测试数据 = [
    {"用户名": "张三", "邮箱": "zhangsan@example.com", "年龄": 25},
    {"用户名": "ab", "邮箱": "ab@example.com", "年龄": "二十五"},  # 错误：用户名太短，年龄类型错误
    {"邮箱": "test@example.com"},  # 错误：缺少用户名
]

print("\n数据验证示例:")
for i, 数据 in enumerate(测试数据, 1):
    有效, 错误 = 验证用户(数据)
    状态 = "✅ 有效" if 有效 else "❌ 无效"
    print(f"  数据{i}: {状态}")
    if 错误:
        print(f"    错误: {', '.join(错误)}")
```

### 无返回值（返回None）

```python
def 处理数据(数据列表):
    """处理数据列表（原地修改）"""
    if not 数据列表:
        return  # 隐式返回None

    # 原地修改列表
    for i in range(len(数据列表)):
        if 数据列表[i] < 0:
            数据列表[i] = 0

# 无返回值的函数
数字列表 = [1, -2, 3, -4, 5]
print(f"处理前: {数字列表}")

结果 = 处理数据(数字列表)
print(f"处理后: {数字列表}")
print(f"函数返回值: {结果}")  # None
print(f"返回值类型: {type(结果)}")  # <class 'NoneType'>

# 显式返回None
def 无操作():
    """什么都不做，显式返回None"""
    return None

print(f"无操作函数的返回值: {无操作()}")
```

## 5.5 变量作用域：局部与全局

### 局部变量

```python
def 演示局部变量():
    """演示局部变量的作用域"""
    局部变量 = "我在函数内部"
    print(f"函数内部: {局部变量}")

    # 嵌套函数中的局部变量
    def 内部函数():
        内部变量 = "我在内部函数中"
        print(f"内部函数: {内部变量}")
        # 可以访问外部函数的局部变量
        print(f"内部函数访问外部变量: {局部变量}")

    内部函数()

    # 不能访问内部函数的变量
    # print(内部变量)  # 错误：NameError

演示局部变量()

# 不能在函数外部访问局部变量
# print(局部变量)  # 错误：NameError
```

### 全局变量

```python
# 定义全局变量
全局变量 = "我是全局变量"

def 访问全局变量():
    """访问全局变量"""
    print(f"函数内部访问: {全局变量}")

访问全局变量()
print(f"函数外部访问: {全局变量}")

# 修改全局变量的陷阱
计数 = 0

def 错误修改():
    """尝试修改全局变量（会报错）"""
    # 这会创建一个新的局部变量，而不是修改全局变量
    计数 = 计数 + 1  # 错误：UnboundLocalError
    print(f"计数: {计数}")

# 错误修改()  # 会报错

def 正确修改():
    """正确修改全局变量"""
    global 计数  # 声明使用全局变量
    计数 += 1
    print(f"计数: {计数}")

print("\n全局变量修改示例:")
正确修改()  # 计数: 1
正确修改()  # 计数: 2
正确修改()  # 计数: 3
print(f"最终计数: {计数}")
```

### nonlocal变量：修改嵌套作用域的变量

```python
def 外部函数():
    """外部函数，包含嵌套函数"""
    外部变量 = "外部"

    def 内部函数():
        """内部函数，修改外部函数的变量"""
        nonlocal 外部变量  # 声明使用外部函数的变量
        外部变量 = "已修改"
        print(f"内部函数: {外部变量}")

    print(f"调用内部函数前: {外部变量}")
    内部函数()
    print(f"调用内部函数后: {外部变量}")

print("nonlocal变量示例:")
外部函数()
```

### 作用域链：LEGB规则

Python使用LEGB规则查找变量：

- **L**ocal：局部作用域
- **E**nclosing：嵌套函数的作用域
- **G**lobal：全局作用域
- **B**uilt-in：内置作用域

```python
# 演示LEGB规则
全局变量 = "全局"

def 外部():
    外部变量 = "外部"

    def 内部():
        内部变量 = "内部"

        print("LEGB查找演示:")
        print(f"  1. 局部 (L): {内部变量}")  # 局部变量
        print(f"  2. 嵌套 (E): {外部变量}")  # 嵌套作用域变量
        print(f"  3. 全局 (G): {全局变量}")  # 全局变量
        print(f"  4. 内置 (B): {len([1,2,3])}")  # 内置函数

        # 如果所有作用域都没有找到，会报错
        # print(不存在的变量)  # NameError

    内部()

外部()

# 实际应用：计数器工厂
def 创建计数器(初始值=0):
    """创建计数器函数"""
    计数 = 初始值  # 闭包变量

    def 计数器():
        nonlocal 计数
        计数 += 1
        return 计数

    def 重置(新值=0):
        nonlocal 计数
        计数 = 新值
        return 计数

    def 获取当前值():
        return 计数

    # 返回多个函数
    return 计数器, 重置, 获取当前值

print("\n闭包示例：计数器工厂")
计数器1, 重置1, 获取1 = 创建计数器()
计数器2, 重置2, 获取2 = 创建计数器(100)

print("计数器1:")
print(f"  计数: {计数器1()}")  # 1
print(f"  计数: {计数器1()}")  # 2
print(f"  当前值: {获取1()}")  # 2

print("计数器2:")
print(f"  计数: {计数器2()}")  # 101
print(f"  重置为50: {重置2(50)}")  # 50
print(f"  计数: {计数器2()}")  # 51

# 证明它们是独立的
print(f"计数器1的当前值: {获取1()}")  # 2
print(f"计数器2的当前值: {获取2()}")  # 51
```

### 全局变量的最佳实践

```python
# 不推荐的全局变量使用
用户数 = 0  # 全局变量

def 添加用户():
    global 用户数
    用户数 += 1

def 删除用户():
    global 用户数
    用户数 -= 1

def 获取用户数():
    return 用户数

# 推荐的做法：使用类或模块封装
class 用户管理器:
    """管理用户的类"""

    def __init__(self):
        self._用户数 = 0
        self._用户列表 = []

    def 添加用户(self, 用户名):
        """添加用户"""
        self._用户数 += 1
        self._用户列表.append(用户名)
        return self._用户数

    def 删除用户(self, 用户名):
        """删除用户"""
        if 用户名 in self._用户列表:
            self._用户数 -= 1
            self._用户列表.remove(用户名)
        return self._用户数

    def 获取用户数(self):
        """获取用户数量"""
        return self._用户数

    def 获取用户列表(self):
        """获取用户列表"""
        return self._用户列表.copy()  # 返回副本，避免外部修改

print("\n推荐的做法：使用类封装状态")
管理器 = 用户管理器()
print(f"添加用户张三: 当前用户数={管理器.添加用户('张三')}")
print(f"添加用户李四: 当前用户数={管理器.添加用户('李四')}")
print(f"删除用户张三: 当前用户数={管理器.删除用户('张三')}")
print(f"用户列表: {管理器.获取用户列表()}")
```

## 5.6 匿名函数：lambda表达式

### 基础lambda表达式

```python
# 基本语法：lambda 参数: 表达式

# 普通函数
def 加(a, b):
    return a + b

# lambda表达式
加_lambda = lambda a, b: a + b

print("lambda表达式示例:")
print(f"普通函数 3 + 5 = {加(3, 5)}")
print(f"lambda表达式 3 + 5 = {加_lambda(3, 5)}")

# 直接使用lambda
print(f"直接使用: {(lambda x: x ** 2)(5)}")  # 25

# 多参数lambda
平均值 = lambda *args: sum(args) / len(args) if args else 0
print(f"平均值(1,2,3,4,5) = {平均值(1, 2, 3, 4, 5):.2f}")
```

### lambda与高阶函数

```python
# map()函数：对序列中每个元素应用函数
数字列表 = [1, 2, 3, 4, 5]

# 使用普通函数
def 平方(x):
    return x ** 2

平方列表1 = list(map(平方, 数字列表))

# 使用lambda
平方列表2 = list(map(lambda x: x ** 2, 数字列表))

print(f"数字列表: {数字列表}")
print(f"使用普通函数: {平方列表1}")
print(f"使用lambda: {平方列表2}")

# filter()函数：过滤序列
# 过滤偶数
偶数列表 = list(filter(lambda x: x % 2 == 0, 数字列表))
print(f"偶数: {偶数列表}")

# 过滤大于3的数
大于3的列表 = list(filter(lambda x: x > 3, 数字列表))
print(f"大于3的数: {大于3的列表}")

# sorted()函数：排序
学生列表 = [
    ("张三", 85),
    ("李四", 92),
    ("王五", 78),
    ("赵六", 88)
]

# 按成绩排序
按成绩排序 = sorted(学生列表, key=lambda s: s[1], reverse=True)
print("\n按成绩降序排序:")
for 学生, 成绩 in 按成绩排序:
    print(f"  {学生}: {成绩}分")

# 按姓名排序
按姓名排序 = sorted(学生列表, key=lambda s: s[0])
print("\n按姓名排序:")
for 学生, 成绩 in 按姓名排序:
    print(f"  {学生}: {成绩}分")
```

### 实际应用：数据处理

```python
# 数据转换
数据 = [
    {"姓名": "张三", "年龄": 25, "城市": "北京"},
    {"姓名": "李四", "年龄": 30, "城市": "上海"},
    {"姓名": "王五", "年龄": 28, "城市": "广州"},
    {"姓名": "赵六", "年龄": 35, "城市": "深圳"}
]

# 提取姓名列表
姓名列表 = list(map(lambda x: x["姓名"], 数据))
print(f"姓名列表: {姓名列表}")

# 过滤年龄大于30的人
年龄大于30 = list(filter(lambda x: x["年龄"] > 30, 数据))
print(f"年龄大于30的人: {年龄大于30}")

# 按年龄排序
按年龄排序 = sorted(数据, key=lambda x: x["年龄"])
print("\n按年龄排序:")
for 人 in 按年龄排序:
    print(f"  {人['姓名']}: {人['年龄']}岁, {人['城市']}")

# reduce()函数：累积计算
from functools import reduce

数字 = [1, 2, 3, 4, 5]

# 计算乘积
乘积 = reduce(lambda x, y: x * y, 数字)
print(f"\n数字列表: {数字}")
print(f"乘积: {乘积}")  # 1*2*3*4*5 = 120

# 计算阶乘
阶乘 = reduce(lambda x, y: x * y, range(1, 6))
print(f"5的阶乘: {阶乘}")  # 120

# 连接字符串
字符串列表 = ["Python", "是", "一门", "强大", "的", "语言"]
连接结果 = reduce(lambda x, y: x + y, 字符串列表)
print(f"连接字符串: {连接结果}")
```

### lambda的限制与替代方案

```python
# lambda的限制：只能包含单个表达式
# 不能包含语句（如赋值、循环、条件判断等）

# 这是可以的
简单lambda = lambda x: x * 2 if x > 0 else x

# 这是不可以的（会报语法错误）
# 复杂lambda = lambda x:
#     if x > 0:
#         return x * 2
#     else:
#         return x

# 替代方案：使用普通函数或partial函数
from functools import partial

# 使用partial创建专用函数
def 幂运算(基数, 指数):
    """计算幂"""
    return 基数 ** 指数

# 创建平方函数
平方 = partial(幂运算, 指数=2)
# 创建立方函数
立方 = partial(幂运算, 指数=3)

print("\n使用partial替代lambda:")
print(f"2的平方: {平方(2)}")  # 4
print(f"2的立方: {立方(2)}")  # 8

# 多个参数的partial
def 发送请求(方法, url, 数据=None, 头部=None):
    """模拟发送HTTP请求"""
    return f"{method} {url} 数据={数据} 头部={头部}"

# 创建专用函数
获取 = partial(发送请求, "GET")
发布 = partial(发送请求, "POST")

print(f"\nGET请求: {获取('https://api.example.com/users')}")
print(f"POST请求: {发布('https://api.example.com/users', 数据={'name': '张三'})}")

# 当lambda变得复杂时，使用普通函数
def 复杂操作(x):
    """复杂的操作，不适合用lambda"""
    if x < 0:
        return "负数"
    elif x == 0:
        return "零"
    elif x < 10:
        return "个位数"
    elif x < 100:
        return "两位数"
    else:
        return "大数"

# 使用普通函数而不是复杂的lambda
结果 = list(map(复杂操作, [-5, 0, 3, 25, 150]))
print(f"\n复杂操作的结果: {结果}")
```

## 5.7 模块的导入与使用

### 导入整个模块

```python
# 导入整个math模块
import math

print("math模块使用示例:")
print(f"π的值: {math.pi}")
print(f"e的值: {math.e}")
print(f"平方根 √16 = {math.sqrt(16)}")
print(f"正弦 sin(π/2) = {math.sin(math.pi/2):.2f}")
print(f"对数 log(100) = {math.log10(100):.2f}")

# 导入datetime模块处理日期时间
import datetime

现在 = datetime.datetime.now()
print(f"\n当前时间: {现在}")
print(f"年份: {现在.year}")
print(f"月份: {现在.month}")
print(f"日: {现在.day}")
print(f"星期: {现在.weekday()}")  # 0-6，0表示星期一

# 创建特定日期
特定日期 = datetime.datetime(2023, 12, 25, 10, 30, 0)
print(f"圣诞节: {特定日期}")
```

### 导入特定功能

```python
# 从模块导入特定函数
from math import pi, sqrt, sin, cos

print("从math导入特定函数:")
print(f"π = {pi}")
print(f"√25 = {sqrt(25)}")
print(f"sin(π/2) = {sin(pi/2):.2f}")

# 导入所有功能（不推荐）
# from math import *
# 这会导入所有函数，但可能导致命名冲突

# 导入并重命名
from datetime import datetime as dt
from math import sqrt as 平方根

print(f"\n使用别名:")
print(f"当前时间: {dt.now()}")
print(f"36的平方根: {平方根(36)}")
```

### 导入子模块

```python
# 导入标准库中的子模块
import urllib.request
import urllib.parse
import urllib.error

# 使用urllib模块
print("urllib模块示例:")

# 解析URL
url = "https://www.example.com/path?name=张三&age=25"
解析结果 = urllib.parse.urlparse(url)
print(f"URL解析:")
print(f"  协议: {解析结果.scheme}")
print(f"  域名: {解析结果.netloc}")
print(f"  路径: {解析结果.path}")
print(f"  查询: {解析结果.query}")

# 编码查询参数
参数 = {"name": "张三", "age": 25, "city": "北京"}
编码参数 = urllib.parse.urlencode(参数)
print(f"\n编码参数: {编码参数}")

# 解码查询参数
解码参数 = urllib.parse.parse_qs(编码参数)
print(f"解码参数: {解码参数}")
```

### 第三方模块

```python
# 假设已经安装了requests模块
# pip install requests

try:
    import requests

    print("requests模块示例:")

    # 发送GET请求
    响应 = requests.get("https://httpbin.org/get")
    print(f"状态码: {响应.status_code}")
    print(f"响应内容长度: {len(响应.text)} 字符")

    # 发送POST请求
    数据 = {"name": "张三", "age": 25}
    响应 = requests.post("https://httpbin.org/post", data=数据)
    print(f"POST响应状态码: {响应.status_code}")

except ImportError:
    print("requests模块未安装，请运行: pip install requests")
    print("这里使用模拟数据演示:")

    # 模拟响应
    class MockResponse:
        status_code = 200
        text = '{"message": "模拟响应"}'

    响应 = MockResponse()
    print(f"模拟状态码: {响应.status_code}")
```

### 模块搜索路径

```python
import sys

print("Python模块搜索路径:")
for i, 路径 in enumerate(sys.path, 1):
    print(f"  {i:2}. {路径}")

# 添加自定义路径
import os
自定义路径 = os.path.join(os.getcwd(), "my_modules")
sys.path.append(自定义路径)

print(f"\n添加自定义路径: {自定义路径}")
print(f"现在sys.path包含{len(sys.path)}个路径")

# 查看已导入的模块
print("\n已导入的模块:")
for 模块名 in sorted(sys.modules.keys()):
    if not 模块名.startswith('_') and len(模块名) < 20:
        print(f"  {模块名}")
```

### 重新加载模块

```python
# 导入importlib模块
import importlib
import time

# 假设有一个模块需要重新加载
# 先创建一个简单的模块
模块代码 = '''
def 问候():
    return "初始版本"
'''

# 写入文件
with open('my_module.py', 'w', encoding='utf-8') as f:
    f.write(模块代码)

# 导入模块
import my_module
print(f"第一次导入: {my_module.问候()}")

# 修改模块
模块代码 = '''
def 问候():
    return "更新后的版本"
'''

# 重新写入
time.sleep(1)  # 等待一下，确保文件时间戳变化
with open('my_module.py', 'w', encoding='utf-8') as f:
    f.write(模块代码)

# 重新加载模块
importlib.reload(my_module)
print(f"重新加载后: {my_module.问候()}")

# 清理
import os
if os.path.exists('my_module.py'):
    os.remove('my_module.py')
```

## 5.8 自定义模块与包

### 创建简单模块

```python
# 创建文件: calculator.py
"""
calculator.py - 简单的计算器模块
"""

def 加(a, b):
    """返回两个数的和"""
    return a + b

def 减(a, b):
    """返回两个数的差"""
    return a - b

def 乘(a, b):
    """返回两个数的积"""
    return a * b

def 除(a, b):
    """返回两个数的商，处理除零错误"""
    if b == 0:
        raise ValueError("除数不能为零")
    return a / b

def 计算器(操作, a, b):
    """
    计算器函数，支持四种基本运算

    参数:
        操作 (str): 操作类型 ('加', '减', '乘', '除')
        a (float): 第一个数
        b (float): 第二个数

    返回:
        float: 计算结果
    """
    操作映射 = {
        '加': 加,
        '减': 减,
        '乘': 乘,
        '分': 除,
        '除': 除
    }

    if 操作 not in 操作映射:
        raise ValueError(f"不支持的操作: {操作}")

    计算函数 = 操作映射[操作]
    return 计算函数(a, b)

# 模块测试代码
if __name__ == "__main__":
    # 当直接运行此文件时执行
    print("计算器模块测试:")
    print(f"  10 + 5 = {加(10, 5)}")
    print(f"  10 - 5 = {减(10, 5)}")
    print(f"  10 × 5 = {乘(10, 5)}")
    print(f"  10 ÷ 5 = {除(10, 5)}")
```

### 使用自定义模块

```python
# 假设calculator.py在同一目录下
import calculator

print("使用自定义计算器模块:")
print(f"  8 + 3 = {calculator.加(8, 3)}")
print(f"  8 - 3 = {calculator.减(8, 3)}")

# 使用计算器函数
try:
    结果 = calculator.计算器('乘', 6, 7)
    print(f"  6 × 7 = {结果}")

    结果 = calculator.计算器('除', 20, 4)
    print(f"  20 ÷ 4 = {结果}")

    # 测试错误处理
    结果 = calculator.计算器('除', 10, 0)
except ValueError as e:
    print(f"  错误: {e}")

# 查看模块信息
print(f"\n模块名称: {calculator.__name__}")
print(f"模块文件: {calculator.__file__}")
print(f"模块文档: {calculator.__doc__}")
```

### 创建包

包是包含多个模块的目录，必须包含一个`__init__.py`文件。

```
my_package/
├── __init__.py
├── math_utils.py
├── string_utils.py
└── file_utils.py
```

#### 创建包文件

```python
# my_package/__init__.py
"""
my_package - 实用工具包
"""

# 版本信息
__version__ = "1.0.0"
__author__ = "张三"
__email__ = "zhangsan@example.com"

# 导入包中的模块，使其可以从包级别访问
from .math_utils import *
from .string_utils import *
from .file_utils import *

# 包级别函数
def 包信息():
    """返回包信息"""
    return f"{__name__} 版本 {__version__} by {__author__}"
```

```python
# my_package/math_utils.py
"""数学工具函数"""

def 平均值(数字列表):
    """计算平均值"""
    if not 数字列表:
        return 0
    return sum(数字列表) / len(数字列表)

def 标准差(数字列表):
    """计算标准差"""
    if len(数字列表) < 2:
        return 0

    平均 = 平均值(数字列表)
    方差 = sum((x - 平均) ** 2 for x in 数字列表) / len(数字列表)
    return 方差 ** 0.5

def 斐波那契(n):
    """生成斐波那契数列前n项"""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]

    序列 = [0, 1]
    for _ in range(2, n):
        序列.append(序列[-1] + 序列[-2])

    return 序列
```

```python
# my_package/string_utils.py
"""字符串工具函数"""

def 反转字符串(字符串):
    """反转字符串"""
    return 字符串[::-1]

def 统计词频(文本):
    """统计文本中单词的频率"""
    单词列表 = 文本.lower().split()
    词频 = {}

    for 单词 in 单词列表:
        词频[单词] = 词频.get(单词, 0) + 1

    return 词频

def 格式化姓名(姓, 名, 格式="中文"):
    """格式化姓名"""
    if 格式 == "中文":
        return f"{姓}{名}"
    elif 格式 == "英文":
        return f"{名} {姓}"
    else:
        return f"{姓}, {名}"
```

```python
# my_package/file_utils.py
"""文件工具函数"""

import os

def 读取文件(文件路径, 编码="utf-8"):
    """读取文件内容"""
    try:
        with open(文件路径, 'r', encoding=编码) as 文件:
            return 文件.read()
    except FileNotFoundError:
        return None

def 写入文件(文件路径, 内容, 编码="utf-8"):
    """写入文件内容"""
    with open(文件路径, 'w', encoding=编码) as 文件:
        文件.write(内容)

    return True

def 获取文件信息(文件路径):
    """获取文件信息"""
    if not os.path.exists(文件路径):
        return None

    信息 = {
        "路径": 文件路径,
        "大小": os.path.getsize(文件路径),
        "修改时间": os.path.getmtime(文件路径),
        "是否文件": os.path.isfile(文件路径),
        "是否目录": os.path.isdir(文件路径)
    }

    return 信息
```

### 使用自定义包

```python
# 使用自定义包
import my_package

print("使用自定义包:")
print(my_package.包信息())

# 使用数学工具
数字 = [12, 45, 23, 67, 34]
print(f"\n数学工具:")
print(f"  数字列表: {数字}")
print(f"  平均值: {my_package.平均值(数字):.2f}")
print(f"  标准差: {my_package.标准差(数字):.2f}")
print(f"  斐波那契(10): {my_package.斐波那契(10)}")

# 使用字符串工具
文本 = "Python 是 一门 强大 的 编程 语言 Python 很 流行"
print(f"\n字符串工具:")
print(f"  原始文本: {文本}")
print(f"  反转: {my_package.反转字符串('Python')}")
print(f"  词频统计: {my_package.统计词频(文本)}")
print(f"  姓名格式化: {my_package.格式化姓名('张', '三')}")
print(f"  英文格式: {my_package.格式化姓名('Zhang', 'San', 格式='英文')}")

# 使用文件工具（模拟）
print(f"\n文件工具:")
文件信息 = my_package.获取文件信息(__file__)  # 当前文件
if 文件信息:
    print(f"  当前文件大小: {文件信息['大小']} 字节")
    print(f"  是文件: {文件信息['是否文件']}")
```

### 相对导入和绝对导入

```python
# 在包内部使用相对导入
# my_package/advanced_math.py

"""
高级数学模块 - 演示相对导入
"""

# 相对导入同一包中的模块
from . import math_utils
from .math_utils import 平均值

def 加权平均值(数字列表, 权重列表):
    """计算加权平均值"""
    if len(数字列表) != len(权重列表):
        raise ValueError("数字列表和权重列表长度必须相同")

    if not 数字列表:
        return 0

    加权和 = sum(数字 * 权重 for 数字, 权重 in zip(数字列表, 权重列表))
    权重和 = sum(权重列表)

    return 加权和 / 权重和

def 几何平均值(数字列表):
    """计算几何平均值"""
    if not 数字列表:
        return 0

    # 使用math_utils模块中的函数
    # 先计算乘积
    乘积 = 1
    for 数字 in 数字列表:
        if 数字 <= 0:
            raise ValueError("几何平均值要求所有数为正数")
        乘积 *= 数字

    return 乘积 ** (1 / len(数字列表))

# 测试相对导入的功能
def 测试相对导入():
    """测试相对导入是否工作"""
    测试数据 = [1, 2, 3, 4, 5]

    print("相对导入测试:")
    print(f"  使用相对导入的math_utils模块: {math_utils.平均值(测试数据)}")
    print(f"  直接导入平均值函数: {平均值(测试数据)}")
    print(f"  加权平均值: {加权平均值([1,2,3], [0.1,0.3,0.6])}")

    return True
```

### 发布包到PyPI

```python
"""
setup.py - 打包配置文件
"""

# setup.py内容示例
"""
from setuptools import setup, find_packages

setup(
    name="my_package",
    version="1.0.0",
    author="张三",
    author_email="zhangsan@example.com",
    description="一个实用的Python工具包",
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/zhangsan/my_package",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.6",
    install_requires=[
        "requests>=2.25.0",  # 依赖的第三方包
    ],
)
"""

# 构建和发布命令
"""
# 安装构建工具
pip install setuptools wheel twine

# 构建包
python setup.py sdist bdist_wheel

# 发布到PyPI
twine upload dist/*

# 安装自己的包
pip install my_package
"""

print("包发布流程:")
print("1. 创建setup.py配置文件")
print("2. 创建README.md文档")
print("3. 构建包: python setup.py sdist bdist_wheel")
print("4. 发布到PyPI: twine upload dist/*")
print("5. 安装: pip install my_package")
```

## 总结：模块化编程的力量

通过本章的学习，你已经掌握了Python函数和模块的核心概念：

1. **函数的定义与调用** - 创建可重用的代码块
2. **函数参数** - 灵活的参数传递方式
3. **返回值** - 从函数中返回结果
4. **变量作用域** - 理解变量在哪里可用
5. **匿名函数** - 简洁的lambda表达式
6. **模块的导入与使用** - 使用现有代码
7. **自定义模块与包** - 创建自己的代码库

### 最佳实践总结

1. **函数设计原则**：
   - 单一职责：一个函数只做一件事
   - 参数适中：避免过多参数，使用默认参数和关键字参数
   - 明确返回值：返回类型一致，文档清晰

2. **模块化设计**：
   - 相关功能放在同一模块
   - 模块之间低耦合
   - 使用包组织复杂项目

3. **代码组织**：
   - 主程序尽量简洁，调用函数和模块
   - 测试代码放在`if __name__ == "__main__"`块中
   - 使用文档字符串说明函数和模块用途

### 下一步学习

在下一章中，我们将学习**文件操作与输入输出**。你将学习如何：

- 读写文本文件和二进制文件
- 处理文件路径和目录
- 使用JSON和CSV格式
- 异常处理和上下文管理器

**实践项目建议**：

1. 创建一个实用的工具包，包含你常用的函数
2. 将之前章节的练习重构为函数和模块
3. 尝试将一个真实问题分解为函数，并组织成模块

记住：**优秀的程序员不是写出最长代码的人，而是写出最清晰、最可维护代码的人**。函数和模块是你实现这一目标的关键工具。

---

_本文是《Python入门与进阶实践》的第五章，详细介绍了Python函数与模块的使用。通过大量的实际示例，你应该已经掌握了如何创建和使用函数、模块和包。在后续章节中，我们将继续探索Python的其他强大功能。_

**相关资源**：

- [Python官方文档：函数定义](https://docs.python.org/zh-cn/3/tutorial/controlflow.html#defining-functions)
- [Python官方文档：模块](https://docs.python.org/zh-cn/3/tutorial/modules.html)
- [Real Python：Python函数指南](https://realpython.com/defining-your-own-python-function/)
- [PyPI：Python包索引](https://pypi.org/)

**代码下载**：[本章完整代码示例](https://github.com/example/python-functions-modules-examples)
