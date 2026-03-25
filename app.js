import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdgcXUc3X-HybCsLBFRGpmF-_tpsxZPsM",
  authDomain: "household-book-51030.firebaseapp.com",
  projectId: "household-book-51030",
  storageBucket: "household-book-51030.firebasestorage.app",
  messagingSenderId: "152685903975",
  appId: "1:152685903975:web:723ce62151183065b894c2",
  measurementId: "G-5XL60VE5YK",
};

const CARD_INFO = {
  イオン: {
    name: "イオンカード",
    closingDate: 10,
    paymentDate: 2,
  },
  d: {
    name: "dカード",
    closingDate: 15,
    paymentDate: 10,
  },
};

const STORAGE_KEY = "expenses";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const state = {
  currentMonthOffset: 0,
  currentUser: null,
  expenses: [],
  unsubscribeExpenses: null,
  didMigrateLocalData: false,
};

const refs = {
  accountPanel: document.getElementById("accountPanel"),
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
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authStatus: document.getElementById("authStatus"),
  syncStatus: document.getElementById("syncStatus"),
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

function getExpensesCollection() {
  return collection(db, "users", state.currentUser.uid, "expenses");
}

function setSyncStatus(message, isError = false) {
  refs.syncStatus.textContent = message;
  refs.syncStatus.classList.toggle("is-error", isError);
}

function formatAuthError(error) {
  if (!error?.code) {
    return "Googleログインに失敗しました。Firebase設定を確認してください。";
  }

  const messages = {
    "auth/unauthorized-domain": "この公開URLが Firebase Authentication の承認済みドメインに未登録です。",
    "auth/operation-not-allowed": "Firebase Authentication で Google ログインが有効化されていません。",
    "auth/popup-blocked": "ログイン用ポップアップがブロックされました。",
    "auth/popup-closed-by-user": "ログイン画面が途中で閉じられました。",
    "auth/cancelled-popup-request": "ログイン要求がキャンセルされました。",
    "auth/network-request-failed": "通信に失敗しました。ネットワーク接続を確認してください。",
  };

  const detail = messages[error.code] ?? "Googleログインに失敗しました。Firebase設定を確認してください。";
  return `${detail} (${error.code})`;
}

function updateAuthUi() {
  if (state.currentUser) {
    refs.authStatus.textContent = `${state.currentUser.displayName ?? "Googleユーザー"} としてログイン中`;
    refs.loginBtn.hidden = true;
    refs.logoutBtn.hidden = false;
    refs.accountPanel.classList.add("is-compact");
  } else {
    refs.authStatus.textContent = "ゲストモードです。この端末だけに保存されます。";
    refs.loginBtn.hidden = false;
    refs.logoutBtn.hidden = true;
    refs.accountPanel.classList.remove("is-compact");
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
    { 現金: 0, イオン: 0, d: 0 },
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

async function saveExpense(expense) {
  if (state.currentUser) {
    await setDoc(doc(getExpensesCollection(), expense.id), expense);
    return;
  }

  state.expenses = sortExpenses([expense, ...state.expenses]);
  saveLocalExpenses(state.expenses);
  renderAll();
}

async function removeExpense(id) {
  if (state.currentUser) {
    await deleteDoc(doc(getExpensesCollection(), String(id)));
    return;
  }

  state.expenses = state.expenses.filter((expense) => expense.id !== String(id));
  saveLocalExpenses(state.expenses);
  renderAll();
}

async function addExpense() {
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
    await saveExpense(expense);
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

async function deleteExpense(id) {
  if (!confirm("この支出を削除しますか？")) {
    return;
  }

  try {
    await removeExpense(id);
  } catch (error) {
    console.error(error);
    alert("削除に失敗しました。もう一度お試しください。");
  }
}

async function migrateLocalExpensesIfNeeded(remoteExpenses) {
  if (state.didMigrateLocalData) {
    return;
  }

  state.didMigrateLocalData = true;
  const localExpenses = loadLocalExpenses();
  if (localExpenses.length === 0) {
    return;
  }

  const remoteIds = new Set(remoteExpenses.map((expense) => expense.id));
  const missingLocalExpenses = localExpenses.filter((expense) => !remoteIds.has(expense.id));
  if (missingLocalExpenses.length === 0) {
    saveLocalExpenses([]);
    return;
  }

  setSyncStatus(`ローカルデータ${missingLocalExpenses.length}件をクラウドへ同期しています...`);
  await Promise.all(
    missingLocalExpenses.map((expense) => setDoc(doc(getExpensesCollection(), expense.id), expense)),
  );
  saveLocalExpenses([]);
}

function subscribeToCloudExpenses() {
  if (state.unsubscribeExpenses) {
    state.unsubscribeExpenses();
    state.unsubscribeExpenses = null;
  }

  state.didMigrateLocalData = false;
  setSyncStatus("クラウド同期を開始しています...");
  state.unsubscribeExpenses = onSnapshot(
    getExpensesCollection(),
    async (snapshot) => {
      const remoteExpenses = sortExpenses(
        snapshot.docs.map((snapshotDoc) => normalizeExpense({ id: snapshotDoc.id, ...snapshotDoc.data() })),
      );

      try {
        await migrateLocalExpensesIfNeeded(remoteExpenses);
      } catch (error) {
        console.error(error);
        setSyncStatus("ローカルデータのクラウド移行に失敗しました。", true);
      }

      state.expenses = remoteExpenses;
      renderAll();
      setSyncStatus(`クラウド同期中: ${state.currentUser.email}`);
    },
    (error) => {
      console.error(error);
      setSyncStatus("クラウド同期に失敗しました。Firebase設定を確認してください。", true);
    },
  );
}

function handleSignedOut() {
  if (state.unsubscribeExpenses) {
    state.unsubscribeExpenses();
    state.unsubscribeExpenses = null;
  }

  state.currentUser = null;
  state.expenses = loadLocalExpenses();
  updateAuthUi();
  setSyncStatus("ゲストモードです。この端末だけに保存されます。");
  renderAll();
}

async function loginWithGoogle() {
  try {
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (
      error.code === "auth/popup-blocked" ||
      error.code === "auth/cancelled-popup-request" ||
      error.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    console.error(error);
    setSyncStatus(formatAuthError(error), true);
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    setSyncStatus("ログアウトに失敗しました。", true);
  }
}

function bindEvents() {
  refs.addBtn.addEventListener("click", addExpense);
  refs.prevMonth.addEventListener("click", () => {
    state.currentMonthOffset -= 1;
    renderCalendar();
  });
  refs.nextMonth.addEventListener("click", () => {
    state.currentMonthOffset += 1;
    renderCalendar();
  });
  refs.todayMonth.addEventListener("click", () => {
    state.currentMonthOffset = 0;
    renderCalendar();
  });
  refs.loginBtn.addEventListener("click", loginWithGoogle);
  refs.logoutBtn.addEventListener("click", logout);
  refs.expenseList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-expense-id]");
    if (!deleteButton) {
      return;
    }

    deleteExpense(deleteButton.dataset.expenseId);
  });
}

function init() {
  refs.expenseDate.value = getTodayString();
  state.expenses = loadLocalExpenses();
  updateAuthUi();
  renderAll();
  bindEvents();

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      handleSignedOut();
      return;
    }

    state.currentUser = user;
    updateAuthUi();
    subscribeToCloudExpenses();
  });
}

init();
