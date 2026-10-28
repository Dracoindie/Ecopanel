import { NextResponse, type NextRequest } from "next/server";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function middleware(request: NextRequest) {
  const incoming = request.headers.get("x-request-id")?.trim();
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"]
};
