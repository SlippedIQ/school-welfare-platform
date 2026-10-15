import { NextResponse } from 'next/server';
import type { z } from 'zod';

/** Standard error envelope returned by every API route. */
export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Standard success envelope returned by every API route. */
export function jsonOk<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data: payload }, { status });
}

type Parsed<Schema extends z.ZodType> =
  | { data: z.infer<Schema>; error?: undefined }
  | { data?: undefined; error: NextResponse };

/** Parses a JSON body against a schema, returning a ready-made error response. */
export async function parseBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<Parsed<Schema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: jsonError('Request body must be valid JSON', 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join('.');
    return { error: jsonError(path ? `${path}: ${first.message}` : first.message, 422) };
  }
  return { data: result.data };
}

type PrismaKnownError = { code?: string; meta?: { target?: unknown } };

/**
 * Maps Prisma constraint violations to actionable HTTP responses and rethrows
 * anything unexpected so it surfaces as a 500 with a server log entry.
 */
export function prismaErrorResponse(error: unknown): NextResponse {
  const prismaError = error as PrismaKnownError;

  if (prismaError?.code === 'P2002') {
    const target = Array.isArray(prismaError.meta?.target)
      ? (prismaError.meta?.target as string[]).join(', ')
      : 'field';
    return jsonError(`A record with this ${target} already exists`, 409);
  }

  if (prismaError?.code === 'P2003' || prismaError?.code === 'P2014') {
    return jsonError(
      'This record is still referenced by other data. Reassign or remove dependent records first.',
      409,
    );
  }

  if (prismaError?.code === 'P2025') {
    return jsonError('Record not found', 404);
  }

  console.error('[api] unhandled database error:', error);
  return jsonError('Internal server error', 500);
}
