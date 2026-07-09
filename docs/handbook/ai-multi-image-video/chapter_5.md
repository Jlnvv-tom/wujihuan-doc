# 第5章 ComfyUI视频生成工作流实战

一张图变一段视频，整个工作流只要5个核心节点——但每个节点都有坑。

我是怕浪猫，「AI造物手册」第5章。上期盘点了开源视频模型，这期进ComfyUI实战。从AnimateDiff到SVD到Deforum，手把手搭建视频生成工作流。

## 5.1 ComfyUI视频节点基础：AnimateDiff工作流搭建

AnimateDiff是为Stable Diffusion添加动态能力的模块，它通过在SD的UNet中插入运动模块（Motion Module），让原本生成静图的模型能够生成连贯的帧序列。

**AnimateDiff的核心组件**

| 组件 | 作用 | 说明 |
|------|------|------|
| Motion Module | 运动建模 | 预训练的时序注意力模块 |
| Context Options | 帧窗口控制 | 滑动窗口处理长视频 |
| Sample Settings | 采样设置 | 与图片生成类似但多了帧维度 |
| Loop Settings | 循环控制 | 生成无缝循环视频 |

**基础工作流搭建**

在ComfyUI中，AnimateDiff工作流的节点链路：

```
[Load Checkpoint] -> [CLIP Text Encode (正向)]
                   -> [CLIP Text Encode (反向)]
[Load AnimateDiff Model] -> [AnimateDiff Sampler] -> [VAE Decode] -> [Save Video]
                              ^
[Context Options] ----------|
```

关键步骤：

1. 安装ComfyUI-AnimateDiff-Evolved插件
2. 在Manager中安装AnimateDiff运动模型（如mm_sd_v15_v2.ckpt）
3. 搭建以下节点链路：

| 节点 | 参数设置 |
|------|---------|
| Load Checkpoint | 你的SD1.5或SDXL模型 |
| Load AnimateDiff Model | mm_sd_v15_v2.ckpt |
| Context Options | context_length=16, stride=4 |
| AnimateDiff Sampler | frames=16, steps=25, cfg=7.5 |
| VAEDecode | 输出帧序列 |
| SaveVideo | 保存为GIF或MP4 |

> AnimateDiff本质上是让静图模型"动起来"——画质取决于你的基础模型，动态效果取决于运动模块。

## 5.2 图生视频工作流：SVD在ComfyUI中的节点配置

Stable Video Diffusion在ComfyUI中有专门的节点支持，比Diffusers脚本更灵活。

**SVD工作流节点链路**

```
[Load Image] -> [SVD Image Encoder] 
                      |
[Load SVD Model] -> [SVD Sampler] -> [VAE Decode] -> [Save Video]
                      |
[SVD Conditioning] --|
```

**关键参数设置**

| 节点 | 参数 | 推荐值 | 说明 |
|------|------|--------|------|
| Load SVD Model | model | svd_xt.safetensors | XT版本质量更高 |
| SVD Conditioning | motion_bucket_id | 127 | 控制运动幅度 |
| SVD Conditioning | fps | 8 | 输出帧率 |
| SVD Conditioning | augmentation | 0.1 | 噪声增强 |
| SVD Sampler | steps | 25 | 采样步数 |
| SVD Sampler | cfg | 2.5 | SVD用低CFG |
| SVD Sampler | min_cfg | 1.0 | 最低CFG，增加多样性 |

**显存优化技巧**

SVD对显存需求较高，以下方法可以降低门槛：

| 方法 | 节省显存 | 速度影响 |
|------|---------|---------|
| decode_chunk_size=4 | 显著 | 稍慢 |
| 启用CPU offload | 显著 | 明显变慢 |
| 使用fp16精度 | 约50% | 几乎无影响 |
| 降低帧数到14 | 约40% | 按比例减少 |
| 降低分辨率到512 | 约60% | 明显 |

```python
# ComfyUI API调用SVD工作流的关键参数
workflow = {
    "3": {
        "class_type": "SVD_Conditioning",
        "inputs": {
            "clip_vision_output": ["3", 0],
            "init_image": ["4", 0],
            "width": 1024,
            "height": 576,
            "video_frames": 25,
            "motion_bucket_id": 127,
            "fps": 8,
            "augmentation_level": 0.1
        }
    }
}
```

> SVD的关键在motion_bucket_id——127是默认值，调到180以上运动剧烈但容易崩，调到80以下几乎是静帧。

## 5.3 视频风格转换：Deforum动画生成全流程

Deforum是另一种视频生成思路：不生成全新视频，而是对现有图片进行逐帧变换，通过参数化控制每帧的变换（缩放、平移、旋转），配合SD的图生图能力，生成有运动感的动画。

**Deforum的核心参数**

Deforum通过"关键帧"控制动画的运动轨迹：

| 参数类型 | 作用 | 示例 |
|---------|------|------|
| Zoom | 逐帧缩放 | 0:1.0, 30:1.1（30帧内放大10%） |
| Angle | 逐帧旋转 | 0:0, 30:5（30帧内旋转5度） |
| Translation X/Y | 逐帧平移 | 0:(0,0), 30:(10,5) |
| Transform Center | 变换中心 | 0:(0.5,0.5)（画面中心） |

**在ComfyUI中使用Deforum**

安装ComfyUI-Deforum插件后，工作流如下：

```
[Load Checkpoint] -> [Deforum Iterative Sampling] -> [VAE Decode] -> [Save Video]
                          ^
[Deforum Keyframes] -----|
[Deforum Prompt] --------|
```

**Deforum参数模板**

| 参数 | 推荐值 | 效果 |
|------|--------|------|
| max_frames | 60-120 | 5-10秒视频 |
| border | "wrap" | 边缘包裹，无黑边 |
| noise_multiplier | 0.02-0.05 | 帧间噪声，增加变化 |
| color_coherence | "Match Frame 0 LAB" | 保持色彩一致性 |
| strength | 0.6-0.8 | 图生图去噪强度 |

> Deforum做出来的视频有种"呼吸感"——画面在不断演化，适合艺术风格动画和音乐可视化。

**Deforum vs AnimateDiff vs SVD**

| 对比维度 | Deforum | AnimateDiff | SVD |
|---------|---------|-------------|-----|
| 输入 | 提示词+参数 | 提示词 | 图片 |
| 动画类型 | 变换动画 | 生成动画 | 图生动画 |
| 运动控制 | 精确参数化 | 运动模块决定 | 模型预测 |
| 画质 | 中等 | 取决于基础模型 | 较好 |
| 适合场景 | 艺术动画、MV | 角色动画 | 照片动起来 |

## 5.4 视频后处理：插帧、超分与画质增强

模型直接生成的视频通常帧率低（6-8fps）、分辨率有限，需要后处理提升质量。

**帧率提升：视频插帧**

| 工具 | 方法 | 效果 |
|------|------|------|
| RIFE | 光流插帧 | 开源，速度快 |
| FILM | 大运动插帧 | Google开源，效果好 |
| ComfyUI FILM节点 | 集成在ComfyUI中 | 方便但速度一般 |

```python
# 使用RIFE插帧（8fps -> 24fps）
# 安装: pip install rife-ncnn-vulkan
import subprocess

# 3倍插帧
subprocess.run([
    "rife-ncnn-vulkan",
    "-i", "input_frames/",
    "-o", "output_frames/",
    "-x",  # 3倍插帧
])
```

**分辨率提升：视频超分**

| 模型 | 放大倍数 | 特点 |
|------|---------|------|
| Real-ESRGAN | 2x/4x | 通用，速度快 |
| CodeFormer | 2x/4x | 人脸增强效果好 |
| GFPGAN | 2x | 专做人脸修复 |
| Topaz Video AI | 2x/4x | 商用，效果最好 |

在ComfyUI中，可以通过Additional Upscaler节点集成Real-ESRGAN。

**画质增强流程**

```
[Model Output] -> [RIFE 插帧] -> [Real-ESRGAN 超分] -> [Final Video]
   8fps, 480p       24fps            1080p
```

3步后处理流程：
1. 插帧：6fps提升到24fps，让画面流畅
2. 超分：480p提升到1080p，增加清晰度
3. 调色：可选，用FFmpeg做简单的色彩调整

> 原始视频质量决定上限，后处理只是逼近这个上限——别指望后处理能把崩坏的画面修好。

## 5.5 实战：从一张静图生成5秒流畅视频的完整工作流

综合运用前面所有知识，搭建一个从静图到视频的完整工作流。

**输入**：一张1024x576的AI生成图片
**输出**：5秒24fps的1080p视频

**工作流架构**

```
Phase 1: 视频生成
[Load Image] -> [SVD Sampler] -> [Raw Frames (25帧, 8fps, 576p)]

Phase 2: 插帧
[Raw Frames] -> [RIFE 3x] -> [Smooth Frames (75帧, 24fps)]

Phase 3: 超分
[Smooth Frames] -> [Real-ESRGAN 2x] -> [HD Frames (75帧, 1152p)]

Phase 4: 编码
[HD Frames] -> [FFmpeg] -> [final.mp4]
```

**ComfyUI节点搭建**

核心节点清单：

| 序号 | 节点类型 | 作用 |
|------|---------|------|
| 1 | LoadImage | 加载输入图片 |
| 2 | SVDCoader | 加载SVD-XT模型 |
| 3 | SVDImg2Vid | 生成25帧视频 |
| 4 | VAEDecode | 解码帧序列 |
| 5 | SaveImageSequence | 保存帧 |
| 6 | RIFEInterpolate | 3倍插帧 |
| 7 | ImageUpscaleWithModel | Real-ESRGAN 2x |
| 8 | SaveAnimatedWEBP/Video | 输出最终视频 |

**关键参数**

| 阶段 | 参数 | 值 |
|------|------|-----|
| SVD生成 | frames | 25 |
| SVD生成 | motion_bucket_id | 127 |
| SVD生成 | steps | 25 |
| SVD生成 | cfg | 2.5 |
| 插帧 | multiplier | 3 |
| 超分 | model | RealESRGAN_x4plus |
| 超分 | tile_size | 512 |

**FFmpeg最终编码**

```bash
# 将帧序列编码为MP4
ffmpeg -framerate 24 -i frames/%06d.png \
  -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p output.mp4
```

**效果检查清单**

| 检查项 | 标准 |
|--------|------|
| 时序连贯性 | 无闪烁、无突然跳变 |
| 运动幅度 | 自然，不过快也不过慢 |
| 画质清晰度 | 1080p无明显模糊 |
| 帧率流畅度 | 24fps无卡顿 |
| 边缘稳定性 | 无边缘抖动或变形 |

> 一张图变一段视频，听起来简单，但每个环节都有坑——怕浪猫试了不下20次才跑通整个流程。

---

## 本章总结

| 技术 | 适用场景 | 核心工具 |
|------|---------|---------|
| AnimateDiff | 文生动画 | ComfyUI + 运动模块 |
| SVD | 图生视频 | ComfyUI SVD节点 |
| Deforum | 变换动画 | ComfyUI Deforum插件 |
| 视频插帧 | 帧率提升 | RIFE / FILM |
| 视频超分 | 分辨率提升 | Real-ESRGAN |
| 完整流程 | 静图转高清视频 | SVD + RIFE + ESRGAN + FFmpeg |

觉得有用？收藏起来，下次搭视频工作流时直接照抄节点清单。

你做AI视频时遇到的最大问题是什么？评论区说说，怕浪猫帮你排查。

关注怕浪猫，下期讲LoRA微调——训练你自己的专属风格模型。

系列进度 5/8，下篇：LoRA微调与个性化模型训练。
