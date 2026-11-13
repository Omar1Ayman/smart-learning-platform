"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { ModalDirtyContext } from "@/lib/hooks/useModalDirty";

/**
 * The reusable "create a related record without leaving the parent form"
 * pattern from spec #16/#17. Deliberately just a named, styled wrapper
 * around Modal — every future quick-create flow (Teacher, Group, Course, …)
 * should render its form inside this, not build a bespoke modal.
 *
 * Wave C: the modal now tracks form dirtiness. When the form inside has
 * unsaved changes, closing via ✕ / Escape / backdrop asks for confirmation
 * instead of silently discarding the user's input. Forms opt in through
 * `useUnsavedChangesWarning` (which reports to this context) — no-op when
 * rendered outside a modal.
 */
interface QuickCreateModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function QuickCreateModal({
  open,
  onClose,
  title,
  children,
}: QuickCreateModalProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirtyRef = useRef(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) setConfirmDiscard(true);
    else onClose();
  }, [onClose]);

  const contextValue = useMemo(
    () => ({ setDirty, requestClose }),
    [setDirty, requestClose]
  );

  // Reset dirtiness whenever the modal reopens fresh.
  useEffect(() => {
    if (open) dirtyRef.current = false;
  }, [open]);

  return (
    <>
      <Modal open={open} onClose={requestClose} title={title}>
        <ModalDirtyContext.Provider value={contextValue}>
          {children}
        </ModalDirtyContext.Provider>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="تجاهل التغييرات؟"
        description="لديك تغييرات غير محفوظة في هذا النموذج. سيتم فقدانها إذا أغلقت النافذة."
        confirmLabel="تجاهل وإغلاق"
        cancelLabel="متابعة التعديل"
        variant="default"
        onConfirm={() => {
          setConfirmDiscard(false);
          dirtyRef.current = false;
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
