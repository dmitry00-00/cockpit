// Текст PDF постранично через PDFKit (macOS): `swift scripts/pdf-text.swift <file.pdf>` → stdout, страницы — строкой
// «=== page N». Нужен импортёрам открытых SRD в PDF (A5E): pdftotext и Python-библиотек для PDF в системе нет.
import PDFKit

guard CommandLine.arguments.count > 1, let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else {
    FileHandle.standardError.write("нет PDF\n".data(using: .utf8)!)
    exit(1)
}
for i in 0..<doc.pageCount {
    print("=== page \(i + 1)")
    print(doc.page(at: i)?.string ?? "")
}
