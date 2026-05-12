# General Nits:

## Bugs

- logo doesn't fit in the navbar currently
- Do a security scan and add sanitization and measures where necessary.

## Changes

- Monograms for the profile according to first letter of email or something and rework the actual interaction/effects (i did that by hand 3 years ago)
- ENSURE that all UI is compliant with mobile/access from iPad

## Questions

- For the printer integration/operation from the ipad in the yard how do we grapple with this? Do I need to make this an ios app (I'm hoping not)

---

# Box Intake Process:

## Broad Summary:

- Overall, add a step by step clean process rather than the static form that is currently there. Snappy but still stylish animations between steps and clear documentation and localization into spanish (localization bit applies sitewide).
- ADD INPUT SANITIZATION.. everywhere.

## Changes:

- Add an override to date behavior- don't default to pg's NOW() s.t containers that are added in after the fact have accurate timing.
- For Release numbers, add support for the relationship to go the other way. Sometimes release numbers (given by container companies that are dropping off at our depot) have associated container numbers- allow these to be put in under the release number system and viewed with a dropdown on each little release # ticker on the page. If a container is added through the add box menu, check the container # against those associated with release numbers and auto-associate that container (as part of the intake flow).
- After **yard** intake is complete, add box to a queue of pending boxes that need administrator-only info and validation (acquisition price, etc.). Admin will audit and from there the box goes to the inventory pool within the system.

## Brand new features (from scratch):

- (Slightly) Different Behavior for a second kind of box: **Storage & Handling**: This will be the FIRST step in the intake flow, prompt whether the box is here for SALE or for STORAGE. If for storage we'll need the in/out fee we're charging for that particular box and the daily storage fee. More on the storage & handling buildout later.

- **OCR support and image storing** (open to stack recos but currently everything is aws based so S3 naturally follows-- but anything more cost effective is also welcome)
  - Step 1 in the intake process would be to take a few images of a given container to have any existing damage for posterity, we would ocr the data decal'd onto the side of the container, intelligently parse that data for anything we need for intake, and have those be autofilled at the requisite steps in the flow.

- **Driver Reciepts**: At the end of intake, print certain info about the delivery for the driver's end (may end up adding SMS support if twilio is worth the buy). My biggest concern here is interacting with the thermal printer I have as I'm a bit lost as to where to even start-- ask me about the model and stuff and let's have a convo before putting this into a PLAN.md. There will be an IPad outside in the yard that will be used to fill out these onboarding forms. Unsure if it's practical to put this into an ios app (i'd imagine its a bureaucratic nightmare so could just use browser but again this all comes down to best way to interface with that damn printer)

## Questions/Concerns for planning agent:

- Much of this is backend based, if you need db schema info, ask me and tell me how to get it in the best format for you to read.

## Sample Intake Flow:

1. Take pictures of the container (3 photos: front, and 2 sides) and instruct to make clear the decals
   - OCR this bit and in local usestate just fill in what we can and use those as default values in the remaining steps
2. Specify Storage & Handling OR Resale
3. Box Info: Input Container Number, Size Damage
   - Look up container number against release #s- from this we can get sale company and release # autofill
4. Trucking Info: Trucking Company, Sale Company, Release # (dropdown select with search)
5. Acquisition Price\*: This is deferred onto the admin team to fill in so at this point, the box would be put in pending.
6. Print Receipt- merchant copy aswell with driver signature spot

# Inventory Page/Management:

## Summary:

- Want to implement a similar flow-style approach to marking boxes as sold, and a method to clean up sold boxes as they just clutter- but need the data. Speaking of data, need a good, clean way to map P&L over inventory in both sales and box storage.

## Changes:

- I almost want to have 3 of the current table automatically separated by "State"
- Pagination NEEDS to be fixed it's buggy as hell and doesn't really work. Also the search bar on this page is annoying- maybe add it to the header column or style it better generally. Maybe also options to sort by each columnn by clicking on the header- etc.
- Get rid of the Mark Outbound button- that's an artifact I forgot to get rid of.
- I want the edit window to stand out a bit more- when you hit edit the contrast isn't rich enough and I'd like it to be more vertical rather than stretching the fields horizontal- consider a popup edit flow instead that's a bit more structured.
- Rethink styling of the table

## Brand new features:

- For admin accounts, add a pending section where recently taken in boxes can be audited, have the priviliged info added, and then be added to gen pop. Not sure how the best way to do this is-- maybe through the state column add a "pending" or something.
- Storage and Handling (S&H hereafter) section of inventory. These boxes must be separate from the regular sales inventory. They have different states: either in storage or checked out. Display on the inventory how long each box has been in (days) and the options should be edit, delete, and check out. When checking out, enter a popup flow that confirms all the box info (rates, etc) and sets a checkout date (default to today but allow anything thru calendar selection).

# Invoices:

## Summary:

- Biggest place for work in this push- this is the most used portion of the app and needs to be seamless- right now it's all a bit scuffed from how the invoice is generated (template html garbage) to editing/creating not making a ton of sense- etc.
- This might be a full rip-out and redo but if so the past invoices MUST be migrated.
- So, so, so so so many side effects to this portion of the side so navigate with care

## Changes:

### Invoice Generation:

- Don't love the layout as of current. Pitch me a few designs to choose from based on what's currently in and include:
  - The first line in the TO: (section) should be the Business name, Then Customer Name, Street Address City, State and Zip Code, Phone number, Email address
  - In the description section can we remove the Modification Cost unless we have a modification?
- Need a cleaner way to regenerate the invoices that doesn't feel so weird
- For inputting the data, make it a real step-by-step flow with a fully rendered preview
  - REACH: can we make a quasi-text editor where the rendered version can be edited before being sent with those changes being preserved?

### General Display:

- I kind of want to stray away from the table and toward a tiled approach with filters by Customer and the same search functionality but not in a table. Maybe to do anything to a given invoice you have to click into it -> to it's own page {url}/invoices/invoice# where you can edit, regen, delete, send by email, etc.

### External flow:

- Currently the email functionality _works_ but isn't ideal. First, is it **safe** from a cyber perspective in it's current form? I never fully implemented the "email the customer" functionality- I want this to remain as an option post-generation (so it can be checked before being sent) but also as a button from the invoice browser.
- I also will look into quickbooks integration- we do NOT want to send every invoice to qb but would have the option to (not sure at all what the API is capable of on qb's end but let's talk about this)

## Sample Invoice Flow:

1. Select **Customer** (want to flush out this customer aspect see later)
2. Select boxes (non-sold only)
3. Foreach box collect requisite info and apply tax/credit card fee as needed
4. Generate the invoice (maybe in an iframe or something embedded into the page) and provide options for emailing to Customer
5. Return to the invoice browser (where that invoice is now located).

# Reports:

## Summary:

- Currently this is terrible. There's werid redirection and new tab generation and the back/forward buttons get messed up.
- Rip this out and just redo the entire thing with the same sort of vibe that everything else will have:
  1. Flow to generate the report
  2. Somewhere to view previously sent reports
  3. ability to Email

- This is where the new P&L stuff will go.

## Questions:

- Can we (cheaply) store previously gen'd reports without breaking bank?
- Let's talk thru P&L tracking.

# Dashboard:

## Summary:

- Same as reports but less bad since it's less involved.
- Needs a facelift and better UI.
- Implement the functionality mentioned in the intake notes in a clean way.

# Yard View:

## Summary:

- Facelift- has some weird formatting stuff

# Help:

## Summary:

- Actually implement this. Just add FAQs/documentation and how the system works.

# (NEW PAGE) Customers:

## Summary:

- Rolodex of customers- allow easy editing and intake. This should be pretty simple but sleek with flows for editing and creation.
- Will include general clients to invoice to for both sales and S&H.
