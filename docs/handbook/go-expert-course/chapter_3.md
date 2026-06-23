# Go技术专家进阶营（三）：通知平台高可用与容错

> 系统不出故障是不可能的，真正区分高手和新手的，是系统出故障后的表现——是优雅降级还是雪崩崩溃。

我是怕浪猫，继续Go技术专家进阶营。前两周我们完成了通知平台的需求分析、架构设计和核心功能实现。第三周进入深水区——高可用与容错。

> 高可用不是一项技术，而是一套体系。从架构设计到代码实现，从监控告警到故障演练，每个环节都不能缺。

---

## 3.1 高可用架构方案实施

### 高可用目标

通知平台的高可用目标是：核心API可用性 99.9%（年停机 < 8.76小时），消息投递成功率 99.5%+（短信渠道），故障恢复时间 < 5分钟。

要实现这个目标，需要从三个层面构建高可用体系：

**服务层面**：无单点部署，所有服务节点对等，任一节点故障不影响服务。通过负载均衡分发流量，健康检查自动摘除故障节点。

**数据层面**：MySQL主从复制+自动切换，Redis Cluster集群，RabbitMQ镜像队列。数据至少在两个节点上有副本。

**渠道层面**：每个渠道配置主备服务商，主渠道故障自动切备。渠道健康检查实时监控可用性。

### 服务部署架构

通知平台采用同城双活部署：

```
                    DNS / 负载均衡
                   /              \
            机房A (Active)     机房B (Active)
            +--API Server      +--API Server
            +--Worker          +--Worker
            +--MySQL Master    +--MySQL Slave
            +--Redis           +--Redis
            +--RabbitMQ        +--RabbitMQ
                   \              /
                    数据同步 / 复制
```

两个机房同时提供服务，通过DNS轮询或负载均衡分流。MySQL在机房A为主、机房B为从，机房A故障时切换到机房B。Redis使用Cluster模式，两个机房各部署部分分片。RabbitMQ使用镜像队列，消息在两个机房各存一份。

### 健康检查与故障转移

**服务健康检查：**

每个服务节点定期向注册中心（如etcd/Consul）上报心跳。负载均衡器通过注册中心获取健康节点列表，只向健康节点分发流量。

```go
type HealthChecker struct {
    registry *registry.Client
    interval time.Duration
}

func (h *HealthChecker) Start(ctx context.Context, serviceID, addr string) {
    ticker := time.NewTicker(h.interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            if err := h.check(); err != nil {
                h.registry.Deregister(serviceID)
                log.Error("health check failed, deregistered", err)
            } else {
                h.registry.Heartbeat(serviceID)
            }
        }
    }
}

func (h *HealthChecker) check() error {
    // 检查DB连接
    if err := h.db.Ping(); err != nil {
        return fmt.Errorf("db ping failed: %w", err)
    }
    // 检查Redis连接
    if err := h.redis.Ping(context.Background()).Err(); err != nil {
        return fmt.Errorf("redis ping failed: %w", err)
    }
    // 检查MQ连接
    if !h.mq.IsConnected() {
        return fmt.Errorf("mq not connected")
    }
    return nil
}
```

**渠道健康检查：**

渠道健康检查通过实际发送或调用查询接口来判断渠道可用性：

```go
type ChannelHealthChecker struct {
    clients      map[string]ChannelClient
    failureCount map[string]int
    threshold    int
    checkInterval time.Duration
}

func (c *ChannelHealthChecker) Check(ctx context.Context) {
    for name, client := range c.clients {
        if err := client.Health(ctx); err != nil {
            c.failureCount[name]++
            if c.failureCount[name] >= c.threshold {
                c.markUnavailable(name)
                log.Warnf("channel %s marked unavailable: %v", name, err)
            }
        } else {
            c.failureCount[name] = 0
            c.markAvailable(name)
        }
    }
}
```

当连续失败次数超过阈值（如3次），标记渠道不可用，路由模块自动切换到备选渠道。恢复检查的间隔逐渐递增（指数退避），避免频繁检查给渠道服务商造成压力。

### MySQL高可用

MySQL采用主从复制+Orchestrator自动切换方案：

- 主库负责写操作，从库负责读操作
- 使用Orchestrator监控主库状态，主库故障自动提升从库为主库
- 应用层通过ProxySQL或服务发现感知主库切换

Go代码中处理主从切换：

```go
type DBManager struct {
    master *gorm.DB
    slaves []*gorm.DB
    current int
    mu      sync.RWMutex
}

func (m *DBManager) Master() *gorm.DB {
    m.mu.RLock()
    defer m.mu.RUnlock()
    return m.master
}

func (m *DBManager) Slave() *gorm.DB {
    m.mu.RLock()
    defer m.mu.RUnlock()
    if len(m.slaves) == 0 {
        return m.master
    }
    idx := atomic.AddInt64(&m.counter, 1) % int64(len(m.slaves))
    return m.slaves[idx]
}

func (m *DBManager) SwitchMaster(newMaster *gorm.DB) {
    m.mu.Lock()
    defer m.mu.Unlock()
    old := m.master
    m.master = newMaster
    // old master becomes slave after recovery
    m.slaves = append(m.slaves, old)
}
```

### Redis高可用

Redis采用Cluster模式，至少6个节点（3主3从），自动分片和故障转移。Go客户端使用go-redis自动感知集群拓扑和节点切换：

```go
func NewRedisClient(cfg *config.RedisConfig) *redis.Client {
    return redis.NewClient(&redis.Options{
        Addr:         cfg.Addr,
        Password:     cfg.Password,
        DB:           cfg.DB,
        PoolSize:     20,
        MinIdleConns: 5,
        MaxRetries:   3,
        ReadOnly:     true,  // 读从库
        ClusterSlots: func() ([]redis.ClusterSlot, error) {
            // 自动刷新集群拓扑
            return redis.DefaultClusterSlots(cfg.Addr)()
        },
    })
}
```

> 高可用架构的第一原则是"消除单点"。但消除单点是有成本的——更多的机器、更复杂的数据同步、更难的一致性保证。所以不是所有组件都需要高可用，要按业务影响来判断。通知平台的API和消息队列必须高可用，但管理后台和统计报表可以不那么高可用。

---

## 3.2 服务治理（负载均衡、自动故障转移）

### 负载均衡策略

通知平台在不同层级使用不同的负载均衡策略：

**入口层（外部请求）**：使用Nginx/HAProxy做HTTP负载均衡，策略为加权轮询（按节点性能分配权重）。

**服务间调用**：使用客户端负载均衡（如gRPC的round_robin），从注册中心获取节点列表，在客户端做负载均衡。

**消息消费**：RabbitMQ通过多个Consumer并行消费，天然实现负载均衡。通过prefetch_count控制每个Consumer的并发处理量。

```go
// 消息消费者负载均衡
type ConsumerPool struct {
    consumers []*Consumer
    prefetch  int
}

func NewConsumerPool(mq *amqp.Connection, queue string, count, prefetch int, handler MessageHandler) *ConsumerPool {
    pool := &ConsumerPool{prefetch: prefetch}
    for i := 0; i < count; i++ {
        ch, _ := mq.Channel()
        ch.Qos(prefetch, 0, false)  // 每个consumer最多prefetch条未确认消息
        consumer := &Consumer{
            channel: ch,
            queue:   queue,
            handler: handler,
        }
        go consumer.Consume()
        pool.consumers = append(pool.consumers, consumer)
    }
    return pool
}
```

### 自动故障转移

**服务节点故障转移：**

当某个服务节点不可用时，注册中心会检测到心跳超时，将其从可用节点列表中移除。负载均衡器自动将流量转发到其他健康节点。整个过程不需要人工干预，通常在30秒内完成。

**渠道故障转移：**

渠道故障转移更复杂，需要判断是临时故障还是持续故障，以及什么时候该切换：

```go
type ChannelFailover struct {
    primary       ChannelClient
    secondary     ChannelClient
    healthChecker *ChannelHealthChecker
    cooldown      time.Duration
    lastFailTime  time.Time
}

func (f *ChannelFailover) Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    // 检查主渠道是否可用
    if f.healthChecker.IsAvailable(f.primary.Name()) {
        result, err := f.primary.Send(ctx, msg)
        if err == nil {
            return result, nil
        }
        // 主渠道发送失败
        f.healthChecker.RecordFailure(f.primary.Name())
        log.Warnf("primary channel %s failed: %v, trying secondary", f.primary.Name(), err)
    }
    
    // 使用备选渠道
    result, err := f.secondary.Send(ctx, msg)
    if err != nil {
        return nil, fmt.Errorf("both primary and secondary channels failed: %w", err)
    }
    
    // 记录使用了备选渠道，供后续监控分析
    result.ProviderID = "failover:" + result.ProviderID
    return result, nil
}
```

**数据库故障转移：**

数据库故障转移由Orchestrator或MHA自动完成。Go应用层需要处理数据库连接断开后的重连：

```go
type ResilientDB struct {
    db     *gorm.DB
    cfg    *config.DBConfig
    mu     sync.RWMutex
}

func (r *ResilientDB) Get() *gorm.DB {
    r.mu.RLock()
    db := r.db
    r.mu.RUnlock()
    
    if err := db.Exec("SELECT 1").Error; err != nil {
        r.reconnect()
        r.mu.RLock()
        db = r.db
        r.mu.RUnlock()
    }
    return db
}

func (r *ResilientDB) reconnect() {
    r.mu.Lock()
    defer r.mu.Unlock()
    
    db, err := gorm.Open(mysql.Open(r.cfg.DSN), &gorm.Config{})
    if err != nil {
        log.Errorf("reconnect db failed: %v", err)
        return
    }
    r.db = db
    log.Info("db reconnected successfully")
}
```

### 服务降级

当系统压力过大或依赖服务故障时，通过降级策略保障核心功能可用：

**渠道降级**：短信不可用时降级到站内信，Push不可用时降级到站内信。核心思路是确保消息以某种方式触达用户，即使不是最优渠道。

**功能降级**：高峰期关闭批量发送功能，只保留单条发送。关闭统计报表查询，释放DB资源。

**质量降级**：降低消息投递保证级别，从"至少一次"降为"最多一次"，减少重试带来的负载。

```go
type DegradationManager struct {
    level    int  // 0=正常, 1=轻度降级, 2=重度降级
    triggers map[int]func() bool
}

func (m *DegradationManager) Check() {
    // CPU使用率 > 80% 进入轻度降级
    if m.cpuUsage() > 80 && m.level < 1 {
        m.level = 1
        log.Warn("entering level 1 degradation: batch send disabled")
    }
    // CPU使用率 > 90% 进入重度降级
    if m.cpuUsage() > 90 && m.level < 2 {
        m.level = 2
        log.Warn("entering level 2 degradation: retry disabled, only critical notifications")
    }
    // 恢复
    if m.cpuUsage() < 60 && m.level > 0 {
        m.level = 0
        log.Info("degradation recovered")
    }
}

func (m *DegradationManager) CanBatchSend() bool {
    return m.level < 1
}

func (m *DegradationManager) ShouldRetry() bool {
    return m.level < 2
}
```

> 降级策略的核心是"有损服务"而非"拒绝服务"。宁可给用户一个不那么完美的体验（如短信变站内信），也不能让整个系统崩溃。但降级必须是可控的——知道什么时候降、降什么、什么时候恢复。

---

## 3.3 容错策略设计（熔断、降级、重试）

### 熔断器实现

熔断器（Circuit Breaker）防止对故障服务的持续调用，避免连锁故障。熔断器有三个状态：

- **Closed（关闭）**：正常调用，记录失败率
- **Open（打开）**：熔断，直接返回错误，不调用下游
- **Half-Open（半开）**：尝试少量调用，成功则恢复，失败则继续熔断

```go
type CircuitBreaker struct {
    mu              sync.Mutex
    state           State
    failureCount    int
    successCount    int
    failureThreshold int     // 失败次数阈值
    successThreshold int     // 半开状态成功次数阈值
    timeout         time.Duration  // 熔断恢复时间
    lastFailure     time.Time
}

type State int

const (
    StateClosed   State = iota
    StateOpen
    StateHalfOpen
)

func (cb *CircuitBreaker) Execute(fn func() error) error {
    cb.mu.Lock()
    
    switch cb.state {
    case StateOpen:
        if time.Since(cb.lastFailure) > cb.timeout {
            cb.state = StateHalfOpen
            cb.successCount = 0
            cb.mu.Unlock()
        } else {
            cb.mu.Unlock()
            return ErrCircuitOpen
        }
    case StateHalfOpen:
        cb.mu.Unlock()
    case StateClosed:
        cb.mu.Unlock()
    }
    
    err := fn()
    
    cb.mu.Lock()
    defer cb.mu.Unlock()
    
    if err != nil {
        cb.failureCount++
        cb.lastFailure = time.Now()
        if cb.state == StateHalfOpen || cb.failureCount >= cb.failureThreshold {
            cb.state = StateOpen
        }
        return err
    }
    
    cb.successCount++
    if cb.state == StateHalfOpen && cb.successCount >= cb.successThreshold {
        cb.state = StateClosed
        cb.failureCount = 0
    }
    return nil
}
```

在渠道调用中使用熔断器：

```go
type CircuitBreakerChannel struct {
    client  ChannelClient
    breaker *CircuitBreaker
}

func (c *CircuitBreakerChannel) Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    var result *ChannelResult
    err := c.breaker.Execute(func() error {
        var err error
        result, err = c.client.Send(ctx, msg)
        return err
    })
    if err == ErrCircuitOpen {
        return nil, ErrChannelUnavailable
    }
    return result, err
}
```

### 重试策略

投递失败后的重试需要精心设计。不是所有错误都应该重试，重试间隔也不是固定的。

**可重试错误 vs 不可重试错误：**

- 可重试：网络超时、服务商5xx错误、渠道限流（429）
- 不可重试：参数错误（400）、鉴权失败（401）、用户不存在（404）

**指数退避重试：**

```go
type RetryPolicy struct {
    maxRetries    int
    initialDelay  time.Duration
    maxDelay      time.Duration
    multiplier    float64
}

func (p *RetryPolicy) NextDelay(attempt int) time.Duration {
    delay := float64(p.initialDelay) * math.Pow(p.multiplier, float64(attempt))
    if delay > float64(p.maxDelay) {
        delay = float64(p.maxDelay)
    }
    // 添加随机抖动，避免重试风暴
    jitter := delay * 0.1 * (rand.Float64()*2 - 1)
    return time.Duration(delay + jitter)
}

func (p *RetryPolicy) ShouldRetry(err error) bool {
    var channelErr *ChannelError
    if errors.As(err, &channelErr) {
        return channelErr.Retryable
    }
    // 网络错误默认可重试
    if isNetworkError(err) {
        return true
    }
    return false
}
```

**重试执行：**

```go
func (d *DeliveryService) deliverWithRetry(ctx context.Context, msg *Message, client ChannelClient) error {
    policy := &RetryPolicy{
        maxRetries:   msg.MaxRetry,
        initialDelay: 10 * time.Second,
        maxDelay:     10 * time.Minute,
        multiplier:   2,
    }
    
    for attempt := 0; attempt <= policy.maxRetries; attempt++ {
        result, err := client.Send(ctx, d.toChannelMessage(msg))
        if err == nil {
            d.recordSuccess(msg, result)
            return nil
        }
        
        if !policy.ShouldRetry(err) {
            d.recordFailure(msg, err, false)
            return err
        }
        
        if attempt < policy.maxRetries {
            delay := policy.NextDelay(attempt)
            msg.NextRetryAt = ptrTime(time.Now().Add(delay))
            msg.RetryCount = attempt + 1
            d.updateMessage(msg)
            
            timer := time.NewTimer(delay)
            select {
            case <-ctx.Done():
                timer.Stop()
                return ctx.Err()
            case <-timer.C:
            }
        }
    }
    
    d.recordFailure(msg, ErrMaxRetriesExceeded, true)
    return ErrMaxRetriesExceeded
}
```

> 重试策略的三个关键点：第一，区分可重试和不可重试错误，别对参数错误重试三次。第二，指数退避+随机抖动，避免重试风暴。第三，设置最大重试次数，否则就是无限循环。

### 限流策略

除了2.4节实现的令牌桶限流（业务方维度的QPS控制），通知平台还需要：

**渠道维度限流**：保护下游渠道服务商。如阿里云短信的QPS上限是1000，超过会被拒绝。通过令牌桶在投递层做限流。

**系统维度限流**：保护系统自身。当消息队列积压超过阈值时，降低消费速度，避免打爆DB。

```go
type ChannelRateLimiter struct {
    limiters map[string]*TokenBucketLimiter  // 每个渠道一个限流器
}

func (l *ChannelRateLimiter) Wait(ctx context.Context, channel string) error {
    limiter, ok := l.limiters[channel]
    if !ok {
        return nil  // 无限制
    }
    
    for {
        if limiter.Allow(channel, "") {
            return nil
        }
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-time.After(100 * time.Millisecond):
        }
    }
}
```

---

## 3.4 事务机制与事务回查

### 通知平台的事务场景

通知平台的核心事务场景是：业务方调用通知平台发送通知时，需要确保通知发送和业务状态更新的一致性。

比如订单支付成功后，订单系统需要把订单状态改为"已支付"并发送支付成功通知。这两步要么都成功，要么都失败。如果先改状态再发通知，发通知失败会导致用户不知道支付成功了。如果先发通知再改状态，改状态失败会导致通知发了但订单状态不对。

### 本地事务方案

最简单的方案是通知平台和业务方在同一个数据库中做本地事务：

```go
func (s *OrderService) PaySuccess(ctx context.Context, orderID string) error {
    return s.db.Transaction(func(tx *gorm.DB) error {
        // 1. 更新订单状态
        if err := tx.Model(&Order{}).Where("id = ?", orderID).
            Update("status", "paid").Error; err != nil {
            return err
        }
        // 2. 写入通知记录（同一个事务）
        notif := &Notification{
            OrderID:   orderID,
            Channel:   "sms",
            Content:   "您的订单已支付成功",
            Status:    "pending",
        }
        if err := tx.Create(notif).Error; err != nil {
            return err
        }
        return nil
    })
    // 事务提交后，由worker扫描pending的通知并发送
}
```

这个方案的优点是简单可靠，但要求通知平台和业务方在同一个数据库。对于独立的通知平台服务不适用。

### 消息事务方案

通知平台作为独立服务时，使用消息事务（事务消息）保证一致性。以RabbitMQ为例：

**方案一：事务消息表**

业务方在本地事务中同时写入一条"待发送通知"记录，事务提交后通过一个"消息投递服务"扫描待发送记录并调用通知平台。

```go
// 业务方侧
func (s *OrderService) PaySuccess(ctx context.Context, orderID string) error {
    return s.db.Transaction(func(tx *gorm.DB) error {
        // 1. 更新订单状态
        tx.Model(&Order{}).Where("id = ?", orderID).Update("status", "paid")
        // 2. 写入待发送通知记录（同一个事务）
        tx.Create(&OutboxMessage{
            Target:   "notification_platform",
            Payload:  fmt.Sprintf(`{"order_id":"%s","event":"pay_success"}`, orderID),
            Status:   "pending",
        })
        return nil
    })
}

// 消息投递服务（定时扫描）
func (s *OutboxService) Scan(ctx context.Context) {
    var msgs []OutboxMessage
    s.db.Where("status = ? AND created_at < ?", "pending", time.Now().Add(-5*time.Second)).
        Limit(100).Find(&msgs)
    
    for _, msg := range msgs {
        err := s.notifyClient.Send(ctx, msg.Payload)
        if err == nil {
            s.db.Model(&msg).Update("status", "sent")
        } else {
            s.db.Model(&msg).Update("retry_count", gorm.Expr("retry_count + 1"))
        }
    }
}
```

这种"本地消息表"模式的本质是：把分布式事务降级为本地事务+异步消息。通过最终一致性解决问题。

**方案二：事务回查**

事务回查是RocketMQ的事务消息机制。业务方先发送"半消息"到MQ，MQ收到半消息后不会立即投递给消费者。业务方执行本地事务，根据本地事务结果提交或回滚半消息。如果MQ在超时时间内没收到提交/回滚指令，主动回查业务方的本地事务状态。

在RabbitMQ中模拟事务回查：

```go
// 1. 发送半消息（标记为uncommitted）
func (s *NotificationService) SendWithTransaction(ctx context.Context, req *SendRequest) (string, error) {
    msgID := generateID()
    
    // 写入消息表，状态为uncommitted
    msg := &Message{
        ID:     msgID,
        BizID:  req.BizID,
        Status: StatusUncommitted,
        // ...其他字段
    }
    if err := s.store.Create(ctx, msg); err != nil {
        return "", err
    }
    
    // 发送到延迟队列，延迟30秒后回查
    s.scheduler.ScheduleDelay(ctx, msg, 30*time.Second)
    
    return msgID, nil
}

// 2. 业务方确认提交
func (s *NotificationService) Confirm(ctx context.Context, msgID string) error {
    msg, err := s.store.Get(ctx, msgID)
    if err != nil {
        return err
    }
    if msg.Status != StatusUncommitted {
        return ErrInvalidStatus
    }
    
    msg.Status = StatusPending
    if err := s.store.Update(ctx, msg); err != nil {
        return err
    }
    
    // 投递到消息队列
    return s.scheduler.Enqueue(ctx, msg)
}

// 3. 业务方取消
func (s *NotificationService) Cancel(ctx context.Context, msgID string) error {
    msg, err := s.store.Get(ctx, msgID)
    if err != nil {
        return err
    }
    msg.Status = StatusCancelled
    return s.store.Update(ctx, msg)
}

// 4. 事务回查（延迟队列触发）
func (s *NotificationService) TransactionCheckback(ctx context.Context, msgID string) {
    msg, err := s.store.Get(ctx, msgID)
    if err != nil {
        return
    }
    
    if msg.Status == StatusUncommitted {
        // 超过30秒仍未确认，回查业务方
        status, err := s.queryBizStatus(ctx, msg.BizID)
        if err != nil || status == "cancelled" {
            msg.Status = StatusCancelled
            s.store.Update(ctx, msg)
        } else if status == "confirmed" {
            msg.Status = StatusPending
            s.store.Update(ctx, msg)
            s.scheduler.Enqueue(ctx, msg)
        } else {
            // 未知状态，再等30秒
            s.scheduler.ScheduleDelay(ctx, msg, 30*time.Second)
        }
    }
}
```

> 事务回查的本质是"超时确认"机制。业务方正常情况下主动确认，异常情况下（如网络故障、服务重启）由通知平台主动回查。这样即使业务方服务短暂不可用，也能保证最终一致。

---

## 3.5 消息可靠投递保障

### 消息投递语义

消息投递有三种语义：

- **最多一次（At Most Once）**：消息可能丢失，不会重复。适合营销类通知。
- **至少一次（At Least Once）**：消息不会丢失，可能重复。适合订单类通知。
- **精确一次（Exactly Once）**：消息既不丢失也不重复。实现成本最高。

通知平台默认采用"至少一次"语义。通过幂等机制把"至少一次"升级为"精确一次"的效果。

### 消息不丢失保障

消息从产生到投递经过多个环节，每个环节都可能丢失：

**环节一：业务方到通知平台**。网络故障导致请求未到达。防护：业务方实现重试机制，通知平台做幂等处理。

**环节二：通知平台内部处理**。处理过程中服务崩溃。防护：消息持久化到MySQL后再入队列。处理失败时从MySQL恢复。

**环节三：消息队列存储**。MQ自身故障丢消息。防护：RabbitMQ使用镜像队列，消息持久化到磁盘。

**环节四：投递到渠道服务商**。网络超时或服务商故障。防护：重试机制+指数退避。

**环节五：投递结果记录**。投递成功但记录失败。防护：先记录"发送中"状态，投递完成后更新状态。即使更新失败，通过定时任务对账补偿。

```go
func (d *DeliveryService) Deliver(ctx context.Context, msg *Message) error {
    // 1. 标记为"发送中"
    msg.Status = StatusSending
    d.store.Update(ctx, msg)
    
    // 2. 获取渠道客户端（含熔断器）
    client, err := d.getChannelClient(msg.Channel)
    if err != nil {
        return d.handleFailure(ctx, msg, err)
    }
    
    // 3. 带重试的投递
    result, err := d.deliverWithRetry(ctx, msg, client)
    if err != nil {
        return d.handleFailure(ctx, msg, err)
    }
    
    // 4. 记录成功
    msg.Status = StatusSent
    msg.UpdatedAt = time.Now()
    d.store.Update(ctx, msg)
    
    // 5. 发送回调
    if msg.CallbackURL != "" {
        d.sendCallback(msg, result)
    }
    
    return nil
}

func (d *DeliveryService) handleFailure(ctx context.Context, msg *Message, err error) error {
    msg.Status = StatusFailed
    msg.UpdatedAt = time.Now()
    d.store.Update(ctx, msg)
    
    // 超过最大重试次数，进入死信
    if msg.RetryCount >= msg.MaxRetry {
        d.deadLetterQueue.Publish(ctx, msg)
        d.alertService.SendAlert("message_dead_letter", msg)
    }
    
    return err
}
```

### 消息不重复保障

完全避免重复投递是非常困难的，但可以通过以下手段减少重复：

1. **业务方幂等**：业务方使用biz_id做幂等，即使收到重复通知也不重复处理。
2. **平台幂等**：通知平台用Redis的SETNX做biz_id去重。
3. **投递去重**：投递前检查消息状态，已是StatusSent的消息不重复投递。
4. **渠道去重**：部分渠道（如阿里云短信）支持通过流水号去重。

### 消息顺序保障

大多数通知场景不需要顺序保障。但少数场景（如先发"支付成功"再发"发货通知"）需要保证顺序。

顺序投递的实现方案：同一用户的同一业务流程的消息路由到同一个队列分区，单消费者消费保证顺序：

```go
func (s *SchedulerService) Enqueue(ctx context.Context, msg *Message) error {
    // 按用户ID hash到固定分区，保证同一用户的消息顺序
    partitionKey := fmt.Sprintf("user:%s", msg.Receiver)
    return s.mq.PublishWithRoutingKey(ctx, "notification", partitionKey, msg)
}
```

### 死信处理

消息超过最大重试次数后进入死信队列。死信队列有专门的管理界面和告警：

```go
type DeadLetterHandler struct {
    store    MessageStore
    alerter  AlertService
}

func (h *DeadLetterHandler) Handle(ctx context.Context, msg *Message) error {
    // 1. 记录死信
    msg.Status = StatusDead
    msg.UpdatedAt = time.Now()
    if err := h.store.Update(ctx, msg); err != nil {
        return err
    }
    
    // 2. 告警
    h.alerter.Send(Alert{
        Level:    "critical",
        Title:    fmt.Sprintf("Message dead letter: %s", msg.BizID),
        Message:  fmt.Sprintf("Channel: %s, Receiver: %s, Retry: %d", msg.Channel, msg.Receiver, msg.RetryCount),
        Action:   "manual_intervention_required",
    })
    
    // 3. 可选：自动降级到其他渠道重试
    if msg.Channel == "sms" {
        msg.Channel = "im"
        msg.Status = StatusPending
        msg.RetryCount = 0
        h.store.Update(ctx, msg)
        return h.scheduler.Enqueue(ctx, msg)
    }
    
    return nil
}
```

> 消息可靠投递的核心理念是"宁可重复，不可丢失"。重复可以通过幂等解决，丢失是找不回来的。但这不意味着可以无脑重试——重试要有限度（max_retry），超出限度要有兜底（死信+人工介入）。

### 消息对账机制

定时对账确保系统状态正确。对账维度：

1. **发送量对账**：业务方发送量 vs 通知平台接收量 vs 渠道投递量
2. **状态对账**：StatusSending超过30分钟的消息（可能处理中断）
3. **回调对账**：投递成功但回调失败的记录

```go
func (s *ReconcileService) Run(ctx context.Context) {
    // 每小时执行一次对账
    
    // 1. 找出"发送中"超过30分钟的消息
    var stuck []Message
    s.store.Where("status = ? AND updated_at < ?", StatusSending, time.Now().Add(-30*time.Minute)).
        Find(&stuck)
    
    for _, msg := range stuck {
        // 重新入队处理
        msg.Status = StatusPending
        msg.RetryCount++
        s.store.Update(ctx, &msg)
        s.scheduler.Enqueue(ctx, &msg)
    }
    
    // 2. 找出投递成功但回调失败的记录
    var callbackFailed []Message
    s.store.Where("status = ? AND callback_status = ?", StatusSent, "failed").
        Find(&callbackFailed)
    
    for _, msg := range callbackFailed {
        s.sendCallback(ctx, &msg)
    }
}
```

---

## 总结

第三周的核心任务是"让系统在故障中依然可用"。高可用架构消除了单点，服务治理实现了自动故障转移，容错策略（熔断、降级、重试）防止了故障扩散，事务机制保证了数据一致性，消息可靠投递保障了消息不丢失不重复。

本周关键知识点回顾：

| 知识点 | 核心内容 |
|--------|---------|
| 高可用架构 | 同城双活、无单点部署、健康检查自动故障转移 |
| 服务治理 | 负载均衡、故障转移、服务降级 |
| 容错策略 | 熔断器（三状态）、指数退避重试、多维度限流 |
| 事务机制 | 本地消息表、事务回查、最终一致性 |
| 可靠投递 | 至少一次语义、五环节防丢失、幂等去重、死信处理、对账补偿 |

> 高可用和容错是"保险"——平时看不出价值，出事时救命。但也不能过度设计，要跟业务影响和团队能力匹配。一个日均千条消息的系统不需要同城双活。

觉得有用？收藏起来，下次做高可用设计时照着检查。你在生产环境遇到过什么故障？怎么恢复的？评论区聊聊。

关注怕浪猫，下期我们讲通知平台的性能优化与项目总结——包括高并发读写优化、数据库分片、性能瓶颈识别与调优、异步处理与消息队列应用、限流策略实现。

系列进度 3/16 — 下一篇：通知平台性能优化与总结

---

> 怕浪猫说：这周内容比较硬核，建议结合实际项目理解。如果你没做过高可用，可以试着在本地用Docker模拟节点故障，看看你的服务能不能自动恢复。
