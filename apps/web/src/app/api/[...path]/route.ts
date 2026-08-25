import type { NextRequest } from "next/server";

import { proxyToApi } from "@/lib/api-proxy";

async function proxy(request: NextRequest): Promise<Response> {
  return proxyToApi(request);
}

export function GET(request: NextRequest) {
  return proxy(request);
}

export function POST(request: NextRequest) {
  return proxy(request);
}

export function PATCH(request: NextRequest) {
  return proxy(request);
}

export function PUT(request: NextRequest) {
  return proxy(request);
}

export function DELETE(request: NextRequest) {
  return proxy(request);
}

export function OPTIONS(request: NextRequest) {
  return proxy(request);
}
