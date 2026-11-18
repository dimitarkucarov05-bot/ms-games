// VR Varna Карти — редактор на карти отгоре (Джак, 13.11.2026).
// Прозорец с вградения editor.html (WKWebView). Мост „app“: open / save / exportPng / build.
// „Построй в Unreal“ строи НОВА карта чрез Scripts/map_from_json.py (headless Unreal); съществуваща карта не се пипа.
import Cocoa
import UniformTypeIdentifiers
import WebKit

let root = NSString(string: "~/VR-Arena").expandingTildeInPath
let mapsDir = root + "/team/maps"
let ueBin = "/Users/Shared/Epic Games/UE_5.6/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
let project = root + "/VRArena/VRArena.uproject"
let buildScript = root + "/VRArena/Scripts/map_from_json.py"

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var building = false

    func applicationDidFinishLaunching(_ n: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "app")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.uiDelegate = self
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1500, height: 960),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "VR Varna — Карти"
        window.minSize = NSSize(width: 1000, height: 650)
        window.setFrameAutosaveName("VRVarnaMapsWindow")
        if !window.setFrameUsingName("VRVarnaMapsWindow") { window.center() }
        window.contentView = web
        if let url = Bundle.main.url(forResource: "editor", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        try? FileManager.default.createDirectory(atPath: mapsDir, withIntermediateDirectories: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }

    // ---------- мостът от JS
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let d = m.body as? [String: Any], let cmd = d["cmd"] as? String else { return }
        switch cmd {
        case "open": openMap(nil)
        case "save": saveJSON(d["json"], suggested: d["suggested"] as? String ?? "karta.json")
        case "exportPng": savePNG(d["dataUrl"] as? String ?? "", suggested: d["suggested"] as? String ?? "karta.png")
        case "build": build(d["json"], mapName: d["mapName"] as? String ?? "")
        case "autosave": autosave(d["json"])
        case "clipboard":
            if let t = d["text"] as? String {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(t, forType: .string)
            }
        default: break
        }
    }

    func js(_ s: String) { web.evaluateJavaScript(s, completionHandler: nil) }
    func status(_ t: String) {
        let esc = t.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'").replacingOccurrences(of: "\n", with: "\\n")
        js("window.buildStatus && window.buildStatus('\(esc)')")
    }

    @objc func openMap(_ sender: Any?) {
        let p = NSOpenPanel()
        p.allowedContentTypes = [.json]
        p.directoryURL = URL(fileURLWithPath: mapsDir)
        guard p.runModal() == .OK, let u = p.url else { return }
        load(u)
    }

    func load(_ u: URL) {
        guard let data = try? Data(contentsOf: u), let s = String(data: data, encoding: .utf8) else { return }
        let name = u.lastPathComponent.replacingOccurrences(of: "'", with: "")
        js("window.mapLoad && window.mapLoad(\(s), '\(name)')")
        window.title = "VR Varna — Карти · " + name
    }

    @objc func openPlanB(_ s: Any?) { load(URL(fileURLWithPath: mapsDir + "/plan_B_karti.json")) }
    @objc func openG20(_ s: Any?) { load(URL(fileURLWithPath: mapsDir + "/gradche20_karti.json")) }
    // ---------- автозапис: _avtozapis.json + 5 предишни копия (_avtozapis_1 … _5)
    var lastAutosave = Date.distantPast
    func autosave(_ obj: Any?) {
        guard let data = jsonData(obj) else { return }
        let fm = FileManager.default
        let base = mapsDir + "/_avtozapis"
        if Date().timeIntervalSince(lastAutosave) > 60 {   // копие най-много веднъж в минута
            lastAutosave = Date()
            for i in stride(from: 4, through: 1, by: -1) {
                let a = base + "_\(i).json", b = base + "_\(i + 1).json"
                if fm.fileExists(atPath: a) { try? fm.removeItem(atPath: b); try? fm.copyItem(atPath: a, toPath: b) }
            }
            if fm.fileExists(atPath: base + ".json") { try? fm.removeItem(atPath: base + "_1.json"); try? fm.copyItem(atPath: base + ".json", toPath: base + "_1.json") }
        }
        try? data.write(to: URL(fileURLWithPath: base + ".json"), options: .atomic)
    }
    @objc func restoreLast(_ s: Any?) {
        let f = mapsDir + "/_avtozapis.json"
        if FileManager.default.fileExists(atPath: f) { load(URL(fileURLWithPath: f)) }
        else { status("Няма автозапис още.") }
    }
    func webView(_ w: WKWebView, didFinish nav: WKNavigation!) {   // при отваряне — последната работа
        // каталогът с обектите (Тони) — в Resources до editor.html; подаваме го директно (fetch на file:// в WKWebView не върви)
        if let kp = Bundle.main.path(forResource: "katalog_obekti", ofType: "json"),
           let kd = FileManager.default.contents(atPath: kp), let ks = String(data: kd, encoding: .utf8) {
            w.evaluateJavaScript("window.katalogLoad && window.katalogLoad(\(ks))", completionHandler: nil)
        }
        if FileManager.default.fileExists(atPath: mapsDir + "/_avtozapis.json") { restoreLast(nil) }
    }

    @objc func openProba(_ s: Any?) { load(URL(fileURLWithPath: mapsDir + "/proba_vartene.json")) }
    @objc func openCurrent(_ s: Any?) { load(URL(fileURLWithPath: mapsDir + "/tekushta_karta.json")) }

    func jsonData(_ obj: Any?) -> Data? {
        if let str = obj as? String, let d = str.data(using: .utf8),   // karti.html праща JSON низ
           let o = try? JSONSerialization.jsonObject(with: d), JSONSerialization.isValidJSONObject(o) {
            return try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted, .sortedKeys])
        }
        guard let o = obj, JSONSerialization.isValidJSONObject(o) else { return nil }
        return try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted, .sortedKeys])
    }

    func saveJSON(_ obj: Any?, suggested: String) {
        guard let data = jsonData(obj) else { return }
        let p = NSSavePanel()
        p.allowedContentTypes = [.json]
        p.directoryURL = URL(fileURLWithPath: mapsDir)
        p.nameFieldStringValue = suggested
        guard p.runModal() == .OK, let u = p.url else { return }
        try? data.write(to: u)
        window.title = "VR Varna — Карти · " + u.lastPathComponent
    }

    func savePNG(_ dataUrl: String, suggested: String) {
        guard let comma = dataUrl.firstIndex(of: ","), let data = Data(base64Encoded: String(dataUrl[dataUrl.index(after: comma)...])) else { return }
        let p = NSSavePanel()
        p.allowedContentTypes = [.png]
        p.directoryURL = URL(fileURLWithPath: mapsDir)
        p.nameFieldStringValue = suggested
        guard p.runModal() == .OK, let u = p.url else { return }
        try? data.write(to: u)
    }

    // ---------- „Построй в Unreal“ — НОВА карта
    func unrealCopies() -> Int {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/ps")
        p.arguments = ["-axo", "command"]
        let pipe = Pipe()
        p.standardOutput = pipe
        try? p.run()
        // Бос 15.11: първо четем, после чакаме — иначе голям изход на ps пълни тръбата и програмата замръзва
        let raw = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        let out = String(data: raw, encoding: .utf8) ?? ""
        return out.split(separator: "\n").filter { $0.contains("MacOS/UnrealEditor ") }.count
    }

    func build(_ obj: Any?, mapName: String) {
        guard !building else { status("Вече строя — изчакай."); return }
        let ok = mapName.range(of: "^[A-Za-z][A-Za-z0-9_]{2,40}$", options: .regularExpression) != nil
        guard ok else { status("Името трябва да е латиница/цифри/_ (3–41 знака)."); return }
        guard let data = jsonData(obj) else { status("Картата е празна или повредена."); return }
        let existing = root + "/VRArena/Content/Maps/\(mapName).umap"
        if FileManager.default.fileExists(atPath: existing) {
            status("Карта \(mapName) вече има — избери друго име. Съществуващи карти не се пипат."); return
        }
        let n = unrealCopies()
        if n >= 2 { status("Вече вървят \(n) копия на Unreal (лимит 2). Опитай по-късно."); return }
        let a = NSAlert()
        a.messageText = "Да построя ли НОВА карта „\(mapName)“ в Unreal?"
        a.informativeText = "Прави се копие на Arena6x6_Synty под новото име и в него се слагат кутиите от тази схема. Съществуващите карти, лобито и калибровката не се пипат. Отнема 1–3 мин."
        a.addButton(withTitle: "Построй")
        a.addButton(withTitle: "Отказ")
        guard a.runModal() == .alertFirstButtonReturn else { return }
        let jsonPath = mapsDir + "/\(mapName).json"
        try? data.write(to: URL(fileURLWithPath: jsonPath))
        building = true
        status("Строя \(mapName)… (Unreal без прозорец, 1–3 мин)")
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        p.arguments = ["-e", "alarm 900; exec @ARGV", ueBin, project, "-RenderOffscreen", "-Unattended", "-NoSplash", "-stdout",
                       "-ExecCmds=py \(buildScript)"]
        var env = ProcessInfo.processInfo.environment
        env["MAP_JSON"] = jsonPath
        env["MAP_NAME"] = mapName
        p.environment = env
        let logURL = URL(fileURLWithPath: root + "/VRArena/Saved/Logs/mapjson_\(mapName).log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        if let fh = try? FileHandle(forWritingTo: logURL) { p.standardOutput = fh; p.standardError = fh }
        p.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { self?.buildDone(mapName, log: logURL) }
        }
        do { try p.run() } catch { building = false; status("Unreal не тръгна: \(error.localizedDescription)") }
    }

    func buildDone(_ mapName: String, log: URL) {
        building = false
        let out = root + "/team/reports/karti/\(mapName)"
        let rep = out + "/build.json"
        let text = (try? String(contentsOf: log, encoding: .utf8)) ?? ""
        if let line = text.split(separator: "\n").first(where: { $0.contains("SYNTY mapjson ОТКАЗ") }) {
            status("Отказ: " + String(line.split(separator: "ОТКАЗ").last ?? "")); return
        }
        guard let d = try? Data(contentsOf: URL(fileURLWithPath: rep)),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else {
            status("Не се построи — виж лога: \(log.path)"); return
        }
        let saved = (j["saved"] as? Bool) == true
        let boxes = (j["boxes"] as? [Any])?.count ?? 0
        let narrow = (j["narrow"] as? [Any])?.count ?? 0
        status(saved ? "Готово: /Game/Maps/\(mapName) — \(boxes) кутии, тесни места \(narrow). Снимка отгоре: \(out)/otgore_editor.png"
                     : "Картата НЕ е записана — виж \(rep)")
        if saved { NSWorkspace.shared.open(URL(fileURLWithPath: out)) }
    }

    // ---------- диалозите на JS
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.runModal(); completionHandler()
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Отказ")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText d: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = p
        let t = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24)); t.stringValue = d ?? ""
        a.accessoryView = t; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Отказ")
        a.window.initialFirstResponder = t
        completionHandler(a.runModal() == .alertFirstButtonReturn ? t.stringValue : nil)
    }

    // ---------- „Редакция“ → редактора (WKWebView иначе гълта клавишите)
    func editorCmd(_ name: String, _ arg: String? = nil) {
        var a = "null"
        if let t = arg, let d = try? JSONSerialization.data(withJSONObject: [t]), let s = String(data: d, encoding: .utf8) {
            a = String(s.dropFirst().dropLast())   // JSON низ с кавичките
        }
        js("window.editorCmd && window.editorCmd('\(name)', \(a))")
    }
    @objc func eUndo(_ s: Any?) { editorCmd("undo") }
    @objc func eRedo(_ s: Any?) { editorCmd("redo") }
    @objc func eCut(_ s: Any?) { editorCmd("cut") }
    @objc func eCopy(_ s: Any?) { editorCmd("copy") }
    @objc func ePaste(_ s: Any?) { editorCmd("paste", NSPasteboard.general.string(forType: .string)) }
    @objc func eSelectAll(_ s: Any?) { editorCmd("selectAll") }
    @objc func eDuplicate(_ s: Any?) { editorCmd("duplicate") }

    // ---------- меню
    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Изход от VR Varna Карти", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let fileItem = NSMenuItem(); main.addItem(fileItem)
        let file = NSMenu(title: "Файл")
        let o = file.addItem(withTitle: "Отвори…", action: #selector(openMap(_:)), keyEquivalent: "o"); o.target = self
        let rl = file.addItem(withTitle: "Възстанови последната работа", action: #selector(restoreLast(_:)), keyEquivalent: "r"); rl.keyEquivalentModifierMask = [.command, .shift]; rl.target = self
        let b = file.addItem(withTitle: "Отвори схемата Градче (plan_B)", action: #selector(openPlanB(_:)), keyEquivalent: ""); b.target = self
        let g = file.addItem(withTitle: "Отвори Градче 20×20", action: #selector(openG20(_:)), keyEquivalent: ""); g.target = self
        let t = file.addItem(withTitle: "Отвори текущата карта на залата", action: #selector(openCurrent(_:)), keyEquivalent: "t"); t.target = self
        let pr = file.addItem(withTitle: "Отвори пробата (въртене и мащаб)", action: #selector(openProba(_:)), keyEquivalent: ""); pr.target = self
        fileItem.submenu = file
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Редакция")
        func item(_ t: String, _ sel: Selector, _ k: String, _ mods: NSEvent.ModifierFlags = [.command]) {
            let i = edit.addItem(withTitle: t, action: sel, keyEquivalent: k)
            i.keyEquivalentModifierMask = mods
            i.target = self
        }
        item("Отмени", #selector(eUndo(_:)), "z")
        item("Повтори", #selector(eRedo(_:)), "z", [.command, .shift])
        edit.addItem(.separator())
        item("Изрежи", #selector(eCut(_:)), "x")
        item("Копирай", #selector(eCopy(_:)), "c")
        item("Постави", #selector(ePaste(_:)), "v")
        item("Дублирай", #selector(eDuplicate(_:)), "d")
        item("Избери всичко", #selector(eSelectAll(_:)), "a")
        editItem.submenu = edit
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
