# 第17章 数据分析：用户行为与成本洞察

不知道用户怎么用你的平台？不知道Token花在哪了？那就是在黑暗中开车——迟早翻车。

我是怕浪猫，这章做数据分析。用户行为追踪、Token消耗统计、成本中心分析，让LLMOps平台的运营有数据支撑，不再拍脑袋决策。

---

## 17.1 用户行为追踪

**行为追踪数据模型**

```python
# models/user_behavior.py
class UserBehavior(db.Model):
    __tablename__ = 'user_behaviors'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    event_type = db.Column(db.String(50))  # 事件类型
    event_data = db.Column(db.Text)  # JSON格式的数据
    session_id = db.Column(db.String(100))  # 会话ID
    page_url = db.Column(db.String(500))  # 页面URL
    ip_address = db.Column(db.String(50))
    user_agent = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 索引
    __table_args__ = (
        db.Index('idx_behavior_user_time', 'user_id', 'created_at'),
        db.Index('idx_behavior_event', 'event_type', 'created_at'),
    )
```

**关键行为事件**

| 事件 | 说明 | 追踪数据 |
|------|------|---------|
| page_view | 页面访问 | URL、来源 |
| chat_send | 发送消息 | 消息长度、模型 |
| chat_receive | 收到回复 | 回复长度、延迟 |
| file_upload | 上传文件 | 文件类型、大小 |
| kb_create | 创建知识库 | 名称 |
| kb_search | 知识库搜索 | 查询、结果数 |
| app_create | 创建应用 | 类型 |
| api_call | API调用 | 端点、状态码 |

**行为追踪API**

```python
# routes/analytics.py
analytics_bp = Blueprint('analytics', __name__)

@analytics_bp.route('/track', methods=['POST'])
def track_event():
    """记录用户行为"""
    data = request.json
    
    behavior = UserBehavior(
        user_id=data.get('user_id'),
        event_type=data['event_type'],
        event_data=json.dumps(data.get('event_data', {})),
        session_id=data.get('session_id'),
        page_url=data.get('page_url'),
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent')
    )
    
    db.session.add(behavior)
    db.session.commit()
    
    return success()
```

**前端行为埋点**

```javascript
// utils/tracker.js
class Tracker {
  constructor() {
    this.sessionId = crypto.randomUUID()
    this.userId = null
  }
  
  setUserId(userId) {
    this.userId = userId
  }
  
  track(eventType, eventData = {}) {
    fetch('/api/v1/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: this.userId,
        event_type: eventType,
        event_data: eventData,
        session_id: this.sessionId,
        page_url: window.location.href
      })
    }).catch(() => {})  // 埋点失败不影响用户体验
  }
  
  // 封装常用事件
  pageView() { this.track('page_view', { url: window.location.href }) }
  chatSend(msgLength, model) { this.track('chat_send', { msg_length: msgLength, model }) }
  chatReceive(replyLength, latencyMs) { this.track('chat_receive', { reply_length: replyLength, latency_ms: latencyMs }) }
  fileUpload(fileType, fileSize) { this.track('file_upload', { file_type: fileType, file_size: fileSize }) }
}

export const tracker = new Tracker()
```

---

## 17.2 用户行为漏斗分析

**漏斗定义**

```
注册 → 首次对话 → 创建知识库 → 使用Agent模式 → 创建API Key → 持续使用
 100%     80%        30%          15%            8%          5%
```

**漏斗分析SQL**

```python
# services/analytics_service.py
from sqlalchemy import func, and_

class AnalyticsService:
    def get_funnel_data(self, start_date, end_date):
        """获取漏斗数据"""
        funnel_steps = [
            ('注册', 'user_register'),
            ('首次对话', 'chat_send'),
            ('创建知识库', 'kb_create'),
            ('使用Agent', 'agent_use'),
            ('创建API Key', 'api_key_create'),
            ('持续使用', 'retained_user')
        ]
        
        results = []
        prev_count = None
        
        for step_name, event_type in funnel_steps:
            count = UserBehavior.query.filter(
                UserBehavior.event_type == event_type,
                UserBehavior.created_at.between(start_date, end_date)
            ).distinct(UserBehavior.user_id).count()
            
            conversion_rate = (count / prev_count * 100) if prev_count else 100
            
            results.append({
                'step': step_name,
                'count': count,
                'conversion_rate': round(conversion_rate, 1)
            })
            
            prev_count = count
        
        return results
    
    def get_user_retention(self, cohort_date, days=30):
        """获取用户留存数据"""
        # 获取cohort日注册的用户
        new_users = User.query.filter(
            func.date(User.created_at) == cohort_date
        ).all()
        
        new_user_ids = [u.id for u in new_users]
        
        retention_data = []
        for day in range(1, days + 1):
            target_date = cohort_date + timedelta(days=day)
            
            active_users = UserBehavior.query.filter(
                UserBehavior.user_id.in_(new_user_ids),
                func.date(UserBehavior.created_at) == target_date
            ).distinct(UserBehavior.user_id).count()
            
            retention_rate = (active_users / len(new_user_ids)) * 100 if new_user_ids else 0
            
            retention_data.append({
                'day': day,
                'active_users': active_users,
                'retention_rate': round(retention_rate, 1)
            })
        
        return retention_data
```

---

## 17.3 Token 消耗统计与趋势

**Token消耗数据模型**

```python
class TokenUsage(db.Model):
    __tablename__ = 'token_usage'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    conversation_id = db.Column(db.Integer)
    model = db.Column(db.String(50))
    prompt_tokens = db.Column(db.Integer, default=0)
    completion_tokens = db.Column(db.Integer, default=0)
    total_tokens = db.Column(db.Integer, default=0)
    cost_usd = db.Column(db.Float, default=0.0)  # 美元成本
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Token成本计算**

```python
# config/pricing.py
MODEL_PRICING = {
    'gpt-4': {'input': 0.03 / 1000, 'output': 0.06 / 1000},      # 每千Token
    'gpt-4o': {'input': 0.005 / 1000, 'output': 0.015 / 1000},
    'gpt-3.5-turbo': {'input': 0.0005 / 1000, 'output': 0.0015 / 1000},
    'text-embedding-3-small': {'input': 0.00002 / 1000, 'output': 0},
    'whisper-1': {'per_minute': 0.006},  # 每分钟
}

def calculate_cost(model, prompt_tokens, completion_tokens):
    """计算Token成本"""
    pricing = MODEL_PRICING.get(model, MODEL_PRICING['gpt-4'])
    cost = prompt_tokens * pricing['input'] + completion_tokens * pricing['output']
    return round(cost, 6)
```

**Token消耗统计API**

```python
@analytics_bp.route('/token-usage', methods=['GET'])
@token_required
def get_token_usage():
    """获取Token消耗统计"""
    user_id = g.current_user_id
    
    # 时间范围
    period = request.args.get('period', '7d')
    end_date = datetime.utcnow()
    
    if period == '7d':
        start_date = end_date - timedelta(days=7)
    elif period == '30d':
        start_date = end_date - timedelta(days=30)
    elif period == '90d':
        start_date = end_date - timedelta(days=90)
    
    # 总计
    total = db.session.query(
        func.sum(TokenUsage.prompt_tokens).label('prompt'),
        func.sum(TokenUsage.completion_tokens).label('completion'),
        func.sum(TokenUsage.total_tokens).label('total'),
        func.sum(TokenUsage.cost_usd).label('cost')
    ).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.created_at >= start_date
    ).first()
    
    # 按天分组
    daily = db.session.query(
        func.date(TokenUsage.created_at).label('date'),
        func.sum(TokenUsage.total_tokens).label('tokens'),
        func.sum(TokenUsage.cost_usd).label('cost')
    ).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.created_at >= start_date
    ).group_by(func.date(TokenUsage.created_at)).all()
    
    # 按模型分组
    by_model = db.session.query(
        TokenUsage.model,
        func.sum(TokenUsage.total_tokens).label('tokens'),
        func.sum(TokenUsage.cost_usd).label('cost')
    ).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.created_at >= start_date
    ).group_by(TokenUsage.model).all()
    
    return success(data={
        'total': {
            'prompt_tokens': total.prompt or 0,
            'completion_tokens': total.completion or 0,
            'total_tokens': total.total or 0,
            'cost_usd': round(total.cost or 0, 4)
        },
        'daily': [{
            'date': str(d.date),
            'tokens': d.tokens,
            'cost': round(d.cost, 4)
        } for d in daily],
        'by_model': [{
            'model': m.model,
            'tokens': m.tokens,
            'cost': round(m.cost, 4)
        } for m in by_model]
    })
```

---

## 17.4 成本中心分析

**成本维度**

| 维度 | 说明 | 优化方向 |
|------|------|---------|
| 按模型 | 不同模型成本不同 | 降级模型 |
| 按用户 | 高消耗用户 | 设置配额 |
| 按应用 | 不同应用成本 | 优化Prompt |
| 按时段 | 不同时段成本 | 削峰填谷 |
| 按功能 | 对话/RAG/Agent | 精简功能 |

**成本优化建议**

```python
class CostOptimizationService:
    def analyze(self, user_id):
        """生成成本优化建议"""
        suggestions = []
        
        # 1. 模型降级建议
        model_usage = self._get_model_usage(user_id)
        for model, data in model_usage.items():
            if model == 'gpt-4' and data['avg_prompt_length'] < 500:
                suggestions.append({
                    'type': 'model_downgrade',
                    'suggestion': f'{model}的使用场景中，{data["count"]}次对话的Prompt长度<500，建议降级为gpt-4o',
                    'estimated_savings': data['cost'] * 0.5
                })
        
        # 2. Prompt精简建议
        long_prompts = self._get_long_prompts(user_id)
        if long_prompts:
            suggestions.append({
                'type': 'prompt_optimization',
                'suggestion': f'发现{len(long_prompts)}次对话Prompt超过3000Token，建议精简System Prompt',
                'estimated_savings': sum(p['cost'] * 0.3 for p in long_prompts[:10])
            })
        
        # 3. 缓存优化建议
        repeated_queries = self._get_repeated_queries(user_id)
        if repeated_queries:
            suggestions.append({
                'type': 'cache_optimization',
                'suggestion': f'发现{len(repeated_queries)}个重复查询，建议启用缓存',
                'estimated_savings': sum(q['cost'] for q in repeated_queries)
            })
        
        return suggestions
```

---

## 17.5 数据可视化

**前端图表组件**

```vue
<!-- components/analytics/TokenUsageChart.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { Line, Doughnut } from 'vue-chartjs'
import { analyticsAPI } from '@/api/analytics'

const period = ref('7d')
const chartData = ref(null)
const modelData = ref(null)

const loadData = async () => {
  const res = await analyticsAPI.getTokenUsage({ period: period.value })
  
  chartData.value = {
    labels: res.data.daily.map(d => d.date),
    datasets: [{
      label: 'Token消耗',
      data: res.data.daily.map(d => d.tokens),
      borderColor: '#4f46e5',
      fill: true,
      tension: 0.4
    }]
  }
  
  modelData.value = {
    labels: res.data.by_model.map(m => m.model),
    datasets: [{
      data: res.data.by_model.map(m => m.cost),
      backgroundColor: ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b']
    }]
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h3 class="text-lg font-semibold">Token消耗趋势</h3>
      <select v-model="period" @change="loadData">
        <option value="7d">近7天</option>
        <option value="30d">近30天</option>
        <option value="90d">近90天</option>
      </select>
    </div>
    
    <Line v-if="chartData" :data="chartData" />
    <Doughnut v-if="modelData" :data="modelData" />
  </div>
</template>
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 行为追踪 | 事件模型+前端埋点+异步写入 |
| 漏斗分析 | 转化率+留存率+分步骤统计 |
| Token统计 | 按模型/用户/时间维度统计 |
| 成本计算 | 模型定价表+实时计算+USD换算 |
| 成本优化 | 模型降级+Prompt精简+缓存复用 |
| 数据可视化 | 图表组件+多维度展示 |

---

觉得有用？收藏起来，下次直接照抄。

你的Token消耗最大的优化手段是什么？评论区聊聊。

关注怕浪猫，下期我们做消息通知——邮件通知、Webhook推送、钉钉/飞书集成，让关键事件不遗漏。

系列进度 17/23

**下章预告：** 第18章消息通知——邮件通知、Webhook配置、钉钉/飞书机器人、事件订阅机制，让LLMOps平台的关键事件主动触达用户。
