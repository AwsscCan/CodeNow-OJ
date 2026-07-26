"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "../lib/auth-client";

export function InvitationPasswordGate() {
  const session = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();
  const mustChangePassword = (session.data?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword === true;

  useEffect(() => {
    if (!session.isPending && mustChangePassword && pathname !== "/change-temporary-password") {
      router.replace("/change-temporary-password");
    }
  }, [mustChangePassword, pathname, router, session.isPending]);

  return null;
}

