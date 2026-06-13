# Airtight Inventory
## _A Robust Inventory System_

Inventory + invoicing for a working shipping-container yard. Tracks every container from inbound, through hold and sale or long-term storage, to final delivery — and handles the billing that goes with it.

## Tech

- [React] - Frontend framework (Vite + TypeScript)
- [PostgreSQL] - Database management system
- [Express.js] - Backend framework (ESM, Node 20+)
- [Better Auth] - Auth package (email/password + Google OAuth, role-based access)
- [Drizzle ORM] - Schema + numbered SQL migrations
- [Puppeteer] - Server-side PDF generation (invoices, quotes, delivery reports)
- [AWS Textract] - OCR for reading container info off photos at intake
- [AWS S3] - Photo and PDF storage
- [Resend] - Transactional email
- [Twilio] - Driver/customer SMS (pending carrier 10DLC approval)
- [Node.js] - Runtime environment (npm for package management)
- [Docker] - Compose stack (frontend + backend) on an AWS EC2 instance; Postgres runs on the host, system nginx terminates SSL
- [GitHub Actions] - CI/CD: builds images, pushes to GHCR, SSH-deploys to EC2 on push to `main`

### Main Features:
- Invoice and Reciept generaton with business logic built in (New Jersey Sales Tax & Fees, line items, modifications with quantity, etc.)
- Quotes with their own numbering and PDF, promotable into a real sale
- Custom flow of the "Container Lifecycle" from arrival to the facility, to being on hold for a customer, to final delivery
   - Handles the logistics and keeps track of trucking information and numbers
- Storage & Handling billing — monthly, flat-rate, and daily in/out modes with auto-generated month-end invoices
- OCR-assisted intake: snap a photo of the container and pre-fill the unit number and details
- Server-rendered, multi-page PDFs for invoices, quotes, and delivery reports
- Aggregates business statistics (total spending, average price paid per unit, sale price data, per-container P&L, etc.)
- Spanish localization and tablet/iPad-friendly layouts for the yard-facing flows

### Coming Soon:
- Driver SMS notifications (waiting on carrier 10DLC approval)
- QuickBooks integration
- Refine UI/UX
