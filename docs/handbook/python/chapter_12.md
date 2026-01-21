# Python数据持久化实战：从SQLite到MongoDB的完整指南

> 数据是应用的心脏，而数据库则是存储这颗心脏的保险箱。无论是轻量级移动应用还是高并发Web服务，选择合适的数据持久化方案都是开发成功的关键一步。

Python作为数据科学和Web开发的热门语言，提供了丰富多样的数据库操作工具。官方sqlite3模块让轻量级数据存储变得简单易用，而SQLAlchemy ORM框架则为复杂应用提供了企业级解决方案。

对于需要处理非结构化数据或高并发场景，MongoDB这类NoSQL数据库提供了完全不同的思路。

本文将带你从零开始，全面掌握Python中操作各种数据库的核心技能。

---

## 01 数据库基础与SQL入门

在深入了解Python如何操作数据库之前，我们需要先理解数据库的基本概念。数据库本质上是**有组织的数据集合**，而SQL（结构化查询语言）是与这些数据交互的标准方式。

SQLite是一个轻量级的基于磁盘的数据库，它不需要独立的服务器进程。这种特性使其成为小型应用、原型开发或移动应用的理想选择。

SQL的基础操作主要围绕四个核心命令：SELECT（查询）、INSERT（插入）、UPDATE（更新）和DELETE（删除）。这些命令构成了所谓的CRUD操作（创建、读取、更新、删除），是任何数据库交互的基础。

## 02 Python内置武器：sqlite3模块实战

Python标准库中的sqlite3模块提供了符合DB-API 2.0规范的SQLite数据库接口。这个模块最吸引人的地方在于它无需额外安装，开箱即用。

让我们通过一个简单的股票交易记录系统来演示sqlite3的基本使用：

```python
import sqlite3
from datetime import date

# 连接到数据库（如果不存在则创建）
conn = sqlite3.connect('trading.db')
cursor = conn.cursor()

# 创建股票交易记录表
cursor.execute('''
CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    trans_type TEXT CHECK(trans_type IN ('BUY', 'SELL')),
    symbol TEXT NOT NULL,
    quantity REAL,
    price REAL
)
''')

# 插入单条交易记录
cursor.execute(
    "INSERT INTO stocks (date, trans_type, symbol, quantity, price) VALUES (?, ?, ?, ?, ?)",
    ('2025-01-20', 'BUY', 'AAPL', 10, 185.25)
)

# 批量插入交易记录
trades = [
    ('2025-01-21', 'SELL', 'GOOGL', 5, 152.75),
    ('2025-01-22', 'BUY', 'MSFT', 8, 385.40),
    ('2025-01-23', 'BUY', 'TSLA', 3, 210.30)
]
cursor.executemany(
    "INSERT INTO stocks (date, trans_type, symbol, quantity, price) VALUES (?, ?, ?, ?, ?)",
    trades
)

# 查询所有记录
cursor.execute("SELECT * FROM stocks")
all_trades = cursor.fetchall()
print(f"总共 {len(all_trades)} 条交易记录")

# 条件查询
cursor.execute(
    "SELECT * FROM stocks WHERE symbol=? AND trans_type=?",
    ('AAPL', 'BUY')
)
apple_buys = cursor.fetchall()
print(f"苹果买入交易: {apple_buys}")

# 提交事务并关闭连接
conn.commit()
conn.close()
```

这个简单的例子展示了sqlite3模块的核心操作：连接数据库、创建游标、执行SQL语句、处理结果。值得注意的是，我们使用了参数化查询（用问号作为占位符），这是防止SQL注入攻击的关键实践。

## 03 连接、游标与执行机制

理解连接（Connection）和游标（Cursor）的概念对高效使用数据库至关重要。**连接对象**代表了与数据库的会话，而**游标对象**则是在这个会话中执行命令和获取结果的主要工具。

在Python的sqlite3模块中，游标不仅用于执行SQL语句，还可以作为迭代器遍历查询结果。

```python
import sqlite3

# 创建内存数据库（仅存在于内存中，程序结束时消失）
conn = sqlite3.connect(':memory:')
cursor = conn.cursor()

# 创建示例表
cursor.execute('''
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

# 使用游标作为迭代器
cursor.execute("INSERT INTO users (username, email) VALUES ('alice', 'alice@example.com')")
cursor.execute("INSERT INTO users (username, email) VALUES ('bob', 'bob@example.com')")
cursor.execute("INSERT INTO users (username, email) VALUES ('charlie', 'charlie@example.com')")

conn.commit()

# 方法1：使用fetchall获取所有结果
cursor.execute("SELECT * FROM users")
all_users = cursor.fetchall()
print("所有用户 (fetchall):", all_users)

# 方法2：使用游标作为迭代器
cursor.execute("SELECT * FROM users ORDER BY username")
print("按用户名排序:")
for row in cursor:
    print(f"  - {row[1]} ({row[2]})")

# 方法3：一次获取一行
cursor.execute("SELECT * FROM users WHERE id = ?", (1,))
single_user = cursor.fetchone()
print("ID为1的用户:", single_user)

conn.close()
```

**游标的状态管理**是另一个重要概念。执行查询后，游标会指向结果集的第一条记录之前，调用`fetchone()`会获取当前记录并将指针移动到下一条记录。当结果集耗尽时，`fetchone()`返回None。

## 04 参数化查询：安全第一的原则

在构建动态SQL查询时，最大的安全风险就是SQL注入攻击。xkcd网站有一个经典漫画展示了SQL注入可能带来的灾难性后果。防止这种攻击的关键就是使用参数化查询。

```python
import sqlite3

def insecure_query(user_input):
    """危险：直接拼接用户输入的SQL查询"""
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()

    # 恶意用户可能输入: ' OR '1'='1
    query = f"SELECT * FROM users WHERE username = '{user_input}'"
    cursor.execute(query)  # 极易受SQL注入攻击
    return cursor.fetchall()

def secure_query(user_input):
    """安全：使用参数化查询"""
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()

    # 使用问号作为占位符
    cursor.execute("SELECT * FROM users WHERE username = ?", (user_input,))
    return cursor.fetchall()

# 演示参数化查询的多种形式
def demonstrate_parameterized_queries():
    conn = sqlite3.connect(':memory:')
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT,
        category TEXT,
        price REAL,
        stock INTEGER
    )
    ''')

    # 单个参数
    product_name = "Laptop"
    cursor.execute("SELECT * FROM products WHERE name = ?", (product_name,))

    # 多个参数
    category = "Electronics"
    min_price = 500.0
    cursor.execute(
        "SELECT * FROM products WHERE category = ? AND price > ?",
        (category, min_price)
    )

    # 使用命名参数（更易读）
    cursor.execute(
        "SELECT * FROM products WHERE category = :cat AND price BETWEEN :min AND :max",
        {'cat': 'Electronics', 'min': 300.0, 'max': 1000.0}
    )

    # 批量插入的完美示例
    new_products = [
        ('Smartphone', 'Electronics', 699.99, 50),
        ('Tablet', 'Electronics', 399.99, 30),
        ('Desk Chair', 'Furniture', 199.99, 20)
    ]
    cursor.executemany(
        "INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)",
        new_products
    )

    conn.commit()
    conn.close()
```

参数化查询不仅**防止SQL注入攻击**，还能提高性能，因为数据库可以缓存已编译的查询计划。记住这个原则：永远不要使用Python的字符串操作或格式化来构建SQL查询语句。

## 05 事务处理：保证数据完整性的关键

事务是数据库操作中保证数据完整性的核心机制。它遵循ACID原则：原子性（Atomicity）、一致性（Consistency）、隔离性（Isolation）和持久性（Durability）。

在SQLite中，事务可以通过显式控制或依赖自动提交模式来管理。

```python
import sqlite3
import sys

def transfer_funds(from_account, to_account, amount):
    """银行转账示例：演示事务的重要性"""
    conn = sqlite3.connect('bank.db')

    # 设置为手动提交模式
    conn.isolation_level = None  # 自动提交模式
    # 或者使用 conn.isolation_level = "DEFERRED"  # 默认事务模式

    cursor = conn.cursor()

    try:
        # 开始事务（在自动提交模式下需要显式开始）
        cursor.execute("BEGIN TRANSACTION")

        # 检查转出账户余额
        cursor.execute("SELECT balance FROM accounts WHERE id = ?", (from_account,))
        from_balance = cursor.fetchone()[0]

        if from_balance < amount:
            raise ValueError("余额不足")

        # 扣除转出账户金额
        cursor.execute(
            "UPDATE accounts SET balance = balance - ? WHERE id = ?",
            (amount, from_account)
        )

        # 模拟一个可能失败的操作
        # 这里可以是一个可能抛出异常的操作

        # 增加转入账户金额
        cursor.execute(
            "UPDATE accounts SET balance = balance + ? WHERE id = ?",
            (amount, to_account)
        )

        # 记录交易
        cursor.execute(
            "INSERT INTO transactions (from_account, to_account, amount) VALUES (?, ?, ?)",
            (from_account, to_account, amount)
        )

        # 提交事务
        conn.commit()
        print("转账成功")

    except Exception as e:
        # 回滚事务（撤销所有更改）
        conn.rollback()
        print(f"转账失败: {e}")

    finally:
        conn.close()

# 另一种更Pythonic的事务管理方式：使用上下文管理器
def transfer_funds_safe(from_account, to_account, amount):
    """使用更安全的事务处理方式"""
    conn = sqlite3.connect('bank.db')

    try:
        # 使用连接作为上下文管理器自动处理事务
        with conn:
            cursor = conn.cursor()

            # 检查余额
            cursor.execute("SELECT balance FROM accounts WHERE id = ?", (from_account,))
            from_balance = cursor.fetchone()[0]

            if from_balance < amount:
                raise ValueError("余额不足")

            # 执行转账操作
            cursor.execute(
                "UPDATE accounts SET balance = balance - ? WHERE id = ?",
                (amount, from_account)
            )
            cursor.execute(
                "UPDATE accounts SET balance = balance + ? WHERE id = ?",
                (amount, to_account)
            )

        # 离开with块时，如果没有异常则自动提交，有异常则自动回滚
        print("转账成功")

    except sqlite3.Error as e:
        print(f"数据库错误: {e}")
    except ValueError as e:
        print(f"业务逻辑错误: {e}")
    finally:
        conn.close()
```

**事务的合理使用**可以确保即使在系统故障的情况下，数据库也能保持一致状态。在金融系统、库存管理等关键应用中，正确的事务处理是必不可少的。

## 06 SQLAlchemy ORM：Pythonic的数据库操作

当应用复杂度增加时，直接使用SQL语句可能变得繁琐且容易出错。这时对象关系映射（ORM）工具就派上用场了。SQLAlchemy是Python中最强大的ORM框架之一，它提供了一种既直观又灵活的方式来处理数据库操作。

```python
from sqlalchemy import create_engine, Column, Integer, String, Date, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime

# 创建引擎（数据库连接）
engine = create_engine('sqlite:///library.db', echo=True)  # echo=True会显示生成的SQL

# 声明基类
Base = declarative_base()

# 定义作者模型
class Author(Base):
    __tablename__ = 'authors'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    nationality = Column(String(50))

    # 定义与Book的关系（一对多）
    books = relationship("Book", back_populates="author", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Author(id={self.id}, name='{self.name}')>"

# 定义书籍模型
class Book(Base):
    __tablename__ = 'books'

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    isbn = Column(String(13), unique=True)
    published_date = Column(Date)
    genre = Column(String(50))

    # 外键关联到Author表
    author_id = Column(Integer, ForeignKey('authors.id'), nullable=False)

    # 定义关系
    author = relationship("Author", back_populates="books")

    def __repr__(self):
        return f"<Book(id={self.id}, title='{self.title}')>"

# 创建所有表
Base.metadata.create_all(engine)

# 创建会话工厂和会话
Session = sessionmaker(bind=engine)
session = Session()

# 插入数据
def add_sample_data():
    # 创建作者
    tolkien = Author(name="J.R.R. Tolkien", nationality="British")
    rowling = Author(name="J.K. Rowling", nationality="British")

    # 创建书籍并关联作者
    tolkien.books = [
        Book(title="The Hobbit", isbn="9780547928227",
             published_date=datetime.date(1937, 9, 21), genre="Fantasy"),
        Book(title="The Fellowship of the Ring", isbn="9780547928210",
             published_date=datetime.date(1954, 7, 29), genre="Fantasy")
    ]

    rowling.books = [
        Book(title="Harry Potter and the Philosopher's Stone", isbn="9780747532699",
             published_date=datetime.date(1997, 6, 26), genre="Fantasy")
    ]

    # 添加到会话并提交
    session.add_all([tolkien, rowling])
    session.commit()

# 查询示例
def query_examples():
    # 查询所有作者
    all_authors = session.query(Author).all()
    print("所有作者:", all_authors)

    # 条件查询：英国作者
    british_authors = session.query(Author).filter(Author.nationality == "British").all()
    print("英国作者:", british_authors)

    # 连接查询：通过书籍查询作者
    books_by_tolkien = session.query(Book).join(Author).filter(Author.name.like("%Tolkien%")).all()
    print("托尔金的书籍:", books_by_tolkien)

    # 聚合查询：每个作者的书籍数量
    from sqlalchemy import func
    author_book_counts = session.query(
        Author.name, func.count(Book.id).label('book_count')
    ).join(Book).group_by(Author.id).all()

    for author_name, count in author_book_counts:
        print(f"{author_name}: {count} 本书")

# 更新数据
def update_example():
    # 找到要更新的记录
    book = session.query(Book).filter_by(isbn="9780747532699").first()
    if book:
        book.title = "Harry Potter and the Sorcerer's Stone"  # 美版标题
        session.commit()
        print(f"更新书籍: {book}")

# 删除数据
def delete_example():
    # 删除操作（注意级联删除）
    author = session.query(Author).filter_by(name="J.K. Rowling").first()
    if author:
        session.delete(author)
        session.commit()
        print(f"删除作者及其所有书籍: {author.name}")

# 执行示例
if __name__ == "__main__":
    add_sample_data()
    query_examples()
    update_example()
    # delete_example()  # 谨慎执行
    session.close()
```

SQLAlchemy的真正威力在于它的**灵活性**。它不仅可以处理简单的CRUD操作，还能通过声明式系统定义复杂的数据模型、建立表间关系、执行高级查询和聚合操作。

## 07 NoSQL新世界：MongoDB快速入门

在某些场景下，传统的关系型数据库可能不是最佳选择。NoSQL数据库如MongoDB提供了不同的数据模型，特别适合处理非结构化或半结构化数据。

MongoDB是一个开源、高性能、无模式的文档型数据库，它以BSON（二进制JSON）文档的格式存储数据。

**适用场景对比**：MongoDB适合社交网络、内容管理系统、实时分析等需要灵活数据模型的场景，而关系型数据库更适合需要复杂事务和严格数据一致性的应用。

```python
from pymongo import MongoClient
from datetime import datetime
import pprint

# 连接到MongoDB（默认本地服务器）
client = MongoClient('mongodb://localhost:27017/')

# 选择或创建数据库
db = client['library_db']

# 选择或创建集合（类似于SQL中的表）
books_collection = db['books']

# 插入文档
book_document = {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "published_year": 1925,
    "genres": ["Novel", "Tragedy"],
    "copies": [
        {"location": "Main Library", "status": "available"},
        {"location": "Downtown Branch", "status": "checked out"}
    ],
    "metadata": {
        "isbn": "9780743273565",
        "pages": 180,
        "language": "English"
    },
    "created_at": datetime.now()
}

# 插入单个文档
result = books_collection.insert_one(book_document)
print(f"插入文档ID: {result.inserted_id}")

# 批量插入文档
more_books = [
    {
        "title": "To Kill a Mockingbird",
        "author": "Harper Lee",
        "published_year": 1960,
        "genres": ["Southern Gothic", "Bildungsroman"],
        "metadata": {"pages": 281}
    },
    {
        "title": "1984",
        "author": "George Orwell",
        "published_year": 1949,
        "genres": ["Dystopian", "Political fiction"],
        "metadata": {"pages": 328}
    }
]
result = books_collection.insert_many(more_books)
print(f"批量插入IDs: {result.inserted_ids}")

# 查询文档
print("\n所有书籍:")
for book in books_collection.find():
    pprint.pprint(book)

# 条件查询
print("\n1949年后的书籍:")
for book in books_collection.find({"published_year": {"$gt": 1949}}):
    print(f"  - {book['title']} ({book['published_year']})")

# 更新文档
update_result = books_collection.update_one(
    {"title": "1984"},
    {"$set": {"metadata.edition": "1st"}}
)
print(f"\n更新文档数量: {update_result.modified_count}")

# 删除文档
delete_result = books_collection.delete_one({"title": "1984"})
print(f"删除文档数量: {delete_result.deleted_count}")

# 聚合操作示例（统计每年出版的书籍数量）
pipeline = [
    {"$group": {"_id": "$published_year", "count": {"$sum": 1}}},
    {"$sort": {"_id": 1}}
]
yearly_stats = list(books_collection.aggregate(pipeline))
print("\n按年份统计:")
for stat in yearly_stats:
    print(f"  {stat['_id']}: {stat['count']} 本书")

client.close()
```

MongoDB的**文档模型**特别适合存储变化频繁或结构不一致的数据。与传统关系型数据库相比，它不需要预定义严格的表结构，这在快速迭代的开发环境中具有明显优势。

---

数据持久化不是单纯的技术选择，而需要与你的应用场景、团队技能和未来发展相匹配。对于中小型应用或原型开发，SQLite可能是最佳起点，它足够简单且功能完善。

随着应用规模扩大，SQLAlchemy提供的ORM抽象能显著提高开发效率并降低维护成本。

而当面对海量非结构化数据、高并发读写需求或快速迭代的开发环境时，MongoDB这类NoSQL数据库提供了关系型数据库难以比拟的灵活性和扩展性。**选择适合的数据库技术**，让数据成为应用的助力而非瓶颈。
