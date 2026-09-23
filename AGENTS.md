# Vector Studio 开发约定

这是纯前端开源 SVG 编辑器。运行时无后台，不上传图片、不依赖外部 CDN，不要求用户提供 API 密钥。未经用户同意，不改变这个架构。

## 开发与检查

- Node.js 22；当前无 npm 依赖。
- 修改后执行 `npm run check && npm test && npm run build`。
- 修改交互时执行 `python scripts/browser-smoke.py` 和 `python scripts/browser-interaction.py`（需要 Playwright / Chromium），或记录无法执行的具体原因。
- `dist/` 是生成物；修改 `src/`、根目录 `index.html` 和构建脚本，不直接维护生成 HTML。
- 构建器处理固定 ES 模块图；新增模块或导出形式时同步修改 `scripts/build.mjs` 并验证开发入口和打包入口。

## 数据与几何

- 项目格式是 `vector-studio` version 1；更改格式需要向后迁移。
- 贝塞尔 `in` / `out` 手柄相对锚点存储，单位是画板 px。
- 孔洞通过 even-odd 填充表达，不能用白色色块伪装透明。
- 保留几何预算、失败提示和撤销能力；每个几何修复添加最小复现测试。
- 不把折线近似或当前预览描摹宣传为无损/生产级引擎。

## 输出和安全

- SVG 导出是真路径，不嵌入原图；`.vstudio` 才包含参考图。
- PSD / AI / CDR 尚未实现，不能改扩展名冒充，也不能把 PNG 分层说成矢量 PSD。
- 不提交客户图片、私人 `.vstudio`、密码、Token、`.env`、外部未授权素材。
- 新依赖先核查许可、锁定版本和本地打包方式，保留 MIT 许可告知。

## 协作和发布

- 小步提交，更新 CHANGELOG；缺陷与需求通过 Issues / PR 记录。
- `main` 的 Pages 工作流负责检查、构建、部署。PR 不部署。
- 首次启用 Pages 需仓库所有者在 Settings → Pages 选择 GitHub Actions。
- 以真实 Actions 结果和实际网址为准，不能把“推送成功”当作“上线成功”。
