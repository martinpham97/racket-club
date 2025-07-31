"use client";

import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
} from "@heroui/dropdown";
import { Link } from "@heroui/link";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
} from "@heroui/navbar";
import { User } from "@heroui/user";
import { useConvexAuth, useQuery } from "convex/react";
import { Rocket } from "lucide-react";
import { usePathname } from "next/navigation";
import { Key, useState } from "react";

const NAV_LINKS = [
  {
    title: "Home",
    icon: null,
    href: "/",
  },
];

export function Header() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const currentUser = useQuery(api.service.users.functions.getCurrentUser);

  function onUserDropdownAction(key: Key) {
    if (key === "signout") {
      signOut();
    }
  }

  return (
    <Navbar
      onMenuOpenChange={setIsMenuOpen}
      isBordered
      isBlurred={false}
      classNames={{
        wrapper: "px-4",
      }}
    >
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="sm:hidden"
        />
        <NavbarBrand>
          <Link color="foreground" href="/" className="gap-2 font-bold text-inherit">
            <Rocket size={36} />
            racket-club
          </Link>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        {NAV_LINKS.map((item, index) => (
          <NavbarItem key={`${item.title}-${index}`} isActive={pathname === item.href}>
            <Link color="foreground" href={item.href} className="gap-1">
              {item.icon}
              {item.title}
            </Link>
          </NavbarItem>
        ))}
      </NavbarContent>
      <NavbarContent justify="end">
        <NavbarItem>
          {isAuthenticated ? (
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <User
                  avatarProps={{
                    isBordered: true,
                    as: "button",
                    className: "transition-transform",
                    color: "secondary",
                    name: currentUser?.profile
                      ? `${currentUser?.profile?.firstName} ${currentUser?.profile?.lastName}`
                      : undefined,
                    size: "sm",
                  }}
                  description={currentUser?.profile?.isAdmin && "Administrator"}
                  name={
                    currentUser?.profile && (
                      <p className="p-1 select-none">{`${currentUser?.profile?.firstName} ${currentUser?.profile?.lastName}`}</p>
                    )
                  }
                />
              </DropdownTrigger>
              <DropdownMenu
                aria-label="User Actions"
                variant="flat"
                onAction={onUserDropdownAction}
              >
                <DropdownSection title={`Signed in as ${currentUser?.email || "unknown"}`}>
                  <DropdownItem key="profile" href="/profile" showDivider>
                    My Profile
                  </DropdownItem>
                  <DropdownItem key="signout" color="danger" className="text-danger">
                    Sign Out
                  </DropdownItem>
                </DropdownSection>
              </DropdownMenu>
            </Dropdown>
          ) : (
            <Button as={Link} color="primary" href="/signin" variant="flat">
              Sign In
            </Button>
          )}
        </NavbarItem>
      </NavbarContent>
      <NavbarMenu>
        {NAV_LINKS.map((item, index) => (
          <NavbarMenuItem key={`${item.title}-${index}`} isActive={pathname === item.href}>
            <Link className="w-full gap-1" href={item.href} size="lg" color="foreground">
              {item.icon}
              {item.title}
            </Link>
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
  );
}
