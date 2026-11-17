// MS Games: програмата за Windows, която пуска залата.
//
// Какво прави: показва заставка, пуска сървъра (node server.js), чака го да отговори, отваря лаунчъра в собствен
// прозорец (Edge в режим „приложение", без адресна лента) и остава до часовника. Затварянето на прозореца НЕ спира
// сървъра (каските може да са в игра); сървърът спира от „Изход" в менюто до часовника.
//
// Без външни библиотеки: компилира се с вградения в Windows компилатор (виж build.ps1), затова е C# 5.
//
// Къде търси нещата:
//   приложението (server.js):  --app <папка>  |  <папката на exe>\app  |  нагоре от папката на exe (при разработка)
//   Node:                      <папката на exe>\runtime\node.exe  |  node.exe от PATH
//   дневник:                   %LOCALAPPDATA%\MS Games\logs\server.log

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("MS Games")]
[assembly: AssemblyProduct("MS Games")]
[assembly: AssemblyDescription("Launcher for VR arena games")]
[assembly: AssemblyCompany("MS Games")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

namespace MSGames
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        // The product name lives here and nowhere else in this file (the owner may rename it later).
        // Setup.cs has the same constant; the page titles are in the app's HTML.
        public const string AppName = "MS Games";
        public const int DefaultPort = 47801, DefaultTlsPort = 47843, BeaconPort = 47810;
        public static int TlsPort = 0;                  // --tls-port <n>; 0 = the server's default (or Port + 42 on a test port)
        public static bool FirewallStatus;              // --firewall-status: log what the firewall check finds (tests)
        public static bool NoFirewall;                  // --no-firewall: never ask Windows about the firewall (tests)
        public static int Port = DefaultPort;                 // --port <n> го сменя (за проби до работещ сървър)
        public static bool NoWindow;                    // --no-window: без прозорец (за проби)
        public static string Url { get { return "http://localhost:" + Port + "/"; } }
        // --data <folder> moves everything the program writes (arena data, log, window profile) to another folder (tests)
        public static string LocalDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);

        [STAThread]
        static int Main(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                int n;
                if (args[i] == "--port" && i + 1 < args.Length && int.TryParse(args[i + 1], out n)) Port = n;
                if (args[i] == "--tls-port" && i + 1 < args.Length && int.TryParse(args[i + 1], out n)) TlsPort = n;
                if (args[i] == "--data" && i + 1 < args.Length) LocalDir = Path.GetFullPath(args[i + 1]);
                if (args[i] == "--no-window") NoWindow = true;
                if (args[i] == "--no-firewall") NoFirewall = true;
                if (args[i] == "--firewall-status") FirewallStatus = true;
            }
            for (int i = 0; i + 1 < args.Length; i++)
                if (args[i] == "--shot")      // draws the splash into a PNG and exits (for checking the look without a screen grab)
                {
                    SetProcessDPIAware(); Application.EnableVisualStyles();
                    Splash.SaveShot(args[i + 1]);
                    return 0;
                }
            bool first;
            using (Mutex one = new Mutex(true, "MSGames.Launcher.SingleInstance." + Port, out first))
            {
                SetProcessDPIAware();      // иначе заставката е размазана при увеличен мащаб на екрана
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                if (!first)
                {
                    // вече работи: само отваря прозореца отново
                    Window.Open();
                    return 0;
                }
                string appDir = Paths.FindApp(args);
                Application.Run(new Shell(appDir));
                GC.KeepAlive(one);
                return 0;
            }
        }
    }

    // ───────── къде са нещата ─────────
    static class Paths
    {
        public static string ExeDir { get { return Path.GetDirectoryName(Application.ExecutablePath); } }

        static bool IsApp(string dir)
        {
            return dir != null && File.Exists(Path.Combine(dir, "server.js")) && Directory.Exists(Path.Combine(dir, "public"));
        }

        public static string FindApp(string[] args)
        {
            for (int i = 0; i + 1 < args.Length; i++)
                if (args[i] == "--app" && IsApp(args[i + 1])) return Path.GetFullPath(args[i + 1]);
            string packed = Path.Combine(ExeDir, "app");
            if (IsApp(packed)) return packed;
            string d = ExeDir;
            for (int i = 0; i < 5 && d != null; i++)
            {
                if (IsApp(d)) return d;
                DirectoryInfo up = Directory.GetParent(d);
                d = up == null ? null : up.FullName;
            }
            return null;
        }

        /// <summary>Пакетирано ли е (приложението е до exe-то): тогава данните отиват в профила на потребителя.</summary>
        public static bool Packed(string appDir)
        {
            return appDir != null && string.Equals(Path.GetFullPath(appDir).TrimEnd('\\'), Path.Combine(ExeDir, "app"), StringComparison.OrdinalIgnoreCase);
        }

        public static string FindNode()
        {
            string own = Path.Combine(ExeDir, "runtime", "node.exe");
            if (File.Exists(own)) return own;
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string p in path.Split(';'))
            {
                if (p.Trim().Length == 0) continue;
                try
                {
                    string f = Path.Combine(p.Trim(), "node.exe");
                    if (File.Exists(f)) return f;
                }
                catch (ArgumentException) { }
            }
            string def = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            return File.Exists(def) ? def : null;
        }

        static bool HasOpenSsl()
        {
            string pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
            if (File.Exists(Path.Combine(pf, "Git", "mingw64", "bin", "openssl.exe")) || File.Exists(Path.Combine(pf, "Git", "usr", "bin", "openssl.exe"))) return true;
            foreach (string p in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            {
                if (p.Trim().Length == 0) continue;
                try { if (File.Exists(Path.Combine(p.Trim(), "openssl.exe"))) return true; } catch (ArgumentException) { }
            }
            return false;
        }

        /// <summary>HTTPS for the headsets needs a certificate. The server makes its own with OpenSSL; a PC without OpenSSL
        /// gets the ready self-signed one that comes with the package (app/tls-default), copied once into the data folder.</summary>
        public static void DefaultTls(string appDir, string data, Action<string> say)
        {
            try
            {
                string src = Path.Combine(appDir, "tls-default"), dst = Path.Combine(data, "tls");
                if (!File.Exists(Path.Combine(src, "cert.pem")) || !File.Exists(Path.Combine(src, "key.pem"))) return;
                if (File.Exists(Path.Combine(dst, "cert.pem")) && File.Exists(Path.Combine(dst, "key.pem"))) return;
                if (HasOpenSsl()) return;
                Directory.CreateDirectory(dst);
                File.Copy(Path.Combine(src, "key.pem"), Path.Combine(dst, "key.pem"), true);
                File.Copy(Path.Combine(src, "cert.pem"), Path.Combine(dst, "cert.pem"), true);
                if (say != null) say("=== no OpenSSL on this computer: using the certificate that comes with " + Program.AppName);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        public static string FindBrowser()
        {
            string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "";
            string pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] tries = {
                Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string t in tries) if (File.Exists(t)) return t;
            return null;
        }
    }

    // ───────── сървърът ─────────
    sealed class Server
    {
        readonly string appDir;
        Process proc;
        volatile bool stopping;
        readonly object gate = new object();
        readonly List<DateTime> restarts = new List<DateTime>();
        StreamWriter log;

        public bool Ours { get { return proc != null; } }
        public string LogFile { get { return Path.Combine(Program.LocalDir, "logs", "server.log"); } }
        string PidFile { get { return Path.Combine(Program.LocalDir, "server-" + Program.Port + ".pid"); } }
        public event Action<string> Crashed;      // сървърът е паднал и е пуснат пак (или не може да се пусне)

        public Server(string appDir) { this.appDir = appDir; }

        /// <summary>Отговаря ли вече сървър на порта (наш или пуснат отделно при разработка).</summary>
        public static bool IsUp()
        {
            return Get("api/state", 900) != null;
        }

        public static string Get(string path, int timeoutMs)
        {
            try
            {
                HttpWebRequest r = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Program.Port + "/" + path);
                r.Timeout = timeoutMs; r.ReadWriteTimeout = timeoutMs; r.Proxy = null; r.KeepAlive = false;
                using (HttpWebResponse res = (HttpWebResponse)r.GetResponse())
                using (StreamReader sr = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                    return res.StatusCode == HttpStatusCode.OK ? sr.ReadToEnd() : null;
            }
            catch (WebException) { return null; }
            catch (IOException) { return null; }
        }

        public void Start()
        {
            lock (gate)
            {
                stopping = false;
                string node = Paths.FindNode();
                if (node == null) throw new InvalidOperationException("Cannot find Node.js (node.exe). Install Node 20 or newer.");
                Directory.CreateDirectory(Path.GetDirectoryName(LogFile));
                try { if (File.Exists(LogFile) && new FileInfo(LogFile).Length > 2 * 1024 * 1024) File.Delete(LogFile); } catch (IOException) { }
                if (log == null) log = new StreamWriter(new FileStream(LogFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(false)) { AutoFlush = true };
                log.WriteLine();
                log.WriteLine("=== " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " starting the server: " + node + " server.js (" + appDir + ")");

                ProcessStartInfo si = new ProcessStartInfo(node, "server.js");
                si.WorkingDirectory = appDir;
                si.UseShellExecute = false; si.CreateNoWindow = true;
                si.RedirectStandardOutput = true; si.RedirectStandardError = true;
                si.StandardOutputEncoding = Encoding.UTF8; si.StandardErrorEncoding = Encoding.UTF8;
                si.EnvironmentVariables["PORT"] = Program.Port.ToString();
                si.EnvironmentVariables["MSGAMES_LAUNCHER"] = "1";
                int tlsPort = Program.TlsPort > 0 ? Program.TlsPort : Program.Port != Program.DefaultPort ? Program.Port + 42 : 0;
                if (tlsPort > 0) si.EnvironmentVariables["TLS_PORT"] = tlsPort.ToString();      // a test port never takes the arena's HTTPS port
                if (Paths.Packed(appDir))
                {
                    // packed: the data lives in the user's profile, not next to the program
                    string data = Path.Combine(Program.LocalDir, "data");
                    si.EnvironmentVariables["ARENA_DATA"] = data;
                    // the headset tools that come with the package (adb + the headset app); a value already set wins
                    string adb = Path.Combine(appDir, "headset", "adb.exe"), apk = Path.Combine(appDir, "headset", "MSGames-Headset.apk");
                    if (File.Exists(adb) && !si.EnvironmentVariables.ContainsKey("ADB")) si.EnvironmentVariables["ADB"] = adb;
                    if (File.Exists(apk) && !si.EnvironmentVariables.ContainsKey("HEADSET_APK")) si.EnvironmentVariables["HEADSET_APK"] = apk;
                    Paths.DefaultTls(appDir, data, Write);
                }

                Process p = new Process();
                p.StartInfo = si; p.EnableRaisingEvents = true;
                p.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { Write(e.Data); };
                p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { Write(e.Data); };
                p.Exited += OnExit;
                p.Start();
                p.BeginOutputReadLine(); p.BeginErrorReadLine();
                proc = p;
                try { File.WriteAllText(PidFile, p.Id.ToString()); } catch (IOException) { }
            }
        }

        /// <summary>Сървър, останал от предишно пускане на MS Games (програмата е била убита): взимаме го обратно, за да може да се спира и рестартира.</summary>
        public bool Adopt()
        {
            lock (gate)
            {
                if (proc != null) return true;
                try
                {
                    int pid;
                    if (!File.Exists(PidFile) || !int.TryParse(File.ReadAllText(PidFile).Trim(), out pid)) return false;
                    Process p = Process.GetProcessById(pid);
                    if (p.HasExited || !p.ProcessName.Equals("node", StringComparison.OrdinalIgnoreCase)) return false;
                    stopping = false;
                    p.EnableRaisingEvents = true;
                    p.Exited += OnExit;
                    proc = p;
                    return true;
                }
                catch (ArgumentException) { return false; }
                catch (InvalidOperationException) { return false; }
                catch (IOException) { return false; }
                catch (System.ComponentModel.Win32Exception) { return false; }
            }
        }

        public void Note(string line) { Write(line); }

        void Write(string line)
        {
            if (line == null) return;
            lock (gate) { try { if (log != null) log.WriteLine(line); } catch (IOException) { } catch (ObjectDisposedException) { } }
        }

        void OnExit(object sender, EventArgs e)
        {
            if (stopping) return;
            int code = -1;
            try { code = ((Process)sender).ExitCode; } catch (InvalidOperationException) { }
            Write("=== the server stopped by itself (code " + code + ")");
            bool again;
            lock (gate)
            {
                DateTime now = DateTime.Now;
                restarts.RemoveAll(delegate(DateTime t) { return (now - t).TotalSeconds > 60; });
                again = restarts.Count < 4;
                restarts.Add(now);
                proc = null;
            }
            if (!again)
            {
                if (Crashed != null) Crashed("The server crashes right after starting. See the log.");
                return;
            }
            Thread.Sleep(1500);
            if (stopping) return;
            try { Start(); if (Crashed != null) Crashed("The server had crashed and was started again."); }
            catch (Exception ex) { if (Crashed != null) Crashed("The server crashed and could not be started: " + ex.Message); }
        }

        public bool WaitUp(int seconds)
        {
            DateTime until = DateTime.Now.AddSeconds(seconds);
            while (DateTime.Now < until)
            {
                if (IsUp()) return true;
                lock (gate) { if (proc == null && !stopping && restarts.Count >= 4) return false; }
                Thread.Sleep(250);
            }
            return false;
        }

        public void Stop()
        {
            Process p;
            lock (gate) { stopping = true; p = proc; proc = null; }
            if (p == null) return;
            try
            {
                if (!p.HasExited)
                {
                    // цялото дърво: сървърът може да е пуснал помощни процеси
                    ProcessStartInfo k = new ProcessStartInfo("taskkill", "/PID " + p.Id + " /T /F");
                    k.UseShellExecute = false; k.CreateNoWindow = true;
                    using (Process t = Process.Start(k)) t.WaitForExit(4000);
                    if (!p.HasExited) p.Kill();
                }
            }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }
            try { File.Delete(PidFile); } catch (IOException) { }
            Write("=== the server was stopped by " + Program.AppName);
        }

        public string Tail(int lines)
        {
            try
            {
                using (FileStream fs = new FileStream(LogFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (StreamReader sr = new StreamReader(fs, Encoding.UTF8))
                {
                    string[] all = sr.ReadToEnd().Split('\n');
                    int from = Math.Max(0, all.Length - lines);
                    return string.Join("\n", all, from, all.Length - from).Trim();
                }
            }
            catch (IOException) { return ""; }
        }
    }

    // ───────── Windows firewall: inbound rules for the bundled node.exe ─────────
    // The rule names and ports must agree with the server's Diagnose page (lib/diagnose.js FIREWALL_RULES), whose
    // Fix button adds the same two rules. They are literal on purpose: the server does not read AppName.
    static class Firewall
    {
        public const string RuleTcp = "MS Games (TCP)", RuleUdp = "MS Games (UDP)";
        const string Q = "\"";
        static string AskedFile { get { return Path.Combine(Program.LocalDir, "firewall-asked.txt"); } }

        static string Netsh(string args, out int code)
        {
            code = -1;
            try
            {
                ProcessStartInfo si = new ProcessStartInfo("netsh", args);
                si.UseShellExecute = false; si.CreateNoWindow = true; si.RedirectStandardOutput = true;
                using (Process p = Process.Start(si))
                {
                    string o = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(8000);
                    code = p.HasExited ? p.ExitCode : -1;
                    return o;
                }
            }
            catch (System.ComponentModel.Win32Exception) { return null; }
            catch (InvalidOperationException) { return null; }
        }

        /// <summary>true = the rule is there for this node.exe, false = missing, null = cannot tell (no netsh).</summary>
        static bool? Has(string rule, string node)
        {
            int code;
            string o = Netsh("advfirewall firewall show rule name=" + Q + rule + Q + " verbose", out code);
            if (o == null) return null;
            if (code != 0) return false;
            return o.IndexOf(node, StringComparison.OrdinalIgnoreCase) >= 0;      // the path reads the same in every Windows language
        }

        public static bool? Present(string node)
        {
            bool? t = Has(RuleTcp, node);
            if (t == null) return null;
            if (t == false) return false;
            return Has(RuleUdp, node);
        }

        /// <summary>Was Windows already asked for this node.exe (so a "No" is not asked again at every start)?</summary>
        public static bool Asked(string node)
        {
            try { return File.Exists(AskedFile) && string.Equals(File.ReadAllText(AskedFile).Trim(), node, StringComparison.OrdinalIgnoreCase); }
            catch (IOException) { return false; }
        }

        /// <summary>The four netsh lines that (re)create both rules; the same as lib/diagnose.js firewallFixCommand.</summary>
        public static string Commands(string node)
        {
            return "netsh advfirewall firewall delete rule name=" + Q + RuleTcp + Q +
                " & netsh advfirewall firewall delete rule name=" + Q + RuleUdp + Q +
                " & netsh advfirewall firewall add rule name=" + Q + RuleTcp + Q + " dir=in action=allow program=" + Q + node + Q + " protocol=TCP localport=" + Program.DefaultPort + "," + Program.DefaultTlsPort + " enable=yes profile=any" +
                " & netsh advfirewall firewall add rule name=" + Q + RuleUdp + Q + " dir=in action=allow program=" + Q + node + Q + " protocol=UDP localport=" + Program.BeaconPort + " enable=yes profile=any";
        }

        /// <summary>One Windows prompt (UAC) that adds both rules. false = the user said No or it did not work.</summary>
        public static bool Add(string node)
        {
            try { Directory.CreateDirectory(Program.LocalDir); File.WriteAllText(AskedFile, node); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            try
            {
                ProcessStartInfo si = new ProcessStartInfo("cmd.exe", "/c " + Q + Commands(node) + Q);
                si.UseShellExecute = true; si.Verb = "runas"; si.WindowStyle = ProcessWindowStyle.Hidden;
                using (Process p = Process.Start(si)) { if (p != null) p.WaitForExit(30000); }
            }
            catch (System.ComponentModel.Win32Exception) { return false; }      // 1223: the prompt was declined
            catch (InvalidOperationException) { return false; }
            return Present(node) == true;
        }
    }

    // ───────── прозорецът на лаунчъра (Edge в режим „приложение") ─────────
    static class Window
    {
        static Process proc;

        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);

        public static bool IsOpen
        {
            get { try { return proc != null && !proc.HasExited; } catch (InvalidOperationException) { return false; } }
        }

        public static void Open()
        {
            if (Program.NoWindow) return;
            if (IsOpen)
            {
                try
                {
                    proc.Refresh();
                    IntPtr h = proc.MainWindowHandle;
                    if (h != IntPtr.Zero) { if (IsIconic(h)) ShowWindow(h, 9); SetForegroundWindow(h); return; }
                }
                catch (InvalidOperationException) { }
            }
            string browser = Paths.FindBrowser();
            if (browser == null)
            {
                Process.Start(Program.Url);      // няма Edge или Chrome: в браузъра по подразбиране
                return;
            }
            string profile = Path.Combine(Program.LocalDir, "window");
            Directory.CreateDirectory(profile);
            string args = "--app=" + Program.Url
                + " --user-data-dir=\"" + profile + "\""
                + " --window-size=1440,900 --no-first-run --no-default-browser-check"
                + " --disable-features=Translate,msEdgeSidebarV2,msHubApps --lang=en-US";
            ProcessStartInfo si = new ProcessStartInfo(browser, args);
            si.UseShellExecute = false;
            proc = Process.Start(si);
        }

        public static void Close()
        {
            try { if (IsOpen) proc.CloseMainWindow(); } catch (InvalidOperationException) { }
        }
    }

    // ───────── заставката ─────────
    sealed class Splash : Form
    {
        string status = "Starting";
        float progress = 0.05f;
        bool failed;
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();
        float shown = 0f;
        readonly float k = 1f;      // мащабът на екрана (1 при 100%)

        // MS Games palette (design 0b): night green base, arena green, signal yellow, white text
        static readonly Color Back = Color.FromArgb(0x05, 0x0f, 0x08);
        static readonly Color Line = Color.FromArgb(0x1d, 0x2d, 0x22);
        static readonly Color Text1 = Color.FromArgb(0xf2, 0xf7, 0xee);
        static readonly Color Text2 = Color.FromArgb(0x9e, 0xa8, 0x9c);
        static readonly Color Green = Color.FromArgb(0x43, 0xd0, 0x66);
        static readonly Color Yellow = Color.FromArgb(0xfc, 0xe3, 0x43);
        static readonly Color Bad = Color.FromArgb(0xf7, 0x5f, 0x4c);
        readonly Image logo;      // brand/logo.svg drawn to a PNG by brand2/brand.ps1 (resource logo.png)

        public Splash()
        {
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            using (Graphics g0 = CreateGraphics()) k = Math.Max(1f, g0.DpiX / 96f);
            ClientSize = new Size((int)(560 * k), (int)(300 * k));
            BackColor = Back;
            ShowInTaskbar = true;
            Text = Program.AppName;
            DoubleBuffered = true;
            Icon = Shell.AppIcon();
            try { Stream ls = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"); if (ls != null) logo = Image.FromStream(ls); } catch (ArgumentException) { }
            anim.Interval = 16;
            anim.Tick += delegate { float d = progress - shown; if (Math.Abs(d) > 0.002f) { shown += d * 0.12f; Invalidate(); } };
            anim.Start();
        }

        public static void SaveShot(string file)
        {
            using (Splash s = new Splash())
            {
                s.status = "Starting the arena server"; s.progress = s.shown = 0.55f;
                s.anim.Stop();
                s.CreateControl();
                using (Bitmap bmp = new Bitmap(s.ClientSize.Width, s.ClientSize.Height))
                {
                    using (Graphics g = Graphics.FromImage(bmp)) { g.Clear(Back); s.OnPaint(new PaintEventArgs(g, new Rectangle(Point.Empty, s.ClientSize))); }
                    bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png);
                }
            }
        }

        public void Set(string text, float pct)
        {
            if (IsDisposed) return;
            if (InvokeRequired) { BeginInvoke((MethodInvoker)delegate { Set(text, pct); }); return; }
            status = text; progress = pct; failed = false; Invalidate();
        }

        public void Fail(string text)
        {
            if (IsDisposed) return;
            if (InvokeRequired) { BeginInvoke((MethodInvoker)delegate { Fail(text); }); return; }
            status = text; failed = true; Invalidate();
        }

        static Font Pick(string[] names, float size, FontStyle style)
        {
            foreach (string n in names)
            {
                Font f = new Font(n, size, style, GraphicsUnit.Pixel);
                if (string.Equals(f.Name, n, StringComparison.OrdinalIgnoreCase)) return f;
                f.Dispose();
            }
            return new Font(FontFamily.GenericSansSerif, size, style, GraphicsUnit.Pixel);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.ScaleTransform(k, k);
            int W = 560, H = 300;

            // a soft green light from the top left and a yellow one from the bottom right, as in the console
            using (GraphicsPath gp = new GraphicsPath())
            {
                gp.AddEllipse(-260, -300, 760, 620);
                using (PathGradientBrush pg = new PathGradientBrush(gp))
                {
                    pg.CenterColor = Color.FromArgb(70, Green); pg.SurroundColors = new Color[] { Color.FromArgb(0, Green) };
                    g.FillRectangle(pg, 0, 0, W, H);
                }
            }
            using (GraphicsPath gp = new GraphicsPath())
            {
                gp.AddEllipse(W - 330, H - 210, 640, 460);
                using (PathGradientBrush pg = new PathGradientBrush(gp))
                {
                    pg.CenterColor = Color.FromArgb(34, Yellow); pg.SurroundColors = new Color[] { Color.FromArgb(0, Yellow) };
                    g.FillRectangle(pg, 0, 0, W, H);
                }
            }
            // the brand stripe on the top edge: green, then yellow
            using (SolidBrush b = new SolidBrush(Green)) g.FillRectangle(b, 0, 0, W * 0.62f, 5);
            using (SolidBrush b = new SolidBrush(Yellow)) g.FillRectangle(b, W * 0.62f, 0, W * 0.38f + 1, 5);

            if (logo != null)
            {
                float lw = 430, lh = lw * logo.Height / logo.Width;
                g.DrawImage(logo, 44, 78, lw, lh);
            }
            else
            {
                // without the picture: the M mark drawn here (white M, green left pillar, yellow right pillar) and the name
                float mx = 44, my = 74, u = 0.82f;
                PointF[] m = { P(mx, my, u, 4, 108), P(mx, my, u, 4, 4), P(mx, my, u, 26, 4), P(mx, my, u, 64, 52), P(mx, my, u, 102, 4), P(mx, my, u, 124, 4),
                               P(mx, my, u, 124, 108), P(mx, my, u, 102, 108), P(mx, my, u, 102, 46), P(mx, my, u, 64, 94), P(mx, my, u, 26, 46), P(mx, my, u, 26, 108) };
                using (SolidBrush b = new SolidBrush(Text1)) g.FillPolygon(b, m);
                using (SolidBrush b = new SolidBrush(Green)) g.FillRectangle(b, mx + 4 * u, my + 4 * u, 22 * u, 104 * u);
                using (SolidBrush b = new SolidBrush(Yellow)) g.FillRectangle(b, mx + 102 * u, my + 4 * u, 22 * u, 104 * u);
                using (Font big = Pick(new string[] { "Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", "Segoe UI Black" }, 78f, FontStyle.Regular))
                using (SolidBrush b = new SolidBrush(Text1)) g.DrawString(Program.AppName.ToUpperInvariant(), big, b, 160, 70);
            }

            using (Font st = Pick(new string[] { "Segoe UI" }, 15f, FontStyle.Regular))
            using (SolidBrush b = new SolidBrush(failed ? Bad : Text2))
                g.DrawString(status, st, b, new RectangleF(44, 204, W - 88, 48));

            float done = (W - 88) * Math.Max(0.02f, Math.Min(1f, shown));
            using (SolidBrush b = new SolidBrush(Line)) g.FillRectangle(b, 44, H - 36, W - 88, 4);
            using (SolidBrush b = new SolidBrush(failed ? Bad : Green)) g.FillRectangle(b, 44, H - 36, done, 4);
            if (!failed) using (SolidBrush b = new SolidBrush(Yellow)) g.FillRectangle(b, 44 + Math.Max(0, done - 14), H - 36, Math.Min(14, done), 4);

            g.ResetTransform();
            using (Pen p = new Pen(Line)) g.DrawRectangle(p, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
        }

        static PointF P(float ox, float oy, float u, float x, float y) { return new PointF(ox + x * u, oy + y * u); }

        // влачи се с мишката (няма рамка)
        [DllImport("user32.dll")] static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, 0x2, 0); }
            base.OnMouseDown(e);
        }
    }

    // ───────── животът на програмата: заставка → сървър → прозорец → до часовника ─────────
    sealed class Shell : ApplicationContext
    {
        readonly string appDir;
        readonly Server server;
        readonly NotifyIcon tray = new NotifyIcon();
        readonly Splash splash = new Splash();
        readonly System.Windows.Forms.Timer watch = new System.Windows.Forms.Timer();
        bool windowWasOpen, told;

        public static Icon AppIcon()
        {
            try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (ArgumentException) { return SystemIcons.Application; }
        }

        public Shell(string appDir)
        {
            this.appDir = appDir;
            server = appDir == null ? null : new Server(appDir);

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open " + Program.AppName, null, delegate { Window.Open(); });
            menu.Items.Add("Restart the server", null, delegate { Restart(); });
            menu.Items.Add("Server log", null, delegate { ShowLog(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, delegate { Quit(); });
            tray.Icon = AppIcon();
            tray.Text = Program.AppName;
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { Window.Open(); };
            tray.Visible = true;

            if (server != null) server.Crashed += delegate(string msg) { tray.ShowBalloonTip(6000, Program.AppName, msg, ToolTipIcon.Warning); };

            watch.Interval = 1000;
            watch.Tick += delegate
            {
                bool open = Window.IsOpen;
                if (windowWasOpen && !open && !told)
                {
                    told = true;      // казва се веднъж: прозорецът е затворен, залата продължава да работи
                    tray.ShowBalloonTip(5000, Program.AppName, "The window is closed but the arena keeps running. Exit is in the menu next to the clock.", ToolTipIcon.Info);
                }
                windowWasOpen = open;
            };

            splash.Show();
            Thread t = new Thread(Boot);
            t.IsBackground = true;
            t.Start();
        }

        void Boot()
        {
            try
            {
                splash.Set("Checking what is on this computer", 0.12f);
                if (appDir == null) throw new InvalidOperationException("Cannot find the app (server.js). Launch " + Program.AppName + " from its folder or with --app <folder>.");
                Thread.Sleep(250);
                if (Server.IsUp()) { server.Adopt(); splash.Set("The server is already running, connecting", 0.6f); }
                else
                {
                    splash.Set("Starting the arena server", 0.3f);
                    server.Start();
                    splash.Set("Waiting for the server to respond", 0.5f);
                    if (!server.WaitUp(30))
                    {
                        string tail = server.Tail(6);
                        throw new InvalidOperationException("The server did not respond on port " + Program.Port + "." + (tail.Length > 0 ? "\n" + tail : ""));
                    }
                }
                CheckFirewall();
                splash.Set("Opening " + Program.AppName, 0.9f);
                Window.Open();
                Thread.Sleep(900);
                splash.Set("Done", 1f);
                Thread.Sleep(350);
                splash.BeginInvoke((MethodInvoker)delegate { splash.Close(); watch.Start(); });
            }
            catch (Exception ex)
            {
                splash.Fail(ex.Message);
                splash.BeginInvoke((MethodInvoker)delegate
                {
                    splash.Click += delegate { Quit(); };      // при грешка: щракване затваря
                    watch.Start();
                });
            }
        }

        /// <summary>First run: the headsets must get through the Windows firewall to the bundled node.exe. Windows is
        /// asked once; after a "No" the program carries on and the console's Diagnose page offers Fix.
        /// --firewall-status only writes what it finds (and the command it would run) to the log: a check without a prompt.</summary>
        void CheckFirewall()
        {
            string node = Paths.FindNode();
            bool ours = node != null && node.StartsWith(Paths.ExeDir, StringComparison.OrdinalIgnoreCase);      // only our own node.exe
            if (Program.FirewallStatus)
            {
                bool? has = node == null ? null : Firewall.Present(node);
                server.Note("=== firewall check: node " + node + ", bundled " + ours + ", rules " + (has == null ? "unknown" : has == true ? "present" : "missing") + ", asked before " + (node != null && Firewall.Asked(node)));
                if (node != null) server.Note("=== firewall command: " + Firewall.Commands(node));
            }
            if (Program.NoFirewall || Program.Port != Program.DefaultPort || !Paths.Packed(appDir) || !ours) return;
            if (Firewall.Present(node) != false) return;
            if (Firewall.Asked(node)) return;
            splash.Set("Windows will ask once to let the headsets through the firewall", 0.75f);
            if (!Firewall.Add(node))
                tray.ShowBalloonTip(9000, Program.AppName, "The firewall rules were not added, so headsets may not connect. Open Diagnose in the console and press Fix.", ToolTipIcon.Warning);
        }

        void Restart()
        {
            if (server == null) return;
            if (!server.Ours && Server.IsUp())
            {
                MessageBox.Show("The server was not started by " + Program.AppName + " (it runs separately), so I leave it alone.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (GameRunning() && MessageBox.Show("A game is running. A restart will interrupt it for all headsets.\n\nRestart?", Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    server.Stop();
                    Thread.Sleep(600);
                    server.Start();
                    bool ok = server.WaitUp(30);
                    tray.ShowBalloonTip(4000, Program.AppName, ok ? "The server was restarted." : "The server did not respond after the restart. See the log.", ok ? ToolTipIcon.Info : ToolTipIcon.Error);
                }
                catch (Exception ex) { tray.ShowBalloonTip(6000, Program.AppName, ex.Message, ToolTipIcon.Error); }
            });
        }

        static bool GameRunning()
        {
            string s = Server.Get("api/state", 1200);
            return s != null && (s.IndexOf("\"session\":{", StringComparison.Ordinal) >= 0 || s.IndexOf("\"run\":{", StringComparison.Ordinal) >= 0);
        }

        void ShowLog()
        {
            if (server == null || !File.Exists(server.LogFile))
            {
                MessageBox.Show("No log yet (the server was not started by " + Program.AppName + ").", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            Process.Start("notepad.exe", "\"" + server.LogFile + "\"");
        }

        void Quit()
        {
            bool ours = server != null && server.Ours;
            if (ours && GameRunning() && MessageBox.Show("A game is running. Exiting will stop the server and the game for all headsets.\n\nExit?", Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            watch.Stop();
            tray.Visible = false;
            Window.Close();
            if (ours) server.Stop();
            if (!splash.IsDisposed) splash.Close();
            ExitThread();
        }
    }
}
