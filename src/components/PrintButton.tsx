export default function PrintButton({ label = '🖨️ Print' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 no-print"
    >
      {label}
    </button>
  )
}