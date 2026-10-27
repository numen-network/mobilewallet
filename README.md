Numen Mobile Wallet
Official non-custodial mobile wallet for Numen Network.

Numen Wallet is an open-source cryptocurrency wallet built for Android and iOS using React, TypeScript, and Capacitor.

Features
Create and import Numen accounts
Send and receive NUMN
View account balances and transaction history
Manage Numen and EVM assets
Connect MetaMask through WalletConnect
Participate in Numen on-chain governance
Secure wallet access with application password and biometric authentication
Light and dark themes
Numen Blocks — create, edit, save, and export 3D voxel models
Access Numen Network ecosystem resources
Development
Requirements:

Node.js
pnpm
Android Studio for Android development
macOS and Xcode for iOS development
Install dependencies:

corepack pnpm install
Build the mobile application:

corepack pnpm run mobile:build
Android
corepack pnpm exec cap sync android
corepack pnpm exec cap open android
iOS
On macOS, after the iOS platform has been configured:

corepack pnpm exec cap sync ios
corepack pnpm exec cap open ios
Downloads
Android APK releases will be available under the GitHub Releases section.

Google Play availability will be announced after publication.

Security
Numen Wallet is designed as a non-custodial wallet. Users control their own wallet credentials.

Wallet secrets must never be committed to this repository or included in public builds. Users should securely back up their recovery phrases and never share them.

The application has not yet completed an independent security audit.

Numen Network
Website: https://numen-network.org
Explorer: https://explorer.numen-network.org
GitHub: https://github.com/numen-network
Telegram: https://t.me/numen_network
License
MIT License, subject to the repository's LICENSE file.