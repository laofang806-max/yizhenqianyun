---
name: embroidery-startup
description: "启动或排查Control项目上位机、相机桥接、USB与串口连接。用于网站打不开、桥接未运行、端口占用或相机无图；不创建模拟画面冒充实景。"
---

# 湘绣环境启动排查

项目：`E:/AMD_COMPETITION/Control`。网站目录 `AMD_fpga`，桥接 `host/camera_bridge.py`。
先用 `scripts/inspect_environment.ps1` 只读检查路径、端口和设备；脚本不打开串口、不启动服务、不控制电机。

## 网站
Node `E:/nodejs/node.exe`，npm `E:/nodejs/npm.cmd`；已有Vite监听4173则复用，避免重复进程。没有服务时在AMD_fpga运行npm run dev并指定127.0.0.1、4173、strictPort。后台Start-Process使用WindowStyle Hidden，日志写到明确的项目报告目录，不把服务锁在短生命周期终端。
地址 `http://127.0.0.1:4173/`；`?capture=1`打开串口抓包，`#camera`定位相机连接区。打开页面后确认HTTP和实际UI，不能只看进程PID。

## 相机桥接
相机用USB Slave FT232HL，已确认序列FT5X9ZJ5；JTAG下载器序列210249B685D2。UART通常COM7 CH340，但枚举后再用，不硬认旧COM号。
复用8765已有监听。没有监听且请求启动相机时，用可用Python运行 `host/camera_bridge.py --serial FT5X9ZJ5`，真实服务是 `ws://127.0.0.1:8765/camera`。可用的现有Python之一为 `C:/Users/libiao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`，先核实路径。
服务在打开D2XX设备失败时会退出。FTDI状态3或设备缺失时先查Windows识别与USB Slave线，不能误开JTAG，不能使用--simulate作为修复。只在用户要求离线模拟时使用模拟模式并标识。
确认监听日志和浏览器已连接，再判断是否有真实帧。无图时区分板端初始化、时钟活动、完整帧以及固件格式，连接成功不等于有图。

## 运行边界
别因启动网页而自动连接UART、发送旧任务或启动运动。释放占用前核实进程，不终止未知进程。重插线、断电或重烧会改变状态，说明所需具体操作与原因，不反复无依据让用户重插。
普通照片上传按实际图片处理；太极等预设可由文字入口加载。登录页出现不是服务故障。不要输出 .env.local、管理员密码文件或浏览器会话凭证。

交付复用说明、适用范围和失效条件见 [README.md](README.md)。
