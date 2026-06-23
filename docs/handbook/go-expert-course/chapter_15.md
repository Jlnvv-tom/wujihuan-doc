# 第15章：调度系统高可用与扩展——从单机到分布式的生产级实践

凌晨三点，你被电话炸醒。线上调度系统挂了，几十万个定时任务全部堆积，核心业务流程断裂。你爬起来登录服务器，发现是单点调度节点OOM了。重启之后，任务洪水般的涌入，又把机器打挂了。这种"一挂全挂、一恢复就雪崩"的困境，是每一个调度系统走向生产级必须迈过的坎。

我是怕浪猫，一个在分布式调度坑里摸爬滚打多年的老兵。从前几年用crontab裸跑到后来基于各种开源调度框架做二次开发，我踩过的坑可能比你写过的代码都多。今天这一章，我把调度系统高可用与扩展的实战经验一次性讲透，从架构设计到分片策略，从动态扩缩容到监控运维，全是生产环境验证过的干货。

> 调度系统的高可用不是"加个备份"那么简单，而是从架构层面消灭单点、从策略层面消化故障、从运维层面感知异常。

## 一、调度系统高可用架构

### 1.1 为什么单机调度是定时炸弹

我见过太多团队用一台机器跑crontab或者单个调度进程，觉得"任务不多，够用了"。但生产环境永远会给你惊喜：

- 调度进程OOM崩溃，所有任务停止执行
- 机器硬件故障，调度数据全部丢失
- 网络抖动导致任务重复触发，业务数据被污染
- 任务堆积导致雪崩，恢复后无法承接突发流量

> 单机调度系统的可靠性上限就是那台机器的MTBF（平均无故障时间），而生产环境要求的是系统级的高可用。

### 1.2 多节点高可用架构设计

核心思路：调度节点多实例部署，通过分布式锁保证同一任务在同一时刻只被一个节点执行。

```
                    +------------------+
                    |   配置中心/DB     |
                    | (任务定义+调度规则)|
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+----+   +-----+----+   +-----+----+
        | 调度节点A |   | 调度节点B |   | 调度节点C |
        +-----+----+   +-----+----+   +-----+----+
              |              |              |
              +--------------+--------------+
                             |
                    +--------+---------+
                    |  执行器集群(Worker) |
                    +------------------+
```

先看调度节点的核心选主逻辑：

```go
package scheduler

import (
    "context"
    "fmt"
    "time"
    
    "go.etcd.io/etcd/client/v3/concurrency"
)

// LeaderElector 选主管理器
type LeaderElector struct {
    client    *clientv3.Client
    nodeID    string
    isLeader  bool
    onLeader  func()
    onFollower func()
    cancel    context.CancelFunc
}

func NewLeaderElector(client *clientv3.Client, nodeID string) *LeaderElector {
    return &LeaderElector{
        client: client,
        nodeID: nodeID,
    }
}

func (le *LeaderElector) Start(ctx context.Context) error {
    ctx, le.cancel = context.WithCancel(ctx)
    
    session, err := concurrency.NewSession(le.client, 
        concurrency.WithTTL(10))
    if err != nil {
        return fmt.Errorf("create session failed: %w", err)
    }
    
    election := concurrency.NewElection(session, "/scheduler/leader")
    
    go func() {
        for {
            select {
            case <-ctx.Done():
                session.Close()
                return
            default:
                // 尝试竞选
                if err := election.Campaign(ctx, le.nodeID); err != nil {
                    fmt.Printf("campaign failed: %v, retry...\n", err)
                    time.Sleep(3 * time.Second)
                    continue
                }
                
                le.isLeader = true
                fmt.Printf("node %s became leader\n", le.nodeID)
                if le.onLeader != nil {
                    le.onLeader()
                }
                
                // 等待session过期或失去leader身份
                <-session.Done()
                le.isLeader = false
                if le.onFollower != nil {
                    le.onFollower()
                }
                fmt.Printf("node %s lost leader, re-campaign...\n", le.nodeID)
                
                // 重新建立session
                session, err = concurrency.NewSession(le.client,
                    concurrency.WithTTL(10))
                if err != nil {
                    fmt.Printf("recreate session failed: %v\n", err)
                    time.Sleep(3 * time.Second)
                    continue
                }
                election = concurrency.NewElection(session, "/scheduler/leader")
            }
        }
    }()
    
    return nil
}

func (le *LeaderElector) IsLeader() bool {
    return le.isLeader
}

func (le *LeaderElector) Stop() {
    if le.cancel != nil {
        le.cancel()
    }
}
```

> 选主不是目的，无缝故障转移才是。Leader挂了到新Leader接管，这个时间窗口决定了对业务的影响程度。

### 1.3 分布式锁实现任务互斥

选主解决了"谁来调度"的问题，但有些场景下我们希望所有节点都能调度，只是同一任务不能被多个节点同时触发。这就需要分布式锁：

```go
package scheduler

import (
    "context"
    "fmt"
    "time"
    
    "go.etcd.io/etcd/client/v3"
)

// DistributedLock 基于etcd的分布式锁
type DistributedLock struct {
    client  *clientv3.Client
    lease   clientv3.Lease
    leaseID clientv3.LeaseID
    key     string
    ttl     int64
}

func NewDistributedLock(client *clientv3.Client, key string, ttl int64) *DistributedLock {
    return &DistributedLock{
        client: client,
        key:    key,
        ttl:    ttl,
    }
}

// TryLock 尝试获取锁，非阻塞
func (dl *DistributedLock) TryLock(ctx context.Context) (bool, error) {
    // 创建lease
    lease, err := dl.client.Grant(ctx, dl.ttl)
    if err != nil {
        return false, fmt.Errorf("grant lease failed: %w", err)
    }
    
    dl.leaseID = lease.ID
    
    // 原子性的CreateIfNotExists
    txn := dl.client.Txn(ctx).
        If(clientv3.Compare(clientv3.CreateRevision(dl.key), "=", 0)).
        Then(clientv3.OpPut(dl.key, "locked", clientv3.WithLease(dl.leaseID))).
        Else(clientv3.OpGet(dl.key))
    
    resp, err := txn.Commit()
    if err != nil {
        dl.client.Revoke(ctx, dl.leaseID)
        return false, fmt.Errorf("txn commit failed: %w", err)
    }
    
    if !resp.Succeeded {
        dl.client.Revoke(ctx, dl.leaseID)
        return false, nil
    }
    
    // 启动keepalive
    go dl.keepAlive(ctx)
    
    return true, nil
}

// Lock 阻塞式获取锁
func (dl *DistributedLock) Lock(ctx context.Context) error {
    for {
        ok, err := dl.TryLock(ctx)
        if err != nil {
            return err
        }
        if ok {
            return nil
        }
        
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-time.After(500 * time.Millisecond):
        }
    }
}

// Unlock 释放锁
func (dl *DistributedLock) Unlock(ctx context.Context) error {
    _, err := dl.client.Revoke(ctx, dl.leaseID)
    return err
}

func (dl *DistributedLock) keepAlive(ctx context.Context) {
    ticker := time.NewTicker(time.Duration(dl.ttl/3) * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:\n            dl.client.KeepAliveOnce(ctx, dl.leaseID)\n        }\n    }\n}\n```\n\n### 1.4 故障转移策略\n\n当调度节点宕机时，需要做到秒级故障转移。这里的关键是心跳检测和任务接管：\n\n```go\npackage scheduler

import (
    "context"
    "fmt"
    "time"
)

// FailoverManager 故障转移管理器
type FailoverManager struct {
    etcdClient *clientv3.Client
    nodeID     string
    heartbeatInterval time.Duration
    heartbeatTTL      int64
}

// RegisterNode 注册调度节点
func (fm *FailoverManager) RegisterNode(ctx context.Context) error {
    key := fmt.Sprintf("/scheduler/nodes/%s", fm.nodeID)
    
    lease, err := fm.etcdClient.Grant(ctx, fm.heartbeatTTL)
    if err != nil {
        return err
    }
    
    _, err = fm.etcdClient.Put(ctx, key, 
        fmt.Sprintf(`{"node_id":"%s","status":"active","registered_at":"%s"}`, 
            fm.nodeID, time.Now().Format(time.RFC3339)),
        clientv3.WithLease(lease.ID))
    if err != nil {
        return err
    }
    
    // 心跳保活
    go func() {
        ticker := time.NewTicker(fm.heartbeatInterval)
        defer ticker.Stop()
        
        for {
            select {
            case <-ctx.Done():
                fm.etcdClient.Revoke(ctx, lease.ID)
                return
            case <-ticker.C:\n                fm.etcdClient.KeepAliveOnce(ctx, lease.ID)\n            }\n        }\n    }()\n    \n    return nil\n}\n\n// WatchNodes 监听节点变化，执行故障转移\nfunc (fm *FailoverManager) WatchNodes(ctx context.Context, onNodeDown func(nodeID string)) {
    watchCh := fm.etcdClient.Watch(ctx, "/scheduler/nodes/", clientv3.WithPrefix())
    
    go func() {
        for watchResp := range watchCh {
            for _, ev := range watchResp.Events {
                if ev.Type == clientv3.EventTypeDelete {
                    // 节点心跳过期，触发故障转移
                    downNodeID := extractNodeID(string(ev.Kv.Key))
                    fmt.Printf("[FAILOVER] node %s is down, triggering failover\n", downNodeID)
                    
                    // 查找该节点上正在执行的任务
                    fm.reassignTasks(ctx, downNodeID)
                    
                    if onNodeDown != nil {
                        onNodeDown(downNodeID)
                    }
                }
            }
        }
    }()
}

// reassignTasks 重新分配故障节点上的任务
func (fm *FailoverManager) reassignTasks(ctx context.Context, downNodeID string) {
    // 查找故障节点上分配的任务
    resp, err := fm.etcdClient.Get(ctx, 
        fmt.Sprintf("/scheduler/assignments/%s/", downNodeID),
        clientv3.WithPrefix())
    if err != nil {
        fmt.Printf("get assignments failed: %v\n", err)
        return
    }
    
    for _, kv := range resp.Kvs {
        taskID := extractTaskID(string(kv.Key))
        
        // 删除旧分配
        fm.etcdClient.Delete(ctx, string(kv.Key))
        
        // 重新分配到健康的节点
        fm.reassignToHealthyNode(ctx, taskID)
    }
}

func (fm *FailoverManager) reassignToHealthyNode(ctx context.Context, taskID string) {
    // 获取健康节点列表
    resp, err := fm.etcdClient.Get(ctx, "/scheduler/nodes/", clientv3.WithPrefix())
    if err != nil || len(resp.Kvs) == 0 {
        fmt.Printf("no healthy nodes available for task %s\n", taskID)
        return
    }
    
    // 简单的负载均衡：选择任务数最少的节点
    targetNode := fm.selectLeastLoadedNode(ctx, resp.Kvs)
    
    // 写入新的分配关系
    assignKey := fmt.Sprintf("/scheduler/assignments/%s/%s", targetNode, taskID)
    fm.etcdClient.Put(ctx, assignKey, time.Now().Format(time.RFC3339))
    
    fmt.Printf("[FAILOVER] task %s reassigned to node %s\n", taskID, targetNode)
}

func (fm *FailoverManager) selectLeastLoadedNode(ctx context.Context, nodes []clientv3.KeyValue) string {
    minLoad := int64(1<<63 - 1)
    targetNode := ""
    
    for _, node := range nodes {
        nodeID := extractNodeID(string(node.Key))
        // 统计该节点当前的任务数
        resp, _ := fm.etcdClient.Get(ctx,
            fmt.Sprintf("/scheduler/assignments/%s/", nodeID),
            clientv3.WithPrefix(), clientv3.WithCountOnly())
        
        if resp.Count < minLoad {
            minLoad = resp.Count
            targetNode = nodeID
        }
    }
    
    return targetNode
}
```

> 故障转移的核心不是"发现故障"，而是"转移状态"。任务状态、执行上下文、幂等保障，缺一不可。

### 1.5 任务幂等性保障

故障转移后，任务可能在两个节点上各执行一次。幂等性是兜底保障：

```go
package scheduler

import (
    "context"
    "fmt"
    "time"
)

// IdempotencyManager 幂等管理器
type IdempotencyManager struct {
    etcdClient *clientv3.Client
}

// ExecuteWithIdempotency 幂等执行
func (im *IdempotencyManager) ExecuteWithIdempotency(
    ctx context.Context,
    taskID string,
    triggerTime time.Time,
    executeFunc func() error,
) error {
    // 生成幂等key: taskID + 触发时间(精确到秒)
    idempotencyKey := fmt.Sprintf("/scheduler/idempotency/%s/%d", 
        taskID, triggerTime.Unix())
    
    // 尝试创建幂等记录
    txn := im.etcdClient.Txn(ctx).
        If(clientv3.Compare(clientv3.CreateRevision(idempotencyKey), "=", 0)).
        Then(clientv3.OpPut(idempotencyKey, "running", clientv3.WithLease(3600))).
        Else(clientv3.OpGet(idempotencyKey))
    
    resp, err := txn.Commit()
    if err != nil {
        return fmt.Errorf("idempotency check failed: %w", err)
    }
    
    if !resp.Succeeded {
        // 已经有其他节点在执行或已执行完成
        state := string(resp.Responses[0].GetResponseRange().Kvs[0].Value)
        if state == "completed" {
            fmt.Printf("task %s already completed by another node, skip\n", taskID)
            return nil
        }
        if state == "running" {
            // 检查是否超时（执行节点可能挂了）
            fmt.Printf("task %s is running on another node, skip\n", taskID)
            return nil
        }
    }
    
    // 执行任务
    err = executeFunc()
    
    // 更新状态
    finalState := "completed"
    if err != nil {
        finalState = "failed"
        // 执行失败时删除幂等记录，允许重试
        im.etcdClient.Delete(ctx, idempotencyKey)
        return err
    }
    
    im.etcdClient.Put(ctx, idempotencyKey, finalState, clientv3.WithLease(86400))
    return nil
}
```

## 二、任务分片与并行执行

### 2.1 为什么需要分片

我接过一个需求：每天凌晨处理3000万条用户数据，单线程跑要6个小时。业务方要求2小时内跑完。加机器？单任务没法并行。拆任务？改业务代码成本太高。

任务分片就是解决这类问题的利器：把一个大任务拆成多个子任务，分配到不同节点并行执行。

> 分片不是把任务切小，而是把时间切短。3000万条数据拆成10片，每片300万，10台机器同时跑，理论耗时降到原来的1/10。

### 2.2 分片策略设计

```go
package scheduler

import (
    "fmt"
    "hash/fnv"
)

// ShardingStrategy 分片策略接口
type ShardingStrategy interface {
    // 计算分片：返回分片索引和总分片数
    Shard(key string, totalShards int) int
}

// HashSharding 哈希分片
type HashSharding struct{}

func (h *HashSharding) Shard(key string, totalShards int) int {
    hash := fnv.New32a()
    hash.Write([]byte(key))
    return int(hash.Sum32()) % totalShards
}

// RangeSharding 范围分片
type RangeSharding struct {
    MinValue int64
    MaxValue int64
}

func (r *RangeSharding) Shard(key string, totalShards int) int {
    // 按ID范围分片
    var value int64
    fmt.Sscanf(key, "%d", &value)
    
    rangeSize := (r.MaxValue - r.MinValue) / int64(totalShards)
    if rangeSize == 0 {
        return 0
    }
    return int((value - r.MinValue) / rangeSize)
}

// ConsistentHashSharding 一致性哈希分片
type ConsistentHashSharding struct {
    ring *ConsistentHashRing
}

func NewConsistentHashSharding(nodes []string, virtualNodes int) *ConsistentHashSharding {
    ring := NewConsistentHashRing(virtualNodes)
    for _, node := range nodes {
        ring.AddNode(node)
    }
    return &ConsistentHashSharding{ring: ring}
}

func (c *ConsistentHashSharding) Shard(key string, totalShards int) int {
    node := c.ring.GetNode(key)
    // 将节点映射到分片索引
    hash := fnv.New32a()
    hash.Write([]byte(node))
    return int(hash.Sum32()) % totalShards
}
```

### 2.3 分片任务执行框架

```go
package scheduler

import (
    "context"
    "fmt"
    "sync"
    "time"
)

// ShardedTask 分片任务定义
type ShardedTask struct {
    TaskID       string
    Name         string
    TotalShards  int
    ShardingKey  string // 分片字段名
    ExecuteFunc  func(ctx context.Context, shardIndex, totalShards int) error
    Timeout      time.Duration
    RetryCount   int
}

// ShardedTaskExecutor 分片任务执行器
type ShardedTaskExecutor struct {
    etcdClient *clientv3.Client
    nodeID     string
}

// ExecuteShardedTask 执行分片任务
func (e *ShardedTaskExecutor) ExecuteShardedTask(
    ctx context.Context,
    task *ShardedTask,
) error {
    
    // 获取当前节点负责的分片
    myShards := e.getAssignedShards(ctx, task.TaskID, task.TotalShards)
    fmt.Printf("node %s assigned shards: %v\n", e.nodeID, myShards)
    
    if len(myShards) == 0 {
        fmt.Printf("node %s has no shards for task %s\n", e.nodeID, task.TaskID)
        return nil
    }
    
    var wg sync.WaitGroup
    errChan := make(chan error, len(myShards))
    
    for _, shardIndex := range myShards {
        wg.Add(1)
        go func(idx int) {
            defer wg.Done()
            
            shardCtx, cancel := context.WithTimeout(ctx, task.Timeout)
            defer cancel()
            
            // 幂等执行单个分片
            err := e.executeShardWithRetry(shardCtx, task, idx)
            if err != nil {
                errChan <- fmt.Errorf("shard %d failed: %w", idx, err)
            }
        }(shardIndex)
    }
    
    // 等待所有分片完成
    go func() {
        wg.Wait()
        close(errChan)
    }()
    
    // 收集错误
    var errs []error
    for err := range errChan {
        errs = append(errs, err)
    }
    
    if len(errs) > 0 {
        return fmt.Errorf("task %s completed with %d shard failures, first error: %w",
            task.TaskID, len(errs), errs[0])
    }
    
    fmt.Printf("task %s all shards completed successfully\n", task.TaskID)
    return nil
}

// getAssignedShards 获取当前节点负责的分片
func (e *ShardedTaskExecutor) getAssignedShards(
    ctx context.Context,
    taskID string,
    totalShards int,
) []int {
    // 获取所有活跃节点
    resp, err := e.etcdClient.Get(ctx, "/scheduler/nodes/", clientv3.WithPrefix())
    if err != nil {
        return nil
    }
    
    var nodes []string
    for _, kv := range resp.Kvs {
        nodes = append(nodes, extractNodeID(string(kv.Key)))
    }
    
    if len(nodes) == 0 {
        return nil
    }
    
    // 使用一致性哈希分配分片
    myShards := []int{}
    for i := 0; i < totalShards; i++ {
        shardKey := fmt.Sprintf("%s-shard-%d", taskID, i)
        assignedNode := consistentHash(shardKey, nodes)
        if assignedNode == e.nodeID {
            myShards = append(myShards, i)
        }
    }
    
    return myShards
}

// executeShardWithRetry 带重试的分片执行
func (e *ShardedTaskExecutor) executeShardWithRetry(
    ctx context.Context,
    task *ShardedTask,
    shardIndex int,
) error {
    var lastErr error
    
    for attempt := 0; attempt <= task.RetryCount; attempt++ {
        if attempt > 0 {
            fmt.Printf("shard %d retry attempt %d/%d\n", shardIndex, attempt, task.RetryCount)
            time.Sleep(time.Duration(attempt*attempt) * time.Second)
        }
        
        err := task.ExecuteFunc(ctx, shardIndex, task.TotalShards)
        if err == nil {
            return nil
        }
        
        lastErr = err
        fmt.Printf("shard %d attempt %d failed: %v\n", shardIndex, attempt, err)
    }
    
    return lastErr
}
```

> 分片执行最容易被忽视的问题：分片不均匀。某个分片数据量远超其他分片，整体耗时被最慢的分片拖死。

### 2.4 分片均衡与动态调整

```go
package scheduler

import (
    "context"
    "fmt"
    "sync"
    "time"
)

// ShardRebalancer 分片再均衡器
type ShardRebalancer struct {
    etcdClient   *clientv3.Client
    checkInterval time.Duration
    threshold     float64 // 不均衡阈值
}

// Rebalance 分片再均衡
func (r *ShardRebalancer) Rebalance(ctx context.Context) {
    ticker := time.NewTicker(r.checkInterval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:\n            r.doRebalance(ctx)\n        }\n    }\n}\n\nfunc (r *ShardRebalancer) doRebalance(ctx context.Context) {
    // 收集各节点的分片负载
    nodeLoad := make(map[string]int64)
    
    resp, err := r.etcdClient.Get(ctx, "/scheduler/load/", clientv3.WithPrefix())
    if err != nil {
        return
    }
    
    for _, kv := range resp.Kvs {
        nodeID := extractNodeID(string(kv.Key))
        load := parseLoadFromValue(string(kv.Value))
        nodeLoad[nodeID] = load
    }
    
    if len(nodeLoad) < 2 {
        return
    }
    
    // 计算不均衡度
    maxLoad, minLoad := int64(0), int64(1<<63-1)
    var totalLoad int64
    for _, load := range nodeLoad {
        if load > maxLoad {
            maxLoad = load
        }
        if load < minLoad {
            minLoad = load
        }
        totalLoad += load
    }
    
    avgLoad := totalLoad / int64(len(nodeLoad))
    if avgLoad == 0 {
        return
    }
    
    imbalance := float64(maxLoad-minLoad) / float64(avgLoad)
    if imbalance <= r.threshold {
        return // 负载均衡，无需调整
    }
    
    fmt.Printf("[REBALANCE] imbalance detected: %.2f, rebalancing...\n", imbalance)
    
    // 从高负载节点迁移分片到低负载节点
    r.migrateShards(ctx, nodeLoad, avgLoad)
}

func (r *ShardRebalancer) migrateShards(
    ctx context.Context,
    nodeLoad map[string]int64,
    avgLoad int64,
) {
    type migration struct {
        fromNode string
        toNode   string
        shardID  string
    }
    
    var migrations []migration
    
    // 找出高负载和低负载节点
    var overloaded, underloaded []string
    for node, load := range nodeLoad {
        if load > int64(float64(avgLoad)*1.3) {
            overloaded = append(overloaded, node)
        } else if load < int64(float64(avgLoad)*0.7) {
            underloaded = append(underloaded, node)
        }
    }
    
    // 计算迁移计划
    for _, fromNode := range overloaded {
        // 获取该节点的分片
        resp, _ := r.etcdClient.Get(ctx,
            fmt.Sprintf("/scheduler/assignments/%s/", fromNode),
            clientv3.WithPrefix())
        
        for _, kv := range resp.Kvs {
            if len(underloaded) == 0 {
                break
            }
            
            shardID := extractTaskID(string(kv.Key))
            toNode := underloaded[0]
            
            migrations = append(migrations, migration{
                fromNode: fromNode,
                toNode:   toNode,
                shardID:  shardID,
            })
            
            // 更新负载估算
            nodeLoad[fromNode]--
            nodeLoad[toNode]++
            
            // 如果目标节点已经达到平均负载，换下一个
            if nodeLoad[toNode] >= avgLoad {
                underloaded = underloaded[1:]
            }
        }
    }
    
    // 执行迁移
    var wg sync.WaitGroup
    for _, m := range migrations {
        wg.Add(1)
        go func(mig migration) {
            defer wg.Done()
            
            oldKey := fmt.Sprintf("/scheduler/assignments/%s/%s", mig.fromNode, mig.shardID)
            newKey := fmt.Sprintf("/scheduler/assignments/%s/%s", mig.toNode, mig.shardID)
            
            // 原子性迁移
            txn := r.etcdClient.Txn(ctx).
                If(clientv3.Compare(clientv3.CreateRevision(oldKey), ">", 0)).
                Then(
                    clientv3.OpDelete(oldKey),
                    clientv3.OpPut(newKey, "migrated"),
                )
            
            _, err := txn.Commit()
            if err != nil {
                fmt.Printf("migrate shard %s from %s to %s failed: %v\n",
                    mig.shardID, mig.fromNode, mig.toNode, err)
            } else {
                fmt.Printf("[REBALANCE] migrated shard %s: %s -> %s\n",
                    mig.shardID, mig.fromNode, mig.toNode)
            }
        }(m)
    }
    wg.Wait()
}
```

### 2.5 分片任务的Barrier机制

有些分片任务需要分阶段执行：所有分片完成阶段一后，才能开始阶段二。这就是Barrier机制：

```go
package scheduler

import (
    "context"
    "fmt"
    "sync"
    "time"
)

// BarrierManager 阶段屏障管理器
type BarrierManager struct {
    etcdClient *clientv3.Client
}

// WaitForAllShards 等待所有分片完成当前阶段
func (bm *BarrierManager) WaitForAllShards(
    ctx context.Context,
    taskID string,
    stage int,
    totalShards int,
    timeout time.Duration,
) error {
    barrierKey := fmt.Sprintf("/scheduler/barrier/%s/stage-%d", taskID, stage)
    
    // 当前分片到达barrier，注册完成信号
    // 实际使用时在分片执行完成后调用
    doneKey := fmt.Sprintf("%s/done", barrierKey)
    
    ctx, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()
    
    // 轮询检查是否所有分片都已完成
    ticker := time.NewTicker(2 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return fmt.Errorf("barrier wait timeout for task %s stage %d", taskID, stage)
        case <-ticker.C:\n            resp, err := bm.etcdClient.Get(ctx, doneKey, clientv3.WithPrefix())
            if err != nil {
                continue
            }
            
            if len(resp.Kvs) >= totalShards {
                fmt.Printf("[BARRIER] all %d shards reached stage %d\n", 
                    totalShards, stage)
                return nil
            }
            
            completed := len(resp.Kvs)
            fmt.Printf("[BARRIER] stage %d: %d/%d shards completed, waiting...\n",
                stage, completed, totalShards)
        }
    }
}

// SignalShardComplete 分片完成信号
func (bm *BarrierManager) SignalShardComplete(
    ctx context.Context,
    taskID string,
    stage int,
    shardIndex int,
) error {
    doneKey := fmt.Sprintf("/scheduler/barrier/%s/stage-%d/done/%d",
        taskID, stage, shardIndex)
    
    lease, err := bm.etcdClient.Grant(ctx, 3600)
    if err != nil {
        return err
    }
    
    _, err = bm.etcdClient.Put(ctx, doneKey, "1", clientv3.WithLease(lease.ID))
    return err
}

// PipelineShardedTask 流水线分片任务
type PipelineShardedTask struct {
    TaskID      string
    TotalShards int
    Stages      []PipelineStage
}

type PipelineStage struct {
    Name       string
    ExecuteFunc func(ctx context.Context, shardIndex, totalShards int) error
    Timeout    time.Duration
}

// ExecutePipeline 执行流水线分片任务
func (e *ShardedTaskExecutor) ExecutePipeline(
    ctx context.Context,
    task *PipelineShardedTask,
    barrier *BarrierManager,
) error {
    for stageIdx, stage := range task.Stages {
        fmt.Printf("[PIPELINE] task %s starting stage %d: %s\n",
            task.TaskID, stageIdx, stage.Name)
        
        // 获取当前节点负责的分片
        myShards := e.getAssignedShards(ctx, task.TaskID, task.TotalShards)
        
        var wg sync.WaitGroup
        errChan := make(chan error, len(myShards))
        
        for _, shardIndex := range myShards {
            wg.Add(1)
            go func(idx int) {
                defer wg.Done()
                
                stageCtx, cancel := context.WithTimeout(ctx, stage.Timeout)
                defer cancel()
                
                err := stage.ExecuteFunc(stageCtx, idx, task.TotalShards)
                if err != nil {
                    errChan <- err
                    return
                }
                
                // 通知barrier当前分片完成
                barrier.SignalShardComplete(ctx, task.TaskID, stageIdx, idx)
            }(shardIndex)
        }
        
        wg.Wait()
        close(errChan)
        
        for err := range errChan {
            if err != nil {
                return fmt.Errorf("stage %d failed: %w", stageIdx, err)
            }
        }
        
        // 等待所有分片完成当前阶段
        err := barrier.WaitForAllShards(ctx, task.TaskID, stageIdx, 
            task.TotalShards, stage.Timeout)
        if err != nil {
            return fmt.Errorf("barrier wait failed at stage %d: %w", stageIdx, err)
        }
        
        fmt.Printf("[PIPELINE] task %s stage %d completed\n", 
            task.TaskID, stageIdx)
    }
    
    return nil
}
```

> 流水线分片的精髓：不是让所有分片跑完全程，而是让每个阶段像工厂流水线一样流转，上一道工序全完才能进下一道。

## 三、动态扩缩容方案

### 3.1 为什么静态扩容不够用

有一次双十一前，业务方说要扩容调度节点。我加了5台机器，配好调度服务，上线。然后双十一过了，这5台机器就一直闲着吃灰。每月多花好几千块，老板问我能不能缩容。手动缩容那天又差点出事——摘掉的节点上还有正在执行的任务。

静态扩容的问题：

- 扩容慢：从感知到压力到机器就绪，至少十几分钟
- 容易出错：手动配置容易遗漏
- 资源浪费：高峰过后无法及时释放
- 风险高：摘节点可能丢失正在执行的任务

> 动态扩缩容不是"多加几台机器"，而是让调度系统具备感知负载、自动决策、安全伸缩的能力。

### 3.2 负载感知与扩缩容决策

```go
package scheduler

import (
    "context"
    "fmt"
    "math"
    "time"
)

// LoadCollector 负载收集器
type LoadCollector struct {
    etcdClient *clientv3.Client
    interval   time.Duration
}

// NodeMetrics 节点指标
type NodeMetrics struct {
    NodeID         string
    CPUUsage       float64
    MemoryUsage    float64
    TaskQueueLen   int
    ActiveTasks    int
    AvgExecuteTime float64 // 毫秒
    ErrorRate      float64
}

// CollectNodeMetrics 收集节点指标
func (lc *LoadCollector) CollectNodeMetrics(ctx context.Context) map[string]*NodeMetrics {
    resp, err := lc.etcdClient.Get(ctx, "/scheduler/metrics/", clientv3.WithPrefix())
    if err != nil {
        return nil
    }
    
    metrics := make(map[string]*NodeMetrics)
    for _, kv := range resp.Kvs {
        nodeID := extractNodeID(string(kv.Key))
        m := parseMetrics(string(kv.Value))
        m.NodeID = nodeID
        metrics[nodeID] = m
    }
    
    return metrics
}

// ScaleDecision 扩缩容决策
type ScaleDecision struct {
    Action      string // "scale-up", "scale-down", "no-action"
    Reason      string
    TargetCount int
    NodesToAdd  []string
    NodesToRemove []string
}

// AutoScaler 自动扩缩容器
type AutoScaler struct {
    loadCollector   *LoadCollector
    minNodes        int
    maxNodes        int
    scaleUpThreshold   float64
    scaleDownThreshold float64
    cooldownPeriod     time.Duration
    lastScaleTime      time.Time
}

// NewAutoScaler 创建自动扩缩容器
func NewAutoScaler(
    lc *LoadCollector,
    minNodes, maxNodes int,
    scaleUpThreshold, scaleDownThreshold float64,
    cooldown time.Duration,
) *AutoScaler {
    return &AutoScaler{
        loadCollector:      lc,
        minNodes:           minNodes,
        maxNodes:           maxNodes,
        scaleUpThreshold:   scaleUpThreshold,
        scaleDownThreshold: scaleDownThreshold,
        cooldownPeriod:     cooldown,
    }
}

// Evaluate 评估是否需要扩缩容
func (as *AutoScaler) Evaluate(ctx context.Context) *ScaleDecision {
    // 冷却期检查
    if time.Since(as.lastScaleTime) < as.cooldownPeriod {
        return &ScaleDecision{
            Action: "no-action",
            Reason: fmt.Sprintf("in cooldown period, last scale at %s", as.lastScaleTime),
        }
    }
    
    metrics := as.loadCollector.CollectNodeMetrics(ctx)
    if len(metrics) == 0 {
        return &ScaleDecision{
            Action: "no-action",
            Reason: "no metrics available",
        }
    }
    
    // 计算集群整体负载
    var totalCPU, totalMem, totalQueue float64
    var totalActiveTasks int
    for _, m := range metrics {
        totalCPU += m.CPUUsage
        totalMem += m.MemoryUsage
        totalQueue += float64(m.TaskQueueLen)
        totalActiveTasks += m.ActiveTasks
    }
    
    nodeCount := len(metrics)
    avgCPU := totalCPU / float64(nodeCount)
    avgMem := totalMem / float64(nodeCount)
    avgQueue := totalQueue / float64(nodeCount)
    
    // 扩容判断
    if avgCPU > as.scaleUpThreshold || avgMem > as.scaleUpThreshold || avgQueue > 100 {
        if nodeCount >= as.maxNodes {
            return &ScaleDecision{
                Action: "no-action",
                Reason: fmt.Sprintf("already at max nodes (%d), cannot scale up", nodeCount),
            }
        }
        
        // 计算需要扩容多少节点
        targetCount := nodeCount + int(math.Ceil(avgCPU/as.scaleUpThreshold))-1
        if targetCount > as.maxNodes {
            targetCount = as.maxNodes
        }
        
        return &ScaleDecision{
            Action:      "scale-up",
            Reason:      fmt.Sprintf("avgCPU=%.1f%%, avgMem=%.1f%%, avgQueue=%.0f", avgCPU, avgMem, avgQueue),
            TargetCount: targetCount,
        }
    }
    
    // 缩容判断
    if avgCPU < as.scaleDownThreshold && avgMem < as.scaleDownThreshold && avgQueue < 10 {
        if nodeCount <= as.minNodes {
            return &ScaleDecision{
                Action: "no-action",
                Reason: fmt.Sprintf("already at min nodes (%d), cannot scale down", nodeCount),
            }
        }
        
        // 选择负载最低的节点进行缩容
        targetCount := nodeCount - 1
        nodesToRemove := as.selectNodesToRemove(metrics, 1)
        
        return &ScaleDecision{
            Action:        "scale-down",
            Reason:        fmt.Sprintf("avgCPU=%.1f%%, avgMem=%.1f%%, avgQueue=%.0f", avgCPU, avgMem, avgQueue),
            TargetCount:   targetCount,
            NodesToRemove: nodesToRemove,
        }
    }
    
    return &ScaleDecision{
        Action: "no-action",
        Reason: fmt.Sprintf("load is normal: avgCPU=%.1f%%, avgMem=%.1f%%", avgCPU, avgMem),
    }
}

// selectNodesToRemove 选择要移除的节点（负载最低的）
func (as *AutoScaler) selectNodesToRemove(metrics map[string]*NodeMetrics, count int) []string {
    type nodeScore struct {
        nodeID string
        score  float64
    }
    
    var scores []nodeScore
    for nodeID, m := range metrics {
        // 综合评分：CPU + 内存 + 任务数
        score := m.CPUUsage*0.4 + m.MemoryUsage*0.3 + float64(m.ActiveTasks)*0.3
        scores = append(scores, nodeScore{nodeID: nodeID, score: score})
    }
    
    // 按评分排序，选择最低的
    for i := 0; i < len(scores)-1; i++ {
        for j := i + 1; j < len(scores); j++ {
            if scores[j].score < scores[i].score {
                scores[i], scores[j] = scores[j], scores[i]
            }
        }
    }
    
    result := []string{}
    for i := 0; i < count && i < len(scores); i++ {
        result = append(result, scores[i].nodeID)
    }
    
    return result
}
```

### 3.3 安全缩容流程

缩容最大的风险是摘掉正在执行任务的节点。完整的安全缩容流程：

```go
package scheduler

import (
    "context"
    "fmt"
    "time"
)

// SafeScaleDown 安全缩容
type SafeScaleDown struct {
    etcdClient     *clientv3.Client
    drainTimeout   time.Duration
    healthChecker  *HealthChecker
}

// DrainNode 排空节点
func (sd *SafeScaleDown) DrainNode(ctx context.Context, nodeID string) error {
    fmt.Printf("[SCALE-DOWN] start draining node %s\n", nodeID)
    
    // 步骤1：标记节点为draining状态，不再分配新任务
    nodeKey := fmt.Sprintf("/scheduler/nodes/%s", nodeID)
    _, err := sd.etcdClient.Put(ctx, nodeKey,
        fmt.Sprintf(`{"node_id":"%s","status":"draining","drain_start":"%s"}`,
            nodeID, time.Now().Format(time.RFC3339)))
    if err != nil {
        return fmt.Errorf("mark node draining failed: %w", err)
    }
    
    // 步骤2：等待正在执行的任务完成
    drainCtx, cancel := context.WithTimeout(ctx, sd.drainTimeout)
    defer cancel()
    
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-drainCtx.Done():
            // 超时，强制迁移剩余任务
            fmt.Printf("[SCALE-DOWN] drain timeout for node %s, force migrating tasks\n", nodeID)
            sd.forceMigrateTasks(ctx, nodeID)
            goto done
        case <-ticker.C:\n            // 检查节点上是否还有活跃任务\n            activeCount := sd.getActiveTaskCount(ctx, nodeID)
            if activeCount == 0 {
                fmt.Printf("[SCALE-DOWN] node %s drained, no active tasks\n", nodeID)
                goto done
            }
            fmt.Printf("[SCALE-DOWN] node %s still has %d active tasks, waiting...\n",
                nodeID, activeCount)
        }
    }
    
done:
    // 步骤3：迁移分片到其他节点
    sd.migrateShards(ctx, nodeID)
    
    // 步骤4：从节点注册中删除
    sd.etcdClient.Delete(ctx, nodeKey)
    
    // 步骤5：清理相关数据
    sd.etcdClient.Delete(ctx,
        fmt.Sprintf("/scheduler/assignments/%s/", nodeID),
        clientv3.WithPrefix())
    sd.etcdClient.Delete(ctx,
        fmt.Sprintf("/scheduler/metrics/%s", nodeID))
    
    fmt.Printf("[SCALE-DOWN] node %s safely removed\n", nodeID)
    return nil
}

func (sd *SafeScaleDown) getActiveTaskCount(ctx context.Context, nodeID string) int {
    resp, err := sd.etcdClient.Get(ctx,
        fmt.Sprintf("/scheduler/active/%s/", nodeID),
        clientv3.WithPrefix(), clientv3.WithCountOnly())
    if err != nil {
        return -1
    }
    return int(resp.Count)
}

func (sd *SafeScaleDown) forceMigrateTasks(ctx context.Context, nodeID string) {
    resp, err := sd.etcdClient.Get(ctx,
        fmt.Sprintf("/scheduler/active/%s/", nodeID),
        clientv3.WithPrefix())
    if err != nil {
        return
    }
    
    for _, kv := range resp.Kvs {
        taskID := extractTaskID(string(kv.Key))
        // 标记任务需要重新执行
        retryKey := fmt.Sprintf("/scheduler/retry/%s", taskID)
        sd.etcdClient.Put(ctx, retryKey, "force-migrated")
        sd.etcdClient.Delete(ctx, string(kv.Key))
    }
}

func (sd *SafeScaleDown) migrateShards(ctx context.Context, nodeID string) {
    resp, err := sd.etcdClient.Get(ctx,
        fmt.Sprintf("/scheduler/assignments/%s/", nodeID),
        clientv3.WithPrefix())
    if err != nil {
        return
    }
    
    // 获取健康节点列表
    healthyResp, err := sd.etcdClient.Get(ctx, "/scheduler/nodes/", clientv3.WithPrefix())
    if err != nil {
        return
    }
    
    var healthyNodes []string
    for _, kv := range healthyResp.Kvs {
        if !isDraining(string(kv.Value)) && extractNodeID(string(kv.Key)) != nodeID {
            healthyNodes = append(healthyNodes, extractNodeID(string(kv.Key)))
        }
    }
    
    if len(healthyNodes) == 0 {
        fmt.Printf("[SCALE-DOWN] no healthy nodes to migrate shards to\n")
        return
    }
    
    for _, kv := range resp.Kvs {
        taskID := extractTaskID(string(kv.Key))
        // 轮询分配到健康节点
        targetNode := healthyNodes[len(taskID)%len(healthyNodes)]
        
        newKey := fmt.Sprintf("/scheduler/assignments/%s/%s", targetNode, taskID)
        sd.etcdClient.Put(ctx, newKey, "migrated")
        sd.etcdClient.Delete(ctx, string(kv.Key))
        
        fmt.Printf("[SCALE-DOWN] migrated shard %s: %s -> %s\n",
            taskID, nodeID, targetNode)
    }
}
```

> 缩容的核心原则：先停新任务、等完老任务、迁移分片、最后摘节点。任何跳步都是生产事故的导火索。

### 3.4 扩缩容完整决策流水线

```go
package scheduler

import (
    "context"
    "fmt"
    "time"
)

// ScalePipeline 扩缩容决策流水线
type ScalePipeline struct {
    autoScaler  *AutoScaler
    safeScaleDown *SafeScaleDown
    nodeProvisioner *NodeProvisioner
    interval    time.Duration
}

// NodeProvisioner 节点供给器（对接云平台或K8s）
type NodeProvisioner struct {
    // 对接AWS/K8s/阿里云等
}

func (np *NodeProvisioner) ProvisionNode(ctx context.Context) (string, error) {
    // 实际实现对接云平台API创建实例
    // 这里用模拟逻辑
    nodeID := fmt.Sprintf("node-%d", time.Now().UnixNano()%100000)
    fmt.Printf("[PROVISION] new node %s provisioned\n", nodeID)
    
    // 等待节点就绪
    time.Sleep(30 * time.Second) // 模拟启动时间
    
    return nodeID, nil
}

func (np *NodeProvisioner) DeprovisionNode(ctx context.Context, nodeID string) error {
    fmt.Printf("[PROVISION] deprovisioning node %s\n", nodeID)
    // 实际实现调用云平台API释放实例
    return nil
}

// Run 运行扩缩容流水线
func (sp *ScalePipeline) Run(ctx context.Context) {
    ticker := time.NewTicker(sp.interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:\n            sp.evaluateAndScale(ctx)\n        }\n    }\n}\n\nfunc (sp *ScalePipeline) evaluateAndScale(ctx context.Context) {
    decision := sp.autoScaler.Evaluate(ctx)
    
    switch decision.Action {
    case "scale-up":
        fmt.Printf("[SCALE] scale-up triggered: %s\n", decision.Reason)
        
        currentCount := sp.getCurrentNodeCount(ctx)
        toAdd := decision.TargetCount - currentCount
        
        for i := 0; i < toAdd; i++ {
            nodeID, err := sp.nodeProvisioner.ProvisionNode(ctx)
            if err != nil {
                fmt.Printf("[SCALE] provision node failed: %v\n", err)
                break
            }
            
            // 注册新节点到调度集群
            sp.registerNode(ctx, nodeID)
        }
        
        sp.autoScaler.lastScaleTime = time.Now()
        fmt.Printf("[SCALE] scale-up completed, added %d nodes\n", toAdd)
        
    case "scale-down":
        fmt.Printf("[SCALE] scale-down triggered: %s\n", decision.Reason)
        
        for _, nodeID := range decision.NodesToRemove {
            // 安全排空节点
            err := sp.safeScaleDown.DrainNode(ctx, nodeID)
            if err != nil {
                fmt.Printf("[SCALE] drain node %s failed: %v\n", nodeID, err)
                continue
            }
            
            // 释放机器资源
            err = sp.nodeProvisioner.DeprovisionNode(ctx, nodeID)
            if err != nil {
                fmt.Printf("[SCALE] deprovision node %s failed: %v\n", nodeID, err)
            }
        }
        
        sp.autoScaler.lastScaleTime = time.Now()
        fmt.Printf("[SCALE] scale-down completed, removed %d nodes\n",
            len(decision.NodesToRemove))
        
    case "no-action":
        // 正常情况，不打日志避免刷屏
    }
}

func (sp *ScalePipeline) getCurrentNodeCount(ctx context.Context) int {
    resp, err := sp.autoScaler.loadCollector.etcdClient.Get(ctx,
        "/scheduler/nodes/", clientv3.WithPrefix())
    if err != nil {
        return 0
    }
    return len(resp.Kvs)
}

func (sp *ScalePipeline) registerNode(ctx context.Context, nodeID string) {
    fm := &FailoverManager{
        etcdClient: sp.autoScaler.loadCollector.etcdClient,
        nodeID:     nodeID,
        heartbeatInterval: 5 * time.Second,
        heartbeatTTL:      15,
    }
    fm.RegisterNode(ctx)
    fmt.Printf("[SCALE] node %s registered to cluster\n", nodeID)
}
```

## 四、调度系统性能优化

### 4.1 调度引擎性能瓶颈分析

我在优化一个调度系统时，遇到过这样的性能曲线：任务数从1万涨到10万，调度延迟从100ms涨到5秒。表面看是任务太多，实际profile之后发现：

- 60%的时间花在数据库查询任务定义
- 25%的时间花在分布式锁竞争
- 10%的时间花在序列化/反序列化
- 5%的时间花在网络通信

> 性能优化的第一定律：不要猜，profile。你以为的瓶颈和真正的瓶颈往往差了十万八千里。

### 4.2 任务存储层优化

```go
package scheduler

import (
    "context"
    "encoding/json"
    "fmt"
    "sync"
    "time"
)

// TaskStorage 任务存储接口
type TaskStorage interface {
    GetTask(ctx context.Context, taskID string) (*TaskDefinition, error)
    ListTasks(ctx context.Context, filter *TaskFilter) ([]*TaskDefinition, error)
    SaveTask(ctx context.Context, task *TaskDefinition) error
    DeleteTask(ctx context.Context, taskID string) error
}

// TaskDefinition 任务定义
type TaskDefinition struct {
    TaskID      string            `json:"task_id"`
    Name        string            `json:"name"`
    Cron        string            `json:"cron"`
    Command     string            `json:"command"`
    Params      map[string]string `json:"params"`
    Timeout     time.Duration     `json:"timeout"`
    RetryCount  int               `json:"retry_count"`
    ShardingNum int               `json:"sharding_num"`
    Status      string            `json:"status"`
}

// CachedTaskStorage 带缓存的任务存储
type CachedTaskStorage struct {
    primary    TaskStorage        // 数据库
    cache      map[string]*TaskDefinition
    cacheMu    sync.RWMutex
    cacheTTL   time.Duration
    lastRefresh time.Time
    refreshMu   sync.Mutex
    
    // 本地文件缓存（冷启动加速）
    snapshotPath string
}

func NewCachedTaskStorage(primary TaskStorage, cacheTTL time.Duration, snapshotPath string) *CachedTaskStorage {
    cts := &CachedTaskStorage{
        primary:      primary,
        cache:        make(map[string]*TaskDefinition),
        cacheTTL:     cacheTTL,
        snapshotPath: snapshotPath,
    }
    
    // 从本地快照恢复缓存（冷启动优化）
    cts.restoreFromSnapshot()
    
    return cts
}

func (cts *CachedTaskStorage) GetTask(ctx context.Context, taskID string) (*TaskDefinition, error) {
    // 先查内存缓存
    cts.cacheMu.RLock()
    task, ok := cts.cache[taskID]
    cts.cacheMu.RUnlock()
    
    if ok {
        return task, nil
    }
    
    // 缓存未命中，查数据库
    task, err := cts.primary.GetTask(ctx, taskID)
    if err != nil {
        return nil, err
    }
    
    // 写入缓存
    cts.cacheMu.Lock()
    cts.cache[taskID] = task
    cts.cacheMu.Unlock()
    
    return task, nil
}

func (cts *CachedTaskStorage) ListTasks(ctx context.Context, filter *TaskFilter) ([]*TaskDefinition, error) {
    // 检查缓存是否过期
    cts.cacheMu.RLock()
    expired := time.Since(cts.lastRefresh) > cts.cacheTTL
    cacheSize := len(cts.cache)
    cts.cacheMu.RUnlock()
    
    if !expired && cacheSize > 0 {
        // 从缓存返回
        return cts.filterFromCache(filter), nil
    }
    
    // 刷新缓存
    cts.refreshMu.Lock()
    defer cts.refreshMu.Unlock()
    
    // 双重检查
    cts.cacheMu.RLock()
    expired = time.Since(cts.lastRefresh) > cts.cacheTTL
    cts.cacheMu.RUnlock()
    
    if expired {
        tasks, err := cts.primary.ListTasks(ctx, &TaskFilter{})
        if err != nil {
            return nil, err
        }
        
        cts.cacheMu.Lock()
        cts.cache = make(map[string]*TaskDefinition)
        for _, t := range tasks {
            cts.cache[t.TaskID] = t
        }
        cts.lastRefresh = time.Now()
        cts.cacheMu.Unlock()
        
        // 异步写快照
        go cts.saveSnapshot(tasks)
    }
    
    return cts.filterFromCache(filter), nil
}

func (cts *CachedTaskStorage) SaveTask(ctx context.Context, task *TaskDefinition) error {
    // 先写数据库
    if err := cts.primary.SaveTask(ctx, task); err != nil {
        return err
    }
    
    // 更新缓存
    cts.cacheMu.Lock()
    cts.cache[task.TaskID] = task
    cts.cacheMu.Unlock()
    
    return nil
}

func (cts *CachedTaskStorage) DeleteTask(ctx context.Context, taskID string) error {
    if err := cts.primary.DeleteTask(ctx, taskID); err != nil {
        return err
    }
    
    cts.cacheMu.Lock()
    delete(cts.cache, taskID)
    cts.cacheMu.Unlock()
    
    return nil
}

func (cts *CachedTaskStorage) filterFromCache(filter *TaskFilter) []*TaskDefinition {
    cts.cacheMu.RLock()
    defer cts.cacheMu.RUnlock()
    
    var result []*TaskDefinition
    for _, task := range cts.cache {
        if filter == nil || filter.Match(task) {
            result = append(result, task)
        }
    }
    return result
}

// saveSnapshot 保存缓存快照到本地文件
func (cts *CachedTaskStorage) saveSnapshot(tasks []*TaskDefinition) {
    data, err := json.Marshal(tasks)
    if err != nil {
        return
    }
    // 写入文件（实际实现需要原子写入）
    writeAtomic(cts.snapshotPath, data)
}

// restoreFromSnapshot 从本地快照恢复
func (cts *CachedTaskStorage) restoreFromSnapshot() {
    data, err := readFile(cts.snapshotPath)
    if err != nil {
        return
    }
    
    var tasks []*TaskDefinition
    if err := json.Unmarshal(data, &tasks); err != nil {
        return
    }
    
    cts.cacheMu.Lock()
    for _, t := range tasks {
        cts.cache[t.TaskID] = t
    }
    cts.lastRefresh = time.Now()
    cts.cacheMu.Unlock()
    
    fmt.Printf("[STORAGE] restored %d tasks from snapshot\n", len(tasks))
}

func writeAtomic(path string, data []byte) error {
    // 原子写入实现：先写临时文件，再rename
    tmpPath := path + ".tmp"
    if err := writeFile(tmpPath, data); err != nil {
        return err
    }
    return renameFile(tmpPath, path)
}
```

> 缓存是把双刃剑。用好了，性能提升十倍；用不好，数据不一致引发各种灵异问题。一致性保障比缓存本身更重要。

### 4.3 调度轮次优化

传统的调度器每秒扫一次数据库，找出到期的任务。当任务量大时，这个查询本身就成了瓶颈。优化方案：时间轮 + 延迟队列。

```go
package scheduler

import (
    "container/heap"
    "context"
    "fmt"
    "sync"
    "time"
)

// TimeWheel 时间轮
type TimeWheel struct {
    slots     [][]*TaskInstance
    current   int
    tickSize  time.Duration
    wheelSize int
    mu        sync.Mutex
    ctx       context.Context
    execute   func(*TaskInstance)
    
    // 溢出轮（处理超过一轮周期的任务）
    overflow  *DelayedQueue
}

// TaskInstance 任务实例
type TaskInstance struct {
    TaskID    string
    TaskName  string
    FireTime  time.Time
    Round     int // 在时间轮中还要转多少圈
    Execute   func()
}

// NewTimeWheel 创建时间轮
func NewTimeWheel(tickSize time.Duration, wheelSize int, 
    ctx context.Context, execute func(*TaskInstance)) *TimeWheel {
    tw := &TimeWheel{
        slots:     make([][]*TaskInstance, wheelSize),
        tickSize:  tickSize,
        wheelSize: wheelSize,
        ctx:       ctx,
        execute:   execute,
        overflow:  NewDelayedQueue(),
    }
    
    for i := range tw.slots {
        tw.slots[i] = make([]*TaskInstance, 0)
    }
    
    go tw.run()
    return tw
}

// AddTask 添加任务
func (tw *TimeWheel) AddTask(task *TaskInstance) {
    tw.mu.Lock()
    defer tw.mu.Unlock()
    
    delay := time.Until(task.FireTime)
    ticks := int(delay / tw.tickSize)
    
    if ticks >= tw.wheelSize {
        // 超过一轮，放入溢出队列
        task.Round = ticks / tw.wheelSize
        tw.overflow.Push(task)
        return
    }
    
    if ticks <= 0 {
        // 立即执行
        go tw.execute(task)
        return
    }
    
    slot := (tw.current + ticks) % tw.wheelSize
    task.Round = 0
    tw.slots[slot] = append(tw.slots[slot], task)
}

func (tw *TimeWheel) run() {
    ticker := time.NewTicker(tw.tickSize)
    defer ticker.Stop()
    
    for {
        select {
        case <-tw.ctx.Done():
            return
        case <-ticker.C:\n            tw.tick()\n        }\n    }\n}\n\nfunc (tw *TimeWheel) tick() {
    tw.mu.Lock()
    defer tw.mu.Unlock()
    
    tw.current = (tw.current + 1) % tw.wheelSize
    slot := tw.slots[tw.current]
    
    var remaining []*TaskInstance
    for _, task := range slot {
        if task.Round == 0 {
            // 到时间了，执行
            go tw.execute(task)
        } else {
            task.Round--
            remaining = append(remaining, task)
        }
    }
    tw.slots[tw.current] = remaining
    
    // 检查溢出队列
    for {
        task := tw.overflow.Peek()
        if task == nil || time.Until(task.FireTime) > time.Duration(tw.wheelSize)*tw.tickSize {
            break
        }
        tw.overflow.Pop()
        // 重新加入时间轮
        ticks := int(time.Until(task.FireTime) / tw.tickSize)
        slot := (tw.current + ticks) % tw.wheelSize
        task.Round = 0
        tw.slots[slot] = append(tw.slots[slot], task)
    }
}

// DelayedQueue 延迟队列（基于最小堆）
type DelayedQueue struct {
    items []*TaskInstance
    mu    sync.Mutex
}

func NewDelayedQueue() *DelayedQueue {
    return &DelayedQueue{items: make([]*TaskInstance, 0)}
}

func (dq *DelayedQueue) Push(task *TaskInstance) {
    dq.mu.Lock()
    defer dq.mu.Unlock()
    heap.Push(dq, task)
}

func (dq *DelayedQueue) Pop() *TaskInstance {
    dq.mu.Lock()
    defer dq.mu.Unlock()
    if dq.Len() == 0 {
        return nil
    }
    return heap.Pop(dq).(*TaskInstance)
}

func (dq *DelayedQueue) Peek() *TaskInstance {
    dq.mu.Lock()
    defer dq.mu.Unlock()
    if dq.Len() == 0 {
        return nil
    }
    return dq.items[0]
}

func (dq *DelayedQueue) Len() int { return len(dq.items) }

func (dq *DelayedQueue) Less(i, j int) bool {
    return dq.items[i].FireTime.Before(dq.items[j].FireTime)
}

func (dq *DelayedQueue) Swap(i, j int) {
    dq.items[i], dq.items[j] = dq.items[j], dq.items[i]
}

func (dq *DelayedQueue) Push(x interface{}) {
    dq.items = append(dq.items, x.(*TaskInstance))
}

func (dq *DelayedQueue) Pop() interface{} {
    old := dq.items
    n := len(old)
    item := old[n-1]
    dq.items = old[0 : n-1]
    return item
}
```

### 4.4 任务执行优化

```go
package scheduler

import (
    "context"
    "fmt"
    "runtime"
    "sync"
    "time"
)

// WorkerPool 工作线程池
type WorkerPool struct {
    taskQueue    chan *TaskInstance
    workerCount  int
    wg           sync.WaitGroup
    ctx          context.Context
    cancel       context.CancelFunc
    
    // 指标
    totalExecuted int64
    totalFailed   int64
    queueDepth    int
    mu            sync.Mutex
}

// NewWorkerPool 创建工作线程池
func NewWorkerPool(workerCount int, queueSize int) *WorkerPool {
    ctx, cancel := context.WithCancel(context.Background())
    
    // 根据CPU核心数自动调整worker数量
    if workerCount <= 0 {
        workerCount = runtime.NumCPU() * 2
    }
    
    return &WorkerPool{
        taskQueue:   make(chan *TaskInstance, queueSize),
        workerCount: workerCount,
        ctx:         ctx,
        cancel:      cancel,
    }
}

// Start 启动worker池
func (wp *WorkerPool) Start() {
    for i := 0; i < wp.workerCount; i++ {
        wp.wg.Add(1)
        go wp.worker(i)
    }
    fmt.Printf("[WORKER-POOL] started %d workers\n", wp.workerCount)
}

func (wp *WorkerPool) worker(id int) {
    defer wp.wg.Done()
    
    for {
        select {
        case <-wp.ctx.Done():
            return
        case task := <-wp.taskQueue:
            wp.processTask(id, task)
        }
    }
}

func (wp *WorkerPool) processTask(workerID int, task *TaskInstance) {
    start := time.Now()
    
    defer func() {
        if r := recover(); r != nil {
            fmt.Printf("[WORKER-%d] task %s panicked: %v\n", workerID, task.TaskID, r)
            wp.mu.Lock()
            wp.totalFailed++
            wp.mu.Unlock()
        }
        
        duration := time.Since(start)
        if duration > 5*time.Second {
            fmt.Printf("[WORKER-%d] task %s took %v (slow)\n", 
                workerID, task.TaskID, duration)
        }
        
        wp.mu.Lock()
        wp.totalExecuted++
        wp.mu.Unlock()
    }()
    
    // 执行任务
    if task.Execute != nil {
        task.Execute()
    }
}

// Submit 提交任务
func (wp *WorkerPool) Submit(task *TaskInstance) error {
    select {
    case wp.taskQueue <- task:
        wp.mu.Lock()
        wp.queueDepth = len(wp.taskQueue)
        wp.mu.Unlock()
        return nil
    default:
        return fmt.Errorf("task queue is full, current depth: %d", len(wp.taskQueue))
    }
}

// SubmitBlocking 阻塞式提交
func (wp *WorkerPool) SubmitBlocking(ctx context.Context, task *TaskInstance) error {
    select {
    case wp.taskQueue <- task:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

// Stop 停止worker池
func (wp *WorkerPool) Stop() {
    wp.cancel()
    wp.wg.Wait()
    fmt.Printf("[WORKER-POOL] stopped, total executed: %d, failed: %d\n",
        wp.totalExecuted, wp.totalFailed)
}

// GetMetrics 获取指标
func (wp *WorkerPool) GetMetrics() map[string]interface{} {
    wp.mu.Lock()
    defer wp.mu.Unlock()
    
    return map[string]interface{}{
        "worker_count":    wp.workerCount,
        "queue_depth":     wp.queueDepth,
        "total_executed":  wp.totalExecuted,
        "total_failed":    wp.totalFailed,
        "success_rate":    wp.calculateSuccessRate(),
    }
}

func (wp *WorkerPool) calculateSuccessRate() float64 {
    if wp.totalExecuted == 0 {
        return 100.0
    }
    return float64(wp.totalExecuted-wp.totalFailed) / float64(wp.totalExecuted) * 100
}
```

### 4.5 性能优化清单

以下是我整理的调度系统性能优化清单，按优先级排序：

```
调度系统性能优化清单（按优先级执行）

[第一优先级：存储层]
1. 任务定义全量缓存到内存，避免每次调度都查数据库
2. 使用本地快照加速冷启动
3. 任务执行日志异步写入，不阻塞调度主流程
4. 数据库索引优化：cron表达式、下次执行时间、任务状态

[第二优先级：调度引擎]
5. 用时间轮替代轮询扫描，将调度复杂度从O(n)降到O(1)
6. 调度主线程不做任何IO操作，纯内存计算
7. 批量获取到期任务，减少锁竞争次数
8. 任务优先级队列，高优先级任务优先调度

[第三优先级：执行层]
9. Worker池复用goroutine，避免频繁创建销毁
10. 任务执行超时控制，防止僵尸任务占用worker
11. 任务结果异步回调，不阻塞worker线程
12. 合理设置worker数量：CPU密集型=CPU核数，IO密集型=CPU核数*2~4

[第四优先级：网络层]
13. 执行器与调度器之间使用长连接
14. 任务结果压缩传输
15. 批量心跳替代单任务心跳
16. gRPC替代HTTP，减少序列化开销
```

> 优化的本质是消除浪费。先profile找到最大的浪费点，集中精力消灭它，然后再找下一个。不要同时优化所有层。

## 五、监控与运维

### 5.1 监控体系设计

调度系统的监控要覆盖三个维度：调度层、执行层、业务层。我见过太多团队只监控"调度节点是否存活"，结果任务一直在报错却没人知道。

```go
package scheduler

import (
    "context"
    "fmt"
    "sync"
    "time"
)

// MetricsCollector 指标收集器
type MetricsCollector struct {
    mu sync.RWMutex
    
    // 调度层指标
    ScheduleLatency    *HistogramMetric
    ScheduleSuccess    *CounterMetric
    ScheduleFail       *CounterMetric
    ActiveNodes        *GaugeMetric
    LeaderChanges      *CounterMetric
    
    // 执行层指标
    ExecuteLatency     *HistogramMetric
    ExecuteSuccess     *CounterMetric
    ExecuteFail        *CounterMetric
    ExecuteTimeout     *CounterMetric
    QueueDepth         *GaugeMetric
    WorkerUtilization  *GaugeMetric
    
    // 业务层指标
    TaskBacklog        *GaugeMetric
    TaskRetryCount     *CounterMetric
    ShardImbalance     *GaugeMetric
    FailoverCount      *CounterMetric
    
    // 告警规则
    alertRules []*AlertRule
    
    exporter MetricExporter
}

// HistogramMetric 直方图指标
type HistogramMetric struct {
    name   string
    buckets []float64
    counts  []int64
    sum     float64
    count   int64
    mu      sync.Mutex
}

func NewHistogramMetric(name string, buckets []float64) *HistogramMetric {
    return &HistogramMetric{
        name:    name,
        buckets: buckets,
        counts:  make([]int64, len(buckets)+1),
    }
}

func (h *HistogramMetric) Observe(value float64) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    h.sum += value
    h.count++
    
    for i, bound := range h.buckets {
        if value <= bound {
            h.counts[i]++
            return
        }
    }
    h.counts[len(h.counts)-1]++
}

func (h *HistogramMetric) GetPercentile(p float64) float64 {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if h.count == 0 {
        return 0
    }
    
    target := int64(float64(h.count) * p)
    var cumul int64
    for i, count := range h.counts {
        cumul += count
        if cumul >= target {
            if i < len(h.buckets) {
                return h.buckets[i]
            }
            return h.buckets[len(h.buckets)-1]
        }
    }
    return h.buckets[len(h.buckets)-1]
}

// CounterMetric 计数器指标
type CounterMetric struct {
    name  string
    value int64
    mu    sync.Mutex
}

func (c *CounterMetric) Inc() {
    c.mu.Lock()
    c.value++
    c.mu.Unlock()
}

func (c *CounterMetric) Add(delta int64) {
    c.mu.Lock()
    c.value += delta
    c.mu.Unlock()
}

func (c *CounterMetric) Get() int64 {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.value
}

// GaugeMetric 瞬时值指标
type GaugeMetric struct {
    name  string
    value float64
    mu    sync.Mutex
}

func (g *GaugeMetric) Set(value float64) {
    g.mu.Lock()
    g.value = value
    g.mu.Unlock()
}

func (g *GaugeMetric) Get() float64 {
    g.mu.Lock()
    defer g.mu.Unlock()
    return g.value
}

// AlertRule 告警规则
type AlertRule struct {
    Name       string
    Metric     string
    Operator   string // ">", "<", "=="
    Threshold  float64
    Duration   time.Duration
    Severity   string // "critical", "warning", "info"
    Message    string
    lastTriggered time.Time
}

// CheckAlerts 检查告警
func (mc *MetricsCollector) CheckAlerts() []*AlertRule {
    mc.mu.RLock()
    defer mc.mu.RUnlock()
    
    var triggered []*AlertRule
    for _, rule := range mc.alertRules {
        value := mc.getMetricValue(rule.Metric)
        if mc.evaluateRule(rule, value) {
            if time.Since(rule.lastTriggered) > rule.Duration {
                triggered = append(triggered, rule)
                rule.lastTriggered = time.Now()
                
                fmt.Printf("[ALERT] %s: %s (metric=%s, value=%.2f, threshold=%.2f)\n",
                    rule.Severity, rule.Message, rule.Metric, value, rule.Threshold)
            }
        }
    }
    return triggered
}

func (mc *MetricsCollector) getMetricValue(metricName string) float64 {
    switch metricName {
    case "schedule_latency_p99":
        return mc.ScheduleLatency.GetPercentile(0.99)
    case "schedule_fail":
        return float64(mc.ScheduleFail.Get())
    case "execute_fail":
        return float64(mc.ExecuteFail.Get())
    case "queue_depth":
        return mc.QueueDepth.Get()
    case "task_backlog":
        return mc.TaskBacklog.Get()
    case "worker_utilization":
        return mc.WorkerUtilization.Get()
    case "shard_imbalance":
        return mc.ShardImbalance.Get()
    default:
        return 0
    }
}

func (mc *MetricsCollector) evaluateRule(rule *AlertRule, value float64) bool {
    switch rule.Operator {
    case ">":
        return value > rule.Threshold
    case "<":
        return value < rule.Threshold
    case "==":
        return value == rule.Threshold
    default:
        return false
    }
}
```

### 5.2 告警规则配置模板

```go
package scheduler

import "time"

// DefaultAlertRules 默认告警规则
func DefaultAlertRules() []*AlertRule {
    return []*AlertRule{
        {
            Name:      "调度延迟过高",
            Metric:    "schedule_latency_p99",
            Operator:  ">",
            Threshold: 1000, // 1秒
            Duration:  2 * time.Minute,
            Severity:  "warning",
            Message:   "调度P99延迟超过1秒，可能存在性能瓶颈",
        },
        {
            Name:      "调度失败率激增",
            Metric:    "schedule_fail",
            Operator:  ">",
            Threshold: 10, // 2分钟内超过10次失败
            Duration:  2 * time.Minute,
            Severity:  "critical",
            Message:   "调度失败次数异常，可能节点故障或存储问题",
        },
        {
            Name:      "任务队列堆积",
            Metric:    "queue_depth",
            Operator:  ">",
            Threshold: 500,
            Duration:  3 * time.Minute,
            Severity:  "warning",
            Message:   "任务队列深度超过500，worker可能不足",
        },
        {
            Name:      "任务积压",
            Metric:    "task_backlog",
            Operator:  ">",
            Threshold: 1000,
            Duration:  5 * time.Minute,
            Severity:  "critical",
            Message:   "任务积压超过1000，调度系统可能无法跟上负载",
        },
        {
            Name:      "Worker利用率过高",
            Metric:    "worker_utilization",
            Operator:  ">",
            Threshold: 90, // 90%
            Duration:  5 * time.Minute,
            Severity:  "warning",
            Message:   "Worker利用率持续超过90%，需要扩容",
        },
        {
            Name:      "分片不均衡",
            Metric:    "shard_imbalance",
            Operator:  ">",
            Threshold: 0.5, // 50%
            Duration:  10 * time.Minute,
            Severity:  "info",
            Message:   "分片负载不均衡度超过50%，建议检查分片策略",
        },
        {
            Name:      "故障转移触发",
            Metric:    "failover_count",
            Operator:  ">",
            Threshold: 0,
            Duration:  1 * time.Minute,
            Severity:  "critical",
            Message:   "触发了故障转移，有节点可能宕机",
        },
    }
}
```

### 5.3 运维仪表盘

```go
package scheduler

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

// DashboardServer 运维仪表盘HTTP服务
type DashboardServer struct {
    collector *MetricsCollector
    storage   TaskStorage
    server    *http.Server
}

// NewDashboardServer 创建仪表盘服务
func NewDashboardServer(collector *MetricsCollector, storage TaskStorage, addr string) *DashboardServer {
    ds := &DashboardServer{
        collector: collector,
        storage:   storage,
    }
    
    mux := http.NewServeMux()
    mux.HandleFunc("/dashboard", ds.handleDashboard)
    mux.HandleFunc("/metrics", ds.handleMetrics)
    mux.HandleFunc("/tasks", ds.handleTasks)
    mux.HandleFunc("/alerts", ds.handleAlerts)
    mux.HandleFunc("/health", ds.handleHealth)
    
    ds.server = &http.Server{
        Addr:    addr,
        Handler: mux,
    }
    
    return ds
}

func (ds *DashboardServer) Start() error {
    fmt.Printf("[DASHBOARD] server starting on %s\n", ds.server.Addr)
    return ds.server.ListenAndServe()
}

func (ds *DashboardServer) handleDashboard(w http.ResponseWriter, r *http.Request) {
    // 返回HTML仪表盘页面
    w.Header().Set("Content-Type", "text/html; charset=utf-8")
    
    html := ds.generateDashboardHTML()
    w.Write([]byte(html))
}

func (ds *DashboardServer) handleMetrics(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    metrics := map[string]interface{}{
        "schedule_latency_p50": ds.collector.ScheduleLatency.GetPercentile(0.50),
        "schedule_latency_p95": ds.collector.ScheduleLatency.GetPercentile(0.95),
        "schedule_latency_p99": ds.collector.ScheduleLatency.GetPercentile(0.99),
        "schedule_success":     ds.collector.ScheduleSuccess.Get(),
        "schedule_fail":        ds.collector.ScheduleFail.Get(),
        "active_nodes":         ds.collector.ActiveNodes.Get(),
        "leader_changes":       ds.collector.LeaderChanges.Get(),
        "execute_latency_p50":  ds.collector.ExecuteLatency.GetPercentile(0.50),
        "execute_latency_p95":  ds.collector.ExecuteLatency.GetPercentile(0.95),
        "execute_latency_p99":  ds.collector.ExecuteLatency.GetPercentile(0.99),
        "execute_success":      ds.collector.ExecuteSuccess.Get(),
        "execute_fail":         ds.collector.ExecuteFail.Get(),
        "execute_timeout":      ds.collector.ExecuteTimeout.Get(),
        "queue_depth":          ds.collector.QueueDepth.Get(),
        "worker_utilization":   ds.collector.WorkerUtilization.Get(),
        "task_backlog":         ds.collector.TaskBacklog.Get(),
        "task_retry_count":     ds.collector.TaskRetryCount.Get(),
        "shard_imbalance":      ds.collector.ShardImbalance.Get(),
        "failover_count":       ds.collector.FailoverCount.Get(),
        "timestamp":            time.Now().Format(time.RFC3339),
    }
    
    json.NewEncoder(w).Encode(metrics)
}

func (ds *DashboardServer) handleTasks(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()
    
    tasks, err := ds.storage.ListTasks(ctx, &TaskFilter{})
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    json.NewEncoder(w).Encode(tasks)
}

func (ds *DashboardServer) handleAlerts(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    triggered := ds.collector.CheckAlerts()
    json.NewEncoder(w).Encode(triggered)
}

func (ds *DashboardServer) handleHealth(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    health := ds.checkHealth()
    if health["status"] == "unhealthy" {
        w.WriteHeader(http.StatusServiceUnavailable)
    }
    
    json.NewEncoder(w).Encode(health)
}

func (ds *DashboardServer) checkHealth() map[string]interface{} {
    health := map[string]interface{}{
        "status":    "healthy",
        "timestamp": time.Now().Format(time.RFC3339),
        "checks":    map[string]interface{}{},
    }
    
    checks := health["checks"].(map[string]interface{})
    
    // 检查调度延迟
    latency := ds.collector.ScheduleLatency.GetPercentile(0.99)
    if latency > 2000 {
        checks["schedule_latency"] = fmt.Sprintf("degraded: p99=%.0fms", latency)
        health["status"] = "unhealthy"
    } else {
        checks["schedule_latency"] = fmt.Sprintf("ok: p99=%.0fms", latency)
    }
    
    // 检查队列深度
    queueDepth := ds.collector.QueueDepth.Get()
    if queueDepth > 1000 {
        checks["queue_depth"] = fmt.Sprintf("degraded: depth=%.0f", queueDepth)
        health["status"] = "unhealthy"
    } else {
        checks["queue_depth"] = fmt.Sprintf("ok: depth=%.0f", queueDepth)
    }
    
    // 检查活跃节点数
    activeNodes := ds.collector.ActiveNodes.Get()
    if activeNodes < 2 {
        checks["active_nodes"] = fmt.Sprintf("warning: only %.0f nodes", activeNodes)
        if health["status"] == "healthy" {
            health["status"] = "degraded"
        }
    } else {
        checks["active_nodes"] = fmt.Sprintf("ok: %.0f nodes", activeNodes)
    }
    
    return health
}

func (ds *DashboardServer) generateDashboardHTML() string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>调度系统监控面板</title>
    <meta http-equiv="refresh" content="5">
    <style>
        body { font-family: monospace; margin: 20px; background: #1a1a2e; color: #e0e0e0; }
        .metric { display: inline-block; margin: 10px; padding: 15px; 
                  background: #16213e; border-radius: 8px; min-width: 200px; }
        .metric h3 { color: #0f3460; margin: 0 0 10px 0; }
        .metric .value { font-size: 24px; color: #e94560; }
        .section { margin: 20px 0; }
        .section h2 { color: #e94560; border-bottom: 1px solid #333; padding-bottom: 5px; }
    </style>
</head>
<body>
    <h1>调度系统监控面板</h1>
    <div class="section">
        <h2>调度层</h2>
        <div class="metric"><h3>调度P99延迟</h3><div class="value" id="sched_p99">-</div></div>
        <div class="metric"><h3>调度成功</h3><div class="value" id="sched_ok">-</div></div>
        <div class="metric"><h3>调度失败</h3><div class="value" id="sched_fail">-</div></div>
        <div class="metric"><h3>活跃节点</h3><div class="value" id="nodes">-</div></div>
    </div>
    <div class="section">
        <h2>执行层</h2>
        <div class="metric"><h3>执行P99延迟</h3><div class="value" id="exec_p99">-</div></div>
        <div class="metric"><h3>队列深度</h3><div class="value" id="queue">-</div></div>
        <div class="metric"><h3>Worker利用率</h3><div class="value" id="worker">-</div></div>
    </div>
    <div class="section">
        <h2>业务层</h2>
        <div class="metric"><h3>任务积压</h3><div class="value" id="backlog">-</div></div>
        <div class="metric"><h3>重试次数</h3><div class="value" id="retry">-</div></div>
        <div class="metric"><h3>分片不均衡</h3><div class="value" id="imbalance">-</div></div>
    </div>
    <script>
        async function fetchMetrics() {
            const resp = await fetch('/metrics');
            const data = await resp.json();
            document.getElementById('sched_p99').textContent = data.schedule_latency_p99.toFixed(0) + 'ms';
            document.getElementById('sched_ok').textContent = data.schedule_success;
            document.getElementById('sched_fail').textContent = data.schedule_fail;
            document.getElementById('nodes').textContent = data.active_nodes;
            document.getElementById('exec_p99').textContent = data.execute_latency_p99.toFixed(0) + 'ms';
            document.getElementById('queue').textContent = data.queue_depth;
            document.getElementById('worker').textContent = data.worker_utilization.toFixed(1) + '%';
            document.getElementById('backlog').textContent = data.task_backlog;
            document.getElementById('retry').textContent = data.task_retry_count;
            document.getElementById('imbalance').textContent = (data.shard_imbalance * 100).toFixed(1) + '%';
        }
        fetchMetrics();
        setInterval(fetchMetrics, 5000);
    </script>
</body>
</html>`
}
```

### 5.4 日志规范与链路追踪

```go
package scheduler

import (
    "context"
    "fmt"
    "log/slog"
    "os"
    "time"
)

// TaskLogger 任务日志器
type TaskLogger struct {
    logger *slog.Logger
}

// LogContext 日志上下文
type LogContext struct {
    TraceID    string
    TaskID     string
    TaskName   string
    ShardIndex int
    NodeID     string
    Stage      string
}

func NewTaskLogger() *TaskLogger {
    handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    })
    
    return &TaskLogger{
        logger: slog.New(handler),
    }
}

func (tl *TaskLogger) LogSchedule(ctx context.Context, lc *LogContext, msg string, args ...any) {
    attrs := []slog.Attr{
        slog.String("trace_id", lc.TraceID),
        slog.String("task_id", lc.TaskID),
        slog.String("task_name", lc.TaskName),
        slog.String("node_id", lc.NodeID),
        slog.String("stage", lc.Stage),
        slog.String("event", "schedule"),
        slog.Time("timestamp", time.Now()),
    }
    
    tl.logger.With(attrs...).InfoContext(ctx, fmt.Sprintf(msg, args...))
}

func (tl *TaskLogger) LogExecute(ctx context.Context, lc *LogContext, msg string, args ...any) {
    attrs := []slog.Attr{
        slog.String("trace_id", lc.TraceID),
        slog.String("task_id", lc.TaskID),
        slog.String("task_name", lc.TaskName),
        slog.Int("shard_index", lc.ShardIndex),
        slog.String("node_id", lc.NodeID),
        slog.String("stage", lc.Stage),
        slog.String("event", "execute"),
        slog.Time("timestamp", time.Now()),
    }
    
    tl.logger.With(attrs...).InfoContext(ctx, fmt.Sprintf(msg, args...))
}

func (tl *TaskLogger) LogError(ctx context.Context, lc *LogContext, err error, msg string, args ...any) {
    attrs := []slog.Attr{
        slog.String("trace_id", lc.TraceID),
        slog.String("task_id", lc.TaskID),
        slog.String("task_name", lc.TaskName),
        slog.String("node_id", lc.NodeID),
        slog.String("stage", lc.Stage),
        slog.String("event", "error"),
        slog.String("error", err.Error()),
        slog.Time("timestamp", time.Now()),
    }
    
    tl.logger.With(attrs...).ErrorContext(ctx, fmt.Sprintf(msg, args...))
}

func (tl *TaskLogger) LogFailover(ctx context.Context, fromNode, toNode, taskID string) {
    attrs := []slog.Attr{
        slog.String("event", "failover"),
        slog.String("from_node", fromNode),
        slog.String("to_node", toNode),
        slog.String("task_id", taskID),
        slog.Time("timestamp", time.Now()),
    }
    
    tl.logger.With(attrs...).WarnContext(ctx, "failover triggered")
}

// TraceIDGenerator 链路追踪ID生成器
type TraceIDGenerator struct{}

func (t *TraceIDGenerator) Generate(taskID string, fireTime time.Time) string {
    return fmt.Sprintf("%s-%d", taskID, fireTime.UnixNano())
}

// TraceSpan 链路追踪span
type TraceSpan struct {
    TraceID   string
    SpanID    string
    Operation string
    StartTime time.Time
    EndTime   time.Time
    Tags      map[string]string
    Status    string
}

// TraceRecorder 链路追踪记录器
type TraceRecorder struct {
    spans []*TraceSpan
    mu    sync.Mutex
}

func (tr *TraceRecorder) StartSpan(traceID, operation string) *TraceSpan {
    span := &TraceSpan{
        TraceID:   traceID,
        SpanID:    generateSpanID(),
        Operation: operation,
        StartTime: time.Now(),
        Tags:      make(map[string]string),
        Status:    "ok",
    }
    return span
}

func (tr *TraceRecorder) FinishSpan(span *TraceSpan) {
    span.EndTime = time.Now()
    tr.mu.Lock()
    tr.spans = append(tr.spans, span)
    tr.mu.Unlock()
}

func (tr *TraceRecorder) GetTrace(traceID string) []*TraceSpan {
    tr.mu.Lock()
    defer tr.mu.Unlock()
    
    var result []*TraceSpan
    for _, span := range tr.spans {
        if span.TraceID == traceID {
            result = append(result, span)
        }
    }
    return result
}

func generateSpanID() string {
    return fmt.Sprintf("span-%d", time.Now().UnixNano())
}
```

> 监控不是越多越好，而是越有效越好。一个能准确反映系统健康状态的指标，胜过一百个没人看的仪表盘。

### 5.5 运维SOP标准操作流程

调度系统的日常运维需要标准化的操作流程。以下是我团队在用的SOP模板：

```
调度系统运维SOP

一、日常巡检（每日执行）
1. 检查调度节点健康状态：GET /health
2. 检查任务积压情况：queue_depth < 100
3. 检查调度延迟：P99 < 500ms
4. 检查告警历史：是否有未处理的告警
5. 检查存储空间：日志和任务历史不超过80%

二、节点故障处理
1. 确认节点状态：是否真的下线
2. 检查故障转移是否自动触发
3. 验证任务是否正常迁移到其他节点
4. 修复或替换故障节点
5. 将新节点加入集群并验证

三、任务积压处理
1. 查看任务积压数量和增长趋势
2. 检查worker利用率是否过高
3. 手动触发扩容（如果自动扩容未触发）
4. 检查是否有慢任务阻塞worker
5. 必要时暂停低优先级任务

四、存储故障处理
1. 确认etcd/数据库是否可用
2. 如果etcd不可用，切换到备份etcd集群
3. 如果数据库不可用，调度器降级到只读模式
4. 恢复后检查数据一致性
5. 验证任务状态是否正确

五、版本发布流程
1. 新版本灰度发布到一个节点
2. 观察该节点任务执行情况（至少30分钟）
3. 逐步滚动更新其他节点
4. 每更新一个节点，观察5分钟
5. 如有异常，立即回滚该节点
6. 全部更新完成后，进行冒烟测试
```

### 5.6 容灾与恢复

```go
package scheduler

import (
    "context"
    "encoding/json"
    "fmt"
    "io"
    "os"
    "path/filepath"
    "time"
)

// BackupManager 备份管理器
type BackupManager struct {
    etcdClient   *clientv3.Client
    backupDir    string
    maxBackups   int
    interval     time.Duration
}

// Backup 备份调度系统状态
func (bm *BackupManager) Backup(ctx context.Context) error {
    timestamp := time.Now().Format("20060102-150405")
    backupPath := filepath.Join(bm.backupDir, fmt.Sprintf("scheduler-backup-%s.json", timestamp))
    
    // 收集所有状态数据
    state := make(map[string]interface{})
    
    // 1. 任务定义
    tasks, err := bm.etcdClient.Get(ctx, "/scheduler/tasks/", clientv3.WithPrefix())
    if err != nil {
        return fmt.Errorf("backup tasks failed: %w", err)
    }
    var taskDefs []map[string]string
    for _, kv := range tasks.Kvs {
        taskDefs = append(taskDefs, map[string]string{
            "key":   string(kv.Key),
            "value": string(kv.Value),
        })
    }
    state["tasks"] = taskDefs
    
    // 2. 节点信息
    nodes, _ := bm.etcdClient.Get(ctx, "/scheduler/nodes/", clientv3.WithPrefix())
    var nodeInfos []map[string]string
    for _, kv := range nodes.Kvs {
        nodeInfos = append(nodeInfos, map[string]string{
            "key":   string(kv.Key),
            "value": string(kv.Value),
        })
    }
    state["nodes"] = nodeInfos
    
    // 3. 分片分配
    assignments, _ := bm.etcdClient.Get(ctx, "/scheduler/assignments/", clientv3.WithPrefix())
    var assigns []map[string]string
    for _, kv := range assignments.Kvs {
        assigns = append(assigns, map[string]string{
            "key":   string(kv.Key),
            "value": string(kv.Value),
        })
    }
    state["assignments"] = assigns
    
    // 4. 调度配置
    configs, _ := bm.etcdClient.Get(ctx, "/scheduler/config/", clientv3.WithPrefix())
    var configVals []map[string]string
    for _, kv := range configs.Kvs {
        configVals = append(configVals, map[string]string{
            "key":   string(kv.Key),
            "value": string(kv.Value),
        })
    }
    state["configs"] = configVals
    
    state["backup_time"] = time.Now().Format(time.RFC3339)
    
    // 写入备份文件
    data, err := json.MarshalIndent(state, "", "  ")
    if err != nil {
        return fmt.Errorf("marshal backup failed: %w", err)
    }
    
    if err := os.MkdirAll(bm.backupDir, 0755); err != nil {
        return fmt.Errorf("create backup dir failed: %w", err)
    }
    
    if err := os.WriteFile(backupPath, data, 0644); err != nil {
        return fmt.Errorf("write backup file failed: %w", err)
    }
    
    fmt.Printf("[BACKUP] saved to %s (%d bytes)\n", backupPath, len(data))
    
    // 清理旧备份
    bm.cleanOldBackups()
    
    return nil
}

// Restore 从备份恢复
func (bm *BackupManager) Restore(ctx context.Context, backupPath string) error {
    data, err := os.ReadFile(backupPath)
    if err != nil {
        return fmt.Errorf("read backup file failed: %w", err)
    }
    
    var state map[string]interface{}
    if err := json.Unmarshal(data, &state); err != nil {
        return fmt.Errorf("unmarshal backup failed: %w", err)
    }
    
    fmt.Printf("[RESTORE] restoring from %s\n", backupPath)
    
    // 恢复任务定义
    if tasks, ok := state["tasks"].([]interface{}); ok {
        for _, t := range tasks {
            taskMap := t.(map[string]interface{})
            key := taskMap["key"].(string)
            value := taskMap["value"].(string)
            bm.etcdClient.Put(ctx, key, value)
        }
        fmt.Printf("[RESTORE] restored %d tasks\n", len(tasks))
    }
    
    // 恢复配置
    if configs, ok := state["configs"].([]interface{}); ok {
        for _, c := range configs {
            configMap := c.(map[string]interface{})
            key := configMap["key"].(string)
            value := configMap["value"].(string)
            bm.etcdClient.Put(ctx, key, value)
        }
        fmt.Printf("[RESTORE] restored %d configs\n", len(configs))
    }
    
    // 注意：节点和分片分配不恢复，因为节点可能已经变化
    // 让系统重新进行节点注册和分片分配
    
    fmt.Printf("[RESTORE] completed\n")
    return nil
}

// cleanOldBackups 清理旧备份
func (bm *BackupManager) cleanOldBackups() {
    files, err := os.ReadDir(bm.backupDir)
    if err != nil {
        return
    }
    
    var backups []os.DirEntry
    for _, f := range files {
        if !f.IsDir() && len(f.Name()) > 20 {
            backups = append(backups, f)
        }
    }
    
    if len(backups) <= bm.maxBackups {
        return
    }
    
    // 按文件名排序（文件名包含时间戳，天然有序）
    for i := 0; i < len(backups)-bm.maxBackups; i++ {
        path := filepath.Join(bm.backupDir, backups[i].Name())
        os.Remove(path)
        fmt.Printf("[BACKUP] cleaned old backup: %s\n", path)
    }
}

// StartPeriodicBackup 启动定期备份
func (bm *BackupManager) StartPeriodicBackup(ctx context.Context) {
    ticker := time.NewTicker(bm.interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:\n            if err := bm.Backup(ctx); err != nil {
                fmt.Printf("[BACKUP] periodic backup failed: %v\n", err)
            }
        }
    }
}
```

> 容灾不是"出了事怎么办"，而是"出了事之后多快能恢复"。备份是为了恢复，不是为了备份本身。

### 5.7 压测与容量规划

```go
package scheduler

import (
    "context"
    "fmt"
    "sync/atomic"
    "time"
)

// LoadTest 压力测试
type LoadTest struct {
    scheduler *Scheduler
    taskCount int
    duration  time.Duration
    rps       int // 每秒提交任务数
}

// Run 执行压测
func (lt *LoadTest) Run(ctx context.Context) *LoadTestResult {
    result := &LoadTestResult{
        StartTime: time.Now(),
    }
    
    var submitted, succeeded, failed int64
    
    ticker := time.NewTicker(time.Second / time.Duration(lt.rps))
    defer ticker.Stop()
    
    endTimer := time.After(lt.duration)
    
    for i := 0; i < lt.taskCount; i++ {
        select {
        case <-ctx.Done():
            goto done
        case <-endTimer:
            goto done
        case <-ticker.C:\n            atomic.AddInt64(&submitted, 1)\n            \n            go func(taskNum int) {\n                start := time.Now()
                
                task := &TaskInstance{
                    TaskID:   fmt.Sprintf("loadtest-%d", taskNum),
                    FireTime: time.Now(),
                    Execute: func() {
                        // 模拟任务执行
                        time.Sleep(50 * time.Millisecond)
                    },
                }
                
                err := lt.scheduler.SubmitTask(task)
                duration := time.Since(start)
                
                if err != nil {
                    atomic.AddInt64(&failed, 1)
                    result.RecordLatency(duration, false)
                } else {
                    atomic.AddInt64(&succeeded, 1)
                    result.RecordLatency(duration, true)
                }
            }(i)
        }
    }
    
done:
    result.EndTime = time.Now()
    result.Submitted = atomic.LoadInt64(&submitted)
    result.Succeeded = atomic.LoadInt64(&succeeded)
    result.Failed = atomic.LoadInt64(&failed)
    result.CalculatePercentiles()
    
    return result
}

// LoadTestResult 压测结果
type LoadTestResult struct {
    StartTime  time.Time
    EndTime    time.Time
    Submitted  int64
    Succeeded  int64
    Failed     int64
    latencies  []time.Duration
    successLatencies []time.Duration
    
    P50Latency time.Duration
    P95Latency time.Duration
    P99Latency time.Duration
    MaxLatency time.Duration
    QPS        float64
}

func (r *LoadTestResult) RecordLatency(d time.Duration, success bool) {
    r.latencies = append(r.latencies, d)
    if success {
        r.successLatencies = append(r.successLatencies, d)
    }
}

func (r *LoadTestResult) CalculatePercentiles() {
    if len(r.latencies) == 0 {
        return
    }
    
    // 排序
    sortDurations(r.latencies)
    
    n := len(r.latencies)
    r.P50Latency = r.latencies[n/2]
    r.P95Latency = r.latencies[int(float64(n)*0.95)]
    r.P99Latency = r.latencies[int(float64(n)*0.99)]
    r.MaxLatency = r.latencies[n-1]
    
    duration := r.EndTime.Sub(r.StartTime).Seconds()
    if duration > 0 {
        r.QPS = float64(r.Succeeded) / duration
    }
}

func (r *LoadTestResult) PrintReport() {
    fmt.Println("\n========== 压测报告 ==========")
    fmt.Printf("持续时间: %v\n", r.EndTime.Sub(r.StartTime))
    fmt.Printf("提交任务: %d\n", r.Submitted)
    fmt.Printf("成功: %d\n", r.Succeeded)
    fmt.Printf("失败: %d\n", r.Failed)
    fmt.Printf("成功率: %.2f%%\n", float64(r.Succeeded)/float64(r.Submitted)*100)
    fmt.Printf("QPS: %.2f\n", r.QPS)
    fmt.Printf("P50延迟: %v\n", r.P50Latency)
    fmt.Printf("P95延迟: %v\n", r.P95Latency)
    fmt.Printf("P99延迟: %v\n", r.P99Latency)
    fmt.Printf("最大延迟: %v\n", r.MaxLatency)
    fmt.Println("==============================")
}

func sortDurations(d []time.Duration) {
    for i := 1; i < len(d); i++ {
        key := d[i]
        j := i - 1
        for j >= 0 && d[j] > key {
            d[j+1] = d[j]
            j--
        }
        d[j+1] = key
    }
}
```

容量规划建议基于压测结果来做。一般我会关注这几个指标：

- 单节点最大承载任务数（QPS）
- 不同分片数下的吞吐量变化
- worker池大小与延迟的关系
- 网络带宽占用

> 容量规划的本质是回答一个问题：在满足SLA的前提下，系统能承载多少负载？这个问题不能用感觉回答，只能用数据回答。

## 总结与思考

这一章我们从五个维度讲了调度系统的高可用与扩展：

**架构层面**：多节点部署 + 选主 + 分布式锁 + 故障转移，消灭单点故障。核心是保证Leader挂了能秒级切换，任务不会丢失也不会重复执行。

**分片层面**：把大任务拆成小任务并行执行。关键是分片策略要均匀、分片失败要可重试、分阶段执行要有Barrier。

**扩缩容层面**：根据负载自动增减节点。扩容相对简单，缩容的核心是安全排空：停新任务、等完老任务、迁移分片、摘节点。

**性能层面**：缓存任务定义、时间轮调度、worker池复用。先profile找瓶颈，再针对性优化，不要盲目优化。

**运维层面**：三维监控（调度/执行/业务）+ 告警规则 + SOP + 容灾备份 + 压测。监控要有效，告警要准确，恢复要快速。

> 高可用不是一堆技术的堆砌，而是一套完整的体系：架构上消灭单点、策略上消化故障、监控上感知异常、运维上快速恢复。

如果你觉得这篇文章对你有帮助，点个收藏，以后遇到调度系统的问题时翻出来看看。有什么问题或者踩坑经验，评论区交流，我看评论比写文章还认真。

下一章是整个系列的最后一章，我会把分布式调度系统的核心要点做个总结，并且对整个Go专家课程做个全面复盘。写了这么多章，终于要到收尾了。

系列进度 15/16

下章预告：第16章——分布式调度系统总结与课程总复盘。我会把16章内容串成一条线，从基础语法到并发编程到分布式系统，回顾整个学习路径，梳理知识体系，给出进阶建议。最后一章，我们好好收个尾。

---

怕浪猫说：调度系统是我做过最"刺激"的系统之一。它的特点是平时风平浪静，一旦出事就是大事。凌晨被叫醒的滋味，我尝过太多次了。但正是这些深夜的故障，逼着我把架构想清楚、把代码写扎实、把运维做到位。技术人的成长，很多时候不是来自写过的代码，而是来自填过的坑。希望你读完这章，能在自己的调度系统里少踩几个坑。共勉。
