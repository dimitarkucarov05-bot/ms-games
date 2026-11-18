// MS Games for Mac: a program in the menu bar that runs the arena server (the same server.js as on Windows and in the browser).
// It starts the bundled Node with the bundled server, keeps the Mac awake while the arena runs, shows the addresses for the staff phone
// and the headsets, renews the HTTPS certificate when the Mac changes network, restarts the server if it dies, and stops it on Quit.
// Env for tests: MSGAMES_PORT, MSGAMES_TLS_PORT (other ports), MSGAMES_HOME (another folder for the data and the log).
import Cocoa
import Foundation
import Darwin

final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let fm = FileManager.default
    private let env = ProcessInfo.processInfo.environment
    private var statusItem: NSStatusItem!
    private var server: Process?
    private var stopping = false
    private var restarts = 0
    private var openedOnce = false
    private var readyTimer: Timer?
    private var activity: NSObjectProtocol?
    private let stateItem = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
    private let phoneItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let headsetItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")

    private lazy var httpPort: Int = Int(env["MSGAMES_PORT"] ?? "") ?? 47801
    private lazy var tlsPort: Int = Int(env["MSGAMES_TLS_PORT"] ?? "") ?? 47843
    private var resources: URL { Bundle.main.resourceURL! }
    private var appDir: URL { resources.appendingPathComponent("app") }
    private var nodeURL: URL { resources.appendingPathComponent("runtime/node") }
    private lazy var home: URL = {
        if let h = env["MSGAMES_HOME"], !h.isEmpty { return URL(fileURLWithPath: h) }
        return fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MS Games")
    }()
    private var dataDir: URL { home.appendingPathComponent("data") }
    private lazy var logURL: URL = {
        let base = (env["MSGAMES_HOME"] != nil) ? home.appendingPathComponent("logs") : fm.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MS Games")
        try? fm.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("server.log")
    }()

    // ---------- start ----------
    func applicationDidFinishLaunching(_ notification: Notification) {
        let me = Bundle.main.bundleIdentifier ?? "bg.arena.msgames"
        if !NSRunningApplication.runningApplications(withBundleIdentifier: me).filter({ $0 != NSRunningApplication.current }).isEmpty {
            openConsole(); NSApp.terminate(nil); return      // already running: just show the console
        }
        activity = ProcessInfo.processInfo.beginActivity(options: [.idleSystemSleepDisabled, .automaticTerminationDisabled], reason: "MS Games arena server")
        buildMenu()
        startServer()
    }

    private func buildMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            if let img = NSImage(systemSymbolName: "gamecontroller.fill", accessibilityDescription: "MS Games") { img.isTemplate = true; b.image = img } else { b.title = "MS" }
        }
        let menu = NSMenu(); menu.delegate = self
        menu.addItem(stateItem); stateItem.isEnabled = false
        menu.addItem(.separator())
        menu.addItem(item("Open the console", #selector(openConsole)))
        menu.addItem(item("Open the scan page", #selector(openScan)))
        menu.addItem(.separator())
        menu.addItem(phoneItem); phoneItem.isEnabled = false
        menu.addItem(item("Copy the phone link (camera)", #selector(copyPhoneLink)))
        menu.addItem(headsetItem); headsetItem.isEnabled = false
        menu.addItem(.separator())
        menu.addItem(item("Show the data folder", #selector(openData)))
        menu.addItem(item("Show the log", #selector(showLog)))
        menu.addItem(item("Restart the server", #selector(restartServer)))
        menu.addItem(.separator())
        menu.addItem(item("Quit MS Games", #selector(quit)))
        statusItem.menu = menu
        refreshAddresses()
    }
    private func item(_ title: String, _ action: Selector) -> NSMenuItem { let i = NSMenuItem(title: title, action: action, keyEquivalent: ""); i.target = self; return i }
    func menuWillOpen(_ menu: NSMenu) { refreshAddresses() }
    private func refreshAddresses() {
        let ip = lanIP() ?? "<IP of this Mac>"
        phoneItem.title = "Phone: https://\(ip):\(tlsPort)/scan/"
        headsetItem.title = "Headsets: https://\(ip):\(tlsPort)/play/"
    }
    private func setState(_ s: String) { stateItem.title = "MS Games: \(s)" }

    // ---------- the server ----------
    private func startServer() {
        if portOpen(httpPort) { setState("running (another copy holds the port)"); if !openedOnce { openedOnce = true; openConsole() }; return }
        guard fm.isExecutableFile(atPath: nodeURL.path) else { setState("the bundled Node is missing"); return }
        try? fm.createDirectory(at: dataDir, withIntermediateDirectories: true)
        renewCertificateIfNetworkChanged()
        if let size = (try? fm.attributesOfItem(atPath: logURL.path)[.size] as? NSNumber)?.intValue, size > 5_000_000 { try? fm.removeItem(at: logURL) }
        if !fm.fileExists(atPath: logURL.path) { fm.createFile(atPath: logURL.path, contents: nil) }
        let p = Process()
        p.executableURL = nodeURL; p.arguments = ["server.js"]; p.currentDirectoryURL = appDir
        var e = env
        e["ARENA_DATA"] = dataDir.path; e["PORT"] = "\(httpPort)"; e["TLS_PORT"] = "\(tlsPort)"; e["NO_KEEPER"] = "1"; e["MSGAMES_LAUNCHER"] = "1"
        p.environment = e
        if let h = try? FileHandle(forWritingTo: logURL) { h.seekToEndOfFile(); h.write(Data("\n--- \(Date()) start ---\n".utf8)); p.standardOutput = h; p.standardError = h }
        p.terminationHandler = { [weak self] pr in DispatchQueue.main.async { self?.serverExited(pr) } }
        do { try p.run() } catch { setState("could not start (\(error.localizedDescription))"); return }
        server = p
        setState("starting…")
        waitUntilReady()
    }
    private func waitUntilReady() {
        readyTimer?.invalidate(); var tries = 0
        readyTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] t in
            guard let self = self else { t.invalidate(); return }
            tries += 1
            if self.portOpen(self.httpPort) { t.invalidate(); self.setState("running"); if !self.openedOnce { self.openedOnce = true; self.openConsole() } }
            else if tries > 60 { t.invalidate(); self.setState("did not start (see the log)") }
        }
    }
    private func serverExited(_ p: Process) {
        if server === p { server = nil }
        if stopping { return }
        restarts += 1
        if restarts <= 5 { setState("restarting…"); DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.startServer() } }
        else { setState("stopped (see the log)") }
    }
    private func stopServer() {
        guard let p = server, p.isRunning else { server = nil; return }
        p.terminate()
        for _ in 0..<40 { if !p.isRunning { break }; usleep(100_000) }
        if p.isRunning { kill(p.processIdentifier, SIGKILL) }
        server = nil
    }
    /// The HTTPS certificate names the addresses the Mac had when it was made: a new Wi-Fi or hotspot needs a new one (the server makes it at start).
    private func renewCertificateIfNetworkChanged() {
        let tls = dataDir.appendingPathComponent("tls"); try? fm.createDirectory(at: tls, withIntermediateDirectories: true)
        let ipFile = tls.appendingPathComponent("ip.txt"), now = lanIP() ?? ""
        let old = (try? String(contentsOf: ipFile, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if old != now {
            try? fm.removeItem(at: tls.appendingPathComponent("cert.pem")); try? fm.removeItem(at: tls.appendingPathComponent("key.pem"))
            try? now.write(to: ipFile, atomically: true, encoding: .utf8)
        }
    }

    // ---------- menu actions ----------
    @objc private func openConsole() { if let u = URL(string: "http://localhost:\(httpPort)") { NSWorkspace.shared.open(u) } }
    @objc private func openScan() { if let u = URL(string: "http://localhost:\(httpPort)/scan/") { NSWorkspace.shared.open(u) } }
    @objc private func copyPhoneLink() {
        let link = "https://\(lanIP() ?? "localhost"):\(tlsPort)/scan/"
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(link, forType: .string)
    }
    @objc private func openData() { try? fm.createDirectory(at: dataDir, withIntermediateDirectories: true); NSWorkspace.shared.open(dataDir) }
    @objc private func showLog() { NSWorkspace.shared.open(logURL) }
    @objc private func restartServer() {
        setState("restarting…"); restarts = 0
        DispatchQueue.global().async { [weak self] in
            self?.stopServer()
            DispatchQueue.main.async { self?.startServer() }
        }
    }
    @objc private func quit() { NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { stopping = true; stopServer() }

    // ---------- network helpers ----------
    private func portOpen(_ port: Int) -> Bool {
        let s = socket(AF_INET, SOCK_STREAM, 0)
        if s < 0 { return false }
        defer { close(s) }
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size); addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(UInt16(port)).bigEndian; addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        var tv = timeval(tv_sec: 1, tv_usec: 0)
        setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        return withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } } == 0
    }
    /// The Wi-Fi or Ethernet address of this Mac (never a link-local 169.254.x.x one).
    private func lanIP() -> String? {
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return nil }
        defer { freeifaddrs(list) }
        var other: String?
        for p in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let a = p.pointee
            guard let sa = a.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET), (a.ifa_flags & UInt32(IFF_UP)) != 0, (a.ifa_flags & UInt32(IFF_LOOPBACK)) == 0 else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
            let ip = String(cString: host)
            if ip.hasPrefix("169.254.") { continue }
            if String(cString: a.ifa_name).hasPrefix("en") { return ip }
            if other == nil { other = ip }
        }
        return other
    }
}

let app = NSApplication.shared
let controller = Controller()
app.delegate = controller
app.setActivationPolicy(.accessory)
// a plain kill (or Ctrl+C in a terminal) must also stop the server it started, not leave it holding the port
var signalSources: [DispatchSourceSignal] = []
for sig in [SIGTERM, SIGINT, SIGHUP] {
    signal(sig, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler { NSApp.terminate(nil) }
    src.resume()
    signalSources.append(src)
}
app.run()
