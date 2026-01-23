# Telegram MirroTalk Bot

[English](README.md) | [中文](README_ZH.md)

A Telegram message forwarding bot based on Cloudflare Workers, integrated with anti-harassment and anti-fraud features.

## Features

- **Serverless**: Runs on Cloudflare Workers, low cost and high availability.
- **Message Forwarding**: Forwards messages from users to the admin.
- **Anti-Harassment & Anti-Fraud**:
  - **Keyword Filtering**: Automatically drops messages containing blacklisted keywords (e.g., '刷单', '兼职', 'USDT').
  - **Media Verification**: Unverified users cannot send media (photos, videos). They must pass a "I am human" button verification.
  - **Deduplication**: Prevents duplicate messages within a 7-day period.
  - **Block/Trust System**: Admin can block users (`/block`) or add them to a whitelist (`/trust`).

## Deploy to Cloudflare Workers

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/tanaer/Telegram_MirroTalk">
  <img src="https://camo.githubusercontent.com/aa3de9a0130879a84691a2286f5302105d5f3554c5d0af4e3f2f24174eeeea25/68747470733a2f2f6465706c6f792e776f726b6572732e636c6f7564666c6172652e636f6d2f627574746f6e" alt="Deploy to Cloudflare Workers" />
</a>

### Configuration

The following environment variables are required (you can fill these in `wrangler.toml` or during deployment):

- `ENV_BOT_TOKEN`: Your Telegram Bot Token (from @BotFather).
- `ENV_BOT_SECRET`: A random secret string for webhook security (e.g. a UUID).
- `ENV_ADMIN_UID`: Your Telegram User ID (from @userinfobot).

**KV Namespace**:
You need to create a KV Namespace named `MirroTalk` and bind it to the worker.

## Anti-Harassment Functionality

This bot includes a robust anti-harassment system designed to protect the admin from spam and scams:

1.  **Keyword Blacklist**: 
    - Messages containing suspicious keywords (like "part-time job", "brushing", "USDT", "porn", etc.) are silently ignored.
    - This filters out the majority of automated spam.

2.  **Media Restriction**: 
    - By default, strangers can only send text messages.
    - If they try to send images or files, they receive a warning and a verification button.
    - Only after clicking "I am human" are they allowed to send media. This prevents bot-generated image spam.

3.  **Shadowban**: 
    - Admin can use `/block` to shadowban a user.
    - The user will not know they are blocked, but their messages will no longer be forwarded.

## Setup Instructions

1.  **Get Token**: Get your bot token from @BotFather.
2.  **Get UID**: Get your user ID from @username_to_id_bot or similar.
3.  **Deploy**: Click the "Deploy with Workers" button above.
4.  **Bind KV**: In Cloudflare Dashboard, go to your Worker -> Settings -> Variables -> KV Namespace Bindings. Add a binding with variable name `MirroTalk` and create a new namespace.
5.  **Set Webhook**: After deployment, register the webhook by visiting: `https://your-worker-subdomain.workers.dev/registerWebhook`
