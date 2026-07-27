# Fix trade-goods label typing

- Update the trade-goods table shape so `tradeGoodLabels` remains a string array while distribution entries remain numeric pairs.
- Narrow dynamic distribution lookups in trade-goods generation.
- Run lint and typecheck to verify the TypeScript consumers.
