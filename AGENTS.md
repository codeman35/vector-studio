# Vector Studio 开发约定

纯前端开源 SVG 编辑器。图片描摹和本地项目无后台、无 CDN/API 密钥。0.4.0 经用户明确要求增加公开项目库：同源 GET 读取 GitHub 已发布的 JSON，用户在 GitHub 官方上传页面显式确认发布；不改成匿名后台上传或在页面存 Token。

## 开发与检查

- Node.js 22，无 npm 运行依赖。执行 `npm run check && npm test && npm run build`。
- 交互修改保留已有浏览器回归。browser-workspace 真实源覆盖 IndexedDB，browser-sharing 真实源/隔离上下文覆盖公共快照；注入模式不能冒充存储/网络测试。
- PSD 修改执行 scripts/verify-psd.py 独立解析，不等于 Photoshop 验收。
- dist 为生成物，只改 src、根 index 和 scripts。新增模块更新固定图构建器，验证 Worker 和脚本哈希；公共数据也从源构建，不手改索引。

## 模型与安全

- 项目格式 version 2，读取 version 1 无损迁移；groupId + groups 无环树，成员叠放连续，最多 16 层。群组不是布尔合并。
- 贝塞尔手柄相对锚点，单位 px；even-odd 真实孔洞。不用白块伪装。
- 保留预算、错误和一次撤销；删子轮廓不得修改剩余曲线。复杂几何不宣称无损生产引擎。
- 本地项目库 IndexedDB 保存失败不得继续丢弃文档，跨标签覆盖检查 revision。
- 公开发布独立于 Ctrl S；默认不包含原图，不自动迁移私人历史。发布前明确所有人可读、Git 历史可能保留，不能把下载待发布包称为已上传。
- 公共 JSON 必须经过白名单格式重建；无动态脚本/外域下载，禁止用户指定目录遍历路径。
- SVG 真路径；PSD RGB8/闭合纯色无描边实验子集，写 SoCo/vmsk/lsct 与预览，未经实测不宣称完整 Photoshop 兼容。
- AI/CDR/PDF/CMYK/专色未实现；不得改后缀或 PNG 分层冒充矢量。
- 不提交未授权客户图片、私人项目、密码、Token、.env。只有用户明确指定待公开的具体文件才代提交。外部依赖核查许可并固定版本。

## 协作与发布

- 小步提交、更新 CHANGELOG、记录真实测试和限制。
- main 的 Pages 工作流通过检查/单元/浏览器后部署，PR 不部署。
- 以真实 Actions 和实际线上结果为准，推送成功不等于上线成功。
