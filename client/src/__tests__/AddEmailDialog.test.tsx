import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { AddEmailDialog } from '../components/AddEmailDialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeAll(() => {
  // jsdom does not implement the modal dialog API.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})

describe('AddEmailDialog submit state', () => {
  it('says "Adding email…" while pasted text is being sent', async () => {
    vi.spyOn(api, 'ingestEmail').mockReturnValue(new Promise(() => {}))
    render(<AddEmailDialog open onClose={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email text'), { target: { value: 'Subject: Hi\n\nHello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze email' }))
    expect(await screen.findByRole('button', { name: 'Adding email…' })).toBeTruthy()
    expect(screen.queryByText(/Uploading/)).toBeNull()
  })

  it('shows the server error inside the dialog and lets the user try again', async () => {
    vi.spyOn(api, 'ingestEmail').mockRejectedValue(new Error('The email is empty.'))
    render(<AddEmailDialog open onClose={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email text'), { target: { value: '   x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze email' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The email is empty.')
    expect(screen.getByRole('button', { name: 'Analyze email' })).toBeTruthy()
  })
})
