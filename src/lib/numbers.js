// Document number generators (receipt, PO, invoice, loan, return, delivery)
function pad(n, len = 4) {
  return String(n).padStart(len, "0");
}

function datePart() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

function rand(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

export const generateReceiptNumber = () => `RCP-${datePart()}-${rand(5)}`;
export const generatePoNumber = () => `PO-${datePart()}-${rand(4)}`;
export const generateInvoiceNumber = () => `INV-${datePart()}-${rand(4)}`;
export const generateLoanNumber = () => `LN-${datePart()}-${rand(4)}`;
export const generateReturnReference = () => `RTN-${datePart()}-${rand(4)}`;
export const generateOrderNumber = () => `DO-${datePart()}-${rand(4)}`;
