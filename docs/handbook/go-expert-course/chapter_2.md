# Go技术专家进阶营（二）：通知平台核心功能实现

> 以为写个通知平台就是调几个API？真正动手的时候才知道，光一个模板引擎就有十几种坑等着你。

我是怕浪猫，继续Go技术专家进阶营系列。上一周我们完成了通知平台的需求分析和架构设计，画好了蓝图。这周开始砌砖——实现通知平台的核心功能。

> 核心功能不是最难的，但是最基础的。地基打不好，上面盖多高都是白搭。

---

## 2.1 通用标准接口设计与实现

### 接口设计原则

通知平台的通用标准接口要满足三个要求：统一入口、统一协议、统一错误处理。

统一入口意味着所有业务方通过同一个API发送通知，不管发短信还是发邮件，都是调用`/api/v1/notify/send`。统一协议意味着请求和响应都遵循统一的格式规范，字段命名一致、数据类型一致。统一错误处理意味着所有错误都用同一套错误码体系，业务方不需要针对不同渠道写不同的错误处理逻辑。

### 标准接口实现

**发送接口：**

```go
func (h *NotifyHandler) Send(c *gin.Context) {
    var req SendRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, ErrorResponse{
            Code:    ErrCodeInvalidParam,
            Message: err.Error(),
        })
        return
    }
    
    ctx := c.Request.Context()
    
    // 鉴权
    authCtx, err := h.authService.Auth(ctx, &req)
    if err != nil {
        c.JSON(http.StatusUnauthorized, ErrorResponse{
            Code:    ErrCodeAuthFailed,
            Message: err.Error(),
        })
        return
    }
    ctx = context.WithValue(ctx, AuthCtxKey, authCtx)
    
    // 限流
    if !h.limiter.Allow(authCtx.AppID, req.Channel) {
        c.JSON(http.StatusTooManyRequests, ErrorResponse{
            Code:    ErrCodeRateLimited,
            Message: "rate limit exceeded",
        })
        return
    }
    
    // 幂等检查
    exists, err := h.idempotent.Check(ctx, req.BizID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, ErrorResponse{
            Code:    ErrCodeInternal,
            Message: "idempotent check failed",
        })
        return
    }
    if exists {
        c.JSON(http.StatusOK, SendResponse{
            BizID:   req.BizID,
            Status:  "duplicate",
        })
        return
    }
    
    // 发送
    resp, err := h.notifyService.Send(ctx, &req)
    if err != nil {
        c.JSON(http.StatusBadRequest, ErrorResponse{
            Code:    ErrCodeSendFailed,
            Message: err.Error(),
        })
        return
    }
    
    c.JSON(http.StatusOK, resp)
}
```

这个接口实现包含了5个关键步骤：参数校验、鉴权、限流、幂等检查、发送。每个步骤失败都返回统一的错误格式。注意鉴权通过后把AuthContext放入context，后续模块可以从context中获取业务方信息。

**批量发送接口：**

批量发送接口和单条发送接口的鉴权、限流逻辑相同，区别在于处理层。批量发送需要考虑：

1. 单次批量上限（如最多1000条）
2. 部分成功部分失败的处理策略
3. 批量幂等检查（用Redis的MSETNX批量检查）
4. 异步处理——批量请求通常量大，直接入MQ异步处理

```go
func (h *NotifyHandler) SendBatch(c *gin.Context) {
    var reqs []*SendRequest
    if err := c.ShouldBindJSON(&reqs); err != nil {
        c.JSON(http.StatusBadRequest, ErrorResponse{Code: ErrCodeInvalidParam, Message: err.Error()})
        return
    }
    
    if len(reqs) > MaxBatchSize {
        c.JSON(http.StatusBadRequest, ErrorResponse{
            Code:    ErrCodeBatchTooLarge,
            Message: fmt.Sprintf("batch size exceeds limit %d", MaxBatchSize),
        })
        return
    }
    
    ctx := c.Request.Context()
    authCtx, err := h.authService.Auth(c, reqs[0])
    if err != nil {
        c.JSON(http.StatusUnauthorized, ErrorResponse{Code: ErrCodeAuthFailed, Message: err.Error()})
        return
    }
    
    results := make([]BatchResult, len(reqs))
    for i, req := range reqs {
        resp, err := h.notifyService.Send(ctx, req)
        if err != nil {
            results[i] = BatchResult{BizID: req.BizID, Status: "failed", Error: err.Error()}
        } else {
            results[i] = BatchResult{BizID: req.BizID, Status: resp.Status, MessageID: resp.MessageID}
        }
    }
    
    c.JSON(http.StatusOK, BatchResponse{Results: results})
}
```

**查询接口：**

查询接口让业务方查询通知的发送结果。实现上就是根据biz_id查询消息表：

```go
func (h *NotifyHandler) Query(c *gin.Context) {
    bizID := c.Query("biz_id")
    if bizID == "" {
        c.JSON(http.StatusBadRequest, ErrorResponse{Code: ErrCodeInvalidParam, Message: "biz_id required"})
        return
    }
    
    result, err := h.notifyService.Query(c.Request.Context(), bizID)
    if err != nil {
        c.JSON(http.StatusNotFound, ErrorResponse{Code: ErrCodeNotFound, Message: err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, result)
}
```

### 统一错误码体系

```go
const (
    ErrCodeInvalidParam   = 40001
    ErrCodeAuthFailed     = 40101
    ErrCodeNoPermission   = 40301
    ErrCodeNotFound       = 40401
    ErrCodeRateLimited    = 42901
    ErrCodeBatchTooLarge  = 42902
    ErrCodeSendFailed     = 40002
    ErrCodeTemplateNotFound = 40003
    ErrCodeChannelUnavailable = 50301
    ErrCodeInternal       = 50001
)

type ErrorResponse struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    RequestID string `json:"request_id,omitempty"`
}
```

错误码设计遵循HTTP语义：4xx客户端错误、5xx服务端错误。每个错误有唯一的6位编码，前3位对应HTTP状态码，后3位是序号。RequestID用于链路追踪，方便排查问题。

> 好的接口设计让调用方一看就懂、一调就通。好的错误码让排障时一眼定位问题。这两件事看似简单，做好的团队不多。

---

## 2.2 多渠道通知支持

### 渠道抽象设计

通知平台要支持短信、邮件、Push、站内信四种渠道，未来还可能增加企业微信、钉钉等。所以渠道层必须做好抽象。

渠道抽象的核心是ChannelClient接口：

```go
type ChannelClient interface {
    Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error)
    Health(ctx context.Context) error
    Name() string
}

type ChannelMessage struct {
    MessageID  string
    Receiver   string
    Content    string
    Subject    string
    Title      string
    Extra      map[string]string
}

type ChannelResult struct {
    ProviderID string
    Status     ResultStatus
    Error      string
}
```

每个渠道只需要实现这个接口。路由模块通过ChannelClient接口调用渠道，不关心具体实现。新增渠道只需要实现接口并注册到渠道工厂。

### 短信渠道实现

短信渠道对接阿里云短信服务：

```go
type AliyunSMSClient struct {
    client *dysmsapi.Client
    signName string
    accessKey string
    accessSecret string
}

func (c *AliyunSMSClient) Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    req := &dysmsapi.SendSmsRequest{
        PhoneNumbers:  tea.String(msg.Receiver),
        SignName:      tea.String(c.signName),
        TemplateCode:  tea.String(msg.Extra["template_code"]),
        TemplateParam: tea.String(msg.Content),
    }
    
    resp, err := c.client.SendSmsWithContext(ctx, req)
    if err != nil {
        return &ChannelResult{Status: StatusFailed, Error: err.Error()}, err
    }
    
    if *resp.Body.Code != "OK" {
        return &ChannelResult{
            Status: StatusFailed,
            Error:  *resp.Body.Message,
        }, fmt.Errorf("sms send failed: %s", *resp.Body.Message)
    }
    
    return &ChannelResult{
        ProviderID: *resp.Body.BizId,
        Status:     StatusSent,
    }, nil
}

func (c *AliyunSMSClient) Name() string { return "sms_aliyun" }

func (c *AliyunSMSClient) Health(ctx context.Context) error {
    // 调用查询余额或测试接口
    return nil
}
```

### 邮件渠道实现

邮件渠道使用标准库的net/smtp或第三方库gomail：

```go
type EmailClient struct {
    host     string
    port     int
    username string
    password string
    from     string
}

func (c *EmailClient) Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    m := gomail.NewMessage()
    m.SetHeader("From", c.from)
    m.SetHeader("To", msg.Receiver)
    m.SetHeader("Subject", msg.Subject)
    m.SetBody("text/html", msg.Content)
    
    d := gomail.NewDialer(c.host, c.port, c.username, c.password)
    
    if err := d.DialAndSend(m); err != nil {
        return &ChannelResult{Status: StatusFailed, Error: err.Error()}, err
    }
    
    return &ChannelResult{
        ProviderID: msg.MessageID,
        Status:     StatusSent,
    }, nil
}

func (c *EmailClient) Name() string { return "email_smtp" }
```

### Push渠道实现

Push渠道对接APNs（iOS）和FCM（Android）：

```go
type PushClient struct {
    apnsClient *apns2.Client
    fcmClient  *fcm.Client
}

func (c *PushClient) Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    deviceType := msg.Extra["device_type"]
    
    switch deviceType {
    case "ios":
        return c.sendToAPNS(ctx, msg)
    case "android":
        return c.sendToFCM(ctx, msg)
    default:
        return nil, fmt.Errorf("unsupported device type: %s", deviceType)
    }
}

func (c *PushClient) sendToAPNS(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    notification := &apns2.Notification{
        DeviceToken: msg.Receiver,
        Topic:       msg.Extra["bundle_id"],
        Payload:     payload.NewPayload().Alert(msg.Title).Body(msg.Content),
    }
    
    resp, err := c.apnsClient.PushWithContext(ctx, notification)
    if err != nil {
        return &ChannelResult{Status: StatusFailed, Error: err.Error()}, err
    }
    
    if resp.StatusCode != http.StatusOK {
        return &ChannelResult{Status: StatusFailed, Error: resp.Reason}, nil
    }
    
    return &ChannelResult{ProviderID: resp.ApnsID, Status: StatusSent}, nil
}
```

### 站内信渠道实现

站内信不需要对接外部服务，直接写数据库：

```go
type IMClient struct {
    db *gorm.DB
}

func (c *IMClient) Send(ctx context.Context, msg *ChannelMessage) (*ChannelResult, error) {
    record := &UserMessage{
        MessageID:  msg.MessageID,
        UserID:     msg.Receiver,
        Title:      msg.Title,
        Content:    msg.Content,
        Category:   msg.Extra["category"],
        Status:     "unread",
        CreatedAt:  time.Now(),
    }
    
    if err := c.db.WithContext(ctx).Create(record).Error; err != nil {
        return &ChannelResult{Status: StatusFailed, Error: err.Error()}, err
    }
    
    // 可选：通过WebSocket实时推送
    // c.wsHub.PushToUser(msg.Receiver, msg)
    
    return &ChannelResult{ProviderID: msg.MessageID, Status: StatusSent}, nil
}
```

### 渠道工厂与注册

用工厂模式管理渠道实例：

```go
type ChannelFactory struct {
    clients map[string]ChannelClient
    mu      sync.RWMutex
}

func NewChannelFactory() *ChannelFactory {
    return &ChannelFactory{clients: make(map[string]ChannelClient)}
}

func (f *ChannelFactory) Register(name string, client ChannelClient) {
    f.mu.Lock()
    defer f.mu.Unlock()
    f.clients[name] = client
}

func (f *ChannelFactory) Get(name string) (ChannelClient, error) {
    f.mu.RLock()
    defer f.mu.RUnlock()
    client, ok := f.clients[name]
    if !ok {
        return nil, fmt.Errorf("channel %s not found", name)
    }
    return client, nil
}
```

初始化时注册所有渠道：

```go
func InitChannels(cfg *config.Config) *ChannelFactory {
    factory := NewChannelFactory()
    
    // 短信渠道
    if cfg.SMS.Enabled {
        smsClient := NewAliyunSMSClient(cfg.SMS.AccessKey, cfg.SMS.AccessSecret, cfg.SMS.SignName)
        factory.Register("sms", smsClient)
    }
    
    // 邮件渠道
    if cfg.Email.Enabled {
        emailClient := NewEmailClient(cfg.Email.Host, cfg.Email.Port, cfg.Email.Username, cfg.Email.Password, cfg.Email.From)
        factory.Register("email", emailClient)
    }
    
    // Push渠道
    if cfg.Push.Enabled {
        pushClient := NewPushClient(cfg.Push.APNSKey, cfg.Push.APNSTeamID, cfg.Push.FCMAPIKey)
        factory.Register("push", pushClient)
    }
    
    // 站内信渠道
    if cfg.IM.Enabled {
        imClient := NewIMClient(db)
        factory.Register("im", imClient)
    }
    
    return factory
}
```

> 渠道抽象的关键是"对扩展开放，对修改关闭"。新增渠道只需要写一个新的Client实现接口并注册到工厂，不需要改路由模块、调度模块的任何代码。这就是设计模式的力量。

---

## 2.3 消息模板引擎设计

### 模板引擎需求

通知平台的模板引擎需要满足：

1. **变量替换**：支持 `${variable_name}` 格式的变量占位符
2. **多渠道适配**：同一模板渲染为不同渠道的格式
3. **条件渲染**：根据变量值决定渲染内容（如VIP用户显示专属文案）
4. **模板校验**：渲染前校验必填变量是否提供
5. **模板缓存**：高频模板缓存到内存，减少DB查询

### 模板引擎实现

基于Go标准库的text/template实现模板引擎：

```go
type TemplateEngine struct {
    cache *template.Cache
    store TemplateStore
}

func NewTemplateEngine(store TemplateStore) *TemplateEngine {
    return &TemplateEngine{
        cache: template.NewCache(),
        store: store,
    }
}

func (e *TemplateEngine) Render(ctx context.Context, templateID string, variables map[string]string) (*RenderResult, error) {
    // 1. 获取模板（优先从缓存）
    tpl, err := e.getTemplate(ctx, templateID)
    if err != nil {
        return nil, fmt.Errorf("get template failed: %w", err)
    }
    
    // 2. 校验必填变量
    if err := e.validateVariables(tpl, variables); err != nil {
        return nil, fmt.Errorf("validate variables failed: %w", err)
    }
    
    // 3. 填充默认值
    variables = e.fillDefaults(tpl, variables)
    
    // 4. 渲染
    content, err := e.renderContent(tpl.Content, variables)
    if err != nil {
        return nil, fmt.Errorf("render content failed: %w", err)
    }
    
    // 5. 渠道适配处理
    result := &RenderResult{
        Channel: tpl.Channel,
        Content: content,
    }
    
    // 邮件渠道额外渲染主题
    if tpl.Channel == "email" && tpl.Subject != "" {
        subject, err := e.renderContent(tpl.Subject, variables)
        if err != nil {
            return nil, fmt.Errorf("render subject failed: %w", err)
        }
        result.Subject = subject
    }
    
    // Push渠道额外渲染标题
    if tpl.Channel == "push" && tpl.Title != "" {
        title, err := e.renderContent(tpl.Title, variables)
        if err != nil {
            return nil, fmt.Errorf("render title failed: %w", err)
        }
        result.Title = title
    }
    
    return result, nil
}

func (e *TemplateEngine) getTemplate(ctx context.Context, templateID string) (*Template, error) {
    // 先查缓存
    if tpl, ok := e.cache.Get(templateID); ok {
        return tpl, nil
    }
    
    // 查数据库
    tpl, err := e.store.Get(ctx, templateID)
    if err != nil {
        return nil, err
    }
    
    // 写入缓存
    e.cache.Set(templateID, tpl, 5*time.Minute)
    return tpl, nil
}

func (e *TemplateEngine) validateVariables(tpl *Template, variables map[string]string) error {
    for _, v := range tpl.Variables {
        if v.Required {
            if _, ok := variables[v.Name]; !ok {
                return fmt.Errorf("missing required variable: %s", v.Name)
            }
        }
    }
    return nil
}

func (e *TemplateEngine) fillDefaults(tpl *Template, variables map[string]string) map[string]string {
    result := make(map[string]string)
    for k, v := range variables {
        result[k] = v
    }
    for _, v := range tpl.Variables {
        if _, ok := result[v.Name]; !ok && v.Default != "" {
            result[v.Name] = v.Default
        }
    }
    return result
}

func (e *TemplateEngine) renderContent(content string, variables map[string]string) (string, error) {
    // 将 ${var} 替换为 Go template 语法 {{.var}}
    tmplText := convertPlaceholder(content)
    
    tmpl, err := template.New("msg").Parse(tmplText)
    if err != nil {
        return "", err
    }
    
    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, variables); err != nil {
        return "", err
    }
    
    return buf.String(), nil
}

func convertPlaceholder(s string) string {
    // ${user_name} -> {{.user_name}}
    re := regexp.MustCompile(`\$\{(\w+)\}`)
    return re.ReplaceAllString(s, `{{.$1}}`)
}
```

### 模板缓存设计

模板缓存使用两级缓存：本地内存缓存（L1）+ Redis缓存（L2）。

L1缓存使用sync.Map，TTL 5分钟，最大1000个模板。L2缓存使用Redis，TTL 30分钟。查询顺序：L1 → L2 → DB。模板更新时通过Pub/Sub通知所有节点失效L1缓存。

```go
type TemplateCache struct {
    local  *sync.Map
    redis  *redis.Client
    pubsub *redis.PubSub
}

func (c *TemplateCache) Get(templateID string) (*Template, bool) {
    if v, ok := c.local.Load(templateID); ok {
        return v.(*Template), true
    }
    
    // L1 miss, 查L2
    data, err := c.redis.Get(context.Background(), "tpl:"+templateID).Bytes()
    if err == nil {
        var tpl Template
        if json.Unmarshal(data, &tpl) == nil {
            c.local.Store(templateID, &tpl)
            return &tpl, true
        }
    }
    return nil, false
}

func (c *TemplateCache) Invalidate(templateID string) {
    c.local.Delete(templateID)
    c.redis.Del(context.Background(), "tpl:"+templateID)
    // 通知其他节点
    c.redis.Publish(context.Background(), "template_invalidate", templateID)
}
```

> 模板引擎看起来简单，但坑在于边界情况：变量值为空时怎么处理？模板内容有特殊字符怎么转义？模板语法错误怎么提前发现？这些都需要在上线前用充分的测试用例覆盖。

### 模板生命周期管理

模板从创建到上线经历完整的生命周期：

草稿（draft）→ 待审核（pending）→ 审核通过（approved）→ 上线（online）→ 下线（offline）

草稿状态下可以自由编辑。提交审核后进入待审核状态，不能编辑。审核通过后变为approved状态，可以发布上线。上线后模板可以被业务方使用。下线后不能再被使用，但已发送的记录保留。

状态流转通过状态机控制，防止非法状态跳转：

```go
var templateStateTransitions = map[TemplateStatus][]TemplateStatus{
    StatusDraft:    {StatusPending, StatusDraft},
    StatusPending:  {StatusApproved, StatusRejected, StatusPending},
    StatusApproved: {StatusOnline, StatusApproved},
    StatusOnline:   {StatusOffline, StatusOnline},
    StatusOffline:  {StatusOnline, StatusOffline},
    StatusRejected: {StatusDraft, StatusRejected},
}

func (s *TemplateService) TransitState(ctx context.Context, templateID string, target TemplateStatus) error {
    tpl, err := s.store.Get(ctx, templateID)
    if err != nil {
        return err
    }
    
    allowed := templateStateTransitions[tpl.Status]
    valid := false
    for _, s := range allowed {
        if s == target {
            valid = true
            break
        }
    }
    if !valid {
        return fmt.Errorf("invalid state transition: %s -> %s", tpl.Status, target)
    }
    
    tpl.Status = target
    tpl.UpdatedAt = time.Now()
    return s.store.Update(ctx, tpl)
}
```

---

## 2.4 业务方接入控制机制实现

### 接入控制架构

业务方接入控制分为三层：接入前的身份验证、接入时的权限校验、接入后的流量控制。

身份验证在2.1节已经讲过（HMAC签名）。权限校验确保业务方只能使用被授权的渠道和模板。流量控制防止业务方发送量过大打爆系统。

### 权限校验实现

权限模型采用简化的RBAC：业务方（App）绑定可用的渠道列表和模板列表。

```go
type Permission struct {
    AppID       string
    Channels    []string  // 允许使用的渠道
    Templates   []string  // 允许使用的模板（*表示全部）
    MaxPriority int       // 允许的最高优先级
}

type PermissionStore interface {
    Get(ctx context.Context, appID string) (*Permission, error)
    Grant(ctx context.Context, appID string, perm *Permission) error
    Revoke(ctx context.Context, appID string, channel string) error
}
```

权限校验：

```go
func (s *AuthService) CheckPermission(appID, channel, templateID string) bool {
    perm, err := s.permStore.Get(context.Background(), appID)
    if err != nil {
        return false
    }
    
    // 检查渠道权限
    channelAllowed := false
    for _, c := range perm.Channels {
        if c == channel || c == "*" {
            channelAllowed = true
            break
        }
    }
    if !channelAllowed {
        return false
    }
    
    // 检查模板权限
    for _, t := range perm.Templates {
        if t == templateID || t == "*" {
            return true
        }
    }
    return false
}
```

### 流量控制实现

流量控制使用令牌桶算法，按业务方+渠道维度限流：

```go
type TokenBucketLimiter struct {
    redis    *redis.Client
    rate     int   // 每秒令牌数
    capacity int   // 桶容量
}

func (l *TokenBucketLimiter) Allow(appID, channel string) bool {
    key := fmt.Sprintf("ratelimit:%s:%s", appID, channel)
    
    // Lua脚本保证原子性
    script := `
        local key = KEYS[1]
        local rate = tonumber(ARGV[1])
        local capacity = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1]) or capacity
        local lastRefill = tonumber(bucket[2]) or now
        
        -- 补充令牌
        local elapsed = now - lastRefill
        local refill = math.floor(elapsed * rate / 1000)
        tokens = math.min(capacity, tokens + refill)
        
        if tokens < 1 then
            return 0
        end
        
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600)
        return 1
    `
    
    result, err := l.redis.Eval(context.Background(), script, []string{key},
        l.rate, l.capacity, time.Now().UnixMilli()).Int()
    if err != nil {
        // Redis异常时默认放行，避免限流系统故障导致服务不可用
        return true
    }
    return result == 1
}
```

日配额控制：

```go
type DailyQuotaChecker struct {
    redis *redis.Client
}

func (c *DailyQuotaChecker) CheckAndConsume(ctx context.Context, appID, channel string, quota int) error {
    key := fmt.Sprintf("quota:%s:%s:%s", appID, channel, time.Now().Format("20060102"))
    
    current, err := c.redis.Incr(ctx, key).Result()
    if err != nil {
        return err
    }
    
    if current == 1 {
        c.redis.Expire(ctx, key, 25*time.Hour)
    }
    
    if current > int64(quota) {
        return fmt.Errorf("daily quota exceeded: %d/%d", current, quota)
    }
    
    return nil
}
```

> 限流系统设计有一个重要原则：限流系统本身不能成为系统的单点故障。当Redis挂了，限流系统不可用时，应该选择"放行"而不是"拒绝"，因为限流是保护手段不是核心功能。宁可短暂不限流，也不能因为限流系统故障导致整个服务不可用。

### 接入控制完整流程

一条请求的完整接入控制流程：

1. 解析请求中的app_id
2. 从缓存加载业务方密钥和权限配置
3. 验证HMAC签名（身份验证）
4. 检查渠道和模板权限（权限校验）
5. 检查QPS限流（令牌桶）
6. 检查日配额（计数器）
7. 检查发送时间窗口（如营销类短信8:00-22:00）
8. 检查用户免打扰设置
9. 通过所有检查，进入处理层

每一步都可以通过配置开关控制是否启用。比如开发环境可以关闭限流和配额检查，方便测试。

---

## 2.5 缓存策略设计与应用

### 缓存架构

通知平台的缓存采用三级结构：

**L1 本地缓存（sync.Map / FreeCache）**：存放热点数据，如高频模板、业务方权限配置。TTL 5分钟，容量有限（100MB）。

**L2 Redis缓存**：存放次热点数据，如所有模板、渠道配置、限流计数器。TTL 30分钟，容量大（几GB）。

**L3 MySQL**：持久化存储，全量数据。

查询顺序：L1 → L2 → L3。写入顺序：先写L3，再写L2，再通知L1失效。

### 各模块缓存策略

**模板缓存：**

模板数据读多写少，非常适合缓存。高频模板缓存在L1，所有approved状态的模板缓存在L2。模板更新时通过Redis Pub/Sub通知所有节点失效L1。

缓存Key：`tpl:{template_id}`
缓存Value：Template结构体JSON
TTL：L1 5分钟，L2 30分钟
更新策略：写时失效（Write-Invalidate）

**业务方配置缓存：**

业务方的密钥、权限、限流配置也需要缓存。这些数据变更频率低，但每次请求都需要读取。

缓存Key：`perm:{app_id}`
缓存Value：Permission结构体JSON
TTL：L1 5分钟，L2 30分钟
更新策略：写时失效

**幂等去重缓存：**

幂等检查用Redis的SETNX实现：

```go
func (c *IdempotentChecker) Check(ctx context.Context, bizID string) (bool, error) {
    key := fmt.Sprintf("idempotent:%s", bizID)
    result, err := c.redis.SetNX(ctx, key, "1", 24*time.Hour).Result()
    if err != nil {
        return false, err
    }
    // result=true 表示key不存在，是首次请求
    // result=false 表示key已存在，是重复请求
    return !result, nil
}
```

SETNX是原子操作，保证在并发情况下不会出现竞态条件。TTL 24小时，超过24小时的biz_id可以重复处理（业务场景上，24小时后的重复请求通常不是重复发送，而是业务方重新触发的）。

**配额计数缓存：**

日配额计数用Redis的INCR实现，每天一个Key，自动过期。见上面的DailyQuotaChecker。

**渠道可用性缓存：**

渠道健康检查结果缓存，避免每次发送都做健康检查：

```go
type ChannelHealthCache struct {
    redis  *redis.Client
    ttl    time.Duration
}

func (c *ChannelHealthCache) IsAvailable(ctx context.Context, channel string) bool {
    key := fmt.Sprintf("channel_health:%s", channel)
    val, err := c.redis.Get(ctx, key).Result()
    if err == redis.Nil {
        // 缓存未命中，需要实际检查
        return true // 默认可用
    }
    return val == "1"
}

func (c *ChannelHealthCache) SetUnavailable(ctx context.Context, channel string) {
    key := fmt.Sprintf("channel_health:%s", channel)
    c.redis.Set(ctx, key, "0", c.ttl)
}
```

当渠道发送连续失败超过阈值时，标记渠道不可用，后续请求自动降级到备选渠道。不可用状态有TTL（如5分钟），过期后自动恢复检查。

### 缓存一致性策略

通知平台的缓存一致性采用"最终一致"策略：

1. 写数据时先更新MySQL，再删除Redis缓存，再通过Pub/Sub通知本地缓存失效
2. 读数据时先查L1，miss查L2，再miss查DB并回写
3. 极端情况下（如通知失败），缓存最多有TTL时间的延迟

对于强一致要求的场景（如业务方权限变更需要立即生效），可以同步删除所有层级的缓存并等待确认。

> 缓存不是银弹。每个缓存层都增加了一致性风险和系统复杂度。加缓存之前先问自己：这个数据真的需要缓存吗？读频率有多高？不一致的后果有多严重？想清楚再动手。

### 缓存穿透与雪崩防护

**缓存穿透：** 恶意请求查询不存在的template_id，每次都打到DB。防护方案：对查询结果为空的也缓存（空值缓存，TTL 1分钟），或者用布隆过滤器过滤。

**缓存雪崩：** 大量缓存同时过期，请求全部打到DB。防护方案：TTL加随机偏移量（如30分钟±5分钟），避免同时过期。或者用限流降级保护DB。

**缓存击穿：** 热点Key过期瞬间大量请求打到DB。防护方案：用singleflight确保同一Key只有一个请求打到DB，其他请求等待结果。

```go
import "golang.org/x/sync/singleflight"

type TemplateLoader struct {
    store    TemplateStore
    group    singleflight.Group
}

func (l *TemplateLoader) Load(ctx context.Context, templateID string) (*Template, error) {
    // singleflight确保同一templateID只有一个请求查DB
    v, err, _ := l.group.Do(templateID, func() (interface{}, error) {
        return l.store.Get(ctx, templateID)
    })
    if err != nil {
        return nil, err
    }
    return v.(*Template), nil
}
```

---

## 2.6 核心功能集成与测试

### 功能集成

把前面实现的各个模块组装起来，形成完整的处理链路：

```go
type NotificationService struct {
    templateEngine *TemplateEngine
    router         RouterService
    scheduler      SchedulerService
    idempotent     *IdempotentChecker
    quotaChecker   *DailyQuotaChecker
    limiter        *TokenBucketLimiter
}

func (s *NotificationService) Send(ctx context.Context, req *SendRequest) (*SendResponse, error) {
    // 1. 幂等检查
    exists, err := s.idempotent.Check(ctx, req.BizID)
    if err != nil {
        return nil, fmt.Errorf("idempotent check failed: %w", err)
    }
    if exists {
        return &SendResponse{BizID: req.BizID, Status: "duplicate"}, nil
    }
    
    // 2. 模板渲染
    renderResult, err := s.templateEngine.Render(ctx, req.TemplateID, req.Variables)
    if err != nil {
        return nil, fmt.Errorf("template render failed: %w", err)
    }
    
    // 3. 构建消息
    msg := &Message{
        ID:         generateID(),
        BizID:      req.BizID,
        AppID:      req.AppID,
        TemplateID: req.TemplateID,
        Channel:    req.Channel,
        Receiver:   req.Receiver,
        Content:    renderResult.Content,
        Priority:   req.Priority,
        Status:     StatusPending,
        MaxRetry:   3,
        CreatedAt:  time.Now(),
    }
    
    // 4. 入队
    if req.SendTime != nil && req.SendTime.After(time.Now()) {
        delay := req.SendTime.Sub(time.Now())
        if err := s.scheduler.ScheduleDelay(ctx, msg, delay); err != nil {
            return nil, fmt.Errorf("schedule delay failed: %w", err)
        }
    } else {
        if err := s.scheduler.Enqueue(ctx, msg); err != nil {
            return nil, fmt.Errorf("enqueue failed: %w", err)
        }
    }
    
    return &SendResponse{
        BizID:     req.BizID,
        MessageID: msg.ID,
        Status:    "accepted",
        Timestamp: time.Now(),
    }, nil
}
```

### 测试策略

核心功能需要覆盖三类测试：

**单元测试**：针对每个模块独立测试。模板引擎的变量替换、条件渲染、默认值填充。路由模块的规则匹配、降级逻辑。限流模块的令牌桶计算。

**集成测试**：模块间协作的测试。从Send接口到消息入队的完整链路。模板渲染后正确写入消息队列。幂等检查防止重复发送。

**端到端测试**：模拟真实场景的完整流程。业务方发送通知 → 模板渲染 → 渠道路由 → 投递 → 结果回调。

单元测试示例：

```go
func TestTemplateEngine_Render(t *testing.T) {
    engine := NewTemplateEngine(mockStore)
    
    tests := []struct {
        name       string
        template   *Template
        variables  map[string]string
        wantContent string
        wantErr    bool
    }{
        {
            name: "normal variable replacement",
            template: &Template{
                Content: "Hello ${user_name}, your order ${order_id} is confirmed.",
                Variables: []VariableDef{
                    {Name: "user_name", Required: true},
                    {Name: "order_id", Required: true},
                },
            },
            variables:  map[string]string{"user_name": "Alice", "order_id": "12345"},
            wantContent: "Hello Alice, your order 12345 is confirmed.",
        },
        {
            name: "missing required variable",
            template: &Template{
                Content: "Hello ${user_name}",
                Variables: []VariableDef{
                    {Name: "user_name", Required: true},
                },
            },
            variables: map[string]string{},
            wantErr:   true,
        },
        {
            name: "default value",
            template: &Template{
                Content: "Hello ${user_name}",
                Variables: []VariableDef{
                    {Name: "user_name", Required: false, Default: "Guest"},
                },
            },
            variables:   map[string]string{},
            wantContent: "Hello Guest",
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            mockStore.SetTemplate("test", tt.template)
            result, err := engine.Render(context.Background(), "test", tt.variables)
            if tt.wantErr {
                assert.Error(t, err)
                return
            }
            assert.NoError(t, err)
            assert.Equal(t, tt.wantContent, result.Content)
        })
    }
}
```

### 第二周里程碑

第二周结束时，应该完成以下交付物：

1. 通用标准接口（Send/SendBatch/Query/Cancel）完整实现
2. 四种渠道（短信/邮件/Push/站内信）的ChannelClient实现
3. 消息模板引擎（变量替换、多渠道适配、缓存、生命周期管理）
4. 业务方接入控制（权限校验、限流、配额）
5. 缓存策略（三级缓存、穿透/雪崩/击穿防护）
6. 单元测试覆盖率 > 70%

---

## 总结

第二周的核心任务是"把蓝图变成代码"。通用接口定义了业务方怎么用，渠道抽象定义了怎么对接外部服务，模板引擎解决了内容个性化的问题，接入控制保障了系统安全，缓存策略提升了性能。

本周关键知识点回顾：

| 知识点 | 核心内容 |
|--------|---------|
| 通用接口 | 统一入口、统一协议、统一错误码 |
| 渠道抽象 | ChannelClient接口 + 工厂模式 |
| 模板引擎 | text/template + 变量替换 + 两级缓存 |
| 接入控制 | HMAC鉴权 + RBAC权限 + 令牌桶限流 |
| 缓存策略 | L1/L2/L3三级缓存 + 穿透/雪崩/击穿防护 |
| 测试策略 | 单元测试 + 集成测试 + 端到端测试 |

> 核心功能实现的关键不是"写得快"，而是"抽象对"。接口定义好了，后续的迭代就是"加实现"而不是"改架构"。

觉得有用？收藏起来，下次做平台服务的时候照着这个结构来。你在做多渠道抽象时遇到过什么问题？评论区聊聊。

关注怕浪猫，下期我们讲通知平台的高可用与容错——包括服务治理、容错策略、事务机制和消息可靠投递保障。

系列进度 2/16 — 下一篇：通知平台高可用与容错

---

> 怕浪猫说：这周代码量不小，建议对照着源码看。所有代码都可以在项目仓库找到。下周开始讲高可用，难度会上一个台阶。
