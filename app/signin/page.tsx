"use client";

import CenterCard from "@/components/CenterCard";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@heroui/button";
import { useSearchParams } from "next/navigation";
import { FaFacebookF, FaGoogle } from "react-icons/fa";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  function handleSignIn(provider: string) {
    signIn(provider, {
      redirectTo: redirect,
    });
  }

  return (
    <CenterCard
      title="Login to your account"
      description="Please login to access restricted features"
    >
      <div className="flex flex-col gap-4 sm:min-w-lg">
        <Button className="w-full" color="primary" onPress={() => void handleSignIn("facebook")}>
          <FaFacebookF size={20} />
          Login with Facebook
        </Button>
        <Button className="w-full" color="danger" onPress={() => void handleSignIn("google")}>
          <FaGoogle size={22} />
          Login with Google
        </Button>
      </div>
    </CenterCard>
  );
}
