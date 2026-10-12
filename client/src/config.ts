// Client settings in one place. Upload limits come from shared/ so they always match the server.
export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, SUPPORTED_EXTENSIONS } from '../../shared/limits'

/** How often the UI refreshes while an analysis is queued or running. */
export const POLL_MS = 2000
