---
name: runtime-evidence
description: 整理FPGA资源、时序、真实仿真波形和通信持续响应证据；用于实验与报告验证，不伪造实板稳定性或自动启动运动。
---
# 实验验证与证据整理
先确定用户要软件测试、RTL仿真、实现报告还是实板数据。资源图读Vivado原始报告，记录器件分母、综合/实现阶段、相机配置、源文件版本，不把截图比例当实测值。
仿真使用现有tb真实运行，日志FAIL或进程失败不能用旧波形掩盖。用户要黑底绿线时，用ModelSim加载当次WLF，设置可读信号名、radix、时间范围，原生窗口截图；VCD绘图需明确是对真实仿真数据的再绘制。软件模拟串口不等于RTL或实板。
通信入口：src/utils/runtimeMetrics.ts、serialCapture.ts和StabilityPanel.tsx。PING须匹配16位标签，过期PONG不配对；约1秒探测/2秒超时，上传期间暂停。统计mean/p95/max、timeouts、writeErrors、boardErrors、disconnects、DONE、编码器更新间隔，保存原始TX/RX和JSON/CSV。
RTT含浏览器调度和串口排队，不等于纯FPGA计算延迟。编码器更新及时不等于机械位置准确。样本最多保留20000条，累计计数可能超过样本数；刷新前导出。超时率以已完成探测为分母，尚未返回的pending不能算丢包。
任务RESET需固件声明RESET能力，清任务保留配置；KEY1长按1.5秒同类作用，当前位置成为新逻辑原点。蓝色核心板RESET不可当任务复位。只整理验证材料不触发RESET、下载或运动。
使用scripts/evidence_check.py离线提取timing并校验显式SHA清单。脚本不判定外设时序约束完整，也不把静态检查判为硬件通过。
按[templates/experiment.md](templates/experiment.md)记录条件与观察；已知故障见[references/pitfalls.md](references/pitfalls.md)，用法及失效范围见[README.md](README.md)。
