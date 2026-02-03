# 第八章：网络编程实战应用

## 摘要

网络编程是现代软件开发的核心技能之一。本章将从基础I/O模型开始，深入讲解各种网络编程技术，包括HTTP客户端/服务器开发、Web爬虫技术、实时通信等。我们将以Go语言为主，配合Java、Python、Node.js等语言，为读者提供全面的网络编程实战指南。

**关键词**：网络编程、HTTP、Go语言、Socket、WebSocket、爬虫

---

## 8.1 网络编程基础

### 8.1.1 I/O模型深入解析

网络编程的核心在于处理I/O操作。现代系统主要使用以下几种I/O模型：

#### 阻塞I/O模型（Blocking I/O）

阻塞I/O是最传统的I/O模型，在进行读写操作时线程会被阻塞：

```go
// Go语言阻塞I/O示例
func blockingRead(conn net.Conn, buffer []byte) (int, error) {
    // 在数据到达前，这个调用会阻塞当前goroutine
    n, err := conn.Read(buffer)
    return n, err
}
```

#### 非阻塞I/O模型（Non-blocking I/O）

非阻塞I/O模型允许程序在数据未准备好时立即返回：

```go
// Go语言非阻塞I/O示例
func nonBlockingRead(conn net.Conn, buffer []byte) (int, error) {
    conn.SetReadDeadline(time.Now().Add(1 * time.Millisecond))
    n, err := conn.Read(buffer)
    return n, err
}
```

#### I/O多路复用（I/O Multiplexing）

I/O多路复用允许一个线程同时监控多个I/O操作：

```go
// Go语言I/O多路复用示例
func multiplexedIO() {
    listener, _ := net.Listen("tcp", ":8080")
    defer listener.Close()

    for {
        conn, err := listener.Accept()
        if err != nil {
            continue
        }

        // 为每个连接创建新的goroutine处理
        go handleConnection(conn)
    }
}

func handleConnection(conn net.Conn) {
    defer conn.Close()
    buffer := make([]byte, 1024)

    for {
        n, err := conn.Read(buffer)
        if err != nil {
            return
        }

        // 处理接收到的数据
        data := buffer[:n]
        fmt.Printf("Received: %s\n", string(data))

        // 回显数据
        conn.Write(data)
    }
}
```

### 8.1.2 事件驱动架构

事件驱动架构是现代网络应用的核心设计模式：

```go
// 事件驱动的HTTP服务器
type EventDrivenServer struct {
    events   map[string]func(interface{})
    client   *http.Client
}

func NewEventDrivenServer() *EventDrivenServer {
    return &EventDrivenServer{
        events: make(map[string]func(interface{})),
        client: &http.Client{
            Transport: &http.Transport{
                MaxIdleConns:        100,
                IdleConnTimeout:      90 * time.Second,
                DisableCompression:   false,
            },
        },
    }
}

func (s *EventDrivenServer) On(event string, handler func(interface{})) {
    s.events[event] = handler
}

func (s *EventDrivenServer) Emit(event string, data interface{}) {
    if handler, exists := s.events[event]; exists {
        handler(data)
    }
}

// 使用示例
func main() {
    server := NewEventDrivenServer()

    server.On("request", func(data interface{}) {
        req := data.(*http.Request)
        fmt.Printf("Handling request: %s %s\n", req.Method, req.URL.Path)
    })

    server.On("response", func(data interface{}) {
        resp := data.(*http.Response)
        fmt.Printf("Response status: %d\n", resp.StatusCode)
    })
}
```

### 8.1.3 线程池模式

对于CPU密集型任务，线程池可以避免频繁创建销毁线程的开销：

```go
// Go语言线程池实现
type ThreadPool struct {
    workers    int
    jobs       chan Job
    results    chan Result
    wg         sync.WaitGroup
}

type Job struct {
    ID       int
    Task     func() interface{}
    Callback func(interface{})
}

type Result struct {
    JobID int
    Data  interface{}
    Error error
}

func NewThreadPool(workers int) *ThreadPool {
    return &ThreadPool{
        workers: workers,
        jobs:    make(chan Job, workers*2),
        results: make(chan Result, workers*2),
    }
}

func (p *ThreadPool) Start() {
    for i := 0; i < p.workers; i++ {
        p.wg.Add(1)
        go p.worker()
    }
}

func (p *ThreadPool) worker() {
    defer p.wg.Done()
    for job := range p.jobs {
        result := Result{
            JobID: job.ID,
        }

        // 执行任务
        result.Data = job.Task()

        // 发送结果
        p.results <- result

        // 执行回调
        if job.Callback != nil {
            job.Callback(result.Data)
        }
    }
}

func (p *ThreadPool) Submit(job Job) {
    p.jobs <- job
}

func (p *ThreadPool) GetResults() <-chan Result {
    return p.results
}

func (p *ThreadPool) Stop() {
    close(p.jobs)
    p.wg.Wait()
    close(p.results)
}
```

## 8.2 HTTP客户端编程实战

### 8.2.1 Go语言HTTP客户端

```go
// 高性能HTTP客户端
type HTTPClient struct {
    client    *http.Client
    retries   int
    timeout   time.Duration
}

func NewHTTPClient(retries int, timeout time.Duration) *HTTPClient {
    return &HTTPClient{
        client: &http.Client{
            Timeout: timeout,
            Transport: &http.Transport{
                MaxIdleConns:        100,
                MaxIdleConnsPerHost: 10,
                IdleConnTimeout:      90 * time.Second,
                DisableCompression:   false,
                TLSClientConfig: &tls.Config{
                    InsecureSkipVerify: true,
                },
            },
        },
        retries: retries,
        timeout: timeout,
    }
}

func (c *HTTPClient) Get(url string, headers map[string]string) (*http.Response, error) {
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }

    // 设置请求头
    for key, value := range headers {
        req.Header.Set(key, value)
    }

    return c.doRequest(req)
}

func (c *HTTPClient) Post(url string, headers map[string]string, body interface{}) (*http.Response, error) {
    req, err := http.NewRequest("POST", url, c.encodeBody(body))
    if err != nil {
        return nil, err
    }

    // 设置请求头
    for key, value := range headers {
        req.Header.Set(key, value)
    }

    return c.doRequest(req)
}

func (c *HTTPClient) doRequest(req *http.Request) (*http.Response, error) {
    var resp *http.Response
    var err error

    for i := 0; i <= c.retries; i++ {
        resp, err = c.client.Do(req)
        if err == nil && resp != nil && resp.StatusCode < 500 {
            return resp, nil
        }

        if i < c.retries {
            time.Sleep(time.Duration(i+1) * time.Second)
        }
    }

    return resp, err
}

func (c *HTTPClient) encodeBody(body interface{}) io.Reader {
    if body == nil {
        return nil
    }

    switch v := body.(type) {
    case string:
        return strings.NewReader(v)
    case []byte:
        return bytes.NewReader(v)
    default:
        jsonBytes, _ := json.Marshal(v)
        return bytes.NewReader(jsonBytes)
    }
}

// 使用示例
func main() {
    client := NewHTTPClient(3, 30*time.Second)

    headers := map[string]string{
        "User-Agent": "Go-HTTP-Client/1.0",
        "Accept":     "application/json",
    }

    resp, err := client.Get("https://httpbin.org/get", headers)
    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }
    defer resp.Body.Close()

    fmt.Printf("Status: %s\n", resp.Status)
}
```

### 8.2.2 多语言HTTP客户端对比

#### Java HttpClient示例

```java
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class JavaHTTPClient {
    private final HttpClient client;

    public JavaHTTPClient() {
        this.client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_2)
            .connectTimeout(Duration.ofSeconds(30))
            .build();
    }

    public String get(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .GET()
            .timeout(Duration.ofSeconds(30))
            .header("User-Agent", "Java-HTTP-Client/1.0")
            .uri(java.net.URI.create(url))
            .build();

        HttpResponse<String> response = client.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        );

        return response.body();
    }

    public String post(String url, String jsonBody) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .header("User-Agent", "Java-HTTP-Client/1.0")
            .uri(java.net.URI.create(url))
            .build();

        HttpResponse<String> response = client.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        );

        return response.body();
    }
}
```

#### Python requests库示例

```python
import requests
import json
from typing import Dict, Any, Optional

class PythonHTTPClient:
    def __init__(self, timeout: int = 30, retries: int = 3):
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Python-HTTP-Client/1.0',
            'Accept': 'application/json'
        })

    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        try:
            response = self.session.get(
                url,
                timeout=self.timeout,
                headers=headers or {}
            )
            response.raise_for_status()
            return response.json() if response.content else {}
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return {}

    def post(self, url: str, data: Any, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        try:
            json_data = json.dumps(data) if not isinstance(data, str) else data
            response = self.session.post(
                url,
                data=json_data,
                timeout=self.timeout,
                headers={'Content-Type': 'application/json', **(headers or {})}
            )
            response.raise_for_status()
            return response.json() if response.content else {}
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return {}

# 使用示例
if __name__ == "__main__":
    client = PythonHTTPClient()

    # GET请求
    result = client.get("https://httpbin.org/get")
    print(f"GET result: {result}")

    # POST请求
    post_data = {"name": "test", "value": 123}
    result = client.post("https://httpbin.org/post", post_data)
    print(f"POST result: {result}")
```

#### Node.js axios库示例

```javascript
const axios = require("axios");

class NodeHTTPClient {
  constructor(options = {}) {
    this.client = axios.create({
      timeout: options.timeout || 30000,
      headers: {
        "User-Agent": "Node-HTTP-Client/1.0",
        Accept: "application/json",
        ...options.headers,
      },
    });
  }

  async get(url, headers = {}) {
    try {
      const response = await this.client.get(url, { headers });
      return response.data;
    } catch (error) {
      console.error(`GET request failed: ${error.message}`);
      return null;
    }
  }

  async post(url, data, headers = {}) {
    try {
      const response = await this.client.post(url, data, {
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });
      return response.data;
    } catch (error) {
      console.error(`POST request failed: ${error.message}`);
      return null;
    }
  }
}

// 使用示例
async function main() {
  const client = new NodeHTTPClient();

  // GET请求
  const getResult = await client.get("https://httpbin.org/get");
  console.log("GET result:", getResult);

  // POST请求
  const postData = { name: "test", value: 123 };
  const postResult = await client.post("https://httpbin.org/post", postData);
  console.log("POST result:", postResult);
}

main().catch(console.error);
```

## 8.3 HTTP服务器开发实战

### 8.3.1 Go Gin框架实战

```go
package main

import (
    "log"
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/gin-contrib/cors"
    "github.com/gin-contrib/expvar"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
    httpDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "http_request_duration_seconds",
            Help: "Duration of HTTP requests.",
        },
        []string{"method", "endpoint"},
    )

    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests.",
        },
        []string{"method", "endpoint", "status"},
    )
)

func init() {
    prometheus.MustRegister(httpDuration, httpRequestsTotal)
}

type App struct {
    Gin *gin.Engine
}

func NewApp() *App {
    r := gin.New()

    // 中间件
    r.Use(gin.Logger())
    r.Use(gin.Recovery())
    r.Use(cors.Default())

    // Prometheus指标
    r.GET("/metrics", gin.WrapH(promhttp.Handler()))
    r.GET("/debug/vars", expvar.Handler())

    // API路由
    api := r.Group("/api/v1")
    {
        api.GET("/users", getUsers)
        api.GET("/users/:id", getUser)
        api.POST("/users", createUser)
        api.PUT("/users/:id", updateUser)
        api.DELETE("/users/:id", deleteUser)

        // 健康检查
        api.GET("/health", healthCheck)

        // 文件上传
        api.POST("/upload", uploadFile)
    }

    return &App{Gin: r}
}

// 用户模型
type User struct {
    ID        int       `json:"id"`
    Name      string    `json:"name"`
    Email     string    `json:"email"`
    CreatedAt time.Time `json:"created_at"`
}

// 模拟数据库
var users = []User{
    {ID: 1, Name: "Alice", Email: "alice@example.com", CreatedAt: time.Now()},
    {ID: 2, Name: "Bob", Email: "bob@example.com", CreatedAt: time.Now()},
}

// 中间件：指标收集
func metricsMiddleware() gin.HandlerFunc {
    return gin.HandlerFunc(func(c *gin.Context) {
        start := time.Now()

        c.Next()

        duration := time.Since(start).Seconds()
        httpDuration.WithLabelValues(
            c.Request.Method,
            c.FullPath(),
        ).Observe(duration)

        httpRequestsTotal.WithLabelValues(
            c.Request.Method,
            c.FullPath(),
            string(rune(c.Writer.Status())),
        ).Inc()
    })
}

// API处理器
func getUsers(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
        "users": users,
        "count": len(users),
    })
}

func getUser(c *gin.Context) {
    id := c.Param("id")

    for _, user := range users {
        if fmt.Sprintf("%d", user.ID) == id {
            c.JSON(http.StatusOK, user)
            return
        }
    }

    c.JSON(http.StatusNotFound, gin.H{
        "error": "User not found",
    })
}

func createUser(c *gin.Context) {
    var newUser User

    if err := c.ShouldBindJSON(&newUser); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": err.Error(),
        })
        return
    }

    newUser.ID = len(users) + 1
    newUser.CreatedAt = time.Now()

    users = append(users, newUser)

    c.JSON(http.StatusCreated, newUser)
}

func updateUser(c *gin.Context) {
    id := c.Param("id")
    var updatedUser User

    if err := c.ShouldBindJSON(&updatedUser); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": err.Error(),
        })
        return
    }

    for i, user := range users {
        if fmt.Sprintf("%d", user.ID) == id {
            updatedUser.ID = user.ID
            updatedUser.CreatedAt = user.CreatedAt
            users[i] = updatedUser
            c.JSON(http.StatusOK, updatedUser)
            return
        }
    }

    c.JSON(http.StatusNotFound, gin.H{
        "error": "User not found",
    })
}

func deleteUser(c *gin.Context) {
    id := c.Param("id")

    for i, user := range users {
        if fmt.Sprintf("%d", user.ID) == id {
            users = append(users[:i], users[i+1:]...)
            c.JSON(http.StatusOK, gin.H{
                "message": "User deleted successfully",
            })
            return
        }
    }

    c.JSON(http.StatusNotFound, gin.H{
        "error": "User not found",
    })
}

func healthCheck(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
        "status": "healthy",
        "time":   time.Now().Unix(),
    })
}

func uploadFile(c *gin.Context) {
    file, err := c.FormFile("file")
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "No file uploaded",
        })
        return
    }

    // 保存文件
    filename := fmt.Sprintf("uploads/%s", file.Filename)
    if err := c.SaveUploadedFile(file, filename); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{
            "error": "Failed to save file",
        })
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "File uploaded successfully",
        "filename": filename,
        "size": file.Size,
    })
}

func main() {
    app := NewApp()

    // 应用指标中间件
    app.Gin.Use(metricsMiddleware())

    log.Println("Starting server on :8080")
    if err := app.Gin.Run(":8080"); err != nil {
        log.Fatal(err)
    }
}
```

### 8.3.2 多语言框架对比

#### Java Spring Boot示例

```java
@RestController
@RequestMapping("/api/v1")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping("/users")
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        return userService.getUserById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/users")
    public ResponseEntity<User> createUser(@RequestBody User user) {
        User createdUser = userService.createUser(user);
        return ResponseEntity.created(URI.create("/api/v1/users/" + createdUser.getId()))
                .body(createdUser);
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<User> updateUser(@PathVariable Long id, @RequestBody User user) {
        return userService.updateUser(id, user)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        return userService.deleteUser(id) ?
                ResponseEntity.ok().build() :
                ResponseEntity.notFound().build();
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("timestamp", Instant.now());
        return ResponseEntity.ok(health);
    }
}

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

#### Python Flask示例

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import time

app = Flask(__name__)
CORS(app)

# Prometheus指标
http_requests_total = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
http_request_duration = Histogram('http_request_duration_seconds', 'HTTP request duration')

class User:
    def __init__(self, id, name, email):
        self.id = id
        self.name = name
        self.email = email
        self.created_at = time.time()

# 模拟数据库
users = [
    User(1, "Alice", "alice@example.com"),
    User(2, "Bob", "bob@example.com")
]

def track_metrics(func):
    def wrapper(*args, **kwargs):
        start_time = time.time()
        response = func(*args, **kwargs)
        duration = time.time() - start_time

        http_requests_total.labels(
            method=request.method,
            endpoint=request.endpoint or 'unknown',
            status=response[1] if isinstance(response, tuple) else 200
        ).inc()

        http_request_duration.observe(duration)
        return response
    wrapper.__name__ = func.__name__
    return wrapper

@app.route('/api/v1/users', methods=['GET'])
@track_metrics
def get_users():
    return jsonify({
        'users': [
            {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'created_at': user.created_at
            } for user in users
        ],
        'count': len(users)
    })

@app.route('/api/v1/users/<int:user_id>', methods=['GET'])
@track_metrics
def get_user(user_id):
    user = next((u for u in users if u.id == user_id), None)
    if user:
        return jsonify({
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'created_at': user.created_at
        })
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/v1/users', methods=['POST'])
@track_metrics
def create_user():
    data = request.get_json()
    if not data or not data.get('name') or not data.get('email'):
        return jsonify({'error': 'Name and email are required'}), 400

    new_user = User(
        id=max(u.id for u in users) + 1,
        name=data['name'],
        email=data['email']
    )
    users.append(new_user)

    return jsonify({
        'id': new_user.id,
        'name': new_user.name,
        'email': new_user.email,
        'created_at': new_user.created_at
    }), 201

@app.route('/api/v1/users/<int:user_id>', methods=['PUT'])
@track_metrics
def update_user(user_id):
    data = request.get_json()
    user = next((u for u in users if u.id == user_id), None)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    if 'name' in data:
        user.name = data['name']
    if 'email' in data:
        user.email = data['email']

    return jsonify({
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'created_at': user.created_at
    })

@app.route('/api/v1/users/<int:user_id>', methods=['DELETE'])
@track_metrics
def delete_user(user_id):
    global users
    user = next((u for u in users if u.id == user_id), None)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    users = [u for u in users if u.id != user_id]
    return jsonify({'message': 'User deleted successfully'})

@app.route('/api/v1/health', methods=['GET'])
@track_metrics
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': int(time.time())
    })

@app.route('/metrics')
def metrics():
    return generate_latest()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
```

## 8.4 网络爬虫技术实战

### 8.4.1 Go爬虫框架

```go
package main

import (
    "context"
    "fmt"
    "log"
    "regexp"
    "sync"
    "time"

    "github.com/PuerkitoBio/goquery"
    "github.com/gocolly/colly/v2"
    "github.com/gocolly/colly/v2/queue"
    "github.com/gocolly/colly/v2/storage"
)

type Crawler struct {
    c         *colly.Collector
    visited   map[string]bool
    visitedMu sync.RWMutex
    results   []CrawlResult
    resultsMu sync.Mutex
}

type CrawlResult struct {
    URL         string            `json:"url"`
    Title       string            `json:"title"`
    Content     string            `json:"content"`
    Links       []string          `json:"links"`
    Images      []string          `json:"images"`
    MetaData    map[string]string `json:"metadata"`
    StatusCode  int               `json:"status_code"`
    Timestamp   time.Time         `json:"timestamp"`
}

func NewCrawler() *Crawler {
    // 创建收集器
    c := colly.NewCollector(
        colly.UserAgent("Go-Crawler/1.0"),
        colly.MaxDepth(3),
        colly.Async(true),
    )

    // 设置存储
    c.SetStorage(&storage.InMemoryStorage{})

    // 设置并发
    c.Limit(&colly.LimitRule{
        DomainGlob: "*",
        Parallelism: 10,
        Delay:      1 * time.Second,
    })

    crawler := &Crawler{
        c:       c,
        visited: make(map[string]bool),
        results: make([]CrawlResult, 0),
    }

    crawler.setupCallbacks()
    return crawler
}

func (cr *Crawler) setupCallbacks() {
    // 访问页面前的回调
    cr.c.OnRequest(func(r *colly.Request) {
        fmt.Printf("Visiting: %s\n", r.URL.String())
    })

    // 错误处理
    cr.c.OnError(func(r *colly.Response, err error) {
        fmt.Printf("Error on %s: %v\n", r.Request.URL, err)
    })

    // HTML响应处理
    cr.c.OnHTML("html", func(e *colly.HTMLElement) {
        url := e.Request.URL.String()

        // 检查是否已访问
        if cr.isVisited(url) {
            return
        }

        cr.markVisited(url)

        // 提取数据
        result := cr.extractData(e)
        cr.saveResult(result)

        // 提取链接
        e.ForEach("a[href]", func(_ int, el *colly.HTMLElement) {
            link := el.Attr("href")
            if link != "" {
                absLink := e.Request.AbsoluteURL(link)
                cr.c.Visit(absLink)
            }
        })

        // 提取图片
        e.ForEach("img[src]", func(_ int, el *colly.HTMLElement) {
            src := el.Attr("src")
            if src != "" {
                absSrc := e.Request.AbsoluteURL(src)
                result.Images = append(result.Images, absSrc)
            }
        })
    })

    // 响应完成回调
    cr.c.OnResponse(func(r *colly.Response) {
        fmt.Printf("Finished: %s (Status: %d)\n", r.Request.URL, r.StatusCode)
    })
}

func (cr *Crawler) extractData(e *colly.HTMLElement) CrawlResult {
    result := CrawlResult{
        URL:        e.Request.URL.String(),
        Timestamp:  time.Now(),
        MetaData:   make(map[string]string),
        StatusCode: e.Response.StatusCode,
    }

    // 提取标题
    result.Title = e.ChildText("title")
    if result.Title == "" {
        result.Title = e.ChildText("h1")
    }

    // 提取内容
    content := e.ChildText("body")
    if content != "" {
        // 清理内容
        re := regexp.MustCompile(`\s+`)
        result.Content = re.ReplaceAllString(content, " ")
    }

    // 提取元数据
    e.ForEach("meta", func(_ int, el *colly.HTMLElement) {
        name := el.Attr("name")
        if name != "" {
            result.MetaData[name] = el.Attr("content")
        }

        property := el.Attr("property")
        if property != "" {
            result.MetaData[property] = el.Attr("content")
        }
    })

    // 提取结构化数据
    e.ForEach("script[type='application/ld+json']", func(_ int, el *colly.HTMLElement) {
        jsonData := el.Text()
        result.MetaData["structured_data"] = jsonData
    })

    return result
}

func (cr *Crawler) isVisited(url string) bool {
    cr.visitedMu.RLock()
    defer cr.visitedMu.RUnlock()
    return cr.visited[url]
}

func (cr *Crawler) markVisited(url string) {
    cr.visitedMu.Lock()
    defer cr.visitedMu.Unlock()
    cr.visited[url] = true
}

func (cr *Crawler) saveResult(result CrawlResult) {
    cr.resultsMu.Lock()
    defer cr.resultsMu.Unlock()
    cr.results = append(cr.results, result)
}

func (cr *Crawler) Start(startURL string) error {
    // 创建队列
    q, _ := queue.New(2, &queue.InMemoryQueueStorage{})

    // 添加起始URL
    q.AddURL(startURL)

    // 启动爬虫
    q.Run(cr.c)

    return nil
}

func (cr *Crawler) GetResults() []CrawlResult {
    cr.resultsMu.Lock()
    defer cr.resultsMu.Unlock()
    results := make([]CrawlResult, len(cr.results))
    copy(results, cr.results)
    return results
}

// 高级爬虫功能
type AdvancedCrawler struct {
    *Crawler
    proxyManager *ProxyManager
    rateLimiter *RateLimiter
    sessionManager *SessionManager
}

type ProxyManager struct {
    proxies []string
    current int
    mu     sync.Mutex
}

type RateLimiter struct {
    requests map[string]int
    window  time.Duration
    limit   int
    mu      sync.Mutex
}

type SessionManager struct {
    sessions map[string]*colly.Collector
}

func NewAdvancedCrawler() *AdvancedCrawler {
    crawler := NewCrawler()

    return &AdvancedCrawler{
        Crawler:       crawler,
        proxyManager:  NewProxyManager(),
        rateLimiter:   NewRateLimiter(time.Minute, 60),
        sessionManager: NewSessionManager(),
    }
}

func NewProxyManager() *ProxyManager {
    return &ProxyManager{
        proxies: []string{
            "http://proxy1:8080",
            "http://proxy2:8080",
            // 更多代理...
        },
    }
}

func (pm *ProxyManager) GetProxy() string {
    pm.mu.Lock()
    defer pm.mu.Unlock()

    if len(pm.proxies) == 0 {
        return ""
    }

    proxy := pm.proxies[pm.current]
    pm.current = (pm.current + 1) % len(pm.proxies)
    return proxy
}

func NewRateLimiter(window time.Duration, limit int) *RateLimiter {
    return &RateLimiter{
        requests: make(map[string]int),
        window:   window,
        limit:    limit,
    }
}

func (rl *RateLimiter) Allow(key string) bool {
    rl.mu.Lock()
    defer rl.mu.Unlock()

    now := time.Now()

    // 清理过期的记录
    for k, v := range rl.requests {
        if now.Sub(v) > rl.window {
            delete(rl.requests, k)
        }
    }

    // 检查限制
    if rl.requests[key] >= rl.limit {
        return false
    }

    rl.requests[key]++
    return true
}

func NewSessionManager() *SessionManager {
    return &SessionManager{
        sessions: make(map[string]*colly.Collector),
    }
}

func (sm *SessionManager) GetSession(sessionID string, crawler *colly.Collector) *colly.Collector {
    if collector, exists := sm.sessions[sessionID]; exists {
        return collector
    }

    sm.sessions[sessionID] = crawler
    return crawler
}

// 使用示例
func main() {
    crawler := NewAdvancedCrawler()

    // 启动爬虫
    startURL := "https://example.com"
    if err := crawler.Start(startURL); err != nil {
        log.Fatal(err)
    }

    // 等待完成
    time.Sleep(10 * time.Second)

    // 获取结果
    results := crawler.GetResults()
    for _, result := range results {
        fmt.Printf("URL: %s\n", result.URL)
        fmt.Printf("Title: %s\n", result.Title)
        fmt.Printf("Links: %d\n", len(result.Links))
        fmt.Printf("Images: %d\n", len(result.Images))
        fmt.Println("---")
    }
}
```

### 8.4.2 反爬虫应对策略

```go
// 反爬虫检测和应对
type AntiCrawler struct {
    userAgents    []string
    delays        []time.Duration
    currentDelay  int
    headers       map[string]string
    cookies       map[string]string
}

func NewAntiCrawler() *AntiCrawler {
    return &AntiCrawler{
        userAgents: []string{
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0",
        },
        delays: []time.Duration{
            1 * time.Second,
            2 * time.Second,
            3 * time.Second,
            5 * time.Second,
        },
        headers: map[string]string{
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        },
        cookies: make(map[string]string),
    }
}

func (ac *AntiCrawler) SetupCrawler(c *colly.Collector) {
    // 设置随机User-Agent
    c.OnRequest(func(r *colly.Request) {
        userAgent := ac.userAgents[rand.Intn(len(ac.userAgents))]
        r.Headers.Set("User-Agent", userAgent)

        // 设置随机延迟
        delay := ac.delays[rand.Intn(len(ac.delays))]
        time.Sleep(delay)

        // 设置头部
        for key, value := range ac.headers {
            r.Headers.Set(key, value)
        }

        // 设置Cookie
        for key, value := range ac.cookies {
            r.Headers.Set("Cookie", fmt.Sprintf("%s=%s", key, value))
        }
    })
}

// Java反爬虫示例
import java.io.*;
import java.net.*;
import java.util.*;

public class JavaCrawler {
    private List<String> userAgents = Arrays.asList(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    );

    private Random random = new Random();

    public String fetch(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();

        // 设置请求头
        conn.setRequestProperty("User-Agent", getRandomUserAgent());
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml");
        conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9");

        // 设置超时
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);

        // 随机延迟
        Thread.sleep(random.nextInt(3000) + 1000);

        // 读取响应
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream()))) {
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line).append("\n");
            }
            return content.toString();
        }
    }

    private String getRandomUserAgent() {
        return userAgents.get(random.nextInt(userAgents.size()));
    }
}
```

## 8.5 实时通信技术

### 8.5.1 WebSocket服务器实现

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"
    "sync"
    "time"

    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true // 生产环境中应该设置适当的CORS策略
    },
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
}

type Client struct {
    ID       string          `json:"id"`
    Conn     *websocket.Conn `json:"-"`
    Send     chan []byte     `json:"-"`
    Room     string          `json:"room"`
    Username string          `json:"username"`
}

type Message struct {
    Type      string    `json:"type"`
    Room      string    `json:"room"`
    Username  string    `json:"username"`
    Content   string    `json:"content"`
    Timestamp time.Time `json:"timestamp"`
    ID        string    `json:"id"`
}

type Hub struct {
    clients    map[string]*Client
    clientLock sync.RWMutex
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
}

func NewHub() *Hub {
    return &Hub{
        clients:    make(map[string]*Client),
        broadcast:  make(chan []byte),
        register:   make(chan *Client),
        unregister: make(chan *Client),
    }
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.clientLock.Lock()
            h.clients[client.ID] = client
            h.clientLock.Unlock()

            // 通知其他客户端
            h.broadcast <- []byte(fmt.Sprintf(`{"type":"join","user":"%s","room":"%s"}`,
                client.Username, client.Room))

        case client := <-h.unregister:
            h.clientLock.Lock()
            delete(h.clients, client.ID)
            h.clientLock.Unlock()

            close(client.Send)

            // 通知其他客户端
            h.broadcast <- []byte(fmt.Sprintf(`{"type":"leave","user":"%s","room":"%s"}`,
                client.Username, client.Room))

        case message := <-h.broadcast:
            h.clientLock.RLock()
            for _, client := range h.clients {
                select {
                case client.Send <- message:
                default:
                    close(client.Send)
                    delete(h.clients, client.ID)
                }
            }
            h.clientLock.RUnlock()
        }
    }
}

func (h *Hub) GetClientsInRoom(room string) []*Client {
    h.clientLock.RLock()
    defer h.clientLock.RUnlock()

    var roomClients []*Client
    for _, client := range h.clients {
        if client.Room == room {
            roomClients = append(roomClients, client)
        }
    }
    return roomClients
}

type Server struct {
    hub     *Hub
    clients map[string]*Client
    mu      sync.RWMutex
}

func NewServer() *Server {
    hub := NewHub()
    go hub.Run()

    return &Server{
        hub:     hub,
        clients: make(map[string]*Client),
    }
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("Upgrade error:", err)
        return
    }

    defer conn.Close()

    // 读取客户端初始化消息
    var initMsg Message
    if err := conn.ReadJSON(&initMsg); err != nil {
        log.Println("Read error:", err)
        return
    }

    // 创建客户端
    client := &Client{
        ID:       generateID(),
        Conn:     conn,
        Send:     make(chan []byte, 256),
        Room:     initMsg.Room,
        Username: initMsg.Username,
    }

    s.registerClient(client)
    s.hub.register <- client

    // 启动goroutine处理发送
    go s.writePump(client)

    // 处理接收
    s.readPump(client)
}

func (s *Server) readPump(client *Client) {
    defer func() {
        s.unregisterClient(client)
        s.hub.unregister <- client
    }()

    client.Conn.SetReadLimit(512)
    client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))

    for {
        var message Message
        if err := client.Conn.ReadJSON(&message); err != nil {
            log.Println("Read error:", err)
            return
        }

        message.ID = generateID()
        message.Timestamp = time.Now()

        // 广播消息到同一房间的所有客户端
        roomClients := s.hub.GetClientsInRoom(client.Room)
        for _, roomClient := range roomClients {
            if roomClient.ID != client.ID {
                data, _ := json.Marshal(message)
                roomClient.Send <- data
            }
        }
    }
}

func (s *Server) writePump(client *Client) {
    ticker := time.NewTicker(54 * time.Second)
    defer func() {
        ticker.Stop()
        client.Conn.Close()
    }()

    for {
        select {
        case message, ok := <-client.Send:
            client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
            if !ok {
                client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
                return
            }

            if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
                log.Println("Write error:", err)
                return
            }

        case <-ticker.C:
            client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
            if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }
        }
    }
}

func (s *Server) registerClient(client *Client) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.clients[client.ID] = client
}

func (s *Server) unregisterClient(client *Client) {
    s.mu.Lock()
    defer s.mu.Unlock()
    delete(s.clients, client.ID)
}

func generateID() string {
    return fmt.Sprintf("%d", time.Now().UnixNano())
}

// HTTP API端点
func (s *Server) getRooms(w http.ResponseWriter, r *http.Request) {
    rooms := make(map[string]int)
    s.mu.RLock()
    for _, client := range s.clients {
        rooms[client.Room]++
    }
    s.mu.RUnlock()

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(rooms)
}

func (s *Server) getRoomClients(w http.ResponseWriter, r *http.Request) {
    room := r.URL.Query().Get("room")
    if room == "" {
        http.Error(w, "Room parameter required", http.StatusBadRequest)
        return
    }

    clients := s.hub.GetClientsInRoom(room)
    clientList := make([]map[string]string, 0, len(clients))

    for _, client := range clients {
        clientList = append(clientList, map[string]string{
            "id":       client.ID,
            "username": client.Username,
        })
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(clientList)
}

func main() {
    server := NewServer()

    // WebSocket端点
    http.HandleFunc("/ws", server.handleWebSocket)

    // HTTP API端点
    http.HandleFunc("/api/rooms", server.getRooms)
    http.HandleFunc("/api/room-clients", server.getRoomClients)

    // 静态文件服务
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        http.ServeFile(w, r, "static/index.html")
    })

    log.Println("WebSocket server starting on :8080")
    if err := http.ListenAndServe(":8080", nil); err != nil {
        log.Fatal(err)
    }
}
```

### 8.5.2 Server-Sent Events实现

```go
package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "sync"
    "time"
)

type SSEClient struct {
    ID        string            `json:"id"`
    Conn      http.ResponseWriter `json:"-"`
    Done      chan bool         `json:"-"`
    Username  string            `json:"username"`
    LastPing  time.Time         `json:"-"`
}

type SSEManager struct {
    clients map[string]*SSEClient
    mu     sync.RWMutex
    nextID int64
}

func NewSSEManager() *SSEManager {
    return &SSEManager{
        clients: make(map[string]*SSEClient),
    }
}

func (m *SSEManager) AddClient(w http.ResponseWriter, r *http.Request, username string) string {
    m.mu.Lock()
    defer m.mu.Unlock()

    clientID := fmt.Sprintf("client_%d", m.nextID)
    m.nextID++

    client := &SSEClient{
        ID:       clientID,
        Conn:     w,
        Done:     make(chan bool),
        Username: username,
        LastPing: time.Now(),
    }

    m.clients[clientID] = client

    // 设置响应头
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    w.Header().Set("Access-Control-Allow-Origin", "*")

    // 发送连接成功消息
    m.sendEvent(client, "connected", map[string]interface{}{
        "id":       clientID,
        "username": username,
        "timestamp": time.Now().Unix(),
    })

    // 启动ping goroutine
    go m.pingClient(client)

    return clientID
}

func (m *SSEManager) RemoveClient(clientID string) {
    m.mu.Lock()
    defer m.mu.Unlock()

    if client, exists := m.clients[clientID]; exists {
        close(client.Done)
        delete(m.clients, clientID)

        // 发送断开连接消息给其他客户端
        m.broadcastEvent("user_disconnected", map[string]interface{}{
            "id":       clientID,
            "username": client.Username,
            "timestamp": time.Now().Unix(),
        })
    }
}

func (m *SSEManager) sendEvent(client *SSEClient, eventType string, data interface{}) {
    // 格式化为SSE格式
    message := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, m.marshal(data))

    // 写入响应
    if _, err := client.Conn.Write([]byte(message)); err != nil {
        log.Printf("Failed to write to client %s: %v", client.ID, err)
        client.Done <- true
    }

    client.LastPing = time.Now()
}

func (m *SSEManager) broadcastEvent(eventType string, data interface{}) {
    m.mu.RLock()
    clients := make([]*SSEClient, 0, len(m.clients))
    for _, client := range m.clients {
        clients = append(clients, client)
    }
    m.mu.RUnlock()

    for _, client := range clients {
        m.sendEvent(client, eventType, data)
    }
}

func (m *SSEManager) pingClient(client *SSEClient) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            m.sendEvent(client, "ping", map[string]interface{}{
                "timestamp": time.Now().Unix(),
            })

            // 检查是否超时
            if time.Since(client.LastPing) > 2*time.Minute {
                log.Printf("Client %s timed out", client.ID)
                client.Done <- true
                return
            }

        case <-client.Done:
            return
        }
    }
}

func (m *SSEManager) marshal(data interface{}) string {
    jsonBytes, err := json.Marshal(data)
    if err != nil {
        return fmt.Sprintf(`{"error":"%v"}`, err)
    }
    return string(jsonBytes)
}

// HTTP处理器
func (m *SSEManager) SSEHandler(w http.ResponseWriter, r *http.Request) {
    username := r.URL.Query().Get("username")
    if username == "" {
        username = "Anonymous"
    }

    clientID := m.AddClient(w, r, username)

    // 保持连接
    for {
        select {
        case <-r.Context().Done():
            m.RemoveClient(clientID)
            return
        case <-time.After(5 * time.Minute):
            m.RemoveClient(clientID)
            return
        }
    }
}

func (m *SSEManager) SendMessageHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var message struct {
        Type      string      `json:"type"`
        Content   string      `json:"content"`
        Username  string      `json:"username"`
        Timestamp int64       `json:"timestamp"`
    }

    if err := json.NewDecoder(r.Body).Decode(&message); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    message.Timestamp = time.Now().Unix()

    // 广播消息给所有客户端
    m.broadcastEvent("message", message)

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "sent"})
}

func main() {
    manager := NewSSEManager()

    // SSE端点
    http.HandleFunc("/events", manager.SSEHandler)

    // 消息发送端点
    http.HandleFunc("/send", manager.SendMessageHandler)

    // 静态文件服务
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/" {
            http.ServeFile(w, r, "static/sse.html")
        }
    })

    log.Println("SSE server starting on :8081")
    if err := http.ListenAndServe(":8081", nil); err != nil {
        log.Fatal(err)
    }
}
```

## 8.6 总结

### 8.6.1 最佳实践

1. **I/O模型选择**
   - 高并发：使用非阻塞I/O + 多路复用
   - CPU密集型：线程池模式
   - Go语言：优先使用goroutine + channel

2. **HTTP客户端最佳实践**
   - 设置合理的超时时间
   - 实现重试机制
   - 使用连接池
   - 处理HTTP状态码和错误

3. **HTTP服务器最佳实践**
   - 使用成熟的框架（Gin、Spring Boot、Flask等）
   - 实现中间件机制
   - 添加监控和指标
   - 处理CORS和安全头部

4. **爬虫最佳实践**
   - 遵守robots.txt
   - 设置合理的延迟
   - 处理反爬虫机制
   - 使用代理和User-Agent轮换

5. **实时通信最佳实践**
   - WebSocket：心跳检测、断线重连
   - SSE：定期ping、错误处理
   - 消息队列：消息持久化、负载均衡

### 8.6.2 性能优化

1. **连接池配置**

```go
// Go HTTP连接池优化
transport := &http.Transport{
    MaxIdleConns:        100,              // 最大空闲连接数
    MaxIdleConnsPerHost: 10,               // 每个主机的最大空闲连接数
    IdleConnTimeout:     90 * time.Second, // 空闲连接超时
    DisableCompression:   false,
    TLSClientConfig: &tls.Config{
        InsecureSkipVerify: true,
    },
}
```

2. **内存优化**

```go
// 对象池减少GC压力
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 0, 4096)
    },
}

func getBuffer() []byte {
    return bufferPool.Get().([]byte)
}

func putBuffer(buf []byte) {
    buf = buf[:0] // 重置切片
    bufferPool.Put(buf)
}
```

### 8.6.3 监控和调试

1. **Prometheus指标**

```go
// HTTP请求指标
var httpDuration = prometheus.NewHistogramVec(
    prometheus.HistogramOpts{
        Name:    "http_request_duration_seconds",
        Help:    "Duration of HTTP requests.",
        Buckets: prometheus.DefBuckets,
    },
    []string{"method", "endpoint", "status"},
)

var httpRequestsTotal = prometheus.NewCounterVec(
    prometheus.CounterOpts{
        Name: "http_requests_total",
        Help: "Total number of HTTP requests.",
    },
    []string{"method", "endpoint", "status"},
)
```

2. **结构化日志**

```go
// 结构化日志配置
logger := log.New(
    os.Stdout,
    "APP: ",
    log.LstdFlags|log.Lmicroseconds|log.Lshortfile,
)

logger.Info("Server started",
    log.String("host", "localhost"),
    log.Int("port", 8080),
    log.String("version", "1.0.0"),
)
```

### 8.6.4 学习资源

1. **官方文档**
   - Go: https://golang.org/doc/
   - Java: https://docs.oracle.com/javase/tutorial/networking/
   - Python: https://docs.python.org/3/library/internet.html
   - Node.js: https://nodejs.org/api/

2. **开源项目**
   - Go: Gin, Echo, Fiber
   - Java: Spring Boot, Quarkus
   - Python: Flask, FastAPI
   - Node.js: Express, Fastify

3. **书籍推荐**
   - 《Go语言实战》
   - 《Java网络编程》
   - 《Python网络编程》
   - 《Node.js设计模式》

网络编程是一个持续发展的领域，需要不断学习新技术和最佳实践。希望本章的内容能够帮助读者建立扎实的网络编程基础，并在实际项目中应用这些知识。
