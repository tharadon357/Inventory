/**
 * utils/cluster.js
 * ==========================================================================
 * Heuristic K-Means clustering + price-range suggestion สำหรับสินค้าในตาราง
 * Inventory โดยใช้ stock / category / brand ตามที่ระบุในโจทย์
 *
 * เนื่องจากตาราง Inventory ไม่มีคอลัมน์ราคา/ยอดขาย จึงไม่มี "ราคาจริง" ให้เทรน
 * โมเดล — ฟังก์ชันนี้จึงคำนวณ "คะแนนเชิงฮิวริสติก" (deterministic, ไม่สุ่ม) จาก
 * ชื่อ category และ brand เพื่อประมาณระดับสินค้า (economy/standard/premium)
 * แล้วใช้ผลของ K-Means (จัดกลุ่มจาก stock + คะแนนดังกล่าว) มาแนะนำช่วงราคาต่อกลุ่ม
 * ผลลัพธ์นี้เป็น "คำแนะนำเบื้องต้น" ให้ผู้ดูแลระบบพิจารณา ไม่ใช่ราคาขายที่ยืนยันแล้ว
 * ==========================================================================
 */

// คำในชื่อ category / brand ที่มักสื่อถึงสินค้าระดับพรีเมียม / ประหยัด
// (แก้ไข/เพิ่มเติมคำเหล่านี้ได้ตามหมวดสินค้าจริงของธุรกิจ)
const PREMIUM_HINTS = [
  'premium', 'luxury', 'pro', 'professional', 'limited', 'signature',
  'พรีเมียม', 'หรู', 'โปร',
];
const BUDGET_HINTS = [
  'basic', 'economy', 'budget', 'lite', 'mini', 'standard',
  'ประหยัด', 'ธรรมดา', 'พื้นฐาน',
];

// ราคาฐานเริ่มต้นต่อ 1 ชิ้น (บาท) ใช้เมื่อไม่สามารถระบุระดับสินค้าได้จากชื่อ/หมวดหมู่
const DEFAULT_BASE_PRICE = 500;

/** แปลง string ใด ๆ ให้เป็นตัวเลข 0..1 แบบ deterministic (ไม่ใช้ Math.random) */
function hashToUnitInterval(str) {
  if (!str) return 0.5;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return (Math.abs(hash) % 1000) / 1000; // 0..0.999
}

/** ให้คะแนนระดับสินค้า 0 (ประหยัด) .. 1 (พรีเมียม) จากข้อความ (category หรือ brand) */
function tierScoreFromText(text) {
  if (!text) return 0.5;
  const lower = String(text).toLowerCase();
  if (PREMIUM_HINTS.some((h) => lower.includes(h))) return 0.85;
  if (BUDGET_HINTS.some((h) => lower.includes(h))) return 0.2;
  // ไม่มีคำใบ้ชัดเจน -> ใช้ hash แบบ deterministic เพื่อกระจายคะแนนอย่างสม่ำเสมอ
  return 0.35 + hashToUnitInterval(lower) * 0.4; // อยู่ในช่วง 0.35..0.75
}

/** คำนวณ feature vector [stockScore, categoryScore, brandScore] ต่อสินค้าหนึ่งชิ้น */
function buildFeatures(items) {
  const stocks = items.map((p) => Number(p.stock) || 0);
  const minStock = Math.min(...stocks);
  const maxStock = Math.max(...stocks);
  const stockRange = maxStock - minStock || 1;

  return items.map((p) => {
    const stock = Number(p.stock) || 0;
    // stock น้อย = หายาก/มีมูลค่าสูงกว่า -> กลับด้าน (1 - normalized)
    const normalizedStock = (stock - minStock) / stockRange;
    const scarcityScore = 1 - normalizedStock;
    const categoryScore = tierScoreFromText(p.category);
    const brandScore = tierScoreFromText(p.brand);
    return [scarcityScore, categoryScore, brandScore];
  });
}

function euclideanDistance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

/**
 * K-Means (Lloyd's algorithm) แบบ deterministic:
 * เลือก centroid เริ่มต้นจากจุดที่กระจายตัวตาม "composite score" ที่เรียงแล้ว
 * เพื่อให้ผลลัพธ์เดิมทุกครั้งที่รันด้วยข้อมูลเดียวกัน (ไม่ต้องพึ่ง random seed)
 */
function kmeans(features, k, maxIterations = 25) {
  const n = features.length;
  k = Math.min(k, n);

  const compositeIndex = features
    .map((f, i) => ({ i, score: (f[0] + f[1] + f[2]) / 3 }))
    .sort((a, b) => a.score - b.score);

  let centroids = [];
  for (let c = 0; c < k; c++) {
    const pos = Math.floor((c * (n - 1)) / Math.max(k - 1, 1));
    centroids.push([...features[compositeIndex[pos].i]]);
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(features[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) changed = true;
      assignments[i] = bestCluster;
    }

    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      sums[c][0] += features[i][0];
      sums[c][1] += features[i][1];
      sums[c][2] += features[i][2];
    }
    centroids = centroids.map((old, c) =>
      counts[c] > 0 ? sums[c].map((s) => s / counts[c]) : old
    );

    if (!changed) break;
  }

  return { assignments, centroids };
}

/** แนะนำช่วงราคาจากคะแนนเฉลี่ยของกลุ่ม (composite score 0..1) */
function suggestPriceRange(avgScore) {
  const base = DEFAULT_BASE_PRICE * (0.5 + avgScore * 1.5); // ~250 - 1250 บาท
  const low = Math.round((base * 0.85) / 10) * 10;
  const high = Math.round((base * 1.25) / 10) * 10;
  return { min: low, max: high, currency: 'THB' };
}

function tierLabel(rank, total) {
  if (total <= 1) return 'กลุ่มมาตรฐาน (Standard)';
  const ratio = rank / (total - 1);
  if (ratio < 0.34) return 'กลุ่มประหยัด (Economy)';
  if (ratio < 0.67) return 'กลุ่มมาตรฐาน (Standard)';
  return 'กลุ่มพรีเมียม (Premium)';
}

/**
 * @param {Array} items แถวจากตาราง Inventory (ต้องมี id, name, brand, category, stock)
 * @param {number} k จำนวนกลุ่มที่ต้องการ (default 3)
 * @returns {Array} รายการกลุ่ม พร้อมสมาชิกและช่วงราคาที่แนะนำ
 */
function clusterInventory(items, k = 3) {
  const features = buildFeatures(items);
  const { assignments } = kmeans(features, k);

  const groups = new Map();
  items.forEach((item, i) => {
    const c = assignments[i];
    if (!groups.has(c)) groups.set(c, { members: [], scores: [] });
    const g = groups.get(c);
    g.members.push(item);
    g.scores.push((features[i][0] + features[i][1] + features[i][2]) / 3);
  });

  const clustersRaw = Array.from(groups.entries()).map(([clusterIndex, g]) => {
    const avgScore = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
    return { clusterIndex, avgScore, members: g.members };
  });

  // เรียงกลุ่มจากคะแนนเฉลี่ยน้อย (ประหยัด) ไปมาก (พรีเมียม) เพื่อตั้งชื่อ tier ให้สมเหตุสมผล
  clustersRaw.sort((a, b) => a.avgScore - b.avgScore);

  return clustersRaw.map((cluster, rank) => ({
    label: tierLabel(rank, clustersRaw.length),
    itemCount: cluster.members.length,
    suggestedPriceRange: suggestPriceRange(cluster.avgScore),
    avgScore: Number(cluster.avgScore.toFixed(3)),
    items: cluster.members.map((m) => ({
      id: m.id,
      name: m.name,
      brand: m.brand,
      category: m.category,
      stock: m.stock,
      status: m.status,
    })),
  }));
}

module.exports = { clusterInventory, tierScoreFromText, kmeans };
