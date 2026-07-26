"use client";

import type { CloudConflict } from "../hooks/use-cloud-save";

type Props = {
  conflict: CloudConflict;
  onUseCloud: () => void | Promise<void>;
  onOverwrite: () => void | Promise<void>;
};

export function SyncConflictDialog({ conflict, onUseCloud, onOverwrite }: Props) {
  return <div className="modal-backdrop">
    <section className="modal conflict-modal" role="dialog" aria-modal="true" aria-label="同步冲突">
      <span className="modal-kicker">SYNC CONFLICT</span>
      <h2>云端内容已在其他设备更新</h2>
      <p>本地版本 {conflict.localVersion}，云端版本 {conflict.currentVersion}。请选择保留哪一份。</p>
      <div className="modal-actions">
        <button type="button" onClick={() => void onUseCloud()}>使用云端版本</button>
        <button type="button" onClick={() => void onOverwrite()}>用本地版本覆盖</button>
      </div>
    </section>
  </div>;
}

