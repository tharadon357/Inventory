/**
 * One-off fix: the seed data's Martin D-28 image URL was a dead Unsplash link
 * (404). This updates just that row in the local SQLite database while the
 * server may already be running (safe — SQLite handles concurrent access).
 */
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

(async () => {
  const db = await open({
    filename: path.join(__dirname, 'inventory-local.db'),
    driver: sqlite3.Database,
  });

  await db.run(
    "UPDATE Inventory SET image = ? WHERE name LIKE 'Martin%'",
    ['https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=400']
  );

  const row = await db.get("SELECT id, name, image FROM Inventory WHERE name LIKE 'Martin%'");
  console.log('Updated row:', row);

  await db.close();
  console.log('Done. You can close this window.');
})().catch((err) => {
  console.error('Failed:', err);
});
