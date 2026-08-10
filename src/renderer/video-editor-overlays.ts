export function getOverlaySelectionAfterDelete(
  overlayIds: readonly string[],
  deletedOverlayId: string,
): string | null {
  const deletedIndex = overlayIds.indexOf(deletedOverlayId);
  const remainingIds = overlayIds.filter((overlayId) => overlayId !== deletedOverlayId);

  return remainingIds[Math.max(0, deletedIndex - 1)] ?? null;
}
