// Danh mục cố định cho Thu & Chi
const CATEGORIES = {
  expense: [
    { id: 'food', name: 'Ăn uống & Đi chợ', icon: 'utensils' },
    { id: 'housing', name: 'Tiền nhà & Điền nước', icon: 'home' },
    { id: 'shopping', name: 'Mua sắm cá nhân', icon: 'shopping-bag' },
    { id: 'transport', name: 'Xăng xe & Đi lại', icon: 'car' },
    { id: 'entertainment', name: 'Giải trí & Phim ảnh', icon: 'film' },
    { id: 'bills', name: 'Hóa đơn & Dịch vụ', icon: 'file-text' },
    { id: 'health', name: 'Sức khỏe & Y tế', icon: 'heart-pulse' },
    { id: 'other_exp', name: 'Chi phí khác', icon: 'more-horizontal' }
  ],
  income: [
    { id: 'salary_advance', name: 'Tạm ứng lương (Lương đợt 1)', icon: 'banknote' },
    { id: 'salary_main', name: 'Lương chính thức (Lương đợt 2)', icon: 'wallet' },
    { id: 'bonus', name: 'Thưởng & Phụ cấp', icon: 'award' },
    { id: 'business', name: 'Kinh doanh / Phụ thu', icon: 'briefcase' },
    { id: 'investment', name: 'Đầu tư / Lãi tiết kiệm', icon: 'trending-up' },
    { id: 'other_inc', name: 'Thu nhập khác', icon: 'plus-circle' }
  ]
};

// Application State
let state = {
  currentMonth: getCurrentYearMonth(), // YYYY-MM
  cycleStartDay: 7, // Mặc định ngày 7 hàng tháng (ví dụ: 07/07 -> 06/08)
  discordWebhook: 'https://discord.com/api/webhooks/1529152416375640225/94hW2fYaHQ--pTVoCcsAh_twl0wyJPY3L9WmgsvN6o3d4b3b7qc3ipBJLAXIFFeqoJhr', // Discord Webhook URL
  botToken: '', // Discord Bot Token
  notifiedMilestones: {}, // Ghi nhớ mốc cảnh báo đã nhắn: { "2026-07-80": true }
  transactions: [], // Array các object giao dịch
  budgets: {}, // { "2026-07": 15000000 }
  currentType: 'expense',
  theme: 'dark'
};

let categoryChart = null;

// DOM Elements
const monthInput = document.getElementById('select-month');
const toggleExpenseBtn = document.getElementById('toggle-expense');
const toggleIncomeBtn = document.getElementById('toggle-income');
const categorySelect = document.getElementById('tx-category');
const form = document.getElementById('transaction-form');
const txDateInput = document.getElementById('tx-date');
const searchInput = document.getElementById('search-input');
const filterTypeSelect = document.getElementById('filter-type');
const txListBody = document.getElementById('tx-list-body');
const emptyState = document.getElementById('empty-state');

// Stat Elements
const statIncome = document.getElementById('stat-total-income');
const statExpense = document.getElementById('stat-total-expense');
const statBalance = document.getElementById('stat-balance');
const statBudgetProgress = document.getElementById('stat-budget-progress');
const budgetBarFill = document.getElementById('budget-bar-fill');
const txCountBadge = document.getElementById('tx-count');

// Modal Elements
const modalBudget = document.getElementById('modal-budget');
const budgetInput = document.getElementById('budget-input');

function getTodayDateStringVN() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function convertVNToISO(vnDateStr) {
  if (!vnDateStr) return '';
  const parts = vnDateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return vnDateStr;
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  // Set default current month in input
  monthInput.value = state.currentMonth;
  txDateInput.value = getTodayDateStringVN();

  // Load Categories for default type (expense)
  renderCategories();

  // Initialize Lucide Icons
  if (window.lucide) lucide.createIcons();

  // Load Saved Data from Local Storage File via Electron API
  await loadData();

  // Setup Event Listeners
  setupEventListeners();

  // Lắng nghe sự kiện đồng bộ từ Discord Bot để tự động tải lại giao diện
  if (window.api && window.api.onDataUpdated) {
    window.api.onDataUpdated(async () => {
      console.log('Phát hiện dữ liệu thay đổi từ Discord Bot! Đang cập nhật giao diện...');
      await loadData();
      render();
    });
  }

  // Initial Render
  render();
});

function getCurrentYearMonth() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatCurrency(val) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}

// Load data từ File system
async function loadData() {
  if (window.api && window.api.readData) {
    const saved = await window.api.readData();
    if (saved) {
      state.transactions = saved.transactions || [];
      state.budgets = saved.budgets || {};
      state.theme = saved.theme || 'dark';
      state.cycleStartDay = saved.cycleStartDay || 7;
      state.discordWebhook = saved.discordWebhook || state.discordWebhook || '';
      state.botToken = saved.botToken || state.botToken || '';
      state.notifiedMilestones = saved.notifiedMilestones || {};
    }
  }
  setTheme(state.theme);
}

// Save data vào File system
async function saveData() {
  if (window.api && window.api.saveData) {
    await window.api.saveData({
      transactions: state.transactions,
      budgets: state.budgets,
      theme: state.theme,
      cycleStartDay: state.cycleStartDay,
      discordWebhook: state.discordWebhook,
      botToken: state.botToken,
      notifiedMilestones: state.notifiedMilestones
    });
  }
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  }
}

function renderCategories() {
  const options = CATEGORIES[state.currentType];
  categorySelect.innerHTML = options
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');
}

function setupEventListeners() {
  // Switch Month
  monthInput.addEventListener('change', (e) => {
    state.currentMonth = e.target.value;
    render();
  });

  // Switch Type (Expense / Income)
  toggleExpenseBtn.addEventListener('click', () => {
    state.currentType = 'expense';
    toggleExpenseBtn.classList.add('active');
    toggleIncomeBtn.classList.remove('active');
    renderCategories();
  });

  toggleIncomeBtn.addEventListener('click', () => {
    state.currentType = 'income';
    toggleIncomeBtn.classList.add('active');
    toggleExpenseBtn.classList.remove('active');
    renderCategories();
  });

  // Auto format ô nhập tiền khi gõ (1.000.000)
  const amountInput = document.getElementById('tx-amount');
  amountInput.addEventListener('input', (e) => {
    // Chỉ lấy các chữ số
    let rawValue = e.target.value.replace(/\D/g, '');
    if (rawValue) {
      // Định dạng dấu chấm phân tách hàng nghìn
      e.target.value = new Intl.NumberFormat('vi-VN').format(parseInt(rawValue, 10));
    } else {
      e.target.value = '';
    }
  });

  // Tự động định dạng thêm '/' khi gõ ngày tháng (DD/MM/YYYY)
  txDateInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, ''); // chỉ giữ số
    if (value.length > 8) value = value.slice(0, 8); // tối đa 8 số
    
    let formatted = '';
    if (value.length > 0) {
      formatted = value.substring(0, 2);
      if (value.length > 2) {
        formatted += '/' + value.substring(2, 4);
        if (value.length > 4) {
          formatted += '/' + value.substring(4, 8);
        }
      }
    }
    e.target.value = formatted;
  });

  // Form Submit (Thêm Giao Dịch)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawAmountStr = amountInput.value.replace(/\D/g, '');
    const amount = parseFloat(rawAmountStr);
    const category = categorySelect.value;
    let rawDate = txDateInput.value.trim();
    const date = convertVNToISO(rawDate);
    const payment = document.getElementById('tx-payment').value;
    const note = document.getElementById('tx-note').value.trim();

    if (!amount || amount <= 0 || !date) return;

    const newTx = {
      id: Date.now().toString(),
      type: state.currentType,
      amount,
      category,
      date,
      payment,
      note
    };

    state.transactions.unshift(newTx);
    await saveData();

    // Reset Form
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';

    // Gửi thông báo chi tiết giao dịch tức thì qua Discord
    sendDiscordTransactionAlert(newTx);

    render();
  });

  // Search & Filter
  searchInput.addEventListener('input', renderTable);
  filterTypeSelect.addEventListener('change', renderTable);

  // Theme Toggle
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    saveData();
  });

  // Modal Budget
  const cycleSelect = document.getElementById('cycle-start-day');
  const webhookInput = document.getElementById('discord-webhook-input');
  const botTokenInput = document.getElementById('discord-bot-token-input');
  document.getElementById('btn-budget').addEventListener('click', () => {
    const currentBudget = state.budgets[state.currentMonth] || 0;
    budgetInput.value = currentBudget ? new Intl.NumberFormat('vi-VN').format(currentBudget) : '';
    if (cycleSelect) cycleSelect.value = state.cycleStartDay || 7;
    if (webhookInput) webhookInput.value = state.discordWebhook || '';
    if (botTokenInput) botTokenInput.value = state.botToken || '';
    modalBudget.classList.add('show');
  });

  // Tự động định dạng dấu chấm hàng nghìn cho input Ngân sách
  budgetInput.addEventListener('input', (e) => {
    let rawValue = e.target.value.replace(/\D/g, '');
    if (rawValue) {
      e.target.value = new Intl.NumberFormat('vi-VN').format(parseInt(rawValue, 10));
    } else {
      e.target.value = '';
    }
  });

  document.getElementById('btn-close-budget').addEventListener('click', () => {
    modalBudget.classList.remove('show');
  });
  document.getElementById('btn-cancel-budget').addEventListener('click', () => {
    modalBudget.classList.remove('show');
  });

  document.getElementById('btn-save-budget').addEventListener('click', async () => {
    const rawBudgetStr = budgetInput.value.replace(/\D/g, '');
    const val = parseFloat(rawBudgetStr);
    if (cycleSelect) {
      state.cycleStartDay = parseInt(cycleSelect.value, 10) || 7;
    }
    if (webhookInput) {
      state.discordWebhook = webhookInput.value.trim();
    }
    if (botTokenInput) {
      state.botToken = botTokenInput.value.trim();
    }
    if (!isNaN(val) && val >= 0) {
      state.budgets[state.currentMonth] = val;
    }
    await saveData();
    modalBudget.classList.remove('show');
    render();
  });

  // Export CSV
  document.getElementById('btn-export').addEventListener('click', async () => {
    const monthlyTxs = getFilteredMonthlyTransactions();
    if (monthlyTxs.length === 0) {
      alert('Không có dữ liệu giao dịch trong tháng này để xuất!');
      return;
    }

    let csvContent = 'Ngày,Loại,Danh Mục,Nội Dung,Phương Thức,Số Tiền (VNĐ)\n';
    monthlyTxs.forEach(tx => {
      const catName = getCategoryName(tx.type, tx.category);
      const typeStr = tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu';
      const cleanNote = `"${(tx.note || '').replace(/"/g, '""')}"`;
      csvContent += `${tx.date},${typeStr},${catName},${cleanNote},${tx.payment},${tx.amount}\n`;
    });

    const defaultName = `chi-tieu-${state.currentMonth}.csv`;
    const result = await window.api.exportCSV({ csvContent, defaultName });
    if (result.success) {
      alert(`Đã xuất báo cáo CSV thành công vào file:\n${result.filePath}`);
    }
  });
}

// Lấy danh sách giao dịch thuộc chu kỳ tính tiền (ví dụ: ngày 7 tháng này -> ngày 6 tháng sau)
function getFilteredMonthlyTransactions() {
  const cycleDay = state.cycleStartDay || 1;
  const [yearStr, monthStr] = state.currentMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12

  if (cycleDay === 1) {
    // Chu kỳ từ ngày 1 đến ngày cuối tháng
    return state.transactions.filter(tx => tx.date.startsWith(state.currentMonth));
  }

  // Ngày bắt đầu chu kỳ: YYYY-MM-cycleDay
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(cycleDay).padStart(2, '0')}`;

  // Ngày kết thúc chu kỳ: Tháng sau - (cycleDay - 1)
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }
  const endDay = cycleDay - 1;
  const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  return state.transactions.filter(tx => {
    return tx.date >= startDateStr && tx.date <= endDateStr;
  });
}

function getCategoryName(type, catId) {
  const list = CATEGORIES[type] || [];
  const found = list.find(c => c.id === catId);
  return found ? found.name : catId;
}

function render() {
  renderSummary();
  renderTable();
  renderChart();
  if (window.lucide) lucide.createIcons();
}

function renderSummary() {
  const monthlyTxs = getFilteredMonthlyTransactions();
  let totalIncome = 0;
  let totalExpense = 0;

  monthlyTxs.forEach(tx => {
    if (tx.type === 'income') totalIncome += tx.amount;
    else totalExpense += tx.amount;
  });

  const balance = totalIncome - totalExpense;
  const budget = state.budgets[state.currentMonth] || 0;

  statIncome.textContent = formatCurrency(totalIncome);
  statExpense.textContent = formatCurrency(totalExpense);
  statBalance.textContent = formatCurrency(balance);

  // Tiến độ Ngân sách
  if (budget > 0) {
    const pctReal = (totalExpense / budget) * 100;
    const pct = Math.min(Math.round(pctReal), 100);
    statBudgetProgress.textContent = `${pct}% (${formatCurrency(totalExpense)} / ${formatCurrency(budget)})`;
    budgetBarFill.style.width = `${pct}%`;
    budgetBarFill.style.backgroundColor = pct >= 90 ? '#ef4444' : '#f59e0b';

    // Kiểm tra và gửi thông báo qua Discord Webhook
    checkAndSendDiscordAlert(pctReal, totalExpense, budget);
  } else {
    statBudgetProgress.textContent = 'Chưa thiết lập';
    budgetBarFill.style.width = '0%';
  }
}

// Hàm gửi thông báo qua Discord Webhook
async function checkAndSendDiscordAlert(percentage, totalExpense, budget) {
  if (!state.discordWebhook) return;

  const milestones = [
    { key: '80', min: 80, text: '⚠️ Cảnh báo: Chi tiêu trong chu kỳ lương của bạn đã đạt mức **80%** ngân sách!' },
    { key: '90', min: 90, text: '🚨 Cảnh báo khẩn cấp: Chi tiêu của bạn đã đạt mức **90%** ngân sách!' },
    { key: '100', min: 100, text: '🔥 Báo động đỏ: Chi tiêu của bạn đã vượt quá **100%** ngân sách chu kỳ lương này!' }
  ];

  for (const milestone of milestones) {
    const notifiedKey = `${state.currentMonth}-${milestone.key}`;
    if (percentage >= milestone.min && !state.notifiedMilestones[notifiedKey]) {
      // Đánh dấu đã gửi
      state.notifiedMilestones[notifiedKey] = true;
      await saveData();

      // Payload tin nhắn Discord
      const embedPayload = {
        username: "MoneyCare Assistant",
        avatar_url: "https://cdn-icons-png.flaticon.com/512/2489/2489756.png",
        content: `**THÔNG BÁO TÀI CHÍNH CHU KỲ ${state.currentMonth}**`,
        embeds: [
          {
            title: milestone.text,
            color: percentage >= 100 ? 15548997 : (percentage >= 90 ? 15105570 : 16776960), // Red, Orange, Yellow
            fields: [
              { name: "Đã chi tiêu", value: `**${formatCurrency(totalExpense)}**`, inline: true },
              { name: "Hạn mức ngân sách", value: `**${formatCurrency(budget)}**`, inline: true },
              { name: "Tỷ lệ chi tiêu", value: `**${Math.round(percentage)}%**`, inline: true },
              { name: "Số dư còn lại", value: `**${formatCurrency(budget - totalExpense)}**`, inline: false }
            ],
            footer: {
              text: "MoneyCare Pro - Ứng dụng Quản lý tài chính cá nhân"
            },
            timestamp: new Date().toISOString()
          }
        ]
      };

      try {
        await fetch(state.discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(embedPayload)
        });
        console.log(`Đã gửi thông báo Discord cho mốc ${milestone.key}%`);
      } catch (err) {
        console.error("Lỗi gửi Webhook Discord:", err);
      }
    }
  }
}

// Hàm gửi thông báo chi tiết giao dịch tức thời lên Discord
async function sendDiscordTransactionAlert(tx) {
  if (!state.discordWebhook) return;

  const isExpense = tx.type === 'expense';
  const typeLabel = isExpense ? '💸 CHI TIÊU MỚI' : '💰 THU NHẬP MỚI';
  const embedColor = isExpense ? 15548997 : 3066993; // Đỏ (Chi tiêu) hoặc Xanh lá (Thu nhập)
  const catName = getCategoryName(tx.type, tx.category);

  const embedPayload = {
    username: "MoneyCare Assistant",
    avatar_url: "https://cdn-icons-png.flaticon.com/512/2489/2489756.png",
    content: `**Giao dịch mới vừa được ghi chép!**`,
    embeds: [
      {
        title: typeLabel,
        color: embedColor,
        fields: [
          { name: "Số tiền", value: `**${isExpense ? '-' : '+'}${formatCurrency(tx.amount)}**`, inline: true },
          { name: "Danh mục", value: `**${catName}**`, inline: true },
          { name: "Ngày giao dịch", value: `*${formatDateVN(tx.date)}*`, inline: true },
          { name: "Hình thức", value: tx.payment, inline: true },
          { name: "Ghi chú", value: tx.note || "Không có ghi chú", inline: false }
        ],
        footer: {
          text: "MoneyCare Pro"
        },
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    await fetch(state.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedPayload)
    });
    console.log("Đã gửi thông báo giao dịch thành công lên Discord");
  } catch (err) {
    console.error("Lỗi gửi thông báo giao dịch lên Discord Webhook:", err);
  }
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function renderTable() {
  let monthlyTxs = getFilteredMonthlyTransactions();

  // Search filter
  const query = searchInput.value.toLowerCase().trim();
  const filterType = filterTypeSelect.value;

  if (filterType !== 'all') {
    monthlyTxs = monthlyTxs.filter(tx => tx.type === filterType);
  }

  if (query) {
    monthlyTxs = monthlyTxs.filter(tx => {
      const catName = getCategoryName(tx.type, tx.category).toLowerCase();
      const noteStr = (tx.note || '').toLowerCase();
      const amountStr = tx.amount.toString();
      const formattedDate = formatDateVN(tx.date);
      return catName.includes(query) || noteStr.includes(query) || amountStr.includes(query) || formattedDate.includes(query);
    });
  }

  txCountBadge.textContent = `${monthlyTxs.length} giao dịch`;

  if (monthlyTxs.length === 0) {
    txListBody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  txListBody.innerHTML = monthlyTxs.map(tx => {
    const isExpense = tx.type === 'expense';
    const amountClass = isExpense ? 'amount-expense' : 'amount-income';
    const prefix = isExpense ? '-' : '+';
    const catName = getCategoryName(tx.type, tx.category);

    return `
      <tr>
        <td>${formatDateVN(tx.date)}</td>
        <td><span class="badge-category">${catName}</span></td>
        <td>${tx.note || '—'}</td>
        <td><small>${tx.payment}</small></td>
        <td class="text-right ${amountClass}">${prefix} ${formatCurrency(tx.amount)}</td>
        <td class="text-center">
          <button class="btn-action-delete" onclick="deleteTransaction('${tx.id}')" title="Xóa">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function deleteTransaction(id) {
  if (confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) {
    state.transactions = state.transactions.filter(tx => tx.id !== id);
    await saveData();
    render();
  }
}

function renderChart() {
  const ctx = document.getElementById('category-chart').getContext('2d');
  const monthlyTxs = getFilteredMonthlyTransactions().filter(tx => tx.type === 'expense');

  // Gom nhóm chi tiêu theo Category
  const catMap = {};
  monthlyTxs.forEach(tx => {
    const catName = getCategoryName('expense', tx.category);
    catMap[catName] = (catMap[catName] || 0) + tx.amount;
  });

  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  if (categoryChart) {
    categoryChart.destroy();
  }

  if (labels.length === 0) {
    categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Chưa có chi tiêu'],
        datasets: [{ data: [1], backgroundColor: ['#334155'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
    return;
  }

  const colors = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
  ];

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: state.theme === 'dark' ? '#94a3b8' : '#475569' }
        }
      }
    }
  });
}
