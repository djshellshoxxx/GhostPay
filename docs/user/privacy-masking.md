# Privacy mode: hiding sensitive details on screen

Privacy mode hides sensitive details in the GhostPay page, for example while you share your screen or work in public.
It is off until you turn it on with the **Privacy mode** switch at the top of every page. The choice is saved in this
browser and applies to every open GhostPay tab. If the browser cannot save it, privacy mode still applies to the
current tab and the page says so. A saved choice that cannot be read is treated as on.

## What is hidden

While privacy mode is on, every working page (Seller keys, Create invoice, Pay, Scan, Sweep, Registry, Settings and
the others) is removed from the page, together with GhostPay's screen-reader announcements and wallet request
reviews. Hidden content is not blurred or covered: its text, form values and attributes are absent from the page and
from the accessibility tree. Home and About stay visible because they show only public deployment information.

Hiding does not stop or lose anything. Drafts you were typing, pending work and keys in memory stay as they were and
reappear when you reveal. Privacy mode does not lock your vault, wipe keys or change any saved data.

## Revealing

**Reveal details for 30 seconds** shows the page until the first of these happens:

- 30 seconds pass, measured on two independent clocks; a clock that moves backwards ends the reveal at once;
- you choose **Hide sensitive details** or press **Alt+Shift+H**;
- you open another page or a different invoice;
- the app locks, idles out or loads different seller keys;
- your wallet account, network or provider changes;
- the tab is hidden or closed.

A wallet request review appears only while details are revealed. If masking resumes during a review, the review is
cancelled and nothing reaches your wallet; reveal again and repeat the action.

## Limits

- Privacy mode covers GhostPay's own page only. Browser address bars and menus, wallet extension windows, operating
  system notifications and other applications are outside it.
- A few rare confirmations use the browser's own dialog. They contain no amounts, addresses or keys, but the page
  behind an open dialog stays revealed until the dialog closes, even past 30 seconds; it hides as soon as it closes.
- Anyone who can use your unlocked device can reveal details. Privacy mode protects against onlookers, not against
  someone operating the page.
