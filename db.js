// db.js — Neon PostgreSQL セットアップ
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL || '');

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

module.exports = { sql, initDb };
