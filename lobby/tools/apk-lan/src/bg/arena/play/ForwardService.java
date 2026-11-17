package bg.arena.play;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.BindException;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Keeps the forwarder alive while the game runs: a foreground service with a notification.
 * Stops when the app is opened again and told "Stop", or when the arena computer has been silent for 10 minutes
 * (headset awake time).
 *
 * Since 2.1 it also works without the start screen:
 *  - ACTION_BOOT (power-on, app update, or the installer's broadcast): finds the computer, forwards, opens the game;
 *  - ACTION_OPEN: opens the game now (the start screen hands this over, so there is one way of opening);
 *  - keep in front: while the computer says a session or the waiting room is on (GET /api/keep?id=), a game that has
 *    not been in front for 5 s is brought back. Needs the overlay permission (background activity start) and usage
 *    access (to see what is in front), both granted by the installer over adb.
 */
public class ForwardService extends Service implements Forwarder.Events, Forwarder.Target {
    static final String TAG = "Arena";
    static final String PREFS = "arena";

    static final String EXTRA_HOST = "host";
    static final String EXTRA_PORT = "port";
    static final String EXTRA_LISTEN = "listen";
    static final String EXTRA_DELAY = "delay";
    static final String ACTION_BOOT = "bg.arena.play.BOOT";
    static final String ACTION_OPEN = "bg.arena.play.OPEN";

    static final int STOPPED = 0;
    static final int STARTING = 1;
    static final int LISTENING = 2;
    static final int PORT_BUSY = 3;
    static final int FAILED = 4;

    /** Read by the start screen (same process). */
    static volatile int state = STOPPED;
    static volatile String host;
    static volatile int port = Discovery.DEFAULT_HTTP;
    static volatile int listenPort = Discovery.DEFAULT_HTTP;
    static volatile String error;

    private static final int NOTE_ID = 1;
    private static final String CHANNEL = "arena";
    private static final long GONE_AFTER_MS = 10 * 60 * 1000L;
    private static final long CHECK_EVERY_MS = 10 * 1000L;
    private static final long SWITCH_AFTER_SILENCE_MS = 10 * 1000L;

    private static final long KEEP_EVERY_MS = 2000;
    private static final long KEEP_ASK_EVERY_MS = 3000;
    private static final long KEEP_AFTER_MS = 5000;
    private static final long KEEP_REOPEN_GAP_MS = 15000;
    private static final long BOOT_DELAY_MS = 12000;
    private static final long BOOT_GIVE_UP_MS = 30 * 60 * 1000L;

    private Forwarder forwarder;
    private Forwarder secure;              // localhost:<tls> -> computer:<tls> (raw TLS), only for an https origin
    private volatile InetSocketAddress target;
    private volatile boolean alive;
    private volatile long lastSeen;       // SystemClock.uptimeMillis(): does not run while the headset sleeps
    private Thread watchdog;
    private Thread beacon;
    private Thread keeper;
    private Thread booter;
    private volatile DatagramSocket beaconSocket;
    private PowerManager.WakeLock wakeLock;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private GameOpener opener;
    private volatile boolean kept;         // started by BOOT/OPEN: stays even when forwarding is not possible

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    @Override public void onCreate() {
        super.onCreate();
        alive = true;
        error = null;
        lastSeen = SystemClock.uptimeMillis();
        opener = new GameOpener(this);
        keeper = new Thread(new Runnable() {
            @Override public void run() {
                keepLoop();
            }
        }, "arena-keep");
        keeper.setDaemon(true);
        keeper.start();
    }

    /** Starts the service with a command from anywhere (also from the background: power-on, the installer). */
    static void send(Context c, String action, long delayMs) {
        send(c, action, delayMs, null);
    }

    /** pc: the computer's address when the caller knows it (the installer passes it), else null = find it. */
    static void send(Context c, String action, long delayMs, String pc) {
        Intent i = new Intent(c, ForwardService.class).setAction(action).putExtra(EXTRA_DELAY, delayMs);
        if (pc != null && !pc.trim().isEmpty()) i.putExtra(EXTRA_HOST, pc.trim());
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (RuntimeException e) {
            Log.e(TAG, "cannot start the service: " + e);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_BOOT.equals(action) || ACTION_OPEN.equals(action)) {
            kept = true;
            try {
                startForeground(NOTE_ID, note(host));
            } catch (RuntimeException e) {
                Log.w(TAG, "startForeground: " + e);
            }
            if (ACTION_OPEN.equals(action)) openGame();
            else boot(intent.getLongExtra(EXTRA_DELAY, BOOT_DELAY_MS), intent.getStringExtra(EXTRA_HOST));
            return START_STICKY;
        }

        if (state != LISTENING) state = STARTING;
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String h = intent != null ? intent.getStringExtra(EXTRA_HOST) : null;
        int p = intent != null ? intent.getIntExtra(EXTRA_PORT, 0) : 0;
        int lp = intent != null ? intent.getIntExtra(EXTRA_LISTEN, 0) : 0;
        if (h == null) {                 // restarted by the system: take the last working address
            h = prefs.getString("host", null);
            p = prefs.getInt("port", Discovery.DEFAULT_HTTP);
        }
        if (p <= 0) p = Discovery.DEFAULT_HTTP;
        if (lp <= 0) lp = forwarder != null ? listenPort : Discovery.DEFAULT_HTTP;

        try {
            startForeground(NOTE_ID, note(h));
        } catch (RuntimeException e) {   // started from the background (Android 12+): work while the system allows
            Log.w(TAG, "startForeground: " + e);
        }

        if (h == null) {
            fail(FAILED, "no address of the computer");
            return START_NOT_STICKY;
        }
        return forward(h, p, lp) ? START_STICKY : START_NOT_STICKY;
    }

    /** Starts (or re-aims) the forwarder. false = it could not listen (state says why). */
    private synchronized boolean forward(String h, int p, int lp) {
        setTarget(h, p);
        lastSeen = SystemClock.uptimeMillis();

        if (forwarder != null && lp != listenPort) {   // another local port (tests only): start again
            forwarder.stop();
            forwarder = null;
        }
        if (forwarder == null) {
            listenPort = lp;
            Forwarder f = new Forwarder(lp, this, this);
            try {
                f.start();
            } catch (BindException e) {
                fail(PORT_BUSY, "port " + lp + " is busy: " + e.getMessage());
                return false;
            } catch (IOException e) {
                fail(FAILED, String.valueOf(e.getMessage()));
                return false;
            }
            forwarder = f;
            startThreads();
        }
        startSecure();
        if (getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("wakelock", false)) holdWakeLock();
        state = LISTENING;
        Log.i(TAG, "forwarding localhost:" + listenPort + " -> " + h + ":" + p);
        return true;
    }

    /**
     * An https origin on this headset (Identity.origin, for example https://lo.<domain>:47843 with that name pointing
     * at 127.0.0.1) needs the computer's TLS port on localhost too. Bytes pass through untouched, so the browser sees
     * the computer's own certificate.
     */
    private void startSecure() {
        if (secure != null) return;
        Identity me = Identity.load(this);
        if (me.origin == null || !me.origin.startsWith("https://")) return;
        int tls = 443;
        int colon = me.origin.lastIndexOf(':');
        if (colon > 6) {
            try { tls = Integer.parseInt(me.origin.substring(colon + 1)); } catch (NumberFormatException ignored) { }
        }
        if (tls < 1024) {
            Log.w(TAG, "origin " + me.origin + ": an app cannot listen below port 1024; use a port such as 47843");
            return;
        }
        final int tlsPort = tls;
        Forwarder f = new Forwarder(tlsPort, new Forwarder.Target() {
            @Override public InetSocketAddress current() {
                InetSocketAddress t = target;
                return t == null ? null : new InetSocketAddress(t.getAddress(), tlsPort);
            }
        }, this);
        try {
            f.start();
            secure = f;
            Log.i(TAG, "passing TLS localhost:" + tlsPort + " -> " + host + ":" + tlsPort);
        } catch (IOException e) {
            Log.w(TAG, "TLS port " + tlsPort + ": " + e.getMessage());
        }
    }

    private void fail(int code, String why) {
        error = why;
        state = code;
        Log.e(TAG, "forwarding did not start: " + why);
        if (!kept) stopSelf();
    }

    private void setTarget(String h, int p) {
        boolean changed = !h.equals(host) || p != port;
        host = h;
        port = p;
        target = new InetSocketAddress(h, p);
        if (changed && forwarder != null) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            try { nm.notify(NOTE_ID, note(h)); } catch (RuntimeException ignored) {}
        }
    }

    private Notification note(String h) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "MS Games", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("The game's link to the arena computer");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("MS Games")
                .setContentText(h == null ? "Connecting to the arena computer"
                        : "Connected to the arena computer (" + h + ")")
                .setColor(0xFFC8F03C)
                .setOngoing(true)
                .setContentIntent(open)
                .build();
    }

    private void startThreads() {
        watchdog = new Thread(new Runnable() {
            @Override public void run() {
                watch();
            }
        }, "arena-watchdog");
        watchdog.setDaemon(true);
        watchdog.start();

        beacon = new Thread(new Runnable() {
            @Override public void run() {
                listenForBeacon();
            }
        }, "arena-beacon");
        beacon.setDaemon(true);
        beacon.start();
    }

    /** Every 10 seconds: is the computer alive? After 10 minutes of silence the service stops itself. */
    private void watch() {
        while (alive) {
            try {
                Thread.sleep(CHECK_EVERY_MS);
            } catch (InterruptedException e) {
                return;
            }
            if (!alive) return;
            long now = SystemClock.uptimeMillis();
            if (now - lastSeen >= CHECK_EVERY_MS && Discovery.reachable(host, port, 2000)) {
                lastSeen = SystemClock.uptimeMillis();
            }
            long silent = SystemClock.uptimeMillis() - lastSeen;
            if (silent > GONE_AFTER_MS) {
                Log.w(TAG, "the arena computer has been silent for " + (silent / 60000) + " min: stopping");
                stopSelf();
                return;
            }
        }
    }

    /** Listens for the beacon while running: if the computer changes its address, the forwarder follows it. */
    private void listenForBeacon() {
        while (alive) {
            DatagramSocket s = null;
            try {
                s = Discovery.open();
                beaconSocket = s;
                while (alive) {
                    Discovery.Found f = Discovery.receive(s, 5000);
                    if (f != null) onBeacon(f);
                }
            } catch (IOException e) {
                if (!alive) return;
                Log.d(TAG, "beacon: " + e.getMessage());
            } finally {
                if (s != null) s.close();
            }
            try {
                Thread.sleep(3000);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private void onBeacon(Discovery.Found f) {
        long now = SystemClock.uptimeMillis();
        if (f.host.equals(host)) {
            lastSeen = now;
            if (f.http != port) setTarget(f.host, f.http);
            return;
        }
        // another address: move only if the current one is silent and the new one really answers
        if (now - lastSeen < SWITCH_AFTER_SILENCE_MS) return;
        if (f.http == listenPort && (f.host.startsWith("127.") || f.host.equals("::1") || f.host.equals("0:0:0:0:0:0:0:1"))) return;
        if (!Discovery.probe(f.host, f.http, 1500)) return;
        Log.i(TAG, "the arena computer is now at " + f + " (was " + host + ")");
        setTarget(f.host, f.http);
        lastSeen = SystemClock.uptimeMillis();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("host", f.host).putInt("port", f.http).apply();
    }

    private void holdWakeLock() {
        if (wakeLock != null) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arena:forwarder");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(4 * 60 * 60 * 1000L);
            Log.i(TAG, "keeping the headset awake (wakelock on)");
        } catch (RuntimeException e) {
            Log.w(TAG, "wake lock: " + e);
        }
    }

    // ------------------------------------------------------------------ power-on and opening

    /** Power-on / installer: wait for the shell, find the computer, forward, open the game. Retries for 30 minutes. */
    private void boot(final long delayMs, final String pcHint) {
        if (booter != null && booter.isAlive()) return;
        booter = new Thread(new Runnable() {
            @Override public void run() {
                Identity me = Identity.load(ForwardService.this);
                Log.i(TAG, "starting without the screen in " + delayMs + " ms; identity " + me);
                if (!me.autostart) { Log.i(TAG, "autostart is off in the identity file"); return; }
                sleep(delayMs);
                long until = SystemClock.uptimeMillis() + BOOT_GIVE_UP_MS;
                while (alive && SystemClock.uptimeMillis() < until) {
                    if (state == LISTENING && Discovery.probe("127.0.0.1", listenPort, 1500)) { openGame(); return; }
                    // on the cable the computer may already hold the port (adb reverse): the game answers without us
                    if (state != LISTENING && Discovery.probe("127.0.0.1", Discovery.DEFAULT_HTTP, 800)) {
                        Log.i(TAG, "the game already answers on localhost (cable)");
                        openGame();
                        return;
                    }
                    Discovery.Found pc = null;
                    if (pcHint != null) {                  // the installer said where the computer is: try it first
                        pc = Locator.locate(ForwardService.this, pcHint, null);
                        if (!Discovery.probe(pc.host, pc.http, 2500)) pc = null;
                    }
                    if (pc == null) pc = Locator.locate(ForwardService.this, null, new Locator.Alive() {
                        @Override public boolean alive() { return alive; }
                    });
                    if (pc != null && Discovery.probe(pc.host, pc.http, 2500)) {
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("host", pc.host).putInt("port", pc.http).apply();
                        if (forward(pc.host, pc.http, Discovery.DEFAULT_HTTP)
                                || Discovery.probe("127.0.0.1", Discovery.DEFAULT_HTTP, 1500)) {
                            openGame();
                            return;
                        }
                    }
                    Log.i(TAG, "the arena computer is not there yet: trying again in 15 s");
                    sleep(15000);
                }
            }
        }, "arena-boot");
        booter.setDaemon(true);
        booter.start();
    }

    private void openGame() {
        ui.post(new Runnable() {
            @Override public void run() {
                if (!alive) return;
                Identity me = Identity.load(ForwardService.this);
                if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(ForwardService.this)) {
                    Log.w(TAG, "no overlay permission: opening from the background may be refused (installer: appops set "
                            + getPackageName() + " SYSTEM_ALERT_WINDOW allow)");
                }
                opener.open(me, listenPort);
            }
        });
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { }
    }

    // ------------------------------------------------------------------ keep in front

    private void keepLoop() {
        long lastAsk = 0, notFrontSince = 0, lastReopen = 0;
        boolean keep = false, warned = false;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        while (alive) {
            sleep(KEEP_EVERY_MS);
            if (!alive) return;
            long now = SystemClock.uptimeMillis();
            if (pm != null && !pm.isInteractive()) { notFrontSince = 0; continue; }     // asleep or not worn
            if (opener.opened == null) { notFrontSince = 0; continue; }                 // the game was never opened by us
            if (now - lastAsk >= KEEP_ASK_EVERY_MS) { lastAsk = now; keep = serverWantsGame(); }
            if (!keep) { notFrontSince = 0; continue; }
            Boolean front = opener.inFront();
            if (front == null) {
                if (!warned) {
                    warned = true;
                    Log.w(TAG, "keep in front: cannot see what is in front (installer: appops set " + getPackageName() + " GET_USAGE_STATS allow)");
                }
                continue;
            }
            if (front) { notFrontSince = 0; continue; }
            if (notFrontSince == 0) { notFrontSince = now; continue; }
            if (now - notFrontSince >= KEEP_AFTER_MS && now - lastReopen >= KEEP_REOPEN_GAP_MS) {
                Log.i(TAG, "keep in front: the game has been away for " + (now - notFrontSince) + " ms, bringing it back");
                lastReopen = now;
                notFrontSince = 0;
                openGame();
            }
        }
    }

    /** Does the computer want this headset in the game or the waiting room right now? */
    private boolean serverWantsGame() {
        Identity me = Identity.load(this);
        String base = "http://127.0.0.1:" + listenPort;
        try {
            String body = get(base + "/api/keep?id=" + URLEncoder.encode(me.id, "UTF-8"));
            if (body != null) return new JSONObject(body).optBoolean("keep", false);
            // a server without /api/keep: a running session or an open mode (flow) means keep
            body = get(base + "/api/state");
            if (body == null) return false;
            JSONObject st = new JSONObject(body);
            return (st.has("run") && !st.isNull("run")) || (st.has("flow") && !st.isNull("flow"));
        } catch (Exception e) {
            return false;
        }
    }

    /** GET with short timeouts; null on a status other than 200 or any error. */
    private static String get(String address) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(address).openConnection();
            c.setConnectTimeout(1500);
            c.setReadTimeout(2500);
            c.setUseCaches(false);
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 4 * 1024 * 1024) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ---- Forwarder.Target / Forwarder.Events ----

    @Override public InetSocketAddress current() {
        InetSocketAddress t = target;
        // never to ourselves: every connection would open another one to the same port without end
        if (t != null && t.getPort() == listenPort && t.getAddress() != null && t.getAddress().isLoopbackAddress()) return null;
        return t;
    }

    @Override public void log(String line) {
        Log.i(TAG, line);
    }

    @Override public void upstream(boolean ok) {
        if (ok) lastSeen = SystemClock.uptimeMillis();
    }

    @Override public void active(int count) {
    }

    @Override public void onDestroy() {
        alive = false;
        ui.removeCallbacksAndMessages(null);
        if (opener != null) opener.unbind();
        if (keeper != null) keeper.interrupt();
        if (booter != null) booter.interrupt();
        if (secure != null) secure.stop();
        secure = null;
        if (forwarder != null) forwarder.stop();
        forwarder = null;
        DatagramSocket s = beaconSocket;
        if (s != null) s.close();
        if (watchdog != null) watchdog.interrupt();
        if (beacon != null) beacon.interrupt();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (state == LISTENING || state == STARTING) state = STOPPED;
        Log.i(TAG, "the service stopped");
        super.onDestroy();
    }
}
