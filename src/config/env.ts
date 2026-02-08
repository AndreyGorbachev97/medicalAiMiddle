import dotenv from 'dotenv';
dotenv.config();

console.log('IS_TEST_MODE', process.env.IS_TEST_MODE);
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const OPENAI_KEY = process.env.OPENAI_KEY || '';
export const IS_TEST_MODE = process.env.IS_TEST_MODE === 'true';
export const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '1082712';
export const YOOKASSA_SECRET_KEY =
  process.env.YOOKASSA_SECRET_KEY || 'test_KXZRsEqT12u3v4SawcW4UcOHNAVMum9IaEOuAEnz6JM';
export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_FROM = process.env.SMTP_FROM || '';
