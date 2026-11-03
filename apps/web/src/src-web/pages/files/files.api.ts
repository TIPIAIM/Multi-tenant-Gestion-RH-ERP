import { api } from "../../lib/api";
export type FileItem = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  createdAt: string;
  owner: string;
  modules: string[];
  kind: "file" | "link";
  uses: number;
  locations: { module: string; title: string; route: string }[];
};
export type Filter = {
  search?: string;
  module?: string;
  kind?: "all" | "file" | "link";
  recent?: boolean;
};
export type Listing = {
  items: FileItem[];
  statistics: {
    total: number;
    files: number;
    links: number;
    bytes: number;
    recent: number;
  };
  pagination: { page: number; total: number; totalPages: number };
  modules: { key: string; label: string; count: number }[];
  pending: { id: string; name: string; attempts: number }[];
  audit: {
    id: string;
    name: string;
    actor: string;
    action: string;
    count: number;
    createdAt: string;
  }[];
};
export type ExportJob = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  total: number;
  processed: number;
  downloaded: number;
  failed: number;
  message: string;
  expiresAt: string;
  parts: { id: string; name: string; bytes: number }[];
};
export const list = (filters: Filter, page: number, signal: AbortSignal) =>
  api
    .get<{ data: Listing }>("/files", { params: { ...filters, page }, signal })
    .then((r) => r.data.data);
export const jobs = (signal: AbortSignal) =>
  api
    .get<{ data: ExportJob[] }>("/files/exports", { signal })
    .then((r) => r.data.data);
export const prepare = (filters: Filter, ids?: string[]) =>
  api
    .post("/files/exports", { filters, ids })
    .then((r) => r.data.data as { id: string; message: string });
export const previewDelete = (id: string) =>
  api
    .get<{ data: FileItem & { token: string } }>(`/files/${id}/preview-delete`)
    .then((r) => r.data.data);
export const remove = (id: string, token: string) =>
  api
    .delete<{ data: { completed: boolean; message: string } }>(`/files/${id}`, {
      data: { token },
      timeout: 90000,
    })
    .then((r) => r.data.data);
export const retry = (id: string) =>
  api.post(`/files/pending/${id}/retry`, {}, { timeout: 90000 });
export function downloadUrl(path: string) {
  return `${String(api.defaults.baseURL).replace(/\/$/, "")}/files/${path}`;
}
export async function previewFile(item: FileItem) {
  if (item.bytes > 50 * 1024 ** 2)
    throw new Error(
      "Ce fichier est volumineux. Utilisez Télécharger pour le consulter sur votre ordinateur.",
    );
  const response = await api.get<Blob>(`/files/${item.id}/download`, {
    params: { preview: 1 },
    responseType: "blob",
    timeout: 120000,
  });
  return URL.createObjectURL(new Blob([response.data], { type: item.mime }));
}
