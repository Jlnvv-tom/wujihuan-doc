# 第5章 Query Builder与事务管理

上周有个兄弟在群里贴了一段ORM查询代码，说他的接口响应时间从50ms飙到了2000ms，DBA差点把他拉黑。我一看代码，好家伙，一个列表接口里套了三层循环，每层循环里都在查数据库，典型的N+1查询问题。200条数据硬生生发了601条SQL到数据库。他还不服气，说"我明明用了ORM啊，ORM不是自动优化的吗？"

这种事我见得太多了。很多人觉得用了ORM就万事大吉，链式调用一写，查询就自动优化了。殊不知ORM只是帮你拼SQL的工具，它不会替你思考。你写filter的时候它不知道你的索引长什么样，你写for循环的时候它不知道里面藏了N+1查询，你开事务的时候它不知道里面有个HTTP调用会卡5秒钟。Query Builder的设计哲学、事务的边界控制、查询的性能优化，这些才是真正拉开工程师差距的东西。Django的ORM文档厚达数百页，但大部分开发者只看了前几页的quickstart就开始写生产代码了，剩下的内容全靠线上踩坑来学，而线上踩坑的学费是用户的体验和团队的声誉。

我是怕浪猫，这是我Python实战训练营的第5周。今天这章我们把Query Builder设计和事务管理从头到尾拆一遍，从链式调用的底层机制到嵌套事务的Savepoint实现，每个知识点都配上可运行的代码和真实踩坑记录。这章的信息密度很高，建议泡杯茶慢慢看。看完这篇，你不仅能写出高效的查询代码，还能在自己的框架里实现一套完整的Query Builder。我们不背API，我们造API。

> ORM不是性能问题的根源，不懂ORM才是。工具不会替你思考，但思考能让你把工具用成艺术。

## 一、Query Builder设计：从链式调用到SQL编译

### 1.1 链式调用API设计与QuerySet惰性求值

先问一个问题：当你写下 `query.filter(name='cat').exclude(age=3).order_by('-id')` 的时候，数据库执行了几条SQL？

答案是零条。这就是QuerySet的惰性求值机制，也是Query Builder最重要的设计理念。

很多人把链式调用理解为"优雅的语法糖"，这只说对了一半。链式调用的真正价值在于它把查询条件的构建和查询的执行解耦了。你调用filter、exclude、order_by这些方法的时候，它们并不立即访问数据库，而是把条件收集起来，存为一个表达式树。等到你真正需要数据的时候——遍历结果、切片、取长度、转list——才把表达式树编译成SQL，发给数据库执行。

这个设计带来了几个重要的工程优势，值得展开说说。第一是性能层面：你可以逐步构建复杂查询而不产生中间结果集。想象一下，如果你要查询活跃用户中角色为管理员且注册时间在最近三十天内的记录，不用惰性求值的话，每加一个条件就要执行一次查询产生一个中间结果集，三次查询三次数据库往返。有了惰性求值，三个条件合并成一条SQL一次往返搞定。第二是可组合性：一个基础QuerySet可以被多次filter产生不同的派生QuerySet，彼此互不影响。这在实际开发中非常实用，你可以定义一个基础查询作为公共起点，然后在不同业务场景里派生出各自的子查询。第三是可测试性：你可以在不连接数据库的情况下构建查询对象，然后检查它的条件树和生成的SQL是否符合预期，这让单元测试变得简单可靠。

来看我训练营里手写的QuerySet基类：

```python
class QuerySet:
    def __init__(self, model):
        self.model = model
        self._filters = []
        self._excludes = []
        self._order_by = []
        self._limit = None
        self._offset = None
        self._result_cache = None

    def filter(self, **kwargs):
        clone = self._clone()
        clone._filters.append(kwargs)
        return clone

    def exclude(self, **kwargs):
        clone = self._clone()
        clone._excludes.append(kwargs)
        return clone

    def order_by(self, *fields):
        clone = self._clone()
        clone._order_by.extend(fields)
        return clone

    def _clone(self):
        qs = QuerySet(self.model)
        qs._filters = list(self._filters)
        qs._excludes = list(self._excludes)
        qs._order_by = list(self._order_by)
        qs._limit = self._limit
        qs._offset = self._offset
        return qs
```

注意一个关键细节：每次调用filter或exclude都返回一个clone，而不是修改自身。这是不可变模式的应用，保证了同一个QuerySet可以被多次复用而不会互相污染。Django的QuerySet就是这么做的，这也是为什么你可以安全地把一个基础queryset作为类属性共享，然后在不同方法里各自filter出需要的子集。

那惰性求值到底在什么时候触发？来看触发机制：

```python
    def __iter__(self):
        self._fetch_all()
        return iter(self._result_cache)

    def __len__(self):
        self._fetch_all()
        return len(self._result_cache)

    def __getitem__(self, k):
        if isinstance(k, slice):
            self._offset = k.start
            self._limit = k.stop - k.start
            self._fetch_all()
            return self._result_cache[k]
        self._fetch_all()
        return self._result_cache[k]

    def _fetch_all(self):
        if self._result_cache is None:
            sql, params = self._build_sql()
            self._result_cache = self.model.execute(sql, params)
```

四个触发点：迭代、取长度、切片、索引。前三个都会触发完整查询，切片会先设置offset和limit再查询。这也是为什么 `query[:10]` 和 `list(query)[:10]` 性能差距巨大的原因——前者在SQL层面加了LIMIT 10，只从数据库拉10条记录；后者把所有数据拉到内存再切，如果你的表有一百万条数据，这一行代码就能把内存撑爆。

我在第一版实现的时候犯过一个很蠢的错误：没有实现_clone方法，直接在self上append。结果两行代码共享了同一个_filters列表：

```python
base = User.objects.filter(is_active=True)
admins = base.filter(role='admin')
users = base.filter(role='user')
# admins和users的_filters里都有role='admin'和role='user'
```

这种bug极其隐蔽，因为大部分单元测试的场景里base query不会被复用。只有当你在不同函数里共享一个基础查询的时候，问题才会暴露。我当时排查了两个小时才定位到，因为查询结果"看起来对但有时候不对"，这种间歇性bug最折磨人。所以在设计链式API的时候，不可变性不是可选项，是必须项。Django的源码里_clone方法有一大段注释专门解释这个问题。

> 链式调用的本质不是炫技，而是用不可变模式构建可组合的查询语言。每次filter返回新对象，不是浪费内存，是保护正确性。

### 1.2 查询表达式：Q对象与F对象

filter接受的关键字参数只能做AND组合。当你需要OR、NOT或者更复杂的条件组合时，就需要Q对象。

Q对象本质上是一棵可嵌套的布尔表达式树。每个Q实例持有一个连接符（AND或OR）、一个是否取反的标志位、以及一组子条件。子条件可以是普通的键值对（叶子节点），也可以是另一个Q对象（内部节点）。这种树形结构可以表达任意复杂的布尔逻辑。

来看Q对象的实现：

```python
class Q:
    AND = 'AND'
    OR = 'OR'
    NOT = 'NOT'

    def __init__(self, *args, connector=AND, negated=False, **kwargs):
        self.connector = connector
        self.negated = negated
        self.children = []
        for arg in args:
            if isinstance(arg, Q):
                self.children.append(arg)
            else:
                self.children.append(arg)
        for key, value in kwargs.items():
            self.children.append((key, value))

    def __or__(self, other):
        return Q(self, other, connector=self.OR)

    def __and__(self, other):
        return Q(self, other, connector=self.AND)

    def __invert__(self):
        return Q(self, connector=self.connector, negated=True)
```

使用方式非常直觉，就像写布尔表达式一样：

```python
# WHERE (name='猫' AND age>3) OR (name='狗' AND age<2)
q = (Q(name='猫', age__gt=3) | Q(name='狗', age__lt=2))
User.objects.filter(q)

# WHERE NOT (name='猫')
User.objects.filter(~Q(name='猫'))

# 嵌套：WHERE (name='猫' OR name='狗') AND age>3
User.objects.filter((Q(name='猫') | Q(name='狗')) & Q(age__gt=3))
```

Q对象的魔法在于Python的运算符重载机制。`|` 对应OR，`&` 对应AND，`~` 对应NOT。通过这些运算符的组合，你可以表达任意复杂的布尔逻辑，而不需要写一行SQL。更重要的是，这种抽象是数据库无关的——同一个Q对象，编译成PostgreSQL和MySQL的SQL时可能略有不同，但你的业务代码不需要关心。Q对象还有一个被忽视的优点：可读性。当你的同事看到 `Q(name='猫') | Q(name='狗')` 时，一眼就能看出是“名字叫猫或者名字叫狗”。但如果他看到原始SQL `WHERE name='猫' OR name='狗'`，虽然也能看懂，但SQL混在Python代码里总是不伦不类，既没有语法高亮也没有类型检查。Q对象让查询条件成为一等公民，可以定义变量传递、可以封装成函数复用、可以写单元测试验证。

> Q对象是查询语言的AST节点，你拼接的不是字符串，是一棵条件树。字符串拼接是SQL注入的温床，条件树是安全的堡垒。

说完Q对象再说F对象。F对象用于在查询中引用字段值，最常见的场景是字段间运算和原子更新。这个对象看起来不起眼，但它在并发场景下能救你的命。

没有F对象的时候，你要给所有用户涨100积分，得这么写：

```python
# 错误做法：先查出来再更新
users = User.objects.all()
for user in users:
    user.points += 100
    user.save()
```

这有两个严重问题。第一是性能问题：N次查询N次更新，如果有一万个用户就是两万次数据库往返。第二是并发问题：如果两个请求同时执行这段代码，两个请求都读到了user.points=100，各自加100后写回200，但正确结果应该是300。这就是经典的"丢失更新"问题，在互联网应用中无处不在。

用F对象一行搞定，两个问题同时解决：

```python
from .expressions import F
User.objects.update(points=F('points') + 100)
# UPDATE users SET points = points + 100
```

数据库层面执行原子更新，一条SQL搞定所有记录，既高效又安全。因为数据库在执行UPDATE时会对相关行加行锁，两个并发的UPDATE会串行执行，不会丢失更新。这个知识点在面试中出现频率极高，在实际工程中出现频率也极高。每次有人在代码review里写了“读出来改完存回去”的模式，我都会让他改成F表达式。不是因为我挑剔，是因为这种代码在高并发场景下一定会出事，只是时间问题。F对象的核心实现：

```python
class F:
    def __init__(self, name):
        self.name = name

    def __add__(self, other):
        return CombinedExpression(self, '+', other)

    def __sub__(self, other):
        return CombinedExpression(self, '-', other)

    def __mul__(self, other):
        return CombinedExpression(self, '*', other)

class CombinedExpression:
    def __init__(self, lhs, connector, rhs):
        self.lhs = lhs
        self.connector = connector
        self.rhs = rhs
```

编译的时候，F对象直接输出字段名，CombinedExpression递归编译左右两侧再用connector连接。最终生成的SQL是 `points + 100`，参数列表为空，因为100是常量直接写在SQL里。如果是 `F('points') + F('bonus')`，生成的就是 `points + bonus`，两个字段间的运算。

> F对象是并发安全的守护者。它把"读-改-写"的三步操作压缩成一步原子更新，从根本上消灭了竞态条件。

### 1.3 查找表达式：从__eq到__icontains

查找表达式是Query Builder的词汇表。`name__icontains='cat'` 这种写法背后是一套完整的查找协议，它定义了Query Builder能识别哪些操作符，以及每个操作符如何编译成SQL。

Django的约定是：字段名__查找类型。解析器把 `name__icontains` 按双下划线拆开，得到 `field='name'` 和 `lookup='icontains'`。如果字段名里没有双下划线后缀，默认就是exact（精确匹配）。这个设计很巧妙，用双下划线作为分隔符既避免了和Python变量命名规则冲突，又保证了可读性。

来看核心查找表达式的实现：

```python
LOOKUPS = {}

def register_lookup(lookup_name):
    def decorator(cls):
        LOOKUPS[lookup_name] = cls
        return cls
    return decorator

@register_lookup('exact')
class ExactLookup:
    def __init__(self, field, value):
        self.field = field
        self.value = value

    def as_sql(self):
        return f"{self.field} = %s", [self.value]

@register_lookup('gt')
class GreaterThanLookup:
    def __init__(self, field, value):
        self.field = field
        self.value = value

    def as_sql(self):
        return f"{self.field} > %s", [self.value]

@register_lookup('in')
class InLookup:
    def __init__(self, field, value):
        self.field = field
        self.value = value

    def as_sql(self):
        placeholders = ', '.join(['%s'] * len(self.value))
        return f"{self.field} IN ({placeholders})", list(self.value)

@register_lookup('contains')
class ContainsLookup:
    def __init__(self, field, value):
        self.field = field
        self.value = value

    def as_sql(self):
        return f"{self.field} LIKE %s", [f'%{self.value}%']
```

这种注册器模式的好处是可扩展性极强。你想加一个全文检索的lookup，只需要写个类注册进去，不用改任何已有代码。新来的同事看代码的时候，一看register_lookup装饰器就知道这个类是干什么的。这就是开闭原则在实际工程中的体现——对扩展开放，对修改关闭。我第一次看到这种模式的时候觉得太重了，不就几个if-else的事吗？后来lookup从5个增加到20个的时候，if-else变成了不可维护的怪物，而注册器模式依然清爽。好的架构设计不是一开始就很优雅，而是随着复杂度增长依然能保持优雅。

再来看icontains的实现，它和contains有一个微妙但重要的区别：

```python
@register_lookup('icontains')
class IContainsLookup:
    def __init__(self, field, value):
        self.field = field
        self.value = value

    def as_sql(self):
        return f"LOWER({self.field}) LIKE LOWER(%s)", [f'%{self.value}%']
```

contains在不同数据库上行为不同：MySQL的LIKE默认大小写不敏感（取决于collation设置），PostgreSQL的LIKE默认大小写敏感。而icontains统一用LOWER函数保证大小写不敏感，不管底层是什么数据库。这种跨数据库一致性是Query Builder作为抽象层的重要职责。你写的业务代码不需要因为换数据库而修改。

range查找处理BETWEEN语义，常用于日期范围和数值区间查询：

```python
@register_lookup('range')
class RangeLookup:
    def __init__(self, field, value):
        self.field = field
        self.value = value  # (start, end) 元组

    def as_sql(self):
        return f"{self.field} BETWEEN %s AND %s", [self.value[0], self.value[1]]
```

一个实际场景：查询最近7天创建的订单。`Order.objects.filter(created_at__range=(seven_days_ago, now))`，编译成 `WHERE created_at BETWEEN %s AND %s`，参数是两个时间戳。简单、清晰、安全。

> 查找表达式是SQL方言的隔离层。同一个icontains调用，底层生成的SQL因数据库而异，但你的业务代码一行都不用改。这就是抽象的力量。

### 1.4 SQL编译器：从表达式到SQL片段

有了Q对象、F对象和查找表达式，还需要一个编译器把这一切组装成最终的SQL语句。这是Query Builder的心脏，也是最容易出bug的地方。

编译器的工作流程可以类比为编译器的后端：遍历QuerySet收集的所有条件，逐个编译成SQL片段和参数列表，用合适的连接符拼在一起，最后加上ORDER BY、LIMIT、OFFSET子句。每个步骤都要保证SQL片段和参数列表的顺序一致，否则就会产生难以排查的bug。

```python
class SQLCompiler:
    def __init__(self, queryset):
        self.queryset = queryset

    def compile(self):
        parts = []
        params = []

        where_sql, where_params = self._compile_where()
        if where_sql:
            parts.append(f"WHERE {where_sql}")
            params.extend(where_params)

        order_sql = self._compile_order()
        if order_sql:
            parts.append(f"ORDER BY {order_sql}")

        limit_sql, limit_params = self._compile_limit()
        if limit_sql:
            parts.append(limit_sql)
            params.extend(limit_params)

        sql = self._build_select() + ' ' + ' '.join(parts)
        return sql, params
```

compile方法是入口，按顺序组装WHERE、ORDER BY、LIMIT/OFFSET三个子句。每个子句的编译都返回两部分：SQL字符串和参数列表。参数列表最终按顺序拼接成完整的params，和SQL模板里的%s一一对应。这种“SQL片段加参数列表”的设计贯穿整个编译器，每个编译方法都遵循同样的契约：返回一个二元组。这种一致性让编译器的组装逻辑非常清晰，像拼积木一样把各个子句拼起来。

_where的编译逻辑：

```python
    def _compile_where(self):
        clauses = []
        params = []
        for f in self.queryset._filters:
            for key, value in f.items():
                sql, prm = self._compile_lookup(key, value)
                clauses.append(sql)
                params.extend(prm)
        for ex in self.queryset._excludes:
            for key, value in ex.items():
                sql, prm = self._compile_lookup(key, value)
                clauses.append(f"NOT ({sql})")
                params.extend(prm)
        return ' AND '.join(clauses), params
```

filter的条件用AND连接，exclude的条件用NOT包裹后再AND连接。这里有一个细节：多个filter调用之间是AND关系，而不是覆盖关系。`query.filter(a=1).filter(b=2)` 等价于 `WHERE a=1 AND b=2`，不是 `WHERE b=2`。这一点Django的文档说得很清楚，但很多人凭直觉会理解错。

Q对象的编译是递归下降的：

```python
    def _compile_q(self, q, params=None):
        if params is None:
            params = []
        parts = []
        for child in q.children:
            if isinstance(child, Q):
                sql, prm = self._compile_q(child, params)
                parts.append(f"({sql})")
            else:
                key, value = child
                sql, prm = self._compile_lookup(key, value)
                parts.append(sql)
        connector = f' {q.connector} '
        result = connector.join(parts)
        if q.negated:
            result = f"NOT ({result})"
        return result, params
```

_compile_q遇到嵌套的Q对象就递归，遇到叶子条件（键值对）就委托给_compile_lookup。递归的结果用括号包裹，保证优先级正确。这一点非常重要：`A AND (B OR C)` 和 `A AND B OR C` 的语义完全不同，括号不能省。

> SQL编译器是Query Builder的巴别塔，把内存中的表达式树翻译成数据库能理解的方言。一个括号放错位置，整个查询的语义就变了。

编译器里还有一个容易忽略的细节：参数顺序。SQL里参数是按位置占位的（%s），所以params列表的顺序必须和SQL模板中%的出现顺序完全一致。在_compile_where里，我们按filter的添加顺序依次编译，params也按顺序extend。如果你不小心把params的顺序搞反了，SQL不会报语法错误，但查询结果会完全不对——你用name的值去查age字段，数据库告诉你"没找到"，你还以为数据真的不存在。这种bug比语法错误难排查十倍，因为一切看起来都很正常。

### 1.5 参数化查询与SQL注入防护

每次讲到这里，我都会问训练营的同学一个问题：为什么不用字符串拼接？字符串拼接是最直觉的写法：`f"SELECT * FROM users WHERE name = '{name}'"`。简洁，好理解，看起来也没什么问题。

但这是Web安全领域最经典的漏洞之一。假设用户在搜索框输入 `'; DROP TABLE users; --`，拼接后的SQL变成：

```sql
SELECT * FROM users WHERE name = ''; DROP TABLE users; --'
```

分号后面的DROP TABLE会被当作独立的SQL语句执行，表直接没了。这就是SQL注入攻击的基本原理：用户输入被当作SQL代码执行。

参数化查询的原理是：SQL模板和参数分开发送给数据库。数据库先用SQL模板做语法解析和执行计划生成，再把参数填进去。参数在填入时会被当作纯数据值，永远不会被解析为SQL语法结构。所以即使参数里包含 `'; DROP TABLE users; --` 这样的字符串，数据库也只会去找name字段值等于这个字符串的记录，而不会执行DROP TABLE。

来看我们底层执行器的实现：

```python
import psycopg2

class Database:
    def __init__(self, dsn):
        self.conn = psycopg2.connect(dsn)

    def execute(self, sql, params=None):
        cur = self.conn.cursor()
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur
```

psycopg2的cursor.execute天然支持参数化查询，sql模板用%s占位，params以列表形式传入。驱动层会处理所有转义工作，你完全不用操心。

但有一个坑很多人踩过：不是所有的%s都会被参数化。如果你把表名也用%s占位，psycopg2会报错。因为表名是SQL语法结构的一部分，不是参数。参数只能用于值的位置（WHERE条件里的值、SET子句里的值、INSERT的VALUES）。表名、列名、SQL关键字都不能参数化，必须用字符串拼接。

那表名怎么防注入？答案是白名单校验：

```python
ALLOWED_TABLES = {'users', 'orders', 'products'}

def safe_table_name(name):
    if name not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table name: {name}")
    return name
```

白名单是最可靠的防护方案。正则过滤看起来也行，但正则的边界很难定义完美，总有绕过的可能。白名单没有这个问题——不在列表里的直接拒绝，没有任何歧义。

> 参数化查询防的是值注入，结构注入要靠白名单。两条防线缺一不可。安全是一个系统工程，不是一行代码能解决的。

### 1.6 关联查询：select_related与prefetch_related

关联查询是ORM最容易翻车的地方，也是面试官最喜欢问的知识点。我见过太多项目上线后接口响应慢，排查下来全是N+1查询。N+1查询之所以叫这个名字，是因为你本意只想发1条SQL，结果发了N+1条。N是结果集的行数。

N+1问题是怎么产生的？假设你要查询100个订单及其所属用户名称：

```python
# N+1查询：1次查订单 + 100次查用户 = 101次SQL
orders = Order.objects.filter(status='paid')  # 1次查询
for order in orders:
    print(order.user.name)  # 每次访问order.user触发1次查询
```

QuerySet是惰性求值的，第一次查询只拿到了Order表的数据。当你访问 `order.user` 的时候，ORM发现user关联对象还没加载，于是临时再发一条SQL去查User表。100个订单就是100次额外查询。如果每次查询的RTT是2ms，光数据库往返就花了200ms，而实际数据传输可能只需要5ms。

解决方案有两个，分别对应两种不同的策略。

**select_related：用JOIN一次性查出来**

```python
# 1次SQL，JOIN查询
orders = Order.objects.filter(status='paid').select_related('user')
for order in orders:
    print(order.user.name)  # 不再触发额外查询
```

select_related的原理是在SQL层面做LEFT JOIN，把两张表的数据一次性查回来。生成的SQL类似：

```sql
SELECT orders.*, users.*
FROM orders
LEFT JOIN users ON orders.user_id = users.id
WHERE orders.status = 'paid'
```

**prefetch_related：分两次查，用Python做关联**

```python
# 2次SQL，Python层面做关联
orders = Order.objects.filter(status='paid').prefetch_related('user')
for order in orders:
    print(order.user.name)  # 不再触发额外查询
```

prefetch_related的原理完全不同。它先查Order表拿到所有user_id，再去查User表拿到这些用户的资料，最后在Python内存里用字典做匹配。生成的SQL是两条独立的查询：

```sql
SELECT * FROM orders WHERE status = 'paid';
SELECT * FROM users WHERE id IN (1, 2, 3, ..., 100);
```

两种方案怎么选？来看对比：

| 维度 | select_related | prefetch_related |
|------|---------------|-----------------|
| SQL次数 | 1次（JOIN） | 2次（分开查） |
| 数据传输 | 有冗余（JOIN产生重复数据） | 无冗余 |
| 适用场景 | 一对一、多对一（外键） | 一对多、多对多 |
| 内存占用 | 单次结果集较大 | 两次结果集较小 |
| 数据库压力 | 单次大查询 | 两次小查询 |

经验法则：外键关系（多对一）用select_related，反向关系（一对多）和多对多用prefetch_related。为什么？因为JOIN一对多关系会产生笛卡尔积——一个用户有100个订单，JOIN后用户信息重复100次，数据传输量暴增。而prefetch_related分两次查，用户信息只传一次，在Python里做匹配效率更高。

> select_related是JOIN的艺术，prefetch_related是分治的智慧。选错一个，性能差十倍。理解这两种策略的本质，你就理解了ORM关联查询的精髓。

还有一个隐藏的坑值得说：prefetch_related如果不加过滤条件，会把所有关联数据都查回来。比如你查订单的商品列表，但只想要status='paid'的商品。如果直接用prefetch_related('items')，它会把所有状态的商品都查回来，包括已取消的、已退款的。这不仅浪费带宽，还可能导致业务逻辑出错。

正确做法是使用Prefetch对象加过滤条件：

```python
from .query import Prefetch
orders = Order.objects.prefetch_related(
    Prefetch('items', queryset=Item.objects.filter(status='paid'))
)
```

Prefetch的实现核心是在第二次查询时加上额外的WHERE条件，然后在Python层面用过滤后的数据做匹配。这样你拿到的order.items就只有已支付的商品了，既正确又高效。

### 1.7 聚合与分组：annotate与aggregate

聚合查询是SQL的GROUP BY在ORM中的映射。Django提供了两个API：aggregate用于整体聚合（返回一个字典），annotate用于分组聚合（返回QuerySet，每条记录带聚合字段）。两者的区别在于aggregate不分组，对整张表做聚合；annotate按指定的维度分组，每组返回一条记录带聚合结果。

```python
from .aggregates import Count, Sum, Avg, Max, Min

# aggregate：整体聚合，返回字典
User.objects.aggregate(total=Count('id'))
# SELECT COUNT(id) AS total FROM users
# 返回 {'total': 42}

# annotate：分组聚合，返回QuerySet
User.objects.annotate(order_count=Count('orders'))
# SELECT users.*, COUNT(orders.id) AS order_count
# FROM users
# LEFT JOIN orders ON orders.user_id = users.id
# GROUP BY users.id
```

一个更实际的例子：按部门统计平均工资，并按平均工资降序排列：

```python
Department.objects.annotate(
    avg_salary=Avg('employees__salary')
).order_by('-avg_salary')
# SELECT departments.*, AVG(employees.salary) AS avg_salary
# FROM departments
# LEFT JOIN employees ON employees.dept_id = departments.id
# GROUP BY departments.id
# ORDER BY avg_salary DESC
```

聚合函数的实现用模板方法模式：

```python
class Aggregate:
    function = None
    template = '%(function)s(%(field)s)'

    def __init__(self, field):
        self.field = field

    def as_sql(self):
        return self.template % {
            'function': self.function,
            'field': self.field
        }

class Count(Aggregate):
    function = 'COUNT'

class Sum(Aggregate):
    function = 'SUM'

class Avg(Aggregate):
    function = 'AVG'
```

所有聚合函数共享同一个SQL生成模板，只是function名称不同。要加一个新的聚合函数（比如STDDEV标准差），只需要继承Aggregate设置function名，三行代码搞定。这种设计的好处在于扩展时不需要理解基类的实现细节，只需要知道模板的占位符怎么填。这就是模板方法模式在工程实践中的价值——定义骨架，填充细节。

> 聚合查询是把计算下推到数据库的艺术。能在SQL层做的事，不要搬到Python层。数据库做聚合比Python快两个数量级，因为它离数据最近。

## 二、CRUD操作实现：从插入到删除的完整链路

### 2.1 Insert：单条插入、批量插入与Upsert

单条插入是最基础的CRUD操作。但即使是最简单的插入，也有值得深究的细节。

```python
class Manager:
    def create(self, **kwargs):
        obj = self.model(**kwargs)
        obj.save()
        return obj

    def bulk_create(self, objs, batch_size=100):
        sql = self._build_insert_sql(objs[0])
        params_list = [
            [getattr(obj, field) for field in obj._fields]
            for obj in objs
        ]
        results = []
        for i in range(0, len(params_list), batch_size):
            batch = params_list[i:i + batch_size]
            results.extend(self.db.executemany(sql, batch))
        return results
```

批量插入有两个关键点：分批次和batch_size。为什么要分批次？因为数据库对单条SQL的参数数量有限制。PostgreSQL的限制是65535个参数，MySQL的限制取决于max_allowed_packet配置。如果你一次插入10000条数据，每条20个字段，就是200000个参数，直接超限。batch_size设为100是一个比较安全的默认值，既不会超限，也不会产生太多批次。

ON CONFLICT Upsert是PostgreSQL特有的语法，实现"存在则更新，不存在则插入"的原子操作。在MySQL中对应的是INSERT ON DUPLICATE KEY UPDATE。这种操作在数据同步、幂等写入等场景中非常常用。

```python
def upsert(self, conflict_fields, update_fields, **kwargs):
    columns = ', '.join(kwargs.keys())
    placeholders = ', '.join(['%s'] * len(kwargs))
    conflict = ', '.join(conflict_fields)
    update = ', '.join(
        f"{f} = EXCLUDED.{f}" for f in update_fields
    )
    sql = (
        f"INSERT INTO {self.model._table_name} ({columns}) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict}) DO UPDATE SET {update}"
    )
    self.db.execute(sql, list(kwargs.values()))
```

RETURNING子句让你在INSERT后直接拿到生成的数据（比如自增ID），不需要再发一条SELECT：

```python
def create_returning(self, **kwargs):
    columns = ', '.join(kwargs.keys())
    placeholders = ', '.join(['%s'] * len(kwargs))
    sql = (
        f"INSERT INTO {self.model._table_name} ({columns}) "
        f"VALUES ({placeholders}) RETURNING id"
    )
    result = self.db.fetchone(sql, list(kwargs.values()))
    return result[0]
```

我有个学员在写导入功能的时候，用单条create循环插入5000条数据，接口超时了。改成bulk_create后，5000条数据1秒搞定。差距来自网络往返次数：5000次RTT vs 50次RTT（batch_size=100）。每次RTT包括网络延迟加上数据库事务提交的开销，在高并发场景下这个差距会被放大。

> 批量操作的核心不是减少数据量，而是减少网络往返次数。100条SQL各插1条和1条SQL插100条，数据量一样，性能差100倍。

### 2.2 Select：分页查询的两种方案

分页是列表接口的标配。offset/limit分页是最直觉的方案，但在数据量大的时候有严重的性能问题。

```python
# offset/limit分页
def paginate_offset(self, page, page_size):
    offset = (page - 1) * page_size
    return list(
        self.queryset[offset:offset + page_size]
    )
# SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 10000
```

问题在于OFFSET的工作原理：数据库需要扫描并丢弃前OFFSET条记录。当OFFSET=10000时，数据库要扫描10020条记录，丢弃前10000条，返回20条。OFFSET越大，浪费越多。当用户翻到第500页的时候，数据库要扫描10000条记录只为了返回20条，这是极大的浪费。

Keyset分页（游标分页）用上一页最后一条记录的某个排序字段作为过滤条件，避免了OFFSET：

```python
def paginate_keyset(self, last_id, page_size):
    if last_id:
        self.queryset = self.queryset.filter(id__gt=last_id)
    self.queryset = self.queryset.order_by('id')[:page_size]
    return list(self.queryset)
# SELECT * FROM users WHERE id > 10000 ORDER BY id LIMIT 20
```

keyset分页的原理是利用索引的有序性，直接定位到上次查询的末尾位置，然后往后取N条。因为有索引，这个操作是O(log n)的，不管翻到第几页都一样快。

两种方案对比：

| 维度 | offset/limit | keyset |
|------|-------------|--------|
| SQL复杂度 | 简单 | 简单 |
| 深翻页性能 | 差（O(n)） | 好（O(log n)） |
| 支持跳页 | 是 | 否（只能上一页/下一页） |
| 数据稳定性 | 可能重复/遗漏 | 稳定 |
| 排序要求 | 无 | 必须有唯一有序字段 |
| 实现复杂度 | 低 | 中 |

我的建议是：管理后台用offset/limit（需要跳页，数据量可控），面向用户的产品用keyset（性能优先，用户体验好）。微博、朋友圈这种无限滚动场景，keyset分页是标配。如果你做过微博的Feed流，一定对keyset分页深有体会——用户快速滑动时，每一页都必须在50ms内返回，offset分页根本扛不住。

only和defer用于延迟加载字段。有些表的字段很多（比如用户表有头像、签名、简历等大文本字段），但列表接口只需要id和name。如果每次都SELECT *，大文本字段会占用大量带宽和内存：

```python
# 只加载id和name字段
users = User.objects.only('id', 'name').filter(is_active=True)
# SELECT id, name FROM users WHERE is_active = true

# 排除content字段
articles = Article.objects.defer('content').filter(status='published')
# SELECT id, title, author_id, created_at FROM articles
```

defer是only的反面：排除指定字段，加载其余所有字段。两者编译时修改的都是SELECT子句的字段列表。使用场景的区别：当你只需要少数几个字段时用only（白名单模式），当你想排除少数几个字段时用defer（黑名单模式）。

> 延迟加载不是偷懒，是精确控制数据传输量的工程手段。SELECT * 是懒惰的写法，精确指定字段才是工程师的态度。

### 2.3 Update：字段更新与乐观锁

更新操作看似简单，但涉及到并发就变得棘手。先看基本的字段更新：

```python
def update(self, **kwargs):
    set_clauses = []
    params = []
    for field, value in kwargs.items():
        if hasattr(value, 'as_sql'):
            sql = value.as_sql()
            set_clauses.append(f"{field} = {sql[0]}")
            params.extend(sql[1])
        else:
            set_clauses.append(f"{field} = %s")
            params.append(value)
    where_sql, where_params = self._compile_where()
    params.extend(where_params)
    sql = f"UPDATE {self.model._table_name} SET {', '.join(set_clauses)}"
    if where_sql:
        sql += f" WHERE {where_sql}"
    self.db.execute(sql, params)
```

注意这里对F对象的处理。代码检查值是否有as_sql方法，如果有就说明是表达式对象（如F对象），直接把它的SQL拼进SET子句。这就是为什么 `User.objects.update(points=F('points') + 100)` 能生成 `SET points = points + 100`。

乐观锁是一种并发控制策略。它假设冲突很少发生，所以不锁记录，而是在更新时检查版本号。如果版本号变了，说明有其他事务修改了这条记录，更新失败。这种策略在高并发但低冲突的场景下性能极好，因为完全不需要加锁等待。

```python
def update_with_optimistic_lock(self, obj, **kwargs):
    old_version = obj.version
    new_version = old_version + 1
    set_clauses = [f"{k} = %s" for k in kwargs]
    set_clauses.append("version = %s")
    params = list(kwargs.values())
    params.extend([new_version, obj.id, old_version])
    sql = (
        f"UPDATE {self.model._table_name} "
        f"SET {', '.join(set_clauses)} "
        f"WHERE id = %s AND version = %s"
    )
    affected = self.db.execute(sql, params)
    if affected == 0:
        raise OptimisticLockError(
            "Record was modified by another transaction"
        )
    obj.version = new_version
```

乐观锁的实现关键在于WHERE条件里除了id还加了version检查。如果其他事务在这期间修改了这条记录，version已经变了，WHERE条件匹配不到，affected_rows为0。此时业务层可以选择重试或报错。

乐观锁 vs 悲观锁：

| 维度 | 乐观锁 | 悲观锁（SELECT FOR UPDATE） |
|------|--------|--------------------------|
| 适用场景 | 冲突少 | 冲突多 |
| 性能 | 高（无锁等待） | 低（有锁等待） |
| 死锁风险 | 无 | 有 |
| 实现复杂度 | 中 | 低 |
| 失败处理 | 重试或报错 | 等待获取锁 |

选择标准很简单：如果你的系统并发冲突概率低于1%，用乐观锁；如果高于10%，用悲观锁。中间地带看业务容忍度——重试成本低的用乐观锁，重试成本高的用悲观锁。

> 乐观锁不是真的锁，而是一种"先信任后验证"的哲学。它用极低的代价换取了高并发下的数据一致性。

### 2.4 Delete：软删除与级联策略

删除操作在工程实践中几乎不用物理删除。数据是资产，删了就没了。更现实的原因是：很多业务需要"回收站"功能，审计需要追踪数据变更历史，关联数据不允许直接消失。软删除（Soft Delete）用is_deleted标记代替真正的DELETE，是工程上的标准做法。

```python
class SoftDeleteManager(Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)

    def delete(self):
        return self.update(is_deleted=True, deleted_at=datetime.now())

class SoftDeleteModel(Model):
    is_deleted = BooleanField(default=False)
    deleted_at = DateTimeField(null=True)

    objects = SoftDeleteManager()

    def delete(self):
        self.is_deleted = True
        self.deleted_at = datetime.now()
        self.save()
```

SoftDeleteManager覆盖了get_queryset，默认过滤掉已删除的记录。这样业务代码完全无感知，查询自动排除已删除数据。如果需要查询包括已删除的数据（比如回收站功能），可以用一个单独的manager：

```python
class AllObjectsManager(Manager):
    def get_queryset(self):
        return QuerySet(self.model)  # 不加is_deleted过滤

class SoftDeleteModel(Model):
    is_deleted = BooleanField(default=False)
    objects = SoftDeleteManager()     # 默认只看未删除
    all_objects = AllObjectsManager()  # 包含已删除
```

这种双manager的设计在很多生产项目中都能看到。业务代码用objects，管理后台用all_objects，职责分明。

级联删除需要特别处理。当一个用户被删除时，他的订单怎么办？有三种策略：

策略一：级联软删除。把关联数据也标记为已删除。

```python
def cascade_delete(self):
    Order.objects.filter(user_id=self.id).delete()
    self.delete()
```

策略二：置空外键。把关联数据的外键设为NULL。

```python
def nullify_delete(self):
    Order.objects.filter(user_id=self.id).update(user_id=None)
    self.delete()
```

策略三：阻止删除。如果有关联数据，抛出异常。

```python
def protect_delete(self):
    if Order.objects.filter(user_id=self.id).exists():
        raise ValidationError(
            "Cannot delete user with existing orders"
        )
    self.delete()
```

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| CASCADE | 关联数据一起删除 | 强依赖关系 |
| SET_NULL | 外键置空 | 弱关联 |
| PROTECT | 阻止删除 | 需要人工处理 |
| DO_NOTHING | 什么都不做 | 历史数据保留 |

选择哪种策略取决于业务语义。订单和用户是强依赖（订单必须属于某个用户），用CASCADE。浏览记录和用户是弱关联（浏览记录没有用户也能存在），用SET_NULL。而需要审计追溯的场景，用PROTECT最安全。

> 软删除是对数据的尊重，级联策略是对关系的负责。删除不是终点，是数据生命周期的一个状态转换。

## 三、事务管理：从ACID到嵌套Savepoint

### 3.1 ACID特性与隔离级别

事务的ACID特性是数据库可靠性的基石。但很多人只知道ACID四个字母，不清楚它们在实际工程中的含义。怕浪猫在训练营里发现，能完整说出四个特性含义的同学不到三成。

A（原子性）：事务中的操作要么全部成功，要么全部失败。不存在"执行了一半"的中间状态。这是通过undo log实现的，数据库在执行操作前先把旧值记录到undo log，失败时用undo log回滚。转账场景最能体现原子性：扣款和加款必须同时成功或同时失败，不存在扣了款但没加上的情况。

C（一致性）：事务执行前后，数据库从一个一致状态转移到另一个一致状态。一致性是应用层的约束，数据库只提供工具（约束、触发器），真正保证一致性的是你的业务逻辑。比如转账后两个账户的余额总和不变，这就是一致性约束。

I（隔离性）：并发事务之间互不干扰。但实际上完全隔离会严重影响性能，所以数据库提供了不同的隔离级别，在隔离性和性能之间做权衡。这是四个特性中最复杂的，也是最容易出问题的。

D（持久性）：事务提交后，修改永久保存，即使数据库崩溃也不丢失。这是通过redo log和WAL（Write-Ahead Logging）实现的。数据库在修改数据页之前先把变更写入WAL日志，崩溃恢复时重放WAL日志恢复数据。

四个隔离级别：

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 性能 |
|---------|------|----------|------|------|
| Read Uncommitted | 可能 | 可能 | 可能 | 最高 |
| Read Committed | 不可能 | 可能 | 可能 | 高 |
| Repeatable Read | 不可能 | 不可能 | 可能 | 中 |
| Serializable | 不可能 | 不可能 | 不可能 | 最低 |

MySQL默认隔离级别是Repeatable Read，PostgreSQL默认是Read Committed。这个默认值差异经常导致跨数据库迁移时出现行为不一致的问题。曾经有个项目从MySQL迁移到PostgreSQL后，并发场景下出现了数据不一致，排查了三天才发现是隔离级别不同导致的。

三种读异常的解释：脏读是事务A读到了事务B未提交的修改，如果B回滚了，A读到的就是脏数据。不可重复读是事务A先后两次读同一条记录得到不同结果，因为中间事务B修改并提交了这条记录。幻读是事务A先后两次执行同一查询，结果集行数不同，因为中间事务B插入或删除了符合条件的记录。

> 隔离级别不是越高越好，而是在正确性和性能之间找到你的业务能接受的平衡点。银行系统选Serializable，社交网络选Read Committed，各有各的道理。

### 3.2 手动事务管理与上下文管理器

最原始的事务管理是手动调用BEGIN/COMMIT/ROLLBACK：

```python
def transfer_money(from_id, to_id, amount):
    db.execute("BEGIN")
    try:
        db.execute(
            "UPDATE accounts SET balance = balance - %s WHERE id = %s",
            [amount, from_id]
        )
        db.execute(
            "UPDATE accounts SET balance = balance + %s WHERE id = %s",
            [amount, to_id]
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
```

手动管理的问题是：一旦代码逻辑变复杂，很容易忘记ROLLBACK或者COMMIT。而且异常处理的样板代码到处重复，违反DRY原则。更危险的是，如果在COMMIT之前发生了异常但没有被catch到，事务可能一直处于open状态，持有锁不释放，阻塞其他事务。

上下文管理器是Pythonic的解决方案：

```python
class transaction:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.db.execute("BEGIN")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.db.execute("ROLLBACK")
            return False
        try:
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise
        return False
```

用with语法调用，代码清晰且安全：

```python
def transfer_money(from_id, to_id, amount):
    with transaction(db):
        db.execute(
            "UPDATE accounts SET balance = balance - %s WHERE id = %s",
            [amount, from_id]
        )
        db.execute(
            "UPDATE accounts SET balance = balance + %s WHERE id = %s",
            [amount, to_id]
        )
    # 正常退出with块，自动COMMIT
    # 异常退出with块，自动ROLLBACK
```

但这个实现有个问题：__exit__里如果COMMIT失败了，先ROLLBACK再raise，看起来没问题。但如果ROLLBACK也失败了呢？比如数据库连接已经断开了，ROLLBACK也会抛异常。这时候事务可能处于不确定状态。更健壮的实现需要处理这种边缘情况：

```python
def __exit__(self, exc_type, exc_val, exc_tb):
    if exc_type is not None:
        try:
            self.db.execute("ROLLBACK")
        except Exception:
            pass  # 连接已坏，ROLLBACK失败也没关系
        return False
    try:
        self.db.execute("COMMIT")
    except Exception as e:
        try:
            self.db.execute("ROLLBACK")
        except Exception:
            pass
        raise e
    return False
```

这个实现的核心思路是：ROLLBACK失败不传播异常（因为连接已经坏了，数据库会自动回滚），但COMMIT失败必须传播（因为业务需要知道提交失败了）。这种防御性编程在基础设施代码中非常重要，因为你不能假设数据库永远可用。

> 事务管理是工程实践中最容易出错的地方，因为它处理的是失败场景，而失败场景往往最难测试。

### 3.3 装饰器形式与事务传播

除了上下文管理器，装饰器是另一种常见的事务管理方式：

```python
def atomic(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with transaction(get_db()):
            return func(*args, **kwargs)
    return wrapper

@atomic
def transfer_money(from_id, to_id, amount):
    db.execute(
        "UPDATE accounts SET balance = balance - %s WHERE id = %s",
        [amount, from_id]
    )
    db.execute(
        "UPDATE accounts SET balance = balance + %s WHERE id = %s",
        [amount, to_id]
    )
```

装饰器的好处是业务函数不用关心事务边界，调用方也不需要写with语句。但装饰器有一个容易忽略的问题：事务的范围和函数的范围绑定在一起。如果函数里有非数据库操作（比如发邮件、调外部API），这些操作也被包含在事务里了。

```python
@atomic
def place_order(user_id, items):
    order = create_order(user_id, items)
    deduct_inventory(items)
    send_email(user_id, "订单已创建")  # 外部调用
    charge_payment(order.total)       # 外部调用
    return order
```

如果send_email耗时5秒，这5秒内事务一直开着，相关行锁也没释放，其他请求都得等。这就是为什么"事务里不要做外部调用"是一条铁律。正确的做法是把外部调用移到事务外面：

```python
@atomic
def place_order(user_id, items):
    order = create_order(user_id, items)
    deduct_inventory(items)
    return order

# 调用方
order = place_order(user_id, items)
send_email(user_id, "订单已创建")
charge_payment(order.total)
```

> 事务的范围应该尽可能小，小到只包含必须原子化的数据库操作。事务里多一秒，并发性能就少一分。

### 3.4 嵌套事务与Savepoint机制

事务嵌套是一个看起来反直觉但实际很常见的需求。考虑这个场景：批量导入用户数据，每条数据独立处理，一条失败不影响其他。但整个批量操作又需要在一个事务里，保证要么全部处理完要么全部回滚。

```python
@atomic
def batch_import(users):
    success_count = 0
    for user_data in users:
        try:
            create_user(user_data)
            success_count += 1
        except Exception as e:
            log.error(f"Failed to import: {e}")
            continue
    return success_count
```

batch_import是事务A，create_user内部也有事务操作。期望的行为是：create_user失败时只回滚create_user的操作，不影响batch_import。如果用普通的BEGIN/COMMIT，第一个create_user失败后整个事务就进入abort状态，后续所有操作都会报错。这是PostgreSQL的行为：事务中任何错误都会将事务标记为abort，后续SQL直接拒绝执行。

Savepoint机制解决了这个问题。SAVEPOINT在事务内部创建一个标记点，ROLLBACK TO SAVEPOINT只回滚到这个标记点，不回滚整个事务。这样事务可以继续执行后续操作。

```sql
SAVEPOINT sp1
-- 操作1
-- 操作2
ROLLBACK TO SAVEPOINT sp1  -- 只回滚操作1和2
-- 事务继续执行
RELEASE SAVEPOINT sp1       -- 释放savepoint
```

来看嵌套事务的实现：

```python
class SavepointTransaction:
    _savepoint_counter = 0

    def __init__(self, db, using_savepoint=True):
        self.db = db
        self.using_savepoint = using_savepoint
        self.savepoint_id = None

    def __enter__(self):
        if self.using_savepoint:
            SavepointTransaction._savepoint_counter += 1
            self.savepoint_id = f"sp_{self._savepoint_counter}"
            self.db.execute(f"SAVEPOINT {self.savepoint_id}")
        else:
            self.db.execute("BEGIN")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            if self.savepoint_id:
                self.db.execute(
                    f"ROLLBACK TO SAVEPOINT {self.savepoint_id}"
                )
            else:
                self.db.execute("ROLLBACK")
            return False
        if self.savepoint_id:
            self.db.execute(
                f"RELEASE SAVEPOINT {self.savepoint_id}"
            )
        else:
            self.db.execute("COMMIT")
        return False
```

关键逻辑：如果当前已经在事务中（using_savepoint=True），用SAVEPOINT代替BEGIN，用ROLLBACK TO SAVEPOINT代替ROLLBACK，用RELEASE SAVEPOINT代替COMMIT。对调用方来说完全透明——不管是在事务内还是事务外，with语句的用法都一样。

现在batch_import的正确实现：

```python
@atomic
def batch_import(users):
    success_count = 0
    for user_data in users:
        try:
            with SavepointTransaction(db, using_savepoint=True):
                create_user(user_data)
                success_count += 1
        except Exception as e:
            log.error(f"Failed to import: {e}")
    return success_count
```

每个用户创建在独立的savepoint中，失败只回滚到savepoint，不影响外层事务。所有用户处理完后，外层事务提交。如果外层事务回滚（比如最后的某个操作失败），所有已创建的用户也会被回滚——这通常不是你想要的行为。如果你希望成功的保留、失败的跳过，那就不应该用外层事务，而是每个用户一个独立事务。

> Savepoint是事务里的撤销键，它让批量操作有了容错的能力。但能力越大责任越大，明确你的回滚边界在哪里。

### 3.5 事务传播行为与异常处理

事务传播行为定义了一个事务方法被另一个事务方法调用时，事务应该如何传播。Spring框架定义了7种传播行为，但在Python实践中，最常用的有三种。

**REQUIRED（默认）**：如果当前有事务，加入当前事务；如果没有，新建一个事务。这是最常见的行为，也是Django默认的行为。

```python
def atomic_required(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        db = get_db()
        if db.in_transaction:
            with SavepointTransaction(db, using_savepoint=True):
                return func(*args, **kwargs)
        else:
            with transaction(db):
                return func(*args, **kwargs)
    return wrapper
```

**REQUIRES_NEW**：无论当前是否有事务，都新建一个独立事务。外层事务被挂起，内层事务执行完后恢复外层事务。注意REQUIRES_NEW在同一个数据库连接上很难真正实现"独立事务"，因为一个连接只能有一个活跃事务。真正的REQUIRES_NEW需要从连接池获取一个新连接。这也是为什么很多Python框架不提供REQUIRES_NEW传播行为的原因。

**NESTED**：如果当前有事务，创建一个savepoint；如果没有，新建一个事务。和REQUIRED的区别在于，NESTED允许部分回滚——失败时只回滚到savepoint，不回滚整个外层事务。实际上前面我们的SavepointTransaction实现的就是NESTED传播行为。

异常处理是事务管理的重要环节，也是最容易犯错的地方。一个常见的陷阱是捕获了异常但没回滚：

```python
@atomic
def create_order(user_id, items):
    try:
        order = Order.objects.create(user_id=user_id)
        for item in items:
            OrderItem.objects.create(order_id=order.id, **item)
    except Exception as e:
        log.error(f"Order creation failed: {e}")
        return None  # 异常被吞了，事务不会回滚
    return order
```

@atomic装饰器通过__exit__检测异常来决定是否回滚。但异常在try/except里被吞了，__exit__看不到异常，会执行COMMIT。结果可能是Order创建了但OrderItem没创建完整，数据不一致。

正确做法是要么不捕获异常让它传播到事务边界，要么在catch后主动raise：

```python
@atomic
def create_order(user_id, items):
    try:
        order = Order.objects.create(user_id=user_id)
        for item in items:
            OrderItem.objects.create(order_id=order.id, **item)
    except Exception as e:
        log.error(f"Order creation failed: {e}")
        raise  # 重新抛出，让事务回滚
    return order
```

如果确实需要在失败时记录状态并继续执行，用savepoint：

```python
@atomic
def process_all_orders(orders):
    for order_data in orders:
        try:
            with SavepointTransaction(db):
                create_order(order_data)
        except Exception as e:
            log.error(f"Failed: {e}")
            with SavepointTransaction(db):
                record_failure(order_data, str(e))
```

> 异常处理和事务回滚是一体两面。吞掉异常但不回滚事务，等于把数据不一致埋进了系统。这种bug不是立刻爆发的，而是在某次对账时才被发现，排查成本极高。

### 3.6 实战：完整的事务管理模板

把前面所有知识点组合起来，我给训练营的同学总结了一个事务管理模板。这个模板在实际项目中经过多次迭代，覆盖了嵌套事务、savepoint回滚、异常处理和提交后回调。

```python
class TransactionManager:
    def __init__(self, db):
        self.db = db
        self._depth = 0
        self._on_commit_callbacks = []

    @property
    def in_transaction(self):
        return self._depth > 0

    def __enter__(self):
        if self._depth == 0:
            self.db.execute("BEGIN")
        else:
            self._depth += 1
            self.db.execute(f"SAVEPOINT sp_{self._depth}")
        self._depth += 1
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._depth -= 1
        if exc_type is not None:
            if self._depth == 0:
                self.db.execute("ROLLBACK")
            else:
                self.db.execute(
                    f"ROLLBACK TO SAVEPOINT sp_{self._depth + 1}"
                )
            return False
        if self._depth == 0:
            try:
                self.db.execute("COMMIT")
                for cb in self._on_commit_callbacks:
                    cb()
                self._on_commit_callbacks.clear()
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        else:
            self.db.execute(
                f"RELEASE SAVEPOINT sp_{self._depth + 1}"
            )
        return False

    def on_commit(self, callback):
        self._on_commit_callbacks.append(callback)
```

使用示例：

```python
tx = TransactionManager(db)

def import_orders(order_list):
    with tx:
        success = 0
        for data in order_list:
            try:
                with tx:  # 嵌套，创建savepoint
                    order = Order.create(**data)
                    OrderItem.bulk_create(order.id, data['items'])
                    success += 1
            except ValidationError as e:
                log.warning(f"Skip invalid order: {e}")
                continue
        tx.on_commit(
            lambda: notify_team(f"导入完成: {success}条")
        )
```

on_commit的用途很广：发通知、刷缓存、推送消息，这些不需要在事务内执行但需要在事务成功后执行的操作，都可以用on_commit注册。如果事务回滚了，on_commit的回调不会执行——这正是我们想要的行为。失败时不发通知，成功了才通知，这比在代码里手动判断事务状态优雅得多。

> 好的事务管理像呼吸一样自然：你感觉不到它的存在，但它一直在保护你的数据安全。

## 四、实战踩坑记录

### 4.1 坑一：QuerySet复用导致条件污染

这是我在项目里遇到过的真实bug。有一个基础查询函数返回活跃用户：

```python
def get_active_users():
    return User.objects.filter(is_active=True)

admins = get_active_users().filter(role='admin')
vip_users = get_active_users().filter(is_vip=True)
```

在Django中这没问题，因为QuerySet.filter返回clone。但在我们第一版自己实现的QuerySet里，filter修改的是self。于是admins的_filters里多了role='admin'，而vip_users的_filters里既有role='admin'又有is_vip=True。查询结果完全错乱。

修复方案就是前面说的_clone方法。教训：实现链式API时，不可变性是必须的，不是可选的。测试用例必须覆盖"同一基础queryset被多次filter"的场景。

### 4.2 坑二：事务中的异常吞噬

有一次线上数据不一致，排查发现是事务回滚没生效。代码大概是这样：

```python
@atomic
def process_payment(order_id):
    order = Order.objects.get(id=order_id)
    try:
        result = payment_gateway.charge(order.total)
        order.status = 'paid'
        order.save()
    except PaymentError as e:
        log.error(f"Payment failed: {e}")
        order.status = 'failed'
        order.save()
        return False
    return True
```

问题在于PaymentError被catch了，@atomic看不到异常，执行了COMMIT。如果charge和save之间还有其他数据库操作，这些操作也会被错误地提交。修复方案：在catch块里处理完后raise，或者用savepoint隔离可能失败的操作。

### 4.3 坑三：prefetch_related的过滤陷阱

产品需求是查询"每个用户的已支付订单"。第一版代码：

```python
users = User.objects.prefetch_related('orders').all()
for user in users:
    paid_orders = [o for o in user.orders.all() if o.status == 'paid']
```

这有两个问题：一是prefetch_related把所有订单都查回来了，包括未支付的，数据量大；二是在Python层过滤，没用上数据库的索引。改成Prefetch对象后，第二次查询自动加了status='paid'的WHERE条件，数据传输量减少80%，查询速度提升3倍。

> 框架提供的工具就像手术刀，用对了精准高效，用错了伤筋动骨。差之毫厘，谬以千里。

## 五、性能优化清单

最后，怕浪猫给你一份Query Builder性能优化清单，按优先级排序，建议每次code review的时候过一遍：

1. 消灭N+1查询：所有for循环里有跨表访问的地方，逐个排查是否需要select_related或prefetch_related
2. 只查需要的字段：列表接口用only()排除大文本字段，详情接口按需加载
3. 批量代替循环：bulk_create代替循环create，update()代替循环save
4. 用F表达式做原子更新：避免"读出来-改-存回去"的模式
5. 分页用keyset代替深翻页offset：特别是超过10000页之后
6. 事务范围最小化：事务里不调外部API、不发邮件、不做耗时计算
7. 索引覆盖查询：where条件和order by字段要建联合索引
8. count优化：大表count用缓存或近似值，别实时count
9. 延迟关联：深分页场景先查ID再JOIN详情
10. explain分析：上线前对所有复杂查询跑一遍EXPLAIN ANALYZE

> 性能优化不是一次冲刺，而是一场持续的修行。清单不是写完就完了，是每次review时的检查手册。

## 总结

这章我们从Query Builder的底层设计一路讲到事务管理的实战细节。链式调用的不可变性、Q/F对象的表达式树、SQL编译器的递归下降、N+1查询的两种解法、乐观锁与悲观锁的取舍、savepoint的嵌套事务机制，这些知识点不是孤立的，它们共同构成了"如何正确地操作数据库"这一核心工程能力。

如果你正在自己造ORM轮子，这章给了你完整的蓝图。如果你是在用Django或SQLAlchemy，理解这些底层机制能帮你避开90%的性能坑和正确性坑。数据库操作是后端工程师的基本功，基本功不扎实，上层架构做得再漂亮也是空中楼阁。

下一章我们进入异步编程的核心原理。协程、事件循环、async/await的底层实现，这些都是Python进阶路上绕不开的话题。怕浪猫会带你从零实现一个mini事件循环，搞懂异步到底是怎么回事。

这章内容密度很高，建议收藏后反复看。如果在实践中遇到问题，评论区告诉我，怕浪猫逐个回复。

系列进度 5/16，下章预告：异步编程核心原理。

---

怕浪猫说：Query Builder是ORM的灵魂，事务管理是数据安全的底线。把这两件事做对，你已经超过了80%的Python后端开发者。别急，下一章更刺激。
