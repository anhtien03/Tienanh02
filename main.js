const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const DATA_FILE_PATH = path.join(app.getPath('userData'), 'expenses_data.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    title: 'Quản Lý Chi Tiêu & Tính Tiền Hàng Tháng',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

const { Client, GatewayIntentBits } = require('discord.js');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    initDiscordBot();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// DISCORD BOT INTEGRATION
let BOT_TOKEN = process.env.BOT_TOKEN || '';
let discordClient;

function initDiscordBot() {
  // Đọc Token từ file lưu trữ nếu có
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const content = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      const saved = JSON.parse(content);
      if (saved && saved.botToken) {
        BOT_TOKEN = saved.botToken.trim();
      }
    }
  } catch (e) {}

  if (!BOT_TOKEN) return;

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  discordClient.once('ready', async () => {
    console.log(`Discord Bot online: ${discordClient.user.tag}`);
    // Sau khi Bot online, tự động quét tin nhắn cũ chưa xử lý
    setTimeout(() => {
      scanRecentMessages();
    }, 3000);
  });

  discordClient.on('messageCreate', async (message) => {
    console.log(`[Discord Incoming Message]: "${message.content}" từ ${message.author.username}`);
    // Không xử lý tin nhắn của Bot
    if (message.author.bot) return;
    
    const result = processTransactionMessage(message.content, message.createdAt);
    console.log(`[Process Result]:`, result);
    if (result.success) {
      try {
        await message.reply(`✅ Đã lưu giao dịch: **${result.tx.note}** (${new Intl.NumberFormat('vi-VN').format(result.tx.amount)} ₫) vào phần mềm!`);
      } catch (err) {
        console.error("Lỗi gửi tin nhắn phản hồi Discord:", err);
      }
    }
  });

  discordClient.login(BOT_TOKEN).catch(err => {
    console.error("Lỗi đăng nhập Discord Bot (Token có thể bị Reset):", err.message);
  });
}

// Phân tích cú pháp tin nhắn tiếng Việt
// Ví dụ: "tiền ăn trưa 35k", "tiền cầu lông 198.000", "lương ứng 2tr5", "chuyển khoản 100k mua áo"
function parseTransactionText(text) {
  const cleanText = text.toLowerCase().trim();
  
  // 1. Tìm số tiền trong tin nhắn
  // Regex tìm các dạng: 35k, 35.000, 1500000, 2tr5, 2.5tr, 2,5tr
  let amount = 0;
  
  // Tìm số dạng "2tr5", "2.5tr"
  const trRegex = /(\d+[\.,]?\d*)\s*(tr|triệu)/i;
  const kRegex = /(\d+)\s*k/i;
  const numberRegex = /(\d+[\.\d]*)/;

  if (trRegex.test(cleanText)) {
    const match = cleanText.match(trRegex);
    let val = parseFloat(match[1].replace(',', '.'));
    amount = val * 1000000;
  } else if (kRegex.test(cleanText)) {
    const match = cleanText.match(kRegex);
    amount = parseFloat(match[1]) * 1000;
  } else {
    // Tìm các chuỗi số thông thường (bỏ dấu chấm phân tách hàng nghìn)
    const matches = cleanText.replace(/\./g, '').match(/\d+/);
    if (matches) {
      amount = parseFloat(matches[0]);
    }
  }

  if (!amount || amount <= 0) return null;

  // 2. Tìm loại giao dịch (Thu nhập hay Chi tiêu)
  let type = 'expense'; // Mặc định là chi tiêu
  const incomeKeywords = ['lương', 'thu', 'tiền lương', 'thưởng', 'cộng', 'lương ứng', 'tạm ứng'];
  const isIncome = incomeKeywords.some(keyword => cleanText.includes(keyword));
  if (isIncome) {
    type = 'income';
  }

  // 3. Dự đoán Category phù hợp nhất dựa trên từ khóa
  let category = 'other_exp';
  if (type === 'income') {
    if (cleanText.includes('ứng') || cleanText.includes('đợt 1')) {
      category = 'salary_advance';
    } else if (cleanText.includes('lương')) {
      category = 'salary_main';
    } else if (cleanText.includes('thưởng')) {
      category = 'bonus';
    } else {
      category = 'other_inc';
    }
  } else {
    // Chi tiêu
    if (cleanText.includes('ăn') || cleanText.includes('uống') || cleanText.includes('chợ') || cleanText.includes('cơm') || cleanText.includes('bánh') || cleanText.includes('nước')) {
      category = 'food';
    } else if (cleanText.includes('nhà') || cleanText.includes('điện') || cleanText.includes('nước sinh hoạt') || cleanText.includes('phòng')) {
      category = 'housing';
    } else if (cleanText.includes('mua') || cleanText.includes('áo') || cleanText.includes('quần') || cleanText.includes('giày') || cleanText.includes('đồ')) {
      category = 'shopping';
    } else if (cleanText.includes('xăng') || cleanText.includes('xe') || cleanText.includes('grab') || cleanText.includes('đi lại')) {
      category = 'transport';
    } else if (cleanText.includes('chơi') || cleanText.includes('phim') || cleanText.includes('cầu lông') || cleanText.includes('đá bóng') || cleanText.includes('net')) {
      category = 'entertainment';
    } else if (cleanText.includes('mạng') || cleanText.includes('wifi') || cleanText.includes('cước') || cleanText.includes('hóa đơn')) {
      category = 'bills';
    } else if (cleanText.includes('thuốc') || cleanText.includes('khám') || cleanText.includes('sức khỏe') || cleanText.includes('bệnh')) {
      category = 'health';
    }
  }

  // 4. Lọc bỏ số tiền ra khỏi nội dung ghi chú
  let note = text;
  // Loại bỏ các mẫu số tiền ra khỏi ghi chú
  note = note.replace(/\d+[\.,]?\d*\s*(tr|triệu|k|vnđ|đ)?/gi, '');
  note = note.replace(/[-+]/g, '');
  note = note.trim();
  if (!note) {
    note = type === 'income' ? 'Thu nhập qua Discord' : 'Chi tiêu qua Discord';
  }

  return { amount, type, category, note };
}

// Xử lý và lưu giao dịch vào file JSON
function processTransactionMessage(content, createdAt) {
  try {
    const parsed = parseTransactionText(content);
    if (!parsed) return { success: false };

    // Đọc file data hiện tại
    let data = { transactions: [], budgets: {}, theme: 'dark', cycleStartDay: 7 };
    if (fs.existsSync(DATA_FILE_PATH)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf-8'));
    }

    // Kiểm tra xem ID giao dịch đã tồn tại chưa (tránh trùng lặp khi quét lịch sử)
    const timestampId = new Date(createdAt).getTime().toString();
    const isExist = data.transactions.some(tx => tx.note === parsed.note && tx.amount === parsed.amount && tx.date === getISOStringDate(createdAt));
    if (isExist) return { success: false };

    // Tạo giao dịch mới
    const newTx = {
      id: 'discord_' + timestampId + '_' + Math.random().toString(36).substr(2, 5),
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      date: getISOStringDate(createdAt),
      payment: 'Tài khoản Ngân hàng', // Mặc định qua thẻ ngân hàng
      note: parsed.note
    };

    data.transactions.unshift(newTx);
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

    // Gửi sự kiện reload cho renderer process nếu window đang mở
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('data-updated');
    }
    return { success: true, tx: newTx };
  } catch (err) {
    console.error("Lỗi xử lý lưu giao dịch từ Discord:", err);
    return { success: false };
  }
}

function getISOStringDate(dateObj) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Quét lịch sử 50 tin nhắn gần nhất trong tất cả các kênh văn bản của máy chủ
async function scanRecentMessages() {
  try {
    const guilds = discordClient.guilds.cache;
    for (const [guildId, guild] of guilds) {
      const channels = await guild.channels.fetch();
      for (const [channelId, channel] of channels) {
        // Chỉ quét các kênh chat chữ (Text Channel)
        if (channel.isTextBased()) {
          const messages = await channel.messages.fetch({ limit: 50 });
          let count = 0;
          for (const [msgId, message] of messages) {
            if (message.author.bot) continue;
            const result = processTransactionMessage(message.content, message.createdAt);
            if (result.success) {
              count++;
              try {
                await message.reply(`✅ Đã lưu giao dịch: **${result.tx.note}** (${new Intl.NumberFormat('vi-VN').format(result.tx.amount)} ₫) vào phần mềm!`);
              } catch (e) {}
            }
          }
          if (count > 0) {
            console.log(`Đã đồng bộ ${count} giao dịch cũ từ kênh #${channel.name}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Lỗi quét lịch sử tin nhắn Discord:", err);
  }
}


// IPC Handler: Đọc dữ liệu từ file JSON local
ipcMain.handle('read-data', async () => {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const content = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      return JSON.parse(content);
    }
    return null;
  } catch (err) {
    console.error('Lỗi đọc dữ liệu:', err);
    return null;
  }
});

// IPC Handler: Ghi dữ liệu vào file JSON local
ipcMain.handle('save-data', async (event, data) => {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Lỗi ghi dữ liệu:', err);
    return { success: false, error: err.message };
  }
});

// IPC Handler: Xuất dữ liệu CSV
ipcMain.handle('export-csv', async (event, { csvContent, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Xuất Báo Cáo CSV',
    defaultPath: defaultName || 'bao-cao-chi-tieu.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (filePath) {
    try {
      // Ghi UTF-8 với BOM để Excel tiếng Việt không bị lỗi font
      const bom = '\uFEFF';
      fs.writeFileSync(filePath, bom + csvContent, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { cancelled: true };
});
