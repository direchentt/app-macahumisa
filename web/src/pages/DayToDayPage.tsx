import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  completeReminder,
  createNote,
  createReminder,
  createShoppingItem,
  deleteNote,
  deleteReminder,
  deleteShoppingItem,
  getListExpenseSplit,
  listNotes,
  listReminders,
  listSharedLists,
  listShoppingItems,
  patchNote,
  patchShoppingItem,
  type ListExpenseSplitResponse,
  type Reminder,
  type SharedList,
  type ShoppingItem,
  type UserNote,
} from "../api/client";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";

type HubTab = "reminders" | "shopping" | "notes" | "split";

const KIND_LABEL: Record<string, string> = {
  reminder: "Recordatorio",
  expiration: "Vencimiento",
  agenda: "Evento",
  routine: "Rutina",
};

const REPEAT_LABEL: Record<string, string> = {
  none: "Una vez",
  daily: "Cada día",
  weekly: "Cada semana",
  monthly: "Cada mes",
};

function fmtWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DayToDayPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<HubTab>("reminders");
  const [lists, setLists] = useState<SharedList[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [rTitle, setRTitle] = useState("");
  const [rBody, setRBody] = useState("");
  const [rAt, setRAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [rRepeat, setRRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [rKind, setRKind] = useState<"reminder" | "expiration" | "agenda" | "routine">("reminder");
  const [rListId, setRListId] = useState("");

  const [shopScope, setShopScope] = useState<string>("personal");
  const [shopItems, setShopItems] = useState<ShoppingItem[]>([]);
  const [shopLabel, setShopLabel] = useState("");

  const [noteScope, setNoteScope] = useState<string>("personal");
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [noteBody, setNoteBody] = useState("");

  const [splitListId, setSplitListId] = useState("");
  const [splitData, setSplitData] = useState<ListExpenseSplitResponse | null>(null);

  const loadLists = useCallback(async () => {
    if (!token) return;
    const d = await listSharedLists(token);
    setLists(d.shared_lists);
  }, [token]);

  const loadReminders = useCallback(async () => {
    if (!token) return;
    const d = await listReminders(token);
    setReminders(d.reminders);
  }, [token]);

  const loadShopping = useCallback(async () => {
    if (!token) return;
    const id = shopScope === "personal" ? null : shopScope;
    const d = await listShoppingItems(token, id);
    setShopItems(d.items);
  }, [token, shopScope]);

  const loadNotes = useCallback(async () => {
    if (!token) return;
    const id = noteScope === "personal" ? null : noteScope;
    const d = await listNotes(token, id);
    setNotes(d.notes);
  }, [token, noteScope]);

  useEffect(() => {
    if (!token) return;
    setErr(null);
    loadLists().catch(() => {});
  }, [token, loadLists]);

  useEffect(() => {
    if (!token) return;
    if (tab === "reminders") {
      loadReminders().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
    } else if (tab === "shopping") {
      loadShopping().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
    } else if (tab === "notes") {
      loadNotes().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
    }
  }, [token, tab, loadReminders, loadShopping, loadNotes]);

  const filteredReminders = useMemo(() => {
    if (kindFilter === "all") return reminders;
    return reminders.filter((r) => r.reminder_kind === kindFilter);
  }, [reminders, kindFilter]);

  async function submitReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !rTitle.trim()) return;
    setErr(null);
    try {
      await createReminder(token, {
        title: rTitle.trim(),
        body: rBody.trim() || null,
        remind_at: new Date(rAt).toISOString(),
        repeat_kind: rRepeat,
        reminder_kind: rKind,
        shared_list_id: rListId || null,
      });
      setRTitle("");
      setRBody("");
      showToast("Guardado");
      await loadReminders();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function onCompleteReminder(id: string) {
    if (!token) return;
    try {
      await completeReminder(token, id);
      await loadReminders();
      showToast("Listo");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error");
    }
  }

  async function onDeleteReminder(id: string) {
    if (!token || !confirm("¿Eliminar este recordatorio?")) return;
    try {
      await deleteReminder(token, id);
      await loadReminders();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error");
    }
  }

  async function addShop(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !shopLabel.trim()) return;
    try {
      await createShoppingItem(token, {
        label: shopLabel.trim(),
        shared_list_id: shopScope === "personal" ? null : shopScope,
      });
      setShopLabel("");
      await loadShopping();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error");
    }
  }

  async function toggleShop(it: ShoppingItem) {
    if (!token) return;
    try {
      await patchShoppingItem(token, it.id, { done: !it.done });
      await loadShopping();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error");
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !noteBody.trim()) return;
    try {
      await createNote(token, {
        content: noteBody.trim(),
        shared_list_id: noteScope === "personal" ? null : noteScope,
      });
      setNoteBody("");
      await loadNotes();
      showToast("Nota guardada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error");
    }
  }

  async function loadSplit() {
    if (!token || !splitListId) return;
    setErr(null);
    try {
      const d = await getListExpenseSplit(token, splitListId);
      setSplitData(d);
    } catch (e) {
      setSplitData(null);
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  useEffect(() => {
    if (tab === "split" && splitListId && token) void loadSplit();
  }, [tab, splitListId, token]);

  if (!token) return null;

  return (
    <main className="app-page app-page--wide dayhub-page">
      <header className="app-page-head dayhub-head">
        <p className="app-page-eyebrow">Sin salir de Macahumisa</p>
        <h1 className="app-page-title">Día a día</h1>
        <p className="app-page-lead">
          Recordatorios, lista de compras, notas y reparto de gastos de listas. Todo acá para no perder el foco en Inicio y
          Presupuestos.
        </p>
      </header>

      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) ? <div className="dash-alert dash-alert--error">{err}</div> : null}

      <nav className="dayhub-tabs" aria-label="Secciones del día a día">
        {(
          [
            ["reminders", "Recordatorios"],
            ["shopping", "Compras"],
            ["notes", "Notas"],
            ["split", "Dividir"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`dayhub-tab${tab === id ? " dayhub-tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "reminders" && (
        <section className="dayhub-panel" aria-labelledby="dayhub-rem-title">
          <h2 id="dayhub-rem-title" className="dayhub-panel-title">
            Recordatorios y vencimientos
          </h2>
          <p className="dayhub-panel-hint">
            Mismo aviso que en campanita cuando toca la hora. Las rutinas repiten solas. Podés asignar una lista para avisar a
            todos los miembros.
          </p>
          <div className="dayhub-chips" role="group" aria-label="Tipo">
            {(["all", "reminder", "expiration", "agenda", "routine"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`dayhub-chip${kindFilter === k ? " dayhub-chip--on" : ""}`}
                onClick={() => setKindFilter(k)}
              >
                {k === "all" ? "Todos" : KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <details className="dayhub-details">
            <summary className="dayhub-details-sum">+ Nuevo recordatorio</summary>
            <form className="dayhub-form" onSubmit={submitReminder}>
              <input className="app-field-global" placeholder="Título" value={rTitle} onChange={(e) => setRTitle(e.target.value)} required />
              <textarea className="app-field-global" placeholder="Detalle (opcional)" rows={2} value={rBody} onChange={(e) => setRBody(e.target.value)} />
              <label className="dayhub-label">
                Cuándo
                <input className="app-field-global" type="datetime-local" value={rAt} onChange={(e) => setRAt(e.target.value)} required />
              </label>
              <div className="dayhub-form-row">
                <label className="dayhub-label">
                  Tipo
                  <select className="app-field-global" value={rKind} onChange={(e) => setRKind(e.target.value as typeof rKind)}>
                    <option value="reminder">Recordatorio</option>
                    <option value="expiration">Vencimiento (documento, seguro…)</option>
                    <option value="agenda">Evento / agenda</option>
                    <option value="routine">Rutina repetitiva</option>
                  </select>
                </label>
                <label className="dayhub-label">
                  Repetir
                  <select className="app-field-global" value={rRepeat} onChange={(e) => setRRepeat(e.target.value as typeof rRepeat)}>
                    <option value="none">Una vez</option>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </label>
              </div>
              {lists.length > 0 && (
                <label className="dayhub-label">
                  Lista (opcional — avisa a todos)
                  <select className="app-field-global" value={rListId} onChange={(e) => setRListId(e.target.value)}>
                    <option value="">Solo vos</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="submit" className="app-btn-pill">
                Guardar
              </button>
            </form>
          </details>

          <ul className="dayhub-list">
            {filteredReminders.length === 0 ? (
              <li className="dayhub-empty">No hay pendientes en este filtro.</li>
            ) : (
              filteredReminders.map((r) => (
                <li key={r.id} className="dayhub-card">
                  <div className="dayhub-card-top">
                    <span className="dayhub-pill">{KIND_LABEL[r.reminder_kind] ?? r.reminder_kind}</span>
                    {r.repeat_kind !== "none" ? <span className="dayhub-pill dayhub-pill--muted">{REPEAT_LABEL[r.repeat_kind]}</span> : null}
                  </div>
                  <p className="dayhub-card-title">{r.title}</p>
                  {r.body ? <p className="dayhub-card-body">{r.body}</p> : null}
                  <p className="dayhub-card-meta">{fmtWhen(r.remind_at)}</p>
                  <div className="dayhub-card-actions">
                    <button type="button" className="dayhub-link-btn" onClick={() => void onCompleteReminder(r.id)}>
                      Hecho / próxima
                    </button>
                    <button type="button" className="dayhub-link-btn dayhub-link-btn--muted" onClick={() => void onDeleteReminder(r.id)}>
                      Eliminar
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {tab === "shopping" && (
        <section className="dayhub-panel" aria-labelledby="dayhub-shop-title">
          <h2 id="dayhub-shop-title" className="dayhub-panel-title">
            Lista de compras
          </h2>
          <p className="dayhub-panel-hint">Tuya o de una lista compartida. Los editores pueden tachar y agregar.</p>
          <select className="app-field-global dayhub-scope" value={shopScope} onChange={(e) => setShopScope(e.target.value)} aria-label="Ámbito">
            <option value="personal">Mi lista personal</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <form className="dayhub-inline-form" onSubmit={addShop}>
            <input className="app-field-global" placeholder="Ej. leche, pan…" value={shopLabel} onChange={(e) => setShopLabel(e.target.value)} />
            <button type="submit" className="app-btn-pill">
              Agregar
            </button>
          </form>
          <ul className="dayhub-shop-list">
            {shopItems.length === 0 ? (
              <li className="dayhub-empty">Lista vacía.</li>
            ) : (
              shopItems.map((it) => (
                <li key={it.id} className={`dayhub-shop-row${it.done ? " dayhub-shop-row--done" : ""}`}>
                  <label className="dayhub-check">
                    <input type="checkbox" checked={it.done} onChange={() => void toggleShop(it)} />
                    <span>{it.label}</span>
                  </label>
                  <button
                    type="button"
                    className="dayhub-link-btn dayhub-link-btn--muted"
                    onClick={() =>
                      void (async () => {
                        try {
                          await deleteShoppingItem(token, it.id);
                          await loadShopping();
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : "Error");
                        }
                      })()
                    }
                  >
                    Quitar
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {tab === "notes" && (
        <section className="dayhub-panel" aria-labelledby="dayhub-notes-title">
          <h2 id="dayhub-notes-title" className="dayhub-panel-title">
            Notas rápidas
          </h2>
          <p className="dayhub-panel-hint">Códigos, medidas, lo que la familia deba ver en una lista compartida.</p>
          <select className="app-field-global dayhub-scope" value={noteScope} onChange={(e) => setNoteScope(e.target.value)} aria-label="Ámbito">
            <option value="personal">Mis notas</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <form className="dayhub-form" onSubmit={addNote}>
            <textarea className="app-field-global" rows={3} placeholder="Escribí acá…" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            <button type="submit" className="app-btn-pill">
              Guardar nota
            </button>
          </form>
          <ul className="dayhub-list">
            {notes.length === 0 ? (
              <li className="dayhub-empty">Sin notas.</li>
            ) : (
              notes.map((n) => (
                <li key={n.id} className="dayhub-card">
                  <p className="dayhub-card-body dayhub-note-content">{n.content}</p>
                  <div className="dayhub-card-actions">
                    <button
                      type="button"
                      className="dayhub-link-btn"
                      onClick={() =>
                        void patchNote(token, n.id, { pinned: !n.pinned })
                          .then(loadNotes)
                          .catch((e) => showToast(e instanceof Error ? e.message : "Error"))
                      }
                    >
                      {n.pinned ? "Desfijar" : "Fijar"}
                    </button>
                    <button
                      type="button"
                      className="dayhub-link-btn dayhub-link-btn--muted"
                      onClick={() =>
                        void (async () => {
                          if (!confirm("¿Borrar nota?")) return;
                          await deleteNote(token, n.id);
                          await loadNotes();
                        })()
                      }
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {tab === "split" && (
        <section className="dayhub-panel" aria-labelledby="dayhub-split-title">
          <h2 id="dayhub-split-title" className="dayhub-panel-title">
            Dividir gastos de una lista
          </h2>
          <p className="dayhub-panel-hint">
            Suma los gastos cargados en la lista (no ingresos) y asume partes iguales entre miembros. Quien cargó más en la app
            aparece con saldo a favor.
          </p>
          <div className="dayhub-form-row">
            <select className="app-field-global" value={splitListId} onChange={(e) => setSplitListId(e.target.value)} aria-label="Lista">
              <option value="">Elegí una lista</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button type="button" className="app-btn-ghost" disabled={!splitListId} onClick={() => void loadSplit()}>
              Calcular
            </button>
          </div>
          {splitData && (
            <div className="dayhub-split-result">
              <p className="dayhub-split-note">{splitData.note}</p>
              {Object.entries(splitData.currencies).map(([cur, block]) => (
                <div key={cur} className="dayhub-split-block">
                  <h3 className="dayhub-split-cur">{cur}</h3>
                  <p>
                    Total <strong>{block.total}</strong> · Por persona <strong>{block.per_person}</strong>
                  </p>
                  <ul className="dayhub-split-bal">
                    {splitData.members.map((m) => (
                      <li key={m.user_id}>
                        {m.email}: pagó {block.paid_by_user[m.user_id] ?? "0.00"} · saldo {block.balance_by_user[m.user_id] ?? "0.00"}
                      </li>
                    ))}
                  </ul>
                  {block.suggestions.length > 0 ? (
                    <>
                      <p className="dayhub-split-sub">Sugerencia de transferencias (mínimas):</p>
                      <ul className="dayhub-split-sug">
                        {block.suggestions.map((s, i) => (
                          <li key={i}>
                            <strong>{s.from_email}</strong> → <strong>{s.to_email}</strong>: {s.amount} {cur}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="dayhub-split-sub">Nadie debe: ya está equilibrado en esta moneda.</p>
                  )}
                </div>
              ))}
              {Object.keys(splitData.currencies).length === 0 ? <p className="dayhub-empty">No hay gastos en esta lista.</p> : null}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
