# 0.1.0 本地验证记录

日期：2026-09-23。

## 实际执行

- Linux 环境、Node.js v22.16.0。
- `npm run check`：通过。
- `npm test`：16/16 通过。
- `npm run build`：通过，生成约 99.5 KB 的自包含 HTML。
- Python Playwright + 本机 Chromium：两组浏览器回归通过，无 `pageerror`。

## 浏览器验证方法

当前环境的浏览器策略禁止 URL 导航。因此测试通过 Playwright `page.set_content` 注入**实际构建产物**，没有修改或放宽浏览器管理策略。脚本哈希 CSP 保持启用，描摹使用真实 Blob Web Worker，并非用假的返回数据代替。

由此验证的是：生成页面在 Chromium 中的真实渲染、鼠标/键盘操作、Worker 计算、文件输入/输出逻辑；不是对 localhost 导航、GitHub Pages 访问、Windows 文件双击行为或全部浏览器兼容性的验证。

## 已覆盖

第一组浏览器回归：加载单文件页面、打开矢量示例、拖动真实节点、撤销、下载 SVG 并检查无参考图片、导入自制光栅示例、Worker 描摹出两个对象及透明孔洞、保存 `.vstudio`、通过文件控件重开并检查数据。

第二组浏览器回归：通过项目文件输入两个矩形、Shift/全选逻辑、合并、撤销重做、直线刀切、独立填色、增删节点、剪断路径、矩形绘制、合成剪贴板事件导入、少色 Worker 重新描摹及替换旧结果。

16 个 Node 测试包含：构建 CSP 哈希、无外部资源、矩形布尔运算、重合/共边/点接触、孔洞、带孔区域刀切、外部刀线、嵌套岛屿、贝塞尔插点形状保持、撤销分支、输入校验、SVG 透明输出、黑白镂空、透明图、保留封闭白色、对角像素边界。

## 尚未验证，不能宣称已通过

- 用户 GitHub 账户权限、仓库创建、Actions 运行及实际 Pages 网站地址。
- Windows Edge/Chrome、Safari、Firefox 的实机测试。
- 真实操作系统剪贴板授权（测试覆盖的是模拟剪贴板事件）。
- URL 源下的 IndexedDB 草稿恢复、存储配额和浏览器清理行为。
- 复杂书法照片、高分辨率扫描、大量自交轮廓、极小间隙的生产可靠性。
- Illustrator/CorelDRAW/Photoshop 兼容性及原生格式输出。

## 回归命令

```sh
npm run check
npm test
npm run build
python scripts/browser-smoke.py
python scripts/browser-interaction.py
```

最后两项仅为可选开发测试，需 Python Playwright 和 Chromium；这不是普通使用者的运行依赖。
