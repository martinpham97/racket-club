"use client";

import CenterCard from "@/components/CenterCard";
import { ProfileForm } from "@/components/ProfileForm";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { UserProfileInput } from "@/convex/schemas/users";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAuthenticatedMutation } from "../hooks/useAuthenticatedMutation";

export default function NewProfile() {
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get("redirect") || "/";
  const createProfile = useAuthenticatedMutation(api.functions.users.createUserProfile, {
    noProfile: true,
  });

  async function onSubmit(values: UserProfileInput) {
    await createProfile(values);
    router.push(redirect);
  }

  useEffect(() => {
    if (currentUser?.profile) {
      router.push("/");
    }
  }, [currentUser, router]);

  return (
    currentUser &&
    !currentUser.profile && (
      <CenterCard title="Profile" description="Create a new profile to continue">
        <div className="grid gap-4">
          <ProfileForm formId="new-profile-form" onSubmit={onSubmit} />
          <Button type="submit" form="new-profile-form">
            Create Profile
          </Button>
        </div>
      </CenterCard>
    )
  );
}
