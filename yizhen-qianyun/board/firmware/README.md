# 当前自动下针固件

- 文件：yizhen_qianyun_auto_needle.bit（3,825,989 字节）。
- 器件：xc7a100tfgg484-2，顶层 board_top，自动下针和红外反馈启用。
- 本次实际生成：2026-11-03；Vivado 2026.1；RELEASE_PASS，setup 0.903ns、hold 0.084ns。
- SHA256：`d886a66a27e780f803ebfb0b069f40cf0d632c58fdf63abb828932393a23c1b5`。
- 对应工程：[yizhen_qianyun.xpr](../../build/project/yizhen_qianyun.xpr)。
- 来源/哈希：[release-manifest.json](release-manifest.json)，报告见 [build/release](../../build/release/)。

这是当前自动下针源码新生成的 bit，没有用旧定时下针 bit 替代。
已通过实现与四项本次 RTL 仿真；未下载 FPGA、未启动运动、未完成当前针机构的实机标定。
DRC 无错误，仍有配置电压声明、相机时钟、RAM 和 IO 缓冲等警告；报告原样随包。
时序检查通过不代表全部外设时序、针脉冲时长及机械精度已实测确认。
在 Vivado Hardware Manager 对实际 XC7A100T 选 Program Device，指定本文件。
下载前核对完整接线和针抬起；不要在不匹配的板卡/封装上使用。下载后逻辑原点须重新核对。
