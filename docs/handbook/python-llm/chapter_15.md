# 第15章 模型微调与文本分类 — 让通用模型变身专家

你有没有遇到过这种情况：满怀期待地下载了一个开源大模型，喂给它你的业务数据，结果它表现得像个刚入职的实习生——答非所问、分类混乱、幻觉满天飞。你心想，是不是该换个更大的模型了？或者是不是该买更多显卡了？别急，在你砸钱买卡之前，怕浪猫建议你先试试微调这一条路。

我是怕浪猫，一个在大模型工程化这条路上踩了无数坑、也填了无数坑的老兵。从最早的BERT微调到现在的LoRA微调，我经历了几乎所有主流微调方案的迭代。今天这章，我们聊的是模型微调与文本分类的实战全流程——从数据准备到加载模型，从指令微调到LoRA（Low-Rank Adaptation，低秩适配）轻量化微调，一步步把一个通用模型调教成你的领域专家。这是整个系列的第15章，前面我们打好了PyTorch基础、搞定了数据工程、玩转了Transformer架构，现在终于到了大家最期待的"炼丹"环节。

> 模型是种子，数据是土壤，微调是修剪——三者缺一不可，才能长出你要的那棵树。

## 15.1 导学与数据准备

### 15.1.1 为什么需要微调

预训练模型（Pre-trained Model）是在海量通用语料上训练出来的，它什么都知道一点，但什么都不精。就像一个读了整个图书馆的人，你问他医学问题，他能给你背一段教科书上的定义，但让他做临床诊断，他就抓瞎了。你问他法律问题，他能说出法条内容，但让他帮你写一份合同，他可能把继承法和合同法混在一起给你整出个四不像来。

微调（Fine-tuning）做的事就是把通用模型往特定任务上拉。本质上是利用已有知识作为起点，在少量领域数据上继续训练，让模型学会"在什么场景下用什么方式回答"。打个比方，预训练像是让一个人读完所有的医学教科书，微调像是让他在某个科室实习三个月——教科书知识是基础，实习经验让他知道怎么把知识用在实际场景中。

微调的几种常见路线，怕浪猫帮你整理成一张对比表：

| 微调方式 | 参数更新量 | 显存需求 | 适用场景 | 代表方法 |
|---------|-----------|---------|---------|---------|
| 全参数微调（Full Fine-tuning） | 所有参数 | 高 | 数据充足、效果优先 | 直接训练全部权重 |
| 部分微调（Partial Fine-tuning） | 只解冻顶层 | 中 | 数据较少、快速验证 | 冻结底层，训练顶层 |
| LoRA微调 | 低秩适配矩阵 | 低 | 资源有限、多任务切换 | 注入可训练低秩矩阵 |
| Prefix Tuning | 前缀向量 | 极低 | 超大模型、极少数据 | 优化可学习前缀 |

这几种方式不是互相排斥的，实际项目中可以组合使用。比如先用LoRA快速验证数据质量和任务可行性，确认没问题后再上全参数微调追求极限效果。

> 数据决定上限，算法只是逼近这个上限的工具。垃圾进，垃圾出——这条铁律在微调领域尤其残酷。

### 15.1.2 微调数据来源

数据是微调的灵魂。怕浪猫在过往项目中见过太多团队花大量时间调超参、换模型，却忽略了数据质量，最后效果不好还怪模型不行。说实话，大部分微调效果不理想的案例，根因都在数据上。

常见数据来源有这样几个渠道：

第一是公开数据集。Hugging Face Datasets、阿里云天池、Kaggle等平台上有大量标注好的领域数据。优点是免费、量大，缺点是和你业务场景的匹配度可能不高。怕浪猫建议把公开数据集当作起点，而不是终点。

第二是业务积累数据。客服对话记录、用户标注结果、人工审核日志——这是最宝贵的，因为它们直接来自你的真实业务场景。这类数据的标签质量通常最高，分布也最接近线上环境。但要注意脱敏处理，别把用户隐私塞进模型里。

第三是合成数据。用大模型生成指令数据，再用人工筛选。这招适合冷启动阶段，业务数据还太少的时候用来补量。但合成数据天然有分布偏差，不能完全替代真实数据。怕浪猫的经验是合成数据占比不要超过30%。

第四是开源指令数据集。比如Alpaca格式的52K条指令数据、ShareGPT收集的对话数据等。这些数据适合做通用指令跟随能力的微调，但不适合特定领域任务。

> 十个微调项目失败的原因里，七个是数据问题，两个是超参问题，一个是代码bug。先搞定数据，再谈别的。

### 15.1.3 指令数据格式

指令微调（Instruction Fine-tuning）的核心是把不同任务统一成"指令-输入-输出"的格式。这种格式由Stanford Alpaca项目推广开来，后来成了事实标准。它之所以好用，是因为它把所有NLP（Natural Language Processing，自然语言处理）任务都归一化成了"给指令、给输入、要输出"的统一范式，模型不需要知道任务类型，只需要跟着指令走。

标准格式长这样：

```json
{
  "instruction": "判断以下文本的情感倾向",
  "input": "这家餐厅的服务态度真好，菜品也很新鲜",
  "output": "正面"
}
```

三个字段各自承担明确的职责。instruction字段是任务指令，告诉模型要做什么，比如"判断情感""提取关键词""翻译成英文"等。input字段是具体输入内容，可以是一段文本、一个问题、一篇文章等。output字段是期望的输出，即标签或回答。有些数据集还会有一个history字段，存多轮对话的上下文。但对于文本分类这种单轮任务，上面三件套就够了。

怕浪猫要特别提醒的是，instruction的表述方式对效果影响很大。同样是情感分类任务，"判断以下文本的情感倾向"和"这条评论是正面还是负面？请只回答正面、负面或中性"这两种写法，可能带来几个百分点的效果差异。后者更具体、更约束，模型更容易理解你的意图。

### 15.1.4 数据质量筛选与平衡

拿到数据不代表能用。怕浪猫在实际项目中总结了四条筛选原则，每条都是用血泪教训换来的。

**原则一：去重**。完全重复或高度相似的样本会放大偏差。用MinHash或SimHash做近似去重，速度快效果好。去重不只能减少数据量，更重要的是防止模型对某些重复样本过拟合，导致在测试集上表现虚高。

**原则二：过滤低质量样本**。太短、乱码、标签错误的直接删。可以用规则过滤，比如文本长度小于5个字的、非中文字符占比超过80%的、output字段为空的。也可以训练一个小模型做质量打分，把低分样本过滤掉。这个环节怕浪猫通常能砍掉10%到20%的数据量。

**原则三：类别平衡**。如果正负样本比例是10:1，模型会倾向于全猜多数类，因为这样准确率就有90%了。处理方法包括欠采样（从多数类中随机抽和少数类同等数量）、过采样（复制少数类样本）、或者用加权损失函数（给少数类更高的loss权重）。

**原则四：指令多样性**。同一个任务用不同表述方式写指令，能提升模型的泛化能力。比如"判断情感"可以写成"这条评论是正面还是负面""分析以下文本的情感倾向""请对这段文字做情感极性判断"等多种表述。模型见过多种表述后，在推理时遇到新的表述方式也能正确理解意图。

下面是一个简单的数据平衡处理示例：

```python
import random
from collections import defaultdict

def balance_data(data_list, label_field="output", strategy="undersample"):
    """按标签分组，做欠采样或过采样平衡"""
    groups = defaultdict(list)
    for item in data_list:
        groups[item[label_field]].append(item)
    
    if strategy == "undersample":
        min_count = min(len(v) for v in groups.values())
        balanced = []
        for label, items in groups.items():
            balanced.extend(random.sample(items, min_count))
        random.shuffle(balanced)
        return balanced
    else:  # oversample
        max_count = max(len(v) for v in groups.values())
        balanced = []
        for label, items in groups.items():
            ratio = max_count // len(items)
            remainder = max_count % len(items)
            balanced.extend(items * ratio)
            balanced.extend(random.sample(items, remainder))
        random.shuffle(balanced)
        return balanced
```

代码逻辑很直观：先按标签分组，欠采样就是每个类只取最少的那个数量，过采样就是每个类都补到最多的那个数量。注意最后要shuffle一下，否则同一个类的样本会连在一起，影响训练效果。

## 15.2 数据加载

### 15.2.1 Dataset类继承

PyTorch的Dataset是数据加载的基石。我们需要自定义一个Dataset，把JSON格式的指令数据转换成模型能吃的张量。核心思路是：读取JSON文件，对每条数据做文本编码，构造labels，最后返回张量字典。

```python
import json
import torch
from torch.utils.data import Dataset

class InstructionDataset(Dataset):
    def __init__(self, data_path, tokenizer, max_length=512):
        with open(data_path, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        prompt = f"指令：{item['instruction']}\n输入：{item['input']}\n输出："
        target = item['output']
        
        full_text = prompt + target
        encoding = self.tokenizer(
            full_text, truncation=True,
            max_length=self.max_length, return_tensors='pt'
        )
        input_ids = encoding['input_ids'].squeeze(0)
        
        # 构造labels：prompt部分设为-100，只对输出计算loss
        prompt_len = len(self.tokenizer.encode(prompt))
        labels = input_ids.clone()
        labels[:prompt_len] = -100
        
        return {
            'input_ids': input_ids,
            'labels': labels,
            'attention_mask': encoding['attention_mask'].squeeze(0)
        }
```

这里有一个关键细节需要重点解释。labels中prompt部分被设为-100，这是因为PyTorch的CrossEntropyLoss默认会忽略标签值为-100的位置。这样做的好处是让模型只在输出部分计算损失，不会浪费容量去学习生成prompt。如果不这么做，模型会把大量学习预算花在记忆"指令：xxx\n输入：xxx\n输出："这个模板上，而不是学习怎么根据指令和输入生成正确的输出。

> 怕浪猫踩过的坑：一开始忘了设-100，模型训练后只会复读指令模板，完全不会回答。debug了两天才发现问题。细节决定成败，这句话在深度学习里特别真实。

### 15.2.2 文本编码与padding

Tokenizer（分词器）把文本变成token ID序列，是连接自然语言和模型的桥梁。不同模型的tokenizer不同，GPT系列用BPE（Byte Pair Encoding，字节对编码），BERT用WordPiece，它们的分词粒度和策略都有差异。

Padding（填充）是为了让一个batch内不同长度的序列对齐。因为GPU并行计算要求同一个batch内的张量形状一致，变长序列必须填充到统一长度。有两种策略：固定padding是把所有序列pad到max_length，实现简单但浪费计算资源，因为很多短序列会被pad一大堆无意义的token；动态padding是每个batch内pad到该batch最长序列的长度，高效很多。

attention_mask（注意力掩码）是一个和input_ids等长的0/1序列，用来告诉模型哪些位置是真实token（值为1），哪些是padding（值为0）。没有这个掩码，模型会把padding位置也参与注意力计算，让无意义的padding token污染整个序列的语义表示。

```python
# attention_mask构造示意
input_ids = [101, 234, 567, 102, 0, 0, 0]  # 后面3个是padding
attention_mask = [1, 1, 1, 1, 0, 0, 0]  # 真实token为1，padding为0
```

### 15.2.3 DataLoader配置与collate_fn自定义

DataLoader负责批量加载数据、打乱顺序、多线程读取。但默认的collate_fn无法处理变长序列——它假设每个样本形状一致，遇到变长张量会报错。我们需要自定义collate_fn来做动态padding。

动态padding的核心思路是：在collate_fn里找到当前batch内最长序列的长度，所有序列只pad到这个长度，而不是固定pad到max_length。这样短batch就不用做无意义的padding计算了。

```python
from torch.utils.data import DataLoader
from functools import partial

def collate_fn(batch, pad_token_id=0):
    """动态padding：按batch内最长序列对齐"""
    max_len = max(item['input_ids'].size(0) for item in batch)
    
    input_ids_list, labels_list, attn_mask_list = [], [], []
    for item in batch:
        seq_len = item['input_ids'].size(0)
        pad_len = max_len - seq_len
        
        input_ids_list.append(torch.cat([
            item['input_ids'],
            torch.full((pad_len,), pad_token_id, dtype=torch.long)
        ]))
        labels_list.append(torch.cat([
            item['labels'],
            torch.full((pad_len,), -100, dtype=torch.long)
        ]))
        attn_mask_list.append(torch.cat([
            item['attention_mask'],
            torch.zeros(pad_len, dtype=torch.long)
        ]))
    
    return {
        'input_ids': torch.stack(input_ids_list),
        'labels': torch.stack(labels_list),
        'attention_mask': torch.stack(attn_mask_list)
    }

dataset = InstructionDataset("train.json", tokenizer)
dataloader = DataLoader(
    dataset, batch_size=8, shuffle=True,
    collate_fn=partial(collate_fn, pad_token_id=tokenizer.pad_token_id or 0)
)
```

动态padding的好处是实打实的。怕浪猫实测过，在序列长度分布不均的数据集上（短的只有几十个token，长的接近512），训练速度能提升20%到40%。因为短序列的batch不用做大量padding token的无意义矩阵运算。这个优化在代码层面只是改了个collate_fn，但对训练效率的提升是实实在在的。

> 性能优化往往不在大架构，而在这些不起眼的角落里。动态padding就是那种"知道的人觉得理所当然，不知道的人白白浪费算力"的细节。

### 15.2.4 数据流全貌

把整个数据流串起来看，从原始JSON到模型输入经历了几个清晰的阶段：

```
原始JSON数据
    |
    v
InstructionDataset.__getitem__()  -- 文本拼接、编码、labels构造
    |
    v
collate_fn()  -- 动态padding、batch组装
    |
    v
DataLoader  -- 批量输出 {input_ids, labels, attention_mask}
    |
    v
模型前向传播
```

每一步都有它的意义。Dataset负责单条数据的处理逻辑，包括文本拼接、tokenize编码、labels的-100标记构造。collate_fn负责batch级别的对齐，通过动态padding让变长序列能在同一batch中并行处理。DataLoader负责迭代控制和多线程加速。职责分明，各司其职。理解了这个数据流，你就能在出问题时快速定位是哪个环节出了毛病。

## 15.3 加载预训练模型

### 15.3.1 GPT2LMHeadModel.from_pretrained()

Hugging Face的transformers库让加载预训练模型变得极其简单。一行代码就能加载一个预训练好的GPT-2模型，包括它的全部权重和配置信息。这种便利在五年前是不可想象的，那时候加载一个预训练模型要写一大堆配置代码。

```python
from transformers import GPT2LMHeadModel, GPT2Config

model_name = "gpt2"
model = GPT2LMHeadModel.from_pretrained(model_name)
config = model.config

# 查看模型参数量
total_params = sum(p.numel() for p in model.parameters())
print(f"总参数量: {total_params / 1e6:.1f}M")

# 查看模型结构
print(model)
```

from_pretrained方法做了两件事：一是根据模型名下载模型权重和配置文件到本地缓存，二是按配置实例化模型并加载权重。第一次下载会比较慢，之后会走缓存。如果你在国内，下载可能会超时，需要设置镜像源：

```python
import os
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
```

### 15.3.2 模型结构检查

加载模型后，第一件事不是急着训练，而是看它的结构。了解模型由哪些层组成、参数分布在哪里，对后面制定微调策略至关重要。就像修车得先打开发动机盖看看里面的构造一样。

GPT-2的核心结构如下：

```
GPT2LMHeadModel
  ├── transformer (GPT2Model)
  │     ├── wte (词嵌入层 Word Token Embedding)
  │     ├── wpe (位置嵌入层 Word Position Embedding)
  │     ├── drop (Dropout层)
  │     └── h (Transformer Block × N)
  │           ├── ln_1 (LayerNorm层)
  │           ├── attn (因果自注意力 Causal Self-Attention)
  │           ├── ln_2 (LayerNorm层)
  │           └── mlp (前馈神经网络 Feed-Forward Network)
  └── lm_head (语言模型输出头, Linear层)
```

GPT-2 Small有12层Transformer Block（即N=12），隐藏维度768，词表大小50257。每个Block包含一个因果自注意力层和一个前馈神经网络层，中间用LayerNorm做归一化。lm_head是一个维度为[768, 50257]的线性层，负责把隐状态映射到词表空间，输出每个token的概率分布。整个模型约124M参数，在当下看不算大，但用来学习微调流程绰绰有余。

### 15.3.3 分类头替换

如果你要做文本分类而不是文本生成，需要把lm_head换成分类头。分类头是一个[hidden_size, num_classes]的线性层，输出每个类别的logits。本质上是从"在词表里选一个token"变成"在类别列表里选一个类别"。

```python
import torch.nn as nn
from transformers import GPT2Model

class GPT2ForClassification(nn.Module):
    def __init__(self, model_name, num_classes):
        super().__init__()
        self.gpt2 = GPT2Model.from_pretrained(model_name)
        self.classifier = nn.Linear(self.gpt2.config.n_embd, num_classes)
        self.dropout = nn.Dropout(0.1)
    
    def forward(self, input_ids, attention_mask=None):
        outputs = self.gpt2(input_ids, attention_mask=attention_mask)
        hidden_states = outputs.last_hidden_state
        pooled = hidden_states[:, -1, :]  # 取最后一个token
        logits = self.classifier(self.dropout(pooled))
        return logits
```

这里有个设计选择：用哪个位置的隐状态做分类？这几种策略各有特点：

| 池化策略 | 做法 | 适用场景 | 优缺点 |
|---------|------|---------|--------|
| Last Token | 取序列最后一个token | GPT系列 | 适合因果注意力，信息聚合度高 |
| CLS Token | 在序列开头加[CLS]，取其输出 | BERT系列 | 需特殊token，位置稳定 |
| Mean Pooling | 对所有token隐状态取平均 | 通用 | 信息全面，但可能稀释关键信息 |
| Max Pooling | 取所有token隐状态的最大值 | 少用 | 保留最强信号，但易受噪声影响 |

对于GPT系列，因为它是从左到右的因果注意力（Causal Attention），每个位置只能看到它之前的token，所以最后一个token"看到了"前面所有token的信息，取最后一个token做分类是自然且合理的选择。

> 分类头的选择不是小事。怕浪猫在比赛中见过只改了池化策略就从89%提升到91%的案例。每个百分点在排名里都是真金白银。

### 15.3.4 冻结vs解冻参数

全参数微调意味着所有参数都更新，效果通常最好，但显存消耗大、容易过拟合，尤其是在数据量有限的情况下。冻结（Freezing）是让部分参数不参与梯度更新，减少计算量和过拟合风险。原理是利用预训练模型底层学到的通用语言学特征，只训练顶层来适配特定任务。

```python
def freeze_parameters(model, freeze_layers=6):
    """冻结前N层Transformer Block"""
    for param in model.gpt2.wte.parameters():
        param.requires_grad = False
    for param in model.gpt2.wpe.parameters():
        param.requires_grad = False
    
    for i in range(freeze_layers):
        for param in model.gpt2.h[i].parameters():
            param.requires_grad = False
    
    for param in model.classifier.parameters():
        param.requires_grad = True
    
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"可训练: {trainable/1e6:.1f}M / {total/1e6:.1f}M ({trainable/total*100:.1f}%)")
```

> 冻结就像给模型戴了个眼罩，让它只学新知识，不忘记旧知识。但冻结太多层，模型容量不够；冻结太少，又容易过拟合。这个平衡点得靠实验找，没有放之四海皆准的答案。

部分微调的常见策略对比：

| 策略 | 冻结内容 | 可训练参数占比 | 效果预期 |
|------|---------|--------------|---------|
| 只训练分类头 | 除分类头外全部冻结 | 不到1% | 基线效果，快速验证 |
| 冻结底层 | 冻结前6-8层 | 30-50% | 效果较好，推荐起点 |
| 解冻顶层 | 只冻结嵌入层 | 70-90% | 接近全参数微调 |
| 全参数微调 | 不冻结 | 100% | 效果最好但需大数据 |

怕浪猫的建议是：数据量少于1万条时，从"只训练分类头"开始验证可行性；数据量在1万到10万之间时，用"冻结底层"策略；数据量超过10万条时，可以尝试全参数微调。

## 15.4 指令微调

### 15.4.1 指令模板设计

指令微调的关键是把不同任务统一成同一个格式。模板设计直接影响模型理解任务的效果。一个好的模板能让模型"一看就懂"，一个差的模板会让模型"一脸懵逼"。

好的模板应该做到三点：任务明确，模型一看就知道要做什么；边界清晰，指令和输入之间有明确分隔符；格式一致，训练和推理时必须用完全相同的模板。

```python
INSTRUCTION_TEMPLATE = (
    "下面是一个指令，请根据输入内容完成任务。\n\n"
    "指令：{instruction}\n"
    "输入：{input}\n"
    "输出："
)

classification_example = INSTRUCTION_TEMPLATE.format(
    instruction="判断以下评论的情感倾向，可选标签：正面、负面、中性",
    input="这个产品用了一周就坏了，客服态度还差"
)
# 期望输出："负面"
```

模板里的"下面是一个指令，请根据输入内容完成任务"这段引导语不是必须的，但怕浪猫发现加上它能提升模型对指令的理解度，尤其是小模型。另外，在instruction里给出可选标签（如"正面、负面、中性"）能显著提升分类准确率，因为这约束了模型的输出空间，减少幻觉。

### 15.4.2 输入构造 instruction+input

输入构造的核心是把指令和实际输入拼接成一段连续文本，然后送入tokenizer编码。这里有一个容易踩的坑：tokenizer对prompt单独编码和对prompt+target拼接编码时，得到的前缀长度不一定相等。因为有些tokenizer在文本末尾是否加特殊token、不同上下文下分词边界等细节上行为不一致。

> 怕浪猫的经验：永远用实际编码结果来确认边界，不要靠字符串长度去猜。tokenizer的分词逻辑可能和你想的完全不一样，尤其涉及中英混合文本时。

### 15.4.3 微调训练循环

训练循环是整个微调流程的核心发动机。一个完整的训练循环包含五个步骤：前向传播计算输出、损失计算、反向传播求梯度、梯度裁剪防爆炸、参数更新加梯度清零。每一步都有它的作用，少了任何一步训练都可能出问题。

```python
import torch
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR

def train_epoch(model, dataloader, optimizer, scheduler, device):
    model.train()
    total_loss = 0
    
    for step, batch in enumerate(dataloader):
        input_ids = batch['input_ids'].to(device)
        labels = batch['labels'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        
        outputs = model(input_ids=input_ids, labels=labels,
                        attention_mask=attention_mask)
        loss = outputs.loss
        loss.backward()
        
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        optimizer.zero_grad()
        scheduler.step()
        
        total_loss += loss.item()
        if step % 50 == 0:
            print(f"Step {step}/{len(dataloader)}, Loss: {loss.item():.4f}")
    
    return total_loss / len(dataloader)
```

几个关键点详细解释一下。

**梯度裁剪**（Gradient Clipping）：Transformer模型训练时容易出现梯度爆炸，尤其当序列较长或学习率较大时。裁剪到max_norm=1.0意味着如果梯度的L2范数超过1.0，就按比例缩放到1.0。这是个安全阀，不影响正常训练，但能防止训练崩溃。

**学习率调度**（Learning Rate Schedule）：Cosine退火策略在训练初期保持较大学习率快速收敛，后期逐渐减小做精细调整。比固定学习率效果好很多。更好的做法是前面加一段warmup阶段，学习率从0线性增长到初始值再开始退火。warmup的作用是让模型在训练初期缓慢探索，避免一开始就走偏。

**optimizer.zero_grad()的位置**：放在step()之后是习惯写法，也可以放在backward()之前。关键是确保每个iteration的梯度是干净的，不会和上一个iteration的梯度累积。如果你要用梯度累积，就故意不每次都清零，而是累积几个step后再清零。

> 训练循环写起来不难，但每个细节都值得深究。怕浪猫见过太多人训练效果不好，最后发现是忘了zero_grad或者scheduler放错了位置。基础功不扎实，再好的模型也白搭。

### 15.4.4 损失计算与优化

指令微调的损失函数用的是交叉熵损失（Cross-Entropy Loss）。模型输出的是词表大小的一个logits向量，通过softmax转成概率分布，和真实标签做交叉熵。

```python
def compute_loss(logits, labels):
    """因果语言模型的损失计算"""
    # 错位：位置i预测位置i+1
    shift_logits = logits[..., :-1, :].contiguous()
    shift_labels = labels[..., 1:].contiguous()
    
    loss_fn = nn.CrossEntropyLoss(ignore_index=-100)
    loss = loss_fn(
        shift_logits.view(-1, shift_logits.size(-1)),
        shift_labels.view(-1)
    )
    return loss
```

这里有个关键的错位操作需要解释。在因果语言模型中，位置i的输出预测的是位置i+1的token。所以计算损失时，要把logits的最后一位去掉（因为最后一个位置没有下一个token来监督它），把labels的第一位去掉（因为第一个token没有前一个位置来预测它）。错位后对齐，就是正确的预测-标签对应关系。

> 损失函数不是越复杂越好。在微调阶段，简单的交叉熵加上好的数据，往往比花哨的对比学习损失效果更稳定。别为了炫技把简单问题搞复杂了。

### 15.4.5 训练监控

训练过程中的监控至关重要。怕浪猫的习惯是记录四个核心指标：Training Loss看是否在下降、Learning Rate确认调度器正常、Gradient Norm看训练稳定性、GPU Memory防OOM（Out of Memory，内存溢出）。

```python
class TrainingLogger:
    def __init__(self):
        self.history = {
            'train_loss': [], 'learning_rate': [],
            'grad_norm': [], 'epoch': []
        }
    
    def log(self, loss, lr, grad_norm, epoch):
        self.history['train_loss'].append(loss)
        self.history['learning_rate'].append(lr)
        self.history['grad_norm'].append(grad_norm)
        self.history['epoch'].append(epoch)
    
    def save(self, path):
        import json
        with open(path, 'w') as f:
            json.dump(self.history, f, indent=2)
```

训练日志不仅能帮你发现当前训练的问题，还能在后续实验中作为对比依据。比如你改了一个超参，想知道效果是变好还是变差，直接对比两次的loss曲线就一目了然。养成记录的习惯，未来的你会感谢现在的你。

## 15.5 评估与LoRA微调

### 15.5.1 matplotlib绘制loss曲线

训练完成后，第一件事就是看loss曲线。一条健康的loss曲线应该是：开始快速下降，然后逐渐平缓，最后收敛在一个稳定值。如果loss从一开始就不下降，说明学习率可能太小或者数据有问题。如果loss震荡剧烈，可能是batch size太小或者学习率太大。如果loss突然飙升，多半是梯度爆炸，检查梯度裁剪是否生效。如果loss降到很低但验证集效果差，那是过拟合了，需要加正则化或减少训练轮数。

```python
import matplotlib.pyplot as plt

def plot_training_curve(log_path, save_path='loss_curve.png'):
    with open(log_path, 'r') as f:
        history = json.load(f)
    
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    
    axes[0].plot(history['train_loss'], alpha=0.7)
    axes[0].set_title('Training Loss')
    axes[0].set_xlabel('Step')
    axes[0].set_ylabel('Loss')
    axes[0].set_yscale('log')
    
    axes[1].plot(history['learning_rate'])
    axes[1].set_title('Learning Rate')
    axes[1].set_xlabel('Step')
    axes[1].set_ylabel('LR')
    
    axes[2].plot(history['grad_norm'], alpha=0.7)
    axes[2].set_title('Gradient Norm')
    axes[2].set_xlabel('Step')
    axes[2].set_ylabel('Norm')
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.show()
```

> Loss曲线是模型训练的心电图。学会看这张图，你就掌握了一半的训练调参能力。另一半靠经验，而经验就是从一张张loss曲线中积累出来的。

### 15.5.2 评估指标体系

对于文本分类任务，光看loss不够，需要实际的分类指标来量化模型性能。怕浪猫在这里详细介绍四个核心指标。

**准确率（Accuracy）**：分类正确的样本数除以总样本数。看似简单直观，但在类别不平衡时会产生严重误导。假设数据集中90%是正面样本，模型什么都不做、全猜正面也有90%准确率，但这显然不能说明模型好。

**精确率（Precision）**：预测为正的样本中，实际为正的比例。公式是TP / (TP + FP)。衡量的是"模型说正的时候有多可信"。

**召回率（Recall）**：实际为正的样本中，被预测为正的比例。公式是TP / (TP + FN)。衡量的是"真正的正例有多少被找出来了"。

**F1 Score**：精确率和召回率的调和平均数。公式是2 * P * R / (P + R)。它综合衡量了精确率和召回率，在类别不平衡时比准确率更有参考价值。

```python
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support,
    confusion_matrix, classification_report
)

def evaluate_classification(model, eval_dataloader, device, label_names):
    model.eval()
    all_preds, all_labels = [], []
    
    with torch.no_grad():
        for batch in eval_dataloader:
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            logits = model(input_ids, attention_mask=attention_mask)
            preds = torch.argmax(logits, dim=-1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(batch['labels'].cpu().numpy())
    
    accuracy = accuracy_score(all_labels, all_preds)
    precision, recall, f1, _ = precision_recall_fscore_support(
        all_labels, all_preds, average='weighted')
    
    print(f"准确率: {accuracy:.4f}")
    print(f"精确率: {precision:.4f}")
    print(f"召回率: {recall:.4f}")
    print(f"F1 Score: {f1:.4f}")
    print(classification_report(all_labels, all_preds, 
                                target_names=label_names))
    
    return {'accuracy': accuracy, 'f1': f1}
```

### 15.5.3 混淆矩阵

混淆矩阵（Confusion Matrix）能直观展示模型在哪些类别之间容易混淆。它是一个N x N的矩阵，行代表真实标签，列代表预测标签，对角线上的值表示分类正确的数量，非对角线的值表示分类错误的分布。

```python
def plot_confusion_matrix(cm, classes, title='Confusion Matrix'):
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    ax.set(xticks=range(len(classes)), yticks=range(len(classes)),
           xticklabels=classes, yticklabels=classes,
           title=title, ylabel='True Label', xlabel='Predicted Label')
    
    thresh = cm.max() / 2
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], 'd'),
                    ha='center', va='center',
                    color='white' if cm[i, j] > thresh else 'black')
    fig.tight_layout()
    plt.savefig('confusion_matrix.png', dpi=150)
    plt.show()
```

混淆矩阵的核心价值在于发现模型的系统性错误。比如模型总把"中性"预测成"正面"，那你就要检查数据中中性样本是否太少，或者中性与正面的边界是否模糊，或者指令描述是否需要更明确地区分这两个类别。这种错误模式只有通过混淆矩阵才能一眼看出来，单看准确率和F1是发现不了的。

### 15.5.4 LoRA低秩矩阵分解

全参数微调虽好，但对显存要求高。当模型规模到7B、13B甚至更大时，全参数微调的显存需求可能是模型本身的3到4倍（因为要存梯度、优化器状态等）。LoRA（Low-Rank Adaptation）是一种参数高效微调方法，由微软研究院在2021年提出，核心思想是：模型权重的更新可以用一个低秩矩阵来近似。

LoRA的核心数学原理如下。在微调过程中，权重的更新可以表示为W' = W₀ + ΔW，其中W₀是原始权重，ΔW是微调学到的更新量。LoRA的假设是ΔW的"内在维度"很低，可以分解为两个小矩阵的乘积，即ΔW = B × A。

具体来说，W₀是d x k的矩阵被冻结不动，A是r x k的降维矩阵，B是d x r的升维矩阵，r是秩（rank），远小于k和d。前向传播变成h = W₀x + BAx = (W₀ + BA)x。训练时只更新A和B，参数量从d x k降低到r x (d + k)。

```python
import torch.nn as nn

class LoRALinear(nn.Module):
    """LoRA线性层核心实现"""
    def __init__(self, original_layer, rank=8, alpha=16):
        super().__init__()
        self.original = original_layer
        self.scaling = alpha / rank
        
        for param in self.original.parameters():
            param.requires_grad = False
        
        in_feat = original_layer.in_features
        out_feat = original_layer.out_features
        
        # A用高斯初始化，B初始化为零
        self.lora_A = nn.Parameter(torch.randn(rank, in_feat) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(out_feat, rank))
    
    def forward(self, x):
        original_output = self.original(x)
        lora_output = (x @ self.lora_A.T) @ self.lora_B.T * self.scaling
        return original_output + lora_output
```

B初始化为零矩阵是个精妙的设计。它保证了训练开始时BA=0，LoRA的输出为零，模型行为和原始模型完全一致。然后随着训练进行，B逐渐学到非零值，LoRA开始发挥作用。这种"零初始化"策略让训练过程非常稳定，不会因为随机初始化的扰动而破坏预训练模型已有的能力。

> LoRA的优雅在于它把"学什么新东西"和"已经会什么"彻底解耦。原始权重是已有知识，低秩矩阵是新知识。学完了还能merge回去，零额外推理开销。这是怕浪猫见过的最美的微调方案。

LoRA的参数量对比，让你直观感受它的压缩效果：

| 模型规模 | 全参数微调 | LoRA (r=8) | 压缩比 |
|---------|-----------|------------|--------|
| 125M (GPT-2 Small) | 125M | 0.3M | 417倍 |
| 1.5B (GPT-2 XL) | 1.5B | 4.7M | 319倍 |
| 7B (LLaMA-2) | 7B | 18M | 389倍 |
| 13B (LLaMA-2) | 13B | 33M | 394倍 |

### 15.5.5 peft库使用

Hugging Face的peft（Parameter-Efficient Fine-Tuning，参数高效微调）库封装了LoRA等参数高效微调方法，使用起来非常方便，不用手写LoRA的实现。

```python
from peft import LoraConfig, get_peft_model, TaskType

lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,                    # 秩
    lora_alpha=32,          # 缩放因子
    lora_dropout=0.1,       # LoRA层dropout
    target_modules=[        # 应用LoRA的模块
        "c_attn",           # 注意力Q/K/V投影
        "c_proj",           # 注意力输出投影
        "c_fc",             # MLP全连接层
    ],
    bias="none"
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 294,912 || all params: 124,734,720 || trainable%: 0.24%
```

几个关键参数详细解释一下。rank（r）是低秩矩阵的秩，决定LoRA的表达能力。r越大表达能力越强但参数也越多，一般取8到64之间。怕浪猫的默认选择是16，在效果和效率之间取得了较好的平衡。alpha是缩放因子，LoRA的实际更新量会被乘以alpha/r的比值。alpha越大，LoRA更新的影响越大。一般设为r的2倍，即alpha=2r。target_modules决定对哪些线性层应用LoRA，对于GPT-2，注意力的QKV投影层和MLP层是常见选择。lora_dropout是LoRA专属的dropout，因为LoRA参数少容易过拟合，加一点dropout有防过拟合效果。

### 15.5.6 模型保存与合并

LoRA微调完成后，模型保存有两种方式。

方式一是只保存LoRA权重。体积小，通常只有几MB到几十MB，但推理时需要同时加载base模型和LoRA适配器。适合需要频繁切换不同微调任务的场景——一个base模型配多个LoRA适配器，按需加载。

```python
# 保存LoRA适配器
model.save_pretrained("./lora_checkpoint")

# 加载
from peft import PeftModel
base_model = GPT2LMHeadModel.from_pretrained("gpt2")
model = PeftModel.from_pretrained(base_model, "./lora_checkpoint")
```

方式二是合并权重。把LoRA的BA矩阵加到原始权重上，得到一个完整的模型。推理时不需要peft库，和普通模型一样加载使用。合并后的模型在数学上和LoRA推理等价，但省去了运行时的额外矩阵乘法，推理延迟更低。

```python
# 合并
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./merged_model")

# 像普通模型一样加载
model = GPT2LMHeadModel.from_pretrained("./merged_model")
```

合并的原理就是把W₀ + BA的计算结果直接写入W₀，然后丢弃A和B。合并后模型大小和原始模型一样，但权重已经包含了微调学到的知识。

> 生产环境推荐合并后再部署。省去了加载adapter的步骤，推理链路更简单，延迟更低。而且部署时不依赖peft库，减少了环境配置的麻烦。

### 15.5.7 LoRA微调完整流程清单

怕浪猫把LoRA微调的完整流程整理成清单，方便你收藏查阅：

```
LoRA微调清单
├── 1. 数据准备
│   ├── 收集领域数据，格式化为instruction/input/output
│   ├── 数据清洗：去重、去噪、纠标签
│   ├── 类别平衡：欠采样/过采样/加权损失
│   └── 划分train/val/test集
├── 2. 数据加载
│   ├── 自定义Dataset类，实现__getitem__
│   ├── collate_fn动态padding
│   ├── labels中prompt部分设为-100
│   └── DataLoader配置batch_size和num_workers
├── 3. 模型准备
│   ├── 加载base模型
│   ├── 检查模型结构，确定target_modules
│   ├── 配置LoraConfig (r/alpha/dropout/target_modules)
│   └── get_peft_model()应用LoRA
├── 4. 训练
│   ├── AdamW优化器，lr=2e-5到5e-4
│   ├── Cosine学习率调度 + warmup
│   ├── 梯度裁剪 max_norm=1.0
│   ├── 训练监控：loss/lr/grad_norm
│   └── Early Stopping防止过拟合
├── 5. 评估
│   ├── 准确率/精确率/召回率/F1
│   ├── 混淆矩阵分析
│   ├── 分类报告
│   └── 与base模型对比
└── 6. 保存与部署
    ├── save_pretrained()保存LoRA权重
    ├── merge_and_unload()合并权重
    └── 合并后模型直接部署
```

### 15.5.8 全参数微调 vs LoRA微调效果对比

怕浪猫在情感分类任务上做过系统的对比实验。数据集约5万条，三分类（正面/负面/中性），使用GPT-2 Small作为base模型，训练3个epoch：

| 指标 | 全参数微调 | LoRA (r=16) | LoRA (r=8) |
|------|-----------|-------------|------------|
| 准确率 | 91.2% | 90.8% | 89.5% |
| F1 Score | 90.9% | 90.5% | 89.1% |
| 训练显存 | 24GB | 8GB | 6GB |
| 训练时间 | 3.2h | 2.8h | 2.5h |
| 模型大小 | 500MB | 12MB | 6MB |
| 可训练参数 | 125M | 0.6M | 0.3M |

结论很清晰。在数据量适中的分类任务上，LoRA r=16的效果接近全参数微调，准确率只差0.4个百分点，但显存需求只有三分之一，模型体积只有四十分之一。对于资源有限的个人开发者和小团队，LoRA是首选方案。即使你有足够的显卡，LoRA也值得一试——因为它训练更快、更容易切换不同任务，而且在数据量较少时泛化能力往往更好（参数少意味着更难过拟合）。

> 选择微调策略就像选交通工具。全参数微调是高铁——快但贵；LoRA是电动自行车——便宜灵活，大多数场景够用了。关键是选对场景，而不是一味追求最强。

### 15.5.9 常见问题与排坑指南

怕浪猫根据实战经验，整理了四个最高频的问题和解决方案。

**问题一：LoRA训练loss不下降**

可能原因和解决方法：学习率太小——LoRA的学习率通常比全参数微调大一个数量级，建议从1e-4到5e-4开始；target_modules没选对——检查模型结构，确保LoRA应用在了正确的层上，可以用print(model)查看模块名；数据格式有误——打印几条训练样本，确认input_ids和labels的对齐关系，特别是-100标记的位置是否正确。

**问题二：合并后模型效果变差**

可能原因：合并时精度丢失——尝试用fp32精度合并，再转换为fp16或bf16；alpha/r比值过大——导致原始权重被LoRA更新淹没，适当降低alpha值。

**问题三：显存还是不够**

这是最常见的问题。尝试以下手段逐步降低显存：减小batch_size，用梯度累积（Gradient Accumulation）补偿batch size减小带来的梯度噪声；启用gradient checkpointing，用计算换显存，能省约40%显存但训练速度慢约30%；用8-bit Adam优化器（bitsandbytes库），优化器状态从32位降到8位；降低LoRA的rank，比如从16降到8。

**问题四：分类效果差但loss正常下降**

这是典型的过拟合信号。模型在训练集上表现好（loss低），但在验证集上表现差（准确率低），说明它记住了训练数据而不是学到了泛化能力。解决方案：减少训练轮数，加Early Stopping监控验证集指标；增加lora_dropout，给LoRA层加更多正则化；检查数据质量，特别是标签是否有噪声——标注错误是过拟合的常见原因；用K折交叉验证评估，确保结果不是偶然。

到这里，模型微调与文本分类的完整链路就讲完了。从数据准备到Dataset设计，从模型加载到指令微调训练循环，从评估指标到LoRA轻量化微调，每个环节都有它的门道和坑。微调不是黑魔法，而是工程和实验的结合——理解原理，控制变量，用数据说话。怕浪猫希望你读完这章后，不是记住某个具体的参数配置，而是理解每一步为什么这么做，这样在面对不同任务时才能举一反三。

最后再强调一句：微调的效果上限由数据决定，不是由技巧决定的。花80%的时间在数据上，20%的时间在调参上，这个比例才是健康的。如果你发现自己花了大部分时间在调超参上，停下来，回头看看你的数据。

如果你觉得这篇文章对你有帮助，收藏起来，后面实战的时候翻出来对着照做就行。有什么问题评论区见，怕浪猫会逐条回复。下一章我们聊知识蒸馏（Knowledge Distillation），教你把大模型的能力压缩到小模型里，让推理成本降一个数量级，敬请追更。

系列进度 15/19

怕浪猫说：微调的路上没有银弹，只有一次次的实验和迭代。但当你看到模型第一次在你自己的数据上输出正确结果的那一刻，所有的折腾都值了。下章见。
