"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

export default function Home() {
  const router = useRouter();
  const session = authClient.useSession();

  useEffect(() => {
    if (session.isPending) {
      return;
    }
    router.replace(session.data?.user ? "/kitchens" : "/login");
  }, [router, session.data?.user, session.isPending]);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#F9FAFB] p-6 text-sm text-gray-500">
      Ładowanie…
    </div>
  );
}
