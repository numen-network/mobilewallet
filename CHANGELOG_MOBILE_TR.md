# Numen Wallet 6-section navigation

Bottom navigation: Home, Explore, 3D Registry, 3D Verify, Activity, Governance.
Explore, 3D Registry and 3D Verify are Coming Soon screens.
Home retains account management and balances. Governance keeps the original governance view.
Activity opens the existing activity sidebar from its own page.
MetaMask action remains accessible from Home.

To update your existing Android project: copy `src/App.tsx` into its `src/App.tsx`.
Then run:

```
corepack pnpm run mobile:build
corepack pnpm exec cap sync android
```

Re-run the app in Android Studio. No reinstall of dependencies is required.
The UI patch was not compiled on Android in this environment.
