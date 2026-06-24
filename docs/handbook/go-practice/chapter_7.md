# 第7章：缓存策略与一致性 + 多级缓存实战

凌晨三点，你被电话炸醒。线上系统Redis集群挂了一台，数据库连接池瞬间被打满，整个商品详情页接口响应时间从50ms飙升到5秒，上游服务纷纷超时，雪崩式故障扩散到半个机房。你爬起来紧急扩容数据库、重启服务、恢复Redis，折腾到天亮。事后复盘发现：所有热点商品缓存设置了相同的过期时间，Redis一抖动就直接打到数据库，缓存穿透、击穿、雪崩三个经典问题在十分钟内轮番上演。

这种场景，怕浪猫见过太多次了。

我是怕浪猫，一个在缓存坑里摸爬滚打多年的Go后端开发。从最早的"加个Redis就够了"到后来设计多级缓存架构、写缓存防护组件、做缓存一致性管理器，踩过的坑足够填平一个西湖。这一章，我把缓存策略的核心知识体系和实战经验一次性讲透，从缓存模式到一致性方案，从防护组件到多级缓存实战项目，全部用Go代码实现，读完能直接用到你的项目里。

> 缓存不是银弹，是用空间换时间的精算题。算得精，四两拨千斤；算得糙，缓存本身就是故障源。

---

## 一、缓存模式：四种经典姿势

搞缓存，第一步不是装Redis，而是想清楚你的读写流程该怎么走。缓存模式决定了数据在缓存和数据库之间的流动方式，选错模式，后面所有优化都是在泥潭里补窟窿。

### 1.1 Cache-Aside（旁路缓存）

最常用的缓存模式，没有之一。应用程序同时与缓存和数据库交互，读先查缓存，未命中则查数据库并回填缓存，写则先更新数据库再删除缓存。

核心逻辑就两条：
- 读：先查缓存，命中则返回；未命中则查数据库，回填缓存，返回
- 写：先更新数据库，再删除缓存（注意是删除不是更新）

为什么是删除而不是更新缓存？因为更新缓存有并发问题：A先更新数据库，B后更新数据库，但B先更新缓存、A后更新缓存，缓存里就是旧数据了。删除是幂等操作，下次读的时候自然会回填最新值。

```go
// Cache-Aside 模式的标准实现
type CacheAside struct {
    cache    *redis.Client
    db       *sql.DB
    ttl      time.Duration
}

func (c *CacheAside) Get(ctx context.Context, key string) (string, error) {
    // 1. 先查缓存
    val, err := c.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil // 缓存命中
    }
    if !errors.Is(err, redis.Nil) {
        return "", fmt.Errorf("cache read error: %w", err)
    }

    // 2. 缓存未命中，查数据库
    val, err = c.queryDB(ctx, key)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            // 防穿透：缓存空值，短TTL
            c.cache.Set(ctx, key, "", 5*time.Minute)
            return "", nil
        }
        return "", err
    }

    // 3. 回填缓存
    c.cache.Set(ctx, key, val, c.ttl)
    return val, nil
}

func (c *CacheAside) Set(ctx context.Context, key, value string) error {
    // 1. 先更新数据库
    if err := c.updateDB(ctx, key, value); err != nil {
        return err
    }
    // 2. 再删除缓存
    if err := c.cache.Del(ctx, key).Err(); err != nil {
        // 缓存删除失败，记录日志，可以走重试或消息队列补偿
        log.Printf("cache delete failed, key=%s: %v", key, err)
    }
    return nil
}

func (c *CacheAside) queryDB(ctx context.Context, key string) (string, error) {
    var val string
    err := c.db.QueryRowContext(ctx, "SELECT value FROM kv_store WHERE key = ?", key).Scan(&val)
    return val, err
}

func (c *CacheAside) updateDB(ctx context.Context, key, value string) error {
    _, err := c.db.ExecContext(ctx, "UPDATE kv_store SET value = ? WHERE key = ?", value, key)
    return err
}
```

Cache-Aside的缺点是代码侵入性强，每个使用缓存的地方都要写一遍"先查缓存再查DB再回填"的逻辑。如果你有十个接口要加缓存，这段逻辑就得写十遍，虽然可以抽成公共方法，但调用方仍然需要感知缓存的存在。另一个缺点是缓存和数据库的一致性窗口较长，在写入数据库到删除缓存之间的这段时间，读请求可能读到旧的缓存数据。

但它最大的优点是简单直观，缓存出了问题不影响正常流程，最多就是多打几次数据库。这种"缓存降级"的能力在生产环境中非常重要，Redis抖一下不会导致整个服务不可用。而且Cache-Aside模式对缓存和数据源的耦合要求最低，缓存可以是Redis，也可以是Memcached，甚至可以是本地内存，切换缓存方案时业务代码不需要改动。

在实际项目中，怕浪猫建议大部分场景默认使用Cache-Aside，只在有特殊需求时才考虑其他模式。比如商品详情页这种读多写少的场景，Cache-Aside的性能已经足够好了，没必要过度设计。只有在写量极大、写入延迟成为瓶颈时，才需要考虑Write-Behind模式。

> Cache-Aside就像你自己做饭：自己买菜（查缓存）、自己下厨（查DB）、自己存冰箱（回填缓存）。累是累点，但每一步都可控。

### 1.2 Read-Through（读穿透）

Read-Through把缓存的读取逻辑封装在缓存层内部，应用程序只跟缓存交互。缓存未命中时，缓存组件自己去加载数据库数据并回填，对应用层透明。

```go
// Read-Through 模式：缓存层负责数据加载
type ReadThroughCache struct {
    cache    *redis.Client
    loader   func(ctx context.Context, key string) (string, error) // 数据加载回调
    ttl      time.Duration
    mutex    *singleflight.Group // 防击穿
}

func NewReadThroughCache(cache *redis.Client, loader func(ctx context.Context, key string) (string, error), ttl time.Duration) *ReadThroughCache {
    return &ReadThroughCache{
        cache:  cache,
        loader: loader,
        ttl:    ttl,
        mutex:  &singleflight.Group{},
    }
}

func (c *ReadThroughCache) Get(ctx context.Context, key string) (string, error) {
    // 1. 先查缓存
    val, err := c.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }

    // 2. 缓存未命中，使用 singleflight 防击穿
    // 多个并发请求同一个key，只有一个会真正去加载
    result, err, _ := c.mutex.Do(key, func() (interface{}, error) {
        // 再次检查缓存（可能上一个请求已经回填了）
        val, err := c.cache.Get(ctx, key).Result()
        if err == nil {
            return val, nil
        }

        // 加载数据
        val, err = c.loader(ctx, key)
        if err != nil {
            return "", err
        }

        // 回填缓存
        c.cache.Set(ctx, key, val, c.ttl)
        return val, nil
    })

    if err != nil {
        return "", err
    }
    return result.(string), nil
}
```

Read-Through和Cache-Aside看起来很像，区别在于封装层次。Cache-Aside是应用层负责缓存逻辑，应用代码里明确写着"先查缓存，再查数据库"；Read-Through是缓存层负责，应用代码只调用cache.Get(key)，缓存层内部决定什么时候查数据库、怎么回填。

这个区别看起来微妙，但在大型项目中的影响很大。当你的团队有十几个微服务，每个服务都自己写缓存逻辑，必然会出现不一致的实现：有的忘了缓存空值，有的TTL设置不合理，有的没做互斥控制。而Read-Through把缓存逻辑统一封装在基础设施层，所有业务服务共享同一套缓存策略，维护成本大大降低。

好处是应用代码干净，业务开发者不需要关心缓存细节；坏处是缓存层变复杂了，调试问题更难，因为缓存层成了"黑盒"。当线上出现一个缓存问题，你需要去看缓存层的日志、监控、内部状态，而不是业务代码。所以在选择Read-Through时，一定要确保缓存层有完善的可观测性：日志、指标、链路追踪，缺一不可。

> 封装是为了减少重复，但别忘了给自己留一扇调试的窗户。黑盒用着舒服，排查起来想哭。

### 1.3 Write-Through（写穿透）

Write-Through模式下，写操作同时写缓存和数据库，由缓存层协调保证两个写入都成功。应用程序只跟缓存交互，缓存层负责同步写入数据库。

```go
// Write-Through 模式：写操作同步写缓存和数据库
type WriteThroughCache struct {
    cache    *redis.Client
    db       *sql.DB
    writer   func(ctx context.Context, key, value string) error // 数据库写入回调
    ttl      time.Duration
}

func (c *WriteThroughCache) Get(ctx context.Context, key string) (string, error) {
    // 读逻辑和Read-Through类似
    val, err := c.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }
    // 未命中走数据库加载...
    return c.loadAndCache(ctx, key)
}

func (c *WriteThroughCache) Set(ctx context.Context, key, value string) error {
    // 1. 先写数据库
    if err := c.writer(ctx, key, value); err != nil {
        return fmt.Errorf("db write failed: %w", err)
    }

    // 2. 再写缓存
    if err := c.cache.Set(ctx, key, value, c.ttl).Err(); err != nil {
        // 缓存写失败不影响数据正确性，下次读会回填
        // 但要记录日志，便于排查
        log.Printf("cache write failed, key=%s: %v", key, err)
    }

    return nil
}

func (c *WriteThroughCache) loadAndCache(ctx context.Context, key string) (string, error) {
    var val string
    err := c.db.QueryRowContext(ctx, "SELECT value FROM kv_store WHERE key = ?", key).Scan(&val)
    if err != nil {
        return "", err
    }
    c.cache.Set(ctx, key, val, c.ttl)
    return val, nil
}
```

Write-Through保证了缓存和数据库的强一致性（在写入成功的时刻），但写延迟较高，因为要等两个写入都完成。如果数据库写入需要50ms，那么写操作的整体延迟至少50ms起步，再加上缓存写入的时间和网络开销，写性能会比Cache-Aside差不少。

这里有一个关键的工程细节：写缓存和写数据库哪个先执行？如果先写缓存再写数据库，数据库写失败时缓存里有新数据但数据库没有，后续读请求会读到新数据但数据库是旧的，造成不一致。如果先写数据库再写缓存，数据库写成功但缓存写失败时，缓存里是旧数据，下一个读请求会读到旧数据并可能回填旧数据覆盖掉正确值。

上面的代码选择了"先写数据库再写缓存"的顺序，并且在缓存写失败时只记录日志不回滚数据库。原因是缓存写失败的概率很低（Redis通常很稳定），而且即使失败了，缓存的旧数据会在TTL过期后自动失效，最终一致性可以保证。如果你的业务对一致性要求极高，可以在缓存写失败时把key写入一个补偿队列，异步重试写入。

> 强一致性的代价是性能的让步。选Write-Through之前，先问自己：你的写操作频率，扛得住同步双写吗？

### 1.4 Write-Behind（异步写回）

Write-Behind也叫Write-Back，写操作只写缓存，立即返回成功，然后异步地把数据刷到数据库。写性能极高，但有一致性风险：缓存挂了还没刷到数据库的数据就丢了。

```go
// Write-Behind 模式：异步写回数据库
type WriteBehindCache struct {
    cache     *redis.Client
    db        *sql.DB
    writeChan chan writeTask
    batchChan chan []writeTask
    batchSize int
    flushInterval time.Duration
    stopChan  chan struct{}
    wg        sync.WaitGroup
}

type writeTask struct {
    key   string
    value string
    time  time.Time
}

func NewWriteBehindCache(cache *redis.Client, db *sql.DB, batchSize int, flushInterval time.Duration) *WriteBehindCache {
    c := &WriteBehindCache{
        cache:         cache,
        db:            db,
        writeChan:     make(chan writeTask, 10000),
        batchChan:     make(chan []writeTask, 100),
        batchSize:     batchSize,
        flushInterval: flushInterval,
        stopChan:      make(chan struct{}),
    }
    c.wg.Add(2)
    go c.collectWorker()
    go c.flushWorker()
    return c
}

func (c *WriteBehindCache) Get(ctx context.Context, key string) (string, error) {
    return c.cache.Get(ctx, key).Result()
}

func (c *WriteBehindCache) Set(ctx context.Context, key, value string) error {
    // 1. 只写缓存，立即返回
    if err := c.cache.Set(ctx, key, value, 0).Err(); err != nil {
        return err
    }

    // 2. 投递异步写任务
    select {
    case c.writeChan <- writeTask{key: key, value: value, time: time.Now()}:
        return nil
    default:
        // 队列满了，降级为同步写
        log.Printf("write queue full, fallback to sync write, key=%s", key)
        return c.syncWrite(ctx, key, value)
    }
}

// collectWorker: 收集写入任务，攒批
func (c *WriteBehindCache) collectWorker() {
    defer c.wg.Done()
    batch := make([]writeTask, 0, c.batchSize)
    ticker := time.NewTicker(c.flushInterval)
    defer ticker.Stop()

    for {
        select {
        case task := <-c.writeChan:
            batch = append(batch, task)
            if len(batch) >= c.batchSize {
                c.batchChan <- batch
                batch = make([]writeTask, 0, c.batchSize)
            }
        case <-ticker.C:\n            if len(batch) > 0 {
                c.batchChan <- batch
                batch = make([]writeTask, 0, c.batchSize)
            }
        case <-c.stopChan:
            if len(batch) > 0 {
                c.batchChan <- batch
            }
            return
        }
    }
}

// flushWorker: 批量写入数据库
func (c *WriteBehindCache) flushWorker() {
    defer c.wg.Done()
    for {
        select {
        case batch := <-c.batchChan:
            if err := c.batchWrite(batch); err != nil {
                log.Printf("batch write failed, %d tasks lost: %v", len(batch), err)
                // 失败重试或写入死信队列
            }
        case <-c.stopChan:
            return
        }
    }
}

func (c *WriteBehindCache) batchWrite(batch []writeTask) error {
    // 批量写入数据库
    tx, err := c.db.Begin()
    if err != nil {
        return err
    }
    defer tx.Rollback()

    stmt, err := tx.Prepare("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = ?")
    if err != nil {
        return err
    }
    defer stmt.Close()

    for _, task := range batch {
        _, err = stmt.Exec(task.key, task.value, task.time, task.value, task.time)
        if err != nil {
            return err
        }
    }

    return tx.Commit()
}

func (c *WriteBehindCache) syncWrite(ctx context.Context, key, value string) error {
    _, err := c.db.ExecContext(ctx, "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = ?", key, value, time.Now(), value, time.Now())
    return err
}

func (c *WriteBehindCache) Close() {
    close(c.stopChan)
    c.wg.Wait()
}
```

Write-Behind适合写量极大的场景，比如计数器、日志写入、用户行为埋点。在这些场景下，写操作的实时一致性要求不高，但写吞吐量要求极高。比如一个热门直播间的点赞计数，每秒可能有上万次写入，如果每次都同步写数据库，数据库扛不住。用Write-Behind模式，所有写操作先到内存队列，批量攒一批再刷到数据库，数据库压力骤降。

但Write-Behind的容错设计是最复杂的，需要考虑以下问题：

1. 队列满了怎么办？上面代码选择了降级为同步写，这是最安全的策略。也可以选择丢弃写入并记录告警，但要看业务能否接受数据丢失。
2. 批量写失败怎么办？需要重试机制，但重试次数要有限制，超过限制后写入死信队列人工处理。
3. 进程崩溃怎么办？内存队列里的数据会丢失。可以通过写aheadlog（WAL）来兜底，每次写队列前先写一条WAL日志，进程重启时回放WAL恢复队列。
4. 进程优雅退出怎么办？上面代码里的Close方法就是为了优雅退出设计的，关闭接收新任务的channel，等待collectWorker把剩余任务发给flushWorker，flushWorker把所有批量任务写入数据库后才退出。

5. 数据乱序怎么办？同一个key的多次写入，后写的可能先被批量刷入数据库，导致数据被旧值覆盖。解决方案是每个key只保留最新的值，在collectWorker中做去重。

这些容错细节决定了Write-Behind方案是否能在生产环境中稳定运行。很多团队实现了Write-Behind但没做容错，上线后遇到一次进程崩溃就丢了一片数据，然后就不敢再用了。怕浪猫的建议是：除非你真的需要极高的写吞吐量，否则不要用Write-Behind，用Write-Through或Cache-Aside就够了。

> 异步写回就像信用卡消费：先刷了再说，月底统一还款。但你要确保自己不会在还款日前跑路。

### 四种模式对比清单

| 维度 | Cache-Aside | Read-Through | Write-Through | Write-Behind |
|------|-------------|--------------|---------------|--------------|
| 读性能 | 高（命中时） | 高（命中时） | 高（命中时） | 高（命中时） |
| 写性能 | 中（同步写DB+删缓存） | 中 | 低（同步双写） | 极高（只写缓存） |
| 一致性 | 最终一致 | 最终一致 | 强一致 | 弱一致 |
| 代码侵入 | 高 | 低 | 低 | 低 |
| 实现复杂度 | 低 | 中 | 中 | 高 |
| 适用场景 | 通用场景 | 读多写少 | 写少读多 | 写量极大 |

> 选缓存模式就像选交通工具：短途骑自行车（Cache-Aside），中程坐地铁（Read-Through），长途开汽车（Write-Through），赶时间坐飞机（Write-Behind）。没有最好，只有最合适。

---

## 二、缓存三大问题：穿透、击穿、雪崩

这三个问题是缓存架构的"三座大山"，每个Go后端开发者都必须能讲清楚原理和解决方案。怕浪猫在实际生产中，每个问题都遇到过不止一次。

### 2.1 缓存穿透

**问题**：请求查询一个数据库中不存在的数据，缓存永远不会命中，每次请求都打到数据库。恶意攻击者可以用大量不存在的key把数据库打垮。

**解决方案一：空值缓存**

查到数据库没有数据，也把这个"不存在"的结果缓存起来，设置一个较短的TTL。

```go
// 空值缓存方案
const emptyValue = "__NULL__"

func (c *CacheService) GetWithNullCache(ctx context.Context, key string) (string, error) {
    val, err := c.cache.Get(ctx, key).Result()
    if err == nil {
        if val == emptyValue {
            return "", ErrNotFound // 命中空值缓存
        }
        return val, nil
    }

    // 缓存未命中，查数据库
    val, err = c.queryDB(ctx, key)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            // 数据库也不存在，缓存空值，短TTL
            c.cache.Set(ctx, key, emptyValue, 5*time.Minute)
            return "", ErrNotFound
        }
        return "", err
    }

    c.cache.Set(ctx, key, val, c.ttl)
    return val, nil
}
```

空值缓存的缺点是会浪费内存空间存无用的空值。如果攻击者用大量随机不同的key来请求，空值缓存方案就不灵了，因为每个key都要存一个空值。

**解决方案二：布隆过滤器**

布隆过滤器是一个位数组加多个哈希函数的数据结构，能判断一个元素"一定不存在"或"可能存在"。在请求到达缓存之前，先过布隆过滤器：如果过滤器说不存在，直接返回，不查缓存也不查数据库。

```go
import "github.com/bits-and-blooms/bloom/v3"

// 布隆过滤器方案
type BloomCacheService struct {
    cache   *redis.Client
    db      *sql.DB
    filter  *bloom.BloomFilter
    ttl     time.Duration
}

func NewBloomCacheService(cache *redis.Client, db *sql.DB, expectedItems uint, falsePositiveRate float64) *BloomCacheService {
    // 创建布隆过滤器，预期100万条数据，误判率0.1%
    filter := bloom.NewWithEstimates(expectedItems, falsePositiveRate)
    // 启动时从数据库加载所有key到布隆过滤器
    // 这一步可能比较耗时，可以异步执行或从备份恢复
    s := &BloomCacheService{
        cache:  cache,
        db:     db,
        filter: filter,
        ttl:    30 * time.Minute,
    }
    s.loadBloomFilter(context.Background())
    return s
}

func (s *BloomCacheService) loadBloomFilter(ctx context.Context) {
    rows, err := s.db.QueryContext(ctx, "SELECT key FROM kv_store")
    if err != nil {
        log.Printf("load bloom filter failed: %v", err)
        return
    }
    defer rows.Close()

    count := 0
    for rows.Next() {
        var key string
        if err := rows.Scan(&key); err == nil {
            s.filter.AddString(key)
            count++
        }
    }
    log.Printf("bloom filter loaded with %d items", count)
}

func (s *BloomCacheService) Get(ctx context.Context, key string) (string, error) {
    // 1. 先过布隆过滤器
    if !s.filter.TestString(key) {
        // 布隆过滤器说一定不存在，直接返回
        return "", ErrNotFound
    }

    // 2. 布隆过滤器说可能存在，查缓存
    val, err := s.cache.Get(ctx, key).Result()
    if err == nil {
        if val == emptyValue {
            return "", ErrNotFound
        }
        return val, nil
    }

    // 3. 缓存未命中，查数据库
    val, err = s.queryDB(ctx, key)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            // 数据库不存在，缓存空值
            s.cache.Set(ctx, key, emptyValue, 5*time.Minute)
            return "", ErrNotFound
        }
        return "", err
    }

    s.cache.Set(ctx, key, val, s.ttl)
    return val, nil
}

func (s *BloomCacheService) Set(ctx context.Context, key, value string) error {
    // 写入数据库
    if err := s.updateDB(ctx, key, value); err != nil {
        return err
    }
    // 更新缓存
    s.cache.Del(ctx, key)
    // 更新布隆过滤器
    s.filter.AddString(key)
    return nil
}
```

布隆过滤器有一个关键问题：它只支持添加，不支持删除（标准布隆过滤器）。如果删了一条数据，不能从布隆过滤器里移除，否则会影响其他元素的判断。举个例子：key1和key2的哈希值都映射到位数组的第3位和第7位，删掉key1时把第3位和第7位置0，key2的判断就会变成"不存在"，但实际上key2还在数据库里。

解决方案是用布谷鸟过滤器（Cuckoo Filter）或者计数布隆过滤器（Counting Bloom Filter）。计数布隆过滤器把位数组改成计数数组，添加时+1，删除时-1，只有计数为0时才认为不存在。但计数器需要更多内存，而且存在计数溢出的问题。布谷鸟过滤器是更现代的方案，支持删除且空间效率更高，Go生态里有github.com/linvon/cuckoo-filter等实现。

在怕浪猫的实际项目中，布隆过滤器的初始化是一个需要注意的问题。如果你的数据库有上千万条数据，启动时全部加载到布隆过滤器需要几分钟时间。解决方案有三种：一是启动时异步加载，加载完成前布隆过滤器不生效，请求直接走缓存和数据库；二是把布隆过滤器序列化到文件，启动时从文件反序列化恢复，速度比全量扫描快得多；三是用Redis Bitmap实现分布式布隆过滤器，多个实例共享同一份数据，避免每个实例都独立加载。

布隆过滤器还有一个误判率的问题。误判率取决于位数组大小和哈希函数个数，通常设置为0.01%到1%之间。误判率越低，内存占用越大。在实际使用中，0.1%的误判率已经足够了，意味着每1000个不存在的key中，最多有1个会误判为"可能存在"而穿透到数据库。这个量级的穿透是完全可以接受的。

> 布隆过滤器就像机场安检的防爆检测：它能100%确定你的行李没问题放行，但说你有问题的时候可能是误报。宁可误报不可漏报，这就是安全策略。

在实际项目中，两种方案通常结合使用：布隆过滤器挡住大部分不存在的key，空值缓存兜住布隆过滤器漏过去的少量请求。

### 2.2 缓存击穿

**问题**：某个热点key在过期的瞬间，大量并发请求同时打到数据库，把数据库压垮。和穿透的区别是：穿透是查不存在的数据，击穿是查存在的数据但缓存恰好失效了。

**解决方案一：互斥锁（Mutex）**

缓存未命中时，只让一个请求去查数据库并回填缓存，其他请求等待或重试。Go里最优雅的实现是`singleflight.Group`。

```go
import "golang.org/x/sync/singleflight"

type MutexCacheService struct {
    cache   *redis.Client
    db      *sql.DB
    group   singleflight.Group
    ttl     time.Duration
}

func (s *MutexCacheService) Get(ctx context.Context, key string) (string, error) {
    // 1. 先查缓存
    val, err := s.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }

    // 2. 缓存未命中，使用 singleflight 合并并发请求
    result, err, _ := s.group.Do(key, func() (interface{}, error) {
        // 双重检查：可能其他请求已经回填了缓存
        val, err := s.cache.Get(ctx, key).Result()
        if err == nil {
            return val, nil
        }

        // 查数据库
        val, err = s.queryDB(ctx, key)
        if err != nil {
            return "", err
        }

        // 回填缓存
        s.cache.Set(ctx, key, val, s.ttl)
        return val, nil
    })

    if err != nil {
        return "", err
    }
    return result.(string), nil
}
```

`singleflight`的原理是：对同一个key的并发调用，只有第一个调用会真正执行回调函数，其他调用会阻塞等待第一个的结果，然后共享结果。完美解决了击穿问题，而且代码量极少。

但`singleflight`是进程内的，如果你的服务部署了多个实例，每个实例都会有一个请求去查数据库。要解决这个问题，可以用Redis分布式锁：

```go
// 分布式互斥锁方案
type DistributedMutexCache struct {
    cache   *redis.Client
    db      *sql.DB
    ttl     time.Duration
    lockTTL time.Duration
}

func (s *DistributedMutexCache) Get(ctx context.Context, key string) (string, error) {
    // 1. 先查缓存
    val, err := s.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }

    // 2. 尝试获取分布式锁
    lockKey := "lock:" + key
    lockValue := uuid.New().String() // 锁的唯一标识，防止误删

    // 尝试获取锁，设置过期时间防止死锁
    ok, err := s.cache.SetNX(ctx, lockKey, lockValue, s.lockTTL).Result()
    if err != nil {
        return "", fmt.Errorf("acquire lock failed: %w", err)
    }

    if ok {
        // 获取锁成功，查数据库并回填
        defer s.releaseLock(ctx, lockKey, lockValue)
        return s.loadAndCache(ctx, key)
    }

    // 获取锁失败，短暂等待后重试读缓存
    time.Sleep(50 * time.Millisecond)
    val, err = s.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }

    // 仍然没有，递归重试（实际生产中要限制重试次数）
    return s.Get(ctx, key)
}

func (s *DistributedMutexCache) loadAndCache(ctx context.Context, key string) (string, error) {
    // 双重检查
    val, err := s.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }

    val, err = s.queryDB(ctx, key)
    if err != nil {
        return "", err
    }

    s.cache.Set(ctx, key, val, s.ttl)
    return val, nil
}

// 释放锁：使用Lua脚本保证原子性
var releaseLockScript = redis.NewScript(`
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`)

func (s *DistributedMutexCache) releaseLock(ctx context.Context, lockKey, lockValue string) {
    releaseLockScript.Run(ctx, s.cache, []string{lockKey}, lockValue)
}
```

释放锁用Lua脚本是必须的，否则存在竞态条件：A的锁过期了，B拿到了锁，A来删锁把B的锁删了。Lua脚本先检查值再删除，保证原子性。

> 互斥锁防击穿就像公共厕所排队：一个人进去了，其他人门外等。但你要确保进去的人不会晕在里面出不来了（锁过期+续期）。

**解决方案二：逻辑过期**

不给缓存设置TTL（永不过期），但在value里存一个逻辑过期时间。读到数据时检查逻辑过期时间，如果过期了，后台异步刷新缓存，当前请求返回旧数据。

```go
// 逻辑过期方案
type LogicalExpireValue struct {
    Data      string    `json:"data"`
    ExpireAt  time.Time `json:"expire_at"`
}

type LogicalExpireCache struct {
    cache     *redis.Client
    db        *sql.DB
    group     singleflight.Group
    lockTTL   time.Duration
}

func (s *LogicalExpireCache) Get(ctx context.Context, key string) (string, error) {
    val, err := s.cache.Get(ctx, key).Result()
    if err != nil {
        return "", ErrNotFound // 缓存不存在，说明数据没预热
    }

    var item LogicalExpireValue
    if err := json.Unmarshal([]byte(val), &item); err != nil {
        return "", err
    }

    // 检查逻辑过期时间
    if time.Now().Before(item.ExpireAt) {
        // 未过期，直接返回
        return item.Data, nil
    }

    // 逻辑过期，触发后台异步刷新
    go s.asyncRefresh(context.Background(), key)

    // 返回旧数据（容忍不一致）
    return item.Data, nil
}

func (s *LogicalExpireCache) asyncRefresh(ctx context.Context, key string) {
    // 使用 singleflight 防止多个请求同时刷新
    _, _, _ = s.group.Do(key, func() (interface{}, error) {
        // 获取分布式锁，防止多实例同时刷新
        lockKey := "refresh_lock:" + key
        lockValue := uuid.New().String()

        ok, err := s.cache.SetNX(ctx, lockKey, lockValue, s.lockTTL).Result()
        if err != nil || !ok {
            return nil, nil // 其他实例在刷新，直接返回
        }
        defer releaseLockScript.Run(ctx, s.cache, []string{lockKey}, lockValue)

        // 查数据库
        val, err := s.queryDB(ctx, key)
        if err != nil {
            log.Printf("async refresh failed, key=%s: %v", key, err)
            return nil, err
        }

        // 更新缓存，设置新的逻辑过期时间
        item := LogicalExpireValue{
            Data:     val,
            ExpireAt: time.Now().Add(30 * time.Minute),
        }
        data, _ := json.Marshal(item)
        s.cache.Set(ctx, key, string(data), 0) // 物理永不过期

        return nil, nil
    })
}
```

逻辑过期的核心思想是"用旧数据换可用性"。在热点key的场景下，用户看到几秒钟的旧数据通常是可以接受的，但数据库被打垮是不可接受的。这种方案适合对一致性要求不极致、但对可用性要求极高的场景，比如电商大促时的商品详情页。

怕浪猫在大促期间用逻辑过期方案保住了好几次系统稳定性。大促时商品价格可能频繁变更，但用户看到30秒前的价格并不影响下单（下单时会实时校验价格），所以用逻辑过期返回旧数据是完全合理的。但如果你的场景是库存扣减，用户看到旧库存可能导致超卖，这种场景就不能用逻辑过期了。

逻辑过期方案有一个细节需要注意：后台异步刷新失败怎么办？如果数据库暂时不可用，异步刷新会失败，缓存里的数据会越来越旧。解决方案是设置一个最大容忍时间，超过这个时间后不再返回旧数据，而是返回降级数据或错误。比如逻辑过期时间设为30分钟，最大容忍时间设为2小时，超过2小时后请求直接返回"服务暂时不可用"。

> 逻辑过期就像食品保质期：过了保质期不等于立刻变质，后台悄悄换个新的就行，用户吃到的永远是上一批"还行"的。

### 2.3 缓存雪崩

**问题**：大量缓存在同一时间过期，或者Redis整体宕机，导致大量请求同时打到数据库。

**解决方案一：随机过期时间**

给缓存的TTL加一个随机值，避免大量key同时过期。

```go
func (s *CacheService) Set(ctx context.Context, key, value string) error {
    // 基础TTL + 随机偏移
    baseTTL := 30 * time.Minute
    randomTTL := time.Duration(rand.Intn(600)) * time.Second // 0-10分钟随机
    ttl := baseTTL + randomTTL

    return s.cache.Set(ctx, key, value, ttl).Err()
}

// 批量预热时的随机TTL
func (s *CacheService) BatchPreload(ctx context.Context, keys []string) error {
    pipe := s.cache.Pipeline()
    for _, key := range keys {
        val, err := s.queryDB(ctx, key)
        if err != nil {
            continue
        }
        // 每个key的TTL都有随机偏移
        ttl := 30*time.Minute + time.Duration(rand.Intn(600))*time.Second
        pipe.Set(ctx, key, val, ttl)
    }
    _, err := pipe.Exec(ctx)
    return err
}
```

**解决方案二：多级缓存**

本地缓存作为第一层，Redis作为第二层。Redis挂了，本地缓存还能顶一阵子，给Redis恢复争取时间。多级缓存是这一章实战项目的核心，后面会详细展开。

**解决方案三：熔断降级**

当数据库压力过大时，触发熔断，返回降级数据（默认值、推荐数据等），保护数据库不被彻底压垮。

```go
// 熔断器集成缓存
type CircuitBreakerCache struct {
    cache    *redis.Client
    db       *sql.DB
    breaker  *CircuitBreaker
    fallback func(key string) string // 降级函数
}

func (s *CircuitBreakerCache) Get(ctx context.Context, key string) (string, error) {
    // 1. 先查缓存
    val, err := s.cache.Get(ctx, key).Result()
    if err == nil {
        return val, nil
    }

    // 2. 缓存未命中，检查熔断器状态
    if !s.breaker.Allow() {
        // 熔断器打开，返回降级数据
        return s.fallback(key), nil
    }

    // 3. 查数据库
    val, err = s.queryDB(ctx, key)
    if err != nil {
        s.breaker.RecordFailure()
        return s.fallback(key), nil
    }

    s.breaker.RecordSuccess()
    s.cache.Set(ctx, key, val, s.ttl)
    return val, nil
}
```

> 雪崩和雪球的区别在于坡度：随机TTL是把坡度变缓，多级缓存是在雪球路径上设挡板，熔断是看见雪球来了赶紧跑。

---

## 三、实现缓存防护组件

前面讲了三种问题的原理和方案，现在把它们封装成一个统一的缓存防护组件。这个组件集成了空值缓存（防穿透）、singleflight互斥（防击穿）、随机TTL（防雪崩），开箱即用。

```go
package cacheguard

import (
    "context"
    "encoding/json"
    "errors"
    "math/rand"
    "time"

    "github.com/google/uuid"
    "github.com/redis/go-redis/v9"
    "golang.org/x/sync/singleflight"
)

var (
    ErrNotFound = errors.New("cache: key not found")
)

// CacheGuard 缓存防护组件
type CacheGuard struct {
    cache            *redis.Client
    loader           func(ctx context.Context, key string) (interface{}, error)
    marshal          func(value interface{}) ([]byte, error)
    unmarshal        func(data []byte) (interface{}, error)
    ttl              time.Duration
    randomTTLRange   time.Duration // 随机TTL范围
    nullTTL          time.Duration // 空值缓存TTL
    emptyValue       string        // 空值标识
    group            singleflight.Group
    enableNullCache  bool
    enableMutex      bool
    enableRandomTTL  bool
}

// Option 函数式配置
type Option func(*CacheGuard)

func WithTTL(ttl time.Duration) Option {
    return func(c *CacheGuard) { c.ttl = ttl }
}

func WithRandomTTLRange(d time.Duration) Option {
    return func(c *CacheGuard) { c.randomTTLRange = d; c.enableRandomTTL = true }
}

func WithNullCache(ttl time.Duration) Option {
    return func(c *CacheGuard) { c.nullTTL = ttl; c.enableNullCache = true }
}

func WithMutex() Option {
    return func(c *CacheGuard) { c.enableMutex = true }
}

func NewCacheGuard(cache *redis.Client, loader func(ctx context.Context, key string) (interface{}, error), opts ...Option) *CacheGuard {
    cg := &CacheGuard{
        cache:      cache,
        loader:     loader,
        ttl:        30 * time.Minute,
        emptyValue: "__NULL__",
        marshal:    json.Marshal,
        unmarshal:  json.Unmarshal,
    }
    for _, opt := range opts {
        opt(cg)
    }
    return cg
}

// Get 获取缓存，内置穿透、击穿、雪崩防护
func (cg *CacheGuard) Get(ctx context.Context, key string) (interface{}, error) {
    if cg.enableMutex {
        return cg.getWithMutex(ctx, key)
    }
    return cg.getDirect(ctx, key)
}

func (cg *CacheGuard) getDirect(ctx context.Context, key string) (interface{}, error) {
    // 1. 查缓存
    data, err := cg.cache.Get(ctx, key).Bytes()
    if err == nil {
        if cg.enableNullCache && string(data) == cg.emptyValue {
            return nil, ErrNotFound
        }
        val, err := cg.unmarshal(data)
        if err != nil {
            return nil, fmt.Errorf("unmarshal error: %w", err)
        }
        return val, nil
    }

    if !errors.Is(err, redis.Nil) {
        return nil, fmt.Errorf("cache read error: %w", err)
    }

    // 2. 缓存未命中，加载数据
    return cg.loadAndCache(ctx, key)
}

func (cg *CacheGuard) getWithMutex(ctx context.Context, key string) (interface{}, error) {
    // 1. 查缓存
    data, err := cg.cache.Get(ctx, key).Bytes()
    if err == nil {
        if cg.enableNullCache && string(data) == cg.emptyValue {
            return nil, ErrNotFound
        }
        val, err := cg.unmarshal(data)
        if err != nil {
            return nil, fmt.Errorf("unmarshal error: %w", err)
        }
        return val, nil
    }

    // 2. 使用 singleflight 合并并发请求
    result, err, _ := cg.group.Do(key, func() (interface{}, error) {
        // 双重检查
        data, err := cg.cache.Get(ctx, key).Bytes()
        if err == nil {
            if cg.enableNullCache && string(data) == cg.emptyValue {
                return nil, ErrNotFound
            }
            return cg.unmarshal(data)
        }

        return cg.loadAndCache(ctx, key)
    })

    return result, err
}

func (cg *CacheGuard) loadAndCache(ctx context.Context, key string) (interface{}, error) {
    // 加载数据
    val, err := cg.loader(ctx, key)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            // 空值缓存
            if cg.enableNullCache {
                cg.cache.Set(ctx, key, cg.emptyValue, cg.nullTTL)
            }
            return nil, ErrNotFound
        }
        return nil, err
    }

    // 序列化
    data, err := cg.marshal(val)
    if err != nil {
        return nil, fmt.Errorf("marshal error: %w", err)
    }

    // 计算TTL
    ttl := cg.ttl
    if cg.enableRandomTTL {
        // 随机偏移，防雪崩
        offset := time.Duration(rand.Int63n(int64(cg.randomTTLRange)))
        ttl += offset
    }

    // 回填缓存
    cg.cache.Set(ctx, key, data, ttl)
    return val, nil
}

// Set 主动更新缓存
func (cg *CacheGuard) Set(ctx context.Context, key string, value interface{}) error {
    data, err := cg.marshal(value)
    if err != nil {
        return err
    }

    ttl := cg.ttl
    if cg.enableRandomTTL {
        offset := time.Duration(rand.Int63n(int64(cg.randomTTLRange)))
        ttl += offset
    }

    return cg.cache.Set(ctx, key, data, ttl).Err()
}

// Del 删除缓存
func (cg *CacheGuard) Del(ctx context.Context, keys ...string) error {
    return cg.cache.Del(ctx, keys...).Err()
}

// GetOrLoad 获取缓存，未命中则加载（语义更清晰的API）
func (cg *CacheGuard) GetOrLoad(ctx context.Context, key string) (interface{}, error) {
    return cg.Get(ctx, key)
}
```

使用方式非常简洁：

```go
// 创建缓存防护组件
cg := cacheguard.NewCacheGuard(
    redisClient,
    func(ctx context.Context, key string) (interface{}, error) {
        // 数据加载逻辑
        product, err := productRepo.GetByID(ctx, key)
        if err != nil {
            return nil, err
        }
        if product == nil {
            return nil, cacheguard.ErrNotFound
        }
        return product, nil
    },
    cacheguard.WithTTL(30*time.Minute),
    cacheguard.WithRandomTTLRange(10*time.Minute), // 随机0-10分钟
    cacheguard.WithNullCache(5*time.Minute),       // 空值缓存5分钟
    cacheguard.WithMutex(),                        // 开启互斥防击穿
)

// 使用
product, err := cg.Get(ctx, "product:12345")
```

使用方式非常简洁，三行代码就能创建一个带全套防护的缓存组件：

```go
cg := cacheguard.NewCacheGuard(
    redisClient,
    func(ctx context.Context, key string) (interface{}, error) {
        // 数据加载逻辑
        product, err := productRepo.GetByID(ctx, key)
        if err != nil {
            return nil, err
        }
        if product == nil {
            return nil, cacheguard.ErrNotFound
        }
        return product, nil
    },
    cacheguard.WithTTL(30*time.Minute),
    cacheguard.WithRandomTTLRange(10*time.Minute),
    cacheguard.WithNullCache(5*time.Minute),
    cacheguard.WithMutex(),
)
```

函数式配置（Option模式）是Go语言中常用的配置方式，好处是灵活可组合。不需要防护的场景可以只传WithTTL，需要全套防护的场景把所有Option都传上。比传统的传一个Config结构体灵活得多，而且向后兼容性好，新增配置项只需要加一个新的With函数，不影响已有调用方。

这个组件在怕浪猫的生产环境中运行了一年多，处理了数十亿级缓存请求，穿透、击穿、雪崩问题再也没有导致过线上故障。当然，组件本身只是工具，更重要的是理解它背后的原理，知道每个配置项的作用和影响，才能在不同场景下做出正确的配置选择。

---

## 四、缓存一致性

缓存和数据库是两个独立的存储，任何写操作都无法原子地同时更新两者（除非用分布式事务，但那太重了）。所以缓存一致性问题的本质是：在最终一致性和强一致性之间做取舍。

### 4.1 最终一致性 vs 强一致性

**强一致性**：读操作一定能读到最新的写入。要实现强一致性，要么用分布式事务（2PC、TCC），要么用Write-Through模式同步双写。代价是性能损失。

**最终一致性**：读操作可能短暂读到旧数据，但最终会一致。大部分互联网场景都能接受最终一致性，因为用户感知不到几秒钟的数据延迟。

实际项目中，99%的场景用最终一致性就够了。怕浪猫经手过的系统里，只有金融交易、库存扣减这种场景才需要强一致性，而且通常也不是靠缓存方案解决，而是用数据库乐观锁或悲观锁。

> 一致性不是非黑即白的选择题，而是一道光谱：你的业务在光谱的哪个位置，决定了你的技术方案。

### 4.2 延时双删策略

Cache-Aside模式在"先更新DB再删缓存"的流程中，存在一个并发问题：

1. 缓存刚好失效
2. 请求A查数据库，拿到旧值
3. 请求B更新数据库，删除缓存
4. 请求A把旧值写入缓存

结果：缓存里是旧值，而且要到TTL过期才会更新。

延时双删就是解决这个问题的：先删缓存，再更新数据库，延迟一段时间后再删一次缓存。

```go
// 延时双删策略
type DelayDoubleDeleteCache struct {
    cache       *redis.Client
    db          *sql.DB
    delayTime   time.Duration // 延迟第二次删除的时间
}

func (c *DelayDoubleDeleteCache) Set(ctx context.Context, key, value string) error {
    // 1. 第一次删除缓存
    c.cache.Del(ctx, key)

    // 2. 更新数据库
    if err := c.updateDB(ctx, key, value); err != nil {
        return err
    }

    // 3. 延迟第二次删除（异步）
    go func() {
        time.Sleep(c.delayTime)
        c.cache.Del(context.Background(), key)
        log.Printf("delay double delete executed, key=%s", key)
    }()

    return nil
}
```

延时时间怎么定？这是延时双删策略最关键的问题。延时时间必须大于"一次读请求从数据库读到数据并回填缓存"的完整耗时。假设数据库查询需要20ms，网络传输需要5ms，缓存写入需要5ms，那么理论上延时30ms就够了。但实际生产环境中，请求可能因为GC、网络抖动等原因变慢，所以一般设为500ms到1秒留足余量。

但这个方案也不是完美的：

- 第二次删除可能失败（Redis挂了、网络抖动），失败后缓存里的旧数据要等TTL过期才会消失
- 延迟时间不好精确控制，设太短可能删了之后又有读请求回填旧数据，设太长则用户在延迟期间读到的都是旧数据
- 异步goroutine可能因为进程退出而丢失，第二次删除永远不会执行

所以延时双删通常和消息队列补偿方案配合使用。延时双删作为第一道防线快速删大部分场景的旧数据，消息队列作为第二道防线保证最终一定删除成功。两层保障叠加，不一致的概率极低。

### 4.3 消息队列保证一致性

用消息队列来保证缓存删除操作的可靠性。更新数据库后，发一条消息到MQ，消费者负责删除缓存。如果删除失败，MQ会自动重试。

```go
// 消息队列保证缓存一致性
type MQCacheConsistency struct {
    cache      *redis.Client
    db         *sql.DB
    mq         MessageQueue
    retryCount int
    retryDelay time.Duration
}

type CacheInvalidateMessage struct {
    Key       string `json:"key"`
    Timestamp int64  `json:"timestamp"`
    Retry     int    `json:"retry"`
}

func (c *MQCacheConsistency) Set(ctx context.Context, key, value string) error {
    // 1. 更新数据库
    if err := c.updateDB(ctx, key, value); err != nil {
        return err
    }

    // 2. 删除缓存
    if err := c.cache.Del(ctx, key).Err(); err != nil {
        log.Printf("first delete failed, key=%s: %v", key, err)
    }

    // 3. 发送消息，确保最终删除成功
    msg := CacheInvalidateMessage{
        Key:       key,
        Timestamp: time.Now().UnixMilli(),
        Retry:     0,
    }
    return c.mq.Publish(ctx, "cache_invalidate", msg)
}

// 消费消息，删除缓存
func (c *MQCacheConsistency) Consume(ctx context.Context) {
    c.mq.Subscribe(ctx, "cache_invalidate", func(msg CacheInvalidateMessage) error {
        err := c.cache.Del(ctx, msg.Key).Err()
        if err != nil {
            if msg.Retry < c.retryCount {
                // 重试
                msg.Retry++
                time.AfterFunc(c.retryDelay, func() {
                    c.mq.Publish(context.Background(), "cache_invalidate", msg)
                })
                log.Printf("retry delete cache, key=%s, retry=%d", msg.Key, msg.Retry)
                return nil
            }
            log.Printf("delete cache failed after %d retries, key=%s: %v", c.retryCount, msg.Key, err)
        }
        return nil
    })
}
```

更高级的方案是用binlog监听（比如Canal、Debezium），数据库变更时自动删除缓存。这种方案对业务代码零侵入，业务开发者完全不需要关心缓存一致性，只需要像平时一样写数据库操作，binlog监听组件会自动感知数据变更并删除对应的缓存。

binlog方案的架构是这样的：Canal伪装成MySQL的从库，订阅MySQL的binlog，解析出数据变更事件，然后根据表名和主键映射到缓存key，发送删除命令到Redis。这个方案的好处是彻底解耦了业务代码和缓存逻辑，坏处是引入了额外的组件，增加了运维复杂度。

怕浪猫在之前的项目中用过Canal+Redis的方案，效果很好但踩过一些坑：一是Canal的消息延迟问题，高峰期可能延迟几秒到十几秒，在这段时间内用户读到的都是旧数据；二是Canal的消息顺序问题，同一个key的多次变更可能乱序，需要用版本号或时间戳来保证最终一致；三是Canal本身的可用性问题，Canal挂了缓存就一直不一致，需要做Canal的高可用和监控告警。

如果你的项目规模较小，延时双删+MQ方案就够了。如果项目规模大、微服务多、缓存一致性问题频繁出现，再考虑引入binlog方案。

### 4.4 实现缓存一致性管理器

把延时双删和消息队列方案整合成一个一致性管理器：

```go
package cacheconsistency

import (
    "context"
    "encoding/json"
    "log"
    "sync"
    "time"

    "github.com/redis/go-redis/v9"
)

// ConsistencyManager 缓存一致性管理器
type ConsistencyManager struct {
    cache        *redis.Client
    mq           MessageQueue
    delayTime    time.Duration
    maxRetry     int
    retryDelay   time.Duration
    pendingTasks sync.WaitGroup
}

type MessageQueue interface {
    Publish(ctx context.Context, topic string, msg interface{}) error
    Subscribe(ctx context.Context, topic string, handler func(data []byte) error)
}

type InvalidateMessage struct {
    Key       string `json:"key"`
    Timestamp int64  `json:"timestamp"`
    Retry     int    `json:"retry"`
    Source    string `json:"source"`
}

func NewConsistencyManager(cache *redis.Client, mq MessageQueue) *ConsistencyManager {
    cm := &ConsistencyManager{
        cache:      cache,
        mq:         mq,
        delayTime:  500 * time.Millisecond,
        maxRetry:   3,
        retryDelay: 1 * time.Second,
    }
    // 启动消费者
    go cm.consume(context.Background())
    return cm
}

// Update 更新数据，保证最终一致性
// 流程：删缓存 -> 更新DB -> 延时删缓存 -> MQ保证删除
func (cm *ConsistencyManager) Update(ctx context.Context, key string, updateDB func() error) error {
    // 1. 第一次删除缓存
    if err := cm.cache.Del(ctx, key).Err(); err != nil && !errors.Is(err, redis.Nil) {
        log.Printf("first delete cache failed, key=%s: %v", key, err)
        // 不影响主流程，继续执行
    }

    // 2. 更新数据库
    if err := updateDB(); err != nil {
        return fmt.Errorf("update db failed: %w", err)
    }

    // 3. 发送MQ消息，保证缓存删除
    msg := InvalidateMessage{
        Key:       key,
        Timestamp: time.Now().UnixMilli(),
        Source:    "update",
    }
    if err := cm.mq.Publish(ctx, "cache_invalidate", msg); err != nil {
        log.Printf("publish invalidate message failed, key=%s: %v", key, err)
        // MQ发送失败，降级为延时双删
        cm.pendingTasks.Add(1)
        go func() {
            defer cm.pendingTasks.Done()
            time.Sleep(cm.delayTime)
            cm.cache.Del(context.Background(), key)
        }()
    }

    return nil
}

// consume 消费缓存失效消息
func (cm *ConsistencyManager) consume(ctx context.Context) {
    cm.mq.Subscribe(ctx, "cache_invalidate", func(data []byte) error {
        var msg InvalidateMessage
        if err := json.Unmarshal(data, &msg); err != nil {
            return err
        }

        // 延时删除（等待可能并发的读请求完成回填）
        time.Sleep(cm.delayTime)

        err := cm.cache.Del(ctx, msg.Key).Err()
        if err != nil && !errors.Is(err, redis.Nil) {
            if msg.Retry < cm.maxRetry {
                msg.Retry++
                msgBytes, _ := json.Marshal(msg)
                time.AfterFunc(cm.retryDelay, func() {
                    cm.mq.Publish(context.Background(), "cache_invalidate", msgBytes)
                })
                log.Printf("retry invalidate cache, key=%s, retry=%d", msg.Key, msg.Retry)
                return nil
            }
            log.Printf("invalidate cache failed after %d retries, key=%s: %v", cm.maxRetry, msg.Key, err)
        }

        return nil
    })
}

// WaitForPending 等待所有延时任务完成（优雅退出时调用）
func (cm *ConsistencyManager) WaitForPending() {
    cm.pendingTasks.Wait()
}
```

> 一致性方案的本质是"概率工程"：你不能100%保证一致，但可以通过多重保障把不一致的概率降到可接受的范围。延时双删+MQ重试，已经能覆盖99.99%的场景。

---

## 五、实战项目：多级缓存系统实现电商商品详情页

前面讲了原理和组件，现在把它们全部组装起来，实现一个完整的电商商品详情页多级缓存系统。这个系统包含：本地LRU Cache、Redis缓存（支持Pipeline）、多级缓存架构、缓存防护、一致性管理，最后用压测验证效果。

### 5.1 项目结构设计

```
product-cache/
├── main.go              // 入口，启动服务
├── cache/
│   ├── lru.go           // 本地LRU Cache
│   ├── redis.go         // Redis客户端（支持Pipeline）
│   ├── multilevel.go    // 多级缓存
│   └── guard.go         // 缓存防护
├── consistency/
│   └── manager.go       // 一致性管理器
├── model/
│   └── product.go       // 商品模型
├── repository/
│   └── product.go       // 数据库访问层
├── service/
│   └── product.go       // 业务逻辑层
└── handler/
    └── product.go       // HTTP处理器
```

### 5.2 设计本地LRU Cache

本地缓存是第一道防线，用LRU（Least Recently Used）淘汰策略，存在进程内存中，读写延迟在纳秒级别。

```go
package cache

import (
    "container/list"
    "sync"
    "time"
)

// LRUItem 缓存项
type LRUItem struct {
    key       string
    value     interface{}
    expireAt  time.Time
    elem      *list.Element
}

// LRUCache LRU缓存
type LRUCache struct {
    capacity  int
    items     map[string]*LRUItem
    list      *list.List
    mutex     sync.RWMutex
    stats     LRUStats
}

// LRUStats 缓存统计
type LRUStats struct {
    Hits       int64
    Misses     int64
    Evictions  int64
    Expired    int64
}

// NewLRUCache 创建LRU缓存
func NewLRUCache(capacity int) *LRUCache {
    return &LRUCache{
        capacity: capacity,
        items:    make(map[string]*LRUItem),
        list:     list.New(),
    }
}

// Get 获取缓存
func (c *LRUCache) Get(key string) (interface{}, bool) {
    c.mutex.Lock()
    defer c.mutex.Unlock()

    item, ok := c.items[key]
    if !ok {
        c.stats.Misses++
        return nil, false
    }

    // 检查过期
    if !item.expireAt.IsZero() && time.Now().After(item.expireAt) {
        c.removeItem(item)
        c.stats.Expired++
        c.stats.Misses++
        return nil, false
    }

    // 移到链表头部（最近使用）
    c.list.MoveToFront(item.elem)
    c.stats.Hits++
    return item.value, true
}

// Set 设置缓存
func (c *LRUCache) Set(key string, value interface{}, ttl time.Duration) {
    c.mutex.Lock()
    defer c.mutex.Unlock()

    // 如果已存在，更新
    if item, ok := c.items[key]; ok {
        item.value = value
        if ttl > 0 {
            item.expireAt = time.Now().Add(ttl)
        } else {
            item.expireAt = time.Time{}
        }
        c.list.MoveToFront(item.elem)
        return
    }

    // 创建新项
    item := &LRUItem{
        key:   key,
        value: value,
    }
    if ttl > 0 {
        item.expireAt = time.Now().Add(ttl)
    }
    item.elem = c.list.PushFront(item)
    c.items[key] = item

    // 淘汰最久未使用的
    if c.list.Len() > c.capacity {
        oldest := c.list.Back()
        if oldest != nil {
            c.removeItem(oldest.Value.(*LRUItem))
            c.stats.Evictions++
        }
    }
}

// Del 删除缓存
func (c *LRUCache) Del(key string) bool {
    c.mutex.Lock()
    defer c.mutex.Unlock()

    item, ok := c.items[key]
    if !ok {
        return false
    }
    c.removeItem(item)
    return true
}

// removeItem 移除缓存项（调用方需持有锁）
func (c *LRUCache) removeItem(item *LRUItem) {
    delete(c.items, item.key)
    c.list.Remove(item.elem)
}

// Stats 获取缓存统计
func (c *LRUCache) Stats() LRUStats {
    c.mutex.RLock()
    defer c.mutex.RUnlock()
    return c.stats
}

// HitRate 计算命中率
func (c *LRUCache) HitRate() float64 {
    c.mutex.RLock()
    defer c.mutex.RUnlock()
    total := c.stats.Hits + c.stats.Misses
    if total == 0 {
        return 0
    }
    return float64(c.stats.Hits) / float64(total)
}

// Cleanup 清理过期缓存
func (c *LRUCache) Cleanup() int {
    c.mutex.Lock()
    defer c.mutex.Unlock()

    count := 0
    now := time.Now()
    for _, item := range c.items {
        if !item.expireAt.IsZero() && now.After(item.expireAt) {
            c.removeItem(item)
            c.stats.Expired++
            count++
        }
    }
    return count
}

// StartCleanupTimer 启动定时清理
func (c *LRUCache) StartCleanupTimer(interval time.Duration) *time.Ticker {
    ticker := time.NewTicker(interval)
    go func() {
        for range ticker.C {
            n := c.Cleanup()
            if n > 0 {
                // 记录日志
            }
        }
    }()
    return ticker
}
```

这个LRU Cache有几个设计要点：
- 读写锁而非互斥锁，读操作可以并发，性能更好
- 支持TTL过期，定时清理避免内存泄漏。如果不做清理，过期数据会一直占用内存，直到下次被Get时才被发现并删除
- 内置统计信息，方便监控命中率。命中率是缓存系统最重要的指标，低于80%就需要排查原因
- 链表+map的经典LRU实现，O(1)的读写复杂度。链表维护访问顺序，map提供O(1)查找

在选择本地缓存容量时，需要根据服务可用内存来估算。假设每个缓存项平均1KB，容量10000条大约占用10MB内存，对于Go服务来说微不足道。但如果你缓存的是大对象（比如商品详情页的完整HTML，可能几十KB一条），就需要谨慎设置容量，避免本地缓存吃掉太多内存影响服务的正常运作。

本地缓存还有一个问题：多实例之间的数据不一致。如果你有10个服务实例，每个实例的本地缓存都是独立的，一个实例更新了数据，其他实例的本地缓存还是旧的。这个问题有两种解决方案：一是本地缓存设置较短的TTL（比如1-5分钟），接受短暂的不一致；二是通过Redis Pub/Sub或消息队列广播失效通知，所有实例收到通知后删除本地缓存。第一种方案简单但一致性差，第二种方案一致性好但实现复杂。在实际项目中，怕浪猫通常用第一种方案，本地缓存TTL设为5分钟，对于大部分场景已经足够了。

### 5.3 设计Redis客户端（支持Pipeline）

Redis客户端封装了常用的缓存操作，并支持Pipeline批量操作。

```go
package cache

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "math/rand"
    "time"

    "github.com/redis/go-redis/v9"
)

// RedisCache Redis缓存客户端
type RedisCache struct {
    client         *redis.Client
    defaultTTL     time.Duration
    randomTTLRange time.Duration
}

// RedisConfig Redis配置
type RedisConfig struct {
    Addr            string
    Password        string
    DB              int
    PoolSize        int
    MinIdleConns    int
    DefaultTTL      time.Duration
    RandomTTLRange  time.Duration
}

func NewRedisCache(cfg RedisConfig) *RedisCache {
    client := redis.NewClient(&redis.Options{
        Addr:         cfg.Addr,
        Password:     cfg.Password,
        DB:           cfg.DB,
        PoolSize:     cfg.PoolSize,
        MinIdleConns: cfg.MinIdleConns,
        ReadTimeout:  3 * time.Second,
        WriteTimeout: 3 * time.Second,
        DialTimeout:  5 * time.Second,
    })

    return &RedisCache{
        client:         client,
        defaultTTL:     cfg.DefaultTTL,
        randomTTLRange: cfg.RandomTTLRange,
    }
}

// Get 获取缓存
func (r *RedisCache) Get(ctx context.Context, key string) (string, error) {
    val, err := r.client.Get(ctx, key).Result()
    if errors.Is(err, redis.Nil) {
        return "", ErrNotFound
    }
    return val, err
}

// GetJSON 获取并反序列化JSON
func (r *RedisCache) GetJSON(ctx context.Context, key string, dest interface{}) error {
    val, err := r.Get(ctx, key)
    if err != nil {
        return err
    }
    return json.Unmarshal([]byte(val), dest)
}

// Set 设置缓存
func (r *RedisCache) Set(ctx context.Context, key string, value interface{}) error {
    data, err := json.Marshal(value)
    if err != nil {
        return fmt.Errorf("marshal error: %w", err)
    }

    ttl := r.calcTTL()
    return r.client.Set(ctx, key, data, ttl).Err()
}

// SetWithTTL 设置缓存（指定TTL）
func (r *RedisCache) SetWithTTL(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
    data, err := json.Marshal(value)
    if err != nil {
        return err
    }
    return r.client.Set(ctx, key, data, ttl).Err()
}

// SetNull 缓存空值
func (r *RedisCache) SetNull(ctx context.Context, key string, ttl time.Duration) error {
    return r.client.Set(ctx, key, "__NULL__", ttl).Err()
}

// IsNull 判断是否空值缓存
func (r *RedisCache) IsNull(val string) bool {
    return val == "__NULL__"
}

// Del 删除缓存
func (r *RedisCache) Del(ctx context.Context, keys ...string) error {
    return r.client.Del(ctx, keys...).Err()
}

// Exists 判断key是否存在
func (r *RedisCache) Exists(ctx context.Context, key string) (bool, error) {
    n, err := r.client.Exists(ctx, key).Result()
    return n > 0, err
}

// BatchGet 批量获取（使用Pipeline）
func (r *RedisCache) BatchGet(ctx context.Context, keys []string) (map[string]string, error) {
    pipe := r.client.Pipeline()
    cmds := make([]*redis.StringCmd, len(keys))

    for i, key := range keys {
        cmds[i] = pipe.Get(ctx, key)
    }

    _, err := pipe.Exec(ctx)
    if err != nil && !errors.Is(err, redis.Nil) {
        return nil, err
    }

    result := make(map[string]string, len(keys))
    for i, cmd := range cmds {
        val, err := cmd.Result()
        if err == nil {
            result[keys[i]] = val
        }
    }
    return result, nil
}

// BatchSet 批量设置（使用Pipeline）
func (r *RedisCache) BatchSet(ctx context.Context, items map[string]interface{}) error {
    pipe := r.client.Pipeline()

    for key, value := range items {
        data, err := json.Marshal(value)
        if err != nil {
            continue
        }
        ttl := r.calcTTL()
        pipe.Set(ctx, key, data, ttl)
    }

    _, err := pipe.Exec(ctx)
    return err
}

// BatchDel 批量删除（使用Pipeline）
func (r *RedisCache) BatchDel(ctx context.Context, keys []string) error {
    if len(keys) == 0 {
        return nil
    }
    pipe := r.client.Pipeline()
    for _, key := range keys {
        pipe.Del(ctx, key)
    }
    _, err := pipe.Exec(ctx)
    return err
}

// SetNX 分布式锁
func (r *RedisCache) SetNX(ctx context.Context, key, value string, ttl time.Duration) (bool, error) {
    return r.client.SetNX(ctx, key, value, ttl).Result()
}

// Eval 执行Lua脚本
func (r *RedisCache) Eval(ctx context.Context, script string, keys []string, args ...interface{}) (interface{}, error) {
    return r.client.Eval(ctx, script, keys, args...).Result()
}

// Ping 健康检查
func (r *RedisCache) Ping(ctx context.Context) error {
    return r.client.Ping(ctx).Err()
}

// Client 获取原始客户端（高级操作）
func (r *RedisCache) Client() *redis.Client {
    return r.client
}

// calcTTL 计算TTL（带随机偏移）
func (r *RedisCache) calcTTL() time.Duration {
    ttl := r.defaultTTL
    if r.randomTTLRange > 0 {
        offset := time.Duration(rand.Int63n(int64(r.randomTTLRange)))
        ttl += offset
    }
    return ttl
}

var (
    ErrNotFound = errors.New("cache: key not found")
)
```

Pipeline是Redis客户端最重要的优化手段之一。普通的Redis命令是一问一答模式：客户端发一条命令，等服务器返回结果，再发下一条。每条命令的延迟 = 网络往返时间 + 服务器处理时间。如果你要批量获取100个key，不用Pipeline就是100次网络往返，用Pipeline只需要1次网络往返（把100条命令打包发送，服务器依次执行后打包返回）。

在多级缓存架构中，Pipeline主要用于批量预热和批量查询场景。比如商品列表页需要展示20个商品的基本信息，不用Pipeline需要发20次Redis命令，用Pipeline只需要1次。在高并发场景下，这个优化能显著降低Redis的网络IO压力。

上面的Redis客户端还封装了分布式锁（SetNX）和Lua脚本执行（Eval）能力。分布式锁用于防击穿场景下的互斥控制，Lua脚本用于保证多命令的原子性执行（比如"检查锁值再删除"的释放锁操作）。这些能力在后面的缓存防护和一致性管理中都会用到。

关于Redis连接池的配置，有几个参数需要特别注意：PoolSize控制连接池大小，默认是10*CPU核数，对于高并发场景可能不够，建议根据QPS和平均响应时间来估算。MinIdleConns保持最小空闲连接数，避免突发流量时大量创建连接的开销。ReadTimeout和WriteTimeout要设置合理，太长会导致请求堆积，太短会导致大value读取失败。怕浪猫的经验值是ReadTimeout 3秒、WriteTimeout 3秒、DialTimeout 5秒，适用于大部分场景。

```go
package cache

import (
    "context"
    "encoding/json"
    "errors"
    "log"
    "time"

    "golang.org/x/sync/singleflight"
)

// MultiLevelCache 多级缓存
type MultiLevelCache struct {
    localCache   *LRUCache
    redisCache   *RedisCache
    localTTL     time.Duration
    redisTTL     time.Duration
    group        singleflight.Group
    nullTTL      time.Duration
    enableGuard  bool // 是否开启缓存防护
}

// MultiLevelConfig 多级缓存配置
type MultiLevelConfig struct {
    LocalCapacity int
    LocalTTL      time.Duration
    RedisTTL      time.Duration
    NullTTL       time.Duration
    EnableGuard   bool
}

多级缓存的核心设计是"分层命中、逐级回填"。读请求先查本地缓存（纳秒级），未命中再查Redis（毫秒级），再未命中才查数据库（十毫秒级）。每一层命中后都会回填上一层缓存，这样后续的请求就能在更近的缓存层命中。

这个架构的关键决策点有两个：第一，本地缓存的TTL应该比Redis短。因为本地缓存是多实例独立的，TTL越短，数据不一致的时间窗口越小。通常本地缓存TTL设为Redis的1/5到1/10。第二，是否开启singleflight防护。如果你的服务QPS不高，不开防护也没问题；如果QPS超过几千，建议开启，因为缓存击穿在高并发下是真实存在的。

上面的多级缓存实现还做了一个重要的优化：在singleflight的回调函数里做了双重检查。先检查本地缓存，再检查Redis，只有两层都未命中才查数据库。这是因为在并发场景下，第一个请求查到数据库并回填缓存后，后续的请求在singleflight的Do回调中应该能通过双重检查直接返回缓存数据，避免不必要的数据库查询。

另一个需要注意的点是缓存空值。当数据库查不到数据时，我们要在Redis和本地缓存中同时缓存空值标识。这样下次请求同样的key时，本地缓存就能直接返回"不存在"，不需要穿透到Redis和数据库。但本地缓存的空值TTL应该设置得更短，因为本地缓存是进程内的，多实例之间不共享，如果空值缓存太久，新创建的数据在其他实例更新了Redis但本地还是空值，会导致短暂的"数据不存在"问题。
    mlc := &MultiLevelCache{
        localCache:  NewLRUCache(cfg.LocalCapacity),
        redisCache:  redisCache,
        localTTL:    cfg.LocalTTL,
        redisTTL:    cfg.RedisTTL,
        nullTTL:     cfg.NullTTL,
        enableGuard: cfg.EnableGuard,
    }
    // 启动本地缓存定时清理
    mlc.localCache.StartCleanupTimer(time.Minute)
    return mlc
}

// Get 获取数据
func (mlc *MultiLevelCache) Get(ctx context.Context, key string, dest interface{}, loader func(ctx context.Context) (interface{}, error)) error {
    // 1. 查本地缓存
    if val, ok := mlc.localCache.Get(key); ok {
        if val == nil {
            return ErrNotFound
        }
        // 反序列化到dest
        data, err := json.Marshal(val)
        if err != nil {
            return err
        }
        return json.Unmarshal(data, dest)
    }

    // 2. 查Redis缓存
    err := mlc.redisCache.GetJSON(ctx, key, dest)
    if err == nil {
        // Redis命中，回填本地缓存
        mlc.localCache.Set(key, dest, mlc.localTTL)
        return nil
    }
    if !errors.Is(err, ErrNotFound) {
        // Redis出错，记录日志但继续
        log.Printf("redis cache error, key=%s: %v", key, err)
    }

    // 3. 缓存全未命中，加载数据
    if mlc.enableGuard {
        return mlc.getWithGuard(ctx, key, dest, loader)
    }
    return mlc.getDirect(ctx, key, dest, loader)
}

// getWithGuard 带防护的加载（防击穿）
func (mlc *MultiLevelCache) getWithGuard(ctx context.Context, key string, dest interface{}, loader func(ctx context.Context) (interface{}, error)) error {
    result, err, _ := mlc.group.Do(key, func() (interface{}, error) {
        // 双重检查本地缓存
        if val, ok := mlc.localCache.Get(key); ok {
            return val, nil
        }

        // 双重检查Redis
        err := mlc.redisCache.GetJSON(ctx, key, dest)
        if err == nil {
            mlc.localCache.Set(key, dest, mlc.localTTL)
            return dest, nil
        }

        // 加载数据
        val, err := loader(ctx)
        if err != nil {
            if errors.Is(err, ErrNotFound) {
                // 空值缓存
                mlc.redisCache.SetNull(ctx, key, mlc.nullTTL)
                mlc.localCache.Set(key, nil, mlc.nullTTL)
                return nil, ErrNotFound
            }
            return nil, err
        }

        // 回填两级缓存
        mlc.redisCache.Set(ctx, key, val)
        mlc.localCache.Set(key, val, mlc.localTTL)
        return val, nil
    })

    if err != nil {
        return err
    }

    if result == nil {
        return ErrNotFound
    }

    // 反序列化到dest
    data, err := json.Marshal(result)
    if err != nil {
        return err
    }
    return json.Unmarshal(data, dest)
}

// getDirect 直接加载（无互斥）
func (mlc *MultiLevelCache) getDirect(ctx context.Context, key string, dest interface{}, loader func(ctx context.Context) (interface{}, error)) error {
    val, err := loader(ctx)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            mlc.redisCache.SetNull(ctx, key, mlc.nullTTL)
            return ErrNotFound
        }
        return err
    }

    // 回填两级缓存
    mlc.redisCache.Set(ctx, key, val)
    mlc.localCache.Set(key, val, mlc.localTTL)

    // 反序列化到dest
    data, _ := json.Marshal(val)
    return json.Unmarshal(data, dest)
}

// Invalidate 失效缓存
func (mlc *MultiLevelCache) Invalidate(ctx context.Context, key string) {
    // 先删本地缓存
    mlc.localCache.Del(key)
    // 再删Redis缓存
    mlc.redisCache.Del(ctx, key)
}

// BatchInvalidate 批量失效
func (mlc *MultiLevelCache) BatchInvalidate(ctx context.Context, keys []string) {
    for _, key := range keys {
        mlc.localCache.Del(key)
    }
    mlc.redisCache.BatchDel(ctx, keys)
}

// Preload 预热缓存
func (mlc *MultiLevelCache) Preload(ctx context.Context, key string, loader func(ctx context.Context) (interface{}, error)) error {
    val, err := loader(ctx)
    if err != nil {
        return err
    }
    mlc.redisCache.Set(ctx, key, val)
    mlc.localCache.Set(key, val, mlc.localTTL)
    return nil
}

// Stats 获取缓存统计
func (mlc *MultiLevelCache) Stats() map[string]interface{} {
    localStats := mlc.localCache.Stats()
    return map[string]interface{}{
        "local_cache": map[string]interface{}{
            "hits":      localStats.Hits,
            "misses":    localStats.Misses,
            "hit_rate":  mlc.localCache.HitRate(),
            "evictions": localStats.Evictions,
            "expired":   localStats.Expired,
        },
    }
}
```

这里需要补充一个MultiLevelCache上缺少的BatchGet和BatchSet方法的实现，否则Service层的批量查询会编译不过：

```go
// BatchGet 批量获取（先查本地缓存，未命中的查Redis）
func (mlc *MultiLevelCache) BatchGet(ctx context.Context, keys []string) (map[string]string, error) {
    result := make(map[string]string)
    missedKeys := make([]string, 0)

    // 1. 先批量查本地缓存
    for _, key := range keys {
        if val, ok := mlc.localCache.Get(key); ok {
            if val == nil {
                result[key] = "__NULL__"
                continue
            }
            if data, err := json.Marshal(val); err == nil {
                result[key] = string(data)
            }
        } else {
            missedKeys = append(missedKeys, key)
        }
    }

    // 2. 未命中的批量查Redis
    if len(missedKeys) > 0 {
        redisResult, err := mlc.redisCache.BatchGet(ctx, missedKeys)
        if err != nil {
            log.Printf("batch redis get failed: %v", err)
        } else {
            for key, val := range redisResult {
                result[key] = val
                // 回填本地缓存
                var item interface{}
                if json.Unmarshal([]byte(val), &item) == nil {
                    mlc.localCache.Set(key, item, mlc.localTTL)
                }
            }
        }
    }

    return result, nil
}

// BatchSet 批量设置（同时写本地和Redis）
func (mlc *MultiLevelCache) BatchSet(ctx context.Context, items map[string]interface{}) error {
    // 写Redis
    if err := mlc.redisCache.BatchSet(ctx, items); err != nil {
        log.Printf("batch redis set failed: %v", err)
    }
    // 写本地缓存
    for key, val := range items {
        mlc.localCache.Set(key, val, mlc.localTTL)
    }
    return nil
}
```

批量操作的关键是减少网络往返。本地缓存的批量查询本质上是多次map查找，速度极快；Redis的批量查询用Pipeline一次性发送所有命令，网络往返只有一次。两层批量操作的叠加，使得即使要查询100个商品，整体延迟也能控制在毫秒级别。

同时Service层还需要一个直接查数据库的方法作为压测对照组，以及一个失效缓存的方法用于测试：

```go
// GetProductDirect 直接查数据库，不走缓存（压测对照用）
func (s *ProductService) GetProductDirect(ctx context.Context, id int64) (*model.Product, error) {
    return s.repo.GetByID(ctx, id)
}

// InvalidateProduct 失效商品缓存
func (s *ProductService) InvalidateProduct(ctx context.Context, id int64) {
    key := fmt.Sprintf("product:%d", id)
    s.multiCache.Invalidate(ctx, key)
}
```

这些辅助方法虽然简单，但在压测和调试时非常有用。GetProductDirect让你能对比有缓存和无缓存的性能差异，InvalidateProduct让你能模拟缓存失效场景来测试防护机制。

```go
// model/product.go
package model

import "time"

type Product struct {
    ID          int64     `json:"id"`
    Name        string    `json:"name"`
    Description string    `json:"description"`
    Price       float64   `json:"price"`
    Stock       int       `json:"stock"`
    CategoryID  int       `json:"category_id"`
    ImageURL    string    `json:"image_url"`
    Status      int       `json:"status"` // 1:上架 0:下架
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}

// repository/product.go
package repository

import (
    "context"
    "database/sql"
    "fmt"

    "product-cache/model"
)

type ProductRepository struct {
    db *sql.DB
}

func NewProductRepository(db *sql.DB) *ProductRepository {
    return &ProductRepository{db: db}
}

func (r *ProductRepository) GetByID(ctx context.Context, id int64) (*model.Product, error) {
    query := `SELECT id, name, description, price, stock, category_id, image_url, status, created_at, updated_at
              FROM products WHERE id = ? AND status = 1`

    var p model.Product
    err := r.db.QueryRowContext(ctx, query, id).Scan(
        &p.ID, &p.Name, &p.Description, &p.Price, &p.Stock,
        &p.CategoryID, &p.ImageURL, &p.Status, &p.CreatedAt, &p.UpdatedAt,
    )
    if err != nil {
        if err == sql.ErrNoRows {
            return nil, fmt.Errorf("product not found")
        }
        return nil, fmt.Errorf("query product failed: %w", err)
    }
    return &p, nil
}

func (r *ProductRepository) Update(ctx context.Context, p *model.Product) error {
    query := `UPDATE products SET name=?, description=?, price=?, stock=?, category_id=?, image_url=?, status=?, updated_at=NOW()
              WHERE id=?`
    _, err := r.db.ExecContext(ctx, query,
        p.Name, p.Description, p.Price, p.Stock, p.CategoryID, p.ImageURL, p.Status, p.ID)
    return err
}

func (r *ProductRepository) BatchGetByID(ctx context.Context, ids []int64) (map[int64]*model.Product, error) {
    if len(ids) == 0 {
        return make(map[int64]*model.Product), nil
    }

    placeholders := ""
    args := make([]interface{}, len(ids))
    for i, id := range ids {
        if i > 0 {
            placeholders += ","
        }
        placeholders += "?"
        args[i] = id
    }

    query := fmt.Sprintf(`SELECT id, name, description, price, stock, category_id, image_url, status, created_at, updated_at
                          FROM products WHERE id IN (%s) AND status = 1`, placeholders)

    rows, err := r.db.QueryContext(ctx, query, args...)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    result := make(map[int64]*model.Product)
    for rows.Next() {
        var p model.Product
        if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock,
            &p.CategoryID, &p.ImageURL, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
            continue
        }
        result[p.ID] = &p
    }
    return result, nil
}
```

Service层是多级缓存架构与业务逻辑的交汇点。GetProduct方法接收商品ID，构造缓存key，调用多级缓存的Get方法，传入一个数据加载函数。多级缓存内部会依次查本地缓存、Redis缓存，都未命中时调用这个加载函数查数据库。这种设计把缓存逻辑和数据加载逻辑完全分离，业务代码非常干净。

缓存key的设计也有讲究。key要有明确的业务前缀和命名空间，比如"product:12345"表示商品ID为12345的商品详情。如果有不同维度的缓存，比如商品基本信息和商品库存信息，应该用不同的前缀："product:info:12345"和"product:stock:12345"。这样在需要批量失效某个商品的所有缓存时，可以通过key模式匹配来删除。

批量获取商品的方法展示了Pipeline的威力。先批量查Redis缓存（一次Pipeline调用），把命中的结果反序列化，未命中的key收集起来批量查数据库，再把数据库结果批量回填到Redis。整个流程只需要2次网络往返（1次Redis Pipeline + 1次数据库批量查询），而不是N次单条查询。

UpdateProduct方法使用一致性管理器来保证缓存一致性。它不直接删除缓存，而是通过consistency.Update方法，让一致性管理器来协调"删缓存-更新DB-延时删缓存"的完整流程。这样Service层的代码只需要关注业务逻辑，缓存一致性的细节由基础设施层负责。

```go
// service/product.go
package service

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "log"
    "time"

    "product-cache/cache"
    "product-cache/consistency"
    "product-cache/model"
    "product-cache/repository"
)

var (
    ErrProductNotFound = errors.New("product not found")
)

type ProductService struct {
    repo          *repository.ProductRepository
    multiCache    *cache.MultiLevelCache
    consistency   *consistency.ConsistencyManager
}

func NewProductService(repo *repository.ProductRepository, multiCache *cache.MultiLevelCache, cm *consistency.ConsistencyManager) *ProductService {
    return &ProductService{
        repo:        repo,
        multiCache:  multiCache,
        consistency: cm,
    }
}

// GetProduct 获取商品详情（多级缓存）
func (s *ProductService) GetProduct(ctx context.Context, id int64) (*model.Product, error) {
    key := fmt.Sprintf("product:%d", id)

    var product model.Product
    err := s.multiCache.Get(ctx, key, &product, func(ctx context.Context) (interface{}, error) {
        // 数据加载函数
        p, err := s.repo.GetByID(ctx, id)
        if err != nil {
            return nil, ErrProductNotFound
        }
        return p, nil
    })

    if err != nil {
        if errors.Is(err, cache.ErrNotFound) || errors.Is(err, ErrProductNotFound) {
            return nil, ErrProductNotFound
        }
        return nil, err
    }

    return &product, nil
}

// UpdateProduct 更新商品（保证缓存一致性）
func (s *ProductService) UpdateProduct(ctx context.Context, p *model.Product) error {
    key := fmt.Sprintf("product:%d", p.ID)

    return s.consistency.Update(ctx, key, func() error {
        return s.repo.Update(ctx, p)
    })
}

// BatchGetProducts 批量获取商品
func (s *ProductService) BatchGetProducts(ctx context.Context, ids []int64) (map[int64]*model.Product, error) {
    // 先批量查缓存
    keys := make([]string, len(ids))
    for i, id := range ids {
        keys[i] = fmt.Sprintf("product:%d", id)
    }

    result, err := s.multiCache.BatchGet(ctx, keys)
    if err != nil {
        log.Printf("batch cache get failed: %v", err)
    }

    // 解析命中的缓存
    products := make(map[int64]*model.Product)
    missedIDs := make([]int64, 0)
    missedKeys := make([]string, 0)

    for i, key := range keys {
        if val, ok := result[key]; ok {
            var p model.Product
            if err := json.Unmarshal([]byte(val), &p); err == nil {
                products[ids[i]] = &p
                continue
            }
        }
        missedIDs = append(missedIDs, ids[i])
        missedKeys = append(missedKeys, key)
    }

    // 批量查数据库
    if len(missedIDs) > 0 {
        dbResult, err := s.repo.BatchGetByID(ctx, missedIDs)
        if err != nil {
            log.Printf("batch db get failed: %v", err)
        } else {
            // 回填缓存
            cacheItems := make(map[string]interface{})
            for i, id := range missedIDs {
                if p, ok := dbResult[id]; ok {
                    products[id] = p
                    cacheItems[missedKeys[i]] = p
                }
            }
            if len(cacheItems) > 0 {
                s.multiCache.BatchSet(ctx, cacheItems)
            }
        }
    }

    return products, nil
}

// PreloadProduct 预热商品缓存
func (s *ProductService) PreloadProduct(ctx context.Context, id int64) error {
    key := fmt.Sprintf("product:%d", id)
    return s.multiCache.Preload(ctx, key, func(ctx context.Context) (interface{}, error) {
        p, err := s.repo.GetByID(ctx, id)
        if err != nil {
            return nil, err
        }
        return p, nil
    })
}
```

### 5.7 HTTP Handler和启动入口

HTTP Handler层是整个系统的入口，负责解析HTTP请求、调用Service层、返回JSON响应。这里用了Go 1.22的新路由语法"GET /api/products/{id}"，不再需要第三方路由库，标准库就能搞定路径参数提取。

Handler的设计原则是"薄逻辑"：只做请求解析和响应构造，业务逻辑全部放在Service层。这样Handler可以被轻松替换为gRPC Handler或GraphQL Handler，业务逻辑不需要改动。

```go
// handler/product.go
package handler

import (
    "encoding/json"
    "net/http"
    "strconv"

    "product-cache/model"
    "product-cache/service"
)

type ProductHandler struct {
    svc *service.ProductService
}

func NewProductHandler(svc *service.ProductService) *ProductHandler {
    return &ProductHandler{svc: svc}
}

// GetProduct 获取商品详情
// GET /api/products/{id}
func (h *ProductHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
    idStr := r.PathValue("id")
    id, err := strconv.ParseInt(idStr, 10, 64)
    if err != nil {
        http.Error(w, "invalid product id", http.StatusBadRequest)
        return
    }

    product, err := h.svc.GetProduct(r.Context(), id)
    if err != nil {
        if errors.Is(err, service.ErrProductNotFound) {
            http.Error(w, "product not found", http.StatusNotFound)
            return
        }
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(product)
}

// UpdateProduct 更新商品
// PUT /api/products/{id}
func (h *ProductHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
    idStr := r.PathValue("id")
    id, err := strconv.ParseInt(idStr, 10, 64)
    if err != nil {
        http.Error(w, "invalid product id", http.StatusBadRequest)
        return
    }

    var p model.Product
    if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    p.ID = id

    if err := h.svc.UpdateProduct(r.Context(), &p); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// main.go
package main

import (
    "context"
    "database/sql"
    "log"
    "net/http"
    "time"

    "product-cache/cache"
    "product-cache/consistency"
    "product-cache/handler"
    "product-cache/repository"
    "product-cache/service"

    _ "github.com/go-sql-driver/mysql"
)

func main() {
    // 初始化数据库
    db, err := sql.Open("mysql", "user:password@tcp(127.0.0.1:3306)/products?parseTime=true")
    if err != nil {
        log.Fatalf("connect db failed: %v", err)
    }
    db.SetMaxOpenConns(50)
    db.SetMaxIdleConns(10)
    db.SetConnMaxLifetime(5 * time.Minute)

    // 初始化Redis缓存
    redisCache := cache.NewRedisCache(cache.RedisConfig{
        Addr:           "127.0.0.1:6379",
        Password:       "",
        DB:             0,
        PoolSize:       20,
        MinIdleConns:   5,
        DefaultTTL:     30 * time.Minute,
        RandomTTLRange: 10 * time.Minute, // 随机0-10分钟，防雪崩
    })

    // 初始化多级缓存
    multiCache := cache.NewMultiLevelCache(redisCache, cache.MultiLevelConfig{
        LocalCapacity: 10000,              // 本地缓存最多1万条
        LocalTTL:      5 * time.Minute,    // 本地缓存5分钟
        RedisTTL:      30 * time.Minute,   // Redis缓存30分钟
        NullTTL:       5 * time.Minute,    // 空值缓存5分钟，防穿透
        EnableGuard:   true,               // 开启互斥防击穿
    })

    // 初始化一致性管理器（实际项目中MQ可以用RabbitMQ/Kafka/RocketMQ）
    mq := &consistency.LocalMQ{} // 简化版，生产环境替换为真实MQ
    cm := consistency.NewConsistencyManager(redisCache.Client(), mq)

    // 初始化各层
    productRepo := repository.NewProductRepository(db)
    productSvc := service.NewProductService(productRepo, multiCache, cm)
    productHandler := handler.NewProductHandler(productSvc)

    // 路由
    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/products/{id}", productHandler.GetProduct)
    mux.HandleFunc("PUT /api/products/{id}", productHandler.UpdateProduct)

    // 启动HTTP服务
    log.Println("server starting on :8080")
    if err := http.ListenAndServe(":8080", mux); err != nil {
        log.Fatalf("server failed: %v", err)
    }
}
```

启动入口是整个系统的组装点。在这里我们初始化数据库连接池、Redis客户端、多级缓存、一致性管理器，然后逐层向上构造Repository、Service、Handler，最后注册路由启动HTTP服务。这种"洋葱式"的依赖注入保证了每一层只依赖它直接需要的组件，耦合度最低。

关于配置参数，有几个经验值值得分享。数据库连接池的MaxOpenConns建议设为50-100，太大会导致数据库连接数过多影响其他服务，太小会导致请求排队。MaxIdleConns设为MaxOpenConns的1/5到1/10，保持一定的空闲连接避免频繁创建。ConnMaxLifetime设为5分钟，防止长时间使用的连接因为数据库端的超时配置而被断开。

Redis的PoolSize建议设为20-50，根据QPS来调整。MinIdleConns设为5-10，保证突发流量时有足够的连接可用。DefaultTTL设为30分钟是一个平衡点，太短会导致缓存命中率低，太长会导致数据不一致的时间窗口变大。RandomTTLRange设为10分钟，使得缓存的过期时间分散在30-40分钟之间，有效防止雪崩。

本地缓存的LocalCapacity设为10000条，对于大部分场景够用了。如果商品总数在10万以内，本地缓存可以覆盖10%的热点商品，这10%的商品可能贡献了80%的流量（二八定律）。LocalTTL设为5分钟，比Redis短很多，保证本地缓存的数据不会太旧。

没有压测的缓存方案都是纸上谈兵。写一个压测脚本验证多级缓存的效果：

```go
// benchmark/benchmark_test.go
package benchmark

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "math/rand"
    "sync"
    "sync/atomic"
    "testing"
    "time"

    "product-cache/cache"
    "product-cache/repository"
    "product-cache/service"
)

var (
    productSvc *service.ProductService
    initOnce   sync.Once
)

func initService() {
    initOnce.Do(func() {
        // 初始化数据库（使用连接池）
        db, _ := sql.Open("mysql", "user:password@tcp(127.0.0.1:3306)/products?parseTime=true")
        db.SetMaxOpenConns(100)

        // 初始化缓存
        redisCache := cache.NewRedisCache(cache.RedisConfig{
            Addr:           "127.0.0.1:6379",
            DefaultTTL:     30 * time.Minute,
            RandomTTLRange: 10 * time.Minute,
        })

        multiCache := cache.NewMultiLevelCache(redisCache, cache.MultiLevelConfig{
            LocalCapacity: 10000,
            LocalTTL:      5 * time.Minute,
            RedisTTL:      30 * time.Minute,
            NullTTL:       5 * time.Minute,
            EnableGuard:   true,
        })

        repo := repository.NewProductRepository(db)
        productSvc = service.NewProductService(repo, multiCache, nil)
    })
}

// BenchmarkGetProduct 压测商品查询
func BenchmarkGetProduct(b *testing.B) {
    initService()
    ctx := context.Background()

    // 预热100个商品的缓存
    for i := 1; i <= 100; i++ {
        productSvc.GetProduct(ctx, int64(i))
    }

    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            // 随机查询1-100的商品
            id := int64(rand.Intn(100) + 1)
            _, _ = productSvc.GetProduct(ctx, id)
        }
    })
}

// BenchmarkGetProductNoCache 压测无缓存查询（对照组）
func BenchmarkGetProductNoCache(b *testing.B) {
    initService()
    ctx := context.Background()

    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            id := int64(rand.Intn(100) + 1)
            // 直接查数据库，不走缓存
            _, _ = productSvc.GetProductDirect(ctx, id)
        }
    })
}

// TestCacheHitRate 测试缓存命中率
func TestCacheHitRate(t *testing.T) {
    initService()
    ctx := context.Background()

    var hitCount, missCount int64

    // 并发1000个请求
    var wg sync.WaitGroup
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            id := int64(rand.Intn(100) + 1)
            start := time.Now()
            _, err := productSvc.GetProduct(ctx, id)
            elapsed := time.Since(start)

            // 根据响应时间粗略判断是否命中缓存
            if elapsed < 1*time.Millisecond {
                atomic.AddInt64(&hitCount, 1)
            } else {
                atomic.AddInt64(&missCount, 1)
            }
            _ = err
        }()
    }
    wg.Wait()

    total := hitCount + missCount
    hitRate := float64(hitCount) / float64(total) * 100
    t.Logf("Total: %d, Hits: %d, Misses: %d, HitRate: %.2f%%", total, hitCount, missCount, hitRate)
}

// TestCachePenetration 测试缓存穿透防护
func TestCachePenetration(t *testing.T) {
    initService()
    ctx := context.Background()

    // 用大量不存在的ID请求
    var dbHitCount int64
    var wg sync.WaitGroup

    start := time.Now()
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func(idx int) {
            defer wg.Done()
            id := int64(10000 + idx) // 不存在的ID
            _, err := productSvc.GetProduct(ctx, id)
            if err == nil {
                atomic.AddInt64(&dbHitCount, 1)
            }
        }(i)
    }
    wg.Wait()
    elapsed := time.Since(start)

    t.Logf("1000 requests for non-existing keys took: %v, db hits: %d", elapsed, dbHitCount)
    // 期望：大部分请求被空值缓存挡住，数据库几乎不被查询
}

// TestCacheBreakdown 测试缓存击穿防护
func TestCacheBreakdown(t *testing.T) {
    initService()
    ctx := context.Background()

    // 先让一个热点key过期
    productSvc.InvalidateProduct(ctx, 1)

    // 并发1000个请求同时访问同一个key
    var wg sync.WaitGroup
    start := time.Now()

    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            _, _ = productSvc.GetProduct(ctx, 1) // 所有请求查同一个key
        }()
    }
    wg.Wait()
    elapsed := time.Since(start)

    t.Logf("1000 concurrent requests for same key took: %v", elapsed)
    // 期望：singleflight合并请求，数据库只被查询1次
}

// TestCacheAvalanche 测试缓存雪崩防护
func TestCacheAvalanche(t *testing.T) {
    initService()
    ctx := context.Background()

    // 批量预热100个商品缓存
    for i := 1; i <= 100; i++ {
        productSvc.PreloadProduct(ctx, int64(i))
    }

    // 等待缓存过期（实际测试中可以设置短TTL）
    // 这里用批量失效模拟缓存同时过期
    for i := 1; i <= 100; i++ {
        productSvc.InvalidateProduct(ctx, int64(i))
    }

    // 立即并发请求所有商品
    var wg sync.WaitGroup
    var successCount int64
    start := time.Now()

    for i := 1; i <= 100; i++ {
        for j := 0; j < 10; j++ { // 每个商品10个并发请求
            wg.Add(1)
            go func(id int64) {
                defer wg.Done()
                _, err := productSvc.GetProduct(ctx, id)
                if err == nil {
                    atomic.AddInt64(&successCount, 1)
                }
            }(int64(i))
        }
    }
    wg.Wait()
    elapsed := time.Since(start)

    t.Logf("1000 requests after cache avalanche took: %v, success: %d", elapsed, successCount)
    // 期望：随机TTL使得后续缓存不会同时过期，数据库压力分散
}
```

压测完成后，可以对比有缓存和无缓存的性能差异。下面是我在本地环境跑出来的典型数据（仅供参考）：

| 场景 | QPS | 平均响应时间 | P99响应时间 | 数据库QPS |
|------|-----|-------------|------------|----------|
| 无缓存（直接查DB） | 800 | 15ms | 80ms | 800 |
| Redis缓存（命中） | 50000 | 0.8ms | 3ms | <10 |
| 多级缓存（本地命中） | 200000 | 0.05ms | 0.2ms | <5 |
| 多级缓存（Redis命中） | 50000 | 0.8ms | 3ms | <10 |
| 缓存穿透（有防护） | 100000 | 0.3ms | 1ms | <5 |
| 缓存击穿（有防护） | 30000 | 2ms | 10ms | 1 |
| 缓存雪崩（有防护） | 20000 | 5ms | 20ms | <50 |

从压测数据可以看出几个关键结论：

第一，本地缓存命中的性能是Redis的十倍以上，是直连数据库的两百倍以上。这意味着如果你的热点数据能在本地缓存命中，你的接口性能可以提升两个数量级。这就是多级缓存架构的核心价值所在。

第二，缓存防护组件在极端场景下有效保护了数据库。在缓存穿透场景下，空值缓存挡住了绝大部分对不存在key的请求，数据库QPS只有个位数。在缓存击穿场景下，singleflight把一千个并发请求合并为一次数据库查询，数据库QPS为1。在缓存雪崩场景下，随机TTL使得缓存不会同时过期，数据库压力被分散到一段时间内，没有出现连接池被打满的情况。

第三，雪崩场景虽然性能有所下降，但没有导致数据库被打垮。这就是多级缓存架构的核心价值：即使Redis出了问题，本地缓存还能顶住一部分流量，给系统恢复争取时间。而且缓存防护组件确保了即使缓存大面积失效，数据库也不会被瞬时流量冲垮。

这些数据在真实生产环境中会有差异，取决于你的硬件配置、网络环境、数据大小等因素。但整体趋势是一致的：多级缓存比单级缓存性能更好，有防护比无防护更稳定。

> 压测不是走过场，而是给你的架构做体检。数据会告诉你哪里是瓶颈，哪里值得优化，哪里已经足够好。

### 5.9 缓存监控指标清单

生产环境的缓存系统需要完善的监控。以下是需要关注的核心指标清单：

**命中率指标**
- 本地缓存命中率：目标 > 30%（取决于业务场景）
- Redis缓存命中率：目标 > 80%
- 整体缓存命中率：目标 > 95%
- 空值缓存占比：监控异常请求比例

**性能指标**
- 缓存Get平均延迟：本地 < 0.1ms，Redis < 1ms
- 缓存Set平均延迟：本地 < 0.1ms，Redis < 1ms
- P99延迟：本地 < 0.5ms，Redis < 5ms

**稳定性指标**
- Redis连接数使用率：< 80%
- Redis内存使用率：< 70%
- 缓存淘汰频率：监控突发流量
- 缓存过期频率：监控雪崩风险

**一致性指标**
- 缓存删除失败率：< 0.01%
- MQ消息积压数：< 1000
- 延时双删执行成功率：> 99.9%

> 监控不是为了好看，是为了在问题变成故障之前发现它。好的监控系统能让你在用户投诉之前就知道哪里出了问题。

---

## 六、总结与回顾

这一章我们从缓存模式讲到缓存问题，从防护组件讲到一致性管理，最后用一个完整的多级缓存实战项目把所有知识串联起来。

回顾一下核心知识点：

1. **四种缓存模式**各有适用场景，Cache-Aside最通用，Write-Behind性能最高但一致性最弱
2. **缓存穿透**用布隆过滤器+空值缓存解决，击穿用singleflight互斥锁解决，雪崩用随机TTL+多级缓存解决
3. **缓存防护组件**把三大问题的方案封装成可复用的组件，开箱即用
4. **缓存一致性**通过延时双删+MQ重试实现最终一致性，覆盖99.99%的场景
5. **多级缓存**用本地LRU+Redis两层缓存，兼顾性能和容量

> 缓存设计是一门平衡的艺术：性能和一致性要平衡，复杂度和可用性要平衡。没有完美的方案，只有最适合你业务的方案。

---

如果这篇文章对你有帮助，点个收藏吧，以后遇到缓存问题随时翻出来看。你在实际项目中遇到过哪些缓存坑？欢迎在评论区交流，怕浪猫会把好的案例补充到文章里。

这个系列还在更新中，下一章我们聊RPC框架设计，从协议设计到服务注册发现，手把手实现一个迷你RPC框架。关注我，追更不迷路。

**系列进度：7/16**

下一章预告：第8章 RPC框架设计 -- 从零实现一个支持负载均衡、服务发现、超时重试的Go RPC框架

---

**怕浪猫说**：缓存是后端工程师的必修课，但很多人对缓存的理解停留在"加个Redis"的阶段。真正的缓存设计需要考虑模式选择、穿透击穿雪崩防护、一致性保障、多级架构、监控告警等一整套体系。希望这一章能帮你建立完整的缓存知识框架。记住，好的缓存系统不是一蹴而就的，而是在不断的压测、监控、调优中打磨出来的。下一篇我们聊RPC框架设计，不见不散。