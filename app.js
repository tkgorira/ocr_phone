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
];

const FIXED_BUDGET_VALUES = {
  fireInsurance: 5460,
  kyosai: 50000,
  rent: 58147,
  jiuJitsu: 8800,
};

const state = {
  currentMonthOffset: 0,
  expenses: [],
  activeTab: "ledger",
  budgets: {},
};

const refs = {
  expenseDate: document.getElementById("expenseDate"),
  category: document.getElementById("category"),
  description: document.getElementById("description"),
  amount: document.getElementById("amount"),
  cardType: document.getElementById("cardType"),
  addBtn: document.getElementById("addBtn"),
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
  budgetTotal: document.getElementById("budgetTotal"),
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

function updateBudgetTotal(plan) {
  const outflow = BUDGET_FIELDS.filter((field) => field !== "salary")
    .reduce((sum, field) => sum + (plan[field] ?? 0), 0);
  const total = (plan.salary ?? 0) - outflow;
  refs.budgetTotal.value = `¥${total.toLocaleString()}`;
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

function renderBudgetForm(monthKey) {
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = normalizeBudgetPlan(state.budgets[monthKey]);

  applyFixedBudgetValues(plan);
  plan.cards = getCardsPaymentForMonth(monthInfo);
  state.budgets[monthKey] = plan;
  saveBudgetPlans();

  BUDGET_FIELDS.forEach((field) => {
    budgetInputRefs[field].value = plan[field] || "";
  });
  refs.budgetMonthLabel.textContent = `対象月: ${monthInfo.monthDisplay}`;
  updateBudgetTotal(plan);
  updateSavingsCumulative(monthKey);
}

function saveBudgetForSelectedMonth() {
  const monthKey = getSelectedBudgetMonth();
  const monthInfo = getMonthInfoFromMonthKey(monthKey);
  const plan = getBudgetFormValues();
  applyFixedBudgetValues(plan);
  plan.cards = getCardsPaymentForMonth(monthInfo);
  state.budgets[monthKey] = plan;
  saveBudgetPlans();
  updateBudgetTotal(plan);
  updateSavingsCumulative(monthKey);
  refs.budgetStatus.textContent = `${monthKey} の予算案を保存しました`;
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
  const previousMonth = new Date(monthInfo.year, monthInfo.month - 1, 1);
  const startDate = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), card.closingDate + 1);
  const endDate = new Date(monthInfo.year, monthInfo.month, card.closingDate);

  return state.expenses
    .filter((expense) => {
      if (expense.cardType !== cardKey) return false;
      const expenseDate = parseDate(expense.date);
      return expenseDate >= startDate && expenseDate <= endDate;
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function updatePaymentInfo(monthInfo) {
  const aeonTotal = calculateCardBill("イオン", monthInfo);
  const dTotal = calculateCardBill("d", monthInfo);
  const paymentMonthLabel = `${monthInfo.month + 1}月`;

  refs.paymentInfo.innerHTML = `
    <p class="payment-aeon">
      <strong>イオンカード${paymentMonthLabel}引き落とし</strong><br>
      ¥${aeonTotal.toLocaleString()}
    </p>
    <p class="payment-d">
      <strong>dカード${paymentMonthLabel}引き落とし</strong><br>
      ¥${dTotal.toLocaleString()}
    </p>
  `;
}

function updateExpenseList() {
  if (state.expenses.length === 0) {
    refs.expenseList.innerHTML = '<p class="placeholder">まだ記録がありません</p>';
    return;
  }

  refs.expenseList.innerHTML = state.expenses
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
          <button class="expense-item-delete" type="button" data-expense-id="${expense.id}">削除</button>
        </div>
      `;
    })
    .join("");
}

function updateStats() {
  const totals = state.expenses.reduce(
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

function bindEvents() {
  refs.addBtn.addEventListener("click", addExpense);
  refs.prevMonth.addEventListener("click", () => {
    state.currentMonthOffset -= 1;
    renderCalendar();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.nextMonth.addEventListener("click", () => {
    state.currentMonthOffset += 1;
    renderCalendar();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.todayMonth.addEventListener("click", () => {
    state.currentMonthOffset = 0;
    renderCalendar();
    if (state.activeTab === "budget") {
      renderBudgetForCurrentMonth();
    }
  });
  refs.expenseList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-expense-id]");
    if (!deleteButton) {
      return;
    }

    deleteExpense(deleteButton.dataset.expenseId);
  });

  refs.tabLedger.addEventListener("click", () => setActiveTab("ledger"));
  refs.tabBudget.addEventListener("click", () => setActiveTab("budget"));

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
}

init();
