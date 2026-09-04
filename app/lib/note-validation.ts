export function getNoteTitleError(title: string, publishing: boolean) {
  if (title.trim()) return null;
  return `${publishing ? "发布" : "保存"}失败：请先填写笔记标题`;
}
