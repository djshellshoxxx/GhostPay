# Browser navigation in the payment client

Selecting a different view adds one browser entry. Re-selecting the current view or using the skip link adds none. Back and Forward select the corresponding view and focus the main landmark. Reloading a clean entry restores its enabled view. A suspended session continues to show Seller keys. History cannot activate a route outside the current profile.

An app-created entry contains only the allowed view ID and a numeric position. Its URL uses the current pathname, without a query or fragment. Existing same-entry metadata is retained when marking an incoming link. Route changes do not serialize invoices, accounts, scan results, payment drafts or settings. Leaving Pay clears the in-memory invoice. Forgetting an invoice removes its retained URL. Automatic fragment removal still applies immediately. With explicit retention, a new incoming invoice can remain in the address bar until departure. Revisiting a previously marked entry through Back or Forward opens the view with the old invoice redacted.

Settings can defer UI navigation and same-document browser traversal through the cancelable window event `ghostpay:settings-navigation`. A listener that prevents the default calls exactly one of `detail.proceed()` or `detail.cancel()` after the user's decision. Canceling browser traversal returns to the originating entry. Browser exits to a different document use native unload handling.

At widths below 40rem the navigation remains a single, horizontally scrollable row. Each labeled button retains a 44px minimum height, the current-page indication and native keyboard order. The build-status warning remains visible.
