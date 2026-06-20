# 第20章 综合实战项目二：SaaS 化 AI 助手平台

单租户项目做完了，但真正的商业化是SaaS——一套系统服务N个客户，每个客户看到的是"自己的"平台。

我是怕浪猫，这章做SaaS化AI助手平台。多租户架构、订阅计费、白标定制、用量统计，让LLMOps平台从工具走向商业产品。

---

## 20.1 多租户架构设计

**多租户方案对比**

| 方案 | 数据隔离 | 成本 | 复杂度 | 适用场景 |
|------|---------|------|--------|---------|
| 独立数据库 | 最高 | 最高 | 低 | 金融、医疗 |
| 共享数据库+独立Schema | 高 | 中 | 中 | 企业级SaaS |
| 共享数据库+租户ID字段 | 中 | 最低 | 高 | 创业公司 |

**共享数据库+租户ID方案（推荐）**

```python
# middleware/tenant.py
from flask import g

class TenantMiddleware:
    def __init__(self, app):
        self.app = app
        
        @app.before_request
        def resolve_tenant():
            host = request.headers.get('Host', '')
            subdomain = host.split('.')[0]
            
            if subdomain in ['www', 'localhost', '']:
                g.tenant_id = None
                return
            
            tenant = Tenant.query.filter_by(subdomain=subdomain, is_active=True).first()
            if not tenant:
                return error("租户不存在", 404)
            
            g.tenant_id = tenant.id
            g.tenant = tenant
```

**租户数据模型**

```python
class Tenant(db.Model):
    __tablename__ = 'tenants'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    subdomain = db.Column(db.String(50), unique=True)
    custom_domain = db.Column(db.String(200))
    logo_url = db.Column(db.String(500))
    primary_color = db.Column(db.String(7))
    plan = db.Column(db.String(20), default='free')
    is_active = db.Column(db.Boolean, default=True)
    max_users = db.Column(db.Integer, default=10)
    max_tokens_monthly = db.Column(db.Integer, default=100000)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)
```

**租户数据隔离**

```python
# 基础Model加入tenant_id
class TenantBaseModel(db.Model):
    __abstract__ = True
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'))

# 在所有业务模型中继承
class Conversation(TenantBaseModel):
    __tablename__ = 'conversations'
    id = db.Column(db.Integer, primary_key=True)

# 查询时自动过滤
def query_with_tenant(model_class):
    tenant_id = get_current_tenant_id()
    query = model_class.query
    if tenant_id:
        query = query.filter(model_class.tenant_id == tenant_id)
    return query
```

---

## 20.2 订阅计费系统

**订阅计划定义**

```python
# config/plans.py
SUBSCRIPTION_PLANS = {
    'free': {
        'name': '免费版',
        'price': 0,
        'max_users': 5,
        'max_tokens_monthly': 100000,
        'max_knowledge_bases': 3,
        'max_api_keys': 1,
        'features': ['basic_chat', 'knowledge_base']
    },
    'pro': {
        'name': '专业版',
        'price': 99,
        'max_users': 50,
        'max_tokens_monthly': 2000000,
        'max_knowledge_bases': 20,
        'max_api_keys': 10,
        'features': ['basic_chat', 'knowledge_base', 'api_access', 'audit', 'analytics']
    },
    'enterprise': {
        'name': '企业版',
        'price': 499,
        'max_users': -1,
        'max_tokens_monthly': -1,
        'max_knowledge_bases': -1,
        'max_api_keys': -1,
        'features': ['all']
    }
}
```

**用量配额检查**

```python
class QuotaService:
    def check_quota(self, tenant_id, resource_type, amount=1):
        tenant = Tenant.query.get(tenant_id)
        plan_config = SUBSCRIPTION_PLANS[tenant.plan]
        
        limits = {
            'users': ('max_users', User.query.filter_by(tenant_id=tenant_id).count()),
            'tokens': ('max_tokens_monthly', self._get_monthly_tokens(tenant_id)),
            'knowledge_bases': ('max_knowledge_bases', KnowledgeBase.query.filter_by(tenant_id=tenant_id).count()),
            'api_keys': ('max_api_keys', ApiKey.query.filter_by(tenant_id=tenant_id).count())
        }
        
        limit_field, current = limits[resource_type]
        limit = plan_config[limit_field]
        
        if limit == -1:
            return True
        
        if current + amount > limit:
            raise QuotaExceededError(f"已达到{resource_type}上限，请升级套餐")
        
        return True
```

**Stripe支付集成**

```python
import stripe

class PaymentService:
    def create_checkout(self, tenant_id, plan):
        tenant = Tenant.query.get(tenant_id)
        plan_config = SUBSCRIPTION_PLANS[plan]
        
        if not tenant.stripe_customer_id:
            customer = stripe.Customer.create(email=tenant.admin_email, name=tenant.name)
            tenant.stripe_customer_id = customer.id
            db.session.commit()
        
        session = stripe.checkout.Session.create(
            customer=tenant.stripe_customer_id,
            mode='subscription',
            line_items=[{
                'price_data': {
                    'currency': 'cny',
                    'product_data': {'name': f"LLMOps {plan_config['name']}"},
                    'unit_amount': int(plan_config['price'] * 100),
                    'recurring': {'interval': 'month'}
                },
                'quantity': 1
            }],
            success_url=f"https://{tenant.subdomain}.llmops.com/billing/success",
            cancel_url=f"https://{tenant.subdomain}.llmops.com/billing",
            metadata={'tenant_id': tenant_id, 'plan': plan}
        )
        
        return session.url
```

---

## 20.3 白标定制

**白标配置**

```python
class TenantBranding(db.Model):
    __tablename__ = 'tenant_brandings'
    
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'))
    app_name = db.Column(db.String(100), default='AI助手')
    logo_url = db.Column(db.String(500))
    favicon_url = db.Column(db.String(500))
    primary_color = db.Column(db.String(7), default='#4f46e5')
    secondary_color = db.Column(db.String(7), default='#06b6d4')
    login_background = db.Column(db.String(500))
    login_title = db.Column(db.String(200))
    login_subtitle = db.Column(db.String(500))
    custom_domain = db.Column(db.String(200))
    show_branding = db.Column(db.Boolean, default=True)
    allow_signup = db.Column(db.Boolean, default=True)
```

**前端动态主题**

```javascript
const fetchBranding = async (subdomain) => {
  const res = await fetch('/api/v1/branding', {
    headers: { 'X-Tenant': subdomain }
  })
  const data = res.data
  
  document.documentElement.style.setProperty('--primary-color', data.primary_color)
  document.documentElement.style.setProperty('--secondary-color', data.secondary_color)
  document.title = data.app_name
  
  return data
}
```

---

## 20.4 用量统计与账单

**账单生成**

```python
class BillingService:
    def generate_invoice(self, tenant_id, month):
        start_date = datetime(month.year, month.month, 1)
        end_date = start_date + timedelta(days=32).replace(day=1) - timedelta(seconds=1)
        
        tenant = Tenant.query.get(tenant_id)
        plan_config = SUBSCRIPTION_PLANS[tenant.plan]
        base_cost = plan_config['price']
        
        records = UsageRecord.query.filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.created_at.between(start_date, end_date)
        ).all()
        
        total_overage = sum(r.total_cost for r in records if r.total_cost > 0)
        
        return {
            'tenant_id': tenant_id,
            'month': month.strftime('%Y-%m'),
            'base_cost': base_cost,
            'total_cost': base_cost + total_overage,
            'records': len(records)
        }
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 多租户架构 | 子域名+租户ID+自动数据隔离 |
| 订阅计费 | 三级套餐+Stripe支付+配额检查 |
| 白标定制 | 品牌配置+动态主题+自定义域名 |
| 用量统计 | 明细记录+月度账单+超额计费 |

---

觉得有用？收藏起来，下次直接照抄。

你做过SaaS化改造吗？多租户数据隔离用什么方案？评论区聊聊。

关注怕浪猫，下期我们做综合实战项目三——从0到1搭建个人AI知识库应用。

系列进度 20/23

**下章预告：** 第21章综合实战项目三——个人AI知识库应用，语义搜索、笔记管理、知识图谱、知识卡片，打造你的第二大脑。
