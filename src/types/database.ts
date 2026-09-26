// Database type definitions for KSMN SiteFlow

export type UserRole = 'admin' | 'rep'

export interface Profile {
  id: string
  username: string
  role: UserRole
  full_name: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
}

export type ContactStatus = 'new' | 'interested' | 'not_interested' | 'thinking' | 'no_response'
export type LeadStatus = 'active' | 'quotation_sent' | 'quotation_selected' | 'confirmed' | 'lost'

export interface Contact {
  id: string
  created_by: string
  name: string
  phone: string
  site_location: string
  site_lat: number | null
  site_lng: number | null
  date_first_met: string
  initial_reaction: ContactStatus
  source: string
  is_lead: boolean
  lead_status: LeadStatus | null
  created_at: string
  updated_at: string
}

export interface InteractionNote {
  id: string
  contact_id: string
  created_by: string
  note: string
  created_at: string
}

export interface SiteVisit {
  id: string
  contact_id: string
  created_by: string
  visit_date: string
  notes: string
  photo_url: string
  gps_lat: number
  gps_lng: number
  is_synced: boolean
  created_at: string
}

export interface CatalogItem {
  id: string
  name: string
  unit: string
  standard_rate: number
  category: 'material' | 'labor'
  created_by: string
  created_at: string
  updated_at: string
}

export interface Quotation {
  id: string
  lead_id: string
  created_by: string
  option_label: string
  is_selected: boolean
  is_archived: boolean
  total_value: number
  client_approved: boolean
  admin_locked: boolean
  attachment_url: string | null
  attachment_urls: string[]
  mechanized_tool_cost: number
  masking_kit_cost: number
  discount_amount: number
  created_at: string
  updated_at: string
  contacts?: { name: string }
  profiles?: { full_name: string }
}

export interface QuotationLineItem {
  id: string
  quotation_id: string
  catalog_item_id: string | null
  description: string
  quantity: number
  unit: string
  rate: number
  amount: number
  is_custom: boolean
  notes: string
}

export interface Project {
  id: string
  quotation_id: string
  lead_id: string
  contact_id: string
  baseline_quotation_value: number
  adjusted_quotation_value: number | null
  target_margin_percent: number
  actual_cost_total: number
  status: 'in_progress' | 'completed' | 'closed'
  closed_at: string | null
  closed_by: string | null
  created_at: string
  updated_at: string
  quotations?: { option_label: string; created_by: string }
  contacts?: { name: string; phone: string; site_location: string }
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ExpenseLineItem {
  id: string
  expense_id: string
  description: string
  amount: number
}

export interface ExpenseEntry {
  id: string
  project_id: string
  created_by: string
  item_name: string
  amount: number
  date: string
  category: string
  bill_no: string | null
  bill_url: string | null
  bill_urls: string[]
  status: ApprovalStatus
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  expense_line_items?: ExpenseLineItem[]
}

// Profit view (admin-only - enforced via RLS)
export interface ProjectProfitView {
  project_id: string
  contact_name: string
  quotation_value: number
  actual_cost: number
  profit_amount: number
  margin_percent: number
  margin_status: 'above_target' | 'on_target' | 'below_target' | 'loss'
  target_margin: number
}

// Pending approval for admin dashboard
export interface PendingApproval {
  id: string
  lead_id: string
  contact_name: string
  option_label: string
  total_value: number
  created_at: string
}
