// クレジットカー支払い情報
const CARD_INFO = {
  イオン: {
    name: 'イオンカード',
    closingDate: 10,    // 10日締め
    paymentDate: 2      // 翌月2日払い
  },
  d: {
    name: 'dカード',
    closingDate: 15,    // 15日締め
    paymentDate: 10     // 翌月10日払い
  }
};

// 現在表示中の月のオフセット
let currentMonthOffset = 0;

// ローカルストレージから支出データを読み込み
function loadExpenses() {
  const stored = localStorage.getItem('expenses');
  return stored ? JSON.parse(stored) : [];
}

// ローカルストレージに支出データを保存
function saveExpenses(expenses) {
  localStorage.setItem('expenses', JSON.stringify(expenses));
}

// 今日の日付をYYYY-MM-DD形式で返す
function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// 日付文字列をDateオブジェクトに変換
function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return new Date(year, month - 1, day);
}

// Dateオブジェクトをカレンダー表示用の年月を取得
function getMonthInfo(offset = 0) {
  const today = new Date();
  const targetDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return {
    year: targetDate.getFullYear(),
    month: targetDate.getMonth(),
    monthDisplay: `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月`
  };
}

// カレンダーを生成
function generateCalendar(offsetChange = 0) {
  // 月のオフセットを更新
  currentMonthOffset += offsetChange;
  
  const monthInfo = getMonthInfo(currentMonthOffset);
  const firstDay = new Date(monthInfo.year, monthInfo.month, 1);
  const lastDay = new Date(monthInfo.year, monthInfo.month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const expenses = loadExpenses();
  
  // 日付ごとの支出を集計
  const dailyExpense = {};
  expenses.forEach(exp => {
    const expDate = parseDate(exp.date);
    if (expDate.getFullYear() === monthInfo.year && expDate.getMonth() === monthInfo.month) {
      const day = expDate.getDate();
      if (!dailyExpense[day]) dailyExpense[day] = 0;
      dailyExpense[day] += exp.amount;
    }
  });

  const calendarGrid = document.getElementById('calendar');
  calendarGrid.innerHTML = '';

  // 前月の日付
  const prevLastDay = new Date(monthInfo.year, monthInfo.month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day other-month';
    dayEl.innerHTML = `<div class="calendar-day-number">${prevLastDay - i}</div>`;
    calendarGrid.appendChild(dayEl);
  }

  // 今月の日付
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === monthInfo.year && today.getMonth() === monthInfo.month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    if (day === todayDate) dayEl.classList.add('today');
    
    // クリック可能にする処理
    dayEl.style.cursor = 'pointer';
    const dateStr = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dayEl.addEventListener('click', () => {
      document.getElementById('expenseDate').value = dateStr;
      document.getElementById('expenseDate').focus();
    });

    let html = `<div class="calendar-day-number">${day}</div>`;
    if (dailyExpense[day]) {
      html += `<div class="calendar-day-amount">¥${dailyExpense[day].toLocaleString()}</div>`;
    }
    dayEl.innerHTML = html;
    calendarGrid.appendChild(dayEl);
  }

  // 次月の日付
  const remainingDays = 42 - (startingDayOfWeek + daysInMonth);
  for (let day = 1; day <= remainingDays; day++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day other-month';
    dayEl.innerHTML = `<div class="calendar-day-number">${day}</div>`;
    calendarGrid.appendChild(dayEl);
  }

  // タイトルを更新
  document.getElementById('calendarTitle').textContent = monthInfo.monthDisplay;

  // 支払い情報を表示
  updatePaymentInfo(monthInfo);
}

// 支払い情報を表示
function updatePaymentInfo(monthInfo) {
  const expenses = loadExpenses();
  const paymentInfo = document.getElementById('paymentInfo');
  
  // 翌月の情報を取得
  const nextMonthInfo = getMonthInfo(currentMonthOffset + 1);
  
  // イオンカード：10日締め→翌月2日払い
  // 表示月の前月11日～表示月10日の支出が、翌月に引き落とし
  const aeonTotal = expenses
    .filter(exp => {
      if (exp.cardType !== 'イオン') return false;
      const expDate = parseDate(exp.date);
      
      // 前月11日から、表示月の10日までの支出
      const prevMonthInfo = getMonthInfo(currentMonthOffset - 1);
      const startDate = new Date(prevMonthInfo.year, prevMonthInfo.month, CARD_INFO.イオン.closingDate + 1);
      const endDate = new Date(monthInfo.year, monthInfo.month, CARD_INFO.イオン.closingDate);
      
      return expDate >= startDate && expDate <= endDate;
    })
    .reduce((sum, exp) => sum + exp.amount, 0);
  
  // dカード：15日締め→翌月10日払い
  // 表示月の前月16日～表示月15日の支出が、翌月に引き落とし
  const dTotal = expenses
    .filter(exp => {
      if (exp.cardType !== 'd') return false;
      const expDate = parseDate(exp.date);
      
      // 前月16日から、表示月の15日までの支出
      const prevMonthInfo = getMonthInfo(currentMonthOffset - 1);
      const startDate = new Date(prevMonthInfo.year, prevMonthInfo.month, CARD_INFO.d.closingDate + 1);
      const endDate = new Date(monthInfo.year, monthInfo.month, CARD_INFO.d.closingDate);
      
      return expDate >= startDate && expDate <= endDate;
    })
    .reduce((sum, exp) => sum + exp.amount, 0);

  const aeonPaymentDate = new Date(nextMonthInfo.year, nextMonthInfo.month, CARD_INFO.イオン.paymentDate);
  const dPaymentDate = new Date(nextMonthInfo.year, nextMonthInfo.month, CARD_INFO.d.paymentDate);

  paymentInfo.innerHTML = `
    <p class="payment-aeon">
      <strong>イオンカード${aeonPaymentDate.getMonth() + 1}月引き落とし</strong><br>
      ¥${aeonTotal.toLocaleString()}
    </p>
    <p class="payment-d">
      <strong>dカード${dPaymentDate.getMonth() + 1}月引き落とし</strong><br>
      ¥${dTotal.toLocaleString()}
    </p>
  `;
}

// 支出を追加
function addExpense() {
  const dateEl = document.getElementById('expenseDate');
  const categoryEl = document.getElementById('category');
  const descriptionEl = document.getElementById('description');
  const amountEl = document.getElementById('amount');
  const cardTypeEl = document.getElementById('cardType');

  const date = dateEl.value;
  const category = categoryEl.value;
  const description = descriptionEl.value;
  const amount = parseInt(amountEl.value);
  const cardType = cardTypeEl.value;

  if (!date || !category || !amount || amount <= 0) {
    alert('日付、科目、金額は必須です');
    return;
  }

  const expenses = loadExpenses();
  const newExpense = {
    id: Date.now(),
    date,
    category,
    description,
    amount,
    cardType
  };

  expenses.push(newExpense);
  saveExpenses(expenses);

  // フォームをリセット
  dateEl.value = getTodayString();
  categoryEl.value = '';
  descriptionEl.value = '';
  amountEl.value = '';

  // UIを更新（currentMonthOffsetを保持）
  updateExpenseList();
  updateStats();
  generateCalendar(0);
}

// 支出を削除
function deleteExpense(id) {
  if (!confirm('この支出を削除しますか？')) return;
  
  const expenses = loadExpenses();
  const filtered = expenses.filter(exp => exp.id !== id);
  saveExpenses(filtered);
  updateExpenseList();
  updateStats();
  generateCalendar(0);
}

// グローバルスコープに登録
window.deleteExpense = deleteExpense;

// 支出一覧を表示
function updateExpenseList() {
  const expenses = loadExpenses();
  const list = document.getElementById('expenseList');

  if (expenses.length === 0) {
    list.innerHTML = '<p class="placeholder">まだ記録がありません</p>';
    return;
  }

  // 日付でソート（新しい順）
  const sorted = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

  list.innerHTML = sorted.map(exp => `
    <div class="expense-item" data-id="${exp.id}">
      <div class="expense-item-info">
        <div class="expense-item-date">${exp.date} - ${exp.category}</div>
        ${exp.description ? `<div class="expense-item-description">${exp.description}</div>` : ''}
        <div class="expense-item-card">支払い: ${exp.cardType}</div>
      </div>
      <div class="expense-item-amount">¥${exp.amount.toLocaleString()}</div>
      <button class="expense-item-delete" type="button" onclick="window.deleteExpense(${exp.id})">削除</button>
    </div>
  `).join('');
}

// 統計情報を更新
function updateStats() {
  const expenses = loadExpenses();
  const stats = document.getElementById('stats');

  const totals = {};
  expenses.forEach(exp => {
    if (!totals[exp.cardType]) totals[exp.cardType] = 0;
    totals[exp.cardType] += exp.amount;
  });

  const cardTypes = ['現金', 'イオン', 'd'];
  stats.innerHTML = cardTypes.map(card => {
    const total = totals[card] || 0;
    return `
      <div class="stat-card">
        <h3>${card}</h3>
        <div class="stat-amount">¥${total.toLocaleString()}</div>
      </div>
    `;
  }).join('');
}

// 初期化
function init() {
  // 今日の日付を設定
  document.getElementById('expenseDate').value = getTodayString();

  // カレンダー表示（currentMonthOffset は既に 0）
  generateCalendar(0);

  // 支出一覧と統計を表示
  updateExpenseList();
  updateStats();

  // イベントリスナー
  document.getElementById('addBtn').addEventListener('click', addExpense);
  document.getElementById('prevMonth').addEventListener('click', () => {
    generateCalendar(-1);
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    generateCalendar(1);
  });
  document.getElementById('todayMonth').addEventListener('click', () => {
    currentMonthOffset = 0;
    generateCalendar(0);
  });
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);
