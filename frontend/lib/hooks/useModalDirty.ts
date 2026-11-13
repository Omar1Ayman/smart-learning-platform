"use client";

import { createContext, useContext } from "react";

interface ModalContextValue {
  /** أبلغ النافذة بأن النموذج بداخلها يحتوي تغييرات غير محفوظة. */
  setDirty: (dirty: boolean) => void;
  /** إغلاق محروس: يطلب تأكيدًا إذا كان النموذج متسخًا. undefined خارج النوافذ. */
  requestClose?: () => void;
}

/**
 * Context يوفره QuickCreateModal حتى تستطيع النماذج بداخله الإبلاغ عن حالة
 * "تغييرات غير محفوظة" واستخدام إغلاق محروس. القيمة الافتراضية no-op فتكون
 * آمنة عند استخدام النموذج خارج أي نافذة منبثقة.
 */
export const ModalDirtyContext = createContext<ModalContextValue>({
  setDirty: () => {},
});

export function useModalDirty() {
  return useContext(ModalDirtyContext);
}
