# tests/fixtures

Photograph the **doors** — that's where ISO 6346 puts the largest,
always-horizontal copy of the unit number. Side panels sometimes have
vertical text and Textract handles that less reliably. Tighter crops
save Textract cents and improve accuracy.

## One-off smoke

```bash
npx tsx scripts/smoke-textract.ts ./tests/fixtures/doors-1.jpg
```

## Regression set

`doors-N.jpg` images here paired with their expected unit numbers in
`doors.gt` form the OCR regression set. To add a new failing example:

1. Drop the image as `doors-<N+1>.jpg`.
2. Append the expected unit number to `doors.gt` as `doors-<N+1>.jpg: <UNIT>`.
3. Re-capture the Textract LINE snapshots so the test can run offline:
   `npx tsx scripts/capture-ocr-fixtures.ts`
4. Commit the new image + `doors.gt` entry + `scripts/textract-fixtures/doors-<N+1>.lines.json`.

The regression test at `tests/lib/textract.regression.test.ts` reads
the captured `.lines.json` snapshots, so vitest never hits AWS.
