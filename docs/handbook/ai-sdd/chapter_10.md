# 第10章 项目实战：SDD + Harness 规范从零启动旅游项目

理论演练了足够多，现在开始真正的综合实战。本章用 SDD + Harness 工程化方法论，从零启动一个完整的旅游项目——"旅智行"。这不是 demo，不是玩具项目，而是一个包含用户系统、景点管理、行程规划、AI 推荐等完整功能的企业级应用。我们将严格按照 SDD 规范驱动开发流程，结合 Harness Engineering 的核心机制，演示如何让 AI 在规范的约束下高效、可靠地产出代码。

---

## 10.1 项目立项与 SDD 驱动的需求分析

**项目定位**

旅智行（TravelWise）—— AI 驱动的智能旅游规划平台。用户可以浏览景点、创建行程、获取 AI 推荐的旅游路线和预算估算。

核心差异化能力：

- AI 行程推荐：根据用户偏好、时间、预算，自动生成最优行程
- 智能预算估算：实时计算行程费用，提供省钱建议
- 个性化推荐：基于用户历史行为，推荐感兴趣的景点和活动

**SDD 驱动的需求分析**

与传统"拍脑袋"式需求分析不同，SDD 要求在需求阶段就产出结构化的 Spec 文档。

第一步：用户故事收集

```markdown
## 用户故事列表

### US-001: 浏览景点
As a 游客
I want to 按城市浏览景点列表
So that 我能了解目的地的旅游资源

### US-002: 查看景点详情
As a 游客
I want to 查看景点的详细信息（描述、评分、门票、开放时间）
So that 我能决定是否前往

### US-003: 创建行程
As a 注册用户
I want to 创建多日行程，每天安排多个景点
So that 我能规划旅行路线

### US-004: AI 推荐行程
As a 注册用户
I want to 输入目的地、天数和预算，获得 AI 推荐的行程
So that 我能快速获得专业级旅行方案

### US-005: 预算估算
As a 注册用户
I want to 查看行程的总预算明细（交通、住宿、门票、餐饮）
So that 我能控制旅行支出
```

第二步：Spec 文档生成

将用户故事交给 AI 生成 Feature Spec：

```bash
claude "将以下用户故事转化为开发 Feature Spec，每个 Spec 包含：
API 定义、数据模型、验证规则、验收标准、错误处理

用户故事：
[粘贴 US-001 到 US-005]"
```

第三步：Spec 评审

AI 自动评审 Spec 的完整性和一致性，人工审查补充遗漏。

---

## 10.2 架构 Spec 与 API Spec 编写

**架构 Spec**

```markdown
# Architecture Spec: TravelWise

## 整体架构
三层架构 + AI 服务层

Frontend (React + TypeScript)
    ↓ REST + WebSocket
API Gateway (Spring Boot 3)
    ↓
Business Services
    ├── UserService
    ├── AttractionService
    ├── ItineraryService
    ├── AIRecommendationService
    └── BudgetEstimationService
    ↓
Data Layer (PostgreSQL + Redis + Elasticsearch)

## 模块划分
| 模块 | 职责 | 核心技术 |
|------|------|---------|
| user | 用户注册/登录/Profile | Spring Security + JWT |
| attraction | 景点CRUD/搜索/推荐 | Elasticsearch + Redis |
| itinerary | 行程创建/编辑/分享 | PostgreSQL + WebSocket |
| ai | AI推荐/预算估算 | Spring AI + OpenAI |
| notification | 通知/消息推送 | WebSocket + Email |

## 技术选型
- 前端：React 18 + TypeScript + Vite + TailwindCSS
- 后端：Spring Boot 3 + Spring AI + MyBatis Plus
- 数据库：PostgreSQL 16 + Redis 7 + Elasticsearch 8
- AI：OpenAI GPT-4o / Claude 3.5 Sonnet
- 部署：Docker + Nginx

## 数据流
1. 用户请求 → API Gateway → 认证鉴权 → 业务Service → 数据层
2. AI推荐请求 → AIRecommendationService → LLM + 知识库 → 结构化结果
3. 搜索请求 → AttractionService → Elasticsearch → 结果列表
```

**API Spec**

```markdown
# API Spec: Attraction Module

## GET /api/attractions
获取景点列表（分页）

### Request
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| city | string | 否 | 城市筛选 |
| keyword | string | 否 | 关键词搜索 |
| page | int | 否 | 页码，默认1 |
| pageSize | int | 否 | 每页数量，默认20，最大100 |

### Response
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "西湖",
        "city": "杭州",
        "rating": 4.8,
        "ticketPrice": 0,
        "thumbnail": "https://cdn.example.com/xihu.jpg",
        "tags": ["自然风光", "世界遗产"]
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
}

### Error Codes
| code | message | 说明 |
|------|---------|------|
| 400 | 参数错误 | pageSize 超过100 |
| 500 | 服务异常 | Elasticsearch 不可用 |

## POST /api/ai/itinerary/recommend
AI 推荐行程

### Request
{
  "destination": "杭州",
  "days": 3,
  "budget": 3000,
  "preferences": ["自然风光", "历史文化"],
  "travelDate": "2026-07-01"
}

### Response
{
  "code": 0,
  "data": {
    "itinerary": {
      "title": "杭州3日深度游",
      "totalBudget": 2800,
      "days": [
        {
          "day": 1,
          "activities": [
            {
              "attraction": "西湖",
              "duration": "3小时",
              "cost": 0,
              "tip": "建议早上8点前到达避开人流"
            }
          ],
          "accommodation": {
            "name": "西湖边民宿",
            "cost": 380
          }
        }
      ]
    }
  }
}
```

---

## 10.3 数据模型 Spec 与 Spec 评审

**数据模型 Spec**

```markdown
# Data Model Spec: TravelWise

## User
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 用户ID |
| email | varchar(255) | UNIQUE, NOT NULL | 邮箱 |
| password_hash | varchar(255) | NOT NULL | bcrypt哈希 |
| name | varchar(100) | NOT NULL | 昵称 |
| avatar | varchar(500) | | 头像URL |
| preferences | jsonb | | 偏好标签 |
| created_at | timestamp | NOT NULL | 创建时间 |

## Attraction
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 景点ID |
| name | varchar(200) | NOT NULL | 景点名称 |
| city | varchar(100) | NOT NULL, INDEX | 城市 |
| description | text | | 详细描述 |
| rating | decimal(2,1) | DEFAULT 0 | 评分0-5 |
| ticket_price | decimal(10,2) | DEFAULT 0 | 门票价格 |
| open_hours | jsonb | | 开放时间 |
| location | point | | 经纬度 |
| tags | varchar(100)[] | | 标签数组 |
| images | jsonb | | 图片列表 |
| created_at | timestamp | NOT NULL | 创建时间 |

## Itinerary
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 行程ID |
| user_id | UUID | FK → User | 创建者 |
| title | varchar(200) | NOT NULL | 行程标题 |
| destination | varchar(100) | NOT NULL | 目的地 |
| start_date | date | | 出发日期 |
| end_date | date | | 返回日期 |
| budget | decimal(10,2) | | 预算 |
| days | jsonb | NOT NULL | 每日安排 |
| is_public | boolean | DEFAULT false | 是否公开 |
| status | varchar(20) | DEFAULT 'draft' | draft/published |
| created_at | timestamp | NOT NULL | 创建时间 |

## ItineraryDay (嵌套在 Itinerary.days 中)
{
  "day": 1,
  "activities": [
    {
      "attractionId": "uuid",
      "startTime": "09:00",
      "duration": 180,
      "notes": "建议早起"
    }
  ],
  "accommodation": {
    "name": "酒店名",
    "cost": 500
  }
}
```

**Spec 评审**

使用 AI 自动评审 Spec 的完整性和一致性：

```bash
openspec review specs/
# 或手动触发
claude "评审以下 Spec 文档的完整性和一致性：
1. API Spec 中的字段是否与 Data Model 对应？
2. 是否有遗漏的错误码？
3. 数据模型的索引是否合理？
4. 是否有安全隐患？"
```

评审关注点：

- API 字段与数据模型字段是否一一对应
- 错误码覆盖是否完整
- 数据模型索引是否支撑查询场景
- 敏感字段是否做了脱敏处理
- JSONB 字段是否有 Schema 校验

---

## 10.4 Harness 配置与任务拆分

**Harness 配置**

为旅游项目配置完整的 Harness 环境：

```markdown
# .claude/CLAUDE.md

## 项目：旅智行 TravelWise

## 架构概览
- 前端：React 18 + Vite + TailwindCSS，端口 5173
- 后端：Spring Boot 3 + Spring AI，端口 8080
- 数据库：PostgreSQL 16 + Redis 7 + Elasticsearch 8

## 目录结构
- frontend/src/pages/       # 页面组件
- frontend/src/components/  # 通用组件
- frontend/src/services/    # API 调用
- backend/src/main/java/com/travelwise/
  - controller/   # REST 控制器
  - service/      # 业务逻辑
  - mapper/       # 数据访问
  - model/        # 数据模型
  - config/       # 配置类
- specs/          # SDD Spec 文档

## 关键约定
- API 统一返回 { code, message, data }
- 前端状态管理使用 Zustand
- 后端使用 MyBatis Plus，禁止写 XML 映射
- 所有数据库操作通过 Service 层
- AI 功能通过 Spring AI 调用

## 禁止
- 禁止在 Controller 层写业务逻辑
- 禁止直接使用 JdbcTemplate
- 禁止前端直接调用后端非 /api/ 开头的接口
- 禁止在代码中硬编码密钥和连接串
```

**任务拆分**

```markdown
# 任务拆分：TravelWise MVP

## Sprint1: 基础框架（3天）
- [T1] 后端项目骨架 + 配置
- [T2] 前端项目骨架 + 路由
- [T3] 数据库 Schema + 迁移
- [T4] Docker Compose 开发环境

## Sprint2: 用户模块（2天）
- [T5] 用户注册 API
- [T6] 用户登录 + JWT
- [T7] 前端注册/登录页面

## Sprint3: 景点模块（3天）
- [T8] 景点 CRUD API
- [T9] 景点搜索（Elasticsearch）
- [T10] 前端景点列表页
- [T11] 前端景点详情页

## Sprint4: 行程模块（3天）
- [T12] 行程 CRUD API
- [T13] 前端行程创建/编辑页
- [T14] 前端行程详情页

## Sprint5: AI 模块（3天）
- [T15] AI 行程推荐 API
- [T16] AI 预算估算 API
- [T17] 前端 AI 推荐页面

## Sprint6: 联调交付（2天）
- [T18] 全链路联调
- [T19] 性能优化
- [T20] 部署文档 + 验收
```

---

## 10.5 前端工程开发与 UI 组件库构建

**前端工程初始化**

```bash
# 使用 Vite 创建项目
pnpm create vite travelwise-web --template react-ts

# 安装核心依赖
cd travelwise-web
pnpm add react-router-dom zustand axios
pnpm add react-markdown remark-gfm
pnpm add echarts echarts-for-react
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
```

**UI 组件库构建**

在 Vibe Coding 模式下，组件库的构建策略是"按需创建，逐步沉淀"：

```tsx
// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, children, ...props }: ButtonProps) {
  const baseClasses = 'rounded-lg font-medium transition-colors disabled:opacity-50';
  const variantClasses = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizeClasses = { sm: 'px-3 py-1 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3 text-lg' };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`} disabled={loading} {...props}>
      {loading ? '加载中...' : children}
    </button>
  );
}
```

**页面组件开发**

```tsx
// src/pages/AttractionList.tsx
import { useAttractions } from '../hooks/useAttractions';
import { AttractionCard } from '../components/AttractionCard';

export function AttractionList() {
  const { attractions, loading, filters, setFilters } = useAttractions();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">探索景点</h1>
      
      <div className="flex gap-4 mb-6">
        <input
          className="flex-1 rounded-lg border p-3"
          placeholder="搜索景点..."
          value={filters.keyword}
          onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
        />
        <select
          className="rounded-lg border p-3"
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
        >
          <option value="">全部城市</option>
          <option value="杭州">杭州</option>
          <option value="北京">北京</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {attractions.map((a) => (
          <AttractionCard key={a.id} attraction={a} />
        ))}
      </div>
    </div>
  );
}
```

---

**本章小结**

| 步骤 | 核心要点 |
|------|---------|
| 需求分析 | SDD 驱动：用户故事 → Feature Spec → 评审 |
| 架构 Spec | 三层架构 + AI 服务层，明确模块划分和技术选型 |
| API Spec | 精确定义接口的请求/响应/错误码，AI 据此生成代码 |
| 数据模型 | UUID 主键 + JSONB 灵活字段 + 合理索引 |
| Harness 配置 | CLAUDE.md 定义项目上下文、编码约定和禁止事项 |
| 任务拆分 | 6 个 Sprint、20 个任务，依赖关系清晰 |
| 前端开发 | 按需创建 UI 组件，Zustand 状态管理 |

下一章，我们将完成后端工程开发和 AI 功能集成，完整走通旅游项目从 Spec 到代码的全链路。
