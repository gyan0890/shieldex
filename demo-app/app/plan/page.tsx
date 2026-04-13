"use client";

import { Suspense } from "react";
import PlanDashboard from "./PlanDashboard";

export default function PlanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    }>
      <PlanDashboard />
    </Suspense>
  );
}
