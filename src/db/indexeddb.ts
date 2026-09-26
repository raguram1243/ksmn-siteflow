import Dexie, { type Table } from 'dexie'
import type { SiteVisit } from '../types/database'

// Offline sync queue item
export interface SyncQueueItem {
  id?: number
  table: string
  action: 'create' | 'update'
  data: Record<string, unknown>
  created_at: string
  retry_count: number
}

export class KSMNDB extends Dexie {
  siteVisits!: Table<SiteVisit & { local_id?: number }, number>
  syncQueue!: Table<SyncQueueItem, number>

  constructor() {
    super('ksmn_siteflow')
    this.version(1).stores({
      siteVisits: '++local_id, id, contact_id, created_by, is_synced, created_at',
      syncQueue: '++id, table, created_at, retry_count'
    })
  }
}

export const db = new KSMNDB()