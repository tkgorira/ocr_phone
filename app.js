// ─── ラズパイDB同期（認証なし・Tailscale内専用） ─────────────────────────

function showSyncNotification(message) {
  const existing = document.getElementById('syncNotification');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'syncNotification';
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: '#1a2a1a', color: '#7ecf7e', border: '1px solid #4caf50',
    borderRadius: '8px', padding: '8px 18px', fontSize: '13px',
    zIndex: '9999', opacity: '1', transition: 'opacity 0.5s',
    pointerEvents: 'none', whiteSpace: 'nowrap',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
  setTimeout(() => { el.remove(); }, 2600);
}

// ラズパイDBからデータを読み込む
async function loadFromLocal() {
  try {
    const res = await fetch('/api/local/data', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { console.error('loadFromLocal error:', e); return null; }
}

// ラズパイDBへ保存（即時）。成功時 true。
async function saveToLocal(onlyBudgetPlans = false) {
  try {
    const expenses    = JSON.parse(localStorage.getItem(STORAGE_KEY)        || '[]');
    const budgetPlans = JSON.parse(localStorage.getItem(BUDGET_STORAGE_KEY) || '{}');
    const payload = { budgetPlans };
    if (!onlyBudgetPlans) payload.expenses = expenses;
    const res = await fetch('/api/local/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { updateSyncBadge('error'); return false; }
    updateSyncBadge('synced');
    return true;
  } catch (e) {
    console.error('saveToLocal error:', e);
    updateSyncBadge('error');
    return false;
  }
}

// 入力中の自動保存用：2秒 debounce
let _syncTimer = null;
function scheduleLocalSync(onlyBudgetPlans = false) {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { _syncTimer = null; saveToLocal(onlyBudgetPlans); }, 2000);
}

function updateSyncBadge(state) {
  const badge = document.getElementById('syncBadge');
  if (!badge) return;
  if (state === 'synced') {
    badge.textContent = 'DB保存済み';
    badge.className   = 'sync-badge premium';
  } else if (state === 'syncing') {
    badge.textContent = '保存中…';
    badge.className   = 'sync-badge free';
  } else if (state === 'error') {
    badge.textContent = '保存エラー';
    badge.className   = 'sync-badge free';
  } else {
    badge.textContent = 'ローカル保存';
    badge.className   = 'sync-badge free';
  }
}

// ─── 指定したオフセットから月キー(YYYY-MM)を取得 ───────────────────────────
function getMonthKeyFromOffset(offset) {
  const info = getMonthInfo(offset);
  return `${info.year}-${String(info.month + 1).padStart(2, "0")}`;
}
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
  "extraIncome",
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

// 予算案はExcel/DB入力値をそのまま使う（アンカー上書きはしない）
const BUDGET_VALUE_ANCHORS = {};

const MIN_MONTH_KEY = "2025-12";
const INITIAL_DATA_FILES = [];
const EXCEL_MONTHLY_MODEL = {
  "2025-12": { cash: 1573, credit: 120000 },
  "2026-01": { cash: 8449, credit: -10400 },
  "2026-02": { cash: 7641, credit: -2003 },
  "2026-03": { cash: 5282, credit: 24312 },
  "2026-04": { cash: 13617, credit: 111190 },
  "2026-05": { cash: 149372, credit: 111190 },
  "2026-06": { cash: 327505 },
  "2026-07": { cash: 505638 },
  "2026-08": { cash: 683771 },
  "2026-09": { cash: 861904 },
  "2026-10": { cash: 1040037 },
  "2026-11": { cash: 1218170 },
  "2026-12": { cash: 1396303 },
};
const CARD_MONTHLY_LIMIT = 120000; // 月あたりのクレカ使用上限（APIファイル基準）

const BUILTIN_FIXED_COSTS = [
  { id: "nttDocomo", label: "NTT docomo wifi費", amount: 5940, cardType: "d" },
  { id: "seikei", label: "整形分割", amount: 21230, cardType: "イオン", endMonthKey: "2026-05" },
  { id: "netflix", label: "Netflix", amount: 1590, cardType: "イオン" },
  { id: "youtube", label: "YouTube Premium", amount: 1280, cardType: "イオン" },
];


// Auto-backup settings
const AUTO_BACKUP_INTERVAL_MS = 60000; // 1 minute
const AUTO_BACKUP_HISTORY_LIMIT = 5;
const AUTO_BACKUP_STORAGE_KEY = "autoBackups";

const state = {
  currentMonthOffset: 0,
  expenses: [],
  activeTab: "ledger",
  budgets: {},
  baselineSnapshot: null,
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
  budgetExtraIncome: document.getElementById("budgetExtraIncome"),
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
  creditFullUseNote: document.getElementById("creditFullUseNote"),
  backupExportBtn: document.getElementById("backupExportBtn"),
  backupImportBtn: document.getElementById("backupImportBtn"),
  backupFileInput: document.getElementById("backupFileInput"),
  backupHistoryList: document.getElementById("backupHistoryList"),
};

const budgetInputRefs = {
  salary: refs.budgetSalary,
  extraIncome: refs.budgetExtraIncome,
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

function compareMonthKeys(left, right) {
  return left.localeCompare(right);
}

function getMonthOffsetFromMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const today = new Date();
  return (year - today.getFullYear()) * 12 + (month - 1 - today.getMonth());
}

function clampMonthOffset(offset) {
  return Math.max(getMonthOffsetFromMonthKey(MIN_MONTH_KEY), offset);
}

function setCurrentMonthOffset(offset) {
  state.currentMonthOffset = clampMonthOffset(offset);
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortExpenses(expenses)));
    scheduleLocalSync();
  } catch (error) {
    console.error("支出データの保存に失敗しました:", error);
    throw error;
  }
}

function getCurrentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}


function getEmptyBudgetPlan() {
  return {
    salary: 0,
    extraIncome: 0,
    water: 0,
    fireInsurance: FIXED_BUDGET_VALUES.fireInsurance,
    kyosai: FIXED_BUDGET_VALUES.kyosai,
    electricity: 0,
    gas: 0,
    rent: FIXED_BUDGET_VALUES.rent,
    jiuJitsu: FIXED_BUDGET_VALUES.jiuJitsu,
    cards: 0,
    aeonAdjustment: 0,
    dAdjustment: 0,
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

function getExtraIncomeCumulative(monthKey) {
  return Object.entries(state.budgets)
    .filter(([key]) => key <= monthKey)
    .reduce((sum, [, plan]) => sum + (Number(plan?.extraIncome) || 0), 0);
}

function updateExtraIncomeCumulative(monthKey) {
  const el = document.getElementById('budgetExtraIncomeCumulative');
  if (!el) return;
  const cumulative = getExtraIncomeCumulative(monthKey);
  el.textContent = `これまでの臨時収入合計: ¥${cumulative.toLocaleString()}`;
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
    // extraIncome の null は「未設定（イベントなし）」として保持。0とは区別する
    if (field === 'extraIncome' && (rawPlan[field] === null || rawPlan[field] === undefined)) {
      plan[field] = null;
      return;
    }
    const value = Number(rawPlan[field]);
    plan[field] = Number.isFinite(value) && value > 0 ? value : 0;
  });
  // 調整値は負の値も許可
  ['aeonAdjustment', 'dAdjustment'].forEach((field) => {
    const value = Number(rawPlan[field]);
    plan[field] = Number.isFinite(value) ? value : 0;
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
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(state.budgets));
    scheduleLocalSync(true);
  } catch (error) {
    console.error("予算データの保存に失敗しました:", error);
  }
}

function parseBackupPayload(parsed) {
  const restoredExpenses = Array.isArray(parsed?.expenses)
    ? sortExpenses(parsed.expenses.map(normalizeExpense))
    : [];
  const restoredBudgets = {};

  if (parsed?.budgets && typeof parsed.budgets === "object") {
    Object.entries(parsed.budgets).forEach(([monthKey, plan]) => {
      restoredBudgets[monthKey] = normalizeBudgetPlan(plan);
    });
  }

  return { restoredExpenses, restoredBudgets };
}

function createBaselineSnapshot() {
  return {
    expenses: JSON.parse(JSON.stringify(state.expenses)),
    budgets: JSON.parse(JSON.stringify(state.budgets)),
  };
}

async function loadInitialDataFromFiles() {
  for (const fileName of INITIAL_DATA_FILES) {
    try {
      const response = await fetch(`./${encodeURI(fileName)}`, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      const { restoredExpenses, restoredBudgets } = parseBackupPayload(payload);
      if (restoredExpenses.length > 0 || Object.keys(restoredBudgets).length > 0) {
        return { restoredExpenses, restoredBudgets, source: fileName };
      }
    } catch (error) {
      console.warn(`初期データ読み込みに失敗: ${fileName}`, error);
    }
  }

  return null;
}

function getSelectedBudgetMonth() {
  return getMonthKeyFromOffset(state.currentMonthOffset);
}

function getBudgetFormValues() {
  const values = {};
  const monthKey = getSelectedBudgetMonth();
  BUDGET_FIELDS.forEach((field) => {
    const input = budgetInputRefs[field];
    // extraIncomeが空欄なら常にnull（未設定）として保存する
    if (field === 'extraIncome' && input && input.value === '') {
      values[field] = null;
      return;
    }
    const value = input ? Number(input.value) : 0;
    values[field] = Number.isFinite(value) && value > 0 ? value : 0;
  });
  // 調整値はpaymentInfoから管理されるため、保存済みプランから取得
  const storedPlan = state.budgets?.[monthKey] ?? {};
  ['aeonAdjustment', 'dAdjustment'].forEach((field) => {
    const value = Number(storedPlan[field]);
    values[field] = Number.isFinite(value) ? value : 0;
  });
  return values;
}

function getBudgetPlanWithCalculatedCards(monthKey, context = state) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = normalizeBudgetPlan(context.budgets?.[monthKey]);
  applyFixedBudgetValues(plan);
  plan.aeonBill = calculateCardBill("イオン", monthInfo, context) + (plan.aeonAdjustment ?? 0);
  plan.dBill    = calculateCardBill("d",      monthInfo, context) + (plan.dAdjustment    ?? 0);
  plan.cards    = plan.aeonBill + plan.dBill;
  plan.cashUsage = calculateCashExpenseTotalForMonth(monthKey, context.expenses);
  return plan;
}

function calculateOwnMonthBudgetTotal(plan) {
  const outflow = BUDGET_FIELDS
    .filter((field) => field !== "salary" && field !== "extraIncome")
    .reduce((sum, field) => sum + (plan[field] ?? 0), 0);
  return (plan.salary ?? 0) + (plan.extraIncome ?? 0) - outflow;
}

function calculateBudgetOutflowForExcel(plan) {
  return BUDGET_FIELDS
    .filter((field) => field !== "salary" && field !== "extraIncome" && field !== "cashUsage")
    .reduce((sum, field) => sum + (plan[field] ?? 0), 0);
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
  const total = calculateCashAvailableAmount(monthKey);
  refs.budgetTotal.value = `¥${total.toLocaleString()}`;
}

function calculateCreditAvailableAmount(_currentMonthKey) {
  // 締め日ベースで各カードの「現在進行中の請求期間」を特定する
  // イオン: 10日締め → 今日が10日以前なら請求月=今月+1、11日以降なら+2
  // d   : 15日締め → 今日が15日以前なら請求月=今月+1、16日以降なら+2
  const now = new Date();
  const todayDay = now.getDate();
  const todayMonthKey = getMonthKeyFromDate(now);

  const billingMonthKeys = {};
  let totalBill = 0;

  for (const [cardKey, card] of Object.entries(CARD_INFO)) {
    const monthsAhead = todayDay > card.closingDate ? 2 : 1;
    const billingMonthKey = shiftMonthKey(todayMonthKey, monthsAhead);
    billingMonthKeys[cardKey] = billingMonthKey;
    const billingMonthInfo = getMonthInfoFromMonthKey(billingMonthKey);
    let bill = calculateCardBill(cardKey, billingMonthInfo);
    if (cardKey === "イオン") {
      bill += calculateEtcBillForAeon(billingMonthInfo);
    }
    totalBill += bill;
  }

  const available = CARD_MONTHLY_LIMIT - totalBill;
  // creditFullUseNote用に早い方の請求月を代表として返す
  const aeonKey = billingMonthKeys["イオン"];
  const dKey = billingMonthKeys["d"];
  const earlierBillingMonthKey = compareMonthKeys(aeonKey, dKey) <= 0 ? aeonKey : dKey;

  return {
    billingMonthKey: earlierBillingMonthKey,
    billingMonthKeys,
    available,
  };
}

function calculateCashExpenseTotalForMonth(monthKey, expenses = state.expenses) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  return expenses
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

function calculateEtcUsageTotalForMonth(monthKey, expenses = state.expenses) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  return expenses
    .filter((expense) => {
      if (expense.category !== "ETC") return false;
      const expenseDate = parseDate(expense.date);
      return (
        expenseDate.getFullYear() === monthInfo.year &&
        expenseDate.getMonth() === monthInfo.month
      );
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function calculateCashAvailableByFormula(monthKey, context = state, memo = new Map()) {
  if (memo.has(monthKey)) {
    return memo.get(monthKey);
  }

  const plan = normalizeBudgetPlan(context.budgets?.[monthKey]);
  applyFixedBudgetValues(plan);
  const previousMonthKey = shiftMonthKey(monthKey, -1);
  let previousAvailable;
  if (compareMonthKeys(previousMonthKey, MIN_MONTH_KEY) < 0) {
    previousAvailable = 0;
  } else {
    previousAvailable = calculateCashAvailableByFormula(previousMonthKey, context, memo);
  }
  const available = (plan.salary ?? 0) + (plan.extraIncome ?? 0)
    - calculateBudgetOutflowForExcel(plan)
    - (plan.cashUsage ?? 0)
    + previousAvailable
    - calculateEtcUsageTotalForMonth(monthKey, context.expenses);

  memo.set(monthKey, available);
  return available;
}

function calculateSingleMonthCashIfFullCredit(monthKey) {
  const plan = getBudgetPlanWithCalculatedCards(monthKey);
  const cashExpenses = calculateCashExpenseTotalForMonth(monthKey, state.expenses);
  const etcExpenses = calculateEtcUsageTotalForMonth(monthKey, state.expenses);
  return (plan.salary ?? 0)
    - calculateBudgetOutflowForExcel(plan)
    + (plan.cards ?? 0)
    - cashExpenses
    - etcExpenses
    - CARD_MONTHLY_LIMIT;
}

function calculateCashAvailableAmount(monthKey) {
  return calculateCashAvailableByFormula(monthKey, state);
}

function renderMonthlyAvailableSummary() {
  if (!refs.availableCash || !refs.availableCredit || !refs.availableCreditMonth) {
    return;
  }

  const displayMonthKey = getMonthKeyFromOffset(state.currentMonthOffset);
  const cashAvailable = calculateCashAvailableAmount(displayMonthKey);
  const creditInfo = calculateCreditAvailableAmount(displayMonthKey);
  const creditAvailable = creditInfo.available;

  refs.availableCash.textContent = formatYen(cashAvailable);
  refs.availableCredit.textContent = formatYen(creditAvailable);

  const aeonBillingKey = creditInfo.billingMonthKeys?.["イオン"] ?? creditInfo.billingMonthKey;
  const dBillingKey = creditInfo.billingMonthKeys?.["d"] ?? creditInfo.billingMonthKey;
  const aeonBillingDisplay = getMonthInfoFromMonthKey(aeonBillingKey).monthDisplay;
  const dBillingDisplay = getMonthInfoFromMonthKey(dBillingKey).monthDisplay;
  refs.availableCreditMonth.textContent = aeonBillingKey === dBillingKey
    ? `請求月: ${aeonBillingDisplay}`
    : `イオン請求: ${aeonBillingDisplay} / d請求: ${dBillingDisplay}`;

  if (refs.creditFullUseNote) {
    const billingMonthCash = calculateCashAvailableAmount(creditInfo.billingMonthKey);
    const billingPlan = getBudgetPlanWithCalculatedCards(creditInfo.billingMonthKey);
    const cashNoCarry = calculateSingleMonthCashIfFullCredit(creditInfo.billingMonthKey);
    const cashWithCarry = billingMonthCash + (billingPlan.cards ?? 0) - CARD_MONTHLY_LIMIT;
    const earlierBillingDisplay = getMonthInfoFromMonthKey(creditInfo.billingMonthKey).monthDisplay;
    refs.creditFullUseNote.textContent = `12万フル使用時の${earlierBillingDisplay}残キャッシュ: ${formatYen(cashNoCarry)}（繰越込: ${formatYen(cashWithCarry)}）`;
  }
}

function applyFixedBudgetValues(plan) {
  if (!plan.fireInsurance) plan.fireInsurance = FIXED_BUDGET_VALUES.fireInsurance;
  if (!plan.kyosai) plan.kyosai = FIXED_BUDGET_VALUES.kyosai;
  if (!plan.rent) plan.rent = FIXED_BUDGET_VALUES.rent;
  if (!plan.jiuJitsu) plan.jiuJitsu = FIXED_BUDGET_VALUES.jiuJitsu;
}

function getCardsPaymentForMonth(monthInfo, context = state) {
  const aeon = calculateCardBill("イオン", monthInfo, context);
  const d = calculateCardBill("d", monthInfo, context);
  return aeon + d;
}

function getTotalCardBillingForMonth(monthInfo, context = state) {
  const aeonCardTotal = calculateCardBill("イオン", monthInfo, context);
  const aeonEtcTotal = calculateEtcBillForAeon(monthInfo, context.expenses);
  const dCardTotal = calculateCardBill("d", monthInfo, context);
  return aeonCardTotal + aeonEtcTotal + dCardTotal;
}

function renderBudgetForm(monthKey) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = getBudgetPlanWithCalculatedCards(monthKey);
  // 表示のみ: state への書き戻し・自動保存はしない

  BUDGET_FIELDS.forEach((field) => {
    if (budgetInputRefs[field]) budgetInputRefs[field].value = plan[field] ?? "";
  });
  // クリアボタンの表示制御: extraIncomeに値があるときだけ表示
  const clearBtn = document.getElementById('clearExtraIncomeBtn');
  if (clearBtn) clearBtn.hidden = !(plan.extraIncome != null && plan.extraIncome > 0);

  refs.budgetMonthLabel.textContent = `対象月: ${monthInfo.monthDisplay}`;
  updateBudgetTotal(monthKey);
  updateSavingsCumulative(monthKey);
  updateExtraIncomeCumulative(monthKey);
}

function saveBudgetForSelectedMonth() {
  const monthKey  = getSelectedBudgetMonth();
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = getBudgetFormValues();
  applyFixedBudgetValues(plan);
  plan.aeonBill = calculateCardBill("イオン", monthInfo) + (plan.aeonAdjustment ?? 0);
  plan.dBill    = calculateCardBill("d",      monthInfo) + (plan.dAdjustment    ?? 0);
  plan.cards    = plan.aeonBill + plan.dBill;
  plan.cashUsage = calculateCashExpenseTotalForMonth(monthKey);
  state.budgets[monthKey] = plan;
  saveBudgetPlans();
  updateBudgetTotal(monthKey);
  updateSavingsCumulative(monthKey);
  updateExtraIncomeCumulative(monthKey);
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
  const { restoredExpenses, restoredBudgets } = parseBackupPayload(parsed);
  const currentMonthKey = getMonthKeyFromOffset(state.currentMonthOffset);
  // fixedcost_...は当月分のみ残す
  const filteredExpenses = restoredExpenses.filter(e => {
    if (!e.id?.startsWith("fixedcost_")) return true;
    return e.id.endsWith(`_${currentMonthKey}`);
  });
  state.expenses = filteredExpenses;
  state.budgets = restoredBudgets;
  saveLocalExpenses(state.expenses);
  saveBudgetPlans();
  state.baselineSnapshot = createBaselineSnapshot();
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

  try {
    const text = JSON.stringify(backup);
    parseAndRestoreBackup(text);
  } catch (error) {
    console.error(error);
    alert("バックアップの復元に失敗しました。");
  }
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

// 固定費一覧表示・チェックボックスUI（プレーンJS例）
// バックエンドAPI: http://localhost:3001/api/recurring-expenses?month=YYYY-MM
// チェックボックス変更API: POST http://localhost:3001/api/expense-flag


function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function fetchExpenses(month) {
  const res = await fetch(`/api/recurring-expenses?month=${month}`);
  return await res.json();
}

async function updateExpenseFlag(month, recurringExpenseId, enabled) {
  await fetch('/api/expense-flag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, recurringExpenseId, enabled })
  });
}


async function renderExpenses() {
  const container = document.getElementById("expenses");
  if (!container) return;
  // 主カレンダーと同じ月を使う
  const monthKey = getMonthKeyFromOffset(state.currentMonthOffset);
  container.innerHTML = `<p style="font-size:0.85em;color:#888;margin:0 0 6px;">${toMonthLabelFromKey(monthKey)}</p>`;
  let expenses;
  try {
    expenses = await fetchExpenses(monthKey);
    if (!Array.isArray(expenses)) throw new Error('invalid response');
  } catch {
    container.innerHTML += `
      <p style="color:#e55;margin:4px 0;">サーバー起動中です。少し待ってから再試行してください。</p>
      <button onclick="renderExpenses()" style="margin-top:6px;padding:6px 14px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;">再試行</button>
    `;
    return;
  }
  if (expenses.length === 0) {
    container.innerHTML += '<p style="color:#888">この月に有効な固定費はありません</p>';
    return;
  }
  expenses.forEach(exp => {
    const row = document.createElement('div');
    row.innerHTML = `
      <label>
        <input type="checkbox" ${exp.enabled ? "checked" : ""}
          onchange="toggleExpense(${exp.id}, '${monthKey}', this.checked)">
        ${escapeHtml(exp.name)}（${escapeHtml(exp.card)}・¥${Number(exp.amount).toLocaleString()}）
      </label>
    `;
    container.appendChild(row);
  });
}

function toMonthLabelFromKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}年${m}月`;
}

window.toggleExpense = async function(expenseId, month, checked) {
  await updateExpenseFlag(month, expenseId, checked);
  renderExpenses();
};

function updateMonthNavigation() {
  if (!refs.prevMonth) return;
  const currentMonthKey = getMonthKeyFromOffset(state.currentMonthOffset);
  refs.prevMonth.disabled = compareMonthKeys(currentMonthKey, MIN_MONTH_KEY) <= 0;
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
  state.currentMonthOffset = clampMonthOffset(state.currentMonthOffset);
  updateExpenseList();
  updateStats();
  renderCalendar();
  renderMonthlyAvailableSummary();
  updateMonthNavigation();
  renderExpenses();
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

function getCardBillingMonthKey(cardKey, targetMonthInfo) {
  // 対象月の給与から何ヶ月先にカード引き落としがあるか
  const card = CARD_INFO[cardKey];
  // targetMonthInfo は予算の対象月 → そのカードが引き落とされる月を返す
  // イオン: 翌月2日引き落とし、d: 翌月10日引き落とし
  const billingDate = new Date(targetMonthInfo.year, targetMonthInfo.month + 1, card.paymentDate);
  return {
    monthDisplay: `${billingDate.getFullYear()}年${billingDate.getMonth() + 1}月`,
  };
}

function calculateCardBill(cardKey, monthInfo, context = state) {
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

  // 変動支出
  const expenseTotal = context.expenses
    .filter((expense) => {
      if (expense.cardType !== cardKey) return false;
      const expenseDate = parseDate(expense.date);
      return expenseDate >= startDate && expenseDate <= endDate;
    })
    .reduce((sum, expense) => sum + expense.amount, 0);

  // 固定費：請求期間内に「月初(1日)」が含まれる月分を加算
  const fixedTotal = getFixedCostTotalForBillingPeriod(cardKey, startDate, endDate);

  return expenseTotal + fixedTotal;
}

/**
 * 請求期間 [startDate, endDate] 内に月初(1日)が含まれる月の
 * BUILTIN_FIXED_COSTS をカード別に合計する。
 */
function getFixedCostTotalForBillingPeriod(cardKey, startDate, endDate) {
  // 期間内で最初に来る月初を求める
  const firstOfMonth = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + (startDate.getDate() > 1 ? 1 : 0),
    1
  );
  let total = 0;
  for (const d = new Date(firstOfMonth); d <= endDate; d.setMonth(d.getMonth() + 1)) {
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    for (const fc of BUILTIN_FIXED_COSTS) {
      if (fc.cardType !== cardKey) continue;
      if (fc.endMonthKey && monthKey > fc.endMonthKey) continue;
      total += fc.amount;
    }
  }
  return total;
}

function calculateEtcBillForAeon(monthInfo, expenses = state.expenses) {
  return expenses
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
  const monthKey = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, '0')}`;
  const plan = state.budgets?.[monthKey] ?? {};
  const aeonAdj = plan.aeonAdjustment ?? 0;
  const dAdj = plan.dAdjustment ?? 0;

  const aeonCardTotal = calculateCardBill("イオン", monthInfo);
  const etcTotal = calculateEtcBillForAeon(monthInfo);
  const aeonBase = aeonCardTotal + etcTotal;
  const aeonTotal = aeonBase + aeonAdj;
  const dBase = calculateCardBill("d", monthInfo);
  const dTotal = dBase + dAdj;
  const jiuJitsuTotal = FIXED_BUDGET_VALUES.jiuJitsu;
  const grandTotal = aeonTotal + dTotal + jiuJitsuTotal;
  const paymentMonthLabel = `${monthInfo.month + 1}月`;

  refs.paymentInfo.innerHTML = `
    <div class="payment-card-row payment-aeon">
      <div class="payment-card-main">
        <strong>イオンカード${paymentMonthLabel}引き落とし</strong><br>
        ¥${aeonTotal.toLocaleString()}（カード: ¥${aeonCardTotal.toLocaleString()} / ETC: ¥${etcTotal.toLocaleString()}）
      </div>
      <label class="payment-adj-label">調整<input type="number" step="1" class="payment-adj-input" data-adj="aeon" value="${aeonAdj || ''}" placeholder="+/-" /></label>
    </div>
    <div class="payment-card-row payment-d">
      <div class="payment-card-main">
        <strong>dカード${paymentMonthLabel}引き落とし</strong><br>
        ¥${dTotal.toLocaleString()}
      </div>
      <label class="payment-adj-label">調整<input type="number" step="1" class="payment-adj-input" data-adj="d" value="${dAdj || ''}" placeholder="+/-" /></label>
    </div>
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
  if (state.activeTab === "budget") renderBudgetForCurrentMonth();
}

function removeExpense(id) {
  state.expenses = state.expenses.filter((expense) => expense.id !== String(id));
  saveLocalExpenses(state.expenses);
  renderAll();
  if (state.activeTab === "budget") renderBudgetForCurrentMonth();
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
  if (state.activeTab === "budget") renderBudgetForCurrentMonth();
}

function bindEvents() {
  refs.addBtn?.addEventListener("click", addExpense);
  refs.cancelBtn?.addEventListener("click", cancelEdit);
  refs.prevMonth?.addEventListener("click", () => {
    setCurrentMonthOffset(state.currentMonthOffset - 1);
    renderAll();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.nextMonth?.addEventListener("click", () => {
    setCurrentMonthOffset(state.currentMonthOffset + 1);
    renderAll();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.todayMonth?.addEventListener("click", () => {
    setCurrentMonthOffset(0);
    renderAll();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.expenseList?.addEventListener("click", (event) => {
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

  refs.tabLedger?.addEventListener("click", () => setActiveTab("ledger"));
  refs.tabBudget?.addEventListener("click", () => setActiveTab("budget"));
  refs.copyPrevBudgetBtn?.addEventListener("click", copyPreviousMonthBudget);
  refs.backupExportBtn?.addEventListener("click", exportBackup);
  refs.backupImportBtn?.addEventListener("click", () => refs.backupFileInput?.click());
  refs.backupFileInput?.addEventListener("change", importBackupFromFile);


  // 入力中はstateを即時反映して再計算（保存はしない）
  Object.values(budgetInputRefs).forEach((input) => {
    input?.addEventListener("input", () => {
      const monthKey = getSelectedBudgetMonth();
      // UI入力値をstateに即時反映（メモリのみ・保存はしない）
      if (!state.budgets[monthKey]) state.budgets[monthKey] = {};
      BUDGET_FIELDS.forEach((field) => {
        if (budgetInputRefs[field]) {
          // extraIncomeは空欄=null（未設定）を維持。他フィールド入力時に0で上書きしない
          if (field === 'extraIncome' && budgetInputRefs[field].value === '') {
            state.budgets[monthKey][field] = null;
            return;
          }
          const val = Number(budgetInputRefs[field].value);
          state.budgets[monthKey][field] = Number.isFinite(val) ? val : 0;
        }
      });
      // extraIncomeクリアボタンの表示制御
      const clearBtn = document.getElementById('clearExtraIncomeBtn');
      if (clearBtn) {
        const v = budgetInputRefs.extraIncome?.value;
        clearBtn.hidden = !(v && Number(v) > 0);
      }
      updateBudgetTotal(monthKey);
      updateSavingsCumulative(monthKey);
      updateExtraIncomeCumulative(monthKey);
      renderMonthlyAvailableSummary();
    });
  });

  // 手動保存ボタン：localStorageに保存後、debounceを経ずに即時サーバーPOST
  document.getElementById('saveBudgetBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveBudgetBtn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    try {
      const monthKey = getSelectedBudgetMonth();
      saveBudgetForSelectedMonth();
      const ok = await saveToLocal(false);
      if (ok) {
        if (refs.budgetStatus) refs.budgetStatus.textContent = `${monthKey} をDBに保存しました ✓`;
        showSyncNotification('💾 DBに保存しました');
      } else {
        if (refs.budgetStatus) refs.budgetStatus.textContent = '⚠ DB保存失敗（ローカルには保存済み）';
        showSyncNotification('⚠ DBへの保存に失敗しました');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⬆ サーバー保存'; }
    }
  });

  // 臨時収入クリアボタン: null をセットしてbaselineも同期（delta=0を保証）
  document.getElementById('clearExtraIncomeBtn')?.addEventListener('click', () => {
    const monthKey = getSelectedBudgetMonth();
    if (!state.budgets[monthKey]) state.budgets[monthKey] = {};
    state.budgets[monthKey].extraIncome = null;
    saveBudgetPlans();
    if (budgetInputRefs.extraIncome) budgetInputRefs.extraIncome.value = "";
    const clearBtn = document.getElementById('clearExtraIncomeBtn');
    if (clearBtn) clearBtn.hidden = true;
    updateBudgetTotal(monthKey);
    updateSavingsCumulative(monthKey);
    updateExtraIncomeCumulative(monthKey);
    renderMonthlyAvailableSummary();
  });

  // DBから再読込ボタン
  document.getElementById('reloadFromServerBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('reloadFromServerBtn');
    if (btn) { btn.disabled = true; btn.textContent = '読込中…'; }
    try {
      const serverData = await loadFromLocal();
      if (!serverData) { showSyncNotification('⚠ DBに接続できません'); return; }
      if (Object.prototype.hasOwnProperty.call(serverData, 'expenses')) {
        const expenses = Array.isArray(serverData.expenses) ? serverData.expenses : [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
        state.expenses = loadLocalExpenses();
      }
      if (Object.prototype.hasOwnProperty.call(serverData, 'budgetPlans')) {
        const budgetPlans = serverData.budgetPlans && typeof serverData.budgetPlans === 'object'
          ? serverData.budgetPlans
          : {};
        localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgetPlans));
        state.budgets = loadBudgetPlans();
      }
      state.baselineSnapshot = createBaselineSnapshot();
      renderAll();
      renderBudgetForCurrentMonth();
      if (refs.budgetStatus) refs.budgetStatus.textContent = 'DBから再読込しました';
      showSyncNotification('💾 DBからデータを再読込しました');
    } catch (e) {
      showSyncNotification('⚠ 再読込に失敗しました');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '↺ サーバー再読込'; }
    }
  });

  refs.paymentInfo?.addEventListener("change", (e) => {
    const input = e.target.closest(".payment-adj-input");
    if (!input) return;
    const monthInfo = getMonthInfo(state.currentMonthOffset);
    const monthKey = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, '0')}`;
    if (!state.budgets[monthKey]) state.budgets[monthKey] = {};
    const value = Number(input.value);
    const adj = Number.isFinite(value) ? value : 0;
    if (input.dataset.adj === "aeon") {
      state.budgets[monthKey].aeonAdjustment = adj;
    } else if (input.dataset.adj === "d") {
      state.budgets[monthKey].dAdjustment = adj;
    }
    saveBudgetPlans();
    updatePaymentInfo(monthInfo);
    renderMonthlyAvailableSummary();
  });
}

async function init() {
  // ラズパイDBからデータを取得してlocalStorageに反映
  const serverData = await loadFromLocal();
  if (serverData) {
    if (Object.prototype.hasOwnProperty.call(serverData, 'expenses')) {
      const expenses = Array.isArray(serverData.expenses) ? serverData.expenses : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    }
    if (Object.prototype.hasOwnProperty.call(serverData, 'budgetPlans')) {
      const budgetPlans = serverData.budgetPlans && typeof serverData.budgetPlans === 'object'
        ? serverData.budgetPlans
        : {};
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgetPlans));
    }
  }

  refs.expenseDate.value = getTodayString();
  state.expenses = loadLocalExpenses();
  state.budgets = loadBudgetPlans();

  const initialData = await loadInitialDataFromFiles();
  if (initialData) {
    state.expenses = initialData.restoredExpenses;
    state.budgets = initialData.restoredBudgets;
    saveLocalExpenses(state.expenses);
    saveBudgetPlans();
    console.info(`初期データを読み込みました: ${initialData.source}`);
  }

  state.baselineSnapshot = createBaselineSnapshot();
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
      
      // Clear old cache versions (keep only current version)
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith("kakeibo-cache-") && name !== "kakeibo-cache-v14")
          .map(name => caches.delete(name))
      );
    } catch (error) {
      console.error("Service Worker registration failed", error);
    }
  });
}



init();
registerServiceWorker();

// ─── 固定費ON/OFF画面 ─────────────────────────────────────────────────────

const API_BASE = '';

/**
 * fixedCostUI: 固定費ON/OFF画面のステートと操作をまとめたオブジェクト。
 * HTML側に必要な要素:
 *   #fixedCostSection  — セクション全体のコンテナ
 *   #fixedMonthLabel   — 現在表示中の "YYYY年MM月" ラベル
 *   #fixedCostList     — 固定費一覧を描画する <ul> または <div>
 *   #fixedPrevMonth    — 前の月ボタン
 *   #fixedNextMonth    — 次の月ボタン
 */
const fixedCostUI = (() => {
  // 表示中の月キー ("YYYY-MM")。初期値は今月。
  let currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  // ─ DOM 参照 ─
  const elLabel     = () => document.getElementById('fixedMonthLabel');
  const elList      = () => document.getElementById('fixedCostList');
  const elPrev      = () => document.getElementById('fixedPrevMonth');
  const elNext      = () => document.getElementById('fixedNextMonth');

  // ─ 月キー操作 ─
  function shiftMonth(monthKey, delta) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function toMonthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return `${y}年${m}月`;
  }

  // ─ API 呼び出し ─
  async function fetchExpenses(month) {
    const res = await fetch(`${API_BASE}/api/recurring-expenses?month=${month}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async function postFlag(month, recurringExpenseId, enabled) {
    const res = await fetch(`${API_BASE}/api/expense-flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, recurringExpenseId, enabled }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  // ─ 描画 ─
  async function render() {
    const label = elLabel();
    const list  = elList();
    if (!label || !list) return;

    label.textContent = toMonthLabel(currentMonth);
    list.innerHTML = '<li style="color:#888">読み込み中…</li>';

    let expenses;
    try {
      expenses = await fetchExpenses(currentMonth);
    } catch (e) {
      list.innerHTML = `<li style="color:red">取得失敗: ${escapeHtml(e.message)}</li>`;
      return;
    }

    if (expenses.length === 0) {
      list.innerHTML = '<li style="color:#888">この月に有効な固定費はありません。</li>';
      return;
    }

    list.innerHTML = expenses.map(exp => {
      const checkedAttr = exp.enabled ? 'checked' : '';
      const rangeText = [
        exp.startMonth ? `開始: ${exp.startMonth}` : '',
        exp.endMonth   ? `終了: ${exp.endMonth}`   : '無期限',
      ].filter(Boolean).join(' / ');
      return `
        <li class="fixed-cost-item" data-id="${exp.id}" style="padding:8px 0; border-bottom:1px solid #333;">
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
            <input type="checkbox" ${checkedAttr}
              data-expense-id="${exp.id}"
              style="width:18px; height:18px; cursor:pointer;">
            <span style="flex:1;">
              <strong>${escapeHtml(exp.name)}</strong>
              <span style="margin-left:8px; color:#aaa;">${escapeHtml(exp.card)}</span>
              <span style="margin-left:8px;">¥${Number(exp.amount).toLocaleString()}</span>
              <span style="margin-left:8px; font-size:0.8em; color:#888;">${escapeHtml(rangeText)}</span>
            </span>
          </label>
        </li>`;
    }).join('');

    // チェックボックスのイベント登録
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const expenseId = Number(e.target.dataset.expenseId);
        const newEnabled = e.target.checked;
        e.target.disabled = true;
        try {
          await postFlag(currentMonth, expenseId, newEnabled);
        } catch (err) {
          alert(`更新に失敗しました: ${err.message}`);
          e.target.checked = !newEnabled; // ロールバック
        } finally {
          e.target.disabled = false;
        }
      });
    });
  }

  // ─ 公開メソッド ─
  function init() {
    const prev = elPrev();
    const next = elNext();
    if (prev) prev.addEventListener('click', () => {
      currentMonth = shiftMonth(currentMonth, -1);
      render();
    });
    if (next) next.addEventListener('click', () => {
      currentMonth = shiftMonth(currentMonth, +1);
      render();
    });
  }

  return { init, render, getCurrentMonth: () => currentMonth };
})();

// 固定費セクションが DOM に存在する場合のみ初期化・描画する
if (document.getElementById('fixedCostSection')) {
  fixedCostUI.init();
  fixedCostUI.render();
}
