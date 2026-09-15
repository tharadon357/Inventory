-- =====================================================================
-- Guitar Store — Inventory table + starter data
-- Database : ip_std6730251115  (phpMyAdmin / MySQL)
-- Table    : Inventory
--
-- วิธีใช้:
--   1. เปิด phpMyAdmin -> เลือกฐานข้อมูล ip_std6730251115 -> แท็บ SQL
--   2. วางไฟล์นี้ทั้งหมดแล้วกด "Go"
--
-- ปลอดภัยต่อการรันซ้ำ:
--   - CREATE TABLE ใช้ IF NOT EXISTS จึงไม่ทับตาราง Inventory ที่มีอยู่แล้ว
--   - INSERT แต่ละแถวเช็คก่อนว่ามีชื่อสินค้านี้อยู่แล้วหรือยัง (กันข้อมูลซ้ำ)
-- =====================================================================

CREATE TABLE IF NOT EXISTS Inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stock INT DEFAULT 0,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    category VARCHAR(100) DEFAULT 'Guitar',
    location VARCHAR(100) DEFAULT 'Warehouse',
    image TEXT NULL,
    status VARCHAR(50) DEFAULT 'Active',
    brand VARCHAR(100) NULL,
    sizes VARCHAR(100) NULL,
    productCode VARCHAR(100) NULL,
    orderName VARCHAR(100) NULL,
    storeAvailability TEXT NULL,
    lastUpdate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Starter data — 6 guitars (กันซ้ำด้วย WHERE NOT EXISTS ต่อชื่อสินค้า)
-- ---------------------------------------------------------------------
INSERT INTO Inventory (name, stock, price, category, brand, image, status)
SELECT * FROM (SELECT
    'Fender Player Stratocaster Electric Guitar' AS name, 4 AS stock, 24500.00 AS price,
    'Electric' AS category, 'Fender' AS brand,
    'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?w=400' AS image, 'Active' AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM Inventory WHERE name = 'Fender Player Stratocaster Electric Guitar') LIMIT 1;

INSERT INTO Inventory (name, stock, price, category, brand, image, status)
SELECT * FROM (SELECT
    'Gibson Les Paul Standard 60s' AS name, 2 AS stock, 89000.00 AS price,
    'Electric' AS category, 'Gibson' AS brand,
    'https://images.unsplash.com/photo-1550985616-10810253b84d?w=400' AS image, 'Active' AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM Inventory WHERE name = 'Gibson Les Paul Standard 60s') LIMIT 1;

INSERT INTO Inventory (name, stock, price, category, brand, image, status)
SELECT * FROM (SELECT
    'Taylor 214ce Acoustic-Electric Guitar' AS name, 5 AS stock, 39900.00 AS price,
    'Acoustic' AS category, 'Taylor' AS brand,
    'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400' AS image, 'Active' AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM Inventory WHERE name = 'Taylor 214ce Acoustic-Electric Guitar') LIMIT 1;

INSERT INTO Inventory (name, stock, price, category, brand, image, status)
SELECT * FROM (SELECT
    'Ibanez RG421EX Electric Guitar' AS name, 8 AS stock, 13500.00 AS price,
    'Electric' AS category, 'Ibanez' AS brand,
    'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=400' AS image, 'Active' AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM Inventory WHERE name = 'Ibanez RG421EX Electric Guitar') LIMIT 1;

INSERT INTO Inventory (name, stock, price, category, brand, image, status)
SELECT * FROM (SELECT
    'Martin D-28 Standard Acoustic Guitar' AS name, 3 AS stock, 11500.00 AS price,
    'Acoustic' AS category, 'Martin' AS brand,
    'https://images.unsplash.com/photo-1556449895-a33c9d1a2c0f?w=400' AS image, 'Active' AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM Inventory WHERE name = 'Martin D-28 Standard Acoustic Guitar') LIMIT 1;

INSERT INTO Inventory (name, stock, price, category, brand, image, status)
SELECT * FROM (SELECT
    'YAMAHA F310 Acoustic Guitar' AS name, 12 AS stock, 4500.00 AS price,
    'Acoustic' AS category, 'Yamaha' AS brand,
    'https://images.unsplash.com/photo-1541689592655-f5f52825a3b8?w=400' AS image, 'Active' AS status
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM Inventory WHERE name = 'YAMAHA F310 Acoustic Guitar') LIMIT 1;

-- หมายเหตุ: ตาราง Inventory ในฐานข้อมูลจริงของโปรเจกต์นี้มีคอลัมน์เพิ่มเติมอยู่แล้ว
-- (location, sizes, productCode, orderName, storeAvailability) ซึ่งไม่ถูกแตะต้องโดยสคริปต์นี้
-- คอลัมน์ price ก็มีอยู่แล้วจาก schema_v2_storefront.sql — INSERT ด้านบนจึงรันได้ปลอดภัย
