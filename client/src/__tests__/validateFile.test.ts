import { describe, expect, it } from 'vitest'
import { validateFile } from '../components/AddEmailDialog'

const file = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name)

describe('validateFile (Add email dialog)', () => {
  it.each(['email.txt', 'email.eml', 'invoice.PDF'])('accepts %s', (name) => {
    expect(validateFile(file(name, 10))).toBeNull()
  })

  it('rejects unsupported types before uploading', () => {
    expect(validateFile(file('report.docx', 10))).toMatch(/Only .txt, .eml and .pdf/)
  })

  it('rejects empty files', () => {
    expect(validateFile(file('empty.txt', 0))).toMatch(/empty/)
  })

  it('rejects files over 5 MB', () => {
    expect(validateFile(file('big.pdf', 5 * 1024 * 1024 + 1))).toMatch(/larger than 5 MB/)
  })
})
