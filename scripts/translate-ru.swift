// Перевод английских строк на русский встроенным переводчиком macOS (Translation.framework, на устройстве, без сети).
// Нужны macOS 26 и скачанные языки: Системные настройки → Основные → Язык и регион → Языки перевода → Английский и Русский.
//
// Вход (stdin): JSON [{"id": "...", "text": "..."}]. Выход (stdout): JSON [{"id": "...", "ru": "..."}] в том же порядке.
// Имена собственные вызывающий заменяет метками [1], [2] … до перевода и возвращает после — переводчик их не трогает.
// Код выхода 3 — языки не скачаны (статус в stderr).
// Запуск: swift scripts/translate-ru.swift < in.json > out.json
import Foundation
import Translation

struct Item: Codable { let id: String; let text: String }
struct Out: Codable { let id: String; let ru: String }

let en = Locale.Language(identifier: "en")
let ru = Locale.Language(identifier: "ru")
let status = await LanguageAvailability().status(from: en, to: ru)
guard status == .installed else {
    FileHandle.standardError.write("translate-ru: en→ru — \(status); скачать: Язык и регион → Языки перевода\n".data(using: .utf8)!)
    exit(3)
}
let items = try JSONDecoder().decode([Item].self, from: FileHandle.standardInput.readDataToEndOfFile())
let session = TranslationSession(installedSource: en, target: ru)
var out: [Out] = []
for start in stride(from: 0, to: items.count, by: 50) {
    let chunk = Array(items[start..<min(start + 50, items.count)])
    let rs = try await session.translations(from: chunk.map { TranslationSession.Request(sourceText: $0.text, clientIdentifier: $0.id) })
    let byId = Dictionary(rs.map { ($0.clientIdentifier ?? "", $0.targetText) }, uniquingKeysWith: { a, _ in a })
    out += chunk.map { Out(id: $0.id, ru: byId[$0.id] ?? "") }
}
FileHandle.standardOutput.write(try JSONEncoder().encode(out))
