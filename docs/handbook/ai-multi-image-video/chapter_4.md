# 第4章 开源AI视频生成模型巡礼

图片玩熟了，视频怎么搞？4个开源模型试下来，怕浪猫踩了不少坑。

我是怕浪猫，「AI造物手册」第4章。这章我们把目光从静帧移向动态，盘点当前主流的开源AI视频生成模型。从图生视频到文生视频，每个模型都拆开看清楚。

## 4.1 视频生成的技术路线：扩散模型如何从静帧走向动态

AI视频生成的核心挑战是时序一致性——每一帧要好看，帧与帧之间还要连贯。

当前主流的技术路线有三种：

| 技术路线 | 原理 | 代表模型 |
|---------|------|---------|
| 图生视频 | 从一张静图出发，预测后续帧的运动 | SVD、CogVideoX I2V |
| 文生视频 | 直接从文本生成视频序列 | Mochi 1、CogVideoX T2V |
| 帧插值 | 生成关键帧后插帧补全中间画面 | AnimateDiff + Deforum |

**扩散模型做视频的基本思路**

和图片生成的扩散过程类似，但扩展到了时空维度：

1. 输入文本/图片条件
2. 从时空噪声开始（多帧噪声）
3. 逐步去噪，同时考虑空间一致性和时间连贯性
4. 通过3D VAE或帧间注意力机制保证时序连续性

> 图片生成是2D空间的去噪，视频生成是2D+时间维度的去噪——计算量翻了几十倍。

关键架构差异：

| 组件 | 图片生成 | 视频生成 |
|------|---------|---------|
| VAE | 2D空间编码 | 3D时空编码 |
| 注意力 | 空间自注意力 | 空间+时序注意力 |
| 计算量 | 单帧 | N帧（通常16-48帧） |
| 显存 | 4-16GB | 16-80GB |

这就是为什么视频生成对硬件要求远高于图片生成。

## 4.2 Stable Video Diffusion：图生视频的开源起点

Stable Video Diffusion（SVD）是Stability AI在2023年11月发布的开源视频生成模型，也是第一个高质量的开源图生视频模型。

**核心参数**

| 项目 | 参数 |
|------|------|
| 输入 | 单张图片 |
| 输出 | 14帧或25帧视频 |
| 分辨率 | 576x1024或1024x576 |
| 帧率 | 约6fps（生成后可插帧到24fps） |
| 架构 | 基于SD2.1的UNet + 时间层 |
| 许可 | 开源，非商业 |

**使用方式**

```python
# 通过Diffusers使用SVD
import torch
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import load_image, export_to_video

pipe = StableVideoDiffusionPipeline.from_pretrained(
    "stabilityai/stable-video-diffusion-img2vid-xt",
    torch_dtype=torch.float16,
    variant="fp16"
).to("cuda")

# 加载输入图片
image = load_image("input_image.png")
image = image.resize((1024, 576))

# 生成视频
frames = pipe(
    image,
    num_frames=25,
    decode_chunk_size=8,  # 降低显存占用
    motion_bucket_id=127,  # 控制运动幅度
    noise_aug_strength=0.1,  # 噪声增强，提高连贯性
).frames[0]

export_to_video(frames, "output.mp4", fps=8)
```

**SVD的参数调优**

| 参数 | 作用 | 推荐值 |
|------|------|--------|
| motion_bucket_id | 运动幅度（0-255） | 127（默认），大运动场景调高 |
| noise_aug_strength | 噪声增强 | 0.05-0.15 |
| decode_chunk_size | 解码块大小 | 4-8（显存小时调低） |
| num_frames | 生成帧数 | 14或25 |

> SVD的运动控制有限——它更像是在"让图片动起来"，而不是"生成全新视频"。

**SVD的局限**

- 只能图生视频，不支持文生视频
- 运动幅度有限，大运动容易画面崩坏
- 非商业许可，限制了商用场景
- 质量在2024年已被后续模型超越

但作为入门视频生成的教学模型，SVD仍然有价值。

## 4.3 CogVideoX：智谱的视频生成模型与API调用

CogVideoX是智谱AI（清华系）在2024年8月开始开源的视频生成模型系列，与智谱的商用产品"清影"同源。

**模型版本演进**

| 版本 | 参数量 | 能力 | 开源时间 |
|------|--------|------|---------|
| CogVideoX-2B | 2B | 文生视频，6秒，720x480 | 2024.08 |
| CogVideoX-5B | 5B | 文生视频，更长时长 | 2024.10 |
| CogVideoX1.5-5B | 5B | 5-10秒，768P，16帧 | 2024.11 |
| CogVideoX1.5-5B-I2V | 5B | 图生视频，任意比例 | 2024.11 |

**技术特点**

CogVideoX采用了三维变分自编码器（3D VAE）和DiT（Diffusion Transformer）架构：
- 文本、时间、空间三维度融合
- 参考Sora算法设计
- 相比前代CogVideo推理速度提升6倍
- 支持最长226 token的英文提示词

**本地使用**

```python
# CogVideoX-2B 文生视频
import torch
from diffusers import CogVideoXPipeline
from diffusers.utils import export_to_video

pipe = CogVideoXPipeline.from_pretrained(
    "THUDM/CogVideoX-2b",
    torch_dtype=torch.float16
).to("cuda")

video = pipe(
    "A street artist in a worn denim jacket paints a colorful mural on a brick wall, "
    "timelapse style, sunlight shifting across the wall",
    num_videos_per_prompt=1,
    num_inference_steps=50,
    num_frames=8,
    guidance_scale=6,
    generator=torch.Generator("cuda").manual_seed(42),
).frames[0]

export_to_video(video, "cogvideo_output.mp4", fps=8)
```

**API调用方式**

智谱也提供了API服务，不需要本地部署：

```python
# 通过智谱API调用（需注册获取API Key）
from zhipuai import ZhipuAI

client = ZhipuAI(api_key="your_api_key")

response = client.videos.generate(
    model="cogvideox",
    prompt="Ocean waves crashing on rocky shore at sunset",
    duration=6,
    resolution="720p"
)
```

> CogVideoX是国内首个可通过API调用的视频模型——不想折腾本地部署的，直接用API。

**CogVideoX的显存需求**

| 模型 | 显存需求 | 推荐显卡 |
|------|---------|---------|
| CogVideoX-2B | 36GB | A100 / 多卡 |
| CogVideoX-5B | 40GB+ | A100 80GB |
| 量化版2B | 18GB | RTX 4090 |

## 4.4 Mochi 1：百亿参数的文本到视频模型

Mochi 1是Genmo公司在2024年10月发布的开源文生视频模型，参数量达100亿，是目前公开发布的规模最大的开源视频生成模型之一。

**核心参数**

| 项目 | 参数 |
|------|------|
| 参数量 | 10B |
| 架构 | Asymmetric Diffusion Transformer (AsymmDiT) |
| 输入 | 文本提示词 |
| 输出 | 5.4秒视频，848x480分辨率 |
| 许可 | Apache 2.0（可商用） |
| 显存需求 | 60GB+（支持CPU offload降低） |

**架构特点**

AsymmDiT架构的设计思路：
- 视频和文本使用不同参数量的分支
- 视频分支大，处理复杂的时空建模
- 文本分支小，处理相对简单的语言理解
- 这种非对称设计在保持效果的同时优化了计算效率

**本地部署**

```bash
# 克隆仓库
git clone https://github.com/genmoai/models.git
cd models
pip install uv
uv venv .venv
source .venv/bin/activate
uv pip install setuptools
uv pip install -e . --no-build-isolation

# 下载模型权重
python3 ./scripts/download_weights.py weights/

# Gradio界面运行
python3 ./demos/gradio_ui.py --model_dir weights/ --cpu_offload

# 命令行生成
python3 ./demos/cli.py --model_dir weights/ --cpu_offload \
  --prompt "A dramatic timelapse of clouds rolling over mountain peaks at golden hour"
```

**Mochi 1的优劣势**

| 优势 | 劣势 |
|------|------|
| 画质优秀，运动自然 | 生成速度慢（分钟级） |
| Apache 2.0可商用 | 显存需求高 |
| 提示词遵循度高 | 分辨率限于848x480 |
| 支持ComfyUI | 生态尚在建设中 |

> Mochi 1的效果确实惊艳，但"生成848x480分辨率的6秒视频需要数分钟"——速度是最大的痛点。

## 4.5 LTX-Video：实时视频潜在扩散的突破

LTX-Video由以色列Lightricks公司于2024年底发布，论文标题为《LTX-Video: Realtime Video Latent Diffusion》。

**核心亮点**

| 项目 | 参数 |
|------|------|
| 生成速度 | 2秒生成5秒视频 |
| 分辨率 | 768x512 |
| 帧数 | 40帧（5秒@8fps） |
| 架构 | DiT + 高效VAE |
| 显存需求 | 相对较低 |

LTX-Video的核心突破在于效率：
- 高度优化的潜在空间表示
- 减少了扩散步骤（仅需少量步数）
- 高效的3D VAE设计

**与其他模型的对比**

| 模型 | 生成时间 | 分辨率 | 时长 | 可商用 |
|------|---------|--------|------|--------|
| SVD | 约30秒 | 576x1024 | 3秒 | 否 |
| CogVideoX-2B | 约30秒 | 720x480 | 6秒 | 需登记 |
| Mochi 1 | 数分钟 | 848x480 | 5.4秒 | 是 |
| LTX-Video | 约2秒 | 768x512 | 5秒 | 是 |

> LTX-Video的出现让"实时视频生成"不再是一句口号——2秒出5秒视频，这意味着交互式应用成为可能。

**开源视频模型选型决策表**

| 你的需求 | 推荐模型 | 理由 |
|---------|---------|------|
| 快速体验视频生成 | LTX-Video | 速度快，显存友好 |
| 追求最高画质 | Mochi 1 | 10B参数，画质最佳 |
| 国内部署+API调用 | CogVideoX | 智谱API稳定，国内访问快 |
| 图生视频（从照片生成动态） | SVD | 专门的图生视频模型 |
| 可商用项目 | Mochi 1 / LTX-Video | Apache 2.0许可 |

你选哪个？评论区告诉我你的选择和理由。

---

## 本章总结

| 模型 | 架构 | 优势 | 劣势 |
|------|------|------|------|
| SVD | SD2.1+时间层 | 图生视频入门好 | 非商用，运动有限 |
| CogVideoX | DiT + 3D VAE | 国内首个API视频模型 | 显存需求高 |
| Mochi 1 | AsymmDiT 10B | 画质最佳，可商用 | 速度慢，显存高 |
| LTX-Video | DiT + 高效VAE | 实时生成，速度快 | 生态初期 |

觉得有用？收藏起来，选视频模型时直接照抄对比表。

这4个模型你用过哪个？体验如何？评论区交流。

关注怕浪猫，下期我们进ComfyUI，手把手搭视频生成工作流。

系列进度 4/8，下篇：ComfyUI视频生成工作流实战。
