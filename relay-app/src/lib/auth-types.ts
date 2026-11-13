// Session/user types shared by server and browser. Pure types + constants.

export type Role = 'ma' | 'admin';

export interface SessionUser {
  id: string;     // Cognito `sub` (or mock-user id in development)
  name: string;   // staff display name
  email?: string;
  role: Role;
}

export const ROLE_LABEL: Record<Role, string> = {
  ma: 'Medical Assistant',
  admin: 'Administrator',
};

/** Fake staff accounts for AUTH_MODE=mock (development only). */
export const MOCK_USERS: SessionUser[] = [
  { id: 'mock-ma-priya', name: 'Priya Anand', email: 'priya.ma@example.test', role: 'ma' },
  { id: 'mock-admin-alex', name: 'Alex Rivera', email: 'alex.admin@example.test', role: 'admin' },
];
