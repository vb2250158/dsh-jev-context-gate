/** Persist only candidate identities and the scores used by the selection policy.
 * @param session Current Session; diagnostic failures never change the selection.
 * @param position Current turn and step.
 * @param selection Validated selection summary produced by rankCatalog.
 * @param onError Reports an append failure without exposing request content.
 */
export function recordCatalogSelection(session, position, selection, onError) {
  try { session.append('plugin:dsh-jev-context-gate/catalog-selection', { ...position, ...selection }, { ignorable: true }); }
  catch (error) { onError(error); }
}
