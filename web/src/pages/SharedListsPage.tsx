import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";
import {
  addMember,
  createSharedList,
  deleteSharedList,
  getSharedList,
  listMembers,
  listSharedListActivity,
  listSharedLists,
  removeMember,
  updateMemberRole,
  updateSharedList,
  type ListActivityItem,
  type Member,
  type SharedList,
} from "../api/client";

export function SharedListsPage() {
  const { token, userId } = useAuth();
  const { showToast } = useToast();
  const [lists, setLists] = useState<SharedList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SharedList | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<ListActivityItem[]>([]);
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
      setActivity([]);
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
      const [m, act] = await Promise.all([
        listMembers(token, selectedId),
        listSharedListActivity(token, selectedId),
      ]);
      setMembers(m.members);
      setActivity(act.activity);
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
      showToast("Lista creada");
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
      showToast("Lista actualizada");
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
      showToast("Lista eliminada");
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
      showToast("Invitación enviada");
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
      showToast("Miembro actualizado");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleRoleChange(userId: string, r: "editor" | "viewer") {
    if (!token || !selectedId || access !== "owner") return;
    try {
      await updateMemberRole(token, selectedId, userId, r);
      await loadDetail();
      showToast("Rol actualizado");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  if (!token) return null;

  const isOwner = access === "owner";

  return (
    <main className="app-page app-page--wide">
      <header className="app-page-head">
        <p className="app-page-eyebrow">Colaboración</p>
        <h1 className="app-page-title">Listas compartidas</h1>
        <p className="app-page-lead">
          Creá listas, invitá por email (usuario ya registrado) y asigná rol editor o visualizador. <strong>Dueño</strong>: invita y administra.{" "}
          <strong>Editor</strong>: puede cargar gastos en la lista. <strong>Visualizador</strong>: solo ve movimientos y miembros.
        </p>
      </header>
      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) && <p className="app-error-banner">{err}</p>}

      <div className="app-panel" style={{ maxWidth: 520, marginBottom: 28 }}>
        <div className="app-panel-bar app-panel-bar--blue" aria-hidden />
        <form onSubmit={handleCreate} className="app-panel-inner">
          <h2 className="app-panel-title">Nueva lista</h2>
          <input placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} required className="app-field-global" />
          <input placeholder="Descripción (opcional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="app-field-global" />
          <button type="submit" disabled={creating} className="app-btn-pill">
            {creating ? "Creando…" : "Crear lista"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="app-loading-text">Cargando…</p>
      ) : (
        <div className="app-list-grid">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {lists.length === 0 ? (
              <li className="app-empty-card" style={{ margin: 0 }}>
                <p style={{ margin: 0 }}>No tenés listas todavía.</p>
              </li>
            ) : (
              lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={"app-list-pick" + (selectedId === l.id ? " app-list-pick--active" : "")}
                  >
                    {l.name}
                  </button>
                </li>
              ))
            )}
          </ul>

          <div>
            {!selectedId ? (
              <div className="app-empty-card">
                <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Elegí una lista</p>
                <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>Acá vas a ver miembros, invitaciones y actividad reciente.</p>
              </div>
            ) : detail ? (
              <div className="app-detail-card">
                <div className="app-detail-card-body">
                  <p style={{ margin: "0 0 16px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Tu rol: <strong style={{ color: "var(--text)" }}>{role ?? access}</strong>
                  </p>
                  {isOwner ? (
                    <form onSubmit={handleSaveMeta} style={{ marginBottom: 20 }}>
                      <label style={{ display: "block", marginBottom: 10 }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Nombre</span>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="app-field-global" style={{ marginTop: 6 }} required />
                      </label>
                      <label style={{ display: "block", marginBottom: 12 }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Descripción</span>
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          className="app-field-global"
                          style={{ marginTop: 6, resize: "vertical" }}
                        />
                      </label>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="submit" className="app-btn-pill app-btn-pill--sm">
                          Guardar
                        </button>
                        <button type="button" onClick={handleDelete} className="app-btn-outline-danger">
                          Eliminar lista
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ marginBottom: 20 }}>
                      <h2 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>{detail.name}</h2>
                      {detail.description && <p style={{ margin: 0, color: "var(--text-muted)" }}>{detail.description}</p>}
                    </div>
                  )}

                  <h3 style={{ margin: "0 0 12px", fontSize: "1rem", fontFamily: "var(--font-display)" }}>Miembros</h3>
                  {isOwner && (
                    <form onSubmit={handleInvite} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      <input
                        type="email"
                        placeholder="Email del usuario"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                        className="app-field-global"
                        style={{ flex: "1 1 200px" }}
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                        className="app-field-global"
                        style={{ width: "auto", minWidth: 120 }}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Visualizador</option>
                      </select>
                      <button type="submit" className="app-btn-ghost" style={{ fontWeight: 700 }}>
                        Invitar
                      </button>
                    </form>
                  )}
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {members.map((m) => (
                      <li key={m.id} className="app-member-row">
                        <span style={{ fontSize: "0.9rem" }}>{m.email}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isOwner ? (
                            <>
                              <select
                                value={m.role}
                                onChange={(e) => handleRoleChange(m.user_id, e.target.value as "editor" | "viewer")}
                                className="app-field-global"
                                style={{ width: "auto", padding: "6px 10px" }}
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
                                  cursor: "pointer",
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
                                cursor: "pointer",
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
                    {members.length === 0 && <li className="app-muted">Solo el dueño (sin miembros invitados).</li>}
                  </ul>

                  <h3 style={{ margin: "24px 0 12px", fontSize: "1rem", fontFamily: "var(--font-display)" }}>Actividad reciente en la lista</h3>
                  <p style={{ margin: "0 0 10px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Últimos gastos cargados en esta lista (quién registró y cuándo).
                  </p>
                  {activity.length === 0 ? (
                    <p className="app-muted" style={{ fontSize: "0.9rem" }}>
                      Todavía no hay movimientos en esta lista.
                    </p>
                  ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      {activity.map((a) => (
                        <li key={a.id} className="app-activity-item">
                          <strong>{a.email}</strong> {a.is_income ? "registró ingreso" : "registró gasto"}{" "}
                          {new Intl.NumberFormat("es", { style: "currency", currency: a.currency }).format(Number(a.amount))}
                          {a.category ? ` · ${a.category}` : ""}
                          {a.description ? ` · ${a.description}` : ""}
                          <span style={{ color: "var(--text-muted)", display: "block", marginTop: 4, fontSize: "0.8rem" }}>
                            {new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(new Date(a.created_at))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="app-loading-text">Cargando detalle…</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
