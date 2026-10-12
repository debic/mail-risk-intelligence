// Types shared by the client and the server.

export interface Attachment {
  filename: string;
  extracted_text: string;
}

/** Common email shape produced by ingestion (seed JSON, pasted text, .txt, .eml, .pdf). */
export interface RawEmail {
  id: string;
  from: string;
  to: string[];
  date: string;
  subject: string;
  body: string;
  attachments: Attachment[];
}
