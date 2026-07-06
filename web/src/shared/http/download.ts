// Save a Blob to the user's disk via a transient `<a download>` — the only way to persist a Blob
// obtained through an authenticated fetch (a plain link can't carry the bearer token). Shared so the
// CSV export (slice 16) and any future binary download use one implementation.

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
