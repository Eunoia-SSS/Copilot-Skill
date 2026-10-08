import { NextResponse } from "next/server";

const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" };

export function GET() {
  return NextResponse.json({
    rules: [{ pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }],
  }, { headers: cors });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
