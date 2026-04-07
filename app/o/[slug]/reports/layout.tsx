import type { ReactNode } from "react";
import PageGuard from "@/components/billing/PageGuard";

export default async function ReportsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PageGuard slug={slug} feature="reports">
      {children}
    </PageGuard>
  );
}