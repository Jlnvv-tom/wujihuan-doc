# 第6章：本地缓存与Redis客户端——从原理到手写实现

## 从一次线上事故说起

去年有个项目，数据库QPS平时也就2000左右，突然某天午高峰直接飙到15000，数据库CPU瞬间打满，响应时间从20ms飙到800ms，差点引发雪崩。事后排查发现，某个热点查询的缓存key突然过期了，大量请求同时穿透到数据库，经典的"缓存击穿"。

事故复盘的时候，团队意识到一个问题：我们用了三年Redis，但对缓存的理解还停留在"set一下get一下"的层面。本地缓存怎么选？淘汰策略用哪个？连接池参数怎么调？Pipeline到底能快多少？这些问题没人能说清楚。大家只是照着文档调API，出了问题就一脸懵。

更尴尬的是，当我们决定自己写一个简易的本地缓存来兜底时，发现连一个线程安全的LRU都写不利索。面试时背的"双向链表加哈希表"，真到了要落笔写代码的时候，才发现细节远比口诀复杂得多。

我是怕浪猫，一个在后端架构里摸爬滚打多年的开发者。这一章，我把缓存这块从原理到实现彻底拆透，不光讲怎么用，更讲怎么从零手写一个生产可用的本地缓存和Redis客户端。这篇文章会比较长，因为缓存这个话题值得认真对待。你可以先收藏，慢慢看。

> 缓存不是银弹，它是用空间换时间的精密交易。不懂底层的缓存，迟早会成为系统的阿喀琉斯之踵。

---

## 一、缓存基础与设计原则

### 1.1 什么时候该用缓存

不是所有场景都适合加缓存。缓存引入了复杂性、一致性问题和运维成本。在决定加缓存之前，先问自己三个问题：

- 数据读取频率是否远高于写入频率？如果读写比低于3:1，缓存的收益可能抵不上维护成本。
- 数据是否容忍短暂的不一致？如果不能接受任何 staleness，缓存的复杂度会成倍增加。
- 数据量是否在内存可承受的范围内？如果要缓存几十GB的数据，内存成本和GC压力会成为瓶颈。

如果三个答案都是"是"，那缓存大概率能带来收益。如果有一个是"否"，就要慎重评估。如果两个以上是"否"，建议放弃缓存方案，转而优化数据库查询本身——比如加索引、做分表分库、用读写分离等手段。

在实际项目中，我见过太多"无脑加缓存"的案例。有个团队把一个每天只查询几十次的配置表加了Redis缓存，结果维护缓存的代码比业务代码还多，还得处理缓存一致性问题，最后还因为缓存序列化bug导致了一次线上事故。这就是典型的"为了缓存而缓存"——没有想清楚收益和成本的关系，只是觉得"别人都加缓存了我也要加"。

还有一种常见误区是把缓存当持久化存储用。有人把重要的业务数据只存在Redis中，不写数据库，结果Redis重启数据全丢了。缓存就是缓存，它的核心定位是"加速读取"，不是"可靠存储"。任何放在缓存中的数据，都应该能从原始数据源重新获取。

```go
// 一个典型的缓存决策模型
type CacheDecision struct {
    ReadQPS    int     // 读QPS
    WriteQPS   int     // 写QPS
    DataSizeMB int     // 数据大小(MB)
    TTLSeconds int     // 可接受的数据过期时间
    ConsistencyRequired bool // 是否要求强一致
    CacheHitRate    float64 // 预估命中率
}

func ShouldUseCache(d CacheDecision) (bool, string) {
    if d.ConsistencyRequired {
        return false, "数据要求强一致，不适合缓存"
    }
    if d.ReadQPS < d.WriteQPS*10 {
        return false, "读写比过低，缓存收益有限"
    }
    if d.DataSizeMB > 4096 {
        return false, "数据量过大，内存成本过高"
    }
    if d.CacheHitRate < 0.3 {
        return false, "预估命中率过低，缓存效果不佳"
    }
    return true, "适合使用缓存"
}
```

缓存决策不能只看技术层面，还要看业务层面。有些数据虽然读多写少，但每次读取的数据都不同（比如用户搜索记录），缓存的命中率极低，这时候加缓存就是在浪费资源。

### 1.2 缓存的成本分析

缓存不是免费的午餐，它有显性成本和隐性成本。很多人只看到了显性成本，忽略了隐性成本，结果上线后各种踩坑。

**显性成本：**
- 内存占用：每缓存1GB数据，就要多花1GB内存的钱。而且这只是数据本身的大小，加上序列化开销、索引开销、元数据开销，实际内存占用往往是数据大小的1.5到2倍。
- 基础设施：Redis集群、哨兵、监控、告警等运维成本。一个3主3从的Redis集群，加上监控和运维人力，每年的成本不低。
- 网络开销：多一次网络往返。虽然单次RTT可能只有0.5ms，但在高并发场景下，这个开销会被放大。

**隐性成本：**
- 一致性问题：缓存与数据库的一致性保障逻辑。你需要处理缓存失效、缓存更新、缓存击穿、缓存雪崩等各种边界情况。
- 代码复杂度：缓存逻辑侵入业务代码。如果不做好抽象，缓存代码会和业务代码纠缠在一起，后期维护非常痛苦。
- 故障风险：缓存宕机可能导致雪崩。如果业务对缓存依赖过强，缓存一旦出问题，整个系统都会受影响。
- 调试难度：缓存层会让问题排查变得更复杂。数据不一致是缓存还是数据库的问题？缓存命中了为什么返回的还是旧数据？这些问题排查起来比没有缓存时难得多。

> 一行cache.set()背后，是三行缓存预热、五行过期处理、十行一致性保障。缓存的代码量永远比你想的多。

### 1.3 缓存设计三原则

经过多个项目的踩坑，我总结了缓存设计的三个核心原则：简单、高效、可控。这三个原则看起来很朴素，但在实际项目中，违反它们的情况比比皆是。

**原则一：简单**

缓存的key设计要简单明了，value结构要尽量扁平。不要把缓存当数据库用，不要在缓存里做复杂的关联查询。key的设计要有清晰的命名规范，让人一看就知道这个缓存的是什么数据。

```go
// 好的key设计：业务前缀:实体ID:维度
key := fmt.Sprintf("user:profile:%d", userID)
// 一目了然：用户模块的profile数据，ID是userID

// 坏的key设计：嵌套层级太深，难以管理和清理
key := fmt.Sprintf("app:v2:module:sub:user:%d:profile:detail:full", userID)
// 太长的key不仅占用内存，还增加了理解和维护的成本

// 更坏的设计：把多个维度塞进一个key
key := fmt.Sprintf("data:%d:%d:%d:%s", userID, appID, channelID, date)
// 谁能看懂这个key的含义？排查问题时你会哭
```

value的设计也要简单。尽量存储扁平的结构，避免嵌套层级过深。如果value是一个复杂的对象，考虑拆分成多个独立的缓存项。

**原则二：高效**

缓存的目的是快。如果缓存的操作本身比直接查数据库还慢，那缓存就失去了意义。高效的缓存需要做到：O(1)的读写复杂度、最小的锁竞争、合理的淘汰策略。

衡量缓存效率的核心指标是命中率。命中率低于30%的缓存基本没有存在的价值。要保持高命中率，需要合理的容量设置、合适的淘汰策略、以及正确的TTL设置。

**原则三：可控**

缓存必须是可控的。你需要能随时查看缓存命中率、内存占用、key数量等指标。你需要能手动失效某个key，能设置全局过期策略，能优雅降级。一个不可控的缓存，就像一个没有刹车的汽车，跑得越快越危险。

```go
// 缓存应该暴露的监控指标
type CacheStats interface {
    HitCount()  int64     // 命中次数
    MissCount() int64     // 未命中次数
    HitRate()   float64   // 命中率
    KeyCount()  int       // key数量
    MemorySize() int64    // 内存占用(字节)
    EvictCount() int64    // 淘汰次数
    AvgLatency() float64  // 平均操作延迟(微秒)
}

// 缓存应该支持的管理操作
type CacheManager interface {
    Delete(key string) bool              // 手动删除单个key
    Clear()                              // 清空所有缓存
    SetCapacity(cap int)                 // 动态调整容量
    GetMetrics() CacheStats              // 获取统计信息
    ExportSnapshot() map[string]interface{} // 导出快照用于诊断
}
```

> 不可观测的缓存就像闭着眼睛开车，你以为在加速，可能在往悬崖开。

### 1.4 多级缓存架构

在实际生产中，单一的缓存层往往不够。高并发系统通常采用多级缓存架构：本地缓存作为一级缓存（L1），Redis作为二级缓存（L2），数据库作为最终数据源。

```
请求 -> L1(本地缓存) -> L2(Redis) -> DB
```

L1的特点是极快但容量有限，L2的特点是较大但需要网络开销。请求先查L1，未命中再查L2，L2未命中才查DB。查到数据后逐级回填。

```go
// 多级缓存实现
type MultiLevelCache struct {
    l1     *LRUCache        // 本地缓存
    l2     *RedisClient     // Redis客户端
    db     DataProvider     // 数据源
    logger Logger
}

type DataProvider func(ctx context.Context, key string) (interface{}, error)

func NewMultiLevelCache(l1Cap int, l2Addr string, db DataProvider) *MultiLevelCache {
    return &MultiLevelCache{
        l1: NewLRUCache(l1Cap, 0),
        l2: NewRedisClient(l2Addr),
        db: db,
    }
}

func (c *MultiLevelCache) Get(ctx context.Context, key string) (interface{}, error) {
    // L1: 本地缓存
    if val, ok := c.l1.Get(key); ok {
        return val, nil
    }
    
    // L2: Redis
    if val, err := c.l2.Get(key); err == nil && val != nil {
        // 回填L1
        c.l1.Put(key, val, 5*time.Minute)
        return val, nil
    }
    
    // DB: 数据源
    val, err := c.db(ctx, key)
    if err != nil {
        return nil, err
    }
    
    // 回填L2和L1
    c.l2.Set(key, val, 30*time.Minute)
    c.l1.Put(key, val, 5*time.Minute)
    
    return val, nil
}
```

多级缓存的难点在于一致性管理。L1本地缓存分布在多个节点上，一个节点更新了数据，其他节点的L1还是旧数据。解决方案通常有两个：一是L1的TTL设置得短一些（比如1-5分钟），容忍短暂不一致；二是通过消息广播通知所有节点失效L1。

> 多级缓存是性能和一致性的跷跷板。你永远无法同时拿到极致的性能和绝对的一致性，关键是在两者之间找到适合业务的平衡点。

---

## 二、缓存淘汰策略详解

缓存空间是有限的，当缓存满了之后，需要淘汰一些数据。不同的淘汰策略适用于不同的场景，选错策略会导致缓存命中率暴跌。

### 2.1 LRU（Least Recently Used）

LRU的核心思想是"最近最少使用的数据最有可能被淘汰"。它基于一个假设：最近被访问的数据，未来也更有可能被访问。这个假设叫做"局部性原理"，在大多数业务场景中是成立的。

LRU的实现通常使用双向链表+哈希表的组合：
- 哈希表存储key到链表节点的映射，实现O(1)查找
- 双向链表按访问时间排序，最近访问的在头部，最久未访问的在尾部
- 访问一个key时，将其移到链表头部
- 淘汰时，删除链表尾部节点

这个设计的精妙之处在于：哈希表解决了"快速查找"的问题，双向链表解决了"快速调整顺序"的问题。两者结合，实现了O(1)时间复杂度的Get和Put操作。这也是为什么几乎所有的LRU实现都采用这个组合——它是在时间和空间上的最优解。

理解这个数据结构的关键在于理解双向链表的优势。为什么不用单向链表？因为单向链表无法O(1)地删除中间节点——你需要知道前驱节点才能删除，而单向链表只能找后继节点。双向链表每个节点都有前驱和后继指针，删除任意节点都是O(1)的。

```go
package lru

import (
    "container/list"
)

// LRUCache LRU缓存
type LRUCache struct {
    capacity int
    size     int
    cache    map[string]*list.Element
    ll       *list.List
}

type entry struct {
    key   string
    value interface{}
}

func NewLRUCache(capacity int) *LRUCache {
    return &LRUCache{
        capacity: capacity,
        cache:    make(map[string]*list.Element),
        ll:       list.New(),
    }
}

// Get 获取缓存值，O(1)时间复杂度
func (c *LRUCache) Get(key string) (interface{}, bool) {
    if elem, ok := c.cache[key]; ok {
        // 命中缓存，将节点移到链表头部
        c.ll.MoveToFront(elem)
        return elem.Value.(*entry).value, true
    }
    return nil, false
}

// Put 写入缓存值，O(1)时间复杂度
func (c *LRUCache) Put(key string, value interface{}) {
    // 如果key已存在，更新值并移到头部
    if elem, ok := c.cache[key]; ok {
        c.ll.MoveToFront(elem)
        elem.Value.(*entry).value = value
        return
    }
    
    // 新建节点，放入链表头部和map中
    elem := c.ll.PushFront(&entry{key, value})
    c.cache[key] = elem
    
    // 如果超出容量，淘汰链表尾部节点（最久未使用）
    if c.ll.Len() > c.capacity {
        elem := c.ll.Back()
        if elem != nil {
            c.ll.Remove(elem)
            delete(c.cache, elem.Value.(*entry).key)
        }
    }
}

// Len 返回缓存中的元素数量
func (c *LRUCache) Len() int {
    return c.ll.Len()
}

// Delete 删除指定key
func (c *LRUCache) Delete(key string) bool {
    if elem, ok := c.cache[key]; ok {
        c.ll.Remove(elem)
        delete(c.cache, key)
        return true
    }
    return false
}
```

LRU的优点是实现简单，对热点数据友好。缺点是对突发性的全量扫描不友好——比如某个定时任务一次性读取了大量冷数据，这些冷数据会把热点数据挤出去，这种现象叫做"缓存污染"。

想象一个场景：你的系统有1000个缓存槽位，平时命中率在95%以上。某天一个批量任务一次性查询了2000个不同的key，LRU会把这2000个key都放进缓存，同时淘汰了1000个热点key。批量任务结束后，缓存里全是冷数据，命中率骤降到接近0，需要很长一段时间才能恢复。

> LRU就像一个只记得最近发生的事情的人。它对最近的变化很敏感，但也容易被一次性的大量信息冲掉真正重要的记忆。

### 2.2 LFU（Least Frequently Used）

LFU的核心思想是"访问频率最低的数据最有可能被淘汰"。它记录每个key的访问次数，淘汰时选择访问次数最少的。与LRU不同，LFU不关心最近一次访问是什么时候，只关心总共被访问了多少次。

LFU能避免LRU的扫描污染问题，但它的缺点是：历史频率高的key即使后来不再被访问，也很难被淘汰（频率衰减问题）。比如某个key在某段时间内被访问了1000次，之后再也没有被访问，但因为它的频率计数很高，LFU很难淘汰它。

现代的LFU实现（如TinyLFU）通过Count-Min Sketch和频率衰减机制解决了这个问题。Count-Min Sketch是一个概率型数据结构，用很小的内存（几个bit per key）就能近似统计访问频率。频率衰减是指定期将所有频率计数减半，让历史数据的影响逐渐减弱。

```go
// 简化版LFU实现
package lfu

import (
    "container/list"
)

type LFUCache struct {
    capacity int
    size     int
    minFreq  int
    cache    map[string]*lfuEntry
    freqMap  map[int]*list.List // 频率到链表的映射
}

type lfuEntry struct {
    key   string
    value interface{}
    freq  int
    elem  *list.Element
}

func NewLFUCache(capacity int) *LFUCache {
    return &LFUCache{
        capacity: capacity,
        cache:    make(map[string]*lfuEntry),
        freqMap:  make(map[int]*list.List),
    }
}

func (c *LFUCache) Get(key string) (interface{}, bool) {
    if e, ok := c.cache[key]; ok {
        c.incrFreq(e)
        return e.value, true
    }
    return nil, false
}

// incrFreq 增加key的访问频率
func (c *LFUCache) incrFreq(e *lfuEntry) {
    // 从旧频率链表中移除
    oldList := c.freqMap[e.freq]
    oldList.Remove(e.elem)
    
    // 如果旧频率链表空了且是最小频率，更新minFreq
    if e.freq == c.minFreq && oldList.Len() == 0 {
        c.minFreq++
    }
    
    // 添加到新频率链表
    e.freq++
    newList, ok := c.freqMap[e.freq]
    if !ok {
        newList = list.New()
        c.freqMap[e.freq] = newList
    }
    e.elem = newList.PushFront(e)
}

func (c *LFUCache) Put(key string, value interface{}) {
    if c.capacity <= 0 {
        return
    }
    
    // 如果key已存在，更新值并增加频率
    if e, ok := c.cache[key]; ok {
        e.value = value
        c.incrFreq(e)
        return
    }
    
    // 如果达到容量上限，淘汰最小频率链表的最后一个
    if c.size >= c.capacity {
        minList := c.freqMap[c.minFreq]
        elem := minList.Back()
        if elem != nil {
            oldEntry := elem.Value.(*lfuEntry)
            minList.Remove(elem)
            delete(c.cache, oldEntry.key)
            c.size--
        }
    }
    
    // 插入新条目，频率为1
    c.size++
    c.minFreq = 1
    e := &lfuEntry{key: key, value: value, freq: 1}
    list1, ok := c.freqMap[1]
    if !ok {
        list1 = list.New()
        c.freqMap[1] = list1
    }
    e.elem = list1.PushFront(e)
    c.cache[key] = e
}
```

LFU的频率衰减问题在实际中可以通过定期将所有频率计数右移一位（除以2）来解决。这样新的数据有机会竞争过历史热点，避免老热点数据永远占着位置不走。

> LRU关心"最近"，LFU关心"频繁"。没有最好的策略，只有最适合你业务模式的策略。

### 2.3 FIFO（First In First Out）

FIFO是最简单的淘汰策略：先进先出，像队列一样。新数据从队尾入队，淘汰时从队首出队。它完全不关心数据的访问模式，只关心插入顺序。

FIFO的实现非常简单，用一个链表或环形缓冲区就行。它的缺点是完全没有考虑访问模式——一个频繁访问的key也可能因为是最早插入的而被淘汰。

```go
package fifo

type FIFOCache struct {
    capacity int
    queue    []string
    cache    map[string]interface{}
    head     int // 环形缓冲区的头指针
}

func NewFIFOCache(capacity int) *FIFOCache {
    return &FIFOCache{
        capacity: capacity,
        cache:    make(map[string]interface{}),
        queue:    make([]string, capacity), // 预分配环形缓冲区
        head:     0,
    }
}

func (c *FIFOCache) Put(key string, value interface{}) {
    if _, exists := c.cache[key]; exists {
        // key已存在，只更新值，不改变位置
        c.cache[key] = value
        return
    }
    
    // 检查是否需要淘汰
    if len(c.cache) >= c.capacity {
        // 淘汰队首元素
        oldest := c.queue[c.head]
        delete(c.cache, oldest)
        c.head = (c.head + 1) % c.capacity
    }
    
    // 添加新元素
    pos := (c.head + len(c.cache)) % c.capacity
    c.queue[pos] = key
    c.cache[key] = value
}

func (c *FIFOCache) Get(key string) (interface{}, bool) {
    val, ok := c.cache[key]
    return val, ok
}
```

FIFO适合的场景非常有限，通常只在缓存数据访问模式非常均匀、没有明显热点的情况下使用。比如缓存一些TTL很短的临时数据，数据还没来得及体现出访问模式就已经过期了。又或者是一些只追加不修改的日志型数据，天然符合先进先出的语义。

在一些特殊场景中，FIFO也有它的优势：实现最简单、内存开销最小、不需要维护访问顺序。如果你的缓存只是为了短期缓冲，不在意命中率，FIFO是成本最低的选择。

### 2.4 TTL（Time To Live）

TTL不是一种独立的淘汰策略，而是其他策略的补充。它为每个key设置一个过期时间，到期后自动删除。TTL是缓存设计中最重要的一道安全网——它确保了即使缓存逻辑出了bug，数据也不会永远停留在缓存中。

TTL的实现有两种方式：
- **惰性删除**：访问时检查是否过期，过期则删除。优点是CPU友好（不需要后台线程），缺点是过期数据仍然占用内存，可能造成内存泄漏。
- **定期删除**：后台线程定期扫描并删除过期key。Redis默认每秒扫描10次，每次随机检查20个key，如果过期比例超过25%，再多扫描一轮。
- **混合删除**：惰性删除+定期删除。这是Redis的实际做法，兼顾CPU和内存。

```go
package ttlcache

import (
    "sync"
    "time"
)

type TTLCache struct {
    cache    map[string]*ttlEntry
    mu       sync.RWMutex
    stopChan chan struct{}
    stats    TTLStats
}

type ttlEntry struct {
    value      interface{}
    expireAt   time.Time
}

type TTLStats struct {
    ExpiredCount int64
    EvictedCount int64
}

func NewTTLCache(cleanupInterval time.Duration) *TTLCache {
    c := &TTLCache{
        cache:    make(map[string]*ttlEntry),
        stopChan: make(chan struct{}),
    }
    go c.cleanup(cleanupInterval)
    return c
}

func (c *TTLCache) Set(key string, value interface{}, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.cache[key] = &ttlEntry{
        value:    value,
        expireAt: time.Now().Add(ttl),
    }
}

func (c *TTLCache) Get(key string) (interface{}, bool) {
    c.mu.RLock()
    entry, ok := c.cache[key]
    c.mu.RUnlock()
    
    if !ok {
        return nil, false
    }
    
    // 惰性删除：访问时检查是否过期
    if time.Now().After(entry.expireAt) {
        c.mu.Lock()
        // 双重检查，防止在获取写锁的间隙被其他goroutine处理
        if e, ok := c.cache[key]; ok && time.Now().After(e.expireAt) {
            delete(c.cache, key)
        }
        c.mu.Unlock()
        return nil, false
    }
    return entry.value, true
}

// cleanup 定期清理过期key
func (c *TTLCache) cleanup(interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:\n            c.mu.Lock()\n            now := time.Now()
            for key, entry := range c.cache {
                if now.After(entry.expireAt) {
                    delete(c.cache, key)
                }
            }
            c.mu.Unlock()
            
        case <-c.stopChan:
            return
        }
    }
}

func (c *TTLCache) Stop() {
    close(c.stopChan)
}
```

### 2.5 随机TTL——防止缓存雪崩

如果大量key设置了相同的TTL，它们会在同一时刻过期，导致大量请求同时打到数据库，这就是"缓存雪崩"。解决方案是给TTL加上一个随机值，让过期时间分散开。

```go
// 设置带随机TTL的缓存
func SetWithJitter(cache TTLCache, key string, value interface{}, baseTTL time.Duration) {
    // 在基础TTL上增加0-30%的随机抖动
    jitter := time.Duration(rand.Int63n(int64(baseTTL) * 3 / 10))
    ttl := baseTTL + jitter
    cache.Set(key, value, ttl)
}

// 批量设置时更要注意
func BatchSetWithJitter(cache TTLCache, items map[string]interface{}, baseTTL time.Duration) {
    for key, value := range items {
        SetWithJitter(cache, key, value, baseTTL)
    }
}
```

### 2.6 策略选择指南

不同场景下的策略选择建议：

| 场景 | 推荐策略 | 理由 |
|------|---------|------|
| 通用Web应用 | LRU + TTL | 大多数场景下LRU表现最好，TTL兜底防数据陈旧 |
| 热点数据明显 | LFU | 频率统计能更好地保留热点 |
| 配置/字典数据 | FIFO + TTL | 数据访问模式均匀，简单够用 |
| 时序数据 | TTL only | 按时间自然过期 |
| 防穿透缓存 | LRU + 随机TTL | 随机TTL防止缓存雪崩 |
| 搜索/推荐结果 | LFU + TTL | 用户兴趣有持续性，LFU能捕捉 |
| 实时计算中间结果 | FIFO | 计算有时序性，先进先出符合语义 |

> 选择淘汰策略就像选择投资策略：了解你的"市场"（访问模式），再选你的"策略"（淘汰算法），最后做好"风控"（TTL兜底）。

---

## 三、本地缓存实现——开源实例对比

在生产环境中，如果你需要本地缓存，通常不需要从零实现。Go生态有几个非常优秀的开源本地缓存库。我们先来对比一下主流的三个：BigCache、FreeCache和ristretto。每个库都有自己独特的设计哲学和适用场景。

### 3.1 BigCache——海量key的高吞吐选择

BigCache是Allegro团队开源的高性能缓存库，设计目标是处理海量key的高性能缓存。它的核心设计决策包括：

- **自定义Sharding**：将数据分片到多个map中，减少锁竞争。默认1024个分片。
- **ByteSlice存储**：value统一序列化为[]byte，减少GC压力。Go的GC在扫描map时需要检查每个value，如果value是interface{}类型，GC需要递归扫描，开销很大。用[]byte存储避免了这个问题。
- **FIFO淘汰**：使用改进的FIFO策略，基于环形缓冲区实现。
- **纯内存**：不依赖外部存储，所有数据在进程内存中。

BigCache的分片设计很巧妙。它用hash(key) & (shards-1)来决定分片，因为shards是2的幂，所以这个位运算等价于hash(key) % shards，但更快。每个分片独立加锁，互不影响。

```go
import "github.com/allegro/bigcache/v3"

cache, _ := bigcache.New(context.Background(), bigcache.Config{
    Shards:              1024,              // 分片数，必须是2的幂
    LifeWindow:          10 * time.Minute,  // 全局TTL
    CleanWindow:         5 * time.Minute,   // 清理间隔
    MaxEntriesInWindow:  1000 * 10 * 60,    // 窗口内最大条目数，影响内存预分配
    MaxEntrySize:        500,               // 单条最大字节数
    Verbose:             true,              // 详细日志
    HardMaxCacheSize:    8192,              // 最大缓存大小(MB)
})

// 写入
cache.Set("user:1001", []byte(`{"name":"怕浪猫","role":"dev"}`))

// 读取
entry, _ := cache.Get("user:1001")
fmt.Println(string(entry))

// 删除
cache.Delete("user:1001")

// 获取统计信息
fmt.Println(cache.EntryCount()) // 缓存条目数
```

BigCache的一个隐藏优势是它的迭代器API。你可以遍历所有缓存条目，这在某些场景下非常有用（比如预热、迁移、调试）。

### 3.2 FreeCache——零GC开销的选择

FreeCache的最大特点是零GC开销。它通过预分配一大块连续内存作为环形缓冲区来存储所有缓存数据，Go的GC不会扫描这块内存（因为内部使用的是byte数组存储序列化后的数据，不包含指针）。

这个设计的代价是：所有value必须序列化为[]byte才能存储，读取时也需要反序列化。如果你的value是复杂的Go对象，序列化/反序列化的开销可能抵消零GC带来的收益。

```go
import "github.com/coocood/freecache"

cacheSize := 256 * 1024 * 1024 // 256MB
cache := freecache.NewCache(cacheSize)

// 设置TTL为60秒
cache.Set([]byte("user:1001"), []byte("data"), 60)

// 获取
value, err := cache.Get([]byte("user:1001"))
if err == nil {
    fmt.Println(string(value))
}

// 获取缓存统计
fmt.Println("Entry count:", cache.EntryCount())
fmt.Println("Hit rate:", cache.HitRate())
fmt.Println("Average access time:", cache.AverageAccessTime())
```

FreeCache的底层是一个大字节数组，分为256个segment，每个segment独立维护自己的LRU链表和索引。这种设计既保证了并发性能（256个分片），又控制了GC开销（大数组不含指针）。

### 3.3 ristretto——命中率最优的选择

ristretto是Dgraph团队开发的高性能并发缓存库，它的核心亮点是使用了TinyLFU算法，在保持高命中率的同时控制了内存使用。Dgraph是一个图数据库，对缓存命中率有极高要求，ristretto就是为这个场景设计的。

ristretto的TinyLFU算法是一个两阶段的准入控制机制：
1. 新key先进入一个小容量的Window LRU（约占总容量的1%）
2. 当Window满了，候选key要和主缓存中的victim key比拼频率
3. 只有频率更高的key才能进入主缓存

这种机制有效防止了扫描污染——一次性扫描的大量冷数据不会把真正的热点数据挤出去，因为它们的访问频率无法通过准入控制。

```go
import "github.com/dgraph-io/ristretto/v2"

cache, err := ristretto.NewCache(&ristretto.Config[string, []byte]{
    NumCounters: 1e7,      // key的数量级，用于TinyLFU的Count-Min Sketch
    MaxCost:     1 << 30,   // 最大成本（字节），这里约1GB
    BufferItems: 64,        // 每个分片的缓冲区大小
    Metrics:     true,      // 开启统计
})

// 设置时可以指定cost（用于精细的内存控制）
cache.Set("user:1001", []byte("data"), 1) // cost=1

// ristretto的Set是异步的，需要Wait确保数据被处理
cache.Wait()

value, found := cache.Get("user:1001")
if found {
    fmt.Println(string(value))
}

// 获取统计信息
metrics := cache.Metrics
hits := metrics.Hits()
misses := metrics.Misses()
total := hits + misses
if total > 0 {
    fmt.Printf("命中率: %.2f%%\n", float64(hits)/float64(total)*100)
}
```

ristretto还有一个贴心设计：Set方法支持cost参数。cost可以是任意你定义的"成本"指标——可以是字节数、可以是复杂度权重、也可以就是1。这给了你更灵活的内存控制能力。

### 3.4 三者对比

| 特性 | BigCache | FreeCache | ristretto |
|------|----------|-----------|-----------|
| 淘汰策略 | FIFO | LRU(分segment) | TinyLFU |
| GC影响 | 低（byte切片） | 零（预分配大数组） | 低 |
| 内存控制 | 按MB限制 | 按MB限制 | 按Cost限制 |
| 吞吐量 | 极高 | 高 | 极高 |
| 命中率 | 一般 | 良好 | 最优 |
| 支持TTL | 是 | 是 | 否（需外部实现） |
| 迭代器 | 是 | 是 | 否 |
| 适用场景 | 海量简单key-value | 对GC敏感场景 | 对命中率要求高 |

> 选型就像选武器：BigCache是重机枪（海量吞吐），FreeCache是狙击枪（精准控制GC），ristretto是智能武器（自适应高命中率）。没有绝对的好坏，只有合不合适。

### 3.5 选型决策清单

在实际项目中选型时，可以按以下步骤决策：

**步骤1：确定key数量级**
- 如果超过千万级，BigCache和ristretto更合适，因为它们的分片设计在高并发下表现更好。
- 如果key数量在百万级以内，三个库都可以。

**步骤2：评估GC敏感度**
- 如果服务对GC暂停极其敏感（比如实时交易系统），FreeCache是首选。
- 如果对GC暂停有一定容忍度，BigCache和ristretto的byte切片存储也足够好。

**步骤3：考虑命中率要求**
- 如果业务对缓存命中率有严格要求（命中率差1%可能导致大量请求穿透），ristretto的TinyLFU优势明显。
- 如果命中率要求不苛刻，三个库的差异不大。

**步骤4：评估value大小**
- 如果value较大（KB级），FreeCache的连续内存布局更高效。
- 如果value较小（几十字节），BigCache的分片设计更灵活。

**步骤5：考虑运维成本**
- 三个库的API都很简洁，但ristretto的Metrics最完善。
- 如果需要迭代器功能（遍历所有缓存项），选BigCache或FreeCache。

---

## 四、实现线程安全的LRU Cache

了解了开源方案之后，我们来从零手写一个生产可用的线程安全LRU缓存。这个过程能帮你深刻理解缓存的底层原理。我们不只用容器/list，还要考虑并发安全、内存控制、过期清理等生产级问题。

### 4.1 数据结构设计

LRU的核心数据结构是双向链表+哈希表。Go标准库的`container/list`提供了双向链表实现，我们可以直接使用。

```go
package lru

import (
    "container/list"
    "sync"
    "sync/atomic"
    "time"
)

// Cache 线程安全的LRU缓存
type Cache struct {
    capacity   int           // 最大条目数，0表示不限制
    memorySize int64         // 最大内存(字节)，0表示不限制
    usedMemory int64         // 已用内存
    cache      map[string]*list.Element
    ll         *list.List
    mu         sync.Mutex
    stats      Stats
    onEvicted  func(key string, value Value) // 淘汰回调
}

// Value 接口，让缓存能计算value占用的内存
type Value interface {
    Len() int
}

// entry 缓存条目
type entry struct {
    key      string
    value    Value
    expireAt time.Time // 零值表示永不过期
    size     int       // 条目总大小（key + value）
}

// Stats 缓存统计
type Stats struct {
    HitCount   int64
    MissCount  int64
    EvictCount int64
}

// New 创建LRU缓存
func New(capacity int, memorySize int64) *Cache {
    return &Cache{
        capacity:   capacity,
        memorySize: memorySize,
        cache:      make(map[string]*list.Element),
        ll:         list.New(),
    }
}

// entrySize 计算条目大小
func entrySize(key string, value Value) int {
    return len(key) + value.Len() + 64 // 64字节是entry结构体本身的大致开销
}
```

### 4.2 Get方法的完整实现

```go
// Get 获取缓存值
func (c *Cache) Get(key string) (Value, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()

    if elem, ok := c.cache[key]; ok {
        e := elem.Value.(*entry)
        
        // 检查是否过期
        if !e.expireAt.IsZero() && time.Now().After(e.expireAt) {
            c.removeElement(elem)
            atomic.AddInt64(&c.stats.MissCount, 1)
            return nil, false
        }
        
        // 移动到链表头部（最近使用）
        c.ll.MoveToFront(elem)
        atomic.AddInt64(&c.stats.HitCount, 1)
        return e.value, true
    }
    
    atomic.AddInt64(&c.stats.MissCount, 1)
    return nil, false
}
```

### 4.3 Put方法的完整实现

```go
// Put 写入缓存值，支持TTL
func (c *Cache) Put(key string, value Value, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()

    var expireAt time.Time
    if ttl > 0 {
        expireAt = time.Now().Add(ttl)
    }

    // 如果key已存在，更新值
    if elem, ok := c.cache[key]; ok {
        e := elem.Value.(*entry)
        // 更新内存计数
        oldSize := e.size
        e.value = value
        e.expireAt = expireAt
        e.size = entrySize(key, value)
        c.usedMemory += int64(e.size - oldSize)
        c.ll.MoveToFront(elem)
        
        // 更新后可能需要淘汰
        c.evict()
        return
    }

    // 创建新条目
    size := entrySize(key, value)
    e := &entry{
        key:      key,
        value:    value,
        expireAt: expireAt,
        size:     size,
    }
    elem := c.ll.PushFront(e)
    c.cache[key] = elem
    c.usedMemory += int64(size)

    // 检查是否需要淘汰
    c.evict()
}
```

### 4.4 淘汰逻辑实现

```go
// evict 淘汰多余的缓存
func (c *Cache) evict() {
    for c.ll.Len() > 0 {
        // 检查数量限制
        if c.capacity > 0 && c.ll.Len() <= c.capacity {
            break
        }
        // 检查内存限制
        if c.memorySize > 0 && c.usedMemory <= c.memorySize {
            break
        }
        
        // 从链表尾部淘汰（最久未使用）
        elem := c.ll.Back()
        if elem == nil {
            break
        }
        c.removeElement(elem)
        atomic.AddInt64(&c.stats.EvictCount, 1)
    }
}

// removeElement 移除指定元素
func (c *Cache) removeElement(elem *list.Element) {
    e := elem.Value.(*entry)
    c.ll.Remove(elem)
    delete(c.cache, e.key)
    c.usedMemory -= int64(e.size)
    
    // 如果设置了淘汰回调，执行回调
    if c.onEvicted != nil {
        // 注意：这里在持锁状态下回调，可能造成死锁
        // 生产环境应该异步回调或使用回调队列
        c.onEvicted(e.key, e.value)
    }
}

// Delete 删除指定key
func (c *Cache) Delete(key string) bool {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    if elem, ok := c.cache[key]; ok {
        c.removeElement(elem)
        return true
    }
    return false
}

// Len 返回缓存条目数
func (c *Cache) Len() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.ll.Len()
}

// Clear 清空缓存
func (c *Cache) Clear() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.cache = make(map[string]*list.Element)
    c.ll.Init()
    c.usedMemory = 0
}
```

### 4.5 并发安全——分段锁优化

上面的实现使用了单个`sync.Mutex`，在高并发场景下会成为瓶颈。一个常见的优化方案是分段锁（Sharded Lock），将缓存分成多个分片，每个分片独立加锁。

分段锁的核心思想是：通过增加分片数量来减少每个锁的竞争概率。256个分片意味着理论上锁冲突的概率降低到1/256。但分片也不是越多越好——每个分片都有内存开销和GC压力，通常128到512个分片是比较合理的范围。

```go
package shardedlru

import (
    "hash/fnv"
    "sync"
    "time"
)

const defaultShardCount = 256

// ShardedCache 分段锁LRU缓存
type ShardedCache struct {
    shards []*CacheShard
    hash   func(string) uint32
}

// CacheShard 单个分片
type CacheShard struct {
    capacity int
    cache    map[string]*shardEntry
    mu       sync.Mutex
    usedMemory int64
}

type shardEntry struct {
    value  interface{}
    access int64 // 最近访问时间戳（纳秒）
    size   int
}

// NewShardedCache 创建分段锁缓存
func NewShardedCache(shardCount, shardCapacity int) *ShardedCache {
    if shardCount <= 0 {
        shardCount = defaultShardCount
    }
    // shardCount必须是2的幂，这样可以用位运算代替取模
    if shardCount&(shardCount-1) != 0 {
        panic("shardCount must be power of 2")
    }

    sc := &ShardedCache{
        shards: make([]*CacheShard, shardCount),
        hash:   fnvHash,
    }
    for i := 0; i < shardCount; i++ {
        sc.shards[i] = &CacheShard{
            capacity: shardCapacity,
            cache:    make(map[string]*shardEntry),
        }
    }
    return sc
}

func fnvHash(key string) uint32 {
    h := fnv.New32a()
    h.Write([]byte(key))
    return h.Sum32()
}

// getShard 根据key获取对应分片
// 使用hash(key) & (shardCount - 1)代替hash(key) % shardCount
// 位运算比取模快，但要求shardCount是2的幂
func (sc *ShardedCache) getShard(key string) *CacheShard {
    return sc.shards[sc.hash(key)&(uint32(len(sc.shards)-1))]
}

func (sc *ShardedCache) Get(key string) (interface{}, bool) {
    shard := sc.getShard(key)
    shard.mu.Lock()
    defer shard.mu.Unlock()

    if entry, ok := shard.cache[key]; ok {
        entry.access = time.Now().UnixNano()
        return entry.value, true
    }
    return nil, false
}

func (sc *ShardedCache) Set(key string, value interface{}, size int) {
    shard := sc.getShard(key)
    shard.mu.Lock()
    defer shard.mu.Unlock()

    if e, ok := shard.cache[key]; ok {
        shard.usedMemory += int64(size - e.size)
        e.value = value
        e.access = time.Now().UnixNano()
        e.size = size
        return
    }

    // 检查是否需要淘汰
    if len(shard.cache) >= shard.capacity {
        shard.evict()
    }

    shard.cache[key] = &shardEntry{
        value:  value,
        access: time.Now().UnixNano(),
        size:   size,
    }
    shard.usedMemory += int64(size)
}

// evict 淘汰最久未使用的条目
func (s *CacheShard) evict() {
    var oldestKey string
    var oldestAccess int64 = time.Now().UnixNano()

    for key, entry := range s.cache {
        if entry.access < oldestAccess {
            oldestAccess = entry.access
            oldestKey = key
        }
    }
    
    if oldestKey != "" {
        s.usedMemory -= int64(s.cache[oldestKey].size)
        delete(s.cache, oldestKey)
    }
}

// Stats 获取全局统计
func (sc *ShardedCache) Stats() ShardedStats {
    var total, totalMem int64
    for _, shard := range sc.shards {
        shard.mu.Lock()
        total += int64(len(shard.cache))
        totalMem += shard.usedMemory
        shard.mu.Unlock()
    }
    return ShardedStats{
        TotalEntries:  total,
        TotalMemory:   totalMem,
        ShardCount:    len(sc.shards),
    }
}

type ShardedStats struct {
    TotalEntries int64
    TotalMemory  int64
    ShardCount   int
}
```

> 分段锁是并发编程的经典思想：把一把大锁拆成多把小锁，让冲突概率从"必然"变成"偶然"。这就是为什么很多高性能并发库都采用了分片设计——ConcurrentHashMap、BigCache、ristretto，无一例外。

### 4.6 使用sync.Map的替代方案

对于读多写少的场景，`sync.Map`是一个不错的选择。它内部使用了原子操作和延迟删除机制，在读多写少的场景下性能优于`sync.RWMutex`。

```go
type SyncMapCache struct {
    m        sync.Map
    capacity int
    count    int64
    stats    Stats
}

type syncEntry struct {
    value    interface{}
    expireAt time.Time
    lastUsed int64 // 原子操作更新
}

func (c *SyncMapCache) Get(key string) (interface{}, bool) {
    val, ok := c.m.Load(key)
    if !ok {
        atomic.AddInt64(&c.stats.MissCount, 1)
        return nil, false
    }
    e := val.(*syncEntry)
    
    // 检查过期
    if !e.expireAt.IsZero() && time.Now().After(e.expireAt) {
        c.m.Delete(key)
        atomic.AddInt64(&c.stats.MissCount, 1)
        return nil, false
    }
    
    // 原子更新访问时间
    atomic.StoreInt64(&e.lastUsed, time.Now().UnixNano())
    atomic.AddInt64(&c.stats.HitCount, 1)
    return e.value, true
}

func (c *SyncMapCache) Set(key string, value interface{}, ttl time.Duration) {
    var expireAt time.Time
    if ttl > 0 {
        expireAt = time.Now().Add(ttl)
    }
    e := &syncEntry{
        value:    value,
        expireAt: expireAt,
        lastUsed: time.Now().UnixNano(),
    }
    if _, loaded := c.m.LoadOrStore(key, e); !loaded {
        atomic.AddInt64(&c.count, 1)
        // 异步检查容量
        if atomic.LoadInt64(&c.count) > int64(c.capacity) {
            go c.evict()
        }
    }
}
```

`sync.Map`的缺点是不支持容量控制（没有内置的淘汰机制），需要自己实现淘汰逻辑。而且它的删除是延迟的（标记删除），可能会有短暂的内存占用偏高。另外，`sync.Map`在写多读少的场景下性能反而不如`sync.RWMutex`，因为它内部使用了更复杂的机制（read map + dirty map + 原子操作）。

### 4.7 内存控制与统计

一个生产级的缓存必须有完善的内存控制和统计机制。没有统计的缓存就像一个黑盒，你不知道里面发生了什么，出了问题只能靠猜。

```go
// MemoryController 内存控制器
type MemoryController struct {
    maxMemory    int64
    usedMemory   int64
    mu           sync.RWMutex
}

func (mc *MemoryController) Acquire(size int64) bool {
    mc.mu.Lock()
    defer mc.mu.Unlock()
    if mc.usedMemory+size > mc.maxMemory {
        return false
    }
    mc.usedMemory += size
    return true
}

func (mc *MemoryController) Release(size int64) {
    mc.mu.Lock()
    defer mc.mu.Unlock()
    mc.usedMemory -= size
    if mc.usedMemory < 0 {
        mc.usedMemory = 0
    }
}

func (mc *MemoryController) Usage() (used, max int64, ratio float64) {
    mc.mu.RLock()
    defer mc.mu.RUnlock()
    ratio = float64(mc.usedMemory) / float64(mc.maxMemory)
    return mc.usedMemory, mc.maxMemory, ratio
}

// StatsExporter 统计信息导出
type StatsExporter struct {
    cache *Cache
}

func (se *StatsExporter) Export() map[string]interface{} {
    se.cache.mu.Lock()
    defer se.cache.mu.Unlock()

    total := se.cache.stats.HitCount + se.cache.stats.MissCount
    hitRate := 0.0
    if total > 0 {
        hitRate = float64(se.cache.stats.HitCount) / float64(total)
    }

    return map[string]interface{}{
        "hit_count":    se.cache.stats.HitCount,
        "miss_count":   se.cache.stats.MissCount,
        "hit_rate":     hitRate,
        "evict_count":  se.cache.stats.EvictCount,
        "key_count":    len(se.cache.cache),
        "used_memory":  se.cache.usedMemory,
        "max_memory":   se.cache.memorySize,
        "capacity":     se.cache.capacity,
    }
}

// String 方便打印
func (se *StatsExporter) String() string {
    stats := se.Export()
    return fmt.Sprintf(
        "Cache Stats: hits=%v misses=%v hit_rate=%.2f%% evicts=%v keys=%d memory=%d/%d bytes",
        stats["hit_count"], stats["miss_count"],
        stats["hit_rate"].(float64)*100,
        stats["evict_count"], stats["key_count"],
        stats["used_memory"], stats["max_memory"],
    )
}
```

> 统计不是装饰品，它是缓存的眼睛。没有统计的缓存就像没有仪表盘的汽车，你永远不知道下一秒是加速还是坠毁。

### 4.8 过期清理的优化

上面的实现中，过期key的清理是惰性的（访问时检查）加一个后台定期清理。但定期清理如果遍历所有key，在大缓存下会非常慢。一个优化方案是使用最小堆来存储过期时间，每次只需要检查堆顶元素。

```go
package ttlheap

import (
    "container/heap"
    "sync"
    "time"
)

// ExpiryHeap 过期时间最小堆
type ExpiryHeap struct {
    mu     sync.Mutex
    items  []*heapItem
    keyIdx map[string]int // key在堆中的索引
}

type heapItem struct {
    key       string
    expireAt  time.Time
    index     int
}

func NewExpiryHeap() *ExpiryHeap {
    return &ExpiryHeap{
        keyIdx: make(map[string]int),
    }
}

func (h *ExpiryHeap) Len() int { return len(h.items) }
func (h *ExpiryHeap) Less(i, j int) bool {
    return h.items[i].expireAt.Before(h.items[j].expireAt)
}
func (h *ExpiryHeap) Swap(i, j int) {
    h.items[i], h.items[j] = h.items[j], h.items[i]
    h.items[i].index = i
    h.items[j].index = j
    h.keyIdx[h.items[i].key] = i
    h.keyIdx[h.items[j].key] = j
}
func (h *ExpiryHeap) Push(x interface{}) {
    item := x.(*heapItem)
    item.index = len(h.items)
    h.items = append(h.items, item)
    h.keyIdx[item.key] = item.index
}
func (h *ExpiryHeap) Pop() interface{} {
    old := h.items
    n := len(old)
    item := old[n-1]
    h.items = old[0 : n-1]
    delete(h.keyIdx, item.key)
    return item
}

// Add 添加过期条目
func (h *ExpiryHeap) Add(key string, expireAt time.Time) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if idx, ok := h.keyIdx[key]; ok {
        // 已存在，更新过期时间
        h.items[idx].expireAt = expireAt
        heap.Fix(h, idx)
    } else {
        heap.Push(h, &heapItem{key: key, expireAt: expireAt})
    }
}

// PopExpired 弹出所有已过期的key
func (h *ExpiryHeap) PopExpired(now time.Time) []string {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    var expired []string
    for h.Len() > 0 && h.items[0].expireAt.Before(now) {
        item := heap.Pop(h).(*heapItem)
        expired = append(expired, item.key)
    }
    return expired
}

// Remove 移除指定key
func (h *ExpiryHeap) Remove(key string) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if idx, ok := h.keyIdx[key]; ok {
        heap.Remove(h, idx)
    }
}
```

使用最小堆后，过期清理的时间复杂度从O(n)降到了O(k log n)，其中k是过期的key数量。对于大规模缓存，这个优化非常显著。

---

## 五、Redis协议（RESP）详解

理解Redis协议是手写Redis客户端的基础。Redis使用的是RESP（REdis Serialization Protocol）协议，目前有RESP2和RESP3两个版本。绝大多数客户端使用的是RESP2，我们这里也以RESP2为主。

### 5.1 RESP2协议格式

RESP2定义了5种数据类型，每种类型以不同的字符开头，以`\r\n`结尾。这种设计让协议既人类可读，又容易解析。

- **简单字符串（Simple String）**：以`+`开头，用于返回简单的状态回复
- **错误（Error）**：以`-`开头，用于返回错误信息
- **整数（Integer）**：以`:`开头，用于返回数值
- **批量字符串（Bulk String）**：以`$`开头，后跟字符串长度，用于返回二进制安全的字符串
- **数组（Array）**：以`*`开头，后跟元素个数，用于返回多个值

让我详细解释每种类型：

```
// 简单字符串 - 通常用于状态回复
// 例如SET命令成功返回 +OK
+OK\r\n

// 错误 - 用于返回错误信息
// 第一个词通常是错误类型（ERR, WRONGTYPE, etc.）
-ERR unknown command 'foobar'\r\n
-WRONGTYPE Operation against a key holding the wrong kind of value\r\n

// 整数 - 用于INCR, DECR, EXISTS等命令的返回值
:1000\r\n

// 批量字符串 - 用于GET等命令的返回值
// $后面的数字表示字符串的字节长度
// 注意是字节长度不是字符长度，这对UTF-8编码很重要
$6\r\nfoobar\r\n      // 值为"foobar"，长度6字节
$0\r\n\r\n            // 值为空字符串""，长度0
$-1\r\n               // 值为nil，表示key不存在

// 数组 - 用于LRANGE, KEYS等命令的返回值
// *后面的数字表示元素个数
*2\r\n
$3\r\nfoo\r\n
$3\r\nbar\r\n

// 空数组
*0\r\n

// nil数组
*-1\r\n

// 嵌套数组示例 - 例如SCAN命令的返回值
*2\r\n
$1\r\n0\r\n           // 游标
*2\r\n                // key列表
$3\r\nkey\r\n
$5\r\nkey2\r\n
```

### 5.2 客户端发送命令的格式

客户端发送命令时，使用的是RESP数组格式。比如`SET key value`命令：

```
*3\r\n
$3\r\nSET\r\n
$3\r\nkey\r\n
$5\r\nvalue\r\n
```

解析一下这个格式：
- `*3`表示这是一个包含3个元素的数组
- `$3\r\nSET\r\n`表示第一个元素是长度为3的字符串"SET"
- `$3\r\nkey\r\n`表示第二个元素是长度为3的字符串"key"
- `$5\r\nvalue\r\n`表示第三个元素是长度为5的字符串"value"

多个命令可以放在一个请求中（Pipeline），就是多个RESP数组首尾相连。

### 5.3 RESP协议的Go实现

下面我们用Go实现一个完整的RESP协议解析器，这是手写Redis客户端的核心组件：

```go
package resp

import (
    "bufio"
    "errors"
    "fmt"
    "io"
    "strconv"
)

// 定义RESP类型常量
const (
    TypeSimpleString = '+'
    TypeError        = '-'
    TypeInteger      = ':'
    TypeBulkString   = '$'
    TypeArray        = '*'
)

// Value RESP协议的值
type Value struct {
    Type    byte
    Str     string   // 用于SimpleString, Error, BulkString
    Integer int64    // 用于Integer
    Array   []Value  // 用于Array
    IsNull  bool     // 表示nil值（Bulk String长度为-1或Array长度为-1）
}

// Writer RESP协议写入器
type Writer struct {
    w *bufio.Writer
}

func NewWriter(w io.Writer) *Writer {
    return &Writer{w: bufio.NewWriter(w)}
}

// WriteCommand 写入命令（客户端发送格式）
func (w *Writer) WriteCommand(args ...string) error {
    // 写入数组头：*N\r\n
    if err := w.writeString(fmt.Sprintf("*%d\r\n", len(args))); err != nil {
        return err
    }
    // 写入每个参数：$len\r\narg\r\n
    for _, arg := range args {
        if err := w.writeString(fmt.Sprintf("$%d\r\n", len(arg))); err != nil {
            return err
        }
        if err := w.writeString(arg); err != nil {
            return err
        }
        if err := w.writeString("\r\n"); err != nil {
            return err
        }
    }
    return w.w.Flush()
}

func (w *Writer) writeString(s string) error {
    _, err := w.w.WriteString(s)
    return err
}

// Reader RESP协议读取器
type Reader struct {
    r *bufio.Reader
}

func NewReader(r io.Reader) *Reader {
    return &Reader{r: bufio.NewReader(r)}
}

// ReadValue 读取一个RESP值
func (r *Reader) ReadValue() (Value, error) {
    // 读取第一行
    line, err := r.readLine()
    if err != nil {
        return Value{}, err
    }

    if len(line) == 0 {
        return Value{}, errors.New("empty line")
    }

    t := line[0]      // 第一个字符表示类型
    content := line[1:] // 剩余部分是内容

    switch t {
    case TypeSimpleString:
        // +OK\r\n -> Str = "OK"
        return Value{Type: t, Str: string(content)}, nil
        
    case TypeError:
        // -ERR message\r\n -> Str = "ERR message"
        return Value{Type: t, Str: string(content)}, nil
        
    case TypeInteger:
        // :1000\r\n -> Integer = 1000
        n, err := strconv.ParseInt(string(content), 10, 64)
        if err != nil {
            return Value{}, err
        }
        return Value{Type: t, Integer: n}, nil
        
    case TypeBulkString:
        // $6\r\nfoobar\r\n -> Str = "foobar"
        len, err := strconv.Atoi(string(content))
        if err != nil {
            return Value{}, err
        }
        if len < 0 {
            // $-1\r\n 表示nil
            return Value{Type: t, IsNull: true}, nil
        }
        // 读取len个字节的数据 + 2字节的\r\n
        data := make([]byte, len+2)
        if _, err := io.ReadFull(r.r, data); err != nil {
            return Value{}, err
        }
        return Value{Type: t, Str: string(data[:len])}, nil
        
    case TypeArray:
        // *2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
        count, err := strconv.Atoi(string(content))
        if err != nil {
            return Value{}, err
        }
        if count < 0 {
            // *-1\r\n 表示nil数组
            return Value{Type: t, IsNull: true}, nil
        }
        // 递归读取每个元素
        arr := make([]Value, count)
        for i := 0; i < count; i++ {
            v, err := r.ReadValue()
            if err != nil {
                return Value{}, err
            }
            arr[i] = v
        }
        return Value{Type: t, Array: arr}, nil
        
    default:
        return Value{}, fmt.Errorf("unknown RESP type: %c", t)
    }
}

// readLine 读取一行，去掉末尾的\r\n
// 注意：不能用bufio.ReadString('\n')，因为它会把\r\n都包含在结果中
func (r *Reader) readLine() ([]byte, error) {
    line, err := r.r.ReadBytes('\n')
    if err != nil {
        return nil, err
    }
    // 去掉末尾的\r\n
    if len(line) >= 2 && line[len(line)-2] == '\r' {
        return line[:len(line)-2], nil
    }
    return line[:len(line)-1], nil
}
```

> 协议是客户端和服务端之间的"语言"。不懂协议的程序员，就像不会说当地语言的旅行者——能凑合过，但永远走不深。

### 5.4 RESP协议的边界情况

在实现RESP解析器时，有几个容易踩坑的边界情况：

1. **空字符串vs nil**：`$0\r\n\r\n`表示空字符串""，而`$-1\r\n`表示nil。GET一个不存在的key返回nil，GET一个值为空字符串的key返回空字符串。这两者不能混淆。

2. **整数溢出**：RESP的Integer类型使用int64，但如果Redis返回的数字超过了int64范围（虽然不太可能），解析会失败。

3. **二进制安全**：Bulk String是二进制安全的，可以包含任何字节，包括\r\n。解析时必须按长度读取，不能按行读取。

4. **内联命令**：Redis除了RESP格式，还支持内联命令格式（用于telnet调试）。如果客户端发送了不合法的RESP格式，Redis可能把输入当作内联命令处理，导致难以排查的问题。

---

## 六、Redis连接池设计与实现

每建立一个TCP连接都有成本（三次握手、慢启动等），频繁创建和销毁连接会严重影响性能。连接池通过复用连接来解决这个问题。一个设计良好的连接池可以提升数倍性能。

### 6.1 连接池的核心设计

一个连接池需要解决以下几个问题：
- 连接的创建和回收：什么时候创建新连接，什么时候复用旧连接
- 连接的健康检查：如何判断一个连接是否还可用
- 连接的空闲超时：空闲多久的连接应该被关闭
- 最大连接数限制：防止连接数失控
- 等待队列：当连接数达到上限时，请求需要排队等待

```go
package pool

import (
    "errors"
    "net"
    "sync"
    "sync/atomic"
    "time"
)

// Pool Redis连接池
type Pool struct {
    // 配置
    addr          string
    maxOpen       int           // 最大连接数
    maxIdle       int           // 最大空闲连接数
    idleTimeout   time.Duration // 空闲连接超时
    dialTimeout   time.Duration // 建立连接超时
    healthCheckInterval time.Duration // 健康检查间隔

    // 运行时状态
    mu           sync.Mutex
    idleConns    []*idleConn   // 空闲连接队列（LIFO，后进先出）
    openCount    int           // 已打开的连接总数
    closed       bool
    cond         *sync.Cond    // 条件变量，用于等待连接

    // 统计
    stats PoolStats
}

type idleConn struct {
    conn      net.Conn
    putAt     time.Time // 放回池中的时间
}

type PoolStats struct {
    TotalConns   int64
    IdleConns    int64
    WaitCount    int64
    WaitDuration int64
}

// NewPool 创建连接池
func NewPool(addr string, maxOpen, maxIdle int, idleTimeout, dialTimeout time.Duration) *Pool {
    p := &Pool{
        addr:        addr,
        maxOpen:     maxOpen,
        maxIdle:     maxIdle,
        idleTimeout: idleTimeout,
        dialTimeout: dialTimeout,
    }
    p.cond = sync.NewCond(&p.mu)
    return p
}
```

### 6.2 Get和Put的完整实现

```go
// Get 从连接池获取一个连接
func (p *Pool) Get() (net.Conn, error) {
    p.mu.Lock()

    // 尝试从空闲队列获取（LIFO策略：优先使用最近归还的连接）
    for len(p.idleConns) > 0 {
        ic := p.idleConns[len(p.idleConns)-1]
        p.idleConns = p.idleConns[:len(p.idleConns)-1]
        
        // 检查空闲连接是否超时
        if p.idleTimeout > 0 && time.Since(ic.putAt) > p.idleTimeout {
            p.mu.Unlock()
            ic.conn.Close()
            p.mu.Lock()
            p.openCount--
            continue
        }
        
        p.mu.Unlock()
        
        // 健康检查：验证连接是否可用
        if !isConnHealthy(ic.conn) {
            p.mu.Lock()
            p.openCount--
            p.cond.Signal()
            p.mu.Unlock()
            ic.conn.Close()
            continue
        }
        
        atomic.AddInt64(&p.stats.TotalConns, 1)
        return ic.conn, nil
    }
    
    // 没有空闲连接，尝试创建新连接
    if p.maxOpen > 0 && p.openCount >= p.maxOpen {
        // 达到最大连接数，需要等待
        atomic.AddInt64(&p.stats.WaitCount, 1)
        startWait := time.Now()
        
        for p.openCount >= p.maxOpen && !p.closed {
            p.cond.Wait()
        }
        
        waitDuration := time.Since(startWait)
        atomic.AddInt64(&p.stats.WaitDuration, int64(waitDuration))
        
        if p.closed {
            p.mu.Unlock()
            return nil, errors.New("connection pool is closed")
        }
    }
    
    p.openCount++
    p.mu.Unlock()
    
    // 建立新连接（在锁外执行，避免阻塞其他goroutine）
    conn, err := net.DialTimeout("tcp", p.addr, p.dialTimeout)
    if err != nil {
        p.mu.Lock()
        p.openCount--
        p.cond.Signal()
        p.mu.Unlock()
        return nil, err
    }
    
    // 设置TCP keepalive，防止连接被中间设备断开
    if tcpConn, ok := conn.(*net.TCPConn); ok {
        tcpConn.SetKeepAlive(true)
        tcpConn.SetKeepAlivePeriod(30 * time.Second)
    }
    
    atomic.AddInt64(&p.stats.TotalConns, 1)
    return conn, nil
}

// Put 将连接放回连接池
func (p *Pool) Put(conn net.Conn) {
    p.mu.Lock()
    defer p.mu.Unlock()
    
    if p.closed {
        conn.Close()
        p.openCount--
        p.cond.Signal()
        return
    }
    
    // 如果空闲队列已满，直接关闭连接
    if len(p.idleConns) >= p.maxIdle {
        conn.Close()
        p.openCount--
        p.cond.Signal()
        return
    }
    
    p.idleConns = append(p.idleConns, &idleConn{
        conn:  conn,
        putAt: time.Now(),
    })
    // 通知等待的goroutine有连接可用
    p.cond.Signal()
}
```

连接池使用LIFO（后进先出）策略来管理空闲连接。这意味着最近归还的连接会优先被复用。这样做的好处是：最近使用的连接更有可能还处于活跃状态（TCP连接还没被服务端或中间设备断开），而且LIFO能让一部分连接自然超时被关闭，减少不必要的连接保持。

> 连接池的本质是一个资源的"租赁市场"：借出、归还、维护、淘汰。好的连接池就像好的物业管理——住户无感知，但一切井井有条。

### 6.3 健康检查的实现

健康检查是连接池中容易被忽视但非常重要的部分。一个连接在空闲期间可能因为各种原因失效：网络抖动、Redis重启、防火墙超时等。如果不做健康检查，使用一个已经失效的连接会导致请求失败。

```go
// isConnHealthy 检查连接是否健康
// 通过设置一个很短的读超时来检测连接是否可用
// 如果连接已经关闭，Read会立即返回错误
// 如果连接正常，Read会超时返回（因为服务端没有数据发送）
func isConnHealthy(conn net.Conn) bool {
    // 设置1毫秒的读超时
    conn.SetReadDeadline(time.Now().Add(1 * time.Millisecond))
    defer conn.SetReadDeadline(time.Time{}) // 重置超时
    
    buf := make([]byte, 1)
    _, err := conn.Read(buf)
    
    // 超时错误说明连接正常（没有数据可读，但连接没有断开）
    // nil或其它错误说明连接可能有问题
    return err == nil || isTimeout(err)
}

func isTimeout(err error) bool {
    type timeout interface {
        Timeout() bool
    }
    if t, ok := err.(timeout); ok {
        return t.Timeout()
    }
    return false
}
```

### 6.4 连接池参数调优指南

连接池的参数调优直接影响性能。以下是关键参数的调优建议：

1. **maxOpen（最大连接数）**：不是越大越好。每个连接都会占用内存（约4-8KB的发送/接收缓冲区），连接太多会增加CPU上下文切换开销。经验值：CPU核心数 * 2 到 CPU核心数 * 8。对于Redis来说，因为是单线程处理命令，连接数太多反而会增加Redis的调度开销。

2. **maxIdle（最大空闲连接数）**：应该接近maxOpen，避免频繁创建销毁连接。通常设置为maxOpen的50%-80%。

3. **idleTimeout（空闲超时）**：太短会导致频繁重建连接，太长会占用服务端连接资源。建议5-10分钟。

4. **dialTimeout（连接超时）**：建议3-5秒。太长会导致请求堆积，太短可能在网络抖动时无法建立连接。

```go
// 推荐的连接池配置（中等规模应用）
config := PoolConfig{
    Addr:        "127.0.0.1:6379",
    MaxOpen:     50,                    // 中等规模应用
    MaxIdle:     30,                    // 60%的MaxOpen
    IdleTimeout: 5 * time.Minute,       // 5分钟空闲超时
    DialTimeout: 3 * time.Second,       // 3秒连接超时
    HealthCheckInterval: 30 * time.Second, // 每30秒健康检查
}

// 高并发场景
highConcurrencyConfig := PoolConfig{
    Addr:        "127.0.0.1:6379",
    MaxOpen:     200,                   // 更大的连接池
    MaxIdle:     150,                   // 75%的MaxOpen
    IdleTimeout: 3 * time.Minute,       // 更短的空闲超时
    DialTimeout: 2 * time.Second,       // 更快的连接超时
}
```

> 连接池参数调优不是一次性的工作，而是持续的性能优化过程。上线后要持续监控连接池的等待时间、命中率等指标，根据实际情况调整。

---

## 七、Pipeline批量操作

Pipeline是Redis客户端的重要优化手段。正常情况下，每执行一条命令需要一次网络往返（RTT）。Pipeline允许将多条命令打包发送，然后一次性接收所有响应，将N次RTT减少为1次。

### 7.1 Pipeline的性能优势

假设单次RTT为1ms，执行100条命令：
- 逐条执行：100 * (1ms RTT + 0.01ms 命令执行) = 101ms
- Pipeline：1ms RTT + 100 * 0.01ms 命令执行 = 2ms

性能提升约50倍。当然实际提升取决于网络环境和命令复杂度，但数量级的提升是肯定的。

```go
// 逐条执行（不使用Pipeline）
func SetWithoutPipeline(client *Client, items map[string]string) error {
    for key, value := range items {
        if err := client.Set(key, value); err != nil {
            return err
        }
    }
    return nil
}

// 使用Pipeline执行
func SetWithPipeline(client *Client, items map[string]string) error {
    pipe := client.Pipeline()
    for key, value := range items {
        pipe.Add("SET", key, value)
    }
    results, err := pipe.Exec()
    if err != nil {
        return err
    }
    // 检查每条命令的结果
    for _, r := range results {
        if r.Err != nil {
            return r.Err
        }
    }
    return nil
}
```

### 7.2 Pipeline的实现原理

Pipeline的核心原理是：
1. 客户端将多条命令的RESP格式数据写入发送缓冲区，但不立即flush
2. 所有命令写入完成后，一次性flush到网络
3. 然后依次读取所有响应

这利用了TCP的流式传输特性——多条命令的数据可以打包在一个TCP包中发送，减少了网络包的数量和RTT次数。

```go
package pipeline

import (
    "bufio"
    "fmt"
    "net"
    "sync"
)

// Pipeline 批量命令执行器
type Pipeline struct {
    conn    net.Conn
    writer  *bufio.Writer
    reader  *bufio.Reader
    cmds    []*Command
    mu      sync.Mutex
}

// Command 单条命令
type Command struct {
    Args []string
}

// Result 命令执行结果
type Result struct {
    Value interface{}
    Err   error
}

func NewPipeline(conn net.Conn) *Pipeline {
    return &Pipeline{
        conn:   conn,
        writer: bufio.NewWriter(conn),
        reader: bufio.NewReader(conn),
    }
}

// Add 添加命令到pipeline
func (p *Pipeline) Add(args ...string) {
    p.mu.Lock()
    defer p.mu.Unlock()
    p.cmds = append(p.cmds, &Command{Args: args})
}

// Exec 执行所有命令并返回结果
func (p *Pipeline) Exec() ([]*Result, error) {
    p.mu.Lock()
    defer p.mu.Unlock()
    
    if len(p.cmds) == 0 {
        return nil, nil
    }

    // 第一阶段：写入所有命令到缓冲区
    for _, cmd := range p.cmds {
        if err := p.writeCommand(cmd); err != nil {
            return nil, err
        }
    }
    
    // 一次性flush到网络
    if err := p.writer.Flush(); err != nil {
        return nil, err
    }
    
    // 第二阶段：依次读取所有响应
    results := make([]*Result, len(p.cmds))
    respReader := NewReader(p.reader)
    
    for i := range p.cmds {
        val, err := respReader.ReadValue()
        if err != nil {
            return results, err
        }
        results[i] = parseResult(val)
    }
    
    // 清空命令队列，准备下一次Pipeline
    p.cmds = p.cmds[:0]
    return results, nil
}

func (p *Pipeline) writeCommand(cmd *Command) error {
    // 写入数组头
    if _, err := fmt.Fprintf(p.writer, "*%d\r\n", len(cmd.Args)); err != nil {
        return err
    }
    // 写入每个参数
    for _, arg := range cmd.Args {
        if _, err := fmt.Fprintf(p.writer, "$%d\r\n%s\r\n", len(arg), arg); err != nil {
            return err
        }
    }
    return nil
}

func parseResult(v Value) *Result {
    switch v.Type {
    case TypeError:
        return &Result{Err: fmt.Errorf("%s", v.Str)}
    case TypeSimpleString, TypeBulkString:
        return &Result{Value: v.Str}
    case TypeInteger:
        return &Result{Value: v.Integer}
    case TypeArray:
        arr := make([]interface{}, len(v.Array))
        for i, item := range v.Array {
            arr[i] = item.Str
        }
        return &Result{Value: arr}
    default:
        return &Result{Value: nil}
    }
}
```

### 7.3 Pipeline的最佳实践

```go
// 实践1：分批Pipeline，避免单次命令过多
// 一次性发送太多命令会导致Redis的输出缓冲区占用过多内存
func BatchSet(pipe *Pipeline, keys, values []string, batchSize int) error {
    for i := 0; i < len(keys); i += batchSize {
        end := i + batchSize
        if end > len(keys) {
            end = len(keys)
        }
        
        for j := i; j < end; j++ {
            pipe.Add("SET", keys[j], values[j])
        }
        
        results, err := pipe.Exec()
        if err != nil {
            return err
        }
        
        // 检查每条命令的结果
        for _, r := range results {
            if r.Err != nil {
                return r.Err
            }
        }
    }
    return nil
}

// 实践2：Pipeline批量读取
func BatchGet(pipe *Pipeline, keys []string) ([][]byte, error) {
    // 使用MGET比Pipeline多个GET更高效
    // 因为MGET是一个命令，只有一次解析开销
    args := append([]string{"MGET"}, keys...)
    pipe.Add(args...)
    
    results, err := pipe.Exec()
    if err != nil {
        return nil, err
    }
    
    if len(results) != 1 {
        return nil, fmt.Errorf("unexpected result count: %d", len(results))
    }
    
    arr, ok := results[0].Value.([]interface{})
    if !ok {
        return nil, fmt.Errorf("unexpected result type")
    }
    
    res := make([][]byte, len(arr))
    for i, v := range arr {
        if s, ok := v.(string); ok {
            res[i] = []byte(s)
        }
    }
    return res, nil
}

// 实践3：Pipeline + 事务的组合使用
func TransferFunds(pipe *Pipeline, fromAccount, toAccount string, amount int) error {
    // 使用Pipeline发送MULTI/EXEC事务
    pipe.Add("MULTI")
    pipe.Add("DECRBY", fromAccount, fmt.Sprintf("%d", amount))
    pipe.Add("INCRBY", toAccount, fmt.Sprintf("%d", amount))
    pipe.Add("EXEC")
    
    results, err := pipe.Exec()
    if err != nil {
        return err
    }
    
    // MULTI返回OK
    // DECRBY和INCRBY返回QUEUED
    // EXEC返回事务执行结果
    if len(results) != 4 {
        return fmt.Errorf("unexpected result count")
    }
    
    // 检查EXEC的结果
    execResult := results[3]
    if execResult.Err != nil {
        return execResult.Err
    }
    
    return nil
}
```

> Pipeline就像超市购物车：一件一件去收银台结账（逐条执行）和一车推过去一次结账（Pipeline）的区别。聪明的购物者总是选择后者。

### 7.4 Pipeline的注意事项

Pipeline虽然强大，但有几个坑需要注意：

1. **Pipeline不是原子的**：Pipeline中的命令之间可能插入了其他客户端的命令。如果需要原子性，应该用MULTI/EXEC事务或Lua脚本。

2. **单次Pipeline命令不宜过多**：如果一次Pipeline发送了上万条命令，会导致Redis的输出缓冲区占用过多内存，可能触发客户端输出缓冲区限制，甚至被Redis主动断开连接。建议每批500-1000条。

3. **Pipeline不保证顺序执行**：虽然Redis是单线程的，命令会按顺序执行，但如果Pipeline中某条命令执行失败，后续命令仍然会执行。需要检查每条命令的结果。

4. **Pipeline中的命令不要依赖前一条命令的结果**：因为所有命令是一次性发送的，你无法在Pipeline中间获取前一条命令的结果来做判断。如果需要这种依赖，应该用Lua脚本。

5. **注意内存使用**：Pipeline在客户端会缓存所有命令的响应，如果一次Pipeline执行了大量命令，客户端的内存占用会突增。

---

## 八、发布订阅模式实现

Redis的发布订阅（Pub/Sub）模式是一种消息通信模式：发送者（Publisher）发送消息到频道（Channel），订阅者（Subscriber）订阅频道接收消息。这是一种解耦生产者和消费者的经典模式。

### 8.1 Pub/Sub的基本原理

Redis Pub/Sub的核心命令：
- `SUBSCRIBE channel [channel ...]`：订阅一个或多个频道
- `UNSUBSCRIBE [channel ...]`：取消订阅
- `PUBLISH channel message`：向频道发布消息
- `PSUBSCRIBE pattern [pattern ...]`：按模式订阅（支持glob通配符）

订阅后，Redis会在该连接上持续推送消息。这意味着订阅连接不能用于执行普通命令（这是很多人的困惑点）。如果你想在订阅的同时执行其他命令，需要使用单独的连接。

### 8.2 Pub/Sub消息格式

当有消息发布到已订阅的频道时，Redis会推送如下格式的消息：

```
// 普通订阅的消息格式
*3\r\n
$7\r\nmessage\r\n      // 消息类型
$7\r\nchannel\r\n      // 频道名
$5\r\nhello\r\n         // 消息内容

// 模式订阅的消息格式
*4\r\n
$8\r\npmessage\r\n     // 消息类型
$5\r\nnews.*\r\n        // 匹配的模式
$4\r\nnews\r\n          // 实际频道名
$5\r\nhello\r\n         // 消息内容

// 订阅确认
*3\r\n
$9\r\nsubscribe\r\n    // 消息类型
$7\r\nchannel\r\n       // 频道名
:1\r\n                  // 当前订阅总数
```

### 8.3 Go实现Pub/Sub客户端

```go
package pubsub

import (
    "bufio"
    "errors"
    "fmt"
    "net"
    "sync"
    "time"
)

// Message 订阅消息
type Message struct {
    Channel string
    Pattern string // 模式订阅时非空
    Data    string
}

// Client Pub/Sub客户端
type Client struct {
    conn       net.Conn
    reader     *bufio.Reader
    writer     *bufio.Writer
    mu         sync.Mutex
    
    // 订阅管理
    channels   map[string]bool
    patterns   map[string]bool
    
    // 消息处理
    onMessage  func(Message)
    
    // 生命周期
    done       chan struct{}
    closed     bool
    closeMu    sync.Mutex
    
    // 重连
    addr       string
    autoReconnect bool
}

// NewClient 创建Pub/Sub客户端
func NewClient(addr string) (*Client, error) {
    conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
    if err != nil {
        return nil, err
    }
    
    c := &Client{
        conn:     conn,
        addr:     addr,
        reader:   bufio.NewReader(conn),
        writer:   bufio.NewWriter(conn),
        channels: make(map[string]bool),
        patterns: make(map[string]bool),
        done:     make(chan struct{}),
        autoReconnect: true,
    }
    return c, nil
}

// Subscribe 订阅频道
func (c *Client) Subscribe(channels ...string) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    args := append([]string{"SUBSCRIBE"}, channels...)
    if err := c.writeCommand(args); err != nil {
        return err
    }
    
    // 读取订阅确认
    for range channels {
        val, err := c.readValue()
        if err != nil {
            return err
        }
        if val.Type == TypeError {
            return fmt.Errorf("subscribe error: %s", val.Str)
        }
    }
    
    for _, ch := range channels {
        c.channels[ch] = true
    }
    return nil
}

// PSubscribe 模式订阅
func (c *Client) PSubscribe(patterns ...string) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    args := append([]string{"PSUBSCRIBE"}, patterns...)
    if err := c.writeCommand(args); err != nil {
        return err
    }
    
    for range patterns {
        val, err := c.readValue()
        if err != nil {
            return err
        }
        if val.Type == TypeError {
            return fmt.Errorf("psubscribe error: %s", val.Str)
        }
    }
    
    for _, p := range patterns {
        c.patterns[p] = true
    }
    return nil
}

// Unsubscribe 取消订阅
func (c *Client) Unsubscribe(channels ...string) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    args := append([]string{"UNSUBSCRIBE"}, channels...)
    if err := c.writeCommand(args); err != nil {
        return err
    }
    for _, ch := range channels {
        delete(c.channels, ch)
    }
    return nil
}

// Publish 发布消息（需要在非订阅连接上执行）
func (c *Client) Publish(channel, message string) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    if err := c.writeCommand([]string{"PUBLISH", channel, message}); err != nil {
        return err
    }
    
    val, err := c.readValue()
    if err != nil {
        return err
    }
    if val.Type == TypeError {
        return fmt.Errorf("publish error: %s", val.Str)
    }
    return nil
}

// OnMessage 设置消息回调
func (c *Client) OnMessage(handler func(Message)) {
    c.onMessage = handler
}

// Start 启动消息接收循环
func (c *Client) Start() {
    go c.receiveLoop()
}

func (c *Client) receiveLoop() {
    for {
        select {
        case <-c.done:
            return
        default:
        }
        
        val, err := c.readValue()
        if err != nil {
            c.closeMu.Lock()
            if c.closed {
                c.closeMu.Unlock()
                return
            }
            c.closeMu.Unlock()
            
            // 自动重连
            if c.autoReconnect {
                time.Sleep(time.Second)
                if err := c.reconnect(); err != nil {
                    time.Sleep(3 * time.Second)
                    continue
                }
                continue
            }
            continue
        }
        
        // 解析Pub/Sub消息
        if val.Type != TypeArray || len(val.Array) < 3 {
            continue
        }
        
        msgType := val.Array[0].Str
        switch msgType {
        case "message":
            // 普通订阅消息: ["message", channel, data]
            msg := Message{
                Channel: val.Array[1].Str,
                Data:    val.Array[2].Str,
            }
            if c.onMessage != nil {
                c.onMessage(msg)
            }
        case "pmessage":
            // 模式订阅消息: ["pmessage", pattern, channel, data]
            if len(val.Array) < 4 {
                continue
            }
            msg := Message{
                Pattern: val.Array[1].Str,
                Channel: val.Array[2].Str,
                Data:    val.Array[3].Str,
            }
            if c.onMessage != nil {
                c.onMessage(msg)
            }
        case "subscribe", "unsubscribe", "psubscribe", "punsubscribe":
            // 订阅/取消订阅确认，忽略
            continue
        }
    }
}

// reconnect 重连
func (c *Client) reconnect() error {
    conn, err := net.DialTimeout("tcp", c.addr, 5*time.Second)
    if err != nil {
        return err
    }
    
    c.mu.Lock()
    c.conn = conn
    c.reader = bufio.NewReader(conn)
    c.writer = bufio.NewWriter(conn)
    
    // 重新订阅之前的频道
    if len(c.channels) > 0 {
        channels := make([]string, 0, len(c.channels))
        for ch := range c.channels {
            channels = append(channels, ch)
        }
        args := append([]string{"SUBSCRIBE"}, channels...)
        c.writeCommand(args)
        // 读取确认
        for range channels {
            c.readValue()
        }
    }
    
    if len(c.patterns) > 0 {
        patterns := make([]string, 0, len(c.patterns))
        for p := range c.patterns {
            patterns = append(patterns, p)
        }
        args := append([]string{"PSUBSCRIBE"}, patterns...)
        c.writeCommand(args)
        for range patterns {
            c.readValue()
        }
    }
    c.mu.Unlock()
    
    return nil
}

// Close 关闭客户端
func (c *Client) Close() error {
    c.closeMu.Lock()
    defer c.closeMu.Unlock()
    
    if c.closed {
        return nil
    }
    c.closed = true
    close(c.done)
    return c.conn.Close()
}

func (c *Client) writeCommand(args []string) error {
    if _, err := fmt.Fprintf(c.writer, "*%d\r\n", len(args)); err != nil {
        return err
    }
    for _, arg := range args {
        if _, err := fmt.Fprintf(c.writer, "$%d\r\n%s\r\n", len(arg), arg); err != nil {
            return err
        }
    }
    return c.writer.Flush()
}

func (c *Client) readValue() (Value, error) {
    return ReadValue(c.reader)
}
```

### 8.4 使用示例

```go
func pubsubExample() {
    // 创建订阅者
    subscriber, err := NewClient("127.0.0.1:6379")
    if err != nil {
        panic(err)
    }
    defer subscriber.Close()
    
    // 设置消息处理器
    msgChan := make(chan Message, 100)
    subscriber.OnMessage(func(msg Message) {
        msgChan <- msg
    })
    
    // 订阅频道
    if err := subscriber.Subscribe("news", "alerts", "updates"); err != nil {
        panic(err)
    }
    
    // 模式订阅
    if err := subscriber.PSubscribe("user.*"); err != nil {
        panic(err)
    }
    
    // 启动接收循环
    subscriber.Start()
    
    // 创建发布者（使用另一个连接）
    publisher, err := NewClient("127.0.0.1:6379")
    if err != nil {
        panic(err)
    }
    defer publisher.Close()
    
    // 发布消息
    publisher.Publish("news", "怕浪猫发布了新文章")
    publisher.Publish("alerts", "系统告警：CPU使用率超过80%")
    publisher.Publish("user.1001", "用户1001上线")
    
    // 处理接收到的消息
    for msg := range msgChan {
        if msg.Pattern != "" {
            fmt.Printf("[pattern=%s channel=%s] %s\n", 
                msg.Pattern, msg.Channel, msg.Data)
        } else {
            fmt.Printf("[%s] %s\n", msg.Channel, msg.Data)
        }
    }
}
```

> Pub/Sub是Redis中最简单的消息模式，但也是最容易被滥用的。它没有消息持久化、没有消费确认、没有回溯能力。用它做实时通知很好，用它做任务队列就是在给自己埋雷。

### 8.5 Pub/Sub的局限性

必须清楚Pub/Sub的几个关键限制：

1. **消息不持久化**：如果订阅者断线，断线期间的消息会全部丢失。Redis不会为Pub/Sub消息做任何持久化。这是和消息队列（如Kafka、RabbitMQ）最大的区别。

2. **Fire and Forget**：Redis只负责把消息推给当前在线的订阅者，没有ACK机制。如果订阅者处理失败，消息就丢了。没有重试机制，没有死信队列。

3. **连接独占**：一个连接订阅了频道后，就只能接收推送消息，不能执行普通命令（除非在同一个连接上先UNSUBSCRIBE）。这意味着如果你想在订阅的同时执行其他Redis命令，需要使用两个连接。

4. **无负载均衡**：如果多个订阅者订阅了同一个频道，每个订阅者都会收到所有消息。这不是消息队列的竞争消费模式。如果你需要负载均衡，每个消费者需要订阅不同的频道，或者使用Redis Streams。

5. **消息堆积风险**：如果订阅者处理速度跟不上发布速度，Redis的输出缓冲区会不断增长。当超过`client-output-buffer-limit`配置时，Redis会主动断开订阅者连接。

如果需要消息队列的语义（持久化、ACK、负载均衡），应该使用Redis Streams而不是Pub/Sub。Redis Streams提供了消息持久化、消费组、ACK确认等消息队列的核心功能，更适合做可靠的消息通信。Streams的消息可以被多个消费者通过消费组实现竞争消费，消息处理失败可以重新投递，消息可以被回溯读取。这些是Pub/Sub完全不具备的能力。

在实际项目中，我见过不少团队用Pub/Sub来做任务分发的案例，最终都遇到了消息丢失的问题。正确的做法是：实时通知用Pub/Sub，可靠投递用Streams，外部消息队列用Kafka或RabbitMQ。每种方案都有它适用的场景，不要拿锤子当螺丝刀用。

---

## 九、实现轻量级Redis客户端

把前面的RESP协议解析器、连接池、Pipeline和Pub/Sub整合起来，我们就可以实现一个轻量级的Redis客户端了。这个客户端虽然不如go-redis或redigo功能完善，但足够展示Redis客户端的核心原理。

### 9.1 客户端整体架构

```go
package miniredis

import (
    "context"
    "errors"
    "fmt"
    "net"
    "sync"
    "sync/atomic"
    "time"
)

// Client Redis客户端
type Client struct {
    pool        *Pool
    config      *Config
    
    // 统计
    mu          sync.Mutex
    stats       ClientStats
}

// Config 客户端配置
type Config struct {
    Addr          string
    Password      string
    DB            int
    MaxOpen       int
    MaxIdle       int
    IdleTimeout   time.Duration
    DialTimeout   time.Duration
    ReadTimeout   time.Duration
    WriteTimeout  time.Duration
    MaxRetries    int
    RetryDelay    time.Duration
}

// DefaultConfig 默认配置
func DefaultConfig(addr string) *Config {
    return &Config{
        Addr:         addr,
        MaxOpen:      20,
        MaxIdle:      10,
        IdleTimeout:  5 * time.Minute,
        DialTimeout:  3 * time.Second,
        ReadTimeout:  3 * time.Second,
        WriteTimeout: 3 * time.Second,
        MaxRetries:   3,
        RetryDelay:   100 * time.Millisecond,
    }
}

// ClientStats 客户端统计
type ClientStats struct {
    TotalCommands int64
    SuccessCount  int64
    ErrorCount    int64
    TotalLatency  int64 // 纳秒
    PoolStats     PoolStats
}

// NewClient 创建Redis客户端
func NewClient(config *Config) (*Client, error) {
    pool := NewPool(config.Addr, config.MaxOpen, config.MaxIdle, 
        config.IdleTimeout, config.DialTimeout)
    
    c := &Client{
        pool:   pool,
        config: config,
    }
    return c, nil
}

// Close 关闭客户端
func (c *Client) Close() error {
    return c.pool.Close()
}
```

### 9.2 命令执行核心——带重试和超时

```go
// Do 执行命令
func (c *Client) Do(args ...string) (interface{}, error) {
    return c.DoContext(context.Background(), args...)
}

// DoContext 带context的命令执行
func (c *Client) DoContext(ctx context.Context, args ...string) (interface{}, error) {
    if len(args) == 0 {
        return nil, errors.New("no command specified")
    }
    
    var lastErr error
    
    for attempt := 0; attempt <= c.config.MaxRetries; attempt++ {
        // 检查context是否取消
        if err := ctx.Err(); err != nil {
            return nil, err
        }
        
        start := time.Now()
        
        // 获取连接
        conn, err := c.getConn(ctx)
        if err != nil {
            lastErr = err
            if attempt < c.config.MaxRetries {
                time.Sleep(c.config.RetryDelay)
                continue
            }
            break
        }
        
        // 设置超时
        if c.config.ReadTimeout > 0 {
            conn.conn.SetReadDeadline(time.Now().Add(c.config.ReadTimeout))
        }
        if c.config.WriteTimeout > 0 {
            conn.conn.SetWriteDeadline(time.Now().Add(c.config.WriteTimeout))
        }
        
        // 执行命令
        result, err := c.executeCommand(conn, args)
        latency := time.Since(start)
        
        c.recordCommand(latency, err == nil)
        
        if err != nil {
            lastErr = err
            // 判断是否需要重试
            if isRetryableError(err) && attempt < c.config.MaxRetries {
                conn.close()
                time.Sleep(c.config.RetryDelay)
                continue
            }
            conn.close()
            return nil, err
        }
        
        // 归还连接
        c.putConn(conn)
        return result, nil
    }
    
    return nil, fmt.Errorf("after %d retries: %w", c.config.MaxRetries, lastErr)
}

func (c *Client) executeCommand(conn *Conn, args []string) (interface{}, error) {
    // 写入命令
    if err := conn.writeCommand(args); err != nil {
        return nil, err
    }
    
    // 读取响应
    val, err := conn.readResponse()
    if err != nil {
        return nil, err
    }
    
    // 解析响应
    return parseResponse(val)
}

func (c *Client) getConn(ctx context.Context) (*Conn, error) {
    rawConn, err := c.pool.Get()
    if err != nil {
        return nil, err
    }
    
    conn := &Conn{
        conn:   rawConn,
        reader: bufio.NewReader(rawConn),
        writer: bufio.NewWriter(rawConn),
        pool:   c.pool,
    }
    
    // 认证
    if c.config.Password != "" {
        if err := conn.auth(c.config.Password); err != nil {
            conn.close()
            return nil, err
        }
    }
    
    // 选库
    if c.config.DB > 0 {
        if err := conn.selectDB(c.config.DB); err != nil {
            conn.close()
            return nil, err
        }
    }
    
    return conn, nil
}

func (c *Client) putConn(conn *Conn) {
    c.pool.Put(conn.conn)
}

func (c *Client) recordCommand(latency time.Duration, success bool) {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    c.stats.TotalCommands++
    c.stats.TotalLatency += latency.Nanoseconds()
    if success {
        c.stats.SuccessCount++
    } else {
        c.stats.ErrorCount++
    }
}

func isRetryableError(err error) bool {
    var netErr net.Error
    if errors.As(err, &netErr) {
        return true
    }
    if errors.Is(err, net.ErrClosed) {
        return true
    }
    if errors.Is(err, io.EOF) {
        return true
    }
    return false
}

func parseResponse(v Value) (interface{}, error) {
    switch v.Type {
    case TypeError:
        return nil, fmt.Errorf("%s", v.Str)
    case TypeSimpleString, TypeBulkString:
        if v.IsNull {
            return nil, nil
        }
        return v.Str, nil
    case TypeInteger:
        return v.Integer, nil
    case TypeArray:
        if v.IsNull {
            return nil, nil
        }
        arr := make([]interface{}, len(v.Array))
        for i, item := range v.Array {
            arr[i], _ = parseResponse(item)
        }
        return arr, nil
    default:
        return nil, fmt.Errorf("unknown response type: %c", v.Type)
    }
}
```

### 9.3 连接的认证和选库

```go
type Conn struct {
    conn   net.Conn
    reader *bufio.Reader
    writer *bufio.Writer
    pool   *Pool
}

func (c *Conn) auth(password string) error {
    if err := c.writeCommand([]string{"AUTH", password}); err != nil {
        return err
    }
    val, err := c.readResponse()
    if err != nil {
        return err
    }
    if val.Type == TypeError {
        return fmt.Errorf("auth failed: %s", val.Str)
    }
    return nil
}

func (c *Conn) selectDB(db int) error {
    if err := c.writeCommand([]string{"SELECT", fmt.Sprintf("%d", db)}); err != nil {
        return err
    }
    val, err := c.readResponse()
    if err != nil {
        return err
    }
    if val.Type == TypeError {
        return fmt.Errorf("select db failed: %s", val.Str)
    }
    return nil
}

func (c *Conn) writeCommand(args []string) error {
    if _, err := fmt.Fprintf(c.writer, "*%d\r\n", len(args)); err != nil {
        return err
    }
    for _, arg := range args {
        if _, err := fmt.Fprintf(c.writer, "$%d\r\n%s\r\n", len(arg), arg); err != nil {
            return err
        }
    }
    return c.writer.Flush()
}

func (c *Conn) readResponse() (Value, error) {
    return ReadValue(c.reader)
}

func (c *Conn) close() {
    c.conn.Close()
}
```

### 9.4 高层API封装

为了让客户端更易用，我们封装一组高层API，覆盖String、List、Hash、Set、ZSet等常用数据类型：

```go
// ============ String操作 ============

func (c *Client) Set(key, value string) error {
    _, err := c.Do("SET", key, value)
    return err
}

func (c *Client) SetEx(key, value string, ttl time.Duration) error {
    _, err := c.Do("SET", key, value, "EX", fmt.Sprintf("%d", int(ttl.Seconds())))
    return err
}

func (c *Client) SetNX(key, value string, ttl time.Duration) (bool, error) {
    var args []string
    if ttl > 0 {
        args = []string{"SET", key, value, "NX", "EX", fmt.Sprintf("%d", int(ttl.Seconds()))}
    } else {
        args = []string{"SET", key, value, "NX"}
    }
    result, err := c.Do(args...)
    if err != nil {
        return false, err
    }
    return result != nil, nil
}

func (c *Client) Get(key string) (string, error) {
    result, err := c.Do("GET", key)
    if err != nil {
        return "", err
    }
    if result == nil {
        return "", nil // key不存在返回空字符串
    }
    s, ok := result.(string)
    if !ok {
        return "", errors.New("unexpected type")
    }
    return s, nil
}

func (c *Client) Del(keys ...string) (int64, error) {
    args := append([]string{"DEL"}, keys...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) Incr(key string) (int64, error) {
    result, err := c.Do("INCR", key)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) IncrBy(key string, increment int64) (int64, error) {
    result, err := c.Do("INCRBY", key, fmt.Sprintf("%d", increment))
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) Expire(key string, ttl time.Duration) (bool, error) {
    result, err := c.Do("EXPIRE", key, fmt.Sprintf("%d", int(ttl.Seconds())))
    if err != nil {
        return false, err
    }
    return result.(int64) == 1, nil
}

func (c *Client) TTL(key string) (time.Duration, error) {
    result, err := c.Do("TTL", key)
    if err != nil {
        return 0, err
    }
    seconds := result.(int64)
    if seconds < 0 {
        return 0, nil // key不存在或没有过期时间
    }
    return time.Duration(seconds) * time.Second, nil
}

func (c *Client) Exists(key string) (bool, error) {
    result, err := c.Do("EXISTS", key)
    if err != nil {
        return false, err
    }
    return result.(int64) == 1, nil
}

// ============ List操作 ============

func (c *Client) LPush(key string, values ...string) (int64, error) {
    args := append([]string{"LPUSH", key}, values...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) RPush(key string, values ...string) (int64, error) {
    args := append([]string{"RPUSH", key}, values...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) LPop(key string) (string, error) {
    result, err := c.Do("LPOP", key)
    if err != nil {
        return "", err
    }
    if result == nil {
        return "", nil
    }
    return result.(string), nil
}

func (c *Client) RPop(key string) (string, error) {
    result, err := c.Do("RPOP", key)
    if err != nil {
        return "", err
    }
    if result == nil {
        return "", nil
    }
    return result.(string), nil
}

func (c *Client) LRange(key string, start, stop int64) ([]string, error) {
    result, err := c.Do("LRANGE", key, fmt.Sprintf("%d", start), fmt.Sprintf("%d", stop))
    if err != nil {
        return nil, err
    }
    arr, ok := result.([]interface{})
    if !ok {
        return nil, errors.New("unexpected type")
    }
    res := make([]string, len(arr))
    for i, v := range arr {
        if v != nil {
            res[i] = v.(string)
        }
    }
    return res, nil
}

func (c *Client) LLen(key string) (int64, error) {
    result, err := c.Do("LLEN", key)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

// ============ Hash操作 ============

func (c *Client) HSet(key, field, value string) (int64, error) {
    result, err := c.Do("HSET", key, field, value)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) HGet(key, field string) (string, error) {
    result, err := c.Do("HGET", key, field)
    if err != nil {
        return "", err
    }
    if result == nil {
        return "", nil
    }
    return result.(string), nil
}

func (c *Client) HDel(key string, fields ...string) (int64, error) {
    args := append([]string{"HDEL", key}, fields...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) HGetAll(key string) (map[string]string, error) {
    result, err := c.Do("HGETALL", key)
    if err != nil {
        return nil, err
    }
    arr, ok := result.([]interface{})
    if !ok {
        return nil, errors.New("unexpected type")
    }
    m := make(map[string]string)
    for i := 0; i < len(arr); i += 2 {
        k := arr[i].(string)
        v := arr[i+1].(string)
        m[k] = v
    }
    return m, nil
}

func (c *Client) HExists(key, field string) (bool, error) {
    result, err := c.Do("HEXISTS", key, field)
    if err != nil {
        return false, err
    }
    return result.(int64) == 1, nil
}

func (c *Client) HIncrBy(key, field string, increment int64) (int64, error) {
    result, err := c.Do("HINCRBY", key, field, fmt.Sprintf("%d", increment))
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

// ============ Set操作 ============

func (c *Client) SAdd(key string, members ...string) (int64, error) {
    args := append([]string{"SADD", key}, members...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) SRem(key string, members ...string) (int64, error) {
    args := append([]string{"SREM", key}, members...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) SMembers(key string) ([]string, error) {
    result, err := c.Do("SMEMBERS", key)
    if err != nil {
        return nil, err
    }
    arr, ok := result.([]interface{})
    if !ok {
        return nil, errors.New("unexpected type")
    }
    res := make([]string, len(arr))
    for i, v := range arr {
        res[i] = v.(string)
    }
    return res, nil
}

func (c *Client) SIsMember(key, member string) (bool, error) {
    result, err := c.Do("SISMEMBER", key, member)
    if err != nil {
        return false, err
    }
    return result.(int64) == 1, nil
}

// ============ ZSet操作 ============

func (c *Client) ZAdd(key string, score float64, member string) (int64, error) {
    result, err := c.Do("ZADD", key, fmt.Sprintf("%f", score), member)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) ZRange(key string, start, stop int64) ([]string, error) {
    result, err := c.Do("ZRANGE", key, fmt.Sprintf("%d", start), fmt.Sprintf("%d", stop))
    if err != nil {
        return nil, err
    }
    arr, ok := result.([]interface{})
    if !ok {
        return nil, errors.New("unexpected type")
    }
    res := make([]string, len(arr))
    for i, v := range arr {
        res[i] = v.(string)
    }
    return res, nil
}

func (c *Client) ZRangeByScore(key string, min, max float64) ([]string, error) {
    result, err := c.Do("ZRANGEBYSCORE", key, 
        fmt.Sprintf("%f", min), fmt.Sprintf("%f", max))
    if err != nil {
        return nil, err
    }
    arr, ok := result.([]interface{})
    if !ok {
        return nil, errors.New("unexpected type")
    }
    res := make([]string, len(arr))
    for i, v := range arr {
        res[i] = v.(string)
    }
    return res, nil
}

func (c *Client) ZRem(key string, members ...string) (int64, error) {
    args := append([]string{"ZREM", key}, members...)
    result, err := c.Do(args...)
    if err != nil {
        return 0, err
    }
    return result.(int64), nil
}

func (c *Client) ZScore(key, member string) (float64, error) {
    result, err := c.Do("ZSCORE", key, member)
    if err != nil {
        return 0, err
    }
    if result == nil {
        return 0, errors.New("member not found")
    }
    s := result.(string)
    return strconv.ParseFloat(s, 64)
}

func (c *Client) ZRank(key, member string) (int64, error) {
    result, err := c.Do("ZRANK", key, member)
    if err != nil {
        return 0, err
    }
    if result == nil {
        return 0, errors.New("member not found")
    }
    return result.(int64), nil
}
```

### 9.5 Pipeline和事务支持

```go
// Pipeliner Pipeline执行器
type Pipeliner struct {
    client *Client
    conn   *Conn
    cmds   [][]string
    err    error
}

func (c *Client) Pipeline() *Pipeliner {
    conn, err := c.getConn(context.Background())
    if err != nil {
        return &Pipeliner{client: c, conn: nil, err: err}
    }
    return &Pipeliner{
        client: c,
        conn:   conn,
    }
}

func (p *Pipeliner) Add(args ...string) {
    if p.err != nil {
        return
    }
    p.cmds = append(p.cmds, args)
}

func (p *Pipeliner) Exec() ([]*Result, error) {
    if p.err != nil {
        return nil, p.err
    }
    if p.conn == nil {
        return nil, errors.New("pipeline connection error")
    }
    defer p.client.putConn(p.conn)
    
    if len(p.cmds) == 0 {
        return nil, nil
    }
    
    // 写入所有命令到缓冲区
    for _, cmd := range p.cmds {
        if err := p.conn.writeCommand(cmd); err != nil {
            return nil, err
        }
    }
    
    // 依次读取所有响应
    results := make([]*Result, len(p.cmds))
    for i := range p.cmds {
        val, err := p.conn.readResponse()
        if err != nil {
            results[i] = &Result{Err: err}
            continue
        }
        results[i] = parseResult(val)
    }
    
    // 清空命令队列
    p.cmds = p.cmds[:0]
    return results, nil
}

type Result struct {
    Value interface{}
    Err   error
}

// Tx 事务（MULTI/EXEC）
type Tx struct {
    client *Client
    conn   *Conn
}

func (c *Client) Multi() (*Tx, error) {
    conn, err := c.getConn(context.Background())
    if err != nil {
        return nil, err
    }
    
    tx := &Tx{client: c, conn: conn}
    
    // 发送MULTI命令开启事务
    if err := tx.conn.writeCommand([]string{"MULTI"}); err != nil {
        conn.close()
        return nil, err
    }
    if _, err := tx.conn.readResponse(); err != nil {
        conn.close()
        return nil, err
    }
    
    return tx, nil
}

func (t *Tx) Send(args ...string) error {
    if err := t.conn.writeCommand(args); err != nil {
        return err
    }
    // 读取QUEUED响应
    val, err := t.conn.readResponse()
    if err != nil {
        return err
    }
    if val.Type == TypeError {
        return fmt.Errorf("command error: %s", val.Str)
    }
    return nil
}

func (t *Tx) Exec() ([]interface{}, error) {
    defer t.client.putConn(t.conn)
    
    // 发送EXEC执行事务
    if err := t.conn.writeCommand([]string{"EXEC"}); err != nil {
        return nil, err
    }
    
    val, err := t.conn.readResponse()
    if err != nil {
        return nil, err
    }
    
    if val.Type == TypeError {
        return nil, fmt.Errorf("transaction aborted: %s", val.Str)
    }
    
    if val.IsNull {
        // WATCH的key被修改，事务被取消
        return nil, errors.New("transaction aborted (watched key modified)")
    }
    
    // 解析事务执行结果
    results := make([]interface{}, len(val.Array))
    for i, item := range val.Array {
        results[i], _ = parseResponse(item)
    }
    return results, nil
}

func (t *Tx) Discard() error {
    defer t.client.putConn(t.conn)
    
    if err := t.conn.writeCommand([]string{"DISCARD"}); err != nil {
        return err
    }
    _, err := t.conn.readResponse()
    return err
}
```

### 9.6 完整使用示例

```go
func main() {
    // 创建客户端
    client, err := NewClient(DefaultConfig("127.0.0.1:6379"))
    if err != nil {
        panic(err)
    }
    defer client.Close()
    
    // ========== String操作 ==========
    fmt.Println("=== String操作 ===")
    client.Set("name", "怕浪猫")
    client.SetEx("temp", "will expire", 60*time.Second)
    
    name, _ := client.Get("name")
    fmt.Println("name:", name)
    
    exists, _ := client.Exists("name")
    fmt.Println("name exists:", exists)
    
    client.Incr("counter")
    client.Incr("counter")
    client.IncrBy("counter", 10)
    counter, _ := client.Get("counter")
    fmt.Println("counter:", counter)
    
    // ========== Hash操作 ==========
    fmt.Println("\n=== Hash操作 ===")
    client.HSet("user:1001", "name", "怕浪猫")
    client.HSet("user:1001", "role", "developer")
    client.HSet("user:1001", "age", "28")
    
    user, _ := client.HGetAll("user:1001")
    fmt.Println("user:", user)
    
    // ========== List操作 ==========
    fmt.Println("\n=== List操作 ===")
    client.LPush("tasks", "task1", "task2", "task3")
    
    task, _ := client.RPop("tasks")
    fmt.Println("task:", task)
    
    remaining, _ := client.LRange("tasks", 0, -1)
    fmt.Println("remaining tasks:", remaining)
    
    // ========== Set操作 ==========
    fmt.Println("\n=== Set操作 ===")
    client.SAdd("tags:1001", "go", "redis", "cache")
    
    tags, _ := client.SMembers("tags:1001")
    fmt.Println("tags:", tags)
    
    // ========== ZSet操作 ==========
    fmt.Println("\n=== ZSet操作 ===")
    client.ZAdd("ranking", 100, "怕浪猫")
    client.ZAdd("ranking", 85, "张三")
    client.ZAdd("ranking", 92, "李四")
    
    top, _ := client.ZRange("ranking", 0, -1)
    fmt.Println("ranking:", top)
    
    // ========== Pipeline批量操作 ==========
    fmt.Println("\n=== Pipeline ===")
    pipe := client.Pipeline()
    for i := 0; i < 100; i++ {
        pipe.Add("SET", fmt.Sprintf("key:%d", i), fmt.Sprintf("value:%d", i))
    }
    results, err := pipe.Exec()
    if err != nil {
        fmt.Println("pipeline error:", err)
    } else {
        fmt.Printf("pipeline completed: %d commands\n", len(results))
    }
    
    // ========== 事务 ==========
    fmt.Println("\n=== 事务 ===")
    tx, err := client.Multi()
    if err != nil {
        panic(err)
    }
    tx.Send("INCR", "tx_counter")
    tx.Send("INCR", "tx_counter")
    tx.Send("GET", "tx_counter")
    txResults, err := tx.Exec()
    if err != nil {
        fmt.Println("transaction error:", err)
    } else {
        fmt.Println("transaction results:", txResults)
    }
    
    // ========== Pub/Sub ==========
    fmt.Println("\n=== Pub/Sub ===")
    sub, err := NewPubSubClient("127.0.0.1:6379")
    if err != nil {
        panic(err)
    }
    defer sub.Close()
    
    sub.Subscribe("notifications")
    sub.OnMessage(func(msg Message) {
        fmt.Printf("[%s] %s\n", msg.Channel, msg.Data)
    })
    sub.Start()
    
    // 发布消息
    client.Do("PUBLISH", "notifications", "Hello from 怕浪猫")
    
    time.Sleep(time.Second)
    
    // ========== 统计信息 ==========
    fmt.Println("\n=== 统计 ===")
    stats := client.Stats()
    fmt.Printf("总命令数: %d\n", stats.TotalCommands)
    fmt.Printf("成功: %d, 失败: %d\n", stats.SuccessCount, stats.ErrorCount)
    fmt.Printf("平均延迟: %.2fms\n", stats.AvgLatency())
}

func (s ClientStats) AvgLatency() float64 {
    if s.TotalCommands == 0 {
        return 0
    }
    return float64(s.TotalLatency) / float64(s.TotalCommands) / 1e6
}

func (c *Client) Stats() ClientStats {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.stats
}
```

### 9.7 错误处理最佳实践

在生产环境中，Redis客户端的错误处理至关重要。以下是需要处理的几类错误：

```go
// 定义错误类型
var (
    ErrNil           = errors.New("redis: nil")
    ErrPoolExhausted = errors.New("redis: connection pool exhausted")
    ErrConnectionClosed = errors.New("redis: connection closed")
)

// IsNil 判断是否为nil回复（key不存在）
func IsNil(err error) bool {
    return errors.Is(err, ErrNil)
}

// IsNetworkError 判断是否为网络错误
func IsNetworkError(err error) bool {
    var netErr net.Error
    return errors.As(err, &netErr)
}

// IsTimeout 判断是否为超时错误
func IsTimeout(err error) bool {
    var netErr net.Error
    if errors.As(err, &netErr) {
        return netErr.Timeout()
    }
    return false
}

// 安全的Get操作示例
func SafeGet(client *Client, key string) (string, error) {
    value, err := client.Get(key)
    if err != nil {
        if IsNil(err) {
            // key不存在，不是错误
            return "", nil
        }
        if IsTimeout(err) {
            // 超时，可以重试或降级
            return "", fmt.Errorf("get timeout for key %s", key)
        }
        if IsNetworkError(err) {
            // 网络错误，可能需要检查连接
            return "", fmt.Errorf("network error for key %s: %w", key, err)
        }
        return "", err
    }
    return value, nil
}
```

> 造轮子是理解轮子最好的方式。当你手写过Redis客户端之后，再用go-redis或redigo，你会感觉每个API都在"说话"——你听得懂它底层的每一次网络往返、每一次连接借用、每一次协议解析。

### 9.8 生产化建议

我们手写的这个客户端虽然功能完整，但距离生产级还有一段距离。以下是生产化的建议：

1. **连接预热**：在应用启动时预先建立一批连接，避免冷启动时的延迟抖动。

2. **熔断降级**：当Redis连续失败超过阈值时，自动熔断，直接返回降级结果，防止Redis故障扩散到整个系统。

3. **慢查询日志**：记录执行时间超过阈值的命令，方便排查性能问题。

4. **Metrics上报**：将命令成功率、延迟分布、连接池状态等指标上报到监控系统。

5. **读写分离**：如果使用了Redis主从架构，客户端需要支持读写分离，写命令发到主节点，读命令发到从节点。

6. **Cluster支持**：如果使用了Redis Cluster，客户端需要支持MOVED和ASK重定向，以及集群拓扑的自动发现。

这些功能在go-redis等成熟库中都有实现，手写客户端的意义在于理解原理，生产环境还是建议使用成熟的开源库。

---

## 总结

这一章我们从缓存设计原则出发，深入探讨了缓存淘汰策略（LRU、LFU、FIFO、TTL），对比了三大Go本地缓存库（BigCache、FreeCache、ristretto），手写了线程安全的LRU Cache，详细解析了Redis RESP协议，实现了连接池和Pipeline，最后整合出一个轻量级Redis客户端。内容不少，这里做一个完整的知识回顾：

**核心知识点回顾：**

1. **缓存设计三原则**：简单、高效、可控。不要把缓存当数据库用，每个缓存都应该有统计、有监控、有降级方案。

2. **淘汰策略选择**：通用场景用LRU+TTL，热点明显的场景用LFU，访问均匀的场景用FIFO。没有最好的策略，只有最合适的策略。

3. **本地缓存选型**：海量key选BigCache，GC敏感选FreeCache，命中率优先选ristretto。选型前先明确你的需求优先级。

4. **并发安全**：分段锁是降低锁竞争的经典方案，sync.Map适合读多写少。选并发方案要看实际访问模式。

5. **RESP协议**：5种数据类型（Simple String、Error、Integer、Bulk String、Array），客户端用数组格式发送命令。理解协议是手写客户端的基础。

6. **连接池**：复用连接是性能关键，LIFO策略优先复用最近归还的连接，参数调优影响巨大，maxOpen不是越大越好。

7. **Pipeline**：将N次RTT减少为1次，性能提升可达数十倍。但不是原子的，单批不宜超过1000条，不能依赖前一条命令的结果。

8. **Pub/Sub**：简单易用但无持久化、无ACK、无负载均衡。需要可靠消息时用Redis Streams。

9. **客户端实现**：整合RESP解析器+连接池+Pipeline+事务+高层API，手写客户端帮助你理解Redis的工作原理。

**缓存设计决策清单：**

- [ ] 确认数据是否适合缓存（读写比、一致性容忍度、数据量）
- [ ] 选择缓存层级（本地缓存、Redis、多级缓存）
- [ ] 选择淘汰策略（LRU/LFU/FIFO+TTL）
- [ ] 设置合理的TTL（加随机抖动防雪崩）
- [ ] 配置连接池参数（maxOpen、maxIdle、timeout）
- [ ] 实现缓存统计和监控（命中率、延迟、内存）
- [ ] 准备降级方案（缓存宕机时的兜底策略）
- [ ] 处理缓存一致性问题（下一章详细讨论）

---

**如果这篇文章对你有帮助，点个收藏吧，以后写代码的时候可以直接来翻。**

**有什么问题欢迎在评论区交流，你的提问可能就是下一章的内容。**

**这是Go后端实战手册系列的第6章，追更不迷路，我们下一章见。**

> 系列进度：6/16

**下一章预告：第7章——缓存策略与一致性。** 我们将深入探讨Cache-Aside、Read-Through、Write-Through、Write-Behind等缓存模式，剖析缓存穿透、缓存击穿、缓存雪崩的解决方案，以及如何保障缓存与数据库的最终一致性。这一章的缓存基础将是你理解下一章的重要铺垫。

---

> **怕浪猫说：** 缓存是后端工程师的基本功，但基本功不等于简单。一个SET命令背后，是淘汰策略的选择、连接池的调优、协议的解析、一致性的权衡。真正的高手不是会用缓存的人，而是知道什么时候不该用缓存的人。代码写完了，去翻翻你项目里的缓存代码，看看有没有埋着雷吧。如果这篇文章让你有所收获，把它分享给你身边还在"set一下get一下"的同事们吧。
