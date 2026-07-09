# 第2章 提示词工程与生成控制

同一个模型，别人出图像大片，你出图像PPT——问题不在模型，在提示词。

我是怕浪猫，这是「AI造物手册」系列第2章。上期讲了开源生态全景，这期我们钻进提示词工程，把"写什么"和"怎么写"这件事彻底讲透。

## 2.1 正向提示词的结构化写法：主体+风格+画质+构图

很多人写提示词就是一句话丢进去，比如"a beautiful girl"。模型确实能出图，但结果完全靠运气。怕浪猫总结了一个万能提示词结构：

**主体 + 细节描述 + 风格 + 画质 + 构图**

每一部分的作用：

| 部分 | 作用 | 示例 |
|------|------|------|
| 主体 | 告诉模型画什么 | a young woman reading a book |
| 细节描述 | 丰富主体特征 | long black hair, wearing a white dress, sitting by the window |
| 风格 | 定义视觉风格 | oil painting style, impressionist |
| 画质 | 提升输出质量 | highly detailed, 8k, masterpiece |
| 构图 | 控制画面布局 | close-up portrait, golden hour lighting |

组合起来：

```
a young woman reading a book, long black hair, wearing a white dress, 
sitting by the window, oil painting style, impressionist, 
highly detailed, 8k, masterpiece, close-up portrait, golden hour lighting
```

> 提示词不是写作文，是给模型下指令——越精确，模型越不迷茫。

**权重控制**

在ComfyUI和WebUI中，可以通过括号和数字控制关键词权重：

```
(masterpiece:1.2), (best quality:1.2), a girl, (red dress:1.4), 
outdoor, (blurry background:0.8)
```

- `(word:1.4)` 表示提高该词权重40%
- `(word:0.8)` 表示降低该词权重20%
- 权重范围建议在0.5-1.5之间，过大容易出现伪影

**FLUX系列的提示词特点**

FLUX.1与SD系列不同，它使用T5-XXL作为文本编码器，支持最长256个token的自然语言提示词。这意味着你不需要堆砌关键词，可以用自然语言描述：

```
A weathered fisherman in his sixties stands on a wooden dock at dawn, 
holding a fishing net over his shoulder. The morning mist rises from 
the calm sea behind him. Shot on 85mm lens, shallow depth of field, 
warm golden light.
```

> SD靠关键词堆砌，FLUX靠自然语言描述——用对方式，效果天差地别。

你有没有遇到过这种情况：写了很长的提示词，模型却只关注了前几个词？下一节的反向提示词能帮你解决部分问题。

## 2.2 反向提示词：排除不需要的元素

正向提示词告诉模型"画什么"，反向提示词告诉模型"不画什么"。

常见反向提示词模板：

```
# 通用反向提示词
low quality, worst quality, blurry, deformed, 
bad anatomy, extra limbs, missing fingers, 
watermark, signature, text, jpeg artifacts

# 写实人像专用
cartoon, 3d, illustration, anime, painting, 
drawings, flat color, oversized eyes

# 二次元专用
realistic, photo, 3d, monochrome, grayscale
```

反向提示词使用技巧：

| 技巧 | 说明 | 示例 |
|------|------|------|
| 排除质量问题 | 去除低质量特征 | low quality, blurry, jpeg artifacts |
| 排除风格偏移 | 防止风格跑偏 | 写实场景加 cartoon, anime |
| 排除身体缺陷 | 避免手部等常见问题 | extra fingers, deformed hands |
| 排除不需要的元素 | 去除水印等 | watermark, signature, logo |

```python
# Diffusers中使用反向提示词
image = pipe(
    prompt="a woman in a red dress walking down a city street",
    negative_prompt="low quality, blurry, cartoon, anime, watermark, text",
    num_inference_steps=30,
    guidance_scale=7.5,
).images[0]
```

> 反向提示词不是越多越好——堆太多会压制模型的创造力，画面会变得平淡。

注意：FLUX.1 schnell不支持反向提示词（guidance_scale=0时的蒸馏模型），FLUX.1 dev可以配合反向提示词使用。

## 2.3 采样器与步数：DPM++ 2M Karras为什么是万金油

采样器（Sampler）决定了模型如何从噪声中逐步去噪生成图像。不同的采样器在速度和质量上有不同的权衡。

主流采样器对比：

| 采样器 | 速度 | 质量 | 特点 |
|--------|------|------|------|
| Euler a | 快 | 中等 | 适合快速测试，有随机性 |
| DPM++ 2M Karras | 中等 | 优秀 | 均衡之选，画质细腻 |
| DPM++ SDE Karras | 慢 | 极佳 | 质量最高但耗时翻倍 |
| DDIM | 快 | 中等 | 经典采样器，可复现性好 |
| UniPC | 快 | 优秀 | 新型采样器，速度质量兼顾 |

**为什么DPM++ 2M Karras是万金油？**

- 画质足够好，满足90%的使用场景
- 速度可接受，30步出图约5-10秒（取决于显卡）
- 稳定性高，不同模型和提示词下表现一致
- Karras噪声调度比默认调度在低步数时更优

> 采样器选择困难症？怕浪猫的建议：无脑选DPM++ 2M Karras，30步，出错率最低。

步数选择建议：

| 步数范围 | 适用场景 | 效果 |
|---------|---------|------|
| 4-8步 | FLUX.1 schnell专用 | 蒸馏模型，几步就够 |
| 15-20步 | 快速测试 | 能看但细节不够 |
| 25-30步 | 日常出图 | 质量与速度的最佳平衡 |
| 40-50步 | 精细出图 | 边际收益递减，仅用于最终输出 |
| 50步以上 | 通常不必要 | 浪费时间，画质提升不明显 |

## 2.4 CFG Scale与采样步数的关系：如何平衡质量与速度

CFG Scale（Classifier Free Guidance）控制模型对提示词的"服从程度"。

```
# CFG Scale的效果
CFG=1:   模型自由发挥，可能偏离提示词
CFG=3:   有一定遵循度，画面柔和
CFG=7:   标准值，遵循度与画质的平衡点
CFG=12:  强遵循度，颜色饱和度增加
CFG=20+: 过度遵循，画面出现伪影和过曝
```

CFG与步数的配合策略：

| 场景 | CFG | 步数 | 说明 |
|------|-----|------|------|
| 快速草稿 | 3-5 | 15 | 先看构图对不对 |
| 日常出图 | 7 | 30 | 标准配方 |
| 精细人像 | 7-9 | 40 | 皮肤细节更丰富 |
| 风格化插画 | 8-12 | 30 | 增强风格表现力 |

> CFG不是越高越好——超过15基本都会翻车，过曝和伪影会毁掉整张图。

**FLUX系列的CFG差异**

FLUX.1 dev的推荐CFG范围是3.5-4.5，远低于SD系列的7。这是因为FLUX的文本编码器（T5-XXL）对提示词理解更强，不需要高CFG来强制对齐。

```python
# FLUX.1 dev推荐参数
image = pipe(
    prompt="...",
    num_inference_steps=28,
    guidance_scale=3.5,  # 注意FLUX的CFG远低于SD
).images[0]

# FLUX.1 schnell推荐参数
image = pipe(
    prompt="...",
    num_inference_steps=4,
    guidance_scale=0.0,  # schnell不需要CFG
).images[0]
```

3步搞定参数调优：
1. 先用标准参数（CFG=7, 30步, DPM++ 2M Karras）出一张基线图
2. 调CFG控制遵循度，调步数控制细节
3. 对比效果，找到你的最佳组合

## 2.5 种子控制与批量生成：可复现的图片创作流程

种子（Seed）是随机噪声的初始值。相同的种子+相同的参数=相同的图片。

```python
# 固定种子，可复现
import torch

generator = torch.Generator("cuda").manual_seed(42)

image = pipe(
    prompt="a mountain landscape at sunset",
    generator=generator,
    num_inference_steps=30,
).images[0]
```

**种子的实用技巧**

| 场景 | 种子策略 | 说明 |
|------|---------|------|
| 调试提示词 | 固定种子 | 只改提示词，看效果差异 |
| 批量生成 | 随机种子 | 每张图用不同种子，增加多样性 |
| 微调参数 | 固定种子 | 改步数/CFG时固定种子，隔离变量 |
| 挑选最佳 | 随机种子x20 | 批量生成20张，挑最好的 |

```python
# 批量生成并保存
for i in range(10):
    generator = torch.Generator("cuda").manual_seed(i * 1000 + 42)
    image = pipe(
        prompt="a futuristic city skyline at night",
        generator=generator,
        num_inference_steps=30,
    ).images[0]
    image.save(f"city_{i}.png")
```

> 种子是AI创作的"存档点"——找到一张满意的图，记下它的种子，之后随时可以在这个基础上微调。

**在ComfyUI中管理种子**

ComfyUI的KSampler节点有seed和control_after_generate两个选项：
- fixed：固定种子，每次运行结果相同
- random：每次随机
- increment：每次+1
- decrement：每次-1

调试工作流时用fixed，出图时切random批量跑。

---

## 本章总结

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 提示词结构 | 主体+细节+风格+画质+构图 | 万能公式 |
| 反向提示词 | 质量排除+风格排除 | 不要堆太多 |
| 采样器 | DPM++ 2M Karras | 万金油选择 |
| 步数 | 25-30步（SD）/ 4-28步（FLUX） | 按模型选择 |
| CFG | 7（SD）/ 3.5（FLUX dev）/ 0（FLUX schnell） | 按模型选择 |
| 种子 | 调试时固定，出图时随机 | 可复现的关键 |

觉得有用？收藏起来，下次写提示词时直接套用模板。

你的提示词一般写多长？评论区说说你的习惯。

关注怕浪猫，下期我们讲图生图、局部重绘与ControlNet，让你的图片精准可控。

系列进度 2/8，下篇：图生图、局部重绘与ControlNet。
