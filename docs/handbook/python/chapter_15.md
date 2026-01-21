# Python数据分析与可视化完全指南：从NumPy到实战案例

## 1. 数据分析流程：科学的工作方法论

数据分析不是简单的“画图表”，而是一个**系统化的科学过程**。一个完整的数据分析流程通常包含六个关键步骤，形成闭环：

```python
# 数据分析流程框架示例
import pandas as pd
import numpy as np

class DataAnalysisPipeline:
    """数据分析流程的框架实现"""

    def __init__(self):
        self.steps = {
            1: "问题定义",
            2: "数据收集",
            3: "数据清洗",
            4: "探索性分析",
            5: "建模分析",
            6: "结果呈现"
        }

    def execute(self, data_path=None):
        """执行完整的数据分析流程"""
        results = {}

        # 1. 问题定义
        print("=== 步骤1: 问题定义 ===")
        business_questions = [
            "我们的用户增长趋势如何？",
            "哪些因素影响用户留存？",
            "如何提高产品转化率？"
        ]
        print("业务问题:", business_questions)

        # 2. 数据收集
        print("\n=== 步骤2: 数据收集 ===")
        if data_path:
            data = self.collect_data(data_path)
            results['raw_data'] = data
            print(f"已加载数据: {data.shape}")

        # 3. 数据清洗
        print("\n=== 步骤3: 数据清洗 ===")
        cleaned_data = self.clean_data(data)
        results['cleaned_data'] = cleaned_data

        # 4. 探索性分析
        print("\n=== 步骤4: 探索性分析 ===")
        insights = self.exploratory_analysis(cleaned_data)
        results['insights'] = insights

        # 5. 建模分析
        print("\n=== 步骤5: 建模分析 ===")
        models = self.build_models(cleaned_data)
        results['models'] = models

        # 6. 结果呈现
        print("\n=== 步骤6: 结果呈现 ===")
        self.visualize_results(results)

        return results

    def collect_data(self, path):
        """模拟数据收集过程"""
        # 可以从多个来源收集数据
        sources = {
            'database': '从SQL数据库提取',
            'api': '调用外部API',
            'file': '读取CSV/Excel文件',
            'web': '网络爬虫获取'
        }
        print("数据来源:", sources)

        # 实际项目中，这里会是具体的数据加载代码
        np.random.seed(42)
        data_size = 1000

        data = pd.DataFrame({
            'user_id': range(1, data_size + 1),
            'age': np.random.randint(18, 65, data_size),
            'gender': np.random.choice(['M', 'F'], data_size),
            'income': np.random.normal(50000, 15000, data_size).astype(int),
            'spending': np.random.exponential(500, data_size).astype(int),
            'signup_date': pd.date_range('2023-01-01', periods=data_size, freq='H'),
            'is_active': np.random.choice([0, 1], data_size, p=[0.3, 0.7]),
            'region': np.random.choice(['North', 'South', 'East', 'West'], data_size)
        })

        return data

    def clean_data(self, data):
        """数据清洗过程"""
        print("原始数据形状:", data.shape)
        print("\n数据概览:")
        print(data.info())

        # 处理缺失值
        print("\n缺失值统计:")
        print(data.isnull().sum())

        # 处理异常值
        Q1 = data['income'].quantile(0.25)
        Q3 = data['income'].quantile(0.75)
        IQR = Q3 - Q1

        # 识别异常值（基于IQR方法）
        outliers = data[(data['income'] < (Q1 - 1.5 * IQR)) |
                        (data['income'] > (Q3 + 1.5 * IQR))]
        print(f"\n收入异常值数量: {len(outliers)}")

        # 数据标准化
        from sklearn.preprocessing import StandardScaler

        numeric_cols = ['age', 'income', 'spending']
        scaler = StandardScaler()
        data[numeric_cols] = scaler.fit_transform(data[numeric_cols])

        print("\n数据清洗完成!")
        return data

    def exploratory_analysis(self, data):
        """探索性数据分析"""
        insights = {}

        # 描述性统计
        print("描述性统计:")
        print(data.describe())

        # 相关性分析
        print("\n相关性矩阵:")
        correlation = data[['age', 'income', 'spending']].corr()
        print(correlation)

        insights['correlation'] = correlation
        return insights

    def build_models(self, data):
        """构建分析模型"""
        # 这里可以添加各种机器学习模型
        models = {}
        print("模型构建完成")
        return models

    def visualize_results(self, results):
        """可视化呈现结果"""
        print("生成可视化报告...")
        # 具体可视化代码将在后面章节展示

# 执行数据分析流程
pipeline = DataAnalysisPipeline()
# results = pipeline.execute('data.csv')  # 实际使用时传入数据路径
```

数据分析的**关键成功因素**不在于使用多复杂的算法，而在于：清晰的问题定义、干净的数据准备、合理的分析方法和有效的沟通呈现。

## 2. NumPy数组操作：高性能计算的基石

NumPy是Python科学计算的基础库，其核心是**多维数组对象ndarray**，提供了比Python列表快50倍的数值运算能力。

```python
import numpy as np
import time

# 1. 创建数组的多种方式
print("=== 创建数组 ===")

# 从Python列表创建
list_data = [1, 2, 3, 4, 5]
arr_from_list = np.array(list_data)
print("从列表创建:", arr_from_list)

# 使用内置函数创建
zeros_arr = np.zeros((3, 4))  # 3x4的零矩阵
ones_arr = np.ones((2, 3, 4))  # 2x3x4的全1数组
identity = np.eye(5)  # 5x5单位矩阵
range_arr = np.arange(0, 20, 2)  # 0到20，步长为2
linspace_arr = np.linspace(0, 1, 5)  # 0到1之间均匀分布的5个数

print(f"零矩阵:\n{zeros_arr}")
print(f"等差数列: {range_arr}")
print(f"均匀分布: {linspace_arr}")

# 2. 数组属性
print("\n=== 数组属性 ===")
sample_array = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
print(f"数组:\n{sample_array}")
print(f"形状: {sample_array.shape}")
print(f"维度: {sample_array.ndim}")
print(f"大小: {sample_array.size}")
print(f"数据类型: {sample_array.dtype}")
print(f"元素大小: {sample_array.itemsize}字节")

# 3. 数组索引和切片
print("\n=== 数组索引和切片 ===")
matrix = np.array([[1, 2, 3, 4],
                   [5, 6, 7, 8],
                   [9, 10, 11, 12]])

print(f"原始矩阵:\n{matrix}")
print(f"第一个元素: {matrix[0, 0]}")
print(f"第一行: {matrix[0, :]}")
print(f"第二列: {matrix[:, 1]}")
print(f"子矩阵:\n{matrix[1:3, 2:4]}")

# 4. 数组运算
print("\n=== 数组运算 ===")
a = np.array([1, 2, 3, 4])
b = np.array([5, 6, 7, 8])

print(f"数组a: {a}")
print(f"数组b: {b}")
print(f"加法: {a + b}")
print(f"减法: {a - b}")
print(f"乘法: {a * b}")
print(f"除法: {b / a}")
print(f"幂运算: {a ** 2}")
print(f"点积: {np.dot(a, b)}")

# 5. 广播机制
print("\n=== 广播机制 ===")
# 不同形状数组间的运算
matrix_a = np.array([[1, 2, 3],
                     [4, 5, 6]])
vector_b = np.array([10, 20, 30])

print(f"矩阵:\n{matrix_a}")
print(f"向量: {vector_b}")
print(f"广播加法:\n{matrix_a + vector_b}")

# 6. 通用函数 (ufunc)
print("\n=== 通用函数 ===")
data = np.array([-2, -1, 0, 1, 2])

print(f"原始数据: {data}")
print(f"绝对值: {np.abs(data)}")
print(f"平方根: {np.sqrt(np.abs(data))}")
print(f"指数: {np.exp(data)}")
print(f"对数: {np.log(np.abs(data) + 1)}")  # +1避免log(0)
print(f"四舍五入: {np.round([1.234, 2.567, 3.891], decimals=1)}")

# 7. 统计函数
print("\n=== 统计函数 ===")
random_data = np.random.normal(0, 1, 1000)  # 1000个标准正态分布随机数

print(f"随机数据样本: {random_data[:5]}")
print(f"均值: {np.mean(random_data):.4f}")
print(f"中位数: {np.median(random_data):.4f}")
print(f"标准差: {np.std(random_data):.4f}")
print(f"方差: {np.var(random_data):.4f}")
print(f"最小值: {np.min(random_data):.4f}")
print(f"最大值: {np.max(random_data):.4f}")
print(f"25%分位数: {np.percentile(random_data, 25):.4f}")
print(f"75%分位数: {np.percentile(random_data, 75):.4f}")

# 8. 性能对比：NumPy vs Python列表
print("\n=== 性能对比 ===")

# 创建大型数据集
size = 1000000
python_list = list(range(size))
numpy_array = np.arange(size)

# Python列表运算
start_time = time.time()
python_result = [x * 2 for x in python_list]
python_time = time.time() - start_time

# NumPy数组运算
start_time = time.time()
numpy_result = numpy_array * 2
numpy_time = time.time() - start_time

print(f"Python列表时间: {python_time:.4f}秒")
print(f"NumPy数组时间: {numpy_time:.4f}秒")
print(f"NumPy比Python快 {python_time/numpy_time:.1f} 倍")

# 9. 实际应用：图像处理
print("\n=== 实际应用：图像处理 ===")
# 模拟一个简单的图像处理示例
# 创建假图像数据（3通道RGB图像）
height, width, channels = 10, 10, 3
image = np.random.randint(0, 256, (height, width, channels), dtype=np.uint8)

print(f"图像形状: {image.shape}")
print(f"图像数据类型: {image.dtype}")

# 转换为灰度图像
gray_image = np.mean(image, axis=2).astype(np.uint8)
print(f"灰度图像形状: {gray_image.shape}")

# 图像裁剪
cropped = image[2:8, 3:7, :]
print(f"裁剪后形状: {cropped.shape}")

# 10. 线性代数运算
print("\n=== 线性代数运算 ===")
A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])

print(f"矩阵A:\n{A}")
print(f"矩阵B:\n{B}")
print(f"矩阵乘法:\n{np.dot(A, B)}")
print(f"矩阵转置:\n{A.T}")
print(f"矩阵行列式: {np.linalg.det(A):.2f}")
print(f"矩阵逆:\n{np.linalg.inv(A)}")

# 求解线性方程组: 2x + y = 5, x + 3y = 5
coefficients = np.array([[2, 1], [1, 3]])
constants = np.array([5, 5])
solution = np.linalg.solve(coefficients, constants)
print(f"方程组的解: x={solution[0]}, y={solution[1]}")
```

NumPy的**核心优势**：内存效率高、矢量化运算、丰富的数学函数库。掌握NumPy是学习Pandas、Scikit-learn等高级库的基础。

## 3. Pandas数据结构：数据操作的瑞士军刀

Pandas是数据科学家最常用的工具，提供了DataFrame和Series两种核心数据结构，让数据操作变得直观高效。

```python
import pandas as pd
import numpy as np

print("=== Pandas数据结构深入探索 ===")

# 1. Series：带标签的一维数组
print("\n1. Series基本操作")
# 创建Series
s1 = pd.Series([10, 20, 30, 40], index=['a', 'b', 'c', 'd'])
s2 = pd.Series({'北京': 2154, '上海': 2428, '广州': 1530, '深圳': 1768}, name='人口(万)')

print(f"Series 1:\n{s1}")
print(f"Series 2:\n{s2}")
print(f"索引访问: {s1['b']}")
print(f"切片访问: {s1['b':'d']}")

# Series运算
print(f"\nSeries运算:")
print(f"s1 + 100:\n{s1 + 100}")
print(f"s1 * 2:\n{s1 * 2}")
print(f"统计信息:\n{s1.describe()}")

# 2. DataFrame：二维表格数据结构
print("\n2. DataFrame基本操作")

# 多种创建方式
# 从字典创建
data_dict = {
    '姓名': ['张三', '李四', '王五', '赵六'],
    '年龄': [25, 30, 35, 28],
    '城市': ['北京', '上海', '广州', '深圳'],
    '薪资': [15000, 18000, 12000, 20000],
    '部门': ['技术部', '市场部', '技术部', '人事部']
}

df = pd.DataFrame(data_dict)
print("原始DataFrame:")
print(df)
print(f"\n形状: {df.shape}")
print(f"列名: {df.columns.tolist()}")
print(f"索引: {df.index.tolist()}")
print(f"数据类型:\n{df.dtypes}")

# 3. 数据查看和选择
print("\n3. 数据查看和选择")

print("查看前3行:")
print(df.head(3))

print("\n查看后2行:")
print(df.tail(2))

print("\n随机查看3行:")
print(df.sample(3, random_state=42))

# 选择数据的不同方式
print("\n选择单列:")
print(df['姓名'])

print("\n选择多列:")
print(df[['姓名', '年龄', '薪资']])

print("\n使用loc选择（按标签）:")
print(df.loc[0])  # 第一行
print(df.loc[0:2, ['姓名', '城市']])  # 特定行和列

print("\n使用iloc选择（按位置）:")
print(df.iloc[0])  # 第一行
print(df.iloc[0:3, 0:2])  # 前3行，前2列

# 4. 数据筛选
print("\n4. 数据筛选")

print("年龄大于30的员工:")
print(df[df['年龄'] > 30])

print("\n技术部员工:")
print(df[df['部门'] == '技术部'])

print("\n薪资在15000-20000之间的员工:")
print(df[(df['薪资'] >= 15000) & (df['薪资'] <= 20000)])

print("\n复杂条件筛选（技术部或薪资>18000）:")
print(df[(df['部门'] == '技术部') | (df['薪资'] > 18000)])

# 5. 数据排序
print("\n5. 数据排序")

print("按年龄升序排序:")
print(df.sort_values('年龄'))

print("\n按薪资降序排序:")
print(df.sort_values('薪资', ascending=False))

print("\n多列排序（先按部门，再按薪资降序）:")
print(df.sort_values(['部门', '薪资'], ascending=[True, False]))

# 6. 添加和修改数据
print("\n6. 添加和修改数据")

# 添加新列
df['年薪'] = df['薪资'] * 12
df['年龄组'] = pd.cut(df['年龄'], bins=[20, 30, 40], labels=['20-30', '30-40'])
print("添加新列后:")
print(df)

# 修改数据
df.loc[df['姓名'] == '张三', '薪资'] = 16000
print("\n修改张三薪资后:")
print(df)

# 7. 处理缺失值
print("\n7. 处理缺失值")

# 创建包含缺失值的数据
df_missing = df.copy()
df_missing.loc[2, '薪资'] = np.nan
df_missing.loc[3, '年龄'] = np.nan
df_missing.loc[0, '城市'] = None

print("包含缺失值的数据:")
print(df_missing)

print("\n缺失值统计:")
print(df_missing.isnull().sum())

print("\n删除包含缺失值的行:")
print(df_missing.dropna())

print("\n填充缺失值（薪资用均值，年龄用中位数）:")
df_filled = df_missing.copy()
df_filled['薪资'] = df_filled['薪资'].fillna(df_filled['薪资'].mean())
df_filled['年龄'] = df_filled['年龄'].fillna(df_filled['年龄'].median())
df_filled['城市'] = df_filled['城市'].fillna('未知')
print(df_filled)

# 8. 数据分组和聚合
print("\n8. 数据分组和聚合")

print("各部门平均薪资和年龄:")
grouped = df.groupby('部门').agg({
    '薪资': ['mean', 'min', 'max', 'count'],
    '年龄': 'mean'
})
print(grouped)

print("\n每个城市的技术部员工数量:")
city_tech = df[df['部门'] == '技术部'].groupby('城市').size()
print(city_tech)

# 9. 数据透视表
print("\n9. 数据透视表")

pivot_table = pd.pivot_table(df,
                            values='薪资',
                            index='部门',
                            columns='城市',
                            aggfunc='mean',
                            fill_value=0)
print("部门-城市薪资透视表:")
print(pivot_table)

# 10. 数据合并
print("\n10. 数据合并")

# 创建第二个DataFrame
df2 = pd.DataFrame({
    '姓名': ['张三', '李四', '钱七'],
    '入职年份': [2019, 2020, 2021],
    '绩效评级': ['A', 'B', 'A']
})

print("第二个DataFrame:")
print(df2)

# 合并数据
merged = pd.merge(df, df2, on='姓名', how='left')
print("\n合并后的数据:")
print(merged)

# 11. 时间序列处理
print("\n11. 时间序列处理")

# 创建时间序列数据
dates = pd.date_range('2023-01-01', periods=10, freq='D')
time_series = pd.DataFrame({
    '日期': dates,
    '销售额': np.random.randint(1000, 5000, 10),
    '客户数': np.random.randint(50, 200, 10)
})

print("时间序列数据:")
print(time_series)

# 设置日期索引
time_series.set_index('日期', inplace=True)
print("\n设置日期索引后:")
print(time_series.head())

# 重采样（按周统计）
weekly_data = time_series.resample('W').sum()
print("\n按周汇总数据:")
print(weekly_data)

# 12. 文件读写
print("\n12. 文件读写示例")

# 保存到CSV
df.to_csv('employee_data.csv', index=False, encoding='utf-8-sig')
print("数据已保存到 employee_data.csv")

# 从CSV读取
df_read = pd.read_csv('employee_data.csv', encoding='utf-8-sig')
print("\n从CSV读取的数据:")
print(df_read)

# 保存到Excel
df.to_excel('employee_data.xlsx', index=False)
print("\n数据已保存到 employee_data.xlsx")

# 从Excel读取
df_excel = pd.read_excel('employee_data.xlsx')
print("\n从Excel读取的数据:")
print(df_excel.head())

# 13. 性能优化技巧
print("\n13. 性能优化技巧")

# 使用向量化操作替代循环
print("向量化操作示例:")

# 创建大数据集
big_data = pd.DataFrame({
    'x': np.random.randn(1000000),
    'y': np.random.randn(1000000)
})

# 慢的方法：使用apply
import time
start = time.time()
big_data['sum_slow'] = big_data.apply(lambda row: row['x'] + row['y'], axis=1)
slow_time = time.time() - start

# 快的方法：向量化操作
start = time.time()
big_data['sum_fast'] = big_data['x'] + big_data['y']
fast_time = time.time() - start

print(f"apply方法耗时: {slow_time:.4f}秒")
print(f"向量化方法耗时: {fast_time:.4f}秒")
print(f"向量化方法快 {slow_time/fast_time:.1f} 倍")
```

## 4. 数据清洗与预处理：数据质量的守护者

数据清洗是数据分析中最耗时但最重要的环节。**垃圾进，垃圾出**——无论模型多先进，脏数据都会导致错误结论。

```python
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder
import re

print("=== 数据清洗与预处理完整流程 ===")

# 1. 创建包含各种问题的脏数据
print("1. 创建脏数据示例")
np.random.seed(42)

dirty_data = pd.DataFrame({
    'id': range(1, 101),
    '姓名': ['张三', '李四', '王五', '赵六', '张三'] +
           [f'用户{i}' for i in range(6, 96)] + ['NULL', 'NaN', '', None],
    '年龄': list(np.random.randint(18, 65, 95)) + [999, -5, 200, None, 0],
    '邮箱': [f'user{i}@example.com' if i % 10 != 0 else np.nan for i in range(100)],
    '电话': [f'138{str(i).zfill(8)}' if i % 7 != 0 else 'invalid' for i in range(100)],
    '注册日期': pd.date_range('2020-01-01', periods=100, freq='D').astype(str),
    '消费金额': list(np.random.normal(1000, 300, 95)) + [1000000, -500, np.nan, np.nan, 0],
    '城市': ['北京', '上海', '广州', '深圳'] * 25,
    '性别': ['男', '女', 'M', 'F', '男性', '女性'] * 16 + ['未知', '其他', 'null', ''],
    '会员等级': ['青铜', '白银', '黄金', '铂金', '钻石'] * 20
})

# 故意制造一些不一致
dirty_data.loc[10:15, '注册日期'] = '2020-01-01'  # 重复日期
dirty_data.loc[20:25, '城市'] = 'beijing'  # 大小写不一致
dirty_data.loc[30:35, '城市'] = 'ShangHai'  # 拼写不一致

print("原始脏数据（前10行）:")
print(dirty_data.head(10))
print(f"\n数据形状: {dirty_data.shape}")
print("\n数据类型:")
print(dirty_data.dtypes)
print("\n缺失值统计:")
print(dirty_data.isnull().sum())

# 2. 缺失值处理
print("\n2. 缺失值处理")

# 检查缺失值比例
missing_percent = dirty_data.isnull().sum() / len(dirty_data) * 100
print("各列缺失值比例:")
print(missing_percent)

# 删除缺失值过多的列
threshold = 30  # 缺失值超过30%的列删除
cols_to_drop = missing_percent[missing_percent > threshold].index.tolist()
if cols_to_drop:
    print(f"删除缺失值过多的列: {cols_to_drop}")
    dirty_data = dirty_data.drop(columns=cols_to_drop)

# 处理姓名列的缺失值
print("\n处理姓名列的缺失值:")
name_missing = dirty_data['姓名'].isnull()
dirty_data.loc[name_missing, '姓名'] = '未知用户'

# 用均值填充年龄缺失值
age_mean = dirty_data['年龄'].mean()
dirty_data['年龄'] = dirty_data['年龄'].fillna(age_mean)
print(f"用均值{age_mean:.1f}填充年龄缺失值")

# 用中位数填充消费金额缺失值
spending_median = dirty_data['消费金额'].median()
dirty_data['消费金额'] = dirty_data['消费金额'].fillna(spending_median)
print(f"用中位数{spending_median:.1f}填充消费金额缺失值")

# 3. 异常值检测与处理
print("\n3. 异常值检测与处理")

# 使用IQR方法检测异常值
def detect_outliers_iqr(df, column):
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR

    outliers = df[(df[column] < lower_bound) | (df[column] > upper_bound)]
    return outliers, lower_bound, upper_bound

print("年龄异常值检测:")
age_outliers, age_lower, age_upper = detect_outliers_iqr(dirty_data, '年龄')
print(f"异常值范围: < {age_lower:.1f} 或 > {age_upper:.1f}")
print(f"找到 {len(age_outliers)} 个年龄异常值")

print("\n消费金额异常值检测:")
spending_outliers, spending_lower, spending_upper = detect_outliers_iqr(dirty_data, '消费金额')
print(f"异常值范围: < {spending_lower:.1f} 或 > {spending_upper:.1f}")
print(f"找到 {len(spending_outliers)} 个消费金额异常值")

# 处理异常值：用边界值替换
dirty_data['年龄'] = dirty_data['年龄'].clip(age_lower, age_upper)
dirty_data['消费金额'] = dirty_data['消费金额'].clip(spending_lower, spending_upper)

# 4. 数据类型转换
print("\n4. 数据类型转换")

# 注册日期转换为datetime类型
dirty_data['注册日期'] = pd.to_datetime(dirty_data['注册日期'], errors='coerce')

# 消费金额转换为float类型
dirty_data['消费金额'] = pd.to_numeric(dirty_data['消费金额'], errors='coerce')

print("转换后的数据类型:")
print(dirty_data.dtypes)

# 5. 文本数据清洗
print("\n5. 文本数据清洗")

# 清洗城市名称（统一格式）
def clean_city_name(city):
    if pd.isna(city):
        return '未知'

    city = str(city).strip()
    # 统一为中文标准名称
    city_map = {
        'beijing': '北京',
        'shanghai': '上海',
        'ShangHai': '上海',
        'guangzhou': '广州',
        'shenzhen': '深圳'
    }

    return city_map.get(city.lower(), city)

dirty_data['城市'] = dirty_data['城市'].apply(clean_city_name)

# 清洗性别数据
def clean_gender(gender):
    if pd.isna(gender) or gender in ['', 'null', 'NULL', '未知', '其他']:
        return '未知'

    gender = str(gender).strip()
    if gender in ['男', '男性', 'M', 'm']:
        return '男'
    elif gender in ['女', '女性', 'F', 'f']:
        return '女'
    else:
        return '未知'

dirty_data['性别'] = dirty_data['性别'].apply(clean_gender)

# 验证邮箱格式
def is_valid_email(email):
    if pd.isna(email):
        return False

    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, str(email)))

dirty_data['邮箱有效'] = dirty_data['邮箱'].apply(is_valid_email)
print(f"有效邮箱数量: {dirty_data['邮箱有效'].sum()}")

# 6. 重复数据处理
print("\n6. 重复数据处理")

# 检查重复行
duplicates = dirty_data.duplicated()
print(f"完全重复的行数: {duplicates.sum()}")

# 检查指定列的重复
name_duplicates = dirty_data.duplicated(subset=['姓名', '电话'], keep=False)
print(f"姓名和电话组合重复的行数: {name_duplicates.sum()}")

if name_duplicates.sum() > 0:
    print("\n重复的记录:")
    print(dirty_data[name_duplicates].sort_values('姓名'))

# 删除重复行，保留第一个
initial_rows = len(dirty_data)
dirty_data = dirty_data.drop_duplicates(subset=['姓名', '电话'], keep='first')
print(f"删除重复后，行数从 {initial_rows} 减少到 {len(dirty_data)}")

# 7. 特征工程：创建新特征
print("\n7. 特征工程")

# 从注册日期提取特征
dirty_data['注册年份'] = dirty_data['注册日期'].dt.year
dirty_data['注册月份'] = dirty_data['注册日期'].dt.month
dirty_data['注册季度'] = dirty_data['注册日期'].dt.quarter
dirty_data['注册星期'] = dirty_data['注册日期'].dt.dayofweek
dirty_data['注册天数'] = (pd.Timestamp.now() - dirty_data['注册日期']).dt.days

# 创建年龄分组
dirty_data['年龄组'] = pd.cut(dirty_data['年龄'],
                           bins=[0, 20, 30, 40, 50, 100],
                           labels=['20岁以下', '20-30岁', '30-40岁', '40-50岁', '50岁以上'])

# 创建消费等级
dirty_data['消费等级'] = pd.qcut(dirty_data['消费金额'],
                             q=4,
                             labels=['低消费', '中低消费', '中高消费', '高消费'])

print("特征工程后的列:")
print(dirty_data.columns.tolist())

# 8. 数据标准化
print("\n8. 数据标准化")

# 选择数值列进行标准化
numeric_cols = ['年龄', '消费金额', '注册天数']
scaler = StandardScaler()
dirty_data[numeric_cols] = scaler.fit_transform(dirty_data[numeric_cols])

print("标准化后的数值列:")
print(dirty_data[numeric_cols].describe())

# 9. 分类数据编码
print("\n9. 分类数据编码")

# 对会员等级进行标签编码
le = LabelEncoder()
dirty_data['会员等级编码'] = le.fit_transform(dirty_data['会员等级'])
print("会员等级编码映射:")
for i, level in enumerate(le.classes_):
    print(f"{level}: {i}")

# 对城市进行独热编码（One-Hot Encoding）
city_dummies = pd.get_dummies(dirty_data['城市'], prefix='城市')
dirty_data = pd.concat([dirty_data, city_dummies], axis=1)

print("\n独热编码后的列（部分）:")
print([col for col in dirty_data.columns if col.startswith('城市_')])

# 10. 数据验证
print("\n10. 数据验证")

# 验证清洗后的数据质量
validation_results = {
    '无缺失值': dirty_data.isnull().sum().sum() == 0,
    '年龄范围合理': dirty_data['年龄'].between(18, 65).all(),
    '消费金额非负': (dirty_data['消费金额'] >= 0).all(),
    '唯一ID': dirty_data['id'].nunique() == len(dirty_data),
    '邮箱格式正确': dirty_data['邮箱有效'].all()
}

print("数据验证结果:")
for check, result in validation_results.items():
    status = "✓" if result else "✗"
    print(f"{status} {check}")

# 11. 保存清洗后的数据
print("\n11. 保存清洗结果")

# 保存到CSV
dirty_data.to_csv('cleaned_data.csv', index=False, encoding='utf-8-sig')
print("清洗后的数据已保存到 cleaned_data.csv")

# 查看最终数据
print("\n清洗后的数据概览:")
print(f"数据形状: {dirty_data.shape}")
print(f"数据类型:\n{dirty_data.dtypes}")
print("\n前5行数据:")
print(dirty_data.head())

# 12. 数据质量报告
print("\n12. 数据质量报告")

def generate_data_quality_report(df):
    """生成数据质量报告"""
    report = {}

    # 基本统计
    report['总行数'] = len(df)
    report['总列数'] = len(df.columns)
    report['缺失值总数'] = df.isnull().sum().sum()

    # 数据类型分布
    dtype_counts = df.dtypes.value_counts()
    report['数据类型分布'] = dtype_counts.to_dict()

    # 数值列统计
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    report['数值列数量'] = len(numeric_cols)

    # 分类列统计
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns
    report['分类列数量'] = len(categorical_cols)

    return report

quality_report = generate_data_quality_report(dirty_data)
print("数据质量报告:")
for key, value in quality_report.items():
    print(f"{key}: {value}")
```

## 5. 数据聚合与分组：发现数据中的模式

数据聚合是将大量数据**总结为有意义的统计量**的过程，而分组则是按特定条件划分数据进行分析。

```python
import pandas as pd
import numpy as np

print("=== 数据聚合与分组分析 ===")

# 创建销售数据示例
np.random.seed(42)
n_records = 1000

sales_data = pd.DataFrame({
    '订单ID': range(1001, 1001 + n_records),
    '日期': pd.date_range('2023-01-01', periods=n_records, freq='D'),
    '产品类别': np.random.choice(['电子产品', '服装', '家居', '食品', '图书'], n_records),
    '产品名称': np.random.choice(['iPhone', '外套', '沙发', '牛奶', 'Python编程'], n_records),
    '地区': np.random.choice(['华北', '华东', '华南', '华西', '华中'], n_records),
    '城市': np.random.choice(['北京', '上海', '广州', '深圳', '成都', '武汉'], n_records),
    '销售员': np.random.choice(['张三', '李四', '王五', '赵六', '钱七'], n_records),
    '单价': np.random.uniform(50, 5000, n_records),
    '数量': np.random.randint(1, 10, n_records),
    '折扣': np.random.choice([0, 0.1, 0.2, 0.3], n_records, p=[0.6, 0.2, 0.15, 0.05])
})

# 计算销售额和实际收入
sales_data['销售额'] = sales_data['单价'] * sales_data['数量']
sales_data['实际收入'] = sales_data['销售额'] * (1 - sales_data['折扣'])

print("销售数据（前10行）:")
print(sales_data.head(10))
print(f"\n数据形状: {sales_data.shape}")

# 1. 基本聚合函数
print("\n1. 基本聚合函数")

print("整体统计:")
print(f"总销售额: {sales_data['销售额'].sum():.2f}")
print(f"平均单价: {sales_data['单价'].mean():.2f}")
print(f"最大数量: {sales_data['数量'].max()}")
print(f"最小折扣: {sales_data['折扣'].min()}")
print(f"订单数量: {sales_data['订单ID'].nunique()}")
print(f"产品类别数量: {sales_data['产品类别'].nunique()}")

# 2. 分组聚合：单层分组
print("\n2. 按产品类别分组统计")

category_stats = sales_data.groupby('产品类别').agg({
    '订单ID': 'count',
    '销售额': ['sum', 'mean', 'std'],
    '单价': ['min', 'max', 'mean'],
    '数量': 'sum'
}).round(2)

print("按产品类别统计:")
print(category_stats)

# 3. 多层分组
print("\n3. 按地区和产品类别多层分组")

region_category_stats = sales_data.groupby(['地区', '产品类别']).agg({
    '销售额': 'sum',
    '实际收入': 'sum',
    '订单ID': 'count'
}).round(2)

region_category_stats = region_category_stats.rename(columns={
    '订单ID': '订单数',
    '销售额': '总销售额',
    '实际收入': '总收入'
})

print("地区和产品类别统计:")
print(region_category_stats)

# 4. 分组后排序
print("\n4. 按销售额排序的销售员排名")

salesman_stats = sales_data.groupby('销售员').agg({
    '订单ID': 'count',
    '销售额': 'sum',
    '实际收入': 'sum'
}).round(2)

salesman_stats = salesman_stats.rename(columns={
    '订单ID': '订单数',
    '销售额': '总销售额',
    '实际收入': '总收入'
})

# 按总销售额排序
salesman_sorted = salesman_stats.sort_values('总销售额', ascending=False)
print("销售员业绩排名:")
print(salesman_sorted)

# 5. 分组后筛选
print("\n5. 筛选高业绩销售员")

# 选择总销售额大于平均值的销售员
mean_sales = salesman_stats['总销售额'].mean()
top_salesmen = salesman_stats[salesman_stats['总销售额'] > mean_sales]
print(f"平均销售额: {mean_sales:.2f}")
print(f"高于平均销售额的销售员 ({len(top_salesmen)}人):")
print(top_salesmen)

# 6. 分组应用自定义函数
print("\n6. 应用自定义聚合函数")

def price_range(series):
    """计算价格范围"""
    return series.max() - series.min()

def discount_rate(series):
    """计算平均折扣率"""
    return series.mean()

custom_agg = sales_data.groupby('产品类别').agg({
    '单价': ['min', 'max', price_range, 'mean'],
    '折扣': [discount_rate, 'std'],
    '数量': 'sum'
}).round(2)

print("自定义聚合结果:")
print(custom_agg)

# 7. 分组转换：计算组内排名
print("\n7. 组内排名计算")

# 在每个产品类别内，按销售额对产品排名
sales_data['类别内销售额排名'] = sales_data.groupby('产品类别')['销售额'].rank(
    method='dense',
    ascending=False
).astype(int)

print("添加类别内排名后的数据（前15行）:")
print(sales_data[['产品类别', '产品名称', '销售额', '类别内销售额排名']].head(15))

# 8. 分组筛选：过滤组
print("\n8. 过滤销售记录少的组")

# 只保留至少有50个订单的产品类别
filtered_groups = sales_data.groupby('产品类别').filter(
    lambda x: len(x) >= 50
)

print(f"过滤后数据形状: {filtered_groups.shape}")
print("剩余产品类别:", filtered_groups['产品类别'].unique())

# 9. 分组透视表
print("\n9. 使用透视表分析")

pivot_table = pd.pivot_table(
    sales_data,
    values=['销售额', '实际收入'],
    index=['地区'],
    columns=['产品类别'],
    aggfunc='sum',
    fill_value=0,
    margins=True,
    margins_name='总计'
)

print("地区×产品类别销售额透视表:")
print(pivot_table['销售额'].round(2))

# 10. 时间序列分组
print("\n10. 时间序列分组分析")

# 按月份分组
sales_data['月份'] = sales_data['日期'].dt.to_period('M')
monthly_sales = sales_data.groupby('月份').agg({
    '销售额': 'sum',
    '实际收入': 'sum',
    '订单ID': 'count'
}).round(2)

monthly_sales = monthly_sales.rename(columns={'订单ID': '订单数'})
print("月度销售统计:")
print(monthly_sales)

# 按季度分组
sales_data['季度'] = sales_data['日期'].dt.quarter
quarterly_sales = sales_data.groupby('季度').agg({
    '销售额': ['sum', 'mean', 'std'],
    '订单ID': 'count'
}).round(2)

print("\n季度销售统计:")
print(quarterly_sales)

# 11. 累积计算
print("\n11. 累积计算")

# 按日期排序后计算累积销售额
sales_data_sorted = sales_data.sort_values('日期')
sales_data_sorted['累积销售额'] = sales_data_sorted['销售额'].cumsum()
sales_data_sorted['累积订单数'] = range(1, len(sales_data_sorted) + 1)

print("累积计算（后10行）:")
print(sales_data_sorted[['日期', '销售额', '累积销售额', '累积订单数']].tail(10))

# 12. 分组百分比计算
print("\n12. 分组百分比计算")

# 计算每个销售员的销售额占比
salesman_total = sales_data['销售额'].sum()
salesman_stats['销售额占比'] = (salesman_stats['总销售额'] / salesman_total * 100).round(2)

# 计算每个地区内各城市的销售额占比
region_city_sales = sales_data.groupby(['地区', '城市'])['销售额'].sum().reset_index()
region_city_sales['地区内占比'] = region_city_sales.groupby('地区')['销售额'].apply(
    lambda x: x / x.sum() * 100
).round(2)

print("销售员销售额占比:")
print(salesman_stats[['总销售额', '销售额占比']].sort_values('销售额占比', ascending=False))

print("\n各地区内城市销售占比:")
print(region_city_sales)

# 13. 多指标综合排名
print("\n13. 多指标综合排名")

# 创建综合评分：销售额(50%) + 订单数(30%) + 平均单价(20%)
salesman_stats['综合评分'] = (
    salesman_stats['总销售额'] / salesman_stats['总销售额'].max() * 50 +
    salesman_stats['订单数'] / salesman_stats['订单数'].max() * 30 +
    (sales_data.groupby('销售员')['单价'].mean() /
     sales_data.groupby('销售员')['单价'].mean().max() * 20)
).round(2)

salesman_stats['综合排名'] = salesman_stats['综合评分'].rank(
    method='min',
    ascending=False
).astype(int)

print("销售员综合排名:")
print(salesman_stats.sort_values('综合排名'))

# 14. 高级分组：使用cut函数分组
print("\n14. 使用cut函数创建自定义分组")

# 按销售额大小将订单分组
sales_data['销售额等级'] = pd.cut(
    sales_data['销售额'],
    bins=[0, 1000, 5000, 10000, float('inf')],
    labels=['小额(<1000)', '中额(1000-5000)', '大额(5000-10000)', '超大额(>10000)']
)

sales_level_stats = sales_data.groupby('销售额等级').agg({
    '订单ID': 'count',
    '销售额': 'sum',
    '折扣': 'mean'
}).round(2)

sales_level_stats = sales_level_stats.rename(columns={
    '订单ID': '订单数',
    '销售额': '总销售额'
})

print("销售额等级统计:")
print(sales_level_stats)

# 15. 保存分析结果
print("\n15. 保存分析结果")

# 保存各种分组结果到Excel的不同sheet
with pd.ExcelWriter('sales_analysis_results.xlsx') as writer:
    category_stats.to_excel(writer, sheet_name='产品类别分析')
    region_category_stats.to_excel(writer, sheet_name='地区类别分析')
    salesman_stats.to_excel(writer, sheet_name='销售员分析')
    monthly_sales.to_excel(writer, sheet_name='月度趋势')
    sales_level_stats.to_excel(writer, sheet_name='销售额等级分析')

print("分析结果已保存到 sales_analysis_results.xlsx")

print("\n=== 分组分析总结 ===")
print(f"• 分析了 {len(sales_data)} 条销售记录")
print(f"• 涉及 {sales_data['产品类别'].nunique()} 个产品类别")
print(f"• 覆盖 {sales_data['地区'].nunique()} 个地区")
print(f"• 总销售额: {sales_data['销售额'].sum():.2f}")
print(f"• 平均每单销售额: {sales_data['销售额'].mean():.2f}")
```

## 6. Matplotlib可视化基础：让数据说话

数据可视化是数据分析的**最后一公里**，Matplotlib是Python最基础也是最重要的可视化库。

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# 设置中文字体和样式
plt.rcParams['font.sans-serif'] = ['SimHei', 'Arial Unicode MS', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.style.use('seaborn-v0_8-darkgrid')

print("=== Matplotlib 可视化完全指南 ===")

# 创建示例数据
np.random.seed(42)
months = ['1月', '2月', '3月', '4月', '5月', '6月',
          '7月', '8月', '9月', '10月', '11月', '12月']

data_2023 = {
    '销售额': np.random.randint(80, 150, 12) * 1000,
    '用户数': np.random.randint(500, 2000, 12),
    '成本': np.random.randint(40, 100, 12) * 1000,
    '利润率': np.random.uniform(0.1, 0.4, 12)
}

data_2024 = {
    '销售额': np.random.randint(100, 200, 12) * 1000,
    '用户数': np.random.randint(800, 3000, 12),
    '成本': np.random.randint(50, 120, 12) * 1000,
    '利润率': np.random.uniform(0.15, 0.45, 12)
}

df_2023 = pd.DataFrame(data_2023, index=months)
df_2024 = pd.DataFrame(data_2024, index=months)

print("2023年数据:")
print(df_2023)
print(f"\n2024年数据:")
print(df_2024)

# 1. 基础折线图
print("\n1. 基础折线图")
fig, ax = plt.subplots(figsize=(12, 6))

# 绘制两条折线
ax.plot(months, df_2023['销售额']/1000,
        marker='o', linewidth=2, markersize=8, label='2023年')
ax.plot(months, df_2024['销售额']/1000,
        marker='s', linewidth=2, markersize=8, label='2024年')

# 设置图表属性
ax.set_title('月度销售额对比 (单位:千元)', fontsize=16, fontweight='bold')
ax.set_xlabel('月份', fontsize=12)
ax.set_ylabel('销售额 (千元)', fontsize=12)
ax.legend(fontsize=12)
ax.grid(True, alpha=0.3)

# 添加数据标签
for i, (x, y) in enumerate(zip(months, df_2023['销售额']/1000)):
    ax.text(i, y+2, f'{y:.0f}', ha='center', va='bottom', fontsize=9)

for i, (x, y) in enumerate(zip(months, df_2024['销售额']/1000)):
    ax.text(i, y+2, f'{y:.0f}', ha='center', va='bottom', fontsize=9)

plt.tight_layout()
plt.savefig('line_chart.png', dpi=300, bbox_inches='tight')
print("折线图已保存为 line_chart.png")

# 2. 柱状图
print("\n2. 柱状图")
fig, axes = plt.subplots(1, 2, figsize=(15, 6))

# 子图1：分组柱状图
x = np.arange(len(months))
width = 0.35

axes[0].bar(x - width/2, df_2023['用户数'], width, label='2023年', alpha=0.8)
axes[0].bar(x + width/2, df_2024['用户数'], width, label='2024年', alpha=0.8)

axes[0].set_title('月度用户数对比', fontsize=14, fontweight='bold')
axes[0].set_xlabel('月份', fontsize=12)
axes[0].set_ylabel('用户数', fontsize=12)
axes[0].set_xticks(x)
axes[0].set_xticklabels(months, rotation=45)
axes[0].legend()
axes[0].grid(True, alpha=0.3, axis='y')

# 添加数据标签
for i in range(len(months)):
    axes[0].text(i - width/2, df_2023['用户数'][i] + 50,
                f'{df_2023["用户数"][i]}', ha='center', va='bottom', fontsize=8)
    axes[0].text(i + width/2, df_2024['用户数'][i] + 50,
                f'{df_2024["用户数"][i]}', ha='center', va='bottom', fontsize=8)

# 子图2：堆积柱状图
axes[1].bar(months, df_2023['成本']/1000, label='成本', alpha=0.7)
axes[1].bar(months, (df_2023['销售额'] - df_2023['成本'])/1000,
           bottom=df_2023['成本']/1000, label='利润', alpha=0.7)

axes[1].set_title('销售额构成分析 (2023年)', fontsize=14, fontweight='bold')
axes[1].set_xlabel('月份', fontsize=12)
axes[1].set_ylabel('金额 (千元)', fontsize=12)
axes[1].set_xticklabels(months, rotation=45)
axes[1].legend()
axes[1].grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plt.savefig('bar_charts.png', dpi=300, bbox_inches='tight')
print("柱状图已保存为 bar_charts.png")

# 3. 饼图
print("\n3. 饼图")
fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# 计算季度数据
q1_months = months[0:3]
q2_months = months[3:6]
q3_months = months[6:9]
q4_months = months[9:12]

quarter_sales_2023 = [
    df_2023.loc[q1_months, '销售额'].sum(),
    df_2023.loc[q2_months, '销售额'].sum(),
    df_2023.loc[q3_months, '销售额'].sum(),
    df_2023.loc[q4_months, '销售额'].sum()
]

quarter_sales_2024 = [
    df_2024.loc[q1_months, '销售额'].sum(),
    df_2024.loc[q2_months, '销售额'].sum(),
    df_2024.loc[q3_months, '销售额'].sum(),
    df_2024.loc[q4_months, '销售额'].sum()
]

quarters = ['第一季度', '第二季度', '第三季度', '第四季度']
colors = ['#ff9999', '#66b3ff', '#99ff99', '#ffcc99']

# 子图1：2023年季度分布
axes[0].pie(quarter_sales_2023, labels=quarters, colors=colors, autopct='%1.1f%%',
           startangle=90, explode=(0.05, 0, 0, 0))
axes[0].set_title('2023年销售额季度分布', fontsize=14, fontweight='bold')

# 子图2：2024年季度分布
axes[1].pie(quarter_sales_2024, labels=quarters, colors=colors, autopct='%1.1f%%',
           startangle=90, explode=(0, 0.05, 0, 0))
axes[1].set_title('2024年销售额季度分布', fontsize=14, fontweight='bold')

plt.tight_layout()
plt.savefig('pie_charts.png', dpi=300, bbox_inches='tight')
print("饼图已保存为 pie_charts.png")

# 4. 散点图
print("\n4. 散点图")
fig, ax = plt.subplots(figsize=(10, 6))

# 创建散点数据
np.random.seed(42)
n_points = 100
product_categories = ['电子产品', '服装', '家居', '食品', '图书']
category_data = {}

for category in product_categories:
    category_data[category] = {
        'price': np.random.uniform(50, 500, n_points),
        'sales': np.random.randint(10, 1000, n_points),
        'rating': np.random.uniform(3, 5, n_points)
    }

# 绘制散点图
colors = ['red', 'blue', 'green', 'orange', 'purple']
markers = ['o', 's', '^', 'D', 'v']

for (category, data), color, marker in zip(category_data.items(), colors, markers):
    ax.scatter(data['price'], data['sales'],
              c=color, marker=marker, alpha=0.6,
              s=data['rating']*20, label=category)

ax.set_title('产品价格与销量关系', fontsize=14, fontweight='bold')
ax.set_xlabel('价格 (元)', fontsize=12)
ax.set_ylabel('销量', fontsize=12)
ax.legend(title='产品类别')
ax.grid(True, alpha=0.3)

# 添加回归线
from scipy import stats

all_prices = []
all_sales = []
for data in category_data.values():
    all_prices.extend(data['price'])
    all_sales.extend(data['sales'])

slope, intercept, r_value, p_value, std_err = stats.linregress(all_prices, all_sales)
x_range = np.array([min(all_prices), max(all_prices)])
y_range = intercept + slope * x_range

ax.plot(x_range, y_range, 'r--', linewidth=2,
        label=f'回归线 (R²={r_value**2:.3f})')
ax.legend()

plt.tight_layout()
plt.savefig('scatter_plot.png', dpi=300, bbox_inches='tight')
print("散点图已保存为 scatter_plot.png")

# 5. 直方图
print("\n5. 直方图")
fig, axes = plt.subplots(2, 2, figsize=(12, 10))

# 子图1：销售额分布
axes[0, 0].hist(df_2023['销售额'], bins=10, alpha=0.7, color='blue', edgecolor='black')
axes[0, 0].set_title('2023年销售额分布', fontsize=12)
axes[0, 0].set_xlabel('销售额')
axes[0, 0].set_ylabel('频数')
axes[0, 0].grid(True, alpha=0.3)

# 子图2：用户数分布
axes[0, 1].hist(df_2023['用户数'], bins=8, alpha=0.7, color='green', edgecolor='black')
axes[0, 1].set_title('2023年用户数分布', fontsize=12)
axes[0, 1].set_xlabel('用户数')
axes[0, 1].set_ylabel('频数')
axes[0, 1].grid(True, alpha=0.3)

# 子图3：密度图
from scipy.stats import gaussian_kde

kde = gaussian_kde(df_2023['利润率'])
x_range = np.linspace(df_2023['利润率'].min(), df_2023['利润率'].max(), 100)
axes[1, 0].plot(x_range, kde(x_range), linewidth=2, color='red')
axes[1, 0].fill_between(x_range, kde(x_range), alpha=0.3, color='red')
axes[1, 0].set_title('2023年利润率密度分布', fontsize=12)
axes[1, 0].set_xlabel('利润率')
axes[1, 0].set_ylabel('密度')
axes[1, 0].grid(True, alpha=0.3)

# 子图4：箱线图
box_data = [df_2023['销售额'], df_2024['销售额']]
bp = axes[1, 1].boxplot(box_data, patch_artist=True, labels=['2023', '2024'])

# 设置箱线图颜色
colors = ['lightblue', 'lightgreen']
for patch, color in zip(bp['boxes'], colors):
    patch.set_facecolor(color)

axes[1, 1].set_title('销售额箱线图对比', fontsize=12)
axes[1, 1].set_ylabel('销售额')
axes[1, 1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('distribution_plots.png', dpi=300, bbox_inches='tight')
print("分布图已保存为 distribution_plots.png")

# 6. 高级图表：组合图表
print("\n6. 组合图表")
fig = plt.figure(figsize=(14, 10))

# 创建网格布局
gs = fig.add_gridspec(3, 3)

# 主图：折线图
ax1 = fig.add_subplot(gs[0:2, :])
ax1.plot(months, df_2023['销售额']/1000, 'b-o', label='2023年销售额', linewidth=2)
ax1.plot(months, df_2024['销售额']/1000, 'r-s', label='2024年销售额', linewidth=2)
ax1.set_title('销售额年度对比', fontsize=14, fontweight='bold')
ax1.set_ylabel('销售额 (千元)')
ax1.legend(loc='upper left')
ax1.grid(True, alpha=0.3)

# 副图1：柱状图
ax2 = fig.add_subplot(gs[2, 0])
monthly_growth = ((df_2024['销售额'] - df_2023['销售额']) / df_2023['销售额'] * 100)
colors = ['green' if x >= 0 else 'red' for x in monthly_growth]
ax2.bar(months, monthly_growth, color=colors, edgecolor='black')
ax2.set_title('月度增长率 (%)')
ax2.set_xticklabels(months, rotation=45, fontsize=8)
ax2.axhline(y=0, color='black', linewidth=0.5)
ax2.grid(True, alpha=0.3, axis='y')

# 副图2：饼图
ax3 = fig.add_subplot(gs[2, 1])
profit_2023 = df_2023['销售额'].sum() - df_2023['成本'].sum()
profit_2024 = df_2024['销售额'].sum() - df_2024['成本'].sum()
profit_data = [profit_2023, profit_2024]
ax3.pie(profit_data, labels=['2023', '2024'], autopct='%1.1f%%',
       colors=['lightblue', 'lightgreen'], startangle=90)
ax3.set_title('年度利润占比')

# 副图3：散点图
ax4 = fig.add_subplot(gs[2, 2])
ax4.scatter(df_2023['用户数'], df_2023['销售额']/1000,
           alpha=0.6, color='blue', label='2023')
ax4.scatter(df_2024['用户数'], df_2024['销售额']/1000,
           alpha=0.6, color='red', marker='^', label='2024')
ax4.set_title('用户数 vs 销售额')
ax4.set_xlabel('用户数')
ax4.set_ylabel('销售额 (千元)')
ax4.legend()
ax4.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('combo_chart.png', dpi=300, bbox_inches='tight')
print("组合图表已保存为 combo_chart.png")

# 7. 动画图表（可选）
print("\n7. 动态图表示例（需要在Jupyter中运行）")
# 由于环境限制，这里只展示代码框架

"""
# 动画图表示例代码
import matplotlib.animation as animation

fig, ax = plt.subplots(figsize=(10, 6))
x = np.arange(0, 2*np.pi, 0.01)
line, = ax.plot(x, np.sin(x))

def animate(i):
    line.set_ydata(np.sin(x + i/10.0))
    return line,

ani = animation.FuncAnimation(fig, animate, interval=50, blit=True)
plt.show()
"""

plt.show()
print("\n所有图表已生成完成！")
```

## 7. Seaborn高级可视化：统计图形的艺术

Seaborn基于Matplotlib，提供了更高级的统计图形接口，**默认样式更美观**，统计功能更强大。

```python
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# 设置Seaborn样式
sns.set_theme(style="whitegrid", palette="husl", font_scale=1.1)
plt.rcParams['font.sans-serif'] = ['SimHei', 'Arial Unicode MS', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

print("=== Seaborn 高级可视化指南 ===")

# 创建示例数据集
np.random.seed(42)
n_samples = 500

# 创建包含多个维度的数据集
data = pd.DataFrame({
    '用户ID': range(1, n_samples + 1),
    '年龄': np.random.randint(18, 65, n_samples),
    '年收入': np.random.normal(50000, 15000, n_samples).astype(int),
    '消费金额': np.random.exponential(300, n_samples).astype(int) + 100,
    '购物频率': np.random.poisson(5, n_samples),
    '满意度': np.random.uniform(1, 5, n_samples).round(1),
    '城市': np.random.choice(['北京', '上海', '广州', '深圳', '杭州'], n_samples,
                          p=[0.3, 0.25, 0.2, 0.15, 0.1]),
    '性别': np.random.choice(['男', '女'], n_samples),
    '会员等级': np.random.choice(['普通', '白银', '黄金', '铂金', '钻石'], n_samples,
                              p=[0.4, 0.3, 0.15, 0.1, 0.05]),
    '最近购买': pd.date_range('2023-01-01', periods=n_samples, freq='H'),
    '产品类别': np.random.choice(['电子产品', '服装', '家居', '美妆', '食品'], n_samples)
})

# 添加一些相关性
data['消费金额'] = data['消费金额'] + data['年收入'] * 0.001 + data['年龄'] * 0.5
data['满意度'] = 5 - abs(data['消费金额'] / 1000 - 3) + np.random.normal(0, 0.5, n_samples)
data['满意度'] = data['满意度'].clip(1, 5).round(1)

print("数据集概览:")
print(data.head())
print(f"\n数据集形状: {data.shape}")
print(f"\n数据类型:\n{data.dtypes}")

# 1. 分布图
print("\n1. 分布图展示")
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 直方图 + KDE
sns.histplot(data=data, x='年龄', kde=True, ax=axes[0, 0], bins=20)
axes[0, 0].set_title('年龄分布')

# 箱线图
sns.boxplot(data=data, x='会员等级', y='消费金额', ax=axes[0, 1])
axes[0, 1].set_title('不同会员等级的消费金额')
axes[0, 1].tick_params(axis='x', rotation=45)

# 小提琴图
sns.violinplot(data=data, x='城市', y='满意度', ax=axes[1, 0])
axes[1, 0].set_title('各城市用户满意度分布')

# 密度图
sns.kdeplot(data=data, x='年收入', hue='性别', fill=True, ax=axes[1, 1])
axes[1, 1].set_title('不同性别的收入分布')

plt.tight_layout()
plt.savefig('seaborn_distribution.png', dpi=300, bbox_inches='tight')
print("分布图已保存为 seaborn_distribution.png")

# 2. 关系图
print("\n2. 关系图分析")
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 散点图
sns.scatterplot(data=data, x='年收入', y='消费金额',
                hue='性别', size='购物频率', sizes=(20, 200),
                alpha=0.7, ax=axes[0, 0])
axes[0, 0].set_title('收入与消费关系')

# 带回归线的散点图
sns.regplot(data=data, x='年龄', y='消费金额',
           scatter_kws={'alpha': 0.5}, line_kws={'color': 'red'},
           ax=axes[0, 1])
axes[0, 1].set_title('年龄与消费关系（含回归线）')

# 热力图 - 相关性矩阵
correlation = data[['年龄', '年收入', '消费金额', '购物频率', '满意度']].corr()
sns.heatmap(correlation, annot=True, fmt='.2f', cmap='coolwarm',
           center=0, square=True, ax=axes[1, 0])
axes[1, 0].set_title('变量相关性热力图')

# 聚类图
sns.clustermap(correlation, annot=True, fmt='.2f', cmap='coolwarm',
              figsize=(8, 8), center=0)
plt.savefig('seaborn_clustermap.png', dpi=300, bbox_inches='tight')

# 联合分布图
joint = sns.jointplot(data=data, x='年收入', y='消费金额',
                     kind='scatter', hue='性别', alpha=0.6)
joint.fig.suptitle('收入与消费联合分布', y=1.02)
joint.savefig('seaborn_jointplot.png', dpi=300, bbox_inches='tight')

# 3. 分类数据可视化
print("\n3. 分类数据可视化")
fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 条形图（带误差线）
sns.barplot(data=data, x='城市', y='消费金额', hue='性别',
           ci='sd', ax=axes[0, 0])
axes[0, 0].set_title('各城市性别消费对比')
axes[0, 0].tick_params(axis='x', rotation=45)

# 点图
sns.pointplot(data=data, x='会员等级', y='满意度', hue='性别',
             dodge=True, markers=['o', 's'], linestyles=['-', '--'],
             ax=axes[0, 1])
axes[0, 1].set_title('会员等级满意度对比')
axes[0, 1].tick_params(axis='x', rotation=45)

# 计数图
sns.countplot(data=data, x='城市', hue='产品类别', ax=axes[1, 0])
axes[1, 0].set_title('各城市产品类别分布')
axes[1, 0].tick_params(axis='x', rotation=45)
axes[1, 0].legend(title='产品类别', bbox_to_anchor=(1.05, 1), loc='upper left')

# 盒形图增强版
sns.boxenplot(data=data, x='会员等级', y='年收入', ax=axes[1, 1])
axes[1, 1].set_title('会员等级收入分布（增强盒形图）')
axes[1, 1].tick_params(axis='x', rotation=45)

plt.tight_layout()
plt.savefig('seaborn_categorical.png', dpi=300, bbox_inches='tight')
print("分类数据图已保存为 seaborn_categorical.png")

# 4. 高级多变量分析
print("\n4. 高级多变量分析")

# 配对图
pairplot_vars = ['年龄', '年收入', '消费金额', '满意度']
pair_grid = sns.pairplot(data[pairplot_vars + ['性别']],
                        hue='性别', diag_kind='kde',
                        plot_kws={'alpha': 0.6},
                        diag_kws={'fill': True})
pair_grid.fig.suptitle('多变量配对分析', y=1.02)
pair_grid.savefig('seaborn_pairplot.png', dpi=300, bbox_inches='tight')

# 分面网格
g = sns.FacetGrid(data, col='城市', col_wrap=3, height=4,
                  sharex=False, sharey=False)
g.map(sns.scatterplot, '年收入', '消费金额', '性别', alpha=0.6)
g.add_legend()
g.set_titles('{col_name}')
plt.savefig('seaborn_facetgrid.png', dpi=300, bbox_inches='tight')

# 5. 时间序列可视化
print("\n5. 时间序列分析")

# 按天聚合数据
data['日期'] = data['最近购买'].dt.date
daily_data = data.groupby('日期').agg({
    '消费金额': 'sum',
    '用户ID': 'nunique',
    '满意度': 'mean'
}).reset_index()

daily_data['日期'] = pd.to_datetime(daily_data['日期'])
daily_data = daily_data.sort_values('日期')

fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 时间序列折线图
sns.lineplot(data=daily_data, x='日期', y='消费金额',
            marker='o', ax=axes[0, 0])
axes[0, 0].set_title('日消费金额趋势')
axes[0, 0].tick_params(axis='x', rotation=45)

# 双轴图
ax1 = axes[0, 1]
ax2 = ax1.twinx()

sns.lineplot(data=daily_data, x='日期', y='消费金额',
            color='blue', marker='o', ax=ax1, label='消费金额')
sns.lineplot(data=daily_data, x='日期', y='用户ID',
            color='red', marker='s', ax=ax2, label='用户数')

ax1.set_ylabel('消费金额', color='blue')
ax2.set_ylabel('用户数', color='red')
axes[0, 1].set_title('消费金额与用户数趋势对比')
axes[0, 1].tick_params(axis='x', rotation=45)

# 添加图例
lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left')

# 热力图（按小时）
data['小时'] = data['最近购买'].dt.hour
hourly_heat = data.pivot_table(values='消费金额',
                              index='城市',
                              columns='小时',
                              aggfunc='sum')

sns.heatmap(hourly_heat, cmap='YlOrRd', ax=axes[1, 0])
axes[1, 0].set_title('各城市小时消费热力图')

# 面积图
from matplotlib import cm
colors = cm.get_cmap('Set2', len(daily_data))

axes[1, 1].fill_between(daily_data['日期'], 0, daily_data['消费金额'],
                       alpha=0.3, color='skyblue')
sns.lineplot(data=daily_data, x='日期', y='消费金额',
            ax=axes[1, 1], color='blue')
axes[1, 1].set_title('消费金额面积图')
axes[1, 1].tick_params(axis='x', rotation=45)

plt.tight_layout()
plt.savefig('seaborn_timeseries.png', dpi=300, bbox_inches='tight')
print("时间序列图已保存为 seaborn_timeseries.png")

# 6. 统计模型可视化
print("\n6. 统计模型可视化")

fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 线性回归图
sns.lmplot(data=data, x='年收入', y='消费金额', hue='性别',
          height=5, aspect=1.2, ci=95)
plt.title('收入与消费的线性回归分析')
plt.savefig('seaborn_lmplot.png', dpi=300, bbox_inches='tight')

# 残差图
from sklearn.linear_model import LinearRegression

# 简单线性回归
X = data[['年收入']].values
y = data['消费金额'].values
model = LinearRegression()
model.fit(X, y)
y_pred = model.predict(X)
residuals = y - y_pred

axes[0, 0].scatter(y_pred, residuals, alpha=0.6)
axes[0, 0].axhline(y=0, color='red', linestyle='--')
axes[0, 0].set_xlabel('预测值')
axes[0, 0].set_ylabel('残差')
axes[0, 0].set_title('线性回归残差图')

# QQ图
from scipy import stats

stats.probplot(residuals, dist="norm", plot=axes[0, 1])
axes[0, 1].set_title('残差QQ图（正态性检验）')

# 残差分布
sns.histplot(residuals, kde=True, ax=axes[1, 0])
axes[1, 0].axvline(x=0, color='red', linestyle='--')
axes[1, 0].set_title('残差分布')

# 实际值 vs 预测值
axes[1, 1].scatter(y, y_pred, alpha=0.6)
axes[1, 1].plot([y.min(), y.max()], [y.min(), y.max()],
               'r--', lw=2)  # 对角线
axes[1, 1].set_xlabel('实际值')
axes[1, 1].set_ylabel('预测值')
axes[1, 1].set_title('实际值 vs 预测值')

plt.tight_layout()
plt.savefig('seaborn_model_diagnostics.png', dpi=300, bbox_inches='tight')
print("模型诊断图已保存为 seaborn_model_diagnostics.png")

# 7. 高级组合图表
print("\n7. 高级组合图表")

# 创建多面板图形
fig = plt.figure(figsize=(16, 12))
gs = fig.add_gridspec(3, 3)

# 主热力图
ax1 = fig.add_subplot(gs[0:2, 0:2])
numeric_data = data.select_dtypes(include=[np.number])
corr_matrix = numeric_data.corr()

mask = np.triu(np.ones_like(corr_matrix, dtype=bool))
sns.heatmap(corr_matrix, mask=mask, annot=True, fmt='.2f',
           cmap='RdBu_r', center=0, square=True, ax=ax1,
           cbar_kws={"shrink": 0.8})
ax1.set_title('变量相关性矩阵')

# 小提琴图
ax2 = fig.add_subplot(gs[0, 2])
sns.violinplot(data=data, x='性别', y='满意度', inner='quartile', ax=ax2)
ax2.set_title('性别满意度分布')

# 箱线图
ax3 = fig.add_subplot(gs[1, 2])
sns.boxplot(data=data, x='城市', y='年收入', ax=ax3)
ax3.set_title('各城市收入分布')
ax3.tick_params(axis='x', rotation=45)

# 散点图矩阵
from pandas.plotting import scatter_matrix

ax4 = fig.add_subplot(gs[2, :])
scatter_matrix(data[['年龄', '年收入', '消费金额', '满意度']],
              alpha=0.6, ax=ax4, diagonal='hist', hist_kwds={'bins': 20})
ax4.set_title('多变量散点图矩阵')

plt.tight_layout()
plt.savefig('seaborn_masterpiece.png', dpi=300, bbox_inches='tight')
print("组合图表已保存为 seaborn_masterpiece.png")

plt.show()
print("\n所有Seaborn图表生成完成！")
```

## 8. 数据分析实战案例：电商销售分析

让我们通过一个完整的电商销售分析案例，整合前面学到的所有技能。

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'Arial Unicode MS', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
sns.set_style("whitegrid")

print("=== 电商销售数据分析实战 ===")
print("分析目标：识别销售趋势、用户行为、产品表现，提供商业洞察\n")

# 1. 数据生成与加载
print("1. 数据准备")
np.random.seed(42)

# 生成模拟电商数据
n_transactions = 10000
start_date = datetime(2023, 1, 1)
end_date = datetime(2024, 1, 1)

# 产品信息
products = {
    '电子产品': ['智能手机', '笔记本电脑', '平板电脑', '智能手表', '耳机'],
    '服装': ['男士衬衫', '女士连衣裙', '运动鞋', '牛仔裤', '外套'],
    '家居': ['沙发', '床', '餐桌', '书架', '灯具'],
    '美妆': ['口红', '粉底液', '眼影盘', '面膜', '香水'],
    '食品': ['巧克力', '咖啡', '坚果', '饼干', '茶叶']
}

# 地区信息
regions = {
    '华北': ['北京', '天津', '石家庄', '太原'],
    '华东': ['上海', '南京', '杭州', '合肥'],
    '华南': ['广州', '深圳', '厦门', '南宁'],
    '华西': ['成都', '重庆', '西安', '昆明'],
    '华中': ['武汉', '长沙', '郑州', '南昌']
}

# 生成订单数据
orders = []
for i in range(n_transactions):
    # 随机选择产品类别和产品
    category = np.random.choice(list(products.keys()))
    product = np.random.choice(products[category])

    # 随机选择地区
    region = np.random.choice(list(regions.keys()))
    city = np.random.choice(regions[region])

    # 生成订单时间（2023年随机日期）
    days_diff = (end_date - start_date).days
    random_days = np.random.randint(0, days_diff)
    order_date = start_date + timedelta(days=random_days)

    # 生成订单金额（基于产品类别）
    price_ranges = {
        '电子产品': (1000, 10000),
        '服装': (100, 1000),
        '家居': (500, 5000),
        '美妆': (50, 500),
        '食品': (20, 200)
    }
    min_price, max_price = price_ranges[category]
    amount = np.random.uniform(min_price, max_price)

    # 折扣概率
    discount_prob = np.random.random()
    if discount_prob < 0.3:  # 30%的订单有折扣
        discount = np.random.choice([0.1, 0.2, 0.3, 0.5], p=[0.5, 0.3, 0.15, 0.05])
        final_amount = amount * (1 - discount)
    else:
        discount = 0
        final_amount = amount

    # 生成用户ID（模拟5000个用户）
    user_id = np.random.randint(1, 5001)

    # 支付方式
    payment_method = np.random.choice(['支付宝', '微信支付', '信用卡', '货到付款'],
                                      p=[0.4, 0.4, 0.15, 0.05])

    orders.append({
        '订单ID': i + 100000,
        '用户ID': user_id,
        '订单日期': order_date,
        '产品类别': category,
        '产品名称': product,
        '地区': region,
        '城市': city,
        '原价': round(amount, 2),
        '折扣': discount,
        '实付金额': round(final_amount, 2),
        '支付方式': payment_method
    })

# 创建DataFrame
df = pd.DataFrame(orders)

print(f"生成 {len(df)} 条订单记录")
print(f"时间范围: {df['订单日期'].min().date()} 到 {df['订单日期'].max().date()}")
print(f"产品类别: {df['产品类别'].nunique()} 类")
print(f"用户数量: {df['用户ID'].nunique()} 人")
print(f"总销售额: {df['实付金额'].sum():,.2f} 元")

# 2. 数据清洗与增强
print("\n2. 数据清洗与特征工程")

# 添加时间特征
df['订单月份'] = df['订单日期'].dt.to_period('M')
df['订单季度'] = df['订单日期'].dt.quarter
df['订单星期'] = df['订单日期'].dt.dayofweek  # 0=周一, 6=周日
df['订单小时'] = df['订单日期'].dt.hour
df['是否周末'] = df['订单星期'].apply(lambda x: 1 if x >= 5 else 0)

# 计算订单特征
user_stats = df.groupby('用户ID').agg({
    '订单ID': 'count',
    '实付金额': 'sum',
    '订单日期': ['min', 'max']
}).round(2)

user_stats.columns = ['订单数', '总消费', '首次购买', '最近购买']
user_stats['客单价'] = user_stats['总消费'] / user_stats['订单数']

# 用户分层：RFM分析
current_date = df['订单日期'].max()
user_stats['最近购买天数'] = (current_date - user_stats['最近购买']).dt.days
user_stats['R得分'] = pd.qcut(user_stats['最近购买天数'], q=4, labels=[4, 3, 2, 1])
user_stats['F得分'] = pd.qcut(user_stats['订单数'], q=4, labels=[1, 2, 3, 4])
user_stats['M得分'] = pd.qcut(user_stats['总消费'], q=4, labels=[1, 2, 3, 4])

user_stats['RFM总分'] = user_stats['R得分'].astype(str) + \
                       user_stats['F得分'].astype(str) + \
                       user_stats['M得分'].astype(str)

# 用户分层
def categorize_rfm(row):
    if row['R得分'] == 4 and row['F得分'] >= 3 and row['M得分'] >= 3:
        return '重要价值客户'
    elif row['R得分'] >= 3 and row['F得分'] >= 3:
        return '重要发展客户'
    elif row['R得分'] >= 3 and row['M得分'] >= 3:
        return '重要保持客户'
    elif row['R得分'] == 1:
        return '流失客户'
    else:
        return '一般客户'

user_stats['用户分层'] = user_stats.apply(categorize_rfm, axis=1)

print(f"用户分层分布:")
print(user_stats['用户分层'].value_counts())

# 3. 销售趋势分析
print("\n3. 销售趋势分析")

# 月度销售趋势
monthly_sales = df.groupby('订单月份').agg({
    '订单ID': 'count',
    '实付金额': 'sum',
    '用户ID': 'nunique'
}).round(2)

monthly_sales.columns = ['订单数', '销售额', '用户数']
monthly_sales['客单价'] = monthly_sales['销售额'] / monthly_sales['订单数']

# 创建销售趋势图
fig, axes = plt.subplots(2, 2, figsize=(15, 10))

# 月度销售额
axes[0, 0].plot(monthly_sales.index.astype(str), monthly_sales['销售额']/10000,
                marker='o', linewidth=2)
axes[0, 0].set_title('月度销售额趋势 (万元)', fontsize=12, fontweight='bold')
axes[0, 0].set_xlabel('月份')
axes[0, 0].set_ylabel('销售额 (万元)')
axes[0, 0].tick_params(axis='x', rotation=45)
axes[0, 0].grid(True, alpha=0.3)

# 月度订单数
axes[0, 1].bar(monthly_sales.index.astype(str), monthly_sales['订单数'], alpha=0.7)
axes[0, 1].set_title('月度订单数', fontsize=12, fontweight='bold')
axes[0, 1].set_xlabel('月份')
axes[0, 1].set_ylabel('订单数')
axes[0, 1].tick_params(axis='x', rotation=45)
axes[0, 1].grid(True, alpha=0.3, axis='y')

# 月度用户数
axes[1, 0].plot(monthly_sales.index.astype(str), monthly_sales['用户数'],
                marker='s', linewidth=2, color='green')
axes[1, 0].set_title('月度活跃用户数', fontsize=12, fontweight='bold')
axes[0, 0].set_xlabel('月份')
axes[1, 0].set_ylabel('用户数')
axes[1, 0].tick_params(axis='x', rotation=45)
axes[1, 0].grid(True, alpha=0.3)

# 月度客单价
axes[1, 1].plot(monthly_sales.index.astype(str), monthly_sales['客单价'],
                marker='^', linewidth=2, color='red')
axes[1, 1].set_title('月度客单价', fontsize=12, fontweight='bold')
axes[1, 1].set_xlabel('月份')
axes[1, 1].set_ylabel('客单价 (元)')
axes[1, 1].tick_params(axis='x', rotation=45)
axes[1, 1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('sales_trend.png', dpi=300, bbox_inches='tight')

print(f"全年销售额: {monthly_sales['销售额'].sum():,.2f} 元")
print(f"月均销售额: {monthly_sales['销售额'].mean():,.2f} 元")
print(f"最高月销售额: {monthly_sales['销售额'].max():,.2f} 元 ({monthly_sales['销售额'].idxmax()})")
print(f"平均客单价: {monthly_sales['客单价'].mean():.2f} 元")

# 4. 产品分析
print("\n4. 产品分析")

# 产品类别分析
category_analysis = df.groupby('产品类别').agg({
    '订单ID': 'count',
    '实付金额': 'sum',
    '用户ID': 'nunique',
    '折扣': 'mean'
}).round(2)

category_analysis.columns = ['订单数', '销售额', '购买用户数', '平均折扣']
category_analysis['订单占比'] = category_analysis['订单数'] / category_analysis['订单数'].sum() * 100
category_analysis['销售额占比'] = category_analysis['销售额'] / category_analysis['销售额'].sum() * 100
category_analysis['客单价'] = category_analysis['销售额'] / category_analysis['订单数']

# 热销产品分析
top_products = df.groupby(['产品类别', '产品名称']).agg({
    '订单ID': 'count',
    '实付金额': 'sum'
}).round(2)

top_products.columns = ['销量', '销售额']
top_products = top_products.sort_values('销售额', ascending=False).head(20)

# 产品分析可视化
fig, axes = plt.subplots(2, 2, figsize=(15, 10))

# 产品类别销售额占比
axes[0, 0].pie(category_analysis['销售额占比'],
              labels=category_analysis.index,
              autopct='%1.1f%%', startangle=90)
axes[0, 0].set_title('产品类别销售额占比', fontsize=12, fontweight='bold')

# 产品类别客单价
category_analysis_sorted = category_analysis.sort_values('客单价', ascending=False)
bars = axes[0, 1].bar(category_analysis_sorted.index,
                     category_analysis_sorted['客单价'])
axes[0, 1].set_title('各产品类别客单价', fontsize=12, fontweight='bold')
axes[0, 1].set_xlabel('产品类别')
axes[0, 1].set_ylabel('客单价 (元)')
axes[0, 1].tick_params(axis='x', rotation=45)

# 添加数据标签
for bar in bars:
    height = bar.get_height()
    axes[0, 1].text(bar.get_x() + bar.get_width()/2, height + 10,
                   f'{height:.0f}', ha='center', va='bottom', fontsize=9)

# 热销产品
top10_products = top_products.head(10)
bars = axes[1, 0].barh(range(len(top10_products)), top10_products['销售额'])
axes[1, 0].set_yticks(range(len(top10_products)))
axes[1, 0].set_yticklabels([f"{idx[0]}-{idx[1]}" for idx in top10_products.index])
axes[1, 0].set_title('热销产品TOP10', fontsize=12, fontweight='bold')
axes[1, 0].set_xlabel('销售额 (元)')

# 添加数据标签
for i, (bar, sales) in enumerate(zip(bars, top10_products['销售额'])):
    axes[1, 0].text(sales + max(top10_products['销售额'])*0.01, i,
                   f'{sales:,.0f}', va='center', fontsize=9)

# 折扣分析
discount_analysis = df.groupby('折扣').agg({
    '订单ID': 'count',
    '实付金额': 'sum'
}).round(2)
discount_analysis.columns = ['订单数', '销售额']
discount_analysis['订单占比'] = discount_analysis['订单数'] / discount_analysis['订单数'].sum() * 100

axes[1, 1].bar([f"{x*100:.0f}%" for x in discount_analysis.index],
              discount_analysis['订单数'], alpha=0.7)
axes[1, 1].set_title('不同折扣订单分布', fontsize=12, fontweight='bold')
axes[1, 1].set_xlabel('折扣力度')
axes[1, 1].set_ylabel('订单数')

plt.tight_layout()
plt.savefig('product_analysis.png', dpi=300, bbox_inches='tight')

print(f"\n最畅销类别: {category_analysis['销售额'].idxmax()} "
      f"({category_analysis['销售额'].max():,.2f}元)")
print(f"最高客单价类别: {category_analysis['客单价'].idxmax()} "
      f"({category_analysis['客单价'].max():.2f}元)")
print(f"平均折扣率: {df['折扣'].mean()*100:.1f}%")

# 5. 用户行为分析
print("\n5. 用户行为分析")

# 购买时间分析
hourly_orders = df.groupby('订单小时').agg({
    '订单ID': 'count',
    '实付金额': 'sum'
}).round(2)

weekday_orders = df.groupby('订单星期').agg({
    '订单ID': 'count',
    '实付金额': 'sum'
}).round(2)

weekday_names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
weekday_orders.index = weekday_names

# 用户分层分析
user_segment_analysis = user_stats.groupby('用户分层').agg({
    '订单数': 'sum',
    '总消费': 'sum',
    '用户ID': 'count'
}).round(2)

user_segment_analysis.columns = ['总订单数', '总消费', '用户数']
user_segment_analysis['人均消费'] = user_segment_analysis['总消费'] / user_segment_analysis['用户数']
user_segment_analysis['人均订单'] = user_segment_analysis['总订单数'] / user_segment_analysis['用户数']

# 用户行为可视化
fig, axes = plt.subplots(2, 2, figsize=(15, 10))

# 小时销售分布
axes[0, 0].plot(hourly_orders.index, hourly_orders['订单ID'],
                marker='o', linewidth=2)
axes[0, 0].set_title('24小时订单分布', fontsize=12, fontweight='bold')
axes[0, 0].set_xlabel('小时')
axes[0, 0].set_ylabel('订单数')
axes[0, 0].grid(True, alpha=0.3)
axes[0, 0].fill_between(hourly_orders.index, 0, hourly_orders['订单ID'], alpha=0.3)

# 星期销售分布
bars = axes[0, 1].bar(weekday_orders.index, weekday_orders['订单ID'], alpha=0.7)
axes[0, 1].set_title('星期订单分布', fontsize=12, fontweight='bold')
axes[0, 1].set_xlabel('星期')
axes[0, 1].set_ylabel('订单数')
axes[0, 1].grid(True, alpha=0.3, axis='y')

# 添加数据标签
for bar in bars:
    height = bar.get_height()
    axes[0, 1].text(bar.get_x() + bar.get_width()/2, height + 5,
                   f'{height:.0f}', ha='center', va='bottom', fontsize=9)

# 用户分层占比
axes[1, 0].pie(user_segment_analysis['用户数'],
              labels=user_segment_analysis.index,
              autopct='%1.1f%%', startangle=90)
axes[1, 0].set_title('用户分层分布', fontsize=12, fontweight='bold')

# 用户分层价值
segment_values = user_segment_analysis.sort_values('人均消费', ascending=False)
bars = axes[1, 1].bar(range(len(segment_values)), segment_values['人均消费'])
axes[1, 1].set_xticks(range(len(segment_values)))
axes[1, 1].set_xticklabels(segment_values.index, rotation=45)
axes[1, 1].set_title('各分层人均消费', fontsize=12, fontweight='bold')
axes[1, 1].set_ylabel('人均消费 (元)')
axes[1, 1].grid(True, alpha=0.3, axis='y')

# 添加数据标签
for i, (bar, value) in enumerate(zip(bars, segment_values['人均消费'])):
    axes[1, 1].text(i, value + max(segment_values['人均消费'])*0.01,
                   f'{value:,.0f}', ha='center', fontsize=9)

plt.tight_layout()
plt.savefig('user_behavior.png', dpi=300, bbox_inches='tight')

print(f"\n高峰购买时间: {hourly_orders['订单ID'].idxmax()}:00-{hourly_orders['订单ID'].idxmax()+1}:00")
print(f"周末订单占比: {df[df['是否周末']==1].shape[0]/len(df)*100:.1f}%")
print(f"重要价值客户占比: {user_segment_analysis.loc['重要价值客户', '用户数']/user_segment_analysis['用户数'].sum()*100:.1f}%")
print(f"流失客户占比: {user_segment_analysis.loc['流失客户', '用户数']/user_segment_analysis['用户数'].sum()*100:.1f}%")

# 6. 地区分析
print("\n6. 地区分析")

region_analysis = df.groupby('地区').agg({
    '订单ID': 'count',
    '实付金额': 'sum',
    '用户ID': 'nunique',
    '城市': 'nunique'
}).round(2)

region_analysis.columns = ['订单数', '销售额', '用户数', '城市数']
region_analysis['订单占比'] = region_analysis['订单数'] / region_analysis['订单数'].sum() * 100
region_analysis['销售额占比'] = region_analysis['销售额'] / region_analysis['销售额'].sum() * 100
region_analysis['客单价'] = region_analysis['销售额'] / region_analysis['订单数']

# 城市分析
city_analysis = df.groupby(['地区', '城市']).agg({
    '订单ID': 'count',
    '实付金额': 'sum'
}).round(2)

city_analysis.columns = ['订单数', '销售额']
top_cities = city_analysis.sort_values('销售额', ascending=False).head(10)

# 地区分析可视化
fig, axes = plt.subplots(2, 2, figsize=(15, 10))

# 地区销售额分布
bars = axes[0, 0].bar(region_analysis.index, region_analysis['销售额'], alpha=0.7)
axes[0, 0].set_title('各地区销售额', fontsize=12, fontweight='bold')
axes[0, 0].set_xlabel('地区')
axes[0, 0].set_ylabel('销售额 (元)')
axes[0, 0].tick_params(axis='x', rotation=45)
axes[0, 0].grid(True, alpha=0.3, axis='y')

# 添加数据标签
for bar in bars:
    height = bar.get_height()
    axes[0, 0].text(bar.get_x() + bar.get_width()/2, height + max(region_analysis['销售额'])*0.01,
                   f'{height/10000:.0f}万', ha='center', va='bottom', fontsize=9)

# 地区客单价
bars = axes[0, 1].bar(region_analysis.index, region_analysis['客单价'], alpha=0.7, color='green')
axes[0, 1].set_title('各地区客单价', fontsize=12, fontweight='bold')
axes[0, 1].set_xlabel('地区')
axes[0, 1].set_ylabel('客单价 (元)')
axes[0, 1].tick_params(axis='x', rotation=45)
axes[0, 1].grid(True, alpha=0.3, axis='y')

# 添加数据标签
for bar in bars:
    height = bar.get_height()
    axes[0, 1].text(bar.get_x() + bar.get_width()/2, height + 10,
                   f'{height:.0f}', ha='center', va='bottom', fontsize=9)

# 热销城市
top10_cities = top_cities.head(10)
bars = axes[1, 0].barh(range(len(top10_cities)), top10_cities['销售额'])
axes[1, 0].set_yticks(range(len(top10_cities)))
axes[1, 0].set_yticklabels([f"{idx[0]}-{idx[1]}" for idx in top10_cities.index])
axes[1, 0].set_title('热销城市TOP10', fontsize=12, fontweight='bold')
axes[1, 0].set_xlabel('销售额 (元)')

# 添加数据标签
for i, (bar, sales) in enumerate(zip(bars, top10_cities['销售额'])):
    axes[1, 0].text(sales + max(top10_cities['销售额'])*0.01, i,
                   f'{sales/10000:.1f}万', va='center', fontsize=9)

# 地图样式分布
# 这里使用简单的条形图模拟地理分布
city_by_region = df.groupby(['地区', '城市']).size().unstack(fill_value=0)
city_by_region.plot(kind='bar', stacked=True, ax=axes[1, 1], alpha=0.7)
axes[1, 1].set_title('各地区城市订单分布', fontsize=12, fontweight='bold')
axes[1, 1].set_xlabel('地区')
axes[1, 1].set_ylabel('订单数')
axes[1, 1].tick_params(axis='x', rotation=45)
axes[1, 1].legend(title='城市', bbox_to_anchor=(1.05, 1), loc='upper left')

plt.tight_layout()
plt.savefig('region_analysis.png', dpi=300, bbox_inches='tight')

print(f"\n销售额最高地区: {region_analysis['销售额'].idxmax()} "
      f"({region_analysis['销售额'].max():,.2f}元, 占比{region_analysis['销售额占比'].max():.1f}%)")
print(f"客单价最高地区: {region_analysis['客单价'].idxmax()} "
      f"({region_analysis['客单价'].max():.2f}元)")
print(f"最活跃城市: {top_cities.index[0][1]} ({top_cities.iloc[0]['销售额']:,.2f}元)")

# 7. 综合分析报告
print("\n7. 综合分析报告")
print("=" * 50)

# 关键指标
total_sales = df['实付金额'].sum()
total_orders = len(df)
total_users = df['用户ID'].nunique()
avg_order_value = total_sales / total_orders
conversion_rate = total_users / 5000 * 100  # 假设总用户池5000人

# 月度增长
sales_growth = (monthly_sales['销售额'].iloc[-1] - monthly_sales['销售额'].iloc[0]) / \
               monthly_sales['销售额'].iloc[0] * 100

# 用户价值
high_value_users = user_stats[user_stats['用户分层'] == '重要价值客户']
hv_user_ratio = len(high_value_users) / len(user_stats) * 100
hv_sales_ratio = high_value_users['总消费'].sum() / user_stats['总消费'].sum() * 100

print(f"📊 关键指标:")
print(f"  总销售额: {total_sales:,.2f} 元")
print(f"  总订单数: {total_orders:,} 单")
print(f"  总用户数: {total_users:,} 人")
print(f"  平均客单价: {avg_order_value:.2f} 元")
print(f"  转化率: {conversion_rate:.1f}%")
print(f"  销售额同比增长: {sales_growth:.1f}%")

print(f"\n🎯 用户分析:")
print(f"  重要价值客户占比: {hv_user_ratio:.1f}%")
print(f"  重要价值客户贡献: {hv_sales_ratio:.1f}%")
print(f"  流失客户占比: {user_segment_analysis.loc['流失客户', '用户数']/user_segment_analysis['用户数'].sum()*100:.1f}%")

print(f"\n📈 销售趋势:")
print(f"  最佳销售月份: {monthly_sales['销售额'].idxmax()} "
      f"({monthly_sales['销售额'].max():,.2f}元)")
print(f"  销售高峰期: {hourly_orders['订单ID'].idxmax()}:00-{hourly_orders['订单ID'].idxmax()+1}:00")
print(f"  周末销售占比: {df[df['是否周末']==1].shape[0]/len(df)*100:.1f}%")

print(f"\n🏆 产品表现:")
print(f"  最畅销类别: {category_analysis['销售额'].idxmax()} "
      f"(贡献{category_analysis.loc[category_analysis['销售额'].idxmax(), '销售额占比']:.1f}%)")
print(f"  最高客单价类别: {category_analysis['客单价'].idxmax()} "
      f"({category_analysis['客单价'].max():.2f}元)")
print(f"  热销产品TOP3: {', '.join([idx[1] for idx in top_products.head(3).index])}")

print(f"\n🌍 地区表现:")
print(f"  销售额最高地区: {region_analysis['销售额'].idxmax()} "
      f"(贡献{region_analysis['销售额占比'].max():.1f}%)")
print(f"  最具潜力地区: {region_analysis['客单价'].idxmax()} "
      f"(客单价{region_analysis['客单价'].max():.2f}元)")

print(f"\n💡 商业建议:")
print("  1. 针对重要价值客户推出专属优惠和优先服务")
print("  2. 在销售高峰期增加客服和库存准备")
print("  3. 扩大高客单价产品类别的营销投入")
print("  4. 在低活跃地区开展促销活动")
print("  5. 优化周末和高峰时段的用户体验")

print("\n" + "=" * 50)

# 8. 保存所有分析结果
print("\n8. 保存分析结果")

# 保存数据到Excel
with pd.ExcelWriter('ecommerce_analysis.xlsx') as writer:
    df.to_excel(writer, sheet_name='原始数据', index=False)
    monthly_sales.to_excel(writer, sheet_name='月度趋势')
    category_analysis.to_excel(writer, sheet_name='产品分析')
    user_stats.to_excel(writer, sheet_name='用户分析')
    region_analysis.to_excel(writer, sheet_name='地区分析')
    top_products.to_excel(writer, sheet_name='热销产品')
    user_segment_analysis.to_excel(writer, sheet_name='用户分层')

print("✅ 分析完成!")
print(f"📁 原始数据: {len(df)} 条记录")
print(f"📊 生成图表: 6 张分析图表")
print(f"📄 数据报告: ecommerce_analysis.xlsx")
print(f"📈 关键发现: 已在上方报告中总结")

# 显示所有图表
plt.show()
```

这个完整的数据分析实战案例展示了从数据生成、清洗、分析到可视化的全流程。通过这个案例，你可以学习到：

1. **数据生成**：如何创建真实的模拟数据
2. **数据清洗**：处理现实中的数据问题
3. **特征工程**：从原始数据中提取有价值的信息
4. **多维分析**：从不同角度分析数据
5. **可视化呈现**：用图表清晰表达分析结果
6. **商业洞察**：将数据分析转化为商业建议

数据分析的真正价值在于**从数据中发现洞察，并指导决策**。通过这个实战案例，你可以掌握数据分析的核心技能，并应用到实际工作中。

---

希望这篇完整的数据分析与可视化指南对你有帮助！记得实践是学习的最好方式，尝试用这些技术分析你自己的数据，你会发现数据中隐藏的宝贵洞察。
