# 第15章：标准库精讲（一）——fmt、os、io、bufio

Golang的强大之处，不仅在于其简洁的语法、高效的并发模型，更在于其内置的**标准库（Standard Library）**——无需额外安装依赖，就能实现格式化输出、文件操作、输入输出、缓冲读写等绝大多数基础开发需求。

本章作为标准库精讲的第一篇，聚焦最常用、最基础的4个标准库：**fmt（格式化输入输出）、os（环境与文件基础）、io（输入输出接口）、bufio（缓冲读写）**。全程遵循“核心用法+极简代码示例+避坑重点+参考链接”的掘金写作逻辑，每个代码示例控制在10行以内（可直接复制运行），不堆砌冗余内容，直击实战痛点，帮你快速掌握这4个标准库的核心用法，轻松应对日常开发场景。

## 一、fmt格式化（fmt包）

fmt包是Go开发中最基础、最常用的标准库，核心作用是**格式化输入（从终端读取输入）和格式化输出（向终端打印内容）**，无需额外依赖，导入即可使用。其核心优势是语法简洁、功能全面，能满足字符串、数字、结构体等各种类型的格式化需求。

核心逻辑：通过“格式化动词”（如%s、%d）指定输出/输入的格式，适配不同数据类型，类比Python的print格式化、C语言的printf。

### 1.1 核心格式化输出（高频用法）

格式化输出是fmt包的核心场景，常用函数有3个：`fmt.Print()`（无换行）、`fmt.Println()`（自动换行）、`fmt.Printf()`（自定义格式化，最常用）。重点掌握`fmt.Printf()`的格式化动词。

#### 1.1.1 常用格式化动词（表格梳理，好记好用）

| **格式化动词** | **适用类型**               | **说明+极简示例**                                                                 |
| -------------- | -------------------------- | --------------------------------------------------------------------------------- |
| %s             | 字符串、字节切片           | 输出字符串，示例：`fmt.Printf("姓名：%s\n", "张三")` → 姓名：张三                 |
| %d             | 整数（int、int64等）       | 输出十进制整数，示例：`fmt.Printf("年龄：%d\n", 25)` → 年龄：25                   |
| %f             | 浮点数（float32、float64） | 输出浮点数，默认6位小数，示例：`fmt.Printf("分数：%f\n", 95.5)` → 分数：95.500000 |
| %.2f           | 浮点数                     | 指定保留2位小数，示例：`fmt.Printf("分数：%.2f\n", 95.5)` → 分数：95.50           |
| %v             | 任意类型                   | 自动适配类型，简化写法，示例：`fmt.Printf("任意值：%v\n", 3.14)` → 任意值：3.14   |
| %+v            | 结构体                     | 输出结构体字段名+值，示例见下方代码                                               |
| %t             | 布尔值（bool）             | 输出true/false，示例：`fmt.Printf("是否成年：%t\n", true)` → 是否成年：true       |

#### 1.1.2 极简代码示例（覆盖高频场景）

```go
package main

import "fmt"

// 定义结构体，测试结构体格式化
type User struct {
    Name string
    Age  int
}

func main() {
    // 1. fmt.Print（无换行）
    fmt.Print("Hello ")
    fmt.Print("Go\n")

    // 2. fmt.Println（自动换行）
    fmt.Println("fmt.Println 自动换行")

    // 3. fmt.Printf（自定义格式化，最常用）
    name := "张三"
    age := 25
    score := 98.5
    user := User{Name: name, Age: age}

    fmt.Printf("姓名：%s，年龄：%d\n", name, age)   // 字符串+整数
    fmt.Printf("分数：%.1f\n", score)             // 浮点数保留1位小数
    fmt.Printf("用户信息：%v\n", user)            // 结构体简化输出
    fmt.Printf("用户详细信息：%+v\n", user)       // 结构体带字段名输出
}
```

运行结果（清晰直观，贴合实战）：

```bash
Hello Go
fmt.Println 自动换行
姓名：张三，年龄：25
分数：98.5
用户信息：{张三 25}
用户详细信息：{Name:张三 Age:25}
```

### 1.2 格式化输入（补充用法）

格式化输入主要用于从终端读取用户输入，常用函数：`fmt.Scan()`（读取简单类型）、`fmt.Scanf()`（按格式读取）、`fmt.Scanln()`（读取一行，自动忽略换行）。

```go
package main

import "fmt"

func main() {
    var name string
    var age int

    // 1. fmt.Scan：读取输入，空格分隔
    fmt.Print("请输入姓名和年龄（空格分隔）：")
    fmt.Scan(&name, &age) // 注意：变量需传指针
    fmt.Printf("你输入的是：%s，%d岁\n", name, age)

    // 2. fmt.Scanf：按格式读取
    var score float64
    fmt.Print("请输入分数（格式：数字）：")
    fmt.Scanf("%.2f", &score)
    fmt.Printf("分数：%.2f\n", score)
}
```

### 1.3 避坑重点（掘金读者高频踩坑）

- 格式化动词与数据类型必须匹配：如用%s接收整数、%d接收字符串，会导致输出异常（无报错，但结果错乱）；

- fmt.Scan系列函数需传指针：如`fmt.Scan(name)`（错误），必须写`fmt.Scan(&name)`（正确），否则无法修改变量值；

- 浮点数格式化：%f默认保留6位小数，如需保留指定位数，用%.nf（n为保留小数位数），避免冗余小数。

### 1.4 参考链接

- Go官方文档（fmt包）：[fmt package - fmt](https://go.dev/pkg/fmt/)

- 掘金优质文（fmt格式化实战）：[Go fmt包详解：格式化输入输出再也不慌](https://juejin.cn/post/6844903902369261575)

## 二、os环境（os包）

os包提供了**与操作系统交互**的核心功能，涵盖环境变量操作、命令行参数读取、系统信息获取、进程控制等基础场景，是Go开发中“适配不同运行环境”的核心工具，用法简洁，无需复杂封装。

核心重点：环境变量（开发/测试/生产环境区分）、命令行参数（脚本开发常用），这两个是日常开发中最高频的用法，优先掌握。

### 2.1 环境变量操作（高频）

环境变量（Environment Variable）用于存储操作系统或应用的配置信息（如数据库地址、端口号、密钥），通过os包可实现“读取、设置、列出”环境变量，适配不同运行环境（如开发环境和生产环境用不同的数据库地址）。

核心函数：`os.Getenv()`（读取环境变量）、`os.Setenv()`（设置环境变量）、`os.Environ()`（列出所有环境变量）。

#### 2.1.1 极简代码示例

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 1. 读取环境变量（最常用）
    // 读取系统默认环境变量（如PATH），或自定义环境变量
    path := os.Getenv("PATH")
    fmt.Printf("系统PATH：%s\n", path[:50]) // 截取前50字符，避免输出过长

    // 读取自定义环境变量，不存在则返回空字符串
    dbHost := os.Getenv("DB_HOST")
    if dbHost == "" {
        dbHost = "localhost" // 兜底默认值，避坑关键
    }
    fmt.Printf("数据库地址：%s\n", dbHost)

    // 2. 设置环境变量（仅当前进程有效，进程结束后失效）
    os.Setenv("DB_PORT", "3306")
    fmt.Printf("数据库端口：%s\n", os.Getenv("DB_PORT"))

    // 3. 列出所有环境变量（返回切片，包含所有环境变量键值对）
    envs := os.Environ()
    fmt.Printf("前3个环境变量：%v\n", envs[:3])
}
```

### 2.2 命令行参数读取（脚本开发常用）

当我们开发命令行工具（如脚本、离线工具）时，常需要通过命令行传入参数（如`go run main.go --name 张三`），os包的`os.Args`切片可直接获取所有命令行参数。

核心逻辑：`os.Args`是一个string切片，第一个元素（os.Args[0]）是程序本身的路径，从第二个元素（os.Args[1]）开始，是传入的命令行参数。

#### 2.2.1 极简代码示例

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // os.Args 获取所有命令行参数
    fmt.Printf("所有命令行参数：%v\n", os.Args)
    fmt.Printf("参数个数：%d\n", len(os.Args))

    // 读取传入的参数（如：go run main.go 张三 25）
    if len(os.Args) < 3 {
        fmt.Println("请传入两个参数：姓名 年龄")
        return
    }

    name := os.Args[1] // 第一个参数（姓名）
    age := os.Args[2]  // 第二个参数（年龄）
    fmt.Printf("你传入的姓名：%s，年龄：%s\n", name, age)
}
```

运行测试（终端执行）：

```bash
# 传入参数运行
go run main.go 张三 25

# 运行结果
所有命令行参数：[./main 张三 25]
参数个数：3
你传入的姓名：张三，年龄：25
```

### 2.3 其他常用功能（补充）

除了环境变量和命令行参数，os包还有两个常用功能，无需深入，掌握用法即可：

- **获取当前工作目录**：`os.Getwd()`，返回当前程序运行的目录路径；

- **退出程序**：`os.Exit(code)`，code=0表示正常退出，code≠0表示异常退出（如`os.Exit(1)`）。

```go
// 补充代码示例
wd, _ := os.Getwd()
fmt.Printf("当前工作目录：%s\n", wd)

// 异常退出（终止程序运行）
// os.Exit(1)
```

### 2.4 避坑重点

- 环境变量兜底：读取环境变量时，务必判断是否为空，设置默认值（如示例中dbHost默认值为localhost），避免因环境变量未设置导致程序报错；

- 命令行参数边界判断：读取os.Args时，需判断切片长度，避免索引越界（如用户未传入足够参数，直接读取os.Args[1]会报错）；

- os.Setenv仅当前进程有效：设置的环境变量，只在当前程序运行的进程中有效，程序结束后自动失效，无法影响操作系统全局环境变量。

### 2.5 参考链接

- Go官方文档（os包）：[os package - os](https://go.dev/pkg/os/)

- 掘金优质文（os包实战）：[Go os包详解：环境变量、命令行参数全掌握](https://juejin.cn/post/7025003854570009863)

## 三、文件操作（os包延伸）

文件操作是开发中的核心场景（如读取配置文件、写入日志、处理文本文件），Go中文件操作主要通过**os包**实现，核心功能涵盖：文件创建、文件读取、文件写入、文件删除、目录操作等，用法简洁，无需额外依赖。

核心逻辑：先通过`os.Open()`、`os.Create()`等函数获取“文件句柄”（\*os.File），再通过文件句柄执行读写操作，最后务必关闭文件句柄（用defer确保），避免资源泄露。

### 3.1 核心文件操作（高频场景）

按“实战场景”分类讲解，每个场景配套极简代码示例，覆盖日常开发80%的需求。

#### 3.1.1 场景1：创建文件（含写入内容）

用`os.Create()`函数创建文件，若文件已存在，会清空文件内容；若文件不存在，会创建新文件。返回文件句柄和错误，需判断错误。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 创建文件（路径：test.txt），返回文件句柄和错误
    file, err := os.Create("test.txt")
    if err != nil {
        fmt.Printf("创建文件失败：%v\n", err)
        return
    }
    defer file.Close() // 延迟关闭文件句柄，确保资源释放（关键）

    // 向文件写入内容（字符串转字节切片）
    content := "Hello Go 文件操作！"
    n, err := file.Write([]byte(content)) // 写入字节切片
    if err != nil {
        fmt.Printf("写入文件失败：%v\n", err)
        return
    }
    fmt.Printf("写入成功，写入字节数：%d\n", n)
}
```

#### 3.1.2 场景2：读取文件内容（完整读取）

用`os.Open()`函数打开文件（只读模式），获取文件句柄后，通过`file.Read()`读取内容，或用`ioutil.ReadAll()`（Go 1.16+推荐用os.ReadFile()）快速读取完整文件。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 方式1：快速读取完整文件（推荐，简洁）
    content, err := os.ReadFile("test.txt")
    if err != nil {
        fmt.Printf("读取文件失败：%v\n", err)
        return
    }
    fmt.Printf("文件内容：%s\n", content)

    // 方式2：打开文件后读取（灵活，可控制读取长度）
    file, err := os.Open("test.txt")
    if err != nil {
        fmt.Printf("打开文件失败：%v\n", err)
        return
    }
    defer file.Close()

    var buf [128]byte // 缓冲区，存储读取的内容
    n, err := file.Read(buf[:]) // 读取内容到缓冲区
    if err != nil {
        fmt.Printf("读取失败：%v\n", err)
        return
    }
    fmt.Printf("读取字节数：%d，内容：%s\n", n, buf[:n])
}
```

#### 3.1.3 场景3：追加内容到文件（不覆盖）

os.Create()会清空文件内容，若需追加内容，需用`os.OpenFile()`函数，指定“追加+写入”模式（os.O_APPEND|os.O_WRONLY）。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 打开文件（追加+写入模式），不存在则创建
    file, err := os.OpenFile("test.txt", os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
    if err != nil {
        fmt.Printf("打开文件失败：%v\n", err)
        return
    }
    defer file.Close()

    // 追加内容
    appendContent := "\n追加的内容：Go yyds！"
    _, err = file.WriteString(appendContent) // 直接写入字符串（更便捷）
    if err != nil {
        fmt.Printf("追加内容失败：%v\n", err)
        return
    }
    fmt.Println("追加内容成功")
}
```

说明：0644是文件权限（Linux/Mac下有效），表示“所有者可读写，其他用户只读”，是常规文件的默认权限。

#### 3.1.4 场景4：删除文件/目录

删除文件用`os.Remove()`，删除目录用`os.RemoveAll()`（递归删除目录下所有内容，包括目录本身）。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 1. 删除文件（test.txt）
    err := os.Remove("test.txt")
    if err != nil {
        fmt.Printf("删除文件失败：%v\n", err)
        return
    }
    fmt.Println("文件删除成功")

    // 2. 删除目录（递归删除，即使目录非空）
    err = os.RemoveAll("test_dir")
    if err != nil {
        fmt.Printf("删除目录失败：%v\n", err)
        return
    }
    fmt.Println("目录删除成功")
}
```

### 3.2 目录操作（补充）

日常开发中，除了文件操作，偶尔需要创建目录、读取目录内容，核心函数：`os.Mkdir()`（创建单个目录）、`os.MkdirAll()`（递归创建多级目录）、`os.ReadDir()`（读取目录内容）。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 1. 递归创建多级目录（如：a/b/c）
    err := os.MkdirAll("a/b/c", 0755)
    if err != nil {
        fmt.Printf("创建目录失败：%v\n", err)
        return
    }
    fmt.Println("多级目录创建成功")

    // 2. 读取目录内容（a/b目录）
    entries, err := os.ReadDir("a/b")
    if err != nil {
        fmt.Printf("读取目录失败：%v\n", err)
        return
    }

    // 遍历目录内容
    for _, entry := range entries {
        fmt.Printf("名称：%s，是否是目录：%t\n", entry.Name(), entry.IsDir())
    }
}
```

### 3.3 避坑重点（高频踩坑）

- 必须关闭文件句柄：打开文件（os.Open、os.Create等）后，务必用defer file.Close()关闭文件句柄，否则会导致文件资源泄露，长期运行可能导致程序异常；

- 判断错误：文件操作（创建、打开、读写、删除）都可能出错（如文件不存在、权限不足），必须判断返回的err，避免程序崩溃；

- os.RemoveAll慎用：递归删除目录，一旦路径写错（如os.RemoveAll("/")），会导致严重后果，生产环境需严格校验删除路径；

- 文件路径：相对路径是相对于当前程序运行目录（os.Getwd()返回的路径），而非代码文件所在目录，避免路径错乱。

### 3.4 参考链接

- Go官方文档（os包文件操作）：[os.File - os package](https://go.dev/pkg/os/#File)

- 掘金优质文（文件操作实战）：[Go 文件操作详解：创建、读取、写入、删除全流程](https://juejin.cn/post/7030003854740010123)

## 四、io接口（io包）

io包是Go标准库中“输入输出”的核心抽象，定义了**通用的I/O接口**（如Reader、Writer），统一了所有输入输出场景的操作规范——无论是文件读写、网络读写、内存读写，都遵循相同的接口定义，实现了“多态”，极大提升了代码的通用性和可扩展性。

核心重点：理解Reader和Writer两个核心接口，这是Go I/O操作的基础，后续bufio、net等包都基于这两个接口实现。

### 4.1 核心接口：Reader（读取接口）

Reader接口定义了“读取数据”的规范，只要某个类型实现了Reader接口（即实现了Read()方法），就可以被当作“读取源”（如文件、内存、网络连接），统一用相同的方式读取数据。

Reader接口源码（极简，来自Go标准库）：

```go
package io

// Reader 读取接口，核心方法是Read
type Reader interface {
    // 从读取源读取数据，写入到p（字节切片）
    // 返回值n：实际读取的字节数；err：错误（读取完成时返回io.EOF）
    Read(p []byte) (n int, err error)
}
```

#### 4.1.1 常用Reader实现（实战中常见）

Go标准库中，很多类型都实现了Reader接口，无需我们自己实现，直接使用即可：

- `*os.File`：文件读取源（如前面文件操作中的file句柄，可通过Read()方法读取文件内容）；

- `strings.Reader`：字符串读取源（将字符串当作读取源，从字符串中读取数据）；

- `bytes.Reader`：字节切片读取源（从字节切片中读取数据）；

- `os.Stdin`：标准输入读取源（从终端读取输入）。

#### 4.1.2 极简代码示例（使用Reader接口读取）

```go
package main

import (
    "bytes"
    "fmt"
    "io"
)

func main() {
    // 1. 字节切片作为读取源（bytes.Reader 实现了Reader接口）
    data := []byte("Hello io.Reader!")
    reader := bytes.NewReader(data)

    // 2. 用Reader接口的Read()方法读取数据
    var buf [128]byte
    n, err := reader.Read(buf[:])
    if err != nil && err != io.EOF { // io.EOF表示读取完成，非错误
        fmt.Printf("读取失败：%v\n", err)
        return
    }

    fmt.Printf("读取字节数：%d，内容：%s\n", n, buf[:n])
}
```

说明：io.EOF是一个特殊的错误，表示“读取已完成”，并非真正的错误，无需处理（可忽略）。

### 4.2 核心接口：Writer（写入接口）

Writer接口定义了“写入数据”的规范，只要某个类型实现了Writer接口（即实现了Write()方法），就可以被当作“写入目标”（如文件、内存、网络连接），统一用相同的方式写入数据。

Writer接口源码（极简，来自Go标准库）：

```go
package io

// Writer 写入接口，核心方法是Write
type Writer interface {
    // 将p（字节切片）中的数据，写入到写入目标
    // 返回值n：实际写入的字节数；err：错误
    Write(p []byte) (n int, err error)
}
```

#### 4.2.1 常用Writer实现（实战中常见）

- `*os.File`：文件写入目标（文件句柄，可通过Write()方法写入文件）；

- `strings.Builder`：字符串写入目标（将数据写入到字符串缓冲区，最终拼接成字符串）；

- `bytes.Buffer`：字节切片写入目标（将数据写入到字节缓冲区）；

- `os.Stdout`：标准输出写入目标（将数据写入到终端，即fmt.Print的底层实现）。

#### 4.2.2 极简代码示例（使用Writer接口写入）

```go
package main

import (
    "bytes"
    "fmt"
    "io"
)

func main() {
    // 1. 字节缓冲区作为写入目标（bytes.Buffer 实现了Writer接口）
    var writer bytes.Buffer

    // 2. 用Writer接口的Write()方法写入数据
    content := []byte("Hello io.Writer!")
    n, err := writer.Write(content)
    if err != nil {
        fmt.Printf("写入失败：%v\n", err)
        return
    }

    fmt.Printf("写入字节数：%d，缓冲区内容：%s\n", n, writer.String())
}
```

### 4.3 io包常用工具函数（实战高频）

io包除了定义核心接口，还提供了一些常用工具函数，简化I/O操作，无需自己封装，重点掌握2个：

- `io.Copy(dst Writer, src Reader)`：将读取源（src）的数据，复制到写入目标（dst），返回复制的字节数（后续“复制数据”章节详细讲）；

- `io.ReadAll(r Reader)`：读取读取源（r）的所有数据，返回字节切片（简化读取操作，无需手动循环读取）。

```go
package main

import (
    "bytes"
    "fmt"
    "io"
)

func main() {
    // 1. io.ReadAll：读取所有数据
    src := bytes.NewReader([]byte("Hello io.ReadAll!"))
    data, err := io.ReadAll(src)
    if err != nil {
        fmt.Printf("读取失败：%v\n", err)
        return
    }
    fmt.Printf("读取所有内容：%s\n", data)

    // 2. io.Copy：复制数据（后续章节详细讲）
    src2 := bytes.NewReader([]byte("Hello io.Copy!"))
    var dst bytes.Buffer
    n, err := io.Copy(&dst, src2)
    if err != nil {
        fmt.Printf("复制失败：%v\n", err)
        return
    }
    fmt.Printf("复制字节数：%d，目标内容：%s\n", n, dst.String())
}
```

### 4.4 避坑重点

- io.EOF不是错误：读取数据时，返回io.EOF表示“读取完成”，无需处理，避免误判为错误导致程序异常；

- 接口的通用性：只要实现了Reader/Writer接口，就可以用相同的方式操作，比如用io.Copy()既可以复制文件内容，也可以复制网络数据，无需区分具体类型；

- Read/Write的返回值：务必关注返回的n（实际读写的字节数），尤其是大数据量读写时，可能出现“部分读写”（n小于传入的字节切片长度），需循环读写确保完成。

### 4.5 参考链接

- Go官方文档（io包）：[io package - io](https://go.dev/pkg/io/)

- 掘金优质文（io接口详解）：[Go io包核心接口：Reader和Writer一篇搞懂](https://juejin.cn/post/7032003854820010243)

## 五、缓冲读写（bufio包）

bufio包是基于io包的**缓冲I/O工具包**，核心作用是“给Reader/Writer增加缓冲区”，减少底层I/O操作的次数，提升读写效率——尤其是在高频、小数据量读写场景（如读取文本文件的每一行、终端输入），缓冲读写的效率远高于直接读写。

核心逻辑：缓冲区本质是一块内存，读取时先将数据读取到缓冲区，后续读取直接从缓冲区获取；写入时先将数据写入到缓冲区，缓冲区满后再一次性写入到底层目标，减少底层I/O调用（底层I/O操作开销较大）。

核心组件：bufio.Reader（缓冲读取）、bufio.Writer（缓冲写入），分别对应io.Reader和io.Writer接口，完全兼容io包的所有操作。

### 5.1 缓冲读取（bufio.Reader）

bufio.Reader基于io.Reader实现，增加了缓冲区，提供了更便捷的读取方法（如读取一行、读取单词），核心用法：先通过`bufio.NewReader()`创建缓冲读取器，再调用其方法读取数据。

高频方法：`ReadLine()`（读取一行）、`ReadString()`（读取到指定分隔符）、`ReadBytes()`（读取到指定分隔符，返回字节切片）。

#### 5.1.1 极简代码示例（读取文件每一行）

读取文本文件的每一行，是日常开发中高频场景，用bufio.Reader的ReadLine()方法最便捷（比直接用os.ReadFile()更灵活）。

```go
package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    // 1. 打开文件（只读模式）
    file, err := os.Open("test.txt")
    if err != nil {
        fmt.Printf("打开文件失败：%v\n", err)
        return
    }
    defer file.Close()

    // 2. 创建缓冲读取器（缓冲区默认大小4096字节，可自定义）
    reader := bufio.NewReader(file)

    // 3. 循环读取每一行
    for {
        // 读取一行（返回字节切片，不含换行符）
        line, err := reader.ReadBytes('\n') // 按换行符分隔
        if err != nil {
            if err.Error() == "EOF" { // 读取完成
                break
            }
            fmt.Printf("读取失败：%v\n", err)
            return
        }
        // 去除换行符，打印内容
        fmt.Printf("读取一行：%s", line)
    }
    fmt.Println("读取完成")
}
```

补充：ReadString('\n')与ReadBytes('\n')用法类似，区别是ReadString返回字符串，ReadBytes返回字节切片，可根据需求选择。

### 5.2 缓冲写入（bufio.Writer）

bufio.Writer基于io.Writer实现，增加了缓冲区，写入数据时先写入缓冲区，缓冲区满后自动刷新到底层目标；也可手动调用`Flush()`方法，将缓冲区的数据立即刷新到底层。

核心注意：缓冲写入后，务必调用Flush()方法（用defer确保），否则缓冲区中的数据可能未写入到底层目标（导致数据丢失）。

#### 5.2.1 极简代码示例（缓冲写入文件）

```go
package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    // 1. 打开文件（写入模式，不存在则创建）
    file, err := os.Create("buf_test.txt")
    if err != nil {
        fmt.Printf("创建文件失败：%v\n", err)
        return
    }
    defer file.Close()

    // 2. 创建缓冲写入器（默认缓冲区4096字节）
    writer := bufio.NewWriter(file)
    defer writer.Flush() // 延迟刷新缓冲区，确保数据写入文件（关键）

    // 3. 缓冲写入内容（多次写入，先存到缓冲区）
    content1 := "缓冲写入第一行\n"
    content2 := "缓冲写入第二行\n"

    _, err = writer.WriteString(content1)
    if err != nil {
        fmt.Printf("写入失败：%v\n", err)
        return
    }

    _, err = writer.WriteString(content2)
    if err != nil {
        fmt.Printf("写入失败：%v\n", err)
        return
    }

    fmt.Println("写入完成（缓冲区将自动刷新）")
}
```

说明：defer writer.Flush()必须写在writer创建之后，确保程序退出前，缓冲区的数据全部刷新到底层文件，避免数据丢失。

### 5.3 缓冲读写的优势（对比直接读写）

用表格清晰对比“直接读写（os包）”和“缓冲读写（bufio包）”的区别，理解为什么需要用bufio：

| **对比维度** | **直接读写（os包）**                         | **缓冲读写（bufio包）**                              |
| ------------ | -------------------------------------------- | ---------------------------------------------------- |
| 底层调用次数 | 每次读写都调用底层I/O，次数多，开销大        | 先写入/读取到缓冲区，批量调用底层I/O，次数少，开销小 |
| 效率         | 小数据量、高频读写时，效率极低               | 小数据量、高频读写时，效率提升明显（10倍+）          |
| 便捷性       | 仅提供基础读写方法，无便捷操作（如读取一行） | 提供ReadLine、ReadString等便捷方法，简化开发         |
| 适用场景     | 大数据量、一次性读写（如读取整个大文件）     | 小数据量、高频读写（如读取配置文件每一行、日志写入） |

### 5.4 避坑重点

- 缓冲写入必须Flush()：用bufio.Writer写入后，务必调用Flush()方法（或用defer），否则缓冲区中的数据可能未写入到底层目标，导致数据丢失；

- 缓冲区大小选择：默认缓冲区大小为4096字节（4KB），若读写的单次数据量较大（如1MB），可自定义缓冲区大小（如bufio.NewReaderSize(file, 1024\*1024)）；

- 兼容io包：bufio.Reader和bufio.Writer都实现了io.Reader和io.Writer接口，可与io包的函数（如io.Copy）无缝配合使用。

### 5.5 参考链接

- Go官方文档（bufio包）：[bufio package - bufio](https://go.dev/pkg/bufio/)

- 掘金优质文（bufio实战）：[Go bufio包详解：缓冲读写提升10倍效率](https://juejin.cn/post/7035003854920010543)

## 六、复制数据（io+bufio包结合）

复制数据是I/O操作中的高频场景（如文件复制、数据备份、网络数据转发），Go中复制数据的核心工具是`io.Copy()`函数（io包），结合bufio包的缓冲读写，可实现高效复制——无需手动循环读写，一行代码即可完成复制操作。

核心逻辑：io.Copy(dst Writer, src Reader)，将读取源（src）的数据，自动复制到写入目标（dst），返回复制的字节数和错误；底层会自动处理“部分读写”，循环读取直到src读取完成（返回io.EOF）。

### 6.1 核心复制场景（实战高频）

#### 6.1.1 场景1：文件复制（最常用）

将一个文件的内容，复制到另一个文件，用io.Copy()结合os包的文件操作，一行代码即可完成，高效简洁。

```go
package main

import (
    "fmt"
    "io"
    "os"
)

func main() {
    // 1. 打开源文件（只读模式）
    srcFile, err := os.Open("source.txt")
    if err != nil {
        fmt.Printf("打开源文件失败：%v\n", err)
        return
    }
    defer srcFile.Close()

    // 2. 创建目标文件（写入模式，不存在则创建，存在则清空）
    dstFile, err := os.Create("target.txt")
    if err != nil {
        fmt.Printf("创建目标文件失败：%v\n", err)
        return
    }
    defer dstFile.Close()

    // 3. 复制数据（核心一行代码）
    // srcFile（Reader） → dstFile（Writer）
    n, err := io.Copy(dstFile, srcFile)
    if err != nil {
        fmt.Printf("复制文件失败：%v\n", err)
        return
    }

    fmt.Printf("文件复制成功，复制字节数：%d\n", n)
}
```

#### 6.1.2 场景2：高效文件复制（结合bufio缓冲）

普通io.Copy()已能完成文件复制，但结合bufio包的缓冲读写，可进一步提升复制效率（尤其是小文件、高频复制场景），只需给srcFile和dstFile增加缓冲层即可。

```go
package main

import (
    "bufio"
    "fmt"
    "io"
    "os"
)

func main() {
    // 打开源文件和目标文件（步骤同上）
    srcFile, err := os.Open("source.txt")
    if err != nil {
        fmt.Printf("打开源文件失败：%v\n", err)
        return
    }
    defer srcFile.Close()

    dstFile, err := os.Create("target.txt")
    if err != nil {
        fmt.Printf("创建目标文件失败：%v\n", err)
        return
    }
    defer dstFile.Close()

    // 增加缓冲层（核心优化）
    bufSrc := bufio.NewReader(srcFile)
    bufDst := bufio.NewWriter(dstFile)
    defer bufDst.Flush() // 缓冲写入需刷新

    // 缓冲复制（效率更高）
    n, err := io.Copy(bufDst, bufSrc)
    if err != nil {
        fmt.Printf("复制失败：%v\n", err)
        return
    }

    fmt.Printf("缓冲复制成功，复制字节数：%d\n", n)
}
```

#### 6.1.3 场景3：其他复制场景（拓展）

由于io.Copy()基于Reader和Writer接口，因此可实现任意“Reader→Writer”的复制，不止于文件：

- 内存→文件：bytes.Reader（内存） → \*os.File（文件）；

- 文件→内存：\*os.File（文件） → bytes.Buffer（内存）；

- 标准输入→标准输出：os.Stdin（终端输入） → os.Stdout（终端输出）。

```go
// 示例：标准输入→标准输出（终端输入什么，就打印什么）
package main

import (
    "io"
    "os"
)

func main() {
    // 复制标准输入到标准输出
    io.Copy(os.Stdout, os.Stdin)
}
```

### 6.2 避坑重点

- 关闭文件句柄：复制文件时，源文件和目标文件都需打开，务必用defer关闭，避免资源泄露；

- 缓冲写入需Flush()：结合bufio.Writer复制时，务必调用Flush()方法，确保缓冲区的数据写入目标文件；

- 复制大文件：io.Copy()底层会自动分块复制，无需担心内存溢出

提示：io.Copy()函数本身已具备基础的高效性，底层会根据数据量自动优化读写逻辑；对于超大文件（如1GB以上），无需额外封装，直接使用io.Copy()或结合bufio缓冲即可稳定运行，无需担心内存占用问题。至此，我们已掌握io包与bufio包的核心结合用法，通过接口的通用性和缓冲的高效性，可轻松应对各类I/O复制场景，再结合前文的fmt、os包知识，四大基础标准库的核心实战用法已全部覆盖，足以支撑日常开发中的绝大多数基础场景。

## 七、章节总结与实战拓展（全文闭环）

本章围绕Golang最基础、最常用的4个标准库（fmt、os、io、bufio），按“核心用法+极简代码+避坑重点+参考链接”的实战逻辑，完整覆盖了格式化输入输出、操作系统交互、文件操作、I/O接口、缓冲读写、数据复制六大核心场景，所有代码示例均可直接复制运行，无需额外依赖，精准匹配日常开发80%的基础需求。

### 7.1 核心知识点梳理（快速回顾，便于记忆）

用表格清晰汇总四大标准库的核心定位和高频用法，帮你快速梳理重点，避免混淆：

| **标准库** | **核心定位**        | **高频核心用法**                                                                   |
| ---------- | ------------------- | ---------------------------------------------------------------------------------- |
| fmt        | 格式化输入输出      | fmt.Printf()（自定义格式化）、fmt.Scan()（读取输入）、%s/%d/%+v等格式化动词        |
| os         | 与操作系统/文件交互 | 环境变量（Getenv/Setenv）、命令行参数（os.Args）、文件操作（Create/Open/ReadFile） |
| io         | I/O接口抽象与工具   | Reader/Writer核心接口、io.Copy()（数据复制）、io.ReadAll()（读取全部数据）         |
| bufio      | 缓冲读写优化        | bufio.Reader（读取一行）、bufio.Writer（缓冲写入）、Flush()（刷新缓冲区）          |

### 7.2 实战避坑汇总（高频踩坑终极总结）

结合前文各章节避坑重点，汇总10个日常开发中最容易踩的坑，帮你规避低级错误，提升开发效率：

- fmt包：格式化动词与数据类型必须匹配（如%s不能接收整数）；Scan系列函数必须传变量指针，否则无法赋值。

- os包：读取环境变量务必设置兜底默认值，避免未配置环境变量导致程序异常；os.Setenv设置的环境变量仅当前进程有效。

- 文件操作：打开文件后必须用defer关闭句柄；os.RemoveAll递归删除需严格校验路径，避免误删重要文件；相对路径基于程序运行目录，而非代码文件目录。

- io包：io.EOF是读取完成的标志，并非错误，无需处理；Read/Write可能出现部分读写，大数据量需循环确保读写完整。

- bufio包：缓冲写入后必须调用Flush()，否则缓冲区数据可能丢失；可根据读写量自定义缓冲区大小，提升效率。

- 数据复制：结合bufio缓冲可提升小文件复制效率；复制完成后需确保源文件、目标文件及缓冲写入器均正常关闭/刷新。

### 7.3 实战拓展提示（进阶方向）

本章讲解的是四大标准库的基础核心用法，掌握后可结合以下方向进一步拓展，适配更复杂的开发场景：

1. 进阶标准库学习：后续可学习`ioutil`（文件工具，Go 1.16+部分功能整合到os包）、`bytes`（字节操作）、`strings`（字符串操作），与本章内容无缝衔接。

2. 实战场景封装：可将高频文件操作、数据复制、环境变量读取等逻辑封装成工具函数（如文件复制工具、配置读取工具），提升代码复用性。

3. 性能优化：针对超大文件复制、高频读写场景，可自定义bufio缓冲区大小，或结合`io.CopyBuffer()`实现更灵活的缓冲控制；小文件批量复制可引入并发，提升效率。

4. 错误处理优化：实际开发中可结合`errors`包或第三方错误处理库，对I/O操作、文件操作的错误进行更详细的封装和日志记录，便于问题排查。

### 7.4 学习建议

学习Golang标准库的核心原则是“先会用，再深究”：先掌握本章讲解的核心用法和代码示例，能独立完成格式化输出、文件操作、数据复制等基础场景开发；后续再深入阅读标准库源码（如Reader/Writer接口实现、bufio缓冲区原理），理解底层逻辑，提升技术深度。

此外，建议多结合实际开发场景练习，比如用本章知识实现“日志写入工具”“配置文件读取工具”“文件备份脚本”，将知识点落地到实战中，才能真正掌握、灵活运用。

提示：所有代码示例均基于Go 1.21版本，若使用更低版本，部分函数（如os.ReadFile()）可能存在差异，可参考官方文档调整；遇到问题可结合前文参考链接，查阅官方文档或掘金优质实战文，快速解决问题。至此，本章四大标准库精讲内容全部完成，祝你在Golang开发中灵活运用这些基础工具，高效完成开发需求！
