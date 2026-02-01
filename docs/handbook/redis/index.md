# Redis 入门与实战

## 第一部分 入门基础：认识Redis

### 第1章 走进Redis：从概念到价值

1.1 什么是Redis：非关系型数据库的核心定义
1.2 Redis的核心特性：高性能、高可用与灵活数据结构
1.3 Redis的应用场景：缓存、队列、计数器等典型场景解析
1.4 主流数据库对比：Redis与MySQL、MongoDB的差异与适配场景
1.5 Redis的发展历程与版本迭代：从1.0到7.x的核心演进
1.6 学习Redis的准备工作：环境、工具与学习方法

### 第2章 Redis环境搭建与基础操作

2.1 本地环境搭建：Windows与Linux系统的Redis安装步骤
2.2 Docker快速部署：Redis容器化安装与配置
2.3 Redis核心配置文件详解：redis.conf关键参数说明
2.4 Redis客户端工具：redis-cli命令行与可视化工具使用
2.5 基础命令实操：连接、认证与服务状态查看
2.6 环境问题排查：安装与启动常见错误解决

### 第3章 Redis核心数据结构基础：字符串与哈希

3.1 字符串（String）：Redis最基础的数据结构
3.2 String核心命令：set、get、incr、decr等实操与应用场景
3.3 哈希（Hash）：键值对集合的高效存储结构
3.4 Hash核心命令：hset、hget、hkeys、hvals等实操
3.5 String与Hash的底层实现原理：简单动态字符串与字典
3.6 实战案例：用String实现计数器、用Hash存储用户信息

### 第4章 Redis核心数据结构进阶：列表、集合与有序集合

4.1 列表（List）：有序元素集合的实现与应用
4.2 List核心命令：lpush、rpush、lpop、rpop等与队列/栈实现
4.3 集合（Set）：无序唯一元素集合的特性与操作
4.4 Set核心命令：sadd、smembers、sinter、sunion等与交集/并集应用
4.5 有序集合（Sorted Set）：带分数排序的高级集合
4.6 Sorted Set核心命令：zadd、zrange、zscore等与排行榜实现

## 第二部分 核心特性：深入Redis内核

### 第5章 Redis高级数据结构：BitMap、HyperLogLog与Geospatial

5.1 位图（BitMap）：位级操作的高效存储方案
5.2 BitMap核心命令：setbit、getbit、bitcount等与用户签到实现
5.3 基数统计（HyperLogLog）：海量数据去重的轻量级方案
5.4 HyperLogLog核心命令：pfadd、pfcount等与UV统计应用
5.5 地理空间（Geospatial）：地理位置存储与距离计算
5.6 Geospatial核心命令：geoadd、geodist、georadius等与附近的人实现

### 第6章 Redis持久化机制：RDB与AOF

6.1 持久化的核心意义：防止数据丢失的关键保障
6.2 RDB持久化：基于快照的全量持久化实现原理
6.3 RDB的配置与触发方式：手动触发与自动触发策略
6.4 AOF持久化：基于日志的增量持久化实现原理
6.5 AOF的配置与重写机制：appendonly与bgrewriteaof
6.6 RDB与AOF的对比：优缺点与混合持久化方案选择

### 第7章 Redis内存管理与淘汰策略

7.1 Redis内存模型：内存占用的核心组成部分
7.2 内存限制配置：maxmemory参数与实际应用设置
7.3 核心内存淘汰策略：volatile-lru、allkeys-lru等原理
7.4 淘汰策略的选择依据：业务场景与数据特性匹配
7.5 内存碎片的产生与解决：碎片率监控与内存整理
7.6 实战优化：Redis内存占用的监控与调优技巧

### 第8章 Redis事务与锁机制

8.1 Redis事务的特性：ACID原则的部分实现
8.2 事务核心命令：multi、exec、discard与watch监听
8.3 Redis事务的局限性：不支持回滚与并发问题
8.4 分布式锁的核心需求：跨服务资源竞争控制
8.5 基于Redis的分布式锁实现：setnx命令与过期时间设置
8.6 分布式锁的优化：避免死锁与红锁方案

## 第三部分 实战应用：Redis在业务中的落地

### 第9章 Redis缓存设计与实战

9.1 缓存的核心价值：减轻数据库压力与提升响应速度
9.2 缓存设计原则：缓存穿透、击穿与雪崩的概念
9.3 缓存穿透解决方案：空值缓存与布隆过滤器
9.4 缓存击穿解决方案：互斥锁与热点数据永不过期
9.5 缓存雪崩解决方案：过期时间随机化与集群容错
9.6 实战案例：电商商品详情页缓存设计与实现

### 第10章 Redis分布式应用：会话共享与分布式计数器

10.1 分布式会话的核心需求：跨服务会话一致性
10.2 基于Redis的会话共享实现：Spring Session集成
10.3 分布式计数器的应用场景：秒杀库存、接口限流
10.4 分布式计数器实现：incr命令与原子性保障
10.5 限流场景实战：基于Redis的令牌桶算法实现
10.6 分布式ID生成：基于Redis的自增ID方案

### 第11章 Redis消息队列实现与应用

11.1 消息队列的核心概念：生产者、消费者与消息可靠性
11.2 基于List的消息队列实现：lpush与brpop组合
11.3 基于Pub/Sub的消息订阅与发布
11.4 Pub/Sub的局限性：无持久化与消息丢失问题
11.5 Redis Stream：Redis 5.0+的持久化消息队列
11.6 Stream核心操作：xadd、xread、xgroup等与消费组实现

### 第12章 Redis与主流框架集成实战

12.1 Redis与Java集成：Jedis、Lettuce客户端使用
12.2 Spring Boot集成Redis：配置与RedisTemplate使用
12.3 Redis与Python集成：redis-py客户端实操
12.4 Redis与Go集成：redigo客户端应用
12.5 分布式缓存框架集成：Spring Cloud Redis应用
12.6 实战案例：Spring Boot + Redis实现用户登录与权限缓存

## 第四部分 高级拓展：Redis集群与运维

### 第13章 Redis集群原理与搭建

13.1 集群的核心意义：高可用与高并发的保障
13.2 Redis集群的架构：主从复制与分片集群
13.3 主从复制原理：数据同步流程与延迟问题
13.4 Redis集群搭建：手动搭建与工具化部署实操
13.5 集群核心配置：cluster-enabled、cluster-node-timeout等参数
13.6 集群节点操作：添加、删除节点与数据迁移

### 第14章 Redis高可用架构：哨兵机制

14.1 哨兵的核心作用：主节点故障自动切换
14.2 哨兵机制原理：监控、通知与故障转移流程
14.3 哨兵配置：sentinel.conf关键参数详解
14.4 哨兵集群搭建：多哨兵部署与高可用保障
14.5 故障转移实战：主节点下线与从节点晋升流程
14.6 哨兵监控与告警：状态查看与异常通知配置

### 第15章 Redis运维与监控实战

15.1 Redis核心监控指标：内存、CPU、连接数与命中率
15.2 监控工具使用：redis-cli info命令与Prometheus + Grafana集成
15.3 日志管理：Redis日志配置与问题排查
15.4 日常运维操作：备份、恢复与版本升级
15.5 常见故障排查：连接超时、数据不一致与集群脑裂
15.6 运维自动化：Shell脚本实现监控与备份自动化

### 第16章 Redis高级优化与最佳实践

16.1 命令优化：慢查询分析与优化（slowlog配置与使用）
16.2 网络优化：TCP配置与连接池参数调优
16.3 数据结构优化：根据业务场景选择合适的Redis数据结构
16.4 高并发场景优化：批量操作与管道（Pipeline）使用
16.5 云环境下的Redis优化：云原生Redis配置与调优
16.6 企业级最佳实践：Redis在电商、金融场景的落地案例
