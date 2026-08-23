export function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text" as const, text }] };
}

export function err(e: unknown) {
  return { content: [{ type: "text" as const, text: String(e) }], isError: true as const };
}

export function resolveSite(siteUrl?: string, defaultSiteUrl?: string): string {
  const site = (siteUrl || "").trim() || (defaultSiteUrl || "").trim();
  if (!site) {
    throw new Error(
      "No site URL given. Pass site_url (e.g. 'https://example.com/' or 'sc-domain:example.com') " +
        "or set GOOGLE_SEARCH_CONSOLE_SITE_URL.",
    );
  }
  return site;
}

export function defaultDateRange(
  days = 28,
  lagDays = 3,
  nowMs: () => number = Date.now,
): { startDate: string; endDate: string } {
  const day = 24 * 60 * 60 * 1000;
  const end = new Date(nowMs() - lagDays * day);
  const start = new Date(end.getTime() - (days - 1) * day);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}
