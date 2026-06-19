# 第11章 实战项目二：自动化研发运维Agent

软件开发中，大量重复性工作消耗着工程师的时间：代码审查、Bug定位、日志分析、故障排查。如果Agent能承担这些工作，工程师就能专注于更有创造性的任务。本章将构建一个自动化研发运维Agent，覆盖代码审查、日志分析、CI/CD集成和知识沉淀。

## 11.1 场景定义：自动化代码审查与Bug修复助手

### 项目目标

| 能力 | 输入 | 输出 |
|------|------|------|
| 代码审查 | Git Diff / PR描述 | 审查意见 + 改进建议 |
| Bug定位 | 错误日志 + 代码仓库 | 可能原因 + 修复方案 |
| 日志分析 | 应用日志文件 | 异常模式 + 根因推测 |
| 故障响应 | 告警信息 | 诊断步骤 + 修复动作 |

### 架构设计

```
开发者提交PR / 告警触发
       |
  [事件监听] ──> GitHub Webhook / 监控系统
       |
  [上下文构建] ──> 读取代码/日志/历史
       |
  [Agent分析] ──> 审查/诊断/修复
       |
  [结果输出] ──> PR评论 / 工单 / 通知
       |
  [知识沉淀] ──> 写入知识库
```

### 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| LLM | GPT-4o | 代码理解需要强推理 |
| 代码托管 | GitHub | Webhook生态成熟 |
| CI/CD | GitHub Actions | 与GitHub无缝集成 |
| 日志存储 | ELK / Loki | 结构化日志检索 |
| 知识库 | Chroma | 向量存储故障案例 |

## 11.2 上下文构建：解析代码仓库与依赖关系

### Git仓库操作

```python
from langchain_core.tools import tool
import subprocess

@tool
def get_git_diff(repo_path: str, base_branch: str = "main") -> str:
    """获取Git仓库中当前分支相对于基础分支的代码变更。

    Args:
        repo_path: 代码仓库本地路径
        base_branch: 基础分支名称，默认main
    """
    try:
        result = subprocess.run(
            ["git", "diff", base_branch, "--stat"],
            capture_output=True, text=True, cwd=repo_path
        )
        stat = result.stdout

        result = subprocess.run(
            ["git", "diff", base_branch],
            capture_output=True, text=True, cwd=repo_path
        )
        diff = result.stdout

        # 限制diff大小，避免超出上下文窗口
        if len(diff) > 10000:
            diff = diff[:10000] + "\n... (diff截断，共{}字符)".format(len(diff))

        return f"变更统计:\n{stat}\n\n详细Diff:\n{diff}"
    except Exception as e:
        return f"获取diff失败: {e}"

@tool
def read_file_content(file_path: str, repo_path: str = "", start_line: int = 1, end_line: int = -1) -> str:
    """读取代码文件的内容。

    Args:
        file_path: 文件相对路径
        repo_path: 仓库根目录
        start_line: 起始行号（从1开始）
        end_line: 结束行号（-1表示到文件末尾）
    """
    full_path = os.path.join(repo_path, file_path)
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        if end_line == -1:
            end_line = len(lines)
        selected = lines[start_line - 1:end_line]
        return "".join(selected)
    except Exception as e:
        return f"读取文件失败: {e}"

@tool
def list_directory(dir_path: str, repo_path: str = "") -> str:
    """列出目录内容。

    Args:
        dir_path: 目录相对路径
        repo_path: 仓库根目录
    """
    full_path = os.path.join(repo_path, dir_path)
    try:
        entries = os.listdir(full_path)
        dirs = [e for e in entries if os.path.isdir(os.path.join(full_path, e))]
        files = [e for e in entries if os.path.isfile(os.path.join(full_path, e))]
        return f"目录: {dir_path}\n子目录: {dirs}\n文件: {files}"
    except Exception as e:
        return f"列出目录失败: {e}"
```

### 依赖关系分析

```python
@tool
def analyze_python_imports(file_path: str, repo_path: str = "") -> str:
    """分析Python文件的导入依赖。

    Args:
        file_path: Python文件相对路径
        repo_path: 仓库根目录
    """
    import ast

    full_path = os.path.join(repo_path, file_path)
    try:
        with open(full_path, 'r') as f:
            tree = ast.parse(f.read())

        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                imports.append(f"{node.module}.*" if node.module else "relative_import")

        return f"文件 {file_path} 的依赖:\n" + "\n".join(f"  - {imp}" for imp in imports)
    except Exception as e:
        return f"分析依赖失败: {e}"
```

## 11.3 交互式调试：Agent如何读取日志与重启服务

### 日志分析工具

```python
@tool
def search_logs(pattern: str, log_path: str = "/var/log/app.log", 
                context_lines: int = 3, max_results: int = 20) -> str:
    """在日志文件中搜索匹配的行。

    Args:
        pattern: 搜索模式（支持正则表达式）
        log_path: 日志文件路径
        context_lines: 上下文行数
        max_results: 最多返回匹配数
    """
    try:
        result = subprocess.run(
            ["grep", "-n", "-E", f"-C{context_lines}", pattern, log_path],
            capture_output=True, text=True, timeout=10
        )
        lines = result.stdout.split("\n")
        if len(lines) > max_results:
            lines = lines[:max_results] + [f"... (共{len(lines)}行，截断显示)"]
        return "\n".join(lines) if lines else "未找到匹配的日志"
    except Exception as e:
        return f"搜索日志失败: {e}"

@tool
def analyze_error_patterns(log_path: str = "/var/log/app.log", 
                           hours: int = 24) -> str:
    """分析日志中的错误模式。

    Args:
        log_path: 日志文件路径
        hours: 分析最近多少小时的日志
    """
    try:
        # 提取ERROR级别日志
        result = subprocess.run(
            ["grep", "-c", "ERROR", log_path],
            capture_output=True, text=True
        )
        error_count = result.stdout.strip()

        # 提取最常见的错误类型
        result = subprocess.run(
            ["grep", "ERROR", log_path, "|", "awk", "{print $NF}", "|",
             "sort", "|", "uniq", "-c", "|", "sort", "-rn", "|", "head", "-10"],
            capture_output=True, text=True, shell=True
        )
        top_errors = result.stdout

        return f"过去{hours}小时错误统计:\n总错误数: {error_count}\nTop错误类型:\n{top_errors}"
    except Exception as e:
        return f"分析错误模式失败: {e}"
```

### 服务管理工具

```python
@tool
def restart_service(service_name: str) -> str:
    """重启系统服务（需要确认）。

    Args:
        service_name: 服务名称
    """
    # 生产环境中此操作需要二次确认
    try:
        result = subprocess.run(
            ["sudo", "systemctl", "restart", service_name],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return f"服务 {service_name} 重启成功"
        return f"重启失败: {result.stderr}"
    except Exception as e:
        return f"重启服务异常: {e}"

@tool
def check_service_status(service_name: str) -> str:
    """检查服务运行状态。

    Args:
        service_name: 服务名称
    """
    try:
        result = subprocess.run(
            ["systemctl", "status", service_name, "--no-pager"],
            capture_output=True, text=True
        )
        return result.stdout[:2000]
    except Exception as e:
        return f"检查状态失败: {e}"
```

### 构建运维Agent

```python
system_prompt = """你是一个资深的DevOps工程师助手。

## 职责
- 分析代码变更，进行自动代码审查
- 分析日志，定位故障根因
- 在必要时重启服务（需要先确认）
- 将故障案例沉淀到知识库

## 代码审查标准
- 安全漏洞（SQL注入、XSS、硬编码密钥）
- 性能问题（N+1查询、内存泄漏）
- 代码规范（命名、注释、错误处理）
- 最佳实践（SOLID原则、DRY原则）

## 日志分析方法
1. 先统计错误频率，找到高频错误
2. 分析错误上下文，找到触发条件
3. 追踪调用链，定位根因
4. 查找历史案例，看是否是已知问题

## 安全规则
- 重启服务前必须向用户确认
- 不执行任何不可逆操作（如删除数据）
- 敏感信息（密钥、密码）必须脱敏
"""

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

tools = [
    get_git_diff, read_file_content, list_directory, 
    analyze_python_imports, search_logs, analyze_error_patterns,
    check_service_status, restart_service,
]

llm = ChatOpenAI(model="gpt-4o", temperature=0)
agent = create_openai_tools_agent(llm, tools, prompt)
devops_agent = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=10)
```

## 11.4 集成CI/CD流水线：GitHub Actions与Agent的结合

### GitHub Webhook监听

```python
from fastapi import FastAPI, Request
import hmac, hashlib

app = FastAPI()

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET")

def verify_signature(payload: bytes, signature: str) -> bool:
    """验证GitHub Webhook签名"""
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

@app.post("/webhook/github")
async def handle_github_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not verify_signature(payload, signature):
        return {"status": "unauthorized"}

    data = json.loads(payload)
    event = request.headers.get("X-GitHub-Event")

    if event == "pull_request" and data["action"] in ["opened", "synchronize"]:
        # PR创建或更新时，触发代码审查
        pr_info = {
            "repo": data["repository"]["full_name"],
            "pr_number": data["number"],
            "diff_url": data["pull_request"]["diff_url"],
        }
        # 异步触发Agent审查
        review_result = devops_agent.invoke({
            "input": f"审查PR #{pr_info['pr_number']}的代码变更：{pr_info['diff_url']}"
        })
        # 将审查结果评论到PR上
        post_pr_comment(pr_info, review_result["output"])

    return {"status": "ok"}
```

### GitHub Actions集成

```yaml
# .github/workflows/ai-code-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get Diff
        id: diff
        run: |
          DIFF=$(git diff origin/main...HEAD)
          echo "diff<<EOF" >> $GITHUB_OUTPUT
          echo "$DIFF" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: AI Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          python3 scripts/ai_review.py --diff "${{ steps.diff.outputs.diff }}" --pr ${{ github.event.pull_request.number }}

      - name: Post Review Comment
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          python3 scripts/post_comment.py --pr ${{ github.event.pull_request.number }}
```

### 审查结果自动评论

```python
import requests

def post_pr_comment(pr_info: dict, review_content: str):
    """将审查结果评论到PR"""
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    repo = pr_info["repo"]
    pr_number = pr_info["pr_number"]

    url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }

    comment_body = f"## AI Code Review\n\n{review_content}"
    requests.post(url, json={"body": comment_body}, headers=headers)
```

> 参考文档：[GitHub Webhooks文档](https://docs.github.com/en/developers/webhooks-and-events/webhooks)

## 11.5 运维知识沉淀：故障复盘与知识库自动更新

### 故障案例结构化

每次故障处理后，Agent自动将案例结构化并写入知识库：

```python
from pydantic import BaseModel
from datetime import datetime

class IncidentCase(BaseModel):
    """故障案例"""
    incident_id: str
    title: str
    symptoms: list[str]           # 故障现象
    root_cause: str               # 根因
    resolution: str               # 解决方案
    timeline: list[dict]          # 时间线
    affected_services: list[str]  # 受影响服务
    severity: str                 # 严重级别
    tags: list[str]               # 标签（用于检索）
    created_at: str

class IncidentKnowledgeBase:
    """故障知识库"""

    def __init__(self, vectorstore):
        self.vectorstore = vectorstore
        self.llm = ChatOpenAI(model="gpt-4o", temperature=0)

    def add_incident(self, case: IncidentCase):
        """添加故障案例到知识库"""
        # 将案例转为可检索的文本
        doc_text = f"""
故障标题：{case.title}
现象：{"; ".join(case.symptoms)}
根因：{case.root_cause}
解决方案：{case.resolution}
严重级别：{case.severity}
标签：{", ".join(case.tags)}
"""
        self.vectorstore.add_texts(
            texts=[doc_text],
            metadatas=[{
                "incident_id": case.incident_id,
                "severity": case.severity,
                "services": ",".join(case.affected_services),
                "created_at": case.created_at,
            }]
        )

    def search_similar_incidents(self, symptoms: str, k: int = 3) -> list[str]:
        """搜索相似的故障案例"""
        retriever = self.vectorstore.as_retriever(search_kwargs={"k": k})
        docs = retriever.invoke(symptoms)
        return [doc.page_content for doc in docs]

    def auto_create_incident(self, diagnosis: str, resolution: str) -> IncidentCase:
        """从诊断和解决方案自动创建故障案例"""
        extract_prompt = f"""
请从以下诊断信息中提取结构化的故障案例：

诊断过程：{diagnosis}
解决方案：{resolution}

请以JSON格式输出，包含字段：
title, symptoms(数组), root_cause, resolution, affected_services(数组), severity(high/medium/low), tags(数组)
"""
        response = self.llm.invoke(extract_prompt)
        data = json.loads(response.content)

        return IncidentCase(
            incident_id=f"INC-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            title=data["title"],
            symptoms=data["symptoms"],
            root_cause=data["root_cause"],
            resolution=data["resolution"],
            timeline=[],
            affected_services=data["affected_services"],
            severity=data["severity"],
            tags=data["tags"],
            created_at=datetime.now().isoformat(),
        )
```

### 故障复盘自动化

```python
class PostMortemGenerator:
    """自动生成故障复盘报告"""

    def __init__(self, llm):
        self.llm = llm

    def generate(self, incident: IncidentCase) -> str:
        template = f"""# 故障复盘报告：{incident.title}

## 基本信息
- 严重级别：{incident.severity}
- 受影响服务：{", ".join(incident.affected_services)}
- 发生时间：{incident.created_at}

## 故障现象
{chr(10).join(f"- {s}" for s in incident.symptoms)}

## 根因分析
{incident.root_cause}

## 解决方案
{incident.resolution}

## 改进措施
请基于以上信息，提出3-5条改进措施，防止同类问题再次发生。
"""
        # 用LLM补充改进措施
        full_report = self.llm.invoke(template).content
        return full_report
```

### 完整的运维Agent工作流

```python
class DevOpsWorkflow:
    """完整的DevOps Agent工作流"""

    def __init__(self, agent_executor, knowledge_base):
        self.agent = agent_executor
        self.kb = knowledge_base

    def handle_incident(self, alert_info: str) -> dict:
        """处理告警事件的完整流程"""
        # 1. 先搜索历史案例
        similar_cases = self.kb.search_similar_incidents(alert_info)
        context = f"相似历史案例：\n{chr(10).join(similar_cases)}" if similar_cases else "无相似历史案例"

        # 2. Agent诊断
        diagnosis = self.agent.invoke({
            "input": f"告警信息：{alert_info}\n\n{context}\n\n请诊断并给出解决方案。"
        })

        # 3. 自动创建故障案例
        incident = self.kb.auto_create_incident(
            diagnosis["output"],
            "待确认"  # 解决方案需要人工确认后更新
        )

        # 4. 存入知识库
        self.kb.add_incident(incident)

        return {
            "incident_id": incident.incident_id,
            "diagnosis": diagnosis["output"],
            "similar_past_incidents": len(similar_cases),
        }
```

## 本章小结

| 模块 | 核心实现 | 关键要点 |
|------|---------|---------|
| 场景定义 | 代码审查+日志分析+故障响应 | 明确Agent职责边界 |
| 上下文构建 | Git操作+文件读取+依赖分析 | Agent需要足够的代码上下文 |
| 交互式调试 | 日志搜索+错误模式分析+服务管理 | 危险操作需二次确认 |
| CI/CD集成 | Webhook+GitHub Actions | 自动触发比手动触发更可靠 |
| 知识沉淀 | 结构化案例+向量检索 | 每次故障都是知识积累 |

> 下一章，我们将构建第三个实战项目——个性化教育辅导Agent。
