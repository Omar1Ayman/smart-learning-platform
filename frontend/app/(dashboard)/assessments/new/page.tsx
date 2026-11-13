"use client";

import { Suspense } from "react";
import { AssessmentWizard } from "@/components/assessments/AssessmentWizard";
import { Spinner } from "@/components/ui/States";

export default function NewAssessmentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AssessmentWizard />
    </Suspense>
  );
}