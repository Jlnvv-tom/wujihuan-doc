# 第3章 LLMOps 前端搭建与聊天机器人 API 对接

前后端联调了4遍才跑通，3个跨域坑我替你踩完了。

我是怕浪猫，上一章后端搞定了，这章搭前端。目标明确——用Vue3把聊天机器人的UI做出来，和后端API对接，实现一个完整的带UI的聊天机器人。

---

## 3.1 Node.js 环境搭建与开发工具配置

**Node.js版本选择**

| 版本 | 状态 | 推荐 |
|------|------|------|
| 16.x | EOL | 不推荐 |
| 18.x | LTS | 可用 |
| 20.x | LTS | 推荐 |
| 22.x | Current | 尝鲜 |

```bash
# 安装nvm（Node版本管理）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装Node.js 20
nvm install 20
nvm use 20

# 确认版本
node -v  # v20.x.x
npm -v   # 10.x.x
```

**Vue3项目初始化**

```bash
# 创建项目
npm create vite@latest frontend -- --template vue

cd frontend
npm install

# 安装核心依赖
npm install vue-router@4 pinia axios
npm install -D tailwindcss postcss autoprefixer

# 初始化TailwindCSS
npx tailwindcss init -p
```

**前端项目结构**

```
frontend/
├── src/
│   ├── App.vue
│   ├── main.js
│   ├── router/          # 路由配置
│   ├── stores/          # Pinia状态管理
│   ├── api/             # API请求封装
│   ├── views/           # 页面组件
│   ├── components/      # 通用组件
│   ├── assets/          # 静态资源
│   └── utils/           # 工具函数
├── public/
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 3.2 LLMOps 前端开发约定与规范

**组件命名规范**

| 类型 | 命名 | 示例 |
|------|------|------|
| 页面组件 | PascalCase | ChatView.vue |
| 通用组件 | PascalCase | MessageBubble.vue |
| 布局组件 | PascalCase + Layout | MainLayout.vue |
| 组合式函数 | camelCase + use | useChat.js |

**目录约定**

```javascript
// 路由: router/index.js
// 状态: stores/chat.js
// API: api/chat.js
// 页面: views/ChatView.vue
// 组件: components/MessageBubble.vue
```

**代码风格**

```javascript
// 使用Composition API + <script setup>
<script setup>
import { ref, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const inputMessage = ref('')

const sendMessage = async () => {
  if (!inputMessage.value.trim()) return
  await chatStore.sendMessage(inputMessage.value)
  inputMessage.value = ''
}
</script>
```

---

## 3.3 API 请求库、路由守卫、Pinia 数据共享与页面划分

**Axios封装**

```javascript
// api/request.js
import axios from 'axios'
import { useUserStore } from '@/stores/user'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器
request.interceptors.request.use(config => {
  const userStore = useUserStore()
  if (userStore.token) {
    config.headers.Authorization = `Bearer ${userStore.token}`
  }
  return config
})

// 响应拦截器
request.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      // 跳转登录
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default request
```

**API模块**

```javascript
// api/chat.js
import request from './request'

export const chatAPI = {
  // 获取对话列表
  getConversations: () => request.get('/chat/conversations'),
  
  // 创建对话
  createConversation: (title) => request.post('/chat/conversations', { title }),
  
  // 发送消息
  sendMessage: (data) => request.post('/chat/completions', data),
  
  // 获取历史消息
  getMessages: (convId) => request.get(`/chat/messages/${convId}`),
  
  // 删除对话
  deleteConversation: (id) => request.delete(`/chat/conversations/${id}`)
}
```

**路由配置**

```javascript
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', component: () => import('@/views/ChatView.vue') },
  { path: '/login', component: () => import('@/views/LoginView.vue') },
  { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFound.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
```

**Pinia状态管理**

```javascript
// stores/chat.js
import { defineStore } from 'pinia'
import { chatAPI } from '@/api/chat'

export const useChatStore = defineStore('chat', {
  state: () => ({
    conversations: [],
    currentConvId: null,
    messages: [],
    loading: false
  }),
  
  actions: {
    async loadConversations() {
      const res = await chatAPI.getConversations()
      this.conversations = res.data
    },
    
    async sendMessage(content) {
      this.loading = true
      try {
        // 添加用户消息到UI
        this.messages.push({ role: 'user', content })
        
        const res = await chatAPI.sendMessage({
          message: content,
          conversation_id: this.currentConvId
        })
        
        // 更新对话ID
        if (!this.currentConvId) {
          this.currentConvId = res.data.conversation_id
        }
        
        // 添加助手回复
        this.messages.push({ role: 'assistant', content: res.data.message })
      } finally {
        this.loading = false
      }
    }
  }
})
```

---

## 3.4 TailwindCSS 原子化 CSS 方案集成

**配置TailwindCSS**

```javascript
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#f0f9ff', 500: '#3b82f6', 700: '#1d4ed8' },
        dark: { 800: '#1e293b', 900: '#0f172a' }
      }
    }
  },
  plugins: []
}
```

```css
/* src/assets/main.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 自定义滚动条 */
.chat-scroll::-webkit-scrollbar { width: 4px; }
.chat-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
```

**聊天界面样式示例**

```html
<template>
  <div class="flex h-screen bg-dark-900">
    <!-- 侧边栏 -->
    <aside class="w-64 bg-dark-800 border-r border-gray-700">
      <div class="p-4">
        <button class="w-full py-2 px-4 bg-primary-500 text-white rounded-lg
                       hover:bg-primary-700 transition">
          新建对话
        </button>
      </div>
      <!-- 对话列表 -->
      <div class="overflow-y-auto chat-scroll">
        <div v-for="conv in conversations" :key="conv.id"
             class="px-4 py-3 text-gray-300 hover:bg-gray-700 cursor-pointer
                    truncate text-sm">
          {{ conv.title }}
        </div>
      </div>
    </aside>
    
    <!-- 主聊天区域 -->
    <main class="flex-1 flex flex-col">
      <!-- 消息列表 -->
      <div class="flex-1 overflow-y-auto p-6 chat-scroll">
        <MessageBubble v-for="msg in messages" :key="msg.id" :message="msg" />
      </div>
      
      <!-- 输入区域 -->
      <div class="p-4 border-t border-gray-700">
        <div class="flex gap-2">
          <input v-model="inputMessage" @keyup.enter="sendMessage"
                 class="flex-1 bg-dark-800 text-white rounded-lg px-4 py-2
                        border border-gray-600 focus:border-primary-500 outline-none"
                 placeholder="输入消息..." />
          <button @click="sendMessage"
                  class="px-6 py-2 bg-primary-500 text-white rounded-lg
                         hover:bg-primary-700 transition">
            发送
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
```

---

## 3.5 前后端联调：解决跨域问题的三种技巧

**跨域问题本质**

浏览器有同源策略：协议+域名+端口必须一致。前端跑在`localhost:5173`，后端跑在`localhost:5000`，跨域了。

**方案一：Flask-CORS（推荐）**

```python
# 后端配置
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

**方案二：Vite代理（开发环境）**

```javascript
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
```

前端请求直接用`/api/v1/...`，Vite自动代理到后端。

**方案三：Nginx反向代理（生产环境）**

```nginx
server {
    listen 80;
    server_name llmops.example.com;
    
    location / {
        root /var/www/frontend;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**三种方案对比**

| 方案 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| Flask-CORS | 全阶段 | 简单直接 | 需要后端配合 |
| Vite代理 | 开发环境 | 零配置前端 | 仅开发时有效 |
| Nginx代理 | 生产环境 | 统一入口 | 需要运维配置 |

> 开发用Vite代理，生产用Nginx代理，CORS作为兜底。三层防御，跨域不再是问题。

---

## 3.6 API 开发文档解读与公共服务抽取

**API文档规范**

后端API文档使用OpenAPI 3.0格式，可以用Flasger自动生成：

```python
# 后端：自动生成Swagger文档
from flasgger import Swagger

app = Flask(__name__)
Swagger(app, template={
    "info": {"title": "LLMOps API", "version": "1.0"}
})

@chat_bp.route('/completions', methods=['POST'])
def completions():
    """聊天补全接口
    ---
    tags: [Chat]
    parameters:
      - in: body
        name: body
        schema:
          properties:
            message: {type: string, required: true}
            conversation_id: {type: integer}
    responses:
      200:
        description: 成功
    """
    pass
```

**公共服务抽取**

```javascript
// utils/common.js

// 格式化时间
export const formatTime = (dateStr) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleDateString()
}

// Token计数格式化
export const formatTokens = (count) => {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

// 消息内容Markdown渲染
export const renderMarkdown = (content) => {
  // 使用markdown-it渲染
  return md.render(content)
}
```

---

## 3.7 对接后端 API 实现带 UI 的聊天机器人

**完整ChatView组件**

```vue
<!-- views/ChatView.vue -->
<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageBubble from '@/components/MessageBubble.vue'

const chatStore = useChatStore()
const inputMessage = ref('')
const chatContainer = ref(null)

onMounted(async () => {
  await chatStore.loadConversations()
})

const sendMessage = async () => {
  if (!inputMessage.value.trim() || chatStore.loading) return
  
  const msg = inputMessage.value
  inputMessage.value = ''
  
  await chatStore.sendMessage(msg)
  
  // 滚动到底部
  await nextTick()
  chatContainer.value?.scrollTo({
    top: chatContainer.value.scrollHeight,
    behavior: 'smooth'
  })
}

const selectConversation = async (id) => {
  chatStore.currentConvId = id
  await chatStore.loadMessages(id)
}

const createConversation = () => {
  chatStore.currentConvId = null
  chatStore.messages = []
}
</script>

<template>
  <div class="flex h-screen bg-gray-900 text-white">
    <!-- 侧边栏 -->
    <aside class="w-64 bg-gray-800 flex flex-col">
      <div class="p-4">
        <button @click="createConversation"
                class="w-full py-2 bg-blue-600 rounded hover:bg-blue-700">
          新建对话
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-for="conv in chatStore.conversations" :key="conv.id"
             @click="selectConversation(conv.id)"
             :class="['px-4 py-3 text-sm truncate cursor-pointer hover:bg-gray-700',
                      conv.id === chatStore.currentConvId ? 'bg-gray-700' : '']">
          {{ conv.title }}
        </div>
      </div>
    </aside>
    
    <!-- 主区域 -->
    <main class="flex-1 flex flex-col">
      <div ref="chatContainer" class="flex-1 overflow-y-auto p-6 space-y-4">
        <MessageBubble v-for="(msg, i) in chatStore.messages" :key="i"
                       :message="msg" />
        <div v-if="chatStore.loading" class="text-gray-400 text-sm">
          正在思考...
        </div>
      </div>
      
      <div class="p-4 border-t border-gray-700">
        <div class="flex gap-2 max-w-3xl mx-auto">
          <input v-model="inputMessage" @keyup.enter="sendMessage"
                 :disabled="chatStore.loading"
                 class="flex-1 bg-gray-800 rounded px-4 py-2 border border-gray-600
                        focus:border-blue-500 outline-none disabled:opacity-50"
                 placeholder="输入消息..." />
          <button @click="sendMessage" :disabled="chatStore.loading"
                  class="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700
                         disabled:opacity-50">
            发送
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
```

**MessageBubble组件**

```vue
<!-- components/MessageBubble.vue -->
<script setup>
defineProps({
  message: { type: Object, required: true }
})
</script>

<template>
  <div :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']">
    <div :class="['max-w-[70%] rounded-lg px-4 py-2',
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-100']">
      <div class="whitespace-pre-wrap" v-html="message.content"></div>
    </div>
  </div>
</template>
```

**联调检查清单**

| 检查项 | 预期结果 | 状态 |
|--------|---------|------|
| 前端启动 | localhost:5173可访问 | |
| 后端启动 | localhost:5000可访问 | |
| 跨域处理 | API请求无CORS错误 | |
| 新建对话 | 点击按钮清空消息 | |
| 发送消息 | 用户消息+AI回复显示 | |
| 对话列表 | 侧边栏显示历史对话 | |
| 切换对话 | 点击加载对应消息 | |
| 消息滚动 | 新消息自动滚到底部 | |
| Loading状态 | AI思考时显示加载提示 | |

> 第一版不需要完美，但必须跑通。从用户输入到AI回复的完整链路通了，后面加记忆、加RAG、加工具，都是在这个基础上叠的能力。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 环境搭建 | Node.js 20 + Vite + Vue3 |
| 项目规范 | Composition API + script setup |
| 状态管理 | Pinia + 模块化Store |
| 路由 | Vue Router + 守卫 |
| 样式 | TailwindCSS原子化 |
| 跨域 | 开发Vite代理 / 生产Nginx代理 |
| 联调 | ChatView + MessageBubble完整组件 |

---

觉得有用？收藏起来，下次直接照抄。

前后端联调你踩过什么坑？评论区说说。

关注怕浪猫，下期我们给聊天机器人加记忆——让它真正"记住"你说过的话。

系列进度 3/23

**下章预告：** 第4章进入记忆模块开发——LLM上下文窗口、LangChain Memory组件、对话持久化，让聊天机器人不再"金鱼脑"。
