/** Generate deterministic, text-readable sample PDFs. No dependencies or real data. */
import { mkdir, writeFile } from "node:fs/promises"
const directory = new URL("../examples/documents/", import.meta.url)
const documents = [
  {
    file: "2026-07_internet_invoice.pdf",
    title: "Internet invoice",
    issuer: "Fibre & Fern",
    reference: "FF-2026-0701",
    date: "2026-07-01",
    kind: "Invoice",
    folder: "Documents/Finance/Invoices/2026",
    tags: ["home", "internet", "invoice"],
    amount: 39,
    lines: [
      "Customer: Camille Martin (fictional)",
      "Service period: 01 July - 31 July 2026",
      "Home fibre subscription: EUR 32.50",
      "VAT (20%): EUR 6.50",
      "Total including VAT: EUR 39.00",
      "Payment received on 05 July 2026.",
    ],
  },
  {
    file: "2026-08_internet_invoice.pdf",
    title: "Internet invoice",
    issuer: "Fibre & Fern",
    reference: "FF-2026-0801",
    date: "2026-08-01",
    kind: "Invoice",
    folder: "Documents/Finance/Invoices/2026",
    tags: ["home", "internet", "invoice"],
    amount: 39,
    lines: [
      "Customer: Camille Martin (fictional)",
      "Service period: 01 August - 31 August 2026",
      "Home fibre subscription: EUR 32.50",
      "VAT (20%): EUR 6.50",
      "Total including VAT: EUR 39.00",
      "Payment received on 05 August 2026.",
    ],
  },
  {
    file: "2026-09_internet_invoice.pdf",
    title: "Internet invoice",
    issuer: "Fibre & Fern",
    reference: "FF-2026-0901",
    date: "2026-09-01",
    kind: "Invoice",
    folder: "Documents/Finance/Invoices/2026",
    tags: ["home", "internet", "invoice"],
    amount: 39,
    lines: [
      "Customer: Camille Martin (fictional)",
      "Service period: 01 September - 30 September 2026",
      "Home fibre subscription: EUR 32.50",
      "VAT (20%): EUR 6.50",
      "Total including VAT: EUR 39.00",
      "Payment received on 05 September 2026.",
    ],
  },
  {
    file: "2026_apartment_lease.pdf",
    title: "Apartment lease",
    issuer: "Willow Homes",
    reference: "WH-LEASE-042",
    date: "2026-01-15",
    kind: "Contract",
    folder: "Documents/Home/Housing",
    tags: ["home", "housing", "contract"],
    lines: [
      "Tenant: Camille Martin (fictional)",
      "Property: 12 Example Lane, Demo City (fictional)",
      "Lease start: 01 February 2026",
      "Monthly rent: EUR 850.00; service charges: EUR 50.00",
      "Security deposit: EUR 850.00",
      "Clause 8 - Notice period",
      "For this fictional agreement, the tenant gives one month's",
      "written notice before departure. Notice begins on receipt.",
      "This sample is not a legal template or legal advice.",
    ],
  },
  {
    file: "2026_dishwasher_warranty.pdf",
    title: "Dishwasher warranty",
    issuer: "Atelier Home",
    reference: "AH-DW-2026-014",
    date: "2026-03-12",
    kind: "Certificate",
    folder: "Documents/Home/Equipment",
    tags: ["home", "equipment", "warranty"],
    lines: [
      "Customer: Camille Martin (fictional)",
      "Product: Atelier DW-400 dishwasher (fictional)",
      "Purchase date: 12 March 2026",
      "Purchase price: EUR 449.00",
      "Commercial warranty: 24 months from purchase",
      "Warranty end date: 12 March 2028",
      "Coverage: parts and labour for manufacturing defects.",
      "Exclusions: accidental damage and incorrect installation.",
      "Keep this certificate and the original purchase receipt.",
    ],
  },
  {
    file: "2026_home_insurance.pdf",
    title: "Home insurance",
    issuer: "Cedar Mutual",
    reference: "CM-HOME-2026-008",
    date: "2026-02-01",
    kind: "Certificate",
    folder: "Documents/Home/Insurance",
    tags: ["home", "insurance"],
    lines: [
      "Policyholder: Camille Martin (fictional)",
      "Property: 12 Example Lane, Demo City (fictional)",
      "Cover period: 01 February 2026 - 31 January 2027",
      "Annual premium: EUR 216.00",
      "Covered events: fire, water damage and theft.",
      "Standard excess: EUR 150.00 per claim.",
      "This fictional certificate does not provide insurance.",
    ],
  },
]
const escape = (value) =>
  value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
function pdf(doc) {
  const text = (value, x, y, size = 12, color = "0.17 0.22 0.20") =>
    `BT /F1 ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${escape(value)}) Tj ET\n`
  let stream =
    "0.98 0.97 0.94 rg 0 0 595 842 re f\n0.22 0.36 0.29 rg 0 704 595 138 re f\n"
  stream += text(doc.issuer.toUpperCase(), 48, 792, 14, "0.85 0.90 0.82")
  stream += text(doc.title, 48, 741, 30, "1 1 1")
  stream += text(`REFERENCE  ${doc.reference}`, 48, 659, 11)
  stream += text(`ISSUED  ${doc.date}`, 48, 637, 11)
  stream += "0.78 0.80 0.74 RG 48 611 m 547 611 l S\n"
  doc.lines.forEach((line, i) => {
    stream += text(line, 48, 571 - i * 27)
  })
  if (doc.amount) {
    stream += "0.88 0.92 0.85 rg 48 199 499 63 re f\n"
    stream += text(
      `TOTAL PAID                         EUR ${doc.amount.toFixed(2)}`,
      66,
      225,
      16
    )
  }
  stream += text("FICTIONAL DOCUMENT / OPEN FILE DEMO", 48, 92, 10)
  stream += text(
    "All names, organisations, addresses and amounts are invented.",
    48,
    73,
    9
  )
  stream += text(
    "For product demonstrations only. Not valid for any real transaction.",
    48,
    57,
    9
  )
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ]
  let output = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(output))
    output += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(output)
  output += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return output
}
await mkdir(directory, { recursive: true })
for (const doc of documents)
  await writeFile(new URL(doc.file, directory), pdf(doc))
await writeFile(
  new URL("../manifest.json", directory),
  JSON.stringify(documents, null, 2) + "\n"
)
console.log(
  `Generated ${documents.length} fictional PDFs and examples/manifest.json.`
)
