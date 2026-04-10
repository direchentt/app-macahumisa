import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import {
  getListAccess,
  canCreateExpenseOnList,
  canMutateExpense,
  isListOwner,
  isListParticipant,
} from "../src/lib/sharedListAccess.js";

function mockPool(responses: { rows: unknown[] }[]) {
  let i = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const r = responses[i++] ?? { rows: [] };
      return Promise.resolve(r);
    }),
  } as unknown as Pool;
}

describe("getListAccess", () => {
  it("dueño de la lista → owner", async () => {
    const pool = mockPool([{ rows: [{ owner_id: "u1" }] }]);
    const a = await getListAccess(pool, "list-1", "u1");
    expect(a).toEqual({ role: "owner" });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("miembro editor", async () => {
    const pool = mockPool([{ rows: [{ owner_id: "other" }] }, { rows: [{ role: "editor" }] }]);
    const a = await getListAccess(pool, "list-1", "u2");
    expect(a).toEqual({ role: "editor" });
  });

  it("sin participación → null", async () => {
    const pool = mockPool([{ rows: [{ owner_id: "other" }] }, { rows: [] }]);
    const a = await getListAccess(pool, "list-1", "u2");
    expect(a).toBeNull();
  });

  it("lista inexistente → null", async () => {
    const pool = mockPool([{ rows: [] }]);
    const a = await getListAccess(pool, "list-1", "u2");
    expect(a).toBeNull();
  });
});

describe("isListOwner / isListParticipant", () => {
  it("isListOwner solo para owner", () => {
    expect(isListOwner({ role: "owner" })).toBe(true);
    expect(isListOwner({ role: "editor" })).toBe(false);
    expect(isListOwner(null)).toBe(false);
  });
  it("isListParticipant para cualquier rol", () => {
    expect(isListParticipant({ role: "viewer" })).toBe(true);
    expect(isListParticipant(null)).toBe(false);
  });
});

describe("canCreateExpenseOnList", () => {
  it("viewer no crea gastos", () => {
    expect(canCreateExpenseOnList({ role: "viewer" })).toBe(false);
  });
  it("editor y owner sí", () => {
    expect(canCreateExpenseOnList({ role: "editor" })).toBe(true);
    expect(canCreateExpenseOnList({ role: "owner" })).toBe(true);
  });
});

describe("canMutateExpense", () => {
  it("el creador siempre puede", async () => {
    const pool = mockPool([]);
    const ok = await canMutateExpense(pool, "u1", { user_id: "u1", shared_list_id: "lid" });
    expect(ok).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("dueño de lista puede editar gasto ajeno", async () => {
    const pool = mockPool([{ rows: [{ owner_id: "u2" }] }]);
    const ok = await canMutateExpense(pool, "u2", { user_id: "u1", shared_list_id: "lid" });
    expect(ok).toBe(true);
  });

  it("editor no edita gasto de otro", async () => {
    const pool = mockPool([
      { rows: [{ owner_id: "owner" }] },
      { rows: [{ role: "editor" }] },
    ]);
    const ok = await canMutateExpense(pool, "u3", { user_id: "u1", shared_list_id: "lid" });
    expect(ok).toBe(false);
  });

  it("gasto personal ajeno → false", async () => {
    const pool = mockPool([]);
    const ok = await canMutateExpense(pool, "u2", { user_id: "u1", shared_list_id: null });
    expect(ok).toBe(false);
  });
});
