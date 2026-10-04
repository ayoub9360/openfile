# Demo documents

[Back to README](../README.md) · [User guide](../docs/usage.md)

Six entirely fictional, one-page PDFs let you explore Open File without importing
personal data. Names, companies, addresses, and amounts are invented. Each PDF
is marked "FICTIONAL DOCUMENT / OPEN FILE DEMO". They are neither valid supporting
documents nor legal templates.

| File                                                          | Contents and possible question                     |
| ------------------------------------------------------------- | -------------------------------------------------- |
| [July invoice](documents/2026-07_internet_invoice.pdf)        | Internet subscription: EUR 39 including VAT        |
| [August invoice](documents/2026-08_internet_invoice.pdf)      | Internet subscription: EUR 39 including VAT        |
| [September invoice](documents/2026-09_internet_invoice.pdf)   | Internet subscription: EUR 39 including VAT        |
| [Lease](documents/2026_apartment_lease.pdf)                   | Fictional one-month notice period, clause 8        |
| [Dishwasher warranty](documents/2026_dishwasher_warranty.pdf) | 24 months, until March 12, 2028                    |
| [Home insurance](documents/2026_home_insurance.pdf)           | Coverage from February 1, 2026 to January 31, 2027 |

## Reproducing the demo

1. Start the four services, then create a dedicated account with a fictional name.
2. Import five PDFs, then the remaining one (five files per upload maximum).
3. Without AI, enter the metadata and folders suggested in [manifest.json](manifest.json).
   With AI, save the key and enable the mode before importing; exact suggestions
   vary depending on the model.
4. Approve each filing. To match the names and tags in the screenshots, use the
   manifest values before or after approval.
5. In the library, select **All files**, then grid view.
6. For example, create "Home & everyday" with the `home` tag and "Internet invoices"
   with the `internet` tag. These tags must also be present on the documents.
7. Ask the assistant: "When does my dishwasher warranty expire? Summarize the
   coverage and show the document."

Other questions: "Show my internet invoices from July to September 2026",
"What is their total?" (EUR 117), or "What notice period does my lease specify?".
Without AI, try words found in the text, such as `warranty` or `internet`: this
mode retrieves passages without generating a summary.

## Regenerating the files

```bash
node scripts/generate-demo.mjs
```

The generator uses no external dependencies, AI services, or keys. It rewrites
only these six PDFs and `examples/manifest.json`. The PDFs contain selectable text:
they can test local extraction, but not OCR on a scan. The files are provided
under the project's MIT License.

## About the screenshots

Screenshots of the real interface, taken on October 4, 2026 at a width of 1280 or
1440 pixels, using an isolated account and these PDFs. Analysis and the assistant's
answer used an AI key authorized for this demo. Metadata was then aligned with
the manifest, as any user can do.

The screenshots do not demonstrate a Google Drive connection or OCR extraction:
those workflows were not used for the demo. No password, token, personal document,
or API key is included in the publishable files.

The key used for the screenshots was removed from the demo account after
validation. To continue using AI on this account, configure a key in **Settings**.
Documents and conversations are retained.
