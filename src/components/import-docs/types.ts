import type { DraftDoc } from "@/lib/import/docs";

/** A customer or supplier a name in the paste is mapped to; null = it will be added as a new one. */
export type PartyChoice = { id: number; name: string } | null;

/** One distinct name in the paste, how it was matched and what will happen to it. */
export interface PartyState {
  /** The name as first written in the file. */
  name: string;
  /** How many documents use it. */
  docs: number;
  choice: PartyChoice;
  /** The customer or supplier it matches exactly (spelling rules of normName). */
  exact: { id: number; name: string } | null;
  /** Close matches to offer, not used unless the person picks one. */
  maybe: { id: number; name: string }[];
}

export type RowStatus = "idle" | "running" | "done" | "failed";

/** A document in the review table: the draft plus where it stands. */
export interface UiDoc extends DraftDoc {
  ticked: boolean;
  status: RowStatus;
  /** Why it failed. */
  message: string;
  /** What it was saved as (and its receipt / voucher). */
  result: { id: number; number: string; paymentNumber: string | null } | null;
}

export interface ImportContext {
  today: string;
  hasOurTrn: boolean;
  banks: { id: number; name: string; kind: string }[];
  suppliers: { id: number; name: string; termsDays: number }[];
}
