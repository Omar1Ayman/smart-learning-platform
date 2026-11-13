"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, Spinner } from "@/components/ui/States";
import { apiClient } from "@/lib/api/client";
import { activateYear } from "@/lib/api/rollover";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";
import { extractErrorMessage, toastError, toastSuccess } from "@/lib/utils/toast";
import type { AcademicYear, PrepareNextYearResponse } from "@/types";

interface Step3ActivateYearProps {
  sourceYear: AcademicYear;
  preparedYear: PrepareNextYearResponse;
  onActivated: () => void;
}

export function Step3ActivateYear({
  sourceYear,
  preparedYear,
  onActivated,
}: Step3ActivateYearProps) {
  const queryClient = useQueryClient();
  const setActiveYear = useActiveYearStore((state) => state.setActiveYear);
  const [confirmActivation, setConfirmActivation] = useState(false);
  const advanced = useRef(false);
  const {
    data: targetYear,
    isLoading: isTargetLoading,
    isError: isTargetError,
    refetch: refetchTarget,
  } = useQuery({
    queryKey: ["academic-year", preparedYear.new_year_id],
    queryFn: async () => {
      const { data } = await apiClient.get<AcademicYear>(
        `/academic-years/${preparedYear.new_year_id}/`
      );
      return data;
    },
  });

  const continueAfterActivation = useCallback((year: AcademicYear) => {
    if (advanced.current) return;
    advanced.current = true;
    setActiveYear({
      id: year.id,
      name: year.name,
      status: year.status,
    });
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["academic-years"] }),
      queryClient.invalidateQueries({ queryKey: ["academic-year"] }),
      queryClient.invalidateQueries({ queryKey: ["setup-status"] }),
    ]);
    setConfirmActivation(false);
    onActivated();
  }, [onActivated, queryClient, setActiveYear]);

  useEffect(() => {
    if (targetYear?.status === "ACTIVE") {
      continueAfterActivation(targetYear);
    }
  }, [continueAfterActivation, targetYear]);

  const mutation = useMutation({
    mutationFn: () => activateYear(preparedYear.new_year_id),
    onSuccess: (year) => {
      toastSuccess(`تم تفعيل السنة ${year.name}`);
      continueAfterActivation(year);
    },
    onError: (error) => {
      toastError(error, "تعذّر تفعيل السنة الجديدة.");
      setConfirmActivation(false);
    },
  });

  if (isTargetLoading) return <Spinner />;
  if (isTargetError || !targetYear) {
    return (
      <ErrorState
        message="تعذّر التحقق من حالة السنة الجديدة."
        onRetry={() => {
          void refetchTarget();
        }}
      />
    );
  }
  if (targetYear.status !== "DRAFT" && targetYear.status !== "ACTIVE") {
    return (
      <ErrorState message="السنة الجديدة ليست مسودة أو نشطة؛ ارجع إلى قائمة السنوات لمراجعة حالتها." />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">
            تفعيل السنة الجديدة
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            تم إنشاء <strong>{preparedYear.new_year_name}</strong> كمسودة.
            يجب تفعيلها قبل ترحيل الطلاب؛ عند التفعيل ستصبح{" "}
            <strong>{sourceYear.name}</strong> قيد الإغلاق، وتبقى بياناتها
            متاحة حتى إتمام الترحيل والأرشفة.
          </p>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-ink">
            ما الذي سيحدث عند التفعيل؟
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-600">
            <li>تصبح {preparedYear.new_year_name} السنة النشطة للمؤسسة.</li>
            <li>تتحول السنة النشطة الحالية إلى «قيد الإغلاق» تلقائيًا.</li>
            <li>يمكنك بعدها مراجعة قرارات الطلاب ثم أرشفة السنة القديمة.</li>
          </ul>
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-danger">
            {extractErrorMessage(
              mutation.error,
              "تعذّر تفعيل السنة الجديدة. أعد المحاولة.",
            )}
          </p>
        )}

        <div className="flex flex-col-reverse justify-between gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-500">
            لا يتم ترحيل الطلاب أو أرشفة السنة القديمة في هذه الخطوة.
          </p>
          <Button
            onClick={() => setConfirmActivation(true)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "جارٍ التفعيل..." : "تفعيل السنة ومتابعة"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmActivation}
        title={`تفعيل السنة ${preparedYear.new_year_name}`}
        description={`ستصبح ${preparedYear.new_year_name} نشطة، وستتحول ${sourceYear.name} من نشطة إلى قيد الإغلاق. يمكنك بعد ذلك إكمال ترحيل الطلاب وأرشفة السنة القديمة.`}
        confirmLabel={mutation.isPending ? "جارٍ التفعيل..." : "تأكيد التفعيل"}
        cancelLabel="إلغاء"
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmActivation(false)}
        isPending={mutation.isPending}
      />
    </>
  );
}
