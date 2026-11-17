package bg.arena.play;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Opens the game without anyone touching the headset:
 *  - BOOT_COMPLETED: at power-on, after 12 s (the headset's shell needs a moment);
 *  - MY_PACKAGE_REPLACED: right after the installer updated the app;
 *  - bg.arena.play.START: sent by the installer (lobby-stage/keeper.js) with the identity as extras:
 *
 *      adb shell am broadcast -n bg.arena.play/.BootReceiver -a bg.arena.play.START
 *          --es id 1WMHH0000000 --ei number 3 --es color '#e8b33d' --es name 'Headset 3' [--es pc 192.168.1.45]
 *
 *    A broadcast returns at once, unlike `am start`, which can hang while the headset is not worn.
 * The service does the rest (find the computer, forward, open the game). Needs the overlay permission to open the
 * browser from the background on Android 10+; the installer grants it.
 */
public class BootReceiver extends BroadcastReceiver {
    static final String START = "bg.arena.play.START";

    @Override public void onReceive(Context c, Intent i) {
        String a = i != null ? i.getAction() : null;
        Log.i(ForwardService.TAG, "start: " + a);
        if (START.equals(a)) Identity.saveFromIntent(c, i);
        long delay = Intent.ACTION_BOOT_COMPLETED.equals(a) ? 12000 : 1500;
        if (START.equals(a) && i.hasExtra("delay")) delay = Math.max(0, i.getIntExtra("delay", 1500));
        ForwardService.send(c, ForwardService.ACTION_BOOT, delay, START.equals(a) ? i.getStringExtra("pc") : null);
    }
}
