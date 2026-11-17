package bg.arena.play;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Намира компютъра на залата. Сървърът вика на всеки 2 секунди по UDP 47810:
 * {"app":"arena-play","http":47801,"https":47843}. Адресът е адресът на подателя.
 * Чиста Java, без Android, за да се пробва и на компютър.
 */
public final class Discovery {
    public static final int BEACON_PORT = 47810;
    public static final int DEFAULT_HTTP = 47801;
    public static final int DEFAULT_HTTPS = 47843;

    private static final Pattern APP = Pattern.compile("\"app\"\\s*:\\s*\"arena-play\"");
    private static final Pattern HTTP = Pattern.compile("\"http\"\\s*:\\s*(\\d{1,5})");
    private static final Pattern HTTPS = Pattern.compile("\"https\"\\s*:\\s*(\\d{1,5})");

    private Discovery() {}

    public static final class Found {
        public final String host;
        public final int http;
        public final int https;

        public Found(String host, int http, int https) {
            this.host = host;
            this.http = http;
            this.https = https;
        }

        @Override public String toString() {
            return host + ":" + http;
        }
    }

    /** Гнездо за сигнала. С SO_REUSEADDR, за да слушат едновременно и услугата, и началният екран. */
    public static DatagramSocket open() throws IOException {
        DatagramSocket s = new DatagramSocket(null);
        try {
            s.setReuseAddress(true);
            s.setBroadcast(true);
            s.bind(new InetSocketAddress(BEACON_PORT));
            return s;
        } catch (IOException e) {
            s.close();
            throw e;
        }
    }

    /** Чака един валиден сигнал до waitMs милисекунди. Връща null, ако не дойде. */
    public static Found receive(DatagramSocket s, int waitMs) throws IOException {
        long deadline = System.nanoTime() + waitMs * 1_000_000L;
        byte[] buf = new byte[512];
        while (true) {
            long left = (deadline - System.nanoTime()) / 1_000_000L;
            if (left <= 0) return null;
            s.setSoTimeout((int) Math.max(1, left));
            DatagramPacket p = new DatagramPacket(buf, buf.length);
            try {
                s.receive(p);
            } catch (SocketTimeoutException e) {
                return null;
            }
            Found f = parse(new String(p.getData(), p.getOffset(), p.getLength(), StandardCharsets.UTF_8), p.getAddress());
            if (f != null) return f;
        }
    }

    /** Разбира едно съобщение. Чуждите съобщения на същия порт дават null. */
    public static Found parse(String json, InetAddress from) {
        if (json == null || from == null || !APP.matcher(json).find()) return null;
        int http = port(HTTP.matcher(json), DEFAULT_HTTP);
        int https = port(HTTPS.matcher(json), DEFAULT_HTTPS);
        return new Found(from.getHostAddress(), http, https);
    }

    private static int port(Matcher m, int fallback) {
        if (!m.find()) return fallback;
        int v = Integer.parseInt(m.group(1));
        return v > 0 && v < 65536 ? v : fallback;
    }

    /** Отваря гнездо, чака сигнал до timeoutMs и затваря. */
    public static Found find(int timeoutMs) throws IOException {
        DatagramSocket s = open();
        try {
            return receive(s, timeoutMs);
        } finally {
            s.close();
        }
    }

    /** Истинска проверка: отговаря ли играта на host:port (GET /play/ дава HTTP 200). */
    public static boolean probe(String host, int port, int timeoutMs) {
        if (host == null || host.isEmpty()) return false;
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), timeoutMs);
            s.setSoTimeout(timeoutMs);
            OutputStream out = s.getOutputStream();
            out.write(("GET /play/ HTTP/1.0\r\nHost: " + host + ":" + port + "\r\nConnection: close\r\n\r\n")
                    .getBytes(StandardCharsets.US_ASCII));
            out.flush();
            InputStream in = s.getInputStream();
            byte[] head = new byte[12];
            int n = 0;
            while (n < head.length) {
                int r = in.read(head, n, head.length - n);
                if (r < 0) break;
                n += r;
            }
            String line = new String(head, 0, n, StandardCharsets.US_ASCII);
            return line.startsWith("HTTP/1.") && line.endsWith(" 200");
        } catch (IOException e) {
            return false;
        } finally {
            try { s.close(); } catch (IOException ignored) {}
        }
    }

    /**
     * Резервно търсене, когато сигналът по UDP не стига до каската (някои рутери не пускат такива съобщения
     * между безжични устройства): обхожда собствената /24 мрежа и пита всеки адрес на порта на играта.
     * Обикновено трае 2-3 секунди. Връща null, ако няма Wi-Fi или никой не отговаря.
     */
    public static Found scan(final int port, final int connectMs, boolean includeSelf) {
        java.util.List<byte[]> own = new java.util.ArrayList<>();
        try {
            for (java.net.NetworkInterface ni : java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : java.util.Collections.list(ni.getInetAddresses())) {
                    if (a instanceof java.net.Inet4Address && a.isSiteLocalAddress()) own.add(a.getAddress());
                }
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
        if (own.isEmpty()) return null;

        final java.util.concurrent.atomic.AtomicReference<String> hit = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(48, new java.util.concurrent.ThreadFactory() {
            @Override public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "arena-scan");
                t.setDaemon(true);
                return t;
            }
        });
        for (byte[] me : own) {
            for (int i = 1; i <= 254; i++) {
                if (!includeSelf && i == (me[3] & 0xff)) continue;
                final String host = (me[0] & 0xff) + "." + (me[1] & 0xff) + "." + (me[2] & 0xff) + "." + i;
                pool.execute(new Runnable() {
                    @Override public void run() {
                        if (hit.get() == null && reachable(host, port, connectMs) && probe(host, port, 1500)) {
                            hit.compareAndSet(null, host);
                        }
                    }
                });
            }
        }
        pool.shutdown();
        long deadline = System.nanoTime() + 8_000_000_000L;
        try {
            while (hit.get() == null && System.nanoTime() < deadline) {
                if (pool.awaitTermination(100, java.util.concurrent.TimeUnit.MILLISECONDS)) break;
            }
        } catch (InterruptedException ignored) {
        }
        pool.shutdownNow();
        String host = hit.get();
        return host == null ? null : new Found(host, port, DEFAULT_HTTPS);
    }

    /** Само дали портът се отваря (по-евтино от probe, за честите проверки на услугата). */
    public static boolean reachable(String host, int port, int timeoutMs) {
        if (host == null || host.isEmpty()) return false;
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (IOException e) {
            return false;
        } finally {
            try { s.close(); } catch (IOException ignored) {}
        }
    }
}
