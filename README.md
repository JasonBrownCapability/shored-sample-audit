# Shored sample audit: Meadowlark

This is the sample enforcement-tier audit that [Shored](https://shored.dev) publishes to show the method behind the £550 one-day audit of founder-built apps.

- `index.html` / `report.md`: the report, as a founder receives it at the end of the day.
- `meadowlark/`: the codebase it audits. **Synthetic.** Meadowlark, its founder and its studios are fictional. Every key in `meadowlark/.env` is a placeholder containing `EXAMPLE`; there is no production project behind it. The failure modes were seeded to match what AI coding agents leave behind when they make an error go away, and `meadowlark/SEEDED.md` lists them so you can check the report against the tree.

Every finding in the report cites a file and line in `meadowlark/`. If you find one that does not hold, open an issue.

The method: every load-bearing rule in an app is classified as Tier 1 (enforced by a mechanism), Tier 2 (pinned by a test that would actually fail) or Tier 3 (prose only), sorted by blast radius, each with the cheapest adequate promotion, and a fixed-total sprint at the end.

© 2026 Jason Brown. Report text: CC BY-NC-ND 4.0. Sample code: MIT.
