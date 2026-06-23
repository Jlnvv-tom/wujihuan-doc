# 第4章：通知平台性能优化与总结

## 从线上事故说起：当通知系统撑不住的时候

凌晨两点十七分，我的手机响了。不是闹钟，是运维打来的电话。

"通知服务全线超时，数据库连接池打满了，告警群已经炸了。"

我爬起来打开电脑，登录监控系统。眼前的景象让我后背发凉：通知平台的API响应时间从平时的50ms飙升到了3秒，数据库CPU飙到98%，Redis集群的QPS突破了8万，而且还在往上涨。这是一次大规模营销推送引发的事故——运营同学一次性触发了500万条通知，而我们的系统在设计之初，从来没有考虑过这个量级。

那天晚上，我和团队花了四个小时才把系统稳定下来。事后复盘的时候，我意识到一个残酷的事实：**性能优化不是锦上添花，而是生死线**。

我是怕浪猫，一个在Go后端领域摸爬滚打多年的工程师。在前三章里，我们一起从零搭建了通知平台的核心架构、消息模板引擎和分发调度系统。但一个能跑起来的系统和一个能扛住高并发的系统之间，隔着不止一条鸿沟。这一章，我把这些年在通知平台性能优化上踩过的坑、流过的血，都整理出来，希望能帮你在事故发生之前，就把地基打牢。

> 性能问题从来不是突然爆发的，它只是在你忽视的角落里默默积累，直到某个临界点一次性引爆。

---

## 一、高并发读写性能优化

### 1.1 问题的本质：读写不对等

通知平台有一个很典型的访问模式：**读多写少，但写的峰值极高**。

日常情况下，用户查询通知列表的QPS可能在3000左右，而写入（新通知产生）的QPS可能只有200。但一旦触发营销推送，写入QPS可能瞬间冲到5万。这种"平时读多写少、突发写多"的模式，如果用同一套逻辑处理，必然会在峰值时崩盘。

我先带你看一下优化前的代码长什么样：

```go
// 优化前：所有请求直接打到数据库
type NotificationService struct {
    db *sql.DB
}

func (s *NotificationService) GetUserNotifications(userID int64, page, size int) ([]*Notification, error) {
    query := `SELECT id, user_id, title, content, status, created_at 
              FROM notifications 
              WHERE user_id = ? 
              ORDER BY created_at DESC 
              LIMIT ? OFFSET ?`
    rows, err := s.db.Query(query, userID, size, (page-1)*size)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var result []*Notification
    for rows.Next() {
        n := &Notification{}
        if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Content, &n.Status, &n.CreatedAt); err != nil {
            return nil, err
        }
        result = append(result, n)
    }
    return result, nil
}
```

这段代码的问题很明显：每次查询都直接走数据库，没有任何缓存层。在3000 QPS的读压力下，数据库的连接池很快就会成为瓶颈。

### 1.2 读写分离：从架构层面破局

第一步要做的是读写分离。通知平台的数据有一个特性：通知一旦写入，内容就不再变化（状态可能会更新，但内容不会）。这意味着读操作可以放心地走缓存或只读副本。

```go
// 读写分离架构
type NotificationService struct {
    masterDB *sql.DB    // 主库，负责写
    replicaDB *sql.DB   // 从库，负责读
    cache    *redis.Client
    logger   *zap.Logger
}

func NewNotificationService(master, replica *sql.DB, cache *redis.Client) *NotificationService {
    return &NotificationService{
        masterDB:  master,
        replicaDB: replica,
        cache:     cache,
        logger:    zap.L(),
    }
}

func (s *NotificationService) GetUserNotifications(ctx context.Context, userID int64, page, size int) ([]*Notification, error) {
    // 第一层：查本地缓存
    cacheKey := fmt.Sprintf("notif:list:%d:%d:%d", userID, page, size)
    if cached, err := s.cache.Get(ctx, cacheKey).Result(); err == nil {
        var result []*Notification
        if err := json.Unmarshal([]byte(cached), &result); err == nil {
            return result, nil
        }
    }
    
    // 第二层：查从库
    query := `SELECT id, user_id, title, content, status, created_at 
              FROM notifications 
              WHERE user_id = ? 
              ORDER BY created_at DESC 
              LIMIT ? OFFSET ?`
    rows, err := s.replicaDB.QueryContext(ctx, query, userID, size, (page-1)*size)
    if err != nil {
        s.logger.Error("query user notifications failed", zap.Error(err), zap.Int64("user_id", userID))
        return nil, fmt.Errorf("query notifications: %w", err)
    }
    defer rows.Close()
    
    var result []*Notification
    for rows.Next() {
        n := &Notification{}
        if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Content, &n.Status, &n.CreatedAt); err != nil {
            return nil, err
        }
        result = append(result, n)
    }
    
    // 写入缓存，设置较短的TTL（30秒），避免数据不一致
    if data, err := json.Marshal(result); err == nil {
        s.cache.Set(ctx, cacheKey, data, 30*time.Second)
    }
    
    return result, nil
}
```

> 架构层面的优化永远比代码层面的优化收益更大。在错误的地方做正确的优化，等于白费力气。

### 1.3 批量写入：化解突发写峰值

对于写入侧，单条插入在高并发下是灾难性的。一次营销推送5万条通知，如果逐条插入数据库，每条耗时5ms，总共需要250秒——这在任何业务场景下都是不可接受的。

批量写入是解决这个问题的标准手段：

```go
type NotificationBatchWriter struct {
    db        *sql.DB
    batchSize int
    flushInterval time.Duration
    buffer    []*Notification
    mu        sync.Mutex
    flushCh   chan struct{}
    done      chan struct{}
}

func NewBatchWriter(db *sql.DB, batchSize int, flushInterval time.Duration) *NotificationBatchWriter {
    w := &NotificationBatchWriter{
        db:            db,
        batchSize:     batchSize,
        flushInterval: flushInterval,
        buffer:        make([]*Notification, 0, batchSize),
        flushCh:       make(chan struct{}, 1),
        done:          make(chan struct{}),
    }
    go w.flushLoop()
    return w
}

func (w *NotificationBatchWriter) Write(n *Notification) error {
    w.mu.Lock()
    w.buffer = append(w.buffer, n)
    shouldFlush := len(w.buffer) >= w.batchSize
    w.mu.Unlock()
    
    if shouldFlush {
        select {
        case w.flushCh <- struct{}{}:
        default:
            // 已经有flush在等待，跳过
        }
    }
    return nil
}

func (w *NotificationBatchWriter) flushLoop() {
    ticker := time.NewTicker(w.flushInterval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:
            w.flush()
        case <-w.flushCh:
            w.flush()
        case <-w.done:
            w.flush()
            return
        }
    }
}

func (w *NotificationBatchWriter) flush() {
    w.mu.Lock()
    if len(w.buffer) == 0 {
        w.mu.Unlock()
        return
    }
    batch := w.buffer
    w.buffer = make([]*Notification, 0, w.batchSize)
    w.mu.Unlock()
    
    // 构建批量插入SQL
    var sb strings.Builder
    sb.WriteString("INSERT INTO notifications (user_id, title, content, status, created_at) VALUES ")
    
    args := make([]interface{}, 0, len(batch)*5)
    for i, n := range batch {
        if i > 0 {
            sb.WriteString(",")
        }
        sb.WriteString("(?,?,?,?,?)")
        args = append(args, n.UserID, n.Title, n.Content, n.Status, n.CreatedAt)
    }
    
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    result, err := w.db.ExecContext(ctx, sb.String(), args...)
    if err != nil {
        zap.L().Error("batch insert failed", zap.Error(err), zap.Int("batch_size", len(batch)))
        // 失败重试：放回buffer
        w.mu.Lock()
        w.buffer = append(batch, w.buffer...)
        w.mu.Unlock()
        return
    }
    
    rows, _ := result.RowsAffected()
    zap.L().Info("batch insert success", zap.Int64("affected", rows))
}
```

这套批量写入方案在我们的生产环境中，把5万条通知的写入时间从250秒降到了不到3秒。关键参数是`batchSize`（单批数量）和`flushInterval`（最大刷新间隔）。我建议batchSize设为500-1000，flushInterval设为500ms，这个组合在吞吐量和延迟之间取得了比较好的平衡。

> 批量处理是高并发系统的基本盘。把零散的请求聚合成批次，用一次IO代替多次IO，这是量变引起质变的最直接体现。

### 1.4 连接池调优

Go的`database/sql`包自带连接池，但默认配置在高并发场景下远远不够。我见过太多团队上线后才发现连接池没配，导致数据库连接被打满。

```go
func NewDB(cfg *DatabaseConfig) (*sql.DB, error) {
    db, err := sql.Open("mysql", cfg.DSN)
    if err != nil {
        return nil, err
    }
    
    // 连接池参数调优
    db.SetMaxOpenConns(cfg.MaxOpenConns)     // 最大连接数，建议 = 数据库max_connections / 服务实例数 * 0.8
    db.SetMaxIdleConns(cfg.MaxIdleConns)     // 最大空闲连接数，建议 = MaxOpenConns / 2
    db.SetConnMaxLifetime(cfg.ConnMaxLifetime) // 连接最大存活时间，建议30分钟
    db.SetConnMaxIdleTime(cfg.ConnMaxIdleTime) // 连接最大空闲时间，建议5分钟
    
    // 健康检查
    ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("database ping: %w", err)
    }
    
    return db, nil
}
```

这里有一个容易踩的坑：`MaxIdleConns`不要设得太小。如果设为10，而你的峰值QPS需要100个并发连接，那么每次请求都需要新建连接，建连的开销在高并发下会成倍放大。我建议`MaxIdleConns`至少设为`MaxOpenConns`的一半。

另一个坑是`ConnMaxLifetime`。MySQL默认的`wait_timeout`是8小时，如果你的连接存活时间超过这个值，MySQL会主动断开，但Go的连接池并不知道，下次复用这个连接时就会报错。所以`ConnMaxLifetime`一定要小于MySQL的`wait_timeout`。

> 连接池是数据库的护城河。护城河太浅，洪水一来就漫过去；太深，日常维护成本又太高。找到那个平衡点，是每个后端工程师的必修课。

---

## 二、数据库分片与缓存策略

### 2.1 分库分表：当单表成为瓶颈

通知平台运行半年后，`notifications`表的数据量突破了2亿。这时候，即使建了索引，查询性能也开始明显下降。分库分表成了不得不做的选择。

但分片策略的选择，需要非常谨慎。通知平台有两个核心查询模式：
1. 按用户ID查询通知列表（占比95%）
2. 按时间范围查询通知（占比5%，主要是运营后台）

基于这个分析，我选择了**按用户ID做hash分片**：

```go
// 分片路由器
type ShardingRouter struct {
    shardCount int
    dbNodes    []*sql.DB
}

func NewShardingRouter(shardCount int, dsnList []string) (*ShardingRouter, error) {
    if len(dsnList) != shardCount {
        return nil, fmt.Errorf("dsn list length %d != shard count %d", len(dsnList), shardCount)
    }
    
    dbs := make([]*sql.DB, shardCount)
    for i, dsn := range dsnList {
        db, err := sql.Open("mysql", dsn)
        if err != nil {
            return nil, fmt.Errorf("open shard %d: %w", i, err)
        }
        db.SetMaxOpenConns(50)
        db.SetMaxIdleConns(25)
        db.SetConnMaxLifetime(30 * time.Minute)
        dbs[i] = db
    }
    
    return &ShardingRouter{
        shardCount: shardCount,
        dbNodes:    dbs,
    }, nil
}

// GetShardByUserID 根据用户ID计算分片
func (r *ShardingRouter) GetShardByUserID(userID int64) int {
    // 使用一致性hash的简化版本
    // 实际生产中建议使用更完善的hash算法，如FNV
    hash := fnv.New32a()
    hash.Write([]byte(strconv.FormatInt(userID, 10)))
    return int(hash.Sum32()) % r.shardCount
}

// GetDB 获取对应分片的数据库连接
func (r *ShardingRouter) GetDB(userID int64) *sql.DB {
    shard := r.GetShardByUserID(userID)
    return r.dbNodes[shard]
}

// GetTable 获取分片表名
func (r *ShardingRouter) GetTable(userID int64) string {
    shard := r.GetShardByUserID(userID)
    return fmt.Sprintf("notifications_%04d", shard)
}
```

分片后，写入逻辑也需要相应调整：

```go
func (s *NotificationService) CreateNotification(ctx context.Context, n *Notification) error {
    shard := s.router.GetShardByUserID(n.UserID)
    db := s.router.GetDB(n.UserID)
    table := s.router.GetTable(n.UserID)
    
    query := fmt.Sprintf("INSERT INTO %s (user_id, title, content, status, created_at) VALUES (?,?,?,?,?)", table)
    result, err := db.ExecContext(ctx, query, n.UserID, n.Title, n.Content, n.Status, n.CreatedAt)
    if err != nil {
        return fmt.Errorf("insert notification to shard %d: %w", shard, err)
    }
    
    id, _ := result.LastInsertId()
    n.ID = id
    
    // 同步刷新缓存
    s.invalidateUserCache(ctx, n.UserID)
    
    return nil
}
```

> 分库分表不是银弹，它是用复杂度换性能的交易。一旦走上这条路，跨片查询、分布式事务、数据迁移都会变成你的噩梦。在动手之前，先问自己：真的到了不分不行的时候了吗？

### 2.2 分片后的跨片查询难题

分片解决了单表数据量过大的问题，但带来了新的麻烦：运营后台需要按时间范围查询所有用户的通知记录。这在分片前是一个简单的SQL，分片后却需要查询所有分片再合并结果。

我的解决方案是引入一个**查询专用汇总表**，通过异步消息队列同步数据：

```go
// 异步同步到汇总表
type NotificationSyncConsumer struct {
    summaryDB *sql.DB
    mq        MessageQueue
    batchSize int
}

func (c *NotificationSyncConsumer) Start(ctx context.Context) error {
    messages, err := c.mq.Consume(ctx, "notification.sync", c.batchSize)
    if err != nil {
        return err
    }
    
    for msg := range messages {
        var n Notification
        if err := json.Unmarshal(msg.Body, &n); err != nil {
            msg.Nack()
            continue
        }
        
        // 写入汇总表（只存摘要信息，不存完整内容）
        _, err := c.summaryDB.ExecContext(ctx,
            "INSERT INTO notification_summary (id, user_id, title, status, created_at) VALUES (?,?,?,?,?)",
            n.ID, n.UserID, n.Title, n.Status, n.CreatedAt)
        if err != nil {
            zap.L().Error("sync to summary table failed", zap.Error(err))
            msg.Nack()
            continue
        }
        msg.Ack()
    }
    return nil
}
```

汇总表只存储摘要信息（不含通知正文），数据量大大减少，单表可以支撑更长时间的数据。运营后台的查询走汇总表，用户侧的查询走分片表，各取所需。

### 2.3 多级缓存策略

缓存是性能优化的利器，但用不好就是定时炸弹。通知平台的缓存策略，我设计了三级：

```
请求 -> L1本地缓存 -> L2 Redis缓存 -> 数据库
```

```go
type MultiLevelCache struct {
    localCache *gocache.Cache    // 进程内缓存，TTL 5秒
    redisCache *redis.Client     // Redis集群，TTL 30秒
    loader     func(ctx context.Context, key string) (interface{}, error) // 回源函数
    mu         singleflight.Group // 防止缓存击穿
}

func NewMultiLevelCache(redis *redis.Client, loader func(ctx context.Context, key string) (interface{}, error)) *MultiLevelCache {
    c := &MultiLevelCache{
        localCache: gocache.New(5*time.Second, 10*time.Second),
        redisCache: redis,
        loader:     loader,
    }
    return c
}

func (c *MultiLevelCache) Get(ctx context.Context, key string, dest interface{}) error {
    // L1: 本地缓存
    if val, ok := c.localCache.Get(key); ok {
        return decodeValue(val, dest)
    }
    
    // L2: Redis缓存
    if data, err := c.redisCache.Get(ctx, key).Result(); err == nil {
        c.localCache.Set(key, data, 5*time.Second)
        return decodeValue([]byte(data), dest)
    }
    
    // 使用singleflight防止缓存击穿
    val, err, _ := c.mu.Do(key, func() (interface{}, error) {
        return c.loader(ctx, key)
    })
    if err != nil {
        return err
    }
    
    data, _ := json.Marshal(val)
    
    // 回写缓存
    c.localCache.Set(key, string(data), 5*time.Second)
    c.redisCache.Set(ctx, key, data, 30*time.Second)
    
    return decodeValue(data, dest)
}

func decodeValue(data interface{}, dest interface{}) error {
    var b []byte
    switch v := data.(type) {
    case string:
        b = []byte(v)
    case []byte:
        b = v
    default:
        return fmt.Errorf("unsupported cache value type: %T", data)
    }
    return json.Unmarshal(b, dest)
}
```

这里有一个关键设计：`singleflight`。当缓存失效的瞬间，如果有1000个并发请求同时miss，没有singleflight的话，这1000个请求会全部穿透到数据库。有了singleflight，只有一个请求会真正去查数据库，其余999个请求等待结果共享。这一个设计，能在缓存失效时把数据库压力降低三个数量级。

> 缓存不是简单的"查不到就回源"。缓存击穿、缓存穿透、缓存雪崩，这三个坑踩过任何一个，你都会深刻理解什么叫"缓存设计比缓存本身更重要"。

### 2.4 缓存预热与淘汰策略

通知平台有一个场景：每天早上9点是用户活跃高峰，大量用户打开APP查看通知。如果在9点才开始缓存预热，必然会有大量请求穿透到数据库。

解决方案是定时预热：

```go
type CacheWarmer struct {
    cache    *MultiLevelCache
    db       *sql.DB
    topUsers []int64 // 活跃用户列表
}

func (w *CacheWarmer) Warmup(ctx context.Context) error {
    // 查询最近7天活跃的用户
    query := `SELECT DISTINCT user_id FROM notification_read_log 
              WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
              LIMIT 10000`
    rows, err := w.db.QueryContext(ctx, query)
    if err != nil {
        return fmt.Errorf("query active users: %w", err)
    }
    defer rows.Close()
    
    var userIDs []int64
    for rows.Next() {
        var uid int64
        if err := rows.Scan(&uid); err != nil {
            continue
        }
        userIDs = append(userIDs, uid)
    }
    
    // 并发预热，控制并发度
    sem := make(chan struct{}, 20) // 20个并发
    var wg sync.WaitGroup
    
    for _, uid := range userIDs {
        wg.Add(1)
        sem <- struct{}{}
        go func(userID int64) {
            defer wg.Done()
            defer func() { <-sem }()
            
            key := fmt.Sprintf("notif:list:%d:1:20", userID)
            _, err := w.cache.loader(ctx, key)
            if err != nil {
                zap.L().Warn("cache warmup failed", zap.Int64("user_id", userID), zap.Error(err))
            }
        }(uid)
    }
    
    wg.Wait()
    zap.L().Info("cache warmup completed", zap.Int("user_count", len(userIDs)))
    return nil
}
```

缓存的淘汰策略同样重要。通知平台的数据有时效性——30天前的通知几乎没人看。所以缓存的TTL设置需要根据数据热度分级：

| 数据类型 | L1缓存TTL | L2缓存TTL | 说明 |
|---------|----------|----------|------|
| 最新通知列表（第1页） | 5秒 | 30秒 | 热点数据，短TTL保证实时性 |
| 历史通知列表（第2页+） | 60秒 | 5分钟 | 冷数据，长TTL减少数据库压力 |
| 通知详情 | 5分钟 | 30分钟 | 不变数据，可长缓存 |
| 未读计数 | 1秒 | 10秒 | 高频变更，极短TTL |

> 缓存预热是未雨绸缪，缓存淘汰是及时止损。两者缺一不可，共同构成了缓存系统的生命周期管理。

---

## 三、性能瓶颈识别与调优

### 3.1 性能分析的武器库

性能优化最重要的一条原则是：**不要猜，要测**。

我见过太多工程师凭感觉优化——"我觉得这里慢"，改了一通，性能没提升反而引入了bug。Go语言在性能分析方面有非常完善的工具链，善用它们能让你事半功倍。

**第一步：pprof抓取CPU profile**

```go
import _ "net/http/pprof"

func main() {
    go func() {
        http.ListenAndServe("localhost:6060", nil)
    }()
    // ... 业务代码
}
```

启动服务后，在压测过程中抓取profile：

```bash
# 抓取30秒的CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# 在pprof交互界面中
(pprof) top 20
(pprof) list NotificationService
(pprof) web  # 生成火焰图
```

**第二步：分析火焰图**

火焰图是最直观的性能分析工具。在通知平台的火焰图中，我发现了一个意想不到的瓶颈：

```
json.Marshal 占了总CPU时间的 23%
```

原因是通知列表接口在返回JSON时，对每个通知对象都做了完整的序列化，包括很长的通知正文。优化方案是只序列化摘要字段，正文通过单独的接口懒加载：

```go
// 优化前：序列化完整通知
type Notification struct {
    ID        int64     `json:"id"`
    UserID    int64     `json:"user_id"`
    Title     string    `json:"title"`
    Content   string    `json:"content"`    // 可能长达几KB
    Status    int       `json:"status"`
    CreatedAt time.Time `json:"created_at"`
}

// 优化后：列表接口只返回摘要
type NotificationSummary struct {
    ID        int64     `json:"id"`
    Title     string    `json:"title"`
    Status    int       `json:"status"`
    CreatedAt time.Time `json:"created_at"`
    HasContent bool     `json:"has_content"` // 前端按需拉取正文
}

func (s *NotificationService) GetUserNotifications(ctx context.Context, userID int64, page, size int) ([]*NotificationSummary, error) {
    query := `SELECT id, title, status, created_at 
              FROM notifications 
              WHERE user_id = ? 
              ORDER BY created_at DESC 
              LIMIT ? OFFSET ?`
    // ...
}
```

这一个改动，把JSON序列化的CPU开销从23%降到了6%，接口响应时间缩短了40%。

> 性能优化最大的敌人不是复杂的代码，而是想当然的直觉。让数据说话，让火焰图指路，你会发现80%的性能问题都藏在你没想到的地方。

### 3.2 数据库慢查询治理

数据库慢查询是通知平台最常见的性能杀手。我建立了一套完整的慢查询治理流程：

**步骤一：开启慢查询日志**

```sql
-- MySQL慢查询配置
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 0.1;  -- 超过100ms的查询记录
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
SET GLOBAL log_queries_not_using_indexes = ON;
```

**步骤二：定期分析慢查询**

```go
type SlowQueryAnalyzer struct {
    db    *sql.DB
    alert SlowQueryAlerter
}

type SlowQueryStat struct {
    QueryText  string
    CallCount  int64
    AvgTime    float64
    MaxTime    float64
    TotalTime  float64
}

func (a *SlowQueryAnalyzer) Analyze(ctx context.Context) ([]SlowQueryStat, error) {
    // 从performance_schema中获取慢查询统计
    query := `SELECT 
        DIGEST_TEXT as query_text,
        COUNT_STAR as call_count,
        AVG_TIMER_WAIT/1000000000 as avg_time_ms,
        MAX_TIMER_WAIT/1000000000 as max_time_ms,
        SUM_TIMER_WAIT/1000000000 as total_time_ms
    FROM performance_schema.events_statements_summary_by_digest
    WHERE AVG_TIMER_WAIT/1000000000 > 100
    ORDER BY SUM_TIMER_WAIT DESC
    LIMIT 20`
    
    rows, err := a.db.QueryContext(ctx, query)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var stats []SlowQueryStat
    for rows.Next() {
        var s SlowQueryStat
        if err := rows.Scan(&s.QueryText, &s.CallCount, &s.AvgTime, &s.MaxTime, &s.TotalTime); err != nil {
            continue
        }
        stats = append(stats, s)
    }
    
    // 告警
    for _, s := range stats {
        if s.AvgTime > 500 {
            a.alert.Alert(ctx, fmt.Sprintf("慢查询告警: 平均耗时%.0fms, 调用%d次, SQL: %s", 
                s.AvgTime, s.CallCount, s.QueryText))
        }
    }
    
    return stats, nil
}
```

**步骤三：针对性优化**

在通知平台的慢查询治理中，我总结了一个优化优先级矩阵：

| 优化措施 | 实施难度 | 收益 | 优先级 |
|---------|---------|------|--------|
| 添加缺失索引 | 低 | 高 | P0 |
| 优化SQL写法（避免SELECT *） | 低 | 中 | P0 |
| 分页查询优化（游标分页） | 中 | 高 | P1 |
| 大表历史数据归档 | 中 | 高 | P1 |
| 冗余字段反范式化 | 中 | 中 | P2 |
| 读写分离 | 高 | 高 | P2 |
| 分库分表 | 高 | 高 | P3 |

其中，**分页查询优化**是一个经常被忽视的点。传统的OFFSET分页在数据量大时性能极差：

```sql
-- 慢：OFFSET分页，需要扫描前10000行
SELECT * FROM notifications WHERE user_id = 123 ORDER BY created_at DESC LIMIT 20 OFFSET 10000;

-- 快：游标分页，直接定位
SELECT * FROM notifications WHERE user_id = 123 AND created_at < '2024-01-01 00:00:00' ORDER BY created_at DESC LIMIT 20;
```

游标分页的实现：

```go
func (s *NotificationService) GetUserNotificationsByCursor(ctx context.Context, userID int64, cursor time.Time, size int) ([]*NotificationSummary, error) {
    var query string
    var args []interface{}
    
    if cursor.IsZero() {
        // 第一页
        query = `SELECT id, title, status, created_at 
                 FROM notifications 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`
        args = []interface{}{userID, size}
    } else {
        // 翻页
        query = `SELECT id, title, status, created_at 
                 FROM notifications 
                 WHERE user_id = ? AND created_at < ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`
        args = []interface{}{userID, cursor, size}
    }
    
    rows, err := s.replicaDB.QueryContext(ctx, query, args...)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var result []*NotificationSummary
    for rows.Next() {
        n := &NotificationSummary{}
        if err := rows.Scan(&n.ID, &n.Title, &n.Status, &n.CreatedAt); err != nil {
            return nil, err
        }
        result = append(result, n)
    }
    return result, nil
}
```

> 索引是数据库的目录，但目录翻到最后几页才知道答案在哪——这就是OFFSET分页的痛。游标分页像书签，翻开就能接着读，不需要从头翻起。

### 3.3 内存与GC调优

Go的GC在1.19之后有了显著改进，但在高并发场景下仍然需要关注。通知平台在峰值时每秒创建数万个通知对象，GC压力不可忽视。

通过pprof的heap分析，我发现通知对象的内存分配占了总分配的35%。优化方案是使用`sync.Pool`复用对象：

```go
var notificationPool = sync.Pool{
    New: func() interface{} {
        return &Notification{
            Title:   make([]byte, 0, 128),
            Content: make([]byte, 0, 1024),
        }
    },
}

func acquireNotification() *Notification {
    return notificationPool.Get().(*Notification)
}

func releaseNotification(n *Notification) {
    n.ID = 0
    n.UserID = 0
    n.Title = n.Title[:0]
    n.Content = n.Content[:0]
    n.Status = 0
    n.CreatedAt = time.Time{}
    notificationPool.Put(n)
}
```

另外，对于高频分配的小对象，可以考虑使用`GOGC`参数调优。默认`GOGC=100`表示堆增长100%时触发GC。在内存充足的服务器上，可以适当调高：

```bash
# 启动时设置
GOGC=200 ./notification-service
```

这会让GC触发频率降低，减少CPU开销，但代价是堆内存占用更高。需要根据实际场景权衡。

> GC是Go运行时的隐形税。你感知不到它的存在，但它每时每刻都在拿走你一部分CPU。控制好分配速率，就是控制好这笔税。

---

## 四、异步处理与消息队列应用

### 4.1 为什么要异步

通知平台有一个核心场景：用户触发某个行为后，系统需要发送通知。比如订单创建后发订单通知、支付成功后发支付通知。如果同步发送通知（调通知服务、查模板、渲染内容、调推送渠道），整个链路可能耗时200-500ms，这会拖慢主业务接口。

异步处理的思路很简单：主业务只负责投递消息到队列，通知服务异步消费。但这中间有很多细节需要处理。

```go
// 同步发送（优化前）
func (s *OrderService) CreateOrder(ctx context.Context, order *Order) error {
    if err := s.orderRepo.Create(ctx, order); err != nil {
        return err
    }
    
    // 同步发送通知 -- 这会拖慢接口
    if err := s.notificationService.Send(ctx, &NotificationRequest{
        UserID:  order.UserID,
        Type:    "order_created",
        Payload: order,
    }); err != nil {
        zap.L().Error("send notification failed", zap.Error(err))
        // 通知失败不影响主流程，但已经浪费了时间
    }
    
    return nil
}

// 异步发送（优化后）
func (s *OrderService) CreateOrder(ctx context.Context, order *Order) error {
    if err := s.orderRepo.Create(ctx, order); err != nil {
        return err
    }
    
    // 异步投递到消息队列
    msg, _ := json.Marshal(&NotificationRequest{
        UserID:  order.UserID,
        Type:    "order_created",
        Payload: order,
    })
    
    if err := s.mq.Publish(ctx, "notification.send", msg); err != nil {
        // 队列也失败了，降级到本地异步重试
        go func() {
            retryCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
            defer cancel()
            s.mq.Publish(retryCtx, "notification.send", msg)
        }()
    }
    
    return nil
}
```

改造后，订单创建接口的耗时从平均300ms降到了80ms（其中数据库操作占60ms），通知发送不再阻塞主流程。

> 异步不是万能药，但它能让你在主链路上轻装上阵。把不紧急的事情丢到后台，让主流程跑得更快，这是高并发系统设计的常识。

### 4.2 消息队列的选型与实现

通知平台对消息队列有三个核心需求：
1. **可靠性**：通知不能丢，每条消息必须被处理
2. **有序性**：同一用户的通知需要按顺序处理
3. **削峰填谷**：突发流量需要队列缓冲

我们选择了Kafka作为主队列，Redis Stream作为轻量级备用队列。Kafka的分区机制天然支持按用户ID做有序消费：

```go
type KafkaMQ struct {
    producer sarama.SyncProducer
    consumer sarama.ConsumerGroup
    topic    string
}

func NewKafkaMQ(brokers []string, topic string) (*KafkaMQ, error) {
    config := sarama.NewConfig()
    config.Producer.RequiredAcks = sarama.WaitForAll
    config.Producer.Return.Successes = true
    config.Producer.Partitioner = sarama.NewHashPartitioner // 按key hash分区
    
    producer, err := sarama.NewSyncProducer(brokers, config)
    if err != nil {
        return nil, fmt.Errorf("create kafka producer: %w", err)
    }
    
    consumerConfig := sarama.NewConfig()
    consumerConfig.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRoundRobin
    consumerConfig.Consumer.Offsets.Initial = sarama.OffsetNewest
    
    consumer, err := sarama.NewConsumerGroup(brokers, "notification-group", consumerConfig)
    if err != nil {
        return nil, fmt.Errorf("create kafka consumer: %w", err)
    }
    
    return &KafkaMQ{
        producer: producer,
        consumer: consumer,
        topic:    topic,
    }, nil
}

func (k *KafkaMQ) Publish(ctx context.Context, key string, message []byte) error {
    msg := &sarama.ProducerMessage{
        Topic: k.topic,
        Key:   sarama.StringEncoder(key), // 用userID作为key，保证同一用户的消息到同一分区
        Value: sarama.ByteEncoder(message),
    }
    
    _, _, err := k.producer.SendMessage(msg)
    return err
}
```

### 4.3 消费者的优雅实现

消费者需要处理几个关键问题：并发控制、失败重试、优雅退出。

```go
type NotificationConsumer struct {
    mq          *KafkaMQ
    handler     NotificationHandler
    workerPool  int
    retryQueue  *RetryQueue
    metrics     *ConsumerMetrics
}

type NotificationHandler interface {
    Handle(ctx context.Context, msg *NotificationMessage) error
}

func (c *NotificationConsumer) Start(ctx context.Context) error {
    handler := &consumerGroupHandler{
        handler:    c.handler,
        workerPool: c.workerPool,
        retryQueue: c.retryQueue,
        metrics:    c.metrics,
    }
    
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            if err := c.mq.consumer.Consume(ctx, []string{c.mq.topic}, handler); err != nil {
                zap.L().Error("consume error", zap.Error(err))
                time.Sleep(time.Second) // 避免频繁重连
            }
        }
    }
}

type consumerGroupHandler struct {
    handler    NotificationHandler
    workerPool int
    retryQueue *RetryQueue
    metrics    *ConsumerMetrics
}

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
    // 控制并发度
    sem := make(chan struct{}, h.workerPool)
    var wg sync.WaitGroup
    
    for message := range claim.Messages() {
        wg.Add(1)
        sem <- struct{}{}
        
        go func(msg *sarama.ConsumerMessage) {
            defer wg.Done()
            defer func() { <-sem }()
            
            ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
            defer cancel()
            
            var notifMsg NotificationMessage
            if err := json.Unmarshal(msg.Value, &notifMsg); err != nil {
                zap.L().Error("unmarshal message failed", zap.Error(err))
                session.MarkMessage(msg, "") // 格式错误的消息直接跳过
                return
            }
            
            if err := h.handler.Handle(ctx, &notifMsg); err != nil {
                // 加入重试队列
                h.retryQueue.Add(ctx, &RetryMessage{
                    Original:    &notifMsg,
                    RetryCount:  0,
                    NextRetryAt: time.Now().Add(time.Minute),
                    Error:       err.Error(),
                })
                h.metrics.RecordFailure()
            } else {
                h.metrics.RecordSuccess()
            }
            
            session.MarkMessage(msg, "")
        }(message)
    }
    
    wg.Wait()
    return nil
}

func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error { return nil }
```

> 消息队列是系统间的缓冲带。它让生产者和消费者各跑各的速度，互不拖累。但记住，队列不是黑洞——消息进去了就必须出来，消费失败的兜底方案比正常流程更重要。

### 4.4 重试与死信队列

通知发送可能因为各种原因失败：推送服务超时、用户设备离线、模板渲染错误。对于这些失败，需要有一套完善的重试机制：

```go
type RetryQueue struct {
    redis     *redis.Client
    maxRetry  int
    intervals []time.Duration // 重试间隔：1m, 5m, 30m, 2h, 6h
}

func NewRetryQueue(redis *redis.Client) *RetryQueue {
    return &RetryQueue{
        redis:    redis,
        maxRetry: 5,
        intervals: []time.Duration{
            time.Minute,
            5 * time.Minute,
            30 * time.Minute,
            2 * time.Hour,
            6 * time.Hour,
        },
    }
}

func (q *RetryQueue) Add(ctx context.Context, msg *RetryMessage) error {
    if msg.RetryCount >= q.maxRetry {
        // 超过最大重试次数，进入死信队列
        return q.moveToDeadLetter(ctx, msg)
    }
    
    interval := q.intervals[msg.RetryCount]
    if msg.RetryCount >= len(q.intervals) {
        interval = q.intervals[len(q.intervals)-1]
    }
    
    msg.NextRetryAt = time.Now().Add(interval)
    data, _ := json.Marshal(msg)
    
    // 使用sorted set，按重试时间排序
    score := float64(msg.NextRetryAt.Unix())
    return q.redis.ZAdd(ctx, "retry_queue", &redis.Z{
        Score:  score,
        Member: string(data),
    }).Err()
}

func (q *RetryQueue) Process(ctx context.Context, handler NotificationHandler) error {
    now := float64(time.Now().Unix())
    
    // 获取到期的重试消息
    messages, err := q.redis.ZRangeByScore(ctx, "retry_queue", &redis.ZRangeBy{
        Min:   "0",
        Max:   strconv.FormatFloat(now, 'f', 0, 64),
        Count: 100,
    }).Result()
    if err != nil {
        return err
    }
    
    for _, data := range messages {
        var msg RetryMessage
        if err := json.Unmarshal([]byte(data), &msg); err != nil {
            continue
        }
        
        // 从队列移除
        q.redis.ZRem(ctx, "retry_queue", data)
        
        // 重新处理
        if err := handler.Handle(ctx, msg.Original); err != nil {
            msg.RetryCount++
            msg.Error = err.Error()
            q.Add(ctx, &msg)
        }
    }
    
    return nil
}

func (q *RetryQueue) moveToDeadLetter(ctx context.Context, msg *RetryMessage) error {
    data, _ := json.Marshal(msg)
    return q.redis.LPush(ctx, "dead_letter_queue", data).Err()
}
```

重试间隔的设计遵循指数退避原则：第一次1分钟、第二次5分钟、第三次30分钟、第四次2小时、第五次6小时。超过5次仍失败的消息进入死信队列，由人工介入处理。

> 重试是给失败者的第二次机会。但机会不能无限给——设定止损线，让真正无法处理的问题浮出水面，才是负责任的设计。

---

## 五、限流策略实现

### 5.1 为什么需要限流

在通知平台的运行过程中，有两种场景必须限流：

1. **入口限流**：防止上游服务（如营销推送系统）突发流量冲垮通知平台
2. **出口限流**：防止通知平台冲垮下游服务（如推送网关、短信网关）

限流的核心目标是保护系统在可承受范围内运行，宁可拒绝部分请求，也不能让整体崩溃。

### 5.2 限流算法对比

我先梳理一下主流限流算法的优缺点，帮你在选型时做出正确判断：

| 算法 | 原理 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| 固定窗口 | 固定时间窗口内计数 | 实现简单 | 窗口边界突刺 | 低精度要求 |
| 滑动窗口 | 细分窗口滑动统计 | 平滑、精度高 | 内存占用大 | 通用场景 |
| 令牌桶 | 匀速生成令牌，请求消耗 | 支持突发流量 | 实现较复杂 | API网关 |
| 漏桶 | 匀速处理请求 | 流量绝对平滑 | 无法突发 | 整流保护 |

通知平台我选择了**令牌桶算法**，原因是营销推送有突发的合法流量，令牌桶可以支持一定程度的突发，同时限制平均速率。

### 5.3 分布式令牌桶实现

单机限流用Go的标准库就能实现，但通知平台是多实例部署，需要分布式限流。基于Redis实现的分布式令牌桶：

```go
type RedisTokenBucket struct {
    redis      *redis.Client
    keyPrefix  string
    rate       int           // 每秒生成的令牌数
    burst      int           // 桶容量
    clock      func() time.Time
}

func NewRedisTokenBucket(redis *redis.Client, keyPrefix string, rate, burst int) *RedisTokenBucket {
    return &RedisTokenBucket{
        redis:     redis,
        keyPrefix: keyPrefix,
        rate:      rate,
        burst:     burst,
        clock:     time.Now,
    }
}

// Lua脚本保证原子性
const tokenBucketScript = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

-- 获取当前桶状态
local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
    tokens = burst
    last_refill = now
end

-- 计算需要补充的令牌
local elapsed = now - last_refill
local refill = elapsed * rate / 1000  -- elapsed是毫秒

if refill > 0 then
    tokens = math.min(burst, tokens + refill)
    last_refill = now
end

-- 判断是否通过
local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

-- 写回桶状态
redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', key, 60)  -- 60秒过期，避免key堆积

return {allowed, tokens}
`

var tokenBucketSHA string

func (b *RedisTokenBucket) Allow(ctx context.Context, key string, requested int) (bool, error) {
    fullKey := fmt.Sprintf("%s:%s", b.keyPrefix, key)
    now := b.clock().UnixMilli()
    
    // 使用EVALSHA执行Lua脚本（预编译更快）
    result, err := b.redis.EvalSha(ctx, tokenBucketSHA, []string{fullKey},
        b.rate, b.burst, now, requested).Result()
    if err != nil {
        // SHA不存在，回退到EVAL
        if strings.Contains(err.Error(), "NOSCRIPT") {
            result, err = b.redis.Eval(ctx, tokenBucketScript, []string{fullKey},
                b.rate, b.burst, now, requested).Result()
            if err != nil {
                return false, err
            }
        } else {
            return false, err
        }
    }
    
    values, ok := result.([]interface{})
    if !ok || len(values) != 2 {
        return false, fmt.Errorf("invalid script result")
    }
    
    allowed, _ := values[0].(int64)
    return allowed == 1, nil
}

// 预加载Lua脚本SHA
func (b *RedisTokenBucket) PreloadScript(ctx context.Context) error {
    sha, err := b.redis.ScriptLoad(ctx, tokenBucketScript).Result()
    if err != nil {
        return err
    }
    tokenBucketSHA = sha
    return nil
}
```

### 5.4 多维度限流策略

通知平台不是单一的限流策略，而是根据不同维度组合使用：

```go
type NotificationRateLimiter struct {
    // 入口限流：按API维度
    apiLimiter *RedisTokenBucket
    
    // 入口限流：按租户维度
    tenantLimiter *RedisTokenBucket
    
    // 出口限流：按渠道维度
    channelLimiter *RedisTokenBucket
    
    // 出口限流：按用户维度（防骚扰）
    userLimiter *RedisTokenBucket
}

func NewRateLimiter(redis *redis.Client) *NotificationRateLimiter {
    return &NotificationRateLimiter{
        apiLimiter:      NewRedisTokenBucket(redis, "rl:api", 5000, 10000),      // 全局API: 5000 QPS
        tenantLimiter:   NewRedisTokenBucket(redis, "rl:tenant", 1000, 2000),     // 单租户: 1000 QPS
        channelLimiter:  NewRedisTokenBucket(redis, "rl:channel", 500, 1000),     // 单渠道: 500 QPS
        userLimiter:     NewRedisTokenBucket(redis, "rl:user", 10, 20),           // 单用户: 10 QPS
    }
}

func (r *NotificationRateLimiter) Check(ctx context.Context, req *SendRequest) (*RateLimitResult, error) {
    // 多层检查，任何一层不通过都拒绝
    checks := []struct {
        name     string
        limiter  *RedisTokenBucket
        key      string
    }{
        {"api", r.apiLimiter, "global"},
        {"tenant", r.tenantLimiter, strconv.FormatInt(req.TenantID, 10)},
        {"channel", r.channelLimiter, req.Channel},
        {"user", r.userLimiter, strconv.FormatInt(req.UserID, 10)},
    }
    
    for _, check := range checks {
        allowed, err := check.limiter.Allow(ctx, check.key, 1)
        if err != nil {
            zap.L().Error("rate limit check failed", 
                zap.String("layer", check.name), zap.Error(err))
            // 限流器故障时，默认放行（fail-open策略，根据业务选择）
            continue
        }
        if !allowed {
            return &RateLimitResult{
                Allowed:   false,
                LimitLayer: check.name,
                Message:   fmt.Sprintf("rate limited at layer: %s", check.name),
            }, nil
        }
    }
    
    return &RateLimitResult{Allowed: true}, nil
}
```

这里有一个设计决策需要说明：当限流器本身故障（如Redis不可用）时，应该fail-open还是fail-close？

通知平台的选择是**入口限流fail-open，出口限流fail-close**。原因是入口限流故障时，放行请求最多导致系统压力增大，但不会丢失数据；而出口限流故障时如果放行，可能冲垮下游的短信网关、推送服务等不可恢复的外部系统。

> 限流是系统的安全阀。安全阀卡死了，要么压力憋在里面炸掉自己，要么压力释放出去冲垮别人。选择哪个方向fail，取决于哪个后果你更能承受。

### 5.5 限流后的用户体验

被限流的请求不能直接返回500错误，那对用户体验是灾难性的。通知平台的处理方式是**降级而非拒绝**：

```go
func (s *NotificationService) Send(ctx context.Context, req *SendRequest) (*SendResponse, error) {
    // 限流检查
    result, err := s.rateLimiter.Check(ctx, req)
    if err == nil && !result.Allowed {
        // 被限流，降级处理
        if result.LimitLayer == "user" {
            // 用户维度限流：静默丢弃，不报错
            // 记录日志用于后续分析
            zap.L().Info("user rate limited, dropping notification",
                zap.Int64("user_id", req.UserID),
                zap.String("type", req.Type))
            return &SendResponse{
                Status:  "dropped",
                Message: "通知发送频率过高，已暂时忽略",
            }, nil
        } else {
            // 其他维度限流：延迟发送
            // 投入延迟队列，稍后重试
            delayMsg, _ := json.Marshal(req)
            s.redis.ZAdd(ctx, "delay_queue", &redis.Z{
                Score:  float64(time.Now().Add(30 * time.Second).Unix()),
                Member: string(delayMsg),
            })
            return &SendResponse{
                Status:  "delayed",
                Message: "通知将在稍后发送",
            }, nil
        }
    }
    
    // 正常发送
    return s.doSend(ctx, req)
}
```

---

## 六、项目复盘与最佳实践总结

### 6.1 踩过的坑

在通知平台从0到1、从1到N的过程中，我踩过不少坑。这里挑几个最深刻的分享。

**坑一：缓存雪崩**

事故发生在一次Redis集群主从切换。切换过程中约30秒不可用，这期间所有缓存过期。恢复后，大量请求同时回源数据库，数据库CPU瞬间飙到100%。

修复方案：缓存TTL加随机抖动。

```go
func jitteredTTL(base time.Duration) time.Duration {
    jitter := time.Duration(rand.Intn(int(base) / 3))
    return base + jitter
}

// 使用
cache.Set(ctx, key, value, jitteredTTL(30*time.Second))
// TTL在30-40秒之间随机分布，避免同时过期
```

**坑二：消息积压**

一次大促活动中，通知发送速度远大于消费速度，Kafka积压了300万条消息。消费者为了追赶进度，把并发度调到了100，结果数据库连接池被打满，服务直接OOM。

修复方案：消费速率必须和下游处理能力匹配，不能盲目提高并发。

```go
// 自适应消费速率控制
type AdaptiveConsumer struct {
    targetLag     int64       // 目标积压量
    maxWorkers    int         // 最大并发
    currentWorkers int        // 当前并发
    adjustInterval time.Duration
}

func (c *AdaptiveConsumer) adjust(ctx context.Context) {
    ticker := time.NewTicker(c.adjustInterval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            lag := c.getLag(ctx)
            if lag > c.targetLag*2 && c.currentWorkers < c.maxWorkers {
                c.currentWorkers++
                zap.L().Info("scale up consumers", zap.Int("workers", c.currentWorkers), zap.Int64("lag", lag))
            } else if lag < c.targetLag && c.currentWorkers > 1 {
                c.currentWorkers--
                zap.L().Info("scale down consumers", zap.Int("workers", c.currentWorkers), zap.Int64("lag", lag))
            }
        }
    }
}
```

**坑三：分布式锁的坑**

通知去重需要分布式锁，最初用Redis的`SETNX`实现。但在一次网络抖动中，锁的持有者实际上已经宕机，但锁还没过期，导致其他实例长时间获取不到锁。

修复方案：使用Redlock算法 + 锁续约（watchdog）。

```go
type Redlock struct {
    clients []*redis.Client
    retryCount int
    retryDelay time.Duration
    ttl time.Duration
}

func (r *Redlock) Lock(ctx context.Context, key, value string) (bool, error) {
    successCount := 0
    startTime := time.Now()
    
    for i := 0; i < len(r.clients); i++ {
        ok, err := r.clients[i].SetNX(ctx, key, value, r.ttl).Result()
        if err == nil && ok {
            successCount++
        }
    }
    
    // 超过半数节点加锁成功
    if successCount > len(r.clients)/2 {
        // 检查锁是否在有效期内
        elapsed := time.Since(startTime)
        if elapsed < r.ttl {
            // 启动续约goroutine
            go r.renewal(key, value)
            return true, nil
        }
        // 锁已过期，释放
        r.unlock(ctx, key, value)
    }
    
    return false, nil
}

func (r *Redlock) renewal(key, value string) {
    ticker := time.NewTicker(r.ttl / 3)
    defer ticker.Stop()
    
    for range ticker.C {
        ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
        // 使用Lua脚本检查并续约
        script := `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end`
        successCount := 0
        for _, client := range r.clients {
            res, err := client.Eval(ctx, script, []string{key}, value, int(r.ttl.Seconds())).Result()
            if err == nil && res == int64(1) {
                successCount++
            }
        }
        if successCount <= len(r.clients)/2 {
            // 续约失败，停止
            cancel()
            return
        }
        cancel()
    }
}
```

> 每一个坑都是用血泪填出来的。你可以从别人的经验中学习，但有些坑只有自己踩过才能真正理解。所以不要害怕踩坑，要害怕踩了同一个坑两次。

### 6.2 通知平台性能优化清单

经过这一系列优化，我总结了一套可复用的性能优化清单，按照优先级排列：

**P0 - 必须做（上线前检查）**

1. [ ] 数据库连接池参数已调优（MaxOpenConns, MaxIdleConns, ConnMaxLifetime）
2. [ ] 所有查询都有索引覆盖，无全表扫描
3. [ ] 热点数据有缓存层，缓存击穿有singleflight保护
4. [ ] 批量写入替代循环单条写入
5. [ ] HTTP/GRPC接口有超时控制
6. [ ] 关键操作有错误重试机制

**P1 - 应该做（上线后迭代）**

1. [ ] 读写分离，读操作走从库
2. [ ] OFFSET分页改为游标分页
3. [ ] 慢查询定期分析和治理
4. [ ] 消息队列消费速率自适应调整
5. [ ] 缓存TTL加随机抖动，防雪崩
6. [ ] 限流策略覆盖入口和出口
7. [ ] pprof定期采样分析CPU和内存热点

**P2 - 建议做（持续优化）**

1. [ ] 大表分片或历史数据归档
2. [ ] sync.Pool复用高频分配对象
3. [ ] JSON序列化优化（只返回必要字段）
4. [ ] 多级缓存（L1本地 + L2 Redis）
5. [ ] 缓存预热机制
6. [ ] 死信队列和告警闭环
7. [ ] 全链路压测和容量规划

### 6.3 最佳实践总结

回顾整个通知平台的性能优化历程，我提炼出几条核心原则：

**原则一：测量先行，优化后行**

不要凭感觉优化。在动手之前，先用pprof、火焰图、慢查询日志等工具定位真正的瓶颈。把80%的精力花在排名前20%的问题上。

**原则二：分层防御，逐级降级**

每一层都要有自己的保护机制：网关层限流、服务层熔断、缓存层降级、数据库层连接池控制。任何一层失守，下一层要能接住。

**原则三：异步优先，同步兜底**

凡是能异步处理的，都走消息队列。同步路径越短越好，只保留核心逻辑。但异步必须有兜底方案：消息丢失怎么办？消费失败怎么办？积压怎么办？

**原则四：缓存是双刃剑**

缓存能解决大部分性能问题，但也会引入一致性问题。使用缓存时必须想清楚三个问题：什么时候写缓存？什么时候删缓存？缓存和数据不一致时以谁为准？

**原则五：可观测性是基础**

优化效果如何验证？线上问题如何定位？都依赖可观测性。metrics（指标）、logs（日志）、traces（链路追踪）三件套，一个都不能少。

```go
// 可观测性配置示例
func SetupObservability(serviceName string) (*zap.Logger, *prometheus.Registry, error) {
    // 结构化日志
    logger, _ := zap.NewProduction(zap.Fields(
        zap.String("service", serviceName),
        zap.String("instance", getHostName()),
    ))
    
    // Prometheus指标
    registry := prometheus.NewRegistry()
    registry.MustRegister(promhttp.NewInstrumentationHandler)
    
    // 自定义业务指标
    notificationCounter := prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "notifications_sent_total",
            Help: "Total notifications sent",
        },
        []string{"channel", "status"},
    )
    registry.MustRegister(notificationCounter)
    
    return logger, registry, nil
}
```

> 最佳实践不是教条，而是前人踩坑后的经验结晶。理解它们背后的原因，比记住它们本身更重要。在正确的场景下应用正确的实践，才是工程智慧的体现。

### 6.4 性能优化效果数据

最后，分享一组优化前后的对比数据，让你直观感受这些优化带来的效果：

| 指标 | 优化前 | 优化后 | 提升幅度 |
|------|--------|--------|---------|
| 通知列表API P99延迟 | 320ms | 45ms | 7.1x |
| 通知写入吞吐量 | 200/s | 15000/s | 75x |
| 数据库CPU峰值 | 98% | 35% | 2.8x |
| Redis缓存命中率 | 0% | 94% | - |
| 消息消费延迟 | 30s+ | <500ms | 60x |
| 单机QPS | 800 | 5000 | 6.25x |
| 内存分配速率 | 4GB/s | 1.2GB/s | 3.3x |

这些数字背后，是无数次的压测、分析、调优、再压测的循环。性能优化没有银弹，只有持续的打磨。

---

## 写在最后

这一章我们把通知平台从"能跑"优化到了"能扛"。从高并发读写、数据库分片、缓存策略、性能瓶颈分析、异步消息队列到限流策略，每一个环节都是系统稳定性的基石。

但性能优化不是一个阶段性任务，而是一个持续的过程。随着业务增长，今天的优化成果可能就是明天的性能瓶颈。保持对系统指标的敏感，建立完善的监控告警体系，才能在问题爆发之前防患于未然。

下一章，我们要进入一个全新的模块——**可观测性体系建设**。日志、指标、链路追踪，这三件套怎么在Go项目中落地？怎样做到既能快速定位问题，又不会因为可观测性本身拖垮系统性能？我们下一章见。

---

**如果这篇文章对你有帮助，点个收藏，以后翻出来复习的时候不用满世界找。**

**你在性能优化中踩过什么印象深刻的坑？评论区聊聊，说不定你的坑能帮到其他人。**

**这是《Go后端专家之路》系列的第4章，关注我追更不迷路。下一章我们聊可观测性，别错过。**

---

**系列进度：4/16**

下章预告：**第5章 可观测性体系建设——日志、指标与链路追踪的Go实践**

---

> 怕浪猫说：性能优化这件事，就像给一栋大楼做结构加固。你不需要把它拆了重建，但你需要知道哪根柱子承受了最大的压力，哪面墙出现了裂缝。然后，在不影响楼上人办公的前提下，一根柱子一根柱子地加固。急不得，但也等不得。