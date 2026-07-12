// Platform operators (us), NOT league commissioners. Comma-separated emails.
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdmin(user: { email: string } | null): boolean {
  return user !== null && adminEmails.has(user.email.toLowerCase());
}
