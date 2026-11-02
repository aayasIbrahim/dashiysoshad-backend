import z from "zod";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const passwordSchema = z
	.string()
	.min(10, "Password must be at least 10 characters long")
	.max(72, "Password must not exceed bcrypt's 72-byte limit")
	.refine(
		(password) => Buffer.byteLength(password, "utf8") <= 72,
		"Password must not exceed bcrypt's 72-byte limit",
	);

const RegistrationZodSchema = z.object({
	name: z.string().trim().min(2).max(80),
	email: emailSchema,
	phone: z
		.string()
		.trim()
		.regex(/^(?:\+?[1-9]\d{9,14}|01[3-9]\d{8})$/, "Enter a valid phone number"),
	password: passwordSchema
		.regex(/[a-z]/, "Password must contain a lowercase letter")
		.regex(/[A-Z]/, "Password must contain an uppercase letter")
		.regex(/[0-9]/, "Password must contain a number")
		.regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
});

const LoginZodSchema = z.object({
	email: emailSchema,
	password: z
		.string()
		.min(1, "Password is required")
		.max(72, "Invalid email or password")
		.refine(
			(password) => Buffer.byteLength(password, "utf8") <= 72,
			"Invalid email or password",
		),
});

export const UserValidation = {
	RegistrationZodSchema,
	LoginZodSchema,
};
