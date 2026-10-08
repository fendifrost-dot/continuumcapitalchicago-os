const ALLOWED_ORIGINS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/continuumcapitalchicago\.com$/,
  /^https:\/\/www\.continuumcapitalchicago\.com$/,
  /^http:\/\/localhost:\d+$/,
];

export function appOrigin(req: Request): string | null {
  const origin = req.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))) return origin;
  const configured = Deno.env.get("APP_URL") ?? "";
  if (ALLOWED_ORIGINS.some((pattern) => pattern.test(configured))) return configured;
  return null;
}
