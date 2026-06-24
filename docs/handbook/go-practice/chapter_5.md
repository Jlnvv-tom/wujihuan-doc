# 第5章：SQL构造与执行，手搓ORM框架那些事儿

## 从一行raw SQL引发的血案说起

去年有个朋友找我看他的Go项目，说上线后隔三差五就panic。我打开代码一看，满屏的`fmt.Sprintf`拼SQL，字符串拼接写得飞起。其中有一段是这样的：

```go
query := fmt.Sprintf("SELECT * FROM users WHERE name = '%s' AND age > %d", name, age)
```

看着挺正常对吧？但如果`name`里传入一个`'; DROP TABLE users; --`，这行代码就成了数据库的催命符。更要命的是，他的项目里有200多处类似的拼接，每次改查询条件都要在字符串海洋里捞针。维护这种代码就像在雷区散步，你不知道下一步会踩到什么。

我当时问他为什么不参数绑定，他说一开始就是拼接的，后来想改发现太多了，牵一发而动全身。这是典型的技术债务恶性循环——越拖越难改，越难改越拖。

> 怕浪猫踩过的坑：字符串拼接SQL不是技术债，是技术炸弹。你不知道它什么时候炸，但我知道它一定会炸。区别只是炸的时候你在不在场。

这章我们要解决的核心问题就是：如何用Go的类型系统来保护SQL构造过程，以及如何把这些能力封装成一个真正能用的ORM框架。不是玩具代码，是能扛住生产环境流量的那种。我们会从最基础的Query Builder开始，一步步加上类型安全、事务管理、连接池管理、SQL日志等工程必备能力，最终用这个框架实现一个博客系统的完整数据层。

我是怕浪猫，这章我们一起来手搓ORM。这个过程会比你想的复杂，也会比你想的有意思。如果你跟着读下来，到章末你会拥有一个完整的、支持嵌套事务的ORM框架，以及一整套在Go项目中操作数据库的最佳实践。

---

## 一、Query Builder设计：让SQL构造变得安全且优雅

### 1.1 为什么需要Query Builder

直接写raw SQL有三个硬伤，每一个都够你在生产环境喝一壶的。

第一个硬伤是SQL注入风险。字符串拼接天然不安全，因为它把"数据"和"代码"混在了一起。这和XSS漏洞的本质是一样的——当用户的输入被当作代码执行，安全问题就不可避免。参数绑定（PreparedStatement）是标准解法，但手写参数绑定太繁琐了，每次查询都要手动维护参数索引，错一个位置就是灾难。

第二个硬伤是可维护性差。想象一下，你有十几个查询条件，每个都是可选的。用字符串拼接的话，你得写一堆if判断来决定要不要加WHERE、要不要加AND。这种代码写出来就是面条代码的温床，逻辑分支多到你自己都看不懂。我见过最夸张的一个查询函数，光是拼接SQL的代码就有300行，if-else嵌套了7层。

第三个硬伤是数据库移植困难。不同数据库的SQL方言差异很大，MySQL用反引号引用标识符，PostgreSQL用双引号，SQL Server用方括号。占位符也不一样，MySQL用问号，PostgreSQL用$1、$2这种带编号的。如果你的SQL是硬编码的，换数据库就意味着重写所有SQL。这在实际项目中几乎是不可能完成的任务。

Query Builder的核心思路是：用结构化的API描述查询意图，由框架负责生成安全的SQL和参数绑定。相当于在你和数据库之间加了一层编译器。你只需要告诉它"我要查询users表，过滤条件是age大于18"，它就帮你生成正确的SQL和参数列表。这层抽象不仅解决了安全问题，还让代码的可读性和可维护性大幅提升。

> 怕浪猫说：好的API设计就像搭积木，每一块都简单到不需要文档，但组合起来能拼出城堡。链式调用的精髓在于"声明意图"而非"描述过程"。你告诉框架你要什么，而不是告诉框架怎么做。

### 1.2 链式调用API设计

链式调用是Query Builder的标志性设计。核心思想是每个方法都返回Builder自身（或新的Builder实例），从而支持方法链式拼接。这种风格在Go语言里特别自然，因为Go的receiver模式天然支持返回自身。

设计链式API有几个关键决策点。第一个是"可变Builder vs 不可变Builder"。可变Builder是每次修改自身并返回，优点是性能好（没有拷贝），缺点是同一个Builder实例不能复用。不可变Builder是每次返回新实例，优点是安全可复用，缺点是有拷贝开销。在实际项目中，我倾向于可变Builder，因为Builder通常是一次性使用的，用完就扔。

第二个决策点是"参数收集策略"。WHERE条件可能有多个参数，Join的ON条件也可能有参数，这些参数最终要按正确顺序传给数据库驱动。我的做法是每个方法在添加条件的同时把参数也收集起来，最后统一传给查询执行器。这里有个容易踩的坑：条件分组时，子条件的参数顺序必须和SQL中占位符的顺序一致，否则参数错位会导致查询结果完全错误。

先定义基础结构：

```go
package query

import (
	"strings"
	"fmt"
)

// Builder 表示一个SQL查询构造器
type Builder struct {
	table     string
	selects   []string
	wheres    []whereClause
	joins     []joinClause
	orderBy   []orderClause
	groupBy   []string
	having    []whereClause
	limit     *int
	offset    *int
	args      []interface{}
	dialect   Dialect
}

// whereClause 表示一个WHERE条件
type whereClause struct {
	connector string // "AND" 或 "OR"
	expr      string
	args      []interface{}
}

// joinClause 表示一个JOIN
type joinClause struct {
	joinType string
	table    string
	on       string
	args     []interface{}
}

// orderClause 表示排序条件
type orderClause struct {
	column string
	dir    string
}

// Dialect 定义数据库方言接口
type Dialect interface {
	Placeholder(index int) string
	QuoteIdentifier(name string) string
}
```

这个结构看起来字段不少，但每个字段都有明确的职责。`table`存储查询的主表，`selects`存储查询字段列表，`wheres`存储WHERE条件链，`joins`存储JOIN信息，`orderBy`和`groupBy`存储排序和分组信息，`limit`和`offset`用于分页，`args`是最终传给数据库驱动的参数列表，`dialect`是数据库方言适配器。

为什么要用指针类型`*int`来表示limit和offset？因为需要区分"未设置"和"设置为0"两种状态。如果用`int`类型，零值是0，你没法知道用户是想跳过0条记录还是根本没设置Offset。用指针的话，nil表示未设置，指向0表示设置为0。这是Go语言里表达"可选值"的常用模式。

然后是链式调用的核心方法实现。每个方法都很简单——修改对应字段，收集参数，然后返回自身：

```go
// Table 设置查询的表名
func (b *Builder) Table(table string) *Builder {
	b.table = table
	return b
}

// Select 设置查询字段
func (b *Builder) Select(columns ...string) *Builder {
	b.selects = append(b.selects, columns...)
	return b
}

// Where 添加AND条件
func (b *Builder) Where(expr string, args ...interface{}) *Builder {
	b.wheres = append(b.wheres, whereClause{
		connector: "AND",
		expr:      expr,
		args:      args,
	})
	b.args = append(b.args, args...)
	return b
}

// OrWhere 添加OR条件
func (b *Builder) OrWhere(expr string, args ...interface{}) *Builder {
	b.wheres = append(b.wheres, whereClause{
		connector: "OR",
		expr:      expr,
		args:      args,
	})
	b.args = append(b.args, args...)
	return b
}

// Join 添加INNER JOIN
func (b *Builder) Join(table, on string, args ...interface{}) *Builder {
	b.joins = append(b.joins, joinClause{
		joinType: "INNER JOIN",
		table:    table,
		on:       on,
		args:     args,
	})
	b.args = append(b.args, args...)
	return b
}

// LeftJoin 添加LEFT JOIN
func (b *Builder) LeftJoin(table, on string, args ...interface{}) *Builder {
	b.joins = append(b.joins, joinClause{
		joinType: "LEFT JOIN",
		table:    table,
		on:       on,
		args:     args,
	})
	b.args = append(b.args, args...)
	return b
}

// OrderBy 添加排序
func (b *Builder) OrderBy(column, dir string) *Builder {
	b.orderBy = append(b.orderBy, orderClause{column: column, dir: dir})
	return b
}

// Limit 设置查询限制
func (b *Builder) Limit(n int) *Builder {
	b.limit = &n
	return b
}

// Offset 设置偏移量
func (b *Builder) Offset(n int) *Builder {
	b.offset = &n
	return b
}

// GroupBy 设置分组
func (b *Builder) GroupBy(columns ...string) *Builder {
	b.groupBy = append(b.groupBy, columns...)
	return b
}

// Having 添加HAVING条件
func (b *Builder) Having(expr string, args ...interface{}) *Builder {
	b.having = append(b.having, whereClause{
		connector: "AND",
		expr:      expr,
		args:      args,
	})
	b.args = append(b.args, args...)
	return b
}
```

这种设计在Go标准库里很常见，比如`strings.Builder`就是典型的链式调用。它的好处是代码读起来像自然语言——"从users表查询，选择id和name字段，过滤条件是age大于18"。对比一下传统的SQL拼接方式，链式调用的可读性优势是压倒性的。

需要注意的是，链式调用虽然优雅，但有一个潜在的性能问题：每次方法调用都会产生一次函数调用的开销。在Go中这个开销很小（Go的函数调用是内联优化的），但在极端高频场景下可能需要考虑。另外，链式调用产生的中间Builder对象会增加GC压力，不过对于数据库操作来说，网络IO才是瓶颈，Builder对象的GC开销可以忽略不计。

还有一点设计考量：方法返回的是指针还是值。我们选择返回指针（`*Builder`），这样所有方法都作用于同一个Builder实例，避免了值拷贝的开销。如果需要不可变Builder（每次方法返回新实例），可以改为返回值类型，但这会带来拷贝开销，在大部分场景下不值得。

使用起来就是这样的风格，非常清晰：

```go
users, err := query.New(&MySQLDialect{}).
    Table("users").
    Select("id", "name", "email").
    Where("age > ?", 18).
    Where("status = ?", "active").
    OrderBy("created_at", "DESC").
    Limit(10).
    Offset(0).
    Get()
```

这段代码即使是不熟悉Go的同事也能一眼看懂它在做什么——查询users表，选择三个字段，过滤条件是年龄大于18且状态为active，按创建时间降序排列，取前10条。相比于一坨raw SQL，这种写法在可读性和安全性上都是质的飞跃。

> 怕浪猫说：好的API设计就像搭积木，每一块都简单到不需要文档，但组合起来能拼出城堡。链式调用的精髓在于"声明意图"而非"描述过程"。你告诉框架你要什么，而不是告诉框架怎么做。

### 1.3 条件构造：Where、And、Or的深层逻辑

上面我们实现了基础的Where和OrWhere，但真实业务场景远比这复杂。考虑这种需求：查询年龄大于18岁，且（VIP用户或注册超过30天的用户）。这种条件需要括号分组，SQL应该是`WHERE age > 18 AND (is_vip = 1 OR register_days > 30)`。

如果只是简单地用Where和OrWhere交替调用，生成的SQL会是`WHERE age > 18 AND is_vip = 1 OR register_days > 30`，由于AND的优先级高于OR，这个SQL的语义和我们要的完全不同。这就是为什么需要条件分组能力。

我们扩展whereClause，引入条件分组的概念：

```go
// WhereGroup 支持条件分组
type WhereGroup struct {
	connector string        // "AND" 或 "OR"
	clauses   []whereClause
}

// 增强版Builder
type Builder struct {
	// ... 前面的字段不变
	wheres []interface{} // 可以是 whereClause 或 WhereGroup
}

// WhereGroup 添加条件分组
func (b *Builder) WhereGroup(connector string, fn func(*Builder)) *Builder {
	subBuilder := &Builder{}
	fn(subBuilder)
	
	group := WhereGroup{
		connector: connector,
		clauses:   subBuilder.wheres,
	}
	b.wheres = append(b.wheres, group)
	b.args = append(b.args, subBuilder.args...)
	return b
}
```

这里用了一个设计技巧：WhereGroup接收一个闭包函数，在闭包内部用一个新的子Builder来构建分组条件。这样分组内的条件可以自由使用Where、OrWhere等方法，而不影响外层Builder的状态。闭包结束后，把子Builder的条件和参数收集到外层。

使用方式：

```go
// WHERE age > 18 AND (is_vip = 1 OR register_days > 30)
b.Table("users").
    Where("age > ?", 18).
    WhereGroup("AND", func(sub *Builder) {
        sub.Where("is_vip = ?", 1).
            OrWhere("register_days > ?", 30)
    })
```

这种闭包式的API设计在Go社区很常见，比如`sync.Once.Do(func(){...})`和`testing.T.Run(name, func(t *testing.T){...})`。它的好处是作用域明确——闭包内构建的内容被自动隔离，不会意外污染外层状态。

条件生成的SQL拼接逻辑也需要相应更新：

```go
// buildWheres 构建WHERE子句
func (b *Builder) buildWheres() (string, []interface{}) {
	if len(b.wheres) == 0 {
		return "", nil
	}

	var parts []string
	var args []interface{}

	for i, w := range b.wheres {
		var part string
		switch clause := w.(type) {
		case whereClause:
			if i > 0 {
				part = clause.connector + " "
			}
			part += clause.expr
			parts = append(parts, part)
			args = append(args, clause.args...)
		case WhereGroup:
			if i > 0 {
				part = clause.connector + " "
			}
			subSQL, subArgs := b.buildGroupWheres(clause)
			part += "(" + subSQL + ")"
			parts = append(parts, part)
			args = append(args, subArgs...)
		}
	}

	return strings.Join(parts, " "), args
}
```

闭包式API还有一个好处是天然支持嵌套——你可以在一个WhereGroup内部再嵌套一个WhereGroup，形成任意深度的条件树。这在处理复杂业务规则时非常有用，比如电商系统中的商品筛选条件可能有多层嵌套逻辑。

> 怕浪猫踩坑实录：之前在实现条件分组时，忘了把子条件的参数加到外层args里，结果参数错位，查询出来的数据全是错的。SQL注入防御做了，但逻辑错了照样出事。参数绑定这件事，index错一个位置就是灾难。后来我写了个测试用例专门验证参数顺序——每个占位符的值是否和预期一致，这才把问题揪出来。调试了整整一个下午才发现这个问题，从那以后我对参数收集逻辑格外小心。后来我写了个测试用例专门验证参数顺序——每个占位符的值是否和预期一致，这才把问题揪出来。

### 1.4 聚合查询：Count、Sum、Avg

聚合查询是日常开发的高频需求。统计用户总数、计算订单总金额、求平均评分——这些操作在SQL层面就是COUNT、SUM、AVG等聚合函数。在Query Builder层面，我们需要为每个聚合函数提供对应的方法。

实现思路很直接：把聚合函数名和字段名拼成SQL表达式，然后用`SELECT 聚合表达式 FROM table WHERE ...`的形式查询，结果Scan到一个变量里。但有几个细节需要注意。

第一，聚合查询不需要ORDER BY和LIMIT，生成SQL时应该跳过这些子句。第二，聚合查询通常返回单行单列，用QueryRow比Query更合适。第三，COUNT返回的是整数，SUM和AVG可能返回浮点数，MAX和MIN的类型取决于字段类型，所以不同聚合方法返回不同类型。

```go
// Count 统计数量
func (b *Builder) Count(column string) (int64, error) {
	sql, args := b.buildAggregate("COUNT", column)
	
	var count int64
	err := b.db.QueryRow(sql, args...).Scan(&count)
	return count, err
}

// Sum 求和
func (b *Builder) Sum(column string) (float64, error) {
	sql, args := b.buildAggregate("SUM", column)
	
	var sum float64
	err := b.db.QueryRow(sql, args...).Scan(&sum)
	return sum, err
}

// Avg 平均值
func (b *Builder) Avg(column string) (float64, error) {
	sql, args := b.buildAggregate("AVG", column)
	
	var avg float64
	err := b.db.QueryRow(sql, args...).Scan(&avg)
	return avg, err
}

// Max 最大值
func (b *Builder) Max(column string) (float64, error) {
	sql, args := b.buildAggregate("MAX", column)
	
	var max float64
	err := b.db.QueryRow(sql, args...).Scan(&max)
	return max, err
}

// Min 最小值
func (b *Builder) Min(column string) (float64, error) {
	sql, args := b.buildAggregate("MIN", column)
	
	var min float64
	err := b.db.QueryRow(sql, args...).Scan(&min)
	return min, err
}

// buildAggregate 构建聚合查询SQL
func (b *Builder) buildAggregate(funcName, column string) (string, []interface{}) {
	expr := fmt.Sprintf("%s(%s)", funcName, column)
	
	var sqlBuilder strings.Builder
	sqlBuilder.WriteString("SELECT ")
	sqlBuilder.WriteString(expr)
	sqlBuilder.WriteString(" FROM ")
	sqlBuilder.WriteString(b.dialect.QuoteIdentifier(b.table))

	// 添加JOIN
	for _, j := range b.joins {
		sqlBuilder.WriteString(" ")
		sqlBuilder.WriteString(j.joinType)
		sqlBuilder.WriteString(" ")
		sqlBuilder.WriteString(j.table)
		sqlBuilder.WriteString(" ON ")
		sqlBuilder.WriteString(j.on)
	}

	// 添加WHERE
	whereSQL, whereArgs := b.buildWheres()
	if whereSQL != "" {
		sqlBuilder.WriteString(" WHERE ")
		sqlBuilder.WriteString(whereSQL)
	}

	// 添加GROUP BY（聚合查询可能带GROUP BY）
	if len(b.groupBy) > 0 {
		sqlBuilder.WriteString(" GROUP BY ")
		sqlBuilder.WriteString(strings.Join(b.groupBy, ", "))
	}

	// 添加HAVING
	if len(b.having) > 0 {
		havingSQL, havingArgs := b.buildHavingSQL()
		sqlBuilder.WriteString(" HAVING ")
		sqlBuilder.WriteString(havingSQL)
		whereArgs = append(whereArgs, havingArgs...)
	}

	return sqlBuilder.String(), whereArgs
}
```

有一个容易忽略的细节：SUM和AVG在没有匹配行时返回NULL，而不是0。如果你直接Scan到float64里，会得到一个扫描错误。解决方案是用`sql.NullFloat64`来接收，或者在SQL层面用`COALESCE(SUM(column), 0)`来处理NULL值。我更倾向于后者，因为这样Go代码里就不需要处理Null类型了。

### 1.5 关联查询：Join与Preload

关联查询是ORM设计中最容易出问题的部分。Join是SQL层面的关联，Preload是ORM层面的关联预加载。两者各有适用场景，理解它们的差异对设计好的数据访问层至关重要。

Join的做法是在一条SQL里通过JOIN子句把多张表关联起来，一次查询拿到所有数据。优点是只需一次数据库交互，网络开销小。缺点是对于has-many关系会产生笛卡尔积——一个用户有100篇文章，JOIN后返回100行，每行都重复了用户信息，数据冗余严重。

Preload的做法是分两次查询：先查主表拿到所有用户ID，再用这些ID去关联表查文章，最后在内存中做组装。优点是没有数据冗余，每个用户信息只查一次。缺点是需要两次或多次数据库交互，且需要在内存中做关联组装。

选择标准很简单：has-one和belongs-to关系用Join（数据不会冗余），has-many和many-to-many关系用Preload（避免笛卡尔积爆炸）。当然，数据量小的时候Join更简单直接，不需要过度设计。

Join的实现前面已经有了基础版本，这里补充完整的SQL生成逻辑：

```go
// buildJoins 构建JOIN子句
func (b *Builder) buildJoins() string {
	if len(b.joins) == 0 {
		return ""
	}

	var parts []string
	for _, j := range b.joins {
		part := fmt.Sprintf("%s %s ON %s", j.joinType, j.table, j.on)
		parts = append(parts, part)
	}
	return strings.Join(parts, " ")
}
```

Preload的设计思路完全不同。它不是在SQL层面做JOIN，而是先查主表，再根据外键批量查关联表，最后在内存中做组装。这种方式特别适合一对多关系的预加载，因为它避免了JOIN带来的数据冗余问题。

```go
// Preload 定义预加载关系
type Preload struct {
	Relation   string
	ForeignKey string
	LocalKey   string
	Type       string // "has_one", "has_many", "belongs_to", "many_to_many"
	Through    string // many_to_many的中间表
	Conditions func(*Builder) // 额外过滤条件
}

// Preload 方法
func (b *Builder) Preload(relation string, fn ...func(*Builder)) *Builder {
	preload := Preload{
		Relation: relation,
	}
	if len(fn) > 0 {
		preload.Conditions = fn[0]
	}
	b.preloads = append(b.preloads, preload)
	return b
}

// executePreloads 执行预加载
func (b *Builder) executePreloads(results interface{}) error {
	resultsVal := reflect.ValueOf(results)
	if resultsVal.Kind() == reflect.Ptr {
		resultsVal = resultsVal.Elem()
	}

	for _, preload := range b.preloads {
		// 解析关联关系元数据
		relation, err := b.getRelationMeta(results, preload.Relation)
		if err != nil {
			return err
		}

		// 收集外键值
		foreignKeys := b.collectKeys(resultsVal, relation.LocalKey)
		if len(foreignKeys) == 0 {
			continue
		}

		// 批量查询关联数据（关键：用IN而不是逐条查询）
		relatedBuilder := NewBuilder(b.db, b.dialect).
			Table(relation.Table).
			Where(relation.ForeignKey+" IN (?)", foreignKeys)

		if preload.Conditions != nil {
			preload.Conditions(relatedBuilder)
		}

		relatedResults, err := relatedBuilder.Get()
		if err != nil {
			return err
		}

		// 在内存中做关联组装
		b.assembleRelations(resultsVal, relatedResults, relation)
	}
	return nil
}
```

Preload实现中最关键的一步是"用IN而不是逐条查询"。如果你有100个用户，每个用户要查文章，逐条查询就是100次数据库交互（这就是臭名昭著的N+1问题）。用IN语句则只需要1次查询：`WHERE user_id IN (1, 2, 3, ..., 100)`。性能差距可能是几十倍甚至上百倍。

SUM和AVG的NULL处理是一个经典陷阱。当表中没有匹配行时，SUM和AVG返回NULL而不是0。如果你直接用float64接收NULL值，数据库驱动会报错。解决方案有两种：一是在Go侧用`sql.NullFloat64`接收然后判断Valid字段；二是在SQL层面用`COALESCE(SUM(column), 0)`把NULL转成0。我更推荐第二种方案，因为它在SQL层面就处理了NULL，Go代码不需要引入额外的类型处理逻辑，代码更简洁。

另外一个需要注意的点是COUNT的行为。`COUNT(*)`会统计所有行（包括NULL值的行），而`COUNT(column)`只统计column非NULL的行。如果你想知道"有多少用户填写了邮箱"，应该用`COUNT(email)`而不是`COUNT(*)`。这个区别看起来微妙，但在数据分析场景中非常重要。

---

## 二、实现类型安全的Query Builder

### 2.1 为什么前面的Builder还不够安全

前面的Builder虽然支持参数绑定（解决了SQL注入问题），但WHERE条件的表达式仍然是字符串，编译器没法帮你检查字段名拼写错误。比如：

```go
b.Where("usrname = ?", name) // usrname 拼错了，编译器不会报错
```

这个错误只有在运行时才会暴露——查询返回空结果或者数据库报错说列不存在。在Go这种强类型语言里，这是一种浪费。我们明明可以用类型系统在编译期就挡住这类错误。

还有更隐蔽的问题：字段类型不匹配。如果你写`Where("age = ?", "eighteen")`，age是整数列但你传了字符串，有些数据库驱动会报错，有些会做隐式转换（可能导致全表扫描）。如果能在编译期就约束参数类型，这类问题就能提前发现。

类型安全的Builder虽然好，但也有一个局限性：Go的泛型不支持方法上的额外类型参数。这意味着我们很难实现类似`Field.In(values ...T)`这种泛型方法（实际上我们上面实现了，但更复杂的场景可能受限）。另外，Go泛型不支持运算符约束，所以我们不能在Field上直接用`>`、`<`等运算符，必须定义Gt、Lt等方法。这和C#的LINQ或Kotlin的类型安全DSL相比，表达能力有一定差距。

不过，对于ORM场景来说，Go泛型的能力已经够用了。Eq、NotEq、Gt、Lt、Like、In这几个方法覆盖了90%以上的查询条件需求。如果你需要更复杂的表达式（比如`age + 1 > 18`），可以回退到字符串模式，用`WhereRaw("age + 1 > ?", 18)`这样的方法。类型安全和灵活性之间永远需要平衡。

> 怕浪猫说：类型安全不是银弹，但它是你写代码时的安全网。编译器能帮你挡住的错误，就不要留到运行时去debug。凌晨三点查拼写错误的SQL，那种痛我不想再体验第二次。类型安全的价值在于"错误前置"——把bug从运行时消灭在编译时。

### 2.2 泛型方案：类型安全的字段引用

Go 1.18引入泛型后，我们可以做更激进的类型安全设计。核心思路是：把数据库字段抽象为强类型的Field对象，Field上的操作方法会约束参数类型，从而在编译期就检查出类型不匹配的问题。

这个设计的灵感来自于C#的LINQ和Java的JOOQ。它们都把数据库表和字段映射为代码中的对象，让你用类型安全的方式构造查询。Go泛型让这种设计成为可能，虽然表达能力不如C#和Java的泛型，但对于ORM场景已经够用了。

```go
package query

import "reflect"

// Field 表示一个类型安全的字段引用
type Field[T any] struct {
	table string
	name  string
}

// StringField 字符串类型字段
type StringField = Field[string]

// IntField 整型字段
type IntField = Field[int]

// Int64Field int64字段
type Int64Field = Field[int64]

// Float64Field float64字段
type Float64Field = Field[float64]

// BoolField 布尔字段
type BoolField = Field[bool]

// NewField 创建一个字段引用
func NewField[T any](table, name string) Field[T] {
	return Field[T]{table: table, name: name}
}

// Expr 生成字段表达式
func (f Field[T]) Expr() string {
	if f.table != "" {
		return f.table + "." + f.name
	}
	return f.name
}

// Eq 等于条件
func (f Field[T]) Eq(value T) Condition {
	return Condition{
		expr: f.Expr() + " = ?",
		args: []interface{}{value},
	}
}

// NotEq 不等于
func (f Field[T]) NotEq(value T) Condition {
	return Condition{
		expr: f.Expr() + " != ?",
		args: []interface{}{value},
	}
}

// Gt 大于
func (f Field[T]) Gt(value T) Condition {
	return Condition{
		expr: f.Expr() + " > ?",
		args: []interface{}{value},
	}
}

// Gte 大于等于
func (f Field[T]) Gte(value T) Condition {
	return Condition{
		expr: f.Expr() + " >= ?",
		args: []interface{}{value},
	}
}

// Lt 小于
func (f Field[T]) Lt(value T) Condition {
	return Condition{
		expr: f.Expr() + " < ?",
		args: []interface{}{value},
	}
}

// Lte 小于等于
func (f Field[T]) Lte(value T) Condition {
	return Condition{
		expr: f.Expr() + " <= ?",
		args: []interface{}{value},
	}
}

// In IN条件
func (f Field[T]) In(values ...T) Condition {
	placeholders := make([]string, len(values))
	args := make([]interface{}, len(values))
	for i, v := range values {
		placeholders[i] = "?"
		args[i] = v
	}
	return Condition{
		expr: f.Expr() + " IN (" + strings.Join(placeholders, ", ") + ")",
		args: args,
	}
}

// Like 模糊匹配
func (f Field[T]) Like(pattern string) Condition {
	return Condition{
		expr: f.Expr() + " LIKE ?",
		args: []interface{}{pattern},
	}
}

// IsNull 判空
func (f Field[T]) IsNull() Condition {
	return Condition{
		expr: f.Expr() + " IS NULL",
		args: nil,
	}
}

// IsNotNull 非空判断
func (f Field[T]) IsNotNull() Condition {
	return Condition{
		expr: f.Expr() + " IS NOT NULL",
		args: nil,
	}
}

// Condition 表示一个查询条件
type Condition struct {
	expr string
	args []interface{}
}
```

这段代码的核心设计是Field泛型结构体。它用类型参数T来约束字段的Go类型。当你在IntField上调用Eq方法时，参数必须是int类型，传字符串直接编译报错。这就是类型安全的本质——用编译器代替人肉检查。

### 2.3 类型安全的Builder与模型定义

基于类型安全的Field，我们重新设计Builder，让它只接受Condition类型作为WHERE条件，而不是裸字符串：

```go
// SafeBuilder 类型安全的查询构造器
type SafeBuilder struct {
	table    string
	selects  []string
	conds    []conditionNode
	joins    []joinClause
	orderBy  []orderClause
	limit    *int
	offset   *int
	args     []interface{}
	dialect  Dialect
}

// conditionNode 条件节点（可以是叶子条件或逻辑组合）
type conditionNode interface {
	apply(b *SafeBuilder)
}

// leafCondition 叶子条件
type leafCondition struct {
	connector string
	cond      Condition
}

func (lc leafCondition) apply(b *SafeBuilder) {
	b.conds = append(b.conds, lc)
	b.args = append(b.args, lc.cond.args...)
}

// groupCondition 分组条件
type groupCondition struct {
	connector string
	children  []conditionNode
}

func (gc groupCondition) apply(b *SafeBuilder) {
	b.conds = append(b.conds, gc)
}

// Where 类型安全的Where
func (b *SafeBuilder) Where(cond Condition) *SafeBuilder {
	b.conds = append(b.conds, leafCondition{
		connector: "AND",
		cond:      cond,
	})
	b.args = append(b.args, cond.args...)
	return b
}

// OrWhere 类型安全的OrWhere
func (b *SafeBuilder) OrWhere(cond Condition) *SafeBuilder {
	b.conds = append(b.conds, leafCondition{
		connector: "OR",
		cond:      cond,
	})
	b.args = append(b.args, cond.args...)
	return b
}

// WhereGroup 类型安全的条件分组
func (b *SafeBuilder) WhereGroup(fn func(*SafeBuilder)) *SafeBuilder {
	sub := &SafeBuilder{dialect: b.dialect}
	fn(sub)
	b.conds = append(b.conds, groupCondition{
		connector: "AND",
		children:  sub.conds,
	})
	b.args = append(b.args, sub.args...)
	return b
}
```

然后定义模型字段常量，让使用方可以直接引用：

```go
// 定义表字段
var Users = struct {
	ID        Field[int64]
	Name      Field[string]
	Email     Field[string]
	Age       Field[int]
	Status    Field[string]
	CreatedAt Field[int64]
}{
	ID:        NewField[int64]("users", "id"),
	Name:      NewField[string]("users", "name"),
	Email:     NewField[string]("users", "email"),
	Age:       NewField[int]("users", "age"),
	Status:    NewField[string]("users", "status"),
	CreatedAt: NewField[int64]("users", "created_at"),
}
```

现在使用起来就是完全类型安全的了：

```go
// 编译器会检查类型！
users, err := NewSafeBuilder(db, &MySQLDialect{}).
    Table("users").
    Select("id", "name", "email").
    Where(Users.Age.Gt(18)).           // int类型，传字符串直接编译报错
    Where(Users.Status.Eq("active")).   // string类型
    WhereGroup(func(b *SafeBuilder) {
        b.Where(Users.Name.Like("%cat%")).
            OrWhere(Users.Email.Like("%@cat.com"))
    }).
    OrderBy("created_at", "DESC").
    Limit(10).
    Get()
```

如果你不小心把字符串传给了Age.Gt，Go编译器会直接报错：`cannot use "eighteen" (untyped string constant) as int value in argument to Users.Age.Gt`。这就是类型安全的价值——把运行时错误变成编译时错误。

### 2.4 方言适配器实现

不同数据库的占位符和标识符引用方式不同，这里实现几个常见方言。方言适配看起来只是占位符和引号的区别，但当你需要从MySQL迁移到PostgreSQL时，这层抽象能帮你省掉几百处SQL修改。

```go
// MySQLDialect MySQL方言
type MySQLDialect struct{}

func (d *MySQLDialect) Placeholder(index int) string {
	return "?"
}

func (d *MySQLDialect) QuoteIdentifier(name string) string {
	return "`" + name + "`"
}

// PostgresDialect PostgreSQL方言
type PostgresDialect struct{}

func (d *PostgresDialect) Placeholder(index int) string {
	return fmt.Sprintf("$%d", index)
}

func (d *PostgresDialect) QuoteIdentifier(name string) string {
	return "\"" + name + "\""
}

// SQLiteDialect SQLite方言
type SQLiteDialect struct{}

func (d *SQLiteDialect) Placeholder(index int) string {
	return "?"
}

func (d *SQLiteDialect) QuoteIdentifier(name string) string {
	return "\"" + name + "\""
}
```

PostgreSQL的占位符是带编号的（$1, $2, $3...），而MySQL和SQLite用的是问号。这个差异在实现SQL生成逻辑时需要特别注意——PostgreSQL的占位符index必须和参数顺序严格对应，而且是从1开始而不是0。这就是为什么Placeholder方法接收一个index参数。

> 怕浪猫说：方言适配看起来只是占位符和引号的区别，但当你需要从MySQL迁移到PostgreSQL时，这层抽象能帮你省掉几百处SQL修改。设计框架时永远多问一句：如果明天换数据库，这块代码要不要改？答案是要改，就说明抽象还不够。

---

## 三、CRUD操作实现：从Insert到Delete的全家桶

### 3.1 Insert：单条插入与批量插入

插入操作是CRUD里最基础的部分，但也有不少讲究。单条插入很简单，批量插入有性能优化的空间，Upsert则解决了"存在则更新、不存在则插入"的原子操作需求。

**单条插入**的核心逻辑是把map或struct转换成INSERT语句。字段名变成列名，字段值变成绑定参数：

```go
// Insert 单条插入
func (b *Builder) Insert(data map[string]interface{}) (int64, error) {
	if len(data) == 0 {
		return 0, fmt.Errorf("insert data is empty")
	}

	columns := make([]string, 0, len(data))
	placeholders := make([]string, 0, len(data))
	args := make([]interface{}, 0, len(data))

	for col, val := range data {
		columns = append(columns, b.dialect.QuoteIdentifier(col))
		placeholders = append(placeholders, b.dialect.Placeholder(len(args)+1))
		args = append(args, val)
	}

	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		b.dialect.QuoteIdentifier(b.table),
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	result, err := b.db.Exec(sql, args...)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}
```

这里有一个Go map遍历的坑：map的遍历顺序是不确定的，所以每次执行时列的顺序可能不同。虽然不影响正确性（参数和列是配对的），但生成的SQL文本会变化，不利于SQL缓存和日志分析。解决方案是用有序的数据结构（比如slice）来存储字段顺序，或者在生成SQL前对列名排序。

**批量插入**的性能优势非常明显。插入100条记录，逐条插入需要100次数据库交互（100次网络往返），批量插入只需要1次。在局域网环境下，这个差距可能是10倍；在跨网络环境下（比如应用和数据库在不同可用区），差距可能达到50倍甚至更多。

```go
// InsertBatch 批量插入
func (b *Builder) InsertBatch(data []map[string]interface{}) (int64, error) {
	if len(data) == 0 {
		return 0, fmt.Errorf("batch insert data is empty")
	}

	// 用第一条数据的key作为列名（所有数据的key应该一致）
	first := data[0]
	columns := make([]string, 0, len(first))
	for col := range first {
		columns = append(columns, b.dialect.QuoteIdentifier(col))
	}

	// 构建每行的占位符
	var rowPlaceholders []string
	var args []interface{}
	for _, row := range data {
		placeholders := make([]string, 0, len(columns))
		for _, col := range columns {
			rawCol := strings.Trim(col, "`\"")
			placeholders = append(placeholders, b.dialect.Placeholder(len(args)+1))
			args = append(args, row[rawCol])
		}
		rowPlaceholders = append(rowPlaceholders, "("+strings.Join(placeholders, ", ")+")")
	}

	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES %s",
		b.dialect.QuoteIdentifier(b.table),
		strings.Join(columns, ", "),
		strings.Join(rowPlaceholders, ", "),
	)

	result, err := b.db.Exec(sql, args...)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected()
}
```

批量插入有一个限制需要注意：SQL语句的长度和参数数量都有上限。MySQL默认`max_allowed_packet`是4MB，PostgreSQL参数上限是65535个。如果批量插入的数据量很大，需要分批执行，比如每1000条执行一次。

**Upsert**是INSERT ON CONFLICT UPDATE的简称，解决"存在则更新，不存在则插入"的原子操作需求。典型场景是用户注册时的"邀请码使用"——如果邀请码已存在则更新使用次数，不存在则插入新记录。这种"先检查再插入"的模式在并发环境下是错误的——两个请求同时检查到邀请码不存在，然后同时插入，导致重复数据。Upsert通过数据库的原子操作来避免这个问题，它是真正的"不存在则插入，存在则更新"，整个过程是一个原子操作，不需要加锁。

```go
// Upsert 插入或更新
func (b *Builder) Upsert(data map[string]interface{}, onConflict []string) error {
	if len(data) == 0 {
		return fmt.Errorf("upsert data is empty")
	}

	columns := make([]string, 0, len(data))
	placeholders := make([]string, 0, len(data))
	args := make([]interface{}, 0, len(data))
	var updateParts []string

	for col, val := range data {
		columns = append(columns, b.dialect.QuoteIdentifier(col))
		placeholders = append(placeholders, b.dialect.Placeholder(len(args)+1))
		args = append(args, val)
	}

	// 构建冲突时的更新语句
	for _, col := range onConflict {
		quotedCol := b.dialect.QuoteIdentifier(col)
		updateParts = append(updateParts,
			fmt.Sprintf("%s = VALUES(%s)", quotedCol, quotedCol))
	}

	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s",
		b.dialect.QuoteIdentifier(b.table),
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(updateParts, ", "),
	)

	_, err := b.db.Exec(sql, args...)
	return err
}
```

> 怕浪猫踩坑实录：Upsert在MySQL里是`ON DUPLICATE KEY UPDATE`，在PostgreSQL里是`ON CONFLICT DO UPDATE`，在SQLite里也是`ON CONFLICT DO UPDATE`但语法略有不同。别问我怎么记住的，问就是踩过坑。所以方言抽象这件事，不是"锦上添花"，是"必须做"。每个方言都应该有自己的Upsert SQL生成逻辑。

### 3.2 Select：从单条到分页

查询是CRUD中使用频率最高的操作。单条查询用`First`，列表查询用`Get`/`GetMany`，分页查询用`Paginate`。每个方法都有其适用场景和注意事项。

**单条查询**需要注意"未找到记录"的处理。`database/sql`的`QueryRow`在未找到记录时返回`sql.ErrNoRows`，这个错误需要特殊处理——有些业务场景下"未找到"是正常的（比如查用户是否存在），不应该当作错误抛出。

```go
// First 查询第一条记录
func (b *Builder) First(dest interface{}) error {
	b.Limit(1)
	sql, args := b.buildSelect()

	row := b.db.QueryRow(sql, args...)
	return b.scanRow(row, dest)
}

// FindByID 根据ID查询单条
func (b *Builder) FindByID(id interface{}, dest interface{}) error {
	return b.Where("id = ?", id).First(dest)
}
```

**列表查询**的核心是结果集扫描。要把`*sql.Rows`扫描到Go的struct slice里，需要通过反射动态创建struct实例、匹配列名和字段名、逐行扫描。这个过程中有几个容易出错的点：列名和字段名的映射（snake_case到CamelCase）、NULL值处理（指针类型vs值类型）、类型转换（数据库驱动的类型到Go类型的转换）。

```go
// GetMany 查询多条记录并扫描到切片
func (b *Builder) GetMany(dest interface{}) error {
	sql, args := b.buildSelect()
	rows, err := b.db.Query(sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	return b.scanRows(rows, dest)
}

// scanRows 将rows扫描到目标切片
func (b *Builder) scanRows(rows *sql.Rows, dest interface{}) error {
	destVal := reflect.ValueOf(dest)
	if destVal.Kind() != reflect.Ptr || destVal.Elem().Kind() != reflect.Slice {
		return fmt.Errorf("dest must be a pointer to slice")
	}

	sliceVal := destVal.Elem()
	elemType := sliceVal.Type().Elem()

	// 获取列信息
	columns, err := rows.Columns()
	if err != nil {
		return err
	}

	for rows.Next() {
		elem := reflect.New(elemType).Elem()

		modelType := elem
		if elem.Kind() == reflect.Ptr {
			modelType = elem.Elem()
		}

		// 构建scan目标
		scanDest := make([]interface{}, len(columns))
		fieldMap := b.getFieldMap(modelType)

		for i, col := range columns {
			if field, ok := fieldMap[col]; ok {
				scanDest[i] = field.Addr().Interface()
			} else {
				var dummy interface{}
				scanDest[i] = &dummy
			}
		}

		if err := rows.Scan(scanDest...); err != nil {
			return err
		}

		sliceVal = reflect.Append(sliceVal, elem)
	}

	destVal.Elem().Set(sliceVal)
	return rows.Err()
}
```

**分页查询**是日常开发的高频操作，封装一个通用的分页方法能省很多重复代码。分页的标准做法是先查总数再查列表，但这里有一个性能陷阱——`SELECT COUNT(*)`在大表上可能很慢，特别是带WHERE条件时。如果你的表数据量超过百万级，考虑用缓存或者估算的方式来获取总数。

```go
// Pagination 分页结果
type Pagination struct {
	List     interface{} `json:"list"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
	Pages    int         `json:"pages"`
}

// Paginate 分页查询
func (b *Builder) Paginate(page, pageSize int, dest interface{}) (*Pagination, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	// 查询总数
	total, err := b.Count("*")
	if err != nil {
		return nil, err
	}

	// 计算总页数
	pages := int((total + int64(pageSize) - 1) / int64(pageSize))

	// 查询当前页数据
	offset := (page - 1) * pageSize
	err = b.Limit(pageSize).Offset(offset).GetMany(dest)
	if err != nil {
		return nil, err
	}

	return &Pagination{
		List:     dest,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		Pages:    pages,
	}, nil
}
```

> 怕浪猫说：分页查询看起来简单，但深分页是个性能杀手。LIMIT 1000000, 10 这种查询，数据库要扫描1000010行才返回10行。生产环境遇到深分页，要么用游标分页（WHERE id > last_id LIMIT 10），要么用延迟关联策略。别等慢查询告警了才想起来优化。

深分页的优化策略值得展开说一下。假设你有一个1000万条记录的posts表，用户翻到了第10000页（每页10条），OFFSET就是99990。MySQL的执行过程是：扫描前99990条记录（全部丢弃），再扫描10条返回。这简直是在浪费生命。

游标分页的解法是：记住上一页最后一条记录的ID，下一页用`WHERE id > last_id ORDER BY id ASC LIMIT 10`。这样MySQL只需要从last_id的位置开始扫描10条，不管你翻到第几页，性能都是恒定的。缺点是不能跳页——你只能上一页、下一页地翻。

延迟关联的解法是：先用子查询拿到目标页的ID，再关联回原表取数据。`SELECT * FROM posts WHERE id IN (SELECT id FROM posts ORDER BY id ASC LIMIT 10 OFFSET 99990)`。子查询走索引覆盖扫描，比全表扫描快得多。

### 3.3 Update：字段更新与乐观锁

更新操作看似简单，但在并发环境下有大量坑。最常见的问题是"更新丢失"——两个请求同时读取同一条记录，各自修改不同字段后写回，后写的会覆盖先写的修改。

**基础更新**的实现：

```go
// Update 更新数据
func (b *Builder) Update(data map[string]interface{}) (int64, error) {
	if len(data) == 0 {
		return 0, fmt.Errorf("update data is empty")
	}

	var setParts []string
	var args []interface{}

	for col, val := range data {
		setParts = append(setParts,
			fmt.Sprintf("%s = %s",
				b.dialect.QuoteIdentifier(col),
				b.dialect.Placeholder(len(args)+1)))
		args = append(args, val)
	}

	// 添加WHERE条件
	whereSQL, whereArgs := b.buildWheres()
	if whereSQL != "" {
		args = append(args, whereArgs...)
	}

	sql := fmt.Sprintf("UPDATE %s SET %s",
		b.dialect.QuoteIdentifier(b.table),
		strings.Join(setParts, ", "))

	if whereSQL != "" {
		sql += " WHERE " + whereSQL
	}

	result, err := b.db.Exec(sql, args...)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected()
}
```

**乐观锁**是解决"更新丢失"问题的方案之一。它的核心思路是：在记录中增加一个version字段，每次更新时version+1，并且WHERE条件中带上当前version。如果更新影响了0行，说明version不匹配——有其他人已经修改了这条记录。

乐观锁相比悲观锁（SELECT FOR UPDATE）的优势是不锁定资源，性能更好。适合"冲突少"的场景——大部分时候不会有并发冲突，偶尔冲突了重试就行。如果是"冲突多"的场景，乐观锁的频繁重试反而比悲观锁更差。

```go
// OptimisticUpdate 乐观锁更新
func (b *Builder) OptimisticUpdate(id int64, data map[string]interface{}, version int) error {
	data["version"] = version + 1

	sql, args := b.buildOptimisticUpdateSQL(id, version)

	result, err := b.db.Exec(sql, args...)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return ErrOptimisticLock
	}

	return nil
}
```

使用方式：

```go
// 先查出当前数据（包含version）
user := &User{}
err := builder.Table("users").FindByID(1, user)
if err != nil {
    log.Fatal(err)
}

// 修改字段
updateData := map[string]interface{}{
    "name":  "怕浪猫",
    "email": "cat@pailang.com",
}

// 乐观锁更新
err = builder.Table("users").OptimisticUpdate(user.ID, updateData, user.Version)
if err == ErrOptimisticLock {
    fmt.Println("数据已被其他人修改，请重试")
    // 这里通常的做法是：重新获取数据，重新计算修改，再次尝试更新
    // 可以设置一个最大重试次数，避免无限重试
}
```

> 怕浪猫说：乐观锁和悲观锁的选择标准很简单——冲突少用乐观锁（CAS机制，性能好），冲突多用悲观锁（SELECT FOR UPDATE，确保一致性）。但不管选哪个，一定要在业务层处理冲突重试逻辑，否则锁就是摆设。用户看到一个"请重试"的提示，比数据被悄悄覆盖好得多。

### 3.4 Delete：软删除与物理删除

删除操作在设计时需要做一个重要决策：物理删除还是软删除。物理删除是`DELETE FROM`直接删数据，软删除是`UPDATE SET deleted_at = NOW()`标记删除。两种方式各有优劣。

物理删除的优点是干净利落，数据真的没了，不占存储空间。缺点是不可恢复，且可能破坏外键引用完整性——如果其他表有外键引用了被删除的记录，那些关联记录就成了孤儿数据。

软删除的优点是可恢复（"回收站"功能），不破坏引用完整性。缺点是数据一直占空间，且所有查询都要自动过滤`WHERE deleted_at IS NULL`，容易遗漏。

我倾向于默认使用软删除。数据是有价值的，删除容易恢复难。物理删除应该是显式选择，不是默认行为。

```go
// Delete 删除（自动判断软删除）
func (b *Builder) Delete() (int64, error) {
	whereSQL, whereArgs := b.buildWheres()
	if whereSQL == "" {
		return 0, fmt.Errorf("delete without where clause is not allowed")
	}

	// 检查是否有软删除字段
	if b.hasSoftDeleteColumn() {
		now := time.Now()
		args := append([]interface{}{now}, whereArgs...)
		sql := fmt.Sprintf("UPDATE %s SET deleted_at = %s WHERE %s AND deleted_at IS NULL",
			b.dialect.QuoteIdentifier(b.table),
			b.dialect.Placeholder(1),
			whereSQL,
		)
		result, err := b.db.Exec(sql, args...)
		if err != nil {
			return 0, err
		}
		return result.RowsAffected()
	}

	// 物理删除
	sql := fmt.Sprintf("DELETE FROM %s WHERE %s",
		b.dialect.QuoteIdentifier(b.table),
		whereSQL,
	)
	result, err := b.db.Exec(sql, whereArgs...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// Restore 恢复软删除的记录
func (b *Builder) Restore() (int64, error) {
	whereSQL, whereArgs := b.buildWheres()
	if whereSQL == "" {
		return 0, fmt.Errorf("restore without where clause is not allowed")
	}

	sql := fmt.Sprintf("UPDATE %s SET deleted_at = NULL WHERE %s",
		b.dialect.QuoteIdentifier(b.table),
		whereSQL,
	)

	result, err := b.db.Exec(sql, whereArgs...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
```

有一个重要的安全措施：不允许没有WHERE条件的删除操作。上面的代码在whereSQL为空时直接返回错误。这是为了防止手滑写出`DELETE FROM users`这种删库跑路的操作。同样，Update操作也应该有这个保护。

> 怕浪猫踩坑实录：之前有个项目同时用了软删除和唯一索引，结果删除后再插入同名记录报唯一键冲突。比如users表有`UNIQUE(email)`，用户删除后email字段还在（只是deleted_at有值了），再注册同一个email就报错。解决方案是把唯一索引改成联合索引`UNIQUE(email, deleted_at)`，这样软删除后deleted_at有了值，就不会和新的记录冲突了。软删除的坑比你想的多，设计时一定要想清楚。

---

## 四、事务管理：ACID不是背概念那么简单

### 4.1 事务ACID特性回顾

在面试里被问ACID定义不难，但在代码里正确使用事务却不容易。先明确几个概念：

**原子性（Atomicity）**：事务内的操作要么全部成功，要么全部回滚。不存在"部分成功"的状态。比如转账操作，扣款和加款必须在同一个事务里，要么都成功，要么都失败。

**一致性（Consistency）**：事务执行前后，数据必须从一个合法状态变成另一个合法状态。比如转账后双方的余额总和应该和转账前一致。一致性是由应用层的业务规则和数据库的约束共同保证的。

**隔离性（Isolation）**：并发事务之间互不干扰。数据库通过不同的隔离级别来平衡并发性和一致性：读未提交（Read Uncommitted）、读已提交（Read Committed）、可重复读（Repeatable Read）、串行化（Serializable）。MySQL默认是可重复读，PostgreSQL默认是读已提交。

**持久性（Durability）**：事务提交后数据永久保存，即使数据库崩溃也不会丢失。这依赖于WAL（Write-Ahead Log）机制——事务修改先写日志再写数据页，崩溃后可以通过日志恢复。

Go的`database/sql`包提供了基本的事务支持，只需要三个方法：`Begin`开始事务，`Commit`提交事务，`Rollback`回滚事务。事务对象`*sql.Tx`实现了和`*sql.DB`相同的`Query`、`Exec`等方法，所以你在事务中执行查询的方式和非事务完全一样，这降低了心智负担。

```go
tx, err := db.Begin()
// ... 在tx上执行操作
err = tx.Commit()
// 或出错时
err = tx.Rollback()
```

但这远远不够。真实业务场景需要事务传播行为、嵌套事务、超时控制等高级特性。这些能力是`database/sql`不提供的，需要ORM框架来封装。

### 4.2 事务传播行为

事务传播行为定义了一个事务方法被另一个事务方法调用时，如何处理事务上下文。这个概念来自Spring框架，但Go项目同样需要。

想象一个场景：`CreateOrder`方法有自己的事务，它调用了`DeductInventory`方法，`DeductInventory`方法也有自己的事务。当`DeductInventory`失败时，是只回滚库存扣减还是把整个订单创建也回滚？这取决于事务传播行为的配置。

```go
// Propagation 事务传播行为
type Propagation int

const (
	// PropagationRequired 如果当前没有事务，就新建一个；如果有，就加入当前事务（默认）
	PropagationRequired Propagation = iota

	// PropagationRequiresNew 不管当前有没有事务，都新建一个独立事务
	PropagationRequiresNew

	// PropagationNested 嵌套事务，通过Savepoint实现
	PropagationNested

	// PropagationSupports 如果当前有事务就加入，没有就非事务执行
	PropagationSupports

	// PropagationNever 如果当前有事务就报错
	PropagationNever

	// PropagationMandatory 如果当前没有事务就报错
	PropagationMandatory
)
```

最常用的是前三种。`PropagationRequired`是默认行为——有事务就加入，没事务就新建。适用于大部分场景。`PropagationRequiresNew`总是新建独立事务——适用于日志记录等不能被外层事务回滚影响的操作。`PropagationNested`是嵌套事务——适用于部分失败不影响整体的操作。

> 怕浪猫说：事务传播行为听起来是Java Spring的概念，但Go项目同样需要。当你的Service层方法互相调用，每个方法都有自己的事务逻辑，没有传播行为管理，事务边界就会混乱。这不是"学Java"，是"工程必须"。

### 4.3 嵌套事务实现（Savepoint）

嵌套事务的核心是利用数据库的SAVEPOINT机制。SAVEPOINT允许在事务内部设置保存点，可以回滚到保存点而不是回滚整个事务。这就像游戏里的"存档点"——你可以回到存档点重玩，而不是从头开始。

理解SAVEPOINT的执行流程很重要：

```sql
BEGIN;                          -- 外层事务开始
  INSERT INTO logs ...          -- 操作1：写入日志
  SAVEPOINT sp1;                -- 设置保存点
    UPDATE users ...            -- 操作2：更新用户
  ROLLBACK TO sp1;             -- 回滚到保存点，操作2被撤销，操作1保留
  INSERT INTO orders ...        -- 操作3：创建订单
COMMIT;                         -- 外层事务提交，操作1和3生效，操作2被回滚
```

SAVEPOINT的关键特性是"局部回滚"——回滚到Savepoint不影响Savepoint之前的操作，也不影响外层事务。这使得我们可以在事务内部实现"可失败的子操作"：子操作失败时回滚到Savepoint，但外层事务可以继续执行其他操作。

### 4.4 实现事务管理器

下面是完整的事务管理器实现。这是整个ORM框架中最复杂的部分，但也是最核心的价值所在。事务管理器负责根据传播行为决定是新建事务、加入已有事务、还是创建嵌套Savepoint。

```go
package orm

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

// ErrTransactionRolledBack 事务已回滚
var ErrTransactionRolledBack = fmt.Errorf("transaction has been rolled back")

// TransactionManager 事务管理器
type TransactionManager struct {
	db *sql.DB
	mu sync.Mutex
}

// NewTransactionManager 创建事务管理器
func NewTransactionManager(db *sql.DB) *TransactionManager {
	return &TransactionManager{db: db}
}

// TxContext 事务上下文
type TxContext struct {
	tx          *sql.Tx
	savepoints  []string
	spCounter   int
	propagation Propagation
	parent      *TxContext
	rolledBack  bool
	completed   bool
}

// TransactionOptions 事务选项
type TransactionOptions struct {
	Propagation Propagation
	Isolation   sql.IsolationLevel
	ReadOnly    bool
	Timeout     int // 秒，0表示不超时
}

// DefaultTxOptions 默认事务选项
func DefaultTxOptions() TransactionOptions {
	return TransactionOptions{
		Propagation: PropagationRequired,
		Isolation:   sql.LevelDefault,
		ReadOnly:    false,
		Timeout:     0,
	}
}

// currentTxKey 事务上下文的context key
type currentTxKey struct{}

// ExecuteInTx 在事务中执行函数
func (tm *TransactionManager) ExecuteInTx(
	ctx context.Context,
	opts TransactionOptions,
	fn func(ctx context.Context) error,
) error {
	// 获取当前事务上下文
	currentTx := tm.getTxFromContext(ctx)

	// 根据传播行为决定如何处理
	switch opts.Propagation {
	case PropagationRequired:
		if currentTx != nil && !currentTx.rolledBack {
			return tm.executeInExistingTx(ctx, currentTx, fn)
		}
		return tm.executeInNewTx(ctx, opts, fn)

	case PropagationRequiresNew:
		return tm.executeInNewTx(ctx, opts, fn)

	case PropagationNested:
		if currentTx != nil && !currentTx.rolledBack {
			return tm.executeInNestedTx(ctx, currentTx, fn)
		}
		return tm.executeInNewTx(ctx, opts, fn)

	case PropagationSupports:
		if currentTx != nil && !currentTx.rolledBack {
			return tm.executeInExistingTx(ctx, currentTx, fn)
		}
		return fn(ctx)

	case PropagationNever:
		if currentTx != nil && !currentTx.rolledBack {
			return fmt.Errorf("existing transaction found, but PropagationNever requires none")
		}
		return fn(ctx)

	case PropagationMandatory:
		if currentTx == nil || currentTx.rolledBack {
			return fmt.Errorf("no existing transaction found, but PropagationMandatory requires one")
		}
		return tm.executeInExistingTx(ctx, currentTx, fn)

	default:
		return fmt.Errorf("unknown propagation: %d", opts.Propagation)
	}
}
```

事务管理器的核心逻辑在`ExecuteInTx`方法里。它首先从context中获取当前事务上下文（如果存在的话），然后根据传播行为决定如何处理。这个设计利用了Go的context传递机制——事务上下文通过context在调用链中传递，不需要全局变量或者显式参数传递。

`executeInNewTx`负责创建新事务、执行业务函数、根据结果提交或回滚：

```go
// executeInNewTx 在新事务中执行
func (tm *TransactionManager) executeInNewTx(
	ctx context.Context,
	opts TransactionOptions,
	fn func(context.Context) error,
) error {
	var tx *sql.Tx
	var err error

	if opts.Isolation == sql.LevelDefault {
		tx, err = tm.db.BeginTx(ctx, nil)
	} else {
		tx, err = tm.db.BeginTx(ctx, &sql.TxOptions{
			Isolation: opts.Isolation,
			ReadOnly:  opts.ReadOnly,
		})
	}
	if err != nil {
		return fmt.Errorf("begin transaction failed: %w", err)
	}

	if opts.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(opts.Timeout)*time.Second)
		defer cancel()
	}

	txCtx := &TxContext{
		tx:          tx,
		propagation: opts.Propagation,
	}
	ctx = context.WithValue(ctx, currentTxKey{}, txCtx)

	err = fn(ctx)
	if err != nil {
		if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
			return fmt.Errorf("exec failed: %w, rollback failed: %v", err, rbErr)
		}
		txCtx.rolledBack = true
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}

	txCtx.completed = true
	return nil
}
```

`executeInNestedTx`是嵌套事务的核心实现，通过SAVEPOINT实现局部回滚：

```go
// executeInNestedTx 在嵌套事务中执行（Savepoint）
func (tm *TransactionManager) executeInNestedTx(
	ctx context.Context,
	parentTx *TxContext,
	fn func(context.Context) error,
) error {
	if parentTx.rolledBack {
		return ErrTransactionRolledBack
	}

	// 创建Savepoint
	parentTx.spCounter++
	spName := fmt.Sprintf("sp_%d", parentTx.spCounter)
	parentTx.savepoints = append(parentTx.savepoints, spName)

	_, err := parentTx.tx.ExecContext(ctx, fmt.Sprintf("SAVEPOINT %s", spName))
	if err != nil {
		return fmt.Errorf("create savepoint %s failed: %w", spName, err)
	}

	childTx := &TxContext{
		tx:          parentTx.tx,
		propagation: PropagationNested,
		parent:      parentTx,
	}
	ctx = context.WithValue(ctx, currentTxKey{}, childTx)

	err = fn(ctx)
	if err != nil {
		_, rbErr := parentTx.tx.ExecContext(ctx,
			fmt.Sprintf("ROLLBACK TO SAVEPOINT %s", spName))
		if rbErr != nil {
			return fmt.Errorf("exec failed: %w, rollback to savepoint failed: %v",
				err, rbErr)
		}
		return err
	}

	_, err = parentTx.tx.ExecContext(ctx,
		fmt.Sprintf("RELEASE SAVEPOINT %s", spName))
	if err != nil {
		return fmt.Errorf("release savepoint %s failed: %w", spName, err)
	}

	return nil
}
```

使用示例——创建用户并记录日志，日志失败不影响用户创建：

```go
err := tm.ExecuteInTx(context.Background(), DefaultTxOptions(),
    func(ctx context.Context) error {
        // 操作1：创建用户
        _, err := GetTx(ctx).Exec(
            "INSERT INTO users (name, email) VALUES (?, ?)",
            "怕浪猫", "cat@pailang.com")
        if err != nil {
            return err
        }

        // 嵌套事务：记录日志（失败不影响用户创建）
        err = tm.ExecuteInTx(ctx, TransactionOptions{
            Propagation: PropagationNested,
        }, func(ctx context.Context) error {
            _, err := GetTx(ctx).Exec(
                "INSERT INTO logs (action, target) VALUES (?, ?)",
                "register", "user:1")
            return err
        })
        if err != nil {
            log.Printf("log failed: %v", err)
            // 不返回error，让外层事务继续提交
        }

        return nil
    })
```

> 怕浪猫说：嵌套事务是事务管理里的"高级技能点"。理解Savepoint机制是关键——它不是新开一个事务，而是在当前事务内设一个标记点，可以局部回滚。就像写代码时的Ctrl+Z，不是撤销所有操作，而是撤销到某个历史点。这个能力让你可以优雅地处理"部分失败"场景，而不是粗暴地全量回滚。

---

## 五、实战项目：手写ORM框架实现博客系统数据层

理论讲够了，现在开始实战。我们要手搓一个迷你ORM框架，并用它实现博客系统的数据层。这不是Demo，是能跑在生产环境的设计。每一块代码都经过深思熟虑，有明确的设计意图。

### 5.1 ORM核心架构设计

先看整体架构，理解各模块的职责和关系：

```
+---------------------------------------------+
|              应用层 (Blog Service)            |
+---------------------------------------------+
|          ORM API (链式调用入口)               |
+------+------+------+-------+----------------+
|Session|Query | CRUD |  Tx   |   Schema      |
|      |Builder|      |Manager|   Meta         |
+------+------+------+------+-----------------+
|            Dialect (数据库方言)               |
+---------------------------------------------+
|         database/sql (标准库)                |
+---------------------------------------------+
|          驱动 (MySQL/PG/SQLite)              |
+---------------------------------------------+
```

Session是数据库会话，管理连接和事务上下文。QueryBuilder负责构造SQL。CRUD方法在QueryBuilder上提供增删改查能力。TxManager负责事务传播和嵌套。Schema/Meta负责模型注册和反射元数据缓存。Dialect适配不同数据库的方言差异。

### 5.2 Session设计：数据库会话管理

Session是ORM的核心枢纽，所有的查询、事务、日志操作都通过Session来协调。它持有一个`*sql.DB`（或事务中的`*sql.Tx`），以及方言适配器、事务管理器、日志器等组件：

```go
package orm

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"
)

// Session 数据库会话
type Session struct {
	db        *sql.DB
	tx        *sql.Tx
	dialect   Dialect
	txManager *TransactionManager
	logger    *Logger
	ctx       context.Context
}

// NewSession 创建新的会话
func NewSession(db *sql.DB, dialect Dialect) *Session {
	return &Session{
		db:        db,
		dialect:   dialect,
		txManager: NewTransactionManager(db),
		logger:    NewLogger(),
		ctx:       context.Background(),
	}
}

// WithContext 设置上下文
func (s *Session) WithContext(ctx context.Context) *Session {
	newSession := *s
	newSession.ctx = ctx
	return &newSession
}

// Table 设置表名并返回Query Builder
func (s *Session) Table(name string) *QueryBuilder {
	return NewQueryBuilder(s, name)
}

// Model 设置模型类型并返回Query Builder
func (s *Session) Model(model interface{}) *QueryBuilder {
	tableName := s.getTableName(model)
	qb := NewQueryBuilder(s, tableName)
	qb.model = model
	return qb
}

// BeginTx 开始事务
func (s *Session) BeginTx(opts ...TransactionOptions) *TxSession {
	var opt TransactionOptions
	if len(opts) > 0 {
		opt = opts[0]
	} else {
		opt = DefaultTxOptions()
	}

	return &TxSession{
		session: s,
		options: opt,
	}
}

// getTableName 通过反射获取表名
func (s *Session) getTableName(model interface{}) string {
	t := reflect.TypeOf(model)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}

	if method, ok := t.MethodByName("TableName"); ok {
		results := method.Func.Call([]reflect.Value{reflect.ValueOf(model)})
		if len(results) > 0 {
			return results[0].String()
		}
	}

	return toSnakeCase(t.Name()) + "s"
}
```

### 5.3 模型定义与元数据解析

模型定义和元数据解析是ORM的灵魂。我们需要从Go的struct中提取出表名、字段名、类型、标签等信息。这些信息在首次使用时通过反射获取，然后缓存起来，后续操作直接读缓存，避免重复反射的性能开销。

```go
// ModelInfo 模型元数据
type ModelInfo struct {
	TableName  string
	Fields     []FieldInfo
	PrimaryKey string
	SoftDelete *FieldInfo
	Version    *FieldInfo
	CreatedAt  *FieldInfo
	UpdatedAt  *FieldInfo
}

// FieldInfo 字段元数据
type FieldInfo struct {
	GoName      string
	ColumnName  string
	Type        reflect.Type
	Tag         reflect.StructTag
	IsPrimary   bool
	IsAutoIncr  bool
	IsOmitEmpty bool
}

// Schema 模型注册表（全局缓存）
type Schema struct {
	mu     sync.RWMutex
	models map[reflect.Type]*ModelInfo
}

var globalSchema = &Schema{
	models: make(map[reflect.Type]*ModelInfo),
}

// Register 注册模型
func Register(model interface{}) (*ModelInfo, error) {
	t := reflect.TypeOf(model)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return nil, fmt.Errorf("model must be a struct, got %s", t.Kind())
	}

	globalSchema.mu.RLock()
	if info, ok := globalSchema.models[t]; ok {
		globalSchema.mu.RUnlock()
		return info, nil
	}
	globalSchema.mu.RUnlock()

	globalSchema.mu.Lock()
	defer globalSchema.mu.Unlock()

	if info, ok := globalSchema.models[t]; ok {
		return info, nil
	}

	info := parseModel(t)
	globalSchema.models[t] = info
	return info, nil
}
```

这里用了双重检查锁定（Double-Checked Locking）模式来保证并发安全。先用读锁检查是否已注册，没有的话再获取写锁。获取写锁后再检查一次，防止在等待写锁的期间其他goroutine已经完成了注册。双重检查锁定模式不仅保证了线程安全，还避免了不必要的写锁获取。读锁的获取开销远小于写锁，在高并发场景下这种优化能显著减少锁竞争。Go标准库的`sync.Once`也用了类似的模式，可以说这是并发编程中的经典套路。

`parseModel`函数负责通过反射解析struct的所有字段，提取db tag作为列名，识别主键、软删除、版本号等特殊字段：

```go
// parseModel 解析模型元数据
func parseModel(t reflect.Type) *ModelInfo {
	info := &ModelInfo{
		TableName: toSnakeCase(t.Name()) + "s",
	}

	if method, ok := t.MethodByName("TableName"); ok {
		results := method.Func.Call([]reflect.Value{reflect.New(t).Elem()})
		if len(results) > 0 && results[0].Kind() == reflect.String {
			info.TableName = results[0].String()
		}
	}

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if field.Anonymous || !field.IsExported() {
			continue
		}

		dbTag := field.Tag.Get("db")
		if dbTag == "-" {
			continue
		}

		columnName := dbTag
		if columnName == "" {
			columnName = toSnakeCase(field.Name)
		}

		fieldInfo := FieldInfo{
			GoName:     field.Name,
			ColumnName: columnName,
			Type:       field.Type,
			Tag:        field.Tag,
		}

		if pk := field.Tag.Get("pk"); pk == "true" || columnName == "id" {
			fieldInfo.IsPrimary = true
			info.PrimaryKey = columnName
		}

		if auto := field.Tag.Get("autoincr"); auto == "true" {
			fieldInfo.IsAutoIncr = true
		}

		if field.Tag.Get("omitempty") == "true" {
			fieldInfo.IsOmitEmpty = true
		}

		switch columnName {
		case "deleted_at":
			info.SoftDelete = &fieldInfo
		case "version":
			info.Version = &fieldInfo
		case "created_at":
			info.CreatedAt = &fieldInfo
		case "updated_at":
			info.UpdatedAt = &fieldInfo
		}

		info.Fields = append(info.Fields, fieldInfo)
	}

	return info
}
```

博客系统的模型定义如下。每个模型通过struct tag声明数据库列名，通过TableName方法指定表名。特殊字段如deleted_at、version、created_at、updated_at会被自动识别，框架会为它们提供默认行为（软删除过滤、乐观锁、自动时间戳）：

```go
// User 用户模型
type User struct {
	ID        int64      `db:"id" pk:"true" autoincr:"true"`
	Name      string     `db:"name"`
	Email     string     `db:"email"`
	Password  string     `db:"password"`
	Age       int        `db:"age"`
	Status    string     `db:"status"`
	Version   int        `db:"version"`
	CreatedAt time.Time  `db:"created_at"`
	UpdatedAt time.Time  `db:"updated_at"`
	DeletedAt *time.Time `db:"deleted_at"`
}

func (u *User) TableName() string {
	return "users"
}

// Post 文章模型
type Post struct {
	ID        int64      `db:"id" pk:"true" autoincr:"true"`
	Title     string     `db:"title"`
	Content   string     `db:"content"`
	AuthorID  int64      `db:"author_id"`
	Status    string     `db:"status"`
	Views     int64      `db:"views"`
	Version   int        `db:"version"`
	CreatedAt time.Time  `db:"created_at"`
	UpdatedAt time.Time  `db:"updated_at"`
	DeletedAt *time.Time `db:"deleted_at"`
}

func (p *Post) TableName() string {
	return "posts"
}

// Comment 评论模型
type Comment struct {
	ID        int64      `db:"id" pk:"true" autoincr:"true"`
	PostID    int64      `db:"post_id"`
	AuthorID  int64      `db:"author_id"`
	Content   string     `db:"content"`
	ParentID  *int64     `db:"parent_id"`
	CreatedAt time.Time  `db:"created_at"`
	DeletedAt *time.Time `db:"deleted_at"`
}

func (c *Comment) TableName() string {
	return "comments"
}

// Tag 标签模型
type Tag struct {
	ID   int64  `db:"id" pk:"true" autoincr:"true"`
	Name string `db:"name"`
}

func (t *Tag) TableName() string {
	return "tags"
}

// PostTag 文章-标签关联表
type PostTag struct {
	PostID int64 `db:"post_id" pk:"true"`
	TagID  int64 `db:"tag_id" pk:"true"`
}

func (pt *PostTag) TableName() string {
	return "post_tags"
}
```

注意`DeletedAt`字段用的是`*time.Time`指针类型，而不是`time.Time`值类型。这是因为软删除字段需要表示"未删除"（NULL）和"已删除"（有值）两种状态。如果用值类型，`time.Time`的零值是"0001-01-01 00:00:00"，既不是NULL也不是有效的时间戳，处理起来会很麻烦。用指针类型，nil就是NULL，非nil就是已删除，语义清晰。

> 怕浪猫说：反射是Go ORM的基石。没有反射，你就得手写每个模型的映射代码。但反射也是有代价的——性能。好的ORM会缓存反射结果（像我们上面的Schema注册表），而不是每次操作都重新解析。缓存反射元数据这一步，能让ORM性能提升一个数量级。这也是为什么很多成熟ORM框架在启动时就需要"注册模型"——就是在做反射缓存。

### 5.4 完整CRUD操作实现

把前面的组件整合到一起，实现完整的CRUD操作。这是ORM框架的核心部分，包括Create（单条/批量）、Get（单条/列表/分页）、Update（字段更新/乐观锁）、Delete（软删除/物理删除）。

由于篇幅限制，这里展示几个关键方法的实现。完整代码在上面各节已有展示，这里重点是看它们如何协同工作。

```go
// QueryBuilder 查询构造器（整合版）
type QueryBuilder struct {
	session  *Session
	table    string
	model    interface{}
	selects  []string
	wheres   []whereClause
	joins    []joinClause
	orderBy  []orderClause
	groupBy  []string
	limit    *int
	offset   *int
	args     []interface{}
	preloads []preloadConfig
}

// Create 插入记录
func (qb *QueryBuilder) Create(model interface{}) error {
	info, err := Register(model)
	if err != nil {
		return err
	}

	columns, placeholders, args := qb.buildInsertFromModel(model, info)

	sqlStr := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		qb.session.dialect.QuoteIdentifier(info.TableName),
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	result, err := qb.session.exec(qb.ctx, sqlStr, args...)
	if err != nil {
		return err
	}

	// 回写自增ID
	if info.PrimaryKey != "" {
		if id, err := result.LastInsertId(); err == nil && id > 0 {
			qb.setPrimaryKey(model, info, id)
		}
	}

	return nil
}

// Get 查询多条记录
func (qb *QueryBuilder) Get(dest interface{}) error {
	qb.applySoftDeleteCondition()
	sqlStr, args := qb.buildSelect()

	rows, err := qb.session.query(qb.ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	if err := qb.scanRows(rows, dest); err != nil {
		return err
	}

	if len(qb.preloads) > 0 {
		return qb.executePreloads(dest)
	}

	return nil
}

// Paginate 分页查询
func (qb *QueryBuilder) Paginate(page, pageSize int, dest interface{}) (*Pagination, error) {
	qb.applySoftDeleteCondition()

	countQB := qb.clone()
	total, err := countQB.count()
	if err != nil {
		return nil, err
	}

	if page < 1 {
		page = 1
	}
	offset := (page - 1) * pageSize
	qb.Limit(pageSize).Offset(offset)

	if err := qb.Get(dest); err != nil {
		return nil, err
	}

	pages := int((total + int64(pageSize) - 1) / int64(pageSize))

	return &Pagination{
		List:     dest,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		Pages:    pages,
	}, nil
}
```

### 5.5 复杂查询实战

博客系统中的复杂查询场景比单纯的CRUD要丰富得多。多表关联、条件搜索、聚合统计、分页排序——这些都是日常开发的高频需求。下面通过BlogRepository来展示这些查询的实现。

```go
// BlogRepository 博客数据仓库
type BlogRepository struct {
	session *Session
}

func NewBlogRepository(session *Session) *BlogRepository {
	return &BlogRepository{session: session}
}

// GetPublishedPosts 分页查询已发布文章
func (r *BlogRepository) GetPublishedPosts(page, pageSize int) (*Pagination, error) {
	var posts []Post
	return r.session.Table("posts").
		Where("status = ?", "published").
		OrderBy("created_at", "DESC").
		Paginate(page, pageSize, &posts)
}

// SearchPosts 全文搜索文章（简化版）
func (r *BlogRepository) SearchPosts(keyword string, page, pageSize int) (*Pagination, error) {
	var posts []Post
	return r.session.Table("posts").
		Where("status = ?", "published").
		Where("(title LIKE ? OR content LIKE ?)",
			"%"+keyword+"%", "%"+keyword+"%").
		OrderBy("created_at", "DESC").
		Paginate(page, pageSize, &posts)
}

// GetPostsByTag 根据标签查询文章（多表JOIN）
func (r *BlogRepository) GetPostsByTag(tagName string, page, pageSize int) (*Pagination, error) {
	var posts []Post
	return r.session.Table("posts").
		Select("posts.*").
		Join("post_tags", "post_tags.post_id = posts.id").
		Join("tags", "tags.id = post_tags.tag_id").
		Where("tags.name = ?", tagName).
		Where("posts.status = ?", "published").
		OrderBy("posts.created_at", "DESC").
		Paginate(page, pageSize, &posts)
}

// GetAuthorStats 获取作者统计数据（聚合查询）
func (r *BlogRepository) GetAuthorStats(authorID int64) (*AuthorStats, error) {
	var stats AuthorStats

	postCount, err := r.session.Table("posts").
		Where("author_id = ?", authorID).
		Where("status = ?", "published").
		count()
	if err != nil {
		return nil, err
	}
	stats.PostCount = postCount

	totalViews, err := r.session.Table("posts").
		Where("author_id = ?", authorID).
		Sum("views")
	if err != nil {
		return nil, err
	}
	stats.TotalViews = int64(totalViews)

	commentCount, err := r.session.Table("comments").
		Join("posts", "posts.id = comments.post_id").
		Where("posts.author_id = ?", authorID).
		count()
	if err != nil {
		return nil, err
	}
	stats.CommentCount = commentCount

	return &stats, nil
}

// IncrementViews 增加浏览量（乐观锁）
func (r *BlogRepository) IncrementViews(postID int64) error {
	var post Post
	err := r.session.Table("posts").Where("id = ?", postID).First(&post)
	if err != nil {
		return err
	}

	rowsAffected, err := r.session.Table("posts").
		Where("id = ? AND version = ?", postID, post.Version).
		Updates(map[string]interface{}{
			"views":   post.Views + 1,
			"version": post.Version + 1,
		})
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("optimistic lock failed, please retry")
	}

	return nil
}

// CreatePostWithTags 创建文章并关联标签（事务+嵌套）
func (r *BlogRepository) CreatePostWithTags(post *Post, tagNames []string) error {
	return r.session.BeginTx().Execute(func(txs *TxSession) error {
		if err := txs.Table("posts").Create(post); err != nil {
			return err
		}

		for _, tagName := range tagNames {
			err := txs.Nested(func(nestedTx *TxSession) error {
				var tag Tag
				err := nestedTx.Table("tags").
					Where("name = ?", tagName).
					First(&tag)
				if err == sql.ErrNoRows {
					tag = Tag{Name: tagName}
					if err := nestedTx.Table("tags").Create(&tag); err != nil {
						return err
					}
				} else if err != nil {
					return err
				}

				postTag := PostTag{
					PostID: post.ID,
					TagID:  tag.ID,
				}
				return nestedTx.Table("post_tags").Create(&postTag)
			})
			if err != nil {
				log.Printf("failed to associate tag %s: %v", tagName, err)
			}
		}

		return nil
	})
}
```

`CreatePostWithTags`这个方法很值得分析。它展示了事务和嵌套事务的典型用法：外层事务保证"创建文章"和"关联标签"的整体性——如果创建文章就失败了，直接回滚，不需要处理标签。每个标签的关联用嵌套事务（Savepoint）包裹，单个标签失败不影响其他标签的关联。这种"部分失败可接受"的设计在批量操作中很有用。

> 怕浪猫说：复杂查询的设计原则是"让数据库做数据库擅长的事"。JOIN和聚合让数据库做，结果组装让应用层做。但要注意N+1查询问题——循环里查数据库是性能杀手。能用IN批量查的，就别在循环里一条一条查。

### 5.6 事务管理实战

事务会话（TxSession）是对事务管理器的高层封装，提供更简洁的API。它在内部管理事务的生命周期，包括开始、提交、回滚和Savepoint：

```go
// TxSession 事务会话
type TxSession struct {
	session    *Session
	options    TransactionOptions
	tx         *sql.Tx
	savepoints []string
	spCounter  int
	active     bool
}

// Execute 执行事务
func (txs *TxSession) Execute(fn func(*TxSession) error) error {
	if !txs.active {
		var err error
		if txs.options.Isolation == sql.LevelDefault {
			txs.tx, err = txs.session.db.BeginTx(txs.session.ctx, nil)
		} else {
			txs.tx, err = txs.session.db.BeginTx(txs.session.ctx,
				&sql.TxOptions{
					Isolation: txs.options.Isolation,
					ReadOnly:  txs.options.ReadOnly,
				})
		}
		if err != nil {
			return fmt.Errorf("begin tx failed: %w", err)
		}
		txs.active = true
		txs.session.tx = txs.tx
	}

	err := fn(txs)
	if err != nil {
		if rbErr := txs.tx.Rollback(); rbErr != nil {
			return fmt.Errorf("exec failed: %w, rollback failed: %v", err, rbErr)
		}
		txs.active = false
		return err
	}

	if err := txs.tx.Commit(); err != nil {
		txs.active = false
		return fmt.Errorf("commit failed: %w", err)
	}

	txs.active = false
	return nil
}

// Nested 嵌套事务（Savepoint）
func (txs *TxSession) Nested(fn func(*TxSession) error) error {
	txs.spCounter++
	spName := fmt.Sprintf("sp_%d", txs.spCounter)
	txs.savepoints = append(txs.savepoints, spName)

	_, err := txs.tx.ExecContext(txs.session.ctx,
		fmt.Sprintf("SAVEPOINT %s", spName))
	if err != nil {
		return fmt.Errorf("savepoint %s failed: %w", spName, err)
	}

	err = fn(txs)
	if err != nil {
		_, rbErr := txs.tx.ExecContext(txs.session.ctx,
			fmt.Sprintf("ROLLBACK TO SAVEPOINT %s", spName))
		if rbErr != nil {
			return fmt.Errorf("exec failed: %w, rollback to sp failed: %v",
				err, rbErr)
		}
		return err
	}

	_, err = txs.tx.ExecContext(txs.session.ctx,
		fmt.Sprintf("RELEASE SAVEPOINT %s", spName))
	if err != nil {
		return fmt.Errorf("release sp %s failed: %w", spName, err)
	}

	return nil
}
```

### 5.7 连接池管理

连接池是ORM性能的基础保障。Go的`database/sql`自带连接池，但默认配置往往不够用。`MaxOpenConns`默认是0（无限制），`MaxIdleConns`默认是2。这两个配置需要根据实际负载来调优。如果你用的是MySQL，可以用`SHOW VARIABLES LIKE 'max_connections'`查看数据库最大连接数，然后根据应用实例数量来分配。比如数据库最大连接数是100，你有4个应用实例，那每个实例的MaxOpenConns最好不要超过20（留一些余量给数据库管理连接和监控工具）。连接数不是越大越好——过多的连接会增加数据库的调度开销，反而降低性能。

连接池配置的核心原则是：`MaxOpenConns`不能超过数据库服务器的`max_connections`限制（考虑多个应用实例共享同一个数据库），`MaxIdleConns`不宜过大（空闲连接占用数据库内存）。`ConnMaxLifetime`应该小于数据库的`wait_timeout`设置，避免使用被数据库主动关闭的连接。

```go
// ConnectionPoolConfig 连接池配置
type ConnectionPoolConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// DefaultPoolConfig 默认连接池配置
func DefaultPoolConfig() ConnectionPoolConfig {
	return ConnectionPoolConfig{
		MaxOpenConns:    25,
		MaxIdleConns:    10,
		ConnMaxLifetime: 30 * time.Minute,
		ConnMaxIdleTime: 5 * time.Minute,
	}
}

// ConnectionPool 连接池管理器
type ConnectionPool struct {
	db     *sql.DB
	config ConnectionPoolConfig
	stats  *PoolStatsCollector
}

// NewConnectionPool 创建连接池
func NewConnectionPool(driver, dsn string, config ConnectionPoolConfig) (*ConnectionPool, error) {
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open db failed: %w", err)
	}

	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	// 验证连接
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping db failed: %w", err)
	}

	pool := &ConnectionPool{
		db:     db,
		config: config,
	}

	return pool, nil
}

// HealthCheck 健康检查
func (p *ConnectionPool) HealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return p.db.PingContext(ctx)
}

// Close 关闭连接池
func (p *ConnectionPool) Close() error {
	return p.db.Close()
}
```

### 5.8 性能优化：SQL日志与慢查询分析

SQL日志和慢查询分析不是"可选项"，是"必选项"。你以为你的SQL都很快，上线后发现P99延迟500ms，一查发现有个N+1查询偷偷藏在循环里。没有日志和监控，性能问题就是"薛定谔的Bug"——你不知道它什么时候出现，但它一定在。

```go
// Logger SQL日志器
type Logger struct {
	level         LogLevel
	slowThreshold time.Duration
	logger        *log.Logger
	metrics       *MetricsCollector
}

type LogLevel int

const (
	LogLevelSilent LogLevel = iota
	LogLevelError
	LogLevelWarn
	LogLevelInfo
)

// MetricsCollector 指标收集器
type MetricsCollector struct {
	mu        sync.Mutex
	queries   map[string]*QueryMetric
	totalExec int64
	totalTime time.Duration
	slowCount int64
}

type QueryMetric struct {
	SQL       string
	Count     int64
	TotalTime time.Duration
	MaxTime   time.Duration
	LastError error
	LastTime  time.Time
}

func NewLogger() *Logger {
	return &Logger{
		level:         LogLevelInfo,
		slowThreshold: 200 * time.Millisecond,
		logger:        log.New(os.Stdout, "[ORM] ", log.LstdFlags),
		metrics: &MetricsCollector{
			queries: make(map[string]*QueryMetric),
		},
	}
}

// LogQuery 记录查询日志
func (l *Logger) LogQuery(sql string, args []interface{}, duration time.Duration, err error) {
	l.metrics.record(sql, duration, err)

	if l.level < LogLevelInfo {
		return
	}

	sql = compactSQL(sql)

	if err != nil {
		l.logger.Printf("[ERROR] %s | args=%v | duration=%s | err=%v",
			sql, args, duration, err)
		return
	}

	if duration > l.slowThreshold {
		l.logger.Printf("[SLOW] %s | args=%v | duration=%s (threshold=%s)",
			sql, args, duration, l.slowThreshold)
		return
	}

	l.logger.Printf("[SQL] %s | args=%v | duration=%s",
		sql, args, duration)
}

// record 记录指标
func (mc *MetricsCollector) record(sql string, duration time.Duration, err error) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	mc.totalExec++
	mc.totalTime += duration

	if duration > 200*time.Millisecond {
		mc.slowCount++
	}

	sqlTemplate := normalizeSQL(sql)
	metric, ok := mc.queries[sqlTemplate]
	if !ok {
		metric = &QueryMetric{SQL: sqlTemplate}
		mc.queries[sqlTemplate] = metric
	}

	metric.Count++
	metric.TotalTime += duration
	if duration > metric.MaxTime {
		metric.MaxTime = duration
	}
	metric.LastError = err
	metric.LastTime = time.Now()
}

// GetSlowQueries 获取慢查询列表
func (mc *MetricsCollector) GetSlowQueries(topN int) []QueryMetric {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	var results []QueryMetric
	for _, m := range mc.queries {
		if m.MaxTime > 200*time.Millisecond {
			results = append(results, *m)
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].MaxTime > results[j].MaxTime
	})

	if len(results) > topN {
		results = results[:topN]
	}
	return results
}

// GetStats 获取统计摘要
func (mc *MetricsCollector) GetStats() map[string]interface{} {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	avgTime := time.Duration(0)
	if mc.totalExec > 0 {
		avgTime = mc.totalTime / time.Duration(mc.totalExec)
	}

	return map[string]interface{}{
		"total_queries":    mc.totalExec,
		"total_time":       mc.totalTime.String(),
		"avg_time":         avgTime.String(),
		"slow_queries":     mc.slowCount,
		"unique_sql_count": len(mc.queries),
	}
}
```

这段日志系统的设计有几个要点。第一，所有SQL都被记录，不只是慢查询。完整的SQL日志是排查问题的第一手资料。第二，慢查询有独立的告警级别（SLOW），方便在日志系统中做过滤和告警。第三，指标收集器按SQL模板聚合统计——同一个SQL执行多次只算一条记录，但累计次数和最大耗时。这让你能快速定位"哪个SQL最慢"和"哪个SQL执行最频繁"。

`normalizeSQL`函数的作用是把具体参数替换为问号，生成SQL模板。比如`WHERE id = 42`会被归一化为`WHERE id = ?`。这样不同参数的同一个查询会被聚合到同一条指标记录里，统计才有了意义。

在Session中集成日志的方法很简单——在query和exec方法里加一层时间测量和日志记录：

```go
// query 带日志的查询
func (s *Session) query(ctx context.Context, sql string, args ...interface{}) (*sql.Rows, error) {
	start := time.Now()

	var rows *sql.Rows
	var err error
	if s.tx != nil {
		rows, err = s.tx.QueryContext(ctx, sql, args...)
	} else {
		rows, err = s.db.QueryContext(ctx, sql, args...)
	}

	s.logger.LogQuery(sql, args, time.Since(start), err)
	return rows, err
}

// exec 带日志的执行
func (s *Session) exec(ctx context.Context, sql string, args ...interface{}) (sql.Result, error) {
	start := time.Now()

	var result sql.Result
	var err error
	if s.tx != nil {
		result, err = s.tx.ExecContext(ctx, sql, args...)
	} else {
		result, err = s.db.ExecContext(ctx, sql, args...)
	}

	s.logger.LogQuery(sql, args, time.Since(start), err)
	return result, err
}
```

> 怕浪猫说：SQL日志和慢查询分析不是"可选项"，是"必选项"。你以为你的SQL都很快，上线后发现P99延迟500ms，一查发现有个N+1查询偷偷藏在循环里。没有日志和监控，性能问题就是"薛定谔的Bug"——你不知道它什么时候出现，但它一定在。

### 5.9 完整使用示例

把所有组件串起来，看完整的使用流程。这个示例展示了从初始化到业务操作的完整路径：

```go
func main() {
	// 1. 初始化连接池
	pool, err := NewConnectionPool("mysql",
		"root:password@tcp(127.0.0.1:3306)/blog?parseTime=true",
		DefaultPoolConfig())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	// 2. 创建Session
	session := NewSession(pool.GetDB(), &MySQLDialect{})

	// 3. 注册模型
	Register(&User{})
	Register(&Post{})
	Register(&Comment{})
	Register(&Tag{})

	// 4. 创建Repository
	repo := NewBlogRepository(session)

	// 5. 创建用户
	user := &User{
		Name:      "怕浪猫",
		Email:     "cat@pailang.com",
		Password:  "hashed_password",
		Age:       25,
		Status:    "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	err = session.Model(&User{}).Create(user)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Created user with ID: %d\n", user.ID)

	// 6. 创建文章（带标签，事务操作）
	post := &Post{
		Title:     "手搓ORM的那些事",
		Content:   "今天我们来手搓一个ORM框架...",
		AuthorID:  user.ID,
		Status:    "published",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	err = repo.CreatePostWithTags(post, []string{"Go", "ORM", "数据库"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Created post with ID: %d\n", post.ID)

	// 7. 分页查询文章
	pagination, err := repo.GetPublishedPosts(1, 10)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Posts: total=%d, pages=%d\n",
		pagination.Total, pagination.Pages)

	// 8. 搜索文章
	searchResult, err := repo.SearchPosts("ORM", 1, 10)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Search results: %d\n", searchResult.Total)

	// 9. 增加浏览量（乐观锁）
	err = repo.IncrementViews(post.ID)
	if err != nil {
		log.Printf("increment views failed: %v", err)
	}

	// 10. 获取作者统计
	stats, err := repo.GetAuthorStats(user.ID)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Author stats: posts=%d, views=%d, comments=%d\n",
		stats.PostCount, stats.TotalViews, stats.CommentCount)

	// 11. 查看慢查询
	slowQueries := session.logger.metrics.GetSlowQueries(5)
	for _, sq := range slowQueries {
		fmt.Printf("Slow query: %s | max=%s | count=%d\n",
			sq.SQL, sq.MaxTime, sq.Count)
	}

	// 12. 查看全局统计
	queryStats := session.logger.metrics.GetStats()
	fmt.Printf("Query stats: %+v\n", queryStats)
}
```

---

## ORM框架核心设计清单

怕浪猫整理了一份ORM框架核心设计清单，按优先级排序。你可以用它来评估自己手搓的ORM是否完备，也可以用来选型第三方ORM时做对照参考。

| 序号 | 模块 | 核心要点 | 优先级 |
|------|------|----------|--------|
| 1 | 连接管理 | 连接池配置、健康检查、超时控制 | P0 |
| 2 | 元数据解析 | 模型注册、字段映射、缓存反射结果 | P0 |
| 3 | Query Builder | 链式API、参数绑定、方言适配 | P0 |
| 4 | CRUD操作 | 增删改查、批量操作、自动时间戳 | P0 |
| 5 | 事务管理 | ACID保证、传播行为、Savepoint | P1 |
| 6 | 软删除 | deleted_at自动管理、查询自动过滤 | P1 |
| 7 | 乐观锁 | version字段、CAS机制 | P1 |
| 8 | 预加载 | N+1问题解决、关联查询优化 | P1 |
| 9 | SQL日志 | 全量记录、慢查询告警、指标聚合 | P2 |
| 10 | 性能监控 | 查询统计、连接池监控、热点分析 | P2 |

> 怕浪猫说：做框架设计就像盖楼，P0是地基，P1是承重墙，P2是装修。地基不牢楼会塌，承重墙不结实楼会裂，装修不到位住着不舒服但不会死人。按优先级来，别一上来就搞花里胡哨的功能。先把P0做扎实了，再考虑P1和P2。

---

## 本章核心回顾

这章我们从零开始手搓了一个完整的ORM框架，覆盖了以下核心内容：

1. **Query Builder设计**：链式调用API、条件分组、聚合查询、Join与Preload两种关联策略。核心价值是把SQL构造从字符串拼接变成结构化API，从根本上解决SQL注入问题。
2. **类型安全**：利用Go泛型实现类型安全的字段引用，让编译器帮你检查SQL字段名和参数类型错误。这是把运行时错误前置到编译时的重要手段。
3. **完整CRUD**：单条/批量插入、Upsert、分页查询、乐观锁更新、软删除与物理删除。每个操作都有对应的工程注意事项和最佳实践。
4. **事务管理**：6种传播行为、Savepoint嵌套事务、事务管理器完整实现。这是ORM框架中最复杂也最有价值的部分。
5. **实战项目**：博客系统数据层，包含模型定义、复杂查询、事务操作、连接池管理、SQL日志和慢查询分析。这不是玩具代码，是能扛住生产流量的设计。

代码量不小，但每一行都有它的设计意图。建议你跟着代码敲一遍，不要复制粘贴。手敲的过程就是理解的过程。当你自己实现一遍之后，再去看GORM、ent、sqlx这些开源ORM的源码，你会发现它们的很多设计思路你已经理解了，甚至你自己的实现也有可取之处。

> 怕浪猫说：学框架最好的方式不是读源码，而是自己写一遍。写的过程中你会发现无数"为什么这样设计"的决策点，这些决策点就是框架设计的精髓。读源码是看别人做选择，自己写是亲自做选择。成长就在这些选择里。

---

如果觉得这篇内容对你有帮助，点个收藏，以后写ORM或者选型ORM的时候翻出来参考。有什么问题或者不同观点，评论区见，怕浪猫来一一回复。

这个系列还在连载中，下一章我们聊本地缓存与Redis客户端——从sync.Map到bigcache，从单机缓存到Redis Cluster，把数据缓存的每一层都讲透。关注我，追更不迷路。

---

**系列进度：5/16**

下一章预告：本地缓存与Redis客户端 —— 本地缓存策略（LRU/LFU/TTL）、sync.Map与bigcache、Redis客户端封装（连接管理、Pipeline、Cluster模式）、多级缓存架构设计、缓存穿透/击穿/雪崩的工程解决方案。

---

> 怕浪猫说：ORM框架是连接应用和数据库的桥梁。好的ORM让你忘记SQL的繁琐，专注于业务逻辑；坏的ORM让你同时跟SQL和ORM作斗争。你手搓的这个框架虽然迷你，但五脏俱全——Query Builder、事务管理、连接池、日志监控，该有的都有。接下来就是要用它，在实战中打磨它，让它真正成为你项目里的"基础设施"。写代码这件事，不怕慢，就怕站。咱们下章见。
