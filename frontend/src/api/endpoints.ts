// Typed wrappers over the HTTP API (CONTRACT §4).
import { api } from './client';
import type { DataRow } from '../lib/columns';

export type Role = 'admin' | 'viewer';

export interface LoginResponse {
  token: string;
  role: Role;
  login: string;
}

export interface MeResponse {
  login: string;
  role: Role;
}

export interface SignupLinkInfo {
  role: Role;
  expires_at: string;
  valid: boolean;
}

export interface CreateSignupLinkResponse {
  token: string;
  role: Role;
  expires_at: string;
  url: string;
}

export interface RegisterResponse {
  login: string;
  role: Role;
}

export interface ImportResponse {
  import_id: number;
  row_count: number;
  inserted: number;
  updated: number;
  warnings?: string[];
}

export interface DeleteResponse {
  deleted: number;
}

export interface DataResponse {
  rows: DataRow[];
  total: number;
  page: number;
  page_size: number;
}

export async function login(login: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { login, password });
  return data;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/auth/me');
  return data;
}

export async function getSignupLink(token: string): Promise<SignupLinkInfo> {
  const { data } = await api.get<SignupLinkInfo>(
    `/signup-links/${encodeURIComponent(token)}`,
  );
  return data;
}

export async function createSignupLink(role: Role): Promise<CreateSignupLinkResponse> {
  const { data } = await api.post<CreateSignupLinkResponse>('/admin/signup-links', {
    role,
  });
  return data;
}

export async function register(
  token: string,
  loginName: string,
  password: string,
): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/register', {
    token,
    login: loginName,
    password,
  });
  return data;
}

export async function uploadImport(file: File): Promise<ImportResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<ImportResponse>('/admin/imports', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getData(params: URLSearchParams): Promise<DataResponse> {
  const { data } = await api.get<DataResponse>('/data', { params });
  return data;
}

// exportData downloads the current filtered/sorted view as an .xlsx blob.
export async function exportData(params: URLSearchParams): Promise<Blob> {
  const { data } = await api.get('/data/export', {
    params,
    responseType: 'blob',
  });
  return data as Blob;
}

// exportSelected downloads exactly the given row ids as an .xlsx blob.
export async function exportSelected(ids: number[]): Promise<Blob> {
  const params = new URLSearchParams({ ids: ids.join(',') });
  const { data } = await api.get('/data/export', { params, responseType: 'blob' });
  return data as Blob;
}

// deleteData deletes the given rows by id (admin only).
export async function deleteData(ids: number[]): Promise<DeleteResponse> {
  const { data } = await api.post<DeleteResponse>('/admin/data/delete', { ids });
  return data;
}
