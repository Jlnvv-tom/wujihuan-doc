# Electron 开发实战（八）：多媒体处理全解｜音视频播放、录屏、FFmpeg 实战

大家好，本章是 Electron 实战系列第八章。前面我们掌握了网络通信、本地文件存储、系统原生交互，已经可以开发常规桌面工具类应用。而**多媒体处理**是进阶桌面应用的核心能力，适用于播放器、录屏工具、会议客户端、音频剪辑、媒体格式转换等商用项目。

Electron 依托 Chromium 内核 \+ Node\.js 生态，天然支持音视频解码、设备调用、屏幕捕获，同时可无缝集成 FFmpeg 实现专业级媒体编辑，是跨平台多媒体桌面应用的最优技术方案。

本章从零落地五大核心能力：音视频基础播放、录音录像、屏幕共享捕获、FFmpeg 媒体处理、媒体元数据读写，所有代码精简可复用，适配 Windows/Mac 跨平台，规避常见兼容性坑。

参考前置：[Electron 屏幕捕获官方文档](https://www.electronjs.org/zh/docs/latest/api/desktop-capturer)、[掘金 FFmpeg 实战指南](https://juejin.cn/post/7634367613500162090)、[Electron 媒体权限官方规范](https://www.electronjs.org/zh/docs/latest/api/system-preferences)

## 8\.1 音视频播放基础

Electron 渲染进程完全兼容 HTML5 原生 `\&lt;audio\&gt;`、`\&lt;video\&gt;` 标签，支持绝大多数主流媒体格式（MP4、MP3、WebM、WAV 等），无需额外解码库，开箱即用，满足日常播放需求。

### 8\.1\.1 基础播放实现

零依赖实现本地/网络音视频播放，支持暂停、进度调节、音量控制、循环播放：

```html
<!-- 音频播放 -->
<audio id="audioPlayer" controls loop>
  <source src="./test.mp3" type="audio/mpeg">
</audio>

<!-- 视频播放 -->
<video id="videoPlayer" controls width="800">
  <source src="./test.mp4" type="video/mp4">
</video>
```

### 8\.1\.2 JS 动态控制播放

通过 JS 精细化控制播放逻辑，适配自定义播放器 UI 场景：

```javascript
// 获取播放器实例
const video = document.getElementById('videoPlayer')

// 播放、暂停
video.play()
video.pause()

// 音量控制 0-1
video.volume = 0.8

// 跳转播放进度（秒）
video.currentTime = 30

// 播放结束监听
video.onended = () => console.log('视频播放完成')

```

### 8\.1\.3 Electron 专属播放优势

- 支持**本地绝对路径媒体文件**，不受浏览器跨域和路径限制

- 可结合文件对话框，实现用户自选本地媒体文件播放

- 支持后台播放、窗口置顶播放，体验优于网页端

### 8\.1\.4 格式兼容说明

Chromium 内核默认不支持 FLV、AVI、MKV 等非主流格式，如需播放需集成 FFmpeg 解码能力，对应本章 8\.4 小节内容。

## 8\.2 录音与录像功能实现

Electron 可直接调用系统麦克风、摄像头设备，基于 WebRTC 实现**音频录制、视频录制、本地保存**，无需依赖第三方 SDK，适配录音工具、会议录制、视频拍摄场景。

引用来源：[Electron 媒体设备权限规范](https://www.electronjs.org/zh/docs/latest/api/system-preferences)

### 8\.2\.1 权限前置配置

Mac 系统必须主动申请媒体设备权限，否则录制功能失效，Windows 无需额外配置：

```javascript
// main.js 主进程
const { systemPreferences } = require('electron')
// Mac 申请麦克风、摄像头权限
if (process.platform === 'darwin') {
  systemPreferences.askForMediaAccess('microphone')
  systemPreferences.askForMediaAccess('camera')
}

```

### 8\.2\.2 音频录音极简实现

```javascript
let mediaRecorder = null
let audioChunks = []

// 开始录音
async function startRecordAudio() {
  // 获取麦克风媒体流
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  mediaRecorder = new MediaRecorder(stream)
  audioChunks = []

  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data)
  mediaRecorder.onstop = saveAudioFile
  mediaRecorder.start()
}

// 停止录音并保存
function saveAudioFile() {
  const blob = new Blob(audioChunks, { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  // 可结合fs模块保存到本地
  const a = document.createElement('a')
  a.href = url
  a.download = `record-${Date.now()}.wav`
  a.click()
}

```

### 8\.2\.3 摄像头录像实现

```javascript
async function startRecordVideo() {
  // 获取摄像头+麦克风数据流
  const stream = await navigator.mediaDevices.getUserMedia({ 
    video: true, 
    audio: true 
  })
  // 页面预览摄像头画面
  document.querySelector('video').srcObject = stream

  mediaRecorder = new MediaRecorder(stream)
  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data)
  mediaRecorder.onstop = () => {
    const blob = new Blob(audioChunks, { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `video-${Date.now()}.mp4`
    a.click()
  }
  mediaRecorder.start()
}

```

### 8\.2\.4 停止录制通用方法

```javascript
function stopRecord() {
  if (mediaRecorder) mediaRecorder.stop()
}

```

## 8\.3 屏幕共享与捕获

屏幕捕获是桌面端独有核心能力，Electron 内置 `desktopCapturer` 模块，支持**全屏捕获、指定窗口捕获、屏幕共享推流**，适配录屏工具、远程协助、会议屏幕共享、直播推流场景。

引用来源：[Electron desktopCapturer 官方 API](https://www.electronjs.org/zh/docs/latest/api/desktop-capturer)

### 8\.3\.1 获取屏幕/窗口源列表

获取所有可捕获的屏幕、应用窗口，实现用户手动选择捕获目标：

```javascript
const { desktopCapturer } = require('electron')

// 获取所有捕获源
async function getCaptureSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'], // 捕获屏幕+窗口
    thumbnailSize: { width: 1920, height: 1080 } // 缩略图分辨率
  })
  return sources
}

```

### 8\.3\.2 全屏屏幕录制

```javascript
async function startScreenRecord() {
  const sources = await getCaptureSources()
  // 选取主屏
  const screenSource = sources.find(item => item.name === '整个屏幕')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: screenSource.id
      }
    }
  })
  // 页面预览屏幕画面
  document.querySelector('video').srcObject = stream
}

```

### 8\.3\.3 屏幕共享最佳实践

- 优先捕获指定窗口，减少画面范围、降低资源占用

- 录制时关闭不必要的后台进程，避免音画卡顿

- 结合 MediaRecorder 实现录屏保存，结合 WebSocket 实现实时屏幕共享推流

## 8\.4 使用FFmpeg处理媒体文件

原生 Electron 仅支持基础播放、录制能力，无法实现**格式转换、视频裁剪、分辨率压缩、码率调整、异常格式解码**等专业操作。**FFmpeg 作为多媒体瑞士军刀**，可完美补齐 Electron 媒体处理短板，是商用多媒体桌面应用的必备方案 。

引用来源：[掘金 FFmpeg 音视频处理实战](https://juejin.cn/post/7634367613500162090)

### 8\.4\.1 环境部署

使用 `fluent\-ffmpeg` 封装库，简化 Node\.js 调用 FFmpeg 命令：

```bash
# 安装依赖
npm install fluent-ffmpeg --save

```

环境要求：项目打包时内置 FFmpeg 二进制文件，避免用户电脑未配置环境变量导致功能失效。

### 8\.4\.2 常用媒体处理实战代码

基于 FFmpeg 实现 3 个高频商用功能，代码极简可直接复用：

#### 1\. 视频格式转换（MP4 → WebM）

```javascript
const ffmpeg = require('fluent-ffmpeg')

// 格式转换
ffmpeg('./input.mp4')
  .output('./output.webm')
  .on('end', () => console.log('格式转换完成'))
  .on('error', (err) => console.error('转换失败：', err))
  .run()

```

#### 2\. 视频裁剪（截取指定时间段）

```javascript
// 从第10秒开始，截取10秒视频
ffmpeg('./input.mp4')
  .setStartTime(10)
  .setDuration(10)
  .output('./clip.mp4')
  .run()

```

#### 3\. 视频分辨率压缩

```javascript
// 压缩为720P分辨率，无损音频
ffmpeg('./input.mp4')
  .videoFilters('scale=1280:720')
  .audioCodec('copy')
  .output('./720p-output.mp4')
  .run()

```

### 8\.4\.3 跨平台打包适配

开发环境需本地安装 FFmpeg，生产打包需将 ffmpeg\.exe / 可执行文件打包进应用资源，通过代码指定二进制路径，保证用户端正常使用。

```javascript
// 绑定打包后的ffmpeg路径
const path = require('path')
ffmpeg.setFfmpegPath(path.join(__dirname, './ffmpeg.exe'))

```

## 8\.5 媒体元数据读取与编辑

媒体元数据包含**时长、分辨率、码率、帧率、作者、创建时间、标题**等信息，常用于媒体库管理、文件筛选、信息展示场景。本节使用 `music\-metadata` 库实现元数据读写，轻量高效、适配所有主流媒体格式。

### 8\.5\.1 安装依赖

```bash
npm install music-metadata --save

```

### 8\.5\.2 读取媒体元数据

```javascript
const fs = require('fs')
const mm = require('music-metadata')

async function getMediaMeta(filePath) {
  const stream = fs.createReadStream(filePath)
  const meta = await mm.parseStream(stream)
  // 核心媒体信息
  console.log('时长：', meta.format.duration)
  console.log('分辨率：', meta.format.video.resolution)
  console.log('帧率：', meta.format.fps)
  console.log('编码格式：', meta.format.codec)
  return meta
}

```

### 8\.5\.3 媒体信息编辑与重写

支持修改媒体标题、作者、专辑、备注等自定义元数据：

```javascript
async function updateMediaMeta(filePath) {
  const meta = await getMediaMeta(filePath)
  // 自定义修改信息
  meta.common.title = 'Electron测试视频'
  meta.common.artist = '开发者'
  // 重写元数据
  await mm.save(filePath, meta)
}

```

### 8\.5\.4 业务场景落地

- 媒体库自动分类：根据时长、分辨率、格式筛选文件

- 自定义媒体信息：批量修改视频/音频标题、作者信息

- 媒体参数校验：过滤损坏、分辨率异常的媒体文件

## 本章总结

本章全覆盖 Electron 多媒体开发核心能力，从原生基础功能到专业 FFmpeg 处理方案，补齐桌面多媒体应用开发短板，核心知识点复盘：

1. 掌握 HTML5 原生音视频播放、JS 精细化控制，适配基础媒体播放场景

2. 实现麦克风录音、摄像头录像、本地文件保存，兼容 Windows/Mac 权限适配

3. 熟练使用 desktopCapturer 实现屏幕捕获、窗口录制、屏幕共享核心能力

4. 基于 FFmpeg 实现媒体格式转换、裁剪、压缩，落地专业级媒体编辑功能

5. 掌握媒体元数据读取与编辑，实现媒体库管理、参数校验、批量处理功能

结合本章内容，可独立开发**桌面播放器、录屏工具、音频剪辑软件、会议共享客户端、媒体资源管理器**等商用级多媒体应用。

## 参考来源

\[1\] Electron 官方文档：desktopCapturer 屏幕捕获 [https://www\.electronjs\.org/zh/docs/latest/api/desktop\-capturer](https://www.electronjs.org/zh/docs/latest/api/desktop-capturer)

\[2\] Electron 官方文档：媒体设备权限配置 [https://www\.electronjs\.org/zh/docs/latest/api/system\-preferences](https://www.electronjs.org/zh/docs/latest/api/system-preferences)

\[3\] 掘金技术博文：FFmpeg 音视频处理实战全解 [https://juejin\.cn/post/7634367613500162090](https://juejin.cn/post/7634367613500162090)

\[4\] CSDN 技术教程：FFmpeg 常用媒体处理命令 [https://blog\.csdn\.net/kaifazhexiaobai/article/details/160969752](https://blog.csdn.net/kaifazhexiaobai/article/details/160969752)

\[5\] 掘金技术博文：Electron 多媒体桌面应用开发指南 [https://juejin\.cn/post/7541319717664047158](https://juejin.cn/post/7541319717664047158)


