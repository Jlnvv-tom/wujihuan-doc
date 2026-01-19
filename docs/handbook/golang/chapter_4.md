# 第4章、简单数据类型详解——整型、浮点、布尔与字符串

大家好～ 上一章我们初步认识了Go的基本数据类型，今天我们深入拆解最常用的四类简单数据类型：**整型、浮点型、布尔型、字符串**。这四类类型是日常开发的“基石”，掌握它们的细节（比如整型的长度差异、字符串的不可变性、UTF-8编码问题），能帮你避开很多坑，写出更高效、更健壮的代码。

本文会结合具体场景和代码示例，把每个类型的核心特性、使用注意事项讲透，还会补充性能优化点和实用工具，建议边看边敲代码验证，加深理解。

## 1. 整型类型：int、int8、int32、int64

整型是用来存储整数的类型，Go提供了多种“带长度”的整型，核心差异在于**取值范围**和**内存占用**。日常开发中最容易混淆的就是`int`和`int32/int64`，我们先把它们的区别讲清楚。

### 1.1 核心特性对比

Go的有符号整型按长度分为4类，关键信息如下表：

| 类型  | 内存占用（字节）             | 取值范围                                   | 核心特点                                                           |
| ----- | ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| int8  | 1                            | -128 ~ 127                                 | 最小的有符号整型，适合存储小范围整数（如状态码、枚举值）           |
| int16 | 2                            | -32768 ~ 32767                             | 适用于中等范围整数（如短字符串长度、小数量级计数）                 |
| int32 | 4                            | -2147483648 ~ 2147483647                   | 常用类型，对应C语言的int，适合大多数计数场景（如数组索引、用户ID） |
| int64 | 8                            | -9223372036854775808 ~ 9223372036854775807 | 大范围整数，适合存储大数值（如时间戳、文件大小、大数据量计数）     |
| int   | 32位系统4字节，64位系统8字节 | 随系统变化                                 | 默认整型，兼容性好，但跨平台可能有问题（不推荐用于精确数值存储）   |

### 1.2 实战选型建议

很多新手习惯用默认的`int`，但在实际开发中，为了代码的**跨平台一致性**和**内存优化**，更推荐明确指定整型长度：

- 存储小范围整数（如0-100的状态码）：用`int8`，节省内存；

- 普通计数场景（如循环次数、列表长度）：用`int32`，兼顾内存和范围；

- 存储大数值（如时间戳（time.Time的UnixNano返回int64）、文件大小）：必须用`int64`，避免溢出；

- 跨平台项目：绝对不要用`int`存储需要精确传递的数值（如RPC接口参数），防止32位和64位系统间数据截断。

### 1.3 代码示例：整型的使用与溢出问题

整型溢出是常见bug，尤其是在循环或数值计算中，我们来看示例：

```go

package main

import "fmt"

func main() {
    // 1. 明确类型的整型使用
    var status int8 = 0  // 状态码：0-成功，1-失败
    var userID int32 = 10001  // 用户ID
    var fileSize int64 = 1024 * 1024 * 1024  // 1GB文件大小

    fmt.Println(status, userID, fileSize)  // 输出：0 10001 1073741824

    // 2. 溢出问题演示（int8的最大值是127）
    var maxInt8 int8 = 127
    maxInt8++  // 溢出：127 + 1 = -128（二进制补码溢出特性）
    fmt.Println("int8溢出后：", maxInt8)  // 输出：int8溢出后：-128

    // 3. 避免溢出：用更大范围的类型
    var num int32 = 2147483647
    // num++  // 若用int32，溢出后会变成-2147483648
    var bigNum int64 = int64(num) + 1  // 转为int64后计算，避免溢出
    fmt.Println("int64计算后：", bigNum)  // 输出：int64计算后：2147483648
}

```

**注意**：Go不会自动检测整型溢出，溢出后会按照二进制补码规则循环（正数溢出变负数，负数溢出变正数），开发时需提前评估数值范围，避免溢出。

## 2. 无符号整型与内存占用

无符号整型（uint系列）只能存储非负整数，取值范围是`0 ~ 2^n - 1`（n是位数）。和有符号整型相比，它的**内存占用相同，但取值范围更大**（因为没有符号位）。

### 2.1 无符号整型类型对比

| 类型          | 内存占用（字节） | 取值范围                 | 适用场景                                            |
| ------------- | ---------------- | ------------------------ | --------------------------------------------------- |
| uint8（byte） | 1                | 0 ~ 255                  | 存储字节数据（如文件内容、ASCII字符），byte是其别名 |
| uint16        | 2                | 0 ~ 65535                | 存储非负中等范围整数（如端口号：0-65535）           |
| uint32        | 4                | 0 ~ 4294967295           | 存储非负大范围整数（如无符号ID、计数器）            |
| uint64        | 8                | 0 ~ 18446744073709551615 | 存储超大非负整数（如磁盘总容量、超大计数）          |
| uint          | 随系统变化       | 随系统变化               | 不推荐使用，跨平台兼容性差                          |

### 2.2 使用注意事项

无符号整型虽然取值范围大，但使用时要格外小心，避免以下坑：

1. **避免和有符号整型混用**：混用会导致编译错误，必须显式转换（且要确保数值在目标类型范围内）；

2. **不要用于可能出现负数的场景**：比如计算差值（a - b，若a < b，无符号类型会溢出为大数）；

3. **byte是uint8的别名**：日常开发中，存储字节数据时用byte更直观（如处理文件、网络传输数据）。

### 2.3 代码示例：无符号整型的正确使用

```go

package main

import "fmt"

func main() {
    // 1. byte（uint8）的使用：存储ASCII字符
    var ch byte = 'A'
    fmt.Println(ch, string(ch))  // 输出：65 A（byte存储的是ASCII码值）

    // 2. 端口号（0-65535）：用uint16
    var port uint16 = 8080
    fmt.Println("端口号：", port)  // 输出：端口号：8080

    // 3. 错误示例：无符号与有符号混用
    var a int32 = 100
    var b uint32 = 200
    // fmt.Println(a + b)  // 编译报错：mismatched types int32 and uint32
    // 正确：显式转换为同一类型（确保数值范围安全）
    fmt.Println(uint32(a) + b)  // 输出：300

    // 4. 错误示例：无符号整型的负数问题
    var c uint8 = 10
    var d uint8 = 20
    // fmt.Println(c - d)  // 输出：246（溢出，不是-10）
    // 正确：先判断大小，避免负数
    if c < d {
        fmt.Println("c < d，无法计算差值")
    } else {
        fmt.Println(c - d)
    }
}

```

## 3. 浮点数与精度问题

浮点数用于存储带有小数的数值，Go提供两种浮点数类型：`float32`（单精度）和`float64`（双精度）。日常开发中最容易踩的坑是**浮点数精度丢失**，我们重点讲这个问题。

### 3.1 浮点数核心特性

| 类型    | 内存占用（字节） | 精度（有效数字） | 适用场景                                                 |
| ------- | ---------------- | ---------------- | -------------------------------------------------------- |
| float32 | 4                | 6-7位            | 对精度要求不高的场景（如游戏图形、粗略测量）             |
| float64 | 8                | 15-17位          | 默认浮点数类型，适用于大多数场景（如金融计算、科学计算） |

**注意**：Go的浮点数遵循IEEE 754标准，和大多数编程语言（如Java、Python）一致。

### 3.2 精度丢失问题（重点！）

由于浮点数的二进制存储特性，有些十进制小数（如0.1）无法被精确表示，会导致精度丢失。这不是Go的问题，而是所有遵循IEEE 754标准的语言都存在的问题。

**代码示例：精度丢失演示**

```go

package main

import "fmt"

func main() {
    // 0.1 + 0.2 不等于 0.3
    a := 0.1
    b := 0.2
    c := 0.3
    fmt.Println(a + b)  // 输出：0.30000000000000004
    fmt.Println(a + b == c)  // 输出：false

    // 解决方法1：使用fmt格式化，保留指定小数位
    fmt.Printf("%.2f\n", a+b)  // 输出：0.30
    if fmt.Sprintf("%.2f", a+b) == fmt.Sprintf("%.2f", c) {
        fmt.Println("相等（保留2位小数）")
    }

    // 解决方法2：使用math包的Equal函数（适合高精度场景）
    import "math"
    if math.Equal(a+b, c) {
        fmt.Println("相等")
    } else {
        fmt.Println("不相等")
    }

    // 解决方法3：使用整数运算（金融场景推荐，如存储分而不是元）
    // 0.1元 = 10分，0.2元 = 20分，总和30分 = 0.3元
    aCent := 10
    bCent := 20
    cCent := 30
    fmt.Println(aCent + bCent == cCent)  // 输出：true
}

```

### 3.3 实战建议

- 日常开发优先用`float64`，精度更高，减少丢失概率；

- 避免直接比较两个浮点数是否相等，推荐用两种方式：① 格式化后比较；② 计算两者差值的绝对值，判断是否小于某个极小值（如1e-9）；

- 金融计算（如金额）绝对不要用浮点数！推荐用整数（存储分）或专门的高精度库（如`github.com/shopspring/decimal`）。

高精度库参考：[shopspring/decimal（Go常用高精度小数库）](https://pkg.go.dev/github.com/shopspring/decimal)

## 4. 布尔类型与逻辑运算

布尔类型是最简单的数据类型，只有两个值：`true`（真）和`false`（假），主要用于条件判断（如if、for循环）和逻辑运算。

### 4.1 核心特性

- 内存占用：1字节（固定，无论系统是32位还是64位）；

- 零值：`false`（声明后未赋值的布尔变量默认是false）；

- 不可转换：布尔类型不能和其他类型（如int）相互转换（和C语言不同）；

- 不可参与数值运算：不能用+、-、\*、/等运算符操作布尔值。

### 4.2 逻辑运算

Go支持三种基本逻辑运算，用于组合布尔值：

| 运算符                                                                    | 含义           | 示例                                                                                   | 结果           |
| ------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- | -------------- | ---- | --- | ----- | ---- |
| &                                                                         | 逻辑与（短路） | true && false                                                                          | false          |
|                                                                           |                |                                                                                        | 逻辑或（短路） | true |     | false | true |
| !                                                                         | 逻辑非         | !true                                                                                  | false          |
| **短路特性**：逻辑与（&&）如果第一个值是false，第二个值不会计算；逻辑或（ |                | ）如果第一个值是true，第二个值不会计算。这个特性可以用来优化代码（如避免空指针引用）。 |

### 4.3 代码示例：布尔类型的使用

```go

package main

import "fmt"

func main() {
    // 1. 基本使用
    var isPass bool = true
    var isLogin bool  // 零值是false
    fmt.Println(isPass, isLogin)  // 输出：true false

    // 2. 逻辑运算
    a := 10
    b := 20
    // 逻辑与：a>5且b<30
    fmt.Println(a > 5 && b < 30)  // 输出：true
    // 逻辑或：a>15或b<15
    fmt.Println(a > 15 || b < 15)  // 输出：false
    // 逻辑非：a不等于10
    fmt.Println(!(a == 10))  // 输出：false

    // 3. 短路特性示例
    // 由于a>5是true，逻辑或后面的函数不会执行
    fmt.Println(a > 5 || test())  // 输出：true，且不会打印"test执行了"

    // 4. 错误示例：布尔类型与int转换
    // var num int = int(isPass)  // 编译报错：cannot convert isPass (type bool) to type int
}

func test() bool {
    fmt.Println("test执行了")
    return true
}

```

## 5. 字符串的不可变性与底层结构

字符串是Go中最常用的引用类型（虽然使用起来像值类型），核心特性是**不可变性**——一旦创建，字符串的内容就不能被修改。理解这个特性和底层结构，能帮你写出更高效的字符串操作代码。

### 5.1 底层结构

Go的字符串底层是一个结构体，定义在`runtime`包中：

```go

type stringStruct struct {
    str unsafe.Pointer  // 指向底层字节数组的指针
    len int             // 字符串长度（字节数）
}

```

核心要点：

- 字符串的长度是固定的（len字段），修改长度需要创建新字符串；

- 多个字符串可以共享同一个底层字节数组（如字符串切片），节省内存；

- 字符串的“不可变性”本质是底层字节数组不可修改，任何修改操作都会创建新的字节数组。

### 5.2 不可变性的影响

不可变性是把“双刃剑”，优点是线程安全、内存高效（共享字节数组），缺点是修改字符串会产生新对象，频繁修改会影响性能。

**代码示例：字符串不可变性**

```go

package main

import "fmt"

func main() {
    // 1. 字符串不可修改单个字符
    str := "hello"
    // str[0] = 'H'  // 编译报错：cannot assign to str[0]

    // 2. 修改字符串的正确方式：转为切片修改后重新生成字符串
    // 转为[]byte切片（适用于ASCII字符）
    byteSlice := []byte(str)
    byteSlice[0] = 'H'
    newStr := string(byteSlice)
    fmt.Println(newStr)  // 输出：Hello

    // 3. 字符串共享底层数组（切片操作）
    str1 := "abcdefg"
    str2 := str1[1:4]  // 切片：从索引1到4（不包含4），结果是"bcd"
    fmt.Println(len(str1), len(str2))  // 输出：7 3
    // str1和str2共享底层字节数组，str2的len是3
}

```

### 5.3 性能优化建议

频繁修改字符串（如拼接、替换）时，直接用`+`运算符会产生大量临时对象，推荐用`strings.Builder`或`bytes.Buffer`，它们会预分配内存，减少内存拷贝：

```go

package main

import (
    "fmt"
    "strings"
)

func main() {
    // 低效：频繁拼接字符串（产生多个临时对象）
    var str string
    for i := 0; i < 1000; i++ {
        str += fmt.Sprintf("%d", i)
    }
    fmt.Println("低效方式长度：", len(str))

    // 高效：用strings.Builder
    var builder strings.Builder
    for i := 0; i < 1000; i++ {
        builder.WriteString(fmt.Sprintf("%d", i))
    }
    efficientStr := builder.String()
    fmt.Println("高效方式长度：", len(efficientStr))
}

```

参考链接：[strings.Builder官方文档](https://pkg.go.dev/strings#Builder)

## 6. UTF-8编码与rune、byte区别

Go的字符串默认使用UTF-8编码，这是处理多语言（如中文、日文）的基础。但UTF-8编码中，不同字符占用的字节数不同（ASCII字符占1字节，中文占3字节），这就需要区分`byte`和`rune`两个类型。

### 6.1 UTF-8编码基础

- UTF-8是一种可变长编码，兼容ASCII（ASCII字符的UTF-8编码就是其本身）；

- 常见字符占用字节数：① 英文、数字、符号：1字节；② 中文、日文等：3字节；③ 特殊字符（如emoji）：4字节；

- 字符串的`len()`函数返回的是**字节数**，不是字符数（这是新手常踩的坑）。

### 6.2 byte与rune的区别

| 类型 | 本质        | 作用                                  | 适用场景                                    |
| ---- | ----------- | ------------------------------------- | ------------------------------------------- |
| byte | uint8的别名 | 表示1个字节                           | 处理ASCII字符、字节数据（如文件、网络传输） |
| rune | int32的别名 | 表示1个Unicode字符（UTF-8编码的字符） | 处理多语言字符（如中文、日文），统计字符数  |

### 6.3 代码示例：byte与rune的使用

```go

package main

import "fmt"

func main() {
    // 1. len()返回字节数，不是字符数
    str := "你好Go"
    fmt.Println("字节数：", len(str))  // 输出：8（2个中文×3 + 2个字母×1 = 8）

    // 2. 用rune切片统计字符数
    runeSlice := []rune(str)
    fmt.Println("字符数：", len(runeSlice))  // 输出：4（2个中文 + 2个字母）

    // 3. 遍历字符串（byte遍历 vs rune遍历）
    // byte遍历（按字节遍历，中文会被拆分，出现乱码）
    fmt.Println("byte遍历：")
    for i := 0; i < len(str); i++ {
        fmt.Printf("%c ", str[i])  // 输出：ä½  å¥½ G o （乱码）
    }
    fmt.Println()

    // rune遍历（按字符遍历，正确处理中文）
    fmt.Println("rune遍历（for range）：")
    for _, char := range str {
        fmt.Printf("%c ", char)  // 输出：你 好 G o
    }
    fmt.Println()

    // 4. 单个字符的rune表示
    var char rune = '中'
    fmt.Println("'中'的Unicode码：", char)  // 输出：20013
    fmt.Println("'中'的UTF-8编码字节数：", len(string(char)))  // 输出：3
}

```

**关键结论**：

- 处理纯ASCII字符串：用byte或直接操作字符串；

- 处理多语言字符串：必须用rune切片（或for range遍历），避免乱码；

- for range遍历字符串时，会自动将每个字符转为rune类型，不会出现乱码（推荐用这种方式遍历多语言字符串）。

## 7. 字符串常用操作与性能注意点

Go的`strings`包提供了大量字符串操作函数，覆盖拼接、查找、替换、分割等常用场景。我们重点讲高频操作和性能注意点。

### 7.1 高频操作函数

```go

package main

import (
    "fmt"
    "strings"
)

func main() {
    str := "Hello, Go! Hello, World!"

    // 1. 拼接字符串（简单拼接用+，批量拼接用strings.Builder）
    str1 := "Hello"
    str2 := "Go"
    fmt.Println("拼接：", str1+", "+str2)  // 输出：拼接：Hello, Go

    // 2. 查找子串
    fmt.Println("是否包含'Go'：", strings.Contains(str, "Go"))  // 输出：true
    fmt.Println("'Go'第一次出现的索引：", strings.Index(str, "Go"))  // 输出：7
    fmt.Println("'Go'最后一次出现的索引：", strings.LastIndex(str, "Go"))  // 输出：15

    // 3. 替换子串
    // 替换所有"Hello"为"Hi"
    newStr := strings.ReplaceAll(str, "Hello", "Hi")
    fmt.Println("替换后：", newStr)  // 输出：Hi, Go! Hi, World!
    // 替换前2个"Hello"为"Hi"（strings.Replace的第三个参数是替换次数，-1表示全部）
    newStr2 := strings.Replace(str, "Hello", "Hi", 2)
    fmt.Println("替换前2个：", newStr2)

    // 4. 分割与拼接
    parts := strings.Split(str, ", ")  // 按", "分割
    fmt.Println("分割后：", parts)  // 输出：[Hello Go! Hello World!]
    joined := strings.Join(parts, " - ")  // 用" - "拼接
    fmt.Println("拼接后：", joined)  // 输出：Hello - Go! - Hello - World!

    // 5. 大小写转换
    fmt.Println("转大写：", strings.ToUpper(str))
    fmt.Println("转小写：", strings.ToLower(str))

    // 6. 去除首尾空白（空格、换行、制表符等）
    str3 := "  Hello Go  \n"
    fmt.Println("去除空白后：", strings.TrimSpace(str3))  // 输出：Hello Go
}

```

### 7.2 性能注意点

- 避免频繁用`+`拼接字符串：尤其是在循环中，推荐用`strings.Builder`（性能最优）或`bytes.Buffer`；

- strings.Join性能优于多次+拼接：Join会先计算总长度，预分配内存，再进行拼接，适合批量拼接切片中的字符串；

- 避免不必要的字符串拷贝：如字符串切片（str[1:4]）不会拷贝底层数据，直接引用原数组，性能很高；

- 多语言字符串操作注意用rune：如统计字符数、截取子串时，先转为rune切片，避免破坏UTF-8编码（如截取中文时出现乱码）。

参考链接：[strings包官方文档（完整函数列表）](https://pkg.go.dev/strings)

## 8. 类型别名与自定义类型

Go允许通过`type`关键字定义类型别名或自定义类型，用于增强代码的可读性和类型安全性。很多新手会混淆这两个概念，我们来明确区分。

### 8.1 类型别名（Type Alias）

**定义语法**：`type 别名 原类型`

核心特点：

- 类型别名和原类型是“同一个类型”，可以直接相互赋值，无需显式转换；

- 主要作用是简化长类型名（如复杂的结构体类型、函数类型），或解决类型命名冲突。

**代码示例：类型别名**

```go

package main

import "fmt"

// 定义类型别名：MyInt是int的别名
type MyInt int

func main() {
    var a int = 10
    var b MyInt = 20

    // 类型别名可以直接赋值（无需转换）
    a = int(b)  // 虽然可以直接赋值，但显式转换更清晰
    b = MyInt(a)
    fmt.Println(a, b)  // 输出：20 20

    // byte是uint8的别名，rune是int32的别名（Go内置别名）
    var c byte = 'A'
    var d uint8 = c
    fmt.Println(c, d)  // 输出：65 65
}
```

### 8.2 自定义类型（Defined Type）

**定义语法**：`type 自定义类型名 底层类型`

核心特点：

- 自定义类型是“新类型”，和底层类型不相等，不能直接赋值（必须显式转换）；

- 可以为自定义类型添加方法（这是Go实现面向对象的核心方式之一）；

- 主要作用是增强类型安全性（如区分不同含义的int类型），或封装特定行为。

**代码示例：自定义类型**

```go

package main

import "fmt"

// 自定义类型：UserID是底层类型为int的新类型
type UserID int
// 自定义类型：ProductID是底层类型为int的新类型
type ProductID int

// 为UserID添加方法
func (u UserID) String() string {
    return fmt.Sprintf("用户ID：%d", u)
}

func main() {
    var uid UserID = 10001
    var pid ProductID = 20001

    // 错误：自定义类型不能直接赋值（即使底层类型相同）
    // uid = pid  // 编译报错：cannot use pid (type ProductID) as type UserID in assignment

    // 正确：显式转换（需要确保语义正确）
    uid = UserID(pid)
    fmt.Println(uid.String())  // 输出：用户ID：20001

    // 自定义类型与底层类型的转换
    var num int = 30001
    uid = UserID(num)  // 显式转换
    num = int(uid)     // 显式转换
    fmt.Println(num)  // 输出：30001
}

```

### 8.3 实战区别与建议

| 特性         | 类型别名                           | 自定义类型                           |
| ------------ | ---------------------------------- | ------------------------------------ |
| 与原类型关系 | 同一类型，可直接赋值               | 不同类型，需显式转换                 |
| 能否添加方法 | 不能（方法接收者必须是自定义类型） | 可以                                 |
| 使用场景     | 简化长类型名、解决命名冲突         | 增强类型安全性、封装行为（添加方法） |

**建议**：日常开发中，优先使用自定义类型（而非类型别名）来区分不同语义的变量（如UserID和ProductID），避免因类型相同导致的语义混淆bug。

## 总结

本章我们深入拆解了Go的四类简单数据类型，核心要点总结如下：

1. 整型：优先明确长度（int32/int64），避免用默认int，防止跨平台问题和溢出；无符号整型适合非负场景（如字节、端口号）；

2. 浮点数：优先用float64，避免直接比较，金融场景用整数或高精度库；

3. 布尔类型：不可转换、不可参与数值运算，逻辑运算支持短路特性；

4. 字符串：不可变，底层是字节数组；处理多语言用rune，避免乱码；频繁修改用strings.Builder；

5. 类型别名与自定义类型：别名是同一类型，自定义是新类型，后者可添加方法，增强类型安全性。

这些类型是Go开发的基础，建议多动手练习常用操作（如字符串处理、类型转换），熟练掌握后能大幅提升编码效率。如果有任何问题，欢迎在评论区交流～
