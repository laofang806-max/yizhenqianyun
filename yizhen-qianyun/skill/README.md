# 湘绣FPGA技能包（2026-10-31修订）
本目录按提交要求命名为skill/。它沉淀真实工程协作经验，包含提示词工作流、校验脚本、实验模板和踩坑清单，不是训练后的模型权重。

| 技能 | 适用场景 |
|---|---|
| embroidery-path | 连续走线、填充、尺寸与针孔处理 |
| artwork-route | 花鸟/单鸟/花/太极固定路线维护 |
| embroidery-protocol-check | UART结构、坐标和标准JSON核对 |
| embroidery-startup | 网站、真实相机桥接和端口排查 |
| fpga-build | 当前RTL构建、资源、时序与版本交付 |
| motion-calibration | 单轴小行程标定与反馈诊断 |
| color-layer-workflow | 彩色近似色合并、白底忽略、逐层换线 |
| runtime-evidence | 真实波形、资源与持续响应证据整理 |

每项SKILL.md为助手入口，README.md说明使用方法、失效条件和经验来源；agents/openai.yaml为Codex显示信息。scripts均为离线检查/只读助手，不自动下载或启动电机。

## 复用方法
将需要的技能目录复制到自己的Codex skills目录，新会话可用`$技能名`；其他助手可直接读取SKILL.md。无需复制全部八项。
现有路径E:/AMD_COMPETITION/Control与工具路径是本机实例；先映射项目根目录、查找实际入口并核对器件/协议。当前器件Artix-7 XC7A100T，无板载ARM PS；不能将PC端叫板载PS或宣称已接入PYNQ Overlay。
不要复制.env.local、登录密码、浏览器cookie或整个node_modules。目录内案例是说明与结构检查样本，不是实板抓包。

## 可复现验证
使用Python 3.9或更新版本，运行`python validate_package.py`：检查技能frontmatter、相对引用、UART有效/无效案例、计数换算、哈希篡改拒绝、报告解析。结果写validation.json；脚本不运行Vivado、不访问设备。
使用runtime-evidence/templates/experiment.md记录自己的实验。填写证据类型、实际输入/输出、原始日志和未验证项，不能把本机结果迁移成另一个工程的通过结论。
当前已验证结果见validation.json；实际工程历史证据与限制见各技能README。长时间实板稳定性仍需真实采集。

## 本交付目录的路径映射

本包根目录为 yizhen-qianyun。旧 Control/AMD_fpga → src/upper；
Control/host → src/host；最终 fpga - 副本 RTL → src/rtl；XDC → board/constraints。
当前构建入口是 build/build.tcl，测试入口是 sim/run.ps1，不依赖旧 XPR。
模型入口是 src/ml。技能中的开发机盘符和旧 bit 报告是经验来源，执行时必须按此映射。
最终固件自动下针反馈启用；不要切换到原 fpga 旧版本，也不要用旧固件替代。
