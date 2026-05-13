# tests/fixtures

Drop the OCR sample image here as `container-doors.jpg` so the Textract
smoke script can find it at the default path:

```bash
npx tsx scripts/smoke-textract.ts ./tests/fixtures/container-doors.jpg
```

Photograph the **doors** — that's where ISO 6346 puts the largest,
always-horizontal copy of the unit number. Side panels sometimes have
vertical text and Textract handles that less reliably. Tighter crops
save Textract cents and improve accuracy.
