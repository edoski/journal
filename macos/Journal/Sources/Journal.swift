import AppKit
import Carbon
import Foundation

final class KeyWindow: NSWindow {
    var onCancel: (() -> Void)?

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    override func cancelOperation(_ sender: Any?) {
        onCancel?()
    }
}

final class ActionButton: NSButton {
    override var acceptsFirstResponder: Bool { true }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == UInt16(kVK_Escape) {
            window?.cancelOperation(nil)
            return
        }
        if event.keyCode == UInt16(kVK_Return) ||
            event.keyCode == UInt16(kVK_ANSI_KeypadEnter) {
            performClick(nil)
            return
        }
        super.keyDown(with: event)
    }
}

struct CommandResult {
    let status: Int32
    let output: String
}

struct FlowDurations {
    let flow: Int
    let shortBreak: Int
    let longBreak: Int

    func seconds(for phase: String) -> Int? {
        let normalized = phase.lowercased()
        if normalized.contains("long") && normalized.contains("break") {
            return longBreak * 60
        }
        if normalized.contains("break") {
            return shortBreak * 60
        }
        if normalized.contains("flow") {
            return flow * 60
        }
        return nil
    }
}

struct FlowStateReader {
    private let preferencesURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(
            "Library/Containers/design.yugen.Flow/Data/Library/Preferences/design.yugen.Flow.plist"
        )

    func durations() -> FlowDurations? {
        guard let data = try? Data(contentsOf: preferencesURL),
              let preferences = try? PropertyListSerialization.propertyList(
                  from: data,
                  format: nil
              ) as? [String: Any],
              let flow = preferences["flow.durationInMinutes"] as? NSNumber,
              let shortBreak = preferences["shortBreak.durationInMinutes"] as? NSNumber,
              let longBreak = preferences["longBreak.durationInMinutes"] as? NSNumber else {
            return nil
        }
        return FlowDurations(
            flow: flow.intValue,
            shortBreak: shortBreak.intValue,
            longBreak: longBreak.intValue
        )
    }

    func canSkip(phase: String, remainingTime: String) -> Bool? {
        guard let duration = durations()?.seconds(for: phase),
              let remaining = Self.seconds(in: remainingTime) else {
            return nil
        }
        return remaining != duration
    }

    private static func seconds(in time: String) -> Int? {
        let components = time.split(separator: ":")
        guard (2...3).contains(components.count) else { return nil }
        return components.reduce(0) { total, component in
            guard let value = Int(component) else { return -1 }
            return total < 0 ? total : total * 60 + value
        }.nonnegative
    }
}

private extension Int {
    var nonnegative: Int? { self >= 0 ? self : nil }
}

struct UndoPreview: Decodable {
    let title: String
    let startedAt: String?
    let durationMinutes: Double
    let status: String

    func summary(associatedBreakCount: Int) -> String {
        let duration = durationMinutes.rounded() == durationMinutes
            ? String(Int(durationMinutes))
            : String(durationMinutes)
        let displayStatus = status == "in-progress" ? "In progress" : "Completed"
        var lines = [
            "Title:     \(title.isEmpty ? "(no title)" : title)",
            "Started:   \(startedAt ?? "Unknown")",
            "Duration:  \(duration) min (planned)",
            "Status:    \(displayStatus)",
        ]
        if associatedBreakCount > 0 {
            let noun = associatedBreakCount == 1 ? "break" : "breaks"
            lines.append("Also deletes: \(associatedBreakCount) associated \(noun)")
        }
        return lines.joined(separator: "\n")
    }
}

struct UndoPreviewEnvelope: Decodable {
    let session: UndoPreview?
    let associatedBreakCount: Int
}

enum JournalUndoError: LocalizedError {
    case command(String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case let .command(output):
            return output
        case .invalidResponse:
            return "jundo returned an invalid preview."
        }
    }
}

final class JournalUndoRunner {
    private let queue = DispatchQueue(label: "com.edo.journal.undo")

    func preview(
        completion: @escaping (Result<UndoPreviewEnvelope, JournalUndoError>) -> Void
    ) {
        queue.async { [self] in
            let result = execute(arguments: ["--json"])
            let preview: Result<UndoPreviewEnvelope, JournalUndoError>
            if result.status != 0 {
                preview = .failure(.command(result.output))
            } else {
                let decoder = JSONDecoder()
                decoder.keyDecodingStrategy = .convertFromSnakeCase
                guard let data = result.output.data(using: .utf8),
                      let envelope = try? decoder.decode(
                          UndoPreviewEnvelope.self,
                          from: data
                      ) else {
                    DispatchQueue.main.async {
                        completion(.failure(.invalidResponse))
                    }
                    return
                }
                preview = .success(envelope)
            }
            DispatchQueue.main.async {
                completion(preview)
            }
        }
    }

    func confirm(completion: @escaping (CommandResult) -> Void) {
        queue.async { [self] in
            let result = execute(arguments: ["--confirm"])
            DispatchQueue.main.async {
                completion(result)
            }
        }
    }

    private func execute(arguments: [String]) -> CommandResult {
        BundledPython.runCaptured(
            arguments: ["session", "undo"] + arguments,
            startErrorPrefix: "Could not start jundo",
            unreadableOutput: "jundo returned unreadable output."
        )
    }
}

enum BundledPython {
    private static func process(arguments: [String]) throws -> Process {
        guard let resources = Bundle.main.resourceURL else {
            throw CocoaError(.fileNoSuchFile)
        }

        let pythonHome = resources.appendingPathComponent("Python")
        let process = Process()
        process.currentDirectoryURL = resources.appendingPathComponent("JournalSync")
        process.executableURL = pythonHome.appendingPathComponent("bin/python3")
        process.arguments = ["-m", "sync.run"] + arguments

        var environment = ProcessInfo.processInfo.environment
        environment["PYTHONHOME"] = pythonHome.path
        environment["PYTHONPATH"] = resources
            .appendingPathComponent("JournalSync")
            .path
        environment["PYTHONNOUSERSITE"] = "1"
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        process.environment = environment
        return process
    }

    static func runCaptured(
        arguments: [String],
        startErrorPrefix: String,
        unreadableOutput: String
    ) -> CommandResult {
        let output = Pipe()
        do {
            let process = try process(arguments: arguments)
            process.standardOutput = output
            process.standardError = output
            try process.run()
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return CommandResult(
                status: process.terminationStatus,
                output: String(data: data, encoding: .utf8) ?? unreadableOutput
            )
        } catch {
            return CommandResult(
                status: 1,
                output: "\(startErrorPrefix):\n\(error.localizedDescription)"
            )
        }
    }

    static func runAttached(arguments: [String]) -> Int32 {
        do {
            let process = try process(arguments: arguments)
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus
        } catch {
            FileHandle.standardError.write(
                Data("Could not start Journal command: \(error.localizedDescription)\n".utf8)
            )
            return 1
        }
    }
}

final class PromptController: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
    private enum FlowActivity: Equatable {
        case paused
        case running
    }

    private static let titleSize = NSSize(width: 504, height: 98)
    private static let undoSize = NSSize(width: 420, height: 210)

    private let panel = KeyWindow(
        contentRect: NSRect(origin: .zero, size: titleSize),
        styleMask: [.borderless],
        backing: .buffered,
        defer: false
    )
    private let titleView = NSView(frame: NSRect(origin: .zero, size: titleSize))
    private let field = NSTextField(frame: NSRect(x: 14, y: 56, width: 476, height: 28))
    private let pauseResumeButton = ActionButton(frame: NSRect(x: 14, y: 12, width: 148, height: 30))
    private let skipButton = ActionButton(frame: NSRect(x: 178, y: 12, width: 148, height: 30))
    private let undoButton = ActionButton(frame: NSRect(x: 342, y: 12, width: 148, height: 30))
    private let undoView = NSView(frame: NSRect(origin: .zero, size: undoSize))
    private let undoTextView = NSTextView()
    private let undoScrollView = NSScrollView(frame: NSRect(x: 16, y: 60, width: 388, height: 134))
    private let cancelUndoButton = ActionButton(frame: NSRect(x: 78, y: 14, width: 126, height: 32))
    private let confirmUndoButton = ActionButton(frame: NSRect(x: 216, y: 14, width: 126, height: 32))
    private let reminderPanel = NSPanel(
        contentRect: NSRect(x: 0, y: 0, width: 460, height: 136),
        styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered,
        defer: false
    )
    private let reminderLabel = NSTextField(labelWithString: "")
    private var currentTitle = "Session title"
    private var previousApplication: NSRunningApplication?
    private var lastExternalApplication: NSRunningApplication?
    private var escapeHotKey: EventHotKeyRef?
    private var returnHotKey: EventHotKeyRef?
    private var keypadEnterHotKey: EventHotKeyRef?
    private var reminderHotKeyHandler: EventHandlerRef?
    private var reminderEventTap: CFMachPort?
    private var reminderEventTapSource: CFRunLoopSource?
    private var superPrefixTime: TimeInterval?
    private var reminderMonitor: DispatchSourceTimer?
    private var undoRequestID = 0
    private var skipStateRequestID = 0
    private var flowActivity: FlowActivity?
    private var flowCanSkip: Bool?
    private let flowAutomationQueue = DispatchQueue(label: "com.edo.FlowTitle.automation")
    private let journalUndoRunner = JournalUndoRunner()
    private let flowStateReader = FlowStateReader()
    private let flowTimeScript = NSAppleScript(
        source: "tell application \"Flow\" to getTime"
    )!
    private let flowPhaseScript = NSAppleScript(
        source: "tell application \"Flow\" to getPhase"
    )!
    private let flowTitleScript = NSAppleScript(
        source: "tell application \"Flow\" to getTitle"
    )!
    private let flowStartScript = NSAppleScript(
        source: "tell application \"Flow\" to start"
    )!
    private let flowStopScript = NSAppleScript(
        source: "tell application \"Flow\" to stop"
    )!
    private let flowSkipScript = NSAppleScript(
        source: "tell application \"Flow\" to skip"
    )!

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !CGPreflightListenEventAccess() {
            CGRequestListenEventAccess()
        }

        let mainMenu = NSMenu()
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(
            title: "Paste",
            action: #selector(NSText.paste(_:)),
            keyEquivalent: "v"
        ))
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)
        NSApplication.shared.mainMenu = mainMenu

        panel.isReleasedWhenClosed = false
        panel.level = .floating
        panel.hasShadow = true
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.contentView?.wantsLayer = true
        panel.contentView?.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        panel.contentView?.layer?.cornerRadius = 10
        panel.contentView?.layer?.masksToBounds = true
        panel.onCancel = { [weak self] in
            self?.hide()
        }

        field.placeholderString = currentTitle
        field.font = .systemFont(ofSize: 15)
        field.bezelStyle = .roundedBezel
        field.delegate = self
        field.target = self
        field.action = #selector(confirmTitle)
        titleView.addSubview(field)

        pauseResumeButton.title = "Pause / Resume"
        pauseResumeButton.bezelStyle = .rounded
        pauseResumeButton.target = self
        pauseResumeButton.action = #selector(toggleSession)
        titleView.addSubview(pauseResumeButton)

        skipButton.title = "Skip"
        skipButton.bezelStyle = .rounded
        skipButton.target = self
        skipButton.action = #selector(skipSession)
        titleView.addSubview(skipButton)

        undoButton.title = "Undo…"
        undoButton.bezelStyle = .rounded
        undoButton.target = self
        undoButton.action = #selector(showUndoPreview)
        titleView.addSubview(undoButton)

        field.nextKeyView = pauseResumeButton
        pauseResumeButton.nextKeyView = skipButton
        skipButton.nextKeyView = undoButton
        undoButton.nextKeyView = field

        undoTextView.isEditable = false
        undoTextView.isSelectable = true
        undoTextView.drawsBackground = false
        undoTextView.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        undoTextView.textContainerInset = NSSize(width: 8, height: 8)
        undoTextView.autoresizingMask = [.width]
        undoScrollView.documentView = undoTextView
        undoScrollView.hasVerticalScroller = true
        undoScrollView.drawsBackground = false
        undoScrollView.borderType = .noBorder
        undoView.addSubview(undoScrollView)

        cancelUndoButton.title = "Cancel"
        cancelUndoButton.bezelStyle = .rounded
        cancelUndoButton.target = self
        cancelUndoButton.action = #selector(cancelUndo)
        undoView.addSubview(cancelUndoButton)

        confirmUndoButton.title = "Confirm"
        confirmUndoButton.bezelStyle = .rounded
        confirmUndoButton.target = self
        confirmUndoButton.action = #selector(confirmUndo)
        undoView.addSubview(confirmUndoButton)

        cancelUndoButton.nextKeyView = confirmUndoButton
        confirmUndoButton.nextKeyView = cancelUndoButton

        panel.contentView?.addSubview(titleView)
        panel.contentView?.addSubview(undoView)
        undoView.isHidden = true
        panel.initialFirstResponder = field

        reminderPanel.isReleasedWhenClosed = false
        reminderPanel.level = .floating
        reminderPanel.hasShadow = true
        reminderPanel.isOpaque = false
        reminderPanel.backgroundColor = .clear
        reminderPanel.hidesOnDeactivate = false
        reminderPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        reminderPanel.contentView?.wantsLayer = true
        reminderPanel.contentView?.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        reminderPanel.contentView?.layer?.cornerRadius = 12
        reminderPanel.contentView?.layer?.masksToBounds = true

        reminderLabel.frame = NSRect(x: 28, y: 83, width: 404, height: 26)
        reminderLabel.font = .systemFont(ofSize: 19, weight: .semibold)
        reminderLabel.alignment = .center
        reminderLabel.lineBreakMode = .byTruncatingTail
        reminderPanel.contentView?.addSubview(reminderLabel)

        let resumeButton = NSButton(frame: NSRect(x: 155, y: 21, width: 150, height: 48))
        resumeButton.title = "Resume"
        resumeButton.bezelStyle = .rounded
        resumeButton.target = self
        resumeButton.action = #selector(resumeSession)
        reminderPanel.contentView?.addSubview(resumeButton)

        rememberExternalApplication(NSWorkspace.shared.frontmostApplication)
        installReminderHotKeyHandler()
        startReminderEventTap()
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.rememberExternalApplication(
                notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            )
        }
        refreshTitle()
        refreshFlowActions()
    }

    func applicationShouldHandleReopen(
        _ sender: NSApplication,
        hasVisibleWindows flag: Bool
    ) -> Bool {
        toggle()
        return false
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(where: { $0.scheme == "flowtitle" && $0.host == "remind" }) else {
            return
        }
        showPausedReminder()
    }

    private func rememberExternalApplication(_ application: NSRunningApplication?) {
        guard application?.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return }
        lastExternalApplication = application
    }

    private func toggle() {
        if panel.isVisible {
            hide()
        } else {
            previousApplication = lastExternalApplication
            field.stringValue = ""
            field.placeholderString = currentTitle
            refreshFlowActions()
            showTitleView()
            panel.center()
            NSApplication.shared.activate()
            panel.makeKeyAndOrderFront(nil)
            DispatchQueue.main.async { [weak self] in
                guard let self, self.panel.isVisible else { return }
                self.panel.makeFirstResponder(self.field)
            }
            refreshTitle()
        }
    }

    private func showTitleView() {
        panel.setContentSize(Self.titleSize)
        titleView.frame = NSRect(origin: .zero, size: Self.titleSize)
        titleView.isHidden = false
        undoView.isHidden = true
    }

    private func showUndoView() {
        panel.setContentSize(Self.undoSize)
        undoView.frame = NSRect(origin: .zero, size: Self.undoSize)
        titleView.isHidden = true
        undoView.isHidden = false
        panel.center()
    }

    private func refreshTitle() {
        flowAutomationQueue.async { [weak self] in
            guard let self,
                  let title = self.execute(self.flowTitleScript)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty else { return }

            DispatchQueue.main.async {
                self.currentTitle = title
                if self.field.stringValue.isEmpty {
                    self.field.placeholderString = title
                }
                if self.reminderPanel.isVisible {
                    self.reminderLabel.stringValue = "\(title) is paused"
                }
            }
        }
    }

    private func refreshFlowActions() {
        skipStateRequestID += 1
        let requestID = skipStateRequestID
        flowActivity = nil
        flowCanSkip = nil
        renderFlowActions()

        updateFlowActions(requestID: requestID)
    }

    private func renderFlowActions() {
        switch flowActivity {
        case .paused:
            pauseResumeButton.title = "Resume"
            pauseResumeButton.isEnabled = true
        case .running:
            pauseResumeButton.title = "Pause"
            pauseResumeButton.isEnabled = true
        case nil:
            pauseResumeButton.title = "Pause / Resume"
            pauseResumeButton.isEnabled = false
        }
        skipButton.isEnabled = flowCanSkip ?? false
    }

    private func updateFlowActions(requestID: Int) {
        flowAutomationQueue.async { [weak self] in
            guard let self,
                  let phase = self.execute(self.flowPhaseScript),
                  let initialTime = self.readFlowTime() else { return }
            guard let canSkip = self.flowStateReader.canSkip(
                phase: phase,
                remainingTime: initialTime
            ) else { return }
            guard canSkip else {
                DispatchQueue.main.async { [weak self] in
                    guard let self,
                          self.skipStateRequestID == requestID else { return }
                    self.flowActivity = .paused
                    self.flowCanSkip = false
                    if self.panel.isVisible { self.renderFlowActions() }
                }
                return
            }
            self.sampleFlowActivity(
                requestID: requestID,
                initialTime: initialTime,
                remainingSamples: 5
            )
        }
    }

    private func sampleFlowActivity(
        requestID: Int,
        initialTime: String,
        remainingSamples: Int
    ) {
        flowAutomationQueue.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self,
                  self.skipStateRequestID == requestID,
                  let currentTime = self.readFlowTime() else { return }
            if currentTime != initialTime || remainingSamples == 1 {
                let activity: FlowActivity = currentTime != initialTime ? .running : .paused
                DispatchQueue.main.async { [weak self] in
                    guard let self,
                          self.skipStateRequestID == requestID else { return }
                    self.flowActivity = activity
                    self.flowCanSkip = true
                    if self.panel.isVisible { self.renderFlowActions() }
                }
                return
            }
            self.sampleFlowActivity(
                requestID: requestID,
                initialTime: initialTime,
                remainingSamples: remainingSamples - 1
            )
        }
    }

    private func showPausedReminder() {
        flowActivity = .paused
        flowCanSkip = true
        reminderLabel.stringValue = "\(currentTitle) is paused"

        let mouseLocation = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouseLocation) } ?? NSScreen.main
        if let visibleFrame = screen?.visibleFrame {
            let frame = reminderPanel.frame
            reminderPanel.setFrameOrigin(NSPoint(
                x: visibleFrame.midX - frame.width / 2,
                y: visibleFrame.midY - frame.height / 2
            ))
        }

        reminderPanel.orderFrontRegardless()
        registerReminderHotKeys()
        startReminderMonitor()
        refreshTitle()
    }

    private func hidePausedReminder() {
        unregisterReminderHotKeys()
        reminderMonitor?.cancel()
        reminderMonitor = nil
        reminderPanel.orderOut(nil)
    }

    private func installReminderHotKeyHandler() {
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let event, let userData else { return noErr }
                let controller = Unmanaged<PromptController>
                    .fromOpaque(userData)
                    .takeUnretainedValue()
                var hotKeyID = EventHotKeyID()
                guard GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                ) == noErr else { return noErr }
                DispatchQueue.main.async {
                    guard controller.reminderPanel.isVisible else { return }
                    if hotKeyID.id == 1 {
                        controller.hidePausedReminder()
                    } else {
                        controller.resumeSession()
                    }
                }
                return noErr
            },
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            &reminderHotKeyHandler
        )
    }

    private func registerReminderHotKeys() {
        guard escapeHotKey == nil, returnHotKey == nil, keypadEnterHotKey == nil else {
            return
        }
        let signature: OSType = 0x464C4F57
        RegisterEventHotKey(
            UInt32(kVK_Escape),
            0,
            EventHotKeyID(signature: signature, id: 1),
            GetApplicationEventTarget(),
            0,
            &escapeHotKey
        )
        RegisterEventHotKey(
            UInt32(kVK_Return),
            0,
            EventHotKeyID(signature: signature, id: 2),
            GetApplicationEventTarget(),
            0,
            &returnHotKey
        )
        RegisterEventHotKey(
            UInt32(kVK_ANSI_KeypadEnter),
            0,
            EventHotKeyID(signature: signature, id: 3),
            GetApplicationEventTarget(),
            0,
            &keypadEnterHotKey
        )
    }

    private func unregisterReminderHotKeys() {
        if let escapeHotKey {
            UnregisterEventHotKey(escapeHotKey)
        }
        if let returnHotKey {
            UnregisterEventHotKey(returnHotKey)
        }
        if let keypadEnterHotKey {
            UnregisterEventHotKey(keypadEnterHotKey)
        }
        self.escapeHotKey = nil
        self.returnHotKey = nil
        self.keypadEnterHotKey = nil
    }

    private func startReminderEventTap() {
        stopReminderEventTap()
        let keyDownMask = CGEventMask(1) << CGEventType.keyDown.rawValue
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: keyDownMask,
            callback: { _, type, event, userData in
                guard type == .keyDown, let userData else { return Unmanaged.passUnretained(event) }
                let controller = Unmanaged<PromptController>
                    .fromOpaque(userData)
                    .takeUnretainedValue()
                let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
                let now = ProcessInfo.processInfo.systemUptime
                if keyCode == Int64(kVK_F18), event.flags.contains(.maskSecondaryFn) {
                    controller.superPrefixTime = now
                    return Unmanaged.passUnretained(event)
                }
                guard keyCode == Int64(kVK_Return),
                      let prefixTime = controller.superPrefixTime,
                      now - prefixTime < 0.25 else { return Unmanaged.passUnretained(event) }
                controller.superPrefixTime = nil
                DispatchQueue.main.async {
                    controller.skipStateRequestID += 1
                    controller.flowActivity = nil
                    controller.flowCanSkip = nil
                    if controller.panel.isVisible { controller.renderFlowActions() }
                    if controller.reminderPanel.isVisible { controller.hidePausedReminder() }
                    if controller.panel.isVisible {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            guard controller.panel.isVisible else { return }
                            controller.refreshFlowActions()
                        }
                    }
                }
                return Unmanaged.passUnretained(event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            return
        }
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        reminderEventTap = tap
        reminderEventTapSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func stopReminderEventTap() {
        if let source = reminderEventTapSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
        }
        if let tap = reminderEventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        reminderEventTapSource = nil
        reminderEventTap = nil
        superPrefixTime = nil
    }

    private func startReminderMonitor() {
        reminderMonitor?.cancel()
        var baseline: String?
        let monitor = DispatchSource.makeTimerSource(queue: flowAutomationQueue)
        monitor.schedule(deadline: .now(), repeating: .milliseconds(500))
        monitor.setEventHandler { [weak self] in
            guard let self, let remaining = self.readFlowTime() else { return }
            guard let initial = baseline else {
                baseline = remaining
                return
            }
            guard remaining != initial else { return }
            DispatchQueue.main.async { [weak self] in
                self?.flowActivity = .running
                self?.flowCanSkip = true
                self?.hidePausedReminder()
            }
        }
        reminderMonitor = monitor
        monitor.resume()
    }

    private func readFlowTime() -> String? {
        execute(flowTimeScript)
    }

    private func execute(_ script: NSAppleScript) -> String? {
        var error: NSDictionary?
        let result = script.executeAndReturnError(&error)
        guard error == nil else { return nil }
        return result.stringValue
    }

    @objc private func resumeSession() {
        hidePausedReminder()
        flowAutomationQueue.async { [weak self] in
            guard let self else { return }
            let succeeded = self.execute(self.flowStartScript) != nil
            DispatchQueue.main.async { [weak self] in
                self?.flowActivity = succeeded ? .running : nil
                self?.flowCanSkip = succeeded ? true : nil
            }
        }
    }

    @objc private func toggleSession() {
        guard let flowActivity else { return }
        let shouldStop = flowActivity == .running
        hide()
        flowAutomationQueue.async { [weak self] in
            guard let self else { return }
            let succeeded = self.execute(
                shouldStop ? self.flowStopScript : self.flowStartScript
            ) != nil
            DispatchQueue.main.async { [weak self] in
                self?.flowActivity = succeeded ? (shouldStop ? .paused : .running) : nil
                self?.flowCanSkip = succeeded ? true : nil
            }
        }
    }

    @objc private func skipSession() {
        hide()
        flowAutomationQueue.async { [weak self] in
            guard let self else { return }
            _ = self.execute(self.flowSkipScript)
            DispatchQueue.main.async { [weak self] in
                self?.flowActivity = nil
                self?.flowCanSkip = nil
            }
        }
    }

    @objc private func showUndoPreview() {
        undoRequestID += 1
        let requestID = undoRequestID
        undoTextView.string = "Loading…"
        cancelUndoButton.isEnabled = true
        confirmUndoButton.isEnabled = false
        showUndoView()
        panel.makeFirstResponder(cancelUndoButton)

        journalUndoRunner.preview { [weak self] result in
            guard let self,
                  self.undoRequestID == requestID,
                  self.panel.isVisible,
                  !self.undoView.isHidden else { return }
            switch result {
            case let .success(preview):
                guard let session = preview.session else {
                    self.undoTextView.string = "No focus session found to delete."
                    return
                }
                self.undoTextView.string = session.summary(
                    associatedBreakCount: preview.associatedBreakCount
                )
                self.confirmUndoButton.isEnabled = true
            case let .failure(error):
                self.undoTextView.string = error.localizedDescription
            }
            self.undoTextView.scrollToBeginningOfDocument(nil)
        }
    }

    @objc private func cancelUndo() {
        hide()
    }

    @objc private func confirmUndo() {
        undoRequestID += 1
        let requestID = undoRequestID
        cancelUndoButton.isEnabled = false
        confirmUndoButton.isEnabled = false
        undoTextView.string = "Undoing…"

        journalUndoRunner.confirm { [weak self] result in
            guard let self, self.undoRequestID == requestID else { return }
            if result.status == 0 {
                self.hide()
            } else {
                self.undoTextView.string = result.output
                self.undoTextView.scrollToBeginningOfDocument(nil)
                self.cancelUndoButton.isEnabled = true
                self.panel.makeFirstResponder(self.cancelUndoButton)
            }
        }
    }

    private func hide() {
        undoRequestID += 1
        skipStateRequestID += 1
        panel.orderOut(nil)
        NSApplication.shared.deactivate()
        let application = previousApplication
        previousApplication = nil
        DispatchQueue.main.async {
            application?.activate()
        }
    }

    @objc private func confirmTitle() {
        let title = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        hide()
        guard !title.isEmpty else { return }
        currentTitle = title

        DispatchQueue.global(qos: .userInitiated).async {
            let script = """
            on run argv
                tell application "Flow" to setTitle to item 1 of argv
            end run
            """
            let process = Process()
            let input = Pipe()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-", title]
            process.standardInput = input
            guard (try? process.run()) != nil else { return }
            input.fileHandleForWriting.write(Data(script.utf8))
            input.fileHandleForWriting.closeFile()
            process.waitUntilExit()
        }
    }

    func control(
        _ control: NSControl,
        textView: NSTextView,
        doCommandBy commandSelector: Selector
    ) -> Bool {
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            hide()
            return true
        }
        return false
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "--run" {
    exit(BundledPython.runAttached(arguments: Array(arguments.dropFirst())))
} else {
    let app = NSApplication.shared
    let controller = PromptController()
    app.setActivationPolicy(.accessory)
    app.delegate = controller
    app.run()
}
