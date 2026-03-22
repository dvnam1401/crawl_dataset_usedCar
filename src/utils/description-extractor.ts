import { createHash } from 'crypto';

/**
 * Normalize raw HTML from `.description` div → clean plain text.
 *
 * Rules:
 *   - <br> / <br/> → "\n"
 *   - <span> → innerText only (all attributes stripped)
 *   - <script>, <style> → removed entirely (content + tags)
 *   - All remaining HTML tags → removed
 *   - Trim each line
 *   - Collapse consecutive blank lines into one
 *   - Preserve phone numbers
 *
 * Returns { text, hash } where hash is SHA-256 of the normalized text.
 */

export function extractDescription(rawHtml: string): { text: string; hash: string } {
  if (!rawHtml || !rawHtml.trim()) {
    return { text: '', hash: '' };
  }

  let html = rawHtml;

  // 1. Remove <script> and <style> blocks entirely (content + tags)
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 2. Convert <br>, <br/>, <br /> → newline
  html = html.replace(/<br\s*\/?>/gi, '\n');

  // 3. Convert block-level tags to newlines for readability
  html = html.replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|blockquote)[\s>][^>]*>/gi, '\n');

  // 4. Remove all remaining HTML tags (keep inner text)
  html = html.replace(/<[^>]+>/g, '');

  // 5. Decode common HTML entities
  html = html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(parseInt(code, 10)));

  // 6. Trim each line & collapse whitespace within lines
  const lines = html.split('\n').map(line => line.replace(/\s+/g, ' ').trim());

  // 7. Collapse consecutive blank lines into a single blank line
  const collapsed: string[] = [];
  let prevWasEmpty = false;
  for (const line of lines) {
    if (line === '') {
      if (!prevWasEmpty) {
        collapsed.push('');
      }
      prevWasEmpty = true;
    } else {
      collapsed.push(line);
      prevWasEmpty = false;
    }
  }

  // 8. Trim leading/trailing blank lines
  const text = collapsed.join('\n').trim();

  // 9. Compute SHA-256 hash for deduplication
  const hash = text ? createHash('sha256').update(text, 'utf8').digest('hex') : '';

  return { text, hash };
}
