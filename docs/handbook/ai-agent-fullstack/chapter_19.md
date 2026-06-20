# 第19章 综合实战项目一：企业内部智能客服系统

前面18章，知识点都讲了。但知识点不等于能力，得把知识串起来，做一个完整项目。

我是怕浪猫，这章做综合实战。从0到1搭建企业内部智能客服系统——需求分析、架构设计、功能实现、部署上线，完整走一遍LLMOps平台的应用开发流程。

---

## 19.1 需求分析

**业务场景**

某中型企业（500人），需要内部智能客服系统，解决以下痛点：

| 痛点 | 现状 | 目标 |
|------|------|------|
| IT问题占用人力的60% | 重复问题反复解答 | AI自动回答常见问题 |
| 知识分散在各部门 | 员工不知道去哪找 | 统一知识库入口 |
| 新员工入职效率低 | 培训周期2周 | AI辅助缩短到3天 |
| 跨部门协作困难 | 不清楚找谁 | 智能路由到正确部门 |

**功能需求**

```
核心功能：
1. 智能问答 —— 基于企业知识库的RAG问答
2. 人工转接 —— AI无法解决时，转接人工客服
3. 工单系统 —— 问题跟踪和SLA管理
4. 知识库管理 —— 文档上传、自动索引
5. 数据看板 —— 问答统计、满意度、趋势

扩展功能：
6. 多渠道接入 —— 飞书/钉钉/企业微信
7. 语音问答 —— 语音输入+语音回复
8. 主动推送 —— 新政策/公告主动通知
```

**非功能需求**

| 指标 | 要求 |
|------|------|
| 响应时间 | <3秒（非首次） |
| 准确率 | >90%（基于知识库） |
| 并发用户 | 100+ |
| 可用性 | 99.9% |
| 数据安全 | 内网部署、数据不出企业 |

---

## 19.2 架构设计

**系统架构**

```
飞书/钉钉/企微 → API网关 → 客服路由 → AI问答引擎 → 知识库
                              ↓                ↑
                          人工转接 ←─── 工单系统 → 通知服务
                              ↓
                          数据看板
```

**技术选型**

| 层级 | 技术 | 理由 |
|------|------|------|
| 后端 | Flask + Celery | 轻量、灵活 |
| 前端 | Vue3 + Element Plus | 企业级UI |
| 数据库 | PostgreSQL | 企业级关系数据库 |
| 缓存 | Redis | 会话缓存、限流 |
| 向量库 | Milvus / pgvector | RAG检索 |
| 消息队列 | Redis Stream | 工单流转 |
| 部署 | Docker Compose | 内网简单部署 |

**数据库设计**

```sql
-- 客服对话表
CREATE TABLE service_conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    channel VARCHAR(20),  -- feishu/dingtalk/wechat/web
    status VARCHAR(20) DEFAULT 'active',  -- active/transferred/closed
    agent_id INTEGER,  -- 人工客服ID（转接后）
    satisfaction_score INTEGER,  -- 满意度1-5
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- 客服消息表
CREATE TABLE service_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES service_conversations(id),
    sender_type VARCHAR(20),  -- user/ai/agent
    content TEXT,
    sources JSONB,  -- RAG引用来源
    created_at TIMESTAMP DEFAULT NOW()
);

-- 工单表
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES service_conversations(id),
    title VARCHAR(200),
    description TEXT,
    category VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(20) DEFAULT 'open',
    assignee_id INTEGER,
    sla_deadline TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- 知识库表（复用LLMOps平台知识库）
-- 已有knowledge_bases、documents表
```

---

## 19.3 AI 问答引擎

**RAG问答流程**

```
用户提问 → Query改写 → 向量检索 → 上下文拼接 → LLM生成 → 审核输出 → 返回
```

**问答服务实现**

```python
# services/customer_service_ai.py
class CustomerServiceAI:
    def __init__(self):
        self.rag_service = RAGService()
        self.llm_service = LLMService()
        self.audit_service = AuditService()
    
    def answer(self, question, conversation_id=None, user_id=None):
        """智能问答"""
        
        # 1. Query改写
        rewritten_query = self._rewrite_query(question, conversation_id)
        
        # 2. 输入审核
        audit_result = self.audit_service.audit(rewritten_query, "input")
        if not audit_result["pass"]:
            return {
                "answer": "抱歉，您的问题包含不当内容，请重新描述。",
                "should_transfer": False
            }
        
        # 3. RAG检索
        search_results = self.rag_service.search(
            query=rewritten_query,
            top_k=5,
            score_threshold=0.7
        )
        
        # 4. 判断是否需要转接人工
        if not search_results or self._needs_human(question, search_results):
            return {
                "answer": "抱歉，我无法找到相关答案，正在为您转接人工客服。",
                "should_transfer": True,
                "reason": "knowledge_not_found"
            }
        
        # 5. 拼接上下文
        context = self._build_context(search_results)
        
        # 6. LLM生成
        prompt = f"""你是企业内部智能客服。请根据以下知识库内容回答用户的问题。
如果知识库内容不足以回答问题，请说明并建议转接人工客服。

知识库内容：
{context}

用户问题：{question}

请简洁、准确地回答："""
        
        answer = self.llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model="gpt-4o",
            temperature=0.3
        )
        
        # 7. 输出审核
        audit_result = self.audit_service.audit(answer, "output")
        if not audit_result["pass"]:
            answer = "抱歉，我无法回答这个问题。正在为您转接人工客服。"
            should_transfer = True
        else:
            should_transfer = False
        
        return {
            "answer": answer,
            "sources": [r['metadata'] for r in search_results[:3]],
            "should_transfer": should_transfer
        }
    
    def _rewrite_query(self, question, conversation_id=None):
        """Query改写（结合上下文）"""
        if not conversation_id:
            return question
        
        # 获取最近5条消息
        recent_messages = ServiceMessage.query.filter_by(
            conversation_id=conversation_id
        ).order_by(ServiceMessage.created_at.desc()).limit(5).all()
        
        if not recent_messages:
            return question
        
        # 用LLM改写
        context = "\n".join([f"{m.sender_type}: {m.content}" for m in reversed(recent_messages)])
        
        rewrite_prompt = f"""根据对话历史，改写用户最新问题为独立、完整的问题。

对话历史：
{context}

最新问题：{question}

改写后的完整问题："""
        
        return self.llm_service.chat(
            messages=[{"role": "user", "content": rewrite_prompt}],
            model="gpt-4o-mini",
            temperature=0
        )
    
    def _needs_human(self, question, search_results):
        """判断是否需要转接人工"""
        # 低置信度
        if search_results and search_results[0]['score'] < 0.5:
            return True
        
        # 特定关键词触发人工转接
        human_keywords = ['投诉', '退款', '紧急', '经理', '人工']
        if any(kw in question for kw in human_keywords):
            return True
        
        return False
    
    def _build_context(self, search_results):
        """构建RAG上下文"""
        context_parts = []
        for i, result in enumerate(search_results):
            context_parts.append(f"[来源{i+1}] {result['content']}")
        return "\n\n".join(context_parts)
```

---

## 19.4 人工转接与工单系统

**转接流程**

```
AI判断需转接 → 创建工单 → 路由到部门 → 人工接单 → 回复 → 关闭工单
```

**工单服务**

```python
# services/ticket_service.py
class TicketService:
    def __init__(self):
        self.department_rules = {
            'it': ['电脑', '网络', '系统', '账号', 'VPN'],
            'hr': ['薪资', '假期', '社保', '入职', '离职'],
            'finance': ['报销', '发票', '预算', '合同'],
            'admin': ['物业', '停车', '办公', '快递']
        }
    
    def create_ticket(self, conversation_id, user_id, reason):
        """创建工单"""
        conversation = ServiceConversation.query.get(conversation_id)
        
        # 自动分类
        category = self._classify(conversation.messages[-1].content if conversation.messages else '')
        
        # 计算SLA
        sla_deadline = self._calculate_sla(category)
        
        ticket = Ticket(
            conversation_id=conversation_id,
            title=f"客服转接 - {category}",
            description=reason,
            category=category,
            priority='normal',
            sla_deadline=sla_deadline
        )
        
        db.session.add(ticket)
        
        # 更新对话状态
        conversation.status = 'transferred'
        db.session.commit()
        
        # 通知客服
        self._notify_agents(ticket)
        
        return ticket
    
    def _classify(self, content):
        """自动分类"""
        for dept, keywords in self.department_rules.items():
            if any(kw in content for kw in keywords):
                return dept
        return 'general'
    
    def _calculate_sla(self, category):
        """计算SLA"""
        sla_hours = {
            'it': 4,
            'hr': 8,
            'finance': 12,
            'admin': 8,
            'general': 24
        }
        hours = sla_hours.get(category, 24)
        return datetime.utcnow() + timedelta(hours=hours)
    
    def _notify_agents(self, ticket):
        """通知客服"""
        notification = NotificationService()
        notification.notify(
            user_id=None,  # 通知整个部门
            event_type='ticket.created',
            event_data={
                'ticket_id': ticket.id,
                'category': ticket.category,
                'sla_deadline': ticket.sla_deadline.isoformat()
            },
            channels=['dingtalk']
        )
```

---

## 19.5 多渠道接入

**飞书接入**

```python
# routes/feishu_webhook.py
feishu_bp = Blueprint('feishu', __name__)

@feishu_bp.route('/webhook', methods=['POST'])
def feishu_webhook():
    """飞书事件回调"""
    data = request.json
    
    # 验证签名
    if not verify_feishu_signature(data):
        return jsonify({'error': 'invalid signature'}), 401
    
    # 处理消息事件
    if data.get('header', {}).get('event_type') == 'im.message.receive_v1':
        event = data['event']
        message = event['message']
        user_id = message.get('user_id')
        content = json.loads(message['content']).get('text', '')
        
        # 调用AI客服
        answer = customer_service_ai.answer(content, user_id=user_id)
        
        # 回复消息
        feishu_service.reply_message(message['message_id'], answer['answer'])
        
        # 如果需要转接，创建工单
        if answer.get('should_transfer'):
            ticket_service.create_ticket(
                conversation_id=get_or_create_conversation(user_id, 'feishu'),
                user_id=user_id,
                reason=answer.get('reason', 'AI无法解答')
            )
    
    return jsonify({'code': 0})
```

**钉钉接入**

```python
# routes/dingtalk_webhook.py
dingtalk_bp = Blueprint('dingtalk', __name__)

@dingtalk_bp.route('/webhook', methods=['POST'])
def dingtalk_webhook():
    """钉钉事件回调"""
    data = request.json
    
    # 处理消息
    if data.get('msgtype') == 'text':
        content = data['text']['content']
        sender_id = data['senderStaffId']
        
        # 调用AI客服
        answer = customer_service_ai.answer(content, user_id=sender_id)
        
        return jsonify({
            'msgtype': 'text',
            'text': {'content': answer['answer']}
        })
    
    return jsonify({'msgtype': 'empty'})
```

---

## 19.6 数据看板

**看板指标**

| 指标 | 数据源 | 可视化 |
|------|--------|--------|
| 日活用户 | 对话表 | 折线图 |
| 问答量趋势 | 消息表 | 折线图 |
| AI解决率 | 对话状态 | 饼图 |
| 平均响应时间 | 消息时间差 | 柱状图 |
| 满意度分布 | 满意度评分 | 柱状图 |
| 转接率 | 对话状态 | 趋势线 |
| 工单统计 | 工单表 | 表格 |

**看板API**

```python
@analytics_bp.route('/dashboard', methods=['GET'])
@admin_required
def get_dashboard():
    """获取客服看板数据"""
    today = datetime.utcnow().date()
    
    # 日活用户
    dau = ServiceConversation.query.filter(
        func.date(ServiceConversation.created_at) == today
    ).distinct(ServiceConversation.user_id).count()
    
    # AI解决率
    total = ServiceConversation.query.filter(
        func.date(ServiceConversation.created_at) == today
    ).count()
    
    ai_resolved = ServiceConversation.query.filter(
        func.date(ServiceConversation.created_at) == today,
        ServiceConversation.status == 'closed',
        ServiceConversation.agent_id == None  # 未转接=AI解决
    ).count()
    
    ai_resolution_rate = (ai_resolved / total * 100) if total else 0
    
    # 平均响应时间
    avg_response_time = db.session.query(
        func.avg(
            func.extract('epoch', ServiceMessage.created_at) - 
            func.extract('epoch', ServiceConversation.created_at)
        )
    ).filter(
        ServiceMessage.sender_type == 'ai',
        func.date(ServiceConversation.created_at) == today
    ).scalar() or 0
    
    return success(data={
        'dau': dau,
        'total_conversations': total,
        'ai_resolution_rate': round(ai_resolution_rate, 1),
        'avg_response_time': round(avg_response_time, 1),
        'ticket_stats': {
            'open': Ticket.query.filter_by(status='open').count(),
            'in_progress': Ticket.query.filter_by(status='in_progress').count(),
            'resolved': Ticket.query.filter_by(status='resolved').count()
        }
    })
```

---

## 19.7 部署与运维

**Docker Compose配置**

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/customer_service
      - REDIS_URL=redis://redis:6379/0
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - postgres
      - redis

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=customer_service
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  celery:
    build: ./backend
    command: celery -A celery_config worker -l info
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/customer_service
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 需求分析 | 痛点→功能→非功能需求 |
| 架构设计 | 分层架构+技术选型+数据库设计 |
| AI问答引擎 | RAG+Query改写+人工转接判断 |
| 工单系统 | 自动分类+SLA+通知 |
| 多渠道接入 | 飞书/钉钉Webhook集成 |
| 数据看板 | DAU+AI解决率+满意度 |

---

觉得有用？收藏起来，下次直接照抄。

你在企业内部部署过智能客服吗？遇到过什么坑？评论区聊聊。

关注怕浪猫，下期我们做综合实战项目二——面向SaaS的AI助手平台，多租户架构、计费系统、白标定制。

系列进度 19/23

**下章预告：** 第20章综合实战项目二——SaaS化AI助手平台，多租户架构、订阅计费、白标定制、用量统计，让LLMOps平台走向商业化。
