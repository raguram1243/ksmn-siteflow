# KSMN SiteFlow - Data Cleanup Guide

This guide will help you safely delete all sample/test data from your Supabase database and storage while preserving user accounts and app configuration.

## 📋 What This Cleanup Does

### ✅ DELETES (All business data):
- **Contacts & Leads** - All contact records (leads are contacts with `is_lead=true`)
- **Site Visits** - All visit records AND their photos from storage
- **Quotations** - All quotation records, line items, AND attachments from storage
- **Projects** - All project records
- **Expenses** - All expense entries AND bill photos/PDFs from storage
- **Payments** - All payment records AND receipts from storage
- **Catalog Items** - All materials and labor entries
- **Adjustments** - All quotation adjustment history

### 🛡️ PRESERVES (Untouched):
- ✅ **User accounts** (admin/rep login credentials)
- ✅ **User profiles** (roles, usernames, settings)
- ✅ **Global settings** (target margin, etc.)
- ✅ **Database schema** (tables remain, just empty)
- ✅ **RLS policies** (security remains intact)

---

## 🚀 Cleanup Process (2 Steps)

### **STEP 1: Delete Storage Files First**

**Why first?** Database rows reference storage paths. If you delete DB rows first, you won't know what files to delete.

#### Option A: Using the Node.js Script (Recommended)

```bash
# 1. Ensure you have a .env file with your Supabase credentials
# If not, create one from .env.example:
cp .env.example .env

# 2. Edit .env and add your actual Supabase credentials:
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# 3. Install dependencies if needed
npm install dotenv @supabase/supabase-js

# 4. Run the storage cleanup script
node supabase-cleanup-storage.js
```

**Expected output:**
```
======================================================================
KSMN SiteFlow - Storage Cleanup
WARNING: This will delete ALL files from storage buckets
======================================================================

⚠️  This will delete ALL files from these buckets:
  - photos (site visit photos)
  - quotations (quotation attachments)
  - bills (expense bills and payment receipts)

🚀 Starting cleanup...

📦 Cleaning bucket: photos
  📄 Found 15 files to delete
  ✅ Deleted 15 files from photos

📦 Cleaning bucket: quotations
  📄 Found 8 files to delete
  ✅ Deleted 8 files from quotations

📦 Cleaning bucket: bills
  📄 Found 23 files to delete
  ✅ Deleted 23 files from bills

======================================================================
✅ Cleanup complete! Total files deleted: 46
======================================================================
```

#### Option B: Manual Deletion via Supabase Dashboard

If you prefer to delete manually:

1. Go to **Supabase Dashboard** → **Storage**
2. For each bucket (`photos`, `quotations`, `bills`):
   - Click the bucket name
   - Click the checkbox at the top to select all files
   - Click **Delete** button
   - Confirm deletion

---

### **STEP 2: Delete Database Records**

Now that storage is clean, delete all database records.

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase-cleanup-all-data.sql`
4. Click **Run** (or press Ctrl+Enter)

**Expected output:**
```
✅ Success. No rows returned

(Verification query results:)
table_name      | count
----------------+-------
contacts        | 0
site_visits     | 0
quotations      | 0
projects        | 0
expense_entries | 0
project_payments| 0
catalog_items   | 0
interaction_notes| 0
quotation_adjustments| 0

(And:)
table_name  | count
------------+-------
profiles    | 2      ← Your admin/rep accounts
auth_users  | 2      ← Same count as profiles
```

---

## ✅ Verification Steps

After running both scripts, verify everything is clean:

### 1. Check Database Tables Are Empty

Run this query in Supabase SQL Editor:

```sql
SELECT 'contacts' as table_name, COUNT(*) as count FROM public.contacts
UNION ALL SELECT 'site_visits', COUNT(*) FROM public.site_visits
UNION ALL SELECT 'quotations', COUNT(*) FROM public.quotations
UNION ALL SELECT 'projects', COUNT(*) FROM public.projects
UNION ALL SELECT 'expense_entries', COUNT(*) FROM public.expense_entries
UNION ALL SELECT 'project_payments', COUNT(*) FROM public.project_payments
UNION ALL SELECT 'catalog_items', COUNT(*) FROM public.catalog_items
UNION ALL SELECT 'interaction_notes', COUNT(*) FROM public.interaction_notes
UNION ALL SELECT 'quotation_adjustments', COUNT(*) FROM public.quotation_adjustments;
```

**Expected:** All counts should be `0`

### 2. Check User Accounts Are Preserved

```sql
SELECT 'profiles' as table_name, COUNT(*) as count FROM public.profiles
UNION ALL SELECT 'auth_users', COUNT(*) FROM auth.users;
```

**Expected:** Count should match your number of users (typically 2: admin + rep)

### 3. Check Storage Buckets Are Empty

In Supabase Dashboard:
- Go to **Storage** → **photos** → Should show "No files"
- Go to **Storage** → **quotations** → Should show "No files"
- Go to **Storage** → **bills** → Should show "No files"

### 4. Test Login

1. Open your app in browser
2. Login with admin account → Should work ✅
3. Login with rep account → Should work ✅
4. Navigate through all pages → Should show empty states ✅

---

## 🔍 What Each Script Does

### `supabase-cleanup-storage.js`

**Purpose:** Deletes all files from Supabase Storage buckets

**Process:**
1. Connects to Supabase using your credentials
2. Lists all files in each bucket (`photos`, `quotations`, `bills`)
3. Deletes all files recursively
4. Reports total files deleted

**Safety:**
- Only deletes files, not database records
- Uses Supabase Storage API (official method)
- Shows progress and counts

### `supabase-cleanup-all-data.sql`

**Purpose:** Deletes all business data from database tables

**Process (in order):**
1. Deletes `project_payments` (child of projects)
2. Deletes `quotation_adjustments` (child of projects)
3. Deletes `expense_entries` (child of projects)
4. Deletes `projects` (parent table)
5. Deletes `quotation_line_items` (child of quotations)
6. Deletes `quotations` (parent table)
7. Deletes `site_visits` (child of contacts)
8. Deletes `interaction_notes` (child of contacts)
9. Deletes `contacts` (parent table - includes leads)
10. Deletes `catalog_items` (standalone)

**Why this order?**
- Respects foreign key constraints
- Deletes children before parents
- Prevents constraint violation errors

**Verification queries included:**
- Counts all business tables (should all be 0)
- Counts user tables (should preserve your accounts)

---

## ⚠️ Important Notes

### Foreign Key Relationships

The deletion order is critical due to foreign key constraints:

```
contacts (1) ←── site_visits (many)
    ↓
    quotations (1) ←── quotation_line_items (many)
    ↓
    projects (1) ←── project_payments (many)
                  ←── expense_entries (many)
                  ←── quotation_adjustments (many)
```

**We delete from children to parents** to avoid constraint errors.

### Why Delete Storage First?

Database rows store file paths like:
- `site_visits.photo_url` = `visits/abc-123.jpg`
- `quotations.attachment_url` = `quotations/xyz-456.pdf`
- `expense_entries.bill_url` = `bills/exp-789.jpg`

If we delete database rows first, we lose these paths and can't find the files to delete. By deleting storage first, we ensure no orphaned files remain.

### What About CASCADE Deletes?

Some tables have `ON DELETE CASCADE` configured (e.g., deleting a contact automatically deletes their site visits). However, we delete explicitly in the correct order to:
1. Have full control over the process
2. See exactly what's being deleted
3. Avoid surprises
4. Make the script work regardless of CASCADE configuration

---

## 🎯 After Cleanup

Your app is now ready for real use:

1. **Empty states everywhere** - All pages show "No X yet" messages
2. **Clean database** - No test/sample data remains
3. **Preserved accounts** - Admin/rep logins work as before
4. **Fresh start** - Ready to add real contacts, leads, projects, etc.

### First Steps with Real Data:

1. **Login as admin**
2. **Add catalog items** (Go to Catalog page)
   - Add materials (cement, sand, etc.)
   - Add labor types (mason, helper, etc.)
3. **Start adding contacts** (Go to Contacts page)
4. **Log site visits** (Go to Site Visits page)
5. **Create quotations** (Go to Quotations page)
6. **Lock quotations** to create projects
7. **Track expenses and payments** on projects

---

## 🆘 Troubleshooting

### "Foreign key constraint violation" error

**Cause:** Trying to delete parent before child

**Solution:** Ensure you run the SQL script in order (it's already ordered correctly in the script)

### "Storage file not found" error

**Cause:** File was already deleted or path is wrong

**Solution:** This is safe to ignore - the file is already gone

### "Permission denied" error

**Cause:** Your Supabase credentials don't have storage delete permissions

**Solution:** 
- Ensure you're using the `anon` key (not `service_role` key)
- Check that your RLS policies allow storage operations
- Verify the buckets exist in Supabase Dashboard

### User accounts not working after cleanup

**Cause:** You accidentally deleted profiles or auth.users

**Solution:** 
- Check the verification query shows profiles count > 0
- If profiles are gone, you'll need to recreate users in Supabase Auth UI
- **Never run DELETE on auth.users or profiles tables**

---

## 📞 Support

If you encounter issues:
1. Check the Supabase SQL Editor logs for error messages
2. Verify your `.env` file has correct credentials
3. Ensure you ran storage cleanup BEFORE database cleanup
4. Double-check that you didn't modify the deletion order

---

## ✅ Final Checklist

Before handing over to real use, confirm:

- [ ] Storage cleanup script ran successfully (all buckets empty)
- [ ] SQL cleanup script ran successfully (no errors)
- [ ] Verification queries show all business tables = 0
- [ ] Verification queries show profiles/auth.users preserved
- [ ] Admin login works
- [ ] Rep login works
- [ ] All pages show empty states (no test data visible)
- [ ] Ready to start adding real data!

---

**You're all set! Your app is now clean and ready for production use.** 🎉