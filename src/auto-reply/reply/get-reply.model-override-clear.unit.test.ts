/**
 * Unit tests for session model override clearing logic (#44611)
 *
 * Tests the core logic that clears session overrides when they match
 * the current config default, without the complexity of full getReplyFromConfig.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSessionStore, updateSessionStore, type SessionEntry } from "../../config/sessions.js";

/**
 * Extracted core logic from get-reply.ts for unit testing
 */
async function clearSessionModelOverrideIfMatches(params: {
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

  if (sessionModel && sessionProvider === defaultProvider && sessionModel === defaultModel) {
    // Session override matches current default; clear it
    delete sessionEntry.providerOverride;
    delete sessionEntry.modelOverride;
    sessionEntry.updatedAt = Date.now();

    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = sessionEntry;
    });

    return true; // Cleared
  }

  return false; // Not cleared
}

describe("clearSessionModelOverrideIfMatches (unit test for #44611)", () => {
  let tempDir: string;
  let storePath: string;
  const sessionKey = "test-session";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-unit-test-"));
    storePath = path.join(tempDir, "sessions.json");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should clear override when provider and model both match default", async () => {
    // Setup
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      providerOverride: "google",
      modelOverride: "gemini-2.5-pro",
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute
    const cleared = await clearSessionModelOverrideIfMatches({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    // Verify
    expect(cleared).toBe(true);
    expect(sessionEntry.providerOverride).toBeUndefined();
    expect(sessionEntry.modelOverride).toBeUndefined();

    // Verify persistence
    const loaded = loadSessionStore(storePath);
    expect(loaded[sessionKey].providerOverride).toBeUndefined();
    expect(loaded[sessionKey].modelOverride).toBeUndefined();
  });

  it("should NOT clear when model differs from default", async () => {
    // Setup
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      providerOverride: "google",
      modelOverride: "gemini-2.5-pro",
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute (different model)
    const cleared = await clearSessionModelOverrideIfMatches({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-flash-2.0", // Different!
    });

    // Verify
    expect(cleared).toBe(false);
    expect(sessionEntry.providerOverride).toBe("google");
    expect(sessionEntry.modelOverride).toBe("gemini-2.5-pro");
  });

  it("should NOT clear when provider differs from default", async () => {
    // Setup
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-4-5",
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute (different provider)
    const cleared = await clearSessionModelOverrideIfMatches({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google", // Different!
      defaultModel: "claude-opus-4-5",
    });

    // Verify
    expect(cleared).toBe(false);
    expect(sessionEntry.providerOverride).toBe("anthropic");
    expect(sessionEntry.modelOverride).toBe("claude-opus-4-5");
  });

  it("should handle session without override gracefully", async () => {
    // Setup
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute
    const cleared = await clearSessionModelOverrideIfMatches({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    // Verify
    expect(cleared).toBe(false);
    expect(sessionEntry.providerOverride).toBeUndefined();
    expect(sessionEntry.modelOverride).toBeUndefined();
  });

  it("should clear when only modelOverride is set (provider defaults)", async () => {
    // Setup: Only model override, no provider override
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      modelOverride: "gemini-2.5-pro", // No providerOverride!
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute: Default provider matches (implicit)
    const cleared = await clearSessionModelOverrideIfMatches({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    // Verify: Should be cleared because provider defaults to defaultProvider
    expect(cleared).toBe(true);
    expect(sessionEntry.modelOverride).toBeUndefined();
  });

  it("should handle missing sessionEntry/sessionStore gracefully", async () => {
    // Execute with missing dependencies
    const cleared1 = await clearSessionModelOverrideIfMatches({
      sessionEntry: undefined,
      sessionStore: {},
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    const cleared2 = await clearSessionModelOverrideIfMatches({
      sessionEntry: {} as SessionEntry,
      sessionStore: undefined,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    // Verify: Should return false without errors
    expect(cleared1).toBe(false);
    expect(cleared2).toBe(false);
  });
});
