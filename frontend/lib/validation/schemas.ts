import { z } from "zod";

export const academicYearSchema = z
  .object({
    name: z.string().min(2, "الاسم قصير جدًا").max(50),
    start_date: z.string().min(1, "التاريخ مطلوب"),
    end_date: z.string().min(1, "التاريخ مطلوب"),
  })
  .refine((data) => data.end_date > data.start_date, {
    message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
    path: ["end_date"],
  });

export type AcademicYearFormValues = z.infer<typeof academicYearSchema>;

export const termSchema = z
  .object({
    academic_year: z.string().min(1, "اختر السنة الدراسية"),
    name: z.string().min(1, "الاسم مطلوب").max(50),
    start_date: z.string().min(1, "التاريخ مطلوب"),
    end_date: z.string().min(1, "التاريخ مطلوب"),
    order: z.coerce.number().int().min(1),
  })
  .refine((data) => data.end_date > data.start_date, {
    message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
    path: ["end_date"],
  });

export type TermFormValues = z.infer<typeof termSchema>;

export const loginSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
