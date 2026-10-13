export const PERMS: { name: string; value: number }[] = [
  { name: "Ban Command", value: 0 },
  { name: "Unban Command", value: 1 },
  { name: "Softban Command", value: 2 },
  { name: "Kick Command", value: 3 },
  { name: "Mute Command", value: 4 },
  { name: "Unmute Command", value: 5 },
  { name: "Chat Clear Command", value: 6 },
  { name: "Lock Command", value: 7 },
  { name: "Unlock Command", value: 8 },
  { name: "LockAll Command", value: 9 },
  { name: "UnlockAll Command", value: 10 },
];

export const permChoices = PERMS.map((p) => ({ name: p.name, value: p.value }));
export function permName(v: number): string {
  return PERMS.find((p) => p.value === v)?.name ?? "Unknown";
}
