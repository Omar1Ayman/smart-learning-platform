# 🎨 Design System — Smart Learning Platform

> **هذا الملف هو المصدر الوحيد للحقيقة (single source of truth) لكل قرار تصميمي في الفرونت إند.**
>
> أي صفحة جديدة، أي component، أي تعديل على UI — **لازم يتبع الملف ده**. أي انحراف = bug.
>
> **آخر تحديث:** 2026-11-10 · **الإصدار:** 1.0

---

## 📋 جدول المحتويات

1. [الفلسفة](#-الفلسفة)
2. [Tokens — الألوان والمسافات](#-tokens)
3. [Typography](#-typography)
4. [Spacing & Sizing](#-spacing--sizing)
5. [Shadows & Borders](#-shadows--borders)
6. [الـ Components (Base)](#-components-base)
7. [الـ Page Templates](#-page-templates)
8. [أنماط الجداول](#-أنماط-الجداول)
9. [Empty / Error / Loading States](#-empty--error--loading-states)
10. [RTL & Arabic Rules](#-rtl--arabic-rules)
11. [Dark Mode](#-dark-mode)
12. [Accessibility](#-accessibility)
13. [ممنوعات (Don'ts)](#-ممنوعات-donts)

---

## 🎯 الفلسفة

### المبدأ الأساسي
**الوضوح قبل الجمال.** كل عنصر في الواجهة موجود لسبب. مفيش زخرفة زيادة.

### القيم الخمس
1. **الاتساق (Consistency):** نفس المشكلة = نفس الحل. `Card` في كل صفحة بنفس المسافات. `Button` بنفس الحجم.
2. **الكثافة (Density):** المسافات الأفقية والعمودية محسوبة. لا "مسافات عشوائية" (مفيش `p-7` ولا `gap-9`).
3. **الهرمية (Hierarchy):** المستخدم يعرف أين ينظر أولًا. عنوان → وصف → إجراءات → محتوى.
4. **الاستجابة الفورية (Feedback):** كل إجراء له نتيجة مرئية خلال 100ms. Loading, success, error — كلها مرئية.
5. **الاحترام (Respect):** المستخدم مش محتاج يتعلم المنصة. الأفعال واضحة، التراجع متاح، الأخطاء مفهومة.

### الجهات المرجعية (Benchmarks)
نستلهم من — وليس نقلًا حرفيًا:
- **Linear** — للكثافة والوضوح
- **Notion** — للـ empty states والـ onboarding
- **Stripe Dashboard** — للجداول والفلاتر
- **Vercel** — للـ monochrome + accent
- **Superhuman** — للـ command palette

---

## 🎨 Tokens

### الألوان

#### Semantic Colors (استخدمهم دائمًا، لا تستخدم HEX مباشرة)

| Token | Tailwind | الاستخدام |
|-------|----------|-----------|
| `ink` (DEFAULT: `#2B3A67`) | `bg-ink`, `text-ink` | العلامة التجارية، الأزرار الأساسية، الروابط |
| `ink-50..900` | `bg-ink-50`, `text-ink-700` | الخلفيات الباهتة، النصوص الثانوية |
| `paper` | `bg-paper` | خلفية الصفحة |
| `paper-elevated` | `bg-paper-elevated` | خلفية الـ Card |
| `paper-muted` | `bg-paper-muted` | خلفية ناعمة (مثلاً تحت header) |
| `line` | `border-line` | الحدود الافتراضية |
| `line-strong` | `border-line-strong` | الحدود المؤكدة (focus, hover) |
| `accent` (`#F59E0B`) | `text-accent`, `bg-accent` | التنبيهات، النجوم، الـ highlighted actions |
| `success` (`#10B981`) | `text-success`, `bg-success/10` | نجاح، حاضر، معتمد |
| `danger` (`#EF4444`) | `text-danger`, `bg-danger/10` | خطأ، غائب، رفض |
| `info` (`#3B82F6`) | `text-info`, `bg-info/10` | معلومات، حالة نشطة |
| `warning` (`#F59E0B`) | `text-warning`, `bg-warning/10` | نفس accent — استخدم واحد بس |

#### القاعدة الذهبية
```tsx
// ✅ صحيح
<span className="text-success">✓ معتمد</span>

// ❌ خطأ
<span className="text-green-600">✓ معتمد</span>
<span style={{ color: "#10B981" }}>✓ معتمد</span>
```

**ممنوع:**
- `text-green-*`, `text-red-*`, `text-blue-*` مباشرة (Tailwind palette)
- `style={{ color: "..." }}` (inline styles)
- HEX codes في الـ components

**في `dark:` — استخدم tokens فقط:**
```tsx
// ✅ صحيح
<div className="bg-paper-elevated border-line">

// ❌ خطأ
<div className="bg-white dark:bg-gray-900">
```

---

## 🔤 Typography

### عائلات الخطوط

| Family | Tailwind Class | الاستخدام |
|--------|---------------|-----------|
| IBM Plex Sans Arabic | `font-sans` | **افتراضي** — كل النصوص |
| Noto Kufi Arabic | `font-display` | **العناوين فقط** — `h1`, `h2`, `h3`, page titles |
| Monospace | `font-mono` | الأكواد، ID، أرقام الطلاب، الأكواد التسلسلية |

### الأحجام

| الاستخدام | Class | الحجم | Weight |
|-----------|-------|-------|--------|
| Page title (h1) | `text-2xl font-bold font-display` | 24px | 700 |
| Section heading (h2) | `text-lg font-bold font-display` | 18px | 700 |
| Card title (h3) | `text-base font-semibold` | 16px | 600 |
| Body (افتراضي) | `text-sm` | 14px | 400 |
| Small body / hint | `text-xs text-ink-400` | 12px | 400 |
| Micro (badges) | `text-[10px] font-medium` | 10px | 500 |
| Numbers (tabular) | `tabular-nums` (يضاف دائمًا) | — | — |

### الأرقام
**دايمًا** استخدم `tabular-nums` على الأرقام المعروضة (درجات، عدّادات، تواريخ):
```tsx
<p className="tabular-nums">{score} / {max}</p>
```

**السبب:** الأرقام الـ proportional بتبص "بترقص" لما تتغير.

---

## 📐 Spacing & Sizing

### الـ Scale المسموح
Tailwind spacing scale: **`0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20`**

**ممنوع:**
- `p-7`, `p-9`, `p-11`, `p-14` (مش على الـ scale)
- `gap-[18px]` (arbitrary values)
- `mt-[27px]`

### المسافات المعيارية داخل الـ Components

| Component | Padding | Spacing الداخلي |
|-----------|---------|-----------------|
| `Card` (default) | `p-5` | `gap-3` بين العناصر |
| `Card` (compact) | `p-4` | `gap-2` |
| `Card` (hero) | `p-6` | `gap-4` |
| `Button` | `px-4 py-2` | `gap-2` مع icon |
| `Input` | `px-3 py-2` | `gap-1.5` label↔input |
| Page container | `gap-6` بين الـ sections | — |
| Page edge padding | `p-6` (لـ main content) | — |
| Grid gap | `gap-3` (dense) / `gap-4` (default) / `gap-6` (sections) | — |

### الحاويات (Containers)

| الاستخدام | Max Width | Example |
|-----------|-----------|---------|
| Form single-column | `max-w-2xl` (672px) | Settings, Edit forms |
| Detail pages | `max-w-4xl` (896px) | Student detail, Assessment result |
| Lists / Dashboards | `max-w-6xl` (1152px) | Dashboard, Lists, Reports |
| Auth pages | `max-w-sm` (384px) | Login, Reset |

**لا تستخدم `max-w-5xl`** — بين 4xl و 6xl، غير معياري.

---

## 🎭 Shadows & Borders

| Token | Class | الاستخدام |
|-------|-------|-----------|
| Card default | `border border-line` (بدون shadow) | الأساسي |
| Card elevated | `shadow-card` | عند hover |
| Card hover | `shadow-card-hover` | `hover:shadow-card-hover` |
| Dropdown | `shadow-dropdown` | Menus, Autocomplete |
| Modal | `shadow-modal` | Dialogs, Modals |

**Borders:**
- افتراضي: `border-line` (1px)
- Interactive: `border-line` → `border-ink/30` على hover
- Focus: `ring-2 ring-ink/10`
- Error: `border-danger`
- Danger focus: `ring-2 ring-danger/10`

**Radius:**
- `rounded-lg` (8px) — Buttons, Inputs
- `rounded-card` (12px) — Cards, Modals
- `rounded-card-lg` (16px) — Hero cards
- `rounded-full` — Badges, Avatars, Toggles
- **ممنوع** `rounded-md` (4px) — صغير جدًا

---

## 🧩 Components (Base)

### 1. Button

```tsx
import { Button } from "@/components/ui/Button";

<Button variant="primary">حفظ</Button>
<Button variant="secondary">إلغاء</Button>
<Button variant="ghost">تراجع</Button>
<Button variant="danger">حذف</Button>
```

**الحالات:**
```tsx
<Button disabled>معطّل</Button>
<Button>
  <Loader size={14} /> جارٍ الحفظ...
</Button>
```

**القواعد:**
- زر واحد `primary` في كل شاشة (الـ action الأساسي)
- `secondary` لكل action ثانوي
- `ghost` للـ cancel / tertiary
- `danger` للـ destructive فقط

### 2. Input

```tsx
<Input
  label="البريد الإلكتروني"
  type="email"
  hint="سيُستخدم لتسجيل الدخول"
  error={errors.email?.message}
  required
/>
```

**قواعد:**
- `label` **إجباري** (مفيش input بدون label)
- `required` بيضيف `*` حمراء تلقائيًا
- `hint` بيظهر فقط لو مفيش `error`
- `error` بيستبدل `hint` لما يظهر

### 3. Select

```tsx
<Select
  label="الصف"
  required
  options={grades.map(g => ({ value: g.id, label: g.name }))}
  placeholder="اختر الصف"
  error={errors.grade?.message}
/>
```

### 4. Card

```tsx
// Default
<div className="card p-5">...</div>

// Elevated
<div className="card-elevated p-5">...</div>

// Interactive (clickable)
<Link href="..." className="card p-5 hover:shadow-card-hover">
  ...
</Link>
```

### 5. Badge (Status)

```tsx
// Success (نشط، معتمد، حاضر)
<span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
  نشط
</span>

// Warning (مسودة، بانتظار)
<span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-dark">
  مسودة
</span>

// Danger (مرفوض، غائب)
<span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
  مرفوض
</span>

// Neutral (مؤرشف)
<span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-400">
  مؤرشف
</span>
```

**القاعدة:** `bg-{color}/10` + `text-{color}` + `rounded-full` — دائمًا.

### 6. Modal / ConfirmDialog

**استخدم `ConfirmDialog` دائمًا** — متبنيش `Modal` مخصص إلا لو محتوى complex.

```tsx
<ConfirmDialog
  open={!!target}
  title="تأكيد الحذف"
  description={`سيتم حذف "${target?.name}" نهائيًا.`}
  confirmLabel="حذف"
  variant="danger"
  onConfirm={handleDelete}
  onCancel={() => setTarget(null)}
/>
```

---

## 📄 Page Templates

### 3 أنماط فقط — لا رابع لهم

#### A) **ListPage** — لأي صفحة تعرض قائمة

**البنية:**
```
┌─────────────────────────────────────┐
│ Header (PageHeader)                 │
│   Title + Description + Actions     │
├─────────────────────────────────────┤
│ Tabs (optional)                     │
├─────────────────────────────────────┤
│ Filter Bar                          │
│   Search | Filters | Sort | View    │
├─────────────────────────────────────┤
│ Content                             │
│   Loading / Error / Empty / List    │
├─────────────────────────────────────┤
│ Pagination (optional)               │
└─────────────────────────────────────┘
```

**استخدم:** `PageShell` (موجود) أو `ResourcePage` (موجود).

**صفحات تستخدم الـ pattern:**
- `/students`, `/team`, `/content`, `/questions`, `/assessments`
- `/enrollments`, `/stages`, `/grades`, `/subjects`, `/courses`
- `/terms`, `/academic-years`, `/teacher-assignments`
- `/attendance`, `/notifications`, `/audit-logs`

#### B) **DetailPage** — عرض تفاصيل عنصر واحد

**البنية:**
```
┌─────────────────────────────────────┐
│ Breadcrumb                          │
├─────────────────────────────────────┤
│ PageHeader (Title + Actions)        │
├─────────────────────────────────────┤
│ Hero Card (avatar + key metadata)   │
├─────────────────────────────────────┤
│ Stats Grid (2-4 items)              │
├─────────────────────────────────────┤
│ Sections (Cards)                    │
│   - Section 1 (list/content)        │
│   - Section 2                       │
└─────────────────────────────────────┘
```

**صفحات تستخدم الـ pattern:**
- `/students/[id]`, `/team/[id]`, `/courses/[id]`
- `/lessons/[id]`, `/groups/[id]`, `/stages/[id]`
- `/grades/[id]`, `/results/[id]`

#### C) **FormPage** — نموذج مستقل بصفحة كاملة

**البنية:**
```
┌─────────────────────────────────────┐
│ Header (Back + Title)               │
├─────────────────────────────────────┤
│ Form Card                           │
│   - Error summary                   │
│   - Fields (vertical stack)         │
│   - FormFooter (Cancel/Save)        │
└─────────────────────────────────────┘
```

**صفحات تستخدم الـ pattern:**
- `/settings/profile`, `/settings/security`, `/settings/tenant`
- `/attendance/new`, `/request-demo`, `/login`

**ملاحظة:** Forms اللي بتظهر في modal (`QuickCreateModal`) مش محتاجة `FormPage` — بتستخدم `FormFooter` جوه الـ modal.

---

## 📊 أنماط الجداول

### الجدول القياسي

```tsx
<div className="overflow-x-auto card">
  <table className="w-full text-sm">
    <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
      <tr>
        <th className="px-4 py-3 font-medium text-start">الاسم</th>
        <th className="px-4 py-3 font-medium text-start">البريد</th>
        <th className="w-12 px-2 py-3" aria-label="actions" />
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-line last:border-0 hover:bg-ink-50/30">
        <td className="px-4 py-3 font-medium text-ink">...</td>
        <td className="px-4 py-3 text-ink-400">...</td>
        <td className="px-2 py-3 text-end">
          <ActionMenu items={...} />
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### القواعد
- **دائمًا** `text-start` على الـ th/td
- **دائمًا** `last:border-0` على الـ tr
- **دائمًا** `hover:bg-ink-50/30`
- **دائمًا** `overflow-x-auto` على الـ wrapper (لو ممكن يفيض)
- **دائمًا** `aria-label` على عمود الإجراءات

### عند الحاجة لـ responsive
استخدم `hidden md:table` للجدول + `md:hidden` لـ card list.

---

## 🎭 Empty / Error / Loading States

### Empty State

```tsx
<EmptyState
  icon="📭"
  title="لا توجد بيانات"
  description="ابدأ بإضافة أول عنصر"
  action={<Button>+ إضافة</Button>}
/>
```

**القواعد:**
- **دائمًا** `icon` (إيموجي)
- **دائمًا** `title` و `description`
- `action` **موصى به** — الزر بيحوّل الـ empty state لمنصة عمل
- لو السبب "فلتر": `title="لا توجد نتائج"` + `action={<Button variant="ghost" onClick={clearFilters}>مسح الفلاتر</Button>}`

### Error State

```tsx
<ErrorState
  message="تعذّر تحميل البيانات."
  onRetry={() => refetch()}
/>
```

**القاعدة:** `onRetry` **إجباري** — أي error لازم يكون له "إعادة المحاولة".

### Loading

**اختر حسب السياق:**

| السياق | استخدم |
|--------|--------|
| صفحة قائمة (table/cards) | `TableSkeleton` / `CardGridSkeleton` |
| صفحة تفاصيل | `Spinner` (مقبول) |
| Modal content | `Spinner` |
| زر أثناء إجراء | `<Loader />` جوه الزر |
| نصوص dynamic | `Skeleton` (شريط) |

**ممنوع:** Loading "بدون شكل" — text "جارٍ التحميل..." بس.

---

## 🌍 RTL & Arabic Rules

### الاتجاهات
- **دائمًا** استخدم `start` / `end` — **مش** `left` / `right`
  ```tsx
  // ✅
  <div className="ms-4 pe-2 text-start" />
  // ❌
  <div className="ml-4 pr-2 text-left" />
  ```

- **دائمًا** الأيقونات الاتجاهية بتعكس:
  - `→` (التالي في LTR) = `←` (التالي في RTL)
  - في الكود: `<ChevronLeft>` للـ "next" في القوائم الـ RTL

### الأرقام
- استخدم `tabular-nums` **دائمًا**
- الأرقام بالتنسيق العربي: `toLocaleDateString("ar-EG")` للتواريخ
- في الحقول (input type="number"): LTR دائمًا (`dir="ltr"`)

### النصوص
- **ممنوع** خلط عربي/إنجليزي في نفس الجملة بدون `dir`:
  ```tsx
  // ✅ صحيح
  <p>الملف: <span dir="ltr">{filename}</span></p>
  ```

### الحروف الخاصة
- **دائمًا** أضف `&quot;` بدل `"` في JSX (بتتفادى warning)
- أو استخدم `{"\u201C"}` — علامات تنصيص ذكية

---

## 🌓 Dark Mode

### القواعد الذهبية

1. **استخدم tokens فقط** — لا `dark:bg-*` مباشرة
   ```tsx
   // ✅
   <div className="bg-paper-elevated text-ink border-line">
   // ❌
   <div className="bg-white text-black border-gray-200 dark:bg-gray-900 dark:text-white">
   ```

2. **استخدم `bg-paper-elevated` بدلًا من `bg-white`**
   التوكن نفسه يبدّل لونه بين الوضعين عبر متغيرات `globals.css`.

3. **`bg-ink-50` للخلفيات الباهتة والـ hovers** — درجات `ink-50..700` تتكيف مع الوضع الحالي.

4. **الألوان الدلالية (success, danger, accent) ثابتة في الوضعين** — لا `dark:text-success-light` إلا لو في مشكلة تباين فعلية.

5. **الصور والأيقونات الملونة**: استخدم `opacity-90` على الأقل في dark mode لو مش متباينة.

### اختبار سريع
افتح أي صفحة، بدّل الوضع من الـ theme toggle، واختبر:
- [ ] كل النصوص مقروءة (contrast > 4.5:1)
- [ ] الحدود واضحة
- [ ] الأزرار واضحة
- [ ] Loading/Empty states مقروءة
- [ ] Hover states بتشتغل

---

## ♿ Accessibility

### Checklist إجباري لكل component

- [ ] **Buttons:** `aria-label` لو مفيش نص مرئي (زي `⋮` menu)
- [ ] **Forms:** كل `<input>` له `<label>` مربوط بـ `htmlFor` + `id`
- [ ] **Required fields:** `aria-required="true"`
- [ ] **Errors:** `aria-invalid="true"` + `role="alert"` على نص الخطأ
- [ ] **Icons:** `aria-hidden="true"` (إلا لو بتضيف معنى)
- [ ] **Interactive divs:** لو `onClick` → استخدم `<button>`، مش `<div>`
- [ ] **Focus:** visible focus ring دائمًا (لا `outline-none` بدون بديل)
- [ ] **Loading:** `role="status"` + `aria-label="جارٍ التحميل"`
- [ ] **Modals:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- [ ] **Contrast:** 4.5:1 للنصوص العادية، 3:1 للكبيرة (18px+)

### Keyboard Navigation
- كل action مهم → لازم تشتغل بالكيبورد
- `Tab` → عناصر تفاعلية فقط (مش divs)
- `Esc` → يقفل modals/menus
- `Enter` → ينفذ الـ action

---

## 🚫 ممنوعات (Don'ts)

### ❌ لا تفعل

| ممنوع | السبب | البديل |
|-------|------|--------|
| `alert()` / `confirm()` / `prompt()` | مش قابل للتنسيق، مش موحد | `toast`, `ConfirmDialog` |
| `text-green-600`, `bg-red-100` | مش من الـ design tokens | `text-success`, `bg-danger/10` |
| `style={{ color: "#..." }}` | inline styles | Tailwind classes |
| `p-7`, `p-9`, `m-11` | مش من الـ scale | `p-6`, `p-8`, `m-10` |
| `rounded-md` (4px) | صغير جدًا في هذا المشروع | `rounded-lg` (8px) |
| `text-black` / `bg-white` مباشرة | يكسر الـ dark mode | `text-ink` / `bg-paper-elevated` |
| `ml-*`, `mr-*`, `pl-*`, `pr-*` | يكسر الـ RTL | `ms-*`, `me-*`, `ps-*`, `pe-*` |
| `outline-none` بدون بديل | يكسر accessibility | `focus:ring-2 focus:ring-ink/10` |
| `text-[11px]`, `w-[247px]` | arbitrary values | استخدم الـ scale |
| صفحة بدون `PageHeader` / `PageShell` | inconsistency | استخدم template |
| نموذج بدون `FormFooter` | inconsistent buttons | استخدم `FormFooter` |
| Custom loading (نص "loading...") | مش موحد | `Spinner`, `Skeleton` |

### ❌ لا تفعل — أمثلة عملية

```tsx
// ❌ صيغة قديمة
alert("تم الحفظ");
if (!confirm("متأكد؟")) return;

// ✅ صيغة موحدة
toastSuccess("تم الحفظ");
<ConfirmDialog ... />

// ❌ لون مباشر
<span className="text-green-600">✓</span>

// ✅ token
<span className="text-success">✓</span>

// ❌ inline style
<div style={{ padding: 20 }}>

// ✅ Tailwind
<div className="p-5">

// ❌ LTR properties
<div className="ml-4 pr-2 text-left">

// ✅ RTL
<div className="ms-4 pe-2 text-start">

// ❌ بدون feedback
<button onClick={save}>حفظ</button>

// ✅ مع feedback
<Button onClick={save} disabled={isSubmitting}>
  {isSubmitting ? <><Loader size={14} /> جارٍ الحفظ...</> : "حفظ"}
</Button>
```

---

## 📖 كيف تستخدم هذا الملف

### قبل ما تبدأ أي صفحة جديدة

1. **حدد الـ template** — ListPage / DetailPage / FormPage؟
2. **ابحث عن صفحة مشابهة** موجودة بالفعل → انسخ نمطها
3. **اتبع الـ tokens** — مفيش ألوان/مسافات/أحجام خارج الـ tokens
4. **اختبر dark mode** — بدّل الـ theme وافتح الصفحة
5. **اختبر keyboard** — `Tab` وصل للـ actions
6. **شغّل axe devtools** — مفيش violations critical

### قبل ما تعمل أي PR

- [ ] الصفحة تستخدم `PageShell` أو `PageHeader`
- [ ] كل form يستخدم `Input` / `Select` / `Textarea` (مش raw HTML)
- [ ] كل action يستخدم `Button` (مش raw `<button>`)
- [ ] Empty / Error / Loading states موحدة
- [ ] مفيش `text-green-*` أو `bg-white` في الكود
- [ ] مفيش `ml-*` أو `mr-*`
- [ ] dark mode شغال
- [ ] `npm run lint` و `npx tsc --noEmit` نضاف

---

## 📝 التغييرات المستقبلية

كل تعديل على الملف ده:
1. ضيفه في قسم **"Changelog"** تحت
2. حدّث الـ **version**
3. اعمل PR منفصل (مش مع feature)

### Changelog
- **1.0** (2026-11-10): الإصدار الأول — 3 page templates + tokens موحدة + rules صارمة