/** Whether this browser has seen the lobby's welcome panel: once closed, it shows no more. */
const KEY = "gnoslinger.welcomed";

export function welcomed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setWelcomed(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the panel comes back next time, which is harmless.
  }
}
