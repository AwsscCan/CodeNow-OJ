"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NoteListEntry, NoteProblemKind, NoteSource, NoteVisibility } from "../lib/note-api";

/** 游客态本地草稿笔记：仅保存在本机，登录后经迁移向导上云。 */
export type LocalNoteDraft = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: string[];
  visibility: NoteVisibility;
  source: NoteSource;
  problemKind: NoteProblemKind | null;
  problemRef: string | null;
  updatedAt: string;
};

export type NoteListView = "mine" | "public";
export type NoteSort = "recent" | "likes";

type NoteStore = {
  noteAccountId: string | null;
  cloudNotes: NoteListEntry[];            // 云端镜像，不落盘
  noteVersions: Record<string, number>;   // 每篇版本号，不落盘
  localDrafts: LocalNoteDraft[];          // 游客草稿，落盘并跨登录保留
  editorDrafts: Record<string, LocalNoteDraft>; // 未提交编辑器草稿，落盘并按账户隔离
  listView: NoteListView;
  sort: NoteSort;
  tagFilter: string | null;

  switchNoteAccount: (userId: string | null) => void;
  hydrateNotes: (userId: string, notes: NoteListEntry[]) => void;
  setCloudNotes: (notes: NoteListEntry[]) => void;
  setNoteVersion: (id: string, version: number) => void;
  upsertLocalDraft: (draft: LocalNoteDraft) => void;
  removeLocalDraft: (id: string) => void;
  setEditorDraft: (key: string, draft: LocalNoteDraft) => void;
  removeEditorDraft: (key: string) => void;
  setListView: (view: NoteListView) => void;
  setSort: (sort: NoteSort) => void;
  setTagFilter: (tag: string | null) => void;
};

export const useNoteStore = create<NoteStore>()(
  persist(
    (set, get) => ({
      noteAccountId: null,
      cloudNotes: [],
      noteVersions: {},
      localDrafts: [],
      editorDrafts: {},
      listView: "mine",
      sort: "recent",
      tagFilter: null,

      switchNoteAccount: (userId) => {
        // 切账号：清空上一账户云镜像与版本缓存，但保留游客未迁移草稿，防跨用户串号。
        if (get().noteAccountId === userId) return;
        set({ noteAccountId: userId, cloudNotes: [], noteVersions: {} });
      },
      hydrateNotes: (userId, notes) => set({
        noteAccountId: userId,
        cloudNotes: notes,
        noteVersions: Object.fromEntries(notes.map((note) => [note.id, note.version])),
      }),
      setCloudNotes: (cloudNotes) => set({ cloudNotes }),
      setNoteVersion: (id, version) => set((state) => ({ noteVersions: { ...state.noteVersions, [id]: version } })),
      upsertLocalDraft: (draft) => set((state) => {
        const rest = state.localDrafts.filter((item) => item.id !== draft.id);
        return { localDrafts: [draft, ...rest] };
      }),
      removeLocalDraft: (id) => set((state) => ({ localDrafts: state.localDrafts.filter((item) => item.id !== id) })),
      setEditorDraft: (key, draft) => set((state) => ({ editorDrafts: { ...state.editorDrafts, [key]: draft } })),
      removeEditorDraft: (key) => set((state) => {
        const next = { ...state.editorDrafts };
        delete next[key];
        return { editorDrafts: next };
      }),
      setListView: (listView) => set({ listView }),
      setSort: (sort) => set({ sort }),
      setTagFilter: (tagFilter) => set({ tagFilter }),
    }),
    {
      name: "codenow-notes-local",
      partialize: (state) => ({ localDrafts: state.localDrafts, editorDrafts: state.editorDrafts, listView: state.listView, sort: state.sort }),
    },
  ),
);
