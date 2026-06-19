# 第11章 项目实战：后端工程开发与 AI 功能集成

前端框架就绪后，进入后端开发阶段。后端是 AI 功能落地的核心阵地——Spring AI 的集成、行程推荐算法、预算估算逻辑都需要在后端实现。本章完成后端工程开发，并将 AI 能力集成到项目中。

---

## 11.1 后端工程初始化与数据库设计

**Spring Boot 项目初始化**

使用 Spring Initializr 生成项目骨架：

```bash
curl https://start.spring.io/starter.zip \
  -d type=maven-project \
  -d language=java \
  -d bootVersion=3.2.0 \
  -d groupId=com.travelwise \
  -d artifactId=travelwise-server \
  -d name=travelwise-server \
  -d packageName=com.travelwise \
  -d dependencies=web,data-jpa,security,validation,redis \
  -o travelwise-server.zip && unzip travelwise-server.zip
```

补充核心依赖（pom.xml）：

```xml
<!-- Spring AI -->
<dependency>
  <groupId>org.springframework.ai</groupId>
  <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>

<!-- MyBatis Plus -->
<dependency>
  <groupId>com.baomidou</groupId>
  <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
  <version>3.5.5</version>
</dependency>

<!-- PostgreSQL -->
<dependency>
  <groupId>org.postgresql</groupId>
  <artifactId>postgresql</artifactId>
</dependency>

<!-- Elasticsearch -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
```

**数据库设计**

根据 Data Model Spec 创建数据库表：

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(500),
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 景点表
CREATE TABLE attractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  city VARCHAR(100) NOT NULL,
  description TEXT,
  rating DECIMAL(2,1) DEFAULT 0,
  ticket_price DECIMAL(10,2) DEFAULT 0,
  open_hours JSONB,
  location POINT,
  tags VARCHAR(100)[],
  images JSONB DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attractions_city ON attractions(city);
CREATE INDEX idx_attractions_tags ON attractions USING GIN(tags);

-- 行程表
CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(10,2),
  days JSONB NOT NULL DEFAULT '[]',
  is_public BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_itineraries_user ON itineraries(user_id);
```

---

## 11.2 用户模块开发（注册、登录、JWT 认证）

**用户注册接口**

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ApiResponse<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.success(authService.register(request));
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authService.login(request));
    }
}
```

```java
@Service
public class AuthService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public RegisterResponse register(RegisterRequest request) {
        // 校验邮箱唯一性
        if (userMapper.existsByEmail(request.getEmail())) {
            throw new BusinessException(400, "邮箱已注册");
        }

        // 创建用户
        User user = new User();
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setName(request.getName());
        userMapper.insert(user);

        // 生成 Token
        String token = jwtUtil.generateToken(user.getId());

        return new RegisterResponse(user.getId(), token);
    }
}
```

**JWT 配置**

```java
@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration:86400000}")
    private long expiration;

    public String generateToken(UUID userId) {
        return Jwts.builder()
                .subject(userId.toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(Keys.hmacShaKeyFor(secret.getBytes()))
                .compact();
    }

    public UUID validateToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(secret.getBytes()))
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return UUID.fromString(claims.getSubject());
    }
}
```

---

## 11.3 景点模块开发（CRUD 与搜索）

**景点 CRUD 接口**

```java
@RestController
@RequestMapping("/api/attractions")
public class AttractionController {

    private final AttractionService attractionService;

    @GetMapping
    public ApiResponse<PageResult<AttractionDTO>> list(
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return ApiResponse.success(attractionService.list(city, keyword, page, pageSize));
    }

    @GetMapping("/{id}")
    public ApiResponse<AttractionDTO> detail(@PathVariable UUID id) {
        return ApiResponse.success(attractionService.getById(id));
    }
}
```

**Elasticsearch 搜索**

```java
@Service
public class AttractionService {

    private final AttractionRepository attractionRepo;
    private final AttractionEsRepository esRepo;

    public PageResult<AttractionDTO> search(String keyword, String city, int page, int pageSize) {
        NativeQuery query = NativeQuery.builder()
                .withQuery(q -> q.multiMatch(m -> m
                        .query(keyword)
                        .fields("name^3", "description", "tags")
                ))
                .withFilter(f -> f.term(t -> t.field("city").value(city)))
                .withPageable(PageRequest.of(page - 1, pageSize))
                .build();

        SearchHits<AttractionDoc> hits = esRepo.search(query);
        
        List<AttractionDTO> items = hits.getSearchHits().stream()
                .map(SearchHit::getContent)
                .map(this::toDTO)
                .toList();

        return new PageResult<>(items, hits.getTotalHits(), page, pageSize);
    }
}
```

---

## 11.4 行程模块开发（创建、编辑、分享）

```java
@Service
public class ItineraryService {

    private final ItineraryMapper itineraryMapper;

    public Itinerary create(UUID userId, CreateItineraryRequest request) {
        Itinerary itinerary = new Itinerary();
        itinerary.setUserId(userId);
        itinerary.setTitle(request.getTitle());
        itinerary.setDestination(request.getDestination());
        itinerary.setStartDate(request.getStartDate());
        itinerary.setEndDate(request.getEndDate());
        itinerary.setBudget(request.getBudget());
        itinerary.setDays(request.getDays());
        itinerary.setStatus("draft");
        itineraryMapper.insert(itinerary);
        return itinerary;
    }

    public Itinerary update(UUID userId, UUID itineraryId, UpdateItineraryRequest request) {
        Itinerary itinerary = getById(itineraryId);
        
        // 权限校验
        if (!itinerary.getUserId().equals(userId)) {
            throw new BusinessException(403, "无权修改他人行程");
        }

        itinerary.setTitle(request.getTitle());
        itinerary.setDays(request.getDays());
        itineraryMapper.updateById(itinerary);
        return itinerary;
    }
}
```

---

## 11.5 AI 行程推荐接口开发

这是项目的核心 AI 功能。用户输入目的地、天数、预算和偏好，AI 生成完整的行程方案。

```java
@Service
public class AIRecommendationService {

    private final ChatClient chatClient;
    private final AttractionService attractionService;

    public ItineraryRecommendation recommend(RecommendRequest request) {
        // 1. 获取相关景点数据
        List<AttractionDTO> attractions = attractionService.getByCity(request.getDestination());

        // 2. 构建 Prompt
        String prompt = buildPrompt(request, attractions);

        // 3. 调用 LLM
        String response = chatClient.prompt()
                .user(prompt)
                .call()
                .content();

        // 4. 解析结构化结果
        return parseRecommendation(response);
    }

    private String buildPrompt(RecommendRequest req, List<AttractionDTO> attractions) {
        return """
            作为旅游规划专家，请为以下需求推荐行程：
            
            目的地：%s
            天数：%d 天
            预算：%.2f 元
            偏好：%s
            出发日期：%s
            
            可选景点：
            %s
            
            要求：
            1. 每天安排 2-4 个景点
            2. 合理安排游览顺序，避免来回奔波
            3. 提供每日预算明细（交通、住宿、门票、餐饮）
            4. 总预算不超过用户设定值
            5. 返回 JSON 格式：
            {
              "title": "行程标题",
              "totalBudget": 2800,
              "days": [
                {
                  "day": 1,
                  "activities": [
                    {"attraction": "景点名", "duration": "3小时", "cost": 50, "tip": "建议"}
                  ],
                  "accommodation": {"name": "酒店名", "cost": 380},
                  "transportCost": 100,
                  "foodCost": 150
                }
              ]
            }
            """.formatted(
                req.getDestination(),
                req.getDays(),
                req.getBudget(),
                String.join(", ", req.getPreferences()),
                req.getTravelDate(),
                formatAttractions(attractions)
            );
    }
}
```

---

## 11.6 AI 预算估算与多轮对话上下文管理

**预算估算**

```java
@Service
public class BudgetEstimationService {

    private final ChatClient chatClient;

    public BudgetEstimation estimate(EstimateRequest request) {
        String prompt = """
            估算以下行程的预算：
            
            目的地：%s
            天数：%d
            出发城市：%s
            住宿标准：%s/晚
            出行方式：%s
            
            返回 JSON：
            {
              "transport": {"flight": 800, "local": 200},
              "accommodation": {"perNight": 380, "total": 1140},
              "tickets": 350,
              "food": {"perDay": 150, "total": 450},
              "misc": 200,
              "total": 3140,
              "savings": [
                {"tip": "选择青旅可节省 760 元", "amount": 760},
                {"tip": "工作日出行机票更便宜", "amount": 200}
              ]
            }
            """.formatted(
                request.getDestination(),
                request.getDays(),
                request.getOriginCity(),
                request.getAccommodationLevel(),
                request.getTransportMode()
            );

        String response = chatClient.prompt().user(prompt).call().content();
        return parseEstimation(response);
    }
}
```

**多轮对话上下文管理**

AI 行程推荐往往需要多轮调整："帮我调整第二天的行程"、"预算超了，帮我砍掉一些景点"。

```java
@Service
public class ChatContextManager {

    private final RedisTemplate<String, Object> redisTemplate;

    public void saveContext(String sessionId, ChatContext context) {
        redisTemplate.opsForValue().set(
            "chat:context:" + sessionId,
            context,
            Duration.ofHours(2)
        );
    }

    public ChatContext getContext(String sessionId) {
        return (ChatContext) redisTemplate.opsForValue().get("chat:context:" + sessionId);
    }
}
```

---

## 11.7 前后端联调与 E2E 测试

**联调要点**

| 功能 | 验证项 | 验证方式 |
|------|--------|---------|
| 用户注册 | 邮箱重复报 400 | curl 测试 |
| 用户登录 | 返回有效 JWT | 解析 Token |
| 景点列表 | 分页正确 | 翻页测试 |
| 景点搜索 | 关键词高亮 | Elasticsearch 验证 |
| 行程创建 | 数据持久化 | 数据库查询 |
| AI 推荐 | 返回合法 JSON | Schema 校验 |
| 预算估算 | 总预算不超标 | 数值校验 |

**E2E 测试**

```typescript
// tests/e2e/itinerary.spec.ts
test('AI 推荐行程全流程', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid=email]', 'test@example.com');
  await page.fill('[data-testid=password]', 'Test1234');
  await page.click('[data-testid=login-btn]');

  await page.goto('/recommend');
  await page.fill('[data-testid=destination]', '杭州');
  await page.fill('[data-testid=days]', '3');
  await page.fill('[data-testid=budget]', '3000');
  await page.click('[data-testid=prefer-nature]');
  await page.click('[data-testid=recommend-btn]');

  await expect(page.locator('[data-testid=itinerary-title]')).toBeVisible();
  await expect(page.locator('[data-testid=total-budget]')).toContainText(/2[0-9]{3}/);
});
```

---

**本章小结**

| 模块 | 核心要点 |
|------|---------|
| 数据库 | UUID 主键、JSONB 灵活字段、GIN 索引支持标签搜索 |
| 用户模块 | Spring Security + JWT，bcrypt 密码加密 |
| 景点模块 | Elasticsearch 全文搜索，多字段权重 + 城市过滤 |
| 行程模块 | CRUD + 权限校验，JSONB 存储每日安排 |
| AI 推荐 | Spring AI 调用 LLM，结构化 Prompt 输出 JSON |
| 预算估算 | LLM 生成预算明细 + 省钱建议 |
| 多轮对话 | Redis 存储会话上下文，2小时过期 |
| E2E 测试 | Playwright 自动化端到端测试 |

下一章，我们将进入 Codex 进阶技巧，学习如何用高级 Prompt 和 Hook 机制让 AI 编程能力更上一层楼。
