import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

// ============================================================================
// Guitar Store — tharadon — Port 3083
// Warm Brown / Vintage Wooden Tone theme, client-side K-Means price tiers,
// simple admin login, search & category filter, full CRUD against the
// Express backend (GET /nindam_pro_api, POST/PUT/DELETE /api/products).
// ============================================================================

// ---------------------------------------------------------------------------
// API config
// ---------------------------------------------------------------------------
// หมายเหตุ: public URL (119.59.102.161:3083) เข้าไม่ถึงจากเครือข่ายนี้ (connect ETIMEDOUT
// ทั้งพอร์ตแอปและพอร์ต DB) จึงใช้เซิร์ฟเวอร์ในเครื่อง server-local.js (SQLite, พอร์ต 3081)
// เป็นค่าเริ่มต้นแทน — รันด้วยการดับเบิลคลิก start-local-server.bat
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3081').replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'guitar-store:auth-user';

interface Product {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  stock: number;
  image: string | null;
  status: string | null;
}

interface AuthUser {
  username: string;
  role: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface OrderResult {
  id: number;
  totalAmount: number;
  items: CartItem[];
}

async function apiRequest<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {}
): Promise<T> {
  const { body, headers, ...rest } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต/URL ของ API');
  }
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const message = (data && data.error) || `คำขอล้มเหลว (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Theme — Warm Brown / Vintage Wooden Tone
// ---------------------------------------------------------------------------
const COLORS = {
  primary: '#6F4E37',
  primaryDeep: '#8B5A2B',
  accent: '#D97706',
  accentDeep: '#B45309',
  background: '#FDFBF7',
  backgroundAlt: '#F5F0EB',
  surface: '#FFFFFF',
  text: '#2D241E',
  textMuted: '#8A7A6C',
  border: '#E9DFD1',
  danger: '#B3261E',
};

const TIER_STYLES: Array<{ label: string; bg: string; fg: string }> = [
  { label: 'Low Tier (คุ้มค่า)', bg: '#EAF1E3', fg: '#3F6B2E' },
  { label: 'Mid Tier (มาตรฐาน)', bg: '#FBEEDA', fg: '#B45309' },
  { label: 'High Tier (พรีเมียม)', bg: '#F4E1DA', fg: '#8A2E12' },
];

const CATEGORIES = ['All', 'Acoustic', 'Electric'];

// ---------------------------------------------------------------------------
// AI/ML — client-side K-Means clustering on price, grouped into 3 tiers
// ---------------------------------------------------------------------------
function kMeans1D(values: number[], k: number, maxIterations = 50) {
  const n = values.length;
  const kEff = Math.max(1, Math.min(k, n));
  const sorted = [...values].sort((a, b) => a - b);

  // Deterministic centroid seeding — evenly spaced across the sorted values,
  // so the same price list always produces the same clusters.
  let centroids = Array.from({ length: kEff }, (_, i) =>
    sorted[Math.floor((i * (n - 1)) / Math.max(kEff - 1, 1))]
  );
  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < kEff; c++) {
        const dist = Math.abs(values[i] - centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
    }

    const sums = new Array(kEff).fill(0);
    const counts = new Array(kEff).fill(0);
    for (let i = 0; i < n; i++) {
      sums[assignments[i]] += values[i];
      counts[assignments[i]]++;
    }
    centroids = centroids.map((old, c) => (counts[c] > 0 ? sums[c] / counts[c] : old));

    if (!changed) break;
  }

  return { assignments, centroids, k: kEff };
}

/** Maps each product id -> its price-tier label + tier style, using K-Means over price. */
function computePriceTiers(products: Product[]): Map<number, { label: string; bg: string; fg: string }> {
  const map = new Map<number, { label: string; bg: string; fg: string }>();
  if (products.length === 0) return map;

  const prices = products.map((p) => Number(p.price) || 0);
  const distinctCount = new Set(prices).size;
  const { assignments, centroids, k } = kMeans1D(prices, Math.min(3, distinctCount));

  // Rank clusters by centroid ascending so tier labels are assigned low -> high.
  const rankByCluster = new Map<number, number>();
  centroids
    .map((centroid, clusterIndex) => ({ clusterIndex, centroid }))
    .sort((a, b) => a.centroid - b.centroid)
    .forEach(({ clusterIndex }, rank) => rankByCluster.set(clusterIndex, rank));

  // If we ended up with fewer than 3 clusters (e.g. all prices identical, or
  // only 1-2 distinct prices), spread the available ranks across Low/Mid/High
  // so a single-item store still gets a sensible label instead of crashing.
  const styleForRank = (rank: number) => {
    if (k >= 3) return TIER_STYLES[rank] ?? TIER_STYLES[1];
    if (k === 2) return rank === 0 ? TIER_STYLES[0] : TIER_STYLES[2];
    return TIER_STYLES[1];
  };

  products.forEach((product, i) => {
    const cluster = assignments[i];
    const rank = rankByCluster.get(cluster) ?? 1;
    map.set(product.id, styleForRank(rank));
  });

  return map;
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------
interface ProductFormState {
  name: string;
  brand: string;
  category: string;
  price: string;
  stock: string;
  image: string;
  status: string;
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  brand: '',
  category: 'Electric',
  price: '',
  stock: '0',
  image: '',
  status: 'Active',
};

function productToForm(product: Product | null): ProductFormState {
  if (!product) return EMPTY_FORM;
  return {
    name: product.name ?? '',
    brand: product.brand ?? '',
    category: product.category ?? 'Electric',
    price: String(product.price ?? ''),
    stock: String(product.stock ?? 0),
    image: product.image ?? '',
    status: product.status ?? 'Active',
  };
}

function formatBaht(amount: number) {
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Product image with graceful fallback — some hotlinked image URLs
// occasionally fail to load (slow/blocked network); show the 🎸 placeholder
// instead of a blank/broken box so the card never looks "missing".
// ---------------------------------------------------------------------------
function ProductImage({ uri, style }: { uri: string | null; style: any }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[style, styles.cardImagePlaceholder]}>
        <Text style={styles.cardImagePlaceholderIcon}>🎸</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// ============================================================================
// Screen
// ============================================================================
export default function GuitarStoreScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [registerVisible, setRegisterVisible] = useState(false);
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  // -- Cart / checkout (customer storefront) ---------------------------------
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<OrderResult | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formValues, setFormValues] = useState<ProductFormState>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // -- Load products ---------------------------------------------------------
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiRequest<{ success: boolean; data: Product[] }>('/nindam_pro_api');
      setProducts(res.data ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((raw) => {
        if (raw) setAuthUser(JSON.parse(raw));
      })
      .catch(() => {});
  }, [loadProducts]);

  // -- Derived data -----------------------------------------------------------
  const isAdmin = authUser?.role === 'admin';

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.product.price) || 0) * item.quantity, 0),
    [cart]
  );

  const priceTiers = useMemo(() => computePriceTiers(products), [products]);

  const filteredProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return products.filter((p) => {
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query) ||
        (p.brand ?? '').toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [products, searchText, categoryFilter]);

  // -- Auth ---------------------------------------------------------------
  async function handleLoginSubmit() {
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      const res = await apiRequest<{ success: boolean; user: AuthUser }>('/api/login', {
        method: 'POST',
        body: loginForm,
      });
      setAuthUser(res.user);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      setLoginVisible(false);
      setLoginForm({ username: '', password: '' });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleLogout() {
    setAuthUser(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function openRegisterModal() {
    setLoginVisible(false);
    setLoginError(null);
    setRegisterForm({ username: '', password: '', confirmPassword: '' });
    setRegisterError(null);
    setRegisterVisible(true);
  }

  async function handleRegisterSubmit() {
    const username = registerForm.username.trim();
    const { password, confirmPassword } = registerForm;

    if (!username || !password) {
      setRegisterError('กรุณากรอก username และ password');
      return;
    }
    if (password.length < 4) {
      setRegisterError('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setRegisterError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setRegisterSubmitting(true);
    setRegisterError(null);
    try {
      const res = await apiRequest<{ success: boolean; user: AuthUser }>('/api/register', {
        method: 'POST',
        body: { username, password },
      });
      setAuthUser(res.user);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      setRegisterVisible(false);
      setRegisterForm({ username: '', password: '', confirmPassword: '' });
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'สมัครสมาชิกไม่สำเร็จ');
    } finally {
      setRegisterSubmitting(false);
    }
  }

  // -- Product CRUD ---------------------------------------------------------
  function openAddModal() {
    setEditingProduct(null);
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setFormVisible(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setFormValues(productToForm(product));
    setFormError(null);
    setFormVisible(true);
  }

  async function handleFormSubmit() {
    if (!formValues.name.trim()) {
      setFormError('กรุณากรอกชื่อกีตาร์');
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    const payload = {
      name: formValues.name.trim(),
      brand: formValues.brand.trim(),
      category: formValues.category,
      price: Number(formValues.price) || 0,
      stock: Number(formValues.stock) || 0,
      image: formValues.image.trim(),
      status: formValues.status,
    };
    try {
      if (editingProduct) {
        await apiRequest(`/api/products/${editingProduct.id}`, { method: 'PUT', body: payload });
      } else {
        await apiRequest('/api/products', { method: 'POST', body: payload });
      }
      setFormVisible(false);
      await loadProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await apiRequest(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadProducts();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'ลบสินค้าไม่สำเร็จ');
      setDeleteTarget(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // -- Cart / checkout (customer storefront) ---------------------------------
  function addToCart(product: Product, quantity: number = 1) {
    const maxQty = product.stock ?? 0;
    if (maxQty <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + quantity, maxQty) }
            : item
        );
      }
      return [...prev, { product, quantity: Math.min(Math.max(quantity, 1), maxQty) }];
    });
  }

  function updateCartQuantity(productId: number, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((item) => item.product.id !== productId);
      return prev.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(quantity, item.product.stock ?? quantity) }
          : item
      );
    });
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    if (!authUser) {
      setCartVisible(false);
      setLoginError('กรุณาเข้าสู่ระบบก่อนสั่งซื้อ');
      setLoginVisible(true);
      return;
    }
    setCheckoutSubmitting(true);
    setCheckoutError(null);
    try {
      const payload = {
        username: authUser.username,
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      };
      const res = await apiRequest<{ success: boolean; order: { id: number; totalAmount: number } }>(
        '/api/orders',
        { method: 'POST', body: payload }
      );
      setOrderSuccess({ id: res.order.id, totalAmount: res.order.totalAmount, items: cart });
      setCart([]);
      setCartVisible(false);
      await loadProducts();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'สั่งซื้อไม่สำเร็จ');
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  // -- Render ---------------------------------------------------------------
  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              🎸 Tharadon Guitar Store
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
              ร้านขายกีตาร์ • Warm Wooden Collection
            </Text>
          </View>

          <View style={styles.headerRightRow}>
            {!isAdmin ? (
              <TouchableOpacity style={styles.cartButton} onPress={() => setCartVisible(true)}>
                <Text style={styles.cartButtonIcon}>🛒</Text>
                {cartCount > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cartCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}

            {authUser ? (
              <View style={styles.headerAuthRow}>
                <Text style={styles.headerUser}>👤 {authUser.username}</Text>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                  <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.adminEntranceLink} onPress={() => router.push('/admin')}>
                  <Text style={styles.adminEntranceLinkText}>🔐 หลังบ้าน</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.loginButton} onPress={() => setLoginVisible(true)}>
                  <Text style={styles.loginButtonText}>Login</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Search & filter */}
          <View style={styles.toolbar}>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search guitars by name or brand..."
                placeholderTextColor={COLORS.textMuted}
                value={searchText}
                onChangeText={setSearchText}
              />
            </View>

            {isAdmin ? (
              <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
                <Text style={styles.addButtonText}>+ Add Guitar</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => {
              const active = categoryFilter === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setCategoryFilter(cat)}>
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Product grid */}
          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.mutedText}>กำลังโหลดสินค้า...</Text>
            </View>
          ) : loadError ? (
            <View style={styles.centerBlock}>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadProducts}>
                <Text style={styles.retryButtonText}>ลองใหม่</Text>
              </TouchableOpacity>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.centerBlock}>
              <Text style={styles.mutedText}>ไม่พบกีตาร์ที่ตรงกับเงื่อนไข</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredProducts.map((product) => {
                const tier = priceTiers.get(product.id);
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() => {
                      setViewingProduct(product);
                      setDetailQuantity(1);
                    }}>
                    <View style={styles.cardImageWrap}>
                      <ProductImage uri={product.image} style={styles.cardImage} />
                      {tier ? (
                        <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
                          <Text style={[styles.tierBadgeText, { color: tier.fg }]}>{tier.label}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.cardBody}>
                      <Text style={styles.cardBrand}>{product.brand || 'Guitar'}</Text>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <Text style={styles.cardPrice}>{formatBaht(Number(product.price) || 0)}</Text>

                      <View style={styles.cardMetaRow}>
                        <View
                          style={[
                            styles.stockPill,
                            (product.stock ?? 0) === 0 && styles.stockPillEmpty,
                          ]}>
                          <Text
                            style={[
                              styles.stockPillText,
                              (product.stock ?? 0) === 0 && styles.stockPillTextEmpty,
                            ]}>
                            {(product.stock ?? 0) > 0 ? `Stock: ${product.stock}` : 'Out of stock'}
                          </Text>
                        </View>
                        <Text style={styles.categoryLabel}>{product.category || '—'}</Text>
                      </View>

                      {isAdmin ? (
                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => openEditModal(product)}>
                            <Text style={styles.editButtonText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => setDeleteTarget(product)}>
                            <Text style={styles.deleteButtonText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.addToCartButton,
                            (product.stock ?? 0) === 0 && styles.addToCartButtonDisabled,
                          ]}
                          disabled={(product.stock ?? 0) === 0}
                          onPress={() => addToCart(product, 1)}>
                          <Text style={styles.addToCartButtonText}>
                            {(product.stock ?? 0) === 0 ? 'สินค้าหมด' : '🛒 เพิ่มลงตะกร้า'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* -------------------------------------------------------------- */}
      {/* Login modal                                                     */}
      {/* -------------------------------------------------------------- */}
      <Modal visible={loginVisible} animationType="fade" transparent onRequestClose={() => setLoginVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.loginSheet}>
            <Text style={styles.modalTitle}>เข้าสู่ระบบ</Text>
            <Text style={styles.modalSubtitle}>Login to your account</Text>

            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="admin"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              value={loginForm.username}
              onChangeText={(t) => setLoginForm((prev) => ({ ...prev, username: t }))}
            />

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              secureTextEntry
              value={loginForm.password}
              onChangeText={(t) => setLoginForm((prev) => ({ ...prev, password: t }))}
            />

            {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setLoginVisible(false);
                  setLoginError(null);
                }}>
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, loginSubmitting && styles.buttonDisabled]}
                onPress={handleLoginSubmit}
                disabled={loginSubmitting}>
                {loginSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.linkRow} onPress={openRegisterModal}>
              <Text style={styles.linkText}>
                ยังไม่มีบัญชี? <Text style={styles.linkTextAccent}>สมัครสมาชิก</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------------- */}
      {/* Register modal                                                   */}
      {/* -------------------------------------------------------------- */}
      <Modal
        visible={registerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setRegisterVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.loginSheet}>
            <Text style={styles.modalTitle}>สมัครสมาชิก</Text>
            <Text style={styles.modalSubtitle}>สร้างบัญชีใหม่เพื่อใช้งานร้านค้า</Text>

            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="เช่น guitarfan99"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              value={registerForm.username}
              onChangeText={(t) => setRegisterForm((prev) => ({ ...prev, username: t }))}
            />

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="อย่างน้อย 4 ตัวอักษร"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              secureTextEntry
              value={registerForm.password}
              onChangeText={(t) => setRegisterForm((prev) => ({ ...prev, password: t }))}
            />

            <Text style={styles.fieldLabel}>Confirm Password</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="พิมพ์รหัสผ่านอีกครั้ง"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              secureTextEntry
              value={registerForm.confirmPassword}
              onChangeText={(t) => setRegisterForm((prev) => ({ ...prev, confirmPassword: t }))}
            />

            {registerError ? <Text style={styles.errorText}>{registerError}</Text> : null}

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setRegisterVisible(false);
                  setRegisterError(null);
                }}>
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, registerSubmitting && styles.buttonDisabled]}
                onPress={handleRegisterSubmit}
                disabled={registerSubmitting}>
                {registerSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>สมัครสมาชิก</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => {
                setRegisterVisible(false);
                setRegisterError(null);
                setLoginVisible(true);
              }}>
              <Text style={styles.linkText}>
                มีบัญชีอยู่แล้ว? <Text style={styles.linkTextAccent}>เข้าสู่ระบบ</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------------- */}
      {/* Product detail modal                                            */}
      {/* -------------------------------------------------------------- */}
      <Modal
        visible={!!viewingProduct}
        animationType="fade"
        transparent
        onRequestClose={() => setViewingProduct(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailSheet}>
            {viewingProduct ? (
              <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
                <ProductImage uri={viewingProduct.image} style={styles.detailImage} />

                <Text style={styles.cardBrand}>{viewingProduct.brand || 'Guitar'}</Text>
                <Text style={styles.detailName}>{viewingProduct.name}</Text>
                <Text style={styles.detailPrice}>{formatBaht(Number(viewingProduct.price) || 0)}</Text>

                <View style={styles.cardMetaRow}>
                  <View
                    style={[
                      styles.stockPill,
                      (viewingProduct.stock ?? 0) === 0 && styles.stockPillEmpty,
                    ]}>
                    <Text
                      style={[
                        styles.stockPillText,
                        (viewingProduct.stock ?? 0) === 0 && styles.stockPillTextEmpty,
                      ]}>
                      {(viewingProduct.stock ?? 0) > 0 ? `Stock: ${viewingProduct.stock}` : 'Out of stock'}
                    </Text>
                  </View>
                  <Text style={styles.categoryLabel}>{viewingProduct.category || '—'}</Text>
                </View>

                <View style={styles.detailInfoBlock}>
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>สถานะ</Text>
                    <Text style={styles.detailInfoValue}>{viewingProduct.status || '—'}</Text>
                  </View>
                </View>

                {isAdmin ? (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => {
                        const p = viewingProduct;
                        setViewingProduct(null);
                        openEditModal(p);
                      }}>
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => {
                        const p = viewingProduct;
                        setViewingProduct(null);
                        setDeleteTarget(p);
                      }}>
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.detailPurchaseBlock}>
                    <View style={styles.detailQtyRow}>
                      <Text style={styles.fieldLabel}>จำนวน</Text>
                      <View style={styles.qtyStepperRow}>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => setDetailQuantity((q) => Math.max(1, q - 1))}>
                          <Text style={styles.qtyButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyValue}>{detailQuantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() =>
                            setDetailQuantity((q) => Math.min(viewingProduct.stock ?? q, q + 1))
                          }>
                          <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.detailAddToCartButton,
                        (viewingProduct.stock ?? 0) === 0 && styles.addToCartButtonDisabled,
                      ]}
                      disabled={(viewingProduct.stock ?? 0) === 0}
                      onPress={() => {
                        addToCart(viewingProduct, detailQuantity);
                        setViewingProduct(null);
                        setCartVisible(true);
                      }}>
                      <Text style={styles.detailAddToCartButtonText}>
                        {(viewingProduct.stock ?? 0) === 0 ? 'สินค้าหมด' : '🛒 เพิ่มลงตะกร้า'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            ) : null}

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setViewingProduct(null)}>
                <Text style={styles.cancelButtonText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------------- */}
      {/* Add / Edit product modal                                        */}
      {/* -------------------------------------------------------------- */}
      <Modal visible={formVisible} animationType="slide" transparent onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.formSheet}>
            <Text style={styles.modalTitle}>
              {editingProduct ? 'แก้ไขกีตาร์' : 'เพิ่มกีตาร์ใหม่'}
            </Text>

            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="เช่น Fender Player Stratocaster"
                placeholderTextColor={COLORS.textMuted}
                value={formValues.name}
                onChangeText={(t) => setFormValues((prev) => ({ ...prev, name: t }))}
              />

              <Text style={styles.fieldLabel}>Brand</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="เช่น Fender"
                placeholderTextColor={COLORS.textMuted}
                value={formValues.brand}
                onChangeText={(t) => setFormValues((prev) => ({ ...prev, brand: t }))}
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.categoryPickerRow}>
                {['Acoustic', 'Electric'].map((cat) => {
                  const active = formValues.category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryOption, active && styles.categoryOptionActive]}
                      onPress={() => setFormValues((prev) => ({ ...prev, category: cat }))}>
                      <Text
                        style={[
                          styles.categoryOptionText,
                          active && styles.categoryOptionTextActive,
                        ]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.fieldRowSplit}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Price (฿) *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={formValues.price}
                    onChangeText={(t) => setFormValues((prev) => ({ ...prev, price: t }))}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Stock</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={formValues.stock}
                    onChangeText={(t) => setFormValues((prev) => ({ ...prev, stock: t }))}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Image URL</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="https://..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                value={formValues.image}
                onChangeText={(t) => setFormValues((prev) => ({ ...prev, image: t }))}
              />

              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.categoryPickerRow}>
                {['Active', 'Inactive'].map((s) => {
                  const active = formValues.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.categoryOption, active && styles.categoryOptionActive]}
                      onPress={() => setFormValues((prev) => ({ ...prev, status: s }))}>
                      <Text
                        style={[
                          styles.categoryOptionText,
                          active && styles.categoryOptionTextActive,
                        ]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setFormVisible(false)}>
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, formSubmitting && styles.buttonDisabled]}
                onPress={handleFormSubmit}
                disabled={formSubmitting}>
                {formSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {editingProduct ? 'บันทึกการแก้ไข' : 'เพิ่มกีตาร์'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------------- */}
      {/* Delete confirmation modal                                       */}
      {/* -------------------------------------------------------------- */}
      <Modal
        visible={!!deleteTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmIcon}>🗑️</Text>
            <Text style={styles.modalTitle}>ลบสินค้านี้ใช่หรือไม่?</Text>
            <Text style={styles.modalSubtitle}>
              {deleteTarget ? `"${deleteTarget.name}" จะถูกลบออกจากคลังสินค้าอย่างถาวร` : ''}
            </Text>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dangerButton, deleteSubmitting && styles.buttonDisabled]}
                onPress={handleConfirmDelete}
                disabled={deleteSubmitting}>
                {deleteSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>ลบสินค้า</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------------- */}
      {/* Cart modal (storefront)                                         */}
      {/* -------------------------------------------------------------- */}
      <Modal visible={cartVisible} animationType="slide" transparent onRequestClose={() => setCartVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.cartSheet}>
            <Text style={styles.modalTitle}>🛒 ตะกร้าสินค้า</Text>

            {cart.length === 0 ? (
              <View style={styles.centerBlock}>
                <Text style={styles.mutedText}>ยังไม่มีสินค้าในตะกร้า</Text>
              </View>
            ) : (
              <ScrollView style={styles.cartScroll} keyboardShouldPersistTaps="handled">
                {cart.map((item) => (
                  <View key={item.product.id} style={styles.cartItemRow}>
                    <ProductImage uri={item.product.image} style={styles.cartItemImage} />
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName} numberOfLines={2}>
                        {item.product.name}
                      </Text>
                      <Text style={styles.cartItemPrice}>
                        {formatBaht(Number(item.product.price) || 0)}
                      </Text>
                      <View style={styles.qtyStepperRow}>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => updateCartQuantity(item.product.id, item.quantity - 1)}>
                          <Text style={styles.qtyButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => updateCartQuantity(item.product.id, item.quantity + 1)}>
                          <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeItemButton}
                          onPress={() => removeFromCart(item.product.id)}>
                          <Text style={styles.removeItemButtonText}>ลบ</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.cartItemSubtotal}>
                      {formatBaht((Number(item.product.price) || 0) * item.quantity)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {checkoutError ? <Text style={styles.errorText}>{checkoutError}</Text> : null}

            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>ยอดรวม</Text>
              <Text style={styles.cartTotalValue}>{formatBaht(cartTotal)}</Text>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setCartVisible(false)}>
                <Text style={styles.cancelButtonText}>ปิด</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.checkoutButton,
                  (cart.length === 0 || checkoutSubmitting) && styles.buttonDisabled,
                ]}
                disabled={cart.length === 0 || checkoutSubmitting}
                onPress={handleCheckout}>
                {checkoutSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>สั่งซื้อ</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------------------------------- */}
      {/* Order success modal                                             */}
      {/* -------------------------------------------------------------- */}
      <Modal
        visible={!!orderSuccess}
        animationType="fade"
        transparent
        onRequestClose={() => setOrderSuccess(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmIcon}>✅</Text>
            <Text style={styles.modalTitle}>สั่งซื้อสำเร็จ!</Text>
            <Text style={styles.modalSubtitle}>
              {orderSuccess
                ? `หมายเลขคำสั่งซื้อ #${orderSuccess.id} • ยอดรวม ${formatBaht(orderSuccess.totalAmount)}`
                : ''}
            </Text>

            {orderSuccess ? (
              <View style={styles.orderSummaryBlock}>
                {orderSuccess.items.map((item) => (
                  <View key={item.product.id} style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel} numberOfLines={1}>
                      {item.product.name} x{item.quantity}
                    </Text>
                    <Text style={styles.detailInfoValue}>
                      {formatBaht((Number(item.product.price) || 0) * item.quantity)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setOrderSuccess(null)}>
                <Text style={styles.primaryButtonText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.primary,
  },
  headerTitleBlock: {
    flexShrink: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#E9D9C4',
    marginTop: 2,
  },
  headerAuthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerUser: {
    color: '#FFF6EA',
    fontSize: 13,
    fontWeight: '600',
  },
  adminEntranceLink: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  adminEntranceLinkText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  loginButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: '#FFF6EA',
    fontWeight: '600',
    fontSize: 12,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
    color: COLORS.textMuted,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    outlineStyle: 'none' as any,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDeep,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  mutedText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  card: {
    flexGrow: 1,
    flexBasis: 260,
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#2D241E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardImageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 170,
    backgroundColor: COLORS.backgroundAlt,
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagePlaceholderIcon: {
    fontSize: 36,
  },
  tierBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    padding: 14,
  },
  cardBrand: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accentDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    minHeight: 38,
  },
  cardPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primaryDeep,
    marginBottom: 10,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  stockPill: {
    backgroundColor: '#EEF3E7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stockPillEmpty: {
    backgroundColor: '#F7E7E4',
  },
  stockPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3F6B2E',
  },
  stockPillTextEmpty: {
    color: COLORS.danger,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  editButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  editButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#FBEAE7',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 12,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45,36,30,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loginSheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 22,
  },
  formSheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 22,
  },
  confirmSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  confirmIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  formScroll: {
    maxHeight: 420,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
    textAlign: 'left',
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 10,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.text,
  },
  fieldRowSplit: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
  },
  categoryPickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryOption: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundAlt,
  },
  categoryOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDeep,
  },
  categoryOptionTextActive: {
    color: '#FFFFFF',
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  dangerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  linkTextAccent: {
    color: COLORS.accentDeep,
    fontWeight: '700',
  },
  detailSheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 22,
  },
  detailImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: COLORS.backgroundAlt,
    marginBottom: 14,
  },
  detailName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  detailPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primaryDeep,
    marginBottom: 10,
  },
  detailInfoBlock: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 14,
  },
  detailInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailInfoLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  detailInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Storefront: header cart button
  headerRightRow: {
    flexDirection: 'row',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
  },
  cartButton: {
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cartButtonIcon: {
    fontSize: 18,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Storefront: add-to-cart button (product card)
  addToCartButton: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addToCartButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
  addToCartButtonDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.6,
  },

  // Storefront: product detail purchase block
  detailPurchaseBlock: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 14,
    gap: 12,
  },
  detailQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundAlt,
  },
  qtyButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primaryDeep,
    lineHeight: 18,
  },
  qtyValue: {
    minWidth: 22,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  removeItemButton: {
    marginLeft: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FBEAE7',
  },
  removeItemButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger,
  },
  detailAddToCartButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailAddToCartButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  // Cart modal
  cartSheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 22,
  },
  cartScroll: {
    maxHeight: 360,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cartItemImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundAlt,
  },
  cartItemInfo: {
    flex: 1,
    gap: 4,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  cartItemPrice: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  cartItemSubtotal: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDeep,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cartTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  cartTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primaryDeep,
  },
  checkoutButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  orderSummaryBlock: {
    width: '100%',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
});
