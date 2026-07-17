import { NextResponse } from "next/server";

import { env } from "@core/config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const res = await fetch(`${env.PUBLIC_API_URL}/status`, { cache: "no-store" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
