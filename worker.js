const TOKEN = ENV_BOT_TOKEN; // Get it from @BotFather
const WEBHOOK = '/endpoint';
const SECRET = ENV_BOT_SECRET;
const ADMIN_UID = ENV_ADMIN_UID; // 管理员的用户 ID (用于接收私聊通知/指令)
// 模式开关: 是否开启群组话题模式
const ENABLE_TOPIC_GROUP = (typeof ENV_ENABLE_TOPIC_GROUP !== 'undefined') && (ENV_ENABLE_TOPIC_GROUP === 'true');
// 如果开启了话题模式，则必须配置 SUPERGROUP_ID
const SUPERGROUP_ID = (typeof ENV_SUPERGROUP_ID !== 'undefined') ? ENV_SUPERGROUP_ID : ''; 

// 注意：请确保机器人已加入 SUPERGROUP_ID 群组，并拥有 "Manage Topics" (管理话题) 权限。
// SUPERGROUP_ID 必须是超级群组 (开启了 Topics 功能)。

const NOTIFY_INTERVAL = 3600 * 1000;

// --- 配置区域 ---
// 1. 黑名单关键词 (命中即静默丢弃)
const BLACKLIST_KEYWORDS = [
  '炸鱼', '微信', '加我', '兼职', '刷单', '日结',
  '裸聊', '同城', 'av', '博彩', 'USDT', '跑分'
];

// 2. 消息去重过期时间 (秒)，默认7天。
const DEDUPE_TTL = 7 * 24 * 3600;

// 3. 话题/用户映射 TTL (秒)，默认永久(或很久)，因为话题是持久的
// 但为了节省空间，可以设为 30 天无活跃则过期? 暂时设为 0 (永久) 或跟 KV 策略一致
// worker_demo.js 似乎没有明确设置过期，我们这里也不设，或者设长一点。

// 4. 验证状态过期时间 (秒)，默认 30 天
const VERIFIED_TTL = 30 * 24 * 3600;

// 安全级别定义
const SECURITY_STRICT = 1;   // 未验证 -> 不转发任何信息
const SECURITY_STANDARD = 2; // 未验证 -> 可发文字，不可发媒体 (默认)
const SECURITY_RELAXED = 3;  // 未验证 -> 可发图文视频 (无需验证)

// 默认安全级别
const DEFAULT_SECURITY_LEVEL = SECURITY_STANDARD;

// --- 动态题库生成 (数学题) ---
function generateMathChallenge() {
  const isAddition = secureRandomInt(0, 2) === 0;
  let num1 = secureRandomInt(1, 10);
  let num2 = secureRandomInt(1, 10);
  
  let questionText = "";
  let answer = 0;
  
  if (isAddition) {
      questionText = `${num1} + ${num2} = ?`;
      answer = num1 + num2;
  } else {
      // 减法: 确保结果非负
      if (num1 < num2) [num1, num2] = [num2, num1];
      questionText = `${num1} - ${num2} = ?`;
      answer = num1 - num2;
  }
  
  // 生成唯一错误答案
  const incorrect = new Set();
  while (incorrect.size < 3) {
      let offset = secureRandomInt(1, 5);
      let wrong = (secureRandomInt(0, 2) === 0) ? answer + offset : answer - offset;
      if (wrong !== answer && wrong >= 0) { // 保持非负
          incorrect.add(String(wrong));
      }
  }
  
  return {
      question: questionText,
      correct_answer: String(answer),
      incorrect_answers: Array.from(incorrect)
  };
}

// ----------------

// 工具：计算文本的 SHA-256 哈希值
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 加密随机整数
function secureRandomInt(min, max) {
    const range = max - min;
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return min + (bytes[0] % range);
}

// 数组乱序
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function apiUrl(methodName, params = null) {
  let query = '';
  if (params) {
    query = '?' + new URLSearchParams(params).toString();
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`;
}

function requestTelegram(methodName, body, params = null) {
  return fetch(apiUrl(methodName, params), body)
    .then(r => r.json());
}

function makeReqBody(body) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function sendMessage(msg = {}) {
  return requestTelegram('sendMessage', makeReqBody(msg));
}

function copyMessage(msg = {}) {
  return requestTelegram('copyMessage', makeReqBody(msg));
}

function forwardMessage(msg) {
  return requestTelegram('forwardMessage', makeReqBody(msg));
}

function createForumTopic(chat_id, name) {
    return requestTelegram('createForumTopic', makeReqBody({ chat_id, name }));
}

function editForumTopic(chat_id, message_thread_id, name) {
    return requestTelegram('editForumTopic', makeReqBody({ chat_id, message_thread_id, name }));
}

function answerCallbackQuery(callback_query_id, text, show_alert = false) {
    return requestTelegram('answerCallbackQuery', makeReqBody({ callback_query_id, text, show_alert }));
}

function deleteMessage(chat_id, message_id) {
    return requestTelegram('deleteMessage', makeReqBody({ chat_id, message_id }));
}

addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === WEBHOOK) {
    event.respondWith(handleWebhook(event));
  } else if (url.pathname === '/registerWebhook') {
    event.respondWith(registerWebhook(event, url, WEBHOOK, SECRET));
  } else if (url.pathname === '/unRegisterWebhook') {
    event.respondWith(unRegisterWebhook(event));
  } else {
    event.respondWith(new Response('No handler for this request'));
  }
});

async function handleWebhook(event) {
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }
  const update = await event.request.json();
  event.waitUntil(onUpdate(update));
  return new Response('Ok');
}

async function onUpdate(update) {
  // 1. 处理消息
  if ('message' in update) {
    await onMessage(update.message);
  }
  // 2. 处理按钮点击
  else if ('callback_query' in update) {
    await handleCallback(update.callback_query);
  }
}

async function onMessage(message) {
  // 0. 忽略服务消息 (如：加入群组、离开群组、置顶消息等)
  if (message.new_chat_members || message.left_chat_member || message.group_chat_created || message.supergroup_chat_created || message.channel_chat_created || message.pinned_message) {
    return new Response('Ok');
  }

  // 如果是 /start 指令
  if (message.text === '/start') {
    let startMsg = `请直接发送信息给我，我会转发给技术.`;
    
    // 如果是管理员，显示更详细的帮助信息
    if (message.chat.id.toString() === ADMIN_UID) {
        startMsg += `\n\n<b>Admin Control Panel</b>\nUID: ${message.chat.id}\n`;
        startMsg += `Mode: ${ENABLE_TOPIC_GROUP ? 'Topic Group (话题模式)' : 'Private Chat (私聊模式)'}\n`;
        
        if (ENABLE_TOPIC_GROUP) {
            startMsg += `Supergroup ID: ${SUPERGROUP_ID || 'Not Set ⚠️'}\n`;
            if (!SUPERGROUP_ID) {
                startMsg += `\n⚠️ <b>配置警告</b>: 您开启了话题模式，但未设置 ENV_SUPERGROUP_ID。\n请在 Cloudflare 环境变量中填入超级群组 ID (以 -100 开头)。\n`;
            }
        }
        
        startMsg += `\n发送 /admin 查看完整管理菜单。`;
    } else {
        startMsg += `\n\nYour UID: ${message.chat.id}`;
    }

    return sendMessage({
      chat_id: message.chat.id,
      text: startMsg,
      parse_mode: 'HTML'
    });
  }

  // 判断消息来源：
  // 1. 来自超级群组 (SUPERGROUP_ID) 且开启了话题模式 -> 管理员操作
  // 2. 来自管理员私聊 (ADMIN_UID) -> 管理员私聊操作 (或者兼容旧模式回复)
  // 3. 其他 -> 普通用户投稿
  
  if (ENABLE_TOPIC_GROUP && message.chat.id.toString() === SUPERGROUP_ID) {
    return handleAdminMessage(message);
  } else if (!ENABLE_TOPIC_GROUP && message.chat.id.toString() === ADMIN_UID) {
    // 旧模式：管理员在私聊中回复
    return handleAdminMessage(message);
  } else {
    // 可以在这里加个判断，如果普通用户 ID === ADMIN_UID 且不是在回复，是否要特殊处理？
    return handleGuestMessage(message);
  }
}

// --- 管理员逻辑 ---
async function handleAdminMessage(message) {
    // 1. 处理指令
    if (message.text) {
        if (message.text.startsWith('/info')) {
            return handleInfoCommand(message);
        }
        if (message.text.startsWith('/trust')) {
            return handleTrustCommand(message);
        }
        if (message.text.startsWith('/security')) {
            return handleSecurityCommand(message);
        }
        if (message.text.startsWith('/broadcast')) {
            return handleBroadcastCommand(message);
        }
        if (message.text.startsWith('/admin')) {
            return handleAdminMenu(message);
        }
    }

    // 2. 处理回复
    if (ENABLE_TOPIC_GROUP) {
        // 话题模式：回复话题中的消息
        const topicId = message.message_thread_id;
        if (topicId) {
            // 从 KV 获取话题对应的用户 ID
            const userId = await MirroTalk.get(`thread:${topicId}:user`);
            if (userId) {
                // 复制消息给用户
                return copyMessage({
                    chat_id: userId,
                    from_chat_id: message.chat.id,
                    message_id: message.message_id
                });
            }
        }
    } else {
        // 私聊模式：回复转发的消息
        if (message.reply_to_message) {
            // 尝试从 msg-map 获取
             let guestChatId = await MirroTalk.get('msg-map-' + message.reply_to_message.message_id, { type: "json" })
             if (guestChatId) {
                return copyMessage({
                  chat_id: guestChatId,
                  from_chat_id:message.chat.id,
                  message_id:message.message_id,
                })
            }
        }
    }
}

// --- 普通用户逻辑 ---
async function handleGuestMessage(message) {
    const chatId = message.chat.id;

    // 1. 黑名单检查
    const isblocked = await MirroTalk.get('isblocked-' + chatId, { type: "json" });
    if (isblocked) return new Response('Ok');

    // 2. 获取安全级别
    let securityLevel = await MirroTalk.get('config:security_level', { type: "json" });
    if (securityLevel === null) securityLevel = DEFAULT_SECURITY_LEVEL;

    // 3. 检查验证状态
    const verifiedStatus = await MirroTalk.get(`verified-${chatId}`);
    const isVerified = (verifiedStatus === 'true' || verifiedStatus === 'trusted');

    // 4. 根据安全级别判断是否允许
    let allowed = false;
    const isText = !!message.text;

    if (isVerified) {
        allowed = true;
    } else {
        if (securityLevel === SECURITY_RELAXED) {
            allowed = true; // 宽松模式：全部允许
        } else if (securityLevel === SECURITY_STANDARD) {
            allowed = isText; // 标准模式：只允许文本
        } else if (securityLevel === SECURITY_STRICT) {
            allowed = false; // 严格模式：全部禁止
        }
    }

    // 5. 如果被拦截，发送验证挑战
    if (!allowed) {
        // 检查是否已经发送过验证码但未处理 (简单防止刷屏)
        // 这里简化处理：每次拦截都发，但建议用户验证
        return sendVerificationChallenge(chatId, message.message_id);
    }

    // 6. 允许通过 -> 转发逻辑
    // 6.1 关键词/去重检查 (仅针对文本)
    if (message.text) {
        // 关键词拦截
        const hasBadWord = BLACKLIST_KEYWORDS.some(keyword => message.text.includes(keyword));
        if (hasBadWord) return new Response('Ok');

        // 去重
        const hash = await sha256(message.text.trim());
        const seen = await MirroTalk.get('msg-hash-' + hash);
        if (seen) return new Response('Ok');
        await MirroTalk.put('msg-hash-' + hash, '1', { expirationTtl: DEDUPE_TTL });
    }

    // 6.2 获取或创建话题
    let topicId = null;
    let forwardChatId = ADMIN_UID; // 默认转发给管理员私聊

    if (ENABLE_TOPIC_GROUP) {
        forwardChatId = SUPERGROUP_ID; // 话题模式下转发给超级群组
        topicId = await MirroTalk.get(`user:${chatId}:topic`);
        
        if (!topicId) {
            // 创建新话题
            // 标题: First Name + Last Name (@username)
            let title = `${message.chat.first_name || ''} ${message.chat.last_name || ''}`.trim();
            if (message.chat.username) title += ` (@${message.chat.username})`;
            if (!title) title = `User ${chatId}`;
            
            // 截断标题
            if (title.length > 128) title = title.substring(0, 125) + '...';

            const topicRes = await createForumTopic(SUPERGROUP_ID, title);
            if (topicRes.ok) {
                topicId = topicRes.result.message_thread_id;
                // 保存双向映射
                await MirroTalk.put(`user:${chatId}:topic`, topicId);
                await MirroTalk.put(`thread:${topicId}:user`, chatId);
            } else {
                // 创建话题失败
                console.error('Create topic failed:', JSON.stringify(topicRes));
                
                // 尝试通知管理员 (发到 SUPERGROUP_ID 的 General 话题，或者发给 ADMIN_UID 私聊)
                // 这里选择发给 SUPERGROUP_ID 的 General (topicId 为空即 General)
                await sendMessage({
                    chat_id: SUPERGROUP_ID,
                    text: `⚠️ <b>话题创建失败</b>\nUID: ${chatId}\nError: ${topicRes.description || 'Unknown error'}\n\n请检查机器人是否为群组管理员，且拥有"管理话题"权限。`,
                    parse_mode: 'HTML'
                });

                // 降级：转发到 General (不带 message_thread_id)
                // 暂时不带 topicId 转发
            }
        }
    }

    // 6.3 转发消息
    const forwardBody = {
        chat_id: forwardChatId,
        from_chat_id: chatId,
        message_id: message.message_id
    };
    if (topicId) {
        forwardBody.message_thread_id = topicId;
    }

    let forwardReq = await forwardMessage(forwardBody);
    // 只有在非话题模式下（即直接转发给管理员私聊），才需要保存 msg-map 用于回复
    // 话题模式下通过 topicId 反查，不需要 msg-map
    if (!ENABLE_TOPIC_GROUP && forwardReq.ok) {
        await MirroTalk.put('msg-map-' + forwardReq.result.message_id, chatId, { expirationTtl: MAP_TTL })
    }
}

// --- 验证逻辑 ---
async function sendVerificationChallenge(chatId, pendingMsgId) {
    // 动态生成数学题
    const question = generateMathChallenge();
    
    // 构建选项 (正确答案 + 3个错误答案)
    // 我们的题库只有3个错误答案，刚好凑4个
    const options = [
        { text: question.correct_answer, isCorrect: true },
        ...question.incorrect_answers.map(ans => ({ text: ans, isCorrect: false }))
    ];
    
    // 打乱选项
    shuffleArray(options);
    
    // 生成 verifyId (这里简单用 chatId + timestamp，实际可用 UUID)
    const verifyId = `${chatId}_${Date.now()}`;
    
    // 保存正确答案的索引到 KV (有效期 5 分钟)
    const correctIndex = options.findIndex(o => o.isCorrect);
    await MirroTalk.put(`verify:${verifyId}`, correctIndex, { expirationTtl: 300 });

    // 键盘按钮
    const keyboard = options.map((opt, idx) => ({
        text: opt.text,
        callback_data: `verify:${verifyId}:${idx}`
    }));
    
    // 2x2 排列
    const inline_keyboard = [
        [keyboard[0], keyboard[1]],
        [keyboard[2], keyboard[3]]
    ];

    await sendMessage({
        chat_id: chatId,
        text: `🔒 <b>身份验证 / Verification</b>\n\n问题：${question.question}\nQuestion: ${question.question}\n\n(验证通过后请重新发送刚才的消息)\n(Please resend your message after verification)`,
        parse_mode: 'HTML',
        reply_to_message_id: pendingMsgId,
        reply_markup: { inline_keyboard }
    });
}

async function handleCallback(callbackQuery) {
    const data = callbackQuery.data;
    if (!data.startsWith('verify:')) return;

    const [_, verifyId, answerIdxStr] = data.split(':');
    const answerIdx = parseInt(answerIdxStr);
    const chatId = callbackQuery.message.chat.id;

    // 1. 检查 verifyId 是否有效
    const correctIdxStr = await MirroTalk.get(`verify:${verifyId}`);
    
    if (correctIdxStr === null) {
        return answerCallbackQuery(callbackQuery.id, '❌ 验证已过期，请重新发送消息触发验证。', true);
    }
    
    const correctIdx = parseInt(correctIdxStr);

    // 2. 检查答案
    if (answerIdx === correctIdx) {
        // 验证成功
        // 设置验证状态 (30天)
        await MirroTalk.put(`verified-${chatId}`, 'true', { expirationTtl: VERIFIED_TTL });
        
        // 删除验证数据
        await MirroTalk.delete(`verify:${verifyId}`);
        
        // 更新界面
        await requestTelegram('editMessageText', makeReqBody({
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            text: '✅ <b>验证通过！</b>\n\n请重新发送您的消息。\nVerification Passed! Please resend your message.',
            parse_mode: 'HTML'
        }));
        
        await answerCallbackQuery(callbackQuery.id, '✅ 验证成功！');
    } else {
        // 验证失败
        await answerCallbackQuery(callbackQuery.id, '❌ 答案错误，请重试。', true);
    }
}

// --- 指令处理函数 ---

async function handleInfoCommand(message) {
    const topicId = message.message_thread_id;
    if (!topicId) {
        return sendMessage({ chat_id: SUPERGROUP_ID, text: '请在话题中使用此指令。' });
    }

    const userId = await MirroTalk.get(`thread:${topicId}:user`);
    if (!userId) {
        return sendMessage({ chat_id: SUPERGROUP_ID, text: '无法找到当前话题对应的用户。', message_thread_id: topicId });
    }

    const verifiedStatus = await MirroTalk.get(`verified-${userId}`);
    let statusText = "❌ 未验证";
    if (verifiedStatus === 'trusted') statusText = "🌟 永久信任";
    else if (verifiedStatus === 'true') statusText = "✅ 已验证";

    const text = `
ℹ️ <b>用户信息</b>
UID: <code>${userId}</code>
Topic ID: <code>${topicId}</code>
Status: ${statusText}
Link: <a href="tg://user?id=${userId}">点击私聊</a>
    `.trim();

    return sendMessage({
        chat_id: SUPERGROUP_ID,
        text: text,
        parse_mode: 'HTML',
        message_thread_id: topicId
    });
}

async function handleTrustCommand(message) {
    const topicId = message.message_thread_id;
    if (!topicId) return;

    const userId = await MirroTalk.get(`thread:${topicId}:user`);
    if (userId) {
        await MirroTalk.put(`verified-${userId}`, 'trusted'); // 永久信任 (不设 TTL)
        return sendMessage({
            chat_id: SUPERGROUP_ID,
            text: '🌟 <b>已设置永久信任</b>\n该用户将免除验证。',
            parse_mode: 'HTML',
            message_thread_id: topicId
        });
    }
}

async function handleSecurityCommand(message) {
    // 格式: /security 1|2|3
    const args = message.text.split(' ');
    if (args.length !== 2) {
        let current = await MirroTalk.get('config:security_level');
        if(!current) current = DEFAULT_SECURITY_LEVEL;
        
        return sendMessage({
            chat_id: SUPERGROUP_ID,
            text: `当前安全级别: ${current}\n\n设置方法: /security <1|2|3>\n1: 严格 (未验证禁言)\n2: 标准 (未验证仅文本)\n3: 宽松 (未验证可发媒体)`,
            message_thread_id: message.message_thread_id
        });
    }

    const level = parseInt(args[1]);
    if (![1, 2, 3].includes(level)) {
        return sendMessage({ chat_id: SUPERGROUP_ID, text: '无效级别。请使用 1, 2, 或 3。', message_thread_id: message.message_thread_id });
    }

    await MirroTalk.put('config:security_level', level);
    
    const names = { 1: '严格模式', 2: '标准模式', 3: '宽松模式' };
    return sendMessage({
        chat_id: SUPERGROUP_ID,
        text: `✅ 安全级别已设置为: <b>${names[level]}</b>`,
        parse_mode: 'HTML',
        message_thread_id: message.message_thread_id
    });
}

async function handleAdminMenu(message) {
    // 获取当前安全级别
    let current = await MirroTalk.get('config:security_level');
    if (!current) current = DEFAULT_SECURITY_LEVEL;
    
    const names = { 1: 'Strict', 2: 'Standard', 3: 'Relaxed' };
    
    const text = `
🛠 <b>管理员菜单 / Admin Menu</b>

<b>当前设置 (Current Settings):</b>
- 🛡 安全级别: <b>${names[current]}</b> (${current})

<b>可用指令 (Available Commands):</b>

🔹 <b>用户管理</b>
<code>/info</code> - 查看当前话题用户信息
<code>/trust</code> - 永久信任当前用户
<code>/block</code> - 屏蔽当前用户 (Shadowban)
<code>/unblock</code> - 解除屏蔽

🔹 <b>系统设置</b>
<code>/security 1</code> - 严格模式 (未验证禁言)
<code>/security 2</code> - 标准模式 (仅限文字)
<code>/security 3</code> - 宽松模式 (允许媒体)

🔹 <b>广播通知</b>
<code>/broadcast</code> - 回复一条消息进行全员广播
    `.trim();

    return sendMessage({
        chat_id: SUPERGROUP_ID,
        text: text,
        parse_mode: 'HTML',
        message_thread_id: message.message_thread_id
    });
}

async function handleBroadcastCommand(message) {
    // 检查是否回复了消息
    if (!message.reply_to_message) {
        return sendMessage({
            chat_id: SUPERGROUP_ID,
            text: '⚠️ <b>使用错误</b>\n\n请回复一条您想要广播的消息，并输入 <code>/broadcast</code>',
            parse_mode: 'HTML',
            message_thread_id: message.message_thread_id
        });
    }

    const broadcastMsg = message.reply_to_message;
    
    // 确认开始
    await sendMessage({
        chat_id: SUPERGROUP_ID,
        text: `📢 <b>正在开始广播...</b>\n\n目标：所有用户`,
        parse_mode: 'HTML',
        message_thread_id: message.message_thread_id
    });

    let sentCount = 0;
    let failCount = 0;
    let cursor = null;
    let listComplete = false;

    try {
        // 循环分页获取所有用户
        while (!listComplete) {
            // 列出 user: 开头的键 (我们只需要 user:{id}:topic 这种)
            // 每次最多 1000 个
            const list = await MirroTalk.list({ prefix: 'user:', cursor: cursor });
            
            for (const key of list.keys) {
                // 键名格式检查: user:123456:topic
                // 使用正则提取中间的 ID
                const match = key.name.match(/^user:(\d+):topic$/);
                if (match) {
                    const userId = match[1];
                    try {
                        // 使用 copyMessage 复制原消息，完美保留格式、媒体和按钮
                        await copyMessage({
                            chat_id: userId,
                            from_chat_id: broadcastMsg.chat.id,
                            message_id: broadcastMsg.message_id
                        });
                        sentCount++;
                    } catch (e) {
                        console.error(`Broadcast failed for ${userId}:`, e);
                        failCount++;
                    }
                }
            }

            if (list.list_complete) {
                listComplete = true;
            } else {
                cursor = list.cursor;
            }
        }

        // 广播完成报告
        return sendMessage({
            chat_id: SUPERGROUP_ID,
            text: `✅ <b>广播完成</b>\n\n成功发送: ${sentCount} 人\n失败: ${failCount} 人`,
            parse_mode: 'HTML',
            message_thread_id: message.message_thread_id
        });

    } catch (e) {
        return sendMessage({
            chat_id: SUPERGROUP_ID,
            text: `❌ <b>广播过程中出错</b>\n\n${e.message}`,
            parse_mode: 'HTML',
            message_thread_id: message.message_thread_id
        });
    }
}

async function registerWebhook(event, requestUrl, suffix, secret) {
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`;
  const r = await (await fetch(apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }))).json();
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}

async function unRegisterWebhook(event) {
  const r = await (await fetch(apiUrl('setWebhook', { url: '' }))).json();
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}
