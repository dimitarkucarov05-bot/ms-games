package bg.arena.play;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import java.io.IOException;
import java.net.BindException;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;

/**
 * Държи препращача жив, докато браузърът е отпред: услуга на преден план с известие.
 * Спира, когато приложението се отвори пак и му се каже „Спри", или когато компютърът
 * на залата не се е обаждал 10 минути (будно време на каската).
 */
public class ForwardService extends Service implements Forwarder.Events, Forwarder.Target {
    static final String TAG = "Arena";
    static final String PREFS = "arena";

    static final String EXTRA_HOST = "host";
    static final String EXTRA_PORT = "port";
    static final String EXTRA_LISTEN = "listen";

    static final int STOPPED = 0;
    static final int STARTING = 1;
    static final int LISTENING = 2;
    static final int PORT_BUSY = 3;
    static final int FAILED = 4;

    /** Състоянието се чете от началния екран (същият процес). */
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

    private Forwarder forwarder;
    private volatile InetSocketAddress target;
    private volatile boolean alive;
    private volatile long lastSeen;       // SystemClock.uptimeMillis(): не тече, докато каската спи
    private Thread watchdog;
    private Thread beacon;
    private volatile DatagramSocket beaconSocket;
    private PowerManager.WakeLock wakeLock;

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    @Override public void onCreate() {
        super.onCreate();
        alive = true;
        state = STARTING;
        error = null;
        lastSeen = SystemClock.uptimeMillis();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String h = intent != null ? intent.getStringExtra(EXTRA_HOST) : null;
        int p = intent != null ? intent.getIntExtra(EXTRA_PORT, 0) : 0;
        int lp = intent != null ? intent.getIntExtra(EXTRA_LISTEN, 0) : 0;
        if (h == null) {                 // системата ни е пуснала отново сама: взимаме последния работил адрес
            h = prefs.getString("host", null);
            p = prefs.getInt("port", Discovery.DEFAULT_HTTP);
        }
        if (p <= 0) p = Discovery.DEFAULT_HTTP;
        if (lp <= 0) lp = forwarder != null ? listenPort : Discovery.DEFAULT_HTTP;

        try {
            startForeground(NOTE_ID, note(h));
        } catch (RuntimeException e) {   // пускане от заден план (Android 12+): работим, докато системата позволи
            Log.w(TAG, "startForeground: " + e);
        }

        if (h == null) {
            fail(FAILED, "няма адрес на компютъра");
            return START_NOT_STICKY;
        }
        setTarget(h, p);
        lastSeen = SystemClock.uptimeMillis();

        if (forwarder != null && lp != listenPort) {   // друг местен порт (само при проби): пускаме наново
            forwarder.stop();
            forwarder = null;
        }
        if (forwarder == null) {
            listenPort = lp;
            Forwarder f = new Forwarder(lp, this, this);
            try {
                f.start();
            } catch (BindException e) {
                fail(PORT_BUSY, "порт " + lp + " е зает: " + e.getMessage());
                return START_NOT_STICKY;
            } catch (IOException e) {
                fail(FAILED, String.valueOf(e.getMessage()));
                return START_NOT_STICKY;
            }
            forwarder = f;
            startThreads();
        }
        if (prefs.getBoolean("wakelock", false)) holdWakeLock();
        state = LISTENING;
        Log.i(TAG, "препращам localhost:" + listenPort + " -> " + h + ":" + p);
        return START_STICKY;
    }

    private void fail(int code, String why) {
        error = why;
        state = code;
        Log.e(TAG, "услугата не тръгна: " + why);
        stopSelf();
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

    /** На всеки 10 секунди: жив ли е компютърът. След 10 минути тишина услугата се спира сама. */
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
                Log.w(TAG, "компютърът на залата мълчи " + (silent / 60000) + " мин: спирам");
                stopSelf();
                return;
            }
        }
    }

    /** Слуша сигнала и докато работи: ако компютърът смени адреса си, препращачът тръгва след него. */
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
                Log.d(TAG, "сигнал: " + e.getMessage());
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
        // Друг адрес: местим се само ако сегашният мълчи и новият наистина отговаря.
        if (now - lastSeen < SWITCH_AFTER_SILENCE_MS) return;
        if (f.http == listenPort && (f.host.startsWith("127.") || f.host.equals("::1") || f.host.equals("0:0:0:0:0:0:0:1"))) return;
        if (!Discovery.probe(f.host, f.http, 1500)) return;
        Log.i(TAG, "компютърът на залата вече е на " + f + " (беше " + host + ")");
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
            Log.i(TAG, "държа каската будна (включено с wakelock)");
        } catch (RuntimeException e) {
            Log.w(TAG, "wake lock: " + e);
        }
    }

    // ---- Forwarder.Target / Forwarder.Events ----

    @Override public InetSocketAddress current() {
        InetSocketAddress t = target;
        // Никога към самите себе си: иначе всяка връзка би отваряла нова към същия порт без край.
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
        if (forwarder != null) forwarder.stop();
        forwarder = null;
        DatagramSocket s = beaconSocket;
        if (s != null) s.close();
        if (watchdog != null) watchdog.interrupt();
        if (beacon != null) beacon.interrupt();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (state == LISTENING || state == STARTING) state = STOPPED;
        Log.i(TAG, "услугата спря");
        super.onDestroy();
    }
}
