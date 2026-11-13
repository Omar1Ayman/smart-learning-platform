"use client";

import { use } from "react";
import { Suspense } from "react";
import { AssessmentWizard } from "@/components/assessments/AssessmentWizard";
import { Spinner } from "@/components/ui/States";

export default function EditAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Spinner />}>
      <AssessmentWizard assessmentId={id} />
    </Suspense>
  );
}