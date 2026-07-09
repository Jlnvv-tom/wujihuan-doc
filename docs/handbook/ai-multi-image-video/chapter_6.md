# 第6章 LoRA微调与个性化模型训练

训练了3次的LoRA才出效果，问题出在哪？怕浪猫把踩过的坑都写在这一章了。

我是怕浪猫，「AI造物手册」第6章。前面的章节都在用别人训练好的模型，这章开始训练你自己的。LoRA是目前最实用的个性化生成方案，无论是角色一致性、风格迁移还是产品定制，LoRA都能搞定。

## 6.1 LoRA原理：用低秩矩阵实现高效微调

LoRA（Low-Rank Adaptation）的核心思想：不微调整个模型，而是在原模型旁路添加低秩矩阵，只训练这些小矩阵的参数。

**为什么LoRA有效**

一个训练好的模型，其权重矩阵通常是"过参数化"的——意味着很多维度对最终输出影响很小。LoRA利用这一点，将权重更新分解为两个小矩阵的乘积：

```
原始权重: W (d x d)
LoRA更新: W + A x B
其中 A: d x r, B: r x d, r << d
```

| 项目 | 全量微调 | LoRA微调 |
|------|---------|---------|
| 训练参数量 | 100% | 0.1%-1% |
| 显存需求 | 极高 | 中等 |
| 训练速度 | 慢 | 快 |
| 效果 | 基准 | 接近全量微调 |
| 可组合性 | 无 | 多个LoRA可叠加 |

> LoRA的精妙之处在于——你不需要修改原模型，训练完的LoRA文件只有几十到几百MB，可以随时加载和切换。

**LoRA在图片生成中的应用**

| 应用场景 | 训练数据 | 效果 |
|---------|---------|------|
| 角色LoRA | 同一角色的多角度图片 | 生成该角色的不同姿态和场景 |
| 风格LoRA | 某画师的多幅作品 | 复刻其画风 |
| 产品LoRA | 产品多角度照片 | 在不同场景中展示产品 |
| 概念LoRA | 特定概念图片 | 生成特定风格的内容 |

## 6.2 数据集准备：图片筛选、打标与裁剪规范

数据集质量决定LoRA效果的上限。再好的训练参数也救不了一个垃圾数据集。

**图片筛选标准**

| 标准 | 要求 | 说明 |
|------|------|------|
| 数量 | 15-50张 | 角色LoRA最少15张，风格LoRA需更多 |
| 分辨率 | 至少512x512 | 原始分辨率越高越好 |
| 角度多样性 | 正面、侧面、半侧面 | 避免只有单一角度 |
| 背景多样性 | 不同背景 | 避免模型把背景当特征学 |
| 表情多样性 | 多种表情 | 角色LoRA需要 |
| 清晰度 | 无模糊、无遮挡 | 遮挡会干扰学习 |

**图片裁剪与预处理**

```python
# 批量裁剪和缩放图片
import os
from PIL import Image

input_dir = "raw_images/"
output_dir = "dataset/"
target_size = 512

for filename in os.listdir(input_dir):
    if not filename.endswith(('.jpg', '.png')):
        continue
    img = Image.open(os.path.join(input_dir, filename))
    
    # 中心裁剪为正方形
    min_dim = min(img.size)
    left = (img.size[0] - min_dim) // 2
    top = (img.size[1] - min_dim) // 2
    img = img.crop((left, top, left + min_dim, top + min_dim))
    
    # 缩放到目标尺寸
    img = img.resize((target_size, target_size), Image.LANCZOS)
    img.save(os.path.join(output_dir, filename))
```

**打标（Captioning）**

每张图片需要一个文本标签文件，描述图片内容。打标方式有两种：

| 方式 | 工具 | 优缺点 |
|------|------|--------|
| 自动打标 | WD14 Tagger / BLIP | 快，但描述不够精确 |
| 手动打标 | 人工写描述 | 精确，但耗时 |

打标规范：

```
# 图片文件: 001.jpg
# 标签文件: 001.txt
# 内容示例:
sks woman, red hair, green eyes, wearing business suit, standing in office
```

打标原则：
- 用触发词标识角色/概念（如"sks woman"）
- 描述可变特征（服装、姿势、背景）
- 不要描述你想让模型学习的固定特征（如面部特征）

> 触发词是LoRA的"开关"——推理时加上这个词，模型就会调用LoRA学到的特征。

数据集准备清单：

1. 筛选15-50张高质量图片
2. 裁剪缩放到统一尺寸（512或768）
3. 每张图片写标签文件
4. 设定触发词
5. 检查标签一致性

## 6.3 训练参数详解：学习率、步数与Batch Size的选择

LoRA训练的参数调优直接影响最终效果。

**核心参数**

| 参数 | 推荐范围 | 说明 |
|------|---------|------|
| learning_rate | 1e-4 ~ 1e-5 | 学习率，控制更新幅度 |
| network_dim (rank) | 16-128 | LoRA的秩，越大容量越大 |
| network_alpha | =dim 或 dim/2 | 缩放系数，影响LoRA强度 |
| batch_size | 1-4 | 批次大小，显存不够就调小 |
| epochs | 10-20 | 训练轮数 |
| save_every_n_epochs | 1-2 | 每N轮保存一次，方便对比 |
| resolution | 512或768 | 训练分辨率 |
| optimizer | AdamW8bit / Prodigy | 优化器选择 |

**参数选择策略**

| 场景 | learning_rate | rank | epochs | 说明 |
|------|--------------|------|--------|------|
| 角色LoRA | 1e-4 | 32-64 | 15-20 | 需要精确学习面部特征 |
| 风格LoRA | 5e-5 | 64-128 | 10-15 | 风格需要更大容量 |
| 概念LoRA | 1e-4 | 16-32 | 10-15 | 简单概念用小rank即可 |
| 续训优化 | 5e-5 | 同原参数 | 5-10 | 微调已有LoRA |

> 学习率是训练最重要的参数——太大会过拟合（画面出现伪影），太小会欠拟合（学不到特征）。1e-4是怕浪猫推荐的起点。

**学习率调度**

| 调度策略 | 特点 | 推荐场景 |
|---------|------|---------|
| constant | 恒定学习率 | 短训练（<10 epochs） |
| cosine | 余弦退火 | 中长训练，平滑收敛 |
| cosine_with_restarts | 周期性重启 | 避免局部最优 |

## 6.4 Kohya_ss训练实战：从零训练一个角色LoRA

Kohya_ss是目前最流行的LoRA训练工具，支持SD1.5、SDXL，界面友好。

**环境准备**

```bash
# 克隆Kohya_ss
git clone https://github.com/bmaltais/kohya_ss.git
cd kohya_ss

# 安装依赖
pip install -r requirements.txt

# 启动GUI
python kohya_gui.py
```

**训练配置（Kohya_ss GUI参数）**

| 参数板块 | 参数 | 推荐值 |
|---------|------|--------|
| Folders | image_folder | dataset/your_character/ |
| Folders | output_folder | output/ |
| Folders | model_folder | models/ |
| Parameters | train_batch_size | 2 |
| Parameters | epoch | 15 |
| Parameters | save_every_n_epochs | 1 |
| Parameters | mixed_precision | bf16 |
| Parameters | gradient_checkpointing | 开启 |
| Network | network_dim | 64 |
| Network | network_alpha | 32 |
| Optimizer | optimizer_type | AdamW8bit |
| Learning Rate | learning_rate | 1e-4 |
| Learning Rate | lr_scheduler | cosine |
| Resolution | max_resolution | 512,512 |

**训练流程**

1. 准备数据集（图片+标签）
2. 配置训练参数
3. 开始训练
4. 每个epoch保存的LoRA分别测试
5. 选择效果最好的epoch

**测试LoRA效果**

在ComfyUI中加载LoRA并对比：

```
[Load LoRA] -> 设置strength 0.5-1.0 -> [KSampler]

提示词: "sks woman, portrait, studio lighting"
对比不同epoch的输出，选择:
- 角色特征还原度最高的
- 不过拟合的（能换衣服、换背景）
- 与原模型风格兼容的
```

**Kohya_ss训练参数模板（直接套用）**

```toml
# 配置文件示例
[Model]
pretrained_model_name_or_path = "models/sd_xl_base_1.0.safetensors"

[Dataset]
resolution = 512
batch_size = 2

[Network]
network_module = "networks.lora"
network_dim = 64
network_alpha = 32

[Optimizer]
optimizer_type = "AdamW8bit"
learning_rate = 1e-4
lr_scheduler = "cosine"
lr_warmup_steps = 100

[Training]
max_train_epochs = 15
save_every_n_epochs = 1
mixed_precision = "bf16"
gradient_checkpointing = true
```

## 6.5 模型测试与调优：过拟合的判断与回退策略

训练完不等于结束，测试和调优才是关键。

**过拟合的判断标准**

| 现象 | 过拟合程度 | 解决方案 |
|------|-----------|---------|
| 只能生成训练集中的姿态 | 严重 | 减少epochs或降低学习率 |
| 换衣服/背景时角色特征丢失 | 中等 | 用更早epoch的LoRA |
| 画面出现伪影/色块 | 严重 | 降低rank或减少epochs |
| 生成风格过于死板 | 轻微 | 降低LoRA strength到0.7 |
| 能灵活换装换背景 | 正常 | 效果理想 |

> 过拟合是LoRA训练最常见的坑——表现是"训练图复刻得很好，但换个提示词就不行"。

**调优策略**

| 问题 | 调整方向 |
|------|---------|
| 特征学不够 | 增加epochs / 提高学习率 / 增大rank |
| 过拟合 | 用更早epoch / 降低strength / 减少epochs |
| 风格污染原模型 | 降低strength / 减小rank |
| 角色一致性差 | 增加数据量 / 检查打标质量 |
| 训练不收敛 | 检查学习率 / 换优化器 |

**多LoRA叠加**

训练好的LoRA可以叠加使用，在ComfyUI中串接多个Load LoRA节点：

```
[Load Checkpoint] -> [Load LoRA (角色)] -> [Load LoRA (风格)] -> [KSampler]
```

| 叠加策略 | strength设置 | 效果 |
|---------|-------------|------|
| 角色+风格 | 角色0.8, 风格0.6 | 用你的角色画指定风格 |
| 角色+场景 | 角色0.7, 场景0.5 | 角色出现在特定场景 |
| 风格+风格 | 各0.5 | 两种风格混合 |

3步搞定LoRA调优：
1. 训练时每epoch保存
2. 逐个epoch测试，找最佳点
3. 推理时调strength微调

---

## 本章总结

| 知识点 | 关键结论 |
|--------|---------|
| LoRA原理 | 低秩矩阵旁路，只训练0.1%参数 |
| 数据集 | 15-50张高质量图，多角度多背景 |
| 训练参数 | lr=1e-4, rank=64, epochs=15 |
| 测试方法 | 每epoch保存，逐个对比选最佳 |
| 过拟合 | 换装换背景测试，不能换=过拟合 |
| 多LoRA叠加 | 串接Load LoRA节点，分别调strength |

觉得有用？收藏起来，下次训练LoRA时直接套用参数模板。

你训练过LoRA吗？遇到的最大问题是什么？评论区交流。

关注怕浪猫，下期讲AI创作的工程化——把生成能力变成自动化流水线。

系列进度 6/8，下篇：AI创作工程化与自动化流水线。
