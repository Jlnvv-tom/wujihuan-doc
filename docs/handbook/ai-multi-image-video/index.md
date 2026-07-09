# AI多模态生成 - 图片与视频创作

> 系列：AI造物手册 | 作者：怕浪猫
> 从开源模型选型到工程落地，一站式掌握AI图片与视频生成的全链路技能。

## 系列目录

1. [第1章 开源AI图片生成生态全景](./chapter_1.md) - 从SD到FLUX的演进、模型横评、工具选择
2. [第2章 提示词工程与生成控制](./chapter_2.md) - 结构化提示词、采样器、CFG、种子控制
3. [第3章 图生图、局部重绘与ControlNet](./chapter_3.md) - 去噪强度、Inpainting、ControlNet实战
4. [第4章 开源AI视频生成模型巡礼](./chapter_4.md) - SVD、CogVideoX、Mochi 1、LTX-Video对比
5. [第5章 ComfyUI视频生成工作流实战](./chapter_5.md) - AnimateDiff、SVD工作流、Deforum、后处理
6. [第6章 LoRA微调与个性化模型训练](./chapter_6.md) - 数据集准备、Kohya_ss训练、过拟合调优
7. [第7章 AI创作工程化与自动化流水线](./chapter_7.md) - API化、批量生成、图文视频联动管线
8. [第8章 全链路回顾与AI生成未来展望](./chapter_8.md) - 知识地图、避坑指南、趋势观察、资源汇总

## 适合读者

- 想用AI提升效率的设计师
- 想集成生成能力的开发者
- 对AI图片/视频生成感兴趣的创作者
- 希望搭建AI内容生产管线的技术团队

## 前置条件

- 基本的Python编程能力
- 一块NVIDIA显卡（建议8GB+显存）
- 对AI生成的基本概念有了解

## 技术栈

- 模型：Stable Diffusion XL, FLUX.1, Stable Video Diffusion, CogVideoX, Mochi 1, LTX-Video
- 工具：ComfyUI, WebUI, Kohya_ss, Diffusers
- 后处理：Real-ESRGAN, RIFE, FFmpeg
- 开发：Python, WebSocket API, 自动化脚本
