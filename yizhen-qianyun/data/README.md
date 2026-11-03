# 数据与参考

data/ml/training-images 是此次真实训练的 8 张增强图与 1 张诊断花图。
原始输入在 src/upper/src/assets，针序在 src/upper/src/data，图案导出样例在 src/upper/public/presets。
report/ml 保存真实 loss CSV、配置、性能测量和图片，sim/reference 保存真实 RTL 日志。
上位机可导出抓包日志、持续响应统计、针迹 JSON/BIN；未在本包虚构实板长时间运行数据。
