/** Only allow same-origin relative paths as post-auth redirect targets. */
export function safeCallbackURL(url: string | undefined): string {
  if (!url) return "/dashboard";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return "/dashboard";
}
