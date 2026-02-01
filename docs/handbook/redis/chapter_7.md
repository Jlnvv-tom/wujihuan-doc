# MySQL 数据库应用指南：第7章 数据定义语言（DDL）深入

数据定义语言（DDL）是构建 MySQL 数据库结构的核心，涵盖数据表、字段、约束、索引、视图等对象的创建、修改与删除。不同于 DML 聚焦数据操作，DDL 决定了数据库的“骨架”——合理的 DDL 设计能提升数据存储效率、保证数据完整性，而糟糕的设计会导致性能瓶颈、数据混乱。本章将深入讲解 DDL 的核心知识点，帮你掌握规范的数据库结构设计思路。

## 7.1 数据表字段的数据类型详解与选择原则

MySQL 提供了丰富的数据类型，不同类型对应不同的存储场景和性能特征。选择合适的数据类型是 DDL 设计的第一步，也是避免后续性能问题的关键。

### 7.1.1 常用数据类型分类

MySQL 数据类型可分为 5 大类，以下是高频使用的类型及适用场景：

#### 1. 数值类型

| 类型           | 存储范围                          | 占用空间 | 适用场景                           |
| -------------- | --------------------------------- | -------- | ---------------------------------- |
| `TINYINT`      | -128 ~ 127（无符号 0~255）        | 1 字节   | 状态值（0/1）、性别（1/2）等小整数 |
| `INT`          | -2^31 ~ 2^31-1（无符号 0~2^32-1） | 4 字节   | 主键 ID、年龄、数量等常规整数      |
| `BIGINT`       | -2^63 ~ 2^63-1                    | 8 字节   | 超大整数（如订单号、雪花ID）       |
| `DECIMAL(M,D)` | 精准小数（M 总位数，D 小数位）    | 可变     | 金额、价格（避免浮点精度丢失）     |
| `FLOAT`        | 单精度浮点                        | 4 字节   | 非精准数值（如身高、体重）         |
| `DOUBLE`       | 双精度浮点                        | 8 字节   | 非精准大数（如科学计算）           |

**核心原则**：优先选最小够用的类型（如状态用 TINYINT 而非 INT）；金额必须用 DECIMAL，避免 FLOAT/DOUBLE 精度丢失。

#### 2. 字符串类型

| 类型         | 特点                 | 占用空间                | 适用场景                           |
| ------------ | -------------------- | ----------------------- | ---------------------------------- |
| `CHAR(N)`    | 固定长度，不足补空格 | N 字节（N≤255）         | 短字符串（手机号、身份证号、邮编） |
| `VARCHAR(N)` | 可变长度，按需存储   | 1~2 字节 + 实际长度     | 名称、地址、描述等变长字符串       |
| `TEXT`       | 长文本               | 可变（最大 65535 字节） | 文章内容、备注等长文本             |
| `LONGTEXT`   | 超长文本             | 可变（最大 4GB）        | 超大文本（如日志、富文本）         |

**核心原则**：固定长度用 CHAR（如手机号 11 位），可变长度用 VARCHAR；长文本优先用 TEXT，避免 VARCHAR 过长导致行溢出。

#### 3. 日期时间类型

| 类型        | 格式                | 占用空间 | 适用场景                         |
| ----------- | ------------------- | -------- | -------------------------------- |
| `DATE`      | YYYY-MM-DD          | 3 字节   | 生日、日期等仅需日期的场景       |
| `TIME`      | HH:MM:SS            | 3 字节   | 时间点（如上课时间）             |
| `DATETIME`  | YYYY-MM-DD HH:MM:SS | 8 字节   | 记录时间（如创建时间、更新时间） |
| `TIMESTAMP` | YYYY-MM-DD HH:MM:SS | 4 字节   | 时间戳（自动更新、时区转换）     |

**核心原则**：DATETIME 无时区问题，适合业务时间；TIMESTAMP 占用空间小，支持自动更新（如 `ON UPDATE CURRENT_TIMESTAMP`）。

#### 4. 枚举/集合类型

- `ENUM('值1','值2',...)`：枚举类型，只能选其中一个值（如性别 `ENUM('男','女')`）；
- `SET('值1','值2',...)`：集合类型，可多选（如爱好 `SET('读书','运动','音乐')`）。

#### 5. 特殊类型

- `BOOLEAN`：布尔类型（等价于 TINYINT(1)，0 为 false，1 为 true）；
- `JSON`：JSON 格式数据（MySQL 5.7+ 支持），适合存储非结构化数据（如配置、扩展字段）。

### 7.1.2 数据类型选择原则

1. **最小够用**：避免用 BIGINT 存储年龄、INT 存储状态，减少存储空间和 IO 开销；
2. **精准优先**：金额、价格用 DECIMAL，不用浮点类型；
3. **字符集匹配**：字符串字段统一用 `utf8mb4`，支持 emoji 和特殊字符；
4. **避免过度设计**：不要用 TEXT 存储短字符串，不要用 VARCHAR(255) 存储固定长度的手机号；
5. **考虑索引**：过长的 VARCHAR 字段不适合做索引（索引长度有限制）。

### 7.1.3 反例与优化示例

```sql
-- 反例：字段类型选择不合理
CREATE TABLE bad_design (
  id BIGINT,  -- 普通主键用BIGINT，浪费空间
  age FLOAT,  -- 年龄用浮点，无意义
  phone VARCHAR(255),  -- 手机号固定11位，用CHAR(11)更优
  price DOUBLE  -- 价格用浮点，精度丢失
);

-- 优化后
CREATE TABLE good_design (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 普通主键用INT足够
  age TINYINT,  -- 年龄最大100+，TINYINT够用
  phone CHAR(11),  -- 固定长度用CHAR
  price DECIMAL(10,2)  -- 价格用DECIMAL保证精准
);
```

## 7.2 字段约束（主键、外键、唯一、非空、默认值）

字段约束是保证数据完整性的核心机制，通过约束可避免脏数据（如非空字段插入 NULL、唯一字段重复），减少业务层校验逻辑。

### 7.2.1 核心约束类型

| 约束       | 关键字        | 作用                               | 示例                                            |
| ---------- | ------------- | ---------------------------------- | ----------------------------------------------- |
| 非空约束   | `NOT NULL`    | 字段不能为空                       | `name VARCHAR(50) NOT NULL`                     |
| 默认值约束 | `DEFAULT`     | 字段未赋值时用默认值               | `status TINYINT DEFAULT 0`                      |
| 唯一约束   | `UNIQUE`      | 字段值唯一（可多个 NULL）          | `phone CHAR(11) UNIQUE`                         |
| 主键约束   | `PRIMARY KEY` | 唯一标识记录（非空+唯一）          | `id INT PRIMARY KEY AUTO_INCREMENT`             |
| 外键约束   | `FOREIGN KEY` | 关联另一张表的主键，保证引用完整性 | `class_id INT FOREIGN KEY REFERENCES class(id)` |

### 7.2.2 约束实战示例

```sql
-- 创建带完整约束的学生表
CREATE TABLE student (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 主键，自增
  name VARCHAR(50) NOT NULL,         -- 非空
  gender ENUM('男','女') DEFAULT '男',  -- 默认值
  phone CHAR(11) UNIQUE,             -- 唯一
  class_id INT,                      -- 外键关联班级表
  -- 外键约束定义
  FOREIGN KEY (class_id) REFERENCES class(id)
    ON DELETE SET NULL  -- 班级删除时，学生class_id设为NULL
    ON UPDATE CASCADE   -- 班级ID更新时，学生class_id同步更新
) CHARSET=utf8mb4;

-- 创建班级表（被外键关联，需先创建）
CREATE TABLE class (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_name VARCHAR(20) NOT NULL UNIQUE
);
```

### 7.2.3 约束使用注意事项

1. **主键设计**：
   - 优先用自增 INT/BIGINT 作为主键（性能最优）；
   - 单表只能有一个主键，复合主键（多个字段）尽量避免；
2. **外键约束**：
   - InnoDB 支持外键，MyISAM 不支持；
   - 外键会增加性能开销（关联校验），高并发场景可在业务层保证引用完整性，不建外键；
   - `ON DELETE/UPDATE` 需谨慎：避免 `ON DELETE CASCADE`（级联删除，易误删数据）；
3. **唯一约束**：可创建复合唯一索引（如 `UNIQUE (name, phone)`），保证组合值唯一；
4. **非空约束**：核心字段（如名称、金额）必须加 NOT NULL，避免 NULL 导致的查询/计算问题。

## 7.3 数据表结构的修改（ALTER TABLE）操作

表创建后，常因需求变更需要修改结构（如新增字段、修改类型、删除约束），`ALTER TABLE` 是 DDL 中最常用的修改命令，需谨慎使用（尤其生产环境）。

### 7.3.1 ALTER TABLE 核心语法

```sql
ALTER TABLE 表名
[ADD 字段名 类型 [约束],  -- 新增字段
 MODIFY 字段名 新类型 [约束],  -- 修改字段类型/约束
 CHANGE 旧字段名 新字段名 类型 [约束],  -- 重命名字段
 DROP 字段名,  -- 删除字段
 ADD CONSTRAINT 约束名 约束类型(字段名)];  -- 新增约束
```

### 7.3.2 常见修改场景示例

#### 示例1：新增字段

```sql
-- 给student表新增“邮箱”字段（允许空，唯一）
ALTER TABLE student
ADD COLUMN email VARCHAR(100) UNIQUE NULL AFTER phone;
-- AFTER phone：指定字段位置（可选，默认加在最后）
```

#### 示例2：修改字段类型/约束

```sql
-- 将student表的phone字段从CHAR(11)改为VARCHAR(20)（支持国际手机号）
ALTER TABLE student
MODIFY COLUMN phone VARCHAR(20) UNIQUE NOT NULL;

-- 注意：修改类型时需确保现有数据兼容（如CHAR转VARCHAR无问题，INT转TINYINT需检查值范围）
```

#### 示例3：重命名字段

```sql
-- 将email字段重命名为user_email
ALTER TABLE student
CHANGE COLUMN email user_email VARCHAR(100) UNIQUE NULL;
```

#### 示例4：删除字段/约束

```sql
-- 删除user_email字段
ALTER TABLE student
DROP COLUMN user_email;

-- 删除phone字段的唯一约束（需先查约束名）
-- 1. 查约束名：SHOW INDEX FROM student WHERE Key_name = 'phone';
-- 2. 删除约束：
ALTER TABLE student
DROP INDEX phone;
```

#### 示例5：新增主键/外键

```sql
-- 给临时表新增主键
ALTER TABLE temp_table
ADD PRIMARY KEY (id);

-- 给student表新增外键（关联年级表）
ALTER TABLE student
ADD CONSTRAINT fk_student_grade
FOREIGN KEY (grade_id) REFERENCES grade(id);
```

### 7.3.3 ALTER TABLE 注意事项

1. **锁表风险**：修改大表结构（如千万级数据）会锁表，导致读写阻塞，生产环境需在低峰期操作；
2. **数据兼容**：修改字段类型前，先执行 `SELECT` 检查现有数据是否超出新类型范围；
3. **性能影响**：新增字段（尤其是非空且无默认值）会重写全表数据，耗时较长；
4. **备份优先**：修改表结构前务必备份表数据，避免操作失误导致数据丢失。

> 补充：MySQL 8.0 支持 `ALTER TABLE ... ALGORITHM=INPLACE`（无锁修改），可减少锁表时间，具体参考官方文档：https://dev.mysql.com/doc/refman/8.0/en/alter-table.html

## 7.4 索引的创建、查看与删除（基础）

索引是提升查询性能的核心手段，本质是“数据结构（B+树）”，能快速定位数据行，避免全表扫描。本节讲解基础索引操作，进阶优化见后续章节。

### 7.4.1 索引的基础概念

- **作用**：加速查询（SELECT），但会降低 DML（INSERT/UPDATE/DELETE）性能（需维护索引）；
- **核心类型**：
  - 主键索引（PRIMARY KEY）：默认创建，唯一且非空；
  - 唯一索引（UNIQUE）：字段值唯一，可含 NULL；
  - 普通索引（INDEX）：无唯一性约束，加速查询；
  - 复合索引：多个字段组成的索引（如 `INDEX (name, age)`）。

### 7.4.2 索引的创建

#### 1. 创建表时创建索引

```sql
CREATE TABLE goods (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 主键索引
  name VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  -- 普通索引
  INDEX idx_price (price),
  -- 唯一索引
  UNIQUE INDEX idx_name (name),
  -- 复合索引
  INDEX idx_name_price (name, price)
) CHARSET=utf8mb4;
```

#### 2. 表创建后创建索引（ALTER TABLE/ CREATE INDEX）

```sql
-- 方式1：ALTER TABLE（推荐，可创建所有类型索引）
ALTER TABLE goods
ADD INDEX idx_stock (stock);  -- 普通索引
ALTER TABLE goods
ADD UNIQUE INDEX idx_code (goods_code);  -- 唯一索引

-- 方式2：CREATE INDEX（仅创建普通/唯一索引）
CREATE INDEX idx_create_time ON goods(create_time);
CREATE UNIQUE INDEX idx_phone ON student(phone);
```

### 7.4.3 索引的查看

```sql
-- 查看表的所有索引
SHOW INDEX FROM goods;
-- 或
SHOW KEYS FROM goods;

-- 简化查看（只看索引名和字段）
SELECT INDEX_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_NAME = 'goods';
```

### 7.4.4 索引的删除

```sql
-- 方式1：ALTER TABLE
ALTER TABLE goods
DROP INDEX idx_price;  -- 删除普通索引
ALTER TABLE goods
DROP INDEX idx_name;   -- 删除唯一索引

-- 方式2：DROP INDEX
DROP INDEX idx_create_time ON goods;

-- 注意：主键索引不能直接DROP，需先修改：
ALTER TABLE goods
DROP PRIMARY KEY;
```

### 7.4.5 基础索引使用原则

1. **索引不是越多越好**：每张表建议索引数≤5个，过多会降低 DML 性能；
2. **适合索引的字段**：WHERE 子句中频繁筛选的字段（如 price、create_time）、JOIN 关联字段；
3. **不适合索引的字段**：
   - 低基数字段（如性别、状态，值只有几种）；
   - 频繁更新的字段；
   - 过长的字符串字段（可截取前缀索引）；
4. **复合索引遵循最左匹配**：创建 `INDEX (a,b,c)`，查询条件需包含 a 才能触发索引（如 WHERE a=1、WHERE a=1 AND b=2 生效，WHERE b=2 不生效）。

## 7.5 视图的创建与基础使用

视图（View）是基于查询结果的“虚拟表”，不存储实际数据，仅保存查询逻辑。视图可简化复杂查询、控制数据访问权限，是数据库设计的常用工具。

### 7.5.1 视图的核心作用

1. **简化复杂查询**：将多表关联、聚合的复杂查询封装为视图，调用时只需 `SELECT * FROM 视图名`；
2. **权限控制**：只开放视图权限，不开放原表权限（如只让用户查看订单的部分字段）；
3. **数据抽象**：屏蔽表结构变更，视图逻辑不变，业务层无需修改。

### 7.5.2 视图的创建

#### 语法：

```sql
CREATE [OR REPLACE] VIEW 视图名 [(字段别名)]
AS
SELECT 查询语句
[WITH CHECK OPTION];  -- 保证通过视图修改的数据符合查询条件
```

#### 示例1：创建简单视图

```sql
-- 创建“学生成绩视图”（关联学生表和成绩表）
CREATE VIEW v_student_score AS
SELECT s.name, s.class_id, sc.subject, sc.score
FROM student s
LEFT JOIN score sc ON s.id = sc.student_id;

-- 调用视图（和普通表用法一致）
SELECT * FROM v_student_score WHERE class_id = 1;
```

#### 示例2：创建带筛选的视图（权限控制）

```sql
-- 创建“仅显示高一(1)班学生的视图”
CREATE VIEW v_class1_student AS
SELECT id, name, age FROM student WHERE class_id = 1
WITH CHECK OPTION;  -- 确保通过视图新增/修改的学生class_id=1

-- 通过视图新增数据（会自动满足class_id=1）
INSERT INTO v_class1_student (name, age) VALUES ('周九', 18);
-- 执行后，student表中该记录的class_id=1（视图自动补充）
```

### 7.5.3 视图的查看与修改

```sql
-- 查看所有视图
SHOW VIEWS;

-- 查看视图创建语句
SHOW CREATE VIEW v_student_score;

-- 修改视图（替换原有逻辑）
CREATE OR REPLACE VIEW v_student_score AS
SELECT s.name, c.class_name, sc.subject, sc.score
FROM student s
LEFT JOIN class c ON s.class_id = c.id
LEFT JOIN score sc ON s.id = sc.student_id;
```

### 7.5.4 视图的删除

```sql
DROP VIEW IF EXISTS v_student_score;

-- 批量删除
DROP VIEW IF EXISTS v_class1_student, v_student_score;
```

### 7.5.5 视图使用注意事项

1. **性能问题**：视图本质是执行查询语句，复杂视图（多表关联+聚合）查询效率低，不宜过度使用；
2. **更新限制**：包含聚合函数、DISTINCT、JOIN 的视图无法更新（INSERT/UPDATE/DELETE）；
3. **权限控制**：创建视图需 `CREATE VIEW` 权限，调用视图需原表的查询权限；
4. **避免嵌套视图**：视图调用视图会大幅降低性能，尽量直接基于原表创建。

## 7.6 DDL操作对数据库性能的影响

DDL 操作（建表、改表、建索引、删索引）看似是“结构调整”，实则会直接影响数据库性能，尤其是生产环境的大表操作，需重点关注。

### 7.6.1 不同DDL操作的性能影响

| DDL操作                     | 性能影响                 | 风险点               |
| --------------------------- | ------------------------ | -------------------- |
| 创建表（CREATE TABLE）      | 低（仅创建元数据）       | 无                   |
| 新增字段（ALTER TABLE ADD） | 中-高（大表需重写数据）  | 锁表、IO 飙升        |
| 修改字段类型（MODIFY）      | 高（全表数据重写）       | 长时间锁表、业务阻塞 |
| 删除字段（DROP COLUMN）     | 中（大表需清理数据）     | 锁表、数据不可逆     |
| 创建索引（ADD INDEX）       | 高（需扫描全表构建索引） | 锁表、CPU/IO 占用高  |
| 删除索引（DROP INDEX）      | 低（仅删除元数据）       | 无                   |
| 创建视图（CREATE VIEW）     | 无（仅保存查询逻辑）     | 无                   |

### 7.6.2 生产环境DDL操作优化建议

1. **选择低峰期操作**：如凌晨 2-4 点，减少对业务的影响；
2. **大表操作分批/异步**：
   - 新增索引：用 `ALTER TABLE ... ALGORITHM=INPLACE`（MySQL 8.0），避免锁表；
   - 修改表结构：先在从库测试，再同步到主库；或用第三方工具（如 pt-online-schema-change）无锁改表；
3. **避免频繁DDL**：表结构设计尽量前置，上线后减少修改；
4. **监控资源占用**：执行 DDL 时监控 CPU、IO、锁等待，发现异常立即终止；
5. **索引创建优化**：
   - 先删除大表的冗余索引，再创建新索引；
   - 避免在业务高峰创建索引（索引构建会扫描全表，占用 IO）。

### 7.6.3 风险规避措施

1. **操作前备份**：执行 ALTER TABLE、DROP INDEX 前，备份表数据（mysqldump 或物理备份）；
2. **先测试后执行**：在测试环境复现生产数据量，验证 DDL 操作的耗时和影响；
3. **限制DDL权限**：仅授权 DBA 执行 DDL 操作，开发人员禁止直接操作生产库。

### 总结

1. 数据类型选择需遵循“最小够用、精准优先”原则，金额用 DECIMAL、固定长度字符串用 CHAR、可变长度用 VARCHAR；
2. 字段约束是数据完整性的保障，主键非空且唯一，外键谨慎使用，核心字段加非空约束；
3. ALTER TABLE 需注意锁表风险，生产环境大表修改优先用无锁算法，低峰期操作；
4. 索引能加速查询但会降低 DML 性能，遵循“最左匹配”原则，避免过度索引；
5. 视图简化复杂查询、控制权限，但复杂视图会影响性能，避免嵌套使用；
6. 生产环境执行 DDL 前务必备份、测试，选择低峰期操作，监控资源占用。

本章的 DDL 知识是数据库设计的核心，合理的表结构、约束、索引设计，能让后续的 DML、查询操作事半功倍。建议在设计表时，先梳理业务场景，明确字段类型和约束，再逐步优化索引和视图，避免“先上线再优化”的被动局面。下一章将深入讲解索引原理与性能优化，进一步提升数据库操作效率。
