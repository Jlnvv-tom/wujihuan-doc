# MySQL 数据库应用指南：第2章 MySQL概述与环境搭建

作为学习 MySQL 的第一步，环境搭建是所有实操的基础——只有把 MySQL 成功安装并配置好，才能开展后续的 SQL 操作、性能优化等实践。本章会从 MySQL 的发展历程和核心特性讲起，帮你理清版本选择逻辑，再手把手教你完成 Windows/Linux 系统的安装配置，以及图形化工具的使用，让你快速搭建起高效的 MySQL 学习与开发环境。

## 2.1 MySQL的发展历程与核心特性

在动手安装前，先简单了解 MySQL 的“前世今生”和核心优势，能帮你更好地理解它为何成为全球最流行的开源关系型数据库。

### 2.1.1 MySQL的发展历程

MySQL 的发展充满传奇色彩，核心节点如下：

- 1995年：由瑞典 MySQL AB 公司开发，首次发布公开版本；
- 2008年：Sun 公司以 10 亿美元收购 MySQL AB；
- 2009年：Oracle 公司收购 Sun，MySQL 正式归入 Oracle 旗下；
- 2010年：MySQL 5.5 发布，引入 InnoDB 作为默认存储引擎（奠定其在生产环境的核心地位）；
- 2018年：MySQL 8.0 发布，带来重大更新（如窗口函数、JSON 增强、性能优化等）；
- 至今：Oracle 持续维护 MySQL 社区版（开源免费）和企业版（商业付费），社区生态依然活跃。

> 补充：MySQL 官方历史文档可参考 [https://dev.mysql.com/doc/history/](https://dev.mysql.com/doc/history/)，里面详细记录了各版本的更新日志。

### 2.1.2 MySQL的核心特性

MySQL 能成为主流开源数据库，核心在于“开源免费+高性能+高可靠+易扩展”，具体特性如下：

1. **开源免费**：社区版完全开源，可自由下载、使用和二次开发，大幅降低企业和个人使用成本；
2. **跨平台性强**：支持 Windows、Linux、macOS 等多种操作系统，部署灵活；
3. **高性能**：针对读写操作深度优化，支持索引、分区等特性，中小型业务可直接使用，大型业务可通过集群扩展；
4. **多存储引擎支持**：采用插件式架构，默认使用 InnoDB（支持事务、行锁），还支持 MyISAM（查询快，适合只读场景）、Memory（内存存储）等；
5. **完善的 SQL 支持**：完全兼容标准 SQL 语法，支持存储过程、触发器、视图等高级特性；
6. **高可靠性**：支持事务 ACID 特性、主从复制、备份恢复，保证数据一致性和可用性；
7. **易用性强**：安装配置简单，有丰富的命令行/图形化工具，社区资源丰富（遇到问题易排查）。

## 2.2 MySQL的版本选择与适用场景

MySQL 有多个版本分支，不同版本的特性和适用场景差异较大，新手很容易选错。本节帮你理清版本区别，快速选到适合自己的版本。

### 2.2.1 主流版本分支对比

| 版本分支                                 | 核心特点                                                    | 适用场景                                                  | 新手推荐度                        |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| MySQL 社区版（MySQL Community Server）   | 开源免费，功能完整，Oracle 官方维护，更新频繁               | 个人学习、中小型企业开发、非核心业务生产环境              | ✅ 首选                           |
| MySQL 企业版（MySQL Enterprise Edition） | 基于社区版增强，提供商业支持、安全插件、监控工具            | 大型企业核心业务、对技术支持有高要求的场景                | ❌ 不推荐（付费，无必要）         |
| MariaDB                                  | MySQL 原作者主导开发，兼容 MySQL 语法，开源免费，有独有特性 | 担心 Oracle 闭源的企业、需兼容 MySQL 且追求灵活特性的场景 | ⚠️ 可选（新手建议先学官方 MySQL） |

### 2.2.2 具体版本选择（社区版）

MySQL 社区版版本号遵循“主版本.次版本.修订版本”（如 8.0.36），新手优先选 **8.0.x 系列稳定版**，原因：

- 5.7.x 系列：稳定成熟，但缺失窗口函数、JSON 路径查询等新特性，适合老项目维护；
- 8.0.x 系列：当前主流版本，修复 5.7 诸多问题，新增大量实用特性，性能提升明显，官方支持周期长（至 2026 年）；
- 避坑提醒：不要选开发版/预览版，这类版本可能存在 bug，不适合学习和生产环境。

> 最新稳定版查询：访问 [MySQL 官方下载页](https://dev.mysql.com/downloads/mysql/)，页面会标注“Recommended Download”（推荐下载）的版本。

### 2.2.3 不同场景的版本适配建议

- 个人学习/开发：MySQL 8.0.x 稳定版（如 8.0.36），功能完整，掌握最新特性；
- 中小型企业生产环境：MySQL 8.0.x 稳定版（优先选 8.0.30+ 等经过市场验证的版本）；
- 老项目维护：根据项目文档选择对应版本（如 5.7.x），避免版本升级的兼容性问题。

## 2.3 Windows系统下MySQL的安装与配置

Windows 是新手最常用的开发环境，MySQL 提供两种安装包：**msi 安装包（图形化向导）** 和 **ZIP 压缩包（免安装，手动配置）**。新手推荐先使用 .msi 安装包（操作简单，不易出错）。

### 2.3.1 准备工作

1. 系统要求：Windows 10 及以上（32/64 位均可，建议 64 位）；
2. 下载安装包：访问 [MySQL 官方下载页](https://dev.mysql.com/downloads/mysql/)，选择“Windows (x86, 64-bit), MSI Installer”或“Windows (x86, 64-bit), ZIP Archive”，点击“Download”，无需注册，直接点击“No thanks, just start my download”下载。

### 2.3.2 .msi安装包安装（图形化向导）

1. 双击下载的 .msi 文件，启动安装向导，选择“Custom”（自定义安装，推荐），点击“Next”；
2. 选择安装组件：至少勾选“MySQL Server”（核心服务）和“MySQL Shell”（命令行工具），其他组件（如 MySQL Workbench）可按需勾选，点击“Next”；
3. 选择安装路径：建议安装在非系统盘（如 `D:\Program Files\MySQL\MySQL Server 8.0`），避免系统盘空间不足，点击“Next”；
4. 配置 MySQL 服务：
   - 端口号：默认 3306（若被占用，可修改为 3307 等，记住端口号）；
   - 服务名称：默认“MySQL80”，可自定义，点击“Next”；
5. 设置 root 密码：root 是超级管理员，密码建议设置复杂且易记的（如 `Root@123456`），点击“Next”；
6. 配置 Windows 服务：勾选“Start the MySQL Server at System Startup”（开机自启，新手推荐），点击“Next”；
7. 点击“Execute”执行安装，等待完成后点击“Finish”。

### 2.3.3 ZIP压缩包安装（免安装，手动配置）

适合喜欢手动配置的用户，步骤如下：

1. 解压 ZIP 包：将压缩包解压到非系统盘（如 `D:\MySQL\mysql-8.0.36-winx64`）；
2. 创建配置文件：在解压根目录新建 `my.ini` 文件，写入以下配置（替换为你的实际路径）：

```ini
[mysqld]
# 端口号
port=3306
# 解压路径
basedir=D:\MySQL\mysql-8.0.36-winx64
# 数据存储目录（自动创建，无需手动建）
datadir=D:\MySQL\mysql-8.0.36-winx64\data
# 字符集（推荐UTF8MB4，支持emoji）
character-set-server=utf8mb4
# 默认存储引擎
default-storage-engine=InnoDB

[mysql]
# 客户端字符集
default-character-set=utf8mb4
```

3. 配置环境变量：
   - 右键“此电脑”→“属性”→“高级系统设置”→“环境变量”；
   - 在“系统变量”中找到“Path”，点击“编辑”；
   - 点击“新建”，添加 MySQL 的 bin 目录路径（如 `D:\MySQL\mysql-8.0.36-winx64\bin`），点击“确定”保存；
4. 初始化并安装服务（管理员身份打开 CMD）：

```cmd
# 初始化（生成临时root密码，记住！）
mysqld --initialize --console
# 安装服务（名称为MySQL80）
mysqld --install MySQL80
# 启动服务
net start MySQL80
```

5. 修改 root 密码：

```cmd
# 登录MySQL（输入临时密码）
mysql -u root -p
# 修改密码（替换为你的新密码）
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@123456';
```

### 2.3.4 安装验证

打开 CMD，执行以下命令，输入密码后若出现 `mysql>` 提示符，说明安装成功：

```cmd
mysql -u root -p
```

### 2.3.5 常见问题排查

- 问题1：启动服务提示“服务无法启动”？
  解决：检查 `my.ini` 中 basedir/datadir 路径是否正确；若已初始化过，删除 data 目录后重新初始化。
- 问题2：登录提示“Access denied for user 'root'@'localhost'”？
  解决：确认密码正确；若忘记密码，参考官方文档重置：[https://dev.mysql.com/doc/refman/8.0/en/resetting-permissions.html](https://dev.mysql.com/doc/refman/8.0/en/resetting-permissions.html)。
- 问题3：命令行无法识别 `mysql` 命令？
  解决：检查环境变量 Path 是否添加 bin 目录，添加后重启 CMD。

## 2.4 Linux系统下MySQL的安装与配置

Linux 是 MySQL 生产环境的主流部署系统，本节以 **CentOS 7/8** 和 **Ubuntu 20.04/22.04** 为例，介绍 YUM/APT 仓库安装（简单，推荐）和源码编译安装（复杂，适合自定义配置）。

### 2.4.1 CentOS系统（YUM仓库安装）

1. 清理残留（若有）：

```bash
# 查看已安装的MySQL包
rpm -qa | grep mysql
# 卸载残留包（替换为实际包名）
yum remove -y mysql-xxx mysql-xxx
```

2. 添加官方 YUM 仓库：

```bash
# 下载仓库配置文件
wget https://dev.mysql.com/get/mysql80-community-release-el7-3.noarch.rpm
# 安装配置文件
rpm -ivh mysql80-community-release-el7-3.noarch.rpm
```

3. 安装 MySQL 服务：

```bash
yum install -y mysql-community-server
```

4. 启动服务并设置开机自启：

```bash
# 启动服务
systemctl start mysqld
# 开机自启
systemctl enable mysqld
# 查看状态（显示active running则成功）
systemctl status mysqld
```

5. 修改 root 密码：

```bash
# 查看临时密码
grep 'temporary password' /var/log/mysqld.log
# 登录并修改密码
mysql -u root -p
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@123456';
```

6. 开放 3306 端口（可选，允许远程访问）：

```bash
firewall-cmd --zone=public --add-port=3306/tcp --permanent
firewall-cmd --reload
```

### 2.4.2 Ubuntu系统（APT仓库安装）

1. 更新 APT 仓库：

```bash
sudo apt update
```

2. 安装 MySQL 服务：

```bash
sudo apt install -y mysql-server
```

3. 启动服务并设置开机自启：

```bash
# 查看状态
sudo systemctl status mysql
# 启动服务（若未启动）
sudo systemctl start mysql
# 开机自启
sudo systemctl enable mysql
```

4. 配置 root 密码（Ubuntu 默认无密码）：

```bash
# 免密登录
sudo mysql -u root
# 修改密码
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'Root@123456';
# 刷新权限
FLUSH PRIVILEGES;
```

5. 开放 3306 端口（可选）：

```bash
sudo ufw allow 3306/tcp
sudo ufw reload
```

### 2.4.3 安装验证

在终端执行以下命令，能显示 MySQL 版本则说明成功：

```bash
mysql -u root -p -e "SELECT VERSION();"
```

### 2.4.4 常见问题排查

- 问题1：CentOS 安装提示“没有可用的软件包”？
  解决：CentOS 8 需先禁用自带 MySQL 模块：`sudo dnf module disable mysql`，再重新安装。
- 问题2：Ubuntu 登录提示“Access denied”？
  解决：执行 `sudo mysql -u root` 登录（Ubuntu 默认 root 需 sudo），重新修改密码。
- 问题3：远程无法连接？
  解决：① 确认防火墙开放 3306 端口；② 执行 `update mysql.user set host='%' where user='root'; FLUSH PRIVILEGES;` 允许 root 远程访问。

## 2.5 MySQL图形化工具（Navicat/DBeaver）的使用

命令行工具高效但不直观，图形化工具能大幅提升表设计、数据查询的效率。本节介绍两款主流工具：**Navicat（商用）** 和 **DBeaver（开源免费）**。

### 2.5.1 Navicat的使用

#### 1. 下载与安装

访问 [Navicat 官网](https://www.navicat.com/en/download/navicat-for-mysql)，下载对应系统版本（Windows/macOS/Linux），安装过程一路“下一步”即可（可试用 14 天）。

#### 2. 连接 MySQL

1. 打开 Navicat，点击左上角“连接”→“MySQL”；
2. 填写连接信息：
   - 连接名：自定义（如“本地 MySQL”）；
   - 主机：localhost（本地）/服务器 IP（远程）；
   - 端口：3306；
   - 用户名/密码：root + 你的密码；
3. 点击“测试连接”，提示“连接成功”后点击“确定”。

#### 3. 核心功能

- 创建数据库：右键连接名→“新建数据库”，输入名称、选择 utf8mb4 字符集；
- 创建数据表：右键数据库→“新建表”，图形化设计字段（名称、类型、约束）；
- 数据操作：双击表名，直接增删改查数据；
- SQL 编辑器：点击“查询”→“新建查询”，编写并运行 SQL 语句。

### 2.5.2 DBeaver的使用

DBeaver 是开源免费的跨平台工具，支持多种数据库，适合预算有限的用户。

#### 1. 下载与安装

访问 [DBeaver 官网](https://dbeaver.io/download/)，下载社区版（Community Edition），安装过程与普通软件一致。

#### 2. 连接 MySQL

1. 打开 DBeaver，点击“数据库”→“新建连接”；
2. 搜索“MySQL”并选择，点击“下一步”；
3. 填写主机、端口、用户名、密码，点击“测试连接”，成功后点击“完成”。

#### 3. 核心功能

DBeaver 核心功能与 Navicat 类似，额外优势：

- 支持 SQL 格式化、语法提示；
- 免费导出数据为 Excel/CSV；
- 兼容所有主流数据库，无需切换工具。

## 2.6 MySQL服务的启动、停止与状态检查

使用 MySQL 过程中，经常需要手动操作服务（如重启让配置生效），本节汇总 Windows/Linux 下的核心命令。

### 2.6.1 Windows系统下的服务操作

#### 1. 命令行方式（管理员 CMD）

```cmd
# 启动服务（名称为MySQL80）
net start MySQL80
# 停止服务
net stop MySQL80
# 重启服务
net stop MySQL80 && net start MySQL80
# 查看服务状态
sc query MySQL80
```

#### 2. 图形化方式

1. 按下 Win+R，输入 `services.msc` 打开服务窗口；
2. 找到 MySQL 服务（如 MySQL80），右键可选择“启动/停止/重启/属性”（设置开机自启）。

### 2.6.2 Linux系统下的服务操作

Linux 用 `systemctl` 命令（CentOS 7+/Ubuntu 16.04+），需 root 权限（加 sudo）：

```bash
# CentOS 启动/停止/重启/查看状态
sudo systemctl start mysqld
sudo systemctl stop mysqld
sudo systemctl restart mysqld
sudo systemctl status mysqld

# Ubuntu 启动/停止/重启/查看状态
sudo systemctl start mysql
sudo systemctl stop mysql
sudo systemctl restart mysql
sudo systemctl status mysql

# 设置开机自启（CentOS/Ubuntu通用）
sudo systemctl enable mysqld  # CentOS
sudo systemctl enable mysql   # Ubuntu
```

### 2.6.3 常见问题

- 问题1：Windows 启动服务提示“错误 1067”？
  解决：大概率是 `my.ini` 配置错误或 data 目录损坏，检查配置后重新初始化。
- 问题2：Linux 启动服务提示“failed”？
  解决：查看日志排查原因：`journalctl -xe | grep mysqld` 或 `cat /var/log/mysqld.log`。

### 总结

1. MySQL 社区版是新手首选，8.0.x 稳定版适配大多数学习/开发场景；
2. Windows 推荐 .msi 安装包，Linux 推荐 YUM/APT 仓库安装，均需重点配置字符集为 utf8mb4；
3. Navicat（商用）和 DBeaver（开源）是主流图形化工具，能大幅提升操作效率；
4. 掌握服务的启动/停止/重启命令，是解决配置问题的基础。

本章完成了从“理论认知”到“环境搭建”的过渡，下一章将正式学习 MySQL 数据库/表的基础操作，开启 SQL 实战之旅。若遇到问题，可参考本章的排查方法，或在 [MySQL 官方论坛](https://forums.mysql.com/) 搜索解决方案。
