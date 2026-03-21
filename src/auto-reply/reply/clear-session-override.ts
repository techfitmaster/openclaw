/**
 * Utility for clearing session model/provider overrides when they match the
 * current config default. This allows users to change the default model in
 * openclaw.json and have it take effect on restart, while preserving explicit
 * user-set overrides that differ from the current config.
 *
 * Extracted from get-reply.ts to enable direct unit testing (#44611).
 */

import { updateSessionStore, type SessionEntry } from "../../config/sessions.js";

export async function clearSessionOverrideIfMatchesDefault(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  defaultProvider: string;
  defaultModel: string;
}): Promise<boolean> {
  const { sessionEntry, sessionStore, sessionKey, storePath, defaultProvider, defaultModel } =
    params;

  if (!sessionEntry || !sessionStore || !sessionKey || !storePath) {
    return false;
  }

  const shouldCheckOverride = Boolean(
    sessionEntry.modelOverride?.trim() || sessionEntry.providerOverride?.trim(),
  );

  if (!shouldCheckOverride) {
    return false;
  }

  const sessionProvider = sessionEntry.providerOverride?.trim() || defaultProvider;
  const sessionModel = sessionEntry.modelOverride?.trim();

  // Case 1: Both model and provider overrides are set and both match the defaults.
  if (sessionModel && sessionProvider === defaultProvider && sessionModel === defaultModel) {
    delete sessionEntry.providerOverride;
    delete sessionEntry.modelOverride;
    sessionEntry.updatedAt = Date.now();

    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = sessionEntry;
    });

    return true;
  }

  // Case 2: Only providerOverride is set (no modelOverride) and it matches the default.
  // Without this path the provider-only override is never cleared because the condition
  // above requires sessionModel to be truthy.
  if (!sessionModel && sessionProvider === defaultProvider) {
    delete sessionEntry.providerOverride;
    sessionEntry.updatedAt = Date.now();

    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = sessionEntry;
    });

    return true;
  }

  return false;
}
