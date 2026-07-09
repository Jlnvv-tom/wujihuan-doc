# 第3章 图生图、局部重绘与ControlNet

文生图靠运气，图生图靠控制——但90%的人只用到了10%的控制力。

我是怕浪猫，「AI造物手册」第3章。前两章讲了模型选型和提示词，这章进入"精准控制"的领域。文生图只是起点，真正的生产力在图生图和ControlNet。

## 3.1 图生图基础：从参考图到风格转换

图生图（Image-to-Image）的原理：不是从纯噪声开始生成，而是从一张参考图开始，在它的潜空间表示上添加部分噪声，再去噪。这样模型既保留了参考图的结构信息，又根据提示词做修改。

核心参数是Denoising Strength（去噪强度）：

| 去噪强度 | 效果 | 适用场景 |
|---------|------|---------|
| 0.1-0.3 | 微调，几乎不变 | 画质增强、轻微修色 |
| 0.3-0.5 | 风格转换，保留构图 | 照片转油画、真人转动漫 |
| 0.5-0.7 | 大幅修改，保留大致结构 | 线稿上色、草图细化 |
| 0.7-0.9 | 几乎重新生成 | 仅保留色彩和模糊轮廓 |

```python
# Diffusers实现图生图
from diffusers import StableDiffusionImg2ImgPipeline
from PIL import Image
import torch

pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

# 加载参考图
init_image = Image.open("sketch.png").resize((1024, 1024))

# 图生图
image = pipe(
    prompt="a detailed architectural rendering, modern house, garden, photorealistic",
    image=init_image,
    strength=0.6,  # 去噪强度
    guidance_scale=7.5,
    num_inference_steps=30,
).images[0]

image.save("rendered.png")
```

> 去噪强度是图生图的灵魂参数——0.1的差别可能就是"微调"和"面目全非"的距离。

风格转换实战流程：

1. 准备一张参考图（人像照片、风景照等）
2. 写目标风格的提示词（如"watercolor painting style"）
3. 设置去噪强度0.4-0.6
4. 生成，看效果，调整强度

## 3.2 Inpainting局部重绘：精准修改图片的某个区域

局部重绘（Inpainting）是图生图的进阶版：只对图片的某个区域进行修改，其他部分保持不变。

原理：通过一个遮罩（Mask）标记需要修改的区域，模型只在该区域进行去噪生成，遮罩外的像素保持原样。

```python
# Diffusers实现局部重绘
from diffusers import StableDiffusionInpaintPipeline
from PIL import Image
import torch

pipe = StableDiffusionInpaintPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

# 加载原图和遮罩（白色=需要重绘的区域）
image = Image.open("photo.png").resize((1024, 1024))
mask = Image.open("mask.png").resize((1024, 1024))

result = pipe(
    prompt="a red sports car",
    image=image,
    mask_image=mask,
    strength=0.8,
    guidance_scale=7.5,
    num_inference_steps=30,
).images[0]

result.save("inpainted.png")
```

局部重绘3步法：

| 步骤 | 操作 | 工具 |
|------|------|------|
| 1. 标记区域 | 用画笔在需要修改的区域涂白色 | ComfyUI的MaskEditor / WebUI的Inpaint画笔 |
| 2. 写提示词 | 描述你想要的新内容 | 精确描述替换后的元素 |
| 3. 调整参数 | 去噪强度和遮罩边缘羽化 | 强度0.7-0.9，羽化10-20像素 |

> 遮罩边缘的羽化很关键——硬边缘会在修改区域和原图之间留下明显的接缝。

**Inpainting常见问题排查**

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 修改区域与周围不融合 | 遮罩边缘太硬 | 增加羽化值 |
| 修改效果不明显 | 去噪强度太低 | 提高到0.8以上 |
| 修改区域内容跑偏 | 提示词不够精确 | 加入位置和上下文描述 |
| 出现多余元素 | 反向提示词缺失 | 加入不需要的元素 |

你有没有遇到过这种情况：只想改背景中的一个人，结果整个背景都变了？Inpainting就是解决这个问题的。

## 3.3 ControlNet入门：线稿、深度图、姿态控制的原理

ControlNet是Stable Diffusion生态中最重要的可控生成技术。它通过一个额外的条件分支，为模型提供精确的 spatial 控制。

**ControlNet的工作原理**

1. 复制SD的UNet编码器作为ControlNet的骨干网络
2. 输入一张条件图（线稿、深度图等），经过ControlNet处理
3. 将ControlNet的输出作为残差注入到SD的UNet中
4. SD在生成时同时考虑文本提示词和ControlNet的空间条件

通俗理解：提示词告诉模型"画什么"，ControlNet告诉模型"怎么画"——精确到每个像素的位置。

> ControlNet出现之前，AI生图像掷骰子；出现之后，AI生图像画图纸。

主流ControlNet类型：

| 类型 | 输入 | 控制内容 | 典型用途 |
|------|------|---------|---------|
| Canny | 边缘检测图 | 精确轮廓 | 线稿上色、建筑效果图 |
| Depth | 深度图 | 前后景关系 | 场景重构、视角变换 |
| OpenPose | 骨骼关键点 | 人物姿态 | 角色动作控制 |
| SoftEdge | 软边缘 | 模糊轮廓 | 更自然的风格转换 |
| Scribble | 涂鸦草图 | 大致构图 | 从草图到成品 |
| Tile | 降采样图 | 整体结构 | 放大、细节增强 |
| IP-Adapter | 参考图片 | 风格和内容 | 风格迁移、角色一致性 |

## 3.4 常用ControlNet模型推荐与使用场景

根据你的需求选择合适的ControlNet：

**建筑/室内设计方向**
- 首选：Canny + Depth
- Canny控制建筑轮廓线条
- Depth控制空间纵深关系
- 配合提示词描述材质和风格

**角色设计方向**
- 首选：OpenPose + Depth
- OpenPose控制人物姿态
- 配合IP-Adapter保持角色面部一致性
- 适合生成同一角色的不同动作

**产品摄影方向**
- 首选：Canny + Tile
- Canny控制产品轮廓
- Tile用于保持产品细节
- 配合高质量提示词输出商业级图片

**插画/动画方向**
- 首选：Scribble + SoftEdge
- Scribble从草图生成完整插画
- SoftEdge保留手绘感
- 适合快速概念设计

在ComfyUI中使用ControlNet的基本节点链路：

```
[Load Image] -> [ControlNet Preprocessor] -> [ControlNet Apply] 
                                                     |
[Load Checkpoint] -> [CLIP Text Encode] ------> [KSampler] -> [VAE Decode] -> [Save Image]
```

关键节点说明：
- ControlNet Preprocessor：将输入图转换为条件图（如提取线稿、深度图）
- Apply ControlNet：加载ControlNet模型，将条件图注入生成过程
- KSampler：主采样节点，同时接收文本和ControlNet的条件

> 一个工作流可以叠加多个ControlNet——比如同时用OpenPose控制姿态、Depth控制背景纵深、Canny控制建筑线条。

## 3.5 实战：用ControlNet线稿控制生成建筑效果图

完整实战流程，从一张线稿生成专业建筑效果图：

**Step 1：准备线稿**

可以用手绘草图，也可以用软件生成。这里用Canny边缘检测从一张参考照片提取线稿：

```python
import cv2
import numpy as np
from PIL import Image

# Canny边缘检测
image = cv2.imread("building_ref.jpg")
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
edges = cv2.Canny(gray, 100, 200)
edges = 255 - edges  # 反转：白底黑线

cv2.imwrite("canny_lineart.png", edges)
```

**Step 2：ComfyUI工作流搭建**

节点连接顺序：
1. Load Image -> 加载canny_lineart.png
2. Load ControlNet Model -> control_v11p_sd15_canny
3. Apply ControlNet -> strength 1.0, end_percent 0.8
4. Load Checkpoint -> 你的SDXL或SD1.5模型
5. CLIP Text Encode (正向) -> "modern architecture, glass facade, 
   concrete and steel, sunny day, professional architectural 
   rendering, photorealistic, 8k"
6. CLIP Text Encode (反向) -> "low quality, blurry, deformed, 
   watermark"
7. KSampler -> steps 30, cfg 7, sampler DPM++ 2M Karras
8. VAE Decode -> Save Image

**Step 3：参数调优**

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| ControlNet strength | 0.8-1.0 | 太低线稿约束不够 |
| end_percent | 0.6-0.8 | 后期让模型自由发挥细节 |
| 步数 | 30-40 | 建筑细节需要更多步数 |
| CFG | 7-8 | 标准范围 |

**Step 4：输出对比**

同一张线稿，不同提示词的效果差异：

| 提示词风格 | 效果 |
|-----------|------|
| "photorealistic, sunny day" | 真实照片感，晴天光影 |
| "watercolor painting, soft colors" | 水彩风格，柔和色调 |
| "cyberpunk, neon lights, night" | 赛博朋克，夜景霓虹 |
| "minimalist, white background" | 极简风格，白色背景 |

> 同一张线稿，换个提示词就是完全不同的方案——这就是ControlNet的生产力。

---

## 本章总结

| 技术 | 核心参数 | 适用场景 |
|------|---------|---------|
| 图生图 | 去噪强度0.3-0.7 | 风格转换、草图细化 |
| 局部重绘 | 遮罩+去噪强度0.7-0.9 | 精准修改局部区域 |
| ControlNet Canny | strength 0.8-1.0 | 线稿上色、建筑效果 |
| ControlNet Depth | strength 0.6-0.8 | 场景纵深控制 |
| ControlNet OpenPose | strength 0.8-1.0 | 人物姿态控制 |
| 多ControlNet叠加 | 各strength 0.5-0.8 | 复杂场景精确控制 |

觉得有用？收藏起来，下次需要精准控制时直接照抄工作流。

你平时用哪个ControlNet最多？评论区说说。

关注怕浪猫，下期我们进入视频生成的世界——从静帧到动态，开源模型怎么选。

系列进度 3/8，下篇：开源AI视频生成模型巡礼。
