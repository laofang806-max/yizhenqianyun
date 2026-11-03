# 构建与真实工程

可打开工程：project/yizhen_qianyun.xpr。需要保留整个源码目录以解析相对引用。
仅重新创建工程：在根目录运行 vivado -mode batch -source build/create_project.tcl。
完整构建：vivado -mode batch -source build/build.tcl。
脚本从包内 RTL/XDC 创建 project 工程，输出报告到 output，并发布 bit 到 board/firmware。
本次生成的 bit 已随包；真实实现报告、执行日志和原执行脚本位于 release。
project/ 不包含庞大的 .runs/.cache，由复现者按需生成。
verify.py 校验交付快照；自行重建产生的 bit 可能因时间戳变化而有新哈希，不能将其与本次发布混为一份。
本次未下载 FPGA 或启动机构；实机针周期仍需按 README 和接线说明验证。
