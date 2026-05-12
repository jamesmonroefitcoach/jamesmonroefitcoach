"use server";

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

export type TodoDB = {
  id: string;
  text: string;
  section: "today" | "soon" | "longer_term";
  done: boolean;
  done_at: string | null;
};

export type BacklogDB = {
  id: string;
  text: string;
  last_done_at: string;
};

export async function loadTodosFromDb(): Promise<{ todos: TodoDB[]; backlog: BacklogDB[] }> {
  const user = await getSessionUser();
  if (!user || !hasSupabaseEnv()) return { todos: [], backlog: [] };
  const supabase = createSupabaseAdmin();
  const [{ data: todos }, { data: backlog }] = await Promise.all([
    supabase
      .from("coach_todos")
      .select("id, text, section, done, done_at")
      .eq("coach_id", user.id)
      .order("created_at"),
    supabase
      .from("coach_todo_backlog")
      .select("id, text, last_done_at")
      .eq("coach_id", user.id)
      .order("last_done_at", { ascending: false }),
  ]);
  return {
    todos: (todos ?? []) as TodoDB[],
    backlog: (backlog ?? []) as BacklogDB[],
  };
}

export async function saveTodosToDb(
  todos: TodoDB[],
  backlog: BacklogDB[]
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasSupabaseEnv()) return;
  const supabase = createSupabaseAdmin();

  // Fetch current IDs to diff deletions
  const [{ data: dbTodos }, { data: dbBacklog }] = await Promise.all([
    supabase.from("coach_todos").select("id").eq("coach_id", user.id),
    supabase.from("coach_todo_backlog").select("id").eq("coach_id", user.id),
  ]);

  const currentTodoIds = new Set<string>((dbTodos ?? []).map((r: any) => r.id));
  const currentBacklogIds = new Set<string>((dbBacklog ?? []).map((r: any) => r.id));
  const newTodoIds = new Set(todos.map((t) => t.id));
  const newBacklogIds = new Set(backlog.map((b) => b.id));

  const deletedTodos = [...currentTodoIds].filter((id) => !newTodoIds.has(id));
  const deletedBacklog = [...currentBacklogIds].filter((id) => !newBacklogIds.has(id));

  await Promise.all([
    todos.length > 0
      ? supabase.from("coach_todos").upsert(
          todos.map((t) => ({
            id: t.id,
            coach_id: user.id,
            text: t.text,
            section: t.section,
            done: t.done,
            done_at: t.done_at ?? null,
          })),
          { onConflict: "id" }
        )
      : Promise.resolve(),
    deletedTodos.length > 0
      ? supabase.from("coach_todos").delete().in("id", deletedTodos).eq("coach_id", user.id)
      : Promise.resolve(),
    backlog.length > 0
      ? supabase.from("coach_todo_backlog").upsert(
          backlog.map((b) => ({
            id: b.id,
            coach_id: user.id,
            text: b.text,
            last_done_at: b.last_done_at,
          })),
          { onConflict: "id" }
        )
      : Promise.resolve(),
    deletedBacklog.length > 0
      ? supabase
          .from("coach_todo_backlog")
          .delete()
          .in("id", deletedBacklog)
          .eq("coach_id", user.id)
      : Promise.resolve(),
  ]);
}
