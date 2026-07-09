# 第7章 AI创作工程化与自动化流水线

输入一段文字，自动产出图文+视频——这不是概念演示，是怕浪猫跑通的生产管线。

我是怕浪猫，「AI造物手册」第7章。前面六章都是"手动操作"，这章进入"自动运行"。把AI生成能力工程化，从单次生成升级为批量生产。

## 7.1 API化部署：把ComfyUI变成后端服务

ComfyUI不只是图形界面工具，它内置了完整的API。你可以把工作流保存为JSON，通过HTTP API调用。

**启用ComfyUI API**

```bash
# 启动ComfyUI时默认监听 127.0.0.1:8188
python main.py --listen 0.0.0.0 --port 8188
```

**API调用流程**

```python
import json
import urllib.request
import websocket
import uuid

# Step 1: 加载工作流JSON
with open("workflow.json", "r") as f:
    workflow = json.load(f)

# Step 2: 修改工作流参数（如提示词、种子）
workflow["6"]["inputs"]["text"] = "a serene mountain lake at sunset"

# Step 3: 通过API提交
client_id = str(uuid.uuid4())
ws = websocket.create_connection(
    f"ws://127.0.0.1:8188/ws?clientId={client_id}"
)

prompt_request = {
    "prompt": workflow,
    "client_id": client_id
}

data = json.dumps(prompt_request).encode('utf-8')
req = urllib.request.Request(
    "http://127.0.0.1:8188/prompt",
    data=data,
    headers={'Content-Type': 'application/json'}
)
response = json.loads(urllib.request.urlopen(req).read())
prompt_id = response['prompt_id']

# Step 4: 等待生成完成
while True:
    msg = json.loads(ws.recv())
    if msg['type'] == 'executed':
        if msg['data']['node'] == '9':  # Save Image节点
            image_data = msg['data']['output']['images'][0]
            print(f"生成完成: {image_data['filename']}")
            break

# Step 5: 下载图片
filename = image_data['filename']
subfolder = image_data['subfolder']
image_url = f"http://127.0.0.1:8188/view?filename={filename}&subfolder={subfolder}"
urllib.request.urlretrieve(image_url, "output.png")
```

**API化部署的关键设计**

| 设计点 | 方案 | 说明 |
|--------|------|------|
| 工作流模板 | JSON文件，参数用占位符 | 不同任务用不同模板 |
| 参数注入 | API提交时替换JSON中的值 | 提示词、种子、尺寸等 |
| 队列管理 | ComfyUI内置队列 | 多请求自动排队 |
| 结果获取 | WebSocket监听 + HTTP下载 | 实时获取生成状态 |
| 错误处理 | 检查execution_error消息 | 生成失败时重试 |

> ComfyUI的API设计很纯粹——提交JSON工作流，WebSocket等结果。没有多余的封装，反而最灵活。

## 7.2 批量生成系统：从CSV到千人千面海报

假设需求：根据CSV中的1000条数据，为每条数据生成一张定制海报。

**系统架构**

```
CSV数据 -> Python脚本 -> ComfyUI API -> 批量图片输出
```

**数据格式**

```csv
title,subtitle,background_style,color_scheme
"夏日特惠","全场5折起","tropical beach","warm colors"
"科技峰会","2025年度大会","futuristic city skyline","blue and silver"
"新品发布","限时预售","minimalist studio","neutral tones"
```

**批量生成脚本**

```python
import csv
import json
import time
import urllib.request
import websocket
import uuid

class ComfyUIBatchGenerator:
    def __init__(self, server_address="127.0.0.1:8188"):
        self.server = server_address
        self.client_id = str(uuid.uuid4())
        
    def load_template(self, template_path):
        with open(template_path, 'r') as f:
            return json.load(f)
    
    def generate(self, workflow, output_path):
        # 提交工作流
        ws = websocket.create_connection(
            f"ws://{self.server}/ws?clientId={self.client_id}"
        )
        
        data = json.dumps({
            "prompt": workflow,
            "client_id": self.client_id
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"http://{self.server}/prompt",
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        
        response = json.loads(urllib.request.urlopen(req).read())
        prompt_id = response['prompt_id']
        
        # 等待完成
        while True:
            msg = json.loads(ws.recv())
            if msg['type'] == 'executed':
                image_info = msg['data']['output']['images'][0]
                url = f"http://{self.server}/view?filename={image_info['filename']}&subfolder={image_info.get('subfolder','')}"
                urllib.request.urlretrieve(url, output_path)
                break
            elif msg['type'] == 'execution_error':
                raise Exception(f"生成失败: {msg['data']}")
        
        ws.close()
    
    def batch_generate_from_csv(self, csv_path, template_path, output_dir):
        workflow = self.load_template(template_path)
        
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                # 注入参数到工作流
                workflow["6"]["inputs"]["text"] = (
                    f"poster design, {row['background_style']}, "
                    f"{row['color_scheme']}, title: {row['title']}, "
                    f"subtitle: {row['subtitle']}, "
                    f"professional graphic design, high quality"
                )
                workflow["3"]["inputs"]["seed"] = i * 1000
                
                output_path = f"{output_dir}/poster_{i:04d}.png"
                print(f"生成第 {i+1} 张: {row['title']}")
                self.generate(workflow, output_path)
                time.sleep(1)  # 间隔避免过载

# 使用
generator = ComfyUIBatchGenerator()
generator.batch_generate_from_csv(
    "data.csv",
    "poster_workflow.json",
    "output_posters/"
)
```

> 批量生成的核心不是代码复杂度，而是工作流模板设计——把可变参数提取出来，其余保持固定。

## 7.3 图片+视频联动：先出图再转视频的自动化方案

更高级的流水线：先用图片模型生成高质量静图，再用视频模型将静图转为动态视频。

**流水线架构**

```
文字输入 -> [FLUX生图] -> 高质量静图 -> [SVD转视频] -> 原始视频 -> [插帧+超分] -> 最终视频
```

**实现代码**

```python
import json
import time
from comfyui_client import ComfyUIBatchGenerator

class ImageToVideoPipeline:
    def __init__(self):
        self.client = ComfyUIBatchGenerator()
    
    def run(self, prompt, output_dir="pipeline_output/"):
        # Phase 1: 生成图片
        print("Phase 1: 生成图片...")
        image_workflow = self.client.load_template("flux_t2i_workflow.json")
        image_workflow["6"]["inputs"]["text"] = prompt
        image_path = f"{output_dir}image.png"
        self.client.generate(image_workflow, image_path)
        
        # Phase 2: 图片转视频
        print("Phase 2: 图片转视频...")
        video_workflow = self.client.load_template("svd_i2v_workflow.json")
        video_workflow["10"]["inputs"]["image"] = image_path
        video_path = f"{output_dir}video_frames"
        self.client.generate(video_workflow, f"{video_path}/frame_000.png")
        
        # Phase 3: 后处理
        print("Phase 3: 后处理...")
        self.post_process(video_path, f"{output_dir}final.mp4")
        
        print(f"完成! 输出: {output_dir}final.mp4")
    
    def post_process(self, frames_dir, output_path):
        import subprocess
        
        # 插帧 (RIFE 3x)
        subprocess.run([
            "rife-ncnn-vulkan",
            "-i", frames_dir,
            "-o", f"{frames_dir}_interpolated/",
            "-x"
        ], check=True)
        
        # 超分 (Real-ESRGAN 2x)
        subprocess.run([
            "realesrgan-ncnn-vulkan",
            "-i", f"{frames_dir}_interpolated/",
            "-o", f"{frames_dir}_upscaled/",
            "-n", "realesr-animevideov3",
            "-s", "2"
        ], check=True)
        
        # 编码为MP4
        subprocess.run([
            "ffmpeg", "-framerate", "24",
            "-i", f"{frames_dir}_upscaled/%08d.png",
            "-c:v", "libx264", "-preset", "slow",
            "-crf", "18", "-pix_fmt", "yuv420p",
            output_path
        ], check=True)

# 使用
pipeline = ImageToVideoPipeline()
pipeline.run("A majestic eagle soaring over snow-capped mountains at dawn")
```

## 7.4 成本控制：显存优化、量化与推理加速

生产环境中，成本控制是必修课。

**显存优化策略**

| 策略 | 节省幅度 | 速度影响 | 实现方式 |
|------|---------|---------|---------|
| FP16精度 | 约50% | 几乎无 | dtype=torch.float16 |
| CPU Offload | 70%+ | 明显变慢 | --cpu-offload |
| 分块推理 | 30-50% | 中等 | tile_size参数 |
| 梯度检查点 | 20-30% | 训练时有效 | gradient_checkpointing |
| xFormers | 20-30% | 加速 | 启用xFormers注意力 |
| SageAttention | 30-50% | 加速 | 新型注意力机制 |

**模型量化**

```python
# 使用GGUF量化版本的FLUX.1
# 8GB显存也能运行12B参数的FLUX模型

# ComfyUI中加载GGUF模型
# 需要安装 ComfyUI-GGUF 插件
# 节点: UnetLoaderGGUF -> 选择 flux1-dev-Q4_K_S.gguf
```

| 量化级别 | 文件大小 | 显存需求 | 质量损失 |
|---------|---------|---------|---------|
| FP16（原版） | ~24GB | 16GB+ | 无 |
| Q8 | ~12GB | 10GB | 极小 |
| Q4 | ~7GB | 6-8GB | 轻微 |
| Q3 | ~5GB | 4-6GB | 可见 |

**推理加速**

| 方法 | 加速倍数 | 适用场景 |
|------|---------|---------|
| Flash Attention | 1.5-2x | 通用 |
| TensorRT | 2-3x | NVIDIA GPU |
| SageAttention | 2-4x | 较新GPU |
| LCM/ Turbo蒸馏 | 4-8x | 少步数生成 |
| 批处理优化 | 按批次数 | 批量生成 |

> 量化的本质是用精度换空间——Q4级别对大多数场景足够，肉眼几乎看不出差别。

## 7.5 实战：搭建一个"文字到短视频"的自动化生产管线

综合运用全部知识，搭建一个完整的自动化生产管线。

**系统设计**

```
用户输入文字
    |
    v
[LLM扩写] -> 生成场景描述和提示词
    |
    v
[FLUX生图] -> 生成3-5张关键帧图片
    |
    v
[SVD转视频] -> 每张图生成3秒视频片段
    |
    v
[插帧+超分] -> 24fps 1080p
    |
    v
[FFmpeg拼接] -> 添加转场和配乐
    |
    v
最终短视频输出
```

**关键代码结构**

```python
class TextToVideoPipeline:
    def __init__(self):
        self.comfyui = ComfyUIBatchGenerator()
    
    def expand_prompt(self, user_text):
        """用LLM将用户输入扩写为详细场景描述"""
        # 调用GPT/Claude/GLM等
        scenes = [
            f"{user_text}, wide establishing shot, cinematic",
            f"{user_text}, medium shot, different angle",
            f"{user_text}, close-up detail, dramatic lighting"
        ]
        return scenes
    
    def generate_keyframes(self, scenes, output_dir):
        """批量生成关键帧图片"""
        image_paths = []
        for i, scene in enumerate(scenes):
            workflow = self.comfyui.load_template("flux_workflow.json")
            workflow["6"]["inputs"]["text"] = scene
            workflow["3"]["inputs"]["seed"] = i * 10000 + 42
            path = f"{output_dir}/keyframe_{i}.png"
            self.comfyui.generate(workflow, path)
            image_paths.append(path)
        return image_paths
    
    def images_to_videos(self, image_paths, output_dir):
        """每张图片转为视频片段"""
        video_paths = []
        for i, img_path in enumerate(image_paths):
            workflow = self.comfyui.load_template("svd_workflow.json")
            workflow["10"]["inputs"]["image"] = img_path
            self.comfyui.generate(workflow, f"{output_dir}/clip_{i}")
            video_paths.append(f"{output_dir}/clip_{i}.mp4")
        return video_paths
    
    def compose_final_video(self, video_paths, audio_path, output_path):
        """拼接视频片段，添加转场和配乐"""
        import subprocess
        
        # 创建拼接列表
        with open("concat_list.txt", "w") as f:
            for vp in video_paths:
                f.write(f"file '{vp}'\n")
        
        # FFmpeg拼接 + 添加配乐 + 转场
        subprocess.run([
            "ffmpeg", "-f", "concat", "-safe", "0",
            "-i", "concat_list.txt",
            "-i", audio_path,
            "-c:v", "libx264", "-preset", "slow",
            "-c:a", "aac", "-shortest",
            "-pix_fmt", "yuv420p",
            output_path
        ], check=True)
    
    def run(self, user_text, output_dir="output/"):
        print(f"输入: {user_text}")
        
        # 1. 扩写
        scenes = self.expand_prompt(user_text)
        print(f"生成 {len(scenes)} 个场景描述")
        
        # 2. 生图
        images = self.generate_keyframes(scenes, output_dir)
        print(f"生成 {len(images)} 张关键帧")
        
        # 3. 转视频
        videos = self.images_to_videos(images, output_dir)
        print(f"生成 {len(videos)} 个视频片段")
        
        # 4. 合成
        self.compose_final_video(videos, "bgm.mp3", f"{output_dir}final.mp4")
        print(f"完成! 输出: {output_dir}final.mp4")

# 运行
pipeline = TextToVideoPipeline()
pipeline.run("A lone traveler walking through a misty bamboo forest at dawn")
```

**成本估算**

| 环节 | 时间 | 显存 |
|------|------|------|
| LLM扩写 | 2秒 | 不需要GPU |
| FLUX生图x3 | 30秒 | 8-16GB |
| SVD转视频x3 | 3分钟 | 12-20GB |
| 插帧+超分 | 2分钟 | 6-8GB |
| FFmpeg合成 | 10秒 | CPU |
| **总计** | **约6分钟** | **峰值16GB** |

> 6分钟，一段文字变成一段带配乐的高清短视频——这在一年前还是不可想象的。

---

## 本章总结

| 技术 | 用途 | 关键工具 |
|------|------|---------|
| ComfyUI API | 后端服务化 | WebSocket + JSON工作流 |
| 批量生成 | 个性化海报 | CSV + 工作流模板 |
| 图文视频联动 | 自动化生产 | FLUX + SVD + 后处理 |
| 显存优化 | 降低成本 | FP16 + 量化 + 分块 |
| 推理加速 | 提升效率 | Flash Attention + TensorRT |
| 完整管线 | 文字到视频 | LLM + FLUX + SVD + FFmpeg |

觉得有用？收藏起来，搭建自己的AI生成管线时直接照抄架构图。

你有没有尝试过把AI生成能力集成到自己的项目中？评论区说说你的场景。

关注怕浪猫，下期是系列完结篇——全链路回顾与未来展望。

系列进度 7/8，下篇：全链路回顾与AI生成未来展望。
