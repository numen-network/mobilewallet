package org.numen.network.wallet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MetaMaskLauncherPlugin.class);
    registerPlugin(NumenModelSavePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
