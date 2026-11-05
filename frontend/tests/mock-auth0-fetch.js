const originalFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== "https://tenant.example.test")
    return originalFetch(input, init);
  const target = new URL(
    `/_test/auth0${url.pathname}${url.search}`,
    "http://127.0.0.1:3102",
  );
  return originalFetch(
    input instanceof Request ? new Request(target, input) : target,
    init,
  );
};
