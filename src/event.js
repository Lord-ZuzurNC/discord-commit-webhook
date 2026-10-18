import { readFileSync } from 'node:fs';

/**
 * Load and validate the push event payload the action was triggered with.
 *
 * The action only supports the `push` event, and reads the payload from the
 * file at `GITHUB_EVENT_PATH` rather than calling the GitHub API.
 */
export function loadPushEvent({ eventName, eventPath }) {
  if (eventName !== 'push') {
    throw new Error(
      `This action only supports the "push" event, but it was triggered by "${eventName}".`,
    );
  }

  if (!eventPath) {
    throw new Error(
      'The GITHUB_EVENT_PATH environment variable is not set; this action must run inside a GitHub Actions job.',
    );
  }

  let raw;
  try {
    raw = readFileSync(eventPath, 'utf8');
  } catch (err) {
    throw new Error(`Could not read the push event payload at "${eventPath}": ${err.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Could not parse the push event payload at "${eventPath}" as JSON: ${err.message}`,
    );
  }
}
