"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type KPI = {
  id: string;
  title: string;
  weight: number;
  target_value: number;
  current_value: number;
  department_id: string;
  direction: "increase" | "decrease";
  is_active: boolean;
};

type Department = {
  id: string;
  name: string;
};

export default function KpisClient({
  slug,
  initialKpis,
  initialDepartments,
}: {
  slug: string;
  initialKpis: KPI[];
  initialDepartments: Department[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [kpis, setKpis] = useState<KPI[]>(initialKpis);
  const [departments] = useState<Department[]>(initialDepartments);

  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    department_id: "",
    target_value: 0,
    weight: 1,
    direction: "increase" as "increase" | "decrease",
  });

  const departmentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  async function refetchKpis() {
    setError(null);
    const res = await fetch(`/api/o/${slug}/kpis`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Failed to load KPIs");
      return;
    }
    setKpis(data.kpis || []);
  }

  async function createKPI() {
    setError(null);

    if (!form.title.trim()) return setError("Title is required");
    if (!form.department_id) return setError("Department is required");

    const res = await fetch(`/api/o/${slug}/kpis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || "Failed to create KPI");
      return;
    }

    setForm({
      title: "",
      department_id: "",
      target_value: 0,
      weight: 1,
      direction: "increase",
    });

    await refetchKpis();
    startTransition(() => router.refresh());
  }

  async function updateKpi(id: string, patch: Partial<KPI>) {
    setError(null);

    const res = await fetch(`/api/o/${slug}/kpis/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || "Failed to update KPI");
      return;
    }

    await refetchKpis();
    startTransition(() => router.refresh());
  }

  async function softDeleteKpi(id: string) {
    setError(null);

    const res = await fetch(`/api/o/${slug}/kpis/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || "Failed to delete KPI");
      return;
    }

    await refetchKpis();
    startTransition(() => router.refresh());
  }

  return (
    <div className="p-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KPI Management</h1>

        <button
          onClick={() => refetchKpis()}
          className="border px-3 py-2 rounded"
          disabled={isPending}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="border border-red-300 bg-red-50 text-red-800 p-3 rounded">
          {error}
        </div>
      ) : null}

      <div className="border p-6 rounded-lg space-y-4">
        <h2 className="font-semibold">Create KPI</h2>

        <input
          placeholder="KPI Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="border p-2 w-full rounded"
        />

        <select
          value={form.department_id}
          onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          className="border p-2 w-full rounded"
        >
          <option value="">Select Department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            placeholder="Target Value"
            value={form.target_value}
            onChange={(e) =>
              setForm({ ...form, target_value: Number(e.target.value) })
            }
            className="border p-2 w-full rounded"
          />

          <input
            type="number"
            placeholder="Weight"
            value={form.weight}
            onChange={(e) =>
              setForm({ ...form, weight: Number(e.target.value) })
            }
            className="border p-2 w-full rounded"
          />
        </div>

        <select
          value={form.direction}
          onChange={(e) =>
            setForm({
              ...form,
              direction: e.target.value as "increase" | "decrease",
            })
          }
          className="border p-2 w-full rounded"
        >
          <option value="increase">Increase</option>
          <option value="decrease">Decrease</option>
        </select>

        <button
          onClick={createKPI}
          className="bg-black text-white px-4 py-2 rounded"
          disabled={isPending}
        >
          {isPending ? "Working..." : "Create KPI"}
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">KPI</th>
              <th className="p-3 text-left">Department</th>
              <th className="p-3 text-left">Target</th>
              <th className="p-3 text-left">Weight</th>
              <th className="p-3 text-left">Direction</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {kpis.map((kpi) => (
              <tr key={kpi.id} className="border-t">
                <td className="p-3">{kpi.title}</td>
                <td className="p-3">
                  {departmentNameById.get(kpi.department_id) || "—"}
                </td>
                <td className="p-3">{kpi.target_value}</td>
                <td className="p-3">{kpi.weight}</td>
                <td className="p-3">{kpi.direction}</td>
                <td className="p-3">{kpi.is_active ? "Active" : "Inactive"}</td>

                <td className="p-3 text-right space-x-3">
                  <button
                    onClick={() =>
                      updateKpi(kpi.id, { is_active: !kpi.is_active })
                    }
                    className="text-blue-600"
                    disabled={isPending}
                  >
                    Toggle
                  </button>

                  <button
                    onClick={() => softDeleteKpi(kpi.id)}
                    className="text-red-600"
                    disabled={isPending}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {kpis.length === 0 ? (
              <tr>
                <td className="p-6 text-gray-500" colSpan={7}>
                  No KPIs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}