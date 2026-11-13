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
  name: z.string().min(1, "اسم المادة الدراسية مطلوب").max(150),
  description: z.string().optional(),
  // Phase 1.4: السنة إجبارية
  academic_year: z.string().min(1, "السنة الدراسية مطلوبة"),
  term: z.string().optional().or(z.literal("")),
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
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"], { error: "اختر دورًا" }),
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
  term: z.string().optional().or(z.literal("")),
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
      { error: "اختر نوع المحتوى" }
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

export const questionBankSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(255),
  description: z.string().optional(),
  subject: z.string().optional(),
  grade: z.string().optional(),
});
export type QuestionBankFormValues = z.infer<typeof questionBankSchema>;

const optionSchema = z.object({
  text: z.string().min(1, "نص الاختيار مطلوب"),
  is_correct: z.boolean(),
});



export const questionSchema = z
  .object({
    bank: z.string().min(1, "اختر بنك الأسئلة"),
    text: z.string().min(1, "نص السؤال مطلوب"),
    question_type: z.enum(["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"], {
      error: "اختر نوع السؤال",
    }),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
    topic: z.string().optional(),
    points: z.coerce.number().positive("يجب أن تكون النقاط أكبر من صفر").default(1),
    accepted_answers_text: z.string().optional(),
    options: z.array(optionSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.question_type === "MCQ" || data.question_type === "TRUE_FALSE") {
      const options = data.options ?? [];

      if (options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "مطلوب اختياران على الأقل",
          path: ["options"],
        });
      }

      const correctCount = options.filter((o) => o.is_correct).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "يجب أن تكون هناك إجابة صحيحة واحدة بالضبط",
          path: ["options"],
        });
      }

      // TRUE_FALSE — texts are fixed. Which of the two is correct is
      // legitimately either one, but the TEXTS can never change.
      if (data.question_type === "TRUE_FALSE") {
        const texts = options.map((o) => o.text.trim());
        const uniqueTexts = new Set(texts);
        const isCanonical =
          uniqueTexts.size === 2 &&
          uniqueTexts.has("صح") &&
          uniqueTexts.has("خطأ");
        if (!isCanonical) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "سؤال صح/خطأ يجب أن يكون خياراه بالضبط: 'صح' و 'خطأ' — النص ثابت، والإجابة الصحيحة هي ما تختاره.",
            path: ["options"],
          });
        }
      }
    }
    if (
      data.question_type === "SHORT_ANSWER" &&
      !data.accepted_answers_text?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "أضف إجابة واحدة على الأقل",
        path: ["accepted_answers_text"],
      });
    }
  });
export type QuestionFormValues = z.infer<typeof questionSchema>;
export const loginSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
