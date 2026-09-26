import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { SkeletonList } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import DragDropUpload from '../components/DragDropUpload'
import Spinner from '../components/Spinner'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { db } from '../db/indexeddb'
import type { Contact } from '../types/database'
import { useConfirm } from '../contexts/ConfirmContext'

const MAX_FILES = 3

export default function SiteVisitsPage() {
  const { user, role } = useAuth()
  const { addToast, addUndoToast } = useToast()
  const confirm = useConfirm()
  const isOnline = useOnlineStatus()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [visits, setVisits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('visit_date')
  const [showLogVisit, setShowLogVisit] = useState(false)
  const [selectedContact, setSelectedContact] = useState('')
  const [notes, setNotes] = useState('')
  const [photoFiles, setPhotoFiles] = useState<{ dataUrl: string; file?: File }[]>([])
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [mapsLink, setMapsLink] = useState('')
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [locationError, setLocationError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [syncCount, setSyncCount] = useState(0)
  const [selectedVisit, setSelectedVisit] = useState<any>(null)
  const [showVisitDetail, setShowVisitDetail] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Track if form has unsaved changes
  const hasUnsavedChanges = showLogVisit && (
    selectedContact !== '' ||
    notes !== '' ||
    photoFiles.length > 0 ||
    gpsLat !== null ||
    gpsLng !== null
  )

  useUnsavedChanges(hasUnsavedChanges)

  useEffect(() => {
    fetchVisits()
    fetchContacts()
    checkSyncQueue()
  }, [search, sortBy])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchVisits()
      fetchContacts()
      checkSyncQueue()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [search, sortBy])

  async function fetchVisits() {
    setLoading(true)
    let query = supabase.from('site_visits').select('*, contacts(name)').order(sortBy as any, { ascending: false })
    const { data: remoteData } = await query

    const localVisits = await db.siteVisits.where('is_synced').equals(0).toArray()

    let merged = [
      ...(localVisits.map(v => ({ ...v, _local: true })) as any[]),
      ...((remoteData as any[]) || [])
    ]

    if (search) {
      const s = search.toLowerCase()
      merged = merged.filter((v: any) =>
        (v.contacts?.name || '').toLowerCase().includes(s) ||
        (v.notes || '').toLowerCase().includes(s)
      )
    }

    setVisits(merged)
    setLoading(false)
  }

  async function fetchContacts() {
    let query = supabase.from('contacts').select('id, name, phone, site_location, is_lead')
    const { data } = await query.order('name')
    setContacts((data as Contact[]) || [])
  }

  async function checkSyncQueue() {
    const queue = await db.syncQueue.toArray()
    setSyncCount(queue.length)
  }

  // Helper: get all photo urls for a visit (handles backward compat)
  function getPhotoUrls(visit: any): string[] {
    if (visit.photo_urls && Array.isArray(visit.photo_urls) && visit.photo_urls.length > 0) {
      return visit.photo_urls
    }
    if (visit.photo_url && visit.photo_url !== 'pending_upload' && visit.photo_url !== '') {
      return [visit.photo_url]
    }
    return []
  }

  // Camera functions
  function startCamera() {
    setShowCamera(true)
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(err => {
        addToast('Camera access denied. Please allow camera permissions.', 'warning')
        console.error('Camera error:', err)
        setShowCamera(false)
      })
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    stopCamera()
    setPhotoFiles([...photoFiles, { dataUrl }])
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      addToast('Please select a JPG or PNG file', 'warning')
      e.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      addToast('File size must be less than 10MB', 'warning')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      setPhotoFiles([...photoFiles, { dataUrl: ev.target?.result as string, file }])
    }
    reader.readAsDataURL(file)
  }

  function handleFilesSelected(files: File[]) {
    const allowedTypes = ['image/jpeg', 'image/png']
    const maxSize = 10 * 1024 * 1024 // 10MB

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        addToast('Please select JPG or PNG files only', 'warning')
        return
      }
      if (file.size > maxSize) {
        addToast('File size must be less than 10MB', 'warning')
        return
      }
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const newFiles = files.map(file => ({
        dataUrl: ev.target?.result as string,
        file
      }))
      setPhotoFiles([...photoFiles, ...newFiles])
    }
    reader.readAsDataURL(files[0])
  }

  function removeFile(index: number) {
    setPhotoFiles(photoFiles.filter((_, i) => i !== index))
  }

  function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      })
    })
  }

  async function captureGps() {
    setGpsLoading(true)
    setLocationError('')
    try {
      const pos = await getCurrentPosition()
      setGpsLat(pos.coords.latitude)
      setGpsLng(pos.coords.longitude)
    } catch (err: any) {
      addToast('Could not get GPS: ' + err.message, 'error')
    }
    setGpsLoading(false)
  }

  function parseGoogleMapsLink(url: string): { lat: number; lng: number } | null {
    if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps/')) return null
    let match = url.match(/[?&]q=([\d.-]+),([\d.-]+)/)
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
    match = url.match(/@([\d.-]+),([\d.-]+)/)
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
    return null
  }

  function handleParseMapsLink() {
    setLocationError('')
    if (!mapsLink.trim()) { setLocationError('Please paste a Google Maps link'); return }
    const coords = parseGoogleMapsLink(mapsLink)
    if (coords) { setGpsLat(coords.lat); setGpsLng(coords.lng); setMapsLink('') }
    else { setLocationError('Could not parse coordinates. Please use a full Google Maps link, not a shortened one.') }
  }

  function handleManualLatLng() {
    setLocationError('')
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) { setLocationError('Please enter valid numbers for both latitude and longitude'); return }
    if (lat < -90 || lat > 90) { setLocationError('Latitude must be between -90 and 90'); return }
    if (lng < -180 || lng > 180) { setLocationError('Longitude must be between -180 and 180'); return }
    setGpsLat(lat)
    setGpsLng(lng)
    setManualLat('')
    setManualLng('')
  }

  function handleOpenLogVisit() {
    setShowLogVisit(true)
    setPhotoFiles([])
    setGpsLat(null)
    setGpsLng(null)
    setMapsLink('')
    setManualLat('')
    setManualLng('')
    setLocationError('')
    setNotes('')
    setSelectedContact('')
  }

  async function handleCloseLogVisit() {
    if (hasUnsavedChanges) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: 'You have unsaved changes in this visit. Closing now will lose them.',
        confirmLabel: 'Discard',
        tone: 'warning',
      })
      if (!ok) return
    }
    setShowLogVisit(false)
    stopCamera()
  }

  async function handleSubmitVisit() {
    if (!selectedContact || !user) return
    setSubmitting(true)

    const visitId = crypto.randomUUID()
    const photoUrls: string[] = []

    // Upload all photos if online
    if (photoFiles.length > 0 && isOnline) {
      for (let i = 0; i < photoFiles.length; i++) {
        const blob = dataURLtoBlob(photoFiles[i].dataUrl)
        const fileName = `visits/${visitId}_${i}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, blob, { contentType: 'image/jpeg' })
        if (uploadError) {
          console.error('Upload error for file', i, uploadError)
        } else {
          const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)
          photoUrls.push(publicUrl)
        }
      }
    }

    const photoUrlSingle = photoUrls.length > 0 ? photoUrls[0] : (photoFiles.length > 0 ? 'pending_upload' : '')

    const visitData = {
      id: visitId,
      contact_id: selectedContact,
      created_by: user.id,
      visit_date: new Date().toISOString(),
      notes,
      photo_url: photoUrlSingle,
      photo_urls: photoUrls.length > 0 ? photoUrls : (photoFiles.length > 0 ? ['pending_upload'] : []),
      gps_lat: gpsLat || 0,
      gps_lng: gpsLng || 0
    }

    if (isOnline) {
      const { error } = await supabase.from('site_visits').insert(visitData)
      if (error) {
        await saveVisitOffline(visitData)
        addToast('Visit saved offline - will sync when online', 'warning')
      } else {
        addToast('Site visit logged successfully!', 'success')
      }
    } else {
      await saveVisitOffline(visitData)
      addToast('Visit saved offline - will sync when online', 'warning')
    }

    setSubmitting(false)
    handleCloseLogVisit()
    fetchVisits()
    checkSyncQueue()
  }

  async function saveVisitOffline(visitData: any) {
    await db.siteVisits.add({ ...visitData, is_synced: false })
    await db.syncQueue.add({
      table: 'site_visits',
      action: 'create',
      data: visitData,
      created_at: new Date().toISOString(),
      retry_count: 0
    })
  }

  function dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)![1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) { u8arr[n] = bstr.charCodeAt(n) }
    return new Blob([u8arr], { type: mime })
  }

  function isFilePendingUpload(url: string): boolean {
    return url === 'pending_upload'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Site Visits</h2>
          {!isOnline && (
            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full font-medium">Offline Mode</span>
          )}
          {syncCount > 0 && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-medium">{syncCount} pending sync</span>
          )}
        </div>
        <button onClick={handleOpenLogVisit}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">+ Log Visit</button>
      </div>

      <div className="mb-4 flex gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by contact name or notes..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
          <option value="visit_date">Sort by Visit Date</option>
          <option value="created_at">Sort by Created</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <SkeletonList />
        ) : visits.length === 0 ? (
          <EmptyState
            icon="📷"
            title="No site visits yet"
            description="Log your first site visit to start tracking client interactions"
            action={{ label: '+ Log Visit', onClick: handleOpenLogVisit }}
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {visits.map((visit: any) => {
              const urls = getPhotoUrls(visit)
              return (
                <div key={visit.id || visit.local_id} onClick={() => { setSelectedVisit(visit); setShowVisitDetail(true) }}
                  className="p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{visit.contacts?.name || 'Unknown Contact'}</span>
                        {visit._local && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">Pending Sync</span>}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">{visit.notes}</div>
                      <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                        <span>📅 {new Date(visit.visit_date || visit.created_at).toLocaleString()}</span>
                        <span>📍 {visit.gps_lat?.toFixed(4)}, {visit.gps_lng?.toFixed(4)}</span>
                        {urls.length > 0 && <span>📷 {urls.length} photo{urls.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Visit Detail Modal */}
      <Modal isOpen={showVisitDetail} onClose={() => { setShowVisitDetail(false); setSelectedVisit(null) }}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Site Visit Details</h3>
            <p className="text-sm text-gray-500">{selectedVisit?.contacts?.name || 'Unknown Contact'}</p>
            <p className="text-xs text-gray-400">{selectedVisit ? new Date(selectedVisit.visit_date || selectedVisit.created_at).toLocaleString() : ''}</p>
          </div>
          <button onClick={() => { setShowVisitDetail(false); setSelectedVisit(null) }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {selectedVisit && (
          <>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">{selectedVisit.notes || 'No notes'}</p>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-1">GPS Location</h4>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                📍 {selectedVisit.gps_lat?.toFixed(6)}, {selectedVisit.gps_lng?.toFixed(6)}
              </p>
            </div>

            {/* Photos Gallery */}
            {(() => {
              const urls = getPhotoUrls(selectedVisit)
              if (urls.length === 0) return null
              const hasPending = urls.some(u => isFilePendingUpload(u))
              return (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Photos ({urls.length})</h4>
                  {hasPending && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800 mb-2">
                      📷 Some photos pending upload (offline mode)
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {urls.map((url, i) => (
                      isFilePendingUpload(url) ? (
                        <div key={i} className="h-24 rounded border bg-yellow-50 dark:bg-yellow-950 flex items-center justify-center text-xs text-yellow-700 dark:text-yellow-300">Pending upload</div>
                      ) : (
                        <div key={i} className="relative">
                          <img src={url} alt={`Photo ${i + 1}`}
                            className="w-full h-24 object-cover rounded border cursor-pointer"
                            onClick={() => window.open(url, '_blank')}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                              const parent = (e.target as HTMLImageElement).parentElement
                              if (parent) {
                                const msg = document.createElement('p')
                                msg.className = 'text-sm text-amber-600 p-2'
                                msg.textContent = 'Photo unavailable'
                                parent.appendChild(msg)
                              }
                            }}
                          />
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Admin-only Delete */}
            {role === 'admin' && selectedVisit && !selectedVisit._local && (
              <div className="mt-4 pt-4 border-t border-red-200">
                <button
                  onClick={async () => {
                    if (!selectedVisit || deleting) return
                    const ok = await confirm({
                      title: 'Delete site visit?',
                      message: 'This site visit and its details will be permanently removed.',
                      details: 'You can undo this for a short while afterwards.',
                      confirmLabel: 'Delete Visit',
                      tone: 'danger',
                    })
                    if (!ok) return

                    setDeleting(true)
                    try {
                      // Snapshot for undo before deleting
                      const snapshot = { ...selectedVisit }
                      const { error } = await supabase.from('site_visits').delete().eq('id', selectedVisit.id)
                      if (error) {
                        addToast('Error deleting site visit: ' + error.message, 'error')
                        addToast('Failed to delete site visit', 'error')
                        return
                      }

                      setShowVisitDetail(false)
                      setSelectedVisit(null)
                      fetchVisits()
                      addUndoToast('Site visit deleted', async () => {
                        const { id, _local, ...rest } = snapshot as any
                        const { error: restoreError } = await supabase.from('site_visits').insert({
                          ...rest,
                          id: snapshot.id,
                        })
                        if (restoreError) {
                          addToast('Failed to restore site visit', 'error')
                        } else {
                          addToast('Site visit restored', 'success')
                          fetchVisits()
                        }
                      })
                    } finally {
                      setDeleting(false)
                    }
                  }}
                  disabled={deleting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded-md hover:bg-red-100 border border-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {deleting ? <><Spinner /> Deleting…</> : '🗑️ Delete Site Visit'}
                </button>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Log Visit Modal */}
      <Modal isOpen={showLogVisit} onClose={handleCloseLogVisit}>
        <DragDropUpload
          onFilesSelected={handleFilesSelected}
          accept=".jpg,.jpeg,.png"
          maxFiles={MAX_FILES - photoFiles.length}
          clickToUpload={false}
        >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Log Site Visit</h3>
          <button onClick={handleCloseLogVisit} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {!isOnline && (
          <div className="bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 p-3 rounded-md text-sm mb-4">
            You are offline. This visit will be saved locally and synced when you reconnect.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact *</label>
            <select value={selectedContact} onChange={e => setSelectedContact(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
              <option value="">Select a contact...</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.phone || c.site_location}</option>
              ))}
            </select>
          </div>

          {/* Multi-Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photos ({photoFiles.length}/{MAX_FILES})
            </label>

            {/* Camera view */}
            {showCamera && (
              <div className="mb-2 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 bg-black rounded" />
                <div className="mt-2 flex gap-2 justify-center">
                  <button type="button" onClick={capturePhoto}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Capture</button>
                  <button type="button" onClick={stopCamera}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">Cancel</button>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />

            {/* Thumbnail previews */}
            {photoFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {photoFiles.map((pf, i) => (
                  <div key={i} className="relative group">
                    <img src={pf.dataUrl} alt={`Photo ${i + 1}`} className="h-16 w-16 object-cover rounded border" />
                    <button type="button" onClick={() => removeFile(i)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add buttons (hidden at max) */}
            {photoFiles.length < MAX_FILES && !showCamera && (
              <DragDropUpload
                onFilesSelected={handleFilesSelected}
                accept=".jpg,.jpeg,.png"
                maxFiles={MAX_FILES - photoFiles.length}
              >
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer inline-flex items-center px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Choose File
                    <input type="file" accept=".jpg,.jpeg,.png" onChange={handleFileSelect} className="hidden" />
                  </label>
                  <button type="button" onClick={startCamera}
                    className="inline-flex items-center px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open Camera
                  </button>
                </div>
              </DragDropUpload>
            )}
            {photoFiles.length >= MAX_FILES && (
              <p className="text-xs text-gray-500">Maximum {MAX_FILES} photos reached</p>
            )}
          </div>

          {/* GPS Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GPS Location</label>
            {gpsLat && gpsLng ? (
              <div className="text-sm text-gray-600 bg-green-50 dark:bg-green-950 p-2 rounded-md">
                ✅ Location set: {gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}
                <button onClick={() => { setGpsLat(null); setGpsLng(null); setLocationError('') }}
                  className="ml-2 text-red-600 hover:text-red-800 text-xs">Clear</button>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={captureGps} disabled={gpsLoading}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 disabled:opacity-50 w-full">
                  {gpsLoading ? 'Getting GPS...' : '📍 Capture GPS Location'}
                </button>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Or paste Google Maps link:</label>
                  <div className="flex gap-2">
                    <input type="text" value={mapsLink} onChange={e => setMapsLink(e.target.value)}
                      placeholder="https://www.google.com/maps/@..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    <button onClick={handleParseMapsLink}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Parse</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Or enter coordinates manually:</label>
                  <div className="flex gap-2">
                    <input type="number" value={manualLat} onChange={e => setManualLat(e.target.value)}
                      placeholder="Latitude" step="any"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    <input type="number" value={manualLng} onChange={e => setManualLng(e.target.value)}
                      placeholder="Longitude" step="any"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    <button onClick={handleManualLatLng}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">Set</button>
                  </div>
                </div>
              </div>
            )}
            {locationError && <div className="mt-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 p-2 rounded-md">{locationError}</div>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="What did you discuss? Any observations?"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={handleCloseLogVisit}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
          <button onClick={handleSubmitVisit} disabled={submitting || !selectedContact}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Saving...' : isOnline ? 'Save Visit' : 'Save Offline'}
          </button>
        </div>
        </DragDropUpload>
      </Modal>
    </div>
  )
}
