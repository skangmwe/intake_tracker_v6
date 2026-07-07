// Authenticated thumbnail (Slice 24 — gallery cards, S11). Attachment content is bearer-authenticated
// (api-blob-attachments.md), so a bare <img src> can't load it. This fetches the blob via the shared
// authenticated client, holds an object URL for the render, and revokes it on unmount / src change to
// avoid leaks. Loading and failure both fall back to a labelled placeholder (blueprint S11: "cards for
// features with no attachments render a placeholder").

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from '@phosphor-icons/react';

import { apiFetchBlob } from '@/shared/http/apiClient';

export interface AuthImageProps {
  /** Authenticated attachment content path, or undefined when the record has no image. */
  path: string | undefined;
  /** Alt text describing the record the thumbnail represents. */
  alt: string;
}

export function AuthImage({ path, alt }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    // Revoke any prior object URL before starting a new fetch.
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setObjectUrl(null);
    setFailed(false);

    if (!path) return undefined;

    const controller = new AbortController();
    const requestedPath = path;
    let active = true;

    void (async () => {
      try {
        const blob = await apiFetchBlob(requestedPath, controller.signal);
        if (!active) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setObjectUrl(url);
      } catch {
        if (active) setFailed(true);
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [path]);

  if (path && objectUrl && !failed) {
    return <img className="rv-card__thumb-img" src={objectUrl} alt={alt} loading="lazy" />;
  }

  return (
    <div className="rv-card__thumb-placeholder" aria-hidden>
      <ImageIcon size={32} weight="regular" />
    </div>
  );
}
