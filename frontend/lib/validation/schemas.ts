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

export const subjectSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(100),
  code: z.string().max(20).optional(),
});
export type SubjectFormValues = z.infer<typeof subjectSchema>;

export const stageSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(100),
  order: z.coerce.number().int().min(1).default(1),
});
export type StageFormValues = z.infer<typeof stageSchema>;

export const gradeSchema = z.object({
  stage: z.string().min(1, "اختر المرحلة"),
  name: z.string().min(1, "الاسم مطلوب").max(100),
  order: z.coerce.number().int().min(1).default(1),
});
export type GradeFormValues = z.infer<typeof gradeSchema>;

export const courseSchema = z.object({
  subject: z.string().min(1, "اختر المادة"),
  grade: z.string().min(1, "اختر الصف"),
  name: z.string().min(1, "اسم الكورس مطلوب").max(150),
  description: z.string().optional(),
});
export type CourseFormValues = z.infer<typeof courseSchema>;

export const loginSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
