# MySQL 数据库应用指南：第8章 MySQL索引原理与优化实践

索引是 MySQL 性能优化的“核心武器”——一个合理的索引能让百万级数据的查询从秒级降至毫秒级，而糟糕的索引设计则会导致查询效率低下、DML 操作卡顿。本章将从索引底层原理入手，结合实战案例讲解索引的类型、使用规则、失效场景及优化方法，帮你真正掌握索引的“增删改查”与调优思路。

## 8.1 索引的核心原理与数据结构（B+树）

要理解索引为何能加速查询，首先要搞清楚其底层数据结构——MySQL 中绝大多数索引（InnoDB 引擎）基于 **B+树** 实现，而非哈希、二叉树等结构，这是由数据库的查询特性决定的。

### 8.1.1 为什么选择 B+树？

先对比几种常见数据结构的特点，理解 B+树的优势：
| 数据结构 | 查找效率 | 范围查询 | 磁盘适配性 | 适用场景 |
|----------|----------|----------|------------|----------|
| 哈希表 | O(1)（精准查询） | 极差（无法排序） | 差 | 键值对缓存（如 Redis） |
| 二叉查找树 | O(logn)（理想） | 一般 | 差 | 内存小数据量 |
| B+树 | O(logn) | 优秀（叶子节点有序链表） | 优（磁盘块适配） | 数据库索引（磁盘存储） |

MySQL 数据存储在磁盘上，查询时需减少磁盘 I/O 次数（磁盘访问比内存慢数万倍）。B+树的设计恰好适配磁盘特性：

1. **层级低**：B+树是多路平衡树（非二叉），百万级数据仅需 3-4 层，查询时只需 3-4 次磁盘 I/O；
2. **叶子节点有序**：所有数据都存在叶子节点，且叶子节点通过双向链表连接，极适合范围查询（如 `WHERE id BETWEEN 100 AND 200`）；
3. **非叶子节点只存索引**：非叶子节点仅存储索引键和指针，不存数据，能容纳更多索引项，进一步降低树的层级。

### 8.1.2 B+树索引的核心结构（图解）

```mermaid
graph TD
    A[非叶子节点（根）] --> B[非叶子节点（层级1）]
    A --> C[非叶子节点（层级1）]
    B --> D[叶子节点：1,3,5]
    B --> E[叶子节点：7,9,11]
    C --> F[叶子节点：13,15,17]
    C --> G[叶子节点：19,21,23]
    D <--> E <--> F <--> G  # 叶子节点双向链表
```

- **非叶子节点**：仅存储索引键（如 id）和指向子节点的指针，不存完整数据；
- **叶子节点**：存储完整的索引键 + 数据行（主键索引）或索引键 + 主键值（二级索引）；
- **双向链表**：叶子节点按索引键排序，支持快速范围查询。

### 8.1.3 索引的查询流程（以主键查询为例）

1. 从根节点开始，根据索引键（如 id=10）找到对应的子节点指针；
2. 逐层向下查找，直到定位到叶子节点；
3. 在叶子节点中找到 id=10 的数据行，返回结果。

> 补充：InnoDB 是“聚簇索引”设计，主键索引的叶子节点直接存储整行数据，二级索引（如普通索引、唯一索引）的叶子节点存储主键值，查询时需先查二级索引，再通过主键索引回表取数据（称为“回表查询”）。

## 8.2 主键索引、唯一索引、普通索引的差异

MySQL 索引按功能可分为三大核心类型，其底层均为 B+树，但约束、存储、查询逻辑存在关键差异。

### 8.2.1 核心差异对比

| 索引类型 | 关键字      | 约束规则                 | 叶子节点存储         | 查询特点             | 适用场景                         |
| -------- | ----------- | ------------------------ | -------------------- | -------------------- | -------------------------------- |
| 主键索引 | PRIMARY KEY | 唯一 + 非空（单表仅1个） | 整行数据（聚簇索引） | 无需回表，查询最快   | 表的唯一标识（如 id）            |
| 唯一索引 | UNIQUE      | 唯一（可含 NULL，多个）  | 主键值（二级索引）   | 需回表，有唯一性校验 | 唯一标识字段（如手机号、订单号） |
| 普通索引 | INDEX       | 无约束（可重复）         | 主键值（二级索引）   | 需回表，无校验       | 高频查询字段（如价格、创建时间） |

### 8.2.2 实战示例：创建与查询对比

```sql
-- 创建测试表，包含三种索引
CREATE TABLE product (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 主键索引
  product_no VARCHAR(30) UNIQUE,     -- 唯一索引
  price DECIMAL(10,2),               -- 普通索引
  INDEX idx_price (price)            -- 普通索引
) CHARSET=utf8mb4;

-- 插入测试数据
INSERT INTO product (product_no, price) VALUES
('P001', 99.9), ('P002', 199.9), ('P003', 99.9);

-- 1. 主键索引查询（无需回表）
SELECT * FROM product WHERE id = 1;

-- 2. 唯一索引查询（需回表）
SELECT * FROM product WHERE product_no = 'P001';

-- 3. 普通索引查询（需回表，可重复）
SELECT * FROM product WHERE price = 99.9;
```

### 8.2.3 关键注意事项

1. **主键索引的选择**：
   - 优先用自增 INT/BIGINT 作为主键（B+树节点分裂均匀，性能最优）；
   - 避免用UUID、字符串作为主键（值无序，导致节点频繁分裂，索引碎片化）；
2. **唯一索引的代价**：
   - 插入/更新时需校验唯一性，性能略低于普通索引；
   - 若业务层已保证唯一性，可改用普通索引（如订单号，业务层去重）；
3. **NULL 值处理**：
   - 唯一索引允许多个 NULL（NULL 不等于任何值）；
   - 普通索引无限制，NULL 会正常存储。

## 8.3 联合索引的创建与最左匹配原则

联合索引（复合索引）是多个字段组成的索引（如 `INDEX (a,b,c)`），是优化多条件查询的核心手段，但其使用必须遵循“最左匹配原则”，否则会失效。

### 8.3.1 联合索引的结构

联合索引的 B+树按“最左字段”排序，其次是第二个字段，以此类推。例如创建 `INDEX (class_id, age, score)`，索引排序规则：

1. 先按 `class_id` 升序；
2. `class_id` 相同，按 `age` 升序；
3. `age` 相同，按 `score` 升序。

### 8.3.2 最左匹配原则详解

查询条件中必须包含联合索引的“最左字段”，索引才会生效，且生效范围随条件匹配度递减：
| 联合索引 | 查询条件 | 索引生效情况 |
|----------|----------|--------------|
| (a,b,c) | WHERE a=1 | 全生效（a） |
| (a,b,c) | WHERE a=1 AND b=2 | 全生效（a,b） |
| (a,b,c) | WHERE a=1 AND b=2 AND c=3 | 全生效（a,b,c） |
| (a,b,c) | WHERE b=2 | 完全失效 |
| (a,b,c) | WHERE a=1 AND c=3 | 仅a生效（c失效） |
| (a,b,c) | WHERE a=1 AND b>2 AND c=3 | a,b生效（c失效） |

### 8.3.3 联合索引创建与使用示例

```sql
-- 创建学生表，添加联合索引 (class_id, age)
CREATE TABLE student (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT,
  age INT,
  score FLOAT,
  INDEX idx_class_age (class_id, age)  -- 联合索引
) CHARSET=utf8mb4;

-- 插入测试数据
INSERT INTO student (class_id, age, score) VALUES
(1, 18, 90), (1, 19, 85), (2, 18, 95), (2, 19, 80);

-- 示例1：符合最左匹配，索引全生效
SELECT * FROM student WHERE class_id = 1 AND age = 18;

-- 示例2：仅匹配最左字段，索引部分生效
SELECT * FROM student WHERE class_id = 1;

-- 示例3：跳过最左字段，索引失效
SELECT * FROM student WHERE age = 18;  -- 全表扫描

-- 示例4：字段顺序不影响（MySQL优化器会调整）
SELECT * FROM student WHERE age = 18 AND class_id = 1;  -- 索引仍生效
```

### 8.3.4 联合索引设计原则

1. **高频字段放左侧**：将 WHERE 子句中最常用、基数高的字段放在联合索引最左侧（如 class_id 比 age 更常用）；
2. **覆盖索引优先**：若查询字段均包含在联合索引中，MySQL 会直接从索引取值，无需回表（称为“覆盖索引”）：
   ```sql
   -- 覆盖索引：查询字段（class_id, age）均在联合索引中，无需回表
   SELECT class_id, age FROM student WHERE class_id = 1;
   ```
3. **避免冗余联合索引**：若已有 `(a,b)`，无需再创建 `(a)`（`(a,b)` 已包含 `(a)` 的索引能力）；
4. **控制长度**：联合索引字段总数不宜过多（≤3个），过长会增加索引存储和维护成本。

## 8.4 索引失效的常见场景与规避方法

索引失效是新手最易踩的坑——明明创建了索引，查询却走全表扫描。以下是高频失效场景及规避方案。

### 8.4.1 场景1：字段参与函数/运算

**问题**：WHERE 子句中对索引字段使用函数、算术运算，会导致索引失效（MySQL 无法利用索引排序）。

```sql
-- 失效示例：age字段参与运算
SELECT * FROM student WHERE age + 1 = 19;

-- 失效示例：create_time字段使用函数
SELECT * FROM product WHERE DATE(create_time) = '2026-01-01';
```

**规避方法**：将函数/运算移到等号右侧，避免操作索引字段：

```sql
-- 优化后：age字段无运算，索引生效
SELECT * FROM student WHERE age = 18;

-- 优化后：create_time无函数，索引生效
SELECT * FROM product WHERE create_time >= '2026-01-01 00:00:00' AND create_time < '2026-01-02 00:00:00';
```

### 8.4.2 场景2：使用不等于/NOT IN

**问题**：`!=`/`<>`/`NOT IN` 会导致索引失效（无法利用 B+树的有序性）。

```sql
-- 失效示例
SELECT * FROM student WHERE class_id != 1;
SELECT * FROM student WHERE class_id NOT IN (1,2);
```

**规避方法**：尽量用范围查询替代，或业务层过滤（数据量小时）：

```sql
-- 优化后（若class_id只有1/2/3）
SELECT * FROM student WHERE class_id = 3;
```

### 8.4.3 场景3：使用 LIKE 通配符开头

**问题**：`LIKE '%xxx'` 会导致索引失效（无法匹配最左前缀），`LIKE 'xxx%'` 则生效。

```sql
-- 失效示例：%开头
SELECT * FROM product WHERE name LIKE '%手机';

-- 生效示例：%结尾
SELECT * FROM product WHERE name LIKE '小米%';
```

**规避方法**：

- 若需模糊匹配后缀，可考虑字段反转存储（如 name 存“机手小”，查询 `LIKE '机手%'`）；
- 大数据量场景用全文索引（FULLTEXT）替代 LIKE。

### 8.4.4 场景4：字段类型不匹配

**问题**：查询值的类型与索引字段类型不匹配，MySQL 会隐式转换，导致索引失效。

```sql
-- 失效示例：product_no是VARCHAR类型，查询用数字（隐式转换）
SELECT * FROM product WHERE product_no = 1001;
```

**规避方法**：保证查询值类型与字段类型一致：

```sql
-- 优化后：字符串类型匹配，索引生效
SELECT * FROM product WHERE product_no = '1001';
```

### 8.4.5 场景5：OR 连接无索引字段

**问题**：OR 连接的字段中，若有一个字段无索引，整个查询索引失效。

```sql
-- 失效示例：score无索引，导致class_id索引也失效
SELECT * FROM student WHERE class_id = 1 OR score = 90;
```

**规避方法**：

- 给所有 OR 连接的字段加索引；
- 用 UNION 替代 OR（适用于大数据量）：
  ```sql
  SELECT * FROM student WHERE class_id = 1
  UNION
  SELECT * FROM student WHERE score = 90;
  ```

### 8.4.6 场景6：联合索引违反最左匹配

**问题**：跳过联合索引的最左字段，或中间字段用范围查询，导致后续字段索引失效（见 8.3.2 节）。

```sql
-- 失效示例：跳过最左字段class_id
SELECT * FROM student WHERE age = 18;

-- 失效示例：age用范围查询，score索引失效
SELECT * FROM student WHERE class_id = 1 AND age > 18 AND score = 90;
```

**规避方法**：严格遵循最左匹配原则，调整字段顺序或拆分索引。

### 8.4.7 索引失效通用排查方法

1. 用 `EXPLAIN` 查看执行计划（8.5 节详解），若 `type` 为 `ALL` 表示全表扫描（索引失效）；
2. 检查 WHERE 子句是否符合上述场景，逐一修正；
3. 简化查询条件，逐步添加条件，定位失效的具体条件。

## 8.5 索引优化的工具（EXPLAIN）使用详解

`EXPLAIN` 是 MySQL 自带的执行计划分析工具，能直观展示查询语句的执行方式（是否走索引、扫描行数、连接方式等），是索引优化的“必备神器”。

### 8.5.1 EXPLAIN 基本用法

在查询语句前加 `EXPLAIN`，即可输出执行计划：

```sql
-- 基本用法
EXPLAIN SELECT * FROM student WHERE class_id = 1 AND age = 18;

-- 输出结果（核心字段）：
+----+-------------+---------+------------+------+---------------+---------------+---------+-------------+------+----------+-------+
| id | select_type | table   | partitions | type | possible_keys | key           | key_len | ref         | rows | filtered | Extra |
+----+-------------+---------+------------+------+---------------+---------------+---------+-------------+------+----------+-------+
|  1 | SIMPLE      | student | NULL       | ref  | idx_class_age | idx_class_age | 8       | const,const |    1 |   100.00 | NULL  |
+----+-------------+---------+------------+------+---------------+---------------+---------+-------------+------+----------+-------+
```

### 8.5.2 核心字段详解

#### 1. `type`：访问类型（最重要字段）

表示 MySQL 查找数据的方式，从优到劣排序：

- `system`：表只有1行（系统表），最优；
- `const`：通过主键/唯一索引查询，仅匹配1行；
- `eq_ref`：联表查询中，主键/唯一索引匹配；
- `ref`：普通索引匹配（可多行）；
- `range`：范围查询（如 BETWEEN、>、<）；
- `index`：扫描整个索引（未走数据行）；
- `ALL`：全表扫描（最差，索引失效）。

**优化目标**：至少达到 `range`，最好是 `ref`/`const`。

#### 2. `key`：实际使用的索引

- 若为 `NULL`，表示未使用索引；
- 若不为 `NULL`，表示使用的索引名（如 `idx_class_age`）。

#### 3. `rows`：预估扫描行数

数值越小越好，若远大于实际数据量，说明索引失效或统计信息过时。

#### 4. `Extra`：额外信息（关键）

- `Using index`：使用覆盖索引（无需回表，最优）；
- `Using where`：WHERE 子句过滤数据（正常）；
- `Using filesort`：文件排序（需优化，未走索引排序）；
- `Using temporary`：使用临时表（需优化，如 GROUP BY 无索引）；
- `Using index condition`：索引下推（MySQL 5.6+，优化回表）。

### 8.5.3 EXPLAIN 实战优化示例

#### 示例1：索引失效优化

```sql
-- 原查询（索引失效，type=ALL）
EXPLAIN SELECT * FROM student WHERE age + 1 = 19;

-- 优化后（索引生效，type=ref）
EXPLAIN SELECT * FROM student WHERE age = 18;
```

#### 示例2：覆盖索引优化

```sql
-- 原查询（需回表，Extra无Using index）
EXPLAIN SELECT * FROM student WHERE class_id = 1;

-- 优化后（覆盖索引，Extra=Using index）
EXPLAIN SELECT class_id, age FROM student WHERE class_id = 1;
```

#### 示例3：避免文件排序

```sql
-- 原查询（Using filesort，排序未走索引）
EXPLAIN SELECT * FROM student WHERE class_id = 1 ORDER BY score;

-- 优化后（创建联合索引 (class_id, score)，消除文件排序）
ALTER TABLE student ADD INDEX idx_class_score (class_id, score);
EXPLAIN SELECT * FROM student WHERE class_id = 1 ORDER BY score;
```

### 8.5.4 EXPLAIN 使用技巧

1. 重点关注 `type`、`key`、`rows`、`Extra` 四个字段；
2. 先优化 `type=ALL` 的查询（全表扫描）；
3. 消除 `Using filesort` 和 `Using temporary`（性能杀手）；
4. 对比优化前后的 `rows` 数值，验证优化效果。

## 8.6 大表索引的创建与维护技巧

大表（百万/千万级数据）的索引操作需格外谨慎——直接创建/删除索引会锁表、占用大量资源，甚至导致业务中断。以下是针对性的优化技巧。

### 8.6.1 大表创建索引的优化

#### 1. 选择低峰期操作

避开业务高峰（如白天、促销期），选择凌晨 2-4 点执行，减少对业务的影响。

#### 2. 禁用非必要功能

创建索引前临时禁用以下功能，提升速度：

```sql
-- 禁用自动提交
SET AUTOCOMMIT = 0;
-- 禁用唯一性校验（仅临时，创建后恢复）
SET UNIQUE_CHECKS = 0;
-- 禁用外键校验（仅临时）
SET FOREIGN_KEY_CHECKS = 0;

-- 创建索引
ALTER TABLE big_table ADD INDEX idx_create_time (create_time);

-- 恢复配置
SET AUTOCOMMIT = 1;
SET UNIQUE_CHECKS = 1;
SET FOREIGN_KEY_CHECKS = 1;
```

#### 3. 用 ONLINE DDL（无锁创建）

MySQL 5.6+ 支持 `ALGORITHM=INPLACE`（无锁）和 `LOCK=NONE`（不锁表），避免长时间锁表：

```sql
ALTER TABLE big_table ADD INDEX idx_price (price)
ALGORITHM=INPLACE LOCK=NONE;
```

> 官方文档：https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl.html

#### 4. 分批创建（极端场景）

若表数据量超亿级，可先将数据分批导入临时表，创建索引后再替换原表：

```sql
-- 1. 创建临时表，结构与原表一致
CREATE TABLE big_table_temp LIKE big_table;
-- 2. 给临时表创建索引
ALTER TABLE big_table_temp ADD INDEX idx_id (id);
-- 3. 分批导入数据（每次10万行）
INSERT INTO big_table_temp SELECT * FROM big_table WHERE id BETWEEN 1 AND 100000;
-- 4. 替换原表
RENAME TABLE big_table TO big_table_old, big_table_temp TO big_table;
```

### 8.6.2 大表索引维护技巧

#### 1. 定期清理冗余索引

冗余索引会增加 DML 开销，用以下语句查找冗余索引：

```sql
-- 查询冗余索引（需 INFORMATION_SCHEMA 权限）
SELECT
  TABLE_NAME,
  INDEX_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'your_db'
AND INDEX_NAME NOT IN ('PRIMARY')
ORDER BY TABLE_NAME, INDEX_NAME;
```

#### 2. 重建碎片化索引

索引使用久了会产生碎片（如频繁删除数据），导致查询效率下降，可重建索引：

```sql
-- 重建索引（推荐，无锁）
ALTER TABLE big_table FORCE INDEX (idx_create_time);

-- 或删除后重建（锁表，不推荐）
DROP INDEX idx_create_time ON big_table;
ALTER TABLE big_table ADD INDEX idx_create_time (create_time);
```

#### 3. 避免频繁修改索引

大表索引的创建/删除耗时极长（小时级），需提前规划，避免频繁变更。

#### 4. 监控索引使用情况

通过 `sys.schema_unused_indexes` 查看未使用的索引，及时清理：

```sql
-- 查看未使用的索引
SELECT * FROM sys.schema_unused_indexes WHERE table_schema = 'your_db';
```

### 8.6.3 大表索引操作的风险规避

1. **先测试后执行**：在从库/测试环境复现大表数据，验证索引操作的耗时和资源占用；
2. **备份优先**：操作前备份表数据（如 xtrabackup 物理备份）；
3. **监控资源**：执行过程中监控 CPU、IO、锁等待，发现异常立即终止；
4. **预留回滚方案**：若索引创建失败，需有快速回滚的方法（如删除临时索引）。

### 总结

1. MySQL 索引底层基于 B+树实现，其层级低、叶子节点有序的特性适配磁盘存储，是索引高效的核心原因；
2. 主键索引（聚簇索引）查询最快（无需回表），唯一索引有唯一性校验，普通索引无约束；
3. 联合索引必须遵循最左匹配原则，高频字段放左侧，优先设计覆盖索引；
4. 索引失效的核心场景：字段参与函数/运算、LIKE %开头、类型不匹配、违反最左匹配，需针对性规避；
5. EXPLAIN 是索引优化的核心工具，重点关注 type、key、rows、Extra 字段，优化目标是消除全表扫描和文件排序；
6. 大表索引操作需选择低峰期，使用 ONLINE DDL 减少锁表，定期清理冗余索引、重建碎片化索引。

索引优化是一个“持续迭代”的过程——没有一劳永逸的索引设计，需结合业务查询场景、数据量变化不断调整。掌握本章的原理和工具，你就能从“被动调优”变为“主动设计”，让 MySQL 始终保持高效运行。下一章将讲解 MySQL 事务与锁机制，进一步理解数据库的并发控制逻辑。
