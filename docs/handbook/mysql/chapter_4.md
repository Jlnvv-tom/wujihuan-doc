# MySQL 数据库应用指南：第4章 SQL语言基础与查询操作

在前两章完成环境搭建和基础操作后，本章将聚焦 MySQL 核心能力——SQL 查询。SQL（结构化查询语言）是操作关系型数据库的通用语言，而查询（SELECT）又是 SQL 中最常用、最核心的部分。掌握本章的基础查询语法，你就能从数据库中精准提取所需数据，为后续复杂查询、数据分析打下坚实基础。

## 4.1 SQL语言的定义、分类与执行原理

在动手写查询语句前，先理解 SQL 的本质和执行逻辑，能帮你避开很多基础坑，也能更好地优化查询性能。

### 4.1.1 SQL语言的定义

SQL（Structured Query Language，结构化查询语言）是用于管理关系型数据库的标准化语言，无论你使用 MySQL、Oracle 还是 PostgreSQL，核心 SQL 语法基本通用。它的特点是：

- **非过程化**：只需告诉数据库“要什么”，无需关心“怎么取”（数据库引擎自动优化执行路径）；
- **简单易懂**：语法接近自然语言（如 SELECT、FROM、WHERE），上手门槛低；
- **功能全面**：涵盖数据查询、新增、修改、删除、权限管理等所有数据库操作。

> 补充：SQL 官方标准由 ISO 制定，MySQL 虽兼容核心标准，但有少量自定义扩展（如 LIMIT 关键字），后续会重点说明。

### 4.1.2 SQL语言的分类

根据功能，SQL 可分为 4 大类，本章重点讲解**数据查询语言（DQL）**，其他类别会在后续章节展开：
| 分类 | 英文缩写 | 核心关键字 | 作用 |
|------|----------|------------|------|
| 数据查询语言 | DQL | SELECT | 从数据库中查询数据（核心，本章重点） |
| 数据操作语言 | DML | INSERT、UPDATE、DELETE | 新增、修改、删除数据表中的数据 |
| 数据定义语言 | DDL | CREATE、ALTER、DROP | 创建、修改、删除数据库/表结构 |
| 数据控制语言 | DCL | GRANT、REVOKE、COMMIT | 权限管理、事务控制 |

### 4.1.3 SQL查询的执行原理

当你执行一条 SELECT 语句时，MySQL 会按以下步骤处理（简化版）：

1. **解析**：检查 SQL 语法是否正确，生成语法树；
2. **优化**：查询优化器根据表结构、索引等，选择最优执行路径（比如先过滤再排序，而非先排序再过滤）；
3. **执行**：按优化后的路径访问数据（读取磁盘/内存数据）；
4. **返回**：将结果集返回给客户端。

> 关键认知：写 SQL 时要考虑“优化器的逻辑”，比如避免在 WHERE 子句中使用函数（会导致索引失效），后续 4.6 节会详细讲解。

## 4.2 基础查询语句（SELECT）的语法与使用

SELECT 是 SQL 查询的核心关键字，基础语法看似简单，但能组合出各种复杂的查询逻辑。先从最基础的“查什么、从哪查”开始。

### 4.2.1 基础语法结构

SELECT 语句的核心结构（按执行顺序排序）：

```sql
SELECT 要查询的字段/表达式
FROM 数据来源表
[WHERE 筛选条件]
[ORDER BY 排序字段]
[LIMIT 结果行数];
```

> 注意：SQL 关键字不区分大小写（如 SELECT 和 select 效果一样），但**字段名、表名在 Linux 系统下区分大小写**（Windows 不区分），建议统一用大写关键字，小写表/字段名，提升可读性。

### 4.2.2 常用查询场景示例

为了方便演示，先创建一个测试表 `student` 并插入数据（后续示例均基于此表）：

```sql
-- 创建学生表
CREATE TABLE IF NOT EXISTS student (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 学号（主键、自增）
  name VARCHAR(50) NOT NULL,          -- 姓名
  gender CHAR(1) DEFAULT NULL,        -- 性别（男/女）
  age INT NOT NULL,                   -- 年龄
  score FLOAT DEFAULT 0,              -- 成绩
  class VARCHAR(20) NOT NULL          -- 班级
) CHARACTER SET utf8mb4;

-- 插入测试数据
INSERT INTO student (name, gender, age, score, class) VALUES
('张三', '男', 18, 90.5, '高一(1)班'),
('李四', '女', 17, 85.0, '高一(1)班'),
('王五', '男', 18, 78.5, '高一(2)班'),
('赵六', '女', 17, 95.0, '高一(2)班'),
('钱七', '男', 19, NULL, '高一(1)班');  -- 成绩为空
```

#### 场景1：查询所有字段

用 `*` 表示“所有字段”，适合快速查看数据，但生产环境不推荐（字段顺序可能变化，且会查询不必要的字段）：

```sql
-- 查询student表所有字段
SELECT * FROM student;

-- 执行结果（简化）：
+----+------+--------+-----+-------+-----------+
| id | name | gender | age | score | class     |
+----+------+--------+-----+-------+-----------+
|  1 | 张三 | 男     |  18 |  90.5 | 高一(1)班 |
|  2 | 李四 | 女     |  17 |  85.0 | 高一(1)班 |
|  3 | 王五 | 男     |  18 |  78.5 | 高一(2)班 |
|  4 | 赵六 | 女     |  17 |  95.0 | 高一(2)班 |
|  5 | 钱七 | 男     |  19 |  NULL | 高一(1)班 |
+----+------+--------+-----+-------+-----------+
```

#### 场景2：查询指定字段

明确指定字段名，用逗号分隔，是生产环境的最佳实践：

```sql
-- 查询姓名、年龄、班级字段
SELECT name, age, class FROM student;
```

#### 场景3：查询时给字段起别名

用 `AS` 关键字（可省略）给字段起别名，方便阅读和后续处理：

```sql
-- 给字段起别名（AS可省略）
SELECT
  name AS 姓名,
  age 年龄,  -- 省略AS
  score 成绩
FROM student;

-- 执行结果：
+--------+------+--------+
| 姓名   | 年龄 | 成绩   |
+--------+------+--------+
| 张三   |  18  |  90.5  |
| 李四   |  17  |  85.0  |
| ...    | ...  | ...    |
+--------+------+--------+
```

#### 场景4：查询时计算字段值

可在 SELECT 中直接对字段进行算术运算（+、-、\*、/）：

```sql
-- 查询姓名、成绩，并计算成绩+5分后的结果
SELECT name, score, score + 5 AS 加分后成绩 FROM student;

-- 注意：NULL参与运算结果仍为NULL（如钱七的加分后成绩为NULL）
```

## 4.3 条件查询（WHERE）与比较运算符

基础查询会返回所有数据，而实际场景中，我们通常只需要符合特定条件的数据（比如“高一(1)班的学生”“成绩大于90分的学生”），这就需要 WHERE 子句配合比较运算符实现。

### 4.3.1 WHERE子句的语法

WHERE 子句紧跟 FROM 之后，用于筛选满足条件的行：

```sql
SELECT 字段名
FROM 表名
WHERE 筛选条件;
```

### 4.3.2 常用比较运算符

| 运算符                | 作用                                      | 示例                                         |
| --------------------- | ----------------------------------------- | -------------------------------------------- |
| =                     | 等于                                      | `WHERE age = 18`（年龄等于18）               |
| <> / !=               | 不等于                                    | `WHERE gender <> '男'`（性别不是男）         |
| > / <                 | 大于 / 小于                               | `WHERE score > 90`（成绩大于90）             |
| >= / <=               | 大于等于 / 小于等于                       | `WHERE age >= 18`（年龄大于等于18）          |
| BETWEEN ... AND ...   | 在某个区间内（包含边界）                  | `WHERE score BETWEEN 80 AND 90`（成绩80-90） |
| IN (值1, 值2, ...)    | 匹配列表中的任意值                        | `WHERE class IN ('高一(1)班', '高一(2)班')`  |
| LIKE                  | 模糊匹配（%匹配任意字符，\_匹配单个字符） | `WHERE name LIKE '张%'`（姓张的学生）        |
| IS NULL / IS NOT NULL | 判断是否为空值                            | `WHERE score IS NULL`（成绩为空）            |

### 4.3.3 条件查询示例

#### 示例1：简单条件筛选

```sql
-- 查询高一(1)班的学生
SELECT name, age, class FROM student WHERE class = '高一(1)班';

-- 查询成绩大于90分的学生
SELECT name, score FROM student WHERE score > 90;
```

#### 示例2：区间筛选（BETWEEN AND）

```sql
-- 查询成绩在80到90分之间的学生（包含80和90）
SELECT name, score FROM student WHERE score BETWEEN 80 AND 90;
```

#### 示例3：模糊查询（LIKE）

```sql
-- 查询姓张的学生（%匹配任意长度字符）
SELECT name FROM student WHERE name LIKE '张%';

-- 查询姓名第二个字是“四”的学生（_匹配单个字符）
SELECT name FROM student WHERE name LIKE '_四';  -- 匹配“李四”
```

#### 示例4：多条件组合（AND/OR/NOT）

用 AND（且）、OR（或）、NOT（非）组合多个条件，可加括号明确优先级：

```sql
-- 查询高一(1)班且年龄大于18的学生
SELECT name, class, age FROM student WHERE class = '高一(1)班' AND age > 18;

-- 查询成绩大于90或性别为女的学生
SELECT name, gender, score FROM student WHERE score > 90 OR gender = '女';

-- 查询不是高一(1)班的学生
SELECT name, class FROM student WHERE NOT class = '高一(1)班';
```

## 4.4 排序查询（ORDER BY）与限制结果集（LIMIT）

查询结果默认按数据插入顺序返回，实际场景中常需要按特定字段排序（比如按成绩降序），或只返回前N条数据（比如取成绩最高的3名学生），这就需要 ORDER BY 和 LIMIT 配合使用。

### 4.4.1 排序查询（ORDER BY）

#### 语法：

```sql
SELECT 字段名
FROM 表名
[WHERE 条件]
ORDER BY 排序字段1 [ASC/DESC], 排序字段2 [ASC/DESC];
```

- `ASC`：升序（默认，可省略），比如从小到大、从A到Z；
- `DESC`：降序，比如从大到小、从Z到A；
- 可指定多个排序字段（先按第一个字段排，相同则按第二个排）。

#### 示例：

```sql
-- 按成绩降序排序（成绩高的在前）
SELECT name, score FROM student ORDER BY score DESC;

-- 按班级升序，同班级按年龄降序排序
SELECT name, class, age FROM student ORDER BY class ASC, age DESC;

-- 注意：NULL值排序时，升序会排在最前面，降序排在最后面
SELECT name, score FROM student ORDER BY score ASC;  -- 钱七（score NULL）排在第一
```

### 4.4.2 限制结果集（LIMIT）

LIMIT 是 MySQL 自定义的关键字（Oracle 用 ROWNUM，SQL Server 用 TOP），用于限制返回的行数，适合分页、取前N条数据。

#### 语法：

```sql
-- 语法1：只返回前n行
SELECT 字段名 FROM 表名 LIMIT n;

-- 语法2：分页（跳过offset行，返回n行）
SELECT 字段名 FROM 表名 LIMIT offset, n;
```

- `offset`：跳过的行数（从0开始，比如 offset=0 表示从第一行开始）；
- `n`：要返回的行数。

#### 示例：

```sql
-- 取成绩最高的3名学生（先排序再限制）
SELECT name, score FROM student ORDER BY score DESC LIMIT 3;

-- 分页查询：第2页，每页2条（跳过前2行，取2行）
SELECT name, age, score FROM student ORDER BY id ASC LIMIT 2, 2;
```

### 4.4.3 组合使用示例

```sql
-- 查询高一(2)班的学生，按成绩降序排序，取前2名
SELECT name, class, score
FROM student
WHERE class = '高一(2)班'
ORDER BY score DESC
LIMIT 2;
```

## 4.5 去重查询（DISTINCT）与空值处理（NULL）

实际查询中，常会遇到重复数据（比如“查询所有班级名称”）或空值（比如“成绩未填写的学生”），需要用 DISTINCT 去重、IS NULL/IS NOT NULL 处理空值。

### 4.5.1 去重查询（DISTINCT）

DISTINCT 用于去除查询结果中的重复行，需放在 SELECT 之后、字段名之前。

#### 语法：

```sql
SELECT DISTINCT 字段名 FROM 表名;
```

#### 示例：

```sql
-- 查询所有不重复的班级名称
SELECT DISTINCT class FROM student;

-- 执行结果：
+-----------+
| class     |
+-----------+
| 高一(1)班 |
| 高一(2)班 |
+-----------+

-- 注意：DISTINCT 作用于所有指定字段的组合，而非单个字段
SELECT DISTINCT class, gender FROM student;  -- 去重“班级+性别”的组合
```

### 4.5.2 空值处理（NULL）

NULL 表示“未知/不存在的值”，不是0、空字符串，也不能用 `=` 或 `<>` 判断，必须用 `IS NULL` 或 `IS NOT NULL`。

#### 示例：

```sql
-- 查询成绩为空的学生
SELECT name, score FROM student WHERE score IS NULL;

-- 查询成绩不为空的学生
SELECT name, score FROM student WHERE score IS NOT NULL;

-- 空值替换：用IFNULL函数将NULL替换为0（方便计算）
SELECT name, IFNULL(score, 0) AS 成绩 FROM student;
-- 执行结果中，钱七的成绩会显示为0，而非NULL
```

> 补充：MySQL 中处理空值的常用函数还有 COALESCE（返回第一个非NULL值），比如 `COALESCE(score, 0, 60)` 表示优先取score，score为NULL则取0，0也为NULL则取60。

## 4.6 基础查询的性能注意事项

新手写查询时容易只关注“结果对不对”，忽略“性能好不好”，而不良的查询习惯会导致数据量增大后查询速度急剧变慢。以下是基础查询的核心性能优化点：

### 4.6.1 避免使用 SELECT \*

- **问题**：`SELECT *` 会查询所有字段，包括不需要的字段，增加网络传输和数据库IO开销；若表新增字段，还可能导致程序解析异常。
- **解决方案**：明确指定需要的字段名，比如 `SELECT name, age, score FROM student`。

### 4.6.2 合理使用 WHERE 子句提前过滤

- **问题**：先查询所有数据再在程序中过滤，或先排序再过滤，会浪费数据库资源。
- **解决方案**：WHERE 子句尽量放在最前面，先过滤再排序/限制，比如：

  ```sql
  -- 低效（先排序所有数据，再过滤）
  SELECT name, score FROM student ORDER BY score DESC WHERE class = '高一(1)班';

  -- 高效（先过滤，再排序）
  SELECT name, score FROM student WHERE class = '高一(1)班' ORDER BY score DESC;
  ```

### 4.6.3 避免在 WHERE 子句中使用函数/运算

- **问题**：在 WHERE 子句中对字段使用函数或运算，会导致索引失效（后续章节详解索引），数据库不得不扫描全表。
- **示例（低效）**：

  ```sql
  -- 对age字段做运算，索引失效
  SELECT name, age FROM student WHERE age + 1 = 19;

  -- 对score字段用函数，索引失效
  SELECT name, score FROM student WHERE ROUND(score) = 90;
  ```

- **解决方案**：将运算/函数移到等号右侧，避免操作字段：
  ```sql
  -- 优化后
  SELECT name, age FROM student WHERE age = 18;
  SELECT name, score FROM student WHERE score BETWEEN 89.5 AND 90.5;
  ```

### 4.6.4 LIMIT 用于分页时的优化

- **问题**：当 offset 很大时（比如 `LIMIT 10000, 10`），数据库需要先扫描前10000行再跳过，效率低。
- **解决方案（基础版）**：用主键/索引字段分页，比如：
  ```sql
  -- 假设id是主键，先查上一页最后一个id（比如10000），再查大于该id的10行
  SELECT name, age FROM student WHERE id > 10000 LIMIT 10;
  ```

### 4.6.5 避免在小表上过度优化

- 注意：以上优化点主要针对**数据量大的表**（万级以上），若表只有几十/几百行数据，简单查询的性能差异可以忽略，优先保证代码可读性。

### 总结

1. SQL 分为 DQL/DML/DDL/DCL 四类，本章核心是 DQL（SELECT 查询），其执行需经过解析、优化、执行、返回四个步骤；
2. 基础查询需掌握“查什么（SELECT）、从哪查（FROM）、筛什么（WHERE）、怎么排（ORDER BY）、取多少（LIMIT）”的核心逻辑；
3. WHERE 子句可配合比较运算符、AND/OR/NOT 实现复杂筛选，模糊查询用 LIKE（%匹配任意字符，\_匹配单个字符）；
4. NULL 值需用 IS NULL/IS NOT NULL 判断，可通过 IFNULL 函数替换为空值；DISTINCT 用于去除重复行；
5. 基础查询性能优化核心：避免 SELECT \*、提前过滤、不在 WHERE 中操作字段、合理使用 LIMIT。

本章掌握的基础查询是 SQL 的核心，后续会在此基础上讲解聚合查询、联表查询、子查询等进阶内容。建议多动手练习不同的查询场景，比如“查询每个班级的平均成绩”“查询年龄最大的女生”，加深对语法的理解。
