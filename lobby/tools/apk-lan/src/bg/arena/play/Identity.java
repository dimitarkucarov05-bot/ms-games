package bg.arena.play;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

/**
 * Who this headset is. The MS Games installer (lobby-stage/keeper.js) writes a fixed identity over USB:
 *
 *   /sdcard/msgames/id.json   {"id":"Q-1WMHH...","number":3,"color":"#e8b33d","name":"Headset 3"}
 *
 * Optional fields: "vr" ("xr" = immersive tab, the default; "tab" = plain browser tab), "origin" (open the game on
 * another origin, for example "https://lo.arena.example:47843"), "autostart" (false = do not open at power-on).
 *
 * Reading the file needs "All files access" on Android 11+ (granted by the installer with
 * `appops set bg.arena.play MANAGE_EXTERNAL_STORAGE allow`). If the file cannot be read, the copy the installer also
 * passed as intent extras (saved in the app's preferences) is used; with neither, the old id Q2-<ANDROID_ID> and the
 * device name, so a headset that was never set up keeps working as before.
 */
final class Identity {
    static final String DIR = "msgames";
    static final String FILE = "id.json";

    final String id;
    final int number;          // 0 = none
    final String color;        // "#rrggbb" or null
    final String name;
    final String vr;           // "xr" or "tab"
    final String origin;       // null = http://localhost:<listen>
    final boolean autostart;
    final String source;       // "file", "extras" or "device": for the log

    private Identity(String id, int number, String color, String name, String vr, String origin, boolean autostart, String source) {
        this.id = id;
        this.number = number;
        this.color = color;
        this.name = name;
        this.vr = vr;
        this.origin = origin;
        this.autostart = autostart;
        this.source = source;
    }

    static File file() {
        return new File(new File(Environment.getExternalStorageDirectory(), DIR), FILE);
    }

    static Identity load(Context c) {
        JSONObject o = readFile();
        String source = "file";
        if (o == null) {
            String saved = prefs(c).getString("identity", null);
            if (saved != null) {
                try { o = new JSONObject(saved); source = "extras"; } catch (JSONException ignored) { }
            }
        }
        if (o == null) { o = new JSONObject(); source = "device"; }
        String id = clean(o.optString("id", null));
        if (id == null) id = legacyId(c);
        String name = clean(o.optString("name", null));
        if (name == null) name = clean(prefs(c).getString("name", null));     // the old "--es name" of v1-v10
        if (name == null) name = deviceName(c, id);
        String color = clean(o.optString("color", null));
        if (color != null && !color.matches("^#[0-9a-fA-F]{6}$")) color = null;
        String vr = "tab".equalsIgnoreCase(o.optString("vr", "")) ? "tab" : "xr";
        String vrPref = prefs(c).getString("vr", null);                          // "--es vr tab" for a test wins
        if (vrPref != null) vr = "tab".equalsIgnoreCase(vrPref) ? "tab" : "xr";
        String origin = clean(o.optString("origin", null));
        if (origin == null) origin = clean(prefs(c).getString("origin", null));
        if (origin != null && !origin.matches("^https?://[A-Za-z0-9.-]+(:\\d{1,5})?$")) origin = null;
        return new Identity(id, Math.max(0, o.optInt("number", 0)), color, name, vr, origin,
                o.optBoolean("autostart", true), source);
    }

    /** The installer's extras (am start / am broadcast): --es id, --ei number, --es color, --es name, --es vr, --es origin. */
    static void saveFromIntent(Context c, Intent i) {
        if (i == null) return;
        SharedPreferences.Editor e = prefs(c).edit();
        if (i.hasExtra("id") || i.hasExtra("number") || i.hasExtra("color")) {
            JSONObject o = new JSONObject();
            try {
                if (i.hasExtra("id")) o.put("id", i.getStringExtra("id"));
                if (i.hasExtra("number")) o.put("number", i.getIntExtra("number", 0));
                if (i.hasExtra("color")) o.put("color", i.getStringExtra("color"));
                if (i.hasExtra("name")) o.put("name", i.getStringExtra("name"));
                e.putString("identity", o.toString());
            } catch (JSONException ignored) { }
        }
        String name = i.getStringExtra("name");
        if (name != null) e.putString("name", name.trim());
        if (i.hasExtra("vr")) e.putString("vr", i.getStringExtra("vr"));
        if (i.hasExtra("origin")) e.putString("origin", i.getStringExtra("origin"));
        e.apply();
    }

    /** Adds who we are to the game page's address: ?id=&name=&n=&color= (the page and the console key on id). */
    Uri.Builder addTo(Uri.Builder b) {
        b.appendQueryParameter("id", id).appendQueryParameter("name", name);
        if (number > 0) b.appendQueryParameter("n", String.valueOf(number));
        if (color != null) b.appendQueryParameter("color", color);
        return b;
    }

    @Override public String toString() {
        return id + " \"" + name + "\" n=" + number + " color=" + color + " vr=" + vr + " (" + source + ")";
    }

    // ------------------------------------------------------------------

    private static JSONObject readFile() {
        File f = file();
        InputStream in = null;
        try {
            if (!f.isFile() || f.length() > 16 * 1024) return null;
            in = new FileInputStream(f);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            String text = new String(out.toByteArray(), StandardCharsets.UTF_8).trim();
            if (text.startsWith("﻿")) text = text.substring(1);
            return new JSONObject(text);
        } catch (IOException | JSONException | SecurityException e) {
            Log.w(ForwardService.TAG, "identity file " + f + " not readable: " + e);
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (IOException ignored) { } }
        }
    }

    private static String clean(String s) {
        if (s == null) return null;
        s = s.trim();
        return s.isEmpty() || s.equals("null") ? null : s;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(ForwardService.PREFS, Context.MODE_PRIVATE);
    }

    /** Q2-<ANDROID_ID>: the id of every app version before 2.1; stays while the app is signed with the same key. */
    private static String legacyId(Context c) {
        String id = null;
        try {
            id = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (RuntimeException ignored) {
        }
        if (id == null || id.isEmpty()) {
            SharedPreferences p = prefs(c);
            id = p.getString("uuid", null);
            if (id == null) {
                id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
                p.edit().putString("uuid", id).apply();
            }
        }
        return "Q2-" + id;
    }

    /** The device name; the factory "Quest 2" gets the last three characters of the id so headsets differ. */
    private static String deviceName(Context c, String id) {
        String tail = id.substring(Math.max(0, id.length() - 3)).toUpperCase(Locale.ROOT);
        String dev = null;
        try {
            dev = Settings.Global.getString(c.getContentResolver(), "device_name");
        } catch (RuntimeException ignored) {
        }
        if (dev != null) dev = dev.trim();
        if (dev == null || dev.isEmpty()) dev = Build.MODEL;
        boolean factory = dev.equalsIgnoreCase(Build.MODEL) || dev.toLowerCase(Locale.ROOT).matches("^(meta |oculus )?quest.*");
        return factory ? dev + " " + tail : dev;
    }
}
