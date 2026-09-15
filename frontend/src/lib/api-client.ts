/**
 * ที่อยู่ backend (Express) — ตั้งค่าผ่าน EXPO_PUBLIC_API_URL ใน .env ได้
 * ถ้าไม่ตั้งค่า จะใช้ public URL ของเซิร์ฟเวอร์ตามที่ระบุในโจทย์
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://119.59.102.161:3083';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Wrapper รอบ fetch() ที่ตั้งค่า JSON header ให้อัตโนมัติ
 * และแปลง error response ของ backend ให้เป็น ApiError ที่อ่านง่าย
 */
export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต/URL ของ API', 0);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = (data && (data.error || data.message)) || `คำขอล้มเหลว (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export interface InventoryItem {
  id: number;
  name: string;
  stock: number;
  category: string | null;
  location: string | null;
  image: string | null;
  status: string | null;
  brand: string | null;
  sizes: string | null;
  productCode: string | null;
  orderName: string | null;
  storeAvailability: string | null;
  lastUpdate: string | null;
}

export interface InventoryListResponse {
  data: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export function fetchInventory(params: { q?: string; category?: string; status?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.status) search.set('status', params.status);
  if (params.page) search.set('page', String(params.page));
  const qs = search.toString();
  return apiFetch<InventoryListResponse>(`/api/inventory${qs ? `?${qs}` : ''}`);
}

export function fetchInventoryFilters() {
  return apiFetch<{ categories: string[]; brands: string[]; statuses: string[] }>(
    '/api/inventory/meta/filters'
  );
}

export function createInventoryItem(payload: Partial<InventoryItem>) {
  return apiFetch<InventoryItem>('/api/inventory', { method: 'POST', body: payload });
}

export function updateInventoryItem(id: number, payload: Partial<InventoryItem>) {
  return apiFetch<InventoryItem>(`/api/inventory/${id}`, { method: 'PUT', body: payload });
}

export function deleteInventoryItem(id: number) {
  return apiFetch<{ success: boolean }>(`/api/inventory/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// ML clustering
// ---------------------------------------------------------------------------
export interface ClusterResult {
  label: string;
  itemCount: number;
  avgScore: number;
  suggestedPriceRange: { min: number; max: number; currency: string };
  items: Array<{
    id: number;
    name: string;
    brand: string | null;
    category: string | null;
    stock: number;
    status: string | null;
  }>;
}

export function fetchClustering(k = 3) {
  return apiFetch<{ k: number; generatedAt: string; clusters: ClusterResult[] }>(
    `/api/ml/clustering?k=${k}`
  );
}
