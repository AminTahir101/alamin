// middleware.ts — root of project
// Works with Next.js 14+ App Router, no deprecated APIs

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /deck routes (not /deck/gate or /api/deck)
  if (
    pathname.startsWith("/deck") &&
    !pathname.startsWith("/deck/gate") &&
    !pathname.startsWith("/api/deck")
  ) {
    // Read cookie directly from request — no next/headers needed
    const token = req.cookies.get("deck_access")?.value;

    if (token !== process.env.DECK_ACCESS_TOKEN) {
      const url = req.nextUrl.clone();
      url.pathname = "/deck/gate";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on these paths
  matcher: ["/deck/:path*"],
};