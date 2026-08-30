import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
    public headers?: HeadersInit,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: error.headers });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Please check the highlighted information and try again.", code: "INVALID_INPUT", issues: error.issues },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "The server could not complete that request.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
