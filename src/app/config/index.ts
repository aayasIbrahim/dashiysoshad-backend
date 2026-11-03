import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  bak_url: process.env.APP_URL,
  frontend_url: process.env.FRONTEND_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
  cloudinary_cloud_name : process.env.CLOUDINARY_CLOUD_NAME!,
	cloudinary_api_key : process.env.CLOUDINARY_API_KEY!,
	cloudinary_api_secret : process.env.CLOUDINARY_API_SECRET!,
  bkash_base_url: process.env.BKASH_BASE_URL!,
	bkash_username: process.env.BKASH_USERNAME!,
	bkash_password: process.env.BKASH_PASSWORD!,
	bkash_app_key: process.env.BKASH_APP_KEY!,
	bkash_app_secret: process.env.BKASH_APP_SECRET!,
	bkash_callback_url: process.env.BKASH_CALLBACK_URL!,
	order_shipping_fee: process.env.ORDER_SHIPPING_FEE ?? "70",
};
