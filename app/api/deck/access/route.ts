import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { token } = await req.json();
  const expected = process.env.DECK_ACCESS_TOKEN;

  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("deck_access", expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return res;
}
