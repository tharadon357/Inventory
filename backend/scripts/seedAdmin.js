/**
 * scripts/seedAdmin.js
 * ------------------------------------------------------------------
 * สร้างบัญชี admin คนแรกในตาราง `users` (hash รหัสผ่านด้วย bcrypt ก่อน insert)
 *
 * วิธีรัน:
 *   node scripts/seedAdmin.js
 *
 * อ่านค่า username/password เริ่มต้นจาก .env
 * (SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD) หรือส่งเป็น argument ก็ได้:
 *   node scripts/seedAdmin.js myadmin MyStrongPass123
 * ------------------------------------------------------------------
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const username = process.argv[2] || process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.argv[3] || process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    console.error('✗ ไม่พบรหัสผ่าน: ตั้งค่า SEED_ADMIN_PASSWORD ใน .env หรือส่งเป็น argument ที่ 2');
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      console.log(`ℹ️  ผู้ใช้ "${username}" มีอยู่แล้ว — ข้ามการสร้าง (ถ้าต้องการรีเซ็ตรหัสผ่าน ให้ลบแถวนี้ในตาราง users ก่อน)`);
      process.exit(0);
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hash, 'admin']
    );

    console.log(`✓ สร้างบัญชี admin สำเร็จ: username="${username}"`);
    console.log('  กรุณาเปลี่ยนรหัสผ่านทันทีหลังล็อกอินครั้งแรก');
  } catch (err) {
    console.error('✗ เกิดข้อผิดพลาดระหว่างสร้างบัญชี admin:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
