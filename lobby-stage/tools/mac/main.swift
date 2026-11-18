// MS Games for Mac: a real program with its own window (the console is shown INSIDE it, not in a browser) that also runs the arena server
// (the same server.js as on Windows). Dock icon, main menu, Cmd+Q; a small menu-bar icon keeps the phone and headset addresses at hand.
// It starts the bundled Node with the bundled server, keeps the Mac awake while the arena runs, shows the addresses for the staff phone
// and the headsets, renews the HTTPS certificate when the Mac changes network, restarts the server if it dies, and stops it on Quit.
// Env for tests: MSGAMES_PORT, MSGAMES_TLS_PORT (other ports), MSGAMES_HOME (another folder for the data and the log).
import Cocoa
import WebKit
import Foundation
import Darwin

final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let fm = FileManager.default
    private let env = ProcessInfo.processInfo.environment
    private var statusItem: NSStatusItem!
    private var server: Process?
    private var stopping = false
    private var restarts = 0
    private var openedOnce = false
    private var readyTimer: Timer?
    private var activity: NSObjectProtocol?
    private var mainWindow: NSWindow?
    private var mainWeb: WKWebView?
    private var extraWindows: [NSWindow] = []
    private var serverReady = false
    private var consoleRetry = 0
    private let selftestPNG = ProcessInfo.processInfo.environment["MSGAMES_SELFTEST_PNG"]
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
        if !NSRunningApplication.runningApplications(withBundleIdentifier: me).filter({ $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }).isEmpty {
            openConsole(); NSApp.terminate(nil); return      // already running: the other copy shows its window
        }
        activity = ProcessInfo.processInfo.beginActivity(options: [.idleSystemSleepDisabled, .automaticTerminationDisabled], reason: "MS Games arena server")
        buildMainMenu()
        buildMenu()
        showConsole()
        startServer()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showConsole(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    private func buildMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            if let img = NSImage(systemSymbolName: "gamecontroller.fill", accessibilityDescription: "MS Games") { img.isTemplate = true; b.image = img } else { b.title = "MS" }
        }
        let menu = NSMenu(); menu.delegate = self
        menu.addItem(stateItem); stateItem.isEnabled = false
        menu.addItem(.separator())
        menu.addItem(item("Show the console window", #selector(showConsole)))
        menu.addItem(item("Open the scan window", #selector(openScan)))
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
        if portOpen(httpPort) { setState("running (another copy holds the port)"); serverReady = true; loadConsole(); return }
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
            if self.portOpen(self.httpPort) { t.invalidate(); self.setState("running"); self.serverReady = true; self.loadConsole() }
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


    // ---------- the windows (the console lives inside the program) ----------
    private func makeWeb(_ config: WKWebViewConfiguration? = nil) -> WKWebView {
        let c = config ?? WKWebViewConfiguration()
        if config == nil {
            c.mediaTypesRequiringUserActionForPlayback = []
            c.preferences.setValue(true, forKey: "developerExtrasEnabled")
            if #available(macOS 12.3, *) { c.preferences.isElementFullscreenEnabled = true }
        }
        let w = WKWebView(frame: .zero, configuration: c)
        w.navigationDelegate = self; w.uiDelegate = self
        w.allowsBackForwardNavigationGestures = true
        return w
    }
    private func placeholder(_ text: String) -> String {
        "<html><body style='margin:0;background:#150a1c;color:#f5f0fa;font:600 22px -apple-system;display:grid;place-items:center;height:100vh'><div style='text-align:center'><div style='font-size:64px;letter-spacing:4px'>MS GAMES</div><div style='margin-top:14px;color:#b894ee'>\(text)</div></div></body></html>"
    }
    @objc private func showConsole() {
        if mainWindow == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1360, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            w.title = "MS Games"; w.isReleasedWhenClosed = false; w.minSize = NSSize(width: 900, height: 600)
            w.center(); w.setFrameAutosaveName("MSGamesMain")
            let web = makeWeb(); w.contentView = web
            mainWindow = w; mainWeb = web
            web.loadHTMLString(placeholder("Starting the server…"), baseURL: nil)
            if serverReady { loadConsole() }
        }
        mainWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    private func loadConsole() {
        guard let web = mainWeb, let u = URL(string: "http://localhost:\(httpPort)") else { return }
        consoleRetry = 0
        web.load(URLRequest(url: u))
    }
    @objc private func openScan() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        w.title = "Scan a player"; w.isReleasedWhenClosed = false; w.center()
        let web = makeWeb(); w.contentView = web
        if let u = URL(string: "http://localhost:\(httpPort)/scan/") { web.load(URLRequest(url: u)) }
        extraWindows.append(w); w.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    @objc private func openInBrowser() { openConsole() }
    @objc private func reloadPage() { (NSApp.keyWindow?.contentView as? WKWebView ?? mainWeb)?.reload() }
    @objc private func zoomIn() { if let w = NSApp.keyWindow?.contentView as? WKWebView { w.pageZoom = min(w.pageZoom + 0.1, 3) } }
    @objc private func zoomOut() { if let w = NSApp.keyWindow?.contentView as? WKWebView { w.pageZoom = max(w.pageZoom - 0.1, 0.4) } }
    @objc private func zoomReset() { if let w = NSApp.keyWindow?.contentView as? WKWebView { w.pageZoom = 1 } }

    private func buildMainMenu() {
        let main = NSMenu()
        func add(_ menu: NSMenu, _ title: String, _ action: Selector?, _ key: String = "", target: AnyObject? = nil, _ mods: NSEvent.ModifierFlags = [.command]) {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.target = target; i.keyEquivalentModifierMask = mods; menu.addItem(i)
        }
        func submenu(_ title: String) -> NSMenu { let m = NSMenu(title: title); let i = NSMenuItem(title: title, action: nil, keyEquivalent: ""); i.submenu = m; main.addItem(i); return m }
        let app = submenu("MS Games")
        add(app, "About MS Games", #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
        app.addItem(.separator())
        add(app, "Copy the phone link (camera)", #selector(copyPhoneLink), "l", target: self, [.command, .shift])
        add(app, "Show the data folder", #selector(openData), target: self)
        add(app, "Show the log", #selector(showLog), target: self)
        add(app, "Restart the server", #selector(restartServer), target: self)
        app.addItem(.separator())
        add(app, "Hide MS Games", #selector(NSApplication.hide(_:)), "h")
        add(app, "Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option])
        add(app, "Show All", #selector(NSApplication.unhideAllApplications(_:)))
        app.addItem(.separator())
        add(app, "Quit MS Games", #selector(NSApplication.terminate(_:)), "q")
        let edit = submenu("Edit")
        add(edit, "Undo", Selector(("undo:")), "z"); add(edit, "Redo", Selector(("redo:")), "z", [.command, .shift]); edit.addItem(.separator())
        add(edit, "Cut", #selector(NSText.cut(_:)), "x"); add(edit, "Copy", #selector(NSText.copy(_:)), "c"); add(edit, "Paste", #selector(NSText.paste(_:)), "v"); add(edit, "Select All", #selector(NSText.selectAll(_:)), "a")
        let view = submenu("View")
        add(view, "Reload", #selector(reloadPage), "r", target: self)
        add(view, "Actual Size", #selector(zoomReset), "0", target: self); add(view, "Zoom In", #selector(zoomIn), "=", target: self); add(view, "Zoom Out", #selector(zoomOut), "-", target: self)
        view.addItem(.separator())
        add(view, "Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])
        add(view, "Open the console in the browser", #selector(openInBrowser), target: self)
        let win = submenu("Window")
        add(win, "Console", #selector(showConsole), "1", target: self)
        add(win, "Scan a player", #selector(openScan), "2", target: self)
        win.addItem(.separator())
        add(win, "Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"); add(win, "Close", #selector(NSWindow.performClose(_:)), "w")
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }

    // ---------- web view delegates ----------
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // a link that opens a new window (the TV page, a scorecard, the board): another window of the program
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 780), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        w.isReleasedWhenClosed = false; w.center()
        let web = makeWeb(configuration); w.contentView = web
        extraWindows.append(w); w.makeKeyAndOrderFront(nil)
        return web
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = navigationAction.request.url, u.scheme == "http" || u.scheme == "https", let host = u.host, host != "localhost", host != "127.0.0.1", navigationAction.targetFrame?.isMainFrame != false, !(u.port == tlsPort) {
            NSWorkspace.shared.open(u); decisionHandler(.cancel); return      // somebody else's website: the browser
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = navigationResponse.response as? HTTPURLResponse, (http.value(forHTTPHeaderField: "Content-Disposition") ?? "").lowercased().contains("attachment") { decisionHandler(.download); return }
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = fm.urls(for: .downloadsDirectory, in: .userDomainMask)[0], base = (suggestedFilename as NSString).deletingPathExtension, ext = (suggestedFilename as NSString).pathExtension
        var dest = dir.appendingPathComponent(suggestedFilename), n = 1
        while fm.fileExists(atPath: dest.path) { dest = dir.appendingPathComponent("\(base) \(n)" + (ext.isEmpty ? "" : ".\(ext)")); n += 1 }
        completionHandler(dest)
    }
    func downloadDidFinish(_ download: WKDownload) { NSSound.beep() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === mainWeb, consoleRetry < 40 else { return }      // the server was not up yet: try again
        consoleRetry += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in if let s = self, let u = URL(string: "http://localhost:\(s.httpPort)") { webView.load(URLRequest(url: u)) } }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === mainWeb, let out = selftestPNG, webView.url?.host == "localhost" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                webView.evaluateJavaScript("document.title") { title, _ in
                    webView.takeSnapshot(with: nil) { image, _ in
                        if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: out)) }
                        print("SELFTEST window loaded, title=\(title ?? "?"), snapshot=\(out)")
                        fflush(stdout); NSApp.terminate(nil)
                    }
                }
            }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel"); completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "localhost" || origin.host == "127.0.0.1" ? .grant : .prompt)      // the camera for the scan page
    }

    // ---------- menu actions ----------
    @objc private func openConsole() { if let u = URL(string: "http://localhost:\(httpPort)") { NSWorkspace.shared.open(u) } }
        @objc private func copyPhoneLink() {
        let link = "https://\(lanIP() ?? "localhost"):\(tlsPort)/scan/"
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(link, forType: .string)
    }
    @objc private func openData() { try? fm.createDirectory(at: dataDir, withIntermediateDirectories: true); NSWorkspace.shared.open(dataDir) }
    @objc private func showLog() { NSWorkspace.shared.open(logURL) }
    @objc private func restartServer() {
        setState("restarting…"); restarts = 0; serverReady = false
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
app.setActivationPolicy(.regular)
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
