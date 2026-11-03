# 一针千韵

文字/照片 → 图案 → 按颜色分层的针迹 → 串口传输 → FPGA 双轴运动与自动下针。
项目由电脑上位机和 Artix-7 FPGA 组成；电脑不是芯片内的 PS。本工程不依赖 PYNQ。

## 作品简介

《一针千韵——智能非遗刺绣》是一套融合传统非遗刺绣工艺与现代 FPGA 技术的智能刺绣系统。
作品围绕传统刺绣数字化、智能化制作需求，构建从纹样选择、图案处理、路径规划、运动控制到成品刺绣的全链条闭环，
实现传统刺绣从数字图案到实体作品的自动化转化。

系统以 FPGA 为核心控制单元，将传统刺绣纹样进行数字化处理并生成可执行的刺绣轨迹。
上位机完成图案处理与路径规划，FPGA 实现多轴协同控制及绣针时序控制，
协调 X、Y 轴运动机构与绣针机构配合，使设备按照预设纹样完成刺绣。
同时支持刺绣参数调节、运行状态监测及成品展示，
实现“选纹样—数字处理—路径生成—智能控制—自动刺绣—成品输出”的全流程闭环。

作品将传统非遗文化与 FPGA、数字控制及智能制造技术相结合，不仅实现刺绣工艺的自动化执行，
也形成从文化内容到数字控制、再到实体作品的全链条闭环应用体系，
为传统刺绣技艺的数字化传承与创新应用提供新的实践方式。

本简介依据作者提供的文字整理，按当前代码明确分工：路径规划在电脑上位机完成，
FPGA 接收并执行针迹；本地 SDXL 也在电脑 GPU 上运行。具体功能的已验证范围见文末验证说明，
系统设计目标与当前版本是否完成实机验证分别记录。

## 大模型辅助开发记录

本作品开发过程中，OpenAI Codex 辅助进行了上位机与针迹流程修订、红外针控 RTL 和测试、
SDXL LoRA 实验、真实 Vivado 构建及交付整理。
作者负责需求与硬件条件确认、接线和机构调试，软件/仿真验证与实机结果分别记录。

- [大模型辅助开发与协作记录](report/大模型辅助开发与协作记录.md)：参与工作、迭代案例、分工和验证结果。
- [协作证据索引](report/ai-collaboration-evidence.json)：源码、测试日志、训练结果及固件的 SHA256。

## 目录

|目录|内容|
|---|---|
|src/upper|React 上位机、图像路径规划、固定图案、模型 API、登录服务|
|src/rtl|最终自动下针 RTL，顶层 board_top|
|src/host|真实相机桥接和本地图像匹配|
|src/ml|SDXL LoRA 权重、推理、重新训练脚本和环境|
|sim|真实 RTL 测试、执行脚本、参考仿真日志|
|build|Vivado 构建脚本、源码校验、验证结果与资源报告|
|board|实际引脚约束、接线和启动说明|
|data|训练图像与测试输入说明；运行结果另存其下|
|skill|八项可复用技能、说明、校验脚本和案例|
|report|设计说明、模型真实结果、性能图和协作整理记录|

## 可直接使用的 Vivado 工程与 bit

- 工程：[build/project/yizhen_qianyun.xpr](build/project/yizhen_qianyun.xpr)。Vivado 扩展名为 .xpr；整个目录一起搬运。
- 固件：[board/firmware/yizhen_qianyun_auto_needle.bit](board/firmware/yizhen_qianyun_auto_needle.bit)，3,825,989 字节。
- 对应器件：xc7a100tfgg484-2；顶层 board_top；自动下针＋红外回针反馈启用。
- 本次生成和检查：Vivado 2026.1，2026-11-03；RELEASE_PASS，setup 0.903ns、hold 0.084ns；四项 XSim PASS。
- 工程已在另一目录实际打开核对，全部 13 个综合源均在搬迁后的目录内，没有引用原工程旧文件。
- [固件来源及哈希](board/firmware/release-manifest.json) · [真实报告和日志](build/release/README.md)。
- bit SHA256：`d886a66a27e780f803ebfb0b069f40cf0d632c58fdf63abb828932393a23c1b5`。

直接打开 .xpr 可以查看源码、引脚与重新构建；在 Hardware Manager 中对实际 XC7A100T 选择随包 bit 下载。
首次下载前按本文接线说明检查针位和机构，下载后重新核对逻辑原点。
本次**未下载或启动硬件**，仿真/实现通过不代表实际缝纫机已经联调成功。
DRC 无错误但仍有警告，外部相机/针机构时序及机械精度须按实物验证，详细范围见 build/release/README.md。

## 阅读导航

- [从零复现步骤](#reproduction)：环境、登录、图像生成、构建、串口相机及实机运行。
- [硬件清单与完整接线](#hardware)：全部硬件规格、电源、拨码、针控和接口连接。
- [数据集与基座下载](#downloads)：实际训练数据、基座固定版本及 20 项直链。
- [完整引脚 CSV](board/完整引脚表.csv) · [硬件资料原件](board/references/README.md)

```text
yizhen-qianyun/
├── README.md   # 项目介绍、复现步骤、完整接线与下载地址
├── src/        # 上位机、RTL、相机桥接、ML
├── sim/        # 仿真脚本与参考结果
├── build/      # 构建、验证及文件校验
├── board/      # 引脚约束、启动脚本、硬件资料
├── data/       # 测试/训练数据与参考
├── skill/      # 可复用技能
└── report/     # 设计与真实实验结果
```

<a id="reproduction"></a>

## 从零复现步骤

本说明对应该目录当前源码，最终顶层为启用红外反馈自动下针的 board_top。
先阅读 [硬件清单与完整接线](#hardware) 和
[数据集、基座及下载地址](#downloads)。

### 1. 准备电脑与软件

1. 将整个 yizhen-qianyun 复制到英文短路径，如 C:/work/yizhen-qianyun，保留所有子目录。
   本提交目录的上级含中文；存放没有问题，Vivado/XSim 运行建议在上述英文路径。
2. 安装 Node.js 22、Python 3.11 / Anaconda、支持 Web Serial 的桌面 Chrome/Edge。
3. 要生成 FPGA bit，安装支持 xc7a100tfgg484-2 的 Vivado 2026.1，并确认能正常取得许可。
   仅查看上位机和模型图片不必启动 Vivado。Quartus 不能为该 AMD 器件生成真实固件。
4. 相机安装 [FTDI D2XX 驱动](https://ftdichip.com/drivers/d2xx-drivers/)，
   [官方 Windows 10/11 安装指南](https://ftdichip.com/wp-content/uploads/2022/05/AN_396-FTDI-Drivers-Installation-Guide-for-Windows-10_11.pdf)。
   64 位 Python 对应 64 位 D2XX DLL。UART 驱动根据板载 USB-UART 芯片安装，JTAG 驱动随 Vivado 安装。
5. 本地 SDXL 使用本包锁定的 Python/CUDA 环境，详见第 7 步；不需要本地模型时可先跳过。

在项目根目录运行 `python build/verify.py`，应显示 PASS。SHA 清单校验的是当前交付文件，
不等于软件与机械功能测试通过。

### 2. 建立图像匹配环境

```powershell
conda create -n yizhen-host python=3.11 -y
conda activate yizhen-host
python -m pip install -r src/host/requirements.txt
```

该环境提供普通照片参考匹配所需 numpy/Pillow/scipy/scikit-image。
相机桥接本身主要使用 Python 标准库、ctypes 和已安装的 D2XX 库。
之后在启动上位机的同一终端中保持此环境，或设置 ARTWORK_PYTHON 为该环境 python.exe。

### 3. 安装、验证和打开上位机

```powershell
cd src/upper
npm ci
npm test
npm run build
cd ../..
powershell -ExecutionPolicy Bypass -File board/start-upper.ps1
```

首次启动在终端显示新生成的 admin 密码，请保存；没有随包提供他人的固定密码。
打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/) 登录。
启动窗口需保持运行。端口已被另一份上位机占用时先确认正在运行的版本，避免误连旧实例。
上传一张白底图，选择路径方式并生成；查看路径、首针、针数，再到数据页查看 JSON/UART。
颜色较近时可合并，白色不生成路径，逐色层上传。此步不必连接串口或电机。

云端文生图：将 src/upper/.env.example 复制为 .env.local，填写本人已开通的 API Key/模型，
再重启上位机；同名聊天模型未必支持直接生图。云服务权限/计费由相应平台账号决定。

### 4. 核对并连接硬件

按 [完整接线文档](#hardware) 连接两轴驱动、电机、编码器、ITR9606 和针控接口。
核对 0.9° / 32 细分 / 8mm 导程与两端 1600 STEP/mm，AB 四倍频反馈 500 count/mm。
先检查输入电平：针最高点透光为低，遮挡为高；编码器 AB 高电平不超过 3.3V。
确认控制接口能接受 3.3V 短脉冲，动力电源与 GPIO 分开。此时不自动启动机构。
OV5640 按 P1 表接入，模组需本地 24MHz 时钟。三个 USB 接口分别用于 JTAG、UART、图像。

### 5. 运行 RTL 仿真与生成固件

```powershell
$env:VIVADO_BIN='C:/你的安装目录/Vivado/2026.1/bin'
powershell -ExecutionPolicy Bypass -File sim/run.ps1
& "$env:VIVADO_BIN/vivado.bat" -mode batch -source build/build.tcl
```

四个仿真分别应输出 PASS，日志在 sim/output。
实现完成且检查通过应输出 RELEASE_PASS，文件为 build/output/yizhen_qianyun_auto_needle.bit。
2026-11-03 已在正常本机环境重新完成四项 XSim 和 Vivado 综合/实现；
sim/verified-20261103 是本次真实日志，build/release 是本次实现报告。
不能在许可证错误后拿旧 bit 当作新自动下针版本继续试验。

打开 Vivado Hardware Manager → Open Target → Auto Connect，选择实际 XC7A100T，
Program Device 选本次生成的 auto_needle.bit。下载前确认针离布、机构停止。
临时 JTAG bit 断电可能丢失；本包没有把临时下载当作已经完成 Flash 固化。

### 6. 串口、相机和实际运行

1. 上位机串口页选择本机 USB-UART 的 COM 口，115200、8N1。观察板卡状态及 ENC 计数，
   确认两轴反馈有效，不能把“显示为 0”视为编码器在线证明。
2. 图像用另一个终端（Python 环境可用），执行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File board/start-camera.ps1 -SerialNumber 你的USBSlave序列号
   ```

   USB Slave 序列号可从设备属性或 FTDI D2XX 工具核对；本机记录 FT5X9ZJ5 只作示例。
   也可按实际 D2XX 枚举索引运行 `python src/host/camera_bridge.py --index 0`，多设备时优先用序列号。
3. 在上位机相机页连接 ws://127.0.0.1:8765/camera，先看真实预览，再用 KEY2 拍照并选图。
4. 操作者确定逻辑原点、图案尺寸和首针，先做短行程/少量针的试运行，再上传正式逐色层任务。
   当前没有自动机械回零。KEY0 启动/继续；KEY1 长按约 1.5s 或串口 RESET 清任务。
   RESET 后当前位置成为新逻辑原点，需核对并重传任务。
5. 自动下针参数当前为 20ms 初始脉冲、200ms 补发间隔、最多 3 次，需按实际机构确认。
   必须检测离开上位再回到上位才继续 XY；未回针、无下针或运动中针不在上位会锁定。
   针故障按原要求不发 ERR needle，STATUS? 为 BUSY；排障前不要反复启动。
6. 数据页导出 UART 抓包、ENC、响应统计和路径文件，手工尺量平台位移。
   持续响应统计是通信证据，不是机械刺绣精度或长时间稳定性结论。

### 7. 下载基座、推理和重新训练

仅使用随包 LoRA 仍需要 SDXL 基座；不能把 36MB 适配器当成完整模型。
先按 [下载地址](#downloads) 获取固定版本组件。

```powershell
cd src/ml
conda env create -f environment.yml
conda activate xiangxiu-sdxl
python download_base.py
python shard_unet.py
cd ../..
python src/ml/infer.py --prompt "A clean black line drawing of a bird and flowers, pure white background" --seed 42
```

默认生成到 data/ml/inference 的新目录。PNG 可上传上位机继续生成针迹。
已有基座可以设置 SDXL_BASE，并运行 download_base.py --verify-only 验证。
重新训练运行 `python src/ml/train_v2.py`，输出到新的 data/ml/runs/v2；
需要第二轮实验时把 ML_RUN_DIR 设到新的目录，以免复用旧缓存或覆盖同一实验。
训练原图及 8 张增强/1 张诊断图已在本包，不必下载 MSEmbGAN 才能复现本轮训练。
详细训练参数与真实 loss/图表见 report/ml 和 src/ml/README.md。

### 8. 完成标准

软件：新账号可登录、普通图可生成路径、数据页可导出、npm test/build 通过。
模型：基座 SHA 校验通过，适配器加载成功，生成 PNG 与真实耗时 JSON。
FPGA：实际工具运行完成仿真与实现并生成新 bit；不能用历史日志替代。
实机：针位高低逻辑、两轴正向计数、位移标定、短针任务和逐层流程由操作者实测记录。
最后保存实验条件、原始日志及照片，才能描述本台机器的稳定运行结果。

<a id="hardware"></a>

## 硬件清单与完整接线

依据已提供的达芬奇 Pro 底板 V2.6、核心板 V4.1、IO 分配表、TB6600 规格书、
美蓓亚电机图片、ITR9606 数据手册、既有接线记录，以及本包 `src/rtl/board_top.v` 和
`board/constraints/pins.xdc` 整理。这里是最终红外反馈自动下针版本的接线。
所有管脚表都按本包 XDC 核对；54 路顶层管脚的完整导出见 [完整引脚表.csv](board/完整引脚表.csv)。

### 1. 硬件清单

|部件|数量|已提供资料对应的型号 / 规格|用途与配套条件|
|---|---:|---|---|
|正点原子达芬奇 Pro 开发板|1 套|Artix-7 **XC7A100T FGG484 -2**；底板 V2.6、核心板 V4.1 接线依据|Vivado 器件名 xc7a100tfgg484-2，板载 50MHz 时钟；不能用 35T 同名板直接代替|
|摄像头|1|**OV5640，8 位 DVP，SCCB 接口**|本接法使用自带本地 24MHz 时钟的兼容模组；不是 USB 摄像头或 MIPI 模组|
|步进驱动器|2|用户提供规格书的 **TB6600 系列驱动模块**，支持 3.3V 控制信号|每轴一只；32 细分、1A 档；不同厂家同名驱动的拨码表可能不同|
|步进电机|2|图片中的**美蓓亚 42 步进电机，0.9°，1A，PH2.0 6P 六线**|按图使用两相四线，另外两根独立绝缘；图片未标出完整铭牌料号，按这组参数匹配|
|XY 运动机构|1 套|双轴丝杆平台，**8mm 导程、电机与丝杆 1:1**，布框/夹持机构|软件总行程参数 300mm 不表示任意平台都能移动 300mm；实际机构尺寸决定可用范围|
|增量编码器|2|既有资料中的 **1000PPR、AB 两相、NPN 集电极开路、5～24V、红黑白绿四线**|每轴一只；当前采用 5V 供电、AB 分别上拉到 3.3V；不能直接换成 5V 推挽或差分输出型|
|红外对射 / 槽型传感器|1|**EVERLIGHT ITR9606**，裸器件为红外 LED＋NPN 光电三极管|检测针离开/返回最高点；若使用带比较器的模块，必须确认输出极性、电压与裸器件接法一致|
|缝纫机及单针触发接口|1 套|用户确认的 **3.3V 高有效下针控制接口**，针位由 ITR9606 反馈|应具备执行一次机械针周期的能力；GPIO 不直接承担机构功率。现有资料未给可据以填写的控制板端子型号，不虚构电源或端子编号|
|电机动力电源|1|现有接线记录为 **22V DC**；TB6600 资料推荐 12～24V|按两轴负载选额定电流；不从开发板排针取电；开发板使用原配供电方案|
|电阻|至少 6 只|编码器上拉 **3.3kΩ×4**；ITR LED 限流建议起始 **220Ω×1**；接收端上拉建议起始 **10kΩ×1**|红外限流/上拉是初始接线建议，依据实测电流与电平调整；不等同已完成机械标定|
|连接与工具|若干|USB 数据线、杜邦线/端子、3.3V 兼容信号缓冲接口、万用表、尺|JTAG、USB-UART、USB Slave 是三个用途；全功能调试应分别连接对应接口|
|电脑|1|Windows 64 位；Chrome/Edge；Node.js 22、Python 3.11、Vivado 2026.1|本地 SDXL 另需支持 CUDA/BF16 的 NVIDIA 显卡；已验证环境为 RTX 5070 Laptop 8GB、CUDA 12.8，建议 RAM 32GB|

只体验图片和针迹生成不必连接机械硬件；要复现自动刺绣，双轴驱动、双编码器和针位检测均应接好。
本机的具体串口号和 USB 序列号不是其他电脑的固定配置。

### 2. 总体连接

```text
电脑 ── JTAG 数据线 ──────────── 开发板 JTAG（只用于配置 FPGA）
     ├─ USB-UART 数据线 ──────── 板载 UART（指令、状态、编码器）
     └─ USB Slave 数据线 ─────── 板载 FT232HL FIFO（相机图像）

OV5640 ── P1 / DVP + SCCB ───── FPGA
                                   ├─ J4 STEP/DIR ── X/Y TB6600 ── 两轴电机
X/Y 编码器 ── 3.3V 上拉 ── J4 ────┤
ITR9606 ── 3.3V 接收电路 ── J3 ────┤
                                   └─ J3-23 / 3.3V 触发 ── 下针控制接口

22V 动力电源 ── 两只 TB6600 的 VCC/GND（不接任何 FPGA 信号脚）
```

J3/J4/P1 是**底板连接器**，C18、AA15 等是 FPGA 封装球位，两者不能混为一谈。
排针方向以底板 1 脚标记及附带原理图为准，不按照片左右猜测。GPIO 地必须接相应信号地；
若采用隔离缓冲，地线按该隔离接口定义连接。更换线或拨码时先断开相关动力电源。

### 3. X/Y 电机、驱动和动力线

下表采用与现有记录一致的**共阴、高有效**控制方式。若需要缓冲器，应保持有效极性、
满足驱动器输入电流及脉冲宽度要求，不能仅凭“3.3V”判断 GPIO 带载能力。

|源端|FPGA 球位|方向|接到哪一端|
|---|---|---|---|
|J4-31，x_step|AA15|FPGA → 驱动|X 驱动 PUL+|
|J4-32，x_dir|AB15|FPGA → 驱动|X 驱动 DIR+|
|J4-35，y_step|Y16|FPGA → 驱动|Y 驱动 PUL+|
|J4-36，y_dir|AA16|FPGA → 驱动|Y 驱动 DIR+|
|J4-37 或 J4-39，GND|—|信号公共端|两只驱动 PUL−、DIR−|
|22V 电源正极|—|动力|两只驱动 VCC|
|22V 电源负极|—|动力|两只驱动 GND|
|ENA+ / ENA−|—|本顶层未引出 motor_en|该规格书允许不使用 ENA 时悬空；不能把缺省使能当作硬件急停|

J4-38 是 3.3V、J4-40 是 5V，都不是地。共阴接法不可再把 PUL+/DIR+ 固定接到 5V。
TB6600 光耦接口需要足够驱动电流；现有记录要求约 5mA 控制能力。
TXB0104 等弱驱动电平转换器不作为该光耦输入的直接驱动方案。

两只电机分别连接各自驱动器；仅对已提供的美蓓亚图片，线色为：

|驱动端|电机线色|说明|
|---|---|---|
|A+|红|A 相端|
|A−|黄|A 相端|
|B+|绿|B 相端|
|B−|白|B 相端|
|不接|蓝、黑|两根分别绝缘，不能互相短接|

本规格书第 3 页拨码：**SW1/SW2/SW3 = OFF/OFF/OFF（32 细分）；
SW4/SW5/SW6 = ON/OFF/ON（1A）**。规格书的 6400 pulse/rev 一栏按 1.8° 电机列出；
本项目 0.9° 电机每圈 400 整步，32 细分后实际为 12800 STEP/rev。
`(360/0.9) × 32 / 8 = 1600 STEP/mm`，与上位机和 board_top 默认值一致。
不能将同名驱动器另一本说明书的拨码套到此型号上。

### 4. 双轴编码器

|编码器线|X 轴接线|Y 轴接线|
|---|---|---|
|红 VCC|J4-40 / 5V|同一 5V 供电分线|
|黑 0V|J4-37 或 39 / GND|同一信号地|
|白 A|J4-27 / Y13 / encoder_x_a|J4-33 / AB16 / encoder_y_a|
|绿 B|J4-28 / AA14 / encoder_x_b|J4-34 / AB17 / encoder_y_b|
|每路 A/B 的上拉电源|J4-38 / 3.3V|同一 3.3V 分线|

每路 A/B 均需独立一颗 3.3kΩ，上拉后节点接编码器输出和 FPGA 输入。两轴共四颗。

```text
3.3V ── 3.3kΩ ──●── A 输出线 ── 对应 FPGA A 输入
3.3V ── 3.3kΩ ──●── B 输出线 ── 对应 FPGA B 输入
                 （两个节点彼此独立）
5V ── 编码器红线；GND ── 编码器黑线
```

先在未接 FPGA 时检查高电平不超过 3.3V。5V/24V 推挽输出不得按此图直连。
1000PPR × AB 四倍频 / 8mm 导程 = **500 count/mm**；1 count 为 0.002mm 计数分辨率，
不是已测得平台精度。正向移动时目标与反馈方向应一致；错误时核对 A/B 与安装方向，
不要用上位机“显示反向”掩盖实际闭环方向错误。只接一个编码器不能复现双轴闭环。

### 5. ITR9606 和自动下针

随附 ITR9606 Rev3 数据手册第 2 页：**1=Anode（阳极），2=Cathode（阴极），
3=Collector（集电极），4=Emitter（发射极）**。物理排列按数据手册底视图识别。

|器件端|接线|
|---|---|
|1，红外 LED 阳极|3.3V 经限流电阻接入；220Ω 为约 10mA 等级的起始建议，按正向压降实测|
|2，红外 LED 阴极|信号 GND|
|3，光电三极管集电极|接 J3-27 / D20；该节点经独立 10kΩ 起始上拉到 3.3V|
|4，光电三极管发射极|信号 GND|
|J3-23 / C18，needle_trig|接下针控制接口的 3.3V 高有效触发输入|
|下针控制接口信号参考端|接 FPGA 信号 GND；隔离接口按其说明处理|
|J3-35 / E16，needle_sensor_debug|可选接示波器/逻辑分析仪，输出消抖后的遮挡状态|

```text
3.3V ── 限流电阻 ── ITR9606-1 (LED A)
GND  ───────────── ITR9606-2 (LED K)

3.3V ── 上拉电阻 ──●── J3-27 / D20
                   └── ITR9606-3 (C)
GND  ───────────────── ITR9606-4 (E)

J3-23 / C18 ── 3.3V 兼容触发接口 ── 缝纫机单针机构
```

安装要求：针在最高点**透光**，裸接收管导通，D20 为低；离开最高点遮挡时 D20 为高。
当前 NEEDLE_SENSOR_ACTIVE_LOW=0，对应**高=遮挡/针未确认在上位**。带比较器的成品模块可能反相，
不能只按模块 VCC/GND/DO 字样直接代用；先核对电压及透光/遮挡极性。
此检测确认“离开并返回最高点检测区”，不直接证明针尖已到最低点或布料已成功成针。

代码默认：1ms 去抖、到位后 20ms 停稳、20ms 高触发、间隔 200ms 后有条件补发，最多三次。
必须先见遮挡再见透光且稳定确认，才继续 XY。未见下针 1s 或未回位 2s 等情况锁定运动，
不输出 ERR needle，STATUS? 返回 BUSY。GPIO 不直接接针电机、电磁铁或市电。
触发控制板的电源、功率输出及机构内部端子按其自身资料连接，不能由本项目 3.3V 输出反推其动力电压。

### 6. OV5640 摄像头 P1 接线

|模组信号|底板 P1 脚号|FPGA 端口 / 球位|
|---|---:|---|
|3.3V|1|模组电源|
|GND|2|模组地|
|VSYNC|3|cam_vsync / P14|
|SCL|4|cam_scl / N13|
|HREF|5|cam_href / N14|
|SDA|6|cam_sda / R14|
|RST|7|cam_reset_n / N17|
|D0|8|cam_data[0] / P17|
|D1|9|cam_data[1] / P15|
|D2|10|cam_data[2] / R16|
|D3|11|cam_data[3] / R17|
|D4|12|cam_data[4] / P16|
|D5|13|cam_data[5] / V17|
|D6|14|cam_data[6] / W17|
|D7|15|cam_data[7] / U17|
|PCLK|16|cam_pclk / U18|
|P1 标为 CMOS_XCLK 的脚|17|**本接法不接**；参考模组此位置为 FLASH，不能混接|
|PWDN|18|cam_pwdn / AB18|

17 根有效连线含电源和地。P1-17 和模组 FLASH 均留空。
当前 RTL 没有输出相机 XCLK，所以模组必须有本地 24MHz 时钟；若没有，不能通过接 FLASH 补时钟，
必须另设计真实 XCLK 连接与对应约束。本条件直接决定其他人能否复现相机画面。
SCCB 上拉依底板已有电路；数据线尽量短。PCLK 在 U18 使用特殊布线约束，不代表外设采样裕量已实测。
电机必须接 J4，不使用已分给相机的旧 J3 共享管脚。

### 7. USB、板载按键、LED 与限位

|用途|连接 / 管脚|使用方法|
|---|---|---|
|USB-UART|板载 TX → uart_rxd E14；RX ← uart_txd D17|电脑选实际 COM 口，115200、8N1，ASCII 行协议；通常不必另拉跳线|
|USB Slave|板载 FT232HL|实时图像用 D2XX；插好数据线后启动 camera_bridge；不是把相机流从 COM 口读取|
|USB-JTAG|板载下载器|Vivado 下载 bit；不替代前两条数据通路|
|KEY0|start_button / T4|任务装载后由操作者启动/继续；不可绕过针故障锁定|
|KEY1|estop_button / T3|暂停/停止处理，长按约 1.5s 清任务；针周期中暂停会锁定，需排障后复位重传|
|KEY2|key2_button / R6|相机拍照事件；不是外接相机触发线|
|板载时钟|sys_clk / R4|50MHz，板内已接|
|板载复位|sys_rst_n / U7|板内已接；不要把核心板蓝色 RESET 当作保留临时 bit 的任务复位|
|LED0～3|V9 / Y8 / Y7 / W7|板内已接；状态灯不是独立的机械安全确认|
|X 限位|J3-17 / C13 / limit_x|3.3V 逻辑输入，高有效（LIMIT_ACTIVE_LOW=0）|
|Y 限位|J3-19 / C14 / limit_y|同上|

板载时钟/按键/复位/LED 使用 **LVCMOS15**；外接电机/编码器/针控/相机为 **LVCMOS33**。
这些电平分组由板内 IO Bank 供电决定，不能全部改为 3.3V。
限位只用于可选回零模块；当前 HOMING_ENABLE=0，**未启用机械回零**，不能把这两个输入当作运行硬限位。
未接限位时固定为无效低电平，不留悬空；10～30V PNP 限位须先经适配电路转换到 3.3V。

`RESET` / KEY1 长按清任务后，当前位置为逻辑原点，不是机械回零。首次运动前由操作者确定针已抬起、
当前位置与可用行程，先做短距离试验。下载不会自动启动运动。

### 8. 文档依据与原件

原件放在 [references](board/references/README.md)：底板/核心板原理图、厂家 IO 表、TB6600 规格书、
电机参数照片、ITR9606 手册、OV5640 手册。完整引脚 CSV 从本包 XDC 自动导出，
FT232HL 数据线属于板内固定连接；没有必要按 CSV 再用杜邦线重连板载芯片。
原件中的早期示例和当前项目约束不同时，以本包当前 XDC 与表中底板脚位映射核对，
不要将同名核心板连接器的脚号替代底板 J3/J4。

<a id="downloads"></a>

## 数据集与基座下载地址

### 1. 复现本轮训练所需数据已随包

本轮 V2 使用项目自有图案，不需要额外购买/下载数据集。实际输入如下：

|原始文件（可直接点击）|用途|增强后数量|
|---|---|---:|
|[bird-original.jpg](src/upper/src/assets/bird-original.jpg)|训练；花鸟整图|4|
|[solo-bird.png](src/upper/src/assets/solo-bird.png)|训练；同一花鸟构图裁剪得到的单鸟|4|
|[flower-original.png](src/upper/src/assets/flower-original.png)|固定噪声诊断，不反向传播|1|

三份原图位于 src/upper/src/assets，增强成品位于 [ml/training-images](data/ml/training-images)。
文件 SHA256、提示词和增强参数见 [dataset.json](report/ml/dataset.json)。
2 个相关训练源文件只算 **1 个独立训练构图**；增强图不当作独立作品。
这三张图没有独立的公共数据集下载页，直接使用随包原件即可复现。

### 2. SDXL 1.0 基座下载

发布方 Stability AI，模型 stabilityai/stable-diffusion-xl-base-1.0。
这是文本生成图片基座，不直接输出针迹；针迹由项目规划程序产生。

- [官方模型说明](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)
- [本项目锁定版本文件页](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/tree/462165984030d82259a11f4367a4eed129e94a7b)
- 固定 revision：462165984030d82259a11f4367a4eed129e94a7b。
- 只下载本项目需要的 20 个文件，合计 **6,941,210,313 字节**；不要下载仓库全部变体。
- [逐文件大小与 SHA256 清单](src/ml/base-model-manifest.json)
- [随包模型许可](src/ml/SDXL-LICENSE.md)

在 src/ml 下、已创建的 xiangxiu-sdxl 环境中运行：

```powershell
python download_base.py
python download_base.py --verify-only
python shard_unet.py
```

默认目录为 src/ml/models/sdxl-base-1.0。
手动下载时必须保留以下相对目录；不要只下载根目录的单个 sd_xl_base_1.0.safetensors，
本项目使用的是 Diffusers 分组件布局。镜像或网盘也必须通过同一份 SHA 校验。
分片是脚本无损生成的，不必再从网盘重复下载另一份 5GB UNet。

|相对路径|文件大小（字节）|固定版本直链|
|---|---:|---|
|LICENSE.md|14,109|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/LICENSE.md?download=true)|
|README.md|8,668|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/README.md?download=true)|
|model_index.json|609|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/model_index.json?download=true)|
|scheduler/scheduler_config.json|479|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/scheduler/scheduler_config.json?download=true)|
|text_encoder/config.json|565|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/text_encoder/config.json?download=true)|
|text_encoder/model.fp16.safetensors|246,144,152|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/text_encoder/model.fp16.safetensors?download=true)|
|text_encoder_2/config.json|575|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/text_encoder_2/config.json?download=true)|
|text_encoder_2/model.fp16.safetensors|1,389,382,176|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/text_encoder_2/model.fp16.safetensors?download=true)|
|tokenizer/merges.txt|524,619|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer/merges.txt?download=true)|
|tokenizer/special_tokens_map.json|472|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer/special_tokens_map.json?download=true)|
|tokenizer/tokenizer_config.json|737|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer/tokenizer_config.json?download=true)|
|tokenizer/vocab.json|1,059,962|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer/vocab.json?download=true)|
|tokenizer_2/merges.txt|524,619|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer_2/merges.txt?download=true)|
|tokenizer_2/special_tokens_map.json|460|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer_2/special_tokens_map.json?download=true)|
|tokenizer_2/tokenizer_config.json|725|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer_2/tokenizer_config.json?download=true)|
|tokenizer_2/vocab.json|1,059,962|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/tokenizer_2/vocab.json?download=true)|
|unet/config.json|1,680|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/unet/config.json?download=true)|
|unet/diffusion_pytorch_model.fp16.safetensors|5,135,149,760|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/unet/diffusion_pytorch_model.fp16.safetensors?download=true)|
|vae/config.json|642|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/vae/config.json?download=true)|
|vae/diffusion_pytorch_model.fp16.safetensors|167,335,342|[下载](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/vae/diffusion_pytorch_model.fp16.safetensors?download=true)|

已有网盘目录时，在 src/ml 下运行 `python download_base.py --verify-only --directory D:/你的基座目录`。
随后在同一终端设置 `$env:SDXL_BASE='D:/你的基座目录'` 再执行分片、推理或训练。
网盘链接暂未填写；官方固定版本直链已完整给出，不依赖未来网盘地址。

### 3. 可选公开数据：MSEmbGAN 作者样例

- [作者项目页 / 原始来源](https://csai.wtu.edu.cn/TVCG_01/index.html)
- [作者 Google Drive 样例下载页](https://drive.google.com/file/d/1UDxn4W2M3ur1A0TkEeTrpXNGGIBhnrZX/view?usp=sharing)
- 文件名 MSEmb_DATASET_SAMPLE.zip；历史下载大小 36,383,132 字节，1200 个 PNG。
- 历史 SHA256：3cf091be3e92d8ca3cc4e07e64de77daefed0da5a8506b0d81cc2cc05d9a2456。

这是公开样例，不是作者完整数据集，也不是湘绣白底花鸟专用集。
**它未参与本次 V2 训练**，因此不要求复现者下载，也没有把 1200 张样例算成本项目训练规模。
下载后在 PowerShell 用 `Get-FileHash 路径/MSEmb_DATASET_SAMPLE.zip -Algorithm SHA256` 核对。
它可用于后续扩展实验；原包未发现明确 LICENSE，不把公开可下载写成已核实可任意再发布。

### 4. LoRA、训练结果与网盘清单

|内容|本包位置|是否需下载|
|---|---|---|
|V2 原始 LoRA|src/ml/adapters/raw/pytorch_lora_weights.safetensors|已包含|
|V2 EMA LoRA|src/ml/adapters/ema/pytorch_lora_weights.safetensors|已包含，推理默认使用|
|V1 pilot LoRA|src/ml/adapters/pilot/pytorch_lora_weights.safetensors|已包含，用于历史对照|
|训练 CSV、框架图、性能图、配置|report/ml|已包含|
|官方 SDXL 基座|src/ml/models/sdxl-base-1.0|外置，使用上面的固定链接下载|
|作者 MSEmbGAN 样例|可自行另建数据目录|可选，不影响当前训练复现|

没有单独下载新 LoRA 的必要。本地 SDXL 在电脑 GPU 运行，FPGA 负责运动/相机/针控。
云文生图 API 的 Key 属于复现者账号；它们和此本地 SDXL 基座是不同入口。

下载链接于 2026-11-03 核对：SDXL 固定版本页、MSEmbGAN 作者页及其 Drive 下载页可访问。
未来外部服务可能变化，文件身份以固定 revision 与 SHA256 为准。

## 最终固件

源自 fpga - 副本，板卡顶层 board_top 默认启用红外反馈自动下针。针最高点透光，
触发输出为 3.3V 短脉冲，确认遮挡再透光后继续下一点。当前 20ms 脉冲为待实测调节参数。
最多三次脉冲，故障锁定运动；按原要求不输出 ERR needle 字符串。详见板卡说明。
普通 top 模块保留兼容仿真的参数默认值，实板必须使用 board_top。

## 复现边界

ZIP 包含源码、轻量 LoRA、训练输入和真实实验材料，不包含 node_modules、Conda 环境、
Vivado 安装包、完整 SDXL 基座、重复工程、历史缓存或个人密钥。
依赖首次安装和基座下载需要联网。离线交付时需另备这些依赖；网盘位置见 src/ml/外部大文件.md。
有训练/仿真结果不代表已完成当前固件的机械联调或长时间稳定性实测。
历史模型报告中的开发盘符用于说明原始证据，实际运行脚本均使用相对路径或可设置的环境变量。

## 本次交付验证

全套前端 20 个测试文件、92 项检查通过；从本包锁文件重新安装后构建通过。
新生成账号的登录、错误密码拒绝、普通图片生成、固定蝴蝶 UART 一致性已在浏览器验证。
相机桥接 8 项离线单元测试通过；技能包 14 项离线检查通过。
本地 EMA 推理以 2 步完成了实际执行检查（不是正式质量评估），历史 25 步结果保留在 report/ml。
本次已重新运行四项真实 XSim 测试，全部通过；Vivado 实现与 bit 生成通过，setup 0.903ns、hold 0.084ns。
新工程、bit、实现报告和源码哈希均随包，工程已实际验证搬迁后能解析包内源码。
前期受限运行上下文中的许可错误已在正常本机执行下解决；旧 attempt 日志仅作历史记录。
未自动下载、发送或驱动机器，机械针周期仍未实测确认。

## 与原工程的一致性及可用范围（2026-11-03 核对）

|核对项|结果|
|---|---|
|最终自动下针 RTL|13 个 .v 文件与 Control/fpga - 副本逐字节一致，包含 board_top、top、needle_ctrl|
|实际引脚约束|两份 XDC 与副本工程一致|
|上位机 src 及图案/针序资产|81 个文件中，仅 birdPreset.test.ts 为已说明的旧测试修正；其余全部一致|
|相机桥接、本地图片识别 Python|4 个 .py 文件与原 host 一致|
|三个 RTL 测试文件|与自动下针副本一致，含四个仿真顶层|
|raw / EMA / pilot LoRA|三份权重逐字节一致|

整理时的适配项：Python 默认路径从开发机 E:/Anaconda/python.exe 改为 PATH 中的 python，
保留 ARTWORK_PYTHON 显式指定；增加首次随机账号生成；更新忽略规则；将过时的鸟图测试与当前保存路线对齐。
构建/启动/模型脚本为可迁移目录编排，不能把整个交付目录描述为与开发工程所有文件完全相同。
具体文件 SHA 与差异见 [source-equivalence.json](build/source-equivalence.json)。

**版本一致性不等于已经实机跑通。** 本包选的是用户指定的自动下针副本；
与较早 E:/AMD_COMPETITION/fpga 中的定时下针源码相比，board_top.v、top.v、needle_ctrl.v 三个文件不同。
没有确认当前板卡实际加载哪一份 bit，也没有将较早版本的运行经历移作新反馈针控的实测证明。

已确认：交付包上位机 92 项测试、构建、浏览器登录与路径检查通过；本地模型推理冒烟通过；
本次红外 RTL 四项 XSim 已重新通过，关键源文件与对应日志清单一致。
本次已完成：当前自动下针源码四项 XSim、综合/实现、新 bit 生成和工程搬迁检查。
尚未确认：新 bit 的实机完整流程，20ms 下针参数仍待实际机构测定。
可使用随包 bit，或自行重建；烧录前按接线说明检查针位与短行程，再试少量针任务。
本次文档与一致性核对未下载 FPGA、未发送任务、未启动电机。
