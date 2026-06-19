# 第10章 实战项目一：智能数据分析Agent

理论到实践的距离，只有动手才能缩短。从本章开始，我们将用三个完整的实战项目，把前面学到的知识融会贯通。第一个项目是智能数据分析Agent——用户用自然语言提问，Agent自动查询数据、执行分析、生成图表和报告。

## 10.1 需求分析：从自然语言到SQL与图表生成

### 项目目标

构建一个数据分析Agent，核心能力：

| 能力 | 用户输入示例 | Agent输出 |
|------|------------|----------|
| 数据查询 | "上个月的销售额是多少" | SQL查询 + 结果表格 |
| 趋势分析 | "销售额的增长趋势如何" | 趋势图 + 文字分析 |
| 异常检测 | "有没有异常的订单" | 异常数据列表 + 原因推测 |
| 报告生成 | "生成本月销售报告" | 完整分析报告（含图表） |

### 架构设计

```
用户自然语言问题
       |
  [意图识别] ──> 查询类 / 分析类 / 报告类
       |
  [Schema理解] ──> 读取数据库元数据
       |
  [SQL生成] ──> 生成并执行SQL
       |
  [结果处理] ──> 格式化 / 生成图表 / 文字解读
       |
  [安全检查] ──> 确认无敏感数据泄露
       |
  返回结果
```

### 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| LLM | GPT-4o | SQL生成和数据分析需要强推理能力 |
| 数据库 | SQLite（演示）/ PostgreSQL（生产） | 轻量且兼容 |
| 图表库 | matplotlib + Plotly | 静态图 + 交互图 |
| 框架 | LangChain | Agent编排 + 工具管理 |
| 前端 | Streamlit | 快速构建交互界面 |

## 10.2 数据预处理与Schema映射策略

### 示例数据准备

```python
import sqlite3
import pandas as pd

def create_sample_database(db_path: str = "sales.db"):
    """创建示例销售数据库"""
    conn = sqlite3.connect(db_path)

    # 订单表
    orders_data = {
        "order_id": [f"ORD{i:06d}" for i in range(1, 1001)],
        "customer_id": [f"C{np.random.randint(1, 200):04d}" for _ in range(1000)],
        "product_id": [f"P{np.random.randint(1, 50):04d}" for _ in range(1000)],
        "order_date": pd.date_range("2024-01-01", periods=1000, freq="8H"),
        "quantity": [np.random.randint(1, 20) for _ in range(1000)],
        "unit_price": [round(np.random.uniform(10, 500), 2) for _ in range(1000)],
    }
    df_orders = pd.DataFrame(orders_data)
    df_orders["total_amount"] = df_orders["quantity"] * df_orders["unit_price"]
    df_orders.to_sql("orders", conn, if_exists="replace", index=False)

    # 产品表
    products_data = {
        "product_id": [f"P{i:04d}" for i in range(1, 51)],
        "product_name": [f"产品{i}" for i in range(1, 51)],
        "category": [np.random.choice(["电子", "服装", "食品", "家居"]) for _ in range(50)],
    }
    pd.DataFrame(products_data).to_sql("products", conn, if_exists="replace", index=False)

    conn.close()

create_sample_database()
```

### Schema映射：让LLM理解数据库结构

LLM需要知道数据库的表结构才能生成正确的SQL。关键策略是**精简但完整地描述Schema**：

```python
def get_db_schema(db_path: str) -> str:
    """提取数据库Schema描述"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()

    schema_description = ""
    for (table_name,) in tables:
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()

        schema_description += f"\n表 {table_name}:\n"
        for col in columns:
            col_name, col_type = col[1], col[2]
            schema_description += f"  - {col_name} ({col_type})"

        # 添加示例数据（3行）
        cursor.execute(f"SELECT * FROM {table_name} LIMIT 3")
        rows = cursor.fetchall()
        col_names = [desc[0] for desc in cursor.description]
        sample_df = pd.DataFrame(rows, columns=col_names)
        schema_description += f"\n  示例数据:\n{sample_df.to_string()}\n"

    conn.close()
    return schema_description
```

### Schema描述优化

直接把完整Schema塞给LLM太浪费Token。优化策略：

```python
def get_condensed_schema(db_path: str, relevant_tables: list[str] = None) -> str:
    """精简Schema描述，只包含关键信息"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    all_tables = [t[0] for t in cursor.fetchall()]
    target_tables = relevant_tables or all_tables

    schema_lines = []
    for table_name in target_tables:
        if table_name not in all_tables:
            continue
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        col_descriptions = ", ".join([f"{c[1]} {c[2]}" for c in columns])
        schema_lines.append(f"{table_name}({col_descriptions})")

    conn.close()
    return "\n".join(schema_lines)

# 输出示例：
# orders(order_id TEXT, customer_id TEXT, product_id TEXT, order_date DATETIME, quantity INTEGER, unit_price REAL, total_amount REAL)
# products(product_id TEXT, product_name TEXT, category TEXT)
```

## 10.3 代码生成与执行：PandasAI的核心实现逻辑

### SQL生成与执行工具

```python
from langchain_core.tools import tool
import sqlite3

@tool
def execute_sql(query: str, db_path: str = "sales.db") -> str:
    """执行SQL查询并返回结果。

    Args:
        query: SQL查询语句（仅支持SELECT）
        db_path: 数据库文件路径
    """
    # 安全检查
    forbidden_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE"]
    if any(kw in query.upper() for kw in forbidden_keywords):
        return "安全限制：只允许执行SELECT查询"

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchall()
        col_names = [desc[0] for desc in cursor.description]

        df = pd.DataFrame(rows, columns=col_names)
        conn.close()

        if len(df) > 50:
            return f"查询返回{len(df)}行数据，前50行：\n{df.head(50).to_string()}"
        return df.to_string()
    except Exception as e:
        return f"SQL执行错误：{e}"

@tool
def generate_chart(data_description: str, chart_type: str = "bar") -> str:
    """根据数据描述生成图表。

    Args:
        data_description: 数据描述，格式为"列1,列2,...\\n值1,值2,...\\n..."
        chart_type: 图表类型，可选bar/line/pie/scatter
    """
    import matplotlib.pyplot as plt

    lines = data_description.strip().split("\n")
    headers = lines[0].split(",")
    data = [line.split(",") for line in lines[1:]]

    df = pd.DataFrame(data, columns=headers)
    for col in df.columns[1:]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    fig, ax = plt.subplots(figsize=(10, 6))
    if chart_type == "bar":
        df.plot(x=headers[0], y=headers[1:], kind="bar", ax=ax)
    elif chart_type == "line":
        df.plot(x=headers[0], y=headers[1:], kind="line", ax=ax)
    elif chart_type == "pie":
        df.plot(y=headers[1], labels=df[headers[0]], kind="pie", ax=ax)

    chart_path = f"/tmp/chart_{int(time.time())}.png"
    plt.savefig(chart_path, dpi=150, bbox_inches="tight")
    plt.close()

    return f"图表已生成：{chart_path}"
```

### 构建数据分析Agent

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate

db_schema = get_condensed_schema("sales.db")

system_prompt = f"""你是一个专业的数据分析助手。

## 数据库结构
{db_schema}

## 工作流程
1. 分析用户的问题，理解数据需求
2. 生成正确的SQL查询语句
3. 使用execute_sql工具执行查询
4. 分析查询结果
5. 如需图表，使用generate_chart工具生成
6. 用自然语言解读分析结果

## 注意事项
- 只生成SELECT语句，不修改数据
- 日期格式：YYYY-MM-DD
- 金额字段使用total_amount
- 分析时要给出具体数字，不要笼统描述
"""

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [execute_sql, generate_chart]

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=5)
```

### 使用示例

```python
result = agent_executor.invoke({
    "input": "各产品类别的销售额排名如何？请生成柱状图"
})
print(result["output"])
```

## 10.4 安全围栏：防止恶意代码执行与数据泄露

### 三层安全防护

```
Layer 1: 提示词层 - 告知Agent安全规则
Layer 2: 工具层 - 工具内部做安全检查
Layer 3: 输出层 - 检查返回内容是否包含敏感数据
```

### 输出脱敏

```python
class OutputSanitizer:
    """输出脱敏处理器"""

    SENSITIVE_PATTERNS = {
        "phone": (r"1[3-9]\d{9}", lambda m: m.group()[:3] + "****" + m.group()[-4:]),
        "email": (r"[\w.-]+@[\w.-]+\.\w+", lambda m: m.group()[0] + "***@" + m.group().split("@")[1]),
        "id_card": (r"\d{17}[\dXx]", lambda m: m.group()[:6] + "********" + m.group()[-4:]),
    }

    def sanitize(self, text: str) -> str:
        for pattern_name, (pattern, replace_fn) in self.SENSITIVE_PATTERNS.items():
            text = re.sub(pattern, replace_fn, text)
        return text

    def check_sensitive_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """检查并脱敏DataFrame中的敏感列"""
        sensitive_keywords = ["phone", "email", "id_card", "password", "secret"]
        for col in df.columns:
            if any(kw in col.lower() for kw in sensitive_keywords):
                df[col] = "[REDACTED]"
        return df
```

### 查询审计

```python
class QueryAuditor:
    """查询审计日志"""

    def __init__(self, log_path: str = "query_audit.jsonl"):
        self.log_path = log_path

    def audit(self, user: str, question: str, sql: str, result_summary: str):
        record = {
            "timestamp": datetime.now().isoformat(),
            "user": user,
            "question": question,
            "sql": sql,
            "result_summary": result_summary[:200],
            "risk_level": self._assess_risk(sql),
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def _assess_risk(self, sql: str) -> str:
        sql_upper = sql.upper()
        if any(kw in sql_upper for kw in ["DROP", "DELETE", "UPDATE"]):
            return "high"
        if any(kw in sql_upper for kw in ["password", "secret", "token"]):
            return "high"
        if "LIMIT" not in sql_upper and "COUNT" not in sql_upper:
            return "medium"  # 无限制查询可能返回大量数据
        return "low"
```

## 10.5 结果解释：将数据洞察转化为自然语言报告

### 分析结果的结构化输出

```python
class AnalysisReporter:
    """将分析结果转化为自然语言报告"""

    def __init__(self, llm):
        self.llm = llm

    def generate_report(self, question: str, query_result: str, 
                        chart_path: str = None) -> str:
        report_prompt = f"""
用户问题：{question}
数据查询结果：
{query_result}

请生成一份结构化的分析报告，包含：
1. 核心发现（1-2句话总结最重要的洞察）
2. 数据详情（关键数字和变化）
3. 趋势分析（如果有时间维度）
4. 建议行动（基于数据的可操作建议）

要求：
- 用具体数字说话，不要说"有所增长"，要说"增长了23.5%"
- 如有异常值，特别标注
- 语言简洁，避免数据堆砌
"""
        return self.llm.invoke(report_prompt).content

    def generate_summary_table(self, data: pd.DataFrame) -> str:
        """将DataFrame转化为Markdown摘要表格"""
        if len(data) > 10:
            summary = data.describe().to_markdown()
            top5 = data.head(5).to_markdown()
            return f"统计摘要：\n{summary}\n\n前5行数据：\n{top5}"
        return data.to_markdown()
```

### 完整的端到端流程

```python
class DataAnalysisAgent:
    """完整的智能数据分析Agent"""

    def __init__(self, db_path: str = "sales.db"):
        self.llm = ChatOpenAI(model="gpt-4o", temperature=0)
        self.db_path = db_path
        self.sanitizer = OutputSanitizer()
        self.auditor = QueryAuditor()
        self.reporter = AnalysisReporter(self.llm)

        # 构建Agent
        db_schema = get_condensed_schema(db_path)
        system_prompt = f"""你是专业数据分析助手。数据库结构：{db_schema}
工作流程：分析问题 -> 生成SQL -> 执行查询 -> 解读结果。
只执行SELECT查询。给出具体数字。"""

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ])

        tools = [execute_sql, generate_chart]
        agent = create_openai_tools_agent(self.llm, tools, prompt)
        self.executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=5)

    def analyze(self, question: str, user: str = "anonymous") -> dict:
        # 1. Agent执行
        result = self.executor.invoke({"input": question})

        # 2. 输出脱敏
        safe_output = self.sanitizer.sanitize(result["output"])

        # 3. 审计记录
        self.auditor.audit(user, question, "auto-generated", safe_output[:200])

        return {
            "question": question,
            "answer": safe_output,
            "success": True,
        }
```

## 本章小结

| 模块 | 核心实现 | 关键要点 |
|------|---------|---------|
| 需求分析 | 意图识别 + 架构设计 | 先定义能力边界，再设计架构 |
| Schema映射 | 精简描述 + 示例数据 | LLM需要足够但不冗余的Schema信息 |
| SQL生成执行 | Function Calling + 安全检查 | 只允许SELECT，禁止修改操作 |
| 安全围栏 | 提示词 + 工具层 + 输出层 | 三层防护，输出脱敏 |
| 结果解释 | 结构化报告 + 具体数字 | 数据洞察用数字说话 |

> 下一章，我们将构建第二个实战项目——自动化研发运维Agent。
