// S43 Toolkit detail side sheet. Shows the item's type pill + status badge, one-liner, description,
// meta grid, how-to-use, and a "Use this asset" card with the pasted body (copy) and/or the uploaded
// file (download). Fetches the full item (the list row carries only scannable columns). "Times used"
// is intentionally absent — R1 has no usage instrumentation (usage-metrics.md is R2).

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Copy, DownloadSimple, PencilSimple, Sparkle } from '@phosphor-icons/react';

import type { ToolkitItemDto, ToolkitItemId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { SideSheet } from '@/shared/components/Disclosure/SideSheet';
import { saveBlob } from '@/shared/http/download';

import { kindIcon, kindPillClass, statusBadgeClass } from '../toolkitFormat';
import { downloadToolkitAttachment } from '../api';
import { useToolkitItem } from '../useToolkit';

const COPIED_FEEDBACK_MS = 1600;

interface ToolkitDetailSheetProps {
  itemId: ToolkitItemId;
  onClose: () => void;
  onEdit: (item: ToolkitItemDto) => void;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ToolkitDetailSheet({ itemId, onClose, onEdit }: ToolkitDetailSheetProps) {
  const { data: item, isLoading, isError } = useToolkitItem(itemId);
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const flagCopied = () => {
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  const copyContent = () => {
    if (!item?.bodyMarkdown) return;
    void navigator.clipboard?.writeText(item.bodyMarkdown).then(flagCopied).catch(() => undefined);
  };

  const download = () => {
    setDownloadError(false);
    void downloadToolkitAttachment(itemId)
      .then((blob) => saveBlob(blob, item?.attachment?.fileName ?? 'toolkit-asset'))
      .catch(() => setDownloadError(true));
  };

  return (
    <SideSheet title={item?.name ?? 'Toolkit item'} onClose={onClose}>
      {isLoading && (
        <p className="caption" role="status">
          Loading item…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          This item could not be loaded. Try again in a moment.
        </p>
      )}

      {item && (
        <div className="tk-detail">
          <div className="tk-detail__toolbar">
            <Button variant="secondary" compact onClick={() => onEdit(item)}>
              <PencilSimple size={16} weight="regular" aria-hidden /> Edit
            </Button>
          </div>

          <div className="tk-detail__meta-row">
            <TypePill kind={item.kind} />
            <span className={`tk-badge ${statusBadgeClass(item.status)}`} data-ds="badge">
              {item.status}
            </span>
          </div>

          {item.oneLiner && (
            <div className="tk-oneliner">
              <Sparkle size={16} weight="regular" aria-hidden />
              <span>{item.oneLiner}</span>
            </div>
          )}

          {item.description && <p className="tk-detail__desc">{item.description}</p>}

          <dl className="tk-detail__grid">
            <MetaCell label="Maintainer" value={item.maintainer || '—'} />
            <MetaCell label="Record ID" value={item.id} mono />
            <MetaCell label="Last modified on" value={formatDate(item.lastModifiedAt)} />
            <MetaCell label="Last modified by" value={item.lastModifiedBy} />
          </dl>

          {item.howTo && (
            <section className="tk-detail__section">
              <h3 className="tk-detail__label">How to use</h3>
              <p className="tk-detail__howto">{item.howTo}</p>
            </section>
          )}

          {(item.bodyMarkdown || item.attachment) && (
            <section className="tk-asset">
              <h3 className="tk-detail__label">Use this asset</h3>
              <p className="tk-asset__hint">Copy the language below, or download the asset file.</p>
              {item.bodyMarkdown && <pre className="tk-asset__pre">{item.bodyMarkdown}</pre>}
              <div className="tk-asset__actions">
                {item.bodyMarkdown && (
                  <Button variant="primary" compact onClick={copyContent}>
                    {copied ? (
                      <>
                        <CheckCircle size={16} weight="regular" aria-hidden /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={16} weight="regular" aria-hidden /> Copy content
                      </>
                    )}
                  </Button>
                )}
                {item.attachment && (
                  <Button variant="secondary" compact onClick={download}>
                    <DownloadSimple size={16} weight="regular" aria-hidden /> Download
                  </Button>
                )}
              </div>
              {downloadError && (
                <p className="mws-alert mws-alert--error" role="alert">
                  The file couldn&rsquo;t be downloaded. Try again in a moment.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </SideSheet>
  );
}

function TypePill({ kind }: { kind: ToolkitItemDto['kind'] }) {
  const Icon = kindIcon(kind);
  return (
    <span className={`tk-pill ${kindPillClass(kind)}`}>
      <Icon size={14} weight="regular" aria-hidden /> {kind}
    </span>
  );
}

function MetaCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="tk-detail__cell">
      <dt className="tk-detail__label">{label}</dt>
      <dd className={`tk-detail__value${mono ? ' tk-mono' : ''}`}>{value}</dd>
    </div>
  );
}
