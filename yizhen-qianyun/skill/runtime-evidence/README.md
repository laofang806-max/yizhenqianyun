# 实验与运行证据
适用范围：资源占用图、ModelSim波形、版本复现、响应延迟与持续运行数据的整理。
使用方法：`$runtime-evidence 用当前实现报告生成资源对照，核对固件哈希，整理通信长稳实验记录。`
离线命令：`python scripts/evidence_check.py --timing <timing.rpt> --manifest <sha256.json> --root <交付目录>`；两个输入可单独使用，结果输出JSON，输入缺失/哈希不符/时序负裕量返回非零。
清单格式：`{"files":{"source/top.v":"64位SHA256","design.bit":"64位SHA256"}}`。只填真实文件，不允许越出root。
失效条件：未约束IO、旧bit与新报告混用、无原始日志、超时样本被排除、短时模拟被表述为实板长稳。此时明确缺项，不给“稳定运行通过”的结论。
已验证案例：color-reset-stability-20261031实际timing报告WNS=0.747ns、WHS=0.100ns；仍存在外设IO延迟等约束覆盖问题，不能仅凭正裕量认定全部接口时序完成。现有tb_layer_reset_probe/tb_motion_feedback/tb_needle_led日志可追溯；模拟浏览器报告始终单独标注。
未验证：本技能包不包含新增长时间实板实验结论，模板不填假数据。时间长度、负载和可接受阈值应随实验目标事先确定。
