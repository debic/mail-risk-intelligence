import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import type { EmailDetail } from '../../../shared/types'
import { api } from '../api/client'
import styles from './AddEmailDialog.module.css'

type Mode = 'paste' | 'upload'

const ACCEPTED = ['.txt', '.eml', '.pdf']
const MAX_BYTES = 5 * 1024 * 1024

const PLACEHOLDER = `From: sender@example.com
To: you@arcline.com
Subject: Invoice update

Paste the full email here. Headers are optional.`

interface AddEmailDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (email: EmailDetail) => void
}

/** Client-side check so obvious mistakes are caught before uploading. */
export function validateFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ACCEPTED.some((ext) => name.endsWith(ext))) return 'Only .txt, .eml and .pdf files are supported.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_BYTES) return 'File is larger than 5 MB.'
  return null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AddEmailDialog({ open, onClose, onCreated }: AddEmailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  // After a successful submit, focus goes to the new email's detail instead of back to the button.
  const createdRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ids = useId()

  const [mode, setMode] = useState<Mode>('paste')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The native <dialog> gives us Escape to close, a focus trap and an inert background.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null
      createdRef.current = false
      setError(null)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleClosed() {
    onClose()
    setText('')
    setFile(null)
    setMode('paste')
    setSubmitting(false)
    if (!createdRef.current) returnFocusRef.current?.focus()
  }

  function pickFile(picked: File | undefined) {
    if (!picked) return
    const problem = validateFile(picked)
    setError(problem)
    setFile(problem ? null : picked)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    pickFile(event.dataTransfer.files[0])
  }

  // Arrow keys switch tabs (WAI-ARIA tabs pattern).
  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const next: Mode = mode === 'paste' ? 'upload' : 'paste'
    setMode(next)
    setError(null)
    document.getElementById(`${ids}-tab-${next}`)?.focus()
  }

  const canSubmit = !submitting && (mode === 'paste' ? text.trim().length > 0 : file !== null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const email = await api.ingestEmail(mode === 'paste' ? { text } : { file: file! })
      createdRef.current = true
      onCreated(email)
      dialogRef.current?.close()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${ids}-title`} onClose={handleClosed}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <div>
            <h2 id={`${ids}-title`} className={styles.title}>
              Add an email
            </h2>
            <p className={styles.subtitle}>It goes through the same analysis as the rest of the inbox.</p>
          </div>
          <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()} aria-label="Close">
            ×
          </button>
        </header>

        <div role="tablist" aria-label="How to add the email" className={styles.tabs} onKeyDown={handleTabKey}>
          {(['paste', 'upload'] as const).map((tab) => (
            <button
              key={tab}
              id={`${ids}-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              aria-controls={`${ids}-panel`}
              tabIndex={mode === tab ? 0 : -1}
              className={styles.tab}
              onClick={() => {
                setMode(tab)
                setError(null)
              }}
            >
              {tab === 'paste' ? 'Paste text' : 'Upload file'}
            </button>
          ))}
        </div>

        <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${mode}`} className={styles.panel}>
          {mode === 'paste' ? (
            <>
              <label htmlFor={`${ids}-text`} className="visually-hidden">
                Email text
              </label>
              <textarea
                id={`${ids}-text`}
                className={styles.textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={PLACEHOLDER}
                rows={10}
                autoFocus
              />
            </>
          ) : (
            <>
              <label
                className={styles.dropzone}
                data-dragging={dragging || undefined}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  className="visually-hidden"
                  onChange={(event) => pickFile(event.target.files?.[0])}
                />
                <span className={styles.dropIcon} aria-hidden="true">
                  ⇪
                </span>
                <span className={styles.dropTitle}>
                  Drop a file here or <span className={styles.browse}>browse</span>
                </span>
                <span className={styles.dropHint}>.txt, .eml or .pdf, up to 5 MB</span>
              </label>
              {file && (
                <div className={styles.fileRow}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>{formatSize(file.size)}</span>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => {
                      setFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={styles.primary} disabled={!canSubmit}>
            {submitting ? (mode === 'upload' ? 'Uploading file…' : 'Adding email…') : 'Analyze email'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
