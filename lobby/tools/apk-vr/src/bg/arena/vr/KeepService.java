package bg.arena.vr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import android.os.RemoteException;
import android.provider.Settings;
import android.util.Log;

import java.util.Locale;

/**
 * Keeps the arena's game on the headset, like the arena apps of VEX: the game opens at power-on and again every time
 * the headset is put on while the game is not on screen. Holds the Trusted Web Activity session of the Quest browser,
 * so it hears when the game's screen is shown or hidden. No libraries: the Binder calls are written by hand, with the
 * codes read from the Quest browser itself (service: warmup = 2, newSession = 3; callback: onNavigationEvent = 2).
 *
 * Commands (startForegroundService with an action): OPEN (now), BOOT (after the shell is ready), WAKE (check, open if needed).
 */
public class KeepService extends Service {
    static final String TAG = "MSGamesVR";
    static final String OPEN = "bg.arena.vr.OPEN", BOOT = "bg.arena.vr.BOOT", WAKE = "bg.arena.vr.WAKE";

    static final String BROWSER = "com.oculus.browser";
    static final String HOST = "https://arena.osmantush.com/play/";
    static final String SERVICE_CLASS = "org.chromium.chrome.browser.customtabs.CustomTabsConnectionService";
    static final String XR_ACTIVITY = "com.oculus.browser.WebXRCustomTabActivity";
    static final String DISPATCHER = "com.google.android.apps.chrome.IntentDispatcher";

    private static final String SERVICE_DESC = "android.support.customtabs.ICustomTabsService";
    private static final String CALLBACK_DESC = "android.support.customtabs.ICustomTabsCallback";
    private static final int T_WARMUP = IBinder.FIRST_CALL_TRANSACTION + 1;
    private static final int T_NEW_SESSION = IBinder.FIRST_CALL_TRANSACTION + 2;
    private static final int CB_NAVIGATION = IBinder.FIRST_CALL_TRANSACTION + 1;
    private static final int TAB_SHOWN = 5, TAB_HIDDEN = 6;

    private static final int BOOT_DELAY_MS = 12000;     // the headset's shell needs a moment after power-on
    private static final int WAKE_DELAY_MS = 4000;      // let the browser come back by itself first

    private final Handler ui = new Handler(Looper.getMainLooper());
    private IBinder browser;            // the browser's Custom Tabs service
    private boolean session;            // newSession accepted for our callback
    private volatile boolean shown;     // the game's screen is in front
    private long lastOpen;
    private ServiceConnection conn;
    private Runnable pending;           // what to do once the browser's service is connected

    /** The session's callback: the browser tells us when the game's screen is shown or hidden. */
    private final Binder callback = new Binder() {
        { attachInterface(null, CALLBACK_DESC); }
        @Override protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            if (code == INTERFACE_TRANSACTION) { reply.writeString(CALLBACK_DESC); return true; }
            if (code == CB_NAVIGATION) {
                try {
                    data.enforceInterface(CALLBACK_DESC);
                    int event = data.readInt();
                    if (event == TAB_SHOWN) shown = true;
                    else if (event == TAB_HIDDEN) shown = false;
                    Log.i(TAG, "game screen event " + event + (event == TAB_SHOWN ? " (shown)" : event == TAB_HIDDEN ? " (hidden)" : ""));
                } catch (RuntimeException ignored) { }
            }
            if (reply != null) reply.writeNoException();
            return true;
        }
    };

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            Log.i(TAG, "screen on: checking in " + WAKE_DELAY_MS + " ms");
            ui.removeCallbacks(check);
            ui.postDelayed(check, WAKE_DELAY_MS);
        }
    };

    private final Runnable check = new Runnable() {
        @Override public void run() {
            if (shown && browser != null && browser.isBinderAlive()) { Log.i(TAG, "the game is on screen: nothing to do"); return; }
            Log.i(TAG, "the game is not on screen: opening it");
            open();
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        startForeground(1, notification());
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screen, f);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        ui.removeCallbacks(check);
        if (BOOT.equals(a)) ui.postDelayed(check, BOOT_DELAY_MS);
        else if (WAKE.equals(a)) ui.postDelayed(check, WAKE_DELAY_MS);
        else if (OPEN.equals(a)) open();
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        try { unregisterReceiver(screen); } catch (RuntimeException ignored) { }
        unbind();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ the browser

    /** Opens the game (connecting to the browser first if needed). Twice within 5 s counts once. */
    void open() {
        long now = System.currentTimeMillis();
        if (now - lastOpen < 5000) return;
        lastOpen = now;
        if (browser != null && browser.isBinderAlive() && session) { launch(true); return; }
        unbind();
        pending = new Runnable() { @Override public void run() { launch(session); } };
        conn = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                browser = service;
                session = false;
                try {
                    service.linkToDeath(new IBinder.DeathRecipient() {
                        @Override public void binderDied() { Log.i(TAG, "the browser stopped"); shown = false; browser = null; session = false; }
                    }, 0);
                    call(service, T_WARMUP, true);
                    session = call(service, T_NEW_SESSION, false);
                } catch (RemoteException | RuntimeException e) {
                    Log.w(TAG, "session: " + e);
                }
                Log.i(TAG, "session " + (session ? "made" : "refused"));
                Runnable r = pending; pending = null;
                if (r != null) r.run();
            }
            @Override public void onServiceDisconnected(ComponentName name) { browser = null; session = false; shown = false; }
        };
        boolean bound = false;
        try {
            // the Quest browser keeps the service exported but drops its action: by its name
            bound = bindService(new Intent().setComponent(new ComponentName(BROWSER, SERVICE_CLASS)), conn, Context.BIND_AUTO_CREATE | Context.BIND_WAIVE_PRIORITY);
        } catch (SecurityException e) {
            Log.w(TAG, "bind: " + e);
        }
        if (!bound) { conn = null; pending = null; launch(false); return; }
        ui.postDelayed(new Runnable() { @Override public void run() {      // no answer: open anyway
            Runnable r = pending; pending = null;
            if (r != null) r.run();
        } }, 4000);
    }

    private void unbind() {
        if (conn != null) { try { unbindService(conn); } catch (RuntimeException ignored) { } }
        conn = null; browser = null; session = false;
    }

    private boolean call(IBinder service, int code, boolean warmup) throws RemoteException {
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(SERVICE_DESC);
            if (warmup) data.writeLong(0); else data.writeStrongBinder(callback);
            service.transact(code, data, reply, 0);
            reply.readException();
            return reply.readInt() != 0;
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    private void launch(boolean withSession) {
        Uri url = gameUrl();
        Intent view = new Intent(Intent.ACTION_VIEW, url).setPackage(BROWSER);
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", withSession ? callback : null);
        view.putExtras(extras);
        view.putExtra("android.support.customtabs.extra.LAUNCH_AS_TRUSTED_WEB_ACTIVITY", true);
        Bundle mode = new Bundle();
        mode.putInt("androidx.browser.trusted.displaymode.KEY_ID", 1);          // immersive
        mode.putBoolean("androidx.browser.trusted.displaymode.KEY_STICKY", true);
        view.putExtra("androidx.browser.trusted.extra.DISPLAY_MODE", mode);
        view.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 0);
        // one game screen only: the browser's own task for it is cleared and started anew
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Log.i(TAG, "open " + url + (withSession ? " (trusted)" : " (no session)"));
        String[] targets = withSession ? new String[] { XR_ACTIVITY, DISPATCHER } : new String[] { DISPATCHER };
        for (String cls : targets) {
            try {
                startActivity(new Intent(view).setComponent(new ComponentName(BROWSER, cls)));
                Log.i(TAG, "started " + cls);
                return;
            } catch (ActivityNotFoundException | SecurityException e) {
                Log.w(TAG, cls + ": " + e);
            }
        }
        try { startActivity(view); } catch (RuntimeException e) { Log.w(TAG, "no browser: " + e); }
    }

    // ------------------------------------------------------------------ who we are

    private Uri gameUrl() {
        return Uri.parse(HOST).buildUpon()
                .appendQueryParameter("id", stableId())
                .appendQueryParameter("name", deviceName())
                .appendQueryParameter("app", "1")
                .build();
    }

    /** Q2-<ANDROID_ID>: the same id as the Arena app (same signing key), so the lobby knows the headset. */
    private String stableId() {
        String id = null;
        try { id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID); } catch (RuntimeException ignored) { }
        if (id == null || id.isEmpty()) id = "unknown";
        return "Q2-" + id;
    }

    /** The device name; the factory "Quest 2" gets three characters of the id. The lobby's own names win over it. */
    private String deviceName() {
        String id = stableId();
        String tail = id.substring(Math.max(3, id.length() - 3)).toUpperCase(Locale.ROOT);
        String dev = null;
        try { dev = Settings.Global.getString(getContentResolver(), "device_name"); } catch (RuntimeException ignored) { }
        if (dev != null) dev = dev.trim();
        if (dev == null || dev.isEmpty()) dev = Build.MODEL;
        boolean factory = dev.equalsIgnoreCase(Build.MODEL) || dev.toLowerCase(Locale.ROOT).matches("^(meta |oculus )?quest.*");
        return factory ? dev + " " + tail : dev;
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("keep", "MS Games VR", NotificationManager.IMPORTANCE_MIN));
        return new Notification.Builder(this, "keep")
                .setContentTitle("MS Games VR")
                .setContentText("Keeps the arena's game on this headset")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .build();
    }

    /** Starts the service with a command (from the icon, at power-on, from the computer). */
    static void send(Context c, String action) {
        Intent i = new Intent(c, KeepService.class).setAction(action);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
}
