/** Splits official card text into plain text and icon tokens for rendering. */
export type TextToken =
  { kind: 'text'; value: string } | { kind: 'icon'; token: string; file: string } | { kind: 'newline' };

export function tokenizeText(text: string, textIcons: Record<string, string>): TextToken[] {
  // Longest tokens first so "◇10" wins over "◇1".
  const keys = Object.keys(textIcons).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return [{ kind: 'text', value: text }];
  const pattern = new RegExp(keys.map(escapeRegExp).join('|') + '|\n', 'g');

  const out: TextToken[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
    if (m[0] === '\n') out.push({ kind: 'newline' });
    else out.push({ kind: 'icon', token: m[0], file: textIcons[m[0]]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
