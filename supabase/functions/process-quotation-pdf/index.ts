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
    const { pdf_base64, mime_type } = await req.json()

    if (!pdf_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: 'Missing pdf_base64 or mime_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (mime_type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ error: 'Only PDF files are supported for quotation extraction' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Quotation processing service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = `You are a quotation/invoice data extraction assistant. Analyze this PDF and extract data from a painting service quotation with a "Product" table.

Extract the following information:

1. PRODUCT ROWS: From the "Product" table, extract for EACH row:
   - product_name: The product/service name
   - remarks: The "Remarks - Painting System" text
   - cost: The "Cost" value (numeric only, no currency symbol)

2. ADDITIONAL COSTS (separate from product rows):
   - mechanized_tool_cost: Amount for "Mechanized Tool Used - Sander" (numeric only)
   - masking_kit_cost: Amount for "Masking Kit Usage" (numeric only)
   - discount: Amount for "Discounts" (numeric only)
   - total: The final "Total" value (numeric only)

Respond ONLY with valid JSON in this exact format:
{
  "line_items": [
    {
      "product_name": "extracted_product_name_or_null",
      "remarks": "extracted_remarks_or_null",
      "cost": "extracted_cost_or_null"
    }
  ],
  "mechanized_tool_cost": "extracted_value_or_null",
  "masking_kit_cost": "extracted_value_or_null",
  "discount": "extracted_value_or_null",
  "total": "extracted_value_or_null"
}

Rules:
- If you cannot confidently identify a field, set it to null
- For all numeric values, extract only the numeric value (e.g., "1500.50" not "₹1,500.50")
- Do not include any text outside the JSON object
- Be conservative - if unsure, return null
- If a section (Mechanized Tool, Masking Kit, Discount) is blank or absent, return null for that field
- Extract ALL product rows from the table, even if there are many`

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime_type, data: pdf_base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 1,
        maxOutputTokens: 4096,
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
            message: 'Quotation processing is temporarily busy, please enter details manually'
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Failed to process quotation PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geminiData = await geminiResponse.json()
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!responseText) {
      console.error('Unexpected Gemini response structure:', geminiData)
      return new Response(
        JSON.stringify({ error: 'Invalid response from quotation processor' }),
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
        JSON.stringify({ error: 'Failed to parse quotation data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Helper to clean null values
    const cleanValue = (val: any) => {
      if (val === 'null' || val === '' || val === null || val === undefined) return null
      return val
    }

    const cleanNumeric = (val: any) => {
      const cleaned = cleanValue(val)
      if (cleaned === null) return null
      const num = parseFloat(cleaned)
      return isNaN(num) ? null : num
    }

    // Process line items
    const lineItems = []
    if (extractedData.line_items && Array.isArray(extractedData.line_items)) {
      for (const item of extractedData.line_items) {
        if (item.product_name || item.remarks || item.cost) {
          lineItems.push({
            product_name: cleanValue(item.product_name),
            remarks: cleanValue(item.remarks),
            cost: cleanNumeric(item.cost)
          })
        }
      }
    }

    const result = {
      line_items: lineItems,
      mechanized_tool_cost: cleanNumeric(extractedData.mechanized_tool_cost),
      masking_kit_cost: cleanNumeric(extractedData.masking_kit_cost),
      discount: cleanNumeric(extractedData.discount),
      total: cleanNumeric(extractedData.total)
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