# 第23章 综合实战项目五：AI Agent 协作平台

单个AI Agent能做的事有限，多个Agent协作才能真正解决复杂问题。但怎么编排、怎么通信、怎么避免死循环？这章给出答案。

我是怕浪猫，这章做AI Agent协作平台。多Agent编排、任务分解、协作通信、人类审批，让多个AI Agent像团队一样协作完成复杂任务。

---

## 23.1 多Agent架构设计

**架构模式对比**

| 模式 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 串行管道 | A→B→C→输出 | 简单 | 慢、不灵活 |
| 并行扇出 | A同时调用B/C/D | 快 | 结果合并复杂 |
| 主从编排 | 主Agent分解+分配 | 灵活 | 主Agent是瓶颈 |
| 对等协作 | Agent互相通信 | 去中心化 | 协调复杂 |

**主从编排架构（推荐）**

```
用户任务 → 主Agent（Planner）
              ↓ 分解子任务
          ┌───┼───┐
          ↓   ↓   ↓
        Agent1 Agent2 Agent3  （Worker）
          ↓   ↓   ↓
          └───┼───┘
              ↓ 汇总结果
          主Agent（Reporter）
              ↓
          需要人类审批？
           ↓是        ↓否
        人工审批    输出结果
```

---

## 23.2 Agent 定义与注册

**Agent数据模型**

```python
# models/agent.py
class AgentDefinition(db.Model):
    __tablename__ = 'agent_definitions'
    
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'))
    name = db.Column(db.String(100))
    description = db.Column(db.Text)
    system_prompt = db.Column(db.Text)
    model = db.Column(db.String(50), default='gpt-4o')
    temperature = db.Column(db.Float, default=0.3)
    tools = db.Column(db.Text)  # JSON: 可用工具列表
    max_iterations = db.Column(db.Integer, default=10)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Agent注册表**

```python
# services/agent_registry.py
class AgentRegistry:
    def __init__(self):
        self.agents = {}
    
    def register(self, agent_type, agent_class, config=None):
        """注册Agent"""
        self.agents[agent_type] = {
            'class': agent_class,
            'config': config or {}
        }
    
    def get_agent(self, agent_type):
        """获取Agent实例"""
        if agent_type not in self.agents:
            raise ValueError(f"未注册的Agent类型: {agent_type}")
        
        agent_info = self.agents[agent_type]
        return agent_info['class'](**agent_info['config'])
    
    def list_agents(self):
        """列出所有注册的Agent"""
        return list(self.agents.keys())

# 全局注册表
registry = AgentRegistry()

# 注册内置Agent
registry.register('planner', PlannerAgent)
registry.register('researcher', ResearcherAgent)
registry.register('coder', CoderAgent)
registry.register('reviewer', ReviewerAgent)
registry.register('reporter', ReporterAgent)
```

---

## 23.3 任务分解与分配

**Planner Agent**

```python
# agents/planner_agent.py
class PlannerAgent:
    def __init__(self, llm_service=None):
        self.llm = llm_service or LLMService()
    
    def plan(self, task_description, available_agents=None):
        """分解任务"""
        available = available_agents or ['researcher', 'coder', 'reviewer', 'reporter']
        
        prompt = f"""你是一个任务规划Agent。请将以下任务分解为子任务，并分配给合适的Agent。

可用Agent：
- researcher: 搜索和调研
- coder: 编写代码
- reviewer: 审查代码
- reporter: 生成报告

用户任务：{task_description}

请返回JSON格式的执行计划：
{{
    "subtasks": [
        {{
            "id": "subtask_1",
            "description": "子任务描述",
            "agent": "researcher",
            "dependencies": [],
            "input": "输入描述",
            "expected_output": "预期输出描述"
        }}
    ],
    "execution_order": ["subtask_1", "subtask_2", ...],
    "human_approval_required": true/false,
    "estimated_time_minutes": 10
}}"""
        
        result = self.llm.chat(
            messages=[{"role": "user", "content": prompt}],
            model="gpt-4o",
            temperature=0.2
        )
        
        try:
            plan = json.loads(result)
            return plan
        except json.JSONDecodeError:
            # 降级：返回简单计划
            return {
                "subtasks": [{
                    "id": "subtask_1",
                    "description": task_description,
                    "agent": "researcher",
                    "dependencies": [],
                    "input": task_description,
                    "expected_output": "任务完成结果"
                }],
                "execution_order": ["subtask_1"],
                "human_approval_required": False
            }
```

---

## 23.4 Agent 通信协议

**消息格式**

```python
# models/agent_message.py
class AgentMessage(db.Model):
    __tablename__ = 'agent_messages'
    
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('agent_tasks.id'))
    from_agent = db.Column(db.String(50))
    to_agent = db.Column(db.String(50))
    message_type = db.Column(db.String(50))  # task/result/error/approval
    content = db.Column(db.Text)
    metadata = db.Column(db.Text)  # JSON
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**通信服务**

```python
# services/agent_communication.py
class AgentCommunication:
    def __init__(self):
        self.message_handlers = defaultdict(list)
    
    def send(self, from_agent, to_agent, message_type, content, task_id=None, metadata=None):
        """发送消息"""
        msg = AgentMessage(
            task_id=task_id,
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=message_type,
            content=content,
            metadata=json.dumps(metadata or {})
        )
        db.session.add(msg)
        db.session.commit()
        
        # 触发处理
        for handler in self.message_handlers.get(to_agent, []):
            handler(msg)
        
        return msg
    
    def on_message(self, agent_name, handler):
        """注册消息处理器"""
        self.message_handlers[agent_name].append(handler)
    
    def get_messages(self, agent_name, message_type=None, limit=50):
        """获取消息"""
        query = AgentMessage.query.filter_by(to_agent=agent_name)
        if message_type:
            query = query.filter_by(message_type=message_type)
        return query.order_by(AgentMessage.created_at.desc()).limit(limit).all()
```

---

## 23.5 任务执行引擎

**执行引擎**

```python
# services/task_executor.py
class TaskExecutor:
    def __init__(self, agent_registry, communication):
        self.registry = agent_registry
        self.communication = communication
    
    def execute_plan(self, plan, task_id):
        """执行计划"""
        results = {}
        subtasks = {s['id']: s for s in plan['subtasks']}
        
        # 按执行顺序执行
        for subtask_id in plan['execution_order']:
            subtask = subtasks[subtask_id]
            
            # 检查依赖是否完成
            deps_met = all(dep in results for dep in subtask.get('dependencies', []))
            if not deps_met:
                results[subtask_id] = {'error': '依赖未完成'}
                continue
            
            # 构造输入
            input_data = self._build_input(subtask, results)
            
            # 获取Agent并执行
            agent = self.registry.get_agent(subtask['agent'])
            
            try:
                result = agent.execute(
                    task=input_data,
                    task_id=task_id,
                    communication=self.communication
                )
                
                results[subtask_id] = result
                
                # 发送结果消息
                self.communication.send(
                    from_agent=subtask['agent'],
                    to_agent='planner',
                    message_type='result',
                    content=json.dumps(result),
                    task_id=task_id
                )
            except Exception as e:
                results[subtask_id] = {'error': str(e)}
        
        return results
    
    def _build_input(self, subtask, completed_results):
        """构造子任务输入"""
        input_data = subtask['input']
        
        # 注入依赖结果
        for dep_id in subtask.get('dependencies', []):
            if dep_id in completed_results:
                input_data += f"\n\n依赖任务{dep_id}的结果：{json.dumps(completed_results[dep_id], ensure_ascii=False)}"
        
        return input_data
```

---

## 23.6 人类审批机制

**审批流程**

```python
# services/approval_service.py
class ApprovalService:
    def request_approval(self, task_id, agent_name, content, reason):
        """请求人类审批"""
        approval = AgentApproval(
            task_id=task_id,
            agent_name=agent_name,
            content=content,
            reason=reason,
            status='pending'
        )
        db.session.add(approval)
        db.session.commit()
        
        # 通知人类
        notification_service = NotificationService()
        notification_service.notify(
            user_id=approval.requester_id,
            event_type='approval.requested',
            event_data={
                'approval_id': approval.id,
                'agent_name': agent_name,
                'reason': reason,
                'content_preview': content[:200]
            },
            channels=['email', 'dingtalk']
        )
        
        return approval
    
    def approve(self, approval_id, user_id, comment=None):
        """批准"""
        approval = AgentApproval.query.get_or_404(approval_id)
        approval.status = 'approved'
        approval.approver_id = user_id
        approval.comment = comment
        approval.approved_at = datetime.utcnow()
        db.session.commit()
        
        # 通知Agent继续
        self.communication.send(
            from_agent='human',
            to_agent=approval.agent_name,
            message_type='approval',
            content='approved',
            task_id=approval.task_id
        )
    
    def reject(self, approval_id, user_id, reason):
        """拒绝"""
        approval = AgentApproval.query.get_or_404(approval_id)
        approval.status = 'rejected'
        approval.approver_id = user_id
        approval.comment = reason
        approval.approved_at = datetime.utcnow()
        db.session.commit()
        
        # 通知Agent
        self.communication.send(
            from_agent='human',
            to_agent=approval.agent_name,
            message_type='rejection',
            content=f'rejected: {reason}',
            task_id=approval.task_id
        )
```

---

## 23.7 完整示例：AI辅助代码审查

**使用场景**

用户提交一个需求："审查这个PR的代码质量，并给出改进建议。"

```
1. Planner分解任务：
   - subtask_1: researcher → 阅读PR描述和相关Issue
   - subtask_2: coder → 分析代码变更，检测潜在问题
   - subtask_3: reviewer → 综合评估，给出改进建议
   - subtask_4: reporter → 生成审查报告

2. 执行：
   - researcher读取PR → 返回PR摘要
   - coder分析代码 → 返回代码问题列表
   - reviewer综合评估 → 返回改进建议
   - 需要人类审批？ → 否 → reporter生成报告

3. 输出：结构化审查报告
```

**API接口**

```python
# routes/agent_collaboration.py
agent_bp = Blueprint('agent_collaboration', __name__)

@agent_bp.route('/tasks', methods=['POST'])
@token_required
def create_task():
    """创建协作任务"""
    data = request.json
    task_description = data['description']
    
    # 1. Planner分解任务
    planner = PlannerAgent()
    plan = planner.plan(task_description)
    
    # 2. 创建任务记录
    task = AgentTask(
        user_id=g.current_user_id,
        description=task_description,
        plan=json.dumps(plan),
        status='running'
    )
    db.session.add(task)
    db.session.commit()
    
    # 3. 异步执行
    execute_agent_task.delay(task.id, plan)
    
    return success(data={'task_id': task.id, 'plan': plan})

@agent_bp.route('/tasks/<int:task_id>', methods=['GET'])
@token_required
def get_task_status(task_id):
    """获取任务状态"""
    task = AgentTask.query.get_or_404(task_id)
    
    return success(data={
        'task_id': task.id,
        'status': task.status,
        'plan': json.loads(task.plan),
        'results': json.loads(task.results) if task.results else None,
        'messages': AgentMessage.query.filter_by(task_id=task_id).count()
    })

@agent_bp.route('/approvals/<int:approval_id>/approve', methods=['POST'])
@token_required
def approve_task(approval_id):
    """审批通过"""
    data = request.json
    approval_service.approve(approval_id, g.current_user_id, data.get('comment'))
    return success()

@agent_bp.route('/approvals/<int:approval_id>/reject', methods=['POST'])
@token_required
def reject_task(approval_id):
    """审批拒绝"""
    data = request.json
    approval_service.reject(approval_id, g.current_user_id, data.get('reason'))
    return success()
```

---

## 23.8 前端任务看板

```vue
<!-- views/AgentTaskBoard.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { agentAPI } from '@/api/agent'

const tasks = ref([])
const loading = ref(false)

const loadTasks = async () => {
  loading.value = true
  const res = await agentAPI.listTasks()
  tasks.value = res.data
  loading.value = false
}

const createTask = async (description) => {
  const res = await agentAPI.createTask({ description })
  tasks.value.unshift(res.data)
}

const statusColor = {
  'pending': 'gray',
  'running': 'blue',
  'waiting_approval': 'orange',
  'completed': 'green',
  'failed': 'red'
}

onMounted(loadTasks)
</script>

<template>
  <div class="p-6">
    <h2 class="text-xl font-bold mb-4">AI Agent协作任务</h2>
    
    <!-- 创建任务 -->
    <div class="mb-6">
      <el-input v-model="newTask" placeholder="输入任务描述" />
      <el-button type="primary" @click="createTask(newTask)">创建任务</el-button>
    </div>
    
    <!-- 任务列表 -->
    <el-table :data="tasks" v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="description" label="任务描述" />
      <el-table-column prop="status" label="状态" width="150">
        <template #default="{ row }">
          <el-tag :color="statusColor[row.status]">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="viewTask(row.id)">详情</el-button>
          <el-button v-if="row.status === 'waiting_approval'" 
                     size="small" type="warning"
                     @click="handleApproval(row.id)">
            审批
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 架构设计 | 主从编排模式，Planner分解+Worker执行 |
| Agent注册 | 注册表模式，按类型获取Agent实例 |
| 任务分解 | LLM自动分解+依赖分析+执行顺序 |
| 通信协议 | 消息模型+发送/接收/处理器模式 |
| 执行引擎 | 顺序执行+依赖注入+错误处理 |
| 人类审批 | 请求/批准/拒绝+通知+阻塞执行 |

---

## 全系列总结

23章，从Flask后端到Vue3前端，从认证鉴权到知识库RAG，从应用编排到部署上线，从单租户到SaaS多租户，从单Agent到多Agent协作——这是一套完整的AI Agent全栈开发指南。

**核心能力清单：**

| 能力 | 章节 | 掌握程度自评 |
|------|------|-------------|
| Flask后端开发 | 1-2 | |
| Vue3前端开发 | 3 | |
| 认证鉴权 | 4-5 | |
| 知识库与RAG | 6-7 | |
| 应用编排与Agent | 8-9 | |
| 审核与安全 | 10+14 | |
| 开放API | 11 | |
| 部署与运维 | 12-13 | |
| 日志与监控 | 15 | |
| 多模态 | 16 | |
| 数据分析 | 17 | |
| 消息通知 | 18 | |
| 综合实战 | 19-23 | |

收藏这个系列，需要的时候随时翻。有问题评论区见。

我是怕浪猫，下个系列见。

系列进度 23/23（完结）
