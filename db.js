// db.js — PostgreSQL (pg Pool) セットアップ
// DATABASE_URL を差し替えるだけで Neon / Render / ラズパイローカルに対応
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[db] ERROR: DATABASE_URL が設定されていません。.env を確認してください。');
  process.exit(1);
}

const sslEnabled = process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(sslEnabled ? { ssl: { rejectUnauthorized: false } } : {}),
});

// @neondatabase/serverless の sql タグ互換インターフェース
// backend.js 側のコードを変更せずにそのまま使えます
function sql(strings, ...values) {
  let text = '';
  strings.forEach((str, i) => {
    text += str;
    if (i < values.length) text += `$${i + 1}`;
  });
  return pool.query(text, values).then(res => res.rows);
}

async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id               SERIAL PRIMARY KEY,
      email            VARCHAR(255) UNIQUE NOT NULL,
      password_hash    VARCHAR(255) NOT NULL,
      stripe_customer_id     VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      subscription_status    VARCHAR(50) DEFAULT 'free',
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      data_key   VARCHAR(100) NOT NULL,
      data_value JSONB NOT NULL DEFAULT 'null',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, data_key)
    )
  `;
}

module.exports = { sql, initDb, pool };
