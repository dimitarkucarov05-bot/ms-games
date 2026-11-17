package bg.arena.play;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Малък TCP препращач: слуша на localhost в каската и прелива всяка връзка към компютъра на залата,
 * байт по байт и в двете посоки. Така браузърът отваря http://localhost:47801 (защитен контекст,
 * WebXR работи, няма сертификати), а зад него стои играта от компютъра. HTTP и WebSocket минават еднакво.
 * Чиста Java, без Android, за да се пробва и на компютър.
 */
public final class Forwarder {

    /** Накъде да се прелива в момента. Може да се смени, докато препращачът работи. */
    public interface Target {
        InetSocketAddress current();
    }

    public interface Events {
        void log(String line);

        /** Успя ли (или не) връзка към компютъра. */
        void upstream(boolean ok);

        /** Колко връзки са отворени в момента. */
        void active(int count);
    }

    private static final int CONNECT_TIMEOUT_MS = 3000;
    private static final int LINGER_AFTER_EOF_S = 15;
    private static final int BUF = 16 * 1024;

    private final int port;
    private final Target target;
    private final Events events;

    private final List<ServerSocket> servers = new CopyOnWriteArrayList<>();
    private final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
    private final AtomicInteger active = new AtomicInteger();
    private final AtomicLong seq = new AtomicLong();
    private final AtomicLong bytes = new AtomicLong();
    private volatile boolean running;
    private ExecutorService pool;
    private ScheduledExecutorService timer;

    public Forwarder(int port, Target target, Events events) {
        this.port = port;
        this.target = target;
        this.events = events;
    }

    public boolean isRunning() {
        return running;
    }

    public int activeConnections() {
        return active.get();
    }

    public long totalConnections() {
        return seq.get();
    }

    public long totalBytes() {
        return bytes.get();
    }

    /** Започва да слуша на 127.0.0.1 (задължително) и на ::1 (ако може). Хвърля BindException при зает порт. */
    public synchronized void start() throws IOException {
        if (running) return;
        ThreadFactory daemons = new ThreadFactory() {
            private final AtomicInteger n = new AtomicInteger();

            @Override public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "arena-fwd-" + n.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        servers.add(listen(InetAddress.getByAddress("localhost", new byte[] {127, 0, 0, 1})));
        try {
            byte[] v6 = new byte[16];
            v6[15] = 1;
            servers.add(listen(InetAddress.getByAddress("localhost", v6)));
        } catch (IOException e) {
            events.log("не слушам на ::1 (не пречи): " + e.getMessage());
        }
        pool = Executors.newCachedThreadPool(daemons);
        timer = Executors.newSingleThreadScheduledExecutor(daemons);
        running = true;
        for (final ServerSocket s : servers) {
            Thread t = new Thread(new Runnable() {
                @Override public void run() {
                    acceptLoop(s);
                }
            }, "arena-accept");
            t.setDaemon(true);
            t.start();
        }
        events.log("слушам на localhost:" + port);
    }

    private ServerSocket listen(InetAddress addr) throws IOException {
        ServerSocket s = new ServerSocket();
        try {
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(addr, port), 64);
            return s;
        } catch (IOException e) {
            try { s.close(); } catch (IOException ignored) {}
            throw e;
        }
    }

    public synchronized void stop() {
        if (!running && servers.isEmpty()) return;
        running = false;
        for (ServerSocket s : servers) {
            try { s.close(); } catch (IOException ignored) {}
        }
        servers.clear();
        for (Socket s : sockets) close(s);
        sockets.clear();
        if (pool != null) pool.shutdownNow();
        if (timer != null) timer.shutdownNow();
        events.log("спрях");
    }

    private void acceptLoop(ServerSocket server) {
        while (running) {
            final Socket client;
            try {
                client = server.accept();
            } catch (IOException e) {
                if (!running || server.isClosed()) return;
                events.log("accept: " + e.getMessage());
                try { Thread.sleep(200); } catch (InterruptedException ie) { return; }
                continue;
            }
            try {
                pool.execute(new Runnable() {
                    @Override public void run() {
                        handle(client);
                    }
                });
            } catch (RuntimeException e) {   // спрян басейн от нишки
                close(client);
            }
        }
    }

    private void handle(final Socket client) {
        final long id = seq.incrementAndGet();
        final Socket up = new Socket();
        sockets.add(client);
        sockets.add(up);
        events.active(active.incrementAndGet());
        try {
            client.setTcpNoDelay(true);
            InetSocketAddress to = target.current();
            try {
                if (to == null) throw new IOException("няма адрес на компютъра");
                up.setTcpNoDelay(true);
                up.connect(to, CONNECT_TIMEOUT_MS);
            } catch (IOException e) {
                events.upstream(false);
                events.log("#" + id + " компютърът не отговаря (" + to + "): " + e.getMessage());
                refuse(client);
                return;
            }
            events.upstream(true);
            Future<?> other = pool.submit(new Runnable() {
                @Override public void run() {
                    pump(id, client, up, true);
                }
            });
            pump(id, up, client, false);
            try {
                other.get();
            } catch (Exception ignored) {
            }
        } catch (IOException | RuntimeException e) {
            if (running) events.log("#" + id + " " + e);
        } finally {
            close(client);
            close(up);
            sockets.remove(client);
            sockets.remove(up);
            events.active(active.decrementAndGet());
        }
    }

    /** Прелива from -> to до края на потока. При грешка затваря и двете, за да се отпуши другата посока. */
    private void pump(long id, final Socket from, final Socket to, boolean fromClient) {
        byte[] buf = new byte[BUF];
        boolean first = fromClient;
        try {
            InputStream in = from.getInputStream();
            OutputStream out = to.getOutputStream();
            int n;
            while ((n = in.read(buf)) >= 0) {
                if (n == 0) continue;
                if (first) {
                    first = false;
                    logRequest(id, buf, n);
                }
                out.write(buf, 0, n);
                bytes.addAndGet(n);
            }
            // Едната страна приключи с изпращането: казваме го на другата и чакаме още малко насрещната посока.
            try { to.shutdownOutput(); } catch (IOException ignored) {}
            try {
                timer.schedule(new Runnable() {
                    @Override public void run() {
                        close(from);
                        close(to);
                    }
                }, LINGER_AFTER_EOF_S, TimeUnit.SECONDS);
            } catch (RuntimeException ignored) {   // спрян таймер
                close(from);
                close(to);
            }
        } catch (IOException e) {
            close(from);
            close(to);
        }
    }

    /** Първият ред на първата заявка по връзката, за дневника: "GET /play/ HTTP/1.1". */
    private void logRequest(long id, byte[] buf, int n) {
        int end = 0;
        while (end < n && end < 200 && buf[end] != '\r' && buf[end] != '\n') {
            if (buf[end] < 0x20 || buf[end] > 0x7e) return;   // не е текст (не е HTTP)
            end++;
        }
        if (end < 5) return;
        events.log("#" + id + " " + new String(buf, 0, end, StandardCharsets.US_ASCII));
    }

    private static final String DOWN_PAGE =
            "<!doctype html><html lang=\"bg\"><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<meta http-equiv=\"refresh\" content=\"3\"><title>MS Games</title></head>"
            + "<body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#131411;"
            + "color:#e9ece2;font:22px system-ui,sans-serif\"><div style=\"text-align:center\">"
            + "<div style=\"font-size:44px;font-weight:700;letter-spacing:.02em\">MS Games</div>"
            + "<p style=\"opacity:.75\">The arena computer is not answering. Trying again…</p></div></body></html>";

    /** Компютърът не се отваря: връщаме на браузъра кратка страница, която сама опитва пак след 3 секунди. */
    private void refuse(Socket client) {
        try {
            client.setSoTimeout(300);
            try {
                client.getInputStream().read(new byte[8192]);   // прочитаме заявката, за да не стане RST при затваряне
            } catch (IOException ignored) {
            }
            byte[] body = DOWN_PAGE.getBytes(StandardCharsets.UTF_8);
            String head = "HTTP/1.1 502 Bad Gateway\r\n"
                    + "Content-Type: text/html; charset=utf-8\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
            OutputStream out = client.getOutputStream();
            out.write(head.getBytes(StandardCharsets.US_ASCII));
            out.write(body);
            out.flush();
            client.shutdownOutput();
            try {
                client.getInputStream().read(new byte[256]);    // кратко изчакване браузърът да затвори
            } catch (IOException ignored) {
            }
        } catch (IOException ignored) {
        }
    }

    private static void close(Socket s) {
        try { s.close(); } catch (IOException ignored) {}
    }
}
