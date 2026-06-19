# 第13章 Codex 调试与重构：遗留代码安全操作

代码写出来难，调试已有代码更难。遗留代码（Legacy Code）通常有几个特点：文档缺失、测试不足、逻辑复杂、修改风险大。Vibe Coding 擅长从零创作，但在遗留代码中操作，需要额外的谨慎。本章学习如何在不破坏现有功能的前提下，用 Codex 安全地调试和重构遗留代码。

---

## 13.1 遗留代码分析策略

**遗留代码分析三步法**

```bash
# Step1: 理解系统全貌
claude "分析 src/backend 目录的代码结构，输出：
1. 模块划分和依赖关系图
2. 主要的入口点和核心流程
3. 数据流向和存储方式

使用 mermaid 语法输出模块关系图"

# Step2: 定位目标模块
claude "深入分析 src/backend/modules/order/ 目录：
1. 核心类和接口
2. 公开方法及其调用关系
3. 依赖的外部服务和数据库表
4. 已知的问题和坑"

# Step3: 理解边界条件
claude "分析 order 模块中的边界条件和异常处理：
1. 空指针检查
2. 并发场景
3. 超时处理
4. 事务边界
5. 是否有隐藏的副作用？"
```

**架构图生成**

用 AI 自动生成项目的架构图：

```bash
claude "扫描项目源码，生成架构文档：
1. README-arch.md：整体架构说明
2. 使用 plantuml 或 mermaid 生成：
   - 模块依赖图
   - 数据流图
   - 请求处理流程图"
```

---

## 13.2 Bug 定位与修复工作流

**AI 辅助 Bug 定位**

当程序报错时，将报错信息和上下文交给 Codex 分析：

```bash
claude "分析以下错误：

错误信息：
java.lang.NullPointerException: Cannot invoke method on null object
  at com.travelwise.service.OrderService.calculateDiscount(OrderService.java:42)
  at com.travelwise.controller.OrderController.getDiscount(OrderController.java:18)

上下文：
- OrderService.calculateDiscount() 方法在第 42 行报错
- 这个方法接收一个 Order 对象作为参数
- 怀疑是 order.getUser() 返回了 null

请：
1. 分析可能的根因
2. 列出所有可能导致 user 为 null 的场景
3. 给出修复方案
4. 推荐单元测试覆盖场景"
```

**修复工作流**

```bash
# 1. 让 AI 先理解相关代码
claude "阅读 OrderService.java 的 calculateDiscount 方法及相关代码，理解上下文"

# 2. 让 AI 分析根因
claude "分析 NullPointerException 的根因，给出修复方案"

# 3. 让 AI 生成修复代码
claude "修改 OrderService.calculateDiscount()：
1. 添加 null 检查
2. 记录异常日志
3. 返回合理的默认值
4. 不要改变原有逻辑结构"

# 4. 验证修复
claude "为修复后的代码编写单元测试，覆盖之前分析的几种 null 场景"
```

---

## 13.3 安全重构策略

**重构前：建立安全网**

```bash
# 1. 确保有版本控制
git status
git branch backup-before-refactor

# 2. 生成当前代码的快照测试
claude "为 OrderService 所有公开方法生成单元测试，确保重构前的行为被测试覆盖"

# 3. 记录重构前的行为
claude "运行所有测试，记录当前通过的测试用例数量和名称"
```

**重构执行**

```bash
# 分步骤重构，每次只改一个点
claude "重构 OrderService.calculateDiscount()，目标：
1. 提取长方法，拆分为多个小方法
2. 消除重复代码
3. 统一变量命名风格

步骤：
1. 先提取 calculateBasePrice() 方法
2. 再提取 calculateUserDiscount() 方法
3. 最后提取 calculateFinalDiscount() 方法
4. 每步提取后运行测试验证"
```

**重构后验证**

```bash
# 1. 运行所有测试
pnpm test

# 2. 回归测试
claude "对比重构前后的测试结果，确保没有功能退化"

# 3. 性能测试（如涉及性能）
claude "如果 calculateDiscount 在性能关键路径上，编写 JMH 基准测试对比重构前后的性能"
```

---

## 13.4 单元测试生成与覆盖增强

**AI 生成测试**

```bash
claude "为 AttractionService 生成单元测试：
1. 使用 JUnit 5 + Mockito
2. 覆盖以下场景：
   - getById 正常查询
   - getById 查询不存在的 ID
   - list 分页查询
   - search 关键词搜索
   - search 城市筛选
3. Mock 所有外部依赖（Repository、Redis）
4. 测试文件放在 test/ 目录，与源文件同包"
```

生成的测试示例：

```java
@ExtendWith(MockitoExtension.class)
class AttractionServiceTest {

    @Mock
    private AttractionRepository attractionRepository;

    @InjectMocks
    private AttractionService attractionService;

    @Test
    void should_return_attraction_when_getById_exists() {
        UUID id = UUID.randomUUID();
        Attraction attraction = new Attraction();
        attraction.setId(id);
        attraction.setName("西湖");

        when(attractionRepository.findById(id)).thenReturn(Optional.of(attraction));

        AttractionDTO result = attractionService.getById(id);

        assertNotNull(result);
        assertEquals("西湖", result.getName());
    }

    @Test
    void should_throw_when_getById_not_found() {
        UUID id = UUID.randomUUID();
        when(attractionRepository.findById(id)).thenReturn(Optional.empty());

        assertThrows(BusinessException.class, () -> attractionService.getById(id));
    }
}
```

---

## 13.5 性能优化与内存泄漏排查

**性能分析**

```bash
claude "分析 AttractionService 的性能：
1. 识别可能的 N+1 查询问题
2. 识别不必要的全表扫描
3. 识别可以缓存的查询结果
4. 给出优化建议和代码修改方案"
```

**常见性能问题修复**

| 问题类型 | 症状 | 修复方案 |
|---------|------|---------|
| N+1 查询 | 循环内查询数据库 | 使用 JOIN FETCH 或批量查询 |
| 大对象复制 | 对象序列化慢 | 使用引用或不可变对象 |
| 内存泄漏 | 堆内存持续增长 | 检查集合清理、连接释放 |
| 同步阻塞 | 并发差 | 异步化或增加缓存 |
| 索引缺失 | 查询慢 | 添加数据库索引 |

**内存泄漏排查**

```bash
claude "用 VisualVM 或 JProfiler 分析应用程序的内存使用：
1. 找出占用内存最多的对象
2. 追踪可疑对象的 GC Roots
3. 识别内存泄漏的类
4. 给出修复建议"
```

---

## 13.6 遗留代码重构案例：订单模块

**案例背景**

订单模块经过多人维护，存在以下问题：

- 代码重复严重（约 30% 的逻辑重复）
- 方法过长，最长的方法超过 500 行
- 缺乏异常处理，很多异常直接抛给上层
- 没有事务边界，数据库操作分散

**重构步骤**

```bash
# Step1: 分析现状
claude "分析 order 模块的问题：
1. 统计代码重复率
2. 列出超过 200 行的方法
3. 识别缺失异常处理的方法
4. 识别没有 @Transactional 的数据库操作
输出：重构优先级列表"

# Step2: 提取公共逻辑
claude "提取 order 模块的公共逻辑到 OrderUtils：
1. 价格计算公式
2. 日期处理逻辑
3. 状态转换规则
4. 参数校验规则"
```

**重构后的模块结构**

```
order/
├── controller/OrderController.java     # 入口，职责最小化
├── service/
│   ├── OrderService.java               # 协调层，事务边界
│   ├── OrderDomainService.java         # 领域逻辑
│   └── OrderUtils.java                 # 公共工具
├── repository/OrderRepository.java     # 数据访问
├── model/
│   ├── entity/Order.java               # 实体
│   ├── dto/                           # 数据传输对象
│   └── event/OrderEvent.java           # 领域事件
└── exception/                         # 异常定义
```

---

**本章小结**

| 技巧 | 核心要点 |
|------|---------|
| 遗留代码分析 | 三步法：全貌 → 目标模块 → 边界条件 |
| Bug 定位 | 报错信息 + 上下文 → 根因分析 → 修复方案 → 验证 |
| 安全重构 | 建安全网 → 分步执行 → 逐步验证 |
| 测试生成 | JUnit 5 + Mockito，覆盖正常/异常/边界场景 |
| 性能优化 | N+1 查询、大对象复制、索引缺失是常见问题 |
| 重构案例 | 提取公共逻辑 → 领域分离 → 事务边界明确 |

下一章，我们将学习团队协作与规范落地——如何让团队成员都遵循相同的规范，如何在团队中高效地使用 Codex。
