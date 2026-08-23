import {
  GoogleSearchConsoleClient,
  WEBMASTERS_BASE_URL,
  SEARCHCONSOLE_BASE_URL,
} from "./gsc/client.js";
import { createTokenProvider } from "./gsc/auth.js";

const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const serviceAccountKeyPath =
  (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "").trim() || undefined;
const siteUrl = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || "").trim() || undefined;
const allowDestructive = /^(1|true|yes)$/i.test(
  (process.env.GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE || "").trim(),
);

if (!serviceAccountKey?.trim() && !serviceAccountKeyPath) {
  console.error(
    "One of GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required. " +
      "Create a service account in Google Cloud Console, enable the Search Console API, download " +
      "its JSON key, and add the service account's email as a user on the property under " +
      "Search Console > Settings > Users and permissions.",
  );
  process.exit(1);
}

export const config = {
  siteUrl,
  allowDestructive,
  transport: "stdio" as const,
};

const tokenProvider = createTokenProvider({ serviceAccountKey, serviceAccountKeyPath });

export const client = new GoogleSearchConsoleClient(tokenProvider, WEBMASTERS_BASE_URL);
export const inspectionClient = new GoogleSearchConsoleClient(
  tokenProvider,
  SEARCHCONSOLE_BASE_URL,
);
