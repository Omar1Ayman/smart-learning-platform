"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ResourcePage } from "@/components/common/ResourcePage";
import { StageForm } from "@/components/stages/StageForm";
import {
  createStage,
  deleteStage,
  listStages,
  updateStage,
} from "@/lib/api/stages";
import type { StageFormValues } from "@/lib/validation/schemas";
import { toastError } from "@/lib/utils/toast";

interface StageRow {
  id: string;
  name: string;
  order: number;
}

export default function StagesPage() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["stages"] });

  return (
    <ResourcePage<StageRow, StageFormValues>
      title="المراحل الدراسية"
      queryKey={["stages"]}
      queryFn={listStages}
      columns={[
        {
          header: "الاسم",
          render: (s) => (
            <Link
              href={`/stages/${s.id}`}
              className="font-medium text-ink hover:underline"
            >
              {s.name}
            </Link>
          ),
          sortValue: (s) => s.name,
        },
        {
          header: "الترتيب",
          render: (s) => <span className="text-ink-400">{s.order}</span>,
          sortValue: (s) => s.order,
        },
      ]}
      searchPredicate={(s, q) => s.name.toLowerCase().includes(q)}
      searchPlaceholder="ابحث باسم المرحلة..."
      createLabel="+ إضافة مرحلة"
      formTitle="إضافة مرحلة"
      FormComponent={StageForm}
      EditFormComponent={StageForm}
      rowToFormValues={(s) => ({ name: s.name, order: s.order })}
      deleteLabel={(s) => s.name}
      onSubmit={async (values) => {
        try {
          await createStage(values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّرت إضافة المرحلة.");
          throw err;
        }
      }}
      onUpdate={async (id, values) => {
        try {
          await updateStage(id, values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر تحديث المرحلة.");
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteStage(id);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر حذف المرحلة.");
          throw err;
        }
      }}
      emptyTitle="لا توجد مراحل بعد"
      emptyDescription="ابدأ بإضافة أول مرحلة دراسية."
    />
  );
}