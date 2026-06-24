# 第11章：分布式事务理论 -- 从ACID到Saga，一次讲透那些年踩过的坑

线上告警炸了。订单系统扣了库存，支付系统却说没收到回调，钱没扣，货发出去了。你翻遍了日志，发现是网络抖动导致的消息丢失。老板问你怎么办，你说加个分布式事务，老板问你要多久，你说两周，老板说两天够不够。

你可能觉得两天是夸张了，但分布式事务的坑，真不是两天能填完的。我第一次做分布式事务方案选型的时候，把2PC、3PC、TCC、Saga全看了一遍，越看越懵--每个方案看起来都有道理，每个方案又都有致命缺陷。后来我才想明白，分布式事务没有银弹，只有权衡。

我是怕浪猫，一个在分布式系统泥潭里摸爬滚打多年的Go后端工程师。这一章，我把分布式事务的理论体系和实战经验一次性讲透，从ACID到BASE，从2PC到Saga，再到Seata的架构拆解，帮你建立完整的知识框架。下一章我们会进入实战编码，所以这一章的理论底子一定要打扎实。

> 分布式事务的本质不是"怎么做对"，而是"错了怎么补"。

---

## 一、分布式事务基础：为什么单机事务不够用了

### 1.1 从单机事务说起：ACID的四座大山

在单体架构时代，事务很简单。一个数据库，一个`BEGIN`，一个`COMMIT`，世界很美好。ACID四个特性，数据库帮你兜底：

- **Atomicity（原子性）**：要么全做，要么全不做
- **Consistency（一致性）**：事务前后数据状态合法
- **Isolation（隔离性）**：并发事务互不干扰
- **Durability（持久性）**：提交了就不会丢

Go代码里就是一段再普通不过的逻辑：

```go
func TransferTx(db *sql.DB, fromID, toID int64, amount float64) error {
    tx, err := db.Begin()
    if err != nil {
        return err
    }
    defer tx.Rollback() // 失败回滚

    // 扣款
    _, err = tx.Exec("UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?",
        amount, fromID, amount)
    if err != nil {
        return err
    }

    // 加款
    _, err = tx.Exec("UPDATE accounts SET balance = balance + ? WHERE id = ?",
        amount, toID)
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

一个数据库连接，一个事务，ACID全部由数据库引擎保证。简单、可靠、没毛病。

> 单机事务的幸福在于，你只需要信任一个数据库；分布式事务的痛苦在于，你必须信任一堆还不怎么靠谱的网络。

### 1.2 微服务架构下的事务困境

当系统从单体拆成微服务，问题就来了。一个下单流程可能涉及：

1. **订单服务**：创建订单
2. **库存服务**：扣减库存
3. **账户服务**：扣减余额
4. **优惠券服务**：标记券已用
5. **通知服务**：发短信通知

这五步分布在五个不同的数据库实例上，甚至可能是不同类型的存储（MySQL、Redis、MongoDB）。你没法用一个`BEGIN...COMMIT`把它们包起来，因为它们不在同一个事务上下文里。

这时候你面临的核心问题是：**如何保证跨服务、跨数据库的数据一致性？**

这就是分布式事务要解决的问题。

### 1.3 CAP定理：分布式系统的物理极限

在讲分布式事务方案之前，必须先理解CAP定理，因为它是分布式系统设计的物理约束。

CAP三个字母代表：

- **Consistency（一致性）**：所有节点在同一时刻看到相同的数据
- **Availability（可用性）**：每个请求都能收到非错误响应（不保证是最新数据）
- **Partition tolerance（分区容错性）**：网络分区时系统仍能运作

定理说的是：**在网络分区（P）不可避免的前提下，你只能在C和A之间选一个。**

```
网络分区发生时：
  选CP → 部分节点不可用，但数据一致
  选AP → 所有节点可用，但数据可能不一致
```

举个Go代码的例子来说明CP和AP的取舍：

```go
// CP策略：宁可拒绝服务，也要保证一致性
func (s *OrderService) CreateOrderCP(req *OrderReq) (*Order, error) {
    // 向所有副本同步写入，任一副本失败则整体失败
    for _, node := range s.replicaNodes {
        if err := node.Write(req); err != nil {
            // 有副本写入失败，拒绝请求
            return nil, fmt.Errorf("consistency check failed on node %s: %w", node.ID, err)
        }
    }
    return s.localCreate(req)
}

// AP策略：先写本地，异步同步，保证可用
func (s *OrderService) CreateOrderAP(req *OrderReq) (*Order, error) {
    // 先写本地，立即返回
    order, err := s.localCreate(req)
    if err != nil {
        return nil, err
    }
    // 异步同步到其他副本，最终一致
    go s.asyncReplicate(req)
    return order, nil
}
```

> CAP不是选择题，而是必修课。你选择的那一刻，就决定了系统在故障时的表现。

在实际工程中，大多数互联网系统选择AP，因为可用性直接影响收入。而一致性通过分布式事务机制来"补偿"达到最终一致。

### 1.4 BASE理论：CAP的工程实践

既然CAP说强一致性（C）和可用性（A）不可兼得，那有没有一个折中方案？BASE理论就是答案：

- **Basically Available（基本可用）**：允许损失部分可用性（响应时间增加、部分功能降级）
- **Soft State（软状态）**：允许数据存在中间状态，不要求时时一致
- **Eventually Consistent（最终一致性）**：系统保证最终数据会达到一致状态，但不需要实时一致

BASE本质上是AP的延伸--放弃强一致性，换取可用性，通过机制保证最终一致。

这跟分布式事务有什么关系？关系太大了。它直接决定了你该用哪种事务方案：

| 对比维度 | ACID（强一致性） | BASE（最终一致性） |
|---------|----------------|------------------|
| 一致性要求 | 实时强一致 | 最终一致 |
| 可用性 | 可能降低 | 高可用 |
| 性能 | 较低（需锁定资源） | 较高 |
| 适用场景 | 金融核心交易 | 互联网业务 |
| 事务类型 | 刚性事务 | 柔性事务 |

> 强一致性是奢侈品，最终一致性是必需品。工程师的价值在于判断什么时候需要奢侈品，什么时候不需要。

### 1.5 分布式事务分类：刚性 vs 柔性

基于ACID和BASE，分布式事务可以分为两大类：

**刚性事务（强一致性）**：
- 追求ACID特性
- 整个事务期间资源被锁定
- 典型代表：2PC、3PC
- 适用场景：银行转账、核心交易

**柔性事务（最终一致性）**：
- 追求BASE特性
- 允许中间不一致状态
- 典型代表：TCC、Saga、本地消息表、最大努力通知
- 适用场景：电商订单、社交互动

来个对比代码感受一下两种思路的差异：

```go
// 刚性事务思路：锁定资源，要么全成功要么全回滚
func RigidTransfer(fromSvc, toSvc *Service, fromID, toID string, amount float64) error {
    // 阶段1：准备（锁定资源）
    fromLocked, err := fromSvc.Prepare(fromID, amount)
    if err != nil {
        return fmt.Errorf("prepare from failed: %w", err)
    }
    toLocked, err := toSvc.Prepare(toID, amount)
    if err != nil {
        fromSvc.Rollback(fromLocked) // 释放锁
        return fmt.Errorf("prepare to failed: %w", err)
    }

    // 阶段2：提交（释放锁，生效）
    if err := fromSvc.Commit(fromLocked); err != nil {
        // 这里就非常尴尬了，一个提交成功一个失败
        // 刚性事务的致命弱点
        return fmt.Errorf("commit from failed: %w", err)
    }
    if err := toSvc.Commit(toLocked); err != nil {
        // 需要补偿逻辑，但刚性事务理论上不擅长这个
        return fmt.Errorf("commit to failed: %w", err)
    }
    return nil
}

// 柔性事务思路：先执行，出问题再补偿
func FlexibleTransfer(fromSvc, toSvc *Service, fromID, toID string, amount float64) error {
    // 步骤1：扣款（直接生效）
    if err := fromSvc.Deduct(fromID, amount); err != nil {
        return err
    }

    // 步骤2：加款，失败则补偿
    if err := toSvc.Add(toID, amount); err != nil {
        // 补偿：把钱退回去
        if compErr := fromSvc.Refund(fromID, amount); compErr != nil {
            // 补偿也失败了，记录日志，人工介入
            log.Printf("CRITICAL: compensation failed: deduct=%v, refund=%v", err, compErr)
            return fmt.Errorf("compensation failed, manual intervention required")
        }
        return fmt.Errorf("transfer failed but compensated: %w", err)
    }
    return nil
}
```

看到了吗？刚性事务在prepare阶段就锁定资源，如果commit阶段出问题，处理起来非常棘手。柔性事务允许先执行再补偿，虽然中间状态不一致，但有明确的恢复路径。

> 刚性事务像结婚--要么在一起要么分开，没有中间态；柔性事务像恋爱--中间可以吵架冷战，但最终要么结婚要么分手，总有个结果。

---

## 二、2PC（两阶段提交）：分布式事务的"老祖宗"

### 2.1 2PC原理详解

2PC（Two-Phase Commit）是最经典的分布式事务协议，由一个**协调者（Coordinator）**和多个**参与者（Participant）**组成。顾名思义，分两个阶段：

**阶段一：Prepare（准备阶段）**

1. 协调者向所有参与者发送`Prepare`请求
2. 参与者执行事务操作，但不提交，将Undo/Redo日志写入本地
3. 参与者回复`Ready`或`Abort`
4. 如果任一参与者回复`Abort`或超时，协调者发送`Rollback`

**阶段二：Commit/Rollback（提交/回滚阶段）**

1. 如果所有参与者都回复`Ready`，协调者发送`Commit`
2. 参与者执行提交，释放资源，回复`Ack`
3. 如果有参与者回复`Abort`或超时，协调者发送`Rollback`
4. 参与者回滚事务，释放资源，回复`Ack`

用Go代码模拟一下2PC的流程：

```go
package main

import (
    "context"
    "fmt"
    "log"
    "sync"
    "time"
)

// Participant 参与者接口
type Participant interface {
    Prepare(ctx context.Context, txID string) error
    Commit(ctx context.Context, txID string) error
    Rollback(ctx context.Context, txID string) error
}

// Coordinator 协调者
type Coordinator struct {
    participants []Participant
    timeout      time.Duration
}

func NewCoordinator(participants []Participant, timeout time.Duration) *Coordinator {
    return &Coordinator{
        participants: participants,
        timeout:      timeout,
    }
}

// Execute 执行两阶段提交
func (c *Coordinator) Execute(txID string) error {
    // ========== 阶段一：Prepare ==========
    ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
    defer cancel()

    prepared := make([]bool, len(c.participants))
    var mu sync.Mutex

    var wg sync.WaitGroup
    var firstErr error

    for i, p := range c.participants {
        wg.Add(1)
        go func(idx int, participant Participant) {
            defer wg.Done()
            err := participant.Prepare(ctx, txID)
            mu.Lock()
            if err != nil {
                if firstErr == nil {
                    firstErr = fmt.Errorf("participant %d prepare failed: %w", idx, err)
                }
                prepared[idx] = false
            } else {
                prepared[idx] = true
            }
            mu.Unlock()
        }(i, p)
    }
    wg.Wait()

    // 检查是否所有参与者都准备好了
    allPrepared := true
    for _, p := range prepared {
        if !p {
            allPrepared = false
            break
        }
    }

    if !allPrepared {
        // 有参与者没准备好，执行回滚
        log.Printf("[2PC] txID=%s phase1 failed, rolling back: %v", txID, firstErr)
        c.rollbackAll(txID)
        return fmt.Errorf("2PC prepare failed: %w", firstErr)
    }

    // ========== 阶段二：Commit ==========
    log.Printf("[2PC] txID=%s all participants prepared, committing", txID)
    commitCtx, commitCancel := context.WithTimeout(context.Background(), c.timeout)
    defer commitCancel()

    for i, p := range c.participants {
        if err := p.Commit(commitCtx, txID); err != nil {
            // 2PC的致命问题：commit阶段失败怎么办？
            // 理论上需要无限重试，因为已经prepare了，不能回滚
            log.Printf("[2PC] CRITICAL: txID=%s participant %d commit failed: %v", txID, i, err)
            // 这里只能不断重试...
            return fmt.Errorf("2PC commit failed on participant %d: %w", i, err)
        }
    }

    log.Printf("[2PC] txID=%s committed successfully", txID)
    return nil
}

func (c *Coordinator) rollbackAll(txID string) {
    rollbackCtx, cancel := context.WithTimeout(context.Background(), c.timeout)
    defer cancel()

    for i, p := range c.participants {
        if err := p.Rollback(rollbackCtx, txID); err != nil {
            log.Printf("[2PC] txID=%s participant %d rollback failed: %v", txID, i, err)
        }
    }
}
```

这段代码展示了2PC的核心逻辑，同时也暴露了它的问题。

### 2.2 2PC的优缺点分析

**优点：**
- 原理简单，实现直观
- 强一致性保证
- 很多数据库原生支持（MySQL XA、PostgreSQL）

**缺点（这才是重点）：**

1. **同步阻塞**：Prepare阶段所有参与者锁定资源，直到Commit/Rollback。期间整个事务涉及的资源都不可用。

2. **单点故障**：协调者挂了，参与者一直处于资源锁定状态，不知道该提交还是回滚。

3. **数据不一致**：Commit阶段，部分参与者收到Commit请求提交了，部分因为网络问题没收到，数据就不一致了。而且这种情况你还没法自动恢复。

4. **性能差**：两轮网络通信 + 资源锁定时间，吞吐量直线下降。

> 2PC就像围城：进去容易出来难。Prepare锁住了资源，你就走上了一条不归路，要么Commit到底，要么一起Rollback，中间没有回头路。

### 2.3 MySQL XA：2PC的数据库实现

MySQL提供了XA事务支持，底层就是2PC协议。看看Go里怎么用：

```go
package main

import (
    "database/sql"
    "fmt"
    _ "github.com/go-sql-driver/mysql"
)

// XATransactionManager XA事务管理器
type XATransactionManager struct {
    db1 *sql.DB // 订单库
    db2 *sql.DB // 库存库
}

func NewXATransactionManager(db1, db2 *sql.DB) *XATransactionManager {
    return &XATransactionManager{db1: db1, db2: db2}
}

func (m *XATransactionManager) CreateOrderAndDeductStock(orderID string, productID string, quantity int) error {
    xid := fmt.Sprintf("xa_%s", orderID)

    // ========== 阶段一：XA START ... XA END ... XA PREPARE ==========

    // 在订单库上执行XA事务
    _, err := m.db1.Exec("XA START ?", xid)
    if err != nil {
        return fmt.Errorf("db1 XA START failed: %w", err)
    }
    _, err = m.db1.Exec("INSERT INTO orders (id, product_id, quantity, status) VALUES (?, ?, ?, 'pending')",
        orderID, productID, quantity)
    if err != nil {
        m.db1.Exec("XA END ?", xid)
        m.db1.Exec("XA ROLLBACK ?", xid)
        return fmt.Errorf("insert order failed: %w", err)
    }
    _, err = m.db1.Exec("XA END ?", xid)
    if err != nil {
        return fmt.Errorf("db1 XA END failed: %w", err)
    }
    _, err = m.db1.Exec("XA PREPARE ?", xid)
    if err != nil {
        m.db1.Exec("XA ROLLBACK ?", xid)
        return fmt.Errorf("db1 XA PREPARE failed: %w", err)
    }

    // 在库存库上执行XA事务
    _, err = m.db2.Exec("XA START ?", xid)
    if err != nil {
        m.db1.Exec("XA ROLLBACK ?", xid) // 回滚已prepare的db1
        return fmt.Errorf("db2 XA START failed: %w", err)
    }
    _, err = m.db2.Exec("UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND quantity >= ?",
        quantity, productID, quantity)
    if err != nil {
        m.db2.Exec("XA END ?", xid)
        m.db2.Exec("XA ROLLBACK ?", xid)
        m.db1.Exec("XA ROLLBACK ?", xid)
        return fmt.Errorf("deduct stock failed: %w", err)
    }
    _, err = m.db2.Exec("XA END ?", xid)
    if err != nil {
        m.db1.Exec("XA ROLLBACK ?", xid)
        return fmt.Errorf("db2 XA END failed: %w", err)
    }
    _, err = m.db2.Exec("XA PREPARE ?", xid)
    if err != nil {
        m.db2.Exec("XA ROLLBACK ?", xid)
        m.db1.Exec("XA ROLLBACK ?", xid)
        return fmt.Errorf("db2 XA PREPARE failed: %w", err)
    }

    // ========== 阶段二：XA COMMIT ==========
    _, err = m.db1.Exec("XA COMMIT ?", xid)
    if err != nil {
        // 致命问题：db1 commit失败，但db2已经prepare了
        // 需要重试或人工介入
        return fmt.Errorf("CRITICAL: db1 XA COMMIT failed: %w", err)
    }
    _, err = m.db2.Exec("XA COMMIT ?", xid)
    if err != nil {
        // 同样致命：db1已提交，db2 commit失败
        return fmt.Errorf("CRITICAL: db2 XA COMMIT failed: %w", err)
    }

    return nil
}
```

这段代码能跑，但我在生产环境强烈不建议用MySQL XA。原因很简单：XA事务持有锁的时间太长，高并发下性能灾难。我在上家公司做过压测，单库TPS从8000掉到200，直接不可用。

> 数据库XA就像用保险柜存钱：安全级别拉满了，但你每次取钱都要开三道锁，等钱取出来，菜都凉了。

---

## 三、3PC（三阶段提交）：2PC的改良版，但改良得不太行

### 3.1 3PC做了什么改进

3PC（Three-Phase Commit）在2PC的基础上加了一个**CanCommit**阶段，把原来的两个阶段变成三个：

1. **CanCommit**：协调者询问参与者"你能不能执行事务？"（不实际执行，不锁资源）
2. **PreCommit**：如果所有参与者都说能，协调者发送PreCommit，参与者执行事务操作并写日志，但不提交
3. **DoCommit**：协调者发送DoCommit，参与者正式提交

核心改进点是：**引入了超时机制和预询问阶段**。

- 参与者在PreCommit阶段后如果超时未收到DoCommit，会自动提交（因为已经PreCommit了）
- CanCommit阶段不锁资源，先检查能不能做，减少不必要的资源锁定

Go代码模拟3PC：

```go
// ThreePhaseCoordinator 3PC协调者
type ThreePhaseCoordinator struct {
    participants []Participant3PC
    timeout      time.Duration
}

// Participant3PC 3PC参与者接口
type Participant3PC interface {
    CanCommit(ctx context.Context, txID string) error // 预检查，不锁资源
    PreCommit(ctx context.Context, txID string) error  // 执行事务，写日志，不提交
    DoCommit(ctx context.Context, txID string) error   // 正式提交
    Abort(ctx context.Context, txID string) error       // 取消
}

func (c *ThreePhaseCoordinator) Execute(txID string) error {
    // ========== 阶段一：CanCommit ==========
    canCtx, canCancel := context.WithTimeout(context.Background(), c.timeout)
    defer canCancel()

    for i, p := range c.participants {
        if err := p.CanCommit(canCtx, txID); err != nil {
            log.Printf("[3PC] txID=%s participant %d can't commit: %v", txID, i, err)
            c.abortAll(txID)
            return fmt.Errorf("3PC canCommit failed on participant %d: %w", i, err)
        }
    }

    // ========== 阶段二：PreCommit ==========
    preCtx, preCancel := context.WithTimeout(context.Background(), c.timeout)
    defer preCancel()

    for i, p := range c.participants {
        if err := p.PreCommit(preCtx, txID); err != nil {
            log.Printf("[3PC] txID=%s participant %d preCommit failed: %v", txID, i, err)
            c.abortAll(txID)
            return fmt.Errorf("3PC preCommit failed on participant %d: %w", i, err)
        }
    }

    // ========== 阶段三：DoCommit ==========
    // 注意：即使协调者在这里挂了，参与者超时后会自动提交
    commitCtx, commitCancel := context.WithTimeout(context.Background(), c.timeout)
    defer commitCancel()

    for i, p := range c.participants {
        if err := p.DoCommit(commitCtx, txID); err != nil {
            // 参与者超时会自动提交，所以这里失败不代表事务回滚
            // 只能记录日志，后续人工对账
            log.Printf("[3PC] txID=%s participant %d doCommit failed, may auto-commit: %v",
                txID, i, err)
            return fmt.Errorf("3PC doCommit uncertain on participant %d: %w", i, err)
        }
    }

    return nil
}

func (c *ThreePhaseCoordinator) abortAll(txID string) {
    ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
    defer cancel()
    for _, p := range c.participants {
        p.Abort(ctx, txID)
    }
}
```

### 3.2 3PC的局限

3PC解决了2PC的部分问题，但带来了新的问题：

1. **仍然有数据不一致风险**：网络分区时，部分参与者收到PreCommit后自动提交，部分没收到PreCommit而中止，数据不一致。

2. **多一轮网络开销**：从两轮变三轮，延迟更高。

3. **自动提交可能帮倒忙**：参与者超时自动提交，但如果本该回滚的事务被自动提交了，问题更大。

> 3PC就像给2PC打了个补丁，补丁是打上了，但新补丁下面又露出了新洞。工程界最终给出的评价是：改进不够，不值得多一轮通信的开销。

3PC在实际工程中几乎没人用。我写这一节纯粹是为了知识完整性，你要是面试被问到知道就行，别真去生产环境用。

---

## 四、TCC（Try-Confirm-Cancel）：柔性事务的实战派

### 4.1 TCC核心思想

TCC是柔性事务中最常用的方案之一。它把每个操作分成三个步骤：

- **Try**：预留资源（不真正执行，先"占座"）
- **Confirm**：确认执行（真正扣减预留的资源）
- **Cancel**：取消预留（释放Try阶段预留的资源）

和2PC最大的区别是：TCC的Try阶段不锁资源，而是在业务层面"预留"资源。比如冻结金额、预扣库存。

以转账为例：

```
账户A向账户B转100元

Try阶段：
  A：冻结100元（余额不变，冻结金额+100）
  B：检查账户存在且状态正常

Confirm阶段：
  A：余额-100，冻结金额-100
  B：余额+100

Cancel阶段（如果Try或Confirm失败）：
  A：冻结金额-100（解冻）
  B：无操作
```

### 4.2 TCC的Go实现

```go
package tcc

import (
    "context"
    "fmt"
    "log"
    "time"
)

// TCCService TCC服务接口
type TCCService interface {
    Try(ctx context.Context, txID string, req interface{}) error
    Confirm(ctx context.Context, txID string, req interface{}) error
    Cancel(ctx context.Context, txID string, req interface{}) error
}

// AccountService 账户服务（TCC实现）
type AccountService struct {
    db *sql.DB
}

// TransferRequest 转账请求
type TransferRequest struct {
    FromAccount string
    ToAccount   string
    Amount      float64
}

// Try 冻结金额
func (s *AccountService) Try(ctx context.Context, txID string, req interface{}) error {
    r := req.(TransferRequest)
    // 检查余额是否充足
    var balance float64
    err := s.db.QueryRowContext(ctx,
        "SELECT balance FROM accounts WHERE id = ? FOR UPDATE", r.FromAccount).Scan(&balance)
    if err != nil {
        return fmt.Errorf("query balance failed: %w", err)
    }
    if balance < r.Amount {
        return fmt.Errorf("insufficient balance: have %.2f, need %.2f", balance, r.Amount)
    }

    // 冻结金额
    _, err = s.db.ExecContext(ctx,
        "UPDATE accounts SET frozen = frozen + ? WHERE id = ?", r.Amount, r.FromAccount)
    if err != nil {
        return fmt.Errorf("freeze amount failed: %w", err)
    }

    // 记录事务日志（用于幂等和恢复）
    _, err = s.db.ExecContext(ctx,
        "INSERT INTO tcc_log (tx_id, branch_id, status, req_data) VALUES (?, ?, 'TRY', ?)",
        txID, r.FromAccount, toJSON(r))
    return err
}

// Confirm 真正扣款
func (s *AccountService) Confirm(ctx context.Context, txID string, req interface{}) error {
    r := req.(TransferRequest)

    // 幂等检查：是否已经Confirm过
    var status string
    err := s.db.QueryRowContext(ctx,
        "SELECT status FROM tcc_log WHERE tx_id = ? AND branch_id = ?", txID, r.FromAccount).Scan(&status)
    if err == nil && status == "CONFIRMED" {
        return nil // 已经确认过，幂等返回
    }

    // 扣减余额，释放冻结
    result, err := s.db.ExecContext(ctx,
        `UPDATE accounts 
         SET balance = balance - ?, frozen = frozen - ? 
         WHERE id = ? AND frozen >= ?`,
        r.Amount, r.Amount, r.FromAccount, r.Amount)
    if err != nil {
        return fmt.Errorf("confirm deduct failed: %w", err)
    }
    affected, _ := result.RowsAffected()
    if affected == 0 {
        return fmt.Errorf("confirm failed: frozen amount not enough")
    }

    // 更新事务日志
    _, err = s.db.ExecContext(ctx,
        "UPDATE tcc_log SET status = 'CONFIRMED' WHERE tx_id = ? AND branch_id = ?",
        txID, r.FromAccount)
    return err
}

// Cancel 解冻
func (s *AccountService) Cancel(ctx context.Context, txID string, req interface{}) error {
    r := req.(TransferRequest)

    // 幂等检查
    var status string
    err := s.db.QueryRowContext(ctx,
        "SELECT status FROM tcc_log WHERE tx_id = ? AND branch_id = ?", txID, r.FromAccount).Scan(&status)
    if err == nil && status == "CANCELLED" {
        return nil // 已经取消过，幂等返回
    }

    // 解冻金额
    _, err = s.db.ExecContext(ctx,
        "UPDATE accounts SET frozen = frozen - ? WHERE id = ? AND frozen >= ?",
        r.Amount, r.FromAccount, r.Amount)
    if err != nil {
        return fmt.Errorf("cancel unfreeze failed: %w", err)
    }

    // 更新事务日志
    _, err = s.db.ExecContext(ctx,
        "UPDATE tcc_log SET status = 'CANCELLED' WHERE tx_id = ? AND branch_id = ?",
        txID, r.FromAccount)
    return err
}

// TCCCoordinator TCC协调者
type TCCCoordinator struct {
    services []TCCService
    timeout  time.Duration
}

func (c *TCCCoordinator) Execute(txID string, req interface{}) error {
    ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
    defer cancel()

    // ========== Try阶段 ==========
    trySuccess := make([]bool, len(c.services))
    for i, svc := range c.services {
        if err := svc.Try(ctx, txID, req); err != nil {
            log.Printf("[TCC] txID=%s service %d try failed: %v", txID, i, err)
            // 对已Try成功的服务执行Cancel
            for j := 0; j < i; j++ {
                if trySuccess[j] {
                    if err := c.services[j].Cancel(ctx, txID, req); err != nil {
                        log.Printf("[TCC] txID=%s service %d cancel failed: %v", txID, j, err)
                    }
                }
            }
            return fmt.Errorf("tcc try failed on service %d: %w", i, err)
        }
        trySuccess[i] = true
    }

    // ========== Confirm阶段 ==========
    for i, svc := range c.services {
        if err := svc.Confirm(ctx, txID, req); err != nil {
            // Confirm失败需要重试，不能回滚
            // 因为其他服务可能已经Confirm成功了
            log.Printf("[TCC] CRITICAL: txID=%s service %d confirm failed: %v", txID, i, err)
            // 实际工程中：记录失败，异步重试Confirm
            return fmt.Errorf("tcc confirm failed on service %d, will retry: %w", i, err)
        }
    }

    log.Printf("[TCC] txID=%s completed successfully", txID)
    return nil
}
```

### 4.3 TCC的设计要点与坑

TCC看似简单，实际落地有一堆坑要踩。我把踩过的坑总结成以下清单：

**TCC落地检查清单：**

1. [ ] **幂等性设计**：Confirm和Cancel都必须幂等，因为可能被重试多次
2. [ ] **空回滚处理**：Try未执行但Cancel被调用了（网络超时导致Try请求丢失，协调者触发Cancel）
3. [ ] **悬挂事务控制**：Cancel先于Try执行（Try请求延迟到达），需要在Try时检查是否已Cancel
4. [ ] **事务日志设计**：每一步都要记录事务日志，用于恢复和幂等判断
5. [ ] **超时与重试策略**：Confirm失败后无限重试（不能回滚），Cancel同理
6. [ ] **并发控制**：同一资源的多个TCC事务可能冲突，需要业务层加锁

空回滚和悬挂事务的代码处理：

```go
// Try方法增加空回滚和悬挂检查
func (s *AccountService) Try(ctx context.Context, txID string, req interface{}) error {
    r := req.(TransferRequest)

    // 检查是否已经被Cancel过（防止悬挂）
    var status string
    err := s.db.QueryRowContext(ctx,
        "SELECT status FROM tcc_log WHERE tx_id = ? AND branch_id = ?",
        txID, r.FromAccount).Scan(&status)
    if err == nil {
        if status == "CANCELLED" {
            // 已经被Cancel了，不能再Try（悬挂控制）
            log.Printf("[TCC] txID=%s already cancelled, skip try (suspended)", txID)
            return nil
        }
        if status == "TRYING" || status == "CONFIRMED" {
            // 已经Try过了，幂等返回
            return nil
        }
    }

    // 正常Try逻辑...
    // 冻结金额，插入日志（状态=TRYING）
    _, err = s.db.ExecContext(ctx,
        "INSERT INTO tcc_log (tx_id, branch_id, status, req_data) VALUES (?, ?, 'TRYING', ?)",
        txID, r.FromAccount, toJSON(r))
    if err != nil {
        return err
    }
    // 冻结操作...
    return nil
}

// Cancel方法增加空回滚处理
func (s *AccountService) Cancel(ctx context.Context, txID string, req interface{}) error {
    r := req.(TransferRequest)

    // 检查是否Try过
    var status string
    err := s.db.QueryRowContext(ctx,
        "SELECT status FROM tcc_log WHERE tx_id = ? AND branch_id = ?",
        txID, r.FromAccount).Scan(&status)

    if err == sql.ErrNoRows {
        // Try没执行过，空回滚：插入一条CANCELLED记录，不做业务操作
        _, err = s.db.ExecContext(ctx,
            "INSERT INTO tcc_log (tx_id, branch_id, status, req_data) VALUES (?, ?, 'CANCELLED', ?)",
            txID, r.FromAccount, toJSON(r))
        return err
    }
    if err == nil && status == "CANCELLED" {
        return nil // 幂等
    }

    // 正常Cancel逻辑：解冻金额，更新状态
    // ...
    return nil
}
```

> TCC的精髓在于"预留"二字。预留是可逆的，提交是不可逆的。工程上，能可逆就别不可逆。

---

## 五、Saga模式：长事务的优雅解法

### 5.1 Saga的核心思想

Saga模式的思想很简单：**把一个大的分布式事务拆成一系列小的本地事务，每个小事务都有对应的补偿操作。如果某个小事务失败了，就反向执行已完成事务的补偿操作。**

举个例子，电商下单流程拆成Saga：

```
正向操作：
  T1: 创建订单         → 补偿C1: 取消订单
  T2: 扣减库存         → 补偿C2: 恢复库存
  T3: 扣减余额         → 补偿C3: 退还余额
  T4: 标记优惠券已用   → 补偿C4: 恢复优惠券
```

如果T3失败了，Saga会反向执行补偿：C2（恢复库存）→ C1（取消订单）。注意不需要执行C3和C4，因为它们没有成功执行。

> Saga像走钢丝：每走一步都要想好退路。前进是正操作，后退是补偿操作，但退路不一定是原路返回。

### 5.2 Saga的两种实现模式

Saga有两种协调方式：**编排式（Choreography）**和**协调式（Orchestration）**。

#### 编排式（Choreography）

没有中央协调者，各服务通过事件驱动，监听其他服务的事件来决定自己的操作。

```
订单服务 --发布"订单已创建"事件--> 库存服务监听到，扣减库存
库存服务 --发布"库存已扣减"事件--> 账户服务监听到，扣减余额
账户服务 --发布"余额扣减失败"事件--> 库存服务监听到，恢复库存
                              --> 订单服务监听到，取消订单
```

Go代码实现（用channel模拟事件总线）：

```go
package saga

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "sync"
)

// Event 事件
type Event struct {
    Type    string          `json:"type"`
    TxID    string          `json:"tx_id"`
    Payload json.RawMessage `json:"payload"`
}

// EventBus 事件总线（简化版）
type EventBus struct {
    subscribers map[string][]chan Event
    mu          sync.RWMutex
}

func NewEventBus() *EventBus {
    return &EventBus{
        subscribers: make(map[string][]chan Event),
    }
}

func (b *EventBus) Subscribe(eventType string) chan Event {
    b.mu.Lock()
    defer b.mu.Unlock()
    ch := make(chan Event, 100)
    b.subscribers[eventType] = append(b.subscribers[eventType], ch)
    return ch
}

func (b *EventBus) Publish(event Event) {
    b.mu.RLock()
    defer b.mu.RUnlock()
    for _, ch := range b.subscribers[event.Type] {
        select {
        case ch <- event:
        default:
            log.Printf("[EventBus] subscriber channel full, event dropped: %+v", event)
        }
    }
}

// OrderService 订单服务（编排式Saga参与者）
type ChoreographyOrderService struct {
    bus  *EventBus
    db   *sql.DB
}

func (s *ChoreographyOrderService) CreateOrder(ctx context.Context, txID string, req OrderReq) error {
    // 创建订单
    _, err := s.db.ExecContext(ctx,
        "INSERT INTO orders (id, tx_id, product_id, quantity, status) VALUES (?, ?, ?, ?, 'created')",
        req.OrderID, txID, req.ProductID, req.Quantity)
    if err != nil {
        return err
    }
    // 发布事件
    s.bus.Publish(Event{
        Type:    "OrderCreated",
        TxID:    txID,
        Payload: toJSON(req),
    })
    return nil
}

func (s *ChoreographyOrderService) CancelOrder(ctx context.Context, txID string, req OrderReq) error {
    _, err := s.db.ExecContext(ctx,
        "UPDATE orders SET status = 'cancelled' WHERE tx_id = ?", txID)
    if err != nil {
        return err
    }
    s.bus.Publish(Event{
        Type:    "OrderCancelled",
        TxID:    txID,
        Payload: toJSON(req),
    })
    return nil
}

// 订单服务监听余额扣减失败事件，执行补偿
func (s *ChoreographyOrderService) ListenForCompensation(ctx context.Context) {
    ch := s.bus.Subscribe("PaymentFailed")
    go func() {
        for event := range ch {
            var req OrderReq
            json.Unmarshal(event.Payload, &req)
            if err := s.CancelOrder(ctx, event.TxID, req); err != nil {
                log.Printf("[Saga] cancel order failed: %v", err)
            }
        }
    }()
}
```

编排式的优点是去中心化、无单点故障；缺点是流程不直观、调试困难、循环依赖风险。

#### 协调式（Orchestration）

有一个中央协调者（Orchestrator），负责按顺序调用各服务，并在失败时执行补偿。

```go
// SagaStep Saga步骤
type SagaStep struct {
    Action     func(ctx context.Context, txID string, req interface{}) error
    Compensate func(ctx context.Context, txID string, req interface{}) error
    Name       string
}

// SagaOrchestrator Saga协调者
type SagaOrchestrator struct {
    steps   []SagaStep
    timeout time.Duration
}

func (o *SagaOrchestrator) Execute(ctx context.Context, txID string, req interface{}) error {
    completedSteps := make([]int, 0, len(o.steps))

    // 正向执行
    for i, step := range o.steps {
        log.Printf("[Saga] txID=%s executing step %d: %s", txID, i, step.Name)
        if err := step.Action(ctx, txID, req); err != nil {
            log.Printf("[Saga] txID=%s step %d (%s) failed: %v, compensating...",
                txID, i, step.Name, err)

            // 反向补偿
            for j := len(completedSteps) - 1; j >= 0; j-- {
                stepIdx := completedSteps[j]
                compStep := o.steps[stepIdx]
                log.Printf("[Saga] txID=%s compensating step %d: %s",
                    txID, stepIdx, compStep.Name)
                if compErr := compStep.Compensate(ctx, txID, req); compErr != nil {
                    // 补偿失败，记录日志，继续补偿其他步骤
                    log.Printf("[Saga] CRITICAL: txID=%s compensation step %d failed: %v",
                        txID, stepIdx, compErr)
                    // TODO: 记录到补偿表，异步重试
                }
            }
            return fmt.Errorf("saga failed at step %d (%s): %w", i, step.Name, err)
        }
        completedSteps = append(completedSteps, i)
    }

    log.Printf("[Saga] txID=%s completed successfully", txID)
    return nil
}

// 使用示例
func NewOrderSaga(orderSvc, stockSvc, paymentSvc, couponSvc TCCService) *SagaOrchestrator {
    return &SagaOrchestrator{
        steps: []SagaStep{
            {
                Name: "create_order",
                Action:     orderSvc.Try,
                Compensate: orderSvc.Cancel,
            },
            {
                Name: "deduct_stock",
                Action:     stockSvc.Try,
                Compensate: stockSvc.Cancel,
            },
            {
                Name: "deduct_payment",
                Action:     paymentSvc.Try,
                Compensate: paymentSvc.Cancel,
            },
            {
                Name: "use_coupon",
                Action:     couponSvc.Try,
                Compensate: couponSvc.Cancel,
            },
        },
    }
}
```

协调式的优点是流程清晰、易于调试、补偿逻辑集中管理；缺点是协调者可能成为单点（可以通过高可用部署解决）。

> 编排式像爵士乐即兴演奏，每个乐手听着别人的旋律来决定自己怎么弹；协调式像交响乐团，指挥拿着谱子，按顺序来，谁出错了就回头重奏。

### 5.3 Saga vs TCC对比

| 维度 | Saga | TCC |
|------|------|-----|
| 一致性 | 最终一致 | 最终一致 |
| 隔离性 | 弱（中间状态可见） | 较强（Try阶段预留资源） |
| 侵入性 | 中（需要补偿操作） | 高（需要Try/Confirm/Cancel三个接口） |
| 性能 | 好（无资源锁定） | 好（业务层预留，非数据库锁） |
| 复杂度 | 中 | 高（需处理空回滚、悬挂等问题） |
| 适用场景 | 长流程事务 | 短流程、强隔离需求 |

我的建议是：流程长、步骤多（>3步）用Saga；流程短、隔离性要求高用TCC。两者不是互斥的，Saga的某个步骤内部可以是TCC。

---

## 六、Seata架构与实现原理

### 6.1 Seata是什么

Seata（Simple Extensible Autonomous Transaction Architecture）是阿里开源的分布式事务解决方案，目前是Apache孵化项目。它把上面说的几种模式都实现了，还额外加了一个AT模式（Auto Transaction）。

Seata的核心架构包含三个角色：

- **TC（Transaction Coordinator）**：事务协调者，独立部署，维护全局事务和分支事务的状态
- **TM（Transaction Manager）**：事务管理器，定义全局事务的边界（开始、提交、回滚）
- **RM（Resource Manager）**：资源管理器，管理本地资源（数据库），注册分支事务

Seata支持四种事务模式：

1. **AT模式**：自动模式，无侵入，基于SQL解析生成反向SQL做补偿
2. **TCC模式**：需要业务实现Try/Confirm/Cancel三个接口
3. **Saga模式**：适合长流程事务
4. **XA模式**：基于数据库XA协议

### 6.2 Seata AT模式原理

AT模式是Seata最常用的模式，核心是**自动生成补偿SQL**，业务代码零侵入。

AT模式的工作流程：

**阶段一（业务执行 + 记录undo_log）**：
1. 拦截SQL，解析SQL语义
2. 查询变更前的数据，生成before image
3. 执行业务SQL
4. 查询变更后的数据，生成after image
5. 将before image和after image存入undo_log表
6. 向TC注册分支事务，加全局锁
7. 本地事务提交（业务SQL + undo_log在同一个本地事务中）

**阶段二（提交或回滚）**：
- 提交：异步删除undo_log
- 回滚：根据before image生成反向SQL，恢复数据

用Go代码模拟AT模式的核心逻辑：

```go
package seata

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "log"
)

// UndoLog undo日志
type UndoLog struct {
    TxID       string          `json:"tx_id"`
    BranchID   string          `json:"branch_id"`
    Table      string          `json:"table_name"`
    BeforeData json.RawMessage `json:"before_data"` // 变更前数据
    AfterData  json.RawMessage `json:"after_data"`  // 变更后数据
    SQLType    string          `json:"sql_type"`    // INSERT/UPDATE/DELETE
    Status     string          `json:"status"`      // NORMAL/ROLLBACKED
}

// ATDataSource AT模式数据源包装器
type ATDataSource struct {
    db *sql.DB
}

// ATUpdate 执行UPDATE并自动记录undo_log
func (d *ATDataSource) ATUpdate(ctx context.Context, txID, branchID, table string,
    setSQL, whereSQL string, args []interface{}) error {

    tx, err := d.db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // 1. 查询变更前数据（before image）
    beforeRows, err := tx.QueryContext(ctx,
        fmt.Sprintf("SELECT * FROM %s WHERE %s", table, whereSQL), args...)
    if err != nil {
        return fmt.Errorf("query before image failed: %w", err)
    }
    beforeData, err := rowsToJSON(beforeRows)
    beforeRows.Close()
    if err != nil {
        return fmt.Errorf("parse before image failed: %w", err)
    }

    // 2. 执行业务SQL
    result, err := tx.ExecContext(ctx,
        fmt.Sprintf("UPDATE %s SET %s WHERE %s", table, setSQL, whereSQL), args...)
    if err != nil {
        return fmt.Errorf("execute update failed: %w", err)
    }
    affected, _ := result.RowsAffected()
    log.Printf("[AT] %s affected %d rows", table, affected)

    // 3. 查询变更后数据（after image）
    afterRows, err := tx.QueryContext(ctx,
        fmt.Sprintf("SELECT * FROM %s WHERE %s", table, whereSQL), args...)
    if err != nil {
        return fmt.Errorf("query after image failed: %w", err)
    }
    afterData, err := rowsToJSON(afterRows)
    afterRows.Close()
    if err != nil {
        return fmt.Errorf("parse after image failed: %w", err)
    }

    // 4. 记录undo_log
    undoLog := UndoLog{
        TxID:       txID,
        BranchID:   branchID,
        Table:      table,
        BeforeData: beforeData,
        AfterData:  afterData,
        SQLType:    "UPDATE",
        Status:     "NORMAL",
    }
    undoJSON, _ := json.Marshal(undoLog)
    _, err = tx.ExecContext(ctx,
        "INSERT INTO undo_log (tx_id, branch_id, table_name, before_data, after_data, sql_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        undoLog.TxID, undoLog.BranchID, undoLog.Table,
        undoLog.BeforeData, undoLog.AfterData, undoLog.SQLType, undoLog.Status)
    if err != nil {
        return fmt.Errorf("insert undo_log failed: %w", err)
    }

    // 5. 提交本地事务（业务SQL + undo_log一起提交）
    return tx.Commit()
}

// ATRollback AT模式回滚：根据undo_log恢复数据
func (d *ATDataSource) ATRollback(ctx context.Context, txID, branchID string) error {
    tx, err := d.db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // 查询undo_log
    var undoLog UndoLog
    var beforeData, afterData []byte
    err = tx.QueryRowContext(ctx,
        "SELECT tx_id, branch_id, table_name, before_data, after_data, sql_type FROM undo_log WHERE tx_id = ? AND branch_id = ? AND status = 'NORMAL'",
        txID, branchID).Scan(&undoLog.TxID, &undoLog.BranchID, &undoLog.Table,
        &beforeData, &afterData, &undoLog.SQLType)
    if err != nil {
        if err == sql.ErrNoRows {
            return nil // 没有undo_log，可能已经回滚过了
        }
        return fmt.Errorf("query undo_log failed: %w", err)
    }
    undoLog.BeforeData = beforeData
    undoLog.AfterData = afterData

    // 根据before_data生成反向SQL并执行
    // 实际Seata的实现更复杂，需要校验after_data与当前数据是否一致（脏写检测）
    var beforeRecords []map[string]interface{}
    json.Unmarshal(beforeData, &beforeRecords)

    for _, record := range beforeRecords {
        // 构造反向UPDATE
        setParts := []string{}
        args := []interface{}{}
        for k, v := range record {
            if k == "id" {
                continue
            }
            setParts = append(setParts, fmt.Sprintf("%s = ?", k))
            args = append(args, v)
        }
        args = append(args, record["id"])
        setSQL := joinStrings(setParts, ", ")
        _, err = tx.ExecContext(ctx,
            fmt.Sprintf("UPDATE %s SET %s WHERE id = ?", undoLog.Table, setSQL), args...)
        if err != nil {
            return fmt.Errorf("rollback update failed: %w", err)
        }
    }

    // 标记undo_log为已回滚
    _, err = tx.ExecContext(ctx,
        "UPDATE undo_log SET status = 'ROLLBACKED' WHERE tx_id = ? AND branch_id = ?",
        txID, branchID)
    if err != nil {
        return fmt.Errorf("update undo_log status failed: %w", err)
    }

    return tx.Commit()
}

func rowsToJSON(rows *sql.Rows) (json.RawMessage, error) {
    columns, err := rows.Columns()
    if err != nil {
        return nil, err
    }
    var results []map[string]interface{}
    for rows.Next() {
        values := make([]interface{}, len(columns))
        pointers := make([]interface{}, len(columns))
        for i := range values {
            pointers[i] = &values[i]
        }
        if err := rows.Scan(pointers...); err != nil {
            return nil, err
        }
        row := make(map[string]interface{})
        for i, col := range columns {
            row[col] = values[i]
        }
        results = append(results, row)
    }
    return json.Marshal(results)
}

func joinStrings(parts []string, sep string) string {
    result := ""
    for i, p := range parts {
        if i > 0 {
            result += sep
        }
        result += p
    }
    return result
}

func toJSON(v interface{}) json.RawMessage {
    b, _ := json.Marshal(v)
    return b
}
```

### 6.3 Seata全局锁与隔离性

AT模式的隔离性依赖**全局锁**机制：

- **写隔离**：分支事务在提交本地事务前，需要向TC获取全局锁。如果数据正在被其他全局事务操作，需要等待。
- **读隔离**：默认读已提交。如果需要读未提交（读到了全局事务的中间状态），可以使用`SELECT FOR UPDATE`走代理，会检查全局锁。

全局锁的工作流程：

```go
// GlobalLockManager 全局锁管理器（模拟TC端）
type GlobalLockManager struct {
    locks map[string]string // key: "table:primaryKey" -> value: "txID"
    mu    sync.Mutex
}

func (m *GlobalLockManager) AcquireLock(txID, table, pk string) bool {
    m.mu.Lock()
    defer m.mu.Unlock()
    key := fmt.Sprintf("%s:%s", table, pk)
    if owner, ok := m.locks[key]; ok {
        if owner == txID {
            return true // 重入
        }
        return false // 被其他事务持有
    }
    m.locks[key] = txID
    return true
}

func (m *GlobalLockManager) ReleaseLock(txID, table, pk string) {
    m.mu.Lock()
    defer m.mu.Unlock()
    key := fmt.Sprintf("%s:%s", table, pk)
    if m.locks[key] == txID {
        delete(m.locks, key)
    }
}

func (m *GlobalLockManager) ReleaseAllLocks(txID string) {
    m.mu.Lock()
    defer m.mu.Unlock()
    for key, owner := range m.locks {
        if owner == txID {
            delete(m.locks, key)
        }
    }
}
```

### 6.4 Seata TM/RM交互流程

完整的Seata AT事务流程用Go代码模拟：

```go
// SeataClient Seata客户端（模拟TM+RM）
type SeataClient struct {
    tc           *TransactionCoordinator // TC服务端
    dataSource   *ATDataSource
}

// TransactionCoordinator 事务协调者（模拟TC）
type TransactionCoordinator struct {
    globalTx     map[string]*GlobalTransaction
    lockManager  *GlobalLockManager
    mu           sync.Mutex
}

type GlobalTransaction struct {
    TxID     string
    Status   string // BEGIN/COMMITTED/ROLLBACKED
    Branches []BranchTransaction
}

type BranchTransaction struct {
    BranchID  string
    TxID      string
    Resource  string
    Status    string // REGISTERED/COMMITTED/ROLLBACKED
}

// Begin 开启全局事务
func (c *SeataClient) Begin(ctx context.Context) (string, error) {
    txID := generateTxID()
    c.tc.BeginGlobal(txID)
    log.Printf("[Seata] global transaction begun: %s", txID)
    return txID, nil
}

// Commit 提交全局事务
func (c *SeataClient) Commit(ctx context.Context, txID string) error {
    globalTx, err := c.tc.GetGlobalTx(txID)
    if err != nil {
        return err
    }

    // TC通知所有分支提交
    for _, branch := range globalTx.Branches {
        // AT模式：异步删除undo_log即可
        log.Printf("[Seata] branch %s committed (async cleanup undo_log)", branch.BranchID)
        c.tc.UpdateBranchStatus(txID, branch.BranchID, "COMMITTED")
    }
    c.tc.UpdateGlobalStatus(txID, "COMMITTED")
    c.tc.ReleaseAllLocks(txID)
    log.Printf("[Seata] global transaction committed: %s", txID)
    return nil
}

// Rollback 回滚全局事务
func (c *SeataClient) Rollback(ctx context.Context, txID string) error {
    globalTx, err := c.tc.GetGlobalTx(txID)
    if err != nil {
        return err
    }

    // TC通知所有分支回滚（逆序）
    for i := len(globalTx.Branches) - 1; i >= 0; i-- {
        branch := globalTx.Branches[i]
        log.Printf("[Seata] rolling back branch %s", branch.BranchID)
        // AT模式：根据undo_log执行反向SQL
        if err := c.dataSource.ATRollback(ctx, txID, branch.BranchID); err != nil {
            log.Printf("[Seata] branch %s rollback failed: %v, will retry", branch.BranchID, err)
            // 记录失败，异步重试
            continue
        }
        c.tc.UpdateBranchStatus(txID, branch.BranchID, "ROLLBACKED")
    }
    c.tc.UpdateGlobalStatus(txID, "ROLLBACKED")
    c.tc.ReleaseAllLocks(txID)
    log.Printf("[Seata] global transaction rolled back: %s", txID)
    return nil
}

// RegisterBranch 注册并执行分支事务
func (c *SeataClient) RegisterBranch(ctx context.Context, txID string,
    action func(branchID string) error) error {
    branchID := generateBranchID()

    // 向TC注册分支
    c.tc.RegisterBranch(txID, branchID)

    // 执行分支事务
    if err := action(branchID); err != nil {
        return err
    }
    return nil
}

// 使用示例：下单流程
func (c *SeataClient) CreateOrder(ctx context.Context, req OrderReq) error {
    // 1. 开启全局事务
    txID, err := c.Begin(ctx)
    if err != nil {
        return err
    }

    // 确保异常时回滚
    committed := false
    defer func() {
        if !committed {
            c.Rollback(ctx, txID)
        }
    }()

    // 2. 分支1：创建订单
    err = c.RegisterBranch(ctx, txID, func(branchID string) error {
        return c.dataSource.ATUpdate(ctx, txID, branchID, "orders",
            "status = 'created'", "id = ?", []interface{}{req.OrderID})
    })
    if err != nil {
        return fmt.Errorf("create order failed: %w", err)
    }

    // 3. 分支2：扣减库存
    err = c.RegisterBranch(ctx, txID, func(branchID string) error {
        return c.dataSource.ATUpdate(ctx, txID, branchID, "stock",
            "quantity = quantity - ?", "product_id = ?",
            []interface{}{req.Quantity, req.ProductID})
    })
    if err != nil {
        return fmt.Errorf("deduct stock failed: %w", err)
    }

    // 4. 提交全局事务
    if err := c.Commit(ctx, txID); err != nil {
        return fmt.Errorf("commit failed: %w", err)
    }
    committed = true
    return nil
}
```

> Seata AT模式的精妙之处在于：它把分布式事务的复杂性藏在了框架层，业务代码只管写单机事务。代价是性能损耗和全局锁争用。天下没有免费的午餐，只是账单换了一个人来付。

### 6.5 Seata各模式选型建议

根据我这几年的实战经验，给出以下选型建议：

**选型决策步骤：**

1. **业务一致性要求强吗？**（如金融核心交易）
   - 是 → 考虑XA模式（性能要求不高）或TCC模式（性能要求高）
   - 否 → 继续下一步

2. **流程步骤多吗？**（>3步）
   - 多 → Saga模式
   - 少 → 继续下一步

3. **能改业务代码吗？**
   - 不能 → AT模式（零侵入）
   - 能 → TCC模式（隔离性更好）

4. **有没有热点数据？**
   - 有 → TCC（AT的全局锁可能成为瓶颈）
   - 没有 → AT模式

```go
// 选型伪代码
func ChooseSeataMode(req Requirement) string {
    if req.StrongConsistency {
        if req.HighPerformance {
            return "TCC"
        }
        return "XA"
    }
    if req.LongFlow {
        return "Saga"
    }
    if !req.CanModifyCode {
        return "AT"
    }
    if req.HasHotspot {
        return "TCC"
    }
    return "AT"
}
```

---

## 七、各方案横向对比与选型总结

### 7.1 全面对比表

| 维度 | 2PC | 3PC | TCC | Saga | Seata AT |
|------|-----|-----|-----|------|----------|
| 一致性 | 强一致 | 强一致 | 最终一致 | 最终一致 | 最终一致 |
| 可用性 | 低 | 中 | 高 | 高 | 中高 |
| 性能 | 低 | 更低 | 高 | 高 | 中 |
| 侵入性 | 低 | 低 | 高 | 中 | 无 |
| 复杂度 | 中 | 高 | 高 | 中 | 低 |
| 适用场景 | 传统DB | 理论研究 | 金融业务 | 长流程 | 通用业务 |
| 成熟度 | 高 | 低 | 高 | 高 | 高 |

### 7.2 我的实战选型原则

这些年在不同公司不同业务场景摸爬过来，我总结了几条选型原则：

**原则一：能用本地事务就不用分布式事务。**

很多所谓的分布式事务需求，其实可以通过合理的服务拆分和数据建模来避免。比如把订单和库存放在同一个库，用本地事务搞定。

**原则二：用柔性事务，别用刚性事务。**

2PC/3PC在生产环境几乎不可用（除非你用的数据库原生支持且并发量极低）。TCC和Saga才是工程上的主流选择。

**原则三：补偿比预防更重要。**

无论你选哪种方案，都必须设计好补偿机制。因为分布式系统中，失败才是常态。

**原则四：幂等是分布式事务的基石。**

无论Try/Confirm/Cancel还是Saga的正向/补偿操作，都必须幂等。没有幂等，重试就会导致数据错误。

```go
// 幂等通用模板
type IdempotentExecutor struct {
    redis *redis.Client
}

func (e *IdempotentExecutor) Execute(key string, action func() error) error {
    // 用Redis做幂等判断
    ok, err := e.redis.SetNX(context.Background(), key, "1", 24*time.Hour).Result()
    if err != nil {
        return fmt.Errorf("idempotent check failed: %w", err)
    }
    if !ok {
        // 已经执行过了
        return nil
    }

    if err := action(); err != nil {
        // 执行失败，删除key允许重试
        e.redis.Del(context.Background(), key)
        return err
    }
    return nil
}
```

> 分布式事务选型就像选伴侣：没有最好的，只有最合适的。你的业务特点、团队能力、技术栈、性能要求，共同决定了那个"最合适"的答案。

### 7.3 分布式事务落地检查清单

在真正落地分布式事务方案之前，请对照这份清单逐项确认：

**基础设施检查：**
1. [ ] 消息中间件是否可靠（至少支持at-least-once语义）
2. [ ] 数据库是否支持事务（MySQL InnoDB / PostgreSQL）
3. [ ] 是否有分布式ID生成方案（雪花算法/号段模式）
4. [ ] 是否有可靠的重试机制（指数退避、死信队列）
5. [ ] 是否有监控告警体系（事务超时、补偿失败告警）

**业务设计检查：**
1. [ ] 每个事务步骤是否有明确的补偿操作
2. [ ] 补偿操作是否幂等
3. [ ] 正向操作是否幂等
4. [ ] 是否处理了空回滚场景
5. [ ] 是否处理了悬挂事务场景
6. [ ] 超时机制是否完善
7. [ ] 是否有数据对账机制

**运维保障检查：**
1. [ ] 是否有人工干预入口（手动补偿、手动回滚）
2. [ ] 事务日志是否持久化且可查询
3. [ ] 是否有异常数据告警
4. [ ] 是否定期进行容灾演练

---

## 八、理论到实践的桥梁：下一章预告

这一章我们系统学习了分布式事务的理论体系：从ACID到BASE的演变，从2PC到Saga的协议演进，再到Seata的工程实现。理论很重要，但理论不落地就是空中楼阁。

下一章《第12章：分布式事务实践》我们将进入实战编码模式：

1. **手写一个Saga事务框架**：Go语言从零实现，包含协调者、补偿机制、超时重试
2. **集成Seata Go SDK**：在Go微服务中使用Seata
3. **本地消息表方案**：用Go实现最终一致性
4. **最大努力通知方案**：Go实现消息通知+对账
5. **生产环境踩坑实录**：真实案例分享

理论告诉你"应该怎么做"，实践告诉你"做完之后哪些地方会炸"。

> 理论是地图，实践是路况。地图告诉你路线，路况告诉你哪里堵车、哪里修路、哪里有摄像头。

---

## 总结

这一章信息量很大，我们来回顾一下核心知识点：

1. **ACID vs BASE**：强一致性和可用性的trade-off，是分布式事务一切设计的起点
2. **CAP定理**：网络分区下，C和A只能选一个，没有侥幸
3. **刚性事务（2PC/3PC）**：强一致但性能差，工程上很少用
4. **柔性事务（TCC/Saga）**：最终一致、性能好，工程主流
5. **TCC**：Try-Confirm-Cancel三阶段，需处理幂等/空回滚/悬挂
6. **Saga**：长事务拆分+补偿，分编排式和协调式
7. **Seata**：AT模式零侵入，TCC模式隔离性好，Saga模式适合长流程

如果你觉得这篇文章对你有帮助，先收藏起来，下一章实战篇会更硬核。有什么问题或者想讨论的，评论区见，我会逐条回复。

**如果觉得怕浪猫写得还行，点个关注追更不迷路。系列更新到第11章了，还有5章就完结了，坚持住。**

---

**系列进度：11/16**

**下一章预告：第12章《分布式事务实践》-- 手写Saga框架、集成Seata、本地消息表方案，纯实战代码，理论篇看完不过瘾的，下章可以直接抄代码。**

---

**怕浪猫说：** 分布式事务这块，理论不难，难在落地。你把2PC、TCC、Saga的原理理解了，面试基本能过。但真正在生产环境用起来，你会发现理论没告诉你的东西太多了：怎么设计事务日志表、补偿失败了怎么重试、超时怎么设置、热点数据怎么处理、跨库join没了怎么做对账... 这些都是实战篇的内容。理论篇是地基，地基打好了，楼才建得稳。下次见。
