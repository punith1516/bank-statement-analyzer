export type TransactionType = "Debit" | "Credit";

export type ParsedTransaction = {
  date: string; // YYYY-MM-DD
  time?: string; // optional time or HH:mm
  datetime: string; // YYYY-MM-DDTHH:mm:ss
  description: string;
  counterparty?: string;
  narration?: string;
  transaction_type: TransactionType;
  amount: number;
  balance?: number | null;
  utr?: string;
  transaction_id?: string;
  account_mask?: string;
};

export type TransactionRow = {
  date: string;
  time: string | null;
  datetime: string;
  description: string | null;
  counterparty: string | null;
  narration: string | null;
  transaction_type: TransactionType;
  debit: number;
  credit: number;
  amount: number;
  balance?: number | null;
  utr: string | null;
  transaction_id: string | null;
  account_mask: string | null;
  source_file?: string | null;
};

// Adobe Extract API types
export type AdobeExtractElement = {
  Path: string;
  Text?: string;
  Bounds?: number[];
  Page?: number;
  Font?: {
    name: string;
    size: number;
    weight?: number;
  };
  TextSize?: number;
  attributes?: Record<string, unknown>;
  filePaths?: string[];
};

export type AdobeExtractTableCell = {
  content?: string;
  rowSpan?: number;
  colSpan?: number;
};

export type AdobeExtractTable = {
  Page: number;
  Path: string;
  Bounds?: number[];
  Headers?: AdobeExtractTableCell[][];
  Rows?: AdobeExtractTableCell[][];
};

export type AdobeStructuredData = {
  elements: AdobeExtractElement[];
  tables?: AdobeExtractTable[];
  version?: string;
};
