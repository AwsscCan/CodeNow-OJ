import { describe, expect, it } from "vitest";
import { parseCcSwitchExport } from "../../app/server/ai/ccswitch-import";

describe("CCSwitch provider import", () => {
  it("imports the active Codex provider and keeps models provider-scoped", () => {
    const result = parseCcSwitchExport({
      codex: {
        current: "codex-current",
        providers: {
          "codex-current": { name: "Gateway", settingsConfig: { auth: { OPENAI_API_KEY: "codex-secret" }, config: 'model = "gpt-5.6-sol"\nmodel_provider = "custom"\n[model_providers.custom]\nbase_url = "https://codex.example/v1"\nwire_api = "responses"' } },
          other: { name: "Other", settingsConfig: { auth: { OPENAI_API_KEY: "other-secret" }, config: 'model = "other-model"\nmodel_provider = "other"\n[model_providers.other]\nbase_url = "https://other.example/v1"' } },
        },
      },
    });

    expect(result).toMatchObject({ provider: "ccswitch", endpoint: "https://codex.example/v1", model: "gpt-5.6-sol", apiKey: "codex-secret", source: "ccswitch" });
    expect(result.models).toEqual(["gpt-5.6-sol"]);
    expect(JSON.stringify(result)).not.toContain("other-secret");
  });

  it("imports a Claude-style exported provider", () => {
    const result = parseCcSwitchExport({
      providers: [{ id: "claude-current", app_type: "claude", is_current: 1, settings_config: JSON.stringify({ env: {
        ANTHROPIC_BASE_URL: "https://relay.example/v1", ANTHROPIC_AUTH_TOKEN: "relay-secret", ANTHROPIC_MODEL: "claude-sonnet",
      } }) }],
    });
    expect(result).toMatchObject({ endpoint: "https://relay.example/v1", model: "claude-sonnet", apiKey: "relay-secret", source: "ccswitch" });
  });

  it("rejects exports without an active usable provider", () => {
    expect(() => parseCcSwitchExport({ providers: [] })).toThrow(/CCSwitch/);
  });
});
