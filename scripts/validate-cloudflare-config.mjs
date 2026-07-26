import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const secretKey = /(secret|token|password|api[_-]?key|resend)/i;

function inlineSecretPaths(value, path = "config") {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    return [
      ...(secretKey.test(key) && child !== undefined && child !== null && child !== "" ? [childPath] : []),
      ...inlineSecretPaths(child, childPath),
    ];
  });
}

export function validateCloudflareConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") return { ok: false, errors: ["Configuration must be an object"] };
  if (config.workers_dev !== true) errors.push("workers_dev must be true");
  const preview = config.env?.preview;
  const production = config.env?.production;
  if (!preview) errors.push("env.preview is required");
  if (!production) errors.push("env.production is required");
  if (!preview || !production) return { ok: false, errors };
  if (!preview.name || !production.name || preview.name === production.name) errors.push("Preview and production Worker names must be different");
  if (preview.workers_dev !== true || production.workers_dev !== true) errors.push("Both environments must enable workers_dev");
  const previewDb = preview.d1_databases?.find((entry) => entry.binding === "DB");
  const productionDb = production.d1_databases?.find((entry) => entry.binding === "DB");
  if (!previewDb?.database_id || !productionDb?.database_id) errors.push("Both environments require a non-empty DB database_id");
  if (previewDb?.database_id && previewDb.database_id === productionDb?.database_id) errors.push("Preview and production must use different D1 database IDs");
  if (previewDb?.migrations_dir !== "drizzle" || productionDb?.migrations_dir !== "drizzle") errors.push('Every DB binding must use migrations_dir: "drizzle"');
  const secrets = inlineSecretPaths({ preview: preview.vars, production: production.vars });
  if (secrets.length) errors.push(`Inline secrets are forbidden: ${secrets.join(", ")}`);
  return { ok: errors.length === 0, errors };
}

function parseJsonc(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') { inString = true; output += current; continue; }
    if (current === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    output += current;
  }
  return JSON.parse(output.replace(/,\s*([}\]])/g, "$1"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const filename = resolve(process.argv[2] ?? "wrangler.jsonc");
    const result = validateCloudflareConfig(parseJsonc(readFileSync(filename, "utf8")));
    if (!result.ok) throw new Error(result.errors.join("\n"));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
