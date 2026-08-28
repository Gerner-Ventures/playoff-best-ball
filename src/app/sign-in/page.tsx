import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { safeCallbackURL } from "@/lib/safe-callback-url";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const user = await getSessionUser();
  const { callbackURL: raw } = await searchParams;
  const callbackURL = safeCallbackURL(raw);
  if (user) redirect(callbackURL);
  // Mirrors the conditional socialProviders block in auth.ts.
  const socialProviders = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID),
    apple: Boolean(process.env.APPLE_CLIENT_ID),
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm callbackURL={callbackURL} socialProviders={socialProviders} />
    </main>
  );
}
