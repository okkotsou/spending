/**
 * URL ingestion.
 *
 * An iOS Shortcut opens `#/ingest?m=<message>` when the bank texts, and the
 * message is imported on load with no interaction. The hash is then replaced,
 * so a refresh or a back navigation cannot import the same message twice, and
 * the message text does not linger in the address bar.
 *
 * Multiple messages may be sent at once, either as repeated `m` parameters or
 * separated by a newline inside one.
 */
import { splitMessages } from '@/parser/split';
import type { IngestInput } from '@/db/ingest';

export interface PendingIngest {
  inputs: IngestInput[];
}

/**
 * Reads an ingest payload from the current URL.
 *
 * Reading does not clear it: the caller clears once the import has settled, so
 * a failed write leaves the message recoverable by reloading rather than gone.
 * A reload before it settles is harmless, because an already-imported message
 * collides on its fingerprint.
 *
 * @returns the messages to import, or undefined when the URL carries none
 */
export function readUrlIngest(location: Location): PendingIngest | undefined {
  const hash = location.hash.replace(/^#/, '');
  const [path = '', query = ''] = hash.split('?');
  if (path !== '/ingest') return undefined;

  const params = new URLSearchParams(query);
  const payloads = [...params.getAll('m'), ...params.getAll('message'), ...params.getAll('text')];
  const inputs: IngestInput[] = [];
  for (const payload of payloads) {
    for (const message of splitMessages(payload)) {
      inputs.push(
        message.receivedAt !== undefined
          ? { raw: message.raw, receivedAt: message.receivedAt }
          : { raw: message.raw },
      );
    }
  }

  return inputs.length > 0 ? { inputs } : undefined;
}

/**
 * Removes the payload from the address bar. Replace rather than push, so the
 * back button cannot return to a URL that would import the message again.
 */
export function clearUrlIngest(location: Location, history: History): void {
  history.replaceState(null, '', `${location.pathname}${location.search}#/`);
}

/**
 * The URL an automation opens. One definition, so the settings screen, the
 * documentation and the reader above can never drift apart.
 *
 * @param base the deployment root, including any subdirectory
 * @param message the message text; the caller does not encode it
 */
export function buildIngestUrl(base: string, message: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}#/ingest?m=${encodeURIComponent(message)}`;
}

/** The deployment root of the running app, for building that URL. */
export function currentBase(location: Location): string {
  return `${location.origin}${location.pathname}`;
}
