import AppKit
import Foundation

/// 从新版应用图标提取 macOS 菜单栏所需的单色水獭 Template Image。
enum TrayState {
  case normal
  case attention
  case error
}

let desktopRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
let sourcePath = desktopRoot.appendingPathComponent("resources/icons/icon-mac.png").path
let trayDirectory = desktopRoot.appendingPathComponent("resources/tray")
let masterSize = 360

guard let source = NSImage(contentsOfFile: sourcePath) else {
  fatalError("无法读取新版应用图标：\(sourcePath)")
}

func ellipseContains(_ x: Int, _ y: Int, centerX: Double, centerY: Double, radiusX: Double, radiusY: Double) -> Bool {
  let dx = (Double(x) - centerX) / radiusX
  let dy = (Double(y) - centerY) / radiusY
  return dx * dx + dy * dy <= 1
}

func makeMaster(state: TrayState) -> NSBitmapImageRep {
  guard
    let sampled = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: masterSize,
      pixelsHigh: masterSize,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let sampledContext = NSGraphicsContext(bitmapImageRep: sampled),
    let output = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: masterSize,
      pixelsHigh: masterSize,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    )
  else {
    fatalError("无法创建托盘图标画布")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = sampledContext
  sampledContext.imageInterpolation = .high
  NSColor.clear.setFill()
  NSRect(x: 0, y: 0, width: masterSize, height: masterSize).fill()

  // 取新版应用图标中的倾斜头部，保留右下裁切构图，过滤掉围巾和大部分身体。
  source.draw(
    in: NSRect(x: 0, y: 25, width: 360, height: 310),
    from: NSRect(x: 150, y: 244, width: 820, height: 680),
    operation: .copy,
    fraction: 1
  )
  sampledContext.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let outputColor = output.bitmapData else {
    fatalError("无法读取托盘图标像素")
  }

  for y in 0..<masterSize {
    for x in 0..<masterSize {
      let offset = y * output.bytesPerRow + x * 4
      let color = sampled.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB)
      let sourceAlpha = color?.alphaComponent ?? 0
      let green = color?.greenComponent ?? 1
      let blue = color?.blueComponent ?? 1

      // 深墨色头部保留为黑色；青绿背景、米白口鼻和蓝色围巾转为透明。
      var markAlpha = max(0, min(1, min((0.65 - green) / 0.35, (0.72 - blue) / 0.35))) * sourceAlpha

      // 新版图标的耳朵内部是浅色，但菜单栏图标使用实心耳朵，避免出现透明孔洞。
      if
        ellipseContains(x, y, centerX: 45, centerY: 182, radiusX: 23, radiusY: 23) ||
        ellipseContains(x, y, centerX: 280, centerY: 105, radiusX: 22, radiusY: 22)
      {
        markAlpha = 1
      }

      // 清掉圆角背景边缘与右下身体残留，只保留水獭头部和必要的轮廓。
      if
        x < 12 || x > 345 || y < 10 || y > 330 ||
        (x > 290 && y > 240) ||
        (x > 270 && y > 290)
      {
        markAlpha = 0
      }

      outputColor[offset] = 0
      outputColor[offset + 1] = 0
      outputColor[offset + 2] = 0
      outputColor[offset + 3] = UInt8(max(0, min(255, markAlpha * 255)))
    }
  }

  NSGraphicsContext.saveGraphicsState()
  guard let context = NSGraphicsContext(bitmapImageRep: output) else {
    fatalError("无法绘制托盘状态标记")
  }
  NSGraphicsContext.current = context
  NSColor.black.setFill()

  switch state {
  case .normal:
    break
  case .attention:
    NSBezierPath(ovalIn: NSRect(x: 292, y: 292, width: 24, height: 24)).fill()
  case .error:
    let triangle = NSBezierPath()
    triangle.move(to: NSPoint(x: 304, y: 322))
    triangle.line(to: NSPoint(x: 318, y: 292))
    triangle.line(to: NSPoint(x: 290, y: 292))
    triangle.close()
    triangle.fill()
  }
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  return output
}

func writePNG(_ master: NSBitmapImageRep, size: Int, to path: URL) throws {
  let image = NSImage(size: NSSize(width: masterSize, height: masterSize))
  image.addRepresentation(master)

  guard
    let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: size,
      pixelsHigh: size,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let context = NSGraphicsContext(bitmapImageRep: bitmap)
  else {
    fatalError("无法缩放托盘图标")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  NSColor.clear.setFill()
  NSRect(x: 0, y: 0, width: size, height: size).fill()
  image.draw(
    in: NSRect(x: 0, y: 0, width: size, height: size),
    from: NSRect(x: 30, y: 30, width: 300, height: 300),
    operation: .copy,
    fraction: 1
  )
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("无法导出托盘图标：\(path.path)")
  }
  try data.write(to: path)
}

try FileManager.default.createDirectory(at: trayDirectory, withIntermediateDirectories: true)
for (state, name) in [(TrayState.normal, "trayTemplate"), (TrayState.attention, "trayAttentionTemplate"), (TrayState.error, "trayErrorTemplate")] {
  let master = makeMaster(state: state)
  try writePNG(master, size: 18, to: trayDirectory.appendingPathComponent("\(name).png"))
  try writePNG(master, size: 36, to: trayDirectory.appendingPathComponent("\(name)@2x.png"))
}
