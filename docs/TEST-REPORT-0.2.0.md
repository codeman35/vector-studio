# 0.2.0 验证范围

2026-09-24；开发环境 Linux/Node.js 22/Chromium。

## 本地执行

- check、build、可用的 35 项单元测试通过：包含 19 项新增群组/迁移/命令状态/PSD 二进制测试。远程另保留 0.1.1 的 13 项有限切割回归，由云端完整执行。
- browser-smoke.py、browser-interaction.py、browser-workspace.py 注入模式通过。覆盖双击、Ctrl 加点/Alt 删点、群组/解组/撤销/复制/整体移动、真实缩略图、右键操作、预览前禁用、SVG 群组和 PSD 输出。
- 本地导航被环境策略拦截，未在本地声称验证 IndexedDB 持久化；注入模式明确跳过保存/重载/多标签页测试，只验证存储失败不能丢弃未保存画布。
- Pillow 独立打开生成 PSD，正确读取 RGBA 预览和透明区域；二进制测试检查 SoCo、vmsk、lsct、Unicode 名称、通道长度和贝塞尔坐标。不能据此声称 Photoshop 应用兼容。

## 云端发布门槛

pages.yml 加入真实 HTTPS 测试源（响应由 Playwright 本地拦截，不访问外站）的 browser-workspace.py：项目保存、取消/放弃/保存后切换、重载持久化、多标签页冲突、全部新增编辑交互和导出。独立 psd-tools 解析检查纯色填充、矢量蒙版、孔洞和群组层级。

只有 CI 成功才进入 deploy；实际通过与否以对应提交的 Actions 日志为准，不把本文件的测试计划当成完成记录。

## 尚未验收

Windows/Photoshop/Illustrator/CorelDRAW 实机、真实系统剪贴板权限、所有复杂 PSD 解析器、隐身/低磁盘/浏览器数据回收、多种显示缩放及大规模节点交互。原生 AI/CDR/PDF 和 CMYK/专色尚未实现。PSD 是主动勾选启用的受限实验功能。
