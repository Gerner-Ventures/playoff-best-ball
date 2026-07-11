"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AppNav({ userName }: { userName: string }) {
  const router = useRouter();
  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <Link href="/dashboard" className="font-bold">
        Playoff Best Ball
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">{userName}</span>
        <button
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
            router.push("/");
          }}
          className="text-gray-500 hover:underline"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
