"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AppNav({ userName }: { userName: string }) {
  const router = useRouter();
  return (
    <nav className="flex items-center justify-between border-b border-chalk-line px-6 py-3">
      <Link href="/dashboard" className="chalk font-chalk text-2xl font-bold text-chalk">
        Playoff Best Ball
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/settings/notifications" className="text-chalk-dim hover:underline">Settings</Link>
        <span className="text-chalk-dim">{userName}</span>
        <button
          onClick={async () => {
            try {
              const { error } = await authClient.signOut();
              if (error) {
                window.alert("Sign out failed — please try again.");
                return;
              }
              router.refresh();
              router.push("/");
            } catch {
              window.alert("Sign out failed — please try again.");
            }
          }}
          className="text-chalk-dim hover:text-chalk hover:underline"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
