import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// vinext 0.0.50 stores StaticFileCache keys with Windows backslashes but looks
// them up with URL slashes. The result is a production site whose HTML renders
// while every JS/CSS asset returns 404, so React never hydrates. Keep this small
// postinstall patch until the upstream release containing the Windows fix lands.
const target = resolve("node_modules/vinext/dist/server/static-file-cache.js");
const source = await readFile(target, "utf8");
const before = "relativePath: path.relative(base, batch[j]),";
const after = 'relativePath: path.relative(base, batch[j]).replaceAll("\\\\", "/"),';

if (source.includes(after)) {
  process.stdout.write("vinext Windows static-path patch already applied.\n");
} else if (source.includes(before)) {
  await writeFile(target, source.replace(before, after), "utf8");
  process.stdout.write("Applied vinext Windows static-path patch.\n");
} else {
  throw new Error("vinext layout changed; review the Windows static-path patch before building.");
}
