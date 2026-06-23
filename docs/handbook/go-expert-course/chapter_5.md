# 第5章：权限系统需求分析与模型设计

你有没有经历过这种时刻——产品上线第一天，运营同学兴冲冲地跑过来说："能不能给这批用户加个临时的半价优惠权限？"你打开代码一看，权限逻辑散落在十几个 controller 里，if-else 嵌套了六七层，改一个地方怕牵连一片。于是你硬着头皮改了，结果第二天另一个功能又炸了。

权限系统是所有后台系统的地基。地基没打好，上面盖的楼越高越华丽，塌的时候就越惨烈、越难以收拾。

我是怕浪猫，一个在生产环境里被权限系统反复毒打过的 Go 后端工程师。过去几年时间里，我经历过从硬编码权限到 RBAC、再到 ABAC 的完整演进过程，踩过的坑足够写一本血泪史。这一章，我把权限系统的需求分析和模型设计掰开揉碎讲给你听，从业务场景出发，一步步推导出合理的架构设计。

> 权限系统不是"加个 if 判断"那么简单，它是你整个系统的信任边界。

---

## 5.1 权限系统业务场景分析

### 5.1.1 为什么每个项目都绕不开权限

先问一个问题：你的系统里，谁能做什么？

这个问题看似简单，但拆开来看，里面至少包含了三层语义：

1. **谁** —— 用户身份识别（Authentication，认证）
2. **能做什么** —— 操作权限判定（Authorization，授权）
3. **在什么条件下能做** —— 上下文约束（Context，环境约束）

很多团队在项目初期把这三层混在一起，导致后期扩展时举步维艰。我见过一个电商系统，权限判断直接写在订单服务的业务逻辑里：

```go
// 典型的反面教材
func (s *OrderService) CancelOrder(ctx context.Context, orderID int64) error {
    userID := ctx.Value("user_id").(int64)
    
    // 硬编码权限判断
    if userID != order.UserID && !s.isAdmin(userID) {
        return errors.New("无权操作")
    }
    
    // 更多的 if-else...
    if s.isVIP(userID) {
        // VIP 特殊逻辑
    }
    
    if s.isFromPromotion(userID) {
        // 活动用户特殊逻辑
    }
    
    return s.orderRepo.Update(ctx, orderID, map[string]interface{}{
        "status": "cancelled",
    })
}
```

这段代码的问题在哪？

- 权限逻辑和业务逻辑耦合在一起，无法复用
- 每新增一种角色，就要改一处代码
- 无法动态配置权限，所有规则都是硬编码的
- 测试困难，每次测权限都要 mock 一堆东西

> 权限逻辑混在业务代码里，就像电线埋在墙里——出问题时你不知道该拆哪面墙。

### 5.1.2 典型业务场景拆解

让我们从几个真实的业务场景出发，看看权限系统到底需要解决什么问题。

**场景一：后台管理系统**

最经典的 RBAC 场景。运营人员需要管理商品、订单、用户；客服需要查看订单和处理工单；财务需要查看财务报表。不同岗位能做的事情不同，而且同一岗位在不同时期权限也会变化。

比如双 11 期间，你可能临时给一批客服开放了退款权限，活动结束后又要收回。如果你的权限系统不支持动态配置，那就只能改代码重新发版。

**场景二：多租户 SaaS 平台**

每个租户内部有自己的用户体系和权限规则，但租户之间数据完全隔离。租户 A 的管理员不能看到租户 B 的数据。这就要求权限系统不仅要判断"你能不能做这个操作"，还要判断"你能不能操作这个租户的数据"。

**场景三：协作型应用（如文档协作、项目管理）**

这类场景的特点是权限粒度极细。一个文档可能有人能编辑、有人只能评论、有人只能查看。而且权限是可以被分享的——文档所有者可以把编辑权限授予其他人。

**场景四：开放平台 / API 网关**

对外暴露 API 时，每个接入方有自己的 scope（权限范围）。比如第三方应用只能读取用户的基本信息，不能操作用户的资金。这种场景下，权限系统需要和 OAuth2 等令牌机制结合。

开放平台的权限模型和内部系统有明显区别。内部系统的用户是"可信的"（至少是经过培训的员工），而开放平台的接入方是"不可信的"。因此安全要求更高：

- 每个 API 请求都需要校验接入方的身份和权限范围
- 敏感操作需要用户显式授权（OAuth2 的授权码模式）
- 接入方的调用频率需要限流
- 所有 API 调用都需要记录审计日志

这类场景的权限编码通常是 scope 形式，比如 `user:profile:read`、`user:email:read`、`payment:transfer:execute`。每个 scope 对应一组 API，接入方在申请时勾选需要的 scope，审批通过后获得相应的访问令牌。

**场景五：物联网设备控制平台**

这是一个容易被忽略但越来越多的场景。用户通过 App 控制智能设备，但不同家庭成员对设备的控制权限不同。比如孩子只能查看设备状态，不能修改设备配置；租客只能控制特定房间的设备。

这类场景的特点是权限和物理空间关联：客厅的灯、卧室的空调。权限模型需要支持"空间-设备-操作"的三维控制。

### 5.1.3 从场景到需求：权限系统的演进路径

理解了业务场景，接下来要把场景转化为具体的需求。这个过程不是拍脑袋，而是有方法论可循的。

我通常用"自顶向下"的需求拆解方法：先从业务目标出发，拆解到功能需求，再拆解到技术需求。

```
业务目标：保障数据安全 + 灵活的权限管理
    ├── 功能需求
    │     ├── 用户身份管理（登录、注册、Token 管理）
    │     ├── 角色管理（角色定义、角色分配、角色继承）
    │     ├── 权限管理（权限定义、权限分配、权限分组）
    │     ├── 资源管理（资源注册、资源层级、资源所有权）
    │     └── 审计管理（操作日志、权限变更记录）
    ├── 技术需求
    │     ├── 高性能（权限校验 < 10ms）
    │     ├── 高可用（权限服务宕机不影响核心业务）
    │     ├── 可扩展（支持新业务线快速接入）
    │     └── 可观测（监控、告警、追踪）
    └── 非功能需求
          ├── 合规性（数据保护法规要求）
          ├── 可维护性（权限配置易于理解和管理）
          └── 安全性（防越权、防注入、防重放）
```

这个拆解过程的关键在于：不要遗漏非功能需求。很多团队只关注功能需求，忽略了性能、可用性、合规性这些维度，到后期才发现问题。

比如合规性，如果你的系统涉及欧盟用户数据，GDPR 要求你必须能追溯谁在什么时候访问了什么数据。这意味着你的权限审计日志不是可有可无的装饰品，而是法律要求的硬指标。

再比如可维护性，如果权限配置界面复杂到只有开发才能看懂，那运营同学每次配权限都要找你，你就是一个人肉权限管理系统。好的权限系统应该让非技术人员也能方便地配置和管理。

### 5.1.4 权限系统的核心需求清单

基于以上场景和拆解分析，我总结了一份权限系统的核心需求清单：

| 需求维度 | 具体描述 | 优先级 |
|---------|---------|-------|
| 身份认证 | 支持多种登录方式（账密、SSO、OAuth） | P0 |
| 角色管理 | 支持角色的增删改查、角色继承 | P0 |
| 权限分配 | 支持给角色分配权限、给用户分配角色 | P0 |
| 权限校验 | 在 API 入口处统一拦截，支持中间件模式 | P0 |
| 资源管理 | 支持对具体资源（菜单、按钮、数据）的权限控制 | P1 |
| 动态配置 | 权限变更不需要重启服务 | P1 |
| 数据权限 | 控制用户能看到哪些数据（行级/列级） | P2 |
| 权限审计 | 记录权限变更历史和权限校验日志 | P2 |
| 多租户支持 | 租户间数据隔离，租户内独立权限 | P2 |

> 做需求分析时，先分清 P0、P1、P2，别一上来就追求大而全。先把骨架搭好，血肉可以慢慢长。

### 5.1.4 常见的权限系统误区

在实际项目中，我见过太多团队在权限系统上踩坑。这里列出几个最常见的误区：

**误区一：把权限等同于角色**

很多人觉得"权限就是角色"，设计数据库时只有一张 roles 表，然后给用户挂一个 role_id。这种设计在简单系统里没问题，但一旦需要"一个用户同时拥有多个角色"或者"角色之间的权限有交叉"，就崩了。

**误区二：前后端权限不一致**

前端根据用户的角色列表渲染菜单和按钮，后端也根据角色列表做权限校验。看起来没问题，但如果某天前端漏了某个角色的菜单配置，而后端又恰好没校验那个接口，就是一个安全漏洞。

正确的做法是：前端权限只做体验优化（隐藏不该看到的按钮），后端权限做真正的安全防线。后端的权限校验不能依赖前端。

**误区三：忽略数据权限**

很多团队只做了功能权限（能不能点这个按钮），却忽略了数据权限（能不能看到这条数据）。比如客服 A 能看到所有用户的订单，但业务上他只应该看到分配给他的用户的订单。

数据权限是最容易被遗漏的需求，也是后期最难补的。因为数据权限往往需要侵入到查询逻辑里，改起来牵一发动全身。

数据权限一般分为三个层次：

- **行级权限**：控制能看到哪些行。比如只能看到自己创建的订单
- **列级权限**：控制能看到哪些字段。比如客服能看到订单金额但看不到用户手机号
- **字段加密权限**：某些敏感字段需要特定权限才能解密查看

行级权限相对好实现，在 SQL 查询里加 WHERE 条件就行。列级权限比较麻烦，需要在查询结果返回后做字段过滤，或者用数据库的视图功能。字段加密权限最复杂，需要在应用层做加解密。

**误区四：权限系统一次性做完**

权限系统是一个需要持续演进的系统。不要想着一次性把所有功能都做完。正确的做法是分阶段实施：

```
阶段一：基础 RBAC
  - 用户/角色/权限的 CRUD
  - 基本的权限校验中间件
  - 前端菜单权限

阶段二：权限增强
  - 角色继承
  - 数据权限
  - 权限缓存
  - 审计日志

阶段三：高级功能
  - ABAC 策略引擎
  - 多租户支持
  - 权限委托
  - 临时权限
```

先把阶段一做稳，再逐步加功能。每个阶段都要经过完整的测试和线上验证。

> 权限系统建设是马拉松不是短跑。跑得稳比跑得快重要，跑得对方向比跑得稳更重要。

---

## 5.2 RBAC / ABAC 权限模型设计

### 5.2.1 RBAC 模型详解

RBAC（Role-Based Access Control，基于角色的访问控制）是最广泛使用的权限模型。它的核心思想是：用户不直接拥有权限，而是通过角色间接获得权限。

用一句话概括：**用户 —— 角色 —— 权限**。

RBAC 经历了几个阶段的演进：

**RBAC0（基础模型）**

最简单的形式，三张表：Users、Roles、Permissions，加上两张关联表。这是所有 RBAC 变体的基础，也是大多数项目实际需要的模型。不要觉得它简单就看不起它——在一个中等规模的后台系统里，RBAC0 加上合理的权限编码规范，完全够用。

很多团队一上来就想搞 RBAC3，又是角色继承又是约束规则，结果角色继承关系搞成了一团乱麻，约束规则写了一堆但从来没真正生效过。记住一个原则：能用简单模型解决的问题，不要用复杂模型。

```
Users       UserRoles      Roles       RolePermissions    Permissions
------      ----------      ------      ----------------    -----------
id          user_id         id          role_id            id
name        role_id         name        permission_id      name
email                       description                    resource
                                                           action
```

**RBAC1（角色继承模型）**

在 RBAC0 的基础上引入了角色继承。比如"超级管理员"继承"普通管理员"的所有权限，再额外拥有系统配置等权限。

这在企业场景中非常常见。一个典型的角色继承体系：

```
超级管理员
    ├── 运营管理员
    │     ├── 运营专员
    │     └── 运营实习生
    ├── 财务管理员
    │     └── 财务专员
    └── 系统管理员
          └── 开发工程师
```

**RBAC2（角色约束模型）**

在 RBAC0 的基础上增加了约束规则。这在金融、医疗等合规要求高的行业特别重要。比如银行系统的审批流程中，制单人和审核人不能是同一个人，这就是典型的互斥角色约束。

- **互斥角色**：一个用户不能同时拥有"审批人"和"申请人"角色
- **基数约束**：一个角色最多分配给 N 个用户（比如"超级管理员"最多 3 人）
- **先决条件**：要获得"管理员"角色，必须先拥有"普通用户"角色

**RBAC3（统一模型）**

RBAC1 + RBAC2，既支持角色继承，又支持约束规则。这是最完整的 RBAC 模型。

> 选择模型时别贪大。RBAC0 能解决的问题，不要上 RBAC3。复杂度是有成本的。

### 5.2.2 RBAC 模型的工程化考量

理论模型清楚了，但落地到工程中还有很多细节要处理。这里讲几个容易被忽略的工程化问题。

**问题一：权限的粒度怎么定？**

权限粒度太粗，不够灵活；太细，管理成本爆炸。我的经验是按"资源 + 操作"两层来定，不要按"资源 + 操作 + 条件"三层。

比如"订单创建"就是一个权限，不要搞成"订单创建-普通用户"和"订单创建-VIP用户"两个权限。VIP 的特殊逻辑应该在业务代码里判断，而不是塞到权限系统里。

权限系统管的是"能不能做"，不是"怎么做"。如果把业务条件也塞进权限系统，权限数量会指数级膨胀，最后没人能维护。

**问题二：角色数量多少合适？**

我见过一个系统有 200 多个角色，每个角色对应一个岗位。结果岗位一调整，角色就要改，权限分配也要跟着改。运营同学苦不堪言。

建议角色数量控制在 20 个以内。通过角色继承和权限组合来覆盖不同岗位的需求，而不是为每个岗位建一个角色。

**问题三：权限变更如何通知？**

管理员修改了某个角色的权限，持有该角色的用户的权限缓存需要失效。如果是多机部署，本地的 L1 缓存也需要失效。

常见的方案有三种：

1. **Redis Pub/Sub 广播**：修改权限时发布消息，所有实例订阅并清除本地缓存
2. **版本号机制**：权限数据带版本号，校验时对比版本号决定是否刷新缓存
3. **短 TTL 兜底**：L1 缓存 TTL 设为 1 分钟，即使消息丢了，最多 1 分钟后也会自动刷新

实际项目中，我建议三种方案组合使用：Pub/Sub 做实时通知，版本号做最终一致性保障，短 TTL 做兜底。

> 权限系统的工程化不是追求理论上的完美，而是在复杂度、性能、可维护性之间找到平衡点。

### 5.2.3 RBAC 的 Go 代码实现

让我们用 Go 来实现一个基础的 RBAC 模型。首先是数据结构定义：

```go
package rbac

// Permission 权限定义
type Permission struct {
    ID       int64  `json:"id"`
    Name     string `json:"name"`     // 权限名称，如"创建订单"
    Resource string `json:"resource"` // 资源标识，如"order"
    Action   string `json:"action"`   // 操作类型，如"create/read/update/delete"
}

// Role 角色定义
type Role struct {
    ID          int64         `json:"id"`
    Name        string        `json:"name"`
    Description string        `json:"description"`
    ParentID    *int64        `json:"parent_id"` // 父角色ID，用于角色继承
    Permissions []*Permission `json:"permissions"`
}

// User 用户定义
type User struct {
    ID    int64    `json:"id"`
    Name  string   `json:"name"`
    Email string   `json:"email"`
    Roles []*Role  `json:"roles"`
}
```

接下来是核心的权限校验逻辑：

```go
package rbac

import "sync"

// RBACManager 权限管理器
type RBACManager struct {
    mu sync.RWMutex

    // 存储结构
    users       map[int64]*User
    roles       map[int64]*Role
    permissions map[int64]*Permission

    // 角色继承关系（邻接表）
    roleChildren map[int64][]int64
}

func NewRBACManager() *RBACManager {
    return &RBACManager{
        users:        make(map[int64]*User),
        roles:        make(map[int64]*Role),
        permissions:  make(map[int64]*Permission),
        roleChildren: make(map[int64][]int64),
    }
}

// AssignRole 给用户分配角色
func (m *RBACManager) AssignRole(userID, roleID int64) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    user, ok := m.users[userID]
    if !ok {
        return ErrUserNotFound
    }

    role, ok := m.roles[roleID]
    if !ok {
        return ErrRoleNotFound
    }

    // 检查是否已分配
    for _, r := range user.Roles {
        if r.ID == roleID {
            return nil // 幂等
        }
    }

    user.Roles = append(user.Roles, role)
    return nil
}

// CheckPermission 检查用户是否有某权限
func (m *RBACManager) CheckPermission(userID int64, resource, action string) bool {
    m.mu.RLock()
    defer m.mu.RUnlock()

    user, ok := m.users[userID]
    if !ok {
        return false
    }

    // 收集用户所有角色（包括继承的父角色权限）
    checked := make(map[int64]bool)
    for _, role := range user.Roles {
        if m.checkRolePermission(role.ID, resource, action, checked) {
            return true
        }
    }
    return false
}

// checkRolePermission 递归检查角色权限（含继承）
func (m *RBACManager) checkRolePermission(roleID int64, resource, action string, checked map[int64]bool) bool {
    if checked[roleID] {
        return false
    }
    checked[roleID] = true

    role, ok := m.roles[roleID]
    if !ok {
        return false
    }

    // 检查当前角色的直接权限
    for _, perm := range role.Permissions {
        if perm.Resource == resource && perm.Action == action {
            return true
        }
    }

    // 检查父角色的权限（继承向上）
    if role.ParentID != nil {
        if m.checkRolePermission(*role.ParentID, resource, action, checked) {
            return true
        }
    }

    return false
}
```

这段代码实现了 RBAC 的核心功能：用户分配角色、权限校验、角色继承。注意几个设计要点：

1. 使用读写锁（`sync.RWMutex`）保证并发安全
2. 权限校验时使用递归处理角色继承
3. 使用 `checked` map 防止循环引用导致的死循环
4. `AssignRole` 做了幂等处理

> 并发安全不是可选项。在 Go 里，map 的并发读写会直接 panic，别拿生产环境开玩笑。

### 5.2.3 ABAC 模型详解

RBAC 虽好，但它有一个根本性的局限：它是基于"角色"的，而不是基于"属性"的。

考虑这个场景：一个文档系统，规则是"文档的创建者可以编辑，其他人在文档被设为公开时只能查看"。这个规则涉及到多个属性：文档的创建者、文档的公开状态、用户的身份。用 RBAC 很难自然地表达这种规则。

ABAC（Attribute-Based Access Control，基于属性的访问控制）就是为了解决这个问题。它的核心思想是：通过评估主体属性、资源属性、环境属性和操作类型，动态计算权限决策。

ABAC 的四个属性维度：

```
主体属性（Subject Attributes）
  - 用户ID、角色、部门、职位
  - 安全等级、信任分数
  - 创建时间、最后登录时间

资源属性（Resource Attributes）
  - 资源ID、类型、所有者
  - 安全等级、敏感度
  - 创建时间、所属项目

环境属性（Environment Attributes）
  - 当前时间、访问位置
  - 设备类型、网络环境
  - 系统状态（维护中/正常）

操作属性（Action）
  - 创建、读取、更新、删除
  - 审批、导出、分享
```

一个 ABAC 策略可以用如下结构表达：

```
策略：文档编辑权限
  IF 主体.ID == 资源.所有者ID
  THEN ALLOW
  ELSE IF 资源.公开 == true AND 操作 == "read"
  THEN ALLOW
  ELSE DENY
```

### 5.2.4 ABAC 的 Go 代码实现

```go
package abac

import (
    "context"
    "time"
)

// Subject 主体属性
type Subject struct {
    UserID      int64
    Role        string
    Department  string
    SecurityLevel int
    TrustScore  float64
}

// Resource 资源属性
type Resource struct {
    ID           int64
    Type         string
    OwnerID      int64
    SecurityLevel int
    IsPublic     bool
    ProjectID    int64
}

// Environment 环境属性
type Environment struct {
    Time       time.Time
    IPAddress  string
    DeviceType string
    IsMaintenance bool
}

// Action 操作类型
type Action string

const (
    ActionCreate Action = "create"
    ActionRead   Action = "read"
    ActionUpdate Action = "update"
    ActionDelete Action = "delete"
)

// Policy 策略接口
type Policy interface {
    Evaluate(ctx context.Context, sub *Subject, res *Resource, env *Environment, act Action) Decision
}

// Decision 权限决策
type Decision string

const (
    DecisionAllow Decision = "allow"
    DecisionDeny  Decision = "deny"
)

// PolicyEngine 策略引擎
type PolicyEngine struct {
    policies []Policy
}

func NewPolicyEngine() *PolicyEngine {
    return &PolicyEngine{
        policies: make([]Policy, 0),
    }
}

// AddPolicy 添加策略
func (e *PolicyEngine) AddPolicy(p Policy) {
    e.policies = append(e.policies, p)
}

// Evaluate 评估权限
func (e *PolicyEngine) Evaluate(ctx context.Context, sub *Subject, res *Resource, env *Environment, act Action) Decision {
    for _, policy := range e.policies {
        decision := policy.Evaluate(ctx, sub, res, env, act)
        if decision == DecisionAllow {
            return DecisionAllow
        }
    }
    return DecisionDeny
}
```

现在实现几个具体的策略：

```go
// OwnerPolicy 资源所有者策略
type OwnerPolicy struct{}

func (p *OwnerPolicy) Evaluate(ctx context.Context, sub *Subject, res *Resource, env *Environment, act Action) Decision {
    if sub.UserID == res.OwnerID {
        return DecisionAllow
    }
    return DecisionDeny
}

// PublicReadPolicy 公开读取策略
type PublicReadPolicy struct{}

func (p *PublicReadPolicy) Evaluate(ctx context.Context, sub *Subject, res *Resource, env *Environment, act Action) Decision {
    if res.IsPublic && act == ActionRead {
        return DecisionAllow
    }
    return DecisionDeny
}

// SecurityLevelPolicy 安全等级策略
type SecurityLevelPolicy struct{}

func (p *SecurityLevelPolicy) Evaluate(ctx context.Context, sub *Subject, res *Resource, env *Environment, act Action) Decision {
    // 主体的安全等级必须大于等于资源的安全等级
    if sub.SecurityLevel >= res.SecurityLevel {
        return DecisionAllow
    }
    return DecisionDeny
}

// MaintenancePolicy 维护期策略
type MaintenancePolicy struct{}

func (p *MaintenancePolicy) Evaluate(ctx context.Context, sub *Subject, res *Resource, env *Environment, act Action) Decision {
    // 维护期间只允许读取
    if env.IsMaintenance && act != ActionRead {
        return DecisionDeny
    }
    return DecisionDeny // 不主动放行，交给其他策略
}
```

使用示例：

```go
func ExampleUsage() {
    engine := NewPolicyEngine()
    
    // 注册策略（按优先级顺序）
    engine.AddPolicy(&OwnerPolicy{})        // 所有者优先
    engine.AddPolicy(&PublicReadPolicy{})   // 公开可读
    engine.AddPolicy(&SecurityLevelPolicy{}) // 安全等级

    sub := &Subject{
        UserID:       1001,
        Role:         "engineer",
        Department:   "tech",
        SecurityLevel: 3,
    }

    res := &Resource{
        ID:            2001,
        Type:          "document",
        OwnerID:       1001,
        SecurityLevel: 2,
        IsPublic:      false,
    }

    env := &Environment{
        Time:          time.Now(),
        IPAddress:     "192.168.1.100",
        DeviceType:    "desktop",
        IsMaintenance: false,
    }

    // 检查权限
    decision := engine.Evaluate(context.Background(), sub, res, env, ActionUpdate)
    fmt.Println("Decision:", decision) // Output: Decision: allow
}
```

### 5.2.5 RBAC vs ABAC：如何选择

这是被问最多的问题。我的建议是：

| 维度 | RBAC | ABAC |
|-----|------|------|
| 复杂度 | 低 | 高 |
| 灵活性 | 中 | 高 |
| 性能 | 高（查表即可） | 较低（需要策略计算） |
| 可理解性 | 强（运营能看懂） | 弱（策略规则较复杂） |
| 适用场景 | 管理后台、企业内部系统 | 文档协作、多租户、细粒度控制 |
| 动态性 | 需要重新分配角色 | 属性变化即生效 |

> 大多数项目，RBAC 足够。只有当 RBAC 的角色数量膨胀到难以管理时，才考虑引入 ABAC。

**实际建议：以 RBAC 为骨架，在关键节点引入 ABAC 思想。**

具体来说：
1. 主体框架用 RBAC：用户 —— 角色 —— 权限
2. 数据权限用 ABAC：基于资源属性（所有者、部门、安全等级）做过滤
3. 特殊规则用策略引擎：比如"维护期间禁止写操作"、"异地登录需要二次验证"

这样既能保持系统简洁，又能在需要的地方灵活扩展。

### 5.2.7 混合模型的实现思路

"以 RBAC 为骨架，在关键节点引入 ABAC" 这个思路说起来容易，具体怎么落地？

核心思路是：在 RBAC 的权限校验链路中，插入 ABAC 策略引擎作为补充校验。

```go
// HybridPermissionChecker 混合权限校验器
type HybridPermissionChecker struct {
    rbacManager  *rbac.RBACManager
    policyEngine *abac.PolicyEngine
}

// Check 混合权限校验
// 第一步：RBAC 校验，判断用户是否有功能权限
// 第二步：ABAC 校验，判断用户是否满足资源级约束
func (c *HybridPermissionChecker) Check(ctx context.Context, userID int64, resource, action string, target *abac.Resource) bool {
    // 第一步：RBAC 功能权限校验
    permCode := fmt.Sprintf("%s:%s", resource, action)
    if !c.rbacManager.CheckPermission(userID, resource, action) {
        return false
    }

    // 如果没有传目标资源，只做功能权限校验
    if target == nil {
        return true
    }

    // 第二步：ABAC 资源权限校验
    user := c.rbacManager.GetUser(userID)
    if user == nil {
        return false
    }

    subject := &abac.Subject{
        UserID:        user.ID,
        Role:          user.Roles[0].Code, // 取主角色
        Department:    user.Department,
        SecurityLevel: user.SecurityLevel,
    }

    env := &abac.Environment{
        Time:          time.Now(),
        IPAddress:     ctx.Value("client_ip").(string),
        DeviceType:    ctx.Value("device_type").(string),
        IsMaintenance: c.isMaintenanceMode(),
    }

    actionMap := map[string]abac.Action{
        "create": abac.ActionCreate,
        "read":   abac.ActionRead,
        "update": abac.ActionUpdate,
        "delete": abac.ActionDelete,
    }

    abacAction, ok := actionMap[action]
    if !ok {
        abacAction = abac.ActionRead // 默认读权限
    }

    decision := c.policyEngine.Evaluate(ctx, subject, target, env, abacAction)
    return decision == abac.DecisionAllow
}
```

这种混合模式的好处是：大部分请求只需要第一步 RBAC 校验就能出结果（查缓存，极快），只有涉及具体资源操作时才需要走第二步 ABAC 校验。性能不会因为引入 ABAC 而明显下降。

> 混合模式的精髓在于：用 RBAC 做"粗筛"，用 ABAC 做"精筛"。粗筛拦住大部分无权限请求，精筛处理需要细粒度控制的场景。

---

## 5.3 用户-角色-资源关系建模

### 5.3.1 数据库表设计

理论讲完了，现在来落地。我们先设计数据库表结构。

我见过不少团队把权限相关的表设计得特别复杂，十几张表关联来关联去。实际上，一个实用的 RBAC 权限系统，核心表只需要五张：

```
users              用户表
roles              角色表
permissions        权限表
user_roles         用户-角色关联表
role_permissions   角色-权限关联表
```

如果需要角色继承，再加一张：

```
role_hierarchy     角色继承关系表
```

下面是详细的建表语句：

```sql
-- 用户表
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '用户名',
    `email` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '邮箱',
    `password_hash` VARCHAR(256) NOT NULL DEFAULT '' COMMENT '密码哈希',
    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0-禁用 1-启用',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 角色表
CREATE TABLE `roles` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '角色编码，如 admin、editor',
    `name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '角色名称',
    `description` VARCHAR(256) NOT NULL DEFAULT '' COMMENT '角色描述',
    `sort` INT NOT NULL DEFAULT 0 COMMENT '排序',
    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0-禁用 1-启用',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 权限表
CREATE TABLE `permissions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '权限编码，如 order:create',
    `name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '权限名称',
    `resource` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '资源标识，如 order、user',
    `action` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '操作类型: create/read/update/delete/export',
    `type` TINYINT NOT NULL DEFAULT 1 COMMENT '权限类型: 1-菜单 2-按钮 3-API',
    `parent_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父权限ID，用于菜单树',
    `sort` INT NOT NULL DEFAULT 0 COMMENT '排序',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code` (`code`),
    KEY `idx_resource_action` (`resource`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- 用户-角色关联表
CREATE TABLE `user_roles` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `role_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`, `role_id`),
    KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- 角色-权限关联表
CREATE TABLE `role_permissions` (
    `role_id` BIGINT UNSIGNED NOT NULL,
    `permission_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`role_id`, `permission_id`),
    KEY `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表';

-- 角色继承关系表
CREATE TABLE `role_hierarchy` (
    `parent_id` BIGINT UNSIGNED NOT NULL COMMENT '父角色ID',
    `child_id` BIGINT UNSIGNED NOT NULL COMMENT '子角色ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`parent_id`, `child_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色继承关系表';
```

几个设计细节解释一下：

**1. 权限编码用 `resource:action` 格式**

比如 `order:create`、`user:read`。这种命名方式自带语义，看代码就知道在控制什么资源的什么操作，比 `perm_001` 这种无意义编码强一万倍。

**2. 权限表有 type 字段**

实际项目中，权限分为三类：菜单权限（控制侧边栏显示）、按钮权限（控制页面按钮显示）、API 权限（控制接口访问）。用 type 字段区分，前端和后端各取所需。

**3. 权限表有 parent_id 字段**

菜单是有层级关系的，比如"订单管理"下面有"订单列表"、"退款管理"等子菜单。parent_id 用于构建菜单树。

**4. 关联表用联合主键**

`user_roles` 的主键是 `(user_id, role_id)`，天然防止重复分配，也不需要额外加唯一索引。

> 数据库设计是权限系统的骨架。骨架长歪了，后面所有的代码都是在打补丁。

### 5.3.2 权限编码规范设计

在写 Go 代码之前，我们先定好权限编码的规范。这个看似不起眼的事情，如果一开始没定好，后面改起来极其痛苦。

我推荐的权限编码格式是：`模块:资源:操作`，或者简化为 `资源:操作`。

以一个电商后台为例，权限编码体系如下：

```
# 订单模块
order:read          # 查看订单列表
order:create        # 创建订单
order:update        # 修改订单
order:cancel        # 取消订单
order:export        # 导出订单
order:read_all      # 查看所有订单（数据权限）
order:read_dept     # 查看本部门订单（数据权限）

# 商品模块
product:read
product:create
product:update
product:delete
product:publish     # 上架商品
product:unpublish   # 下架商品

# 用户模块
user:read
user:create
user:update
user:delete
user:reset_password

# 系统模块
role:read
role:create
role:update
role:delete
role:assign         # 分配角色
permission:read
permission:assign
```

编码规范的核心原则：

1. **见名知意**：看到编码就知道控制的是什么资源的什么操作
2. **层次清晰**：用冒号分隔模块、资源、操作
3. **统一风格**：全部小写，下划线分词
4. **预留扩展**：数据权限用 `_all`、`_dept` 后缀，不要和功能权限混在一起

> 规范不是约束，而是效率工具。当所有人都在同一套命名规则下工作时，沟通成本会大幅下降。

### 5.3.3 Go 数据模型与 GORM 实现

建完表，我们来写 Go 的数据模型。这里用 GORM 作为 ORM：

```go
package model

import "time"

// User 用户模型
type User struct {
    ID           int64        `gorm:"primaryKey;autoIncrement" json:"id"`
    Username     string       `gorm:"size:64;uniqueIndex;not null" json:"username"`
    Email        string       `gorm:"size:128;uniqueIndex;not null" json:"email"`
    PasswordHash string       `gorm:"size:256;not null" json:"-"`
    Status       int8         `gorm:"default:1;not null" json:"status"` // 0-禁用 1-启用
    CreatedAt    time.Time    `gorm:"autoCreateTime" json:"created_at"`
    UpdatedAt    time.Time    `gorm:"autoUpdateTime" json:"updated_at"`

    // 多对多关联
    Roles []Role `gorm:"many2many:user_roles;" json:"roles"`
}

func (User) TableName() string {
    return "users"
}

// Role 角色模型
type Role struct {
    ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
    Code        string    `gorm:"size:64;uniqueIndex;not null" json:"code"`
    Name        string    `gorm:"size:64;not null" json:"name"`
    Description string    `gorm:"size:256" json:"description"`
    Sort        int       `gorm:"default:0" json:"sort"`
    Status      int8      `gorm:"default:1;not null" json:"status"`
    CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
    UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`

    // 多对多关联
    Permissions []Permission `gorm:"many2many:role_permissions;" json:"permissions"`
}

func (Role) TableName() string {
    return "roles"
}

// Permission 权限模型
type Permission struct {
    ID       int64  `gorm:"primaryKey;autoIncrement" json:"id"`
    Code     string `gorm:"size:128;uniqueIndex;not null" json:"code"`
    Name     string `gorm:"size:64;not null" json:"name"`
    Resource string `gorm:"size:64;index:idx_resource_action,priority:1;not null" json:"resource"`
    Action   string `gorm:"size:32;index:idx_resource_action,priority:2;not null" json:"action"`
    Type     int8   `gorm:"default:1;not null" json:"type"` // 1-菜单 2-按钮 3-API
    ParentID int64  `gorm:"default:0" json:"parent_id"`
    Sort     int    `gorm:"default:0" json:"sort"`
    CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`

    // 子权限（菜单树）
    Children []Permission `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

func (Permission) TableName() string {
    return "permissions"
}
```

### 5.3.4 权限树构建

菜单权限需要构建成树形结构，前端才能渲染侧边栏。这里实现一个权限树构建算法。

```go
package service

import "go-expert/model"

// BuildPermissionTree 构建权限树
func BuildPermissionTree(permissions []model.Permission) []*model.Permission {
    // 用 map 存储所有节点，方便查找
    nodeMap := make(map[int64]*model.Permission)
    var roots []*model.Permission

    // 第一次遍历：创建所有节点
    for i := range permissions {
        perm := permissions[i]
        perm.Children = nil // 清空预加载的子节点
        nodeMap[perm.ID] = &perm
    }

    // 第二次遍历：构建父子关系
    for _, node := range nodeMap {
        if node.ParentID == 0 {
            // 根节点
            roots = append(roots, node)
        } else {
            // 找到父节点，挂到父节点的 Children 下
            if parent, ok := nodeMap[node.ParentID]; ok {
                parent.Children = append(parent.Children, node)
            } else {
                // 父节点不存在，当作根节点处理
                roots = append(roots, node)
            }
        }
    }

    // 对每层排序
    sortPermissionTree(roots)
    return roots
}

// sortPermissionTree 递归排序权限树
func sortPermissionTree(nodes []*model.Permission) {
    sort.Slice(nodes, func(i, j int) bool {
        return nodes[i].Sort < nodes[j].Sort
    })
    for _, node := range nodes {
        if len(node.Children) > 0 {
            sortPermissionTree(node.Children)
        }
    }
}
```

这个算法的时间复杂度是 O(n)，空间复杂度也是 O(n)。核心思路是两遍遍历：第一遍建索引，第二遍挂父子关系。比递归查找高效得多。

> 构建树形结构时，先用 map 建索引再挂关系，比递归查找快一个数量级。这是算法选择的基本功。

### 5.3.5 用户权限加载

用户登录后，需要一次性加载该用户的所有权限。这里有一个性能优化的关键点：不要在每次请求时都查数据库加载权限，应该缓存起来。

```go
package service

import (
    "context"
    "fmt"
    "time"

    "go-expert/model"
    "go-expert/pkg/cache"
    "go-expert/pkg/db"
)

// PermissionService 权限服务
type PermissionService struct {
    cache cache.Cache
    db    *db.DB
}

// GetUserPermissions 获取用户所有权限（带缓存）
func (s *PermissionService) GetUserPermissions(ctx context.Context, userID int64) ([]*model.Permission, error) {
    cacheKey := fmt.Sprintf("user:perms:%d", userID)

    // 1. 先查缓存
    var cached []*model.Permission
    if err := s.cache.Get(ctx, cacheKey, &cached); err == nil {
        return cached, nil
    }

    // 2. 查数据库
    var permissions []*model.Permission
    err := s.db.WithContext(ctx).
        Distinct("permissions.*").
        Joins("JOIN role_permissions ON role_permissions.permission_id = permissions.id").
        Joins("JOIN user_roles ON user_roles.role_id = role_permissions.role_id").
        Where("user_roles.user_id = ?", userID).
        Where("permissions.type IN ?", []int8{1, 2, 3}). // 菜单+按钮+API
        Order("permissions.sort ASC").
        Find(&permissions).Error
    if err != nil {
        return nil, fmt.Errorf("查询用户权限失败: %w", err)
    }

    // 3. 写入缓存（5分钟过期）
    _ = s.cache.Set(ctx, cacheKey, permissions, 5*time.Minute)

    return permissions, nil
}

// GetUserPermissionCodes 获取用户权限编码集合（用于快速校验）
func (s *PermissionService) GetUserPermissionCodes(ctx context.Context, userID int64) (map[string]bool, error) {
    permissions, err := s.GetUserPermissions(ctx, userID)
    if err != nil {
        return nil, err
    }

    codes := make(map[string]bool, len(permissions))
    for _, perm := range permissions {
        codes[perm.Code] = true
    }
    return codes, nil
}

// InvalidateUserPermissionCache 失效用户权限缓存
func (s *PermissionService) InvalidateUserPermissionCache(ctx context.Context, userID int64) error {
    cacheKey := fmt.Sprintf("user:perms:%d", userID)
    return s.cache.Del(ctx, cacheKey)
}
```

设计要点：

1. **缓存策略**：用户权限不会频繁变化，缓存 5 分钟是合理的。当管理员修改了用户角色或角色权限时，主动调用 `InvalidateUserPermissionCache` 清除缓存。
2. **Distinct 查询**：一个用户可能有多个角色，不同角色可能有相同的权限，用 `DISTINCT` 去重。
3. **权限编码集合**：`GetUserPermissionCodes` 返回一个 `map[string]bool`，权限校验时只需要查 map，O(1) 复杂度。

---

## 5.4 权限系统架构设计

### 5.4.1 整体架构图

权限系统不是孤立存在的，它需要和系统的各个层面交互。下面是整体架构设计：

```
┌─────────────────────────────────────────────────────────────────┐
│                         API 层 (HTTP/Gin)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              AuthMiddleware (认证中间件)                    │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ JWT 解析     │→│ 用户加载      │→│ 权限校验         │  │  │
│  │  │             │  │              │  │                 │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
├─────────────────────────────────────────────────────────────────┤
│                       Service 层 (业务逻辑)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ UserService  │  │ RoleService  │  │ PermissionService  │    │
│  │              │  │              │  │                    │    │
│  │ - CRUD       │  │ - CRUD       │  │ - 权限树构建        │    │
│  │ - 角色分配    │  │ - 权限分配    │  │ - 权限校验         │    │
│  │              │  │ - 角色继承    │  │ - 缓存管理         │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│                              ↓                                   │
├─────────────────────────────────────────────────────────────────┤
│                        Data 层 (数据访问)                        │
│  ┌──────────────┐  ┌──────────────────────────────────────┐    │
│  │   MySQL      │  │            Redis 缓存                 │    │
│  │              │  │                                      │    │
│  │ - users      │  │ - user:perms:{id}  权限缓存           │    │
│  │ - roles      │  │ - user:roles:{id}  角色缓存           │    │
│  │ - permissions│  │ - role:perms:{id}  角色权限缓存        │    │
│  │ - user_roles │  │                                      │    │
│  │ - role_perms │  │                                      │    │
│  └──────────────┘  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4.2 分层架构设计详解

我采用经典的三层架构来组织权限系统的代码。让我详细解释每一层的职责和交互方式。

**API 层（接口层）**

这一层负责接收 HTTP 请求，做参数校验，调用 Service 层处理业务逻辑，然后返回响应。在权限系统中，API 层最重要的职责是挂载中间件链。

中间件的执行顺序非常重要：

```
请求 → 日志记录 → 限流 → 认证（JWT解析）→ 授权（权限校验）→ 审计日志 → 业务处理
```

认证必须在授权之前——你得先知道用户是谁，才能判断他能不能做某件事。审计日志放在最后，记录的是整个请求的处理结果。

**Service 层（业务逻辑层）**

这一层是权限系统的核心，所有的业务逻辑都在这里。我把它拆成三个 Service：

- `UserService`：用户的 CRUD、角色分配与撤销
- `RoleService`：角色的 CRUD、权限分配、角色继承管理
- `PermissionService`：权限的 CRUD、权限树构建、权限校验、缓存管理

这三个 Service 之间有依赖关系：UserService 依赖 PermissionService 做角色分配时的权限检查，RoleService 依赖 PermissionService 做权限分配。注意避免循环依赖。

**Data 层（数据访问层）**

这一层负责和存储交互。MySQL 存储持久化数据，Redis 做缓存。GORM 作为 ORM，封装了数据库操作。

Data 层的一个重要原则是：不包含任何业务逻辑。它只做数据的增删改查，不做权限校验、不做数据转换。业务逻辑全部放在 Service 层。

> 分层架构的核心价值不在于"分了多少层"，而在于"每层职责是否清晰"。职责模糊的分层比不分层更糟糕。

### 5.4.3 认证与授权的分离

很多人把认证（Authentication）和授权（Authorization）混在一起说，但它们是两个独立的关注点：

- **认证**：你是谁？——通过 JWT Token、Session 等方式确定用户身份
- **授权**：你能干什么？——通过权限系统判断用户是否有权执行某操作

分离的好处是职责清晰，而且认证逻辑可以复用（所有需要登录的接口都需要认证，但不是所有接口都需要权限校验）。

```go
package middleware

import (
    "net/http"
    "strings"

    "github.com/gin-gonic/gin"
)

// AuthMiddleware 认证中间件
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // 1. 从 Header 中提取 Token
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "未提供认证信息",
            })
            return
        }

        // 2. 解析 Bearer Token
        parts := strings.SplitN(authHeader, " ", 2)
        if len(parts) != 2 || parts[0] != "Bearer" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "认证格式错误",
            })
            return
        }

        // 3. 解析 JWT
        claims, err := jwt.Parse(parts[1])
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "认证已过期",
            })
            return
        }

        // 4. 将用户信息存入 context
        c.Set("user_id", claims.UserID)
        c.Set("username", claims.Username)
        c.Next()
    }
}

// PermissionMiddleware 授权中间件
func PermissionMiddleware(permService *service.PermissionService) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID := c.GetInt64("user_id")
        if userID == 0 {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "code":    401,
                "message": "用户未认证",
            })
            return
        }

        // 构建权限编码：resource:action
        resource := c.Param("resource")
        action := c.Request.Method

        // HTTP 方法映射到操作类型
        actionMap := map[string]string{
            "GET":    "read",
            "POST":   "create",
            "PUT":    "update",
            "DELETE": "delete",
            "PATCH":  "update",
        }
        if act, ok := actionMap[action]; ok {
            action = act
        }

        permCode := fmt.Sprintf("%s:%s", resource, action)

        // 检查权限
        hasPerm, err := permService.CheckPermission(c, userID, permCode)
        if err != nil {
            c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
                "code":    500,
                "message": "权限校验失败",
            })
            return
        }

        if !hasPerm {
            c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
                "code":    403,
                "message": "无权操作",
            })
            return
        }

        c.Next()
    }
}
```

路由配置：

```go
package router

import (
    "github.com/gin-gonic/gin"
)

func Setup(r *gin.Engine, permSvc *service.PermissionService) {
    // 不需要认证的路由
    r.POST("/api/v1/login", authHandler.Login)
    r.POST("/api/v1/register", authHandler.Register)

    // 需要认证的路由
    auth := r.Group("/api/v1")
    auth.Use(middleware.AuthMiddleware())
    {
        // 需要权限校验的路由
        perm := auth.Group("")
        perm.Use(middleware.PermissionMiddleware(permSvc))
        {
            // /api/v1/order/create → 权限编码 order:create
            perm.POST("/order/create", orderHandler.Create)
            perm.GET("/order/list", orderHandler.List)
            perm.PUT("/order/:id", orderHandler.Update)
            perm.DELETE("/order/:id", orderHandler.Delete)

            perm.POST("/user/create", userHandler.Create)
            perm.GET("/user/list", userHandler.List)
        }

        // 需要认证但不需要权限校验的路由
        auth.GET("/profile", userHandler.Profile)
        auth.PUT("/profile/password", userHandler.ChangePassword)
    }
}
```

> 中间件是 Go Web 框架的灵魂。把认证和授权拆成两个中间件，既复用又灵活。

### 5.4.3 权限校验的多种模式

上面展示的是基于中间件的自动权限校验，适用于 RESTful API。但有些场景需要更灵活的校验方式：

**模式一：中间件自动校验（推荐）**

适用于标准的 CRUD 接口，路由和权限编码有明确的映射关系。优点是零代码侵入，加一个路由就自动有了权限校验。

**模式二：代码内手动校验**

适用于权限逻辑比较复杂的场景。比如"用户可以创建订单，但只有订单的创建者才能取消订单"。

```go
func (h *OrderHandler) Cancel(c *gin.Context) {
    userID := c.GetInt64("user_id")
    orderID := c.Param("id")

    // 先检查功能权限
    if !h.permSvc.CheckPermission(c, userID, "order:cancel") {
        c.JSON(403, gin.H{"message": "无取消订单权限"})
        return
    }

    // 再检查数据权限（只有创建者才能取消）
    order, err := h.orderSvc.GetByID(c, orderID)
    if err != nil {
        c.JSON(500, gin.H{"message": "订单不存在"})
        return
    }

    if order.UserID != userID && !h.permSvc.CheckPermission(c, userID, "order:cancel_any") {
        c.JSON(403, gin.H{"message": "只能取消自己的订单"})
        return
    }

    // 执行取消逻辑
    if err := h.orderSvc.Cancel(c, orderID); err != nil {
        c.JSON(500, gin.H{"message": err.Error()})
        return
    }

    c.JSON(200, gin.H{"message": "取消成功"})
}
```

**模式三：数据权限过滤**

适用于列表查询，需要在 SQL 层面做权限过滤。

```go
// GetOrderList 获取订单列表（带数据权限过滤）
func (s *OrderService) GetOrderList(ctx context.Context, userID int64, req *OrderListReq) ([]*Order, int64, error) {
    query := s.db.WithContext(ctx).Model(&Order{})

    // 数据权限过滤
    permCodes, err := s.permSvc.GetUserPermissionCodes(ctx, userID)
    if err != nil {
        return nil, 0, err
    }

    // 如果没有"查看所有订单"的权限，只能看自己的
    if !permCodes["order:read_all"] {
        query = query.Where("user_id = ?", userID)
    }

    // 如果有"查看本部门订单"的权限，加上部门过滤
    if permCodes["order:read_dept"] {
        deptIDs, _ := s.getUserDeptIDs(ctx, userID)
        query = query.Where("user_id IN (SELECT id FROM users WHERE dept_id IN ?)", deptIDs)
    }

    // 分页
    var total int64
    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    var orders []*Order
    if err := query.Offset(req.Offset()).Limit(req.Limit()).Find(&orders).Error; err != nil {
        return nil, 0, err
    }

    return orders, total, nil
}
```

### 5.4.4 权限缓存策略

权限校验是高频操作，每个 API 请求都要走一次。如果不做缓存，数据库扛不住。

我的缓存策略是三级缓存：

```
请求 → 本地内存缓存（L1）→ Redis 缓存（L2）→ 数据库（L3）
```

```go
package cache

import (
    "context"
    "sync"
    "time"
)

// LocalCache 本地内存缓存（L1）
type LocalCache struct {
    mu      sync.RWMutex
    data    map[string]*entry
    ttl     time.Duration
}

type entry struct {
    value      interface{}
    expireAt   time.Time
}

func NewLocalCache(ttl time.Duration) *LocalCache {
    c := &LocalCache{
        data: make(map[string]*entry),
        ttl:  ttl,
    }
    // 启动定期清理
    go c.cleanup()
    return c
}

func (c *LocalCache) Get(key string) (interface{}, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()

    e, ok := c.data[key]
    if !ok || time.Now().After(e.expireAt) {
        return nil, false
    }
    return e.value, true
}

func (c *LocalCache) Set(key string, value interface{}) {
    c.mu.Lock()
    defer c.mu.Unlock()

    c.data[key] = &entry{
        value:    value,
        expireAt: time.Now().Add(c.ttl),
    }
}

func (c *LocalCache) Del(key string) {
    c.mu.Lock()
    defer c.mu.mu.Unlock()
    delete(c.data, key)
}

func (c *LocalCache) cleanup() {
    ticker := time.NewTicker(time.Minute)
    defer ticker.Stop()
    for range ticker.C {
        c.mu.Lock()
        now := time.Now()
        for k, e := range c.data {
            if now.After(e.expireAt) {
                delete(c.data, k)
            }
        }
        c.mu.Unlock()
    }
}

// PermissionCache 三级权限缓存
type PermissionCache struct {
    local  *LocalCache      // L1: 本地缓存，1分钟
    redis  *RedisClient     // L2: Redis缓存，5分钟
}

func NewPermissionCache(redis *RedisClient) *PermissionCache {
    return &PermissionCache{
        local: NewLocalCache(time.Minute),
        redis: redis,
    }
}

func (c *PermissionCache) Get(ctx context.Context, key string) (map[string]bool, error) {
    // L1: 本地缓存
    if val, ok := c.local.Get(key); ok {
        return val.(map[string]bool), nil
    }

    // L2: Redis 缓存
    var perms map[string]bool
    if err := c.redis.Get(ctx, key, &perms); err == nil {
        c.local.Set(key, perms)
        return perms, nil
    }

    return nil, ErrCacheMiss
}

func (c *PermissionCache) Set(ctx context.Context, key string, perms map[string]bool) error {
    // 写入两级缓存
    c.local.Set(key, perms)
    return c.redis.Set(ctx, key, perms, 5*time.Minute)
}

func (c *PermissionCache) Del(ctx context.Context, key string) error {
    c.local.Del(key)
    return c.redis.Del(ctx, key)
}
```

设计要点：

1. **L1 缓存用本地内存**：省去网络开销，适合高频读取。但要注意单机容量，只存权限编码集合（一个用户几十到几百个权限编码，占用很少）。
2. **L2 缓存用 Redis**：多实例之间共享缓存数据。
3. **缓存失效策略**：管理员修改权限时，同时清除 L1 和 L2 缓存。L1 的 TTL 设为 1 分钟，即使忘了清除，最多 1 分钟后也会自动过期。

> 多级缓存不是过度设计。当你每秒有上万次权限校验请求时，每次都打 Redis 也会把 Redis 打爆。

### 5.4.6 数据权限的通用实现

前面提到了数据权限的重要性，这里给出一个通用的实现方案。核心思路是用 Go 的装饰器模式，在查询构建器上叠加权限过滤条件。

```go
package dataperm

import (
    "context"
    "fmt"

    "gorm.io/gorm"
)

// DataPermissionScope 数据权限范围
type DataPermissionScope int

const (
    ScopeAll    DataPermissionScope = iota // 全部数据
    ScopeDept                               // 本部门数据
    ScopeDeptAndSub                        // 本部门及子部门
    ScopeSelf                               // 仅自己
)

// DataPermissionFilter 数据权限过滤器
type DataPermissionFilter struct {
    userID  int64
    deptID  int64
    scope   DataPermissionScope
}

// Apply 将数据权限过滤条件应用到查询上
func (f *DataPermissionFilter) Apply(query *gorm.DB, ownerField string, deptField string) *gorm.DB {
    switch f.scope {
    case ScopeAll:
        // 不加任何过滤条件
        return query
    case ScopeSelf:
        return query.Where(fmt.Sprintf("%s = ?", ownerField), f.userID)
    case ScopeDept:
        return query.Where(fmt.Sprintf("%s = ?", deptField), f.deptID)
    case ScopeDeptAndSub:
        // 需要先查出子部门 ID 列表
        subDeptIDs := f.getSubDeptIDs()
        deptIDs := append([]int64{f.deptID}, subDeptIDs...)
        return query.Where(fmt.Sprintf("%s IN ?", deptField), deptIDs)
    default:
        return query.Where(fmt.Sprintf("%s = ?", ownerField), f.userID)
    }
}

// getSubDeptIDs 获取子部门ID列表
func (f *DataPermissionFilter) getSubDeptIDs() []int64 {
    // 实际项目中从缓存或数据库获取
    return []int64{}
}

// NewDataPermissionFilter 从用户权限创建数据权限过滤器
func NewDataPermissionFilter(ctx context.Context, userID int64, permSvc *PermissionService) *DataPermissionFilter {
    permCodes, _ := permSvc.GetUserPermissionCodes(ctx, userID)

    var scope DataPermissionScope
    switch {
    case permCodes["data:all"]:
        scope = ScopeAll
    case permCodes["data:dept_sub"]:
        scope = ScopeDeptAndSub
    case permCodes["data:dept"]:
        scope = ScopeDept
    default:
        scope = ScopeSelf
    }

    // 获取用户所属部门
    deptID, _ := permSvc.GetUserDeptID(ctx, userID)

    return &DataPermissionFilter{
        userID: userID,
        deptID: deptID,
        scope:  scope,
    }
}
```

在 Service 层使用时，只需要一行代码就能加上数据权限过滤：

```go
func (s *OrderService) List(ctx context.Context, req *OrderListReq) ([]*Order, int64, error) {
    userID := ctxutil.GetUserID(ctx)

    // 创建数据权限过滤器
    filter := dataperm.NewDataPermissionFilter(ctx, userID, s.permSvc)

    query := s.db.WithContext(ctx).Model(&Order{})
    // 应用数据权限过滤
    query = filter.Apply(query, "user_id", "dept_id")

    // 其他业务过滤条件
    if req.Status != "" {
        query = query.Where("status = ?", req.Status)
    }
    if req.StartTime != nil {
        query = query.Where("created_at >= ?", req.StartTime)
    }

    var total int64
    query.Count(&total)

    var orders []*Order
    query.Offset(req.Offset()).Limit(req.Limit()).Find(&orders)

    return orders, total, nil
}
```

这种设计的优点是数据权限逻辑和业务查询逻辑完全解耦。换一种数据权限规则，只需要改 `DataPermissionFilter`，不用动业务代码。

> 数据权限的核心难点不是实现，而是设计。在架构层面预留好扩展点，后面不管加什么规则都不会侵入业务代码。

### 5.4.7 权限系统的可观测性

权限系统是安全防线，必须要有完善的日志和监控。

```go
package middleware

import (
    "time"

    "github.com/gin-gonic/gin"
)

// PermissionLog 权限校验日志
type PermissionLog struct {
    UserID      int64     `json:"user_id"`
    Username    string    `json:"username"`
    Permission  string    `json:"permission"`
    Resource    string    `json:"resource"`
    Action      string    `json:"action"`
    Path        string    `json:"path"`
    Method      string    `json:"method"`
    IP          string    `json:"ip"`
    Allowed     bool      `json:"allowed"`
    Latency     int64     `json:"latency_ms"`
    Timestamp   time.Time `json:"timestamp"`
}

// AuditLogMiddleware 审计日志中间件
func AuditLogMiddleware(logger *log.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()

        c.Next()

        // 记录权限校验结果
        permLog := &PermissionLog{
            UserID:    c.GetInt64("user_id"),
            Username:  c.GetString("username"),
            Path:      c.Request.URL.Path,
            Method:    c.Request.Method,
            IP:        c.ClientIP(),
            Allowed:   c.Writer.Status() != 403,
            Latency:   time.Since(start).Milliseconds(),
            Timestamp: start,
        }

        // 异步写入日志
        go logger.Write(permLog)

        // 如果是拒绝操作，触发告警
        if c.Writer.Status() == 403 {
            go alertService.NotifyPermissionDenied(permLog)
        }
    }
}
```

需要监控的关键指标：

```
权限校验 QPS         —— 每秒权限校验次数
权限拒绝率           —— 被拒绝的请求占比（异常升高可能意味着权限配置错误）
权限校验延迟         —— P99 延迟应控制在 10ms 以内
缓存命中率           —— L1 + L2 的整体命中率应 > 95%
权限变更频率         —— 每天权限变更次数（异常频繁可能意味着有人在批量操作）
```

---

## 5.5 DeepSeek 辅助权限模型设计

### 5.5.1 为什么要用 AI 辅助设计

权限系统设计有一个很有意思的矛盾：它是系统中最需要严谨的部分，但又最容易出现设计漏洞。人脑在处理"角色 A 继承角色 B，但角色 C 和角色 A 互斥"这种逻辑时，很容易遗漏边界情况。

DeepSeek 这类大语言模型在权限模型设计中的价值不在于"替你设计"，而在于"帮你查漏补缺"。它可以在以下几个环节提供帮助：

1. **需求分析阶段**：列出所有可能的权限场景，避免遗漏
2. **模型设计阶段**：审查你的 RBAC/ABAC 模型，发现潜在的设计缺陷
3. **策略编写阶段**：生成 ABAC 策略的初始版本
4. **测试用例阶段**：根据权限规则生成测试用例

> AI 不会取代架构师，但会用 AI 的架构师会取代不用的那个。

### 5.5.2 用 DeepSeek 做权限场景分析

下面是一个实际的例子。我在设计一个多租户 SaaS 的权限系统时，用 DeepSeek 帮我做场景分析。整个过程分为三步：输入上下文、分析输出、落地到需求文档。

**第一步：输入完整的系统上下文**

AI 的输出质量取决于输入的质量。你给的上下文越完整，它分析得越准确。至少要包含以下信息：

- 业务模式（B2B/B2C/B2B2C）
- 用户类型和角色
- 资源类型和层级关系
- 特殊业务规则
- 已知的安全合规要求

**Prompt 模板：**

```
你是一个权限系统架构师。我正在设计一个多租户 SaaS 平台的权限系统，请帮我分析所有可能的权限场景。

系统背景：
- 多租户 SaaS 平台，每个租户内部有独立的管理体系
- 用户类型：租户管理员、部门管理员、普通员工、外部协作者
- 资源类型：项目、任务、文档、报表、配置
- 特殊需求：支持跨租户协作（租户A的用户可以访问租户B的特定项目）

请输出：
1. 所有可能的权限场景（按角色分类）
2. 每个场景的权限规则（用自然语言描述）
3. 可能被遗漏的边界场景
4. 推荐的权限模型（RBAC/ABAC/混合）及理由
```

DeepSeek 给出的分析中，有几个场景是我确实没有想到的：

- **外部协作者的权限有效期**：外部协作者的权限应该有过期时间，到期自动回收
- **跨租户协作的权限范围**：租户A的用户在租户B的项目中，不能看到租户B的其他项目
- **部门调整时的权限迁移**：用户从部门A调到部门B，原有部门的数据权限应该如何处理
- **权限委托**：管理员临时请假，能否将部分权限委托给他人

这些场景如果不在设计阶段考虑，后期补起来成本极高。

### 5.5.3 AI 辅助设计的最佳实践

经过多次实战，我总结了几条用 AI 辅助权限系统设计的最佳实践：

**实践一：分轮次对话，逐步深入**

不要一次性把所有问题抛给 AI。先让它做场景分析，你 review 后再让它做模型设计，最后再让它做代码审查。每一轮的输出作为下一轮的输入，逐步深入。

**实践二：提供反例**

当你觉得 AI 的建议有问题时，直接告诉它你的担忧。比如："我担心角色继承的递归检查会有性能问题，有没有非递归的方案？" AI 会根据你的反馈调整方案。

**实践三：让 AI 解释推理过程**

在 Prompt 中加上"请解释你的推理过程"。这样你可以了解 AI 给出建议的依据，而不是盲目接受结论。如果推理过程有问题，你能及时发现。

**实践四：交叉验证**

对于关键设计决策，可以用不同的 Prompt 问 DeepSeek 多次，或者换一个问题换个角度问。如果多次回答一致，可信度较高。如果出现矛盾，就需要人工判断。

> AI 是镜子也是放大镜。它能帮你看到思维盲区，但也能放大你的偏见——如果你带着预设去问问题，AI 会顺着你说。

### 5.5.4 用 DeepSeek 审查权限模型

在设计完 RBAC 模型后，可以把模型描述喂给 DeepSeek，让它做一次"设计审查"。

**Prompt 模板：**

```
请审查以下 RBAC 权限模型设计，找出潜在的设计缺陷和安全漏洞。

模型描述：
- 用户表：users (id, username, email, status)
- 角色表：roles (id, code, name, parent_id)  -- parent_id 用于角色继承
- 权限表：permissions (id, code, resource, action, type)
- 用户角色关联：user_roles (user_id, role_id)
- 角色权限关联：role_permissions (role_id, permission_id)

角色继承规则：
- 子角色自动继承父角色的所有权限
- 支持多级继承（A -> B -> C）
- 没有循环检测机制

权限校验逻辑：
1. 获取用户所有角色
2. 递归收集角色的所有权限（含继承的）
3. 检查请求的权限编码是否在权限集合中

请从以下角度审查：
1. 安全漏洞（权限提升、权限绕过等）
2. 性能问题
3. 可维护性问题
4. 缺失的功能
```

DeepSeek 指出了几个关键问题：

**问题一：没有循环检测**

角色继承没有循环检测，如果 A 继承 B，B 又继承 A，会导致无限递归。虽然我在代码实现中用了 `checked` map 来防止死循环，但在数据层面应该也要加约束。

解决方案：在 `role_hierarchy` 表上做约束，或者在分配角色继承关系时做 DFS 检测。

```go
// CheckCycle 检查角色继承是否会形成环
func (s *RoleService) CheckCycle(ctx context.Context, parentID, childID int64) error {
    if parentID == childID {
        return ErrSelfInheritance
    }

    // 从 parentID 开始向上查找，看是否能到达 childID
    visited := make(map[int64]bool)
    current := parentID

    for current != 0 {
        if current == childID {
            return ErrCycleDetected
        }
        if visited[current] {
            break // 已有环，数据异常
        }
        visited[current] = true

        role, err := s.GetByID(ctx, current)
        if err != nil {
            break
        }
        current = role.ParentID
    }

    return nil
}
```

**问题二：权限提升风险**

如果一个普通用户被分配了"管理员"角色，他就能获得所有权限。应该对敏感角色的分配做二次验证。

解决方案：在 `AssignRole` 时检查操作者是否有权限分配该角色。

```go
func (s *UserService) AssignRole(ctx context.Context, operatorID, targetUserID, roleID int64) error {
    // 检查操作者是否有权限分配该角色
    operatorPerms, err := s.permSvc.GetUserPermissionCodes(ctx, operatorID)
    if err != nil {
        return err
    }

    // 需要有 "role:assign" 权限
    if !operatorPerms["role:assign"] {
        return ErrNoPermission
    }

    // 敏感角色需要额外权限
    role, err := s.roleSvc.GetByID(ctx, roleID)
    if err != nil {
        return err
    }

    if role.Code == "super_admin" {
        // 只有超级管理员才能分配超级管理员角色
        if !operatorPerms["super_admin:assign"] {
            return ErrNoPermission
        }
    }

    return s.userRepo.AssignRole(ctx, targetUserID, roleID)
}
```

**问题三：缓存一致性问题**

当角色权限变更时，需要失效所有持有该角色的用户的权限缓存。但我的设计中 `InvalidateUserPermissionCache` 只能按用户 ID 清除缓存，不知道哪些用户持有该角色。

解决方案：维护一个"角色-用户"的反向索引，或者在角色权限变更时广播失效消息。

```go
// InvalidateRolePermissionCache 失效角色下所有用户的权限缓存
func (s *PermissionService) InvalidateRolePermissionCache(ctx context.Context, roleID int64) error {
    // 查询所有持有该角色的用户
    var userIDs []int64
    err := s.db.WithContext(ctx).
        Model(&model.UserRole{}).
        Where("role_id = ?", roleID).
        Pluck("user_id", &userIDs).Error
    if err != nil {
        return err
    }

    // 批量清除缓存
    for _, userID := range userIDs {
        cacheKey := fmt.Sprintf("user:perms:%d", userID)
        if err := s.cache.Del(ctx, cacheKey); err != nil {
            log.Warnf("清除用户 %d 权限缓存失败: %v", userID, err)
        }
    }

    return nil
}
```

### 5.5.5 用 DeepSeek 生成测试用例

权限系统的测试特别重要，但又特别难写——你要覆盖各种角色组合、继承关系、边界情况。DeepSeek 在这方面可以大幅提效。

**Prompt 模板：**

```
基于以下权限模型，请生成完整的测试用例清单。

权限模型：
- 用户可以拥有多个角色
- 角色可以继承（子角色继承父角色权限）
- 权限编码格式：resource:action
- 资源包括：order, user, role, permission, document
- 操作包括：create, read, update, delete

现有角色：
- super_admin（超级管理员，继承 admin）
- admin（管理员，继承 editor, viewer）
- editor（编辑者，继承 viewer）
- viewer（查看者，只有 read 权限）

请生成以下类型的测试用例：
1. 正向测试（应该通过的权限校验）
2. 反向测试（应该被拒绝的权限校验）
3. 边界测试（角色继承的边界情况）
4. 并发测试（权限变更时的并发校验）
5. 缓存测试（缓存一致性验证）
```

DeepSeek 生成的测试用例中，我挑选几个比较有价值的转化为 Go 测试代码：

```go
package rbac_test

import (
    "testing"

    "go-expert/pkg/rbac"
)

func TestPermissionCheck(t *testing.T) {
    manager := setupTestManager(t)

    tests := []struct {
        name     string
        userID   int64
        resource string
        action   string
        want     bool
    }{
        // 正向测试
        {
            name:     "viewer可以读取订单",
            userID:   1, // viewer用户
            resource: "order",
            action:   "read",
            want:     true,
        },
        {
            name:     "editor可以创建订单",
            userID:   2, // editor用户
            resource: "order",
            action:   "create",
            want:     true,
        },
        {
            name:     "admin可以删除订单",
            userID:   3, // admin用户
            resource: "order",
            action:   "delete",
            want:     true,
        },

        // 反向测试
        {
            name:     "viewer不能创建订单",
            userID:   1,
            resource: "order",
            action:   "create",
            want:     false,
        },
        {
            name:     "editor不能删除订单",
            userID:   2,
            resource: "order",
            action:   "delete",
            want:     false,
        },
        {
            name:     "不存在的用户无任何权限",
            userID:   99999,
            resource: "order",
            action:   "read",
            want:     false,
        },

        // 边界测试：角色继承
        {
            name:     "super_admin继承admin的所有权限",
            userID:   4, // super_admin用户
            resource: "order",
            action:   "delete",
            want:     true,
        },
        {
            name:     "editor继承viewer的读取权限",
            userID:   2,
            resource: "order",
            action:   "read",
            want:     true,
        },
        {
            name:     "viewer不继承editor的创建权限",
            userID:   1,
            resource: "order",
            action:   "create",
            want:     false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := manager.CheckPermission(tt.userID, tt.resource, tt.action)
            if got != tt.want {
                t.Errorf("CheckPermission(%d, %s, %s) = %v, want %v",
                    tt.userID, tt.resource, tt.action, got, tt.want)
            }
        })
    }
}

func TestConcurrentPermissionCheck(t *testing.T) {
    manager := setupTestManager(t)

    // 并发校验：同时读取同一用户权限
    done := make(chan bool)
    for i := 0; i < 100; i++ {
        go func() {
            manager.CheckPermission(1, "order", "read")
            done <- true
        }()
    }
    for i := 0; i < 100; i++ {
        <-done
    }
}

func TestCacheInvalidation(t *testing.T) {
    manager := setupTestManager(t)

    // 初始状态：用户1有 order:read 权限
    if !manager.CheckPermission(1, "order", "read") {
        t.Fatal("初始状态应该有读取权限")
    }

    // 移除用户的角色
    _ = manager.RevokeRole(1, 1) // 用户1，角色viewer

    // 权限应该被拒绝
    if manager.CheckPermission(1, "order", "read") {
        t.Fatal("移除角色后应该无读取权限")
    }
}
```

这套测试用例覆盖了正向、反向、边界和并发场景。其中并发测试特别重要——我见过生产环境因为 map 并发读写导致的 panic，就是因为在权限校验的同时修改了角色信息。

> 测试不是写完就完了。定期 review 测试用例，看看有没有新增的场景需要覆盖。权限系统的测试覆盖率应该 > 90%。

### 5.5.6 AI 辅助设计的边界

说了这么多 AI 的好处，也要泼一盆冷水。DeepSeek 在权限系统设计中的能力是有边界的：

**能做的：**
- 场景枚举和查漏补缺
- 代码审查和安全漏洞发现
- 测试用例生成
- 文档撰写

**不能做的：**
- 替你做架构决策（AI 不知道你的业务上下文和团队能力）
- 保证 100% 准确（AI 会幻觉，关键决策必须人工验证）
- 替你承担责任（出了生产事故，不能说"AI 让我这么设计的"）

我的使用原则是：**AI 是顾问，不是决策者。最终的架构决策、代码实现、安全审查，都必须由人来负责。**

具体来说，我会这样划分：

```
AI 负责：
  - "你觉得还有什么场景没考虑到？" → 场景枚举
  - "这段代码有什么安全问题？" → 代码审查
  - "帮我生成测试用例" → 测试生成
  - "帮我写这段的设计文档" → 文档撰写

人负责：
  - 选择 RBAC 还是 ABAC → 架构决策
  - 确定缓存策略和过期时间 → 性能权衡
  - 审查并修改 AI 生成的代码 → 代码质量
  - 对生产环境的安全负责 → 最终责任
```

> AI 是工具不是拐杖。你可以用它加速，但不能用它代替思考。架构师的核心价值不在写代码，而在做决策。

---

## 5.6 权限系统设计自检清单

最后，我总结了一份权限系统设计的自检清单。每次设计完权限系统，过一遍这个清单，能帮你发现大部分常见问题：

### 数据层

- [ ] 用户表和角色表是否分离？是否支持一个用户多个角色？
- [ ] 角色表和权限表是否分离？权限是否可以独立于角色存在？
- [ ] 权限编码是否有统一的命名规范？（如 `resource:action`）
- [ ] 是否支持角色继承？继承关系是否有循环检测？
- [ ] 关联表是否用了联合主键防止重复数据？
- [ ] 是否有软删除和状态字段（启用/禁用）？

### 接口层

- [ ] 认证和授权是否分离为两个独立中间件？
- [ ] 权限校验是否在 API 入口统一拦截？是否有遗漏的接口？
- [ ] 是否支持多种权限校验模式（中间件、手动、数据过滤）？
- [ ] HTTP 方法到操作类型的映射是否正确？
- [ ] 权限校验失败时返回的状态码是否正确？（401 未认证 vs 403 无权限）

### 缓存层

- [ ] 是否有缓存？缓存命中率是否达标（> 95%）？
- [ ] 缓存 key 的设计是否合理？是否包含用户维度？
- [ ] 权限变更时是否能正确失效相关缓存？
- [ ] 缓存是否有兜底机制？（缓存宕机时是否能降级到数据库？）
- [ ] 本地缓存是否有容量限制和过期清理？

### 安全层

- [ ] 敏感角色的分配是否有二次验证？
- [ ] 是否有权限审计日志？
- [ ] 是否有权限变更的告警机制？
- [ ] 是否防止了权限提升攻击？
- [ ] 数据权限是否考虑了行级和列级？
- [ ] 越权访问是否有自动检测和告警？

### 可扩展性

- [ ] 权限系统是否能支持多租户？
- [ ] 是否预留了 ABAC 扩展点？
- [ ] 权限规则是否支持动态配置（不重启服务）？
- [ ] 是否支持权限的批量导入导出？
- [ ] 是否考虑了未来可能的权限迁移和版本管理？

> 清单不是摆设。每次 code review 的时候过一遍，每次上线前过一遍。好记性不如烂笔头，好架构不如好清单。

---

## 本章总结

这一章我们从业务场景出发，逐步推导出了权限系统的完整设计：

1. **业务场景分析**：后台管理、多租户 SaaS、协作应用、开放平台、物联网设备控制五种典型场景，权限系统的核心需求清单，以及从业务目标到技术需求的拆解方法论
2. **RBAC 模型设计**：从 RBAC0 到 RBAC3 的演进，工程化考量（权限粒度、角色数量、变更通知），完整的 Go 代码实现，角色继承的递归处理
3. **ABAC 模型设计**：四个属性维度的分析，策略引擎的实现，RBAC vs ABAC 的选择建议，混合模型的实现思路
4. **关系建模**：五张核心表的数据库设计，权限编码规范，GORM 模型定义，权限树构建算法，用户权限加载与缓存
5. **架构设计**：三层架构（API/Service/Data），认证授权分离，三种权限校验模式，数据权限通用实现，三级缓存策略，可观测性方案
6. **DeepSeek 辅助设计**：AI 在场景分析、模型审查、测试生成中的实际应用，AI 辅助的最佳实践和边界

下一章，我们会把这套设计落地为完整的代码实现：用户管理、角色管理、权限管理的 CRUD 接口，权限校验中间件的集成，前端权限菜单的对接方案，以及数据权限过滤的具体实现。

---

**如果这篇文章对你有帮助，点个收藏，后面写代码的时候翻出来对着抄就行。**

**有什么问题或者不同的设计思路，欢迎在评论区交流。权限系统的设计没有标准答案，只有更适合你业务的方案。**

**系列持续更新中，关注追更不迷路。下一章我们手把手写权限系统的核心功能实现，包括完整的 CRUD 接口和前后端权限对接。**

---

系列进度：5/16

下一章预告：第6章「权限系统核心功能实现」—— 用户/角色/权限的 CRUD 接口实现，权限中间件的完整代码，前端菜单权限对接方案，数据权限过滤的通用实现。

---

## 怕浪猫说

权限系统是我这些年踩过最多坑的领域，没有之一。从最初把 if 判断写满 controller，到后来用 RBAC 重构，再到引入 ABAC 做数据权限，每一次演进都是被生产事故逼出来的。这一章把我的经验浓缩成了设计指南，但纸上得来终觉浅——真正理解权限系统的复杂度，还是得自己动手实现一遍。下一章，我们代码见。