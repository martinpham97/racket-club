"use client";

import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { FunctionReference } from "convex/server";
import { useRouter } from "next/navigation";
import { withErrorHandlingToast } from "../utils/errorHandling";

export function useAuthenticatedMutation<Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation,
  options?: { allowNoProfile?: boolean },
) {
  const router = useRouter();
  const currentUser = useQuery(api.service.users.functions.getCurrentUser);
  const runMutation = useMutation(mutation);

  const baseMutation = async (...args: Parameters<typeof runMutation>) => {
    if (!currentUser) {
      const currentPath = window.location.pathname;
      router.push(`/signin?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (!options?.allowNoProfile && !currentUser.profile) {
      const currentPath = window.location.pathname;
      router.push(`/profile?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    return await runMutation(...args);
  };

  return withErrorHandlingToast(baseMutation);
}
