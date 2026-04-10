import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  addMember,
  createSharedList,
  deleteSharedList,
  getSharedList,
  listMembers,
  listSharedLists,
  removeMember,
  updateMemberRole,
  updateSharedList,
  type Member,
  type SharedList,
} from "../api/client";

const field = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
} as const;

export function SharedListsPage() {
  const { token, userId } = useAuth();
  const [lists, setLists] = useState<SharedList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SharedList | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");

  const loadLists = useCallback(async () => {
    if (!token) return;
    const data = await listSharedLists(token);
    setLists(data.shared_lists);
  }, [token]);

  const loadDetail = useCallback(async () => {
    if (!token || !selectedId) {
      setDetail(null);
      setMembers([]);
      return;
    }
    setErr(null);
    try {
      const d = await getSharedList(token, selectedId);
      setDetail(d.shared_list);
      setAccess(d.access);
      setRole(d.role);
      setEditName(d.shared_list.name);
      setEditDesc(d.shared_list.description ?? "");
      const m = await listMembers(token, selectedId);
      setMembers(m.members);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSelectedId(null);
    }
  }, [token, selectedId]);

  useEffect(() => {
    if (!token) return;
    loadLists().finally(() => setLoading(false));
  }, [token, loadLists]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      await createSharedList(token, { name: newName.trim(), description: newDesc.trim() || null });
      setNewName("");
      setNewDesc("");
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedId || access !== "owner") return;
    try {
      await updateSharedList(token, selectedId, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      await loadLists();
      await loadDetail();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDelete() {
    if (!token || !selectedId || access !== "owner") return;
    if (!confirm("¿Eliminar esta lista y sus membresías?")) return;
    try {
      await deleteSharedList(token, selectedId);
      setSelectedId(null);
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedId || access !== "owner") return;
    try {
      await addMember(token, selectedId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await loadDetail();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!token || !selectedId) return;
    if (!confirm("¿Quitar a este miembro?")) return;
    try {
      await removeMember(token, selectedId, userId);
      await loadDetail();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleRoleChange(userId: string, r: "editor" | "viewer") {
    if (!token || !selectedId || access !== "owner") return;
    try {
      await updateMemberRole(token, selectedId, userId, r);
      await loadDetail();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  if (!token) return null;

  const isOwner = access === "owner";

  return (
    <main style={{ flex: 1, padding: "24px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>Listas compartidas</h1>
      <p style={{ margin: "0 0 24px", color: "var(--text-muted)" }}>
        Creá listas, invitá por email (usuario ya registrado) y asigná rol editor o visualizador.
      </p>
      {err && (
        <p style={{ padding: 12, borderRadius: "var(--radius-sm)", background: "rgba(242,139,130,0.12)", color: "var(--danger)" }}>
          {err}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        style={{
          marginBottom: 28,
          padding: 20,
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          display: "grid",
          gap: 12,
          maxWidth: 480,
        }}
      >
        <strong>Nueva lista</strong>
        <input placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} required style={field} />
        <input placeholder="Descripción (opcional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={field} />
        <button
          type="submit"
          disabled={creating}
          style={{
            padding: "12px 18px",
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent)",
            color: "#0a0f0d",
            fontWeight: 700,
          }}
        >
          {creating ? "Creando…" : "Crear lista"}
        </button>
      </form>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {lists.length === 0 ? (
              <li style={{ color: "var(--text-muted)" }}>No tenés listas todavía.</li>
            ) : (
              lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid " + (selectedId === l.id ? "var(--accent)" : "var(--border)"),
                      background: selectedId === l.id ? "var(--accent-dim)" : "var(--bg-elevated)",
                      color: "var(--text)",
                      fontWeight: selectedId === l.id ? 700 : 500,
                    }}
                  >
                    {l.name}
                  </button>
                </li>
              ))
            )}
          </ul>

          <div>
            {!selectedId ? (
              <p style={{ color: "var(--text-muted)" }}>Elegí una lista para ver detalle y miembros.</p>
            ) : detail ? (
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, background: "var(--bg-elevated)" }}>
                <p style={{ margin: "0 0 4px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Tu rol: <strong>{role ?? access}</strong>
                </p>
                {isOwner ? (
                  <form onSubmit={handleSaveMeta} style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", marginBottom: 10 }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Nombre</span>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...field, marginTop: 6 }} required />
                    </label>
                    <label style={{ display: "block", marginBottom: 12 }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Descripción</span>
                      <textarea
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        rows={2}
                        style={{ ...field, marginTop: 6, resize: "vertical" }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="submit"
                        style={{
                          padding: "10px 16px",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--accent)",
                          color: "#0a0f0d",
                          fontWeight: 700,
                        }}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        style={{
                          padding: "10px 16px",
                          border: "1px solid var(--danger)",
                          borderRadius: "var(--radius-sm)",
                          background: "transparent",
                          color: "var(--danger)",
                        }}
                      >
                        Eliminar lista
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                    <h2 style={{ margin: "0 0 8px" }}>{detail.name}</h2>
                    {detail.description && <p style={{ margin: 0, color: "var(--text-muted)" }}>{detail.description}</p>}
                  </div>
                )}

                <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Miembros</h3>
                {isOwner && (
                  <form onSubmit={handleInvite} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                    <input
                      type="email"
                      placeholder="Email del usuario"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      style={{ ...field, flex: "1 1 200px" }}
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                      style={{ ...field, width: "auto", minWidth: 120 }}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Visualizador</option>
                    </select>
                    <button
                      type="submit"
                      style={{
                        padding: "10px 16px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontWeight: 600,
                      }}
                    >
                      Invitar
                    </button>
                  </form>
                )}
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {members.map((m) => (
                    <li
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "0.9rem" }}>{m.email}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isOwner ? (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user_id, e.target.value as "editor" | "viewer")}
                              style={{ ...field, width: "auto", padding: "6px 10px" }}
                            >
                              <option value="editor">Editor</option>
                              <option value="viewer">Visualizador</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.user_id)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "var(--text-muted)",
                                textDecoration: "underline",
                                fontSize: "0.85rem",
                              }}
                            >
                              Quitar
                            </button>
                          </>
                        ) : m.user_id === userId ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.user_id)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              textDecoration: "underline",
                              fontSize: "0.85rem",
                            }}
                          >
                            Salir de la lista
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{m.role}</span>
                        )}
                      </div>
                    </li>
                  ))}
                  {members.length === 0 && <li style={{ color: "var(--text-muted)" }}>Solo el dueño (sin miembros invitados).</li>}
                </ul>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>Cargando detalle…</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
