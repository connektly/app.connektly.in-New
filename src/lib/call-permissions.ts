export function normalizeCallPermissionStatus(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function canStartCallFromPermissionStatus(value: string | null | undefined) {
  const normalizedStatus = normalizeCallPermissionStatus(value);
  return normalizedStatus === 'granted' || normalizedStatus === 'temporary' || normalizedStatus === 'permanent';
}
