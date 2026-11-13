"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ResourcePage } from "@/components/common/ResourcePage";
import { SubjectForm } from "@/components/subjects/SubjectForm";
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
} from "@/lib/api/subjects";
import type { SubjectFormValues } from "@/lib/validation/schemas";
import { toastError } from "@/lib/utils/toast";

// تأكد من تحديث الواجهة (Interface) لتشمل العدد القادم من الباك إند
interface SubjectRow {
  id: string;
  name: string;
  code: string;
  courses_count: number; 
}

export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["subjects"] });

  return (
    <ResourcePage<SubjectRow, SubjectFormValues>
      title="المواد الأساسية" // تغيير الاسم لمنع التشويش
      description="التصنيفات العامة للمواد (مثل: رياضيات، أحياء). هذه المواد لا ترتبط بصف معين، بل يتم بناء 'مقررات' منها لاحقاً."
      queryKey={["subjects"]}
      queryFn={listSubjects}
      columns={[
        {
          header: "اسم المادة",
          render: (s) => <span className="font-medium text-ink">{s.name}</span>,
          sortValue: (s) => s.name,
        },
        {
          header: "الكود",
          render: (s) => <span className="text-ink-400">{s.code || "—"}</span>,
          sortValue: (s) => s.code,
        },
        {
          header: "المقررات المرتبطة",
          render: (s) => (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              s.courses_count > 0 ? "bg-info/10 text-info" : "bg-ink-50 text-ink-400"
            }`}>
              {s.courses_count} مقرر
            </span>
          ),
          sortValue: (s) => s.courses_count,
        },
      ]}
      searchPredicate={(s, q) =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      }
      searchPlaceholder="ابحث باسم المادة أو الكود..."
      createLabel="+ إضافة مادة أساسية"
      formTitle="إضافة مادة أساسية"
      FormComponent={SubjectForm}
      EditFormComponent={SubjectForm}
      rowToFormValues={(s) => ({ name: s.name, code: s.code })}
      deleteLabel={(s) => s.name}
      onSubmit={async (values) => {
        try {
          await createSubject(values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّرت إضافة المادة.");
          throw err;
        }
      }}
      onUpdate={async (id, values) => {
        try {
          await updateSubject(id, values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر تحديث المادة.");
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteSubject(id);
          await invalidate();
        } catch (err) {
          // رسالة خطأ مقترحة في حال كان الحذف ممنوعاً بسبب وجود مقررات
          toastError(err, "تعذّر حذف المادة — قد تكون مرتبطة بمقررات دراسية.");
          throw err;
        }
      }}
      emptyTitle="لا توجد مواد أساسية بعد"
      emptyDescription="ابدأ بإضافة أول تصنيف مادة (مثل: رياضيات) لتتمكن من بناء المقررات منها."
    />
  );
}