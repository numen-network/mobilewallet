package org.numen.network.wallet;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "MetaMaskLauncher")
public class MetaMaskLauncherPlugin extends Plugin {
  @PluginMethod
  public void openPairing(PluginCall call) {
    String wcUri = call.getString("uri");
    if (wcUri == null || !wcUri.startsWith("wc:")) {
      call.reject("Invalid WalletConnect pairing URI");
      return;
    }
    Uri url = Uri.parse("https://metamask.app.link/wc?uri=" + Uri.encode(wcUri));
    Intent intent = new Intent(Intent.ACTION_VIEW, url);
    intent.addCategory(Intent.CATEGORY_BROWSABLE);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    try {
      getContext().startActivity(intent);
      call.resolve();
    } catch (ActivityNotFoundException e) {
      call.reject("No application can open the MetaMask pairing link", e);
    } catch (Exception e) {
      call.reject("Unable to launch MetaMask: " + e.getMessage(), e);
    }
  }
  @PluginMethod
  public void openWallet(PluginCall call) {
    try {
      // Explicitly target MetaMask. Android 11+ package visibility can make
      // getLaunchIntentForPackage() return null even when MetaMask is installed.
      Intent deepLink = new Intent(Intent.ACTION_VIEW, Uri.parse("metamask://"));
      deepLink.setPackage("io.metamask");
      deepLink.addCategory(Intent.CATEGORY_BROWSABLE);
      deepLink.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      try {
        getContext().startActivity(deepLink);
      } catch (ActivityNotFoundException unavailable) {
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage("io.metamask");
        if (launch == null) {
          call.reject("MetaMask could not be opened. Please open MetaMask manually to approve the pending request.");
          return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
      }
      call.resolve();
    } catch (Exception e) {
      call.reject("Unable to open MetaMask: " + e.getMessage(), e);
    }
  }
  @PluginMethod
  public void openDapp(PluginCall call) {
    // MetaMask's in-app browser injects window.ethereum for the web wallet.
    Uri url = Uri.parse("https://metamask.app.link/dapp/wallet.numen-network.org");
    Intent intent = new Intent(Intent.ACTION_VIEW, url);
    intent.addCategory(Intent.CATEGORY_BROWSABLE);
    intent.setPackage("io.metamask");
    try {
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      // Don't silently open an arbitrary browser without MetaMask injection.
      call.reject("MetaMask Mobile is not available to open the Numen web wallet: " + e.getMessage(), e);
    }
  }

}
