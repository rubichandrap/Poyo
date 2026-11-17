# Archived text from ADR 0005

Superseded by ADR 0012. Kept verbatim so the history of the decision stays readable; the current decision is in [`../0005-framework-package-owns-client-runtime.md`](../0005-framework-package-owns-client-runtime.md).

The channel it reads is a framework contract: the server sets `ViewBag.ServerData` as System.Text.Json serialization output, `_Layout.cshtml` injects it into `window.SERVER_DATA` via `Html.Raw` (the default encoder's HTML-sensitive escaping is what keeps the channel XSS-safe), and the client reads it once per page load — a one-shot bootstrap, no reactivity, fresh data flows through the API path.
