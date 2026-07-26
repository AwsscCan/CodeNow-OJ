/* CodeNow OJ · Markdown 粘贴图片共享管线(题面编辑与笔记编辑共用) · Bamzc */

"use client";

/** 内嵌 base64 图片的大小上限：防止 localStorage 与云端行大小被大图撑爆 */
export const PASTE_IMAGE_LIMIT = 300 * 1024;

/**
 * 从粘贴事件提取图片，转 data URL 后以 Markdown 语法插入光标处。
 * 返回是否消费了本次粘贴(非图片粘贴不拦截)。
 */
export function pasteImageIntoMarkdown(
  event: React.ClipboardEvent<HTMLTextAreaElement>,
  currentValue: string,
  onInsert: (nextValue: string) => void,
  onError: (message: string) => void,
  alt = "插图",
): boolean {
  const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
  if (!item) return false;
  event.preventDefault();
  const file = item.getAsFile();
  if (!file) return true;
  if (file.size > PASTE_IMAGE_LIMIT) {
    onError("图片超过 300KB，请压缩后粘贴，或改用外链语法 ![说明](https://…)");
    return true;
  }
  const start = event.currentTarget.selectionStart ?? currentValue.length;
  const end = event.currentTarget.selectionEnd ?? start;
  const reader = new FileReader();
  reader.onload = () => {
    onInsert(`${currentValue.slice(0, start)}![${alt}](${String(reader.result)})${currentValue.slice(end)}`);
  };
  reader.readAsDataURL(file);
  return true;
}
