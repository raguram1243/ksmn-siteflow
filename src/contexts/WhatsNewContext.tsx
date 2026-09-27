import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface WhatsNewItem {
  version: string
  date: string
  title: string
  description: string
  features: string[]
}

interface WhatsNewContextType {
  items: WhatsNewItem[]
  lastViewedVersion: string | null
  markAsViewed: (version: string) => void
  hasNewUpdates: boolean
}

const WhatsNewContext = createContext<WhatsNewContextType | undefined>(undefined)

const CHANGELOG_KEY = 'ksmn-whatsnew-lastviewed'

const changelog: WhatsNewItem[] = [
  {
    version: '1.9.0',
    date: '2026-09-27',
    title: 'Visual Refresh & Design System',
    description: 'A cleaner, more consistent look across the whole app, plus a new typeface and working dark mode in every chart.',
    features: [
      'New Inter typeface across the app for a sharper, more modern feel',
      'Centralised design tokens (brand + accent colour scales) as a single source of truth',
      'All charts now use the brand palette instead of hardcoded colours',
      'Chart grid lines and axes now adapt to dark mode',
      'Conversion funnel uses a single-hue progression so it reads as one journey narrowing',
      'Margin trend line is colour-coded: green above target, amber below, red at a loss',
      'Notification bell redesigned with Alerts and Approvals tabs',
      'Mark notifications as read/unread, delete them, or mark all read at once',
      'Login card and offline banner restyled to match the new theme'
    ]
  },
  {
    version: '1.8.0',
    date: '2026-09-26',
    title: 'Dashboard Analytics, Global Search & Profitability Report',
    description: 'See what needs your attention today, find anything in two keystrokes, and see where every project actually made money.',
    features: [
      'Alerts for overdue client payments, overdue lead follow-ups and projects below target margin',
      'Global search: press Ctrl+K to jump to any page, contact, project, quotation or catalog item',
      'New Profitability Report showing per-project margin vs target, worst performers first',
      'Profitability Report can be exported to CSV or printed',
      'New dashboard cards for collected-this-month and collection health',
      'Charts for expenses by category and payments by mode',
      'Dashboard refresh throttling to cut down on unnecessary data fetching',
      'In-app confirm and prompt dialogs replace the browser popups',
      'Undo now available for deleting leads, site visits and quotations',
      'Error boundary so an unexpected error shows a recovery screen instead of a blank page'
    ]
  },
  {
    version: '1.7.0',
    date: '2026-09-15',
    title: 'Expense Approval Workflow',
    description: 'Expenses entered by reps now go through admin approval, just like client payments.',
    features: [
      'Rep expenses start as Pending and only count toward project cost after admin approval',
      'Admins can approve or reject expenses (with a reason) from the Expenses page, after reviewing the bills',
      'Pending expenses appear in the admin notification bell',
      'Expense line items are now shown in the expense details'
    ]
  },
  {
    version: '1.6.0',
    date: '2026-08-02',
    title: 'Enhanced User Experience & Productivity Features',
    description: 'We have added several quality-of-life improvements to make your workflow smoother.',
    features: [
      'Dark mode fix complete',
      'Display-text rename complete — "Payments" → "Client Payments (Collection)" / "Client Payments"',
      'Edit Contact feature added',
      'Bug fixes and performance improvements across all modules'
    ]
  },
  {
    version: '1.5.0',
    date: '2026-07-27',
    title: 'Enhanced User Experience & Productivity Features',
    description: 'We have added several quality-of-life improvements to make your workflow smoother.',
    features: [
      'Undo delete functionality - Accidentally deleted something? You can now undo deletions with a single click',
      'Unsaved changes protection - Get warned before closing forms with unsaved data to prevent data loss',
      'Improved toast notifications - Better visual feedback with undo actions for critical operations',
      'Enhanced offline mode - More reliable sync queue management for site visits',
      'Bug fixes and performance improvements across all modules'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-07-25',
    title: 'PDF Processing & Multi-File Attachments',
    description: 'Work with documents more efficiently than ever.',
    features: [
      'Automatic PDF data extraction - Upload quotation PDFs and auto-fill form fields',
      'Multi-file attachments - Attach up to 3 files per quotation or expense',
      'Camera integration - Take photos directly from the app for site visits and bills',
      'Bill number recognition - AI-powered bill reading extracts bill numbers automatically',
      'Improved file management - Better preview and organization of attachments'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-07-21',
    title: 'Advanced Analytics & Reporting',
    description: 'Gain deeper insights into your business performance.',
    features: [
      'Monthly expense comparison - Track spending trends month over month',
      'Category breakdown - See where your money goes with detailed category analysis',
      'Top projects by expense - Identify which projects are driving costs',
      'Average expense per project - Benchmark your project costs',
      'Enhanced admin dashboard with real-time statistics'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-07-10',
    title: 'Site Visits & Offline Mode',
    description: 'Stay productive even without internet connectivity.',
    features: [
      'Site visit logging - Track client visits with photos, GPS, and notes',
      'Offline mode - Work without internet and sync when you reconnect',
      'GPS location capture - Automatically capture visit locations',
      'Photo attachments - Document visits with multiple photos',
      'Sync queue management - Monitor pending uploads and sync status'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-07-08',
    title: 'Quotation Management',
    description: 'Streamline your quotation workflow.',
    features: [
      'Create and manage quotations with line items',
      'Client approval workflow - Track quotation approvals',
      'Admin lock and project creation - Convert quotations to projects',
      'PDF attachment support - Attach quotation documents',
      'Quotation status tracking - Draft, pending, locked, and archived states'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-07-07',
    title: 'Welcome to KSMN SiteFlow',
    description: 'The complete site management solution for your business.',
    features: [
      'Contact and lead management',
      'Project tracking with cost and payment monitoring',
      'Expense entry with bill uploads',
      'Payment recording and receipt generation',
      'User management and role-based access',
      'Product catalog for materials and labor'
    ]
  }
]

export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const [lastViewedVersion, setLastViewedVersion] = useState<string | null>(null)
  const [items] = useState<WhatsNewItem[]>(changelog)

  useEffect(() => {
    const stored = localStorage.getItem(CHANGELOG_KEY)
    if (stored) {
      setLastViewedVersion(stored)
    }
  }, [])

  const markAsViewed = (version: string) => {
    localStorage.setItem(CHANGELOG_KEY, version)
    setLastViewedVersion(version)
  }

  const hasNewUpdates = lastViewedVersion !== items[0]?.version

  return (
    <WhatsNewContext.Provider value={{ items, lastViewedVersion, markAsViewed, hasNewUpdates }}>
      {children}
    </WhatsNewContext.Provider>
  )
}

export function useWhatsNew() {
  const context = useContext(WhatsNewContext)
  if (context === undefined) {
    throw new Error('useWhatsNew must be used within a WhatsNewProvider')
  }
  return context
}