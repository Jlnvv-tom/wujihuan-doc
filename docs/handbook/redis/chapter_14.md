# MySQL 数据库应用指南：第14章 MySQL性能监控与优化

在高并发、大数据量的业务场景中，MySQL 的性能直接决定了业务响应速度和系统稳定性。性能监控是发现瓶颈的前提，而优化则是解决瓶颈的核心手段——从慢查询定位到 SQL 优化，从参数调优到高负载场景适配，本章将全面讲解 MySQL 性能监控与优化的实战方法，帮你构建高性能、高可用的数据库体系。

## 14.1 MySQL性能监控指标与核心视图

要优化性能，首先要“看清”性能瓶颈，MySQL 提供了丰富的系统视图和监控指标，覆盖连接、查询、缓存、IO、锁等核心维度。

### 14.1.1 核心性能监控指标

| 指标类别 | 关键指标                             | 说明           | 健康阈值                  |
| -------- | ------------------------------------ | -------------- | ------------------------- |
| 连接指标 | Threads_connected                    | 当前连接数     | ＜max_connections的80%    |
|          | Threads_running                      | 活跃连接数     | ＜CPU核心数\*2            |
|          | Aborted_connects                     | 失败连接数     | 趋近于0                   |
| 查询指标 | QPS（Queries/Second）                | 每秒查询数     | 依业务而定，关注突增/突降 |
|          | TPS（Transactions/Second）           | 每秒事务数     | 依业务而定                |
|          | Slow_queries                         | 慢查询数       | 趋近于0                   |
| 缓存指标 | Key_buffer_hit_rate                  | 索引缓存命中率 | ＞99%（MyISAM）           |
|          | InnoDB_buffer_pool_hit_rate          | 缓冲池命中率   | ＞99%（InnoDB）           |
| IO指标   | Innodb_data_reads/Innodb_data_writes | 数据读写次数   | 关注突发增长              |
|          | Innodb_os_log_fsyncs                 | 日志刷盘次数   | 避免频繁刷盘              |
| 锁指标   | Innodb_row_lock_waits                | 行锁等待次数   | 趋近于0                   |
|          | Table_locks_waited                   | 表锁等待次数   | 趋近于0                   |

### 14.1.2 核心监控视图（SQL查询）

#### 1. 全局状态视图（SHOW GLOBAL STATUS）

```sql
-- 查看核心状态指标
SHOW GLOBAL STATUS
WHERE Variable_name IN (
  'Threads_connected', 'Threads_running', 'Slow_queries',
  'Queries', 'Com_commit', 'Com_rollback',
  'Innodb_buffer_pool_read_hit', 'Innodb_row_lock_waits'
);

-- 计算QPS（每秒查询数）
-- 先记录当前Queries值，间隔1秒再查，差值即为QPS
SET @q1 = (SELECT Variable_value FROM INFORMATION_SCHEMA.GLOBAL_STATUS WHERE Variable_name = 'Queries');
SELECT SLEEP(1);
SET @q2 = (SELECT Variable_value FROM INFORMATION_SCHEMA.GLOBAL_STATUS WHERE Variable_name = 'Queries');
SELECT @q2 - @q1 AS QPS;

-- 计算InnoDB缓冲池命中率（＞99%为健康）
SELECT
  CONCAT(
    ROUND(
      (1 - (
        (SELECT Variable_value FROM INFORMATION_SCHEMA.GLOBAL_STATUS WHERE Variable_name = 'Innodb_buffer_pool_reads') /
        (SELECT Variable_value FROM INFORMATION_SCHEMA.GLOBAL_STATUS WHERE Variable_name = 'Innodb_buffer_pool_read_requests')
      )) * 100, 2
    ), '%'
  ) AS buffer_pool_hit_rate;
```

#### 2. 进程列表视图（SHOW PROCESSLIST）

实时查看当前数据库连接和执行的SQL，定位慢查询、锁等待：

```sql
-- 查看所有活跃进程（truncated为1表示SQL被截断，需用full查看完整SQL）
SHOW FULL PROCESSLIST;

-- 过滤出执行时间＞10秒的慢查询
SELECT id, user, host, db, time, state, info
FROM INFORMATION_SCHEMA.PROCESSLIST
WHERE time > 10 AND info IS NOT NULL;

-- 杀死阻塞的进程
KILL 123;  -- 123为进程ID
```

#### 3. 表/索引统计视图

```sql
-- 查看表的访问统计（MySQL 8.0+）
SELECT * FROM INFORMATION_SCHEMA.TABLE_STATISTICS WHERE table_schema = 'test_db';

-- 查看索引使用情况（定位未使用的索引）
SELECT
  TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, COUNT(*) AS USE_COUNT
FROM INFORMATION_SCHEMA.SYS_INDEX_STATISTICS
WHERE TABLE_SCHEMA = 'test_db'
AND USE_COUNT = 0;  -- 未使用的索引可考虑删除
```

### 14.1.3 监控工具推荐

- **轻量工具**：mysqladmin（官方）、mytop（实时监控）；
- **开源工具**：Prometheus + Grafana（可视化监控大盘）、Percona Monitoring and Management（PMM）；
- **商业工具**：MySQL Enterprise Monitor、Navicat Monitor。

## 14.2 慢查询日志的开启与分析

慢查询日志是定位性能瓶颈的“利器”，能记录所有执行时间超过指定阈值的SQL，是SQL优化的首要依据。

### 14.2.1 开启慢查询日志

#### 1. 临时开启（重启失效）

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = ON;
-- 设置慢查询阈值（单位：秒，建议设为1秒）
SET GLOBAL long_query_time = 1;
-- 记录未使用索引的查询（即使执行时间＜1秒）
SET GLOBAL log_queries_not_using_indexes = ON;
-- 慢查询日志存储路径
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
-- 记录管理语句（如ALTER、DROP）
SET GLOBAL log_slow_admin_statements = ON;
```

#### 2. 永久开启（修改my.cnf/my.ini）

```ini
[mysqld]
# 慢查询基础配置
slow_query_log = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1
log_queries_not_using_indexes = ON
log_slow_admin_statements = ON
# 可选：记录慢查询的执行计划
log_output = FILE,TABLE  # 同时写入文件和mysql.slow_log表
```

修改后重启MySQL生效：

```bash
systemctl restart mysqld
```

### 14.2.2 分析慢查询日志

#### 1. 原生工具（mysqldumpslow）

```bash
# 查看慢查询日志概要
mysqldumpslow /var/log/mysql/slow.log

# 常用参数
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log  # 按执行时间排序，取前10条
mysqldumpslow -s c -t 10 /var/log/mysql/slow.log  # 按执行次数排序，取前10条
mysqldumpslow -g 'SELECT *' /var/log/mysql/slow.log  # 过滤包含指定SQL的慢查询
```

#### 2. 专业工具（pt-query-digest）

Percona Toolkit 中的 pt-query-digest 能更精准分析慢查询，输出执行频率、耗时、锁等待等详细信息：

```bash
# 安装Percona Toolkit
yum install -y percona-toolkit

# 分析慢查询日志
pt-query-digest /var/log/mysql/slow.log > /tmp/slow_query_analysis.log

# 分析最近1小时的慢查询
pt-query-digest --since 1h /var/log/mysql/slow.log
```

输出结果核心字段说明：

- `Query ID`：SQL唯一标识（相同SQL会归为一类）；
- `Exec time`：总执行时间/平均执行时间/最大执行时间；
- `Lock time`：锁等待时间；
- `Rows sent`：返回行数（行数过多可能导致网络瓶颈）；
- `Rows examined`：扫描行数（扫描行数远大于返回行数，说明索引优化不足）。

### 14.2.3 慢查询分析实战

```bash
# 示例：分析慢查询，找到扫描行数最多的SQL
pt-query-digest --filter '$event->{Rows_examined} > 10000' /var/log/mysql/slow.log

# 输出示例（关键信息）：
# Query 1: 0.50 QPS, 5.00x concurrency, 10.00s avg exec time
# Rows examined: 100000 (avg), Rows sent: 10 (avg)
# SQL: SELECT * FROM order WHERE create_time > '2026-01-01'
```

分析结论：该SQL扫描10万行仅返回10行，未使用索引，需优化。

## 14.3 性能\_schema与sys库的使用

MySQL 5.5+ 引入 Performance Schema（性能模式），5.7+ 引入 sys 库（基于 Performance Schema 封装），提供更细粒度的性能监控数据，覆盖等待事件、锁、内存、语句执行等维度。

### 14.3.1 Performance Schema 核心表

```sql
-- 开启Performance Schema（默认开启）
SET GLOBAL performance_schema = ON;

-- 1. 查看语句执行统计（定位高频/慢SQL）
SELECT
  DIGEST_TEXT,  -- SQL语句（脱敏）
  EXECUTION_COUNT,  -- 执行次数
  SUM_TIMER_WAIT/1000000000 AS TOTAL_EXEC_TIME,  -- 总执行时间（秒）
  AVG_TIMER_WAIT/1000000000 AS AVG_EXEC_TIME,  -- 平均执行时间（秒）
  SUM_ROWS_EXAMINED AS TOTAL_ROWS_EXAMINED  -- 总扫描行数
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = 'test_db'
ORDER BY AVG_EXEC_TIME DESC
LIMIT 10;

-- 2. 查看锁等待事件
SELECT
  OBJECT_SCHEMA, OBJECT_NAME,
  COUNT_STAR AS WAIT_COUNT,  -- 等待次数
  SUM_TIMER_WAIT/1000000000 AS TOTAL_WAIT_TIME  -- 总等待时间（秒）
FROM performance_schema.events_waits_summary_by_table
WHERE EVENT_NAME LIKE '%lock%'
AND WAIT_COUNT > 0
ORDER BY TOTAL_WAIT_TIME DESC;

-- 3. 查看内存使用情况
SELECT
  SUBSTRING_INDEX(EVENT_NAME, '/', 2) AS MODULE,
  SUM_CURRENT_ALLOCATED/1024/1024 AS CURRENT_MEM_MB  -- 当前分配内存（MB）
FROM performance_schema.memory_summary_global_by_event_name
GROUP BY MODULE
ORDER BY CURRENT_MEM_MB DESC;
```

### 14.3.2 sys库的便捷查询（MySQL 5.7+）

sys库将 Performance Schema 的复杂数据封装为易用的视图，适合快速定位问题：

```sql
-- 1. 查看Top 10慢SQL
SELECT * FROM sys.top_statements LIMIT 10;

-- 2. 查看未使用的索引（可删除）
SELECT * FROM sys.schema_unused_indexes WHERE table_schema = 'test_db';

-- 3. 查看表的IO使用情况
SELECT * FROM sys.io_global_by_file_by_bytes ORDER BY total DESC LIMIT 10;

-- 4. 查看锁等待详情
SELECT * FROM sys.innodb_lock_waits;

-- 5. 查看缓冲池使用情况
SELECT * FROM sys.innodb_buffer_pool_stats;
```

## 14.4 SQL语句的优化技巧（避免全表扫描、优化关联）

SQL优化是性能调优的核心，80%的性能问题都源于低效SQL，核心原则是：**减少扫描行数、充分利用索引、降低数据返回量**。

### 14.4.1 避免全表扫描（核心优化）

全表扫描（Full Table Scan）是性能杀手，尤其是大数据量表，需通过索引优化避免。

#### 1. 必加索引的场景

- WHERE 条件中的过滤字段（如 `order.create_time`、`user.id`）；
- JOIN 关联字段（如 `order.user_id` 关联 `user.id`）；
- ORDER BY/GROUP BY 字段（如 `order.amount` 排序）。

#### 2. 反例与优化示例

```sql
-- 反例1：无索引，全表扫描（order表100万行）
SELECT * FROM `order` WHERE create_time > '2026-01-01';

-- 优化：添加索引
CREATE INDEX idx_order_create_time ON `order`(create_time);

-- 反例2：LIKE以%开头，索引失效
SELECT * FROM user WHERE name LIKE '%张三';

-- 优化：避免%开头（业务允许的话），或使用全文索引
SELECT * FROM user WHERE name LIKE '张三%';  -- 前缀匹配，索引生效
-- 或创建全文索引（适用于模糊查询）
CREATE FULLTEXT INDEX idx_user_name ON user(name);
SELECT * FROM user WHERE MATCH(name) AGAINST('张三');

-- 反例3：字段函数操作，索引失效
SELECT * FROM `order` WHERE DATE(create_time) = '2026-01-25';

-- 优化：改写为字段直接比较
SELECT * FROM `order` WHERE create_time >= '2026-01-25' AND create_time < '2026-01-26';

-- 反例4：OR条件未全加索引，索引失效
SELECT * FROM user WHERE id = 1 OR name = '张三';

-- 优化：拆分为UNION（若字段都有索引）
SELECT * FROM user WHERE id = 1
UNION
SELECT * FROM user WHERE name = '张三';
```

### 14.4.2 优化关联查询（JOIN）

多表关联是高频场景，低效关联会导致性能急剧下降，核心优化原则：**小表驱动大表、关联字段加索引、避免笛卡尔积**。

#### 1. 小表驱动大表（STRAIGHT_JOIN）

```sql
-- 反例：大表驱动小表（order表100万行，user表1万行）
SELECT * FROM `order` o JOIN user u ON o.user_id = u.id WHERE u.status = 1;

-- 优化：小表驱动大表（强制user表先执行）
SELECT * FROM user u STRAIGHT_JOIN `order` o ON u.id = o.user_id WHERE u.status = 1;
```

#### 2. 避免不必要的关联

```sql
-- 反例：关联多余表，增加开销
SELECT o.id, o.amount, u.name, g.name
FROM `order` o
JOIN user u ON o.user_id = u.id
JOIN goods g ON o.goods_id = g.id
WHERE o.id = 123;

-- 优化：仅关联需要的表（若无需goods表字段）
SELECT o.id, o.amount, u.name
FROM `order` o
JOIN user u ON o.user_id = u.id
WHERE o.id = 123;
```

#### 3. 限制关联层级

避免超过3表关联，复杂关联可拆分为多个查询，或通过中间表预处理数据。

### 14.4.3 其他SQL优化技巧

1. **避免SELECT \***：仅查询需要的字段，减少数据传输和内存占用；
2. **LIMIT分页优化**：大数据量分页（如 LIMIT 100000, 10）会扫描大量数据，可通过主键/索引优化：

   ```sql
   -- 反例：慢分页
   SELECT * FROM `order` ORDER BY id LIMIT 100000, 10;

   -- 优化：基于主键分页
   SELECT * FROM `order` WHERE id > 100000 ORDER BY id LIMIT 10;
   ```

3. **批量操作优化**：批量插入/更新替代单条操作，减少网络交互和事务开销：

   ```sql
   -- 反例：单条插入（1000次）
   INSERT INTO user (name, phone) VALUES ('张三', '13800138000');
   INSERT INTO user (name, phone) VALUES ('李四', '13800138001');

   -- 优化：批量插入
   INSERT INTO user (name, phone) VALUES
   ('张三', '13800138000'),
   ('李四', '13800138001');
   ```

4. **使用EXPLAIN分析执行计划**：
   ```sql
   -- 分析SQL执行计划
   EXPLAIN SELECT * FROM `order` WHERE create_time > '2026-01-01';
   ```
   关键字段说明：
   - `type`：访问类型（ALL=全表扫描，ref=索引等值查询，range=索引范围查询，const=主键/唯一索引），优先range/ref/const；
   - `key`：实际使用的索引（NULL表示未使用索引）；
   - `rows`：预估扫描行数（越小越好）；
   - `Extra`：额外信息（Using filesort=文件排序，Using temporary=临时表，需优化）。

## 14.5 MySQL配置参数的优化（内存、连接数）

MySQL 默认配置偏保守，需根据服务器硬件（CPU、内存、磁盘）和业务场景调整核心参数，充分利用硬件资源。

### 14.5.1 内存参数优化（核心）

内存是MySQL性能的核心资源，尤其是InnoDB缓冲池，需优先分配足够内存。

#### 1. 核心内存参数（my.cnf）

```ini
[mysqld]
# InnoDB缓冲池（核心）：建议分配物理内存的50%-70%（如16G内存分配10G）
innodb_buffer_pool_size = 10G
# 缓冲池实例数：CPU核心数＞8时，设为4/8（避免锁竞争）
innodb_buffer_pool_instances = 4

# 日志缓冲区：默认16M，写密集场景可调大
innodb_log_buffer_size = 64M

# 排序/连接缓冲区：每个连接独占，避免设太大
sort_buffer_size = 2M
join_buffer_size = 2M

# 查询缓存（MySQL 8.0已移除）：读多写少场景开启
# query_cache_type = ON
# query_cache_size = 64M

# 临时表内存：避免临时表写入磁盘
tmp_table_size = 64M
max_heap_table_size = 64M
```

### 14.5.2 连接数参数优化

连接数设置不合理会导致“Too many connections”错误，或资源浪费。

```ini
[mysqld]
# 最大连接数：根据业务并发调整（如2000），避免设太大（占用内存）
max_connections = 2000
# 最大错误连接数：防止暴力破解
max_connect_errors = 100000
# 连接超时：闲置连接自动关闭（单位：秒）
wait_timeout = 600
interactive_timeout = 600
# 线程缓存：复用线程，减少创建开销
thread_cache_size = 64
```

### 14.5.3 IO参数优化（写密集场景）

```ini
[mysqld]
# InnoDB日志文件大小：建议1G-2G（太大恢复慢，太小刷盘频繁）
innodb_log_file_size = 2G
# 日志文件组数：默认2，无需修改
innodb_log_files_in_group = 2

# 刷盘策略：生产环境建议O_DIRECT（绕过OS缓存）
innodb_flush_method = O_DIRECT
# 事务刷盘策略：默认1（每秒刷盘），金融场景设0（事务提交即刷盘）
innodb_flush_log_at_trx_commit = 1

# 并发IO线程数：根据磁盘IO能力调整（SSD设16/32）
innodb_read_io_threads = 16
innodb_write_io_threads = 16

# 表空间模式：独立表空间（便于备份/恢复）
innodb_file_per_table = ON
```

### 14.5.4 参数调整注意事项

1. **逐步调整**：每次仅调整1-2个参数，观察性能变化，避免一次性修改多个参数；
2. **监控验证**：调整后通过 `SHOW GLOBAL STATUS` 验证参数效果；
3. **避免过度分配**：内存参数总和不超过物理内存的80%，避免OS内存不足；
4. **重启生效**：大部分参数修改后需重启MySQL生效。

## 14.6 高负载场景下的性能调优实践

高负载场景（如秒杀、大促、高并发查询）需针对性调优，结合架构、SQL、参数多维度优化。

### 14.6.1 读高负载场景（如电商商品详情）

#### 优化策略：

1. **读写分离**：主库写，从库读，分散读压力；
2. **缓存优化**：热点数据缓存到Redis（如商品信息、首页数据），减少数据库查询；
3. **索引优化**：所有查询字段加索引，避免全表扫描；
4. **查询优化**：
   - 避免复杂关联和聚合，提前计算结果存入汇总表；
   - 使用覆盖索引（SELECT 字段都在索引中，无需回表）：
     ```sql
     -- 创建覆盖索引
     CREATE INDEX idx_order_create_time_amount ON `order`(create_time, amount);
     -- 查询仅使用索引，无需回表
     SELECT amount FROM `order` WHERE create_time > '2026-01-01';
     ```
5. **参数优化**：增大查询缓存（MySQL 5.7及以下）、排序缓冲区。

### 14.6.2 写高负载场景（如秒杀下单）

#### 优化策略：

1. **批量操作**：批量插入/更新，减少事务次数和日志刷盘；
2. **分库分表**：将大表拆分为多个小表（如按用户ID分表），分散写压力；
3. **索引优化**：减少写操作的索引（索引越多，写越慢），仅保留核心索引；
4. **参数优化**：
   - 增大InnoDB日志缓冲区（innodb_log_buffer_size）；
   - 调整刷盘策略（innodb_flush_log_at_trx_commit=2，牺牲一致性换性能）；
5. **异步写入**：非核心数据异步写入（如日志、统计数据），避免阻塞主流程；
6. **锁优化**：
   - 避免长事务（减少锁持有时间）；
   - 使用行锁而非表锁（InnoDB默认行锁）；
   - 优化锁等待超时（innodb_lock_wait_timeout=5）。

### 14.6.3 高并发连接场景

#### 优化策略：

1. **连接池**：应用层使用连接池（如Druid、HikariCP），复用连接，避免频繁创建；
2. **线程缓存**：增大thread_cache_size，减少线程创建开销；
3. **限制单用户连接数**：防止单个用户占用过多连接；
4. **读写分离**：分散连接压力；
5. **参数优化**：增大max_connections，调整wait_timeout关闭闲置连接。

### 14.6.4 高负载调优核心原则

1. **压测先行**：上线前通过JMeter、SysBench进行压测，模拟高负载场景；
2. **监控兜底**：实时监控QPS、TPS、连接数、锁等待，及时发现瓶颈；
3. **降级预案**：高负载时降级非核心功能（如关闭统计、缓存降级），保障核心业务；
4. **架构扩展**：单库性能瓶颈时，及时扩容（主从、分库分表、集群）。

### 总结

1. 性能监控的核心是“看清”瓶颈，需关注连接、查询、IO、锁等指标，善用慢查询日志和Performance Schema；
2. SQL优化的核心是减少扫描行数、充分利用索引，通过EXPLAIN分析执行计划，避免全表扫描、文件排序；
3. 配置参数优化需结合硬件资源，优先分配内存给InnoDB缓冲池，合理调整连接数和IO参数；
4. 高负载场景需多维度优化：读高负载侧重缓存和读写分离，写高负载侧重批量操作和锁优化；
5. 性能调优是持续过程，需定期监控、压测、优化，而非一次性配置。

MySQL性能调优没有“银弹”，需结合业务场景、硬件资源、数据特征逐步优化——先定位瓶颈，再针对性解决，最终达到性能与稳定性的平衡。
