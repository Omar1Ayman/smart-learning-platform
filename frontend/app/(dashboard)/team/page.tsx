"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { UserForm } from "@/components/users/UserForm";
import { createUser, listUsers } from "@/lib/api/users";
import type { UserFormValues } from "@/lib/validation/schemas";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "مالك",
  ADMIN: "مسؤول",
  TEACHER: "معلّم",
  STUDENT: "طالب",
};

export default function TeamPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({ queryKey: ["users"], queryFn: () => listUsers() });

  async function handleCreate(values: UserFormValues) {
    await createUser({ ...values, role: values.role as "ADMIN" | "TEACHER" | "STUDENT" });
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">الفريق</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة عضو</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل الأعضاء." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState title="لا يوجد أعضاء بعد" description="أضف معلمين وطلابًا لمؤسستك." />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">البريد الإلكتروني</th>
                <th className="px-4 py-3 text-start font-medium">الاسم</th>
                <th className="px-4 py-3 text-start font-medium">الدور</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((user) => (
                <tr key={user.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{user.email}</td>
                  <td className="px-4 py-3 text-ink-400">
                    {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                      {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة عضو">
        <UserForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
