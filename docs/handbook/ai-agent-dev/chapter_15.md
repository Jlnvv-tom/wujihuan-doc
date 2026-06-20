# 第15章 MetaGPT 实战：SOP 驱动的 AI 软件公司

一个产品经理 + 一个架构师 + 一个工程师 + 一个测试，四个人开个会，代码就写完了。MetaGPT 就是把这套流程 AI 化。

我是怕浪猫，上一章聊了 CrewAI 的角色驱动团队，今天来搞 MetaGPT——SOP 驱动的多智能体软件公司。核心卖点：用标准化的软件工程流程（SOP），让 AI 团队像真实软件公司一样运作。

---

## 15.1 MetaGPT 核心理念：SOP 驱动的多智能体

**MetaGPT 是什么？**

MetaGPT 是一个 SOP（标准作业程序）驱动的多智能体协作框架，核心理念是"让 AI 遵循真实软件公司的运作流程"。

真实软件公司的软件开发流程：

```
需求分析 → 产品设计 → 架构设计 → 代码实现 → 代码审查 → 测试 → 部署
   ↓          ↓           ↓          ↓          ↓       ↓      ↓
产品经理   产品设计师   架构师    工程师     代码审查  测试工程师 运维工程师
```

MetaGPT 把这个流程映射为 AI Agent 角色，每个角色有自己的 SOP 和输出规范。

**和 CrewAI 对比**

| 维度 | MetaGPT | CrewAI |
|------|---------|--------|
| 驱动方式 | SOP驱动 | 角色任务驱动 |
| 流程 | 固定的软件工程流程 | 灵活可定制 |
| 角色 | 预定义（PM/Arch/Engineer等） | 自定义 |
| 输出规范 | 严格的文档格式 | 自由格式 |
| 适合场景 | 软件开发 | 通用协作 |

> MetaGPT 的核心价值不是"多Agent协作"，而是"把软件工程的最佳实践编码为SOP"。每个角色该做什么、输出什么格式，都有规范。

---

## 15.2 角色定义与 SOP 规范

**内置角色**

| 角色 | 职责 | 输出 |
|------|------|------|
| ProductManager | 需求分析、PRD撰写 | PRD文档 |
| Architect | 架构设计、技术选型 | 架构设计文档 |
| Engineer | 代码实现 | 源代码文件 |
| QaEngineer | 测试用例设计 | 测试代码 |
| CodeReviewer | 代码审查 | 审查意见 |

**自定义角色**

```python
from metagpt.roles import Role
from metagpt.actions import Action

class DataAnalyst(Role):
    """数据分析师角色"""
    
    def __init__(self):
        super().__init__(
            name="DataAnalyst",
            profile="数据分析师",
            goal="从数据中发现洞察",
            constraints="确保数据准确性和分析逻辑"
        )
        
    async def _act(self):
        """执行数据分析任务"""
        # 1. 理解需求
        requirement = self.rc.memory.get_by_action(DataRequirement)
        
        # 2. 数据分析
        analysis_result = await self.analyze_data(requirement)
        
        # 3. 生成报告
        report = await self.generate_report(analysis_result)
        
        return report
```

**SOP 规范示例（PRD文档）**

```markdown
# PRD：用户需求分析

## 1. 背景与目标
- 背景：[描述问题背景]
- 目标：[描述要达成的目标]

## 2. 用户故事
- 作为[用户角色]，我希望[功能]，以便[价值]

## 3. 功能需求
- [功能1描述]
- [功能2描述]

## 4. 非功能需求
- 性能：[指标]
- 安全：[要求]

## 5. 验收标准
- [标准1]
- [标准2]
```

---

## 15.3 软件开发全流程实战

**完整流程**

```python
import asyncio
from metagpt.team import Team
from metagpt.roles import (
    ProductManager, 
    Architect, 
    Engineer, 
    QaEngineer
)

async def develop_software(requirement: str):
    """完整的软件开发流程"""
    
    # 1. 创建团队
    team = Team()
    
    # 2. 添加角色
    team.hire([
        ProductManager(),
        Architect(),
        Engineer(n_borg=3),  # 3个工程师并行
        QaEngineer()
    ])
    
    # 3. 设置投资（预算）
    team.invest(150.0)  # 投入150美元预算
    
    # 4. 启动项目
    await team.run(requirement)
    
    # 5. 获取结果
    return team.env.history

# 运行
if __name__ == "__main__":
    requirement = "开发一个在线待办事项管理应用，支持创建、编辑、删除任务，支持任务分类和截止日期提醒。"
    asyncio.run(develop_software(requirement))
```

**执行流程**

```
用户输入需求
    ↓
[ProductManager] 分析需求，输出PRD
    ↓
[Architect] 设计架构，输出架构文档
    ↓
[Engineer x3] 并行实现代码
    ↓
[QaEngineer] 编写测试用例
    ↓
[CodeReviewer] 代码审查
    ↓
输出完整项目代码 + 文档 + 测试
```

---

## 15.4 文档驱动的开发模式

**为什么是"文档驱动"？**

MetaGPT 强调"文档先行"——每个角色的输出都是一份标准化文档，下一个角色基于文档继续工作。

优势：
1. **可追溯**：每个决策都有文档记录
2. **可审查**：人类可以随时介入审查文档
3. **可复用**：文档可以作为知识库

**文档链条**

```
需求 → PRD → 架构设计 → 接口设计 → 代码 → 测试用例
  ↓      ↓       ↓          ↓        ↓       ↓
 PM    PM+Arch  Arch     Engineer  Engineer  QA
```

**查看生成的文档**

```python
from metagpt.utils.file import read_file

# 读取生成的PRD
prd = read_file("workspace/requirement_prd.md")
print(prd)

# 读取架构设计
arch = read_file("workspace/system_design.md")
print(arch)
```

---

## 15.5 实战：自动生成 Web 应用

**场景**

用 MetaGPT 自动生成一个完整的 Todo List Web 应用。

```python
from metagpt.team import Team
from metagpt.roles import ProductManager, Architect, Engineer, QaEngineer

async def generate_todo_app():
    requirement = """
    开发一个在线待办事项管理应用：
    
    功能需求：
    1. 用户注册和登录
    2. 创建、编辑、删除待办事项
    3. 待办事项分类（工作/生活/学习）
    4. 设置截止日期和提醒
    5. 标记完成状态
    
    技术栈要求：
    - 前端：React + TypeScript
    - 后端：FastAPI + PostgreSQL
    - 部署：Docker + Nginx
    """
    
    team = Team()
    team.hire([
        ProductManager(),
        Architect(),
        Engineer(n_borg=3),
        QaEngineer()
    ])
    
    team.invest(200.0)
    await team.run(requirement)
    
    print("项目生成完成！查看 workspace/ 目录")

# 执行
import asyncio
asyncio.run(generate_todo_app())
```

**生成的项目结构**

```
workspace/
├── requirement_prd.md          # PRD文档
├── system_design.md            # 架构设计
├── api_design.md               # API设计
├── frontend/                   # 前端代码
│   ├── src/
│   ├── package.json
│   └── README.md
├── backend/                    # 后端代码
│   ├── app/
│   ├── tests/
│   └── README.md
└── docker-compose.yml          # 部署配置
```

---

## 15.6 实战：数据分析和可视化项目

**场景**

用 MetaGPT 生成一个数据分析项目。

```python
from metagpt.roles import DataAnalyst, DataEngineer, DataVisualizationEngineer
from metagpt.team import Team

async def generate_data_analysis_project():
    requirement = """
    分析某电商平台的用户行为数据，生成可视化报告：
    
    分析目标：
    1. 用户活跃度分析（日活、周活、月活）
    2. 用户留存分析（次日留存、7日留存、30日留存）
    3. 用户行为路径分析
    4. 商品转化率分析
    
    数据来源：用户行为日志（CSV格式）
    输出：Jupyter Notebook + 可视化图表 + 分析报告
    """
    
    team = Team()
    team.hire([
        DataAnalyst(),
        DataEngineer(),
        DataVisualizationEngineer()
    ])
    
    team.invest(100.0)
    await team.run(requirement)

import asyncio
asyncio.run(generate_data_analysis_project())
```

---

## 15.7 MetaGPT 高级应用

**自定义 Action**

```python
from metagpt.actions import Action

class WriteUnitTest(Action):
    """编写单元测试的Action"""
    
    async def run(self, code: str):
        prompt = f"""
        为以下代码编写完整的单元测试：
        
        {code}
        
        要求：
        1. 使用pytest框架
        2. 覆盖所有边界条件
        3. Mock外部依赖
        """
        
        response = await self.llm.aask(prompt)
        return response

# 将Action分配给角色
engineer = Engineer(actions=[WriteUnitTest])
```

**多项目并行**

```python
import asyncio
from metagpt.team import Team

async def parallel_projects():
    tasks = []
    requirements = [
        "开发一个博客系统",
        "开发一个电商后台",
        "开发一个任务管理系统"
    ]
    
    for req in requirements:
        team = Team()
        team.hire([ProductManager(), Architect(), Engineer()])
        tasks.append(team.run(req))
    
    # 并行执行
    await asyncio.gather(*tasks)
```

---

## 15.8 最佳实践与注意事项

**5个必知技巧**

1. **需求要详细**：MetaGPT 的输入质量直接决定输出质量
2. **预算要充足**：LLM 调用次数多，预算不够会中途停止
3. **审查中间文档**：PRD和架构设计要人工审查
4. **分步验证**：先跑通简单需求，再逐步增加复杂度
5. **代码要Review**：生成的代码不一定能直接运行

**常见问题**

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 生成代码无法运行 | LLM 幻觉 | 人工Review+修改 |
| 流程中途停止 | 预算不足 | 增加投资金额 |
| 输出不符合预期 | 需求描述不清晰 | 细化需求描述 |
| 架构设计不合理 | LLM 理解偏差 | 人工审查架构文档 |

> MetaGPT 不是"一键生成生产级代码"的魔法，而是"把软件工程流程标准化并部分自动化"的工具。生成的代码需要人工审查和优化后才能用于生产。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| SOP驱动 | 遵循真实软件工程流程，每个角色有标准输出 |
| 角色体系 | PM→Arch→Engineer→QA，完整软件公司映射 |
| 文档驱动 | PRD→架构→代码→测试，文档链条可追溯 |
| Web应用生成 | 自动生成前后端代码+文档+测试+部署配置 |
| 数据分析项目 | DataAnalyst+DataEngineer+Visualization |
| 高级应用 | 自定义Action、多项目并行 |
| 最佳实践 | 需求详细、预算充足、分步验证 |

---

觉得有用？收藏起来，下次直接照抄。

你用 MetaGPT 生成过什么项目？评论区分享你的经验。

关注怕浪猫，下期我们讲 MCP 协议——AI 与外部世界的标准接口，从概念到实战，打通 AI 应用的最后一公里。

系列进度 15/24

**下章预告：** 第16章我们将深入 MCP（Model Context Protocol），从协议原理到实战开发，帮你构建让 AI 真正能用的工具生态。
