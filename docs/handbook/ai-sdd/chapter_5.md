# 第5章 Codex 编程实战：智能问数据平台

ChatBot 是热身，现在进入实战深水区。智能问数据平台是一个典型的企业级 AI 应用——用户用自然语言提问，系统自动理解意图、查询数据库、生成图表和文字分析。这个项目涉及意图识别、语义治理、数据查询生成等核心技术，是对 Vibe Coding 工程化能力的真正考验。

---

## 5.1 项目立项与需求分析

**项目背景**

企业积累了大量业务数据，但只有少数数据分析师能通过 SQL 查询获取洞察。业务人员需要一种更直观的方式：用自然语言提问，直接得到答案。这就是智能问数据平台（Text-to-SQL）的价值所在。

**核心需求**

功能需求：

- 自然语言转 SQL：用户输入"上个月销售额最高的前5个产品"，系统自动生成 SQL 查询
- 意图识别：区分数据查询、图表生成、数据对比等不同意图
- 多数据源支持：支持 MySQL、PostgreSQL、ClickHouse 等数据库
- 结果可视化：查询结果自动生成表格、柱状图、折线图等
- 查询历史：保存和复用历史查询
- 语义治理：对业务术语进行映射和校准，确保查询准确性

非功能需求：

- 查询响应时间 < 5 秒（简单查询 < 2 秒）
- SQL 生成准确率 > 85%
- 支持 50+ 并发查询
- 支持数据权限控制（行级/列级）

**需求分析的方法**

在 Vibe Coding 模式下，需求分析不再是一个人埋头写文档，而是人与 AI 协作的过程：

1. 人类给出粗粒度的需求方向
2. AI 展开细节，补充遗漏的场景和边界条件
3. 人类审查 AI 的补充，决定取舍
4. 重复 2-3 直到需求完整且明确

```
# 在 Cursor Chat 中的需求分析交互

我：智能问数据平台，用户用自然语言查数据，需要支持意图识别和 SQL 生成

AI：补充几个需要明确的点：
1. 是否需要支持多轮对话上下文？（如"再按地区拆分一下"）
2. SQL 执行是否需要只读限制？如何防止数据泄露？
3. 意图识别失败时，是直接报错还是引导用户重新描述？
4. 是否需要支持自定义业务术语词典？

我：1. 暂不支持多轮 2. 只读+行级权限 3. 引导重新描述 4. 需要
```

---

## 5.2 架构设计与功能拆分

**系统架构**

智能问数据平台采用分层架构：

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│   React + ECharts + Natural Language Input  │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│                 API Gateway                  │
│          Auth + Rate Limit + Route           │
└──────────────────┬──────────────────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Intent  │ │   SQL    │ │  Chart   │
│ Service  │ │ Generator│ │ Service  │
└────┬─────┘ └────┬─────┘ └──────────┘
     │             │
     ▼             ▼
┌──────────┐ ┌──────────┐
│ Semantic │ │  Query   │
│  Layer   │ │ Executor │
└──────────┘ └────┬─────┘
                  │
         ┌────────┼────────┐
         ▼        ▼        ▼
      MySQL   PostgreSQL  ClickHouse
```

**功能模块拆分**

| 模块 | 职责 | 核心技术 |
|------|------|---------|
| 意图识别 | 识别用户查询意图（查询/对比/趋势/占比） | LLM + Few-shot Prompt |
| SQL 生成 | 根据意图和 Schema 生成 SQL | LLM + Schema Prompt |
| 语义治理 | 业务术语映射、字段校准、歧义消除 | 术语词典 + LLM 校准 |
| 查询执行 | 安全执行 SQL，返回结果 | SQL Parser + 只读连接池 |
| 图表推荐 | 根据数据特征推荐可视化类型 | LLM + 数据特征分析 |
| 权限控制 | 行级/列级数据权限 | RBAC + SQL 改写 |

---

## 5.3 任务管理与 AI 管理工作流构建

**任务管理**

将功能拆分为更细粒度的开发任务，使用 AI WorkFlow 管理任务状态：

```
Sprint 1: 基础框架（2天）
├── T1: 后端项目骨架搭建
├── T2: 前端项目骨架搭建
├── T3: 数据库 Schema 设计
└── T4: CI/CD 流水线配置

Sprint 2: 核心功能（3天）
├── T5: 意图识别模块开发
├── T6: SQL 生成模块开发
├── T7: 查询执行模块开发
└── T8: 前端查询界面开发

Sprint 3: 高级功能（3天）
├── T9: 语义治理模块开发
├── T10: 图表推荐模块开发
├── T11: 权限控制模块开发
└── T12: 前后端联调

Sprint 4: 优化交付（2天）
├── T13: 性能优化
├── T14: 测试补充
└── T15: 部署文档
```

**AI 管理工作流**

在 Vibe Coding 模式下，AI 不仅仅是代码生成器，更是项目管理的助手。构建 AI 管理工作流的核心是让 AI 能感知项目状态并自动推进：

1. 每个任务完成后，AI 自动更新任务状态
2. AI 根据依赖关系建议下一个应该开始的任务
3. 遇到阻塞时，AI 提供替代方案或建议调整优先级

在 Cursor 中，可以通过 `.cursorrules` 文件定义项目的工作流规则：

```markdown
# Project Workflow Rules

## Task Management
- After completing each task, update the task list in docs/tasks.md
- Mark completed tasks as [DONE] and in-progress tasks as [WIP]
- When starting a new task, always check dependencies first

## Code Quality
- All new code must have unit tests
- API endpoints must have integration tests
- Follow the existing code style and naming conventions

## AI Behavior
- When generating SQL, always add LIMIT clause for safety
- When generating API responses, follow the { code, message, data } format
- Always check for existing utilities before creating new ones
```

---

## 5.4 前后端代码开发与联调

**后端核心代码**

意图识别服务 IntentService.java：

```java
@Service
public class IntentService {

    private final ChatClient chatClient;

    public Intent classify(String query) {
        String prompt = """
            分析以下用户查询的意图，返回 JSON 格式：
            {"intent": "query|compare|trend|ratio", 
             "entities": ["实体1", "实体2"],
             "timeRange": "时间范围或null",
             "confidence": 0.95}
            
            用户查询：%s
            """.formatted(query);

        String result = chatClient.prompt()
                .user(prompt)
                .call()
                .content();

        return parseIntent(result);
    }
}
```

SQL 生成服务 SqlGenerator.java：

```java
@Service
public class SqlGenerator {

    private final ChatClient chatClient;
    private final SchemaProvider schemaProvider;

    public String generate(String query, Intent intent) {
        String schema = schemaProvider.getSchema(intent.getEntities());
        
        String prompt = """
            根据以下数据库 Schema 和用户查询，生成 PostgreSQL SQL：
            
            Schema:
            %s
            
            用户查询：%s
            意图：%s
            
            要求：
            1. 只生成 SELECT 语句，禁止 INSERT/UPDATE/DELETE
            2. 添加适当的 LIMIT 子句（默认 100）
            3. 使用 COALESCE 处理 NULL 值
            """.formatted(schema, query, intent.getIntent());

        return chatClient.prompt().user(prompt).call().content();
    }
}
```

查询执行服务 QueryExecutor.java：

```java
@Service
public class QueryExecutor {

    private final JdbcTemplate jdbcTemplate;

    public QueryResult execute(String sql, UserContext user) {
        // 安全校验：只允许 SELECT
        if (!sql.trim().toUpperCase().startsWith("SELECT")) {
            throw new SecurityException("Only SELECT queries are allowed");
        }
        
        // 行级权限：注入过滤条件
        sql = injectRowFilter(sql, user);
        
        // 执行查询，设置超时
        return jdbcTemplate.query(sql, rs -> {
            List<Map<String, Object>> rows = new ArrayList<>();
            while (rs.next()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
                    row.put(rs.getMetaData().getColumnName(i), rs.getObject(i));
                }
                rows.add(row);
            }
            return new QueryResult(rows);
        });
    }
}
```

**前端核心代码**

查询组件 QueryInput.tsx：

```tsx
export function QueryInput({ onSubmit, loading }: QueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = () => {
    if (query.trim()) {
      onSubmit(query.trim());
    }
  };

  return (
    <div className="flex gap-2 p-4">
      <input
        className="flex-1 rounded-lg border p-3"
        placeholder="输入你的问题，例如：上个月销售额最高的前5个产品"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      <button
        className="rounded-lg bg-blue-500 px-6 text-white"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? '查询中...' : '查询'}
      </button>
    </div>
  );
}
```

结果展示组件 ResultPanel.tsx：

```tsx
import ReactECharts from 'echarts-for-react';

export function ResultPanel({ result }: { result: QueryResult }) {
  if (!result) return null;

  return (
    <div className="space-y-4 p-4">
      {/* 生成的 SQL */}
      <div className="rounded-lg bg-gray-50 p-3">
        <code className="text-sm">{result.sql}</code>
      </div>

      {/* 数据表格 */}
      {result.data.length > 0 && (
        <DataTable columns={result.columns} data={result.data} />
      )}

      {/* 图表 */}
      {result.chartOption && (
        <ReactECharts option={result.chartOption} style={{ height: 400 }} />
      )}
    </div>
  );
}
```

**联调要点**

1. 意图识别准确性验证：准备 20+ 测试用例，覆盖查询/对比/趋势/占比四种意图
2. SQL 生成安全性验证：确保只生成 SELECT 语句，包含 LIMIT 子句
3. 结果展示一致性验证：前端表格和图表与后端返回数据一致
4. 边界场景测试：空查询、歧义查询、Schema 外查询、超大数据集查询

---

## 5.5 语义治理与数值映射

**语义治理的必要性**

"上个月销售额"——这个看似简单的表述，在企业中可能对应多个数据库字段：

- `sales_amount`（销售金额）
- `order_total`（订单总额）
- `revenue`（收入）

不同部门对"销售额"的定义可能不同。如果不做语义治理，AI 生成的 SQL 就可能查错字段，导致结果偏差。

**语义治理三层架构**

第一层：术语词典

将业务术语映射到数据库字段的映射表：

```json
{
  "术语": "销售额",
  "映射字段": "order_total",
  "数据库": "order_db",
  "表名": "orders",
  "说明": "已完成的订单金额，不含退款",
  "同义词": ["营收", "收入", "营业额"]
}
```

第二层：上下文校准

根据用户所属部门、查询上下文，对术语进行二次校准：

```java
@Service
public class SemanticCalibration {

    public String calibrate(String query, UserContext user) {
        // 1. 从术语词典中识别业务术语
        List<TermMatch> matches = termDictionary.match(query);
        
        // 2. 根据用户上下文选择最合适的映射
        for (TermMatch match : matches) {
            String bestMapping = selectBestMapping(match, user.getDepartment());
            query = query.replace(match.getOriginal(), bestMapping);
        }
        
        return query;
    }
}
```

第三层：歧义消除

当术语存在多个映射时，主动向用户确认：

```
AI：检测到"销售额"可能指：
1. 订单金额（含退款）
2. 实收金额（不含退款）
请确认您指的是哪个？
```

**数值映射**

数值映射解决的是"数据含义"的问题。例如，数据库中 `status = 1` 代表"已完成"，但在查询结果中需要显示为文字：

```java
@Service
public class ValueMapping {

    private static final Map<String, Map<Integer, String>> MAPPINGS = Map.of(
        "order_status", Map.of(
            0, "待支付",
            1, "已完成",
            2, "已取消",
            3, "退款中"
        ),
        "user_level", Map.of(
            1, "普通用户",
            2, "VIP用户",
            3, "企业用户"
        )
    );

    public List<Map<String, Object>> applyMapping(
            List<Map<String, Object>> data, String tableName) {
        Map<Integer, String> mapping = MAPPINGS.get(tableName);
        if (mapping == null) return data;

        return data.stream().map(row -> {
            Map<String, Object> mapped = new LinkedHashMap<>(row);
            mapped.forEach((key, value) -> {
                if (mapping.containsKey(value)) {
                    mapped.put(key, mapping.get(value));
                }
            });
            return mapped;
        }).toList();
    }
}
```

---

## 5.6 意图识别与项目总结

**意图识别的进阶优化**

基础的意图识别使用 LLM 直接分类，但准确率有限。进阶方案是 Few-shot + 思维链（Chain of Thought）：

```java
String prompt = """
    分析用户查询意图，严格按以下步骤：
    
    步骤1：识别关键词
    - 数值类：多少、几个、总额、平均 → intent=query
    - 对比类：对比、比较、vs、差异 → intent=compare
    - 趋势类：趋势、变化、增长、下降 → intent=trend
    - 占比类：占比、比例、百分比、份额 → intent=ratio
    
    步骤2：提取实体
    - 从查询中提取业务实体（产品、地区、时间等）
    
    步骤3：判断时间范围
    - 识别时间表达式（上个月、今年、最近7天等）
    
    示例：
    查询："上个月各地区销售额对比"
    分析：关键词"对比"→ compare，实体"地区"+"销售额"，时间"上个月"
    结果：{"intent":"compare","entities":["地区","销售额"],"timeRange":"last_month"}
    
    当前查询：%s
    """.formatted(query);
```

Few-shot 示例的数量和质量直接影响识别准确率。建议从真实用户查询中选取 10-20 个典型样例作为 few-shot 上下文。

**项目总结**

| 维度 | 成果 | 经验 |
|------|------|------|
| 功能覆盖 | 意图识别 + SQL 生成 + 语义治理 + 可视化 | 核心功能闭环，MVP 先行 |
| 技术栈 | Spring AI + React + ECharts + PostgreSQL | AI 能力与业务代码清晰分层 |
| 准确率 | 意图识别 90%，SQL 生成 85% | Few-shot + 语义治理显著提升准确率 |
| 开发效率 | 10 人天完成 MVP | Vibe Coding 比传统方式快 3-5 倍 |
| 踩坑点 | 语义歧义、SQL 安全、图表推荐不准 | 语义治理和安全校验不能省 |

关键经验总结：

1. 语义治理是 Text-to-SQL 项目成败的关键，不投入治理的项目上线后准确率会持续下降
2. SQL 安全校验必须在执行层做，不能仅依赖 LLM 的指令遵守
3. Few-shot 示例要从真实用户查询中提取，不能用 AI 造的假数据
4. 图表推荐需要结合数据特征（维度数、度量数、时间序列等），不能仅靠意图判断

---

**本章小结**

| 步骤 | 核心要点 |
|------|---------|
| 项目立项 | 明确 Text-to-SQL 核心需求，人与 AI 协作展开细节 |
| 架构设计 | 分层架构，意图识别/SQL 生成/语义治理/查询执行模块解耦 |
| 任务管理 | Sprint 分批推进，AI 管理工作流自动推进任务状态 |
| 代码开发 | Spring AI 驱动意图识别和 SQL 生成，React + ECharts 前端展示 |
| 语义治理 | 三层架构：术语词典 + 上下文校准 + 歧义消除，准确率的关键保障 |
| 意图识别 | Few-shot + Chain of Thought 提升识别精度 |

下一章，我们将挑战更复杂的场景——基于开源项目"小龙虾"进行二次开发，体验 Vibe Coding 在遗留系统改造中的威力。
