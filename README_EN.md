# Telegram MirroTalk Bot

[English](README_EN.md) | [中文](README.md)

基于 Cloudflare Workers 的 Telegram 消息转发机器人，集成防骚扰和反诈骗功能。

| 未验证用户联系你，要求验证                                   | 实际不会收到图片                               |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| <img width="381" height="192" alt="image" src="https://github.com/user-attachments/assets/74b987f1-61b1-472c-be8f-cf46562ceb46" />| <img width="200" height="500" alt="image" src="https://github.com/user-attachments/assets/759301be-b1a3-4fcb-a263-22cccca83e46" /> |







## 功能特点

- **无服务器架构**：运行在 Cloudflare Workers 上，低成本且高可用。
- **双向消息转发**：将用户发送给机器人的消息转发给管理员,管理员回复信息再转回给用户。
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

- `ENV_BOT_TOKEN`: Your Telegram Bot Token (from @BotFather).
- `ENV_BOT_SECRET`: A random string for Webhook security (e.g., UUID).
- `ENV_ADMIN_UID`: Your Telegram User ID (from @userinfobot). Used for receiving admin notifications.
- `ENV_SUPERGROUP_ID`: The ID of the Supergroup where the bot will create topics (starts with `-100`). Required only if `ENV_ENABLE_TOPIC_GROUP` is `true`.
- `ENV_ENABLE_TOPIC_GROUP` (Optional): Set to `true` to enable Topic Group mode. Default is `false` (Private Chat mode).
- `ENV_MAP_TTL_DAYS` (Optional): Message mapping expiration time in days. Default is 7 days.

**KV Namespace**:
You need to create a KV namespace named `MirroTalk` and bind it to the Worker.

## Operating Modes

### 1. Private Chat Mode (Default)
The bot forwards user messages directly to the admin's private chat (`ENV_ADMIN_UID`).
- **Setup**: Just set `ENV_BOT_TOKEN`, `ENV_BOT_SECRET`, and `ENV_ADMIN_UID`.
- **Usage**: Reply to the forwarded message to send a response back to the user.

### 2. Topic Group Mode (Recommended for high volume)
The bot creates a separate **Forum Topic** for each user in a Supergroup. This keeps conversations organized.

**Setup Instructions:**
1.  **Environment Variables**:
    - Set `ENV_ENABLE_TOPIC_GROUP` to `true`.
    - Set `ENV_SUPERGROUP_ID` to your group ID (e.g., `-100xxxxxxx`).

2.  **Telegram Group Setup**:
    - Create a new Group (or use an existing one).
    - Add the bot to the group and promote it to **Administrator**.
    - **Crucial**: The bot must have **"Manage Topics"** permission.
    - Enable **Topics** in Group Settings:
      - Go to Group Info -> Edit -> Topics -> Enable.
      - *Note: This converts the group to a Supergroup.*

3.  **Get Group ID**:
    - Add `@username_to_id_bot` to your group, it will tell you the ID.
    - Or open the group in Telegram Web, the URL will contain the ID (e.g., `#/-100123456789`).

## Anti-Spam Features

This bot includes a powerful anti-spam system designed to protect admins from spam and scams:

1.  **Keyword Blacklist**:
    - Messages containing suspicious keywords (e.g., 'scam', 'USDT', 'porn') are silently discarded.

2.  **Verification Challenge (Math)**:
    - Unverified users must solve a dynamic math problem (e.g., `3 + 5 = ?`) to prove they are human.
    - Questions are generated dynamically to prevent replay attacks.

3.  **Security Levels**:
    - Admins can toggle security levels via `/admin` menu:
      - **Strict**: Unverified users cannot send anything.
      - **Standard**: Unverified users can send text but NO media.
      - **Relaxed**: No verification required.

4.  **Shadowban**:
    - Admins can shadowban users using `/block`.
    - Users won't know they are blocked, but their messages are dropped.

## Admin Commands

Send `/admin` in the Supergroup to see the control panel:

- **/info**: View user info in a topic.
- **/trust**: Permanently trust a user (skip verification).
- **/block**: Shadowban a user.
- **/unblock**: Unban a user.
- **/broadcast**: Reply to a message to broadcast it to all users.
- **/security <1|2|3>**: Set security level.

## Cloudflare Free Tier Limitations & Optimizations

The Cloudflare Workers KV free tier has specific limits:
1.  **Storage**: 1GB
2.  **Write Operations**: 1,000 per day

This system is optimized to handle these limits:
- **Auto-Expiration (TTL)**: All message mapping records automatically expire after 7 days (default). This ensures KV storage is never permanently filled. You can adjust this via the `ENV_MAP_TTL_DAYS` environment variable.
- **Space Reclamation**: Unblocking (`/unblock`) and untrusting (`/untrust`) operations directly **delete** data from KV instead of marking it as invalid, freeing up space immediately.
- **Write Conservation**: Deduplication and blacklist filtering prevent spam from triggering KV write operations, saving your daily write quota.

**Note**: If your bot processes more than 1,000 valid interactions (forwards + replies) per day, we recommend upgrading to the Cloudflare Workers Paid Plan ($5/mo).

## Setup Instructions

1.  **Get Token**: Get your bot token from @BotFather.
2.  **Get UID**:
    *   **Method A (Recommended)**: Before deployment, fill in a dummy UID (e.g., `123`) and deploy. Then send `/start` to your bot, and it will reply with your real UID.
    *   **Method B**: Get your user ID from a third-party bot like @username_to_id_bot.
3.  **Deploy**: Click the "Deploy with Workers" button above.
4.  **绑定 KV**：在 Cloudflare 控制台，进入你的 Worker -> Settings -> Variables -> KV Namespace Bindings。添加一个变量名为 `MirroTalk` 的绑定，并创建一个新的命名空间。
5.  **设置 Webhook**：部署完成后，访问以下链接注册 Webhook：`https://你的-worker-子域名.workers.dev/registerWebhook`
