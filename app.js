const CARD_INFO = {
  "イオン": {
    name: "イオンカード",
    closingDate: 10,
    paymentDate: 2,
  },
  "d": {
    name: "dカード",
    closingDate: 15,
    paymentDate: 10,
  },
};

const STORAGE_KEY = "expenses";
const BUDGET_STORAGE_KEY = "budgetPlans";
const BUDGET_FIELDS = [
  "salary",
  "water",
  "fireInsurance",
  "kyosai",
  "electricity",
  "gas",
  "rent",
  "jiuJitsu",
  "cards",
  "investment",
  "allowance",
  "savings",
  "propertyTax",
  "cashUsage",
];

const FIXED_BUDGET_VALUES = {
  fireInsurance: 5460,
  kyosai: 50000,
  rent: 58147,
  jiuJitsu: 8800,
};

const CREDIT_AVAILABLE_BUFFER = 70000;

// Auto-backup settings
const AUTO_BACKUP_INTERVAL_MS = 60000; // 1 minute
const AUTO_BACKUP_HISTORY_LIMIT = 5;
const AUTO_BACKUP_STORAGE_KEY = "autoBackups";

const state = {
  currentMonthOffset: 0,
  expenses: [],
  activeTab: "ledger",
  budgets: {},
  editingExpenseId: null,
  originalExpense: null,
};

const refs = {
  expenseDate: document.getElementById("expenseDate"),
  category: document.getElementById("category"),
  description: document.getElementById("description"),
  amount: document.getElementById("amount"),
  cardType: document.getElementById("cardType"),
  addBtn: document.getElementById("addBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  formTitle: document.getElementById("formTitle"),
  expenseList: document.getElementById("expenseList"),
  stats: document.getElementById("stats"),
  calendar: document.getElementById("calendar"),
  calendarTitle: document.getElementById("calendarTitle"),
  paymentInfo: document.getElementById("paymentInfo"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  todayMonth: document.getElementById("todayMonth"),
  tabLedger: document.getElementById("tabLedger"),
  tabBudget: document.getElementById("tabBudget"),
  ledgerView: document.getElementById("ledgerView"),
  budgetView: document.getElementById("budgetView"),
  budgetMonthLabel: document.getElementById("budgetMonthLabel"),
  budgetStatus: document.getElementById("budgetStatus"),
  budgetSalary: document.getElementById("budgetSalary"),
  budgetWater: document.getElementById("budgetWater"),
  budgetFireInsurance: document.getElementById("budgetFireInsurance"),
  budgetKyosai: document.getElementById("budgetKyosai"),
  budgetElectricity: document.getElementById("budgetElectricity"),
  budgetGas: document.getElementById("budgetGas"),
  budgetRent: document.getElementById("budgetRent"),
  budgetJiuJitsu: document.getElementById("budgetJiuJitsu"),
  budgetCards: document.getElementById("budgetCards"),
  budgetInvestment: document.getElementById("budgetInvestment"),
  budgetAllowance: document.getElementById("budgetAllowance"),
  budgetSavings: document.getElementById("budgetSavings"),
  budgetSavingsCumulative: document.getElementById("budgetSavingsCumulative"),
  budgetPropertyTax: document.getElementById("budgetPropertyTax"),
  budgetCashUsage: document.getElementById("budgetCashUsage"),
  budgetTotal: document.getElementById("budgetTotal"),
  copyPrevBudgetBtn: document.getElementById("copyPrevBudgetBtn"),
  availableCash: document.getElementById("availableCash"),
  availableCredit: document.getElementById("availableCredit"),
  availableCreditMonth: document.getElementById("availableCreditMonth"),
  backupExportBtn: document.getElementById("backupExportBtn"),
  backupImportBtn: document.getElementById("backupImportBtn"),
  backupFileInput: document.getElementById("backupFileInput"),
  backupHistoryList: document.getElementById("backupHistoryList"),
};

const budgetInputRefs = {
  salary: refs.budgetSalary,
  water: refs.budgetWater,
  fireInsurance: refs.budgetFireInsurance,
  kyosai: refs.budgetKyosai,
  electricity: refs.budgetElectricity,
  gas: refs.budgetGas,
  rent: refs.budgetRent,
  jiuJitsu: refs.budgetJiuJitsu,
  cards: refs.budgetCards,
  investment: refs.budgetInvestment,
  allowance: refs.budgetAllowance,
  savings: refs.budgetSavings,
  propertyTax: refs.budgetPropertyTax,
  cashUsage: refs.budgetCashUsage,
};

function getTodayString() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthInfo(offset = 0) {
  const today = new Date();
  const targetDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return {
    year: targetDate.getFullYear(),
    month: targetDate.getMonth(),
    monthDisplay: `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月`,
  };
}

function getMonthInfoFromMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    year,
    month: month - 1,
    monthDisplay: `${year}年${month}月`,
  };
}

function getMonthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(monthKey, shift) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const shifted = new Date(monthInfo.year, monthInfo.month + shift, 1);
  return getMonthKeyFromDate(shifted);
}

function formatYen(value) {
  return `¥${Math.round(value).toLocaleString()}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeExpense(expense) {
  return {
    id: String(expense.id ?? Date.now()),
    date: expense.date ?? getTodayString(),
    category: expense.category ?? "",
    description: expense.description ?? "",
    amount: Number(expense.amount) || 0,
    cardType: expense.cardType ?? "現金",
  };
}

function sortExpenses(expenses) {
  return [...expenses].sort((left, right) => {
    const dateDiff = new Date(right.date) - new Date(left.date);
    if (dateDiff !== 0) return dateDiff;
    return Number(right.id) - Number(left.id);
  });
}

function loadLocalExpenses() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? sortExpenses(parsed.map(normalizeExpense)) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveLocalExpenses(expenses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sortExpenses(expenses)));
}

function getCurrentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeyFromOffset(offset) {
  const monthInfo = getMonthInfo(offset);
  return `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, "0")}`;
}

function getEmptyBudgetPlan() {
  return {
    salary: 0,
    water: 0,
    fireInsurance: FIXED_BUDGET_VALUES.fireInsurance,
    kyosai: FIXED_BUDGET_VALUES.kyosai,
    electricity: 0,
    gas: 0,
    rent: FIXED_BUDGET_VALUES.rent,
    jiuJitsu: FIXED_BUDGET_VALUES.jiuJitsu,
    cards: 0,
    investment: 0,
    allowance: 0,
    savings: 0,
    propertyTax: 0,
    cashUsage: 0,
  };
}

function getSavingsCumulative(monthKey) {
  return Object.entries(state.budgets)
    .filter(([key]) => key <= monthKey)
    .reduce((sum, [, plan]) => sum + (Number(plan?.savings) || 0), 0);
}

function updateSavingsCumulative(monthKey) {
  if (!refs.budgetSavingsCumulative) return;
  const cumulative = getSavingsCumulative(monthKey);
  refs.budgetSavingsCumulative.textContent = `これまでの積み立て合計: ¥${cumulative.toLocaleString()}`;
}

function renderBudgetForCurrentMonth() {
  const monthKey = getSelectedBudgetMonth();
  try {
    renderBudgetForm(monthKey);
    refs.budgetStatus.textContent = `${monthKey} の予算案を表示中`;
  } catch (error) {
    console.error(error);
    refs.budgetStatus.textContent = "予算案の表示に失敗しました";
  }
}

function normalizeBudgetPlan(rawPlan = {}) {
  const plan = getEmptyBudgetPlan();
  BUDGET_FIELDS.forEach((field) => {
    const value = Number(rawPlan[field]);
    plan[field] = Number.isFinite(value) && value > 0 ? value : 0;
  });
  return plan;
}

function loadBudgetPlans() {
  const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return {};

    const result = {};
    Object.entries(parsed).forEach(([monthKey, plan]) => {
      result[monthKey] = normalizeBudgetPlan(plan);
    });
    return result;
  } catch (error) {
    console.error(error);
    return {};
  }
}

function saveBudgetPlans() {
  localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(state.budgets));
}

function getSelectedBudgetMonth() {
  return getMonthKeyFromOffset(state.currentMonthOffset);
}

function getBudgetFormValues() {
  const values = {};
  BUDGET_FIELDS.forEach((field) => {
    const value = Number(budgetInputRefs[field].value);
    values[field] = Number.isFinite(value) && value > 0 ? value : 0;
  });
  return values;
}

function getBudgetPlanWithCalculatedCards(monthKey) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = normalizeBudgetPlan(state.budgets[monthKey]);
  applyFixedBudgetValues(plan);
  plan.cards = getCardsPaymentForMonth(monthInfo);
  plan.cashUsage = calculateCashExpenseTotalForMonth(monthKey);
  return plan;
}

function calculateOwnMonthBudgetTotal(plan) {
  const outflow = BUDGET_FIELDS.filter((field) => field !== "salary")
    .reduce((sum, field) => sum + (plan[field] ?? 0), 0);
  return (plan.salary ?? 0) - outflow;
}

function calculateBudgetTotalWithCarryOver(monthKey, memo = new Map()) {
  if (memo.has(monthKey)) {
    return memo.get(monthKey);
  }

  const plan = getBudgetPlanWithCalculatedCards(monthKey);
  const ownTotal = calculateOwnMonthBudgetTotal(plan);
  const previousMonthKey = shiftMonthKey(monthKey, -1);
  const previousCarry = state.budgets[previousMonthKey]
    ? calculateBudgetTotalWithCarryOver(previousMonthKey, memo)
    : 0;
  const total = ownTotal + previousCarry;
  memo.set(monthKey, total);
  return total;
}

function updateBudgetTotal(monthKey) {
  const total = calculateBudgetTotalWithCarryOver(monthKey);
  refs.budgetTotal.value = `¥${total.toLocaleString()}`;
}

function calculateCreditAvailableAmount(currentMonthKey) {
  const billingMonthKey = shiftMonthKey(currentMonthKey, 2);
  const billingMonthPlan = getBudgetPlanWithCalculatedCards(billingMonthKey);
  const billingMonthInfo = getMonthInfoFromMonthKey(billingMonthKey);
  const billingTotal = getTotalCardBillingForMonth(billingMonthInfo);
  const fixedCost = BUDGET_FIELDS
    .filter((field) => !["salary", "cards", "allowance", "savings", "cashUsage"].includes(field))
    .reduce((sum, field) => sum + (billingMonthPlan[field] ?? 0), 0);
  const available = (billingMonthPlan.salary ?? 0) - fixedCost - CREDIT_AVAILABLE_BUFFER - billingTotal;
  return {
    billingMonthKey,
    available: Math.max(0, available),
  };
}

function calculateCashExpenseTotalForMonth(monthKey) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  return state.expenses
    .filter((expense) => {
      if (expense.cardType !== "現金") return false;
      const expenseDate = parseDate(expense.date);
      return (
        expenseDate.getFullYear() === monthInfo.year &&
        expenseDate.getMonth() === monthInfo.month
      );
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function renderMonthlyAvailableSummary() {
  if (!refs.availableCash || !refs.availableCredit || !refs.availableCreditMonth) {
    return;
  }

  const displayMonthKey = getMonthKeyFromOffset(state.currentMonthOffset);
  const cashAvailable = calculateBudgetTotalWithCarryOver(displayMonthKey);
  const creditInfo = calculateCreditAvailableAmount(displayMonthKey);
  const billingMonthInfo = getMonthInfoFromMonthKey(creditInfo.billingMonthKey);

  refs.availableCash.textContent = formatYen(cashAvailable);
  refs.availableCredit.textContent = formatYen(creditInfo.available);
  refs.availableCreditMonth.textContent = `請求月: ${billingMonthInfo.monthDisplay}`;
}

function applyFixedBudgetValues(plan) {
  plan.fireInsurance = FIXED_BUDGET_VALUES.fireInsurance;
  plan.kyosai = FIXED_BUDGET_VALUES.kyosai;
  plan.rent = FIXED_BUDGET_VALUES.rent;
  plan.jiuJitsu = FIXED_BUDGET_VALUES.jiuJitsu;
}

function getCardsPaymentForMonth(monthInfo) {
  const aeon = calculateCardBill("イオン", monthInfo);
  const d = calculateCardBill("d", monthInfo);
  return aeon + d;
}

function getTotalCardBillingForMonth(monthInfo) {
  const aeonCardTotal = calculateCardBill("イオン", monthInfo);
  const aeonEtcTotal = calculateEtcBillForAeon(monthInfo);
  const dCardTotal = calculateCardBill("d", monthInfo);
  return aeonCardTotal + aeonEtcTotal + dCardTotal;
}

function renderBudgetForm(monthKey) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = getBudgetPlanWithCalculatedCards(monthKey);
  state.budgets[monthKey] = plan;
  saveBudgetPlans();

  BUDGET_FIELDS.forEach((field) => {
    budgetInputRefs[field].value = plan[field] || "";
  });
  refs.budgetMonthLabel.textContent = `対象月: ${monthInfo.monthDisplay}`;
  updateBudgetTotal(monthKey);
  updateSavingsCumulative(monthKey);
}

function saveBudgetForSelectedMonth() {
  const monthKey = getSelectedBudgetMonth();
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = getBudgetFormValues();
  applyFixedBudgetValues(plan);
  plan.cards = getCardsPaymentForMonth(monthInfo);
  plan.cashUsage = calculateCashExpenseTotalForMonth(monthKey);
  state.budgets[monthKey] = plan;
  saveBudgetPlans();
  updateBudgetTotal(monthKey);
  updateSavingsCumulative(monthKey);
  renderMonthlyAvailableSummary();
  refs.budgetStatus.textContent = `${monthKey} の予算案を保存しました`;
}

function copyPreviousMonthBudget() {
  const currentMonthKey = getSelectedBudgetMonth();
  const previousMonthKey = shiftMonthKey(currentMonthKey, -1);
  const previousPlan = state.budgets[previousMonthKey];

  if (!previousPlan) {
    refs.budgetStatus.textContent = `${previousMonthKey} の予算案がないためコピーできません`;
    return;
  }

  const currentMonthInfo = getMonthInfoFromMonthKey(currentMonthKey);
  const copiedPlan = normalizeBudgetPlan(previousPlan);
  applyFixedBudgetValues(copiedPlan);
  copiedPlan.cards = getCardsPaymentForMonth(currentMonthInfo);
  copiedPlan.cashUsage = calculateCashExpenseTotalForMonth(currentMonthKey);

  state.budgets[currentMonthKey] = copiedPlan;
  saveBudgetPlans();
  renderBudgetForm(currentMonthKey);
  renderMonthlyAvailableSummary();
  refs.budgetStatus.textContent = `${previousMonthKey} の予算案を ${currentMonthKey} にコピーしました`;
}

function createBackupPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses: state.expenses,
    budgets: state.budgets,
  };
}

function exportBackup() {
  try {
    const payload = createBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const filename = `kakeibo-backup-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.json`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    refs.budgetStatus.textContent = "バックアップファイルを保存しました";
  } catch (error) {
    console.error(error);
    alert("バックアップ保存に失敗しました");
  }
}

function parseAndRestoreBackup(text) {
  const parsed = JSON.parse(text);
  const restoredExpenses = Array.isArray(parsed?.expenses)
    ? sortExpenses(parsed.expenses.map(normalizeExpense))
    : [];
  const restoredBudgets = {};

  if (parsed?.budgets && typeof parsed.budgets === "object") {
    Object.entries(parsed.budgets).forEach(([monthKey, plan]) => {
      restoredBudgets[monthKey] = normalizeBudgetPlan(plan);
    });
  }

  state.expenses = restoredExpenses;
  state.budgets = restoredBudgets;
  saveLocalExpenses(state.expenses);
  saveBudgetPlans();
  renderAll();
  renderBudgetForCurrentMonth();
  refs.budgetStatus.textContent = "バックアップから復元しました";
}

async function importBackupFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    parseAndRestoreBackup(text);
  } catch (error) {
    console.error(error);
    alert("バックアップ復元に失敗しました。ファイル形式を確認してください。");
  } finally {
    refs.backupFileInput.value = "";
  }
}

// Auto-backup functions
function saveAutoBackup() {
  try {
    const backup = {
      ...createBackupPayload(),
      id: Date.now(),
      label: new Date().toLocaleString("ja-JP"),
    };

    let history = [];
    const stored = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    if (stored) {
      try {
        history = JSON.parse(stored);
      } catch {
        history = [];
      }
    }

    // Add new backup and keep only latest entries
    history.unshift(backup);
    history = history.slice(0, AUTO_BACKUP_HISTORY_LIMIT);
    localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, JSON.stringify(history));

    renderBackupHistory();
  } catch (error) {
    console.error("Auto-backup failed:", error);
  }
}

function getBackupHistory() {
  try {
    const stored = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function restoreFromAutoBackup(backupId) {
  const history = getBackupHistory();
  const backup = history.find((item) => item.id === backupId);

  if (!backup) {
    alert("バックアップが見つかりません");
    return;
  }

  if (
    !confirm(
      `${backup.label} のバックアップから復元しますか?\n現在のデータは上書きされます。`
    )
  ) {
    return;
  }

  const text = JSON.stringify(backup);
  parseAndRestoreBackup(text);
}

function renderBackupHistory() {
  const history = getBackupHistory();

  if (history.length === 0) {
    refs.backupHistoryList.innerHTML =
      '<p class="placeholder">自動バックアップはまだありません</p>';
    return;
  }

  refs.backupHistoryList.innerHTML = history
    .map(
      (backup, index) =>
        `
    <div class="backup-item">
      <div class="backup-info">
        <p class="backup-label">${backup.label}</p>
        <p class="backup-timestamp">#${history.length - index}</p>
      </div>
      <button 
        class="btn btn-small" 
        onclick="restoreFromAutoBackup(${backup.id})"
        type="button"
      >復元</button>
    </div>
    `
    )
    .join("");
}

function startAutoBackup() {
  // Save immediately on init
  saveAutoBackup();

  // Then save every minute
  setInterval(saveAutoBackup, AUTO_BACKUP_INTERVAL_MS);
}

function refreshBudgetViewIfVisible() {
  if (state.activeTab !== "budget") return;
  renderBudgetForCurrentMonth();
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  const isLedger = tabName === "ledger";
  refs.tabLedger.classList.toggle("is-active", isLedger);
  refs.tabBudget.classList.toggle("is-active", !isLedger);
  refs.ledgerView.hidden = !isLedger;
  refs.budgetView.hidden = isLedger;
  if (!isLedger) {
    renderBudgetForCurrentMonth();
  }
}

function renderAll() {
  updateExpenseList();
  updateStats();
  renderCalendar();
  renderMonthlyAvailableSummary();
}

function renderCalendar() {
  const monthInfo = getMonthInfo(state.currentMonthOffset);
  const firstDay = new Date(monthInfo.year, monthInfo.month, 1);
  const lastDay = new Date(monthInfo.year, monthInfo.month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  const dailyExpense = {};

  state.expenses.forEach((expense) => {
    const expenseDate = parseDate(expense.date);
    if (expenseDate.getFullYear() === monthInfo.year && expenseDate.getMonth() === monthInfo.month) {
      const day = expenseDate.getDate();
      dailyExpense[day] = (dailyExpense[day] ?? 0) + expense.amount;
    }
  });

  refs.calendar.innerHTML = "";
  const prevLastDay = new Date(monthInfo.year, monthInfo.month, 0).getDate();
  for (let index = startingDayOfWeek - 1; index >= 0; index -= 1) {
    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day other-month";
    dayEl.innerHTML = `<div class="calendar-day-number">${prevLastDay - index}</div>`;
    refs.calendar.appendChild(dayEl);
  }

  const today = new Date();
  const isVisibleMonthToday =
    today.getFullYear() === monthInfo.year && today.getMonth() === monthInfo.month;
  const todayDate = isVisibleMonthToday ? today.getDate() : null;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayEl = document.createElement("button");
    dayEl.className = "calendar-day";
    dayEl.type = "button";
    if (day === todayDate) {
      dayEl.classList.add("today");
    }

    const dateStr = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    dayEl.addEventListener("click", () => {
      refs.expenseDate.value = dateStr;
      refs.expenseDate.focus();
    });

    let html = `<div class="calendar-day-number">${day}</div>`;
    if (dailyExpense[day]) {
      html += `<div class="calendar-day-amount">¥${dailyExpense[day].toLocaleString()}</div>`;
    }
    dayEl.innerHTML = html;
    refs.calendar.appendChild(dayEl);
  }

  const remainingDays = 42 - (startingDayOfWeek + daysInMonth);
  for (let day = 1; day <= remainingDays; day += 1) {
    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day other-month";
    dayEl.innerHTML = `<div class="calendar-day-number">${day}</div>`;
    refs.calendar.appendChild(dayEl);
  }

  refs.calendarTitle.textContent = monthInfo.monthDisplay;
  updatePaymentInfo(monthInfo);
}

function calculateCardBill(cardKey, monthInfo) {
  const card = CARD_INFO[cardKey];
  // 支払月 monthInfo に対し、前月締め分を請求対象にする
  // 例: 3月支払い = 1/11〜2/10 の利用分
  const closingMonth = new Date(monthInfo.year, monthInfo.month - 1, 1);
  const openingMonth = new Date(monthInfo.year, monthInfo.month - 2, 1);
  const startDate = new Date(
    openingMonth.getFullYear(),
    openingMonth.getMonth(),
    card.closingDate + 1,
  );
  const endDate = new Date(closingMonth.getFullYear(), closingMonth.getMonth(), card.closingDate);

  return state.expenses
    .filter((expense) => {
      if (expense.cardType !== cardKey) return false;
      const expenseDate = parseDate(expense.date);
      return expenseDate >= startDate && expenseDate <= endDate;
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function calculateEtcBillForAeon(monthInfo) {
  return state.expenses
    .filter((expense) => {
      if (expense.category !== "ETC") return false;
      const expenseDate = parseDate(expense.date);
      const billingDate = new Date(expenseDate.getFullYear(), expenseDate.getMonth() + 3, 1);
      return (
        billingDate.getFullYear() === monthInfo.year &&
        billingDate.getMonth() === monthInfo.month
      );
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function updatePaymentInfo(monthInfo) {
  const aeonCardTotal = calculateCardBill("イオン", monthInfo);
  const etcTotal = calculateEtcBillForAeon(monthInfo);
  const aeonTotal = aeonCardTotal + etcTotal;
  const dTotal = calculateCardBill("d", monthInfo);
  const jiuJitsuTotal = FIXED_BUDGET_VALUES.jiuJitsu;
  const grandTotal = aeonTotal + dTotal + jiuJitsuTotal;
  const paymentMonthLabel = `${monthInfo.month + 1}月`;

  refs.paymentInfo.innerHTML = `
    <p class="payment-aeon">
      <strong>イオンカード${paymentMonthLabel}引き落とし</strong><br>
      ¥${aeonTotal.toLocaleString()}（カード: ¥${aeonCardTotal.toLocaleString()} / ETC: ¥${etcTotal.toLocaleString()}）
    </p>
    <p class="payment-d">
      <strong>dカード${paymentMonthLabel}引き落とし</strong><br>
      ¥${dTotal.toLocaleString()}
    </p>
    <p class="payment-jiujitsu">
      <strong>柔術</strong><br>
      ¥${jiuJitsuTotal.toLocaleString()}
    </p>
    <p class="payment-total">
      <strong>${paymentMonthLabel}引き落とし合計</strong><br>
      ¥${grandTotal.toLocaleString()}
    </p>
  `;
}

function updateExpenseList() {
  const monthInfo = getMonthInfo(state.currentMonthOffset);
  const monthlyExpenses = state.expenses.filter((expense) => {
    const expenseDate = parseDate(expense.date);
    return expenseDate.getFullYear() === monthInfo.year && expenseDate.getMonth() === monthInfo.month;
  });

  if (monthlyExpenses.length === 0) {
    refs.expenseList.innerHTML = '<p class="placeholder">この月の記録がありません</p>';
    return;
  }

  refs.expenseList.innerHTML = monthlyExpenses
    .map((expense) => {
      const descriptionHtml = expense.description
        ? `<div class="expense-item-description">${escapeHtml(expense.description)}</div>`
        : "";

      return `
        <div class="expense-item" data-id="${expense.id}">
          <div class="expense-item-info">
            <div class="expense-item-date">${escapeHtml(expense.date)} - ${escapeHtml(expense.category)}</div>
            ${descriptionHtml}
            <div class="expense-item-card">支払い: ${escapeHtml(expense.cardType)}</div>
          </div>
          <div class="expense-item-amount">¥${expense.amount.toLocaleString()}</div>
          <div class="expense-item-buttons">
            <button class="expense-item-edit" type="button" data-expense-id="${expense.id}">編集</button>
            <button class="expense-item-delete" type="button" data-expense-id="${expense.id}">削除</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateStats() {
  const monthInfo = getMonthInfo(state.currentMonthOffset);
  const monthlyExpenses = state.expenses.filter((expense) => {
    const expenseDate = parseDate(expense.date);
    return expenseDate.getFullYear() === monthInfo.year && expenseDate.getMonth() === monthInfo.month;
  });

  const totals = monthlyExpenses.reduce(
    (result, expense) => {
      result[expense.cardType] = (result[expense.cardType] ?? 0) + expense.amount;
      return result;
    },
    { "現金": 0, "イオン": 0, "d": 0 },
  );

  refs.stats.innerHTML = ["現金", "イオン", "d"]
    .map(
      (cardType) => `
        <div class="stat-card">
          <h3>${cardType}</h3>
          <div class="stat-amount">¥${(totals[cardType] ?? 0).toLocaleString()}</div>
        </div>
      `,
    )
    .join("");
}

function saveExpense(expense) {
  state.expenses = sortExpenses([expense, ...state.expenses]);
  saveLocalExpenses(state.expenses);
  renderAll();
  refreshBudgetViewIfVisible();
}

function removeExpense(id) {
  state.expenses = state.expenses.filter((expense) => expense.id !== String(id));
  saveLocalExpenses(state.expenses);
  renderAll();
  refreshBudgetViewIfVisible();
}

function addExpense() {
  const amount = Number(refs.amount.value);
  if (!refs.expenseDate.value || !refs.category.value || !Number.isFinite(amount) || amount <= 0) {
    alert("日付、科目、金額は必須です。");
    return;
  }

  // 編集モード か 新規追加か判定
  if (state.editingExpenseId) {
    const expenseData = {
      id: state.editingExpenseId,
      date: refs.expenseDate.value,
      category: refs.category.value,
      description: refs.description.value.trim(),
      amount,
      cardType: refs.cardType.value,
    };

    refs.addBtn.disabled = true;
    try {
      updateExpense(state.editingExpenseId, expenseData);
      cancelEdit();
    } catch (error) {
      console.error(error);
      alert("修正に失敗しました。もう一度お試しください。");
    } finally {
      refs.addBtn.disabled = false;
    }
  } else {
    const expense = normalizeExpense({
      id: Date.now(),
      date: refs.expenseDate.value,
      category: refs.category.value,
      description: refs.description.value.trim(),
      amount,
      cardType: refs.cardType.value,
    });

    refs.addBtn.disabled = true;
    try {
      saveExpense(expense);
      refs.category.value = "";
      refs.description.value = "";
      refs.amount.value = "";
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。もう一度お試しください。");
    } finally {
      refs.addBtn.disabled = false;
    }
  }
}

function deleteExpense(id) {
  if (!confirm("この支出を削除しますか？")) {
    return;
  }

  try {
    removeExpense(id);
  } catch (error) {
    console.error(error);
    alert("削除に失敗しました。もう一度お試しください。");
  }
}

function startEditExpense(id) {
  const expense = state.expenses.find((e) => String(e.id) === String(id));
  if (!expense) {
    alert("支出が見つかりません");
    return;
  }

  // 編集準備：元の値を保存して、フォームに入力
  state.editingExpenseId = String(id);
  state.originalExpense = { ...expense };

  refs.expenseDate.value = expense.date;
  refs.category.value = expense.category;
  refs.description.value = expense.description;
  refs.amount.value = expense.amount;
  refs.cardType.value = expense.cardType;

  // UI切り替え
  refs.formTitle.textContent = "支出を編集";
  refs.addBtn.textContent = "修正する";
  refs.cancelBtn.hidden = false;
  refs.expenseDate.focus();
}

function cancelEdit() {
  state.editingExpenseId = null;
  state.originalExpense = null;

  // フォームをリセット
  refs.expenseDate.value = getTodayString();
  refs.category.value = "";
  refs.description.value = "";
  refs.amount.value = "";
  refs.cardType.value = "現金";

  // UI切り替え
  refs.formTitle.textContent = "支出を記録";
  refs.addBtn.textContent = "記録する";
  refs.cancelBtn.hidden = true;
}

function updateExpense(id, expense) {
  state.expenses = state.expenses.map((e) =>
    String(e.id) === String(id) ? { ...normalizeExpense(expense) } : e
  );
  saveLocalExpenses(state.expenses);
  renderAll();
  refreshBudgetViewIfVisible();
}

function bindEvents() {
  refs.addBtn.addEventListener("click", addExpense);
  refs.cancelBtn.addEventListener("click", cancelEdit);
  refs.prevMonth.addEventListener("click", () => {
    state.currentMonthOffset -= 1;
    renderAll();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.nextMonth.addEventListener("click", () => {
    state.currentMonthOffset += 1;
    renderAll();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.todayMonth.addEventListener("click", () => {
    state.currentMonthOffset = 0;
    renderAll();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.expenseList.addEventListener("click", (event) => {
    const editButton = event.target.closest(".expense-item-edit");
    if (editButton) {
      startEditExpense(editButton.dataset.expenseId);
      return;
    }

    const deleteButton = event.target.closest(".expense-item-delete");
    if (deleteButton) {
      deleteExpense(deleteButton.dataset.expenseId);
      return;
    }
  });

  refs.tabLedger.addEventListener("click", () => setActiveTab("ledger"));
  refs.tabBudget.addEventListener("click", () => setActiveTab("budget"));
  refs.copyPrevBudgetBtn.addEventListener("click", copyPreviousMonthBudget);
  refs.backupExportBtn.addEventListener("click", exportBackup);
  refs.backupImportBtn.addEventListener("click", () => refs.backupFileInput.click());
  refs.backupFileInput.addEventListener("change", importBackupFromFile);

  Object.values(budgetInputRefs).forEach((input) => {
    input.addEventListener("input", saveBudgetForSelectedMonth);
  });
}

function init() {
  refs.expenseDate.value = getTodayString();
  state.expenses = loadLocalExpenses();
  state.budgets = loadBudgetPlans();
  setActiveTab("ledger");
  renderAll();
  renderBudgetForCurrentMonth();
  bindEvents();
  startAutoBackup();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      
      // Clear old cache versions
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith("kakeibo-cache-") && name !== "kakeibo-cache-v3")
          .map(name => caches.delete(name))
      );
    } catch (error) {
      console.error("Service Worker registration failed", error);
    }
  });
}

init();
registerServiceWorker();
