# 2026-11-03 真实构建证据

本目录报告来自此次实际 Vivado 综合/实现，不是截图重画或历史 bit 改名。
executed-build.tcl 为此轮实际执行脚本，vivado-build.log 包含 RELEASE_PASS。
发布后 build/build.tcl 改为调用同内容来源的可移植工程创建入口，另增加 board/firmware 输出。
13 个 RTL 和两份 XDC 的 SHA 与实构建源均记录于 board/firmware/release-manifest.json。
新工程的创建和实际搬迁打开检查分别见 project-creation.log、project-relocation.log。
timing.rpt：setup 最差裕量 0.903ns、hold 最差裕量 0.084ns。
drc.rpt：无 Error，但仍有 CFGBVS、时钟、RAM/IO 等 Warning；原始细节保留。
no_input_delay 21、no_output_delay 16 不可当作外设时序全部覆盖。
这些报告证明当前工程可生成 bit，不证明实际缝纫机已经完成自动成针或长时间稳定运行。
