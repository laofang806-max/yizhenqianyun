# 板卡与自动下针

先看 [硬件清单与完整接线](硬件清单与完整接线.md)，包括设备规格、电源、P1/J3/J4、针位传感器和全部 USB 连接。
原件见 [硬件参考资料](references/README.md)。

器件 XC7A100T FGG484 -2，50MHz，115200 波特率。实际引脚以 constraints/pins.xdc 为准。
时钟、复位、按键、LED 部分是 LVCMOS15；不能统一改为 3.3V。

|信号|FPGA 管脚|扩展接口|
|---|---|---|
|X STEP / DIR|AA15 / AB15|J4-31 / J4-32|
|Y STEP / DIR|Y16 / AA16|J4-35 / J4-36|
|X 编码器 A / B|Y13 / AA14|J4-27 / J4-28|
|Y 编码器 A / B|AB16 / AB17|J4-33 / J4-34|
|下针触发 needle_trig|C18|J3-23，3.3V 逻辑输出|
|红外反馈 needle_sensor|D20|J3-27，3.3V 输入|
|传感器调试输出|E16|J3-35|

ITR9606 发射端必须限流；接收端为光电晶体管，需要正确接线及 3.3V 上拉。
针最高点透光对应输入低、遮挡对应输入高，NEEDLE_SENSOR_ACTIVE_LOW=0。
下针触发只接驱动器逻辑输入，不能由 FPGA IO 直接驱动电磁铁或电机。
传感器先经同步和 1ms 去抖。默认脉冲 20ms，等待 200ms 后仍未回针时有条件补脉冲，
总计最多三次；未检测到下针 1s、未回针 2s 或达到上限进入故障锁定。
仅检测到遮挡再恢复透光、并稳定确认后，才能执行下一段 XY。
暂停时针周期未完成也会锁定。STATUS? 在针故障期间返回 BUSY，不发送 ERR needle。
这些时间是当前开发默认参数，实际机构响应与传感器安装位置需要实测确认。

默认 1600 STEP/mm；编码器约 500 count/mm，容差 10 count。ENC 每约 200ms 回传，
格式 `ENC XXXXXXXX XXXXXXXX`，两项为 32 位十六进制计数。
KEY1 长按约 1.5s 或串口 RESET 清任务、保留 PL 配置，当前位置成为新的逻辑原点。
蓝色核心板 RESET 不能当任务复位，可能清除临时 JTAG 配置。复位不等于机械回零。

## 下载与启动

在 Vivado Hardware Manager 打开目标板，将本包 firmware/yizhen_qianyun_auto_needle.bit 下载到 XC7A100T。
这是临时 JTAG 配置；上电从 Flash 启动需要另行生成并验证配置存储器文件，本包未包含其烧写流程。
停止运动、使针离布，核对接线和实际机构反馈，再由操作者在上位机连接串口并启动任务。
构建与启动脚本均不会自动烧录或自动启动运动。
板载相机通过 USB Slave 数据口连接电脑，JTAG 下载口不能替代相机数据口。
安装 FTDI D2XX 后，运行 `powershell -File board/start-camera.ps1 -SerialNumber 你的USBSlave序列号`。
脚本使用真实相机模式；断开设备会报错。历史本机 USB Slave 序列号为 FT5X9ZJ5，新板须重新确认。
