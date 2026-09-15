const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'inventory-local.db');
const db = new sqlite3.Database(dbPath);

const updates = [
  {
    name: 'YAMAHA F310 Acoustic Guitar',
    image: 'https://images.unsplash.com/photo-1541689592655-f5f52825a3b8?w=400',
  },
  {
    name: 'Ibanez RG421EX Electric Guitar',
    image: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=400',
  },
  {
    name: 'Martin D-28 Standard Acoustic Guitar',
    image: 'https://images.unsplash.com/photo-1567771736315-133752f63a69?w=400',
  },
];

db.serialize(() => {
  updates.forEach((u) => {
    db.run('UPDATE Inventory SET image = ? WHERE name = ?', [u.image, u.name], function (err) {
      if (err) {
        console.error(`[ERROR] ${u.name}:`, err.message);
      } else if (this.changes === 0) {
        console.warn(`[WARN] ${u.name}: ไม่พบสินค้าชื่อนี้ในฐานข้อมูล (ไม่มีการแก้ไข)`);
      } else {
        console.log(`[OK] ${u.name} -> อัปเดตรูปแล้ว`);
      }
    });
  });
});

db.close((err) => {
  if (err) {
    console.error('ปิดฐานข้อมูลไม่สำเร็จ:', err.message);
  } else {
    console.log('\nเสร็จแล้ว! ถ้า backend (server-local.js) กำลังรันอยู่ ให้ปิดแล้วเปิดใหม่');
    console.log('จากนั้นรีเฟรชหน้าเว็บ จะเห็นรูปใหม่ครับ');
  }
});
