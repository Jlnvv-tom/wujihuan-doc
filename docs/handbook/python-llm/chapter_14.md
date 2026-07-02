# 麻雀虽小，五脏俱全 — 实现"迷你"版大语言模型

上一章怕浪猫带你完整拆解了Transformer架构，从编码器到解码器，从注意力到残差连接，每一块零件都摸了个遍。但拆零件和组装整车是两回事。你看了无数GPT架构图，读了无数论文里的公式，但从来没有亲手从零写过一个大模型。这种感觉就像看了一千道菜谱却没开过一次火。今天，怕浪猫就带你开火。我们不要PPT工程，不要调API，不要Hugging Face transformers一行加载预训练模型。我们要从零开始，用PyTorch一行一行码出一个完整的GPT模型。它能训练，能推理，能生成文本。麻雀虽小，五脏俱全。

我是怕浪猫，一个在LLM开发一线踩坑无数的工程师。这一章是整个系列最"硬核"的一章，因为代码密度极高。但怕浪猫保证，每一段代码都会讲清楚为什么这么写，踩了什么坑，有什么工程细节需要注意。跟着敲一遍，你对大模型架构的理解会从"大概知道"变成"真的会写"。

> "读懂论文让你能聊大模型，亲手实现过才让你能做大模型。纸上谈兵和真刀真枪之间，隔着一整个代码仓库的距离。"

## 14.1 导学与GPT架构设计

### GPT vs Transformer：Decoder-only架构

上一章讲过，原始Transformer是Encoder-Decoder架构，编码器负责理解输入，解码器负责生成输出。GPT（Generative Pre-trained Transformer，生成式预训练Transformer）做了一个大胆的减法——把编码器整个砍掉，只保留解码器。这就是Decoder-only架构。

为什么砍掉编码器还能work？因为语言建模本质上就是一个自回归任务：给定前面的词，预测下一个词。这个任务不需要"理解源序列再生成目标序列"的二阶段流程，它只需要一个方向——从左到右，一个词一个词地生成。解码器的掩码自注意力天然适配这个任务：每个位置只能看到它之前的词，恰好就是"给定前文预测下一个词"。

来看GPT和原始Transformer的核心架构对比：

```
GPT vs 原始Transformer 架构对比

原始 Transformer (Encoder-Decoder)
+------------------+    +------------------+
|    Encoder x N   |    |    Decoder x N   |
|                  |    |                  |
|  自注意力(双向)  |--->|  掩码自注意力    |
|  前馈网络        |    |  交叉注意力      |
|                  |    |  前馈网络        |
+------------------+    +------------------+

GPT (Decoder-only)
+------------------+
|    Decoder x N   |
|                  |
|  掩码自注意力    |  <-- 没有交叉注意力
|  前馈网络        |
|                  |
+------------------+
```

GPT砍掉了两样东西：编码器整体，以及解码器中的交叉注意力子模块。剩下的结构异常简洁——N个Transformer Block堆叠，每个Block只有两个子模块：掩码多头自注意力和前馈网络。这种简洁性带来了三个工程优势：参数效率高（没有编码器的参数浪费）、训练并行度好（不需要等编码器处理完）、架构可扩展性强（堆更多层就行）。

Decoder-only架构还有一个隐含的优势——训练和推理的一致性。Encoder-Decoder架构在训练时解码器有编码器输出作为输入，推理时编码器只跑一次然后解码器逐步生成。这种训练推理的不对称会带来一些工程复杂性。而Decoder-only在训练和推理时都是"给定前文预测下一个词"，唯一的区别是推理时是逐步生成而训练时可以并行处理整个序列。这种一致性让代码实现更简洁，也减少了训练推理gap可能引入的问题。

不过Decoder-only也有一个训练效率上的劣势。由于因果掩码的存在，每个位置只能看到之前的词，这意味着序列的前几个位置的上下文很短，训练信号有限。比如第一个位置只有一个token，它预测下一个词时没有任何上下文信息可参考。但这个劣势在实际训练中被一个优势抵消了——Decoder-only可以充分利用GPU的并行计算能力。训练时整个序列的所有位置同时计算注意力，只有掩码阻止信息"泄露"到未来位置。这种"teacher forcing"式的训练方式让Decoder-only的训练效率非常高。

> "GPT的哲学是少即是多。砍掉编码器不是偷懒，而是对语言建模任务本质的深刻理解。做减法比做加法更需要勇气和洞察力。"

### GPT-2模型配置

OpenAI在GPT-2论文中给出了几组不同规模的模型配置。我们今天实现的是最小号的那种，但架构和GPT-2完全一致。先看配置参数：

| 配置项 | GPT-2 Small | GPT-2 Medium | GPT-2 Large | GPT-2 XL | 我们的迷你版 |
|--------|------------|-------------|------------|----------|------------|
| 层数(n_layer) | 12 | 24 | 36 | 48 | 12 |
| 嵌入维度(n_embd) | 768 | 1024 | 1280 | 1600 | 768 |
| 注意力头数(n_head) | 12 | 16 | 20 | 25 | 12 |
| 词表大小(vocab_size) | 50257 | 50257 | 50257 | 50257 | 50257 |
| 上下文长度 | 1024 | 1024 | 1024 | 1024 | 256 |
| 参数量 | 124M | 355M | 774M | 1558M | ~124M |

我们的迷你版和GPT-2 Small几乎一致，唯一区别是上下文长度缩短到256。这不是架构上的改变，纯粹是为了训练和推理速度快一些，方便你在本地跑起来。把上下文长度改回1024，它就是GPT-2 Small。

词表大小50257是GPT-2的BPE（Byte Pair Encoding，字节对编码）词表大小。BPE是一种子词分词方法，它把频繁出现的字节对合并成新token。GPT-2的词表包含50256个BPE token加上1个特殊token（endoftext，表示文本结束）。我们的迷你版直接复用GPT-2的分词器和词表，不做修改。

为什么用BPE而不是字符级或词级分词？字符级分词词表太小（几十到几百），序列太长，模型难以学习长距离依赖。词级分词词表太大（几十万），大量低频词训练不充分，而且无法处理新词。BPE介于两者之间——频繁词保持完整token，低频词拆成子词，未登录词拆成单字节。这种设计让词表大小适中（5万左右），既不会序列太长，也不会词表太大，还能处理任何输入文本。GPT-2的BPE有一个特点——它是字节级的而不是字符级的，意味着任何文本（包括emoji、中文、代码等）都能被编码，不会出现UNK（Unknown token，未知词）标记。

### GPT使用可学习位置编码

这是GPT和原始Transformer的一个重要区别。原始Transformer用的是固定的sinusoidal（正弦余弦）位置编码，GPT用的是可学习的位置编码——说白了就是一个nn.Embedding，位置索引直接查表。

两种位置编码各有优劣。固定编码不需要训练，天然能处理超出训练长度的位置，但表达能力有限。可学习编码表达能力更强，模型可以自己学到位移的最佳表示方式，但最大长度受限于训练时设定的长度。后来RoPE（Rotary Position Embedding，旋转位置编码）结合了两者的优点，通过旋转矩阵将位置信息编码到注意力计算中，既支持任意长度又有良好的外推性，成为当前主流大模型如Llama系列的标准选择。但GPT-2时代还没有RoPE，可学习位置编码是最优选择。

GPT选择可学习位置编码的代码实现极其简单，和词嵌入一样就是一个查找表：

```python
# 可学习位置编码就是一个Embedding层
self.pos_emb = nn.Embedding(max_len, d_model)

# forward时根据位置索引查表
positions = torch.arange(seq_len, device=x.device)
x = x + self.pos_emb(positions)
```

就这么几行，没有花里胡哨的sin/cos公式。简洁是GPT的一贯风格。但要注意一个细节——可学习位置编码的初始化。nn.Embedding默认用正态分布初始化，这和词嵌入的初始化方式一致。有些实现会用更小的标准差（如0.02）来初始化位置嵌入，防止训练初期位置信号过强干扰词嵌入信号。GPT-2的官方实现就是用标准差0.02的正态分布初始化所有Embedding层。

还有一个容易忽视的问题——Dropout对位置嵌入的影响。词嵌入和位置嵌入相加后一起过Dropout，Dropout会随机把一些维度置零。这同时影响词嵌入和位置嵌入的信号。在训练初期，模型还不太依赖位置信息时这是可以接受的。但随着训练进行，如果Dropout率太高（比如0.3以上），位置信号可能被过度干扰，导致模型对位置的感知变弱。GPT-2用的Dropout率是0.1，这个值在位置信号保持和正则化之间取得了平衡。

## 14.2 模型骨架实现

### GPTConfig配置类

好的架构实现，第一步永远是配置类。把所有超参数集中在一处管理，修改方便，代码可读性也好。怕浪猫踩过不少坑——早期写代码时超参数散落在各处，后来改一个参数要在五个文件里找，痛不欲生。

```python
from dataclasses import dataclass

@dataclass
class GPTConfig:
    vocab_size: int = 50257      # 词表大小(GPT-2的BPE词表)
    max_seq_len: int = 256       # 最大序列长度
    n_layer: int = 12            # Transformer Block层数
    n_head: int = 12             # 多头注意力的头数
    n_embd: int = 768            # 嵌入维度(每个头的维度=768/12=64)
    embd_pdrop: float = 0.1     # Embedding层的Dropout概率
    resid_pdrop: float = 0.1    # 残差连接的Dropout概率
    attn_pdrop: float = 0.1     # 注意力的Dropout概率
```

这里有个关键细节——每个注意力头的维度。n_embd是768，n_head是12，所以每个头的维度是768/12=64。这个64不是随便选的，它和原始Transformer的d_k=64保持一致。为什么是64？因为缩放点积注意力里的缩放因子是sqrt(d_k)=8，这个尺度下softmax的梯度最稳定。如果d_k太大，点积值会过大导致softmax饱和，梯度消失；d_k太小则每个头的信息容量不足，多头机制的优势体现不出来。

assert n_embd % n_head == 0这个检查看似多余但很重要。如果n_embd不能被n_head整除，后面拆分多头时维度对不上，会报一个莫名其妙的shape错误。在配置类里加一个assertion，early fail，错误信息清晰，远比在forward里报shape error好调试。

参数配置还有一个容易忽视的问题——不同超参数之间的关联。n_embd和n_head共同决定了每个头的维度d_head，d_head又会影响注意力的缩放因子sqrt(d_head)。如果你改了n_embd但忘了改n_head，可能得到一个不理想的d_head值，训练效果变差但没有明显报错。建议在配置类里加一些合理性检查，比如n_embd >= 512、n_head >= 4、d_head >= 32等。

### GPTModel类定义

配置类有了，接下来是模型骨架。GPTModel是整个模型的核心，它把Embedding、Transformer Blocks、LayerNorm和输出投影组装到一起。先看整体结构，再逐块拆解。

```
GPTModel 数据流总览

输入token序列: [t1, t2, t3, ...]
    |
    v
[Token Embedding] -- 查表得到词向量 (batch, seq, 768)
    +
[Positional Embedding] -- 查表得到位置向量 (batch, seq, 768)
    |
    v
[Dropout] -- 随机丢弃，正则化
    |
    v
========== Transformer Block x 12 ==========
  |  LayerNorm -> MultiHeadAttention -> 残差连接
  |  LayerNorm -> FeedForward -> 残差连接
  v
[Final LayerNorm]
    |
    v
[Linear(768, 50257)] -- 投影到词表空间
    |
    v
输出: logits (batch, seq, vocab_size)
```

数据流很清晰：输入token先经过Embedding层（词嵌入+位置嵌入+Dropout），然后穿过12个Transformer Block，最后经过LayerNorm和线性投影输出logits。整个模型的核心代码骨架如下：

```python
class GPTModel(nn.Module):
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.config = config
        self.tok_emb = nn.Embedding(config.vocab_size, config.n_embd)
        self.pos_emb = nn.Embedding(config.max_seq_len, config.n_embd)
        self.drop = nn.Dropout(config.embd_pdrop)
        self.blocks = nn.ModuleList([
            TransformerBlock(config) for _ in range(config.n_layer)
        ])
        self.ln_f = nn.LayerNorm(config.n_embd)
        self.head = nn.Linear(config.n_embd, config.vocab_size, bias=False)

    def forward(self, idx, targets=None):
        b, t = idx.shape
        pos = torch.arange(t, device=idx.device)
        x = self.drop(self.tok_emb(idx) + self.pos_emb(pos))
        for block in self.blocks:
            x = block(x)
        x = self.ln_f(x)
        logits = self.head(x)
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1), ignore_index=-1
            )
            return logits, loss
        return logits
```

这个forward函数同时处理训练和推理两种模式。训练时传入targets，返回logits和loss；推理时不传targets，只返回logits。这种设计在实践很常见，好处是不需要在外面单独写loss计算逻辑，模型自己知道怎么算loss。

### Token Embedding + Positional Embedding + Dropout

GPT的Embedding层做了三件事：词嵌入、位置嵌入、Dropout。词嵌入把token ID映射为768维向量，位置嵌入把位置索引映射为同样维度的向量，两者直接相加，然后过Dropout。

这里有一个容易踩的坑。有些实现会把词嵌入和位置嵌入分别过Dropout再相加，有些是相加后一起过Dropout。GPT-2的原始实现是相加后一起过Dropout。为什么？因为Dropout的作用是防止过拟合，分别Dropout会丢失太多信息（两个Dropout叠加，保留概率变成0.9乘0.9等于0.81），而相加后一次Dropout保留概率是0.9，信息保留更多。

```python
# 正确做法：先相加再Dropout
x = self.drop(self.tok_emb(idx) + self.pos_emb(pos))

# 错误做法：分别Dropout再相加（信息丢失过多）
# x = self.drop(self.tok_emb(idx)) + self.drop(self.pos_emb(pos))
```

还有一个细节——位置嵌入的权重是随机初始化的可学习参数，和词嵌入一样用正态分布初始化。这和原始Transformer的固定sin/cos编码完全不同。可学习位置编码的最大长度在模型定义时就固定了，比如我们设的256。如果推理时输入超过256个token，位置嵌入会越界报错。这也是为什么后来RoPE会取代可学习位置编码——RoPE通过旋转矩阵编码相对位置，天然支持任意长度外推。

### Transformer Blocks堆叠

12个Transformer Block串行堆叠，每个Block的输入输出维度完全一致，都是(batch, seq_len, 768)。这种"输入输出维度不变"的设计是Transformer可堆叠性的基础。你可以像搭积木一样堆任意层数，不需要任何适配层。

```python
# 12个Block串行堆叠
self.blocks = nn.ModuleList([
    TransformerBlock(config) for _ in range(config.n_layer)
])

# forward中依次穿过每个Block
for block in self.blocks:
    x = block(x)
```

用ModuleList而不是Sequential，是因为Sequential要求每个模块的forward签名完全一致（单输入单输出），而我们的TransformerBlock在训练时可能需要返回attention weights用于可视化或分析。ModuleList更灵活，允许每个Block有自定义的forward接口。

另一个值得注意的点是参数初始化。GPT-2对所有Linear层用了特殊的初始化——权重用正态分布N(0, 0.02)，bias初始化为0。这个0.02的标准差比PyTorch默认的初始化（kaiming uniform）要小很多。为什么用更小的标准差？因为深层网络中，如果每层的权重方差太大，信号会逐层放大导致梯度爆炸。0.02的经验值在12层到48层的GPT训练中都表现稳定。

### 最终LayerNorm与输出投影

最后一个Block的输出不是直接送进Linear的。GPT在最后加了一个LayerNorm（叫做Final LayerNorm），再做投影。这个LayerNorm的作用是稳定输出分布。经过12层Block后，隐藏状态的分布可能已经偏移（内部协变量偏移），LayerNorm把它拉回标准分布，让后续的Linear投影更稳定。

输出投影层把768维隐藏状态映射到50257维（词表大小），得到每个位置上每个词的logits。注意这里bias=False，因为后面接的是交叉熵损失，softmax对logits的平移不敏感（softmax(x) == softmax(x + c)），加bias没有意义反而增加参数。

```python
self.ln_f = nn.LayerNorm(config.n_embd)
self.head = nn.Linear(config.n_embd, config.vocab_size, bias=False)

# forward
x = self.ln_f(x)
logits = self.head(x)  # (batch, seq_len, vocab_size)
```

这里还有一个权重绑定的技巧。GPT-2原始实现中，输出投影层的权重和Token Embedding的权重是共享的（Weight Tying）。这样做有两个好处：一是大幅减少参数量（768乘50257约等于38.7M的参数只算一次），二是让输入输出的语义空间对齐——词嵌入和输出投影本质上是互逆操作，共享权重在数学上是合理的。不过我们的迷你版先不做权重绑定，保持实现简单，理解架构为主。

> "架构设计的艺术在于知道什么时候该做加法，什么时候该做减法。GPT告诉我们，减法有时候比加法更有力量。每一个被砍掉的组件都不是随意舍弃的，而是基于对任务本质的深刻理解。"

## 14.3 注意力机制实现

### MultiHeadAttention类QKV投影

注意力机制是GPT的心脏。上一章怕浪猫详细讲过缩放点积注意力的计算流程，这里直接上代码实现。GPT的MultiHeadAttention（多头注意力）做了三件事：QKV投影、注意力计算、多头拼接。

先看QKV投影。输入x的形状是(batch, seq, 768)，通过三个独立的Linear层分别投影出Q（Query）、K（Key）、V（Value）：

```python
class MultiHeadAttention(nn.Module):
    def __init__(self, config: GPTConfig):
        super().__init__()
        assert config.n_embd % config.n_head == 0
        self.n_head = config.n_head
        self.d_head = config.n_embd // config.n_head
        self.q_proj = nn.Linear(config.n_embd, config.n_embd)
        self.k_proj = nn.Linear(config.n_embd, config.n_embd)
        self.v_proj = nn.Linear(config.n_embd, config.n_embd)
        self.out_proj = nn.Linear(config.n_embd, config.n_embd)
        self.attn_drop = nn.Dropout(config.attn_pdrop)
        self.resid_drop = nn.Dropout(config.resid_pdrop)
```

有些实现会把q_proj、k_proj、v_proj合并成一个大矩阵一次性投影（三个Linear合成一个Linear(n_embd, 3*n_embd)），效率上确实更高——一次矩阵乘法比三次矩阵乘法在GPU上的并行度更好，因为GPU的矩阵乘法性能高度受batch维度影响，大矩阵的并行利用率更高。但分开写更清晰，也方便做QKV共享之类的变体（如KV Cache推理优化中Q和K、V可以不同步计算）。怕浪猫这里选择清晰优先，在生产环境中可以合并优化。

QKV投影的权重初始化也值得注意。GPT-2对所有投影层用了标准差0.02的正态分布初始化。但有一个特殊处理——残差连接路径上的投影层（如out_proj和c_proj）被额外缩放了一个因子1/sqrt(2*n_layer)。为什么要缩放？因为残差连接会让信号逐层累积，12层累积下来信号方差会放大sqrt(12)倍左右。乘以1/sqrt(2*n_layer)后，每层的输出方差被控制在一个合理范围，防止深层网络信号爆炸。这个初始化技巧虽然在论文里很少提及，但在实际训练中效果显著。

Q、K、V的含义上一章讲过：Q是"我在找什么"，K是"我有什么"，V是"我的实际内容"。注意力分数就是Q和K的相似度，分数越高说明越相关，对应的V的权重就越大。这个机制让模型能够动态地决定从哪些位置提取信息。

在GPT中，Q、K、V都来自同一个输入序列——这就是"自注意力"的含义。每个位置既是信息的查询者（通过Q），也是信息的提供者（通过K和V）。位置i的Q和位置j的K做点积，得到位置i对位置j的注意力分数。如果分数高，说明位置i需要从位置j获取信息。最终的输出是所有位置V的加权和，权重就是注意力分数经过softmax后的值。

这种自注意力机制是Transformer区别于RNN的核心所在。RNN通过隐藏状态逐步传递信息，距离越远信息衰减越严重。自注意力让任意两个位置直接交互，信息传递的效率不受距离影响。这也是为什么Transformer在长文本任务上远胜RNN——注意力机制天然具有全局视野。

### Causal Mask构造tril三角矩阵

GPT是Decoder-only模型，每个位置只能看到它之前的词。这个约束通过Causal Mask（因果掩码）实现。掩码的本质是一个下三角矩阵——位置i可以看到位置0到i，不能看到位置i+1到seq_len。

```python
# 构造下三角掩码
mask = torch.tril(torch.ones(seq_len, seq_len))
# mask[i][j] = 1 if j <= i else 0

# 应用到注意力分数
scores = scores.masked_fill(mask == 0, float('-inf'))
```

torch.tril生成下三角矩阵，上三角部分全为0。masked_fill把上三角对应的注意力分数设为负无穷，这样softmax后这些位置的权重就是0——模型完全看不到未来的词。这是自回归生成的数学保证，没有这个掩码，模型就能"偷看"未来，训练时效果会很好但推理时完全无法工作。

怕浪猫在第一次实现时犯过一个低级错误——把mask方向搞反了。torch.tril生成的是下三角为1、上三角为0的矩阵。如果你误以为1表示"遮盖"、0表示"保留"，就会把mask==1的位置设为负无穷，结果模型只能看到未来的词看不到过去的词。训练loss下降得很慢但确实在下降，让人很难发现bug。直到生成时发现输出的文本完全不通顺才意识到mask搞反了。所以记住：tril矩阵中1表示"允许看到"、0表示"禁止看到"，masked_fill把0对应的位置设为负无穷。

这里有一个性能优化的点。每次forward都调用torch.tril生成掩码是浪费的，因为掩码是固定的。更好的做法是在__init__里用register_buffer预先计算好：

```python
# 在__init__中注册为buffer（不参与梯度计算，但会跟着模型一起move到设备）
self.register_buffer(
    "mask",
    torch.tril(torch.ones(config.max_seq_len, config.max_seq_len))
        .view(1, 1, config.max_seq_len, config.max_seq_len)
)
```

register_buffer是PyTorch的一个常用技巧。它把一个张量注册为模型的一部分，model.to(device)时会自动搬到对应设备，但不参与梯度计算和优化器更新。适合存放掩码这种"模型状态的一部分但不需要学习"的张量。如果你不注册为buffer而是作为普通属性存储，model.cuda()时它不会跟着搬到GPU，会导致设备不一致的错误。这个坑怕浪猫也踩过。

### 掩码应用到注意力分数

有了掩码，注意力计算的完整流程是：QK^T得到分数、缩放、应用掩码、softmax、Dropout、乘以V。来看forward的核心代码：

```python
def forward(self, x):
    B, T, C = x.shape
    # QKV投影并拆分多头
    q = self.q_proj(x).view(B, T, self.n_head, self.d_head).transpose(1, 2)
    k = self.k_proj(x).view(B, T, self.n_head, self.d_head).transpose(1, 2)
    v = self.v_proj(x).view(B, T, self.n_head, self.d_head).transpose(1, 2)

    # 注意力分数: (B, n_head, T, T)
    scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_head)
    # 应用因果掩码
    scores = scores.masked_fill(self.mask[:,:,:T,:T] == 0, float('-inf'))
    # softmax + Dropout
    attn = F.softmax(scores, dim=-1)
    attn = self.attn_drop(attn)
    # 加权求和
    out = attn @ v  # (B, n_head, T, d_head)
    return out
```

注意mask的切片。我们在__init__里预计算了max_seq_len x max_seq_len的掩码，但实际输入序列长度T可能小于max_seq_len，所以要切片self.mask[:,:,:T,:T]。如果不切片，mask的维度和scores的维度不匹配会报错。

缩放因子math.sqrt(self.d_head)就是sqrt(64)=8。缩放的目的上一章详细讲过——点积的方差随d_head线性增长，如果不缩放，d_head=64时点积值容易达到几十到上百，softmax会高度饱和（一个位置权重接近1，其他接近0），梯度消失。除以8把点积拉回合理范围。

### 多头拆分并行计算与头拼接

多头注意力的核心思想是"多视角"。768维向量被拆成12个64维的子向量，每个头在自己的64维空间里独立计算注意力，最后拼接回去。拆分通过view加transpose实现，拼接通过reshape实现。这种拆分不是物理切分而是逻辑重组——12个头共享同一个投影矩阵的权重，只是通过reshape把不同维度划分到不同头的子空间中。

```python
# 拆分: (B, T, 768) -> (B, T, 12, 64) -> (B, 12, T, 64)
q = self.q_proj(x).view(B, T, self.n_head, self.d_head).transpose(1, 2)

# 拼接: (B, 12, T, 64) -> (B, T, 768)
out = out.transpose(1, 2).contiguous().view(B, T, C)
out = self.resid_drop(self.out_proj(out))
```

这里有一个经典坑——contiguous()。transpose操作返回的是视图，不连续。view要求张量在内存中连续，所以transpose后必须先contiguous()再view，否则PyTorch会报错。怕浪猫第一次写多头注意力时就在这里卡了半天，明明逻辑都对就是跑不通。错误信息是"RuntimeError: view size is not compatible with input tensor's size and stride"，对新手来说完全看不懂什么意思。记住这个教训：transpose之后要view，中间一定加contiguous()。或者用reshape代替view加contiguous的组合，reshape内部会自动处理连续性问题，代码更简洁。但理解contiguous的原理仍然重要——面试时被问到transpose和view的关系，你能说出内存布局的细节就是加分项。

多头的意义不仅是多视角。从信息论的角度看，多头注意力增加了模型的信息带宽——单头注意力每次只能提取一种关联模式，多头可以同时提取多种不同的关联模式。研究表明，不同的头会自动学习到不同类型的依赖关系：有的头关注语法依赖（如主谓一致），有的头关注语义依赖（如指代消解），有的头关注位置模式（如相邻词关系）。这种自动分工是Transformer强大表示能力的来源之一。

> "多头注意力是多视角的体现。每个头看到的世界不同，拼在一起才是完整的理解。就像一个团队里有人看细节、有人看全局，缺了谁都不行。"

## 14.4 核心组件实现

### LayerNorm类

LayerNorm（Layer Normalization，层归一化）是Transformer中稳定训练的关键组件。和BatchNorm不同，LayerNorm是在特征维度上做归一化，而不是在batch维度上。这意味着每个样本独立归一化，不依赖batch中的其他样本，因此LayerNorm天然支持batch_size=1的推理场景。

```python
class LayerNorm(nn.Module):
    def __init__(self, ndim, bias=True):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(ndim))
        self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None

    def forward(self, x):
        return F.layer_norm(x, self.weight.shape,
                            self.weight, self.bias, 1e-5)
```

实际上PyTorch内置的nn.LayerNorm已经足够好用，我们自己写的意义在于理解原理。LayerNorm做的事情很简单：对每个样本在特征维度上计算均值和方差，然后归一化，再用可学习的weight和bias做仿射变换。归一化公式是：

```
y = (x - mean) / sqrt(var + eps) * weight + bias
```

其中eps是一个很小的数（通常1e-5），防止方差为0时除零。weight初始化为全1，bias初始化为全0，相当于初始状态下不做任何缩放和平移，随着训练模型自己学习最优的归一化尺度。

一个值得注意的工程细节：GPT用的是Pre-Norm（先归一化再做注意力/FFN），而不是Post-Norm（先做注意力/FFN再归一化）。Pre-Norm的残差路径更干净——残差连接里传递的是未归一化的原始信号，梯度可以直接回传到浅层。Post-Norm的残差连接里传递的是归一化后的信号，深层网络的梯度仍然可能消失。这个选择在上一章详细讨论过，这里强调一句：Pre-Norm是现代大模型的标准选择，几乎所有主流模型都用Pre-Norm。

### GELU激活函数与FeedForward类

GPT用的激活函数不是ReLU（Rectified Linear Unit，修正线性单元），而是GELU（Gaussian Error Linear Unit，高斯误差线性单元）。GELU可以理解为ReLU的平滑版——ReLU在0处硬截断，GELU用高斯函数的累积分布函数做软截断。

```
ReLU:  f(x) = max(0, x)
GELU:  f(x) = x * Phi(x)  # Phi是标准正态分布的CDF
```

GELU在0附近的梯度更平滑，训练更稳定。ReLU在0处不可导（梯度突变），GELU处处可导。这个差异看似微小，但在深层网络中累积起来影响显著。大多数现代大模型（GPT、BERT、Llama等）都用GELU或其变体。Llama用的是SwiGLU（Swish-Gated Linear Unit，Swish门控线性单元），是GELU的进一步演进，结合了门控机制。

```python
class GELU(nn.Module):
    def forward(self, x):
        # 精确GELU使用erf，近似GELU用tanh近似
        return F.gelu(x)
```

实际实现中直接用F.gelu就好，PyTorch内部做了高度优化。但理解原理很重要——知道为什么用GELU而不是ReLU，面试时这个问题的区分度很高。GELU的近似公式是0.5x(1 + tanh(sqrt(2/pi) * (x + 0.044715x^3)))，这个公式在大多数框架中作为默认近似使用，因为它比精确的erf版本计算更快，精度损失可以忽略。

FeedForward（前馈网络）是Transformer Block中的另一个核心子模块。它是一个两层MLP（Multi-Layer Perceptron，多层感知机），中间用GELU激活：

```python
class FeedForward(nn.Module):
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.c_fc = nn.Linear(config.n_embd, 4 * config.n_embd)
        self.gelu = GELU()
        self.c_proj = nn.Linear(4 * config.n_embd, config.n_embd)
        self.drop = nn.Dropout(config.resid_pdrop)

    def forward(self, x):
        x = self.c_fc(x)
        x = self.gelu(x)
        x = self.c_proj(x)
        x = self.drop(x)
        return x
```

注意中间层的维度是4 * n_embd，也就是768 * 4 = 3072。这个4倍扩展比是GPT和Transformer的默认设置。为什么是4倍？这是经验性的选择——太小则表达能力不足，模型学不到复杂的非线性变换；太大则参数量和计算量过高，性价比下降。4倍是在表达力和效率之间的最佳平衡点。后来的一些模型如Llama用SwiGLU配合不同的扩展比（如8/3倍），通过数学推导找到了更优的效率点，但GPT-2时代就是4倍GELU。

FeedForward的作用是什么？如果说注意力层负责"信息聚合"——从不同位置收集相关信息，那么FeedForward负责"信息变换"——对聚合后的信息做非线性加工。注意力层回答"应该关注哪些位置"，FeedForward回答"从这些位置获得的信息应该怎么处理"。两者交替进行，构成了Transformer的核心计算循环。

从参数量角度看，FeedForward占了每个Transformer Block约三分之二的参数量。768到3072的扩展让FFN有足够大的中间表示空间来存储和处理信息。有研究表明，FFN的中间层起到了"键值存储"的作用——第一层线性变换相当于把输入映射到一个高维空间中的键，GELU激活相当于查找匹配的值，第二层线性变换把值映射回输出空间。这个视角让FFN和注意力机制形成了有趣的对称：注意力是在序列维度上做信息聚合，FFN是在特征维度上做信息检索。

### 残差与TransformerBlock

有了MultiHeadAttention和FeedForward，就可以组装TransformerBlock了。GPT的TransformerBlock结构遵循Pre-Norm设计：

```
TransformerBlock 数据流 (Pre-Norm)

输入 x
  |
  +---> LayerNorm(x) -> MultiHeadAttention -> Dropout
  |                                         |
  +<-------- 残差连接 <--------------------+
  |
  +---> LayerNorm(x) -> FeedForward -> Dropout
  |                                   |
  +<-------- 残差连接 <--------------+
  |
  v
输出 x (维度不变)
```

代码实现非常清晰：

```python
class TransformerBlock(nn.Module):
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.ln_1 = nn.LayerNorm(config.n_embd)
        self.attn = MultiHeadAttention(config)
        self.ln_2 = nn.LayerNorm(config.n_embd)
        self.mlp = FeedForward(config)

    def forward(self, x):
        # Pre-Norm: 先LayerNorm再Attention，残差连接
        x = x + self.attn(self.ln_1(x))
        # Pre-Norm: 先LayerNorm再FFN，残差连接
        x = x + self.mlp(self.ln_2(x))
        return x
```

两行代码，两件事：注意力子层加残差，前馈子层加残差。简洁到让人怀疑是不是少了什么。但这就是GPT的核心——简洁而强大。每个Block只做两件事：用注意力聚合上下文信息，用FFN做非线性变换。12个Block堆叠起来，就是GPT的全部"思考"过程。

残差连接（Residual Connection）的作用上一章讲过，这里再强调一次：它让梯度可以直接回传到浅层，解决深层网络梯度消失的问题。没有残差连接，12层甚至更深的网络根本训不动。残差连接的公式简单到离谱——x + f(x)，但它解决了深度学习最核心的问题之一。注意残差连接里的x是原始输入，f(x)是子模块的输出。如果f(x)的尺度太大，残差连接的优势会被削弱——这就是为什么要在f里面加Dropout，以及为什么初始化时要控制权重方差。让f(x)在训练初期接近0，让残差路径主导信号传播，模型才能稳定训练。

> "残差连接是深度学习的血管系统。没有它，梯度流不到深处，模型就像没有血液循环的身体，再好的器官也白搭。Pre-Norm则是给血管加了保护层，让信号流通更加顺畅。"

### 测试GPTModel参数量统计

模型写完了，第一件事不是训练，而是数参数。参数量是衡量模型规模的基本指标，也是检查实现是否正确的第一道防线。如果参数量和预期差太多，说明代码有bug。我们来算一下：

```python
config = GPTConfig()
model = GPTModel(config)

# 统计总参数量
total_params = sum(p.numel() for p in model.parameters())
print(f"总参数量: {total_params / 1e6:.2f}M")
```

运行后的参数分布大致如下：

```
总参数量: ~124M

分模块参数分布:
Token Embedding:    38.61M  (50257 * 768)
Position Embedding:  0.20M  (256 * 768)
Transformer Blocks: 84.95M  (12层 * ~7.08M/层)
  每层注意力:        2.36M  (768*768*4, Q/K/V/O四个投影)
  每层FFN:           4.72M  (768*3072 + 3072*768)
  每层LayerNorm:     0.003M (768*2*2, 两个LN)
Final LayerNorm:     0.001M (768*2)
Output Head:        38.61M  (768 * 50257)
```

几个值得关注的点。第一，Token Embedding和Output Head加起来占了77M，超过总参数量的一半。这就是为什么很多模型会做权重绑定——共享这两个层的权重可以直接省掉38.61M参数。第二，每层Transformer Block约7.08M参数，主要是FFN的4倍扩展（约4.72M）和注意力投影（约2.36M）。FFN的参数量是注意力的两倍，这个比例在所有Transformer模型中都成立。第三，Position Embedding只有0.2M，几乎可以忽略，这也是为什么后来RoPE能零成本替换它。

参数量统计还有一个用途——估算显存占用。每个float32参数占4字节，124M参数就是约496MB。加上梯度（同样大小）、AdamW优化器状态（两倍参数大小的动量和方差），训练时的显存占用约为参数量的16倍，也就是约2GB。再加上激活值（和batch_size、seq_len成正比），实际训练显存需求在4-8GB之间。这就是为什么GPT-2 Small可以在消费级GPU上训练。

## 14.5 文本生成与训练

### 自回归生成循环

模型能forward了，但forward只是给定输入算logits。文本生成需要一个自回归循环：取当前序列的最后一个位置的logits，采样下一个token，拼到序列末尾，再forward，循环往复。

```python
@torch.no_grad()
def generate(model, idx, max_new_tokens, temperature=1.0, top_k=None):
    model.eval()
    for _ in range(max_new_tokens):
        # 截取最后max_seq_len个token作为输入
        idx_cond = idx if idx.size(1) <= model.config.max_seq_len \
            else idx[:, -model.config.max_seq_len:]
        # forward得到logits
        logits = model(idx_cond)
        # 取最后一个位置的logits
        logits = logits[:, -1, :] / temperature
        # top-k采样
        if top_k is not None:
            v, _ = torch.topk(logits, top_k)
            logits[logits < v[:, [-1]]] = float('-inf')
        # 采样
        probs = F.softmax(logits, dim=-1)
        idx_next = torch.multinomial(probs, num_samples=1)
        idx = torch.cat([idx, idx_next], dim=1)
    return idx
```

这个生成函数有几个关键设计。第一是idx_cond的截取——当序列超过max_seq_len时，只取最后max_seq_len个token。这是因为位置嵌入只定义了max_seq_len个位置，超过会越界。这种截取也叫"滑动窗口生成"，虽然模型只能看到最近的上下文，但生成的质量仍然不错——因为注意力机制让模型学会从局部上下文中提取足够的信息。

第二是logits[:, -1, :]——只取最后一个位置的预测，因为GPT是预测下一个词。每个位置都输出了logits，但生成时只关心最后一个位置的预测。第三是torch.no_grad()——生成阶段不需要梯度，加这个装饰器可以节省显存，提升推理速度。

### temperature温度参数

temperature（温度）是控制生成文本"创造性"的关键参数。它的原理极其简单——把logits除以temperature再做softmax：

```
temperature > 1: 分布变平滑，低概率词有更多机会被选中，文本更多样
temperature < 1: 分布变尖锐，高概率词更可能被选中，文本更保守
temperature = 1: 原始分布，不改变
temperature -> 0: 退化为贪心解码，永远选概率最高的词
```

来看一个直观的例子。假设某位置的logits是[2.0, 1.0, 0.5, 0.1]，对应四个词：

```
Temperature 对概率分布的影响

temperature=0.5 (保守):  分布更尖锐
  softmax([4.0, 2.0, 1.0, 0.2]) -> [0.95, 0.03, 0.01, 0.01]
  -> 几乎总是选第一个词

temperature=1.0 (正常):  原始分布
  softmax([2.0, 1.0, 0.5, 0.1]) -> [0.64, 0.24, 0.14, 0.10]
  -> 第一个词概率最高但其他词也有机会

temperature=2.0 (激进):  分布更平滑
  softmax([1.0, 0.5, 0.25, 0.05]) -> [0.40, 0.24, 0.19, 0.13]
  -> 四个词的概率更接近，更多样化
```

实际使用时，temperature通常在0.7到1.2之间。低于0.7文本太死板，高于1.2容易出现乱码。怕浪猫的经验是写代码类任务用0.2到0.5（准确优先），写创意类任务用0.8到1.0（多样优先），脑暴用1.0到1.2（发散优先）。没有万能的temperature，具体值需要根据任务和模型调整。

一个常见误区是认为temperature越低越好——输出更确定、更准确。这在分类或代码生成等确定性任务上成立，但在对话或创意写作中，低temperature会导致模型输出重复、机械。用户说"你的模型怎么总是说同样的话"，往往就是temperature设太低了。反之，temperature太高则会出现"发散"——模型开始说胡话，语法不通、逻辑混乱。找到合适的temperature是一个调试过程，建议从1.0开始，根据输出质量逐步调整。

### top-k采样

top-k采样是另一个控制生成质量的技巧。它的思路是：在采样前只保留概率最高的k个词，把其他词的概率设为0，然后在k个词中重新归一化采样。这样做可以避免长尾低概率词被偶然选中导致生成质量下降。

```python
if top_k is not None:
    # 找到第k大的logit值
    v, _ = torch.topk(logits, top_k)
    # 把所有小于第k大值的logit设为负无穷
    logits[logits < v[:, [-1]]] = float('-inf')
```

top_k=50是一个常见的设置——只在前50个最可能的词中采样。这比纯随机采样质量好很多，又不像贪心解码那样死板。后来还有top-p（Nucleus Sampling，核心采样）采样，思路类似但动态选择词的个数——选概率累积和达到p的最小词集合。top-p比top-k更灵活，因为在高置信度位置（模型很确定下一个词是什么）只选少数词，在低置信度位置（模型不确定）选更多词，自适应地平衡多样性和质量。

temperature和top-k可以组合使用。先temperature调整分布锐度，再top-k截断长尾，最后采样。这个组合是当前大模型生成的标准配方。比如temperature=0.8 + top_k=50就是很多API服务的默认配置。

> "损失函数的选择不是技术问题，是对任务本质的理解。语言建模就是多分类，就这么简单。复杂的是怎么让这个多分类训得好、训得稳、训得快。"

### 交叉熵损失函数F.cross_entropy

训练GPT的本质是一个语言建模任务——给定上文，预测下一个词。这是一个多分类问题，类别数等于词表大小50257。损失函数自然用交叉熵（Cross-Entropy Loss）：

```python
def forward(self, idx, targets=None):
    # ... 前向计算 ...
    logits = self.head(x)  # (batch, seq, vocab_size)

    if targets is not None:
        # 计算交叉熵损失
        loss = F.cross_entropy(
            logits.view(-1, logits.size(-1)),  # (batch*seq, vocab)
            targets.view(-1),                   # (batch*seq,)
            ignore_index=-1
        )
        return logits, loss
    return logits
```

F.cross_entropy内部做了三件事：log_softmax + nll_loss + 自动求均值。它比手动计算log_softmax再算NLL更高效，数值稳定性也更好——内部用了log-sum-exp技巧防溢出。当logits值很大时，直接计算exp(logits)会溢出，log-sum-exp技巧通过减去最大值来避免这个问题。

ignore_index=-1是为了处理padding。当batch中不同序列长度不一时，短的序列用-1填充，交叉熵计算时自动忽略这些位置。不过我们的GPTDataset用滑动窗口切分，所有样本等长，所以这个参数其实可以不要。但加上它是一个好习惯，将来改成变长输入时不用改代码。

交叉熵损失还有一个重要特性——它和最大似然估计（Maximum Likelihood Estimation，MLE）等价。最小化交叉熵等价于最大化数据的对数似然，也就是让模型给训练数据中实际出现的词分配更高的概率。这个数学上的优美性让交叉熵成为语言建模的标准损失函数。

### GPTDataset滑动窗口切分

训练数据准备好了，接下来是怎么喂给模型。GPT的训练数据是一段连续文本，我们需要用滑动窗口把它切成固定长度的训练样本。每个样本的输入是窗口内的token，目标是窗口内每个位置对应的下一个token。

```python
class GPTDataset(Dataset):
    def __init__(self, text, tokenizer, max_len):
        self.data = torch.tensor(tokenizer.encode(text), dtype=torch.long)
        self.max_len = max_len

    def __len__(self):
        return max(0, len(self.data) - self.max_len)

    def __getitem__(self, idx):
        chunk = self.data[idx:idx + self.max_len + 1]
        x = chunk[:-1]  # 输入: 前max_len个token
        y = chunk[1:]   # 目标: 后移一位
        return x, y
```

这个实现简洁但有一个关键细节：x和y是同一个窗口错位一位。x[0]的预测目标是y[0]，x[1]的预测目标是y[1]，依此类推。这就是"语言建模"的精髓——每个位置都在预测下一个词。一个长度为max_len的窗口产生了max_len个训练信号，数据效率极高。

滑动窗口的步长默认是1，意味着相邻样本之间有max_len-1个token的重叠。这会增加数据量但也会增加冗余——模型在不同窗口中看到几乎相同的上下文。有些实现会把步长设为max_len（不重叠），减少冗余但数据量也少了。GPT-2原始训练用的是步长1，我们这里也保持一致。实际大规模训练时，步长的选择需要权衡数据量和训练效率。一般来说，步长越小数据量越大、训练越充分，但训练时间也越长。步长等于max_len时数据量最少但每个token只被采样一次，训练效率最高但可能训练不充分。

数据的质量比数量更重要。GPT-2的训练数据是WebText——从Reddit上收集的、 karma值大于3的网页内容。karma大于3相当于一个质量过滤器，去掉了大量垃圾内容。如果你用低质量数据训练，模型学到的也是低质量模式。怕浪猫在实践中发现，用5MB高质量文本训练的效果，远好于用50MB低质量文本。数据的多样性和质量是决定模型能力的关键因素，有时候比模型架构和超参数更重要。这也是为什么各大公司都在数据清洗上投入大量资源。OpenAI、Anthropic、Google等公司都有专门的数据团队，用规则过滤、模型过滤、人工审核等多重手段提升数据质量。对于我们的迷你GPT来说，虽然不需要那么复杂的数据管道，但至少要确保训练文本是干净的——去掉HTML标签、去掉特殊字符、保证编码统一。

### DataLoader与数据准备

有了Dataset，DataLoader负责batch组装、打乱、并行加载：

```python
from torch.utils.data import DataLoader

dataset = GPTDataset(text, tokenizer, max_len=config.max_seq_len)
dataloader = DataLoader(
    dataset,
    batch_size=32,
    shuffle=True,
    num_workers=4,
    drop_last=True
)
```

drop_last=True很重要。最后一个batch可能不满batch_size=32，如果不丢弃，这个不完整的batch会导致梯度估计不稳定。num_workers=4用4个进程并行加载数据，避免数据加载成为训练瓶颈。但注意num_workers在Windows上有时会有问题（多进程fork机制不同），如果遇到报错可以先设为0调试。

shuffle=True对训练至关重要。如果不打乱，模型会按文本顺序依次看到数据，训练容易陷入局部最优。打乱后每个batch的样本来自文本的不同位置，梯度估计更无偏，训练更稳定。

### AdamW优化器训练循环

GPT用的优化器是AdamW（Adam with decoupled Weight decay，解耦权重衰减的Adam）。AdamW和Adam的区别在于权重衰减的处理方式——Adam把权重衰减混在梯度里（L2正则化），AdamW把权重衰减单独拿出来直接作用在参数上。这个看似微小的区别在训练大模型时影响显著，AdamW的泛化性能更好，因为L2正则化和自适应学习率之间存在耦合问题，AdamW通过解耦避免了这个问题。

```python
optimizer = torch.optim.AdamW(
    model.parameters(),
    lr=3e-4,
    weight_decay=0.1,
    betas=(0.9, 0.95)
)
```

几个关键超参数。lr=3e-4是GPT训练的经典学习率，大模型训练中这个值通常在1e-4到5e-4之间。太大会梯度爆炸，太小则收敛太慢。weight_decay=0.1提供正则化防止过拟合。betas=(0.9, 0.95)中第二个beta从默认的0.999改为0.95，这是GPT论文中的设置——0.95比0.999对梯度的响应更快，让优化器更快适应梯度变化，适合大模型的训练动态。

来一个完整的训练循环，带日志和loss监控：

```python
import time

def train(model, dataloader, config, num_epochs=10):
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=3e-4,
        weight_decay=0.1, betas=(0.9, 0.95)
    )
    model.train()
    step = 0
    for epoch in range(num_epochs):
        t0 = time.time()
        for x, y in dataloader:
            logits, loss = model(x, y)
            optimizer.zero_grad()
            loss.backward()
            # 梯度裁剪，防止梯度爆炸
            torch.nn.utils.clip_grad_norm_(
                model.parameters(), 1.0)
            optimizer.step()
            if step % 100 == 0:
                print(f"epoch {epoch} step {step} "
                      f"loss {loss.item():.4f}")
            step += 1
        t1 = time.time()
        print(f"epoch {epoch} 耗时 {t1-t0:.1f}s")
```

梯度裁剪clip_grad_norm_是必做的。Transformer训练中偶尔会出现梯度爆炸（loss突然变成NaN），梯度裁剪把梯度范数限制在1.0以内，是一个简单有效的防护措施。具体做法是计算所有参数梯度的L2范数，如果超过1.0就按比例缩放到1.0。

除了梯度裁剪，还有几个训练稳定性的技巧值得注意。第一是学习率预热（Learning Rate Warmup）——训练开始时不要直接用最大学习率，而是从0线性增长到目标学习率，预热几百到几千步。这防止训练初期权重随机时大学习率导致梯度爆炸。第二是学习率衰减——训练后期逐渐降低学习率，让模型在最优解附近做精细调整。GPT-2用的是余弦衰减（Cosine Decay）。第三是监控训练指标——除了loss，还要关注梯度范数。如果梯度范数突然飙升，说明可能要爆炸了，及时降低学习率或暂停训练。

optimizer.zero_grad()的位置也有讲究。有些人在backward前调，有些在step后调。PyTorch默认梯度是累积的，所以每次backward前必须清零。但如果你想做梯度累积（Gradient Accumulation，模拟更大batch_size），就不在每次backward后清零，而是累积N步再step和清零。这是显存不够时的常用技巧。

### 模型保存torch.save/torch.load

训练完的模型需要保存。PyTorch提供了torch.save和torch.load两个函数。保存时通常保存三种东西：模型参数、优化器状态、训练步数。这样不仅能在推理时加载模型，还能在训练中断后从断点恢复。

```python
# 保存检查点
checkpoint = {
    'model_state_dict': model.state_dict(),
    'optimizer_state_dict': optimizer.state_dict(),
    'step': step,
    'config': config,
}
torch.save(checkpoint, 'gpt_checkpoint.pt')

# 加载检查点
checkpoint = torch.load('gpt_checkpoint.pt',
                        map_location='cpu')
model = GPTModel(checkpoint['config'])
model.load_state_dict(checkpoint['model_state_dict'])
```

有一个坑值得提醒——torch.save默认用pickle序列化，保存的是参数的字典而不是整个模型结构。所以加载时必须先创建模型实例（需要知道config），再load_state_dict。如果你把整个model对象torch.save了，加载时会依赖模型类的定义位置，如果代码结构变了就加载不了。保存state_dict是更安全、更灵活的做法。

实际工程中，检查点保存还需要考虑几个问题。第一是保存频率——不要只在训练结束时保存，应该每隔N步保存一次。训练大模型动辄几天甚至几周，中间如果机器宕机，从头开始训练的代价是不可接受的。第二是保存最近K个检查点而不是只覆盖一个——如果某个检查点坏了（比如保存时磁盘满了），还有之前的可以回退。第三是版本管理——检查点文件名带上step和loss值，方便比较不同训练阶段的效果。比如gpt_step10000_loss3.45.pt就比gpt_latest.pt信息量大得多。

map_location='cpu'是一个好习惯。如果你在GPU上训练保存了模型，在没有GPU的机器上加载时会报错。指定map_location='cpu'先把张量加载到CPU，再由你决定搬到哪个设备。

来总结一下完整的训练到推理流程：

```
GPT训练-推理完整流程

1. 准备数据
   原始文本 -> Tokenizer编码 -> GPTDataset滑动窗口 -> DataLoader

2. 构建模型
   GPTConfig -> GPTModel(tok_emb + pos_emb + 12*Block + ln_f + head)

3. 训练循环
   for epoch:
     for batch:
       forward -> loss -> backward -> clip_grad -> optimizer.step
     保存checkpoint

4. 加载模型
   torch.load -> GPTModel.load_state_dict

5. 文本生成
   prompt -> 自回归循环(temperature + top-k) -> 输出文本
```

> "训练大模型就像养孩子。你要准备好教材（数据）、选好学校（架构）、调好营养配比（超参数），然后耐心等它长大（训练）。急不得，但每一步都不能马虎。"

## 完整代码结构总览

怕浪猫把这一章写的所有组件整理成一个清单，方便你对照检查：

**GPT迷你版组件清单**

| 组件 | 类名 | 核心职责 | 关键参数 |
|------|------|---------|---------|
| 配置类 | GPTConfig | 集中管理超参数 | vocab_size=50257, n_layer=12, n_head=12, n_embd=768 |
| 注意力 | MultiHeadAttention | QKV投影+掩码+多头并行 | n_head=12, d_head=64 |
| 前馈网络 | FeedForward | 两层MLP+GELU激活 | 4倍扩展比, 768->3072->768 |
| 激活函数 | GELU | 高斯误差线性单元 | 平滑ReLU, 处处可导 |
| 层归一化 | LayerNorm | 特征维度归一化 | eps=1e-5, Pre-Norm |
| Transformer块 | TransformerBlock | 注意力+FFN+残差+Pre-Norm | 2个子模块 |
| 主模型 | GPTModel | Embedding+Blocks+LN+Head | ~124M参数 |
| 数据集 | GPTDataset | 滑动窗口切分文本 | max_len=256, 步长1 |
| 生成函数 | generate | 自回归生成+temperature+top-k | 可调温度和top_k |
| 优化器 | AdamW | 自适应学习率+解耦权重衰减 | lr=3e-4, wd=0.1 |
| 损失函数 | F.cross_entropy | 多分类交叉熵 | ignore_index=-1 |
| 模型保存 | torch.save | 持久化模型参数和优化器状态 | 保存state_dict |

这个清单覆盖了GPT从数据准备到训练到推理的全部组件。每个组件都不复杂，但组装在一起就是一个完整的大语言模型。怕浪猫建议你照着这个清单，一个类一个类地自己写一遍，不要复制粘贴。亲手写过一遍之后，你对架构的理解会有质的飞跃。

几个面试高频问题，这里顺手回答了。第一个：GPT为什么用Decoder-only而不是Encoder-Decoder？因为语言建模是单向自回归任务，Decoder-only的掩码自注意力天然适配，不需要编码器的双向理解能力。第二个：GPT为什么用Pre-Norm？因为Pre-Norm的残差路径更干净，深层网络训练更稳定，Post-Norm在深层容易梯度消失。第三个：GPT的注意力头数为什么是12？经验性选择，头数太少则多视角能力不足，太多则每个头维度太小信息容量不够，12是768/64=12的自然结果。第四个：为什么FFN的扩展比是4？经验性的最优值，太小表达力不够，太大参数浪费。第五个：GPT和BERT的区别是什么？架构上GPT是Decoder-only，BERT是Encoder-only；训练目标上GPT用因果语言建模（从左到右预测下一个词），BERT用掩码语言建模（预测被遮盖的词）；应用上GPT擅长生成，BERT擅长理解。

> "面试问到GPT架构，你能说出'Decoder-only、Pre-Norm、可学习位置编码、GELU激活、12层768维'这五个关键词，就已经超过80%的候选人了。但如果你亲手实现过，你能说出第81%到100%的细节——contiguous的坑、register_buffer的技巧、权重绑定的数学依据、AdamW和Adam的区别。细节决定成败。"

## 写在最后

这一章怕浪猫带你从零实现了一个完整的GPT模型。从GPTConfig配置类到GPTModel主模型，从MultiHeadAttention的QKV投影到Causal Mask的三角矩阵，从GELU激活函数到FeedForward的4倍扩展，从TransformerBlock的Pre-Norm残差到自回归生成循环，从temperature温度参数到top-k采样，从GPTDataset的滑动窗口到AdamW优化器的训练循环，最后到torch.save的模型持久化。每一个组件都有它的设计理由，每一行代码都有它的工程考量。这些组件拼在一起，就是GPT的全部——一个124M参数的、能训练能推理的、完整的大语言模型。

你可能会问：这个迷你GPT和GPT-3、GPT-4差多远？架构上差的不多——把层数从12改成96，嵌入维度从768改成12288，上下文长度从256改成8192，它就是GPT-3。架构完全一样，只是规模不同。GPT-4的架构没有公开，但据各种泄露信息，它也在这个框架内，只是增加了一些工程优化（如MoE即Mixture of Experts混合专家、RoPE旋转位置编码、SwiGLU激活函数等）。所以理解了这个迷你GPT，你就理解了所有GPT系列模型的核心。差的只是规模和工程细节。

从理论到实践的跨越，是每个LLM开发工程师必须经历的一步。读论文时你觉得都懂了，写代码时才发现处处是坑——contiguous忘了加、mask维度对不上、optimizer选错、学习率设大了一步爆炸。这些坑只有亲手踩过才记得住。怕浪猫在这一章把常见的坑都标出来了，但说实话，有些坑你自己踩一遍印象更深。所以，关掉这篇文章，打开你的编辑器，从GPTConfig开始，一行一行写下去。写完的那一刻，你就不是"聊大模型的人"了，你是"做大模型的人"。

> "从124M到175B，架构没变，变的是规模。Scaling Law告诉我们，当规模足够大时，量变会引起质变。但质变的前提是架构正确——而这个正确的架构，你今天已经亲手实现了。"

**收藏引导**：这一章是从零实现GPT的完整代码指南，从架构设计到每个组件的实现，从训练循环到生成策略，每个模块的踩坑点都标注清楚了，建议先收藏。以后面试被问到"你从零实现过大模型吗"，这篇就是你的底气。写代码时遇到contiguous报错、mask维度不匹配等问题，随时翻出来对照。

**互动引导**：你在实现GPT时踩过哪些坑？是contiguous忘记加还是mask方向搞反？optimizer选Adam还是AdamW纠结过吗？生成出来的文本乱码了吗？评论区聊聊你的实现经历，怕浪猫会挨个回复。

**追更引导**：模型搭好了也训完了，但这只是起点。下一章怕浪猫要带你进入微调的世界——怎么让这个通用模型变成文本分类专家？Full Fine-tuning、LoRA（Low-Rank Adaptation，低秩适配）、Prefix Tuning，微调技术的全家桶都在下一章。点个关注，别掉队。

**系列进度 14/19**

怕浪猫说：从零实现一个GPT模型，就像从零组装一辆汽车。引擎（注意力）、变速箱（FFN）、底盘（残差连接）、方向盘（生成循环），每个零件都不复杂，但亲手组装一遍之后，你就真正理解了它怎么跑起来的。下一章，我们让这辆车学会跑赛道——模型微调与文本分类，让它从通才变专家。