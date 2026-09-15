import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// Tharadon Guitar Store — ทางเข้าหลังบ้าน (Admin back-office entrance)
// เส้นทางแยกต่างหากสำหรับผู้ดูแลระบบ: /admin
// เข้าสู่ระบบด้วยบัญชีแอดมินที่นี่ แล้วจะพาไปหน้าแรกซึ่งจะแสดงเครื่องมือจัดการสินค้า
// (เพิ่ม/แก้ไข/ลบ) ให้อัตโนมัติ เพราะสิทธิ์ผู้ใช้ถูกเก็บไว้ที่เดียวกับหน้าร้านค้า
// ============================================================================

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3081').replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'guitar-store:auth-user';

interface AuthUser {
  username: string;
  role: string;
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

const COLORS = {
  bg: '#1B140F',
  panel: '#2A1F17',
  panelBorder: '#4A3A2A',
  accent: '#D97706',
  accentDeep: '#B45309',
  text: '#F5EFE6',
  textMuted: '#B4A492',
  danger: '#F87171',
};

export default function AdminEntrance() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const user: AuthUser = JSON.parse(raw);
          if (user.role === 'admin') {
            // เข้าสู่ระบบเป็นแอดมินอยู่แล้ว -> พาไปหน้าจัดการสินค้าทันที
            router.replace('/');
            return;
          }
        }
        setCheckingSession(false);
      })
      .catch(() => setCheckingSession(false));
  }, [router]);

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError('กรุณากรอก username และ password');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; user: AuthUser }>('/api/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      });
      if (res.user.role !== 'admin') {
        setError('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ กรุณาใช้บัญชีแอดมิน');
        return;
      }
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <View style={[styles.page, styles.centerFill]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.centerFill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.panel}>
            <Text style={styles.lockIcon}>🔐</Text>
            <Text style={styles.title}>ทางเข้าหลังบ้าน</Text>
            <Text style={styles.subtitle}>Tharadon Guitar Store — Admin Back Office</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="admin"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>เข้าสู่ระบบหลังบ้าน</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/')}>
              <Text style={styles.backLinkText}>← กลับไปหน้าร้านค้า</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    padding: 28,
    alignItems: 'stretch',
  },
  lockIcon: {
    fontSize: 36,
    textAlign: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 22,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#211913',
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  backLink: {
    marginTop: 18,
    alignItems: 'center',
  },
  backLinkText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
});
