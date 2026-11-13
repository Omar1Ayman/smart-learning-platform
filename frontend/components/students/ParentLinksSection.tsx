"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  RELATIONSHIP_LABEL,
  createParentLink,
  deleteParentLink,
  listParentLinks,
} from "@/lib/api/parent";
import { createUser, listUsers } from "@/lib/api/users";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { ParentLink } from "@/types";

/**
 * Admin UI: manage which parents are linked to a given student.
 *
 * Usage in `/students/[id]/page.tsx`:
 *   import { ParentLinksSection } from "@/components/students/ParentLinksSection";
 *   ...
 *   <ParentLinksSection studentId={data.id} />
 */
export function ParentLinksSection({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ParentLink | null>(null);

  const q = useQuery({
    queryKey: ["parent-links", studentId],
    queryFn: () => listParentLinks(studentId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["parent-links", studentId] });

  const deleteMutation = useMutation({
    mutationFn: deleteParentLink,
    onSuccess: async () => {
      await invalidate();
      toastSuccess("تم إزالة ربط ولي الأمر");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toastError(err, "تعذّر إزالة الربط.");
      setDeleteTarget(null);
    },
  });

  const links = q.data ?? [];

  return (
    <>
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              أولياء الأمور
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              الحسابات المرتبطة بهذا الطالب
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="text-sm">
            + ربط ولي أمر
          </Button>
        </div>

        {q.isLoading ? (
          <p className="py-6 text-center text-sm text-ink-400">جارٍ التحميل...</p>
        ) : links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-paper-muted/20 p-6 text-center text-sm text-ink-400">
            لم يتم ربط أي ولي أمر بهذا الطالب بعد.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {link.parent_name}
                    {link.is_primary && (
                      <span className="ms-2 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-dark">
                        أساسي
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {link.parent_email} ·{" "}
                    {RELATIONSHIP_LABEL[link.relationship] ?? link.relationship}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setDeleteTarget(link)}
                  className="text-xs text-danger hover:bg-danger/5"
                >
                  إزالة
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {addOpen && (
        <AddParentLinkModal
          studentId={studentId}
          onClose={() => setAddOpen(false)}
          onAdded={async () => {
            await invalidate();
            setAddOpen(false);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="إزالة ربط ولي الأمر"
        description={
          deleteTarget
            ? `سيتم إلغاء ارتباط ${deleteTarget.parent_name} بالطالب. لن يتم حذف حساب ولي الأمر نفسه.`
            : ""
        }
        confirmLabel="إزالة"
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function AddParentLinkModal({
  studentId,
  onClose,
  onAdded,
}: {
  studentId: string;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [parentId, setParentId] = useState("");
  const [relationship, setRelationship] = useState<"FATHER" | "MOTHER" | "GUARDIAN">(
    "GUARDIAN"
  );
  const [isPrimary, setIsPrimary] = useState(false);

  // New parent form
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  const { data: parents } = useQuery({
    queryKey: ["users", "PARENT"],
    queryFn: () => listUsers("PARENT"),
    enabled: mode === "existing",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      let finalParentId = parentId;

      if (mode === "new") {
        // Create the parent account first.
        const created = await createUser({
          email: newEmail,
          role: "PARENT",
          first_name: newFirstName,
          last_name: newLastName,
        });
        finalParentId = created.id;
      }

      if (!finalParentId) throw new Error("اختر ولي أمر أو أنشئ حسابًا جديدًا.");

      await createParentLink({
        parent: finalParentId,
        student: studentId,
        relationship,
        is_primary: isPrimary,
      });
    },
    onSuccess: async () => {
      toastSuccess(
        mode === "new"
          ? "تم ربط ولي الأمر وإرسال دعوة تفعيل الحساب"
          : "تم ربط ولي الأمر"
      );
      await onAdded();
    },
    onError: (err) => toastError(err, "تعذّر ربط ولي الأمر."),
  });

  const canSubmit =
    mode === "existing"
      ? !!parentId
      : !!newEmail;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-bold text-ink">
          ربط ولي أمر بالطالب
        </h2>
        <p className="mt-1 text-xs text-ink-400">
          اختر حسابًا موجودًا أو أنشئ حسابًا جديدًا
        </p>

        {/* Mode toggle */}
        <div className="mt-4 flex rounded-lg border border-line bg-paper-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "existing"
                ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                : "text-ink hover:bg-paper-muted"
            }`}
          >
            حساب موجود
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "new"
                ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                : "text-ink hover:bg-paper-muted"
            }`}
          >
            حساب جديد
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {mode === "existing" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-700">
                ولي الأمر
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="">اختر ولي أمر...</option>
                {(parents?.results ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                      p.email}
                  </option>
                ))}
              </select>
              {(parents?.results ?? []).length === 0 && (
                <p className="text-xs text-ink-400">
                  لا يوجد ولي أمر مسجل. أنشئ حسابًا جديدًا.
                </p>
              )}
            </div>
          ) : (
            <>
              <Input
                label="البريد الإلكتروني"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="الاسم الأول"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                />
                <Input
                  label="اسم العائلة"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                />
              </div>
              <p className="text-xs leading-5 text-ink-500">
                سنرسل لولي الأمر رابطًا آمنًا لتعيين كلمة المرور بعد إنشاء الحساب.
              </p>
            </>
          )}

          <Select
            label="صلة القرابة"
            value={relationship}
            onChange={(e) =>
              setRelationship(
                e.target.value as "FATHER" | "MOTHER" | "GUARDIAN"
              )
            }
            options={[
              { value: "FATHER", label: "الأب" },
              { value: "MOTHER", label: "الأم" },
              { value: "GUARDIAN", label: "ولي أمر / وصي" },
            ]}
          />

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper-muted/20 p-3">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span className="text-sm text-ink-700">
              جهة الاتصال الأساسية (لإشعارات الغياب والنتائج)
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? "..." : "ربط"}
          </Button>
        </div>
      </div>
    </div>
  );
}