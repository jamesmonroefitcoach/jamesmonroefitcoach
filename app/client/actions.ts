"use server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createClientPersonalEvent,
  updateClientPersonalEvent,
  deleteClientPersonalEvent,
  type CreateInput,
  type UpdateInput,
} from "@/lib/client-personal-events";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function addPersonalEvent(
  input: Omit<CreateInput, "client_id">
): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.role !== "client") return { ok: false, error: "Clients only." };
  if (!input.title?.trim()) return { ok: false, error: "Title is required." };
  if (!input.starts_at) return { ok: false, error: "Start time is required." };

  const evt = await createClientPersonalEvent({
    client_id: me.id,
    title: input.title.trim(),
    starts_at: input.starts_at,
    ends_at: input.ends_at ?? null,
    notes: input.notes?.trim() || null,
    color: input.color ?? null,
  });
  if (!evt) return { ok: false, error: "Couldn't add event." };

  revalidatePath("/client");
  return { ok: true, data: { id: evt.id } };
}

export async function editPersonalEvent(
  id: string,
  patch: UpdateInput
): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.role !== "client") return { ok: false, error: "Clients only." };

  const evt = await updateClientPersonalEvent(id, me.id, {
    ...patch,
    title: patch.title?.trim(),
    notes: patch.notes !== undefined ? (patch.notes?.trim() || null) : undefined,
  });
  if (!evt) return { ok: false, error: "Couldn't update event." };

  revalidatePath("/client");
  return { ok: true };
}

export async function removePersonalEvent(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.role !== "client") return { ok: false, error: "Clients only." };

  const ok = await deleteClientPersonalEvent(id, me.id);
  if (!ok) return { ok: false, error: "Couldn't delete event." };

  revalidatePath("/client");
  return { ok: true };
}
