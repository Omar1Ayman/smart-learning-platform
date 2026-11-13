"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  createAttendanceSession,
  type CreateSessionInput,
} from "@/lib/api/attendance";
import { listGroups } from "@/lib/api/groups";
import { listUsers } from "@/lib/api/users";
import { useAuthStore } from "@/lib/auth/store";
import { toastError } from "@/lib/utils/toast";

const schema = z
  .object({
    group: z.string().min(1, "اختر المجموعة"),
    course: z.string().optional().or(z.literal("")),
    teacher: z.string().optional().or(z.literal("")),
    date: z.string().min(1, "التاريخ مطلوب"),
    start_time: z.string().min(1, "وقت البداية مطلوب"),
    end_time: z.string().min(1, "وقت النهاية مطلوب"),
    mode: z.enum(["AUTO_QR", "MANUAL", "HYBRID"]).default("HYBRID"),
    late_threshold_minutes: z.coerce.number().int().min(0).max(120).default(15),
    notes: z.string().optional(),
  })
  .refine((d) => d.end_time > d.start_time, {
    message: "وقت النهاية يجب أن يكون بعد وقت البداية",
    path: ["end_time"],
  });

type Values = z.output<typeof schema>;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function NewAttendanceSessionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userRole = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const isAdmin = userRole === "OWNER" || userRole === "ADMIN";

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
  });
  const { data: teachers } = useQuery({
    queryKey: ["users", "TEACHER"],
    queryFn: () => listUsers("TEACHER"),
    enabled: isAdmin,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      date: todayIso(),
      start_time: "09:00",
      end_time: "10:00",
      mode: "HYBRID",
      late_threshold_minutes: 15,
      teacher: isAdmin ? "" : userId ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: Values) => {
      const payload: CreateSessionInput = {
        group: values.group,
        course: values.course || null,
        teacher: values.teacher || undefined,
        date: values.date,
        start_time: values.start_time,
        end_time: values.end_time,
        mode: values.mode,
        late_threshold_minutes: values.late_threshold_minutes,
        notes: values.notes || "",
      };
      return createAttendanceSession(payload);
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      router.push(`/attendance/${session.id}`);
    },
    onError: (err) => toastError(err, "تعذّر إنشاء الجلسة."),
  });

  return (
    <div className="flex flex-col max-w-2xl gap-6 mx-auto">
      <div>
        <button
          onClick={() => router.push("/attendance")}
          className="text-sm text-ink-400 hover:text-ink"
        >
          ← الحضور
        </button>
        <h1 className="mt-1 text-2xl font-bold font-display text-ink">
          جلسة حضور جديدة
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          اختر المجموعة والتاريخ والوقت — سيتم تسجيل كل الطلاب غائبين افتراضيًا،
          وتغيير الحالة عند الحضور.
        </p>
      </div>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="flex flex-col gap-4 p-6 card"
        noValidate
      >
        <Select
          label="المجموعة"
          required
          placeholder="اختر مجموعة"
          options={(groups?.results ?? []).map((g) => ({
            value: g.id,
            label: g.name,
          }))}
          error={errors.group?.message}
          {...register("group")}
        />

        {isAdmin && (
          <Select
            label="المعلم المسؤول"
            placeholder="أنا (كمسؤول)"
            options={(teachers?.results ?? []).map((t) => ({
              value: t.id,
              label: `${t.first_name || ""} ${t.last_name || ""}`.trim() || t.email,
            }))}
            error={errors.teacher?.message}
            {...register("teacher")}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="التاريخ"
            type="date"
            required
            error={errors.date?.message}
            {...register("date")}
          />
          <Input
            label="وقت البداية"
            type="time"
            required
            error={errors.start_time?.message}
            {...register("start_time")}
          />
          <Input
            label="وقت النهاية"
            type="time"
            required
            error={errors.end_time?.message}
            {...register("end_time")}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="طريقة التسجيل"
            options={[
              { value: "HYBRID", label: "مختلط (QR + يدوي)" },
              { value: "AUTO_QR", label: "QR تلقائي" },
              { value: "MANUAL", label: "يدوي فقط" },
            ]}
            error={errors.mode?.message}
            {...register("mode")}
          />
          <Input
            label="حد التأخير (دقائق)"
            type="number"
            min={0}
            max={120}
            hint="بعد هذا الوقت من بداية الحصة يُسجَّل الطالب متأخرًا"
            error={errors.late_threshold_minutes?.message}
            {...register("late_threshold_minutes")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">
            ملاحظات (اختياري)
          </label>
          <textarea
            rows={2}
            placeholder="مثال: مراجعة الوحدة الثالثة"
            className="px-3 py-2 text-sm bg-white border rounded-lg outline-none border-line focus:border-ink focus:ring-2 focus:ring-ink/10"
            {...register("notes")}
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-line">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/attendance")}
          >
            إلغاء
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء الجلسة"}
          </Button>
        </div>
      </form>
    </div>
  );
}