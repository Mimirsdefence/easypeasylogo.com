export const CONFIG = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL as string | undefined,
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  STRIPE_PUBLIC_KEY: import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined,
  APP_NAME: (import.meta.env.VITE_APP_NAME as string) || "EasyPeasyLogo",
  FREE_MESSAGE_LIMIT: Number(import.meta.env.VITE_FREE_MESSAGE_LIMIT) || 10,
  IMAGE_RETENTION_DAYS: Number(import.meta.env.VITE_IMAGE_RETENTION_DAYS) || 30,
};