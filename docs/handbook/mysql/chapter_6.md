# MySQL 数据库应用指南：第6章 数据操纵语言（DML）实战

在前几章掌握了数据库查询能力后，本章聚焦数据的“增、删、改”核心操作——数据操纵语言（DML）。DML 是日常开发中与业务结合最紧密的 SQL 语法，包括 INSERT（插入）、UPDATE（更新）、DELETE（删除）三大核心命令。掌握这些操作的语法、场景和避坑技巧，既能保证数据操作的准确性，也能避免因误操作导致的数据丢失，是 MySQL 实战能力的关键一环。

## 6.1 插入数据（INSERT）的多种语法形式

INSERT 用于向数据表中新增记录，MySQL 提供了多种语法形式，适配单条插入、批量插入、指定字段插入等不同场景，灵活度极高。

### 6.1.1 基础插入语法（指定字段）

这是最规范、最推荐的插入方式，明确指定要插入的字段，即使表结构变更（新增字段），也不会影响插入操作。

#### 语法：

```sql
INSERT INTO 表名 (字段1, 字段2, ..., 字段n)
VALUES (值1, 值2, ..., 值n);
```

#### 实战示例：

先创建测试表（后续示例均基于此）：

```sql
-- 创建商品表
CREATE TABLE IF NOT EXISTS goods (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 主键自增
  name VARCHAR(50) NOT NULL,         -- 商品名称
  price DECIMAL(10,2) NOT NULL,      -- 价格（保留2位小数）
  stock INT DEFAULT 0,               -- 库存（默认0）
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP  -- 创建时间（默认当前时间）
) CHARSET=utf8mb4;
```

执行单条插入：

```sql
-- 插入手机商品（指定字段，按顺序赋值）
INSERT INTO goods (name, price, stock)
VALUES ('小米14 Pro', 4999.00, 1000);

-- 执行结果：Query OK, 1 row affected (0.01 sec)
-- 说明：id和create_time为默认值，无需手动赋值
```

### 6.1.2 简化插入语法（省略字段）

若插入值的顺序与表字段顺序完全一致，可省略字段列表，但**不推荐**（表结构变更易出错）。

```sql
-- 省略字段列表（需按id,name,price,stock,create_time顺序赋值）
-- id为自增，赋值NULL让MySQL自动生成
INSERT INTO goods
VALUES (NULL, '华为Mate 60', 5999.00, 800, NULL);
```

### 6.1.3 批量插入语法（高效）

单次插入多条数据，比多次执行单条 INSERT 效率高（减少网络交互和事务开销），是批量新增的首选方式。

#### 语法：

```sql
INSERT INTO 表名 (字段1, 字段2, ...)
VALUES
(值1, 值2, ...),
(值3, 值4, ...),
...
(值n, 值n+1, ...);
```

#### 示例：

```sql
-- 批量插入3条商品数据
INSERT INTO goods (name, price, stock)
VALUES
('iPhone 15', 5999.00, 500),
('vivo X100', 3999.00, 1200),
('OPPO Find X7', 4299.00, 900);
```

### 6.1.4 插入查询结果（INSERT ... SELECT）

将一个查询的结果直接插入到表中，适用于数据迁移、批量复制场景。

#### 语法：

```sql
INSERT INTO 目标表 (字段1, 字段2, ...)
SELECT 字段1, 字段2, ... FROM 源表 [WHERE 条件];
```

#### 示例：

```sql
-- 创建商品备份表
CREATE TABLE goods_backup LIKE goods;

-- 将价格>4000的商品插入备份表
INSERT INTO goods_backup (name, price, stock)
SELECT name, price, stock FROM goods WHERE price > 4000;
```

### 6.1.5 插入注意事项

1. **字段与值的匹配**：字段数量、顺序、类型必须与值完全匹配（如 VARCHAR 字段不能插入数字，除非可隐式转换）；
2. **自增字段**：自增主键（如 id）可赋值 NULL 或省略，让 MySQL 自动生成；
3. **默认值使用**：设置了 DEFAULT 的字段（如 stock），插入时可省略，自动使用默认值；
4. **字符集问题**：插入中文/特殊字符时，确保表字符集为 utf8mb4，避免乱码。

## 6.2 更新数据（UPDATE）的条件与批量更新

UPDATE 用于修改表中已存在的记录，核心是“精准更新”——必须通过 WHERE 子句指定更新条件，否则会修改全表数据，造成严重后果。

### 6.2.1 基础更新语法

#### 语法：

```sql
UPDATE 表名
SET 字段1 = 值1, 字段2 = 值2, ...
[WHERE 更新条件];
```

#### 示例1：单条件更新

```sql
-- 将“小米14 Pro”的库存增加200
UPDATE goods
SET stock = stock + 200
WHERE name = '小米14 Pro';

-- 执行结果：Query OK, 1 row affected (0.01 sec)
-- Rows matched: 1  Changed: 1  Warnings: 0
```

#### 示例2：多条件更新

```sql
-- 将价格>5000且库存<1000的商品价格下调100
UPDATE goods
SET price = price - 100
WHERE price > 5000 AND stock < 1000;
```

### 6.2.2 批量更新（多值更新）

通过 CASE WHEN 语法实现“不同行更新不同值”，避免多次执行 UPDATE，提升效率。

#### 示例：

```sql
-- 批量更新多个商品的库存
UPDATE goods
SET stock = CASE
    WHEN name = 'iPhone 15' THEN 600
    WHEN name = '华为Mate 60' THEN 900
    WHEN name = 'vivo X100' THEN 1500
    ELSE stock  -- 其他商品库存不变
END
WHERE name IN ('iPhone 15', '华为Mate 60', 'vivo X100');
```

### 6.2.3 关联表更新（UPDATE ... JOIN）

基于另一张表的数据更新当前表，适用于关联场景（如根据订单表更新商品库存）。

#### 示例：

```sql
-- 创建订单表
CREATE TABLE order_goods (
  id INT PRIMARY KEY AUTO_INCREMENT,
  goods_name VARCHAR(50),
  buy_num INT  -- 购买数量
);
INSERT INTO order_goods (goods_name, buy_num) VALUES ('小米14 Pro', 50);

-- 关联更新：根据订单减少商品库存
UPDATE goods g
JOIN order_goods og ON g.name = og.goods_name
SET g.stock = g.stock - og.buy_num
WHERE og.id = 1;
```

### 6.2.4 UPDATE 核心注意事项

1. **必加 WHERE 条件**：无 WHERE 时会更新全表（如 `UPDATE goods SET stock = 0` 会清空所有商品库存），生产环境操作前务必先执行 `SELECT` 验证条件；
2. **事务保护**：重要更新操作（如价格调整），先开启事务，更新后验证结果，再提交（6.5 节详细讲解）；
3. **避免更新主键**：主键是记录的唯一标识，更新主键可能导致数据关联混乱，除非特殊场景，禁止更新；
4. **NULL 值处理**：若要将字段设为 NULL，直接赋值 `SET stock = NULL`（需确保字段允许 NULL）。

## 6.3 删除数据（DELETE/TRUNCATE）的差异与使用场景

删除数据有两种核心方式：DELETE（DML 命令）和 TRUNCATE（DDL 命令），二者语法、性能、适用场景差异极大，需严格区分。

### 6.3.1 DELETE 语法与使用

DELETE 是 DML 命令，用于删除表中符合条件的记录，可回滚，支持条件筛选。

#### 语法：

```sql
DELETE FROM 表名 [WHERE 删除条件];
```

#### 示例1：单条件删除

```sql
-- 删除库存为0的商品（假设存在）
DELETE FROM goods WHERE stock = 0;
```

#### 示例2：关联表删除

```sql
-- 删除“OPPO Find X7”的订单及商品记录（需先删订单，再删商品）
DELETE FROM order_goods WHERE goods_name = 'OPPO Find X7';
DELETE FROM goods WHERE name = 'OPPO Find X7';
```

#### 示例3：删除全表（不推荐）

```sql
-- 删除goods表所有记录（可回滚，但效率低）
DELETE FROM goods;
```

### 6.3.2 TRUNCATE 语法与使用

TRUNCATE 是 DDL 命令，用于清空整个表，不可回滚（部分存储引擎如 InnoDB 可通过事务恢复），效率远高于 DELETE。

#### 语法：

```sql
TRUNCATE TABLE 表名;
```

#### 示例：

```sql
-- 清空商品备份表
TRUNCATE TABLE goods_backup;
```

### 6.3.3 DELETE 与 TRUNCATE 核心差异

| 特性       | DELETE                                 | TRUNCATE                   |
| ---------- | -------------------------------------- | -------------------------- |
| 语法类型   | DML（数据操纵）                        | DDL（数据定义）            |
| 条件筛选   | 支持 WHERE，可删指定行                 | 不支持，只能清空全表       |
| 自增主键   | 自增值保留（如删完后新增从最后ID继续） | 自增值重置为1              |
| 事务回滚   | 支持（InnoDB 引擎）                    | 不支持（DDL 操作立即生效） |
| 性能       | 逐行删除，效率低（大数据量）           | 直接重置表，效率极高       |
| 触发触发器 | 会触发 DELETE 触发器                   | 不会触发任何触发器         |

### 6.3.4 使用场景选择

- **DELETE**：删除指定行、需回滚、需触发触发器、数据量小的场景；
- **TRUNCATE**：清空全表、追求效率、无需保留自增值、数据量大的场景（如测试数据清理）。

⚠️ **警告**：无论是 DELETE 还是 TRUNCATE，删除数据前务必备份！生产环境禁止直接执行 `DELETE FROM 表名` 或 `TRUNCATE`，需先通过 `SELECT` 验证范围。

## 6.4 批量数据操作的高效实现方法

日常开发中，批量插入、更新、删除是高频需求，低效的操作方式（如循环执行单条 SQL）会导致性能瓶颈，以下是高效实现思路。

### 6.4.1 批量插入优化

1. **使用 INSERT ... VALUES 批量语法**：如 6.1.3 节所示，单次插入多条数据（建议单次不超过 1000 条，避免数据包过大）；
2. **关闭自动提交**：MySQL 默认自动提交事务，批量插入前关闭自动提交，插入后手动提交，减少事务开销：
   ```sql
   SET AUTOCOMMIT = 0;  -- 关闭自动提交
   INSERT INTO goods (name, price, stock) VALUES (...), (...), ...;
   COMMIT;  -- 手动提交
   SET AUTOCOMMIT = 1;  -- 恢复自动提交
   ```
3. **使用 LOAD DATA INFILE**：导入外部文件（如 CSV）到表中，是批量插入的最优方式（比 INSERT 快 10 倍以上）：
   ```sql
   -- 导入CSV文件到商品表
   LOAD DATA INFILE '/tmp/goods.csv'
   INTO TABLE goods
   FIELDS TERMINATED BY ','  -- 字段分隔符
   LINES TERMINATED BY '\n'   -- 行分隔符
   (name, price, stock);      -- 对应字段
   ```

### 6.4.2 批量更新优化

1. **使用 CASE WHEN 批量更新**：如 6.2.2 节所示，单次 UPDATE 完成多条记录的不同值更新；
2. **使用临时表+JOIN 更新**：先将批量更新数据导入临时表，再通过 JOIN 批量更新主表：
   ```sql
   -- 创建临时表
   CREATE TEMPORARY TABLE temp_goods (name VARCHAR(50), stock INT);
   -- 插入批量更新数据
   INSERT INTO temp_goods VALUES ('小米14 Pro', 1500), ('华为Mate 60', 1000);
   -- 关联更新主表
   UPDATE goods g
   JOIN temp_goods tg ON g.name = tg.name
   SET g.stock = tg.stock;
   ```

### 6.4.3 批量删除优化

1. **分批删除**：大数据量删除（如 100 万行）时，直接 DELETE 会锁表，需分批删除：
   ```sql
   -- 每次删除 1000 行，直到删完
   WHILE (SELECT COUNT(*) FROM goods WHERE price < 1000) > 0 DO
       DELETE FROM goods WHERE price < 1000 LIMIT 1000;
       COMMIT;
   END WHILE;
   ```
2. **使用 DELETE ... JOIN**：关联表批量删除，避免多次执行 DELETE。

## 6.5 数据操纵中的事务一致性保障

事务（Transaction）是保证 DML 操作原子性、一致性、隔离性、持久性（ACID）的核心机制，尤其适用于多步 DML 操作（如“下单减库存”需同时更新订单表和商品表）。

### 6.5.1 事务的基本概念

- **原子性（Atomicity）**：事务中的操作要么全部执行，要么全部回滚；
- **一致性（Consistency）**：事务执行前后，数据完整性约束不变（如库存不能为负）；
- **隔离性（Isolation）**：多个事务并发执行时，互不干扰；
- **持久性（Durability）**：事务提交后，数据永久保存到磁盘。

### 6.5.2 事务的使用语法

MySQL 中，InnoDB 引擎支持事务，MyISAM 不支持，核心语法：

```sql
-- 开启事务
START TRANSACTION;  -- 或 BEGIN;
-- 执行DML操作
UPDATE goods SET stock = stock - 10 WHERE name = '小米14 Pro';
INSERT INTO order_goods (goods_name, buy_num) VALUES ('小米14 Pro', 10);
-- 验证结果（可选）
SELECT * FROM goods WHERE name = '小米14 Pro';
-- 提交事务（生效）
COMMIT;
-- 若出错，回滚事务（撤销所有操作）
-- ROLLBACK;
```

### 6.5.3 事务的典型应用场景

以“用户下单”为例，需同时完成“创建订单”和“扣减库存”，用事务保证一致性：

```sql
START TRANSACTION;
-- 1. 扣减商品库存
UPDATE goods SET stock = stock - 1 WHERE id = 1;
-- 2. 创建订单
INSERT INTO `order` (user_id, goods_id, num) VALUES (1, 1, 1);
-- 检查库存是否为负（避免超卖）
IF (SELECT stock FROM goods WHERE id = 1) < 0 THEN
    ROLLBACK;  -- 库存为负，回滚
ELSE
    COMMIT;    -- 正常，提交
END IF;
```

### 6.5.4 事务的注意事项

1. **仅 InnoDB 支持**：确保表引擎为 InnoDB（MySQL 5.5+ 默认）；
2. **短事务原则**：事务开启后尽快提交/回滚，避免长时间占用锁；
3. **避免嵌套事务**：MySQL 不支持真正的嵌套事务，内层 COMMIT/ROLLBACK 会影响外层。

## 6.6 DML操作的常见错误与数据恢复思路

DML 操作易因语法、约束、逻辑问题出错，甚至导致数据丢失，以下是高频错误及恢复思路。

### 6.6.1 常见错误与排查

#### 错误1：插入违反约束（主键重复/非空）

- 错误信息：`ERROR 1062 (23000): Duplicate entry '1' for key 'PRIMARY'`（主键重复）；`ERROR 1048 (23000): Column 'name' cannot be null`（非空约束）；
- 原因：插入值违反主键唯一、非空、外键等约束；
- 解决：检查插入值是否符合约束，主键自增则赋值 NULL，非空字段确保有值。

#### 错误2：更新/删除无 WHERE 条件

- 现象：全表数据被修改/删除；
- 解决：立即停止操作，若开启了事务，执行 `ROLLBACK`；若已提交，通过备份恢复（见 6.6.2 节）。

#### 错误3：批量操作锁表

- 现象：执行批量 UPDATE/DELETE 后，表被锁定，其他操作阻塞；
- 原因：大数据量操作占用行锁/表锁；
- 解决：kill 阻塞进程（`SHOW PROCESSLIST;` 查进程ID，`KILL ID;` 终止），改用分批操作。

#### 错误4：数据类型不匹配

- 错误信息：`ERROR 1366 (HY000): Incorrect integer value: 'abc' for column 'stock' at row 1`；
- 原因：插入/更新的值类型与字段类型不匹配（如字符串插入数字字段）；
- 解决：确保值类型与字段类型一致，必要时用 `CAST` 转换（如 `CAST('100' AS INT)`）。

### 6.6.2 数据恢复思路

#### 场景1：误操作后未提交事务

- 解决：直接执行 `ROLLBACK` 回滚，恢复到操作前状态。

#### 场景2：误操作已提交（InnoDB 引擎）

1. **利用 binlog 恢复**：MySQL 的二进制日志（binlog）记录了所有 DML 操作，可通过 binlog 恢复：
   - 查看 binlog 列表：`SHOW BINARY LOGS;`
   - 解析 binlog：`mysqlbinlog --start-datetime='2026-01-25 10:00:00' --stop-datetime='2026-01-25 10:30:00' /var/lib/mysql/mysql-bin.000001 > /tmp/binlog.sql`
   - 筛选出恢复所需的 SQL，执行恢复；
2. **利用备份恢复**：若开启了定时备份（如 mysqldump），先恢复到最近备份点，再用 binlog 恢复增量数据；
3. **第三方工具**：如 Percona Data Recovery Toolkit，可恢复误删的数据。

#### 场景3：无备份/无 binlog

- 紧急措施：停止数据库写入（避免覆盖数据），联系专业 DBA，通过磁盘数据恢复工具尝试恢复（成功率低，成本高）。

### 6.6.3 预防措施

1. **开启 binlog**：生产环境必须开启 binlog（my.cnf 配置 `log_bin = mysql-bin`），用于数据恢复；
2. **定时备份**：使用 mysqldump 或 xtrabackup 定时备份全库/关键表；
3. **操作前验证**：执行 UPDATE/DELETE 前，先执行 `SELECT` 验证 WHERE 条件的结果集；
4. **权限控制**：限制开发/运维人员的 DML 权限，禁止直接操作生产库，需通过审核流程。

### 总结

1. INSERT 支持单条/批量/查询结果插入，指定字段的插入方式最规范；UPDATE 必加 WHERE 条件，批量更新用 CASE WHEN 提升效率；
2. DELETE 支持条件筛选、可回滚，TRUNCATE 清空全表、效率高但不可回滚，二者需根据场景选择；
3. 批量操作优先用原生批量语法（如 INSERT 多值、CASE WHEN 更新），关闭自动提交可提升性能；
4. 事务（START TRANSACTION/COMMIT/ROLLBACK）是保证多步 DML 操作一致性的核心，仅 InnoDB 引擎支持；
5. DML 操作前务必备份、验证条件，误操作后可通过事务回滚、binlog、备份恢复数据。

本章的 DML 操作是业务开发的核心，既要掌握语法，更要重视数据安全——一个小小的 WHERE 条件遗漏，就可能导致不可逆的数据损失。建议在测试环境多练习批量操作、事务回滚等场景，养成“先验证、再操作、常备份”的好习惯。下一章将讲解 MySQL 索引与性能优化，进一步提升数据操作的效率。
