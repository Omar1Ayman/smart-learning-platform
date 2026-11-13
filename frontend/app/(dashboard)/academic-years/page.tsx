"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import type { FilterDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AcademicYearForm } from "@/components/academic-years/AcademicYearForm";
import {
  createAcademicYear,
  deleteAcademicYear,
  listAcademicYears,
  updateAcademicYear,
} from "@/lib/api/academicYears";
import { activateYear, archiveYear } from "@/lib/api/rollover";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { AcademicYearFormValues } from "@/lib/validation/schemas";
import type { AcademicYearStatus } from "@/types";

interface AcademicYearRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  status_display?: string;
  is_active: boolean;
  activated_at: string | null;
  closed_at: string | null;
}

const STATUS_META: Record<
  AcademicYearStatus,
  { label: string; cls: string; dot: string }
> = {
  DRAFT: {
    label: "إعداد",
    cls: "bg-ink-50 text-ink-400",
    dot: "bg-ink-400",
  },
  ACTIVE: {
    label: "نشطة",
    cls: "bg-success/10 text-success",
    dot: "bg-success",
  },
  CLOSING: {
    label: "قيد الإغلاق",
    cls: "bg-accent/20 text-accent-dark",
    dot: "bg-accent",
  },
  ARCHIVED: {
    label: "مؤرشفة",
    cls: "bg-ink-50 text-ink-400",
    dot: "bg-ink-300",
  },
};

export default function AcademicYearsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const setActiveYear = useActiveYearStore((s) => s.setActiveYear);
  const activeYearId = useActiveYearStore((s) => s.activeYearId);
  const clearActiveYear = useActiveYearStore((s) => s.clearActiveYear);

  const [statusFilter, setStatusFilter] = useState("");
  const [activationTarget, setActivationTarget] =
    useState<AcademicYearRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AcademicYearRow | null>(
    null
  );

  const filterValues = useMemo(
    () => ({ status: statusFilter }),
    [statusFilter]
  );

  const filters = useMemo<FilterDef<AcademicYearRow>[]>(
    () => [
      {
        key: "status",
        label: "الحالات",
        options: [
          { value: "DRAFT", label: "إعداد" },
          { value: "ACTIVE", label: "نشطة" },
          { value: "CLOSING", label: "قيد الإغلاق" },
          { value: "ARCHIVED", label: "مؤرشفة" },
        ],
        match: (row, v) => row.status === v,
      },
    ],
    []
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["academic-years"] });

  // ─── Activate mutation ───
  const activateMutation = useMutation({
    mutationFn: (id: string) => activateYear(id),
    onSuccess: (year) => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      queryClient.invalidateQueries({ queryKey: ["academic-year"] });
      // Auto-switch the active year in the store
      setActiveYear({
        id: year.id,
        name: year.name,
        status: year.status,
      });
      setActivationTarget(null);
      toastSuccess(`تم تفعيل السنة ${year.name}`);
    },
    onError: (err) => toastError(err, "تعذّر تفعيل السنة."),
  });

  // ─── Direct archive mutation (bypass wizard) ───
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveYear(id),
    onSuccess: (year) => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      queryClient.invalidateQueries({ queryKey: ["academic-year"] });
      if (activeYearId === year.id) {
        clearActiveYear();
      }
      toastSuccess(`تم أرشفة ${year.name}`);
      setArchiveTarget(null);
    },
    onError: (err) => {
      toastError(err, "تعذّرت الأرشفة.");
      setArchiveTarget(null);
    },
  });

  return (
    <>
      <ResourcePage<AcademicYearRow, AcademicYearFormValues>
        title="السنوات الدراسية"
        description="كل سنة دراسية هي حاوية لبياناتها — مجموعات، كورسات، تسجيلات، وامتحانات. سنة ACTIVE واحدة فقط في كل وقت."
        queryKey={["academic-years"]}
        queryFn={listAcademicYears}
        columns={[
          {
            header: "الاسم",
            render: (y) => (
              <span className="font-medium text-ink">{y.name}</span>
            ),
            sortValue: (y) => y.name,
          },
          {
            header: "البداية",
            render: (y) => (
              <span className="text-xs text-ink-400">{y.start_date}</span>
            ),
            sortValue: (y) => y.start_date,
          },
          {
            header: "النهاية",
            render: (y) => (
              <span className="text-xs text-ink-400">{y.end_date}</span>
            ),
            sortValue: (y) => y.end_date,
          },
          {
            header: "الحالة",
            render: (y) => {
              const meta = STATUS_META[y.status] ?? STATUS_META.DRAFT;
              return (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
              );
            },
            sortValue: (y) => y.status,
          },
          {
            header: "الخطوة التالية",
            render: (y) => {
              if (y.status === "DRAFT") {
                return (
                  <Button
                    size="sm"
                    onClick={() => setActivationTarget(y)}
                    disabled={activateMutation.isPending}
                  >
                    تفعيل السنة
                  </Button>
                );
              }
              if (y.status === "ACTIVE" || y.status === "CLOSING") {
                return (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/academic-years/${y.id}/close`)}
                  >
                    {y.status === "ACTIVE"
                      ? "إغلاق السنة"
                      : "متابعة الإغلاق"}
                  </Button>
                );
              }
              return (
                <span className="text-xs text-ink-500">
                  مؤرشفة — للقراءة فقط
                </span>
              );
            },
          },
          {
            header: "المدة",
            render: (y) => {
              const start = new Date(y.start_date);
              const end = new Date(y.end_date);
              const days = Math.round(
                (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <span className="text-xs text-ink-400">{days} يوم</span>
              );
            },
            sortValue: (y) => {
              const start = new Date(y.start_date);
              const end = new Date(y.end_date);
              return Math.round(
                (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
              );
            },
          },
        ]}
        searchPredicate={(y, q) => y.name.toLowerCase().includes(q)}
        searchPlaceholder="ابحث باسم السنة..."
        filters={filters}
        filterValues={filterValues}
        onFilterChange={(_, value) => setStatusFilter(value)}
        createLabel="+ إضافة سنة دراسية"
        formTitle="إضافة سنة دراسية"
        FormComponent={AcademicYearForm}
        EditFormComponent={AcademicYearForm}
        rowToFormValues={(y) => ({
          name: y.name,
          start_date: y.start_date,
          end_date: y.end_date,
        })}
        deleteLabel={(y) => y.name}
        // ─── Per-row rules ───
        canEditRow={(y) => y.status === "DRAFT" || y.status === "ACTIVE"}
        canDeleteRow={(y) => y.status === "DRAFT"}
        // ─── Custom actions ───
        extraActions={(y) => {
          const actions = [];

          // Quick archival stays available in the secondary actions menu.
          if (y.status === "ACTIVE" || y.status === "CLOSING") {
            actions.push({
              label: "أرشفة سريعة",
              onClick: () => setArchiveTarget(y),
            });
          }

          return actions;
        }}
        onSubmit={async (values) => {
          try {
            await createAcademicYear(values);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّرت إضافة السنة الدراسية.");
            throw err;
          }
        }}
        onUpdate={async (id, values) => {
          try {
            await updateAcademicYear(id, values);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّر تحديث السنة الدراسية.");
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteAcademicYear(id);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّر حذف السنة الدراسية.");
            throw err;
          }
        }}
        emptyTitle="لا توجد سنوات دراسية بعد"
        emptyDescription="ابدأ بإضافة أول سنة دراسية لمؤسستك."
      />

      <ConfirmDialog
        open={!!activationTarget}
        title={`تفعيل السنة ${activationTarget?.name ?? ""}`}
        description={
          activationTarget
            ? `ستصبح "${activationTarget.name}" السنة النشطة. إذا كانت هناك سنة نشطة حاليًا، ستتحول تلقائيًا إلى «قيد الإغلاق» ويمكنك إكمال ترحيل طلابها من معالج الإغلاق.`
            : ""
        }
        confirmLabel={
          activateMutation.isPending ? "جارٍ التفعيل..." : "تفعيل السنة"
        }
        cancelLabel="إلغاء"
        variant="default"
        onConfirm={() => {
          if (activationTarget) {
            activateMutation.mutate(activationTarget.id);
          }
        }}
        onCancel={() => setActivationTarget(null)}
        isPending={activateMutation.isPending}
      />

      {/* Direct archive confirmation */}
      <ConfirmDialog
        open={!!archiveTarget}
        title={`أرشفة السنة ${archiveTarget?.name ?? ""}`}
        description={
          archiveTarget
            ? `سيتم أرشفة "${archiveTarget.name}" مباشرة بدون تجهيز سنة جديدة. بعد الأرشفة، تصبح السنة للقراءة فقط.\n\n` +
              `⚠️ إذا لم تكن هناك سنة نشطة أخرى، ستحتاج لإنشاء سنة جديدة يدوياً بعد الأرشفة.`
            : ""
        }
        confirmLabel={
          archiveMutation.isPending ? "جارٍ الأرشفة..." : "أرشفة الآن"
        }
        cancelLabel="استخدام Wizard"
        variant="danger"
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget.id);
        }}
        onCancel={() => {
          if (archiveTarget) {
            const id = archiveTarget.id;
            setArchiveTarget(null);
            router.push(`/academic-years/${id}/close`);
          }
        }}
        isPending={archiveMutation.isPending}
      />
    </>
  );
}