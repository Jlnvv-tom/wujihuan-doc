# 第22章 综合实战：基于 Manus + MCP 构建全链路自动化系统

给你一个任务，从需求分析到系统交付，全部自动化。这就是 Manus + MCP 能做到的。

我是怕浪猫，前面21章分别讲了平台、框架、安全和行业，这章开始综合实战。第一个项目：基于 Manus + MCP 构建全链路自动化系统。

---

## 22.1 项目目标与需求定义

**项目目标**

构建一个"AI 交付助理"：用户输入一个业务需求，系统自动完成需求分析、技术选型、代码生成、测试、部署文档，并输出可交付的初始项目。

**具体需求**

1. 接收用户自然语言需求
2. 分析需求并输出 PRD
3. 设计技术架构并选型
4. 生成项目初始代码
5. 编写基础测试用例
6. 生成部署文档
7. 输出完整交付包

**技术栈**

- Manus：通用 Agent 执行框架
- MCP：调用工具的标准接口
- 代码生成：通过 MCP 调用代码工具
- 部署：Docker 容器化

---

## 22.2 系统架构设计

```
用户输入需求
    ↓
[Manus 主控 Agent]
    ↓ 需求分析
[PRD 生成工具]
    ↓
[架构设计工具]
    ↓
[代码生成 MCP Server]
    ↓
[测试生成 MCP Server]
    ↓
[部署文档生成工具]
    ↓
[交付包打包工具]
    ↓
输出完整项目包
```

**MCP Server 设计**

1. **需求分析 Server**：分析需求，输出结构化 PRD
2. **架构设计 Server**：设计技术架构
3. **代码生成 Server**：生成代码文件
4. **测试生成 Server**：生成测试用例
5. **文档生成 Server**：生成 README 和部署文档

---

## 22.3 需求分析 MCP Server

```python
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("requirement-analysis")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="analyze_requirement",
            description="分析用户自然语言需求，输出结构化PRD",
            inputSchema={
                "type": "object",
                "properties": {
                    "requirement": {"type": "string", "description": "用户需求描述"}
                },
                "required": ["requirement"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "analyze_requirement":
        requirement = arguments["requirement"]
        
        prompt = f"""
        分析以下需求，输出结构化PRD：
        
        {requirement}
        
        输出格式：
        {{
          "title": "项目名称",
          "background": "背景",
          "goals": ["目标1", "目标2"],
          "users": ["用户角色"],
          "features": ["功能1", "功能2"],
          "non_functional": ["非功能需求"],
          "tech_stack": ["推荐技术栈"],
          "acceptance_criteria": ["验收标准"]
        }}
        """
        
        response = llm.invoke(prompt).content
        return [TextContent(type="text", text=response)]
```

---

## 22.4 架构设计 MCP Server

```python
@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="design_architecture",
            description="根据PRD设计技术架构",
            inputSchema={
                "type": "object",
                "properties": {
                    "prd": {"type": "string", "description": "PRD内容"}
                },
                "required": ["prd"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "design_architecture":
        prd = arguments["prd"]
        
        prompt = f"""
        根据以下PRD设计技术架构：
        
        {prd}
        
        输出：
        1. 系统架构图（用文字描述）
        2. 技术栈选择（前端、后端、数据库、部署）
        3. 核心模块划分
        4. API设计（关键接口）
        5. 部署架构
        """
        
        return [TextContent(type="text", text=llm.invoke(prompt).content)]
```

---

## 22.5 代码生成与测试自动化

**代码生成 Server**

```python
@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="generate_code",
            description="根据架构设计生成项目代码",
            inputSchema={
                "type": "object",
                "properties": {
                    "architecture": {"type": "string", "description": "架构设计"},
                    "output_dir": {"type": "string", "description": "输出目录"}
                },
                "required": ["architecture", "output_dir"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "generate_code":
        architecture = arguments["architecture"]
        output_dir = arguments["output_dir"]
        
        prompt = f"""
        根据架构设计生成FastAPI后端项目代码结构。
        架构设计：{architecture}
        
        生成以下文件：
        1. main.py（入口）
        2. models.py（数据模型）
        3. routers/（路由模块）
        4. services/（业务逻辑）
        5. requirements.txt
        6. Dockerfile
        
        只输出文件内容，用Markdown代码块分隔。
        """
        
        code_package = llm.invoke(prompt).content
        # 解析代码块并写入文件
        write_code_files(code_package, output_dir)
        
        return [TextContent(type="text", text=f"代码已生成到 {output_dir}")]
```

**测试生成 Server**

```python
@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="generate_tests",
            description="为生成的代码生成测试用例",
            inputSchema={
                "type": "object",
                "properties": {
                    "code_dir": {"type": "string", "description": "代码目录"}
                },
                "required": ["code_dir"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "generate_tests":
        code_dir = arguments["code_dir"]
        # 读取代码文件
        code = read_project_files(code_dir)
        
        prompt = f"""
        为以下代码生成 pytest 测试用例：
        
        {code}
        
        要求：
        1. 覆盖核心API接口
        2. 使用 FastAPI TestClient
        3. 包含边界测试
        4. 输出到 tests/ 目录
        """
        
        test_code = llm.invoke(prompt).content
        write_test_files(test_code, code_dir)
        
        return [TextContent(type="text", text="测试用例已生成")]
```

---

## 22.6 部署交付与可复用组件

**文档生成 Server**

```python
@server.call_tool()
async def call_tool(name, arguments):
    if name == "generate_docs":
        project_dir = arguments["project_dir"]
        prd = arguments["prd"]
        
        prompt = f"""
        为项目生成 README.md 和部署文档。
        
        PRD：{prd}
        项目目录：{project_dir}
        
        README.md 包含：
        1. 项目简介
        2. 功能特性
        3. 技术栈
        4. 本地启动方式
        5. Docker 部署方式
        6. 测试运行方式
        7. API 文档入口
        """
        
        docs = llm.invoke(prompt).content
        write_docs(docs, project_dir)
        
        return [TextContent(type="text", text="文档已生成")]
```

**打包交付**

```python
@server.call_tool()
async def call_tool(name, arguments):
    if name == "package_project":
        project_dir = arguments["project_dir"]
        output_zip = arguments["output_zip"]
        
        # 打包项目
        import shutil
        shutil.make_archive(output_zip.replace('.zip', ''), 'zip', project_dir)
        
        return [TextContent(type="text", text=f"项目已打包：{output_zip}")]
```

---

## 22.7 实战：从一句话需求到可交付项目

**完整流程**

```python
import asyncio
from manus import ManusAgent

async def auto_deliver_project(user_requirement):
    """从需求到交付的完整流程"""
    
    # 1. 需求分析
    prd = await manus.use_tool("requirement-analysis", "analyze_requirement", {
        "requirement": user_requirement
    })
    
    # 2. 架构设计
    architecture = await manus.use_tool("architecture-design", "design_architecture", {
        "prd": prd
    })
    
    # 3. 代码生成
    await manus.use_tool("code-generation", "generate_code", {
        "architecture": architecture,
        "output_dir": "./workspace/project"
    })
    
    # 4. 测试生成
    await manus.use_tool("test-generation", "generate_tests", {
        "code_dir": "./workspace/project"
    })
    
    # 5. 文档生成
    await manus.use_tool("doc-generation", "generate_docs", {
        "project_dir": "./workspace/project",
        "prd": prd
    })
    
    # 6. 打包交付
    await manus.use_tool("packaging", "package_project", {
        "project_dir": "./workspace/project",
        "output_zip": "./workspace/delivery.zip"
    })
    
    return "项目已交付：./workspace/delivery.zip"

# 执行
requirement = "开发一个在线待办事项应用，支持用户注册、登录、创建任务、标记完成，使用 FastAPI + PostgreSQL + React。"
asyncio.run(auto_deliver_project(requirement))
```

> Manus + MCP 的潜力不是"替代程序员"，而是"把重复的项目初始化工作自动化"。程序员真正的价值是理解业务、设计架构、解决复杂问题，而不是每次写同样的脚手架。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 项目目标 | 从需求到交付的自动化系统 |
| 系统架构 | Manus主控 + 多个MCP Server |
| 需求分析 | 自然语言→结构化PRD |
| 架构设计 | PRD→技术架构和API设计 |
| 代码生成 | 架构→FastAPI项目代码 |
| 测试生成 | 代码→pytest测试用例 |
| 文档交付 | README+部署文档+打包 |

---

觉得有用？收藏起来，下次直接照抄。

你用过 Manus + MCP 做过自动化项目吗？评论区分享你的经验。

关注怕浪猫，下期我们讲另一个综合实战——基于 Coze + Dify 构建小红书爆款内容流水线。

系列进度 22/24

**下章预告：** 第23章我们将做第二个综合实战——用 Coze + Dify 构建小红书爆款内容流水线，从选题到文案到图片到发布，全自动化。
