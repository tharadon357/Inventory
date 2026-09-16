/**
 * ==========================================================================
 * Guitar Store — Backend API (Express + MySQL)
 * ==========================================================================
 * Project owner : tharadon
 * Database      : ip_std6730251115 (phpMyAdmin / MySQL) — table `Inventory`
 * Port          : 3083   (Public URL: http://119.59.102.161:3083)
 *
 * ก่อนรัน:
 *   1. npm install express mysql2 cors dotenv
 *   2. ตรวจสอบว่ามีไฟล์ .env (ดู DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / PORT)
 *   3. รัน guitar_store_seed.sql ใน phpMyAdmin (สร้างตาราง Inventory + ข้อมูลตั้งต้น
 *      ถ้ายังไม่มี — ปลอดภัยต่อการรันซ้ำ)
 *   4. รัน `node server.js` (หรือ `npm run server` ถ้าตั้งค่าไว้ใน package.json)
 *
 * Endpoints หลักตามโจทย์:
 *   GET    /nindam_pro_api      — ดึงสินค้ากีตาร์ทั้งหมด
 *   POST   /api/login           — ล็อกอิน (admin จาก .env, ลูกค้าจากตาราง Users)
 *   POST   /api/register        — สมัครสมาชิกลูกค้าใหม่ (role: 'user')
 *   POST   /api/products        — เพิ่มกีตาร์ใหม่
 *   PUT    /api/products/:id    — แก้ไขกีตาร์
 *   DELETE /api/products/:id    — ลบกีตาร์
 *   POST   /api/orders          — สั่งซื้อ (checkout จากตะกร้า)
 *   GET    /api/orders          — ประวัติการสั่งซื้อ (?username=...)
 *
 * ก่อนใช้ฟีเจอร์บัญชีลูกค้า/ตะกร้า ต้องรัน guitar_store_orders_migration.sql
 * ใน phpMyAdmin ก่อน 1 ครั้ง (สร้างตาราง Users / Orders / OrderItems)
 *
 * Endpoints เดิม (/api/inventory, /api/ml/clustering) ยังคงเก็บไว้ด้านล่างสุด
 * ของไฟล์เพื่อความเข้ากันได้กับหน้าจอ/ไฟล์ที่เคย scaffold ไว้ก่อนหน้านี้
 * (src/lib/api-client.ts, src/components/inventory/*) — ไม่กระทบกับ endpoint
 * ใหม่ด้านบนแต่อย่างใด เพราะคนละ path กัน
 * ==========================================================================
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const PORT = Number(process.env.PORT) || 3083;

// --------------------------------------------------------------------------
// Database pool
// --------------------------------------------------------------------------
// หมายเหตุ: MySQL บนโฮสต์นี้รับเฉพาะการเชื่อมต่อจาก localhost เท่านั้น (แม้แต่จากเครื่อง
// เดียวกันเอง ก็เชื่อมผ่าน IP สาธารณะไม่ได้ - ECONNREFUSED) จึงล็อกค่า host ไว้เป็น
// 'localhost' ตรง ๆ แทนที่จะอ่านจาก DB_HOST ใน .env กัน .env ถูกเขียนทับผิดค่าแล้วพังซ้ำ
const pool = mysql.createPool({
  host: 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'std6730251115',
  password: process.env.DB_PASSWORD || 'X7m^vT2r',
  database: process.env.DB_NAME || 'ip_std6730251115',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// คอลัมน์ทั้งหมดของตาราง Inventory ที่ endpoint นี้รู้จัก
const INVENTORY_COLUMNS = [
  'id', 'name', 'stock', 'price', 'category', 'location', 'image', 'status',
  'brand', 'sizes', 'productCode', 'orderName', 'storeAvailability', 'lastUpdate',
];
// คอลัมน์ที่ยอมให้เพิ่ม/แก้ไขได้ผ่าน API (ไม่รวม id / lastUpdate ซึ่งจัดการโดยระบบ)
const WRITABLE_COLUMNS = INVENTORY_COLUMNS.filter((c) => c !== 'id' && c !== 'lastUpdate');

// --------------------------------------------------------------------------
// App setup
// --------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' })); // เผื่อ image เป็น base64 string

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function pickWritableFields(body) {
  const out = {};
  for (const col of WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(body, col)) {
      out[col] = body[col];
    }
  }
  return out;
}

function normalizeProductPayload(body = {}) {
  const fields = pickWritableFields(body);
  if (fields.stock !== undefined) fields.stock = Number(fields.stock) || 0;
  if (fields.price !== undefined) fields.price = Number(fields.price) || 0;
  return fields;
}

// ==========================================================================
// 1) GET /nindam_pro_api — ดึงสินค้ากีตาร์ทั้งหมด (public, ไม่ต้องล็อกอิน)
//    รองรับ query เสริม: ?q=ค้นหาชื่อ/แบรนด์  &category=Acoustic|Electric
// ==========================================================================
app.get(
  '/nindam_pro_api',
  asyncHandler(async (req, res) => {
    const { q, category } = req.query;
    const where = [];
    const params = [];

    if (q) {
      where.push('(name LIKE ? OR brand LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM Inventory ${whereSql} ORDER BY id ASC`,
      params
    );

    res.json({ success: true, count: rows.length, data: rows });
  })
);

// ==========================================================================
// 2) POST /api/login — ล็อกอินแบบง่าย (admin/user) สำหรับหน้าจัดการร้าน
//    ตั้งค่าบัญชีผ่าน .env: ADMIN_USERNAME / ADMIN_PASSWORD
//    (ไม่ใช้ JWT/bcrypt เพราะโจทย์ระบุว่าเป็น "Simple Auth Login")
// ==========================================================================
app.post(
  '/api/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'กรุณากรอก username และ password' });
    }

    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'guitar123';

    if (username === adminUser && password === adminPass) {
      return res.json({
        success: true,
        user: { username, role: 'admin' },
      });
    }

    // บัญชีที่สมัครสมาชิกเอง (เก็บใน Users, รหัสผ่าน hash ด้วย bcrypt)
    const [userRows] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
    const userRow = userRows[0];
    if (userRow && (await bcrypt.compare(password, userRow.passwordHash))) {
      return res.json({ success: true, user: { username: userRow.username, role: userRow.role || 'user' } });
    }

    return res.status(401).json({ success: false, error: 'username หรือ password ไม่ถูกต้อง' });
  })
);

// ==========================================================================
// 2b) POST /api/register — สมัครสมาชิกใหม่ (ลูกค้าทั่วไป, role: 'user')
// ==========================================================================
app.post(
  '/api/register',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const trimmedUsername = (username || '').trim();

    if (!trimmedUsername || !password) {
      return res.status(400).json({ success: false, error: 'กรุณากรอก username และ password' });
    }
    if (password.length < 4) {
      return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    }

    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    if (trimmedUsername === adminUser) {
      return res.status(409).json({ success: false, error: 'ชื่อผู้ใช้นี้ไม่สามารถใช้ได้' });
    }

    const [existingRows] = await pool.query('SELECT id FROM Users WHERE username = ?', [trimmedUsername]);
    if (existingRows[0]) {
      return res.status(409).json({ success: false, error: 'มีชื่อผู้ใช้นี้อยู่แล้ว กรุณาเลือกชื่ออื่น' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO Users (username, passwordHash, role) VALUES (?, ?, ?)',
      [trimmedUsername, passwordHash, 'user']
    );

    res.status(201).json({ success: true, user: { username: trimmedUsername, role: 'user' } });
  })
);

// ==========================================================================
// 3) POST /api/products — เพิ่มกีตาร์ใหม่
// ==========================================================================
app.post(
  '/api/products',
  asyncHandler(async (req, res) => {
    const fields = normalizeProductPayload(req.body);
    if (!fields.name) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อสินค้า (name)' });
    }
    fields.lastUpdate = new Date();

    const columns = Object.keys(fields);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((c) => fields[c]);

    const [result] = await pool.query(
      `INSERT INTO Inventory (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    const [rows] = await pool.query('SELECT * FROM Inventory WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: rows[0] });
  })
);

// ==========================================================================
// 4) PUT /api/products/:id — แก้ไขกีตาร์
// ==========================================================================
app.put(
  '/api/products/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [existingRows] = await pool.query('SELECT * FROM Inventory WHERE id = ?', [id]);
    if (!existingRows[0]) return res.status(404).json({ success: false, error: 'ไม่พบสินค้านี้' });

    const fields = normalizeProductPayload(req.body);
    fields.lastUpdate = new Date();

    const columns = Object.keys(fields);
    if (columns.length === 0) {
      return res.status(400).json({ success: false, error: 'ไม่มีข้อมูลให้อัปเดต' });
    }
    const setSql = columns.map((c) => `${c} = ?`).join(', ');
    const values = columns.map((c) => fields[c]);

    await pool.query(`UPDATE Inventory SET ${setSql} WHERE id = ?`, [...values, id]);

    const [rows] = await pool.query('SELECT * FROM Inventory WHERE id = ?', [id]);
    res.json({ success: true, data: rows[0] });
  })
);

// ==========================================================================
// 5) DELETE /api/products/:id — ลบกีตาร์
// ==========================================================================
app.delete(
  '/api/products/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [existingRows] = await pool.query('SELECT * FROM Inventory WHERE id = ?', [id]);
    if (!existingRows[0]) return res.status(404).json({ success: false, error: 'ไม่พบสินค้านี้' });

    await pool.query('DELETE FROM Inventory WHERE id = ?', [id]);

    res.json({ success: true });
  })
);

// ==========================================================================
// 6) POST /api/orders — สั่งซื้อ: สร้างออเดอร์จากตะกร้าสินค้าของลูกค้า
// ==========================================================================
app.post(
  '/api/orders',
  asyncHandler(async (req, res) => {
    const { username, items } = req.body || {};

    if (!username) {
      return res.status(400).json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนสั่งซื้อ' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'ตะกร้าสินค้าว่างเปล่า' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // ตรวจสอบสินค้า/สต๊อกทั้งหมดก่อน เพื่อไม่ให้ตัดสต๊อกไปครึ่งเดียวถ้าสั่งไม่สำเร็จ
      const resolvedItems = [];
      for (const raw of items) {
        const productId = Number(raw.productId);
        const quantity = Number(raw.quantity) || 0;
        if (!productId || quantity <= 0) {
          throw Object.assign(new Error('ข้อมูลสินค้าในตะกร้าไม่ถูกต้อง'), { statusCode: 400 });
        }
        const [productRows] = await connection.query(
          'SELECT * FROM Inventory WHERE id = ? FOR UPDATE',
          [productId]
        );
        const product = productRows[0];
        if (!product) {
          throw Object.assign(new Error(`ไม่พบสินค้า (id ${productId})`), { statusCode: 404 });
        }
        if ((product.stock ?? 0) < quantity) {
          throw Object.assign(
            new Error(`สินค้าไม่พอ: ${product.name} (เหลือ ${product.stock})`),
            { statusCode: 409 }
          );
        }
        resolvedItems.push({ product, quantity });
      }

      const totalAmount = resolvedItems.reduce(
        (sum, item) => sum + (Number(item.product.price) || 0) * item.quantity,
        0
      );

      const [orderResult] = await connection.query(
        'INSERT INTO Orders (username, totalAmount, status) VALUES (?, ?, ?)',
        [username, totalAmount, 'สำเร็จ']
      );
      const orderId = orderResult.insertId;

      for (const item of resolvedItems) {
        await connection.query(
          `INSERT INTO OrderItems (orderId, productId, productName, price, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.product.id, item.product.name, item.product.price, item.quantity]
        );
        await connection.query(
          'UPDATE Inventory SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.product.id]
        );
      }

      await connection.commit();
      res.status(201).json({
        success: true,
        order: { id: orderId, username, totalAmount, status: 'สำเร็จ' },
      });
    } catch (err) {
      await connection.rollback();
      if (err.statusCode) {
        return res.status(err.statusCode).json({ success: false, error: err.message });
      }
      throw err;
    } finally {
      connection.release();
    }
  })
);

// ==========================================================================
// 7) GET /api/orders — ประวัติการสั่งซื้อ (?username=...)
// ==========================================================================
app.get(
  '/api/orders',
  asyncHandler(async (req, res) => {
    const { username } = req.query;
    const [orders] = username
      ? await pool.query('SELECT * FROM Orders WHERE username = ? ORDER BY id DESC', [username])
      : await pool.query('SELECT * FROM Orders ORDER BY id DESC');

    for (const order of orders) {
      const [orderItems] = await pool.query('SELECT * FROM OrderItems WHERE orderId = ?', [order.id]);
      order.items = orderItems;
    }

    res.json({ success: true, count: orders.length, data: orders });
  })
);

// --------------------------------------------------------------------------
// Health check
// --------------------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ==========================================================================
// Legacy endpoints — เก็บไว้เพื่อความเข้ากันได้กับสิ่งที่เคย scaffold ไว้ก่อนหน้า
// (src/lib/api-client.ts, src/components/inventory/*, utils/cluster.js)
// ไม่ได้ใช้งานจากหน้า Guitar Store หลัก (src/app/index.tsx) แต่เก็บไว้เผื่อจำเป็น
// ==========================================================================
app.get(
  '/api/inventory',
  asyncHandler(async (req, res) => {
    const { q, category, status, page = 1, limit = 50 } = req.query;

    const where = [];
    const params = [];

    if (q) {
      where.push('(name LIKE ? OR brand LIKE ? OR productCode LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const [rows] = await pool.query(
      `SELECT * FROM Inventory ${whereSql} ORDER BY lastUpdate DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM Inventory ${whereSql}`,
      params
    );

    res.json({ data: rows, total, page: safePage, limit: safeLimit });
  })
);

app.get(
  '/api/inventory/:id',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM Inventory WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบสินค้านี้' });
    res.json(rows[0]);
  })
);

const { clusterInventory } = require('./utils/cluster');

app.get(
  '/api/ml/clustering',
  asyncHandler(async (req, res) => {
    const k = Math.min(Math.max(Number(req.query.k) || 3, 2), 6);
    const [rows] = await pool.query(
      'SELECT id, name, brand, category, stock, status FROM Inventory'
    );

    if (rows.length === 0) {
      return res.json({ k, clusters: [] });
    }

    const result = clusterInventory(rows, k);
    res.json({ k, generatedAt: new Date().toISOString(), clusters: result });
  })
);

// --------------------------------------------------------------------------
// 404 + error handling
// --------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'ไม่พบ endpoint นี้' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`🎸 Guitar Store API running on http://0.0.0.0:${PORT}`);
});
