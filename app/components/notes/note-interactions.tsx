"use client";

import { useEffect, useRef, useState } from "react";
import { CommentApi, ReactionApi, ReportApi, type NoteComment } from "../../lib/note-api";

/**
 * 公开笔记的互动区：点赞/收藏 + 评论。
 * 评论按纯文本渲染（React 转义），不走 Markdown 以收窄 XSS 面。删除按钮仅帖主可见。
 */
export function NoteInteractions({ noteId, likeCount, favoriteCount, loggedIn, isNoteOwner, onToast }: {
  noteId: string;
  likeCount: number;
  favoriteCount: number;
  loggedIn: boolean;
  isNoteOwner: boolean;
  onToast: (message: string) => void;
}) {
  const [likes, setLikes] = useState(likeCount);
  const [favorites, setFavorites] = useState(favoriteCount);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    CommentApi.list(noteId).then((result) => setComments(result.items)).catch(() => { /* ignore */ });
    if (loggedIn) ReactionApi.state(noteId).then((state) => { setLiked(state.viewerLiked); setFavorited(state.viewerFavorited); }).catch(() => { /* ignore */ });
  }, [noteId, loggedIn]);

  async function toggle(kind: "like" | "favorite") {
    if (!loggedIn) { onToast("登录后可参与互动"); return; }
    const active = kind === "like" ? !liked : !favorited;
    try {
      const result = await ReactionApi.set(noteId, kind, active);
      if (kind === "like") { setLiked(active); setLikes(result.count); }
      else { setFavorited(active); setFavorites(result.count); }
    } catch {
      onToast("操作失败，请稍后重试");
    }
  }

  async function submit() {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      const result = await CommentApi.create(noteId, content, crypto.randomUUID());
      setComments((prev) => [result.comment, ...prev]);
      setDraft("");
    } catch {
      onToast("评论失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(id: string) {
    try {
      await CommentApi.remove(id);
      setComments((prev) => prev.filter((item) => item.id !== id));
    } catch {
      onToast("删除失败");
    }
  }

  async function report() {
    if (!loggedIn) { onToast("登录后可举报"); return; }
    const reason = window.prompt("请简述举报原因（如：垃圾广告、违规内容）");
    if (!reason?.trim()) return;
    try {
      const result = await ReportApi.create("note", noteId, reason.trim());
      onToast(result.duplicated ? "你已举报过这篇笔记" : "举报已提交，感谢反馈");
    } catch {
      onToast("举报失败，请稍后重试");
    }
  }

  return (
    <div className="note-interactions">
      <div className="note-actions">
        <button className={liked ? "primary" : ""} onClick={() => toggle("like")}>{liked ? "♥" : "♡"} 点赞 {likes}</button>
        <button className={favorited ? "primary" : ""} onClick={() => toggle("favorite")}>{favorited ? "★" : "☆"} 收藏 {favorites}</button>
        {!isNoteOwner ? <button onClick={report}>⚑ 举报</button> : null}
      </div>

      <div className="note-comments">
        <h2>评论 {comments.length}</h2>
        {loggedIn ? (
          <div className="note-comment-composer">
            <textarea placeholder="友善地发表评论…" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} />
            <button className="primary" onClick={submit} disabled={busy || !draft.trim()}>发表</button>
          </div>
        ) : (
          <div className="note-empty"><span>登录后参与讨论</span></div>
        )}
        {comments.map((comment) => (
          <div className="note-comment-item" key={comment.id}>
            <div className="note-comment-head">
              <b>{comment.author.name}</b>
              <span>{new Date(comment.createdAt).toLocaleString("zh-CN")}</span>
              {isNoteOwner ? <button className="note-comment-del" onClick={() => removeComment(comment.id)}>删除</button> : null}
            </div>
            <p>{comment.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
