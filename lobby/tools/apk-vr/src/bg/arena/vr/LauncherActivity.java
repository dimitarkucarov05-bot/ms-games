package bg.arena.vr;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

/**
 * The icon: asks KeepService to open the game and gets out of the way (the game's screen may share this task, so this
 * screen must never stay on top of it). All the work is in KeepService, which also opens the game at power-on and
 * when the headset is put on.
 *
 *   adb shell am start -n bg.arena.vr/.LauncherActivity
 */
public class LauncherActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        go();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        go();
    }

    private void go() {
        KeepService.send(this, KeepService.OPEN);
        ui.removeCallbacksAndMessages(null);
        ui.postDelayed(new Runnable() { @Override public void run() { if (!isFinishing()) finish(); } }, 1200);
    }

    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
