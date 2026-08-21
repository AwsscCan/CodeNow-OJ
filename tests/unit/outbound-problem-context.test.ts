import { describe, expect, it, vi } from "vitest";
import {
  buildOutboundProblemContext,
  createServerKnownOfficialSampleLoader,
  createStaticAssetDocumentLoader,
  OUTBOUND_PROBLEM_CONTEXT_LIMITS,
  serializeOutboundProblemContext,
} from "../../app/lib/outbound-problem-context";

describe("outbound problem context", () => {
  it("excludes a legacy sample that is not verified by the server-known official source", async () => {
    const context = await buildOutboundProblemContext({
      id: "OFFICIAL-1",
      samples: [
        { input: "official input", output: "official output" },
        { input: "__UNTRUSTED_SAMPLE_SENTINEL__", output: "__UNTRUSTED_OUTPUT_SENTINEL__" },
      ],
    }, {
      loadOfficialSamples: async () => [{ input: "official input", output: "official output" }],
    });

    expect(context.samples).toEqual([{ input: "official input", output: "official output" }]);
  });

  it("rejects non-official provenance even when the values match an official sample", async () => {
    const official = { input: "official input", output: "official output" };
    const context = await buildOutboundProblemContext({
      id: "OFFICIAL-1",
      samples: [
        official,
        { ...official, origin: "official" },
        { ...official, origin: "generated" },
        { ...official, origin: "runner" },
        { ...official, origin: "counterexample" },
        { ...official, origin: "private" },
        { ...official, origin: "unknown" },
      ],
    }, {
      loadOfficialSamples: async () => [official],
    });

    expect(context.samples).toEqual([official, official]);
  });

  it("keeps built-in P1001 samples when legacy clients omit provenance", async () => {
    const context = await buildOutboundProblemContext({
      id: "P1001",
      samples: [
        { input: "1 2", output: "3" },
        { input: "100 -27", output: "73" },
        { input: "__UNVERIFIED_P1001_SAMPLE__", output: "__UNVERIFIED_P1001_OUTPUT__" },
      ],
    });

    expect(context.samples).toEqual([
      { input: "1 2", output: "3" },
      { input: "100 -27", output: "73" },
    ]);
  });

  it("rejects generated provenance aliases and unsafe categories", async () => {
    const official = { input: "official input", output: "official output" };
    const context = await buildOutboundProblemContext({
      id: "OFFICIAL-1",
      samples: [
        official,
        { ...official, provenance: "generated" },
        { ...official, category: "generated" },
        { ...official, category: "runner" },
        { ...official, category: "counterexample" },
        { ...official, category: "private" },
      ],
    }, {
      loadOfficialSamples: async () => [official],
    });

    expect(context.samples).toEqual([official]);
  });

  it("uses only canonical sample entries from a server-owned bundled document", async () => {
    const loadOfficialSamples = createServerKnownOfficialSampleLoader(async (problemId) => {
      expect(problemId).toBe("AW785");
      return {
        samples: [
          { input: "official input", output: "official output", category: "sample" },
          { input: "__GENERATED_BUNDLED_INPUT__", output: "__GENERATED_BUNDLED_OUTPUT__", category: "ordinary" },
          { input: "__BOUNDARY_BUNDLED_INPUT__", output: "__BOUNDARY_BUNDLED_OUTPUT__", category: "boundary" },
        ],
      };
    });

    const context = await buildOutboundProblemContext({
      id: "AW785",
      samples: [
        { input: "official input", output: "official output" },
        { input: "__GENERATED_BUNDLED_INPUT__", output: "__GENERATED_BUNDLED_OUTPUT__" },
        { input: "__BOUNDARY_BUNDLED_INPUT__", output: "__BOUNDARY_BUNDLED_OUTPUT__" },
      ],
    }, { loadOfficialSamples });

    expect(context.samples).toEqual([{ input: "official input", output: "official output" }]);
  });

  it("fails closed when the server-known source is unavailable", async () => {
    const context = await buildOutboundProblemContext({
      id: "OFFICIAL-1",
      samples: [{ input: "__UNVERIFIED_AFTER_LOAD_FAILURE__", output: "__UNVERIFIED_OUTPUT__" }],
    }, {
      loadOfficialSamples: async () => { throw new Error("asset unavailable"); },
    });

    expect(context.samples).toEqual([]);
  });

  it("loads a bundled document through a fixed static-asset path", async () => {
    const fetchAsset = vi.fn(async (_request: Request) => new Response(JSON.stringify({ samples: [] }), { status: 200 }));
    const loadDocument = createStaticAssetDocumentLoader({ fetch: fetchAsset });

    await expect(loadDocument("AW785")).resolves.toEqual({ samples: [] });
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    const firstCall = fetchAsset.mock.calls[0];
    if (!firstCall) throw new Error("expected a static asset request");
    expect(new URL(firstCall[0].url).pathname).toBe("/problems/AW785.json");
    await expect(loadDocument("../private")).resolves.toBeNull();
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it("does not confuse input and output boundaries when matching canonical samples", async () => {
    const context = await buildOutboundProblemContext({
      id: "OFFICIAL-1",
      samples: [{ input: "canonical\u0000output", output: "tail" }],
    }, {
      loadOfficialSamples: async () => [{ input: "canonical", output: "output\u0000tail" }],
    });

    expect(context.samples).toEqual([]);
  });

  it("bounds and serializes a normalized public snapshot", async () => {
    const unsafe = "\u0000\u001f\u007f";
    const official = [
      { input: "one", output: "1" },
      { input: "two", output: "2" },
      { input: "three", output: "3" },
      {
        input: "x".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.sampleField + 1),
        output: "too large",
      },
    ];
    const context = await buildOutboundProblemContext({
      id: `P${unsafe}${"i".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.id + 10)}`,
      title: `Title${unsafe}${"t".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.title + 10)}`,
      description: `Description${unsafe}${"d".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.description + 10)}`,
      inputFormat: `Input${unsafe}${"i".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.inputFormat + 10)}`,
      outputFormat: `Output${unsafe}${"o".repeat(OUTBOUND_PROBLEM_CONTEXT_LIMITS.outputFormat + 10)}`,
      samples: official,
    }, { loadOfficialSamples: async () => official });

    const serialized = serializeOutboundProblemContext(context);

    expect(context.id.length).toBe(OUTBOUND_PROBLEM_CONTEXT_LIMITS.id);
    expect(context.title.length).toBe(OUTBOUND_PROBLEM_CONTEXT_LIMITS.title);
    expect(context.description.length).toBe(OUTBOUND_PROBLEM_CONTEXT_LIMITS.description);
    expect(context.inputFormat.length).toBe(OUTBOUND_PROBLEM_CONTEXT_LIMITS.inputFormat);
    expect(context.outputFormat.length).toBe(OUTBOUND_PROBLEM_CONTEXT_LIMITS.outputFormat);
    expect(context.samples).toEqual(official.slice(0, OUTBOUND_PROBLEM_CONTEXT_LIMITS.samples));
    expect(serialized).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
    expect(JSON.parse(serialized)).toEqual(context);
  });

  it("falls back to no samples when an official sample loader returns malformed data", async () => {
    const context = await buildOutboundProblemContext({
      id: "OFFICIAL-1",
      title: "Public",
      description: "Public description",
      inputFormat: "input",
      outputFormat: "output",
      samples: [{ input: "private candidate", output: "private output" }],
    }, {
      loadOfficialSamples: async () => undefined as unknown as Array<{ input: string; output: string }>,
    });

    expect(context.samples).toEqual([]);
  });
});
