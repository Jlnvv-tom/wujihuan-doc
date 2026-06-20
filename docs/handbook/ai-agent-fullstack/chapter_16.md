# 第16章 业务能力提升：支持多模态输入

只支持文本输入的AI平台，已经跟不上时代了。语音、图片、PDF、Excel，都得能处理。

我是怕浪猫，这章做业务能力提升。语音转文字、图片理解、PDF处理、大文件上传，让你的LLMOps平台从纯文本扩展到多模态。

---

## 16.1 语音转文字（STT）

**STT方案对比**

| 方案 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| OpenAI Whisper API | 精度高、多语言 | 付费、有延迟 | 生产环境 |
| 本地Whisper | 免费、隐私 | 需要GPU、慢 | 内网部署 |
| 阿里云一句话识别 | 中文优化、便宜 | 需要阿里云账号 | 中文场景 |
| 腾讯云语音识别 | 中文优化、稳定 | 需要腾讯云账号 | 中文场景 |

**OpenAI Whisper API接入**

```python
# services/stt_service.py
from openai import OpenAI
import io

class STTService:
    def __init__(self, api_key):
        self.client = OpenAI(api_key=api_key)
    
    def transcribe(self, audio_file_path, language=None):
        """语音转文字"""
        with open(audio_file_path, 'rb') as f:
            transcript = self.client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language=language,  # 可选：zh（中文）、en（英文）
                response_format="text"
            )
        return transcript
    
    def transcribe_stream(self, audio_stream, language=None):
        """流式语音转文字（实时）"""
        # 将音频流保存到临时文件
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp.write(audio_stream.read())
            tmp_path = tmp.name
        
        try:
            result = self.transcribe(tmp_path, language)
            return result
        finally:
            os.unlink(tmp_path)
```

**前端录音并上传**

```javascript
// utils/recorder.js
class AudioRecorder {
  constructor() {
    this.mediaRecorder = null
    this.audioChunks = []
  }
  
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.mediaRecorder = new MediaRecorder(stream)
    this.audioChunks = []
    
    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data)
    }
    
    this.mediaRecorder.start()
  }
  
  async stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' })
        resolve(audioBlob)
      }
      this.mediaRecorder.stop()
    })
  }
}

// 在ChatView中使用
const recorder = ref(null)
const isRecording = ref(false)

const startRecording = async () => {
  recorder.value = new AudioRecorder()
  await recorder.value.start()
  isRecording.value = true
}

const stopRecording = async () => {
  const audioBlob = await recorder.value.stop()
  isRecording.value = false
  
  // 上传到后端
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.wav')
  
  const res = await chatAPI.uploadAudio(formData)
  const text = res.data.text
  
  // 自动填入输入框
  userInput.value = text
}
```

---

## 16.2 图片理解（多模态LLM）

**多模态LLM对比**

| 模型 | 图片理解 | 成本 | 速度 |
|------|---------|------|------|
| GPT-4V / GPT-4o | 强 | 高 | 中 |
| Claude 3 Opus | 强 | 高 | 慢 |
| Gemini Pro Vision | 中 | 低 | 快 |
| Qwen-VL-Plus | 中 | 低 | 快 |

**OpenAI Vision API接入**

```python
# services/vision_service.py
from openai import OpenAI
import base64

class VisionService:
    def __init__(self, api_key):
        self.client = OpenAI(api_key=api_key)
    
    def describe_image(self, image_path, prompt="请描述这张图片"):
        """图片理解"""
        # 读取图片并转为base64
        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_data}"
                        }
                    }
                ]
            }]
        )
        return response.choices[0].message.content
    
    def describe_image_url(self, image_url, prompt="请描述这张图片"):
        """通过URL理解图片"""
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url}
                    }
                ]
            }]
        )
        return response.choices[0].message.content
```

**图片上传API**

```python
# routes/upload.py
upload_bp = Blueprint('upload', __name__)

# 配置上传
UPLOAD_FOLDER = 'uploads/images'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@upload_bp.route('/image', methods=['POST'])
@token_required
def upload_image():
    if 'file' not in request.files:
        return error("没有文件")
    
    file = request.files['file']
    if file.filename == '':
        return error("没有选择文件")
    
    if not allowed_file(file.filename):
        return error("不支持的文件格式")
    
    # 检查文件大小
    file.seek(0, 2)  # 移动到文件末尾
    file_size = file.tell()
    file.seek(0)  # 重置到开头
    
    if file_size > MAX_FILE_SIZE:
        return error("文件大小超过10MB")
    
    # 保存文件
    filename = f"{uuid.uuid4().hex}.{file.filename.rsplit('.', 1)[1].lower()}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    
    # 返回可访问的URL
    image_url = f"/uploads/images/{filename}"
    
    return success(data={
        'filename': filename,
        'url': image_url,
        'size': file_size
    })
```

---

## 16.3 PDF文档处理

**PDF处理方案对比**

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| PyPDF2 | 纯Python、轻量 | 复杂PDF解析差 | 简单PDF |
| pdfplumber | 表格提取好 | 速度慢 | 含表格的PDF |
| PyMuPDF | 速度快、功能全 | 安装复杂 | 生产环境 |
| Unstructured | 智能分块 | 依赖多 | RAG场景 |

**PyMuPDF实现PDF解析**

```python
# services/document_processor.py
import fitz  # PyMuPDF
import re

class PDFProcessor:
    def __init__(self):
        self.max_pages = 100  # 最大解析页数
    
    def extract_text(self, pdf_path):
        """提取PDF文本"""
        doc = fitz.open(pdf_path)
        text_by_page = []
        
        for page_num in range(min(len(doc), self.max_pages)):
            page = doc[page_num]
            text = page.get_text()
            text_by_page.append({
                'page_num': page_num + 1,
                'text': text
            })
        
        doc.close()
        return text_by_page
    
    def extract_images(self, pdf_path, output_dir):
        """提取PDF中的图片"""
        doc = fitz.open(pdf_path)
        image_count = 0
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images(full=True)
            
            for img_index, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                image_filename = f"page{page_num+1}_img{img_index+1}.{image_ext}"
                image_path = os.path.join(output_dir, image_filename)
                
                with open(image_path, 'wb') as img_file:
                    img_file.write(image_bytes)
                
                image_count += 1
        
        doc.close()
        return image_count
    
    def extract_tables(self, pdf_path):
        """提取PDF中的表格（需要pdfplumber）"""
        import pdfplumber
        
        tables_by_page = []
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables:
                    tables_by_page.append({
                        'page_num': page_num + 1,
                        'tables': tables
                    })
        
        return tables_by_page
```

**PDF分块策略**

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

class PDFChunker:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", "。", "，", " "]
        )
    
    def chunk_pdf(self, pdf_path):
        """将PDF分块"""
        processor = PDFProcessor()
        pages = processor.extract_text(pdf_path)
        
        chunks = []
        for page_data in pages:
            page_text = page_data['text']
            page_num = page_data['page_num']
            
            # 分块
            text_chunks = self.text_splitter.split_text(page_text)
            
            for i, chunk_text in enumerate(text_chunks):
                chunks.append({
                    'content': chunk_text,
                    'metadata': {
                        'source': pdf_path,
                        'page': page_num,
                        'chunk_id': i
                    }
                })
        
        return chunks
```

---

## 16.4 Excel/CSV数据处理

**表格数据提取**

```python
# services/spreadsheet_processor.py
import pandas as pd
import openpyxl

class SpreadsheetProcessor:
    def extract_from_excel(self, file_path, sheet_name=None):
        """从Excel提取数据"""
        if sheet_name:
            df = pd.read_excel(file_path, sheet_name=sheet_name)
        else:
            # 读取所有sheet
            xl = pd.ExcelFile(file_path)
            dfs = []
            for sheet in xl.sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet)
                df['_sheet_name'] = sheet
                dfs.append(df)
            df = pd.concat(dfs, ignore_index=True)
        
        return df.to_dict('records')
    
    def extract_from_csv(self, file_path, encoding='utf-8'):
        """从CSV提取数据"""
        try:
            df = pd.read_csv(file_path, encoding=encoding)
        except UnicodeDecodeError:
            # 尝试其他编码
            df = pd.read_csv(file_path, encoding='gbk')
        
        return df.to_dict('records')
    
    def summarize_data(self, records):
        """生成数据摘要（喂给LLM）"""
        if not records:
            return "空数据集"
        
        df = pd.DataFrame(records)
        
        summary = f"""
数据集摘要：
- 总记录数：{len(records)}
- 字段数：{len(df.columns)}
- 字段列表：{', '.join(df.columns)}

前5条数据：
{df.head(5).to_string()}

数值字段统计：
{df.describe().to_string() if len(df.select_dtypes(include=['number']).columns) > 0 else '无数值字段'}
"""
        return summary
```

**LLM分析表格数据**

```python
def analyze_spreadsheet(file_path, user_question):
    """用LLM分析表格数据"""
    processor = SpreadsheetProcessor()
    
    if file_path.endswith('.xlsx') or file_path.endswith('.xls'):
        records = processor.extract_from_excel(file_path)
    elif file_path.endswith('.csv'):
        records = processor.extract_from_csv(file_path)
    else:
        return "不支持的文件格式"
    
    # 生成数据摘要
    summary = processor.summarize_data(records)
    
    # 构造Prompt
    prompt = f"""
用户上传了一个表格数据，并提出了以下问题：
{user_question}

数据摘要：
{summary}

请根据以上数据，回答用户的问题。如果数据不足以回答，请说明需要哪些额外信息。
"""
    
    # 调用LLM
    response = llm_service.chat([{"role": "user", "content": prompt}])
    return response['content']
```

---

## 16.5 大文件上传与断点续传

**大文件上传问题**

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 上传超时 | 文件太大，HTTP超时 | 分片上传 |
| 网络中断 | 用户网络不稳定 | 断点续传 |
| 服务器内存溢出 | 大文件一次性加载到内存 | 流式写入 |
| 重复上传 | 同一文件上传多次 | 秒传（Hash去重） |

**分片上传实现**

```python
# services/chunked_upload.py
import hashlib

class ChunkedUploadService:
    def __init__(self, upload_dir='uploads/tmp'):
        self.upload_dir = upload_dir
        os.makedirs(upload_dir, exist_ok=True)
    
    def initiate_upload(self, filename, file_size, chunk_size=5*1024*1024):
        """初始化分片上传"""
        upload_id = str(uuid.uuid4())
        total_chunks = (file_size + chunk_size - 1) // chunk_size
        
        # 创建临时目录
        tmp_dir = os.path.join(self.upload_dir, upload_id)
        os.makedirs(tmp_dir, exist_ok=True)
        
        # 保存上传元数据
        metadata = {
            'upload_id': upload_id,
            'filename': filename,
            'file_size': file_size,
            'chunk_size': chunk_size,
            'total_chunks': total_chunks,
            'uploaded_chunks': []
        }
        
        with open(os.path.join(tmp_dir, 'metadata.json'), 'w') as f:
            json.dump(metadata, f)
        
        return {
            'upload_id': upload_id,
            'total_chunks': total_chunks,
            'chunk_size': chunk_size
        }
    
    def upload_chunk(self, upload_id, chunk_index, chunk_data):
        """上传分片"""
        tmp_dir = os.path.join(self.upload_dir, upload_id)
        
        # 保存分片
        chunk_path = os.path.join(tmp_dir, f"chunk_{chunk_index:06d}")
        with open(chunk_path, 'wb') as f:
            f.write(chunk_data)
        
        # 更新元数据
        metadata_path = os.path.join(tmp_dir, 'metadata.json')
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        if chunk_index not in metadata['uploaded_chunks']:
            metadata['uploaded_chunks'].append(chunk_index)
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f)
        
        return {
            'uploaded_chunks': len(metadata['uploaded_chunks']),
            'total_chunks': metadata['total_chunks'],
            'completed': len(metadata['uploaded_chunks']) == metadata['total_chunks']
        }
    
    def complete_upload(self, upload_id):
        """合并分片"""
        tmp_dir = os.path.join(self.upload_dir, upload_id)
        
        with open(os.path.join(tmp_dir, 'metadata.json'), 'r') as f:
            metadata = json.load(f)
        
        # 合并文件
        final_path = os.path.join('uploads', metadata['filename'])
        with open(final_path, 'wb') as final_file:
            for i in range(metadata['total_chunks']):
                chunk_path = os.path.join(tmp_dir, f"chunk_{i:06d}")
                with open(chunk_path, 'rb') as chunk_file:
                    final_file.write(chunk_file.read())
        
        # 清理临时文件
        import shutil
        shutil.rmtree(tmp_dir)
        
        return {
            'filename': metadata['filename'],
            'path': final_path,
            'size': os.path.getsize(final_path)
        }
```

---

## 16.6 前端大文件上传组件

**Vue3大文件上传组件**

```vue
<!-- components/BigFileUploader.vue -->
<script setup>
import { ref, computed } from 'vue'
import SparkMD5 from 'spark-md5'

const props = defineProps({
  chunkSize: { type: Number, default: 5 * 1024 * 1024 },  // 5MB
  maxRetries: { type: Number, default: 3 }
})

const emit = defineEmits(['uploaded', 'error'])

const file = ref(null)
const uploadId = ref(null)
const uploadedChunks = ref(0)
const totalChunks = ref(0)
const uploading = ref(false)
const progress = computed(() => {
  if (totalChunks.value === 0) return 0
  return Math.round((uploadedChunks.value / totalChunks.value) * 100)
})

const selectFile = (event) => {
  file.value = event.target.files[0]
}

const startUpload = async () => {
  if (!file.value) return
  
  uploading.value = true
  
  try {
    // 1. 计算文件Hash（用于秒传）
    const fileHash = await calculateHash(file.value)
    
    // 2. 初始化上传
    const initRes = await fetch('/api/v1/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.value.name,
        file_size: file.value.size,
        file_hash: fileHash
      })
    }).then(r => r.json())
    
    uploadId.value = initRes.data.upload_id
    totalChunks.value = initRes.data.total_chunks
    
    // 3. 上传分片
    for (let i = 0; i < totalChunks.value; i++) {
      await uploadChunk(i)
    }
    
    // 4. 合并分片
    const completeRes = await fetch('/api/v1/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId.value })
    }).then(r => r.json())
    
    emit('uploaded', completeRes.data)
  } catch (err) {
    emit('error', err.message)
  } finally {
    uploading.value = false
  }
}

const uploadChunk = async (chunkIndex, retryCount = 0) => {
  const start = chunkIndex * props.chunkSize
  const end = Math.min(start + props.chunkSize, file.value.size)
  const chunk = file.value.slice(start, end)
  
  const formData = new FormData()
  formData.append('upload_id', uploadId.value)
  formData.append('chunk_index', chunkIndex)
  formData.append('chunk_data', chunk)
  
  try {
    const res = await fetch('/api/v1/upload/chunk', {
      method: 'POST',
      body: formData
    }).then(r => r.json())
    
    uploadedChunks.value = res.data.uploaded_chunks
  } catch (err) {
    if (retryCount < props.maxRetries) {
      await uploadChunk(chunkIndex, retryCount + 1)
    } else {
      throw err
    }
  }
}

const calculateHash = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsArrayBuffer(file)
    reader.onload = (e) => {
      const hash = SparkMD5.ArrayBuffer.hash(e.target.result)
      resolve(hash)
    }
  })
}
</script>

<template>
  <div class="big-file-uploader">
    <input type="file" @change="selectFile" :disabled="uploading" />
    <button @click="startUpload" :disabled="!file || uploading">
      {{ uploading ? '上传中...' : '开始上传' }}
    </button>
    
    <div v-if="uploading" class="progress-bar">
      <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      <span class="progress-text">{{ progress }}%</span>
    </div>
  </div>
</template>
```

---

## 16.7 文件处理异步任务

**Celery异步处理大文件**

```python
# tasks/file_processing.py
from celery_config import celery
from services.document_processor import PDFProcessor, PDFChunker
from services.spreadsheet_processor import SpreadsheetProcessor

@celery.task(bind=True)
def process_uploaded_file(self, file_path, file_type, user_id):
    """异步处理上传的文件"""
    try {
        self.update_state(state='PROCESSING', meta={'progress': 0})
        
        if file_type == 'pdf':
            # 处理PDF
            chunker = PDFChunker()
            self.update_state(state='PROCESSING', meta={'progress': 30})
            
            chunks = chunker.chunk_pdf(file_path)
            self.update_state(state='PROCESSING', meta={'progress': 60})
            
            # 向量化并存储
            vector_store = VectorStore()
            embedding_service = EmbeddingService()
            for chunk in chunks:
                vector = embedding_service.embed_text(chunk['content'])
                vector_store.add(chunk['content'], vector, chunk['metadata'])
            
            self.update_state(state='PROCESSING', meta={'progress': 100})
            return {'status': 'done', 'chunks': len(chunks)}
        
        elif file_type in ['xlsx', 'xls', 'csv']:
            # 处理表格
            processor = SpreadsheetProcessor()
            if file_type == 'csv':
                records = processor.extract_from_csv(file_path)
            else:
                records = processor.extract_from_excel(file_path)
            
            # 保存为JSON供后续使用
            json_path = file_path + '.json'
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(records, f, ensure_ascii=False)
            
            return {'status': 'done', 'records': len(records)}
        
        else:
            return {'status': 'unsupported_file_type'}
    
    } except Exception as e:
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 语音转文字 | Whisper API + 前端录音上传 |
| 图片理解 | GPT-4V + 图片上传API |
| PDF处理 | PyMuPDF解析 + 分块策略 |
| 表格处理 | pandas读取 + LLM分析 |
| 大文件上传 | 分片上传 + 断点续传 + 秒传 |
| 异步处理 | Celery处理耗时文件任务 |

---

觉得有用？收藏起来，下次直接照抄。

你的平台支持哪些输入类型？评论区聊聊。

关注怕浪猫，下期我们做数据分析——用户行为分析、Token消耗统计、成本优化建议，让平台运营有数据支撑。

系列进度 16/23

**下章预告：** 第17章数据分析——用户行为漏斗、Token消耗趋势、成本中心分析、优化建议生成，让LLMOps平台不仅能用，还能用好。
