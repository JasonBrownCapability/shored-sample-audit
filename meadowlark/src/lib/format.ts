import { format } from "date-fns";

// All money in Meadowlark is stored as integer pence.
export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatSessionTime(iso: string): string {
  return format(new Date(iso), "EEE d MMM, HH:mm");
}
