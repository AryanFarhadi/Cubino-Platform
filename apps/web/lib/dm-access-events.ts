/** Fired when the user loses access to the active DM (removed, left, or forbidden). */
export const DM_ACCESS_LOST_EVENT = "cubino:dm-access-lost";

export function notifyDmAccessLost(): void {
  window.dispatchEvent(new Event(DM_ACCESS_LOST_EVENT));
}
