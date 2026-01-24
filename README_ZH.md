# Telegram MirroTalk Bot

[English](README.md) | [中文](README_ZH.md)

基于 Cloudflare Workers 的 Telegram 消息转发机器人，集成防骚扰和反诈骗功能。

## 功能特点

- **无服务器架构**：运行在 Cloudflare Workers 上，低成本且高可用。
- **消息转发**：将用户发送给机器人的消息转发给管理员。
- **防骚扰与反诈骗**：
  - **关键词过滤**：自动丢弃包含黑名单关键词（如 '刷单', '兼职', 'USDT'）的消息。
  - **媒体验证**：未验证用户无法发送媒体（图片、视频）。他们必须通过“我是真人”按钮验证后方可发送。
  - **消息去重**：防止 7 天内的重复消息。
  - **屏蔽/信任系统**：管理员可以屏蔽用户 (`/block`) 或将其加入白名单 (`/trust`)。

## 部署到 Cloudflare Workers

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/tanaer/Telegram_MirroTalk">
  <img src="https://camo.githubusercontent.com/aa3de9a0130879a84691a2286f5302105d5f3554c5d0af4e3f2f24174eeeea25/68747470733a2f2f6465706c6f792e776f726b6572732e636c6f7564666c6172652e636f6d2f627574746f6e" alt="Deploy to Cloudflare Workers" />
</a>

### 配置

需要以下环境变量（可以在 `wrangler.toml` 中填写或在部署时配置）：

- `ENV_BOT_TOKEN`: 你的 Telegram 机器人 Token (从 @BotFather 获取)。
- `ENV_BOT_SECRET`: 用于 Webhook 安全验证的随机字符串 (例如 UUID)。
- `ENV_ADMIN_UID`: 你的 Telegram 用户 ID (从 @userinfobot 获取)。
- `ENV_MAP_TTL_DAYS` (可选): 消息映射过期时间（天）。决定了你在多久之内可以回复用户的消息。默认为 7 天。

**KV 命名空间**：
你需要创建一个名为 `MirroTalk` 的 KV 命名空间并将其绑定到 Worker。

## 防骚扰功能详解

本机器人包含一套强大的防骚扰系统，旨在保护管理员免受垃圾信息和诈骗的侵扰：

1.  **关键词黑名单**：
    - 包含可疑关键词（如“兼职”、“刷单”、“USDT”、“色情”等）的消息会被静默丢弃。
    - 这过滤了绝大多数自动化的垃圾广告。

2.  **媒体限制**：
    - 默认情况下，陌生人只能发送文本消息。
    - 如果他们尝试发送图片或文件，会收到警告和一个验证按钮。
    - 只有点击“我是真人”并通过验证后，才允许发送媒体文件。这有效防止了机器人发送的垃圾图片。

3.  **暗屏蔽 (Shadowban)**：
    - 管理员可以使用 `/block` 指令对用户进行暗屏蔽。
    - 用户不会知道自己被屏蔽了，但他们的消息将不再被转发。

## Cloudflare 免费版限制与应对

Cloudflare Workers KV 免费套餐有以下主要限制：
1.  **存储空间**：1GB
2.  **写入操作**：每天 1000 次

本系统已针对这些限制进行了深度优化：
- **自动过期 (TTL)**：所有的消息映射记录都会在 7 天（默认）后自动删除。这确保了 KV 空间永远不会被无限占满。您可以通过 `ENV_MAP_TTL_DAYS` 环境变量调整此时间。
- **空间回收**：解除屏蔽 (`/unblock`) 和移除信任 (`/untrust`) 操作会直接从 KV 中**删除**数据，而不是标记为无效，从而释放空间。
- **写入节省**：通过消息去重和黑名单过滤，无效的垃圾消息不会触发 KV 写入操作，节省宝贵的每日写入额度。

**注意**：如果您的机器人每天需要处理超过 1000 条有效交互（转发+回复），建议升级 Cloudflare Workers 付费套餐（$5/月）。

## 安装指南

1.  **获取 Token**：从 @BotFather 获取你的 Bot Token。
2.  **获取 UID**：从 @username_to_id_bot 或类似机器人获取你的用户 ID。
3.  **部署**：点击上方的 "Deploy with Workers" 按钮。
4.  **绑定 KV**：在 Cloudflare 控制台，进入你的 Worker -> Settings -> Variables -> KV Namespace Bindings。添加一个变量名为 `MirroTalk` 的绑定，并创建一个新的命名空间。
5.  **设置 Webhook**：部署完成后，访问以下链接注册 Webhook：`https://你的-worker-子域名.workers.dev/registerWebhook`
