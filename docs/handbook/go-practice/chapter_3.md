# 第3章 Web框架高级功能与实战：从文件上传到手写框架

你有没有遇到过这种情况：用Go写了个Web服务，文件上传动不动就内存爆炸，Session在分布式环境下处处丢登录态，路由匹配写了一堆if-else连自己都看不懂。更惨的是，上线一压测，QPS还没到500就扛不住了，老板问你这框架是闹着玩呢？

我是怕浪猫，一个在Go后端踩了无数坑的老兵。今天这章，咱们不整那些虚的，直接从文件上传、模板渲染、Option模式、静态资源、Session机制一路打到完整的手写Web框架实战。每一块都是生产环境验证过的方案，代码直接能跑，坑位直接给你标出来。

> 怕浪猫说：框架不是用来炫技的，是用来解决问题的。能跑能扛能维护，才是好框架。

---

## 一、文件上传与下载

### 1.1 multipart/form-data 解析

文件上传是Web服务的刚需。HTTP文件上传的核心机制是 `multipart/form-data`，浏览器把表单数据和文件内容拼成一个边界分隔的请求体发过来，服务端需要解析这个格式。

Go标准库的 `net/http` 已经内置了对 `multipart/form-data` 的解析支持，核心入口是 `r.ParseMultipartForm` 和 `r.FormFile`。

先看一个最基础的文件上传处理：

```go
func uploadHandler(w http.ResponseWriter, r *http.Request) {
    // 限制请求体大小，防止恶意大文件打爆内存
    // MaxBytesReader 会在读取超过限制时返回错误
    r.Body = http.MaxBytesReader(w, r.Body, 32<<20) // 32MB
    
    if err := r.ParseMultipartForm(32 << 20); err != nil {
        http.Error(w, "文件太大了: "+err.Error(), http.StatusBadRequest)
        return
    }
    
    // ParseMultipartForm 会把小于指定大小的文件存到内存
    // 超过的部分会写到临时文件
    file, handler, err := r.FormFile("file")
    if err != nil {
        http.Error(w, "获取文件失败: "+err.Error(), http.StatusBadRequest)
        return
    }
    defer file.Close()
    
    fmt.Fprintf(w, "文件名: %s\n", handler.Filename)
    fmt.Fprintf(w, "文件大小: %d bytes\n", handler.Size)
    fmt.Fprintf(w, "MIME类型: %s\n", handler.Header.Get("Content-Type"))
}
```

这里面有个关键参数容易踩坑：`ParseMultipartForm(maxMemory int64)` 的 `maxMemory` 参数。它的含义是：小于这个大小的文件放在内存里，大于这个大小的会写临时文件到 `/tmp` 目录。但注意，`MaxBytesReader` 限制的是整个请求体的大小，这是两个不同的概念。

> 怕浪猫说：maxMemory 控制的是内存缓冲阈值，不是上传大小上限。别搞混了，否则线上分分钟OOM。

多文件上传也很常见，比如用户一次性传多个头像或者批量上传商品图片：

```go
func multiUploadHandler(w http.ResponseWriter, r *http.Request) {
    if err := r.ParseMultipartForm(32 << 20); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    form := r.MultipartForm
    if form == nil {
        http.Error(w, "不是multipart表单", http.StatusBadRequest)
        return
    }
    
    files := form.File["files"]
    for _, handler := range files {
        file, err := handler.Open()
        if err != nil {
            log.Printf("打开文件 %s 失败: %v", handler.Filename, err)
            continue
        }
        
        // 创建目标文件
        dst, err := os.Create("./uploads/" + handler.Filename)
        if err != nil {
            file.Close()
            continue
        }
        
        // 复制文件内容
        written, err := io.Copy(dst, file)
        if err != nil {
            log.Printf("写入文件 %s 失败: %v", handler.Filename, err)
        }
        
        log.Printf("文件 %s 上传成功, 大小: %d bytes", handler.Filename, written)
        file.Close()
        dst.Close()
    }
    
    w.Write([]byte("上传完成"))
}
```

这里有个生产环境的坑：`os.Create` 直接用用户传的文件名，存在路径穿越风险。攻击者可能上传一个 `../../../etc/passwd` 这样的文件名。必须做文件名清洗：

```go
import "path/filepath"

// 安全的文件名处理
safeName := filepath.Base(handler.Filename)
// 生成唯一文件名，防止覆盖
ext := filepath.Ext(safeName)
safeName = uuid.New().String() + ext
dst, err := os.Create(filepath.Join("./uploads", safeName))
```

还有一个更深层的坑：临时文件不会自动清理。`ParseMultipartForm` 产生的临时文件需要你在请求处理完后手动删除。好在 `r.MultipartForm.RemoveAll()` 可以帮你做这事，但大多数教程都不会告诉你这个。

> 怕浪猫说：用户上传的文件名永远不可信。路径穿越攻击不是段子，是真实发生的线上事故。

### 1.2 流式上传：避免内存爆炸

对于大文件上传（比如视频文件），即使用了 `ParseMultipartForm`，内存消耗依然可能很高。更好的方案是直接从 `multipart.Reader` 流式读取：

```go
func streamUploadHandler(w http.ResponseWriter, r *http.Request) {
    reader, err := r.MultipartReader()
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    for {
        part, err := reader.NextPart()
        if err == io.EOF {
            break
        }
        if err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        
        // 跳过普通表单字段
        if part.FileName() == "" {
            part.Close()
            continue
        }
        
        // 流式写入文件，不在内存中缓存整个文件
        safeName := filepath.Base(part.FileName())
        dst, err := os.Create(filepath.Join("./uploads", safeName))
        if err != nil {
            part.Close()
            continue
        }
        
        // 每次只读32KB，内存占用恒定
        buf := make([]byte, 32*1024)
        _, err = io.CopyBuffer(dst, part, buf)
        if err != nil {
            log.Printf("写入失败: %v", err)
        }
        
        dst.Close()
        part.Close()
    }
    
    w.Write([]byte("流式上传完成"))
}
```

这种方式无论上传多大的文件，内存占用都是恒定的（就一个32KB的buffer）。生产环境传大文件，务必用流式处理。

### 1.3 文件下载与 Content-Disposition

文件下载的核心是设置正确的响应头。`Content-Disposition` 是最关键的一个，它告诉浏览器这是一个需要下载的文件，以及建议的文件名。

```go
func downloadHandler(w http.ResponseWriter, r *http.Request) {
    filename := r.URL.Query().Get("filename")
    if filename == "" {
        http.Error(w, "缺少文件名", http.StatusBadRequest)
        return
    }
    
    // 安全校验：确保文件在允许的目录内
    basePath, _ := filepath.Abs("./uploads")
    targetPath := filepath.Join(basePath, filepath.Base(filename))
    
    file, err := os.Open(targetPath)
    if err != nil {
        http.Error(w, "文件不存在", http.StatusNotFound)
        return
    }
    defer file.Close()
    
    stat, err := file.Stat()
    if err != nil {
        http.Error(w, "获取文件信息失败", http.StatusInternalServerError)
        return
    }
    
    // 设置响应头
    w.Header().Set("Content-Type", "application/octet-stream")
    
    // Content-Disposition 的关键点：
    // filename 参数处理英文文件名
    // filename* 参数处理非ASCII文件名（RFC 5987）
    displayName := filepath.Base(filename)
    encodedName := url.PathEscape(displayName)
    w.Header().Set("Content-Disposition", 
        fmt.Sprintf("attachment; filename=\"%s\"; filename*=UTF-8''%s", 
            displayName, encodedName))
    
    // 设置文件大小，让浏览器显示进度条
    w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
    
    // 支持断点续传
    http.ServeContent(w, r, displayName, stat.ModTime(), file)
}
```

`http.ServeContent` 是个被低估的函数，它自动支持：
- 断点续传（Range请求）
- If-Modified-Since 缓存判断
- If-None-Match ETag校验
- 正确的 Last-Modified 头

> 怕浪猫说：能 ServeContent 就别自己手写 io.Copy。标准库帮你处理了断点续传、条件请求、ETag，你手写大概率漏。

### 1.4 文件下载的完整防坑清单

以下是怕浪猫在生产环境总结的文件上传下载防坑清单：

```markdown
## 文件上传下载防坑清单

### 上传侧
- [ ] MaxBytesReader 限制请求体总大小
- [ ] filepath.Base 清洗文件名，防止路径穿越
- [ ] 用UUID生成存储文件名，防止覆盖和冲突
- [ ] 大文件使用 multipart.Reader 流式处理
- [ ] 限制并发上传数量，防止带宽打满
- [ ] 文件类型校验（不能只看扩展名，要校验Magic Number）
- [ ] 病毒扫描（如果业务允许）

### 下载侧
- [ ] Content-Disposition 设置正确的文件名编码
- [ ] 使用 http.ServeContent 而非裸 io.Copy
- [ ] 限制下载路径在允许目录内（防穿越）
- [ ] 大文件支持 Range 请求（ServeContent 自带）
- [ ] 设置合理的 Content-Type
- [ ] 下载限速（防止带宽被单用户占满）

### 存储侧
- [ ] 上传目录不可执行（防止WebShell）
- [ ] 定期清理临时文件
- [ ] CDN加速静态文件分发
- [ ] 文件去重（MD5/SHA256校验）
```

> 怕浪猫说： checklist 这东西，平时嫌麻烦，出事了就后悔。线上无小事，每一项都是血泪教训。

---

## 二、页面渲染与模板引擎

### 2.1 text/template 基础

Go标准库提供了两套模板引擎：`text/template` 用于纯文本模板，`html/template` 用于HTML输出（自动做XSS转义）。

先看 `text/template` 的基本用法：

```go
package main

import (
    "bytes"
    "fmt"
    "text/template"
)

type User struct {
    Name  string
    Age   int
    Email string
}

func main() {
    // Go template 使用双花括号作为分隔符
    // 下面演示基础模板渲染流程
    ld := "\x7b\x7b" // 左分隔符
    rd := "\x7d\x7d" // 右分隔符
    tmplStr := "用户名: " + ld + ".Name" + rd + "\n年龄: " + ld + ".Age" + rd + "\n邮箱: " + ld + ".Email" + rd

    type UserWithHobbies struct {
        Name    string
        Age     int
        Email   string
        Hobbies []string
    }

    user := UserWithHobbies{
        Name:    "怕浪猫",
        Age:     28,
        Email:   "palandmao@example.com",
        Hobbies: []string{"写Go", "踩坑", "分享"},
    }

    tmpl, err := template.New("user").Parse(tmplStr)
    if err != nil {
        panic(err)
    }

    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, user); err != nil {
        panic(err)
    }

    fmt.Println(buf.String())
}
```

Go模板的语法可能一开始看着不太习惯，但核心就那么几个动作：

- <code v-pre>{{.}}</code> 当前对象
- <code v-pre>{{.Field}}</code> 访问字段
- <code v-pre>{{if ...}}...{{else}}...{{end}}</code> 条件判断
- <code v-pre>{{range ...}}...{{end}}</code> 循环
- <code v-pre>{{with ...}}...{{end}}</code> 非空判断
- <code v-pre>{{template "name" .}}</code> 模板嵌套

### 2.2 html/template 与 XSS防护

Web开发中真正用的是 `html/template`，它会在输出时根据上下文自动做HTML转义：

```go
package main

import (
    "html/template"
    "net/http"
)

func renderHandler(w http.ResponseWriter, r *http.Request) {
    // 模拟用户输入的恶意数据
    data := struct {
        Title   string
        Content string
        Users   []string
    }{
        Title:   "<script>alert('xss')</script>",
        Content: "正常内容",
        Users:   []string{"张三", "李四", "王五"},
    }

    tmpl := `
<!DOCTYPE html>
<html>
<head><title>{{.Title}}</title></head>
<body>
    <h1>{{.Title}}</h1>
    <p>{{.Content}}</p>
    <ul>
    {{range .Users}}
        <li>{{.}}</li>
    {{end}}
    </ul>
</body>
</html>`

    t := template.Must(template.New("page").Parse(tmpl))
    t.Execute(w, data)
}
```

注意：`<script>alert('xss')</script>` 会被自动转义为 `&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;`，浏览器不会执行这段JS。这就是 `html/template` 的核心价值。

> 怕浪猫说：永远不要用 text/template 渲染HTML页面。XSS漏洞不是开玩笑的，一个未转义的输出就能让你的网站沦为攻击者的游乐场。

### 2.3 模板继承与布局

Go模板不像Jinja2或Blade那样原生支持模板继承，但可以通过 `template.ParseGlob` 和 `template.ExecuteTemplate` 实现类似的布局功能：

```go
// layout.go
package main

import (
    "html/template"
    "net/http"
    "os"
)

var templates *template.Template

func init() {
    // 预加载所有模板文件
    templates = template.Must(template.ParseGlob("templates/*.html"))
}

// 布局模板 layout.html:
// {{define "layout"}}
// <!DOCTYPE html>
// <html>
// <head><title>{{.Title}}</title></head>
// <body>
//     {{template "content" .}}
// </body>
// </html>
// {{end}}

// 页面模板 home.html:
// {{define "content"}}
// <h1>{{.Title}}</h1>
// <p>欢迎来到首页</p>
// {{end}}

func homeHandler(w http.ResponseWriter, r *http.Request) {
    data := struct {
        Title string
    }{
        Title: "首页",
    }
    templates.ExecuteTemplate(w, "layout", data)
}
```

为了更好用，怕浪猫封装了一个模板引擎管理器：

```go
package templateengine

import (
    "html/template"
    "io"
    "path/filepath"
    "sync"
)

type Engine struct {
    mu        sync.RWMutex
    templates map[string]*template.Template
    baseDir   string
    layout    string
    funcs     template.FuncMap
}

func New(baseDir string, layout string) *Engine {
    return &Engine{
        templates: make(map[string]*template.Template),
        baseDir:   baseDir,
        layout:    layout,
        funcs:     make(template.FuncMap),
    }
}

func (e *Engine) AddFunc(name string, fn interface{}) {
    e.funcs[name] = fn
}

func (e *Engine) Load() error {
    e.mu.Lock()
    defer e.mu.Unlock()
    
    layoutPath := filepath.Join(e.baseDir, e.layout)
    
    // 读取布局模板内容
    layoutContent, err := os.ReadFile(layoutPath)
    if err != nil {
        return fmt.Errorf("读取布局模板失败: %w", err)
    }
    
    // 遍历目录下所有模板
    matches, err := filepath.Glob(filepath.Join(e.baseDir, "*.html"))
    if err != nil {
        return err
    }
    
    for _, file := range matches {
        if filepath.Base(file) == e.layout {
            continue
        }
        
        name := filepath.Base(file)
        content, err := os.ReadFile(file)
        if err != nil {
            return err
        }
        
        // 把布局和页面模板合并
        t := template.New(name).Funcs(e.funcs)
        // 先解析布局
        _, err = t.Parse(string(layoutContent))
        if err != nil {
            return err
        }
        // 再追加页面内容
        _, err = t.Parse(string(content))
        if err != nil {
            return err
        }
        
        e.templates[name] = t
    }
    
    return nil
}

func (e *Engine) Render(w io.Writer, name string, data interface{}) error {
    e.mu.RLock()
    t, ok := e.templates[name]
    e.mu.RUnlock()
    
    if !ok {
        return fmt.Errorf("模板 %s 不存在", name)
    }
    
    return t.ExecuteTemplate(w, "layout", data)
}
```

> 怕浪猫说：Go模板的继承虽然不如其他语言优雅，但胜在简单可控。你完全理解它每一步在干什么，没有黑魔法。

---

## 三、Option模式（函数式选项）与泛型设计

### 3.1 为什么要用Option模式

Go语言没有构造函数重载，当你有一个结构体需要很多可选配置时，传统的做法要么是传一个配置结构体，要么是写一堆 `WithXxx` 方法。Option模式（函数式选项模式）是Go社区最推崇的方案。

先看痛点。假设你要设计一个HTTP客户端：

```go
type HttpClient struct {
    timeout      time.Duration
    retryCount   int
    retryDelay   time.Duration
    baseURL      string
    headers      map[string]string
    transport    *http.Transport
    proxy        string
    userAgent    string
}
```

传统做法：

```go
// 做法1：超长参数列表，参数顺序容易搞混
func NewClient(timeout time.Duration, retry int, delay time.Duration, 
    baseURL string, headers map[string]string, ...) *HttpClient

// 做法2：配置结构体，但需要处理零值问题
type Config struct {
    Timeout    time.Duration
    RetryCount int
    // 如果用户传0，到底是"用默认值"还是"不超时"？
}
```

Option模式优雅地解决了这个问题：

```go
package httpclient

import (
    "net/http"
    "time"
)

// Option 是一个函数类型，接收 *HttpClient 进行修改
type Option func(*HttpClient)

type HttpClient struct {
    timeout     time.Duration
    retryCount  int
    retryDelay  time.Duration
    baseURL     string
    headers     map[string]string
    transport   http.RoundTripper
    userAgent   string
}

func New(opts ...Option) *HttpClient {
    // 设置默认值
    client := &HttpClient{
        timeout:    30 * time.Second,
        retryCount: 3,
        retryDelay: 100 * time.Millisecond,
        baseURL:    "",
        headers:    make(map[string]string),
        transport:  http.DefaultTransport,
        userAgent:  "PalandmaoClient/1.0",
    }
    
    // 应用所有选项
    for _, opt := range opts {
        opt(client)
    }
    
    return client
}

// WithTimeout 设置请求超时
func WithTimeout(d time.Duration) Option {
    return func(c *HttpClient) {
        c.timeout = d
    }
}

// WithRetry 设置重试次数和延迟
func WithRetry(count int, delay time.Duration) Option {
    return func(c *HttpClient) {
        c.retryCount = count
        c.retryDelay = delay
    }
}

// WithBaseURL 设置基础URL
func WithBaseURL(url string) Option {
    return func(c *HttpClient) {
        c.baseURL = url
    }
}

// WithHeader 添加自定义请求头
func WithHeader(key, value string) Option {
    return func(c *HttpClient) {
        c.headers[key] = value
    }
}

// WithTransport 设置自定义Transport
func WithTransport(t http.RoundTripper) Option {
    return func(c *HttpClient) {
        c.transport = t
    }
}
```

使用方式非常优雅：

```go
client := httpclient.New(
    httpclient.WithTimeout(10*time.Second),
    httpclient.WithRetry(5, 200*time.Millisecond),
    httpclient.WithBaseURL("https://api.example.com"),
    httpclient.WithHeader("Authorization", "Bearer token123"),
    httpclient.WithHeader("X-Request-ID", uuid.New().String()),
)
```

> 怕浪猫说：Option模式的精髓不在于语法多花哨，而在于它让API既向后兼容又灵活扩展。加新配置不用改现有代码，完美符合开闭原则。

### 3.2 用泛型设计通用Option模式

Go 1.18引入泛型后，我们可以设计一个通用的Option类型，避免每个包都重复定义：

```go
package option

// Option 是通用的函数式选项类型
// T 是目标结构体类型
type Option[T any] func(*T)

// Apply 应用所有选项到目标对象
func Apply[T any](target *T, opts ...Option[T]) {
    for _, opt := range opts {
        opt(target)
    }
}

// Compose 将多个Option合并为一个
func Compose[T any](opts ...Option[T]) Option[T] {
    return func(target *T) {
        for _, opt := range opts {
            opt(target)
        }
    }
}
```

有了这个通用Option，你的业务代码可以这样写：

```go
package server

import "time"

type Server struct {
    addr         string
    readTimeout  time.Duration
    writeTimeout time.Duration
    maxConn      int
    tls          bool
    certFile     string
    keyFile      string
}

// 直接使用 option.Option[Server]
type Option = option.Option[Server]

func New(addr string, opts ...Option) *Server {
    s := &Server{
        addr:         addr,
        readTimeout:  10 * time.Second,
        writeTimeout: 10 * time.Second,
        maxConn:      1000,
        tls:          false,
    }
    option.Apply(s, opts...)
    return s
}

func WithReadTimeout(d time.Duration) Option {
    return func(s *Server) { s.readTimeout = d }
}

func WithWriteTimeout(d time.Duration) Option {
    return func(s *Server) { s.writeTimeout = d }
}

func WithMaxConn(n int) Option {
    return func(s *Server) { s.maxConn = n }
}

func WithTLS(certFile, keyFile string) Option {
    return func(s *Server) {
        s.tls = true
        s.certFile = certFile
        s.keyFile = keyFile
    }
}
```

### 3.3 Option模式进阶：校验与条件选项

生产环境光能设值还不够，有时候需要校验选项的合法性：

```go
package option

// ValidatedOption 带校验的Option
type ValidatedOption[T any] struct {
    apply  func(*T)
    validate func(*T) error
}

func (vo ValidatedOption[T]) Apply(target *T) error {
    vo.apply(target)
    if vo.validate != nil {
        return vo.validate(target)
    }
    return nil
}

// ValidatedApply 应用所有选项并执行校验
func ValidatedApply[T any](target *T, opts ...ValidatedOption[T]) error {
    for _, opt := range opts {
        if err := opt.Apply(target); err != nil {
            return fmt.Errorf("选项校验失败: %w", err)
        }
    }
    return nil
}

// Validated 创建带校验的Option
func Validated[T any](apply func(*T), validate func(*T) error) ValidatedOption[T] {
    return ValidatedOption[T]{
        apply:    apply,
        validate: validate,
    }
}
```

使用示例：

```go
func WithPort(port int) ValidatedOption[Server] {
    return Validated(
        func(s *Server) { s.port = port },
        func(s *Server) error {
            if port < 0 || port > 65535 {
                return errors.New("端口号必须在0-65535之间")
            }
            return nil
        },
    )
}
```

> 怕浪猫说：泛型让Option模式从"每个包写一遍"进化到了"写一次到处用"。这就是Go语言在简洁和复用之间的平衡艺术。

---

## 四、静态资源服务器设计

### 4.1 基础静态资源服务

Go用 `http.FileServer` 可以一行代码启动静态资源服务：

```go
func main() {
    http.Handle("/static/", http.StripPrefix("/static/", 
        http.FileServer(http.Dir("./assets"))))
    http.ListenAndServe(":8080", nil)
}
```

但这只是最基础的。生产环境的静态资源服务器需要考虑：缓存控制、内存管理、大文件传输、压缩等。

### 4.2 带缓存控制的静态资源服务器

```go
package staticserver

import (
    "crypto/md5"
    "encoding/hex"
    "net/http"
    "os"
    "path/filepath"
    "strings"
    "time"
)

type CacheConfig struct {
    MaxAge        time.Duration // 浏览器缓存时长
    SharedMaxAge  time.Duration // CDN缓存时长
    EnableETag    bool          // 是否启用ETag
    EnableLastMod bool          // 是否启用Last-Modified
}

type StaticServer struct {
    root     string
    cache    CacheConfig
    maxFiles int
}

func New(root string, cache CacheConfig) *StaticServer {
    return &StaticServer{
        root:  root,
        cache: cache,
    }
}

func (s *StaticServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // 清理路径，防止穿越
    cleanPath := filepath.Clean(r.URL.Path)
    if strings.Contains(cleanPath, "..") {
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
    }
    
    filePath := filepath.Join(s.root, cleanPath)
    
    stat, err := os.Stat(filePath)
    if err != nil {
        if os.IsNotExist(err) {
            http.Error(w, "Not Found", http.StatusNotFound)
            return
        }
        http.Error(w, "Internal Error", http.StatusInternalServerError)
        return
    }
    
    // 目录则尝试找index.html
    if stat.IsDir() {
        filePath = filepath.Join(filePath, "index.html")
        stat, err = os.Stat(filePath)
        if err != nil {
            http.Error(w, "Not Found", http.StatusNotFound)
            return
        }
    }
    
    // 设置缓存头
    s.setCacheHeaders(w, filePath, stat)
    
    // 如果是条件请求且资源未修改，返回304
    if s.checkNotModified(w, r, filePath, stat) {
        return
    }
    
    // 设置Content-Type
    ext := strings.ToLower(filepath.Ext(filePath))
    w.Header().Set("Content-Type", contentTypeByExt(ext))
    
    // 使用ServeContent支持Range请求
    file, err := os.Open(filePath)
    if err != nil {
        http.Error(w, "Internal Error", http.StatusInternalServerError)
        return
    }
    defer file.Close()
    
    http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
}

func (s *StaticServer) setCacheHeaders(w http.ResponseWriter, path string, stat os.FileInfo) {
    // Cache-Control 头
    parts := []string{"public"}
    if s.cache.MaxAge > 0 {
        parts = append(parts, fmt.Sprintf("max-age=%d", int(s.cache.MaxAge.Seconds())))
    }
    if s.cache.SharedMaxAge > 0 {
        parts = append(parts, fmt.Sprintf("s-maxage=%d", int(s.cache.SharedMaxAge.Seconds())))
    }
    w.Header().Set("Cache-Control", strings.Join(parts, ", "))
    
    // ETag 基于文件MD5
    if s.cache.EnableETag {
        etag := computeETag(path, stat)
        w.Header().Set("ETag", etag)
    }
    
    // Last-Modified
    if s.cache.EnableLastMod {
        w.Header().Set("Last-Modified", stat.ModTime().UTC().Format(http.TimeFormat))
    }
}

func (s *StaticServer) checkNotModified(w http.ResponseWriter, r *http.Request, path string, stat os.FileInfo) bool {
    // 检查 If-None-Match (ETag)
    if s.cache.EnableETag {
        etag := computeETag(path, stat)
        if r.Header.Get("If-None-Match") == etag {
            w.WriteHeader(http.StatusNotModified)
            return true
        }
    }
    
    // 检查 If-Modified-Since
    if s.cache.EnableLastMod {
        modTime := stat.ModTime().UTC()
        if since, err := http.ParseTime(r.Header.Get("If-Modified-Since")); err == nil {
            if !modTime.After(since) {
                w.WriteHeader(http.StatusNotModified)
                return true
            }
        }
    }
    
    return false
}

func computeETag(path string, stat os.FileInfo) string {
    // 用文件路径+大小+修改时间生成ETag
    // 生产环境可以用文件内容的MD5，但那需要读取整个文件
    h := md5.New()
    h.Write([]byte(path))
    h.Write([]byte(stat.ModTime().String()))
    binary.Write(h, binary.LittleEndian, stat.Size())
    return `"` + hex.EncodeToString(h.Sum(nil)) + `"`
}

func contentTypeByExt(ext string) string {
    switch ext {
    case ".html", ".htm":
        return "text/html; charset=utf-8"
    case ".css":
        return "text/css; charset=utf-8"
    case ".js", ".mjs":
        return "application/javascript; charset=utf-8"
    case ".json":
        return "application/json; charset=utf-8"
    case ".png":
        return "image/png"
    case ".jpg", ".jpeg":
        return "image/jpeg"
    case ".gif":
        return "image/gif"
    case ".svg":
        return "image/svg+xml"
    case ".ico":
        return "image/x-icon"
    case ".woff":
        return "font/woff"
    case ".woff2":
        return "font/woff2"
    case ".ttf":
        return "font/ttf"
    case ".wasm":
        return "application/wasm"
    default:
        return "application/octet-stream"
    }
}
```

> 怕浪猫说：静态资源不缓存就是耍流氓。用户每次访问都从磁盘读文件传一遍，带宽和IO全浪费了。ETag + Cache-Control 是标配不是选配。

### 4.3 内存LRU缓存层

对于高频访问的小文件（比如CSS、JS、小图片），可以在内存中加一层LRU缓存：

```go
package lru

import (
    "container/list"
    "sync"
)

// Cache 是一个并发安全的LRU缓存
type Cache struct {
    mu       sync.Mutex
    maxBytes int64
    curBytes int64
    ll       *list.List
    cache    map[string]*list.Element
    OnEvicted func(key string, value []byte)
}

type entry struct {
    key   string
    value []byte
    size  int64
}

func New(maxBytes int64) *Cache {
    return &Cache{
        maxBytes: maxBytes,
        ll:       list.New(),
        cache:    make(map[string]*list.Element),
    }
}

func (c *Cache) Get(key string) ([]byte, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    if ele, ok := c.cache[key]; ok {
        // 移动到队首（最近使用）
        c.ll.MoveToFront(ele)
        return ele.Value.(*entry).value, true
    }
    return nil, false
}

func (c *Cache) Put(key string, value []byte) {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    size := int64(len(value))
    
    // 如果已存在，更新值
    if ele, ok := c.cache[key]; ok {
        c.ll.MoveToFront(ele)
        oldEntry := ele.Value.(*entry)
        c.curBytes += size - oldEntry.size
        oldEntry.value = value
        oldEntry.size = size
    } else {
        entry := &entry{key: key, value: value, size: size}
        ele := c.ll.PushFront(entry)
        c.cache[key] = ele
        c.curBytes += size
    }
    
    // 超过容量时淘汰最久未使用的
    for c.curBytes > c.maxBytes {
        c.removeOldest()
    }
}

func (c *Cache) removeOldest() {
    ele := c.ll.Back()
    if ele == nil {
        return
    }
    
    entry := ele.Value.(*entry)
    c.ll.Remove(ele)
    delete(c.cache, entry.key)
    c.curBytes -= entry.size
    
    if c.OnEvicted != nil {
        c.OnEvicted(entry.key, entry.value)
    }
}

func (c *Cache) Len() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.ll.Len()
}

func (c *Cache) Size() int64 {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.curBytes
}
```

把LRU缓存集成到静态资源服务器：

```go
type CachedStaticServer struct {
    root    string
    cache   *lru.Cache
    maxSize int64 // 单个文件缓存上限
}

func NewCached(root string, maxMemory int64) *CachedStaticServer {
    return &CachedStaticServer{
        root:    root,
        cache:   lru.New(maxMemory),
        maxSize: 1 << 20, // 只缓存小于1MB的文件
    }
}

func (s *CachedStaticServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    cleanPath := filepath.Clean(r.URL.Path)
    filePath := filepath.Join(s.root, cleanPath)
    
    stat, err := os.Stat(filePath)
    if err != nil {
        http.Error(w, "Not Found", http.StatusNotFound)
        return
    }
    
    // 小文件走缓存
    if stat.Size() <= s.maxSize {
        if content, ok := s.cache.Get(filePath); ok {
            w.Header().Set("Content-Type", contentTypeByExt(filepath.Ext(filePath)))
            w.Header().Set("Content-Length", strconv.Itoa(len(content)))
            w.Write(content)
            return
        }
        
        // 缓存未命中，读取文件并缓存
        content, err := os.ReadFile(filePath)
        if err != nil {
            http.Error(w, "Internal Error", http.StatusInternalServerError)
            return
        }
        s.cache.Put(filePath, content)
        
        w.Header().Set("Content-Type", contentTypeByExt(filepath.Ext(filePath)))
        w.Header().Set("Content-Length", strconv.Itoa(len(content)))
        w.Write(content)
        return
    }
    
    // 大文件直接流式传输
    file, err := os.Open(filePath)
    if err != nil {
        http.Error(w, "Internal Error", http.StatusInternalServerError)
        return
    }
    defer file.Close()
    
    http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
}
```

### 4.4 大文件分块传输

对于大文件下载，直接 `io.Copy` 可能会阻塞较长时间，而且无法控制内存。分块传输可以更好地控制资源：

```go
func chunkedDownload(w http.ResponseWriter, r *http.Request, filePath string) {
    file, err := os.Open(filePath)
    if err != nil {
        http.Error(w, "文件不存在", http.StatusNotFound)
        return
    }
    defer file.Close()
    
    stat, _ := file.Stat()
    
    // 设置响应头
    w.Header().Set("Content-Type", "application/octet-stream")
    w.Header().Set("Content-Disposition", 
        fmt.Sprintf("attachment; filename=\"%s\"", stat.Name()))
    w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
    w.Header().Set("Accept-Ranges", "bytes")
    
    // 分块写入，每块256KB
    buf := make([]byte, 256*1024)
    flusher, canFlush := w.(http.Flusher)
    
    for {
        n, err := file.Read(buf)
        if n > 0 {
            if _, wErr := w.Write(buf[:n]); wErr != nil {
                break
            }
            // 立即刷新到客户端
            if canFlush {
                flusher.Flush()
            }
        }
        if err == io.EOF {
            break
        }
        if err != nil {
            log.Printf("读取文件失败: %v", err)
            break
        }
    }
}
```

> 怕浪猫说：大文件传输的核心原则就一个字——流。内存是有限的，网络是慢的，磁盘IO是异步的。用流式处理把这三者的速度差消化掉，才是工程能力。

---

## 五、Session设计与实现

### 5.1 Session与Cookie的区别

很多人搞不清Session和Cookie的关系，怕浪猫用一个简单的类比说清楚：

Cookie是浏览器端的一张小纸条，Session是服务器端的一个档案柜。

具体区别：

| 维度 | Cookie | Session |
|------|--------|---------|
| 存储位置 | 浏览器端 | 服务器端 |
| 安全性 | 较低（可被查看和篡改） | 较高（数据在服务端） |
| 大小限制 | 4KB左右 | 取决于服务器资源 |
| 生命周期 | 可设置过期时间 | 依赖服务端配置 |
| 传输 | 每次请求自动带上 | 只传Session ID（通过Cookie） |

典型的Session流程：
1. 用户登录成功，服务器创建Session，生成唯一Session ID
2. 服务器把Session ID通过Set-Cookie头发给浏览器
3. 浏览器后续请求自动带上这个Cookie
4. 服务器根据Session ID找到对应的Session数据
5. 用户登出时，服务器销毁Session

> 怕浪猫说：Session和Cookie不是二选一的关系，而是配合使用的。Session ID通过Cookie传递，这是最常见的方式。别被那些"用Cookie还是用Session"的问题搞混了。

### 5.2 基于内存的Session实现

先定义Session管理器的接口：

```go
package session

import (
    "crypto/rand"
    "encoding/hex"
    "sync"
    "time"
)

// Session 表示一个用户会话
type Session struct {
    ID        string
    Data      map[string]interface{}
    CreatedAt time.Time
    ExpiresAt time.Time
    mu        sync.RWMutex
}

func (s *Session) Set(key string, value interface{}) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.Data[key] = value
}

func (s *Session) Get(key string) (interface{}, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    val, ok := s.Data[key]
    return val, ok
}

func (s *Session) Delete(key string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    delete(s.Data, key)
}

func (s *Session) IsExpired() bool {
    return time.Now().After(s.ExpiresAt)
}

// Store Session存储接口
type Store interface {
    Create(sessionID string, ttl time.Duration) (*Session, error)
    Get(sessionID string) (*Session, error)
    Delete(sessionID string) error
    Cleanup() // 清理过期Session
}
```

基于内存的实现：

```go
// MemoryStore 内存Session存储
type MemoryStore struct {
    mu       sync.RWMutex
    sessions map[string]*Session
    ttl      time.Duration
}

func NewMemoryStore(ttl time.Duration) *MemoryStore {
    store := &MemoryStore{
        sessions: make(map[string]*Session),
        ttl:      ttl,
    }
    // 启动清理协程
    go store.cleanupLoop()
    return store
}

func (m *MemoryStore) Create(sessionID string, ttl time.Duration) (*Session, error) {
    session := &Session{
        ID:        sessionID,
        Data:      make(map[string]interface{}),
        CreatedAt: time.Now(),
        ExpiresAt: time.Now().Add(ttl),
    }
    
    m.mu.Lock()
    m.sessions[sessionID] = session
    m.mu.Unlock()
    
    return session, nil
}

func (m *MemoryStore) Get(sessionID string) (*Session, error) {
    m.mu.RLock()
    session, ok := m.sessions[sessionID]
    m.mu.RUnlock()
    
    if !ok {
        return nil, ErrSessionNotFound
    }
    
    if session.IsExpired() {
        m.Delete(sessionID)
        return nil, ErrSessionExpired
    }
    
    // 续期
    session.mu.Lock()
    session.ExpiresAt = time.Now().Add(m.ttl)
    session.mu.Unlock()
    
    return session, nil
}

func (m *MemoryStore) Delete(sessionID string) error {
    m.mu.Lock()
    delete(m.sessions, sessionID)
    m.mu.Unlock()
    return nil
}

func (m *MemoryStore) Cleanup() {
    m.mu.Lock()
    defer m.mu.Unlock()
    
    for id, session := range m.sessions {
        if session.IsExpired() {
            delete(m.sessions, id)
        }
    }
}

func (m *MemoryStore) cleanupLoop() {
    ticker := time.NewTicker(time.Minute)
    defer ticker.Stop()
    
    for range ticker.C {
        m.Cleanup()
    }
}
```

Session管理器：

```go
// Manager Session管理器
type Manager struct {
    store          Store
    cookieName     string
    ttl            time.Duration
    secure         bool
    httpOnly       bool
    sameSite       http.SameSite
}

type ManagerOption func(*Manager)

func WithCookieName(name string) ManagerOption {
    return func(m *Manager) { m.cookieName = name }
}

func WithSecure(secure bool) ManagerOption {
    return func(m *Manager) { m.secure = secure }
}

func WithSameSite(sameSite http.SameSite) ManagerOption {
    return func(m *Manager) { m.sameSite = sameSite }
}

func NewManager(store Store, opts ...ManagerOption) *Manager {
    m := &Manager{
        store:      store,
        cookieName: "session_id",
        ttl:        30 * time.Minute,
        secure:     false,
        httpOnly:   true,
        sameSite:   http.SameSiteLaxMode,
    }
    for _, opt := range opts {
        opt(m)
    }
    return m
}

func (m *Manager) CreateSession(w http.ResponseWriter) (*Session, error) {
    sessionID := generateSessionID()
    session, err := m.store.Create(sessionID, m.ttl)
    if err != nil {
        return nil, err
    }
    
    // 设置Cookie
    http.SetCookie(w, &http.Cookie{
        Name:     m.cookieName,
        Value:    sessionID,
        Path:     "/",
        MaxAge:   int(m.ttl.Seconds()),
        HttpOnly: m.httpOnly,
        Secure:   m.secure,
        SameSite: m.sameSite,
    })
    
    return session, nil
}

func (m *Manager) GetSession(r *http.Request) (*Session, error) {
    cookie, err := r.Cookie(m.cookieName)
    if err != nil {
        return nil, ErrNoSessionCookie
    }
    
    return m.store.Get(cookie.Value)
}

func (m *Manager) DestroySession(w http.ResponseWriter, r *http.Request) error {
    cookie, err := r.Cookie(m.cookieName)
    if err != nil {
        return nil
    }
    
    m.store.Delete(cookie.Value)
    
    // 清除Cookie
    http.SetCookie(w, &http.Cookie{
        Name:     m.cookieName,
        Value:    "",
        Path:     "/",
        MaxAge:   -1,
        HttpOnly: m.httpOnly,
        Secure:   m.secure,
        SameSite: m.sameSite,
    })
    
    return nil
}

func generateSessionID() string {
    b := make([]byte, 32)
    rand.Read(b)
    return hex.EncodeToString(b)
}

var (
    ErrSessionNotFound = errors.New("session not found")
    ErrSessionExpired  = errors.New("session expired")
    ErrNoSessionCookie = errors.New("no session cookie")
)
```

> 怕浪猫说：Session ID的生成必须用crypto/rand，不要用math/rand。会话ID被猜到意味着别人可以伪造你的登录状态，这不是概率问题，是安全问题。

### 5.3 基于Redis的Session实现

内存Session在单机环境下没问题，但一旦水平扩展（多个后端实例），Session就不共享了。这就是经典的"分布式Session"问题。

Redis是解决分布式Session最常用的方案：

```go
package session

import (
    "context"
    "encoding/json"
    "time"
    
    "github.com/redis/go-redis/v9"
)

// RedisStore 基于Redis的Session存储
type RedisStore struct {
    client    *redis.Client
    keyPrefix string
    ttl       time.Duration
}

func NewRedisStore(addr string, password string, db int, 
    keyPrefix string, ttl time.Duration) *RedisStore {
    client := redis.NewClient(&redis.Options{
        Addr:     addr,
        Password: password,
        DB:       db,
    })
    return &RedisStore{
        client:    client,
        keyPrefix: keyPrefix,
        ttl:       ttl,
    }
}

func (r *RedisStore) Create(sessionID string, ttl time.Duration) (*Session, error) {
    session := &Session{
        ID:        sessionID,
        Data:      make(map[string]interface{}),
        CreatedAt: time.Now(),
        ExpiresAt: time.Now().Add(ttl),
    }
    
    if err := r.save(session); err != nil {
        return nil, err
    }
    
    return session, nil
}

func (r *RedisStore) Get(sessionID string) (*Session, error) {
    ctx := context.Background()
    key := r.keyPrefix + sessionID
    
    data, err := r.client.Get(ctx, key).Bytes()
    if err == redis.Nil {
        return nil, ErrSessionNotFound
    }
    if err != nil {
        return nil, err
    }
    
    var session Session
    if err := json.Unmarshal(data, &session); err != nil {
        return nil, err
    }
    
    // 续期
    r.client.Expire(ctx, key, r.ttl)
    
    return &session, nil
}

func (r *RedisStore) Delete(sessionID string) error {
    ctx := context.Background()
    key := r.keyPrefix + sessionID
    return r.client.Del(ctx, key).Err()
}

func (r *RedisStore) Cleanup() {
    // Redis自带过期清理，不需要手动处理
}

func (r *RedisStore) save(session *Session) error {
    ctx := context.Background()
    key := r.keyPrefix + session.ID
    
    data, err := json.Marshal(session)
    if err != nil {
        return err
    }
    
    return r.client.Set(ctx, key, data, r.ttl).Err()
}

// UpdateSession 更新Session数据（Set之后需要重新保存）
func (r *RedisStore) UpdateSession(session *Session) error {
    return r.save(session)
}
```

### 5.4 分布式Session方案对比

怕浪猫总结了常见的分布式Session方案：

```markdown
## 分布式Session方案对比

### 方案1：Session Sticky（会话保持）
- 原理：负载均衡器把同一用户的请求始终路由到同一台后端
- 优点：实现简单，无需改代码
- 缺点：单点故障后该用户Session丢失，扩缩容困难
- 适用：小型应用，服务器数量固定

### 方案2：Session复制
- 原理：服务器之间同步Session数据
- 优点：高可用，任意服务器都能处理请求
- 缺点：网络开销大，服务器多时性能下降明显
- 适用：服务器数量少（2-3台），对延迟敏感

### 方案3：集中存储（Redis/Memcached）
- 原理：所有服务器共享一个Session存储
- 优点：扩展性好，无单点依赖（Redis集群）
- 缺点：多了一次网络IO，需要维护Redis
- 适用：中大型应用，推荐方案

### 方案4：JWT无状态
- 原理：不用Session，用户信息编码在JWT中
- 优点：完全无状态，天然支持分布式
- 缺点：Token撤销困难，Token较大
- 适用：API服务，前后端分离架构
```

> 怕浪猫说：没有最好的方案，只有最适合的方案。怕浪猫的选择是：小项目用内存Session，中大型项目上Redis，纯API服务用JWT。别一上来就JWT，除非你真的理解了Token撤销的复杂度。

---

## 六、实战项目：手写Web框架实现用户注册登录

前面五块是零件，现在开始组装。我们要手写一个迷你Web框架，实现用户注册登录功能。这不是玩具，每个设计决策都有生产环境的考量。

### 6.1 设计前缀路由树

路由是Web框架的心脏。`http.ServeMux` 太简陋了，不支持路径参数、通配符、正则匹配。我们需要一棵前缀树来高效路由。

```go
package router

import (
    "net/http"
    "regexp"
    "strings"
    "sync"
)

// HandlerFunc 路由处理函数
type HandlerFunc func(*Context)

// Context 请求上下文
type Context struct {
    Request  *http.Request
    Response http.ResponseWriter
    Params   map[string]string
    store    map[string]interface{}
    handlers []HandlerFunc  // 中间件链
    index    int            // 当前执行的中间件索引
}

func NewContext(w http.ResponseWriter, r *http.Request) *Context {
    return &Context{
        Request:  r,
        Response: w,
        Params:   make(map[string]string),
        store:    make(map[string]interface{}),
        index:    -1,
    }
}

// Next 执行下一个中间件
func (c *Context) Next() {
    c.index++
    for c.index < len(c.handlers) {
        c.handlers[c.index](c)
        c.index++
    }
}

// Set 在上下文中存储数据
func (c *Context) Set(key string, value interface{}) {
    c.store[key] = value
}

// Get 从上下文中获取数据
func (c *Context) Get(key string) (interface{}, bool) {
    val, ok := c.store[key]
    return val, ok
}

// Param 获取路径参数
func (c *Context) Param(key string) string {
    return c.Params[key]
}

// JSON 返回JSON响应
func (c *Context) JSON(code int, obj interface{}) {
    c.Response.Header().Set("Content-Type", "application/json; charset=utf-8")
    c.Response.WriteHeader(code)
    json.NewEncoder(c.Response).Encode(obj)
}

// 路由节点
type node struct {
    pattern     string       // 完整匹配模式
    part        string       // 当前节点的路径段
    children    []*node      // 子节点
    isWildcard  bool         // 是否通配符 *
    isParam     bool         // 是否路径参数 :id
    paramRegex  *regexp.Regexp // 正则约束（可选）
    paramName   string       // 参数名
    handlers    map[string]HandlerFunc // 每个HTTP方法对应的处理函数
}

func newNode(part string) *node {
    n := &node{
        part:    part,
        handlers: make(map[string]HandlerFunc),
    }
    
    if strings.HasPrefix(part, ":") {
        n.isParam = true
        n.paramName = part[1:]
        // 检查是否有正则约束 :id(\d+)
        if idx := strings.Index(part, "("); idx != -1 {
            regexStr := part[idx+1 : len(part)-1]
            n.paramRegex, _ = regexp.Compile("^" + regexStr + "$")
            n.paramName = part[1:idx]
        }
    } else if part == "*" {
        n.isWildcard = true
    }
    
    return n
}

// Router 路由器
type Router struct {
    mu         sync.RWMutex
    root       *node
    middleware []HandlerFunc
}

func New() *Router {
    return &Router{
        root: newNode("/"),
    }
}

// Use 注册全局中间件
func (r *Router) Use(middleware ...HandlerFunc) {
    r.middleware = append(r.middleware, middleware...)
}

// addRoute 添加路由
func (r *Router) addRoute(method string, pattern string, handler HandlerFunc) {
    r.mu.Lock()
    defer r.mu.Unlock()
    
    parts := splitPath(pattern)
    current := r.root
    
    for _, part := range parts {
        child := current.matchChild(part)
        if child == nil {
            child = newNode(part)
            current.children = append(current.children, child)
        }
        current = child
    }
    
    current.pattern = pattern
    current.handlers[method] = handler
}

func splitPath(path string) []string {
    parts := strings.Split(path, "/")
    result := make([]string, 0, len(parts))
    for _, part := range parts {
        if part != "" {
            result = append(result, part)
        }
    }
    return result
}

// matchChild 查找匹配的子节点
func (n *node) matchChild(part string) *node {
    for _, child := range n.children {
        // 参数节点和通配符节点可以匹配任意路径段
        if child.isParam || child.isWildcard {
            return child
        }
        if child.part == part {
            return child
        }
    }
    return nil
}

// matchChildren 查找所有可能匹配的子节点（用于搜索）
func (n *node) matchChildren(part string) []*node {
    nodes := make([]*node, 0)
    for _, child := range n.children {
        if child.isParam || child.isWildcard || child.part == part {
            nodes = append(nodes, child)
        }
    }
    return nodes
}

// GET 注册GET路由
func (r *Router) GET(pattern string, handler HandlerFunc) {
    r.addRoute("GET", pattern, handler)
}

// POST 注册POST路由
func (r *Router) POST(pattern string, handler HandlerFunc) {
    r.addRoute("POST", pattern, handler)
}

// PUT 注册PUT路由
func (r *Router) PUT(pattern string, handler HandlerFunc) {
    r.addRoute("PUT", pattern, handler)
}

// DELETE 注册DELETE路由
func (r *Router) DELETE(pattern string, handler HandlerFunc) {
    r.addRoute("DELETE", pattern, handler)
}

// ServeHTTP 实现http.Handler接口
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
    parts := splitPath(req.URL.Path)
    
    // 在前缀树中搜索匹配的路由
    n := r.search(r.root, parts, 0, req)
    if n == nil {
        http.NotFound(w, req)
        return
    }
    
    handler, ok := n.handlers[req.Method]
    if !ok {
        http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
        return
    }
    
    // 构建上下文
    c := NewContext(w, req)
    
    // 合并全局中间件和最终handler
    c.handlers = append(r.middleware, handler)
    
    // 执行中间件链
    c.Next()
}

// search 递归搜索路由树
func (r *Router) search(root *node, parts []string, height int, req *http.Request) *node {
    // 到达路径末尾
    if height == len(parts) {
        if root.pattern == "" {
            return nil
        }
        return root
    }
    
    part := parts[height]
    children := root.matchChildren(part)
    
    for _, child := range children {
        // 参数节点：提取参数值
        if child.isParam {
            // 正则校验
            if child.paramRegex != nil {
                if !child.paramRegex.MatchString(part) {
                    continue // 正则不匹配，跳过
                }
            }
        }
        
        // 通配符节点：匹配剩余所有路径
        if child.isWildcard {
            // 通配符直接匹配
            if height == len(parts)-1 {
                return child
            }
            // 继续匹配
            return r.search(child, parts, height+1, req)
        }
        
        result := r.search(child, parts, height+1, req)
        if result != nil {
            // 提取路径参数
            if child.isParam {
                // 参数存储在Context中，这里先标记
                // 实际使用时在ServeHTTP中设置
            }
            return result
        }
    }
    
    return nil
}
```

这个路由树支持三种匹配模式：
- 精确匹配：`/users/profile`
- 路径参数：`/users/:id`（支持正则约束 `/users/:id(\d+)`）
- 通配符：`/static/*`

> 怕浪猫说：路由树的设计是Web框架最核心的部分。前缀树的好处是共享公共前缀，路由越多越省内存。Go标准库的ServeMux在1.22之前连路径参数都不支持，这就是为什么要自己写。

### 6.2 AOP方案：中间件链

中间件是AOP（面向切面编程）在Go Web框架中的体现。日志、链路追踪、指标采集、Panic恢复，这些横切关注点都应该用中间件实现。

```go
package middleware

import (
    "fmt"
    "log"
    "runtime/debug"
    "time"
)

// Logger 请求日志中间件
func Logger() router.HandlerFunc {
    return func(c *router.Context) {
        start := time.Now()
        
        // 请求ID
        requestID := c.Request.Header.Get("X-Request-ID")
        if requestID == "" {
            requestID = generateRequestID()
            c.Request.Header.Set("X-Request-ID", requestID)
        }
        c.Set("request_id", requestID)
        
        // 记录请求信息
        log.Printf("[%s] %s %s - started", 
            requestID, c.Request.Method, c.Request.URL.Path)
        
        c.Next()
        
        // 记录响应信息
        duration := time.Since(start)
        log.Printf("[%s] %s %s - completed in %v", 
            requestID, c.Request.Method, c.Request.URL.Path, duration)
    }
}

// Recovery Panic恢复中间件
func Recovery() router.HandlerFunc {
    return func(c *router.Context) {
        defer func() {
            if err := recover(); err != nil {
                // 记录堆栈
                stack := debug.Stack()
                log.Printf("[%s] PANIC: %v\n%s", 
                    c.Get("request_id"), err, stack)
                
                // 返回500
                c.JSON(http.StatusInternalServerError, map[string]string{
                    "error": "Internal Server Error",
                })
            }
        }()
        
        c.Next()
    }
}

// Tracing 链路追踪中间件（简化版）
func Tracing(serviceName string) router.HandlerFunc {
    return func(c *router.Context) {
        traceID := c.Request.Header.Get("X-Trace-ID")
        if traceID == "" {
            traceID = generateTraceID()
        }
        
        spanID := generateSpanID()
        
        c.Set("trace_id", traceID)
        c.Set("span_id", spanID)
        c.Set("service_name", serviceName)
        
        // 注入响应头
        c.Response.Header().Set("X-Trace-ID", traceID)
        
        c.Next()
    }
}

// Metric 指标采集中间件
type Metrics struct {
    RequestCount    map[string]int64
    RequestDuration map[string]time.Duration
    mu              sync.RWMutex
}

func NewMetrics() *Metrics {
    return &Metrics{
        RequestCount:    make(map[string]int64),
        RequestDuration: make(map[string]time.Duration),
    }
}

func (m *Metrics) Middleware() router.HandlerFunc {
    return func(c *router.Context) {
        start := time.Now()
        
        c.Next()
        
        duration := time.Since(start)
        key := fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.Path)
        
        m.mu.Lock()
        m.RequestCount[key]++
        m.RequestDuration[key] += duration
        m.mu.Unlock()
    }
}

func (m *Metrics) Snapshot() map[string]interface{} {
    m.mu.RLock()
    defer m.mu.RUnlock()
    
    result := make(map[string]interface{})
    for key, count := range m.RequestCount {
        avgDuration := time.Duration(0)
        if count > 0 {
            avgDuration = m.RequestDuration[key] / time.Duration(count)
        }
        result[key] = map[string]interface{}{
            "count":      count,
            "avg_duration": avgDuration.String(),
        }
    }
    return result
}

// CORS 跨域中间件
func CORS(allowedOrigins []string) router.HandlerFunc {
    originSet := make(map[string]bool)
    for _, o := range allowedOrigins {
        originSet[o] = true
    }
    
    return func(c *router.Context) {
        origin := c.Request.Header.Get("Origin")
        if originSet[origin] || originSet["*"] {
            c.Response.Header().Set("Access-Control-Allow-Origin", origin)
            c.Response.Header().Set("Access-Control-Allow-Methods", 
                "GET, POST, PUT, DELETE, OPTIONS")
            c.Response.Header().Set("Access-Control-Allow-Headers", 
                "Content-Type, Authorization, X-Request-ID")
            c.Response.Header().Set("Access-Control-Max-Age", "86400")
        }
        
        if c.Request.Method == "OPTIONS" {
            c.JSON(http.StatusNoContent, nil)
            return
        }
        
        c.Next()
    }
}

func generateRequestID() string {
    b := make([]byte, 16)
    rand.Read(b)
    return hex.EncodeToString(b)
}

func generateTraceID() string {
    return generateRequestID()
}

func generateSpanID() string {
    b := make([]byte, 8)
    rand.Read(b)
    return hex.EncodeToString(b)
}
```

> 怕浪猫说：中间件链的本质就是洋葱模型。请求从外到内穿过每一层，响应从内到外返回。Logger在最外层能看到完整耗时，Recovery必须在最外层兜底，CORS要在业务之前处理OPTIONS。顺序很重要。

### 6.3 集成静态资源服务器

把前面写的缓存静态资源服务器集成进框架：

```go
// 在Router中添加静态资源服务
func (r *Router) Static(prefix string, root string) {
    handler := NewCachedStaticServer(root, 64<<20) // 64MB内存缓存
    
    // 静态资源不需要Session和中间件
    r.addRoute("GET", prefix+"/*", func(c *Context) {
        // 去掉前缀，获取实际文件路径
        path := strings.TrimPrefix(c.Request.URL.Path, prefix)
        if path == "" {
            path = "/"
        }
        c.Request.URL.Path = path
        handler.ServeHTTP(c.Response, c.Request)
    })
}
```

### 6.4 Session机制集成

```go
// SessionMiddleware Session中间件
func SessionMiddleware(manager *session.Manager) router.HandlerFunc {
    return func(c *router.Context) {
        // 尝试获取已有Session
        s, err := manager.GetSession(c.Request)
        if err != nil {
            // 没有Session，创建新的
            s, err = manager.CreateSession(c.Response)
            if err != nil {
                c.JSON(http.StatusInternalServerError, map[string]string{
                    "error": "Session创建失败",
                })
                return
            }
        }
        
        c.Set("session", s)
        c.Next()
        
        // 后置处理：如果Session有修改，保存
        // Redis Store需要显式保存
    }
}

// RequireAuth 登录验证中间件
func RequireAuth(manager *session.Manager) router.HandlerFunc {
    return func(c *router.Context) {
        s, err := manager.GetSession(c.Request)
        if err != nil {
            c.JSON(http.StatusUnauthorized, map[string]string{
                "error": "请先登录",
            })
            return
        }
        
        userID, ok := s.Get("user_id")
        if !ok {
            c.JSON(http.StatusUnauthorized, map[string]string{
                "error": "登录已过期，请重新登录",
            })
            return
        }
        
        c.Set("user_id", userID)
        c.Next()
    }
}
```

### 6.5 用户注册登录完整实现

现在把所有零件组装起来，实现完整的用户注册登录系统：

```go
package main

import (
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "strings"
    "sync"
    "time"
    
    "./router"
    "./session"
)

// ==================== 用户模型 ====================
type User struct {
    ID       string    `json:"id"`
    Username string    `json:"username"`
    Password string    `json:"-"`          // 不返回密码
    Email    string    `json:"email"`
    CreatedAt time.Time `json:"created_at"`
}

// 用户存储（生产环境用数据库）
type UserStore struct {
    mu    sync.RWMutex
    users map[string]*User // key: username
}

func NewUserStore() *UserStore {
    return &UserStore{
        users: make(map[string]*User),
    }
}

func (s *UserStore) Create(username, password, email string) (*User, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    if _, exists := s.users[username]; exists {
        return nil, fmt.Errorf("用户名已存在")
    }
    
    user := &User{
        ID:        generateUserID(),
        Username:  username,
        Password:  hashPassword(password),
        Email:     email,
        CreatedAt: time.Now(),
    }
    
    s.users[username] = user
    return user, nil
}

func (s *UserStore) FindByUsername(username string) (*User, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    
    user, ok := s.users[username]
    if !ok {
        return nil, fmt.Errorf("用户不存在")
    }
    return user, nil
}

func hashPassword(password string) string {
    h := sha256.New()
    h.Write([]byte(password + "palandmao_salt")) // 生产环境用bcrypt
    return hex.EncodeToString(h.Sum(nil))
}

func verifyPassword(password, hash string) bool {
    return hashPassword(password) == hash
}

func generateUserID() string {
    b := make([]byte, 16)
    rand.Read(b)
    return hex.EncodeToString(b)
}

// ==================== 应用 ====================
type App struct {
    router       *router.Router
    sessionMgr   *session.Manager
    userStore    *UserStore
    rateLimiter  *RateLimiter
}

func NewApp() *App {
    // 创建Session管理器（Redis或内存）
    store := session.NewMemoryStore(30 * time.Minute)
    sessionMgr := session.NewManager(store,
        session.WithCookieName("palandmao_sid"),
        session.WithSecure(false), // 生产环境设为true
    )
    
    app := &App{
        router:      router.New(),
        sessionMgr:  sessionMgr,
        userStore:   NewUserStore(),
        rateLimiter: NewRateLimiter(100, time.Minute), // 每分钟100次
    }
    
    // 注册全局中间件
    app.router.Use(
        middleware.Recovery(),
        middleware.Logger(),
        middleware.Tracing("palandmao-web"),
    )
    
    // 注册路由
    app.registerRoutes()
    
    return app
}

func (a *App) registerRoutes() {
    // 公开接口
    a.router.POST("/api/register", a.handleRegister)
    a.router.POST("/api/login", a.handleLogin)
    
    // 需要登录的接口
    a.router.GET("/api/profile", 
        middleware.RequireAuth(a.sessionMgr),
        a.handleGetProfile,
    )
    a.router.POST("/api/logout",
        middleware.RequireAuth(a.sessionMgr),
        a.handleLogout,
    )
    
    // 静态资源
    a.router.Static("/static", "./assets")
    
    // 健康检查
    a.router.GET("/health", a.handleHealth)
}

// ==================== 处理函数 ====================
func (a *App) handleRegister(c *router.Context) {
    // 限流
    if !a.rateLimiter.Allow(c.Request.RemoteAddr) {
        c.JSON(http.StatusTooManyRequests, map[string]string{
            "error": "请求过于频繁，请稍后再试",
        })
        return
    }
    
    var req struct {
        Username string `json:"username"`
        Password string `json:"password"`
        Email    string `json:"email"`
    }
    
    if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
        c.JSON(http.StatusBadRequest, map[string]string{
            "error": "无效的请求格式",
        })
        return
    }
    
    // 参数校验
    if len(req.Username) < 3 || len(req.Username) > 32 {
        c.JSON(http.StatusBadRequest, map[string]string{
            "error": "用户名长度必须在3-32之间",
        })
        return
    }
    if len(req.Password) < 6 {
        c.JSON(http.StatusBadRequest, map[string]string{
            "error": "密码长度不能少于6位",
        })
        return
    }
    if !strings.Contains(req.Email, "@") {
        c.JSON(http.StatusBadRequest, map[string]string{
            "error": "邮箱格式不正确",
        })
        return
    }
    
    user, err := a.userStore.Create(req.Username, req.Password, req.Email)
    if err != nil {
        c.JSON(http.StatusConflict, map[string]string{
            "error": err.Error(),
        })
        return
    }
    
    // 自动登录
    s, _ := a.sessionMgr.CreateSession(c.Response)
    s.Set("user_id", user.ID)
    s.Set("username", user.Username)
    
    c.JSON(http.StatusCreated, map[string]interface{}{
        "message": "注册成功",
        "user":    user,
    })
}

func (a *App) handleLogin(c *router.Context) {
    // 限流
    if !a.rateLimiter.Allow(c.Request.RemoteAddr) {
        c.JSON(http.StatusTooManyRequests, map[string]string{
            "error": "请求过于频繁，请稍后再试",
        })
        return
    }
    
    var req struct {
        Username string `json:"username"`
        Password string `json:"password"`
    }
    
    if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
        c.JSON(http.StatusBadRequest, map[string]string{
            "error": "无效的请求格式",
        })
        return
    }
    
    user, err := a.userStore.FindByUsername(req.Username)
    if err != nil {
        c.JSON(http.StatusUnauthorized, map[string]string{
            "error": "用户名或密码错误",
        })
        return
    }
    
    if !verifyPassword(req.Password, user.Password) {
        c.JSON(http.StatusUnauthorized, map[string]string{
            "error": "用户名或密码错误",
        })
        return
    }
    
    // 创建Session
    s, _ := a.sessionMgr.CreateSession(c.Response)
    s.Set("user_id", user.ID)
    s.Set("username", user.Username)
    
    log.Printf("用户 %s 登录成功", user.Username)
    
    c.JSON(http.StatusOK, map[string]interface{}{
        "message": "登录成功",
        "user":    user,
    })
}

func (a *App) handleGetProfile(c *router.Context) {
    userID, _ := c.Get("user_id")
    
    // 从Session获取用户信息
    s, _ := a.sessionMgr.GetSession(c.Request)
    username, _ := s.Get("username")
    
    c.JSON(http.StatusOK, map[string]interface{}{
        "user_id":  userID,
        "username": username,
    })
}

func (a *App) handleLogout(c *router.Context) {
    a.sessionMgr.DestroySession(c.Response, c.Request)
    c.JSON(http.StatusOK, map[string]string{
        "message": "已退出登录",
    })
}

func (a *App) handleHealth(c *router.Context) {
    c.JSON(http.StatusOK, map[string]string{
        "status": "ok",
        "time":   time.Now().Format(time.RFC3339),
    })
}

func (a *App) Run(addr string) error {
    log.Printf("服务器启动在 %s", addr)
    return http.ListenAndServe(addr, a.router)
}

// ==================== 启动 ====================
func main() {
    app := NewApp()
    log.Fatal(app.Run(":8080"))
}
```

> 怕浪猫说：登录接口的返回信息要特别注意，"用户名或密码错误"比"用户不存在"安全得多。后者等于告诉攻击者这个用户名没注册，可以拿去撞库。

### 6.6 用户级限流

限流是保护服务不被打挂的关键手段。前面代码里用到了 `RateLimiter`，这里给出完整实现：

```go
package ratelimit

import (
    "sync"
    "time"
)

// TokenBucket 令牌桶限流器
type TokenBucket struct {
    rate       float64       // 每秒生成的令牌数
    burst      float64       // 桶容量
    tokens     float64       // 当前令牌数
    lastUpdate time.Time     // 上次更新时间
    mu         sync.Mutex
}

func NewTokenBucket(rate float64, burst float64) *TokenBucket {
    return &TokenBucket{
        rate:       rate,
        burst:      burst,
        tokens:     burst, // 初始满桶
        lastUpdate: time.Now(),
    }
}

func (tb *TokenBucket) Allow() bool {
    tb.mu.Lock()
    defer tb.mu.Unlock()
    
    now := time.Now()
    elapsed := now.Sub(tb.lastUpdate).Seconds()
    
    // 补充令牌
    tb.tokens += elapsed * tb.rate
    if tb.tokens > tb.burst {
        tb.tokens = tb.burst
    }
    tb.lastUpdate = now
    
    if tb.tokens >= 1 {
        tb.tokens--
        return true
    }
    
    return false
}

// RateLimiter 用户级限流器
type RateLimiter struct {
    mu       sync.Mutex
    buckets  map[string]*TokenBucket // key: 用户IP或ID
    rate     float64
    burst    float64
    interval time.Duration // 清理间隔
}

func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
    rl := &RateLimiter{
        buckets:  make(map[string]*TokenBucket),
        rate:     float64(rate) / window.Seconds(),
        burst:    float64(rate),
        interval: time.Hour, // 1小时清理一次空闲桶
    }
    // 启动清理协程
    go rl.cleanup()
    return rl
}

func (rl *RateLimiter) Allow(key string) bool {
    rl.mu.Lock()
    bucket, ok := rl.buckets[key]
    if !ok {
        bucket = NewTokenBucket(rl.rate, rl.burst)
        rl.buckets[key] = bucket
    }
    rl.mu.Unlock()
    
    return bucket.Allow()
}

func (rl *RateLimiter) cleanup() {
    ticker := time.NewTicker(rl.interval)
    defer ticker.Stop()
    
    for range ticker.C {
        rl.mu.Lock()
        // 简单策略：超过1小时没访问的桶直接清理
        // 生产环境可以用更精细的LRU策略
        now := time.Now()
        for key, bucket := range rl.buckets {
            if now.Sub(bucket.lastUpdate) > time.Hour {
                delete(rl.buckets, key)
            }
        }
        rl.mu.Unlock()
    }
}
```

### 6.7 压测与性能优化

框架写完了，能跑只是第一步，能扛多少才是关键。用Go标准库的benchmark做个简单压测：

```go
package main

import (
    "testing"
    "net/http"
    "net/http/httptest"
    "strings"
)

func BenchmarkRegister(b *testing.B) {
    app := NewApp()
    
    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        i := 0
        for pb.Next() {
            body := strings.NewReader(fmt.Sprintf(
                `{"username":"user_%d","password":"123456","email":"user_%d@test.com"}`,
                i, i,
            ))
            req := httptest.NewRequest("POST", "/api/register", body)
            req.Header.Set("Content-Type", "application/json")
            w := httptest.NewRecorder()
            
            app.router.ServeHTTP(w, req)
            
            i++
        }
    })
}

func BenchmarkLogin(b *testing.B) {
    app := NewApp()
    // 先注册一个用户
    body := strings.NewReader(
        `{"username":"testuser","password":"123456","email":"test@test.com"}`)
    req := httptest.NewRequest("POST", "/api/register", body)
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    app.router.ServeHTTP(w, req)
    
    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            body := strings.NewReader(
                `{"username":"testuser","password":"123456"}`)
            req := httptest.NewRequest("POST", "/api/login", body)
            req.Header.Set("Content-Type", "application/json")
            w := httptest.NewRecorder()
            
            app.router.ServeHTTP(w, req)
        }
    })
}
```

压测后分析性能瓶颈的步骤：

```markdown
## 性能优化清单

### 第一步：Profile分析
1. 用 go test -bench -cpuprofile 生成CPU profile
2. 用 go tool pprof 分析热点函数
3. 用 go test -bench -memprofile 生成内存 profile
4. 重点关注：内存分配次数、GC耗时、锁竞争

### 第二步：常见优化点
- [ ] JSON序列化：用 jsoniter 或 sonic 替代标准库
- [ ] 内存池：用 sync.Pool 复用 Context 对象
- [ ] 路由优化：减少中间件数量，合并相似路由
- [ ] Session优化：Redis操作用 Pipeline 批量执行
- [ ] 连接池：HTTP客户端复用连接
- [ ] GC调优：设置 GOGC 控制GC频率

### 第三步：压测验证
- [ ] wrk 或 hey 进行HTTP压测
- [ ] 关注 P99 延迟而非平均值
- [ ] 检查 goroutine 泄漏
- [ ] 监控内存增长趋势
```

Context对象池化的实现：

```go
package router

import "sync"

var contextPool = sync.Pool{
    New: func() interface{} {
        return &Context{
            Params: make(map[string]string),
            store:  make(map[string]interface{}),
            index:  -1,
        }
    },
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
    // 从池中获取Context
    c := contextPool.Get().(*Context)
    
    // 重置Context
    c.Request = req
    c.Response = w
    c.Params = c.Params[:0] // 清空但保留底层数组
    for k := range c.store {
        delete(c.store, k)
    }
    c.index = -1
    c.handlers = nil
    
    // ... 路由匹配和处理 ...
    
    // 放回池中
    contextPool.Put(c)
}
```

> 怕浪猫说：性能优化有个铁律——先测量，再优化。不要凭直觉优化，profile数据告诉你哪里慢，你就优化哪里。大部分情况下，瓶颈都在你意想不到的地方。

### 6.8 限流的进阶：多级限流

生产环境单级限流往往不够，需要多级限流配合：

```go
// MultiLevelLimiter 多级限流器
type MultiLevelLimiter struct {
    // IP级别：防止单IP暴力攻击
    ipLimiter *RateLimiter
    // 用户级别：防止单用户高频请求
    userLimiter *RateLimiter
    // 全局级别：保护整个服务不过载
    globalLimiter *TokenBucket
}

func NewMultiLevelLimiter() *MultiLevelLimiter {
    return &MultiLevelLimiter{
        ipLimiter:    NewRateLimiter(60, time.Minute),   // 单IP每分钟60次
        userLimiter:  NewRateLimiter(30, time.Minute),   // 单用户每分钟30次
        globalLimiter: NewTokenBucket(10000, 10000),      // 全局每秒10000次
    }
}

func (m *MultiLevelLimiter) Allow(ip string, userID string) bool {
    // 先检查全局
    if !m.globalLimiter.Allow() {
        return false
    }
    
    // 再检查IP
    if !m.ipLimiter.Allow(ip) {
        return false
    }
    
    // 最后检查用户（如果已登录）
    if userID != "" {
        if !m.userLimiter.Allow(userID) {
            return false
        }
    }
    
    return true
}

// 限流中间件
func RateLimitMiddleware(limiter *MultiLevelLimiter) router.HandlerFunc {
    return func(c *router.Context) {
        ip := getClientIP(c.Request)
        
        // 尝试获取用户ID（如果已登录）
        userID := ""
        if s, err := manager.GetSession(c.Request); err == nil {
            if id, ok := s.Get("user_id"); ok {
                userID = id.(string)
            }
        }
        
        if !limiter.Allow(ip, userID) {
            c.JSON(http.StatusTooManyRequests, map[string]string{
                "error": "请求过于频繁",
            })
            return
        }
        
        c.Next()
    }
}

func getClientIP(r *http.Request) string {
    // 优先从X-Forwarded-For获取（经过代理时）
    if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
        // 取第一个IP（最原始的客户端IP）
        if idx := strings.Index(xff, ","); idx != -1 {
            return strings.TrimSpace(xff[:idx])
        }
        return xff
    }
    if xri := r.Header.Get("X-Real-IP"); xri != "" {
        return xri
    }
    // 去掉端口
    if idx := strings.LastIndex(r.RemoteAddr, ":"); idx != -1 {
        return r.RemoteAddr[:idx]
    }
    return r.RemoteAddr
}
```

> 怕浪猫说：限流不是拒绝服务，而是保护服务。被限流的用户看到"请稍后再试"比看到500内部错误体验好得多。限流是为了让大部分用户正常使用，而不是让所有人一起挂。

### 6.9 完整的框架启动流程

最后看一下完整的框架启动和路由注册：

```go
func main() {
    // 初始化各组件
    userStore := NewUserStore()
    
    // Session存储：开发用内存，生产用Redis
    var sessionStore session.Store
    if os.Getenv("ENV") == "production" {
        sessionStore = session.NewRedisStore(
            "localhost:6379", "", 0,
            "palandmao:session:", 30*time.Minute,
        )
    } else {
        sessionStore = session.NewMemoryStore(30 * time.Minute)
    }
    
    sessionMgr := session.NewManager(sessionStore,
        session.WithCookieName("palandmao_sid"),
        session.WithSecure(os.Getenv("ENV") == "production"),
        session.WithSameSite(http.SameSiteStrictMode),
    )
    
    rateLimiter := NewMultiLevelLimiter()
    
    // 创建路由
    r := router.New()
    
    // 全局中间件（注意顺序）
    r.Use(
        middleware.Recovery(),     // 最外层：Panic恢复
        middleware.Logger(),       // 日志
        middleware.Tracing("palandmao-web"), // 链路追踪
        middleware.CORS([]string{"https://example.com"}), // 跨域
        RateLimitMiddleware(rateLimiter), // 限流
    )
    
    // 注册路由
    r.POST("/api/register", handleRegister(userStore, sessionMgr))
    r.POST("/api/login", handleLogin(userStore, sessionMgr))
    
    // 需要登录的路由组
    authGroup := r.Group("/api/auth",
        middleware.RequireAuth(sessionMgr),
    )
    authGroup.GET("/profile", handleGetProfile)
    authGroup.POST("/logout", handleLogout(sessionMgr))
    
    // 静态资源
    r.Static("/static", "./assets")
    
    // 启动服务器
    server := &http.Server{
        Addr:         ":8080",
        Handler:      r,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  60 * time.Second,
        MaxHeaderBytes: 1 << 20, // 1MB
    }
    
    log.Printf("怕浪猫Web框架启动在 %s", server.Addr)
    
    // 优雅关闭
    go func() {
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("服务器启动失败: %v", err)
        }
    }()
    
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    
    log.Println("正在关闭服务器...")
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    
    if err := server.Shutdown(ctx); err != nil {
        log.Fatal("服务器强制关闭:", err)
    }
    
    log.Println("服务器已安全关闭")
}
```

> 怕浪猫说：优雅关闭是很多教程忽略的细节。收到SIGTERM后，应该停止接收新请求，等待已有请求处理完毕再退出。否则部署时用户的请求会被中断，体验很差。

---

## 知识回顾与重点总结

这章内容不少，怕浪猫帮你梳理核心知识点：

**文件上传下载：**
- multipart/form-data用 `r.ParseMultipartForm` + `r.FormFile` 处理
- 大文件用 `multipart.Reader` 流式处理，内存恒定
- 下载用 `http.ServeContent`，自动支持断点续传
- 文件名必须清洗，防路径穿越

**模板引擎：**
- HTML渲染用 `html/template`，自动XSS转义
- 模板继承通过 `define` + `template` 动作实现
- 预解析模板，别每次请求都Parse

**Option模式：**
- 解决可选配置问题，API灵活且向后兼容
- 泛型 `Option[T any]` 实现通用化
- 可扩展校验逻辑

**静态资源服务器：**
- ETag + Cache-Control 是缓存标配
- LRU内存缓存加速高频小文件
- 大文件流式传输，内存可控

**Session机制：**
- 内存Session适合单机，Redis适合分布式
- Session ID用 crypto/rand 生成
- 分布式方案：Sticky、复制、集中存储、JWT

**手写框架核心：**
- 前缀路由树：支持精确匹配、路径参数、通配符
- 中间件链：洋葱模型，顺序很重要
- AOP：日志、追踪、指标、恢复分离关注点
- 多级限流：IP级 + 用户级 + 全局级

---

如果你觉得这篇内容对你有帮助，点个收藏别到时候找不到了。有问题或者想讨论的，评论区见，怕浪猫每条都会看。

这个系列会持续更新，从HTTP基础一路打到微服务实战，关注我不错过后续更新。

**系列进度 3/16**

下一章预告：**ORM核心设计** —— 从database/sql的痛点出发，手写一个支持连接池、事务管理、批量操作的ORM框架，深入理解GORM背后的设计思想。

---

**怕浪猫说：** 框架这东西，用别人的是方便，自己写一遍才懂原理。这章的手写框架不是为了替代Gin或Echo，而是让你理解它们的每个设计决策。知道了为什么，才能在技术选型时做出正确的判断。写代码不是搬砖，是工程决策。下章见。
