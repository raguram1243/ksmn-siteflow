import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { jsPDF } from "https://esm.sh/jspdf@2.5.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Number to words converter
function convertToIndianWords(num: number): string {
  if (num === 0) return 'Zero Only'
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  
  function convertTwoDigits(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    const ten = Math.floor(n / 10)
    const one = n % 10
    return tens[ten] + (one > 0 ? ' ' + ones[one] : '')
  }
  
  function convertThreeDigits(n: number): string {
    if (n === 0) return ''
    const hundred = Math.floor(n / 100)
    const remainder = n % 100
    let result = ''
    if (hundred > 0) {
      result = ones[hundred] + ' Hundred'
    }
    if (remainder > 0) {
      result += (result ? ' and ' : '') + convertTwoDigits(remainder)
    }
    return result
  }
  
  const rupees = Math.floor(num)
  const paise = Math.round((num - rupees) * 100)
  
  let result = ''
  
  if (rupees === 0) {
    result = 'Zero'
  } else if (rupees < 1000) {
    result = convertThreeDigits(rupees)
  } else {
    const crore = Math.floor(rupees / 10000000)
    const lakh = Math.floor((rupees % 10000000) / 100000)
    const thousand = Math.floor((rupees % 100000) / 1000)
    const remainder = rupees % 1000
    
    const parts: string[] = []
    
    if (crore > 0) parts.push(convertTwoDigits(crore) + ' Crore')
    if (lakh > 0) parts.push(convertTwoDigits(lakh) + ' Lakh')
    if (thousand > 0) parts.push(convertTwoDigits(thousand) + ' Thousand')
    if (remainder > 0) parts.push(convertThreeDigits(remainder))
    
    result = parts.join(' ')
  }
  
  if (paise > 0) {
    result += ' and ' + convertTwoDigits(paise) + ' Paise'
  }
  
  return 'Rupees ' + result + ' Only'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { payment_id } = await req.json()

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: 'Missing payment_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get payment details with related data
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    console.log(`Fetching details for payment: ${payment_id}`);

    // Fetch payment details - improved query to fetch Rep's name
    const paymentRes = await fetch(
      `${supabaseUrl}/rest/v1/project_payments?id=eq.${payment_id}&select=*,projects!inner(quotation_id,quotations(option_label,profiles!created_by(full_name)),contacts!contact_id(name,site_location))`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!paymentRes.ok) {
      const errorText = await paymentRes.text();
      console.error('Failed to fetch payment details:', paymentRes.status, errorText);
      throw new Error(`Failed to fetch payment details: ${paymentRes.status} ${errorText}`);
    }

    const payments = await paymentRes.json()
    if (!payments || payments.length === 0) {
      console.error('Payment not found for ID:', payment_id);
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payment = payments[0]
    const customerName = payment.projects?.contacts?.name || 'N/A';
    const repName = payment.projects?.quotations?.profiles?.full_name || 'Project Representative';
    const registrationDate = new Date(payment.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    // Fetch approver details (Admin)
    let adminName = 'Administrator'
    if (payment.status === 'approved' && payment.approved_by) {
      const approverRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${payment.approved_by}&select=full_name`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      if (approverRes.ok) {
        const approvers = await approverRes.json()
        if (approvers && approvers.length > 0) {
          adminName = approvers[0].full_name
        }
      }
    }

    // Generate receipt number if not exists
    let receiptNumber = payment.receipt_number
    if (!receiptNumber) {
      const seqRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_next_receipt_number`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      if (seqRes.ok) {
        const seqData = await seqRes.json()
        receiptNumber = seqData || `KSMN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
      } else {
        receiptNumber = `KSMN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
      }
    }

    // Convert amount to words
    const amountInWords = convertToIndianWords(payment.amount)

    // Generate Real PDF using jsPDF
    const doc = new jsPDF();
    
    // Set font
    doc.setFont("helvetica");

    // 1. HEADER REDESIGN (Two-Column Banner)
    // Left: KSMN Branding Text (Placeholder for logo)
    doc.setTextColor(37, 99, 235); // #2563eb
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("KSMN", 15, 30);
    doc.setFontSize(12);
    doc.text("SERVICES", 15, 36);

    // Right: Company Details Banner
    doc.setFillColor(126, 34, 111); // Professional Purple color like in reference
    doc.rect(70, 15, 125, 35, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    
    let headY = 22;
    const drawHeadRow = (label: string, value: string) => {
      doc.setFont("helvetica", "normal");
      doc.text(label, 75, headY);
      doc.setFont("helvetica", "bold");
      doc.text(value, 105, headY);
      headY += 5.5;
    };

    drawHeadRow("Service Provider:", "KSM Nataraja Nadar Firm");
    doc.setFontSize(8);
    drawHeadRow("Address:", "Ambasamudram - Tenkasi Main Road, Kadayam");
    doc.setFontSize(10);
    drawHeadRow("Phone:", "9443164624, 9585414165");
    drawHeadRow("ECA:", `${repName} - 9344173670`);

    // 2. WATERMARK
    doc.saveGraphicsState();
    // @ts-ignore: GState exists in modern jsPDF
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(120);
    doc.setFont("helvetica", "bold");
    doc.text("KSMN", 105, 150, { align: "center", angle: 45 });
    doc.restoreGraphicsState();

    // Receipt Body
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277); // Outer border

    // Title
    doc.setFillColor(240, 249, 255);
    doc.rect(15, 60, 180, 12, "F");
    doc.setTextColor(37, 99, 235);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT RECEIPT", 105, 68, { align: "center" });

    // Receipt Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Receipt No: ${receiptNumber}`, 190, 82, { align: "right" });
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, 15, 82);

    // Details Table
    doc.setFillColor(248, 250, 252);
    doc.rect(15, 90, 180, 60, "F");
    
    let y = 102;
    const drawRow = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 190, y, { align: "right" });
      y += 10;
      doc.setDrawColor(229, 231, 235);
      doc.line(20, y - 4, 190, y - 4);
    };

    drawRow("Received From:", customerName);
    drawRow("Project:", `${payment.projects?.quotations?.option_label || 'N/A'}${payment.projects?.contacts?.site_location ? ' - ' + payment.projects.contacts.site_location : ''}`);
    drawRow("Payment Mode:", payment.payment_mode?.replace('_', ' ').toUpperCase() || 'N/A');
    if (payment.notes) {
      drawRow("Notes:", payment.notes);
    }

    // 3. AMOUNT RECEIVED BOX FIX
    y += 5;
    doc.setFillColor(254, 243, 199); // Light yellow
    doc.setDrawColor(245, 158, 11); // Amber border
    doc.rect(15, y, 180, 30, "F");
    doc.setLineWidth(1);
    doc.line(15, y, 15, y + 30); // Left highlight

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Amount Received:", 20, y + 12);
    // Using Rs. instead of ₹ to ensure correct rendering
    doc.text(`Rs. ${Number(payment.amount).toLocaleString('en-IN')}`, 190, y + 12, { align: "right" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text(amountInWords, 20, y + 22, { maxWidth: 170 });

    // 4. RECEIVED BY SECTION FIX
    y += 50;
    doc.setDrawColor(107, 114, 128);
    doc.setLineWidth(0.2);
    doc.line(20, y, 80, y);
    
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Received From (Customer)", 50, y + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(customerName, 50, y + 10, { align: "center" });
    doc.text(`Reg. Date: ${registrationDate}`, 50, y + 15, { align: "center" });

    // 5. SIGNATORY LINE CHANGE
    doc.line(130, y, 190, y);
    doc.setFont("helvetica", "bold");
    doc.text("For KSM Nataraja Nadar Firm", 160, y + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(adminName, 160, y + 10, { align: "center" });
    doc.setFontSize(8);
    doc.text("(Authorized Signatory)", 160, y + 15, { align: "center" });

    // Footer
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(9);
    doc.text("This is a computer-generated receipt.", 105, 275, { align: "center" });
    doc.text("Professional Painting & Waterproofing Solutions", 105, 280, { align: "center" });

    // Output as Uint8Array
    const pdfOutput = doc.output("arraybuffer");

    // Upload PDF to Supabase Storage
    const fileName = `receipts/${payment_id}/${Date.now()}.pdf`
    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/bills/${fileName}`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/pdf'
        },
        body: pdfOutput
      }
    )

    if (!uploadRes.ok) {
      const uploadError = await uploadRes.text();
      console.error('Failed to upload receipt:', uploadRes.status, uploadError);
      throw new Error(`Failed to upload receipt: ${uploadRes.status} ${uploadError}`);
    }

    const receiptUrl = `${supabaseUrl}/storage/v1/object/public/bills/${fileName}`

    // Update payment record
    await fetch(
      `${supabaseUrl}/rest/v1/project_payments?id=eq.${payment_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receipt_number: receiptNumber,
          receipt_url: fileName
        })
      }
    )

    return new Response(
      JSON.stringify({ 
        success: true, 
        receipt_number: receiptNumber,
        receipt_url: receiptUrl 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error generating receipt:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate receipt' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
