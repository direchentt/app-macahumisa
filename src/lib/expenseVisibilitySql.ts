/**
 * Visibilidad de un gasto para el usuario autenticado ($1 = userId del JWT).
 * Igual que el listado de gastos; no filtra deleted_at (sirve para auditoría y respaldos).
 */
export const EXPENSE_VISIBILITY_SQL = `(
  (e.shared_list_id IS NULL AND e.user_id = $1)
  OR (
    e.shared_list_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM shared_lists sl
      LEFT JOIN memberships m ON m.list_id = sl.id AND m.user_id = $1
      WHERE sl.id = e.shared_list_id
        AND (sl.owner_id = $1 OR m.user_id IS NOT NULL)
    )
  )
)`;
