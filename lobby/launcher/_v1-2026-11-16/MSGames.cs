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
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace MSGames
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        public const string AppName = "MS Games";
        public static int Port = 47801;                 // --port <n> го сменя (за проби до работещ сървър)
        public static bool NoWindow;                    // --no-window: без прозорец (за проби)
        public static string Url { get { return "http://localhost:" + Port + "/"; } }
        public static readonly string LocalDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);

        [STAThread]
        static int Main(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                int n;
                if (args[i] == "--port" && i + 1 < args.Length && int.TryParse(args[i + 1], out n)) Port = n;
                if (args[i] == "--no-window") NoWindow = true;
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
                if (Paths.Packed(appDir)) si.EnvironmentVariables["ARENA_DATA"] = Path.Combine(Program.LocalDir, "data");      // пакетирано: данните са в профила, не до програмата

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
            Write("=== the server was stopped by MS Games");
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

        static readonly Color Back = Color.FromArgb(0x13, 0x14, 0x11);
        static readonly Color Line = Color.FromArgb(0x2c, 0x2e, 0x28);
        static readonly Color Text1 = Color.FromArgb(0xe9, 0xec, 0xe2);
        static readonly Color Text2 = Color.FromArgb(0x9a, 0x9d, 0x92);
        static readonly Color Signal = Color.FromArgb(0xc8, 0xf0, 0x3c);
        static readonly Color Bad = Color.FromArgb(0xf0, 0x6a, 0x45);

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
            anim.Interval = 16;
            anim.Tick += delegate { float d = progress - shown; if (Math.Abs(d) > 0.002f) { shown += d * 0.12f; Invalidate(); } };
            anim.Start();
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
            using (Pen p = new Pen(Line)) g.DrawRectangle(p, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
            g.ScaleTransform(k, k);
            int W = 560, H = 300;

            // знакът: квадрат със светла точка, както в лаунчъра
            using (SolidBrush b = new SolidBrush(Signal)) g.FillRectangle(b, 44, 62, 10, 10);
            using (Font small = Pick(new string[] { "Bahnschrift SemiBold", "Segoe UI Semibold", "Segoe UI" }, 13f, FontStyle.Regular))
            using (SolidBrush b = new SolidBrush(Text2)) g.DrawString("ARENA FOR VR GAMES", small, b, 62, 58);

            using (Font big = Pick(new string[] { "Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", "Segoe UI Black" }, 92f, FontStyle.Regular))
            using (SolidBrush b = new SolidBrush(Text1)) g.DrawString("MS GAMES", big, b, 36, 84);

            using (Font st = Pick(new string[] { "Segoe UI" }, 15f, FontStyle.Regular))
            using (SolidBrush b = new SolidBrush(failed ? Bad : Text2))
                g.DrawString(status, st, b, new RectangleF(44, 212, W - 88, 44));

            using (SolidBrush b = new SolidBrush(Line)) g.FillRectangle(b, 44, H - 36, W - 88, 3);
            using (SolidBrush b = new SolidBrush(failed ? Bad : Signal)) g.FillRectangle(b, 44, H - 36, (int)((W - 88) * Math.Max(0.02f, Math.Min(1f, shown))), 3);
        }

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
            menu.Items.Add("Open MS Games", null, delegate { Window.Open(); });
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
                if (appDir == null) throw new InvalidOperationException("Cannot find the app (server.js). Launch MS Games from its folder or with --app <folder>.");
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
                splash.Set("Opening MS Games", 0.9f);
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

        void Restart()
        {
            if (server == null) return;
            if (!server.Ours && Server.IsUp())
            {
                MessageBox.Show("The server was not started by MS Games (it runs separately), so I leave it alone.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            return s != null && s.IndexOf("\"session\":{", StringComparison.Ordinal) >= 0;
        }

        void ShowLog()
        {
            if (server == null || !File.Exists(server.LogFile))
            {
                MessageBox.Show("No log yet (the server was not started by MS Games).", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
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
