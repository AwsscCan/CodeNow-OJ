export type FolderMovePlan =
  | { ok: true; nextPaths: string[]; remap: (path: string) => string }
  | { ok: false; error: string };

export type FolderDissolvePlan = {
  nextPaths: string[];
  remap: (path: string) => string;
};

function folderName(path: string) {
  return path.split("/").pop() || path;
}

function folderParent(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function isWithin(path: string, folder: string) {
  return path === folder || path.startsWith(`${folder}/`);
}

export function planFolderMove(paths: string[], source: string, destinationParent: string): FolderMovePlan {
  if (destinationParent === source || destinationParent.startsWith(`${source}/`)) {
    return { ok: false, error: "不能把文件夹移入自身或子文件夹" };
  }

  const nextRoot = destinationParent ? `${destinationParent}/${folderName(source)}` : folderName(source);
  if (nextRoot !== source && paths.includes(nextRoot) && !isWithin(nextRoot, source)) {
    return { ok: false, error: "目标文件夹下已有同名文件夹" };
  }

  const sourceDepth = source.split("/").length;
  const nextDepth = nextRoot.split("/").length;
  const deepest = paths
    .filter((path) => isWithin(path, source))
    .reduce((max, path) => Math.max(max, nextDepth + path.split("/").length - sourceDepth), nextDepth);
  if (deepest > 5) return { ok: false, error: "最多支持 5 级文件夹" };

  const remap = (path: string) => path === source
    ? nextRoot
    : path.startsWith(`${source}/`)
      ? `${nextRoot}${path.slice(source.length)}`
      : path;

  return { ok: true, nextPaths: paths.map(remap), remap };
}

export function dissolveFolderLevel(paths: string[], folder: string): FolderDissolvePlan {
  const parent = folderParent(folder);
  const remap = (path: string) => {
    if (path === folder) return parent;
    if (!path.startsWith(`${folder}/`)) return path;
    const suffix = path.slice(folder.length + 1);
    return parent ? `${parent}/${suffix}` : suffix;
  };
  return {
    nextPaths: Array.from(new Set(paths.filter((path) => path !== folder).map(remap))),
    remap,
  };
}
