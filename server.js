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

// API cho Web / App truy vấn dữ liệu
app.get('/api/data', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const content = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      return res.json(JSON.parse(content));
    }
    return res.json({ transactions: [], budgets: {}, theme: 'dark', cycleStartDay: 7 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/data', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true });
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

discordClient.once('ready', () => {
  console.log(`[Render Cloud Bot Online]: ${discordClient.user.tag}`);
});

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const result = processTransactionMessage(message.content, message.createdAt);
  if (result.success) {
    try {
      await message.reply(`✅ Đã lưu giao dịch: **${result.tx.note}** (${new Intl.NumberFormat('vi-VN').format(result.tx.amount)} ₫) vào hệ thống Cloud!`);
    } catch (err) {
      console.error(err);
    }
  }
});

function parseTransactionText(text) {
  const cleanText = text.toLowerCase().trim();
  let amount = 0;
  
  const trRegex = /(\d+[\.,]?\d*)\s*(tr|triệu)/i;
  const kRegex = /(\d+)\s*k/i;

  if (trRegex.test(cleanText)) {
    const match = cleanText.match(trRegex);
    let val = parseFloat(match[1].replace(',', '.'));
    amount = val * 1000000;
  } else if (kRegex.test(cleanText)) {
    const match = cleanText.match(kRegex);
    amount = parseFloat(match[1]) * 1000;
  } else {
    const matches = cleanText.replace(/\./g, '').match(/\d+/);
    if (matches) {
      amount = parseFloat(matches[0]);
    }
  }

  if (!amount || amount <= 0) return null;

  let type = 'expense';
  const incomeKeywords = ['lương', 'thu', 'tiền lương', 'thưởng', 'cộng', 'lương ứng', 'tạm ứng'];
  if (incomeKeywords.some(k => cleanText.includes(k))) {
    type = 'income';
  }

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

  let note = text.replace(/\d+[\.,]?\d*\s*(tr|triệu|k|vnđ|đ)?/gi, '').replace(/[-+]/g, '').trim();
  if (!note) note = type === 'income' ? 'Thu nhập qua Discord' : 'Chi tiêu qua Discord';

  return { amount, type, category, note };
}

function processTransactionMessage(content, createdAt) {
  try {
    const parsed = parseTransactionText(content);
    if (!parsed) return { success: false };

    let data = { transactions: [], budgets: {}, theme: 'dark', cycleStartDay: 7 };
    if (fs.existsSync(DATA_FILE_PATH)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf-8'));
    }

    const timestampId = new Date(createdAt).getTime().toString();
    const dStr = new Date(createdAt).toISOString().split('T')[0];
    const isExist = data.transactions.some(tx => tx.note === parsed.note && tx.amount === parsed.amount && tx.date === dStr);
    if (isExist) return { success: false };

    const newTx = {
      id: 'discord_' + timestampId,
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      date: dStr,
      payment: 'Tài khoản Ngân hàng',
      note: parsed.note
    };

    data.transactions.unshift(newTx);
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
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
