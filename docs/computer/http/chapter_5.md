# 第五章 HTTP协议进阶特性

> 本章将深入探讨HTTP协议的高级特性，包括连接管理、认证机制、传输优化、跨域安全等关键技术。通过大量Go语言实战示例，帮助读者掌握HTTP进阶技术在实际项目中的应用。

## 目录

- [1. HTTP连接管理深度解析](#1-http连接管理深度解析)
- [2. HTTP认证机制全面对比](#2-http认证机制全面对比)
- [3. 传输优化技术详解](#3-传输优化技术详解)
- [4. 跨域安全与资源管理](#4-跨域安全与资源管理)
- [5. 实战应用案例](#5-实战应用案例)
- [6. 性能监控与调优](#6-性能监控与调优)

## 1. HTTP连接管理深度解析

### 1.1 Keep-Alive机制原理

HTTP Keep-Alive（持久连接）是HTTP/1.1的核心特性之一，它允许在同一个TCP连接上发送多个HTTP请求，避免了频繁建立和关闭连接的开销。

#### 1.1.1 Keep-Alive工作机制

```go
package main

import (
    "fmt"
    "net/http"
    "time"
    "sync"
)

// 自定义HTTP客户端，演示Keep-Alive机制
func demonstrateKeepAlive() {
    // 创建一个启用了Keep-Alive的客户端
    transport := &http.Transport{
        MaxIdleConns:        100,              // 最大空闲连接数
        MaxIdleConnsPerHost: 10,               // 每个主机的最大空闲连接数
        IdleConnTimeout:     90 * time.Second, // 空闲连接超时时间
        DisableCompression:   false,           // 启用压缩
    }

    client := &http.Client{
        Transport: transport,
        Timeout:   30 * time.Second,
    }

    // 使用WaitGroup来同步多个请求
    var wg sync.WaitGroup

    // 发送多个请求到同一个服务器，验证Keep-Alive效果
    for i := 0; i < 5; i++ {
        wg.Add(1)
        go func(requestID int) {
            defer wg.Done()

            req, err := http.NewRequest("GET", "https://httpbin.org/get", nil)
            if err != nil {
                fmt.Printf("Request %d creation error: %v\n", requestID, err)
                return
            }

            // 设置User-Agent标识
            req.Header.Set("User-Agent", fmt.Sprintf("Keep-Alive-Demo/%d", requestID))

            start := time.Now()
            resp, err := client.Do(req)
            duration := time.Since(start)

            if err != nil {
                fmt.Printf("Request %d error: %v\n", requestID, err)
                return
            }
            defer resp.Body.Close()

            fmt.Printf("Request %d completed in %v, Status: %s\n",
                requestID, duration, resp.Status)
        }(i)
    }

    wg.Wait()
    fmt.Println("All requests completed")
}
```

#### 1.1.2 连接池管理

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
    "time"
)

// 自定义连接池实现
type ConnectionPool struct {
    mu       sync.Mutex
    clients  []*http.Client
    maxSize  int
    current  int
}

// 创建连接池
func NewConnectionPool(maxSize int) *ConnectionPool {
    pool := &ConnectionPool{
        clients: make([]*http.Client, maxSize),
        maxSize: maxSize,
    }

    // 预创建客户端连接
    for i := 0; i < maxSize; i++ {
        pool.clients[i] = &http.Client{
            Transport: &http.Transport{
                MaxIdleConnsPerHost: 5,
                IdleConnTimeout:     30 * time.Second,
            },
        }
    }

    return pool
}

// 获取客户端（轮询策略）
func (p *ConnectionPool) GetClient() *http.Client {
    p.mu.Lock()
    defer p.mu.Unlock()

    client := p.clients[p.current]
    p.current = (p.current + 1) % p.maxSize
    return client
}

// 批量请求处理
func (p *ConnectionPool) BatchRequest(urls []string) []error {
    var wg sync.WaitGroup
    errors := make([]error, len(urls))

    for i, url := range urls {
        wg.Add(1)
        go func(index int, targetURL string) {
            defer wg.Done()

            client := p.GetClient()
            req, err := http.NewRequest("GET", targetURL, nil)
            if err != nil {
                errors[index] = err
                return
            }

            resp, err := client.Do(req)
            if err != nil {
                errors[index] = err
                return
            }
            defer resp.Body.Close()

            fmt.Printf("Request to %s completed with status %s\n",
                targetURL, resp.Status)
        }(i, url)
    }

    wg.Wait()
    return errors
}
```

### 1.2 HTTP/2的多路复用

HTTP/2引入了多路复用（Multiplexing）概念，允许在单个TCP连接上同时处理多个请求和响应。

```go
package main

import (
    "fmt"
    "golang.org/x/net/http2"
    "net/http"
    "sync"
)

// HTTP/2客户端配置
func createHTTP2Client() *http.Client {
    transport := &http.Transport{
        // 启用HTTP/2支持
        TLSClientConfig: &http2.Transport{}.TLSClientConfig,
    }

    return &http.Client{
        Transport: transport,
        Timeout:   30 * time.Second,
    }
}

// 演示HTTP/2多路复用
func demonstrateHTTP2Multiplexing() {
    client := createHTTP2Client()

    urls := []string{
        "https://httpbin.org/get",
        "https://httpbin.org/delay/1",
        "https://httpbin.org/user-agent",
        "https://httpbin.org/headers",
        "https://httpbin.org/ip",
    }

    var wg sync.WaitGroup
    results := make(chan string, len(urls))

    for i, url := range urls {
        wg.Add(1)
        go func(index int, targetURL string) {
            defer wg.Done()

            req, _ := http.NewRequest("GET", targetURL, nil)
            req.Header.Set("X-Request-ID", fmt.Sprintf("request-%d", index))

            start := time.Now()
            resp, err := client.Do(req)
            duration := time.Since(start)

            if err != nil {
                results <- fmt.Sprintf("Error: %v", err)
                return
            }
            defer resp.Body.Close()

            results <- fmt.Sprintf("URL: %s, Status: %s, Duration: %v",
                targetURL, resp.Status, duration)
        }(i, url)
    }

    wg.Wait()
    close(results)

    fmt.Println("HTTP/2 Multiplexing Results:")
    for result := range results {
        fmt.Println(result)
    }
}
```

### 1.3 连接健康监控

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
    "time"
)

// 连接健康状态监控
type ConnectionHealthMonitor struct {
    mu           sync.RWMutex
    stats        map[string]*ConnectionStats
    checkInterval time.Duration
    client       *http.Client
}

type ConnectionStats struct {
    TotalRequests   int64
    SuccessfulReqs int64
    FailedReqs      int64
    AvgResponseTime time.Duration
    LastCheck      time.Time
    IsHealthy      bool
}

func NewHealthMonitor() *ConnectionHealthMonitor {
    monitor := &ConnectionHealthMonitor{
        stats:        make(map[string]*ConnectionStats),
        checkInterval: 30 * time.Second,
        client: &http.Client{
            Timeout: 10 * time.Second,
        },
    }

    go monitor.startMonitoring()
    return monitor
}

func (m *ConnectionHealthMonitor) CheckConnection(url string) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    if _, exists := m.stats[url]; !exists {
        m.stats[url] = &ConnectionStats{}
    }

    stats := m.stats[url]
    stats.TotalRequests++
    stats.LastCheck = time.Now()

    start := time.Now()
    resp, err := m.client.Get(url)
    duration := time.Since(start)

    if err != nil {
        stats.FailedReqs++
        stats.IsHealthy = false
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode >= 200 && resp.StatusCode < 300 {
        stats.SuccessfulReqs++
        stats.IsHealthy = true

        // 计算平均响应时间
        if stats.SuccessfulReqs == 1 {
            stats.AvgResponseTime = duration
        } else {
            stats.AvgResponseTime = (stats.AvgResponseTime + duration) / 2
        }
    } else {
        stats.FailedReqs++
        stats.IsHealthy = false
    }

    return nil
}

func (m *ConnectionHealthMonitor) startMonitoring() {
    ticker := time.NewTicker(m.checkInterval)
    defer ticker.Stop()

    for range ticker.C {
        // 定期检查所有连接的健康状态
        m.mu.RLock()
        urls := make([]string, 0, len(m.stats))
        for url := range m.stats {
            urls = append(urls, url)
        }
        m.mu.RUnlock()

        for _, url := range urls {
            m.CheckConnection(url)
        }
    }
}

func (m *ConnectionHealthMonitor) GetStats(url string) (*ConnectionStats, bool) {
    m.mu.RLock()
    defer m.mu.RUnlock()

    stats, exists := m.stats[url]
    return stats, exists
}

func (m *ConnectionHealthMonitor) PrintStats() {
    m.mu.RLock()
    defer m.mu.RUnlock()

    fmt.Println("Connection Health Statistics:")
    for url, stats := range m.stats {
        successRate := float64(stats.SuccessfulReqs) / float64(stats.TotalRequests) * 100
        fmt.Printf("URL: %s\n", url)
        fmt.Printf("  Total Requests: %d\n", stats.TotalRequests)
        fmt.Printf("  Success Rate: %.2f%%\n", successRate)
        fmt.Printf("  Average Response Time: %v\n", stats.AvgResponseTime)
        fmt.Printf("  Health Status: %t\n", stats.IsHealthy)
        fmt.Printf("  Last Check: %v\n\n", stats.LastCheck)
    }
}
```

## 2. HTTP认证机制全面对比

### 2.1 Basic认证

Basic认证是最简单的HTTP认证方式，通过Base64编码传输用户名和密码。

```go
package main

import (
    "encoding/base64"
    "fmt"
    "net/http"
    "strings"
)

// Basic认证实现
type BasicAuthMiddleware struct {
    username string
    password string
    realm    string
}

func NewBasicAuthMiddleware(username, password, realm string) *BasicAuthMiddleware {
    return &BasicAuthMiddleware{
        username: username,
        password: password,
        realm:    realm,
    }
}

func (auth *BasicAuthMiddleware) Wrap(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 检查Authorization头
        authHeader := r.Header.Get("Authorization")
        if !strings.HasPrefix(authHeader, "Basic ") {
            auth.sendUnauthorized(w)
            return
        }

        // 解析并验证凭据
        encoded := strings.TrimPrefix(authHeader, "Basic ")
        decoded, err := base64.StdEncoding.DecodeString(encoded)
        if err != nil {
            http.Error(w, "Invalid credentials format", http.StatusBadRequest)
            return
        }

        credentials := strings.SplitN(string(decoded), ":", 2)
        if len(credentials) != 2 {
            http.Error(w, "Invalid credentials format", http.StatusBadRequest)
            return
        }

        username, password := credentials[0], credentials[1]
        if username == auth.username && password == auth.password {
            // 认证成功，继续处理请求
            next.ServeHTTP(w, r)
        } else {
            auth.sendUnauthorized(w)
        }
    })
}

func (auth *BasicAuthMiddleware) sendUnauthorized(w http.ResponseWriter) {
    w.Header().Set("WWW-Authenticate", fmt.Sprintf("Basic realm=\"%s\"", auth.realm))
    w.WriteHeader(http.StatusUnauthorized)
    w.Write([]byte("Authentication required"))
}

// 客户端Basic认证
func createBasicAuthClient(username, password string) *http.Client {
    return &http.Client{
        Transport: &http.Transport{},
        Timeout:   30 * time.Second,
    }
}

func makeBasicAuthRequest(client *http.Client, url, username, password string) (*http.Response, error) {
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }

    // 设置Basic认证头
    credentials := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
    req.Header.Set("Authorization", "Basic "+credentials)

    return client.Do(req)
}
```

### 2.2 Digest认证

Digest认证比Basic认证更安全，使用挑战-响应机制避免明文传输密码。

```go
package main

import (
    "crypto/md5"
    "crypto/rand"
    "encoding/hex"
    "fmt"
    "net/http"
    "strings"
    "time"
)

// Digest认证实现
type DigestAuthMiddleware struct {
    username  string
    password  string
    realm     string
    nonceMap  map[string]time.Time
}

func NewDigestAuthMiddleware(username, password, realm string) *DigestAuthMiddleware {
    return &DigestAuthMiddleware{
        username: username,
        password: password,
        realm:    realm,
        nonceMap: make(map[string]time.Time),
    }
}

func (auth *DigestAuthMiddleware) Wrap(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if !strings.HasPrefix(authHeader, "Digest ") {
            auth.sendChallenge(w)
            return
        }

        params := parseDigestParams(authHeader[7:])

        // 验证nonce
        nonce := params["nonce"]
        if auth.nonceMap[nonce].IsZero() {
            w.WriteHeader(http.StatusUnauthorized)
            w.Write([]byte("Stale nonce"))
            return
        }

        // 验证响应
        if auth.verifyDigestResponse(r, params) {
            next.ServeHTTP(w, r)
        } else {
            w.WriteHeader(http.StatusUnauthorized)
            w.Write([]byte("Invalid credentials"))
        }
    })
}

func (auth *DigestAuthMiddleware) sendChallenge(w http.ResponseWriter) {
    nonce := generateNonce()
    auth.nonceMap[nonce] = time.Now()

    challenge := fmt.Sprintf(`Digest realm="%s", qop="auth", nonce="%s", opaque="%s"`,
        auth.realm, nonce, generateNonce())

    w.Header().Set("WWW-Authenticate", challenge)
    w.WriteHeader(http.StatusUnauthorized)
    w.Write([]byte("Authentication required"))
}

func parseDigestParams(authHeader string) map[string]string {
    params := make(map[string]string)
    parts := strings.Split(authHeader, ",")

    for _, part := range parts {
        part = strings.TrimSpace(part)
        if eqIndex := strings.Index(part, "="); eqIndex != -1 {
            key := strings.Trim(part[:eqIndex], `"`)
            value := strings.Trim(part[eqIndex+1:], `"`)
            params[key] = value
        }
    }

    return params
}

func (auth *DigestAuthMiddleware) verifyDigestResponse(r *http.Request, params map[string]string) bool {
    method := r.Method
    uri := r.URL.RequestURI()
    username := params["username"]
    realm := params["realm"]
    nonce := params["nonce"]
    response := params["response"]

    if username != auth.username || realm != auth.realm {
        return false
    }

    // 计算预期的响应
    expectedResponse := calculateDigestResponse(
        auth.username, auth.password, realm, nonce, method, uri)

    return response == expectedResponse
}

func calculateDigestResponse(username, password, realm, nonce, method, uri string) string {
    ha1 := md5String(username + ":" + realm + ":" + password)
    ha2 := md5String(method + ":" + uri)
    response := md5String(ha1 + ":" + nonce + ":" + ha2)

    return response
}

func md5String(s string) string {
    hash := md5.Sum([]byte(s))
    return hex.EncodeToString(hash[:])
}

func generateNonce() string {
    b := make([]byte, 16)
    rand.Read(b)
    return hex.EncodeToString(b)
}
```

### 2.3 OAuth2认证

OAuth2是现代Web应用中最常用的授权框架。

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "net/url"
    "strings"
    "time"
)

// OAuth2客户端实现
type OAuth2Client struct {
    clientID     string
    clientSecret string
    redirectURI  string
    authURL      string
    tokenURL     string
    apiBaseURL   string
    httpClient   *http.Client
}

func NewOAuth2Client(clientID, clientSecret, redirectURI, authURL, tokenURL, apiBaseURL string) *OAuth2Client {
    return &OAuth2Client{
        clientID:     clientID,
        clientSecret: clientSecret,
        redirectURI:  redirectURI,
        authURL:      authURL,
        tokenURL:     tokenURL,
        apiBaseURL:   apiBaseURL,
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
    }
}

// 获取授权URL
func (c *OAuth2Client) GetAuthURL(state string) string {
    params := url.Values{
        "client_id":    {c.clientID},
        "redirect_uri": {c.redirectURI},
        "response_type": {"code"},
        "scope":        {"read write"},
        "state":        {state},
    }

    return c.authURL + "?" + params.Encode()
}

// 交换访问令牌
func (c *OAuth2Client) ExchangeCodeForToken(code string) (*TokenResponse, error) {
    data := url.Values{
        "grant_type":   {"authorization_code"},
        "code":         {code},
        "redirect_uri": {c.redirectURI},
        "client_id":    {c.clientID},
        "client_secret": {c.clientSecret},
    }

    resp, err := c.httpClient.PostForm(c.tokenURL, data)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var tokenResp TokenResponse
    if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
        return nil, err
    }

    return &tokenResp, nil
}

// 刷新令牌
func (c *OAuth2Client) RefreshToken(refreshToken string) (*TokenResponse, error) {
    data := url.Values{
        "grant_type":    {"refresh_token"},
        "refresh_token": {refreshToken},
        "client_id":     {c.clientID},
        "client_secret": {c.clientSecret},
    }

    resp, err := c.httpClient.PostForm(c.tokenURL, data)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var tokenResp TokenResponse
    if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
        return nil, err
    }

    return &tokenResp, nil
}

// 使用访问令牌调用API
func (c *OAuth2Client) CallAPIWithToken(token, endpoint string, method string) (*http.Response, error) {
    apiURL := strings.TrimSuffix(c.apiBaseURL, "/") + "/" + strings.TrimPrefix(endpoint, "/")

    req, err := http.NewRequest(method, apiURL, nil)
    if err != nil {
        return nil, err
    }

    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Accept", "application/json")

    return c.httpClient.Do(req)
}

type TokenResponse struct {
    AccessToken  string `json:"access_token"`
    TokenType    string `json:"token_type"`
    ExpiresIn    int    `json:"expires_in"`
    RefreshToken string `json:"refresh_token"`
    Scope        string `json:"scope"`
}

// OAuth2服务器端实现
type OAuth2Server struct {
    clients      map[string]Client
    authCodes    map[string]AuthCode
    accessTokens map[string]AccessToken
}

type Client struct {
    ID          string
    Secret      string
    RedirectURI string
}

type AuthCode struct {
    Code        string
    ClientID    string
    RedirectURI string
    Scope       string
    ExpiresAt   time.Time
}

type AccessToken struct {
    Token     string
    ClientID  string
    UserID    string
    Scope     string
    ExpiresAt time.Time
}

func NewOAuth2Server() *OAuth2Server {
    return &OAuth2Server{
        clients:      make(map[string]Client),
        authCodes:    make(map[string]AuthCode),
        accessTokens: make(map[string]AccessToken),
    }
}

func (s *OAuth2Server) AddClient(client Client) {
    s.clients[client.ID] = client
}

func (s *OAuth2Server) HandleAuthorization(w http.ResponseWriter, r *http.Request) {
    clientID := r.URL.Query().Get("client_id")
    redirectURI := r.URL.Query().Get("redirect_uri")
    responseType := r.URL.Query().Get("response_type")
    state := r.URL.Query().Get("state")

    // 验证客户端
    client, exists := s.clients[clientID]
    if !exists || client.RedirectURI != redirectURI || responseType != "code" {
        http.Error(w, "Invalid client", http.StatusBadRequest)
        return
    }

    // 在实际应用中，这里应该验证用户身份
    // 简化示例，假设用户已登录
    userID := "user123"

    // 生成授权码
    authCode := generateCode()
    s.authCodes[authCode] = AuthCode{
        Code:        authCode,
        ClientID:    clientID,
        RedirectURI: redirectURI,
        Scope:       "read write",
        ExpiresAt:   time.Now().Add(10 * time.Minute),
    }

    // 重定向回客户端
    redirectURL := fmt.Sprintf("%s?code=%s&state=%s", redirectURI, authCode, state)
    http.Redirect(w, r, redirectURL, http.StatusFound)
}

func (s *OAuth2Server) HandleToken(w http.ResponseWriter, r *http.Request) {
    // 验证客户端凭据
    clientID, clientSecret, ok := r.BasicAuth()
    if !ok {
        http.Error(w, "Client authentication required", http.StatusUnauthorized)
        return
    }

    client, exists := s.clients[clientID]
    if !exists || client.Secret != clientSecret {
        http.Error(w, "Invalid client", http.StatusUnauthorized)
        return
    }

    grantType := r.FormValue("grant_type")

    switch grantType {
    case "authorization_code":
        s.handleAuthorizationCodeGrant(w, r, clientID)
    case "refresh_token":
        s.handleRefreshTokenGrant(w, r, clientID)
    default:
        http.Error(w, "Unsupported grant type", http.StatusBadRequest)
    }
}

func (s *OAuth2Server) handleAuthorizationCodeGrant(w http.ResponseWriter, r *http.Request, clientID string) {
    code := r.FormValue("code")
    redirectURI := r.FormValue("redirect_uri")

    authCode, exists := s.authCodes[code]
    if !exists || authCode.ClientID != clientID || authCode.RedirectURI != redirectURI {
        http.Error(w, "Invalid authorization code", http.StatusBadRequest)
        return
    }

    if time.Now().After(authCode.ExpiresAt) {
        delete(s.authCodes, code)
        http.Error(w, "Authorization code expired", http.StatusBadRequest)
        return
    }

    // 生成访问令牌
    accessToken := generateToken()
    s.accessTokens[accessToken] = AccessToken{
        Token:     accessToken,
        ClientID:  clientID,
        UserID:    "user123",
        Scope:     authCode.Scope,
        ExpiresAt: time.Now().Add(time.Hour),
    }

    // 清理已使用的授权码
    delete(s.authCodes, code)

    // 返回令牌响应
    response := map[string]interface{}{
        "access_token":  accessToken,
        "token_type":    "Bearer",
        "expires_in":    3600,
        "scope":         authCode.Scope,
        "refresh_token": generateToken(),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

func generateCode() string {
    return "auth_code_" + generateToken()
}

func generateToken() string {
    return "token_" + fmt.Sprintf("%d", time.Now().UnixNano())
}
```

### 2.4 JWT令牌认证

JWT（JSON Web Token）是一种无状态的认证方式。

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

// JWT认证实现
type JWTManager struct {
    secretKey []byte
    issuer    string
    audience  string
}

type Claims struct {
    UserID   string   `json:"user_id"`
    Username string   `json:"username"`
    Roles    []string `json:"roles"`
    jwt.RegisteredClaims
}

func NewJWTManager(secretKey, issuer, audience string) *JWTManager {
    return &JWTManager{
        secretKey: []byte(secretKey),
        issuer:    issuer,
        audience:  audience,
    }
}

// 生成JWT令牌
func (j *JWTManager) GenerateToken(userID, username string, roles []string, expiration time.Duration) (string, error) {
    claims := Claims{
        UserID:   userID,
        Username: username,
        Roles:    roles,
        RegisteredClaims: jwt.RegisteredClaims{
            Issuer:    j.issuer,
            Audience:  []string{j.audience},
            Subject:   userID,
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiration)),
            NotBefore: jwt.NewNumericDate(time.Now()),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(j.secretKey)
}

// 验证JWT令牌
func (j *JWTManager) ValidateToken(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return j.secretKey, nil
    })

    if err != nil {
        return nil, err
    }

    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, fmt.Errorf("invalid token")
    }

    return claims, nil
}

// JWT认证中间件
func (j *JWTManager) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if !strings.HasPrefix(authHeader, "Bearer ") {
            http.Error(w, "Authorization header required", http.StatusUnauthorized)
            return
        }

        tokenString := strings.TrimPrefix(authHeader, "Bearer ")
        claims, err := j.ValidateToken(tokenString)
        if err != nil {
            http.Error(w, "Invalid token", http.StatusUnauthorized)
            return
        }

        // 将用户信息添加到请求上下文
        ctx := r.Context()
        ctx = context.WithValue(ctx, "user_id", claims.UserID)
        ctx = context.WithValue(ctx, "username", claims.Username)
        ctx = context.WithValue(ctx, "roles", claims.Roles)

        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// 角色检查中间件
func RequireRole(roles []string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            userRoles := r.Context().Value("roles").([]string)

            // 检查用户是否具有所需角色
            for _, requiredRole := range roles {
                for _, userRole := range userRoles {
                    if userRole == requiredRole {
                        next.ServeHTTP(w, r)
                        return
                    }
                }
            }

            http.Error(w, "Insufficient permissions", http.StatusForbidden)
        })
    }
}
```

## 3. 传输优化技术详解

### 3.1 HTTP压缩机制

HTTP压缩可以显著减少传输数据量，提高网络传输效率。

```go
package main

import (
    "compress/gzip"
    "fmt"
    "io"
    "net/http"
    "os"
    "strings"
    "sync"
)

// 压缩响应包装器
type gzipResponseWriter struct {
    io.Writer
    http.ResponseWriter
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
    return w.Writer.Write(b)
}

// 启用Gzip压缩的HTTP处理器
func EnableGzip(handler http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 检查客户端是否支持gzip压缩
        if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
            handler.ServeHTTP(w, r)
            return
        }

        // 设置响应头
        w.Header().Set("Content-Encoding", "gzip")

        // 创建gzip写入器
        gz := gzip.NewWriter(w)
        defer gz.Close()

        // 包装响应写入器
        gzWriter := &gzipResponseWriter{
            Writer:         gz,
            ResponseWriter: w,
        }

        handler.ServeHTTP(gzWriter, r)
    })
}

// 文件压缩处理
func compressFile(sourceFile, targetFile string) error {
    source, err := os.Open(sourceFile)
    if err != nil {
        return err
    }
    defer source.Close()

    target, err := os.Create(targetFile)
    if err != nil {
        return err
    }
    defer target.Close()

    gz := gzip.NewWriter(target)
    defer gz.Close()

    _, err = io.Copy(gz, source)
    return err
}

// 压缩内容处理
type CompressedContent struct {
    OriginalData []byte
    CompressedData []byte
    CompressionType string
    Size int
}

// 内容压缩器
type ContentCompressor struct {
    mu sync.RWMutex
    compressionCache map[string]*CompressedContent
    maxCacheSize int
}

func NewContentCompressor(maxCacheSize int) *ContentCompressor {
    return &ContentCompressor{
        compressionCache: make(map[string]*CompressedContent),
        maxCacheSize: maxCacheSize,
    }
}

func (c *ContentCompressor) Compress(data []byte, compressionType string) ([]byte, error) {
    // 生成内容哈希用于缓存
    contentHash := fmt.Sprintf("%x", md5.Sum(data))

    c.mu.RLock()
    cached := c.compressionCache[contentHash]
    c.mu.RUnlock()

    if cached != nil {
        return cached.CompressedData, nil
    }

    var compressedData []byte
    var err error

    switch compressionType {
    case "gzip":
        var buf bytes.Buffer
        gz := gzip.NewWriter(&buf)
        _, err = gz.Write(data)
        gz.Close()
        compressedData = buf.Bytes()
    case "deflate":
        compressedData, err = deflateCompress(data)
    default:
        return data, nil
    }

    if err != nil {
        return data, err
    }

    // 缓存压缩结果
    c.mu.Lock()
    if len(c.compressionCache) >= c.maxCacheSize {
        // 简单的LRU清理策略
        for key := range c.compressionCache {
            delete(c.compressionCache, key)
            break
        }
    }
    c.compressionCache[contentHash] = &CompressedContent{
        OriginalData: data,
        CompressedData: compressedData,
        CompressionType: compressionType,
        Size: len(compressedData),
    }
    c.mu.Unlock()

    return compressedData, nil
}

// 客户端自动解压缩
func createAutoDecompressClient() *http.Client {
    return &http.Client{
        Transport: &http.Transport{},
        Timeout:   30 * time.Second,
    }
}

func makeRequestWithAutoDecompress(client *http.Client, url string) ([]byte, error) {
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }

    // 发送Accept-Encoding头
    req.Header.Set("Accept-Encoding", "gzip, deflate, br")

    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var reader io.Reader
    contentEncoding := resp.Header.Get("Content-Encoding")

    switch contentEncoding {
    case "gzip":
        reader, err = gzip.NewReader(resp.Body)
        if err != nil {
            return nil, err
        }
        defer reader.(*gzip.Reader).Close()
    case "deflate":
        reader = flate.NewReader(resp.Body)
        defer reader.(io.ReadCloser).Close()
    default:
        reader = resp.Body
    }

    return io.ReadAll(reader)
}
```

### 3.2 内容协商与编码

```go
package main

import (
    "fmt"
    "net/http"
    "strings"
)

// 内容协商处理器
type ContentNegotiation struct {
    defaultFormat   string
    supportedFormats map[string]func(data interface{}) ([]byte, error)
}

func NewContentNegotiation(defaultFormat string) *ContentNegotiation {
    cn := &ContentNegotiation{
        defaultFormat: defaultFormat,
        supportedFormats: make(map[string]func(interface{}) ([]byte, error)),
    }

    // 注册支持的内容格式
    cn.supportedFormats["json"] = func(data interface{}) ([]byte, error) {
        return json.Marshal(data)
    }

    cn.supportedFormats["xml"] = func(data interface{}) ([]byte, error) {
        return xml.Marshal(data)
    }

    cn.supportedFormats["text"] = func(data interface{}) ([]byte, error) {
        return []byte(fmt.Sprintf("%v", data)), nil
    }

    return cn
}

func (cn *ContentNegotiation) ServeHTTP(w http.ResponseWriter, r *http.Request, data interface{}) {
    // 1. 检查URL路径中的格式
    format := cn.extractFormatFromPath(r.URL.Path)

    // 2. 检查Accept头
    if format == "" {
        format = cn.selectFormatFromAccept(r.Header.Get("Accept"))
    }

    // 3. 使用默认格式
    if format == "" {
        format = cn.defaultFormat
    }

    // 4. 检查格式是否支持
    encoder, exists := cn.supportedFormats[format]
    if !exists {
        http.Error(w, "Unsupported format", http.StatusNotAcceptable)
        return
    }

    // 5. 编码并发送响应
    encodedData, err := encoder(data)
    if err != nil {
        http.Error(w, "Encoding error", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", cn.getContentType(format))
    w.Write(encodedData)
}

func (cn *ContentNegotiation) extractFormatFromPath(path string) string {
    // 从URL路径中提取文件扩展名
    if strings.HasSuffix(path, ".json") {
        return "json"
    } else if strings.HasSuffix(path, ".xml") {
        return "xml"
    } else if strings.HasSuffix(path, ".txt") {
        return "text"
    }
    return ""
}

func (cn *ContentNegotiation) selectFormatFromAccept(acceptHeader string) string {
    // 简单的Accept头解析
    formats := strings.Split(acceptHeader, ",")

    for _, format := range formats {
        format = strings.TrimSpace(format)
        if strings.HasPrefix(format, "application/json") {
            return "json"
        } else if strings.HasPrefix(format, "application/xml") {
            return "xml"
        } else if strings.HasPrefix(format, "text/plain") {
            return "text"
        }
    }

    return ""
}

func (cn *ContentNegotiation) getContentType(format string) string {
    switch format {
    case "json":
        return "application/json; charset=utf-8"
    case "xml":
        return "application/xml; charset=utf-8"
    case "text":
        return "text/plain; charset=utf-8"
    default:
        return "application/octet-stream"
    }
}
```

### 3.3 缓存策略

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
    "time"
)

// HTTP缓存管理
type HTTPCache struct {
    mu         sync.RWMutex
    cache      map[string]*CacheEntry
    maxSize    int
    ttl        time.Duration
}

type CacheEntry struct {
    Response    *http.Response
    Body        []byte
    CreatedAt   time.Time
    LastAccess  time.Time
    AccessCount int
    Etag        string
    LastModified time.Time
}

func NewHTTPCache(maxSize int, ttl time.Duration) *HTTPCache {
    cache := &HTTPCache{
        cache:   make(map[string]*CacheEntry),
        maxSize: maxSize,
        ttl:     ttl,
    }

    // 启动清理协程
    go cache.startCleanup()

    return cache
}

func (c *HTTPCache) Get(key string) (*http.Response, []byte, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()

    entry, exists := c.cache[key]
    if !exists {
        return nil, nil, false
    }

    // 检查是否过期
    if time.Since(entry.CreatedAt) > c.ttl {
        delete(c.cache, key)
        return nil, nil, false
    }

    // 更新访问统计
    entry.LastAccess = time.Now()
    entry.AccessCount++

    // 创建响应的副本
    resp := entry.Response
    newResp := &http.Response{
        Status:        resp.Status,
        StatusCode:    resp.StatusCode,
        Proto:         resp.Proto,
        ProtoMajor:    resp.ProtoMajor,
        ProtoMinor:    resp.ProtoMinor,
        Header:        make(http.Header),
        Body:          nil,
        ContentLength: resp.ContentLength,
        TransferEncoding: resp.TransferEncoding,
        Close:         resp.Close,
        Uncompressed:  resp.Uncompressed,
        Trailer:       resp.Trailer,
        Request:       resp.Request,
    }

    // 复制头部
    for k, v := range resp.Header {
        newResp.Header[k] = v
    }

    // 复制body
    bodyCopy := make([]byte, len(entry.Body))
    copy(bodyCopy, entry.Body)
    newResp.Body = &ReadCloser{ReadCloser: &bytesReader{bytes: bodyCopy}}

    return newResp, entry.Body, true
}

func (c *HTTPCache) Set(key string, resp *http.Response, body []byte) {
    c.mu.Lock()
    defer c.mu.Unlock()

    // 检查缓存大小限制
    if len(c.cache) >= c.maxSize {
        c.evictOldest()
    }

    entry := &CacheEntry{
        Response:    resp,
        Body:        body,
        CreatedAt:   time.Now(),
        LastAccess:  time.Now(),
        AccessCount: 1,
    }

    // 提取ETag和Last-Modified
    if etag := resp.Header.Get("ETag"); etag != "" {
        entry.Etag = etag
    }
    if lastMod := resp.Header.Get("Last-Modified"); lastMod != "" {
        if parsed, err := time.Parse(time.RFC1123, lastMod); err == nil {
            entry.LastModified = parsed
        }
    }

    c.cache[key] = entry
}

func (c *HTTPCache) evictOldest() {
    oldestKey := ""
    oldestTime := time.Now()

    for key, entry := range c.cache {
        if entry.LastAccess.Before(oldestTime) {
            oldestTime = entry.LastAccess
            oldestKey = key
        }
    }

    if oldestKey != "" {
        delete(c.cache, oldestKey)
    }
}

func (c *HTTPCache) startCleanup() {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()

    for range ticker.C {
        c.mu.Lock()
        now := time.Now()
        for key, entry := range c.cache {
            if now.Sub(entry.CreatedAt) > c.ttl {
                delete(c.cache, key)
            }
        }
        c.mu.Unlock()
    }
}

// 条件请求支持
func (c *HTTPCache) HandleConditionalRequest(w http.ResponseWriter, r *http.Request, key string) {
    if entry, exists := c.GetConditional(key, r); exists {
        // 发送缓存的响应
        if entry.Etag != "" {
            w.Header().Set("ETag", entry.Etag)
        }
        if !entry.LastModified.IsZero() {
            w.Header().Set("Last-Modified", entry.LastModified.Format(time.RFC1123))
        }

        // 检查If-None-Match
        if ifNoneMatch := r.Header.Get("If-None-Match"); ifNoneMatch != "" {
            if ifNoneMatch == entry.Etag {
                w.WriteHeader(http.StatusNotModified)
                return
            }
        }

        // 检查If-Modified-Since
        if ifModifiedSince := r.Header.Get("If-Modified-Since"); ifModifiedSince != "" {
            if ifModifiedSinceTime, err := time.Parse(time.RFC1123, ifModifiedSince); err == nil {
                if !entry.LastModified.IsZero() && !entry.LastModified.After(ifModifiedSinceTime) {
                    w.WriteHeader(http.StatusNotModified)
                    return
                }
            }
        }

        w.Write(entry.Body)
    }
}

func (c *HTTPCache) GetConditional(key string, r *http.Request) (*CacheEntry, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()

    entry, exists := c.cache[key]
    if !exists {
        return nil, false
    }

    // 检查ETag匹配
    if ifNoneMatch := r.Header.Get("If-None-Match"); ifNoneMatch != "" {
        if entry.Etag != "" && ifNoneMatch == entry.Etag {
            return entry, true
        }
    }

    // 检查Last-Modified匹配
    if ifModifiedSince := r.Header.Get("If-Modified-Since"); ifModifiedSince != "" {
        if ifModifiedSinceTime, err := time.Parse(time.RFC1123, ifModifiedSince); err == nil {
            if !entry.LastModified.IsZero() && !entry.LastModified.After(ifModifiedSinceTime) {
                return entry, true
            }
        }
    }

    return entry, false
}

// 辅助结构体
type ReadCloser struct {
    io.ReadCloser
}

type bytesReader struct {
    bytes.Reader
}
```

## 4. 跨域安全与资源管理

### 4.1 CORS跨域资源共享

```go
package main

import (
    "fmt"
    "net/http"
    "strings"
)

// CORS中间件
type CORSConfig struct {
    AllowOrigins     []string
    AllowMethods     []string
    AllowHeaders     []string
    AllowCredentials bool
    ExposeHeaders    []string
    MaxAge           int
}

func NewCORSConfig() *CORSConfig {
    return &CORSConfig{
        AllowOrigins:     []string{"*"},
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"Content-Type", "Authorization", "X-Requested-With"},
        AllowCredentials: false,
        ExposeHeaders:    []string{"ETag", "Link", "X-Total-Count"},
        MaxAge:           86400, // 24小时
    }
}

func (c *CORSConfig) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")

        // 检查是否是跨域请求
        if origin != "" {
            // 预检请求处理
            if r.Method == http.MethodOptions {
                c.handlePreflightRequest(w, r, origin)
                return
            }

            // 实际请求处理
            c.handleActualRequest(w, r, origin)
        }

        next.ServeHTTP(w, r)
    })
}

func (c *CORSConfig) handlePreflightRequest(w http.ResponseWriter, r *http.Request, origin string) {
    // 设置Access-Control-Allow-Origin
    if c.isOriginAllowed(origin) {
        w.Header().Set("Access-Control-Allow-Origin", origin)
    } else if len(c.AllowOrigins) == 1 && c.AllowOrigins[0] == "*" {
        w.Header().Set("Access-Control-Allow-Origin", "*")
    }

    // 设置Access-Control-Allow-Methods
    requestMethod := r.Header.Get("Access-Control-Request-Method")
    if c.isMethodAllowed(requestMethod) {
        w.Header().Set("Access-Control-Allow-Methods", requestMethod)
    } else {
        w.Header().Set("Access-Control-Allow-Methods", strings.Join(c.AllowMethods, ", "))
    }

    // 设置Access-Control-Allow-Headers
    requestHeaders := r.Header.Get("Access-Control-Request-Headers")
    if requestHeaders != "" {
        allowedHeaders := c.getAllowedHeaders(requestHeaders)
        w.Header().Set("Access-Control-Allow-Headers", strings.Join(allowedHeaders, ", "))
    } else {
        w.Header().Set("Access-Control-Allow-Headers", strings.Join(c.AllowHeaders, ", "))
    }

    // 设置Access-Control-Allow-Credentials
    if c.AllowCredentials {
        w.Header().Set("Access-Control-Allow-Credentials", "true")
    }

    // 设置Access-Control-Max-Age
    if c.MaxAge > 0 {
        w.Header().Set("Access-Control-Max-Age", fmt.Sprintf("%d", c.MaxAge))
    }

    w.WriteHeader(http.StatusOK)
}

func (c *CORSConfig) handleActualRequest(w http.ResponseWriter, r *http.Request, origin string) {
    // 设置Access-Control-Allow-Origin
    if c.isOriginAllowed(origin) {
        w.Header().Set("Access-Control-Allow-Origin", origin)
    } else if len(c.AllowOrigins) == 1 && c.AllowOrigins[0] == "*" {
        w.Header().Set("Access-Control-Allow-Origin", "*")
    }

    // 设置Access-Control-Allow-Credentials
    if c.AllowCredentials {
        w.Header().Set("Access-Control-Allow-Credentials", "true")
    }

    // 设置Access-Control-Expose-Headers
    if len(c.ExposeHeaders) > 0 {
        w.Header().Set("Access-Control-Expose-Headers", strings.Join(c.ExposeHeaders, ", "))
    }
}

func (c *CORSConfig) isOriginAllowed(origin string) bool {
    for _, allowed := range c.AllowOrigins {
        if allowed == origin {
            return true
        }
        // 支持通配符子域名
        if strings.HasPrefix(allowed, "*.") {
            domain := allowed[2:]
            if strings.HasSuffix(origin, "."+domain) || origin == domain {
                return true
            }
        }
    }
    return false
}

func (c *CORSConfig) isMethodAllowed(method string) bool {
    for _, allowed := range c.AllowMethods {
        if allowed == method {
            return true
        }
    }
    return false
}

func (c *CORSConfig) getAllowedHeaders(requestHeaders string) []string {
    requested := strings.Split(requestHeaders, ",")
    var allowed []string

    for _, header := range requested {
        header = strings.TrimSpace(header)
        for _, allowedHeader := range c.AllowHeaders {
            if strings.EqualFold(header, allowedHeader) {
                allowed = append(allowed, allowedHeader)
                break
            }
        }
    }

    return allowed
}

// 动态CORS配置
type DynamicCORS struct {
    configs map[string]*CORSConfig
    mu     sync.RWMutex
}

func NewDynamicCORS() *DynamicCORS {
    return &DynamicCORS{
        configs: make(map[string]*CORSConfig),
    }
}

func (d *DynamicCORS) AddConfig(path string, config *CORSConfig) {
    d.mu.Lock()
    defer d.mu.Unlock()
    d.configs[path] = config
}

func (d *DynamicCORS) GetConfig(path string) *CORSConfig {
    d.mu.RLock()
    defer d.mu.RUnlock()
    return d.configs[path]
}

func (d *DynamicCORS) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        path := r.URL.Path
        config := d.GetConfig(path)

        if config == nil {
            // 使用默认配置
            config = NewCORSConfig()
        }

        config.Middleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
            next.ServeHTTP(writer, request)
        })).ServeHTTP(w, r)
    })
}
```

### 4.2 Cookie管理

```go
package main

import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "fmt"
    "net/http"
    "strconv"
    "strings"
    "time"
)

// 安全Cookie管理器
type SecureCookie struct {
    name       string
    secretKey  []byte
    block      cipher.Block
    maxAge     time.Duration
    httpOnly   bool
    secure     bool
    sameSite   http.SameSite
}

func NewSecureCookie(name string, secretKey string, maxAge time.Duration) (*SecureCookie, error) {
    key := sha256.Sum256([]byte(secretKey))
    block, err := aes.NewCipher(key[:])
    if err != nil {
        return nil, err
    }

    return &SecureCookie{
        name:      name,
        secretKey: key[:],
        block:     block,
        maxAge:    maxAge,
        httpOnly:  true,
        secure:    true,
        sameSite:  http.SameSiteLaxMode,
    }, nil
}

func (s *SecureCookie) SetValue(w http.ResponseWriter, value string) error {
    timestamp := strconv.FormatInt(time.Now().Unix(), 10)
    data := timestamp + ":" + value

    // 加密数据
    encrypted, err := s.encrypt(data)
    if err != nil {
        return err
    }

    cookie := &http.Cookie{
        Name:     s.name,
        Value:    encrypted,
        Path:     "/",
        MaxAge:   int(s.maxAge.Seconds()),
        HttpOnly: s.httpOnly,
        Secure:   s.secure,
        SameSite: s.sameSite,
    }

    http.SetCookie(w, cookie)
    return nil
}

func (s *SecureCookie) GetValue(r *http.Request) (string, error) {
    cookie, err := r.Cookie(s.name)
    if err != nil {
        return "", err
    }

    // 解密数据
    decrypted, err := s.decrypt(cookie.Value)
    if err != nil {
        return "", err
    }

    // 验证时间戳
    parts := strings.Split(decrypted, ":")
    if len(parts) != 2 {
        return "", fmt.Errorf("invalid cookie format")
    }

    timestamp, err := strconv.ParseInt(parts[0], 10, 64)
    if err != nil {
        return "", err
    }

    // 检查是否过期
    if time.Now().Sub(time.Unix(timestamp, 0)) > s.maxAge {
        return "", fmt.Errorf("cookie expired")
    }

    return parts[1], nil
}

func (s *SecureCookie) Clear(w http.ResponseWriter) {
    cookie := &http.Cookie{
        Name:     s.name,
        Value:    "",
        Path:     "/",
        MaxAge:   -1,
        HttpOnly: s.httpOnly,
        Secure:   s.secure,
        SameSite: s.sameSite,
    }
    http.SetCookie(w, cookie)
}

func (s *SecureCookie) encrypt(plaintext string) (string, error) {
    // 创建随机IV
    iv := make([]byte, s.block.BlockSize())
    if _, err := rand.Read(iv); err != nil {
        return "", err
    }

    // 创建加密器
    mode := cipher.NewCBCEncrypter(s.block, iv)

    // 填充数据
    padded := s.pad([]byte(plaintext))

    // 加密
    ciphertext := make([]byte, len(padded))
    mode.CryptBlocks(ciphertext, padded)

    // 组合IV和密文
    result := append(iv, ciphertext...)
    return base64.StdEncoding.EncodeToString(result), nil
}

func (s *SecureCookie) decrypt(encoded string) (string, error) {
    // 解码
    data, err := base64.StdEncoding.DecodeString(encoded)
    if err != nil {
        return "", err
    }

    // 提取IV
    iv := data[:s.block.BlockSize()]
    ciphertext := data[s.block.BlockSize():]

    // 创建解密器
    mode := cipher.NewCBCDecrypter(s.block, iv)

    // 解密
    plaintext := make([]byte, len(ciphertext))
    mode.CryptBlocks(plaintext, ciphertext)

    // 去除填充
    unpadded, err := s.unpad(plaintext)
    if err != nil {
        return "", err
    }

    return string(unpadded), nil
}

func (s *SecureCookie) pad(data []byte) []byte {
    padding := s.block.BlockSize() - len(data)%s.block.BlockSize()
    padded := make([]byte, len(data)+padding)
    copy(padded, data)
    for i := len(data); i < len(padded); i++ {
        padded[i] = byte(padding)
    }
    return padded
}

func (s *SecureCookie) unpad(data []byte) ([]byte, error) {
    if len(data) == 0 {
        return nil, fmt.Errorf("empty data")
    }

    padding := int(data[len(data)-1])
    if padding > len(data) || padding == 0 {
        return nil, fmt.Errorf("invalid padding")
    }

    for i := len(data) - padding; i < len(data); i++ {
        if int(data[i]) != padding {
            return nil, fmt.Errorf("invalid padding")
        }
    }

    return data[:len(data)-padding], nil
}

// Cookie会话管理器
type CookieSession struct {
    sessions map[string]*SessionData
    mu      sync.RWMutex
    maxAge  time.Duration
}

type SessionData struct {
    ID        string
    Data      map[string]interface{}
    CreatedAt time.Time
    LastSeen  time.Time
}

func NewCookieSession(maxAge time.Duration) *CookieSession {
    session := &CookieSession{
        sessions: make(map[string]*SessionData),
        maxAge:   maxAge,
    }

    // 启动清理协程
    go session.startCleanup()

    return session
}

func (s *CookieSession) StartSession(w http.ResponseWriter, r *http.Request) string {
    sessionID := s.generateSessionID()

    session := &SessionData{
        ID:        sessionID,
        Data:      make(map[string]interface{}),
        CreatedAt: time.Now(),
        LastSeen:  time.Now(),
    }

    s.mu.Lock()
    s.sessions[sessionID] = session
    s.mu.Unlock()

    // 设置会话Cookie
    cookie := &http.Cookie{
        Name:     "session_id",
        Value:    sessionID,
        Path:     "/",
        MaxAge:   int(s.maxAge.Seconds()),
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
    }

    http.SetCookie(w, cookie)
    return sessionID
}

func (s *CookieSession) GetSession(r *http.Request) (*SessionData, bool) {
    cookie, err := r.Cookie("session_id")
    if err != nil {
        return nil, false
    }

    s.mu.RLock()
    session, exists := s.sessions[cookie.Value]
    s.mu.RUnlock()

    if !exists {
        return nil, false
    }

    // 更新最后访问时间
    session.LastSeen = time.Now()

    return session, true
}

func (s *CookieSession) SetValue(sessionID, key string, value interface{}) {
    s.mu.Lock()
    defer s.mu.Unlock()

    if session, exists := s.sessions[sessionID]; exists {
        session.Data[key] = value
        session.LastSeen = time.Now()
    }
}

func (s *CookieSession) GetValue(sessionID, key string) (interface{}, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    if session, exists := s.sessions[sessionID]; exists {
        value, exists := session.Data[key]
        return value, exists
    }

    return nil, false
}

func (s *CookieSession) DeleteSession(sessionID string) {
    s.mu.Lock()
    defer s.mu.Unlock()

    delete(s.sessions, sessionID)
}

func (s *CookieSession) generateSessionID() string {
    b := make([]byte, 32)
    rand.Read(b)
    return base64.URLEncoding.EncodeToString(b)
}

func (s *CookieSession) startCleanup() {
    ticker := time.NewTicker(10 * time.Minute)
    defer ticker.Stop()

    for range ticker.C {
        now := time.Now()

        s.mu.Lock()
        for id, session := range s.sessions {
            if now.Sub(session.LastSeen) > s.maxAge {
                delete(s.sessions, id)
            }
        }
        s.mu.Unlock()
    }
}

// 会话中间件
func (s *CookieSession) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        session, exists := s.GetSession(r)

        if !exists {
            // 启动新会话
            sessionID := s.StartSession(w, r)
            session, _ = s.sessions[sessionID]
        }

        // 将会话添加到请求上下文
        ctx := r.Context()
        ctx = context.WithValue(ctx, "session", session)

        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

## 5. 实战应用案例

### 5.1 高性能HTTP服务器

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "runtime"
    "sync"
    "sync/atomic"
    "time"
)

// 高性能HTTP服务器
type HighPerformanceServer struct {
    server              *http.Server
    requestCount        uint64
    activeConnections   int64
    maxConnections      int64
    connectionTimeout   time.Duration
    requestTimeout      time.Duration
    mu                  sync.RWMutex
    rateLimiter         *RateLimiter
    healthChecker       *HealthChecker
}

type RateLimiter struct {
    mu           sync.Mutex
    requests     map[string][]time.Time
    maxRequests  int
    timeWindow   time.Duration
}

func NewRateLimiter(maxRequests int, timeWindow time.Duration) *RateLimiter {
    return &RateLimiter{
        requests:    make(map[string][]time.Time),
        maxRequests: maxRequests,
        timeWindow:  timeWindow,
    }
}

func (r *RateLimiter) AllowRequest(clientIP string) bool {
    r.mu.Lock()
    defer r.mu.Unlock()

    now := time.Now()
    requests := r.requests[clientIP]

    // 清理过期的请求记录
    validRequests := make([]time.Time, 0)
    for _, reqTime := range requests {
        if now.Sub(reqTime) <= r.timeWindow {
            validRequests = append(validRequests, reqTime)
        }
    }

    // 检查是否超出限制
    if len(validRequests) >= r.maxRequests {
        return false
    }

    // 记录新请求
    validRequests = append(validRequests, now)
    r.requests[clientIP] = validRequests

    return true
}

type HealthChecker struct {
    checks    map[string]HealthCheck
    mu        sync.RWMutex
    lastCheck time.Time
}

type HealthCheck struct {
    Name        string
    Endpoint    string
    Status      string
    LastSuccess time.Time
    ResponseTime time.Duration
}

func NewHealthChecker() *HealthChecker {
    hc := &HealthChecker{
        checks: make(map[string]HealthCheck),
    }

    // 添加默认健康检查
    hc.checks["memory"] = HealthCheck{
        Name:     "Memory Usage",
        Endpoint: "internal",
        Status:   "unknown",
    }

    go hc.startPeriodicChecks()
    return hc
}

func (hc *HealthChecker) startPeriodicChecks() {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        hc.performChecks()
    }
}

func (hc *HealthChecker) performChecks() {
    hc.mu.Lock()
    defer hc.mu.Unlock()

    // 检查内存使用
    var m runtime.MemStats
    runtime.ReadMemStats(&m)

    memoryCheck := hc.checks["memory"]
    memoryCheck.Status = "healthy"
    if m.Alloc > 500*1024*1024 { // 超过500MB
        memoryCheck.Status = "warning"
    }
    memoryCheck.LastSuccess = time.Now()
    hc.checks["memory"] = memoryCheck

    hc.lastCheck = time.Now()
}

func NewHighPerformanceServer(addr string, maxConnections int, connectionTimeout, requestTimeout time.Duration) *HighPerformanceServer {
    server := &http.Server{
        Addr:         addr,
        ReadTimeout:  requestTimeout,
        WriteTimeout: requestTimeout,
        IdleTimeout:  connectionTimeout,
        MaxHeaderBytes: 1 << 20, // 1MB
    }

    hpServer := &HighPerformanceServer{
        server:            server,
        maxConnections:   int64(maxConnections),
        connectionTimeout: connectionTimeout,
        requestTimeout:   requestTimeout,
        rateLimiter:      NewRateLimiter(100, time.Minute),
        healthChecker:    NewHealthChecker(),
    }

    return hpServer
}

func (hps *HighPerformanceServer) Start() error {
    // 设置处理器
    mux := http.NewServeMux()

    // API路由
    mux.HandleFunc("/api/", hps.handleAPI)
    mux.HandleFunc("/api/users", hps.handleUsers)
    mux.HandleFunc("/api/data", hps.handleData)

    // 健康检查
    mux.HandleFunc("/health", hps.handleHealth)
    mux.HandleFunc("/metrics", hps.handleMetrics)

    // 静态文件
    mux.Handle("/", http.FileServer(http.Dir("./static")))

    hps.server.Handler = mux

    // 启动服务器
    return hps.server.ListenAndServe()
}

func (hps *HighPerformanceServer) handleAPI(w http.ResponseWriter, r *http.Request) {
    // 限流检查
    clientIP := r.RemoteAddr
    if !hps.rateLimiter.AllowRequest(clientIP) {
        http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
        return
    }

    // 连接计数
    atomic.AddInt64(&hps.activeConnections, 1)
    defer atomic.AddInt64(&hps.activeConnections, -1)

    // 请求计数
    atomic.AddUint64(&hps.requestCount, 1)

    // 设置响应头
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("X-Request-ID", fmt.Sprintf("%d", atomic.LoadUint64(&hps.requestCount)))

    // 处理请求
    response := map[string]interface{}{
        "status":    "success",
        "timestamp": time.Now(),
        "request_id": atomic.LoadUint64(&hps.requestCount),
        "data":      "Hello from high-performance server",
    }

    json.NewEncoder(w).Encode(response)
}

func (hps *HighPerformanceServer) handleUsers(w http.ResponseWriter, r *http.Request) {
    // 用户数据处理
    users := []map[string]interface{}{
        {"id": 1, "name": "Alice", "email": "alice@example.com"},
        {"id": 2, "name": "Bob", "email": "bob@example.com"},
        {"id": 3, "name": "Charlie", "email": "charlie@example.com"},
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "users": users,
        "count":  len(users),
    })
}

func (hps *HighPerformanceServer) handleData(w http.ResponseWriter, r *http.Request) {
    // 数据处理
    data := make([]int, 1000000)
    for i := 0; i < len(data); i++ {
        data[i] = i * i
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "data_type": "large_array",
        "size":      len(data),
        "sample":    data[:10],
    })
}

func (hps *HighPerformanceServer) handleHealth(w http.ResponseWriter, r *http.Request) {
    hps.healthChecker.mu.RLock()
    checks := make(map[string]HealthCheck)
    for k, v := range hps.healthChecker.checks {
        checks[k] = v
    }
    hps.healthChecker.mu.RUnlock()

    status := "healthy"
    for _, check := range checks {
        if check.Status != "healthy" {
            status = "unhealthy"
            break
        }
    }

    response := map[string]interface{}{
        "status":          status,
        "timestamp":       time.Now(),
        "active_connections": atomic.LoadInt64(&hps.activeConnections),
        "total_requests":    atomic.LoadUint64(&hps.requestCount),
        "checks":           checks,
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(response)
}

func (hps *HighPerformanceServer) handleMetrics(w http.ResponseWriter, r *http.Request) {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)

    metrics := map[string]interface{}{
        "memory": map[string]uint64{
            "alloc":      m.Alloc,
            "sys":        m.Sys,
            "heap_alloc": m.HeapAlloc,
            "heap_sys":   m.HeapSys,
        },
        "connections": map[string]int64{
            "active": atomic.LoadInt64(&hps.activeConnections),
            "max":    hps.maxConnections,
        },
        "requests": map[string]uint64{
            "total": atomic.LoadUint64(&hps.requestCount),
        },
        "goroutines": runtime.NumGoroutine(),
        "timestamp":  time.Now(),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(metrics)
}

func (hps *HighPerformanceServer) Stop(ctx context.Context) error {
    return hps.server.Shutdown(ctx)
}
```

### 5.2 HTTP客户端库

```go
package main

import (
    "bytes"
    "compress/gzip"
    "encoding/json"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "net/url"
    "os"
    "path/filepath"
    "time"
)

// HTTP客户端库
type HTTPClient struct {
    client         *http.Client
    baseURL        string
    defaultHeaders map[string]string
    rateLimiter    *RateLimiter
    retryConfig    *RetryConfig
}

type RetryConfig struct {
    MaxRetries     int
    BackoffFactor  float64
    MaxBackoff     time.Duration
    StatusCodes    []int
}

type Request struct {
    Method        string
    URL           string
    Headers       map[string]string
    QueryParams   map[string]string
    Body          interface{}
    Timeout       time.Duration
    RetryConfig   *RetryConfig
}

type Response struct {
    StatusCode   int
    Headers      http.Header
    Body         []byte
    RequestTime  time.Duration
    ContentType  string
}

func NewHTTPClient(baseURL string, timeout time.Duration) *HTTPClient {
    return &HTTPClient{
        client: &http.Client{
            Timeout: timeout,
            Transport: &http.Transport{
                MaxIdleConnsPerHost: 10,
                IdleConnTimeout:     30 * time.Second,
            },
        },
        baseURL:        baseURL,
        defaultHeaders: make(map[string]string),
        rateLimiter:    NewRateLimiter(1000, time.Minute),
        retryConfig: &RetryConfig{
            MaxRetries:    3,
            BackoffFactor: 2.0,
            MaxBackoff:    30 * time.Second,
            StatusCodes:   []int{500, 502, 503, 504},
        },
    }
}

func (c *HTTPClient) SetDefaultHeader(key, value string) {
    c.defaultHeaders[key] = value
}

func (c *HTTPClient) SetBaseURL(baseURL string) {
    c.baseURL = baseURL
}

func (c *HTTPClient) GET(path string, params map[string]string) (*Response, error) {
    return c.Request(&Request{
        Method:      http.MethodGet,
        URL:         path,
        QueryParams: params,
    })
}

func (c *HTTPClient) POST(path string, body interface{}) (*Response, error) {
    return c.Request(&Request{
        Method: http.MethodPost,
        URL:    path,
        Body:   body,
    })
}

func (c *HTTPClient) PUT(path string, body interface{}) (*Response, error) {
    return c.Request(&Request{
        Method: http.MethodPut,
        URL:    path,
        Body:   body,
    })
}

func (c *HTTPClient) DELETE(path string) (*Response, error) {
    return c.Request(&Request{
        Method: http.MethodDelete,
        URL:    path,
    })
}

func (c *HTTPClient) UploadFile(path, fieldName, filePath string) (*Response, error) {
    file, err := os.Open(filePath)
    if err != nil {
        return nil, err
    }
    defer file.Close()

    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)

    fileWriter, err := writer.CreateFormFile(fieldName, filepath.Base(filePath))
    if err != nil {
        return nil, err
    }

    _, err = io.Copy(fileWriter, file)
    if err != nil {
        return nil, err
    }

    writer.Close()

    return c.Request(&Request{
        Method:  http.MethodPost,
        URL:     path,
        Body:    body,
        Headers: map[string]string{"Content-Type": writer.FormDataContentType()},
    })
}

func (c *HTTPClient) Request(req *Request) (*Response, error) {
    // 构建完整URL
    fullURL, err := url.JoinPath(c.baseURL, req.URL)
    if err != nil {
        return nil, err
    }

    // 添加查询参数
    if req.QueryParams != nil {
        query := url.Values{}
        for key, value := range req.QueryParams {
            query.Set(key, value)
        }
        if existingQuery := strings.Split(fullURL, "?"); len(existingQuery) > 1 {
            existingValues, _ := url.ParseQuery(existingQuery[1])
            for key, values := range existingValues {
                for _, value := range values {
                    query.Add(key, value)
                }
            }
        }
        fullURL = existingQuery[0] + "?" + query.Encode()
    }

    // 限流检查
    if !c.rateLimiter.AllowRequest("client") {
        return nil, fmt.Errorf("rate limit exceeded")
    }

    // 创建HTTP请求
    var httpReq *http.Request
    var err error

    if req.Body != nil {
        if bodyBytes, ok := req.Body.([]byte); ok {
            httpReq, err = http.NewRequest(req.Method, fullURL, bytes.NewReader(bodyBytes))
        } else if reader, ok := req.Body.(io.Reader); ok {
            httpReq, err = http.NewRequest(req.Method, fullURL, reader)
        } else {
            bodyBytes, err := json.Marshal(req.Body)
            if err != nil {
                return nil, err
            }
            httpReq, err = http.NewRequest(req.Method, fullURL, bytes.NewReader(bodyBytes))
            if err == nil {
                httpReq.Header.Set("Content-Type", "application/json")
            }
        }
    } else {
        httpReq, err = http.NewRequest(req.Method, fullURL, nil)
    }

    if err != nil {
        return nil, err
    }

    // 设置默认头部
    for key, value := range c.defaultHeaders {
        httpReq.Header.Set(key, value)
    }

    // 设置请求头部
    for key, value := range req.Headers {
        httpReq.Header.Set(key, value)
    }

    // 设置超时
    timeout := req.Timeout
    if timeout == 0 {
        timeout = 30 * time.Second
    }

    // 重试逻辑
    retryConfig := req.RetryConfig
    if retryConfig == nil {
        retryConfig = c.retryConfig
    }

    startTime := time.Now()

    for attempt := 0; attempt <= retryConfig.MaxRetries; attempt++ {
        // 创建带超时的客户端
        client := &http.Client{
            Timeout: timeout,
            Transport: c.client.Transport,
        }

        // 发送请求
        resp, err := client.Do(httpReq)
        responseTime := time.Since(startTime)

        if err == nil {
            // 读取响应体
            body, err := io.ReadAll(resp.Body)
            if err != nil {
                resp.Body.Close()
                return nil, err
            }
            resp.Body.Close()

            // 检查是否需要重试
            if attempt < retryConfig.MaxRetries && containsInt(retryConfig.StatusCodes, resp.StatusCode) {
                // 计算退避延迟
                delay := time.Duration(float64(time.Second) *
                    (retryConfig.BackoffFactor * float64(attempt)))
                if delay > retryConfig.MaxBackoff {
                    delay = retryConfig.MaxBackoff
                }

                time.Sleep(delay)
                continue
            }

            return &Response{
                StatusCode:  resp.StatusCode,
                Headers:     resp.Header,
                Body:        body,
                RequestTime: responseTime,
                ContentType: resp.Header.Get("Content-Type"),
            }, nil
        }

        // 网络错误，检查是否需要重试
        if attempt < retryConfig.MaxRetries && isRetryableError(err) {
            delay := time.Duration(float64(time.Second) *
                (retryConfig.BackoffFactor * float64(attempt)))
            if delay > retryConfig.MaxBackoff {
                delay = retryConfig.MaxBackoff
            }

            time.Sleep(delay)
            continue
        }

        return nil, err
    }

    return nil, fmt.Errorf("max retries exceeded")
}

func containsInt(slice []int, item int) bool {
    for _, s := range slice {
        if s == item {
            return true
        }
    }
    return false
}

func isRetryableError(err error) bool {
    if err == io.EOF {
        return true
    }
    if netErr, ok := err.(net.Error); ok {
        return netErr.Timeout() || netErr.Temporary()
    }
    return false
}

// 使用示例
func main() {
    client := NewHTTPClient("https://httpbin.org", 30*time.Second)

    // GET请求示例
    resp, err := client.GET("/get", map[string]string{
        "param1": "value1",
        "param2": "value2",
    })
    if err != nil {
        fmt.Printf("GET request failed: %v\n", err)
    } else {
        fmt.Printf("GET response: %s\n", string(resp.Body))
    }

    // POST请求示例
    postData := map[string]interface{}{
        "name":     "John Doe",
        "email":    "john@example.com",
        "age":      30,
    }

    resp, err = client.POST("/post", postData)
    if err != nil {
        fmt.Printf("POST request failed: %v\n", err)
    } else {
        fmt.Printf("POST response: %s\n", string(resp.Body))
    }

    // 文件上传示例
    resp, err = client.UploadFile("/post", "file", "example.txt")
    if err != nil {
        fmt.Printf("Upload failed: %v\n", err)
    } else {
        fmt.Printf("Upload response: %s\n", string(resp.Body))
    }
}
```

## 6. 性能监控与调优

### 6.1 HTTP性能监控

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "sync"
    "time"
)

// HTTP性能监控器
type HTTPMonitor struct {
    mu             sync.RWMutex
    metrics        *MetricsCollector
    alertManager   *AlertManager
    config         *MonitorConfig
}

type MetricsCollector struct {
    totalRequests    uint64
    successfulReqs  uint64
    failedReqs      uint64
    totalLatency    time.Duration
    minLatency      time.Duration
    maxLatency      time.Duration
    avgLatency      time.Duration
    requestsPerSec  float64
    errorsPerSec    float64
    activeRequests  int64
    responseTimes   []time.Duration
    statusCodes     map[int]uint64
    mu              sync.RWMutex
}

type AlertManager struct {
    alerts    map[string]*Alert
    handlers  map[string]AlertHandler
    mu        sync.RWMutex
}

type Alert struct {
    ID          string
    Name        string
    Condition   string
    Threshold   float64
    Current     float64
    Status      string
    LastTriggered time.Time
}

type AlertHandler interface {
    Handle(alert *Alert)
}

type EmailAlertHandler struct {
    emailConfig EmailConfig
}

type MonitorConfig struct {
    ResponseTimeThreshold time.Duration
    ErrorRateThreshold    float64
    ThroughputThreshold  float64
    AlertCheckInterval    time.Duration
}

func NewHTTPMonitor(config *MonitorConfig) *HTTPMonitor {
    monitor := &HTTPMonitor{
        metrics:      &MetricsCollector{
            minLatency:  time.Hour, // 初始化为最大值
            maxLatency:  0,
            responseTimes: make([]time.Duration, 0, 1000),
            statusCodes: make(map[int]uint64),
        },
        alertManager: &AlertManager{
            alerts:   make(map[string]*Alert),
            handlers: make(map[string]AlertHandler),
        },
        config: config,
    }

    // 添加默认告警
    monitor.AddAlert("high_response_time", "Response time too high",
        config.ResponseTimeThreshold, 0)
    monitor.AddAlert("high_error_rate", "Error rate too high",
        config.ErrorRateThreshold, 1)
    monitor.AddAlert("low_throughput", "Throughput too low",
        config.ThroughputThreshold, 2)

    return monitor
}

func (m *HTTPMonitor) RecordRequest(statusCode int, latency time.Duration) {
    m.metrics.mu.Lock()
    defer m.metrics.mu.Unlock()

    // 更新请求计数
    m.metrics.totalRequests++
    m.metrics.activeRequests++

    // 更新状态码统计
    m.metrics.statusCodes[statusCode]++

    // 更新成功/失败请求
    if statusCode >= 200 && statusCode < 400 {
        m.metrics.successfulReqs++
    } else {
        m.metrics.failedReqs++
    }

    // 更新延迟统计
    m.metrics.totalLatency += latency
    if m.metrics.avgLatency == 0 {
        m.metrics.avgLatency = latency
    } else {
        m.metrics.avgLatency = (m.metrics.avgLatency + latency) / 2
    }

    if latency < m.metrics.minLatency {
        m.metrics.minLatency = latency
    }
    if latency > m.metrics.maxLatency {
        m.metrics.maxLatency = latency
    }

    // 保持响应时间数组在合理大小
    if len(m.metrics.responseTimes) >= 1000 {
        m.metrics.responseTimes = m.metrics.responseTimes[1:]
    }
    m.metrics.responseTimes = append(m.metrics.responseTimes, latency)

    // 计算每秒请求数
    m.updateRateCalculations()

    // 检查告警条件
    m.checkAlerts()
}

func (m *HTTPMonitor) RecordRequestEnd() {
    m.metrics.mu.Lock()
    defer m.metrics.mu.Unlock()
    m.metrics.activeRequests--
}

func (m *HTTPMonitor) GetMetrics() *Metrics {
    m.metrics.mu.RLock()
    defer m.metrics.mu.RUnlock()

    return &Metrics{
        TotalRequests:     m.metrics.totalRequests,
        SuccessfulReqs:    m.metrics.successfulReqs,
        FailedReqs:        m.metrics.failedReqs,
        AvgLatency:        m.metrics.avgLatency,
        MinLatency:        m.metrics.minLatency,
        MaxLatency:        m.metrics.maxLatency,
        RequestsPerSec:    m.metrics.requestsPerSec,
        ErrorsPerSec:      m.metrics.errorsPerSec,
        ActiveRequests:    m.metrics.activeRequests,
        StatusCodes:       m.metrics.statusCodes,
        SuccessRate:       m.calculateSuccessRate(),
        ErrorRate:         m.calculateErrorRate(),
    }
}

func (m *HTTPMonitor) AddAlert(name, condition string, threshold float64, alertType int) {
    alert := &Alert{
        ID:        fmt.Sprintf("alert_%d", time.Now().UnixNano()),
        Name:      name,
        Condition: condition,
        Threshold: threshold,
        Status:    "normal",
    }

    m.alertManager.mu.Lock()
    defer m.alertManager.mu.Unlock()
    m.alertManager.alerts[name] = alert
}

func (m *HTTPMonitor) checkAlerts() {
    metrics := m.GetMetrics()

    m.alertManager.mu.Lock()
    defer m.alertManager.mu.Unlock()

    for name, alert := range m.alertManager.alerts {
        var current float64

        switch alert.Condition {
        case "response_time":
            current = metrics.AvgLatency.Seconds()
        case "error_rate":
            current = metrics.ErrorRate
        case "throughput":
            current = metrics.RequestsPerSec
        }

        alert.Current = current

        // 检查是否触发告警
        if (alert.Condition == "response_time" || alert.Condition == "error_rate") &&
           current > alert.Threshold {
            if alert.Status != "triggered" {
                alert.Status = "triggered"
                alert.LastTriggered = time.Now()
                m.triggerAlert(alert)
            }
        } else if alert.Condition == "throughput" && current < alert.Threshold {
            if alert.Status != "triggered" {
                alert.Status = "triggered"
                alert.LastTriggered = time.Now()
                m.triggerAlert(alert)
            }
        } else {
            alert.Status = "normal"
        }
    }
}

func (m *HTTPMonitor) triggerAlert(alert *Alert) {
    fmt.Printf("ALERT TRIGGERED: %s - Current: %.2f, Threshold: %.2f\n",
        alert.Name, alert.Current, alert.Threshold)

    // 这里可以集成邮件、短信、Slack等通知方式
    if handler, exists := m.alertManager.handlers[alert.Name]; exists {
        handler.Handle(alert)
    }
}

func (m *HTTPMonitor) updateRateCalculations() {
    // 简化的速率计算，实际应用中使用更精确的滑动窗口
    now := time.Now()

    // 计算每分钟的请求速率
    requestsInLastMinute := 0
    errorsInLastMinute := 0

    for _, duration := range m.metrics.responseTimes {
        if now.Sub(m.metrics.totalLatency - duration) <= time.Minute {
            requestsInLastMinute++
            if m.metrics.failedReqs > 0 {
                errorsInLastMinute++
            }
        }
    }

    m.metrics.requestsPerSec = float64(requestsInLastMinute) / 60
    m.metrics.errorsPerSec = float64(errorsInLastMinute) / 60
}

func (m *MetricsCollector) calculateSuccessRate() float64 {
    if m.totalRequests == 0 {
        return 0
    }
    return float64(m.successfulReqs) / float64(m.totalRequests) * 100
}

func (m *MetricsCollector) calculateErrorRate() float64 {
    if m.totalRequests == 0 {
        return 0
    }
    return float64(m.failedReqs) / float64(m.totalRequests) * 100
}

// 性能监控中间件
func (m *HTTPMonitor) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        startTime := time.Now()

        // 记录请求开始
        m.RecordRequest(200, 0) // 临时状态码

        // 包装响应写入器以捕获状态码
        rw := &ResponseWriter{
            ResponseWriter: w,
            statusCode:     200,
        }

        next.ServeHTTP(rw, r)

        // 记录请求结束
        m.RecordRequestEnd()

        // 记录实际响应时间和状态码
        latency := time.Since(startTime)
        m.RecordRequest(rw.statusCode, latency)

        // 记录响应头
        rw.Header().Set("X-Response-Time", latency.String())
    })
}

type ResponseWriter struct {
    http.ResponseWriter
    statusCode int
}

func (rw *ResponseWriter) WriteHeader(code int) {
    rw.statusCode = code
    rw.ResponseWriter.WriteHeader(code)
}

func (rw *ResponseWriter) Write(b []byte) (int, error) {
    if rw.statusCode == 0 {
        rw.statusCode = 200
    }
    return rw.ResponseWriter.Write(b)
}

// 指标导出
func (m *HTTPMonitor) ExportMetrics(w http.ResponseWriter, r *http.Request) {
    metrics := m.GetMetrics()

    // Prometheus格式导出
    w.Header().Set("Content-Type", "text/plain")

    fmt.Fprintf(w, "# HELP http_requests_total Total number of HTTP requests\n")
    fmt.Fprintf(w, "# TYPE http_requests_total counter\n")
    fmt.Fprintf(w, "http_requests_total %d\n", metrics.TotalRequests)

    fmt.Fprintf(w, "# HELP http_request_duration_seconds HTTP request duration\n")
    fmt.Fprintf(w, "# TYPE http_request_duration_seconds histogram\n")
    fmt.Fprintf(w, "http_request_duration_seconds_sum %f\n", metrics.AvgLatency.Seconds())
    fmt.Fprintf(w, "http_request_duration_seconds_count %d\n", metrics.TotalRequests)

    fmt.Fprintf(w, "# HELP http_requests_in_flight Current number of HTTP requests being processed\n")
    fmt.Fprintf(w, "# TYPE http_requests_in_flight gauge\n")
    fmt.Fprintf(w, "http_requests_in_flight %d\n", metrics.ActiveRequests)
}
```

### 6.2 连接池优化

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
    "time"
)

// 连接池优化器
type ConnectionPoolOptimizer struct {
    pools        map[string]*OptimizedPool
    mu           sync.RWMutex
    config       *PoolConfig
    monitor      *HTTPMonitor
}

type OptimizedPool struct {
    http.Transport
    mu            sync.RWMutex
    idleConns     map[string]*http.Conn
    activeConns   map[string]*http.Conn
    totalConns    int64
    maxIdleConns  int
    maxActiveConns int
    connTimeout   time.Duration
    idleTimeout   time.Duration
    lastCleanup   time.Time
    stats         PoolStats
}

type PoolStats struct {
    TotalConnections  int64
    IdleConnections   int64
    ActiveConnections int64
    ConnectionsCreated int64
    ConnectionsReused  int64
    AvgWaitTime       time.Duration
}

type PoolConfig struct {
    MaxIdleConnsPerHost int
    MaxActiveConns      int
    ConnTimeout         time.Duration
    IdleTimeout         time.Duration
    CleanupInterval     time.Duration
}

func NewConnectionPoolOptimizer(config *PoolConfig, monitor *HTTPMonitor) *ConnectionPoolOptimizer {
    optimizer := &ConnectionPoolOptimizer{
        pools:   make(map[string]*OptimizedPool),
        config:  config,
        monitor: monitor,
    }

    // 启动定期优化
    go optimizer.startOptimization()

    return optimizer
}

func (cpo *ConnectionPoolOptimizer) GetPool(host string) *OptimizedPool {
    cpo.mu.Lock()
    defer cpo.mu.Unlock()

    pool, exists := cpo.pools[host]
    if !exists {
        pool = cpo.createPool(host)
        cpo.pools[host] = pool
    }

    return pool
}

func (cpo *ConnectionPoolOptimizer) createPool(host string) *OptimizedPool {
    pool := &OptimizedPool{
        Transport: http.Transport{
            MaxIdleConnsPerHost: cpo.config.MaxIdleConnsPerHost,
            MaxIdleConns:        cpo.config.MaxIdleConnsPerHost * 2,
            IdleConnTimeout:     cpo.config.IdleTimeout,
            DisableCompression:  false,
        },
        idleConns:      make(map[string]*http.Conn),
        activeConns:    make(map[string]*http.Conn),
        maxIdleConns:   cpo.config.MaxIdleConnsPerHost,
        maxActiveConns: cpo.config.MaxActiveConns,
        connTimeout:    cpo.config.ConnTimeout,
        idleTimeout:   cpo.config.IdleTimeout,
        lastCleanup:   time.Now(),
    }

    return pool
}

func (op *OptimizedPool) GetConnection() (*http.Conn, error) {
    op.mu.Lock()
    defer op.mu.Unlock()

    // 检查是否有可用的空闲连接
    if len(op.idleConns) > 0 {
        // 选择最老的连接（简单的LRU）
        var oldestKey string
        var oldestTime time.Time

        for key, conn := range op.idleConns {
            if oldestTime.IsZero() || conn.ConnTime().Before(oldestTime) {
                oldestTime = conn.ConnTime()
                oldestKey = key
            }
        }

        conn := op.idleConns[oldestKey]
        delete(op.idleConns, oldestKey)

        // 检查连接是否仍然有效
        if !op.isConnectionValid(conn) {
            conn.Close()
            op.totalConns--
            return op.GetConnection() // 递归重试
        }

        op.activeConns[oldestKey] = conn
        op.stats.ConnectionsReused++

        return conn, nil
    }

    // 创建新连接
    if op.totalConns < int64(op.maxActiveConns) {
        // 这里需要实际的连接创建逻辑
        // 由于标准库限制，这里只是示例
        op.totalConns++
        op.stats.ConnectionsCreated++
    } else {
        // 连接池已满，等待或返回错误
        return nil, fmt.Errorf("connection pool exhausted")
    }

    return nil, nil // 返回新连接的占位符
}

func (op *OptimizedPool) ReturnConnection(conn *http.Conn) {
    op.mu.Lock()
    defer op.mu.Unlock()

    // 从活动连接中移除
    connKey := fmt.Sprintf("%p", conn)
    delete(op.activeConns, connKey)

    // 检查是否应该保留空闲连接
    if len(op.idleConns) < op.maxIdleConns && op.isConnectionValid(conn) {
        op.idleConns[connKey] = conn
    } else {
        conn.Close()
        op.totalConns--
    }

    // 更新统计信息
    op.stats.IdleConnections = int64(len(op.idleConns))
    op.stats.ActiveConnections = int64(len(op.activeConns))
    op.stats.TotalConnections = op.totalConns
}

func (op *OptimizedPool) isConnectionValid(conn *http.Conn) bool {
    // 检查连接是否过期
    if time.Since(conn.ConnTime()) > op.idleTimeout {
        return false
    }

    // 这里可以添加更多连接有效性检查
    // 例如：检查连接是否仍然开放

    return true
}

func (op *OptimizedPool) Cleanup() {
    op.mu.Lock()
    defer op.mu.Unlock()

    now := time.Now()

    // 清理过期的空闲连接
    for key, conn := range op.idleConns {
        if now.Sub(conn.ConnTime()) > op.idleTimeout {
            delete(op.idleConns, key)
            conn.Close()
            op.totalConns--
        }
    }

    op.lastCleanup = now
    op.stats.IdleConnections = int64(len(op.idleConns))
    op.stats.ActiveConnections = int64(len(op.activeConns))
    op.stats.TotalConnections = op.totalConns
}

func (cpo *ConnectionPoolOptimizer) startOptimization() {
    ticker := time.NewTicker(cpo.config.CleanupInterval)
    defer ticker.Stop()

    for range ticker.C {
        cpo.optimizePools()
    }
}

func (cpo *ConnectionPoolOptimizer) optimizePools() {
    cpo.mu.RLock()
    pools := make([]*OptimizedPool, 0, len(cpo.pools))
    for _, pool := range cpo.pools {
        pools = append(pools, pool)
    }
    cpo.mu.RUnlock()

    for _, pool := range pools {
        pool.Cleanup()

        // 根据使用情况调整连接池大小
        stats := pool.GetStats()
        if stats.IdleConnections > stats.ActiveConnections*2 {
            // 空闲连接过多，可以减少
            pool.mu.Lock()
            pool.maxIdleConns = int(float64(pool.maxIdleConns) * 0.8)
            pool.mu.Unlock()
        } else if stats.ActiveConnections > stats.IdleConnections {
            // 活动连接较多，可以增加
            pool.mu.Lock()
            pool.maxIdleConns = int(float64(pool.maxIdleConns) * 1.2)
            pool.mu.Unlock()
        }
    }
}

func (op *OptimizedPool) GetStats() PoolStats {
    op.mu.RLock()
    defer op.mu.RUnlock()

    return PoolStats{
        TotalConnections:  op.totalConns,
        IdleConnections:   int64(len(op.idleConns)),
        ActiveConnections: int64(len(op.activeConns)),
        ConnectionsCreated: op.stats.ConnectionsCreated,
        ConnectionsReused:  op.stats.ConnectionsReused,
        AvgWaitTime:        op.stats.AvgWaitTime,
    }
}

// 连接适配器（模拟HTTP连接）
type Conn struct {
    net.Conn
    createdTime time.Time
}

func (c *Conn) ConnTime() time.Time {
    return c.createdTime
}

// 性能调优工具
type PerformanceTuner struct {
    monitor       *HTTPMonitor
    poolOptimizer *ConnectionPoolOptimizer
    currentConfig *TuningConfig
    tuningHistory []TuningRecord
}

type TuningConfig struct {
    MaxConnections        int
    ConnectionTimeout    time.Duration
    ReadTimeout          time.Duration
    WriteTimeout         time.Duration
    IdleTimeout          time.Duration
    KeepAlive            bool
    MaxIdleConnections    int
}

type TuningRecord struct {
    Timestamp    time.Time
    Config       TuningConfig
    Metrics      Metrics
    Performance  float64
}

func NewPerformanceTuner(initialConfig *TuningConfig, monitor *HTTPMonitor, optimizer *ConnectionPoolOptimizer) *PerformanceTuner {
    return &PerformanceTuner{
        monitor:        monitor,
        poolOptimizer:   optimizer,
        currentConfig:   initialConfig,
        tuningHistory:  make([]TuningRecord, 0),
    }
}

func (pt *PerformanceTuner) AutoTune() {
    currentMetrics := pt.monitor.GetMetrics()
    currentPerformance := pt.calculatePerformanceScore(currentMetrics)

    // 简化的调优逻辑
    newConfig := *pt.currentConfig

    if currentMetrics.AvgLatency > pt.currentConfig.ReadTimeout/2 {
        // 延迟过高，增加连接池大小
        newConfig.MaxIdleConnections = int(float64(newConfig.MaxIdleConnections) * 1.2)
        newConfig.MaxConnections = int(float64(newConfig.MaxConnections) * 1.1)
    } else if currentMetrics.RequestsPerSec < 100 {
        // 吞吐量较低，减少连接数
        newConfig.MaxIdleConnections = int(float64(newConfig.MaxIdleConnections) * 0.8)
        newConfig.MaxConnections = int(float64(newConfig.MaxConnections) * 0.9)
    }

    // 记录调优历史
    record := TuningRecord{
        Timestamp:    time.Now(),
        Config:       newConfig,
        Metrics:      *currentMetrics,
        Performance:  currentPerformance,
    }

    pt.tuningHistory = append(pt.tuningHistory, record)

    // 应用新配置
    pt.ApplyConfig(&newConfig)
    pt.currentConfig = &newConfig
}

func (pt *PerformanceTuner) calculatePerformanceScore(metrics *Metrics) float64 {
    // 综合性能评分算法
    latencyScore := 1.0 / (1.0 + metrics.AvgLatency.Seconds())
    throughputScore := metrics.RequestsPerSec / 100.0
    successScore := metrics.SuccessRate / 100.0

    return (latencyScore + throughputScore + successScore) / 3.0
}

func (pt *PerformanceTuner) ApplyConfig(config *TuningConfig) {
    // 应用新的连接池配置
    // 这里应该根据实际需求更新HTTP客户端和服务器配置
    fmt.Printf("Applied new tuning config: MaxConnections=%d, IdleTimeout=%v\n",
        config.MaxConnections, config.IdleTimeout)
}

func (pt *PerformanceTuner) GetTuningHistory() []TuningRecord {
    return pt.tuningHistory
}
```

## 总结

本章深入探讨了HTTP协议的进阶特性，包括：

1. **连接管理**：Keep-Alive机制、HTTP/2多路复用、连接健康监控
2. **认证机制**：Basic、Digest、OAuth2、JWT等认证方式的实现和应用
3. **传输优化**：压缩机制、内容协商、缓存策略
4. **跨域安全**：CORS配置、Cookie管理、安全会话
5. **实战应用**：高性能服务器、HTTP客户端库、性能监控

这些技术在实际项目中至关重要，能够显著提升Web应用的性能、安全性和可维护性。通过Go语言的实现示例，读者可以更好地理解和应用这些概念。

## 权威资源

### RFC文档

- RFC 9110: HTTP Semantics
- RFC 9111: HTTP Caching
- RFC 6455: The WebSocket Protocol
- RFC 6749: OAuth 2.0 Authorization Framework
- RFC 7519: JSON Web Token (JWT)

### 性能优化

- [Google Web Performance Best Practices](https://developers.google.com/web/fundamentals/performance)
- [Mozilla HTTP Archive](https://httparchive.org/)
- [WebPageTest](https://www.webpagetest.org/)

### Go语言HTTP库

- [Go HTTP Package Documentation](https://golang.org/pkg/net/http/)
- [Gorilla WebSocket Toolkit](https://github.com/gorilla/websocket)
- [Go OAuth2 Library](https://github.com/golang/oauth2)

### 监控和调试

- [Prometheus HTTP Metrics](https://prometheus.io/docs/instrumenting/http/)
- [Chrome DevTools Network Panel](https://developers.google.com/web/tools/chrome-devtools/network)
- [Wireshark Protocol Analysis](https://www.wireshark.org/)

---

_本章为HTTP协议进阶特性的完整指南，通过理论讲解和实践示例，帮助开发者掌握现代Web开发中的核心技术。_
