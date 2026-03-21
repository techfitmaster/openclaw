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
import { clearSessionOverrideIfMatchesDefault } from "./clear-session-override.js";

describe("clearSessionOverrideIfMatchesDefault (unit test for #44611)", () => {
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
    const cleared = await clearSessionOverrideIfMatchesDefault({
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
    const cleared = await clearSessionOverrideIfMatchesDefault({
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
    const cleared = await clearSessionOverrideIfMatchesDefault({
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
    const cleared = await clearSessionOverrideIfMatchesDefault({
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
    const cleared = await clearSessionOverrideIfMatchesDefault({
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

  it("should clear when only providerOverride is set and it matches default", async () => {
    // Setup: Only provider override, no model override
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      providerOverride: "google", // No modelOverride!
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute: Default provider matches
    const cleared = await clearSessionOverrideIfMatchesDefault({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    // Verify: Provider-only override matching the default should be cleared
    expect(cleared).toBe(true);
    expect(sessionEntry.providerOverride).toBeUndefined();
  });

  it("should NOT clear when only providerOverride is set but differs from default", async () => {
    // Setup: Only provider override that doesn't match default
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionEntry: SessionEntry = {
      providerOverride: "anthropic", // Explicit user choice, different from default
      updatedAt: Date.now(),
    };
    sessionStore[sessionKey] = sessionEntry;

    await updateSessionStore(storePath, () => sessionStore);

    // Execute: Default provider is different
    const cleared = await clearSessionOverrideIfMatchesDefault({
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    // Verify: Should NOT be cleared — user explicitly chose a different provider
    expect(cleared).toBe(false);
    expect(sessionEntry.providerOverride).toBe("anthropic");
  });

  it("should handle missing sessionEntry/sessionStore gracefully", async () => {
    // Execute with missing dependencies
    const cleared1 = await clearSessionOverrideIfMatchesDefault({
      sessionEntry: undefined,
      sessionStore: {},
      sessionKey,
      storePath,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
    });

    const cleared2 = await clearSessionOverrideIfMatchesDefault({
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
