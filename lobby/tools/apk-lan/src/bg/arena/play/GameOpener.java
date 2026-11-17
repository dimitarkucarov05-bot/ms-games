package bg.arena.play;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import android.os.RemoteException;
import android.provider.Browser;
import android.util.Log;

/**
 * Opens the game page in the Quest browser and tells whether it is in front.
 *
 * Two ways to open (Identity.vr):
 *  - "xr" (default): the browser's immersive custom tab, com.oculus.browser.WebXRCustomTabActivity, started by
 *    component with a Custom Tabs session and the trusted-web-activity extras. In that screen the page may enter VR
 *    by itself (play.js does it on ?app=1), so no press is needed. Same origin as the plain tab
 *    (http://localhost:<listen>), so spatial anchors and storage carry over. See research/enter-vr.md.
 *  - "tab": a normal browser tab (the way of v1-v10); entering VR then needs a press, or the keeper's DevTools click.
 * If the immersive screen cannot be started, the plain tab is used.
 *
 * The Custom Tabs session is written by hand (no libraries); the Binder codes were read from the Quest browser
 * (service: warmup = 2, newSession = 3; callback: onNavigationEvent = 2), the same as tools/apk-vr.
 * Its callback tells us when the game screen is shown or hidden (TAB_SHOWN 5 / TAB_HIDDEN 6).
 */
final class GameOpener {
    static final String BROWSER = "com.oculus.browser";
    private static final String TAG = ForwardService.TAG;
    private static final String SERVICE_CLASS = "org.chromium.chrome.browser.customtabs.CustomTabsConnectionService";
    private static final String XR_ACTIVITY = "com.oculus.browser.WebXRCustomTabActivity";
    private static final String SERVICE_DESC = "android.support.customtabs.ICustomTabsService";
    private static final String CALLBACK_DESC = "android.support.customtabs.ICustomTabsCallback";
    private static final int T_WARMUP = IBinder.FIRST_CALL_TRANSACTION + 1;
    private static final int T_NEW_SESSION = IBinder.FIRST_CALL_TRANSACTION + 2;
    private static final int CB_NAVIGATION = IBinder.FIRST_CALL_TRANSACTION + 1;
    private static final int TAB_SHOWN = 5, TAB_HIDDEN = 6;

    private final Context ctx;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private IBinder browser;
    private boolean session;
    private ServiceConnection conn;
    private Runnable pending;
    private long lastOpen;

    /** null = not known (no session), else whether the immersive game screen is in front. */
    volatile Boolean shown;
    /** What was opened last: "xr", "tab" or null. */
    volatile String opened;

    private final Binder callback = new Binder() {
        { attachInterface(null, CALLBACK_DESC); }

        @Override protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            if (code == INTERFACE_TRANSACTION) { reply.writeString(CALLBACK_DESC); return true; }
            if (code == CB_NAVIGATION) {
                try {
                    data.enforceInterface(CALLBACK_DESC);
                    int event = data.readInt();
                    if (event == TAB_SHOWN) shown = Boolean.TRUE;
                    else if (event == TAB_HIDDEN) shown = Boolean.FALSE;
                    Log.i(TAG, "game screen event " + event);
                } catch (RuntimeException ignored) { }
            }
            if (reply != null) reply.writeNoException();
            return true;
        }
    };

    GameOpener(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    /** The page address for this headset. */
    static Uri url(Identity me, int listenPort, boolean xr) {
        String base = me.origin != null ? me.origin : "http://localhost:" + listenPort;
        Uri.Builder b = me.addTo(Uri.parse(base + "/play/").buildUpon());
        if (xr) b.appendQueryParameter("app", "1");
        return b.build();
    }

    /** Opens the game. Must be called on the main thread. Twice within 4 s counts once. */
    void open(final Identity me, final int listenPort) {
        long now = System.currentTimeMillis();
        if (now - lastOpen < 4000) return;
        lastOpen = now;
        if (!"xr".equals(me.vr)) { openTab(url(me, listenPort, false)); return; }
        if (browser != null && browser.isBinderAlive() && session) { openXr(me, listenPort, true); return; }
        unbind();
        pending = new Runnable() { @Override public void run() { openXr(me, listenPort, session); } };
        conn = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                browser = service;
                session = false;
                try {
                    service.linkToDeath(new IBinder.DeathRecipient() {
                        @Override public void binderDied() { Log.i(TAG, "the browser stopped"); shown = null; browser = null; session = false; }
                    }, 0);
                    call(service, T_WARMUP, true);
                    session = call(service, T_NEW_SESSION, false);
                } catch (RemoteException | RuntimeException e) {
                    Log.w(TAG, "custom tabs session: " + e);
                }
                Log.i(TAG, "custom tabs session " + (session ? "made" : "refused"));
                runPending();
            }

            @Override public void onServiceDisconnected(ComponentName name) { browser = null; session = false; shown = null; }
        };
        boolean bound = false;
        try {
            bound = ctx.bindService(new Intent().setComponent(new ComponentName(BROWSER, SERVICE_CLASS)), conn,
                    Context.BIND_AUTO_CREATE | Context.BIND_WAIVE_PRIORITY);
        } catch (SecurityException e) {
            Log.w(TAG, "bind: " + e);
        }
        if (!bound) { conn = null; pending = null; openXr(me, listenPort, false); return; }
        ui.postDelayed(new Runnable() { @Override public void run() { runPending(); } }, 4000);   // no answer: open anyway
    }

    private void runPending() {
        Runnable r = pending;
        pending = null;
        if (r != null) r.run();
    }

    private void openXr(Identity me, int listenPort, boolean withSession) {
        Uri url = url(me, listenPort, true);
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
        // one game screen only: the browser's task for it is cleared and started anew
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        try {
            ctx.startActivity(new Intent(view).setComponent(new ComponentName(BROWSER, XR_ACTIVITY)));
            Log.i(TAG, "opened (immersive tab" + (withSession ? ", session" : "") + ") " + url);
            opened = "xr";
            if (withSession) shown = Boolean.TRUE;
            return;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w(TAG, "immersive tab not available, using a normal tab: " + e);
        }
        openTab(url(me, listenPort, false));
    }

    private void openTab(Uri url) {
        Intent view = new Intent(Intent.ACTION_VIEW, url)
                .setPackage(BROWSER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(Browser.EXTRA_APPLICATION_ID, ctx.getPackageName());   // same tab next time, if the browser honours it
        try {
            ctx.startActivity(view);
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w(TAG, "no " + BROWSER + ", trying the default browser");
            try {
                ctx.startActivity(view.setPackage(null));
            } catch (ActivityNotFoundException | SecurityException e2) {
                Log.e(TAG, "no browser: " + e2);
                return;
            }
        }
        Log.i(TAG, "opened (tab) " + url);
        opened = "tab";
        shown = null;
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

    void unbind() {
        if (conn != null) { try { ctx.unbindService(conn); } catch (RuntimeException ignored) { } }
        conn = null;
        browser = null;
        session = false;
    }

    // ------------------------------------------------------------------ in front?

    /**
     * Is the game in front? From the system's usage events when the installer granted usage access
     * (`appops set bg.arena.play GET_USAGE_STATS allow`), else from the session callback. null = cannot tell.
     */
    Boolean inFront() {
        String fg = foreground(ctx);
        if (fg != null) return fg.equals(BROWSER) || fg.equals(ctx.getPackageName());
        return shown;
    }

    /**
     * The package whose activity was resumed last and not paused since; "" = nothing of an app is in front (Quest home
     * or the system menu); null = no usage access.
     */
    static String foreground(Context c) {
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return null;
        long now = System.currentTimeMillis();
        UsageEvents events;
        try {
            events = usm.queryEvents(now - 6 * 60 * 60 * 1000L, now);
        } catch (RuntimeException e) {
            return null;
        }
        if (events == null) return null;
        UsageEvents.Event ev = new UsageEvents.Event();
        String pkg = null, cls = null;
        boolean paused = false, any = false;
        while (events.hasNextEvent()) {
            events.getNextEvent(ev);
            any = true;
            int t = ev.getEventType();
            if (t == UsageEvents.Event.MOVE_TO_FOREGROUND) {           // = ACTIVITY_RESUMED
                pkg = ev.getPackageName();
                cls = ev.getClassName();
                paused = false;
            } else if (t == UsageEvents.Event.MOVE_TO_BACKGROUND) {    // = ACTIVITY_PAUSED
                if (ev.getPackageName().equals(pkg) && (cls == null || cls.equals(ev.getClassName()))) paused = true;
            }
        }
        // Without usage access the query answers with nothing at all (not even our own app's events).
        if (!any) return null;
        return pkg == null || paused ? "" : pkg;
    }
}
