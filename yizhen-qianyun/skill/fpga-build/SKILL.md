---
name: fpga-build
description: "为Control项目检查Vivado源文件与引脚，构建并整理摄像头、电机、编码器相关bit及报告。用于固件构建发布；不默认下载或运行硬件。"
---

# 湘绣FPGA固件构建

工程：`E:/AMD_COMPETITION/Control/fpga`，Vivado：`D:/Xilinx/2026.1/Vivado/bin/vivado.bat`；顶层board_top，器件xc7a100tfgg484-2、50MHz。
先读 `board_top.v`、`top.v`、`motion_xy.v`、`needle_ctrl.v`、`protocol_parser.v`、当前XDC及 `build_release.tcl`。不要按bit文件名推断其来源或功能。

## 构建约束
源代码和XPR与当前交付保持一致。若隔离构建，复制当前源和XPR依赖，修正XPR绝对路径，避免偷偷读取原目录旧源码。已有手工改动要保留并备份。
`build_release.tcl`会重置综合并构建到bit，检查setup/hold、IO和报告。用户请求生成bit时可运行这一必要流程；不擅自加长时间仿真/回归，按实际改动选择必要检查。
示例：在fpga目录运行 `& 'D:/Xilinx/2026.1/Vivado/bin/vivado.bat' -mode batch -source build_release.tcl`。记录退出码及实际RELEASE_PASS；产物在 `reports/release/board_top_camera_motor_encoder.bit`。旧产物存在不表示本次构建成功。
发布应记录源文件和bit SHA256、构建日志、timing/DRC/IO报告、参数及功能。不能把“生成成功”写成“实板已验证”。

## 必查硬件关系
当前X STEP/DIR为AA15/AB15；Y为Y16/AA16；X编码器A/B为Y13/AA14，Y为AB16/AB17，均LVCMOS33。板载时钟/按键等使用LVCMOS15，不能全部改为3.3V。
运动默认1600STEP/mm，编码器500计数/mm，闭环容差10计数。相机和电机有不同USB用途，保留完整工程模块。
先检查当前top是否包含CAL X2及其状态；若使用该模式，它只缓存、KEY0启动、到位保持、不返回，CAL HOLD不是普通READY。正常刺绣与校准模式不可混用。
新版包含COLOR layer、CAP?、PING标签和RESET任务复位；KEY1长按1.5秒也可清任务，保留PL配置；先核对实际bit来源。任务复位后当前位置成为逻辑原点，不能假设已机械回零。
下载是独立动作：只有用户要求或已有明确授权且硬件准备妥当时进行。下载会清空缓存和逻辑原点；保持针离布、运动停止，按当前上下文处理驱动供电。JTAG已知序列210249B685D2，与相机FT5X9ZJ5区分。
实测核心板蓝色RESET会清除本次临时JTAG配置，不可当成保留固件的清故障键。下载绝不附带自动启动电机。

交付复用说明、适用范围和失效条件见 [README.md](README.md)。
