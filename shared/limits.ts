// Upload limits shared by the client (validation before upload) and the server (enforcement),
// so the two can never disagree.

export const SUPPORTED_EXTENSIONS = ['.txt', '.eml', '.pdf'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '5 MB';
/** Longest email body sent to the AI agents. */
export const MAX_BODY_CHARS = 50_000;
