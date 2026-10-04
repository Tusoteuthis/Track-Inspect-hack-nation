# Plan

Swift 6/iOS 17 existing service boundaries. Add SDK-free GlassesConnectionStatus with title/explanation/symbol; VideoService.connectionStatus() synchronously snapshots SDK registration and Device.linkState. Query the pinned session device if present, otherwise available devices. SDK registration alone never implies connectivity. Missing configuration/SDK errors report unavailable without an alert or exposing credentials. Simulator reports unavailable without configuring hardware.

Settings owns a scene-aware SwiftUI task, immediately refreshing then once per second while active, automatically cancelled on dismissal. This bounded property polling avoids retained listener/task graphs for a status only visible in Settings. The ViewModel combines the connection snapshot with a distinct last-actual-video-frame timestamp; startup/photo previews never count as streaming. Reset frame evidence on stop/start; require foreground, running video, connected link and frame age below watchdog timeout.

Build 5; regenerate with XcodeGen. Run full unit/UI suite, build/sign/install to existing phone. No credential changes. Constitution: all seven principles preserved; no capture, permissions request or cloud calls added by status polling (SDK configuration may initialize its Bluetooth facilities). Physical glasses transitions are not proven by simulator tests.
