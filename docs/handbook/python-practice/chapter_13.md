# 第13章 数据处理与ETL工程

你写了一个脚本读取一份2GB的CSV文件，内存直接爆了。你换了台32G内存的机器跑，还是爆了。你上网搜了一下，发现别人用pandas读同样的文件只要3秒，你用了30秒还把内存吃光了。更崩溃的是，你的ETL任务每天凌晨跑，最近数据量涨了3倍，跑着跑着就OOM了，你只能半夜爬起来重启。你开始怀疑人生：为什么别人的数据处理流水线丝滑得像德芙，你的却像堵车的高架桥？

如果你经历过这些，说明你需要系统性地理解数据处理和ETL工程的底层原理，而不是停留在"调个API能用就行"的阶段。

我是怕浪猫，这是Python实战训练营第13周的内容。本周我们深入数据处理核心库的底层机制，从pandas的内存布局到polars的Rust引擎，从numpy的广播机制到完整的ETL流程设计，把数据处理从"能跑"升级到"跑得快、跑得稳、跑得省"。怕浪猫会把在生产环境踩过的坑都写出来，那些深夜OOM的教训，希望能帮你少走弯路。

## 一、pandas进阶：你以为你懂DataFrame

很多人用了三年pandas，从来没关心过DataFrame底层是怎么存数据的。直到有一天，你对一个1000万行的DataFrame做了一次`astype('category')`，内存占用直接降了90%，你才开始好奇：这到底发生了什么？

### 1.1 BlockManager与内存布局

DataFrame不是一个二维数组，而是一个列式存储的容器。pandas内部用BlockManager管理数据，相同dtype的列会被打包到同一个Block中，以numpy ndarray的形式存储。这意味着，一个包含int64列和float64列的DataFrame，内部至少有两个Block。

这个设计有什么实际影响？当你按列访问数据时，pandas直接返回对应Block的视图，效率很高。但当你按行访问时（比如`df.iloc[0]`），pandas需要从多个Block中各取一个元素再拼起来，开销大得多。怕浪猫在项目中见过有人用`for i in range(len(df)): row = df.iloc[i]`遍历DataFrame，100万行跑了两分钟，改成向量化操作后只要0.1秒。

```python
import pandas as pd
import numpy as np

# 查看BlockManager的内部结构
df = pd.DataFrame({
    'a': np.arange(5, dtype='int64'),
    'b': np.arange(5, dtype='int64'),
    'c': np.arange(5, dtype='float64'),
    'd': ['x'] * 5,
})

# 查看内部blocks
print(df._mgr.blocks)
# 输出两个Block: [int64 block (2列), float64 block (1列), object block (1列)]

# 按列访问：高效，直接返回Block视图
col_a = df['a']  # O(1)操作

# 按行访问：低效，需要跨Block拼接
row_0 = df.iloc[0]  # 需要从3个Block各取一个元素
```

> 理解数据在内存中怎么躺着，是性能优化的第一步。你不是在操作表格，你是在操作内存布局。

一个实战踩坑案例：怕浪猫曾经处理一个用户行为日志表，有200列，大部分是object类型（字符串）。内存占用高达12GB，性能极差。排查后发现，很多列其实只有几个不同的值（比如"设备类型"列只有"iOS"、"Android"、"Web"三个值），转成Categorical类型后，内存从12GB降到1.8GB。这说明了解底层存储机制不是花架子，它能直接救你的命。

### 1.2 索引与对齐机制：Index的力量

pandas的Index不只是行号，它是数据对齐的核心机制。当你对两个Series做运算时，pandas会自动根据Index对齐数据，而不是简单地按位置相加。这个特性在处理不完整数据时非常有用，但也可能导致意外的行为。

```python
import pandas as pd

# Index自动对齐
s1 = pd.Series([1, 2, 3], index=['a', 'b', 'c'])
s2 = pd.Series([10, 20, 30], index=['b', 'c', 'd'])

# 不是按位置相加，而是按Index对齐
result = s1 + s2
print(result)
# a     NaN  # s1有a，s2没有
# b    12.0  # 2 + 10
# c    23.0  # 3 + 20
# d     NaN  # s2有d，s1没有

# 用fill_value避免NaN
result_filled = s1.add(s2, fill_value=0)
print(result_filled)
# a     1.0
# b    12.0
# c    23.0
# d    30.0
```

MultiIndex是pandas处理多维数据的利器。当你需要按多个维度分析数据时（比如按"城市+日期"分组统计销售额），MultiIndex比扁平化的列结构高效得多。但MultiIndex也是一个踩坑大户，特别是`reindex`和`loc`的组合使用。

```python
# MultiIndex的构建与查询
index = pd.MultiIndex.from_tuples(
    [('北京', '2024-01'), ('北京', '2024-02'),
     ('上海', '2024-01'), ('上海', '2024-02')],
    names=['城市', '月份']
)
df = pd.DataFrame({
    '销售额': [100, 120, 200, 180],
    '订单数': [10, 12, 20, 18],
}, index=index)

# 用xs跨层查询：取所有城市的1月数据
print(df.xs('2024-01', level='月份'))

# reindex对齐：补齐缺失的组合
full_index = pd.MultiIndex.from_product(
    [['北京', '上海', '广州'], ['2024-01', '2024-02']],
    names=['城市', '月份']
)
df_aligned = df.reindex(full_index, fill_value=0)
print(df_aligned)
```

怕浪猫踩过一个reindex的坑：当时需要把一个不规则的时序数据补全为连续的分钟级数据，用了`df.reindex(full_range)`，结果数据量太大直接OOM。后来改用`df.reindex(full_range, method='ffill')`配合分块处理才解决。reindex会创建一个全新的DataFrame，如果索引规模翻几倍，内存也会翻几倍。

### 1.3 性能优化：向量化、eval与Categorical

向量化是pandas性能优化的第一原则。能用向量化操作的就绝不用`apply`，能用`apply`的就绝不用`iterrows`。这个性能差距不是百分之几，而是几十倍甚至上百倍。

```python
import pandas as pd
import numpy as np

df = pd.DataFrame({
    'price': np.random.uniform(10, 100, 1_000_000),
    'quantity': np.random.randint(1, 50, 1_000_000),
})

# 反面教材：iterrows（极慢）
# result = sum(row['price'] * row['quantity'] for _, row in df.iterrows())

# 正面教材：向量化运算
result_vectorized = (df['price'] * df['quantity']).sum()

# eval()：当表达式复杂时，eval可以减少中间临时数组
df['total'] = df.eval('price * quantity * (1 - 0.1) + 5')
# 等价于 df['price'] * df['quantity'] * 0.9 + 5
# 但eval减少了临时数组的创建，在数据量大时更省内存

# 复杂表达式对比
# 普通写法会创建3个临时Series
result_normal = (df['price'] * df['quantity'] + df['price'] * 2) / df['quantity']

# eval写法只创建1个
result_eval = df.eval('(price * quantity + price * 2) / quantity')
```

> 向量化不是优化技巧，而是默认操作。当你写下for循环遍历DataFrame的那一刻，你就已经输了。

Categorical类型是pandas中被严重低估的特性。它本质上是用整数编码替代字符串存储，同时维护一个码表（categories）。对于低基数列（唯一值数量远小于总行数），Categorical可以同时减少内存和提升速度。

```python
import pandas as np

df = pd.DataFrame({
    'city': np.random.choice(['北京','上海','广州','深圳','成都'], 1_000_000),
    'amount': np.random.uniform(1, 100, 1_000_000),
})

# object类型：每个元素都是一个Python字符串对象
print(f"object内存: {df['city'].memory_usage(deep=True) / 1024 / 1024:.1f} MB")
# 约38MB

# Categorical类型：整数编码 + 码表
df['city'] = df['city'].astype('category')
print(f"category内存: {df['city'].memory_usage(deep=True) / 1024 / 1024:.1f} MB")
# 约1MB

# Categorical还加速groupby
# 普通object列groupby需要哈希每个字符串
# Categorical列groupby只需对整数编码分组
result = df.groupby('city', observed=True)['amount'].mean()
```

### 1.4 大数据处理：分块读取与dask延迟计算

当文件比内存大时，`read_csv`会直接OOM。这时候你有两个选择：分块读取或用dask。

pandas的`read_csv`支持`chunksize`参数，返回一个TextFileReader迭代器，每次yield一个固定行数的DataFrame。你可以在循环中逐块处理，最后合并结果。这种方式适合聚合类操作（如求和、计数），但不适合需要全量数据的操作（如排序、全局去重）。

```python
import pandas as pd

# 分块读取并聚合
chunk_size = 100_000
reader = pd.read_csv('large_logs.csv', chunksize=chunk_size)

total = pd.Series(dtype='float64')
for chunk in reader:
    # 每块独立聚合
    chunk_sum = chunk.groupby('user_id')['amount'].sum()
    total = total.add(chunk_sum, fill_value=0)

print(f"总用户数: {len(total)}, 总金额: {total.sum():.2f}")

# 更复杂的分块处理：同时统计多个指标
stats = []
for chunk in pd.read_csv('large_logs.csv', chunksize=100_000):
    stat = chunk.groupby('user_id').agg(
        total_amount=('amount', 'sum'),
        order_count=('order_id', 'count'),
        avg_amount=('amount', 'mean'),
    )
    stats.append(stat)

# 合并分块统计结果
final = pd.concat(stats).groupby(level=0).agg({
    'total_amount': 'sum',
    'order_count': 'sum',
    'avg_amount': 'mean',  # 这里是近似值，严格来说需要加权平均
})
```

dask是另一个选择。它提供了跟pandas几乎一样的API，但底层是懒加载和分块并行计算。dask不会一次性把数据全部读入内存，而是把数据切成多个partition，按需计算。

```python
import dask.dataframe as dd

# dask读取大文件：懒加载，不占内存
ddf = dd.read_csv('large_logs.csv', blocksize='64MB')

# 所有操作都是延迟执行的
result = ddf.groupby('user_id')['amount'].sum()

# compute()触发实际计算
final_result = result.compute()
print(f"用户数: {len(final_result)}")

# dask的优势：多线程并行 + 自动分块
# 但要注意：dask不适合小数据，调度开销会让它比pandas还慢
```

怕浪猫的实践经验是：数据量在内存2倍以内，用pandas chunksize就够了，简单直接；数据量超过内存5倍以上，或者需要复杂操作（如join大表），用dask更合适。dask的调度开销在小数据上反而拖慢速度，不要无脑上dask。

## 二、polars：Rust引擎带来的降维打击

pandas是Python数据处理的事实标准，但它的单线程设计和GIL限制让它在处理大数据时力不从心。polars用Rust重写了执行引擎，多线程并行 + 惰性执行 + 流式处理，在很多场景下性能提升10倍以上。

### 2.1 polars核心架构

polars的底层是Rust实现的Arrow内存格式，这跟pandas的numpy ndarray完全不同。Arrow是列式的、内存对齐的、零拷贝的，天然适合向量化操作和多线程并行。polars的Python层只是Rust引擎的薄封装，计算逻辑全部在Rust层完成，不受GIL影响。

polars有两种执行模式：Eager（即时执行）和Lazy（惰性执行）。Eager模式跟pandas类似，每一步操作立即执行。Lazy模式则把所有操作构建成一个查询图，在collect()时才执行，执行器可以做全局优化，比如谓词下推、投影裁剪。

```python
import polars as pl

# Eager模式：跟pandas类似
df = pl.read_csv('sales.csv')
result = df.filter(pl.col('amount') > 100).groupby('city').agg(
    pl.col('amount').sum().alias('total'),
    pl.col('amount').mean().alias('avg'),
)

# Lazy模式：构建查询图，collect时才执行
lf = pl.scan_csv('sales.csv')  # scan而非read
result = (
    lf.filter(pl.col('amount') > 100)
      .groupby('city')
      .agg([
          pl.col('amount').sum().alias('total'),
          pl.col('amount').mean().alias('avg'),
      ])
      .collect()  # 触发执行
)
```

Lazy模式的关键优势是查询优化。看这个例子：

```python
import polars as pl

lf = pl.scan_csv('sales.csv')  # 10GB文件

result = (
    lf.filter(pl.col('amount') > 100)   # 谓词下推：先过滤
      .select(['city', 'amount'])        # 投影裁剪：只读需要的列
      .groupby('city')
      .agg(pl.col('amount').sum().alias('total'))
      .collect()
)
# 优化器会：
# 1. 谓词下推：先filter再groupby，减少groupby的数据量
# 2. 投影裁剪：只读取city和amount两列，跳过其他列
# 3. 并行扫描：多线程同时读取不同文件块
```

> 惰性执行不是偷懒，而是聪明。Eager模式是走一步看一步，Lazy模式是看完地图再出发。

### 2.2 pandas vs polars性能基准测试

说polars快，到底快多少？怕浪猫做了一个基准测试，数据量1000万行，15列，涵盖几种常见操作。

| 操作 | pandas (秒) | polars Eager (秒) | polars Lazy (秒) | 加速比 |
|------|------------|-------------------|------------------|--------|
| 读取CSV | 8.3 | 1.2 | 0.0 (懒加载) | 6.9x |
| 过滤+聚合 | 2.1 | 0.3 | 0.25 | 8.4x |
| groupby+agg | 3.5 | 0.4 | 0.35 | 10x |
| 两表join | 5.2 | 0.6 | 0.5 | 10.4x |
| 类型转换 | 1.8 | 0.2 | 0.15 | 12x |
| 排序 | 4.1 | 0.5 | 0.45 | 9.1x |

测试环境：M1 Pro, 16GB, Python 3.11, pandas 2.2, polars 0.20

注意几个细节：polars Lazy模式的读取耗时为0，因为scan_csv只是记录了文件路径，真正读取发生在collect时。过滤+聚合操作中，polars Lazy比Eager还快，因为优化器做了谓词下推。join操作的提升最明显，因为polars用了基于Hash的并行join算法。

但polars也不是没有缺点。生态兼容性是最大问题：很多第三方库（如scikit-learn的某些预处理模块）只接受pandas DataFrame或numpy array作为输入。你需要`.to_pandas()`转换，这个转换虽然是零拷贝的（通过Arrow格式），但仍然有开销。另外，polars的API跟pandas差异不小，团队迁移有学习成本。

### 2.3 流式处理：解决内存问题

polars的Streaming模式是处理超大文件的利器。它不需要把整个数据集加载到内存，而是以batch为单位流式处理。这意味着你可以用4GB内存处理40GB的文件。

```python
import polars as pl

# 流式处理大文件
lf = pl.scan_csv('huge_file.csv')  # 40GB

result = (
    lf.filter(pl.col('amount') > 100)
      .groupby('city')
      .agg(pl.col('amount').sum().alias('total'))
      .collect(streaming=True)  # 启用流式处理
)
# 内存峰值控制在数百MB以内
```

Streaming模式的原理是把数据切成多个chunk，每个chunk独立处理，最后合并结果。对于聚合操作（sum, count, min, max），合并是简单的；对于需要全局信息的操作（如排序、全局去重），polars会使用外部排序算法，把中间结果溢写到磁盘。

怕浪猫在项目中用polars Streaming替换了一个dask任务，原来跑40分钟的任务降到了4分钟，内存从16GB降到800MB。但有个坑要注意：Streaming模式不支持所有操作，比如自定义Python UDF就不行（因为Rust引擎无法在流式处理中调用Python函数）。遇到这种场景，要么改写为polars原生表达式，要么退回Eager模式。

## 三、numpy底层：你以为的向量化可能不是真向量化

numpy是Python数据处理的基石，pandas、polars都构建在numpy之上（polars底层是Arrow但数值计算仍依赖numpy语义）。理解numpy的底层机制，能让你写出真正高效的代码。

### 3.1 ndarray内存布局：C-order vs Fortran-order

numpy数组在内存中是连续存储的，但有两种排列方式：C-order（行优先）和Fortran-order（列优先）。大部分情况下我们用的是C-order，但当你做矩阵运算时，选择正确的内存布局可以大幅提升性能。

```python
import numpy as np

# C-order (默认)：行优先存储
arr_c = np.array([[1, 2, 3], [4, 5, 6]], order='C')
# 内存布局：[1, 2, 3, 4, 5, 6]

# Fortran-order：列优先存储
arr_f = np.array([[1, 2, 3], [4, 5, 6]], order='F')
# 内存布局：[1, 4, 2, 5, 3, 6]

# 按行遍历：C-order更快（内存连续）
# 按列遍历：Fortran-order更快（内存连续）
big_c = np.random.randn(10000, 10000)  # C-order
big_f = np.asfortranarray(big_c)        # Fortran-order

# 按列求和：Fortran-order快约3倍
%timeit big_c.sum(axis=0)  # 列求和，需要跨行跳读
%timeit big_f.sum(axis=0)  # 列求和，内存连续
```

这个知识点在什么场景下有用？当你的计算主要是按列操作时（比如特征工程中逐列做标准化），用Fortran-order可以让缓存命中率大幅提升。怕浪猫在一个图像处理项目中，把数据从C-order转成Fortran-order后，按列操作的性能提升了2.5倍。但注意，转置操作`.T`只是改变了视图的stride，不会真正重排内存，要真正改变内存布局需要用`ascontiguousarray`或`asfortranarray`。

### 3.2 广播机制：Broadcasting原理

广播是numpy最强大也最容易让人困惑的特性。它允许不同形状的数组进行运算，而无需显式复制数据。理解广播的关键是理解numpy如何"虚拟扩展"数组形状。

广播规则：从右到左逐维比较，维度大小要么相等，要么其中一个是1，要么其中一个不存在。不满足就报错。

```python
import numpy as np

# 标量与数组
a = np.array([1, 2, 3])
b = 2
print(a * b)  # [2, 4, 6]，标量b被广播到shape (3,)

# 1D与2D
a = np.array([[1, 2, 3],    # shape (2, 3)
              [4, 5, 6]])
b = np.array([10, 20, 30])  # shape (3,)
print(a + b)
# [[11, 22, 33],
#  [14, 25, 36]]
# b被广播到shape (2, 3)

# 列向量与行向量
col = np.array([[1], [2], [3]])  # shape (3, 1)
row = np.array([10, 20, 30])     # shape (3,)
result = col + row               # shape (3, 3)
print(result)
# [[11, 21, 31],
#  [12, 22, 32],
#  [13, 23, 33]]
```

广播的底层实现不会真正复制数据，而是通过修改stride（步长）来实现"虚拟扩展"。stride为0意味着该维度的下一个元素和当前元素是同一个，无需跳转内存。这就是为什么广播不增加内存占用的原因。

> 广播是numpy的魔法：它让代码简洁的同时不浪费一比特内存。但魔法用错了方向就是bug，广播维度搞错是数值计算中最隐蔽的错误之一。

怕浪猫踩过一个广播的坑：计算两个矩阵的逐元素乘法时，一个shape是(1000, 1000)，另一个本应是(1000, 1000)但实际是(1000, 1)（因为用了`reshape(-1, 1)`）。广播没有报错，结果shape正确但数值全错。这种bug不会抛异常，但计算结果是静默错误的。建议在关键计算路径上用`np.allclose`做结果校验。

### 3.3 向量化运算与ufunc

numpy的向量化运算底层是通过ufunc（universal function）实现的。ufunc是C语言编写的逐元素运算函数，对数组中每个元素做相同操作，天然适合SIMD指令并行。

```python
import numpy as np
import time

# ufunc vs Python循环
arr = np.random.randn(10_000_000)

# Python循环（极慢）
start = time.time()
result_loop = np.array([np.sin(x) for x in arr])
print(f"Python循环: {time.time() - start:.2f}s")

# numpy ufunc（极快）
start = time.time()
result_ufunc = np.sin(arr)  # np.sin就是一个ufunc
print(f"ufunc: {time.time() - start:.2f}s")

# 自定义ufunc
@np.vectorize
def custom_func(x):
    return x ** 2 + 2 * x + 1 if x > 0 else 0

# 但注意：@np.vectorize只是语法糖，底层还是Python循环
# 真正高性能的自定义运算应该用numba或C扩展
```

怕浪猫的建议：当你发现一个操作在pandas/numpy中没有内置函数时，不要急着用`apply`或`@np.vectorize`。先试试能否用内置函数的组合表达，如果不行，用numba的`@njit`装饰器，它可以编译成LLVM机器码，性能接近手写C。

```python
from numba import njit
import numpy as np

@njit
def fast_custom(arr):
    result = np.empty_like(arr)
    for i in range(len(arr)):
        if arr[i] > 0:
            result[i] = arr[i] ** 2 + 2 * arr[i] + 1
        else:
            result[i] = 0.0
    return result

arr = np.random.randn(10_000_000)
# 第一次调用包含编译时间，后续调用极快
result = fast_custom(arr)
```

## 四、ETL流程设计：从数据源到数据仓库

前面三章讲的是数据处理的工具，接下来讲怎么用这些工具搭建一个完整的ETL流水线。ETL是Extract-Transform-Load的缩写，看似简单，但每个环节都有大量坑。

### 4.1 抽取Extract：多数据源接入

真实业务中的数据源五花八门：MySQL存业务数据，MongoDB存日志，API拿第三方数据，CSV是运营手动上传的。你的ETL框架第一步就是把这些异构数据源统一接入。

```python
from abc import ABC, abstractmethod
import pandas as pd
import sqlalchemy
import requests
from pymongo import MongoClient

class DataExtractor(ABC):
    @abstractmethod
    def extract(self, **kwargs) -> pd.DataFrame:
        pass

class MySQLExtractor(DataExtractor):
    def __init__(self, connection_string: str):
        self.engine = sqlalchemy.create_engine(
            connection_string,
            pool_size=5,
            pool_recycle=3600,  # 1小时回收连接，避免MySQL 8小时断连
        )
    
    def extract(self, query: str, chunksize: int = None) -> pd.DataFrame:
        if chunksize:
            return pd.read_sql(query, self.engine, chunksize=chunksize)
        return pd.read_sql(query, self.engine)

class APIExtractor(DataExtractor):
    def __init__(self, base_url: str, headers: dict = None):
        self.base_url = base_url
        self.session = requests.Session()
        if headers:
            self.session.headers.update(headers)
    
    def extract(self, endpoint: str, params: dict = None) -> pd.DataFrame:
        resp = self.session.get(f"{self.base_url}/{endpoint}", params=params)
        resp.raise_for_status()
        return pd.DataFrame(resp.json()['data'])

class ParquetExtractor(DataExtractor):
    def extract(self, path: str) -> pd.DataFrame:
        return pd.read_parquet(path)
```

增量抽取是ETL的核心问题。全量抽取每次拉所有数据，简单但浪费资源；增量抽取只拉变化的数据，高效但实现复杂。最常用的增量策略是基于时间戳，但更可靠的是CDC（Change Data Capture）。

```python
class IncrementalMySQLExtractor(MySQLExtractor):
    def __init__(self, connection_string: str, watermark_file: str):
        super().__init__(connection_string)
        self.watermark_file = watermark_file
    
    def get_watermark(self) -> str:
        try:
            with open(self.watermark_file, 'r') as f:
                return f.read().strip()
        except FileNotFoundError:
            return '1970-01-01 00:00:00'  # 首次运行拉全量
    
    def save_watermark(self, timestamp: str):
        with open(self.watermark_file, 'w') as f:
            f.write(timestamp)
    
    def extract(self, table: str, time_column: str = 'updated_at') -> pd.DataFrame:
        watermark = self.get_watermark()
        query = f"""
            SELECT * FROM {table}
            WHERE {time_column} > '{watermark}'
            ORDER BY {time_column} ASC
        """
        df = super().extract(query)
        if not df.empty:
            new_watermark = str(df[time_column].max())
            self.save_watermark(new_watermark)
        return df
```

> 增量抽取的关键不是怎么拉数据，而是怎么记住"上次拉到哪了"。水位线机制看起来土，但它简单、可靠、可回溯。

连接池的配置也是一个容易踩坑的地方。怕浪猫曾经遇到一个ETL任务每隔8小时就报"MySQL server has gone away"，排查后发现是连接池里的连接闲置超过MySQL的`wait_timeout`（默认8小时），再次使用时已经失效。解决方案是设置`pool_recycle=3600`，让连接每小时回收一次。

### 4.2 转换Transform：数据清洗、转换与聚合

Transform是ETL中最复杂的环节，包含数据清洗、类型转换、聚合关联等操作。这一步的代码量通常占整个ETL的60%以上。

数据清洗的第一步是处理缺失值。不要无脑`dropna()`，缺失值本身也是有业务含义的。用户注册时间缺失可能意味着这是匿名用户，金额缺失可能意味着免费订单。你需要根据业务场景决定是删除、填充还是保留。

```python
import pandas as pd
import numpy as np

def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    # 缺失值处理：区分"无数据"和"未知"
    df['user_id'] = df['user_id'].fillna(-1).astype('int64')
    df['phone'] = df['phone'].fillna('UNKNOWN')
    df['amount'] = df['amount'].fillna(0.0)
    # 注册时间缺失保留为NaT，后续逻辑单独处理
    
    # 异常值检测：用IQR方法
    q1, q3 = df['amount'].quantile([0.25, 0.75])
    iqr = q3 - q1
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    df['is_outlier'] = (df['amount'] < lower) | (df['amount'] > upper)
    
    # 去重：保留最新记录
    df = df.sort_values('updated_at').drop_duplicates(
        subset=['order_id'], keep='last'
    )
    return df

def transform_data(df: pd.DataFrame) -> pd.DataFrame:
    # 类型转换
    df['created_at'] = pd.to_datetime(df['created_at'])
    df['amount'] = df['amount'].astype('float64')
    
    # 标准化：Z-Score
    mean, std = df['amount'].mean(), df['amount'].std()
    df['amount_zscore'] = (df['amount'] - mean) / (std + 1e-8)
    
    # One-Hot编码
    df = pd.get_dummies(df, columns=['channel'], prefix='ch')
    
    # 分类编码
    df['user_level'] = df['user_level'].astype('category')
    return df
```

数据聚合是Transform的核心操作。groupby + agg的组合可以完成大部分聚合需求，但窗口函数和滚动统计在时序分析中同样重要。

```python
import pandas as pd

# 基础聚合：多指标同时计算
result = df.groupby('user_id').agg(
    total_amount=('amount', 'sum'),
    order_count=('order_id', 'count'),
    avg_amount=('amount', 'mean'),
    max_amount=('amount', 'max'),
    first_order=('created_at', 'min'),
    last_order=('created_at', 'max'),
)

# 窗口函数：计算用户每笔订单在其历史中的排名
df['order_rank'] = df.sort_values('created_at').groupby('user_id').cumcount() + 1

# 滚动统计：7天移动平均
df = df.sort_values(['user_id', 'created_at'])
df['amount_7d_ma'] = (
    df.groupby('user_id')['amount']
      .rolling(window=7, min_periods=1)
      .mean()
      .reset_index(level=0, drop=True)
)

# 累计求和
df['cumulative_amount'] = df.groupby('user_id')['amount'].cumsum()
```

数据关联（merge/join）是另一个性能瓶颈。两个大表join时，如果连接键不是索引，pandas需要做笛卡尔积级别的哈希匹配，内存可能爆炸。一个优化策略是先过滤再join，减少参与join的行数。

```python
# 优化前：直接join，全量数据
# result = orders.merge(users, on='user_id')  # 可能OOM

# 优化后：先过滤再join
active_users = users[users['status'] == 'active']  # 过滤掉不活跃用户
recent_orders = orders[orders['created_at'] >= '2024-01-01']  # 只取近期订单
result = recent_orders.merge(active_users, on='user_id')

# 更进一步：用分类类型减少join的内存
orders['user_id'] = orders['user_id'].astype('category')
users['user_id'] = users['user_id'].astype('category')
# 分类类型的join用整数匹配，比字符串匹配快得多
result = orders.merge(users, on='user_id')
```

### 4.3 加载Load：批量写入与幂等性

Load看起来最简单，就是把数据写进数据库，但坑同样不少。逐行INSERT是最慢的方式，生产环境必须用批量写入。

```python
import sqlalchemy
import pandas as pd

class DataLoader:
    def __init__(self, connection_string: str):
        self.engine = sqlalchemy.create_engine(connection_string)
    
    def load_batch(self, df: pd.DataFrame, table: str, chunksize: int = 10000):
        """批量写入，分块提交"""
        total = 0
        with self.engine.begin() as conn:
            for i in range(0, len(df), chunksize):
                chunk = df.iloc[i:i + chunksize]
                chunk.to_sql(
                    table, conn,
                    if_exists='append',
                    index=False,
                    method='multi',  # 使用多值INSERT
                )
                total += len(chunk)
        return total
    
    def load_copy(self, df: pd.DataFrame, table: str):
        """使用PostgreSQL COPY命令，速度最快"""
        import csv
        import io
        
        buffer = io.StringIO()
        df.to_csv(buffer, index=False, header=False, sep='\t')
        buffer.seek(0)
        
        with self.engine.begin() as conn:
            raw = conn.connection
            cursor = raw.cursor()
            cursor.copy_from(buffer, table, columns=df.columns.tolist())
            raw.commit()
```

写入优化的一个重要技巧是索引延迟创建。如果你往一个有5个索引的表插入100万行数据，每行INSERT都要更新5个索引。正确做法是先删除索引，批量插入后再重建索引。对于大表，这个优化可以减少50%以上的写入时间。

```python
# 索引延迟创建策略
def load_with_index_deferred(df, engine, table, indexes):
    with engine.begin() as conn:
        # 1. 删除索引
        for idx_name, idx_sql in indexes.items():
            conn.execute(sqlalchemy.text(f"DROP INDEX IF EXISTS {idx_name}"))
        
        # 2. 批量写入
        df.to_sql(table, conn, if_exists='append', index=False, method='multi')
        
        # 3. 重建索引
        for idx_name, idx_sql in indexes.items():
            conn.execute(sqlalchemy.text(idx_sql))
```

幂等性是ETL设计的核心要求。所谓幂等，就是同一个ETL任务跑一次和跑十次，结果是一样的。没有幂等性，任务失败重试就会产生重复数据。

```python
def load_upsert(df: pd.DataFrame, engine, table: str, conflict_columns: list):
    """UPSERT语义：存在则更新，不存在则插入"""
    # PostgreSQL的ON CONFLICT语法
    columns = df.columns.tolist()
    placeholders = ','.join([f':{c}' for c in columns])
    update_set = ','.join([f'{c} = EXCLUDED.{c}' for c in columns if c not in conflict_columns])
    conflict = ','.join(conflict_columns)
    
    sql = f"""
        INSERT INTO {table} ({','.join(columns)})
        VALUES ({placeholders})
        ON CONFLICT ({conflict}) DO UPDATE SET {update_set}
    """
    
    with engine.begin() as conn:
        data = df.to_dict('records')
        conn.execute(sqlalchemy.text(sql), data)
```

> 幂等不是可选项，而是必须项。一个不能安全重试的ETL任务，就像一颗定时炸弹，迟早会在某个凌晨引爆。

### 4.4 通用ETL框架实现

把前面三个环节组合起来，就是一个通用的ETL框架。怕浪猫在生产环境用的版本比这个复杂得多，但核心架构是一样的。

```python
from abc import ABC, abstractmethod
import pandas as pd
import logging
from datetime import datetime
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('ETL')

class ETLPipeline:
    """通用ETL框架"""
    
    def __init__(self, name: str):
        self.name = name
        self.extractor: Optional[DataExtractor] = None
        self.transformer = None
        self.loader = None
        self.stats = {}
    
    def set_extractor(self, extractor: DataExtractor):
        self.extractor = extractor
        return self
    
    def set_transformer(self, func):
        self.transformer = func
        return self
    
    def set_loader(self, loader: DataLoader):
        self.loader = loader
        return self
    
    def run(self, **kwargs):
        """执行ETL"""
        start = datetime.now()
        logger.info(f"[{self.name}] ETL开始")
        
        try:
            # Extract
            logger.info(f"[{self.name}] 抽取数据...")
            df = self.extractor.extract(**kwargs)
            self.stats['extract_rows'] = len(df)
            self.stats['extract_time'] = (datetime.now() - start).total_seconds()
            logger.info(f"[{self.name}] 抽取完成: {len(df)}行")
            
            # Transform
            transform_start = datetime.now()
            logger.info(f"[{self.name}] 转换数据...")
            if self.transformer:
                df = self.transformer(df)
            self.stats['transform_rows'] = len(df)
            self.stats['transform_time'] = (datetime.now() - transform_start).total_seconds()
            logger.info(f"[{self.name}] 转换完成: {len(df)}行")
            
            # Load
            load_start = datetime.now()
            logger.info(f"[{self.name}] 加载数据...")
            written = self.loader.load_batch(df, kwargs.get('table', ''))
            self.stats['load_rows'] = written
            self.stats['load_time'] = (datetime.now() - load_start).total_seconds()
            logger.info(f"[{self.name}] 加载完成: {written}行")
            
            self.stats['total_time'] = (datetime.now() - start).total_seconds()
            logger.info(f"[{self.name}] ETL完成: {self.stats}")
            return self.stats
            
        except Exception as e:
            logger.error(f"[{self.name}] ETL失败: {e}", exc_info=True)
            raise
```

使用这个框架的完整ETL任务示例：

```python
# 组装一个完整的ETL任务
def user_orders_etl():
    pipeline = ETLPipeline('user_orders_daily')
    
    # Extract: 从MySQL抽取昨日订单
    pipeline.set_extractor(
        IncrementalMySQLExtractor(
            connection_string='mysql://user:pass@host:3306/db',
            watermark_file='/tmp/user_orders_watermark.txt',
        )
    )
    
    # Transform: 清洗 + 聚合
    def transform(df):
        df = clean_data(df)
        df = transform_data(df)
        # 按用户聚合
        result = df.groupby('user_id').agg(
            order_count=('order_id', 'count'),
            total_amount=('amount', 'sum'),
            last_order_time=('created_at', 'max'),
        ).reset_index()
        return result
    
    pipeline.set_transformer(transform)
    
    # Load: 写入数据仓库
    pipeline.set_loader(DataLoader('postgresql://user:pass@host:5432/dw'))
    
    # 执行
    pipeline.run(table='dw_user_orders_summary')

if __name__ == '__main__':
    user_orders_etl()
```

### 4.5 ETL工具对比

除了手写ETL框架，市面上有很多成熟的ETL工具。怕浪猫整理了一个对比表：

| 工具 | 语言 | 优势 | 劣势 | 适用场景 |
|------|------|------|------|----------|
| Apache Airflow | Python | DAG调度强大，生态丰富 | 学习曲线陡，部署重 | 复杂调度依赖 |
| dbt | SQL | SQL优先，版本控制友好 | 只做T，不做E和L | 数据仓库内转换 |
| Spark | Scala/Python | 海量数据处理，集群分布式 | 资源消耗大，小任务overkill | TB级数据处理 |
| Prefect | Python | API现代化，部署简单 | 生态不如Airflow | 中小规模ETL |
| 自研框架 | Python | 灵活可控，无额外依赖 | 需要维护成本 | 定制化需求强 |

怕浪猫的选择建议：如果你的ETL任务少于20个，自研框架 + crontab就够了，引入Airflow反而增加运维负担。如果任务之间有复杂的依赖关系（比如A完成后才能跑B，B和C并行，三个都完成后才能跑D），那就上Airflow。如果数据量在TB级别，上Spark。如果是纯数据仓库内的转换（数据已经在数仓里，只是做SQL转换），上dbt。

## 五、实战踩坑总结

最后，怕浪猫把这一年做ETL工程踩过的坑总结成一个清单，每一条都是真金白银的教训。

**ETL工程避坑清单：**

1. 永远不要信任源数据。你的上游可能会在不通知你的情况下改字段名、改数据类型、改枚举值。在Extract阶段加数据校验，发现schema变化立即告警。

2. 时区是ETL最大的隐形杀手。源数据库用UTC，目标数据库用Asia/Shanghai，你不在转换层统一时区，数据就会错8个小时。在ETL框架中强制所有时间戳先转UTC再处理。

3. 分块处理时的内存峰值不是简单的"行数/块数"。groupby操作会产生中间结果，join操作会产生临时表。用`memory_profiler`监控实际内存峰值，留足缓冲。

4. 字符串编码问题。MySQL默认utf8mb4，PostgreSQL默认UTF-8，CSV可能用GBK。在Extract阶段统一转UTF-8，避免后续处理出现编码错误。

5. 连接泄漏。SQLAlchemy的连接池默认不回收连接，长时间运行的ETL任务可能耗尽连接池。设置`pool_recycle`和`pool_pre_ping=True`。

6. 重试不是万能药。如果ETL失败是因为数据质量问题，重试一百次还是会失败。区分"基础设施故障"（可重试）和"数据质量故障"（需人工介入）。

7. 监控ETL的"沉默失败"。任务没报错但数据量突然减半，可能是因为增量抽取的水位线被错误更新。在Load之后加一个行数校验，数据量偏离阈值就告警。

> ETL的终极目标不是"跑通"，而是"跑对"。一个跑通了但数据错了的ETL，比根本没跑的ETL更危险，因为它给了你错误的信心。

## 收藏引导

如果你觉得这篇文章对你有帮助，点个收藏吧。ETL工程的东西太碎了，这篇基本把从数据源接入到最终写入的完整链路都覆盖了，下次遇到问题可以直接当手册查。

## 互动引导

你在做数据处理时踩过最大的坑是什么？是pandas的内存爆炸，还是ETL任务的静默失败？在评论区聊聊，怕浪猫会挨个回复。如果遇到了具体的技术问题，也可以提出来，下篇文章可以针对性解答。

## 追更引导

这是Python实战训练营的第13周内容。如果你跟着追到这里，说明你已经不是新手了。后面的内容会更偏架构和工程实践，关注我，别掉队。

---

**系列进度 13/16**

**下章预告：** 第14章 工作流调度与数据质量。ETL框架搭好了，但谁来按时触发它？任务失败了怎么自动重试？数据写入前怎么校验质量？下一章我们从Airflow的DAG调度、数据质量校验框架、SLA监控三个维度，把ETL从"能跑"升级到"可靠"。

## 怕浪猫说

数据处理这件事，入门容易精通难。调一个pandas API谁都会，但理解BlockManager的内存布局、知道什么时候该用polars替代pandas、能设计出幂等的ETL流水线，这些才是区分"会用工具"和"会做工程"的分水岭。怕浪猫写这篇文章的时候，翻了很多自己以前踩坑的记录，有些坑现在看来挺低级的，但当时确实卡了很久。技术成长就是这样，踩过的坑变成了经验，经验变成了直觉。希望这篇文章能帮你少踩几个坑，把时间花在更有价值的事情上。下周见。
