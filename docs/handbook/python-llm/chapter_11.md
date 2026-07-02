# 让机器读懂文本 — 文本与分词艺术

> 你有没有想过，当你在ChatGPT输入"今天天气真好"的时候，机器到底看到了什么？它看到的不是汉字，不是拼音，而是一串冰冷的数字。这串数字怎么来的？为什么同样的词在不同的上下文里会有不同的含义？这背后藏着LLM最基础也最关键的一环——文本处理。

很多入门LLM开发的同学，一上来就研究Transformer架构、注意力机制，却忽略了最根本的问题：文本是怎么变成向量的？怕浪猫在第一个大模型项目里就栽过这个跟头——模型架构没问题，训练数据没问题，结果就是效果差。最后发现是分词器的词表太小，大量专有名词被切成碎片，模型根本学不到完整的语义。这个教训让我明白：分词不是预处理的小事，而是决定模型上限的天花板。

我是怕浪猫，一个在LLM开发一线踩过无数坑的工程师。今天这篇文章，我会带你从零开始，把文本到向量的完整链路拆得干干净净。从最基础的空格分词到GPT使用的BPE算法，从简单的One-Hot到强大的Embedding层，每一步都有代码，每一步都有实战。

## 11.1 文本向量化完整流程 — 从一句话到一组向量

### 机器为什么读不懂文字？

先说一个最基本的常识：计算机只认识数字。你给它一段文字"我爱NLP"，它的CPU眼里只有0和1。所以必须把文字转换成数字，而且是能表达语义信息的数字，模型才能处理。

这个转换过程不是一步到位的，而是一条完整的流水线。怕浪猫画一张图让你看清全貌：

```
文本向量化完整流程

"我爱NLP"  →  分词  →  ["我","爱","NLP"]  →  查字典  →  [12, 45, 789]
                                                              ↓
                                                        TokenID序列
                                                              ↓
                                                   Embedding层
                                                              ↓
                                            [[0.12, -0.34, ...],    ← "我"
                                             [0.56, 0.78, ...],     ← "爱"
                                             [-0.21, 0.43, ...]]    ← "NLP"

每个Token变成一个d维向量，整个句子变成 (seq_len, d) 的矩阵
```

这条流水线有四个关键环节，一个都不能出错：

**第一步：分词（Tokenization）**。把连续的文本切分成一个个离散的单元，这些单元叫做Token。中文和英文的分词逻辑完全不同，后面会详细讲。

**第二步：映射TokenID**。每个Token在词表中对应一个唯一的整数ID。这就像给每个词发一张身份证，12号是"我"，45号是"爱"，789号是"NLP"。

**第三步：Embedding（词嵌入）**。把每个整数ID转换成一个稠密的浮点数向量。这一步是质的飞跃——从离散的符号变成了连续的语义空间。

**第四步：组装成张量**。把所有Token的向量拼起来，形成一个矩阵，送入后续的神经网络层。

> 金句：分词是翻译官，把人类语言翻译成机器语言；Embedding是地图，把每个词放到语义空间里的正确位置。

### 为什么不能直接用ID？

很多初学者会问：既然每个Token已经有了唯一的ID，为什么不直接把ID送进模型，而非要多一步Embedding？

这个问题怕浪猫当年也困惑过。答案有两个关键点：

第一，ID是离散的、无序的。ID为12的"我"和ID为13的"你"在数值上只差1，但语义上毫无关联。而ID为45的"爱"和ID为789的"NLP"数值差了744，也不能反映任何语义距离。

第二，模型需要连续可微的输入。神经网络通过梯度下降优化参数，要求输入是连续的浮点数，而不是离散的整数。Embedding层把每个ID映射到一个连续向量空间，让语义相近的词在向量空间中距离也近。

```python
import torch

token_ids = torch.tensor([12, 45, 789])

# 错误做法：直接用ID作为输入
# ID数值大小没有语义意义，且大ID会导致梯度爆炸

# 正确做法：通过Embedding层转向量
embedding = torch.nn.Embedding(num_embeddings=1000, embedding_dim=64)
vectors = embedding(token_ids)
print(vectors.shape)  # torch.Size([3, 64])
```

`nn.Embedding`本质上是一个查找表（lookup table），内部维护一个形状为`(vocab_size, embedding_dim)`的权重矩阵。输入一个ID，就返回对应行的向量。但这个向量是可学习的——随着训练进行，语义相近的词会自动靠近。

## 11.2 文本分词与字典构造 — 切词的学问

### 分词的三大流派

分词看起来简单，实际上是大有学问的。根据切分粒度的不同，主要有三种方式：

**按空格分词（Whitespace Tokenization）** 最简单粗暴的方式，直接按空格切分。英文天然适合这种方式，因为英文单词之间本来就有空格。

```python
text = "I love natural language processing"
tokens = text.split()
print(tokens)
# ['I', 'love', 'natural', 'language', 'processing']
```

但这种方式的问题很明显：标点符号会粘在词上（如"processing."），大小写没有统一处理，而且完全无法处理中文。

**按字符分词（Character-level Tokenization）** 把每个字符当作一个Token。中文天然适合这种方式，因为每个汉字本身就是独立的语义单元。

```python
text = "我爱自然语言处理"
tokens = list(text)
print(tokens)
# ['我', '爱', '自', '然', '语', '言', '处', '理']
```

字符分词的词表极小（中文常用字只有几千个），不存在未登录词问题。但缺点是序列太长，模型要处理的时间步增多，计算量大增。

**按词分词（Word-level Tokenization）** 在词的粒度上切分，英文用空格加标点处理，中文需要专门的分词工具。

```python
import jieba
text = "我爱自然语言处理"
tokens = list(jieba.cut(text))
print(tokens)
# ['我', '爱', '自然语言', '处理']
```

词级分词的语义最完整，每个Token都承载明确语义。但词表会非常大——中文词汇量轻松突破十万，而且遇到新词就会变成未登录词（Out-of-Vocabulary，OOV）。

### 中文分词：jieba的实战与坑

中文分词是NLP（Natural Language Processing，自然语言处理）的经典难题，因为中文没有空格分隔词边界。jieba是最流行的中文分词库，支持精确模式、全模式和搜索引擎模式。

```python
import jieba

text = "小明硕士毕业于中国科学院计算所"

# 精确模式（最常用）
tokens = list(jieba.cut(text, cut_all=False))
print("精确模式:", tokens)
# ['小明', '硕士', '毕业', '于', '中国科学院', '计算所']

# 全模式（把所有可能切分都找出来）
tokens_all = list(jieba.cut(text, cut_all=True))
print("全模式:", tokens_all)

# 搜索引擎模式（在精确模式基础上对长词再切分）
tokens_search = list(jieba.cut_for_search(text))
print("搜索模式:", tokens_search)
```

实际项目中，怕浪猫踩过几个jieba的坑：

**坑一：专有名词被错误切分。** 比如公司名"虎牙直播"可能被切成"虎牙"加"直播"。解决方案是加载自定义词典：

```python
import jieba

jieba.add_word("虎牙直播")
jieba.add_word("怕浪猫")

text = "怕浪猫在虎牙直播写代码"
tokens = list(jieba.cut(text))
print(tokens)  # ['怕浪猫', '在', '虎牙直播', '写', '代码']
```

**坑二：jieba的cut函数返回的是生成器。** 如果你多次遍历结果，第二次会为空。需要用`list()`转成列表保存。

**坑三：并发安全。** jieba的`add_word`不是线程安全的，多线程环境下要先初始化好词典再并发调用cut。

> 金句：分词器的质量决定了模型的上限。再好的Transformer也救不回被切碎的语义。

### 子词分词：BPE与WordPiece

词级分词有OOV问题，字符分词有序列过长问题。子词分词（Subword Tokenization）是两者的折中方案，也是现代大模型的标准做法。

**BPE（Byte-Pair Encoding，字节对编码）**

BPE的核心思想很简单：从字符级开始，反复合并出现频率最高的相邻Token对，直到达到预设的词表大小。

```
BPE算法过程示例

初始词表（字符级）：
  l o w _  →  出现5次
  l o w e r _  →  出现2次
  n e w e s t _  →  出现6次
  w i d e s t _  →  出现3次

第1轮：统计相邻字符对频率
  (l,o)=7, (o,w)=7, (e,w)=8, (e,s)=9 ...
  最高频：(e,s)=9 → 合并

第2轮：合并后重新统计
  最高频：(es,t)=9 → 合并为"est"

第3轮：继续合并
  最高频：(est,_) → 合并为"est_"

...直到词表达到目标大小
```

BPE的优势在于：常见词会被完整保留在词表中，而罕见词会被拆分成有意义的子词。比如"unhappiness"可能被拆成"un"加"happiness"，既控制了词表大小，又避免了OOV问题。

**WordPiece算法**

WordPiece（词片）和BPE非常相似，区别在于合并标准。BPE选择频率最高的对，而WordPiece选择能最大化语言模型似然的对。

WordPiece被BERT（Bidirectional Encoder Representations from Transformers，基于Transformer的双向编码器表示）使用。它的合并标准用互信息（Pointwise Mutual Information，PMI）衡量：

```python
# WordPiece vs BPE 合并标准对比
# BPE:       score = freq(A, B)
# WordPiece: score = freq(A, B) / (freq(A) * freq(B))

# "th"出现100次，"t"出现500次，"h"出现300次
# BPE score = 100
# WordPiece score = 100 / (500 * 300) = 0.000667

# "qu"出现50次，"q"出现55次，"u"出现60次
# BPE score = 50（比"th"低，不优先合并）
# WordPiece score = 50 / (55 * 60) = 0.01515（比"th"高，优先合并）
```

这个对比很关键：BPE倾向于合并高频对，WordPiece倾向于合并高依赖对。"th"虽然频率高，但"t"和"h"各自也很常见，所以WordPiece不会优先合并它。而"q"几乎总是跟着"u"，WordPiece会优先合并"qu"。

### 词汇表构建与特殊Token

无论用哪种分词算法，最终都需要构建一个词汇表——从Token到ID的映射表。词汇表的质量直接影响模型效果。

```python
from collections import Counter

corpus = ["自然语言处理很有趣", "深度学习改变世界", "大模型是未来的方向"]

# 第1步：分词
all_tokens = []
for text in corpus:
    all_tokens.extend(list(text))

# 第2步：统计频率
token_counts = Counter(all_tokens)

# 第3步：按频率排序，分配ID
vocab = {}
# 先添加特殊Token
vocab["[PAD]"] = 0  # Padding，填充
vocab["[UNK]"] = 1  # Unknown，未知词
vocab["[BOS]"] = 2  # Beginning of Sequence，序列起始
vocab["[EOS]"] = 3  # End of Sequence，序列结束

for token, _ in token_counts.most_common():
    if token not in vocab:
        vocab[token] = len(vocab)

print(f"词表大小: {len(vocab)}")
```

几个特殊Token的作用：

**[PAD]**：将不同长度的句子填充到相同长度，使它们可以组成一个batch。**[UNK]**：处理未登录词，遇到词表中没有的Token时用它代替。**[BOS]**：标记序列开始，让模型知道这是输入的开头。**[EOS]**：标记序列结束，模型输出[EOS]表示生成完毕。

```python
# 特殊Token实际使用示例
vocab = {"[PAD]": 0, "[UNK]": 1, "[BOS]": 2, "[EOS]": 3,
         "我": 4, "爱": 5, "NLP": 6}

text = "我 爱 NLP"
tokens = text.split()

# 编码：添加特殊Token + 转ID
token_ids = [vocab["[BOS]"]]
for t in tokens:
    token_ids.append(vocab.get(t, vocab["[UNK]"]))
token_ids.append(vocab["[EOS]"])

# 填充到固定长度
max_len = 8
while len(token_ids) < max_len:
    token_ids.append(vocab["[PAD]"])

print("Token IDs:", token_ids)
# [2, 4, 5, 6, 3, 0, 0, 0]
```

这段代码完整展示了从文本到ID序列的过程：添加BOS和EOS标记、处理未知词、填充到固定长度。这是所有文本数据处理的基础模板，建议收藏。

> 金句：特殊Token是模型和人类之间的标点符号——[BOS]是开场白，[EOS]是句号，[PAD]是占位符，[UNK]是"我不认识但我会尽力"。

## 11.3 Tokenizer类实现 — 从原理到代码

### 设计一个完整的Tokenizer

理解了分词原理和词汇表构建，接下来怕浪猫带你手写一个完整的Tokenizer类。这个类要实现两个核心功能：encode（编码：文本到ID序列）和decode（解码：ID序列到文本）。

```python
import json
from collections import Counter

class SimpleTokenizer:
    """简易分词器：支持空格分词和字符分词"""

    def __init__(self, tokenization="char"):
        self.tokenization = tokenization
        self.vocab = {}
        self.id_to_token = {}
        self.special_tokens = ["[PAD]", "[UNK]", "[BOS]", "[EOS]"]

    def train(self, corpus, vocab_size=5000):
        all_tokens = []
        for text in corpus:
            all_tokens.extend(self._tokenize(text))
        token_counts = Counter(all_tokens)
        self.vocab = {}
        for i, token in enumerate(self.special_tokens):
            self.vocab[token] = i
        for token, _ in token_counts.most_common(
            vocab_size - len(self.special_tokens)):
            self.vocab[token] = len(self.vocab)
        self.id_to_token = {v: k for k, v in self.vocab.items()}
        return self

    def _tokenize(self, text):
        if self.tokenization == "char":
            return list(text)
        return text.split()

    def encode(self, text, add_special=True, max_len=None):
        tokens = self._tokenize(text)
        ids = []
        if add_special:
            ids.append(self.vocab["[BOS]"])
        for token in tokens:
            ids.append(self.vocab.get(token, self.vocab["[UNK]"]))
        if add_special:
            ids.append(self.vocab["[EOS]"])
        if max_len:
            if len(ids) > max_len:
                ids = ids[:max_len-1] + [self.vocab["[EOS]"]]
            else:
                ids += [self.vocab["[PAD]"]] * (max_len - len(ids))
        return ids

    def decode(self, ids, skip_special=True):
        tokens = []
        for i in ids:
            token = self.id_to_token.get(i, "[UNK]")
            if skip_special and token in self.special_tokens:
                continue
            tokens.append(token)
        return "".join(tokens) if self.tokenization == "char" else " ".join(tokens)

    def save(self, path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"vocab": self.vocab,
                       "tokenization": self.tokenization}, f, ensure_ascii=False)

    def load(self, path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.vocab = data["vocab"]
        self.id_to_token = {v: k for k, v in self.vocab.items()}
        self.tokenization = data["tokenization"]
        return self
```

### Tokenizer实战测试

写完Tokenizer，来实际测试编码和解码的完整流程：

```python
corpus = [
    "自然语言处理是人工智能的重要方向",
    "深度学习推动自然语言处理发展",
    "大模型改变自然语言处理范式",
    "分词是自然语言处理的基础",
    "词向量是理解语义的关键技术"
]

tokenizer = SimpleTokenizer(tokenization="char")
tokenizer.train(corpus, vocab_size=100)
print(f"词表大小: {len(tokenizer.vocab)}")

# 测试编码
text = "自然语言处理"
ids = tokenizer.encode(text, add_special=True, max_len=10)
print(f"编码结果: {ids}")

# 测试解码
decoded = tokenizer.decode(ids)
print(f"解码结果: {decoded}")

# 测试未知词处理
unknown_text = "量子计算"
unknown_ids = tokenizer.encode(unknown_text, add_special=True)
print(f"未知词编码: {unknown_ids}")
```

```
编码解码流程对比

编码: "自然语言处理" → 分词 → [自,然,语,言,处,理] → 查字典 → [2,12,8,9,15,6,3,0,0,0]
     (添加BOS/EOS)                                       (填充到max_len)

解码: [2,12,8,9,15,6,3,0,0,0] → 查逆字典 → [BOS,自,然,语,言,处,理,EOS,PAD,PAD]
     (跳过特殊Token)                        → "自然语言处理"
```

### encode和decode的常见坑

**坑一：encode时的截断策略。** 如果文本超过max_len，应该在最后一个有效Token后加[EOS]再截断，而不是直接砍掉。上面代码中`ids[:max_len-1] + [self.vocab["[EOS]"]]`就是这个逻辑。

**坑二：decode时要不要保留特殊Token。** 给用户看的文本要去掉[PAD]和[BOS]及[EOS]，但做模型评估时有时需要保留。所以decode方法要支持`skip_special`参数。

**坑三：batch编码时长度不统一。** 必须找到batch中最长序列的长度，把所有序列填充到这个长度。或者设置一个全局max_len，但注意不能太短导致信息丢失。

> 金句：Tokenizer是模型和数据的边境海关——编码是入境检查，解码是出境放行，任何一个环节出错都会导致"语义走私"。

## 11.4 统计分词与tiktoken — 工业级分词器

### N-gram语言模型与分词的关系

在深度学习统治NLP之前，统计语言模型是主流。N-gram（N元语法）是最经典的统计语言模型，核心假设是：一个词的出现概率只依赖于它前面的N-1个词。

```python
from collections import defaultdict

corpus = [
    "我 爱 自然 语言 处理",
    "我 爱 深度 学习",
    "自然 语言 处理 很 有趣"
]

bigrams = defaultdict(int)
unigrams = defaultdict(int)

for sentence in corpus:
    tokens = sentence.split()
    for i, token in enumerate(tokens):
        unigrams[token] += 1
        if i > 0:
            bigrams[(tokens[i-1], token)] += 1

def bigram_prob(prev_word, curr_word):
    if unigrams[prev_word] == 0:
        return 0
    return bigrams[(prev_word, curr_word)] / unigrams[prev_word]

print(f"P(处理|语言) = {bigram_prob('语言', '处理'):.3f}")
print(f"P(学习|深度) = {bigram_prob('深度', '学习'):.3f}")
```

N-gram和分词的关系是：在统计分词中，用语言模型评估分词结果的好坏。比如"自然语言处理"可以切成["自然","语言","处理"]或["自然语言","处理"]，用语言模型分别计算概率，概率高的就是更好的分词方案。

```
分词歧义消解示例

"研究生命的起源"
切分A: 研究 / 生命 / 的 / 起源 → P = 0.0021
切分B: 研究生 / 命 / 的 / 起源 → P = 0.0003

N-gram模型判断切分A概率更高 → 选择切分A
```

N-gram的局限也很明显：数据稀疏（很多词组合在语料中没出现过）、上下文窗口太小、无法捕捉长距离依赖。这些局限正是后来神经网络语言模型要解决的问题。

### BPE算法详解：从原理到实现

前面介绍了BPE的思想，这里怕浪猫带你完整实现一个BPE分词器，这是理解GPT分词器的关键：

```python
from collections import Counter, defaultdict

class SimpleBPE:
    def __init__(self, num_merges=100):
        self.num_merges = num_merges
        self.merges = []

    def _get_word_freqs(self, corpus):
        word_freqs = defaultdict(int)
        for text in corpus:
            for word in text.split():
                word_freqs[tuple(word) + ("</w>",)] += 1
        return word_freqs

    def _get_pair_stats(self, word_freqs):
        pair_counts = Counter()
        for word, freq in word_freqs.items():
            for i in range(len(word) - 1):
                pair_counts[(word[i], word[i+1])] += freq
        return pair_counts

    def _merge_pair(self, pair, word_freqs):
        new_word_freqs = {}
        for word, freq in word_freqs.items():
            new_word = []
            i = 0
            while i < len(word):
                if i < len(word) - 1 and (word[i], word[i+1]) == pair:
                    new_word.append(word[i] + word[i+1])
                    i += 2
                else:
                    new_word.append(word[i])
                    i += 1
            new_word_freqs[tuple(new_word)] = freq
        return new_word_freqs

    def train(self, corpus):
        word_freqs = self._get_word_freqs(corpus)
        for _ in range(self.num_merges):
            pair_stats = self._get_pair_stats(word_freqs)
            if not pair_stats:
                break
            best_pair = pair_stats.most_common(1)[0][0]
            word_freqs = self._merge_pair(best_pair, word_freqs)
            self.merges.append(best_pair)
        return self

    def _tokenize_word(self, word):
        tokens = list(word) + ["</w>"]
        for pair in self.merges:
            new_tokens = []
            i = 0
            while i < len(tokens):
                if i < len(tokens) - 1 and (tokens[i], tokens[i+1]) == pair:
                    new_tokens.append(tokens[i] + tokens[i+1])
                    i += 2
                else:
                    new_tokens.append(tokens[i])
                    i += 1
            tokens = new_tokens
        return tokens

    def encode(self, text):
        result = []
        for word in text.split():
            result.extend(self._tokenize_word(word))
        return result
```

测试这个BPE实现：

```python
corpus = [
    "low low low low low",
    "lower lower",
    "newest newest newest newest",
    "widest widest widest"
]

bpe = SimpleBPE(num_merges=10)
bpe.train(corpus)

print("合并规则:", bpe.merges)
# [('e', 's'), ('es', 't'), ('est', '</w>'), ...]

print(bpe.encode("lowest"))
# ['low', 'est</w>']
```

这个简化版BPE展示了核心逻辑，但生产环境的BPE还要处理正则表达式预分词、Unicode处理、字节级操作等细节。

> 金句：BPE的精妙之处在于，它让模型自己决定词表——频率说了算，数据驱动一切。

### GPT的tiktoken分词器

讲完了BPE原理，来看GPT实际使用的分词器——tiktoken。tiktoken是OpenAI开源的高性能BPE分词器，用Rust实现核心逻辑，Python调用，速度极快。

```python
import tiktoken

# 加载GPT-4使用的分词器
enc = tiktoken.get_encoding("cl100k_base")

text = "Hello, 你好, こんにちは"
tokens = enc.encode(text)
print(f"Token数: {len(tokens)}")
print(f"Token IDs: {tokens}")

# 逐个Token查看
for tid in tokens:
    print(f"  ID={tid}, Token={enc.decode([tid])}")

# 解码
decoded = enc.decode(tokens)
print(f"解码: {decoded}")
```

**cl100k_base词表。** 这是GPT-4和GPT-3.5-turbo使用的编码方案，词表大小约100k（准确说是100277）。在大量多语言语料上训练的BPE，支持中文、日文、韩文等多种语言。

```python
# 不同编码方案的对比
for encoding_name in ["gpt2", "cl100k_base"]:
    enc = tiktoken.get_encoding(encoding_name)
    text = "自然语言处理"
    tokens = enc.encode(text)
    print(f"{encoding_name}: {len(tokens)} tokens")
# gpt2: 可能需要15+ tokens（中文效率低）
# cl100k_base: 可能只需要6-8 tokens（中文优化过）
```

gpt2编码对中文极不友好，因为GPT-2主要在英文语料上训练，中文字符大多被拆成字节级Token。而cl100k_base在多语言语料上训练，中文Token效率高很多。这直接影响API调用成本。

**Token计数与费用估算。** OpenAI的API按Token计费，准确计算Token数很重要：

```python
import tiktoken

def count_tokens(text, model="gpt-4"):
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

def estimate_cost(text, model="gpt-4", price_per_1k=0.03):
    token_count = count_tokens(text, model)
    cost = (token_count / 1000) * price_per_1k
    return token_count, cost

text = "请帮我总结一下这篇关于自然语言处理的技术文章"
tokens, cost = estimate_cost(text)
print(f"Token数: {tokens}, 预估费用: ${cost:.6f}")

# 批量计算
texts = ["短文本", "中等长度的文本", "很长的文本" * 100]
total_tokens = sum(count_tokens(t) for t in texts)
print(f"总Token数: {total_tokens}")
```

在实际项目中，Token计数非常关键。怕浪猫之前做过一个RAG系统，一开始没注意Token限制，长文档直接塞进Prompt，结果API报错`context_length_exceeded`。后来加了Token计数和截断逻辑才稳定运行。

> 金句：在LLM的世界里，Token就是货币。不会算Token的开发者，就像不会算账的商人。

**tiktoken的核心原理。** tiktoken使用字节级BPE（Byte-level BPE），先把文本编码成UTF-8字节序列，然后在字节层面做BPE。好处是理论上可以处理任何Unicode字符，不会出现OOV。因为UTF-8只有256种字节，BPE初始词表就是256个字节，通过合并规则逐步构建更大的子词。

```
字节级BPE vs 字符级BPE

字符级BPE:
  "你好" → 字符 ['你', '好'] → BPE合并

字节级BPE:
  "你好" → UTF-8字节 [228,189,160,229,165,189] → BPE合并

字节级优势：词表基础是256种字节，覆盖所有Unicode字符
字符级劣势：中文有上万个字符，词表基础太大
```

### 主流分词器对比

怕浪猫整理了主流大模型分词器的对比：

```
主流大模型分词器对比

模型        | 分词算法      | 词表大小  | 中文效率  | 特点
------------|---------------|-----------|-----------|----------------------
GPT-2       | BPE           | 50,257    | 低        | 字节级BPE，中文拆成3-4个Token
GPT-4       | BPE           | 100,277   | 中        | cl100k_base，中文优化
LLaMA-2     | SentencePiece | 32,000    | 中        | 支持中文，但词表偏小
LLaMA-3     | tiktoken BPE  | 128,256   | 高        | 多语言优化，中文效率提升
Qwen2       | tiktoken BPE  | 151,646   | 高        | 中文原生优化，词表含中文常见词
BERT        | WordPiece     | 30,522    | 中        | 字符级，中文一字一Token
```

"中文效率"指同一段中文文本切出的Token数。Token越少，模型处理效率越高，API费用越低。对于主要处理中文的项目，选Qwen2或LLaMA-3这类中文优化过的分词器能显著降低成本。

## 11.5 文本向量化Embedding — 从ID到语义空间

### One-Hot编码及其问题

有了Token ID，最直接的向量化方式是One-Hot（独热）编码。每个Token用一个长度等于词表大小的向量表示，只有对应位置为1，其余全为0。

```python
import torch

vocab_size = 10
token_ids = torch.tensor([3, 5, 7])

one_hot = torch.nn.functional.one_hot(token_ids, num_classes=vocab_size)
print(one_hot.shape)  # torch.Size([3, 10])
print(one_hot)
# tensor([[0,0,0,1,0,0,0,0,0,0],
#         [0,0,0,0,0,1,0,0,0,0],
#         [0,0,0,0,0,0,0,1,0,0]])
```

One-Hot编码有两个严重问题：

**维度灾难。** 词表有50000个词，每个Token就是50000维向量，其中只有1个位置是1，其余全为0。极度稀疏，浪费内存和计算资源。

**语义缺失。** 任意两个不同词的One-Hot向量点积为0，意味着所有词之间"距离"相同。"猫"和"狗"的距离等于"猫"和"桌子"的距离，完全没有语义关系。

```
One-Hot编码的问题可视化

词A = [1,0,0,0,0,...]   "猫"
词B = [0,1,0,0,0,...]   "狗"
词C = [0,0,1,0,0,...]   "桌子"

cos(A,B) = 0  ← 猫和狗毫无关系？cos(A,C) = 0  ← 猫和桌子也毫无关系？
```

这显然不合理。我们需要一种能体现语义关系的表示方式。

### Word2Vec与GloVe — 分布式表示的崛起

分布式表示（Distributed Representation）的核心思想是：用一个低维稠密向量表示每个词，让语义相近的词在向量空间中距离也近。

**Word2Vec** 是最经典的词向量模型，由Google在2013年提出。它有两种架构：

```
Word2Vec的两种架构

CBOW (Continuous Bag of Words):
  用上下文预测中心词
  输入: ["我", "爱", "处理"] → 预测: "NLP"
  适合小数据集，训练速度快

Skip-gram:
  用中心词预测上下文
  输入: "NLP" → 预测: ["我", "爱", "处理"]
  适合大数据集，对低频词效果更好
```

Word2Vec的核心原理是：如果在语料中"猫"和"狗"经常出现在相似的上下文中（比如都跟在"养了一只"后面），那么它们的词向量会自动靠近。这就是语言学中著名的分布假说（Distributional Hypothesis）——上下文相似的词，语义也相似。

**GloVe（Global Vectors for Word Representation）** 是斯坦福大学提出的另一种词向量模型。和Word2Vec不同，GloVe利用了全局的共现矩阵——统计整个语料中每对词在固定窗口内共同出现的次数，然后对这个矩阵进行降维。

```python
# 使用预训练的Word2Vec词向量
# 安装: pip install gensim
from gensim.models import Word2Vec

# 准备训练数据（分词后的句子列表）
sentences = [
    ["我", "爱", "自然", "语言", "处理"],
    ["深度", "学习", "改变", "世界"],
    ["自然", "语言", "处理", "很", "有趣"],
    ["我", "爱", "深度", "学习"]
]

# 训练Word2Vec模型
model = Word2Vec(sentences, vector_size=64, window=2,
                 min_count=1, workers=4, epochs=100)

# 获取词向量
vec = model.wv["自然"]
print(f"'自然'的词向量维度: {vec.shape}")  # (64,)

# 计算词相似度
sim = model.wv.similarity("自然", "语言")
print(f"cos(自然, 语言) = {sim:.4f}")

# 找最相似的词
similar = model.wv.most_similar("学习", topn=3)
print(f"和'学习'最相似的词: {similar}")
```

Word2Vec和GloVe的词向量是静态的——一个词无论出现在什么上下文中，它的向量都不变。这导致了一个问题：多义词无法处理。"苹果"在"我吃了一个苹果"和"苹果发布了新iPhone"中含义完全不同，但静态词向量只能给它们同一个表示。这个局限后来被BERT等上下文相关的Embedding模型解决了。

> 金句：One-Hot是把每个词关进单独的牢房，Word2Vec是让它们在语义空间里自由社交。

### nn.Embedding层 — PyTorch中的实现

在PyTorch中，Embedding通过`nn.Embedding`层实现。前面已经提到它本质上是一个查找表，这里深入看看它的内部机制。

```python
import torch
import torch.nn as nn

# 创建Embedding层
vocab_size = 10000
embedding_dim = 256
embedding_layer = nn.Embedding(num_embeddings=vocab_size,
                                embedding_dim=embedding_dim)

# 查看权重矩阵
print(f"权重矩阵形状: {embedding_layer.weight.shape}")
# torch.Size([10000, 256])

# 前向传播：输入Token ID，输出对应向量
token_ids = torch.tensor([4, 15, 289, 1])  # 4个Token的ID
output = embedding_layer(token_ids)
print(f"输出形状: {output.shape}")
# torch.Size([4, 256])

# 本质就是从权重矩阵中按行索引
manual_output = embedding_layer.weight[token_ids]
print(torch.equal(output, manual_output))  # True
```

`nn.Embedding`的核心就是`weight`矩阵，形状为`(vocab_size, embedding_dim)`。前向传播等价于从权重矩阵中按行索引。但关键在于：这个权重矩阵是可学习的，会随着模型训练不断更新。

```
nn.Embedding的内部机制

权重矩阵 W (vocab_size × embedding_dim):
     dim_0  dim_1  ...  dim_255
ID=0 [ 0.12, -0.34, ..., 0.56]  ← [PAD]的向量
ID=1 [ 0.78,  0.11, ..., -0.22] ← [UNK]的向量
ID=2 [ 0.45, -0.67, ..., 0.33]  ← [BOS]的向量
...
ID=4 [ 0.91,  0.23, ..., -0.44] ← "我"的向量
...

输入: token_ids = [4, 15, 289, 1]
输出: W[4], W[15], W[289], W[1] 拼接成 (4, 256) 的矩阵
```

**Embedding层和Linear层的区别。** 很多人会把Embedding和全连接层搞混。Linear层做的是矩阵乘法`xW + b`，输入是连续向量。Embedding做的是索引查找`W[x]`，输入是整数ID。虽然数学上Embedding可以用one-hot向量乘以权重矩阵来等价实现，但查找操作的计算效率远高于矩阵乘法。

### Embedding维度选择

Embedding维度是一个关键的超参数。维度太高，参数量爆炸，容易过拟合，计算量大；维度太低，表达能力不足，语义信息丢失。

```python
import torch.nn as nn

# 不同规模的Embedding维度对比
configs = [
    ("小模型", 5000, 128),    # 词表5000，维度128
    ("中模型", 30000, 256),   # 词表30000，维度256
    ("大模型", 50000, 512),   # 词表50000，维度512
    ("LLM级", 100000, 4096),  # 词表100000，维度4096
]

for name, vocab, dim in configs:
    params = vocab * dim
    print(f"{name}: 词表={vocab}, 维度={dim}, "
          f"参数量={params:,} ({params/1e6:.1f}M)")
```

经验法则：Embedding维度通常取词表大小的四次根到十六次根之间。实际项目中，小模型用128-256维，中等模型用512-768维，大模型用1024-4096维。GPT-3用的是12288维，LLaMA-2用4096维。

怕浪猫的经验是：维度选择要考虑数据和任务的复杂度。简单任务用256维就够，复杂语义理解任务至少512维。如果训练数据少，用低维度防止过拟合；数据多，可以适当提高维度。

> 金句：Embedding维度就像房子的面积——太小住不下语义，太大浪费空间还难打扫。

### 实战：TokenID转向量的完整流程

把前面所有知识串起来，做一个完整的从文本到向量的端到端示例：

```python
import torch
import torch.nn as nn

# 第1步：构建词表
vocab = {"[PAD]": 0, "[UNK]": 1, "[BOS]": 2, "[EOS]": 3,
         "我": 4, "爱": 5, "自然": 6, "语言": 7,
         "处理": 8, "深度": 9, "学习": 10}
vocab_size = len(vocab)

# 第2步：文本 → Token ID
def text_to_ids(text, vocab, max_len=16):
    tokens = list(text)  # 字符分词
    ids = [vocab["[BOS]"]]
    for t in tokens:
        ids.append(vocab.get(t, vocab["[UNK]"]))
    ids.append(vocab["[EOS]"])
    # 填充
    while len(ids) < max_len:
        ids.append(vocab["[PAD]"])
    return ids[:max_len]

# 第3步：创建Embedding层
embedding_dim = 64
embedding = nn.Embedding(vocab_size, embedding_dim)

# 第4步：完整流程
text = "我爱自然语言处理"
token_ids = torch.tensor(text_to_ids(text, vocab))
print(f"Token IDs: {token_ids}")

# 转成向量
vectors = embedding(token_ids)
print(f"向量形状: {vectors.shape}")  # (16, 64)
print(f"第一个Token的向量: {vectors[0][:8]}...")  # 前8维

# 第5步：送入后续模型（这里用简单的线性层模拟）
linear = nn.Linear(embedding_dim, 32)
output = linear(vectors)
print(f"模型输出形状: {output.shape}")  # (16, 32)
```

这段代码展示了完整的数据流：文本 → 分词 → Token ID → Embedding → 模型输入。在实际的LLM中，Embedding后面会接Transformer的多层注意力和前馈网络，但数据流的起点就是这个。

```
完整数据流总览

"我爱自然语言处理"
  ↓ 字符分词
['我','爱','自','然','语','言','处','理']
  ↓ 查词表 (遇到不在词表的字用[UNK]=1)
[2, 4, 5, 1, 1, 1, 1, 1, 3, 0, 0, 0, 0, 0, 0, 0]
  (BOS)                              (EOS)(PAD...)
  ↓ nn.Embedding(vocab=11, dim=64)
[[0.12, -0.34, ...],   ← BOS的向量
 [0.56, 0.78, ...],    ← "我"的向量
 [0.33, -0.12, ...],   ← "爱"的向量
 [0.91, 0.44, ...],    ← [UNK]的向量
 ...]
  ↓ 送入Transformer
模型开始理解语义
```

### Embedding的进阶：位置编码的引入

标准Embedding只编码了词的语义信息，但没有编码位置信息。"猫追狗"和"狗追猫"经过Embedding后得到的向量集合是一样的（只是顺序不同），但对于注意力机制来说，顺序信息至关重要。

所以LLM在Embedding的基础上增加了位置编码（Positional Encoding）。位置编码可以是固定的正弦函数（如原始Transformer），也可以是可学习的位置Embedding（如BERT、GPT）。

```python
import torch
import torch.nn as nn
import math

class TokenPositionEmbedding(nn.Module):
    """Token Embedding + 可学习位置编码"""

    def __init__(self, vocab_size, d_model, max_len=512):
        super().__init__()
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        self.position_embedding = nn.Embedding(max_len, d_model)

    def forward(self, token_ids):
        seq_len = token_ids.size(1)
        # 生成位置ID: 0, 1, 2, ..., seq_len-1
        positions = torch.arange(seq_len, device=token_ids.device)
        # Token向量 + 位置向量
        tok_emb = self.token_embedding(token_ids)
        pos_emb = self.position_embedding(positions)
        return tok_emb + pos_emb

# 使用
model = TokenPositionEmbedding(vocab_size=10000, d_model=256)
token_ids = torch.tensor([[4, 5, 6, 7, 3]])  # 一个batch
output = model(token_ids)
print(f"输出形状: {output.shape}")  # (1, 5, 256)
```

Token Embedding编码"这是什么词"，位置Embedding编码"这个词在第几个位置"。两者相加，就得到了既包含语义又包含位置信息的完整表示。这是送入Transformer之前的标准步骤。

> 金句：Token Embedding告诉你"是什么"，位置Embedding告诉你"在哪里"，两者合一，模型才有了理解语言的全貌。

## 总结：文本处理的完整知识图谱

回顾整篇文章，文本到向量的完整链路可以浓缩为一张图：

```
文本处理知识图谱

原始文本
  ├── 分词 (Tokenization)
  │   ├── 空格分词 → 英文简单场景
  │   ├── 字符分词 → 中文基础场景
  │   ├── 词级分词 → jieba, 精度高但OOV严重
  │   └── 子词分词 → BPE/WordPiece, 主流方案
  │       ├── BPE: 频率驱动合并 (GPT系列)
  │       └── WordPiece: 互信息驱动合并 (BERT)
  ├── 词汇表构建
  │   ├── 特殊Token: [PAD] [UNK] [BOS] [EOS]
  │   └── 按频率排序分配ID
  ├── Tokenizer核心功能
  │   ├── encode: 文本 → Token ID序列
  │   └── decode: Token ID序列 → 文本
  ├── 工业级分词器
  │   ├── tiktoken (OpenAI GPT)
  │   ├── SentencePiece (LLaMA)
  │   └── Token计数与费用估算
  └── 向量化 (Embedding)
      ├── One-Hot: 简单但无语义
      ├── Word2Vec/GloVe: 静态分布式表示
      ├── nn.Embedding: 可学习的查找表
      └── 位置编码: 注入位置信息
```

几个关键 takeaway：

第一，分词是LLM数据处理的第一道关卡，选择合适的分词器直接影响模型效果和API成本。中文场景优先考虑BPE子词分词，使用tiktoken或SentencePiece。

第二，词汇表的构建要预留特殊Token，按频率排序分配ID。词表大小和Embedding维度需要平衡——词表太小OOV多，太大参数量和计算量爆炸。

第三，Embedding不是简单的数字映射，而是语义空间的学习过程。通过训练，语义相近的词会在向量空间中靠近，这是深度学习理解语言的基础。

第四，Token计数是实际项目中的刚需技能。不管是控制Prompt长度、估算API费用，还是做batch处理时的长度管理，都离不开准确的Token计数。

> 金句：文本处理是LLM的地基。地基不牢，再华丽的Transformer也只是空中楼阁。

## 互动与收藏

如果这篇文章对你有帮助，请收藏起来。后面做项目的时候，分词器选型、Token计数、Embedding配置这些细节你会反复用到，有这篇文章在手边会省很多翻文档的时间。

有什么问题或者想看的内容，欢迎在评论区交流。你在实际项目中遇到过哪些分词相关的坑？用的是哪个分词器？怕浪猫会在评论区和大家一起讨论。

怕浪猫说：技术这条路上，踩过的坑都是勋章。分词这件事看起来不起眼，但等你真正调过模型、优化过Prompt、算过Token费用之后，会发现它无处不在。把基础打扎实，后面的路才能走得更远。下一章我们聊聊注意力机制，那才是Transformer真正的魔法所在。

系列进度 11/19

下章预告：第12章 — 注意力机制的奥秘。Self-Attention是怎么让模型"看到"上下文的？Multi-Head Attention为什么需要多头？Query、Key、Value到底在查什么？敬请期待。