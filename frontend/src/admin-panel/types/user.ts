export type UserRole = "user" | "creator" | "admin" | "super_admin";

export type TeezerUser = {
  id: number;
  name: string;
  username: string;
  email?: string;
  role: UserRole;
  permissions?: string[];
  avatar?: string | null;
  is_verified?: boolean;
  is_banned?: boolean;
  two_factor_enabled?: boolean;
};
