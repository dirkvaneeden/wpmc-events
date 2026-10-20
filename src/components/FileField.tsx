'use client';

import { useRef } from 'react';

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="fiori-label">{label}</label>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          // Cancelling the file dialog leaves the current file alone
          if (picked) onChange(picked);
          // Reset, so choosing the same file again still counts as a change
          e.target.value = '';
        }}
      />

      {file ? (
        <div
          className="flex items-center gap-3 rounded-sm border px-3 py-2"
          style={{ borderColor: 'var(--fiori-border)', background: '#ffffff' }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{file.name}</div>
            <div className="text-xs text-[var(--fiori-text-subtle)]">{formatSize(file.size)}</div>
          </div>
          <button type="button" className="fiori-btn fiori-btn-ghost" onClick={() => inputRef.current?.click()}>
            Change
          </button>
          <button
            type="button"
            className="fiori-btn fiori-btn-ghost"
            style={{ color: 'var(--fiori-negative)' }}
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        </div>
      ) : (
        <button type="button" className="fiori-btn fiori-btn-ghost" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
      )}
    </div>
  );
}