# 第十二章：分布式事务实践与实战项目

## 从一次线上事故说起

去年有个电商项目上线，大促当天订单量暴涨，运营兴冲冲跑过来说今天成交额破纪录了。结果财务对账时发现，库存扣了但订单没创建成功，或者订单创建了但账户余额没扣。一个下午的数据全乱了，整整花了三天时间修数据。

事后复盘，根因就一条：订单服务、库存服务、账户服务各自独立数据库，本地事务管不了跨库的数据一致性，而我们当时根本没有做分布式事务。

> 分布式事务不是可选项，而是微服务架构的必修课。你可以推迟学习，但线上事故不会推迟到来。

我是怕浪猫，一个在分布式踩坑路上摸爬滚打多年的Go开发者。这一章我们把分布式事务的核心方案全部过一遍，从本地消息表到事务消息，从TCC到Saga，最后手写一个简化版的事务协调器，并用一个完整的电商下单扣库存场景把所有方案串起来。

---

## 一、分布式事务为什么难

在单体架构里，一个数据库事务就能保证ACID。但微服务架构下，一个业务操作要跨多个服务、多个数据库，本地事务的ACID保证就失效了。

核心矛盾在于：

- **原子性跨不了库**：MySQL的XA事务性能太差，生产环境基本没人用
- **网络不可靠**：服务调用可能超时、失败、重复
- **CAP约束**：分区容错性在网络分区时必须保证，一致性和可用性只能选一个
- **BASE才是现实**：基本可用、软状态、最终一致性

所以分布式事务的实践中，我们追求的不是强一致性，而是**最终一致性**。常见的方案有以下几种：

| 方案 | 一致性 | 复杂度 | 适用场景 |
|------|--------|--------|----------|
| 本地消息表 | 最终一致 | 低 | 异步解耦场景 |
| 事务消息 | 最终一致 | 中 | 消息队列驱动场景 |
| TCC | 强一致 | 高 | 资金、库存等核心场景 |
| Saga | 最终一致 | 中 | 长流程业务编排 |

> 在分布式世界里，不存在银弹。每个方案都是在一致性、可用性、性能之间的权衡。

下面我们逐一深入实现。

---

## 二、本地消息表方案

### 2.1 方案设计思路

本地消息表的核心思想非常朴素：把业务操作和消息发送放在同一个本地事务里，要么都成功，要么都失败。消息表里的消息再通过定时任务异步投递给消费者。

整体流程是这样的：

1. 业务服务执行本地业务操作，同时在同一个事务中往本地消息表插入一条消息
2. 本地事务提交后，消息已经安全落库
3. 定时任务扫描消息表中未投递的消息，发送到MQ
4. 消费者消费消息，执行对应业务逻辑
5. 消费成功后回调通知，更新消息状态为已完成

> 把分布式问题降维成本地问题，是工程世界最实用的解题思路。

### 2.2 数据库表设计

先看消息表的结构设计：

```go
package model

import "time"

// LocalMessage 本地消息表模型
type LocalMessage struct {
    ID           int64     `json:"id" db:"id"`
    BusinessID   string    `json:"business_id" db:"business_id"`     // 业务ID，如订单号
    BusinessType string    `json:"business_type" db:"business_type"` // 业务类型，如 create_order
    Topic        string    `json:"topic" db:"topic"`                 // MQ主题
    Tag          string    `json:"tag" db:"tag"`                     // MQ标签
    Body         string    `json:"body" db:"body"`                   // 消息体JSON
    Status       int       `json:"status" db:"status"`               // 0-待发送 1-已发送 2-已完成 3-失败
    RetryCount   int       `json:"retry_count" db:"retry_count"`     // 重试次数
    MaxRetry     int       `json:"max_retry" db:"max_retry"`         // 最大重试次数
    NextRetryAt  time.Time `json:"next_retry_at" db:"next_retry_at"` // 下次重试时间
    CreatedAt    time.Time `json:"created_at" db:"created_at"`
    UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

const (
    MsgStatusPending   = 0 // 待发送
    MsgStatusSent      = 1 // 已发送
    MsgStatusCompleted = 2 // 已完成
    MsgStatusFailed    = 3 // 失败
)
```

建表SQL：

```sql
CREATE TABLE `local_message` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `business_id` VARCHAR(64) NOT NULL COMMENT '业务ID',
    `business_type` VARCHAR(32) NOT NULL COMMENT '业务类型',
    `topic` VARCHAR(64) NOT NULL COMMENT 'MQ主题',
    `tag` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'MQ标签',
    `body` TEXT NOT NULL COMMENT '消息体',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0-待发送 1-已发送 2-已完成 3-失败',
    `retry_count` INT NOT NULL DEFAULT 0 COMMENT '重试次数',
    `max_retry` INT NOT NULL DEFAULT 5 COMMENT '最大重试次数',
    `next_retry_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下次重试时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_status_retry` (`status`, `next_retry_at`),
    INDEX `idx_business` (`business_id`, `business_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本地消息表';
```

注意看索引设计：`idx_status_retry` 是给定时任务扫描用的，按状态和下次重试时间查询，避免全表扫描。

### 2.3 业务操作与消息写入的事务绑定

关键在于：业务操作和消息插入必须在同一个事务里。

```go
package service

import (
    "context"
    "database/sql"
    "encoding/json"
    "time"

    "yourproject/model"
    "yourproject/mq"
)

type OrderService struct {
    DB  *sql.DB
    MQ  mq.Producer
}

// CreateOrder 创建订单，同时写入本地消息表
func (s *OrderService) CreateOrder(ctx context.Context, req *CreateOrderReq) error {
    // 开启本地事务
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 1. 业务操作：创建订单
    order := &model.Order{
        OrderNo:   req.OrderNo,
        UserID:    req.UserID,
        ProductID: req.ProductID,
        Quantity:  req.Quantity,
        Amount:    req.Amount,
        Status:    model.OrderStatusCreated,
    }
    orderQuery := `INSERT INTO orders (order_no, user_id, product_id, quantity, amount, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, NOW())`
    result, err := tx.ExecContext(ctx, orderQuery,
        order.OrderNo, order.UserID, order.ProductID,
        order.Quantity, order.Amount, order.Status)
    if err != nil {
        return fmt.Errorf("create order failed: %w", err)
    }
    orderID, _ := result.LastInsertId()
    order.ID = orderID

    // 2. 构造消息体
    msgBody, err := json.Marshal(map[string]interface{}{
        "order_id":   order.ID,
        "order_no":   order.OrderNo,
        "user_id":    order.UserID,
        "product_id": order.ProductID,
        "quantity":   order.Quantity,
        "amount":     order.Amount,
    })
    if err != nil {
        return err
    }

    // 3. 在同一事务中写入本地消息表
    msgQuery := `INSERT INTO local_message (business_id, business_type, topic, tag, body, status, retry_count, max_retry, next_retry_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 0, 0, 5, NOW(), NOW(), NOW())`
    _, err = tx.ExecContext(ctx, msgQuery,
        order.OrderNo, "create_order", "order_topic", "create", string(msgBody))
    if err != nil {
        return fmt.Errorf("insert local message failed: %w", err)
    }

    // 4. 提交事务 —— 业务和消息要么都成功，要么都回滚
    return tx.Commit()
}
```

这就是本地消息表的核心：利用本地事务的ACID特性，把"业务操作"和"记录消息"绑定成一个原子操作。事务提交后，业务数据已落库，消息也安全地躺在了消息表里。

> 好的架构不是消灭问题，而是把问题转移到更容易解决的地方。本地消息表把"跨服务一致性"转移成了"本地事务+异步重试"。

### 2.4 消息投递与消费幂等性

消息投递通过定时任务扫描消息表，发送到MQ。这里有几个关键点要处理。

先看投递端：

```go
package service

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "log"
    "time"

    "yourproject/model"
    "yourproject/mq"
)

type MessageDispatcher struct {
    DB     *sql.DB
    MQ     mq.Producer
    BatchSize int
}

// DispatchPendingMessages 扫描待发送消息并投递
func (d *MessageDispatcher) DispatchPendingMessages(ctx context.Context) error {
    // 查询待发送的消息，批量取
    query := `SELECT id, business_id, business_type, topic, tag, body, retry_count, max_retry
              FROM local_message
              WHERE status = 0 AND next_retry_at <= NOW()
              ORDER BY id ASC
              LIMIT ?`

    rows, err := d.DB.QueryContext(ctx, query, d.BatchSize)
    if err != nil {
        return fmt.Errorf("query pending messages failed: %w", err)
    }
    defer rows.Close()

    var messages []model.LocalMessage
    for rows.Next() {
        var msg model.LocalMessage
        if err := rows.Scan(&msg.ID, &msg.BusinessID, &msg.BusinessType,
            &msg.Topic, &msg.Tag, &msg.Body, &msg.RetryCount, &msg.MaxRetry); err != nil {
            log.Printf("scan message failed: %v", err)
            continue
        }
        messages = append(messages, msg)
    }

    for _, msg := range messages {
        if err := d.dispatchOne(ctx, &msg); err != nil {
            log.Printf("dispatch message %d failed: %v", msg.ID, err)
        }
    }
    return nil
}

func (d *MessageDispatcher) dispatchOne(ctx context.Context, msg *model.LocalMessage) error {
    // 发送到MQ
    err := d.MQ.Send(ctx, msg.Topic, msg.Tag, []byte(msg.Body))
    if err != nil {
        // 发送失败，增加重试计数，更新下次重试时间（指数退避）
        return d.updateRetry(ctx, msg)
    }

    // 发送成功，更新状态为已发送
    _, err = d.DB.ExecContext(ctx,
        `UPDATE local_message SET status = 1, updated_at = NOW() WHERE id = ? AND status = 0`,
        msg.ID)
    return err
}

func (d *MessageDispatcher) updateRetry(ctx context.Context, msg *model.LocalMessage) error {
    msg.RetryCount++
    if msg.RetryCount >= msg.MaxRetry {
        // 超过最大重试次数，标记为失败
        _, err := d.DB.ExecContext(ctx,
            `UPDATE local_message SET status = 3, retry_count = ?, updated_at = NOW() WHERE id = ?`,
            msg.RetryCount, msg.ID)
        return err
    }

    // 指数退避：2^retryCount 秒
    delay := time.Duration(1<<uint(msg.RetryCount)) * time.Second
    nextRetry := time.Now().Add(delay)

    _, err := d.DB.ExecContext(ctx,
        `UPDATE local_message SET retry_count = ?, next_retry_at = ?, updated_at = NOW() WHERE id = ?`,
        msg.RetryCount, nextRetry, msg.ID)
    return err
}
```

再看消费端的幂等性处理。这是分布式事务中最容易被忽略的一环：消息可能被重复投递，消费端必须保证幂等。

```go
package consumer

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "log"
)

type OrderConsumer struct {
    DB *sql.DB
}

// ConsumeOrderMessage 消费订单消息，扣减库存
func (c *OrderConsumer) ConsumeOrderMessage(ctx context.Context, body []byte) error {
    var msg struct {
        OrderID   int64   `json:"order_id"`
        OrderNo   string  `json:"order_no"`
        UserID    int64   `json:"user_id"`
        ProductID int64   `json:"product_id"`
        Quantity  int     `json:"quantity"`
        Amount    float64 `json:"amount"`
    }
    if err := json.Unmarshal(body, &msg); err != nil {
        return fmt.Errorf("unmarshal failed: %w", err)
    }

    // 幂等性检查：查询是否已经处理过这个订单
    var exist int
    err := c.DB.QueryRowContext(ctx,
        `SELECT COUNT(1) FROM inventory_deduction WHERE order_no = ?`,
        msg.OrderNo).Scan(&exist)
    if err != nil {
        return err
    }
    if exist > 0 {
        log.Printf("order %s already processed, skip", msg.OrderNo)
        return nil // 已处理，直接返回成功（幂等）
    }

    // 执行业务：扣减库存
    tx, err := c.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 扣减库存
    _, err = tx.ExecContext(ctx,
        `UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND stock >= ?`,
        msg.Quantity, msg.ProductID, msg.Quantity)
    if err != nil {
        return fmt.Errorf("deduct inventory failed: %w", err)
    }

    // 记录扣减流水（用于幂等判断）
    _, err = tx.ExecContext(ctx,
        `INSERT INTO inventory_deduction (order_no, product_id, quantity, created_at) VALUES (?, ?, ?, NOW())`,
        msg.OrderNo, msg.ProductID, msg.Quantity)
    if err != nil {
        return fmt.Errorf("insert deduction record failed: %w", err)
    }

    return tx.Commit()
}
```

幂等性的实现有几种常见方案：

1. **唯一索引法**：利用数据库唯一索引（如 order_no）防止重复插入
2. **状态机法**：业务状态只能单向流转，重复请求发现状态已变更则跳过
3. **Token机制**：消费前获取token，处理完失效token
4. **去重表**：单独建一张已处理消息记录表

> 幂等不是可选项，是消费端的生存法则。在分布式世界里，"至少一次投递"是底线，重复消费是常态。

### 2.5 定时任务补偿机制

上面说的投递任务怎么跑起来？需要一个定时任务来驱动。在Go里可以用 `time.Ticker` 或者接入更复杂的调度框架。

```go
package scheduler

import (
    "context"
    "log"
    "time"

    "yourproject/service"
)

type MessageScheduler struct {
    Dispatcher *service.MessageDispatcher
    Interval   time.Duration
    stopCh     chan struct{}
}

func NewMessageScheduler(dispatcher *service.MessageDispatcher, interval time.Duration) *MessageScheduler {
    return &MessageScheduler{
        Dispatcher: dispatcher,
        Interval:   interval,
        stopCh:     make(chan struct{}),
    }
}

func (s *MessageScheduler) Start() {
    ticker := time.NewTicker(s.Interval)
    defer ticker.Stop()

    log.Printf("message scheduler started, interval: %v", s.Interval)

    for {
        select {
        case <-ticker.C:\n            ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
            if err := s.Dispatcher.DispatchPendingMessages(ctx); err != nil {
                log.Printf("dispatch messages failed: %v", err)
            }
            cancel()
        case <-s.stopCh:
            log.Println("message scheduler stopped")
            return
        }
    }
}

func (s *MessageScheduler) Stop() {
    close(s.stopCh)
}
```

但光有投递任务还不够。有些消息可能已经发送到MQ了，但消费端一直没消费成功，或者消费端消费成功了但回调通知丢失了。这些消息的状态会卡在"已发送"状态。需要一个补偿任务来处理这些"卡住"的消息。

```go
// CompensateStuckMessages 补偿长时间处于"已发送"状态的消息
func (d *MessageDispatcher) CompensateStuckMessages(ctx context.Context) error {
    // 查找已发送但超过5分钟未完成的消息
    query := `SELECT id, business_id, business_type, topic, tag, body, retry_count, max_retry
              FROM local_message
              WHERE status = 1 AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
              ORDER BY id ASC
              LIMIT ?`

    rows, err := d.DB.QueryContext(ctx, query, d.BatchSize)
    if err != nil {
        return err
    }
    defer rows.Close()

    for rows.Next() {
        var msg model.LocalMessage
        if err := rows.Scan(&msg.ID, &msg.BusinessID, &msg.BusinessType,
            &msg.Topic, &msg.Tag, &msg.Body, &msg.RetryCount, &msg.MaxRetry); err != nil {
            continue
        }

        // 重新发送消息
        if err := d.MQ.Send(ctx, msg.Topic, msg.Tag, []byte(msg.Body)); err != nil {
            log.Printf("compensate: resend message %d failed: %v", msg.ID, err)
            // 重置为待发送状态，让正常投递流程处理
            d.DB.ExecContext(ctx,
                `UPDATE local_message SET status = 0, retry_count = retry_count + 1, 
                 next_retry_at = DATE_ADD(NOW(), INTERVAL 60 SECOND),
                 updated_at = NOW() WHERE id = ?`, msg.ID)
        } else {
            // 重新发送成功，更新时间
            d.DB.ExecContext(ctx,
                `UPDATE local_message SET updated_at = NOW() WHERE id = ?`, msg.ID)
            log.Printf("compensate: message %d resent successfully", msg.ID)
        }
    }
    return nil
}
```

补偿机制的设计要点：

- 超时阈值要根据业务容忍度来定，不能太短（正常处理可能就慢），也不能太长（消息堆积）
- 补偿任务和正常投递任务要互斥，避免重复发送，可以用乐观锁（CAS更新status）
- 补偿次数要有上限，超过上限要告警，人工介入

> 分布式系统的可靠性不是靠一次成功保证的，而是靠反复重试和补偿兜底的。失败不可怕，可怕的是失败了没有兜底。

### 2.6 本地消息表方案的优缺点

优点很明显：

- 实现简单，不依赖额外组件
- 消息可靠性高，不丢消息
- 业务和消息在同一事务，不存在不一致窗口

缺点也要清楚：

- 业务和消息表耦合在同一个数据库，有性能影响
- 定时扫描有延迟，不是实时投递
- 消费端必须实现幂等

适用场景：对实时性要求不高、业务量中等的异步场景。

---

## 三、事务消息方案：RocketMQ事务消息

### 3.1 RocketMQ事务消息原理

本地消息表方案把消息存在自己的数据库里，需要自己维护投递和补偿。RocketMQ事务消息把这个能力内置了，它通过"半消息"机制实现了类似的效果，但不需要本地消息表。

事务消息的核心流程分为三个阶段：

**阶段一：发送半消息**

生产者先向Broker发送一条"半消息"，这条消息对消费者不可见。半消息发送成功后，生产者执行本地事务。

**阶段二：提交或回滚**

本地事务执行成功，向Broker发送Commit指令，半消息变为可消费消息。本地事务执行失败，发送Rollback指令，Broker删除半消息。

**阶段三：事务回查**

如果生产者发送Commit/Rollback后网络超时，Broker没收到确认，Broker会定期回查生产者："这个半消息的本地事务到底成功了没有？"生产者根据业务状态返回Commit或Rollback。

> 半消息是分布式事务消息的精妙之处：它用"先隐藏后确认"的方式，在消息中间件层面实现了事务的原子性。

### 3.2 半消息与回查机制详解

来看一下半消息在RocketMQ内部的存储机制。

半消息发送时，RocketMQ不会把消息直接放到目标Topic里，而是放到一个内部特殊Topic `RMQ_SYS_TRANS_HALF_TOPIC`。消费者订阅的是业务Topic，所以看不到半消息。

当Broker收到Commit指令时，把消息从半消息Topic移动到真正的业务Topic，消费者就能消费了。收到Rollback时，直接标记删除半消息。

事务回查是兜底机制。Broker默认每60秒检查一次半消息，对超过6秒未确认的半消息发起回查。回查时调用生产者的 `checkLocalTransaction` 方法，生产者需要查询本地业务状态，返回提交、回滚或未知。

回查机制的关键参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| transactionTimeout | 6秒 | 超过该时间未确认则触发回查 |
| transactionCheckMax | 15次 | 最大回查次数 |
| transactionCheckInterval | 60秒 | 回查间隔 |

超过最大回查次数仍未确认，Broker会默认Rollback该消息，并打印告警日志。

### 3.3 基于RocketMQ实现分布式事务

下面用Go实现一个完整的RocketMQ事务消息示例。Go生态中常用的是 rocketmq-client-go 这个库。

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "time"

    "github.com/apache/rocketmq-client-go/v2"
    "github.com/apache/rocketmq-client-go/v2/primitive"
    "github.com/apache/rocketmq-client-go/v2/producer"
)

// OrderMessage 订单消息体
type OrderMessage struct {
    OrderID   int64   `json:"order_id"`
    OrderNo   string  `json:"order_no"`
    UserID    int64   `json:"user_id"`
    ProductID int64   `json:"product_id"`
    Quantity  int     `json:"quantity"`
    Amount    float64 `json:"amount"`
}

// OrderTransactionListener 事务监听器
type OrderTransactionListener struct {
    orderService *OrderService
}

// ExecuteLocalTransaction 执行本地事务
// 半消息发送成功后，RocketMQ会回调这个方法
func (l *OrderTransactionListener) ExecuteLocalTransaction(msg *primitive.Message) primitive.LocalTransactionState {
    // 解析消息体
    var orderMsg OrderMessage
    if err := json.Unmarshal(msg.Body, &orderMsg); err != nil {
        log.Printf("unmarshal message failed: %v", err)
        return primitive.RollbackMessageState // 解析失败，回滚
    }

    // 执行本地事务：创建订单
    err := l.orderService.CreateOrderInDB(context.Background(), &orderMsg)
    if err != nil {
        log.Printf("execute local transaction failed: %v", err)
        return primitive.RollbackMessageState
    }

    // 本地事务成功，提交消息
    return primitive.CommitMessageState
}

// CheckLocalTransaction 事务回查
// Broker未收到确认时，回调这个方法检查本地事务状态
func (l *OrderTransactionListener) CheckLocalTransaction(msg *primitive.MessageExt) primitive.LocalTransactionState {
    var orderMsg OrderMessage
    if err := json.Unmarshal(msg.Body, &orderMsg); err != nil {
        return primitive.RollbackMessageState
    }

    // 查询本地订单是否创建成功
    order, err := l.orderService.GetOrderByNo(context.Background(), orderMsg.OrderNo)
    if err != nil {
        log.Printf("check local transaction query failed: %v", err)
        return primitive.UnknowState // 查询失败，稍后再查
    }

    if order != nil && order.Status >= OrderStatusCreated {
        // 订单存在，说明本地事务已成功，提交消息
        return primitive.CommitMessageState
    }

    // 订单不存在，说明本地事务未执行或失败，回滚
    return primitive.RollbackMessageState
}

// TransactionProducer 事务消息生产者
type TransactionProducer struct {
    Producer rocketmq.TransactionProducer
}

func NewTransactionProducer(namesrv string, orderService *OrderService) (*TransactionProducer, error) {
    listener := &OrderTransactionListener{orderService: orderService}

    p, err := rocketmq.NewTransactionProducer(
        listener,
        producer.WithNsResovler(primitive.NewPassthroughResolver([]string{namesrv})),
        producer.WithRetry(2),
    )
    if err != nil {
        return nil, err
    }

    if err := p.Start(); err != nil {
        return nil, err
    }

    return &TransactionProducer{Producer: p}, nil
}

// SendOrderTransactionMessage 发送订单事务消息
func (tp *TransactionProducer) SendOrderTransactionMessage(ctx context.Context, orderMsg *OrderMessage) error {
    body, err := json.Marshal(orderMsg)
    if err != nil {
        return err
    }

    msg := primitive.NewMessage("order_topic", body)
    msg.WithTag("create_order")
    msg.WithKeys([]string{orderMsg.OrderNo})

    // 发送事务消息
    result, err := tp.Producer.SendMessageInTransaction(ctx, msg)
    if err != nil {
        return fmt.Errorf("send transaction message failed: %w", err)
    }

    log.Printf("transaction message sent, msgID: %s, state: %s",
        result.MsgID, result.LocalTransactionState)
    return nil
}

func (tp *TransactionProducer) Shutdown() error {
    return tp.Producer.Shutdown()
}
```

消费端的实现和普通消息消费一样，RocketMQ已经保证了只有Commit的消息才会被消费到：

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"

    "github.com/apache/rocketmq-client-go/v2"
    "github.com/apache/rocketmq-client-go/v2/consumer"
    "github.com/apache/rocketmq-client-go/v2/primitive"
)

type InventoryConsumer struct {
    inventoryService *InventoryService
}

func (c *InventoryConsumer) Start(namesrv string) error {
    cs, err := rocketmq.NewPushConsumer(
        consumer.WithNsResovler(primitive.NewPassthroughResolver([]string{namesrv})),
        consumer.WithConsumerModel(consumer.Clustering),
        consumer.WithConsumeFromWhere(consumer.ConsumeFromLastOffset),
    )
    if err != nil {
        return err
    }

    // 订阅订单Topic
    err = cs.Subscribe("order_topic", consumer.MessageSelector{},
        func(ctx context.Context, msgs ...*primitive.MessageExt) (consumer.ConsumeResult, error) {
            for _, msg := range msgs {
                if err := c.handleMessage(msg); err != nil {
                    log.Printf("consume order message failed, msgID: %s, err: %v",
                        msg.MsgId, err)
                    return consumer.RetryLater, nil // 稍后重试
                }
            }
            return consumer.ConsumeSuccess, nil
        })
    if err != nil {
        return err
    }

    return cs.Start()
}

func (c *InventoryConsumer) handleMessage(msg *primitive.MessageExt) error {
    var orderMsg OrderMessage
    if err := json.Unmarshal(msg.Body, &orderMsg); err != nil {
        return fmt.Errorf("unmarshal failed: %w", err)
    }

    // 幂等检查
    if c.inventoryService.IsDeducted(context.Background(), orderMsg.OrderNo) {
        log.Printf("order %s already deducted, skip", orderMsg.OrderNo)
        return nil
    }

    // 执行库存扣减
    return c.inventoryService.DeductStock(context.Background(),
        orderMsg.OrderNo, orderMsg.ProductID, orderMsg.Quantity)
}
```

### 3.4 事务消息 vs 本地消息表

两种方案的对比：

| 维度 | 本地消息表 | 事务消息 |
|------|-----------|---------|
| 一致性保证 | 本地事务保证 | 半消息+回查保证 |
| 额外存储 | 业务库多一张表 | 无需额外表 |
| 实时性 | 定时扫描，有延迟 | 半消息提交后立即可消费 |
| 复杂度 | 低，纯业务代码 | 中，依赖MQ的事务能力 |
| MQ依赖 | 任意MQ | RocketMQ |
| 回查能力 | 需自己实现补偿 | MQ内置回查 |

> 选择方案时不要只看技术优劣，还要看团队技术栈和运维能力。RocketMQ事务消息虽然好，但你的团队得有运维RocketMQ的能力。

---

## 四、分布式事务框架设计

### 4.1 为什么要自己造轮子

市面上的分布式事务框架不少，Seata、DTM都是成熟方案。但在我自己的项目中，遇到的需求往往比通用框架更具体：

- 只需要TCC和Saga两种模式
- 需要极低的框架侵入性
- 需要自定义事务日志存储
- 需要灵活的超时和重试策略

所以决定自己造一个简化版的分布式事务框架，把核心思路讲清楚。

> 造轮子不是为了替代开源框架，而是为了理解原理。你只有亲手实现过，才能在用开源框架时知道它内部发生了什么。

### 4.2 事务协调器设计

事务协调器（Transaction Coordinator，TC）是分布式事务框架的核心。它负责：

1. 管理全局事务的生命周期（开始、提交、回滚）
2. 协调各分支事务的执行顺序
3. 记录事务日志，保证可恢复
4. 处理超时和重试

先定义核心数据模型：

```go
package dtm

import "time"

// GlobalTransaction 全局事务
type GlobalTransaction struct {
    XID         string           `json:"xid"`          // 全局事务ID
    Type        TransactionType  `json:"type"`         // 事务类型：TCC/Saga
    Status      TransactionStatus `json:"status"`      // 事务状态
    Branches    []BranchTransaction `json:"branches"`  // 分支事务
    Timeout     time.Duration    `json:"timeout"`      // 超时时间
    CreatedAt   time.Time        `json:"created_at"`
    UpdatedAt   time.Time        `json:"updated_at"`
}

// BranchTransaction 分支事务
type BranchTransaction struct {
    BranchID    string            `json:"branch_id"`     // 分支事务ID
    XID         string            `json:"xid"`           // 所属全局事务ID
    ServiceName string            `json:"service_name"`  // 服务名
    Action      string            `json:"action"`        // 操作标识
    Status      BranchStatus      `json:"status"`        // 分支状态
    TryURL      string            `json:"try_url"`       // Try阶段调用地址
    ConfirmURL  string            `json:"confirm_url"`   // Confirm阶段调用地址
    CancelURL   string            `json:"cancel_url"`    // Cancel阶段调用地址
    CompensateURL string          `json:"compensate_url"` // 补偿地址（Saga用）
    RequestData []byte            `json:"request_data"`  // 请求数据
    ResponseData []byte           `json:"response_data"` // 响应数据
    RetryCount  int               `json:"retry_count"`   // 重试次数
    CreatedAt   time.Time         `json:"created_at"`
    UpdatedAt   time.Time         `json:"updated_at"`
}

type TransactionType int

const (
    TypeTCC  TransactionType = 1
    TypeSaga TransactionType = 2
)

type TransactionStatus int

const (
    StatusBegin     TransactionStatus = 1 // 开始
    StatusCommitting TransactionStatus = 2 // 提交中
    StatusCommitted  TransactionStatus = 3 // 已提交
    StatusRollbacking TransactionStatus = 4 // 回滚中
    StatusRolledBack TransactionStatus = 5 // 已回滚
    StatusTimeout    TransactionStatus = 6 // 超时
)

type BranchStatus int

const (
    BranchStatusRegistered BranchStatus = 1 // 已注册
    BranchStatusTrying     BranchStatus = 2 // Try中（TCC）
    BranchStatusTried      BranchStatus = 3 // Try完成
    BranchStatusConfirmed  BranchStatus = 4 // 已确认
    BranchStatusCancelled  BranchStatus = 5 // 已取消
    BranchStatusFailed     BranchStatus = 6 // 失败
)
```

事务协调器的接口设计：

```go
package dtm

import (
    "context"
    "fmt"
    "log"
    "sync"
    "time"
)

// Coordinator 事务协调器
type Coordinator struct {
    storage     TransactionStorage  // 事务日志存储
    httpClient  HTTPClient          // HTTP客户端，调用分支事务
    retryConfig RetryConfig         // 重试配置
    mu          sync.RWMutex
    stopCh      chan struct{}
}

type RetryConfig struct {
    MaxRetryCount   int           // 最大重试次数
    RetryInterval   time.Duration // 重试间隔
    Timeout         time.Duration // 单次调用超时
}

func NewCoordinator(storage TransactionStorage, client HTTPClient, cfg RetryConfig) *Coordinator {
    return &Coordinator{
        storage:    storage,
        httpClient: client,
        retryConfig: cfg,
        stopCh:     make(chan struct{}),
    }
}

// Begin 开始全局事务
func (c *Coordinator) Begin(ctx context.Context, txType TransactionType, timeout time.Duration) (string, error) {
    xid := generateXID()
    tx := &GlobalTransaction{
        XID:       xid,
        Type:      txType,
        Status:    StatusBegin,
        Timeout:   timeout,
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }

    if err := c.storage.SaveGlobalTransaction(ctx, tx); err != nil {
        return "", fmt.Errorf("save global transaction failed: %w", err)
    }

    log.Printf("global transaction started, xid: %s, type: %d", xid, txType)
    return xid, nil
}

// RegisterBranch 注册分支事务
func (c *Coordinator) RegisterBranch(ctx context.Context, branch *BranchTransaction) error {
    branch.Status = BranchStatusRegistered
    branch.CreatedAt = time.Now()
    branch.UpdatedAt = time.Now()

    if err := c.storage.SaveBranchTransaction(ctx, branch); err != nil {
        return fmt.Errorf("save branch transaction failed: %w", err)
    }

    log.Printf("branch registered, xid: %s, branchID: %s, service: %s",
        branch.XID, branch.BranchID, branch.ServiceName)
    return nil
}

// Commit 提交全局事务
func (c *Coordinator) Commit(ctx context.Context, xid string) error {
    tx, err := c.storage.GetGlobalTransaction(ctx, xid)
    if err != nil {
        return fmt.Errorf("get global transaction failed: %w", err)
    }
    if tx.Status != StatusBegin {
        return fmt.Errorf("invalid transaction status: %d, expected: %d", tx.Status, StatusBegin)
    }

    // 更新状态为提交中
    tx.Status = StatusCommitting
    tx.UpdatedAt = time.Now()
    if err := c.storage.UpdateGlobalTransaction(ctx, tx); err != nil {
        return err
    }

    // 根据事务类型执行不同的提交逻辑
    switch tx.Type {
    case TypeTCC:
        return c.commitTCC(ctx, tx)
    case TypeSaga:
        return c.commitSaga(ctx, tx)
    default:
        return fmt.Errorf("unsupported transaction type: %d", tx.Type)
    }
}

// Rollback 回滚全局事务
func (c *Coordinator) Rollback(ctx context.Context, xid string) error {
    tx, err := c.storage.GetGlobalTransaction(ctx, xid)
    if err != nil {
        return err
    }

    tx.Status = StatusRollbacking
    tx.UpdatedAt = time.Now()
    if err := c.storage.UpdateGlobalTransaction(ctx, tx); err != nil {
        return err
    }

    switch tx.Type {
    case TypeTCC:
        return c.rollbackTCC(ctx, tx)
    case TypeSaga:
        return c.rollbackSaga(ctx, tx)
    default:
        return fmt.Errorf("unsupported transaction type: %d", tx.Type)
    }
}
```

### 4.3 事务日志存储

事务日志是分布式事务框架的生命线。协调器重启后要能根据日志恢复事务状态。我们定义一个存储接口，支持不同的后端实现。

```go
package dtm

import (
    "context"
    "database/sql"
    "fmt"
    "time"
)

// TransactionStorage 事务日志存储接口
type TransactionStorage interface {
    SaveGlobalTransaction(ctx context.Context, tx *GlobalTransaction) error
    GetGlobalTransaction(ctx context.Context, xid string) (*GlobalTransaction, error)
    UpdateGlobalTransaction(ctx context.Context, tx *GlobalTransaction) error
    SaveBranchTransaction(ctx context.Context, branch *BranchTransaction) error
    GetBranchTransactions(ctx context.Context, xid string) ([]*BranchTransaction, error)
    UpdateBranchTransaction(ctx context.Context, branch *BranchTransaction) error
    GetTimeoutTransactions(ctx context.Context, before time.Time, limit int) ([]*GlobalTransaction, error)
}

// MySQLStorage MySQL实现的事务日志存储
type MySQLStorage struct {
    DB *sql.DB
}

func NewMySQLStorage(db *sql.DB) *MySQLStorage {
    return &MySQLStorage{DB: db}
}

func (s *MySQLStorage) SaveGlobalTransaction(ctx context.Context, tx *GlobalTransaction) error {
    query := `INSERT INTO dtm_global_transaction (xid, type, status, timeout, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`
    _, err := s.DB.ExecContext(ctx, query,
        tx.XID, tx.Type, tx.Status, int64(tx.Timeout.Seconds()),
        tx.CreatedAt, tx.UpdatedAt)
    return err
}

func (s *MySQLStorage) GetGlobalTransaction(ctx context.Context, xid string) (*GlobalTransaction, error) {
    query := `SELECT xid, type, status, timeout, created_at, updated_at
              FROM dtm_global_transaction WHERE xid = ?`
    tx := &GlobalTransaction{}
    var timeoutSec int64
    err := s.DB.QueryRowContext(ctx, query, xid).Scan(
        &tx.XID, &tx.Type, &tx.Status, &timeoutSec,
        &tx.CreatedAt, &tx.UpdatedAt)
    if err != nil {
        return nil, err
    }
    tx.Timeout = time.Duration(timeoutSec) * time.Second

    // 加载分支事务
    branches, err := s.GetBranchTransactions(ctx, xid)
    if err != nil {
        return nil, err
    }
    tx.Branches = branches
    return tx, nil
}

func (s *MySQLStorage) UpdateGlobalTransaction(ctx context.Context, tx *GlobalTransaction) error {
    query := `UPDATE dtm_global_transaction SET status = ?, updated_at = ? WHERE xid = ?`
    _, err := s.DB.ExecContext(ctx, query, tx.Status, time.Now(), tx.XID)
    return err
}

func (s *MySQLStorage) SaveBranchTransaction(ctx context.Context, branch *BranchTransaction) error {
    query := `INSERT INTO dtm_branch_transaction 
              (branch_id, xid, service_name, action, status, try_url, confirm_url, cancel_url, 
               compensate_url, request_data, response_data, retry_count, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    _, err := s.DB.ExecContext(ctx, query,
        branch.BranchID, branch.XID, branch.ServiceName, branch.Action, branch.Status,
        branch.TryURL, branch.ConfirmURL, branch.CancelURL, branch.CompensateURL,
        branch.RequestData, branch.ResponseData, branch.RetryCount,
        branch.CreatedAt, branch.UpdatedAt)
    return err
}

func (s *MySQLStorage) GetBranchTransactions(ctx context.Context, xid string) ([]*BranchTransaction, error) {
    query := `SELECT branch_id, xid, service_name, action, status, try_url, confirm_url,
                     cancel_url, compensate_url, request_data, response_data, retry_count,
                     created_at, updated_at
              FROM dtm_branch_transaction WHERE xid = ? ORDER BY created_at ASC`
    rows, err := s.DB.QueryContext(ctx, query, xid)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var branches []*BranchTransaction
    for rows.Next() {
        b := &BranchTransaction{}
        if err := rows.Scan(&b.BranchID, &b.XID, &b.ServiceName, &b.Action, &b.Status,
            &b.TryURL, &b.ConfirmURL, &b.CancelURL, &b.CompensateURL,
            &b.RequestData, &b.ResponseData, &b.RetryCount,
            &b.CreatedAt, &b.UpdatedAt); err != nil {
            return nil, err
        }
        branches = append(branches, b)
    }
    return branches, nil
}

func (s *MySQLStorage) UpdateBranchTransaction(ctx context.Context, branch *BranchTransaction) error {
    query := `UPDATE dtm_branch_transaction SET status = ?, response_data = ?, retry_count = ?, 
              updated_at = ? WHERE branch_id = ?`
    _, err := s.DB.ExecContext(ctx, query,
        branch.Status, branch.ResponseData, branch.RetryCount,
        time.Now(), branch.BranchID)
    return err
}

func (s *MySQLStorage) GetTimeoutTransactions(ctx context.Context, before time.Time, limit int) ([]*GlobalTransaction, error) {
    query := `SELECT xid, type, status, timeout, created_at, updated_at
              FROM dtm_global_transaction
              WHERE status IN (?, ?) AND updated_at < ?
              ORDER BY updated_at ASC LIMIT ?`
    rows, err := s.DB.QueryContext(ctx, query,
        StatusBegin, StatusCommitting, before, limit)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var txs []*GlobalTransaction
    for rows.Next() {
        tx := &GlobalTransaction{}
        var timeoutSec int64
        if err := rows.Scan(&tx.XID, &tx.Type, &tx.Status, &timeoutSec,
            &tx.CreatedAt, &tx.UpdatedAt); err != nil {
            return nil, err
        }
        tx.Timeout = time.Duration(timeoutSec) * time.Second
        txs = append(txs, tx)
    }
    return txs, nil
}
```

> 事务日志是分布式事务的"黑匣子"。只要日志还在，事务状态就能恢复。日志丢了，一切免谈。

### 4.4 TCC模式的实现

TCC是Try-Confirm-Cancel的缩写，三个阶段：

- **Try**：预留资源（比如预扣库存、冻结金额）
- **Confirm**：确认操作（真正扣减）
- **Cancel**：取消预留（释放资源）

协调器实现TCC的提交和回滚逻辑：

```go
// commitTCC TCC模式提交：执行所有分支的Confirm
func (c *Coordinator) commitTCC(ctx context.Context, tx *GlobalTransaction) error {
    for _, branch := range tx.Branches {
        if branch.Status != BranchStatusTried {
            continue // 跳过非Try完成的分支
        }

        // 调用Confirm接口
        err := c.callWithRetry(ctx, branch.ConfirmURL, branch.RequestData, func(resp []byte) {
            branch.Status = BranchStatusConfirmed
            branch.ResponseData = resp
            branch.UpdatedAt = time.Now()
            _ = c.storage.UpdateBranchTransaction(ctx, branch)
        })

        if err != nil {
            log.Printf("TCC confirm failed, xid: %s, branchID: %s, err: %v",
                tx.XID, branch.BranchID, err)
            // Confirm失败需要重试，不能直接回滚
            // TCC的Confirm必须最终成功，否则数据不一致
            return fmt.Errorf("tcc confirm failed: %w", err)
        }

        log.Printf("TCC confirm success, xid: %s, branchID: %s", tx.XID, branch.BranchID)
    }

    // 所有分支Confirm成功，更新全局事务状态
    tx.Status = StatusCommitted
    tx.UpdatedAt = time.Now()
    return c.storage.UpdateGlobalTransaction(ctx, tx)
}

// rollbackTCC TCC模式回滚：执行所有已Try成功的分支的Cancel
func (c *Coordinator) rollbackTCC(ctx context.Context, tx *GlobalTransaction) error {
    // 逆序执行Cancel，保证后执行的分支先回滚
    for i := len(tx.Branches) - 1; i >= 0; i-- {
        branch := tx.Branches[i]
        if branch.Status != BranchStatusTried && branch.Status != BranchStatusFailed {
            continue
        }

        err := c.callWithRetry(ctx, branch.CancelURL, branch.RequestData, func(resp []byte) {
            branch.Status = BranchStatusCancelled
            branch.ResponseData = resp
            branch.UpdatedAt = time.Now()
            _ = c.storage.UpdateBranchTransaction(ctx, branch)
        })

        if err != nil {
            log.Printf("TCC cancel failed, xid: %s, branchID: %s, err: %v",
                tx.XID, branch.BranchID, err)
            return fmt.Errorf("tcc cancel failed: %w", err)
        }

        log.Printf("TCC cancel success, xid: %s, branchID: %s", tx.XID, branch.BranchID)
    }

    tx.Status = StatusRolledBack
    tx.UpdatedAt = time.Now()
    return c.storage.UpdateGlobalTransaction(ctx, tx)
}

// callWithRetry 带重试的HTTP调用
func (c *Coordinator) callWithRetry(ctx context.Context, url string, data []byte, onSuccess func([]byte)) error {
    var lastErr error
    for i := 0; i <= c.retryConfig.MaxRetryCount; i++ {
        if i > 0 {
            log.Printf("retry %d/%d, url: %s", i, c.retryConfig.MaxRetryCount, url)
            time.Sleep(c.retryConfig.RetryInterval)
        }

        callCtx, cancel := context.WithTimeout(ctx, c.retryConfig.Timeout)
        resp, err := c.httpClient.Post(callCtx, url, data)
        cancel()

        if err != nil {
            lastErr = err
            continue
        }

        if resp.StatusCode >= 200 && resp.StatusCode < 300 {
            onSuccess(resp.Body)
            return nil
        }

        lastErr = fmt.Errorf("http status: %d", resp.StatusCode)
        // 4xx错误通常重试也没用，直接返回
        if resp.StatusCode >= 400 && resp.StatusCode < 500 {
            return lastErr
        }
    }
    return lastErr
}
```

### 4.5 Saga模式的实现

Saga模式的思路不同于TCC。它没有预留阶段，而是直接执行正向操作，如果某一步失败，就反向执行已完成步骤的补偿操作。

```go
// commitSaga Saga模式提交：按顺序执行所有分支的正向操作
func (c *Coordinator) commitSaga(ctx context.Context, tx *GlobalTransaction) error {
    for i, branch := range tx.Branches {
        if branch.Status == BranchStatusConfirmed {
            continue // 已完成的跳过
        }

        // 调用正向操作
        err := c.callWithRetry(ctx, branch.TryURL, branch.RequestData, func(resp []byte) {
            branch.Status = BranchStatusConfirmed
            branch.ResponseData = resp
            branch.UpdatedAt = time.Now()
            _ = c.storage.UpdateBranchTransaction(ctx, branch)
        })

        if err != nil {
            log.Printf("Saga forward failed at step %d, xid: %s, branchID: %s, err: %v",
                i, tx.XID, branch.BranchID, err)

            // 正向操作失败，补偿已执行的分支
            if compErr := c.compensateSaga(ctx, tx, i); compErr != nil {
                log.Printf("Saga compensate failed, xid: %s, err: %v", tx.XID, compErr)
                return fmt.Errorf("saga forward failed: %v, compensate also failed: %v", err, compErr)
            }

            // 补偿完成，标记事务为已回滚
            tx.Status = StatusRolledBack
            tx.UpdatedAt = time.Now()
            _ = c.storage.UpdateGlobalTransaction(ctx, tx)
            return fmt.Errorf("saga forward failed at step %d: %w", i, err)
        }

        log.Printf("Saga forward success, xid: %s, step: %d, branchID: %s",
            tx.XID, i, branch.BranchID)
    }

    // 所有正向操作成功
    tx.Status = StatusCommitted
    tx.UpdatedAt = time.Now()
    return c.storage.UpdateGlobalTransaction(ctx, tx)
}

// compensateSaga Saga模式补偿：逆序执行已完成分支的补偿操作
func (c *Coordinator) compensateSaga(ctx context.Context, tx *GlobalTransaction, failedIndex int) error {
    // 逆序补偿failedIndex之前的所有已执行分支
    for i := failedIndex - 1; i >= 0; i-- {
        branch := tx.Branches[i]
        if branch.Status != BranchStatusConfirmed {
            continue
        }

        if len(branch.CompensateURL) == 0 {
            return fmt.Errorf("branch %s has no compensate url", branch.BranchID)
        }

        err := c.callWithRetry(ctx, branch.CompensateURL, branch.RequestData, func(resp []byte) {
            branch.Status = BranchStatusCancelled
            branch.ResponseData = resp
            branch.UpdatedAt = time.Now()
            _ = c.storage.UpdateBranchTransaction(ctx, branch)
        })

        if err != nil {
            return fmt.Errorf("compensate branch %s failed: %w", branch.BranchID, err)
        }

        log.Printf("Saga compensate success, xid: %s, step: %d, branchID: %s",
            tx.XID, i, branch.BranchID)
    }
    return nil
}
```

> TCC和Saga的本质区别：TCC是"先试探再确认"，Saga是"先执行再补偿"。前者更安全但成本高，后者更轻量但有补偿成本。

### 4.6 超时与回滚机制

协调器还需要一个后台任务来处理超时事务。一个事务如果长时间处于Begin或Committing状态，很可能是某个环节卡住了，需要超时回滚。

```go
// StartTimeoutChecker 启动超时检查器
func (c *Coordinator) StartTimeoutChecker(interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:\n            c.checkTimeouts(context.Background())\n        case <-c.stopCh:
            return
        }
    }
}

func (c *Coordinator) checkTimeouts(ctx context.Context) {
    // 查找超时事务（最后更新时间超过30分钟的事务）
    before := time.Now().Add(-30 * time.Minute)
    txs, err := c.storage.GetTimeoutTransactions(ctx, before, 100)
    if err != nil {
        log.Printf("query timeout transactions failed: %v", err)
        return
    }

    for _, tx := range txs {
        log.Printf("found timeout transaction, xid: %s, status: %d, updated_at: %v",
            tx.XID, tx.Status, tx.UpdatedAt)

        switch tx.Status {
        case StatusBegin:
            // Begin状态超时，直接回滚
            if err := c.Rollback(ctx, tx.XID); err != nil {
                log.Printf("timeout rollback failed, xid: %s, err: %v", tx.XID, err)
            }
        case StatusCommitting:
            // Committing状态超时，继续重试提交
            // 这种情况比较危险，可能是Confirm反复失败
            // 需要人工介入，这里只做告警
            log.Printf("ALERT: transaction stuck in committing, xid: %s, needs manual intervention", tx.XID)
        case StatusRollbacking:
            // 回滚中状态超时，继续重试回滚
            if err := c.continueRollback(ctx, tx); err != nil {
                log.Printf("timeout continue rollback failed, xid: %s, err: %v", tx.XID, err)
            }
        }
    }
}

func (c *Coordinator) continueRollback(ctx context.Context, tx *GlobalTransaction) error {
    switch tx.Type {
    case TypeTCC:
        return c.rollbackTCC(ctx, tx)
    case TypeSaga:
        return c.compensateSaga(ctx, tx, len(tx.Branches))
    }
    return nil
}

func (c *Coordinator) Stop() {
    close(c.stopCh)
}
```

### 4.7 HTTP客户端与工具函数

最后补上一些辅助函数的实现：

```go
package dtm

import (
    "context"
    "crypto/rand"
    "encoding/hex"
    "fmt"
    "net/http"
    "time"
)

// HTTPClient HTTP客户端接口
type HTTPClient interface {
    Post(ctx context.Context, url string, data []byte) (*HTTPResponse, error)
}

type HTTPResponse struct {
    StatusCode int
    Body       []byte
}

// DefaultHTTPClient 默认HTTP客户端实现
type DefaultHTTPClient struct {
    client *http.Client
}

func NewDefaultHTTPClient() *DefaultHTTPClient {
    return &DefaultHTTPClient{
        client: &http.Client{
            Timeout: 10 * time.Second,
        },
    }
}

func (c *DefaultHTTPClient) Post(ctx context.Context, url string, data []byte) (*HTTPResponse, error) {
    req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
    if err != nil {
        return nil, err
    }
    req.Header.Set("Content-Type", "application/json")

    resp, err := c.client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    return &HTTPResponse{
        StatusCode: resp.StatusCode,
        Body:       body,
    }, nil
}

// generateXID 生成全局事务ID
func generateXID() string {
    b := make([]byte, 16)
    rand.Read(b)
    return fmt.Sprintf("xid_%s_%d", hex.EncodeToString(b), time.Now().UnixNano())
}

// generateBranchID 生成分支事务ID
func generateBranchID(xid string, index int) string {
    return fmt.Sprintf("%s_b%d", xid, index)
}
```

> 框架设计的核心不是写多少代码，而是定义好清晰的接口和状态机。接口是契约，状态机是流程，这两样定好了，实现只是填空题。

---

## 五、实战项目：电商下单扣库存场景

前面把各个方案的原理和核心代码都讲清楚了，现在把它们串起来，做一个完整的电商下单扣库存场景。

### 5.1 业务场景描述

用户下单购买商品，涉及三个服务：

1. **订单服务**：创建订单
2. **库存服务**：扣减商品库存
3. **账户服务**：扣减用户余额

三个服务各自独立数据库，需要保证：要么三个操作都成功，要么都回滚。

我们用四种方案分别实现这个场景，方便对比。

### 5.2 项目结构设计

```
ecommerce-dtm/
├── cmd/
│   ├── coordinator/         # 事务协调器
│   ├── order-service/       # 订单服务
│   ├── inventory-service/   # 库存服务
│   └── account-service/     # 账户服务
├── internal/
│   ├── coordinator/         # 协调器实现
│   ├── tcc/                 # TCC模式实现
│   ├── saga/                # Saga模式实现
│   ├── localmsg/            # 本地消息表实现
│   └── txmsg/               # 事务消息实现
├── pkg/
│   ├── model/               # 数据模型
│   ├── storage/             # 存储层
│   └── httpclient/          # HTTP客户端
├── sql/
│   ├── order.sql            # 订单库建表
│   ├── inventory.sql        # 库存库建表
│   ├── account.sql          # 账户库建表
│   └── dtm.sql              # 事务日志库建表
├── go.mod
└── go.sum
```

### 5.3 数据库准备

```sql
-- order.sql 订单库
CREATE DATABASE IF NOT EXISTS `order_db` DEFAULT CHARSET utf8mb4;
USE `order_db`;

CREATE TABLE `orders` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `product_id` BIGINT NOT NULL COMMENT '商品ID',
    `quantity` INT NOT NULL COMMENT '购买数量',
    `amount` DECIMAL(10,2) NOT NULL COMMENT '订单金额',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0-待支付 1-已支付 2-已取消',
    `xid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '全局事务ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    INDEX `idx_xid` (`xid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 库存预扣表（TCC的Try阶段用）
CREATE TABLE `inventory_freeze` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
    `product_id` BIGINT NOT NULL COMMENT '商品ID',
    `quantity` INT NOT NULL COMMENT '冻结数量',
    `xid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '全局事务ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- inventory.sql 库存库
CREATE DATABASE IF NOT EXISTS `inventory_db` DEFAULT CHARSET utf8mb4;
USE `inventory_db`;

CREATE TABLE `inventory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `product_id` BIGINT NOT NULL COMMENT '商品ID',
    `stock` INT NOT NULL DEFAULT 0 COMMENT '可用库存',
    `frozen_stock` INT NOT NULL DEFAULT 0 COMMENT '冻结库存',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 库存扣减流水表（幂等用）
CREATE TABLE `inventory_deduction` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(64) NOT NULL,
    `product_id` BIGINT NOT NULL,
    `quantity` INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- account.sql 账户库
CREATE DATABASE IF NOT EXISTS `account_db` DEFAULT CHARSET utf8mb4;
USE `account_db`;

CREATE TABLE `account` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `balance` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '可用余额',
    `frozen_balance` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '冻结余额',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 账户扣减流水表（幂等用）
CREATE TABLE `account_deduction` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(64) NOT NULL,
    `user_id` BIGINT NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.4 实现TCC模式

TCC模式下，三个服务各实现Try、Confirm、Cancel三个接口。

先看库存服务的TCC实现：

```go
package inventory

import (
    "context"
    "database/sql"
    "fmt"
)

type TCCService struct {
    DB *sql.DB
}

// Try 预扣库存（冻结）
func (s *TCCService) Try(ctx context.Context, req *TCCTryReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 幂等检查
    var exist int
    err = tx.QueryRowContext(ctx,
        `SELECT COUNT(1) FROM inventory_freeze WHERE order_no = ?`,
        req.OrderNo).Scan(&exist)
    if err != nil {
        return err
    }
    if exist > 0 {
        return nil // 已处理，幂等返回
    }

    // 冻结库存：可用库存减少，冻结库存增加
    result, err := tx.ExecContext(ctx,
        `UPDATE inventory SET stock = stock - ?, frozen_stock = frozen_stock + ? 
         WHERE product_id = ? AND stock >= ?`,
        req.Quantity, req.Quantity, req.ProductID, req.Quantity)
    if err != nil {
        return fmt.Errorf("freeze inventory failed: %w", err)
    }
    affected, _ := result.RowsAffected()
    if affected == 0 {
        return fmt.Errorf("insufficient stock, product_id: %d, need: %d",
            req.ProductID, req.Quantity)
    }

    // 记录冻结信息
    _, err = tx.ExecContext(ctx,
        `INSERT INTO inventory_freeze (order_no, product_id, quantity, xid) VALUES (?, ?, ?, ?)`,
        req.OrderNo, req.ProductID, req.Quantity, req.XID)
    if err != nil {
        return err
    }

    return tx.Commit()
}

// Confirm 确认扣减（冻结库存清零）
func (s *TCCService) Confirm(ctx context.Context, req *TCCConfirmReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 查询冻结记录
    var productID, quantity int
    err = tx.QueryRowContext(ctx,
        `SELECT product_id, quantity FROM inventory_freeze WHERE order_no = ? FOR UPDATE`,
        req.OrderNo).Scan(&productID, &quantity)
    if err != nil {
        if err == sql.ErrNoRows {
            return nil // 无冻结记录，幂等返回
        }
        return err
    }

    // 确认扣减：冻结库存减少（可用库存已在Try阶段扣减）
    _, err = tx.ExecContext(ctx,
        `UPDATE inventory SET frozen_stock = frozen_stock - ? WHERE product_id = ?`,
        quantity, productID)
    if err != nil {
        return err
    }

    // 删除冻结记录
    _, err = tx.ExecContext(ctx,
        `DELETE FROM inventory_freeze WHERE order_no = ?`, req.OrderNo)
    if err != nil {
        return err
    }

    // 记录扣减流水（最终一致性记录）
    _, err = tx.ExecContext(ctx,
        `INSERT INTO inventory_deduction (order_no, product_id, quantity) VALUES (?, ?, ?)`,
        req.OrderNo, productID, quantity)
    if err != nil {
        return err
    }

    return tx.Commit()
}

// Cancel 取消冻结（释放库存）
func (s *TCCService) Cancel(ctx context.Context, req *TCCCancelReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 查询冻结记录
    var productID, quantity int
    err = tx.QueryRowContext(ctx,
        `SELECT product_id, quantity FROM inventory_freeze WHERE order_no = ? FOR UPDATE`,
        req.OrderNo).Scan(&productID, &quantity)
    if err != nil {
        if err == sql.ErrNoRows {
            return nil // 无冻结记录，幂等返回
        }
        return err
    }

    // 释放库存：可用库存恢复，冻结库存减少
    _, err = tx.ExecContext(ctx,
        `UPDATE inventory SET stock = stock + ?, frozen_stock = frozen_stock - ? WHERE product_id = ?`,
        quantity, quantity, productID)
    if err != nil {
        return err
    }

    // 删除冻结记录
    _, err = tx.ExecContext(ctx,
        `DELETE FROM inventory_freeze WHERE order_no = ?`, req.OrderNo)
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

账户服务的TCC实现类似，Try冻结余额，Confirm扣减冻结余额，Cancel释放冻结余额：

```go
package account

import (
    "context"
    "database/sql"
    "fmt"
)

type TCCService struct {
    DB *sql.DB
}

// Try 冻结用户余额
func (s *TCCService) Try(ctx context.Context, req *TCCTryReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 幂等检查
    var exist int
    err = tx.QueryRowContext(ctx,
        `SELECT COUNT(1) FROM account_freeze WHERE order_no = ?`,
        req.OrderNo).Scan(&exist)
    if err != nil {
        return err
    }
    if exist > 0 {
        return nil
    }

    // 冻结余额
    result, err := tx.ExecContext(ctx,
        `UPDATE account SET balance = balance - ?, frozen_balance = frozen_balance + ? 
         WHERE user_id = ? AND balance >= ?`,
        req.Amount, req.Amount, req.UserID, req.Amount)
    if err != nil {
        return err
    }
    affected, _ := result.RowsAffected()
    if affected == 0 {
        return fmt.Errorf("insufficient balance, user_id: %d, need: %.2f",
            req.UserID, req.Amount)
    }

    _, err = tx.ExecContext(ctx,
        `INSERT INTO account_freeze (order_no, user_id, amount, xid) VALUES (?, ?, ?, ?)`,
        req.OrderNo, req.UserID, req.Amount, req.XID)
    if err != nil {
        return err
    }

    return tx.Commit()
}

// Confirm 确认扣款
func (s *TCCService) Confirm(ctx context.Context, req *TCCConfirmReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    var userID int64
    var amount float64
    err = tx.QueryRowContext(ctx,
        `SELECT user_id, amount FROM account_freeze WHERE order_no = ? FOR UPDATE`,
        req.OrderNo).Scan(&userID, &amount)
    if err != nil {
        if err == sql.ErrNoRows {
            return nil
        }
        return err
    }

    // 冻结余额清零
    _, err = tx.ExecContext(ctx,
        `UPDATE account SET frozen_balance = frozen_balance - ? WHERE user_id = ?`,
        amount, userID)
    if err != nil {
        return err
    }

    _, err = tx.ExecContext(ctx,
        `DELETE FROM account_freeze WHERE order_no = ?`, req.OrderNo)
    if err != nil {
        return err
    }

    _, err = tx.ExecContext(ctx,
        `INSERT INTO account_deduction (order_no, user_id, amount) VALUES (?, ?, ?)`,
        req.OrderNo, userID, amount)
    if err != nil {
        return err
    }

    return tx.Commit()
}

// Cancel 取消冻结
func (s *TCCService) Cancel(ctx context.Context, req *TCCCancelReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    var userID int64
    var amount float64
    err = tx.QueryRowContext(ctx,
        `SELECT user_id, amount FROM account_freeze WHERE order_no = ? FOR UPDATE`,
        req.OrderNo).Scan(&userID, &amount)
    if err != nil {
        if err == sql.ErrNoRows {
            return nil
        }
        return err
    }

    // 释放冻结余额
    _, err = tx.ExecContext(ctx,
        `UPDATE account SET balance = balance + ?, frozen_balance = frozen_balance - ? WHERE user_id = ?`,
        amount, amount, userID)
    if err != nil {
        return err
    }

    _, err = tx.ExecContext(ctx,
        `DELETE FROM account_freeze WHERE order_no = ?`, req.OrderNo)
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

现在用协调器编排TCC事务：

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "time"

    "ecommerce-dtm/internal/dtm"
    "ecommerce-dtm/pkg/httpclient"
    "ecommerce-dtm/pkg/storage"
)

type OrderRequest struct {
    UserID    int64   `json:"user_id"`
    ProductID int64   `json:"product_id"`
    Quantity  int     `json:"quantity"`
    Amount    float64 `json:"amount"`
}

func main() {
    // 初始化组件
    db := initDB()
    store := storage.NewMySQLStorage(db)
    client := httpclient.NewDefaultClient()

    retryCfg := dtm.RetryConfig{
        MaxRetryCount: 3,
        RetryInterval: 2 * time.Second,
        Timeout:       5 * time.Second,
    }

    coordinator := dtm.NewCoordinator(store, client, retryCfg)
    go coordinator.StartTimeoutChecker(30 * time.Second)
    defer coordinator.Stop()

    // 发起TCC事务
    err := processOrderTCC(coordinator, &OrderRequest{
        UserID:    1001,
        ProductID: 2001,
        Quantity:  2,
        Amount:    199.00,
    })
    if err != nil {
        log.Printf("process order failed: %v", err)
    }
}

func processOrderTCC(coordinator *dtm.Coordinator, req *OrderRequest) error {
    ctx := context.Background()

    // 1. 开启全局事务
    xid, err := coordinator.Begin(ctx, dtm.TypeTCC, 30*time.Second)
    if err != nil {
        return fmt.Errorf("begin transaction failed: %w", err)
    }

    orderNo := fmt.Sprintf("ORD%d", time.Now().UnixNano())

    // 2. 注册分支事务：订单服务
    orderReq, _ := json.Marshal(map[string]interface{}{
        "order_no":   orderNo,
        "user_id":    req.UserID,
        "product_id": req.ProductID,
        "quantity":   req.Quantity,
        "amount":     req.Amount,
        "xid":        xid,
    })

    orderBranch := &dtm.BranchTransaction{
        BranchID:    fmt.Sprintf("%s_b1", xid),
        XID:         xid,
        ServiceName: "order-service",
        Action:      "create_order",
        TryURL:      "http://order-service:8081/tcc/try",
        ConfirmURL:  "http://order-service:8081/tcc/confirm",
        CancelURL:   "http://order-service:8081/tcc/cancel",
        RequestData: orderReq,
    }
    if err := coordinator.RegisterBranch(ctx, orderBranch); err != nil {
        return err
    }

    // 3. 注册分支事务：库存服务
    inventoryReq, _ := json.Marshal(map[string]interface{}{
        "order_no":   orderNo,
        "product_id": req.ProductID,
        "quantity":   req.Quantity,
        "xid":        xid,
    })

    inventoryBranch := &dtm.BranchTransaction{
        BranchID:    fmt.Sprintf("%s_b2", xid),
        XID:         xid,
        ServiceName: "inventory-service",
        Action:      "deduct_inventory",
        TryURL:      "http://inventory-service:8082/tcc/try",
        ConfirmURL:  "http://inventory-service:8082/tcc/confirm",
        CancelURL:   "http://inventory-service:8082/tcc/cancel",
        RequestData: inventoryReq,
    }
    if err := coordinator.RegisterBranch(ctx, inventoryBranch); err != nil {
        return err
    }

    // 4. 注册分支事务：账户服务
    accountReq, _ := json.Marshal(map[string]interface{}{
        "order_no":  orderNo,
        "user_id":   req.UserID,
        "amount":    req.Amount,
        "xid":       xid,
    })

    accountBranch := &dtm.BranchTransaction{
        BranchID:    fmt.Sprintf("%s_b3", xid),
        XID:         xid,
        ServiceName: "account-service",
        Action:      "deduct_balance",
        TryURL:      "http://account-service:8083/tcc/try",
        ConfirmURL:  "http://account-service:8083/tcc/confirm",
        CancelURL:   "http://account-service:8083/tcc/cancel",
        RequestData: accountReq,
    }
    if err := coordinator.RegisterBranch(ctx, accountBranch); err != nil {
        return err
    }

    // 5. 依次执行Try阶段
    // 先Try订单（空操作或预创建）
    // 再Try库存（冻结库存）
    // 再Try账户（冻结余额）
    for _, branch := range []*dtm.BranchTransaction{orderBranch, inventoryBranch, accountBranch} {
        // 这里简化处理，实际由协调器调用TryURL
        // 如果任一Try失败，协调器自动执行Cancel
    }

    // 6. 所有Try成功，提交全局事务（协调器执行所有Confirm）
    if err := coordinator.Commit(ctx, xid); err != nil {
        // 提交失败，回滚
        log.Printf("commit failed, rolling back: %v", err)
        return coordinator.Rollback(ctx, xid)
    }

    log.Printf("order processed successfully, orderNo: %s, xid: %s", orderNo, xid)
    return nil
}
```

### 5.5 实现Saga模式

Saga模式不需要Try阶段，直接执行正向操作，失败时执行补偿。

库存服务的Saga实现（直接扣减 + 补偿回加）：

```go
package inventory

import (
    "context"
    "database/sql"
    "fmt"
)

type SagaService struct {
    DB *sql.DB
}

// Execute 正向操作：直接扣减库存
func (s *SagaService) Execute(ctx context.Context, req *SagaReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 幂等检查
    var exist int
    err = tx.QueryRowContext(ctx,
        `SELECT COUNT(1) FROM inventory_deduction WHERE order_no = ?`,
        req.OrderNo).Scan(&exist)
    if err != nil {
        return err
    }
    if exist > 0 {
        return nil
    }

    // 直接扣减库存
    result, err := tx.ExecContext(ctx,
        `UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND stock >= ?`,
        req.Quantity, req.ProductID, req.Quantity)
    if err != nil {
        return err
    }
    affected, _ := result.RowsAffected()
    if affected == 0 {
        return fmt.Errorf("insufficient stock")
    }

    // 记录扣减流水
    _, err = tx.ExecContext(ctx,
        `INSERT INTO inventory_deduction (order_no, product_id, quantity) VALUES (?, ?, ?)`,
        req.OrderNo, req.ProductID, req.Quantity)
    if err != nil {
        return err
    }

    return tx.Commit()
}

// Compensate 补偿操作：恢复库存
func (s *SagaService) Compensate(ctx context.Context, req *SagaCompensateReq) error {
    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 查找扣减记录
    var productID, quantity int
    err = tx.QueryRowContext(ctx,
        `SELECT product_id, quantity FROM inventory_deduction WHERE order_no = ? FOR UPDATE`,
        req.OrderNo).Scan(&productID, &quantity)
    if err != nil {
        if err == sql.ErrNoRows {
            return nil // 无扣减记录，无需补偿
        }
        return err
    }

    // 恢复库存
    _, err = tx.ExecContext(ctx,
        `UPDATE inventory SET stock = stock + ? WHERE product_id = ?`,
        quantity, productID)
    if err != nil {
        return err
    }

    // 删除扣减记录（标记为已补偿）
    _, err = tx.ExecContext(ctx,
        `DELETE FROM inventory_deduction WHERE order_no = ?`, req.OrderNo)
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

Saga事务编排：

```go
func processOrderSaga(coordinator *dtm.Coordinator, req *OrderRequest) error {
    ctx := context.Background()
    orderNo := fmt.Sprintf("ORD%d", time.Now().UnixNano())

    // 1. 开启Saga事务
    xid, err := coordinator.Begin(ctx, dtm.TypeSaga, 60*time.Second)
    if err != nil {
        return err
    }

    // 2. 注册三个分支：订单创建 -> 库存扣减 -> 账户扣款
    // Saga按顺序执行，任何一步失败，前面已执行的分支执行补偿

    branches := []*dtm.BranchTransaction{
        {
            BranchID:      fmt.Sprintf("%s_b1", xid),
            XID:           xid,
            ServiceName:   "order-service",
            Action:        "create_order",
            TryURL:        "http://order-service:8081/saga/execute",
            CompensateURL: "http://order-service:8081/saga/compensate",
            RequestData:   mustMarshal(req),
        },
        {
            BranchID:      fmt.Sprintf("%s_b2", xid),
            XID:           xid,
            ServiceName:   "inventory-service",
            Action:        "deduct_inventory",
            TryURL:        "http://inventory-service:8082/saga/execute",
            CompensateURL: "http://inventory-service:8082/saga/compensate",
            RequestData:   mustMarshal(req),
        },
        {
            BranchID:      fmt.Sprintf("%s_b3", xid),
            XID:           xid,
            ServiceName:   "account-service",
            Action:        "deduct_balance",
            TryURL:        "http://account-service:8083/saga/execute",
            CompensateURL: "http://account-service:8083/saga/compensate",
            RequestData:   mustMarshal(req),
        },
    }

    for _, branch := range branches {
        if err := coordinator.RegisterBranch(ctx, branch); err != nil {
            return err
        }
    }

    // 3. 提交Saga事务（协调器按顺序执行正向操作，失败时自动补偿）
    if err := coordinator.Commit(ctx, xid); err != nil {
        log.Printf("saga transaction failed: %v", err)
        return err
    }

    log.Printf("order processed successfully (Saga), orderNo: %s, xid: %s", orderNo, xid)
    return nil
}

func mustMarshal(v interface{}) []byte {
    data, _ := json.Marshal(v)
    return data
}
```

### 5.6 实现本地消息表方案

回到我们的电商场景，用本地消息表实现下单扣库存。订单服务创建订单后，通过本地消息表异步通知库存服务扣减库存。

```go
package main

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "log"
    "time"

    "yourproject/mq"
    "yourproject/service"
)

// OrderServiceWithLocalMsg 基于本地消息表的订单服务
type OrderServiceWithLocalMsg struct {
    DB *sql.DB
    MQ mq.Producer
}

// PlaceOrder 下单：创建订单 + 写消息表（同一事务）
func (s *OrderServiceWithLocalMsg) PlaceOrder(ctx context.Context, req *OrderRequest) (string, error) {
    orderNo := fmt.Sprintf("ORD%d", time.Now().UnixNano())

    tx, err := s.DB.BeginTx(ctx, nil)
    if err != nil {
        return "", err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 1. 创建订单
    _, err = tx.ExecContext(ctx,
        `INSERT INTO orders (order_no, user_id, product_id, quantity, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        orderNo, req.UserID, req.ProductID, req.Quantity, req.Amount)
    if err != nil {
        return "", fmt.Errorf("create order failed: %w", err)
    }

    // 2. 同事务写入本地消息表
    msgBody, _ := json.Marshal(map[string]interface{}{
        "order_no":   orderNo,
        "product_id": req.ProductID,
        "quantity":   req.Quantity,
        "amount":     req.Amount,
        "user_id":    req.UserID,
    })

    _, err = tx.ExecContext(ctx,
        `INSERT INTO local_message (business_id, business_type, topic, tag, body, status, 
         retry_count, max_retry, next_retry_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 5, NOW(), NOW(), NOW())`,
        orderNo, "place_order", "order_topic", "deduct_inventory", string(msgBody))
    if err != nil {
        return "", fmt.Errorf("insert local message failed: %w", err)
    }

    if err := tx.Commit(); err != nil {
        return "", err
    }

    log.Printf("order created, orderNo: %s, waiting for inventory deduction", orderNo)
    return orderNo, nil
}
```

库存服务消费消息：

```go
// InventoryMsgConsumer 库存消息消费者
type InventoryMsgConsumer struct {
    DB *sql.DB
}

func (c *InventoryMsgConsumer) Handle(ctx context.Context, body []byte) error {
    var msg struct {
        OrderNo   string  `json:"order_no"`
        ProductID int64   `json:"product_id"`
        Quantity  int     `json:"quantity"`
        Amount    float64 `json:"amount"`
        UserID    int64   `json:"user_id"`
    }
    if err := json.Unmarshal(body, &msg); err != nil {
        return err
    }

    tx, err := c.DB.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    // 幂等检查
    var exist int
    err = tx.QueryRowContext(ctx,
        `SELECT COUNT(1) FROM inventory_deduction WHERE order_no = ?`,
        msg.OrderNo).Scan(&exist)
    if err != nil {
        return err
    }
    if exist > 0 {
        return nil // 幂等
    }

    // 扣减库存
    result, err := tx.ExecContext(ctx,
        `UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND stock >= ?`,
        msg.Quantity, msg.ProductID, msg.Quantity)
    if err != nil {
        return err
    }
    affected, _ := result.RowsAffected()
    if affected == 0 {
        return fmt.Errorf("insufficient stock for product %d", msg.ProductID)
    }

    _, err = tx.ExecContext(ctx,
        `INSERT INTO inventory_deduction (order_no, product_id, quantity) VALUES (?, ?, ?)`,
        msg.OrderNo, msg.ProductID, msg.Quantity)
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

### 5.7 基于RocketMQ实现事务消息

最后用RocketMQ事务消息实现同样的场景。订单服务作为事务消息生产者，库存服务作为消费者。

```go
package main

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "log"

    "github.com/apache/rocketmq-client-go/v2"
    "github.com/apache/rocketmq-client-go/v2/primitive"
    "github.com/apache/rocketmq-client-go/v2/producer"
)

// OrderTransactionListener 订单事务监听器
type OrderTransactionListener struct {
    DB *sql.DB
}

func (l *OrderTransactionListener) ExecuteLocalTransaction(msg *primitive.Message) primitive.LocalTransactionState {
    var req struct {
        OrderNo   string  `json:"order_no"`
        UserID    int64   `json:"user_id"`
        ProductID int64   `json:"product_id"`
        Quantity  int     `json:"quantity"`
        Amount    float64 `json:"amount"`
    }
    if err := json.Unmarshal(msg.Body, &req); err != nil {
        log.Printf("unmarshal failed: %v", err)
        return primitive.RollbackMessageState
    }

    // 执行本地事务：创建订单
    tx, err := l.DB.Begin()
    if err != nil {
        return primitive.RollbackMessageState
    }
    defer func() {
        if err != nil {
            tx.Rollback()
        }
    }()

    _, err = tx.Exec(
        `INSERT INTO orders (order_no, user_id, product_id, quantity, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        req.OrderNo, req.UserID, req.ProductID, req.Quantity, req.Amount)
    if err != nil {
        log.Printf("create order failed: %v", err)
        return primitive.RollbackMessageState
    }

    if err := tx.Commit(); err != nil {
        return primitive.RollbackMessageState
    }

    log.Printf("local transaction committed, orderNo: %s", req.OrderNo)
    return primitive.CommitMessageState
}

func (l *OrderTransactionListener) CheckLocalTransaction(msg *primitive.MessageExt) primitive.LocalTransactionState {
    var req struct {
        OrderNo string `json:"order_no"`
    }
    if err := json.Unmarshal(msg.Body, &req); err != nil {
        return primitive.RollbackMessageState
    }

    // 查询订单是否存在
    var count int
    err := l.DB.QueryRow(
        `SELECT COUNT(1) FROM orders WHERE order_no = ?`, req.OrderNo).Scan(&count)
    if err != nil {
        log.Printf("check transaction query failed: %v", err)
        return primitive.UnknowState
    }

    if count > 0 {
        return primitive.CommitMessageState
    }
    return primitive.RollbackMessageState
}

// PlaceOrderWithTxMsg 使用事务消息下单
func PlaceOrderWithTxMsg(p rocketmq.TransactionProducer, req *OrderRequest) error {
    orderNo := fmt.Sprintf("ORD%d", time.Now().UnixNano())

    body, _ := json.Marshal(map[string]interface{}{
        "order_no":   orderNo,
        "user_id":    req.UserID,
        "product_id": req.ProductID,
        "quantity":   req.Quantity,
        "amount":     req.Amount,
    })

    msg := primitive.NewMessage("order_topic", body)
    msg.WithTag("deduct_inventory")
    msg.WithKeys([]string{orderNo})

    result, err := p.SendMessageInTransaction(context.Background(), msg)
    if err != nil {
        return fmt.Errorf("send transaction message failed: %w", err)
    }

    log.Printf("order placed with tx message, orderNo: %s, msgID: %s, state: %s",
        orderNo, result.MsgID, result.LocalTransactionState)
    return nil
}
```

### 5.8 四种方案横向对比

我们在同一个业务场景下实现了四种方案，来做个总结对比：

| 维度 | TCC | Saga | 本地消息表 | 事务消息 |
|------|------|------|-----------|---------|
| 一致性 | 强一致 | 最终一致 | 最终一致 | 最终一致 |
| 侵入性 | 高（三接口） | 中（两接口） | 低 | 低 |
| 实时性 | 高（同步） | 高（同步） | 低（异步） | 中（半异步） |
| 性能 | 中（三次调用） | 中（多次调用） | 高（异步） | 高 |
| 复杂度 | 高 | 中 | 低 | 中 |
| 适用场景 | 资金/库存 | 长流程 | 异步通知 | MQ驱动 |

实现方案选择清单：

- [ ] 业务需要强一致性？ -> TCC
- [ ] 业务流程长、步骤多？ -> Saga
- [ ] 只是需要异步通知下游？ -> 本地消息表
- [ ] 已有RocketMQ基础设施？ -> 事务消息
- [ ] 团队对分布式事务经验不足？ -> 本地消息表（最简单）

> 技术选型不是选最好的，而是选最合适的。你的业务场景、团队水平、基础设施，共同决定了最佳方案。

### 5.9 完整事务协调器整合

最后把事务协调器整合起来，提供一个统一的入口：

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "os"
    "os/signal"
    "syscall"
    "time"

    "ecommerce-dtm/internal/dtm"
    "ecommerce-dtm/pkg/httpclient"
    "ecommerce-dtm/pkg/storage"
)

func main() {
    // 初始化
    db := initDB()
    store := storage.NewMySQLStorage(db)
    client := httpclient.NewDefaultClient()

    retryCfg := dtm.RetryConfig{
        MaxRetryCount: 3,
        RetryInterval: 2 * time.Second,
        Timeout:       5 * time.Second,
    }

    coordinator := dtm.NewCoordinator(store, client, retryCfg)

    // 启动超时检查器
    go coordinator.StartTimeoutChecker(30 * time.Second)

    // 启动HTTP API服务，接收事务请求
    go startAPI(coordinator)

    log.Println("DTM Coordinator started")

    // 优雅退出
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    <-sigCh

    log.Println("shutting down...")
    coordinator.Stop()
}

func startAPI(coordinator *dtm.Coordinator) {
    http.HandleFunc("/api/transaction/tcc", func(w http.ResponseWriter, r *http.Request) {
        var req OrderRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, err.Error(), 400)
            return
        }

        if err := processOrderTCC(coordinator, &req); err != nil {
            log.Printf("TCC transaction failed: %v", err)
            http.Error(w, err.Error(), 500)
            return
        }

        json.NewEncoder(w).Encode(map[string]string{
            "status": "success",
            "mode":   "tcc",
        })
    })

    http.HandleFunc("/api/transaction/saga", func(w http.ResponseWriter, r *http.Request) {
        var req OrderRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, err.Error(), 400)
            return
        }

        if err := processOrderSaga(coordinator, &req); err != nil {
            log.Printf("Saga transaction failed: %v", err)
            http.Error(w, err.Error(), 500)
            return
        }

        json.NewEncoder(w).Encode(map[string]string{
            "status": "success",
            "mode":   "saga",
        })
    })

    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

### 5.10 测试验证

写一个集成测试来验证事务的正确性：

```go
package integration_test

import (
    "context"
    "database/sql"
    "fmt"
    "testing"
    "time"

    "ecommerce-dtm/internal/dtm"
    "ecommerce-dtm/pkg/httpclient"
    "ecommerce-dtm/pkg/storage"
)

func TestTCCOrderSuccess(t *testing.T) {
    // 初始化测试环境
    db := setupTestDB(t)
    defer db.Close()

    store := storage.NewMySQLStorage(db)
    client := httpclient.NewMockClient(map[string]interface{}{
        "http://order-service:8081/tcc/try":      map[string]string{"status": "ok"},
        "http://order-service:8081/tcc/confirm":  map[string]string{"status": "ok"},
        "http://order-service:8081/tcc/cancel":   map[string]string{"status": "ok"},
        "http://inventory-service:8082/tcc/try":    map[string]string{"status": "ok"},
        "http://inventory-service:8082/tcc/confirm": map[string]string{"status": "ok"},
        "http://inventory-service:8082/tcc/cancel":  map[string]string{"status": "ok"},
        "http://account-service:8083/tcc/try":    map[string]string{"status": "ok"},
        "http://account-service:8083/tcc/confirm": map[string]string{"status": "ok"},
        "http://account-service:8083/tcc/cancel":  map[string]string{"status": "ok"},
    })

    cfg := dtm.RetryConfig{
        MaxRetryCount: 2,
        RetryInterval: 100 * time.Millisecond,
        Timeout:       2 * time.Second,
    }

    coordinator := dtm.NewCoordinator(store, client, cfg)
    ctx := context.Background()

    // 开始TCC事务
    xid, err := coordinator.Begin(ctx, dtm.TypeTCC, 10*time.Second)
    if err != nil {
        t.Fatalf("begin failed: %v", err)
    }

    // 注册分支
    for i, svc := range []string{"order-service", "inventory-service", "account-service"} {
        branch := &dtm.BranchTransaction{
            BranchID:    fmt.Sprintf("%s_b%d", xid, i+1),
            XID:         xid,
            ServiceName: svc,
            TryURL:      fmt.Sprintf("http://%s:808%d/tcc/try", svc, i+1),
            ConfirmURL:  fmt.Sprintf("http://%s:808%d/tcc/confirm", svc, i+1),
            CancelURL:   fmt.Sprintf("http://%s:808%d/tcc/cancel", svc, i+1),
            RequestData: []byte(`{}`),
        }
        if err := coordinator.RegisterBranch(ctx, branch); err != nil {
            t.Fatalf("register branch failed: %v", err)
        }
    }

    // 提交事务
    if err := coordinator.Commit(ctx, xid); err != nil {
        t.Fatalf("commit failed: %v", err)
    }

    // 验证事务状态
    tx, _ := store.GetGlobalTransaction(ctx, xid)
    if tx.Status != dtm.StatusCommitted {
        t.Errorf("expected status %d, got %d", dtm.StatusCommitted, tx.Status)
    }
}

func TestTCCOrderRollback(t *testing.T) {
    db := setupTestDB(t)
    defer db.Close()

    store := storage.NewMySQLStorage(db)
    // 库存服务Try失败
    client := httpclient.NewMockClient(map[string]interface{}{
        "http://order-service:8081/tcc/try":      map[string]string{"status": "ok"},
        "http://order-service:8081/tcc/cancel":   map[string]string{"status": "ok"},
        "http://inventory-service:8082/tcc/try":    nil, // 模拟失败
        "http://inventory-service:8082/tcc/cancel":  map[string]string{"status": "ok"},
    })

    cfg := dtm.RetryConfig{
        MaxRetryCount: 1,
        RetryInterval: 100 * time.Millisecond,
        Timeout:       1 * time.Second,
    }

    coordinator := dtm.NewCoordinator(store, client, cfg)
    ctx := context.Background()

    xid, _ := coordinator.Begin(ctx, dtm.TypeTCC, 10*time.Second)

    // 注册订单和库存分支
    for i, svc := range []string{"order-service", "inventory-service"} {
        branch := &dtm.BranchTransaction{
            BranchID:    fmt.Sprintf("%s_b%d", xid, i+1),
            XID:         xid,
            ServiceName: svc,
            TryURL:      fmt.Sprintf("http://%s:808%d/tcc/try", svc, i+1),
            ConfirmURL:  fmt.Sprintf("http://%s:808%d/tcc/confirm", svc, i+1),
            CancelURL:   fmt.Sprintf("http://%s:808%d/tcc/cancel", svc, i+1),
            RequestData: []byte(`{}`),
        }
        coordinator.RegisterBranch(ctx, branch)
    }

    // 提交应该失败并回滚
    err := coordinator.Commit(ctx, xid)
    if err == nil {
        t.Fatal("expected commit to fail")
    }

    // 验证事务已回滚
    tx, _ := store.GetGlobalTransaction(ctx, xid)
    if tx.Status != dtm.StatusRolledBack {
        t.Errorf("expected status %d, got %d", dtm.StatusRolledBack, tx.Status)
    }
}
```

### 5.11 分布式事务实现清单

最后整理一个完整的实现清单，方便你在自己的项目中落地：

**基础设施准备**

- [ ] MySQL数据库（业务库 + 事务日志库）
- [ ] 消息队列（RocketMQ / RabbitMQ / Kafka）
- [ ] 服务注册发现（Nacos / Consul / etcd）

**TCC模式实现清单**

- [ ] 每个参与方实现Try接口（资源预留）
- [ ] 每个参与方实现Confirm接口（确认操作）
- [ ] 每个参与方实现Cancel接口（释放资源）
- [ ] Try/Confirm/Cancel三个接口都要幂等
- [ ] Confirm阶段要处理空回滚（Try未执行但Cancel被调用）
- [ ] Cancel阶段要处理空回滚
- [ ] 需要处理悬挂事务（Cancel先于Try到达）

**Saga模式实现清单**

- [ ] 每个参与方实现正向操作接口
- [ ] 每个参与方实现补偿操作接口
- [ ] 正向操作和补偿操作都要幂等
- [ ] 定义清晰的事务执行顺序
- [ ] 补偿操作的顺序是逆序
- [ ] 处理补偿操作失败的情况（重试 + 告警）

**本地消息表实现清单**

- [ ] 设计消息表结构（状态字段 + 重试字段）
- [ ] 业务操作和消息写入在同一事务
- [ ] 实现消息投递定时任务
- [ ] 实现指数退避重试机制
- [ ] 消费端实现幂等
- [ ] 实现卡住消息的补偿任务
- [ ] 设定最大重试次数和告警

**事务消息实现清单**

- [ ] 实现事务监听器（ExecuteLocalTransaction）
- [ ] 实现事务回查（CheckLocalTransaction）
- [ ] 消费端实现幂等
- [ ] 配置合理的回查参数（超时时间、最大次数、间隔）
- [ ] 监控半消息堆积情况

> 清单不是形式主义，是工程纪律。每一项打勾，都是对线上稳定性的一次承诺。

---

## 六、踩坑总结

这一章的内容很多，最后总结几个我在实践中踩过的坑。

**坑一：幂等没做对，库存扣了两次**

消费端幂等只检查了消息ID，但同一条业务消息可能因为重试产生不同的消息ID。正确做法是用业务唯一标识（订单号）做幂等，而不是消息ID。

**坑二：TCC的空回滚没处理**

Try请求超时了，协调器发起了Cancel，但Try其实没执行成功。Cancel里查不到Try的预留记录，直接返回成功了。后来Try重试到了，执行了预留，但已经没法Cancel了。解决方案：Cancel接口先检查Try是否执行过，没执行过就插入一条"已回滚"标记，Try来了发现这个标记就直接跳过。

**坑三：Saga补偿顺序写反了**

Saga补偿必须逆序执行。我一开始写成了正序补偿，导致先补偿了还没执行的分支，后面执行的正向操作反而成了无主孤魂。记住：**补偿永远是逆序的**。

**坑四：事务消息回查超时**

回查接口里查数据库，结果数据库连接池满了，回查超时。Broker重试回查，又打数据库，恶性循环。解决方案：回查接口加缓存，或者用独立的查询连接池。

**坑五：定时任务重复执行**

部署了两个实例，定时任务同时跑，同一个消息被投递了两次。解决方案：用分布式锁（Redis SETNX）保证同一时间只有一个实例执行投递任务，或者在更新消息状态时用乐观锁（WHERE status = 0）。

> 踩坑不可怕，可怕的是在同一个坑里跌倒两次。把踩过的坑记录下来，就是最好的技术沉淀。

---

## 写在最后

分布式事务是微服务架构中最复杂的话题之一，没有之一。这一章我们从理论到实践，从本地消息表到事务消息，从TCC到Saga，最后手写了一个简化版的分布式事务框架，并在电商下单扣库存场景中完整落地。

核心观点总结：

1. **没有银弹**：每种方案都有适用场景，选择时权衡一致性要求、性能需求、团队能力
2. **幂等是底线**：无论哪种方案，消费端/补偿端都必须幂等
3. **补偿是常态**：分布式事务中失败是常态，设计时就要考虑补偿和重试
4. **监控是保障**：事务卡住、消息堆积、补偿失败，都需要监控告警
5. **日志是生命线**：事务日志丢了，数据就不一致了，务必做好备份

如果你觉得这篇文章对你有帮助，点个赞收藏一下，以后用到的时候翻出来看看。有什么问题或者不同的实践经验，欢迎评论区交流，我怕浪猫会一条一条看。

下一章我们进入Kafka与消息队列原理，聊聊Kafka的高吞吐是怎么做到的、分区机制、消费者组、ISR副本同步等核心话题。消息队列在分布式系统中的地位太重要了，这一章的很多方案都依赖消息队列，下一章我们深入它的内核。

---

**系列进度：12/16**

**下一章预告：第十三章 Kafka与消息队列原理**

---

> 怕浪猫说：分布式事务这块，我前前后后折腾了两年多，从最早的"一把梭"到后来老老实实做幂等、做补偿、做监控，每一步都是被线上事故教育的。写这篇文章的时候，我尽量把踩过的坑都写进去了，但说实话，有些坑你没亲自踩过，看了也不一定有感觉。所以我的建议是：把文章中的代码clone下来，自己跑一遍，故意搞一些失败场景，看看补偿逻辑是不是按预期工作。实践出真知，代码不会骗人。我们下一章见。
