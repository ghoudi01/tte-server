import { HttpException, HttpStatus } from "@nestjs/common";
import { TRPCError } from "@trpc/server";

function trpcCodeFromHttpStatus(status: number): TRPCError["code"] {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.PRECONDITION_FAILED:
      return "PRECONDITION_FAILED";
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return "PAYLOAD_TOO_LARGE";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "UNPROCESSABLE_CONTENT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "TOO_MANY_REQUESTS";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

export function rethrowAsTrpcError(error: unknown): never {
  if (error instanceof TRPCError) {
    throw error;
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    throw new TRPCError({
      code: trpcCodeFromHttpStatus(status),
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof Error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected error",
  });
}
