# 第20章 行业实战：教育 + 医疗 + 金融

教育要因材施教，医疗要安全合规，金融要风控精准。三个行业，三种 Agent，三套不同的设计哲学。

我是怕浪猫，前面19章讲了 Agent 的理论、框架和工程实践。这章开始进入行业实战，用3个真实的行业场景，带你构建不同领域的 Agent 应用。

---

## 20.1 教育行业：AI 个性化辅导 Agent

**行业痛点**

1. **大班教学无法因材施教**：一个老师对40个学生，无法个性化
2. **作业批改耗时**：老师批改作业占大量时间
3. **知识盲点难发现**：学生不知道自己哪里不会
4. **学习动力不足**：缺乏正向反馈

**Agent 设计思路**

```
学生学习数据
    ↓
[学情分析Agent] → 识别知识盲点和学习风格
    ↓
[教学策略Agent] → 生成个性化学习路径
    ↓
[内容生成Agent] → 生成练习题和讲解
    ↓
[作业批改Agent] → 自动批改和反馈
    ↓
[学情报告] → 输出学习报告给家长
```

**学情分析 Agent**

```python
from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools import tool

@tool
def get_student_records(student_id: str) -> str:
    """获取学生学习记录，包含历次考试成绩、错题记录、学习时长等。"""
    records = query_student_db(student_id)
    return format_records(records)

@tool
def analyze_weak_points(records: str) -> str:
    """分析学生的薄弱知识点。"""
    # 基于错题记录和考试成绩分析薄弱点
    weak_points = identify_weak_knowledge_points(records)
    return format_weak_points(weak_points)

@tool
def determine_learning_style(records: str) -> str:
    """判断学生的学习风格。"""
    # 根据学习行为判断风格
    style = classify_learning_style(records)
    return f"学习风格：{style}"

llm = ChatOpenAI(model="gpt-4o")

student_analyst = create_react_agent(
    llm,
    [get_student_records, analyze_weak_points, determine_learning_style],
    ChatPromptTemplate.from_messages([
        ("system", "你是一个学情分析专家。分析学生的学习数据，找出薄弱点和学习风格。"),
        ("human", "{input}"),
        ("assistant", "{agent_scratchpad}")
    ])
)
```

**个性化练习生成**

```python
@tool
def generate_exercises(topic: str, difficulty: str, count: int) -> str:
    """根据主题和难度生成练习题。"""
    prompt = f"""
    生成{count}道关于"{topic}"的{difficulty}难度练习题。
    要求：
    1. 题型多样（选择、填空、简答）
    2. 每题附标准答案和解析
    3. 难度梯度递增
    """
    return llm.invoke(prompt).content
```

**合规注意**

1. **未成年人保护**：AI 辅导不收集过多个人信息
2. **内容安全**：生成内容需经过安全审核
3. **家长知情**：AI 辅导需告知家长
4. **不能替代教师**：AI 是辅助工具，不是替代品

---

## 20.2 医疗行业：AI 健康咨询 Agent

**行业痛点**

1. **医疗资源不足**：优质医生集中在一线城市
2. **初诊效率低**：患者不知道挂什么科
3. **健康意识薄弱**：缺乏日常健康管理
4. **信息不对称**：患者难以理解医学术语

**Agent 设计思路**

```
用户描述症状
    ↓
[症状分析Agent] → 初步分析症状
    ↓
[科室推荐Agent] → 推荐就诊科室
    ↓
[健康咨询Agent] → 解答健康问题
    ↓
[用药提醒Agent] → 用药提醒和注意事项
```

**安全红线**

```
AI 健康咨询的绝对禁区：
1. ❌ 不能做诊断——只能说"可能是"，不能说"是"
2. ❌ 不能开处方——只能提供参考建议
3. ❌ 不能替代就医——必须建议就医
4. ❌ 处理急症——立即建议拨打120
```

**症状分析 Agent**

```python
@tool
def analyze_symptoms(symptoms: str) -> str:
    """分析用户描述的症状，给出可能的健康问题。"""
    prompt = f"""
    用户描述的症状：{symptoms}
    
    请分析：
    1. 可能相关的健康问题（列出2-3个可能）
    2. 建议的就诊科室
    3. 紧急程度判断（紧急/一般/轻微）
    
    重要声明：
    - 以上分析仅供参考，不能作为诊断依据
    - 建议尽快就医，由专业医生诊断
    - 如有紧急情况请立即拨打120
    """
    return llm.invoke(prompt).content

@tool
def check_emergency(symptoms: str) -> str:
    """检查是否是紧急症状。"""
    emergency_keywords = ["胸痛", "呼吸困难", "大量出血", "昏迷", "抽搐", "中风"]
    
    for keyword in emergency_keywords:
        if keyword in symptoms:
            return "紧急！请立即拨打120急救电话！"
    
    return "非紧急症状，建议尽快就医。"
```

**合规框架**

| 合规项 | 要求 | 实现方式 |
|--------|------|---------|
| 数据隐私 | 患者数据不外泄 | 本地化部署+加密存储 |
| 诊断限制 | AI不能做诊断 | 提示词约束+输出声明 |
| 处方限制 | AI不能开处方 | 工具白名单（无处方工具） |
| 内容审核 | 医疗建议需审核 | 输出后处理+关键词过滤 |
| 资质标识 | 明确AI身份 | 所有输出附带免责声明 |

---

## 20.3 金融行业：AI 智能投顾 Agent

**行业痛点**

1. **投资门槛高**：普通人不知道怎么投资
2. **风控难度大**：市场变化快，人工风控不及时
3. **合规要求严**：金融行业合规要求最严格
4. **信息过载**：海量数据难以快速分析

**Agent 设计思路**

```
用户投资需求
    ↓
[风险评估Agent] → 评估用户风险承受能力
    ↓
[市场分析Agent] → 分析市场趋势和机会
    ↓
[投资组合Agent] → 生成个性化投资组合建议
    ↓
[风控Agent] → 实时风控和预警
    ↓
[合规检查Agent] → 确保建议合规
```

**风控 Agent**

```python
@tool
def check_risk_level(portfolio: dict) -> str:
    """检查投资组合的风险等级。"""
    risk_score = calculate_portfolio_risk(portfolio)
    
    if risk_score > 0.8:
        return "高风险：建议降低仓位或增加对冲"
    elif risk_score > 0.5:
        return "中等风险：建议关注市场变化"
    else:
        return "低风险：当前配置较为稳健"

@tool
def check_concentration(portfolio: dict) -> str:
    """检查持仓集中度。"""
    max_single = max(stock["weight"] for stock in portfolio["stocks"])
    
    if max_single > 0.3:
        return f"集中度过高：单只股票占比{max_single*100:.1f}%，建议分散持仓"
    return "持仓分散度正常"
```

**合规检查 Agent**

```python
@tool
def check_compliance(advice: str) -> str:
    """检查投资建议是否合规。"""
    
    compliance_rules = [
        "不能承诺收益",
        "不能保证本金安全",
        "必须提示投资风险",
        "不能推荐具体股票买入/卖出",
        "必须说明建议仅供参考"
    ]
    
    violations = []
    for rule in compliance_rules:
        if violates_rule(advice, rule):
            violations.append(rule)
    
    if violations:
        return f"合规问题：{violations}"
    return "合规检查通过"
```

**免责声明模板**

```
本投资建议由AI系统生成，仅供参考，不构成任何投资建议或承诺。
投资有风险，入市需谨慎。过往业绩不代表未来表现。
请根据自身情况独立做出投资决策，本平台不对任何投资损失承担责任。
```

---

## 20.4 行业 Agent 开发通用方法论

**三步设计法**

```
Step 1：理解行业痛点
    → 行业从业者访谈
    → 分析高频低效场景
    → 确定Agent可解决的问题

Step 2：设计 Agent 架构
    → 单Agent vs 多Agent
    → 工具设计（能做什么）
    → 安全边界（不能做什么）

Step 3：合规先行
    → 了解行业法规
    → 设计合规检查机制
    → 输出免责声明
```

**行业 Agent 特性对比**

| 特性 | 教育 | 医疗 | 金融 |
|------|------|------|------|
| 核心风险 | 内容不当 | 误诊 | 投资损失 |
| 合规严格度 | 中 | 极高 | 极高 |
| 数据隐私 | 中 | 极高 | 高 |
| 人工介入 | 低 | 高 | 高 |
| 容错空间 | 中 | 极低 | 低 |
| 部署方式 | 云端 | 本地 | 本地/私有云 |

> 行业 Agent 的核心不是"技术多厉害"，而是"对行业的理解多深"。技术是通用的，行业知识是专属的。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 教育Agent | 学情分析→个性化路径→练习生成→自动批改 |
| 医疗Agent | 症状分析→科室推荐→健康咨询，4条安全红线 |
| 金融Agent | 风险评估→市场分析→投资组合→风控→合规 |
| 通用方法 | 理解痛点→设计架构→合规先行 |
| 行业对比 | 合规严格度和容错空间因行业而异 |

---

觉得有用？收藏起来，下次直接照抄。

你在哪个行业做过 AI Agent？评论区聊聊你的经验。

关注怕浪猫，下期我们讲电商+法律+制造三大行业的 Agent 实战。

系列进度 20/24

**下章预告：** 第21章我们将继续行业实战，从电商到法律到制造，三个不同行业场景的 Agent 应用开发。
