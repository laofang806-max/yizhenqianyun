# 彩色色层工作流
适用范围：不限定四色、相近色合并、白底忽略、逐层上传的刺绣应用。
使用方法：`$color-layer-workflow 将照片按近似颜色分层，忽略白底，生成当前层路径并说明换线流程。`
输入：真实图片、毫米画框、相近色阈值、最多线色数。输出：实际HEX色层、当前层针迹和传输兼容性结果。
失效条件：阴影变成多余色层、浅白物体被忽略、阈值过大合并关键颜色、旧固件不认识layer、误把当前层导出称整幅多色文件。
经验来源：2026-10-31用户提出“色值不差太多”和“白色不用识别”。六色条浏览器检查与adaptiveColors单元测试已完成；真实多色连续刺绣尚未由这些软件测试证明。
证据位置：Control/AMD_fpga/reports/white-background-20261031/result.json；Control/fpga/reports/color-reset-stability-20261031/browser-verification-simulated/（串口为模拟）。
移植：先映射项目路径与色层元数据；保留自身真实编码器，不把测试夹具作为实际照片处理结果。
