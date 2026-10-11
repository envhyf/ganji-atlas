# 赶集志

查看附近集市、赶场与赶圩日期的轻量地图网站，适配桌面和手机。

## 功能

- 搜索地名、地图选点与附近半径筛选。
- 当日有集地点、附近七日集历和五周集历。
- 省、市、县分级标注，集市简称与完整场期详情。
- 通过地址中的坐标与半径分享选定位置。

## 本地预览

```sh
python -m http.server 8765 --directory site
```

打开 http://127.0.0.1:8765/ 。前端不需要 API 密钥或数据库。

## 发布

仓库 Settings → Pages → Source 选择 GitHub Actions。推送 main 后，工作流检查网站并发布 site/ 目录；也可手动触发工作流。

项目站点可部署在 /ganji-atlas/ 子路径，前端资源使用相对路径。

## 数据更新

采集与定位脚本在 pipeline/，运行说明见 docs/province-expansion.md。安装 requirements.txt 后，原始场期资料采集可断点续跑；高德密钥只放本地 .amap_key 或 AMAP_KEY 环境变量中。

处理完成后运行 pipeline/export_china.py，检查 site/data/ 中的导出文件，再提交网站数据。原始下载缓存、任务日志、定位缓存和密钥不纳入版本管理。

## 数据说明

场期来自圩日表，行政边界来自阿里云 DataV，乡镇参考坐标来自高德。各地收录进度不同；场期和集市入口需出发前向当地确认。第三方数据的权利归原提供者，本仓库不另行授予第三方数据许可。

## 检查

```sh
node --test tests/map-view.test.mjs tests/region.test.mjs tests/place-name.test.mjs
python -m unittest discover -s tests -p "test_*.py"
```
