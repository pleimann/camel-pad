// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "tray",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "tray",
            path: "Sources/tray",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit"),
            ]
        ),
    ]
)
