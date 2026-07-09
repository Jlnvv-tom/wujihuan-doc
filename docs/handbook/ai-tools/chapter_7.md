# 第7章 部署与上手——从零搭建你的AI工具箱

买了台电脑不知道怎么跑AI？这章带你7步部署完整AI工具箱。

我是怕浪猫，AI提效工具系列第7章。前面讲了"用什么"，这章讲"怎么装"。

## 7.1 硬件选型：不同工具的显存与CPU需求

**按需求选硬件**

| 使用场景 | 推荐配置 | 预算 |
|---------|---------|------|
| 轻度使用（对话+翻译） | 16GB内存，无需独显 | 3000-5000元 |
| 中度使用（+图片生成） | 32GB内存，RTX 4060 8GB | 6000-8000元 |
| 重度使用（+视频生成） | 64GB内存，RTX 4090 24GB | 15000-20000元 |
| 专业使用（全链路） | 64GB内存，RTX 4090 + 64GB swap | 20000+元 |
| 团队使用 | 服务器级，A100/H100 | 50000+元 |

**各工具显存需求一览**

| 工具 | 最低显存 | 推荐显存 | 备注 |
|------|---------|---------|------|
| Ollama (7B模型) | 6GB | 8GB | 4-bit量化 |
| Ollama (14B模型) | 10GB | 16GB | 4-bit量化 |
| ComfyUI + SDXL | 6GB | 8GB+ | FP16 |
| ComfyUI + FLUX.1 | 12GB | 16GB+ | FP8量化 |
| ComfyUI + SVD | 12GB | 16GB+ | 视频生成 |
| Whisper-WebUI | 2GB | 4GB+ | medium模型 |
| FastGPT | 2GB | 4GB+ | 不含LLM |
| Dify | 2GB | 4GB+ | 不含LLM |
| n8n | 1GB | 2GB+ | 无需GPU |

**Mac用户特别注意**

| 芯片 | 统一内存 | 可跑模型 | 推荐场景 |
|------|---------|---------|---------|
| M2/M3 | 16GB | 7B模型 | 轻度使用 |
| M2/M3 Pro | 32GB | 14B模型/SDXL | 中度使用 |
| M2/M3 Max | 64GB | 32B模型/FLUX | 重度使用 |
| M2/M3 Ultra | 128GB+ | 多模型并行 | 专业使用 |

> Mac的统一内存架构让大模型推理更高效。M2 Max 64GB跑14B模型的体验，比RTX 4060 8GB好得多——因为显存够大。

## 7.2 Docker一键部署：OpenWebUI、Dify、n8n、FastGPT

**Docker基础**

| 命令 | 说明 |
|------|------|
| docker compose up -d | 后台启动 |
| docker compose down | 停止 |
| docker compose logs -f | 查看日志 |
| docker compose restart | 重启 |
| docker ps | 查看运行容器 |

**4个工具一键部署**

**OpenWebUI + Ollama**

```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama:/root/.ollama
    ports:
      - "11434:11434"

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    volumes:
      - open-webui:/app/backend/data
    depends_on:
      - ollama

volumes:
  ollama:
  open-webui:
```

**Dify**

```bash
git clone https://github.com/langgenius/dify
cd dify/docker
docker compose up -d
# 访问 http://localhost/apps
```

**n8n**

```bash
docker run -d --name n8n -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
# 访问 http://localhost:5678
```

**FastGPT**

```bash
git clone https://github.com/labring/FastGPT
cd FastGPT/deploy/docker-compose
docker compose up -d
# 访问 http://localhost:3000
```

**端口规划**

| 工具 | 端口 | 说明 |
|------|------|------|
| Ollama | 11434 | 模型API |
| OpenWebUI | 3000 | 对话界面 |
| ComfyUI | 8188 | 图片/视频工作流 |
| WebUI(A1111) | 7860 | 图片生成 |
| Dify | 80 | AI应用平台 |
| FastGPT | 3000 | 知识库（换端口避免冲突） |
| n8n | 5678 | 工作流自动化 |
| RAGFlow | 80 | 文档解析（换端口） |

> 端口冲突是最常见的部署问题。建议用docker-compose统一管理，给每个工具分配固定端口。

## 7.3 模型下载与管理：Hugging Face与ModelScope

**模型仓库对比**

| 平台 | 地区 | 下载速度 | 模型数量 | 特色 |
|------|------|---------|---------|------|
| Hugging Face | 海外 | 慢（需代理） | 最多 | 全球最大 |
| ModelScope | 国内 | 快 | 多 | 阿里出品 |
| Ollama Library | 全球 | 中 | Ollama格式 | 一键拉取 |
| Civitai | 全球 | 中 | SD模型/LoRA | 社区生态 |

**下载方式**

| 工具 | 下载命令 | 说明 |
|------|---------|------|
| Ollama | ollama pull qwen2.5:7b | 最简单 |
| Hugging Face CLI | huggingface-cli download 模型ID | 需安装CLI |
| ModelScope | modelscope download 模型ID | 国内推荐 |
| Git LFS | git lfs clone 仓库地址 | 大文件支持 |

**常用模型下载清单**

| 用途 | 模型 | 下载命令 | 大小 |
|------|------|---------|------|
| 中文对话 | Qwen2.5-7B | ollama pull qwen2.5:7b | 4.7GB |
| 深度推理 | DeepSeek-R1-7B | ollama pull deepseek-r1:7b | 4.7GB |
| 代码补全 | Qwen2.5-Coder-7B | ollama pull qwen2.5-coder:7b | 4.7GB |
| 图片生成 | FLUX.1-schnell | huggingface-cli download black-forest-labs/FLUX.1-schnell | 23GB |
| 图片生成 | SDXL-1.0 | huggingface-cli download stabilityai/stable-diffusion-xl-base-1.0 | 13GB |
| 语音转文字 | Whisper large-v3 | huggingface-cli download openai/whisper-large-v3 | 3GB |
| 嵌入向量 | nomic-embed-text | ollama pull nomic-embed-text | 274MB |

## 7.4 常见问题排查：显存不足、模型格式、端口冲突

**显存不足解决方案**

| 问题 | 解决方案 | 效果 |
|------|---------|------|
| OOM（内存不足） | 降低量化精度（FP16→FP8→INT4） | 显存减半 |
| 生成速度慢 | 降低模型参数量（14B→7B） | 速度翻倍 |
| 批量处理超限 | 减小batch size | 逐个处理 |
| 视频生成失败 | 降低分辨率/帧数 | 降低需求 |
| ComfyUI节点报错 | 启用Tiled VAE | 分块处理 |

**模型格式转换**

| 格式 | 说明 | 转换工具 |
|------|------|---------|
| safetensors | 主流格式（安全） | 原生支持 |
| GGUF | Ollama/llama.cpp格式 | llama.cpp convert |
| ONNX | 跨框架格式 | optimum-cli |
| CoreML | Apple芯片 | coremltools |

**端口冲突排查**

```bash
# 查看端口占用
lsof -i :3000      # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 解决方案：修改docker-compose.yml中的端口映射
ports:
  - "3001:8080"  # 将外部端口改为3001
```

**网络问题（国内用户）**

| 问题 | 解决方案 |
|------|---------|
| Hugging Face下载慢 | 用ModelScope镜像 |
| Docker拉取慢 | 配置国内镜像源 |
| pip安装慢 | 配置清华/阿里PyPI镜像 |
| npm安装慢 | 配置淘宝npm镜像 |
| Git克隆慢 | 用Gitee镜像或代理 |

## 7.5 安全与权限：内网部署与访问控制

**安全清单**

| 项目 | 措施 | 优先级 |
|------|------|--------|
| 修改默认密码 | 首次登录立即修改 | 高 |
| 关闭注册 | OpenWebUI/Dify关闭公开注册 | 高 |
| HTTPS | 配置反向代理+SSL证书 | 高 |
| 防火墙 | 仅开放必要端口 | 高 |
| 数据备份 | 定期备份Docker卷 | 中 |
| 访问日志 | 开启审计日志 | 中 |
| 模型权限 | 按角色限制可用模型 | 低 |

**反向代理配置（Nginx）**

```nginx
server {
    listen 443 ssl;
    server_name ai.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**内网穿透方案（远程访问）**

| 方案 | 类型 | 适合 |
|------|------|------|
| Tailscale | VPN组网 | 个人/小团队 |
| Cloudflare Tunnel | 反向代理 | 有域名 |
| FRP | 自建穿透 | 技术用户 |
| 花生壳 | 商业穿透 | 非技术用户 |

> 安全不是一次性工作，而是持续习惯。每次部署新工具，先过一遍安全清单。

---

你部署AI工具时踩过最大的坑是什么？评论区分享，帮后来者避坑。

收藏这章，7步部署清单和Docker命令速查建议永久保存。

关注怕浪猫，最后一期做趋势展望和全系列总结。

系列进度 7/8 — 下一篇：趋势展望与全系列总结
