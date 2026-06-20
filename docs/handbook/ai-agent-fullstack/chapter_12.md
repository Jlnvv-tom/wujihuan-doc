# 第12章 部署上线：Docker 容器化与 CI/CD 流水线

代码写完了不部署，等于做了顿饭不吃。LLMOps平台必须从"能跑"进化到"能扛"。

我是怕浪猫，这章做生产部署。Docker容器化、CI/CD流水线、Nginx反向代理，把你的平台从本地笔记本搬到服务器上。

---

## 12.1 Docker 容器化：后端 + 前端 + 数据库 + Redis

**Dockerfile后端**

```dockerfile
# Dockerfile.backend
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制代码
COPY . .

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:create_app()"]
```

**Dockerfile前端**

```dockerfile
# Dockerfile.frontend
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**docker-compose.yml**

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.backend
    container_name: llmops-backend
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/llmops
      - REDIS_URL=redis://redis:6379/0
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      - postgres
      - redis
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    container_name: llmops-frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: always

  postgres:
    image: postgres:15-alpine
    container_name: llmops-postgres
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=llmops
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    container_name: llmops-redis
    volumes:
      - redis_data:/data
    restart: always

  celery:
    build:
      context: ./backend
      dockerfile: Dockerfile.backend
    container_name: llmops-celery
    command: celery -A celery_config worker -l info
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/llmops
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    restart: always

volumes:
  postgres_data:
  redis_data:
```

> 容器化不是把代码塞到容器里就行，而是要把环境依赖也一起打包。Dockerfile里每一行都要想清楚为什么加。

---

## 12.2 Gunicorn + Nginx 反向代理配置

**Gunicorn启动配置**

```python
# gunicorn.conf.py
bind = "0.0.0.0:5000"
workers = 4
worker_class = "sync"
worker_connections = 1000
keepalive = 2
timeout = 60
graceful_timeout = 30
max_requests = 1000
max_requests_jitter = 50
preload_app = True
```

**Nginx配置**

```nginx
# nginx.conf
server {
    listen 80;
    server_name llmops.example.com;

    # 前端静态资源
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # 后端API转发
    location /api/v1/ {
        proxy_pass http://backend:5000/api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE流式响应特殊配置
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    # 开放API转发
    location /v1/ {
        proxy_pass http://backend:5000/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**SSL配置（HTTPS）**

```nginx
server {
    listen 443 ssl http2;
    server_name llmops.example.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://backend:5000;
        # ...
    }
}
```

---

## 12.3 CI/CD 流水线：GitHub Actions / GitLab CI

**GitHub Actions**

```yaml
# .github/workflows/deploy.yml
name: Deploy LLMOps

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-cov
      
      - name: Run tests
        run: |
          cd backend
          pytest --cov=app tests/

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile.backend
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/llmops-backend:latest
      
      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./frontend/Dockerfile.frontend
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/llmops-frontend:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/llmops
            docker-compose pull
            docker-compose up -d
            docker system prune -f
```

**GitLab CI（替代方案）**

```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_IMAGE: registry.gitlab.com/xxx/llmops

test_backend:
  stage: test
  image: python:3.11
  script:
    - cd backend
    - pip install -r requirements.txt
    - pytest tests/

build_images:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $DOCKER_IMAGE/backend:$CI_COMMIT_SHA ./backend
    - docker build -t $DOCKER_IMAGE/frontend:$CI_COMMIT_SHA ./frontend
    - docker push $DOCKER_IMAGE/backend:$CI_COMMIT_SHA
    - docker push $DOCKER_IMAGE/frontend:$CI_COMMIT_SHA
  only:
    - main

deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
  script:
    - ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST "cd /opt/llmops && docker-compose up -d"
  only:
    - main
```

---

## 12.4 环境变量管理

**.env.template**

```env
# Flask
FLASK_ENV=production
SECRET_KEY=your-super-secret-key

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/llmops

# Redis
REDIS_URL=redis://redis:6379/0

# OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_CALLBACK_URL=http://localhost:5000/api/v1/auth/github/callback

# Frontend
FRONTEND_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

**生产环境安全要点**

| 要点 | 说明 |
|------|------|
| 不要提交.env | 用.env.template和CI/CD secrets |
| 数据库密码加密 | 用vault或CI/CD secrets管理 |
| API Key不暴露 | 只存hash，不存明文 |
| 最小权限原则 | 容器只跑需要的权限 |
| 日志脱敏 | 不记录敏感信息 |

---

## 12.5 监控与日志

**基础健康检查**

```python
# routes/health.py
from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    })

@health_bp.route('/health/db', methods=['GET'])
def db_health_check():
    try:
        db.session.execute(text('SELECT 1'))
        return jsonify({"database": "healthy"})
    except Exception as e:
        return jsonify({"database": "unhealthy", "error": str(e)}), 500
```

**日志配置**

```python
# config/logging.py
import logging
from logging.handlers import RotatingFileHandler

def setup_logging(app):
    if not app.debug:
        file_handler = RotatingFileHandler(
            'logs/app.log', maxBytes=1024*1024*10, backupCount=10
        )
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(formatter)
        app.logger.addHandler(file_handler)
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| Docker后端 | Python slim镜像 + gunicorn |
| Docker前端 | 多阶段构建 + nginx |
| docker-compose | 后端+前端+Postgres+Redis+Celery |
| Nginx | 反向代理 + 静态缓存 + SSE支持 |
| CI/CD | GitHub Actions测试→构建→部署 |
| 环境变量 | .env.template + secrets |
| 监控日志 | 健康检查 + 日志轮转 |

---

觉得有用？收藏起来，下次直接照抄。

你的部署流程是怎样的？遇到过什么坑？评论区聊聊。

关注怕浪猫，下期我们做性能优化——数据库索引、缓存策略、并发处理、慢查询治理，让平台更稳更快。

系列进度 12/23

**下章预告：** 第13章性能优化——数据库索引、Redis缓存、连接池、慢查询治理，让LLMOps平台支撑万级并发。
