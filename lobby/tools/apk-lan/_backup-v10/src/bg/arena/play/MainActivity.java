package bg.arena.play;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Browser;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.IOException;
import java.net.DatagramSocket;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Началният екран на „Арена": намира компютъра на залата, пуска препращача и отваря играта
 * в браузъра на каската на http://localhost:47801/play/.
 *
 * Пускане от компютър за проби (всички добавки са по желание):
 *   adb shell am start -n bg.arena.play/.MainActivity
 *       --es pc 192.168.1.45     адресът на ръка (без търсене)
 *       --es name V3             име на каската (запомня се)
 *       --ei listen 47802        друг местен порт (ако 47801 е зает от adb reverse)
 *       --ez nobrowser true      без да се отваря браузърът
 *       --ez wakelock true       услугата държи каската будна (запомня се; по подразбиране не)
 *       --ez quit true           спира услугата и излиза
 */
public class MainActivity extends Activity {
    private static final String TAG = ForwardService.TAG;
    private static final String BROWSER = "com.oculus.browser";

    private static final int TILE = 0xFF131411;
    private static final int INK = 0xFFE9ECE2;
    private static final int DOT = 0xFFC8F03C;

    private static final int SEARCH_MS = 4000;
    private static final int RETRY_AFTER_MS = 6000;
    private static final int COUNTDOWN_S = 5;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView status;
    private TextView hint;
    private View dot;
    private ObjectAnimator pulse;
    private Button primary;
    private Button secondary;
    private LinearLayout buttons;

    /** Расте при всяко ново начало; старите нишки и таймери се отказват, щом видят, че са изостанали. */
    private volatile int generation;
    private boolean started;
    private boolean launched;

    private String manualPc;
    private int listenPort = Discovery.DEFAULT_HTTP;
    private boolean noBrowser;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setContentView(buildScreen());
        readIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (readIntent(intent)) return;     // казано е „спри"
        if (started && !isFinishing()) begin(false);
    }

    @Override protected void onStart() {
        super.onStart();
        started = true;
        if (!launched && !isFinishing()) begin(false);
    }

    @Override protected void onStop() {
        super.onStop();
        started = false;
        generation++;                       // спира търсенето и броенето, докато не ни гледат
        ui.removeCallbacksAndMessages(null);
        if (launched && !isFinishing()) finishAndRemoveTask();
    }

    /** Чете добавките от пускането. Връща true, ако е поискано спиране. */
    private boolean readIntent(Intent intent) {
        if (intent == null) return false;
        SharedPreferences.Editor e = prefs().edit();
        String name = intent.getStringExtra("name");
        if (name != null) e.putString("name", name.trim());
        if (intent.hasExtra("wakelock")) e.putBoolean("wakelock", intent.getBooleanExtra("wakelock", false));
        e.apply();
        manualPc = intent.getStringExtra("pc");
        listenPort = intent.getIntExtra("listen", Discovery.DEFAULT_HTTP);
        noBrowser = intent.getBooleanExtra("nobrowser", false);
        if (intent.getBooleanExtra("quit", false)) {
            intent.removeExtra("quit");
            quit();
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ ход

    private void begin(boolean quiet) {
        if (isFinishing()) return;
        final int gen = ++generation;
        ui.removeCallbacksAndMessages(null);
        launched = false;
        if (!quiet) showWorking("Looking for the arena computer…");
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                flow(gen);
            }
        }, "arena-flow");
        t.setDaemon(true);
        t.start();
    }

    private void flow(final int gen) {
        // Вече работи и компютърът отговаря: питаме дали да отворим играта, или да спрем.
        if (manualPc == null && ForwardService.state == ForwardService.LISTENING
                && ForwardService.listenPort == listenPort
                && Discovery.probe(ForwardService.host, ForwardService.port, 1500)) {
            post(gen, new Runnable() {
                @Override public void run() {
                    showRunning(gen);
                }
            });
            return;
        }

        // Каската е на кабел и компютърът вече е прехвърлил порта (adb reverse): играта отговаря на localhost
        // и без нас. Портът е зает, препращач не може и не трябва да се пуска: само отваряме играта.
        if (manualPc == null && ForwardService.state != ForwardService.LISTENING
                && Discovery.probe("127.0.0.1", listenPort, 800)) {
            Log.i(TAG, "играта вече отговаря на localhost:" + listenPort + " (кабел): отварям без препращач");
            post(gen, new Runnable() {
                @Override public void run() {
                    openGame();
                }
            });
            return;
        }

        final Discovery.Found pc = locate(gen);
        if (gen != generation) return;
        if (pc == null) {
            post(gen, new Runnable() {
                @Override public void run() {
                    showNotFound(gen);
                }
            });
            return;
        }
        Log.i(TAG, "компютърът на залата: " + pc);
        post(gen, new Runnable() {
            @Override public void run() {
                showWorking("Connecting…");
            }
        });
        if (!Discovery.probe(pc.host, pc.http, 2500)) {
            Log.w(TAG, "сигнал има, но " + pc + " не отговаря по TCP");
            post(gen, new Runnable() {
                @Override public void run() {
                    showProblem(gen, "Found the computer, but it does not let the headset in.",
                            "Address " + pc.host + ". Check that MS Games is running on the computer and that Windows Firewall allows it. "
                            + "Trying again by itself.", true);
                }
            });
            return;
        }

        // Пускаме (или пренасочваме) препращача и чакаме да започне да слуша.
        if (gen != generation) return;      // екранът вече не е отпред: услуга се пуска само от преден план
        if (ForwardService.state != ForwardService.LISTENING) ForwardService.state = ForwardService.STARTING;
        Intent svc = new Intent(this, ForwardService.class)
                .putExtra(ForwardService.EXTRA_HOST, pc.host)
                .putExtra(ForwardService.EXTRA_PORT, pc.http)
                .putExtra(ForwardService.EXTRA_LISTEN, listenPort);
        try {
            startService(svc);              // от преден план; услугата сама става „на преден план"
        } catch (RuntimeException e) {
            Log.e(TAG, "startService: " + e);
        }
        int st = ForwardService.STARTING;
        for (int i = 0; i < 80 && gen == generation; i++) {
            st = ForwardService.state;
            if (st == ForwardService.LISTENING && pc.host.equals(ForwardService.host)
                    && ForwardService.listenPort == listenPort) break;
            if (st == ForwardService.PORT_BUSY || st == ForwardService.FAILED) break;
            try { Thread.sleep(50); } catch (InterruptedException e) { return; }
        }
        if (gen != generation) return;

        if (st == ForwardService.PORT_BUSY) {
            // Най-често: каската е на кабел и adb reverse вече държи порта към същия компютър. Тогава играта се отваря и така.
            if (Discovery.probe("127.0.0.1", listenPort, 1500)) {
                Log.i(TAG, "порт " + listenPort + " е зает, но играта отговаря на него (кабел): продължавам");
            } else {
                post(gen, new Runnable() {
                    @Override public void run() {
                        showProblem(gen, "Port " + listenPort + " on the headset is busy.",
                                "Close the other app that uses it, or restart the headset.", false);
                    }
                });
                return;
            }
        } else if (st != ForwardService.LISTENING) {
            final String why = ForwardService.error;
            post(gen, new Runnable() {
                @Override public void run() {
                    showProblem(gen, "Could not connect.", why == null ? "Try again." : why, false);
                }
            });
            return;
        } else if (!Discovery.probe("127.0.0.1", listenPort, 2500)) {
            Log.w(TAG, "препращачът слуша, но играта не отговаря през него");
        }

        prefs().edit().putString("host", pc.host).putInt("port", pc.http).apply();
        post(gen, new Runnable() {
            @Override public void run() {
                openGame();
            }
        });
    }

    /** Сигнал по UDP до 4 секунди; успоредно пробва последния адрес, който е работил. */
    private Discovery.Found locate(int gen) {
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

        SharedPreferences prefs = prefs();
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
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
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
            while (gen == generation) {
                long passed = System.currentTimeMillis() - start;
                if (passed >= SEARCH_MS) break;
                Discovery.Found f = Discovery.receive(s, (int) Math.min(250, SEARCH_MS - passed));
                if (f != null) return f;
                // Старият адрес отговаря, а сигнал още няма: не караме играча да чака.
                if (savedOk.get() && passed >= 700) break;
            }
        } catch (IOException e) {
            Log.w(TAG, "търсене по UDP: " + e);
        } finally {
            if (s != null) s.close();
            if (lock != null) {
                try { lock.release(); } catch (RuntimeException ignored) {}
            }
        }

        if (probe != null) {
            try { probe.join(2600); } catch (InterruptedException ignored) {}
            if (savedOk.get()) {
                Log.i(TAG, "няма сигнал, ползвам запомнения адрес " + savedHost);
                return new Discovery.Found(savedHost, savedPort, Discovery.DEFAULT_HTTPS);
            }
        }

        // Последен опит: сигналът може да не стига до каската (рутерът го спира). Обхождаме мрежата.
        if (gen != generation) return null;
        Discovery.Found scanned = Discovery.scan(Discovery.DEFAULT_HTTP, 350, false);
        if (scanned != null) Log.i(TAG, "няма сигнал, но намерих компютъра с обхождане на мрежата: " + scanned);
        return scanned;
    }

    private void openGame() {
        String url = "http://localhost:" + listenPort + "/play/?id=" + Uri.encode(stableId())
                + "&name=" + Uri.encode(deviceName());
        Log.i(TAG, "отварям " + url);
        if (noBrowser) {
            showDone("Done. The browser is not opened (test).");
            return;
        }
        showWorking("Opening the game…");
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url))
                .setPackage(BROWSER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(Browser.EXTRA_APPLICATION_ID, getPackageName());   // същият раздел при следващо пускане, ако браузърът го уважава
        try {
            startActivity(view);
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w(TAG, "няма " + BROWSER + ", пробвам с браузъра по подразбиране");
            try {
                startActivity(view.setPackage(null));
            } catch (ActivityNotFoundException | SecurityException e2) {
                showProblem(generation, "Cannot find the headset browser.", url, false);
                return;
            }
        }
        launched = true;
        final int gen = generation;
        ui.postDelayed(new Runnable() {
            @Override public void run() {
                if (gen == generation && !isFinishing()) finishAndRemoveTask();
            }
        }, 1500);
    }

    private void quit() {
        generation++;
        ui.removeCallbacksAndMessages(null);
        stopService(new Intent(this, ForwardService.class));
        Log.i(TAG, "спряно от началния екран");
        showDone("MS Games is stopped.");
        launched = true;                    // да не започне търсене наново
        ui.postDelayed(new Runnable() {
            @Override public void run() {
                if (!isFinishing()) finishAndRemoveTask();
            }
        }, 1200);
    }

    // ------------------------------------------------------------------ идентичност

    private SharedPreferences prefs() {
        return getSharedPreferences(ForwardService.PREFS, MODE_PRIVATE);
    }

    /** Постоянен номер на каската: Q2-<ANDROID_ID>. Остава същият, докато приложението е подписано със същия ключ. */
    private String stableId() {
        String id = null;
        try {
            id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (RuntimeException ignored) {
        }
        if (id == null || id.isEmpty()) {
            SharedPreferences p = prefs();
            id = p.getString("uuid", null);
            if (id == null) {
                id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
                p.edit().putString("uuid", id).apply();
            }
        }
        return "Q2-" + id;
    }

    /** Име за пулта: зададеното с --es name, иначе името на устройството; ако то е общо („Quest 2"), с три знака от номера. */
    private String deviceName() {
        String given = prefs().getString("name", null);
        if (given != null && !given.isEmpty()) return given;
        String id = stableId();
        String tail = id.substring(Math.max(3, id.length() - 3)).toUpperCase(Locale.ROOT);
        String dev = null;
        try {
            dev = Settings.Global.getString(getContentResolver(), "device_name");
        } catch (RuntimeException ignored) {
        }
        if (dev != null) dev = dev.trim();
        if (dev == null || dev.isEmpty()) dev = Build.MODEL;
        // Фабричното име е еднакво на всички каски („Quest 2"): добавяме края на номера, за да се различават в пулта.
        boolean factory = dev.equalsIgnoreCase(Build.MODEL) || dev.toLowerCase(Locale.ROOT).matches("^(meta |oculus )?quest.*");
        return factory ? dev + " " + tail : dev;
    }

    // ------------------------------------------------------------------ екран

    private void post(final int gen, final Runnable r) {
        ui.post(new Runnable() {
            @Override public void run() {
                if (gen == generation && !isFinishing()) r.run();
            }
        });
    }

    private void showWorking(String line) {
        status.setText(line);
        hint.setVisibility(View.GONE);
        buttons.setVisibility(View.GONE);
        dot.setVisibility(View.VISIBLE);
        if (!pulse.isStarted()) pulse.start();
    }

    private void showDone(String line) {
        status.setText(line);
        hint.setVisibility(View.GONE);
        buttons.setVisibility(View.GONE);
        stopPulse(true);
    }

    private void stopPulse(boolean keepDot) {
        pulse.cancel();
        dot.setAlpha(1f);
        dot.setVisibility(keepDot ? View.VISIBLE : View.GONE);
    }

    private void showNotFound(int gen) {
        showProblem(gen, "The arena computer was not found.",
                "Check that MS Games is running on the computer and that the headset is on the same Wi-Fi. Trying again by itself.", true);
    }

    private void showProblem(final int gen, String line, String more, boolean autoRetry) {
        status.setText(line);
        hint.setText(more);
        hint.setVisibility(View.VISIBLE);
        stopPulse(false);
        primary.setText("Try again");
        primary.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                begin(false);
            }
        });
        secondary.setVisibility(View.GONE);
        buttons.setVisibility(View.VISIBLE);
        if (autoRetry) {
            ui.postDelayed(new Runnable() {
                @Override public void run() {
                    if (gen == generation && started) begin(true);
                }
            }, RETRY_AFTER_MS);
        }
    }

    /** Приложението е отворено втори път, докато работи: към играта (сам след 5 секунди) или спиране. */
    private void showRunning(final int gen) {
        status.setText("MS Games is running.");
        hint.setText("Connected to the arena computer (" + ForwardService.host + ").");
        hint.setVisibility(View.VISIBLE);
        stopPulse(true);
        secondary.setText("Stop");
        secondary.setVisibility(View.VISIBLE);
        secondary.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                quit();
            }
        });
        primary.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                generation++;
                ui.removeCallbacksAndMessages(null);
                openGame();
            }
        });
        buttons.setVisibility(View.VISIBLE);
        countdown(gen, COUNTDOWN_S);
    }

    private void countdown(final int gen, final int left) {
        if (gen != generation) return;
        if (left <= 0) {
            openGame();
            return;
        }
        primary.setText("To the game (" + left + ")");
        ui.postDelayed(new Runnable() {
            @Override public void run() {
                countdown(gen, left - 1);
            }
        }, 1000);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private View buildScreen() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(TILE);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(48), dp(32), dp(48), dp(32));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.logo);
        col.addView(logo, new LinearLayout.LayoutParams(dp(104), dp(104)));

        TextView title = new TextView(this);
        title.setText("MS Games");
        title.setTextColor(INK);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 52);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setLetterSpacing(0.02f);
        title.setIncludeFontPadding(false);
        LinearLayout.LayoutParams titleLp = wrap();
        titleLp.topMargin = dp(14);
        col.addView(title, titleLp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        dot = new View(this);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(DOT);
        dot.setBackground(circle);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(11), dp(11));
        dotLp.rightMargin = dp(12);
        row.addView(dot, dotLp);
        status = new TextView(this);
        status.setTextColor(INK);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 21);
        row.addView(status, wrap());
        LinearLayout.LayoutParams rowLp = wrap();
        rowLp.topMargin = dp(30);
        col.addView(row, rowLp);

        hint = new TextView(this);
        hint.setTextColor(INK);
        hint.setAlpha(0.6f);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        hint.setGravity(Gravity.CENTER_HORIZONTAL);
        hint.setMaxWidth(dp(560));
        hint.setLineSpacing(dp(3), 1f);
        hint.setVisibility(View.GONE);
        LinearLayout.LayoutParams hintLp = wrap();
        hintLp.topMargin = dp(10);
        col.addView(hint, hintLp);

        buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        primary = button(true);
        secondary = button(false);
        buttons.addView(primary, wrap());
        LinearLayout.LayoutParams secLp = wrap();
        secLp.leftMargin = dp(16);
        buttons.addView(secondary, secLp);
        buttons.setVisibility(View.GONE);
        LinearLayout.LayoutParams btnLp = wrap();
        btnLp.topMargin = dp(30);
        col.addView(buttons, btnLp);

        pulse = ObjectAnimator.ofFloat(dot, "alpha", 1f, 0.2f);
        pulse.setDuration(700);
        pulse.setRepeatMode(ValueAnimator.REVERSE);
        pulse.setRepeatCount(ValueAnimator.INFINITE);

        root.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        return root;
    }

    private static LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private Button button(boolean main) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setStateListAnimator(null);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setTextColor(main ? TILE : INK);
        b.setMinHeight(dp(58));
        b.setMinimumHeight(dp(58));
        b.setMinWidth(dp(190));
        b.setPadding(dp(30), 0, dp(30), 0);
        StateListDrawable bg = new StateListDrawable();
        Drawable lit = main ? pill(0xFFDDFB6A, 0) : pill(0x24E9ECE2, 0xFFE9ECE2);
        bg.addState(new int[] {android.R.attr.state_pressed}, lit);
        bg.addState(new int[] {android.R.attr.state_hovered}, lit);
        bg.addState(new int[] {android.R.attr.state_focused}, lit);
        bg.addState(new int[] {}, main ? pill(DOT, 0) : pill(0x00000000, 0x66E9ECE2));
        b.setBackground(bg);
        return b;
    }

    private Drawable pill(int fill, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(12));
        d.setColor(fill);
        if (stroke != 0) d.setStroke(dp(1.5f), stroke);
        return d;
    }

    @Override protected void onDestroy() {
        generation++;
        ui.removeCallbacksAndMessages(null);
        if (pulse != null) pulse.cancel();
        super.onDestroy();
    }
}
