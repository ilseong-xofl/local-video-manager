import { describe, expect, it } from 'vitest';

import { companyEmailFromId } from './company-account';

describe('companyEmailFromId', () => {
  it('trims an account ID and appends the company email domain', () => {
    expect(companyEmailFromId(' user ')).toBe('user@ilscp.net');
  });

  it('rejects empty IDs, whitespace, and values that already contain a domain', () => {
    expect(companyEmailFromId('')).toBeNull();
    expect(companyEmailFromId('user name')).toBeNull();
    expect(companyEmailFromId('user@ilscp.net')).toBeNull();
  });
});
