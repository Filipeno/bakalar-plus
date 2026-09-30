package cz.filipeno.bakalarplus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a reboot or an app update: re-arm the background check and redraw the widget. */
public class Boot extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        SyncJob.schedule(c);
        Widget.updateAll(c);
    }
}
