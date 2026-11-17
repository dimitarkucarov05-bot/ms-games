// Инсталаторът на MS Games: съветник с картинка, избор на папка, лента и „Готово".
//
// Един файл (MS-Games-Setup.exe): самата програма + залепен след нея zip с всичко за инсталиране.
// Краят на файла е:  [zip] [дължина на zip, 8 байта] ["MSGPAYLD"].  package.ps1 го сглобява.
//
// Какво прави при инсталиране: разопакова в избраната папка (по подразбиране %LOCALAPPDATA%\Programs\MS Games,
// без права на администратор), прави икони в менюто „Старт" и на работния плот, записва се в „Приложения" на
// Windows с деинсталатор (същият файл, копиран като Uninstall.exe).
//
// Ключове за проби и за тихо инсталиране:
//   /silent            без прозорец
//   /dir="C:\път"      къде
//   /noshortcuts       без икони и без запис в „Приложения"
//   /norun             не пуска MS Games накрая
//   /uninstall         деинсталиране (така се вика от „Приложения")
//
// Компилира се с вградения в Windows компилатор (C# 5), виж build.ps1.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("MS Games Setup")]
[assembly: AssemblyProduct("MS Games")]
[assembly: AssemblyCompany("MS Games")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace MSGamesSetup
{
    static class Program
    {
        public const string AppName = "MS Games";
        public const string ExeName = "MS Games.exe";
        public const string RegKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MSGames";
        public static string Version { get { Version v = Assembly.GetExecutingAssembly().GetName().Version; return v.Major + "." + v.Minor + "." + v.Build; } }
        public static string DefaultDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", AppName); } }

        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] args)
        {
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool silent = false, noShortcuts = false, noRun = false, uninstall = false;
            string dir = null, cleanup = null;
            foreach (string a in args)
            {
                string l = a.ToLowerInvariant();
                if (l == "/silent") silent = true;
                else if (l == "/noshortcuts") noShortcuts = true;
                else if (l == "/norun") noRun = true;
                else if (l == "/uninstall") uninstall = true;
                else if (l.StartsWith("/dir=")) dir = a.Substring(5).Trim('"');
                else if (l.StartsWith("/cleanup=")) cleanup = a.Substring(9).Trim('"');
            }
            string self = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
            if (self.Equals("Uninstall", StringComparison.OrdinalIgnoreCase)) uninstall = true;

            try
            {
                if (cleanup != null) return Uninstaller.Finish(cleanup, silent);
                if (uninstall) return Uninstaller.Run(silent);
                if (silent)
                {
                    Installer ins = new Installer(dir ?? DefaultDir, !noShortcuts);
                    ins.Run(null);
                    if (!noRun) ins.Launch();
                    return 0;
                }
                Application.Run(new Wizard(dir ?? DefaultDir, !noShortcuts, !noRun));
                return 0;
            }
            catch (Exception ex)
            {
                if (!silent) MessageBox.Show(ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                else Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }
    }

    // ───────── залепеният zip ─────────
    /// <summary>Парче от файл като отделен поток (zip-ът стои след програмата в същия файл).</summary>
    sealed class SubStream : Stream
    {
        readonly Stream s; readonly long start, len; long pos;
        public SubStream(Stream s, long start, long len) { this.s = s; this.start = start; this.len = len; }
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return len; } }
        public override long Position { get { return pos; } set { pos = value; } }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count)
        {
            if (pos >= len) return 0;
            if (count > len - pos) count = (int)(len - pos);
            s.Position = start + pos;
            int n = s.Read(buffer, offset, count);
            pos += n;
            return n;
        }
        public override long Seek(long offset, SeekOrigin origin)
        {
            pos = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.Current ? pos + offset : len + offset;
            return pos;
        }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }

    static class Payload
    {
        const string Magic = "MSGPAYLD";

        public static Stream Open(out FileStream file)
        {
            file = new FileStream(Application.ExecutablePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (file.Length < 16) throw new InvalidOperationException("The installer has no package.");
            byte[] tail = new byte[16];
            file.Position = file.Length - 16;
            file.Read(tail, 0, 16);
            if (Encoding.ASCII.GetString(tail, 8, 8) != Magic) throw new InvalidOperationException("This file is only the installer program, without the MS Games package. Build it with launcher\\package.ps1.");
            long len = BitConverter.ToInt64(tail, 0);
            return new SubStream(file, file.Length - 16 - len, len);
        }

        /// <summary>Колко място ще заеме разопаковано (за страницата с папката).</summary>
        public static long UnpackedSize()
        {
            try
            {
                FileStream f;
                using (Stream s = Open(out f))
                using (f)
                using (ZipArchive zip = new ZipArchive(s, ZipArchiveMode.Read))
                {
                    long total = 0;
                    foreach (ZipArchiveEntry e in zip.Entries) total += e.Length;
                    return total;
                }
            }
            catch (InvalidOperationException) { return 0; }
            catch (IOException) { return 0; }
            catch (InvalidDataException) { return 0; }
        }
    }

    // ───────── самото инсталиране ─────────
    sealed class Installer
    {
        public readonly string Dir;
        readonly bool shortcuts;
        public volatile bool Cancel;

        public Installer(string dir, bool shortcuts) { Dir = Path.GetFullPath(dir); this.shortcuts = shortcuts; }

        /// <summary>progress(част 0..1, какво се прави). Хвърля изключение при грешка или отказ.</summary>
        public void Run(Action<float, string> progress)
        {
            StopRunning(Dir);
            Directory.CreateDirectory(Dir);
            FileStream file;
            using (Stream s = Payload.Open(out file))
            using (file)
            using (ZipArchive zip = new ZipArchive(s, ZipArchiveMode.Read))
            {
                long total = 0, done = 0;
                foreach (ZipArchiveEntry e in zip.Entries) total += e.Length;
                byte[] buf = new byte[256 * 1024];
                string root = Dir.TrimEnd('\\') + "\\";
                foreach (ZipArchiveEntry e in zip.Entries)
                {
                    if (Cancel) throw new OperationCanceledException("The installation was cancelled.");
                    string rel = e.FullName.Replace('/', '\\');
                    string to = Path.GetFullPath(Path.Combine(Dir, rel));
                    if (!to.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;      // път извън папката: не се пише
                    if (rel.EndsWith("\\")) { Directory.CreateDirectory(to); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(to));
                    using (Stream src = e.Open())
                    using (FileStream dst = new FileStream(to, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        int n;
                        while ((n = src.Read(buf, 0, buf.Length)) > 0)
                        {
                            dst.Write(buf, 0, n);
                            done += n;
                            if (progress != null) progress(total > 0 ? (float)done / total * 0.96f : 0.5f, rel);
                        }
                    }
                }
            }
            if (progress != null) progress(0.97f, "Uninstaller and shortcuts");
            string un = Path.Combine(Dir, "Uninstall.exe");
            File.Copy(Application.ExecutablePath, un, true);
            TrimPayload(un);
            if (shortcuts) { Shortcuts.Create(Dir); Register(Dir); }
            if (progress != null) progress(1f, "Done");
        }

        /// <summary>Деинсталаторът е същата програма, но без залепения пакет (иначе е стотици мегабайти).</summary>
        static void TrimPayload(string exe)
        {
            using (FileStream f = new FileStream(exe, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                if (f.Length < 16) return;
                byte[] tail = new byte[16];
                f.Position = f.Length - 16;
                f.Read(tail, 0, 16);
                if (Encoding.ASCII.GetString(tail, 8, 8) != "MSGPAYLD") return;
                long len = BitConverter.ToInt64(tail, 0);
                f.SetLength(f.Length - 16 - len);
            }
        }

        public void Launch()
        {
            string exe = Path.Combine(Dir, Program.ExeName);
            if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = Dir, UseShellExecute = true });
        }

        /// <summary>Работеща MS Games от същата папка (и сървърът ѝ) се спира, иначе файловете са заети.</summary>
        public static void StopRunning(string dir)
        {
            string root = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
            foreach (string name in new string[] { "MS Games", "node" })
                foreach (Process p in Process.GetProcessesByName(name))
                {
                    try
                    {
                        string path = p.MainModule.FileName;
                        if (path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(4000); }
                    }
                    catch (InvalidOperationException) { }
                    catch (System.ComponentModel.Win32Exception) { }
                    catch (NotSupportedException) { }
                }
        }

        static void Register(string dir)
        {
            long kb = 0;
            try { foreach (string f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) kb += new FileInfo(f).Length / 1024; } catch (IOException) { } catch (UnauthorizedAccessException) { }
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(Program.RegKey))
            {
                k.SetValue("DisplayName", Program.AppName);
                k.SetValue("DisplayVersion", Program.Version);
                k.SetValue("Publisher", "MS Games");
                k.SetValue("InstallLocation", dir);
                k.SetValue("DisplayIcon", Path.Combine(dir, Program.ExeName));
                k.SetValue("UninstallString", "\"" + Path.Combine(dir, "Uninstall.exe") + "\" /uninstall");
                k.SetValue("QuietUninstallString", "\"" + Path.Combine(dir, "Uninstall.exe") + "\" /uninstall /silent");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                k.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, kb), RegistryValueKind.DWord);
            }
        }
    }

    static class Shortcuts
    {
        static string StartMenu { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Program.AppName + ".lnk"); } }
        static string Desktop { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Program.AppName + ".lnk"); } }

        public static void Create(string dir)
        {
            string exe = Path.Combine(dir, Program.ExeName);
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            if (t == null) return;
            dynamic shell = Activator.CreateInstance(t);
            foreach (string lnk in new string[] { StartMenu, Desktop })
            {
                dynamic s = shell.CreateShortcut(lnk);
                s.TargetPath = exe;
                s.WorkingDirectory = dir;
                s.IconLocation = exe + ",0";
                s.Description = "MS Games: free-roam VR games";
                s.Save();
            }
        }

        public static void Remove()
        {
            foreach (string lnk in new string[] { StartMenu, Desktop })
                try { if (File.Exists(lnk)) File.Delete(lnk); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    // ───────── деинсталиране ─────────
    static class Uninstaller
    {
        static string InstalledDir()
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(Program.RegKey))
            {
                string d = k == null ? null : k.GetValue("InstallLocation") as string;
                return string.IsNullOrEmpty(d) ? Path.GetDirectoryName(Application.ExecutablePath) : d;
            }
        }

        public static int Run(bool silent)
        {
            string dir = InstalledDir();
            if (!silent && MessageBox.Show("Remove MS Games from this computer?\n\nThe arena data (zone, calibrations, headset names) stays.", Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return 2;
            // програмата не може да изтрие себе си, докато работи: копие във временната папка довършва работата
            string tmp = Path.Combine(Path.GetTempPath(), "msgames-uninstall-" + Process.GetCurrentProcess().Id + ".exe");
            File.Copy(Application.ExecutablePath, tmp, true);
            Process.Start(new ProcessStartInfo(tmp, "/cleanup=\"" + dir + "\"" + (silent ? " /silent" : "")) { UseShellExecute = false });
            return 0;
        }

        public static int Finish(string dir, bool silent)
        {
            Thread.Sleep(700);
            Installer.StopRunning(dir);
            Shortcuts.Remove();
            try { Registry.CurrentUser.DeleteSubKeyTree(Program.RegKey, false); } catch (UnauthorizedAccessException) { }
            string full = Path.GetFullPath(dir);
            bool ok = true;
            // пази се само папка, която наистина е на MS Games
            if (File.Exists(Path.Combine(full, Program.ExeName)) || File.Exists(Path.Combine(full, "Uninstall.exe")))
            {
                for (int i = 0; i < 6; i++)
                {
                    try { if (Directory.Exists(full)) Directory.Delete(full, true); ok = true; break; }
                    catch (IOException) { ok = false; Thread.Sleep(500); }
                    catch (UnauthorizedAccessException) { ok = false; Thread.Sleep(500); }
                }
            }
            if (!silent) MessageBox.Show(ok ? "MS Games was removed." : "MS Games was removed, but some files in\n" + full + "\nare in use and were left behind.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return ok ? 0 : 3;
        }
    }

    // ───────── съветникът ─────────
    sealed class Wizard : Form
    {
        static readonly Color Back = Color.FromArgb(0x13, 0x14, 0x11);
        static readonly Color Rail = Color.FromArgb(0x1b, 0x1c, 0x19);
        static readonly Color Line = Color.FromArgb(0x35, 0x37, 0x30);
        static readonly Color Text1 = Color.FromArgb(0xe9, 0xec, 0xe2);
        static readonly Color Text2 = Color.FromArgb(0xa6, 0xa9, 0x9e);
        static readonly Color Signal = Color.FromArgb(0xc8, 0xf0, 0x3c);
        static readonly Color Bad = Color.FromArgb(0xf0, 0x6a, 0x45);

        readonly float k;
        int page;                       // 0 добре дошъл, 1 папка, 2 инсталира, 3 готово
        string dir;
        readonly bool shortcutsWanted;
        bool runAfter;
        Image art;
        Installer installer;
        float progress, shown; string doing = "", error;
        readonly long need;

        readonly Button next = new Button(), back = new Button(), cancel = new Button(), browse = new Button();
        readonly TextBox path = new TextBox();
        readonly CheckBox desk = new CheckBox(), run = new CheckBox();
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();

        const int W = 640, H = 470, Bar = 62;

        public Wizard(string dir, bool shortcuts, bool runAfter)
        {
            this.dir = dir; shortcutsWanted = shortcuts; this.runAfter = runAfter;
            using (Graphics g0 = CreateGraphics()) k = Math.Max(1f, g0.DpiX / 96f);
            Text = "MS Games Setup " + Program.Version;
            FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(S(W), S(H));
            BackColor = Back; ForeColor = Text1; DoubleBuffered = true;
            Font = new Font("Segoe UI", 9.5f);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (ArgumentException) { }
            try { Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("art.jpg"); if (s != null) art = Image.FromStream(s); } catch (ArgumentException) { }
            need = Payload.UnpackedSize();

            StyleButton(next, true); StyleButton(back, false); StyleButton(cancel, false); StyleButton(browse, false);
            cancel.Text = "Cancel"; back.Text = "Back"; browse.Text = "Browse…";
            int by = S(H - Bar + 14), bw = S(112), bh = S(34);
            cancel.SetBounds(S(W) - S(20) - bw, by, bw, bh);
            next.SetBounds(cancel.Left - S(10) - S(140), by, S(140), bh);
            back.SetBounds(next.Left - S(10) - bw, by, bw, bh);
            path.SetBounds(S(36), S(150), S(W - 72 - 122), S(28));
            path.BackColor = Rail; path.ForeColor = Text1; path.BorderStyle = BorderStyle.FixedSingle; path.Text = dir;
            browse.SetBounds(path.Right + S(10), S(148), S(112), S(32));
            desk.SetBounds(S(36), S(232), S(500), S(26)); desk.Text = "Desktop and Start menu shortcuts"; desk.Checked = shortcuts; desk.ForeColor = Text1; desk.FlatStyle = FlatStyle.Standard;
            run.SetBounds(S(36), S(196), S(500), S(26)); run.Text = "Start MS Games now"; run.Checked = runAfter; run.ForeColor = Text1;
            Controls.AddRange(new Control[] { next, back, cancel, path, browse, desk, run });

            next.Click += delegate { Next(); };
            back.Click += delegate { if (page == 1) Go(0); };
            cancel.Click += delegate { Close(); };
            browse.Click += delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Folder in which to create \"MS Games\"";
                    if (d.ShowDialog(this) == DialogResult.OK) path.Text = Path.Combine(d.SelectedPath, Program.AppName);
                }
            };
            path.TextChanged += delegate { Invalidate(); };
            anim.Interval = 16;
            anim.Tick += delegate { float d = progress - shown; if (Math.Abs(d) > 0.0015f) { shown += d * 0.18f; Invalidate(); } };
            anim.Start();
            Go(0);
        }

        int S(int v) { return (int)(v * k); }

        void StyleButton(Button b, bool primary)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderColor = primary ? Signal : Line;
            b.FlatAppearance.BorderSize = 1;
            b.BackColor = primary ? Signal : Rail;
            b.ForeColor = primary ? Color.FromArgb(0x13, 0x14, 0x11) : Text1;
            b.Font = new Font("Segoe UI Semibold", 9.5f);
            b.Cursor = Cursors.Hand;
        }

        void Go(int p)
        {
            page = p;
            path.Visible = browse.Visible = desk.Visible = p == 1;
            run.Visible = p == 3 && error == null;
            back.Visible = p == 1;
            cancel.Visible = p != 3;
            cancel.Enabled = true;
            next.Enabled = p != 2;
            next.Text = p == 0 ? "Next" : p == 1 ? "Install" : p == 2 ? "Installing" : "Finish";
            Invalidate();
        }

        void Next()
        {
            if (page == 0) { Go(1); return; }
            if (page == 1)
            {
                string d = path.Text.Trim();
                if (d.Length < 3) { MessageBox.Show(this, "Choose a folder.", Program.AppName); return; }
                try { d = Path.GetFullPath(d); } catch (Exception) { MessageBox.Show(this, "This path is not valid.", Program.AppName); return; }
                dir = d;
                installer = new Installer(dir, desk.Checked && shortcutsWanted);
                Go(2);
                Thread t = new Thread(Work); t.IsBackground = true; t.Start();
                return;
            }
            if (page == 3)
            {
                if (error == null && run.Checked && installer != null) installer.Launch();
                installer = null;
                Close();
            }
        }

        void Work()
        {
            try { installer.Run(delegate(float p, string what) { progress = p; doing = what; }); }
            catch (OperationCanceledException ex) { error = ex.Message; }
            catch (UnauthorizedAccessException) { error = "Cannot write to this folder. Choose another one (for example in your profile) or run the installer as administrator."; }
            catch (Exception ex) { error = ex.Message; }
            try { BeginInvoke((MethodInvoker)delegate { Go(3); }); } catch (InvalidOperationException) { }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (page == 2 && installer != null)
            {
                e.Cancel = true;
                if (MessageBox.Show(this, "Cancel the installation?", Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) { installer.Cancel = true; cancel.Enabled = false; }
            }
            base.OnFormClosing(e);
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

        static string Human(long bytes)
        {
            if (bytes >= 1024L * 1024 * 1024) return (bytes / (1024.0 * 1024 * 1024)).ToString("0.0") + " GB";
            return Math.Max(1, bytes / (1024 * 1024)) + " MB";
        }

        long FreeSpace()
        {
            try { string root = Path.GetPathRoot(Path.GetFullPath(path.Text.Trim())); return new DriveInfo(root).AvailableFreeSpace; }
            catch (Exception) { return -1; }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.ScaleTransform(k, k);
            int top = H - Bar;
            using (SolidBrush b = new SolidBrush(Rail)) g.FillRectangle(b, 0, top, W, Bar);
            using (Pen p = new Pen(Line)) g.DrawLine(p, 0, top, W, top);

            using (Font title = Pick(new string[] { "Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", "Segoe UI Semibold" }, 34f, FontStyle.Regular))
            using (Font body = Pick(new string[] { "Segoe UI" }, 14.5f, FontStyle.Regular))
            using (Font small = Pick(new string[] { "Segoe UI" }, 12.5f, FontStyle.Regular))
            using (SolidBrush t1 = new SolidBrush(Text1))
            using (SolidBrush t2 = new SolidBrush(Text2))
            {
                if (page == 0)
                {
                    // картинката от играта запълва страницата; отгоре знакът и името, отдолу какво е това
                    if (art != null)
                    {
                        float ar = (float)art.Width / art.Height, w = W, h = W / ar;
                        if (h < top) { h = top; w = top * ar; }
                        g.SetClip(new Rectangle(0, 0, W, top));
                        g.DrawImage(art, (W - w) / 2f, (top - h) / 2f, w, h);
                        g.ResetClip();
                        using (SolidBrush shade = new SolidBrush(Color.FromArgb(150, 0x13, 0x14, 0x11))) { g.FillRectangle(shade, 0, 0, W, 104); g.FillRectangle(shade, 0, top - 64, W, 64); }
                    }
                    using (SolidBrush s = new SolidBrush(Signal)) g.FillRectangle(s, 36, 44, 12, 12);
                    using (Font big = Pick(new string[] { "Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", "Segoe UI Black" }, 62f, FontStyle.Regular))
                        g.DrawString("MS GAMES", big, t1, 54, 14);
                    using (Font tag = Pick(new string[] { "Bahnschrift SemiBold", "Segoe UI Semibold" }, 16f, FontStyle.Regular))
                        g.DrawString("FREE-ROAM VR GAMES, NO CABLES", tag, t1, 36, top - 44);
                    g.DrawString("version " + Program.Version, small, t2, 36, top + 22);
                }
                else if (page == 1)
                {
                    g.DrawString("Where to install?", title, t1, 30, 30);
                    g.DrawString("MS Games will be installed in this folder. No administrator rights needed.", body, t2, new RectangleF(36, 92, W - 72, 44));
                    long free = FreeSpace();
                    string s = "Space needed: " + (need > 0 ? Human(need) : "unknown") + (free >= 0 ? "      Free on disk: " + Human(free) : "");
                    using (SolidBrush warn = new SolidBrush(free >= 0 && need > 0 && free < need ? Bad : Text2)) g.DrawString(s, small, warn, 36, 192);
                }
                else if (page == 2)
                {
                    g.DrawString("Installing", title, t1, 30, 30);
                    g.DrawString(doing, small, t2, new RectangleF(36, 150, W - 72, 22));
                    using (SolidBrush b = new SolidBrush(Line)) g.FillRectangle(b, 36, 186, W - 72, 6);
                    using (SolidBrush b = new SolidBrush(Signal)) g.FillRectangle(b, 36, 186, (W - 72) * Math.Max(0.01f, Math.Min(1f, shown)), 6);
                    g.DrawString((int)(Math.Min(1f, shown) * 100) + "%", body, t1, 36, 204);
                }
                else
                {
                    if (error == null)
                    {
                        g.DrawString("MS Games is installed", title, t1, 30, 30);
                        g.DrawString("Location: " + dir + ".\nStart it from the desktop shortcut or the Start menu.", body, t2, new RectangleF(36, 92, W - 72, 80));
                    }
                    else
                    {
                        g.DrawString("Installation failed", title, t1, 30, 30);
                        using (SolidBrush bad = new SolidBrush(Bad)) g.DrawString(error, body, bad, new RectangleF(36, 92, W - 72, 200));
                    }
                }
            }
        }
    }
}
