import { NextResponse } from "next/server";

export function successResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: true,
      data,
    },
    init,
  );
}

export function errorResponse(
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details,
    },
    { status },
  );
}

export function normalizeWalletAddress(walletAddress: string) {
  return walletAddress.trim();
}
