# 工欲善其事,必先利其器 - 开发环境的搭建

如果你还在用系统 Python 跑 LLM 项目,还在为依赖冲突抓狂,还在纠结买哪张显卡--这篇文章为你准备。

我是怕浪猫,在 LLM 开发坑里摸爬滚打过来的工程师。今天把开发环境搭建中踩过的坑、走过的弯路,一次性铺平。从 Conda 到 Docker,从本地 GPU 到云端白嫖,全套方案直接抄作业。

> "环境搭不好,代码跑不了。这不是玄学,这是工程。"

## 3.1 导学与 MiniConda 安装使用

### 3.1.1 Conda vs MiniConda vs Anaconda

刚入行时我也被这三个名字搞晕过。先上对比表格:

| 特性 | Anaconda | MiniConda | Conda |
|------|----------|-----------|-------|
| 定位 | 完整发行版 | 最小安装版 | 包管理工具 |
| 体积 | 约 3GB | 约 80MB | 内置于两者 |
| 预装包 | 1500+ 科学计算包 | 仅 conda + Python | 无独立包 |
| 适用场景 | 教学/新手 | 开发/生产 | 包管理器本身 |
| 商业协议 | 有企业版限制 | BSD 协议开源 | BSD 协议开源 |

简单说:Anaconda 是全家桶,MiniConda 是精简版,Conda 是它们共同的包管理器。做 LLM 开发强烈建议用 MiniConda--体积小、启动快、无商业协议限制。

Anaconda 在 2020 年修改了服务条款,对超过 200 人的企业组织有商业限制。MiniConda 不受此约束,这也是工业界更倾向 MiniConda 的原因。

### 3.1.2 MiniConda 安装

**Linux 安装:**

```bash
# 下载并安装 MiniConda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
source ~/.bashrc
conda --version
```

**macOS 安装(Apple Silicon):**

```bash
brew install --cask miniconda
conda init zsh
source ~/.zshrc
conda info
```

**Windows 安装:**

到 [MiniConda 官方下载页](https://docs.conda.io/en/latest/miniconda.html) 下载 `.exe` 安装包,安装时勾选"Add to PATH"即可。

> "工欲善其事,必先利其器。但工具太多也是负担,够用就好。"

### 3.1.3 环境隔离 - conda create/activate

LLM 开发中不同项目依赖不同版本的 PyTorch、Transformers,环境隔离是刚需。

```bash
# 创建名为 llm-dev 的环境,指定 Python 版本
conda create -n llm-dev python=3.11

# 激活环境
conda activate llm-dev

# 查看所有环境
conda env list

# 退出环境
conda deactivate

# 删除环境(谨慎操作)
conda env remove -n llm-dev
```

Python 版本建议选 3.10 或 3.11,主流 LLM 框架对这两个版本支持最完善。环境命名建议用 `项目名-用途` 格式,比如 `finetune-llama`、`rag-chatbot`,一眼就知道环境用途。

### 3.1.4 包管理与渠道配置

Conda 默认 channels 下载速度感人。配置国内镜像源是第一步:

```bash
# 配置清华镜像源
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/free
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/r
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/pro
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/msys2

# 设置搜索时显示通道优先级
conda config --set show_channel_urls yes

# 验证配置
cat ~/.condarc
```

配置完成后 `conda install` 速度会有质的飞跃。

### 3.1.5 pip 安装依赖与镜像源配置

LLM 生态中很多最新包优先发布在 PyPI(Python Package Index)上,用 pip 安装更靠谱。同样需要配置镜像源:

```bash
# 配置 pip 清华镜像源
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 配置阿里云镜像源(备选)
pip config set global.index-url https://mirrors.aliyun.com/pypi/simple

# 验证配置
pip config list

# 安装包时临时指定镜像源
pip install transformers -i https://pypi.tuna.tsinghua.edu.cn/simple
```

实际项目中用 `requirements.txt` 管理依赖:

```bash
# 导出当前环境的依赖
pip freeze > requirements.txt

# 安装依赖
pip install -r requirements.txt
```

但 `pip freeze` 会导出所有间接依赖,太冗余。更好的做法是用 `pip-tools`,编写只含核心依赖的 `requirements.in`,再通过 `pip-compile` 生成完整的 `requirements.txt`,最后用 `pip-sync` 安装。这样依赖管理更清晰。

> "依赖管理不是小事。一个版本号不对,可能让你 debug 一整天。"

## 3.2 VSCode 配置

### 3.2.1 为什么选 VSCode

PyCharm 重、Jupyter Notebook 不好做版本管理、Vim 学习曲线陡。VSCode 是目前 LLM 开发的最佳平衡点:轻量、插件丰富、远程开发能力强、内置终端和 Jupyter 支持。

### 3.2.2 必装扩展清单

| 扩展名称 | 用途 | 备注 |
|----------|------|------|
| Python | Python 语言支持 | 微软官方,必装 |
| Pylance | 类型检查与智能提示 | 性能优于 Jedi |
| Jupyter | Notebook 支持 | 直接运行 .ipynb |
| GitLens | Git 增强 | 显示代码作者 |
| Docker | 容器管理 | 管理镜像和容器 |
| Remote - SSH | 远程开发 | 连接服务器利器 |

可以在 VSCode 扩展面板搜索安装,或者用命令行批量安装:

```bash
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension ms-toolsai.jupyter
code --install-extension ms-vscode-remote.remote-ssh
```

### 3.2.3 调试配置

VSCode 的 `launch.json` 配置好了,调试效率翻倍。在项目根目录创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: 当前文件",
      "type": "python",
      "request": "launch",
      "program": "${file}",
      "console": "integratedTerminal",
      "justMyCode": true
    },
    {
      "name": "Python: 带参数",
      "type": "python",
      "request": "launch",
      "program": "${file}",
      "args": ["--model", "gpt2", "--epochs", "3"],
      "console": "integratedTerminal"
    }
  ]
}
```

远程调试配置只需增加一个 `request: attach` 的配置项,指定 `host`、`port` 和 `pathMappings` 即可。

实用技巧:F5 启动调试,F9 设置断点,F10 单步跳过,F11 单步进入。调试控制台可直接执行 Python 表达式查看变量。Logpoints(日志断点)适合调试训练循环,不停顿但输出信息。

### 3.2.4 Remote SSH 远程开发

LLM 开发几乎必然要用到远程服务器。VSCode 的 Remote SSH 扩展让你像编辑本地文件一样编辑远程文件,体验非常丝滑。

配置 SSH 配置文件 `~/.ssh/config`:

```
Host gpu-server
  HostName 192.168.1.100
  User root
  IdentityFile ~/.ssh/id_rsa
```

在 VSCode 中按 `Cmd+Shift+P`(macOS)或 `Ctrl+Shift+P`(Windows),输入 `Remote-SSH: Connect to Host`,选择 `gpu-server` 即可连接。连接后左下角显示绿色远程标识,所有文件操作、终端、调试都在远程服务器执行。

> "远程开发不是把文件拷来拷去,而是让编辑器无缝连接。VSCode Remote SSH 做到了这一点。"

踩坑提示:远程服务器网络差时扩展安装超时,可手动在远程用 `code --install-extension` 安装。

## 3.3 硬件与驱动

### 3.3.1 GPU 选型指南

LLM 开发绕不开 GPU。主流显卡对比如下:

| 显卡型号 | 显存 | 架构 | 适用场景 | 参考价格 |
|----------|------|------|----------|----------|
| RTX 3090 | 24GB | Ampere | 入门训练/推理 | 5k-7k 元 |
| RTX 4090 | 24GB | Ada Lovelace | 主力训练/推理 | 12k-16k 元 |
| A100 40GB | 40GB | Ampere | 专业训练 | 60k+ 元 |
| A100 80GB | 80GB | Ampere | 大模型训练 | 100k+ 元 |
| RTX 3060 | 12GB | Ampere | 学习入门 | 2k-3k 元 |

显存大小是选卡的核心指标。大模型训练和推理的瓶颈通常不是算力而是显存。粗略估算:推理显存(FP16)约等于模型参数量 × 2 字节。7B 模型推理需约 14GB,13B 需约 26GB(3090/4090 勉强能跑),训练显存约为推理的 3-4 倍。

如果只跑推理,RTX 3090 24GB 够用。微调 7B 模型建议 RTX 4090 起步,或用 LoRA(Low-Rank Adaptation,低秩适配)降低显存需求。

### 3.3.2 CUDA Toolkit / cuDNN / NVIDIA Driver 三者关系

这是新手最容易混淆的概念。怕浪猫用一个比喻来解释:

- **NVIDIA Driver(显卡驱动)**:底层硬件驱动,让操作系统能识别和使用 GPU。就像汽车的发动机。
- **CUDA Toolkit(Compute Unified Device Architecture Toolkit,计算统一设备架构工具包)**:NVIDIA 提供的并行计算平台和编程模型。就像汽车的变速箱,把发动机的动力转化为可用的驱动力。
- **cuDNN(CUDA Deep Neural Network library,CUDA 深度神经网络库)**:基于 CUDA 的深度学习加速库。就像涡轮增压,专门为深度学习场景优化。

三者的版本依赖关系是:NVIDIA Driver > CUDA Toolkit > cuDNN。高版本驱动可以兼容低版本 CUDA,反过来不行。

版本对应关系:CUDA 11.8 需驱动 520+、cuDNN 8.6;CUDA 12.1 需驱动 530+、cuDNN 8.9;CUDA 12.4 需驱动 550+、cuDNN 9.0。高版本驱动可兼容低版本 CUDA,反之不行。推荐参考 [PyTorch 官网](https://pytorch.org/get-started/locally/) 选择对应版本组合。

### 3.3.3 Linux 驱动安装

**Ubuntu/Debian 系统:**

```bash
# 添加 NVIDIA 官方 PPA
sudo add-apt-repository ppa:graphics-drivers/ppa
sudo apt update

# 安装推荐驱动
sudo ubuntu-drivers autoinstall

# 或者指定版本安装
sudo apt install nvidia-driver-535

# 重启生效
sudo reboot

# 验证
nvidia-smi
```

`nvidia-smi`(NVIDIA System Management Interface)是验证 GPU 状态的核心命令。执行后输出 GPU 名称、显存使用量、温度、功耗等信息。训练时显存爆了,这里会显示占用接近 100%。

### 3.3.4 Windows 驱动安装

Windows 相对简单:到 [NVIDIA 驱动下载页](https://www.nvidia.cn/Download/index.aspx) 选择显卡型号下载安装即可。安装后执行 `nvidia-smi` 验证。如果找不到命令,将 `C:\Program Files\NVIDIA Corporation\NVSMI` 添加到 PATH。

WSL2(Windows Subsystem for Linux 2)中使用 GPU 需 Windows 11 或 Windows 10 21H2+,驱动 470+。WSL2 内无需单独装驱动,宿主机安装即可自动透传。

> "在 Windows 上搞 AI 开发不是不可以,但你会比别人多花 20% 的时间处理环境问题。能上 Linux 就上 Linux。"

### 3.3.5 CUDA Toolkit 安装

安装好驱动后还需安装 CUDA Toolkit。以 CUDA 12.1 为例:

**Linux 安装:**

```bash
# 下载 CUDA 12.1 安装包(Ubuntu 22.04 x86_64)
wget https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda_12.1.0_530.30.02_linux.run

# 执行安装(仅安装 toolkit,不装驱动)
sudo sh cuda_12.1.0_530.30.02_linux.run --toolkit

# 配置环境变量
echo 'export PATH=/usr/local/cuda-12.1/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.1/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# 验证
nvcc --version
```

实际上用 Conda 安装 PyTorch 时,会自动装好对应版本的 CUDA Toolkit,无需手动安装。

```bash
# Conda 安装 PyTorch with CUDA 12.1
conda install pytorch pytorch-cuda=12.1 -c pytorch -c nvidia

# 或者用 pip 安装
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

安装后验证 PyTorch 是否能使用 GPU:

```python
import torch

# 检查 CUDA 是否可用
print(f"CUDA available: {torch.cuda.is_available()}")

# 查看 GPU 数量
print(f"GPU count: {torch.cuda.device_count()}")

# 查看 GPU 名称
print(f"GPU name: {torch.cuda.get_device_name(0)}")

# 查看 CUDA 版本
print(f"CUDA version: {torch.version.cuda}")
```

如果输出 `CUDA available: True`,恭喜你,环境搞定了。

## 3.4 Docker 环境搭建

### 3.4.1 为什么需要 Docker

场景:团队 5 人,本地环境各不相同。你跑通的代码发给同事跑不起来。Docker 把代码、依赖、环境打包成镜像,在任何机器上运行结果一致。

### 3.4.2 Dockerfile 编写

下面是一个 LLM 开发的 Dockerfile 模板:

```dockerfile
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# 设置时区和语言
ENV TZ=Asia/Shanghai
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    python3.11 python3-pip git curl wget vim \
    && rm -rf /var/lib/apt/lists/*

# 配置 pip 镜像源
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 安装 Python 依赖
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 设置工作目录
WORKDIR /workspace

# 默认命令
CMD ["bash"]
```

这个 Dockerfile 基于 NVIDIA 官方的 CUDA 镜像,预装了 cuDNN,省去了手动安装 CUDA 的麻烦。

构建并运行:

```bash
docker build -t llm-dev:latest .
docker run -it --name llm-env llm-dev:latest
```

### 3.4.3 GPU 支持

普通 Docker 容器默认无法使用 GPU。需要安装 NVIDIA Container Toolkit(原名 nvidia-docker2)实现 GPU 透传。

**Ubuntu 安装:**

```bash
# 配置 NVIDIA 仓库
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# 配置并重启 Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

验证 GPU 在容器中可用:

```bash
# 运行带 GPU 支持的容器
docker run --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

如果看到 GPU 信息输出,说明配置成功。

`--gpus all` 表示将所有 GPU 分配给容器。也可以指定 GPU:

```bash
# 只分配第 0 张 GPU
docker run --gpus '"device=0"' llm-dev:latest

# 分配第 0 和第 1 张 GPU
docker run --gpus '"device=0,1"' llm-dev:latest
```

> "Docker 让环境复从'在我电脑上能跑'变成了'在所有电脑上都能跑'。"

### 3.4.4 镜像管理与容器持久化

```bash
# 镜像与容器管理
docker images                    # 列出本地镜像
docker rmi llm-dev:latest        # 删除镜像
docker ps -a                     # 列出所有容器
docker stop llm-env              # 停止容器
docker start llm-env             # 启动容器
docker exec -it llm-env bash     # 进入容器
docker commit llm-env llm-dev:v2 # 提交为新镜像
```

数据持久化用 Volume(数据卷)。容器删除后数据会丢失,需挂载 Volume:

```bash
docker run -it --gpus all \
  -v /home/user/project:/workspace \
  -v /home/user/data:/data \
  llm-dev:latest
```

`-v` 参数格式为 `本地路径:容器路径`,容器内修改会同步到本地。

多容器环境用 `docker-compose` 管理:

```yaml
version: "3.8"
services:
  llm-dev:
    image: llm-dev:latest
    runtime: nvidia
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    volumes:
      - ./project:/workspace
    ports:
      - "8888:8888"
    shm_size: "16gb"
```

```bash
docker-compose up -d   # 启动
docker-compose down     # 停止
```

> "镜像管理不是炫技。镜像小、层级清晰、可复现,才是好的 Dockerfile。"

## 3.5 云端免费 GPU 资源

不是每个人都有条件买显卡。在入门阶段,完全可以先用免费云端资源跑起来。怕浪猫给你盘点三个靠谱的免费选项。

### 3.5.1 Google Colab

Google Colab(Colaboratory)是 Google 提供的免费在线 Jupyter Notebook 环境,配备免费 GPU(Graphics Processing Unit,图形处理器)和 TPU(Tensor Processing Unit,张量处理器)。

| 资源类型 | 规格 | 时长限制 | 费用 |
|----------|------|----------|------|
| CPU | 2核 12GB | 无限制 | 免费 |
| GPU T4 | T4 16GB | 约 12h/次 | 免费 |
| TPU | TPU v2 | 约 12h/次 | 免费 |
| Pro | A100 40GB | 更长时长 | $9.99/月 |

访问 [Google Colab](https://colab.research.google.com/) 新建 Notebook,在菜单选择 `代码执行程序 > 更改类型` 即可切换 GPU。

```python
import torch
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
```

Colab 的坑:免费版空闲约 90 分钟断连,单次最长 12 小时,需科学上网。

### 3.5.2 Kaggle Notebooks

Kaggle 提供免费的 Notebook 环境,GPU 资源比 Colab 更慷慨。

| 资源类型 | 规格 | 每周配额 | 费用 |
|----------|------|----------|------|
| CPU | 4核 30GB | 无限制 | 免费 |
| GPU T4 x2 | 双 T4 32GB | 30h/周 | 免费 |
| TPU v3-8 | 8 核 | 20h/周 | 免费 |

访问 [Kaggle](https://www.kaggle.com/),注册后 `Code > New Notebook`,在设置中将 `Accelerator` 切换为 `GPU T4 x2`。

Kaggle 优势:双 T4 共 32GB 显存,每周 30 小时配额,自带持久存储,可挂载数据集。限制是单次最长 12 小时,配额每周重置。

```python
import torch
print(f"GPU count: {torch.cuda.device_count()}")
for i in range(torch.cuda.device_count()):
    print(f"GPU {i}: {torch.cuda.get_device_name(i)}")
```

> "白嫖不可耻,可耻的是白嫖了还不好好学。免费资源是入门最好的跳板。"

### 3.5.3 阿里云 DSW / PAI

阿里云 PAI(Platform for Artificial Intelligence,人工智能平台)提供 DSW(Deep Learning Studio Workspace,深度学习工作空间)交互式开发环境。

| 项目 | 说明 |
|------|------|
| GPU | 部分区域免费 T4 |
| 时长 | 每月有免费额度 |
| 预装 | PyTorch、TensorFlow、HuggingFace |
| 网络 | 国内直连,无需科学上网 |

登录 [阿里云 PAI 控制台](https://pai.aliyun.com/),选择 `PAI-DSW > 创建实例`,选 GPU 规格和镜像,启动后浏览器访问 JupyterLab。最大优势是网络稳定、国内直连。

### 3.5.4 三者对比

| 维度 | Colab | Kaggle | 阿里云 DSW |
|------|-------|--------|------------|
| GPU | T4 16GB | T4 x2 32GB | T4 16GB |
| 每周时长 | 12h/次 | 30h/周 | 按额度 |
| 国内访问 | 需科学上网 | 需科学上网 | 直连 |
| 适合场景 | 快速原型 | 中等训练 | 国内开发 |

建议：学习阶段以 Kaggle 为主，Colab 辅助验证，国内开发用阿里云 DSW 或自建服务器。

### 3.5.5 云端环境配置技巧

无论用哪个平台,拿到环境后第一件事是验证:

```python
# 检查环境基础信息(适用于所有平台)
import sys, torch, platform

print(f"Python: {sys.version}")
print(f"PyTorch: {torch.__version__}")
print(f"CUDA: {torch.version.cuda}")
print(f"OS: {platform.platform()}")
print(f"GPU available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
```

安装 HuggingFace 相关库:

```bash
# 安装 Transformers 和相关库
pip install transformers datasets accelerate peft trl

# 安装后验证
python -c "import transformers; print(transformers.__version__)"
```

> "环境验证不是多此一举。每次拿到新环境,先跑一遍检查脚本,能省掉后面无数的坑。"

### 3.6 实战:从零搭建完整 LLM 开发环境

光说不练假把式。怕浪猫带你走一遍流程,从零搭建可跑推理和微调环境。

### 步骤一:安装 MiniConda 并创建环境

```bash
# 安装 MiniConda(假设已完成)
# 创建专用环境
conda create -n llm-starter python=3.11 -y
conda activate llm-starter

# 安装基础工具
conda install -y jupyter ipython
```

### 步骤二:安装 PyTorch

```bash
# 根据你的 CUDA 版本选择(以 CUDA 12.1 为例)
pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cu121
```

### 步骤三:安装 HuggingFace 生态

```bash
# 安装核心库
pip install transformers datasets accelerate
pip install peft trl bitsandbytes  # 微调相关

# 安装辅助工具
pip install tensorboard wandb scikit-learn matplotlib
```

### 步骤四:验证环境

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

assert torch.cuda.is_available(), "GPU 不可用"
print(f"GPU: {torch.cuda.get_device_name(0)}")

tokenizer = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained(
    "gpt2", torch_dtype=torch.float16, device_map="auto"
)

inputs = tokenizer("Hello, I am", return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=20)
print(tokenizer.decode(outputs[0]))
```

如果代码正常运行并输出文本,环境搭建完成。

### 环境配置清单

| 序号 | 项目 | 验证命令 | 预期结果 |
|------|------|----------|----------|
| 1 | MiniConda | `conda --version` | 版本号 |
| 2 | Python | `python --version` | 3.10+ |
| 3 | pip 镜像 | `pip config list` | 清华/阿里源 |
| 4 | PyTorch | `python -c "import torch"` | 无报错 |
| 5 | CUDA | `torch.cuda.is_available()` | True |
| 6 | GPU | `nvidia-smi` | GPU 信息 |
| 7 | Transformers | `python -c "import transformers"` | 无报错 |
| 8 | Docker | `docker --version` | 版本号 |
| 9 | Docker GPU | `docker run --gpus all ... nvidia-smi` | 容器内显示 GPU |
| 10 | VSCode Remote | 连接远程服务器 | 绿色标识 |

> "清单思维是工程师的基本素养。搭环境这种事,漏一步可能就要重来。"

## 写在最后

这篇文章覆盖了 LLM 开发环境搭建的完整链路:MiniConda 环境管理、VSCode 配置与远程开发、GPU 硬件选型与驱动安装、Docker 容器化、三大免费云端 GPU 平台。每个环节都有踩坑经验和实操代码。

环境搭建是 LLM 开发的第一步,也是最容易被忽视的一步。好的环境配置能让你在后续开发中少走 80% 的弯路。磨刀不误砍柴工,把环境搞扎实了,后面写代码才能飞起来。

**收藏引导**:内容密集,建议先收藏。搭环境时对照着走,环境配置清单直接当 checklist 用。

**互动引导**:你在用哪张显卡?还是白嫖云端资源?评论区聊聊。

**追更引导**:环境搭好了,下一章怕浪猫带你用 HuggingFace 跑通 GPT-2 模型训练,从数据加载到文本生成,全流程实操。点个关注,别掉队。

**系列进度 4/19**

怕浪猫说:工具是死的,人是活的。环境搭得再好,不动手写代码也是白搭。下一章,咱们代码见。
