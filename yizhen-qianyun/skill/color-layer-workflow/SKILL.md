---
name: color-layer-workflow
description: 合并刺绣图像的近似颜色、忽略白底并逐色层生成和发送路径；用于彩色针迹流程维护，不用于图像模型训练。
---
# 彩色色层工作流
项目AMD_fpga；先读src/utils/adaptiveColors.ts、App.tsx、ThreadLayersPanel.tsx、deviceProtocol.ts和types/exportData.ts。
原图保留彩色，色层由实际RGB聚类而来，不能重新吸附到黑红黄蓝。默认Lab欧氏距离阈值22、最多16色，按用户需求调节；这是感知距离近似，不是CIEDE2000。
白底和中性近白不识别：minRGB>=245，或minRGB>=230且maxRGB-minRGB<=18；alpha<=40忽略。浅粉/浅蓝/浅黄需要保留，白色物体目前也会被忽略；若用户需要绣白色需更改产品规则。
metadata.thread保留id/label/hex/index/total/mergeDistance。内部黑色几何载体不代表真实线色，不能修改四个传统传输槽就宣称完整多色导出。
生成、编辑、预览和导出均针对当前色层；每次发一层，单包<=4096动作。先查CAP?确认LAYER，不支持则提示固件兼容性，不能悄悄退化为四色。
传输后锁定该层，DONE layer后标记完成；手动换线、KEY0确认READY后可发下一层。不得自动运行或替用户确认换线。
检查真实图像多色条、全白底和浅彩样本，运行adaptiveColors相关测试与build；浏览器串口模拟需标识，不能称实板绣色验证。
复用用法、失效条件见[README.md](README.md)。
