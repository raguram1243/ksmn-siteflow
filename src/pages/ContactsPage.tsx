import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import type { Contact, ContactStatus } from '../types/database'
import { SkeletonList } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import CopyButton from '../components/CopyButton'
import Spinner from '../components/Spinner'

const DELETE_UNDO_SECONDS = 10

export default function ContactsPage() {
  const { user, role } = useAuth()
  const { addToast, addUndoToast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formSite, setFormSite] = useState('')
  const [formReaction, setFormReaction] = useState<ContactStatus>('new')
  const [formSource, setFormSource] = useState('walk-in')
  const [formError, setFormError] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created_at')

  // Edit contact state (admin only)
  const [isEditingContact, setIsEditingContact] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editSite, setEditSite] = useState('')
  const [editReaction, setEditReaction] = useState<ContactStatus>('new')
  const [editSource, setEditSource] = useState('walk-in')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state (admin only): checking dependencies -> undo countdown -> deleting
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)
  const [deletePhase, setDeletePhase] = useState<'checking' | 'countdown' | 'deleting' | null>(null)
  const [deleteSecondsLeft, setDeleteSecondsLeft] = useState(DELETE_UNDO_SECONDS)
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchContacts()
  }, [search, filterStatus, sortBy])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchContacts()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [search, filterStatus, sortBy])

  async function fetchContacts() {
    setLoading(true)
    let query = supabase.from('contacts').select('*')

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,site_location.ilike.%${search}%`)
    }

    if (filterStatus !== 'all') {
      if (filterStatus === 'leads') {
        query = query.eq('is_lead', true)
      } else if (filterStatus === 'contacts') {
        query = query.eq('is_lead', false)
      } else {
        query = query.eq('initial_reaction', filterStatus)
      }
    }

    const { data } = await query.order(sortBy as any, { ascending: false })
    setContacts((data as Contact[]) || [])
    setLoading(false)
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setFormSubmitting(true)

    if (!user) {
      setFormError('You must be logged in')
      setFormSubmitting(false)
      return
    }

    const { error } = await supabase.from('contacts').insert({
      created_by: user.id,
      name: formName,
      phone: formPhone,
      site_location: formSite,
      initial_reaction: formReaction,
      source: formSource,
      date_first_met: new Date().toISOString().split('T')[0]
    })

    setFormSubmitting(false)

    if (error) {
      setFormError(error.message)
      addToast('Failed to add contact', 'error')
      return
    }

    // Reset form and close modal
    setFormName('')
    setFormPhone('')
    setFormSite('')
    setFormReaction('new')
    setFormSource('walk-in')
    setShowAddModal(false)
    fetchContacts()
    addToast('Contact added successfully!', 'success')
  }

  async function promoteToLead(contact: Contact) {
    const { error } = await supabase
      .from('contacts')
      .update({ is_lead: true, lead_status: 'active' })
      .eq('id', contact.id)

    if (!error) {
      fetchContacts()
      addToast(`${contact.name} promoted to lead!`, 'success')
    } else {
      addToast('Failed to promote contact', 'error')
    }
  }

  async function fetchNotes(contactId: string) {
    const { data } = await supabase
      .from('interaction_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
    setNotes((data as any[]) || [])
  }

  async function addNote(contactId: string) {
    if (!newNote.trim() || !user) return
    await supabase.from('interaction_notes').insert({
      contact_id: contactId,
      created_by: user.id,
      note: newNote
    })
    setNewNote('')
    fetchNotes(contactId)
  }

  async function saveContactEdit(contactId: string) {
    setEditError('')
    if (!editName.trim()) {
      setEditError('Name is required')
      return
    }
    setEditSubmitting(true)
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editName,
        phone: editPhone,
        site_location: editSite,
        initial_reaction: editReaction,
        source: editSource
      })
      .eq('id', contactId)

    setEditSubmitting(false)

    if (error) {
      addToast('Failed to update contact', 'error')
      setEditError(error.message)
      return
    }

    if (selectedContact) {
      setSelectedContact({
        ...selectedContact,
        name: editName,
        phone: editPhone,
        site_location: editSite,
        initial_reaction: editReaction,
        source: editSource
      })
    }
    fetchContacts()
    setIsEditingContact(false)
    addToast('Contact updated successfully!', 'success')
  }

  function resetDeleteState() {
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    deleteTimeoutRef.current = null
    countdownIntervalRef.current = null
    setDeletingContactId(null)
    setDeletePhase(null)
    setDeleteSecondsLeft(DELETE_UNDO_SECONDS)
  }

  async function handleDeleteContact(contact: Contact) {
    // Ignore repeated clicks while a delete is already in progress
    if (deletingContactId) return
    setDeletingContactId(contact.id)
    setDeletePhase('checking')

    // Check for dependent records BEFORE showing undo toast
    const { data: siteVisits } = await supabase
      .from('site_visits')
      .select('id')
      .eq('contact_id', contact.id)
      .limit(1)

    if (siteVisits && siteVisits.length > 0) {
      resetDeleteState()
      addToast('Cannot delete this contact — it has site visits logged. Delete the site visits first.', 'warning')
      return
    }

    if (contact.is_lead) {
      const { data: quotations } = await supabase
        .from('quotations')
        .select('id')
        .eq('lead_id', contact.id)
        .limit(1)

      if (quotations && quotations.length > 0) {
        resetDeleteState()
        addToast('Cannot delete this contact — it has quotations attached. Archive or remove the quotations first.', 'warning')
        return
      }
    }

    // Undo window; actual deletion happens after the countdown
    setDeletePhase('countdown')
    setDeleteSecondsLeft(DELETE_UNDO_SECONDS)
    countdownIntervalRef.current = setInterval(() => {
      setDeleteSecondsLeft(s => Math.max(s - 1, 0))
    }, 1000)

    addUndoToast(
      `Contact "${contact.name}" deleted.`,
      () => {
        // Undo clicked — cancel the pending deletion
        resetDeleteState()
        addToast('Deletion cancelled', 'info')
      },
      DELETE_UNDO_SECONDS * 1000
    )

    deleteTimeoutRef.current = setTimeout(async () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
      setDeletePhase('deleting')

      const { error } = await supabase.from('contacts').delete().eq('id', contact.id)
      resetDeleteState()
      if (error) {
        addToast('Error deleting contact: ' + error.message, 'error')
        addToast('Failed to delete contact', 'error')
      } else {
        setShowNotes(false)
        setSelectedContact(null)
        fetchContacts()
        addToast('Contact deleted successfully', 'success')
      }
    }, DELETE_UNDO_SECONDS * 1000)
  }

  function openContactDetail(contact: Contact) {
    setSelectedContact(contact)
    setShowNotes(true)
    fetchNotes(contact.id)
    // Pre-fill edit fields
    setEditName(contact.name)
    setEditPhone(contact.phone || '')
    setEditSite(contact.site_location || '')
    setEditReaction(contact.initial_reaction)
    setEditSource(contact.source || 'walk-in')
    setIsEditingContact(false)
    setEditError('')
  }

  const statusBadge = (contact: Contact) => {
    if (contact.is_lead) return <StatusBadge tone="green">Lead</StatusBadge>
    if (contact.initial_reaction === 'interested') return <StatusBadge tone="yellow">Interested</StatusBadge>
    if (contact.initial_reaction === 'not_interested') return <StatusBadge tone="red">Not Interested</StatusBadge>
    if (contact.initial_reaction === 'thinking') return <StatusBadge tone="blue">Thinking</StatusBadge>
    return <StatusBadge>{contact.initial_reaction}</StatusBadge>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Contacts & Prospects</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          + Add Contact
        </button>
      </div>

      {/* Search, Filter, Sort */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or site..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500"
          >
            <option value="all">All Contacts</option>
            <option value="leads">Leads Only</option>
            <option value="contacts">Contacts Only</option>
            <option value="interested">Interested</option>
            <option value="not_interested">Not Interested</option>
            <option value="thinking">Thinking</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500"
          >
            <option value="created_at">Sort by Date</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      {/* Contacts List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <SkeletonList />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No contacts yet"
            description="Add your first contact to start building your pipeline"
            action={{ label: '+ Add Contact', onClick: () => setShowAddModal(true) }}
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between touch-manipulation"
                onClick={() => openContactDetail(contact)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                    {statusBadge(contact)}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {contact.phone && (
                      <span className="mr-4 inline-flex items-center gap-1">
                        📞 {contact.phone}
                        <CopyButton text={contact.phone} label="Phone" />
                      </span>
                    )}
                    {contact.site_location && (
                      <span className="inline-flex items-center gap-1">
                        📍 {contact.site_location}
                        <CopyButton text={contact.site_location} label="Site address" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Met: {new Date(contact.date_first_met).toLocaleDateString()} | Source: {contact.source}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!contact.is_lead && (
                    <button
                      onClick={(e) => { e.stopPropagation(); promoteToLead(contact) }}
                      className="px-3 py-2 text-xs font-medium text-green-700 bg-green-100 rounded-full hover:bg-green-200 touch-manipulation"
                    >
                      Promote to Lead
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)}>
        <h3 className="text-lg font-semibold mb-4">Add New Contact</h3>
        <form onSubmit={handleAddContact}>
          {formError && (
            <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-4">{formError}</div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input type="text" required value={formName} onChange={e => setFormName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Site Location</label>
              <input type="text" value={formSite} onChange={e => setFormSite(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Initial Reaction</label>
              <select value={formReaction} onChange={e => setFormReaction(e.target.value as ContactStatus)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                <option value="new">New</option>
                <option value="interested">Interested</option>
                <option value="not_interested">Not Interested</option>
                <option value="thinking">Thinking</option>
                <option value="no_response">No Response</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Source</label>
              <select value={formSource} onChange={e => setFormSource(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                <option value="walk-in">Walk-in</option>
                <option value="referral">Referral</option>
                <option value="site-visit">Site Visit</option>
                <option value="cold-calling">Cold Calling</option>
                <option value="online-client">Online Client</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={formSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {formSubmitting ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Contact Detail Modal with Notes */}
      <Modal isOpen={showNotes} onClose={() => { setShowNotes(false); setSelectedContact(null); setIsEditingContact(false) }}>
        {isEditingContact && selectedContact ? (
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3">Edit Contact</h3>
            {editError && (
              <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-3">{editError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name *</label>
                <input type="text" required value={editName} onChange={e => setEditName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Site Location</label>
                <input type="text" value={editSite} onChange={e => setEditSite(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Initial Reaction</label>
                <select value={editReaction} onChange={e => setEditReaction(e.target.value as ContactStatus)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                  <option value="new">New</option>
                  <option value="interested">Interested</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="thinking">Thinking</option>
                  <option value="no_response">No Response</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Source</label>
                <select value={editSource} onChange={e => setEditSource(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                  <option value="walk-in">Walk-in</option>
                  <option value="referral">Referral</option>
                  <option value="site-visit">Site Visit</option>
                  <option value="cold-calling">Cold Calling</option>
                  <option value="online-client">Online Client</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => {
                setIsEditingContact(false)
                setEditError('')
                if (selectedContact) {
                  setEditName(selectedContact.name)
                  setEditPhone(selectedContact.phone || '')
                  setEditSite(selectedContact.site_location || '')
                  setEditReaction(selectedContact.initial_reaction)
                  setEditSource(selectedContact.source || 'walk-in')
                }
              }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                Cancel
              </button>
              <button type="button" disabled={editSubmitting} onClick={() => selectedContact && saveContactEdit(selectedContact.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                {editSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-start mb-4">
            {selectedContact && (
              <div>
                <h3 className="text-lg font-semibold">{selectedContact.name}</h3>
                <p className="text-sm text-gray-500">{selectedContact.phone} | {selectedContact.site_location}</p>
                <p className="text-xs text-gray-400">Met: {new Date(selectedContact.date_first_met).toLocaleDateString()} | {selectedContact.source}</p>
              </div>
            )}
            <button onClick={() => { setShowNotes(false); setSelectedContact(null) }}
              className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
        )}

        {/* Interaction History */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Interaction History</h4>
          <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-sm text-gray-400">No notes yet</p>
            ) : (
              notes.map((note: any) => (
                <div key={note.id} className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-700">{note.note}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(note.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(selectedContact!.id) } }}
            />
            <button onClick={() => selectedContact && addNote(selectedContact.id)}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              Add
            </button>
          </div>
        </div>

        {/* Promote to Lead if not already */}
        {selectedContact && !selectedContact.is_lead && (
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => { promoteToLead(selectedContact); setShowNotes(false) }}
              className="w-full px-4 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200"
            >
              Promote to Lead
            </button>
          </div>
        )}

        {/* Admin-only Edit */}
        {role === 'admin' && selectedContact && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <button
              onClick={() => setIsEditingContact(true)}
              className="w-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 rounded-md hover:bg-blue-100 border border-blue-200 mb-2"
            >
              ✏️ Edit Contact
            </button>
          </div>
        )}

        {/* Admin-only Delete */}
        {role === 'admin' && selectedContact && (
          <div className="mt-4 pt-4 border-t border-red-200">
            <button
              onClick={() => handleDeleteContact(selectedContact)}
              disabled={deletingContactId !== null}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded-md hover:bg-red-100 border border-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deletingContactId === null ? (
                '🗑️ Delete Contact'
              ) : deletingContactId !== selectedContact.id ? (
                'Another contact is being deleted…'
              ) : deletePhase === 'checking' ? (
                <><Spinner /> Checking…</>
              ) : deletePhase === 'countdown' ? (
                <><Spinner /> Deleting in {deleteSecondsLeft}s… (Undo in toast)</>
              ) : (
                <><Spinner /> Deleting…</>
              )}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
