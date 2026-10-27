package org.numen.network.wallet;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Android Storage Access Framework: user chooses Downloads or another folder.
 * No broad storage or media permissions are needed. */
@CapacitorPlugin(name = "NumenModelSave")
public class NumenModelSavePlugin extends Plugin {
  @PluginMethod
  public void save(PluginCall call) {
    String content = call.getString("content");
    String filename = call.getString("filename", "NumenBlocks.obj");
    if (content == null || content.length() > 8_000_000) {
      call.reject("Invalid or oversized model"); return;
    }
    if (!filename.matches("[a-zA-Z0-9_.-]{1,100}\\.obj")) filename = "NumenBlocks.obj";
    try {
      Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("application/octet-stream");
      intent.putExtra(Intent.EXTRA_TITLE, filename);
      startActivityForResult(call, intent, "onDocumentSelected");
    } catch (Exception e) { call.reject("Cannot open Android file picker: " + e.getMessage(), e); }
  }

  @ActivityCallback
  private void onDocumentSelected(PluginCall call, androidx.activity.result.ActivityResult result) {
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      call.reject("SAVE_CANCELLED"); return;
    }
    Uri uri = result.getData().getData();
    try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
      if (stream == null) throw new IllegalStateException("Cannot write selected document");
      stream.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
      stream.flush();
      JSObject response = new JSObject(); response.put("uri", uri.toString()); call.resolve(response);
    } catch (Exception e) { call.reject("Could not save OBJ file: " + e.getMessage(), e); }
  }
}
