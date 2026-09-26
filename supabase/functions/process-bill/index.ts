import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_base64, mime_type } = await req.json()

    if (!image_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: 'Missing image_base64 or mime_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Bill reading service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = `You are a bill/invoice data extraction assistant. Analyze this bill image and extract:
1. bill_no: The invoice/bill number (e.g., "INV-001", "Bill No: 1234", etc.)
2. amount: The total amount in Indian Rupees (₹) - just the numeric value without currency symbol

Respond ONLY with valid JSON in this exact format:
{"bill_no": "extracted_value_or_null", "amount": "extracted_value_or_null"}

Rules:
- If you cannot confidently identify a field, set it to null
- For amount, extract only the numeric value (e.g., "1500.50" not "₹1,500.50")
- Do not include any text outside the JSON object
- Be conservative - if unsure, return null`

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime_type, data: image_base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 1,
        maxOutputTokens: 1024,
      }
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    )

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', geminiResponse.status, errorText)

      if (geminiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'RATE_LIMIT',
            message: 'Bill reading is temporarily busy, please enter details manually'
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Failed to process bill' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geminiData = await geminiResponse.json()
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!responseText) {
      console.error('Unexpected Gemini response structure:', geminiData)
      return new Response(
        JSON.stringify({ error: 'Invalid response from bill reader' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let extractedData
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      extractedData = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText, parseError)
      return new Response(
        JSON.stringify({ error: 'Failed to parse bill data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = {
      bill_no: extractedData.bill_no === 'null' || extractedData.bill_no === '' ? null : extractedData.bill_no || null,
      amount: extractedData.amount === 'null' || extractedData.amount === '' ? null : extractedData.amount || null
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
