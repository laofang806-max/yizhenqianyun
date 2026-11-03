# SDXL 轻量应用与训练复现

下载入口：[数据集与基座下载地址](../../data/数据集与基座下载地址.md)；包含固定版本、20 项直链和实际训练原图位置。

随包包含 v2 raw、v2 EMA 和 v1 pilot 三个 LoRA，用于复现已有对照结果。
它们是适配器，不是独立基座。完整 SDXL 1.0 基座约 6.94GB，不能压进 200MB 包。
推理在电脑 NVIDIA GPU 上运行；本地 SDXL 命令行与上位机云模型页面为不同入口。
推理生成的 PNG 可以上传上位机生成针迹。没有把 SDXL 部署到 FPGA。

## 环境与基座

在本目录终端运行：
```
conda env create -f environment.yml
conda activate xiangxiu-sdxl
python download_base.py
python shard_unet.py
```
Python 3.11、CUDA 12.8 PyTorch 2.7.1，版本锁文件随包。
已用 RTX 5070 Laptop 8GB 训练/评估；其他显卡需要支持 BF16 和对应 CUDA 驱动。
建议内存 32GB，并额外预留至少 25GB 磁盘用于基座、UNet 分片和运行产物。
分片用于规避已观察到的 Windows 大文件 mmap 问题，参数值不修改。
完整文件清单、固定 revision、字节数和 SHA256 在 base-model-manifest.json。
官方仓库 stabilityai/stable-diffusion-xl-base-1.0，revision 462165984030d82259a11f4367a4eed129e94a7b。
默认下载到 src/ml/models/sdxl-base-1.0；已有目录可设置 SDXL_BASE。
网盘解压的目录也必须运行 `python download_base.py --verify-only --directory 目录`。
授权条款见 SDXL-LICENSE.md；工程图案来自项目素材，未将其标记为有开放授权的数据集。

## 生成图片

在项目根目录运行：
```
python src/ml/infer.py --prompt "A clean black line drawing of a bird and a flower, pure white background" --seed 42
```
默认使用 EMA；`--variant raw`、`pilot`、`base` 用于对照。
`--output` 指定新的输出目录，`--base` 指定本地基座目录。
脚本依次计算双文本编码、GPU 去噪和 CPU 浮点 VAE 解码，输出图片及实测耗时/显存 JSON。
不同提示词请使用新的输出目录，避免复用旧提示词缓存。--steps 25 对应历史对照配置。

## 重新训练

完成基座准备后，在根目录运行 `python src/ml/train_v2.py`。
默认写 data/ml/runs/v2，不覆盖随包权重。重新实验应将 ML_RUN_DIR 指向新的目录。
训练直接使用 src/upper/src/assets 的 bird-original.jpg、solo-bird.png、flower-original.png，
其中花鸟与裁剪鸟只有一组独立构图，增强为 8 张训练图；1 张花只用于固定噪声诊断。
原始图像、数据 SHA 与增强参数见 report/ml/dataset.json，增强后图像见 data/ml/training-images。
MSEmbGAN 样本没有参与本次训练，因此未放入交付包。
训练参数：100 步、512 像素、batch 1、累积 4、lr 5e-5、种子 42；
自注意力 rank4、交叉注意力 rank8、dropout .05、Min-SNR gamma5、EMA .95。
冻结双文本编码器、VAE 和 UNet 主干，只训练 LoRA。详见报告与框架图。
GPU、驱动和算子差异可能造成数值差异，不能承诺跨机器逐字节相同的权重。
历史 loss、推理图和性能数据位于 report/ml；这些是已发生实验，不会被新的训练覆盖。
诊断误差下降不等于泛化精度，当前仍是小样本试验。
