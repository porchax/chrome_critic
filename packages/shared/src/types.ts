export type FactCheckStatus = 'verified' | 'disputed' | 'refuted' | 'unverifiable';

export type ReplySource = {
  url: string;
  label: string;
};

export type Reply = {
  text: string;
  source?: ReplySource;
};

export type FactCheckItem = {
  claim: string;
  status: FactCheckStatus;
  explanation: string;
  sources: ReplySource[];
};

export type Report = {
  verdict: string;
  replies: Reply[];
  factcheck: FactCheckItem[];
  rhetoric: string;
  source_author: string;
  truncated?: boolean;
};

export type Quota = {
  used: number;
  total: 10;
  reset_at: string;
};

export type AnalyzeRequest = {
  uuid: string;
  url: string;
  domain: string;
  title: string;
  text: string;
  lang: string;
};

export type AnalyzeResponse =
  | { status: 'ok'; report: Report; quota: Quota; cached: boolean }
  | { status: 'quota-exhausted'; quota: Quota }
  | { status: 'too-short'; text_length: number }
  | { status: 'rate-limited'; retry_after: number }
  | { status: 'upstream-error'; kind: 'openrouter' | 'timeout' | 'db' }
  | { status: 'invalid-input'; field: string };

export type HistoryItem = {
  report_id: string;
  url: string;
  title: string;
  created_at: string;
};
