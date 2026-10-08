import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({
    rules: [{ pathPattern: "/api/actions/**", apiPath: `${origin}/api/actions/**` }],
  }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
}
