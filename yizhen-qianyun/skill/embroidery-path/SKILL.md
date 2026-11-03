---
name: embroidery-path
description: "为Control刺绣项目生成或修正针迹，处理连续走线、少剪线、针距、图案尺寸和画框裁切。用于路径生成与修正，不用于电机标定或启动硬件。"
---

# 湘绣针迹规划

项目：`E:/AMD_COMPETITION/Control/AMD_fpga`。先读取当前源文件，不能把历史报告当成当前功能。

## 路径入口
- `src/utils/graphStrokePaths.ts`：线稿连续走线；`oneStrokePaths.ts`、`contourPaths.ts`、`pathGenerator.ts`：其他模式。
- `src/utils/needleEditing.ts`：编辑和画框裁切。`coordinateTransform.ts`：像素到毫米、比例与旋转。
- `src/utils/birdPreset.ts` 与 `src/data/*-route.json`：整理过的明确针序。图案固定路线任务应直接使用针序，避免重新栅格识别重排。
- `src/App.tsx` 决定入口行为。普通照片/文件上传现在按真实图片生成路径，彩色入口使用 adaptiveColors.ts 合并近似颜色；明确图案关键词仍可加载整理过的固定路线。不得以固定路线冒充任意图像识别。

## 工作规则
把直径、针距、填充间隔统一成mm，明确区分6mm与6cm。先确定轮廓、填充或两者，避免把轮廓任务变成密绣。
轨迹预览的一根实线必须是实际依次行走的路线；跨白区的连接线也会绣出，应在预览表达。减少剪线允许回走，但不能以改变几何形状的方式硬去重；圆闭合或回走存在必要重复时解释取舍。
当前太极填充线仅两端落针，曲线保留分针。保持眼睛、小点和叶脉，避免去噪删掉用户需要的细节。
最终预览、可编辑针点、JSON、BIN和串口输出应使用同一份PathSet；不能只修改展示。裁切需保留段的正确动作语义，不能把原本分开的线错误接起来。

## 验证与交付
使用真实 `pathExport.ts`、`deviceProtocol.ts` 编码，核对量化到0.01mm后的尺寸、落针顺序和重复针孔，动作缓存不超过4096。构建用 `E:/nodejs/npm.cmd run build`。
按任务做针对性检查，不擅自跑长时间FPGA仿真。交付预览、实际尺寸、针数、可见连接和数据文件；软件检查通过不等于实板效果已验证。仅规划路径不意味着授权发送或运动。

交付复用说明、适用范围和失效条件见 [README.md](README.md)。
