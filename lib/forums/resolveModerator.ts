// The synced `forum_moderator_name` field is messy free text — e.g.
//   "Wesley Pollard wesley@beeefficient.co.za"
//   "Ruth Ann Rose- ruthann@rosemarketingsolutions.com"
//   "wes.keyes@bbhh.org"            (email only, no name)
// We want a clean display name and, where possible, a link to that member's
// detail page. Strategy: pull the email out, match it to a member row; fall
// back to matching the leftover name text; prefer the matched member's
// canonical name for display.

interface MinimalMember {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  email_primary: string | null;
}

export interface ResolvedModerator {
  name: string;
  memberId: string | null;
}

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

export function resolveModerator(
  raw: string | null | undefined,
  all: MinimalMember[],
): ResolvedModerator | null {
  if (!raw || !raw.trim()) return null;

  const emailMatch = raw.match(EMAIL_RE);
  const email = emailMatch?.[0]?.toLowerCase();

  // Name = whatever remains after removing the email, trimmed of separators.
  let nameText = raw;
  if (emailMatch) nameText = nameText.replace(emailMatch[0], "");
  nameText = nameText.replace(/^[\s,\-–—]+|[\s,\-–—]+$/g, "").trim();

  // Resolve to a member: email is the strongest signal, then name.
  let member: MinimalMember | undefined;
  if (email) {
    member = all.find((m) => (m.email_primary ?? "").toLowerCase() === email);
  }
  if (!member && nameText) {
    const lc = nameText.toLowerCase();
    member = all.find(
      (m) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim().toLowerCase() === lc,
    );
  }

  const displayName = member
    ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
    : nameText || raw.trim();

  return { name: displayName, memberId: member?.trifecta_member_id ?? null };
}
