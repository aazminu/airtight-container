1. Repo access for the planning agent
   Most useful thing for the agent will be seeing the actual code. Ranked by preference:

Best: Clone the repo locally, let Claude Code work in it directly
OK: You paste in the current Postgres schema (pg_dump --schema-only is perfect) plus a directory tree
Worst: Work blind from your doc

Which way are we going? 2. Scope of the 2.0 — rewrite vs. refactor
Three things to pick on:
Rewrite aggression:

(a) Greenfield rewrite, new repo, keep old as reference, migrate data at the end
(b) Same repo, fresh branches, can rip out big pieces (e.g., the entire invoice subsystem)
(c) Same repo, incremental, preserve as much working code as possible

Stack flexibility:

(a) Keep React + Express + Postgres exactly as-is
(b) Open to upgrades within the family (Next.js, Fastify, Prisma/Drizzle ORM, etc.)
(c) Open to bigger swaps if justified

Production constraints:

(a) Live now, can't have downtime — need a migration strategy
(b) Live but can do a scheduled cutover
(c) Internal-only, can take it down for a weekend

3. Storage & Handling domain (entirely new)

What's the lifecycle of an S&H box? Just in_storage → checked_out, or are there more states (pending admin audit like sales boxes)?
Daily storage fee — billed periodically (monthly invoice?) or only at checkout as a lump sum?
Do S&H customers get invoiced the same way as sales customers? Same invoice doc, separate doc type, or just a checkout receipt?
Can a box move between S&H and Sales ever? (e.g., customer abandons stored box, you sell it)
Who owns an S&H box — the storing customer, or you? Matters for P&L.
Are multiple boxes per S&H customer common? Need a concept of a "storage account"?

4. OCR + thermal printer
   Holding the printer convo until you're ready, but pre-questions so we're prepared:

Printer make/model and interface (USB / Bluetooth / WiFi)
iPad model + iOS version
Locked into existing iPad or open to new hardware if it simplifies things 10x?
OCR: paid cloud API (AWS Textract, Google Vision) vs. self-hosted Tesseract — preference? Volume per day?
Roughly how many containers/day come in? (Sizes S3 storage cost.)

5. Pending/Admin audit flow

Who are admins — is this the existing role flag, or do we need a new permissions model?
When a box is pending, can yard staff see it but not edit it, or is it invisible to them?
What admin-only fields exist beyond acquisition price?
If admin rejects a pending box — does it bounce back to yard, or get edited in place?

6. Invoices

How many historical invoices? Hundreds, thousands, tens of thousands?
Currently stored as rendered HTML in DB, or structured data + template?
Are old invoices ever edited post-send, or immutable?
Tax rules — just NJ sales tax + CC fee, or more (commercial vs. residential, out-of-state, etc.)?
For the reach WYSIWYG feature: edits are per-invoice overrides (saved to that one invoice), or can they feed back to a template?
QuickBooks — Online or Desktop? Big difference in integration.

7. Customers entity

Is there current customer data, or is it all free-text on invoices that we'd need to dedupe/extract?
Customer type distinction needed (sales / storage / both)?
Multiple contacts per customer needed?
Credit terms, tax-exempt status, anything like that?

8. Reports + P&L

Granularity — per-box P&L (acquisition - sale - fees), or monthly/quarterly aggregates?
S&H revenue rolled into the same P&L view, or separate?
Expense categories beyond acquisition (trucking, modifications, yard costs)?
What reports does the business actually need/run?

9. Tech-adjacent

Spanish localization — full UI or just key flows? Existing library or starting fresh?
Auth — stick with sessions, or open to JWT / Cognito (since you're on AWS) / Clerk / Auth0?
Tests currently? Appetite for a test suite as part of 2.0?
What's .github/workflows doing right now?

10. Sequencing
    My instinct for order of attack based on dependencies:

Schema redesign + Customers entity + migration
Intake flow + S&H domain
Invoices (depends on Customers)
Inventory page rework (depends on intake states)
Reports + Dashboard
Hardware (printer, OCR) — can run in parallel after #1
Yard view, Help, polish

Match your priorities, or does something need to ship first for business reasons?

2, 3, 5-10, 11,13,14,15,16,17,18,20,22,23,24,25,26,27,28,29,30,32,33,34,35,36,37,38

