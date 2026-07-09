# 第1章 开源AI图片生成生态全景

试了不下10个开源模型，我靠FLUX.1这个后来者彻底改观了对AI生图的认知。

我是怕浪猫，一个在AI生成领域摸爬滚打的实践者。这个系列叫「AI造物手册」，从开源模型选型到工程落地，我会带你走通AI图片与视频生成的全链路。无论你是设计师想用AI提效，还是开发者想集成生成能力，这个系列都能帮到你。

## 1.1 从Stable Diffusion到FLUX：开源文生图模型演进史

2022年8月，Stability AI发布了Stable Diffusion 1.5，这是AI图片生成领域的"iPhone时刻"。在那之前，文生图主要被DALL-E和Midjourney这样的闭源产品垄断，普通开发者只能调用API，模型权重完全黑箱。

Stable Diffusion改变了游戏规则。它把潜空间扩散模型（Latent Diffusion Model）的完整权重开源，任何人只要有块显卡就能本地生成图片。更重要的是，社区可以在此基础上微调、改进、扩展。

演进时间线大致如下：

| 时间 | 模型 | 关键突破 |
|------|------|---------|
| 2022.08 | Stable Diffusion 1.5 | 首个高质量开源文生图模型 |
| 2023.07 | Stable Diffusion XL (SDXL) | 1024x1024原生分辨率，画质大幅提升 |
| 2024.06 | Stable Diffusion 3 Medium | 2B参数，MMDiT架构，文字生成能力增强 |
| 2024.08 | FLUX.1 | 12B参数，原SD核心团队创建Black Forest Labs推出 |

> 模型开源的意义不在于免费，而在于可控——你能看到每一层在做什么，能改每一个参数。

SD3 Medium发布时社区期望很高，但实际效果不及预期，尤其是在文字渲染和手指生成上仍有瑕疵。而FLUX.1的出现几乎是一个转折点。

FLUX.1由Robin Rombach主导开发——他是Stable Diffusion的两位核心作者之一。FLUX.1基于多模态和并行扩散Transformer块的混合架构，参数量达到120亿，在图像细节、提示词遵循度和输出多样性上全面超越了SD3，社区评价其效果"比肩Midjourney v6"。

FLUX.1有三个版本：
- FLUX.1 [pro]：闭源，效果最好，通过API调用
- FLUX.1 [dev]：开源，非商业许可，面向研究和个人使用
- FLUX.1 [schnell]：开源，Apache 2.0许可，4步即可出图，可商用

> 选拍照选FLUX dev，要速度选FLUX schnell，要商用也选schnell——这个判断在2024年下半年几乎成了社区共识。

2025年，Black Forest Labs又与Krea合作推出了FLUX.1-Krea [dev]，专注于极致真实细节，消除"AI感"，兼容之前的FLUX生态。

你有没有遇到过这种情况：同一个提示词，在SD1.5和FLUX上效果天差地别？这就是模型架构演进的直接体现。

## 1.2 主流开源模型横评：SDXL、SD3 Medium、FLUX.1各有什么优势

来看一份对比表，这是怕浪猫实际测试后的总结：

| 维度 | SDXL | SD3 Medium | FLUX.1 dev |
|------|------|-----------|------------|
| 参数量 | 3.5B | 2B | 12B |
| 原生分辨率 | 1024x1024 | 1024x1024 | 1024x1024（可更高） |
| 提示词遵循度 | 中等 | 较好 | 优秀 |
| 文字渲染 | 差 | 中等 | 优秀 |
| 真实感 | 中等 | 中等偏上 | 优秀 |
| 显存需求 | 8GB+ | 12GB+ | 16GB+（量化后可降） |
| 生态丰富度 | 最丰富 | 正在建设中 | 快速增长中 |
| 商用许可 | 可商用 | 可商用 | dev不可商用，schnell可 |

几个关键结论：

**SDXL的生态优势不可忽视。** 虽然模型本身不是最强，但Civitai上有上万个LoRA、ControlNet模型基于SDXL训练。如果你需要特定风格（二次元、写实人像、建筑渲染），SDXL仍然是最省心的选择。

**SD3 Medium定位尴尬。** 参数量小但显存需求不低，效果提升有限，社区适配速度慢。等更大版本（4B、8B）开源后可能才有竞争力。

**FLUX.1是当前的开源天花板。** 画质、文字、手部细节全面领先，但12B参数对硬件要求高。好消息是社区已经有了GGUF量化版本，8GB显存也能跑。

> 不是最强的模型就是最适合你的——选模型要考虑你的显卡、你的风格需求、以及你需要的周边生态。

如果你是新手，我的建议是：先用SDXL练手（生态成熟、教程多），然后切到FLUX.1 schnell体验顶画质。

## 1.3 ComfyUI vs WebUI：两大赛道的前端工具该怎么选

有了模型，还需要一个前端界面来操作。目前开源生态有两大主流选择：

**Stable Diffusion WebUI（AUTOMATIC1111）**

WebUI是最早也是最流行的SD前端，特点是：
- 界面直观，标签页式操作（txt2img、img2img、Inpainting等）
- 插件生态极其丰富，几乎想得到的功能都有插件
- 上手简单，适合新手
- 缺点：吃显存、出图较慢、工作流不够灵活

**ComfyUI**

ComfyUI采用节点化（Node-based）的视觉编程范式，特点是：
- 将生图流程拆解为节点（加载模型、编码提示词、采样、解码等），用户通过连线定义数据流
- 显存管理精细，每个节点执行完可以释放中间显存
- 工作流可以保存为JSON文件，方便分享和复现
- 对小显存友好（3GB显存也能工作）
- 缺点：学习曲线陡峭，对新手不友好

| 对比维度 | WebUI | ComfyUI |
|---------|-------|---------|
| 上手难度 | 低 | 中高 |
| 显存效率 | 一般 | 优秀 |
| 工作流灵活性 | 低（线性流程） | 高（DAG节点编排） |
| 插件数量 | 最多 | 增长最快 |
| 社区趋势 | 维护中 | 快速增长，主流社区在转向 |

> 怕浪猫的建议：直接学ComfyUI。虽然前三天会痛苦，但一周后你会发现再也回不去WebUI了。

ComfyUI已经成为主流社区的趋势。大多数新模型（包括FLUX.1）的首发支持都是ComfyUI，新教程和工作流分享也以ComfyUI为主。

A方案（WebUI）还是B方案（ComfyUI）？你选哪个？评论区告诉我。

## 1.4 模型下载与版权：Hugging Face与Civitai的使用指南

模型去哪下载？这是新手最常问的问题。两个核心平台：

**Hugging Face（huggingface.co）**

这是AI领域的"GitHub"。几乎所有开源模型都会首发在这里。使用方式：

```bash
# 方法1：通过diffusers库直接加载
pip install diffusers
```

```python
from diffusers import StableDiffusionXLPipeline
import torch

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

image = pipe("a cat sitting on a chair").images[0]
image.save("cat.png")
```

```bash
# 方法2：通过huggingface-cli下载模型权重
huggingface-cli download stabilityai/stable-diffusion-xl-base-1.0
```

部分模型（如SD3）是"gated model"，需要先在页面上填写一份使用声明，同意条款后才能下载。

**Civitai（civitai.com）**

这是模型分享社区，特点是：
- 以Checkpoint、LoRA、Embedding等.safetensors格式为主
- 有大量用户上传的微调模型和风格模型
- 每个模型有示例图和评分
- 版权标注明确（CreativeML Open RAIL-M等）

版权注意事项：

| 许可类型 | 能否商用 | 典型模型 |
|---------|---------|---------|
| Apache 2.0 | 可以 | FLUX.1 schnell |
| CreativeML Open RAIL-M | 可以（有条件） | SDXL、SD 1.5 |
| FLUX.1 dev许可 | 不可以（仅研究/个人） | FLUX.1 dev |
| SD3 Medium许可 | 可以（有条件） | SD3 Medium |

> 下载模型前先看License，这是怕浪猫踩过的坑——用错许可的模型做商业项目，法律风险不小。

## 1.5 实战：用Diffusers库10行代码生成第一张AI图片

理论讲够了，来动手。用Hugging Face的Diffusers库，10行代码生成你的第一张AI图片：

```python
# install: pip install diffusers torch
from diffusers import DiffusionPipeline
import torch

# 加载FLUX.1 schnell模型（4步出图，速度快）
pipe = DiffusionPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-schnell",
    torch_dtype=torch.float16
).to("cuda")

# 生成图片
image = pipe(
    "A serene mountain lake at sunset, reflections in calm water, photorealistic",
    num_inference_steps=4,
    guidance_scale=0.0,
).images[0]

image.save("my_first_ai_image.png")
```

就这么简单。如果你显存不够，可以用CPU推理（慢但能跑）：

```python
# CPU模式（去掉.to("cuda")）
pipe = DiffusionPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-schnell",
    torch_dtype=torch.float32
)
# 生成会慢很多，但功能完整
```

如果想用SDXL：

```python
from diffusers import StableDiffusionXLPipeline
import torch

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

image = pipe(
    "a cyberpunk city street at night, neon lights, rain reflections",
    num_inference_steps=30,
    guidance_scale=7.5,
).images[0]

image.save("cyberpunk.png")
```

3步搞定AI生图开发：
1. 安装diffusers和torch
2. 加载模型（from_pretrained）
3. 传入提示词生成（pipe(prompt)）

> 工具链已经简化到这种程度了——剩下的瓶颈不是技术，是你的提示词能力和审美。

---

## 本章总结

| 知识点 | 关键结论 |
|--------|---------|
| 模型演进 | SD1.5 -> SDXL -> SD3 -> FLUX.1，FLUX.1是当前开源天花板 |
| 模型选择 | 新手用SDXL，追求画质用FLUX.1，商用选FLUX.1 schnell |
| 前端工具 | WebUI适合入门，ComfyUI是专业选择 |
| 模型下载 | Hugging Face用于基础模型，Civitai用于微调模型 |
| 快速上手 | Diffusers库10行代码即可生成图片 |

觉得有用？收藏起来，下次选模型时直接照抄对比表。

你用过哪个开源模型？体验如何？评论区交流一下。

关注怕浪猫，下期我们拆解：提示词工程的5种套路，让你的出图质量翻倍。

系列进度 1/8，下篇：提示词工程与生成控制。
