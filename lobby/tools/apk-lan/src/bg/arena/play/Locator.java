package bg.arena.play;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.wifi.WifiManager;
import android.util.Log;

import java.io.IOException;
import java.net.DatagramSocket;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Finds the arena computer: a manual address, else the UDP beacon for up to 4 s while the last working address is
 * tried in parallel, else a scan of the subnet. Used by the start screen and by the service (power-on, no screen).
 */
final class Locator {
    interface Alive {
        boolean alive();
    }

    private static final String TAG = ForwardService.TAG;
    private static final int SEARCH_MS = 4000;

    private Locator() { }

    static Discovery.Found locate(Context c, String manualPc, Alive alive) {
        if (manualPc != null && !manualPc.trim().isEmpty()) {
            String h = manualPc.trim();
            int p = Discovery.DEFAULT_HTTP;
            int colon = h.lastIndexOf(':');
            if (colon > 0) {
                try { p = Integer.parseInt(h.substring(colon + 1)); } catch (NumberFormatException ignored) {}
                h = h.substring(0, colon);
            }
            return new Discovery.Found(h, p, Discovery.DEFAULT_HTTPS);
        }

        SharedPreferences prefs = c.getSharedPreferences(ForwardService.PREFS, Context.MODE_PRIVATE);
        final String savedHost = prefs.getString("host", null);
        final int savedPort = prefs.getInt("port", Discovery.DEFAULT_HTTP);
        final AtomicBoolean savedOk = new AtomicBoolean();
        Thread probe = null;
        if (savedHost != null) {
            probe = new Thread(new Runnable() {
                @Override public void run() {
                    savedOk.set(Discovery.probe(savedHost, savedPort, 2500));
                }
            }, "arena-saved");
            probe.setDaemon(true);
            probe.start();
        }

        WifiManager.MulticastLock lock = null;
        try {
            WifiManager wifi = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            lock = wifi.createMulticastLock("arena-discovery");
            lock.setReferenceCounted(false);
            lock.acquire();
        } catch (RuntimeException e) {
            Log.d(TAG, "multicast lock: " + e);
        }

        DatagramSocket s = null;
        try {
            s = Discovery.open();
            long start = System.currentTimeMillis();
            while (alive.alive()) {
                long passed = System.currentTimeMillis() - start;
                if (passed >= SEARCH_MS) break;
                Discovery.Found f = Discovery.receive(s, (int) Math.min(250, SEARCH_MS - passed));
                if (f != null) return f;
                // the old address answers and there is no beacon yet: do not keep the player waiting
                if (savedOk.get() && passed >= 700) break;
            }
        } catch (IOException e) {
            Log.w(TAG, "UDP search: " + e);
        } finally {
            if (s != null) s.close();
            if (lock != null) {
                try { lock.release(); } catch (RuntimeException ignored) {}
            }
        }

        if (probe != null) {
            try { probe.join(2600); } catch (InterruptedException ignored) {}
            if (savedOk.get()) {
                Log.i(TAG, "no beacon, using the saved address " + savedHost);
                return new Discovery.Found(savedHost, savedPort, Discovery.DEFAULT_HTTPS);
            }
        }

        // last try: the router may block the beacon; scan the subnet
        if (!alive.alive()) return null;
        Discovery.Found scanned = Discovery.scan(Discovery.DEFAULT_HTTP, 350, false);
        if (scanned != null) Log.i(TAG, "no beacon, found the computer by scanning: " + scanned);
        return scanned;
    }
}
