/**
 * The shared reading and writing of `/hitta-jobb`'s query string. Server and
 * client have to agree on it exactly: the server renders the results the URL
 * asks for, and the client rewrites the URL as the candidate searches.
 */
export const WORK_STYLES = ["any", "hybrid", "remote", "onsite"] as const;
export type WorkStyle = (typeof WORK_STYLES)[number];
export const QUERY_MAX = 200;

type Incoming = { [key: string]: string | string[] | undefined };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function readSearchUrl(params: Incoming) {
  const raw = first(params.q).trim().slice(0, QUERY_MAX);
  const style = first(params.arbetsform);
  return {
    query: raw,
    workStyle: (WORK_STYLES as readonly string[]).includes(style)
      ? (style as WorkStyle)
      : ("any" as WorkStyle),
  };
}

/** The query string for a search state, empty when nothing is narrowed down. */
export function searchUrlQuery(query: string, workStyle: string) {
  const params = new URLSearchParams();
  const trimmed = query.trim().slice(0, QUERY_MAX);
  if (trimmed) params.set("q", trimmed);
  if (workStyle && workStyle !== "any") params.set("arbetsform", workStyle);
  return params.toString();
}
