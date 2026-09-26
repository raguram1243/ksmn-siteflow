import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with the user's JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Verify the user is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin' || profile?.is_active !== true) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { action, username, full_name, role, password, targetUserId, newFullName } = await req.json()

    // Initialize admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // ACTION: Create new user
    if (action === 'create') {
      // Validate username format (lowercase letters and numbers only, no spaces, no @)
      const usernameRegex = /^[a-z0-9]+$/
      if (!usernameRegex.test(username)) {
        return new Response(
          JSON.stringify({ error: 'Username must contain only lowercase letters and numbers, no spaces or special characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if username already exists
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single()

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: 'Username already exists' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (role !== 'admin' && role !== 'rep') {
        return new Response(
          JSON.stringify({ error: 'Role must be admin or rep' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Create auth user.
      // The role goes in app_metadata, which only the service role can write; the
      // handle_new_user() trigger reads it from there. user_metadata is user-editable,
      // so it is kept for display only and never trusted for permissions.
      const email = `${username}@ksmn.local`
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          role,
        },
        user_metadata: {
          role,
          full_name,
        },
      })

      if (authError) {
        console.error('Auth error:', authError)
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Update profile to set must_change_password flag
      if (authData.user) {
        await supabaseAdmin
          .from('profiles')
          .update({ must_change_password: true })
          .eq('id', authData.user.id)
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: { 
            id: authData.user?.id, 
            username, 
            full_name, 
            role,
            email 
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: Reset password
    if (action === 'reset_password') {
      const { data: targetUser, error: targetError } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
      
      if (targetError || !targetUser.user) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Generate a random temporary password
      const tempPassword = Math.random().toString(36) + Math.random().toString(36) + 'A1!'

      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { password: tempPassword }
      )

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Set must_change_password flag
      await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', targetUserId)

      return new Response(
        JSON.stringify({ 
          success: true, 
          temporary_password: tempPassword 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: Deactivate user
    if (action === 'deactivate') {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', targetUserId)

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: Reactivate user
    if (action === 'reactivate') {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: true })
        .eq('id', targetUserId)

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: Update user
    if (action === 'update') {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ full_name: newFullName })
        .eq('id', targetUserId)

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: List all users
    if (action === 'list') {
      const { data: profiles, error: listError } = await supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, role, is_active, must_change_password, created_at')
        .order('created_at', { ascending: false })

      if (listError) {
        return new Response(
          JSON.stringify({ error: listError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ users: profiles }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: Delete user
    if (action === 'delete') {
      // Check if this is the last admin
      const { data: allAdmins, error: adminError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true)

      if (adminError) {
        return new Response(
          JSON.stringify({ error: adminError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if target user is an admin
      const { data: targetProfile, error: targetError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', targetUserId)
        .single()

      if (targetError || !targetProfile) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // If deleting an admin, check if they're the last one
      if (targetProfile.role === 'admin' && allAdmins && allAdmins.length <= 1) {
        return new Response(
          JSON.stringify({ error: 'Cannot delete the last admin account. There must always be at least one active admin.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Delete from Supabase Auth (profile will be deleted via ON DELETE CASCADE)
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)

      if (deleteAuthError) {
        return new Response(
          JSON.stringify({ error: deleteAuthError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})