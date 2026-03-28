// backend.js

const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const RECURRING_FILE = path.join(DATA_DIR, 'recurring_expenses.json');
const FLAGS_FILE = path.join(DATA_DIR, 'monthly_expense_flags.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

// ─── ユーティリティ ────────────────────────────────────────────────────────

function safeReadJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.trim()) return defaultValue;
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', filePath, e.message);
    return defaultValue;
  }
}

function safeWriteJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('JSON write error:', filePath, e.message);
  }
}

function loadRecurring()     { return safeReadJson(RECURRING_FILE, []); }
function saveRecurring(list) { safeWriteJson(RECURRING_FILE, list); }

function loadFlags()         { return safeReadJson(FLAGS_FILE, []); }
function saveFlags(flags)    { safeWriteJson(FLAGS_FILE, flags); }

function loadTransactions()      { return safeReadJson(TRANSACTIONS_FILE, []); }
function saveTransactions(txns)  { safeWriteJson(TRANSACTIONS_FILE, txns); }

/**
 * startMonth/endMonth の範囲内かを判定する。
 * startMonth が null/undefined → 制限なし（下限なし）
 * endMonth が null/undefined   → 無期限（上限なし）
 */
function isMonthInRange(month, startMonth, endMonth) {
  if (startMonth && month < startMonth) return false;
  if (endMonth   && month > endMonth)   return false;
  return true;
}

// ─── デバッグ ──────────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV, port: process.env.PORT }));
app.use('/api', (_req, res) => res.status(500).json({ error: 'no route matched' }));

// ─── 固定費マスタ API ──────────────────────────────────────────────────────

/**
 * GET /api/recurring-master
 * 固定費マスタ一覧（終了済み・未開始を含め全件）
 */
app.get('/api/recurring-master', (req, res) => {
  res.json(loadRecurring());
});

/**
 * POST /api/recurring-master/update
 * 固定費マスタ1件の startMonth / endMonth を更新
 * Body: { id, startMonth?, endMonth? }
 * endMonth に null を明示的に渡すと「無期限」に戻す。
 */
app.post('/api/recurring-master/update', (req, res) => {
  const { id, startMonth, endMonth } = req.body;
  const numId = Number(id);
  const list = loadRecurring();
  const target = list.find(r => Number(r.id) === numId);
  if (!target) return res.status(404).json({ error: 'not found' });

  if (startMonth !== undefined) target.startMonth = startMonth || null;
  if (endMonth   !== undefined) target.endMonth   = endMonth   || null;

  saveRecurring(list);
  res.json({ success: true, item: target });
});

// ─── 今後の固定費見込み API ────────────────────────────────────────────────

/**
 * GET /api/recurring-expenses?month=YYYY-MM
 * 指定月に有効な固定費一覧と enabled 状態を返す（見込み用）
 * startMonth ≤ month ≤ endMonth の範囲内の項目のみ。
 * monthly_expense_flags にレコードがあればその enabled で上書き、なければ true。
 */
app.get('/api/recurring-expenses', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required' });

  const recurring = loadRecurring();
  const flags     = loadFlags();

  const result = recurring
    .filter(exp => isMonthInRange(month, exp.startMonth, exp.endMonth ?? null))
    .map(exp => {
      const flag = flags.find(
        f => f.month === month && Number(f.recurringExpenseId) === Number(exp.id)
      );
      return {
        ...exp,
        enabled: flag ? !!flag.enabled : true,
      };
    });

  res.json(result);
});

/**
 * GET /api/recurring-expenses/total?month=YYYY-MM
 * 指定月の固定費合計見込みを返す（enabled=true の項目のみ合算）
 */
app.get('/api/recurring-expenses/total', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required' });

  const recurring = loadRecurring();
  const flags     = loadFlags();

  const total = recurring
    .filter(exp => isMonthInRange(month, exp.startMonth, exp.endMonth ?? null))
    .reduce((sum, exp) => {
      const flag    = flags.find(
        f => f.month === month && Number(f.recurringExpenseId) === Number(exp.id)
      );
      const enabled = flag ? !!flag.enabled : true;
      return sum + (enabled ? Number(exp.amount) || 0 : 0);
    }, 0);

  res.json({ month, total });
});

// ─── 月別ON/OFFフラグ API ──────────────────────────────────────────────────

/**
 * POST /api/expense-flag
 * 特定の月 × 固定費ID に対して enabled を true/false で更新する。
 * 同時にその月の transactions の当該固定費レコードだけを追加・削除する。
 * ※ 過去月の transactions には一切触らない。
 *    transactions の識別は recurringExpenseId フィールドで行う。
 * Body: { month: "YYYY-MM", recurringExpenseId: number, enabled: boolean }
 */
app.post('/api/expense-flag', (req, res) => {
  const { month, enabled } = req.body;
  const recurringExpenseId = Number(req.body.recurringExpenseId);

  if (!month || isNaN(recurringExpenseId)) {
    return res.status(400).json({ error: 'month and recurringExpenseId are required' });
  }

  // 1) monthly_expense_flags を更新
  const flags = loadFlags();
  const existing = flags.find(
    f => f.month === month && Number(f.recurringExpenseId) === recurringExpenseId
  );
  if (existing) {
    existing.enabled = !!enabled;
  } else {
    flags.push({
      id: Date.now(),
      month,
      recurringExpenseId,
      enabled: !!enabled,
    });
  }
  saveFlags(flags);

  // 2) この月の transactions を更新（この固定費IDに紐づくレコードのみ）
  const recurring = loadRecurring();
  const expense   = recurring.find(e => Number(e.id) === recurringExpenseId);
  if (!expense) return res.json({ success: true });

  let txns = loadTransactions();

  // この月 × この固定費ID のレコードだけを削除
  txns = txns.filter(
    t => !(t.month === month && Number(t.recurringExpenseId) === recurringExpenseId)
  );

  if (!!enabled) {
    // ON にするなら再追加
    txns.push({
      id: Date.now(),
      date: `${month}-01`,
      month,
      category: expense.name,
      amount: Number(expense.amount) || 0,
      card: expense.card,
      recurringExpenseId,  // ← 識別用。削除・更新時に使う
    });
  }

  saveTransactions(txns);
  res.json({ success: true });
});

// ─── 確定済み実績 API ──────────────────────────────────────────────────────

/**
 * GET /api/transactions?month=YYYY-MM
 * 過去・現在の確定済み実績を返す。
 * month を省略すると全件。
 */
app.get('/api/transactions', (req, res) => {
  const { month } = req.query;
  const all = loadTransactions();
  res.json(month ? all.filter(t => t.month === month) : all);
});

// ─── 静的ファイル（API ルートより後に配置）────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── サーバ起動 ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend API listening on port ${PORT}`);
});
