# 第九章：网络性能优化策略

## 摘要

网络性能优化是现代应用系统成功的关键因素。本章将从性能指标分析开始，深入讲解HTTP优化技术、CDN部署、负载均衡策略，以及基础设施调优方法。我们将提供大量Go语言实战代码，帮助读者掌握从基础指标到高级优化的完整技术体系。

**关键词**：性能优化、HTTP、CDN、负载均衡、监控调优

---

## 9.1 网络性能指标分析

### 9.1.1 核心性能指标

网络性能主要通过以下三个核心指标来衡量：

#### 延迟（Latency）

延迟是指数据包从源点到目标点所需的时间，是用户体验的关键指标。

```go
// Go语言延迟测试工具
package main

import (
    "fmt"
    "log"
    "net/http"
    "sync"
    "time"
)

type LatencyTester struct {
    client    *http.Client
    results   []time.Duration
    mu       sync.Mutex
}

func NewLatencyTester() *LatencyTester {
    return &LatencyTester{
        client: &http.Client{
            Timeout: 30 * time.Second,
            Transport: &http.Transport{
                DisableCompression: false,
                MaxIdleConns:      100,
            },
        },
        results: make([]time.Duration, 0),
    }
}

// 测试单次请求延迟
func (lt *LatencyTester) TestLatency(url string) (time.Duration, error) {
    start := time.Now()

    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return 0, err
    }

    resp, err := lt.client.Do(req)
    if err != nil {
        return 0, err
    }
    resp.Body.Close()

    latency := time.Since(start)
    return latency, nil
}

// 批量延迟测试
func (lt *LatencyTester) BatchTest(url string, count int) []time.Duration {
    var wg sync.WaitGroup
    results := make([]time.Duration, count)

    for i := 0; i < count; i++ {
        wg.Add(1)
        go func(index int) {
            defer wg.Done()

            latency, err := lt.TestLatency(url)
            if err != nil {
                log.Printf("Request %d failed: %v", index, err)
                results[index] = 0
            } else {
                results[index] = latency
            }
        }(i)
    }

    wg.Wait()

    lt.mu.Lock()
    defer lt.mu.Unlock()
    lt.results = append(lt.results, results...)

    return results
}

// 延迟统计分析
func (lt *LatencyTester) AnalyzeLatency(latencies []time.Duration) map[string]time.Duration {
    var min, max time.Duration
    var sum time.Duration

    validLatencies := make([]time.Duration, 0)

    for _, latency := range latencies {
        if latency > 0 { // 过滤失败请求
            validLatencies = append(validLatencies, latency)
        }
    }

    if len(validLatencies) == 0 {
        return nil
    }

    min = validLatencies[0]
    max = validLatencies[0]

    for _, latency := range validLatencies {
        if latency < min {
            min = latency
        }
        if latency > max {
            max = latency
        }
        sum += latency
    }

    avg := sum / time.Duration(len(validLatencies))

    // 计算P95和P99
    sorted := sortDurations(validLatencies)
    p95Index := int(float64(len(sorted)) * 0.95)
    p99Index := int(float64(len(sorted)) * 0.99)

    return map[string]time.Duration{
        "min":  min,
        "max":  max,
        "avg":  avg,
        "p95":  sorted[p95Index],
        "p99":  sorted[p99Index],
        "count": time.Duration(len(validLatencies)),
    }
}

func sortDurations(durations []time.Duration) []time.Duration {
    sorted := make([]time.Duration, len(durations))
    copy(sorted, durations)

    for i := 0; i < len(sorted)-1; i++ {
        for j := i + 1; j < len(sorted); j++ {
            if sorted[i] > sorted[j] {
                sorted[i], sorted[j] = sorted[j], sorted[i]
            }
        }
    }

    return sorted
}

// 使用示例
func main() {
    tester := NewLatencyTester()

    // 测试目标URL
    url := "https://httpbin.org/delay/1"

    // 执行100次延迟测试
    results := tester.BatchTest(url, 100)

    // 分析结果
    analysis := tester.AnalyzeLatency(results)

    fmt.Println("=== 延迟测试结果 ===")
    fmt.Printf("最小延迟: %v\n", analysis["min"])
    fmt.Printf("最大延迟: %v\n", analysis["max"])
    fmt.Printf("平均延迟: %v\n", analysis["avg"])
    fmt.Printf("P95延迟: %v\n", analysis["p95"])
    fmt.Printf("P99延迟: %v\n", analysis["p99"])
    fmt.Printf("成功请求: %d\n", analysis["count"])
}
```

#### 带宽（Bandwidth）

带宽是指单位时间内网络传输的数据量，通常以bps（bits per second）为单位。

```go
// Go语言带宽测试工具
package main

import (
    "bytes"
    "fmt"
    "io"
    "log"
    "net/http"
    "time"
)

type BandwidthTester struct {
    client *http.Client
}

func NewBandwidthTester() *BandwidthTester {
    return &BandwidthTester{
        client: &http.Client{
            Timeout: 60 * time.Second,
        },
    }
}

// 下载测试带宽
func (bt *BandwidthTester) TestDownload(url string, sizeMB int) (float64, error) {
    // 构建指定大小的请求
    requestData := bytes.Repeat([]byte("A"), sizeMB*1024*1024)
    req, err := http.NewRequest("POST", url, bytes.NewReader(requestData))
    if err != nil {
        return 0, err
    }

    req.Header.Set("Content-Type", "application/octet-stream")

    start := time.Now()
    resp, err := bt.client.Do(req)
    if err != nil {
        return 0, err
    }
    defer resp.Body.Close()

    // 读取响应数据以确保请求完成
    _, err = io.Copy(io.Discard, resp.Body)
    if err != nil {
        return 0, err
    }

    elapsed := time.Since(start).Seconds()

    // 计算带宽 (Mbps)
    totalBits := float64(sizeMB) * 1024 * 1024 * 8
    bandwidthMbps := totalBits / (elapsed * 1024 * 1024)

    return bandwidthMbps, nil
}

// 上传测试带宽
func (bt *BandwidthTester) TestUpload(url string, sizeMB int) (float64, error) {
    testData := bytes.Repeat([]byte("B"), sizeMB*1024*1024)

    start := time.Now()
    req, err := http.NewRequest("POST", url, bytes.NewReader(testData))
    if err != nil {
        return 0, err
    }

    req.Header.Set("Content-Type", "application/octet-stream")

    resp, err := bt.client.Do(req)
    if err != nil {
        return 0, err
    }
    defer resp.Body.Close()

    elapsed := time.Since(start).Seconds()

    // 计算带宽 (Mbps)
    totalBits := float64(sizeMB) * 1024 * 1024 * 8
    bandwidthMbps := totalBits / (elapsed * 1024 * 1024)

    return bandwidthMbps, nil
}

// 基准测试
func (bt *BandwidthTester) Benchmark(url string, testSize int) (float64, float64, float64) {
    downloadMbps, _ := bt.TestDownload(url, testSize)

    uploadMbps, _ := bt.TestUpload(url, testSize)

    // 计算往返时间作为延迟指标
    start := time.Now()
    _, err := bt.client.Get(url)
    rtt := time.Since(start)

    if err != nil {
        log.Printf("RTT测试失败: %v", err)
        rtt = 0
    }

    return downloadMbps, uploadMbps, rtt.Seconds()
}

// 使用示例
func main() {
    tester := NewBandwidthTester()

    url := "https://httpbin.org/post"

    fmt.Println("开始带宽基准测试...")
    downloadMbps, uploadMbps, rtt := tester.Benchmark(url, 10)

    fmt.Printf("=== 带宽测试结果 ===\n")
    fmt.Printf("下载带宽: %.2f Mbps\n", downloadMbps)
    fmt.Printf("上传带宽: %.2f Mbps\n", uploadMbps)
    fmt.Printf("往返延迟: %.3f 秒\n", rtt)
}
```

#### 吞吐量（Throughput）

吞吐量是指单位时间内成功传输的数据量或完成的请求数量。

```go
// Go语言吞吐量测试工具
package main

import (
    "fmt"
    "log"
    "net/http"
    "sync"
    "time"
)

type ThroughputTester struct {
    client    *http.Client
    results   []RequestResult
    mu       sync.Mutex
}

type RequestResult struct {
    URL         string        `json:"url"`
    StatusCode  int           `json:"status_code"`
    Duration    time.Duration `json:"duration"`
    Bytes       int64         `json:"bytes"`
    Success     bool          `json:"success"`
    Timestamp   time.Time     `json:"timestamp"`
}

func NewThroughputTester() *ThroughputTester {
    return &ThroughputTester{
        client: &http.Client{
            Timeout: 30 * time.Second,
            Transport: &http.Transport{
                MaxIdleConns:        100,
                MaxIdleConnsPerHost: 10,
                DisableCompression:   false,
            },
        },
        results: make([]RequestResult, 0),
    }
}

// 并发请求测试
func (tt *ThroughputTester) ConcurrentTest(url string, concurrent int, duration time.Duration) {
    var wg sync.WaitGroup
    start := time.Now()
    endTime := start.Add(duration)

    for i := 0; i < concurrent; i++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()

            for {
                if time.Now().After(endTime) {
                    break
                }

                result := tt.singleRequest(url)

                tt.mu.Lock()
                tt.results = append(tt.results, result)
                tt.mu.Unlock()

                // 短暂休息避免过于频繁的请求
                time.Sleep(10 * time.Millisecond)
            }
        }(i)
    }

    wg.Wait()
}

// 单次请求测试
func (tt *ThroughputTester) singleRequest(url string) RequestResult {
    start := time.Now()

    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return RequestResult{
            URL:         url,
            Success:     false,
            Timestamp:   start,
            Duration:    time.Since(start),
        }
    }

    resp, err := tt.client.Do(req)
    if err != nil {
        return RequestResult{
            URL:         url,
            Success:     false,
            Timestamp:   start,
            Duration:    time.Since(start),
        }
    }
    defer resp.Body.Close()

    // 读取响应体以获取实际数据量
    bytes, _ := io.Copy(io.Discard, resp.Body)

    return RequestResult{
        URL:         url,
        StatusCode:  resp.StatusCode,
        Duration:    time.Since(start),
        Bytes:       bytes,
        Success:     resp.StatusCode >= 200 && resp.StatusCode < 300,
        Timestamp:   start,
    }
}

// 吞吐量分析
func (tt *ThroughputTester) AnalyzeResults() map[string]interface{} {
    if len(tt.results) == 0 {
        return nil
    }

    var totalRequests int
    var successfulRequests int
    var totalBytes int64
    var totalDuration time.Duration

    var responseTimes []time.Duration
    var throughput []float64

    for _, result := range tt.results {
        totalRequests++
        if result.Success {
            successfulRequests++
        }
        totalBytes += result.Bytes
        responseTimes = append(responseTimes, result.Duration)
    }

    // 计算吞吐量
    firstRequest := tt.results[0].Timestamp
    lastRequest := tt.results[len(tt.results)-1].Timestamp
    testDuration := lastRequest.Sub(firstRequest)

    if testDuration > 0 {
        throughput = append(throughput, float64(totalRequests)/testDuration.Seconds())
    }

    // 计算平均响应时间
    var totalResponseTime time.Duration
    for _, duration := range responseTimes {
        totalResponseTime += duration
    }
    avgResponseTime := totalResponseTime / time.Duration(len(responseTimes))

    // 计算P95响应时间
    sorted := sortDurations(responseTimes)
    p95Index := int(float64(len(sorted)) * 0.95)
    p95ResponseTime := sorted[p95Index]

    return map[string]interface{}{
        "total_requests":      totalRequests,
        "successful_requests": successfulRequests,
        "success_rate":       float64(successfulRequests) / float64(totalRequests) * 100,
        "total_bytes":        totalBytes,
        "avg_response_time":  avgResponseTime,
        "p95_response_time":  p95ResponseTime,
        "requests_per_second": float64(totalRequests) / testDuration.Seconds(),
        "bytes_per_second":   float64(totalBytes) / testDuration.Seconds(),
    }
}

// 使用示例
func main() {
    tester := NewThroughputTester()

    url := "https://httpbin.org/json"

    fmt.Println("开始吞吐量测试...")
    fmt.Println("测试参数: 并发10, 持续30秒")

    // 执行并发测试
    tester.ConcurrentTest(url, 10, 30*time.Second)

    // 分析结果
    analysis := tester.AnalyzeResults()

    fmt.Println("=== 吞吐量测试结果 ===")
    fmt.Printf("总请求数: %d\n", analysis["total_requests"])
    fmt.Printf("成功请求数: %d\n", analysis["successful_requests"])
    fmt.Printf("成功率: %.2f%%\n", analysis["success_rate"])
    fmt.Printf("平均响应时间: %v\n", analysis["avg_response_time"])
    fmt.Printf("P95响应时间: %v\n", analysis["p95_response_time"])
    fmt.Printf("每秒请求数: %.2f\n", analysis["requests_per_second"])
    fmt.Printf("每秒传输字节: %.2f\n", analysis["bytes_per_second"])
}
```

### 9.1.2 性能监控框架

```go
// 性能监控框架
package main

import (
    "fmt"
    "log"
    "net/http"
    "sync"
    "time"
)

type PerformanceMonitor struct {
    metrics map[string]*MetricCollector
    mu     sync.RWMutex
}

type MetricCollector struct {
    Name      string        `json:"name"`
    Values    []float64     `json:"values"`
    Count     int64         `json:"count"`
    Sum       float64       `json:"sum"`
    Min       float64       `json:"min"`
    Max       float64       `json:"max"`
    LastUpdate time.Time    `json:"last_update"`
}

func NewPerformanceMonitor() *PerformanceMonitor {
    return &PerformanceMonitor{
        metrics: make(map[string]*MetricCollector),
    }
}

func (pm *PerformanceMonitor) RecordMetric(name string, value float64) {
    pm.mu.Lock()
    defer pm.mu.Unlock()

    metric, exists := pm.metrics[name]
    if !exists {
        metric = &MetricCollector{
            Name: name,
        }
        pm.metrics[name] = metric
    }

    metric.Values = append(metric.Values, value)
    metric.Count++
    metric.Sum += value

    if metric.Count == 1 {
        metric.Min = value
        metric.Max = value
    } else {
        if value < metric.Min {
            metric.Min = value
        }
        if value > metric.Max {
            metric.Max = value
        }
    }

    metric.LastUpdate = time.Now()

    // 限制历史数据大小
    if len(metric.Values) > 1000 {
        metric.Values = metric.Values[100:]
    }
}

func (pm *PerformanceMonitor) GetMetrics() map[string]*MetricCollector {
    pm.mu.RLock()
    defer pm.mu.RUnlock()

    result := make(map[string]*MetricCollector)
    for name, metric := range pm.metrics {
        result[name] = metric
    }
    return result
}

// HTTP中间件自动收集性能指标
func PerformanceMiddleware(pm *PerformanceMonitor) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()

            // 创建响应包装器
            rw := &responseWriter{ResponseWriter: w, statusCode: 200}

            next.ServeHTTP(rw, r)

            // 记录性能指标
            duration := time.Since(start)
            statusCode := rw.statusCode

            pm.RecordMetric("request_duration_ms", duration.Seconds()*1000)
            pm.RecordMetric(fmt.Sprintf("status_code_%d", statusCode), 1)
            pm.RecordMetric("total_requests", 1)

            if statusCode >= 500 {
                pm.RecordMetric("error_requests", 1)
            } else if statusCode >= 400 {
                pm.RecordMetric("client_error_requests", 1)
            } else {
                pm.RecordMetric("success_requests", 1)
            }
        })
    }
}

type responseWriter struct {
    http.ResponseWriter
    statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
    rw.statusCode = code
    rw.ResponseWriter.WriteHeader(code)
}

// 使用示例
func main() {
    monitor := NewPerformanceMonitor()

    // 创建路由
    mux := http.NewServeMux()
    mux.Handle("/metrics", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        metrics := monitor.GetMetrics()

        for name, metric := range metrics {
            avg := 0.0
            if metric.Count > 0 {
                avg = metric.Sum / float64(metric.Count)
            }

            fmt.Fprintf(w, "%s: count=%d, avg=%.2f, min=%.2f, max=%.2f\n",
                name, metric.Count, avg, metric.Min, metric.Max)
        }
    }))

    // 应用性能中间件
    wrappedMux := PerformanceMiddleware(monitor)(mux)

    log.Println("性能监控服务器启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", wrappedMux))
}
```

## 9.2 HTTP性能优化技术

### 9.2.1 连接复用优化

```go
// HTTP连接池优化
package main

import (
    "crypto/tls"
    "fmt"
    "log"
    "net/http"
    "sync"
    "time"
)

type OptimizedHTTPClient struct {
    client    *http.Client
    pool      *sync.Pool
    transport *http.Transport
}

func NewOptimizedHTTPClient() *OptimizedHTTPClient {
    transport := &http.Transport{
        // 连接池配置
        MaxIdleConns:        100,              // 最大空闲连接数
        MaxIdleConnsPerHost: 10,               // 每个主机的最大空闲连接数
        IdleConnTimeout:      90 * time.Second, // 空闲连接超时时间
        DisableCompression:   false,            // 启用压缩
        TLSClientConfig: &tls.Config{
            InsecureSkipVerify: false,
        },
        // 连接预热
        ForceAttemptHTTP2: true,
    }

    client := &http.Client{
        Transport: transport,
        Timeout:   30 * time.Second,
    }

    return &OptimizedHTTPClient{
        client:    client,
        pool:      &sync.Pool{},
        transport: transport,
    }
}

// 智能重试机制
func (c *OptimizedHTTPClient) SmartRetry(req *http.Request, maxRetries int) (*http.Response, error) {
    var lastErr error

    for attempt := 0; attempt <= maxRetries; attempt++ {
        resp, err := c.client.Do(req)

        if err == nil {
            // 请求成功
            if resp.StatusCode >= 200 && resp.StatusCode < 300 {
                return resp, nil
            }
            // 非2xx状态码，记录但不重试
            return resp, fmt.Errorf("HTTP %d", resp.StatusCode)
        }

        lastErr = err

        // 指数退避策略
        if attempt < maxRetries {
            backoff := time.Duration(1<<uint(attempt)) * time.Second
            time.Sleep(backoff)
        }
    }

    return nil, lastErr
}

// 连接预热
func (c *OptimizedHTTPClient) WarmupConnections(urls []string) error {
    var wg sync.WaitGroup
    errors := make(chan error, len(urls))

    for _, url := range urls {
        wg.Add(1)
        go func(targetURL string) {
            defer wg.Done()

            req, err := http.NewRequest("HEAD", targetURL, nil)
            if err != nil {
                errors <- err
                return
            }

            resp, err := c.client.Do(req)
            if err != nil {
                errors <- err
                return
            }
            resp.Body.Close()

            if resp.StatusCode >= 400 {
                errors <- fmt.Errorf("HTTP %d for %s", resp.StatusCode, targetURL)
            }
        }(url)
    }

    wg.Wait()
    close(errors)

    var firstError error
    for err := range errors {
        if firstError == nil {
            firstError = err
        }
    }

    return firstError
}

// 使用示例
func main() {
    client := NewOptimizedHTTPClient()

    // 连接预热
    urls := []string{
        "https://httpbin.org/get",
        "https://httpbin.org/post",
        "https://httpbin.org/put",
    }

    if err := client.WarmupConnections(urls); err != nil {
        log.Printf("连接预热失败: %v", err)
    } else {
        log.Println("连接预热成功")
    }

    // 执行优化后的请求
    req, _ := http.NewRequest("GET", "https://httpbin.org/get", nil)
    resp, err := client.SmartRetry(req, 3)
    if err != nil {
        log.Printf("请求失败: %v", err)
        return
    }
    defer resp.Body.Close()

    fmt.Printf("响应状态: %s\n", resp.Status)
}
```

### 9.2.2 缓存策略优化

```go
// HTTP缓存系统
package main

import (
    "bytes"
    "crypto/sha1"
    "encoding/hex"
    "fmt"
    "io"
    "net/http"
    "sync"
    "time"
)

type CacheEntry struct {
    Key        string        `json:"key"`
    Content    []byte        `json:"content"`
    Headers    http.Header   `json:"headers"`
    StatusCode int           `json:"status_code"`
    Expires    time.Time     `json:"expires"`
    Created    time.Time     `json:"created"`
    Size       int64         `json:"size"`
    HitCount   int64         `json:"hit_count"`
}

type HTTPCache struct {
    entries map[string]*CacheEntry
    mu     sync.RWMutex
    stats  CacheStats
}

type CacheStats struct {
    Hits   int64 `json:"hits"`
    Misses int64 `json:"misses"`
    Size   int64 `json:"size"`
    Count  int   `json:"count"`
}

func NewHTTPCache() *HTTPCache {
    return &HTTPCache{
        entries: make(map[string]*CacheEntry),
    }
}

// 生成缓存键
func (cache *HTTPCache) generateKey(req *http.Request) string {
    content := fmt.Sprintf("%s %s %s", req.Method, req.URL.String(), req.Header.Get("User-Agent"))
    hash := sha1.Sum([]byte(content))
    return hex.EncodeToString(hash[:])
}

// 设置缓存
func (cache *HTTPCache) Set(req *http.Request, resp *http.Response, ttl time.Duration) {
    key := cache.generateKey(req)

    body, _ := io.ReadAll(resp.Body)

    entry := &CacheEntry{
        Key:        key,
        Content:    body,
        Headers:    make(http.Header),
        StatusCode: resp.StatusCode,
        Expires:    time.Now().Add(ttl),
        Created:    time.Now(),
        Size:       int64(len(body)),
        HitCount:   0,
    }

    // 复制头部
    for k, v := range resp.Header {
        entry.Headers[k] = make([]string, len(v))
        copy(entry.Headers[k], v)
    }

    cache.mu.Lock()
    defer cache.mu.Unlock()

    cache.entries[key] = entry
    cache.stats.Count++
    cache.stats.Size += entry.Size

    // 清理过期条目
    cache.cleanup()
}

// 获取缓存
func (cache *HTTPCache) Get(req *http.Request) (*http.Response, bool) {
    key := cache.generateKey(req)

    cache.mu.RLock()
    entry, exists := cache.entries[key]
    cache.mu.RUnlock()

    if !exists {
        cache.mu.Lock()
        cache.stats.Misses++
        cache.mu.Unlock()
        return nil, false
    }

    // 检查过期
    if time.Now().After(entry.Expires) {
        cache.mu.Lock()
        delete(cache.entries, key)
        cache.stats.Count--
        cache.stats.Size -= entry.Size
        cache.mu.Unlock()
        return nil, false
    }

    // 更新命中统计
    cache.mu.Lock()
    entry.HitCount++
    cache.stats.Hits++
    cache.mu.Unlock()

    // 重建响应
    resp := &http.Response{
        StatusCode: entry.StatusCode,
        Header:     entry.Headers,
        Body:       io.NopCloser(bytes.NewReader(entry.Content)),
    }

    return resp, true
}

// 清理过期条目
func (cache *HTTPCache) cleanup() {
    now := time.Now()

    for key, entry := range cache.entries {
        if now.After(entry.Expires) {
            delete(cache.entries, key)
            cache.stats.Count--
            cache.stats.Size -= entry.Size
        }
    }
}

// 缓存中间件
func (cache *HTTPCache) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 只缓存GET请求
        if r.Method != "GET" {
            next.ServeHTTP(w, r)
            return
        }

        // 检查缓存
        if cachedResp, found := cache.Get(r); found {
            // 设置缓存头部
            for k, v := range cachedResp.Header {
                w.Header()[k] = v
            }
            w.WriteHeader(cachedResp.StatusCode)
            io.Copy(w, cachedResp.Body)
            return
        }

        // 执行请求
        rr := &responseRecorder{ResponseWriter: w, statusCode: 200}
        next.ServeHTTP(rr, r)

        // 缓存响应
        if rr.statusCode >= 200 && rr.statusCode < 300 {
            // 构建响应用于缓存
            resp := &http.Response{
                StatusCode: rr.statusCode,
                Header:     make(http.Header),
                Body:       io.NopCloser(bytes.NewReader(rr.body)),
            }

            // 复制头部
            for k, v := range rr.Header() {
                resp.Header[k] = v
            }

            cache.Set(r, resp, 5*time.Minute)
        }
    })
}

type responseRecorder struct {
    http.ResponseWriter
    statusCode int
    body       []byte
}

func (rr *responseRecorder) WriteHeader(statusCode int) {
    rr.statusCode = statusCode
    rr.ResponseWriter.WriteHeader(statusCode)
}

func (rr *responseRecorder) Write(b []byte) (int, error) {
    rr.body = append(rr.body, b...)
    return rr.ResponseWriter.Write(b)
}

// 使用示例
func main() {
    cache := NewHTTPCache()

    mux := http.NewServeMux()
    mux.Handle("/", cache.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 模拟慢响应
        time.Sleep(100 * time.Millisecond)
        fmt.Fprintf(w, "Hello from server at %s", time.Now().Format("15:04:05"))
    })))

    fmt.Println("缓存服务器启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

### 9.2.3 资源预加载优化

```go
// 资源预加载系统
package main

import (
    "fmt"
    "log"
    "net/http"
    "sync"
    "time"
)

type ResourcePreloader struct {
    preloaded map[string]*PreloadedResource
    mu        sync.RWMutex
    client    *http.Client
}

type PreloadedResource struct {
    URL      string        `json:"url"`
    Content  []byte        `json:"content"`
    Headers  http.Header   `json:"headers"`
    LoadedAt time.Time     `json:"loaded_at"`
    Size     int64         `json:"size"`
}

func NewResourcePreloader() *ResourcePreloader {
    return &ResourcePreloader{
        preloaded: make(map[string]*PreloadedResource),
        client: &http.Client{
            Timeout: 10 * time.Second,
        },
    }
}

// 预加载资源
func (rp *ResourcePreloader) Preload(urls []string) error {
    var wg sync.WaitGroup
    errors := make(chan error, len(urls))

    for _, url := range urls {
        wg.Add(1)
        go func(targetURL string) {
            defer wg.Done()

            content, headers, err := rp.fetchResource(targetURL)
            if err != nil {
                errors <- fmt.Errorf("预加载 %s 失败: %v", targetURL, err)
                return
            }

            rp.mu.Lock()
            rp.preloaded[targetURL] = &PreloadedResource{
                URL:      targetURL,
                Content:  content,
                Headers:  headers,
                LoadedAt: time.Now(),
                Size:     int64(len(content)),
            }
            rp.mu.Unlock()

            log.Printf("资源预加载完成: %s (大小: %d bytes)", targetURL, len(content))
        }(url)
    }

    wg.Wait()
    close(errors)

    var firstError error
    for err := range errors {
        if firstError == nil {
            firstError = err
        }
        log.Printf("预加载错误: %v", err)
    }

    return firstError
}

// 获取预加载资源
func (rp *ResourcePreloader) GetPreloaded(url string) ([]byte, http.Header, bool) {
    rp.mu.RLock()
    defer rp.mu.RUnlock()

    resource, exists := rp.preloaded[url]
    if !exists {
        return nil, nil, false
    }

    return resource.Content, resource.Headers, true
}

// 检查预加载状态
func (rp *ResourcePreloader) GetStatus() map[string]interface{} {
    rp.mu.RLock()
    defer rp.mu.RUnlock()

    status := make(map[string]interface{})
    status["preloaded_count"] = len(rp.preloaded)
    status["total_size"] = int64(0)
    status["resources"] = make([]map[string]interface{}, 0)

    for url, resource := range rp.preloaded {
        status["total_size"] += resource.Size

        resourceInfo := map[string]interface{}{
            "url":       url,
            "size":      resource.Size,
            "loaded_at": resource.LoadedAt,
            "age":       time.Since(resource.LoadedAt).String(),
        }

        status["resources"] = append(status["resources"].([]map[string]interface{}), resourceInfo)
    }

    return status
}

// 内部方法：获取资源
func (rp *ResourcePreloader) fetchResource(url string) ([]byte, http.Header, error) {
    resp, err := rp.client.Get(url)
    if err != nil {
        return nil, nil, err
    }
    defer resp.Body.Close()

    content, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, nil, err
    }

    headers := make(http.Header)
    for k, v := range resp.Header {
        headers[k] = make([]string, len(v))
        copy(headers[k], v)
    }

    return content, headers, nil
}

// 资源预加载中间件
func (rp *ResourcePreloader) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 检查是否是预加载的静态资源请求
        if content, headers, found := rp.GetPreloaded(r.URL.Path); found {
            // 设置预加载的头部
            for k, v := range headers {
                w.Header()[k] = v
            }
            w.Header().Set("X-Preloaded", "true")
            w.WriteHeader(http.StatusOK)
            w.Write(content)
            return
        }

        // 继续处理正常请求
        next.ServeHTTP(w, r)
    })
}

// 自动预加载调度器
func (rp *ResourcePreloader) StartScheduler(interval time.Duration, urls []string) {
    go func() {
        ticker := time.NewTicker(interval)
        defer ticker.Stop()

        for {
            select {
            case <-ticker.C:
                log.Println("开始定时预加载...")
                if err := rp.Preload(urls); err != nil {
                    log.Printf("定时预加载失败: %v", err)
                } else {
                    log.Println("定时预加载完成")
                }
            }
        }
    }()
}

// 使用示例
func main() {
    preloader := NewResourcePreloader()

    // 定义需要预加载的资源
    resources := []string{
        "/static/js/app.js",
        "/static/css/main.css",
        "/api/config",
        "/api/user-info",
    }

    // 立即预加载
    if err := preloader.Preload(resources); err != nil {
        log.Printf("初始预加载失败: %v", err)
    } else {
        log.Println("初始预加载完成")
    }

    // 启动定时预加载
    preloader.StartScheduler(30*time.Minute, resources)

    // 创建服务器
    mux := http.NewServeMux()

    // 预加载中间件
    mux.Handle("/", preloader.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Server is running... Preloaded resources: %d",
            len(preloader.preloaded))
    })))

    // 状态端点
    mux.HandleFunc("/preload-status", func(w http.ResponseWriter, r *http.Request) {
        status := preloader.GetStatus()
        fmt.Fprintf(w, "Preload Status: %+v", status)
    })

    log.Println("资源预加载服务器启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

## 9.3 CDN技术深度解析

### 9.3.1 CDN工作原理

```go
// CDN模拟系统
package main

import (
    "fmt"
    "io"
    "log"
    "net/http"
    "sync"
    "time"
)

type CDNNode struct {
    ID       string                 `json:"id"`
    Region   string                 `json:"region"`
    URL      string                 `json:"url"`
    Active   bool                   `json:"active"`
    Latency  time.Duration           `json:"latency"`
    Capacity int64                  `json:"capacity"`
    Stats    CDNStats               `json:"stats"`
}

type CDNStats struct {
    Requests   int64         `json:"requests"`
    Hits       int64         `json:"hits"`
    Misses     int64         `json:"misses"`
    BytesServed int64        `json:"bytes_served"`
    AvgLatency time.Duration `json:"avg_latency"`
}

type CDN struct {
    nodes     map[string]*CDNNode
    originURL string
    mu        sync.RWMutex
    strategy  RoutingStrategy
}

type RoutingStrategy int

const (
    RoundRobin RoutingStrategy = iota
    LeastLatency
    Geographic
    Weighted
)

func NewCDN(originURL string) *CDN {
    cdn := &CDN{
        nodes:     make(map[string]*CDNNode),
        originURL: originURL,
        strategy:  LeastLatency,
    }

    // 初始化CDN节点
    cdn.addNode("us-east-1", "https://cdn-us-east.example.com", "US East")
    cdn.addNode("us-west-1", "https://cdn-us-west.example.com", "US West")
    cdn.addNode("eu-west-1", "https://cdn-eu-west.example.com", "EU West")
    cdn.addNode("ap-southeast-1", "https://cdn-ap-southeast.example.com", "AP Southeast")

    return cdn
}

func (cdn *CDN) addNode(id, url, region string) {
    cdn.mu.Lock()
    defer cdn.mu.Unlock()

    cdn.nodes[id] = &CDNNode{
        ID:      id,
        URL:     url,
        Region:  region,
        Active:  true,
        Stats:   CDNStats{},
        Latency: time.Duration(time.Second),
    }
}

// 智能路由
func (cdn *CDN) RouteRequest(clientIP string) *CDNNode {
    cdn.mu.RLock()
    defer cdn.mu.RUnlock()

    activeNodes := make([]*CDNNode, 0)
    for _, node := range cdn.nodes {
        if node.Active {
            activeNodes = append(activeNodes, node)
        }
    }

    if len(activeNodes) == 0 {
        return nil
    }

    switch cdn.strategy {
    case RoundRobin:
        return cdn.roundRobinRoute(activeNodes)
    case LeastLatency:
        return cdn.leastLatencyRoute(activeNodes)
    case Geographic:
        return cdn.geographicRoute(clientIP, activeNodes)
    default:
        return activeNodes[0]
    }
}

func (cdn *CDN) roundRobinRoute(nodes []*CDNNode) *CDNNode {
    // 简化实现，实际应维护请求计数器
    return nodes[0]
}

func (cdn *CDN) leastLatencyRoute(nodes []*CDNNode) *CDNNode {
    bestNode := nodes[0]
    for _, node := range nodes {
        if node.Latency < bestNode.Latency {
            bestNode = node
        }
    }
    return bestNode
}

func (cdn *CDN) geographicRoute(clientIP string, nodes []*CDNNode) *CDNNode {
    // 简化的地理位置路由
    // 实际实现应使用GeoIP数据库
    if len(clientIP) > 0 {
        // 根据IP地址前缀选择最近节点
        for _, node := range nodes {
            switch node.Region {
            case "US East":
                return node
            case "US West":
                if len(nodes) == 1 {
                    return node
                }
            }
        }
    }
    return nodes[0]
}

// 代理请求到CDN节点
func (cdn *CDN) ProxyRequest(w http.ResponseWriter, r *http.Request, node *CDNNode) {
    start := time.Now()

    // 创建到CDN节点的请求
    proxyReq, err := http.NewRequest(r.Method, node.URL+r.URL.Path, r.Body)
    if err != nil {
        http.Error(w, "Failed to create proxy request", http.StatusInternalServerError)
        return
    }

    // 复制头部
    for k, v := range r.Header {
        proxyReq.Header[k] = v
    }
    proxyReq.Header.Set("X-Forwarded-For", r.RemoteAddr)

    // 执行请求
    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(proxyReq)
    if err != nil {
        // 标记节点为不活跃
        node.Active = false
        log.Printf("CDN节点 %s 不可用: %v", node.ID, err)

        // 尝试其他节点
        if alternative := cdn.findAlternativeNode(node.ID); alternative != nil {
            cdn.ProxyRequest(w, r, alternative)
            return
        }

        // 直接回源
        cdn.proxyToOrigin(w, r)
        return
    }
    defer resp.Body.Close()

    latency := time.Since(start)

    // 更新统计
    node.mu.Lock()
    node.Stats.Requests++
    node.Stats.AvgLatency = (node.Stats.AvgLatency*time.Duration(node.Stats.Requests-1) + latency) / time.Duration(node.Stats.Requests)
    node.mu.Unlock()

    // 转发响应
    for k, v := range resp.Header {
        w.Header()[k] = v
    }
    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)

    log.Printf("请求通过CDN节点 %s 处理，延迟: %v", node.ID, latency)
}

// 寻找替代节点
func (cdn *CDN) findAlternativeNode(excludeID string) *CDNNode {
    cdn.mu.RLock()
    defer cdn.mu.RUnlock()

    for _, node := range cdn.nodes {
        if node.ID != excludeID && node.Active {
            return node
        }
    }
    return nil
}

// 直接回源
func (cdn *CDN) proxyToOrigin(w http.ResponseWriter, r *http.Request) {
    originURL := cdn.originURL + r.URL.Path

    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Get(originURL)
    if err != nil {
        http.Error(w, "Origin server unavailable", http.StatusServiceUnavailable)
        return
    }
    defer resp.Body.Close()

    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)
}

// CDN HTTP处理器
func (cdn *CDN) Handler() http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // 获取客户端IP
        clientIP := r.RemoteAddr

        // 路由到最佳节点
        node := cdn.RouteRequest(clientIP)
        if node == nil {
            // 没有可用节点，直接回源
            cdn.proxyToOrigin(w, r)
            return
        }

        // 代理到CDN节点
        cdn.ProxyRequest(w, r, node)
    }
}

// 监控CDN状态
func (cdn *CDN) GetStatus() map[string]interface{} {
    cdn.mu.RLock()
    defer cdn.mu.RUnlock()

    status := make(map[string]interface{})
    status["total_nodes"] = len(cdn.nodes)
    status["active_nodes"] = 0
    status["strategy"] = cdn.strategy.String()
    status["nodes"] = make([]map[string]interface{}, 0)

    for _, node := range cdn.nodes {
        if node.Active {
            status["active_nodes"] = status["active_nodes"].(int) + 1
        }

        nodeInfo := map[string]interface{}{
            "id":       node.ID,
            "region":   node.Region,
            "url":      node.URL,
            "active":    node.Active,
            "latency":   node.Latency.String(),
            "stats":     node.Stats,
        }

        status["nodes"] = append(status["nodes"].([]map[string]interface{}), nodeInfo)
    }

    return status
}

// 实现String方法
func (rs RoutingStrategy) String() string {
    switch rs {
    case RoundRobin:
        return "Round Robin"
    case LeastLatency:
        return "Least Latency"
    case Geographic:
        return "Geographic"
    default:
        return "Unknown"
    }
}

// 使用示例
func main() {
    cdn := NewCDN("https://origin.example.com")

    // 模拟CDN节点延迟
    go func() {
        for {
            cdn.mu.RLock()
            for _, node := range cdn.nodes {
                // 模拟网络延迟
                node.Latency = time.Duration(50+rand.Intn(200)) * time.Millisecond
            }
            cdn.mu.RUnlock()
            time.Sleep(5 * time.Second)
        }
    }()

    // 创建HTTP服务器
    mux := http.NewServeMux()

    // CDN代理端点
    mux.HandleFunc("/cdn/", func(w http.ResponseWriter, r *http.Request) {
        cdn.Handler()(w, r)
    })

    // CDN状态端点
    mux.HandleFunc("/cdn-status", func(w http.ResponseWriter, r *http.Request) {
        status := cdn.GetStatus()
        fmt.Fprintf(w, "CDN Status: %+v", status)
    })

    log.Println("CDN服务器启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

### 9.3.2 缓存策略设计

```go
// CDN缓存策略
package main

import (
    "crypto/sha1"
    "encoding/hex"
    "fmt"
    "io"
    "log"
    "net/http"
    "strings"
    "time"
)

type CachePolicy struct {
    DefaultTTL     time.Duration
    ContentTypes   map[string]time.Duration
    Paths          map[string]time.Duration
    VaryHeaders    []string
}

type CDNCache struct {
    entries map[string]*CacheEntry
    policy  CachePolicy
    mu      sync.RWMutex
    stats   CacheStats
}

type CacheEntry struct {
    Key         string                 `json:"key"`
    Content     []byte                 `json:"content"`
    Headers     http.Header            `json:"headers"`
    StatusCode  int                    `json:"status_code"`
    Expires     time.Time              `json:"expires"`
    Vary        map[string]string      `json:"vary"`
    Size        int64                  `json:"size"`
    HitCount    int64                  `json:"hit_count"`
    LastAccess  time.Time              `json:"last_access"`
}

type CacheStats struct {
    Hits     int64         `json:"hits"`
    Misses   int64         `json:"misses"`
    Evicted  int64         `json:"evicted"`
    Size     int64         `json:"size"`
    Entries  int           `json:"entries"`
}

func NewCDNCache(policy CachePolicy) *CDNCache {
    return &CDNCache{
        entries: make(map[string]*CacheEntry),
        policy:  policy,
        stats:   CacheStats{},
    }
}

// 生成缓存键（包含Vary头）
func (cache *CDNCache) generateKey(req *http.Request) string {
    var parts []string
    parts = append(parts, req.Method, req.URL.String())

    // 添加Vary头
    for _, header := range cache.policy.VaryHeaders {
        if value := req.Header.Get(header); value != "" {
            parts = append(parts, header+":"+value)
        }
    }

    content := strings.Join(parts, "|")
    hash := sha1.Sum([]byte(content))
    return hex.EncodeToString(hash[:])
}

// 计算TTL
func (cache *CDNCache) calculateTTL(req *http.Request, resp *http.Response) time.Duration {
    // 检查路径特定TTL
    for path, ttl := range cache.policy.Paths {
        if strings.HasPrefix(req.URL.Path, path) {
            return ttl
        }
    }

    // 检查Content-Type特定TTL
    contentType := resp.Header.Get("Content-Type")
    if contentType != "" {
        for ct, ttl := range cache.policy.ContentTypes {
            if strings.Contains(contentType, ct) {
                return ttl
            }
        }
    }

    // 使用默认TTL
    return cache.policy.DefaultTTL
}

// 存储缓存
func (cache *CDNCache) Store(req *http.Request, resp *http.Response) {
    // 跳过不可缓存的响应
    if !cache.isCacheable(req, resp) {
        return
    }

    body, _ := io.ReadAll(resp.Body)

    // 提取Vary头
    vary := make(map[string]string)
    for _, header := range cache.policy.VaryHeaders {
        if value := resp.Header.Get("Vary"); value != "" {
            vary[header] = value
        }
    }

    key := cache.generateKey(req)
    ttl := cache.calculateTTL(req, resp)

    entry := &CacheEntry{
        Key:        key,
        Content:    body,
        Headers:    make(http.Header),
        StatusCode: resp.StatusCode,
        Expires:    time.Now().Add(ttl),
        Vary:       vary,
        Size:       int64(len(body)),
        HitCount:   0,
        LastAccess: time.Now(),
    }

    // 复制头部
    for k, v := range resp.Header {
        entry.Headers[k] = make([]string, len(v))
        copy(entry.Headers[k], v)
    }

    cache.mu.Lock()
    defer cache.mu.Unlock()

    // 清理过期条目
    cache.cleanup()

    // 添加新条目
    cache.entries[key] = entry
    cache.stats.Entries++
    cache.stats.Size += entry.Size
}

// 检查响应是否可缓存
func (cache *CDNCache) isCacheable(req *http.Request, resp *http.Response) bool {
    // 只缓存GET请求
    if req.Method != "GET" {
        return false
    }

    // 检查状态码
    if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotModified {
        return false
    }

    // 检查缓存控制头
    if cc := resp.Header.Get("Cache-Control"); cc != "" {
        if strings.Contains(strings.ToLower(cc), "no-cache") ||
           strings.Contains(strings.ToLower(cc), "no-store") {
            return false
        }
    }

    // 检查私有内容
    if auth := resp.Header.Get("Authorization"); auth != "" {
        return false
    }

    return true
}

// 清理过期和LRU条目
func (cache *CDNCache) cleanup() {
    now := time.Now()
    maxEntries := 10000
    maxSize := int64(100 * 1024 * 1024) // 100MB

    // 删除过期条目
    for key, entry := range cache.entries {
        if now.After(entry.Expires) {
            delete(cache.entries, key)
            cache.stats.Entries--
            cache.stats.Size -= entry.Size
            cache.stats.Evicted++
        }
    }

    // 如果仍然超过限制，删除最旧的条目
    if cache.stats.Entries > maxEntries || cache.stats.Size > maxSize {
        cache.evictLRU(maxEntries/2, cache.stats.Size/2)
    }
}

// LRU淘汰
func (cache *CDNCache) evictLRU(targetEntries int, targetSize int64) {
    type entryWithTime struct {
        key       string
        lastAccess time.Time
    }

    entries := make([]entryWithTime, 0, len(cache.entries))
    for key, entry := range cache.entries {
        entries = append(entries, entryWithTime{key, entry.LastAccess})
    }

    // 按最后访问时间排序
    for i := 0; i < len(entries)-1; i++ {
        for j := i + 1; j < len(entries); j++ {
            if entries[i].lastAccess.After(entries[j].lastAccess) {
                entries[i], entries[j] = entries[j], entries[i]
            }
        }
    }

    // 删除最旧的条目
    evictedCount := 0
    var evictedSize int64

    for _, entry := range entries {
        if cacheEntry, exists := cache.entries[entry.key]; exists {
            delete(cache.entries, entry.key)
            cache.stats.Entries--
            cache.stats.Size -= cacheEntry.Size
            cache.stats.Evicted++
            evictedCount++
            evictedSize += cacheEntry.Size

            if cache.stats.Entries <= targetEntries && cache.stats.Size <= targetSize {
                break
            }
        }
    }

    log.Printf("LRU淘汰完成: 删除 %d 个条目, 释放 %d bytes", evictedCount, evictedSize)
}

// 获取缓存
func (cache *CDNCache) Get(req *http.Request) (*http.Response, bool) {
    key := cache.generateKey(req)

    cache.mu.RLock()
    entry, exists := cache.entries[key]
    cache.mu.RUnlock()

    if !exists {
        cache.mu.Lock()
        cache.stats.Misses++
        cache.mu.Unlock()
        return nil, false
    }

    // 检查过期
    if time.Now().After(entry.Expires) {
        cache.mu.Lock()
        delete(cache.entries, key)
        cache.stats.Entries--
        cache.stats.Size -= entry.Size
        cache.stats.Evicted++
        cache.mu.Unlock()
        return nil, false
    }

    // 更新访问信息
    cache.mu.Lock()
    entry.HitCount++
    entry.LastAccess = time.Now()
    cache.stats.Hits++
    cache.mu.Unlock()

    // 重建响应
    resp := &http.Response{
        StatusCode: entry.StatusCode,
        Header:     entry.Headers,
        Body:       io.NopCloser(bytes.NewReader(entry.Content)),
    }

    return resp, true
}

// 缓存中间件
func (cache *CDNCache) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 检查缓存
        if cachedResp, found := cache.Get(r); found {
            // 设置缓存头部
            for k, v := range cachedResp.Header {
                w.Header()[k] = v
            }
            w.Header().Set("X-Cache", "HIT")
            w.WriteHeader(cachedResp.StatusCode)
            io.Copy(w, cachedResp.Body)
            return
        }

        // 执行请求并缓存
        rw := &responseWriter{ResponseWriter: w, statusCode: 200}
        next.ServeHTTP(rw, r)

        // 构建响应用于缓存
        resp := &http.Response{
            StatusCode: rw.statusCode,
            Header:     make(http.Header),
            Body:       io.NopCloser(bytes.NewReader(rw.body)),
        }

        // 复制头部
        for k, v := range rw.Header() {
            resp.Header[k] = v
        }

        // 缓存响应
        cache.Store(r, resp)

        // 添加缓存头部
        w.Header().Set("X-Cache", "MISS")
    })
}

// 预热缓存
func (cache *CDNCache) Warmup(urls []string) error {
    var wg sync.WaitGroup
    errors := make(chan error, len(urls))

    for _, url := range urls {
        wg.Add(1)
        go func(targetURL string) {
            defer wg.Done()

            req, err := http.NewRequest("GET", targetURL, nil)
            if err != nil {
                errors <- err
                return
            }

            client := &http.Client{Timeout: 10 * time.Second}
            resp, err := client.Do(req)
            if err != nil {
                errors <- err
                return
            }
            defer resp.Body.Close()

            cache.Store(req, resp)
            log.Printf("预热缓存: %s", targetURL)
        }(url)
    }

    wg.Wait()
    close(errors)

    var firstError error
    for err := range errors {
        if firstError == nil {
            firstError = err
        }
    }

    return firstError
}

// 使用示例
func main() {
    // 配置缓存策略
    policy := CachePolicy{
        DefaultTTL: 30 * time.Minute,
        ContentTypes: map[string]time.Duration{
            "text/html":        5 * time.Minute,
            "text/css":         1 * time.Hour,
            "application/javascript": 1 * time.Hour,
            "image/jpeg":       24 * time.Hour,
            "image/png":        24 * time.Hour,
        },
        Paths: map[string]time.Duration{
            "/api/config":   10 * time.Minute,
            "/static/":      1 * time.Hour,
            "/images/":      7 * 24 * time.Hour,
        },
        VaryHeaders: []string{"Accept-Encoding", "Accept-Language"},
    }

    cache := NewCDNCache(policy)

    // 预热重要资源
    importantURLs := []string{
        "/static/css/main.css",
        "/static/js/app.js",
        "/api/config",
    }

    if err := cache.Warmup(importantURLs); err != nil {
        log.Printf("缓存预热失败: %v", err)
    }

    // 创建服务器
    mux := http.NewServeMux()
    mux.Handle("/", cache.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "CDN Cache Demo - Request: %s", r.URL.Path)
    })))

    // 缓存状态端点
    mux.HandleFunc("/cache-status", func(w http.ResponseWriter, r *http.Request) {
        cache.mu.RLock()
        defer cache.mu.RUnlock()

        fmt.Fprintf(w, "Cache Stats: %+v", cache.stats)
    })

    log.Println("CDN缓存服务器启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

## 9.4 负载均衡技术

### 9.4.1 负载均衡算法

```go
// 负载均衡器
package main

import (
    "fmt"
    "log"
    "net/http"
    "sync"
    "sync/atomic"
    "time"
)

type Backend struct {
    ID          string                 `json:"id"`
    URL         string                 `json:"url"`
    Weight      int                    `json:"weight"`
    Active      bool                   `json:"active"`
    Healthy     bool                   `json:"healthy"`
    Stats       BackendStats           `json:"stats"`
    LastCheck   time.Time              `json:"last_check"`
    CheckInterval time.Duration        `json:"check_interval"`
}

type BackendStats struct {
    Requests    int64         `json:"requests"`
    Errors      int64         `json:"errors"`
    AvgLatency  time.Duration `json:"avg_latency"`
    CurrentLoad int64         `json:"current_load"`
}

type LoadBalancer struct {
    backends    []*Backend
    algorithm   LoadBalancingAlgorithm
    healthCheck *HealthChecker
    mu          sync.RWMutex
    rrCounter   int64
}

type LoadBalancingAlgorithm int

const (
    RoundRobin LoadBalancingAlgorithm = iota
    WeightedRoundRobin
    LeastConnections
    LeastResponseTime
    IPHash
)

func NewLoadBalancer() *LoadBalancer {
    lb := &LoadBalancer{
        backends:    make([]*Backend, 0),
        algorithm:   RoundRobin,
        healthCheck: NewHealthChecker(),
    }

    // 添加默认后端
    lb.AddBackend("backend-1", "http://localhost:8081", 1)
    lb.AddBackend("backend-2", "http://localhost:8082", 1)
    lb.AddBackend("backend-3", "http://localhost:8083", 2)

    // 启动健康检查
    lb.healthCheck.Start()

    return lb
}

func (lb *LoadBalancer) AddBackend(id, url string, weight int) {
    lb.mu.Lock()
    defer lb.mu.Unlock()

    backend := &Backend{
        ID:            id,
        URL:           url,
        Weight:        weight,
        Active:        true,
        Healthy:       true,
        Stats:         BackendStats{},
        LastCheck:     time.Now(),
        CheckInterval: 30 * time.Second,
    }

    lb.backends = append(lb.backends, backend)

    // 注册健康检查
    lb.healthCheck.AddBackend(backend)
}

// 选择后端
func (lb *LoadBalancer) SelectBackend(request *http.Request) *Backend {
    lb.mu.RLock()
    defer lb.mu.RUnlock()

    healthyBackends := make([]*Backend, 0)
    for _, backend := range lb.backends {
        if backend.Active && backend.Healthy {
            healthyBackends = append(healthyBackends, backend)
        }
    }

    if len(healthyBackends) == 0 {
        return nil
    }

    switch lb.algorithm {
    case RoundRobin:
        return lb.roundRobin(healthyBackends)
    case WeightedRoundRobin:
        return lb.weightedRoundRobin(healthyBackends)
    case LeastConnections:
        return lb.leastConnections(healthyBackends)
    case LeastResponseTime:
        return lb.leastResponseTime(healthyBackends)
    case IPHash:
        return lb.ipHash(request, healthyBackends)
    default:
        return healthyBackends[0]
    }
}

// 轮询算法
func (lb *LoadBalancer) roundRobin(backends []*Backend) *Backend {
    idx := atomic.AddInt64(&lb.rrCounter, 1) % int64(len(backends))
    return backends[idx]
}

// 加权轮询算法
func (lb *LoadBalancer) weightedRoundRobin(backends []*Backend) *Backend {
    var totalWeight int
    for _, backend := range backends {
        totalWeight += backend.Weight
    }

    current := atomic.AddInt64(&lb.rrCounter, 1) % int64(totalWeight)

    for _, backend := range backends {
        current -= int64(backend.Weight)
        if current < 0 {
            return backend
        }
    }

    return backends[0]
}

// 最少连接算法
func (lb *LoadBalancer) leastConnections(backends []*Backend) *Backend {
    minConnections := int64(-1)
    var selected *Backend

    for _, backend := range backends {
        if minConnections == -1 || backend.Stats.CurrentLoad < minConnections {
            minConnections = backend.Stats.CurrentLoad
            selected = backend
        }
    }

    return selected
}

// 最快响应时间算法
func (lb *LoadBalancer) leastResponseTime(backends []*Backend) *Backend {
    minLatency := time.Duration(-1)
    var selected *Backend

    for _, backend := range backends {
        if minLatency == -1 || backend.Stats.AvgLatency < minLatency {
            minLatency = backend.Stats.AvgLatency
            selected = backend
        }
    }

    return selected
}

// IP哈希算法
func (lb *LoadBalancer) ipHash(request *http.Request, backends []*Backend) *Backend {
    clientIP := request.RemoteAddr
    if forwarded := request.Header.Get("X-Forwarded-For"); forwarded != "" {
        clientIP = forwarded
    }

    hash := 0
    for _, char := range clientIP {
        hash = int(char) + ((hash << 6) + (hash << 16) - hash)
    }

    idx := hash % len(backends)
    return backends[idx]
}

// 代理请求
func (lb *LoadBalancer) ProxyRequest(w http.ResponseWriter, r *http.Request) {
    backend := lb.SelectBackend(r)
    if backend == nil {
        http.Error(w, "No healthy backends available", http.StatusServiceUnavailable)
        return
    }

    start := time.Now()

    // 创建代理请求
    proxyReq, err := http.NewRequest(r.Method, backend.URL+r.URL.Path, r.Body)
    if err != nil {
        http.Error(w, "Failed to create proxy request", http.StatusInternalServerError)
        return
    }

    // 复制头部
    for k, v := range r.Header {
        proxyReq.Header[k] = v
    }
    proxyReq.Header.Set("X-Forwarded-For", r.RemoteAddr)
    proxyReq.Header.Set("X-Real-IP", r.RemoteAddr)

    // 执行请求
    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(proxyReq)
    if err != nil {
        // 更新错误统计
        backend.Stats.Errors++
        lb.markBackendUnhealthy(backend)
        http.Error(w, "Backend request failed", http.StatusBadGateway)
        return
    }
    defer resp.Body.Close()

    duration := time.Since(start)

    // 更新统计
    backend.mu.Lock()
    backend.Stats.Requests++
    backend.Stats.CurrentLoad++
    backend.Stats.AvgLatency = (backend.Stats.AvgLatency*time.Duration(backend.Stats.Requests-1) + duration) / time.Duration(backend.Stats.Requests)
    backend.mu.Unlock()

    // 异步减少负载
    go func(b *Backend) {
        time.Sleep(1 * time.Second)
        b.mu.Lock()
        b.Stats.CurrentLoad--
        b.mu.Unlock()
    }(backend)

    // 转发响应
    for k, v := range resp.Header {
        w.Header()[k] = v
    }
    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)

    log.Printf("请求路由到 %s，延迟: %v", backend.ID, duration)
}

// 标记后端不健康
func (lb *LoadBalancer) markBackendUnhealthy(backend *Backend) {
    backend.mu.Lock()
    defer backend.mu.Unlock()

    if backend.Healthy {
        backend.Healthy = false
        log.Printf("后端 %s 标记为不健康", backend.ID)
    }
}

// 负载均衡HTTP处理器
func (lb *LoadBalancer) Handler() http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        lb.ProxyRequest(w, r)
    }
}

// 获取状态
func (lb *LoadBalancer) GetStatus() map[string]interface{} {
    lb.mu.RLock()
    defer lb.mu.RUnlock()

    status := make(map[string]interface{})
    status["algorithm"] = lb.algorithm.String()
    status["total_backends"] = len(lb.backends)
    status["healthy_backends"] = 0
    status["backends"] = make([]map[string]interface{}, 0)

    for _, backend := range lb.backends {
        if backend.Healthy {
            status["healthy_backends"] = status["healthy_backends"].(int) + 1
        }

        backend.mu.RLock()
        backendInfo := map[string]interface{}{
            "id":            backend.ID,
            "url":           backend.URL,
            "weight":        backend.Weight,
            "active":        backend.Active,
            "healthy":       backend.Healthy,
            "stats":         backend.Stats,
            "last_check":    backend.LastCheck,
        }
        backend.mu.RUnlock()

        status["backends"] = append(status["backends"].([]map[string]interface{}), backendInfo)
    }

    return status
}

// 健康检查器
type HealthChecker struct {
    backends map[string]*Backend
    mu       sync.RWMutex
    client   *http.Client
    running  bool
}

func NewHealthChecker() *HealthChecker {
    return &HealthChecker{
        backends: make(map[string]*Backend),
        client: &http.Client{
            Timeout: 5 * time.Second,
        },
        running: false,
    }
}

func (hc *HealthChecker) AddBackend(backend *Backend) {
    hc.mu.Lock()
    defer hc.mu.Unlock()
    hc.backends[backend.ID] = backend
}

func (hc *HealthChecker) Start() {
    if hc.running {
        return
    }

    hc.running = true
    go hc.checkLoop()
}

func (hc *HealthChecker) Stop() {
    hc.running = false
}

func (hc *HealthChecker) checkLoop() {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            hc.performChecks()
        }
    }
}

func (hc *HealthChecker) performChecks() {
    hc.mu.RLock()
    backends := make([]*Backend, 0, len(hc.backends))
    for _, backend := range hc.backends {
        backends = append(backends, backend)
    }
    hc.mu.RUnlock()

    for _, backend := range backends {
        if time.Since(backend.LastCheck) < backend.CheckInterval {
            continue
        }

        go hc.checkBackend(backend)
    }
}

func (hc *HealthChecker) checkBackend(backend *Backend) {
    start := time.Now()

    req, err := http.NewRequest("GET", backend.URL+"/health", nil)
    if err != nil {
        hc.markUnhealthy(backend)
        return
    }

    resp, err := hc.client.Do(req)
    duration := time.Since(start)

    backend.mu.Lock()
    backend.LastCheck = time.Now()

    if err != nil || resp.StatusCode >= 400 {
        backend.Healthy = false
        log.Printf("健康检查失败 %s: %v (状态: %d)", backend.ID, err, resp.StatusCode)
    } else {
        backend.Healthy = true
        log.Printf("健康检查通过 %s (延迟: %v)", backend.ID, duration)
    }

    backend.mu.Unlock()

    if resp != nil {
        resp.Body.Close()
    }
}

func (hc *HealthChecker) markUnhealthy(backend *Backend) {
    backend.mu.Lock()
    defer backend.mu.Unlock()

    backend.Healthy = false
}

// 实现String方法
func (lba LoadBalancingAlgorithm) String() string {
    switch lba {
    case RoundRobin:
        return "Round Robin"
    case WeightedRoundRobin:
        return "Weighted Round Robin"
    case LeastConnections:
        return "Least Connections"
    case LeastResponseTime:
        return "Least Response Time"
    case IPHash:
        return "IP Hash"
    default:
        return "Unknown"
    }
}

// 使用示例
func main() {
    lb := NewLoadBalancer()

    // 启动模拟后端服务器
    go startMockBackend(":8081", "Backend 1")
    go startMockBackend(":8082", "Backend 2")
    go startMockBackend(":8083", "Backend 3")

    // 等待后端启动
    time.Sleep(2 * time.Second)

    // 创建HTTP服务器
    mux := http.NewServeMux()

    // 负载均衡端点
    mux.HandleFunc("/", lb.Handler())

    // 状态端点
    mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
        status := lb.GetStatus()
        fmt.Fprintf(w, "Load Balancer Status: %+v", status)
    })

    log.Println("负载均衡器启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}

// 模拟后端服务器
func startMockBackend(port, name string) {
    mux := http.NewServeMux()

    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, "%s is healthy", name)
    })

    mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        // 模拟随机延迟
        delay := time.Duration(50+rand.Intn(200)) * time.Millisecond
        time.Sleep(delay)

        w.WriteHeader(http.StatusOK)
        fmt.Fprintf(w, "%s response at %s", name, time.Now().Format("15:04:05"))
    })

    log.Printf("%s 启动在 %s", name, port)
    log.Fatal(http.ListenAndServe(port, mux))
}
```

## 9.5 性能监控与调优

### 9.5.1 实时监控系统

```go
// 性能监控系统
package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "runtime"
    "sync"
    "time"
)

type Metric struct {
    Name        string                 `json:"name"`
    Value       float64                `json:"value"`
    Timestamp   time.Time              `json:"timestamp"`
    Tags        map[string]string      `json:"tags"`
    Type        MetricType             `json:"type"`
}

type MetricType int

const (
    Counter MetricType = iota
    Gauge
    Histogram
    Summary
)

type PerformanceCollector struct {
    metrics  map[string]*Metric
    mu       sync.RWMutex
    history  []MetricPoint
    maxHistory int
}

type MetricPoint struct {
    Timestamp time.Time   `json:"timestamp"`
    Value     float64     `json:"value"`
}

func NewPerformanceCollector() *PerformanceCollector {
    pc := &PerformanceCollector{
        metrics:      make(map[string]*Metric),
        history:      make([]MetricPoint, 0),
        maxHistory:   1000,
    }

    // 启动指标收集
    go pc.collectSystemMetrics()

    return pc
}

// 记录指标
func (pc *PerformanceCollector) Record(name string, value float64, tags map[string]string, metricType MetricType) {
    pc.mu.Lock()
    defer pc.mu.Unlock()

    metric := &Metric{
        Name:      name,
        Value:     value,
        Timestamp: time.Now(),
        Tags:      tags,
        Type:      metricType,
    }

    pc.metrics[name] = metric

    // 添加到历史记录
    pc.history = append(pc.history, MetricPoint{
        Timestamp: time.Now(),
        Value:     value,
    })

    // 限制历史记录大小
    if len(pc.history) > pc.maxHistory {
        pc.history = pc.history[pc.maxHistory/2:]
    }
}

// 收集系统指标
func (pc *PerformanceCollector) collectSystemMetrics() {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            pc.collectCPUUsage()
            pc.collectMemoryUsage()
            pc.collectGCStats()
            pc.collectGoRoutines()
        }
    }
}

func (pc *PerformanceCollector) collectCPUUsage() {
    // CPU使用率（简化实现）
    cpuPercent := runtime.NumCPU() * 10.0 // 模拟值
    pc.Record("system.cpu.usage", cpuPercent, nil, Gauge)
}

func (pc *PerformanceCollector) collectMemoryUsage() {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)

    pc.Record("system.memory.heap", float64(m.HeapSys), nil, Gauge)
    pc.Record("system.memory.alloc", float64(m.Alloc), nil, Gauge)
    pc.Record("system.memory.total_alloc", float64(m.TotalAlloc), nil, Gauge)
}

func (pc *PerformanceCollector) collectGCStats() {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)

    pc.Record("system.gc.pause_total_ns", float64(m.PauseTotalNs), nil, Counter)
    pc.Record("system.gc.num_gc", float64(m.NumGC), nil, Counter)
}

func (pc *PerformanceCollector) collectGoRoutines() {
    count := runtime.NumGoroutine()
    pc.Record("system.goroutines", float64(count), nil, Gauge)
}

// HTTP中间件收集请求指标
func (pc *PerformanceCollector) RequestMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()

        // 创建响应包装器
        rw := &responseWriter{ResponseWriter: w, statusCode: 200}

        next.ServeHTTP(rw, r)

        duration := time.Since(start)

        // 记录请求指标
        tags := map[string]string{
            "method":     r.Method,
            "endpoint":   r.URL.Path,
            "status":     fmt.Sprintf("%d", rw.statusCode),
        }

        pc.Record("http.requests.total", 1, tags, Counter)
        pc.Record("http.requests.duration_ms", duration.Seconds()*1000, tags, Histogram)

        if rw.statusCode >= 500 {
            pc.Record("http.errors", 1, tags, Counter)
        }
    })
}

type responseWriter struct {
    http.ResponseWriter
    statusCode int
}

func (rw *responseWriter) WriteHeader(statusCode int) {
    rw.statusCode = statusCode
    rw.ResponseWriter.WriteHeader(statusCode)
}

// 获取当前指标
func (pc *PerformanceCollector) GetMetrics() map[string]*Metric {
    pc.mu.RLock()
    defer pc.mu.RUnlock()

    result := make(map[string]*Metric)
    for name, metric := range pc.metrics {
        result[name] = metric
    }

    return result
}

// 获取历史数据
func (pc *PerformanceCollector) GetHistory(metricName string, duration time.Duration) []MetricPoint {
    pc.mu.RLock()
    defer pc.mu.RUnlock()

    cutoff := time.Now().Add(-duration)
    var filtered []MetricPoint

    for _, point := range pc.history {
        if point.Timestamp.After(cutoff) {
            filtered = append(filtered, point)
        }
    }

    return filtered
}

// 生成Prometheus格式指标
func (pc *PerformanceCollector) GeneratePrometheusMetrics() string {
    metrics := pc.GetMetrics()

    var output strings.Builder

    // 添加帮助文本
    output.WriteString("# HELP system_cpu_usage System CPU usage percentage\n")
    output.WriteString("# TYPE system_cpu_usage gauge\n")
    output.WriteString(fmt.Sprintf("system_cpu_usage %f\n", metrics["system.cpu.usage"].Value))

    output.WriteString("\n# HELP system_memory_heap System memory heap usage\n")
    output.WriteString("# TYPE system_memory_heap gauge\n")
    output.WriteString(fmt.Sprintf("system_memory_heap %f\n", metrics["system.memory.heap"].Value))

    output.WriteString("\n# HELP http_requests_total Total HTTP requests\n")
    output.WriteString("# TYPE http_requests_total counter\n")
    output.WriteString(fmt.Sprintf("http_requests_total %f\n", metrics["http.requests.total"].Value))

    output.WriteString("\n# HELP http_requests_duration_ms HTTP request duration in milliseconds\n")
    output.WriteString("# TYPE http_requests_duration_ms histogram\n")
    output.WriteString(fmt.Sprintf("http_requests_duration_ms %f\n", metrics["http.requests.duration_ms"].Value))

    return output.String()
}

// 性能警报
type AlertRule struct {
    Name        string        `json:"name"`
    Metric      string        `json:"metric"`
    Threshold   float64       `json:"threshold"`
    Duration    time.Duration `json:"duration"`
    Severity    string        `json:"severity"`
    Callback    func(string, float64)
}

type AlertManager struct {
    rules      map[string]*AlertRule
    activeAlerts map[string]Alert
    mu         sync.RWMutex
    collector  *PerformanceCollector
}

type Alert struct {
    RuleName   string        `json:"rule_name"`
    Metric     string        `json:"metric"`
    Value      float64       `json:"value"`
    Threshold  float64       `json:"threshold"`
    StartedAt  time.Time     `json:"started_at"`
    Severity   string        `json:"severity"`
    Active     bool          `json:"active"`
}

func NewAlertManager(collector *PerformanceCollector) *AlertManager {
    am := &AlertManager{
        rules:       make(map[string]*AlertRule),
        activeAlerts: make(map[string]Alert),
        collector:  collector,
    }

    // 默认警报规则
    am.AddRule("high_cpu", "system.cpu.usage", 80.0, 5*time.Minute, "warning")
    am.AddRule("high_memory", "system.memory.heap", 1024*1024*1024, 10*time.Minute, "critical")
    am.AddRule("many_errors", "http.errors", 100, 2*time.Minute, "warning")

    // 启动警报检查
    go am.checkAlerts()

    return am
}

func (am *AlertManager) AddRule(name, metric string, threshold float64, duration time.Duration, severity string) {
    rule := &AlertRule{
        Name:       name,
        Metric:     metric,
        Threshold:  threshold,
        Duration:   duration,
        Severity:   severity,
        Callback:   am.defaultCallback,
    }

    am.rules[name] = rule
}

func (am *AlertManager) defaultCallback(ruleName string, value float64) {
    log.Printf("ALERT: %s - Value: %f exceeds threshold", ruleName, value)
}

func (am *AlertManager) checkAlerts() {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            am.evaluateRules()
        }
    }
}

func (am *AlertManager) evaluateRules() {
    metrics := am.collector.GetMetrics()

    for name, rule := range am.rules {
        metric, exists := metrics[rule.Metric]
        if !exists {
            continue
        }

        now := time.Now()

        // 检查是否超过阈值
        if metric.Value > rule.Threshold {
            // 检查是否已有活跃警报
            alertKey := fmt.Sprintf("%s:%s", name, rule.Metric)

            am.mu.Lock()
            alert, exists := am.activeAlerts[alertKey]
            am.mu.Unlock()

            if !exists {
                // 创建新警报
                newAlert := Alert{
                    RuleName:   name,
                    Metric:     rule.Metric,
                    Value:      metric.Value,
                    Threshold:  rule.Threshold,
                    StartedAt:  now,
                    Severity:   rule.Severity,
                    Active:     true,
                }

                am.mu.Lock()
                am.activeAlerts[alertKey] = newAlert
                am.mu.Unlock()

                // 执行回调
                if rule.Callback != nil {
                    rule.Callback(name, metric.Value)
                }

                log.Printf("Alert triggered: %s - Value: %f, Threshold: %f",
                    name, metric.Value, rule.Threshold)
            }
        } else {
            // 值恢复正常，关闭警报
            alertKey := fmt.Sprintf("%s:%s", name, rule.Metric)

            am.mu.Lock()
            if alert, exists := am.activeAlerts[alertKey]; exists && alert.Active {
                alert.Active = false
                am.activeAlerts[alertKey] = alert
                log.Printf("Alert resolved: %s - Value: %f", name, metric.Value)
            }
            am.mu.Unlock()
        }
    }
}

// 使用示例
func main() {
    collector := NewPerformanceCollector()
    alertManager := NewAlertManager(collector)

    // 创建服务器
    mux := http.NewServeMux()

    // 应用性能中间件
    wrappedMux := collector.RequestMiddleware(mux)

    // 模拟应用端点
    mux.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
        // 模拟一些处理时间
        time.Sleep(50 * time.Millisecond)

        // 随机产生错误
        if rand.Float32() < 0.1 {
            w.WriteHeader(http.StatusInternalServerError)
            fmt.Fprint(w, "Internal Server Error")
            return
        }

        fmt.Fprint(w, `{"status":"success","data":{"message":"Hello World"}}`)
    })

    // 指标端点
    mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
        metrics := collector.GetMetrics()
        json.NewEncoder(w).Encode(metrics)
    })

    // Prometheus格式指标
    mux.HandleFunc("/prometheus", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/plain")
        fmt.Fprint(w, collector.GeneratePrometheusMetrics())
    })

    // 警报状态
    mux.HandleFunc("/alerts", func(w http.ResponseWriter, r *http.Request) {
        alertManager.mu.RLock()
        defer alertManager.mu.RUnlock()

        json.NewEncoder(w).Encode(alertManager.activeAlerts)
    })

    log.Println("性能监控系统启动在 :8080")
    log.Fatal(http.ListenAndServe(":8080", wrappedMux))
}
```

## 9.6 总结与展望

### 9.6.1 性能优化最佳实践总结

1. **HTTP优化策略**
   - 启用HTTP/2和HTTP/3
   - 使用连接池和Keep-Alive
   - 实现智能缓存策略
   - 压缩和优化传输

2. **CDN部署原则**
   - 合理选择节点位置
   - 配置合适的缓存策略
   - 实施健康检查和故障转移
   - 监控CDN性能

3. **负载均衡选择**
   - 根据业务特点选择算法
   - 实施健康检查机制
   - 动态调整权重
   - 监控后端健康状态

4. **基础设施优化**
   - 服务器硬件优化
   - 网络设备配置
   - 数据中心布局
   - 云平台网络优化

5. **监控和调优**
   - 建立完整的监控体系
   - 设置合理的警报阈值
   - 定期性能评估
   - 持续优化改进

### 9.6.2 未来发展趋势

1. **边缘计算与CDN融合**
   - 更智能的边缘处理
   - AI驱动的缓存策略
   - 实时内容优化

2. **网络协议演进**
   - HTTP/3的广泛采用
   - QUIC协议的深度应用
   - 新的传输协议探索

3. **自动化运维**
   - AI驱动的性能优化
   - 自动扩缩容
   - 智能故障预测

4. **安全性增强**
   - 零信任网络架构
   - 端到端加密
   - 隐私保护技术

网络性能优化是一个持续的过程，需要不断学习新技术、监控性能指标，并根据业务需求调整策略。希望本章的内容能够帮助读者建立完整的性能优化知识体系，在实际项目中应用这些技术。
