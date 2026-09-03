import { User } from 'firebase/auth';

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  category: 'academic' | 'social' | 'sports' | 'conference' | 'other';
  locationId: string;
  startTime: string;
  endTime: string;
  organizer: string;
  creatorId?: string;
  creatorEmail?: string;
  createdAt?: string;
  isCustom?: boolean;
}

export const APP_OWNER_EMAIL = 'progressphilemon@gmail.com';

export const ADMIN_EMAILS = [
  APP_OWNER_EMAIL,
  'admin@rsu.edu.ng'
];

export const isAppOwner = (user?: User | { email?: string | null } | null): boolean => {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === APP_OWNER_EMAIL.toLowerCase();
};

export const isUserAdmin = (user?: User | { email?: string | null } | null): boolean => {
  if (!user || !user.email) return false;
  const normalizedEmail = user.email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalizedEmail) || isAppOwner(user);
};

export const campusEvents: CampusEvent[] = [];
