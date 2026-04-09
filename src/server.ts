import 'dotenv/config';
import app from './app';
import { pool } from './db/client';
import { startAliasListener } from './modules/parser/header';

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✓ Neon PostgreSQL connected');
    await startAliasListener();
  } catch (err) {
    console.error('✗ Startup failed:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`  POST /api/upload  — upload an Excel or CSV file`);
    console.log(`  GET  /health      — health check`);
  });
}

start();
