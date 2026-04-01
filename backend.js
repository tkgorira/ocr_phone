// backend.js
require('dotenv').config();

const fs      = require('fs');
const path    = require('path');
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Stripe  = require('stripe');
const { sql, initDb } = require('./db');

const app = express();

// ─── Stripe ────────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

// ─── Stripe Webhook（express.raw が必要なので JSON ミドルウェアより前）──────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Stripe not configured' });
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerId     = session.customer;
      const subscriptionId = session.subscription;
      if (customerId && subscriptionId) {
        await sql`
          UPDATE users
             SET stripe_subscription_id = ${subscriptionId},
                 subscription_status    = 'active'
           WHERE stripe_customer_id = ${customerId}
        `;
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      await sql`
        UPDATE users
           SET subscription_status = ${sub.status}
         WHERE stripe_subscription_id = ${sub.id}
      `;
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await sql`
        UPDATE users
           SET subscription_status    = 'cancelled',
               stripe_subscription_id = NULL
         WHERE stripe_subscription_id = ${sub.id}
      `;
    }
  } catch (dbErr) {
    console.error('DB error in webhook:', dbErr.message);
  }

  res.json({ received: true });
});

// ─── Apple Pay ドメイン検証ファイル ────────────────────────────────────────
app.get('/.well-known/apple-developer-merchantid-domain-association', (_req, res) => {
  const content = process.env.APPLE_PAY_DOMAIN_ASSOC;
  if (!content) return res.status(404).send('Not configured');
  res.setHeader('Content-Type', 'text/plain');
  res.send(content);
});

// ─── 支払い完了 / キャンセルページ ─────────────────────────────────────────
app.get('/payment/success', (req, res) => {
  res.send(`<!doctype html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登録完了</title>
<style>
  body{background:#1a1a1a;color:#e0c97a;font-family:sans-serif;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .box{text-align:center;padding:2rem}
  h1{margin-bottom:1rem}
  p{color:#ccc}
</style></head><body>
<div class="box">
  <h1>✅ プレミアム登録完了！</h1>
  <p>ご登録ありがとうございます。クラウド同期が有効になりました。</p>
  <p>まもなくアプリに戻ります…</p>
</div>
<script>setTimeout(() => location.href = '/', 2500);</script>
</body></html>`);
});

app.get('/payment/cancel', (_req2, res) => res.redirect('/'));

// ─── JSON ミドルウェア ──────────────────────────────────────────────────────
app.use(express.json());

// ─── JWT ミドルウェア ──────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.userId    = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function signToken(userId, email) {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '30d' }
  );
}

// ─── デバッグ ──────────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV, port: process.env.PORT })
);

// ─── Auth API ──────────────────────────────────────────────────────────────

/** POST /api/auth/register */
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'メールアドレスとパスワード（8文字以上）を入力してください' });
  }
  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
    }
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${hash})
      RETURNING id, email, subscription_status
    `;
    const user  = rows[0];
    const token = signToken(user.id, user.email);
    res.json({ token, user: { id: user.id, email: user.email, subscriptionStatus: user.subscription_status } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

/** POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });
  }
  try {
    const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (rows.length === 0) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });
    }
    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });

    const token = signToken(user.id, user.email);
    res.json({
      token,
      user: { id: user.id, email: user.email, subscriptionStatus: user.subscription_status }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

/** GET /api/auth/me */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, email, subscription_status FROM users WHERE id = ${req.userId}
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    res.json({ id: u.id, email: u.email, subscriptionStatus: u.subscription_status });
  } catch (err) {
    console.error('Me error:', err.message);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ─── ユーザーデータ同期 API ────────────────────────────────────────────────

/** GET /api/user/data — サーバーに保存済みのデータを取得 */
app.get('/api/user/data', requireAuth, async (req, res) => {
  // キャッシュ無効化（PWA・CDN経由でも必ず最新データを返す）
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const rows = await sql`
      SELECT data_key, data_value, updated_at FROM user_data WHERE user_id = ${req.userId}
    `;
    const result = {};
    const meta = {};
    for (const row of rows) {
      result[row.data_key] = row.data_value;
      meta[`${row.data_key}_updated_at`] = row.updated_at;
    }
    res.json({ ...result, _meta: meta });
  } catch (err) {
    console.error('Load data error:', err.message);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/** POST /api/user/data — クライアントデータをサーバーに保存（楽観ロック付き） */
app.post('/api/user/data', requireAuth, async (req, res) => {
  const { expenses, budgetPlans, _clientMeta } = req.body;
  // [Debug] 受信した臨時収入を確認（Renderログで確認可能）
  if (budgetPlans && typeof budgetPlans === 'object') {
    const extraIncomeMap = {};
    Object.entries(budgetPlans).forEach(([k, v]) => {
      if (v?.extraIncome != null && v.extraIncome !== 0) extraIncomeMap[k] = v.extraIncome;
    });
    console.log(`[Debug] POST /api/user/data userId=${req.userId} 臨時収入が設定されている月:`, extraIncomeMap);
    console.log(`[Debug] POST clientMeta.budgetPlans_updated_at =`, _clientMeta?.budgetPlans_updated_at);
  }
  try {
    // 楽観ロックヘルパー: クライアントが知っている updated_at より新しいDBレコードがあれば 409
    async function checkConflict(dataKey, clientKnownAt) {
      if (!clientKnownAt) return false; // クライアントが updated_at を持っていなければスキップ
      const rows = await sql`
        SELECT updated_at FROM user_data
        WHERE user_id = ${req.userId} AND data_key = ${dataKey}
      `;
      if (rows.length === 0) return false; // 新規レコードは競合なし
      const serverTs = new Date(rows[0].updated_at).getTime();
      const clientTs = new Date(clientKnownAt).getTime();
      return serverTs > clientTs + 3000; // 3秒の誤差を許容
    }

    if (expenses !== undefined) {
      const conflict = await checkConflict('expenses', _clientMeta?.expenses_updated_at);
      if (conflict) {
        return res.status(409).json({
          error: '他の端末から更新されています。「サーバーから再読込」してから保存してください。',
          type: 'conflict', key: 'expenses',
        });
      }
      await sql`
        INSERT INTO user_data (user_id, data_key, data_value, updated_at)
        VALUES (${req.userId}, 'expenses', ${JSON.stringify(expenses)}, NOW())
        ON CONFLICT (user_id, data_key) DO UPDATE
          SET data_value = EXCLUDED.data_value,
              updated_at = EXCLUDED.updated_at
      `;
    }
    if (budgetPlans !== undefined) {
      const conflict = await checkConflict('budgetPlans', _clientMeta?.budgetPlans_updated_at);
      if (conflict) {
        return res.status(409).json({
          error: '他の端末から更新されています。「サーバーから再読込」してから保存してください。',
          type: 'conflict', key: 'budgetPlans',
        });
      }
      await sql`
        INSERT INTO user_data (user_id, data_key, data_value, updated_at)
        VALUES (${req.userId}, 'budgetPlans', ${JSON.stringify(budgetPlans)}, NOW())
        ON CONFLICT (user_id, data_key) DO UPDATE
          SET data_value = EXCLUDED.data_value,
              updated_at = EXCLUDED.updated_at
      `;
    }
    // 保存後の updated_at をクライアントへ返す（次回保存の楽観ロック用）
    const updatedRows = await sql`
      SELECT data_key, updated_at FROM user_data WHERE user_id = ${req.userId}
    `;
    const meta = {};
    for (const row of updatedRows) meta[`${row.data_key}_updated_at`] = row.updated_at;
    res.json({ success: true, _meta: meta });
  } catch (err) {
    console.error('Save data error:', err.message);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ─── Stripe サブスクリプション API ────────────────────────────────────────

/** POST /api/stripe/checkout — Stripe Checkout セッションを作成 */
app.post('/api/stripe/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
  try {
    // Stripe カスタマーを取得 or 作成
    const userRows = await sql`SELECT email, stripe_customer_id FROM users WHERE id = ${req.userId}`;
    const user = userRows[0];
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await sql`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${req.userId}`;
    }

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items: [{
        price:    process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/payment/cancel`,
      locale:      'ja',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/stripe/portal — カスタマーポータル（解約・変更） */
app.post('/api/stripe/portal', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
  try {
    const rows = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer found' });

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: appUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── 固定費マスタ API ──────────────────────────────────────────────────────

const DATA_DIR         = path.join(__dirname, 'data');
const RECURRING_FILE   = path.join(DATA_DIR, 'recurring_expenses.json');
const FLAGS_FILE       = path.join(DATA_DIR, 'monthly_expense_flags.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

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

function isMonthInRange(month, startMonth, endMonth) {
  if (startMonth && month < startMonth) return false;
  if (endMonth   && month > endMonth)   return false;
  return true;
}

app.get('/api/recurring-master', (_req3, res) => res.json(loadRecurring()));

app.post('/api/recurring-master/update', (req, res) => {
  const { id, startMonth, endMonth } = req.body;
  const numId = Number(id);
  const list  = loadRecurring();
  const target = list.find(r => Number(r.id) === numId);
  if (!target) return res.status(404).json({ error: 'not found' });
  if (startMonth !== undefined) target.startMonth = startMonth || null;
  if (endMonth   !== undefined) target.endMonth   = endMonth   || null;
  saveRecurring(list);
  res.json({ success: true, item: target });
});

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
      return { ...exp, enabled: flag ? !!flag.enabled : true };
    });
  res.json(result);
});

app.get('/api/recurring-expenses/total', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required' });
  const recurring = loadRecurring();
  const flags     = loadFlags();
  const total = recurring
    .filter(exp => isMonthInRange(month, exp.startMonth, exp.endMonth ?? null))
    .reduce((sum, exp) => {
      const flag    = flags.find(f => f.month === month && Number(f.recurringExpenseId) === Number(exp.id));
      const enabled = flag ? !!flag.enabled : true;
      return sum + (enabled ? Number(exp.amount) || 0 : 0);
    }, 0);
  res.json({ month, total });
});

app.post('/api/expense-flag', (req, res) => {
  const { month, enabled } = req.body;
  const recurringExpenseId = Number(req.body.recurringExpenseId);
  if (!month || isNaN(recurringExpenseId)) {
    return res.status(400).json({ error: 'month and recurringExpenseId are required' });
  }
  const flags    = loadFlags();
  const existing = flags.find(f => f.month === month && Number(f.recurringExpenseId) === recurringExpenseId);
  if (existing) {
    existing.enabled = !!enabled;
  } else {
    flags.push({ id: Date.now(), month, recurringExpenseId, enabled: !!enabled });
  }
  saveFlags(flags);

  const recurring = loadRecurring();
  const expense   = recurring.find(e => Number(e.id) === recurringExpenseId);
  if (!expense) return res.json({ success: true });

  let txns = loadTransactions();
  txns = txns.filter(t => !(t.month === month && Number(t.recurringExpenseId) === recurringExpenseId));
  if (!!enabled) {
    txns.push({
      id: Date.now(),
      date: `${month}-01`,
      month,
      category: expense.name,
      amount: Number(expense.amount) || 0,
      card: expense.card,
      recurringExpenseId,
    });
  }
  saveTransactions(txns);
  res.json({ success: true });
});

app.get('/api/transactions', (req, res) => {
  const { month } = req.query;
  const all = loadTransactions();
  res.json(month ? all.filter(t => t.month === month) : all);
});

// ─── 静的ファイル ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── サーバ起動 ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDb();
      console.log('Database initialized');
    } catch (err) {
      console.error('DB init error:', err.message);
    }
  } else {
    console.warn('DATABASE_URL not set — auth/sync disabled');
  }
  app.listen(PORT, () => {
    console.log(`Backend API listening on port ${PORT}`);
  });
}

start();
