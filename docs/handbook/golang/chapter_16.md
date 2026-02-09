# 第16章：标准库精讲（二）——net/http、json、time

大家好～ 上一篇我们精讲了Go标准库的基础核心模块，今天继续深挖最常用的3个实用模块：**net/http**（HTTP客户端/服务端）、**encoding/json**（JSON编解码）、**time**（时间处理/定时任务）。

这三个模块是日常Go开发（尤其是Web开发、接口开发）的“高频工具”，几乎所有项目都会用到。本文全程贴合实战，每个知识点配**简短可运行代码**，标注官方文档/权威引用，避免冗余，看完直接上手用！

本文适配Go 1.21+版本，所有代码均可直接复制运行，若有版本差异会特别说明。

## 1. HTTP客户端

net/http包提供了完整的HTTP客户端实现，无需依赖第三方库（如requests），就能轻松发送GET、POST等请求，核心是`http.Get()`、`http.Post()`和`http.Client`结构体。

核心场景：调用第三方接口、爬虫基础请求、服务间通信。

### 1.1 基础GET请求（最常用）

最简单的GET请求，用`http.Get()`一键发送，自动处理TCP连接，无需手动关闭（底层会复用连接）。

```go
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

func main() {
	// 发送GET请求，参数是请求URL
	resp, err := http.Get("https://httpbin.org/get")
	if err != nil {
		fmt.Printf("请求失败：%v\n", err)
		return
	}
	// 延迟关闭响应体（必须做，避免资源泄露）
	defer resp.Body.Close()

	// 读取响应体内容（字节流）
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("读取响应失败：%v\n", err)
		return
	}

	// 转换为字符串并打印
	fmt.Printf("响应状态：%s\n", resp.Status)
	fmt.Printf("响应内容：%s\n", string(body))
}
```

关键说明：

- `resp.Body`必须用`defer`关闭，否则会导致文件描述符泄露，长期运行会引发程序异常；

- `ioutil.ReadAll()`已兼容Go 1.21+，也可替换为`os.ReadFile()`，效果一致；

- 响应状态码可通过`resp.StatusCode`获取（int类型，如200、404）。

### 1.2 基础POST请求

发送POST请求（表单提交、JSON提交），核心用`http.Post()`，需指定请求体类型（Content-Type）。

```go
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
)

func main() {
	// 1. 表单提交（Content-Type: application/x-www-form-urlencoded）
	formData := strings.NewReader("name=golang&age=10")
	resp1, err := http.Post("https://httpbin.org/post", "application/x-www-form-urlencoded", formData)
	if err != nil {
		fmt.Printf("表单请求失败：%v\n", err)
		return
	}
	defer resp1.Body.Close()
	body1, _ := ioutil.ReadAll(resp1.Body)
	fmt.Printf("表单响应：%s\n", string(body1))

	// 2. JSON提交（Content-Type: application/json）
	jsonData := strings.NewReader(`{"name":"golang","version":"1.21"}`)
	resp2, err := http.Post("https://httpbin.org/post", "application/json", jsonData)
	if err != nil {
		fmt.Printf("JSON请求失败：%v\n", err)
		return
	}
	defer resp2.Body.Close()
	body2, _ := ioutil.ReadAll(resp2.Body)
	fmt.Printf("JSON响应：%s\n", string(body2))
}
```

### 1.3 自定义客户端（进阶）

当需要设置超时时间、请求头（如Cookie、Token）、代理时，需用`http.Client`自定义配置，避免使用默认客户端（默认无超时，可能导致请求挂死）。

```go
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"time"
)

func main() {
	// 自定义客户端配置
	client := &http.Client{
		Timeout: 5 * time.Second, // 超时时间（关键：避免请求无限挂起）
		// 可额外配置Transport（代理、TLS等），按需添加
	}

	// 构建请求（可自定义请求头）
	req, err := http.NewRequest("GET", "https://httpbin.org/get", nil)
	if err != nil {
		fmt.Printf("构建请求失败：%v\n", err)
		return
	}
	// 添加请求头（如Token、User-Agent）
	req.Header.Set("User-Agent", "Go-http-client/1.1")
	req.Header.Set("Token", "golang123456")

	// 发送请求
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("请求失败：%v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Printf("响应内容：%s\n", string(body))
}
```

引用来源：[Go官方文档 - http.Client](https://pkg.go.dev/net/http#Client)

## 2. HTTP服务

net/http包不仅能做客户端，还能快速搭建HTTP服务，无需额外依赖，核心是`http.HandleFunc()`（注册路由）和`http.ListenAndServe()`（启动服务）。

Go的HTTP服务是“并发安全”的，底层会为每个请求启动一个goroutine，性能优异，适合快速开发接口服务。

### 2.1 最简HTTP服务

```go
package main

import (
	"fmt"
	"net/http"
)

// 定义处理器函数（处理请求的逻辑）
// w: 用于写入响应；r: 用于读取请求
func helloHandler(w http.ResponseWriter, r *http.Request) {
	// 向客户端返回响应内容
	fmt.Fprintf(w, "Hello Golang! 你访问的路径是：%s", r.URL.Path)
}

func main() {
	// 1. 注册路由：路径"/hello" 对应 helloHandler 处理器
	http.HandleFunc("/hello", helloHandler)

	// 2. 启动HTTP服务：监听本地8080端口，无TLS（http）
	// 第二个参数为nil，使用默认的ServeMux（路由分发器）
	fmt.Println("服务启动成功，监听端口：8080，访问：http://localhost:8080/hello")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("服务启动失败：%v\n", err)
	}
}
```

运行步骤：

1. 运行代码，控制台输出“服务启动成功”；

2. 浏览器访问 `http://localhost:8080/hello`，即可看到响应内容；

3. 访问其他路径（如`/test`），会返回404（默认路由未匹配）。

### 2.2 服务端返回JSON响应

日常开发中，接口常返回JSON格式，需手动设置`Content-Type: application/json`，再写入JSON字符串。

```go
package main

import (
	"encoding/json"
	"net/http"
)

// 定义响应结构体（对应JSON格式）
type UserResp struct {
	Name    string `json:"name"`    // JSON字段名
	Age     int    `json:"age"`     // 结构体字段与JSON字段映射
	Version string `json:"version"`
}

func userHandler(w http.ResponseWriter, r *http.Request) {
	// 1. 设置响应头（必须在写入响应体之前）
	w.Header().Set("Content-Type", "application/json;charset=utf-8")

	// 2. 构建响应数据
	user := UserResp{
		Name:    "Golang标准库",
		Age:     10,
		Version: "1.21",
	}

	// 3. 将结构体转换为JSON字符串（后续JSON编码会详细讲）
	jsonData, err := json.Marshal(user)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError) // 返回500状态码
		w.Write([]byte(`{"error": "JSON编码失败"}`))
		return
	}

	// 4. 返回JSON响应
	w.Write(jsonData)
}

func main() {
	http.HandleFunc("/user", userHandler)
	fmt.Println("服务启动：http://localhost:8080/user")
	http.ListenAndServe(":8080", nil)
}
```

访问 `http://localhost:8080/user`，响应结果：

```json
{
  "name": "Golang标准库",
  "age": 10,
  "version": "1.21"
}
```

### 2.3 启动HTTPS服务

使用`http.ListenAndServeTLS()`启动HTTPS服务，需提供证书文件（.pem）和密钥文件（.key）（可通过openssl生成测试证书）。

```go
package main

import (
	"fmt"
	"net/http"
)

func helloHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "HTTPS服务：Hello Golang!")
}

func main() {
	http.HandleFunc("/", helloHandler)
	// 启动HTTPS服务：证书文件路径、密钥文件路径、监听端口
	err := http.ListenAndServeTLS(":443", "server.pem", "server.key", nil)
	if err != nil {
		fmt.Printf("HTTPS服务启动失败：%v\n", err)
	}
}
```

引用来源：[Go官方文档 - http.ListenAndServe](https://pkg.go.dev/net/http#ListenAndServe)

## 3. 路由处理

路由即“请求路径与处理器的映射关系”，Go标准库默认提供`ServeMux`（路由分发器），支持基础路由匹配，若需复杂路由（如参数路由、正则路由），需使用第三方库（如gorilla/mux）。

### 3.1 标准库默认路由（ServeMux）

默认路由的匹配规则：**前缀匹配**（最长匹配优先），路径末尾带`/`表示“目录”，不带表示“文件”。

```go
package main

import (
	"fmt"
	"net/http"
)

func indexHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "首页：/")
}

func userHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "用户页：/user")
}

func userDetailHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "用户详情页：/user/detail")
}

func main() {
	// 注册3个路由，测试前缀匹配规则
	http.HandleFunc("/", indexHandler)         // 匹配所有未命中的路径（前缀为/）
	http.HandleFunc("/user", userHandler)      // 匹配 /user
	http.HandleFunc("/user/detail", userDetailHandler) // 匹配 /user/detail

	fmt.Println("服务启动：http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
```

测试结果：

- 访问 `/` → 首页（匹配/indexHandler）；

- 访问 `/user` → 用户页（匹配/userHandler，最长匹配）；

- 访问 `/user/detail` → 用户详情页（匹配/userDetailHandler，最长匹配）；

- 访问 `/user/123` → 首页（未匹配其他路由，匹配/）。

### 3.2 自定义ServeMux

默认路由使用全局的`ServeMux`，若需多个路由分发器（如分模块路由），可自定义`&http.ServeMux{}`。

```go
package main

import (
	"fmt"
	"net/http"
)

// 模块1：用户相关路由
func userLogin(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "用户登录：/user/login")
}

// 模块2：商品相关路由
func goodsList(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "商品列表：/goods/list")
}

func main() {
	// 1. 自定义用户模块路由
	userMux := &http.ServeMux{}
	userMux.HandleFunc("/user/login", userLogin)

	// 2. 自定义商品模块路由
	goodsMux := &http.ServeMux{}
	goodsMux.HandleFunc("/goods/list", goodsList)

	// 3. 全局路由分发：将模块路由挂载到全局路径
	http.Handle("/user/", userMux)   // 所有/user/开头的请求，交给userMux处理
	http.Handle("/goods/", goodsMux) // 所有/goods/开头的请求，交给goodsMux处理

	fmt.Println("服务启动：http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
```

### 3.3 第三方路由（gorilla/mux）

标准库路由不支持参数路由（如`/user/{id}`）和正则路由，实际开发中常用`gorilla/mux`（最流行的第三方路由库）。

```go
package main

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux" // 需先安装：go get github.com/gorilla/mux
)

// 处理参数路由：/user/{id}
func userDetailHandler(w http.ResponseWriter, r *http.Request) {
	// 获取路由参数id
	vars := mux.Vars(r)
	userId := vars["id"]
	fmt.Fprintf(w, "用户ID：%s", userId)
}

func main() {
	// 1. 创建mux路由实例
	r := mux.NewRouter()

	// 2. 注册路由（支持参数、正则、方法限制）
	r.HandleFunc("/user/{id}", userDetailHandler).Methods("GET") // 只允许GET请求
	r.HandleFunc("/goods/{id:[0-9]+}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		goodsId := vars["id"]
		fmt.Fprintf(w, "商品ID（数字）：%s", goodsId)
	})

	// 3. 启动服务，使用mux路由
	fmt.Println("服务启动：http://localhost:8080")
	http.ListenAndServe(":8080", r)
}
```

测试结果：

- 访问 `/user/123` → 输出“用户ID：123”；

- 访问 `/goods/456` → 输出“商品ID（数字）：456”；

- 访问 `/goods/abc` → 404（正则限制只能是数字）；

- 用POST请求访问 `/user/123` → 405（方法限制只能GET）。

引用来源：[gorilla/mux 官方文档](https://pkg.go.dev/github.com/gorilla/mux)

## 4. JSON编码

JSON是前后端、服务间通信的主流格式，Go标准库`encoding/json`提供了完整的JSON编解码功能，核心函数：`json.Marshal()`（结构体/切片 → JSON字符串）。

关键：结构体字段必须是**导出的**（首字母大写），否则JSON编码会忽略该字段。

### 4.1 基础编码（结构体→JSON）

```go
package main

import (
	"encoding/json"
	"fmt"
)

// 定义结构体（字段首字母大写，可导出）
type Student struct {
	Name  string `json:"name"`   // json:"name"：指定JSON字段名（小写）
	Age   int    `json:"age"`    // 若不指定，JSON字段名与结构体一致（首字母大写）
	Score int    `json:"score"`
	// 未导出字段（首字母小写），编码时会忽略
	address string
}

func main() {
	// 1. 初始化结构体
	stu := Student{
		Name:    "小明",
		Age:     18,
		Score:   95,
		address: "北京", // 未导出，编码后无此字段
	}

	// 2. JSON编码（结构体 → JSON字节流）
	jsonData, err := json.Marshal(stu)
	if err != nil {
		fmt.Printf("JSON编码失败：%v\n", err)
		return
	}

	// 3. 转换为字符串并打印
	fmt.Printf("JSON字符串：%s\n", string(jsonData))
	// 输出：{"name":"小明","age":18,"score":95}
}
```

### 4.2 常用JSON标签

结构体字段后的`json:"xxx"`是标签，用于控制JSON编码的行为，常用标签如下：

```go
package main

import (
	"encoding/json"
	"fmt"
)

type User struct {
	Name     string `json:"name"`        // 正常映射，JSON字段名name
	Age      int    `json:"age,omitempty"` // omitempty：字段为零值（0、""、nil）时，不显示该字段
	Gender   string `json:"-"`           // "-"：忽略该字段，无论是否有值
	NickName string `json:"nick_name,omitempty"` // 字段名映射+omitempty
}

func main() {
	user1 := User{
		Name:     "小红",
		Age:      0,      // 零值，omitempty生效，不显示age
		Gender:   "女",   // "-"标签，忽略
		NickName: "红红", // 有值，显示nick_name
	}

	json1, _ := json.Marshal(user1)
	fmt.Printf("user1 JSON：%s\n", string(json1))
	// 输出：{"name":"小红","nick_name":"红红"}

	user2 := User{
		Name:     "小李",
		Age:      20,
		Gender:   "男",
		NickName: "", // 零值，omitempty生效，不显示nick_name
	}

	json2, _ := json.Marshal(user2)
	fmt.Printf("user2 JSON：%s\n", string(json2))
	// 输出：{"name":"小李","age":20}
}
```

### 4.3 切片/Map编码

除了结构体，切片、Map也能直接编码为JSON数组/对象，无需额外处理。

```go
package main

import (
	"encoding/json"
	"fmt"
)

func main() {
	// 1. 切片编码（JSON数组）
	slice := []string{"golang", "java", "python"}
	jsonSlice, _ := json.Marshal(slice)
	fmt.Printf("切片JSON：%s\n", string(jsonSlice)) // 输出：["golang","java","python"]

	// 2. Map编码（JSON对象）
	m := map[string]interface{}{
		"name": "golang",
		"version": 1.21,
		"is_ok": true,
	}
	jsonMap, _ := json.Marshal(m)
	fmt.Printf("Map JSON：%s\n", string(jsonMap)) // 输出：{"is_ok":true,"name":"golang","version":1.21}
}
```

引用来源：[Go官方文档 - json.Marshal](https://pkg.go.dev/encoding/json#Marshal)

## 5. JSON解码

JSON解码即“JSON字符串 → 结构体/Map/切片”，核心函数：`json.Unmarshal()`，与编码对应，同样需要注意结构体字段的导出和标签匹配。

### 5.1 基础解码（JSON→结构体）

```go
package main

import (
	"encoding/json"
	"fmt"
)

type Student struct {
	Name  string `json:"name"`
	Age   int    `json:"age"`
	Score int    `json:"score"`
}

func main() {
	// 1. JSON字符串（模拟接口响应）
	jsonStr := `{"name":"小明","age":18,"score":95}`

	// 2. 初始化结构体（用于接收解码后的数据）
	var stu Student

	// 3. JSON解码（JSON字节流 → 结构体）
	err := json.Unmarshal([]byte(jsonStr), &stu) // 注意：第二个参数是指针
	if err != nil {
		fmt.Printf("JSON解码失败：%v\n", err)
		return
	}

	// 4. 打印解码结果
	fmt.Printf("解码后：Name=%s, Age=%d, Score=%d\n", stu.Name, stu.Age, stu.Score)
	// 输出：解码后：Name=小明, Age=18, Score=95
}
```

关键注意：`json.Unmarshal()`的第二个参数必须是**指针**，否则解码后的数据无法赋值给原变量（值传递特性）。

### 5.2 解码到Map（无需定义结构体）

若JSON格式不固定，或不想定义结构体，可解码到`map[string]interface{}`（万能Map），适合快速解析未知格式的JSON。

```go
package main

import (
	"encoding/json"
	"fmt"
)

func main() {
	jsonStr := `{"name":"golang","version":1.21,"is_ok":true,"tags":["http","json","time"]}`

	// 定义万能Map，接收解码后的数据
	var m map[string]interface{}

	// 解码（第二个参数是Map指针）
	err := json.Unmarshal([]byte(jsonStr), &m)
	if err != nil {
		fmt.Printf("解码失败：%v\n", err)
		return
	}

	// 读取Map中的数据（需类型断言）
	fmt.Printf("Name：%s\n", m["name"].(string))       // 字符串类型断言
	fmt.Printf("Version：%v\n", m["version"].(float64)) // 数字类型解码后默认是float64
	fmt.Printf("IsOk：%t\n", m["is_ok"].(bool))        // 布尔类型断言

	// 切片类型断言
	tags := m["tags"].([]interface{})
	for i, tag := range tags {
		fmt.Printf("Tag[%d]：%s\n", i, tag.(string))
	}
}
```

### 5.3 解码JSON数组

JSON数组可解码到切片，需指定切片的类型（如`[]Student`、`[]string`）。

```go
package main

import (
	"encoding/json"
	"fmt"
)

type Student struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func main() {
	// JSON数组字符串
	jsonStr := `[{"name":"小明","age":18},{"name":"小红","age":17},{"name":"小李","age":19}]`

	// 定义切片，接收解码后的数据
	var students []Student

	// 解码（第二个参数是切片指针）
	err := json.Unmarshal([]byte(jsonStr), &students)
	if err != nil {
		fmt.Printf("解码失败：%v\n", err)
		return
	}

	// 遍历切片
	for i, stu := range students {
		fmt.Printf("学生[%d]：Name=%s, Age=%d\n", i, stu.Name, stu.Age)
	}
}
```

引用来源：[Go官方文档 - json.Unmarshal](https://pkg.go.dev/encoding/json#Unmarshal)

## 6. 时间类型

time包是Go标准库中处理时间的核心模块，提供了时间的创建、计算、格式化等功能，核心类型是`time.Time`（时间对象）和`time.Duration`（时间间隔）。

### 6.1 获取当前时间

用`time.Now()`获取当前本地时间，返回`time.Time`对象，可通过方法获取年、月、日、时、分、秒等信息。

```go
package main

import (
	"fmt"
	"time"
)

func main() {
	// 1. 获取当前本地时间
	now := time.Now()
	fmt.Printf("当前时间：%v\n", now) // 输出：2024-05-20 15:30:00.123456789 +0800 CST m=+0.000123456

	// 2. 获取时间的各个组件
	fmt.Printf("年份：%d\n", now.Year())       // 年份：2024
	fmt.Printf("月份：%d\n", now.Month())      // 月份：5（Month类型，可转换为int）
	fmt.Printf("日期：%d\n", now.Day())        // 日期：20
	fmt.Printf("小时：%d\n", now.Hour())       // 小时：15（24小时制）
	fmt.Printf("分钟：%d\n", now.Minute())     // 分钟：30
	fmt.Printf("秒：%d\n", now.Second())      // 秒：0
	fmt.Printf("纳秒：%d\n", now.Nanosecond()) // 纳秒：123456789

	// 3. 获取时间戳（秒级、毫秒级、微秒级、纳秒级）
	fmt.Printf("秒级时间戳：%d\n", now.Unix())         // 秒级时间戳（从1970-01-01 00:00:00 UTC开始）
	fmt.Printf("毫秒级时间戳：%d\n", now.UnixMilli())  // 毫秒级时间戳
	fmt.Printf("微秒级时间戳：%d\n", now.UnixMicro())  // 微秒级时间戳
	fmt.Printf("纳秒级时间戳：%d\n", now.UnixNano())   // 纳秒级时间戳
}
```

### 6.2 时间格式化（重点）

Go的时间格式化与其他语言不同，**不能使用yyyy-MM-dd HH:mm:ss**，而是使用固定的参考时间`Mon Jan 2 15:04:05 MST 2006`（记忆口诀：1月2日3点4分5秒6年）。

```go
package main

import (
	"fmt"
	"time"
)

func main() {
	now := time.Now()

	// 1. 常用格式化格式
	fmt.Printf("格式1（yyyy-MM-dd HH:mm:ss）：%s\n", now.Format("2006-01-02 15:04:05"))
	fmt.Printf("格式2（yyyy年MM月dd日 HH时mm分ss秒）：%s\n", now.Format("2006年01月02日 15时04分05秒"))
	fmt.Printf("格式3（MM/dd/yyyy）：%s\n", now.Format("01/02/2006"))
	fmt.Printf("格式4（HH:mm:ss）：%s\n", now.Format("15:04:05"))

	// 2. 注意：月份和日期若不足两位，会自动补0（使用01、02）
	// 若用1、2，则不补0（如5月显示为5，而非05）
	fmt.Printf("不补0格式：%s\n", now.Format("2006-1-2 3:4:5"))
}
```

### 6.3 时间间隔（time.Duration）

time.Duration表示两个时间之间的间隔，单位有纳秒（ns）、微秒（µs）、毫秒（ms）、秒（s）、分钟（m）、小时（h）等，可直接进行加减运算。

```go
package main

import (
	"fmt"
	"time"
)

func main() {
	now := time.Now()

	// 1. 定义时间间隔（常用单位）
	oneSecond := 1 * time.Second   // 1秒
	oneMinute := 1 * time.Minute   // 1分钟
	oneHour := 1 * time.Hour       // 1小时
	oneMillisecond := 1 * time.Millisecond // 1毫秒

	fmt.Printf("1秒 = %d 纳秒\n", oneSecond.Nanoseconds()) // 1秒 = 1000000000 纳秒

	// 2. 时间加减运算
	later := now.Add(oneMinute)    // 当前时间加1分钟
	earlier := now.Add(-oneSecond) // 当前时间减1秒
	fmt.Printf("1分钟后：%s\n", later.Format("2006-01-02 15:04:05"))
	fmt.Printf("1秒前：%s\n", earlier.Format("2006-01-02 15:04:05"))

	// 3. 计算两个时间的间隔
	diff := later.Sub(now)
	fmt.Printf("时间间隔：%v\n", diff) // 输出：1m0s
	fmt.Printf("间隔（秒）：%f\n", diff.Seconds()) // 输出：60.000000
}
```

引用来源：[Go官方文档 - time包](https://pkg.go.dev/time)

## 7. 定时任务

time包提供了两种常用的定时任务方式：`time.AfterFunc()`（一次性定时）和`time.Ticker`（周期性定时），无需第三方库，就能实现简单的定时功能。

### 7.1 一次性定时任务（time.AfterFunc）

延迟指定时间后，执行一次任务（函数），适合“延迟执行某操作”（如延迟5秒发送通知）。

```go
package main

import (
	"fmt"
	"time"
)

// 定义定时执行的函数
func task() {
	fmt.Println("定时任务执行：延迟3秒后执行，仅执行一次！")
}

func main() {
	fmt.Println("程序启动，开始倒计时3秒...")

	// 一次性定时任务：延迟3秒后执行task函数
	// 返回一个*time.Timer对象，可用于取消任务
	timer := time.AfterFunc(3*time.Second, task)

	// 防止程序提前退出（main函数退出，所有goroutine都会退出）
	time.Sleep(4 * time.Second)

	// 取消定时任务（若任务未执行）
	// timer.Stop()
}
```

关键：main函数需延迟退出（如`time.Sleep()`），否则main函数结束，定时任务的goroutine也会被终止，任务无法执行。

### 7.2 周期性定时任务（time.Ticker）

每隔指定时间，执行一次任务（周期性执行），适合“定时轮询、定时同步数据”等场景，可通过`Stop()`取消任务。

```go
package main

import (
	"fmt"
	"time"
)

func main() {
	fmt.Println("周期性定时任务启动，每隔2秒执行一次，按Ctrl+C退出...")

	// 1. 创建Ticker：每隔2秒触发一次
	ticker := time.NewTicker(2 * time.Second)

	// 2. 用通道接收Ticker的触发信号（ticker.C是一个time.Time类型的通道）
	// 启动goroutine，避免阻塞main函数
	go func() {
		for t := range ticker.C {
			fmt.Printf("定时任务执行：%s\n", t.Format("2006-01-02 15:04:05"))
		}
	}()

	// 3. 程序持续运行（防止退出），可通过其他逻辑触发退出
	select {} // 阻塞main函数，无限运行

	// 4. 取消定时任务（按需调用，如收到退出信号后）
	// ticker.Stop()
	// fmt.Println("定时任务已取消")
}
```

### 7.3 定时任务的优雅退出

实际开发中，定时任务需要优雅退出（避免任务执行到一半被终止），可通过“退出通道”控制。

```go
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// 1. 创建退出通道（用于接收退出信号）
	quit := make(chan os.Signal, 1)
	// 监听Ctrl+C、kill等退出信号
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// 2. 创建周期性Ticker
	ticker := time.NewTicker(2 * time.Second)

	// 3. 启动定时任务
	go func() {
		for {
			select {
			case t := <-ticker.C:
				// 定时任务逻辑
				fmt.Printf("定时任务执行：%s\n", t.Format("2006-01-02 15:04:05"))
			case <-quit:
				// 收到退出信号，取消Ticker，退出goroutine
				ticker.Stop()
				fmt.Println("\n收到退出信号，定时任务取消，优雅退出...")
				return
			}
		}
	}()

	// 4. 阻塞main函数，等待退出信号
	<-quit
}
```

测试：运行程序后，按Ctrl+C，会触发退出信号，定时任务优雅取消，不会直接终止。

## 8. 时区处理

Go的time包默认支持时区处理，`time.Now()`获取的是本地时区（CST，中国标准时间，UTC+8），可通过`time.LoadLocation()`加载其他时区，实现跨时区时间转换。

### 8.1 加载时区与转换

常用时区：`Asia/Shanghai`（中国时区）、`UTC`（世界标准时间）、`America/New_York`（纽约时区）等。

```go
package main

import (
	"fmt"
	"time"
)

func main() {
	// 1. 获取当前UTC时间
	utcNow := time.Now().UTC()
	fmt.Printf("当前UTC时间：%s\n", utcNow.Format("2006-01-02 15:04:05"))

	// 2. 加载中国时区（Asia/Shanghai）
	shLocation, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		fmt.Printf("加载时区失败：%v\n", err)
		return
	}

	// 3. UTC时间转换为中国时区时间
	shNow := utcNow.In(shLocation)
	fmt.Printf("UTC时间转换为中国时间：%s\n", shNow.Format("2006-01-02 15:04:05"))

	// 4. 加载纽约时区（America/New_York）
	nyLocation, err := time.LoadLocation("America/New_York")
	if err != nil {
		fmt.Printf("加载时区失败：%v\n", err)
		return
	}

	// 5. 中国时间转换为纽约时间
	nyNow := shNow.In(nyLocation)
	fmt.Printf("中国时间转换为纽约时间：%s\n", nyNow.Format("2006-01-02 15:04:05"))
}
```

### 8.2 时区相关注意事项

- 加载时区时，时区名称必须是标准名称（如`Asia/Shanghai`，而非`Shanghai`、`中国`）；

- 若系统缺少时区数据库，`time.LoadLocation()`会失败，可通过安装`tzdata`包解决（`go get github.com/golang/time/tzdata`）；

- 时间戳（`Unix()`）是“时区无关”的，无论哪个时区，同一时刻的时间戳相同，转换时区只是改变时间的显示格式。

```go
// 解决时区数据库缺失问题（导入tzdata包即可）
package main

import (
	"fmt"
	"time"

	_ "github.com/golang/time/tzdata" // 自动加载时区数据库
)

func main() {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(loc)
	fmt.Printf("中国时间：%s\n", now.Format("2006-01-02 15:04:05"))
}
```

引用来源：[Go官方文档 - time.LoadLocation](https://pkg.go.dev/time#LoadLocation)

## 总结

本文精讲了Go标准库中3个高频实用模块，核心要点总结：

1. **net/http**：客户端（Get/Post/自定义Client）、服务端（HandleFunc/ListenAndServe）、路由（ServeMux+第三方mux）；

2. **encoding/json**：编码（Marshal）、解码（Unmarshal），注意结构体字段导出和JSON标签的使用；

3. **time**：当前时间、格式化（2006-01-02 15:04:05）、时间间隔、定时任务（AfterFunc/Ticker）、时区转换。

这三个模块是Go开发的“基础工具”，建议多动手运行代码，熟悉API的使用场景，后续开发中能大幅提高效率。如果有疑问，欢迎在评论区交流～
