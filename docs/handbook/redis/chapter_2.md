# 第2章 Redis环境搭建与基础操作

大家好，我是XXX（你的笔名）。上一章我们对Redis建立了整体认知，知道了它是什么、能做什么。从这一章开始，我们正式进入实操环节——环境搭建是学习Redis的第一步，也是后续所有实验的基础。

本章内容聚焦“落地性”，会手把手教大家完成3种环境的搭建（Windows、Linux、Docker），详解核心配置文件参数，介绍常用客户端工具，并梳理安装启动过程中的常见问题及解决方案。每个步骤都配有具体代码/命令示例，新手也能轻松跟上。建议大家边看边操作，遇到问题先对照“问题排查”小节尝试解决，培养动手能力。

## 2.1 本地环境搭建：Windows与Linux系统的Redis安装步骤

Redis官方对Windows系统的支持相对有限（最新稳定版多优先支持Linux），但为了照顾Windows用户，本节会分别讲解两种系统的安装步骤。生产环境中Redis几乎都部署在Linux系统，因此**重点推荐大家学习Linux安装方式**。

### 2.1.1 Windows系统安装（适合新手入门）

注意：Redis官方不提供Windows原生安装包，目前流通的Windows版本多由微软开源团队维护。推荐安装Redis 5.0+版本，兼容性更好。

#### 步骤1：下载Redis安装包

访问微软维护的Redis Windows版本仓库：[Redis Windows Releases](https://github.com/microsoftarchive/redis/releases)，下载最新稳定版的ZIP包（如Redis-x64-5.0.14.zip）。

建议下载ZIP压缩包（绿色版，无需安装，解压即可用），避免使用MSI安装包（可能存在环境变量配置问题）。

#### 步骤2：解压与目录说明

将下载的ZIP包解压到任意目录（如D:\Redis），解压后目录结构如下：

```text

Redis-x64-5.0.14/
├─ redis-benchmark.exe  # 性能测试工具
├─ redis-cli.exe        # 命令行客户端
├─ redis-server.exe     # 服务端启动程序
├─ redis.windows.conf   # Windows版配置文件
└─ redis.windows-service.conf  # 作为Windows服务启动的配置文件
```

#### 步骤3：启动Redis服务

Windows下启动Redis有两种方式：临时启动（命令行窗口关闭后服务停止）、注册为Windows服务（开机自启）。

##### 方式1：临时启动（推荐新手先尝试）

1. 打开cmd命令行窗口，切换到Redis解压目录（如D:\Redis\Redis-x64-5.0.14）；

2. 执行启动命令：
   `redis-server.exe redis.windows.conf`

3. 若出现如下界面，说明服务启动成功（默认端口6379）：
   （此处可配一张启动成功的截图说明：界面显示“Redis server started, listening on port 6379”）

注意：临时启动的Redis服务会占用当前cmd窗口，窗口关闭则服务停止。

##### 方式2：注册为Windows服务（长期使用）

若需要Redis长期运行，可将其注册为Windows服务，支持开机自启、后台运行。

1. 以“管理员身份”打开cmd窗口，切换到Redis解压目录；

2. 执行注册服务命令：`redis-server.exe --service-install redis.windows-service.conf --loglevel verbose`参数说明：`--service-install`表示注册服务；`--loglevel verbose` 表示设置日志级别为详细模式（便于排查问题）。

3. 启动服务：
   `redis-server.exe --service-start`启动成功会提示“Redis service started successfully”。

4. 其他常用服务命令：
   `redis-server.exe --service-stop  # 停止服务
redis-server.exe --service-uninstall  # 卸载服务
redis-server.exe --service-name redis6379  # 自定义服务名称（多实例时使用）`

#### 步骤4：验证安装成功

打开新的cmd窗口，切换到Redis解压目录，执行客户端连接命令：

```bash

redis-cli.exe -h 127.0.0.1 -p 6379
```

若连接成功，会进入`127.0.0.1:6379>` 交互界面，执行`ping` 命令，返回`PONG` 即表示服务正常。

```bash

127.0.0.1:6379> ping
PONG
127.0.0.1:6379> set test windows-redis
OK
127.0.0.1:6379> get test
"windows-redis"
```

### 2.1.2 Linux系统安装（生产环境主流，重点掌握）

本节以CentOS 7.x系统为例，讲解Redis 6.2.6（稳定版）的源码编译安装步骤。其他Linux发行版（如Ubuntu）步骤类似，仅依赖包安装命令略有差异。

#### 步骤1：安装依赖环境

Redis编译依赖gcc环境，若系统未安装gcc，需先执行以下命令安装：

```bash

# CentOS/RHEL系统
yum install -y gcc gcc-c++ make

# Ubuntu/Debian系统
# apt-get install -y gcc g++ make
```

安装完成后，执行`gcc --version` 验证是否安装成功（显示版本号即正常）。

#### 步骤2：下载Redis源码包

推荐从Redis官方网站下载源码包，确保文件完整性。执行以下命令下载并解压：

```bash

# 切换到/usr/local/src目录（习惯存放源码文件）
cd /usr/local/src

# 下载Redis 6.2.6源码包（官方下载地址）
wget https://download.redis.io/releases/redis-6.2.6.tar.gz

# 解压源码包
tar -zxvf redis-6.2.6.tar.gz
```

若wget命令无法使用，可先安装wget：`yum install -y wget`；也可在Windows上下载源码包后，通过Xshell、FinalShell等工具上传到Linux服务器的/usr/local/src目录。

#### 步骤3：编译与安装

进入解压后的源码目录，执行编译和安装命令：

```bash

# 进入源码目录
cd redis-6.2.6

# 编译（make命令会根据Makefile文件编译源码）
make

# 安装（指定安装目录为/usr/local/redis，便于后续管理）
make install PREFIX=/usr/local/redis
```

编译过程中若出现“jemalloc/jemalloc.h: No such file or directory”错误，可执行`make MALLOC=libc` 重新编译（原因是Redis默认使用jemalloc内存分配器，部分系统未安装）。

安装完成后，查看/usr/local/redis目录结构：

```text

/usr/local/redis/
└─ bin/  # 核心命令目录
   ├─ redis-server  # 服务端启动程序
   ├─ redis-cli     # 命令行客户端
   ├─ redis-benchmark  # 性能测试工具
   ├─ redis-check-aof  # AOF日志检查工具
   └─ redis-check-rdb  # RDB日志检查工具
```

#### 步骤4：配置文件拷贝与修改

源码目录中的redis.conf是默认配置文件，建议将其拷贝到安装目录的conf子目录下（便于管理），并进行基础配置：

```bash

# 在安装目录创建conf子目录
mkdir /usr/local/redis/conf

# 拷贝配置文件
cp /usr/local/src/redis-6.2.6/redis.conf /usr/local/redis/conf/

# 编辑配置文件（使用vim编辑器）
vim /usr/local/redis/conf/redis.conf
```

在vim中查找并修改以下核心参数（按`/参数名` 可快速查找）：

```text

# 1. 允许远程连接（默认bind 127.0.0.1，仅允许本地连接）
# 注释掉bind 127.0.0.1，或改为bind 0.0.0.0（允许所有IP连接）
# bind 127.0.0.1

# 2. 关闭保护模式（默认yes，禁止远程连接）
protected-mode no

# 3. 设置后台运行（默认no，启动后占用终端；改为yes，后台守护进程运行）
daemonize yes

# 4. 设置密码（默认无密码，生产环境必须设置！此处设为123456，可自定义）
requirepass 123456

# 5. 配置日志文件路径（默认日志输出到终端，改为输出到文件）
logfile "/usr/local/redis/log/redis.log"

# 6. 配置数据存储目录（默认./，即当前目录；改为指定目录）
dir /usr/local/redis/data
```

修改完成后，按`Esc` 键，输入`:wq` 保存并退出vim。

注意：需提前创建日志和数据目录，否则启动会报错：

```bash

mkdir /usr/local/redis/log
mkdir /usr/local/redis/data
```

#### 步骤5：启动Redis服务并验证

```bash

# 进入安装目录的bin目录
cd /usr/local/redis/bin

# 启动Redis（指定配置文件路径）
./redis-server ../conf/redis.conf

# 验证服务是否启动成功
ps -ef | grep redis
# 若输出类似以下内容，说明启动成功：
# root      12345      1  0 10:00 ?        00:00:00 ./redis-server 0.0.0.0:6379

# 连接Redis客户端（带密码连接）
./redis-cli -h 127.0.0.1 -p 6379 -a 123456

# 验证连接正常（执行ping命令，返回PONG）
127.0.0.1:6379> ping
PONG
```

#### 步骤6：设置开机自启（可选，推荐）

为了避免服务器重启后需要手动启动Redis，可将其配置为开机自启：

```bash

# 1. 创建系统服务文件
vim /etc/systemd/system/redis.service

# 2. 写入以下内容（注意路径需与实际安装目录一致）
[Unit]
Description=Redis Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/local/redis/bin/redis-server /usr/local/redis/conf/redis.conf
ExecStop=/usr/local/redis/bin/redis-cli -h 127.0.0.1 -p 6379 -a 123456 shutdown
Restart=always

[Install]
WantedBy=multi-user.target

# 3. 重新加载系统服务
systemctl daemon-reload

# 4. 设置开机自启
systemctl enable redis.service

# 5. 验证开机自启配置（可选）
systemctl is-enabled redis.service  # 输出enabled即成功
```

后续可通过以下命令管理Redis服务：

```bash

systemctl start redis.service  # 启动
systemctl stop redis.service   # 停止
systemctl restart redis.service  # 重启
systemctl status redis.service  # 查看状态
```

## 2.2 Docker快速部署：Redis容器化安装与配置

Docker是目前最流行的容器化技术，使用Docker部署Redis具有“环境隔离、配置简单、快速启停”的优势，尤其适合开发和测试环境。对于新手来说，Docker方式可以跳过复杂的依赖安装和配置，快速获得一个可用的Redis环境。

前提：已安装Docker环境。若未安装，可参考Docker官方文档：[Docker安装指南](https://docs.docker.com/get-docker/)（Windows、Mac、Linux均支持）。

### 2.2.1 单节点Redis部署（基础版）

适合快速测试使用，步骤如下：

#### 步骤1：拉取Redis镜像

从Docker Hub拉取官方Redis镜像（推荐指定稳定版本，避免使用latest标签导致版本不确定）：

```bash

# 拉取Redis 6.2.6稳定版镜像
docker pull redis:6.2.6

# 查看拉取的镜像
docker images | grep redis
# 输出类似：redis  6.2.6  xxxxxxxx  2 months ago  113MB
```

#### 步骤2：启动Redis容器

执行以下命令启动容器，同时配置端口映射、密码、数据卷挂载（避免容器删除后数据丢失）：

```bash

docker run -d \
  --name redis-demo \
  -p 6379:6379 \
  -v redis-data:/data \
  -v redis-conf:/usr/local/etc/redis \
  -e REDIS_PASSWORD=123456 \
  redis:6.2.6 \
  redis-server --requirepass 123456 --appendonly yes
```

参数详解（重点理解，避免踩坑）：

- `-d`：后台运行容器（守护进程模式）；

- `--name redis-demo`：给容器命名为redis-demo（便于后续管理）；

- `-p 6379:6379`：端口映射，将容器内的6379端口映射到宿主机的6379端口（宿主机端口:容器内端口）；

- `-v redis-data:/data`：挂载数据卷redis-data到容器内的/data目录（Redis默认数据存储目录），实现数据持久化（容器删除后数据不丢失）；

- `-v redis-conf:/usr/local/etc/redis`：挂载配置文件目录（后续可通过宿主机修改配置）；

- `-e REDIS_PASSWORD=123456`：设置环境变量，指定Redis密码（部分镜像支持，官方镜像需通过后续参数指定）；

- `redis:6.2.6`：使用的镜像名称和版本；

- `redis-server --requirepass 123456 --appendonly yes`：容器启动后执行的命令，设置密码为123456，开启AOF持久化（--appendonly yes）。

#### 步骤3：验证容器启动与连接

```bash

# 查看容器是否启动成功
docker ps | grep redis-demo
# 输出类似：xxxx  redis:6.2.6  "docker-entrypoint.s…"  5 minutes ago  Up 5 minutes  0.0.0.0:6379->6379/tcp  redis-demo

# 进入容器内部，使用redis-cli连接
docker exec -it redis-demo redis-cli -a 123456

# 验证连接正常
127.0.0.1:6379> ping
PONG
127.0.0.1:6379> set docker redis
OK
127.0.0.1:6379> get docker
"redis"
```

### 2.2.2 自定义配置文件启动（进阶版）

基础版启动方式适合简单测试，若需要自定义更多配置（如日志路径、内存限制），推荐使用自定义配置文件启动。

#### 步骤1：准备自定义配置文件

在宿主机创建配置文件目录（如/usr/local/docker/redis/conf），并创建redis.conf文件：

```bash

# 创建配置文件目录
mkdir -p /usr/local/docker/redis/conf

# 创建并编辑redis.conf文件
vim /usr/local/docker/redis/conf/redis.conf
```

在redis.conf中写入以下自定义配置（可根据需求调整）：

```text

# 基础配置
bind 0.0.0.0
protected-mode no
port 6379
daemonize no  # Docker容器内禁止后台运行（否则容器会启动后立即退出）
requirepass 123456

# 持久化配置
appendonly yes  # 开启AOF持久化
appendfilename "appendonly.aof"
appendfsync everysec  # 每秒同步一次AOF日志

# 内存配置
maxmemory 1024mb  # 限制最大内存为1GB
maxmemory-policy volatile-lru  # 内存满时淘汰过期键中最近最少使用的

# 日志配置
logfile "/var/log/redis/redis.log"
loglevel notice
```

#### 步骤2：启动容器（挂载自定义配置文件）

```bash

docker run -d \
  --name redis-custom \
  -p 6379:6379 \
  -v /usr/local/docker/redis/conf/redis.conf:/usr/local/etc/redis/redis.conf \
  -v redis-data-custom:/data \
  -v redis-log-custom:/var/log/redis \
  redis:6.2.6 \
  redis-server /usr/local/etc/redis/redis.conf
```

参数说明：

- `-v /usr/local/docker/redis/conf/redis.conf:/usr/local/etc/redis/redis.conf`：将宿主机的自定义配置文件挂载到容器内的对应路径；

- `-v redis-log-custom:/var/log/redis`：挂载日志目录，便于在宿主机查看Redis日志。

#### 步骤3：验证配置生效

```bash

# 进入容器连接Redis
docker exec -it redis-custom redis-cli -a 123456

# 查看配置是否生效（如查看maxmemory）
127.0.0.1:6379> config get maxmemory
1) "maxmemory"
2) "1073741824"  # 1GB对应的字节数，说明配置生效

# 查看AOF持久化是否开启
127.0.0.1:6379> config get appendonly
1) "appendonly"
2) "yes"
```

### 2.2.3 Docker Redis常用命令

整理了日常管理Docker Redis的常用命令，方便后续使用：

```bash

# 查看Redis容器日志
docker logs -f redis-demo  # -f 实时跟踪日志

# 停止Redis容器
docker stop redis-demo

# 启动已停止的Redis容器
docker start redis-demo

# 重启Redis容器
docker restart redis-demo

# 删除Redis容器（需先停止）
docker rm redis-demo

# 查看Redis数据卷（确认数据持久化目录）
docker volume inspect redis-data

# 进入容器内部（非客户端连接，用于查看文件等）
docker exec -it redis-demo /bin/bash
```

## 2.3 Redis核心配置文件详解：redis.conf关键参数说明

redis.conf是Redis的核心配置文件，几乎所有Redis的行为都可以通过该文件调整。上一节的安装步骤中，我们已经修改过部分基础参数，本节将系统梳理最常用的核心参数，帮助大家理解每个参数的作用、默认值和配置建议，为后续生产环境配置打下基础。

提示：可通过`redis-cli config get 参数名` 查看当前生效的配置（无需重启Redis）；通过`config set 参数名 value` 临时修改配置（重启后失效，永久修改需编辑redis.conf文件）。

### 2.3.1 网络相关配置

控制Redis的网络访问规则，核心参数如下：

| 参数名         | 默认值    | 作用说明                                                           | 配置建议                                                                              |
| -------------- | --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| bind           | 127.0.0.1 | 绑定的IP地址，仅绑定的IP可访问Redis。若绑定0.0.0.0，允许所有IP访问 | 开发环境：注释掉（允许所有IP）；生产环境：绑定内网IP（如192.168.1.100），避免外网访问 |
| protected-mode | yes       | 保护模式，开启后禁止远程连接（仅允许本地连接）                     | 需要远程连接时设为no（必须同时设置密码）                                              |
| port           | 6379      | Redis服务监听端口                                                  | 开发环境可使用默认值；生产环境建议修改为非默认端口（如6380），提升安全性              |
| tcp-backlog    | 511       | TCP连接队列大小，影响高并发场景下的连接性能                        | 高并发环境可调整为1024或2048                                                          |
| timeout        | 0         | 客户端空闲连接超时时间（秒），0表示永不超时                        | 生产环境建议设置为300（5分钟），释放空闲连接资源                                      |

### 2.3.2 安全相关配置

保障Redis服务的安全性，核心参数如下：

| 参数名         | 默认值   | 作用说明                                                            | 配置建议                                                                                      |
| -------------- | -------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| requirepass    | 无（空） | 设置Redis客户端连接密码，连接后需认证才能执行命令                   | 生产环境必须设置！密码建议复杂（字母+数字+特殊符号），避免弱密码                              |
| rename-command | 无       | 重命名危险命令（如FLUSHDB、FLUSHALL、CONFIG），避免误操作或恶意攻击 | 生产环境建议重命名：rename-command FLUSHDB ""（禁用）或 rename-command FLUSHDB "safe_flushdb" |
| maxclients     | 10000    | 允许同时连接的最大客户端数量                                        | 根据服务器配置和业务需求调整，如20000（需确保系统文件描述符足够）                             |

### 2.3.3 持久化相关配置

控制Redis数据持久化（RDB和AOF）的行为，核心参数如下（详细原理后续第6章讲解）：

| 参数名                      | 默认值                             | 作用说明                                                                                                                            | 配置建议                                                                               |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| save                        | save 900 1save 300 10save 60 10000 | RDB持久化触发条件：900秒内有1个键修改、300秒内有10个键修改、60秒内有10000个键修改时，自动生成RDB快照                                | 开发环境可使用默认值；生产环境可根据数据重要性调整，如save 300 100（5分钟内100个修改） |
| rdbcompression              | yes                                | 是否对RDB文件进行压缩（消耗CPU，节省磁盘空间）                                                                                      | 默认开启；若CPU资源紧张，可设为no                                                      |
| appendonly                  | no                                 | 是否开启AOF持久化（记录所有写命令，保证数据完整性）                                                                                 | 生产环境建议开启（yes），配合RDB使用，提升数据安全性                                   |
| appendfsync                 | everysec                           | AOF同步策略：always（每次写命令都同步，最安全但性能差）、everysec（每秒同步，平衡安全与性能）、no（由操作系统决定，性能好但不安全） | 推荐使用默认值everysec                                                                 |
| auto-aof-rewrite-percentage | 100                                | AOF重写触发条件：当AOF文件大小超过上次重写后大小的100%（即翻倍）时，自动重写                                                        | 可调整为150，减少重写频率                                                              |

### 2.3.4 内存相关配置

控制Redis的内存使用，避免内存溢出，核心参数如下：

| 参数名            | 默认值     | 作用说明                                                                                                                                      | 配置建议                                                                |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| maxmemory         | 0          | Redis最大可用内存（字节），0表示不限制（受系统内存限制）                                                                                      | 生产环境必须设置！建议设为服务器物理内存的70%-80%（如16GB内存设为12GB） |
| maxmemory-policy  | noeviction | 内存满时的淘汰策略：noeviction（不淘汰，拒绝写命令）、volatile-lru（淘汰过期键中最近最少使用的）、allkeys-lru（淘汰所有键中最近最少使用的）等 | 缓存场景推荐volatile-lru；若所有键都有过期时间，可使用allkeys-lru       |
| maxmemory-samples | 5          | LRU淘汰策略的采样数量（采样越多，淘汰越精准，但消耗CPU越多）                                                                                  | 默认5即可；高CPU环境可设为3，精准度要求高可设为10                       |

## 2.4 Redis客户端工具：redis-cli命令行与可视化工具使用

Redis服务启动后，需要通过客户端工具与服务端交互。常用的客户端工具分为两类：命令行客户端（redis-cli，官方自带）和可视化客户端（界面友好，适合查看数据）。本节将详细介绍这两类工具的使用方法。

### 2.4.1 redis-cli命令行客户端（重点掌握）

redis-cli是Redis官方提供的命令行客户端，支持所有Redis命令，是开发和运维的必备工具。无论哪种环境（Windows、Linux、Docker），只要安装了Redis，都会自带redis-cli。

#### 1. 基础连接命令

根据部署环境的不同，redis-cli的连接命令略有差异：

```bash

# 1. 连接本地Redis（默认端口6379，无密码）
redis-cli

# 2. 连接本地Redis（指定端口、密码）
redis-cli -p 6379 -a 123456

# 3. 连接远程Redis（指定IP、端口、密码）
redis-cli -h 192.168.1.100 -p 6380 -a 123456

# 4. Docker环境连接容器内Redis（两种方式）
# 方式1：进入容器后连接
docker exec -it redis-demo redis-cli -a 123456
# 方式2：直接在宿主机连接（需映射端口）
redis-cli -h 127.0.0.1 -p 6379 -a 123456
```

注意：若Redis设置了密码，也可先连接再认证（更安全，避免密码暴露在命令行历史中）：

```bash

redis-cli -h 192.168.1.100 -p 6380
192.168.1.100:6380> auth 123456  # 认证密码
OK
```

#### 2. 常用交互命令

连接成功后，可执行Redis命令与服务端交互。这里先介绍几个基础命令，后续章节会详细讲解各类命令：

```bash

# 1. 测试连接是否正常
127.0.0.1:6379> ping
PONG  # 返回PONG表示连接正常

# 2. 查看Redis服务信息
127.0.0.1:6379> info
# 输出大量信息，包括服务器信息、内存使用、持久化状态等
# 可指定查看某类信息，如查看内存信息：info memory

# 3. 查看当前所有键
127.0.0.1:6379> keys *
(empty array)  # 刚安装的Redis无键，输出空数组

# 4. 设置键值对（字符串类型）
127.0.0.1:6379> set name redis-cli-test
OK

# 5. 获取键值对
127.0.0.1:6379> get name
"redis-cli-test"

# 6. 查看键的类型
127.0.0.1:6379> type name
string

# 7. 删除键
127.0.0.1:6379> del name
(integer) 1  # 1表示删除成功，0表示键不存在

# 8. 退出客户端
127.0.0.1:6379> exit  # 或按Ctrl+C
```

#### 3. 批量执行命令（脚本模式）

除了交互模式，redis-cli还支持脚本模式（批量执行命令），适合自动化操作。例如，创建一个命令脚本文件redis_commands.txt：

```text

# redis_commands.txt
set user:1001 zhangsan
set user:1002 lisi
hset user:1003 name wangwu age 25
keys user:*
get user:1001
```

执行脚本文件：

```bash

redis-cli -a 123456 < redis_commands.txt
# 输出执行结果：
OK
OK
(integer) 2
1) "user:1001"
2) "user:1002"
3) "user:1003"
"zhangsan"
```

### 2.4.2 可视化客户端工具（推荐新手）

命令行客户端适合执行命令，但查看复杂数据结构（如Hash、Sorted Set）和管理键时不够直观。可视化客户端工具提供图形界面，可轻松查看、编辑、删除键，适合日常开发和调试。

#### 1. Another Redis Desktop Manager（推荐，开源免费）

开源免费、轻量高效，支持Windows/Mac/Linux，是目前最受欢迎的Redis可视化工具之一。

- 下载地址：[GitHub Releases](https://github.com/qishibo/AnotherRedisDesktopManager/releases)（根据系统选择对应版本）；

- 核心功能：支持多实例管理、键的增删改查、数据结构可视化、命令行终端嵌入、数据导入导出等；

- 使用步骤：
  1. 安装完成后打开软件，点击“连接”→“新建连接”；

  2. 填写连接信息：名称（自定义，如Local Redis）、主机（127.0.0.1）、端口（6379）、密码（123456）；

  3. 点击“测试连接”，显示“连接成功”后点击“确定”；

  4. 双击连接，即可查看Redis中的键，右键键名可进行编辑、删除等操作。

#### 2. Redis Desktop Manager（商业版，功能强大）

早期开源，后期转为商业版（收费），功能全面，适合企业用户。

- 下载地址：[官方下载页](https://redisdesktop.com/download)；

- 核心功能：支持集群管理、哨兵监控、数据备份与恢复、SQL查询（类似数据库查询）等；

- 注意：免费版有功能限制，商业版需付费激活。

#### 3. 其他工具

- **RedisInsight**：Redis官方推出的可视化工具，支持监控、性能分析、命令行终端，免费使用（下载地址：[官方地址](https://redis.com/redis-enterprise/redis-insight/)）；

- **Navicat for Redis**：Navicat系列工具之一，适合习惯使用Navicat的用户，支持多数据库管理，收费。

## 2.5 基础命令实操：连接、认证与服务状态查看

上一节介绍客户端工具时，已经接触了部分基础命令。本节将系统梳理“连接与服务状态相关”的核心命令，这些命令是日常操作的基础，必须熟练掌握。所有命令均在redis-cli中执行，建议边看边实操。

### 2.5.1 连接与认证命令

用于客户端与Redis服务端建立连接、进行身份认证，核心命令如下：

| 命令   | 语法           | 功能说明                                                    | 示例                                 |
| ------ | -------------- | ----------------------------------------------------------- | ------------------------------------ |
| ping   | ping [message] | 测试客户端与服务端连接是否正常；若带参数，服务端返回该参数  | ping → PONG；ping hello → "hello"    |
| auth   | auth password  | 客户端认证，若Redis设置了密码，必须认证通过才能执行其他命令 | auth 123456 → OK                     |
| select | select dbindex | 切换Redis数据库（Redis默认有16个数据库，索引0-15）          | select 1 → OK（切换到索引1的数据库） |
| quit   | quit           | 关闭客户端连接，退出redis-cli                               | quit → 退出交互模式                  |

示例实操：

```bash

# 1. 连接本地Redis，未认证
redis-cli -p 6379
127.0.0.1:6379> set name test  # 未认证，执行命令报错
(error) NOAUTH Authentication required.

# 2. 认证
127.0.0.1:6379> auth 123456
OK

# 3. 切换数据库
127.0.0.1:6379> select 1
OK
127.0.0.1:6379[1]>  # 提示符后出现[1]，表示当前在数据库1

# 4. 测试连接
127.0.0.1:6379[1]> ping hello
"hello"

# 5. 退出
127.0.0.1:6379[1]> quit
```

### 2.5.2 服务状态查看命令

用于查看Redis服务的运行状态、配置信息、内存使用等，核心命令是`info`，配合不同参数可查看指定类型的信息。

#### 1. info 命令（核心）

语法：`info [section]`，section为可选参数，指定查看的信息类型。常用section如下：

- `server`：服务器基本信息（版本、运行时间、操作系统等）；

- `clients`：客户端连接信息（当前连接数、阻塞连接数等）；

- `memory`：内存使用信息（已用内存、碎片率、最大内存等）；

- `persistence`：持久化信息（RDB/AOF的状态、最后一次持久化时间等）；

- `stats`：统计信息（键总数、命令执行次数等）；

- `all`：查看所有信息（默认）。

示例实操：

```bash

# 1. 查看服务器基本信息
127.0.0.1:6379> info server
# Server
redis_version:6.2.6
redis_git_sha1:00000000
redis_git_dirty:0
redis_build_id:xxxxxxxxxxxx
redis_mode:standalone  # 运行模式：单机
os:Linux 3.10.0-1160.el7.x86_64 x86_64
arch_bits:64
multiplexing_api:epoll
atomicvar_api:atomic-builtin
gcc_version:4.8.
```
