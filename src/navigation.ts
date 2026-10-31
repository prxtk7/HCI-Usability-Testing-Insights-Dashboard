// Minimal hash-based navigation (e.g. "#/issues"). No router library needed,
// and the browser back button and page refresh keep working.

import { useEffect, useSyncExternalStore } from 'react';

export const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'study', label: 'Study & tasks' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'issues', label: 'Issues' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'data', label: 'Export & data' },
] as const;

export type PageId = (typeof PAGES)[number]['id'];

export function pageHref(id: PageId): string {
  return `#/${id}`;
}

/** Link to one record on a page, e.g. "#/issues/issue-timezone". */
export function recordHref(id: PageId, recordId: string): string {
  return `#/${id}/${encodeURIComponent(recordId)}`;
}

export function parseHash(hash: string): { page: PageId; recordId: string | null } {
  const [pageId, encoded] = hash.replace(/^#\/?/, '').split('/');
  const page = PAGES.find((p) => p.id === pageId)?.id ?? 'dashboard';
  if (!encoded) return { page, recordId: null };
  try {
    return { page, recordId: decodeURIComponent(encoded) };
  } catch {
    return { page, recordId: null };
  }
}

const readPage = () => parseHash(window.location.hash).page;
const readRecordId = () => parseHash(window.location.hash).recordId;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useCurrentPage(): PageId {
  return useSyncExternalStore(subscribe, readPage);
}

/**
 * The record named in the address, if any. Scrolls to it and moves keyboard focus
 * there. The record's element must have the id `${domPrefix}${recordId}` and tabIndex -1.
 */
export function useLinkedRecord(domPrefix: string): string | null {
  const recordId = useSyncExternalStore(subscribe, readRecordId);
  useEffect(() => {
    if (recordId === null) return;
    const element = document.getElementById(`${domPrefix}${recordId}`);
    element?.scrollIntoView({ block: 'center' });
    element?.focus({ preventScroll: true });
  }, [domPrefix, recordId]);
  return recordId;
}
