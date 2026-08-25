// Appends a cookie to the response without clobbering any Set-Cookie
// header(s) already set earlier in the same request. Adds "; Secure"
// automatically in production, but skips it in local dev so cookies still
// work over plain http://127.0.0.1.
export function appendCookie(res, cookieStr) {
  const withSecure =
    process.env.NODE_ENV === 'production' ? `${cookieStr}; Secure` : cookieStr;

  const existing = res.getHeader('Set-Cookie');
  let next;
  if (!existing) next = [withSecure];
  else if (Array.isArray(existing)) next = [...existing, withSecure];
  else next = [existing, withSecure];

  res.setHeader('Set-Cookie', next);
}
