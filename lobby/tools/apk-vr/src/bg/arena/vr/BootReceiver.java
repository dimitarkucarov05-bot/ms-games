package bg.arena.vr;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Power-on (and after an update of this app): the game opens by itself, like the arena apps of VEX. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        Log.i(KeepService.TAG, "start: " + i.getAction());
        KeepService.send(c, KeepService.BOOT);
    }
}
