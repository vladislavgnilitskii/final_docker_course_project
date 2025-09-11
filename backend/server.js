const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const waitOn = require('wait-on');
const app = express();

require('dotenv').config();

app.use(express.json());
app.use(cors());

const PORT = process.env.BACKEND_PORT || 3001;
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.POSTGRES_USER;
const DB_PASS = process.env.POSTGRES_PASSWORD;
const DB_NAME = process.env.POSTGRES_DB;
const DB_PORT = process.env.DB_PORT || 5432;

if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
  console.error('Missing required environment variables: DB_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB');
  process.exit(1);
}

const pool = new Pool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_NAME,
  password: DB_PASS,
  port: DB_PORT,
});

async function waitForDatabase() {
  try {
    await waitOn({
      resources: [`tcp:${DB_HOST}:${DB_PORT}`],
      timeout: 30000, // Ждать до 30 секунд
    });
    console.log('Database is ready');
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
}

app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/clients', async (req, res) => {
  const { name, email, phone, company } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO clients (name, email, phone, company) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, company]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

waitForDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
});
