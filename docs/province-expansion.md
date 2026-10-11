# 诸省采集与地图导出

在项目根目录运行以下两个任务。它们可同时运行；同一任务有文件锁，避免重复写入。

```powershell
.\.venv\Scripts\python.exe -B -u pipeline\crawl_rules.py
```

此命令按原有省份顺序采集全国圩期。已成功保存的乡镇会跳过，失败记录在下次运行时重试。每条记录立即保存，Ctrl+C 后重跑即可继续。

```powershell
.\.venv\Scripts\python.exe -B -u pipeline\expand_ready.py
```

此命令等待圩期采集完整的省份，按县定位，并导出地图数据。每完成一县保存断点，每完成一省更新网站。高德配额用尽时，保存断点并导出已有结果后停止；配额恢复后重跑此命令。圩期采集继续运行。

## 当前后台任务

- 圩期日志：`data/jobs/rules-v3.log`
- 定位日志：`data/jobs/locations-v4.log`
- 圩期状态：`data/crawl_progress.json`
- 定位状态：`data/expansion_progress.json`

`crawl_progress.json` 的 `remaining` 为最近一次检查点的数据，每 100 条或省份结束更新；实际已保存数量以 `markets.jsonl` 为准。

## 边界处理

先修复源多边形，再保留拓扑简化；县界合并成线网，避免共边重复描画。局部地图显示县界时隐藏粗略省界，防止不同简化精度的边缘交叉。省级县界图层同时保留，加载下一省不会清空上一省。

```powershell
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -p 'test_*.py'
```

## 四川 HTTPS 故障修复

2026-10-10：www 域名的 TLS 虚拟主机返回了 95ip.com 证书，裸域名的 TLS 虚拟主机返回覆盖 www.xuribiao.com 的有效证书。采集器在原连接证书失败时，使用裸域名建立 TLS 连接，仍以 www.xuribiao.com 校验证书并发送 HTTP Host。保持 CERT_REQUIRED 与 CA 校验，不接受错误证书，不修改系统 DNS。缓存键不变，历史失败记录在重跑时重新尝试。已实测四川条目 7291、7585、7600 并成功解析圩期。
