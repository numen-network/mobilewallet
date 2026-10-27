# Numen Wallet mobil ana sayfa güncellemesi
- Explore kaldırıldı; alt menü 5 bölüm: Home, 3D Registry, 3D Verify, Activity, Governance.
- MetaMask benzeri Home: aktif hesap seçici, NUMN bakiyesi, Send, Receive, Account Settings, Assets.
- Create Account: orijinal dört seçenek (Browser extension, New account, From seed, Watch only). Varsayılan New account.
- Account Settings: Rename this account; yerel hesaplarda Change password ve Create a backup file.
- İşaretlenmiş diğer hesap işlemleri yeni mobil ana sayfada gösterilmiyor.
- 3D Registry ve 3D Verify Coming Soon. Activity ve Governance mevcut altyapıyı korur.
- Var olan kaynak modülleri korunmuştur; eski kodları kaldırmak yerine mobil ana ekranda erişimlerini sınırlandırır.
- Gerçek Android/iOS derlemesi bu ortamda yapılmadı.

## Uygulama
ZIP içindeki src/App.tsx ve src/accounts/AddAccountModal.tsx dosyalarını aynı yollarla çalışan projenize kopyalayın.
corepack pnpm run mobile:build
corepack pnpm exec cap sync android
Android Studio: Run app
