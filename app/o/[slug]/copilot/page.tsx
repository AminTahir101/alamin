"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CopilotRedirectPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    const slug = String(params?.slug ?? "").trim();
    if (slug) {
      router.replace(`/o/${slug}/your-ai`);
    }
  }, [params, router]);

  return null;
}