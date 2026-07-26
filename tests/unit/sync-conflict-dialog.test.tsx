// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest requires its environment directive before imports. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncConflictDialog } from "../../app/components/sync-conflict-dialog";

afterEach(cleanup);

describe("SyncConflictDialog", () => {
  it("shows both versions and exposes the two recovery choices", () => {
    const useCloud = vi.fn();
    const overwrite = vi.fn();
    render(<SyncConflictDialog conflict={{ localVersion: 2, currentVersion: 4 }} onUseCloud={useCloud} onOverwrite={overwrite} />);
    expect(screen.getByText(/本地版本 2/)).toBeTruthy();
    expect(screen.getByText(/云端版本 4/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "使用云端版本" }));
    fireEvent.click(screen.getByRole("button", { name: "用本地版本覆盖" }));
    expect(useCloud).toHaveBeenCalledTimes(1);
    expect(overwrite).toHaveBeenCalledTimes(1);
  });
});
