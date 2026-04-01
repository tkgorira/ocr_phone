// db.js — Neon PostgreSQL セットアップ
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('環境変数 DATABASE_URL が未設定です。');
  process.exit(1);
}

const useSSL = process.env.DATABASE_SSL === 'true';

const pool = new Pool(
  useSSL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        connectionString: process.env.DATABASE_URL,
      }
);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
