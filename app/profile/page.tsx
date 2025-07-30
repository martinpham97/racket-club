"use client";

import CenterCard from "@/components/CenterCard";
import { ProfileForm } from "@/components/ProfileForm";
import { api } from "@/convex/_generated/api";
import { UserProfileInput } from "@/convex/service/users/schemas";
import { Button } from "@heroui/button";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthenticatedMutation } from "../hooks/useAuthenticatedMutation";

export default function ProfilePage() {
  const currentUser = useQuery(api.service.users.functions.getCurrentUser);
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get("redirect") || "/";

  const createProfile = useAuthenticatedMutation(api.service.users.functions.createUserProfile, {
    allowNoProfile: true,
  });

  const updateProfile = useAuthenticatedMutation(api.service.users.functions.updateUserProfile);

  async function onCreateProfile(values: UserProfileInput) {
    if (currentUser) {
      await createProfile({ ...values, userId: currentUser._id });
      router.push(redirect);
    }
  }

  async function onModifyProfile(values: UserProfileInput) {
    if (currentUser) {
      await updateProfile({
        ...values,
        userId: currentUser._id,
      });
    }
  }

  const userHasProfile = !!currentUser?.profile;

  return (
    currentUser && (
      <CenterCard
        title="Profile"
        description={userHasProfile ? undefined : "Create a new profile to continue"}
      >
        <div className="grid gap-4">
          <ProfileForm
            formId="profile-form"
            onSubmit={userHasProfile ? onModifyProfile : onCreateProfile}
            defaultValues={currentUser?.profile}
          />
          <Button color="primary" type="submit" form="profile-form">
            {userHasProfile ? "Update profile" : "Create Profile"}
          </Button>
        </div>
      </CenterCard>
    )
  );
}
