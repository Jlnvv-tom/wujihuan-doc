# 第13章：深入并发模型——select、同步与常见模式

在上一章，我们掌握了Go并发的基石 goroutine 与 channel，学会了如何启动轻量协程、实现协程间通信。本章将在此基础上，深入Go并发模型的核心细节——从 select 多路复用、超时控制等基础技巧，到 WaitGroup、Mutex 等同步原语，再到扇入扇出、单例等高频并发模式，全程配套**简短可运行代码**、表格对比、核心图例，标注官方文档及优质资源链接，帮你快速上手Go并发进阶用法，解决实际开发中的并发场景难题。

提示：所有代码示例均经过简化，可直接复制运行；核心知识点用表格/图例梳理，重点突出；链接均为Go官方或掘金优质资源，方便深入学习。

## 一、select多路复用

select 是Go语言专门为 channel 设计的多路复用机制，类似 Unix 中的 select/poll/epoll，核心作用是：**同时监听多个 channel 的发送/接收操作**，哪个 channel 先就绪（有数据可接收/有空间可发送），就执行对应的分支；若多个同时就绪，随机选择一个执行；若所有 channel 都未就绪，且无 default 分支，则阻塞等待。

### 1.1 核心语法（极简版）

```go
select {
case <-ch1: // 监听ch1接收
    // 逻辑
case ch2 <- data: // 监听ch2发送
    // 逻辑
default: // 可选，所有channel未就绪时执行（非阻塞）
    // 逻辑
}

```

### 1.2 关键特性（表格梳理）

| 特性        | 说明                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| 多路监听    | 可同时监听多个channel的发送/接收，不限数量                               |
| 随机选择    | 多个channel同时就绪时，随机执行一个分支（避免饥饿）                      |
| 阻塞/非阻塞 | 无default：阻塞至任意channel就绪；有default：非阻塞，未就绪则执行default |
| nil channel | 监听nil channel的分支，永远不会被执行                                    |

### 1.3 简短代码示例（3个核心场景）

#### 示例1：基础多路接收

```go
package main

import "fmt"

func main() {
    ch1 := make(chan int)
    ch2 := make(chan string)

    go func() { ch1 <- 100 }()
    go func() { ch2 <- "hello" }()

    // 监听两个channel，哪个先就绪执行哪个
    select {
    case num := <-ch1:
        fmt.Printf("接收ch1：%d\n", num)
    case str := <-ch2:
        fmt.Printf("接收ch2：%s\n", str)
    }
}

```

运行结果（二选一，随机）：
接收ch1：100 或 接收ch2：hello

#### 示例2：带default的非阻塞监听

```go
package main

import "fmt"

func main() {
    ch := make(chan int) // 无缓冲channel，未就绪

    select {
    case num := <-ch:
        fmt.Printf("接收数据：%d\n", num)
    default:
        fmt.Println("所有channel未就绪，执行default")
    }
}

```

运行结果：所有channel未就绪，执行default

#### 示例3：监听发送操作

```go
package main

import "fmt"

func main() {
    ch := make(chan int, 1)
    ch <- 1 // 缓冲区已满

    select {
    case ch <- 2: // 监听发送，缓冲区满则未就绪
        fmt.Println("发送成功")
    default:
        fmt.Println("发送失败，缓冲区已满")
    }
}

```

运行结果：发送失败，缓冲区已满

### 1.4 常见误区（避坑重点）

- select 仅能监听 channel 的发送/接收操作，不能监听普通变量；

- 多个分支同时就绪时，**随机选择**，而非按顺序执行；

- 避免“空select”（无任何case），会导致当前goroutine永久阻塞（panic级问题）。

### 1.5 参考链接

- Go官方文档：[Select statements](https://go.dev/ref/spec#Select_statements)

## 二、超时控制

并发开发中，超时控制是保障系统稳定性的关键——若某个goroutine执行过久（如网络请求超时、数据库查询超时），会导致资源泄露、系统阻塞。Go中无需第三方库，可通过 **select + time.After** 轻松实现超时控制，核心原理：time.After 会返回一个channel，指定时间后发送当前时间，select 监听该channel与业务channel，超时则执行超时分支。

### 2.1 核心原理（图例简化）

```mermaid
graph LR
A[启动业务goroutine] -- 执行任务 --> B[业务channel]
C[time.After(超时时间)] -- 超时后发送时间 --> D[超时channel]
E[select] -- 监听 --> B
E -- 监听 --> D
E -- 业务先就绪 --> F[执行业务逻辑]
E -- 超时先就绪 --> G[执行超时逻辑]
```

### 2.2 简短代码示例（3个高频场景）

#### 示例1：基础超时控制（业务goroutine超时）

```go
package main

import (
    "fmt"
    "time"
)

// 模拟耗时业务（如网络请求）
func doTask() int {
    time.Sleep(2 * time.Second) // 模拟耗时2秒
    return 100
}

func main() {
    ch := make(chan int)

    go func() {
        ch <- doTask() // 业务执行完发送结果
    }()

    // 超时控制：1秒未完成则触发超时
    select {
    case res := <-ch:
        fmt.Printf("业务完成，结果：%d\n", res)
    case <-time.After(1 * time.Second):
        fmt.Println("业务超时（1秒），终止执行")
    }
}

```

运行结果：业务超时（1秒），终止执行

#### 示例2：channel接收超时

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch := make(chan int)

    // 监听ch接收，3秒未收到数据则超时
    select {
    case num := <-ch:
        fmt.Printf("接收数据：%d\n", num)
    case <-time.After(3 * time.Second):
        fmt.Println("接收超时，未收到任何数据")
    }
}

```

运行结果：接收超时，未收到任何数据

#### 示例3：超时后终止goroutine（避免泄露）

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch := make(chan int)
    quit := make(chan struct{}) // 终止信号channel

    go func() {
        for {
            select {
            case ch <- 1: // 持续执行业务
                time.Sleep(500 * time.Millisecond)
            case <-quit: // 接收终止信号，退出goroutine
                fmt.Println("goroutine已终止")
                return
            }
        }
    }()

    // 超时控制：2秒后终止goroutine
    select {
    case res := <-ch:
        fmt.Printf("业务结果：%d\n", res)
    case <-time.After(2 * time.Second):
        fmt.Println("超时，终止goroutine")
        quit <- struct{}{} // 发送终止信号
    }

    time.Sleep(1 * time.Second) // 等待goroutine退出
}

```

### 2.3 关键技巧

| 技巧点              | 说明                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| time.After 注意事项 | time.After 会启动一个goroutine，超时后才释放，高频场景建议复用timer（避免goroutine泄露） |
| 终止goroutine       | 超时后需通过额外channel（如quit）发送终止信号，避免goroutine泄露                         |
| 超时时间选择        | 根据业务场景设置（如网络请求设1-3秒，数据库查询设5秒），避免过短/过长                    |

### 2.4 参考链接

- Go官方文档：[time.After](https://go.dev/pkg/time/#After)

## 三、心跳机制

心跳机制是并发系统中“检测协程/服务存活状态”的核心手段，核心逻辑：**一方（客户端/子goroutine）定期向另一方（服务端/主goroutine）发送“心跳信号”**，接收方若在指定时间内未收到心跳，则判定对方异常，执行重启、告警等逻辑。Go中可通过 **select + time.Ticker** 实现高效心跳。

### 3.1 核心组件（极简说明）

- time.Ticker：定时发送信号的组件，可设置固定间隔，返回一个channel，每次间隔后发送当前时间；

- 心跳信号：通常用空结构体（struct{}）或简单数值，不占用内存；

- 超时判定：接收方通过 select 监听心跳channel和超时channel，未按时收到则判定异常。

### 3.2 简短代码示例（2个核心场景）

#### 示例1：基础心跳（子goroutine向主goroutine发送心跳）

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    heartbeat := make(chan struct{}) // 心跳channel
    quit := make(chan struct{})

    // 子goroutine：每1秒发送一次心跳
    go func() {
        ticker := time.NewTicker(1 * time.Second)
        defer ticker.Stop() // 释放资源

        for {
            select {
            case <-ticker.C:
                heartbeat <- struct{}{} // 发送心跳
            case <-quit:
                fmt.Println("子goroutine退出")
                return
            }
        }
    }()

    // 主goroutine：监听心跳，3秒未收到则判定异常
    for {
        select {
        case <-heartbeat:
            fmt.Println("收到心跳，子goroutine正常")
        case <-time.After(3 * time.Second):
            fmt.Println("未收到心跳，子goroutine异常")
            quit <- struct{}{} // 终止子goroutine
            return
        }
    }
}

```

#### 示例2：双向心跳（主-子goroutine互相检测）

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    mainBeat := make(chan struct{})  // 主goroutine心跳
    subBeat := make(chan struct{})   // 子goroutine心跳
    quit := make(chan struct{})

    // 子goroutine
    go func() {
        ticker := time.NewTicker(1 * time.Second)
        defer ticker.Stop()

        for {
            select {
            case <-ticker.C:
                subBeat <- struct{}{} // 发送子心跳
            case <-mainBeat:
                fmt.Println("子goroutine：收到主心跳")
            case <-quit:
                return
            }
        }
    }()

    // 主goroutine
    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            mainBeat <- struct{}{} // 发送主心跳
        case <-subBeat:
            fmt.Println("主goroutine：收到子心跳")
        case <-time.After(3 * time.Second):
            fmt.Println("心跳超时，程序退出")
            quit <- struct{}{}
            return
        }
    }
}

```

### 3.3 核心注意事项

- time.Ticker 使用后必须调用 `Stop()`，避免资源泄露；

- 心跳间隔需合理（如1-5秒），过短占用资源，过长无法及时检测异常；

- 异常处理：检测到心跳超时后，需执行终止goroutine、重启服务等逻辑，避免资源浪费。

### 3.4 参考链接

- Go官方文档：[time.Ticker](https://go.dev/pkg/time/#Ticker)

## 四、扇入扇出（Fan In/Out）

扇入扇出是Go并发编程中**提高任务处理效率**的核心模式，适用于“大量独立任务并行处理”场景（如批量数据处理、多接口并行调用）。

核心定义（极简）：

- 扇出（Fan Out）：将一个大任务，拆分给多个goroutine并行处理（发散）；

- 扇入（Fan In）：将多个goroutine的处理结果，汇总到一个channel中统一处理（聚合）。

### 4.1 模式示意图（简化）

```mermaid
graph LR
A[主任务] -- 拆分任务 --> B[goroutine1]
A -- 拆分任务 --> C[goroutine2]
A -- 拆分任务 --> D[goroutine3]
B -- 处理结果 --> E[汇总channel]
C -- 处理结果 --> E
D -- 处理结果 --> E
E -- 统一处理 --> F[最终结果]
```

### 4.2 简短代码示例（批量数据处理）

```go
package main

import (
    "fmt"
    "sync"
)

// 单个任务处理（平方计算）
func process(num int) int {
    return num * num
}

// 扇出：拆分任务，多goroutine并行处理
func fanOut(nums []int, wg *sync.WaitGroup, resChan chan<- int) {
    defer wg.Done()
    for _, num := range nums {
        resChan <- process(num)
    }
}

// 扇入：汇总多goroutine结果
func fanIn(resChan <-chan int, count int) []int {
    var result []int
    for i := 0; i < count; i++ {
        result = append(result, <-resChan)
    }
    return result
}

func main() {
    nums := []int{1, 2, 3, 4, 5, 6} // 原始数据
    resChan := make(chan int, len(nums))
    var wg sync.WaitGroup

    // 扇出：拆分2个goroutine处理
    wg.Add(2)
    go fanOut(nums[:3], &wg, resChan) // 处理前3个
    go fanOut(nums[3:], &wg, resChan) // 处理后3个

    // 等待所有扇出goroutine完成，关闭结果channel
    go func() {
        wg.Wait()
        close(resChan)
    }()

    // 扇入：汇总结果
    result := fanIn(resChan, len(nums))
    fmt.Printf("最终结果：%v\n", result) // 输出：[1 4 9 16 25 36]
}

```

### 4.3 核心优势与适用场景（表格）

| 类别     | 详情                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| 核心优势 | 并行处理任务，缩短整体耗时；任务独立，容错性强（单个goroutine异常不影响整体）           |
| 适用场景 | 批量数据处理、多接口并行调用、文件批量读取、计算密集型任务                              |
| 注意事项 | goroutine数量不宜过多（建议≤CPU核心数\*2），避免调度开销；需用WaitGroup等待所有任务完成 |

### 4.4 参考链接

- Go官方博客：[Go Pipelines and cancellation](https://go.dev/blog/pipelines)（扇入扇出核心参考）

## 五、WaitGroup（同步等待组）

WaitGroup 是 sync 包提供的**goroutine同步工具**，核心作用：**等待多个goroutine全部执行完成后，再继续执行主goroutine**，替代了早期的 time.Sleep（不精准、效率低），是并发开发中最常用的同步原语之一。

### 5.1 核心方法（3个，极简说明）

| 方法          | 作用                                                        |
| ------------- | ----------------------------------------------------------- |
| wg.Add(n int) | 设置需要等待的goroutine数量（n为goroutine个数）             |
| wg.Done()     | 当前goroutine执行完成，将等待计数减1（等价于 wg.Add(-1)）   |
| wg.Wait()     | 主goroutine阻塞，直到等待计数变为0（所有goroutine执行完成） |

### 5.2 简短代码示例（2个高频场景）

#### 示例1：基础用法（等待多个goroutine完成）

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

func task(id int, wg *sync.WaitGroup) {
    defer wg.Done() // 确保执行完成后计数减1
    fmt.Printf("任务%d：开始执行\n", id)
    time.Sleep(1 * time.Second) // 模拟耗时
    fmt.Printf("任务%d：执行完成\n", id)
}

func main() {
    var wg sync.WaitGroup

    // 等待3个goroutine
    wg.Add(3)
    go task(1, &wg)
    go task(2, &wg)
    go task(3, &wg)

    fmt.Println("主goroutine：等待所有任务完成...")
    wg.Wait() // 阻塞等待
    fmt.Println("主goroutine：所有任务全部完成")
}

```

#### 示例2：结合扇出模式（等待批量任务）

```go
package main

import (
    "fmt"
    "sync"
)

func process(num int, wg *sync.WaitGroup) {
    defer wg.Done()
    fmt.Printf("处理数据：%d，结果：%d\n", num, num*2)
}

func main() {
    nums := []int{1, 2, 3, 4, 5}
    var wg sync.WaitGroup

    // 扇出：5个goroutine并行处理
    wg.Add(len(nums))
    for _, num := range nums {
        go process(num, &wg)
    }

    wg.Wait()
    fmt.Println("所有数据处理完成")
}

```

### 5.3 常见误区（避坑重点）

- wg.Add(n) 必须在 goroutine 启动前调用，避免主goroutine先执行 wg.Wait() 导致计数为0，提前退出；

- wg.Done() 必须放在 goroutine 执行完成的位置，推荐用 `defer wg.Done()`，确保即使goroutine panic（需 recover）也能执行；

- WaitGroup 是值类型，传递时必须用**指针**，否则会复制一个新的WaitGroup，无法实现同步。

### 5.4 参考链接

- Go官方文档：[sync.WaitGroup](https://go.dev/pkg/sync/#WaitGroup)

## 六、Mutex互斥锁（并发安全）

在并发开发中，当多个goroutine同时访问**同一个共享变量**，且至少有一个goroutine进行“写操作”时，会发生**数据竞争**，导致程序运行结果不可预测。Mutex（互斥锁）是 sync 包提供的核心同步原语，核心作用：**保证同一时间只有一个goroutine能访问共享资源（临界区）**，避免数据竞争。

### 6.1 核心概念（极简）

- 临界区：多个goroutine共同访问的共享资源（如共享变量、全局变量）；

- 互斥锁：通过“加锁-解锁”机制，确保临界区同一时间只有一个goroutine访问；

- 核心方法：Lock()（加锁）、Unlock()（解锁）。

### 6.2 简短代码示例（数据竞争解决）

#### 示例1：数据竞争演示（未加锁）

```go
package main

import (
    "fmt"
    "sync"
)

var count int = 0

func increment(wg *sync.WaitGroup) {
    defer wg.Done()
    for i := 0; i < 1000; i++ {
        count++ // 共享变量写操作，无锁会导致数据竞争
    }
}

func main() {
    var wg sync.WaitGroup
    wg.Add(2)

    go increment(&wg)
    go increment(&wg)

    wg.Wait()
    fmt.Printf("最终count：%d（预期2000，实际随机）\n", count)
}

```

#### 示例2：加Mutex解决数据竞争

```go
package main

import (
    "fmt"
    "sync"
)

var (
    count int = 0
    mu    sync.Mutex // 定义互斥锁
)

func increment(wg *sync.WaitGroup) {
    defer wg.Done()
    for i := 0; i < 1000; i++ {
        mu.Lock()   // 加锁，进入临界区
        count++     // 临界区操作（共享变量）
        mu.Unlock() // 解锁，退出临界区
    }
}

func main() {
    var wg sync.WaitGroup
    wg.Add(2)

    go increment(&wg)
    go increment(&wg)

    wg.Wait()
    fmt.Printf("最终count：%d（预期2000，结果稳定）\n", count)
}

```

### 6.3 关键注意事项（表格）

| 注意点               | 说明                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| Lock/Unlock 成对出现 | 必须用 defer mu.Unlock() 确保解锁，避免goroutine panic导致锁未释放（死锁）   |
| 锁粒度要小           | 临界区代码应尽可能精简，只包裹共享资源操作，减少锁的持有时间（提高并发效率） |
| 避免死锁             | 不要在持有锁的情况下，调用其他可能加锁的函数；不要多个锁交叉持有             |
| 读写分离             | 若读多写少，推荐用 RWMutex（读写锁），提高读操作并发效率（后续补充）         |

### 6.4 参考链接

- Go官方文档：[sync.Mutex](https://go.dev/pkg/sync/#Mutex)

## 七、Once单例（只执行一次）

Once 是 sync 包提供的**单例工具**，核心作用：**保证某个函数在整个程序生命周期中，只被执行一次**，无论有多少个goroutine同时调用，适用于单例初始化、资源一次性加载等场景（替代了传统的双重检查锁，更简洁、安全）。

### 7.1 核心原理与方法

- 核心方法：`once.Do(f func())`，传入需要只执行一次的函数f；

- 核心原理：Once 内部维护一个布尔值和一个互斥锁，确保函数f只被执行一次，后续调用会直接返回，不执行f。

### 7.2 简短代码示例（2个核心场景）

#### 示例1：基础单例初始化

```go
package main

import (
    "fmt"
    "sync"
)

// 单例对象（模拟配置、数据库连接等）
type Config struct {
    AppName string
    Port    int
}

var (
    config *Config
    once   sync.Once // 定义Once实例
)

// 初始化单例（确保只执行一次）
func initConfig() {
    fmt.Println("初始化配置（只执行一次）")
    config = &Config{
        AppName: "Go并发实战",
        Port:    8080,
    }
}

// 获取单例对象
func GetConfig() *Config {
    once.Do(initConfig) // 调用once.Do，确保initConfig只执行一次
    return config
}

func main() {
    var wg sync.WaitGroup
    wg.Add(5)

    // 5个goroutine同时调用GetConfig，验证initConfig只执行一次
    for i := 0; i < 5; i++ {
        go func(id int) {
            defer wg.Done()
            cfg := GetConfig()
            fmt.Printf("goroutine%d：获取配置，AppName=%s，Port=%d\n", id, cfg.AppName, cfg.Port)
        }(i)
    }

    wg.Wait()
}

```

运行结果：
初始化配置（只执行一次）
goroutine0：获取配置，AppName=Go并发实战，Port=8080
goroutine1：获取配置，AppName=Go并发实战，Port=8080
goroutine2：获取配置，AppName=Go并发实战，Port=8080
goroutine3：获取配置，AppName=Go并发实战，Port=8080
goroutine4：获取配置，AppName=Go并发实战，Port=8080

#### 示例2：资源一次性加载（模拟数据库连接）

```go
package main

import (
    "fmt"
    "sync"
)

var (
    dbConn string       // 模拟数据库连接
    once   sync.Once    // 全局Once实例
)

// 模拟数据库连接初始化（耗时操作，需只执行一次）
func initDB() {
    fmt.Println("正在初始化数据库连接...")
    // 模拟耗时操作（如建立TCP连接、认证）
    dbConn = "mysql://user:pass@localhost:3306/db"
    fmt.Println("数据库连接初始化完成")
}

// 获取数据库连接
func GetDBConn() string {
    once.Do(initDB) // 确保initDB只执行一次，即使多goroutine并发调用
    return dbConn
}

func main() {
    var wg sync.WaitGroup
    wg.Add(3)

    // 3个goroutine并发获取数据库连接
    go func() {
        defer wg.Done()
        conn := GetDBConn()
        fmt.Printf("goroutine1：获取DB连接：%s\n", conn)
    }()

    go func() {
        defer wg.Done()
        conn := GetDBConn()
        fmt.Printf("goroutine2：获取DB连接：%s\n", conn)
    }()

    go func() {
        defer wg.Done()
        conn := GetDBConn()
        fmt.Printf("goroutine3：获取DB连接：%s\n", conn)
    }()

    wg.Wait()
    fmt.Println("程序执行完成")
}

```

运行结果：
正在初始化数据库连接...
数据库连接初始化完成
goroutine1：获取DB连接：mysql://user:pass@localhost:3306/db
goroutine2：获取DB连接：mysql://user:pass@localhost:3306/db
goroutine3：获取DB连接：mysql://user:pass@localhost:3306/db
程序执行完成

### 7.3 常见误区（避坑重点）

- once.Do(f) 中的函数f**不能有参数和返回值**，若需传递参数/获取返回值，可通过全局变量、闭包实现（如示例1中的config、示例2中的dbConn）；

- Once 实例必须是**全局或通过指针传递**，若为局部变量，会导致多个Once实例，无法保证函数只执行一次；

- 即使多个goroutine同时调用 once.Do(f)，也只会有一个goroutine执行f，其他goroutine会阻塞等待f执行完成，而非直接返回；

- 避免在f函数中调用 once.Do(f)（递归调用），会导致死锁。

### 7.4 Once vs 双重检查锁（表格对比）

| 对比维度 | sync.Once                                  | 双重检查锁（Double-Check Lock）                         |
| -------- | ------------------------------------------ | ------------------------------------------------------- |
| 简洁度   | 极高，只需调用once.Do(f)，无需手动加锁解锁 | 复杂，需手动加锁、解锁，还要两次判断单例是否初始化      |
| 安全性   | 官方实现，无并发安全问题，适配所有Go版本   | 易出错，需考虑CPU指令重排，低版本Go需用volatile修饰变量 |
| 适用场景 | 单例初始化、资源一次性加载，推荐首选       | 不推荐在Go中使用，仅用于了解并发安全思想                |

### 7.5 参考链接

- Go官方文档：[sync.Once](https://go.dev/pkg/sync/#Once)

## 八、本章总结

本章围绕Go并发进阶核心内容展开，从 select 多路复用、超时控制、心跳机制等基础技巧，到扇入扇出并发模式，再到 WaitGroup、Mutex、Once 三大核心同步原语，全程以“简短可运行代码+避坑提示+优质链接”为核心，覆盖实际开发中80%的并发场景，核心要点汇总如下：

- select：专门用于channel多路监听，支持阻塞/非阻塞模式，多个就绪分支随机选择，避免空select；

- 超时控制：基于 select + time.After 实现，无需第三方库，关键是超时后终止goroutine，避免资源泄露；

- 心跳机制：基于 select + time.Ticker 实现，用于检测goroutine/服务存活，Ticker使用后需调用Stop()；

- 扇入扇出：拆分任务并行处理、汇总结果，提高批量任务效率，注意控制goroutine数量避免调度开销；

- WaitGroup：等待多个goroutine完成，核心是Add/Done/Wait三件套，传递时必须用指针；

- Mutex：解决数据竞争，保证临界区同一时间只有一个goroutine访问，核心是Lock/Unlock成对出现，控制锁粒度；

- Once：保证函数只执行一次，适用于单例初始化、资源加载，比双重检查锁更简洁安全。
