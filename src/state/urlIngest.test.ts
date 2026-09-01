import { describe, expect, it } from 'vitest';
import { buildIngestUrl, clearUrlIngest, currentBase, readUrlIngest } from './urlIngest';

function fakeLocation(hash: string, pathname = '/', origin = 'https://example.test'): Location {
  return { hash, pathname, search: '', origin } as Location;
}

describe('readUrlIngest', () => {
  it('reads a single encoded message', () => {
    const message = 'شراء\nالمبلغ: 20.00 ريال';
    const pending = readUrlIngest(fakeLocation(`#/ingest?m=${encodeURIComponent(message)}`));
    expect(pending?.inputs).toHaveLength(1);
    expect(pending?.inputs[0]?.raw).toContain('المبلغ');
  });

  it('reads several messages from repeated parameters', () => {
    const url = `#/ingest?m=${encodeURIComponent('شراء\nالمبلغ: 20.00 ريال')}&m=${encodeURIComponent('Purchase\nAmount:SAR 30.00')}`;
    expect(readUrlIngest(fakeLocation(url))?.inputs).toHaveLength(2);
  });

  it('splits several messages sent in one parameter', () => {
    const both = 'شراء\nالمبلغ: 20.00 ريال\n\nPurchase\nAmount:SAR 30.00';
    expect(readUrlIngest(fakeLocation(`#/ingest?m=${encodeURIComponent(both)}`))?.inputs).toHaveLength(2);
  });

  it('accepts the alternative parameter names a shortcut might use', () => {
    expect(readUrlIngest(fakeLocation('#/ingest?message=Purchase%20SAR%2010'))?.inputs).toHaveLength(1);
    expect(readUrlIngest(fakeLocation('#/ingest?text=Purchase%20SAR%2010'))?.inputs).toHaveLength(1);
  });

  it('ignores any other route, and an ingest route with nothing in it', () => {
    expect(readUrlIngest(fakeLocation('#/transactions'))).toBeUndefined();
    expect(readUrlIngest(fakeLocation('#/ingest?m='))).toBeUndefined();
    expect(readUrlIngest(fakeLocation(''))).toBeUndefined();
  });

  it('does not clear the payload; that is a separate, later step', () => {
    const location = fakeLocation('#/ingest?m=Purchase%20SAR%2010');
    readUrlIngest(location);
    expect(location.hash).toBe('#/ingest?m=Purchase%20SAR%2010');

    const calls: string[] = [];
    const history = { replaceState: (_a: unknown, _b: string, url: string) => calls.push(url) } as unknown as History;
    clearUrlIngest(location, history);
    expect(calls).toEqual(['/#/']);
  });
});

describe('buildIngestUrl', () => {
  it('builds the address an automation opens, from a root or a subdirectory', () => {
    expect(buildIngestUrl('https://example.test', 'a b')).toBe('https://example.test/#/ingest?m=a%20b');
    expect(buildIngestUrl('https://example.test/misraf/', '')).toBe('https://example.test/misraf/#/ingest?m=');
  });

  it('round-trips a real Arabic message', () => {
    const message = 'شراء\nالمبلغ: 20.00 ريال';
    const url = buildIngestUrl('https://example.test/', message);
    const hash = url.slice(url.indexOf('#'));
    expect(readUrlIngest(fakeLocation(hash))?.inputs[0]?.raw).toBe(message);
  });

  it('reports the deployment root of the running app', () => {
    expect(currentBase(fakeLocation('', '/misraf/'))).toBe('https://example.test/misraf/');
  });
});
