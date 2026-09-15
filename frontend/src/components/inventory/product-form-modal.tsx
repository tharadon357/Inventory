import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { InventoryItem } from '@/lib/api-client';

export interface ProductFormValues {
  name: string;
  stock: string;
  category: string;
  location: string;
  image: string;
  status: string;
  brand: string;
  sizes: string;
  productCode: string;
  orderName: string;
  storeAvailability: string;
}

const EMPTY_FORM: ProductFormValues = {
  name: '',
  stock: '0',
  category: '',
  location: '',
  image: '',
  status: 'active',
  brand: '',
  sizes: '',
  productCode: '',
  orderName: '',
  storeAvailability: '',
};

function itemToForm(item?: InventoryItem | null): ProductFormValues {
  if (!item) return EMPTY_FORM;
  return {
    name: item.name ?? '',
    stock: String(item.stock ?? 0),
    category: item.category ?? '',
    location: item.location ?? '',
    image: item.image ?? '',
    status: item.status ?? 'active',
    brand: item.brand ?? '',
    sizes: item.sizes ?? '',
    productCode: item.productCode ?? '',
    orderName: item.orderName ?? '',
    storeAvailability: item.storeAvailability ?? '',
  };
}

interface Props {
  visible: boolean;
  editingItem: InventoryItem | null;
  submitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => void;
}

const FIELDS: Array<{ key: keyof ProductFormValues; label: string; placeholder?: string; numeric?: boolean }> = [
  { key: 'name', label: 'ชื่อสินค้า *', placeholder: 'เช่น Fender Player Stratocaster' },
  { key: 'stock', label: 'จำนวนสต๊อก *', placeholder: '0', numeric: true },
  { key: 'category', label: 'หมวดหมู่', placeholder: 'เช่น Guitar' },
  { key: 'brand', label: 'แบรนด์', placeholder: 'เช่น Fender' },
  { key: 'productCode', label: 'รหัสสินค้า', placeholder: 'เช่น SKU-0001' },
  { key: 'sizes', label: 'ไซซ์/ขนาด', placeholder: 'เช่น S, M, L' },
  { key: 'location', label: 'ที่จัดเก็บ', placeholder: 'เช่น คลัง A ชั้น 2' },
  { key: 'status', label: 'สถานะ', placeholder: 'active / inactive / out_of_stock' },
  { key: 'orderName', label: 'ชื่อคำสั่งซื้อ/ล็อต', placeholder: 'ไม่บังคับ' },
  { key: 'storeAvailability', label: 'สาขาที่มีสินค้า', placeholder: 'เช่น สาขา 1, สาขา 2' },
  { key: 'image', label: 'ลิงก์รูปภาพ (URL)', placeholder: 'https://...' },
];

export default function ProductFormModal({
  visible,
  editingItem,
  submitting,
  errorMessage,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ProductFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (visible) setValues(itemToForm(editingItem));
  }, [visible, editingItem]);

  function setField(key: keyof ProductFormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{editingItem ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9CA3AF"
                  value={values[f.key]}
                  onChangeText={(t) => setField(f.key, t)}
                  keyboardType={f.numeric ? 'numeric' : 'default'}
                />
              </View>
            ))}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, submitting && styles.buttonDisabled]}
              onPress={() => onSubmit(values)}
              disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>{editingItem ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    width: '100%',
    alignSelf: 'center',
    maxWidth: 430,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
  closeButton: { padding: 4 },
  closeIcon: { fontSize: 16, color: '#6B7280' },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  fieldRow: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
  },
  errorText: { color: '#DC2626', fontSize: 13, marginBottom: 10 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  cancelText: { color: '#374151', fontWeight: '600' },
  saveButton: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontWeight: '600' },
});
