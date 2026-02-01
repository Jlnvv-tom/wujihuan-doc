# MySQL 数据库应用指南：第11章 触发器与事件调度器

在数据库自动化运维和业务逻辑管控场景中，触发器（Trigger）和事件调度器（Event Scheduler）是两大核心工具——触发器能在数据变更时自动执行预设逻辑，事件调度器则可按时间规则触发定时任务。本章将从原理到实战，讲解触发器的创建、执行逻辑，以及事件调度器的配置与管理，同时分析二者的性能影响与优化策略，帮你实现数据库操作的“自动化”。

## 11.1 触发器的核心概念与作用

### 11.1.1 触发器是什么？

触发器是与数据表绑定的特殊存储过程，**当数据表发生 INSERT/UPDATE/DELETE 操作时自动触发执行**，无需手动调用。它属于数据库的“被动执行”逻辑，核心特点：

- 触发时机：可在数据变更前（BEFORE）或变更后（AFTER）执行；
- 触发对象：仅针对数据表的 DML 操作，DDL（如 ALTER TABLE）不会触发；
- 作用域：与具体表绑定，一张表可创建多个触发器（但同类型、同时机的触发器只能有一个）。

### 11.1.2 触发器的核心作用

触发器主要用于解决“数据变更时的自动化管控”问题，典型场景：

1. **数据校验**：插入/更新数据前验证合法性（如订单金额不能为负、库存不能小于0）；
2. **数据同步**：主表数据变更时，自动同步到从表（如订单表新增记录，自动更新库存表）；
3. **日志记录**：记录数据变更轨迹（谁、何时、修改了什么），用于审计和追溯；
4. **数据转换**：插入/更新时自动转换数据格式（如手机号统一脱敏、日期格式标准化）；
5. **业务联动**：数据变更触发关联业务逻辑（如用户下单后，自动扣减商品库存）。

### 11.1.3 触发器的局限性

- 无法直接接收/返回参数，仅能通过 `NEW`/`OLD` 关键字访问变更前后的数据；
- 执行逻辑不可见，问题排查难度大（尤其是多层触发器嵌套）；
- 过度使用会增加 DML 操作的性能开销，甚至导致死锁。

## 11.2 INSERT/UPDATE/DELETE触发器的创建与使用

MySQL 触发器按触发操作分为 INSERT、UPDATE、DELETE 三类，按触发时机分为 BEFORE、AFTER 两种，核心语法和使用场景各有差异。

### 11.2.1 触发器核心语法

```sql
-- 创建触发器
CREATE TRIGGER 触发器名
{BEFORE | AFTER} {INSERT | UPDATE | DELETE} ON 表名
FOR EACH ROW  -- 行级触发器（每一行数据变更都触发）
BEGIN
  -- 触发器执行逻辑（SQL语句）
END;

-- 查看触发器
SHOW TRIGGERS [FROM 数据库名] [LIKE '表名%'];

-- 删除触发器
DROP TRIGGER IF EXISTS 触发器名;
```

关键关键字：

- `NEW`：仅 INSERT/UPDATE 可用，代表**新增/修改后的数据行**（如 `NEW.amount` 表示新增的订单金额）；
- `OLD`：仅 UPDATE/DELETE 可用，代表**修改前/删除前的数据行**（如 `OLD.stock` 表示修改前的库存）；
- `FOR EACH ROW`：行级触发器（MySQL 仅支持行级，不支持表级触发器）。

### 11.2.2 INSERT 触发器（新增数据触发）

#### 场景：订单新增时自动扣减库存

```sql
-- 准备基础表
CREATE TABLE goods (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50),
  stock INT DEFAULT 0  -- 库存
);

CREATE TABLE `order` (
  id INT PRIMARY KEY AUTO_INCREMENT,
  goods_id INT,
  num INT,  -- 购买数量
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建INSERT触发器：新增订单后，扣减对应商品库存
DELIMITER //  -- 临时修改结束符，避免;中断触发器逻辑
CREATE TRIGGER trg_order_insert_after
AFTER INSERT ON `order`
FOR EACH ROW
BEGIN
  -- NEW.goods_id 表示新增订单的商品ID，NEW.num 表示购买数量
  UPDATE goods
  SET stock = stock - NEW.num
  WHERE id = NEW.goods_id;
END //
DELIMITER ;  -- 恢复结束符

-- 测试触发器：插入订单，验证库存扣减
INSERT INTO goods (name, stock) VALUES ('小米手机', 100);
INSERT INTO `order` (goods_id, num) VALUES (1, 5);

-- 查看库存（应从100变为95）
SELECT stock FROM goods WHERE id = 1;
```

#### 场景：插入数据前校验合法性

```sql
-- 创建BEFORE INSERT触发器：订单金额不能为负
CREATE TRIGGER trg_order_insert_before
BEFORE INSERT ON `order`
FOR EACH ROW
BEGIN
  IF NEW.num < 0 THEN
    -- 抛出异常，阻止插入
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '购买数量不能为负数';
  END IF;
END //
DELIMITER ;

-- 测试：插入负数数量，触发异常
INSERT INTO `order` (goods_id, num) VALUES (1, -2);
-- 错误提示：ERROR 1644 (45000): 购买数量不能为负数
```

### 11.2.3 UPDATE 触发器（修改数据触发）

#### 场景：修改数据时记录变更日志

```sql
-- 准备日志表
CREATE TABLE goods_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  goods_id INT,
  old_stock INT,  -- 修改前库存
  new_stock INT,  -- 修改后库存
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  operator VARCHAR(30) DEFAULT 'system'  -- 操作人（示例简化为system）
);

-- 创建UPDATE触发器：修改库存后，记录变更日志
DELIMITER //
CREATE TRIGGER trg_goods_update_after
AFTER UPDATE ON goods
FOR EACH ROW
BEGIN
  -- OLD.stock=修改前库存，NEW.stock=修改后库存
  INSERT INTO goods_log (goods_id, old_stock, new_stock)
  VALUES (OLD.id, OLD.stock, NEW.stock);
END //
DELIMITER ;

-- 测试：修改库存，查看日志
UPDATE goods SET stock = 90 WHERE id = 1;
SELECT * FROM goods_log;  -- 可看到old_stock=95，new_stock=90
```

### 11.2.4 DELETE 触发器（删除数据触发）

#### 场景：删除数据前备份到历史表

```sql
-- 准备订单历史表（结构与订单表一致）
CREATE TABLE order_history LIKE `order`;
-- 新增删除时间字段
ALTER TABLE order_history ADD delete_time DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 创建DELETE触发器：删除订单前，备份到历史表
DELIMITER //
CREATE TRIGGER trg_order_delete_before
BEFORE DELETE ON `order`
FOR EACH ROW
BEGIN
  -- OLD 代表要删除的订单数据
  INSERT INTO order_history (id, goods_id, num, create_time)
  VALUES (OLD.id, OLD.goods_id, OLD.num, OLD.create_time);
END //
DELIMITER ;

-- 测试：删除订单，查看历史表
DELETE FROM `order` WHERE id = 1;
SELECT * FROM order_history;  -- 可看到被删除的订单数据
```

## 11.3 触发器的执行顺序与注意事项

### 11.3.1 触发器的执行顺序

一张表可创建多个触发器，执行顺序遵循以下规则：

1. **同类型操作**：BEFORE 触发器先执行，再执行 DML 操作，最后执行 AFTER 触发器；
   例：INSERT 操作 → BEFORE INSERT → 插入数据 → AFTER INSERT；
2. **不同类型操作**：INSERT/UPDATE/DELETE 触发器相互独立，仅对应操作触发；
3. **嵌套触发器**：触发器内的 DML 操作会触发关联表的触发器（如订单表 AFTER INSERT 触发库存表 UPDATE，库存表 UPDATE 触发器又触发日志表 INSERT）；
   > 注意：MySQL 默认开启触发器嵌套，可通过 `SET GLOBAL log_bin_trust_function_creators = 1` 控制，过度嵌套易导致死锁或性能问题。

### 11.3.2 核心注意事项

#### 1. 避免在触发器中执行复杂逻辑

触发器与 DML 操作同属一个事务，复杂逻辑（如多表关联、循环）会大幅增加 DML 执行时间，甚至导致事务超时。

#### 2. 禁止在触发器中操作触发表本身

如在 `order` 表的 INSERT 触发器中，再次执行 `INSERT INTO order`，会导致无限递归触发，最终抛出异常：

```sql
-- 错误示例：递归触发
CREATE TRIGGER trg_order_insert_error
AFTER INSERT ON `order`
FOR EACH ROW
BEGIN
  -- 触发表自身INSERT，导致无限递归
  INSERT INTO `order` (goods_id, num) VALUES (2, 1);
END //
```

#### 3. 注意 NULL 值处理

`NEW`/`OLD` 中的字段可能为 NULL，需提前判断，避免计算错误：

```sql
-- 正确示例：判断NULL值
CREATE TRIGGER trg_goods_update_check
BEFORE UPDATE ON goods
FOR EACH ROW
BEGIN
  IF NEW.stock IS NULL THEN
    SET NEW.stock = 0;  -- 若库存为NULL，默认设为0
  END IF;
END //
```

#### 4. 触发器的权限控制

- 创建触发器需 `TRIGGER` 权限 + 触发表的 `SELECT`/`UPDATE` 等权限；
- 普通用户建议仅授予查询权限，避免误删/修改触发器。

#### 5. 触发器的兼容性

- MySQL 8.0 支持触发器的 `DEFINER`（定义者）和 `INVOKER`（调用者）权限模式，默认使用 `DEFINER`（以创建者权限执行）；
- 不同数据库（如 Oracle）的触发器语法差异大，迁移时需注意适配。

### 11.3.3 触发器的常见坑与避坑方案

| 常见问题   | 避坑方案                                                    |
| ---------- | ----------------------------------------------------------- |
| 递归触发   | 避免在触发器中操作触发表本身；必要时通过条件限制触发次数    |
| 数据不一致 | 触发器逻辑中添加事务控制（如 `BEGIN/COMMIT`），确保原子性   |
| 排查困难   | 触发器中添加日志记录（如插入调试信息到日志表），便于追溯    |
| 性能下降   | 简化触发器逻辑，仅保留核心校验/同步功能，复杂逻辑移到应用层 |

## 11.4 事件调度器的开启与配置

事件调度器（Event Scheduler）是 MySQL 自带的“定时任务工具”，可按固定时间/间隔自动执行 SQL 逻辑，替代传统的 cron 任务或应用层定时任务，适用于数据库内的自动化运维（如数据清理、统计汇总、索引重建）。

### 11.4.1 事件调度器的核心概念

- 本质：数据库级别的定时任务，独立于连接会话（即使无用户连接，任务仍会执行）；
- 触发方式：支持一次性触发（如 2026-01-01 00:00）和周期性触发（如每天凌晨 2 点、每小时）；
- 执行逻辑：可执行任意 SQL 语句，包括 DML、DDL、存储过程调用。

### 11.4.2 开启与关闭事件调度器

事件调度器默认关闭，需手动开启：

```sql
-- 1. 查看事件调度器状态（ON/OFF/DISABLED）
SHOW VARIABLES LIKE 'event_scheduler';

-- 2. 临时开启（重启MySQL后失效）
SET GLOBAL event_scheduler = ON;
-- 或
SET @@GLOBAL.event_scheduler = 1;

-- 3. 永久开启（修改my.cnf/my.ini配置文件）
[mysqld]
event_scheduler = ON  -- 1/ON 开启，0/OFF 关闭，DISABLED 禁用（无法通过SQL修改）
```

> 注意：`DISABLED` 状态下，无法通过 SQL 开启事件调度器，需修改配置文件并重启 MySQL。

### 11.4.3 事件调度器的配置参数

可通过系统变量调整事件调度器的行为：

```sql
-- 查看事件调度器相关参数
SHOW VARIABLES LIKE '%event%';

-- 核心参数说明：
-- event_scheduler：是否开启（ON/OFF/DISABLED）
-- event_max_delayed_threads：延迟事件的最大线程数（默认10）
-- event_worker_threads：事件执行的工作线程数（默认4）
```

## 11.5 定时任务的创建与管理

### 11.5.1 事件的核心语法

```sql
-- 创建事件
CREATE EVENT [IF NOT EXISTS] 事件名
ON SCHEDULE
  -- 触发时间（二选一）
  AT 'YYYY-MM-DD HH:MM:SS'  -- 一次性触发
  -- 或周期性触发
  EVERY 时间间隔 [STARTS '开始时间'] [ENDS '结束时间']
[ON COMPLETION [NOT] PRESERVE]  -- 任务完成后是否保留（默认不保留）
[ENABLE | DISABLE]  -- 是否启用（默认启用）
DO
  -- 执行逻辑（SQL语句/存储过程）
  BEGIN
    -- 任务逻辑
  END;

-- 查看事件
SHOW EVENTS [FROM 数据库名] [LIKE '事件名%'];

-- 修改事件
ALTER EVENT 事件名
[ON SCHEDULE ...]  -- 修改触发时间
[ENABLE | DISABLE]  -- 启用/禁用
[DO ...];  -- 修改执行逻辑

-- 删除事件
DROP EVENT IF EXISTS 事件名;
```

时间间隔格式：`EVERY 1 HOUR`（每小时）、`EVERY 1 DAY`（每天）、`EVERY 30 MINUTE`（每30分钟）、`EVERY 1 WEEK`（每周）。

### 11.5.2 实战示例：创建定时任务

#### 示例1：一次性事件（指定时间执行）

```sql
-- 创建事件：2026-01-01 00:00 清空订单日志表
DELIMITER //
CREATE EVENT evt_clear_order_log
ON SCHEDULE AT '2026-01-01 00:00:00'
ON COMPLETION PRESERVE  -- 执行后保留事件（默认删除）
DO
BEGIN
  TRUNCATE TABLE order_log;  -- 清空日志表
  INSERT INTO sys_log (content) VALUES ('订单日志表已清空');  -- 记录操作日志
END //
DELIMITER ;
```

#### 示例2：周期性事件（每天执行）

```sql
-- 创建事件：每天凌晨2点，备份30天前的订单数据到历史表
DELIMITER //
CREATE EVENT evt_backup_old_order
ON SCHEDULE EVERY 1 DAY
STARTS '2026-01-01 02:00:00'  -- 开始时间
ENABLE  -- 启用事件
DO
BEGIN
  -- 插入30天前的订单到历史表
  INSERT INTO order_history (id, goods_id, num, create_time)
  SELECT id, goods_id, num, create_time
  FROM `order`
  WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

  -- 删除原表中30天前的订单
  DELETE FROM `order`
  WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);
END //
DELIMITER ;
```

#### 示例3：周期性事件（每小时执行）

```sql
-- 创建事件：每小时统计一次商品销量，更新到统计表
DELIMITER //
CREATE EVENT evt_stat_goods_sales
ON SCHEDULE EVERY 1 HOUR
STARTS NOW()  -- 立即开始
ENDS '2026-12-31 23:59:59'  -- 结束时间
DO
BEGIN
  -- 调用存储过程执行统计（推荐将复杂逻辑封装为存储过程）
  CALL sp_stat_goods_sales();
END //
DELIMITER ;
```

### 11.5.3 事件的管理与维护

#### 1. 禁用/启用事件

```sql
-- 禁用事件（临时停止执行）
ALTER EVENT evt_backup_old_order DISABLE;

-- 启用事件
ALTER EVENT evt_backup_old_order ENABLE;
```

#### 2. 修改事件触发时间

```sql
-- 修改为每天凌晨3点执行
ALTER EVENT evt_backup_old_order
ON SCHEDULE EVERY 1 DAY
STARTS '2026-01-01 03:00:00';
```

#### 3. 查看事件执行日志

事件执行日志默认记录在 MySQL 的通用日志中，需开启通用日志：

```sql
-- 临时开启通用日志
SET GLOBAL general_log = ON;
-- 查看通用日志路径
SHOW VARIABLES LIKE 'general_log_file';
```

通过查看通用日志，可确认事件是否按时执行、执行结果是否正常。

## 11.6 触发器与事件的性能影响与优化

触发器和事件虽能实现自动化，但不当使用会导致数据库性能下降，甚至引发生产故障，需针对性优化。

### 11.6.1 触发器的性能影响与优化

#### 1. 性能影响点

- **DML 延迟**：每个触发器都会增加 DML 操作的执行时间（尤其是 BEFORE 触发器）；
- **锁竞争**：触发器中的 UPDATE/INSERT 操作可能导致表锁/行锁竞争，高并发下易出现锁等待；
- **事务膨胀**：触发器与 DML 同属一个事务，复杂逻辑会延长事务时长，增加死锁风险。

#### 2. 优化策略

- **简化逻辑**：触发器仅保留核心校验/日志功能，复杂业务逻辑（如多表关联、批量更新）移到应用层；
- **减少触发器数量**：一张表的触发器数量控制在 3 个以内，避免多层嵌套；
- **使用 AFTER 触发器**：BEFORE 触发器会阻塞 DML 执行，非必要校验场景优先用 AFTER；
- **批量操作优化**：批量插入/更新时，触发器会逐行执行，可先禁用触发器，批量操作后再启用：
  ```sql
  -- 禁用触发器
  ALTER TABLE `order` DISABLE TRIGGER ALL;
  -- 批量插入
  INSERT INTO `order` (goods_id, num) VALUES (1, 2), (2, 3), (3, 4);
  -- 启用触发器
  ALTER TABLE `order` ENABLE TRIGGER ALL;
  -- 手动执行触发器逻辑（弥补批量操作的缺失）
  CALL sp_batch_deduct_stock();
  ```
- **避免长事务**：触发器中不执行耗时操作（如远程查询、大表扫描）。

### 11.6.2 事件调度器的性能影响与优化

#### 1. 性能影响点

- **资源抢占**：事件执行时会占用 CPU、IO 资源，若与业务高峰重叠，会影响正常业务；
- **长任务阻塞**：单次事件执行时间过长（如大表统计），会占用事件工作线程，导致后续任务延迟；
- **重复执行**：事件调度器异常时，可能导致任务重复执行（如未设置 `ON COMPLETION PRESERVE`）。

#### 2. 优化策略

- **错峰执行**：定时任务安排在业务低峰期（如凌晨 2-4 点），避免与高峰重叠；
- **拆分大任务**：将单次耗时的大任务拆分为多个小任务（如按日期拆分数据统计）；
- **控制并发数**：通过 `event_worker_threads` 参数限制事件工作线程数，避免占用过多资源；
- **添加执行锁**：防止事件重复执行（如通过状态表标记任务执行状态）：
  ```sql
  -- 事件逻辑中添加执行锁
  DELIMITER //
  CREATE EVENT evt_safe_stat
  ON SCHEDULE EVERY 1 HOUR
  DO
  BEGIN
    DECLARE v_lock INT DEFAULT 0;
    -- 尝试获取锁（1=未执行，0=已执行）
    SELECT COUNT(*) INTO v_lock FROM task_lock WHERE task_name = 'evt_safe_stat' AND status = 1;
    IF v_lock = 0 THEN
      -- 加锁
      INSERT INTO task_lock (task_name, status) VALUES ('evt_safe_stat', 1) ON DUPLICATE KEY UPDATE status = 1;
      -- 执行统计逻辑
      CALL sp_stat_goods_sales();
      -- 释放锁
      UPDATE task_lock SET status = 0 WHERE task_name = 'evt_safe_stat';
    END IF;
  END //
  DELIMITER ;
  ```
- **监控执行状态**：定期查看事件执行日志，及时发现耗时过长或失败的任务。

### 11.6.3 通用优化建议

- **监控与告警**：通过 MySQL 监控工具（如 Prometheus + Grafana）监控触发器/事件的执行耗时、失败次数；
- **定期清理**：删除无用的触发器/事件，避免无效逻辑占用资源；
- **测试验证**：新触发器/事件先在测试环境验证性能影响，再上线生产；
- **权限最小化**：触发器/事件的执行用户仅授予必要权限（如 `SELECT`/`UPDATE`），避免超权限操作。

### 总结

1. 触发器是数据表 DML 操作的“被动执行逻辑”，核心用于数据校验、同步、日志记录，分 BEFORE/AFTER 两种时机，依赖 `NEW`/`OLD` 访问变更数据；
2. 事件调度器是数据库级定时任务工具，需先开启 `event_scheduler`，支持一次性/周期性触发，适用于自动化运维；
3. 触发器需避免递归触发、复杂逻辑和嵌套，事件需错峰执行、拆分大任务，防止资源抢占；
4. 触发器会增加 DML 延迟，事件可能抢占业务资源，二者均需简化逻辑、控制数量，核心复杂逻辑优先放在应用层；
5. 运维层面需监控触发器/事件的执行状态，定期清理无效任务，确保数据库性能稳定。

触发器和事件调度器是 MySQL 自动化的重要工具，但“自动化”不等于“无管控”——合理使用能提升运维效率，过度依赖则会导致性能问题和排查困难。建议结合业务场景，将“轻量、核心”的自动化逻辑放在数据库层，复杂逻辑保留在应用层，以平衡效率与可维护性。
