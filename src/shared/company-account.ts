export const COMPANY_EMAIL_DOMAIN = 'ilscp.net';

export function companyEmailFromId(value: string): string | null {
  const accountId = value.trim();
  if (!accountId || accountId.includes('@') || /\s/u.test(accountId)) {
    return null;
  }

  return `${accountId}@${COMPANY_EMAIL_DOMAIN}`;
}
