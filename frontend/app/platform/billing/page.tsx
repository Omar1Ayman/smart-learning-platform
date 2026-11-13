"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import {
  createPlatformPlan,
  deletePlatformPlan,
  listPlatformBillingTenants,
  listPlatformPlans,
  updatePlatformPlan,
  updatePlatformSubscription,
  type PlatformBillingTenant,
  type PlatformPlan,
  type PlatformSubscriptionStatus,
} from "@/lib/api/platformAdmin";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { toastError, toastSuccess } from "@/lib/utils/toast";

const SUBSCRIPTION_STATUSES: {
  value: Exclude<PlatformSubscriptionStatus, "IMPLICIT_FREE">;
  label: string;
}[] = [
  { value: "TRIALING", label: "تجريبي" },
  { value: "ACTIVE", label: "نشط" },
  { value: "PAST_DUE", label: "متأخر السداد" },
  { value: "PAUSED", label: "موقوف مؤقتًا" },
  { value: "CANCELED", label: "ملغي" },
];

const FEATURE_LABELS: Record<string, string> = {
  bulk_grading: "التصحيح الجماعي",
  advanced_analytics: "التحليلات المتقدمة",
  parent_portal: "بوابة ولي الأمر",
  custom_branding: "الهوية المخصصة",
  bulk_import: "الاستيراد الجماعي",
  attendance: "الحضور والغياب",
  api_access: "الوصول البرمجي",
  priority_support: "الدعم المميز",
};

interface PlanDraft {
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  is_active: boolean;
  is_public: boolean;
  display_order: string;
  max_students: string;
  max_teachers: string;
  max_storage_mb: string;
  max_assessments_per_month: string;
  features: PlatformPlan["features"];
}

function makePlanDraft(plan: PlatformPlan): PlanDraft {
  return {
    name: plan.name,
    description: plan.description,
    price_monthly: plan.price_monthly,
    price_yearly: plan.price_yearly,
    is_active: plan.is_active,
    is_public: plan.is_public,
    display_order: String(plan.display_order),
    max_students: plan.max_students === null ? "" : String(plan.max_students),
    max_teachers: plan.max_teachers === null ? "" : String(plan.max_teachers),
    max_storage_mb:
      plan.max_storage_mb === null ? "" : String(plan.max_storage_mb),
    max_assessments_per_month:
      plan.max_assessments_per_month === null
        ? ""
        : String(plan.max_assessments_per_month),
    features: { ...plan.features },
  };
}

function numberOrNull(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function NewPlanCard({
  onCreate,
}: {
  onCreate: (input: Omit<PlatformPlan, "id">) => Promise<PlatformPlan>;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("0");
  const [yearlyPrice, setYearlyPrice] = useState("0");
  const [displayOrder, setDisplayOrder] = useState("100");
  const [features, setFeatures] = useState<PlatformPlan["features"]>({});
  const [saving, setSaving] = useState(false);
  const prices = [
    { label: "شهري", value: monthlyPrice, onChange: setMonthlyPrice },
    { label: "سنوي", value: yearlyPrice, onChange: setYearlyPrice },
  ];

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate({
        key: key.trim(),
        name: name.trim(),
        description: description.trim(),
        price_monthly: monthlyPrice,
        price_yearly: yearlyPrice,
        currency: "EGP",
        is_active: true,
        is_public: true,
        display_order: Number(displayOrder || 0),
        max_students: null,
        max_teachers: null,
        max_storage_mb: null,
        max_assessments_per_month: null,
        features,
      });
      setKey("");
      setName("");
      setDescription("");
      setMonthlyPrice("0");
      setYearlyPrice("0");
      setDisplayOrder("100");
      setFeatures({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={create} className="card flex flex-col gap-3 p-4">
      <h3 className="font-display font-bold text-ink">إضافة باقة</h3>
      <label className="flex flex-col gap-1 text-xs text-ink-700">
        المعرّف (بالإنجليزية)
        <input
          required
          minLength={2}
          pattern="[a-z0-9-]+"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-700">
        اسم الباقة
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-700">
        وصف مختصر
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {prices.map(({ label, value, onChange }) => (
          <label
            key={label}
            className="flex flex-col gap-1 text-xs text-ink-700"
          >
            {label} (EGP)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-700">
        ترتيب العرض
        <input
          type="number"
          min="0"
          value={displayOrder}
          onChange={(event) => setDisplayOrder(event.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
          <label key={feature} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={features[feature] ?? false}
              onChange={(event) =>
                setFeatures({ ...features, [feature]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <Button type="submit" disabled={saving || !name.trim()}>
        {saving ? "جارٍ الإنشاء..." : "إنشاء الباقة"}
      </Button>
    </form>
  );
}

function PlanCard({
  plan,
  onSave,
  onToggleActive,
  onDelete,
  toggling,
  deleting,
}: {
  plan: PlatformPlan;
  onSave: (
    id: string,
    input: Partial<Omit<PlatformPlan, "id">>,
  ) => Promise<PlatformPlan>;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [draft, setDraft] = useState(() => makePlanDraft(plan));
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof PlanDraft>(field: K, value: PlanDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const updatedPlan = await onSave(plan.id, {
        name: draft.name,
        description: draft.description,
        price_monthly: draft.price_monthly,
        price_yearly: draft.price_yearly,
        is_active: draft.is_active,
        is_public: draft.is_public,
        display_order: Number(draft.display_order || 0),
        max_students: numberOrNull(draft.max_students),
        max_teachers: numberOrNull(draft.max_teachers),
        max_storage_mb: numberOrNull(draft.max_storage_mb),
        max_assessments_per_month: numberOrNull(
          draft.max_assessments_per_month,
        ),
        features: draft.features,
      });
      setDraft(makePlanDraft(updatedPlan));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-ink">{plan.name}</h3>
          <p className="mt-0.5 font-mono text-xs text-ink-400">{plan.key}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
              plan.is_active
                ? "bg-success/10 text-success"
                : "bg-ink-50 text-ink-400"
            }`}
          >
            {plan.is_active ? "متاحة للتعيين" : "متوقفة"}
          </span>
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
              plan.is_public
                ? "bg-blue-100 text-blue-700"
                : "bg-ink-50 text-ink-400"
            }`}
          >
            {plan.is_public ? "منشورة" : "مخفية"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-ink-50/60 p-3 text-sm">
        <p>
          شهريًا:{" "}
          <strong className="text-ink">
            {Number(plan.price_monthly).toLocaleString("ar-EG")} {plan.currency}
          </strong>
        </p>
        <p>
          سنويًا:{" "}
          <strong className="text-ink">
            {Number(plan.price_yearly).toLocaleString("ar-EG")} {plan.currency}
          </strong>
        </p>
      </div>

      {!editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setDraft(makePlanDraft(plan));
                setEditing(true);
              }}
            >
              تعديل الباقة
            </Button>
            {plan.key !== "free" && (
              <Button
                variant={plan.is_active ? "danger" : "primary"}
                disabled={toggling}
                onClick={() =>
                  plan.is_active
                    ? setDeactivateConfirmOpen(true)
                    : onToggleActive(plan.id, true)
                }
              >
                {toggling
                  ? "جارٍ التحديث..."
                  : plan.is_active
                    ? "إيقاف الباقة"
                    : "إعادة التفعيل"}
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-5 text-ink-400">
            {plan.key === "free"
              ? "الباقة المجانية افتراضية للمؤسسات دون اشتراك؛ لا يمكن إيقافها، لكن يمكن إخفاؤها من صفحة الأسعار."
              : "الباقة المتوقفة لا تظهر في الأسعار ولا يمكن تعيينها لمؤسسات جديدة. إعادة تفعيلها تُظهرها مجددًا إذا كانت منشورة."}
          </p>
          {plan.key !== "free" && (
            <Button
              variant="ghost"
              size="sm"
              className="self-end text-danger"
              disabled={deleting}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              حذف نهائي
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <label className="flex flex-col gap-1 text-xs text-ink-700">
            اسم الباقة
            <input
              value={draft.name}
              onChange={(event) => setField("name", event.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-700">
            وصف مختصر
            <input
              value={draft.description}
              onChange={(event) => setField("description", event.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink-700">
              شهري ({plan.currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price_monthly}
                onChange={(event) =>
                  setField("price_monthly", event.target.value)
                }
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-700">
              سنوي ({plan.currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price_yearly}
                onChange={(event) =>
                  setField("price_yearly", event.target.value)
                }
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink-700">
              ترتيب العرض
              <input
                type="number"
                min="0"
                value={draft.display_order}
                onChange={(event) =>
                  setField("display_order", event.target.value)
                }
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
            </label>
            {(
              [
                ["max_students", "الطلاب"],
                ["max_teachers", "المعلمون"],
                ["max_storage_mb", "التخزين MB"],
                ["max_assessments_per_month", "الامتحانات شهريًا"],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="flex flex-col gap-1 text-xs text-ink-700"
              >
                {label}
                <input
                  type="number"
                  min="0"
                  placeholder="بلا حد"
                  value={draft[field]}
                  onChange={(event) => setField(field, event.target.value)}
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                disabled={plan.key === "free"}
                onChange={(event) => setField("is_active", event.target.checked)}
              />
              متاحة للتعيين
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_public}
                onChange={(event) => setField("is_public", event.target.checked)}
              />
              ظاهرة في صفحة الأسعار
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(FEATURE_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.features[key] ?? false}
                  onChange={(event) =>
                    setField("features", {
                      ...draft.features,
                      [key]: event.target.checked,
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={saving || !draft.name.trim()}
              onClick={() => void save()}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ الباقة"}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setDraft(makePlanDraft(plan));
                setEditing(false);
              }}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deactivateConfirmOpen}
        title="إيقاف الباقة؟"
        description="ستختفي من صفحة الأسعار ولن يمكن تعيينها لمؤسسة جديدة. الاشتراكات الحالية ستظل على باقتها. يمكنك إعادة تفعيلها لاحقًا."
        confirmLabel="إيقاف الباقة"
        onConfirm={() => {
          onToggleActive(plan.id, false);
          setDeactivateConfirmOpen(false);
        }}
        onCancel={() => setDeactivateConfirmOpen(false)}
        isPending={toggling}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="حذف الباقة؟"
        description="سيؤدي ذلك إلى إزالتها نهائيًا من الكتالوج. إذا كانت مرتبطة باشتراك قائم، سيمنع الخادم الحذف؛ يمكنك بدلًا من ذلك إخفاؤها أو إيقاف إتاحتها."
        confirmLabel="حذف الباقة"
        onConfirm={() => {
          onDelete(plan.id);
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
        isPending={deleting}
      />
    </article>
  );
}

function subscriptionStatusLabel(status: PlatformSubscriptionStatus) {
  return (
    SUBSCRIPTION_STATUSES.find((item) => item.value === status)?.label ??
    "مجاني ضمني"
  );
}

export default function PlatformBillingPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        plan_key: string;
        status: Exclude<PlatformSubscriptionStatus, "IMPLICIT_FREE">;
        trial_days: string;
      }
    >
  >({});

  const plansQuery = useQuery({
    queryKey: ["platform-billing-plans"],
    queryFn: listPlatformPlans,
  });
  const tenantsQuery = useQuery({
    queryKey: ["platform-billing-tenants", page, debouncedSearch],
    queryFn: () =>
      listPlatformBillingTenants({
        page,
        search: debouncedSearch || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const planMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Omit<PlatformPlan, "id">>;
    }) => updatePlatformPlan(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-billing-plans"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "public-plans"] });
      toastSuccess("تم تحديث الباقة");
    },
    onError: (error) => toastError(error, "تعذّر تحديث الباقة."),
  });

  const createPlanMutation = useMutation({
    mutationFn: createPlatformPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-billing-plans"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "public-plans"] });
      toastSuccess("تم إنشاء الباقة");
    },
    onError: (error) => toastError(error, "تعذّر إنشاء الباقة."),
  });

  const deletePlanMutation = useMutation({
    mutationFn: deletePlatformPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-billing-plans"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "public-plans"] });
      toastSuccess("تم حذف الباقة");
    },
    onError: (error) => toastError(error, "تعذّر حذف الباقة."),
  });

  const subscriptionMutation = useMutation({
    mutationFn: ({
      tenantId,
      input,
    }: {
      tenantId: string;
      input: {
        plan_key: string;
        status: Exclude<PlatformSubscriptionStatus, "IMPLICIT_FREE">;
        trial_days?: number;
      };
    }) => updatePlatformSubscription(tenantId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-billing-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["platform-metrics"] });
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.tenantId];
        return next;
      });
      toastSuccess("تم تحديث اشتراك المؤسسة");
    },
    onError: (error) => toastError(error, "تعذّر تحديث الاشتراك."),
  });

  const plans = plansQuery.data?.results ?? [];
  const tenants = tenantsQuery.data?.results ?? [];
  const activePlans = plans.filter((plan) => plan.is_active);

  function getDraft(tenant: PlatformBillingTenant) {
    return (
      drafts[tenant.id] ?? {
        plan_key: tenant.plan_key ?? "free",
        status:
          tenant.subscription_status === "IMPLICIT_FREE"
            ? "ACTIVE"
            : tenant.subscription_status,
        trial_days: "14",
      }
    );
  }

  function updateDraft(
    tenantId: string,
    patch: Partial<ReturnType<typeof getDraft>>,
  ) {
    setDrafts((current) => ({
      ...current,
      [tenantId]: {
        ...(current[tenantId] ?? {
          plan_key:
            tenants.find((tenant) => tenant.id === tenantId)?.plan_key ?? "free",
          status: "ACTIVE",
          trial_days: "14",
        }),
        ...patch,
      },
    }));
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-7">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">
          الباقات والفوترة
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          إدارة الأسعار والحدود والاشتراكات يدويًا. التحصيل الإلكتروني غير مفعّل
          بعد.
        </p>
      </header>

      <section id="plans" className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">
            كتالوج الباقات
          </h2>
          <p className="text-xs text-ink-400">
            تغيير الأسعار ينعكس على صفحة الأسعار، ولا يغيّر الاشتراكات الحالية.
          </p>
        </div>
        {plansQuery.isLoading && <Spinner />}
        {plansQuery.isError && (
          <ErrorState message="تعذّر تحميل الباقات." />
        )}
        {plans.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NewPlanCard
              onCreate={(input) => createPlanMutation.mutateAsync(input)}
            />
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSave={(id, input) =>
                  planMutation.mutateAsync({ id, input })
                }
                onToggleActive={(id, isActive) =>
                  planMutation.mutate({ id, input: { is_active: isActive } })
                }
                onDelete={(id) => deletePlanMutation.mutate(id)}
                toggling={planMutation.isPending}
                deleting={deletePlanMutation.isPending}
              />
            ))}
          </div>
        )}
        {!plansQuery.isLoading && !plansQuery.isError && plans.length === 0 && (
          <NewPlanCard
            onCreate={(input) => createPlanMutation.mutateAsync(input)}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">
              اشتراكات المؤسسات
            </h2>
            <p className="text-xs text-ink-400">
              {tenantsQuery.data?.count ?? 0} مؤسسة · تعيين الباقة يسجّل حدثًا
              إداريًا.
            </p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="ابحث باسم المؤسسة أو البريد..."
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-80"
          />
        </div>

        {tenantsQuery.isLoading && <Spinner />}
        {tenantsQuery.isError && (
          <ErrorState message="تعذّر تحميل اشتراكات المؤسسات." />
        )}
        {!tenantsQuery.isLoading && !tenantsQuery.isError && tenants.length === 0 && (
          <EmptyState
            title="لا توجد مؤسسات"
            description="ستظهر المؤسسات هنا بعد إنشائها."
          />
        )}
        {tenants.length > 0 && (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="border-b border-line bg-ink-50 text-ink-700">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">المؤسسة</th>
                    <th className="px-4 py-3 text-start font-medium">الباقة</th>
                    <th className="px-4 py-3 text-start font-medium">الحالة</th>
                    <th className="px-4 py-3 text-start font-medium">مدة التجربة</th>
                    <th className="px-4 py-3 text-end font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => {
                    const draft = getDraft(tenant);
                    return (
                      <tr
                        key={tenant.id}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{tenant.name}</p>
                          <p className="text-xs text-ink-400">
                            {tenant.contact_email || tenant.slug}
                          </p>
                          {tenant.is_implicit && (
                            <span className="text-[11px] text-ink-400">
                              دون اشتراك مدفوع
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={draft.plan_key}
                            onChange={(event) =>
                              updateDraft(tenant.id, {
                                plan_key: event.target.value,
                              })
                            }
                            className="rounded-lg border border-line bg-white px-2 py-1.5"
                          >
                            {activePlans.map((plan) => (
                              <option key={plan.id} value={plan.key}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={draft.status}
                            onChange={(event) =>
                              updateDraft(tenant.id, {
                                status: event.target
                                  .value as typeof draft.status,
                              })
                            }
                            className="rounded-lg border border-line bg-white px-2 py-1.5"
                          >
                            {SUBSCRIPTION_STATUSES.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {draft.status === "TRIALING" ? (
                            <label className="flex items-center gap-2 text-xs text-ink-700">
                              <input
                                type="number"
                                min="0"
                                max="365"
                                value={draft.trial_days}
                                onChange={(event) =>
                                  updateDraft(tenant.id, {
                                    trial_days: event.target.value,
                                  })
                                }
                                className="w-20 rounded-lg border border-line px-2 py-1.5"
                              />
                              يومًا
                            </label>
                          ) : (
                            <span className="text-xs text-ink-400">
                              {subscriptionStatusLabel(tenant.subscription_status)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <Button
                            variant="secondary"
                            disabled={
                              subscriptionMutation.isPending ||
                              !activePlans.some(
                                (plan) => plan.key === draft.plan_key,
                              )
                            }
                            onClick={() =>
                              subscriptionMutation.mutate({
                                tenantId: tenant.id,
                                input: {
                                  plan_key: draft.plan_key,
                                  status: draft.status,
                                  ...(draft.status === "TRIALING"
                                    ? { trial_days: Number(draft.trial_days || 14) }
                                    : {}),
                                },
                              })
                            }
                          >
                            {subscriptionMutation.isPending
                              ? "جارٍ الحفظ..."
                              : "حفظ"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-ink-400">
              <span>
                {tenantsQuery.data?.count ?? 0} مؤسسة
                {tenantsQuery.isPlaceholderData ? " · يتم التحديث..." : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={!tenantsQuery.data?.previous || tenantsQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  السابق
                </Button>
                <Button
                  variant="ghost"
                  disabled={!tenantsQuery.data?.next || tenantsQuery.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  التالي
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
