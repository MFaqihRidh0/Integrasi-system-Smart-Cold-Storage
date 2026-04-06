const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env' }); // Adjust path if needed

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'cryomedics',
  password: process.env.DB_PASSWORD || 'cryomedics_secret',
  port: parseInt(process.env.DB_PORT || '5432'),
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create storages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS storages (
        storage_id VARCHAR(50) PRIMARY KEY,
        current_temp DOUBLE PRECISION DEFAULT 0.0,
        current_humidity DOUBLE PRECISION DEFAULT 0.0,
        status VARCHAR(20) DEFAULT 'NORMAL',
        last_update BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        batch_count INTEGER DEFAULT 0
      );
    `);

    // Create batches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id VARCHAR(100) PRIMARY KEY,
        storage_id VARCHAR(50) REFERENCES storages(storage_id),
        content_type VARCHAR(100),
        quantity INTEGER,
        expiry_date VARCHAR(50),
        notes TEXT,
        min_temp DOUBLE PRECISION,
        max_temp DOUBLE PRECISION
      );
    `);

    // Create telemetry table
    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id SERIAL PRIMARY KEY,
        storage_id VARCHAR(50) REFERENCES storages(storage_id),
        timestamp BIGINT,
        temperature DOUBLE PRECISION,
        humidity DOUBLE PRECISION,
        pressure DOUBLE PRECISION,
        sensor_id VARCHAR(100)
      );
    `);
    
    // Index mapping storage_id and timestamp for fast range filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_storage_timestamp 
      ON telemetry (storage_id, timestamp);
    `);

    // Create alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        alert_id VARCHAR(100) PRIMARY KEY,
        storage_id VARCHAR(50) REFERENCES storages(storage_id),
        type INTEGER,
        severity INTEGER,
        message TEXT,
        value DOUBLE PRECISION,
        threshold DOUBLE PRECISION,
        triggered_at BIGINT,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at BIGINT DEFAULT 0,
        resolved_by VARCHAR(100),
        resolution_notes TEXT
      );
    `);

    // Seed default storages if table is empty
    const { rows } = await client.query('SELECT COUNT(*) FROM storages');
    if (parseInt(rows[0].count) === 0) {
      await client.query(`
        INSERT INTO storages (storage_id, current_temp, current_humidity, status) VALUES 
        ('FRIDGE-001', -20.0, 45.0, 'NORMAL'),
        ('FRIDGE-002', 4.0, 50.0, 'NORMAL'),
        ('FRIDGE-003', -70.0, 30.0, 'NORMAL');
      `);
      console.log('[DB] Seeded default storages');
    }

    await client.query('COMMIT');
    console.log('[DB] PostgreSQL Schema Initialization Successful.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[DB] Schema Initialization Error:', e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDB
};
