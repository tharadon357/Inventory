-- =====================================================================
-- Guitar Store — Users / Orders / OrderItems migration
-- Database : ip_std6730251115  (phpMyAdmin / MySQL)
--
-- วิธีใช้:
--   1. เปิด phpMyAdmin -> เลือกฐานข้อมูล ip_std6730251115 -> แท็บ SQL
--   2. วางไฟล์นี้ทั้งหมดแล้วกด "Go"
--   ต้องรันไฟล์นี้ 1 ครั้งก่อน server.js เวอร์ชันใหม่จะใช้ฟีเจอร์
--   สมัครสมาชิก/ตะกร้า/สั่งซื้อได้ (มิฉะนั้นจะขึ้น error "table doesn't exist")
--
-- ปลอดภัยต่อการรันซ้ำ: ใช้ CREATE TABLE IF NOT EXISTS ทั้งหมด
-- =====================================================================

CREATE TABLE IF NOT EXISTS Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    passwordHash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    totalAmount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'สำเร็จ',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- หมายเหตุ: ไม่ใส่ FOREIGN KEY เพราะบัญชีนักศึกษาบนโฮสต์นี้ไม่มีสิทธิ์ REFERENCES
-- (รันแล้วจะขึ้น "#1142 - REFERENCES command denied") ไม่มี FK ก็ใช้งานได้ปกติ
CREATE TABLE IF NOT EXISTS OrderItems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orderId INT NOT NULL,
    productId INT NULL,
    productName VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    quantity INT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
