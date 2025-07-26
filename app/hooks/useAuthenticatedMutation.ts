import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { FunctionReference } from "convex/server";
import { useRouter } from "next/navigation";

export function useAuthenticatedMutation<Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation,
  options?: { noProfile?: boolean },
) {
  const router = useRouter();
  const currentUser = useQuery(api.functions.users.getCurrentUser);

  const runMutation = useMutation(mutation);

  return async (...args: Parameters<typeof runMutation>) => {
    if (!currentUser) {
      const currentPath = window.location.pathname;
      router.push(`/signin?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }
    if (!options?.noProfile && !currentUser.profile) {
      const currentPath = window.location.pathname;
      router.push(`/new-profile?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }
    return await runMutation(...args);
  };
}
