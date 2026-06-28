# 第9章 分布式爬虫架构方案

当你的爬虫从一台机器跑到十台机器，从每天抓几千条增长到每天抓几百万条，你会遇到一个所有爬虫工程师都会遇到的墙：单机架构撑不住了。队列积压、去重集合膨胀、数据库写入瓶颈、磁盘空间告急——这些问题不是优化代码能解决的，它们是架构层面的问题，需要架构层面的方案。

我是怕浪猫，一个在生产环境中跑过亿级数据爬虫的工程师。前面几章我们解决了反爬问题，让爬虫能稳定地把数据抓回来。但抓回来之后呢？数据往哪里存？多个节点怎么协调？下游业务怎么消费？这些问题如果不在架构阶段想清楚，等数据量真的涌进来的时候，系统会在多个地方同时崩溃。

这一章，怕浪猫带你从零设计一套完整的分布式爬虫架构方案。我们会聊主从架构和对等架构的选型、任务调度与负载均衡、容错与故障恢复，然后深入下游数据消费的清洗与推送，最后重点讲存储方案——从 MySQL 到 ClickHouse，从本地文件到 HDFS，覆盖结构化数据、文件存储和大数据存储三大场景。全文实战踩坑，代码管够，建议先收藏再看。

> 单机爬虫解决的是"能不能抓到"的问题，分布式爬虫解决的是"能不能持续抓到"的问题。前者是技术，后者是工程。

## 9.1 分布式爬虫架构

### 9.1.1 分布式爬虫的优势和必要性

先说清楚一个问题：什么时候需要上分布式？不是所有爬虫都需要分布式。如果你每天只抓几千条数据，单机 + SQLite 就够了，别过度设计。但当出现以下信号时，就该考虑分布式了：

| 信号 | 具体表现 | 阈值参考 |
|------|---------|---------|
| 抓取量瓶颈 | 单机抓取速度跟不上数据更新速度 | 日抓取量 > 10万页 |
| 反爬压力 | 单 IP 请求频率触发封禁 | 封禁率 > 30% |
| 存储瓶颈 | 单机磁盘/内存不足 | 数据量 > 100GB |
| 可用性要求 | 爬虫宕机后需要在短时间内恢复 | RTO < 1小时 |
| 业务规模 | 数据需要多维度消费 | 下游消费者 > 3个 |

分布式爬虫的核心优势在于三点：横向扩展能力、高可用性、资源利用率。横向扩展意味着你只需要加机器就能提升抓取能力，而不是重新设计系统。高可用性意味着一台节点挂了，其他节点可以接管它的工作。资源利用率意味着你可以用多台廉价机器替代一台昂贵的服务器，成本更低。

但分布式也带来了不可忽视的复杂性。状态管理需要跨节点协调，数据一致性在多副本场景下变得困难，网络分区可能导致脑裂问题，节点间的通信开销也会降低整体效率——这些都是单机架构不存在的挑战。怕浪猫的原则是：能单机就单机，单机扛不住再上分布式，不要为了分布式而分布式。过度工程化和工程不足一样危险，区别只在于前者浪费的是你的时间，后者浪费的是公司的预算。

在决定上分布式之前，先问自己三个问题：你的抓取量是否真的超过了单机的处理能力？你的可用性要求是否真的需要多节点热备？你的数据量是否真的存不下一台机器的磁盘？如果三个问题中至少有两个回答是肯定的，那就开始规划分布式方案。否则，先优化单机架构——很多时候，单机性能瓶颈不是架构问题，而是代码问题。

> 架构选择的第一原则：用最简单的方案解决当前的问题，同时为未来的扩展留好接口。好的架构不是一步到位设计出来的，而是在实际运行中逐步演进而来的。

### 9.1.2 主从架构 vs 对等架构

分布式爬虫的架构模式主要分两种：主从架构（Master-Worker）和对等架构（Peer-to-Peer）。两种架构各有优劣，选型时需要根据业务场景决定。

主从架构是最常见的分布式爬虫模式。Master 节点负责任务分发、调度和状态管理，Worker 节点只负责执行抓取。Scrapy-Redis 就是典型的主从架构——Redis 作为 Master 维护任务队列和去重集合，多个 Scrapy Worker 从 Redis 中获取任务。

主从架构的核心原理可以用下面的流程图表示：

```
┌─────────────────────────────────────────────────┐
│                  Master Node                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ 任务调度器  │  │ 去重服务   │  │ 状态监控   │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘   │
│        │              │              │          │
│  ┌─────┴─────────────┴──────────────┴─────┐   │
│  │            Redis (共享存储)               │   │
│  │  ┌─────────────┐  ┌──────────────────┐  │   │
│  │  │ 任务队列      │  │ 去重集合(Bloom)   │  │   │
│  │  │ [url1,url2..]│  │ {hash1,hash2..}  │  │   │
│  │  └─────────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────┘   │
└──────────┬──────────┬──────────┬───────────────┘
           │          │          │
     ┌─────┴────┐┌────┴────┐┌────┴────┐
     │ Worker 1 ││ Worker 2 ││ Worker N │
     │ 抓取+解析 ││ 抓取+解析 ││ 抓取+解析 │
     └─────┬────┘└────┬────┘└────┬────┘
           │          │          │
     ┌─────┴──────────┴──────────┴─────┐
     │          数据存储层               │
     └─────────────────────────────────┘
```

主从架构的优点是结构清晰、易于管理、去重简单（共享去重集合）。缺点是 Master 是单点，一旦 Master 挂了整个系统停摆。虽然 Redis 可以做集群和哨兵保证高可用，但增加了运维复杂度。

对等架构没有 Master 节点，所有节点地位平等，各自维护本地任务队列。节点之间通过 Gossip 协议交换状态信息，任务通过一致性哈希分配到不同节点。这种架构的去中心化设计消除了单点故障，但去重更复杂——需要分布式去重方案，如分布式 Bloom Filter 或一致性哈希分片。

对等架构的核心原理：

```
┌──────────┐    Gossip    ┌──────────┐
│  Node A  │◄────────────►│  Node B  │
│ 任务分片A │              │ 任务分片B │
│ 本地去重  │              │ 本地去重  │
└────┬─────┘              └────┬─────┘
     │  Gossip                  │  Gossip
     ▼                          ▼
┌──────────┐              ┌──────────┐
│  Node D  │◄──Gossip────►│  Node C  │
│ 任务分片D │              │ 任务分片C │
│ 本地去重  │              │ 本地去重  │
└──────────┘              └──────────┘

任务分配规则: hash(url) % N = node_id
```

怕浪猫在实际项目中的选择是：大部分场景用主从架构就够，对可用性要求极高且节点数量超过 50 时才考虑对等架构。原因很简单——主从架构的运维成本远低于对等架构，而 90% 的爬虫项目用主从架构就能满足需求。

> 架构选型的本质是在复杂性和可用性之间找平衡点。你多增加的一份复杂性，未来都要用运维成本来偿还。

### 9.1.3 任务调度与负载均衡

分布式爬虫的任务调度需要解决两个问题：任务怎么分发到 Worker，以及怎么保证各 Worker 的负载均衡。

最常见的调度策略是 FIFO 队列——所有 URL 放入一个 Redis List，Worker 用 LPOP 取任务。这种方式实现最简单，但有一个问题：不同网站的抓取耗时差异很大，快的几百毫秒，慢的几十秒。如果用 FIFO 队列，某些 Worker 可能被慢任务卡住，而其他 Worker 已经空闲了。

解决这个问题有三种策略：

**策略一：优先级队列**。按域名或任务类型设置优先级。种子页面用高优先级队列，详情页用低优先级队列。Redis 的 Sorted Set 天然支持优先级队列：

```python
import redis
import json
import time

class PriorityScheduler:
    def __init__(self, redis_url='redis://localhost:6379'):
        self.redis = redis.from_url(redis_url)

    def push(self, url, priority=0):
        """priority越小优先级越高"""
        task = json.dumps({'url': url, 'time': time.time()})
        self.redis.zadd('crawl:queue', {task: priority})

    def pop(self):
        result = self.redis.zpopmin('crawl:queue')
        if result:
            return json.loads(result[0][0])
        return None
```

**策略二：分域名并发控制**。同一个域名的 URL 分配给同一个 Worker，避免多个 Worker 同时请求同一域名。用一致性哈希做分配：

```python
import hashlib
from urllib.parse import urlparse

def assign_worker(url, worker_count=4):
    """一致性哈希分配URL到Worker"""
    domain = urlparse(url).netloc
    hash_val = int(hashlib.md5(domain.encode()).hexdigest(), 16)
    return hash_val % worker_count
```

**策略三：动态负载感知**。Master 监控每个 Worker 的队列长度和处理速度，动态调整任务分配。队列长的 Worker 少分配，队列短的 Worker 多分配：

```python
class LoadBalancer:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.worker_stats = {}

    def update_stats(self, worker_id, queue_len, speed):
        self.worker_stats[worker_id] = {
            'queue_len': queue_len,
            'speed': speed  # items/min
        }

    def select_worker(self):
        """选择负载最低的Worker"""
        if not self.worker_stats:
            return None
        return min(self.worker_stats,
                   key=lambda w: self.worker_stats[w]['queue_len'])
```

> 负载均衡不是一次性设计，而是一个持续调优的过程。先跑起来，用数据驱动调优。

### 9.1.4 容错与故障恢复

分布式系统中，节点故障是常态而非异常。一台 Worker 服务器宕机、网络抖动导致 Redis 连接超时、磁盘写满导致存储失败——这些在生产环境中每天都在发生。

容错设计的核心是确保任务不丢失。当一个 Worker 在执行任务时崩溃，这个任务必须能被其他 Worker 重新接管。最常用的方案是"租约机制"：Worker 从队列取任务时，不是直接删除，而是将任务移到一个"处理中"集合，并设置一个过期时间。如果 Worker 在过期时间内没有确认完成，任务自动回到待处理队列。

```python
import redis, json, time

class LeaseScheduler:
    def __init__(self, redis_url='redis://localhost:6379'):
        self.redis = redis.from_url(redis_url)
        self.lease_timeout = 300  # 5分钟租约

    def acquire(self, worker_id):
        """获取任务并设置租约"""
        task_data = self.redis.rpop('crawl:queue')
        if not task_data:
            return None
        task = json.loads(task_data)
        lease_key = f"lease:{task['url']}"
        self.redis.hset(lease_key, mapping={
            'worker': worker_id, 'task': task_data,
            'start_time': int(time.time())})
        self.redis.expire(lease_key, self.lease_timeout)
        return task

    def complete(self, url):
        self.redis.delete(f"lease:{url}")

    def recover_expired(self):
        """回收过期租约的任务"""
        for key in self.redis.scan_iter('lease:*'):
            task_data = self.redis.hget(key, 'task')
            if self.redis.ttl(key) < 0 and task_data:
                self.redis.lpush('crawl:queue', task_data)
                self.redis.delete(key)
```

除了任务级别的容错，系统级别还需要考虑 Redis 高可用（Sentinel 或 Cluster）、Worker 心跳监控、磁盘空间报警等基础设施层面的保障。怕浪猫的建议是：容错设计要从 Day 1 就考虑，不要等出了故障再补。

> 在分布式系统中，不是"如果"会出故障，而是"什么时候"出故障。你的系统对故障的准备程度，决定了它的可靠性上限。

## 9.2 下游数据消费

### 9.2.1 数据清洗与结构化

爬虫抓回来的数据是"脏"的——HTML 解析出来的字符串带空白字符，价格字段可能带货币符号，日期格式五花八门，有些字段还缺失。在写入存储之前，必须经过清洗和结构化。

数据清洗的核心原则是：在 Pipeline 层统一处理，而不是在 Spider 层分散处理。Spider 只负责抓取，Pipeline 负责清洗。这样当清洗规则需要调整时，只改一处代码。这个原则看起来简单，但怕浪猫见过太多项目在 Spider 里做清洗逻辑，结果六个 Spider 文件里都有类似的字符串处理代码，改一条规则要改六处。更糟糕的是，有些 Spider 里的清洗逻辑还不一致——同样的价格字段，一个 Spider 里去掉了货币符号，另一个没有。这种代码腐烂是技术债务的典型来源。

```python
import re
from datetime import datetime

class CleaningPipeline:
    def process_item(self, item, spider):
        for key in item:
            if isinstance(item[key], str):
                item[key] = item[key].strip()
        if item.get('price'):
            price_str = re.sub(r'[^\d.]', '', str(item['price']))
            item['price'] = float(price_str) if price_str else None
        if item.get('publish_date'):
            item['publish_date'] = self._parse_date(item['publish_date'])
        if not item.get('title') or not item.get('url'):
            raise DropItem("缺少必填字段")
        return item

    def _parse_date(self, date_str):
        for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%m/%d/%Y']:
            try:
                return datetime.strptime(date_str, fmt).date().isoformat()
            except ValueError:
                continue
        return None
```

数据结构化是指把清洗后的数据转换为统一的 Schema。爬虫项目通常会抓取多个网站的数据，每个网站的字段定义可能不同。结构化就是建立统一的字段映射，让不同来源的数据落到同一张表或同一个集合中。

| 原始字段（站点A） | 原始字段（站点B） | 统一字段 | 数据类型 | 清洗规则 |
|------------------|------------------|---------|---------|---------|
| goods_name | product_title | title | string | strip + 去特殊字符 |
| price_yuan | amount | price | float | 去符号转浮点 |
| pub_time | create_date | publish_date | date | 多格式解析 |
| img_url | cover_image | image_url | string | 补全协议头 |
| shop_id | seller_id | seller_id | string | 统一前缀 |

> 数据清洗是脏活累活，但不做这一步，后面所有的数据分析和业务消费都会出问题。垃圾进，垃圾出。

### 9.2.2 数据推送：API / 消息队列 / 数据库直写

数据清洗完成后，需要推送到下游系统。推送方式主要有三种：API 推送、消息队列推送、数据库直写。三种方式各有适用场景。

**API 推送**适用于下游是业务系统（如搜索服务、推荐系统）的场景。爬虫把数据 POST 到业务系统的 API，业务系统自行处理。这种方式的好处是解耦清晰，坏处是 API 调用是同步的，可能成为瓶颈。

```python
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

class APIPushPipeline:
    def __init__(self, api_url, api_key):
        self.api_url = api_url
        self.headers = {'Authorization': f'Bearer {api_key}'}
        self.session = requests.Session()

    @retry(stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=2, max=10))
    def push(self, data):
        resp = self.session.post(
            self.api_url, json=data,
            headers=self.headers, timeout=10
        )
        resp.raise_for_status()
        return resp.json()

    def process_item(self, item, spider):
        try:
            self.push(dict(item))
        except Exception as e:
            spider.logger.error(f"API推送失败: {e}")
            self._push_to_retry_queue(item)
        return item
```

**消息队列推送**适用于高吞吐量场景。爬虫把数据写入 Kafka 或 RabbitMQ，下游消费者按自己的节奏消费。这是怕浪猫在生产环境中最推荐的方式——爬虫和下游完全解耦，互不影响。Kafka 的持久化机制保证了数据不丢失，即使下游消费者暂时不可用，数据也会在 Kafka 中堆积，等消费者恢复后继续消费。

```python
from kafka import KafkaProducer
import json

class KafkaPipeline:
    def __init__(self, servers, topic):
        self.producer = KafkaProducer(
            bootstrap_servers=servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            acks='all',
            retries=3,
            linger_ms=100,
            batch_size=16384
        )
        self.topic = topic

    def process_item(self, item, spider):
        self.producer.send(self.topic, value=dict(item))
        return item

    def close_spider(self, spider):
        self.producer.flush()
        self.producer.close()
```

这里有几个关键参数需要解释。`acks='all'` 表示等所有副本确认后才算发送成功，最高可靠性。`linger_ms=100` 表示 Producer 攒 100 毫秒的数据再批量发送，吞吐量提升明显。`batch_size` 是单个批次的字节数，16KB 是一个合理的默认值。

**数据库直写**是最简单直接的方式，适用于数据量不大或下游消费不频繁的场景。Scrapy 的 Pipeline 直接把数据写入数据库。但要注意批量写入和连接池管理，否则会拖慢爬虫速度。

三种方式的对比：

| 维度 | API推送 | 消息队列 | 数据库直写 |
|------|--------|---------|-----------|
| 吞吐量 | 中（受API限制） | 高（异步批量） | 低（受DB限制） |
| 耦合度 | 中 | 低 | 高 |
| 可靠性 | 中（需重试机制） | 高（持久化+重试） | 高（事务保证） |
| 延迟 | 低 | 中 | 低 |
| 复杂度 | 低 | 高 | 低 |
| 适用场景 | 业务系统对接 | 高吞吐量分发 | 数据量小的项目 |

> 怕浪猫的实践经验：小项目用数据库直写，中项目用 API 推送，大项目一定上消息队列。不要在高吞吐量场景下用数据库直写，数据库连接数会成为你的噩梦。

### 9.2.3 数据格式标准化

当数据需要推送到多个下游系统时，统一的数据格式至关重要。怕浪猫推荐用 JSON Schema 做格式定义，所有 Pipeline 输出的数据必须通过 Schema 校验。

```python
from jsonschema import validate, ValidationError

PRODUCT_SCHEMA = {
    "type": "object",
    "properties": {
        "product_id": {"type": "string"},
        "title": {"type": "string", "minLength": 1},
        "price": {"type": ["number", "null"]},
        "url": {"type": "string", "format": "uri"},
        "publish_date": {"type": ["string", "null"]},
        "source": {"type": "string"},
        "crawled_at": {"type": "string", "format": "date-time"}
    },
    "required": ["product_id", "title", "url", "source", "crawled_at"]
}

class SchemaValidatorPipeline:
    def process_item(self, item, spider):
        try:
            validate(instance=dict(item), schema=PRODUCT_SCHEMA)
        except ValidationError as e:
            raise DropItem(f"数据格式校验失败: {e.message}")
        return item
```

标准化还意味着数据需要带上元信息：数据来源（source）、抓取时间（crawled_at）、数据版本（schema_version）。这些元信息在后续的数据治理和问题排查中非常重要。当你的数据管道出了问题，需要回溯"这条数据是从哪个站点、什么时候抓的"，这些元信息就是你的救命稻草。

> 数据格式标准化是数据治理的基础。今天多花一小时定义 Schema，未来少花一天排查数据问题。

## 9.3 存储方案

存储是分布式爬虫架构中最核心的环节之一。抓取能力再强，如果存储扛不住，整个系统还是跑不起来。存储方案的选择取决于数据量、数据类型和查询需求。

### 9.3.1 结构化数据存储：MySQL / PostgreSQL / MongoDB / Elasticsearch

结构化数据是爬虫最常见的数据类型——商品信息、文章内容、用户评论等。四种主流存储方案各有适用场景。

**MySQL** 是最经典的关系型数据库，适合数据量在千万级以内的结构化数据存储。优势是生态成熟、运维成本低、SQL 查询灵活。劣势是大规模写入性能有限，全文搜索能力弱。在爬虫项目中，MySQL 适合做中小规模的主存储。

```python
import pymysql

class MySQLPipeline:
    def __init__(self, host, port, db, user, password):
        self.config = {'host': host, 'port': port, 'db': db,
            'user': user, 'password': password,
            'charset': 'utf8mb4', 'autocommit': False}
        self.batch, self.batch_size = [], 100

    def _flush(self):
        if not self.batch:
            return
        sql = """INSERT INTO products (product_id, title, price, url, source)
                 VALUES (%(product_id)s, %(title)s, %(price)s, %(url)s, %(source)s)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), price=VALUES(price)"""
        conn = pymysql.connect(**self.config)
        try:
            with conn.cursor() as cur:
                cur.executemany(sql, self.batch)
            conn.commit()
        finally:
            conn.close()
        self.batch.clear()

    def process_item(self, item, spider):
        self.batch.append(dict(item))
        if len(self.batch) >= self.batch_size:
            self._flush()
        return item
```

这里有几个实战要点：第一，用批量写入（executemany）而非逐条写入，性能差距在 10 倍以上。第二，用 `ON DUPLICATE KEY UPDATE` 做幂等处理，避免重复数据。第三，批量大小建议在 100-500 之间，太大批次会占用过多内存，太小则频繁 IO。

**PostgreSQL** 在 MySQL 的基础上提供了更强的查询能力和扩展性。它的 JSONB 类型非常适合存储半结构化数据，你可以把爬虫抓取的原始 JSON 直接存到 JSONB 字段里，既保留了原始数据的完整性，又可以用 SQL 查询 JSON 内部的字段。比如商品数据中有一个 attributes 字段是动态的 JSON，MySQL 需要额外建关联表，PostgreSQL 直接用 JSONB 存储并支持 GIN 索引查询，效率高出几个数量级。而且 PostgreSQL 的全文搜索功能比 MySQL 强不少，支持中文分词（需要 zhparser 扩展），在中小规模搜索场景下可以替代 Elasticsearch，减少一个组件的运维成本。当你的数据量在亿级以内，且有复杂查询需求时，PostgreSQL 是更好的选择。

**MongoDB** 是文档型数据库，天然适合存储爬虫数据。爬虫抓取的数据本质上是非结构化的 JSON 文档，MongoDB 的 BSON 格式与之完美匹配。不用提前定义表结构，字段可以动态变化，这在多站点爬虫项目中非常实用。

MongoDB 在爬虫项目中的最大优势是 Schema-Free。不同站点的数据结构差异很大，比如电商平台的商品有 SKU 信息，新闻网站的文章有作者和标签，社交媒体的帖子有点赞和评论数。如果用 MySQL 存储这些不同结构的数据，你需要为每种数据类型建不同的表，或者用大量的 nullable 字段来兼容，表结构会变得非常混乱。用 MongoDB 则完全不需要提前定义表结构，每个文档可以有自己的字段集合，新增字段不影响已有数据。但 MongoDB 的事务支持不如 MySQL，虽然 4.0 以后版本支持多文档事务，但性能开销较大。如果你的数据需要强一致性（比如金融数据、订单数据），还是要选关系型数据库。爬虫数据通常对一致性要求不高，MongoDB 是大部分场景的最优解。

```python
from pymongo import MongoClient, ASCENDING

class MongoDBPipeline:
    def __init__(self, uri, db_name, collection):
        self.client = MongoClient(uri, maxPoolSize=50)
        self.collection = self.client[db_name][collection]
        self.collection.create_index(
            [('product_id', ASCENDING)], unique=True
        )

    def process_item(self, item, spider):
        doc = dict(item)
        doc['_id'] = item.get('product_id')
        self.collection.update_one(
            {'_id': doc['_id']},
            {'$set': doc},
            upsert=True
        )
        return item
```

MongoDB 在爬虫项目中的最大优势是 Schema-Free。不同站点的数据结构差异很大，用 MySQL 需要频繁改表结构，用 MongoDB 则完全不需要。但 MongoDB 的事务支持不如 MySQL，如果你的数据需要强一致性，还是要选关系型数据库。

**Elasticsearch** 是全文搜索引擎，不是通用数据库，但在爬虫项目中有不可替代的作用。当你需要对抓取的数据做全文搜索（比如搜索包含"无线充电"的所有商品）、聚合分析（比如按分类统计平均价格、按品牌统计商品数量）时，Elasticsearch 是首选。它的倒排索引机制使得全文搜索的复杂度接近 O(1)，远优于关系型数据库的 LIKE 查询。很多爬虫项目的架构是 MongoDB 做主存储 + Elasticsearch 做搜索索引。数据写入 MongoDB 后，通过 Mongo Connector 或 Logstash 同步到 Elasticsearch。这样 MongoDB 负责数据持久化和 CRUD 操作，Elasticsearch 负责搜索和聚合分析，各司其职。但 Elasticsearch 的运维成本不低——集群状态管理、分片 rebalance、内存调优都需要专门的经验。数据量不大的时候可以用单节点，超过千万级数据就要考虑集群部署了。

四种存储方案的核心对比：

| 维度 | MySQL | PostgreSQL | MongoDB | Elasticsearch |
|------|-------|-----------|---------|---------------|
| 数据模型 | 关系型 | 关系型+JSON | 文档型 | 搜索引擎 |
| 写入性能 | 中（万级/秒） | 中（万级/秒） | 高（十万级/秒） | 中（万级/秒） |
| 查询能力 | SQL | SQL+全文搜索 | JSON查询 | 全文搜索+聚合 |
| Schema | 强制 | 强制+灵活 | 自由 | 映射 |
| 事务 | 强 | 强 | 弱（4.0+支持） | 无 |
| 运维成本 | 低 | 低 | 中 | 高 |
| 适用数据量 | 千万级 | 亿级 | 亿级 | 亿级 |
| 扩展性 | 中（分库分表） | 中 | 好（分片） | 好（集群） |

> 存储选型没有银弹。怕浪猫的经验是：先用 MySQL 跑起来，数据量过千万就加 MongoDB，需要搜索就加 Elasticsearch。不要一上来就全套上，过度架构比架构不足更危险。

### 9.3.2 文件存储：本地文件系统 + NFS / 对象存储 MinIO / OSS / S3 / HDFS

爬虫不只是抓文本数据，还要抓图片、视频、PDF 等二进制文件。文件存储和结构化数据存储是完全不同的领域，选型逻辑也不一样。

**本地文件系统 + NFS** 是最简单的方案。爬虫把文件写到本地磁盘，多台机器通过 NFS 共享。这种方案适合文件量小（< 100万）且机器数量少的场景。NFS 的致命问题是性能——当并发写入量大时，NFS 的延迟会急剧上升，成为整个系统的瓶颈。

**对象存储** 是现代爬虫项目的首选文件存储方案。MinIO 是开源的对象存储（兼容 S3 协议），可以自建。阿里云 OSS 和 AWS S3 是云服务，开箱即用。对象存储的核心优势是：无限容量、高可用、按需付费、HTTP 直接访问。

```python
from minio import Minio
from io import BytesIO

class MinIOPipeline:
    def __init__(self, endpoint, access_key, secret_key, bucket):
        self.client = Minio(endpoint, access_key=access_key,
                           secret_key=secret_key, secure=False)
        self.bucket = bucket
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

    def save_file(self, file_data, object_name, content_type):
        stream = BytesIO(file_data)
        self.client.put_object(self.bucket, object_name,
            stream, len(file_data), content_type=content_type)
        return f"http://{self.endpoint}/{self.bucket}/{object_name}"

    def process_item(self, item, spider):
        if item.get('image_data'):
            ext = item['image_url'].split('.')[-1][:4]
            obj_name = f"images/{item['product_id']}.{ext}"
            item['image_storage_url'] = self.save_file(
                item['image_data'], obj_name, content_type=f"image/{ext}")
        return item
```

对象存储的使用有几个实践要点：第一，对象命名要有层次结构（如 images/2024/01/xxx.jpg），避免扁平化导致索引性能下降。第二，上传大文件时用分片上传，避免单次请求超时。第三，定期清理过期文件，对象存储虽然按量计费，但积少成多也是成本。

**HDFS** 是大数据生态的分布式文件系统，适合超大规模文件存储（PB 级）。如果你的爬虫项目是大数据分析链路的一部分（比如抓取数据后用 Spark 做批处理），HDFS 是合适的选择。但 HDFS 的运维复杂度高，小文件性能差，对于普通爬虫项目属于过度设计。

文件存储方案对比：

| 维度 | 本地+NFS | MinIO | OSS/S3 | HDFS |
|------|---------|-------|--------|------|
| 容量 | 受限于磁盘 | 无限（加节点） | 无限 | 无限 |
| 性能 | 低（NFS瓶颈） | 高 | 高 | 中（小文件差） |
| 可用性 | 低 | 高 | 极高 | 高 |
| 成本 | 低（自建） | 低（自建） | 中（按量付费） | 高（运维成本） |
| 复杂度 | 低 | 中 | 低 | 高 |
| 适用文件量 | < 100万 | 100万-1亿 | 无限 | > 1亿 |

> 怕浪猫的建议：文件量 100 万以内用本地存储，100 万到 1 亿用 MinIO 自建，超过 1 亿且有预算就用 OSS/S3。HDFS 留给大数据团队，爬虫工程师别碰。

### 9.3.3 大数据存储：HBase 列式存储 / Hive 数据仓库 / ClickHouse OLAP / Spark

当爬虫数据量突破亿级，传统数据库就开始吃力了。这时候需要大数据存储方案。大数据存储不是简单地把数据存进去，而是要支持高效的批量读写和复杂分析查询。

**HBase** 是基于 Hadoop 的列式存储，适合海量数据的随机读写。它的数据模型是 Key-Value，按 RowKey 组织，天然适合爬虫去重场景——用 URL 的 MD5 作为 RowKey，每次抓取前先查 HBase 是否存在。HBase 的写入性能极强，单表可达百万级 QPS，但查询灵活性差，只支持 RowKey 查询和范围扫描，不支持像 SQL 那样的条件查询。在爬虫项目中，HBase 通常不作为主存储，而是作为辅助的分布式索引——存 URL 指纹用于去重，存已抓取状态用于断点续抓。相比 Redis 的去重方案，HBase 的优势是容量几乎无限，不怕去重集合膨胀。

**Hive** 是数据仓库工具，把结构化数据文件映射成表，用 SQL 查询。Hive 的查询延迟高（分钟级），但适合批量分析——比如"统计过去一周各分类商品的平均价格"、"对比不同站点的数据覆盖率"、"找出价格异常波动的商品列表"。爬虫数据写入 HDFS 后，用 Hive 做周期性的 ETL 分析是经典组合。Hive 的优势是 SQL 接口降低了分析门槛，不需要写 MapReduce 或 Spark 代码就能做复杂的数据处理。但 Hive 不适合实时查询，如果你需要秒级响应，应该选 ClickHouse。

**ClickHouse** 是 OLAP 数据库，查询性能极强（秒级响应亿级数据），特别适合爬虫数据的实时分析场景。当你的爬虫监控大屏需要展示"最近 10 分钟各节点抓取量分布"这类指标时，ClickHouse 是最佳选择。

```python
from clickhouse_driver import Client

class ClickHousePipeline:
    def __init__(self, host, db, table):
        self.client = Client(host)
        self.db = db
        self.table = table
        self.batch = []
        self.batch_size = 5000

    def process_item(self, item, spider):
        self.batch.append((
            item.get('product_id'),
            item.get('title'),
            item.get('price'),
            item.get('source'),
            item.get('crawled_at')
        ))
        if len(self.batch) >= self.batch_size:
            self._flush()
        return item

    def _flush(self):
        if not self.batch:
            return
        sql = f"""INSERT INTO {self.db}.{self.table}
                  (product_id, title, price, source, crawled_at)
                  VALUES"""
        self.client.execute(sql, self.batch)
        self.batch.clear()
```

ClickHouse 的批量写入性能极强，但有几个注意点：第一，批量大小要大（推荐 5000-10000），ClickHouse 不适合高频小批量写入。第二，表引擎选 MergeTree 系列，支持索引和分区。第三，避免高并发写入，ClickHouse 是列存，并发写入会触发大量 merge 操作。

**Spark** 不是存储，是计算引擎，但和大数据存储紧密配合。爬虫数据写入 HDFS 或 HBase 后，用 Spark 做批处理是大数据项目的标准链路。比如"每天凌晨统计各站点抓取量、去重率、失败率"，用 Spark 批处理是最合适的。

大数据存储方案对比：

| 维度 | HBase | Hive | ClickHouse | Spark |
|------|-------|------|-----------|-------|
| 数据模型 | KV列存 | 表（HDFS文件） | 列存表 | 计算 |
| 写入性能 | 极强 | 弱（批量导入） | 强（大批量） | - |
| 查询性能 | 快（RowKey） | 慢（分钟级） | 极快（秒级） | 中 |
| 场景 | 随机读写 | 批量ETL | 实时分析 | 批处理 |
| 运维成本 | 高 | 中 | 中 | 高 |

> 怕浪猫的实战经验：数据量亿级以下别碰大数据存储，MySQL+MongoDB 够了。真到了亿级，ClickHouse 做实时分析，Hive 做离线批处理，HBase 做去重索引，Spark 做计算，这套组合拳能打很久。

### 9.3.4 存储选型对比表

最后，怕浪猫把所有存储方案整理成一张选型决策表，帮助你做架构决策。

| 数据类型 | 数据量级 | 查询需求 | 推荐方案 | 备选方案 |
|---------|---------|---------|---------|---------|
| 结构化数据 | < 千万 | 简单查询 | MySQL | PostgreSQL |
| 结构化数据 | 千万-亿 | 复杂查询 | PostgreSQL | MongoDB |
| 结构化数据 | > 亿 | 全文搜索 | Elasticsearch | ClickHouse |
| 结构化数据 | > 亿 | 实时分析 | ClickHouse | Elasticsearch |
| 文件数据 | < 100万 | - | 本地存储 | NFS |
| 文件数据 | 100万-1亿 | HTTP访问 | MinIO | OSS/S3 |
| 文件数据 | > 1亿 | 批处理 | HDFS | OSS/S3 |
| 去重索引 | > 亿 | 随机查询 | HBase | Redis+Bloom |
| 监控指标 | 任意 | 实时聚合 | ClickHouse | Prometheus |

> 存储选型的核心原则：够用就好，过度设计是最大的浪费。

## 9.4 实战项目：分布式爬虫数据存储与消费方案

讲了这么多理论和代码片段，现在怕浪猫带你把所有模块串起来，设计一个完整的分布式爬虫数据存储与消费方案。这个实战项目会覆盖从架构设计到代码实现的全流程。

### 9.4.1 设计分布式爬虫整体架构

我们的目标场景：抓取多个电商平台的商品数据，日新增数据量约 500 万条，需要支持全文搜索和实时分析，同时把商品图片上传到对象存储，最后把数据推送到下游推荐系统。

基于这个需求，整体架构设计如下：

```
┌─────────────────────────────────────────────────────┐
│                    调度层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Scheduler │  │  Redis   │  │  Bloom   │          │
│  │  任务调度  │  │  任务队列 │  │  去重     │          │
│  └─────┬────┘  └────┬─────┘  └────┬─────┘          │
└────────┼────────────┼─────────────┼────────────────┘
         │            │             │
┌────────┴────────────┴─────────────┴────────────────┐
│                    抓取层                           │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐           │
│  │W1    │  │W2    │  │W3    │  │W4    │           │
│  │Scrapy│  │Scrapy│  │Scrapy│  │Scrapy│           │
│  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘           │
└─────┼─────────┼─────────┼─────────┼────────────────┘
      │         │         │         │
┌─────┴─────────┴─────────┴─────────┴────────────────┐
│                   处理层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Cleaning │  │ Schema   │  │ Dedup    │          │
│  │ Pipeline │  │ Validate │  │ Pipeline │          │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘          │
└────────┼────────────┼─────────────┼────────────────┘
         │            │             │
┌────────┴────────────┴─────────────┴────────────────┐
│                   存储层                            │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │MongoDB │  │  ES    │  │ MinIO  │  │ClickHse│   │
│  │主存储   │  │搜索索引│  │图片存储 │  │实时分析│   │
│  └────────┘  └────────┘  └────────┘  └────────┘   │
└────────┬───────────────────────────────────────────┘
         │
┌────────┴──────────────────────────────────────────┐
│                   消费层                           │
│  ┌──────────┐  ┌──────────┐                       │
│  │  Kafka   │  │  API     │                       │
│  │消息队列   │  │推送推荐系统│                      │
│  └──────────┘  └──────────┘                       │
└───────────────────────────────────────────────────┘
```

这个架构分五层：调度层负责任务分发和去重，抓取层负责数据采集，处理层负责清洗校验，存储层负责多目的地写入，消费层负责推送下游。每一层都可以独立扩展，互不影响。

### 9.4.2 实现结构化数据入 MySQL / MongoDB

先看存储层的核心 Pipeline。我们把数据同时写入 MongoDB（主存储）和 MySQL（业务查询），双写通过异步方式实现，避免互相阻塞。

```python
import pymongo, pymysql
from scrapy.exceptions import DropItem

class DualWritePipeline:
    def __init__(self, mongo_uri, mongo_db, mysql_config, batch_size=100):
        self.mongo_col = pymongo.MongoClient(mongo_uri)[mongo_db]['products']
        self.mongo_col.create_index('product_id', unique=True)
        self.mysql_config, self.batch, self.batch_size = mysql_config, [], batch_size

    def process_item(self, item, spider):
        self.mongo_col.update_one(
            {'product_id': item['product_id']}, {'$set': dict(item)}, upsert=True)
        self.batch.append(dict(item))
        if len(self.batch) >= self.batch_size:
            self._flush_mysql()
        return item

    def _flush_mysql(self):
        sql = """INSERT INTO products (product_id, title, price, url, source, crawled_at)
                 VALUES (%(product_id)s, %(title)s, %(price)s, %(url)s, %(source)s, %(crawled_at)s)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), price=VALUES(price)"""
        conn = pymysql.connect(**self.mysql_config)
        try:
            with conn.cursor() as cur:
                cur.executemany(sql, self.batch)
            conn.commit()
        finally:
            conn.close()
        self.batch.clear()
```

双写的一致性问题是实战中的重点。MongoDB 和 MySQL 之间没有分布式事务，可能出现一个写成功、另一个写失败的情况。比如 MongoDB 写成功后 MySQL 写入失败，数据就会出现不一致——MongoDB 中有这条数据但 MySQL 中没有。怕浪猫的解决方案是：以 MongoDB 为主存储，MySQL 为辅助查询，定期用 MongoDB 的数据校验和修复 MySQL。具体做法是每天凌晨跑一个对账脚本，从 MongoDB 读取前一天的数据，和 MySQL 中的记录做比对，缺失的补写、不一致的覆盖。如果对一致性要求更高，可以引入 binlog 同步——MongoDB 写入后产生 binlog 事件，消费事件写入 MySQL。但这会增加系统复杂性，需要额外的 Kafka 和消费服务。对于大多数爬虫场景，异步双写 + 定期对账已经足够了。

### 9.4.3 实现文件上传到对象存储

商品图片的上传是独立的一条数据流。我们在 Pipeline 中把图片数据上传到 MinIO，然后把返回的 URL 存到 MongoDB 中。

```python
from minio import Minio
from io import BytesIO
import hashlib

class ImageStoragePipeline:
    def __init__(self, endpoint, access_key, secret_key, bucket='crawler-images'):
        self.client = Minio(endpoint, access_key=access_key,
                           secret_key=secret_key, secure=False)
        self.bucket = bucket
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

    def process_item(self, item, spider):
        if not item.get('images'):
            return item
        stored_urls = []
        for img in item['images']:
            md5 = hashlib.md5(img['data']).hexdigest()
            obj_name = f"products/{md5[:2]}/{md5}.jpg"
            self.client.put_object(self.bucket, obj_name,
                BytesIO(img['data']), len(img['data']),
                content_type='image/jpeg')
            stored_urls.append(f"{self.bucket}/{obj_name}")
        item['image_storage_urls'] = stored_urls
        return item
```

用内容 MD5 做文件名有个好处：相同图片不会重复上传，天然去重。怕浪猫在项目中用这个方案节省了 30% 的存储空间。但要注意 MD5 计算需要把文件读入内存，大文件场景需要用流式计算。

### 9.4.4 实现数据推送至下游业务（API + 消息队列）

下游推送同时走两条线：Kafka 给推荐系统消费，API 给搜索服务同步数据。两条线互相独立，一条失败不影响另一条。

```python
from kafka import KafkaProducer
import json, requests

class DownstreamPushPipeline:
    def __init__(self, kafka_servers, kafka_topic, search_api_url, api_key):
        self.producer = KafkaProducer(
            bootstrap_servers=kafka_servers,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode('utf-8'),
            acks='all', linger_ms=50)
        self.kafka_topic = kafka_topic
        self.session = requests.Session()
        self.api_headers = {'Authorization': f'Bearer {api_key}'}
        self.api_url = search_api_url

    def process_item(self, item, spider):
        data = dict(item)
        self.producer.send(self.kafka_topic, value=data)  # Kafka异步
        try:
            self.session.post(self.api_url, json=data,
                headers=self.api_headers, timeout=5)  # API同步
        except Exception as e:
            spider.logger.warning(f"搜索API推送失败: {e}")
        return item

    def close_spider(self, spider):
        self.producer.flush()
        self.producer.close()
        self.session.close()
```

这里有一个实战踩坑点：Kafka Producer 的 `send` 方法是异步的，数据先进入本地缓冲区，如果 Spider 结束时没有调用 `flush`，缓冲区中的数据会丢失。所以在 `close_spider` 中必须先 flush 再 close。

### 9.4.5 大数据场景下 HBase / Hive 存储方案

当数据量突破亿级，MongoDB + MySQL 的组合开始吃力。这时候需要引入大数据存储。我们的方案是：用 HBase 做去重索引，用 Hive 做离线分析，用 ClickHouse 做实时监控。

HBase 去重的核心思路是：用 URL 的 MD5 作为 RowKey，每次抓取前先查 HBase。HBase 的随机读取性能远优于 MySQL，单次查询在毫秒级。

```python
import happybase, hashlib, time

class HBaseDedupPipeline:
    def __init__(self, hbase_host, table='crawler_dedup'):
        self.connection = happybase.Connection(hbase_host)
        if table.encode() not in self.connection.tables():
            self.connection.create_table(table, {'cf': {'max_versions': 1}})
        self.table = self.connection.table(table)

    def is_duplicate(self, url):
        rowkey = hashlib.md5(url.encode()).hexdigest()
        try:
            next(self.table.scan(row_start=rowkey, row_stop=rowkey, limit=1))
            return True
        except StopIteration:
            return False

    def process_item(self, item, spider):
        if self.is_duplicate(item['url']):
            raise DropItem(f"URL已抓取: {item['url']}")
        rowkey = hashlib.md5(item['url'].encode()).hexdigest()
        self.table.put(rowkey, {
            b'cf:url': item['url'].encode(),
            b'cf:source': item.get('source', '').encode(),
            b'cf:ts': str(int(time.time())).encode()})
        return item
```

Hive 的离线分析则是另一条链路。爬虫数据每天导出为 Parquet 格式存到 HDFS，然后创建 Hive 外表做 SQL 分析。这种方式适合周期性的批量统计，比如"每周各站点抓取成功率统计"。

ClickHouse 实时监控是最后一个环节。爬虫每抓取一条数据，同时写入 ClickHouse 一条监控记录，包含时间戳、节点ID、URL、状态码、耗时等字段。监控大屏直接查 ClickHouse，秒级响应。

> 大数据存储不是一上来就全上的，而是随着数据量增长逐步引入。怕浪猫的节奏是：亿级以下用传统方案，亿级以上先加 ClickHouse 做监控，再加 HBase 做去重，最后才上 Hive 做离线分析。

## 实战踩坑总结

这一章的实战过程中，怕浪猫踩了不少坑，把最有价值的经验分享出来。

**坑一：MongoDB 批量写入的 writeConcern 设置**。默认的 writeConcern 是 1，即只要主节点确认就返回。这在主节点故障切换时可能丢数据。生产环境建议设为 majority，但会降低写入性能。权衡之后，怕浪猫的选择是：重要数据用 majority，监控数据用 1。

**坑二：MinIO 大文件上传超时**。默认 put_object 的超时是 30 秒，上传 5MB 以上的图片经常超时。解决方案是用分片上传，把大文件切成 5MB 一片，并发上传。

```python
# 大文件用分片上传
from minio.common import MAX_PART_SIZE

def upload_large_file(self, file_data, object_name):
    """分片上传大文件"""
    size = len(file_data)
    if size > MAX_PART_SIZE:
        upload_id = self.client._create_multipart_upload(
            self.bucket, object_name
        )
        parts = []
        offset = 0
        part_num = 1
        while offset < size:
            chunk = file_data[offset:offset+MAX_PART_SIZE]
            etag = self.client._upload_part(
                self.bucket, object_name,
                upload_id, part_num, chunk
            )
            parts.append((part_num, etag))
            offset += MAX_PART_SIZE
            part_num += 1
        self.client._complete_multipart_upload(
            self.bucket, object_name, upload_id, parts
        )
```

**坑三：ClickHouse 写入频率过高导致 merge 失败**。ClickHouse 是列存，每次写入都会产生一个 data part，后台 merge 线程合并。如果写入频率太高（每秒多次），data part 数量暴增，merge 跟不上，会报 "Too many parts" 错误。解决方案：攒大批量写入（至少 1000 行一批），并且控制写入频率（不超过每秒 1 次）。

**坑四：Kafka 消息积压导致爬虫阻塞**。下游消费者处理速度跟不上爬虫生产速度时，Kafka 中消息会积压。如果不做背压控制，爬虫内存会被未发送的消息撑爆。解决方案是监控 Kafka 的 lag，当 lag 超过阈值时降低爬虫并发数。

**坑五：Redis 去重集合内存爆炸**。用 Redis Set 存 URL 指纹，1 亿条 URL 大约占用 3GB 内存。长期运行后内存不够用。切换到 Bloom Filter 后，1 亿条 URL 只占 200MB 左右，但代价是约 1% 的误判率。对于大部分爬虫场景，这个误判率完全可以接受。

> 每一个坑都是真金白银的教训。踩坑不可怕，可怕的是不知道坑在哪里。

## 本章核心知识图谱

最后，怕浪猫把这一章的核心知识点整理成一张知识图谱：

```
分布式爬虫架构方案
├── 分布式架构
│   ├── 主从架构（Master-Worker + Redis）
│   ├── 对等架构（Gossip + 一致性哈希）
│   ├── 任务调度（优先级队列/分域名/负载感知）
│   └── 容错恢复（租约机制/心跳监控/Redis高可用）
├── 下游数据消费
│   ├── 数据清洗（Pipeline统一处理）
│   ├── 数据推送（API/Kafka/数据库直写）
│   └── 格式标准化（JSON Schema校验）
├── 存储方案
│   ├── 结构化存储
│   │   ├── MySQL（千万级，关系型）
│   │   ├── PostgreSQL（亿级，JSONB）
│   │   ├── MongoDB（亿级，文档型）
│   │   └── Elasticsearch（全文搜索）
│   ├── 文件存储
│   │   ├── 本地+NFS（小规模）
│   │   ├── MinIO/OSS/S3（中大规模）
│   │   └── HDFS（大数据生态）
│   └── 大数据存储
│       ├── HBase（随机读写去重）
│       ├── Hive（离线ETL分析）
│       ├── ClickHouse（实时OLAP）
│       └── Spark（批量计算）
└── 实战踩坑
    ├── MongoDB writeConcern 选型
    ├── MinIO 大文件分片上传
    ├── ClickHouse 写入频率控制
    ├── Kafka 消息积压背压
    └── Redis 去重集合内存优化
```

## 系列进度 9/11

到这里，第9章的内容就讲完了。我们从分布式架构的设计选型开始，深入任务调度、容错恢复、数据清洗与推送，然后系统性地讲了从 MySQL 到 ClickHouse、从本地文件到 HDFS 的存储方案选型，最后用一个完整实战项目把所有模块串联起来。

下章预告：第10章是课程终极测验，30道题覆盖所有核心模块，帮你查漏补缺。从 Python 基础到爬虫框架、从反爬对抗到分布式架构、从数据存储到下游消费，每一道题都对应一个实战场景。做完这 30 道题，你就知道自己哪里扎实、哪里需要补。

怕浪猫说：分布式爬虫的本质不是把单机代码复制到多台机器上，而是重新思考系统的每一个环节——任务怎么分配、状态怎么同步、数据怎么流转、故障怎么恢复。这些问题的答案不是某个开源框架给你的，而是你在理解原理的基础上，根据业务场景做出的架构决策。存储选型尤其如此，没有最好的存储，只有最适合你当前数据量和查询模式的存储。当数据量从万到亿，你的存储方案也要跟着进化。记住，架构是长出来的，不是设计出来的——先跑起来，在运行中迭代。

好了，这章就到这里。如果你觉得内容有用，收藏一下，下次架构设计的时候翻出来照着选。有什么问题评论区见，怕浪猫会一一回复。我们下章见。
