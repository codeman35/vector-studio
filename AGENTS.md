# Vector Studio 开发约定

纯前端开源 SVG 编辑器。运行时无后台，不上传图片，无 CDN/API 密钥。未经用户同意不改变架构。

## 开发与检查

- Node.js 22，无 npm 运行依赖。修改执行 `npm run check && npm test && npm run build`。
- 交互修改运行 browser-smoke、browser-interaction 和 browser-workspace 回归；后者的真实源模式覆盖 IndexedDB，注入模式不能冒充持久化测试。
- PSD 修改执行 scripts/verify-psd.py 独立解析，不等于 Photoshop 验收。
- dist 为生成物，只改 src、根 index 和 scripts。新增模块更新固定图构建器，验证脚本哈希。

## 模型与安全

- 项目格式 version 2，读取 version 1 必须无损迁移；groupId + groups 无环树，成员叠放连续，最多 16 层。群组不是布尔合并。
- 贝塞尔手柄相对锚点，单位 px；even-odd 真实孔洞，不用白块伪装。
- 保留预算、错误和撤销；几何修复补复现测试，不把折线近似称为无损生产引擎。
- 项目库使用本浏览器 IndexedDB；保存失败不能继续丢弃文档，跨标签覆盖检查 revision。
- SVG 是真路径；PSD 是 RGB8/闭合纯色无描边的实验子集，写 SoCo/vmsk/lsct，同时提供预览。未经 Photoshop 实测不得宣称完整兼容。
- AI/CDR/PDF/CMYK/专色未实现；不得改后缀或 PNG 分层冒充矢量。
- 不提交客户图片、私人项目、密码、Token、.env。外部依赖核查许可并固定版本。保留 MIT 告知。

## 协作与发布

- 小步提交、更新 CHANGELOG、记录测试和限制。
- main 的 Pages 工作流通过检查/单元/浏览器测试后部署，PR 不部署。首次开通需仓库所有者选择 GitHub Actions。
- 以真实 Actions 和实际线上结果为准，推送成功不等于上线成功。
