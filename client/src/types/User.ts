export interface User {
  user_id: string;
  email: string;
  isAuthenticated: boolean;
  newsletterOptIn: boolean;
  created_at: string;
  hasPurchasedStarter?: boolean;
}
