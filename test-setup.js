const db = require('./config/db');
const redis = require('./config/redis');

async function runTest() {
  try {
    console.log('Testing Postgres Connection...');
    const tables = await db.raw("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public';");
    console.log('Connected to Postgres! Found tables:', tables.rows.map(t => t.tablename));

    console.log('\nTesting Redis Connection...');
    await redis.set('test_key', 'Redis is working!');
    const value = await redis.get('test_key');
    console.log(`${value}`);

  } catch (error) {
    console.error(' Connection Failed:', error);
  } finally {
    await db.destroy();
    redis.disconnect();
  }
}

runTest();