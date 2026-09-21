"use client";

import { Modal } from "@/components/ui/Modal";

/**
 * The reusable "create a related record without leaving the parent form"
 * pattern from spec #16/#17. Deliberately just a named, styled wrapper
 * around Modal — every future quick-create flow (Teacher, Group, Course, …)
 * should render its form inside this, not build a bespoke modal.
 */
interface QuickCreateModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function QuickCreateModal({ open, onClose, title, children }: QuickCreateModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {children}
    </Modal>
  );
}
