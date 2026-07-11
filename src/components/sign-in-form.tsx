"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ callbackURL = "/dashboard" }: { callbackURL?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL });
    if (error) setError(error.message ?? "Something went wrong.");
    else setSent(true);
  }

  if (sent) {
    return <p className="text-center">Check your email — we sent a sign-in link to {email}.</p>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <button
        type="button"
        onClick={async () => {
          const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
          if (error) setError(error.message ?? "Google sign-in failed.");
        }}
        className="rounded-lg border px-4 py-3 font-medium hover:bg-gray-50"
      >
        Continue with Google
      </button>
      <button
        type="button"
        onClick={async () => {
          const { error } = await authClient.signIn.social({ provider: "apple", callbackURL });
          if (error) setError(error.message ?? "Apple sign-in failed.");
        }}
        className="rounded-lg border px-4 py-3 font-medium hover:bg-gray-50"
      >
        Continue with Apple
      </button>
      <div className="text-center text-sm text-gray-500">or</div>
      <form onSubmit={sendLink} className="flex flex-col gap-2">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-lg border px-4 py-3"
        />
        <button type="submit" className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white">
          Email me a sign-in link
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
