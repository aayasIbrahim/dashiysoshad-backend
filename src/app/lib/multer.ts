import multer from "multer";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError";

export const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		files: 10,
		fileSize: 5 * 1024 * 1024,
		fields: 1,
		fieldSize: 100 * 1024,
		parts: 11,
	},
	fileFilter: (_req, file, callback) => {
		if (
			![
				"image/avif",
				"image/gif",
				"image/jpeg",
				"image/png",
				"image/webp",
			].includes(file.mimetype)
		) {
			callback(
				new AppError(httpStatus.BAD_REQUEST, "Only image files are allowed"),
			);
			return;
		}

		callback(null, true);
	},
});
