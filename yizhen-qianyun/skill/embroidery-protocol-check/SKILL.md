---
name: embroidery-protocol-check
description: "检查Control刺绣JSON、BIN及UART动作流的坐标、针序、动作上限与一致性。用于生成可发送数据或排查错位、漏针、传输异常，不启动硬件。"
---

# 湘绣传输数据检查

项目：`E:/AMD_COMPETITION/Control/AMD_fpga`。
标准化入口 `src/utils/pathExport.ts`；UART入口 `deviceProtocol.ts`；BIN入口 `binProtocol.ts`。复用真实函数，不写一套近似编码器来宣称一致。

## UART约定
115200、8N1、ASCII换行结尾。单色包为 `COLOR black N
` 后N条 `J,dx,dy
` 或 `S,dx,dy
`，旧四色为black/red/yellow/blue；新版增加layer，实际线色由metadata.thread保存，COLOR layer N中的N仍是动作数，不是色层编号。
J移动但不落针，S到终点落针。dx/dy为有符号int16（-32768至32767），N不大于4096。协议不包含“收到便启动”，启动由物理KEY0触发。
当前1600STEP/mm；串口从画框中心作为逻辑起点，目标=四舍五入(坐标mm×标定)的差分。长位移会拆为中间J、最后S，拆分不得新增中间落针。
ENC回传是两个32位有符号十六进制计数，当前500计数/mm；不等于电机脉冲数。WRITE_OK仅表示浏览器写入完成，板卡确认必须看RX的OK/ERR。
JSON/BIN是文件格式，UART当前发送的是文本协议。不要直接把BIN字节写入只支持ASCII的固件。

新版连接先查询 CAP?，只有确认 LAYER / RESET / PING 对应能力后才使用。RESET清空任务并重建逻辑原点，保持固件；PING abcd匹配PONG ABCD。layer完成后DONE layer，换线并由人按KEY0确认READY，再发送下一层。

## 检查与排查
运行本Skill的 `scripts/check_uart.py <txt> --steps-per-mm 1600` 作离线结构检查；它不读串口、不发送、不验证机械动作。
要比较预览与流，使用实际编码函数，按J/S累计目标，逐个比较S目标与标准化路径。BIN需用实际decode函数往返比对，检查CRC；仅文件存在不算校验通过。
抓包入口 `src/utils/serialCapture.ts` 与 `components/SerialCapturePanel.tsx`；IndexedDB日志包括原始TX/RX、时间和事件。本页抓包不含其他进程或相机USB视频。
交付实际尺寸、STEP/mm、S数量、总动作、字节数和验证范围。不要因发送成功就声称固件执行或尺寸正确。

交付复用说明、适用范围和失效条件见 [README.md](README.md)。
