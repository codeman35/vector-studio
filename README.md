# 线境 · Vector Studio

开源、本地优先的图片轮廓描摹与 SVG 节点编辑器。当前版本 **0.1.1，功能预览版**，MIT 许可。

源码仓库：[codeman35/vector-studio](https://github.com/codeman35/vector-studio)。

在线入口：https://codeman35.github.io/vector-studio/ 。Pages 已开通；每次更新的线上版本以页面标识和对应 Actions 发布结果为准。

## 功能

粘贴或导入图片 → 本机描摹预览 → 确认生成 → 修改节点与贝塞尔手柄 → 切割、连接、合并 → 填色 → 保存项目 / 导出 SVG。

- PNG / JPEG / WebP / BMP：上传、拖入、粘贴。
- 黑白外轮廓和 2–16 色预览描摹、阈值、去杂点及轮廓简化。
- 参数变化后自动预览；原图叠加轮廓、矢量填色和原图对照。
- 对象和节点选择/移动、节点增删、曲线手柄、尖角与平滑。
- 钢笔折线、矩形、椭圆、有限线段刀切、单路径剪断、端点连接与闭合。
- 合并、相减、交集、独立区域拆分、透明镂空。
- 填色、描边、对象名称/显隐/锁定/叠放顺序、位置和尺寸。
- 撤销/重做、`.vstudio` 项目保存与重开、尽力而为的浏览器草稿。
- 导出真正的 SVG 路径（RGB、px、even-odd 孔洞），不嵌入参考图片。

**未实现：** VTracer、高质量自动曲线拟合、自由曲线小刀、任意线围区智能填色、通用 SVG 导入、矢量 PSD、原生 AI/CDR、PDF、CMYK/专色、移动端完整适配及离线重启缓存。不要把本版本用于未经检查的生产印前输出。

## 0.1.1：描摹预览与有限线段切割

导入图片后，右侧默认开启「实时预览」。调整参数后约 180 毫秒启动重新计算；运算本身还需要时间，复杂图片不保证每帧刷新。可以切换「原图 + 轮廓」「仅矢量填色」「仅原图对照」。只有点击「生成矢量轮廓」才写入正式图层并产生一次撤销记录；取消或切换图片会使旧任务失效。预览与应用使用相同的描摹分辨率。

小刀只沿鼠标按下位置到松开位置之间切割，不向两端延长。短线段不会切到延长线上的图形；在凹形内也只切实际经过的部分。闭合图形必须被线段贯穿才会分成独立区域；只划到内部或仅连通外轮廓与孔洞、但未分出两块时，不改动对象。剪断一条轮廓使用「剪断」工具。

新增回归脚本：`python scripts/browser-preview-cut.py`。默认测试打包的单文件 HTML；设置 `VS_TEST_URL` 可测试开发入口或已发布的 Pages 页面。测试范围和未验证项见 `docs/TEST-REPORT-0.1.1.md`。

## 首次发布（复制到其他仓库时操作一次）

本仓库已完成 Pages 首次开通，后续推送 `main` 会自动发布。复制到新仓库时：

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。不需要创建另一个工作流。
3. 打开 **Actions → Test and publish Pages**，点击 **Run workflow → main → Run workflow**。
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
python scripts/browser-preview-cut.py
```

## 目录与持续迭代

```text
index.html                    开发界面入口
src/app.js                    编辑交互与输入输出
src/document.js               文档模型、校验、历史与 SVG 输出
src/geometry.js               独立几何算法
src/trace.js                  可替换的预览描摹引擎
src/trace-worker.js           描摹线程入口
src/trace-preview.js          不写入项目的预览调度与显示
src/style.css                 界面样式
scripts/                      构建、开发服务及浏览器回归
tests/                        Node 单元测试
.github/workflows/pages.yml   自动测试与发布
AGENTS.md                     后续开发约定
docs/ROADMAP.md               功能路线
docs/TEST-REPORT.md           首版测试范围及未验证项
docs/TEST-REPORT-0.1.1.md      本次修复测试记录
```

修改源文件，不要把生成的 `dist/index.html` 当作长期源文件。每个缺陷补回归测试；功能变化同步更新 CHANGELOG。客户原图、私人项目和密钥不得提交到公开仓库。

## 实际算法与限制

当前是原生 JavaScript + SVG + Web Worker 的无依赖预览实现，不是 Paper.js / VTracer 集成版。描摹采用像素区域边界提取、确定性色彩量化与 RDP 简化，提取外轮廓而不是中心线。成熟引擎后续通过独立模块接入。

布尔运算和切割先按 **0.35 px 局部容差**将三次贝塞尔曲线展开为折线，再分类拼接边界；这个数值不是复杂拓扑、物理印刷尺寸或全链路误差保证。几何运算后节点可能增加，必须检查结果。

预算：导入图像最大边 1800 px，描摹最大边 1024 px；最多 1500 对象、50000 节点；几何运算展开后最多 3500 边，描摹最多 150000 边界边。复杂输入会被拒绝。当前不适合作为高分辨率生产母版的无损描摹工具。

## 隐私与安全

图像仅通过本机文件和剪贴板读取，无上传接口、外部 CDN 或第三方统计。`.vstudio` 与浏览器草稿可能包含参考原图，应按原图保密级别保管。清除网站数据会删除浏览器草稿；请主动保存项目文件。

项目导入使用白名单字段，不执行 SVG/XML/HTML。构建产物使用 CSP 脚本哈希、Blob Worker，不使用 `eval`。这些措施不等于已经完成专业安全审计。

## License

MIT，见 `LICENSE`。使用本工具不会自动取得第三方图片、字体或图案的授权。
