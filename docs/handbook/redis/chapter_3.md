# MySQL 数据库应用指南：第3章 MySQL基础操作入门

上一章我们成功搭建了MySQL环境，这一章就正式进入核心实操环节——MySQL基础操作。作为SQL学习的起点，本章内容以“命令行操作”为核心（最通用、最基础），涵盖连接退出、数据库/数据表的增删查改、系统命令使用等核心知识点。掌握这些操作，就能完成MySQL的基础数据管理工作，为后续复杂查询和进阶操作打下坚实基础。

## 3.1 MySQL连接与退出的命令行操作

无论是本地操作还是远程管理MySQL，第一步都是“连接数据库”。MySQL提供了内置的命令行工具（mysql），支持多种连接方式，也是排查问题、执行核心操作的最可靠方式。

### 3.1.1 本地连接MySQL

本地连接是最常用的场景（操作本机安装的MySQL），核心命令如下：

```bash
# 基础连接命令（默认端口3306）
mysql -u 用户名 -p

# 完整参数示例（指定端口、用户名）
mysql -u root -P 3306 -p
```

**参数说明**：

- `-u`：指定登录用户名（如root，超级管理员）；
- `-p`：表示需要输入密码（注意`-p`后不要加空格，否则会把后续内容当作密码）；
- `-P`（大写）：指定MySQL服务端口号（默认3306，若安装时修改过端口，必须指定）；
- `-h`：指定主机地址（本地连接可省略，默认localhost或127.0.0.1）。

**操作步骤**：

1. 打开命令行工具（Windows：CMD/PowerShell；Linux：终端）；
2. 输入上述命令，按回车后提示“Enter password:”；
3. 输入MySQL登录密码（输入时不显示明文），再按回车；
4. 若出现“mysql>”提示符，说明连接成功。

### 3.1.2 远程连接MySQL

远程连接适用于管理服务器上的MySQL（如云服务器），核心命令需指定远程主机IP：

```bash
# 远程连接命令（指定主机IP、端口、用户名）
mysql -h 192.168.1.100 -P 3306 -u root -p
```

**注意事项**：

- 远程连接前，需确保服务器上的MySQL允许远程访问（默认只允许本地访问，需配置权限，后续章节详细讲解）；
- 服务器防火墙需开放3306端口（Windows：防火墙规则；Linux：firewall-cmd/ufw）；
- 若连接失败，可先通过`ping 192.168.1.100`测试网络连通性。

### 3.1.3 MySQL的退出操作

完成操作后，需正确退出MySQL连接，避免资源占用，退出命令有3种（任意一种均可）：

```sql
-- 方式1：输入exit（推荐，简洁）
exit;

-- 方式2：输入quit
quit;

-- 方式3：输入\q（反斜杠+q）
\q
```

> 说明：MySQL命令行中，命令结尾可加“;”（分号）也可不加（exit/quit/\q除外，建议统一加“;”养成规范）。

### 3.1.4 常见连接错误排查

| 错误信息                                                                              | 原因                    | 解决方法                                                           |
| ------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)` | 密码输入错误            | 重新输入正确密码；忘记密码参考第2章密码重置方法                    |
| `ERROR 2003 (HY000): Can't connect to MySQL server on 'localhost' (10061)`            | MySQL服务未启动         | Windows：`net start MySQL80`；Linux：`sudo systemctl start mysqld` |
| `ERROR 2005 (HY000): Unknown MySQL server host '192.168.1.100' (11001)`               | 远程主机IP错误/网络不通 | 检查IP地址和网络连接                                               |

## 3.2 数据库的创建、查看与删除

数据库是数据表的“容器”，所有数据表都必须隶属于某个数据库。本节学习数据库的核心操作：创建（CREATE）、查看（SHOW）、删除（DROP），这是管理数据的第一步。

### 3.2.1 创建数据库（CREATE DATABASE）

核心语法：

```sql
-- 基础创建命令
CREATE DATABASE 数据库名;

-- 推荐语法（避免数据库已存在时报错）
CREATE DATABASE IF NOT EXISTS 数据库名;

-- 完整语法（指定字符集和校对规则）
CREATE DATABASE IF NOT EXISTS 数据库名 CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

**参数说明**：

- `IF NOT EXISTS`：可选，若数据库已存在则不报错（推荐添加，避免重复创建）；
- `CHARACTER SET`：指定数据库默认字符集（推荐utf8mb4，支持所有Unicode字符，包括emoji）；
- `COLLATE`：指定字符集的校对规则（utf8mb4_general_ci：不区分大小写；utf8mb4_bin：区分大小写）。

**实操示例**：

```sql
-- 创建名为test_db的数据库，指定字符集utf8mb4
CREATE DATABASE IF NOT EXISTS test_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 执行成功后提示：Query OK, 1 row affected, 1 warning (0.00 sec)
```

### 3.2.2 查看数据库（SHOW DATABASES）

核心语法及示例：

```sql
-- 查看所有数据库
SHOW DATABASES;

-- 查看符合条件的数据库（模糊查询，%表示任意字符）
SHOW DATABASES LIKE 'test%';  -- 查看以test开头的数据库

-- 查看数据库的创建语句（验证字符集、校对规则）
SHOW CREATE DATABASE test_db;
```

**执行效果**：

- `SHOW DATABASES;` 会列出所有数据库（包括系统库：information_schema、mysql、performance_schema、sys）；
- `SHOW CREATE DATABASE` 可验证字符集是否设置正确，是排查乱码问题的关键命令。

### 3.2.3 切换数据库（USE）

创建数据表前，必须先切换到目标数据库（指定操作的“容器”），语法：

```sql
USE 数据库名;
```

示例：

```sql
-- 切换到test_db数据库
USE test_db;

-- 执行成功后提示：Database changed
```

> 提示：可通过`SELECT DATABASE();`命令查看当前所在数据库，避免操作错数据库。

### 3.2.4 删除数据库（DROP DATABASE）

核心语法：

```sql
-- 基础删除命令
DROP DATABASE 数据库名;

-- 推荐语法（避免数据库不存在时报错）
DROP DATABASE IF EXISTS 数据库名;
```

示例：

```sql
-- 删除名为old_db的数据库（若存在）
DROP DATABASE IF EXISTS old_db;

-- 执行成功后提示：Query OK, 0 rows affected (0.01 sec)
```

⚠️ **警告**：删除数据库会同时删除库内所有数据表和数据，且无法恢复！生产环境务必谨慎，删除前建议备份。

## 3.3 数据表的创建、查看与删除

数据表是MySQL存储数据的核心对象，数据以“行（记录）”和“列（字段）”组织。本节重点掌握表的创建（字段定义、约束设置）、查看和删除操作。

### 3.3.1 数据表的创建（CREATE TABLE）

核心语法（需先切换到目标数据库）：

```sql
CREATE TABLE IF NOT EXISTS 表名 (
  字段名1 数据类型 [约束条件],
  字段名2 数据类型 [约束条件],
  ...
  字段名n 数据类型 [约束条件]
) [CHARACTER SET 字符集] [COLLATE 校对规则];
```

**关键说明**：

- 数据类型：指定字段存储类型（如INT、VARCHAR、DATETIME，后续章节详解）；
- 约束条件：保证数据完整性（主键、非空、唯一等）；
- 字段间用逗号分隔，最后一个字段后不加逗号（避免语法错误）。

**实操示例**：创建用户表（user）

```sql
-- 切换到test_db数据库
USE test_db;

-- 创建user表，包含id、name、age、phone、create_time字段
CREATE TABLE IF NOT EXISTS user (
  id INT PRIMARY KEY AUTO_INCREMENT,  -- 主键，自增（唯一标识记录）
  name VARCHAR(50) NOT NULL,          -- 姓名，非空
  age INT DEFAULT NULL,               -- 年龄，默认空
  phone VARCHAR(20) UNIQUE,           -- 手机号，唯一
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP  -- 创建时间，默认当前时间
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

> 执行成功提示：`Query OK, 0 rows affected (0.02 sec)`，表创建完成。

### 3.3.2 查看数据表（SHOW TABLES）

核心语法及示例：

```sql
-- 查看当前数据库下的所有数据表
SHOW TABLES;

-- 查看符合条件的数据表（模糊查询）
SHOW TABLES LIKE 'u%';  -- 查看以u开头的表

-- 查看表结构（核心命令，字段名、类型、约束）
DESC 表名;  -- 简写
-- 或
DESCRIBE 表名;
-- 或（更详细信息，如字段备注）
SHOW COLUMNS FROM 表名;

-- 查看表的创建语句（验证结构和约束）
SHOW CREATE TABLE 表名;
```

**示例**：查看user表结构

```sql
DESC user;

-- 执行结果（简化）：
+-------------+-------------+------+-----+-------------------+-------------------+
| Field       | Type        | Null | Key | Default           | Extra             |
+-------------+-------------+------+-----+-------------------+-------------------+
| id          | int         | NO   | PRI | NULL              | auto_increment    |
| name        | varchar(50) | NO   |     | NULL              |                   |
| age         | int         | YES  |     | NULL              |                   |
| phone       | varchar(20) | YES  | UNI | NULL              |                   |
| create_time | datetime    | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
+-------------+-------------+------+-----+-------------------+-------------------+
```

**结果说明**：

- Field：字段名；
- Type：数据类型；
- Null：是否允许为空；
- Key：索引类型（PRI=主键，UNI=唯一索引）；
- Default：默认值；
- Extra：额外信息（如auto_increment=自增）。

### 3.3.3 删除数据表（DROP TABLE）

核心语法：

```sql
-- 基础删除命令
DROP TABLE 表名;

-- 推荐语法（避免表不存在时报错）
DROP TABLE IF EXISTS 表名;

-- 同时删除多个表
DROP TABLE IF EXISTS 表名1, 表名2;
```

示例：

```sql
-- 删除名为old_table的表
DROP TABLE IF EXISTS old_table;

-- 同时删除table1和table2
DROP TABLE IF EXISTS table1, table2;
```

⚠️ **警告**：删除数据表会清空所有数据且无法恢复！操作前务必确认，重要数据先备份。

## 3.4 MySQL常用系统命令与帮助文档使用

MySQL命令行提供了很多实用系统命令，能快速查看信息、排查问题；官方帮助文档是解决问题的权威资源，务必掌握使用方法。

### 3.4.1 常用系统命令（命令行模式）

MySQL系统命令通常以“\”开头（无需加“;”结尾），常用命令汇总：

```sql
-- 1. 查看当前所在数据库
SELECT DATABASE();  -- SQL语句，需加;
-- 或
\c  -- 系统命令，无需加;

-- 2. 查看当前登录用户
SELECT USER();  -- SQL语句

-- 3. 查看MySQL版本
SELECT VERSION();  -- SQL语句
-- 或
\s  -- 系统命令，查看详细版本/系统/字符集信息

-- 4. 清除命令行屏幕
\! cls  -- Windows
\! clear  -- Linux

-- 5. 终止当前输入的SQL语句（输入错误时用）
\c

-- 6. 切换SQL模式（临时）
SET sql_mode = 'ONLY_FULL_GROUP_BY';
```

> 优势：系统命令执行速度快，无需解析SQL语法，适合快速查看基础信息。

### 3.4.2 MySQL帮助文档的使用

#### 1. 内置帮助文档（命令行内）

MySQL内置简易帮助，可快速查阅命令/数据类型/函数的用法：

```sql
-- 查看帮助总目录
help;  -- 或\h

-- 查看特定命令帮助（如CREATE DATABASE）
help CREATE DATABASE;

-- 查看数据类型帮助（如INT）
help INT;

-- 查看函数帮助（如SUM）
help SUM;
```

示例：执行`help CREATE TABLE`会显示该命令的完整语法、参数说明和示例，比搜索引擎更精准。

#### 2. 官方在线帮助文档

内置文档简洁，详细内容推荐官方文档：

- 官方地址：[https://dev.mysql.com/doc/](https://dev.mysql.com/doc/)
- 使用技巧：
  1. 选择对应MySQL版本（如8.0）；
  2. 搜索关键词（如“CREATE TABLE”“字符集”）；
  3. 新手优先看“Getting Started”和“Reference Manual”部分。

## 3.5 字符集与校对规则的设置与影响

字符集（Character Set）决定MySQL能存储哪些字符（中文、emoji等），校对规则（Collation）决定字符的比较方式（是否区分大小写）。设置不当会导致乱码、查询结果错误，是新手高频踩坑点。

### 3.5.1 常见字符集介绍

MySQL支持多种字符集，常用3种如下：
| 字符集 | 支持字符范围 | 占用空间 | 适用场景 |
|--------|--------------|----------|----------|
| UTF8 | 基本Unicode（不支持部分emoji） | 1-3字节 | 传统中文/英文场景 |
| UTF8MB4 | 完整Unicode（支持所有emoji/特殊符号） | 1-4字节 | 现代应用（推荐，如社交/电商） |
| GBK | 中文简/繁体（不支持其他语言） | 1-2字节 | 纯中文兼容场景 |

💡 **推荐**：所有新项目一律用UTF8MB4，避免后续因emoji、特殊字符导致的乱码问题。

### 3.5.2 校对规则介绍

校对规则是字符集的附属属性，核心差异在于是否区分大小写/重音。以UTF8MB4为例：

- `utf8mb4_general_ci`：不区分大小写，不区分重音（默认，性能好）；
- `utf8mb4_bin`：区分大小写，区分重音（二进制比较，精准）；
- `utf8mb4_unicode_ci`：不区分大小写，支持Unicode排序（性能略差）。

**示例**：校对规则的影响

```sql
-- 假设name字段用utf8mb4_general_ci（不区分大小写）
SELECT * FROM user WHERE name = 'ZhangSan';
-- 会查出ZhangSan、zhangsan、ZHANGSAN的记录

-- 若用utf8mb4_bin（区分大小写）
SELECT * FROM user WHERE name = 'ZhangSan';
-- 仅查出严格为ZhangSan的记录
```

### 3.5.3 字符集与校对规则的设置层级

MySQL支持4个设置层级（从高到低），下层未设置时继承上层配置：

1. **服务器级**（my.ini/my.cnf）：全局默认，需重启服务生效；

   ```ini
   [mysqld]
   character-set-server=utf8mb4
   collation-server=utf8mb4_general_ci

   [mysql]
   default-character-set=utf8mb4
   ```

2. **数据库级**（CREATE DATABASE）：覆盖服务器级；
   ```sql
   CREATE DATABASE test_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   ```
3. **表级**（CREATE TABLE）：覆盖数据库级；
   ```sql
   CREATE TABLE user (id INT) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   ```
4. **字段级**（CREATE TABLE内）：覆盖表级，细粒度控制；
   ```sql
   CREATE TABLE user (
     name VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,  -- 区分大小写
     address VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci  -- 不区分
   );
   ```

### 3.5.4 查看当前字符集与校对规则

```sql
-- 查看服务器级
SHOW VARIABLES LIKE 'character_set_server';
SHOW VARIABLES LIKE 'collation_server';

-- 查看数据库级
SHOW VARIABLES LIKE 'character_set_database';
SHOW VARIABLES LIKE 'collation_database';

-- 查看表级
SHOW CREATE TABLE 表名;

-- 查看字段级
DESC 表名;
```

## 3.6 基础操作中的常见错误与排查方法

新手执行MySQL操作时，易因语法、约束、字符集等问题出错。本节汇总高频错误及排查方法，帮你快速定位解决。

### 3.6.1 语法错误类

| 错误信息                                                                      | 原因                               | 解决方法              |
| ----------------------------------------------------------------------------- | ---------------------------------- | --------------------- |
| `ERROR 1064 (42000): You have an error in your SQL syntax near ')' at line 5` | CREATE TABLE时最后一个字段后多逗号 | 删除多余逗号          |
| `ERROR 1054 (42S22): Unknown column 'name1' in 'field list'`                  | 字段名拼写错误                     | 用DESC 表名验证字段名 |
| `ERROR 1146 (42S02): Table 'test_db.user1' doesn't exist`                     | 表名拼写错误                       | 用SHOW TABLES验证表名 |

**示例修复**：

```sql
-- 错误写法（最后字段多逗号）
CREATE TABLE user (
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,  -- 多余逗号
);

-- 正确写法
CREATE TABLE user (
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL  -- 无逗号
);
```

### 3.6.2 约束相关错误

| 错误信息                                                                 | 原因                   | 解决方法                              |
| ------------------------------------------------------------------------ | ---------------------- | ------------------------------------- |
| `ERROR 1062 (23000): Duplicate entry '13800138000' for key 'user.phone'` | 唯一约束字段插入重复值 | 检查数据，确保phone唯一               |
| `ERROR 1048 (23000): Column 'name' cannot be null`                       | 非空字段插入NULL       | 为name赋值，或修改约束（不推荐）      |
| `ERROR 1062 (23000): Duplicate entry '1' for key 'PRIMARY'`              | 主键插入重复值         | 自增主键无需手动赋值，让MySQL自动生成 |

### 3.6.3 字符集相关错误

1. **插入emoji提示乱码**：
   错误信息：`ERROR 1366 (HY000): Incorrect string value: '\xF0\x9F\x98\x8A' for column 'name'`
   原因：字段字符集为UTF8（不支持emoji）
   解决：修改为UTF8MB4

   ```sql
   -- 修改表字符集
   ALTER TABLE user CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   -- 修改字段字符集（关键，表级修改不影响已有字段）
   ALTER TABLE user MODIFY COLUMN name VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   ```

2. **查询结果乱码**：
   原因：客户端字符集与服务器不一致
   临时解决：`SET NAMES utf8mb4;`
   永久解决：修改my.ini/my.cnf的[mysql]部分，添加`default-character-set=utf8mb4`，重启服务。

### 3.6.4 通用排查方法

1. **看错误信息**：重点关注关键词（如“Unknown column”“Duplicate entry”）和行号；
2. **验证对象存在性**：用SHOW DATABASES/SHOW TABLES/DESC 表名验证库/表/字段存在；
3. **检查语法规范**：确保语句结尾加“;”，字段/表名不用关键字（如order需加反引号`order`）；
4. **查官方文档**：搜索错误代码（如1064、1366），获取权威解决方案。

### 总结

1. 连接MySQL核心命令是`mysql -u 用户名 -p`，远程需加`-h 主机IP`，退出用`exit;`；
2. 数据库/表操作遵循“创建-查看-切换-删除”逻辑，删除操作务必谨慎，优先加`IF EXISTS`避免报错；
3. 数据表创建需关注字段定义、约束（主键/非空/唯一），用`DESC 表名`快速查看结构；
4. 推荐所有场景使用UTF8MB4字符集+utf8mb4_general_ci校对规则，避免乱码；
5. 排查错误优先看错误信息，验证对象存在性，结合官方文档解决。

这些基础操作是后续SQL查询、数据操纵的前提，建议多动手练习，熟练掌握每个命令的用法和注意事项。下一章我们将学习SQL查询的核心内容，正式进入数据提取的实战环节。
