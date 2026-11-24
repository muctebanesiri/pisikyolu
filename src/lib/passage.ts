export const passageSelector = ".message[id], .transcript-anchor";

export function passageSeconds(id: string): number | null {
  const match = /^msg-(\d+)(?:-\d+)?$/.exec(id);
  return match ? Number(match[1]) : null;
}
