const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE_PATH = path.join(__dirname, 'expenses_data.json');
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jzvaydvxopcrxfejxwco.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_rnJKvU3UWtCLhO-PLoNi2w_c0Kzqp5K';

async function loadData() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses_store?id=eq.1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const list = await res.json();
    if (list && list.length > 0) {
      return list[0].data;
    }
  } catch (err) {
    console.error("Lỗi loadData từ Supabase:", err.message);
  }
  
  // Fallback đọc file local nếu có sự cố hoặc chạy offline
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const content = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Lỗi đọc file backup local:", e.message);
  }
  return { transactions: [], budgets: {}, theme: 'dark', cycleStartDay: 7 };
}

async function saveData(data) {
  try {
    // Lưu local dự phòng
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("Lỗi ghi file backup local:", e.message);
  }

  try {
    // Lưu lên Supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses_store?id=eq.1`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: 1,
        data: data,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to save to Supabase: ${res.status} - ${errText}`);
    }
    return true;
  } catch (err) {
    console.error("Lỗi saveData lên Supabase:", err.message);
    return false;
  }
}

// API cho Web / App truy vấn dữ liệu
app.get('/api/data', async (req, res) => {
  try {
    const data = await loadData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/data', async (req, res) => {
  try {
    const success = await saveData(req.body);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DISCORD BOT ONLINE 24/7
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

discordClient.once('ready', async () => {
  console.log(`[Render Cloud Bot Online]: ${discordClient.user.tag}`);
  await scanRecentDiscordMessages();
});

async function scanRecentDiscordMessages() {
  try {
    const guilds = discordClient.guilds.cache;
    for (const [guildId, guild] of guilds) {
      const channels = guild.channels.cache;
      for (const [channelId, channel] of channels) {
        if (channel.isTextBased() && channel.viewable) {
          try {
            const messages = await channel.messages.fetch({ limit: 100 });
            // Duyệt bất đồng bộ tuần tự để đảm bảo không ghi đè dữ liệu trùng lặp lên Supabase
            for (const [, msg] of messages) {
              if (!msg.author.bot) {
                await processTransactionMessage(msg.content, msg.createdAt, msg.id);
              }
            }
          } catch (err) {}
        }
      }
    }
  } catch (err) {
    console.error("Lỗi đồng bộ lịch sử Discord:", err);
  }
}

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const textLower = message.content.toLowerCase().trim();

  // Đọc mật khẩu hiện tại từ Supabase
  let currentPassword = '';
  try {
    const dataContent = await loadData();
    currentPassword = dataContent.appPassword || '';
  } catch (err) {}

  // Lệnh kiểm tra mật khẩu web từ Discord
  if (textLower === '!matkhau' || textLower === '!pass' || textLower === 'mật khẩu' || textLower === 'mat khau') {
    if (currentPassword) {
      return message.reply(`🔒 Mật khẩu đăng nhập Web MoneyCare Pro của bạn hiện tại là: **${currentPassword}**`);
    } else {
      return message.reply(`🔓 Trang Web MoneyCare Pro hiện tại **chưa cài đặt mật khẩu** (mở trực tiếp không cần đăng nhập). Bạn có thể vào Cài Đặt trên Web để tự tạo mật khẩu nhé!`);
    }
  }

  const result = await processTransactionMessage(message.content, message.createdAt, message.id);
  if (result.success) {
    try {
      await message.reply(`✅ Đã lưu giao dịch: **${result.tx.note}** (${new Intl.NumberFormat('vi-VN').format(result.tx.amount)} ₫) vào hệ thống Cloud!`);
    } catch (err) {
      console.error(err);
    }
  }
});

function parseTransactionText(text, messageCreatedAt) {
  const cleanText = text.toLowerCase().trim();
  let amount = 0;

  // 1. Tìm ngày tháng được ghi rõ trong tin nhắn trước (Ví dụ: "ngày 21/07", "21/07/2026", "21-07")
  let customDate = null;
  const dateRegex = /(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/;
  const dateMatch = cleanText.match(dateRegex);
  if (dateMatch) {
    const day = String(dateMatch[1]).padStart(2, '0');
    const month = String(dateMatch[2]).padStart(2, '0');
    const now = new Date(messageCreatedAt);
    const year = dateMatch[3] ? dateMatch[3] : now.getFullYear();
    customDate = `${year}-${month}-${day}`;
  }

  // Tạo chuỗi văn bản đã loại bỏ đoạn ngày tháng để không bị nhầm lẫn con số ngày/tháng với số tiền
  const textWithoutDate = cleanText.replace(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/g, '');
  
  // 2. Tìm số tiền từ chuỗi văn bản đã lọc ngày
  const trRegex = /(\d+[\.,]?\d*)\s*(tr|triệu)/i;
  const kRegex = /(\d+)\s*k/i;

  if (trRegex.test(textWithoutDate)) {
    const match = textWithoutDate.match(trRegex);
    let val = parseFloat(match[1].replace(',', '.'));
    amount = val * 1000000;
  } else if (kRegex.test(textWithoutDate)) {
    const match = textWithoutDate.match(kRegex);
    amount = parseFloat(match[1]) * 1000;
  } else {
    const matches = textWithoutDate.replace(/\./g, '').match(/\d+/);
    if (matches) {
      amount = parseFloat(matches[0]);
    }
  }

  if (!amount || amount <= 0) return null;

  // 3. Phân loại Thu/Chi
  let type = 'expense';
  const incomeKeywords = [
    'lương', 'thu', 'tiền lương', 'thưởng', 'cộng', 'lương ứng', 'tạm ứng',
    'trả lại', 'trả nợ', 'chuyển lại', 'hoàn tiền', 'nhận được', 'khách trả',
    'đòi được', 'được trả', 'trả lại tiền'
  ];
  if (incomeKeywords.some(k => cleanText.includes(k))) {
    type = 'income';
  }

  // 4. Phân loại Danh mục
  let category = 'other_exp';
  if (type === 'income') {
    if (cleanText.includes('ứng') || cleanText.includes('đợt 1')) category = 'salary_advance';
    else if (cleanText.includes('lương')) category = 'salary_main';
    else if (cleanText.includes('thưởng')) category = 'bonus';
    else category = 'other_inc';
  } else {
    if (cleanText.includes('ăn') || cleanText.includes('uống') || cleanText.includes('chợ') || cleanText.includes('cơm') || cleanText.includes('bánh') || cleanText.includes('nước')) category = 'food';
    else if (cleanText.includes('nhà') || cleanText.includes('điện') || cleanText.includes('phòng')) category = 'housing';
    else if (cleanText.includes('mua') || cleanText.includes('áo') || cleanText.includes('quần') || cleanText.includes('đồ')) category = 'shopping';
    else if (cleanText.includes('xăng') || cleanText.includes('xe') || cleanText.includes('grab')) category = 'transport';
    else if (cleanText.includes('chơi') || cleanText.includes('cầu lông') || cleanText.includes('phim')) category = 'entertainment';
    else if (cleanText.includes('mạng') || cleanText.includes('wifi') || cleanText.includes('hóa đơn')) category = 'bills';
    else if (cleanText.includes('thuốc') || cleanText.includes('khám') || cleanText.includes('sức khỏe')) category = 'health';
  }

  // 5. Làm sạch ghi chú (Loại bỏ ngày tháng & số tiền ra khỏi ghi chú)
  let note = text;
  note = note.replace(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/gi, '');
  note = note.replace(/\d+[\.,]?\d*\s*(tr|triệu|k|vnđ|đ)?/gi, '');
  note = note.replace(/(ngày|hôm)?/gi, '');
  note = note.replace(/[-+]/g, '').trim();
  if (!note) note = type === 'income' ? 'Thu nhập qua Discord' : 'Chi tiêu qua Discord';

  return { amount, type, category, note, customDate };
}

async function processTransactionMessage(content, createdAt, messageId = '') {
  try {
    const parsed = parseTransactionText(content, createdAt);
    if (!parsed) return { success: false };

    let data = await loadData();

    const uniqueId = messageId ? 'discord_' + messageId : 'discord_' + new Date(createdAt).getTime().toString();
    const dStr = parsed.customDate || new Date(createdAt).toISOString().split('T')[0];

    // Kiểm tra trùng lặp theo ID tin nhắn duy nhất của Discord HOẶC nội dung + ngày + số tiền
    const isExist = data.transactions.some(tx => 
      tx.id === uniqueId || 
      (tx.note === parsed.note && tx.amount === parsed.amount && tx.date === dStr)
    );

    if (isExist) return { success: false };

    const newTx = {
      id: uniqueId,
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      date: dStr,
      payment: 'Tài khoản Ngân hàng',
      note: parsed.note
    };

    data.transactions.unshift(newTx);
    await saveData(data);
    return { success: true, tx: newTx };
  } catch (err) {
    return { success: false };
  }
}

if (BOT_TOKEN) {
  discordClient.login(BOT_TOKEN).catch(err => {
    console.error("Lỗi kết nối Discord Bot:", err.message);
  });
}

app.listen(PORT, () => {
  console.log(`Web Server running on port ${PORT}`);
});
