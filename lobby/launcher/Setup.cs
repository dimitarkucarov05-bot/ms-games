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
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

namespace MSGamesSetup
{
    static class Program
    {
        // The product name lives here (and in MSGames.cs Program.AppName); the owner may rename it later.
        public const string AppName = "MS Games";
        public const string ExeName = AppName + ".exe";
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
            string dir = null, cleanup = null, shots = null;
            foreach (string a in args)
            {
                string l = a.ToLowerInvariant();
                if (l == "/silent") silent = true;
                else if (l == "/noshortcuts") noShortcuts = true;
                else if (l == "/norun") noRun = true;
                else if (l == "/uninstall") uninstall = true;
                else if (l.StartsWith("/dir=")) dir = a.Substring(5).Trim('"');
                else if (l.StartsWith("/cleanup=")) cleanup = a.Substring(9).Trim('"');
                else if (l.StartsWith("/shots=")) shots = a.Substring(7).Trim('"');
            }
            string self = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
            if (self.Equals("Uninstall", StringComparison.OrdinalIgnoreCase)) uninstall = true;

            try
            {
                if (shots != null) { Wizard.SaveShots(shots, dir ?? DefaultDir); return 0; }
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
            if (Encoding.ASCII.GetString(tail, 8, 8) != Magic) throw new InvalidOperationException("This file is only the installer program, without the " + Program.AppName + " package. Build it with launcher\\package-v2.ps1.");
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
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetLongPathName(string shortPath, StringBuilder longPath, int size);

        /// <summary>The same folder can be written two ways (C:\\Users\\MARTIN~1\\... and C:\\Users\\Martiness\\...): compare the long form.</summary>
        static string Long(string path)
        {
            try
            {
                string full = Path.GetFullPath(path);
                StringBuilder sb = new StringBuilder(1024);
                int n = GetLongPathName(full, sb, sb.Capacity);
                return n > 0 && n < sb.Capacity ? sb.ToString() : full;
            }
            catch (ArgumentException) { return path; }
            catch (NotSupportedException) { return path; }
        }

        public static void StopRunning(string dir)
        {
            string root = Long(dir).TrimEnd('\\') + "\\";
            foreach (string name in new string[] { Program.AppName, "node", "adb" })
                foreach (Process p in Process.GetProcessesByName(name))
                {
                    try
                    {
                        string path = Long(p.MainModule.FileName);
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
                k.SetValue("Publisher", Program.AppName);
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
                s.Description = Program.AppName + ": free-roam VR arena";
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
            if (!silent && MessageBox.Show("Remove " + Program.AppName + " from this computer?\n\nThe arena data (play area, calibrations, headsets, records) stays.", Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return 2;
            // програмата не може да изтрие себе си, докато работи: копие във временната папка довършва работата
            string tmp = Path.Combine(Path.GetTempPath(), "msgames-uninstall-" + Process.GetCurrentProcess().Id + ".exe");
            File.Copy(Application.ExecutablePath, tmp, true);
            Process.Start(new ProcessStartInfo(tmp, "/cleanup=\"" + dir + "\"" + (silent ? " /silent" : "")) { UseShellExecute = false });
            return 0;
        }

        // The launcher's inbound rules (MSGames.cs Firewall, lib/diagnose.js FIREWALL_RULES): literal names on purpose.
        static readonly string[] FirewallRules = { "MS Games (TCP)", "MS Games (UDP)" };
        const string Q = "\"";

        static void Log(string line)
        {
            try
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Program.AppName, "logs");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "uninstall.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + line + Environment.NewLine);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        /// <summary>Is the rule there, and is it for the node.exe of THIS copy? (Another copy's rules are left alone.)</summary>
        static bool RuleIsOurs(string rule, string node)
        {
            try
            {
                ProcessStartInfo si = new ProcessStartInfo("netsh", "advfirewall firewall show rule name=" + Q + rule + Q + " verbose");
                si.UseShellExecute = false; si.CreateNoWindow = true; si.RedirectStandardOutput = true;
                using (Process p = Process.Start(si))
                {
                    string o = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(8000);
                    return p.HasExited && p.ExitCode == 0 && o.IndexOf(node, StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch (System.ComponentModel.Win32Exception) { return false; }
            catch (InvalidOperationException) { return false; }
        }

        /// <summary>Removes the firewall rules the launcher added for this copy's node.exe: one Windows prompt (UAC),
        /// netsh delete by rule name. No rules of ours = no prompt. A declined prompt is noted in
        /// %LOCALAPPDATA%\<AppName>\logs\uninstall.log and the uninstall carries on.</summary>
        static void RemoveFirewallRules(string dir)
        {
            try
            {
                string node = Path.Combine(Path.GetFullPath(dir), "runtime", "node.exe");
                List<string> ours = new List<string>();
                foreach (string r in FirewallRules) if (RuleIsOurs(r, node)) ours.Add(r);
                if (ours.Count == 0) { Log("firewall: no rules for " + node + ", nothing to remove"); return; }
                string cmds = "";
                foreach (string r in ours) cmds += (cmds.Length > 0 ? " & " : "") + "netsh advfirewall firewall delete rule name=" + Q + r + Q;
                ProcessStartInfo si = new ProcessStartInfo("cmd.exe", "/c " + Q + cmds + Q);
                si.UseShellExecute = true; si.Verb = "runas"; si.WindowStyle = ProcessWindowStyle.Hidden;
                using (Process p = Process.Start(si)) { if (p != null) p.WaitForExit(30000); }
                bool left = false;
                foreach (string r in ours) if (RuleIsOurs(r, node)) left = true;
                Log(left ? "firewall: the rules are still there after the delete command (" + string.Join(", ", ours.ToArray()) + ")"
                         : "firewall: removed " + string.Join(", ", ours.ToArray()));
            }
            catch (System.ComponentModel.Win32Exception ex)
            {
                // 1223 = the Windows prompt was declined: the rules stay, the uninstall goes on
                Log("firewall: the rules were NOT removed (" + (ex.NativeErrorCode == 1223 ? "the Windows prompt was declined" : ex.Message) + "). Remove them by hand: netsh advfirewall firewall delete rule name=" + Q + FirewallRules[0] + Q + " and name=" + Q + FirewallRules[1] + Q);
            }
            catch (Exception ex) { Log("firewall: could not check or remove the rules: " + ex.Message); }
        }

        public static int Finish(string dir, bool silent)
        {
            Thread.Sleep(700);
            Installer.StopRunning(dir);
            RemoveFirewallRules(dir);
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
            if (!silent) MessageBox.Show(ok ? Program.AppName + " was removed." : Program.AppName + " was removed, but some files in\n" + full + "\nare in use and were left behind.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return ok ? 0 : 3;
        }
    }

    // ───────── съветникът ─────────
    sealed class Wizard : Form
    {
        // MS Games palette (design 0b): night green base, arena green, signal yellow, white text
        static readonly Color Back = Color.FromArgb(0x05, 0x0f, 0x08);
        static readonly Color Rail = Color.FromArgb(0x0a, 0x17, 0x0f);
        static readonly Color Line = Color.FromArgb(0x1d, 0x2d, 0x22);
        static readonly Color Text1 = Color.FromArgb(0xf2, 0xf7, 0xee);
        static readonly Color Text2 = Color.FromArgb(0x9e, 0xa8, 0x9c);
        static readonly Color Signal = Color.FromArgb(0x43, 0xd0, 0x66);      // arena green: the primary action
        static readonly Color Yellow = Color.FromArgb(0xfc, 0xe3, 0x43);
        static readonly Color Ink = Color.FromArgb(0x04, 0x1c, 0x0c);         // text on the green button
        static readonly Color Bad = Color.FromArgb(0xf7, 0x5f, 0x4c);

        readonly float k;
        int page;                       // 0 добре дошъл, 1 папка, 2 инсталира, 3 готово
        string dir;
        readonly bool shortcutsWanted;
        bool runAfter;
        Image art, logo;      // resources art.png and logo.png, drawn from the brand SVGs by brand2/brand.ps1
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
            Text = Program.AppName + " Setup " + Program.Version;
            FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(S(W), S(H));
            BackColor = Back; ForeColor = Text1; DoubleBuffered = true;
            Font = new Font("Segoe UI", 9.5f);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (ArgumentException) { }
            try { Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("art.png"); if (s != null) art = Image.FromStream(s); } catch (ArgumentException) { }
            try { Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"); if (s != null) logo = Image.FromStream(s); } catch (ArgumentException) { }
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
            desk.SetBounds(S(36), S(232), S(500), S(26)); desk.Text = "Desktop and Start menu shortcuts"; desk.Checked = shortcuts; desk.ForeColor = Text1; desk.BackColor = Back; desk.FlatStyle = FlatStyle.Standard;
            run.SetBounds(S(36), S(232), S(500), S(26)); run.Text = "Start " + Program.AppName + " now"; run.Checked = runAfter; run.ForeColor = Text1; run.BackColor = Back;
            Controls.AddRange(new Control[] { next, back, cancel, path, browse, desk, run });

            next.Click += delegate { Next(); };
            back.Click += delegate { if (page == 1) Go(0); };
            cancel.Click += delegate { Close(); };
            browse.Click += delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Folder in which to create \"" + Program.AppName + "\"";
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
            b.ForeColor = primary ? Ink : Text1;
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
                    // the brand artwork fills the page (night green, the M mark); the logo and one line of what this is
                    if (art != null)
                    {
                        float ar = (float)art.Width / art.Height, w = W, h = W / ar;
                        if (h < top) { h = top; w = top * ar; }
                        g.SetClip(new Rectangle(0, 0, W, top));
                        g.DrawImage(art, (W - w) / 2f, (top - h) / 2f, w, h);
                        g.ResetClip();
                    }
                    else Stripe(g);
                    if (logo != null) { float lw = 268, lh = lw * logo.Height / logo.Width; g.DrawImage(logo, 36, 44, lw, lh); }
                    else using (Font big = Pick(new string[] { "Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", "Segoe UI Black" }, 62f, FontStyle.Regular))
                        g.DrawString(Program.AppName.ToUpperInvariant(), big, t1, 30, 30);
                    using (Font head = Pick(new string[] { "Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", "Segoe UI Semibold" }, 40f, FontStyle.Regular))
                    {
                        g.DrawString("FREE-ROAM VR", head, t1, 30, 216);
                        using (SolidBrush y = new SolidBrush(Yellow)) g.DrawString("FOR YOUR ARENA", head, y, 30, 258);
                    }
                    g.DrawString("Games, headsets and the big screen,\nrun from this computer. No cables.", body, t2, new RectangleF(36, 316, 300, 60));
                    g.DrawString("version " + Program.Version, small, t2, 36, top + 22);
                }
                else if (page == 1)
                {
                    Stripe(g);
                    g.DrawString("Where to install?", title, t1, 30, 34);
                    g.DrawString(Program.AppName + " will be installed in this folder. No administrator rights needed.", body, t2, new RectangleF(36, 92, W - 72, 44));
                    long free = FreeSpace();
                    string s = "Space needed: " + (need > 0 ? Human(need) : "unknown") + (free >= 0 ? "      Free on disk: " + Human(free) : "");
                    using (SolidBrush warn = new SolidBrush(free >= 0 && need > 0 && free < need ? Bad : Text2)) g.DrawString(s, small, warn, 36, 192);
                }
                else if (page == 2)
                {
                    Stripe(g);
                    g.DrawString("Installing", title, t1, 30, 34);
                    g.DrawString(doing, small, t2, new RectangleF(36, 150, W - 72, 22));
                    float done = (W - 72) * Math.Max(0.01f, Math.Min(1f, shown));
                    using (SolidBrush b = new SolidBrush(Line)) g.FillRectangle(b, 36, 186, W - 72, 6);
                    using (SolidBrush b = new SolidBrush(Signal)) g.FillRectangle(b, 36, 186, done, 6);
                    using (SolidBrush b = new SolidBrush(Yellow)) g.FillRectangle(b, 36 + Math.Max(0, done - 16), 186, Math.Min(16, done), 6);
                    g.DrawString((int)(Math.Min(1f, shown) * 100) + "%", body, t1, 36, 204);
                }
                else
                {
                    Stripe(g);
                    if (error == null)
                    {
                        g.DrawString(Program.AppName + " is installed", title, t1, 30, 34);
                        g.DrawString("Location: " + dir + ".\nStart it from the desktop shortcut or the Start menu.", body, t2, new RectangleF(36, 92, W - 72, 60));
                        g.DrawString("The first time it starts, Windows asks once to let the headsets through the firewall. Answer Yes; if you answer No, the Diagnose page in " + Program.AppName + " has a Fix button.", body, t2, new RectangleF(36, 156, W - 72, 66));
                    }
                    else
                    {
                        g.DrawString("Installation failed", title, t1, 30, 34);
                        using (SolidBrush bad = new SolidBrush(Bad)) g.DrawString(error, body, bad, new RectangleF(36, 92, W - 72, 200));
                    }
                }
            }
        }

        /// <summary>The brand stripe on the top edge of the inner pages: green, then yellow.</summary>
        static void Stripe(Graphics g)
        {
            using (SolidBrush b = new SolidBrush(Signal)) g.FillRectangle(b, 0, 0, W * 0.62f, 5);
            using (SolidBrush b = new SolidBrush(Yellow)) g.FillRectangle(b, W * 0.62f, 0, W * 0.38f + 1, 5);
        }

        /// <summary>/shots=folder: the four pages as PNG files, drawn off screen (for checking the look).</summary>
        public static void SaveShots(string folder, string dir)
        {
            Directory.CreateDirectory(folder);
            string[] names = { "installer-1-welcome", "installer-2-folder", "installer-3-installing", "installer-4-finish" };
            using (Wizard w = new Wizard(dir, true, true))
            {
                w.anim.Stop();
                w.ShowInTaskbar = false; w.StartPosition = FormStartPosition.Manual; w.Location = new Point(-32000, -32000);
                w.Show();
                for (int p = 0; p < 4; p++)
                {
                    if (p == 2) { w.progress = w.shown = 0.62f; w.doing = "app" + Path.DirectorySeparatorChar + "public" + Path.DirectorySeparatorChar + "play" + Path.DirectorySeparatorChar + "play.js"; }
                    w.Go(p);
                    w.Refresh(); Application.DoEvents();
                    using (Bitmap bmp = new Bitmap(w.Width, w.Height))
                    {
                        w.DrawToBitmap(bmp, new Rectangle(0, 0, w.Width, w.Height));
                        bmp.Save(Path.Combine(folder, names[p] + ".png"), System.Drawing.Imaging.ImageFormat.Png);
                    }
                }
                w.page = 0; w.installer = null;
                w.Close();
            }
        }
    }
}
