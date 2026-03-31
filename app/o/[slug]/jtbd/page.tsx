"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JTBDRedirectPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    const slug = String(params?.slug ?? "");
    if (slug) router.replace(`/o/${slug}/tasks`);
  }, [params, router]);

  return null;
}
