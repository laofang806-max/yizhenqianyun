# 可直接打开的 Vivado 工程

双击 yizhen_qianyun.xpr，或在 Vivado 2026.1 用 Open Project 打开。
请搬运整个 yizhen-qianyun 目录，不能只复制本子目录；RTL、XDC 和测试文件在根目录对应子目录。
工程已实际在另一目录打开验证，全部 13 个综合源文件均指向搬迁后的包内文件。
器件 xc7a100tfgg484-2，综合顶层 board_top，默认仿真顶层 tb_needle_ir_top。
本目录保留干净工程文件，没有打包可再生成的 .runs/.cache；打开后可以自行运行综合与实现。
本次已生成的 bit 在 ../../board/firmware，报告在 ../release。
Vivado 工程扩展名是 .xpr；不使用 Quartus 的 .qpf/.qsf 替代真实 AMD 工程。
若需重新创建，运行 vivado -mode batch -source build/create_project.tcl；完整构建运行 build/build.tcl。
