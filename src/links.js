const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;

/**
 * Remove bare `http://`/`https://` URLs from a commit subject.
 *
 * Used only when `hide_links` is enabled, so that no URL of any kind
 * survives inside the posted embed.
 */
export function stripUrls(text) {
  return text
    .replace(URL_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
