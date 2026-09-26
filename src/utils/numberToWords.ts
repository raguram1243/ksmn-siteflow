// Indian Rupees Number to Words Converter

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function convertTwoDigits(num: number): string {
  if (num === 0) return ''
  if (num < 20) return ones[num]
  const ten = Math.floor(num / 10)
  const one = num % 10
  return tens[ten] + (one > 0 ? ' ' + ones[one] : '')
}

function convertThreeDigits(num: number): string {
  if (num === 0) return ''
  const hundred = Math.floor(num / 100)
  const remainder = num % 100
  let result = ''
  if (hundred > 0) {
    result = ones[hundred] + ' Hundred'
  }
  if (remainder > 0) {
    result += (result ? ' and ' : '') + convertTwoDigits(remainder)
  }
  return result
}

export function numberToIndianWords(num: number): string {
  if (num === 0) return 'Zero'
  
  const isNegative = num < 0
  num = Math.abs(num)
  
  // Split into rupees and paise
  const rupees = Math.floor(num)
  const paise = Math.round((num - rupees) * 100)
  
  let result = ''
  
  // Convert rupees
  if (rupees === 0) {
    result = 'Zero'
  } else if (rupees < 1000) {
    result = convertThreeDigits(rupees)
  } else {
    // Indian numbering system: thousands, lakhs, crores
    const crore = Math.floor(rupees / 10000000)
    const lakh = Math.floor((rupees % 10000000) / 100000)
    const thousand = Math.floor((rupees % 100000) / 1000)
    const remainder = rupees % 1000
    
    const parts: string[] = []
    
    if (crore > 0) {
      parts.push(convertTwoDigits(crore) + ' Crore')
    }
    if (lakh > 0) {
      parts.push(convertTwoDigits(lakh) + ' Lakh')
    }
    if (thousand > 0) {
      parts.push(convertTwoDigits(thousand) + ' Thousand')
    }
    if (remainder > 0) {
      parts.push(convertThreeDigits(remainder))
    }
    
    result = parts.join(' ')
  }
  
  // Add paise if present
  if (paise > 0) {
    result += ' and ' + convertTwoDigits(paise) + ' Paise'
  }
  
  // Add "Only" suffix
  result += ' Only'
  
  // Add "Rupees" prefix
  result = 'Rupees ' + result
  
  // Handle negative
  if (isNegative) {
    result = 'Minus ' + result
  }
  
  return result
}

export function formatCurrencyInWords(amount: number): string {
  return numberToIndianWords(amount)
}