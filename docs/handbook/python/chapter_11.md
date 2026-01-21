# 正则表达式与字符串处理：从入门到实战的完整指南

> 掌握文本处理的瑞士军刀，让复杂的字符串操作变得简单高效

## 引言：为什么正则表达式如此强大？

在日常编程中，有超过70%的代码涉及字符串处理。无论是数据清洗、日志分析、表单验证还是文本提取，字符串操作无处不在。然而，传统的字符串方法在处理复杂模式时往往力不从心。

想象一下这些场景：

- 从数百个HTML文件中提取所有电子邮件地址
- 验证用户输入的手机号、身份证号等复杂格式
- 批量重命名数千个文件，按照特定规则
- 分析服务器日志，找出特定错误模式

传统方法可能需要几十行甚至上百行代码，而正则表达式只需一行！正则表达式（Regular Expression）是一种描述字符串模式的强大工具，它让复杂的文本匹配、查找、替换变得异常简单。

## 11.1 正则表达式基础

### 什么是正则表达式？

正则表达式是一种用于匹配字符串中字符组合的模式。在Python中，正则表达式通过`re`模块实现。

```python
import re

# 最简单的正则表达式：普通字符
pattern = r"hello"
text = "hello world"

# 使用re.search()查找匹配
match = re.search(pattern, text)
if match:
    print(f"找到匹配: {match.group()}")
else:
    print("未找到匹配")
```

### 基本语法元素

#### 1. 普通字符与特殊字符

```python
import re

# 普通字符：匹配自身
print(re.search(r"python", "I love python programming"))  # 匹配 "python"

# 特殊字符：. ^ $ * + ? { } [ ] \ | ( )
# 这些字符在正则表达式中有特殊含义，如果要匹配它们本身，需要转义
print(re.search(r"\.", "test.com"))  # 匹配点号
print(re.search(r"\$", "price: $100"))  # 匹配美元符号
print(re.search(r"\\", "path\\to\\file"))  # 匹配反斜杠
```

#### 2. 字符类

```python
import re

# 字符类：匹配方括号中的任意一个字符
print(re.search(r"[aeiou]", "hello"))  # 匹配任意元音字母，找到 "e"
print(re.search(r"[0-9]", "Room 101"))  # 匹配任意数字，找到 "1"
print(re.search(r"[a-zA-Z]", "123abc"))  # 匹配任意字母，找到 "a"

# 否定字符类：匹配不在方括号中的任意字符
print(re.search(r"[^0-9]", "123abc"))  # 匹配非数字字符，找到 "a"

# 预定义字符类
print(re.search(r"\d", "Room 101"))  # 匹配数字，等价于 [0-9]
print(re.search(r"\D", "Room 101"))  # 匹配非数字，等价于 [^0-9]
print(re.search(r"\w", "Hello_123"))  # 匹配单词字符（字母、数字、下划线）
print(re.search(r"\W", "Hello World!"))  # 匹配非单词字符，找到空格
print(re.search(r"\s", "Hello World"))  # 匹配空白字符（空格、制表符等）
print(re.search(r"\S", " Hello"))  # 匹配非空白字符，找到 "H"

# 任意字符（除换行符外）
print(re.search(r".", "abc"))  # 匹配任意字符，找到 "a"
print(re.search(r"...", "abcde"))  # 匹配任意三个字符，找到 "abc"
```

#### 3. 定位符

```python
import re

text = "The quick brown fox jumps over the lazy dog"

# ^ 匹配字符串开头
print(re.search(r"^The", text))  # 匹配成功
print(re.search(r"^quick", text))  # 匹配失败

# $ 匹配字符串结尾
print(re.search(r"dog$", text))  # 匹配成功
print(re.search(r"fox$", text))  # 匹配失败

# \b 匹配单词边界
print(re.search(r"\bfox\b", text))  # 匹配独立的 "fox"
print(re.search(r"\bo\b", text))  # 匹配独立的 "o"（失败，因为 "o" 不是单词）

# \B 匹配非单词边界
print(re.search(r"\Bo\B", "Python"))  # 匹配 "o"（它在单词中间）
```

#### 4. 重复匹配

```python
import re

# * 匹配0次或多次
print(re.search(r"ab*c", "ac"))     # 匹配 "ac" (b出现0次)
print(re.search(r"ab*c", "abc"))    # 匹配 "abc" (b出现1次)
print(re.search(r"ab*c", "abbc"))   # 匹配 "abbc" (b出现2次)

# + 匹配1次或多次
print(re.search(r"ab+c", "ac"))     # 匹配失败 (b至少出现1次)
print(re.search(r"ab+c", "abc"))    # 匹配 "abc" (b出现1次)
print(re.search(r"ab+c", "abbc"))   # 匹配 "abbc" (b出现2次)

# ? 匹配0次或1次
print(re.search(r"ab?c", "ac"))     # 匹配 "ac" (b出现0次)
print(re.search(r"ab?c", "abc"))    # 匹配 "abc" (b出现1次)
print(re.search(r"ab?c", "abbc"))   # 匹配失败 (b出现2次)

# {n} 匹配恰好n次
print(re.search(r"ab{2}c", "abbc"))     # 匹配 "abbc" (b出现2次)
print(re.search(r"ab{2}c", "abc"))      # 匹配失败 (b只出现1次)
print(re.search(r"ab{2}c", "abbbc"))    # 匹配失败 (b出现3次)

# {n,} 匹配至少n次
print(re.search(r"ab{2,}c", "abbc"))    # 匹配 "abbc" (b出现2次)
print(re.search(r"ab{2,}c", "abbbc"))   # 匹配 "abbbc" (b出现3次)
print(re.search(r"ab{2,}c", "abc"))     # 匹配失败 (b只出现1次)

# {n,m} 匹配n到m次
print(re.search(r"ab{1,3}c", "abc"))    # 匹配 "abc" (b出现1次)
print(re.search(r"ab{1,3}c", "abbc"))   # 匹配 "abbc" (b出现2次)
print(re.search(r"ab{1,3}c", "abbbc"))  # 匹配 "abbbc" (b出现3次)
print(re.search(r"ab{1,3}c", "abbbbc")) # 匹配失败 (b出现4次)
```

### 正则表达式速查表

| 模式     | 描述                     | 示例                              |
| -------- | ------------------------ | --------------------------------- |
| `.`      | 匹配任意字符（除换行符） | `a.c` 匹配 "abc", "a c"           |
| `\d`     | 匹配数字                 | `\d\d` 匹配 "12"                  |
| `\D`     | 匹配非数字               | `\D\D` 匹配 "ab"                  |
| `\w`     | 匹配单词字符             | `\w+` 匹配 "hello"                |
| `\W`     | 匹配非单词字符           | `\W` 匹配 "@"                     |
| `\s`     | 匹配空白字符             | `\s` 匹配空格、制表符             |
| `\S`     | 匹配非空白字符           | `\S` 匹配 "a"                     |
| `[abc]`  | 匹配a、b或c              | `[aeiou]` 匹配元音字母            |
| `[^abc]` | 匹配除a、b、c外的字符    | `[^0-9]` 匹配非数字               |
| `^`      | 匹配字符串开头           | `^Hello` 匹配开头的"Hello"        |
| `$`      | 匹配字符串结尾           | `world$` 匹配结尾的"world"        |
| `*`      | 匹配0次或多次            | `a*` 匹配 "", "a", "aa"           |
| `+`      | 匹配1次或多次            | `a+` 匹配 "a", "aa"               |
| `?`      | 匹配0次或1次             | `a?` 匹配 "", "a"                 |
| `{n}`    | 匹配恰好n次              | `a{3}` 匹配 "aaa"                 |
| `{n,}`   | 匹配至少n次              | `a{2,}` 匹配 "aa", "aaa"          |
| `{n,m}`  | 匹配n到m次               | `a{2,4}` 匹配 "aa", "aaa", "aaaa" |

## 11.2 re模块常用函数

Python的`re`模块提供了丰富的函数来处理正则表达式。理解每个函数的用途和区别是高效使用正则表达式的关键。

### re.compile()：预编译正则表达式

```python
import re

# 不使用compile
pattern = r"\d{3}-\d{3}-\d{4}"
text = "我的电话是123-456-7890，另一个是987-654-3210"

match1 = re.search(pattern, text)
print(f"第一次匹配: {match1.group() if match1 else '无'}")

# 使用compile提高性能（特别是多次使用同一模式时）
compiled_pattern = re.compile(r"\d{3}-\d{3}-\d{4}")

match2 = compiled_pattern.search(text)
print(f"第二次匹配: {match2.group() if match2 else '无'}")

# 预编译后可以使用多种方法
matches = compiled_pattern.findall(text)
print(f"所有匹配: {matches}")

# 比较性能
import timeit

setup_code = """
import re
text = '我的电话是123-456-7890，另一个是987-654-3210' * 1000
pattern = r'\\d{3}-\\d{3}-\\d{4}'
compiled = re.compile(pattern)
"""

test1 = """
for _ in range(100):
    re.search(pattern, text)
"""

test2 = """
for _ in range(100):
    compiled.search(text)
"""

time1 = timeit.timeit(test1, setup=setup_code, number=10)
time2 = timeit.timeit(test2, setup=setup_code, number=10)

print(f"\n性能比较:")
print(f"未编译: {time1:.4f}秒")
print(f"已编译: {time2:.4f}秒")
print(f"速度提升: {time1/time2:.1f}倍")
```

### re.match() vs re.search()

```python
import re

text = "Python is awesome. Python is powerful."

# re.match() 只从字符串开头匹配
match_result = re.match(r"Python", text)
search_result = re.search(r"Python", text)

print(f"re.match('Python', text): {match_result.group() if match_result else '无匹配'}")
print(f"re.search('Python', text): {search_result.group() if search_result else '无匹配'}")

# 匹配非开头位置
match_result2 = re.match(r"awesome", text)
search_result2 = re.search(r"awesome", text)

print(f"\nre.match('awesome', text): {match_result2.group() if match_result2 else '无匹配'}")
print(f"re.search('awesome', text): {search_result2.group() if search_result2 else '无匹配'}")

# match() 的典型用例：验证字符串格式
def validate_username(username):
    """验证用户名：以字母开头，包含字母、数字、下划线，长度3-15"""
    pattern = r"^[a-zA-Z][a-zA-Z0-9_]{2,14}$"
    return re.match(pattern, username) is not None

usernames = ["alice", "alice123", "123alice", "a", "verylongusername123", "user_name"]
print("\n用户名验证:")
for username in usernames:
    valid = validate_username(username)
    print(f"  {username:20}: {'有效' if valid else '无效'}")
```

### re.findall() 与 re.finditer()

```python
import re

text = """
联系信息：
张三: 电话 138-1234-5678, 邮箱 zhangsan@example.com
李四: 电话 139-8765-4321, 邮箱 lisi@company.org
王五: 电话 137-1111-2222, 邮箱 wangwu@test.net
"""

# re.findall() 返回所有匹配的字符串列表
phone_pattern = r"\d{3}-\d{4}-\d{4}"
phones = re.findall(phone_pattern, text)
print(f"所有电话号码: {phones}")

email_pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
emails = re.findall(email_pattern, text)
print(f"所有邮箱地址: {emails}")

# re.finditer() 返回匹配对象的迭代器
print("\n详细信息:")
for match in re.finditer(r"([\u4e00-\u9fa5]+): 电话 (\d{3}-\d{4}-\d{4}), 邮箱 ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", text):
    name, phone, email = match.groups()
    print(f"  姓名: {name}, 电话: {phone}, 邮箱: {email}")

# 复杂示例：提取HTML中的所有链接
html_content = """
<html>
<body>
<a href="https://www.example.com">Example</a>
<a href="/about">About Us</a>
<a href="http://test.com/page?id=123">Test Page</a>
<img src="image.jpg" alt="图片">
</body>
</html>
"""

link_pattern = r'href=["\'](.*?)["\']'
links = re.findall(link_pattern, html_content)
print(f"\nHTML中的链接: {links}")
```

### re.fullmatch()：完整匹配

```python
import re

# re.fullmatch() 要求整个字符串与模式匹配
def validate_phone(phone):
    """验证电话号码格式：XXX-XXXX-XXXX"""
    pattern = r"\d{3}-\d{4}-\d{4}"
    return re.fullmatch(pattern, phone) is not None

phone_numbers = [
    "138-1234-5678",      # 有效
    "138-1234-5678 ",     # 无效（尾部有空格）
    " 138-1234-5678",     # 无效（开头有空格）
    "138-1234-5678a",     # 无效（尾部有字母）
    "138-123-45678",      # 无效（格式错误）
]

print("电话号码验证:")
for phone in phone_numbers:
    valid = validate_phone(phone)
    print(f"  {phone:20}: {'有效' if valid else '无效'}")

# 与re.match()的区别
text1 = "123-4567-8901"
text2 = "电话: 123-4567-8901"
text3 = "123-4567-8901 备用"

pattern = r"\d{3}-\d{4}-\d{4}"

print("\n比较 fullmatch 和 match:")
print(f"fullmatch('{text1}'): {re.fullmatch(pattern, text1) is not None}")
print(f"match('{text1}'): {re.match(pattern, text1) is not None}")

print(f"\nfullmatch('{text2}'): {re.fullmatch(pattern, text2) is not None}")
print(f"match('{text2}'): {re.match(pattern, text2) is not None}")

print(f"\nfullmatch('{text3}'): {re.fullmatch(pattern, text3) is not None}")
print(f"match('{text3}'): {re.match(pattern, text3) is not None}")
```

### 函数对比总结

| 函数             | 描述                           | 返回值           | 适用场景           |
| ---------------- | ------------------------------ | ---------------- | ------------------ |
| `re.search()`    | 扫描整个字符串，返回第一个匹配 | Match对象或None  | 查找字符串中的模式 |
| `re.match()`     | 从字符串开头匹配               | Match对象或None  | 验证字符串格式     |
| `re.fullmatch()` | 整个字符串必须完全匹配         | Match对象或None  | 严格验证           |
| `re.findall()`   | 查找所有匹配                   | 字符串列表       | 提取所有匹配项     |
| `re.finditer()`  | 查找所有匹配                   | 匹配对象的迭代器 | 需要匹配详细信息时 |
| `re.sub()`       | 替换匹配项                     | 替换后的字符串   | 批量替换           |
| `re.split()`     | 根据模式分割字符串             | 分割后的列表     | 复杂分割           |
| `re.compile()`   | 预编译正则表达式               | Pattern对象      | 提高重复使用性能   |

## 11.3 模式匹配与搜索

### 基本匹配与搜索

```python
import re

# 简单文本搜索
text = "Python is an interpreted, high-level programming language."
pattern = r"Python"

# 使用search查找第一个匹配
match = re.search(pattern, text)
if match:
    print(f"找到匹配: '{match.group()}'")
    print(f"  位置: {match.start()} 到 {match.end()}")
    print(f"  匹配范围: {match.span()}")

# 使用findall查找所有匹配
all_matches = re.findall(r"\b\w{4,}\b", text)  # 查找所有长度>=4的单词
print(f"\n所有长度>=4的单词: {all_matches}")

# 查找编程语言名称
code_text = """
我喜欢使用Python和JavaScript编程。
有时也用Java和C++。
最近在学习Go和Rust。
"""

# 查找所有编程语言名称
language_pattern = r"\b(Python|JavaScript|Java|C\+\+|Go|Rust)\b"
languages = re.findall(language_pattern, code_text)
print(f"提到的编程语言: {languages}")

# 使用finditer获取详细信息
print("\n编程语言出现位置:")
for match in re.finditer(language_pattern, code_text):
    print(f"  '{match.group()}' 出现在位置 {match.start()}-{match.end()}")
```

### 高级模式匹配

```python
import re

# 1. 匹配日期格式
date_text = """
会议时间：2023-12-25
截止日期：2024/01/31
发布日期：2023.06.15
"""

# 匹配多种日期格式
date_pattern = r"\d{4}[-/.]\d{2}[-/.]\d{2}"
dates = re.findall(date_pattern, date_text)
print(f"找到的日期: {dates}")

# 2. 匹配IP地址
ip_text = "服务器IP：192.168.1.1，网关：10.0.0.1，广播：255.255.255.255"
ip_pattern = r"\b(?:\d{1,3}\.){3}\d{1,3}\b"
ips = re.findall(ip_pattern, ip_text)
print(f"找到的IP地址: {ips}")

# 更精确的IP地址匹配
precise_ip_pattern = r"\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b"
precise_ips = re.findall(precise_ip_pattern, ip_text)
print(f"精确匹配的IP地址: {precise_ips}")

# 3. 匹配URL
url_text = """
访问我们的网站：https://www.example.com
或者 http://example.org/path/page.html
也可以发邮件到：admin@example.com
"""

url_pattern = r"https?://[^\s/$.?#].[^\s]*"
urls = re.findall(url_pattern, url_text)
print(f"找到的URL: {urls}")

# 4. 匹配中文字符
chinese_text = "Python是一种编程语言。中文测试。Hello World!"
chinese_pattern = r"[\u4e00-\u9fa5]+"  # Unicode范围匹配中文字符
chinese_chars = re.findall(chinese_pattern, chinese_text)
print(f"中文字符: {chinese_chars}")

# 5. 复杂模式：匹配嵌套结构（简单示例）
html_text = "<div><p>段落1</p><p>段落2</p></div>"
# 注意：正则表达式不适合解析复杂的嵌套结构，这里只是简单示例
simple_tag_pattern = r"<[^>]+>"
tags = re.findall(simple_tag_pattern, html_text)
print(f"HTML标签: {tags}")
```

### 标志参数（Flags）

```python
import re

text = """
Python is great!
PYTHON is powerful.
python is easy to learn.
"""

# 1. re.IGNORECASE (或 re.I) - 忽略大小写
pattern = r"python"
matches_ic = re.findall(pattern, text, re.IGNORECASE)
print(f"忽略大小写匹配: {matches_ic}")

# 2. re.MULTILINE (或 re.M) - 多行模式
multiline_text = """第一行：Python
第二行：Java
第三行：Python"""
# 多行模式下，^和$匹配每行的开头和结尾
pattern = r"^\w+"
matches_ml = re.findall(pattern, multiline_text, re.MULTILINE)
print(f"多行模式匹配行首单词: {matches_ml}")

# 3. re.DOTALL (或 re.S) - 点号匹配所有字符（包括换行符）
html_content = """<div>
<p>段落1</p>
<p>段落2</p>
</div>"""

# 不使用DOTALL
pattern1 = r"<div>.*</div>"
match1 = re.search(pattern1, html_content)
print(f"\n不使用DOTALL匹配div: {match1.group() if match1 else '无匹配'}")

# 使用DOTALL
match2 = re.search(pattern1, html_content, re.DOTALL)
print(f"使用DOTALL匹配div: {match2.group() if match2 else '无匹配'}")

# 4. re.VERBOSE (或 re.X) - 冗长模式，允许添加注释和空白
# 验证电子邮件地址的复杂模式
email_pattern = re.compile(r"""
    ^                           # 字符串开始
    [a-zA-Z0-9._%+-]+          # 用户名部分
    @                          # @符号
    [a-zA-Z0-9.-]+             # 域名部分
    \.                         # 点号
    [a-zA-Z]{2,}               # 顶级域名
    $                          # 字符串结束
""", re.VERBOSE)

emails = ["user@example.com", "invalid-email", "name@domain.co.uk"]
print("\n电子邮件验证:")
for email in emails:
    valid = email_pattern.match(email) is not None
    print(f"  {email:30}: {'有效' if valid else '无效'}")

# 5. 组合使用多个标志
combined_text = """First line: python
SECOND LINE: PYTHON
third line: Python"""

# 同时使用忽略大小写和多行模式
pattern = r"^.*python.*$"
matches = re.findall(pattern, combined_text, re.IGNORECASE | re.MULTILINE)
print(f"\n组合标志匹配: {matches}")
```

## 11.4 分组与捕获

分组是正则表达式中最强大的功能之一，它允许我们提取匹配的子字符串。

### 基本分组

```python
import re

# 1. 简单分组
text = "2023-12-25"
pattern = r"(\d{4})-(\d{2})-(\d{2})"

match = re.search(pattern, text)
if match:
    print(f"完整匹配: {match.group()}")
    print(f"分组1 (年): {match.group(1)}")
    print(f"分组2 (月): {match.group(2)}")
    print(f"分组3 (日): {match.group(3)}")
    print(f"所有分组: {match.groups()}")
    print(f"分组字典: {match.groupdict()}")  # 空，因为没有命名分组

# 2. 嵌套分组
html_text = '<a href="https://example.com">链接</a>'
html_pattern = r'<a href="([^"]+)">([^<]+)</a>'

match = re.search(html_pattern, html_text)
if match:
    print(f"\n链接地址: {match.group(1)}")
    print(f"链接文本: {match.group(2)}")

# 3. 非捕获分组 (?:...)
# 有时我们需要分组但不捕获，可以使用非捕获分组
text = "apple orange apple banana"
# 查找重复的单词
pattern1 = r"\b(\w+)\b.*\b\1\b"  # 使用捕获分组
pattern2 = r"\b(?:\w+)\b.*\b\1\b"  # 错误！\1引用不存在的捕获组
pattern3 = r"\b(\w+)\b.*\b(\1)\b"  # 正确的捕获分组

match1 = re.search(pattern1, text)
match3 = re.search(pattern3, text)

print(f"\n重复单词匹配:")
print(f"  模式1: {match1.group() if match1 else '无匹配'}")
print(f"  模式3: {match3.group() if match3 else '无匹配'}")

# 非捕获分组的实用例子：匹配但不捕获某些部分
text = "颜色: red, blue, green"
pattern = r"颜色:\s*(?:(\w+)(?:,\s*)?)+"
match = re.search(pattern, text)
print(f"\n颜色匹配: {match.group() if match else '无匹配'}")
```

### 命名分组

```python
import re

# 命名分组语法：(?P<name>pattern)
text = "张小明，年龄：25，邮箱：zhang@example.com"

# 使用命名分组提取信息
pattern = r"(?P<name>[\u4e00-\u9fa5]+)，年龄：(?P<age>\d+)，邮箱：(?P<email>[^\s]+)"

match = re.search(pattern, text)
if match:
    print("使用命名分组提取信息:")
    print(f"  姓名: {match.group('name')}")
    print(f"  年龄: {match.group('age')}")
    print(f"  邮箱: {match.group('email')}")

    # 访问分组字典
    print(f"\n  分组字典: {match.groupdict()}")

    # 通过索引访问命名分组
    print(f"  通过索引访问: name={match.group(1)}, age={match.group(2)}, email={match.group(3)}")

# 复杂示例：解析日志文件
log_entries = [
    "2023-12-25 10:30:45 INFO User login: alice",
    "2023-12-25 10:31:15 ERROR Database connection failed",
    "2023-12-25 10:32:00 WARNING Disk space low: 85% used"
]

log_pattern = r"(?P<date>\d{4}-\d{2}-\d{2}) (?P<time>\d{2}:\d{2}:\d{2}) (?P<level>\w+) (?P<message>.*)"

print("\n日志解析:")
for entry in log_entries:
    match = re.match(log_pattern, entry)
    if match:
        groups = match.groupdict()
        print(f"  [{groups['level']}] {groups['date']} {groups['time']}: {groups['message']}")

# 在替换中使用命名分组
text = "姓名：张三，工号：001"
# 交换姓名和工号的位置
result = re.sub(r"姓名：(?P<name>[\u4e00-\u9fa5]+)，工号：(?P<id>\d+)",
                r"工号：\g<id>，姓名：\g<name>", text)
print(f"\n替换结果: {result}")
```

### 分组引用（回溯引用）

```python
import re

# 1. 在模式中引用分组 (\1, \2, ...)
# 查找重复的单词
text = "the the quick brown fox fox jumps over the lazy dog dog"
pattern = r"\b(\w+)\s+\1\b"

duplicates = re.findall(pattern, text)
print(f"重复的单词: {duplicates}")

for match in re.finditer(pattern, text):
    print(f"  找到重复: '{match.group(1)}' 在位置 {match.start()}")

# 2. 查找对称的标签
html_text = """
<b>粗体文本</b>
<i>斜体文本</i>
<strong>强调文本</strong>
"""

# 匹配对称的HTML标签
tag_pattern = r"<(\w+)>(.*?)</\1>"
matches = re.findall(tag_pattern, html_text)
print(f"\n对称标签:")
for tag, content in matches:
    print(f"  标签: <{tag}>, 内容: {content}")

# 3. 在替换中使用分组引用
# 重新格式化日期
date_text = "2023-12-25"
formatted = re.sub(r"(\d{4})-(\d{2})-(\d{2})", r"\2/\3/\1", date_text)
print(f"\n日期重格式化: {date_text} -> {formatted}")

# 4. 处理重复字符
text = "Hellooo!! How are youuuu???"
# 减少重复字符（2次或更多次重复减少为1次）
reduced = re.sub(r"(.)\1+", r"\1", text)
print(f"减少重复字符: {text} -> {reduced}")

# 5. 复杂的分组引用：匹配引号内的内容
text = '他说："你好"，然后她说："再见"'
# 匹配成对的引号内容
quote_pattern = r'(["\'])(.*?)\1'
quotes = re.findall(quote_pattern, text)
print(f"\n引号内的内容:")
for quote_char, content in quotes:
    print(f"  使用引号'{quote_char}': {content}")
```

### 分组的高级应用

```python
import re

# 1. 条件匹配 (?(id/name)yes-pattern|no-pattern)
texts = [
    "<p>段落</p>",
    "<p>段落",
    "段落</p>",
    "<p class='special'>特殊段落</p>"
]

# 匹配完整的标签或没有标签的文本
complex_pattern = r"(<p\s*(?:class='[^']+')?\s*>)?(.*?)(?(1)</p>|)"

print("条件匹配示例:")
for text in texts:
    match = re.match(complex_pattern, text)
    if match:
        print(f"  '{text}' -> 内容: '{match.group(2)}'")

# 2. 前后查找 (lookaround)
# 前向肯定断言 (?=...) - 匹配后面跟着...的位置
text = "apple banana cherry date"
# 匹配后面跟着" banana"的单词
pattern = r"\w+(?=\s+banana)"
match = re.search(pattern, text)
print(f"\n前向肯定断言: '{match.group() if match else '无'}'")

# 前向否定断言 (?!...) - 匹配后面不跟着...的位置
# 匹配后面不跟着" banana"的单词
pattern = r"\w+(?!\s+banana)"
matches = re.findall(pattern, text)
print(f"前向否定断言: {matches}")

# 后向肯定断言 (?<=...) - 匹配前面是...的位置
# 匹配前面是"apple "的单词
pattern = r"(?<=apple\s+)\w+"
match = re.search(pattern, text)
print(f"后向肯定断言: '{match.group() if match else '无'}'")

# 后向否定断言 (?<!...) - 匹配前面不是...的位置
# 匹配前面不是"apple "的单词
pattern = r"(?<!apple\s+)\w+"
matches = re.findall(pattern, text)
print(f"后向否定断言: {matches}")

# 3. 前后查找的实际应用：提取数字
prices = [
    "价格: $100",
    "折扣: -$20",
    "总计: $80",
    "价格: ¥500"
]

# 提取美元金额（包括负号）
dollar_pattern = r"(?<=\$)-?\d+"
print("\n提取美元金额:")
for price in prices:
    amounts = re.findall(dollar_pattern, price)
    if amounts:
        print(f"  {price} -> {amounts[0]}")

# 4. 复杂的文本提取
log_text = """
用户: alice, 操作: login, 时间: 2023-12-25 10:30:45
用户: bob, 操作: logout, 时间: 2023-12-25 10:31:15
用户: alice, 操作: purchase, 商品: book, 价格: $20
"""

# 提取特定用户的操作
user_pattern = r"用户:\s*(?P<user>\w+).*?操作:\s*(?P<action>\w+)(?:,\s*时间:\s*(?P<time>[\d\s:-]+)|,\s*商品:\s*(?P<item>\w+),\s*价格:\s*(?P<price>\$\d+))?"

print("\n用户操作分析:")
for match in re.finditer(user_pattern, log_text, re.DOTALL):
    groups = match.groupdict()
    if groups['time']:
        print(f"  {groups['user']} 在 {groups['time']} {groups['action']}")
    elif groups['item']:
        print(f"  {groups['user']} {groups['action']}了 {groups['item']}，价格 {groups['price']}")
```

## 11.5 替换与分割

### re.sub()：强大的替换功能

```python
import re

# 1. 基本替换
text = "我喜欢苹果，也喜欢香蕉，还喜欢橙子。"
# 将"喜欢"替换为"爱吃"
result = re.sub(r"喜欢", "爱吃", text)
print(f"基本替换: {result}")

# 2. 使用函数进行替换
def replace_func(match):
    word = match.group(0)
    return word.upper()

text = "hello world, python is awesome!"
result = re.sub(r"\b\w{4,}\b", replace_func, text)
print(f"函数替换: {result}")

# 3. 使用分组进行替换
text = "张三，25岁；李四，30岁；王五，28岁"
# 交换姓名和年龄的位置
result = re.sub(r"([\u4e00-\u9fa5]+)，(\d+)岁", r"\2岁的\1", text)
print(f"分组替换: {result}")

# 4. 限制替换次数
text = "aaa bbb aaa ccc aaa ddd"
# 只替换前2次出现的"aaa"
result = re.sub(r"aaa", "XXX", text, count=2)
print(f"限制次数替换: {result}")

# 5. 复杂的替换：格式化电话号码
phone_numbers = [
    "13812345678",
    "13987654321",
    "13711112222"
]

def format_phone(match):
    phone = match.group(0)
    return f"{phone[:3]}-{phone[3:7]}-{phone[7:]}"

print("\n电话号码格式化:")
for phone in phone_numbers:
    formatted = re.sub(r"\d{11}", format_phone, phone)
    print(f"  {phone} -> {formatted}")

# 6. 删除不需要的内容
html_text = """
<div>
    <p>这是一个<strong>重要的</strong>段落。</p>
    <!-- 这是注释 -->
    <script>alert('test');</script>
</div>
"""

# 删除HTML标签
clean_text = re.sub(r"<[^>]+>", "", html_text)
# 删除注释
clean_text = re.sub(r"<!--.*?-->", "", clean_text, flags=re.DOTALL)
# 删除多余的空格和换行
clean_text = re.sub(r"\s+", " ", clean_text).strip()

print(f"\n清理HTML文本: {clean_text}")

# 7. 掩码敏感信息
credit_card = "信用卡号：1234-5678-9012-3456，有效期：12/25"
# 保留前4位和后4位，中间用*代替
masked = re.sub(r"(\d{4}-)\d{4}-\d{4}-(\d{4})", r"\1****-****-\2", credit_card)
print(f"掩码信用卡号: {masked}")

# 8. 多模式替换
text = "Contact: email@example.com or call 123-456-7890"
# 同时替换邮箱和电话
patterns = [
    (r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[EMAIL]"),
    (r"\d{3}-\d{3}-\d{4}", "[PHONE]")
]

for pattern, replacement in patterns:
    text = re.sub(pattern, replacement, text)

print(f"多模式替换: {text}")
```

### re.subn()：替换并返回次数

```python
import re

text = "苹果 苹果 香蕉 苹果 橙子 香蕉"

# re.sub() 只返回替换后的字符串
result1 = re.sub(r"苹果", "梨", text)
print(f"re.sub() 结果: {result1}")

# re.subn() 返回替换后的字符串和替换次数
result2, count = re.subn(r"苹果", "梨", text)
print(f"re.subn() 结果: {result2}")
print(f"替换次数: {count}")

# 实际应用：统计单词出现次数
def analyze_text(text):
    """分析文本，统计并替换高频词"""
    # 统计所有单词
    words = re.findall(r"\b\w+\b", text.lower())
    from collections import Counter
    word_count = Counter(words)

    # 找出出现3次以上的单词
    frequent_words = {word for word, count in word_count.items() if count >= 3}

    # 替换高频词
    def replace_frequent(match):
        word = match.group(0).lower()
        return f"[{word.upper()}]" if word in frequent_words else match.group(0)

    new_text, replacements = re.subn(r"\b\w+\b", replace_frequent, text, flags=re.IGNORECASE)

    return new_text, replacements, word_count

sample_text = """
Python is a powerful programming language.
Python is easy to learn and use.
Many people love Python for its simplicity.
Python has many libraries for different purposes.
"""

processed_text, replacement_count, word_stats = analyze_text(sample_text)
print(f"\n原始文本: {sample_text}")
print(f"处理后文本: {processed_text}")
print(f"替换次数: {replacement_count}")
print(f"单词统计 (前5): {word_stats.most_common(5)}")
```

### re.split()：智能分割字符串

```python
import re

# 1. 基本分割
text = "苹果,香蕉,橙子,葡萄"
# 使用逗号分割
parts = re.split(r",", text)
print(f"逗号分割: {parts}")

# 2. 多分隔符分割
text = "苹果;香蕉,橙子 葡萄|西瓜"
# 使用多个分隔符
parts = re.split(r"[;, \|]", text)
print(f"多分隔符分割: {parts}")

# 3. 保留分隔符
text = "计算: 1+2-3*4/5"
# 分割但保留运算符
parts = re.split(r"([+\-*/])", text)
print(f"保留分隔符分割: {parts}")

# 4. 最大分割次数
text = "a,b,c,d,e,f,g"
# 最多分割3次
parts = re.split(r",", text, maxsplit=3)
print(f"最大分割3次: {parts}")

# 5. 复杂分割：分割但忽略引号内的分隔符
csv_text = '姓名,年龄,描述\n张三,25,"喜欢编程,音乐,运动"\n李四,30,"爱好单一"'

def smart_split(text):
    """智能分割CSV，忽略引号内的逗号"""
    lines = text.strip().split('\n')
    result = []

    for line in lines:
        # 使用正则表达式分割，但忽略引号内的逗号
        fields = re.split(r',(?=(?:[^"]*"[^"]*")*[^"]*$)', line)
        # 移除字段两端的引号
        fields = [field.strip('"') for field in fields]
        result.append(fields)

    return result

print("\n智能CSV分割:")
parsed_csv = smart_split(csv_text)
for row in parsed_csv:
    print(f"  {row}")

# 6. 分割日志文件
log_text = """2023-12-25 10:30:45 INFO User login: alice
2023-12-25 10:31:15 ERROR Database connection failed
2023-12-25 10:32:00 WARNING Disk space low"""

# 按日志级别分割
levels = ["INFO", "ERROR", "WARNING"]
log_by_level = {}

for level in levels:
    # 分割特定级别的日志
    pattern = rf"^.* {level} .*$"
    matches = re.findall(pattern, log_text, re.MULTILINE)
    log_by_level[level] = matches

print("\n按日志级别分割:")
for level, logs in log_by_level.items():
    print(f"  {level}:")
    for log in logs:
        print(f"    {log}")

# 7. 分割但保留连续的分隔符
text = "apple,,banana,,,cherry"
# 普通分割会得到空字符串
parts1 = re.split(r",", text)
print(f"\n普通分割: {parts1}")

# 分割并忽略连续的分隔符
parts2 = re.split(r",+", text)
print(f"忽略连续分隔符: {parts2}")
```

### 实战：文本清洗管道

```python
import re

class TextCleaner:
    """文本清洗工具"""

    def __init__(self):
        self.pipelines = []

    def add_pipeline(self, name, pattern, replacement, flags=0):
        """添加清洗步骤"""
        self.pipelines.append({
            'name': name,
            'pattern': re.compile(pattern, flags),
            'replacement': replacement
        })

    def clean(self, text, verbose=False):
        """执行清洗"""
        result = text
        stats = {}

        for pipeline in self.pipelines:
            name = pipeline['name']
            pattern = pipeline['pattern']
            replacement = pipeline['replacement']

            if callable(replacement):
                result, count = pattern.subn(replacement, result)
            else:
                result, count = pattern.subn(replacement, result)

            stats[name] = count

            if verbose and count > 0:
                print(f"  [{name}] 替换了 {count} 处")

        return result, stats

# 创建文本清洗器
cleaner = TextCleaner()

# 添加清洗规则
cleaner.add_pipeline('remove_extra_spaces', r'\s+', ' ')  # 移除多余空格
cleaner.add_pipeline('remove_html_tags', r'<[^>]+>', '')  # 移除HTML标签
cleaner.add_pipeline('remove_special_chars', r'[^\w\s\u4e00-\u9fa5.,!?;:]', '')  # 移除特殊字符
cleaner.add_pipeline('format_dates', r'(\d{4})[/-](\d{2})[/-](\d{2})', r'\1年\2月\3日')  # 格式化日期
cleaner.add_pipeline('mask_emails', r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL]')  # 掩码邮箱
cleaner.add_pipeline('mask_phones', r'\d{3}-\d{4}-\d{4}', '[PHONE]')  # 掩码电话

# 待清洗的文本
dirty_text = """
用户反馈：
  <p>我在2023-12-25购买了产品。</p>
  联系方式：test@example.com 或 138-1234-5678。
  问题描述：产品!!!质量不错，但送货__太慢！！！
  希望改进！谢谢。
"""

print("原始文本:")
print(dirty_text)

print("\n清洗过程:")
cleaned_text, stats = cleaner.clean(dirty_text, verbose=True)

print(f"\n清洗统计: {stats}")
print("\n清洗后文本:")
print(cleaned_text)

# 批量清洗示例
texts = [
    "联系我：alice@company.com 或 139-8765-4321",
    "日期：2024/01/15，会议时间：14:30",
    "<div>重要通知</div>请查看！！！"
]

print("\n批量清洗:")
for i, text in enumerate(texts, 1):
    cleaned, _ = cleaner.clean(text)
    print(f"文本{i}: {text}")
    print(f"清洗后: {cleaned}\n")
```

## 11.6 贪婪与非贪婪匹配

理解贪婪与非贪婪匹配是掌握正则表达式的关键。这个概念决定了正则表达式匹配尽可能多的文本还是尽可能少的文本。

### 贪婪匹配（默认行为）

```python
import re

# 1. 贪婪匹配示例
text = "<div>内容1</div><div>内容2</div>"

# 贪婪匹配：.* 会匹配尽可能多的字符
greedy_pattern = r"<div>.*</div>"
greedy_match = re.search(greedy_pattern, text)
print(f"贪婪匹配: {greedy_match.group() if greedy_match else '无匹配'}")

# 贪婪匹配的工作原理
html_text = "<b>粗体</b>和<i>斜体</i>"
pattern = r"<.*>"  # 匹配尖括号内的任何内容
match = re.search(pattern, html_text)
print(f"贪婪匹配 '<.*>': {match.group() if match else '无匹配'}")
print(f"  期望: <b> 或 </b>")
print(f"  实际: {match.group() if match else '无匹配'}")

# 2. 贪婪量词
text = "aaaaab"

# 不同的贪婪量词
patterns = [
    (r"a*", "匹配0个或多个a（尽可能多）"),
    (r"a+", "匹配1个或多个a（尽可能多）"),
    (r"a?", "匹配0个或1个a（尽可能多）"),
    (r"a{2,}", "匹配2个或多个a（尽可能多）"),
]

print("\n贪婪量词示例:")
for pattern, description in patterns:
    match = re.search(pattern, text)
    print(f"  {pattern:6} {description:30}: '{match.group() if match else '无匹配'}'")

# 3. 贪婪匹配的问题
html_content = """
<html>
<head><title>页面标题</title></head>
<body>
<h1>标题</h1>
<p>段落1</p>
<p>段落2</p>
</body>
</html>
"""

# 尝试提取第一个<p>标签的内容（错误的方式）
wrong_pattern = r"<p>.*</p>"
wrong_match = re.search(wrong_pattern, html_content, re.DOTALL)
print(f"\n错误提取（贪婪匹配）: {wrong_match.group()[:50] if wrong_match else '无匹配'}...")

# 可以看到，贪婪匹配匹配了从第一个<p>到最后一个</p>的所有内容
```

### 非贪婪匹配（懒惰匹配）

```python
import re

# 1. 非贪婪匹配示例
text = "<div>内容1</div><div>内容2</div>"

# 非贪婪匹配：.*? 会匹配尽可能少的字符
non_greedy_pattern = r"<div>.*?</div>"
non_greedy_match = re.search(non_greedy_pattern, text)
print(f"非贪婪匹配: {non_greedy_match.group() if non_greedy_match else '无匹配'}")

# 2. 非贪婪量词
text = "aaaaab"

# 非贪婪版本：在量词后加 ?
non_greedy_patterns = [
    (r"a*?", "匹配0个或多个a（尽可能少）"),
    (r"a+?", "匹配1个或多个a（尽可能少）"),
    (r"a??", "匹配0个或1个a（尽可能少）"),
    (r"a{2,}?", "匹配2个或多个a（尽可能少）"),
]

print("\n非贪婪量词示例:")
for pattern, description in non_greedy_patterns:
    match = re.search(pattern, text)
    print(f"  {pattern:7} {description:30}: '{match.group() if match else '无匹配'}'")

# 3. 解决HTML提取问题
html_content = """
<html>
<head><title>页面标题</title></head>
<body>
<h1>标题</h1>
<p>段落1</p>
<p>段落2</p>
</body>
</html>
"""

# 正确的方式：使用非贪婪匹配
correct_pattern = r"<p>.*?</p>"
correct_matches = re.findall(correct_pattern, html_content, re.DOTALL)
print(f"\n正确提取（非贪婪匹配）: {correct_matches}")

# 4. 提取所有标签内容
all_tags_pattern = r"<(\w+)>(.*?)</\1>"
all_tags = re.findall(all_tags_pattern, html_content, re.DOTALL)
print(f"\n所有标签内容:")
for tag, content in all_tags:
    print(f"  <{tag}>: {content.strip()}")
```

### 贪婪 vs 非贪婪的对比

```python
import re

def compare_greedy_vs_lazy(pattern_greedy, pattern_lazy, text, description):
    """比较贪婪和非贪婪匹配"""
    print(f"\n{description}:")
    print(f"  文本: {text}")

    match_greedy = re.search(pattern_greedy, text)
    match_lazy = re.search(pattern_lazy, text)

    print(f"  贪婪模式 '{pattern_greedy}': {match_greedy.group() if match_greedy else '无匹配'}")
    print(f"  非贪婪模式 '{pattern_lazy}': {match_lazy.group() if match_lazy else '无匹配'}")

# 测试用例
test_cases = [
    # (贪婪模式, 非贪婪模式, 文本, 描述)
    (r'"(.+)"', r'"(.+?)"', '名字: "张三", 年龄: "25"', '提取引号内容'),
    (r'<.*>', r'<.*?>', '<b>粗体</b>和<i>斜体</i>', '提取HTML标签'),
    (r'\d{3,5}', r'\d{3,5}?', '数字: 12345', '匹配数字范围'),
    (r'a.*b', r'a.*?b', 'axxxbxxxxb', '匹配a...b模式'),
]

for greedy, lazy, text, desc in test_cases:
    compare_greedy_vs_lazy(greedy, lazy, text, desc)

# 实际应用：提取JSON中的值
json_text = '{"name": "Alice", "age": 25, "city": "New York"}'

# 提取所有值
print("\n提取JSON值:")
# 贪婪匹配（错误）
greedy_values = re.findall(r':\s*"(.+)"', json_text)
print(f"  贪婪匹配提取值: {greedy_values}")

# 非贪婪匹配（正确）
lazy_values = re.findall(r':\s*"(.+?)"', json_text)
print(f"  非贪婪匹配提取值: {lazy_values}")

# 提取键值对
pairs = re.findall(r'"(\w+)"\s*:\s*"(.+?)"', json_text)
print(f"  键值对: {dict(pairs)}")
```

### 贪婪与非贪婪的性能考虑

```python
import re
import time

# 1. 灾难性回溯示例
def test_catastrophic_backtracking():
    """测试灾难性回溯"""
    print("测试灾难性回溯:")

    # 一个容易导致灾难性回溯的模式
    text = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"
    pattern1 = r"^(a+)+b$"  # 容易回溯
    pattern2 = r"^a+b$"     # 优化版本

    start = time.time()
    try:
        match1 = re.match(pattern1, text)
        time1 = time.time() - start
        print(f"  模式1匹配时间: {time1:.6f}秒")
    except Exception as e:
        print(f"  模式1错误: {e}")

    start = time.time()
    match2 = re.match(pattern2, text)
    time2 = time.time() - start
    print(f"  模式2匹配时间: {time2:.6f}秒")

test_catastrophic_backtracking()

# 2. 贪婪与非贪婪的性能对比
def performance_comparison():
    """比较贪婪和非贪婪匹配的性能"""
    print("\n性能对比:")

    # 创建测试数据
    text = "a" * 1000 + "b"

    patterns = [
        ("贪婪", r"^a.*b$"),
        ("非贪婪", r"^a.*?b$"),
        ("确定型", r"^a+b$"),
    ]

    for name, pattern in patterns:
        compiled = re.compile(pattern)

        start = time.time()
        for _ in range(1000):
            compiled.match(text)
        elapsed = time.time() - start

        print(f"  {name:8}: {elapsed:.6f}秒")

performance_comparison()

# 3. 实际建议：何时使用非贪婪匹配
print("\n使用建议:")
print("""
1. 提取HTML/XML标签内容时，总是使用非贪婪匹配
   正确: <div>.*?</div>
   错误: <div>.*</div>

2. 提取引号内内容时，使用非贪婪匹配
   正确: ".*?"
   错误: ".*"

3. 匹配模式有明确边界时，贪婪匹配通常更快
   例: ^\d+$ 比 ^\d+?$ 更快

4. 避免使用容易导致回溯的复杂模式
   避免: (a+)+, (a|aa)+, (a*)*

5. 对于简单匹配，性能差异通常可以忽略
   选择更符合意图的匹配方式更重要
""")

# 4. 实用技巧：避免过度使用非贪婪匹配
text = "产品编号: ABC-123, 价格: $100, 库存: 50"
print("\n实用示例 - 提取产品信息:")

# 过度使用非贪婪（不必要）
overuse = re.findall(r":\s*(.*?),", text)
print(f"  过度非贪婪: {overuse}")

# 更精确的模式
better = re.findall(r":\s*([^,]+)", text)
print(f"  精确模式: {better}")

# 针对性的模式
specific = {
    '编号': re.search(r"产品编号:\s*([\w-]+)", text).group(1),
    '价格': re.search(r"价格:\s*(\$\d+)", text).group(1),
    '库存': re.search(r"库存:\s*(\d+)", text).group(1)
}
print(f"  针对性提取: {specific}")
```

## 11.7 字符串方法回顾

虽然正则表达式功能强大，但Python内置的字符串方法在很多简单场景下更高效、更易读。了解何时使用字符串方法，何时使用正则表达式，是成为Python高手的关键。

### 常用字符串方法

```python
# 1. 查找和替换
text = "Python is great. Python is powerful."

# find() 和 rfind() - 查找子字符串位置
print(f"find('Python'): {text.find('Python')}")      # 从左开始找
print(f"rfind('Python'): {text.rfind('Python')}")    # 从右开始找
print(f"find('Java'): {text.find('Java')}")          # 找不到返回-1

# index() 和 rindex() - 类似find，但找不到时抛出异常
try:
    print(f"index('Python'): {text.index('Python')}")
    print(f"rindex('Python'): {text.rindex('Python')}")
    # print(f"index('Java'): {text.index('Java')}")  # 这会抛出ValueError
except ValueError as e:
    print(f"index('Java') 错误: {e}")

# replace() - 替换子字符串
replaced = text.replace('Python', 'Java')
print(f"replace('Python', 'Java'): {replaced}")

# 2. 大小写转换
text = "Python Programming"
print(f"原始: {text}")
print(f"大写: {text.upper()}")
print(f"小写: {text.lower()}")
print(f"首字母大写: {text.capitalize()}")
print(f"每个单词首字母大写: {text.title()}")
print(f"大小写交换: {text.swapcase()}")

# 3. 字符串检查
texts = [
    "Python123",
    "python",
    "PYTHON",
    "123",
    "   ",
    "",
    "Hello World",
]

print("\n字符串检查:")
for text in texts:
    print(f"  '{text:15}': "
          f"字母: {text.isalpha():5} "
          f"数字: {text.isdigit():5} "
          f"字母数字: {text.isalnum():5} "
          f"全小写: {text.islower():5} "
          f"全大写: {text.isupper():5} "
          f"空白: {text.isspace():5} "
          f"标题: {text.istitle():5}")

# 4. 去除空白
text = "   Python Programming   \n\t"
print(f"\n去除空白:")
print(f"  原始: '{text}'")
print(f"  strip(): '{text.strip()}'")
print(f"  lstrip(): '{text.lstrip()}'")
print(f"  rstrip(): '{text.rstrip()}'")

# 5. 分割和连接
csv_data = "apple,banana,orange,grape"
print(f"\n分割和连接:")
print(f"  原始: {csv_data}")
print(f"  split(','): {csv_data.split(',')}")
print(f"  split(',', 2): {csv_data.split(',', 2)}")

parts = ['apple', 'banana', 'orange']
print(f"  列表: {parts}")
print(f"  join(', '): {', '.join(parts)}")
print(f"  join('-'): {'-'.join(parts)}")

# 多行文本分割
multiline_text = "Line 1\nLine 2\nLine 3"
print(f"\n多行分割:")
print(f"  原始:\n{multiline_text}")
print(f"  splitlines(): {multiline_text.splitlines()}")
print(f"  split('\\n'): {multiline_text.split(chr(10))}")  # chr(10)是换行符

# 6. 对齐和填充
text = "Python"
print(f"\n对齐和填充:")
print(f"  原始: '{text}'")
print(f"  center(10): '{text.center(10)}'")
print(f"  center(10, '*'): '{text.center(10, '*')}'")
print(f"  ljust(10): '{text.ljust(10)}'")
print(f"  ljust(10, '-'): '{text.ljust(10, '-')}'")
print(f"  rjust(10): '{text.rjust(10)}'")
print(f"  rjust(10, '+'): '{text.rjust(10, '+')}'")
print(f"  zfill(10): '{text.zfill(10)}'")  # 用0填充
print(f"  '42'.zfill(5): {'42'.zfill(5)}")
```

### 字符串方法与正则表达式的对比

```python
import re

def compare_methods():
    """比较字符串方法和正则表达式的不同场景"""

    print("字符串方法与正则表达式对比\n")

    # 测试用例
    test_cases = [
        {
            "description": "简单查找",
            "text": "Hello World, welcome to Python programming",
            "task": "检查是否包含'Python'",
            "string_method": lambda t: "Python" in t,
            "regex_method": lambda t: re.search(r"Python", t) is not None
        },
        {
            "description": "检查开头",
            "text": "https://www.example.com",
            "task": "检查是否以'https://'开头",
            "string_method": lambda t: t.startswith("https://"),
            "regex_method": lambda t: re.match(r"^https://", t) is not None
        },
        {
            "description": "检查结尾",
            "text": "document.pdf",
            "task": "检查是否以'.pdf'结尾",
            "string_method": lambda t: t.endswith(".pdf"),
            "regex_method": lambda t: re.search(r"\.pdf$", t) is not None
        },
        {
            "description": "统计出现次数",
            "text": "apple, apple, banana, apple, orange",
            "task": "统计'apple'出现次数",
            "string_method": lambda t: t.count("apple"),
            "regex_method": lambda t: len(re.findall(r"\bapple\b", t))
        },
        {
            "description": "简单分割",
            "text": "apple,banana,orange,grape",
            "task": "用逗号分割",
            "string_method": lambda t: t.split(","),
            "regex_method": lambda t: re.split(r",", t)
        },
        {
            "description": "复杂分割",
            "text": "apple, banana; orange|grape",
            "task": "用多个分隔符分割",
            "string_method": None,  # 字符串方法处理复杂分割很麻烦
            "regex_method": lambda t: re.split(r"[ ,;|]+", t)
        },
        {
            "description": "简单替换",
            "text": "I like cats. Cats are cute.",
            "task": "将'cats'替换为'dogs'（不区分大小写）",
            "string_method": lambda t: t.replace("cats", "dogs").replace("Cats", "Dogs"),
            "regex_method": lambda t: re.sub(r"cats", "dogs", t, flags=re.IGNORECASE)
        },
        {
            "description": "模式替换",
            "text": "2023-12-25",
            "task": "将'YYYY-MM-DD'格式改为'MM/DD/YYYY'",
            "string_method": None,  # 字符串方法需要多步操作
            "regex_method": lambda t: re.sub(r"(\d{4})-(\d{2})-(\d{2})", r"\2/\3/\1", t)
        }
    ]

    for test in test_cases:
        print(f"{test['description']}:")
        print(f"  文本: {test['text']}")
        print(f"  任务: {test['task']}")

        if test['string_method']:
            result = test['string_method'](test['text'])
            print(f"  字符串方法: {result}")

        if test['regex_method']:
            result = test['regex_method'](test['text'])
            print(f"  正则表达式: {result}")

        # 建议
        if test['string_method'] is None:
            print(f"  建议: 使用正则表达式（字符串方法难以处理）")
        elif test['regex_method'] is None:
            print(f"  建议: 使用字符串方法（更简单高效）")
        else:
            print(f"  建议: 两者都可以，根据具体需求选择")

        print()

compare_methods()

# 性能对比
import timeit

print("性能对比（执行10000次）:")

# 简单查找的性能对比
simple_text = "Hello World, welcome to Python programming"
simple_pattern = "Python"

string_time = timeit.timeit(
    lambda: simple_pattern in simple_text,
    number=10000
)

regex_time = timeit.timeit(
    lambda: re.search(simple_pattern, simple_text),
    number=10000
)

print(f"  简单查找 - 字符串方法: {string_time:.6f}秒")
print(f"  简单查找 - 正则表达式: {regex_time:.6f}秒")
print(f"  速度比: {regex_time/string_time:.1f}倍")

# 复杂模式的性能对比
complex_text = "2023-12-25, 2024-01-01, 2024-02-14"
complex_pattern = r"\d{4}-\d{2}-\d{2}"

string_time_complex = timeit.timeit(
    lambda: [date for date in complex_text.split(", ") if len(date) == 10 and date[4] == "-" and date[7] == "-"],
    number=10000
)

regex_time_complex = timeit.timeit(
    lambda: re.findall(complex_pattern, complex_text),
    number=10000
)

print(f"\n  复杂查找 - 字符串方法: {string_time_complex:.6f}秒")
print(f"  复杂查找 - 正则表达式: {regex_time_complex:.6f}秒")
print(f"  速度比: {string_time_complex/regex_time_complex:.1f}倍")
```

### 字符串格式化方法

```python
# 1. 传统的 % 格式化
name = "Alice"
age = 25
print("传统的 % 格式化:")
print("  %s is %d years old." % (name, age))
print("  %10s is %5d years old." % (name, age))  # 指定宽度

# 2. str.format() 方法
print("\nstr.format() 方法:")
print("  {} is {} years old.".format(name, age))
print("  {0} is {1} years old. {0} likes Python.".format(name, age))
print("  {name} is {age} years old.".format(name=name, age=age))
print("  {:<10} is {:>5} years old.".format(name, age))  # 对齐
print("  {:.2f}".format(3.14159))  # 浮点数格式化

# 3. f-string (Python 3.6+)
print("\nf-string (Python 3.6+):")
print(f"  {name} is {age} years old.")
print(f"  {name.upper()} is {age + 5} years old in 5 years.")
print(f"  Pi is approximately {3.14159:.3f}.")
print(f"  {'Python':>10}")  # 右对齐
print(f"  {1000000:,}")  # 千位分隔符

# 4. 模板字符串 (Template)
from string import Template
print("\n模板字符串 (Template):")
template = Template("$name is $age years old.")
print(f"  {template.substitute(name=name, age=age)}")

# 安全替换，不会抛出KeyError
safe_template = Template("$name is $age years old and works as $job.")
print(f"  {safe_template.safe_substitute(name=name, age=age)}")

# 5. 自定义格式化
class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def __str__(self):
        return f"Person({self.name}, {self.age})"

    def __format__(self, format_spec):
        if format_spec == "verbose":
            return f"Person object: name={self.name}, age={self.age}"
        elif format_spec == "short":
            return f"{self.name}({self.age})"
        else:
            return str(self)

person = Person("Bob", 30)
print("\n自定义格式化:")
print(f"  默认: {person}")
print(f"  verbose: {person:verbose}")
print(f"  short: {person:short}")

# 6. 实际应用：生成报告
data = [
    {"name": "Alice", "score": 95, "grade": "A"},
    {"name": "Bob", "score": 87, "grade": "B"},
    {"name": "Charlie", "score": 92, "grade": "A-"},
]

print("\n成绩报告:")
print("  Name      Score  Grade")
print("  --------  -----  -----")
for item in data:
    print(f"  {item['name']:8}  {item['score']:5}  {item['grade']:5}")

# 7. 综合示例：生成SQL查询
table_name = "users"
columns = ["id", "name", "email", "created_at"]
conditions = {"status": "active", "age": (18, 30)}

# 构建SQL查询
sql_parts = []
sql_parts.append(f"SELECT {', '.join(columns)}")
sql_parts.append(f"FROM {table_name}")
sql_parts.append(f"WHERE status = '{conditions['status']}'")
sql_parts.append(f"AND age BETWEEN {conditions['age'][0]} AND {conditions['age'][1]}")

sql_query = "\n".join(sql_parts)
print(f"\n生成的SQL查询:\n{sql_query}")
```

## 11.8 正则表达式实战

现在让我们通过一些实际项目来综合运用所学的正则表达式知识。

### 实战1：电子邮件验证和提取

```python
import re
from typing import List, Tuple, Optional

class EmailProcessor:
    """电子邮件处理器"""

    # 电子邮件验证正则表达式
    EMAIL_PATTERN = re.compile(
        r"""
        ^                           # 字符串开始
        [a-zA-Z0-9._%+-]+          # 本地部分（用户名）
        @                          # @符号
        [a-zA-Z0-9.-]+             # 域名
        \.                         # 点号
        [a-zA-Z]{2,}               # 顶级域名
        $                          # 字符串结束
        """, re.VERBOSE
    )

    # 提取电子邮件正则表达式
    EMAIL_EXTRACT_PATTERN = re.compile(
        r"""
        [a-zA-Z0-9._%+-]+          # 本地部分
        @                          # @符号
        [a-zA-Z0-9.-]+             # 域名
        \.                         # 点号
        [a-zA-Z]{2,}               # 顶级域名
        """, re.VERBOSE
    )

    @classmethod
    def validate_email(cls, email: str) -> bool:
        """验证电子邮件格式"""
        return cls.EMAIL_PATTERN.match(email) is not None

    @classmethod
    def extract_emails(cls, text: str) -> List[str]:
        """从文本中提取所有电子邮件地址"""
        return cls.EMAIL_EXTRACT_PATTERN.findall(text)

    @classmethod
    def analyze_email(cls, email: str) -> Optional[Tuple[str, str, str]]:
        """分析电子邮件，返回(本地部分, 域名, 顶级域名)"""
        match = cls.EMAIL_PATTERN.match(email)
        if not match:
            return None

        # 使用正则表达式分组提取各部分
        pattern = r"^([^@]+)@([^.]+)\.(.+)$"
        match = re.match(pattern, email)
        if match:
            local_part, domain, tld = match.groups()
            return local_part, domain, tld
        return None

    @classmethod
    def mask_email(cls, email: str, visible_chars: int = 3) -> str:
        """掩码电子邮件地址（保护隐私）"""
        if not cls.validate_email(email):
            return email

        local_part, domain, tld = cls.analyze_email(email)

        # 掩码本地部分
        if len(local_part) <= visible_chars:
            masked_local = local_part
        else:
            masked_local = local_part[:visible_chars] + "*" * (len(local_part) - visible_chars)

        # 掩码域名（保留第一个和最后一个字符）
        if len(domain) <= 2:
            masked_domain = domain
        else:
            masked_domain = domain[0] + "*" * (len(domain) - 2) + domain[-1]

        return f"{masked_local}@{masked_domain}.{tld}"

    @classmethod
    def extract_emails_from_file(cls, file_path: str) -> List[str]:
        """从文件中提取电子邮件地址"""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
                return cls.extract_emails(content)
        except Exception as e:
            print(f"读取文件错误: {e}")
            return []

# 测试电子邮件处理器
print("=== 电子邮件验证和提取 ===\n")

# 测试数据
test_emails = [
    "user@example.com",           # 有效
    "first.last@company.co.uk",   # 有效（包含点号和长TLD）
    "user123@sub.domain.com",     # 有效（包含数字和子域名）
    "invalid-email",              # 无效
    "user@.com",                  # 无效（缺少域名）
    "user@com",                   # 无效（缺少点号和TLD）
    "@example.com",               # 无效（缺少本地部分）
    "user@example.c",             # 无效（TLD太短）
    "user@-example.com",          # 无效（域名以连字符开头）
]

print("电子邮件验证:")
for email in test_emails:
    valid = EmailProcessor.validate_email(email)
    print(f"  {email:30} -> {'有效' if valid else '无效'}")

# 提取电子邮件
text_with_emails = """
请联系我们：support@company.com 或 sales@example.org。
个人联系：john.doe@gmail.com, jane.smith@yahoo.com。
无效邮件：test@.com, user@com, @example.com。
"""

print("\n从文本中提取电子邮件:")
emails = EmailProcessor.extract_emails(text_with_emails)
for email in emails:
    print(f"  {email}")

# 分析电子邮件
print("\n电子邮件分析:")
for email in emails[:3]:  # 分析前3个
    parts = EmailProcessor.analyze_email(email)
    if parts:
        local, domain, tld = parts
        print(f"  {email}")
        print(f"    本地部分: {local}")
        print(f"    域名: {domain}")
        print(f"    顶级域名: {tld}")

# 掩码电子邮件
print("\n电子邮件掩码（保护隐私）:")
sensitive_emails = [
    "alice.smith@company.com",
    "bob.johnson@gmail.com",
    "charlie@example.org"
]

for email in sensitive_emails:
    masked = EmailProcessor.mask_email(email, visible_chars=2)
    print(f"  {email:30} -> {masked}")

# 从文件提取（模拟）
print("\n从文件提取（模拟）:")
test_content = """
# 用户列表
1. Alice Brown - alice@example.com
2. Bob Smith - bob.smith@company.org
3. Charlie Davis - charlie.davis@gmail.com
"""

# 创建临时文件
import tempfile
with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
    f.write(test_content)
    temp_file = f.name

emails_from_file = EmailProcessor.extract_emails_from_file(temp_file)
print(f"  从文件提取的电子邮件: {emails_from_file}")

# 清理临时文件
import os
os.unlink(temp_file)
```

### 实战2：日志分析系统

```python
import re
from datetime import datetime
from collections import defaultdict, Counter
from typing import List, Dict, Any

class LogAnalyzer:
    """日志分析系统"""

    # 常见日志格式模式
    LOG_PATTERNS = {
        'apache': r'^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]+) (\S+)" (\d+) (\d+) "([^"]*)" "([^"]*)"$',
        'nginx': r'^(\S+) - \S+ \[([^\]]+)\] "(\S+) ([^"]+) (\S+)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)"$',
        'syslog': r'^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}) (\S+) (\S+)\[(\d+)\]: (.*)$',
        'custom': r'^\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*)$'
    }

    def __init__(self, log_format='custom'):
        self.log_format = log_format
        self.pattern = re.compile(self.LOG_PATTERNS.get(log_format, self.LOG_PATTERNS['custom']))
        self.logs = []

    def parse_log_line(self, line: str) -> Dict[str, Any]:
        """解析单行日志"""
        match = self.pattern.match(line.strip())
        if not match:
            return None

        if self.log_format == 'apache':
            return {
                'ip': match.group(1),
                'timestamp': match.group(2),
                'method': match.group(3),
                'url': match.group(4),
                'protocol': match.group(5),
                'status': int(match.group(6)),
                'size': int(match.group(7)),
                'referer': match.group(8),
                'user_agent': match.group(9)
            }
        elif self.log_format == 'custom':
            return {
                'timestamp': match.group(1),
                'level': match.group(2),
                'module': match.group(3),
                'message': match.group(4)
            }
        return None

    def load_logs(self, log_text: str):
        """加载日志文本"""
        lines = log_text.strip().split('\n')
        for line in lines:
            parsed = self.parse_log_line(line)
            if parsed:
                self.logs.append(parsed)

    def load_log_file(self, file_path: str):
        """从文件加载日志"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                self.load_logs(f.read())
        except Exception as e:
            print(f"加载日志文件错误: {e}")

    def analyze(self) -> Dict[str, Any]:
        """分析日志"""
        if not self.logs:
            return {}

        if self.log_format == 'apache':
            return self._analyze_apache_logs()
        elif self.log_format == 'custom':
            return self._analyze_custom_logs()

        return {}

    def _analyze_apache_logs(self) -> Dict[str, Any]:
        """分析Apache格式日志"""
        analysis = {
            'total_requests': len(self.logs),
            'status_codes': Counter(),
            'methods': Counter(),
            'top_ips': Counter(),
            'top_urls': Counter(),
            'errors': []
        }

        for log in self.logs:
            # 统计状态码
            analysis['status_codes'][log['status']] += 1

            # 统计HTTP方法
            analysis['methods'][log['method']] += 1

            # 统计IP地址
            analysis['top_ips'][log['ip']] += 1

            # 统计URL
            analysis['top_urls'][log['url']] += 1

            # 收集错误请求（4xx和5xx）
            if log['status'] >= 400:
                analysis['errors'].append(log)

        # 只保留前10个
        analysis['top_ips'] = dict(analysis['top_ips'].most_common(10))
        analysis['top_urls'] = dict(analysis['top_urls'].most_common(10))

        return analysis

    def _analyze_custom_logs(self) -> Dict[str, Any]:
        """分析自定义格式日志"""
        analysis = {
            'total_entries': len(self.logs),
            'levels': Counter(),
            'modules': Counter(),
            'errors': [],
            'warnings': []
        }

        for log in self.logs:
            # 统计日志级别
            analysis['levels'][log['level']] += 1

            # 统计模块
            analysis['modules'][log['module']] += 1

            # 收集错误和警告
            if log['level'].upper() == 'ERROR':
                analysis['errors'].append(log)
            elif log['level'].upper() == 'WARNING':
                analysis['warnings'].append(log)

        # 只保留前10个模块
        analysis['modules'] = dict(analysis['modules'].most_common(10))

        return analysis

    def search(self, pattern: str, field: str = 'message') -> List[Dict[str, Any]]:
        """搜索日志"""
        results = []
        regex = re.compile(pattern, re.IGNORECASE)

        for log in self.logs:
            if field in log and regex.search(str(log[field])):
                results.append(log)

        return results

    def extract_pattern(self, pattern: str, field: str = 'message') -> List[str]:
        """从日志中提取特定模式"""
        results = []
        regex = re.compile(pattern)

        for log in self.logs:
            if field in log:
                matches = regex.findall(str(log[field]))
                results.extend(matches)

        return results

# 创建测试日志
def create_test_logs():
    """创建测试日志数据"""

    # Apache格式日志
    apache_logs = """192.168.1.1 - - [25/Dec/2023:10:30:45 +0800] "GET /index.html HTTP/1.1" 200 2326 "http://example.com" "Mozilla/5.0"
192.168.1.2 - - [25/Dec/2023:10:31:15 +0800] "POST /login HTTP/1.1" 302 415 "http://example.com/login" "Mozilla/5.0"
192.168.1.3 - - [25/Dec/2023:10:32:00 +0800] "GET /admin HTTP/1.1" 403 212 "http://example.com" "Mozilla/5.0"
192.168.1.1 - - [25/Dec/2023:10:33:20 +0800] "GET /products/123 HTTP/1.1" 200 5123 "-" "Mozilla/5.0"
192.168.1.4 - - [25/Dec/2023:10:34:45 +0800] "GET /nonexistent HTTP/1.1" 404 218 "http://example.com" "Mozilla/5.0"
192.168.1.2 - - [25/Dec/2023:10:35:30 +0800] "GET /api/data HTTP/1.1" 200 1234 "http://example.com/api" "Mozilla/5.0"
"""

    # 自定义应用日志
    custom_logs = """[2023-12-25 10:30:45] [INFO] [auth] User 'alice' logged in successfully
[2023-12-25 10:31:15] [ERROR] [database] Connection failed: timeout
[2023-12-25 10:32:00] [WARNING] [system] Disk usage above 80%
[2023-12-25 10:33:20] [INFO] [api] GET /api/users completed in 120ms
[2023-12-25 10:34:45] [ERROR] [payment] Transaction failed: insufficient funds
[2023-12-25 10:35:30] [DEBUG] [cache] Cache hit for key 'user:123'
"""

    return apache_logs, custom_logs

# 测试日志分析系统
print("=== 日志分析系统 ===\n")

# 测试Apache日志分析
print("1. Apache日志分析:")
apache_logs, _ = create_test_logs()
apache_analyzer = LogAnalyzer('apache')
apache_analyzer.load_logs(apache_logs)
apache_analysis = apache_analyzer.analyze()

print(f"  总请求数: {apache_analysis.get('total_requests', 0)}")
print(f"  状态码分布: {dict(apache_analysis.get('status_codes', {}))}")
print(f"  HTTP方法: {dict(apache_analysis.get('methods', {}))}")
print(f"  热门IP: {apache_analysis.get('top_ips', {})}")
print(f"  错误请求数: {len(apache_analysis.get('errors', []))}")

# 搜索Apache日志
print(f"\n  搜索包含'admin'的URL:")
admin_logs = apache_analyzer.search(r'admin', 'url')
for log in admin_logs:
    print(f"    {log['ip']} - {log['method']} {log['url']} - {log['status']}")

# 测试自定义日志分析
print("\n2. 自定义日志分析:")
_, custom_logs = create_test_logs()
custom_analyzer = LogAnalyzer('custom')
custom_analyzer.load_logs(custom_logs)
custom_analysis = custom_analyzer.analyze()

print(f"  总日志条目: {custom_analysis.get('total_entries', 0)}")
print(f"  日志级别分布: {dict(custom_analysis.get('levels', {}))}")
print(f"  热门模块: {custom_analysis.get('modules', {})}")
print(f"  错误数: {len(custom_analysis.get('errors', []))}")
print(f"  警告数: {len(custom_analysis.get('warnings', []))}")

# 搜索自定义日志
print(f"\n  搜索错误日志:")
error_logs = custom_analyzer.search(r'ERROR', 'level')
for log in error_logs:
    print(f"    [{log['timestamp']}] {log['module']}: {log['message']}")

# 提取特定信息
print(f"\n  从日志中提取用户名:")
usernames = custom_analyzer.extract_pattern(r"User '([^']+)'", 'message')
print(f"    找到的用户: {usernames}")

print(f"\n  提取API响应时间:")
response_times = custom_analyzer.extract_pattern(r'completed in (\d+)ms', 'message')
print(f"    API响应时间: {response_times}")

# 实时日志监控（模拟）
print("\n3. 实时日志监控（模拟）:")

class RealTimeLogMonitor:
    """实时日志监控器"""

    def __init__(self):
        self.alerts = []
        self.patterns = {
            'error': re.compile(r'ERROR|FAILED|CRITICAL', re.IGNORECASE),
            'security': re.compile(r'LOGIN|AUTH|PASSWORD|SQL', re.IGNORECASE),
            'performance': re.compile(r'TIMEOUT|SLOW|LAG', re.IGNORECASE)
        }

    def monitor_line(self, line: str):
        """监控单行日志"""
        alerts = []

        for category, pattern in self.patterns.items():
            if pattern.search(line):
                alerts.append(category)

        if alerts:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            self.alerts.append({
                'timestamp': timestamp,
                'line': line.strip(),
                'alerts': alerts
            })

            print(f"  [{timestamp}] 警报: {alerts}")
            print(f"    日志: {line.strip()}")

    def get_summary(self):
        """获取监控摘要"""
        summary = Counter()
        for alert in self.alerts:
            for category in alert['alerts']:
                summary[category] += 1

        return dict(summary)

# 模拟实时日志流
monitor = RealTimeLogMonitor()
test_log_stream = [
    "[INFO] User login successful",
    "[ERROR] Database connection failed: timeout",
    "[WARNING] High memory usage detected",
    "[INFO] API request completed in 150ms",
    "[ERROR] Authentication failed for user 'hacker'",
    "[INFO] SQL query executed successfully",
    "[CRITICAL] System shutdown initiated"
]

print("\n  开始监控日志流...")
for log_line in test_log_stream:
    monitor.monitor_line(log_line)

print(f"\n  监控摘要: {monitor.get_summary()}")
```

### 实战3：数据清洗和提取框架

```python
import re
from typing import List, Dict, Any, Callable, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class ExtractionRule:
    """数据提取规则"""
    name: str
    pattern: str
    description: str = ""
    flags: int = 0
    transform: Optional[Callable] = None

class DataExtractor:
    """通用数据提取器"""

    def __init__(self):
        self.rules: Dict[str, ExtractionRule] = {}
        self.compiled_patterns: Dict[str, re.Pattern] = {}

    def add_rule(self, rule: ExtractionRule):
        """添加提取规则"""
        self.rules[rule.name] = rule
        self.compiled_patterns[rule.name] = re.compile(rule.pattern, rule.flags)

    def extract(self, text: str, rule_name: str) -> List[Any]:
        """使用指定规则提取数据"""
        if rule_name not in self.rules:
            raise ValueError(f"规则不存在: {rule_name}")

        rule = self.rules[rule_name]
        pattern = self.compiled_patterns[rule_name]

        matches = pattern.findall(text)

        # 应用转换函数（如果有）
        if rule.transform:
            matches = [rule.transform(match) for match in matches]

        return matches

    def extract_all(self, text: str) -> Dict[str, List[Any]]:
        """使用所有规则提取数据"""
        results = {}

        for rule_name in self.rules:
            results[rule_name] = self.extract(text, rule_name)

        return results

    def validate(self, text: str, rule_name: str) -> bool:
        """验证文本是否符合规则"""
        if rule_name not in self.rules:
            raise ValueError(f"规则不存在: {rule_name}")

        pattern = self.compiled_patterns[rule_name]
        return pattern.fullmatch(text) is not None

class DataCleaner:
    """数据清洗器"""

    def __init__(self):
        self.clean_rules: List[Dict[str, Any]] = []

    def add_clean_rule(self, name: str, pattern: str, replacement: str,
                       description: str = "", flags: int = 0):
        """添加清洗规则"""
        self.clean_rules.append({
            'name': name,
            'pattern': re.compile(pattern, flags),
            'replacement': replacement,
            'description': description
        })

    def clean(self, text: str, verbose: bool = False) -> str:
        """清洗文本"""
        result = text

        for rule in self.clean_rules:
            before = result
            result = rule['pattern'].sub(rule['replacement'], result)

            if verbose and before != result:
                print(f"  应用规则 '{rule['name']}': {rule['description']}")

        return result

    def clean_batch(self, texts: List[str], verbose: bool = False) -> List[str]:
        """批量清洗文本"""
        return [self.clean(text, verbose) for text in texts]

# 创建数据处理器
class DataProcessor:
    """综合数据处理框架"""

    def __init__(self):
        self.extractor = DataExtractor()
        self.cleaner = DataCleaner()
        self._setup_default_rules()

    def _setup_default_rules(self):
        """设置默认规则"""

        # 添加提取规则
        extract_rules = [
            ExtractionRule(
                name="emails",
                pattern=r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
                description="提取电子邮件地址"
            ),
            ExtractionRule(
                name="phones",
                pattern=r"\b\d{3}[-.]?\d{4}[-.]?\d{4}\b",
                description="提取手机号码"
            ),
            ExtractionRule(
                name="urls",
                pattern=r"https?://[^\s/$.?#].[^\s]*",
                description="提取URL链接"
            ),
            ExtractionRule(
                name="dates",
                pattern=r"\b\d{4}[-/.]\d{2}[-/.]\d{2}\b",
                description="提取日期"
            ),
            ExtractionRule(
                name="ip_addresses",
                pattern=r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
                description="提取IP地址"
            ),
            ExtractionRule(
                name="money_amounts",
                pattern=r"[¥$€£]?\s*\d+(?:,\d{3})*(?:\.\d{2})?",
                description="提取货币金额"
            ),
            ExtractionRule(
                name="hashtags",
                pattern=r"#\w+",
                description="提取话题标签"
            ),
            ExtractionRule(
                name="mentions",
                pattern=r"@\w+",
                description="提取提及"
            )
        ]

        for rule in extract_rules:
            self.extractor.add_rule(rule)

        # 添加清洗规则
        clean_rules = [
            ("remove_extra_spaces", r"\s+", " ", "移除多余空格"),
            ("remove_html_tags", r"<[^>]+>", "", "移除HTML标签"),
            ("remove_special_chars", r"[^\w\s\u4e00-\u9fa5.,!?;:@#$%&*()-]", "", "移除特殊字符"),
            ("normalize_quotes", r"['\"`]", "'", "标准化引号"),
            ("fix_multiple_punctuation", r"([!?.]){2,}", r"\1", "修复多个标点"),
            ("remove_control_chars", r"[\x00-\x1F\x7F]", "", "移除控制字符"),
            ("normalize_line_breaks", r"\r\n|\r", "\n", "标准化换行符"),
            ("trim_lines", r"^\s+|\s+$", "", "去除行首尾空格", re.MULTILINE)
        ]

        for name, pattern, replacement, desc, *flags in clean_rules:
            flag = flags[0] if flags else 0
            self.cleaner.add_clean_rule(name, pattern, replacement, desc, flag)

    def process(self, text: str, clean: bool = True, extract: bool = True) -> Dict[str, Any]:
        """处理文本数据"""
        result = {
            'original': text,
            'cleaned': None,
            'extracted': None,
            'stats': {}
        }

        # 清洗数据
        if clean:
            cleaned_text = self.cleaner.clean(text, verbose=False)
            result['cleaned'] = cleaned_text

            # 计算清洗统计
            result['stats']['clean'] = {
                'original_length': len(text),
                'cleaned_length': len(cleaned_text),
                'reduction': len(text) - len(cleaned_text)
            }

        # 提取数据
        if extract:
            target_text = cleaned_text if clean else text
            extracted_data = self.extractor.extract_all(target_text)
            result['extracted'] = extracted_data

            # 计算提取统计
            result['stats']['extract'] = {
                category: len(items)
                for category, items in extracted_data.items()
            }

        return result

    def process_batch(self, texts: List[str], **kwargs) -> List[Dict[str, Any]]:
        """批量处理文本数据"""
        return [self.process(text, **kwargs) for text in texts]

    def validate(self, text: str, rule_name: str) -> bool:
        """验证文本"""
        return self.extractor.validate(text, rule_name)

# 测试数据处理框架
print("=== 数据清洗和提取框架 ===\n")

# 创建处理器
processor = DataProcessor()

# 测试数据
test_data = """
用户反馈记录 - 2023-12-25

联系信息：
姓名: 张三
邮箱: zhangsan@example.com
电话: 138-1234-5678
备用电话: 139.8765.4321

反馈内容：
"网站加载太慢了！！！需要优化性能。"
价格太贵了，要¥1000，能否打折？
访问网站：https://www.example.com/products/123
关注我们：@example #新产品

服务器IP：192.168.1.1，状态：正常
无效字符：
"""

print("原始数据:")
print(test_data)

# 处理数据
result = processor.process(test_data, clean=True, extract=True)

print("\n1. 清洗后数据:")
print(result['cleaned'])

print("\n2. 提取的数据:")
extracted = result['extracted']
for category, items in extracted.items():
    if items:
        print(f"  {category}: {items}")

print("\n3. 处理统计:")
stats = result['stats']
print(f"  清洗:")
print(f"    原始长度: {stats['clean']['original_length']}")
print(f"    清洗后长度: {stats['clean']['cleaned_length']}")
print(f"    减少字符: {stats['clean']['reduction']}")

print(f"\n  提取:")
for category, count in stats['extract'].items():
    if count > 0:
        print(f"    {category}: {count} 个")

# 批量处理示例
print("\n4. 批量处理示例:")

batch_data = [
    "联系邮箱：alice@company.com，电话：123-4567-8901",
    "价格：$99.99，网址：http://shop.com",
    "无效数据：abc@def @@@ ###"
]

batch_results = processor.process_batch(batch_data, clean=True, extract=True)

for i, res in enumerate(batch_results, 1):
    print(f"\n  数据{i}:")
    print(f"    原始: {res['original'][:50]}...")
    print(f"    提取到邮箱: {res['extracted'].get('emails', [])}")
    print(f"    提取到电话: {res['extracted'].get('phones', [])}")
    print(f"    提取到URL: {res['extracted'].get('urls', [])}")

# 验证示例
print("\n5. 数据验证:")

validation_tests = [
    ("邮箱验证", "emails", "test@example.com"),
    ("邮箱验证", "emails", "invalid-email"),
    ("手机号验证", "phones", "138-1234-5678"),
    ("手机号验证", "phones", "12345"),
    ("日期验证", "dates", "2023-12-25"),
    ("日期验证", "dates", "2023/12/25"),
]

for desc, rule, text in validation_tests:
    valid = processor.validate(text, rule)
    print(f"  {desc} '{text}': {'有效' if valid else '无效'}")

# 自定义规则示例
print("\n6. 自定义规则示例:")

# 添加自定义提取规则
custom_rule = ExtractionRule(
    name="product_codes",
    pattern=r"PROD-\d{3}-[A-Z]{2}",
    description="提取产品代码",
    transform=lambda x: x.upper()  # 转换为大写
)

processor.extractor.add_rule(custom_rule)

# 测试自定义规则
product_text = "产品列表：PROD-123-AB, prod-456-cd, PROD-789-EF"
matches = processor.extractor.extract(product_text, "product_codes")
print(f"  提取产品代码: {matches}")

# 添加自定义清洗规则
processor.cleaner.add_clean_rule(
    name="mask_sensitive",
    pattern=r"\b\d{4}[-.]?\d{4}[-.]?\d{4}\b",
    replacement="[PHONE_MASKED]",
    description="掩码手机号码"
)

# 测试自定义清洗
sensitive_text = "我的电话是13812345678，另一个是139-8765-4321"
cleaned = processor.cleaner.clean(sensitive_text, verbose=True)
print(f"\n  敏感信息清洗: {cleaned}")
```

## 总结：正则表达式的艺术与科学

通过本章的学习，你已经掌握了正则表达式的核心概念和实用技巧：

### 关键要点回顾

1. **基础语法**：字符类、量词、定位符是正则表达式的基石
2. **re模块函数**：`search()`、`match()`、`findall()`、`sub()`各有用途
3. **分组与捕获**：提取特定信息，创建复杂模式匹配
4. **贪婪与非贪婪**：理解匹配策略，避免常见陷阱
5. **字符串方法**：简单任务用字符串方法，复杂模式用正则表达式
6. **实战应用**：数据清洗、日志分析、文本提取等实际场景

### 最佳实践建议

1. **从简单开始**：先用字符串方法解决问题，必要时再用正则表达式
2. **使用raw字符串**：总是使用`r"pattern"`避免转义问题
3. **编译重用**：频繁使用的模式使用`re.compile()`预编译
4. **添加注释**：复杂模式使用`re.VERBOSE`标志提高可读性
5. **测试验证**：使用在线工具（如regex101.com）测试正则表达式
6. **性能优化**：避免灾难性回溯，选择高效的模式

### 常见陷阱与解决方案

```python
# 1. 转义问题：总是使用raw字符串
wrong = "\\d+"  # 可能出问题
right = r"\d+"  # 正确方式

# 2. 点号不匹配换行符：使用re.DOTALL标志
text = "第一行\n第二行"
re.search(r".*", text)  # 只匹配到"第一行"
re.search(r".*", text, re.DOTALL)  # 匹配整个文本

# 3. 贪婪匹配问题：使用非贪婪量词
html = "<div>内容1</div><div>内容2</div>"
re.search(r"<div>.*</div>", html)  # 匹配整个字符串
re.search(r"<div>.*?</div>", html)  # 只匹配第一个<div>

# 4. 性能问题：避免过度回溯
# 避免： (a+)+, (a|aa)+, (a*)*
# 使用： a+, (?:aa)+, a*

# 5. Unicode匹配：处理多语言文本
re.findall(r"\w+", "Hello 世界")  # 只匹配"Hello"
re.findall(r"\w+", "Hello 世界", re.ASCII)  # 只匹配"Hello"
re.findall(r"[\w\u4e00-\u9fa5]+", "Hello 世界")  # 匹配"Hello"和"世界"
```

### 继续学习资源

1. **官方文档**：[Python re模块文档](https://docs.python.org/3/library/re.html)
2. **在线测试**：[regex101.com](https://regex101.com/) - 交互式正则表达式测试工具
3. **教程资源**：
   - [Regular-Expressions.info](https://www.regular-expressions.info/) - 全面的正则表达式教程
   - [RexEgg](http://www.rexegg.com/) - 高级正则表达式技巧
4. **书籍推荐**：
   - 《精通正则表达式》- Jeffrey E.F. Friedl
   - 《Python正则表达式实战》- 国内优秀教程

### 最后思考

正则表达式是一门艺术，更是一门科学。它像一把瑞士军刀，能解决各种文本处理问题，但需要练习和耐心才能掌握。

记住这些原则：

- **清晰胜过聪明**：可读的正则表达式比聪明的单行表达式更有价值
- **测试驱动开发**：编写测试用例验证正则表达式的正确性
- **适时放弃**：对于非常复杂的文本解析，考虑使用专门的解析器（如HTML解析器、JSON解析器）

现在，你已经具备了强大的文本处理能力。去实践吧，用正则表达式解决实际问题，体验它带来的效率和乐趣！
