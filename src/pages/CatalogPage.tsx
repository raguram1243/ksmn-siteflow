import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import type { CatalogItem } from '../types/database'
import Spinner from '../components/Spinner'

export default function CatalogPage() {
  const { user, role } = useAuth()
  const { addToast, addUndoToast } = useToast()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formUnit, setFormUnit] = useState('unit')
  const [formRate, setFormRate] = useState('')
  const [formCategory, setFormCategory] = useState<'material' | 'labor'>('material')
  const [formError, setFormError] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  useEffect(() => { fetchCatalog() }, [search, filterCategory])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchCatalog()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [search, filterCategory])

  async function fetchCatalog() {
    setLoading(true)
    let query = supabase.from('catalog_items').select('*').order('category').order('name')
    
    if (filterCategory !== 'all') {
      query = query.eq('category', filterCategory)
    }
    
    const { data } = await query
    let items = (data as CatalogItem[]) || []
    
    if (search) {
      const s = search.toLowerCase()
      items = items.filter(item => 
        item.name.toLowerCase().includes(s) ||
        item.unit.toLowerCase().includes(s)
      )
    }
    
    setItems(items)
    setLoading(false)
  }

  function openAdd() {
    setEditItem(null)
    setFormName('')
    setFormUnit('unit')
    setFormRate('')
    setFormCategory('material')
    setFormError('')
    setShowAddModal(true)
  }

  function openEdit(item: CatalogItem) {
    setEditItem(item)
    setFormName(item.name)
    setFormUnit(item.unit)
    setFormRate(String(item.standard_rate))
    setFormCategory(item.category)
    setFormError('')
    setShowAddModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setFormSubmitting(true)

    const rate = parseFloat(formRate)
    if (isNaN(rate) || rate < 0) {
      setFormError('Please enter a valid rate')
      setFormSubmitting(false)
      return
    }

    const data = {
      name: formName,
      unit: formUnit,
      standard_rate: rate,
      category: formCategory,
      created_by: user!.id
    }

    if (editItem) {
      const { error } = await supabase.from('catalog_items').update(data).eq('id', editItem.id)
      if (error) { setFormError(error.message); setFormSubmitting(false); return }
    } else {
      const { error } = await supabase.from('catalog_items').insert(data)
      if (error) { setFormError(error.message); setFormSubmitting(false); return }
    }

    setFormSubmitting(false)
    setShowAddModal(false)
    fetchCatalog()
  }

  async function handleDelete(id: string) {
    if (deletingId) return
    if (!confirm('Are you sure you want to delete this item?')) return

    // Store item data for potential undo
    const deletedItem = items.find(item => item.id === id)
    if (!deletedItem) return

    setDeletingId(id)
    try {
      const { error } = await supabase.from('catalog_items').delete().eq('id', id)
      if (error) {
        addToast('Failed to delete catalog item', 'error')
        return
      }
      await fetchCatalog()
    } finally {
      setDeletingId(null)
    }
    
    // Show undo toast
    addUndoToast(
      'Catalog item deleted successfully',
      async () => {
        // Restore the catalog item
        const { error: restoreError } = await supabase.from('catalog_items').insert({
          id: deletedItem.id,
          name: deletedItem.name,
          unit: deletedItem.unit,
          standard_rate: deletedItem.standard_rate,
          category: deletedItem.category,
          created_by: deletedItem.created_by
        })
        
        if (restoreError) {
          console.error('Error restoring catalog item:', restoreError)
          addToast('Failed to restore catalog item', 'error')
          return
        }
        
        fetchCatalog()
        addToast('Catalog item restored successfully', 'success')
      }
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Product Catalog</h2>
        <button onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + Add Item
        </button>
      </div>

      {/* Search and Filter */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search catalog..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          <option value="material">Materials</option>
          <option value="labor">Labor</option>
        </select>
      </div>

      <div className="space-y-4">
        {/* Material Items */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-950 px-6 py-3 border-b">
            <h3 className="text-sm font-semibold text-blue-800">Materials</h3>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : items.filter(i => i.category === 'material').length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No material items yet</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {items.filter(i => i.category === 'material').map(item => (
                <div key={item.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                    <span className="ml-2 text-sm text-gray-500">({item.unit})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">₹{item.standard_rate}/{item.unit}</span>
                    {role === 'admin' && (
                      <>
                        <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                        <button onClick={() => handleDelete(item.id)} disabled={deletingId !== null}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed">
                          {deletingId === item.id ? <><Spinner className="h-3 w-3" /> Deleting…</> : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Labor Items */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-purple-50 dark:bg-purple-950 px-6 py-3 border-b">
            <h3 className="text-sm font-semibold text-purple-800">Labor</h3>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : items.filter(i => i.category === 'labor').length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No labor items yet</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {items.filter(i => i.category === 'labor').map(item => (
                <div key={item.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                    <span className="ml-2 text-sm text-gray-500">({item.unit})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">₹{item.standard_rate}/{item.unit}</span>
                    {role === 'admin' && (
                      <>
                        <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                        <button onClick={() => handleDelete(item.id)} disabled={deletingId !== null}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed">
                          {deletingId === item.id ? <><Spinner className="h-3 w-3" /> Deleting…</> : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">{editItem ? 'Edit Item' : 'Add Catalog Item'}</h3>
            <form onSubmit={handleSubmit}>
              {formError && <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-4">{formError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input type="text" required value={formName} onChange={e => setFormName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Unit *</label>
                    <input type="text" required value={formUnit} onChange={e => setFormUnit(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Rate (₹) *</label>
                    <input type="number" required min="0" step="0.01" value={formRate} onChange={e => setFormRate(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category *</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value as 'material' | 'labor')}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    <option value="material">Material</option>
                    <option value="labor">Labor</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {formSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}