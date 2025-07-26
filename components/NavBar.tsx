"use client";

import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { Button } from "./ui/button";

export function NavBar() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  return (
    <nav className="flex justify-end w-full shadow-sm px-4">
      <NavigationMenu>
        <NavigationMenuList className="flex gap-2">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link href="/">Home</Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            {isAuthenticated ? (
              <NavigationMenuLink asChild>
                <Button variant="ghost" onClick={() => signOut()} className="cursor-pointer">
                  Sign out
                </Button>
              </NavigationMenuLink>
            ) : (
              <NavigationMenuLink asChild>
                <Link href="/signin">Sign in</Link>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
          <NavigationMenuItem>
            <ThemeModeToggle />
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
