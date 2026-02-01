# MySQL 数据库应用指南：第12章 MySQL用户与权限管理

在数据库运维中，用户与权限管理是保障数据安全的第一道防线——合理的账号规划、精细化的权限控制，能有效防止非授权访问、数据泄露或误操作。本章将从用户账号的全生命周期管理，到权限的授予与回收，再到安全最佳实践，全面讲解 MySQL 用户权限体系的核心知识点，帮你构建安全、可控的数据库访问体系。

## 12.1 MySQL用户账号的创建、修改与删除

MySQL 的用户账号由 `用户名@主机名` 组成（如 `app_user@'%'`），其中“主机名”限制用户的访问来源，二者组合唯一标识一个用户。

### 12.1.1 用户账号的核心语法

#### 1. 创建用户

```sql
-- 基础创建（设置密码）
CREATE USER [IF NOT EXISTS] '用户名'@'主机名'
IDENTIFIED BY '密码';

-- 高级创建（指定密码过期时间、默认数据库等）
CREATE USER '用户名'@'主机名'
IDENTIFIED BY '密码'
WITH
  MAX_QUERIES_PER_HOUR 1000  -- 每小时最大查询数
  MAX_CONNECTIONS_PER_HOUR 100  -- 每小时最大连接数
  PASSWORD EXPIRE INTERVAL 90 DAY;  -- 密码90天后过期
```

**主机名规则**：

- `%`：允许从任意主机访问（慎用，生产环境建议限制IP）；
- `192.168.1.%`：允许从192.168.1网段访问；
- `127.0.0.1`：仅允许本地访问；
- `localhost`：仅允许本地通过socket访问（与127.0.0.1等价）；
- 具体IP（如 `192.168.1.100`）：仅允许该IP访问。

#### 2. 修改用户

```sql
-- 修改用户名/主机名
RENAME USER 'old_user'@'old_host' TO 'new_user'@'new_host';

-- 锁定/解锁用户（禁止/允许登录）
ALTER USER 'user'@'%' ACCOUNT LOCK;
ALTER USER 'user'@'%' ACCOUNT UNLOCK;

-- 修改用户默认数据库
ALTER USER 'user'@'%' DEFAULT DATABASE = test_db;
```

#### 3. 删除用户

```sql
-- 删除单个用户
DROP USER [IF EXISTS] '用户名'@'主机名';

-- 批量删除
DROP USER 'user1'@'%', 'user2'@'192.168.1.%';
```

#### 4. 查看用户

```sql
-- 查看所有用户（MySQL 8.0+）
SELECT user, host, authentication_string, account_locked
FROM mysql.user;

-- 查看用户详细信息
SHOW CREATE USER 'app_user'@'%';
```

### 12.1.2 实战示例

```sql
-- 1. 创建应用用户（仅允许192.168.1网段访问）
CREATE USER IF NOT EXISTS 'app_user'@'192.168.1.%'
IDENTIFIED BY 'App@123456';

-- 2. 创建只读用户（任意主机访问，限制每小时查询数）
CREATE USER 'read_user'@'%'
IDENTIFIED BY 'Read@123456'
WITH MAX_QUERIES_PER_HOUR 5000;

-- 3. 修改应用用户主机名（限制为具体IP）
RENAME USER 'app_user'@'192.168.1.%' TO 'app_user'@'192.168.1.100';

-- 4. 锁定违规用户
ALTER USER 'read_user'@'%' ACCOUNT LOCK;

-- 5. 删除无用用户
DROP USER IF EXISTS 'test_user'@'%';
```

## 12.2 权限的分类与核心权限说明

MySQL 权限按粒度可分为**全局权限**、**数据库权限**、**表权限**、**列权限**、**存储过程/函数权限**，不同粒度的权限对应不同的操作范围。

### 12.2.1 权限分类（按粒度）

| 权限粒度   | 作用范围                              | 授权语法示例                                               |
| ---------- | ------------------------------------- | ---------------------------------------------------------- |
| 全局权限   | 整个MySQL实例（所有数据库）           | `GRANT ALL ON *.* TO 'user'@'%'`                           |
| 数据库权限 | 指定数据库（如 test_db）              | `GRANT SELECT, INSERT ON test_db.* TO 'user'@'%'`          |
| 表权限     | 指定数据库的指定表（如 test_db.user） | `GRANT UPDATE (name) ON test_db.user TO 'user'@'%'`        |
| 列权限     | 指定表的指定列（如 user表的name列）   | `GRANT UPDATE (name) ON test_db.user TO 'user'@'%'`        |
| 程序权限   | 存储过程/函数                         | `GRANT EXECUTE ON PROCEDURE test_db.sp_demo TO 'user'@'%'` |

### 12.2.2 核心权限说明（高频使用）

| 权限名称          | 作用                       | 适用场景                     |
| ----------------- | -------------------------- | ---------------------------- |
| ALL PRIVILEGES    | 所有权限（除GRANT OPTION） | 管理员账号                   |
| SELECT            | 查询数据                   | 只读用户、报表用户           |
| INSERT            | 插入数据                   | 写操作用户（如应用用户）     |
| UPDATE            | 修改数据                   | 写操作用户                   |
| DELETE            | 删除数据                   | 谨慎授予，仅核心业务用户     |
| CREATE            | 创建数据库/表/索引         | 开发/测试用户                |
| DROP              | 删除数据库/表              | 仅管理员，生产环境慎用       |
| ALTER             | 修改表结构                 | 开发/运维用户                |
| EXECUTE           | 执行存储过程/函数          | 应用用户（调用存储过程）     |
| GRANT OPTION      | 授予权限给其他用户         | 管理员（慎用，防止权限扩散） |
| LOCK TABLES       | 锁定表                     | 备份用户、批量操作用户       |
| REPLICATION SLAVE | 复制权限（从库）           | 主从复制的从库账号           |

### 12.2.3 权限的存储与生效

- 权限信息存储在 `mysql` 系统库的 `user`、`db`、`tables_priv`、`columns_priv` 等表中；
- 授予权限后，需执行 `FLUSH PRIVILEGES` 使权限立即生效（MySQL 8.0+ 部分场景自动生效，但建议显式执行）；
- 用户重新连接后，新权限才会生效。

## 12.3 权限的授予（GRANT）与回收（REVOKE）

### 12.3.1 权限授予（GRANT）核心语法

```sql
-- 基础语法
GRANT 权限列表 ON 作用范围 TO '用户名'@'主机名'
[WITH GRANT OPTION];  -- 允许用户将自己的权限授予他人（慎用）

-- 权限列表格式：多个权限用逗号分隔（如 SELECT, INSERT, UPDATE）
-- 作用范围格式：
-- *.*：全局
-- db_name.*：指定数据库
-- db_name.table_name：指定表
-- db_name.table_name (col1, col2)：指定列
```

#### 实战示例

```sql
-- 1. 授予应用用户test_db数据库的增删改查权限（仅192.168.1.100访问）
GRANT SELECT, INSERT, UPDATE, DELETE ON test_db.* TO 'app_user'@'192.168.1.100';

-- 2. 授予只读用户所有数据库的查询权限（禁止更新）
GRANT SELECT ON *.* TO 'read_user'@'%';

-- 3. 授予列级权限（仅允许修改user表的name列）
GRANT UPDATE (name) ON test_db.user TO 'dev_user'@'127.0.0.1';

-- 4. 授予存储过程执行权限
GRANT EXECUTE ON PROCEDURE test_db.sp_deduct_stock TO 'app_user'@'192.168.1.100';

-- 5. 授予管理员全局权限（含授权权限）
GRANT ALL PRIVILEGES ON *.* TO 'admin_user'@'127.0.0.1' WITH GRANT OPTION;

-- 使权限生效
FLUSH PRIVILEGES;
```

### 12.3.2 权限回收（REVOKE）核心语法

```sql
-- 基础语法
REVOKE 权限列表 ON 作用范围 FROM '用户名'@'主机名';

-- 回收所有权限
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '用户名'@'主机名';
```

#### 实战示例

```sql
-- 1. 回收应用用户的删除权限（禁止删除数据）
REVOKE DELETE ON test_db.* FROM 'app_user'@'192.168.1.100';

-- 2. 回收只读用户的全局查询权限，仅保留test_db的查询权限
REVOKE SELECT ON *.* FROM 'read_user'@'%';
GRANT SELECT ON test_db.* TO 'read_user'@'%';

-- 3. 回收管理员的授权权限（防止权限扩散）
REVOKE GRANT OPTION ON *.* FROM 'admin_user'@'127.0.0.1';

-- 使回收生效
FLUSH PRIVILEGES;
```

### 12.3.3 查看用户权限

```sql
-- 查看用户已授予的权限
SHOW GRANTS FOR 'app_user'@'192.168.1.100';

-- 查看当前登录用户的权限
SHOW GRANTS;
```

输出示例：

```
+---------------------------------------------------------------------+
| Grants for app_user@192.168.1.100                                   |
+---------------------------------------------------------------------+
| GRANT USAGE ON *.* TO `app_user`@`192.168.1.100`                    |
| GRANT SELECT, INSERT, UPDATE ON `test_db`.* TO `app_user`@`192.168.1.100` |
+---------------------------------------------------------------------+
```

> `USAGE` 表示用户无任何权限（仅拥有登录权限）。

## 12.4 密码策略与密码重置方法

密码是用户访问的第一道屏障，合理的密码策略能大幅提升账号安全性，而密码重置则是运维中常见的应急操作。

### 12.4.1 密码策略配置

MySQL 8.0+ 内置密码验证插件，支持配置密码复杂度、过期时间、重试次数等策略。

#### 1. 查看当前密码策略

```sql
-- 查看密码策略相关参数
SHOW VARIABLES LIKE 'validate_password%';
```

核心参数说明：
| 参数名 | 作用 | 默认值 |
|--------|------|--------|
| validate_password.length | 密码最小长度 | 8 |
| validate_password.number_count | 密码中至少包含的数字个数 | 1 |
| validate_password.special_char_count | 密码中至少包含的特殊字符个数 | 1 |
| validate_password.mixed_case_count | 密码中至少包含的大小写字母个数 | 1 |
| validate_password.policy | 密码强度策略（LOW/MEDIUM/STRONG） | MEDIUM |
| validate_password.expire_policy | 密码过期策略（NONE/EXPIRE/EXPIRE_N_DAYS） | NONE |

#### 2. 修改密码策略

```sql
-- 临时修改（重启MySQL失效）
SET GLOBAL validate_password.length = 10;
SET GLOBAL validate_password.policy = STRONG;  -- 强策略（需满足所有复杂度要求）
SET GLOBAL validate_password.expire_policy = EXPIRE_N_DAYS;
SET GLOBAL validate_password.expire_days = 90;  -- 密码90天后过期

-- 永久修改（修改my.cnf/my.ini）
[mysqld]
validate_password_length = 10
validate_password_policy = STRONG
default_password_lifetime = 90  -- 密码默认90天过期
```

### 12.4.2 密码修改与重置

#### 1. 普通用户修改自己的密码

```sql
-- 方法1：ALTER USER
ALTER USER USER() IDENTIFIED BY 'New@123456';

-- 方法2：SET PASSWORD
SET PASSWORD = 'New@123456';
```

#### 2. 管理员重置其他用户密码

```sql
-- 重置app_user密码
ALTER USER 'app_user'@'192.168.1.100' IDENTIFIED BY 'NewApp@123456';

-- 强制密码立即过期（用户下次登录需修改密码）
ALTER USER 'app_user'@'192.168.1.100' PASSWORD EXPIRE;
```

#### 3. 忘记root密码的重置方法（应急）

当忘记root密码时，需通过跳过权限验证的方式重置：

```bash
# 1. 停止MySQL服务
systemctl stop mysqld  # CentOS/RHEL
# 或
service mysql stop  # Ubuntu/Debian

# 2. 启动MySQL并跳过权限验证
mysqld_safe --skip-grant-tables --skip-networking &

# 3. 免密码登录MySQL
mysql -u root

# 4. 重置root密码
USE mysql;
ALTER USER 'root'@'localhost' IDENTIFIED BY 'NewRoot@123456';
FLUSH PRIVILEGES;

# 5. 重启MySQL服务
systemctl restart mysqld
```

### 12.4.3 密码安全注意事项

- 密码必须包含大小写字母、数字、特殊字符，长度≥10位；
- 禁止使用弱密码（如 123456、root、admin）；
- 定期更换密码（建议90天），不同环境（开发/测试/生产）使用不同密码；
- 禁止明文存储密码（如配置文件中需加密存储）。

## 12.5 基于IP的访问控制配置

基于IP的访问控制是限制用户访问来源的核心手段，能有效防止非授权IP的恶意访问，生产环境中必须严格配置。

### 12.5.1 核心配置方式

#### 1. 创建用户时限制IP

```sql
-- 仅允许192.168.1.100访问
CREATE USER 'app_user'@'192.168.1.100' IDENTIFIED BY 'App@123456';

-- 允许192.168.1网段访问
CREATE USER 'dev_user'@'192.168.1.%' IDENTIFIED BY 'Dev@123456';

-- 仅允许本地访问（localhost/127.0.0.1）
CREATE USER 'admin_user'@'localhost' IDENTIFIED BY 'Admin@123456';
```

#### 2. 修改用户的访问IP

```sql
-- 将任意IP访问的用户修改为仅允许指定IP
RENAME USER 'app_user'@'%' TO 'app_user'@'192.168.1.100';
```

#### 3. 通过防火墙/安全组限制IP（推荐）

除了MySQL层面的IP限制，还需在服务器防火墙（如 iptables/ufw）或云厂商安全组中限制访问MySQL端口（3306）的IP：

```bash
# iptables仅允许192.168.1.100访问3306端口
iptables -A INPUT -p tcp --dport 3306 -s 192.168.1.100 -j ACCEPT
iptables -A INPUT -p tcp --dport 3306 -j DROP

# 保存iptables规则
service iptables save
```

### 12.5.2 常见IP配置场景

| 场景             | 主机名配置                    | 适用用户        |
| ---------------- | ----------------------------- | --------------- |
| 生产环境应用用户 | 192.168.1.100（应用服务器IP） | app_user        |
| 开发环境用户     | 192.168.1.%（开发网段）       | dev_user        |
| 管理员用户       | localhost/127.0.0.1           | root/admin_user |
| 只读报表用户     | 10.0.0.50（报表服务器IP）     | report_user     |

### 12.5.3 注意事项

- 生产环境禁止使用 `%`（任意IP）配置用户，仅测试环境临时使用；
- 3306端口仅开放给必要的IP，禁止公网直接暴露；
- 定期审计用户的主机名配置，删除无用的宽范围IP授权。

## 12.6 权限管理的安全最佳实践

### 12.6.1 最小权限原则（核心）

- 每个用户仅授予完成工作所需的最小权限，如：
  - 应用用户：仅授予对应数据库的 SELECT/INSERT/UPDATE（禁止DROP/ALTER）；
  - 只读用户：仅授予 SELECT 权限；
  - 管理员用户：仅本地访问，且避免授予 WITH GRANT OPTION；
- 禁止使用root账号运行应用程序（应用必须使用专用低权限账号）。

### 12.6.2 账号与权限审计

- 定期（每月）审计用户列表，删除无用账号（如离职员工、测试账号）；
- 审计用户权限，回收超出必要范围的权限（如普通用户的ALTER权限）；
- 开启MySQL审计日志，记录权限变更、用户登录等操作：
  ```sql
  -- 开启审计日志（MySQL 8.0+）
  SET GLOBAL audit_log = ON;
  SET GLOBAL audit_log_file = '/var/log/mysql/audit.log';
  ```

### 12.6.3 强化认证与访问控制

- 启用SSL/TLS加密连接，防止数据传输过程中被窃听：
  ```sql
  -- 开启SSL
  SET GLOBAL require_secure_transport = ON;
  ```
- 限制用户最大连接数和查询数，防止恶意攻击：
  ```sql
  CREATE USER 'app_user'@'192.168.1.100'
  IDENTIFIED BY 'App@123456'
  WITH MAX_CONNECTIONS_PER_HOUR 100 MAX_QUERIES_PER_HOUR 10000;
  ```
- 禁止空密码用户，删除默认账号（如 anonymous 匿名用户）：
  ```sql
  -- 删除匿名用户
  DROP USER ''@'localhost';
  -- 禁止空密码登录
  SET GLOBAL validate_password.check_user_name = ON;
  ```

### 12.6.4 分环境隔离账号

- 开发/测试/生产环境使用独立的用户账号，权限逐级收紧；
- 生产环境账号密码定期更换，且与开发/测试环境不同；
- 测试环境禁止使用生产环境的真实数据和账号。

### 12.6.5 应急处理策略

- 发现异常登录/权限变更时，立即锁定相关账号：
  ```sql
  ALTER USER 'app_user'@'192.168.1.100' ACCOUNT LOCK;
  ```
- 定期备份权限表（mysql.user、mysql.db等），便于权限恢复；
- 制定密码重置、账号封禁的应急流程，确保快速响应安全事件。

### 总结

1. MySQL用户账号由`用户名@主机名`唯一标识，主机名是IP访问控制的核心，生产环境禁止配置为`%`；
2. 权限按粒度分为全局、数据库、表、列四级，需遵循“最小权限原则”，仅授予必要权限；
3. 密码策略需配置复杂度要求、过期时间，忘记root密码可通过跳过权限验证的方式重置；
4. 基于IP的访问控制需结合MySQL用户配置和服务器防火墙，双重限制访问来源；
5. 权限管理的安全核心：最小权限、定期审计、强化认证、分环境隔离、应急处理。

用户与权限管理是数据库安全的基础，没有“一劳永逸”的配置，只有持续的审计和优化。通过本章的方法构建权限体系，能有效降低非授权访问、数据泄露的风险，保障数据库的安全稳定运行。
