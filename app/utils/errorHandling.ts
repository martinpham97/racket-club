"use client";

import { addToast } from "@heroui/toast";
import { ConvexError } from "convex/values";

export function withErrorHandlingToast<Fn extends (...args: any[]) => Promise<any>>(fn: Fn): Fn {
  return (async (...args: Parameters<Fn>) => {
    try {
      return await fn(...args);
    } catch (error: any) {
      const errorMessage =
        error instanceof ConvexError ? error.data : "Something went wrong. Please try again.";
      addToast({
        title: "Error",
        description: errorMessage,
        color: "danger",
        shouldShowTimeoutProgress: true,
      });
    }
  }) as Fn;
}
