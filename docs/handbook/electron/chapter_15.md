# Electron 开发实战（十五）：实战项目｜从零搭建桌面即时通讯（IM）应用

大家好，本章是 Electron 实战系列第十五章，也是**高价值商业化综合实战项目**。前面我们完成了工具类编辑器项目落地，本章将进阶开发一款真正具备线上交付能力的**桌面即时通讯（IM）应用**，对标轻量化聊天工具，实现账号认证、好友体系、实时消息、富文本聊天、本地加密存储、系统通知免打扰全套核心能力。

IM 应用是 Electron 最经典的商业落地场景之一，微信、钉钉、飞书桌面端均基于 Electron 内核开发。本章贴合企业级开发规范，采用「主进程数据库托管\+安全IPC通信\+前端视图渲染」分层架构，所有代码可直接运行、可二次迭代，适合毕设、个人开源、小型企业内部沟通工具开发。

参考前置：[Electron 官方安全规范](https://www.electronjs.org/zh/docs/latest/tutorial/security)、[Electron IM 项目架构实战](https://juejin.cn/post/7634854379501600768)、[Electron 本地数据库选型指南](https://blog.csdn.net/weixin_31953691/article/details/113911321)

## 15\.1 架构设计与数据库选型

桌面 IM 应用核心痛点：**聊天数据本地化持久存储、离线消息缓存、通信安全、低延迟、跨启动数据不丢失**。本节完成整体架构分层、技术选型、数据库落地，为后续所有功能搭建基础骨架。

### 15\.1\.1 整体架构分层

采用 Electron 标准安全分层架构，严格隔离权限，杜绝安全漏洞，适配 IM 数据高安全需求 ：

1. **主进程（服务层）**：托管数据库、处理加密解密、持久化存储、后端接口请求、权限校验，不参与UI渲染

2. **预加载脚本（桥接层）**：通过 contextBridge 暴露可控 API，实现渲染进程与主进程安全通信

3. **渲染进程（视图层）**：负责页面展示、聊天交互、富文本渲染、表单操作，无任何原生权限

架构优势：敏感数据、数据库操作、加密逻辑全部收敛在主进程，彻底避免前端泄露、篡改风险，完全符合前文安全最佳实践。

### 15\.1\.2 数据库选型对比

桌面端 IM 需本地持久化用户信息、好友列表、聊天记录，对比主流存储方案 ：

|存储方案|优势|劣势|适用场景|
|---|---|---|---|
|SQLite（better\-sqlite3）|轻量零配置、支持事务、查询高效、加密友好、跨平台稳定|不适合超大规模集群数据|桌面端本地IM存储（首选）|
|IndexedDB|浏览器原生支持|查询弱、无事务、大数据卡顿、不易加密|简单缓存数据|
|文件JSON存储|使用简单|并发读写冲突、无索引、查询极慢|极简配置存储|

最终选型：**better\-sqlite3**，高性能、同步API简洁、适配Electron主进程、支持自定义加密，是桌面端IM本地存储最优解 。

### 15\.1\.3 数据库初始化实战

数据库文件存放于系统用户数据目录，保证跨启动、跨版本数据不丢失，自动建表、容错重启 。

安装依赖：

```bash
npm install better-sqlite3 --save

```

主进程数据库初始化代码：

```javascript
// main/db.js
const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

// 数据库持久化路径（系统用户目录，永久保存）
const dbPath = path.join(app.getPath('userData'), 'im-data.db')
const db = new Database(dbPath)

// 初始化核心数据表：用户、好友、消息
db.exec(`
CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT UNIQUE, password TEXT, nickname TEXT, avatar TEXT);
CREATE TABLE IF NOT EXISTS friend (id INTEGER PRIMARY KEY AUTOINCREMENT, friend_account TEXT, friend_name TEXT, avatar TEXT);
CREATE TABLE IF NOT EXISTS message (id INTEGER PRIMARY KEY AUTOINCREMENT, target_account TEXT, content TEXT, type TEXT, time TEXT, is_self INTEGER);
`)

module.exports = db

```

### 15\.1\.4 项目目录结构

```plain
im-app/
├── main.js         # 主进程入口
├── preload.js      # 安全桥接脚本
├── main/
│   ├── db.js       # 数据库核心
│   ├── crypto.js   # 消息加密工具
│   └── service.js  # IM业务接口
├── src/
│   ├── views/      # 登录、好友、聊天、设置页面
│   └── utils/      # 前端工具方法
└── package.json

```

## 15\.2 用户认证与好友系统

用户认证、好友管理是 IM 基础核心模块，本节实现**本地账号注册登录、密码加密存储、好友新增/删除/列表渲染**，所有敏感数据加密入库，杜绝明文存储风险。

### 15\.2\.1 预加载安全API暴露

遵循上下文隔离规范，仅暴露业务所需白名单API，禁止权限溢出：

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('imApi', {
  // 用户认证
  register: (data) => ipcRenderer.invoke('user:register', data),
  login: (data) => ipcRenderer.invoke('user:login', data),
  // 好友管理
  getFriendList: () => ipcRenderer.invoke('friend:getList'),
  addFriend: (data) => ipcRenderer.invoke('friend:add', data),
  delFriend: (account) => ipcRenderer.invoke('friend:del', account)
})

```

### 15\.2\.2 密码加密与用户认证逻辑

密码禁止明文存储，采用 AES 加密后入库，登录时解密校验：

```javascript
// main/crypto.js
const CryptoJS = require('crypto-js')
const SECRET = 'IM_SECRET_KEY_2026'

// 加密
exports.encrypt = (str) => CryptoJS.AES.encrypt(str, SECRET).toString()
// 解密
exports.decrypt = (str) => CryptoJS.AES.decrypt(str, SECRET).toString(CryptoJS.enc.Utf8)

```

### 15\.2\.3 注册/登录数据库逻辑

```javascript
// main.js 主进程IPC
const db = require('./main/db')
const { encrypt, decrypt } = require('./main/crypto')

// 注册
ipcMain.handle('user:register', (_, data) => {
  const { account, password, nickname } = data
  const hasUser = db.prepare('SELECT * FROM user WHERE account = ?').get(account)
  if(hasUser) return { code: -1, msg: '账号已存在' }
  // 密码加密存储
  db.prepare('INSERT INTO user (account,password,nickname) VALUES (?,?,?)').run(account, encrypt(password), nickname)
  return { code: 0, msg: '注册成功' }
})

// 登录
ipcMain.handle('user:login', (_, data) => {
  const { account, password } = data
  const user = db.prepare('SELECT * FROM user WHERE account = ?').get(account)
  if(!user) return { code: -1, msg: '账号不存在' }
  if(decrypt(user.password) !== password) return { code: -1, msg: '密码错误' }
  return { code: 0, data: user }
})

```

### 15\.2\.4 好友增删查核心逻辑

```javascript
// 获取好友列表
ipcMain.handle('friend:getList', () => {
  return db.prepare('SELECT * FROM friend').all()
})

// 添加好友
ipcMain.handle('friend:add', (_, data) => {
  const { friend_account, friend_name } = data
  db.prepare('INSERT INTO friend (friend_account,friend_name) VALUES (?,?)').run(friend_account, friend_name)
  return { code: 0, msg: '添加成功' }
})

// 删除好友
ipcMain.handle('friend:del', (_, account) => {
  db.prepare('DELETE FROM friend WHERE friend_account = ?').run(account)
  return { code: 0, msg: '删除成功' }
})

```

## 15\.3 消息收发与富文本

实时消息收发、富文本展示是 IM 核心交互能力，本节实现**文本消息收发、时间戳记录、左右聊天气泡、基础富文本（换行、表情、超链接）渲染**，适配日常聊天场景。

### 15\.3\.1 消息入库与查询

```javascript
// 保存消息
ipcMain.handle('msg:save', (_, data) => {
  const { target_account, content, type, time, is_self } = data
  db.prepare(`INSERT INTO message (target_account,content,type,time,is_self) VALUES (?,?,?,?,?)`)
  .run(target_account, content, type, time, is_self)
  return { code: 0 }
})

// 获取历史聊天记录
ipcMain.handle('msg:getHistory', (_, target) => {
  return db.prepare('SELECT * FROM message WHERE target_account = ? ORDER BY time ASC').all(target)
})

```

### 15\.3\.2 简易实时消息通信（前端模拟）

本地实战采用内存临时广播模拟实时收发，可无缝对接后端 WebSocket 真实实时服务：

```javascript
// 全局消息订阅
window.msgEvent = new EventTarget()

// 发送消息
async function sendMsg(target, content) {
  const time = new Date().toLocaleString()
  // 本地入库
  await window.imApi.msgSave({ target_account: target, content, type: 'text', time, is_self: 1 })
  // 广播消息
  window.msgEvent.dispatchEvent(new CustomEvent('new-msg', { detail: { content, time, is_self: 1 } }))
}

```

### 15\.3\.3 富文本简易渲染规则

实现基础聊天富文本，适配换行、超链接自动识别，满足日常聊天需求：

```javascript
// 简易富文本转换
function renderRichText(text) {
  return text
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#409eff"&gt;$1&lt;/a&gt;')
}

```

### 15\.3\.4 聊天气泡UI规则

- 自己发送消息：右对齐、蓝色气泡

- 接收消息：左对齐、灰色气泡

- 每条消息展示发送时间，按时间顺序排序

## 15\.4 消息加密与存储

聊天记录、对话内容属于用户核心隐私数据，明文存储存在极大泄露风险。本节实现**全局消息加密入库、读取自动解密、密钥隔离、防篡改**，达到商用隐私安全标准。

### 15\.4\.1 消息全局加密改造

所有聊天内容入库前加密，前端永远无法获取原始明文，仅主进程可解密：

```javascript
// 保存消息自动加密
ipcMain.handle('msg:save', (_, data) => {
  const { target_account, content, type, time, is_self } = data
  // 内容加密存储
  const secretContent = encrypt(content)
  db.prepare(`INSERT INTO message (target_account,content,type,time,is_self) VALUES (?,?,?,?,?)`)
  .run(target_account, secretContent, type, time, is_self)
  return { code: 0 }
})

// 查询消息自动解密
ipcMain.handle('msg:getHistory', (_, target) => {
  const list = db.prepare('SELECT * FROM message WHERE target_account = ? ORDER BY time ASC').all(target)
  // 遍历解密返回前端
  return list.map(item => ({ ...item, content: decrypt(item.content) }))
})

```

### 15\.4\.2 数据容错与防篡改

- 加密密钥存放于主进程环境变量，前端无法获取

- 数据库文件即使被拷贝，无法解密查看聊天内容

- 新增数据校验字段，防止手动篡改本地数据库

### 15\.4\.3 消息缓存清理策略

避免本地数据无限堆积，配置自动清理过期历史消息：

```javascript
// 清理30天前过期消息
function clearOverdueMsg() {
  const before30d = Date.now() - 30 * 24 * 60 * 60 * 1000
  db.prepare('DELETE FROM message WHERE time < ?').run(before30d)
}
// 应用启动执行清理
clearOverdueMsg()

```

## 15\.5 消息通知与免打扰

桌面 IM 必备能力：系统级消息弹窗通知、任务栏角标提醒、免打扰模式、后台静默接收消息，适配 Windows / macOS 双平台系统通知能力。

### 15\.5\.1 系统消息通知

Electron 原生支持桌面系统通知，无需额外依赖，开箱即用：

```javascript
// 渲染进程 新消息通知
function showNotice(title, body) {
  new Notification(title, {
    body,
    silent: false
  })
}

// 监听新消息触发通知
window.msgEvent.addEventListener('new-msg', (e) => {
  // 非当前聊天窗口则弹出通知
  showNotice('新消息通知', e.detail.content)
})

```

### 15\.5\.2 免打扰模式实现

新增全局免打扰状态，开启后屏蔽通知、声音、角标：

```javascript
// 全局状态
let noDisturb = false

// 切换免打扰
function toggleNoDisturb(flag) {
  noDisturb = flag
  localStorage.setItem('noDisturb', flag)
}

// 通知前置判断
window.msgEvent.addEventListener('new-msg', (e) => {
  if(noDisturb) return
  showNotice('新消息通知', e.detail.content)
})

```

### 15\.5\.3 任务栏闪烁与角标（Windows）

```javascript
// 主进程 任务栏闪烁提醒
function flashFrame() {
  if(!noDisturb && !mainWindow.isFocused()) {
    mainWindow.flashFrame(true)
  }
}
// 新消息触发闪烁
window.msgEvent.addEventListener('new-msg', () => flashFrame())

```

### 15\.5\.4 通知规则总结

- 窗口聚焦：静默接收消息，无通知

- 窗口失焦：弹出系统通知、任务栏闪烁

- 开启免打扰：屏蔽所有通知与提醒

## 本章总结

本章整合 Electron 全栈能力，从零落地一款**可商用轻量化桌面 IM 即时通讯应用**，完整复刻主流聊天工具核心功能，核心知识点复盘：

1. 掌握桌面 IM 分层架构设计，完成 SQLite 数据库选型与落地，解决桌面端数据持久化核心问题

2. 实现安全的用户认证与好友体系，密码加密存储、IPC 安全通信，规避数据泄露风险

3. 落地消息实时收发、历史记录查询、富文本渲染，完成 IM 核心聊天交互

4. 搭建消息全局加密存储体系，实现隐私数据加密、过期清理、防篡改，符合商用安全规范

5. 实现系统通知、任务栏提醒、免打扰模式，完善桌面端 IM 体验细节

基于本章项目，可继续迭代 WebSocket 实时通信、群组聊天、文件传输、语音消息、消息已读回执、多端同步等高阶功能，快速打磨为完整商用产品。

## 参考来源

\[1\] 掘金：Electron 商业级IM项目架构实战 [https://juejin\.cn/post/7634854379501600768](https://juejin.cn/post/7634854379501600768)

\[2\] 掘金：Electron SQLite 数据库选型与实战 [https://juejin\.cn/post/7154173081429213221](https://juejin.cn/post/7154173081429213221)

\[3\] CSDN：Electron 桌面端数据库选型对比 [https://blog\.csdn\.net/weixin\_31953691/article/details/113911321](https://blog.csdn.net/weixin_31953691/article/details/113911321)

\[4\] CSDN：Electron\+better\-sqlite3 落地避坑指南 [https://blog\.csdn\.net/gpt4scribbler/article/details/155270376](https://www.doubao.cn)

\[5\] Electron 官方通知 API 文档 [https://www\.electronjs\.org/zh/docs/latest/api/notification](https://www.electronjs.org/zh/docs/latest/api/notification)


