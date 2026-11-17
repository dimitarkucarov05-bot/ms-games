import bg.arena.play.Discovery;
import bg.arena.play.Forwarder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Проба на препращача и откриването на компютър, без каска (същият код влиза в APK).
 *
 *   powershell -ExecutionPolicy Bypass -File test\run.ps1
 *
 * Към истинския сървър на играта прави само едно GET /play/ (не се свързва като каска).
 * Аргумент: адресът на сървъра на играта (по подразбиране 127.0.0.1:47801); "-" прескача тази част.
 */
public class PcTest {
    static int failed;
    static final List<String> log = new ArrayList<>();

    static final Forwarder.Events EVENTS = new Forwarder.Events() {
        @Override public void log(String line) {
            synchronized (PcTest.log) { PcTest.log.add(line); }
        }

        @Override public void upstream(boolean ok) {
        }

        @Override public void active(int count) {
        }
    };

    static void check(String what, boolean ok, String detail) {
        System.out.println((ok ? "  OK    " : "  FAIL  ") + what + (detail == null ? "" : "  (" + detail + ")"));
        if (!ok) failed++;
    }

    static int freePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            return s.getLocalPort();
        }
    }

    /** Сървър, който връща всичко получено и затваря, когато отсрещната страна приключи с изпращането. */
    static ServerSocket echoServer() throws IOException {
        final ServerSocket server = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
        Thread t = new Thread(() -> {
            while (!server.isClosed()) {
                try {
                    final Socket c = server.accept();
                    Thread h = new Thread(() -> {
                        try (Socket s = c) {
                            byte[] buf = new byte[8192];
                            InputStream in = s.getInputStream();
                            OutputStream out = s.getOutputStream();
                            int n;
                            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
                        } catch (IOException ignored) {
                        }
                    });
                    h.setDaemon(true);
                    h.start();
                } catch (IOException e) {
                    return;
                }
            }
        });
        t.setDaemon(true);
        t.start();
        return server;
    }

    /** Праща data през препращача и чете обратно; после затваря изпращането и чака края на потока. */
    static boolean roundTrip(String host, int port, byte[] data) throws Exception {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 3000);
            s.setSoTimeout(15000);
            final OutputStream out = s.getOutputStream();
            Thread writer = new Thread(() -> {
                try {
                    for (int off = 0; off < data.length; off += 7001) out.write(data, off, Math.min(7001, data.length - off));
                    s.shutdownOutput();
                } catch (IOException ignored) {
                }
            });
            writer.start();
            ByteArrayOutputStream back = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            InputStream in = s.getInputStream();
            int n;
            while ((n = in.read(buf)) >= 0) back.write(buf, 0, n);   // край на потока = полузатварянето е минало и в двете посоки
            writer.join();
            return Arrays.equals(data, back.toByteArray());
        }
    }

    static String[] httpGet(String host, int port, String path) throws IOException {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 3000);
            s.setSoTimeout(8000);
            s.getOutputStream().write(("GET " + path + " HTTP/1.1\r\nHost: localhost:" + port + "\r\nConnection: close\r\n\r\n")
                    .getBytes(StandardCharsets.US_ASCII));
            ByteArrayOutputStream all = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            InputStream in = s.getInputStream();
            int n;
            while ((n = in.read(buf)) >= 0) all.write(buf, 0, n);
            String text = new String(all.toByteArray(), StandardCharsets.UTF_8);
            int split = text.indexOf("\r\n\r\n");
            String head = split < 0 ? text : text.substring(0, split);
            String body = split < 0 ? "" : text.substring(split + 4);
            return new String[] {head.split("\r\n")[0], head, body};
        }
    }

    public static void main(String[] args) throws Exception {
        String game = args.length > 0 ? args[0] : "127.0.0.1:47801";

        System.out.println("1. Откриване: разбор на съобщенията");
        InetAddress from = InetAddress.getByName("192.168.1.45");
        Discovery.Found f = Discovery.parse("{\"app\":\"arena-play\",\"http\":47801,\"https\":47843}", from);
        check("валидно съобщение", f != null && f.host.equals("192.168.1.45") && f.http == 47801 && f.https == 47843, String.valueOf(f));
        check("старият сигнал (vrvarna-lobby) се пренебрегва", Discovery.parse("{\"app\":\"vrvarna-lobby\",\"port\":47801}", from) == null, null);
        check("боклук се пренебрегва", Discovery.parse("hello", from) == null && Discovery.parse("", from) == null, null);
        Discovery.Found g = Discovery.parse("{ \"app\" : \"arena-play\" }", from);
        check("без портове: подразбиране 47801/47843", g != null && g.http == 47801 && g.https == 47843, null);

        System.out.println("2. Препращач: байтове в двете посоки (срещу ехо сървър)");
        ServerSocket echo = echoServer();
        final int echoPort = echo.getLocalPort();
        int fwdPort = freePort();
        final InetSocketAddress[] target = {new InetSocketAddress("127.0.0.1", echoPort)};
        Forwarder fwd = new Forwarder(fwdPort, () -> target[0], EVENTS);
        fwd.start();
        Random rnd = new Random(7);
        byte[] big = new byte[1024 * 1024];
        rnd.nextBytes(big);
        check("1 MB отива и се връща непроменен през 127.0.0.1", roundTrip("127.0.0.1", fwdPort, big), null);
        boolean v6;
        try {
            v6 = roundTrip("::1", fwdPort, Arrays.copyOf(big, 100_000));
        } catch (IOException e) {
            v6 = false;
        }
        check("същото през ::1 (localhost по IPv6)", v6, v6 ? null : "не е задължително: браузърът минава на 127.0.0.1");
        if (!v6) failed--;   // само за сведение

        final AtomicInteger good = new AtomicInteger();
        List<Thread> many = new ArrayList<>();
        for (int i = 0; i < 24; i++) {
            final byte[] part = new byte[200_000];
            new Random(i).nextBytes(part);
            final int p = fwdPort;
            Thread t = new Thread(() -> {
                try {
                    if (roundTrip("127.0.0.1", p, part)) good.incrementAndGet();
                } catch (Exception ignored) {
                }
            });
            many.add(t);
            t.start();
        }
        for (Thread t : many) t.join();
        check("24 едновременни връзки по 200 KB", good.get() == 24, good.get() + "/24");
        Thread.sleep(300);
        check("след края няма висящи връзки", fwd.activeConnections() == 0, "отворени: " + fwd.activeConnections());

        System.out.println("3. Препращач: компютърът не отговаря");
        target[0] = new InetSocketAddress("127.0.0.1", freePort());   // нищо не слуша там
        String[] down = httpGet("127.0.0.1", fwdPort, "/play/?id=Q2-test");
        check("връща 502 със страница на български, която опитва пак сама",
                down[0].contains(" 502 ") && down[2].contains("Компютърът на залата не отговаря") && down[2].contains("http-equiv=\"refresh\""),
                down[0]);
        target[0] = null;
        String[] none = httpGet("127.0.0.1", fwdPort, "/");
        check("без адрес също връща 502, не увисва", none[0].contains(" 502 "), none[0]);

        if (!game.equals("-")) {
            System.out.println("4. Препращач: истинската игра на " + game + " (само GET /play/)");
            String host = game.substring(0, game.lastIndexOf(':'));
            int port = Integer.parseInt(game.substring(game.lastIndexOf(':') + 1));
            check("играта отговаря направо (Discovery.probe)", Discovery.probe(host, port, 2500), null);
            target[0] = new InetSocketAddress(host, port);
            String[] direct = httpGet(host, port, "/play/");
            String[] via = httpGet("127.0.0.1", fwdPort, "/play/");
            check("през препращача: 200", via[0].contains(" 200"), via[0]);
            check("страницата е същата като направо", via[2].equals(direct[2]) && via[2].length() > 200, via[2].length() + " знака");
            check("Discovery.probe през препращача", Discovery.probe("127.0.0.1", fwdPort, 2500), null);
            boolean logged;
            synchronized (log) { logged = log.stream().anyMatch(l -> l.contains("GET /play/ HTTP/1.1")); }
            check("в дневника има ред за препратената заявка", logged, null);
        }

        System.out.println("5. Спиране");
        fwd.stop();
        boolean refused;
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", fwdPort), 1000);
            refused = false;
        } catch (IOException e) {
            refused = true;
        }
        check("след stop() портът е свободен", refused, null);
        echo.close();

        System.out.println("6. Откриване: истинският сигнал по UDP " + Discovery.BEACON_PORT + " (до 5 секунди)");
        long t0 = System.currentTimeMillis();
        Discovery.Found live = null;
        try {
            live = Discovery.find(5000);
        } catch (IOException e) {
            System.out.println("  не мога да слушам: " + e);
        }
        check("чут е сигнал от сървъра на играта", live != null,
                live == null ? "няма сигнал: сървърът не е пуснат с новия код, или пусни node test\\beacon-test.mjs" : live + " за " + (System.currentTimeMillis() - t0) + " ms");

        if (!game.equals("-")) {
            int port = Integer.parseInt(game.substring(game.lastIndexOf(':') + 1));
            System.out.println("7. Откриване: резервното обхождане на мрежата (порт " + port + ")");
            t0 = System.currentTimeMillis();
            Discovery.Found scanned = Discovery.scan(port, 350, true);
            check("обхождането намира компютъра с играта", scanned != null,
                    scanned == null ? "нищо за " + (System.currentTimeMillis() - t0) + " ms" : scanned + " за " + (System.currentTimeMillis() - t0) + " ms");
            t0 = System.currentTimeMillis();
            Discovery.Found nobody = Discovery.scan(freePort(), 350, true);
            check("на порт, на който никой не слуша, приключва бързо с „няма\"", nobody == null && System.currentTimeMillis() - t0 < 8500,
                    (System.currentTimeMillis() - t0) + " ms");
        }

        System.out.println();
        System.out.println(failed == 0 ? "ВСИЧКО МИНА" : "НЕУСПЕШНИ ПРОВЕРКИ: " + failed);
        System.exit(failed == 0 ? 0 : 1);
    }
}
