// lib/server/aggregations.ts

export type KPIAggregateInput = {
  id?: string;
  department_id?: string | null;
  owner_user_id?: string | null;
  weight?: number | null;
  progress_score?: number | null;
};

export type DepartmentHealthSummary = {
  score: number;
  label: "No data" | "On track" | "At risk" | "Off track";
};

export type UserWorkSummary = {
  userId: string;
  count: number;
  totalScore: number;
  avgScore: number;
};

export type DepartmentRiskSummary = {
  departmentId: string;
  total: number;
  risk: number;
  riskRatio: number;
};

function safeNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getWeight(kpi: KPIAggregateInput) {
  const w = safeNumber(kpi.weight, 1);
  return w > 0 ? w : 1;
}

function getProgress(kpi: KPIAggregateInput) {
  return safeNumber(kpi.progress_score, 0);
}

export function computeObjectiveProgress(kpis: KPIAggregateInput[]): number {
  if (!kpis.length) return 0;

  const totalWeight = kpis.reduce((sum, k) => sum + getWeight(k), 0);
  if (totalWeight === 0) return 0;

  const weighted = kpis.reduce(
    (sum, k) => sum + getProgress(k) * getWeight(k),
    0
  );

  return Math.round(weighted / totalWeight);
}

export function computeDepartmentHealth(
  kpis: KPIAggregateInput[]
): DepartmentHealthSummary {
  if (!kpis.length) {
    return { score: 0, label: "No data" };
  }

  const avg =
    kpis.reduce((sum, k) => sum + getProgress(k), 0) / kpis.length;

  return {
    score: Math.round(avg),
    label:
      avg >= 80 ? "On track" :
      avg >= 60 ? "At risk" :
      "Off track",
  };
}

export function computeUserSummary(
  kpis: KPIAggregateInput[]
): UserWorkSummary[] {
  const map = new Map<
    string,
    { userId: string; count: number; totalScore: number }
  >();

  for (const k of kpis) {
    const key = k.owner_user_id ?? "unassigned";

    if (!map.has(key)) {
      map.set(key, {
        userId: key,
        count: 0,
        totalScore: 0,
      });
    }

    const row = map.get(key)!;
    row.count += 1;
    row.totalScore += getProgress(k);
  }

  return Array.from(map.values()).map((u) => ({
    ...u,
    avgScore: u.count ? Math.round(u.totalScore / u.count) : 0,
  }));
}

export function computeRisk(
  kpis: KPIAggregateInput[]
): DepartmentRiskSummary[] {
  const map = new Map<
    string,
    { departmentId: string; total: number; risk: number }
  >();

  for (const k of kpis) {
    const dept = k.department_id ?? "no_dept";

    if (!map.has(dept)) {
      map.set(dept, {
        departmentId: dept,
        total: 0,
        risk: 0,
      });
    }

    const row = map.get(dept)!;
    row.total += 1;

    if (getProgress(k) < 60) {
      row.risk += 1;
    }
  }

  return Array.from(map.values()).map((d) => ({
    ...d,
    riskRatio: d.total ? Math.round((d.risk / d.total) * 100) : 0,
  }));
}