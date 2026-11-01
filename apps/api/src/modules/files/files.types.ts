import type { Types } from "mongoose";
export type Actor = {
  tenantId: Types.ObjectId;
  slug: string;
  userId: Types.ObjectId;
  name: string;
  role: string;
};
export type Storage =
  | {
      kind: "raw" | "image";
      id: string;
      delivery: "private" | "upload";
      format: string;
    }
  | { kind: "local"; path: string; root: string }
  | { kind: "link"; url: string };
export type Reference = {
  model: string;
  id: Types.ObjectId;
  path: string;
  expected: unknown;
  action: "unset" | "pull" | "delete" | "message" | "transfer" | "asset";
  title: string;
  module: string;
  route: string;
  extra?: Record<string, unknown>;
};
export type Entry = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  createdAt: string;
  owner: string;
  modules: string[];
  storage: Storage;
  references: Reference[];
};
export type PublicEntry = Omit<Entry, "storage" | "references"> & {
  kind: "file" | "link";
  uses: number;
  locations: { module: string; title: string; route: string }[];
};
