# 线境 · Vector Studio

开源、本地优先的图片轮廓描摹与 SVG 节点编辑器。当前版本 **0.1.0，功能预览版**，MIT 许可。

源码仓库：[codeman35/vector-studio](https://github.com/codeman35/vector-studio)。

网站预定地址：https://codeman35.github.io/vector-studio/ 。**首次启用 Pages 并成功部署后才可访问；有地址不等于已上线。实际状态以仓库 Actions 和 Settings → Pages 为准。**

## 功能

粘贴或导入图片 → 本机描摹 → 修改节点与贝塞尔手柄 → 切割、连接、合并 → 填色 → 保存项目 / 导出 SVG。

- PNG / JPEG / WebP / BMP：上传、拖入、粘贴。
- 黑白外轮廓和 2–16 色预览描摹、阈值、去杂点及轮廓简化。
- 对象和节点选择/移动、节点增删、曲线手柄、尖角与平滑。
- 钢笔折线、矩形、椭圆、直线刀切、单路径剪断、端点连接与闭合。
- 合并、相减、交集、独立区域拆分、透明镂空。
- 填色、描边、对象名称/显隐/锁定/叠放顺序、位置和尺寸。
- 撤销/重做、`.vstudio` 项目保存与重开、尽力而为的浏览器草稿。
- 导出真正的 SVG 路径（RGB、px、even-odd 孔洞），不嵌入参考图片。

**未实现：** VTracer、高质量自动曲线拟合、自由曲线小刀、任意线围区智能填色、通用 SVG 导入、矢量 PSD、原生 AI/CDR、PDF、CMYK/专色、移动端完整适配及离线重启缓存。不要把本版本用于未经检查的生产印前输出。

## 首次发布（仓库所有者操作一次）

1. 打开 [Pages 设置](https://github.com/codeman35/vector-studio/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。不需要创建另一个工作流。
3. 打开 [发布工作流](https://github.com/codeman35/vector-studio/actions/workflows/pages.yml)，点击 **Run workflow → main → Run workflow**。
4. 构建和部署成功后，在 **Settings → Pages → Visit site** 打开网站。

若首次工作流的 `build` 成功而 `deploy` 提示 `Get Pages site failed` 或 404，通常是尚未启用 Pages。完成第 2 步后重新运行即可。首次启用 Pages 不是单纯上传代码自动完成的。

以后推送 `main` 会自动执行：语法检查 → 单元测试 → 构建单文件 HTML → 发布。PR 只检查和构建，不发布。工作流使用 GitHub 自动提供的临时令牌，不需要把个人 Token 放进代码、聊天或仓库。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 本机开发

开发机使用 Node.js 22；当前无 npm 依赖，不需要 `npm install`。

```sh
npm start          # 仅开发时使用的本机静态服务
npm run check
npm test
npm run build      # 生成 dist/index.html
```

网站使用者不需要 Node.js、服务器或账号。生成的 `dist/index.html` 包含全部界面和计算逻辑，可单文件试用；根目录 `index.html` 是开发入口，使用 ES 模块，需通过 HTTP 服务打开。不要混淆两者。

可选浏览器测试（开发机需要 Python Playwright 和 Chromium）：

```sh
python scripts/browser-smoke.py
python scripts/browser-interaction.py
```

## 目录与持续迭代

```text
index.html                    开发界面入口
src/app.js                    编辑交互与输入输出
src/document.js               文档模型、校验、历史与 SVG 输出
src/geometry.js               独立几何算法
src/trace.js                  可替换的预览描摹引擎
src/trace-worker.js           描摹线程入口
src/style.css                 界面样式
scripts/                      构建、开发服务及浏览器回归
tests/                        Node 单元测试
.github/workflows/pages.yml   自动测试与发布
AGENTS.md                     后续开发约定
docs/ROADMAP.md               功能路线
docs/TEST-REPORT.md           测试范围及未验证项
```

修改源文件，不要把生成的 `dist/index.html` 当作长期源文件。每个缺陷补回归测试；功能变化同步更新 CHANGELOG。客户原图、私人项目和密钥不得提交到公开仓库。

## 实际算法与限制

当前是原生 JavaScript + SVG + Web Worker 的无依赖预览实现，不是 Paper.js / VTracer 集成版。描摹采用像素区域边界提取、确定性色彩量化与 RDP 简化，提取外轮廓而不是中心线。成熟引擎后续通过独立模块接入。

布尔运算先按 **0.35 px 局部容差**将三次贝塞尔曲线展开为折线，再分类拼接边界；这个数值不是复杂拓扑、物理印刷尺寸或全链路误差保证。几何运算后节点可能增加，必须检查结果。

预算：导入图像最大边 1800 px，描摹最大边 1024 px；最多 1500 对象、50000 节点；几何运算展开后最多 3500 边，描摹最多 150000 边界边。复杂输入会被拒绝。当前不适合作为高分辨率生产母版的无损描摹工具。

## 隐私与安全

图像仅通过本机文件和剪贴板读取，无上传接口、外部 CDN 或第三方统计。`.vstudio` 与浏览器草稿可能包含参考原图，应按原图保密级别保管。清除网站数据会删除浏览器草稿；请主动保存项目文件。

项目导入使用白名单字段，不执行 SVG/XML/HTML。构建产物使用 CSP 脚本哈希、Blob Worker，不使用 `eval`。这些措施不等于已经完成专业安全审计。

## License

MIT，见 `LICENSE`。使用本工具不会自动取得第三方图片、字体或图案的授权。
