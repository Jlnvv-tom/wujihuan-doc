# 第11章 分布式基础与缓存系统

线上缓存雪崩的那一刻，你盯着监控大屏上直线飙升的错误率，手心冒汗，脑子里只有一个念头：要是当初把过期时间加个随机值就好了。

我是怕浪猫，今天这章是Python实战训练营的第11周，也是整个系列从单机走向分布式的关键转折点。前面十章我们都在跟单机较劲，从这一章开始，你要面对的是多节点、网络分区、时钟漂移这些让人头疼的问题。怕浪猫踩过这些坑，所以这章会把每个坑的边界、触发条件和解决方案都讲透。

## 一、分布式系统基础：那些你必须吞下去的苦药

### 1.1 CAP定理：三选二的真相

CAP定理说分布式系统最多同时满足三个特性中的两个：一致性（Consistency）、可用性（Availability）、分区容错性（Partition Tolerance）。但现实是，网络分区是不可避免的，所以你实际上只能在C和A之间做选择。

> CAP不是三选二的菜单，而是"分区发生时你选谁"的生死抉择。

怕浪猫第一次接触CAP的时候，以为这是个理论课，考试背背就行。直到有一次线上主从同步延迟导致读写不一致，用户看到订单状态在"已支付"和"待支付"之间反复横跳，才真切感受到C的缺失有多致命。

来看CP和AP的实际取舍：

| 维度 | CP系统（选一致性） | AP系统（选可用性） |
|------|-------------------|-------------------|
| 分区时行为 | 拒绝写入，直到数据一致 | 继续提供服务，数据最终一致 |
| 典型场景 | 金融转账、库存扣减 | 社交Feed、内容推荐 |
| 常见组件 | ZooKeeper、Etcd、HBase | Cassandra、Eureka、DynamoDB |
| 用户体验 | 超时错误，但数据准确 | 请求成功，但可能读到旧数据 |
| Python生态 | kazoo（ZK客户端）、etcd3 | cassandra-driver、redis-py（集群模式） |

实际项目中，大部分业务场景适合AP。怕浪猫经手过的电商系统，商品详情、搜索推荐走AP，下单支付走CP。关键是你要清楚每个接口的语义，不能一刀切。

### 1.2 BASE理论：CAP的工程解法

CAP告诉你鱼和熊掌不可兼得，BASE告诉你怎么在中间找到平衡点：

- **基本可用（Basically Available）**：系统在故障时允许损失部分可用性，比如响应时间变长、降级返回缓存数据
- **软状态（Soft State）**：允许系统中的数据存在中间状态，不要求每一刻都一致
- **最终一致性（Eventually Consistent）**：系统保证在没有新的更新操作的前提下，数据最终会达到一致状态

> 最终一致性不是"不管了"，而是"我知道它什么时候能一致，并且这个时间可接受"。

怕浪猫在做一个跨机房数据同步的项目时，用的就是BASE思路。写操作走主机房，通过消息队列异步同步到从机房，从机房读到的数据有200ms左右的延迟。这个延迟对业务可接受，但如果有人拿从机房的数据做风控决策，就会出问题。所以你在用BASE之前，必须定义清楚"最终"是多久。

### 1.3 一致性模型：不是所有"一致"都一样

一致性模型有好几个层级，怕浪猫挑实战中最常见的三个来讲：

**强一致性**：写操作完成后，任何后续读都能读到最新值。数据库的主库读写、Redis单实例读写都是强一致的。代价是性能——每次写都要等所有副本确认。

**最终一致性**：写操作完成后，不保证立即读到最新值，但保证最终会读到。DNS是最经典的例子，你改了域名解析，全球DNS服务器同步需要时间。

**读己之写一致性（Read Your Writes）**：用户自己写的操作，自己一定能立刻读到。这是用户体验的底线——你刚发了条朋友圈，刷新却看不到，这体验谁能忍？

来看一个读己之写一致性的Python实现思路：

```python
import time
import threading

class ReadYourWritesCache:
    def __init__(self, redis_client, ttl=300):
        self.redis = redis_client
        self.local_version = threading.local()
        self.ttl = ttl

    def write(self, key, value):
        version = int(time.time() * 1000)
        self.local_version.__dict__[key] = version
        self.redis.hset(f"kv:{key}", mapping={
            "value": value, "version": version
        })

    def read(self, key):
        local_ver = self.local_version.__dict__.get(key, 0)
        data = self.redis.hgetall(f"kv:{key}")
        if not data:
            return None
        redis_ver = int(data[b"version"])
        if redis_ver < local_ver:
            # Redis还没同步完，用本地缓存的值
            return self._get_local_fallback(key)
        return data[b"value"].decode()

    def _get_local_fallback(self, key):
        # 本地内存中保存最近写入的值
        return getattr(self.local_version, f"val_{key}", None)
```

**因果一致性**：如果操作A因果上先于操作B，那么所有节点必须先看到A再看到B。比如先发评论再删帖子，别人不应该看到评论却看不到帖子。这个在分布式数据库中靠向量时钟实现，日常业务中很少需要手动处理。

### 1.4 分布式的暗坑：脑裂、网络分区、时钟漂移

**脑裂（Split-Brain）**：两个节点同时认为自己是Leader。Redis Sentinel早期版本就有这个问题——网络分区时，原Leader还在运行，新Leader又被选出来了，两个节点同时接受写入，合并时数据冲突。

怕浪猫踩过的坑：用Redis做分布式锁，Sentinel自动故障转移时，原主节点还没完全下线，新主节点已经选出来了。客户端A在旧主上加了锁，客户端B在新主上也加了同一把锁，锁互斥失效。后来改用RedLock算法才解决。

**网络分区**：网络把集群分成多个互不可达的子网。这时候如果你没有正确处理分区，每个子网都可能选出自己的Leader，导致数据不一致。

> 网络分区不是小概率事件，而是必然会发生的——你要做的是"分区时怎么办"，不是"如何防止分区"。

**时钟漂移（Clock Skew）**：不同机器的时钟不完全同步。如果你的锁超时依赖本地时钟，时钟回拨会导致锁提前释放。NTP同步有毫秒级误差，某些情况下会跳几秒。

```python
import time
import threading

class ClockSkewSafeTimer:
    """防止时钟回拨导致的超时判断错误"""
    def __init__(self, timeout_ms):
        self.timeout_ms = timeout_ms
        self._monotonic_start = time.monotonic()
        self._lock = threading.Lock()

    def is_expired(self):
        # 用monotonic时钟，不受系统时间调整影响
        elapsed_ms = (time.monotonic() - self._monotonic_start) * 1000
        return elapsed_ms >= self.timeout_ms

    def remaining_ms(self):
        elapsed_ms = (time.monotonic() - self._monotonic_start) * 1000
        return max(0, self.timeout_ms - elapsed_ms)
```

这里的核心要点是：涉及超时判断，永远用`time.monotonic()`而不是`time.time()`。`monotonic`时钟保证单调递增，不受NTP调整和手动改时间的影响。怕浪猫有一次排查线上锁提前释放的bug，查了两小时，最后发现是NTP回拨了300ms，而锁的超时正好设了300ms。

## 二、分布式锁实现：从单点到多节点的进化

### 2.1 基于Redis的分布式锁

Redis分布式锁是最常用的方案，核心是`SET key value NX PX`这条命令。NX保证只有key不存在时才能设置成功，PX设置过期时间防止死锁。

```python
import redis
import uuid
import time

class RedisDistributedLock:
    def __init__(self, redis_client, lock_key, timeout=10):
        self.redis = redis_client
        self.lock_key = lock_key
        self.timeout = timeout
        self.lock_value = str(uuid.uuid4())

    def acquire(self):
        # SET key value NX PX timeout 原子操作
        return self.redis.set(
            self.lock_key, self.lock_value,
            nx=True, px=self.timeout * 1000
        )

    def release(self):
        # Lua脚本保证"检查+删除"原子性
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        return self.redis.eval(script, 1, self.lock_key, self.lock_value)
```

为什么要用Lua脚本释放锁？因为`get`和`del`是两步操作，中间可能穿插其他客户端的操作。假设客户端A获取锁，超时后锁自动释放，客户端B获取了锁，这时客户端A执行`del`，就把B的锁给删了。Lua脚本在Redis中是原子执行的，不会被打断。

**Watchdog锁续约机制**：如果你设了10秒超时，但业务逻辑要跑15秒，锁会在第10秒自动释放，其他客户端就能拿到锁，导致并发问题。Redisson的Watchdog机制会定期续约，怕浪猫用Python实现一个简化版：

```python
import threading
import time

class LockWatchdog(threading.Thread):
    def __init__(self, lock, interval=None):
        super().__init__(daemon=True)
        self.lock = lock
        self.interval = interval or lock.timeout / 3
        self._running = True

    def run(self):
        while self._running:
            time.sleep(self.interval)
            if not self._renew():
                self._running = False
                break

    def _renew(self):
        # 只有持有锁的客户端才能续约
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
        else
            return 0
        end
        """
        result = self.lock.redis.eval(
            script, 1, self.lock.lock_key,
            self.lock.lock_value, int(self.lock.timeout * 1000)
        )
        return result == 1

    def stop(self):
        self._running = False
```

> 锁续约不是"续命"，而是"我还在干活，别把我的锁给别人"。

**RedLock算法**：单Redis实例的锁在故障转移时会失效。Antirez提出的RedLock算法在多个（通常5个）独立的Redis实例上同时加锁，超过半数成功才算加锁成功。来看Python实现：

```python
import time
import uuid

class RedLock:
    def __init__(self, redis_nodes, lock_key, timeout=10):
        # redis_nodes: list of redis.Redis instances
        self.nodes = redis_nodes
        self.lock_key = lock_key
        self.timeout = timeout
        self.lock_value = str(uuid.uuid4())
        self.quorum = len(redis_nodes) // 2 + 1
        self.retry_count = 3
        self.retry_delay = 0.2

    def acquire(self):
        for attempt in range(self.retry_count):
            success_count = 0
            start = time.monotonic()
            for node in self.nodes:
                try:
                    if node.set(self.lock_key, self.lock_value,
                                nx=True, px=self.timeout * 1000):
                        success_count += 1
                except Exception:
                    continue
            elapsed = (time.monotonic() - start) * 1000
            # 加锁耗时不能超过锁有效期的一半
            if success_count >= self.quorum and elapsed < self.timeout * 1000:
                return True
            # 加锁失败，释放所有已加的锁
            self._release_all()
            time.sleep(self.retry_delay)
        return False

    def _release_all(self):
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        for node in self.nodes:
            try:
                node.eval(script, 1, self.lock_key, self.lock_value)
            except Exception:
                continue
```

RedLock的争议很大。Martin Kleppmann在《Designing Data-Intensive Applications》中批评RedLock在时钟漂移和GC暂停场景下不安全。怕浪猫的观点是：如果你的业务对正确性要求极高（比如金融），别用RedLock，用Etcd或ZooKeeper；如果是普通业务场景（比如防止重复下单），Redis单实例锁加合理超时就够了。

### 2.2 基于Etcd的分布式锁

Etcd通过Lease+TTL机制实现分布式锁，天然支持强一致性。和Redis最大的区别是，Etcd通过Raft协议保证数据一致性，不会出现脑裂问题。

```python
import etcd3
import time
import uuid

class EtcdDistributedLock:
    def __init__(self, etcd_host='localhost', etcd_port=2379,
                 lock_key='my_lock', ttl=10):
        self.client = etcd3.client(host=etcd_host, port=etcd_port)
        self.lock_key = lock_key
        self.ttl = ttl
        self.lease = None
        self.lock_value = str(uuid.uuid4())

    def acquire(self, timeout=0):
        deadline = time.monotonic() + timeout if timeout > 0 else None
        while True:
            self.lease = self.client.lease(self.ttl)
            # Txn事务保证原子性：compare(key不存在) -> success(put) 
            txn = {
                'compare': [{
                    'key': self.lock_key.encode(),
                    'result': 'CREATE',
                    'target': 'VERSION',
                    'create_revision': 0
                }],
                'success': [{
                    'request_put': {
                        'key': self.lock_key.encode(),
                        'value': self.lock_value.encode(),
                        'lease': self.lease.id
                    }
                }],
                'failure': []
            }
            status, _ = self.client.transaction(txn)
            if status:
                return True
            if deadline and time.monotonic() > deadline:
                return False
            time.sleep(0.1)

    def release(self):
        if self.lease:
            self.lease.revoke()

    def refresh(self):
        """续约，防止TTL到期"""
        if self.lease:
            self.lease.refresh()
```

Etcd的Txn事务是核心：它把"检查key是否存在"和"写入key"放在一个原子事务里，要么全成功，要么全失败。这比Redis的`SET NX`语义更严格——Etcd的Raft协议保证了即使在网络分区时，也不会有两个客户端同时拿到锁。

Etcd还提供Watch机制，可以监听key的变化。当锁被释放时，Watch会收到通知，其他等待的客户端不需要轮询：

```python
def watch_and_wait(client, lock_key, timeout=30):
    """监听锁释放事件，避免轮询"""
    events_iter, cancel = client.watch(lock_key.encode())
    start = time.monotonic()
    for event in events_iter:
        if event.type == etcd3.events.DELETE_EVENT:
            cancel()
            return True
        if time.monotonic() - start > timeout:
            cancel()
            return False
```

### 2.3 基于ZooKeeper的分布式锁

ZooKeeper的分布式锁基于临时有序节点。每个客户端在锁目录下创建一个有序的临时节点，序号最小的获得锁，其他客户端Watch前一个节点。当持锁客户端断开连接时，临时节点自动删除，下一个客户端被唤醒。

```python
from kazoo.client import KazooClient
import uuid

class ZKDistributedLock:
    def __init__(self, hosts='127.0.0.1:2181', lock_path='/my_lock'):
        self.zk = KazooClient(hosts=hosts)
        self.lock_path = lock_path
        self.node_path = None
        self.zk.start()

    def acquire(self, timeout=None):
        # 创建临时有序节点
        self.node_path = self.zk.create(
            f"{self.lock_path}/lock_",
            value=uuid.uuid4().bytes,
            ephemeral=True, sequence=True
        )
        while True:
            children = self.zk.get_children(self.lock_path)
            children.sort()
            my_name = self.node_path.split('/')[-1]
            if children[0] == my_name:
                return True  # 我是最小的，获得锁
            # 找到前一个节点并监听它
            my_index = children.index(my_name)
            prev_node = f"{self.lock_path}/{children[my_index - 1]}"
            event = threading.Event()
            @self.zk.DataWatch(prev_node)
            def watch_node(data, stat):
                if stat is None:  # 前一个节点被删除
                    event.set()
            event.wait(timeout=timeout)
            if not event.is_set():
                self.zk.delete(self.node_path)
                return False

    def release(self):
        if self.node_path:
            self.zk.delete(self.node_path)
            self.node_path = None
```

**羊群效应**：如果所有客户端都Watch同一个节点，当它删除时会唤醒所有客户端，但只有一个能获得锁，其他全部惊醒后又重新睡眠，造成大量无效请求。上面的实现已经避免了这个问题——每个客户端只Watch前一个节点，而不是所有客户端Watch同一个节点。

> 羊群效应的本质是"广播"代替了"点对点通知"，解决思路就是把广播改成链式通知。

### 2.4 通用分布式锁抽象层

实际项目中，你可能需要在Redis和Etcd之间切换。怕浪猫设计了一个抽象层，统一接口，通过配置选择后端：

```python
from abc import ABC, abstractmethod
import redis
import etcd3

class DistributedLock(ABC):
    @abstractmethod
    def acquire(self, timeout=0): pass
    
    @abstractmethod
    def release(self): pass
    
    @abstractmethod
    def refresh(self): pass

    def __enter__(self):
        self.acquire(timeout=30)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False

class RedisLockImpl(DistributedLock):
    def __init__(self, client, key, ttl=10):
        self.redis = client
        self.key = f"lock:{key}"
        self.ttl = ttl
        self._value = str(uuid.uuid4())
        self._watchdog = None

    def acquire(self, timeout=0):
        deadline = time.monotonic() + timeout if timeout > 0 else None
        while True:
            if self.redis.set(self.key, self._value, nx=True, px=self.ttl*1000):
                self._start_watchdog()
                return True
            if deadline and time.monotonic() > deadline:
                return False
            time.sleep(0.1)

    def release(self):
        self._stop_watchdog()
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        end
        """
        self.redis.eval(script, 1, self.key, self._value)

    def refresh(self):
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
        end
        """
        return self.redis.eval(script, 1, self.key, self._value, self.ttl*1000)

class EtcdLockImpl(DistributedLock):
    def __init__(self, client, key, ttl=10):
        self.client = client
        self.key = f"/lock/{key}"
        self.ttl = ttl
        self.lease = None

    def acquire(self, timeout=0):
        deadline = time.monotonic() + timeout if timeout > 0 else None
        while True:
            self.lease = self.client.lease(self.ttl)
            txn = {
                'compare': [{
                    'key': self.key.encode(),
                    'result': 'CREATE_REVISION',
                    'target': 0,
                    'create_revision': 0
                }],
                'success': [{
                    'request_put': {
                        'key': self.key.encode(),
                        value=b'1',
                        'lease': self.lease.id
                    }
                }]
            }
            status, _ = self.client.transaction(txn)
            if status:
                return True
            self.lease.revoke()
            if deadline and time.monotonic() > deadline:
                return False
            time.sleep(0.1)

    def release(self):
        if self.lease:
            self.lease.revoke()
            self.lease = None

    def refresh(self):
        if self.lease:
            self.lease.refresh()

def create_lock(backend='redis', **kwargs):
    if backend == 'redis':
        client = redis.Redis(
            host=kwargs.get('host', 'localhost'),
            port=kwargs.get('port', 6379)
        )
        return RedisLockImpl(client, kwargs['key'], kwargs.get('ttl', 10))
    elif backend == 'etcd':
        client = etcd3.client(
            host=kwargs.get('host', 'localhost'),
            port=kwargs.get('port', 2379)
        )
        return EtcdLockImpl(client, kwargs['key'], kwargs.get('ttl', 10))
    raise ValueError(f"Unknown backend: {backend}")
```

使用方式非常干净：

```python
# 配置切换后端，业务代码不变
lock = create_lock(backend='redis', key='order_123', ttl=10)
with lock:
    process_order('123')
```

来看三种分布式锁方案的对比：

| 维度 | Redis单实例 | RedLock | Etcd | ZooKeeper |
|------|------------|---------|------|-----------|
| 一致性 | AP（故障转移时可能丢锁） | CP（有争议） | CP（Raft） | CP（ZAB） |
| 性能 | 最高（单次RTT） | 中等（多实例RTT） | 中等 | 较低（Session开销） |
| 可靠性 | 较低（主从切换有风险） | 较高 | 高 | 高 |
| 复杂度 | 低 | 中 | 中 | 高 |
| Python生态 | redis-py（成熟） | 自实现 | etcd3-python | kazoo（成熟） |
| 适用场景 | 低频争抢、非关键业务 | 中等可靠性需求 | 强一致性需求 | 已有ZK集群的场景 |
| 运维成本 | 低 | 高（需5+独立实例） | 中 | 高 |

> 选锁的核心原则：先问"锁失效的后果有多严重"，再选方案，而不是先看哪个方案性能高。

## 三、缓存系统设计：从内存到多级架构

### 3.1 本地缓存：从lru_cache到cachetools

Python标准库的`functools.lru_cache`是最简单的缓存方案。怕浪猫先带你扒一下它的源码实现：

```python
# functools.lru_cache 简化版源码分析
def lru_cache(maxsize=128, typed=False):
    def decorating_function(user_function):
        cache = {}          # key -> entry
        population = 0      # 当前缓存项数量
        full = False        # 缓存是否已满
        # 双向链表，最近使用的在头部
        root = []           # [PREV, NEXT, KEY, RESULT]
        root[:] = [root, root, None, None]

        def wrapper(*args, **kwds):
            key = make_key(args, kwds, typed)
            with lock:
                link = cache.get(key)
                if link is not None:
                    # 命中：移到链表头部
                    link_prev, link_next, _, result = link
                    link_prev[1] = link_next
                    link_next[0] = link_prev
                    last = root[0]
                    link[0] = last
                    link[1] = root
                    last[1] = root[0] = link
                    return result
                # 未命中：计算结果并存入缓存
                result = user_function(*args, **kwds)
                if full:
                    # 缓存满：淘汰链表尾部（最久未使用）
                    oldroot = root
                    oldroot[2] = key
                    oldroot[3] = result
                    root = oldroot[1]
                    oldkey = root[2]
                    oldresult = root[3]
                    root[2] = root[3] = None
                    del cache[oldkey]
                    cache[key] = oldroot
                else:
                    # 缓存未满：新建节点
                    last = root[0]
                    link = [last, root, key, result]
                    last[1] = root[0] = cache[key] = link
                    population += 1
                    full = (population >= maxsize)
            return result
        return wrapper
    return decorating_function
```

`lru_cache`的核心是一个双向链表加哈希表。链表头部是最近使用的，尾部是最久未使用的。命中时把节点移到头部，满了就淘汰尾部。查询复杂度O(1)。

但`lru_cache`有几个局限：不支持TTL、不支持最大内存限制、多线程下虽然有锁但粒度粗。实际项目中，`cachetools`库更实用：

```python
from cachetools import TTLCache, LRUCache, LFUCache
import threading
import time

# TTLCache：带过期时间的LRU缓存
cache = TTLCache(maxsize=1000, ttl=300)

# LFUCache：最不经常使用淘汰
lfu_cache = LFUCache(maxsize=500)

# 线程安全的缓存封装
class ThreadSafeCache:
    def __init__(self, maxsize=1000, ttl=300):
        self._cache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = threading.Lock()

    def get(self, key, factory=None):
        """获取缓存，未命中时用factory生成"""
        with self._lock:
            value = self._cache.get(key)
            if value is not None:
                return value
        # 缓存未命中，加锁生成（减少锁持有时间）
        if factory:
            value = factory()
            with self._lock:
                # double-check，防止其他线程已经写入
                existing = self._cache.get(key)
                if existing is not None:
                    return existing
                self._cache[key] = value
            return value
        return None

    def set(self, key, value):
        with self._lock:
            self._cache[key] = value

    def delete(self, key):
        with self._lock:
            self._cache.pop(key, None)

    def clear(self):
        with self._lock:
            self._cache.clear()
```

注意上面的`get`方法用了double-check模式：先无锁读，未命中再生成，写入时再检查一次。这比直接对整个get加锁性能好得多，特别是factory耗时较长时。

**线程安全缓存的陷阱**：`threading.Lock`只能保证单进程内的线程安全。如果你的服务是多进程的（比如gunicorn多worker），每个进程有独立的缓存，会导致缓存命中率下降和内存浪费。多进程共享缓存的方案是用`multiprocessing.Manager`：

```python
from multiprocessing import Manager, Process

class MultiProcessCache:
    def __init__(self, maxsize=1000):
        self.manager = Manager()
        self.dict = self.manager.dict()
        self.maxsize = maxsize

    def get(self, key):
        return self.dict.get(key)

    def set(self, key, value):
        if len(self.dict) >= self.maxsize:
            # 简单的淘汰策略：随机删一个
            oldest_key = next(iter(self.dict))
            del self.dict[oldest_key]
        self.dict[key] = value
```

但`multiprocessing.Manager`的性能很差，每次操作都有IPC开销。实际生产环境，多进程共享缓存还是上Redis。本地缓存只做L1，做请求级别的短时缓存。

> 本地缓存是"快但不可靠"，Redis是"可靠但慢一个量级"——多级缓存才是正解。

### 3.2 Redis缓存：连接池、Pipeline与Lua

Redis缓存的核心是`redis-py`库。怕浪猫见过太多项目直接`redis.Redis()`每请求新建连接，QPS一上来连接数就爆了。正确做法是用连接池：

```python
import redis

# 连接池配置
pool = redis.ConnectionPool(
    host='localhost', port=6379, db=0,
    max_connections=50,         # 最大连接数
    socket_timeout=2,           # 读写超时
    socket_connect_timeout=1,   # 连接超时
    retry_on_timeout=True,      # 超时重试
    retry_on_error=[redis.ConnectionError],
    health_check_interval=30,   # 健康检查间隔
)

# 全局复用
redis_client = redis.Redis(connection_pool=pool)

# Pipeline批量操作，减少RTT
def batch_get_users(user_ids):
    pipe = redis_client.pipeline(transaction=False)
    for uid in user_ids:
        pipe.get(f"user:{uid}")
    results = pipe.execute()
    return [r for r in results if r is not None]
```

Pipeline和事务的区别：Pipeline是把多条命令打包一次性发送，不保证原子性；事务（MULTI/EXEC）保证命令按顺序执行不被打断，但不保证都成功。如果你需要原子性，用Lua脚本：

```python
# Lua脚本：原子性地"检查并更新库存"
DEDUCT_STOCK_SCRIPT = """
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local current = tonumber(redis.call("get", key) or "0")
if current < amount then
    return -1
end
redis.call("decrby", key, amount)
return current - amount
"""

def deduct_stock(item_id, amount):
    result = redis_client.eval(
        DEDUCT_STOCK_SCRIPT, 1,
        f"stock:{item_id}", amount
    )
    if result == -1:
        raise ValueError("库存不足")
    return result
```

**发布订阅（Pub/Sub）**：Redis的Pub/Sub适合做缓存失效通知。当一个节点更新了缓存，通过Pub/Sub通知其他节点删除本地缓存：

```python
import threading
import json

class CacheInvalidationListener(threading.Thread):
    def __init__(self, redis_client, local_cache):
        super().__init__(daemon=True)
        self.redis = redis_client
        self.local_cache = local_cache

    def run(self):
        pubsub = self.redis.pubsub()
        pubsub.subscribe("cache_invalidation")
        for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                keys = data.get("keys", [])
                for key in keys:
                    self.local_cache.delete(key)

def notify_invalidation(redis_client, keys):
    """通知所有节点失效本地缓存"""
    redis_client.publish(
        "cache_invalidation",
        json.dumps({"keys": keys})
    )
```

Pub/Sub的坑：消息是fire-and-forget的，客户端断开期间的消息会丢失。如果你的缓存一致性要求高，用Redis Stream或者外部的消息队列（RabbitMQ/Kafka）代替。

### 3.3 多级缓存架构

多级缓存是L1（本地缓存）+ L2（Redis分布式缓存）。读请求先查L1，未命中查L2，再未命中查数据库。写请求更新数据库后，同步更新L2，异步失效L1。

```python
import threading
import time
import json
import redis
from cachetools import TTLCache

class MultiLevelCache:
    def __init__(self, redis_client, l1_size=1000, l1_ttl=60, l2_ttl=300):
        # L1: 本地缓存，短TTL，小容量
        self.l1 = TTLCache(maxsize=l1_size, ttl=l1_ttl)
        self.l1_lock = threading.Lock()
        # L2: Redis分布式缓存，长TTL，大容量
        self.l2 = redis_client
        self.l2_ttl = l2_ttl

    def get(self, key, loader=None):
        # L1 -> L2 -> DB
        with self.l1_lock:
            value = self.l1.get(key)
        if value is not None:
            return value

        l2_key = f"cache:{key}"
        value = self.l2.get(l2_key)
        if value is not None:
            value = json.loads(value)
            self._set_l1(key, value)
            return value

        if loader:
            value = loader()
            if value is not None:
                self.set(key, value)
            return value
        return None

    def set(self, key, value):
        self._set_l1(key, value)
        self.l2.setex(
            f"cache:{key}", self.l2_ttl, json.dumps(value)
        )

    def delete(self, key):
        with self.l1_lock:
            self.l1.pop(key, None)
        self.l2.delete(f"cache:{key}")

    def _set_l1(self, key, value):
        with self.l1_lock:
            self.l1[key] = value

    def invalidate_with_double_delete(self, key, delay_ms=500):
        """延时双删策略"""
        # 第一次删除
        self.delete(key)
        # 延时后第二次删除
        def second_delete():
            time.sleep(delay_ms / 1000)
            self.delete(key)
        threading.Thread(target=second_delete, daemon=True).start()
```

**缓存一致性是分布式缓存最头疼的问题**。怕浪猫总结了三种策略的取舍：

**延时双删**：先删缓存，再写数据库，延时一段时间后再次删缓存。简单但有延时窗口，不适合写频繁的场景。

**消息队列通知**：写数据库后发消息到MQ，消费消息时删缓存。可靠性高但引入了MQ依赖，增加系统复杂度。

**Canal监听binlog**：通过Canal监听MySQL的binlog，自动失效缓存。业务代码零侵入，但运维成本高。

> 缓存一致性没有银弹，只有"在什么场景下用什么策略"的工程判断。

### 3.4 缓存防护：穿透、击穿、雪崩

这三个问题是缓存系统设计绕不开的三座大山。怕浪猫逐个拆解：

**缓存穿透**：大量请求查询一个不存在的key，缓存和数据库都不命中，请求直接打到数据库。常见于恶意攻击或爬虫。

防护方案一：空值缓存。查数据库没查到，也把空值缓存起来，设一个短TTL：

```python
NULL_PLACEHOLDER = "__NULL__"

def get_with_null_cache(cache, key, db_loader, ttl=300, null_ttl=60):
    value = cache.get(key)
    if value is not None:
        if value == NULL_PLACEHOLDER:
            return None
        return value
    # 缓存未命中，查数据库
    value = db_loader()
    if value is None:
        cache.set(key, NULL_PLACEHOLDER, ttl=null_ttl)
        return None
    cache.set(key, value, ttl=ttl)
    return value
```

防护方案二：布隆过滤器。在缓存前加一层布隆过滤器，快速判断key是否可能存在：

```python
from pybloom_live import ScalableBloomFilter

class BloomFilterGuard:
    def __init__(self, initial_capacity=1000000, error_rate=0.001):
        self.bloom = ScalableBloomFilter(
            initial_capacity=initial_capacity,
            error_rate=error_rate
        )

    def add(self, key):
        self.bloom.add(key)

    def might_exist(self, key):
        return key in self.bloom

def get_with_bloom(bloom, cache, db_loader, key, ttl=300):
    if not bloom.might_exist(key):
        return None  # 布隆过滤器说不存在，肯定不存在
    value = cache.get(key)
    if value is not None:
        return value
    value = db_loader()
    if value is not None:
        cache.set(key, value, ttl=ttl)
    return value
```

布隆过滤器的坑：它有误判率（false positive），说"存在"不一定真存在，但说"不存在"一定不存在。误判率取决于bitmap大小和hash函数数量。还有，新数据要记得同步加入布隆过滤器，否则会被误判为不存在。

**缓存击穿**：一个热点key突然过期，大量并发请求同时查数据库。和穿透的区别是，击穿是key确实存在只是过期了，穿透是key压根不存在。

防护方案一：互斥锁。只允许一个请求查数据库，其他请求等待：

```python
import threading

class MutexCacheLoader:
    def __init__(self, cache, redis_client):
        self.cache = cache
        self.redis = redis_client
        self._local_locks = threading.Lock()
        self._local_lock_map = {}

    def get(self, key, loader, ttl=300, lock_timeout=10):
        value = self.cache.get(key)
        if value is not None:
            return value
        # 本地互斥锁（同进程内）
        with self._local_locks:
            lock = self._local_lock_map.get(key)
            if lock is None:
                lock = threading.Lock()
                self._local_lock_map[key] = lock
        with lock:
            # double-check
            value = self.cache.get(key)
            if value is not None:
                return value
            value = loader()
            if value is not None:
                self.cache.set(key, value, ttl=ttl)
            return value
```

防护方案二：Redis SETNX分布式互斥锁。多进程场景下，本地锁不够用：

```python
def get_with_redis_lock(redis_client, cache, key, loader, ttl=300, lock_ttl=10):
    value = cache.get(key)
    if value is not None:
        return value
    lock_key = f"lock:{key}"
    lock_value = str(uuid.uuid4())
    # 尝试获取分布式锁
    acquired = redis_client.set(lock_key, lock_value, nx=True, px=lock_ttl*1000)
    if acquired:
        try:
            value = loader()
            if value is not None:
                cache.set(key, value, ttl=ttl)
            return value
        finally:
            # 释放锁
            script = """
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            end
            """
            redis_client.eval(script, 1, lock_key, lock_value)
    else:
        # 等待重试
        time.sleep(0.1)
        return get_with_redis_lock(redis_client, cache, key, loader, ttl, lock_ttl)
```

防护方案三：逻辑过期。不设物理TTL，在value中存逻辑过期时间，发现过期时异步刷新：

```python
import json
import time
import threading

def get_with_logical_expire(cache, key, loader, ttl=300):
    raw = cache.get(key)
    if raw is None:
        # 完全没缓存，直接加载
        value = loader()
        if value is not None:
            data = {"value": value, "expire_at": time.time() + ttl}
            cache.set(key, json.dumps(data), ttl=ttl*2)
        return value
    data = json.loads(raw)
    if time.time() < data["expire_at"]:
        return data["value"]
    # 逻辑过期，异步刷新
    def refresh():
        value = loader()
        if value is not None:
            new_data = {"value": value, "expire_at": time.time() + ttl}
            cache.set(key, json.dumps(new_data), ttl=ttl*2)
    threading.Thread(target=refresh, daemon=True).start()
    # 返回旧值，不阻塞用户
    return data["value"]
```

> 互斥锁是"一个人干活其他人等"，逻辑过期是"所有人先用旧值，后台默默刷新"。

**缓存雪崩**：大量key同时过期，或者Redis宕机，请求全部打到数据库。

防护方案一：随机过期时间。给TTL加上一个随机偏移量：

```python
import random

def set_with_random_ttl(cache, key, value, base_ttl=300, jitter=60):
    """设置缓存时加随机TTL，防止同时过期"""
    actual_ttl = base_ttl + random.randint(0, jitter)
    cache.set(key, value, ttl=actual_ttl)
```

防护方案二：多级兜底。L1本地缓存作为最后防线，即使Redis挂了，L1还能扛一部分请求：

```python
class CacheFallbackChain:
    def __init__(self, l1_cache, l2_cache, db_loader):
        self.l1 = l1_cache
        self.l2 = l2_cache
        self.db = db_loader

    def get(self, key, ttl=300):
        # L1 -> L2 -> DB，每层都有兜底
        value = self.l1.get(key)
        if value is not None:
            return value
        try:
            value = self.l2.get(key)
            if value is not None:
                self.l1.set(key, value, ttl=60)
                return value
        except Exception:
            pass  # L2挂了，继续降级
        # DB兜底
        value = self.db(key)
        if value is not None:
            self.l1.set(key, value, ttl=60)
            try:
                self.l2.set(key, value, ttl=ttl)
            except Exception:
                pass
        return value
```

来看缓存防护方案对比：

| 问题 | 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|----------|
| 穿透 | 空值缓存 | 实现简单 | 浪费内存，key空间无限 | 穿透key数量有限 |
| 穿透 | 布隆过滤器 | 内存高效，查询快 | 有误判率，需预热 | key空间大，恶意请求多 |
| 击穿 | 互斥锁 | 数据一致 | 增加延迟，可能死锁 | 热点key少，一致性要求高 |
| 击穿 | 逻辑过期 | 不阻塞用户 | 短暂返回旧数据 | 容忍短暂不一致 |
| 击穿 | Redis SETNX | 跨进程互斥 | 增加Redis压力 | 多进程部署 |
| 雪崩 | 随机TTL | 简单有效 | 无法完全避免 | 大批量缓存初始化 |
| 雪崩 | 多级兜底 | 高可用 | 架构复杂 | 核心业务链路 |

> 缓存防护的本质是"用复杂度换可靠性"——你愿意为可靠性付出多少代码复杂度，决定了你的缓存系统有多健壮。

### 3.5 缓存实战清单

怕浪猫把缓存设计的关键决策点整理成一个清单，新建缓存系统时逐项check：

**初始化阶段checklist：**

1. 确定缓存层级：是否需要L1本地缓存？L2用Redis还是Memcached？
2. 确定key设计：key命名规范（业务:实体:ID），key长度控制在100字节内
3. 确定value格式：JSON还是Protobuf？序列化性能vs可读性
4. 确定TTL策略：不同数据的TTL不同，热点数据长TTL，冷数据短TTL
5. 确定淘汰策略：LRU（时间局部性）还是LFU（频率优先）？
6. 确定一致性策略：延时双删还是消息队列通知？
7. 确定防护方案：是否需要布隆过滤器？热点key是否需要互斥锁？
8. 确定监控指标：命中率、QPS、延迟P99、内存占用
9. 确定降级方案：Redis挂了怎么办？是否回源DB还是返回默认值？
10. 确定预热方案：冷启动时是否需要预热缓存？怎么预热？

这个清单怕浪猫贴在工位上，每次设计缓存系统都过一遍。不是每个项都要做，但你得知道每项的风险和收益，做出有意识的选择而不是无意识的遗漏。

## 收尾

这一章从CAP定理讲到分布式锁的三种实现，再到多级缓存架构和三大缓存防护方案。内容密度很大，建议收藏后分几次消化。

怕浪猫的建议是：先理解CAP和BASE的理论框架，再动手实现一遍Redis分布式锁（包括Watchdog和Lua脚本释放），最后把缓存防护的三种方案在本地跑通。理论看十遍不如代码跑一遍。

如果你觉得这章对你有帮助，点个收藏，后面写代码遇到缓存问题可以随时翻出来对照。评论区留下你踩过的分布式缓存坑，怕浪猫会逐条回复。

系列进度 11/16。下一章我们进入**分布式任务调度与消息队列**，会讲Celery的生产级配置、延时任务方案、消息队列的选型对比（RabbitMQ vs Kafka vs Redis Stream），以及消息可靠性的三道防线。那章的实战含量更高，怕浪猫建议你先把这章的锁和缓存吃透，下一章会用到这些基础。

### 怕浪猫说

分布式系统的本质是"在不可靠的网络上构建可靠的系统"。CAP不是让你选三个中的两个，而是让你在故障发生时清楚自己选了什么、放弃了什么。缓存不是银弹，它是用一致性换性能的交易——你越是清楚这笔交易的代价，你的系统就越稳健。记住，没有完美的架构，只有适合场景的架构。下章见。
