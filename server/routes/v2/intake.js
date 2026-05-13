import express from "express";
import { checkEmployee } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { presignSchema, ocrSchema } from "../../validation/intake.js";
import { intakePhotoKey, presignedPut } from "../../lib/s3.js";
import { extractFromS3Key } from "../../lib/textract.js";

const router = express.Router();

// POST /api/v2/intake/photo/presign
// Mints a short-lived presigned PUT URL for a single intake photo.
// Server picks the S3 key so the caller can't write to arbitrary prefixes;
// the response includes the key so the client can post it to /ocr later
// and persist it on the box record at submit time.
router.post(
	"/photo/presign",
	checkEmployee,
	validateBody(presignSchema),
	async (req, res) => {
		try {
			const { contentType, kind } = req.body;
			// Map the content-type back to an extension so the key is searchable
			// by eyeball in the S3 console. Defaults to "jpg" for image/jpeg.
			const ext =
				contentType === "image/jpeg"
					? "jpg"
					: contentType.split("/")[1].replace(/[^a-z0-9]/gi, "") || "bin";
			const key = intakePhotoKey(kind, ext);
			const url = await presignedPut(key, contentType);
			res.status(200).json({ status: "success", data: { url, key } });
		} catch (err) {
			console.error("intake.presign error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

// POST /api/v2/intake/ocr
// Runs Textract DetectDocumentText against an already-uploaded object
// and returns the extracted unit_number (if any) + every detected line
// so the UI can offer a "didn't catch that — fix it" affordance.
router.post(
	"/ocr",
	checkEmployee,
	validateBody(ocrSchema),
	async (req, res) => {
		try {
			const result = await extractFromS3Key(req.body.key);
			res.status(200).json({ status: "success", data: result });
		} catch (err) {
			console.error("intake.ocr error:", err);
			res.status(500).json({ message: "OCR failed" });
		}
	},
);

export default router;
