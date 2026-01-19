# 第3章、基础语法——变量、常量与数据类型

大家好～ 在上一章我们完成了第一个Go程序的编写与运行，初步了解了Go的程序结构。今天我们深入Go的基础语法核心——**变量、常量与数据类型**。这三块是任何编程语言的基石，也是后续写复杂逻辑的前提，建议大家边看边敲代码，把基础打扎实。

Go在变量、常量的设计上很有特色，比如支持多种声明方式、内置iota枚举机制，数据类型体系也简洁严谨，没有冗余的类型。接下来我们逐节拆解，每个知识点都配上可直接运行的代码示例，帮你快速理解。

## 1. 变量的声明方式：var与短声明

变量是用来存储数据的容器，Go提供了多种声明变量的方式，核心分为`var`声明和短声明两种，适用于不同场景。

### 1.1 var声明（通用方式）

`var`是Go中最基础的变量声明关键字，支持多种写法，灵活性高，可在函数内或函数外使用。

**基本语法**：

```go

// 1. 完整声明：var 变量名 类型 = 值
var name string = "Gopher"

// 2. 类型推断：省略类型，Go自动推断
var age = 25  // 自动推断为int类型

// 3. 声明多个变量（分组形式，推荐）
var (
    address string = "Beijing"
    score   float64 = 98.5
    isPass  bool    = true
)

// 4. 只声明不赋值（会赋予零值，后续讲）
var height float32

```

**使用场景**：适合全局变量声明（函数外只能用var）、需要明确指定类型的变量，或批量声明多个变量的场景。

**运行示例**：将上述代码放入main函数中运行，查看变量值：

```go

package main

import "fmt"

func main() {
    var name string = "Gopher"
    var age = 25
    var (
        address string = "Beijing"
        score   float64 = 98.5
        isPass  bool    = true
    )
    var height float32

    fmt.Println(name, age, address, score, isPass, height)
    // 输出：Gopher 25 Beijing 98.5 true 0
}

```

### 1.2 短声明（:=）（函数内专用）

短声明使用`:=`符号，是Go中最简洁的变量声明方式，但有严格的使用限制。

**基本语法**：

```go

// 变量名 := 值（自动推断类型）
username := "Alice"
age := 30
isStudent := false

// 同时声明多个变量
a, b := 10, 20  // a=10（int），b=20（int）

```

**核心限制**：

- 只能在函数内使用（函数外不允许）；

- 必须至少声明一个新变量（不能用来重复声明已存在的变量，除非是多变量声明中包含新变量）；

- 不能指定类型（只能靠Go自动推断）。

**错误示例与修正**：

```go

package main

import "fmt"

// 错误1：函数外使用短声明
// username := "Bob"  // 编译报错：syntax error: non-declaration statement outside function body

func main() {
    var name string = "Alice"
    // 错误2：重复声明单一变量
    // name := "Bob"  // 编译报错：no new variables on left side of :=

    // 正确：多变量声明中包含新变量
    name, age := "Bob", 28  // name重复，但age是新变量，允许
    fmt.Println(name, age)  // 输出：Bob 28
}

```

**使用场景**：函数内局部变量的快速声明，代码简洁高效，是Go开发中最常用的局部变量声明方式。

## 2. 常量定义与iota枚举机制

常量是值不可修改的“固定变量”，用于存储程序运行过程中不会变化的数据（比如π的值、配置项中的固定参数）。Go中用`const`定义常量，还支持`iota`关键字实现简洁的枚举。

### 2.1 基本常量定义

**基本语法**：

```go

// 1. 完整定义：const 常量名 类型 = 值
const Pi float64 = 3.1415926

// 2. 类型推断：省略类型
const MaxScore = 100  // 自动推断为int

// 3. 批量定义（分组形式，推荐）
const (
    AppName  string = "GoDemo"
    Version  = "v1.0.0"
    MaxConn  = 1000  // int类型
    IsProEnv bool    = false
)

```

**核心特性**：

- 常量的值必须是编译期可确定的（不能用运行时才能计算的值，比如函数返回值）；

- 常量一旦定义，值不可修改；

- 支持全局和局部声明（函数内、函数外都可）。

**错误示例**：

```go

package main

import "fmt"

func getNum() int {
    return 100
}

func main() {
    // 错误：常量值不能是运行时计算的函数返回值
    // const Num = getNum()  // 编译报错：const initializer getNum() is not a constant
}

```

### 2.2 iota枚举机制

在很多编程语言中，枚举需要手动给每个值赋值，而Go中的`iota`关键字可以自动生成连续的整数，简化枚举定义。

**核心规则**：

- `iota`只能在`const`分组中使用；

- 每组`const`中，`iota`从0开始，每新增一行常量，`iota`的值自动加1；

- 支持通过表达式自定义枚举值（比如乘、加等运算）。

**示例1：基础枚举**

```go

package main

import "fmt"

// 定义星期枚举
const (
    Sunday    = iota  // 0
    Monday            // 1（自动继承iota，等价于Monday = iota）
    Tuesday           // 2
    Wednesday         // 3
    Thursday          // 4
    Friday            // 5
    Saturday          // 6
)

func main() {
    fmt.Println(Sunday, Monday, Saturday)  // 输出：0 1 6
}

```

**示例2：自定义枚举值**

```go

package main

import "fmt"

// 定义权限级别枚举（2的幂次，支持位运算）
const (
    ReadPermission = 1 << iota  // 1 << 0 = 1（二进制：0001）
    WritePermission             // 1 << 1 = 2（0010）
    ExecutePermission           // 1 << 2 = 4（0100）
    DeletePermission            // 1 << 3 = 8（1000）
)

func main() {
    fmt.Println(ReadPermission, WritePermission, ExecutePermission, DeletePermission)
    // 输出：1 2 4 8

    // 组合权限（位运算）
    rwPermission := ReadPermission | WritePermission
    fmt.Println(rwPermission)  // 输出：3（0011）
}

```

**示例3：跳过枚举值**

```go

package main

import "fmt"

const (
    A = iota  // 0
    B         // 1
    _         // 2（跳过该值）
    D         // 3
    E         // 4
)

func main() {
    fmt.Println(A, B, D, E)  // 输出：0 1 3 4
}

```

## 3. Go的基本数据类型体系

Go是静态类型语言，每个变量都有明确的类型，且类型转换严格。Go的基本数据类型体系简洁清晰，没有冗余类型，主要分为四大类：**数值类型、字符串类型、布尔类型、派生类型**（指针、数组等，后续章节讲）。这里重点讲前三者。

### 3.1 数值类型

数值类型分为整数型和浮点型，支持不同精度的需求。

**1. 整数型**（按长度和有无符号划分）：

| 类型          | 占用字节                     | 取值范围                                   | 说明                                              |
| ------------- | ---------------------------- | ------------------------------------------ | ------------------------------------------------- |
| int8          | 1                            | -128 ~ 127                                 | 有符号8位整数                                     |
| uint8（byte） | 1                            | 0 ~ 255                                    | 无符号8位整数，byte是其别名（常用作字节存储）     |
| int16         | 2                            | -32768 ~ 32767                             | 有符号16位整数                                    |
| uint16        | 2                            | 0 ~ 65535                                  | 无符号16位整数                                    |
| int32（rune） | 4                            | -2147483648 ~ 2147483647                   | 有符号32位整数，rune是其别名（常用作Unicode字符） |
| uint32        | 4                            | 0 ~ 4294967295                             | 无符号32位整数                                    |
| int64         | 8                            | -9223372036854775808 ~ 9223372036854775807 | 有符号64位整数                                    |
| uint64        | 8                            | 0 ~ 18446744073709551615                   | 无符号64位整数                                    |
| int           | 32位系统4字节，64位系统8字节 | 随系统变化                                 | 默认整数类型，日常开发最常用                      |
| uint          | 随系统变化                   | 随系统变化                                 | 无符号默认整数类型，少用                          |

**2. 浮点型**（支持小数，按精度划分）：

| 类型    | 占用字节 | 精度              | 说明                                     |
| ------- | -------- | ----------------- | ---------------------------------------- |
| float32 | 4        | 约6-7位有效数字   | 单精度浮点型                             |
| float64 | 8        | 约15-17位有效数字 | 双精度浮点型，默认浮点类型，日常开发首选 |

**数值类型示例**：

```go

package main

import "fmt"

func main() {
    var a int8 = -128
    var b uint8 = 255
    var c int = 1000  // 默认int类型
    var d float64 = 3.1415926535  // 默认float64类型
    var e byte = 'A'  // byte是uint8别名，存储字符的ASCII码
    var f rune = '中' // rune是int32别名，存储Unicode字符

    fmt.Println(a, b, c, d)  // 输出：-128 255 1000 3.1415926535
    fmt.Println(e, string(e))  // 输出：65 A（ASCII码转字符）
    fmt.Println(f, string(f))  // 输出：20013 中（Unicode码转字符）
}

```

### 3.2 字符串类型（string）

字符串用于存储文本，Go中的字符串是**不可变的**（一旦创建，不能修改单个字符），使用UTF-8编码。

**基本用法**：

```go

package main

import "fmt"

func main() {
    // 1. 双引号定义（支持转义字符）
    var str1 string = "Hello, Go!\n这是换行"
    // 2. 反引号定义（原样输出，不解析转义字符，支持多行）
    var str2 string = `Hello, Go!
这是换行
这是第二行`

    fmt.Println(str1)
    fmt.Println("-----")
    fmt.Println(str2)

    // 3. 字符串拼接
    str3 := "Hello"
    str4 := "World"
    str5 := str3 + " " + str4  // 用+拼接
    fmt.Println(str5)  // 输出：Hello World

    // 4. 字符串长度（按字节计算，UTF-8中中文占3字节）
    fmt.Println(len(str5))        // 输出：11（Hello World共11个字节）
    fmt.Println(len("你好Go"))     // 输出：8（2个中文×3 + 2个字母×1 = 8）
}

```

**注意**：Go中字符串不可变，若要修改字符串，需先转为[]byte或[]rune切片，修改后再转回string（会创建新字符串），示例：

```go

package main

import "fmt"

func main() {
    str := "hello"
    // 错误：字符串不可变，不能直接修改单个字符
    // str[0] = 'H'  // 编译报错：cannot assign to str[0]

    // 正确：转为[]byte切片修改
    byteSlice := []byte(str)
    byteSlice[0] = 'H'
    newStr := string(byteSlice)
    fmt.Println(newStr)  // 输出：Hello

    // 处理中文（用[]rune，避免乱码）
    chineseStr := "你好"
    runeSlice := []rune(chineseStr)
    runeSlice[0] = '我'
    newChineseStr := string(runeSlice)
    fmt.Println(newChineseStr)  // 输出：我好
}

```

### 3.3 布尔类型（bool）

布尔类型只有两个值：`true`（真）和`false`（假），占用1个字节，主要用于条件判断。

**基本用法**：

```go

package main

import "fmt"

func main() {
    var isPass bool = true
    var isFail = false  // 自动推断为bool类型

    fmt.Println(isPass, isFail)  // 输出：true false

    // 布尔类型不能参与数值运算（和其他语言不同）
    // 错误示例：
    // fmt.Println(isPass + 1)  // 编译报错：invalid operation: isPass + 1 (mismatched types bool and int)

    // 正确用法：条件判断
    if isPass {
        fmt.Println("考试通过")
    } else {
        fmt.Println("考试失败")
    }
}

```

## 4. 零值机制与类型默认值

Go有一个很贴心的设计：**任何声明后未赋值的变量，都会被自动赋予对应类型的“零值”**，无需手动初始化。这避免了未初始化变量导致的垃圾值问题，也简化了代码。

**各类型零值**：

```go

package main

import "fmt"

func main() {
    // 数值类型零值：0（所有整数、浮点型）
    var a int     // 0
    var b float64 // 0
    var c byte    // 0

    // 字符串类型零值：空字符串（""）
    var d string  // ""

    // 布尔类型零值：false
    var e bool    // false

    fmt.Println(a, b, c, d == "", e)
    // 输出：0 0 0 true false
}

```

**实用场景**：比如定义结构体时，无需逐个初始化字段，未赋值的字段会自动使用零值，简化代码。后续讲结构体时会详细举例。

## 5. 类型推断与显式转换

Go支持类型推断（自动判断变量类型），但不支持隐式类型转换（不同类型不能直接赋值），必须显式转换。

### 5.1 类型推断

当声明变量时不指定类型，Go会根据赋值的值自动推断类型，这是日常开发中常用的方式，能简化代码。

```go

package main

import "fmt"

func main() {
    // 自动推断为int
    num := 100
    // 自动推断为float64
    score := 98.5
    // 自动推断为string
    name := "Gopher"
    // 自动推断为bool
    isOk := true

    // 用fmt.Printf的%T格式符查看变量类型
    fmt.Printf("num类型：%T\n", num)    // 输出：num类型：int
    fmt.Printf("score类型：%T\n", score)  // 输出：score类型：float64
    fmt.Printf("name类型：%T\n", name)    // 输出：name类型：string
    fmt.Printf("isOk类型：%T\n", isOk)    // 输出：isOk类型：bool
}

```

### 5.2 显式类型转换

Go是强类型语言，不同类型的变量不能直接赋值或运算，必须通过`类型(变量)`的方式进行显式转换。

**基本语法**：`目标类型(源变量)`

**正确示例**：

```go

package main

import "fmt"

func main() {
    var a int = 100
    var b float64

    // 显式转换：int -> float64
    b = float64(a)
    fmt.Println(b)  // 输出：100

    var c float64 = 3.14
    var d int

    // 显式转换：float64 -> int（会截断小数部分，不是四舍五入）
    d = int(c)
    fmt.Println(d)  // 输出：3

    var e byte = 'A'
    var f int = int(e)
    fmt.Println(f)  // 输出：65（ASCII码）
}

```

**错误示例**（隐式转换）：

```go

package main

func main() {
    var a int = 100
    var b float64

    // 错误：隐式转换不允许
    // b = a  // 编译报错：cannot use a (type int) as type float64 in assignment
}

```

**注意**：显式转换只能在兼容的类型之间进行（比如数值类型之间、byte/rune与int之间），不兼容的类型无法转换（比如int和string）。若要实现int转string，需使用`strconv`包，示例：

```go

package main

import (
    "fmt"
    "strconv"
)

func main() {
    var num int = 123
    // int -> string（使用strconv.Itoa）
    str := strconv.Itoa(num)
    fmt.Printf("str类型：%T，值：%s\n", str, str)  // 输出：str类型：string，值：123

    // string -> int（使用strconv.Atoi）
    str2 := "456"
    num2, err := strconv.Atoi(str2)
    if err != nil {
        fmt.Println("转换失败：", err)
    } else {
        fmt.Printf("num2类型：%T，值：%d\n", num2, num2)  // 输出：num2类型：int，值：456
    }
}

```

参考链接：[strconv包官方文档](https://pkg.go.dev/strconv)

## 6. 短变量声明的作用域规则

作用域是指变量的有效范围，在该范围内变量可以被访问，超出范围则无法访问。短变量声明（:=）的作用域规则和var声明基本一致，但有一些细节需要注意。

**核心作用域规则**：

1. 函数内声明的变量（var或:=）：作用域是整个函数，但在代码块（if、for、switch等{}包裹的区域）内声明的变量，作用域仅限于该代码块；

2. 短变量声明在代码块内声明时，若与外部变量同名，会“遮蔽”外部变量（即代码块内访问的是内部变量，外部变量不受影响）；

3. 全局变量（函数外用var声明）：作用域是整个包，包内所有函数都可访问；短变量声明不能用于全局变量。

**示例1：代码块内的作用域**

```go

package main

import "fmt"

func main() {
    // 函数内变量，作用域覆盖整个main函数
    var a int = 10

    if true {
        // 代码块内用:=声明的变量，作用域仅限于if代码块
        b := 20
        fmt.Println(a, b)  // 输出：10 20（可访问a和b）
    }

    fmt.Println(a)  // 输出：10（可访问a）
    // fmt.Println(b)  // 错误：b未定义（超出作用域）
}

```

**示例2：变量遮蔽**

```go

package main

import "fmt"

func main() {
    x := 100  // 外部变量x

    if true {
        x := 200  // 内部变量x，遮蔽外部x
        fmt.Println("内部x：", x)  // 输出：内部x：200（访问内部x）
    }

    fmt.Println("外部x：", x)  // 输出：外部x：100（外部x未被修改）
}

```

**示例3：全局变量与局部变量**

```go

package main

import "fmt"

// 全局变量（var声明），作用域是整个包
var globalVar string = "我是全局变量"

func main() {
    fmt.Println(globalVar)  // 输出：我是全局变量（可访问全局变量）
    testFunc()
}

func testFunc() {
    fmt.Println(globalVar)  // 输出：我是全局变量（其他函数也可访问）
}

// 错误：全局变量不能用短声明
// globalVar2 := "错误示例"  // 编译报错：syntax error: non-declaration statement outside function body

```

## 7. 命名规范：驼峰与导出规则

好的命名规范能让代码更易读、易维护，Go社区有明确的命名规范，核心是“驼峰命名”和“首字母大小写控制导出”。

### 7.1 驼峰命名规则

根据变量/函数/常量的名称长度，分为两种驼峰方式：

- **小驼峰（lowerCamelCase）**：首字母小写，后续单词首字母大写。适用于局部变量、函数内的私有变量/函数；

- **大驼峰（UpperCamelCase）**：首字母大写，后续单词首字母大写。适用于全局变量、函数、结构体、接口等需要导出的标识符。

**示例**：

```go

package main

import "fmt"

// 全局变量（导出，大驼峰）
var UserName string = "Gopher"

// 函数（导出，大驼峰）
func GetUserInfo() string {
    // 局部变量（私有，小驼峰）
    userAge := 25
    return fmt.Sprintf("姓名：%s，年龄：%d", UserName, userAge)
}

func main() {
    fmt.Println(GetUserInfo())  // 输出：姓名：Gopher，年龄：25
}

```

### 7.2 导出规则（首字母大小写）

Go中没有`public`、`private`关键字，而是通过标识符的首字母大小写来控制是否“导出”（即是否能被其他包访问）：

- 首字母大写：可导出，其他包可通过“包名.标识符”访问；

- 首字母小写：不可导出，只能在当前包内访问。

**示例（跨包访问）**：

假设有两个包：`main`包和`utils`包（目录结构如下）：

```text

project/
├── main.go（main包）
└── utils/
    └── tool.go（utils包）

```

1. utils/tool.go（utils包）：

```go

package utils

// 首字母大写，可导出
func GetVersion() string {
    return "v1.0.0"
}

// 首字母小写，不可导出
func getAuthor() string {
    return "Gopher"
}

```

2. main.go（main包）：

```go

package main

import (
    "fmt"
    "project/utils"  // 导入utils包（实际路径根据项目模块调整）
)

func main() {
    // 访问utils包的导出函数（首字母大写）
    fmt.Println(utils.GetVersion())  // 输出：v1.0.0

    // 错误：无法访问不可导出的函数（首字母小写）
    // fmt.Println(utils.getAuthor())  // 编译报错：cannot refer to unexported name utils.getAuthor
}

```

**命名补充规范**：

- 包名：全小写，简洁明了，不使用下划线（比如`utils`、`net/http`）；

- 常量名：若为枚举或全局常量，推荐全大写+下划线（比如`MAX_CONN`）；若为局部常量，可用小驼峰；

- 避免使用关键字作为标识符（Go的关键字共25个，比如`var`、`func`、`if`等）。

Go关键字参考：[Go官方关键字文档](https://go.dev/ref/spec#Keywords)

## 8. 代码格式化与go fmt工具

代码格式不统一会严重影响团队协作效率，Go官方提供了`go fmt`工具，能自动格式化代码，强制统一代码风格，无需手动调整缩进、换行等格式问题。

### 8.1 go fmt的核心作用

- 自动调整缩进（使用4个空格，不推荐制表符）；

- 自动调整换行（比如函数体{}的位置、import分组的格式）；

- 自动调整空格（比如运算符前后、逗号后加空格）；

- 统一代码风格，避免团队内格式争议。

### 8.2 使用方法

`go fmt`是Go工具链自带的，安装Go后即可使用，支持两种常用方式：

**1. 格式化单个文件**

```bash

go fmt main.go

```

执行后，会直接修改`main.go`文件的格式，使其符合规范。

**2. 格式化整个目录（包括子目录）**

```bash

go fmt ./...

```

`./...`表示当前目录及其所有子目录，执行后会格式化目录下所有的.go文件。

### 8.3 集成到IDE（自动格式化）

日常开发中，无需手动执行`go fmt`命令，主流IDE（VS Code、Goland）都支持自动格式化：

- VS Code：安装Go插件后，开启“保存时格式化”。设置路径：File -> Preferences -> Settings，搜索“Format On Save”，勾选即可。

- Goland：默认开启自动格式化，保存文件时会自动调整格式。若需手动触发，可使用快捷键`Ctrl+Alt+L`（Windows）或`Cmd+Opt+L`（Mac）。

### 8.4 示例：格式化前后对比

**格式化前（不规范）**：

```go

package main
import "fmt"
func main(){
var name string="Gopher"
fmt.Println(name)
}

```

**执行go fmt后（规范）**：

```go

package main

import "fmt"

func main() {
    var name string = "Gopher"
    fmt.Println(name)
}

```

## 总结

本章我们掌握了Go基础语法的核心——变量、常量与数据类型，重点总结：

1. 变量声明：var适用于全局/需明确类型的场景，短声明（:=）适用于函数内快速声明，注意作用域规则；

2. 常量：用const定义，iota能简化枚举定义，支持自动生成连续整数；

3. 数据类型：核心是数值、字符串、布尔类型，记住各类型的零值和特性（比如字符串不可变）；

4. 类型转换：Go不支持隐式转换，需用显式转换，不兼容类型（int和string）需用strconv包；

5. 命名与格式：遵循驼峰命名，首字母大小写控制导出；用go fmt自动格式化代码，统一风格。

这些知识点是后续学习流程控制、函数、结构体等内容的基础，建议多写代码练习，比如用变量和常量实现一个简单的计算器，巩固今天的知识点。如果有任何问题，欢迎在评论区交流～
