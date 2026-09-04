// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { NoteListEntry } from "../../app/lib/note-api";
import { useNoteStore, type LocalNoteDraft } from "../../app/stores/note-store";

function entry(id: string, version = 1): NoteListEntry {
  return {
    id, title: id, summary: null, coverUrl: null, visibility: "private", status: "draft",
    moderationState: "visible", source: "standalone", problemKind: null, problemRef: null,
    likeCount: 0, favoriteCount: 0, commentCount: 0, publishedAt: null, version, tags: [],
    createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z",
  };
}

function draft(id: string): LocalNoteDraft {
  return { id, title: id, content: "x", summary: null, tags: [], visibility: "private", source: "standalone", problemKind: null, problemRef: null, updatedAt: "2026-07-26T00:00:00.000Z" };
}

describe("note store account isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    useNoteStore.setState({ noteAccountId: null, cloudNotes: [], noteVersions: {}, localDrafts: [], editorDrafts: {} });
  });

  it("clears cloud mirror when switching accounts but keeps guest drafts", () => {
    const store = useNoteStore.getState();
    store.upsertLocalDraft(draft("guest-1"));
    store.switchNoteAccount("user-a");
    useNoteStore.getState().hydrateNotes("user-a", [entry("n1"), entry("n2")]);
    expect(useNoteStore.getState().cloudNotes).toHaveLength(2);

    useNoteStore.getState().switchNoteAccount("user-b");
    const after = useNoteStore.getState();
    expect(after.noteAccountId).toBe("user-b");
    expect(after.cloudNotes).toHaveLength(0);
    expect(after.noteVersions).toEqual({});
    expect(after.localDrafts.map((item) => item.id)).toEqual(["guest-1"]);
  });

  it("no-ops when switching to the same account", () => {
    useNoteStore.getState().switchNoteAccount("user-a");
    useNoteStore.getState().setCloudNotes([entry("keep")]);
    useNoteStore.getState().switchNoteAccount("user-a");
    expect(useNoteStore.getState().cloudNotes).toHaveLength(1);
  });

  it("hydrate records versions and logout keeps guest drafts", () => {
    useNoteStore.getState().upsertLocalDraft(draft("g1"));
    useNoteStore.getState().hydrateNotes("user-a", [entry("n1", 5)]);
    expect(useNoteStore.getState().noteVersions).toEqual({ n1: 5 });
    useNoteStore.getState().switchNoteAccount(null);
    expect(useNoteStore.getState().cloudNotes).toHaveLength(0);
    expect(useNoteStore.getState().localDrafts.map((item) => item.id)).toEqual(["g1"]);
  });

  it("persists only guest drafts and UI prefs to localStorage", () => {
    useNoteStore.getState().upsertLocalDraft(draft("g1"));
    useNoteStore.getState().hydrateNotes("user-a", [entry("cloud")]);
    useNoteStore.getState().setListView("public");
    const persisted = JSON.parse(localStorage.getItem("codenow-notes-local") ?? "{}");
    expect(persisted.state.localDrafts.map((item: LocalNoteDraft) => item.id)).toEqual(["g1"]);
    expect(persisted.state.listView).toBe("public");
    expect(persisted.state).not.toHaveProperty("cloudNotes");
    expect(persisted.state).not.toHaveProperty("noteVersions");
  });

  it("persists an unpublished editor draft so refresh and route changes do not lose it", () => {
    useNoteStore.getState().setEditorDraft("editor:user-a:standalone", draft("pending"));
    const persisted = JSON.parse(localStorage.getItem("codenow-notes-local") ?? "{}");
    expect(persisted.state.editorDrafts["editor:user-a:standalone"]).toMatchObject({ id: "pending", content: "x" });
  });
});
