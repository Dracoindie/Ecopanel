import { afterEach, describe, expect, it } from "vitest";
import { agoraConfig, createChannel } from "../lib/agora";

const AGORA_SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const original = process.env.AGORA_CHANNEL_PREFIX;

describe("Agora channel names", () => {
  afterEach(() => {
    if (original === undefined) delete process.env.AGORA_CHANNEL_PREFIX; else process.env.AGORA_CHANNEL_PREFIX = original;
  });

  it("uses a valid configured prefix", () => {
    process.env.AGORA_CHANNEL_PREFIX = "acme_live";
    const channel = createChannel("cmvqp9kiz0006uwwc4wna87ra");
    expect(channel).toMatch(/^acme_live-cmvqp9kiz0006uwwc4wna87ra-[0-9a-f]{8}$/);
  });

  it.each([
    ["a URL with credentials", "postgresql://user:secret@127.0.0.1:55432/ecopanel_dev?schema=public"],
    ["a long value", "x".repeat(21)],
    ["spaces and symbols", "echo panel!"]
  ])("never reuses an invalid prefix (%s), falling back to the default", (_label, prefix) => {
    process.env.AGORA_CHANNEL_PREFIX = prefix;
    const channel = createChannel("cmvqp9kiz0006uwwc4wna87ra");

    expect(channel.startsWith("echopanel-")).toBe(true);
    expect(channel).not.toContain("secret");
    expect(channel).toMatch(AGORA_SAFE);
    expect(agoraConfig().channelPrefix).toBe("echopanel");
  });

  it("stays within Agora's 64-character limit for long interview ids", () => {
    process.env.AGORA_CHANNEL_PREFIX = "p".repeat(20);
    const channel = createChannel("a".repeat(120));
    expect(channel.length).toBeLessThanOrEqual(64);
    expect(channel).toMatch(AGORA_SAFE);
  });
});
