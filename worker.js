const TOKEN = ENV_BOT_TOKEN // Get it from @BotFather
const WEBHOOK = '/endpoint'
const SECRET = ENV_BOT_SECRET 
const ADMIN_UID = ENV_ADMIN_UID 

const NOTIFY_INTERVAL = 3600 * 1000;

// --- 配置区域 ---
// 1. 黑名单关键词 (命中即静默丢弃)
const BLACKLIST_KEYWORDS = [
  '炸鱼', '微信', '加我', '兼职', '刷单', '日结', 
  '裸聊', '同城', 'av', '博彩', 'USDT', '跑分'
];

// 2. 消息去重过期时间 (秒)，默认7天。
const DEDUPE_TTL = 7 * 24 * 3600; 
// ----------------

// 工具：计算文本的 SHA-256 哈希值
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function apiUrl (methodName, params = null) {
  let query = ''
  if (params) {
    query = '?' + new URLSearchParams(params).toString()
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`
}

function requestTelegram(methodName, body, params = null){
  return fetch(apiUrl(methodName, params), body)
    .then(r => r.json())
}

function makeReqBody(body){
  return {
    method:'POST',
    headers:{
      'content-type':'application/json'
    },
    body:JSON.stringify(body)
  }
}

function sendMessage(msg = {}){
  return requestTelegram('sendMessage', makeReqBody(msg))
}

function copyMessage(msg = {}){
  return requestTelegram('copyMessage', makeReqBody(msg))
}

function forwardMessage(msg){
  return requestTelegram('forwardMessage', makeReqBody(msg))
}

addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.pathname === WEBHOOK) {
    event.respondWith(handleWebhook(event))
  } else if (url.pathname === '/registerWebhook') {
    event.respondWith(registerWebhook(event, url, WEBHOOK, SECRET))
  } else if (url.pathname === '/unRegisterWebhook') {
    event.respondWith(unRegisterWebhook(event))
  } else {
    event.respondWith(new Response('No handler for this request'))
  }
})

async function handleWebhook (event) {
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 })
  }
  const update = await event.request.json()
  event.waitUntil(onUpdate(update))
  return new Response('Ok')
}

async function onUpdate (update) {
  // 1. 处理消息
  if ('message' in update) {
    await onMessage(update.message)
  } 
  // 2. 处理按钮点击 (新增)
  else if ('callback_query' in update) {
    await handleCallback(update.callback_query)
  }
}

// 新增：处理按钮点击事件
async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // 如果点击的是 "媒体权限验证"
  if (data === 'verify_media_allow') {
    // 1. 修改 KV，将用户设为已验证
    await MirroTalk.put('verified-' + chatId, true);

    // 2. 消除按钮的加载动画
    await requestTelegram('answerCallbackQuery', makeReqBody({
        callback_query_id: callbackQuery.id,
        text: '✅ 验证通过 / Verified'
    }));

    // 3. 修改原消息，提示成功
    await requestTelegram('editMessageText', makeReqBody({
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        text: '✅ <b>身份验证通过！</b>\n\n您现在可以发送图片、视频或文件了。\n\nVerification Successful! You can now send media.',
        parse_mode: 'HTML'
    }));

    // 可选：通知管理员有人通过了验证
    // await sendMessage({ chat_id: ADMIN_UID, text: `用户 UID:${chatId} 已通过按钮自助验证。` })
  }
}

async function onMessage (message) {
  if(message.text === '/start'){
    let startMsg = `请直接发送信息给我，我会转发给技术.`; 
    return sendMessage({
      chat_id:message.chat.id,
      text:startMsg,
    })
  }
  
  // --- 管理员逻辑 ---
  if(message.chat.id.toString() === ADMIN_UID){
    if(!message?.reply_to_message?.chat){
      return sendMessage({
        chat_id:ADMIN_UID,
        text:'使用方法：回复转发的消息。\n指令：\n/trust - 加白名单\n/untrust - 移除白名单\n/block - 屏蔽\n/unblock - 解除屏蔽'
      })
    }
    
    // 指令处理
    if(/^\/block$/.exec(message.text)){
      return handleBlock(message)
    }
    if(/^\/unblock$/.exec(message.text)){
      return handleUnBlock(message)
    }
    if(/^\/checkblock$/.exec(message.text)){
      return checkBlock(message)
    }
    
    // 指令：信任用户
    if(/^\/trust$/.exec(message.text)){
        let guestChantId = await MirroTalk.get('msg-map-' + message.reply_to_message.message_id, { type: "json" })
        if(guestChantId){
            await MirroTalk.put('verified-' + guestChantId, true)
            return sendMessage({ chat_id: ADMIN_UID, text: `✅ UID:${guestChantId} 已设为信任。` })
        }
        return;
    }

    // 指令：取消信任 (测试用)
    if(/^\/untrust$/.exec(message.text)){
        let guestChantId = await MirroTalk.get('msg-map-' + message.reply_to_message.message_id, { type: "json" })
        if(guestChantId){
            await MirroTalk.put('verified-' + guestChantId, false)
            return sendMessage({ chat_id: ADMIN_UID, text: `❎ UID:${guestChantId} 已移除信任。` })
        }
        return;
    }

    // 管理员正常回复
    let guestChantId = await MirroTalk.get('msg-map-' + message?.reply_to_message.message_id,
                                      { type: "json" })
    if (guestChantId) {
        return copyMessage({
          chat_id: guestChantId,
          from_chat_id:message.chat.id,
          message_id:message.message_id,
        })
    }
    return;
  }
  
  // --- 普通用户逻辑 ---
  return handleGuestMessage(message)
}

async function handleGuestMessage(message){
  let chatId = message.chat.id;
  
  // 1. 黑名单检查
  let isblocked = await MirroTalk.get('isblocked-' + chatId, { type: "json" })
  if(isblocked) return new Response('Ok') 

  // ============================================
  // 核心逻辑：区分 文本 vs 媒体
  // ============================================

  // 如果 message.text 存在，就是纯文本
  if (message.text) {
      return handleTextMessage(message, chatId);
  } 
  
  // 否则，就是媒体（图片、视频、文件等）
  return handleMediaMessage(message, chatId);
}

// 处理纯文本
async function handleTextMessage(message, chatId) {
  const text = message.text;

  // 1. 关键词拦截
  const hasBadWord = BLACKLIST_KEYWORDS.some(keyword => text.includes(keyword));
  if (hasBadWord) return new Response('Ok'); 

  // 2. 消息去重
  const hash = await sha256(text.trim());
  const seen = await MirroTalk.get('msg-hash-' + hash);
  if (seen) return new Response('Ok'); 
  await MirroTalk.put('msg-hash-' + hash, '1', { expirationTtl: DEDUPE_TTL });

  // 3. 转发
  let forwardReq = await forwardMessage({
    chat_id:ADMIN_UID,
    from_chat_id:chatId,
    message_id:message.message_id
  })
  if (forwardReq.ok) {
    await MirroTalk.put('msg-map-' + forwardReq.result.message_id, chatId)
  }
}

// 处理媒体 (非纯文本)
async function handleMediaMessage(message, chatId) {
  // 获取验证状态
  let isVerified = await MirroTalk.get('verified-' + chatId, { type: "json" });

  // 场景 A: 用户已验证 -> 直接转发
  if (isVerified) {
      let forwardReq = await forwardMessage({
        chat_id:ADMIN_UID,
        from_chat_id:chatId,
        message_id:message.message_id
      })
      if (forwardReq.ok) {
        await MirroTalk.put('msg-map-' + forwardReq.result.message_id, chatId)
      }
      return new Response('Ok');
  }

  // 场景 B: 用户未验证 -> 拦截 + 提供验证按钮
  
  // 1. 发送带按钮的警告
  await sendMessage({
      chat_id: chatId,
      reply_to_message_id: message.message_id, 
      text: '🚫 <b>系统拦截：</b>\n为防止垃圾广告，未验证用户仅限发送文字。\n请点击下方按钮进行身份验证，验证后即可发送图片。\n\n<b>System Blocked:</b>\nPlease verify your identity to send media files.',
      parse_mode: 'HTML',
      reply_markup: {
          inline_keyboard: [[
              { text: '🤖 我是真人 / I am human', callback_data: 'verify_media_allow' }
          ]]
      }
  });

  // 2. 如果媒体带有文字 (Caption)，提取并发给管理员
  if (message.caption) {
      const caption = message.caption;
      const hasBadWord = BLACKLIST_KEYWORDS.some(keyword => caption.includes(keyword));
      if(!hasBadWord) {
          let sentMsg = await sendMessage({
              chat_id: ADMIN_UID,
              text: `[🖼️ 图片拦截提醒]\n用户(UID:${chatId}) 发送的图片已被丢弃，附文:\n${caption}`
          });
          if(sentMsg.ok){
              await MirroTalk.put('msg-map-' + sentMsg.result.message_id, chatId);
          }
      }
  }

  // 3. 丢弃图片
  return new Response('Ok');
}

async function handleBlock(message){
  let guestChantId = await MirroTalk.get('msg-map-' + message.reply_to_message.message_id,
                                      { type: "json" })
  if(guestChantId.toString() === ADMIN_UID){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:'不能屏蔽自己'
    })
  }
  await MirroTalk.put('isblocked-' + guestChantId, true)

  return sendMessage({
    chat_id: ADMIN_UID,
    text: `UID:${guestChantId}屏蔽成功 (Shadowban)`,
  })
}

async function handleUnBlock(message){
  let guestChantId = await MirroTalk.get('msg-map-' + message.reply_to_message.message_id,
  { type: "json" })

  await MirroTalk.put('isblocked-' + guestChantId, false)

  return sendMessage({
    chat_id: ADMIN_UID,
    text:`UID:${guestChantId}解除屏蔽成功`,
  })
}

async function checkBlock(message){
  let guestChantId = await MirroTalk.get('msg-map-' + message.reply_to_message.message_id,
  { type: "json" })
  let blocked = await MirroTalk.get('isblocked-' + guestChantId, { type: "json" })

  return sendMessage({
    chat_id: ADMIN_UID,
    text: `UID:${guestChantId}` + (blocked ? '被屏蔽' : '没有被屏蔽')
  })
}

async function registerWebhook (event, requestUrl, suffix, secret) {
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
  const r = await (await fetch(apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }))).json()
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
}

async function unRegisterWebhook (event) {
  const r = await (await fetch(apiUrl('setWebhook', { url: '' }))).json()
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
}