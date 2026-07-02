# 工欲善其事，必先利其器 — 开发环境的搭建

> 搭环境踩坑三天，写代码只需三小时。怕浪猫带你绕过所有坑，一步到位搭好LLM开发环境。

如果你正在被"conda还是venv"、"CUDA装哪个版本"、"Docker怎么用GPU"这些问题折磨，那么这篇文章就是为你准备的。我是怕浪猫，一个在LLM开发坑里摸爬滚打过来的工程师。今天这章我会把开发环境搭建的每一步都给你讲透，从原理到实操，从踩坑到避坑，让你一次搭好不再返工。

这篇内容覆盖从Python环境管理、VSCode配置、GPU驱动安装、Docker容器化到云端免费算力的完整链路，是LLM开发工程师的"装备清单"。全文超过一万两千字，建议先收藏，搭环境的时候对着一步步来。

## 3.1 导学与MiniConda安装使用

### 3.1.1 Conda vs MiniConda vs Anaconda

刚入行的同学第一个困惑就是：Conda、MiniConda、Anaconda这三个到底什么关系？名字都差不多，功能似乎也类似，但选错了真的会给自己挖坑。

简单说，它们是同一个东西的"精简版"和"全家桶版"的区别。Conda本身是一个开源的包管理系统和环境管理系统，最初由Anaconda公司开发。它能够管理不同版本的软件包和Python环境，实现环境隔离。而MiniConda和Anaconda都是基于Conda的发行版，区别在于附带的预装内容不同。

| 工具 | 体积 | 包含内容 | 适用场景 |
|------|------|---------|---------|
| Conda | 极小 | 仅包管理器 | 已有Python环境，只需包管理 |
| MiniConda | 约80MB | Conda + Python + pip | 推荐，按需安装，干净利落 |
| Anaconda | 约3GB | Conda + Python + 1500+预装包 | 教学/数据分析，但臃肿 |

> 怕浪猫踩坑心得：Anaconda预装的那些包，做LLM开发百分之九十都用不上，反而会因为版本冲突让你debug到怀疑人生。MiniConda才是正道。

具体来说，Anaconda预装了numpy、pandas、scipy、scikit-learn等大量科学计算包。这些包在LLM开发中并不是必需的，但它们会占用大量磁盘空间，更重要的是它们的版本可能会和PyTorch、Transformers等LLM框架产生依赖冲突。比如Anaconda预装的numpy可能是1.24版本，而某个PyTorch插件要求numpy必须低于1.23，这时候冲突就产生了，而且这种冲突往往报错信息不明确，你看到的是一堆看不懂的ImportError或AttributeError，根本想不到是numpy版本的问题，排查起来非常痛苦。怕浪猫曾经花了整整一天时间排查一个类似的冲突，最后发现只是因为Anaconda预装的某个包版本不对。

MiniConda只给你一个Python解释器和一个Conda包管理器，剩下的所有东西你自己装。这意味着你对环境有完全的控制权，每个包的版本都是你自己选的，出了问题也容易定位。

MiniConda的安装非常简单，但有几个细节需要注意。Linux和macOS下直接下载安装脚本执行：

```bash
# Linux/macOS 安装MiniConda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
# 一路回车，最后选择yes让conda加入PATH

# 验证安装
conda --version
# 输出类似: conda 24.5.0
```

Windows用户去官网下载exe安装包，双击安装。安装时有几个选项需要注意：勾选"Add Miniconda3 to my PATH environment variable"，虽然安装程序提示不推荐，但勾选后省去了手动配置PATH的麻烦；安装路径不要有中文和空格，否则后续使用可能出问题。安装完成后可能需要重启终端才能识别conda命令。官方下载地址：https://docs.conda.io/en/latest/miniconda.html

安装完成后，建议先做一件事：初始化conda的shell集成。这样每次打开终端时，conda会自动激活base环境，你也能方便地切换环境。

```bash
# 初始化conda shell集成
conda init bash  # 如果用zsh则执行 conda init zsh
# 重启终端后生效

# 如果不想每次启动都激活base环境
conda config --set auto_activate_base false
```

### 3.1.2 环境隔离：conda create/activate

环境隔离是Conda最核心的价值。不同的项目可能需要不同版本的Python和不同的依赖包，如果没有环境隔离，你的系统Python环境很快就会变成一锅粥。

> "环境隔离不是洁癖，是生存技能。" — 怕浪猫在PyTorch和TensorFlow版本打架之后悟出的道理。

举个真实的例子：你手头有两个项目，项目A需要PyTorch 1.13配Python 3.9，项目B需要PyTorch 2.2配Python 3.11。如果都在同一个环境里装，先装的会被后装的覆盖，你的代码就会因为API不兼容而报错。用Conda创建两个独立的环境，各装各的，互不干扰。

核心操作就三板斧：

```bash
# 创建环境（指定Python版本）
conda create -n llm_dev python=3.11 -y

# 激活环境
conda activate llm_dev

# 退出环境
conda deactivate

# 查看所有环境
conda env list
# 输出：
# llm_dev    /home/user/miniconda3/envs/llm_dev
# base       /home/user/miniconda3
```

LLM开发中，Python版本的选择有个关键原则：不要用太新的版本。目前PyTorch和HuggingFace生态对Python 3.10和3.11的支持最成熟，3.12虽然也能用，但部分依赖包可能还没跟上。怕浪猫推荐无脑选3.11，踩坑概率最低。

环境创建好之后，可以在环境里安装包。安装包时一定要确认当前处于正确的环境中，这是新手最容易犯的错误之一。一个简单的验证方法是看终端提示符前面的括号：

```bash
(base) $ conda activate llm_dev
(llm_dev) $ python --version
# Python 3.11.9
```

括号里显示的就是当前激活的环境名。如果你创建了一个新环境但安装包时发现装到了base里，百分之九十九的原因是你没有激活新环境。怕浪猫建议每次打开新终端时，先执行 `conda env list` 看看有哪些环境，再 `conda activate` 你需要的环境，养成习惯后就不会再犯这个错误了。

> "折腾了两天才发现包装到了错误的环境里，这种事每个LLM开发者都经历过至少一次。" — 怕浪猫

### 3.1.3 包管理与渠道配置

Conda的包管理有两个维度：conda install和pip install。很多新手搞不清什么时候用哪个，甚至在一个环境里混用，导致依赖关系混乱。

经验法则：优先用pip，conda只用来管理Python版本和环境本身。原因是conda的包仓库更新比PyPI慢，很多LLM相关的新包在conda里根本没有，或者版本很旧。比如transformers的最新版本可能在PyPI上已经发布了，但在conda-forge里还是上个版本。

```bash
# conda安装（适合科学计算底层库）
conda install numpy pandas scipy -c conda-forge

# pip安装（适合LLM生态包）
pip install torch transformers accelerate

# 查看已安装的包
conda list
pip list
```

渠道配置也很重要。Conda默认的defaults渠道是Anaconda公司的官方仓库，但有些包在这个渠道里没有。建议添加conda-forge，这是一个社区维护的仓库，包的种类更全，更新也更快：

```bash
# 配置conda渠道
conda config --add channels conda-forge
conda config --add channels pytorch
conda config --set channel_priority strict

# 查看配置
conda config --show channels
```

`channel_priority strict`这个设置很重要。它意味着当多个渠道都有同一个包时，conda会严格按照渠道顺序选择版本，不会混用不同渠道的包。这样可以避免因混用渠道导致的依赖冲突。

还有一个实用技巧：导出和恢复环境。当你需要在不同机器上复制环境，或者把环境配置分享给团队成员时，这个功能非常有用。导出的配置文件记录了环境中所有包的精确版本号，在另一台机器上可以精确复现同样的环境：

```bash
# 导出环境配置
conda env export --no-builds > environment.yml

# 在另一台机器上恢复
conda env create -f environment.yml
```

`--no-builds`参数的作用是去掉构建信息，这样导出的配置文件在不同平台上也能使用。如果不加这个参数，导出的文件会包含平台特定的构建哈希值，换平台就会报错。另外，如果你只想分享依赖列表而不需要精确复现，可以用 `pip freeze > requirements.txt` 导出pip安装的包列表，这种方式更轻量，也是社区中最常见的分享方式。

### 3.1.4 pip镜像源配置

国内用户用pip装包，默认走PyPI官方源，速度感人。一个PyTorch安装包动辄两个G，走官方源可能要下一个小时。配置国内镜像源可以让下载速度提升十倍以上：

```bash
# 配置pip镜像源（清华源）
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 其他可选镜像源：
# 阿里云: https://mirrors.aliyun.com/pypi/simple
# 中科大: https://pypi.mirrors.ustc.edu.cn/simple
# 腾讯云: https://mirrors.cloud.tencent.com/pypi/simple

# 验证配置
pip config list
```

如果只是临时使用镜像源，不需要全局配置，可以在安装时加上 `-i` 参数：

```bash
pip install torch -i https://pypi.tuna.tsinghua.edu.cn/simple
```

对于Conda本身，也可以配置国内镜像，但怕浪猫实测Conda的国内镜像经常同步不及时，有时候装出来的包版本和官方源不一致。另外Conda的依赖解析器（solver）在处理复杂依赖时速度很慢，经常卡在"Solving environment..."这一步好几分钟。建议Conda只用来管理环境和Python版本，包安装走pip加国内镜像就够了。这样既快又不容易出问题。如果确实需要用conda安装包，可以尝试使用mamba（一个C语言实现的conda替代品），安装好mamba后，使用方法和conda完全一样，只是把 `conda` 替换成 `mamba`：`mamba install numpy`、`mamba create -n env python=3.11` 等。安装速度的提升是非常明显的，原本conda需要三五分钟解析的依赖，mamba几秒钟就能完成。

还有一个容易忽略的细节：pip安装包时如果下载慢，除了镜像源问题，还可能是没有配置 trusted-host。如果镜像源的HTTPS证书有问题，pip会拒绝连接。可以加上 `--trusted-host` 参数：

```bash
pip install torch \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --trusted-host pypi.tuna.tsinghua.edu.cn
```

> 有一句话说得好："工具链的配置是一次性投入，终身受益。花一小时配好镜像源，省下的是无数次等待下载的时间。"

## 3.2 VSCode配置

VSCode（Visual Studio Code）是目前LLM开发中最主流的编辑器，没有之一。它轻量、插件丰富、远程开发能力强，完美契合LLM开发的需求。相比于PyCharm的笨重和Jupyter Lab的功能局限，VSCode找到了性能和功能之间的最佳平衡点。这一节怕浪猫带你把VSCode配置成LLM开发的终极利器。

### 3.2.1 Python扩展

安装VSCode后，第一件事就是装Python扩展。在扩展商店搜索"Python"，安装Microsoft官方出品的Python扩展包。这个扩展包是VSCode做Python开发的基础，它包含了以下功能：

- IntelliSense智能补全：根据上下文自动提示函数名、参数、变量名
- 代码调试器：支持断点调试、条件断点、远程调试
- Linting：集成PyLint、Flake8等代码检查工具，实时发现代码问题
- 代码格式化：集成Black、autopep8等格式化工具，一键整理代码风格
- Jupyter Notebook支持：在VSCode中直接编辑和运行.ipynb文件

装完Python扩展后，按 `Ctrl+Shift+P`（macOS是 `Cmd+Shift+P`），输入"Python: Select Interpreter"，选择你刚才用Conda创建的环境的Python解释器。VSCode会自动识别Conda环境，你在列表里选对应的就行。

为了让VSCode更好地配合LLM开发，建议创建一个工作区配置文件：

```json
// .vscode/settings.json 示例
{
    "python.defaultInterpreterPath": "~/miniconda3/envs/llm_dev/bin/python",
    "python.formatting.provider": "black",
    "python.linting.enabled": true,
    "python.linting.pylintEnabled": false,
    "python.linting.flake8Enabled": true,
    "editor.formatOnSave": true,
    "python.languageServer": "Pylance"
}
```

这里有几个关键配置说明一下。`python.languageServer`设为Pylance，这是Microsoft开发的高性能Python语言服务器，比默认的Jedi快很多，补全也更智能，对类型注解的支持也更好。`editor.formatOnSave`设为true，每次保存文件时自动格式化代码，省去手动格式化的麻烦，也能保证团队代码风格统一。`pylintEnabled`设为false是因为PyLint太啰嗦了，会报大量无关紧要的警告信息，淹没了真正重要的问题，用Flake8就够了，它的规则更精简也更合理。另外建议安装isort扩展，它可以自动整理import语句的顺序，让代码更整洁。

### 3.2.2 Jupyter扩展

LLM开发中，Jupyter Notebook是不可或缺的工具。训练模型时你需要逐步执行代码、查看中间结果、可视化训练曲线，这些在传统.py脚本里很难做到，但在Notebook里非常自然。

VSCode的Jupyter扩展让你直接在VSCode里打开和编辑.ipynb文件，不需要启动独立的Jupyter Lab服务。这对于习惯在终端里工作的同学来说非常友好。

安装Jupyter扩展后，你可以直接新建一个 `.ipynb` 文件，选择Conda环境作为kernel，就可以开始写了：

```python
# 在Notebook中逐步执行
import torch
print(f"PyTorch版本: {torch.__version__}")
print(f"CUDA可用: {torch.cuda.is_available()}")
print(f"GPU设备: {torch.cuda.get_device_name(0)}")
print(f"显存总量: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
```

Notebook的开发模式特别适合LLM开发中的数据探索阶段。你可以一个cell加载模型，一个cell做推理，一个cell可视化输出，每个cell的执行结果都保留在界面上，方便你对比不同参数的效果。

> 怕浪猫习惯在Notebook里做数据探索和模型调试，等代码稳定后再搬到.py文件里。这是LLM开发的最佳实践，不要一上来就写脚本，你会反复修改运行，效率极低。

一个实用技巧：在VSCode的Notebook中，你可以用 `%timeit` 魔法命令来测量代码执行时间，这在优化模型推理速度时非常有用：

```python
# 测量模型推理时间
%timeit model.generate(input_ids, max_new_tokens=50)
```

### 3.2.3 调试配置

VSCode的调试功能是很多同学忽视的。LLM开发中，模型训练出问题时，光看日志往往不够，你需要断点查看张量的shape、梯度值、中间特征图等。满屏的print语句不仅效率低，而且很难定位问题。

创建 `.vscode/launch.json` 配置调试：

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python: 训练脚本调试",
            "type": "python",
            "request": "launch",
            "program": "${workspaceFolder}/train.py",
            "console": "integratedTerminal",
            "args": [
                "--config", "config.yaml",
                "--epochs", "10"
            ],
            "env": {
                "CUDA_VISIBLE_DEVICES": "0"
            },
            "justMyCode": false
        }
    ]
}
```

`justMyCode`设为false很重要，这样你可以进入第三方库（如transformers、torch）的源码里设断点。当框架内部出了问题，你需要看框架源码的执行流程时，这个设置就非常关键。

`CUDA_VISIBLE_DEVICES`环境变量用来控制使用哪张GPU。如果你有多张GPU但只想用其中一张来调试，就设置这个变量为对应的卡号。这在多卡服务器上特别有用，避免调试时占用的卡影响其他用户。设好断点后按F5启动调试，你可以逐行执行代码，在变量面板里查看任意变量的值。这比满屏 `print()` 高效一百倍。

还有一个调试技巧是条件断点。在代码行号左边点击设置断点后，右键点击断点圆点，选择"Edit Breakpoint"，可以设置条件。比如你在一个for循环里设断点，但只想在第100次迭代时停下来，可以设置条件 `i == 100`。这在调试训练循环时特别有用，因为训练通常有几千个iteration，你不可能每次都从头断起。

> "调试不是找bug，是理解代码运行的过程。学会用断点，你会对模型内部发生了什么有完全不同的认知。" — 怕浪猫

### 3.2.4 Remote SSH远程开发

这是VSCode最强大的功能之一，对于LLM开发者来说几乎是必备技能。LLM开发通常需要连接远程GPU服务器，传统做法是用SSH连上去，在终端里用vim写代码，体验很差。Remote SSH扩展让你像编辑本地文件一样编辑远程服务器上的代码。

安装"Remote - SSH"扩展后，按 `Ctrl+Shift+P`，输入"Remote-SSH: Connect to Host"，输入你的服务器地址：

```
ssh user@192.168.1.100
```

连接成功后，VSCode左下角会显示绿色的远程标识，你可以直接打开远程服务器上的文件夹，所有操作都像在本地一样。代码补全、调试、终端、文件管理，全部可用。甚至Git操作也能直接在远程执行，不需要在本地和远程之间同步代码。

配置SSH免密登录会让体验更顺滑：

```bash
# 本地生成密钥
ssh-keygen -t ed25519 -C "your_email@example.com"

# 将公钥传到服务器
ssh-copy-id user@192.168.1.100

# 之后SSH连接不再需要输密码
```

建议在SSH配置文件中给服务器起个别名，这样不用每次都输入完整地址：

```bash
# ~/.ssh/config
Host gpu-server
    HostName 192.168.1.100
    User user
    IdentityFile ~/.ssh/id_ed25519
    Port 22
```

配置好后，在VSCode里连接时只需输入 `gpu-server` 就行了。还可以配置端口转发，把远程服务器上的Jupyter服务映射到本地浏览器：

```bash
# 在SSH配置中添加端口转发
# ~/.ssh/config
Host gpu-server
    HostName 192.168.1.100
    User user
    LocalForward 8888 localhost:8888
```

这样你在远程服务器上启动Jupyter后，在本地浏览器访问 `localhost:8888` 就能直接打开。

> "Remote SSH是远程开发的分水岭。用之前，你在终端里敲vim；用之后，你在本地IDE里写远程代码。生产力差距是数量级的。" — 怕浪猫

## 3.3 硬件与驱动

### 3.3.1 GPU选型：RTX 3090/4090/A100

LLM开发对GPU的依赖不言而喻。选什么卡，直接决定你能训练多大的模型、跑多快的推理。这一节怕浪猫帮你把GPU选型这件事彻底讲清楚。

GPU的核心指标是显存容量（VRAM）和计算能力。显存决定你能装下多大的模型，计算能力决定训练和推理的速度。对于LLM开发来说，显存永远是第一优先级的考虑因素。

| GPU型号 | 显存 | 架构 | 适合场景 | 参考价格 |
|---------|------|------|---------|---------|
| RTX 3090 | 24GB | Ampere | 入门训练，微调7B模型 | 二手约4000元 |
| RTX 4090 | 24GB | Ada Lovelace | 主流训练，推理速度快 | 约15000元 |
| A100 40GB | 40GB | Ampere | 专业训练，多卡并行 | 约10万元 |
| A100 80GB | 80GB | Ampere | 大模型训练 | 约15万元 |

选型的核心指标是显存（VRAM）。模型参数量越大，需要的显存越多。一个粗略的估算公式：

```
显存需求(GB) ≈ 参数量(B) × 2 × 精度系数
# FP32精度系数=4, FP16精度系数=2, INT8精度系数=1
# 例如: 7B模型 FP16推理 ≈ 7 × 2 × 2 = 28GB
```

也就是说，一个7B参数的大模型（如Qwen2-7B），用FP16（Float Point 16-bit，半精度浮点数）做推理，大约需要14GB显存。24GB的RTX 3090/4090刚好够用。但如果你要做全参数微调（Full Fine-Tuning），显存需求会翻三到四倍，因为还要存储梯度和优化器状态。

RTX 3090是目前性价比最高的入门卡。二手价格四千左右，24GB显存能覆盖大部分LLM入门场景：推理7B模型、LoRA微调、训练小型模型。它的缺点是功耗高（350W），需要大功率电源，而且没有ECC（Error Correction Code，纠错码）内存，长时间训练偶尔会出错。另外3090的体积很大，三槽的设计意味着一些主板可能只能插一张卡。

RTX 4090是当前消费级卡皇。同样是24GB显存，但Ada Lovelace架构的计算性能比Ampere强不少，训练和推理速度大约快百分之四十到六十。它还支持FP8（Float Point 8-bit）精度计算，在某些场景下可以进一步加速。如果你预算充足且追求速度，4090是最好的选择。但它也有缺点：价格高，而且NVIDIA限制了4090的数据中心用途（虽然实际执行并不严格）。

A100是专业数据中心卡。它有40GB和80GB两个版本，支持NVLink（NVIDIA的高带宽GPU互联技术）多卡互联，支持ECC内存，稳定性极好。如果你要做严肃的模型训练，A100是首选。但价格昂贵，个人开发者通常用不起，一般是租云服务来用。值得一提的是A100 80GB版本，80GB的显存可以单卡全参数微调7B模型，这在工程上是非常有价值的。

> 怕浪猫建议：入门阶段一张RTX 3090 24GB足够了。能跑推理、能做LoRA微调、能跑小模型训练。等你真正需要训练大模型时，再去租A100。不要一上来就追求顶级硬件，先把技术栈学扎实。

### 3.3.2 显存与训练规模的关系

理解显存怎么吃掉的，是LLM工程师的基本功。训练时的显存消耗分为四块，每一块都需要理解清楚：

1. **模型参数**：权重矩阵本身占用的空间。一个7B模型有70亿个参数，每个参数在FP16精度下占2个字节，总共14GB。
2. **梯度**：反向传播时需要计算和存储梯度，梯度的shape和参数完全一样，所以又需要14GB。
3. **优化器状态**：Adam（Adaptive Moment Estimation，自适应矩估计）优化器需要存储一阶矩和二阶矩，每个都是和参数等大的张量，而且通常以FP32精度存储，所以是参数大小的4倍。7B模型的优化器状态约56GB。
4. **激活值**：前向传播的中间结果，用于反向传播计算梯度。激活值的大小取决于batch size和序列长度，通常在几个GB到十几个GB之间。

以7B模型、FP16混合精度训练为例：

```
模型参数:  7B × 2 bytes = 14GB
梯度:      7B × 2 bytes = 14GB
优化器状态: 7B × 8 bytes = 56GB (FP32的m和v)
激活值:    约 4-8GB (取决于batch size和序列长度)
总计:      约 88-92GB
```

这就是为什么全参数微调7B模型需要80GB以上的显存。而LoRA（Low-Rank Adaptation，低秩适配）微调只训练少量低秩矩阵参数，可训练参数量通常只有原模型的百分之一甚至更少，显存需求可以降到16-20GB。这就是LoRA在社区里这么流行的原因。

除了LoRA，还有一些显存优化技术值得了解：

- **梯度累积（Gradient Accumulation）**：把大batch拆成小batch逐步累积梯度，等效实现大batch训练，但减少显存占用
- **混合精度训练（Mixed Precision Training）**：用FP16做前向和反向传播，FP32存储主权重，既省显存又保证精度
- **梯度检查点（Gradient Checkpointing）**：不保存中间激活值，反向传播时重新计算，用计算时间换显存空间

这些技术在后面的实战章节中都会用到，现在先有个概念就行。理解显存管理是LLM工程师和普通Python开发者的关键区别之一。普通Python开发者几乎不需要关心内存管理，因为Python有垃圾回收机制。但在LLM开发中，显存是一个硬约束，超出显存就是超出显存，没有商量的余地。学会在显存受限的条件下工作，是LLM工程师的核心能力。

> "显存就像钱包，永远不够花。学会精打细算，是LLM工程师的核心竞争力。" — 怕浪猫

### 3.3.3 NVIDIA驱动/CUDA Toolkit/cuDNN三者关系

这是新手最容易混淆的三件套。很多人装GPU环境时装了驱动不知道还要装CUDA，装了CUDA不知道还要装cuDNN，最后运行PyTorch时报各种CUDA error，完全不知道哪里出了问题。

怕浪猫用一个比喻来说清楚三者的关系：

- **NVIDIA Driver**（显卡驱动）是"操作系统层面的翻译官"，让操作系统能识别和控制GPU硬件。没有它，你的GPU就是一块昂贵的塑料板。
- **CUDA Toolkit**（Compute Unified Device Architecture，统一计算设备架构）是"GPU编程的工具箱"，提供C/C++编译器、运行时库、驱动API等，让你能在GPU上跑并行计算程序。它建立在NVIDIA Driver之上。
- **cuDNN**（CUDA Deep Neural Network library，CUDA深度神经网络库）是"深度学习加速库"，在CUDA之上封装了卷积、池化、归一化、激活函数等常用深度学习操作的高性能GPU实现。PyTorch和TensorFlow底层都会调用cuDNN来加速计算。

三者的依赖关系是严格的层级关系：NVIDIA Driver在最底层，CUDA Toolkit在中间层，cuDNN在最上层。你装的CUDA版本必须和驱动版本兼容，cuDNN版本必须和CUDA版本兼容。任何一个环节版本不匹配，都会导致运行失败。

```
┌─────────────────────────────────────┐
│         应用层 (PyTorch)             │
├─────────────────────────────────────┤
│      cuDNN (深度学习加速库)           │
├─────────────────────────────────────┤
│   CUDA Toolkit (GPU计算工具箱)        │
├─────────────────────────────────────┤
│    NVIDIA Driver (显卡驱动)          │
├─────────────────────────────────────┤
│       GPU硬件 (RTX 3090等)           │
└─────────────────────────────────────┘
```

版本对应关系可以通过NVIDIA官方文档查询：https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html

一个关键概念：nvidia-smi显示的CUDA Version是驱动支持的最高CUDA版本，不是你系统里实际安装的CUDA Toolkit版本。比如nvidia-smi显示CUDA 12.2，意味着你的驱动最高支持CUDA 12.2，但你实际可能装的是CUDA 12.1。实际安装的CUDA Toolkit版本要用 `nvcc --version` 来查看。

> 怕浪猫踩坑实录：有一次我装了最新版CUDA 12.4，结果PyTorch只支持到12.1，运行时报各种CUDA error。教训：先看PyTorch支持哪个CUDA版本，再决定装哪个版本的CUDA Toolkit。PyTorch官方安装页面会明确标注支持版本。

### 3.3.4 Linux与Windows驱动安装

**Linux（以Ubuntu为例）：**

Linux下安装NVIDIA驱动有多种方式，最简单的是使用Ubuntu自带的驱动管理工具：

```bash
# 查看推荐驱动版本
ubuntu-drivers devices

# 方法1: 自动安装推荐驱动
sudo ubuntu-drivers autoinstall
sudo reboot

# 方法2: 手动指定版本
sudo apt install nvidia-driver-535
sudo reboot

# 验证驱动安装
nvidia-smi
# 会输出GPU型号、驱动版本、CUDA版本、显存使用情况
```

重启后执行 `nvidia-smi`，如果能看到GPU信息表格，说明驱动安装成功。

CUDA Toolkit的安装稍微复杂一些。需要去NVIDIA开发者网站下载对应版本的安装包：

```bash
# Linux: 下载对应版本的CUDA Toolkit
wget https://developer.download.nvidia.com/compute/cuda/12.1.1/local_installers/cuda_12.1.1_530.30.02_linux.run
sudo sh cuda_12.1.1_530.30.02_linux.run

# 安装时取消勾选Driver选项（已单独安装过驱动）
# 只安装CUDA Toolkit和示例

# 配置环境变量（追加到 ~/.bashrc）
export PATH=/usr/local/cuda-12.1/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-12.1/lib64:$LD_LIBRARY_PATH

# 使配置生效
source ~/.bashrc

# 验证
nvcc --version
```

cuDNN需要去NVIDIA开发者网站下载，需要注册NVIDIA开发者账号。下载时要注意选择和你的CUDA版本匹配的cuDNN版本。下载后解压，将文件复制到CUDA对应目录：

```bash
# 解压后执行
sudo cp include/cudnn*.h /usr/local/cuda/include/
sudo cp lib/libcudnn* /usr/local/cuda/lib64/
sudo chmod a+r /usr/local/cuda/include/cudnn*.h
sudo chmod a+r /usr/local/cuda/lib64/libcudnn*
```

**Windows：**

Windows下安装相对简单。去NVIDIA官网下载对应显卡的驱动程序，双击安装即可。安装时选择"自定义安装"，勾选"执行清洁安装"，这样会清除旧版本的残留文件。

CUDA Toolkit同样去官网下载安装包，运行安装程序即可。安装完成后需要手动添加环境变量，通常安装程序会自动添加，但最好检查一下：

```
系统环境变量中应包含:
CUDA_PATH = C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1
Path中应包含: %CUDA_PATH%\bin 和 %CUDA_PATH%\libnvvp
```

cuDNN在Windows下的安装方式是：下载zip包，解压后将bin、include、lib三个目录下的文件分别复制到CUDA Toolkit安装目录的对应位置。具体路径通常是 `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\` 下的bin、include、lib文件夹。复制完成后，打开命令行工具，输入 `nvcc --version` 确认CUDA安装成功，然后运行一个简单的PyTorch程序验证cuDNN是否生效。

Windows下有一个额外的坑：WSL2（Windows Subsystem for Linux 2）用户需要在WSL2内部单独安装CUDA Toolkit，不能使用Windows宿主机的CUDA。WSL2有自己的Linux内核，需要Linux版本的CUDA Toolkit。安装方法和原生Linux一样，但驱动只需要在Windows宿主机上安装一次，WSL2会自动识别。

### 3.3.5 nvidia-smi验证

`nvidia-smi` 是验证GPU环境是否正常的终极武器。执行后会输出一个表格，包含大量信息：

```
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 535.104.05   Driver Version: 535.104.05   CUDA Version: 12.2     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
|   0  NVIDIA RTX 3090      Off | 00000000:01:00.0  On |                  N/A |
|  30%  45C    P0    85W / 350W |   1200MiB / 24576MiB |     42%      Default |
+-------------------------------+----------------------+----------------------+
```

重点关注几个字段：
- **Driver Version**：驱动版本号，需要和CUDA Toolkit版本兼容
- **CUDA Version**：驱动支持的最高CUDA版本（注意这不是已安装的CUDA Toolkit版本）
- **GPU Name**：GPU型号，确认是不是你期望的那张卡
- **Memory Usage**：显存使用情况，1200MiB / 24576MiB表示已用1200MB，总共24576MB
- **Temperature**：GPU温度，训练时不要超过85度，否则可能触发降频
- **Power Draw**：当前功耗，训练时应该接近最大功耗（如3090的350W），如果只有几十瓦说明GPU没有被充分利用

如果想在代码中持续监控GPU状态，可以用Python的 `pynvml` 库：

```python
import pynvml
pynvml.nvmlInit()
handle = pynvml.nvmlDeviceGetHandleByIndex(0)
info = pynvml.nvmlDeviceGetMemoryInfo(handle)
temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
print(f"总显存: {info.total / 1024**3:.1f} GB")
print(f"已用: {info.used / 1024**3:.1f} GB")
print(f"空闲: {info.free / 1024**3:.1f} GB")
print(f"温度: {temp}C")
pynvml.nvmlShutdown()
```

> 一个常见误区：nvidia-smi显示的CUDA Version是驱动支持的最高版本，不代表你系统里装了这个版本的CUDA Toolkit。你实际安装的CUDA Toolkit版本要用 `nvcc --version` 查看。这两个版本经常不一样，不要搞混了。

## 3.4 Docker环境搭建

### 3.4.1 为什么需要Docker

当你团队里有三个人，一个用Ubuntu 20.04，一个用Ubuntu 22.04，一个用Windows WSL2（Windows Subsystem for Linux 2），CUDA版本各不相同，PyTorch版本也不一样——这时候"在我电脑上能跑"就成了最恐怖的话。

Docker解决的核心问题是"环境一致性"：把你的代码、依赖、CUDA环境全部打包成一个镜像（Image），在任何机器上运行都能得到相同的结果。镜像里包含了从操作系统层到应用层的所有东西，不依赖宿主机的任何软件版本。

> "Docker不是可选项，是团队协作的刚需。一个人开发可以不用Docker，两个人以上就必须用。" — 怕浪猫

Docker在LLM开发中的典型使用场景包括：

- **团队协作**：所有人用同一个镜像，环境完全一致，再也不用"在我电脑上能跑"的借口。新人入职时，拉取镜像后五分钟就能开始写代码，不需要花一天时间搭环境。
- **版本隔离**：同一个项目需要不同版本的PyTorch？用两个镜像分别运行。比如项目A用PyTorch 1.13做旧模型推理，项目B用PyTorch 2.2做新模型训练，两个容器同时运行互不干扰。
- **部署上线**：训练好的模型和推理环境一起打包成镜像，部署到任何服务器上直接运行。不需要在目标服务器上装Python、PyTorch、Transformers，拉取镜像即可启动。
- **CI/CD（持续集成/持续部署）**：自动化训练和测试流程中，用Docker保证每次运行的环境完全一致，避免环境漂移导致的测试结果不可靠。

### 3.4.2 Dockerfile编写

Dockerfile是构建Docker镜像的"配方"。写好Dockerfile是使用Docker的核心技能。一个LLM开发环境的Dockerfile示例：

```dockerfile
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# 安装Python和基础工具
RUN apt-get update && apt-get install -y \
    python3.11 python3-pip git wget vim \
    && rm -rf /var/lib/apt/lists/*

# 配置pip镜像源
RUN pip config set global.index-url \
    https://pypi.tuna.tsinghua.edu.cn/simple

# 安装LLM开发依赖
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 设置工作目录
WORKDIR /workspace
CMD ["bash"]
```

这个Dockerfile的每一行都有讲究。`FROM`指定基础镜像，这里用的是NVIDIA官方提供的CUDA 12.1加cuDNN 8的Ubuntu 22.04镜像，省去了自己装CUDA的麻烦。`RUN`指令执行shell命令，安装Python和基础工具。`apt-get update`更新包列表，`apt-get install -y`安装需要的软件包，`rm -rf /var/lib/apt/lists/*`清理apt缓存减小镜像体积。`COPY`把本地文件复制到镜像里。`WORKDIR`设置默认工作目录。`CMD`指定容器启动时默认执行的命令。

Dockerfile的构建是分层的，每条指令都会创建一个新层。合理安排指令顺序可以利用层缓存加速构建。把不常变化的指令（如安装系统包）放在前面，常变化的指令（如COPY代码）放在后面，这样修改代码时只需要重新构建后面的层，前面的层直接用缓存，大幅加快构建速度。

对应的 `requirements.txt`：

```text
torch==2.2.0
transformers==4.38.0
accelerate==0.27.0
datasets==2.17.0
peft==0.8.0
bitsandbytes==0.42.0
```

构建镜像：

```bash
# 构建镜像，命名为llm-dev，标签v1.0
docker build -t llm-dev:v1.0 .

# 查看本地镜像
docker images
```

`-t`参数指定镜像名称和标签，后面的 `.`表示Dockerfile在当前目录。构建过程会下载基础镜像并执行Dockerfile中的每条指令，第一次构建可能需要十到二十分钟，之后因为有缓存会快很多。

> 怕浪猫提示：NVIDIA官方提供了大量预构建的CUDA镜像，地址在Docker Hub上。直接用这些镜像作为基础镜像，省去了自己安装CUDA和cuDNN的麻烦。选择时注意标签格式：`cuda版本-cudnn版本-基础系统`。runtime版本比devel版本小很多，除非需要编译CUDA代码，否则用runtime就够了。

### 3.4.3 GPU支持：nvidia-container-toolkit

Docker默认是看不到宿主机的GPU的。要让容器内能用GPU，需要安装NVIDIA Container Toolkit。这个工具的作用是把宿主机的GPU设备正确地映射到Docker容器中。

**Ubuntu安装方法：**

```bash
# 添加NVIDIA源
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia.list

# 安装
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# 配置Docker运行时
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

安装完成后，启动容器时加上 `--gpus all` 参数，容器内就能使用GPU：

```bash
# 启动带GPU的容器
docker run --gpus all -it --rm \
    -v $(pwd)/workspace:/workspace \
    llm-dev:v1.0

# 进入容器后验证GPU
nvidia-smi
python3 -c "import torch; print(torch.cuda.is_available())"
```

`--gpus all`表示使用宿主机上所有GPU。也可以指定GPU编号：

```bash
# 只使用第0和第1张GPU
docker run --gpus '"device=0,1"' -it llm-dev:v1.0
```

如果安装nvidia-container-toolkit后容器内仍然看不到GPU，常见原因有三个：一是宿主机NVIDIA驱动没装好（用nvidia-smi验证）；二是Docker没有重启（执行 `sudo systemctl restart docker`）；三是nvidia-container-toolkit配置没有生效（检查 `/etc/docker/daemon.json` 是否包含nvidia运行时配置）。这三个问题覆盖了百分之九十以上的GPU Docker故障案例。

### 3.4.4 镜像管理与容器持久化

Docker使用久了，镜像和容器会占用大量磁盘空间。一个CUDA镜像动辄五六个G，几个项目下来磁盘就满了。掌握镜像管理命令很重要：

```bash
# 容器管理
docker ps -a          # 查看所有容器（包括停止的）
docker stop <容器ID>   # 停止容器
docker start <容器ID>  # 启动已停止的容器
docker rm <容器ID>     # 删除容器

# 镜像管理
docker images         # 列出本地镜像
docker rmi <镜像ID>   # 删除镜像
docker system prune   # 清理无用镜像和容器（慎用）
```

一个常见的使用模式是：把工作目录通过 `-v` 挂载到容器内，代码和数据放在宿主机上，容器只负责提供运行环境：

```bash
docker run --gpus all -it \
    -v /home/user/projects:/workspace \
    -v /home/user/data:/data \
    -p 8888:8888 \
    --name llm-env \
    llm-dev:v1.0
```

`-v`参数做目录映射，宿主机的 `/home/user/projects` 映射到容器内的 `/workspace`。`-p`做端口映射，容器内的8888端口映射到宿主机的8888端口。`--name`给容器起个名字，方便后续管理。

这样即使容器被删除，你的代码和数据都在宿主机上，不会丢失。如果你在容器内装了新的包或做了配置修改，想保存下来，可以用 `docker commit` 把容器保存为新的镜像：

```bash
# 将容器的当前状态保存为新镜像
docker commit llm-env llm-dev:v1.1
```

> 怕浪猫的Docker使用哲学：容器是临时的，数据是永久的。永远不要在容器内存储重要数据，用Volume挂载到宿主机才是正道。

**Docker环境搭建清单：**

| 步骤 | 命令/操作 | 验证方法 |
|------|----------|---------|
| 安装Docker | apt install docker.io | docker --version |
| 安装nvidia-container-toolkit | apt install nvidia-container-toolkit | nvidia-ctk --version |
| 配置Docker GPU运行时 | nvidia-ctk runtime configure | docker info检查Runtimes |
| 构建LLM镜像 | docker build -t llm-dev . | docker images查看 |
| 启动GPU容器 | docker run --gpus all -it llm-dev | 容器内执行nvidia-smi |

## 3.5 云端免费GPU资源

不是每个人都有条件购买GPU，特别是学习阶段。好在有不少云端平台提供免费的GPU资源，足够用来学习和做小规模实验。怕浪猫把三个最实用的平台给你讲清楚。

### 3.5.1 阿里云DSW/PAI

阿里云PAI（Platform for Artificial Intelligence，人工智能平台）是阿里云的机器学习平台，其中DSW（Data Science Workshop，数据科学工作坊）提供交互式Notebook环境，内置GPU资源。

**使用方法：**

1. 登录阿里云控制台，搜索"PAI"进入PAI Studio
2. 创建DSW实例，选择GPU规格（有免费额度）
3. 打开Notebook，选择自带的PyTorch环境
4. 开始编码

DSW的优势是预装了大量数据科学工具，包括PyTorch、TensorFlow、Scikit-learn等，开箱即用。而且它在国内网络环境下访问速度快，不需要科学上网。DSW还内置了多种预置镜像，包括不同的Python版本和深度学习框架版本，你可以根据项目需求选择合适的镜像。缺点是免费额度有限，且实例会在一段时间不活跃后自动释放，需要提前保存好数据。如果你的实验还没跑完实例就被释放了，之前的训练进度就全丢了。

官方文档：https://help.aliyun.com/product/30347.html

> 怕浪猫提醒：云平台的实例是按小时计费的，免费额度也是按小时扣减。用完一定记得停止实例，不然额度会悄悄用完。特别是周末如果忘记关实例，周一回来可能额度已经清零了。

### 3.5.2 Kaggle Notebooks

Kaggle是数据科学社区中最良心的免费GPU提供方。被Google收购后，Kaggle为每个用户每周提供30小时的免费GPU时间，而且是双卡T4配置，这比大多数免费平台都大方。

**使用步骤：**

1. 注册Kaggle账号：https://www.kaggle.com
2. 点击"Create" -> "New Notebook"
3. 在右侧面板的"Settings"中，Accelerator选择"GPU T4 x2"
4. 点击"Save Version"运行Notebook

Kaggle Notebooks的几个限制需要注意：

- **会话时间限制**：最长12小时，超时自动断开。如果你的训练需要超过12小时，需要把checkpoint保存到Kaggle Dataset中，下次从checkpoint继续训练。
- **网络限制**：不能随意访问外部网站，但可以通过pip安装包。如果需要下载外部数据，需要先上传为Kaggle Dataset。
- **数据限制**：需要先上传为Dataset才能在Notebook中使用，不能直接从外部URL读取大文件。
- **隐私限制**：免费版Notebook是公开的，别人可以看到你的代码。私有Notebook有数量限制。

```python
# 在Kaggle Notebook中验证GPU
import torch
print(f"GPU数量: {torch.cuda.device_count()}")
print(f"GPU型号: {torch.cuda.get_device_name(0)}")
# 通常输出: NVIDIA Tesla T4
```

Kaggle还有一个隐藏优势：它有大量公开的数据集和Notebook，你可以直接fork别人的代码来学习。对于LLM入门来说，这是一个宝库。很多最新的模型和技巧，Kaggle社区里都有人分享。比如你想学习如何用LoRA微调Llama模型，在Kaggle上搜索"LoRA Llama"就能找到大量高质量的公开Notebook，直接复制运行就能上手。

Kaggle还提供了GPU T4 x2的配置，也就是两张T4显卡。双卡可以用来做分布式训练或者数据并行，虽然T4的性能不如A100，但对于学习和中小规模实验来说足够了。需要注意的是，Kaggle的T4是不支持FP16（Float Point 16-bit，半精度浮点数）的完整训练的，它主要支持FP32（Float Point 32-bit，单精度浮点数）和INT8（Integer 8-bit，8位整数）计算。

### 3.5.3 Google Colab

Google Colab是另一个广受欢迎的免费GPU平台。它直接在浏览器中运行Jupyter Notebook，不需要任何配置，打开网页就能用。

**Colab的GPU类型：**

| 类型 | 显存 | 免费可用 | 说明 |
|------|------|---------|------|
| T4 GPU | 16GB | 是 | 默认免费GPU |
| V100 GPU | 16GB | Colab Pro | 付费用户优先 |
| A100 GPU | 40GB | Colab Pro+ | 高级付费用户 |
| TPU v2 | 8GB | 是 | 张量处理器 |

使用方法：访问 https://colab.research.google.com ，新建Notebook，在"运行时" -> "更改运行时类型"中选择GPU。

Colab的关键限制：

- 免费版最长运行时间约12小时，且空闲一段时间会断开连接。如果你在做长时间的训练，一定要把checkpoint保存到Google Drive中，这样断线后可以从上次的checkpoint继续训练。
- GPU分配不保证，高峰期可能分配不到GPU或者被分配较慢的GPU。Colab免费用户使用的是Google云的抢占式实例，可能随时被回收。
- 本地文件不持久，断开后所有未保存的数据都会丢失，需要挂载Google Drive来持久化数据。这是最重要的一个限制，不挂载Drive就直接开始训练，断线后什么都没有了。

```python
# 挂载Google Drive（持久化存储）
from google.colab import drive
drive.mount('/content/drive')

# 安装LLM依赖
!pip install transformers accelerate

# 验证GPU
import torch
print(f"GPU: {torch.cuda.get_device_name(0)}")
```

对于TPU（Tensor Processing Unit，张量处理单元），它是Google专门为机器学习设计的专用芯片（ASIC，Application-Specific Integrated Circuit），在特定矩阵运算上性能甚至超过GPU。但TPU的编程模型和GPU不同，需要使用XLA（Accelerated Linear Algebra，加速线性代数）编译器优化，对初学者不太友好。建议先掌握GPU开发，再考虑TPU。

**三大免费GPU平台对比：**

| 平台 | GPU型号 | 免费时长 | 显存 | 优势 | 劣势 |
|------|---------|---------|------|------|------|
| Kaggle | T4 x2 | 30h/周 | 16GB | 时长充足，社区资源丰富 | 网络限制，数据需上传 |
| Colab | T4 | 约12h/天 | 16GB | 即开即用，支持TPU | 不稳定，空闲断连 |
| 阿里云DSW | 多种 | 有限额度 | 视规格 | 国内访问快，生态完善 | 免费额度少 |

> 对于初学者来说，选择哪个平台主要看你的网络环境和使用习惯。国内用户优先考虑阿里云DSW，因为访问速度快，不需要翻墙。如果你能稳定访问Google服务，Colab和Kaggle都是很好的选择，它们提供的GPU资源和社区生态都比国内平台丰富。

怕浪猫的使用策略：日常学习用Colab（方便快速），跑长时间实验用Kaggle（T4 x2双卡更稳），国内网络不好时用阿里云DSW（延迟低）。三个平台交替使用，基本够覆盖学习阶段的所有需求。记住一个原则：不要把所有计算资源都依赖一个平台，多平台备选才是稳妥的策略。

## 总结与环境验证清单

搭建完环境后，用下面这个清单逐一验证，确保每个环节都正常工作。这一步非常重要，环境问题是最容易浪费时间的坑，与其在写代码时遇到莫名其妙的报错，不如花十分钟提前验证好。

**环境验证清单：**

```bash
# 1. Python环境验证
python --version          # 期望: Python 3.11.x
conda --version           # 期望: conda 24.x
conda env list            # 确认llm_dev环境存在

# 2. GPU驱动验证
nvidia-smi                # 期望: 显示GPU信息和驱动版本
nvcc --version            # 期望: 显示CUDA Toolkit版本

# 3. PyTorch验证
python -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA可用: {torch.cuda.is_available()}')
print(f'GPU: {torch.cuda.get_device_name(0)}')
print(f'cuDNN: {torch.backends.cudnn.version()}')
"

# 4. Transformers验证
python -c "
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained('bert-base-chinese')
print(f'Tokenizer加载成功: {type(tok).__name__}')
"

# 5. Docker验证
docker run --gpus all --rm nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

如果以上五步全部通过，恭喜你，你的LLM开发环境已经就绪。如果某一步报错，不要急着往下走，先把这一步的问题解决掉。环境问题不会自己消失，只会越拖越严重。每一个报错信息都是有用的线索，复制报错信息去搜索引擎里搜，百分之九十九的问题都有人遇到过并给出了解决方案。

> "环境搭建是LLM开发的第一道门槛，跨过去了，后面就是广阔天地。很多人放弃不是因为学不会，而是环境搭不好，还没写一行代码就被劝退了。" — 怕浪猫

**本章配套工具一览：**

| 工具 | 用途 | 必要性 |
|------|------|--------|
| MiniConda | Python环境管理 | 必装 |
| VSCode | 代码编辑与调试 | 必装 |
| VSCode Remote SSH | 远程开发 | 强烈推荐 |
| NVIDIA Driver + CUDA | GPU计算支持 | 视情况 |
| Docker | 环境容器化 | 团队协作必装 |
| Kaggle/Colab | 免费云端GPU | 学习阶段推荐 |

怕浪猫这一章带你从零搭好了完整的LLM开发环境，从Python环境管理到GPU驱动，从Docker容器化到云端免费算力，该装的都装了，该配的都配了。这些工具和配置是后续所有章节的基础，环境搭好了，后面写代码就是水到渠成的事。下一章我们就要在这个环境上跑第一个真正的LLM项目了。

如果你觉得这篇内容对你有帮助，点个收藏，搭环境的时候对着来，不迷路。有什么问题欢迎评论区交流，怕浪猫会挨个回复。也欢迎关注我追更后续章节，这个系列会持续更新到第19章，覆盖LLM开发的全链路内容。

**下章预告：** 第4章「牛刀小试 — 使用HuggingFace训练GPT-2」，我们将用HuggingFace的Trainer API从零训练一个GPT-2模型，让你亲手感受模型从随机噪声到生成连贯文本的全过程。环境搭好的同学，准备好迎接第一个实战项目吧。

系列进度 3/19

怕浪猫说：工欲善其事，必先利其器。环境搭建这件事，看似枯燥，实则是LLM开发的基本功。今天花两小时把环境搭好，明天就能省下二十小时的debug时间。别急着写代码，先把工具磨利。这一章的内容值得反复回看，每次换新机器的时候都会用到。我们下章见。
