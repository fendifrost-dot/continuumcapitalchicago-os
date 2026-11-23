export type PayingClientSnapshot = {
  is_paying_client: boolean;
  paying_note?: string | null;
};

export type PayingClientWrite = {
  is_paying_client: boolean;
  paying_note: string | null;
  paying_marked_by: string;
  paying_marked_at: string;
};

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Columns to write when staff create or edit a client.
 * A new client left unmarked, with no note, writes nothing so the defaults stand.
 * Turning the flag on or off, or changing the note, stamps the staff user.
 * An edit that leaves both alone returns null so the existing stamp stays.
 */
export function payingClientWrite(input: {
  isPaying: boolean;
  note: string | null | undefined;
  actorId: string;
  markedAt: string;
  previous?: PayingClientSnapshot | null;
}): PayingClientWrite | null {
  const paying_note = blankToNull(input.note);
  const previous = input.previous ?? null;
  if (
    previous &&
    previous.is_paying_client === input.isPaying &&
    blankToNull(previous.paying_note) === paying_note
  ) {
    return null;
  }
  if (!previous && !input.isPaying && paying_note === null) {
    return null;
  }
  const actorId = input.actorId.trim();
  if (!actorId) {
    throw new Error("A staff user is required to change the paying client flag.");
  }
  return {
    is_paying_client: input.isPaying,
    paying_note,
    paying_marked_by: actorId,
    paying_marked_at: input.markedAt,
  };
}
