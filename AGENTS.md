# pod-lark-minutes 项目指南

## 项目定位

`pod-lark-minutes` 是一个本地 Node.js CLI，用于把播客或媒体 URL 转成飞书/Lark 妙记链接。当前项目保持单一主流程：

```text
podcast/media URL -> local audio -> temporary Feishu/Lark Drive file -> Feishu/Lark Minutes
```

CLI 自身只负责解析音频来源、下载音频、把飞书/Lark 云空间作为必需的临时上传层并创建妙记；转写、智能总结和妙记内容处理由飞书/Lark 妙记侧完成。

当前 MVP 不要求把飞书/Lark 妙记里的转写稿或智能摘要拉回本地文件。除非需求明确变化，不要把本地转写、摘要生成或妙记内容同步作为默认方向。

## 当前实现入口

- CLI 入口：`bin/pod-lark-minutes.js`
- 包配置：`package.json`
- 单元测试：`test/resolve.test.js`
- 使用说明：`README.md`
- 协作说明：`CONTRIBUTING.md`

## 已支持能力

| 能力 | 当前状态 | 代码入口 |
| --- | --- | --- |
| 小宇宙单集页解析 | 通过 `og:audio` 解析音频地址 | `resolveMedia()` |
| 直链音频下载 | 支持 `.m4a`、`.mp3`、`.aac`、`.wav`、`.ogg` 等 URL | `isDirectAudioUrl()` |
| RSS 解析 | 基础支持首个 `<enclosure url="...">` | `resolveMedia()` |
| 本地音频下载 | 根据响应 `content-type` 或 URL 扩展名确定文件后缀 | `downloadMedia()` |
| 飞书云空间上传 | 通过 `lark-cli drive +upload` 获取 `file_token` | `uploadToDrive()` |
| 飞书妙记创建 | 通过 `lark-cli minutes +upload` 获取 `minute_url` | `createMinute()` |
| 飞书云空间清理 | 妙记创建成功后默认删除临时 Drive 音频文件 | `deleteDriveFile()` |
| 运行记录 | 写入 `pod-lark-minutes-output/runs/<run-id>.json` | `writeRunMetadata()` |

## 边界与约束

- 保持 CLI 聚焦在“解析和上传音频”链路，不在本仓库内实现转写、摘要、妙记内容编辑或平台侧能力。
- 项目名称使用 `pod-lark-minutes`，不要恢复或复用旧名称 `pod2miao`。
- 新增来源解析器时，应复用 `resolveMedia()` 当前返回结构：`sourceUrl`、`mediaUrl`、`title`、`description`、`resolver`。
- 解析逻辑应优先使用可测试、无网络依赖的 fixture 覆盖；避免把平台页面的临时 HTML 结构写成不可维护的强耦合逻辑。
- 上传链路依赖本机 `lark-cli`、飞书/Lark 用户授权和相关权限 scope；本地单元测试不应强依赖真实飞书环境。
- `lark-cli minutes +upload` 只接受已上传到云空间的 `file_token`；Drive 文件在本项目中是临时中转文件，妙记创建成功后默认删除。
- 仅当用户显式要求保留云空间原音频时使用 `--keep-drive-file`。
- 默认输出目录是 `pod-lark-minutes-output/`，该目录已在 `.gitignore` 中忽略。
- `.env`、`.env.*`、本地音频、运行输出和日志不应提交。不要在公开文档、测试 fixture 或提交记录中记录飞书/Lark token、auth URL、内部妙记链接、内部文件 token 或个人账号信息。

## 上传链路

飞书/Lark 侧当前通过 `lark-cli` 完成两步上传：

```text
local audio -> lark-cli drive +upload -> file_token -> lark-cli minutes +upload -> minute_url -> drive +delete
```

`file_token` 只用于创建妙记，不应写入公开文档。已通过真实样本验证：妙记创建成功后删除 Drive 原始音频，妙记基础信息与媒体下载 URL 仍可访问。后续改动若调整清理语义，需要重新验证真实链路。

## 验证方式

实现或修改后优先运行：

```bash
npm run check
npm test
```

涉及来源解析时，优先补充网络无关的单元测试。涉及真实上传时，先使用 `--audio-only` 验证解析和下载，再在 `lark-cli` 授权可用时验证完整链路：

```bash
node bin/pod-lark-minutes.js "<url>" --audio-only
node bin/pod-lark-minutes.js "<url>"
```

如果烟测下载了音频，验证完成后删除生成的音频文件，只保留必要的运行元数据。涉及完整上传链路时，确认本机 `lark-cli` 已完成用户授权，并避免在日志和文档里暴露敏感返回值。

## 后续方向

| 方向 | 处理原则 |
| --- | --- |
| 仅解析不下载 | 可以考虑增加 `--dry-run` 或 `resolve` 命令，用于查看媒体元数据 |
| 新增来源平台 | 先用真实页面或 fixture 验证解析方式，再纳入支持范围 |
| 云空间文件清理 | 默认删除临时 Drive 音频；保留行为通过 `--keep-drive-file` 显式启用 |
| npm 发布 | 发布前确认 README 语言策略、包名可用性和公开说明范围 |
| 完整上传测试 | 不提交下载音频、飞书/Lark token、内部链接或个人身份信息 |
