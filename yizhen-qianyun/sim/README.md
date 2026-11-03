# RTL 仿真

运行 run.ps1，使用 Vivado XSim 编译包内 src/rtl 和 sim/tb，输出写 sim/output。
四个测试覆盖红外正常周期、补脉冲、未下针、回针失败、暂停/取消、XY 联锁、
任务复位及不发送 ERR needle 的协议要求。
reference 是开发时真实 XSim 日志；重新运行结果以本次 output 为准。
这些测试没有替代机械装置实测。软件回归命令为在 src/upper 中执行 npm test。
