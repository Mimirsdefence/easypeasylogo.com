import { User } from '../types';
import { supabase } from './supabaseClient';

function mapSupabaseUser(supaUser: any): User {
  return {
    user_id: supaUser.id,
    email: supaUser.email || '',
    isAuthenticated: true,
    newsletterOptIn: false,
    created_at: supaUser.created_at || new Date().toISOString()
  };
}

export async function loginWithGoogle(): Promise<User> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://easypeasylogo.com/auth-return"
    }
  });

  if (error) throw error;

  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    return mapSupabaseUser(userData.user);
  }

  return {
    user_id: '',
    email: '',
    isAuthenticated: false,
    newsletterOptIn: false,
    created_at: new Date().toISOString()
  };
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  if (data?.user) {
    return mapSupabaseUser(data.user);
  }

  throw new Error("Login failed");
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) throw error;

  if (data?.user) {
    return mapSupabaseUser(data.user);
  }

  throw new Error("Sign up failed");
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    return mapSupabaseUser(data.user);
  }
  return null;
}
