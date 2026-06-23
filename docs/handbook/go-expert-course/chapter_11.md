# 第11章：WebSocket网关集群与扩展

线上跑着单机WebSocket服务，日活涨到十万的时候，你开始慌了。连接数逼近单机上限，内存涨得比股价还快，一次重启就是一次事故。你在想，能不能多搞几台机器分担压力？但WebSocket是长连接，跟HTTP那种无状态的请求完全不是一回事。连接挂在哪台机器上，消息就得从哪台机器推出去。跨节点怎么办？一致性怎么保障？扩缩容的时候连接断了谁负责？这些问题每一个都够你掉几根头发。

这些坑，怕浪猫我一个个踩过，今天全给你讲透。

我是怕浪猫，一个在生产环境把WebSocket网关从单机干到百机集群的Go后端工程师。前面几章我们聊了WebSocket网关的基础实现、连接管理和消息协议，这一章开始进入分布式领域。我们会聊分布式WebSocket架构的核心问题：怎么把长连接服务真正水平扩展出去，同时还不丢消息、不乱序、不把运维同学逼疯。这一章的内容偏重架构设计和工程实践，代码量比较大，建议带着自己的业务场景边看边对照思考。

## 一、分布式WebSocket架构方案

### 1.1 为什么单机方案撑不住

先来认真分析一下单机WebSocket服务的瓶颈到底在哪。假设你有一台八核十六G的机器跑Go服务，每个连接大约占用十到十五KB内存，包括读写缓冲区、用户上下文信息、心跳计时器等。理论上单机可以支撑几十万连接，Go语言的goroutine模型确实让高并发看起来很容易。但实际生产环境中，问题远不止内存这一个维度。

第一是CPU瓶颈。消息的序列化和反序列化是CPU密集型操作，特别是用JSON这种文本协议的时候。TLS握手虽然只在连接建立时发生一次，但在高并发建连的场景下也会对CPU造成显著压力。心跳处理虽然单个连接开销很小，但乘以十万连接就是另一回事了。再加上业务逻辑的执行，CPU很快就会成为瓶颈。

第二是网卡瓶颈。万兆网卡理论上能跑一千二百五十兆字节每秒，但这只是带宽层面的指标。在WebSocket这种小包高频场景下，真正限制性能的是网卡每秒能处理的数据包数量（PPS）。小包场景下PPS往往比带宽先到天花板。

第三是单点故障。一台机器挂了，上面所有连接全部断开。如果是十万连接的节点，这意味着十万个用户同时断线重连。重连风暴会瞬间压垮你的其他节点，形成雪崩效应。这还没算上数据丢失的问题——如果消息存储也在本地，那就更惨了。

第四是部署效率。每次发版必须重启服务，重启就断连。虽然可以通过滚动发布来缓解，但在滚动过程中，被重启的节点上的连接需要全部迁移或者断开重连。如果发布频率高，用户体验会很差。

> 单机不是技术选择，是技术债务。越早还清，利息越少。拖着不还，迟早有一天利息会压垮你。

怕浪猫见过太多团队在单机撑不住的时候才开始做分布式改造，那时候代码里到处都是单机假设，改起来牵一发而动全身。最好的时机是在单机还能撑住的时候就未雨绸缪，把架构设计好，让水平扩展成为自然而然的事情而不是伤筋动骨的重构。

### 1.2 分布式WebSocket的整体架构

怕浪猫在实际生产中采用的架构分为四层，每一层各司其职：

**接入层**，由SLB（负载均衡器）承担，做四层TCP负载均衡，把WebSocket连接请求分发到后端的各个Gateway节点。这里用四层而不是七层，是因为WebSocket连接升级前是一个HTTP请求，但升级后就变成了TCP长连接，七层负载均衡在这个场景下没有额外的好处，反而会增加开销。

**网关层**，由多个Gateway节点组成。每个Gateway节点独立维护自己的本地连接表，处理连接的生命周期管理，包括连接建立、心跳维持、消息收发和连接关闭。Gateway节点之间不直接通信，而是通过消息总线间接协作。

**消息路由层**，基于Redis Pub/Sub实现。业务服务产生消息后，发布到Redis的消息频道，所有Gateway节点都订阅这个频道。收到消息后，各节点判断目标用户是否在本地，在的话就投递，不在就忽略。这种广播过滤模式虽然有一定的无效消息传输，但实现简单且延迟低。

**存储层**，Redis承担多个职责：存储用户到节点的路由映射关系、存储节点上的用户列表、存储待确认的消息、提供Pub/Sub能力。在更大规模的场景下，可以引入Kafka等消息队列来做重要消息的持久化存储。

这个架构的核心设计原则是：Gateway节点无状态化（除了本地连接表），所有跨节点的状态都通过Redis来维护。这样任何一个Gateway节点挂了，只需要把它上面的连接迁移到其他节点就行，不需要担心状态丢失。

> 架构设计的本质是在复杂性、性能和可靠性之间找平衡点，没有银弹，只有最合适的取舍。每一个架构选择都应该明确定义你在优化什么、在牺牲什么。

### 1.3 连接管理模型

在分布式环境下，连接管理最核心的问题是：怎么知道某个用户当前连在哪台机器上？这个问题看似简单，但在各种异常场景下会变得非常棘手。

怕浪猫用的是Redis的String结构存储路由表，键是 `ws:route:{userID}`，值是节点ID。同时维护一个Hash结构 `ws:node:{nodeID}:users` 存储每个节点上的所有用户列表，用于扩缩容时的清理工作。

```go
package gateway

import (
    "context"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
)

// ConnectionRegistry 连接注册中心
// 管理用户与Gateway节点之间的路由关系
type ConnectionRegistry struct {
    redisClient *redis.Client
    nodeID      string // 当前节点唯一标识
    ttl         time.Duration
}

func NewConnectionRegistry(redisClient *redis.Client, nodeID string) *ConnectionRegistry {
    return &ConnectionRegistry{
        redisClient: redisClient,
        nodeID:      nodeID,
        ttl:         30 * time.Second, // 与心跳周期对齐，防止僵尸路由
    }
}

// RegisterConnection 用户上线时注册连接信息
// 将用户ID到节点ID的映射写入Redis，并设置TTL
func (r *ConnectionRegistry) RegisterConnection(ctx context.Context, userID string) error {
    key := fmt.Sprintf("ws:route:%s", userID)
    // 设置路由记录，TTL防止节点宕机后路由记录成为僵尸数据
    if err := r.redisClient.Set(ctx, key, r.nodeID, r.ttl).Err(); err != nil {
        return fmt.Errorf("register connection failed: %w", err)
    }
    // 同时维护节点上的用户集合，方便扩缩容时批量清理
    nodeKey := fmt.Sprintf("ws:node:%s:users", r.nodeID)
    r.redisClient.SAdd(ctx, nodeKey, userID)
    r.redisClient.Expire(ctx, nodeKey, r.ttl)
    return nil
}

// UnregisterConnection 用户下线时注销连接信息
// 注意：必须校验当前路由是否指向本节点，防止误删其他节点的路由
func (r *ConnectionRegistry) UnregisterConnection(ctx context.Context, userID string) error {
    key := fmt.Sprintf("ws:route:%s", userID)
    // 先读取当前路由值，确认是本节点的连接才删除
    val, err := r.redisClient.Get(ctx, key).Result()
    if err == redis.Nil {
        return nil // 路由已不存在，无需处理
    }
    if err != nil {
        return err
    }
    if val != r.nodeID {
        // 不是本节点的连接，说明用户已经重连到其他节点
        // 此时不能删除，否则会把新节点的路由删掉
        return nil
    }
    r.redisClient.Del(ctx, key)
    nodeKey := fmt.Sprintf("ws:node:%s:users", r.nodeID)
    r.redisClient.SRem(ctx, nodeKey, userID)
    return nil
}

// GetNodeByUser 查询用户所在的节点
// 业务服务推送消息时调用此方法获取目标节点
func (r *ConnectionRegistry) GetNodeByUser(ctx context.Context, userID string) (string, error) {
    key := fmt.Sprintf("ws:route:%s", userID)
    nodeID, err := r.redisClient.Get(ctx, key).Result()
    if err == redis.Nil {
        return "", ErrUserOffline
    }
    if err != nil {
        return "", err
    }
    return nodeID, nil
}

// RefreshConnection 心跳续期
// 客户端每次发送心跳时调用，刷新路由记录的TTL
func (r *ConnectionRegistry) RefreshConnection(ctx context.Context, userID string) error {
    key := fmt.Sprintf("ws:route:%s", userID)
    return r.redisClient.Set(ctx, key, r.nodeID, r.ttl).Err()
}
```

这段代码有几个关键的细节需要仔细理解。

第一是TTL机制。每条路由记录都有三十秒的TTL，客户端心跳间隔设为二十五秒。正常情况下客户端每次心跳都会续期TTL，路由记录会一直存在。如果客户端断连且没有来得及正常关闭连接（比如网络中断、进程崩溃），TTL到期后路由记录会自动清除。这比依赖服务端检测断连要可靠得多，因为TCP层面的断连检测可能需要几分钟。

第二是节点用户集合。除了单条路由记录，还维护了 `ws:node:{nodeID}:users` 这个集合。扩缩容时需要知道某个节点上有哪些用户，这个集合就是清理和迁移的依据。它同样设置了TTL，防止节点宕机后成为僵尸数据。

第三是防误删逻辑。`UnregisterConnection` 方法里先读取路由值，确认是本节点的连接才执行删除。这是为了应对一种极端情况：用户重连到新节点后，旧节点的断开事件因为网络延迟还没处理完，如果无条件删除，就会把新节点刚建立的路由也删掉。这种情况在生产环境中确实发生过，而且排查起来非常困难，因为表现就是"用户偶尔收不到消息"。

> 分布式系统里，永远不要假设事件的先后顺序和你预期的一致。用条件判断代替盲目操作，是保命的基本功。每删一个数据之前，先确认它还是不是你该删的那个。

### 1.4 Gateway节点核心结构

理解了路由表的设计，我们来看Gateway节点本身的核心结构。每个Gateway节点需要维护本地连接表、处理WebSocket连接升级、管理读写goroutine、订阅消息总线。

```go
package gateway

import (
    "context"
    "net/http"
    "sync"
    "time"

    "github.com/gorilla/websocket"
    "github.com/redis/go-redis/v9"
)

// Gateway WebSocket网关节点
// 每个Gateway实例运行在一个独立节点上，维护本地连接表
type Gateway struct {
    nodeID      string                 // 节点唯一标识
    httpServer  *http.Server
    registry    *ConnectionRegistry
    redisClient *redis.Client

    // 本地连接表：userID -> *ClientConn
    // 使用sync.Map因为WebSocket场景下读多写少，读路径无锁
    connections sync.Map

    // 消息接收通道（订阅Redis Pub/Sub后收到的消息）
    msgChannel  <-chan *redis.Message

    // 优雅关闭控制
    shutdown chan struct{}
    wg       sync.WaitGroup
}

// ClientConn 客户端连接封装
// 每个WebSocket连接对应一个ClientConn实例
type ClientConn struct {
    userID    string
    conn      *websocket.Conn
    send      chan []byte         // 发送消息缓冲通道
    close     chan struct{}        // 关闭信号
    closeOnce sync.Once            // 确保Close只执行一次
}

// 连接相关超时参数
// 这些参数需要根据实际网络环境调整
const (
    writeWait      = 10 * time.Second   // 写操作超时
    pongWait       = 60 * time.Second   // 等待Pong的超时时间
    pingPeriod     = 25 * time.Second   // 发送Ping的间隔
    maxMessageSize = 4096               // 单条消息最大大小
    sendBufferSize = 256                // 发送缓冲通道大小
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  4096,
    WriteBufferSize: 4096,
    CheckOrigin: func(r *http.Request) bool {
        // 生产环境必须做严格的Origin校验，防止CSRF
        // 这里简化演示，实际应该校验白名单域名
        return true
    },
}

// ServeWS 处理WebSocket连接升级请求
// 这是HTTP连接升级为WebSocket连接的入口
func (g *Gateway) ServeWS(w http.ResponseWriter, r *http.Request) {
    userID := r.URL.Query().Get("uid")
    if userID == "" {
        http.Error(w, "missing uid", http.StatusBadRequest)
        return
    }

    // 升级HTTP连接为WebSocket连接
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }

    // 设置连接参数
    conn.SetReadLimit(maxMessageSize)
    conn.SetReadDeadline(time.Now().Add(pongWait))
    // 设置Pong处理器，收到Pong时刷新读超时
    conn.SetPongHandler(func(string) error {
        conn.SetReadDeadline(time.Now().Add(pongWait))
        return nil
    })

    client := &ClientConn{
        userID: userID,
        conn:   conn,
        send:   make(chan []byte, sendBufferSize),
        close:  make(chan struct{}),
    }

    // 注册到本地连接表
    g.connections.Store(userID, client)

    // 注册到Redis路由表
    // 如果这一步失败，需要回滚本地注册
    ctx := context.Background()
    if err := g.registry.RegisterConnection(ctx, userID); err != nil {
        g.connections.Delete(userID)
        conn.Close()
        return
    }

    // 启动读写goroutine
    // 每个连接占用两个goroutine：一个读、一个写
    g.wg.Add(2)
    go g.writePump(client)
    go g.readPump(client)
}
```

这里有一个设计决策要说清楚：本地连接表用 `sync.Map` 还是 `map + sync.RWMutex`？

怕浪猫做过详细的基准测试。在连接数较少（一万以下）时，两者的性能差异可以忽略不计。但在连接数超过五万之后，`sync.Map` 的读性能优势开始显现，因为它的读路径是完全无锁的，通过内部的原子操作和只读快照实现。写入性能方面 `sync.Map` 比 `map + RWMutex` 差一些，因为它的写入路径更复杂，需要维护脏字典的同步。

WebSocket场景下读多写少，连接建立后大量消息推送都是读取连接对象，连接的创建和销毁频率相对较低。所以 `sync.Map` 是更合适的选择。如果你的场景中连接频繁建立断开（比如短连接模式），那 `map + RWMutex` 可能更好。

> Go标准库的每个并发原语都有它最擅长的场景，选型前先搞清楚你的读写比例，而不是哪个新用哪个。技术选型最忌讳跟风，适合别人业务的不一定适合你的。

### 1.5 读写Pump的实现

每个WebSocket连接会被分配两个goroutine，一个负责读（`readPump`），一个负责写（`writePump`）。这种分离读写职责的模式是Go网络编程的经典实践。

```go
// readPump 读取客户端消息的goroutine
// 负责读取消息、处理心跳、检测连接断开
func (g *Gateway) readPump(client *ClientConn) {
    defer g.wg.Done()
    defer func() {
        // 连接断开时清理资源
        g.unregisterClient(client)
    }()

    for {
        _, message, err := client.conn.ReadMessage()
        if err != nil {
            if websocket.IsUnexpectedCloseError(err,
                websocket.CloseGoingAway,
                websocket.CloseNormalClosure) {
                log.Printf("[gateway:%s] unexpected close: userID=%s err=%v",
                    g.nodeID, client.userID, err)
            }
            break
        }

        // 处理客户端发来的消息
        // 通常WebSocket网关只做消息转发，不做业务逻辑处理
        g.handleClientMessage(client, message)
    }
}

// writePump 向客户端写入消息的goroutine
// 负责发送消息、发送Ping心跳、检测写入超时
func (g *Gateway) writePump(client *ClientConn) {
    defer g.wg.Done()

    ticker := time.NewTicker(pingPeriod)
    defer ticker.Stop()

    for {
        select {
        case message, ok := <-client.send:
            // 从发送通道收到消息
            client.conn.SetWriteDeadline(time.Now().Add(writeWait))
            if !ok {
                // 通道已关闭，发送Close帧
                client.conn.WriteMessage(websocket.CloseMessage, []byte{})
                return
            }
            // 写入消息
            if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
                return
            }

        case <-ticker.C:
            // 定时发送Ping
            client.conn.SetWriteDeadline(time.Now().Add(writeWait))
            if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }

        case <-client.close:
            return
        }
    }
}

// unregisterClient 注销客户端连接
func (g *Gateway) unregisterClient(client *ClientConn) {
    client.Close()
    g.connections.Delete(client.userID)

    ctx := context.Background()
    g.registry.UnregisterConnection(ctx, client.userID)
}

// handleClientMessage 处理客户端发来的消息
func (g *Gateway) handleClientMessage(client *ClientConn, message []byte) {
    // 解析消息类型
    var msg struct {
        Type    string          `json:"type"`
        Data    json.RawMessage `json:"data"`
    }
    if err := json.Unmarshal(message, &msg); err != nil {
        return
    }

    switch msg.Type {
    case "heartbeat":
        // 心跳消息，刷新路由TTL
        ctx := context.Background()
        g.registry.RefreshConnection(ctx, client.userID)
        // 回复心跳
        client.conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"heartbeat_ack"}`))

    case "message":
        // 业务消息，转发到业务服务处理
        // 这里可以接入Kafka或直接调用业务服务
        g.forwardToBusiness(client.userID, msg.Data)

    case "ack":
        // 客户端确认收到消息
        var ack struct {
            MessageID string `json:"message_id"`
        }
        json.Unmarshal(msg.Data, &ack)
        g.handleAck(client.userID, ack.MessageID)
    }
}

// Close 安全关闭连接
func (c *ClientConn) Close() {
    c.closeOnce.Do(func() {
        close(c.close)
        c.conn.Close()
    })
}
```

`writePump` 中有一个细节值得注意：每次写入前都会设置写超时（`SetWriteDeadline`）。这是防止网络异常时写入操作永远阻塞，导致goroutine泄漏。写超时设为十秒，如果十秒内写不成功，就认为连接已经不可用，直接返回让goroutine退出。

`readPump` 中使用了 `websocket.IsUnexpectedCloseError` 来区分正常关闭和异常关闭。正常关闭（如客户端主动调用close）不需要记录日志，异常关闭（如网络中断）需要记录用于排查问题。这个区分在生产环境中很重要，否则日志里会充满噪声。

> goroutine泄漏是Go服务最隐蔽的Bug之一。每个goroutine都应该有明确的退出路径，不能假设它"总会结束"。用context、channel或timeout来保证退出，是基本素养。

## 二、跨节点消息推送实现

### 2.1 问题的本质

单机环境下，业务服务直接调用Gateway的方法就能推送消息，简单直接。但分布式环境下，业务服务不知道用户连在哪个Gateway节点上。即使通过路由表查到了目标节点，跨进程调用也需要网络通信，这就引入了一系列新问题：消息怎么序列化、网络失败了怎么办、消息顺序怎么保证。

怕浪猫把跨节点推送的方案总结为三种主流路线，每种都有适用的场景和明显的短板。

第一种是Redis Pub/Sub方案。业务服务把消息发布到一个Redis频道，所有Gateway节点都订阅这个频道。收到消息后，各节点判断目标用户是否在本地，在的话就投递，不在就忽略。优点是实现非常简单，延迟很低（通常在一毫秒以内），缺点是消息不持久化，如果某个节点在消息发布时刚好不在线，这条消息就永久丢失了。

第二种是消息队列方案，用Kafka或RabbitMQ来替代Redis Pub/Sub。业务消息写入MQ，各Gateway节点作为消费者消费消息。优点是消息持久化、可回溯、支持重试，缺点是延迟较高（通常在十到五十毫秒级别），架构也更复杂。

第三种是gRPC直连方案。业务服务先查路由表获取目标节点，然后通过gRPC直接调用目标节点的推送接口。优点是精准投递没有多余广播，缺点是需要维护节点间的连接池，而且每次推送都要查路由表，对Redis压力较大。

> 没有完美的方案，只有适合场景的组合拳。架构师的价值就在于知道什么时候该妥协、在哪里妥协。选型的时候列出你的约束条件，然后看哪个方案满足的约束最多。

实际生产中，怕浪猫采用的是混合方案：实时消息走Redis Pub/Sub保证低延迟，重要消息同时写入Kafka保证不丢。具体来说，聊天消息和通知类消息走Pub/Sub就够了，因为即使丢了也可以通过客户端重传来补。但涉及资金的消息（比如支付通知、交易确认）必须同时写Kafka，确保在任何情况下都不丢。

### 2.2 Redis Pub/Sub实现跨节点推送

下面是完整的消息总线实现。消息总线是连接业务服务和Gateway节点的桥梁，业务服务通过消息总线发布消息，Gateway节点通过消息总线接收消息。

```go
package gateway

import (
    "context"
    "encoding/json"
    "log"
    "time"

    "github.com/redis/go-redis/v9"
)

// MessageBus 消息总线
// 基于Redis Pub/Sub实现跨节点消息推送
type MessageBus struct {
    redisClient *redis.Client
    nodeID      string
    gateway     *Gateway
}

// PushMessage 推送消息结构
// 这个结构会被序列化后发布到Redis频道
type PushMessage struct {
    MessageID  string          `json:"message_id"`   // 消息唯一ID
    TargetType string          `json:"target_type"`  // 目标类型：user/room/broadcast
    TargetID   string          `json:"target_id"`    // 目标ID：用户ID或房间ID
    Event      string          `json:"event"`        // 事件类型
    Data       json.RawMessage `json:"data"`         // 消息数据
    Timestamp  int64           `json:"timestamp"`    // 消息时间戳
    Source     string          `json:"source"`       // 消息来源节点ID
}

// Redis频道名称
const channelName = "ws:push:messages"

// StartSubscriber 启动Redis订阅
// 每个Gateway节点启动时调用，订阅消息频道
func (mb *MessageBus) StartSubscriber(ctx context.Context) error {
    pubsub := mb.redisClient.Subscribe(ctx, channelName)
    // 确认订阅成功
    _, err := pubsub.Receive(ctx)
    if err != nil {
        return err
    }

    // 获取消息通道，设置缓冲区大小为1024
    // 缓冲区大小需要根据消息吞吐量调整
    ch := pubsub.Channel(
        redis.WithChannelSize(1024),
    )

    go func() {
        defer pubsub.Close()
        for {
            select {
            case <-ctx.Done():
                return
            case msg, ok := <-ch:
                if !ok {
                    return
                }
                mb.handleMessage(msg.Payload)
            }
        }
    }()

    return nil
}

// handleMessage 处理收到的推送消息
// 根据消息的目标类型选择不同的投递策略
func (mb *MessageBus) handleMessage(payload string) {
    var msg PushMessage
    if err := json.Unmarshal([]byte(payload), &msg); err != nil {
        log.Printf("[gateway:%s] unmarshal message failed: %v", mb.nodeID, err)
        return
    }

    // 跳过自己发出的消息，避免环回
    // 虽然Pub/Sub不会回传给发布者，但混合方案中可能有其他路径导致回环
    if msg.Source == mb.nodeID {
        return
    }

    switch msg.TargetType {
    case "user":
        mb.pushToUser(msg.TargetID, msg)
    case "room":
        mb.pushToRoom(msg.TargetID, msg)
    case "broadcast":
        mb.broadcast(msg)
    }
}

// pushToUser 推送到指定用户
// 只在当前节点有该用户的连接时才投递
func (mb *MessageBus) pushToUser(userID string, msg PushMessage) {
    val, ok := mb.gateway.connections.Load(userID)
    if !ok {
        // 用户不在当前节点，忽略这条消息
        // 这是正常的，Pub/Sub是广播模式，大部分节点都会忽略大部分消息
        return
    }
    client := val.(*ClientConn)

    data, _ := json.Marshal(msg)
    select {
    case client.send <- data:
        // 投递成功
    default:
        // 发送缓冲区已满，说明客户端消费速度跟不上
        // 这里需要根据业务策略决定如何处理
        log.Printf("[gateway:%s] send buffer full, user=%s, msg=%s",
            mb.nodeID, userID, msg.MessageID)
    }
}

// pushToRoom 推送到房间内所有用户
// 房间成员列表存储在Redis中，每个节点只投递本地有的成员
func (mb *MessageBus) pushToRoom(roomID string, msg PushMessage) {
    ctx := context.Background()
    // 从Redis获取房间成员列表
    members, err := mb.redisClient.SMembers(ctx, "ws:room:"+roomID).Result()
    if err != nil {
        log.Printf("[gateway:%s] get room members failed: %v", mb.nodeID, err)
        return
    }

    data, _ := json.Marshal(msg)
    pushed := 0
    for _, userID := range members {
        if val, ok := mb.gateway.connections.Load(userID); ok {
            client := val.(*ClientConn)
            select {
            case client.send <- data:
                pushed++
            default:
                log.Printf("[gateway:%s] room push buffer full, user=%s",
                    mb.nodeID, userID)
            }
        }
    }
    // 可以记录推送统计：total成员数 vs 实际推送数
    log.Printf("[gateway:%s] room push, room=%s, members=%d, pushed=%d",
        mb.nodeID, roomID, len(members), pushed)
}

// broadcast 广播给当前节点的所有连接
// 慎用，只在全局通知场景下使用
func (mb *MessageBus) broadcast(msg PushMessage) {
    data, _ := json.Marshal(msg)
    count := 0
    mb.gateway.connections.Range(func(key, val any) bool {
        client := val.(*ClientConn)
        select {
        case client.send <- data:
            count++
        default:
            // 广播场景下缓冲区满直接丢弃
            // 因为广播消息通常不是关键消息
        }
        return true
    })
}

// Publish 推送消息到总线
// 业务服务调用此方法发布消息
func (mb *MessageBus) Publish(ctx context.Context, msg PushMessage) error {
    msg.Source = mb.nodeID
    msg.Timestamp = time.Now().UnixMilli()

    payload, err := json.Marshal(msg)
    if err != nil {
        return err
    }

    return mb.redisClient.Publish(ctx, channelName, payload).Err()
}
```

### 2.3 发送缓冲区的背压策略

上面代码中有一处 `default` 分支，这是Go channel的非阻塞发送模式。当 `client.send` 缓冲区满时，消息会被直接丢弃。但这个策略需要根据业务场景来仔细调整，不同类型的消息对可靠性的要求不同。

怕浪猫总结了一个背压策略选择框架，根据消息的业务特征来匹配最合适的策略：

```go
// BackpressureStrategy 背压策略类型
type BackpressureStrategy int

const (
    // StrategyDrop 丢弃消息
    // 适合：实时性高的场景，如行情推送、在线状态变更
    // 理由：旧消息很快被新消息覆盖，丢几条无所谓
    StrategyDrop BackpressureStrategy = iota

    // StrategyDisconnect 断开连接
    // 适合：消息不能丢的场景，如IM聊天消息
    // 理由：宁可断开重连补发离线消息，也不能丢消息
    StrategyDisconnect

    // StrategySlowDown 延迟重试
    // 适合：通知类消息，有一定的实时性要求但可以容忍短延迟
    // 理由：给一点缓冲时间，但也不能无限等
    StrategySlowDown
)

// pushWithStrategy 根据策略推送消息
func (mb *MessageBus) pushWithStrategy(
    client *ClientConn,
    data []byte,
    strategy BackpressureStrategy,
) {
    switch strategy {
    case StrategyDrop:
        // 直接丢弃，记录监控指标
        select {
        case client.send <- data:
        default:
            metrics.MessageDropped.Inc()
            log.Printf("message dropped, user=%s", client.userID)
        }

    case StrategyDisconnect:
        // 缓冲区满说明客户端有问题，断开连接让客户端重连
        select {
        case client.send <- data:
        default:
            log.Printf("buffer full, disconnecting user=%s", client.userID)
            client.Close()
            metrics.ConnectionDisconnectedDueToBuffer.Inc()
        }

    case StrategySlowDown:
        // 给100毫秒的缓冲时间
        timer := time.NewTimer(100 * time.Millisecond)
        defer timer.Stop()
        select {
        case client.send <- data:
            // 成功投递
        case <-timer.C:
            // 超时丢弃
            metrics.MessageDropped.Inc()
        case <-client.close:
            // 连接已关闭
            return
        }
    }
}
```

怕浪猫在实际业务中的策略分配是这样的：行情类消息（股票价格、赛事比分）用Drop策略，因为最新价格会覆盖旧价格，丢几条中间值完全无所谓。IM类消息（聊天、系统通知）用Disconnect策略，因为聊天消息不能丢，客户端重连后服务端会补发离线消息。活动通知类消息（运营推送、活动提醒）用SlowDown策略，这类消息不是特别紧急但也不应该丢。

> 背压不是性能问题，是业务问题。脱离业务场景谈背压策略，都是耍流氓。先搞清楚你的消息能不能丢、能延迟多久，再选策略。

### 2.4 消息可靠性保障

Redis Pub/Sub有一个天然的缺陷：消息不持久化。如果某个Gateway节点在消息发布时刚好重启，那这个节点上的所有连接都会错过这条消息。客户端重连后也无法补发，因为消息已经从Pub/Sub频道中消失了。

要解决这个问题，需要引入消息确认和补偿机制。核心思路是：消息发送前先持久化存储，客户端收到后返回确认，未确认的消息在重连时补发。

```go
// ReliableMessageBus 可靠消息总线
// 在Pub/Sub基础上增加消息持久化和ACK机制
type ReliableMessageBus struct {
    redisClient *redis.Client
    nodeID      string

    // 消息TTL：超过这个时间未确认的消息会被清理
    // 建议设为24小时，覆盖客户端最长离线时间
    msgTTL time.Duration
}

// PublishReliable 发布可靠消息
// 消息会先持久化到Redis，再通过Pub/Sub广播
func (rmb *ReliableMessageBus) PublishReliable(
    ctx context.Context,
    msg PushMessage,
) error {
    payload, _ := json.Marshal(msg)

    // 使用Pipeline批量执行Redis命令，减少网络往返
    pipe := rmb.redisClient.Pipeline()

    // 1. 写入消息存储（Redis String，设置TTL）
    storeKey := "ws:msg:store:" + msg.MessageID
    pipe.Set(ctx, storeKey, payload, rmb.msgTTL)

    // 2. 写入用户的待投递队列（Redis List）
    // 客户端重连时会从这个队列获取未投递的消息
    if msg.TargetType == "user" {
        pendingKey := "ws:msg:pending:" + msg.TargetID
        pipe.LPush(ctx, pendingKey, msg.MessageID)
        pipe.Expire(ctx, pendingKey, rmb.msgTTL)
    }

    // 3. 通过Pub/Sub广播给所有Gateway节点
    pipe.Publish(ctx, channelName, payload)

    _, err := pipe.Exec(ctx)
    return err
}

// AckMessage 消息投递确认
// 客户端收到消息后返回ACK，服务端从待投递队列中移除
func (rmb *ReliableMessageBus) AckMessage(
    ctx context.Context,
    userID string,
    messageID string,
) error {
    pendingKey := "ws:msg:pending:" + userID
    storeKey := "ws:msg:store:" + messageID

    pipe := rmb.redisClient.Pipeline()
    // 从待投递队列中移除
    pipe.LRem(ctx, pendingKey, 1, messageID)
    // 删除消息存储
    pipe.Del(ctx, storeKey)
    _, err := pipe.Exec(ctx)
    return err
}

// GetPendingMessages 获取未投递的消息
// 客户端重连后调用此方法获取离线期间的消息
func (rmb *ReliableMessageBus) GetPendingMessages(
    ctx context.Context,
    userID string,
) ([]PushMessage, error) {
    pendingKey := "ws:msg:pending:" + userID

    // 获取待投递消息ID列表
    // 注意：LPUSH是左插，所以索引0是最新的消息
    // 为了按时间顺序补发，需要反转
    msgIDs, err := rmb.redisClient.LRange(ctx, pendingKey, 0, -1).Result()
    if err != nil {
        return nil, err
    }

    messages := make([]PushMessage, 0, len(msgIDs))
    // 反转使消息按发送顺序排列
    for i := len(msgIDs) - 1; i >= 0; i-- {
        id := msgIDs[i]
        storeKey := "ws:msg:store:" + id
        data, err := rmb.redisClient.Get(ctx, storeKey).Bytes()
        if err == redis.Nil {
            // 消息已过期，清理pending记录
            rmb.redisClient.LRem(ctx, pendingKey, 1, id)
            continue
        }
        if err != nil {
            continue
        }
        var msg PushMessage
        if json.Unmarshal(data, &msg) == nil {
            messages = append(messages, msg)
        }
    }
    return messages, nil
}
```

这个方案的完整流程是这样的。发送时，消息先写入Redis持久化存储，再加入用户的待投递队列，最后通过Pub/Sub广播给所有Gateway节点。正常情况下，Gateway收到Pub/Sub消息后立即投递给客户端，客户端返回ACK，服务端清除消息存储和待投递记录。

如果客户端离线或网络中断，消息会留在待投递队列中。客户端重连后，Gateway先查询待投递队列，把离线期间的消息按顺序补发。补发完成后客户端逐一ACK，服务端清理记录。

这个方案的代价是每次消息发送都需要多次Redis写入，吞吐量会比纯Pub/Sub降低约百分之三十到四十。所以只对真正需要可靠性保障的消息开启，不要对所有消息都走可靠通道。

> 可靠性的代价是复杂度。如果你每条消息都需要这种级别的保障，可能消息队列比Pub/Sub更适合你。技术方案的奢侈程度应该和业务需求匹配，杀鸡不用牛刀，但杀牛也不能用指甲刀。

## 三、连接一致性保障

### 3.1 什么是一致性问题

分布式WebSocket最棘手的问题不是性能，而是一致性。性能不够可以加机器，但一致性问题如果没解决，加再多机器也白搭。怕浪猫在实际生产中遇到过三个经典的一致性问题，每一个都让我印象深刻。

第一个是重复连接问题。用户在手机上打开了App，又在电脑上打开了Web端，同一个userID有两个甚至多个连接同时存在。消息该推给谁？都推？推最新的？这需要业务层面定义清楚连接策略。有些业务允许多端同时在线（比如微信可以手机和电脑同时登录），有些业务只允许单端在线（比如某些银行App）。

第二个是重连竞态问题。网络抖动导致连接断开，客户端立即重连。新连接建立了路由，但旧连接的断开事件还没处理完，UnregisterConnection把新路由也删了。用户表现就是"突然收不到消息了"，查路由表发现路由不存在，但连接明明还在。这种问题排查起来极其痛苦，因为等你查的时候路由已经被删了，你不知道是哪个时序导致了删除。

第三个是消息乱序问题。用户发了两条消息A和B，经过不同的路径投递，B先于A到达。客户端收到的是BA而不是AB。对于非关键消息这可能无所谓，但对于有顺序要求的消息（比如交易指令）就可能导致严重问题。

> 分布式的Bug不像单机Bug那样容易复现，它往往是多个时序交错产生的。排查这类问题的能力，是高级工程师的分水岭。你能从一堆日志中还原出完整的时序图，就说明你已经具备了分布式系统的调试直觉。

### 3.2 连接版本号机制

为了解决重连竞态问题，怕浪猫引入了连接版本号机制。每次建立新连接时生成一个递增的版本号，注销连接时只有版本号匹配才执行删除。这样即使旧连接的断开事件晚到，也不会误删新连接的路由。

```go
// ConnectionManager 连接管理器
// 带版本号的连接管理，解决重连竞态问题
type ConnectionManager struct {
    nodeID       string
    registry     *ConnectionRegistry
    redisClient  *redis.Client

    // 本地连接表：userID -> *ClientConnV2
    connections  sync.Map

    // 连接版本号：userID -> int64
    // 版本号使用纳秒级时间戳，保证递增
    versions     sync.Map
}

// ClientConnV2 带版本号的客户端连接
type ClientConnV2 struct {
    userID    string
    version   int64       // 连接版本号
    conn      *websocket.Conn
    send      chan []byte
    close     chan struct{}
    closeOnce sync.Once
}

// RegisterConnection 注册新连接
// 核心逻辑：检查是否有旧连接，如果旧连接版本号更高则拒绝新连接
func (cm *ConnectionManager) RegisterConnection(
    ctx context.Context,
    userID string,
    conn *websocket.Conn,
) (*ClientConnV2, error) {
    // 生成新的版本号
    // 使用纳秒时间戳，冲突概率几乎为零
    version := time.Now().UnixNano()

    client := &ClientConnV2{
        userID:  userID,
        version: version,
        conn:    conn,
        send:    make(chan []byte, sendBufferSize),
        close:   make(chan struct{}),
    }

    // 检查是否已有旧连接
    if oldVal, ok := cm.connections.Load(userID); ok {
        oldClient := oldVal.(*ClientConnV2)
        if oldClient.version > version {
            // 已有更新的连接存在，拒绝当前连接
            // 这种情况理论上不会发生（纳秒时间戳），但作为兜底
            conn.Close()
            return nil, ErrNewerConnectionExists
        }
        // 关闭旧连接，但不删除旧路由
        // 路由由新连接的注册来覆盖
        oldClient.Close()
    }

    // 存储新连接
    cm.connections.Store(userID, client)
    cm.versions.Store(userID, version)

    // 注册到Redis路由表（带版本号）
    // 格式：nodeID:version
    routeKey := fmt.Sprintf("ws:route:%s", userID)
    pipe := cm.redisClient.Pipeline()
    pipe.Set(ctx, routeKey, fmt.Sprintf("%s:%d", cm.nodeID, version), 30*time.Second)
    nodeKey := fmt.Sprintf("ws:node:%s:users", cm.nodeID)
    pipe.SAdd(ctx, nodeKey, userID)
    pipe.Expire(ctx, nodeKey, 30*time.Second)
    _, err := pipe.Exec(ctx)
    if err != nil {
        // 注册失败，回滚本地状态
        cm.connections.Delete(userID)
        cm.versions.Delete(userID)
        conn.Close()
        return nil, err
    }

    return client, nil
}

// UnregisterConnection 注销连接
// 关键：只有版本号匹配时才执行删除
func (cm *ConnectionManager) UnregisterConnection(
    ctx context.Context,
    userID string,
    version int64,
) {
    // 检查本地版本号
    if val, ok := cm.versions.Load(userID); ok {
        currentVersion := val.(int64)
        if currentVersion != version {
            // 版本号不匹配，说明已有更新的连接
            // 当前注销的是旧连接，不处理
            return
        }
    }

    // 删除本地连接和版本号
    cm.connections.Delete(userID)
    cm.versions.Delete(userID)

    // 删除Redis路由
    // 使用Lua脚本保证"读取-比较-删除"的原子性
    // 如果不用Lua脚本，读和删之间可能有其他操作插入
    routeKey := fmt.Sprintf("ws:route:%s", userID)
    luaScript := `
        local current = redis.call('GET', KEYS[1])
        if not current then
            return 0
        end
        local node, ver = string.match(current, '([^:]+):(%d+)')
        if ver and tonumber(ver) == tonumber(ARGV[1]) then
            redis.call('DEL', KEYS[1])
            return 1
        end
        return 0
    `
    cm.redisClient.Eval(ctx, luaScript, []string{routeKey}, version)
}
```

版本号用纳秒级时间戳，基本上不可能冲突。核心逻辑就一句话：只有版本号匹配时才能删除路由。这样即使旧连接的断开事件晚到，也不会误删新连接的路由。

为什么需要Lua脚本？因为"读取路由值、比较版本号、删除路由"这三步必须是原子操作。如果分开执行，在读取和删除之间可能有其他操作插入（比如新连接恰好在这时注册），导致删除了刚注册的新路由。Redis的Lua脚本在执行期间是单线程串行的，不会被其他命令打断，因此能保证原子性。

> 版本号是分布式系统里最朴素也最有效的武器。它不会让竞态消失，但能让竞态变得可控。乐观锁的精髓就在于此：不阻塞，但检测冲突。

### 3.3 消息顺序保障

消息乱序的本质是消息经过了不同的路径投递，不同路径的延迟不同导致到达顺序不一致。解决这个问题有两种思路，可以单独使用也可以组合使用。

第一种思路是统一入口。所有消息都通过同一个消息队列投递，利用MQ的分区有序性保证同一用户的消息按序到达。具体实现是给每个用户分配一个独立的消息处理goroutine，消息按顺序进入这个goroutine的队列，由它逐一处理。

```go
// OrderedMessageBus 有序消息总线
// 为每个用户分配独立的消息处理goroutine
type OrderedMessageBus struct {
    redisClient *redis.Client
    nodeID      string
    gateway     *Gateway

    // 每个用户的消息队列
    // 使用sync.Map存储，避免锁竞争
    userQueues sync.Map // userID -> chan *PushMessage
}

// GetUserQueue 获取用户的消息队列
// 如果队列不存在则创建，并启动处理goroutine
func (omb *OrderedMessageBus) GetUserQueue(userID string) chan *PushMessage {
    val, loaded := omb.userQueues.LoadOrStore(userID, make(chan *PushMessage, 512))
    ch := val.(chan *PushMessage)

    if !loaded {
        // 新建了队列，启动处理goroutine
        go omb.processUserQueue(userID, ch)
    }

    return ch
}

// processUserQueue 处理用户消息队列
// 单goroutine处理，保证消息按序投递
func (omb *OrderedMessageBus) processUserQueue(
    userID string,
    ch chan *PushMessage,
) {
    for msg := range ch {
        // 按顺序处理每条消息
        omb.deliver(userID, msg)
    }
    // 队列关闭，清理资源
    omb.userQueues.Delete(userID)
}

// deliver 投递消息到本地连接
func (omb *OrderedMessageBus) deliver(userID string, msg *PushMessage) {
    if val, ok := omb.gateway.connections.Load(userID); ok {
        client := val.(*ClientConn)
        data, _ := json.Marshal(msg)
        select {
        case client.send <- data:
            // 成功投递
        default:
            log.Printf("deliver failed, buffer full, user=%s, msg=%s",
                userID, msg.MessageID)
        }
    }
}

// Push 推送消息到用户队列
// 所有消息都经过这个方法，保证顺序
func (omb *OrderedMessageBus) Push(userID string, msg *PushMessage) {
    ch := omb.GetUserQueue(userID)
    select {
    case ch <- msg:
        // 成功入队
    default:
        // 队列满了，说明消费者处理太慢
        log.Printf("user queue full, user=%s, msg=%s", userID, msg.MessageID)
    }
}
```

这种方案的优点是服务端保证投递顺序，客户端不需要做额外处理。缺点是每个用户需要一个独立的goroutine，在用户数很多时goroutine数量会增加。不过Go的goroutine非常轻量，十万个goroutine的内存开销大约在两三百兆，是可以接受的。

第二种思路是序列号加客户端重排。服务端给每个用户的消息分配递增序列号，客户端收到后按序列号排序后再交给业务层处理。

```go
// SequenceManager 序列号管理器
// 使用Redis INCR保证序列号递增
type SequenceManager struct {
    redisClient *redis.Client
}

// NextSeq 获取用户的消息序列号
// Redis INCR是原子操作，保证序列号严格递增
func (sm *SequenceManager) NextSeq(ctx context.Context, userID string) (int64, error) {
    key := fmt.Sprintf("ws:seq:%s", userID)
    return sm.redisClient.Incr(ctx, key).Result()
}

// SequencedMessage 带序列号的消息
type SequencedMessage struct {
    Seq   int64           `json:"seq"`
    Event string          `json:"event"`
    Data  json.RawMessage `json:"data"`
}
```

客户端侧需要实现一个消息重排器，收到消息后根据序列号判断是否按序到达：

```javascript
// 客户端消息重排器
class MessageReorderer {
    constructor() {
        this.expectedSeq = 1;     // 期望收到的下一个序列号
        this.buffer = new Map();   // 缓存乱序到达的消息
        this.maxBufferSize = 1000; // 缓冲区上限
    }

    onMessage(msg) {
        if (msg.seq === this.expectedSeq) {
            // 期望的消息到了，直接处理
            this.dispatch(msg);
            this.expectedSeq++;

            // 检查缓冲区中是否有后续消息可以处理
            while (this.buffer.has(this.expectedSeq)) {
                this.dispatch(this.buffer.get(this.expectedSeq));
                this.buffer.delete(this.expectedSeq);
                this.expectedSeq++;
            }
        } else if (msg.seq > this.expectedSeq) {
            // 乱序到达，先缓存
            this.buffer.set(msg.seq, msg);

            // 缓冲区满了，可能是前面的消息丢了
            // 触发重传请求或直接跳过
            if (this.buffer.size > this.maxBufferSize) {
                const minSeq = Math.min(...this.buffer.keys());
                // 跳过缺失的序列号
                this.expectedSeq = minSeq;
                // 处理缓冲区中可以处理的
                while (this.buffer.has(this.expectedSeq)) {
                    this.dispatch(this.buffer.get(this.expectedSeq));
                    this.buffer.delete(this.expectedSeq);
                    this.expectedSeq++;
                }
            }
        }
        // msg.seq < expectedSeq 说明是重复消息，直接丢弃
    }

    dispatch(msg) {
        // 将消息交给业务层处理
        if (this.onDispatch) {
            this.onDispatch(msg);
        }
    }
}
```

怕浪猫最终选择的是两种思路的组合：服务端用单goroutine保证投递顺序，同时给消息加序列号做兜底。两层保障，虽然有一定的性能损耗，但在金融场景下这个代价是值得的。如果你的业务对顺序要求不高（比如聊天消息偶尔乱序也无所谓），只用第一层就够了。

> 顺序性保障的尽头不是技术，而是业务容忍度。搞清楚业务能接受什么程度的乱序，再决定投入多少技术成本。过度设计和设计不足一样有害，区别只是前者浪费的是钱，后者浪费的是命。

## 四、集群扩缩容方案

### 4.1 扩容流程

扩容相对简单，基本流程是：新节点启动后注册到服务发现，SLB健康检查通过后开始接收新连接。但有两个问题需要特别注意。

第一是新节点预热。直接把新节点加入负载均衡并设置满权重，大量连接可能同时涌入。新节点的JIT编译还没完成，连接池还没建立，缓存还是空的，大量连接同时建立会导致短时间内的性能抖动。建议逐步增加权重，比如初始权重设为百分之十，每三十秒增加百分之二十，直到百分之百。

第二是连接不迁移。扩容只承接新连接，已有连接保持不变。这是WebSocket和HTTP扩容最大的区别。HTTP请求是无状态的，每次请求都可能落到不同的节点。但WebSocket是长连接，连接建立后就一直挂在某个节点上，扩容不会改变已有连接的分布。

```go
// NodeScaler 节点扩缩容管理器
type NodeScaler struct {
    redisClient *redis.Client
    registry    *ConnectionRegistry
    gateway     *Gateway
    nodeID      string
}

// ScaleOut 扩容：新节点上线
func (ns *NodeScaler) ScaleOut(ctx context.Context) error {
    // 注册节点到服务发现
    nodeInfo := map[string]interface{}{
        "node_id":    ns.nodeID,
        "status":     "warming",  // warming -> active -> draining
        "weight":     10,         // 初始权重10%
        "max_conn":   100000,
        "cur_conn":   0,
        "updated_at": time.Now().Unix(),
    }
    nodeKey := fmt.Sprintf("ws:node:%s:info", ns.nodeID)
    infoBytes, _ := json.Marshal(nodeInfo)

    pipe := ns.redisClient.Pipeline()
    pipe.Set(ctx, nodeKey, infoBytes, 0)
    pipe.SAdd(ctx, "ws:nodes:all", ns.nodeID)
    pipe.SAdd(ctx, "ws:nodes:warming", ns.nodeID)
    _, err := pipe.Exec(ctx)
    if err != nil {
        return err
    }

    // 启动预热goroutine
    go ns.warmUp(ctx)

    return nil
}

// warmUp 预热：逐步增加权重
func (ns *NodeScaler) warmUp(ctx context.Context) {
    // 权重梯度：10% -> 30% -> 50% -> 70% -> 100%
    weights := []int{10, 30, 50, 70, 100}

    for i, w := range weights {
        ns.updateNodeStatus(ctx, "warming", w)
        log.Printf("[node:%s] warmup phase %d/%d, weight=%d%%",
            ns.nodeID, i+1, len(weights), w)

        if i < len(weights)-1 {
            select {
            case <-ctx.Done():
                return
            case <-time.After(30 * time.Second):
            }
        }
    }

    // 预热完成，转为active状态
    ns.updateNodeStatus(ctx, "active", 100)
    ns.redisClient.SRem(ctx, "ws:nodes:warming", ns.nodeID)
    ns.redisClient.SAdd(ctx, "ws:nodes:active", ns.nodeID)
    log.Printf("[node:%s] warmup complete, now active", ns.nodeID)
}

func (ns *NodeScaler) updateNodeStatus(
    ctx context.Context,
    status string,
    weight int,
) {
    nodeKey := fmt.Sprintf("ws:node:%s:info", ns.nodeID)
    info, _ := ns.redisClient.Get(ctx, nodeKey).Bytes()

    var nodeInfo map[string]interface{}
    json.Unmarshal(info, &nodeInfo)
    nodeInfo["status"] = status
    nodeInfo["weight"] = weight
    nodeInfo["updated_at"] = time.Now().Unix()

    infoBytes, _ := json.Marshal(nodeInfo)
    ns.redisClient.Set(ctx, nodeKey, infoBytes, 0)
}
```

> 扩容是做加法，风险可控。缩容是做减法，每一步都可能是事故的起点。对扩容可以乐观一些，对缩容必须悲观。

### 4.2 缩容流程：优雅下线

缩容比扩容复杂得多。你不能直接把节点踢掉，上面有几万个活着的连接，粗暴断开就是一次生产事故。用户正在视频通话、正在看直播、正在聊天，突然断线，客服电话能被打爆。

怕浪猫总结了一个缩容步骤清单，每一步都必须严格执行，不能跳过：

**WebSocket节点优雅下线清单**

- [ ] 步骤一：将节点状态标记为draining，停止接收新连接
- [ ] 步骤二：通知SLB健康检查失败，不再分发新连接
- [ ] 步骤三：等待五秒确保SLB路由表更新完成
- [ ] 步骤四：向节点上所有客户端发送redirect指令，引导重连到其他节点
- [ ] 步骤五：等待客户端逐步重连（设置超时时间，如五分钟）
- [ ] 步骤六：每隔五秒检查剩余连接数，记录迁移进度
- [ ] 步骤七：超时后仍有未断开的连接，发送Close帧主动断开
- [ ] 步骤八：清理Redis中的节点信息和路由记录
- [ ] 步骤九：确认连接数归零且Redis清理完成，安全关闭进程

```go
// ScaleIn 缩容：节点优雅下线
func (ns *NodeScaler) ScaleIn(ctx context.Context, timeout time.Duration) error {
    log.Printf("[node:%s] scale in started, timeout=%v", ns.nodeID, timeout)

    // 步骤一：标记为draining状态
    ns.updateNodeStatus(ctx, "draining", 0)
    ns.redisClient.SRem(ctx, "ws:nodes:active", ns.nodeID)
    ns.redisClient.SAdd(ctx, "ws:nodes:draining", ns.nodeID)

    // 步骤二：通知SLB健康检查失败
    // 这通常通过修改健康检查接口的返回值来实现
    // SLB检测到健康检查失败后，会停止分发新连接
    ns.gateway.SetHealthCheckFailed(true)

    // 步骤三：等待SLB路由表更新
    time.Sleep(5 * time.Second)

    // 步骤四：获取当前节点上所有用户
    nodeUsersKey := fmt.Sprintf("ws:node:%s:users", ns.nodeID)
    userIDs, err := ns.redisClient.SMembers(ctx, nodeUsersKey).Result()
    if err != nil {
        return err
    }
    log.Printf("[node:%s] users to migrate: %d", ns.nodeID, len(userIDs))

    // 选择目标节点（选择负载最低的active节点）
    targetNode, err := ns.selectTargetNode(ctx)
    if err != nil {
        return fmt.Errorf("no available target node: %w", err)
    }
    log.Printf("[node:%s] target node for migration: %s", ns.nodeID, targetNode)

    // 逐个通知客户端迁移
    redirectMsg, _ := json.Marshal(map[string]interface{}{
        "event": "redirect",
        "data": map[string]string{
            "reason": "node_draining",
            "target": targetNode,
        },
    })

    migrated := 0
    for _, userID := range userIDs {
        if val, ok := ns.gateway.connections.Load(userID); ok {
            client := val.(*ClientConn)
            select {
            case client.send <- redirectMsg:
                migrated++
            default:
                // 发送缓冲区满，直接关闭连接
                client.Close()
            }
        }
    }
    log.Printf("[node:%s] redirect sent to %d users", ns.nodeID, migrated)

    // 步骤五到六：等待连接逐步迁出
    deadline := time.Now().Add(timeout)
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-ticker.C:
            count := 0
            ns.gateway.connections.Range(func(_, _ any) bool {
                count++
                return true
            })
            log.Printf("[node:%s] remaining connections: %d", ns.nodeID, count)

            if count == 0 {
                // 所有连接已迁出
                log.Printf("[node:%s] all connections migrated", ns.nodeID)
                return ns.cleanup(ctx)
            }
            if time.Now().After(deadline) {
                // 超时，强制关闭剩余连接
                log.Printf("[node:%s] timeout, force closing %d connections",
                    ns.nodeID, count)
                ns.forceCloseAllConnections()
                return ns.cleanup(ctx)
            }
        }
    }
}

// selectTargetNode 选择目标节点
// 策略：选择连接数最少的active节点
func (ns *NodeScaler) selectTargetNode(ctx context.Context) (string, error) {
    nodes, err := ns.redisClient.SMembers(ctx, "ws:nodes:active").Result()
    if err != nil || len(nodes) == 0 {
        return "", fmt.Errorf("no active nodes available")
    }

    var targetNode string
    minConn := int64(1<<63 - 1)

    for _, nodeID := range nodes {
        nodeKey := fmt.Sprintf("ws:node:%s:users", nodeID)
        count, err := ns.redisClient.SCard(ctx, nodeKey).Result()
        if err != nil {
            continue
        }
        if count < minConn {
            minConn = count
            targetNode = nodeID
        }
    }

    if targetNode == "" {
        return "", fmt.Errorf("no suitable target node found")
    }
    return targetNode, nil
}

// cleanup 清理节点在Redis中的所有信息
func (ns *NodeScaler) cleanup(ctx context.Context) error {
    pipe := ns.redisClient.Pipeline()
    pipe.Del(ctx, fmt.Sprintf("ws:node:%s:info", ns.nodeID))
    pipe.Del(ctx, fmt.Sprintf("ws:node:%s:users", ns.nodeID))
    pipe.SRem(ctx, "ws:nodes:draining", ns.nodeID)
    pipe.SRem(ctx, "ws:nodes:all", ns.nodeID)
    _, err := pipe.Exec(ctx)
    log.Printf("[node:%s] cleanup done", ns.nodeID)
    return err
}

// forceCloseAllConnections 强制关闭所有连接
func (ns *NodeScaler) forceCloseAllConnections() {
    ns.gateway.connections.Range(func(_, val any) bool {
        client := val.(*ClientConn)
        client.Close()
        return true
    })
}
```

> 优雅下线的核心不是技术实现有多精妙，而是你愿不愿意花那五分钟等连接慢慢迁走。急躁是运维事故的第一大诱因。宁可多等两分钟，也不要在凌晨三点被电话叫起来处理故障。

### 4.3 自动扩缩容

手动扩缩容在流量规律的情况下够用了，但如果流量波动大（比如直播场景、突发事件），就需要自动扩缩容。核心思路是监控关键指标，触发阈值后自动执行扩缩容流程。

```go
// AutoScaler 自动扩缩容管理器
type AutoScaler struct {
    redisClient *redis.Client
    metrics     *MetricsCollector

    // 扩容阈值
    scaleOutCPUThreshold  float64 // CPU使用率阈值，如0.75
    scaleOutConnThreshold int     // 单节点连接数阈值，如80000

    // 缩容阈值
    scaleInCPUThreshold  float64 // CPU使用率阈值，如0.30
    scaleInConnThreshold int     // 单节点连接数阈值，如20000

    // 冷却时间，防止频繁扩缩容
    lastScaleOut time.Time
    lastScaleIn  time.Time
    cooldown     time.Duration // 建议至少5分钟
}

// NodeMetrics 节点指标
type NodeMetrics struct {
    NodeID    string
    CPUUsage  float64 // 0-1
    MemUsage  float64 // 0-1
    ConnCount int
    MsgRate   float64 // 消息吞吐量 msg/s
}

// Check 定期检查是否需要扩缩容
// 建议每30秒调用一次
func (as *AutoScaler) Check(ctx context.Context) {
    nodes, _ := as.redisClient.SMembers(ctx, "ws:nodes:active").Result()
    if len(nodes) == 0 {
        return
    }

    var totalConn int
    var avgCPU float64
    var overloadedNodes []string
    var underloadedNodes []string

    for _, nodeID := range nodes {
        m := as.metrics.GetNodeMetrics(nodeID)
        totalConn += m.ConnCount
        avgCPU += m.CPUUsage

        if m.CPUUsage > as.scaleOutCPUThreshold ||
            m.ConnCount > as.scaleOutConnThreshold {
            overloadedNodes = append(overloadedNodes, nodeID)
        }
        if m.CPUUsage < as.scaleInCPUThreshold &&
            m.ConnCount < as.scaleInConnThreshold {
            underloadedNodes = append(underloadedNodes, nodeID)
        }
    }
    avgCPU /= float64(len(nodes))

    // 扩容判断：有节点过载且冷却期已过
    if len(overloadedNodes) > 0 && time.Since(as.lastScaleOut) > as.cooldown {
        log.Printf("auto scale out triggered, overloaded: %v, avgCPU: %.2f",
            overloadedNodes, avgCPU)
        as.triggerScaleOut(ctx)
        as.lastScaleOut = time.Now()
    }

    // 缩容判断：有节点低负载且节点数大于2（至少保留2个节点）
    if len(underloadedNodes) > 0 && len(nodes) > 2 &&
        time.Since(as.lastScaleIn) > as.cooldown {
        log.Printf("auto scale in triggered, underloaded: %v", underloadedNodes)
        as.triggerScaleIn(ctx, underloadedNodes[0]) // 一次只缩一个
        as.lastScaleIn = time.Now()
    }
}
```

自动扩缩容最关键的不是代码实现，而是阈值的设定。设太灵敏会导致节点频繁创建销毁，云资源费用飙升；设太迟钝又会影响用户体验，用户已经感受到卡顿了还没扩容。怕浪猫建议先用历史数据做离线分析，找到合理的阈值，然后线上灰度验证。比如先把扩容阈值设得保守一些（CPU百分之八十五），观察一周后逐步下调。

## 五、性能优化与压测

### 5.1 Gateway性能优化清单

在压测之前，先过一遍性能优化清单。怕浪猫按照实际经验整理了以下优化点，分为四个维度：连接层、内存层、消息处理层和Redis层。每个优化点都标注了预期收益，方便你判断优先级。

**连接层优化**

调整读写缓冲区大小。gorilla/websocket默认的读写缓冲区是4096字节，如果你的消息平均大小在500字节以内，这个设置是够用的。但如果消息较大（比如包含图片base64），可以适当增大到8192或16384。注意缓冲区越大，每个连接的内存消耗越多。

合理设置最大消息大小限制。通过 `SetReadLimit` 限制单条消息大小，防止恶意客户端发送超大消息导致内存溢出。一般设为4096到8192字节就够了，大多数业务消息都在这个范围内。

优化心跳间隔。pingPeriod建议设为25秒，pongWait设为60秒。pingPeriod要小于pongWait，否则在Pong超时之前来不及发下一个Ping。心跳间隔太短会增加不必要的网络开销，太长会导致断连检测不及时。

启用TCP Keep-Alive。虽然WebSocket层有自己的心跳机制，但TCP Keep-Alive可以在更底层检测网络中断，作为兜底手段。

**内存优化**

使用sync.Pool复用消息缓冲区。WebSocket网关在高吞吐场景下会产生大量临时对象，GC压力很大。sync.Pool可以让对象在GC之间被复用，显著减少分配次数。

控制goroutine数量。每个连接两个goroutine是基准配置，十万连接就是二十万个goroutine。虽然Go的goroutine很轻量，但过多goroutine会增加调度器的负担和GC的扫描时间。

设置GOGC和GOMEMLIMIT。默认的GOGC是100，意味着堆增长一倍就触发GC。在高内存场景下可以适当调高（比如200），减少GC频率但增加单次GC时间。GOMEMLIMIT可以限制Go的内存使用上限，防止因内存无限增长而OOM。

**消息处理优化**

批量处理消息推送。如果有大量消息需要推给同一个用户，可以合并成一条消息发送，减少系统调用次数。

使用二进制协议替代JSON。JSON的序列化/反序列化性能比protobuf、msgpack等二进制协议差三到五倍。在性能敏感的场景下，换成二进制协议可以获得显著提升。

启用消息压缩。WebSocket支持permessage-deflate扩展，可以对消息内容进行压缩。在消息较大或带宽受限的场景下，压缩可以显著降低网络带宽使用，但会增加CPU开销。

**Redis优化**

使用Pipeline批量操作。多个Redis命令可以打包成Pipeline执行，减少网络往返延迟。

合理设置连接池大小。连接池太小会导致连接等待，太大会浪费Redis连接资源。一般设为CPU核心数的十到二十倍。

使用本地缓存减少Redis查询。路由表查询是高频操作，加一层本地缓存可以大幅降低Redis压力。TTL设为五秒，在一致性和性能之间取得平衡。

### 5.2 sync.Pool优化消息缓冲

```go
package gateway

import "sync"

// 消息缓冲区池
// 使用sync.Pool复用[]byte，减少GC压力
var msgPool = sync.Pool{
    New: func() interface{} {
        buf := make([]byte, 0, 512) // 初始容量512字节
        return &buf
    },
}

// AcquireBuffer 从池中获取缓冲区
func AcquireBuffer() *[]byte {
    return msgPool.Get().(*[]byte)
}

// ReleaseBuffer 归还缓冲区
// 注意：归还前要重置长度但保留容量
func ReleaseBuffer(buf *[]byte) {
    *buf = (*buf)[:0]
    msgPool.Put(buf)
}
```

> sync.Pool不是万能药，但在高频分配小对象的场景下，它的效果立竿见影。关键是搞清楚你的热点在哪，不要盲目地到处加Pool。

### 5.3 路由表本地缓存

每次推送消息都要查Redis路由表，在高并发下Redis会成为瓶颈。加一层本地缓存可以大幅降低Redis压力：

```go
// LocalRouteCache 本地路由缓存
// 在Gateway节点内存中缓存路由信息，减少Redis查询
type LocalRouteCache struct {
    localCache  sync.Map       // userID -> *cacheEntry
    redisClient *redis.Client
    ttl         time.Duration  // 缓存TTL
    hitCount    int64          // 命中次数
    missCount   int64          // 未命中次数
}

type cacheEntry struct {
    nodeID     string
    updateTime time.Time
}

// Get 获取用户所在节点
// 先查本地缓存，miss时回源Redis
func (lrc *LocalRouteCache) Get(
    ctx context.Context,
    userID string,
) (string, error) {
    // 第一层：查本地缓存
    if val, ok := lrc.localCache.Load(userID); ok {
        entry := val.(*cacheEntry)
        if time.Since(entry.updateTime) < lrc.ttl {
            atomic.AddInt64(&lrc.hitCount, 1)
            return entry.nodeID, nil
        }
        // 缓存过期，删除
        lrc.localCache.Delete(userID)
    }

    // 第二层：查Redis
    atomic.AddInt64(&lrc.missCount, 1)
    key := fmt.Sprintf("ws:route:%s", userID)
    nodeID, err := lrc.redisClient.Get(ctx, key).Result()
    if err != nil {
        return "", err
    }

    // 回填本地缓存
    lrc.localCache.Store(userID, &cacheEntry{
        nodeID:     nodeID,
        updateTime: time.Now(),
    })

    return nodeID, nil
}

// Invalidate 失效缓存
// 用户重连到其他节点时调用
func (lrc *LocalRouteCache) Invalidate(userID string) {
    lrc.localCache.Delete(userID)
}

// HitRate 返回缓存命中率
func (lrc *LocalRouteCache) HitRate() float64 {
    hit := atomic.LoadInt64(&lrc.hitCount)
    miss := atomic.LoadInt64(&lrc.missCount)
    total := hit + miss
    if total == 0 {
        return 0
    }
    return float64(hit) / float64(total)
}
```

缓存TTL设为五秒，这意味着用户迁移节点后最多有五秒的消息投递延迟（投递到旧节点后通过ACK机制重新路由）。结合前面的消息可靠性保障机制，这五秒的消息不会丢，只会在客户端重连后补发。实测缓存命中率可以达到百分之九十五以上，Redis查询量降低二十倍。

### 5.4 压测方案设计与实施

光做优化不压测，等于耍流氓。怕浪猫的压测方案分为三个层次，每个层次针对不同的性能维度。

第一层是连接数压测，目标是验证单节点最大连接数。用分布式压测工具模拟大量WebSocket连接建立，观察在连接数逐渐增加的过程中，CPU、内存、网络等资源的使用变化。重点关注连接建立成功率、连接建立延迟和资源消耗曲线。

第二层是消息吞吐压测，目标是验证消息推送的吞吐量和延迟。在保持大量连接的同时，以不同速率推送消息。重点关注消息投递延迟（P50/P90/P99）、消息丢弃率和Redis操作延迟。

第三层是混合场景压测，目标是模拟真实生产场景。连接建立和断开交替进行，同时有消息推送和心跳维持。这是最接近生产环境的压测方式。

```go
// 压测工具核心代码
package main

import (
    "fmt"
    "sync"
    "time"

    "github.com/gorilla/websocket"
)

// PressureTester 分布式压测工具
type PressureTester struct {
    targetAddr string
    conns      []*websocket.Conn
    wg         sync.WaitGroup
}

// ConnectBatch 批量建立连接
// count: 连接总数
// ratePerSec: 每秒建立连接数
func (pt *PressureTester) ConnectBatch(count int, ratePerSec int) error {
    interval := time.Second / time.Duration(ratePerSec)
    for i := 0; i < count; i++ {
        conn, _, err := websocket.DefaultDialer.Dial(
            fmt.Sprintf("ws://%s/ws?uid=test_user_%d", pt.targetAddr, i),
            nil,
        )
        if err != nil {
            return fmt.Errorf("connect failed at %d: %w", i, err)
        }
        pt.conns = append(pt.conns, conn)

        if i%1000 == 0 && i > 0 {
            fmt.Printf("connected: %d/%d\n", i, count)
        }
        time.Sleep(interval)
    }
    fmt.Printf("all connected: %d\n", len(pt.conns))
    return nil
}

// BroadcastTest 广播压测
// 在所有连接上以指定速率发送消息
func (pt *PressureTester) BroadcastTest(
    duration time.Duration,
    ratePerSec int,
) {
    interval := time.Second / time.Duration(ratePerSec)
    end := time.Now().Add(duration)
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    msgCount := 0
    for {
        select {
        case <-ticker.C:
            idx := msgCount % len(pt.conns)
            pt.conns[idx].WriteMessage(
                websocket.TextMessage,
                []byte(fmt.Sprintf(`{"event":"test","data":{"n":%d}}`, msgCount)),
            )
            msgCount++
            if time.Now().After(end) {
                fmt.Printf("broadcast done, total: %d messages\n", msgCount)
                return
            }
        }
    }
}
```

### 5.5 压测指标与瓶颈分析

以下是一次典型压测的结果数据，测试环境是八核十六G单节点，操作系统为Ubuntu 22.04，Go版本1.21：

连接数五万，消息速率每秒十万条，持续十分钟。CPU平均使用率百分之六十八，峰值百分之八十五。内存使用二点一GB（含Go runtime）。网络入带宽四十五兆字节每秒，出带宽七十八兆字节每秒。消息平均延迟三点二毫秒，P99延迟十二毫秒。GC暂停平均零点八毫秒，最大三点二毫秒。goroutine数量十万零十二（五万连接乘以二加十二个系统goroutine）。

瓶颈分析发现，Redis操作耗时占总时间的百分之三十五，是最大的瓶颈。路由查询是主要开销，每次推送消息都要查Redis。加入本地缓存后，Redis操作耗时降至百分之十二，P99延迟从十二毫秒降到七毫秒。

JSON序列化耗时占百分之二十二。换用msgpack后降至百分之六，内存分配减少百分之四十。这个优化效果非常显著，强烈建议在性能瓶颈出现在序列化上时尝试。

网络IO耗时占百分之二十八。启用permessage-deflate压缩后，出带宽从七十八兆降到三十一兆，但CPU增加了百分之五。这是用CPU换带宽的经典权衡，在带宽受限的场景下非常值得。

GC耗时占百分之八。设置GOGC等于两百和GOMEMLIMIT等于十二GB后，GC暂停从平均零点八毫秒降到零点三毫秒。

```go
// 在main.go中设置GC参数
func init() {
    // GOGC控制触发GC的阈值
    // 默认100表示堆增长一倍触发GC
    // 设为200让堆增长两倍才触发，减少GC频率
    debug.SetGCPercent(200)

    // GOMEMLIMIT限制Go的内存使用上限
    // Go 1.19+支持
    // 防止内存无限增长导致OOM
    debug.SetMemoryLimit(12 * 1024 * 1024 * 1024)
}
```

> 压测的价值不在于得出一个漂亮的QPS数字，而在于找到下一个瓶颈在哪。优化是一个不断逼近物理极限的过程，每解决一个瓶颈就会暴露下一个，直到你触到硬件的天花板。

### 5.6 监控体系

没有监控的优化是盲目的。怕浪猫的WebSocket网关监控体系包含以下核心指标，分为四个维度：

连接指标：活跃连接数（按节点分）、连接变化速率、连接建立成功率、连接平均存活时间。

消息指标：发送消息总数和速率、接收消息总数和速率、消息丢弃数和速率、消息投递延迟分布（P50/P90/P99）。

系统指标：CPU使用率、内存使用量、goroutine数量、GC暂停时间。

Redis指标：操作QPS、操作延迟、错误率、连接池使用率。

```go
// MetricsCollector Prometheus指标采集器
type MetricsCollector struct {
    ActiveConnections prometheus.Gauge
    MessagesSent      prometheus.Counter
    MessagesDropped   prometheus.Counter
    MessageLatency    prometheus.Histogram
    GoroutineCount    prometheus.Gauge
    MemAllocBytes     prometheus.Gauge
    RedisOps          prometheus.Counter
    RedisLatency      prometheus.Histogram
}

func NewMetricsCollector() *MetricsCollector {
    mc := &MetricsCollector{
        ActiveConnections: prometheus.NewGauge(prometheus.GaugeOpts{
            Name: "ws_active_connections",
            Help: "Current active WebSocket connections",
        }),
        MessagesSent: prometheus.NewCounter(prometheus.CounterOpts{
            Name: "ws_messages_sent_total",
            Help: "Total messages sent to clients",
        }),
        MessagesDropped: prometheus.NewCounter(prometheus.CounterOpts{
            Name: "ws_messages_dropped_total",
            Help: "Total messages dropped due to buffer full",
        }),
        MessageLatency: prometheus.NewHistogram(prometheus.HistogramOpts{
            Name:    "ws_message_latency_seconds",
            Help:    "Message delivery latency in seconds",
            Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0},
        }),
        GoroutineCount: prometheus.NewGauge(prometheus.GaugeOpts{
            Name: "ws_goroutine_count",
            Help: "Number of goroutines",
        }),
        MemAllocBytes: prometheus.NewGauge(prometheus.GaugeOpts{
            Name: "ws_mem_alloc_bytes",
            Help: "Memory allocated in bytes",
        }),
    }

    prometheus.MustRegister(
        mc.ActiveConnections,
        mc.MessagesSent,
        mc.MessagesDropped,
        mc.MessageLatency,
        mc.GoroutineCount,
        mc.MemAllocBytes,
    )

    return mc
}

// updateMetrics 定期更新系统指标
// 建议每5秒执行一次
func (g *Gateway) updateMetrics() {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        // 统计活跃连接数
        count := 0
        g.connections.Range(func(_, _ any) bool {
            count++
            return true
        })
        g.metrics.ActiveConnections.Set(float64(count))

        // 更新goroutine数量
        g.metrics.GoroutineCount.Set(float64(runtime.NumGoroutine()))

        // 更新内存使用
        var m runtime.MemStats
        runtime.ReadMemStats(&m)
        g.metrics.MemAllocBytes.Set(float64(m.Alloc))
    }
}
```

Grafana面板的核心看板建议包含以下几项。连接总览面板：活跃连接数按节点分布的柱状图、连接变化速率的折线图。消息吞吐面板：发送和接收消息速率的折线图、消息丢弃率的告警线。延迟分布面板：P50/P90/P99延迟的折线图、延迟告警线。资源使用面板：CPU、内存、goroutine数量的仪表盘、GC暂停时间的柱状图。Redis健康面板：操作QPS和延迟的折线图、错误率的告警线。

> 监控不是成本，是保险。你可以在出事前花一万做监控，也可以在出事后花十万做复盘。选哪个，你自己掂量。每次故障复盘到最后，发现都是"如果有监控就能提前发现"，这种话听了几十遍了，但每次还是有人在同一个坑里摔。

## 六、完整集群部署架构总结

把前面所有内容串起来，怕浪猫给大家梳理一下完整的集群部署架构。

整体架构分为四层。最上层是SLB负载均衡器，做四层TCP负载均衡，负责把WebSocket连接请求分发到后端的Gateway节点。SLB需要配置健康检查，自动剔除不健康的节点。

第二层是Gateway集群，由多个Gateway节点组成。每个节点独立运行，维护本地连接表，处理连接生命周期。节点之间通过Redis Pub/Sub间接通信，没有直接的网络连接。节点启动时注册到Redis服务发现，预热完成后转为active状态。

第三层是Redis集群，承担多个职责。路由表存储用户到节点的映射关系，节点用户集合存储每个节点上的用户列表用于扩缩容，消息存储用于可靠消息的持久化，Pub/Sub用于跨节点消息广播。在更大规模的场景下，可以将不同职责拆分到不同的Redis实例，避免相互影响。

第四层是业务服务和消息队列。业务服务产生消息后通过消息总线发布，Kafka作为可选的持久化消息队列，用于重要消息的存储和回溯。

部署清单总结：SLB需要支持TCP模式和健康检查，建议用云厂商的负载均衡服务。Gateway集群的机器配置建议八核十六G起步，根据压测数据调整数量。Redis集群至少三主三从，独立部署，不要和业务服务共用。监控用Prometheus加Grafana，采集Gateway和Redis指标。日志用ELK或Loki，收集Gateway日志用于问题排查。

## 写在最后

这一章内容很多，怕浪猫把分布式WebSocket网关从零到一的完整过程都写在这里了。核心要点回顾一下。

路由表是整个分布式方案的基础。用户ID到节点ID的映射关系是消息正确投递的前提，TTL机制保证路由记录不会成为僵尸数据，版本号机制解决重连竞态问题。

背压策略要匹配业务场景。不同类型的消息对可靠性的要求不同，不能一刀切。行情消息可以丢，聊天消息不能丢，通知消息可以延迟。根据业务特征选择Drop、Disconnect或SlowDown策略。

消息可靠性保障需要付出代价。持久化存储、ACK确认、补发机制，每一层都有性能开销。只对真正需要可靠性保障的消息开启，不要对所有消息都走可靠通道。

缩容比扩容复杂得多。优雅下线的每一步都不能省，从标记draining到通知客户端迁移，再到超时强制断开，每一步都有时间窗口和容错机制。急躁是运维事故的第一大诱因。

压测驱动优化。没有压测数据的优化都是瞎猜。通过压测找到瓶颈，针对性优化，然后再压测验证效果。这是一个迭代的过程，没有一蹴而就的方案。

下一章是WebSocket网关系列的最后一篇，我们聊高可用方案和整体总结，包括异地多活、容灾切换、故障自愈等内容，以及整个WebSocket网关系列的全景总结。关注怕浪猫，追更不迷路。

---

如果这篇文章对你有帮助，点个收藏，以后用到的时候翻出来看。有什么问题或者踩过的坑，欢迎评论区交流，怕浪猫会逐条回复。

你在做WebSocket集群时遇到的最大挑战是什么？是连接管理、消息可靠性还是性能瓶颈？评论区聊聊，说不定你踩的坑怕浪猫也踩过。

系列进度：11/16

下一章预告：第12章 WebSocket网关高可用与总结。异地多活架构怎么设计、容灾切换策略怎么选择、故障自愈机制怎么实现，以及整个WebSocket网关系列从第一章到第十二章的全景回顾。怕浪猫把生产环境跑了三年的经验，最后一章一次性讲完。

怕浪猫说：分布式WebSocket的复杂性不在于写出能工作的代码，而在于写出在各种异常场景下仍然能工作的代码。网络抖动、节点宕机、Redis故障、消息洪峰，每一个异常都是一次考验。你能覆盖的异常场景越多，你的系统就越接近高可用这三个字。但记住，百分之百的可用性是不存在的，我们追求的是在有限的成本下，把不可用的时间压缩到业务可接受的范围内。做架构就像走钢丝，左边是过度设计带来的复杂度和成本，右边是设计不足带来的故障和损失。保持平衡，是工程师一辈子的修行。下章见。
