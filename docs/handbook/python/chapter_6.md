# Python文件操作与输入输出：数据持久化的艺术

> 文件是程序和外部世界对话的桥梁，掌握文件操作意味着你的程序不再只是内存中的昙花一现，而是能够在磁盘上留下持久足迹的真正应用。

## 前言：从内存到磁盘的旅程

想象一下这样的场景：你花了几个小时编写了一个学生成绩管理系统，录入了100个学生的数据。当你关闭程序再重新打开时，发现所有数据都消失了！这是因为数据只存储在内存中，程序结束就消失了。

这就是为什么我们需要学习文件操作。**文件操作**让程序能够读取和写入数据到磁盘，实现数据的持久化存储。无论是保存用户设置、读取配置文件、处理CSV数据，还是构建数据库应用，文件操作都是必不可少的技能。

在本章中，你将学习Python如何处理文件，从简单的文本文件读写到复杂的二进制文件处理，再到目录操作和数据序列化。让我们开始这段从内存到磁盘的旅程！

## 6.1 文件读写基础：open函数

### open函数：打开文件之门

在Python中，所有文件操作都从`open()`函数开始。这个函数返回一个文件对象，通过它可以进行读写操作。

```python
# open函数的基本语法
# open(file, mode='r', buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None)

# 最简单的文件读取
def 读取文件示例():
    """演示如何使用open函数读取文件"""
    try:
        # 打开文件进行读取
        with open('example.txt', 'r', encoding='utf-8') as 文件:
            内容 = 文件.read()
            print("文件内容:")
            print(内容)
    except FileNotFoundError:
        print("文件不存在！")
    except UnicodeDecodeError:
        print("文件编码错误！")
    except Exception as e:
        print(f"读取文件时发生错误: {e}")

# 创建示例文件
示例内容 = """这是第一行文本。
这是第二行文本，包含中文和符号：！@#￥%
Python文件操作示例。
"""
with open('example.txt', 'w', encoding='utf-8') as 文件:
    文件.write(示例内容)

# 读取文件
读取文件示例()
```

### 文件对象的基本方法

```python
def 文件方法演示():
    """演示文件对象的常用方法"""

    # 创建测试文件
    with open('test.txt', 'w', encoding='utf-8') as f:
        f.write("第一行\n")
        f.write("第二行\n")
        f.write("第三行\n")
        f.write("第四行\n")
        f.write("第五行\n")

    # 演示各种文件读取方法
    with open('test.txt', 'r', encoding='utf-8') as f:
        print("1. read() - 读取整个文件:")
        f.seek(0)  # 将文件指针移动到开头
        print(f"   {f.read()}")

        print("\n2. readline() - 逐行读取:")
        f.seek(0)
        print(f"   第一行: {f.readline().strip()}")
        print(f"   第二行: {f.readline().strip()}")

        print("\n3. readlines() - 读取所有行到列表:")
        f.seek(0)
        行列表 = f.readlines()
        for i, 行 in enumerate(行列表, 1):
            print(f"   第{i}行: {行.strip()}")

        print("\n4. 使用for循环逐行读取:")
        f.seek(0)
        for 行号, 行 in enumerate(f, 1):
            print(f"   第{行号}行: {行.strip()}")

    # 演示文件写入方法
    with open('output.txt', 'w', encoding='utf-8') as f:
        print("\n5. write() - 写入字符串:")
        f.write("这是写入的第一行。\n")

        print("6. writelines() - 写入字符串列表:")
        多行文本 = ["第二行\n", "第三行\n", "第四行\n"]
        f.writelines(多行文本)

    # 验证写入结果
    with open('output.txt', 'r', encoding='utf-8') as f:
        print("\n写入的结果:")
        print(f.read())

    # 清理测试文件
    import os
    for 文件名 in ['test.txt', 'output.txt']:
        if os.path.exists(文件名):
            os.remove(文件名)

文件方法演示()
```

### 实际应用：配置文件读取器

```python
def 读取配置文件(文件路径):
    """
    读取配置文件，返回配置字典

    配置文件格式示例：
    # 这是一个配置文件
    database_host = localhost
    database_port = 3306
    username = admin
    password = secret123

    参数:
        文件路径: 配置文件的路径

    返回:
        dict: 配置字典
    """
    配置 = {}

    try:
        with open(文件路径, 'r', encoding='utf-8') as 文件:
            for 行号, 行 in enumerate(文件, 1):
                行 = 行.strip()

                # 跳过空行和注释
                if not 行 or 行.startswith('#'):
                    continue

                # 解析键值对
                if '=' in 行:
                    键, 值 = 行.split('=', 1)
                    键 = 键.strip()
                    值 = 值.strip()

                    # 尝试将值转换为适当类型
                    if 值.isdigit():
                        值 = int(值)
                    elif 值.lower() in ('true', 'false'):
                        值 = 值.lower() == 'true'
                    elif 值.replace('.', '', 1).isdigit() and 值.count('.') == 1:
                        值 = float(值)

                    配置[键] = 值
                else:
                    print(f"警告: 第{行号}行格式不正确: {行}")

    except FileNotFoundError:
        print(f"错误: 配置文件 '{文件路径}' 不存在")
    except Exception as e:
        print(f"读取配置文件时发生错误: {e}")

    return 配置

def 写入配置文件(文件路径, 配置字典, 注释=None):
    """
    将配置字典写入文件

    参数:
        文件路径: 配置文件的路径
        配置字典: 要写入的配置字典
        注释: 文件开头的注释（可选）
    """
    try:
        with open(文件路径, 'w', encoding='utf-8') as 文件:
            # 写入注释
            if 注释:
                文件.write(f"# {注释}\n# 生成时间: 2023-01-01\n\n")

            # 写入配置项
            for 键, 值 in 配置字典.items():
                if isinstance(值, str) and (' ' in 值 or '#' in 值):
                    # 如果值包含空格或#，用引号包裹
                    文件.write(f"{键} = \"{值}\"\n")
                else:
                    文件.write(f"{键} = {值}\n")

        print(f"配置文件已保存到: {文件路径}")

    except Exception as e:
        print(f"写入配置文件时发生错误: {e}")

# 创建并测试配置文件
配置数据 = {
    "database_host": "localhost",
    "database_port": 3306,
    "database_name": "mydb",
    "username": "admin",
    "password": "mysecretpassword",
    "debug_mode": True,
    "timeout": 30.5,
    "log_level": "INFO"
}

print("配置文件操作演示:")
写入配置文件("app_config.conf", 配置数据, "应用程序配置文件")

读取的配置 = 读取配置文件("app_config.conf")
print("\n读取的配置:")
for 键, 值 in 读取的配置.items():
    print(f"  {键}: {值} (类型: {type(值).__name__})")

# 清理
import os
if os.path.exists("app_config.conf"):
    os.remove("app_config.conf")
```

## 6.2 文本文件与二进制文件

### 文本文件 vs 二进制文件

```python
def 文本与二进制对比():
    """演示文本文件和二进制文件的区别"""

    print("文本文件 vs 二进制文件对比:")

    # 1. 文本文件示例
    print("\n1. 文本文件操作:")

    # 创建文本文件
    文本内容 = "Hello, 世界!\n这是一行中文文本。\nPython文件操作示例。"

    with open('text_file.txt', 'w', encoding='utf-8') as f:
        f.write(文本内容)

    # 读取文本文件
    with open('text_file.txt', 'r', encoding='utf-8') as f:
        print(f"  文本文件内容:\n  {f.read()}")

    # 2. 二进制文件示例
    print("\n2. 二进制文件操作:")

    # 创建二进制数据
    二进制数据 = bytes([65, 66, 67, 68, 69])  # ASCII: A, B, C, D, E
    二进制数据 += b'\x00\x01\x02\x03'  # 添加一些二进制数据
    二进制数据 += "你好".encode('utf-8')  # 添加UTF-8编码的中文

    with open('binary_file.bin', 'wb') as f:
        f.write(二进制数据)

    # 读取二进制文件
    with open('binary_file.bin', 'rb') as f:
        读取的二进制数据 = f.read()

        print(f"  二进制文件大小: {len(读取的二进制数据)} 字节")
        print(f"  前10个字节: {读取的二进制数据[:10]}")
        print(f"  字节列表: {list(读取的二进制数据[:10])}")

        # 尝试解码为文本（部分）
        try:
            # 查找可能的中文部分
            if len(读取的二进制数据) > 9:
                文本部分 = 读取的二进制数据[9:].decode('utf-8')
                print(f"  解码的文本部分: {文本部分}")
        except UnicodeDecodeError:
            print("  无法解码为文本")

    # 3. 混合读写演示
    print("\n3. 混合模式演示:")

    # 文本模式写，二进制模式读
    with open('mixed_file.txt', 'w', encoding='utf-8') as f:
        f.write("Hello World!\n")
        f.write("你好，世界！\n")

    # 以二进制模式读取
    with open('mixed_file.txt', 'rb') as f:
        二进制内容 = f.read()
        print(f"  二进制读取结果: {二进制_content}")
        print(f"  解码为文本: {二进制内容.decode('utf-8')}")

    # 4. 大文件处理演示
    print("\n4. 大文件处理演示:")

    # 创建一个大文本文件
    with open('large_file.txt', 'w', encoding='utf-8') as f:
        for i in range(1000):
            f.write(f"这是第{i+1}行，包含一些数据。\n")

    文件大小 = os.path.getsize('large_file.txt')
    print(f"  大文件大小: {文件_size} 字节 ({文件大小/1024:.2f} KB)")

    # 分块读取大文件
    print("  分块读取大文件（每次1KB）:")
    with open('large_file.txt', 'r', encoding='utf-8') as f:
        块大小 = 1024  # 1KB
        总行数 = 0

        while True:
            块 = f.read(块大小)
            if not 块:
                break

            # 统计块中的行数
            行数 = 块.count('\n')
            总行数 += 行数

        print(f"  总行数: {总行数}")

    # 清理文件
    for 文件名 in ['text_file.txt', 'binary_file.bin', 'mixed_file.txt', 'large_file.txt']:
        if os.path.exists(文件名):
            os.remove(文件名)

文本与二进制对比()
```

### 文本编码的重要性

```python
def 编码问题演示():
    """演示文本编码问题及其解决方案"""

    print("文本编码问题演示:")

    # 1. 不同编码写入
    文本 = "Hello, 世界！Python文件操作。"

    # 用不同编码写入
    编码列表 = ['utf-8', 'gbk', 'utf-16', 'ascii']

    for 编码 in 编码列表:
        try:
            文件名 = f"encoded_{编码}.txt"
            with open(文件名, 'w', encoding=编码) as f:
                f.write(文本)
            文件大小 = os.path.getsize(文件名)
            print(f"  {编码:8}编码写入: {文件大小}字节")
        except UnicodeEncodeError as e:
            print(f"  {编码:8}编码写入失败: {e}")

    # 2. 用错误编码读取（产生乱码）
    print("\n2. 错误编码读取示例:")

    # 先用GBK写入中文
    中文文本 = "你好，世界！"
    with open('gbk_file.txt', 'w', encoding='gbk') as f:
        f.write(中文文本)

    # 尝试用不同编码读取
    print("  用不同编码读取GBK编码的文件:")

    for 编码 in ['utf-8', 'gbk', 'iso-8859-1']:
        try:
            with open('gbk_file.txt', 'r', encoding=编码) as f:
                内容 = f.read()
                print(f"    {编码:12}: {内容}")
        except UnicodeDecodeError as e:
            print(f"    {编码:12}: 解码错误 - {e}")

    # 3. 自动检测编码
    print("\n3. 自动检测编码:")

    # 使用chardet库检测编码（需要安装：pip install chardet）
    try:
        import chardet

        # 创建不同编码的文件
        测试文本 = "Python文件操作和编码处理"

        for 编码 in ['utf-8', 'gbk', 'utf-16']:
            文件名 = f"detect_{编码}.txt"
            with open(文件名, 'wb') as f:
                f.write(测试文本.encode(编码))

            # 检测编码
            with open(文件名, 'rb') as f:
                原始数据 = f.read()
                检测结果 = chardet.detect(原始数据)

                print(f"  文件{文件名}:")
                print(f"    检测编码: {检测结果['encoding']}")
                print(f"    置信度: {检测结果['confidence']:.2%}")
                print(f"    实际编码: {编码}")

    except ImportError:
        print("  注意：chardet库未安装，无法演示自动编码检测")
        print("  安装命令: pip install chardet")

    # 4. 二进制模式下的编码处理
    print("\n4. 二进制模式下的编码处理:")

    # 写入UTF-8 BOM文件（带BOM的UTF-8）
    with open('with_bom.txt', 'wb') as f:
        f.write(b'\xef\xbb\xbf')  # UTF-8 BOM
        f.write("带BOM的UTF-8文件".encode('utf-8'))

    # 读取时处理BOM
    with open('with_bom.txt', 'rb') as f:
        原始数据 = f.read()

        # 检查是否有BOM
        if 原始数据.startswith(b'\xef\xbb\xbf'):
            print("  检测到UTF-8 BOM")
            文本数据 = 原始数据[3:].decode('utf-8')
        else:
            文本数据 = 原始数据.decode('utf-8')

        print(f"  文件内容: {文本数据}")

    # 清理文件
    for 编码 in 编码列表:
        文件名 = f"encoded_{编码}.txt"
        if os.path.exists(文件名):
            os.remove(文件名)

    for 文件名 in ['gbk_file.txt', 'with_bom.txt'] + [f"detect_{编码}.txt" for 编码 in ['utf-8', 'gbk', 'utf-16']]:
        if os.path.exists(文件名):
            os.remove(文件名)

编码问题演示()
```

## 6.3 文件读写模式详解

### 文件模式完整解析

```python
def 文件模式详解():
    """详细解释Python的文件读写模式"""

    print("Python文件模式详解:")
    print("=" * 60)

    # 模式说明表
    模式表 = [
        ("r", "只读", "文本", "文件必须存在", "指针在开头"),
        ("rb", "只读", "二进制", "文件必须存在", "指针在开头"),
        ("r+", "读写", "文本", "文件必须存在", "指针在开头"),
        ("rb+", "读写", "二进制", "文件必须存在", "指针在开头"),

        ("w", "只写", "文本", "创建或清空", "指针在开头"),
        ("wb", "只写", "二进制", "创建或清空", "指针在开头"),
        ("w+", "读写", "文本", "创建或清空", "指针在开头"),
        ("wb+", "读写", "二进制", "创建或清空", "指针在开头"),

        ("a", "追加", "文本", "创建或追加", "指针在末尾"),
        ("ab", "追加", "二进制", "创建或追加", "指针在末尾"),
        ("a+", "读写", "文本", "创建或追加", "指针在末尾"),
        ("ab+", "读写", "二进制", "创建或追加", "指针在末尾"),

        ("x", "排他创建", "文本", "必须不存在", "指针在开头"),
        ("xb", "排他创建", "二进制", "必须不存在", "指针在开头"),
        ("x+", "排他创建读写", "文本", "必须不存在", "指针在开头"),
        ("xb+", "排他创建读写", "二进制", "必须不存在", "指针在开头"),
    ]

    print(f"{'模式':<6} {'操作':<10} {'类型':<8} {'文件要求':<15} {'指针位置':<10}")
    print("-" * 60)

    for 模式, 操作, 类型, 要求, 指针 in 模式表:
        print(f"{模式:<6} {操作:<10} {类型:<8} {要求:<15} {指针:<10}")

    print("\n" + "=" * 60)
    print("模式组合示例:")

    # 1. 'r' 模式示例
    print("\n1. 'r' 模式（只读文本）:")
    with open('test_r.txt', 'w', encoding='utf-8') as f:
        f.write("测试文件内容\n第二行\n")

    try:
        with open('test_r.txt', 'r', encoding='utf-8') as f:
            print(f"  读取内容: {f.read()}")

        # 尝试写入会报错
        with open('test_r.txt', 'r', encoding='utf-8') as f:
            # f.write("尝试写入")  # 这会报错：io.UnsupportedOperation
            print("  尝试写入: 会报错（不支持写入操作）")
    except Exception as e:
        print(f"  错误: {type(e).__name__}: {e}")

    # 2. 'w' 模式示例
    print("\n2. 'w' 模式（只写文本）:")
    with open('test_w.txt', 'w', encoding='utf-8') as f:
        f.write("这是第一行\n")
        print("  写入: '这是第一行'")

    # w模式会清空文件
    with open('test_w.txt', 'w', encoding='utf-8') as f:
        f.write("这是新内容，旧内容被清空了\n")
        print("  再次写入（清空旧内容）: '这是新内容，旧内容被清空了'")

    # 3. 'a' 模式示例
    print("\n3. 'a' 模式（追加文本）:")
    with open('test_a.txt', 'w', encoding='utf-8') as f:
        f.write("原始内容\n")

    with open('test_a.txt', 'a', encoding='utf-8') as f:
        f.write("追加的第一行\n")
        f.write("追加的第二行\n")
        print("  追加了两行内容")

    with open('test_a.txt', 'r', encoding='utf-8') as f:
        print(f"  最终内容:\n{f.read()}")

    # 4. 'r+' 模式示例
    print("\n4. 'r+' 模式（读写文本）:")
    with open('test_r+.txt', 'w', encoding='utf-8') as f:
        f.write("第一行\n第二行\n第三行\n")

    with open('test_r+.txt', 'r+', encoding='utf-8') as f:
        print(f"  读取原内容: {f.read()}")

        # 移动指针到开头
        f.seek(0)

        # 写入会覆盖原有内容
        f.write("覆盖第一行\n")
        print("  写入: '覆盖第一行'")

        # 读取剩余内容
        f.seek(0)
        print(f"  写入后内容: {f.read()}")

    # 5. 'x' 模式示例
    print("\n5. 'x' 模式（排他创建）:")

    # 第一次创建成功
    try:
        with open('test_x.txt', 'x', encoding='utf-8') as f:
            f.write("新创建的文件\n")
            print("  第一次创建: 成功")
    except FileExistsError:
        print("  第一次创建: 文件已存在，创建失败")

    # 第二次尝试创建（会失败）
    try:
        with open('test_x.txt', 'x', encoding='utf-8') as f:
            f.write("再次创建的内容\n")
            print("  第二次创建: 成功")
    except FileExistsError:
        print("  第二次创建: 文件已存在，创建失败")

    # 6. 二进制模式示例
    print("\n6. 二进制模式 ('rb', 'wb') 示例:")

    # 写入二进制数据
    with open('test_binary.bin', 'wb') as f:
        f.write(b'\x00\x01\x02\x03\x04')
        f.write(bytes([65, 66, 67]))  # ABC
        print("  写入二进制数据: 0x00-0x04 和 ASCII ABC")

    # 读取二进制数据
    with open('test_binary.bin', 'rb') as f:
        数据 = f.read()
        print(f"  读取二进制数据: {数据}")
        print(f"  十六进制表示: {数据.hex()}")

    # 7. 'a+' 模式示例
    print("\n7. 'a+' 模式（追加读写）:")

    with open('test_a+.txt', 'w', encoding='utf-8') as f:
        f.write("原始内容\n")

    with open('test_a+.txt', 'a+', encoding='utf-8') as f:
        # 写入
        f.write("追加内容\n")
        print("  追加内容: '追加内容'")

        # 移动指针读取
        f.seek(0)
        内容 = f.read()
        print(f"  读取全部内容:\n{内容}")

    # 清理测试文件
    测试文件 = [
        'test_r.txt', 'test_w.txt', 'test_a.txt',
        'test_r+.txt', 'test_x.txt', 'test_binary.bin',
        'test_a+.txt'
    ]

    for 文件 in 测试文件:
        if os.path.exists(文件):
            os.remove(文件)

    print("\n" + "=" * 60)
    print("总结: 根据需求选择合适的文件模式非常重要！")

文件模式详解()
```

## 6.4 文件指针与随机访问

### 文件指针操作

```python
def 文件指针演示():
    """演示文件指针的操作和随机访问"""

    print("文件指针与随机访问演示:")
    print("=" * 60)

    # 创建测试文件
    内容 = "行1: 这是第一行文本\n行2: 这是第二行文本\n行3: 这是第三行文本\n行4: 这是第四行文本\n行5: 这是第五行文本\n"

    with open('pointer_test.txt', 'w', encoding='utf-8') as f:
        f.write(内容)

    文件大小 = os.path.getsize('pointer_test.txt')
    print(f"文件大小: {文件大小} 字节")
    print(f"文件内容:\n{内容}")

    print("\n1. tell() - 获取当前指针位置:")
    with open('pointer_test.txt', 'r', encoding='utf-8') as f:
        print(f"  初始位置: {f.tell()}")  # 0

        # 读取一些数据
        数据 = f.read(10)
        print(f"  读取10字节后位置: {f.tell()}")
        print(f"  读取的数据: '{数据}'")

        # 再读取10字节
        数据 = f.read(10)
        print(f"  再读10字节后位置: {f.tell()}")
        print(f"  读取的数据: '{数据}'")

    print("\n2. seek() - 移动文件指针:")
    with open('pointer_test.txt', 'r', encoding='utf-8') as f:
        # 移动到文件开头
        f.seek(0)
        print(f"  seek(0)后位置: {f.tell()}")

        # 移动到第20字节
        f.seek(20)
        print(f"  seek(20)后位置: {f.tell()}")
        print(f"  从位置20读取: '{f.read(10)}'")

        # 从当前位置向前移动
        f.seek(5, 1)  # 从当前位置向前移动5字节
        print(f"  seek(5, 1)后位置: {f.tell()}")

        # 从文件末尾向前移动
        f.seek(-15, 2)  # 从文件末尾向前移动15字节
        print(f"  seek(-15, 2)后位置: {f.tell()}")
        print(f"  读取最后部分: '{f.read()}'")

    print("\n3. seek()的whence参数:")
    print("  seek(offset, whence) 参数说明:")
    print("  whence=0: 从文件开头计算（默认）")
    print("  whence=1: 从当前位置计算")
    print("  whence=2: 从文件末尾计算")

    with open('pointer_test.txt', 'rb') as f:  # 二进制模式更精确
        # 演示不同whence值
        f.seek(10)  # 移动到第10字节
        print(f"\n  初始位置: {f.tell()}")

        f.seek(5, 1)  # 从当前位置向前5字节
        print(f"  seek(5, 1)后位置: {f.tell()} (10+5=15)")

        f.seek(-3, 1)  # 从当前位置向后3字节
        print(f"  seek(-3, 1)后位置: {f.tell()} (15-3=12)")

        f.seek(0, 2)  # 移动到文件末尾
        print(f"  seek(0, 2)后位置: {f.tell()} (文件末尾)")

        f.seek(-20, 2)  # 从文件末尾向前20字节
        print(f"  seek(-20, 2)后位置: {f.tell()}")

    print("\n4. 随机访问应用示例:")
    print("  4.1 读取特定行:")

    def 读取文件指定行(文件路径, 行号):
        """读取文件的指定行（从1开始）"""
        with open(文件路径, 'r', encoding='utf-8') as f:
            for 当前行号, 行 in enumerate(f, 1):
                if 当前行号 == 行号:
                    return 行.strip()
            return None

    print(f"  第3行: {读取文件指定行('pointer_test.txt', 3)}")
    print(f"  第5行: {读取文件指定行('pointer_test.txt', 5)}")

    print("\n  4.2 高效读取大文件的最后N行:")

    def 读取文件最后几行(文件路径, 行数=10, 块大小=1024):
        """高效读取文件的最后几行"""
        with open(文件路径, 'rb') as f:
            # 移动到文件末尾
            f.seek(0, 2)
            文件大小 = f.tell()

            缓冲区 = b''
            指针位置 = 文件大小

            while 指针位置 > 0 and len(缓冲区.splitlines()) < 行数 + 1:
                # 计算要读取的块大小
                读取大小 = min(块大小, 指针位置)
                指针位置 -= 读取大小

                # 移动到读取位置
                f.seek(指针位置)

                # 读取数据并添加到缓冲区前面
                缓冲区 = f.read(读取大小) + 缓冲区

            # 解码并获取最后几行
            行列表 = 缓冲区.decode('utf-8').splitlines()
            return 行列表[-行数:] if len(行列表) >= 行数 else 行列表

    print(f"  最后2行: {读取文件最后几行('pointer_test.txt', 2)}")

    print("\n  4.3 修改文件中间部分:")

    def 修改文件中间内容(文件路径, 位置, 新内容):
        """修改文件的指定位置内容"""
        with open(文件路径, 'r+', encoding='utf-8') as f:
            # 移动到指定位置
            f.seek(位置)

            # 读取后面的内容
            后面内容 = f.read()

            # 移动回位置
            f.seek(位置)

            # 写入新内容和原来的后面内容
            f.write(新内容 + 后面内容)

    # 备份原文件
    import shutil
    shutil.copy('pointer_test.txt', 'pointer_test_backup.txt')

    # 修改第3行的开头
    print("  修改前第3行:", 读取文件指定行('pointer_test.txt', 3))

    # 计算第3行的位置（需要知道确切的字节位置）
    with open('pointer_test.txt', 'r', encoding='utf-8') as f:
        内容 = f.read()
        行列表 = 内容.splitlines(keepends=True)  # keepends保留换行符

        # 计算前两行的总长度
        前两行长度 = sum(len(行) for 行 in 行列表[:2])

        # 修改第3行
        with open('pointer_test.txt', 'r+', encoding='utf-8') as f:
            f.seek(前两行长度)
            原第三行 = f.readline()
            新第三行 = "行3: 这是修改后的第三行文本\n"

            # 移动回第三行开始位置
            f.seek(前两行长度)

            # 写入新行和剩余内容
            f.write(新第三行)
            # 注意：这里假设新行长度不超过原行长度，否则会覆盖后面的内容

    print("  修改后第3行:", 读取文件指定行('pointer_test.txt', 3))

    # 恢复原文件
    shutil.move('pointer_test_backup.txt', 'pointer_test.txt')

    print("\n  4.4 二进制文件的随机访问:")

    # 创建包含学生记录的文件
    学生记录格式 = "10s i f"  # 10字符姓名, 整数年龄, 浮点数成绩
    记录大小 = 18  # 10 + 4 + 4 = 18字节

    import struct

    with open('students.dat', 'wb') as f:
        # 写入3条记录
        for i, (姓名, 年龄, 成绩) in enumerate([
            ("张三".ljust(10), 20, 85.5),
            ("李四".ljust(10), 21, 92.0),
            ("王五".ljust(10), 19, 78.5)
        ]):
            # 打包数据
            数据 = struct.pack(学生记录格式,
                             姓名.encode('utf-8'), 年龄, 成绩)
            f.write(数据)
            print(f"    写入记录{i+1}: 姓名={姓名.strip()}, 年龄={年龄}, 成绩={成绩}")

    # 随机读取第2条记录
    with open('students.dat', 'rb') as f:
        f.seek(记录大小 * 1)  # 移动到第2条记录（索引从0开始）
        数据 = f.read(记录大小)
        姓名, 年龄, 成绩 = struct.unpack(学生记录格式, 数据)
        print(f"\n  读取第2条记录:")
        print(f"    姓名: {姓名.decode('utf-8').strip()}")
        print(f"    年龄: {年龄}")
        print(f"    成绩: {成绩}")

    # 清理文件
    for 文件 in ['pointer_test.txt', 'students.dat']:
        if os.path.exists(文件):
            os.remove(文件)

    print("\n" + "=" * 60)
    print("文件指针操作是随机访问文件的基础，掌握它可以在处理大文件时提高效率！")

文件指针演示()
```

## 6.5 上下文管理器与with语句

### with语句的工作原理

```python
def with语句详解():
    """详细解释with语句和上下文管理器"""

    print("with语句与上下文管理器详解:")
    print("=" * 60)

    print("1. with语句的基本用法:")

    # 传统的文件操作方式
    print("\n  传统方式（需要手动关闭文件）:")
    f = None
    try:
        f = open('with_test.txt', 'w', encoding='utf-8')
        f.write("传统方式写入内容\n")
        print("    写入完成")
    finally:
        if f:
            f.close()
            print("    文件已关闭")

    # 使用with语句
    print("\n  with语句方式（自动关闭文件）:")
    with open('with_test.txt', 'a', encoding='utf-8') as f:
        f.write("with语句追加内容\n")
        print("    追加完成")
    print("    文件自动关闭")

    # 验证文件已关闭
    print(f"    文件是否关闭: {f.closed}")

    print("\n2. with语句处理多个资源:")

    with open('source1.txt', 'w', encoding='utf-8') as f1, \
         open('source2.txt', 'w', encoding='utf-8') as f2:
        f1.write("文件1的内容\n")
        f2.write("文件2的内容\n")
        print("  两个文件同时打开并写入")

    print("  两个文件都已自动关闭")

    print("\n3. 自定义上下文管理器:")

    # 方法1：使用类实现上下文管理器
    print("  方法1：使用类实现上下文管理器")

    class 计时器上下文管理器:
        """测量代码执行时间的上下文管理器"""

        def __init__(self, 名称="未命名"):
            self.名称 = 名称
            self.开始时间 = None

        def __enter__(self):
            self.开始时间 = time.time()
            print(f"    [{self.名称}] 开始执行")
            return self

        def __exit__(self, 异常类型, 异常值, 异常追踪):
            结束时间 = time.time()
            耗时 = 结束时间 - self.开始时间
            print(f"    [{self.名称}] 执行完成，耗时: {耗时:.4f}秒")

            # 如果发生异常，返回True表示已处理，False表示向上传播
            if 异常类型:
                print(f"    [{self.名称}] 发生异常: {异常类型.__name__}: {异常值}")
                return False  # 不处理异常，向上传播

    import time

    # 使用自定义上下文管理器
    with 计时器上下文管理器("测试代码块") as 计时器:
        time.sleep(0.5)  # 模拟耗时操作
        print("    正在执行一些操作...")

    # 测试异常处理
    print("\n  测试异常情况:")
    try:
        with 计时器上下文管理器("异常测试") as 计时器:
            time.sleep(0.1)
            raise ValueError("测试异常")
    except ValueError as e:
        print(f"    捕获到异常: {e}")

    # 方法2：使用contextlib实现上下文管理器
    print("\n  方法2：使用contextlib实现上下文管理器")

    from contextlib import contextmanager

    @contextmanager
    def 临时文件上下文(文件名, 内容):
        """创建临时文件并在退出时删除"""
        print(f"    创建临时文件: {文件名}")
        with open(文件名, 'w', encoding='utf-8') as f:
            f.write(内容)

        try:
            yield 文件名  # 将文件名传递给with语句中的变量
        finally:
            print(f"    删除临时文件: {文件名}")
            if os.path.exists(文件名):
                os.remove(文件名)

    # 使用上下文管理器
    with 临时文件上下文("temp.txt", "临时文件内容") as 临时文件路径:
        print(f"    临时文件路径: {临时文件路径}")
        with open(临时文件路径, 'r', encoding='utf-8') as f:
            print(f"    临时文件内容: {f.read()}")

    print("    临时文件已被自动删除")

    print("\n4. 数据库连接示例:")

    # 模拟数据库连接上下文管理器
    class 数据库连接:
        """模拟数据库连接的上下文管理器"""

        def __init__(self, 数据库名称):
            self.数据库名称 = 数据库名称
            self.连接 = None

        def __enter__(self):
            print(f"    连接到数据库: {self.数据库名称}")
            # 模拟连接
            self.连接 = {"名称": self.数据库名称, "状态": "已连接"}
            return self

        def 执行查询(self, 查询语句):
            print(f"    执行查询: {查询语句}")
            # 模拟查询结果
            return [{"id": 1, "name": "张三"}, {"id": 2, "name": "李四"}]

        def __exit__(self, 异常类型, 异常值, 异常追踪):
            print(f"    关闭数据库连接: {self.数据库名称}")
            self.连接["状态"] = "已关闭"

            # 清理资源
            self.连接 = None

    # 使用数据库连接
    with 数据库连接("my_database") as db:
        结果 = db.执行查询("SELECT * FROM users")
        print(f"    查询结果: {结果}")

    print("\n5. 锁机制示例:")

    import threading

    class 线程安全写入器:
        """线程安全的文件写入器"""

        def __init__(self, 文件名):
            self.文件名 = 文件名
            self.锁 = threading.Lock()

        def __enter__(self):
            self.锁.acquire()
            self.文件 = open(self.文件名, 'a', encoding='utf-8')
            return self

        def 写入(self, 内容):
            self.文件.write(内容)

        def __exit__(self, 异常类型, 异常值, 异常追踪):
            self.文件.close()
            self.锁.release()

    # 在多线程环境中使用
    def 线程函数(线程号, 写入器):
        with 写入器 as w:
            w.写入(f"线程{线程号}写入的内容\n")
            print(f"  线程{线程号}写入完成")

    print("  多线程写入测试:")
    写入器 = 线程安全写入器("thread_safe.txt")
    线程列表 = []

    for i in range(5):
        线程 = threading.Thread(target=线程函数, args=(i, 写入器))
        线程列表.append(线程)
        线程.start()

    for 线程 in 线程列表:
        线程.join()

    # 读取结果
    with open("thread_safe.txt", 'r', encoding='utf-8') as f:
        print(f"  最终文件内容:\n{f.read()}")

    print("\n6. with语句的嵌套:")

    class 缩进管理器:
        """管理输出缩进的上下文管理器"""

        def __init__(self, 缩进级别=1):
            self.缩进级别 = 缩进级别

        def __enter__(self):
            print("  " * self.缩进级别 + "↳ 进入缩进块")
            return self

        def 打印(self, 消息):
            print("  " * (self.缩进级别 + 1) + f"• {消息}")

        def __exit__(self, 异常类型, 异常值, 异常追踪):
            print("  " * self.缩进级别 + "↳ 退出缩进块")

    print("开始:")
    with 缩进管理器(1) as 缩进1:
        缩进1.打印("第一层内容")

        with 缩进管理器(2) as 缩进2:
            缩进2.打印("第二层内容")

            with 缩进管理器(3) as 缩进3:
                缩进3.打印("第三层内容")

    # 清理文件
    for 文件 in ['with_test.txt', 'source1.txt', 'source2.txt', 'thread_safe.txt']:
        if os.path.exists(文件):
            os.remove(文件)

    print("\n" + "=" * 60)
    print("with语句不仅让代码更简洁，还能确保资源被正确释放，是Pythonic编程的重要部分！")

with语句详解()
```

## 6.6 标准输入输出：input与print

### input函数：获取用户输入

```python
def input函数详解():
    """详细解释input函数的使用"""

    print("input函数详解:")
    print("=" * 60)

    print("1. 基本input使用:")

    # 简单示例（注释掉实际输入，以免阻塞程序）
    # 姓名 = input("请输入你的姓名: ")
    # print(f"你好，{姓名}!")

    print("  示例: 姓名 = input('请输入你的姓名: ')")
    print("  结果: 等待用户输入，然后打印问候语")

    print("\n2. input函数参数:")

    # 提示信息可以是多行
    提示 = """请选择操作:
    1. 查询
    2. 添加
    3. 删除
    4. 退出
请选择(1-4): """

    print(f"  多行提示示例:\n{提示}")
    # 选择 = input(提示)

    print("\n3. input返回值总是字符串:")

    # 演示input返回字符串
    # 年龄输入 = input("请输入你的年龄: ")
    # print(f"类型: {type(年龄输入)}, 值: {年龄输入}")

    # 需要类型转换
    # 年龄 = int(年龄输入)
    # print(f"转换后年龄: {年龄}, 类型: {type(年龄)}")

    print("\n4. 安全的input处理:")

    def 获取整数输入(提示信息, 最小值=None, 最大值=None, 默认值=None):
        """
        安全地获取整数输入

        参数:
            提示信息: 显示给用户的提示
            最小值: 允许的最小值
            最大值: 允许的最大值
            默认值: 如果用户直接回车，返回的默认值
        """
        while True:
            try:
                # 获取输入
                用户输入 = input(提示信息)

                # 如果用户直接回车且有默认值
                if 用户输入 == "" and 默认值 is not None:
                    return 默认值

                # 转换为整数
                值 = int(用户输入)

                # 检查范围
                if 最小值 is not None and 值 < 最小值:
                    print(f"  错误: 值不能小于{最小值}")
                    continue

                if 最大值 is not None and 值 > 最大值:
                    print(f"  错误: 值不能大于{最大值}")
                    continue

                return 值

            except ValueError:
                print("  错误: 请输入有效的整数")

    # 模拟使用（注释掉实际输入）
    print("  示例: 获取1-100之间的整数")
    # 分数 = 获取整数输入("请输入分数(1-100): ", 最小值=1, 最大值=100, 默认值=60)
    # print(f"  输入的分数: {分数}")

    print("\n5. 获取多行输入:")

    def 获取多行输入(提示信息="请输入多行内容(输入空行结束):\n"):
        """获取多行输入，直到用户输入空行"""
        print(提示信息)
        行列表 = []

        while True:
            try:
                行 = input()
                if 行 == "":  # 空行结束输入
                    break
                行列表.append(行)
            except EOFError:  # 用户按Ctrl+D或Ctrl+Z
                break

        return 行列表

    print("  示例: 用户可以输入多行文本，空行结束")
    # 内容 = 获取多行输入()
    # print(f"  输入了{len(内容)}行:")
    # for i, 行 in enumerate(内容, 1):
    #     print(f"    第{i}行: {行}")

    print("\n6. 密码输入（不显示字符）:")

    def 获取密码输入(提示信息="请输入密码: "):
        """获取密码输入，不显示字符"""
        import getpass

        try:
            return getpass.getpass(提示信息)
        except Exception as e:
            # 如果getpass不可用，回退到普通input
            print("  警告: 密码将以明文显示")
            return input(提示信息)

    print("  示例: 密码输入时不显示字符")
    # 密码 = 获取密码输入()
    # print(f"  密码长度: {len(密码)} 字符")

    print("\n7. 实战应用：简单的命令行界面:")

    def 简单的CLI():
        """简单的命令行界面"""
        数据 = []

        while True:
            print("\n" + "=" * 40)
            print("简单数据管理器")
            print("=" * 40)
            print("1. 添加数据")
            print("2. 查看数据")
            print("3. 搜索数据")
            print("4. 退出")
            print("=" * 40)

            选择 = 获取整数输入("请选择操作(1-4): ", 最小值=1, 最大值=4)

            if 选择 == 1:
                新数据 = input("请输入要添加的数据: ")
                数据.append(新数据)
                print(f"  已添加数据: {新数据}")

            elif 选择 == 2:
                if not 数据:
                    print("  暂无数据")
                else:
                    print("  当前数据:")
                    for i, 项目 in enumerate(数据, 1):
                        print(f"    {i}. {项目}")

            elif 选择 == 3:
                关键词 = input("请输入搜索关键词: ")
                结果 = [项目 for 项目 in 数据 if 关键词 in 项目]

                if 结果:
                    print(f"  找到{len(结果)}个结果:")
                    for i, 项目 in enumerate(结果, 1):
                        print(f"    {i}. {项目}")
                else:
                    print("  未找到匹配项")

            elif 选择 == 4:
                print("  再见！")
                break

    print("  演示了一个简单的命令行界面")
    # 简单的CLI()  # 注释掉，避免阻塞程序

    print("\n" + "=" * 60)
    print("input函数是与用户交互的基础，正确处理输入是创建友好CLI的关键！")

input函数详解()
```

### print函数：输出控制

```python
def print函数详解():
    """详细解释print函数的使用"""

    print("print函数详解:")
    print("=" * 60)

    print("1. 基本print使用:")
    print("  Hello, World!")  # 最简单的打印
    print()  # 打印空行

    print("2. 打印多个值:")
    name = "张三"
    age = 25
    score = 85.5

    print("  姓名:", name, "年龄:", age, "成绩:", score)  # 默认用空格分隔

    print("\n3. sep参数：指定分隔符:")
    print("  姓名:", name, "年龄:", age, "成绩:", score, sep=" | ")
    print("  ", "a", "b", "c", sep="")  # 无分隔符
    print("  ", "2023", "01", "01", sep="-")  # 日期格式

    print("\n4. end参数：指定结束符:")
    print("  第一行", end="")  # 不换行
    print("接着第一行")
    print("  加载中", end="")
    for i in range(3):
        print(".", end="", flush=True)  # flush=True立即输出
        time.sleep(0.5)
    print(" 完成！")

    print("\n5. file参数：输出到文件:")
    with open('print_output.txt', 'w', encoding='utf-8') as f:
        print("  这行将写入文件", file=f)
        print("  另一行也写入文件", file=f)

    with open('print_output.txt', 'r', encoding='utf-8') as f:
        print("  文件内容:", f.read())

    print("\n6. 格式化输出:")

    # 旧式格式化
    print("  旧式格式化:")
    print("    %s今年%d岁，成绩%.1f分" % (name, age, score))
    print("    十六进制: 0x%X, 八进制: 0o%o" % (255, 255))

    # str.format方法
    print("\n  str.format方法:")
    print("    {}今年{}岁，成绩{}分".format(name, age, score))
    print("    {0}今年{1}岁，{0}的成绩是{2}分".format(name, age, score))
    print("    {姓名}今年{年龄}岁，成绩{成绩}分".format(姓名=name, 年龄=age, 成绩=score))
    print("    成绩: {:.2f}, 科学计数法: {:.2e}".format(123.4567, 123.4567))

    # f-string (Python 3.6+ 推荐)
    print("\n  f-string (推荐):")
    print(f"    {name}今年{age}岁，成绩{score}分")
    print(f"    明年{name}将{age + 1}岁")
    print(f"    成绩: {score:.1f}, 姓名长度: {len(name)}")

    print("\n7. 对齐和填充:")
    print("  左对齐:")
    print(f"    |{name:<10}|{age:<5}|{score:<8}|")
    print("  右对齐:")
    print(f"    |{name:>10}|{age:>5}|{score:>8.1f}|")
    print("  居中对齐:")
    print(f"    |{name:^10}|{age:^5}|{score:^8}|")
    print("  填充其他字符:")
    print(f"    |{name:*<10}|{age:0>5}|{score:#^8}|")

    print("\n8. 复杂格式化:")
    产品列表 = [
        {"名称": "笔记本电脑", "价格": 5999.99, "库存": 50},
        {"名称": "鼠标", "价格": 129.50, "库存": 200},
        {"名称": "键盘", "价格": 399.00, "库存": 150},
        {"名称": "显示器", "价格": 1999.00, "库存": 30}
    ]

    print("  产品列表:")
    print("  " + "=" * 45)
    print(f"    {'名称':<12} {'价格':>10} {'库存':>8} {'小计':>12}")
    print("  " + "-" * 45)

    for 产品 in 产品列表:
        小计 = 产品["价格"] * 产品["库存"]
        print(f"    {产品['名称']:<12} ¥{产品['价格']:>9.2f} "
              f"{产品['库存']:>8}  ¥{小计:>11.2f}")

    print("  " + "=" * 45)
    总库存 = sum(p["库存"] for p in 产品列表)
    总价值 = sum(p["价格"] * p["库存"] for p in 产品列表)
    print(f"    总计: {'':<12} {'':>10} {总库存:>8}  ¥{总价值:>11.2f}")

    print("\n9. 彩色输出:")

    # ANSI转义序列
    class 颜色:
        重置 = '\033[0m'
        加粗 = '\033[1m'
        下划线 = '\033[4m'

        # 前景色
        黑色 = '\033[30m'
        红色 = '\033[31m'
        绿色 = '\033[32m'
        黄色 = '\033[33m'
        蓝色 = '\033[34m'
        品红 = '\033[35m'
        青色 = '\033[36m'
        白色 = '\033[37m'

        # 背景色
        黑背景 = '\033[40m'
        红背景 = '\033[41m'
        绿背景 = '\033[42m'
        黄背景 = '\033[43m'
        蓝背景 = '\033[44m'
        品红背景 = '\033[45m'
        青背景 = '\033[46m'
        白背景 = '\033[47m'

    print("  ANSI颜色示例:")
    print(f"    {颜色.红色}红色文本{颜色.重置}")
    print(f"    {颜色.绿色}{颜色.加粗}粗体绿色文本{颜色.重置}")
    print(f"    {颜色.蓝色}{颜色.下划线}下划线蓝色文本{颜色.重置}")
    print(f"    {颜色.黄背景}{颜色.黑色}黑色文本黄色背景{颜色.重置}")
    print(f"    {颜色.红背景}{颜色.白色}{颜色.加粗}粗体白字红底{颜色.重置}")

    # 进度条示例
    print("\n10. 进度条示例:")

    def 显示进度条(当前, 总计, 长度=30, 前缀="进度"):
        """显示进度条"""
        百分比 = 当前 / 总计
        已完成 = int(长度 * 百分比)
        未完成 = 长度 - 已完成

        进度条 = f"{颜色.绿色}{'█' * 已完成}{颜色.重置}{'░' * 未完成}"
        print(f"\r  {前缀}: {进度条} {百分比:.1%} ({当前}/{总计})", end="", flush=True)

    print("  下载进度:")
    总计 = 100
    for i in range(总计 + 1):
        显示进度条(i, 总计, 前缀="下载")
        time.sleep(0.02)  # 模拟耗时
    print()  # 换行

    print("\n11. 重定向标准输出:")

    import sys

    class 输出捕获器:
        """捕获print输出"""

        def __enter__(self):
            self.原标准输出 = sys.stdout
            self.捕获的文本 = []
            sys.stdout = self  # 重定向到自身
            return self

        def write(self, 文本):
            self.捕获的文本.append(文本)
            self.原标准输出.write(f"[捕获] {文本}")  # 同时输出到控制台

        def flush(self):
            self.原标准输出.flush()

        def __exit__(self, 异常类型, 异常值, 异常追踪):
            sys.stdout = self.原标准输出

        def 获取文本(self):
            return "".join(self.捕获的文本)

    print("  开始捕获输出:")
    with 输出捕获器() as 捕获器:
        print("  这行被捕获了")
        print("  另一行也被捕获")

    print("  捕获结束")
    print(f"  捕获的内容:\n{捕获器.获取文本()}")

    # 清理文件
    if os.path.exists('print_output.txt'):
        os.path.remove('print_output.txt')

    print("\n" + "=" * 60)
    print("print函数是调试和用户交互的重要工具，掌握其高级用法让输出更专业！")

print函数详解()
```

## 6.7 文件与目录操作：os模块

### os模块：操作系统接口

```python
def os模块详解():
    """详细解释os模块的使用"""

    print("os模块详解:")
    print("=" * 60)

    # 获取当前工作目录
    print("1. 目录操作:")
    当前目录 = os.getcwd()
    print(f"  当前工作目录: {当前目录}")

    # 列出目录内容
    print("\n  当前目录内容:")
    for 项目 in os.listdir('.'):
        项目路径 = os.path.join('.', 项目)
        if os.path.isdir(项目路径):
            print(f"    [目录] {项目}")
        elif os.path.isfile(项目路径):
            大小 = os.path.getsize(项目路径)
            print(f"    [文件] {项目} ({大小}字节)")
        else:
            print(f"    [其他] {项目}")

    # 创建和删除目录
    print("\n2. 创建和删除目录:")

    # 创建单个目录
    测试目录 = "test_dir"
    if not os.path.exists(测试目录):
        os.mkdir(测试目录)
        print(f"  创建目录: {测试目录}")

    # 创建多级目录
    多级目录 = "a/b/c/d"
    os.makedirs(多级目录, exist_ok=True)
    print(f"  创建多级目录: {多级目录}")

    # 删除目录
    if os.path.exists(测试目录):
        os.rmdir(测试目录)
        print(f"  删除目录: {测试目录}")

    # 删除多级目录
    os.removedirs(多级目录)
    print(f"  删除多级目录: {多级目录}")

    print("\n3. 文件操作:")

    # 创建测试文件
    测试文件 = "test_file.txt"
    with open(测试文件, 'w', encoding='utf-8') as f:
        f.write("测试内容\n")

    print(f"  创建文件: {测试文件}")

    # 检查文件属性
    print(f"  文件存在: {os.path.exists(测试文件)}")
    print(f"  是文件: {os.path.isfile(测试文件)}")
    print(f"  是目录: {os.path.isdir(测试文件)}")
    print(f"  文件大小: {os.path.getsize(测试文件)}字节")

    # 获取文件状态信息
    状态信息 = os.stat(测试文件)
    print(f"  文件状态:")
    print(f"    大小: {状态信息.st_size}字节")
    print(f"    最后访问时间: {time.ctime(状态信息.st_atime)}")
    print(f"    最后修改时间: {time.ctime(状态信息.st_mtime)}")
    print(f"    创建时间: {time.ctime(状态信息.st_ctime)}")

    # 重命名文件
    os.rename(测试文件, "renamed_file.txt")
    print(f"  重命名文件: {测试文件} -> renamed_file.txt")

    # 删除文件
    os.remove("renamed_file.txt")
    print(f"  删除文件: renamed_file.txt")

    print("\n4. 路径操作:")

    # 路径拼接
    路径 = os.path.join("目录", "子目录", "文件.txt")
    print(f"  路径拼接: {路径}")

    # 路径拆分
    目录部分, 文件名部分 = os.path.split(路径)
    print(f"  路径拆分: 目录='{目录部分}', 文件='{文件名部分}'")

    # 扩展名拆分
    文件名, 扩展名 = os.path.splitext("document.pdf")
    print(f"  扩展名拆分: 文件名='{文件名}', 扩展名='{扩展名}'")

    # 获取绝对路径
    相对路径 = "../example.txt"
    绝对路径 = os.path.abspath(相对路径)
    print(f"  绝对路径: '{相对路径}' -> '{绝对路径}'")

    # 路径标准化
    不规范路径 = "/home/user//documents/../files/./test.txt"
    规范路径 = os.path.normpath(不规范路径)
    print(f"  路径标准化: '{不规范路径}' -> '{规范路径}'")

    print("\n5. 环境变量:")

    # 获取环境变量
    路径变量 = os.environ.get('PATH', '未设置')
    print(f"  PATH环境变量: {'...' + 路径变量[-100:] if len(路径变量) > 100 else 路径变量}")

    # 设置环境变量（仅当前进程）
    os.environ['MY_VAR'] = 'my_value'
    print(f"  设置环境变量: MY_VAR={os.environ.get('MY_VAR')}")

    # 获取当前用户
    当前用户 = os.environ.get('USERNAME') or os.environ.get('USER')
    print(f"  当前用户: {当前用户}")

    print("\n6. 系统信息:")

    print(f"  操作系统: {os.name}")
    print(f"  行分隔符: {repr(os.linesep)}")
    print(f"  路径分隔符: {repr(os.sep)}")

    # 获取CPU核心数
    try:
        import multiprocessing
        cpu核心数 = multiprocessing.cpu_count()
        print(f"  CPU核心数: {cpu核心数}")
    except ImportError:
        print("  无法获取CPU核心数")

    print("\n7. 递归遍历目录:")

    def 遍历目录(根目录, 缩进=0):
        """递归遍历目录结构"""
        缩进符 = "  " * 缩进

        try:
            for 项目 in sorted(os.listdir(根目录)):
                项目路径 = os.path.join(根目录, 项目)

                if os.path.isdir(项目路径):
                    print(f"{缩进符}[目录] {项目}")
                    遍历目录(项目路径, 缩进 + 1)
                else:
                    大小 = os.path.getsize(项目路径)
                    print(f"{缩进符}[文件] {项目} ({大小}字节)")
        except PermissionError:
            print(f"{缩进符}[错误] 权限不足")

    # 创建测试目录结构
    测试根目录 = "test_structure"
    os.makedirs(os.path.join(测试根目录, "dir1", "subdir1"), exist_ok=True)
    os.makedirs(os.path.join(测试根目录, "dir2"), exist_ok=True)

    with open(os.path.join(测试根目录, "file1.txt"), 'w') as f:
        f.write("文件1")
    with open(os.path.join(测试根目录, "dir1", "file2.txt"), 'w') as f:
        f.write("文件2")
    with open(os.path.join(测试根目录, "dir1", "subdir1", "file3.txt"), 'w') as f:
        f.write("文件3")

    print(f"  目录结构 {测试根目录}:")
    遍历目录(测试根目录)

    print("\n8. 查找文件:")

    def 查找文件(根目录, 文件名):
        """在目录树中查找文件"""
        结果 = []

        for 当前目录, 子目录列表, 文件列表 in os.walk(根目录):
            if 文件名 in 文件列表:
                结果.append(os.path.join(当前目录, 文件名))

        return 结果

    print(f"  查找 'file2.txt': {查找文件(测试根目录, 'file2.txt')}")

    print("\n9. 高级文件操作:")

    # 创建符号链接（需要管理员权限或合适的环境）
    try:
        os.symlink(os.path.join(测试根目录, "file1.txt"),
                   os.path.join(测试根目录, "file1_link.txt"))
        print("  创建符号链接: file1.txt -> file1_link.txt")
    except (OSError, AttributeError):
        print("  无法创建符号链接（可能不支持或权限不足）")

    # 复制文件
    import shutil

    源文件 = os.path.join(测试根目录, "file1.txt")
    目标文件 = os.path.join(测试根目录, "file1_copy.txt")
    shutil.copy2(源文件, 目标文件)
    print(f"  复制文件: {源文件} -> {目标文件}")

    # 移动文件
    新位置 = os.path.join(测试根目录, "dir2", "file1_copy.txt")
    shutil.move(目标文件, 新位置)
    print(f"  移动文件到: {新位置}")

    # 计算目录大小
    def 计算目录大小(目录路径):
        """计算目录及其所有内容的总大小"""
        总大小 = 0

        for 当前目录, 子目录列表, 文件列表 in os.walk(目录路径):
            for 文件 in 文件列表:
                文件路径 = os.path.join(当前目录, 文件)
                if os.path.exists(文件路径):  # 确保文件存在
                    总大小 += os.path.getsize(文件路径)

        return 总大小

    目录大小 = 计算目录大小(测试根目录)
    print(f"  目录 '{测试根目录}' 大小: {目录大小}字节 ({目录大小/1024:.2f}KB)")

    # 清理测试目录
    shutil.rmtree(测试根目录)
    print(f"  删除测试目录: {测试根目录}")

    print("\n10. 临时文件和目录:")

    import tempfile

    # 创建临时文件
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as 临时文件:
        临时文件.write("临时文件内容\n")
        临时文件路径 = 临时文件.name
        print(f"  创建临时文件: {临时文件路径}")

    # 创建临时目录
    临时目录 = tempfile.mkdtemp(prefix='mytemp_')
    print(f"  创建临时目录: {临时目录}")

    # 使用后清理
    os.remove(临时文件路径)
    print(f"  删除临时文件: {临时文件_path}")

    os.rmdir(临时目录)
    print(f"  删除临时目录: {临时目录}")

    print("\n" + "=" * 60)
    print("os模块提供了丰富的文件和目录操作功能，是系统编程的基础！")

os模块详解()
```

## 6.8 序列化：pickle与json

### pickle模块：Python对象序列化

```python
def pickle模块详解():
    """详细解释pickle模块的使用"""

    print("pickle模块详解:")
    print("=" * 60)

    import pickle

    print("1. 基本pickle操作:")

    # 创建要序列化的数据
    复杂数据 = {
        "name": "张三",
        "age": 25,
        "scores": [85, 92, 78],
        "courses": {"数学": 90, "英语": 85, "编程": 95},
        "metadata": {
            "created_at": "2023-01-01",
            "updated_at": "2023-06-15",
            "version": 1.0
        }
    }

    # 添加一个自定义对象
    class 学生:
        def __init__(self, 姓名, 学号):
            self.姓名 = 姓名
            self.学号 = 学号

        def __repr__(self):
            return f"学生(姓名={self.姓名}, 学号={self.学号})"

    自定义对象 = 学生("李四", "2023001")
    复杂数据["student_obj"] = 自定义对象

    print(f"  原始数据: {复杂数据}")

    # 序列化到文件
    with open('data.pickle', 'wb') as f:
        pickle.dump(复杂数据, f)
        print("  数据已序列化到 data.pickle")

    # 从文件反序列化
    with open('data.pickle', 'rb') as f:
        加载的数据 = pickle.load(f)
        print("  从文件加载数据:")
        print(f"    类型: {type(加载的数据)}")
        print(f"    学生对象: {加载的数据['student_obj']}")

    # 序列化到字节串
    字节数据 = pickle.dumps(复杂数据)
    print(f"\n  序列化为字节串:")
    print(f"    字节数: {len(字节数据)}")
    print(f"    前50字节: {字节_data[:50]}")

    # 从字节串反序列化
    反序列化数据 = pickle.loads(字节数据)
    print(f"  从字节串反序列化:")
    print(f"    姓名: {反序列化数据['name']}")
    print(f"    年龄: {反序列化_data['age']}")

    print("\n2. pickle协议版本:")

    print("  支持的协议版本:")
    for 协议 in range(pickle.HIGHEST_PROTOCOL + 1):
        示例数据 = {"test": "协议" + str(协议)}
        字节串 = pickle.dumps(示例数据, protocol=协议)
        print(f"    协议{协议}: {len(字节串)}字节")

    # 使用最高协议
    最高协议数据 = pickle.dumps(复杂数据, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"\n  最高协议({pickle.HIGHEST_PROTOCOL})序列化大小: {len(最高协议数据)}字节")

    print("\n3. 自定义对象的pickle:")

    class 复杂对象:
        def __init__(self, 值):
            self.值 = 值
            self.计算值 = self.值 ** 2
            self.时间戳 = time.time()

        def __getstate__(self):
            """控制pickle时保存哪些状态"""
            状态 = self.__dict__.copy()
            # 不保存时间戳，每次重新生成
            del 状态['时间戳']
            return 状态

        def __setstate__(self, 状态):
            """控制unpickle时如何恢复状态"""
            self.__dict__.update(状态)
            # 恢复时间戳
            self.时间戳 = time.time()

        def __repr__(self):
            return f"复杂对象(值={self.值}, 计算值={self.计算值}, 时间戳={self.时间戳})"

    自定义实例 = 复杂对象(5)
    print(f"  原始对象: {自定义实例}")

    # 序列化
    序列化字节 = pickle.dumps(自定义实例)

    # 反序列化
    反序列化实例 = pickle.loads(序列化字节)
    print(f"  反序列化对象: {反序列化实例}")

    print("\n4. pickle安全性警告:")
    print("  警告: pickle可以执行任意代码，不要反序列化不受信任的数据！")

    # 危险示例（仅演示，不要在实际中使用）
    危险代码 = """
class EvilClass:
    def __reduce__(self):
        import os
        return (os.system, ('echo "危险代码被执行"',))
"""

    print("  恶意pickle数据示例（不要执行）:")
    print(f"    {危险代码}")

    print("\n5. 实际应用：对象缓存系统:")

    class 对象缓存:
        """使用pickle实现简单的对象缓存"""

        def __init__(self, 缓存目录="cache"):
            self.缓存目录 = 缓存目录
            if not os.path.exists(缓存目录):
                os.makedirs(缓存目录)

        def _获取缓存路径(self, 键):
            """根据键生成缓存文件路径"""
            import hashlib
            哈希 = hashlib.md5(str(键).encode()).hexdigest()
            return os.path.join(self.缓存目录, f"{哈希}.pickle")

        def 设置(self, 键, 值, 过期时间=None):
            """设置缓存值"""
            缓存路径 = self._获取缓存路径(键)

            缓存数据 = {
                "值": 值,
                "创建时间": time.time(),
                "过期时间": 过期时间
            }

            with open(缓存路径, 'wb') as f:
                pickle.dump(缓存数据, f)

            return True

        def 获取(self, 键, 默认值=None):
            """获取缓存值"""
            缓存路径 = self._获取缓存路径(键)

            if not os.path.exists(缓存路径):
                return 默认值

            try:
                with open(缓存路径, 'rb') as f:
                    缓存数据 = pickle.load(f)

                # 检查是否过期
                if 缓存数据["过期时间"] is not None:
                    if time.time() - 缓存数据["创建时间"] > 缓存数据["过期时间"]:
                        os.remove(缓存路径)
                        return 默认值

                return 缓存数据["值"]
            except (pickle.PickleError, EOFError, KeyError):
                # 缓存文件损坏
                if os.path.exists(缓存路径):
                    os.remove(缓存_path)
                return 默认值

        def 清理过期缓存(self):
            """清理过期的缓存文件"""
            if not os.path.exists(self.缓存目录):
                return

            清理数量 = 0
            for 文件名 in os.listdir(self.缓存目录):
                if 文件名.endswith('.pickle'):
                    文件路径 = os.path.join(self.缓存目录, 文件名)

                    try:
                        with open(文件路径, 'rb') as f:
                            缓存数据 = pickle.load(f)

                        if 缓存数据["过期时间"] is not None:
                            if time.time() - 缓存数据["创建时间"] > 缓存数据["过期时间"]:
                                os.remove(文件路径)
                                清理数量 += 1
                    except:
                        # 文件损坏，删除
                        os.remove(文件路径)
                        清理数量 += 1

            return 清理数量

    print("  创建对象缓存系统...")
    缓存 = 对象缓存("my_cache")

    # 缓存一些数据
    缓存.设置("用户数据", {"name": "张三", "age": 25}, 过期时间=10)  # 10秒后过期
    缓存.设置("计算结果", 42, 过期时间=30)  # 30秒后过期
    缓存.设置("永久数据", "不过期", 过期时间=None)

    print("  从缓存获取数据:")
    print(f"    用户数据: {缓存.获取('用户数据')}")
    print(f"    计算结果: {缓存.获取('计算结果')}")
    print(f"    不存在的键: {缓存.获取('不存在')}")
    print(f"    不存在的键（有默认值）: {缓存.获取('不存在', '默认值')}")

    print(f"\n  清理过期缓存: {缓存.清理过期缓存()}个文件被清理")

    # 清理缓存目录
    if os.path.exists("my_cache"):
        import shutil
        shutil.rmtree("my_cache")
        print("  清理缓存目录")

    # 清理pickle文件
    if os.path.exists("data.pickle"):
        os.remove("data.pickle")

    print("\n" + "=" * 60)
    print("pickle是Python专用的序列化工具，适合保存Python对象，但不适合跨语言使用！")

pickle模块详解()
```

### json模块：跨语言数据交换

```python
def json模块详解():
    """详细解释json模块的使用"""

    print("json模块详解:")
    print("=" * 60)

    import json

    print("1. 基本JSON操作:")

    # Python数据结构
    python数据 = {
        "name": "张三",
        "age": 25,
        "is_student": True,
        "courses": ["数学", "英语", "编程"],
        "scores": {"数学": 90, "英语": 85, "编程": 95},
        "metadata": None
    }

    print(f"  Python数据: {python数据}")

    # 序列化为JSON字符串
    json字符串 = json.dumps(python数据, ensure_ascii=False, indent=2)
    print(f"\n  JSON字符串:\n{json字符串}")

    # 反序列化
    解析后的数据 = json.loads(json字符串)
    print(f"\n  解析回Python数据:")
    for 键, 值 in 解析后的数据.items():
        print(f"    {键}: {值} (类型: {type(值).__name__})")

    print("\n2. JSON文件操作:")

    # 写入JSON文件
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(python数据, f, ensure_ascii=False, indent=2)
        print("  数据已写入 data.json")

    # 读取JSON文件
    with open('data.json', 'r', encoding='utf-8') as f:
        文件数据 = json.load(f)
        print("  从文件读取数据:")
        print(f"    姓名: {文件数据['name']}")
        print(f"    年龄: {文件数据['age']}")

    print("\n3. JSON编码选项:")

    # 紧凑格式
    紧凑json = json.dumps(python数据, separators=(',', ':'), ensure_ascii=False)
    print(f"  紧凑格式 ({len(紧凑json)}字符):")
    print(f"    {紧凑json[:80]}...")

    # 排序键
    排序json = json.dumps(python数据, sort_keys=True, indent=2, ensure_ascii=False)
    print(f"\n  按键排序:")
    print(f"    {排序json[:100]}...")

    print("\n4. 自定义JSON编码:")

    # 自定义编码器
    class 自定义编码器(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, complex):
                return {"__complex__": True, "real": obj.real, "imag": obj.imag}
            elif hasattr(obj, '__dict__'):
                # 将对象转换为字典
                return obj.__dict__
            return super().default(obj)

    # 自定义解码器
    def 自定义解码器(dct):
        if "__complex__" in dct:
            return complex(dct["real"], dct["imag"])
        return dct

    # 测试自定义编码
    复杂数据 = {
        "number": 42,
        "complex": 3 + 4j,
        "custom_obj": type('临时对象', (), {"x": 1, "y": 2})()
    }

    print("  自定义编码测试:")
    编码结果 = json.dumps(复杂数据, cls=自定义编码器, indent=2)
    print(f"    编码结果:\n{编码结果}")

    # 解码
    解码结果 = json.loads(编码结果, object_hook=自定义解码器)
    print(f"    解码结果: {解码结果}")
    print(f"    复数类型: {type(解码结果['complex'])}")

    print("\n5. JSON Schema验证:")

    # 简单的JSON Schema验证
    def 验证json数据(数据, schema):
        """简单的JSON数据验证"""
        错误 = []

        def 验证字段(值, 规则, 路径=""):
            if 规则.get("type") == "string":
                if not isinstance(值, str):
                    错误.append(f"{路径}: 应为字符串，实际为{type(值).__name__}")

            elif 规则.get("type") == "number":
                if not isinstance(值, (int, float)):
                    错误.append(f"{路径}: 应为数字，实际为{type(值).__name__}")

                if "minimum" in 规则 and 值 < 规则["minimum"]:
                    错误.append(f"{路径}: 值{值}小于最小值{规则['minimum']}")

                if "maximum" in 规则 and 值 > 规则["maximum"]:
                    错误.append(f"{路径}: 值{值}大于最大值{规则['maximum']}")

            elif 规则.get("type") == "array":
                if not isinstance(值, list):
                    错误.append(f"{路径}: 应为数组，实际为{type(值).__name__}")

                # 验证数组元素
                if "items" in 规则:
                    for i, 元素 in enumerate(值):
                        验证字段(元素, 规则["items"], f"{路径}[{i}]")

            elif 规则.get("type") == "object":
                if not isinstance(值, dict):
                    错误.append(f"{路径}: 应为对象，实际为{type(值).__name__}")

                # 验证必需字段
                for 必需字段 in 规则.get("required", []):
                    if 必需字段 not in 值:
                        错误.append(f"{路径}: 缺少必需字段 '{必需字段}'")

                # 验证字段
                for 字段名, 字段规则 in 规则.get("properties", {}).items():
                    if 字段名 in 值:
                        验证字段(值[字段名], 字段规则, f"{path}.{字段名}")

        # 开始验证
        验证字段(数据, schema, "")
        return len(错误) == 0, 错误

    # 定义Schema
    user_schema = {
        "type": "object",
        "required": ["name", "age", "email"],
        "properties": {
            "name": {"type": "string", "minLength": 2},
            "age": {"type": "number", "minimum": 0, "maximum": 150},
            "email": {"type": "string"},
            "courses": {"type": "array", "items": {"type": "string"}},
            "metadata": {"type": "object"}
        }
    }

    # 测试数据
    test_data_valid = {
        "name": "张三",
        "age": 25,
        "email": "zhangsan@example.com",
        "courses": ["数学", "英语"],
        "metadata": {"version": 1}
    }

    test_data_invalid = {
        "name": "张",
        "age": -5,
        "email": "invalid",
        "courses": [1, 2, 3]  # 应为字符串数组
    }

    print("  JSON Schema验证:")
    有效, 错误 = 验证json数据(test_data_valid, user_schema)
    print(f"    有效数据验证: {'通过' if 有效 else '失败'}")
    if 错误:
        for err in 错误:
            print(f"      {err}")

    有效, 错误 = 验证json数据(test_data_invalid, user_schema)
    print(f"    无效数据验证: {'通过' if 有效 else '失败'}")
    for err in 错误[:3]:  # 只显示前3个错误
        print(f"      {err}")

    print("\n6. JSON API示例:")

    # 模拟从API获取JSON数据
    def 模拟api请求(api_url):
        """模拟从API获取JSON数据"""
        # 实际应用中会使用requests库
        模拟数据 = {
            "status": "success",
            "data": {
                "users": [
                    {"id": 1, "name": "张三", "email": "zhangsan@example.com"},
                    {"id": 2, "name": "李四", "email": "lisi@example.com"},
                    {"id": 3, "name": "王五", "email": "wangwu@example.com"}
                ],
                "pagination": {
                    "page": 1,
                    "per_page": 10,
                    "total": 3
                }
            },
            "timestamp": "2023-01-01T12:00:00Z"
        }

        return json.dumps(模拟数据)

    # 处理API响应
    def 处理api响应(json响应):
        """处理API返回的JSON响应"""
        try:
            数据 = json.loads(json响应)

            if 数据.get("status") == "success":
                print("  API请求成功")
                print(f"  时间戳: {数据['timestamp']}")

                用户列表 = 数据["data"]["users"]
                print(f"  用户列表 ({len(用户列表)}个):")
                for 用户 in 用户列表:
                    print(f"    ID:{用户['id']} 姓名:{用户['name']} 邮箱:{用户['email']}")

                分页信息 = 数据["data"]["pagination"]
                print(f"  分页: 第{分页信息['page']}页，"
                      f"每页{分页信息['per_page']}条，"
                      f"共{分页信息['total']}条")

                return 用户列表
            else:
                print(f"  API请求失败: {数据.get('message', '未知错误')}")
                return None

        except json.JSONDecodeError as e:
            print(f"  JSON解析错误: {e}")
            return None
        except KeyError as e:
            print(f"  缺少必要字段: {e}")
            return None

    print("  模拟API请求处理:")
    api响应 = 模拟api请求("/api/users")
    用户列表 = 处理api响应(api响应)

    print("\n7. 性能比较: JSON vs Pickle")

    import time

    # 创建测试数据
    测试数据 = {
        f"key_{i}": {
            "id": i,
            "name": f"用户{i}",
            "value": i * 1.5,
            "items": list(range(i % 10)),
            "metadata": {"created": time.time(), "updated": time.time()}
        }
        for i in range(1000)
    }

    # JSON性能测试
    json开始时间 = time.time()
    json字节 = json.dumps(测试数据).encode('utf-8')
    json编码时间 = time.time() - json开始时间

    json解码开始 = time.time()
    json.loads(json字节.decode('utf-8'))
    json解码时间 = time.time() - json解码开始

    # Pickle性能测试
    pickle开始时间 = time.time()
    pickle字节 = pickle.dumps(测试数据)
    pickle编码时间 = time.time() - pickle开始时间

    pickle解码开始 = time.time()
    pickle.loads(pickle字节)
    pickle解码时间 = time.time() - pickle解码开始

    print(f"  数据大小: {len(json字节)} 字节")
    print("\n  编码性能:")
    print(f"    JSON:  {json编码时间:.6f}秒")
    print(f"    Pickle: {pickle编码时间:.6f}秒")
    print(f"    速度比: {json编码时间/pickle编码_time:.2f}x")

    print("\n  解码性能:")
    print(f"    JSON:  {json解码时间:.6f}秒")
    print(f"    Pickle: {pickle解码时间:.6f}秒")
    print(f"    速度比: {json解码时间/pickle解码_time:.2f}x")

    print("\n  结论: Pickle通常更快，但JSON具有跨语言兼容性")

    # 清理文件
    if os.path.exists('data.json'):
        os.remove('data.json')

    print("\n" + "=" * 60)
    print("JSON是跨语言数据交换的标准格式，适合Web API和配置文件！")

json模块详解()
```

## 总结：掌握文件操作，解锁数据持久化

通过本章的学习，你已经掌握了Python文件操作与输入输出的核心技能：

1. **文件读写基础** - 使用open函数和文件对象方法
2. **文本与二进制文件** - 理解不同文件类型的处理方式
3. **文件读写模式** - 掌握各种打开模式的区别
4. **文件指针与随机访问** - 高效处理大文件
5. **上下文管理器** - 使用with语句确保资源正确释放
6. **标准输入输出** - 与用户交互的基本方式
7. **文件与目录操作** - 使用os模块管理文件系统
8. **序列化** - 使用pickle和json保存和加载数据

### 最佳实践总结

1. **总是使用with语句**：确保文件正确关闭，即使发生异常
2. **明确指定编码**：特别是处理文本文件时，避免编码问题
3. **合理选择文件模式**：根据需要选择读取、写入、追加等模式
4. **处理大文件要谨慎**：使用分块读取，避免内存不足
5. **路径操作使用os.path**：确保跨平台兼容性
6. **JSON用于跨语言数据**，pickle用于Python内部数据

### 下一步学习

在下一章中，我们将学习**面向对象编程基础**。你将学习如何：

- 定义类和创建对象
- 使用继承和多态
- 理解封装和抽象
- 设计面向对象的Python程序

**实践项目建议**：

1. 创建一个日志系统，将程序运行信息写入文件
2. 开发一个配置文件管理器，支持多种格式（JSON、INI、YAML）
3. 实现一个简单的文件搜索工具
4. 构建一个数据备份脚本，能够备份指定目录到压缩文件

记住：**文件操作是程序与真实世界连接的桥梁**。掌握这些技能，你的程序将能够读取配置、保存状态、处理用户数据，真正成为有用的工具。

---

_本文是《Python入门与进阶实践》的第六章，详细介绍了Python文件操作与输入输出的各个方面。通过大量的实际示例，你应该已经掌握了如何处理文件和目录，以及如何进行数据序列化。在后续章节中，我们将进入面向对象编程的世界。_

**相关资源**：

- [Python官方文档：文件操作](https://docs.python.org/zh-cn/3/tutorial/inputoutput.html#reading-and-writing-files)
- [Real Python：Python文件操作指南](https://realpython.com/read-write-files-python/)
- [Python官方文档：json模块](https://docs.python.org/zh-cn/3/library/json.html)
- [Python官方文档：pickle模块](https://docs.python.org/zh-cn/3/library/pickle.html)

**代码下载**：[本章完整代码示例](https://github.com/example/python-file-io-examples)
