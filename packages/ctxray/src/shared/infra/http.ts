// How ctxray itself reaches the internet: the user's proxy and CA certificates (ADR 0003).
export type Egress = {
  proxy: string | undefined;
  noProxy: readonly string[];
  ca: readonly string[]; // PEM text
};

export const DIRECT: Egress = { proxy: undefined, noProxy: [], ca: [] };

const bypasses = (host: string, noProxy: readonly string[]) =>
  noProxy.some((entry) => {
    const suffix = entry.replace(/^\*?\./, "");
    return entry === "*" || host === suffix || host.endsWith(`.${suffix}`);
  });

// fetch() through the user's proxy, unless the host is in NO_PROXY, and with the user's CA certificates.
export const fetchThrough = (url: URL, init: RequestInit, egress: Egress) => {
  const proxy = egress.proxy && !bypasses(url.hostname, egress.noProxy) ? egress.proxy : undefined;
  return fetch(url, { ...init, ...(proxy && { proxy }), ...(egress.ca.length > 0 && { tls: { ca: [...egress.ca] } }) });
};
