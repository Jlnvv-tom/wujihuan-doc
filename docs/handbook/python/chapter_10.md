# Python标准库常用模块：释放Python的真正威力

> 从数学计算到系统操作，掌握Python标准库的核心模块，让代码更强大、更高效

## 引言：为什么标准库如此重要？

Python以其"内置电池"（Batteries Included）理念而闻名，这意味着它提供了丰富的标准库来满足各种常见编程需求。想象一下，如果没有标准库：

- 每次处理文件路径时都要手动拼接字符串
- 生成随机数需要自己实现算法
- 处理日期时间需要复杂的计算
- 解析命令行参数需要从头开始

标准库不仅节省了大量时间，还提供了经过充分测试、性能优化的解决方案。本章将深入探索Python最常用的标准库模块，帮助你写出更专业、更高效的代码。

## 10.1 数学计算：math模块

`math`模块提供了数学运算的函数和常数，是科学计算的基础。

### 基本数学运算

```python
import math

# 数学常数
print(f"π = {math.pi:.10f}")        # 圆周率
print(f"e = {math.e:.10f}")         # 自然常数
print(f"τ = {math.tau:.10f}")       # 2π（Python 3.6+）

# 数值运算
print(f"ceil(3.14) = {math.ceil(3.14)}")      # 向上取整
print(f"floor(3.14) = {math.floor(3.14)}")    # 向下取整
print(f"trunc(-3.14) = {math.trunc(-3.14)}")  # 截断小数部分
print(f"fabs(-3.14) = {math.fabs(-3.14)}")    # 绝对值（浮点数）
print(f"factorial(5) = {math.factorial(5)}")  # 阶乘 5! = 120

# 判断函数
print(f"isnan(float('nan')) = {math.isnan(float('nan'))}")      # 是否为NaN
print(f"isfinite(1000) = {math.isfinite(1000)}")                # 是否有限
print(f"isinf(float('inf')) = {math.isinf(float('inf'))}")      # 是否为无穷大
```

### 幂与对数函数

```python
# 幂运算
print(f"2³ = {math.pow(2, 3)}")          # 2的3次方
print(f"√16 = {math.sqrt(16)}")          # 平方根
print(f"∛27 = {math.pow(27, 1/3)}")      # 立方根
print(f"e² = {math.exp(2)}")             # e的2次方
print(f"2⁴ = {math.exp2(4)}")            # 2的4次方（Python 3.6+）

# 对数运算
print(f"log(e) = {math.log(math.e)}")    # 自然对数
print(f"log₁₀(100) = {math.log10(100)}") # 以10为底
print(f"log₂(8) = {math.log2(8)}")       # 以2为底（Python 3.3+）
print(f"log(256, 2) = {math.log(256, 2)}")  # 以2为底256的对数
```

### 三角函数与双曲函数

```python
import math

# 角度与弧度转换
angle_degrees = 45
angle_radians = math.radians(angle_degrees)
print(f"{angle_degrees}° = {angle_radians:.4f} 弧度")
print(f"{angle_radians:.4f} 弧度 = {math.degrees(angle_radians):.1f}°")

# 三角函数（参数为弧度）
print(f"sin(30°) = {math.sin(math.radians(30)):.4f}")
print(f"cos(60°) = {math.cos(math.radians(60)):.4f}")
print(f"tan(45°) = {math.tan(math.radians(45)):.4f}")

# 反三角函数（返回弧度）
print(f"asin(0.5) = {math.degrees(math.asin(0.5)):.1f}°")
print(f"acos(0.5) = {math.degrees(math.acos(0.5)):.1f}°")
print(f"atan(1) = {math.degrees(math.atan(1)):.1f}°")

# 双曲函数
x = 2
print(f"sinh({x}) = {math.sinh(x):.4f}")
print(f"cosh({x}) = {math.cosh(x):.4f}")
print(f"tanh({x}) = {math.tanh(x):.4f}")
```

### 距离与组合函数

```python
# 距离计算
point1 = (0, 0)
point2 = (3, 4)

# 欧几里得距离（直角坐标系）
distance = math.dist(point1, point2)  # Python 3.8+
print(f"点{point1}到点{point2}的距离: {distance}")

# 手动计算欧几里得距离
dx = point2[0] - point1[0]
dy = point2[1] - point1[1]
manual_distance = math.hypot(dx, dy)
print(f"使用hypot计算的距离: {manual_distance}")

# 组合函数
n = 5
k = 2
print(f"C({n}, {k}) = {math.comb(n, k)}")  # 组合数（Python 3.8+）
print(f"P({n}, {k}) = {math.perm(n, k)}")  # 排列数（Python 3.8+）

# 最大公约数和最小公倍数
a = 48
b = 18
print(f"gcd({a}, {b}) = {math.gcd(a, b)}")  # 最大公约数
print(f"lcm({a}, {b}) = {math.lcm(a, b)}")  # 最小公倍数（Python 3.9+）

# 余数运算
print(f"fmod(10, 3) = {math.fmod(10, 3)}")      # 浮点数求余
print(f"remainder(10, 3) = {math.remainder(10, 3)}")  # IEEE 754标准的余数
```

### 实战应用：计算几何图形

```python
import math

class Circle:
    """圆形"""
    def __init__(self, radius):
        self.radius = radius

    @property
    def area(self):
        return math.pi * self.radius ** 2

    @property
    def circumference(self):
        return 2 * math.pi * self.radius

    def __str__(self):
        return f"圆形 (半径={self.radius})"

class Sphere:
    """球体"""
    def __init__(self, radius):
        self.radius = radius

    @property
    def volume(self):
        return (4/3) * math.pi * self.radius ** 3

    @property
    def surface_area(self):
        return 4 * math.pi * self.radius ** 2

    def __str__(self):
        return f"球体 (半径={self.radius})"

class RegularPolygon:
    """正多边形"""
    def __init__(self, n_sides, side_length):
        self.n = n_sides
        self.s = side_length

    @property
    def area(self):
        # 正多边形面积公式: (n * s²) / (4 * tan(π/n))
        return (self.n * self.s ** 2) / (4 * math.tan(math.pi / self.n))

    @property
    def perimeter(self):
        return self.n * self.s

    @property
    def interior_angle(self):
        # 内角度数: (n-2) * 180° / n
        return (self.n - 2) * 180 / self.n

    def __str__(self):
        return f"正{self.n}边形 (边长={self.s})"

# 测试几何图形
shapes = [
    Circle(5),
    Sphere(5),
    RegularPolygon(3, 5),  # 等边三角形
    RegularPolygon(4, 5),  # 正方形
    RegularPolygon(6, 5),  # 正六边形
]

for shape in shapes:
    print(f"\n{shape}:")

    if hasattr(shape, 'area'):
        print(f"  面积/表面积: {shape.area:.2f}")

    if hasattr(shape, 'circumference'):
        print(f"  周长: {shape.circumference:.2f}")
    elif hasattr(shape, 'perimeter'):
        print(f"  周长: {shape.perimeter:.2f}")

    if hasattr(shape, 'volume'):
        print(f"  体积: {shape.volume:.2f}")

    if hasattr(shape, 'interior_angle'):
        print(f"  内角: {shape.interior_angle:.1f}°")
```

## 10.2 随机数：random模块

`random`模块提供了生成随机数的功能，可用于模拟、游戏、测试数据生成等场景。

### 基本随机数生成

```python
import random

# 基本随机数
print(f"随机浮点数 [0,1): {random.random()}")
print(f"随机浮点数 [1,10]: {random.uniform(1, 10)}")
print(f"随机整数 [1,10]: {random.randint(1, 10)}")
print(f"随机范围 (0,100,10): {random.randrange(0, 100, 10)}")

# 随机选择
fruits = ['apple', 'banana', 'cherry', 'date']
print(f"随机选择一个水果: {random.choice(fruits)}")
print(f"随机选择3个水果(可重复): {random.choices(fruits, k=3)}")
print(f"随机选择2个水果(不重复): {random.sample(fruits, 2)}")

# 随机打乱
cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
random.shuffle(cards)
print(f"打乱的扑克牌: {cards}")
```

### 随机分布

```python
import random
import statistics

# 正态分布（高斯分布）
normal_data = [random.gauss(100, 15) for _ in range(1000)]
print(f"正态分布 - 均值: {statistics.mean(normal_data):.1f}, 标准差: {statistics.stdev(normal_data):.1f}")

# 指数分布
exponential_data = [random.expovariate(1/5) for _ in range(1000)]  # 均值=5
print(f"指数分布 - 均值: {statistics.mean(exponential_data):.1f}")

# 三角分布
triangular_data = [random.triangular(0, 10, 5) for _ in range(1000)]
print(f"三角分布 - 均值: {statistics.mean(triangular_data):.1f}")

# 贝塔分布
beta_data = [random.betavariate(2, 5) for _ in range(1000)]
print(f"贝塔分布 - 均值: {statistics.mean(beta_data):.3f}")

# 伽马分布
gamma_data = [random.gammavariate(2, 2) for _ in range(1000)]
print(f"伽马分布 - 均值: {statistics.mean(gamma_data):.1f}")
```

### 随机种子与可重现性

```python
import random

# 设置随机种子确保结果可重现
print("=== 可重现的随机序列 ===")
random.seed(42)  # 设置种子
sequence1 = [random.randint(1, 100) for _ in range(5)]
print(f"种子42的序列1: {sequence1}")

random.seed(42)  # 重置相同种子
sequence2 = [random.randint(1, 100) for _ in range(5)]
print(f"种子42的序列2: {sequence2}")
print(f"两个序列相同? {sequence1 == sequence2}")

# 使用系统时间作为种子
random.seed()  # 使用系统时间，每次运行不同

# 创建独立的随机数生成器
print("\n=== 独立的随机数生成器 ===")
rng1 = random.Random(123)  # 创建第一个生成器
rng2 = random.Random(123)  # 创建第二个生成器（相同种子）
rng3 = random.Random()     # 创建第三个生成器（不同种子）

print(f"rng1: {rng1.randint(1, 100)}, rng2: {rng2.randint(1, 100)}, rng3: {rng3.randint(1, 100)}")
print(f"rng1和rng2相同? {rng1.randint(1, 100) == rng2.randint(1, 100)}")
print(f"rng1和rng3相同? {rng1.randint(1, 100) == rng3.randint(1, 100)}")
```

### 实战应用：模拟掷骰子游戏

```python
import random
from collections import Counter
from typing import List, Tuple

class Dice:
    """骰子类"""
    def __init__(self, sides: int = 6):
        self.sides = sides

    def roll(self) -> int:
        """掷骰子"""
        return random.randint(1, self.sides)

    def roll_multiple(self, n: int) -> List[int]:
        """掷多个骰子"""
        return [self.roll() for _ in range(n)]

class DiceGame:
    """骰子游戏"""

    @staticmethod
    def monte_carlo_simulation(dice_count: int, trials: int = 100000) -> dict:
        """
        蒙特卡洛模拟：统计多个骰子点数和分布
        """
        dice = Dice(6)
        results = Counter()

        for _ in range(trials):
            total = sum(dice.roll() for _ in range(dice_count))
            results[total] += 1

        # 计算概率
        probabilities = {
            total: count / trials
            for total, count in results.items()
        }

        return probabilities

    @staticmethod
    def yahtzee_probability(trials: int = 100000) -> float:
        """
        计算Yahtzee游戏（5个骰子点数相同）的概率
        """
        dice = Dice(6)
        yahtzee_count = 0

        for _ in range(trials):
            rolls = dice.roll_multiple(5)
            if len(set(rolls)) == 1:  # 所有骰子点数相同
                yahtzee_count += 1

        return yahtzee_count / trials

    @staticmethod
    def craps_game() -> Tuple[bool, List[int]]:
        """
        模拟掷双骰子游戏（Craps）
        规则：
        1. 第一次掷出7或11：赢
        2. 第一次掷出2、3或12：输
        3. 其他点数：继续掷，直到再次掷出该点数（赢）或掷出7（输）
        """
        dice = Dice(6)
        rolls = []

        # 第一次掷骰
        first_roll = sum(dice.roll_multiple(2))
        rolls.append(first_roll)

        if first_roll in (7, 11):
            return True, rolls  # 赢
        elif first_roll in (2, 3, 12):
            return False, rolls  # 输

        # 继续掷骰
        point = first_roll
        while True:
            current_roll = sum(dice.roll_multiple(2))
            rolls.append(current_roll)

            if current_roll == point:
                return True, rolls  # 赢
            elif current_roll == 7:
                return False, rolls  # 输

# 运行模拟
print("=== 掷骰子游戏模拟 ===")

# 蒙特卡洛模拟
print("\n1. 两个骰子点数和的概率分布:")
probs = DiceGame.monte_carlo_simulation(dice_count=2, trials=100000)
for total in sorted(probs.keys()):
    print(f"  和为{total:2d}: {probs[total]:.3%}")

# Yahtzee概率
print(f"\n2. Yahtzee概率 (5个骰子点数相同): {DiceGame.yahtzee_probability(100000):.4%}")

# Craps游戏模拟
print("\n3. Craps游戏模拟:")
wins = 0
losses = 0
for i in range(10):
    won, rolls = DiceGame.craps_game()
    result = "赢" if won else "输"
    wins += 1 if won else 0
    losses += 1 if not won else 0
    print(f"  第{i+1}局: {result} | 掷骰序列: {rolls}")

print(f"\n  统计: 赢 {wins} 局, 输 {losses} 局, 胜率: {wins/(wins+losses):.1%}")

# 创建随机密码生成器
print("\n4. 随机密码生成器:")

def generate_password(length: int = 12,
                      use_uppercase: bool = True,
                      use_digits: bool = True,
                      use_special: bool = True) -> str:
    """生成随机密码"""
    lowercase = 'abcdefghijklmnopqrstuvwxyz'
    uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    digits = '0123456789'
    special = '!@#$%^&*()_+-=[]{}|;:,.<>?'

    # 构建字符集
    charset = lowercase
    if use_uppercase:
        charset += uppercase
    if use_digits:
        charset += digits
    if use_special:
        charset += special

    # 确保至少包含每种类型
    password_chars = []
    if use_uppercase:
        password_chars.append(random.choice(uppercase))
    if use_digits:
        password_chars.append(random.choice(digits))
    if use_special:
        password_chars.append(random.choice(special))

    # 填充剩余字符
    remaining = length - len(password_chars)
    password_chars.extend(random.choices(charset, k=remaining))

    # 打乱顺序
    random.shuffle(password_chars)

    return ''.join(password_chars)

# 生成不同强度的密码
print(f"  简单密码（8位小写）: {generate_password(8, False, False, False)}")
print(f"  中等密码（10位，含大小写和数字）: {generate_password(10, True, True, False)}")
print(f"  强密码（12位，全字符集）: {generate_password(12, True, True, True)}")
```

## 10.3 日期时间：datetime模块

`datetime`模块提供了处理日期和时间的类，是时间相关操作的核心。

### 基本日期时间操作

```python
from datetime import datetime, date, time, timedelta

# 当前日期时间
now = datetime.now()
print(f"当前日期时间: {now}")
print(f"年: {now.year}, 月: {now.month}, 日: {now.day}")
print(f"时: {now.hour}, 分: {now.minute}, 秒: {now.second}, 微秒: {now.microsecond}")

# 创建特定日期时间
christmas = datetime(2024, 12, 25, 20, 30, 0)
print(f"2024年圣诞节: {christmas}")

# 日期和时间对象
today = date.today()
print(f"今天日期: {today}")

current_time = time(14, 30, 45)
print(f"当前时间: {current_time}")

# 组合日期和时间
combined = datetime.combine(today, current_time)
print(f"组合的日期时间: {combined}")
```

### 时间差计算

```python
from datetime import datetime, timedelta

# 时间差
one_day = timedelta(days=1)
one_hour = timedelta(hours=1)
one_week = timedelta(weeks=1)

print(f"一天后: {datetime.now() + one_day}")
print(f"三小时前: {datetime.now() - timedelta(hours=3)}")
print(f"两周后: {datetime.now() + timedelta(weeks=2)}")

# 复杂的时间差
complex_delta = timedelta(
    days=5,
    hours=3,
    minutes=30,
    seconds=45,
    milliseconds=500,
    microseconds=250
)
print(f"复杂时间差: {complex_delta}")
print(f"总秒数: {complex_delta.total_seconds()}")

# 计算两个日期之间的差
start_date = datetime(2024, 1, 1)
end_date = datetime(2024, 12, 31)
time_diff = end_date - start_date
print(f"2024年总天数: {time_diff.days} 天")
```

### 日期时间格式化

```python
from datetime import datetime

now = datetime.now()

# 格式化为字符串
print(f"ISO格式: {now.isoformat()}")
print(f"自定义格式: {now.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"可读格式: {now.strftime('%A, %B %d, %Y %I:%M %p')}")

# 常用格式代码
formats = {
    "%Y-%m-%d": "年-月-日",
    "%d/%m/%Y": "日/月/年",
    "%A, %d %B %Y": "星期, 日 月 年",
    "%H:%M:%S": "时:分:秒",
    "%I:%M %p": "12小时制时间"
}

for fmt, description in formats.items():
    print(f"{description:15} : {now.strftime(fmt)}")

# 字符串解析为日期时间
date_string = "2024-03-15 14:30:00"
parsed_date = datetime.strptime(date_string, "%Y-%m-%d %H:%M:%S")
print(f"\n解析后的日期: {parsed_date}")
```

### 时区处理

```python
from datetime import datetime, timezone, timedelta
import pytz  # 需要安装: pip install pytz

# 时区感知的datetime对象
utc_now = datetime.now(timezone.utc)
print(f"UTC时间: {utc_now}")
print(f"UTC时区: {utc_now.tzinfo}")

# 转换时区
# 使用pytz处理时区
try:
    import pytz

    # 创建带时区的日期时间
    eastern = pytz.timezone('US/Eastern')
    utc_time = datetime(2024, 3, 15, 12, 0, 0, tzinfo=timezone.utc)

    # 转换为美东时间
    eastern_time = utc_time.astimezone(eastern)
    print(f"\nUTC时间: {utc_time}")
    print(f"美东时间: {eastern_time}")

    # 获取所有时区
    print("\n部分时区示例:")
    for tz in ['Asia/Shanghai', 'Europe/London', 'America/New_York', 'Australia/Sydney']:
        print(f"  {tz}: {utc_time.astimezone(pytz.timezone(tz))}")

except ImportError:
    print("\npytz未安装，跳过时区示例")

# 使用Python 3.9+的zoneinfo
import sys
if sys.version_info >= (3, 9):
    from zoneinfo import ZoneInfo

    # 创建带时区的日期时间
    shanghai_tz = ZoneInfo("Asia/Shanghai")
    local_time = datetime(2024, 3, 15, 20, 0, 0, tzinfo=shanghai_tz)
    print(f"\n上海时间: {local_time}")
    print(f"UTC时间: {local_time.astimezone(timezone.utc)}")
```

### 实战应用：任务调度器

```python
from datetime import datetime, timedelta
import time
from typing import Callable, List

class Task:
    """任务类"""
    def __init__(self, name: str, interval: timedelta, func: Callable):
        self.name = name
        self.interval = interval
        self.func = func
        self.last_run = None
        self.next_run = datetime.now()

    def should_run(self) -> bool:
        """检查任务是否应该运行"""
        return datetime.now() >= self.next_run

    def run(self):
        """运行任务"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 执行任务: {self.name}")
        try:
            self.func()
            self.last_run = datetime.now()
            self.next_run = self.last_run + self.interval
            return True
        except Exception as e:
            print(f"任务 {self.name} 执行失败: {e}")
            return False

    def __str__(self):
        status = f"下次运行: {self.next_run.strftime('%H:%M:%S')}"
        if self.last_run:
            status += f", 上次运行: {self.last_run.strftime('%H:%M:%S')}"
        return f"任务 '{self.name}' ({status})"

class TaskScheduler:
    """任务调度器"""

    def __init__(self):
        self.tasks: List[Task] = []
        self.running = False

    def add_task(self, name: str, interval_seconds: float, func: Callable):
        """添加任务"""
        interval = timedelta(seconds=interval_seconds)
        task = Task(name, interval, func)
        self.tasks.append(task)
        print(f"添加任务: {task}")

    def remove_task(self, name: str):
        """移除任务"""
        self.tasks = [task for task in self.tasks if task.name != name]
        print(f"移除任务: {name}")

    def run_once(self):
        """运行一次所有到期的任务"""
        for task in self.tasks:
            if task.should_run():
                task.run()

    def start(self, run_for_seconds: float = 30):
        """启动调度器"""
        print(f"\n启动任务调度器，运行 {run_for_seconds} 秒...")
        self.running = True
        start_time = datetime.now()

        try:
            while self.running:
                self.run_once()
                time.sleep(0.1)  # 避免CPU占用过高

                # 检查是否超时
                if (datetime.now() - start_time).total_seconds() >= run_for_seconds:
                    print("\n运行时间到，停止调度器")
                    break
        except KeyboardInterrupt:
            print("\n用户中断，停止调度器")
        finally:
            self.running = False

    def list_tasks(self):
        """列出所有任务"""
        print("\n当前任务列表:")
        for task in self.tasks:
            print(f"  - {task}")

# 示例任务函数
def backup_database():
    """模拟数据库备份"""
    print("  正在备份数据库...")
    time.sleep(0.5)  # 模拟耗时操作
    print("  数据库备份完成")

def send_report():
    """模拟发送报告"""
    print("  生成并发送报告...")
    # 模拟偶尔失败
    if datetime.now().second % 10 == 0:
        raise Exception("邮件服务器连接失败")
    print("  报告发送成功")

def check_system_health():
    """模拟系统健康检查"""
    print("  检查系统健康状态...")
    print("  系统状态: 正常")

# 创建调度器并添加任务
scheduler = TaskScheduler()
scheduler.add_task("数据库备份", interval_seconds=5, func=backup_database)
scheduler.add_task("发送报告", interval_seconds=8, func=send_report)
scheduler.add_task("系统健康检查", interval_seconds=3, func=check_system_health)

# 列出任务
scheduler.list_tasks()

# 运行调度器（模拟运行30秒）
scheduler.start(run_for_seconds=30)
```

## 10.4 系统操作：sys模块

`sys`模块提供了与Python解释器交互的函数和变量。

### 系统参数和路径

```python
import sys

# Python解释器信息
print(f"Python版本: {sys.version}")
print(f"Python版本信息: {sys.version_info}")
print(f"平台: {sys.platform}")
print(f"可执行文件路径: {sys.executable}")

# 命令行参数
print(f"\n命令行参数:")
print(f"  脚本名称: {sys.argv[0]}")
print(f"  参数列表: {sys.argv[1:]}")

# Python路径
print(f"\n模块搜索路径 (sys.path):")
for i, path in enumerate(sys.path[:5], 1):  # 只显示前5个
    print(f"  {i}. {path}")
print(f"  ... 共 {len(sys.path)} 个路径")

# 添加自定义路径
custom_path = "/my/custom/modules"
sys.path.append(custom_path)
print(f"\n已添加路径: {custom_path}")
```

### 标准输入输出流

```python
import sys

# 标准输入输出
print("=== 标准输入输出 ===")

# 写入标准输出
sys.stdout.write("这是一条标准输出\n")
print("这是print函数的输出", file=sys.stdout)

# 写入标准错误
sys.stderr.write("这是一条错误信息\n")
print("这是print到stderr的输出", file=sys.stderr)

# 读取标准输入
print("\n请输入一些文字 (按Ctrl+D结束输入):")
try:
    for line in sys.stdin:
        print(f"您输入了: {line.strip()}")
except KeyboardInterrupt:
    print("\n输入中断")

# 重定向标准输出
print("\n=== 输出重定向示例 ===")

# 保存原始stdout
original_stdout = sys.stdout

try:
    # 重定向到文件
    with open('output.txt', 'w') as f:
        sys.stdout = f
        print("这行文字会写入文件")
        print("不会显示在屏幕上")

    # 恢复原始stdout
    sys.stdout = original_stdout
    print("恢复后，这行文字显示在屏幕上")

    # 读取文件内容
    with open('output.txt', 'r') as f:
        print("文件内容:")
        print(f.read())

finally:
    # 确保恢复
    sys.stdout = original_stdout
```

### 系统限制和配置

```python
import sys

# 递归限制
print(f"当前递归限制: {sys.getrecursionlimit()}")
sys.setrecursionlimit(2000)
print(f"设置后递归限制: {sys.getrecursionlimit()}")

# 整数信息
print(f"\n整数信息:")
print(f"  最大整数值: {sys.maxsize}")
print(f"  浮点数信息: {sys.float_info}")

# 引用计数
print(f"\n引用计数示例:")
a = [1, 2, 3]
print(f"  列表引用计数: {sys.getrefcount(a)}")

b = a
print(f"  赋值后引用计数: {sys.getrefcount(a)}")

del b
print(f"  删除b后引用计数: {sys.getrefcount(a)}")
```

### 退出程序和控制流程

```python
import sys

def process_data(data):
    """处理数据，可能失败"""
    if not data:
        print("错误: 数据为空", file=sys.stderr)
        sys.exit(1)  # 非零退出码表示错误

    print(f"处理数据: {data}")
    return True

def main():
    """主函数"""
    print("程序开始")

    # 测试正常情况
    try:
        process_data([1, 2, 3])
    except SystemExit as e:
        print(f"捕获到SystemExit: 退出码 {e.code}")

    # 测试错误情况
    print("\n测试错误处理:")
    try:
        process_data([])
    except SystemExit as e:
        print(f"程序退出，退出码: {e.code}")
        # 可以在这里进行清理工作

    # 这行不会执行，因为上面sys.exit(1)已经退出了程序
    print("这行不会显示")

if __name__ == "__main__":
    main()
```

### 实战应用：命令行工具框架

```python
import sys
import argparse

class CommandLineTool:
    """命令行工具框架"""

    def __init__(self):
        self.parser = argparse.ArgumentParser(
            description='多功能命令行工具',
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
示例:
  %(prog)s process --input data.txt --output result.txt
  %(prog)s analyze --verbose
            """
        )
        self._setup_arguments()

    def _setup_arguments(self):
        """设置命令行参数"""
        # 子命令
        subparsers = self.parser.add_subparsers(dest='command', help='可用命令')

        # process 命令
        process_parser = subparsers.add_parser('process', help='处理文件')
        process_parser.add_argument('--input', '-i', required=True, help='输入文件')
        process_parser.add_argument('--output', '-o', help='输出文件')
        process_parser.add_argument('--verbose', '-v', action='store_true', help='详细输出')

        # analyze 命令
        analyze_parser = subparsers.add_parser('analyze', help='分析数据')
        analyze_parser.add_argument('--threshold', '-t', type=float, default=0.5,
                                   help='阈值 (默认: 0.5)')
        analyze_parser.add_argument('--format', '-f', choices=['json', 'csv', 'table'],
                                   default='table', help='输出格式')

        # config 命令
        config_parser = subparsers.add_parser('config', help='配置工具')
        config_parser.add_argument('--set', action='store_true', help='设置配置')
        config_parser.add_argument('--get', action='store_true', help='获取配置')
        config_parser.add_argument('key', nargs='?', help='配置键')
        config_parser.add_argument('value', nargs='?', help='配置值')

    def handle_process(self, args):
        """处理process命令"""
        print(f"处理文件: {args.input}")
        if args.output:
            print(f"输出到: {args.output}")

        if args.verbose:
            print("详细模式启用")
            print(f"系统平台: {sys.platform}")
            print(f"Python路径: {sys.executable}")

        # 模拟处理
        return True

    def handle_analyze(self, args):
        """处理analyze命令"""
        print(f"分析数据，阈值: {args.threshold}")
        print(f"输出格式: {args.format}")

        # 模拟分析
        import random
        data = [random.random() for _ in range(10)]
        above_threshold = [x for x in data if x > args.threshold]

        print(f"数据点: {len(data)}, 超过阈值的点: {len(above_threshold)}")

        return True

    def handle_config(self, args):
        """处理config命令"""
        if args.set and args.key and args.value:
            print(f"设置配置: {args.key} = {args.value}")
        elif args.get and args.key:
            print(f"获取配置: {args.key} = 模拟值")
        else:
            print("显示所有配置...")
            print("  theme: dark")
            print("  language: zh-CN")

        return True

    def run(self):
        """运行命令行工具"""
        # 如果没有参数，显示帮助
        if len(sys.argv) == 1:
            self.parser.print_help()
            sys.exit(0)

        # 解析参数
        args = self.parser.parse_args()

        # 根据命令调用相应处理函数
        handlers = {
            'process': self.handle_process,
            'analyze': self.handle_analyze,
            'config': self.handle_config
        }

        if args.command in handlers:
            try:
                success = handlers[args.command](args)
                exit_code = 0 if success else 1
            except Exception as e:
                print(f"错误: {e}", file=sys.stderr)
                exit_code = 1
        else:
            print(f"未知命令: {args.command}", file=sys.stderr)
            exit_code = 1

        sys.exit(exit_code)

# 使用示例
if __name__ == "__main__":
    # 模拟命令行参数
    sys.argv = [
        'cli_tool.py',           # 脚本名
        'process',               # 命令
        '--input', 'data.txt',   # 参数
        '--verbose'              # 标志
    ]

    tool = CommandLineTool()
    tool.run()
```

## 10.5 操作系统接口：os模块进阶

`os`模块提供了丰富的操作系统接口，用于文件操作、进程管理、环境变量等。

### 文件和目录操作

```python
import os
import time

# 当前工作目录
print(f"当前工作目录: {os.getcwd()}")
os.chdir('/tmp')  # 切换目录
print(f"切换后目录: {os.getcwd()}")
os.chdir('..')    # 返回上级目录

# 目录操作
test_dir = 'test_directory'
os.mkdir(test_dir)  # 创建目录
print(f"目录创建成功: {os.path.exists(test_dir)}")

# 创建嵌套目录
nested_dir = os.path.join(test_dir, 'subdir1', 'subdir2')
os.makedirs(nested_dir, exist_ok=True)  # 创建多级目录
print(f"嵌套目录创建成功: {os.path.exists(nested_dir)}")

# 列出目录内容
print(f"\n目录 {test_dir} 的内容:")
for item in os.listdir(test_dir):
    item_path = os.path.join(test_dir, item)
    if os.path.isdir(item_path):
        print(f"  [目录] {item}")
    else:
        print(f"  [文件] {item}")

# 文件和目录属性
file_path = os.path.join(test_dir, 'test.txt')
with open(file_path, 'w') as f:
    f.write('测试内容')

print(f"\n文件信息:")
print(f"  大小: {os.path.getsize(file_path)} 字节")
print(f"  创建时间: {time.ctime(os.path.getctime(file_path))}")
print(f"  修改时间: {time.ctime(os.path.getmtime(file_path))}")
print(f"  访问时间: {time.ctime(os.path.getatime(file_path))}")

# 删除文件和目录
os.remove(file_path)
os.removedirs(nested_dir)  # 删除空目录
print(f"\n清理完成")
```

### 进程管理

```python
import os
import sys

# 进程信息
print(f"进程ID: {os.getpid()}")
print(f"父进程ID: {os.getppid()}")
print(f"进程组ID: {os.getpgid(0)}")

# 用户和组信息
print(f"\n用户信息:")
print(f"  有效用户ID: {os.geteuid()}")
print(f"  有效组ID: {os.getegid()}")
print(f"  用户ID: {os.getuid()}")
print(f"  组ID: {os.getgid()}")

# 环境变量
print(f"\n环境变量:")
print(f"  PATH: {os.getenv('PATH', '未设置')}")
print(f"  HOME: {os.getenv('HOME', '未设置')}")
print(f"  USER: {os.getenv('USER', '未设置')}")

# 设置环境变量（仅当前进程）
os.environ['MY_VAR'] = 'my_value'
print(f"  自定义变量: {os.getenv('MY_VAR')}")

# 执行系统命令
print(f"\n执行系统命令:")
if sys.platform == 'win32':
    result = os.system('dir')
else:
    result = os.system('ls -la')
print(f"  命令退出码: {result >> 8}")  # 高8位是退出码

# 使用os.popen执行命令并获取输出
print(f"\n使用popen获取命令输出:")
with os.popen('echo "Hello, World!"') as stream:
    output = stream.read()
    print(f"  输出: {output.strip()}")
```

### 高级文件操作

```python
import os
import stat

# 创建测试文件
test_file = 'permissions_test.txt'
with open(test_file, 'w') as f:
    f.write('权限测试')

# 获取文件状态
file_stat = os.stat(test_file)
print(f"文件状态:")
print(f"  模式: {oct(file_stat.st_mode)}")
print(f"  inode: {file_stat.st_ino}")
print(f"  设备: {file_stat.st_dev}")
print(f"  硬链接数: {file_stat.st_nlink}")
print(f"  大小: {file_stat.st_size} 字节")

# 文件权限操作
print(f"\n修改文件权限:")
# 获取当前权限
current_mode = file_stat.st_mode
print(f"  当前权限: {oct(current_mode)}")

# 添加执行权限
new_mode = current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
os.chmod(test_file, new_mode)
print(f"  新权限: {oct(os.stat(test_file).st_mode)}")

# 恢复权限
os.chmod(test_file, current_mode)

# 文件所有者
try:
    print(f"\n文件所有者:")
    print(f"  用户ID: {file_stat.st_uid}")
    print(f"  组ID: {file_stat.st_gid}")

    # 修改文件所有者（需要root权限）
    # os.chown(test_file, 1000, 1000)
except PermissionError:
    print("  需要root权限来修改所有者")

# 文件描述符操作
print(f"\n文件描述符操作:")
fd = os.open(test_file, os.O_RDONLY)
print(f"  文件描述符: {fd}")

# 读取文件内容
content = os.read(fd, 100)
print(f"  文件内容: {content.decode()}")

# 移动文件指针
os.lseek(fd, 0, os.SEEK_SET)

# 关闭文件描述符
os.close(fd)

# 清理
os.remove(test_file)
```

### 实战应用：文件监控工具

```python
import os
import time
import hashlib
from typing import Dict, Set
from dataclasses import dataclass
from pathlib import Path

@dataclass
class FileInfo:
    """文件信息"""
    path: str
    size: int
    mtime: float
    hash: str = None

    def compute_hash(self):
        """计算文件哈希值"""
        hasher = hashlib.md5()
        with open(self.path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                hasher.update(chunk)
        self.hash = hasher.hexdigest()
        return self.hash

class FileMonitor:
    """文件监控工具"""

    def __init__(self, directory: str):
        self.directory = directory
        self.snapshot: Dict[str, FileInfo] = {}
        self._take_snapshot()

    def _take_snapshot(self):
        """拍摄当前目录快照"""
        self.snapshot.clear()

        for root, dirs, files in os.walk(self.directory):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    stat = os.stat(file_path)
                    file_info = FileInfo(
                        path=file_path,
                        size=stat.st_size,
                        mtime=stat.st_mtime
                    )
                    self.snapshot[file_path] = file_info
                except (OSError, PermissionError) as e:
                    print(f"无法访问文件 {file_path}: {e}")

    def monitor_changes(self, interval: float = 5.0, duration: float = 60.0):
        """
        监控文件变化

        Args:
            interval: 检查间隔（秒）
            duration: 监控时长（秒）
        """
        print(f"开始监控目录: {self.directory}")
        print(f"检查间隔: {interval}秒, 总时长: {duration}秒")
        print("-" * 50)

        start_time = time.time()
        check_count = 0

        try:
            while time.time() - start_time < duration:
                check_count += 1
                print(f"\n检查 #{check_count} - {time.ctime()}")

                # 获取当前状态
                current_files = {}
                for root, dirs, files in os.walk(self.directory):
                    for file in files:
                        file_path = os.path.join(root, file)
                        try:
                            stat = os.stat(file_path)
                            current_files[file_path] = FileInfo(
                                path=file_path,
                                size=stat.st_size,
                                mtime=stat.st_mtime
                            )
                        except (OSError, PermissionError):
                            continue

                # 检测新文件
                new_files = set(current_files.keys()) - set(self.snapshot.keys())
                if new_files:
                    print(f"发现 {len(new_files)} 个新文件:")
                    for file in new_files:
                        print(f"  + {file}")

                # 检测删除的文件
                deleted_files = set(self.snapshot.keys()) - set(current_files.keys())
                if deleted_files:
                    print(f"发现 {len(deleted_files)} 个文件被删除:")
                    for file in deleted_files:
                        print(f"  - {file}")

                # 检测修改的文件
                modified_files = []
                for path, current_info in current_files.items():
                    if path in self.snapshot:
                        old_info = self.snapshot[path]
                        if (current_info.size != old_info.size or
                            current_info.mtime != old_info.mtime):
                            modified_files.append(path)

                if modified_files:
                    print(f"发现 {len(modified_files)} 个文件被修改:")
                    for file in modified_files:
                        old_info = self.snapshot[file]
                        new_info = current_files[file]
                        print(f"  * {file}")
                        print(f"    大小: {old_info.size} -> {new_info.size} 字节")
                        print(f"    修改时间: {time.ctime(old_info.mtime)} -> {time.ctime(new_info.mtime)}")

                        # 计算哈希值验证内容是否真的改变
                        if old_info.hash is None:
                            old_info.compute_hash()
                        new_info.compute_hash()

                        if old_info.hash != new_info.hash:
                            print(f"    内容已改变 (哈希: {old_info.hash[:8]}... -> {new_info.hash[:8]}...)")
                        else:
                            print(f"    内容未改变")

                # 如果没有变化
                if not (new_files or deleted_files or modified_files):
                    print("没有检测到变化")

                # 更新快照
                self.snapshot = current_files

                # 等待下一次检查
                if time.time() - start_time + interval < duration:
                    time.sleep(interval)
                else:
                    break

        except KeyboardInterrupt:
            print("\n监控被用户中断")

        print(f"\n监控结束，共进行 {check_count} 次检查")

    def find_duplicates(self):
        """查找重复文件"""
        print(f"\n查找重复文件...")

        # 按文件大小分组
        size_groups: Dict[int, List[FileInfo]] = {}
        for file_info in self.snapshot.values():
            size_groups.setdefault(file_info.size, []).append(file_info)

        # 查找可能重复的文件（大小相同）
        potential_duplicates = []
        for size, files in size_groups.items():
            if len(files) > 1:
                potential_duplicates.append((size, files))

        if not potential_duplicates:
            print("没有找到重复文件")
            return

        print(f"找到 {len(potential_duplicates)} 组可能重复的文件")

        # 通过哈希值确认重复
        duplicate_groups = []
        for size, files in potential_duplicates:
            hash_groups: Dict[str, List[FileInfo]] = {}

            # 计算哈希值
            for file_info in files:
                file_info.compute_hash()
                hash_groups.setdefault(file_info.hash, []).append(file_info)

            # 记录真正的重复文件
            for hash_value, hash_files in hash_groups.items():
                if len(hash_files) > 1:
                    duplicate_groups.append((size, hash_files))

        # 输出结果
        print(f"\n确认的重复文件组:")
        for i, (size, files) in enumerate(duplicate_groups, 1):
            print(f"\n第 {i} 组 (大小: {size} 字节):")
            for file_info in files:
                print(f"  - {file_info.path}")
            print(f"  哈希值: {files[0].hash}")

# 创建测试目录和文件
def setup_test_environment():
    """创建测试环境"""
    test_dir = 'file_monitor_test'

    # 清理并创建测试目录
    if os.path.exists(test_dir):
        import shutil
        shutil.rmtree(test_dir)

    os.makedirs(test_dir, exist_ok=True)

    # 创建测试文件
    files_to_create = {
        'file1.txt': '这是第一个文件的内容',
        'file2.txt': '这是第二个文件的内容',
        'subdir/file3.txt': '这是子目录中的文件',
        'subdir/file4.txt': '重复内容',
        'subdir/file5.txt': '重复内容',  # 重复文件
    }

    for file_path, content in files_to_create.items():
        full_path = os.path.join(test_dir, file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)

    return test_dir

# 运行监控工具
if __name__ == "__main__":
    # 设置测试环境
    test_directory = setup_test_environment()

    # 创建监控器
    monitor = FileMonitor(test_directory)

    # 监控变化
    print("=== 文件变化监控 ===")
    monitor.monitor_changes(interval=3, duration=15)

    # 查找重复文件
    print("\n=== 重复文件检测 ===")
    monitor.find_duplicates()

    # 清理
    import shutil
    shutil.rmtree(test_directory)
    print(f"\n清理测试目录: {test_directory}")
```

## 10.6 路径操作：pathlib模块

`pathlib`模块提供了面向对象的路径操作方式，比传统的`os.path`更加直观和易用。

### 基本路径操作

```python
from pathlib import Path

# 创建Path对象
current_dir = Path('.')  # 相对路径
home_dir = Path.home()   # 用户主目录
root_dir = Path('/')     # 根目录

print(f"当前目录: {current_dir.absolute()}")
print(f"主目录: {home_dir}")
print(f"根目录: {root_dir}")

# 路径拼接
config_path = home_dir / '.config' / 'myapp' / 'config.json'
print(f"配置文件路径: {config_path}")

# 路径解析
print(f"\n路径解析:")
print(f"  父目录: {config_path.parent}")
print(f"  父目录的父目录: {config_path.parent.parent}")
print(f"  文件名: {config_path.name}")
print(f"  文件名（不含扩展名）: {config_path.stem}")
print(f"  扩展名: {config_path.suffix}")
print(f"  所有扩展名: {config_path.suffixes}")
print(f"  驱动器: {config_path.drive}")  # Windows下的盘符

# 路径检查
print(f"\n路径检查:")
print(f"  是否存在: {config_path.exists()}")
print(f"  是文件吗: {config_path.is_file()}")
print(f"  是目录吗: {config_path.is_dir()}")
print(f"  是绝对路径吗: {config_path.is_absolute()}")
print(f"  是符号链接吗: {config_path.is_symlink()}")
```

### 文件操作

```python
from pathlib import Path
import tempfile

# 创建临时目录
temp_dir = Path(tempfile.mkdtemp())
print(f"临时目录: {temp_dir}")

# 创建文件
test_file = temp_dir / 'test.txt'
test_file.write_text('Hello, Pathlib!')
print(f"文件已创建: {test_file}")
print(f"文件内容: {test_file.read_text()}")

# 追加内容
with test_file.open('a') as f:
    f.write('\n追加的内容')

# 读取所有行
lines = test_file.read_text().splitlines()
print(f"文件行数: {len(lines)}")
for i, line in enumerate(lines, 1):
    print(f"  第{i}行: {line}")

# 二进制文件操作
binary_file = temp_dir / 'data.bin'
binary_file.write_bytes(b'\x00\x01\x02\x03\x04')
print(f"\n二进制文件大小: {binary_file.stat().st_size} 字节")

# 文件属性
print(f"\n文件属性:")
print(f"  大小: {test_file.stat().st_size} 字节")
print(f"  最后修改: {test_file.stat().st_mtime}")
print(f"  权限: {oct(test_file.stat().st_mode)}")

# 重命名和移动
new_file = temp_dir / 'renamed.txt'
test_file.rename(new_file)
print(f"\n文件重命名为: {new_file}")

# 复制文件（需要shutil）
import shutil
copied_file = temp_dir / 'copied.txt'
shutil.copy2(new_file, copied_file)
print(f"文件复制为: {copied_file}")

# 删除文件
copied_file.unlink()
print(f"文件已删除: {copied_file.name}")

# 清理临时目录
shutil.rmtree(temp_dir)
print(f"\n临时目录已清理")
```

### 目录遍历和文件查找

```python
from pathlib import Path
import tempfile

# 创建测试目录结构
temp_dir = Path(tempfile.mkdtemp())
print(f"测试目录: {temp_dir}")

# 创建测试文件和目录
(test_dir / 'dir1').mkdir()
(test_dir / 'dir2').mkdir()
(test_dir / 'file1.txt').write_text('文件1')
(test_dir / 'file2.py').write_text('print("Python文件")')
(test_dir / 'dir1' / 'nested.txt').write_text('嵌套文件')
(test_dir / 'dir2' / 'script.py').write_text('print("脚本")')

# 遍历目录内容
print(f"\n目录内容:")
for item in test_dir.iterdir():
    if item.is_dir():
        print(f"  [目录] {item.name}/")
    else:
        print(f"  [文件] {item.name}")

# 使用glob模式匹配
print(f"\n查找所有.txt文件:")
for txt_file in test_dir.glob('*.txt'):
    print(f"  - {txt_file}")

print(f"\n递归查找所有.py文件:")
for py_file in test_dir.rglob('*.py'):
    print(f"  - {py_file.relative_to(test_dir)}")

print(f"\n查找所有目录:")
for directory in test_dir.glob('*/'):
    print(f"  - {directory.name}")

# 复杂模式匹配
print(f"\n复杂模式匹配:")
patterns = ['*.txt', '*.py', 'dir*']
for pattern in patterns:
    print(f"  模式 '{pattern}':")
    for match in test_dir.glob(pattern):
        print(f"    - {match.relative_to(test_dir)}")

# 清理
shutil.rmtree(test_dir)
```

### 实战应用：项目结构分析器

```python
from pathlib import Path
import sys
from typing import Dict, List, Tuple
from collections import defaultdict

class ProjectAnalyzer:
    """项目结构分析器"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        if not self.project_path.exists():
            raise ValueError(f"项目路径不存在: {project_path}")

        self.file_types: Dict[str, List[Path]] = defaultdict(list)
        self.total_files = 0
        self.total_size = 0

    def analyze(self):
        """分析项目结构"""
        print(f"分析项目: {self.project_path.absolute()}")
        print("=" * 60)

        # 收集文件信息
        for file_path in self.project_path.rglob('*'):
            if file_path.is_file():
                self.total_files += 1
                self.total_size += file_path.stat().st_size

                # 按扩展名分类
                suffix = file_path.suffix.lower()
                if not suffix:
                    suffix = '无扩展名'
                self.file_types[suffix].append(file_path)

        # 显示统计信息
        self._print_statistics()

        # 显示文件类型分布
        self._print_file_type_distribution()

        # 显示最大文件
        self._print_largest_files()

        # 显示目录结构
        self._print_directory_structure()

    def _print_statistics(self):
        """打印统计信息"""
        print("\n📊 项目统计:")
        print(f"  总文件数: {self.total_files:,}")
        print(f"  总大小: {self._format_size(self.total_size)}")
        print(f"  目录数: {sum(1 for _ in self.project_path.rglob('*/') if _.is_dir())}")

    def _print_file_type_distribution(self):
        """打印文件类型分布"""
        print("\n📁 文件类型分布:")

        # 按数量排序
        sorted_types = sorted(
            self.file_types.items(),
            key=lambda x: len(x[1]),
            reverse=True
        )

        for suffix, files in sorted_types[:10]:  # 显示前10种类型
            count = len(files)
            total_size = sum(f.stat().st_size for f in files)
            percentage = (count / self.total_files) * 100
            print(f"  {suffix:10} {count:5d} 个文件 ({percentage:5.1f}%) "
                  f"大小: {self._format_size(total_size)}")

    def _print_largest_files(self):
        """打印最大的文件"""
        print("\n💾 最大的10个文件:")

        # 收集所有文件及其大小
        all_files = []
        for files in self.file_types.values():
            for file in files:
                all_files.append((file, file.stat().st_size))

        # 按大小排序
        largest_files = sorted(all_files, key=lambda x: x[1], reverse=True)[:10]

        for i, (file_path, size) in enumerate(largest_files, 1):
            rel_path = file_path.relative_to(self.project_path)
            print(f"  {i:2d}. {self._format_size(size):>10} - {rel_path}")

    def _print_directory_structure(self, max_depth: int = 3):
        """打印目录结构"""
        print(f"\n📂 目录结构 (最多显示{max_depth}层):")

        def print_dir(path: Path, prefix: str = "", depth: int = 0):
            if depth > max_depth:
                return

            # 统计目录中的文件
            items = list(path.iterdir())
            dirs = [d for d in items if d.is_dir()]
            files = [f for f in items if f.is_file()]

            # 显示当前目录
            dir_name = path.name if depth > 0 else str(path.absolute())
            dir_info = f"[{len(dirs)}个目录, {len(files)}个文件]"
            print(f"{prefix}{dir_name}/ {dir_info}")

            # 显示子目录
            new_prefix = prefix + "  "
            for dir_path in sorted(dirs):
                print_dir(dir_path, new_prefix, depth + 1)

            # 显示文件（最多5个）
            if files and depth < max_depth:
                for file_path in sorted(files)[:5]:
                    size = file_path.stat().st_size
                    print(f"{new_prefix}{file_path.name} ({self._format_size(size)})")

                if len(files) > 5:
                    print(f"{new_prefix}... 还有 {len(files) - 5} 个文件")

        print_dir(self.project_path)

    def find_duplicate_names(self):
        """查找同名文件"""
        print("\n🔍 查找同名文件:")

        name_to_paths = defaultdict(list)
        for file_path in self.project_path.rglob('*'):
            if file_path.is_file():
                name_to_paths[file_path.name].append(file_path)

        duplicates = {name: paths for name, paths in name_to_paths.items() if len(paths) > 1}

        if not duplicates:
            print("  没有找到同名文件")
            return

        print(f"  找到 {len(duplicates)} 组同名文件:")
        for name, paths in list(duplicates.items())[:5]:  # 显示前5组
            print(f"\n  文件名: {name}")
            for path in paths:
                rel_path = path.relative_to(self.project_path)
                size = path.stat().st_size
                print(f"    - {rel_path} ({self._format_size(size)})")

    def generate_tree_diagram(self, output_file: str = "project_tree.txt"):
        """生成树状图"""
        output_path = self.project_path / output_file

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"项目树状图: {self.project_path.name}\n")
            f.write("=" * 60 + "\n\n")

            def write_tree(path: Path, prefix: str = "", is_last: bool = True):
                # 判断是否是最后一个项目
                connector = "└── " if is_last else "├── "

                # 写入当前项目
                name = path.name if path != self.project_path else str(self.project_path.absolute())
                if path.is_dir():
                    f.write(f"{prefix}{connector}{name}/\n")
                else:
                    size = path.stat().st_size
                    f.write(f"{prefix}{connector}{name} ({self._format_size(size)})\n")

                if path.is_dir():
                    # 获取子项目
                    try:
                        items = sorted(path.iterdir(),
                                      key=lambda x: (not x.is_dir(), x.name.lower()))
                    except PermissionError:
                        return

                    # 更新前缀
                    new_prefix = prefix + ("    " if is_last else "│   ")

                    # 递归处理子项目
                    for i, item in enumerate(items):
                        write_tree(item, new_prefix, i == len(items) - 1)

            write_tree(self.project_path)

        print(f"\n📝 树状图已保存到: {output_path}")

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """格式化文件大小"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f}{unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f}PB"

# 使用示例
if __name__ == "__main__":
    # 使用当前目录或指定目录
    target_path = sys.argv[1] if len(sys.argv) > 1 else '.'

    try:
        analyzer = ProjectAnalyzer(target_path)
        analyzer.analyze()
        analyzer.find_duplicate_names()
        analyzer.generate_tree_diagram()
    except Exception as e:
        print(f"错误: {e}")
```

## 10.7 命令行参数：argparse模块

`argparse`模块提供了强大的命令行参数解析功能，可以轻松创建用户友好的命令行接口。

### 基础参数解析

```python
import argparse

# 创建解析器
parser = argparse.ArgumentParser(
    description='一个简单的命令行工具示例',
    epilog='示例: python script.py input.txt --output result.txt --verbose'
)

# 添加位置参数（必需）
parser.add_argument('input', help='输入文件路径')

# 添加可选参数
parser.add_argument('-o', '--output', help='输出文件路径')
parser.add_argument('-v', '--verbose', action='store_true', help='详细输出模式')
parser.add_argument('-q', '--quiet', action='store_true', help='安静模式')

# 添加带类型的参数
parser.add_argument('-n', '--number', type=int, default=1,
                   help='重复次数 (默认: 1)')
parser.add_argument('-s', '--size', type=float,
                   help='大小限制 (单位: MB)')

# 添加选择参数
parser.add_argument('-m', '--mode', choices=['fast', 'normal', 'slow'],
                   default='normal', help='运行模式')

# 添加互斥参数组
group = parser.add_mutually_exclusive_group()
group.add_argument('--enable', action='store_true', help='启用功能')
group.add_argument('--disable', action='store_true', help='禁用功能')

# 解析参数
args = parser.parse_args()

# 使用参数
print(f"输入文件: {args.input}")
print(f"输出文件: {args.output or '未指定'}")
print(f"详细模式: {args.verbose}")
print(f"安静模式: {args.quiet}")
print(f"重复次数: {args.number}")
print(f"大小限制: {args.size or '未指定'} MB")
print(f"运行模式: {args.mode}")
print(f"功能状态: {'启用' if args.enable else '禁用' if args.disable else '未设置'}")

# 参数验证
if args.verbose and args.quiet:
    parser.error("不能同时指定 --verbose 和 --quiet")

if args.number < 1:
    parser.error("--number 必须大于0")
```

### 子命令系统

```python
import argparse

def create_parser():
    """创建带子命令的解析器"""
    parser = argparse.ArgumentParser(description='文件管理工具')
    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    # 创建子命令: list
    list_parser = subparsers.add_parser('list', help='列出文件')
    list_parser.add_argument('directory', help='目录路径')
    list_parser.add_argument('-a', '--all', action='store_true',
                           help='显示所有文件（包括隐藏文件）')
    list_parser.add_argument('-l', '--long', action='store_true',
                           help='长格式显示')

    # 创建子命令: copy
    copy_parser = subparsers.add_parser('copy', help='复制文件')
    copy_parser.add_argument('source', help='源文件路径')
    copy_parser.add_argument('destination', help='目标路径')
    copy_parser.add_argument('-f', '--force', action='store_true',
                           help='强制覆盖已存在文件')
    copy_parser.add_argument('-r', '--recursive', action='store_true',
                           help='递归复制目录')

    # 创建子命令: delete
    delete_parser = subparsers.add_parser('delete', help='删除文件')
    delete_parser.add_argument('path', help='文件或目录路径')
    delete_parser.add_argument('-r', '--recursive', action='store_true',
                             help='递归删除目录')
    delete_parser.add_argument('-f', '--force', action='store_true',
                             help='强制删除，不提示确认')

    # 创建子命令: stats
    stats_parser = subparsers.add_parser('stats', help='显示统计信息')
    stats_parser.add_argument('path', help='文件或目录路径')
    stats_parser.add_argument('-d', '--depth', type=int, default=1,
                            help='目录递归深度')

    return parser

def handle_list(args):
    """处理list命令"""
    print(f"列出目录: {args.directory}")
    print(f"  显示所有文件: {args.all}")
    print(f"  长格式: {args.long}")
    # 实际实现会在这里列出文件
    return True

def handle_copy(args):
    """处理copy命令"""
    print(f"复制文件:")
    print(f"  源: {args.source}")
    print(f"  目标: {args.destination}")
    print(f"  强制覆盖: {args.force}")
    print(f"  递归复制: {args.recursive}")
    # 实际实现会在这里复制文件
    return True

def handle_delete(args):
    """处理delete命令"""
    print(f"删除: {args.path}")
    print(f"  递归删除: {args.recursive}")
    print(f"  强制删除: {args.force}")

    if not args.force:
        # 模拟确认提示
        response = input("确认删除? (y/N): ")
        if response.lower() != 'y':
            print("取消删除")
            return False

    # 实际实现会在这里删除文件
    print("删除成功")
    return True

def handle_stats(args):
    """处理stats命令"""
    print(f"统计信息: {args.path}")
    print(f"  递归深度: {args.depth}")
    # 实际实现会在这里计算统计信息
    return True

def main():
    """主函数"""
    parser = create_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # 根据命令调用相应的处理函数
    handlers = {
        'list': handle_list,
        'copy': handle_copy,
        'delete': handle_delete,
        'stats': handle_stats
    }

    handler = handlers.get(args.command)
    if handler:
        try:
            success = handler(args)
            exit_code = 0 if success else 1
        except Exception as e:
            print(f"错误: {e}")
            exit_code = 1
    else:
        print(f"未知命令: {args.command}")
        exit_code = 1

    return exit_code

if __name__ == "__main__":
    import sys
    # 模拟命令行参数进行测试
    test_args = ['file_tool.py', 'list', '.', '-l']
    sys.argv = test_args

    exit_code = main()
    sys.exit(exit_code)
```

### 高级特性

```python
import argparse
import sys

class CustomFormatter(argparse.RawDescriptionHelpFormatter):
    """自定义帮助信息格式化器"""

    def _format_action(self, action):
        # 默认格式化
        result = super()._format_action(action)

        # 为可选参数添加示例
        if action.option_strings:
            # 获取参数示例（如果有的话）
            example = getattr(action, 'example', None)
            if example:
                result += f'\n  示例: {example}\n'

        return result

def create_advanced_parser():
    """创建高级解析器"""

    parser = argparse.ArgumentParser(
        formatter_class=CustomFormatter,
        description='''高级命令行工具示例

这个工具提供了多种功能，包括文件处理、数据分析和系统监控。
使用子命令来执行特定操作。''',
        epilog='''
示例:
  %(prog)s process -i input.csv -o output.json --format json
  %(prog)s analyze --threshold 0.8 --verbose
  %(prog)s monitor --interval 5 --duration 60
        '''
    )

    # 添加全局参数
    parser.add_argument('--version', action='version', version='%(prog)s 1.0.0')
    parser.add_argument('--config', help='配置文件路径',
                       metavar='FILE', default='config.ini')

    subparsers = parser.add_subparsers(dest='command', title='可用命令')

    # process 命令
    process_parser = subparsers.add_parser('process',
                                         help='处理数据文件')
    process_parser.add_argument('-i', '--input', required=True,
                              help='输入文件', metavar='INFILE')
    process_parser.add_argument('-o', '--output', required=True,
                              help='输出文件', metavar='OUTFILE')
    process_parser.add_argument('--format', choices=['json', 'csv', 'xml'],
                              default='json', help='输出格式')
    process_parser.add_argument('--encoding', default='utf-8',
                              help='文件编码')
    process_parser.add_argument('--workers', type=int, default=1,
                              help='工作进程数', metavar='N')
    process_parser.add_argument('--chunk-size', type=int, default=1000,
                              help='处理块大小')

    # 为参数添加示例（自定义属性）
    process_parser._actions[2].example = '--input data.csv --output result.json'

    # analyze 命令
    analyze_parser = subparsers.add_parser('analyze',
                                         help='分析数据')
    analyze_parser.add_argument('data', help='数据文件或目录')
    analyze_parser.add_argument('--threshold', type=float, default=0.5,
                              help='分析阈值', metavar='T')
    analyze_parser.add_argument('--method', choices=['mean', 'median', 'mode'],
                              default='mean', help='分析方法')
    analyze_parser.add_argument('--output-dir', help='输出目录')
    analyze_parser.add_argument('--plot', action='store_true',
                              help='生成图表')

    # 参数组
    filter_group = analyze_parser.add_argument_group('过滤选项')
    filter_group.add_argument('--min-value', type=float,
                            help='最小值过滤')
    filter_group.add_argument('--max-value', type=float,
                            help='最大值过滤')
    filter_group.add_argument('--exclude-outliers', action='store_true',
                            help='排除异常值')

    # monitor 命令
    monitor_parser = subparsers.add_parser('monitor',
                                         help='监控系统')
    monitor_parser.add_argument('--interval', type=float, default=1.0,
                              help='监控间隔（秒）', metavar='SECONDS')
    monitor_parser.add_argument('--duration', type=float, default=30.0,
                              help='监控时长（秒）', metavar='SECONDS')

    monitor_types = monitor_parser.add_subparsers(dest='monitor_type',
                                                help='监控类型')

    # CPU 监控
    cpu_parser = monitor_types.add_parser('cpu', help='监控CPU使用率')
    cpu_parser.add_argument('--cores', action='store_true',
                          help='显示每个核心的使用率')

    # 内存监控
    mem_parser = monitor_types.add_parser('memory', help='监控内存使用')
    mem_parser.add_argument('--swap', action='store_true',
                          help='包括交换空间')

    # 磁盘监控
    disk_parser = monitor_types.add_parser('disk', help='监控磁盘使用')
    disk_parser.add_argument('--all-drives', action='store_true',
                           help='监控所有驱动器')

    return parser

def main():
    """主函数"""
    parser = create_advanced_parser()

    # 如果没有参数，显示帮助
    if len(sys.argv) == 1:
        parser.print_help()
        return

    # 解析参数
    args = parser.parse_args()

    print("解析到的参数:")
    print(f"  配置文件: {args.config}")

    if args.command:
        print(f"  命令: {args.command}")

        # 显示特定命令的参数
        if args.command == 'process':
            print(f"  输入文件: {args.input}")
            print(f"  输出文件: {args.output}")
            print(f"  格式: {args.format}")
            print(f"  编码: {args.encoding}")
            print(f"  工作进程数: {args.workers}")
            print(f"  块大小: {args.chunk_size}")

        elif args.command == 'analyze':
            print(f"  数据: {args.data}")
            print(f"  阈值: {args.threshold}")
            print(f"  方法: {args.method}")
            print(f"  输出目录: {args.output_dir or '未指定'}")
            print(f"  生成图表: {args.plot}")

            if args.min_value or args.max_value or args.exclude_outliers:
                print("  过滤选项:")
                if args.min_value:
                    print(f"    最小值: {args.min_value}")
                if args.max_value:
                    print(f"    最大值: {args.max_value}")
                if args.exclude_outliers:
                    print("    排除异常值: 是")

        elif args.command == 'monitor':
            print(f"  监控间隔: {args.interval}秒")
            print(f"  监控时长: {args.duration}秒")

            if args.monitor_type:
                print(f"  监控类型: {args.monitor_type}")

                if args.monitor_type == 'cpu':
                    print(f"    显示核心详情: {args.cores}")
                elif args.monitor_type == 'memory':
                    print(f"    包括交换空间: {args.swap}")
                elif args.monitor_type == 'disk':
                    print(f"    监控所有驱动器: {args.all_drives}")
    else:
        print("  未指定命令")

if __name__ == "__main__":
    # 测试不同的命令行参数
    test_cases = [
        ['script.py', '--help'],
        ['script.py', 'process', '--help'],
        ['script.py', 'process', '-i', 'input.csv', '-o', 'output.json'],
        ['script.py', 'analyze', 'data.txt', '--threshold', '0.8', '--plot'],
        ['script.py', 'monitor', 'cpu', '--interval', '2', '--cores'],
    ]

    print("=== argparse 高级特性演示 ===\n")

    for i, test_args in enumerate(test_cases, 1):
        print(f"测试用例 {i}: {test_args}")
        print("-" * 40)

        # 临时修改sys.argv
        original_argv = sys.argv
        sys.argv = test_args

        try:
            main()
        except SystemExit:
            pass  # argparse会调用sys.exit()来退出

        print("\n")

        # 恢复原始argv
        sys.argv = original_argv
```

## 10.8 数据压缩：zipfile与tarfile

Python提供了`zipfile`和`tarfile`模块来处理压缩文件，支持ZIP和TAR格式。

### zipfile模块：处理ZIP文件

```python
import zipfile
import os
import tempfile
from pathlib import Path

def demonstrate_zipfile():
    """演示zipfile模块的基本用法"""

    # 创建临时目录用于测试
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        print(f"工作目录: {temp_path}")

        # 创建一些测试文件
        (temp_path / 'file1.txt').write_text('这是第一个文件的内容')
        (temp_path / 'file2.txt').write_text('这是第二个文件的内容')
        (temp_path / 'subdir').mkdir()
        (temp_path / 'subdir' / 'file3.txt').write_text('子目录中的文件')

        # 1. 创建ZIP文件
        zip_path = temp_path / 'archive.zip'
        print(f"\n1. 创建ZIP文件: {zip_path.name}")

        with zipfile.ZipFile(zip_path, 'w') as zipf:
            # 添加单个文件
            zipf.write(temp_path / 'file1.txt', 'file1.txt')
            print(f"  添加文件: file1.txt")

            # 添加多个文件
            for file in temp_path.glob('*.txt'):
                arcname = file.relative_to(temp_path)
                zipf.write(file, arcname)
                print(f"  添加文件: {arcname}")

            # 添加目录（不包括子目录内容）
            zipf.write(temp_path / 'subdir', 'subdir/')
            print(f"  添加目录: subdir/")

            # 添加目录及其内容
            for file in (temp_path / 'subdir').rglob('*'):
                if file.is_file():
                    arcname = file.relative_to(temp_path)
                    zipf.write(file, arcname)
                    print(f"  添加文件: {arcname}")

        print(f"  ZIP文件大小: {zip_path.stat().st_size} 字节")

        # 2. 读取ZIP文件信息
        print(f"\n2. 读取ZIP文件信息")
        with zipfile.ZipFile(zip_path, 'r') as zipf:
            print(f"  文件列表:")
            for info in zipf.infolist():
                compressed = info.compress_size
                original = info.file_size
                ratio = (compressed / original * 100) if original > 0 else 0
                print(f"    {info.filename:20} "
                      f"{original:8} -> {compressed:8} 字节 "
                      f"({ratio:.1f}%)")

            print(f"\n  测试ZIP文件完整性:")
            if zipf.testzip() is None:
                print("    ZIP文件完整无损")
            else:
                print("    ZIP文件损坏")

        # 3. 提取文件
        print(f"\n3. 提取文件")
        extract_dir = temp_path / 'extracted'
        extract_dir.mkdir()

        with zipfile.ZipFile(zip_path, 'r') as zipf:
            # 提取单个文件
            zipf.extract('file1.txt', extract_dir)
            print(f"  提取单个文件: file1.txt")

            # 提取所有文件
            zipf.extractall(extract_dir / 'all')
            print(f"  提取所有文件到: all/")

            # 验证提取的文件
            extracted_files = list(extract_dir.rglob('*'))
            print(f"  共提取 {len([f for f in extracted_files if f.is_file()])} 个文件")

        # 4. 使用不同的压缩方法
        print(f"\n4. 不同压缩方法比较")
        test_file = temp_path / 'file1.txt'
        test_data = test_file.read_text()

        methods = [
            (zipfile.ZIP_STORED, '存储（不压缩）'),
            (zipfile.ZIP_DEFLATED, 'DEFLATE压缩'),
            (zipfile.ZIP_BZIP2, 'BZIP2压缩'),
            (zipfile.ZIP_LZMA, 'LZMA压缩'),
        ]

        for method, name in methods:
            try:
                zip_path = temp_path / f'test_{method}.zip'
                with zipfile.ZipFile(zip_path, 'w', method) as zipf:
                    zipf.writestr('test.txt', test_data * 100)  # 放大数据

                size = zip_path.stat().st_size
                ratio = (size / (len(test_data) * 100)) * 100
                print(f"  {name:15} : {size:6} 字节 ({ratio:.1f}%)")

            except (zipfile.LargeZipFile, NotImplementedError) as e:
                print(f"  {name:15} : 不支持 ({e})")

        # 5. 在ZIP文件中读写文本
        print(f"\n5. 在ZIP中读写文本文件")
        with zipfile.ZipFile(temp_path / 'text_archive.zip', 'w') as zipf:
            # 直接写入文本
            zipf.writestr('document.txt', '这是直接写入的文本内容\n第二行')

            # 写入二进制数据
            zipf.writestr('data.bin', b'\x00\x01\x02\x03\x04\x05')

        # 读取文本
        with zipfile.ZipFile(temp_path / 'text_archive.zip', 'r') as zipf:
            text = zipf.read('document.txt').decode('utf-8')
            print(f"  读取的文本: {text[:30]}...")

            # 使用ZipFile.open()以文本模式读取
            with zipf.open('document.txt', 'r') as f:
                lines = f.read().decode('utf-8').splitlines()
                print(f"  文本行数: {len(lines)}")

        print(f"\n演示完成，临时目录已自动清理")

# 运行演示
demonstrate_zipfile()
```

### tarfile模块：处理TAR文件

```python
import tarfile
import os
import tempfile
from pathlib import Path
import gzip
import bz2

def demonstrate_tarfile():
    """演示tarfile模块的基本用法"""

    # 创建临时目录用于测试
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        print(f"工作目录: {temp_path}")

        # 创建测试文件和目录结构
        (temp_path / 'data').mkdir()
        (temp_path / 'data' / 'file1.txt').write_text('第一个文件的内容' * 10)
        (temp_path / 'data' / 'file2.txt').write_text('第二个文件的内容' * 5)
        (temp_path / 'data' / 'config.json').write_text('{"key": "value"}')
        (temp_path / 'data' / 'subdir').mkdir()
        (temp_path / 'data' / 'subdir' / 'nested.txt').write_text('嵌套文件')

        print(f"创建了测试目录结构")

        # 1. 创建TAR文件
        print(f"\n1. 创建TAR文件")

        # 创建普通TAR文件
        tar_path = temp_path / 'archive.tar'
        with tarfile.open(tar_path, 'w') as tar:
            tar.add(temp_path / 'data', arcname='data')
            print(f"  创建: {tar_path.name}")

            # 添加单个文件
            file_info = tar.gettarinfo(str(temp_path / 'data' / 'file1.txt'))
            with open(temp_path / 'data' / 'file1.txt', 'rb') as f:
                tar.addfile(file_info, f)
            print(f"  添加文件: {file_info.name}")

        print(f"  TAR文件大小: {tar_path.stat().st_size} 字节")

        # 2. 压缩的TAR文件
        print(f"\n2. 创建压缩的TAR文件")

        # gzip压缩
        tar_gz_path = temp_path / 'archive.tar.gz'
        with tarfile.open(tar_gz_path, 'w:gz') as tar:
            tar.add(temp_path / 'data', arcname='data')
        print(f"  gzip压缩: {tar_gz_path.name} "
              f"({tar_gz_path.stat().st_size} 字节)")

        # bzip2压缩
        tar_bz2_path = temp_path / 'archive.tar.bz2'
        with tarfile.open(tar_bz2_path, 'w:bz2') as tar:
            tar.add(temp_path / 'data', arcname='data')
        print(f"  bzip2压缩: {tar_bz2_path.name} "
              f"({tar_bz2_path.stat().st_size} 字节)")

        # xz压缩 (LZMA)
        tar_xz_path = temp_path / 'archive.tar.xz'
        with tarfile.open(tar_xz_path, 'w:xz') as tar:
            tar.add(temp_path / 'data', arcname='data')
        print(f"  xz压缩: {tar_xz_path.name} "
              f"({tar_xz_path.stat().st_size} 字节)")

        # 3. 读取TAR文件
        print(f"\n3. 读取TAR文件内容")

        archives = [
            (tar_path, 'r', '未压缩'),
            (tar_gz_path, 'r:gz', 'gzip压缩'),
            (tar_bz2_path, 'r:bz2', 'bzip2压缩'),
            (tar_xz_path, 'r:xz', 'xz压缩'),
        ]

        for archive_path, mode, description in archives:
            print(f"\n  {description}:")
            try:
                with tarfile.open(archive_path, mode) as tar:
                    print(f"    文件列表:")
                    for member in tar.getmembers():
                        if member.isfile():
                            print(f"      {member.name:30} "
                                  f"{member.size:8} 字节 "
                                  f"{tarfile.filemode(member.mode)}")

                    # 获取特定文件的信息
                    try:
                        info = tar.getmember('data/file1.txt')
                        print(f"\n    文件 'data/file1.txt' 的详细信息:")
                        print(f"      大小: {info.size} 字节")
                        print(f"      权限: {oct(info.mode)}")
                        print(f"      修改时间: {info.mtime}")
                        print(f"      类型: {info.type}")
                    except KeyError:
                        pass
            except Exception as e:
                print(f"    错误: {e}")

        # 4. 提取文件
        print(f"\n4. 提取文件")

        extract_dir = temp_path / 'extracted'
        extract_dir.mkdir()

        with tarfile.open(tar_gz_path, 'r:gz') as tar:
            # 提取单个文件
            tar.extract('data/file1.txt', extract_dir)
            print(f"  提取单个文件: data/file1.txt")

            # 提取所有文件到新目录
            tar.extractall(extract_dir / 'all')
            print(f"  提取所有文件到: all/")

            # 使用过滤器提取特定文件
            def filter_members(members):
                for member in members:
                    if member.name.endswith('.txt'):
                        print(f"    通过过滤器: {member.name}")
                        yield member

            filtered_dir = extract_dir / 'filtered'
            filtered_dir.mkdir()
            tar.extractall(filtered_dir, members=filter_members(tar))
            print(f"  过滤提取文本文件到: filtered/")

        # 5. 创建TAR文件流
        print(f"\n5. 创建TAR文件流（内存中）")

        import io

        # 在内存中创建TAR文件
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode='w') as tar:
            # 添加文本文件
            text_data = "内存中的文件内容".encode('utf-8')
            info = tarfile.TarInfo(name='memory_file.txt')
            info.size = len(text_data)
            tar.addfile(info, io.BytesIO(text_data))
            print(f"  添加内存文件: memory_file.txt")

            # 添加二进制数据
            binary_data = b'\x00\x01\x02\x03\x04\x05'
            info = tarfile.TarInfo(name='data.bin')
            info.size = len(binary_data)
            tar.addfile(info, io.BytesIO(binary_data))
            print(f"  添加二进制文件: data.bin")

        # 获取TAR数据
        tar_data = tar_buffer.getvalue()
        print(f"  TAR数据大小: {len(tar_data)} 字节")

        # 从内存读取TAR文件
        tar_buffer.seek(0)  # 重置指针
        with tarfile.open(fileobj=tar_buffer, mode='r') as tar:
            print(f"  内存TAR文件内容:")
            for member in tar.getmembers():
                print(f"    {member.name} ({member.size} 字节)")

                # 读取文件内容
                if member.name == 'memory_file.txt':
                    content = tar.extractfile(member).read().decode('utf-8')
                    print(f"      内容: {content}")

        print(f"\n演示完成，临时目录已自动清理")

# 运行演示
demonstrate_tarfile()
```

### 实战应用：备份工具

```python
import zipfile
import tarfile
import os
import sys
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
import argparse

class BackupTool:
    """备份工具"""

    SUPPORTED_FORMATS = {
        'zip': '.zip',
        'tar': '.tar',
        'gztar': '.tar.gz',
        'bztar': '.tar.bz2',
        'xztar': '.tar.xz'
    }

    def __init__(self, source: Path, destination: Path,
                 format: str = 'zip', exclude: Optional[List[str]] = None):
        """
        初始化备份工具

        Args:
            source: 源目录
            destination: 目标目录
            format: 备份格式 (zip, tar, gztar, bztar, xztar)
            exclude: 排除模式列表
        """
        self.source = source.resolve()
        self.destination = destination.resolve()
        self.format = format
        self.exclude_patterns = exclude or []

        if not self.source.exists():
            raise ValueError(f"源目录不存在: {self.source}")

        if not self.destination.exists():
            self.destination.mkdir(parents=True, exist_ok=True)

        if format not in self.SUPPORTED_FORMATS:
            raise ValueError(f"不支持的格式: {format}。"
                           f"支持的格式: {', '.join(self.SUPPORTED_FORMATS.keys())}")

    def _should_exclude(self, file_path: Path) -> bool:
        """检查文件是否应该被排除"""
        rel_path = file_path.relative_to(self.source)

        for pattern in self.exclude_patterns:
            # 简单的通配符匹配
            if '*' in pattern:
                # 将通配符转换为正则表达式
                import re
                regex_pattern = pattern.replace('.', '\\.').replace('*', '.*')
                if re.match(regex_pattern, str(rel_path)):
                    return True
            elif str(rel_path).startswith(pattern):
                return True

        return False

    def _get_backup_filename(self) -> str:
        """生成备份文件名"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        basename = self.source.name or 'backup'
        extension = self.SUPPORTED_FORMATS[self.format]

        return f"{basename}_{timestamp}{extension}"

    def create_backup(self, verbose: bool = False) -> Path:
        """创建备份"""
        backup_file = self.destination / self._get_backup_filename()

        print(f"创建备份:")
        print(f"  源目录: {self.source}")
        print(f"  备份文件: {backup_file}")
        print(f"  格式: {self.format}")

        if self.exclude_patterns:
            print(f"  排除模式: {', '.join(self.exclude_patterns)}")

        # 收集要备份的文件
        files_to_backup: List[Path] = []
        total_size = 0

        for file_path in self.source.rglob('*'):
            if file_path.is_file():
                if not self._should_exclude(file_path):
                    files_to_backup.append(file_path)
                    total_size += file_path.stat().st_size

        print(f"  包含 {len(files_to_backup)} 个文件，共 {self._format_size(total_size)}")

        # 创建备份
        backup_methods = {
            'zip': self._create_zip_backup,
            'tar': self._create_tar_backup,
            'gztar': lambda f, files: self._create_tar_backup(f, files, 'w:gz'),
            'bztar': lambda f, files: self._create_tar_backup(f, files, 'w:bz2'),
            'xztar': lambda f, files: self._create_tar_backup(f, files, 'w:xz'),
        }

        backup_method = backup_methods[self.format]
        backup_method(backup_file, files_to_backup)

        # 验证备份
        backup_size = backup_file.stat().st_size
        compression_ratio = (backup_size / total_size * 100) if total_size > 0 else 0

        print(f"\n备份完成!")
        print(f"  备份文件大小: {self._format_size(backup_size)}")
        print(f"  压缩率: {compression_ratio:.1f}%")

        # 创建校验和文件
        checksum = self._create_checksum(backup_file)
        checksum_file = backup_file.with_suffix('.sha256')
        checksum_file.write_text(f"{checksum}  {backup_file.name}\n")
        print(f"  校验和: {checksum_file.name}")

        return backup_file

    def _create_zip_backup(self, backup_file: Path, files: List[Path]):
        """创建ZIP备份"""
        with zipfile.ZipFile(backup_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_path in files:
                arcname = file_path.relative_to(self.source)
                zipf.write(file_path, arcname)
                print(f"  添加: {arcname}")

    def _create_tar_backup(self, backup_file: Path, files: List[Path],
                          mode: str = 'w'):
        """创建TAR备份"""
        with tarfile.open(backup_file, mode) as tar:
            for file_path in files:
                arcname = file_path.relative_to(self.source)
                tar.add(file_path, arcname, recursive=False)
                print(f"  添加: {arcname}")

    def _create_checksum(self, file_path: Path) -> str:
        """创建文件的SHA256校验和"""
        hasher = hashlib.sha256()

        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                hasher.update(chunk)

        return hasher.hexdigest()

    def verify_backup(self, backup_file: Path) -> bool:
        """验证备份文件"""
        print(f"验证备份文件: {backup_file.name}")

        # 检查校验和文件
        checksum_file = backup_file.with_suffix('.sha256')
        if not checksum_file.exists():
            print("  警告: 未找到校验和文件")
            return False

        expected_checksum = checksum_file.read_text().split()[0]
        actual_checksum = self._create_checksum(backup_file)

        if expected_checksum == actual_checksum:
            print(f"  ✓ 校验和验证通过")
            return True
        else:
            print(f"  ✗ 校验和不匹配!")
            print(f"    期望: {expected_checksum}")
            print(f"    实际: {actual_checksum}")
            return False

    def list_backups(self) -> List[Path]:
        """列出所有备份文件"""
        backups = []

        for ext in self.SUPPORTED_FORMATS.values():
            for backup_file in self.destination.glob(f'*{ext}'):
                backups.append(backup_file)

        backups.sort(key=lambda x: x.stat().st_mtime, reverse=True)

        return backups

    def restore_backup(self, backup_file: Path, target_dir: Path,
                      verify: bool = True):
        """恢复备份"""
        print(f"恢复备份:")
        print(f"  备份文件: {backup_file}")
        print(f"  目标目录: {target_dir}")

        if verify and not self.verify_backup(backup_file):
            print("  备份验证失败，停止恢复")
            return False

        # 确保目标目录存在
        target_dir.mkdir(parents=True, exist_ok=True)

        # 根据文件类型选择恢复方法
        if backup_file.suffix == '.zip':
            self._restore_zip_backup(backup_file, target_dir)
        elif backup_file.suffix in ('.tar', '.gz', '.bz2', '.xz'):
            self._restore_tar_backup(backup_file, target_dir)
        else:
            raise ValueError(f"不支持的备份格式: {backup_file.suffix}")

        print(f"  恢复完成!")
        return True

    def _restore_zip_backup(self, backup_file: Path, target_dir: Path):
        """恢复ZIP备份"""
        with zipfile.ZipFile(backup_file, 'r') as zipf:
            zipf.extractall(target_dir)
            print(f"  提取了 {len(zipf.namelist())} 个文件")

    def _restore_tar_backup(self, backup_file: Path, target_dir: Path):
        """恢复TAR备份"""
        mode = 'r'
        if backup_file.suffix == '.gz':
            mode = 'r:gz'
        elif backup_file.suffix == '.bz2':
            mode = 'r:bz2'
        elif backup_file.suffix == '.xz':
            mode = 'r:xz'

        with tarfile.open(backup_file, mode) as tar:
            tar.extractall(target_dir)
            print(f"  提取了 {len(tar.getmembers())} 个文件/目录")

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """格式化文件大小"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f}{unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f}TB"

def create_cli_parser():
    """创建命令行界面"""
    parser = argparse.ArgumentParser(
        description='文件备份工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s backup /home/user/docs ./backups --format gztar
  %(prog)s list ./backups
  %(prog)s restore ./backups/docs_20240101_120000.tar.gz ./restored
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    # backup 命令
    backup_parser = subparsers.add_parser('backup', help='创建备份')
    backup_parser.add_argument('source', help='源目录')
    backup_parser.add_argument('destination', help='目标目录')
    backup_parser.add_argument('--format', choices=['zip', 'tar', 'gztar', 'bztar', 'xztar'],
                              default='zip', help='备份格式')
    backup_parser.add_argument('--exclude', nargs='+', help='排除模式')
    backup_parser.add_argument('--verbose', '-v', action='store_true', help='详细输出')

    # list 命令
    list_parser = subparsers.add_parser('list', help='列出备份')
    list_parser.add_argument('directory', help='备份目录')

    # restore 命令
    restore_parser = subparsers.add_parser('restore', help='恢复备份')
    restore_parser.add_argument('backup_file', help='备份文件')
    restore_parser.add_argument('target_dir', help='目标目录')
    restore_parser.add_argument('--no-verify', action='store_true',
                              help='不验证备份完整性')

    # verify 命令
    verify_parser = subparsers.add_parser('verify', help='验证备份')
    verify_parser.add_argument('backup_file', help='备份文件')

    return parser

def main():
    """主函数"""
    parser = create_cli_parser()

    if len(sys.argv) == 1:
        parser.print_help()
        return

    args = parser.parse_args()

    try:
        if args.command == 'backup':
            backup_tool = BackupTool(
                source=Path(args.source),
                destination=Path(args.destination),
                format=args.format,
                exclude=args.exclude
            )
            backup_tool.create_backup(verbose=args.verbose)

        elif args.command == 'list':
            backup_tool = BackupTool(
                source=Path('.'),
                destination=Path(args.directory),
                format='zip'
            )

            backups = backup_tool.list_backups()
            if not backups:
                print(f"在 {args.directory} 中未找到备份文件")
            else:
                print(f"找到 {len(backups)} 个备份文件:")
                for i, backup in enumerate(backups, 1):
                    size = backup.stat().st_size
                    mtime = datetime.fromtimestamp(backup.stat().st_mtime)
                    print(f"{i:2d}. {backup.name:40} "
                          f"{backup_tool._format_size(size):>10} "
                          f"{mtime.strftime('%Y-%m-%d %H:%M:%S')}")

        elif args.command == 'restore':
            backup_tool = BackupTool(
                source=Path('.'),
                destination=Path('.'),
                format='zip'
            )

            backup_tool.restore_backup(
                backup_file=Path(args.backup_file),
                target_dir=Path(args.target_dir),
                verify=not args.no_verify
            )

        elif args.command == 'verify':
            backup_tool = BackupTool(
                source=Path('.'),
                destination=Path('.'),
                format='zip'
            )

            success = backup_tool.verify_backup(Path(args.backup_file))
            sys.exit(0 if success else 1)

    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # 演示使用
    print("=== 备份工具演示 ===\n")

    # 创建测试目录
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        test_source = Path(tmpdir) / 'source'
        test_dest = Path(tmpdir) / 'backups'

        # 创建测试文件
        test_source.mkdir(parents=True)
        (test_source / 'doc1.txt').write_text('文档1内容')
        (test_source / 'doc2.txt').write_text('文档2内容')
        (test_source / 'subdir').mkdir()
        (test_source / 'subdir' / 'doc3.txt').write_text('子目录文档')

        print(f"测试环境:")
        print(f"  源目录: {test_source}")
        print(f"  备份目录: {test_dest}")

        # 创建备份工具实例
        backup_tool = BackupTool(
            source=test_source,
            destination=test_dest,
            format='gztar',
            exclude=['*.tmp']  # 排除临时文件
        )

        # 创建备份
        print("\n1. 创建备份")
        backup_file = backup_tool.create_backup(verbose=True)

        # 列出备份
        print("\n2. 列出备份")
        backups = backup_tool.list_backups()
        for backup in backups:
            print(f"  - {backup.name}")

        # 验证备份
        print("\n3. 验证备份")
        backup_tool.verify_backup(backup_file)

        # 恢复备份
        print("\n4. 恢复备份到新位置")
        restore_dir = Path(tmpdir) / 'restored'
        backup_tool.restore_backup(backup_file, restore_dir)

        # 验证恢复的文件
        restored_files = list(restore_dir.rglob('*.txt'))
        print(f"  恢复了 {len(restored_files)} 个文本文件")

    print("\n演示完成!")
```

## 总结：掌握Python标准库的力量

通过本章的学习，你已经掌握了Python标准库中最常用和强大的模块：

### 关键要点回顾

1. **math模块**：精确的数学计算，科学计算的基础
2. **random模块**：随机数生成，模拟和测试的关键
3. **datetime模块**：日期时间处理，时间相关操作的核心
4. **sys模块**：系统交互，Python运行环境控制
5. **os模块**：操作系统接口，文件和进程管理
6. **pathlib模块**：现代化路径操作，更直观的文件系统交互
7. **argparse模块**：专业命令行界面，创建用户友好的工具
8. **压缩模块**：数据处理和归档，zipfile和tarfile的威力

### 最佳实践建议

1. **优先使用标准库**：避免重复造轮子
2. **了解模块特性**：选择最适合任务的模块
3. **组合使用模块**：模块间协同工作更强大
4. **查阅官方文档**：[Python标准库文档](https://docs.python.org/3/library/)是最佳资源

### 下一步学习方向

1. **深入特定领域**：
   - 科学计算：`numpy`, `scipy`
   - 数据处理：`pandas`
   - 网络编程：`socket`, `http.client`
   - 并发编程：`threading`, `multiprocessing`, `asyncio`

2. **探索第三方库**：
   - Web开发：`Django`, `Flask`
   - 数据分析：`pandas`, `matplotlib`
   - 机器学习：`scikit-learn`, `tensorflow`

3. **实践项目**：
   - 创建自己的命令行工具
   - 实现文件备份系统
   - 开发数据批处理脚本

### 记住的原则

1. **"内置电池"哲学**：Python提供了丰富的工具，先查标准库
2. **可读性优先**：选择最清晰、最易理解的方式
3. **错误处理**：总是考虑边界情况和异常
4. **文档和测试**：良好的文档和测试让代码更可靠

标准库是Python编程的基础设施，掌握它们意味着你可以：

- 更快地解决问题
- 写出更健壮的代码
- 更好地理解Python生态系统
- 为学习更高级的库打下坚实基础

现在，去实践吧！将这些模块应用到你的项目中，体验Python标准库带来的便利和强大功能。记住，**优秀的Python开发者不仅是第三方库的使用者，更是标准库的大师**。

**继续学习资源**：

- [Python官方文档 - 标准库](https://docs.python.org/3/library/)
- [Python Module of the Week](https://pymotw.com/3/)
- [Real Python - Python标准库教程](https://realpython.com/tutorials/libraries/)
- [Python Cookbook](https://www.oreilly.com/library/view/python-cookbook-3rd/9781449357337/)
