/**
 * ==========================================================================
 * Guitar Store — LOCAL Backend (Express + SQLite)
 * ==========================================================================
 * เหตุผลที่มีไฟล์นี้แยกจาก server.js:
 *   เครื่อง/เครือข่ายนี้เชื่อมต่อไปยังฐานข้อมูล MySQL ที่ 119.59.102.161:3306
 *   ไม่ได้ (connect ETIMEDOUT) — ทั้งพอร์ตแอป 3083 และพอร์ต DB 3306 เข้าไม่ถึง
 *   ไฟล์นี้จึงใช้ SQLite แบบไฟล์เดียวในเครื่อง (ไม่ต้องพึ่งเน็ต/เซิร์ฟเวอร์ภายนอก)
 *   เพื่อให้ร้านค้ามีสินค้าให้แสดงผลได้ทันทีระหว่างที่เซิร์ฟเวอร์จริงเข้าไม่ถึง
 *
 * รันด้วย:  node server-local.js   (หรือดับเบิลคลิก start-local-server.bat)
 * พอร์ต   :  3081
 *
 * Endpoints เหมือน server.js (เท่าที่หน้า src/app/index.tsx ใช้งานจริง):
 *   GET    /nindam_pro_api
 *   POST   /api/login
 *   POST   /api/register
 *   POST   /api/products
 *   PUT    /api/products/:id
 *   DELETE /api/products/:id
 *   POST   /api/orders        — checkout: create an order from cart items
 *   GET    /api/orders        — order history (?username=...)
 *   GET    /api/health
 * ==========================================================================
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const PORT = 3081;
const DB_FILE = path.join(__dirname, 'inventory-local.db');

const INVENTORY_COLUMNS = [
  'id', 'name', 'stock', 'price', 'category', 'location', 'image', 'status',
  'brand', 'sizes', 'productCode', 'orderName', 'storeAvailability', 'lastUpdate',
];
const WRITABLE_COLUMNS = INVENTORY_COLUMNS.filter((c) => c !== 'id' && c !== 'lastUpdate');

const SEED_PRODUCTS = [
  { name: 'Fender Player Stratocaster Electric Guitar', stock: 4, price: 24500, category: 'Electric', brand: 'Fender', image: 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?w=400', status: 'Active' },
  { name: 'Gibson Les Paul Standard 60s', stock: 2, price: 89000, category: 'Electric', brand: 'Gibson', image: 'https://images.unsplash.com/photo-1550985616-10810253b84d?w=400', status: 'Active' },
  { name: 'Taylor 214ce Acoustic-Electric Guitar', stock: 5, price: 39900, category: 'Acoustic', brand: 'Taylor', image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400', status: 'Active' },
  { name: 'Ibanez RG421EX Electric Guitar', stock: 8, price: 13500, category: 'Electric', brand: 'Ibanez', image: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=400', status: 'Active' },
  { name: 'Martin D-28 Standard Acoustic Guitar', stock: 3, price: 11500, category: 'Acoustic', brand: 'Martin', image: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=400', status: 'Active' },
  { name: 'YAMAHA F310 Acoustic Guitar', stock: 12, price: 4500, category: 'Acoustic', brand: 'Yamaha', image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400', status: 'Active' },
];

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function pickWritableFields(body) {
  const out = {};
  for (const col of WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(body, col)) out[col] = body[col];
  }
  return out;
}

function normalizeProductPayload(body = {}) {
  const fields = pickWritableFields(body);
  if (fields.stock !== undefined) fields.stock = Number(fields.stock) || 0;
  if (fields.price !== undefined) fields.price = Number(fields.price) || 0;
  return fields;
}

async function main() {
  const db = await open({ filename: DB_FILE, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS Inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      stock INTEGER DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'Guitar',
      location TEXT DEFAULT 'Warehouse',
      image TEXT,
      status TEXT DEFAULT 'Active',
      brand TEXT,
      sizes TEXT,
      productCode TEXT,
      orderName TEXT,
      storeAvailability TEXT,
      lastUpdate TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS Orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      totalAmount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'สำเร็จ',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS OrderItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      productId INTEGER,
      productName TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (orderId) REFERENCES Orders(id)
    );
  `);

  const { count } = await db.get('SELECT COUNT(*) AS count FROM Inventory');
  if (count === 0) {
    for (const p of SEED_PRODUCTS) {
      await db.run(
        `INSERT INTO Inventory (name, stock, price, category, brand, image, status, lastUpdate)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [p.name, p.stock, p.price, p.category, p.brand, p.image, p.status]
      );
    }
    console.log(`🌱 Seeded ${SEED_PRODUCTS.length} guitars into ${DB_FILE}`);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'local-sqlite', time: new Date().toISOString() }));

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
      const rows = await db.all(`SELECT * FROM Inventory ${whereSql} ORDER BY id ASC`, params);
      res.json({ success: true, count: rows.length, data: rows });
    })
  );

  app.post(
    '/api/login',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'กรุณากรอก username และ password' });
      }

      // 1) บัญชีแอดมิน (hardcoded / ตั้งค่าผ่าน .env ได้)
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      const adminPass = process.env.ADMIN_PASSWORD || 'guitar123';
      if (username === adminUser && password === adminPass) {
        return res.json({ success: true, user: { username, role: 'admin' } });
      }

      // 2) บัญชีที่สมัครสมาชิกเอง (เก็บใน Users, รหัสผ่าน hash ด้วย bcrypt)
      const row = await db.get('SELECT * FROM Users WHERE username = ?', [username]);
      if (row && (await bcrypt.compare(password, row.passwordHash))) {
        return res.json({ success: true, user: { username: row.username, role: row.role || 'user' } });
      }

      return res.status(401).json({ success: false, error: 'username หรือ password ไม่ถูกต้อง' });
    })
  );

  // ==========================================================================
  // POST /api/register — สมัครสมาชิกใหม่ (ลูกค้าทั่วไป, role: 'user')
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

      const existing = await db.get('SELECT id FROM Users WHERE username = ?', [trimmedUsername]);
      if (existing) {
        return res.status(409).json({ success: false, error: 'มีชื่อผู้ใช้นี้อยู่แล้ว กรุณาเลือกชื่ออื่น' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await db.run(
        'INSERT INTO Users (username, passwordHash, role) VALUES (?, ?, ?)',
        [trimmedUsername, passwordHash, 'user']
      );

      res.status(201).json({ success: true, user: { username: trimmedUsername, role: 'user' } });
    })
  );

  app.post(
    '/api/products',
    asyncHandler(async (req, res) => {
      const fields = normalizeProductPayload(req.body);
      if (!fields.name) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อสินค้า (name)' });
      }
      const columns = Object.keys(fields);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((c) => fields[c]);
      const result = await db.run(
        `INSERT INTO Inventory (${columns.join(', ')}, lastUpdate) VALUES (${placeholders}, CURRENT_TIMESTAMP)`,
        values
      );
      const row = await db.get('SELECT * FROM Inventory WHERE id = ?', [result.lastID]);
      res.status(201).json({ success: true, data: row });
    })
  );

  app.put(
    '/api/products/:id',
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const existing = await db.get('SELECT * FROM Inventory WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ success: false, error: 'ไม่พบสินค้านี้' });

      const fields = normalizeProductPayload(req.body);
      const columns = Object.keys(fields);
      if (columns.length === 0) {
        return res.status(400).json({ success: false, error: 'ไม่มีข้อมูลให้อัปเดต' });
      }
      const setSql = columns.map((c) => `${c} = ?`).join(', ');
      const values = columns.map((c) => fields[c]);
      await db.run(`UPDATE Inventory SET ${setSql}, lastUpdate = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
      const row = await db.get('SELECT * FROM Inventory WHERE id = ?', [id]);
      res.json({ success: true, data: row });
    })
  );

  app.delete(
    '/api/products/:id',
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const existing = await db.get('SELECT * FROM Inventory WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ success: false, error: 'ไม่พบสินค้านี้' });
      await db.run('DELETE FROM Inventory WHERE id = ?', [id]);
      res.json({ success: true });
    })
  );

  // ==========================================================================
  // POST /api/orders — checkout: create an order from the customer's cart
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

      // Look up every product first and make sure there's enough stock before
      // touching anything, so a failed order never partially decrements stock.
      const resolvedItems = [];
      for (const raw of items) {
        const productId = Number(raw.productId);
        const quantity = Number(raw.quantity) || 0;
        if (!productId || quantity <= 0) {
          return res.status(400).json({ success: false, error: 'ข้อมูลสินค้าในตะกร้าไม่ถูกต้อง' });
        }
        const product = await db.get('SELECT * FROM Inventory WHERE id = ?', [productId]);
        if (!product) {
          return res.status(404).json({ success: false, error: `ไม่พบสินค้า (id ${productId})` });
        }
        if ((product.stock ?? 0) < quantity) {
          return res
            .status(409)
            .json({ success: false, error: `สินค้าไม่พอ: ${product.name} (เหลือ ${product.stock})` });
        }
        resolvedItems.push({ product, quantity });
      }

      const totalAmount = resolvedItems.reduce(
        (sum, item) => sum + (Number(item.product.price) || 0) * item.quantity,
        0
      );

      const orderResult = await db.run(
        'INSERT INTO Orders (username, totalAmount, status) VALUES (?, ?, ?)',
        [username, totalAmount, 'สำเร็จ']
      );
      const orderId = orderResult.lastID;

      for (const item of resolvedItems) {
        await db.run(
          `INSERT INTO OrderItems (orderId, productId, productName, price, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.product.id, item.product.name, item.product.price, item.quantity]
        );
        await db.run(
          'UPDATE Inventory SET stock = stock - ?, lastUpdate = CURRENT_TIMESTAMP WHERE id = ?',
          [item.quantity, item.product.id]
        );
      }

      res.status(201).json({
        success: true,
        order: { id: orderId, username, totalAmount, status: 'สำเร็จ' },
      });
    })
  );

  // ==========================================================================
  // GET /api/orders — order history (?username=...)
  // ==========================================================================
  app.get(
    '/api/orders',
    asyncHandler(async (req, res) => {
      const { username } = req.query;
      const orders = username
        ? await db.all('SELECT * FROM Orders WHERE username = ? ORDER BY id DESC', [username])
        : await db.all('SELECT * FROM Orders ORDER BY id DESC');

      for (const order of orders) {
        order.items = await db.all('SELECT * FROM OrderItems WHERE orderId = ?', [order.id]);
      }

      res.json({ success: true, count: orders.length, data: orders });
    })
  );

  app.use((req, res) => res.status(404).json({ success: false, error: 'ไม่พบ endpoint นี้' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์', detail: err.message });
  });

  app.listen(PORT, () => {
    console.log(`🎸 Guitar Store LOCAL API (SQLite) running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start local server:', err);
  process.exit(1);
});
