# 第6章：权限系统核心功能实现——从认证到数据权限的全链路落地

你有没有遇到过这种情况——需求文档上写着"用户分为管理员、运营、客服三种角色，不同角色看到不同页面"，你心想这还不简单，加几个 if 判断的事儿。三天后需求变了："运营内部要分初级运营和高级运营，高级运营能调价，初级只能改库存。"你忍了，又改了一版。一周后需求又变了："要支持临时角色，双11期间给一批人开放特殊权限，活动结束自动回收。"你看着自己写的六层 if-else，陷入了沉思。

更扎心的是，你发现这套 if-else 逻辑不仅在 Controller 层有，Service 层也有，甚至连 DAO 层都渗透了。代码审查的时候，同事问你"这个权限判断为什么在三个地方写了三遍而且逻辑还不一样"，你只能苦笑。技术债就像信用卡账单，越滚越多，最后你想还都还不起。

权限系统的核心功能实现，是把上一章设计好的模型变成可运行的代码。听起来直白，做起来全是坑。认证机制怎么选？Session 存哪里、JWT 怎么撤销？角色权限的 CRUD 怎么设计才不返工？资源授权引擎怎么写才能既灵活又高性能？数据权限过滤怎么做到对业务代码零侵入？权限校验中间件怎么集成到 Web 框架才能不侵入业务代码？这些问题，每一个都值得单独开一个技术专题，每一个都有无数团队在上面栽过跟头。

我是怕浪猫，一个在权限系统泥潭里摸爬滚打了多年的 Go 后端工程师。从最早把 Session 存在内存里导致重启全员掉线，到后来用 JWT 遇到 token 撤销难题整整 debug 了两天，再到设计了一套支持百万级资源的授权引擎被技术评审拍桌子通过，踩过的坑够绕地球一圈。这一章，我把权限系统核心功能的实现细节全部摊开，从认证到授权，从接口到数据，每一行代码都经过生产环境的检验，每一个设计决策都会告诉你为什么这么选。

> 权限系统的代码量不大，但每一行都关乎安全。写错一个条件，可能就是一次数据泄露事故。写漏一个边界，可能就是一次越权访问。

---

## 一、认证机制实现

认证是权限系统的入口，是整个系统信任链的起点。没有认证，谈授权就是空中楼阁——你都不知道对面是谁，凭什么让他访问？主流的认证方案有三种：Session、JWT、OAuth2。它们不是互斥的，而是各自适用不同场景。选错了方案，后期的技术债会像滚雪球一样越来越大，大到你想推翻重来的成本都承受不起。

### 1.1 Session 认证：最经典也最容易被低估的方案

Session 认证的核心思路很简单：用户登录后，服务端创建一个 Session 对象，把 Session ID 通过 Cookie 返回给客户端。后续请求中客户端带上 Cookie，服务端通过 Session ID 找到对应用户信息。

听起来没技术含量对吧？很多开发者觉得 Session 是"老古董"，一上来就用 JWT。但在传统的 Web 应用中，Session 依然是最安全、最可控的认证方案。它最大的优势是可撤销——服务端随时可以让一个 Session 失效，这在安全审计和紧急封禁场景下非常关键。JWT 做不到这一点，至少做不到优雅地做到这一点。

但在分布式环境下，Session 的坑能让你 debug 到怀疑人生。最经典的问题就是 Session 不一致：用户在节点 A 登录了，下次请求被负载均衡到了节点 B，节点 B 没有这个用户的 Session，于是用户被踢下线。

先看最基础的实现：

```go
package auth

import (
    "crypto/rand"
    "encoding/hex"
    "errors"
    "fmt"
    "net/http"
    "time"
    
    "github.com/gin-gonic/gin"
    "github.com/redis/go-redis/v9"
)

// ErrSessionNotFound 会话不存在
var ErrSessionNotFound = errors.New("session not found")

// ErrSessionIPMismatch 会话 IP 不匹配
var ErrSessionIPMismatch = errors.New("session ip mismatch")

type SessionManager struct {
    redis  *redis.Client
    prefix string
    ttl    time.Duration
}

func NewSessionManager(rdb *redis.Client) *SessionManager {
    return &SessionManager{
        redis:  rdb,
        prefix: "session:",
        ttl:    24 * time.Hour,
    }
}

// SessionData 存储在 Redis 中的会话数据
type SessionData struct {
    UserID    int64     `json:"user_id"`
    Username  string    `json:"username"`
    RoleIDs   []int64   `json:"role_ids"`
    TenantID  int64     `json:"tenant_id"`
    DeptID    int64     `json:"dept_id"`
    LoginAt   time.Time `json:"login_at"`
    ClientIP  string    `json:"client_ip"`
    UserAgent string    `json:"user_agent"`
}

// CreateSession 用户登录成功后创建会话
func (sm *SessionManager) CreateSession(c *gin.Context, data *SessionData) (string, error) {
    sessionID := sm.generateSessionID()
    
    // 记录登录时间和客户端信息
    data.LoginAt = time.Now()
    data.ClientIP = c.ClientIP()
    data.UserAgent = c.Request.UserAgent()
    
    // 序列化存储到 Redis
    key := sm.prefix + sessionID
    err := sm.redis.Set(c, key, data, sm.ttl).Err()
    if err != nil {
        return "", fmt.Errorf("create session failed: %w", err)
    }
    
    // 同时建立用户 -> Session 的索引，用于查询用户的所有活跃 Session
    userKey := fmt.Sprintf("%suser:%d", sm.prefix, data.UserID)
    sm.redis.SAdd(c, userKey, sessionID)
    sm.redis.Expire(c, userKey, sm.ttl)
    
    // 设置 Cookie
    c.SetSameSite(http.SameSiteLaxMode)
    c.SetCookie("session_id", sessionID, int(sm.ttl.Seconds()), "/", "", false, true)
    
    return sessionID, nil
}

// GetSession 从 Redis 获取会话信息
func (sm *SessionManager) GetSession(c *gin.Context) (*SessionData, error) {
    sessionID, err := c.Cookie("session_id")
    if err != nil {
        return nil, ErrSessionNotFound
    }
    
    var data SessionData
    key := sm.prefix + sessionID
    err = sm.redis.Get(c, key).Scan(&data)
    if err == redis.Nil {
        return nil, ErrSessionNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("get session failed: %w", err)
    }
    
    // 安全检查：IP 变化检测
    currentIP := c.ClientIP()
    if data.ClientIP != currentIP {
        // IP 变化可能是 Session 劫持
        // 在移动网络场景下可以考虑只检测大段变化（前三段）
        // 生产环境建议做成可配置策略
        return nil, ErrSessionIPMismatch
    }
    
    // 续期：活跃用户自动延长 Session 有效期
    sm.redis.Expire(c, key, sm.ttl)
    
    return &data, nil
}

// DestroySession 用户登出时销毁会话
func (sm *SessionManager) DestroySession(c *gin.Context) error {
    sessionID, err := c.Cookie("session_id")
    if err != nil {
        return nil // 没有 Session 直接返回成功
    }
    
    // 先获取 Session 数据，用于清理用户索引
    var data SessionData
    key := sm.prefix + sessionID
    err = sm.redis.Get(c, key).Scan(&data)
    if err == nil {
        // 清理用户 -> Session 索引
        userKey := fmt.Sprintf("%suser:%d", sm.prefix, data.UserID)
        sm.redis.SRem(c, userKey, sessionID)
    }
    
    // 删除 Session
    err = sm.redis.Del(c, key).Err()
    if err != nil {
        return fmt.Errorf("destroy session failed: %w", err)
    }
    
    // 清除 Cookie
    c.SetCookie("session_id", "", -1, "/", "", false, true)
    return nil
}

// DestroyAllUserSessions 销毁用户的所有会话（强制下线）
func (sm *SessionManager) DestroyAllUserSessions(ctx context.Context, userID int64) error {
    userKey := fmt.Sprintf("%suser:%d", sm.prefix, userID)
    
    sessionIDs, err := sm.redis.SMembers(ctx, userKey).Result()
    if err != nil {
        return err
    }
    
    for _, sid := range sessionIDs {
        sm.redis.Del(ctx, sm.prefix+sid)
    }
    
    sm.redis.Del(ctx, userKey)
    return nil
}

// generateSessionID 生成安全的随机 Session ID
func (sm *SessionManager) generateSessionID() string {
    b := make([]byte, 32)
    rand.Read(b)
    return hex.EncodeToString(b)
}
```

这段代码有几个关键设计点需要仔细说明：

第一，Session 存在 Redis 而不是内存里。这解决了多实例部署时 Session 不一致的问题。我见过一个团队把 Session 存在本地内存，用了一个简单的 `map[string]*SessionData`，结果每次发版重启服务，所有在线用户被强制登出，客服电话被打爆，运营差点在群里发飙。还有更隐蔽的问题：负载均衡用 round-robin 策略，用户每次请求可能到不同节点，一半的请求返回 401，用户体验极差。

第二，Session ID 用 32 字节随机数生成，不用用户 ID 或时间戳。predictable 的 Session ID 是严重的安全漏洞，攻击者可以猜测或遍历 Session ID 来冒充其他用户。32 字节随机数意味着 2^256 种可能性，暴力遍历在计算上是不可能的。

第三，加了 IP 变化检测。如果同一个 Session ID 突然换了 IP，可能是 Session 劫持。这个检查不是强制的，有些移动网络会频繁切换 IP（比如从 WiFi 切到 4G），需要根据业务场景调整策略。我建议做成可配置的：严格模式（IP 必须完全一致）、宽松模式（前三段一致即可）、关闭模式（不检测）。

第四，实现了用户多 Session 索引。通过 Redis 的 Set 数据结构维护 `user:{userID} -> [sessionID1, sessionID2, ...]` 的映射。这样当需要强制下线用户时（比如管理员封禁了某用户），可以一次性销毁该用户的所有 Session。

第五，Session 续期策略。每次用户活跃访问时自动延长 Session 有效期，避免用户使用过程中突然掉线。但这个续期不能太频繁，否则会增加 Redis 压力，建议加上时间间隔判断，比如距离上次续期超过 5 分钟才执行。

> Session 认证的最大优势不是简单，而是可撤销。你随时可以让一个 Session 失效，这是 JWT 做不到的。在安全要求高的场景下，这个优势是决定性的。

### 1.2 Session 的并发控制问题

分布式环境下，Session 最棘手的问题不是存储，而是并发控制。考虑这个场景：用户在手机上登录了，又在电脑上登录了，两个设备同时操作，Session 怎么处理？再比如，用户在公共电脑上登录了忘记登出，之后在自己手机上登录，公共电脑上的 Session 怎么处理？

有三种策略，各有适用场景：

**策略一：多 Session 共存。** 每次登录创建新的 Session，旧 Session 保留。最灵活，用户体验最好，但安全性最低。适合社交类、内容消费类应用。

**策略二：单 Session 模式。** 新登录时踢掉旧 Session。安全性高，但用户体验差，特别是多设备用户。适合金融类、企业内网应用。

**策略三：单用户多 Session，但限制数量。** 比如最多 3 个并发 Session，超过时踢掉最早的。这是大多数生产系统的选择，在安全性和用户体验之间取得平衡。

下面是策略三的实现：

```go
// EnforceSessionLimit 限制用户并发会话数
func (sm *SessionManager) EnforceSessionLimit(ctx context.Context, userID int64, maxConcurrent int) error {
    userKey := fmt.Sprintf("%suser:%d", sm.prefix, userID)
    
    // 获取当前所有 Session ID
    sessionIDs, err := sm.redis.SMembers(ctx, userKey).Result()
    if err != nil {
        return err
    }
    
    // 清理已过期的 Session ID（Redis Set 中的成员可能对应的 Session 已过期）
    var activeSessionIDs []string
    for _, sid := range sessionIDs {
        exists, err := sm.redis.Exists(ctx, sm.prefix+sid).Result()
        if err != nil {
            continue
        }
        if exists == 1 {
            activeSessionIDs = append(activeSessionIDs, sid)
        } else {
            // Session 已过期，从 Set 中移除
            sm.redis.SRem(ctx, userKey, sid)
        }
    }
    
    // 如果活跃 Session 数已达上限，踢掉最早的
    if len(activeSessionIDs) >= maxConcurrent {
        type sessionInfo struct {
            ID      string
            LoginAt time.Time
        }
        
        sessions := make([]sessionInfo, 0, len(activeSessionIDs))
        for _, sid := range activeSessionIDs {
            var data SessionData
            err := sm.redis.Get(ctx, sm.prefix+sid).Scan(&data)
            if err != nil {
                continue
            }
            sessions = append(sessions, sessionInfo{
                ID:      sid,
                LoginAt: data.LoginAt,
            })
        }
        
        sort.Slice(sessions, func(i, j int) bool {
            return sessions[i].LoginAt.Before(sessions[j].LoginAt)
        })
        
        toDelete := len(sessions) - maxConcurrent + 1
        for i := 0; i < toDelete; i++ {
            sm.redis.Del(ctx, sm.prefix+sessions[i].ID)
            sm.redis.SRem(ctx, userKey, sessions[i].ID)
        }
    }
    return nil
}
```

这段代码有个容易忽略的细节：Redis 的 Set 不会自动清理过期成员。Session key 有 TTL 会自动过期，但 Set 中的成员不会。所以每次检查时需要先清理已过期的 Session ID。如果不清理，Set 会越来越大，SMembers 返回的数据也会越来越多，最终影响性能。

> 技术选型不是选最好的，而是选最合适的。Session、JWT、OAuth2 各有适用场景，混用往往比单独用更有效。但混用之前，先搞清楚每种方案的边界。

### 1.3 JWT 认证：无状态的诱惑与陷阱

JWT（JSON Web Token）是现在最流行的认证方案，几乎成了新项目的默认选择。它的核心卖点是"无状态"——服务端不需要存储 Session，token 自身携带用户信息，服务端只需验签即可。在微服务架构下，这个优势非常明显：每个服务都可以独立验证 token，不需要共享 Session 存储。

但 JWT 有一个致命问题，这个问题很多教程不会告诉你：**token 一旦签发就无法撤销**。

用户登出了，token 还有效。管理员封禁了用户，token 还有效。密码改了，旧 token 还有效。甚至用户的角色被修改了，token 里携带的角色信息还是旧的。在安全要求高的场景下，这是不可接受的。

我见过一个团队用了 JWT 但没有做撤销机制，结果一个被封禁的用户在 token 过期前还能继续访问系统，整整两个小时。安全团队审计时发现这个问题，直接把权限系统标记为"不合规"，整个团队加班两周才修好。

先看 JWT 的标准实现，然后看怎么解决撤销问题：

```go
package auth

import (
    "crypto/sha256"
    "encoding/hex"
    "errors"
    "fmt"
    "time"
    
    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
)

var (
    ErrTokenExpired        = errors.New("token expired")
    ErrTokenInvalid        = errors.New("token invalid")
    ErrRefreshTokenInvalid = errors.New("refresh token invalid")
)

type JWTManager struct {
    secretKey       []byte
    issuer          string
    accessTokenTTL  time.Duration
    refreshTokenTTL time.Duration
    blacklist       TokenBlacklist
}

type Claims struct {
    UserID   int64  `json:"user_id"`
    Username string `json:"username"`
    TenantID int64  `json:"tenant_id"`
    jwt.RegisteredClaims
}

type TokenPair struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int    `json:"expires_in"`
}

func NewJWTManager(secret string, blacklist TokenBlacklist) *JWTManager {
    return &JWTManager{
        secretKey:       []byte(secret),
        issuer:          "permission-system",
        accessTokenTTL:  15 * time.Minute,
        refreshTokenTTL: 7 * 24 * time.Hour,
        blacklist:       blacklist,
    }
}

// GenerateTokenPair 生成 Access Token + Refresh Token
func (jm *JWTManager) GenerateTokenPair(userID int64, username string, tenantID int64) (*TokenPair, error) {
    now := time.Now()
    
    accessClaims := Claims{
        UserID:   userID,
        Username: username,
        TenantID: tenantID,
        RegisteredClaims: jwt.RegisteredClaims{
            Issuer:    jm.issuer,
            Subject:   fmt.Sprintf("%d", userID),
            ExpiresAt: jwt.NewNumericDate(now.Add(jm.accessTokenTTL)),
            IssuedAt:  jwt.NewNumericDate(now),
            NotBefore: jwt.NewNumericDate(now),
            ID:        uuid.NewString(),
        },
    }
    
    accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).
        SignedString(jm.secretKey)
    if err != nil {
        return nil, fmt.Errorf("generate access token failed: %w", err)
    }
    
    refreshClaims := jwt.RegisteredClaims{
        Issuer:    jm.issuer,
        Subject:   fmt.Sprintf("%d", userID),
        ExpiresAt: jwt.NewNumericDate(now.Add(jm.refreshTokenTTL)),
        IssuedAt:  jwt.NewNumericDate(now),
        ID:        uuid.NewString(),
    }
    
    refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).
        SignedString(jm.secretKey)
    if err != nil {
        return nil, fmt.Errorf("generate refresh token failed: %w", err)
    }
    
    return &TokenPair{
        AccessToken:  accessToken,
        RefreshToken: refreshToken,
        ExpiresIn:    int(jm.accessTokenTTL.Seconds()),
    }, nil
}

// ParseToken 解析并验证 token
func (jm *JWTManager) ParseToken(tokenString string) (*Claims, error) {
    claims := &Claims{}
    
    token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
        // 验证签名算法，防止算法混淆攻击
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return jm.secretKey, nil
    })
    
    if err != nil {
        if errors.Is(err, jwt.ErrTokenExpired) {
            return nil, ErrTokenExpired
        }
        return nil, fmt.Errorf("parse token failed: %w", err)
    }
    
    if !token.Valid {
        return nil, ErrTokenInvalid
    }
    
    // 检查黑名单
    if jm.blacklist != nil {
        revoked, err := jm.blacklist.IsRevoked(context.Background(), tokenString)
        if err != nil {
            return nil, fmt.Errorf("check token blacklist failed: %w", err)
        }
        if revoked {
            return nil, ErrTokenInvalid
        }
    }
    
    return claims, nil
}

// RevokeToken 撤销 token（加入黑名单）
func (jm *JWTManager) RevokeToken(ctx context.Context, tokenString string) error {
    claims, err := jm.ParseToken(tokenString)
    if err != nil && !errors.Is(err, ErrTokenExpired) {
        return err
    }
    
    var expiry time.Time
    if claims != nil && claims.ExpiresAt != nil {
        expiry = claims.ExpiresAt.Time
    } else {
        expiry = time.Now().Add(jm.accessTokenTTL)
    }
    
    return jm.blacklist.Revoke(ctx, tokenString, expiry)
}
```

注意这段代码中的一个重要设计决策：**JWT 的 Claims 中不携带角色信息**。这是血泪教训换来的经验。如果你把 RoleIDs 放进 JWT，管理员修改了用户角色后，用户的 token 没过期前还携带旧的角色信息，权限校验用的就是过期数据。正确做法是 JWT 只放 UserID，角色和权限信息每次从缓存或数据库实时获取。

下面是 Token 黑名单的实现：

```go
// TokenBlacklist Token 黑名单接口
type TokenBlacklist interface {
    Revoke(ctx context.Context, tokenString string, expiry time.Time) error
    IsRevoked(ctx context.Context, tokenString string) (bool, error)
}

// RedisTokenBlacklist 基于 Redis 的 Token 黑名单实现
type RedisTokenBlacklist struct {
    redis  *redis.Client
    prefix string
}

func NewRedisTokenBlacklist(rdb *redis.Client) *RedisTokenBlacklist {
    return &RedisTokenBlacklist{
        redis:  rdb,
        prefix: "jwt:blacklist:",
    }
}

// Revoke 将 token 加入黑名单
func (tb *RedisTokenBlacklist) Revoke(ctx context.Context, tokenString string, expiry time.Time) error {
    ttl := time.Until(expiry)
    if ttl <= 0 {
        return nil
    }
    
    // 计算 token 的 SHA-256 哈希作为 key
    hash := sha256.Sum256([]byte(tokenString))
    key := tb.prefix + hex.EncodeToString(hash[:])
    
    return tb.redis.Set(ctx, key, "1", ttl).Err()
}

// IsRevoked 检查 token 是否已被撤销
func (tb *RedisTokenBlacklist) IsRevoked(ctx context.Context, tokenString string) (bool, error) {
    hash := sha256.Sum256([]byte(tokenString))
    key := tb.prefix + hex.EncodeToString(hash[:])
    
    val, err := tb.redis.Exists(ctx, key).Result()
    if err != nil {
        return false, err
    }
    return val > 0, nil
}
```

> JWT 的无状态是优势也是诅咒。你获得了水平扩展的自由，却失去了对 token 的绝对控制权。每一个用 JWT 的系统都必须面对这个问题。

### 1.4 OAuth2：当你的系统需要接入第三方

OAuth2 不是用来替代 Session 或 JWT 的，而是解决"第三方授权"问题的。比如你的系统需要接入钉钉登录、飞书登录、微信登录，或者给第三方合作伙伴提供 API 访问能力，这时就需要 OAuth2。

OAuth2 的完整实现非常复杂，涉及授权码模式、简化模式、密码模式、客户端模式四种流程。在 Go 中实现 OAuth2 服务端，推荐使用 `fosite` 库。下面是授权码模式的核心流程：

```go
package auth

import (
    "github.com/gin-gonic/gin"
    "github.com/ory/fosite"
    "github.com/ory/fosite/compose"
    "github.com/ory/fosite/storage"
)

type OAuth2Server struct {
    provider fosite.OAuth2Provider
    store    *storage.MemoryStore
}

func NewOAuth2Server() *OAuth2Server {
    store := storage.NewMemoryStore()
    
    config := &compose.Config{
        AccessTokenLifespan:       time.Hour,
        RefreshTokenLifespan:      7 * 24 * time.Hour,
        AuthorizationCodeLifespan: 10 * time.Minute,
    }
    
    provider := compose.Compose(
        config,
        store,
        &jwt.RS256JWTStrategy{PrivateKey: loadPrivateKey()},
        compose.OAuth2AuthorizeExplicitFactory,
        compose.OAuth2ClientCredentialsGrantFactory,
        compose.OAuth2RefreshTokenGrantFactory,
        compose.OAuth2TokenRevocationFactory,
    )
    
    return &OAuth2Server{provider: provider, store: store}
}

// HandleAuthorize 处理授权请求
func (s *OAuth2Server) HandleAuthorize(c *gin.Context) {
    ctx := fosite.NewContext()
    
    ar, err := s.provider.NewAuthorizeRequest(ctx, c.Request)
    if err != nil {
        s.provider.WriteAuthorizeError(ctx, c.Writer, ar, err)
        return
    }
    
    // 验证用户是否已登录
    session := NewSession()
    
    response, err := s.provider.NewAuthorizeResponse(ctx, ar, session)
    if err != nil {
        s.provider.WriteAuthorizeError(ctx, c.Writer, ar, err)
        return
    }
    
    s.provider.WriteAuthorizeResponse(ctx, c.Writer, ar, response)
}

// HandleToken 处理 token 请求
func (s *OAuth2Server) HandleToken(c *gin.Context) {
    ctx := fosite.NewContext()
    session := NewSession()
    
    ar, err := s.provider.NewAccessRequest(ctx, c.Request, session)
    if err != nil {
        s.provider.WriteAccessError(ctx, c.Writer, err)
        return
    }
    
    response, err := s.provider.NewAccessResponse(ctx, ar)
    if err != nil {
        s.provider.WriteAccessError(ctx, c.Writer, err)
        return
    }
    
    s.provider.WriteAccessResponse(ctx, c.Writer, ar, response)
}
```

OAuth2 的完整实现还有 token 内省、撤销、PKCE 安全扩展等细节，篇幅所限不展开。在实际项目中，如果你的系统不需要对接第三方，不要上 OAuth2，它带来的复杂度远超收益。Session 和 JWT 的组合足以覆盖 90% 的认证场景。

> OAuth2 是给第三方授权的，不是给你自己用的。别拿着锤子到处找钉子。

### 1.5 认证方案选型清单

我总结了一个选型清单，帮你快速决策：

| 维度 | Session | JWT | OAuth2 |
|------|---------|-----|--------|
| 服务端状态 | 有状态 | 无状态 | 取决于实现 |
| 撤销能力 | 即时撤销 | 需黑名单 | 支持 |
| 水平扩展 | 需共享存储 | 天然支持 | 需共享存储 |
| 安全性 | 高（可控） | 中（token 泄露窗口） | 高 |
| 实现复杂度 | 低 | 中 | 高 |
| 适用场景 | 单体应用、内部系统 | 微服务、API 网关 | 开放平台、第三方接入 |

我的建议是：内部系统用 Session + Redis 就够了；微服务架构用 JWT + Refresh Token + 黑名单；需要第三方接入时在前面两者之上叠加 OAuth2。不要为了技术先进性而选择不合适的方案，技术选型的第一原则是"够用就好"。

> 每一种技术方案都有它的代价。你选择了无状态的便利，就要承担撤销困难的风险。选择了有状态的安全，就要面对扩展性的挑战。成熟的工程师不是选择最好的方案，而是选择代价最小的方案。

---

## 二、角色与权限管理 CRUD

认证解决的是"你是谁"的问题，授权解决的是"你能做什么"的问题。而角色与权限管理，就是授权系统的数据基础。这个基础没打好，后面建什么都是歪的。在实际项目中，角色和权限的管理需求会随着业务发展不断变化。一开始你可能只需要三种角色和十几个权限点，但半年后可能变成了二十种角色和上百个权限点。如果数据模型设计得不好，每加一个角色都要改代码，每加一个权限点都要改表结构，那维护成本会越来越高。

### 2.1 数据模型设计

上一章我们设计了 RBAC 的数据模型，这里给出具体的 Go 结构体定义。每个字段的设计都有它的原因，不是随便加的：

```go
package model

import "time"

// Role 角色表
type Role struct {
    ID          int64      `json:"id" gorm:"primaryKey;autoIncrement"`
    Name        string     `json:"name" gorm:"size:64;uniqueIndex:idx_role_code;not null"`
    Code        string     `json:"code" gorm:"size:64;uniqueIndex:idx_role_code;not null"`
    Description string     `json:"description" gorm:"size:256"`
    Status      int8       `json:"status" gorm:"default:1;not null"` // 1=启用 0=禁用
    Sort        int        `json:"sort" gorm:"default:0"`
    TenantID    int64      `json:"tenant_id" gorm:"index;not null;default:0"`
    IsBuiltin   bool       `json:"is_builtin" gorm:"default:false"`
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
    DeletedAt   *time.Time `json:"deleted_at" gorm:"index"`
}

// Permission 权限表
type Permission struct {
    ID          int64     `json:"id" gorm:"primaryKey;autoIncrement"`
    Name        string    `json:"name" gorm:"size:128;not null"`
    Code        string    `json:"code" gorm:"size:128;uniqueIndex;not null"`
    Type        int8      `json:"type" gorm:"not null"` // 1=菜单 2=按钮 3=API 4=数据
    Resource    string    `json:"resource" gorm:"size:128;index;not null"`
    Action      string    `json:"action" gorm:"size:32;not null"`
    Description string    `json:"description" gorm:"size:256"`
    ParentID    int64     `json:"parent_id" gorm:"index;default:0"`
    Sort        int       `json:"sort" gorm:"default:0"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}

// RolePermission 角色-权限关联表
type RolePermission struct {
    ID           int64 `json:"id" gorm:"primaryKey;autoIncrement"`
    RoleID       int64 `json:"role_id" gorm:"uniqueIndex:idx_role_perm;not null"`
    PermissionID int64 `json:"permission_id" gorm:"uniqueIndex:idx_role_perm;not null"`
}

// UserRole 用户-角色关联表
type UserRole struct {
    ID        int64      `json:"id" gorm:"primaryKey;autoIncrement"`
    UserID    int64      `json:"user_id" gorm:"uniqueIndex:idx_user_role;not null"`
    RoleID    int64      `json:"role_id" gorm:"uniqueIndex:idx_user_role;not null"`
    ExpiresAt *time.Time `json:"expires_at"`  // nil 表示永久
    Source    string     `json:"source" gorm:"size:32;default:manual"`
    CreatedAt time.Time  `json:"created_at"`
}
```

这个数据模型有几个设计要点需要解释：

第一，Permission 的 Type 字段区分了菜单权限、按钮权限、API 权限和数据权限。这不是过度设计，而是实际需求。前端需要根据菜单权限控制导航栏显示，根据按钮权限控制操作按钮显示，后端需要根据 API 权限控制接口访问，根据数据权限控制数据范围。四种权限类型对应四个不同层级的控制点。

第二，UserRole 表有 ExpiresAt 字段，支持临时角色。双11期间给客服开放退款权限，活动结束后自动过期，不需要人工回收。这个字段看起来不起眼，但在运营活动中能省去大量人工操作。Source 字段记录角色分配的来源（手动分配、自动分配、批量导入），方便审计和追溯。

第三，Role 表有 IsBuiltin 字段。系统初始化时会创建一些内置角色（如超级管理员），这些角色不可删除，防止误操作导致系统不可用。这个字段看起来多余，但等你真的遇到有人把超级管理员角色删了的时候，你就知道它的价值了。

> 数据模型设计是权限系统的骨架。骨架歪了，后面长多少肉都是畸形的。在设计阶段多花一小时思考，能省下开发阶段十小时的返工。

### 2.2 角色 CRUD 实现

角色的增删改查看起来简单，但有不少边界情况要处理。很多团队的权限系统就是在这些边界条件上出了问题：

```go
package service

import (
    "context"
    "errors"
    "time"
    
    "gorm.io/gorm"
    "gorm.io/gorm/clause"
)

var (
    ErrRoleNotFound      = errors.New("role not found")
    ErrRoleAlreadyExists = errors.New("role already exists")
    ErrRoleBuiltin       = errors.New("cannot modify builtin role")
    ErrRoleInUse         = errors.New("role is in use by users")
)

type RoleService struct {
    db    *gorm.DB
    cache PermissionCache
}

type CreateRoleRequest struct {
    Name          string  `json:"name" binding:"required"`
    Code          string  `json:"code" binding:"required"`
    Description   string  `json:"description"`
    TenantID      int64   `json:"tenant_id"`
    Sort          int     `json:"sort"`
    PermissionIDs []int64 `json:"permission_ids"`
}

// CreateRole 创建角色
func (s *RoleService) CreateRole(ctx context.Context, req *CreateRoleRequest) (*model.Role, error) {
    // 检查角色 code 是否已存在（同一租户内 code 唯一）
    var count int64
    err := s.db.WithContext(ctx).Model(&model.Role{}).
        Where("code = ? AND tenant_id = ?", req.Code, req.TenantID).
        Count(&count).Error
    if err != nil {
        return nil, err
    }
    if count > 0 {
        return nil, ErrRoleAlreadyExists
    }
    
    role := &model.Role{
        Name:        req.Name,
        Code:        req.Code,
        Description: req.Description,
        Status:      1,
        TenantID:    req.TenantID,
        Sort:        req.Sort,
    }
    
    // 使用事务确保角色创建和权限分配的原子性
    err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        if err := tx.Create(role).Error; err != nil {
            return err
        }
        
        if len(req.PermissionIDs) > 0 {
            rolePerms := make([]model.RolePermission, 0, len(req.PermissionIDs))
            for _, pid := range req.PermissionIDs {
                rolePerms = append(rolePerms, model.RolePermission{
                    RoleID:       role.ID,
                    PermissionID: pid,
                })
            }
            return tx.Create(&rolePerms).Error
        }
        return nil
    })
    if err != nil {
        return nil, err
    }
    
    s.cache.InvalidateRolePermissions(ctx, role.ID)
    
    return role, nil
}

// UpdateRole 更新角色
func (s *RoleService) UpdateRole(ctx context.Context, id int64, req *UpdateRoleRequest) error {
    role, err := s.GetRoleByID(ctx, id)
    if err != nil {
        return err
    }
    
    // 内置角色只允许修改描述
    if role.IsBuiltin {
        if req.Name != "" || req.Code != "" || req.Status != 0 {
            return ErrRoleBuiltin
        }
    }
    
    updates := map[string]interface{}{}
    if req.Name != "" {
        updates["name"] = req.Name
    }
    if req.Description != "" {
        updates["description"] = req.Description
    }
    if req.Status != 0 {
        updates["status"] = req.Status
    }
    updates["updated_at"] = time.Now()
    
    err = s.db.WithContext(ctx).Model(&model.Role{}).
        Where("id = ?", id).Updates(updates).Error
    if err != nil {
        return err
    }
    
    // 角色信息变更后，需要清除所有关联用户的权限缓存
    s.cache.InvalidateRolePermissions(ctx, id)
    return nil
}

// DeleteRole 删除角色
func (s *RoleService) DeleteRole(ctx context.Context, id int64) error {
    role, err := s.GetRoleByID(ctx, id)
    if err != nil {
        return err
    }
    
    if role.IsBuiltin {
        return ErrRoleBuiltin
    }
    
    // 检查是否有用户正在使用该角色
    var userCount int64
    err = s.db.WithContext(ctx).Model(&model.UserRole{}).
        Where("role_id = ? AND (expires_at IS NULL OR expires_at > NOW())", id).
        Count(&userCount).Error
    if err != nil {
        return err
    }
    if userCount > 0 {
        return ErrRoleInUse
    }
    
    return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        // 删除角色-权限关联
        if err := tx.Where("role_id = ?", id).Delete(&model.RolePermission{}).Error; err != nil {
            return err
        }
        // 软删除角色
        return tx.Delete(&model.Role{}, id).Error
    })
}

// AssignPermissions 给角色分配权限
// mode: "replace" 替换全部, "add" 追加, "remove" 移除
func (s *RoleService) AssignPermissions(ctx context.Context, roleID int64, permIDs []int64, mode string) error {
    return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        switch mode {
        case "replace":
            if err := tx.Where("role_id = ?", roleID).Delete(&model.RolePermission{}).Error; err != nil {
                return err
            }
            if len(permIDs) > 0 {
                rolePerms := make([]model.RolePermission, 0, len(permIDs))
                for _, pid := range permIDs {
                    rolePerms = append(rolePerms, model.RolePermission{
                        RoleID:       roleID,
                        PermissionID: pid,
                    })
                }
                return tx.Create(&rolePerms).Error
            }
            
        case "add":
            if len(permIDs) > 0 {
                rolePerms := make([]model.RolePermission, 0, len(permIDs))
                for _, pid := range permIDs {
                    rolePerms = append(rolePerms, model.RolePermission{
                        RoleID:       roleID,
                        PermissionID: pid,
                    })
                }
                // ON CONFLICT DO NOTHING 避免重复插入报错
                return tx.Clauses(clause.OnConflict{DoNothing: true}).
                    Create(&rolePerms).Error
            }
            
        case "remove":
            return tx.Where("role_id = ? AND permission_id IN ?", roleID, permIDs).
                Delete(&model.RolePermission{}).Error
        }
        return nil
    })
}
```

> 删除操作永远是权限系统里最容易出 bug 的地方。多检查一步"是否在用"，能少一个 P0 故障。删除前的状态检查不是可选的，是必须的。

### 2.3 用户角色分配与过期处理

用户角色分配的关键在于临时角色的过期处理。我见过很多系统的做法是写一个定时任务，每小时扫描过期的用户角色并删除。这种方案能用，但有延迟，而且定时任务挂了就失效了。如果定时任务挂了一晚上，过期角色的用户就能多访问一晚上的不该访问的数据。

更好的方案是在权限校验时实时检查过期。这样即使定时任务挂了，过期的角色也不会生效：

```go
// GetUserPermissions 获取用户的所有权限（实时检查角色过期）
func (s *PermissionService) GetUserPermissions(ctx context.Context, userID int64) ([]*model.Permission, error) {
    // 先查缓存
    if perms, err := s.cache.GetUserPermissions(ctx, userID); err == nil {
        return perms, nil
    }
    
    // 查询用户的有效角色（未过期的）
    var roleIDs []int64
    err := s.db.WithContext(ctx).Model(&model.UserRole{}).
        Where("user_id = ? AND (expires_at IS NULL OR expires_at > ?)", userID, time.Now()).
        Pluck("role_id", &roleIDs).Error
    if err != nil {
        return nil, err
    }
    
    if len(roleIDs) == 0 {
        return []*model.Permission{}, nil
    }
    
    // 通过角色查询权限（DISTINCT 去重）
    var permIDs []int64
    err = s.db.WithContext(ctx).Model(&model.RolePermission{}).
        Where("role_id IN ?", roleIDs).
        Pluck("DISTINCT permission_id", &permIDs).Error
    if err != nil {
        return nil, err
    }
    
    if len(permIDs) == 0 {
        return []*model.Permission{}, nil
    }
    
    var permissions []*model.Permission
    err = s.db.WithContext(ctx).Where("id IN ?", permIDs).Find(&permissions).Error
    if err != nil {
        return nil, err
    }
    
    // 写入缓存，设置较短的 TTL 以兼顾实时性
    s.cache.SetUserPermissions(ctx, userID, permissions, 5*time.Minute)
    
    return permissions, nil
}

// AssignRoleToUser 给用户分配角色
func (s *RoleService) AssignRoleToUser(ctx context.Context, userID, roleID int64, expiresAt *time.Time) error {
    userRole := &model.UserRole{
        UserID:    userID,
        RoleID:    roleID,
        ExpiresAt: expiresAt,
        Source:    "manual",
    }
    
    // 使用 UPSERT 语义：如果已存在则更新过期时间
    err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
        Columns:   []clause.Column{{Name: "user_id"}, {Name: "role_id"}},
        DoUpdates: clause.AssignmentColumns([]string{"expires_at", "source", "updated_at"}),
    }).Create(userRole).Error
    if err != nil {
        return err
    }
    
    // 清除用户权限缓存
    s.cache.InvalidateUserPermissions(ctx, userID)
    return nil
}

// BatchAssignRoles 批量给多个用户分配角色
func (s *RoleService) BatchAssignRoles(ctx context.Context, userIDs []int64, roleID int64, expiresAt *time.Time) error {
    userRoles := make([]model.UserRole, 0, len(userIDs))
    for _, uid := range userIDs {
        userRoles = append(userRoles, model.UserRole{
            UserID:    uid,
            RoleID:    roleID,
            ExpiresAt: expiresAt,
            Source:    "batch",
        })
    }
    
    err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
        Columns:   []clause.Column{{Name: "user_id"}, {Name: "role_id"}},
        DoUpdates: clause.AssignmentColumns([]string{"expires_at", "source"}),
    }).CreateInBatches(userRoles, 100).Error
    if err != nil {
        return err
    }
    
    // 批量清除缓存
    for _, uid := range userIDs {
        s.cache.InvalidateUserPermissions(ctx, uid)
    }
    return nil
}
```

这里有一个重要的设计决策：权限缓存只设 5 分钟的 TTL，而不是更长。原因是角色分配变更后，最多 5 分钟就能生效。如果用 1 小时的 TTL，管理员撤销了某用户的角色，那个用户在 1 小时内还能访问不该访问的资源。权限系统的缓存 TTL 应该由安全要求决定，不是性能要求。

> 缓存时间越长，性能越好，但安全窗口越大。权限系统的缓存 TTL 应该由安全要求决定，不是性能要求。五分钟的延迟在大多数场景下是可接受的，一小时的延迟可能就是一次安全事故。

---

## 三、资源授权引擎设计

角色和权限的 CRUD 是基础工作，真正的核心是资源授权引擎。它要回答一个问题：给定一个用户、一个资源和一个操作，这个用户是否有权限执行这个操作？这个问题看似简单，但当资源数量达到百万级、策略规则达到上千条时，性能和正确性就成了巨大的挑战。授权引擎的设计水平直接决定了权限系统的上限。一个好的授权引擎应该具备三个特征：策略配置灵活（不用改代码就能加新规则）、评估性能高效（毫秒级响应）、决策结果可审计（每次决策都有据可查）。这三个特征互相矛盾——灵活意味着复杂，高效意味着简单，可审计意味着开销。如何在这三者之间找到平衡点，是这一节的核心内容。

### 3.1 授权引擎的接口设计

先定义引擎的接口，把设计意图表达清楚。接口设计是架构设计的第一步，好的接口定义能让实现方案自然浮现：

```go
package engine

import "context"

// Resource 资源标识
type Resource struct {
    Type string                   // 资源类型：order, product, document, ...
    ID   string                   // 资源 ID
    Meta map[string]interface{}   // 资源元数据（所属者、租户、部门等）
}

// Action 操作
type Action struct {
    Type   string // 操作类型：read, create, update, delete
    Method string // HTTP 方法（API 权限时使用）
}

// Decision 授权决策
type Decision struct {
    Allowed bool
    Reason  string   // 决策原因，用于审计日志
    Effects []string // 生效的策略 ID 列表
}

// AuthzEngine 授权引擎接口
type AuthzEngine interface {
    // Check 单次权限检查
    Check(ctx context.Context, userID int64, resource *Resource, action *Action) (*Decision, error)
    
    // BatchCheck 批量权限检查（用于列表页场景）
    BatchCheck(ctx context.Context, userID int64, resources []*Resource, action *Action) ([]*Decision, error)
    
    // ListAccessible 返回用户能访问的某类型资源的 ID 列表
    ListAccessible(ctx context.Context, userID int64, resourceType string, action *Action) ([]string, error)
}
```

这个接口设计有三个考量：

第一，Resource 包含 Meta 字段。因为权限判断经常需要资源的元数据，比如资源的所有者是谁、属于哪个租户、属于哪个部门。这些信息在运行时才能获取，不能预先存在策略里。比如"用户只能编辑自己创建的订单"这条策略，需要拿资源的 owner_id 和用户的 user_id 做比较。

第二，Decision 包含 Reason 和 Effects。审计是权限系统的重要组成部分，你需要知道"为什么允许"和"哪条策略生效了"。当出现权限问题时，这些信息是排查问题的关键线索。Effects 字段记录生效的策略 ID，方便回溯。

第三，BatchCheck 方法。前端渲染列表时，经常需要批量检查多个资源的权限，决定每行是否显示编辑按钮。逐个检查会导致 N+1 查询问题，20 条数据的列表会触发 20 次权限引擎调用。BatchCheck 可以复用用户角色和策略数据，一次批量处理。

### 3.2 策略匹配引擎实现

```go
// Policy 策略定义
type Policy struct {
    ID             int64
    Name           string
    Description    string
    Effect         string // "allow" 或 "deny"
    Priority       int    // 优先级，数值越大越优先
    Conditions     []Condition
    ResourcePattern string // 资源匹配模式，支持通配符
    ActionPattern   string // 操作匹配模式
}

// Condition 策略条件
type Condition struct {
    Field    string      // 字段名：resource.owner_id, user.department, etc.
    Operator string      // eq, ne, in, not_in, gt, lt, regex
    Value    interface{} // 比较值
}

// DefaultEngine 默认授权引擎实现
type DefaultEngine struct {
    policyRepo  PolicyRepository
    userRoleSvc UserRoleService
    cache       DecisionCache
}

// Check 执行权限检查
func (e *DefaultEngine) Check(ctx context.Context, userID int64, resource *Resource, action *Action) (*Decision, error) {
    // 1. 构建缓存 key
    cacheKey := e.buildCacheKey(userID, resource, action)
    
    // 2. 查缓存
    if decision, err := e.cache.Get(ctx, cacheKey); err == nil {
        return decision, nil
    }
    
    // 3. 获取用户的所有角色
    roleIDs, err := e.userRoleSvc.GetUserRoles(ctx, userID)
    if err != nil {
        return nil, err
    }
    
    // 4. 获取所有匹配的策略
    policies, err := e.policyRepo.GetPoliciesByRoles(ctx, roleIDs)
    if err != nil {
        return nil, err
    }
    
    // 5. 过滤匹配的策略
    matchedPolicies := e.matchPolicies(policies, resource, action)
    
    // 6. 按优先级排序
    sort.Slice(matchedPolicies, func(i, j int) bool {
        return matchedPolicies[i].Priority > matchedPolicies[j].Priority
    })
    
    // 7. 评估策略
    decision := e.evaluate(ctx, userID, matchedPolicies, resource, action)
    
    // 8. 写缓存
    e.cache.Set(ctx, cacheKey, decision, 5*time.Minute)
    
    return decision, nil
}

// matchPolicies 匹配策略
func (e *DefaultEngine) matchPolicies(policies []*Policy, resource *Resource, action *Action) []*Policy {
    var matched []*Policy
    for _, p := range policies {
        if !matchPattern(p.ResourcePattern, resource.Type) {
            continue
        }
        if !matchPattern(p.ActionPattern, action.Type) {
            continue
        }
        matched = append(matched, p)
    }
    return matched
}

// evaluate 评估匹配的策略，做出最终决策
func (e *DefaultEngine) evaluate(ctx context.Context, userID int64, policies []*Policy, resource *Resource, action *Action) *Decision {
    // 默认拒绝
    decision := &Decision{
        Allowed: false,
        Reason:  "no matching allow policy",
    }
    
    for _, p := range policies {
        // 评估条件
        if !e.evalConditions(ctx, userID, p.Conditions, resource) {
            continue
        }
        
        if p.Effect == "deny" {
            // deny 优先，直接返回
            return &Decision{
                Allowed: false,
                Reason:  fmt.Sprintf("denied by policy %d: %s", p.ID, p.Name),
                Effects: []string{fmt.Sprintf("policy:%d", p.ID)},
            }
        }
        
        if p.Effect == "allow" && !decision.Allowed {
            decision.Allowed = true
            decision.Reason = fmt.Sprintf("allowed by policy %d: %s", p.ID, p.Name)
            decision.Effects = append(decision.Effects, fmt.Sprintf("policy:%d", p.ID))
        }
    }
    
    return decision
}

// evalConditions 评估策略条件
func (e *DefaultEngine) evalConditions(ctx context.Context, userID int64, conditions []Condition, resource *Resource) bool {
    for _, cond := range conditions {
        var actualValue interface{}
        
        switch cond.Field {
        case "resource.owner_id":
            actualValue = resource.Meta["owner_id"]
        case "resource.tenant_id":
            actualValue = resource.Meta["tenant_id"]
        case "resource.id":
            actualValue = resource.ID
        case "user.id":
            actualValue = userID
        case "user.department":
            dept, err := e.getUserDepartment(ctx, userID)
            if err != nil {
                return false
            }
            actualValue = dept
        default:
            return false
        }
        
        if !evaluateOperator(actualValue, cond.Operator, cond.Value) {
            return false
        }
    }
    return true
}

// evaluateOperator 评估操作符
func evaluateOperator(actual interface{}, operator string, expected interface{}) bool {
    switch operator {
    case "eq":
        return fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", expected)
    case "ne":
        return fmt.Sprintf("%v", actual) != fmt.Sprintf("%v", expected)
    case "in":
        expectedSlice, ok := expected.([]interface{})
        if !ok {
            return false
        }
        for _, v := range expectedSlice {
            if fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", v) {
                return true
            }
        }
        return false
    case "gt", "lt", "gte", "lte":
        a, ok1 := toFloat64(actual)
        b, ok2 := toFloat64(expected)
        if !ok1 || !ok2 {
            return false
        }
        switch operator {
        case "gt":
            return a > b
        case "lt":
            return a < b
        case "gte":
            return a >= b
        case "lte":
            return a <= b
        }
    }
    return false
}

// matchPattern 通配符匹配
func matchPattern(pattern, target string) bool {
    if pattern == "*" {
        return true
    }
    if strings.HasSuffix(pattern, "*") {
        prefix := strings.TrimSuffix(pattern, "*")
        return strings.HasPrefix(target, prefix)
    }
    return pattern == target
}
```

> 授权引擎的核心逻辑就是一句话：默认拒绝，匹配策略，deny 优先。但围绕这十六个字，有无数的工程细节。每多一个条件判断，就多一个可能出错的地方。

### 3.3 策略优先级与冲突处理

当多条策略同时匹配时，如何决策？这是一个经典问题。我采用的策略是：

1. **Deny 优先原则。** 只要有一条 deny 策略匹配，直接拒绝，不管有多少条 allow 策略。这是安全领域的最佳实践——宁可误拒，不可误放。
2. **优先级排序。** 同为 allow 或同为 deny 的策略，按优先级高的生效。这允许你用高优先级的策略覆盖低优先级的策略。
3. **默认拒绝。** 没有任何策略匹配时，拒绝。这是最安全的选择。

比如：策略 A 说"管理员可以访问所有订单"，策略 B 说"管理员不能访问已归档的订单"。如果策略 A 的优先级高于 B，那 B 就形同虚设。正确的做法是给 B 更高的优先级，让 deny 策略覆盖 allow 策略。

```go
// resolveConflict 解决策略冲突
// 规则：
// 1. 所有 deny 策略中，取优先级最高的
// 2. 所有 allow 策略中，取优先级最高的
// 3. 如果有 deny 策略，deny 优先
// 4. 如果只有 allow 策略，允许
// 5. 如果没有匹配策略，拒绝
func (e *DefaultEngine) resolveConflict(policies []*Policy) *Policy {
    var topDeny, topAllow *Policy
    
    for _, p := range policies {
        if p.Effect == "deny" {
            if topDeny == nil || p.Priority > topDeny.Priority {
                topDeny = p
            }
        } else if p.Effect == "allow" {
            if topAllow == nil || p.Priority > topAllow.Priority {
                topAllow = p
            }
        }
    }
    
    if topDeny != nil {
        return topDeny
    }
    
    return topAllow
}
```

策略冲突处理还有一个进阶问题：冲突检测。如果两条策略的优先级相同但效果相反（一条 allow 一条 deny），这就是一个配置冲突，应该在策略配置时就给出警告，而不是等到运行时再处理。我建议在策略管理后台加一个冲突检测功能，当用户保存策略时自动检查是否有冲突。

> 权限系统的黄金法则：宁可误拒，不可误放。一次误拒最多被投诉，一次误放可能是事故。当规则存在歧义时，永远选择更安全的那一侧。

---

## 四、权限校验中间件开发

授权引擎写好了，但如果不集成到 Web 框架中，它就只是个摆设。这一节我们实现权限校验中间件，让权限检查对业务代码透明。好的中间件应该像空气一样——无处不在但你感觉不到它的存在。业务代码不应该出现一行权限检查逻辑。

### 4.1 Gin 中间件实现

```go
package middleware

import (
    "net/http"
    "strings"
    
    "github.com/gin-gonic/gin"
)

// PermissionMiddleware 权限校验中间件
func PermissionMiddleware(authzEngine engine.AuthzEngine, authManager *auth.JWTManager) gin.HandlerFunc {
    return func(c *gin.Context) {
        // 1. 从请求头获取 token
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "missing authorization header",
            })
            return
        }
        
        // 2. 解析 Bearer token
        parts := strings.SplitN(authHeader, " ", 2)
        if len(parts) != 2 || parts[0] != "Bearer" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "invalid authorization format",
            })
            return
        }
        
        // 3. 解析并验证 token
        claims, err := authManager.ParseToken(parts[1])
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "invalid or expired token",
            })
            return
        }
        
        // 4. 将用户信息存入 context，供后续业务代码使用
        c.Set("user_id", claims.UserID)
        c.Set("username", claims.Username)
        c.Set("tenant_id", claims.TenantID)
        
        // 5. 跳过权限检查的白名单路由
        path := c.Request.URL.Path
        if isWhitelisted(path) {
            c.Next()
            return
        }
        
        // 6. 从路径中构建资源标识
        // /api/v1/orders/123 -> resource type: orders, resource id: 123
        resource := &engine.Resource{
            Type: extractResourceType(path),
            ID:   extractResourceID(path),
            Meta: map[string]interface{}{
                "tenant_id": claims.TenantID,
            },
        }
        
        // 7. 从 HTTP 方法构建操作标识
        action := &engine.Action{
            Type:   methodToAction(c.Request.Method),
            Method: c.Request.Method,
        }
        
        // 8. 执行权限检查
        decision, err := authzEngine.Check(c, claims.UserID, resource, action)
        if err != nil {
            c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
                "code":    500,
                "message": "permission check failed",
            })
            return
        }
        
        if !decision.Allowed {
            c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
                "code":    403,
                "message": "permission denied",
                "reason":  decision.Reason,
            })
            return
        }
        
        // 9. 将决策信息存入 context，供后续使用（如审计日志）
        c.Set("authz_decision", decision)
        
        c.Next()
    }
}

// methodToAction HTTP 方法转操作类型
func methodToAction(method string) string {
    switch method {
    case http.MethodGet:
        return "read"
    case http.MethodPost:
        return "create"
    case http.MethodPut, http.MethodPatch:
        return "update"
    case http.MethodDelete:
        return "delete"
    default:
        return method
    }
}

// extractResourceType 从路径中提取资源类型
// /api/v1/orders/123 -> orders
// /api/v1/users/456/orders -> users.orders
func extractResourceType(path string) string {
    parts := strings.Split(strings.TrimPrefix(path, "/api/v1"), "/")
    var resources []string
    for _, p := range parts {
        if p == "" || isNumeric(p) {
            continue
        }
        resources = append(resources, p)
    }
    return strings.Join(resources, ".")
}

// extractResourceID 从路径中提取资源 ID
func extractResourceID(path string) string {
    parts := strings.Split(strings.TrimPrefix(path, "/api/v1"), "/")
    for i := len(parts) - 1; i >= 0; i-- {
        if isNumeric(parts[i]) {
            return parts[i]
        }
    }
    return ""
}

func isNumeric(s string) bool {
    for _, c := range s {
        if c < '0' || c > '9' {
            return false
        }
    }
    return len(s) > 0
}
```

中间件的执行流程是：认证（验证 token）-> 提取用户信息 -> 构建资源和操作标识 -> 权限检查 -> 放行或拒绝。整个流程对业务代码完全透明，Controller 和 Service 不需要写任何权限检查代码。

> 好的中间件应该像空气一样——无处不在但你感觉不到它的存在。业务代码不应该出现一行权限检查逻辑。如果你在 Controller 里看到了权限判断，说明架构设计出了问题。

### 4.2 声明式权限控制

中间件是全局拦截，但有些接口需要更细粒度的控制。比如同一个 Controller 里的不同方法需要不同的权限。这时可以用声明式的方式，通过注解或标签来声明接口需要的权限：

```go
// RequirePermission 权限要求
type RequirePermission struct {
    Resource string
    Action   string
}

// RequirePermissionMiddleware 基于声明式配置的权限中间件
// 使用方式：
//   router.GET("/orders/:id", RequirePermission("orders", "read"), orderHandler.Get)
//   router.POST("/orders", RequirePermission("orders", "create"), orderHandler.Create)
func RequirePermission(resource, action string) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID := c.GetInt64("user_id")
        if userID == 0 {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "authentication required",
            })
            return
        }
        
        eng := c.MustGet("authz_engine").(engine.AuthzEngine)
        
        res := &engine.Resource{
            Type: resource,
            ID:   c.Param("id"),
            Meta: buildResourceMeta(c),
        }
        
        act := &engine.Action{Type: action}
        
        decision, err := eng.Check(c, userID, res, act)
        if err != nil || !decision.Allowed {
            c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
                "code":    403,
                "message": "permission denied",
            })
            return
        }
        
        c.Next()
    }
}
```

这种声明式的方式让权限要求一目了然。看到路由配置就知道这个接口需要什么权限，不用深入到 Controller 代码里去找。代码审查时也更容易发现权限配置错误。

### 4.3 权限检查的 N+1 问题与批量优化

在列表页场景中，权限检查的 N+1 问题特别严重。假设你有一个订单列表页，每页 20 条数据，前端需要根据用户权限决定每条数据是否显示"编辑"和"删除"按钮。如果逐条检查权限，那就是 20 次权限引擎调用，每次都要查缓存或数据库。

```go
// BatchCheck 批量权限检查
func (e *DefaultEngine) BatchCheck(ctx context.Context, userID int64, resources []*Resource, action *Action) ([]*Decision, error) {
    // 1. 批量查缓存
    cacheKeys := make([]string, len(resources))
    for i, res := range resources {
        cacheKeys[i] = e.buildCacheKey(userID, res, action)
    }
    
    cached, err := e.cache.BatchGet(ctx, cacheKeys)
    if err != nil {
        // 缓存批量获取失败，降级为逐个检查
        decisions := make([]*Decision, len(resources))
        for i, res := range resources {
            decisions[i], _ = e.Check(ctx, userID, res, action)
        }
        return decisions, nil
    }
    
    // 2. 找出缓存未命中的
    decisions := make([]*Decision, len(resources))
    missedIndices := []int{}
    
    for i, key := range cacheKeys {
        if cached[key] != nil {
            decisions[i] = cached[key]
        } else {
            missedIndices = append(missedIndices, i)
        }
    }
    
    if len(missedIndices) == 0 {
        return decisions, nil
    }
    
    // 3. 对缓存未命中的，一次性获取用户角色和策略
    roleIDs, _ := e.userRoleSvc.GetUserRoles(ctx, userID)
    policies, _ := e.policyRepo.GetPoliciesByRoles(ctx, roleIDs)
    
    // 4. 逐个评估（但复用了角色和策略数据）
    for _, idx := range missedIndices {
        res := resources[idx]
        matchedPolicies := e.matchPolicies(policies, res, action)
        decision := e.evaluate(ctx, userID, matchedPolicies, res, action)
        decisions[idx] = decision
        
        // 写入缓存
        e.cache.Set(ctx, cacheKeys[idx], decision, 5*time.Minute)
    }
    
    return decisions, nil
}
```

批量优化的核心思路是：用户角色和策略数据只需获取一次，然后对所有资源复用。20 条数据的权限检查，原来需要 20 次角色查询 + 20 次策略查询 = 40 次查询，优化后只需要 1 次角色查询 + 1 次策略查询 = 2 次查询。性能提升 20 倍。

> 批量优化不是可选项，是必选项。一个列表页 20 条数据，逐个检查权限和批量检查的性能差距可能是 20 倍。在 QPS 高的场景下，这个差距就是系统能不能扛住的区别。

---

## 五、数据权限过滤方案

前面的权限检查解决的是"能不能访问这个接口"的问题，但还有一个更深层的问题：用户能访问订单接口，但他应该看到哪些订单？全部订单还是只能看到自己部门的？这就是数据权限，权限系统里最棘手的部分。接口权限是门卫，数据权限是筛子。门卫决定你能不能进来，筛子决定你能看到什么。

### 5.1 数据权限的五种模型

在实际项目中，数据权限通常有以下几种模型：

1. **全部数据。** 管理员可以看到所有数据，没有过滤。
2. **本部门数据。** 只能看到自己所在部门的数据。
3. **本部门及下属部门数据。** 可以看到自己部门以及下属部门的数据。部门主管通常用这个。
4. **仅本人数据。** 只能看到自己创建的数据。普通员工通常用这个。
5. **自定义数据范围。** 可以指定看到哪些部门的数据。用于跨部门协作场景。

```go
// DataScope 数据权限范围
type DataScope struct {
    Type    DataScopeType
    DeptIDs []int64 // 自定义数据范围时指定的部门 ID 列表
}

type DataScopeType int8

const (
    DataScopeAll       DataScopeType = 1 // 全部数据
    DataScopeDept      DataScopeType = 2 // 本部门
    DataScopeDeptBelow DataScopeType = 3 // 本部门及下属部门
    DataScopeSelf      DataScopeType = 4 // 仅本人
    DataScopeCustom    DataScopeType = 5 // 自定义
)
```

### 5.2 基于 GORM Scope 的数据权限过滤

我的方案是利用 GORM 的 Scopes 机制，将数据权限过滤封装成可复用的查询条件，对业务代码几乎零侵入。业务开发者不需要知道数据权限的存在，Scope 会自动在 SQL 查询中添加过滤条件：

```go
package dataperm

import (
    "context"
    
    "gorm.io/gorm"
)

// DataPermissionScope 数据权限过滤 Scope
func DataPermissionScope(ctx context.Context, dataPerm *DataScope, userID int64, deptID int64) func(*gorm.DB) *gorm.DB {
    return func(db *gorm.DB) *gorm.DB {
        if dataPerm == nil {
            // 没有配置数据权限，默认只能看自己的（安全优先）
            return db.Where("creator_id = ?", userID)
        }
        
        switch dataPerm.Type {
        case DataScopeAll:
            // 不过滤，返回全部数据
            return db
            
        case DataScopeSelf:
            return db.Where("creator_id = ?", userID)
            
        case DataScopeDept:
            return db.Where("dept_id = ?", deptID)
            
        case DataScopeDeptBelow:
            // 需要查询下属部门 ID 列表
            deptIDs := getSubDeptIDs(ctx, deptID)
            deptIDs = append(deptIDs, deptID) // 包含本部门
            return db.Where("dept_id IN ?", deptIDs)
            
        case DataScopeCustom:
            if len(dataPerm.DeptIDs) == 0 {
                return db.Where("1 = 0") // 没有权限，返回空结果
            }
            return db.Where("dept_id IN ?", dataPerm.DeptIDs)
            
        default:
            return db.Where("creator_id = ?", userID)
        }
    }
}
```

在业务代码中的使用方式：

```go
// GetOrderList 获取订单列表
func (s *OrderService) GetOrderList(ctx context.Context, req *OrderListRequest) ([]*Order, int64, error) {
    userID := ctx.Value("user_id").(int64)
    deptID := ctx.Value("dept_id").(int64)
    
    // 获取用户的数据权限配置
    dataPerm := s.getDataPermission(ctx, userID)
    
    var orders []*Order
    var total int64
    
    query := s.db.WithContext(ctx).Model(&Order{})
    
    // 应用数据权限过滤（一行代码，对业务逻辑透明）
    query = query.Scopes(dataperm.DataPermissionScope(ctx, dataPerm, userID, deptID))
    
    // 应用业务过滤条件
    if req.Status != "" {
        query = query.Where("status = ?", req.Status)
    }
    if req.Keyword != "" {
        query = query.Where("order_no LIKE ?", "%"+req.Keyword+"%")
    }
    
    // 分页查询
    query.Count(&total)
    err := query.Offset((req.Page - 1) * req.PageSize).Limit(req.PageSize).
        Order("created_at DESC").Find(&orders).Error
    
    return orders, total, err
}
```

注意看这段代码——业务逻辑和数据权限过滤完全解耦。业务代码只管自己的过滤条件（状态、关键词），数据权限由 Scope 自动处理。如果后续需要调整数据权限策略，只需修改 Scope 函数，不需要动业务代码。这种解耦是权限系统设计的核心原则之一。

> 数据权限的终极目标是对业务代码零侵入。业务开发者不应该需要知道数据权限的存在。如果你在 Service 层看到了数据权限的判断逻辑，说明架构设计需要优化了。

### 5.3 多租户数据隔离

在多租户系统中，数据权限的第一道防线是租户隔离。不同租户的数据绝对不能混在一起。这不是功能需求，是安全底线。我推荐在 GORM 的回调机制中实现全局租户过滤，这样即使开发者忘了加租户过滤条件，GORM 回调也会自动补上：

```go
// TenantInterceptor 多租户数据隔离拦截器
type TenantInterceptor struct {
    db *gorm.DB
}

// Register 注册 GORM 回调
func (ti *TenantInterceptor) Register() {
    // 查询回调：自动添加租户过滤条件
    ti.db.Callback().Query().Before("gorm:query").Register("tenant_filter_query", func(db *gorm.DB) {
        if db.Statement.Context.Value("skip_tenant_filter") != nil {
            return // 跳过租户过滤（如管理员后台查询）
        }
        
        tenantID := db.Statement.Context.Value("tenant_id")
        if tenantID != nil {
            db.Statement.Where("tenant_id = ?", tenantID)
        }
    })
    
    // 创建回调：自动设置租户 ID
    ti.db.Callback().Create().Before("gorm:before_create").Register("tenant_filter_create", func(db *gorm.DB) {
        tenantID := db.Statement.Context.Value("tenant_id")
        if tenantID == nil {
            return
        }
        
        if field := db.Statement.Schema.LookUpField("TenantID"); field != nil {
            field.Set(db.Statement.Context, db.Statement.ReflectValue, tenantID)
        }
    })
    
    // 删除回调：防止跨租户删除
    ti.db.Callback().Delete().Before("gorm:before_delete").Register("tenant_filter_delete", func(db *gorm.DB) {
        tenantID := db.Statement.Context.Value("tenant_id")
        if tenantID != nil {
            db.Statement.Where("tenant_id = ?", tenantID)
        }
    })
    
    // 更新回调：防止跨租户更新
    ti.db.Callback().Update().Before("gorm:before_update").Register("tenant_filter_update", func(db *gorm.DB) {
        tenantID := db.Statement.Context.Value("tenant_id")
        if tenantID != nil {
            db.Statement.Where("tenant_id = ?", tenantID)
        }
    })
}
```

这个实现的关键在于：租户过滤是自动的、全局的，业务代码完全无感知。这是纵深防御的思想——即使业务代码忘了加过滤条件，GORM 回调也会自动补上。对于管理员后台等需要跨租户查询的场景，可以在 context 中设置 `skip_tenant_filter` 标记来跳过过滤，但这个标记的设置需要严格的权限控制。

> 多租户隔离不是功能，是底线。一次数据泄露就能毁掉一个 SaaS 产品的全部信任。你的客户把数据放在你的平台上，是因为他们相信你不会让别人看到。一旦这个信任被打破，就再也无法修复了。

### 5.4 数据权限与查询性能

数据权限过滤会增加 SQL 的 WHERE 条件，特别是"本部门及下属部门"这种需要 IN 子查询的场景，如果数据量大，性能会急剧下降。一条 `WHERE dept_id IN (1, 2, 3, 4, 5, ...)` 在部门层级深的时候可能包含几十甚至上百个 ID，IN 子句太长会导致 SQL 执行计划变差。

优化方案是在数据库层面建立合适的索引，并使用闭包表存储部门层级关系：

```sql
-- 核心业务表添加租户 ID 和部门 ID 的联合索引
CREATE INDEX idx_order_tenant_dept ON orders(tenant_id, dept_id);
CREATE INDEX idx_order_tenant_creator ON orders(tenant_id, creator_id);

-- 部门表使用闭包表存储层级关系，避免递归查询
CREATE TABLE dept_closure (
    ancestor_id   BIGINT NOT NULL,
    descendant_id BIGINT NOT NULL,
    depth         INT NOT NULL DEFAULT 0,
    PRIMARY KEY (ancestor_id, descendant_id)
);

-- 查询某部门的所有下属部门（一次索引查询，无需递归）
SELECT descendant_id FROM dept_closure 
WHERE ancestor_id = ? AND depth > 0;
```

用闭包表代替递归查询，可以将 O(N) 的递归降为 O(1) 的索引查询。代价是部门变更时需要维护闭包表，但部门变更频率极低，这个代价值得付出。在部门数超过 100 的系统中，闭包表是标准做法。

```go
// GetSubDeptIDs 使用闭包表查询下属部门
func (s *DeptService) GetSubDeptIDs(ctx context.Context, deptID int64) ([]int64, error) {
    var ids []int64
    err := s.db.WithContext(ctx).
        Model(&DeptClosure{}).
        Where("ancestor_id = ? AND depth > 0", deptID).
        Pluck("descendant_id", &ids).Error
    return ids, err
}
```

### 5.5 数据权限的动态配置

数据权限不应该是硬编码的，应该可以动态配置。管理员应该能在后台给不同角色配置不同的数据范围，而不是需要改代码。这个能力对于运营团队来说非常重要——他们需要根据业务变化灵活调整数据权限，而不是每次都提需求等开发排期：

```go
// RoleDataPermission 角色数据权限配置
type RoleDataPermission struct {
    ID            int64          `json:"id" gorm:"primaryKey;autoIncrement"`
    RoleID        int64          `json:"role_id" gorm:"uniqueIndex:idx_role_data_perm;not null"`
    ResourceType  string         `json:"resource_type" gorm:"uniqueIndex:idx_role_data_perm;not null"`
    ScopeType     DataScopeType  `json:"scope_type" gorm:"not null"`
    CustomDeptIDs pq.Int64Array  `json:"custom_dept_ids" gorm:"type:jsonb"`
    CreatedAt     time.Time      `json:"created_at"`
    UpdatedAt     time.Time      `json:"updated_at"`
}

// GetDataPermission 获取用户在某个资源上的数据权限
func (s *PermissionService) GetDataPermission(ctx context.Context, userID int64, resourceType string) (*DataScope, error) {
    cacheKey := fmt.Sprintf("data_perm:%d:%s", userID, resourceType)
    if cached, err := s.cache.Get(ctx, cacheKey); err == nil {
        return cached, nil
    }
    
    roleIDs, err := s.userRoleSvc.GetUserRoles(ctx, userID)
    if err != nil {
        return nil, err
    }
    
    var perms []RoleDataPermission
    err = s.db.WithContext(ctx).
        Where("role_id IN ? AND resource_type = ?", roleIDs, resourceType).
        Find(&perms).Error
    if err != nil {
        return nil, err
    }
    
    // 合并策略：取权限范围最大的
    // 优先级：全部 > 本部门及下属 > 本部门 > 自定义 > 仅本人
    scope := &DataScope{Type: DataScopeSelf}
    
    for _, perm := range perms {
        switch perm.ScopeType {
        case DataScopeAll:
            scope.Type = DataScopeAll
            scope.DeptIDs = nil
            return scope, nil // 最大权限，直接返回
            
        case DataScopeDeptBelow:
            if scope.Type < DataScopeDeptBelow {
                scope.Type = DataScopeDeptBelow
                scope.DeptIDs = nil
            }
            
        case DataScopeDept:
            if scope.Type < DataScopeDept {
                scope.Type = DataScopeDept
                scope.DeptIDs = nil
            }
            
        case DataScopeCustom:
            if scope.Type < DataScopeCustom {
                scope.Type = DataScopeCustom
                scope.DeptIDs = perm.CustomDeptIDs
            }
        }
    }
    
    s.cache.Set(ctx, cacheKey, scope, 5*time.Minute)
    return scope, nil
}
```

多角色数据权限合并的策略是"取最大值"：如果用户有两个角色，一个只能看本部门数据，另一个能看全部数据，那最终结果是能看全部数据。这符合直觉——权限是叠加的，限制最宽松的策略生效。但如果你需要更严格的策略（比如"只要有一个角色限制为仅本人，就只能看本人数据"），可以改为取最小值。这取决于业务需求。

> 动态配置是权限系统从"能用"到"好用"的分水岭。能让运营自己配置的，就别让开发改代码。每次改代码都是一次发版风险，而配置变更只是几条 SQL。

---

## 六、权限系统测试策略

权限系统的测试比一般业务逻辑要复杂得多，因为它涉及多种角色的组合、策略的交叉匹配、数据权限的边界条件。一个普通的 CRUD 模块可能只需要测试正常流程和异常流程各几条，但权限系统需要测试各种角色和权限的组合，测试用例数量是指数级增长的。比如你的系统有 5 种角色和 20 个权限点，理论上的组合就有 5 乘以 20 等于 100 种基本场景，再加上数据权限的 5 种范围和临时角色的过期场景，测试用例轻松突破 500 个。如果不做自动化测试，靠人工回归是不可能完成的。下面是我总结的测试模板和自动化测试代码，这套模板经过多个项目的验证，能帮你覆盖 95% 以上的权限场景。

### 6.1 权限测试清单

以下是权限系统的标准测试清单，每个权限系统上线前都应该过一遍：

```markdown
## 权限测试清单模板

### 认证测试
- [ ] 正确用户名密码登录，返回有效 token
- [ ] 错误密码登录，返回 401
- [ ] 过期 token 访问，返回 401
- [ ] 无效 token 格式访问，返回 401
- [ ] 缺少 Authorization 头访问，返回 401
- [ ] 被撤销的 token 访问，返回 401
- [ ] Refresh Token 换取新 Access Token 成功
- [ ] 过期 Refresh Token 换取失败
- [ ] Session 模式下重启服务后会话保持
- [ ] 并发登录限制正常生效

### 角色权限测试
- [ ] 超级管理员可以访问所有接口
- [ ] 普通用户不能访问管理接口
- [ ] 角色权限变更后缓存正确更新
- [ ] 临时角色过期后权限自动收回
- [ ] 用户多角色叠加权限正确合并
- [ ] 禁用角色后关联用户失去对应权限
- [ ] 删除正在使用的角色返回错误
- [ ] 内置角色不可删除不可修改关键字段

### 数据权限测试
- [ ] DataScopeAll 用户可以查看全部数据
- [ ] DataScopeSelf 用户只能查看本人数据
- [ ] DataScopeDept 用户只能查看本部门数据
- [ ] DataScopeDeptBelow 用户可查看本部门及下属部门数据
- [ ] DataScopeCustom 用户只能查看指定部门数据
- [ ] 多租户场景下不同租户数据完全隔离
- [ ] 管理员跨租户访问被拒绝
- [ ] 数据权限缓存失效后重新加载正确

### 边界条件测试
- [ ] 无任何角色的用户访问任何接口，返回 403
- [ ] 未知资源类型访问，返回 403
- [ ] 并发修改角色权限时的数据一致性
- [ ] 权限缓存失效后重新加载正确
- [ ] 批量分配角色后所有用户权限立即生效
- [ ] 策略冲突时 deny 优先
```

### 6.2 自动化测试代码

```go
package auth_test

import (
    "context"
    "testing"
    
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/suite"
)

type PermissionTestSuite struct {
    suite.Suite
    engine   engine.AuthzEngine
    userRepo UserRepository
    roleRepo RoleRepository
}

func (s *PermissionTestSuite) SetupTest() {
    s.engine = engine.NewDefaultEngine(testDB, testCache)
    s.userRepo = NewTestUserRepository(testDB)
    s.roleRepo = NewTestRoleRepository(testDB)
}

func (s *PermissionTestSuite) TestAdminCanAccessAllResources() {
    admin := s.userRepo.Create(context.Background(), &User{
        Username: "admin_test",
        Roles:    []int64{RoleSuperAdmin},
    })
    
    resource := &engine.Resource{Type: "orders", ID: "123"}
    action := &engine.Action{Type: "read"}
    
    decision, err := s.engine.Check(context.Background(), admin.ID, resource, action)
    
    s.NoError(err)
    s.True(decision.Allowed)
}

func (s *PermissionTestSuite) TestNormalUserCannotDeleteOthersOrder() {
    user := s.userRepo.Create(context.Background(), &User{
        Username: "normal_user",
        Roles:    []int64{RoleNormalUser},
    })
    
    resource := &engine.Resource{
        Type: "orders",
        ID:   "999",
        Meta: map[string]interface{}{"owner_id": int64(888)},
    }
    action := &engine.Action{Type: "delete"}
    
    decision, err := s.engine.Check(context.Background(), user.ID, resource, action)
    
    s.NoError(err)
    s.False(decision.Allowed)
}

func (s *PermissionTestSuite) TestUserCanAccessOwnResource() {
    user := s.userRepo.Create(context.Background(), &User{
        Username: "owner_user",
        Roles:    []int64{RoleNormalUser},
    })
    
    resource := &engine.Resource{
        Type: "orders",
        ID:   "123",
        Meta: map[string]interface{}{"owner_id": user.ID},
    }
    action := &engine.Action{Type: "read"}
    
    decision, err := s.engine.Check(context.Background(), user.ID, resource, action)
    
    s.NoError(err)
    s.True(decision.Allowed)
}

func (s *PermissionTestSuite) TestDenyPolicyOverridesAllow() {
    user := s.userRepo.Create(context.Background(), &User{
        Username: "test_user",
        Roles:    []int64{RoleWithDenyPolicy},
    })
    
    resource := &engine.Resource{Type: "orders", ID: "123"}
    action := &engine.Action{Type: "delete"}
    
    decision, err := s.engine.Check(context.Background(), user.ID, resource, action)
    
    s.NoError(err)
    s.False(decision.Allowed)
    s.Contains(decision.Reason, "denied")
}

func (s *PermissionTestSuite) TestDataPermissionScope() {
    user := s.userRepo.Create(context.Background(), &User{
        Username: "dept_user",
        DeptID:   100,
        Roles:    []int64{RoleDeptUser},
    })
    
    dataPerm := &DataScope{Type: DataScopeDept}
    scope := DataPermissionScope(context.Background(), dataPerm, user.ID, user.DeptID)
    
    sql := buildTestSQL(scope)
    s.Contains(sql, "dept_id = 100")
}

func (s *PermissionTestSuite) TestBatchCheckPermissions() {
    user := s.userRepo.Create(context.Background(), &User{
        Username: "batch_user",
        Roles:    []int64{RoleNormalUser},
    })
    
    resources := []*engine.Resource{
        {Type: "orders", ID: "1", Meta: map[string]interface{}{"owner_id": user.ID}},
        {Type: "orders", ID: "2", Meta: map[string]interface{}{"owner_id": int64(999)}},
        {Type: "orders", ID: "3", Meta: map[string]interface{}{"owner_id": user.ID}},
    }
    action := &engine.Action{Type: "read"}
    
    decisions, err := s.engine.BatchCheck(context.Background(), user.ID, resources, action)
    
    s.NoError(err)
    s.Len(decisions, 3)
    s.True(decisions[0].Allowed)    // 自己的订单
    s.False(decisions[1].Allowed)   // 他人的订单
    s.True(decisions[2].Allowed)    // 自己的订单
}

func TestPermissionSuite(t *testing.T) {
    suite.Run(t, new(PermissionTestSuite))
}
```

测试代码的设计有几个原则：每个测试用例只测一个场景，测试名称清晰表达测试意图，SetupTest 确保每个用例的数据隔离，边界条件和正常流程都要覆盖。权限系统的测试覆盖率不应该低于 90%，因为每一个未覆盖的分支都可能是一个安全漏洞。

> 测试不是权限系统的可选项，是必选项。线上出一次权限漏洞，损失远大于写测试的成本。每一次跳过权限测试的侥幸，都是在给未来的自己埋雷。

---

## 七、生产环境踩坑实录

理论讲完了，代码也给全了。但真正让你成长的不是这些，而是生产环境里的那些事故。最后分享几个我在生产环境中真实遇到的坑，每一个都是用通宵和故障报告换来的。希望你能提前规避。

### 坑一：权限缓存导致的安全漏洞

**现象：** 管理员在后台撤销了某用户的角色，但该用户在接下来几分钟内仍然可以正常访问不该访问的接口。安全审计时发现了这个漏洞，整个权限系统被标记为"不合规"。这个漏洞在金融行业是绝对不能容忍的，可能导致监管处罚。

**根因：** 权限缓存 TTL 设为 30 分钟，角色撤销操作没有主动清除缓存。用户在缓存过期前一直使用旧的权限数据。

**修复：** 在角色变更、权限变更、用户角色变更的所有写操作中，主动清除相关缓存。不能依赖 TTL 自然过期，必须主动失效。

```go
// InvalidateUserPermissionCache 失效用户权限缓存
func (s *PermissionService) InvalidateUserPermissionCache(ctx context.Context, userID int64) {
    // 清除权限缓存
    s.cache.Del(ctx, fmt.Sprintf("user_perms:%d", userID))
    // 清除数据权限缓存
    s.cache.Del(ctx, fmt.Sprintf("data_perm:%d:*", userID))
    // 清除授权引擎的决策缓存
    s.cache.Del(ctx, fmt.Sprintf("authz:%d:*", userID))
}

// 在所有权限变更操作中调用
func (s *RoleService) AssignRoleToUser(ctx context.Context, userID, roleID int64, expiresAt *time.Time) error {
    // ... 赋角色逻辑 ...
    
    // 主动清除缓存
    s.cache.InvalidateUserPermissions(ctx, userID)
    s.cache.InvalidateRolePermissions(ctx, roleID)
    
    return nil
}
```

**教训：** 缓存的 TTL 是兜底方案，不是唯一手段。所有变更操作必须主动清除缓存，TTL 只是为了防止缓存泄漏。

### 坑二：批量操作引发的缓存雪崩

**现象：** 运营批量导入 5000 个用户并分配角色，权限缓存批量失效，瞬间大量请求打到数据库，数据库连接池被打满，整条业务链路雪崩。告警铺天盖地，整个系统不可用。

**根因：** 批量操作时大量缓存同时失效，所有请求同时回源查数据库。数据库在瞬间承受了平时几十倍的查询压力。

**修复：** 批量操作时使用分批处理策略，每批 100 个用户，批次间短暂休眠，给缓存重建留时间。同时加互斥锁防止缓存击穿。

```go
// BatchAssignRolesProgressive 渐进式批量分配角色
func (s *RoleService) BatchAssignRolesProgressive(ctx context.Context, userIDs []int64, roleID int64, batchSize int) error {
    for i := 0; i < len(userIDs); i += batchSize {
        end := i + batchSize
        if end > len(userIDs) {
            end = len(userIDs)
        }
        
        batch := userIDs[i:end]
        
        err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
            userRoles := make([]model.UserRole, 0, len(batch))
            for _, uid := range batch {
                userRoles = append(userRoles, model.UserRole{
                    UserID: uid,
                    RoleID: roleID,
                    Source: "imported",
                })
            }
            return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&userRoles).Error
        })
        if err != nil {
            return err
        }
        
        // 分批清除缓存，避免雪崩
        for _, uid := range batch {
            s.cache.InvalidateUserPermissions(ctx, uid)
        }
        
        // 批次间短暂休眠，给缓存重建留时间
        time.Sleep(100 * time.Millisecond)
    }
    return nil
}
```

**教训：** 批量操作是缓存杀手。任何涉及大量数据变更的操作都必须分批进行，控制缓存失效的速率。

### 坑三：JWT token 中的角色信息过期

**现象：** 用户登录后管理员修改了其角色权限（从普通用户升级为管理员），但用户的 JWT token 中还携带旧的角色信息，导致权限校验使用的是过期数据，用户无法使用管理员功能。用户反馈"我已经被设为管理员了为什么还是没权限"。

**根因：** 把角色 ID 列表放进了 JWT 的 Claims 中，token 没过期之前角色信息不会更新。Access Token 的有效期是 15 分钟，也就是说用户最多要等 15 分钟才能用上新权限。

**修复：** JWT 中只放最小标识信息（UserID），角色和权限信息每次从缓存或数据库实时获取。虽然多了一次查询，但保证了权限的实时性。15 分钟的延迟在权限降级场景下是不可接受的——你撤销了某人的管理员权限，他还能再管理员操作 15 分钟。

```go
// 错误做法：把角色放进 JWT
// type Claims struct {
//     UserID   int64    `json:"user_id"`
//     RoleIDs  []int64  `json:"role_ids"` // 不要这样做！
// }

// 正确做法：JWT 只放 UserID，角色实时查询
type Claims struct {
    UserID   int64  `json:"user_id"`
    Username string `json:"username"`
    jwt.RegisteredClaims
}

// 权限检查时实时获取角色
func (e *DefaultEngine) Check(ctx context.Context, userID int64, resource *Resource, action *Action) (*Decision, error) {
    // 每次都从缓存获取最新角色（缓存 TTL 5 分钟）
    roleIDs, err := e.userRoleSvc.GetUserRoles(ctx, userID)
    if err != nil {
        return nil, err
    }
    // ... 后续逻辑
}
```

### 坑四：权限校验中间件遗漏 WebSocket 接口

**现象：** 系统中有一个 WebSocket 接口用于实时推送消息，权限校验中间件只配置了 HTTP 路由，WebSocket 连接绕过了权限检查。一个普通用户通过 WebSocket 连接后，能收到本不该看到的管理员频道消息。这个问题是被白帽子安全测试发现的，直接报了中危漏洞。

**根因：** WebSocket 的握手阶段是 HTTP 请求，但连接建立后的消息推送不走 HTTP 中间件链。权限校验只在 HTTP 层做了，WebSocket 消息层没有权限检查。开发同学以为握手阶段做了权限检查就够了，但握手后用户的角色可能已经变更，WebSocket 连接却不会重新校验。

**修复：** 在 WebSocket 的消息处理层增加权限校验，不能只依赖握手阶段的 HTTP 权限检查。每个消息频道都应该有独立的权限校验逻辑。同时，对于长连接场景，定期（比如每 5 分钟）重新校验用户权限，如果用户权限已变更，主动断开连接或更新频道订阅。

**教训：** 权限校验的覆盖面要全面，不能只覆盖 HTTP API。WebSocket、gRPC、消息队列消费者、定时任务等所有入口都要有权限校验。漏掉一个入口就是一条安全漏洞。权限校验不是 HTTP 中间件的专利，它是所有数据访问入口的必备品。

> 每一个坑都是用线上事故换来的教训。你在设计阶段多想一步，就能少一次凌晨被电话叫醒的经历。经验不是你经历了什么，而是你从经历中学到了什么。

---

## 八、权限系统核心实现步骤清单

把这一章的内容浓缩成一个可执行的步骤清单。如果你正在从零开始实现权限系统，或者正在重构现有的权限系统，按照这个清单一步步来，能帮你避开大部分坑：

1. **确定认证方案。** 内部系统选 Session + Redis；微服务选 JWT + Refresh Token + 黑名单；需要第三方接入叠加 OAuth2。不要混用，不要为了技术先进性选不合适的方案。

2. **设计数据模型。** Role、Permission、RolePermission、UserRole 四张表是基础。预留扩展字段（TenantID、ExpiresAt、Source），支持多租户和临时角色。内置角色标记 IsBuiltin 防止误删。

3. **实现角色 CRUD。** 注意内置角色保护（不可删、不可改关键字段）和删除前检查（是否有关联用户）。所有写操作用事务保证原子性。

4. **实现权限 CRUD。** 支持树形结构（ParentID）和多类型权限（菜单、按钮、API、数据）。权限 Code 全局唯一，使用 `resource:action` 格式。

5. **实现用户角色分配。** 支持 UPSERT 语义（已存在则更新过期时间）。支持批量分配。分配后主动清除缓存。

6. **设计授权引擎接口。** Check、BatchCheck、ListAccessible 三个方法。Decision 包含 Reason 和 Effects 用于审计。

7. **实现策略匹配和评估逻辑。** 遵循"默认拒绝、deny 优先、优先级排序"三原则。条件评估支持多种操作符（eq、ne、in、gt、lt 等）。

8. **开发权限校验中间件。** 集成到 Web 框架（Gin/Echo/Chi），对业务代码透明。从路径提取资源类型，从 HTTP 方法映射操作类型。

9. **实现数据权限过滤。** 使用 ORM Scope 机制实现零侵入。支持五种数据范围模型。业务代码只需加一行 Scopes 调用。

10. **配置多租户隔离。** 使用 GORM 回调实现全局过滤。Query、Create、Update、Delete 四个回调都要注册。管理员后台用 skip 标记跳过。

11. **建立权限缓存机制。** TTL 控制在 5 分钟以内。所有变更操作主动清除缓存。批量操作分批清除，防止雪崩。

12. **编写权限测试清单。** 覆盖认证、角色权限、数据权限、边界条件四大类。测试覆盖率不低于 90%。

13. **在所有权限变更操作中加入缓存主动失效逻辑。** 不能依赖 TTL 自然过期。角色变更要清除角色缓存和所有关联用户的缓存。

14. **对批量操作做分批处理。** 每批 100-200 条，批次间休眠 100ms。给缓存重建留时间，防止雪崩。

---

## 九、权限审计日志

权限系统还有一个经常被忽略的功能：审计日志。谁在什么时候对谁做了什么权限操作？这些记录在安全审计和问题排查时至关重要。我见过一个系统出了权限漏洞后，因为没有审计日志，根本查不出是谁修改了哪个策略，最后只能全量回滚。

```go
// PermissionAuditLog 权限审计日志
type PermissionAuditLog struct {
    ID         int64     `json:"id" gorm:"primaryKey;autoIncrement"`
    OperatorID int64     `json:"operator_id" gorm:"index;not null"`  // 操作人
    Action     string    `json:"action" gorm:"size:32;not null"`     // assign_role, revoke_role, update_permission, etc.
    TargetType string    `json:"target_type" gorm:"size:32;not null"` // user, role, permission
    TargetID   int64     `json:"target_id" gorm:"index;not null"`    // 目标 ID
    OldValue   string    `json:"old_value" gorm:"type:text"`         // 变更前的值（JSON）
    NewValue   string    `json:"new_value" gorm:"type:text"`         // 变更后的值（JSON）
    Reason     string    `json:"reason" gorm:"size:256"`             // 变更原因
    ClientIP   string    `json:"client_ip" gorm:"size:64"`
    CreatedAt  time.Time `json:"created_at" gorm:"index"`
}

// LogAudit 记录审计日志
func (s *AuditService) LogAudit(ctx context.Context, log *PermissionAuditLog) error {
    log.CreatedAt = time.Now()
    return s.db.WithContext(ctx).Create(log).Error
}

// 在角色分配时记录审计日志
func (s *RoleService) AssignRoleToUser(ctx context.Context, userID, roleID int64, expiresAt *time.Time) error {
    // 获取变更前的值
    var oldValue *model.UserRole
    s.db.Where("user_id = ? AND role_id = ?", userID, roleID).First(oldValue)
    
    // 执行变更
    err := s.assignRole(ctx, userID, roleID, expiresAt)
    if err != nil {
        return err
    }
    
    // 记录审计日志
    operatorID := ctx.Value("user_id").(int64)
    s.auditSvc.LogAudit(ctx, &PermissionAuditLog{
        OperatorID: operatorID,
        Action:     "assign_role",
        TargetType: "user",
        TargetID:   userID,
        OldValue:   toJSON(oldValue),
        NewValue:   toJSON(&model.UserRole{UserID: userID, RoleID: roleID, ExpiresAt: expiresAt}),
        Reason:     "manual assignment",
        ClientIP:   ctx.Value("client_ip").(string),
    })
    
    return nil
}
```

审计日志的查询也很重要。管理后台应该提供审计日志查询界面，支持按操作人、目标、时间范围、操作类型筛选。出了问题时，能快速定位"谁在什么时候改了什么"。

> 没有审计日志的权限系统就像没有监控摄像头的金库。出了问题你既不知道谁进来了，也不知道他们做了什么，更不知道东西是什么时候没的。审计日志不是锦上添花，是合规底线。

---

这一章我们从认证讲到授权，从接口权限讲到数据权限，把权限系统的核心功能链路完整实现了一遍。认证机制的选择决定了系统的扩展性，授权引擎的设计决定了权限的灵活性，数据权限过滤决定了业务的安全性，权限中间件决定了业务代码的整洁度。每一个环节都有坑，但每一个坑都有解法。关键是在设计阶段就想清楚，而不是在踩坑之后再补窟窿。

如果你觉得这篇内容对你有帮助，点个收藏，后面写代码的时候翻出来对照着看。有什么问题或者不同的做法，评论区聊聊，权限系统的设计没有标准答案，只有更适合自己业务的选择。我在评论区等你。

这个系列会持续更新，下一章我们聊**权限系统高可用与扩展**——当你的权限系统需要支撑百万级用户、十万级 QPS 时，缓存策略怎么设计、分布式环境下怎么做权限同步、权限服务怎么做到高可用。那些真正在 scale 才会遇到的问题，每一个都是硬骨头。我们下一章见。

系列进度：6/16

下一章预告：第7章——权限系统高可用与扩展

---

怕浪猫说：权限系统的实现不是一次性的工作，而是一个持续演进的过程。从最初几个 if-else 够用的简单场景，到 RBAC 的角色权限分离，再到策略引擎的灵活匹配，每一步演进都是被业务需求推着走的。不要试图一开始就设计一个完美的权限系统，先让它能跑起来，再让它跑得稳，最后让它跑得快。但有一个原则从一开始就要坚持：权限逻辑和业务逻辑必须分离。这一条线画好了，后面的路就好走多了。认证、授权、数据权限三层架构各司其职，每一层都可以独立演进而不影响其他层。这不是过度设计，这是工程纪律，也是专业工程师的基本素养。
