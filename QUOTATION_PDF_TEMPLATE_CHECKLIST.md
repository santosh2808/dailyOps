# Branded Quotation PDF Template — Delivery Notes

Scope: replace the generic Quotation PDF with an exact reproduction of the customer-supplied "Techno-Commercial Offer" template (Smart Rotamach / Spyro Fans letterhead), with the Annexure-I technical specification table pulled live from whichever fan size(s)/Product(s) are on the quotation. Quotation numbering switched to the reference format going forward. No other module was changed — Sales Order / Proforma Invoice / JEO PDFs still use the original generic renderer (`PdfService`), untouched.

**Round 2 addendum:** after seeing the customer's actual "Format \<N\> ft dia.doc" reference documents for all 8 fan sizes, the Annexure-II commercial terms turned out to genuinely vary order to order rather than being fixed boilerplate — see section 5 below for everything that changed in that round (editable commercial terms, region code, restructured price-schedule rows, CUSTOMER line, new product photo, seeded product data for all 8 sizes).

**Round 3 addendum (this update):** installation and transportation are now real ₹ amounts that add into the Grand Total — not just descriptive wording — and the 8 SPYRO products got real catalog prices (effective 1st April 2026) so unitPrice auto-fills correctly when a fan size is picked on a quotation. See section 7 below.

Run `npx prisma migrate dev` then restart the backend to pick up all three schema changes (`Product.technicalSpec`, `Quotation.commercialTerms`, `Quotation.installationCharge`/`transportationCharge`). Then run `npm run seed:hvls-products` once (safe to re-run) to populate/update the 8 SPYRO fan-size Products with their exact spec sheets and current prices (see sections 5.5 and 7.3).

## 1. Files Modified

### Backend

- `backend/prisma/schema.prisma` — added `Product.technicalSpec Json?`: the Annexure-I spec sheet for that fan size/model. Optional — an existing Product with nothing filled in just renders a spec table with blank ("—") cells.
- `backend/prisma/migrations/20260825120000_product_technical_spec/migration.sql` — new, hand-authored: `ALTER TABLE "Product" ADD COLUMN "technicalSpec" JSONB;`.
- `backend/src/products/dto/create-product.dto.ts` — added `ProductTechnicalSpec` interface (every Annexure-I field, all optional strings, plus `scopeOfSupply: { item, quantityPerFan }[]`) and `technicalSpec?: ProductTechnicalSpec` on the DTO. `update-product.dto.ts` inherits this unchanged (`PartialType`).
- `backend/src/pdf/quotation-pdf.service.ts` — new: `QuotationPdfService`, the branded 4-page template renderer (cover page, Contents, Annexure-I spec table + Standard Scope of Supply repeated once per distinct product on the quotation, Exclusions, Annexure-II Commercial Terms + Bank Details + Signatory). Duck-typed input (`QuotationPdfInput`) so `PdfModule` never depends on `QuotationsModule`.
- `backend/src/pdf/assets/logo-spyro-fans.png`, `logo-smart-rotamach.jpg`, `hvls-fan-photo.jpg` — the exact logo/product images extracted from the reference PDF, embedded on every page/cover.
- `backend/nest-cli.json` — added `compilerOptions.assets`/`watchAssets` so the `pdf/assets/**/*` images are copied into `dist/pdf/assets` on build (otherwise they'd only exist in `src` and the compiled service couldn't find them).
- `backend/src/pdf/pdf.module.ts` — now provides/exports `QuotationPdfService` alongside the untouched generic `PdfService`.
- `backend/src/quotations/quotations.service.ts` — `getPdf()`/`sendQuotation()` now call `QuotationPdfService.render()` instead of the generic `PdfService.render()`; removed the now-unused `buildQuotationPdfInput()`. Quotation numbering (`generateQuotationNumber()`) switched from `QT-2026-000002` to `SR|SPYRO|QTN|<seq>|<year>`, with optional region-code insertion (see Business Rule + section 5.2 below). Email attachment filename now sanitizes the `|` characters (not safe on every filesystem) — the on-screen/PDF quotation number itself is untouched.
- `backend/prisma/schema.prisma` — Round 2: added `Quotation.commercialTerms Json?`.
- `backend/prisma/migrations/20260825162000_quotation_commercial_terms/migration.sql` — Round 2, new: `ALTER TABLE "Quotation" ADD COLUMN "commercialTerms" JSONB;`.
- `backend/src/quotations/dto/quotation-commercial-terms.dto.ts` — Round 2, new: `QuotationCommercialTermsDto` (see section 5.1).
- `backend/src/quotations/dto/create-quotation.dto.ts` — Round 2: added `commercialTerms?: QuotationCommercialTermsDto`.
- `backend/src/pdf/assets/hvls-fan-photo.jpg` — Round 2: replaced with the customer's orange-fan installation photo.
- `backend/prisma/seed-hvls-products.ts` — Round 2, new one-time seed script for the 8 SPYRO fan-size Products (see section 5.5). Wired into `backend/package.json` as `npm run seed:hvls-products`.
- `backend/src/products/products.service.ts` — Round 2: `create()`/`update()` now cast `technicalSpec` explicitly to `Prisma.InputJsonValue | undefined` (fixes a genuine TS2322/TS2353 compile error when spreading the whole DTO into Prisma's `data`).
- `backend/tsconfig.json` — **Round 2 bug fix, real production issue found on the customer's machine.** With no `include`/`exclude`, `tsc` picked up `prisma/seed*.ts` (outside `src/`) as part of the same compile as the Nest app, which pushed the inferred `rootDir` up to the project root and made the build emit `dist/src/pdf/...` instead of `dist/pdf/...`. `nest-cli.json`'s asset copy still targeted `dist/pdf/assets` (per `sourceRoot: "src"`), so the compiled `QuotationPdfService` (now living one level deeper, at `dist/src/pdf/`) was looking for images at a path that never existed — logos and the fan photo silently rendered blank with no error. Fixed by scoping the build to `"include": ["src/**/*.ts"]`, `"exclude": ["node_modules", "dist", "prisma/**/*.ts"]`, which restores the flat `dist/pdf/assets` layout. Verified: fresh `npm run build` now produces `dist/main.js` and `dist/pdf/assets/*` (not nested under `dist/src`), and a full render embeds all 3 images (131,681 bytes vs. ~8.6KB with the bug).
- `backend/src/pdf/quotation-pdf.service.ts` — Round 2 bug fix: `safeImage()` previously failed *silently* when a file was missing (only exceptions were logged, not a plain not-found). Now logs a warning either way, and the constructor logs each asset's resolved path + exists-check once at boot — makes this class of bug visible immediately instead of only showing up as blank images in a generated PDF.

### Frontend

- `frontend/src/types/index.ts` — added `ProductTechnicalSpec`; added `Product.technicalSpec`. Round 2: added `QuotationCommercialTerms` interface + `Quotation.commercialTerms`.
- `frontend/src/api/products.ts` — added `technicalSpec?: ProductTechnicalSpec` to `ProductPayload`.
- `frontend/src/api/quotations.ts` — Round 2: added `commercialTerms?: QuotationCommercialTerms` to `QuotationPayload`.
- `frontend/src/components/products/ProductFormDialog.tsx` — new "Techno-Commercial Offer PDF — Technical Specifications" section: one text input per Annexure-I field, plus an add/remove-row editor for "Standard Scope of Supply". Blank fields/rows are dropped before submit (`technicalSpec` sent as `undefined` if nothing was filled in).
- `frontend/src/components/products/ProductViewDialog.tsx` — added Model No. / Fan Size quick-view fields.
- `frontend/src/pages/QuotationForm.tsx` — Round 2: new "Commercial Terms (Quotation PDF — Annexure II)" section (see section 5.1). Existing "Edit" action on Quotation Details already routes here, so no other frontend wiring was needed.

## 2. Database Changes

- `Product.technicalSpec` (`JSONB`, nullable) — additive column, no existing data affected. Every existing Product simply has it `null` until someone fills in the Technical Specifications section on that product.
- `Quotation.commercialTerms` (`JSONB`, nullable) — Round 2, additive column, no existing data affected. Falls back to the PDF renderer's own defaults when unset.
- No other changes to `Quotation`, `QuotationItem`, or any other table — the numbering format change is application-level only (still the same `TEXT`/`@unique` column).

## 3. Business Rule — Quotation Numbering

- New quotations get `SR|SPYRO|QTN|<seq>|<year>` (e.g. `SR|SPYRO|QTN|1|2026`), a single running sequence across all years — **not** one that resets every January.
- Quotations already issued keep their old `QT-2026-000002` numbers forever; nothing renumbers them retroactively.
- The two formats can coexist indefinitely — `generateQuotationNumber()` only ever looks at rows already matching the new prefix when computing the next sequence number.

## 4. Known Limitations / Design Decisions

- **One PDF for all quotations.** The branded template is now used for every Quotation PDF (Get PDF and Send Quotation), regardless of product — per the confirmed scope decision. There is no fallback to the old generic layout for non-HVLS products; if this system ever quotes something else, that quotation's Annexure-I will just show blank ("—") spec cells.
- **Multi-item quotations.** If a quotation has more than one distinct product, Annexure-I (and its Standard Scope of Supply table) repeats once per distinct product, headed "Item N: <model> (Qty: X)". A "Quotation Summary" (Subtotal/GST/Grand Total) block is added before Annexure-II in that case, since the single-item reference template has no multi-item total shown.
- **Commercial Terms (Annexure-II) are now editable per quotation** (superseding Round 1's "static" design) — see section 5.1. Bank Details remain fixed (ICICI), not yet editable.
- **Cover page title** is built from each item's `technicalSpec.modelNo` (falling back to the Product name); with multiple distinct products it becomes `HVLS <MODEL A> & <MODEL B> MODELS`. The product photo (Round 2: the customer's own orange-fan installation photo, see section 5.4) is reused for every quotation regardless of fan size — no per-size photo was supplied.
- **Exclusions list** is the exact static 8-item list from the reference template — not per-product, not editable via the UI yet.

## 5. Round 2 — Reconciled Against All 8 Real Reference Docs

After the 8 "Format \<N\> ft dia.doc" files (8/10/12/14/16/18/20/24 ft) were supplied, comparing them against each other showed the structural skeleton (cover page, Annexure I/II order, header/footer) is fixed, but the commercial terms genuinely vary order to order. The items below are what changed as a result.

### 5.1 Commercial terms are now per-quotation data, not boilerplate

- New nullable `Quotation.commercialTerms Json?` column (migration `20260825162000_quotation_commercial_terms`). Same "additive, optional, sensible defaults if unset" pattern as `Product.technicalSpec`.
- New `QuotationCommercialTermsDto` (`backend/src/quotations/dto/quotation-commercial-terms.dto.ts`) with 12 optional string fields: `regionCode`, `priceBasis`, `installationCharge`, `transportation`, `gstTerms`, `packingForwarding`, `transportInsurance`, `unloading`, `payment`, `delivery`, `installationSchedule`, `offerValidity`. Wired into `CreateQuotationDto` (validated/nested); `UpdateQuotationDto` inherits it automatically.
- `QuotationForm.tsx` has a new "Commercial Terms (Quotation PDF — Annexure II)" section, pre-filled with the same defaults the PDF renderer falls back to, editable before sending. `unloading` and `installationSchedule` are optional lines that are omitted from the PDF entirely when left blank.
- If `commercialTerms` is left completely unset, the PDF renders using `DEFAULT_COMMERCIAL_TERMS` in `quotation-pdf.service.ts` — behaviorally identical to the old static template for anyone who doesn't touch the new fields.

### 5.2 Region/branch code in the quotation number

- `commercialTerms.regionCode` (e.g. `NCR`), if set, is inserted into the auto-generated number: `SR|<REGION>|SPYRO|QTN|<seq>|<year>` instead of `SR|SPYRO|QTN|<seq>|<year>`.
- Both formats share one global running sequence — `generateQuotationNumber()` locates the `QTN` token by position (not a fixed prefix length), so it parses either format correctly when computing the next number.

### 5.3 Annexure-I price schedule restructured

- Replaced the Round-1 combined "Unit Price + Installation + Transportation" row and separately-computed GST-amount row with the layout consistent across all 8 real documents: separate `Unit Price`, `Installation`, `Transportation`, `GST <n>%`, and `Quantity` rows, using free-text wording (e.g. "Included", "Extra at actual") rather than computed currency amounts for GST/installation/transportation.
- Added a `Warranty Conditions` row (the identical boilerplate paragraph found in all 8 documents), printed under the three warranty rows (Motor/Drive/Other).
- Annexure-II's commercial-terms rows are now built dynamically from `commercialTerms` (5–7 rows depending on whether the optional lines are set), and the Bank Details row number adjusts automatically instead of being hardcoded `9.`.

### 5.4 Cover page changes

- New CUSTOMER row added above KIND ATTEN, sourced from `quotation.customer` (or `quotation.lead` if no Customer yet) `companyName`.
- Product photo replaced with the customer's uploaded orange-fan installation photo (resized 3000×4000 → 675×900). Image placement switched from a fixed-width assumption to an aspect-ratio-safe `fit`-based bounding box (230×260pt, centered), so portrait or near-square photos both scale correctly without overflow or distortion.

### 5.5 Product data for all 8 fan sizes

- `backend/prisma/seed-hvls-products.ts` — one-time script, **not run automatically**. Upserts (by `sku`, matched via `findFirst` since `sku` has no DB-level unique constraint) 8 Products — `SPYRO-8` through `SPYRO-24` — each with its full `technicalSpec` transcribed from the corresponding "Format \<N\> ft dia.doc". `price`/`standardPrice`/`minPrice` are deliberately left unset (pricing wasn't in scope of this change).
- Run once with `npm run seed:hvls-products` (from `backend/`) after migrating.
- **Data-quality note:** the customer's own "Format 24 ft dia.doc" has a row-shift bug in its own spec table (Speed/Noise/Weight/Voltage/Current values are each printed one row below their correct label). The script uses corrected values, cross-checked against the smooth progression across all 8 sizes (e.g. current climbs 1.4 → 1.8 → 1.9 → 2.3 → 2.4 → 3.1 → 3.2 → 4.1A) and against a rendered image of the source page — documented inline in the script.

## 7. Round 3 — Real Installation/Transportation Charges + Product Pricing

Previously installation and transportation were purely descriptive text on the PDF (e.g. "Included" / "Extra at actual") — no actual number was ever added to the price calculation, and Products had no catalog price at all (unitPrice had to be typed in by hand every time).

### 7.1 Installation and Transportation are now real ₹ amounts

- New columns `Quotation.installationCharge` and `Quotation.transportationCharge` (`DOUBLE PRECISION`, both `@default(0)`) — migration `20260825170000_quotation_installation_transportation_charge`.
- `installationCharge`: auto-computed by `QuotationsService` as **Rs.8,000 × total fan quantity** at create/update time whenever a quotation's `items` change and no explicit value is sent. Sending an explicit `installationCharge` (including on `QuotationForm.tsx`) overrides that rate for that specific quotation.
- `transportationCharge`: no auto-compute — it genuinely varies by site/distance, so it starts at 0 and staff fill in the real amount per quotation via the new "Transportation Charge (₹)" field.
- **GST is charged on the full pre-tax total** — `subtotal (fans) + installationCharge + transportationCharge` — not just the fan subtotal, matching standard invoicing practice. `grandTotal = subtotal + installationCharge + transportationCharge + gstAmount`.
- `quotations.service.ts`'s `computeTotals()` signature grew two optional params (`installationCharge`, `transportationCharge`); `update()` is careful to only "freeze" the existing `installationCharge` as an explicit override when `items` themselves aren't changing — if quantity changes and no override was sent, it re-derives Rs.8,000 × the new quantity rather than keeping a now-stale absolute amount from before.

### 7.2 PDF changes

- Annexure-I's per-item "Installation" row now defaults to the wording "Rs.8,000 per fan" (was "Included"); "Transportation" shows the real amount (e.g. "Rs.4,500 (Total, all fans)") once a non-zero `transportationCharge` has been entered, otherwise falls back to the "Extra at actual" wording as before.
- The "Quotation Summary" block (Subtotal / GST / Grand Total) **now always renders**, not just for multi-item quotations as in Round 1/2 — it needs to show the real Installation Charges and Transportation Charges line items regardless of item count. New row order: Subtotal (Fans) → Installation Charges → Transportation Charges → GST (%) → Grand Total.
- `QuotationPdfInput` gained required numeric `installationCharge`/`transportationCharge` fields, separate from the pre-existing free-text `commercialTerms.installationCharge`/`transportation` (which are now labelled in the UI as "wording only" — see 7.4).

### 7.3 Product prices (effective 1st April 2026)

- `backend/prisma/seed-hvls-products.ts` updated with a real `price` (and matching `standardPrice`, used by the Approval Matrix discount-% check) for all 8 SPYRO products, taken from the customer's revised price list — excludes installation, transportation, and GST, which are handled separately as above:

  | Size | Price (₹) |
  |---|---|
  | 8 ft | 1,04,000 |
  | 10 ft | 1,05,600 |
  | 12 ft | 1,11,600 |
  | 14 ft | 1,15,200 |
  | 16 ft | 1,22,500 |
  | 18 ft | 1,25,000 |
  | 20 ft | 1,42,000 |
  | 24 ft | 1,46,000 |

  Re-run `npm run seed:hvls-products` to push these onto existing product rows (the script is an upsert-by-`sku`, safe to re-run).
- The price list also includes a 22 ft fan at ₹1,43,000, but it has no Annexure-I technical spec sheet yet, so **no `SPYRO-22` product was created** — add it once its spec sheet is available.
- `minPrice` remains unset for all 8 products — no floor price has been specified for these models.

### 7.4 Frontend (`QuotationForm.tsx`)

- New "Installation Charge (₹)" and "Transportation Charge (₹)" number inputs next to GST%/Valid Until. Installation's placeholder shows the live auto-calculated amount (₹8,000 × current total quantity) so staff can see what applies if the field is left blank; leaving it blank keeps the quotation auto-recalculating as items change instead of freezing today's amount.
- The live totals preview panel now also shows Installation and Transportation alongside Subtotal/GST/Grand Total, using the same formula as the backend (GST on subtotal+installation+transportation).
- The existing free-text "Installation" and "Transportation" fields inside Commercial Terms (Annexure II) are still there but relabelled "wording only (see ... ₹ field above)" — they only control what descriptive text prints when no real transportation amount has been entered yet; they no longer control any part of the actual price calculation.
- On loading an existing quotation for edit: `installationCharge` is only shown as an explicit value if it doesn't match what auto-compute would give for that quotation's current items (i.e. it was a deliberate override) — otherwise the field is left blank so it keeps auto-recalculating. `transportationCharge` always shows the real stored value (0 reads as blank/"not filled in yet").

## 8. Testing Checklist

- [ ] **Product spec entry** — open Products → Add/Edit a product. Confirm the new "Technical Specifications" section shows one input per Annexure-I field plus an "Add Item" scope-of-supply row editor, and that saving with everything blank doesn't error (product saves with `technicalSpec` unset).
- [ ] **Single-item quotation PDF** — create a quotation for one product whose `technicalSpec` is fully filled in (matching the "SPYRO 14" reference data is a good test). Download the PDF (Quotation Details → Download/Get PDF) and confirm: 4 pages, both logos + orange product photo on the cover, CUSTOMER row populated, REF number in the new `SR|SPYRO|QTN|<n>|<year>` format, Annexure-I table matches the entered spec values (including the new separate Unit Price/Installation/Transportation/GST/Quantity rows and Warranty Conditions paragraph), Standard Scope of Supply table, 8-item Exclusions list, Annexure-II Commercial Terms + Bank Details + Signatory.
- [ ] **Blank spec fields** — quotation for a product with no `technicalSpec` filled in: PDF still generates, spec table shows "—" for every value rather than erroring.
- [ ] **Multi-item quotation PDF** — quotation with two different products. Confirm Annexure-I repeats once per product ("Item 1: ...", "Item 2: ..."), a Quotation Summary block with the correct Subtotal/GST/Grand Total appears before Annexure-II, and pagination doesn't overlap the header/footer anywhere.
- [ ] **Send Quotation email** — send a quotation and confirm the emailed PDF attachment filename doesn't contain literal `|` characters (should be dashes), and that the attachment itself is identical to the Get-PDF download.
- [ ] **Quotation numbering (no region)** — create a few new quotations in a row and confirm the sequence increments by 1 each time (`SR|SPYRO|QTN|1|2026`, then `2`, etc.), and that a pre-existing `QT-2026-000002` quotation from before this change still displays and works normally everywhere (list, search, details, Sales Order/PI/JEO linkage).
- [ ] **Quotation numbering (with region code)** — set a `regionCode` (e.g. `NCR`) in Commercial Terms on a new quotation; confirm the number comes out as `SR|NCR|SPYRO|QTN|<n>|<year>` and that `<n>` continues the same global sequence as region-less quotations (not a separate counter).
- [ ] **Commercial Terms editing** — open Quotation Details → Edit, change a few Commercial Terms fields (e.g. `payment`, `delivery`, `offerValidity`), save, and confirm the regenerated PDF reflects the edited wording. Leave everything blank on a different quotation and confirm the PDF falls back to the same defaults as before this change.
- [ ] **Optional commercial-terms lines** — set `unloading` and/or `installationSchedule` on one quotation and leave them blank on another; confirm those rows appear only on the PDF where they were filled in.
- [ ] **Lead-sourced quotations** — a quotation generated from a Lead (no Customer yet) still renders the cover page's CUSTOMER/KIND ATTEN/PHONE/EMAIL from the Lead's own contact fields, same as before.
- [ ] **Seed script** — run `npm run seed:hvls-products` against a real database once (after migrating) and confirm all 8 `SPYRO-8`...`SPYRO-24` products are created/updated with their technical specs and prices, and that generating a quotation against one of them renders a correct Annexure-I without manual data entry.
- [ ] **Unit price auto-fill** — on a new quotation, pick a SPYRO fan size as a line item and confirm unitPrice auto-fills to that product's seeded price (e.g. SPYRO-20 → ₹1,42,000) rather than 0.
- [ ] **Installation auto-calc** — add 2 fans to a quotation, leave "Installation Charge (₹)" blank, save, and confirm the saved/rendered `installationCharge` is ₹16,000 (₹8,000 × 2). Change quantity to 3 and re-save (still blank) — confirm it recalculates to ₹24,000 rather than staying frozen at ₹16,000.
- [ ] **Installation override** — type an explicit amount into "Installation Charge (₹)" (e.g. ₹15,000 for 2 fans), save, and confirm that exact amount is used instead of the ₹8,000/fan auto-calc, and that it's still that value after reloading the Edit page (not silently reset).
- [ ] **Transportation charge** — leave Transportation Charge blank on a new quotation and confirm the PDF shows "Extra at actual" and the Grand Total has no transportation added (₹0). Then set a real amount (e.g. ₹4,500), save, and confirm the PDF's Transportation row now shows that exact amount and it's included in GST + Grand Total.
- [ ] **GST base** — with installation ₹16,000 and transportation ₹4,500 set, confirm `gstAmount = (subtotal + 16000 + 4500) × gstPercent/100`, not just `subtotal × gstPercent/100`, both in the live form preview and in the saved/rendered PDF numbers.
