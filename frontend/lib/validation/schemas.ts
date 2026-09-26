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

export const groupSchema = z.object({
  grade: z.string().min(1, "اختر الصف"),
  academic_year: z.string().min(1, "اختر السنة الدراسية"),
  name: z.string().min(1, "الاسم مطلوب").max(100),
  capacity: z.coerce.number().int().min(1).optional(),
});
export type GroupFormValues = z.infer<typeof groupSchema>;

export const userSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(10, "10 أحرف على الأقل"),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"], { errorMap: () => ({ message: "اختر دورًا" }) }),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});
export type UserFormValues = z.infer<typeof userSchema>;

export const teacherAssignmentSchema = z.object({
  teacher: z.string().min(1, "اختر المعلم"),
  course: z.string().min(1, "اختر الكورس"),
  groups: z.array(z.string()).optional(),
});
export type TeacherAssignmentFormValues = z.infer<typeof teacherAssignmentSchema>;

export const enrollmentSchema = z.object({
  student: z.string().min(1, "اختر الطالب"),
  group: z.string().min(1, "اختر المجموعة"),
});
export type EnrollmentFormValues = z.infer<typeof enrollmentSchema>;

export const contentSchema = z
  .object({
    title: z.string().min(1, "العنوان مطلوب").max(255),
    content_type: z.enum(
      [
        "PDF",
        "VIDEO",
        "IMAGE",
        "DOCUMENT",
        "EXTERNAL_LINK",
        "TEXT",
        "BOOK",
        "SUMMARY",
        "LESSON_EXPLANATION",
        "CHAPTER_RESOURCE",
      ],
      { errorMap: () => ({ message: "اختر نوع المحتوى" }) }
    ),
    description: z.string().optional(),
    external_url: z.string().optional(),
    text_body: z.string().optional(),
    stage: z.string().optional(),
    grade: z.string().optional(),
    group: z.string().optional(),
    subject: z.string().optional(),
    course: z.string().optional(),
    chapter: z.string().optional(),
    lesson: z.string().optional(),
    academic_year: z.string().optional(),
    term: z.string().optional(),
  })
  .refine(
    (data) => data.content_type !== "EXTERNAL_LINK" || !!data.external_url,
    { message: "الرابط الخارجي مطلوب", path: ["external_url"] }
  )
  .refine(
    (data) =>
      !["TEXT", "SUMMARY", "LESSON_EXPLANATION"].includes(data.content_type) || !!data.text_body,
    { message: "النص مطلوب", path: ["text_body"] }
  );
export type ContentFormValues = z.infer<typeof contentSchema>;

export const loginSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
