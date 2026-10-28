// Подписи на растровой карте через Apple Vision (macOS): для каждого PNG — строки текста с рамкой в пикселях картинки.
// Запуск: swift scripts/ocr-labels.swift a.png b.png … > out.jsonl — одна строка JSON на файл: {"file", "lines": [{t, c, x, y, w, h}]}.
// Языковая коррекция выключена: имена мира (Neverwinter, Thundertree) словарь «исправил» бы.
import Foundation
import Vision
import ImageIO

for path in CommandLine.arguments.dropFirst() {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("не читается: \(path)\n".data(using: .utf8)!)
    continue
  }
  let W = Double(img.width), H = Double(img.height)
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  req.recognitionLanguages = ["en-US"]
  req.minimumTextHeight = 0.004
  try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
  var lines: [[String: Any]] = []
  for r in req.results ?? [] {
    guard let c = r.topCandidates(1).first else { continue }
    let b = r.boundingBox
    // Рамки слов: в одной строке Vision часто склеивает две подписи («Castle Naerytar Holk House»).
    var words: [[String: Any]] = []
    let s = c.string
    s.enumerateSubstrings(in: s.startIndex..<s.endIndex, options: .byWords) { w, range, _, _ in
      guard let w = w, let wb = try? c.boundingBox(for: range)?.boundingBox else { return }
      words.append(["t": w, "x": wb.origin.x * W, "y": (1 - wb.origin.y - wb.size.height) * H, "w": wb.size.width * W, "h": wb.size.height * H])
    }
    lines.append([
      "t": s, "c": Double(c.confidence),
      "x": b.origin.x * W, "y": (1 - b.origin.y - b.size.height) * H, "w": b.size.width * W, "h": b.size.height * H,
      "words": words,
    ])
  }
  let data = try JSONSerialization.data(withJSONObject: ["file": path, "lines": lines])
  print(String(data: data, encoding: .utf8)!)
}
