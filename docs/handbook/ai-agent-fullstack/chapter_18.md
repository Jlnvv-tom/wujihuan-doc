# 第18章 消息通知：让关键事件主动触达用户

用户等了半小时的异步任务，不知道结果，跑去问客服——这就是没有消息通知的后果。

我是怕浪猫，这章做消息通知。邮件通知、Webhook推送、钉钉/飞书集成、事件订阅机制，让LLMOps平台的关键事件主动触达用户，不再让用户干等。

---

## 18.1 邮件通知

**邮件通知场景**

| 场景 | 触发条件 | 邮件内容 |
|------|---------|---------|
| 账号注册 | 用户注册成功 | 欢迎邮件+快速上手指南 |
| 密码重置 | 用户申请重置 | 重置链接（24小时有效） |
| 异步任务完成 | 文档处理/RAG索引完成 | 结果摘要+查看链接 |
| 配额告警 | Token用量超过80% | 用量统计+升级建议 |
| 安全告警 | 异地登录/IP异常 | 登录信息+安全建议 |

**邮件发送服务**

```python
# services/email_service.py
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

class EmailService:
    def __init__(self, config):
        self.config = config
    
    def send_email(self, to_email, subject, html_content, attachments=None):
        """发送邮件"""
        msg = MIMEMultipart('alternative')
        msg['From'] = self.config['SENDER_EMAIL']
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # HTML内容
        msg.attach(MIMEText(html_content, 'html', 'utf-8'))
        
        # 附件
        if attachments:
            for filename, content in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(content)
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                msg.attach(part)
        
        # 发送
        with smtplib.SMTP(self.config['SMTP_HOST'], self.config['SMTP_PORT']) as server:
            server.starttls()
            server.login(self.config['SMTP_USER'], self.config['SMTP_PASSWORD'])
            server.send_message(msg)
        
        return True
    
    def send_template_email(self, to_email, template_name, context):
        """发送模板邮件"""
        from jinja2 import Template
        
        # 加载模板
        template_path = f"templates/email/{template_name}.html"
        with open(template_path, 'r', encoding='utf-8') as f:
            template = Template(f.read())
        
        # 渲染
        html_content = template.render(**context)
        
        # 发送
        subject = context.get('subject', 'LLMOps平台通知')
        return self.send_email(to_email, subject, html_content)
```

**邮件模板**

```html
<!-- templates/email/task_complete.html -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>任务完成通知</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">LLMOps平台</h1>
    </div>
    
    <div style="padding: 30px;">
        <h2>任务完成通知</h2>
        <p>您好 {{ username }}，</p>
        <p>您的任务已完成：</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>任务类型：</strong>{{ task_type }}</p>
            <p><strong>完成时间：</strong>{{ completed_at }}</p>
            <p><strong>处理结果：</strong>{{ result_summary }}</p>
        </div>
        
        <a href="{{ result_url }}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">查看结果</a>
    </div>
    
    <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666;">
        <p>© 2026 LLMOps平台. 如有问题，请联系客服。</p>
    </div>
</body>
</html>
```

**异步发送邮件（Celery）**

```python
# tasks/email_tasks.py
from celery_config import celery
from services.email_service import EmailService

@celery.task(bind=True, max_retries=3)
def send_email_task(self, to_email, template_name, context):
    """异步发送邮件"""
    try:
        email_service = EmailService(Config.EMAIL_CONFIG)
        email_service.send_template_email(to_email, template_name, context)
        return {'status': 'sent'}
    except Exception as e:
        self.retry(exc=e, countdown=60)  # 1分钟后重试
```

---

## 18.2 Webhook 推送

**Webhook配置模型**

```python
# models/webhook.py
class Webhook(db.Model):
    __tablename__ = 'webhooks'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    name = db.Column(db.String(100))
    url = db.Column(db.String(500))
    secret = db.Column(db.String(100))  # 用于签名验证
    events = db.Column(db.Text)  # JSON数组，订阅的事件
    is_active = db.Column(db.Boolean, default=True)
    last_triggered_at = db.Column(db.DateTime)
    success_count = db.Column(db.Integer, default=0)
    failure_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Webhook事件类型**

| 事件 | 说明 | 推送数据 |
|------|------|---------|
| chat.completed | 对话完成 | 对话ID、模型、Token消耗 |
| task.completed | 异步任务完成 | 任务ID、结果 |
| file.processed | 文件处理完成 | 文件ID、状态 |
| quota.warning | 配额告警 | 用量百分比 |
| api_key.expiring | API Key即将过期 | Key名称、过期时间 |

**Webhook推送服务**

```python
# services/webhook_service.py
import hmac
import hashlib
import requests
from datetime import datetime

class WebhookService:
    def __init__(self):
        self.timeout = 5  # 超时时间
    
    def send_webhook(self, webhook_id, event_type, event_data):
        """发送Webhook"""
        webhook = Webhook.query.get(webhook_id)
        if not webhook or not webhook.is_active:
            return
        
        # 构造推送数据
        payload = {
            'event_type': event_type,
            'event_data': event_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 签名
        signature = self._generate_signature(webhook.secret, payload)
        
        # 发送请求
        headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event_type
        }
        
        try:
            response = requests.post(
                webhook.url,
                json=payload,
                headers=headers,
                timeout=self.timeout
            )
            
            # 更新统计
            webhook.last_triggered_at = datetime.utcnow()
            if 200 <= response.status_code < 300:
                webhook.success_count += 1
            else:
                webhook.failure_count += 1
            
            db.session.commit()
            
            return {'status': 'sent', 'status_code': response.status_code}
        except Exception as e:
            webhook.failure_count += 1
            db.session.commit()
            raise
    
    def _generate_signature(self, secret, payload):
        """生成签名"""
        payload_str = json.dumps(payload, sort_keys=True)
        signature = hmac.new(
            secret.encode('utf-8'),
            payload_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        return f"sha256={signature}"
```

**Webhook验证（接收方）**

```python
# 在接收Webhook的服务器上验证签名
def verify_webhook_signature(request):
    """验证Webhook签名"""
    signature = request.headers.get('X-Webhook-Signature', '')
    secret = Config.WEBHOOK_SECRET
    
    payload = request.json
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        json.dumps(payload, sort_keys=True).encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, f"sha256={expected_signature}")
```

---

## 18.3 钉钉/飞书机器人集成

**钉钉机器人**

```python
# services/dingtalk_service.py
import requests
import hashlib
import hmac
import base64
import time

class DingTalkService:
    def __init__(self, webhook_url, secret=None):
        self.webhook_url = webhook_url
        self.secret = secret
    
    def send_text(self, content, at_users=None):
        """发送文本消息"""
        data = {
            'msgtype': 'text',
            'text': {'content': content}
        }
        
        if at_users:
            data['at'] = {'atUserIds': at_users}
        
        return self._send(data)
    
    def send_markdown(self, title, text):
        """发送Markdown消息"""
        data = {
            'msgtype': 'markdown',
            'markdown': {
                'title': title,
                'text': text
            }
        }
        
        return self._send(data)
    
    def _send(self, data):
        """发送请求"""
        url = self.webhook_url
        
        # 签名（如果配置了secret）
        if self.secret:
            timestamp = str(round(time.time() * 1000))
            secret_enc = self.secret.encode('utf-8')
            string_to_sign = f"{timestamp}\n{self.secret}"
            string_to_sign_enc = string_to_sign.encode('utf-8')
            hmac_code = hmac.new(secret_enc, string_to_sign_enc, hashlib.sha256).digest()
            sign = base64.b64encode(hmac_code).decode('utf-8')
            
            url += f"&timestamp={timestamp}&sign={sign}"
        
        response = requests.post(url, json=data, timeout=5)
        return response.json()
```

**飞书机器人**

```python
# services/feishu_service.py
import requests

class FeishuService:
    def __init__(self, webhook_url):
        self.webhook_url = webhook_url
    
    def send_text(self, content):
        """发送文本消息"""
        data = {
            'msg_type': 'text',
            'content': {'text': content}
        }
        
        return self._send(data)
    
    def send_interactive(self, title, elements):
        """发送卡片消息"""
        data = {
            'msg_type': 'interactive',
            'card': {
                'config': {'wide_screen_mode': True},
                'header': {
                    'title': {'tag': 'plain_text', 'content': title},
                    'template': 'blue'
                },
                'elements': elements
            }
        }
        
        return self._send(data)
    
    def _send(self, data):
        response = requests.post(self.webhook_url, json=data, timeout=5)
        return response.json()
```

**统一通知服务**

```python
# services/notification_service.py
class NotificationService:
    def __init__(self):
        self.email_service = EmailService(Config.EMAIL_CONFIG)
        self.webhook_service = WebhookService()
        self.dingtalk_service = DingTalkService(
            Config.DINGTALK_WEBHOOK_URL,
            Config.DINGTALK_SECRET
        )
        self.feishu_service = FeishuService(Config.FEISHU_WEBHOOK_URL)
    
    def notify(self, user_id, event_type, event_data, channels=None):
        """发送通知"""
        channels = channels or ['email']  # 默认只发邮件
        
        user = User.query.get(user_id)
        if not user:
            return
        
        # 邮件通知
        if 'email' in channels and user.email:
            context = {
                'username': user.username,
                'event_type': event_type,
                'event_data': event_data,
                'subject': self._get_subject(event_type)
            }
            send_email_task.delay(user.email, 'notification', context)
        
        # Webhook通知
        if 'webhook' in channels:
            webhooks = Webhook.query.filter_by(
                user_id=user_id, is_active=True
            ).all()
            
            for webhook in webhooks:
                if event_type in json.loads(webhook.events):
                    send_webhook_task.delay(webhook.id, event_type, event_data)
        
        # 钉钉通知
        if 'dingtalk' in channels and Config.DINGTALK_WEBHOOK_URL:
            self.dingtalk_service.send_markdown(
                title='LLMOps平台通知',
                text=f"## {self._get_subject(event_type)}\n\n{self._format_event_data(event_data)}"
            )
        
        # 飞书通知
        if 'feishu' in channels and Config.FEISHU_WEBHOOK_URL:
            self.feishu_service.send_text(
                content=f"{self._get_subject(event_type)}\n{self._format_event_data(event_data)}"
            )
    
    def _get_subject(self, event_type):
        subjects = {
            'task.completed': '任务完成通知',
            'quota.warning': '配额告警',
            'api_key.expiring': 'API Key即将过期',
            'security.alert': '安全告警'
        }
        return subjects.get(event_type, '通知')
    
    def _format_event_data(self, event_data):
        return json.dumps(event_data, ensure_ascii=False, indent=2)
```

---

## 18.4 事件订阅机制

**事件发布-订阅架构**

```python
# services/event_bus.py
from typing import Dict, List, Callable

class EventBus:
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}
    
    def subscribe(self, event_type: str, handler: Callable):
        """订阅事件"""
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)
    
    def publish(self, event_type: str, event_data: dict):
        """发布事件"""
        if event_type in self.subscribers:
            for handler in self.subscribers[event_type]:
                try:
                    handler(event_data)
                except Exception as e:
                    logging.error(f"事件处理失败: {e}")
        
        # 同时触发通知
        self._trigger_notifications(event_type, event_data)
    
    def _trigger_notifications(self, event_type, event_data):
        """触发通知"""
        # 查找订阅了该事件的用户
        webhooks = Webhook.query.filter(
            Webhook.is_active == True,
            Webhook.events.contains(event_type)
        ).all()
        
        for webhook in webhooks:
            send_webhook_task.delay(webhook.id, event_type, event_data)

# 全局事件总线
event_bus = EventBus()
```

**事件使用示例**

```python
# 在任务完成时发布事件
def complete_task(task_id):
    task = Task.query.get(task_id)
    task.status = 'completed'
    task.completed_at = datetime.utcnow()
    db.session.commit()
    
    # 发布事件
    event_bus.publish('task.completed', {
        'task_id': task_id,
        'task_type': task.type,
        'user_id': task.user_id,
        'result_summary': task.result_summary
    })
    
    # 发送通知
    notification_service = NotificationService()
    notification_service.notify(
        user_id=task.user_id,
        event_type='task.completed',
        event_data={'task_id': task_id, 'result_summary': task.result_summary},
        channels=['email', 'webhook']
    )

# 订阅事件（可选，用于内部处理）
def handle_task_completed(event_data):
    # 例如：自动触发下一步任务
    pass

event_bus.subscribe('task.completed', handle_task_completed)
```

---

## 18.5 通知模板与个性化

**通知模板配置**

```python
# config/notification_templates.py
NOTIFICATION_TEMPLATES = {
    'task.completed': {
        'subject': '您的任务已完成',
        'email_template': 'email/task_complete.html',
        'dingtalk_template': '任务完成：{task_type}\n完成时间：{completed_at}',
        'feishu_template': '任务完成通知',
        'webhook_payload': {
            'task_id': '{task_id}',
            'status': 'completed'
        }
    },
    'quota.warning': {
        'subject': 'Token配额即将用尽',
        'email_template': 'email/quota_warning.html',
        'threshold': 0.8  # 80%时触发
    }
}
```

**个性化通知**

```python
def get_notification_preference(user_id):
    """获取用户通知偏好"""
    prefs = NotificationPreference.query.filter_by(user_id=user_id).first()
    if not prefs:
        # 默认偏好
        return {
            'email_enabled': True,
            'webhook_enabled': True,
            'dingtalk_enabled': False,
            'feishu_enabled': False,
            'quiet_hours': {'start': 22, 'end': 8},  # 免打扰时段
            'frequency': 'immediate'  # immediate/batch(每日汇总)
        }
    return prefs.to_dict()

def should_send_notification(user_id, event_type):
    """判断是否应该发送通知"""
    prefs = get_notification_preference(user_id)
    
    # 免打扰时段
    current_hour = datetime.utcnow().hour
    if prefs['quiet_hours']:
        if prefs['quiet_hours']['start'] <= current_hour or current_hour <= prefs['quiet_hours']['end']:
            return False
    
    # 按频率设置
    if prefs['frequency'] == 'batch':
        # 加入汇总队列，每日发送一次
        add_to_batch_queue(user_id, event_type)
        return False
    
    return True
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 邮件通知 | SMTP+模板渲染+异步发送 |
| Webhook推送 | 签名验证+重试机制+事件订阅 |
| 钉钉/飞书 | 机器人Webhook+Markdown/卡片消息 |
| 事件总线 | 发布-订阅架构+解耦通知逻辑 |
| 通知偏好 | 多渠道选择+免打扰+批量汇总 |

---

觉得有用？收藏起来，下次直接照抄。

你的平台用什么方式通知用户？评论区聊聊。

关注怕浪猫，下期我们做综合实战项目一——从0到1搭建企业内部智能客服系统，把前面所有知识串起来。

系列进度 18/23

**下章预告：** 第19章综合实战项目一——企业内部智能客服系统，从需求分析、架构设计、功能实现到部署上线，完整走一遍LLMOps平台的应用开发流程。
