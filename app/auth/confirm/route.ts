import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "email" | "signup" | "invite" | "magiclink" | "email_change",
      token_hash,
    });

    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(new URL("/auth/reset-password", request.url));
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
