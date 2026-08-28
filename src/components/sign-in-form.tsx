"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Which OAuth providers auth.ts actually registered — a button for an
 * unconfigured provider 404s on /api/auth/sign-in/social, so we hide it. */
export type SocialProviders = { google: boolean; apple: boolean };

const SOCIAL = [
  { id: "google", name: "Google" },
  { id: "apple", name: "Apple" },
] as const;

export function SignInForm({
  callbackURL = "/dashboard",
  socialProviders = { google: false, apple: false },
}: {
  callbackURL?: string;
  socialProviders?: SocialProviders;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = SOCIAL.filter((p) => socialProviders[p.id]);

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
      {enabled.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={async () => {
            const { error } = await authClient.signIn.social({ provider: provider.id, callbackURL });
            if (error) setError(error.message ?? `${provider.name} sign-in failed.`);
          }}
          className="rounded-lg border px-4 py-3 font-medium hover:bg-gray-50"
        >
          Continue with {provider.name}
        </button>
      ))}
      {enabled.length > 0 && <div className="text-center text-sm text-gray-500">or</div>}
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
