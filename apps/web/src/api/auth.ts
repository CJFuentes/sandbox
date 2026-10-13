import type { AuthResponse, LoginBody, RegisterBody, User } from '@app/shared';
import { apiRequest } from './client';

export async function login(body: LoginBody): Promise<AuthResponse> {
  return (await apiRequest('/auth/login', { method: 'POST', body })) as AuthResponse;
}

export async function register(body: RegisterBody): Promise<AuthResponse> {
  return (await apiRequest('/auth/register', { method: 'POST', body })) as AuthResponse;
}

export async function getMe(): Promise<User> {
  return (await apiRequest('/auth/me')) as User;
}
